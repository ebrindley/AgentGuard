const legacyAction = action => ({ shell: "bash", subagent: "task" })[action] ?? action
const legacyRules = rules => Array.isArray(rules) ? rules.map(rule => ({
  permission: legacyAction(rule.action), pattern: rule.resource, action: rule.effect,
})) : rules
const legacyAgent = agent => ({ ...agent, name: agent.id, permission: legacyRules(agent.permissions) })
const legacySession = session => ({ ...session, permission: legacyRules(session.permissions ?? []) })

export async function setup(context, guard) {
  const directory = context.location.directory
  const hooks = await guard({
    directory,
    worktree: context.location.project.canonical,
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
    await hooks["tool.execute.before"]({ ...event, tool }, { args })
    if (event.tool === "shell" && typeof args.command === "string") event.input = { ...input, command: args.command }
  })
  await context.tool.transform(editor => {
    for (const [name, tool] of Object.entries(hooks.tool ?? {})) {
      editor.add({
        name,
        description: tool.description,
        input: { type: "object", properties: tool.args ?? {}, additionalProperties: false },
        options: { codemode: false },
        async execute(args, execution) {
          return { content: await tool.execute(args, { ...execution, directory, worktree: context.location.project.canonical }) }
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
