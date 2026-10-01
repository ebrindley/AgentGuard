import { closeSync, constants, existsSync, lstatSync, openSync, readFileSync, realpathSync, unlinkSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { homedir, tmpdir } from "node:os"
import { randomBytes } from "node:crypto"
import { fileURLToPath, pathToFileURL } from "node:url"

const HOME = realpathSync(homedir())
const ENGINE = join(HOME, "Library/Application Support/AgentGuard")
const STATE = join(ENGINE, "state")
const LIST = "~/Agent Guard/Guard List.txt"
const SAFE_UNGUARDED = new Set(["invalid", "question", "todowrite", "webfetch", "websearch", "plan_exit", "agent_guard_status"])
const READS = new Set(["read", "glob", "grep", "list", "lsp"])
const CONFIG = /\/\.opencode(\/|$)|\/(opencode|tui)\.jsonc?$|\/\.cc-safety-net(\/|$)/
const UNSAFE_NET_ENV = ["CC_SAFETY_NET_HOME", "CC_SAFETY_NET_WORKTREE", "SAFETY_NET_WORKTREE"]

// The release folder this file really lives in, whatever link OpenCode loaded it
// through. cc-safety-net and the version come from that release; a copy outside
// releases/ gets neither.
const SELF = realpathSync(fileURLToPath(import.meta.url))
const RELEASES = join(ENGINE, "releases") + "/"
const RELEASE = (() => {
  if (!SELF.startsWith(RELEASES)) return null
  const dir = join(RELEASES, SELF.slice(RELEASES.length).split("/")[0])
  return existsSync(join(dir, "RELEASE")) ? dir : null
})()
const VERSION = (() => {
  try { return readFileSync(join(RELEASE, "VERSION"), "utf8").trim() } catch { return "unknown" }
})()
const NAME = RELEASE ? `Agent Guard ${VERSION} (${basename(RELEASE)})` : "Agent Guard"

// The launcher names its release in AGENT_GUARD_RELEASE. After an update this file
// is loaded through current from the new release, so it hands over to the
// launcher's release: only a folder in the write-protected releases/ qualifies, and
// the module must really live there, so it does not hand over again. A named
// release that is gone or broken loads no cc-safety-net (DELEGATE false).
const WANTED = process.env.AGENT_GUARD_RELEASE ?? ""
const DELEGATE = await (async () => {
  if (!/^[0-9A-Za-z.+-]+$/.test(WANTED) || WANTED === "." || WANTED === ".." || WANTED === basename(RELEASE ?? "")) return null
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
  try {
    if (lstatSync(STATE).isSymbolicLink()) return false
  } catch {
    return false
  }
  const probe = join(STATE, `.probe-${process.pid}-${randomBytes(6).toString("hex")}`)
  try {
    closeSync(openSync(probe, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW))
    unlinkSync(probe)
    return false
  } catch (error) {
    return error.code === "EPERM"
  }
}

function loadRules() {
  try {
    return JSON.parse(readFileSync(join(STATE, "rules.json"), "utf8"))
  } catch {
    return null
  }
}

async function loadSafetyNet(input) {
  if (!RELEASE || DELEGATE === false) return null
  try {
    const url = pathToFileURL(join(RELEASE, "vendor/cc-safety-net/dist/index.js")).href
    return await (await import(url)).default.server(input)
  } catch {
    return null
  }
}

function patchPaths(text) {
  if (typeof text !== "string") return []
  return [...text.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to):(.*)$/gm)].map(m => m[1].trim())
}

async function guard(input) {
  const { directory } = input
  const guarded = sandboxed()
  if (guarded) {
    for (const name of UNSAFE_NET_ENV) delete process.env[name]
    process.env.CC_SAFETY_NET_PARANOID_RM = "1"
  }
  const bypass = process.env.AGENT_GUARD_BYPASS === "1"
  const rules = loadRules()
  const net = await loadSafetyNet(input)
  const temps = [...new Set([canonical(tmpdir()), "/private/tmp"])]
  // OpenCode Guard's engine folder holds the forwarders after a migration.
  const protectedRoots = [ENGINE, join(HOME, "Library/Application Support/OpenCodeGuard"), join(HOME, "Agent Guard"),
    join(HOME, ".config/opencode"), join(HOME, ".cc-safety-net")]
    .map(p => { try { return realpathSync(p) } catch { return p } })

  const target = raw => {
    if (typeof raw !== "string" || !raw || raw.includes("\0")) throw new Error("Agent Guard: invalid path")
    return canonical(resolve(directory, raw.replace(/^~(?=\/|$)/, HOME)))
  }

  const scope = p => {
    if (rules.deny.some(r => under(p, r))) return "deny"
    let best = "", kind = "none"
    for (const k of ["allow", "readonly"])
      for (const r of rules[k]) if (under(p, r) && r.length >= best.length) [best, kind] = [r, k]
    return kind
  }

  const checkRead = raw => {
    if (rules && scope(target(raw)) === "deny") throw new Error(`Agent Guard: ${raw} is in the DENY list (${LIST}).`)
  }

  const checkWrite = raw => {
    const p = target(raw)
    const lexical = resolve(directory, raw.replace(/^~(?=\/|$)/, HOME))
    if (protectedRoots.some(r => under(p, r)) || CONFIG.test(p) || CONFIG.test(lexical)) throw new Error(`Agent Guard: ${p} is protected.`)
    if (!rules) throw new Error("Agent Guard: rules unavailable; relaunch OpenCode.")
    const kind = scope(p)
    if (kind === "deny") throw new Error(`Agent Guard: ${p} is in the DENY list (${LIST}).`)
    if (kind === "allow" || (kind === "none" && temps.some(r => under(p, r)))) return
    throw new Error(`Agent Guard: ${p} is not writable. Add it under ALLOW in ${LIST}, then relaunch.`)
  }

  const before = async (info, output) => {
    const { tool } = info
    const args = output.args ?? {}
    if (!guarded) {
      if (!bypass && !SAFE_UNGUARDED.has(tool))
        throw new Error("Agent Guard: OpenCode was started without the guard. Quit it and open Agent Guard, or run opencode from a new terminal.")
      return net?.["tool.execute.before"]?.(info, output)
    }
    if (!net && DELEGATE === false) throw new Error("Agent Guard was updated; quit and reopen OpenCode.")
    if (!net) throw new Error("Agent Guard: cc-safety-net failed to load; reinstall Agent Guard.")
    if (READS.has(tool)) checkRead(args.filePath ?? args.path ?? directory)
    if (tool === "edit" || tool === "write") checkWrite(args.filePath)
    if (tool === "apply_patch") {
      const paths = patchPaths(args.patchText)
      if (!paths.length) throw new Error("Agent Guard: no file paths in patch")
      paths.forEach(checkWrite)
    }
    await net["tool.execute.before"]?.(info, output)
  }

  const status = {
    description: `Report whether Agent Guard is active. Installed: ${NAME}.`,
    args: {},
    async execute() {
      return guarded ? `${NAME} is active.` : `${NAME} is NOT active: OpenCode was started without the guard.`
    },
  }

  return {
    ...(net ?? {}),
    ...(net ? { tool: { ...(net.tool ?? {}), agent_guard_status: status } } : {}),
    "tool.execute.before": before,
  }
}

export const AgentGuard = DELEGATE || guard
