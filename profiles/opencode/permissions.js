import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
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
      const config = JSON.parse(readFileSync(join(homedir(), ".config/opencode", name), "utf8"))
      for (const [index, agent] of agents.entries()) {
        const perms = [config.permission, config.agent?.[agent.name]?.permission]
        for (const [specific, permission] of perms.entries()) {
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
    args: {},
    async execute(_args, context) {
      try {
        if (!input.client?.app?.agents) return JSON.stringify(unavailable())
        const response = await input.client.app.agents()
        const agents = response.data
        if (!Array.isArray(agents) || agents.length > 64) return JSON.stringify(unavailable())
        const sessions = []
        const id = context?.sessionID
        if (typeof id === "string" && /^ses_[A-Za-z0-9]+$/.test(id) && input.client.session?.get) {
          try {
            const current = (await input.client.session.get({ path: { id } })).data
            if (current) sessions.push({ agent: current.agent ?? context.agent, permission: current.permission ?? [], child: false })
            if (input.client.session.children) {
              const children = (await input.client.session.children({ path: { id } })).data
              if (Array.isArray(children)) for (const child of children.slice(0, 15))
                sessions.push({ agent: child.agent, permission: child.permission ?? [], child: true })
            }
          } catch { /* Agent defaults remain observable if session lookup fails. */ }
        }
        const payload = { agents: agents.map(a => ({ name: a.name, mode: a.mode, permission: a.permission })), sessions }
        const text = execFileSync("/usr/bin/jq", ["-c", "--arg", "scope", "project-session", "--arg", "outside", "/agent-guard-external-probe/*",
          "--argjson", "observed", String(Date.now()), "-f", query], { input: JSON.stringify(payload), encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024, stdio: ["pipe", "pipe", "ignore"] })
        const report = JSON.parse(text)
        if (report.availability === "observed") report.sourceCandidates = candidates(payload.agents)
        return JSON.stringify(report)
      } catch { return JSON.stringify(unavailable()) }
    },
  }
}
