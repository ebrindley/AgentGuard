import { closeSync, constants, existsSync, lstatSync, openSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { homedir, tmpdir } from "node:os"
import { randomBytes } from "node:crypto"
import { fileURLToPath, pathToFileURL } from "node:url"
import { permissionTool } from "./permissions.js"

const HOME = realpathSync(homedir())
const ENGINE = join(HOME, "Library/Application Support/AgentGuard")
const STATE = join(ENGINE, "state")
const LIST = "~/Agent Guard/Guard List.txt"
const SAFE_UNGUARDED = new Set(["invalid", "question", "todowrite", "webfetch", "websearch", "plan_exit", "agent_guard_status"])
const READS = new Set(["read", "glob", "grep", "list", "lsp"])
const CONFIG = /\/\.cc-safety-net(\/|$)/
const UNSAFE_NET_ENV = ["CC_SAFETY_NET_HOME", "CC_SAFETY_NET_WORKTREE", "SAFETY_NET_WORKTREE", "CC_SAFETY_NET_AUDIT_HOME"]
const releaseID = value => typeof value === "string" && value.length <= 100 && /^[0-9A-Za-z.+-]+$/.test(value) && value !== "." && value !== ".." ? value : null
const publicReleaseID = value => typeof value === "string" && /^(?:dev|\d+\.\d+\.\d+(?:-(?:rc|beta|alpha|pre)[.-]?\d+)?)-(?:\d{8}T\d{6}Z|fixture)$/.test(value) ? value : null
const ERRNOS = new Set(["EPERM", "EACCES", "ENOENT", "ENOTDIR", "ELOOP"])
const RULE_IDS = new Set(["guard.path.deny", "guard.path.protected", "guard.path.readonly", "guard.path.unlisted", "guard.path.invalid", "unattributed", "custom", "secret.basename.env", "git.reset-hard", "rm.recursive-force-root-or-home", "rm.recursive-force-outside-cwd"])
const EVENT_FIELDS = {
  layer: new Set(["guard", "filesystem", "sandbox", "opencode", "unknown"]),
  stage: new Set(["initialization", "sandbox-probe", "rules-load", "engine-load", "api-load", "tool-hook", "path-read", "path-write", "path-resolve", "workdir", "safety-net"]),
  code: new Set(["sandbox-unverified", "rules-unavailable", "engine-unavailable", "api-unavailable", "hooks-unavailable", "release-unavailable", "launcher-release-unavailable", "unguarded", "path-denied", "path-protected", "path-not-writable", "path-invalid", "patch-paths-missing", "filesystem-error", "safety-net-failed", "command-denied"]),
  tool: new Set(["read", "bash", "write", "other"]),
  ruleId: RULE_IDS,
  errno: new Set([...ERRNOS, "unknown"]),
  remediation: new Set(["relaunch", "reinstall", "review-guard-list", "review-policy", "review-path", "launch-guarded", "none"]),
}

function sanitizedEvent(event) {
  if (!event || !Number.isSafeInteger(event.timestamp) || event.timestamp < 0) return null
  const result = { timestamp: event.timestamp }
  for (const [key, values] of Object.entries(EVENT_FIELDS)) {
    if (!values.has(event[key])) return null
    result[key] = event[key]
  }
  result.release = publicReleaseID(event.release)
  return result
}

// Advisory support evidence, never an enforcement input. Existing writable log
// permissions suffice; failing to retain an observation cannot change a verdict.
function recordEvent(fields) {
  try {
    const file = join(HOME, ".cc-safety-net/logs/agent-guard-events.json")
    let events = []
    if (existsSync(file) && statSync(file).size <= 65536) {
      try {
        const previous = JSON.parse(readFileSync(file, "utf8"))
        if (previous.schemaVersion === 1 && previous.advisory === true && Array.isArray(previous.events))
          events = previous.events.slice(-31).map(sanitizedEvent).filter(Boolean)
      } catch { /* Discard invalid advisory history and retain this observation. */ }
    }
    const event = sanitizedEvent({ timestamp: Date.now(), tool: "other", ruleId: "unattributed", errno: "unknown", release: RELEASE ? basename(RELEASE) : null, ...fields })
    if (event) writeFileSync(file, JSON.stringify({ schemaVersion: 1, advisory: true, events: [...events, event] }) + "\n")
  } catch {}
}

// The release folder this file really lives in, whatever link OpenCode loaded it
// through. cc-safety-net and the version come from that release; a copy outside
// releases/ gets neither.
const SELF = realpathSync(fileURLToPath(import.meta.url))
const RELEASES = join(ENGINE, "releases") + "/"
const RELEASE = (() => {
  if (!SELF.startsWith(RELEASES)) return null
  const id = releaseID(SELF.slice(RELEASES.length).split("/")[0])
  if (!id) return null
  const dir = join(RELEASES, id)
  return existsSync(join(dir, "RELEASE")) ? dir : null
})()
const VERSION = (() => {
  try {
    const value = readFileSync(join(RELEASE, "VERSION"), "utf8").trim()
    return value.length <= 80 && /^(?:dev|\d+\.\d+\.\d+(?:-(?:rc|beta|alpha|pre)[.-]?\d+)?)$/.test(value) ? value : null
  } catch { return null }
})()

// The launcher names its release in AGENT_GUARD_RELEASE. After an update this file
// is loaded through current from the new release, so it hands over to the
// launcher's release: only a folder in the write-protected releases/ qualifies, and
// the module must really live there, so it does not hand over again. A named
// release that is gone or broken loads no cc-safety-net (DELEGATE false).
const WANTED = process.env.AGENT_GUARD_RELEASE ?? ""
const DELEGATE = await (async () => {
  if (!releaseID(WANTED) || WANTED === basename(RELEASE ?? "")) return null
  const dir = join(RELEASES, WANTED)
  try {
    const file = realpathSync(join(dir, "profiles/opencode/plugin.js"))
    if (!existsSync(join(dir, "RELEASE")) || !file.startsWith(dir + "/")) return false
    return (await import(pathToFileURL(file).href)).AgentGuard ?? false
  } catch {
    return false
  }
})()

const under = (p, root) => p === root || p.startsWith(root === "/" ? "/" : root + "/")

function canonical(p) {
  try {
    return realpathSync(p)
  } catch (error) {
    if (error.code !== "ENOENT") throw error
    let dangling = true
    try { lstatSync(p) } catch { dangling = false }
    if (dangling) throw new Error(`Agent Guard: dangling symlink ${p}`)
    const parent = dirname(p)
    if (parent === p) throw error
    return join(canonical(parent), basename(p))
  }
}

function sandboxed() {
  const observed = result => ({ method: "protected-state-write-probe", result, timestamp: Date.now() })
  try {
    if (lstatSync(STATE).isSymbolicLink()) return observed("unknown")
  } catch {
    return observed("unknown")
  }
  const probe = join(STATE, `.probe-${process.pid}-${randomBytes(6).toString("hex")}`)
  try {
    closeSync(openSync(probe, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW))
    unlinkSync(probe)
    return observed("unconfined")
  } catch (error) {
    return observed(error.code === "EPERM" ? "confined" : "unknown")
  }
}

function loadRules(onError) {
  try {
    const selected = process.env.AGENT_GUARD_CONTEXT
    const file = selected?.startsWith(join(STATE, "opencode") + "/") ? selected : join(STATE, "rules.json")
    const rules = JSON.parse(readFileSync(file, "utf8"))
    for (const key of ["allow", "readonly", "deny", "skills", "configs", "protected"])
      if (!Array.isArray(rules[key]) || rules[key].some(p => typeof p !== "string" || !p.startsWith("/"))) return null
    for (const key of ["writable", "pins"])
      if (rules[key] !== undefined && (!Array.isArray(rules[key]) || rules[key].some(p => typeof p !== "string" || !p.startsWith("/")))) return null
    if (!rules.checker?.startsWith(join(STATE, "opencode") + "/") || !existsSync(join(rules.checker, "rules/rule.json"))) return null
    return rules
  } catch (error) {
    onError?.(ERRNOS.has(error.code) ? error.code : "unknown")
    return null
  }
}

function installedRelease() {
  try {
    const current = realpathSync(join(ENGINE, "current"))
    const id = releaseID(basename(current))
    return id && current === join(RELEASES, id) && existsSync(join(current, "RELEASE")) ? id : null
  } catch { return null }
}

const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'"

function normalizedCommand(command) {
  // Exact Guard exports only, including commands copied from a pinned release.
  // Never parse or remove arbitrary user shell setup.
  const prefix = `export PATH=${shellQuote(RELEASES).slice(0, -1)}`
  while (command.startsWith(prefix)) {
    const end = command.indexOf("\n")
    if (end < 0) break
    const line = command.slice(0, end)
    const suffix = "/peers':$PATH"
    if (!line.endsWith(suffix)) break
    const id = line.slice(prefix.length, -suffix.length)
    if (!releaseID(id) || line !== `export PATH=${shellQuote(join(RELEASES, id, "peers"))}:$PATH`) break
    command = command.slice(end + 1)
  }
  return command
}

function patchPaths(text) {
  if (typeof text !== "string") return []
  return [...text.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to):(.*)$/gm)].map(m => m[1].trim())
}

async function guard(input) {
  const { directory } = input
  const sandbox = sandboxed()
  // The launcher sets AGENT_GUARD_OUTER_SANDBOX=1 when it runs OpenCode under
  // another tool's sandbox without its own profile (DESIGN.md section 15, D10).
  // That sandbox can deny the probe's write too, so the session stays unguarded.
  const outer = process.env.AGENT_GUARD_OUTER_SANDBOX === "1"
  const guarded = !outer && sandbox.result === "confined"
  const selectedRules = process.env.AGENT_GUARD_CONTEXT
  const rulesSource = selectedRules?.startsWith(join(STATE, "opencode") + "/") ? "snapshot" : "global"
  const failures = []
  const failure = (stage, code, remediation, errno = "unknown") => {
    const value = { layer: "guard", stage, code, remediation, errno }
    failures.push(value)
    recordEvent(value)
  }
  let rulesErrno = "unknown"
  const rules = outer ? null : loadRules(errno => { rulesErrno = errno })
  if (sandbox.result === "unknown") failure("sandbox-probe", "sandbox-unverified", "launch-guarded")
  if (!RELEASE) failure("initialization", "release-unavailable", "reinstall")
  if (DELEGATE === false) failure("initialization", "launcher-release-unavailable", "relaunch")
  if (!rules && !outer) failure("rules-load", "rules-unavailable", "relaunch", rulesErrno)
  if (guarded) {
    for (const name of UNSAFE_NET_ENV) delete process.env[name]
    if (process.env.CC_SAFETY_NET_LEVEL !== "paranoid") process.env.CC_SAFETY_NET_LEVEL = "strict"
    process.env.CC_SAFETY_NET_PROJECT_TIGHTEN_ONLY = "1"
    if (rules) process.env.CC_SAFETY_NET_HOME = rules.checker
  }
  const bypass = process.env.AGENT_GUARD_BYPASS === "1"
  let net = null, checkCommand = null, moduleLoaded = false
  if (RELEASE && DELEGATE !== false && (!guarded || rules)) {
    try {
      const module = await import(pathToFileURL(join(RELEASE, "vendor/cc-safety-net/dist/index.js")).href)
      moduleLoaded = true
      net = await module.default.server(input)
      if (!net || typeof net["tool.execute.before"] !== "function") {
        failure("engine-load", "hooks-unavailable", "reinstall")
        net = null
      }
    } catch (error) { failure("engine-load", "engine-unavailable", "reinstall", ERRNOS.has(error.code) ? error.code : "unknown") }
    try {
      checkCommand = (await import(pathToFileURL(join(RELEASE, "vendor/cc-safety-net/dist/api.js")).href)).checkCommand
      if (typeof checkCommand !== "function") checkCommand = null
    } catch {}
    if (!checkCommand) failure("api-load", "api-unavailable", "reinstall")
  }
  // cc-safety-net drops a rule source it cannot load and goes on allowing, so the
  // session copy must prove Agent Guard's Git rules are in force (docs/DESIGN.md
  // section 5, Command checker).
  let checkerRules = !guarded || !rules || !checkCommand
  if (!checkerRules) {
    try {
      const probe = checkCommand({ command: "git config core.hooksPath agent-guard-probe", cwd: directory })
      checkerRules = probe.kind === "deny" && probe.ruleId === "custom.agent-guard-git/hooks-path"
    } catch {}
    if (!checkerRules) failure("rules-load", "rules-unavailable", "relaunch")
  }
  const temps = [...new Set([canonical(tmpdir()), "/private/tmp"])]
  // OpenCode Guard's engine folder holds the forwarders after a migration.
  const protectedRoots = [ENGINE, join(HOME, "Library/Application Support/OpenCodeGuard"), join(HOME, "Agent Guard"),
    join(HOME, ".cc-safety-net")]
    .map(p => { try { return realpathSync(p) } catch { return p } })

  const namedSkill = p => /\/\.opencode\/skills?\/[^/]+|\/\.config\/opencode\/skills?\/[^/]+|\/\.(agents|claude)\/skills\/[^/]+/.test(p)
  const skillContent = p => namedSkill(p) || rules?.skills.some(r => p !== r && under(p, r)) ||
    configRoots.some(r => ["skill", "skills"].some(name => p !== join(r, name) && under(p, join(r, name))))
  const configRoots = [...(rules?.configs ?? []), join(directory, ".opencode")]
    .map(p => { try { return realpathSync(p) } catch { return p } })
  const toolClass = tool => READS.has(tool) ? "read" : tool === "bash" ? "bash" : ["write", "edit", "apply_patch"].includes(tool) ? "write" : "other"
  const refuse = (tool, message, stage, code, remediation, ruleId = "unattributed", errno = "unknown") => {
    recordEvent({ layer: "guard", stage, code, remediation, ruleId, errno, tool: toolClass(tool) })
    throw new Error(message)
  }
  const protectedPath = p => protectedRoots.some(r => under(p, r)) || rules?.protected.some(r => under(p, r)) ||
    CONFIG.test(p) && !skillContent(p) || (rules?.pins ?? rules?.skills ?? []).includes(p)
  const target = (raw, tool) => {
    if (typeof raw !== "string" || !raw || raw.includes("\0"))
      refuse(tool, "Agent Guard: invalid path", "path-resolve", "path-invalid", "review-path", "guard.path.invalid")
    const lexical = resolve(directory, raw.replace(/^~(?=\/|$)/, HOME))
    try { return canonical(lexical) } catch (error) {
      const errno = ERRNOS.has(error.code) ? error.code : "unknown"
      // An already-refused path can be explained lexically. This never grants
      // access or asserts that EPERM, by itself, establishes a Seatbelt denial.
      if (["EPERM", "EACCES"].includes(errno)) {
        if (rules?.deny.some(r => under(lexical, r)))
          refuse(tool, `Agent Guard: ${raw} is in the DENY list (${LIST}).`, "path-resolve", "path-denied", "review-guard-list", "guard.path.deny", errno)
        if (toolClass(tool) === "write" && protectedPath(lexical))
          refuse(tool, `Agent Guard: ${raw} is protected.`, "path-resolve", "path-protected", "review-policy", "guard.path.protected", errno)
      }
      recordEvent({ layer: "filesystem", stage: "path-resolve", code: "filesystem-error", remediation: "review-path", tool: toolClass(tool), errno })
      throw error
    }
  }

  const scope = p => {
    if (rules.deny.some(r => under(p, r))) return "deny"
    let best = "", kind = "none"
    for (const k of ["allow", "readonly"])
      for (const r of rules[k]) if (under(p, r) && r.length >= best.length) [best, kind] = [r, k]
    return kind
  }

  const checkRead = (raw, tool) => {
    if (rules && scope(target(raw, tool)) === "deny")
      refuse(tool, `Agent Guard: ${raw} is in the DENY list (${LIST}).`, "path-read", "path-denied", "review-guard-list", "guard.path.deny")
  }

  const checkWrite = (raw, tool) => {
    const p = target(raw, tool)
    const lexical = resolve(directory, raw.replace(/^~(?=\/|$)/, HOME))
    if (protectedPath(p) || CONFIG.test(lexical) && !namedSkill(lexical))
      refuse(tool, `Agent Guard: ${p} is protected.`, "path-write", "path-protected", "review-policy", "guard.path.protected")
    if (!rules) refuse(tool, "Agent Guard: rules unavailable; relaunch OpenCode.", "tool-hook", "rules-unavailable", "relaunch")
    const kind = scope(p)
    if (kind === "deny") refuse(tool, `Agent Guard: ${p} is in the DENY list (${LIST}).`, "path-write", "path-denied", "review-guard-list", "guard.path.deny")
    if (kind === "allow" || (kind === "none" && [...temps, ...rules.skills, ...(rules.writable ?? [])].some(r => under(p, r)))) return
    refuse(tool, `Agent Guard: ${p} is not writable. Add it under ALLOW in ${LIST}, then relaunch.`, "path-write", "path-not-writable", "review-guard-list", kind === "readonly" ? "guard.path.readonly" : "guard.path.unlisted")
  }
  const before = async (info, output) => {
    const { tool } = info
    const args = output.args ?? {}
    if (tool === "agent_guard_status") return
    if (!guarded) {
      if (!bypass && !SAFE_UNGUARDED.has(tool))
        refuse(tool, "Agent Guard: OpenCode was started without the guard. Quit it and open Agent Guard, or run opencode from a new terminal.", "tool-hook", "unguarded", "launch-guarded")
      return net?.["tool.execute.before"]?.(info, output)
    }
    if (DELEGATE === false) refuse(tool, "Agent Guard was updated; quit and reopen OpenCode.", "tool-hook", "launcher-release-unavailable", "relaunch")
    if (!rules || !checkerRules) refuse(tool, "Agent Guard: rules unavailable; relaunch OpenCode.", "tool-hook", "rules-unavailable", "relaunch")
    if (!net || !checkCommand) refuse(tool, "Agent Guard: cc-safety-net failed to load; reinstall Agent Guard.", "tool-hook", !net ? "engine-unavailable" : "api-unavailable", "reinstall")
    if (tool === "bash" && typeof args.command === "string") args.command = normalizedCommand(args.command)
    if (READS.has(tool)) checkRead(args.filePath ?? args.path ?? directory, tool)
    if (tool === "edit" || tool === "write") checkWrite(args.filePath, tool)
    if (tool === "apply_patch") {
      const paths = patchPaths(args.patchText)
      if (!paths.length) refuse(tool, "Agent Guard: no file paths in patch", "tool-hook", "patch-paths-missing", "review-path")
      for (const p of paths) checkWrite(p, tool)
    }
    if (tool === "bash" && typeof args.workdir === "string") {
      const workdir = target(args.workdir, tool)
      if (!under(workdir, canonical(directory))) {
        const quoted = "'" + workdir.replaceAll("'", "'\\''") + "'"
        const decision = checkCommand({ command: `cd ${quoted} && ${args.command}`, cwd: directory })
        if (decision.kind === "deny") {
          const ruleId = RULE_IDS.has(decision.ruleId) ? decision.ruleId : "custom"
          refuse(tool, `Agent Guard: ${decision.reason}`, "workdir", "command-denied", "review-policy", ruleId)
        }
      }
    }
    try { await net["tool.execute.before"](info, output) } catch (error) {
      const matched = typeof error.message === "string" ? error.message.slice(0, 8192).match(/^Rule: ([a-z0-9.-]{1,100})$/m)?.[1] : null
      const ruleId = matched ? RULE_IDS.has(matched) ? matched : "custom" : "unattributed"
      recordEvent({ layer: "guard", stage: "safety-net", code: "safety-net-failed", remediation: "review-policy", ruleId, tool: toolClass(tool), errno: ERRNOS.has(error.code) ? error.code : "unknown" })
      throw error
    }
    // Shell startup files can prepend native CLIs ahead of the session wrappers.
    if (tool === "bash" && typeof args.command === "string" && RELEASE && existsSync(join(RELEASE, "peers"))) {
      const peers = shellQuote(join(RELEASE, "peers"))
      args.command = `export PATH=${peers}:$PATH\n${args.command}`
    }
  }

  const state = !guarded ? outer || sandbox.result === "unconfined" ? "inactive" : "unknown" :
    RELEASE && DELEGATE !== false && rules && checkerRules && net && checkCommand ? "active" : "degraded"
  const health = () => {
    const loaded = RELEASE ? basename(RELEASE) : null
    const launcher = releaseID(WANTED)
    const installed = installedRelease()
    return {
      schemaVersion: 1,
      advisory: true,
      state,
      sandbox: { ...sandbox, origin: "startup-probe", freshness: "cached" },
      rules: { loaded: !!rules, source: rulesSource, semanticHealth: "not-probed" },
      safetyNet: { moduleLoaded, apiLoaded: !!checkCommand, hooksReady: !!net, semanticHealth: "not-probed" },
      preparation: { status: ["ready", "warning"].includes(rules?.preparationStatus) ? rules.preparationStatus : "not-observed", origin: "snapshot" },
      releases: { loaded: publicReleaseID(loaded), launcher: publicReleaseID(launcher), installed: publicReleaseID(installed), version: VERSION },
      restartNeeded: DELEGATE === false || !!(installed && loaded && installed !== loaded) || !!(launcher && loaded && launcher !== loaded),
      failures,
    }
  }
  const status = {
    description: `Report Agent Guard component observations. [agent-guard:${state === "active" ? "ready" : state}]`,
    args: {},
    async execute() {
      return JSON.stringify(health())
    },
  }

  return {
    ...(net ?? {}),
    tool: { ...(net?.tool ?? {}), agent_guard_status: status, ...(state === "active" ? { agent_guard_permissions: permissionTool(input) } : {}) },
    "tool.execute.before": before,
  }
}

export const AgentGuard = DELEGATE || guard

// V1 selects server(); V2 selects setup(). The implementations share policy,
// while the adapter translates the host's tool and permission contracts.
export default {
  id: "agent-guard",
  server: AgentGuard,
  async setup(context) {
    const { setup } = await import("./v2.js")
    return setup(context, AgentGuard)
  },
}
