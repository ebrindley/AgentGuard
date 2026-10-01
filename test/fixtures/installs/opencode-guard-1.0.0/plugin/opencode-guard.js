import { closeSync, constants, lstatSync, openSync, readFileSync, realpathSync, unlinkSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { homedir, tmpdir } from "node:os"
import { randomBytes } from "node:crypto"
import { pathToFileURL } from "node:url"

const HOME = realpathSync(homedir())
const ENGINE = join(HOME, "Library/Application Support/OpenCodeGuard")
const STATE = join(ENGINE, "state")
const LIST = "~/OpenCode Guard/Guard List.txt"
const SAFE_UNGUARDED = new Set(["invalid", "question", "todowrite", "webfetch", "websearch", "plan_exit", "opencode_guard_status"])
const READS = new Set(["read", "glob", "grep", "lsp"])
const CONFIG = /\/\.opencode(\/|$)|\/opencode\.jsonc?$|\/\.cc-safety-net(\/|$)/

const under = (p, root) => p === root || p.startsWith(root === "/" ? "/" : root + "/")

function canonical(p) {
  try {
    return realpathSync(p)
  } catch (error) {
    if (error.code !== "ENOENT") throw error
    let dangling = true
    try { lstatSync(p) } catch { dangling = false }
    if (dangling) throw new Error(`OpenCode Guard: dangling symlink ${p}`)
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
  try {
    const url = pathToFileURL(join(ENGINE, "vendor/cc-safety-net/dist/index.js")).href
    return await (await import(url)).default.server(input)
  } catch {
    return null
  }
}

function patchPaths(text) {
  if (typeof text !== "string") return []
  return [...text.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to):(.*)$/gm)].map(m => m[1].trim())
}

export const OpenCodeGuard = async input => {
  const { directory } = input
  const guarded = sandboxed()
  const bypass = process.env.OPENCODE_GUARD_BYPASS === "1"
  const rules = loadRules()
  const net = await loadSafetyNet(input)
  const temps = [...new Set([canonical(tmpdir()), "/private/tmp"])]
  const protectedRoots = [ENGINE, join(HOME, "OpenCode Guard"), join(HOME, ".config/opencode"), join(HOME, ".cc-safety-net")]
    .map(p => { try { return realpathSync(p) } catch { return p } })

  const target = raw => {
    if (typeof raw !== "string" || !raw || raw.includes("\0")) throw new Error("OpenCode Guard: invalid path")
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
    if (rules && scope(target(raw)) === "deny") throw new Error(`OpenCode Guard: ${raw} is in the DENY list (${LIST}).`)
  }

  const checkWrite = raw => {
    const p = target(raw)
    if (protectedRoots.some(r => under(p, r)) || CONFIG.test(p)) throw new Error(`OpenCode Guard: ${p} is protected.`)
    if (!rules) throw new Error("OpenCode Guard: rules unavailable; relaunch OpenCode.")
    const kind = scope(p)
    if (kind === "deny") throw new Error(`OpenCode Guard: ${p} is in the DENY list (${LIST}).`)
    if (kind === "allow" || (kind === "none" && temps.some(r => under(p, r)))) return
    throw new Error(`OpenCode Guard: ${p} is not writable. Add it under ALLOW in ${LIST}, then relaunch.`)
  }

  const before = async (info, output) => {
    const { tool } = info
    const args = output.args ?? {}
    if (!guarded) {
      if (!bypass && !SAFE_UNGUARDED.has(tool))
        throw new Error("OpenCode Guard: OpenCode was started without the guard. Quit it and open OpenCode Guard, or run opencode from a new terminal.")
      return net?.["tool.execute.before"]?.(info, output)
    }
    if (!net) throw new Error("OpenCode Guard: cc-safety-net failed to load; reinstall OpenCode Guard.")
    if (READS.has(tool)) checkRead(args.filePath ?? args.path ?? directory)
    if (tool === "edit" || tool === "write") checkWrite(args.filePath)
    if (tool === "apply_patch") {
      const paths = patchPaths(args.patchText)
      if (!paths.length) throw new Error("OpenCode Guard: no file paths in patch")
      paths.forEach(checkWrite)
    }
    await net["tool.execute.before"]?.(info, output)
  }

  const status = {
    description: "Report whether OpenCode Guard is active.",
    args: {},
    async execute() {
      return guarded ? "OpenCode Guard is active." : "OpenCode Guard is NOT active: OpenCode was started without the guard."
    },
  }

  return {
    ...(net ?? {}),
    ...(net ? { tool: { ...(net.tool ?? {}), opencode_guard_status: status } } : {}),
    "tool.execute.before": before,
  }
}
