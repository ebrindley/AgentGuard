import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const run = mkdtempSync(join(root, "test/.run-opencode-config-"))
const original = JSON.stringify({ permission: { edit: "ask", bash: "ask", external_directory: "ask" }, model: "fixture" })
let checks = 0
function fixture(name) {
  const home = join(run, name), engine = join(home, "Library/Application Support/AgentGuard")
  const config = join(home, ".config/opencode/config.json")
  for (const p of [dirname(config), join(engine, "state"), join(home, "stage")]) mkdirSync(p, { recursive: true })
  return { home, engine, config }
}
function shell(f, body) {
  const result = spawnSync("/bin/zsh", ["-fc", `
    setopt no_unset
    source "$1/installer/lib.zsh"
    source "$1/installer/harness/opencode.zsh"
    home=$2 engine=$3
    state="$engine/state" record="$state/permissions.json" ag_tstage="$home/stage"
    typeset -a ag_configs ag_warnings ag_unrestored
    ag_configs=() ag_warnings=() ag_unrestored=()
    ag_h_opencode_init
    ag_jlast() { REPLY=; }
    ag_jnl() { :; }
    ag_backup() { :; }
    ${body}
  `, "config-test", root, f.home, f.engine], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  checks++
  return result
}

for (const name of ["engine", "checker", "activation", "wrapper", "binary", "directory", "dangling"]) {
  const f = fixture(name)
  const target = name === "engine" ? join(f.engine, "state/stamp.json")
    : name === "checker" ? join(f.home, ".cc-safety-net/policy.json")
    : name === "activation" ? join(f.home, ".zshrc")
    : name === "wrapper" ? join(f.home, ".local/bin/custom-pi")
    : name === "binary" ? join(f.home, ".opencode/bin/opencode")
    : join(f.home, "other", name)
  mkdirSync(dirname(target), { recursive: true })
  if (name === "directory") mkdirSync(target)
  else if (name !== "dangling") writeFileSync(target, original)
  if (name === "wrapper") writeFileSync(join(f.engine, "state/wrappers.json"), JSON.stringify({ wrappers: { "custom-pi": {} } }))
  symlinkSync(target, f.config)
  shell(f, `
    ag_opencode_config_writable "$conf/config.json" && exit 1
    ag_classify_configs
    for item in $ag_configs; do [[ $item != "$conf/config.json" ]] || exit 2; done
    ag_configs=("$conf/config.json")
    do_permissions || exit 3
    ag_perm_restore "$conf/config.json" '{}' "$home/stage/restore" && exit 4
    exit 0
  `)
  if (name !== "directory" && name !== "dangling") assert.equal(readFileSync(target, "utf8"), original)
}

const f = fixture("dotfiles"), target = join(f.home, "dotfiles/opencode.json")
mkdirSync(dirname(target))
writeFileSync(target, original)
symlinkSync(target, f.config)
shell(f, `ag_classify_configs; do_permissions`)
let config = JSON.parse(readFileSync(target, "utf8"))
assert.equal(config.permission.edit, "allow")
assert.equal(config.model, "fixture")
config.permission.bash = "deny"
writeFileSync(target, JSON.stringify(config))
shell(f, `ag_h_opencode_uninstall_restore "$ag_tstage"`)
config = JSON.parse(readFileSync(target, "utf8"))
assert.deepEqual(config.permission, { edit: "ask", bash: "deny", external_directory: "ask" })

const changed = fixture("changed-link")
writeFileSync(changed.config, original)
shell(changed, `ag_classify_configs; do_permissions`)
// A later config link must not redirect uninstall's recorded restoration.
const protectedFile = join(changed.engine, "state/target.json")
writeFileSync(protectedFile, readFileSync(changed.config))
shell(changed, `/bin/mv "$conf/config.json" "$home/old-config.json"
  /bin/ln -s "$engine/state/target.json" "$conf/config.json"
  ag_h_opencode_uninstall_restore "$ag_tstage"
  (( $#ag_unrestored == 1 ))`)
assert.equal(JSON.parse(readFileSync(protectedFile, "utf8")).permission.edit, "allow")
shell(changed, `ag_configs=("$conf/config.json")
  undo_permissions
  (( $#ag_unrestored == 0 )) || exit 1
  ag_jlast() { REPLY=done; }
  undo_permissions
  (( $#ag_unrestored == 1 ))`)
assert.equal(JSON.parse(readFileSync(protectedFile, "utf8")).permission.edit, "allow")
console.log(`ok OpenCode maintenance: ${checks} cases; ${run}`)
