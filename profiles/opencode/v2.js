import { homedir } from "node:os"
import { join, relative } from "node:path"

const legacyAction = action => ({ shell: "bash", subagent: "task" })[action] ?? action
const legacyRules = rules => Array.isArray(rules) ? rules.map(rule => ({
  permission: legacyAction(rule.action), pattern: rule.resource, action: rule.effect,
})) : rules
const legacyAgent = agent => ({ ...agent, name: agent.id, permission: legacyRules(agent.permissions) })
const legacySession = session => ({ ...session, permission: legacyRules(session.permissions ?? []) })

export async function setup(context, guard) {
  const directory = context.location.directory
  const worktree = context.location.project.directory
  // Decision D18: the guard asks before a command deletes a whole repository. The
  // request is the host's own permission prompt, under an action of Agent Guard's;
  // the evaluate hook makes it a question whatever the configured rules say.
  const DELETE_REPOSITORY = "agent-guard.delete-repository"
  let confirm
  try {
    if (typeof context.permission?.assert === "function") {
      await context.permission.hook("evaluate", event => { if (event?.action === DELETE_REPOSITORY) event.effect = "ask" })
      confirm = ({ sessionID, repository, message }) => context.permission.assert({ sessionID, action: DELETE_REPOSITORY, resources: [repository], message })
    }
  } catch { confirm = undefined }
  const hooks = await guard({
    directory,
    worktree,
    confirm,
    permissionResources: {
      planningEdit: join(homedir(), ".opencode/plan/probe.md"),
      requested({ directory, full, external }) {
        const resource = external ? full : relative(directory, full) || "."
        return { read: resource, edit: resource }
      },
    },
    client: {
      app: { agents: async () => ({ data: (await context.agent.list()).data.map(legacyAgent) }) },
      session: {
        get: async ({ path }) => ({ data: legacySession(await context.session.get({ sessionID: path.id })) }),
        children: async ({ path }) => ({ data: (await context.session.list({ parentID: path.id, limit: 15 })).data.map(legacySession) }),
      },
    },
  })
  await context.tool.hook("execute.before", async event => {
    const tool = ({ shell: "bash", patch: "apply_patch", subagent: "task" })[event.tool] ?? event.tool
    const input = event.input
    const args = input && typeof input === "object" && !Array.isArray(input) ? { ...input } : {}
    if (["read", "write", "edit"].includes(event.tool)) args.filePath = args.path
    if (event.tool === "shell" && typeof args.workdir === "string" && /^~(?:\/|$)/.test(args.workdir))
      args.workdir = join(homedir(), args.workdir.slice(2))
    await hooks["tool.execute.before"]({ ...event, tool }, { args })
    if (event.tool === "shell" && typeof args.command === "string") event.input = {
      ...input, command: args.command,
      ...(typeof args.workdir === "string" ? { workdir: args.workdir } : {}),
    }
  })
  // The sandbox note (plugin.js) on a finished shell command. The note is advice:
  // a host without this hook, or a result in another shape, goes without it.
  try {
    await context.tool.hook("execute.after", async event => {
      // An update can pair this adapter with the previous release's guard, which has no after hook.
      try {
        if (event?.tool !== "shell" || event.status !== "completed" || !Array.isArray(event.result?.content)) return
        const text = event.result.content.map(part => typeof part?.text === "string" ? part.text : "").join("\n")
        const output = { output: text }
        await hooks["tool.execute.after"]?.({ ...event, tool: "bash" }, output)
        if (output.output !== text && output.output.startsWith(text))
          event.result.content = [...event.result.content, { type: "text", text: `\n${output.output.slice(text.length).trimStart()}` }]
      } catch {}
    })
  } catch {}
  await context.tool.transform(editor => {
    for (const [name, tool] of Object.entries(hooks.tool ?? {})) {
      editor.add({
        name,
        description: tool.description,
        input: { type: "object", properties: tool.args ?? {}, additionalProperties: false },
        options: { codemode: false },
        async execute(args, execution) {
          return { content: await tool.execute(args, { ...execution, directory, worktree }) }
        },
      })
    }
  })
  // The existing readiness probe needs a model-free V2 endpoint. Status stays
  // available when ordinary tools are refused, as it does under V1.
  await context.rpc.register({
    id: "agent-guard",
    methods: {
      status: { input: { type: "object", additionalProperties: false }, output: { type: "object" } },
      permissions: { input: { type: "object", additionalProperties: false }, output: { type: "object" } },
    },
    events: {},
  }, {
    status: async () => JSON.parse(await hooks.tool.agent_guard_status.execute({})),
    permissions: async () => hooks.tool.agent_guard_permissions
      ? JSON.parse(await hooks.tool.agent_guard_permissions.execute({}))
      : { availability: "unavailable" },
  })
}
