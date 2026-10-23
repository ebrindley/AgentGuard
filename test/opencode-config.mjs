import assert from "node:assert/strict"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn, spawnSync } from "node:child_process"

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
function shell(f, body, journal = false) {
  const result = spawnSync("/bin/zsh", ["-fc", `
    setopt no_unset extended_glob
    source "$1/installer/lib.zsh"
    source "$1/installer/harness/opencode.zsh"
    home=$2 engine=$3
    state="$engine/state" record="$state/permissions.json" ag_tstage="$home/stage" txn_dir="$state/txn"
    ag_restore_edit_permissions=0
    typeset -a ag_configs ag_warnings ag_unrestored
    ag_configs=() ag_warnings=() ag_unrestored=()
    ag_h_opencode_init
    ${journal ? '/bin/mkdir -p "$txn_dir/backup"; touch "$txn_dir/journal"' : `
      ag_jlast() { REPLY=; }
      ag_jnl() { :; }
      ag_backup() { :; }
    `}
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
assert.equal(config.permission.edit, "ask")
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
assert.equal(JSON.parse(readFileSync(protectedFile, "utf8")).permission.bash, "allow")
shell(changed, `ag_configs=("$conf/config.json")
  undo_permissions
  (( $#ag_unrestored == 0 )) || exit 1
  ag_jlast() { REPLY=done; }
  undo_permissions
  (( $#ag_unrestored == 1 ))`)
assert.equal(JSON.parse(readFileSync(protectedFile, "utf8")).permission.bash, "allow")

for (const [name, permission, expected] of [
  ["scalar-deny", "deny", "deny"],
  ["scalar-ask", "ask", "ask"],
  ["scalar-allow", "allow", "allow"],
  ["array-permissions", ["deny"], ["deny"]],
  ["catchall-deny", { "*": "deny" }, { "*": "deny" }],
  ["specific-deny", { bash: "deny", external_directory: "deny" }, { bash: "deny", external_directory: "deny" }],
  ["pattern-deny", { bash: { "rm *": "deny", "*": "ask" } }, { bash: { "rm *": "deny", "*": "ask" }, external_directory: "allow" }],
  ["pattern-order", { bash: { "*": "ask", "ls *": "allow" } }, { bash: { "*": "allow", "ls *": "allow" }, external_directory: "allow" }],
  ["pattern-specific", { bash: { "ls *": "ask" } }, { bash: { "ls *": "ask" }, external_directory: "allow" }],
  ["fresh", {}, { bash: "allow", external_directory: "allow" }],
]) {
  const p = fixture(name)
  writeFileSync(p.config, JSON.stringify({ permission }))
  shell(p, 'ag_classify_configs; do_permissions')
  assert.deepEqual(JSON.parse(readFileSync(p.config)).permission, expected)
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(p.config)).permission.bash ?? {}), Object.keys(expected.bash ?? {}))
}

function legacy(name, orig, current = "allow") {
  const f = fixture(name)
  writeFileSync(f.config, JSON.stringify({ permission: { edit: current, bash: "allow", external_directory: "allow" }, model: "fixture" }))
  f.record = join(f.engine, "state/permissions.json")
  f.ledger = { [f.config]: { edit: { orig, wrote: "allow" }, bash: { orig: "ask", wrote: "allow" } } }
  writeFileSync(f.record, JSON.stringify(f.ledger))
  return f
}

function pending(f, expected) {
  shell(f, `
    ag_harness_modules=() ag_migration_modules=()
    ag_stamp_harnesses() { reply=(); }
    ag_detect() { :; }
    ag_pending
    [[ $? == ${expected ? 0 : 1} ]]
  `, true)
}
for (const [name, orig, current, expected] of [
  ["pending-retirable", null, "allow", true],
  ["pending-deferred", "ask", "allow", false],
  ["pending-pattern-deferred", { "*": "deny", "plan/*": "ask" }, "allow", false],
  ["pending-user-change", "ask", "deny", true],
]) {
  const f = legacy(name, orig, current)
  const before = readFileSync(f.record, "utf8")
  pending(f, expected)
  assert.equal(readFileSync(f.record, "utf8"), before)
}
const pendingInvalid = legacy("pending-invalid", null)
writeFileSync(pendingInvalid.config, "{ commented or malformed")
pending(pendingInvalid, false)
const pendingProtected = legacy("pending-protected", null)
shell(pendingProtected, '/bin/mv "$conf/config.json" "$engine/state/protected-config.json"; /bin/ln -s "$engine/state/protected-config.json" "$conf/config.json"', true)
pending(pendingProtected, false)

for (const orig of [null, "deny", "allow"]) {
  const f = legacy(`retire-${orig}`, orig)
  const originalBytes = readFileSync(f.config, "utf8")
  shell(f, 'do_retire_edit', true)
  assert.equal(JSON.parse(readFileSync(f.config)).permission.edit ?? null, orig)
  assert.deepEqual(JSON.parse(readFileSync(f.record)), { [f.config]: { bash: f.ledger[f.config].bash } })
  shell(f, 'undo_retire_edit', true)
  assert.equal(JSON.parse(readFileSync(f.config)).permission.edit, "allow")
  assert.equal(readFileSync(f.config, "utf8"), originalBytes)
  assert.deepEqual(JSON.parse(readFileSync(f.record)), f.ledger)
}
for (const orig of ["ask", { "*": "deny", "plan/*": "ask" }]) {
  const f = legacy(`defer-${typeof orig}`, orig)
  const output = shell(f, 'do_retire_edit; print -l -- $ag_warnings', true).stdout
  assert.match(output, /approval-prompts-would-return/)
  assert.equal(JSON.parse(readFileSync(f.config)).permission.edit, "allow")
  assert.deepEqual(JSON.parse(readFileSync(f.record)), f.ledger)
}
const explicit = legacy("explicit-ask", "ask")
shell(explicit, 'ag_restore_edit_permissions=1; do_retire_edit', true)
assert.equal(JSON.parse(readFileSync(explicit.config)).permission.edit, "ask")
shell(explicit, 'ag_h_opencode_uninstall_restore "$ag_tstage"', true)
assert.deepEqual(JSON.parse(readFileSync(explicit.config)).permission, { edit: "ask", bash: "ask", external_directory: "allow" })

const userChanged = legacy("user-edit", null, "deny")
shell(userChanged, 'do_retire_edit; undo_retire_edit', true)
assert.equal(JSON.parse(readFileSync(userChanged.config)).permission.edit, "deny")
assert.deepEqual(JSON.parse(readFileSync(userChanged.record)), userChanged.ledger)

for (const point of ["edit-restored", "edit-retired"]) {
  const f = legacy(`resume-${point}`, null)
  const originalBytes = readFileSync(f.config, "utf8")
  shell(f, `test_point() { [[ $1 != ${point} ]]; }; do_retire_edit && exit 1; exit 0`, true)
  assert.equal(JSON.parse(readFileSync(f.config)).permission.edit, undefined)
  shell(f, 'do_retire_edit', true)
  assert.equal(JSON.parse(readFileSync(f.config)).permission.edit, undefined)
  assert.deepEqual(JSON.parse(readFileSync(f.record)), { [f.config]: { bash: f.ledger[f.config].bash } })
  shell(f, 'undo_retire_edit', true)
  assert.equal(JSON.parse(readFileSync(f.config)).permission.edit, "allow")
  assert.equal(readFileSync(f.config, "utf8"), originalBytes)
  assert.deepEqual(JSON.parse(readFileSync(f.record)), f.ledger)
}
const rollbackEdit = legacy("rollback-user-edit", null)
shell(rollbackEdit, 'do_retire_edit', true)
writeFileSync(rollbackEdit.config, JSON.stringify({ permission: { edit: "deny", bash: "allow" } }))
const userBytes = readFileSync(rollbackEdit.config, "utf8")
shell(rollbackEdit, 'undo_retire_edit', true)
assert.equal(JSON.parse(readFileSync(rollbackEdit.config)).permission.edit, "deny")
assert.equal(readFileSync(rollbackEdit.config, "utf8"), userBytes)

const unrelatedEdit = legacy("rollback-unrelated-edit", null)
shell(unrelatedEdit, 'do_retire_edit', true)
const unrelatedConfig = JSON.parse(readFileSync(unrelatedEdit.config))
unrelatedConfig.theme = "user-change"
writeFileSync(unrelatedEdit.config, JSON.stringify(unrelatedConfig))
shell(unrelatedEdit, 'undo_retire_edit', true)
assert.deepEqual(JSON.parse(readFileSync(unrelatedEdit.config)), {
  ...unrelatedConfig, permission: { ...unrelatedConfig.permission, edit: "allow" },
})

const unwrittenEdit = legacy("rollback-before-edit-write", null)
const unwrittenBytes = readFileSync(unwrittenEdit.config, "utf8")
shell(unwrittenEdit, 'ag_perm_restore() { return 1; }; do_retire_edit && exit 1; exit 0', true)
shell(unwrittenEdit, 'undo_retire_edit', true)
assert.equal(readFileSync(unwrittenEdit.config, "utf8"), unwrittenBytes)
assert.deepEqual(JSON.parse(readFileSync(unwrittenEdit.record)), unwrittenEdit.ledger)

const preference = fixture("approval-preference")
const preferenceFile = join(preference.engine, "state/opencode-preferences.json")
shell(preference, 'ag_approval_preference=auto; do_opencode_preference', true)
assert.deepEqual(JSON.parse(readFileSync(preferenceFile)), { schemaVersion: 1, approvalPreference: "auto" })
shell(preference, 'ag_approval_preference=; do_opencode_preference', true)
assert.equal(JSON.parse(readFileSync(preferenceFile)).approvalPreference, "auto")
writeFileSync(preferenceFile, JSON.stringify({ schemaVersion: 1, approvalPreference: "host" }))
shell(preference, 'ag_approval_preference=auto; undo_opencode_preference', true)
assert.equal(JSON.parse(readFileSync(preferenceFile)).approvalPreference, "host")
const preferenceRollback = fixture("preference-rollback")
const preferenceRollbackFile = join(preferenceRollback.engine, "state/opencode-preferences.json")
shell(preferenceRollback, 'ag_approval_preference=auto; do_opencode_preference; undo_opencode_preference', true)
assert.equal(existsSync(preferenceRollbackFile), false)
const preferenceExisting = fixture("preference-existing")
const preferenceExistingFile = join(preferenceExisting.engine, "state/opencode-preferences.json")
const oldPreference = JSON.stringify({ schemaVersion: 1, approvalPreference: "host" })
writeFileSync(preferenceExistingFile, oldPreference)
shell(preferenceExisting, 'ag_approval_preference=auto; do_opencode_preference; undo_opencode_preference', true)
assert.equal(readFileSync(preferenceExistingFile, "utf8"), oldPreference)
// OpenCode 2's shared service opt-out. The fake password must never reach output.
const password = "fake-service-password-0123"
function service(name, contents) {
  const f = fixture(name)
  f.service = join(f.home, ".config/opencode/service.json")
  f.record = join(f.engine, "state/permissions.json")
  if (contents !== undefined) writeFileSync(f.service, typeof contents === "string" ? contents : JSON.stringify(contents), { mode: 0o600 })
  return f
}
function serviceRun(f, body, fresh = true) {
  const result = shell(f, `${fresh ? ': > "$txn_dir/journal"' : ""}
    ${body}
    print -l -- $ag_warnings $ag_unrestored`, true)
  const journal = readFileSync(join(f.engine, "state/txn/journal"), "utf8")
  for (const text of [result.stdout, result.stderr, journal]) assert.ok(!text.includes(password), text)
  return result.stdout
}
const serviceRecord = f => existsSync(f.record) ? JSON.parse(readFileSync(f.record))[f.service] : undefined
const mode = file => statSync(file).mode & 0o777
const owned = { disabled: { orig: null, wrote: true } }

const serviceAbsent = service("service-absent", { password, port: 4096, env: { A: "1" } })
assert.match(serviceRun(serviceAbsent, "do_opencode_service"), /automatic start turned off/)
assert.deepEqual(JSON.parse(readFileSync(serviceAbsent.service)), { password, port: 4096, env: { A: "1" }, disabled: true })
assert.equal(mode(serviceAbsent.service), 0o600)
assert.deepEqual(serviceRecord(serviceAbsent), owned)
const written = readFileSync(serviceAbsent.service, "utf8")
assert.doesNotMatch(serviceRun(serviceAbsent, "do_opencode_service"), /OpenCode shared service/)
assert.equal(readFileSync(serviceAbsent.service, "utf8"), written)
writeFileSync(serviceAbsent.service, JSON.stringify({ password, port: 4096 }))
serviceRun(serviceAbsent, "do_opencode_service")
assert.deepEqual(JSON.parse(readFileSync(serviceAbsent.service)), { password, port: 4096 })
assert.deepEqual(serviceRecord(serviceAbsent), owned)

for (const value of [true, false]) {
  const f = service(`service-${value}`, { password, disabled: value })
  const before = readFileSync(f.service, "utf8")
  assert.match(serviceRun(f, "do_opencode_service"), /left as you set it/)
  assert.equal(readFileSync(f.service, "utf8"), before)
  assert.deepEqual(serviceRecord(f), { disabled: { orig: value } })
  serviceRun(f, 'ag_h_opencode_uninstall_restore "$ag_tstage"')
  assert.equal(readFileSync(f.service, "utf8"), before)
  assert.equal(serviceRecord(f), undefined)
}

const serviceMissing = service("service-missing")
serviceRun(serviceMissing, "do_opencode_service")
assert.deepEqual(JSON.parse(readFileSync(serviceMissing.service)), { disabled: true })
assert.equal(mode(serviceMissing.service), 0o600)
assert.deepEqual(serviceRecord(serviceMissing), owned)
serviceRun(serviceMissing, "undo_opencode_service", false)
assert.equal(existsSync(serviceMissing.service), false)
assert.equal(serviceRecord(serviceMissing), undefined)

const serviceInvalid = service("service-invalid", `{ "password": "${password}", broken`)
assert.match(serviceRun(serviceInvalid, "do_opencode_service"), /service.json not changed \(unreadable or invalid JSON\)/)
assert.equal(readFileSync(serviceInvalid.service, "utf8"), `{ "password": "${password}", broken`)
assert.equal(serviceRecord(serviceInvalid), undefined)

// Interrupted after the record write: a resumed run writes, a rollback leaves
// the file as it was and drops the entry; a rollback after the write removes
// only the written key.
const serviceResume = service("service-resume", { password, port: 4096 })
const serviceBytes = readFileSync(serviceResume.service, "utf8")
serviceRun(serviceResume, "test_point() { [[ $1 != opencode-service ]]; }; do_opencode_service && exit 1; exit 0")
assert.equal(readFileSync(serviceResume.service, "utf8"), serviceBytes)
assert.deepEqual(serviceRecord(serviceResume), owned)
serviceRun(serviceResume, "do_opencode_service", false)
assert.equal(JSON.parse(readFileSync(serviceResume.service)).disabled, true)
serviceRun(serviceResume, "undo_opencode_service", false)
assert.deepEqual(JSON.parse(readFileSync(serviceResume.service)), { password, port: 4096 })
assert.equal(mode(serviceResume.service), 0o600)
assert.equal(serviceRecord(serviceResume), undefined)
const serviceRollback = service("service-rollback", { password })
serviceRun(serviceRollback, "test_point() { [[ $1 != opencode-service ]]; }; do_opencode_service && exit 1; undo_opencode_service")
assert.deepEqual(JSON.parse(readFileSync(serviceRollback.service)), { password })
assert.equal(serviceRecord(serviceRollback), undefined)

// Uninstall restores only the value it wrote.
const serviceUninstall = service("service-uninstall", { password, hostname: "127.0.0.1" })
serviceRun(serviceUninstall, "do_opencode_service")
serviceRun(serviceUninstall, 'ag_h_opencode_uninstall_restore "$ag_tstage"')
assert.deepEqual(JSON.parse(readFileSync(serviceUninstall.service)), { password, hostname: "127.0.0.1" })
assert.equal(mode(serviceUninstall.service), 0o600)
assert.equal(serviceRecord(serviceUninstall), undefined)
const serviceChanged = service("service-changed", { password })
serviceRun(serviceChanged, "do_opencode_service")
writeFileSync(serviceChanged.service, JSON.stringify({ password, disabled: false }))
serviceRun(serviceChanged, 'ag_h_opencode_uninstall_restore "$ag_tstage"')
assert.deepEqual(JSON.parse(readFileSync(serviceChanged.service)), { password, disabled: false })
assert.equal(serviceRecord(serviceChanged), undefined)

const assembled = fixture("assembled-runtime")
const tree = join(assembled.home, "tree")
mkdirSync(tree)
for (const name of ["engine", "profiles", "installer", "LICENSE", "install.sh"]) cpSync(join(root, name), join(tree, name), { recursive: true })
writeFileSync(join(tree, "VERSION"), "1.0.0\n")
shell(assembled, 'ag_tree="$home/tree" ag_stage="$home/stage" ag_version=1.0.0 ag_commit=fixture ag_rid_new=1.0.0-fixture; ag_harnesses=(opencode); ag_assemble')
for (const name of ["runtime.zsh", "v2.js"]) assert.equal(readFileSync(join(assembled.engine, "releases/1.0.0-fixture/profiles/opencode", name), "utf8"), readFileSync(join(root, "profiles/opencode", name), "utf8"))

// Recovery stops the server of a check whose shell is gone, including one an
// earlier release recorded in .serve.pid, but not the server of a running check.
const recovery = fixture("check-recovery")
const node = "'" + process.execPath.replaceAll("'", "'\\''") + "'"
shell(recovery, `
  spawn() { REPLY=$("$@" >/dev/null 2>&1 & print $!) }
  started() { REPLY=$(/bin/ps -o lstart= -p $1) && REPLY=\${(j: :)\${=REPLY}} }
  gone() { local i; for i in {1..30}; do kill -0 $1 2>/dev/null || return 0; sleep 0.1; done; return 1 }
  spawn /bin/sleep 300; orphan=$REPLY; started $orphan; orphan_start=$REPLY
  spawn /bin/sleep 300; live=$REPLY; started $live; live_start=$REPLY
  spawn ${node} -e 'setTimeout(() => {}, 300000)' serve --print-logs --log-level ERROR --hostname 127.0.0.1 --port 1; legacy=$REPLY
  spawn /usr/bin/true; dead=$REPLY; gone $dead
  ${node} -e 'setTimeout(() => {}, 300000)' serve --print-logs --log-level ERROR --hostname 127.0.0.1 --port 1 >/dev/null 2>&1 &
  owned=$!
  print -r -- $owned > "$state/.serve.pid"
  ag_recover test
  kill -0 $owned && [[ -e $state/.serve.pid ]] || { print 'recovery stopped a running check recorded in .serve.pid'; exit 1 }
  kill $owned
  started $$; print -rl -- $live "$live_start" "$REPLY" > "$state/.serve.$$.pid"
  print -rl -- $orphan "$orphan_start" "Thu Jan  1 00:00:00 1970" > "$state/.serve.$dead.pid"
  print -r -- $legacy > "$state/.serve.pid"
  touch "$state/.serve.$$" "$state/.serve.$dead" "$state/.events.$dead"
  ag_recover test
  gone $orphan || { print 'abandoned check server still running'; exit 1 }
  gone $legacy || { print 'server recorded in .serve.pid still running'; exit 1 }
  kill -0 $live || { print 'running check lost its server'; exit 1 }
  kill $live
  [[ -e $state/.serve.$$.pid && -e $state/.serve.$$ ]] || { print 'running check lost its files'; exit 1 }
  [[ ! -e $state/.serve.pid && ! -e $state/.serve.$dead.pid && ! -e $state/.serve.$dead && ! -e $state/.events.$dead ]] ||
    { print 'abandoned check files remain'; exit 1 }
`)

// An interrupted check stops its server and removes its files.
const interrupted = fixture("check-interrupt")
const stub = join(interrupted.home, "sandbox"), quiet = join(interrupted.home, "opencode")
writeFileSync(stub, '#!/bin/sh\nshift 2\nexec "$@"\n', { mode: 0o755 })
writeFileSync(quiet, "#!/bin/sh\nexec /bin/sleep 300\n", { mode: 0o755 })
const check = spawn("/bin/zsh", ["-fc", `
  emulate -L zsh
  setopt err_exit no_unset pipe_fail extended_glob
  source "$1/profiles/opencode/hooks.zsh"
  engine=$2 session=$3 release=$3 label= staged=1 ok=1 scope=() sandbox=("$4")
  opencode_check_v2 "$5"
`, "check-test", root, interrupted.engine, join(interrupted.home, "session"), stub, quiet], { stdio: "ignore" })
const exited = new Promise(resolve => check.on("exit", code => resolve(code)))
const checkRecord = join(interrupted.engine, `state/.serve.${check.pid}.pid`)
for (let i = 0; i < 100 && !existsSync(checkRecord); i++) await new Promise(resolve => setTimeout(resolve, 100))
const server = Number(readFileSync(checkRecord, "utf8").split("\n")[0])
check.kill("SIGTERM")
assert.equal(await exited, 143)
assert.throws(() => process.kill(server, 0), { code: "ESRCH" })
assert.ok(!existsSync(checkRecord) && !existsSync(join(interrupted.engine, `state/.serve.${check.pid}`)))
checks++
console.log(`ok OpenCode maintenance: ${checks} cases; ${run}`)
