import assert from "node:assert/strict"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { stage, layout, isolateHarness } from "./engines/zsh.mjs"

assert.equal(process.versions.node.split(".")[0], "24")
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const run = realpathSync(mkdtempSync("/tmp/agentguard-aws-auth-"))
console.log(`AWS authentication fixture: ${run}`)
for (const mode of ["default", "allow", "readonly", "deny", "linked-cache", "linked-config"]) {
  const home = join(run, mode, "home"), tree = join(run, mode, "source"), project = join(home, "Projects/app")
  for (const path of [tree, project, join(home, "Agent Guard"), join(home, ".aws")]) mkdirSync(path, { recursive: true })
  stage(root, tree, home)
  isolateHarness(tree)
  const release = layout(tree, join(home, "Library/Application Support/AgentGuard"))
  cpSync(join(tree, "engine/vendor"), join(release, "vendor"), { recursive: true })
  const profilePath = join(release, "profile.sb")
  writeFileSync(profilePath, readFileSync(profilePath, "utf8").replace('(subpath "/private/tmp")', '(require-all (subpath "/private/tmp") (require-not (subpath (param "HOME"))))'))
  writeFileSync(join(home, "Agent Guard/Guard List.txt"), `ALLOW\n${project}\nREAD ONLY\n${mode === "readonly" ? home + "/.aws" : ""}\nDENY\n${mode === "deny" ? home + "/.aws" : ""}\n`)
  writeFileSync(join(home, ".aws/config"), "[profile fixture]\nregion=us-east-1\n")
  writeFileSync(join(home, ".aws/credentials"), "dummy credential")
  if (mode === "linked-config") {
    renameSync(join(home, ".aws/config"), join(project, "aws-config"))
    symlinkSync(join(project, "aws-config"), join(home, ".aws/config"))
  }
  if (mode === "linked-cache") {
    mkdirSync(join(home, ".aws/sso"))
    symlinkSync(project, join(home, ".aws/sso/cache"))
  }
  const env = { HOME: home, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", AGENT_GUARD_AWS_AUTH: mode === "default" ? "" : "allow" }
  const rendered = spawnSync("/bin/zsh", [join(release, "launch"), "profile"], { cwd: project, env, encoding: "utf8" })
  if (mode === "linked-cache") {
    assert.notEqual(rendered.status, 0)
    assert.match(rendered.stderr, /cache must not contain symlinks/)
    console.log("ok AWS: redirected cache refused")
    continue
  }
  assert.equal(rendered.status, 0, rendered.stderr)
  const profile = join(run, mode, "profile.sb")
  writeFileSync(profile, rendered.stdout)
  const script = `
    const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
    const home = process.env.HOME, mode = ${JSON.stringify(mode)};
    const denied = fn => assert.throws(fn, e => ['EPERM','EACCES'].includes(e.code));
    const read = () => fs.readFileSync(path.join(home,'.aws/credentials'),'utf8');
    if (['default','deny'].includes(mode)) denied(read); else assert.equal(read(),'dummy credential');
    for (const name of ['config','credentials']) denied(() => fs.writeFileSync(path.join(home,'.aws',name),'changed'));
    if (mode === 'linked-config') denied(() => fs.writeFileSync(path.join(home,'Projects/app/aws-config'),'changed'));
    if (mode !== 'default') for (const suffix of ['sso/cache','login/cache','cli/cache']) {
      const cache = path.join(home,'.aws',suffix), token = path.join(cache,'fixture.json');
      const save = () => { fs.writeFileSync(token+'.tmp','new token'); fs.renameSync(token+'.tmp',token); };
      if (['allow','linked-config'].includes(mode)) { save(); assert.equal(fs.readFileSync(token,'utf8'),'new token'); }
      else denied(save);
      denied(() => fs.renameSync(cache,path.join(home,'Projects/app',suffix.replace('/','-')+'-moved')));
      denied(() => fs.writeFileSync(path.join(cache,'..','config'),'changed'));
    }
  `
  const result = spawnSync("/usr/bin/sandbox-exec", ["-f", profile, "-D", `HOME=${home}`, "-D", `DARWIN_TEMP=${run}/temp`, "-D", `DARWIN_CACHE=${run}/temp`, "-D", "GUI=0", process.execPath, "-e", script], { cwd: project, env, encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr)
  console.log(`ok AWS ${mode}: credential reads, atomic cache writes and configuration protection`)
}
