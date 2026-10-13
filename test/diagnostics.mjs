// Shallow read-only CLI fixtures; run with node test/diagnostics.mjs [SOURCE].
// Fixture artifacts are retained so privacy and consistency failures can be inspected.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, lstatSync, readlinkSync, symlinkSync, writeFileSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const source = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."))
const run = realpathSync(mkdtempSync(join(tmpdir(), "agentguard-diagnostics-")))
const marker = "PRIVATE_PAYLOAD_TOKEN_123"
const rid = "0.3.0-20261012T120000Z"
let failures = 0
const put = (path, data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data) }
const json = (path, value) => put(path, JSON.stringify(value))
const sha = value => createHash("sha256").update(value).digest("hex")
function tree(path) {
  const result = {}
  function visit(current) {
    const stat = lstatSync(current)
    if (stat.isSymbolicLink()) result[current] = `link:${readlinkSync(current)}`
    else if (stat.isDirectory()) for (const name of readdirSync(current).sort()) visit(join(current, name))
    else result[current] = sha(readFileSync(current))
  }
  visit(path)
  return result
}
function fixture(name) {
  const home = join(run, name, marker)
  const engine = join(home, "Library/Application Support/AgentGuard")
  const release = join(engine, "releases", rid)
  const stamp = join(engine, "state/stamp.json")
  const record = join(engine, "state/permissions.json")
  const config = join(home, ".config/opencode/opencode.json")
  const events = join(home, ".cc-safety-net/logs/agent-guard-events.json")
  mkdirSync(join(release, "bin"), { recursive: true })
  mkdirSync(join(release, "profiles/opencode"), { recursive: true })
  copyFileSync(join(source, "engine/agent-guard"), join(release, "bin/agent-guard"))
  copyFileSync(join(source, "profiles/opencode/diagnostics.zsh"), join(release, "profiles/opencode/diagnostics.zsh"))
  put(join(release, "RELEASE"), rid)
  put(join(release, "VERSION"), "0.3.0")
  // Isolated fixture account resolution, never account database or HOME changes.
  put(join(release, "account.zsh"), `account_home() { REPLY='${home}'; }\n`)
  symlinkSync(`releases/${rid}`, join(engine, "current"))
  symlinkSync("current/bin", join(engine, "bin"))
  json(config, { permission: { edit: "allow", bash: "allow", external_directory: "allow" }, provider: { token: marker } })
  json(join(home, ".config/opencode/config.json"), "allow")
  put(join(home, ".config/opencode/opencode.jsonc"), `// ${marker}\n{"url":"https://example.invalid/${marker}", "agent":{}} /* comment */\n`)
  json(record, { [config]: { edit: { orig: "ask", wrote: "allow" }, bash: { orig: null, wrote: "allow" }, [marker]: { orig: marker, wrote: marker } }, [marker]: { edit: { orig: marker, wrote: marker } } })
  json(join(home, ".cc-safety-net/rules/agent-guard/rulebook.json"), { [marker]: marker })
  json(join(engine, "state/rules.json"), { allow: [marker], readonly: [marker], deny: [marker], preparationStatus: "warning", arbitrary: marker })
  json(join(engine, "state/opencode-preferences.json"), { schemaVersion: 1, approvalPreference: "auto", private: marker })
  json(events, { schemaVersion: 1, advisory: true, events: [
    { timestamp: Date.now() - 1000, layer: "filesystem", stage: "path-resolve", code: "filesystem-error", tool: "read", ruleId: "unattributed", errno: "EPERM", remediation: "review-path", release: rid, command: marker, path: marker, error: marker },
    { timestamp: marker, layer: marker, stage: marker, code: marker, tool: marker, ruleId: marker, errno: marker, remediation: marker, release: marker }
  ] })
  const files = Object.fromEntries(Object.entries(tree(release)).map(([p, hash]) => [p, hash]))
  json(stamp, { version: "0.3.0", tag: "v0.3.0", commit: marker, release: rid, installed_at: 123, files, links: { [join(engine, "current")]: `releases/${rid}`, [join(engine, "bin")]: "current/bin" } })
  return { home, engine, release, stamp, record, config, events, command: join(release, "bin/agent-guard") }
}
function collect(f, name, args = ["diagnose", "--json"]) {
  const before = tree(f.home)
  const result = spawnSync("/bin/zsh", ["-f", f.command, ...args], { encoding: "utf8" })
  assert.equal(result.error, undefined)
  assert.equal(result.stderr, "", "sanitized diagnostics must not dump exceptions")
  assert.deepEqual(tree(f.home), before, "collection must not write or repair anything")
  assert.ok(!result.stdout.includes(marker), "private markers must not leave collector")
  put(join(run, `${name}.stdout`), result.stdout)
  return { ...result, report: args.includes("--json") ? JSON.parse(result.stdout) : undefined }
}
function test(name, body) {
  try { body(); console.log(`ok   diagnostics: ${name}`) }
  catch (error) { failures++; console.log(`FAIL diagnostics: ${name}: ${error.message}`) }
}

test("consistent release, safe classifications, ownership and cached evidence", () => {
  const f = fixture("healthy")
  const { status, report } = collect(f, "healthy")
  assert.equal(status, 0)
  assert.equal(report.installation.consistent, true)
  assert.equal(report.installation.loadedRelease, rid)
  assert.deepEqual(report.permissions.globalConfigs.map(x => x.classification), ["scalar", "json", "jsonc_with_comments"])
  assert.equal(report.permissions.ownership.find(x => x.key === "edit").action, "retirement_requires_choice")
  assert.equal(report.permissions.ownership.length, 2)
  assert.equal(report.permissions.desktopAutoMode.state, "not_observable")
  assert.deepEqual(report.permissions.approvalPreference, { state: "valid", value: "auto", observation: "configured_intent" })
  assert.equal(report.components.sandbox.state, "not_probed")
  assert.equal(report.components.lastLaunchSnapshot.preparationStatus, "warning")
  assert.equal(report.components.lastLaunchSnapshot.readiness, "not_probed")
  assert.equal(report.recentFailures.events[0].layer, "filesystem", "EPERM must not become sandbox attribution")
  assert.equal(report.recentFailures.events[1].ruleId, "unknown")
  assert.equal(report.recentFailures.events[1].timestamp, null)
  const text = collect(f, "text", ["diagnose"])
  assert.equal(text.status, 0)
  assert.ok(text.stdout.includes("read-only"))
})
test("hash, missing-file and link drift are aggregate failures", () => {
  const f = fixture("drift")
  put(join(f.release, "VERSION"), "0.3.1")
  const stamp = JSON.parse(readFileSync(f.stamp))
  stamp.files[join(f.release, "missing")] = "a".repeat(64)
  stamp.links[join(f.engine, "bin")] = marker
  json(f.stamp, stamp)
  const { status, report } = collect(f, "drift")
  assert.equal(status, 1)
  assert.equal(report.installation.drift.find(x => x.class === "release").changed, 1)
  assert.equal(report.installation.drift.find(x => x.class === "release").missing, 1)
  assert.equal(report.installation.drift.find(x => x.class === "engine").linksChanged, 1)
})
test("malformed and private stamp is sanitized, never treated as consistent", () => {
  const f = fixture("stamp-error")
  json(f.stamp, { release: marker, files: { [marker]: marker }, links: {} })
  const { status, report } = collect(f, "stamp-error")
  assert.equal(status, 1)
  assert.equal(report.installation.stamp, "error")
  assert.equal(report.installation.installedRelease, "unknown")
})
test("untrusted stamped paths are excluded without inspecting personal folders", () => {
  const f = fixture("excluded")
  const stamp = JSON.parse(readFileSync(f.stamp))
  stamp.files[join(f.home, "Documents", marker)] = "a".repeat(64)
  json(f.stamp, stamp)
  const { status, report } = collect(f, "excluded")
  assert.equal(status, 1)
  assert.equal(report.installation.excludedEntries, 1)
  assert.equal(report.installation.drift.find(x => x.class === "unknown").missing, 0)
})
test("malformed config, ownership and event data are availability gaps", () => {
  const f = fixture("gaps")
  put(f.config, `{"token":"${marker}"`)
  put(f.record, `${marker}\n`)
  json(f.events, { schemaVersion: 1, advisory: false, events: [{ error: marker }] })
  const { status, report } = collect(f, "gaps")
  assert.equal(status, 0, "diagnostic availability does not change installation consistency")
  assert.equal(report.permissions.globalConfigs[1].classification, "error")
  assert.equal(report.permissions.ownershipState, "error")
  assert.equal(report.recentFailures.state, "error")
  assert.deepEqual(report.recentFailures.events, [])
})
test("later user permission edits are reported as preserved", () => {
  const f = fixture("user-edit")
  json(f.config, { permission: { edit: "deny", bash: "ask" } })
  const { status, report } = collect(f, "user-edit")
  assert.equal(status, 0)
  assert.ok(report.permissions.ownership.every(x => x.action === "user_modified_preserved"))
})
test("oversized failure input is ignored without leaking or reading raw logs", () => {
  const f = fixture("bounded")
  put(f.events, marker.repeat(4000))
  const { status, report } = collect(f, "bounded")
  assert.equal(status, 0)
  assert.equal(report.recentFailures.state, "error")
  assert.deepEqual(report.recentFailures.events, [])
})
test("unsupported CLI arguments refuse before doing work", () => {
  const f = fixture("arguments")
  const before = tree(f.home)
  const result = spawnSync("/bin/zsh", ["-f", f.command, "diagnose", "--repair"], { encoding: "utf8" })
  assert.equal(result.status, 2)
  assert.equal(result.stdout, "")
  assert.deepEqual(tree(f.home), before)
  for (const args of [["update", "--approval-preference", marker], ["update", "--restore-edit-permissions", "--restore-edit-permissions"], ["update", "--approval-preference"]]) {
    const invalid = spawnSync("/bin/zsh", ["-f", f.command, ...args], { encoding: "utf8" })
    assert.equal(invalid.status, 2)
    assert.equal(invalid.stdout, "")
    assert.ok(!invalid.stderr.includes(marker))
    assert.deepEqual(tree(f.home), before)
  }
})
console.log(`diagnostics fixtures: ${run}`)
process.exitCode = failures ? 1 : 0
