import { execFileSync } from "node:child_process"
import { readFileSync, statSync } from "node:fs"
import { dirname, join, resolve, relative } from "node:path"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"

const query = join(dirname(fileURLToPath(import.meta.url)), "permissions.jq")
const native = new Set(["build", "plan", "explore", "general", "compaction", "title", "summary"])
const known = new Set(["edit", "bash", "read", "external_directory", "task", "doom_loop", "*"])
const actions = new Set(["allow", "ask", "deny"])
const unavailable = () => ({ schemaVersion: 1, scope: "project-session", availability: "unavailable", origin: "host_resolved", autoApproval: { state: "not_observable", source: "host_client" } })

// Candidate sources are matches, not provenance: the host discards file/line data.
function candidates(agents) {
  const result = []
  for (const name of ["config.json", "opencode.json", "opencode.jsonc"]) {
    try {
      const file = join(homedir(), ".config/opencode", name)
      const info = statSync(file)
      if (!info.isFile() || info.size > 1048576) continue
      const config = JSON.parse(readFileSync(file, "utf8"))
      for (const [index, agent] of agents.entries()) {
        const perms = [config.permission, config.agent?.[agent.name]?.permission]
        for (const [specific, original] of perms.entries()) {
          const permission = actions.has(original) ? { "*": original } : original
          if (!permission || typeof permission !== "object" || Array.isArray(permission)) continue
          for (const key of Object.keys(permission).filter(k => known.has(k))) {
            const value = permission[key]
            const rows = typeof value === "string" ? { "*": value } : value
            if (!rows || typeof rows !== "object" || Array.isArray(rows)) continue
            for (const [pattern, action] of Object.entries(rows)) {
              if (!actions.has(action)) continue
              const expanded = pattern.replace(/^~(?=\/|$)|^\$HOME(?=\/|$)/, homedir())
              const ruleIndex = agent.permission.findLastIndex(r => r.permission === key && r.pattern === expanded && r.action === action)
              if (ruleIndex < 0) continue
              result.push({ agent: native.has(agent.name) ? agent.name : `custom-${index}`, rule: `host.rule.${ruleIndex}`,
                file: name, key: `${specific ? `agent.${native.has(agent.name) ? agent.name : "custom"}.` : ""}permission.${key}`,
                confidence: "candidate_only" })
              if (result.length >= 64) return result
            }
          }
        }
      }
    } catch { /* Unreadable or commented config cannot establish a source. */ }
  }
  return result
}

export function permissionTool(input) {
  return {
    description: "Explain host-resolved agent and current-session permissions using fixed diagnostic probes. Sources are candidates; client auto-approval state is not observable.",
    args: {
      filePath: { type: "string", description: "Optional file or directory whose OpenCode permission rules should be explained; no content is read." },
      pathKind: { type: "string", enum: ["file", "directory"], description: "The requested path kind; defaults to file." },
    },
    async execute(args, context) {
      try {
        const requested = args?.filePath
        if ((requested !== undefined && (typeof requested !== "string" || !requested || requested.length > 4096 || /[\0\r\n]/.test(requested))) ||
          (args?.pathKind !== undefined && !["file", "directory"].includes(args.pathKind)))
          return JSON.stringify({ ...unavailable(), availability: "invalid_request" })
        if (!input.client?.app?.agents) return JSON.stringify(unavailable())
        const response = await input.client.app.agents()
        const agents = response.data
        if (!Array.isArray(agents) || agents.length > 64) return JSON.stringify(unavailable())
        const sessions = []
        let sessionObservation = "not_requested"
        const id = context?.sessionID
        if (typeof id === "string" && /^ses_[A-Za-z0-9]+$/.test(id) && input.client.session?.get) {
          sessionObservation = "unavailable"
          try {
            const current = (await input.client.session.get({ path: { id } })).data
            if (current) {
              sessions.push({ agent: current.agent ?? context.agent, permission: current.permission ?? [], child: false })
              sessionObservation = "observed"
            }
            if (input.client.session.children) {
              const children = (await input.client.session.children({ path: { id } })).data
              if (Array.isArray(children)) for (const child of children.slice(0, 15))
                sessions.push({ agent: child.agent, permission: child.permission ?? [], child: true })
            }
          } catch { /* Agent defaults remain observable if session lookup fails. */ }
        }
        const payload = { agents: agents.map(a => ({ name: a.name, mode: a.mode, permission: a.permission })), sessions }
        const parameters = ["-c", "--arg", "scope", "project-session", "--arg", "outside", "/agent-guard-external-probe/*", "--argjson", "observed", String(Date.now())]
        parameters.push("--arg", "planningEdit", input.permissionResources?.planningEdit ?? ".opencode/plans/probe.md")
        if (requested !== undefined) {
          const directory = context?.directory ?? input.directory
          const worktree = context?.worktree ?? input.worktree
          if (typeof directory !== "string" || typeof worktree !== "string" || !worktree.startsWith("/") || /[\0\r\n]/.test(worktree))
            return JSON.stringify(unavailable())
          const full = resolve(directory, requested.replace(/^~(?=\/|$)/, homedir()))
          const within = base => typeof base === "string" && (full === base || full.startsWith(base === "/" ? "/" : base + "/"))
          const external = !(within(directory) || (worktree !== "/" && within(worktree)))
          const resources = input.permissionResources?.requested({ directory, worktree, full, external })
            ?? { read: full, edit: relative(worktree, full) }
          parameters.push("--arg", "requested", "true", "--arg", "requestedEdit", resources.edit, "--arg", "requestedRead", resources.read,
            "--arg", "requestedExternal", join(args.pathKind === "directory" ? full : dirname(full), "*"), "--arg", "externalRequired", String(external))
        }
        const text = execFileSync("/usr/bin/jq", [...parameters, "-f", query], { input: JSON.stringify(payload), encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024, stdio: ["pipe", "pipe", "ignore"] })
        const report = JSON.parse(text)
        if (report.availability === "observed") {
          report.sourceCandidates = candidates(payload.agents)
          report.sessionObservation = sessionObservation
        }
        return JSON.stringify(report)
      } catch { return JSON.stringify(unavailable()) }
    },
  }
}
