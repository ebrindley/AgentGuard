const { Plugin, Command, Ipc } = require('@opencode/plugin/gui')
const { Schema } = require('effect')

const browser = Ipc.define({
  id: 'agent-guard-browser.open',
  methods: {
    open: { input: Schema.String },
    claude: {},
    cancelClaude: {},
  },
})

module.exports.default = Plugin.define({
  setup(ctx) {
    const opener = ctx.main(browser)
    const attempts = new Map()
    const cancel = async (integrationID) => {
      const attempt = attempts.get(integrationID)
      attempts.delete(integrationID)
      if (attempt?.attemptID) await ctx.client.integration.oauth.cancel(attempt)
    }
    const connect = async (integrationID, methodID) => {
      if (attempts.has(integrationID)) return
      const toast = ctx.toast.show({ title: 'Opening sign-in in your browser…', variant: 'loading', persistent: true })
      const pending = {}
      attempts.set(integrationID, pending)
      let attempt = pending
      try {
        const result = await ctx.client.integration.oauth.connect({ integrationID, methodID })
        attempt = { integrationID, attemptID: result.data.attemptID, location: result.location }
        if (attempts.get(integrationID) !== pending) {
          await ctx.client.integration.oauth.cancel(attempt)
          return
        }
        attempts.set(integrationID, attempt)
        if (result.data.mode !== 'auto') throw new Error('This provider requires a different connection method')
        await opener.open(result.data.url)
        toast.dismiss()
        const waiting = ctx.toast.show({
          title: 'Complete sign-in in your browser', persistent: true,
          actions: [{ label: 'Cancel', run: () => cancel(integrationID) }],
        })
        try {
          const deadline = Date.now() + 10 * 60 * 1000
          while (attempts.get(integrationID) === attempt && Date.now() < deadline) {
            const response = await ctx.client.integration.oauth.status(attempt)
            const status = response.data ?? response
            if (status.status === 'complete') {
              attempts.delete(integrationID)
              ctx.toast.show({ title: 'Provider connected', variant: 'success' })
              return
            }
            if (status.status === 'failed') throw new Error('Provider sign-in failed. Try connecting again.')
            if (status.status === 'expired') throw new Error('Sign-in expired. Try connecting again.')
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
          if (attempts.get(integrationID) === attempt) throw new Error('Sign-in expired. Try connecting again.')
        } finally { waiting.dismiss() }
      } catch (error) {
        ctx.toast.show({ title: 'Could not complete sign-in', description: error.message, variant: 'error' })
      } finally {
        toast.dismiss()
        if (attempts.get(integrationID) === attempt || attempts.get(integrationID) === pending) await cancel(integrationID).catch(() => {})
      }
    }
    for (const [id, title, method] of [
      ['openai', 'Connect ChatGPT through Agent Guard', 'chatgpt-token-sharing'],
      ['opencode', 'Connect OpenCode through Agent Guard', 'device'],
    ]) ctx.add(Command, { id: `connect-${id}`, title, run: () => connect(id, method) })
    ctx.add(Command, {
      id: 'connect-claude', title: 'Sign in Claude Code through Agent Guard',
      run: async () => {
        const toast = ctx.toast.show({
          title: 'Opening Claude Code sign-in…',
          description: 'Uses the shared Claude Code account. Credential saving remains subject to its sandbox permissions.',
          variant: 'loading', persistent: true,
          actions: [{ label: 'Cancel', run: () => opener.cancelClaude() }],
        })
        try {
          await opener.claude()
          ctx.toast.show({ title: 'Claude Code sign-in finished. Connect Claude Agent in Providers.', variant: 'success' })
        } catch (error) {
          ctx.toast.show({ title: 'Claude Code sign-in did not complete', description: error.message, variant: 'error' })
        } finally { toast.dismiss() }
      },
    })
    return () => { for (const id of attempts.keys()) void cancel(id).catch(() => {}); void opener.cancelClaude().catch(() => {}) }
  },
  main(ctx) {
    const net = require('node:net')
    const { spawn } = require('node:child_process')
    let claude
    const cancelClaude = () => {
      if (claude?.pid) { try { process.kill(-claude.pid, 'SIGTERM') } catch {} }
    }
    ctx.provide(browser, {
      open(url) {
        return new Promise((resolve, reject) => {
          const socketPath = process.env.AGENT_GUARD_BROWSER_SOCKET
          const bytes = Buffer.from(url)
          if (!socketPath || bytes.length > 8192 || !bytes.length) return reject(new Error('Browser helper unavailable'))
          const socket = net.createConnection(socketPath)
          let reply = ''
          const fail = () => { socket.destroy(); reject(new Error('Browser helper unavailable or request refused')) }
          socket.setTimeout(10000, fail)
          socket.once('error', fail)
          socket.once('connect', () => socket.write(Buffer.concat([Buffer.from(String(bytes.length).padStart(5, '0')), bytes])))
          socket.on('data', chunk => {
            reply += chunk.toString()
            if (reply.includes('\n')) {
              socket.destroy()
              reply.trim() === 'ok' ? resolve() : reject(new Error('This authentication URL could not be opened'))
            }
          })
          socket.once('end', () => { if (!reply.includes('\n')) fail() })
        })
      },
      claude() {
        if (claude) return Promise.reject(new Error('Claude Code sign-in is already running'))
        // This child stays in the Desktop sandbox. A PTY lets the native CLI
        // invoke its browser opener; the protected PATH shim forwards the URL.
        return new Promise((resolve, reject) => {
          claude = spawn('/usr/bin/script', ['-q', '/dev/null', 'claude', 'auth', 'login', '--claudeai'], { detached: true, stdio: 'ignore' })
          const child = claude
          const timeout = setTimeout(cancelClaude, 10 * 60 * 1000)
          child.once('error', () => { clearTimeout(timeout); claude = undefined; reject(new Error('Could not start Claude Code')) })
          child.once('close', code => {
            clearTimeout(timeout); claude = undefined
            code === 0 ? resolve() : reject(new Error('Claude Code exited before completing sign-in; its credential permissions may require sign-in outside Agent Guard'))
          })
        })
      },
      cancelClaude,
    })
    ctx.onCleanup(cancelClaude)
  },
})
