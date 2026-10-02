// Fast stand-in for the OpenCode CLI in installer tests (design section 9.1).
// Install it as an executable named opencode that runs `node fake-opencode.mjs "$@"`.
//
// `serve [--hostname H] [--port P]` prints "opencode server listening on http://H:P" and answers
// GET /experimental/tool/ids with a JSON array: a few built-in ids plus every tool registered by
// the *.js plugins in $XDG_CONFIG_HOME/opencode/{plugin,plugins} (default ~/.config), and
// GET /global/event with OpenCode's first event, server.connected, on a stream it keeps open.
//
// `--version` prints a version. `status` loads those plugins as serve does and prints one line
// per plugin with a status tool: "launcher=<AGENT_GUARD_RELEASE> status=<its text>".
//
// Any other arguments run the sandbox probe: try to create ~/Documents/escaped, which a guard
// denies, then create ~/Projects/app/launched. Exits 0 when launched was written.
import { createServer } from 'node:http';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const home = homedir();

function option(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

// The hooks of every plugin function in the config folder's plugin folders.
async function pluginHooks(directory) {
  const all = [];
  const config = join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'opencode');
  for (const folder of ['plugin', 'plugins'].map((f) => join(config, f))) {
    if (!existsSync(folder)) continue;
    for (const name of readdirSync(folder).filter((f) => f.endsWith('.js')).sort()) {
      try {
        const mod = await import(pathToFileURL(join(folder, name)).href);
        for (const init of Object.values(mod)) {
          if (typeof init === 'function') all.push(await init({ directory, worktree: directory }));
        }
      } catch (error) {
        console.error(`plugin ${name} failed: ${error?.message ?? error}`);
      }
    }
  }
  return all;
}

async function toolIds(directory) {
  const ids = ['bash', 'read', 'edit', 'write', 'glob', 'grep', 'list'];
  for (const hooks of await pluginHooks(directory)) ids.push(...Object.keys(hooks?.tool ?? {}));
  return ids;
}

if (args[0] === '--version') {
  console.log('0.0.0-fake');
} else if (args[0] === 'status') {
  for (const hooks of await pluginHooks(process.cwd())) {
    const tool = hooks?.tool?.agent_guard_status;
    if (tool) console.log(`launcher=${process.env.AGENT_GUARD_RELEASE ?? ''} status=${await tool.execute({})}`);
  }
} else if (args[0] === 'serve') {
  const host = option('--hostname', '127.0.0.1');
  const port = Number(option('--port', '4096'));
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${host}`);
    if (url.pathname === '/global/event') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      return res.write(`data: ${JSON.stringify({ payload: { type: 'server.connected', properties: {} } })}\n\n`);
    }
    if (url.pathname !== '/experimental/tool/ids') {
      res.writeHead(404);
      return res.end();
    }
    const ids = await toolIds(url.searchParams.get('directory') || process.cwd());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ids));
  });
  server.listen(port, host, () => console.log(`opencode server listening on http://${host}:${port}`));
} else {
  try {
    writeFileSync(join(home, 'Documents/escaped'), '');
    console.log('escaped: written');
  } catch (error) {
    console.log(`escaped: ${error.code}`);
  }
  try {
    writeFileSync(join(home, 'Projects/app/launched'), args.join(' ') + '\n');
    console.log('launched: written');
  } catch (error) {
    console.log(`launched: ${error.code}`);
    process.exit(1);
  }
}
