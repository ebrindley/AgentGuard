import assert from "node:assert/strict"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { stage, layout, isolateHarness } from "./engines/zsh.mjs"

assert.equal(process.versions.node.split(".")[0], "24", "Node 24 is required")
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const run = realpathSync(mkdtempSync("/tmp/agentguard-authentication-"))
console.log(`Authentication fixture: ${run}`)
const home = join(run, "home"), tree = join(run, "source"), project = join(home, "Projects/app")
const engine = join(home, "Library/Application Support/AgentGuard")
for (const path of [tree, project, join(home, "Agent Guard"), join(home, ".local/bin"), join(home, ".aws"), join(home, ".azure"), join(home, ".codex"), join(home, ".claude")]) mkdirSync(path, { recursive: true })
stage(root, tree, home)
isolateHarness(tree)
const release = layout(tree, engine)
cpSync(join(tree, "engine/vendor"), join(release, "vendor"), { recursive: true })
// A real account home is outside the temporary grant. Preserve that relationship
// for this disposable home so write-denial assertions cannot pass accidentally.
const profilePath = join(release, "profile.sb")
writeFileSync(profilePath, readFileSync(profilePath, "utf8").replace('(subpath "/private/tmp")', `(require-all (subpath "/private/tmp") (require-not (subpath (param "HOME"))))`))
writeFileSync(join(home, "Agent Guard/Guard List.txt"), `ALLOW\n${project}\nREAD ONLY\nDENY\n`)
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"
const env = { HOME: home, SHELL: "/bin/zsh", PATH: "/usr/bin:/bin:/usr/sbin:/sbin", LANG: "en_US.UTF-8", TMPDIR: process.env.TMPDIR }
const launch = (mode, args = []) => spawnSync("/bin/zsh", [join(release, "launch"), mode, ...args], { cwd: project, env, encoding: "utf8", timeout: 20000 })
const selected = process.argv[2] ?? "all"

if (selected === "all" || selected === "storage") {
  const rendered = launch("profile")
  assert.equal(rendered.status, 0, rendered.stderr)
  const profile = join(run, "rendered.sb")
  writeFileSync(profile, rendered.stdout)
  const probe = join(run, "probe.mjs")
  writeFileSync(probe, `
    import assert from 'node:assert/strict';
    import {readFileSync, writeFileSync, renameSync} from 'node:fs';
    import {join} from 'node:path';
    import {createServer} from 'node:http';
    import {spawnSync} from 'node:child_process';
    const home = process.env.HOME;
    const file = join(home, '.local/share/opencode/fixture-token.json');
    if (process.argv[2] === 'reload') {
      assert.equal(JSON.parse(readFileSync(file)).token, 'refreshed-dummy-token');
      process.exit(0);
    }
    const denied = fn => assert.throws(fn, e => ['EPERM', 'EACCES'].includes(e.code));
    denied(() => readFileSync(join(home, '.aws/credentials')));
    for (const path of ['.azure/msal_token_cache.json', '.codex/auth.json', '.codex/auth.lock', '.claude/.credentials.json'])
      denied(() => writeFileSync(join(home, path), 'dummy'));
    const opened = spawnSync('/usr/bin/open', ['-h']);
    assert.ok(opened.error || opened.status !== 0);
    const server = createServer((req, res) => {
      writeFileSync(file, JSON.stringify({token:'initial-dummy-token'})); res.end('connected');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    assert.equal(await (await fetch('http://127.0.0.1:' + server.address().port + '/callback')).text(), 'connected');
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    writeFileSync(file + '.tmp', JSON.stringify({token:'refreshed-dummy-token'}));
    renameSync(file + '.tmp', file);
  `)
  writeFileSync(join(home, ".aws/credentials"), "dummy only")
  const params = ["-f", profile, "-D", `HOME=${home}`, "-D", `DARWIN_TEMP=${run}`, "-D", `DARWIN_CACHE=${run}`, "-D", "GUI=0"]
  // The Darwin roots must not accidentally re-grant the disposable home either.
  const outside = join(run, "temp")
  mkdirSync(outside)
  params[5] = `DARWIN_TEMP=${outside}`
  params[7] = `DARWIN_CACHE=${outside}`
  for (const mode of ["login", "reload"]) {
    const result = spawnSync("/usr/bin/sandbox-exec", [...params, process.execPath, probe, mode], { env, encoding: "utf8", timeout: 10000 })
    assert.equal(result.status, 0, result.stderr)
  }
  console.log("ok profile authentication: callback, atomic token save and reload; browser and named credential restrictions")
}

if (selected === "all" || selected === "environment") {
  const app = join(home, "Applications/OpenCode.app/Contents")
  for (const path of [join(app, "MacOS"), join(app, "Resources")]) mkdirSync(path, { recursive: true })
  writeFileSync(join(app, "Info.plist"), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>GuardAuthFixture</string></dict></plist>')
  const resultFile = join(project, "environment.json"), ready = join(home, ".local/state/opencode/fixture-ready")
  writeFileSync(join(app, "Resources/opencode-cli"), `#!/bin/zsh -f
    if [[ $1 == --version ]]; then print 2.2.5; exit; fi
    if [[ $1 == service ]]; then
      if [[ -f ${quote(ready)} ]]; then print http://127.0.0.1:12345; else print stopped; fi
      exit
    fi
    if [[ $1 == serve ]]; then
      ${quote(process.execPath)} -e ${quote(`require('fs').writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify({marker:process.env.PROVIDER_AUTH_FIXTURE, shell:process.env.INTERACTIVE_AUTH_FIXTURE, path:process.env.PATH, proxy:process.env.https_proxy, socket:process.env.SSH_AUTH_SOCK, npm:process.env.NPM_CONFIG_USERCONFIG, config:process.env.OPENCODE_CONFIG, context:process.env.AGENT_GUARD_CONTEXT}))`)}
      touch ${quote(ready)}
      exec /bin/sleep 15
    fi
    exit 1
  `, { mode: 0o755 })
  writeFileSync(join(app, "MacOS/GuardAuthFixture"), "#!/bin/sh\n/bin/sleep 0.2\n", { mode: 0o755 })
  writeFileSync(join(home, ".zprofile"), `export PROVIDER_AUTH_FIXTURE='dummy value with spaces'
    export PATH="$HOME/.local/bin:$PATH"
    export https_proxy=http://127.0.0.1:1234
    export SSH_AUTH_SOCK=must-not-survive
    export NPM_CONFIG_USERCONFIG=must-not-survive
    export OPENCODE_CONFIG=must-not-survive
    export AGENT_GUARD_CONTEXT=must-not-survive
    touch "$HOME/outside-grant" 2>/dev/null || true
  `)
  writeFileSync(join(home, ".zshrc"), 'export INTERACTIVE_AUTH_FIXTURE=present\n')
  const result = launch("gui")
  assert.equal(result.status, 0, result.stderr)
  const actual = JSON.parse(readFileSync(resultFile, "utf8"))
  assert.equal(actual.marker, "dummy value with spaces")
  assert.equal(actual.shell, "present")
  assert.ok(actual.path.includes(join(home, ".local/bin")))
  assert.ok(actual.path.startsWith(join(release, "peers") + ":"))
  assert.equal(actual.proxy, "http://127.0.0.1:1234")
  assert.equal(actual.socket, undefined)
  assert.equal(actual.npm, "/dev/null")
  assert.equal(actual.config, undefined)
  assert.ok(actual.context.startsWith(engine))
  assert.throws(() => readFileSync(join(home, "outside-grant")), { code: "ENOENT" })
  console.log("ok Desktop service: login-shell provider environment, confined startup and preserved Guard environment")
  unlinkSync(ready)
  writeFileSync(join(home, ".zshrc"), 'exec /bin/sleep 30\n')
  const started = performance.now()
  const timed = launch("gui")
  assert.equal(timed.status, 0, timed.stderr)
  assert.ok(performance.now() - started < 12000, "shell startup must not stall Desktop")
  assert.equal(JSON.parse(readFileSync(resultFile, "utf8")).marker, undefined)
  console.log("ok Desktop service: timed-out shell falls back to inherited environment")
}
