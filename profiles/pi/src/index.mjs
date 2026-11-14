// index.mjs — shared Pi/OMP extension entry point.
//
// A best-effort PRE-EXECUTION guard: shell commands go to cc-safety-net's Pi
// entry (vendor/cc-safety-net/dist/pi/index.js in the Agent Guard release), which
// checks shell commands. Only `bash` and `powershell` calls are forwarded to it.
// It is NOT a sandbox: Pi allows later handlers to mutate event.input with no
// re-validation, so this is authoritative only if it runs last and nothing
// rewrites the command afterward. Seatbelt is the layer that does not depend on it.
//
// The entry is driven through a stand-in Pi API that captures its `tool_call`
// handler; neither Pi nor OMP loads cc-safety-net as an extension of its own. The
// handler runs once per candidate working folder and the worst result wins. The
// policy is the session copy of the user's cc-safety-net configuration that the
// launcher built outside the sandbox (docs/DESIGN.md section 5, Command checker,
// and decision D13). Every verdict is allow or block: there are no confirmations.

import { existsSync, realpathSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EVENT_STATE_KEY = Symbol.for('@ebrindley/pi-sandbox-guard/event-state');
const eventState = globalThis[EVENT_STATE_KEY] ?? {
  resultsByCopy: new Map(),
  processed: 0,
};
const COPY_KEY = fileURLToPath(import.meta.url);
if (!globalThis[EVENT_STATE_KEY]) {
  Object.defineProperty(globalThis, EVENT_STATE_KEY, {
    value: eventState,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

export function resetEventStateForTests() {
  eventState.resultsByCopy = new Map();
  eventState.processed = 0;
}

export function processedEventCountForTests() {
  return eventState.processed;
}

const SENTINEL_COMMAND = 'git config core.hooksPath agent-guard-probe';
const SENTINEL_RULE = 'custom.agent-guard-git/hooks-path';
// The tools whose commands the entry checks; every other tool passes.
const SHELL_TOOLS = new Set(['bash', 'powershell']);
const UNSAFE_NET_ENV = ['CC_SAFETY_NET_WORKTREE', 'SAFETY_NET_WORKTREE', 'CC_SAFETY_NET_AUDIT_HOME'];

const isDirectory = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/**
 * Collect the DISTINCT, existing-directory cwd candidates for a tool call.
 * Pi may surface the execution directory on event.input.cwd, event.cwd, or
 * ctx.cwd, and event.input is model-mutable — so we do NOT trust any single one
 * as authoritative. The checker runs against ALL of them and the worst result
 * wins, which is fail-safe whichever one bash actually uses. Non-string and
 * non-directory candidates are dropped here.
 */
function candidateCwds(event, ctx) {
  const raw = [event?.input?.cwd, event?.cwd, ctx && ctx.cwd];
  const seen = new Set();
  const dirs = [];
  for (const c of raw) {
    if (typeof c !== 'string' || c.length === 0 || seen.has(c)) continue;
    seen.add(c);
    if (isDirectory(c)) dirs.push(c);
  }
  return dirs;
}

/**
 * Announce filter-only operation when the protected shim's launch marker is
 * absent. This is a MISINSTALL DIAGNOSTIC, not a security control:
 *
 *   - The shim exports PI_SANDBOX_PROFILE_DIGEST in the same code path that
 *     applies the Seatbelt profile (sandbox/pi-sandbox-preamble.zsh), and the
 *     launcher execs Pi under `sandbox-exec`, so on the supported path the
 *     marker and real confinement travel together.
 *   - The marker is ambient, so a project .envrc/Makefile can set it and
 *     silence this line, and a stale exported value can outlive the shim
 *     session that produced it. ABSENCE OF THIS WARNING IS THEREFORE NOT PROOF
 *     OF CONFINEMENT. The preamble's own re-entry check deliberately refuses to
 *     trust this digest without behavioral probes; we cannot probe from here.
 *   - Wording says "could not verify" rather than "not detected" because an
 *     unrelated but valid Seatbelt profile would also lack this marker.
 *
 * Warn, never block: a missing OS sandbox is a different condition from an
 * unavailable checker, which the health check below covers.
 */
function warnIfUnverifiedSandbox() {
  if (process.env.PI_SANDBOX_PROFILE_DIGEST) return;
  // eslint-disable-next-line no-console
  console.error(
    'Agent Guard: FILTER-ONLY: could not verify launch through the protected ' +
      'Pi/OMP Seatbelt shim. The command checker is active; this guard is not applying an OS ' +
      'sandbox, so assume out-of-project writes are uncontained unless you know one ' +
      'is in place by other means. For the full guard, launch via the `pi` or `omp` shim on PATH ' +
      '(startup prints "OS sandbox ON"); `agent-guard bind` records which Pi or OMP the shim starts.',
  );
}

const releaseId = (v) =>
  typeof v === 'string' && v.length <= 100 && /^[0-9A-Za-z.+-]+$/.test(v) && v !== '.' && v !== '..' ? v : null;

/**
 * Find the pieces the launcher prepared: the release folder (cc-safety-net comes
 * from it) and the write-protected session copy of the checker's configuration.
 * Returns { release, copy } or { failure } with the reason every call is blocked.
 */
function locate() {
  let home;
  try {
    home = realpathSync(homedir());
  } catch {
    return { failure: 'the account home cannot be resolved' };
  }
  const engine = join(home, 'Library/Application Support/AgentGuard');
  const releases = join(engine, 'releases');
  let release = null;
  try {
    const named = releaseId(process.env.AGENT_GUARD_RELEASE);
    const dir = named ? join(releases, named) : realpathSync(join(engine, 'current'));
    if (dir.startsWith(releases + '/') && existsSync(join(dir, 'RELEASE'))) release = dir;
  } catch {
    // fall through to the failure below
  }
  if (!release) {
    return { failure: 'Agent Guard\'s release folder is missing; reinstall Agent Guard by rerunning its installer from Terminal outside any agent session, then relaunch' };
  }
  const named = process.env.CC_SAFETY_NET_HOME;
  let copy = null;
  try {
    if (named) {
      const real = realpathSync(named);
      if (real.startsWith(join(engine, 'state/pi') + '/') && existsSync(join(real, 'rules/rule.json'))) copy = real;
    }
  } catch {
    // an unreadable copy counts as missing
  }
  if (!copy) {
    return {
      unguarded: true,
      failure:
        'the checker\'s session copy is missing; start Pi or OMP through the protected shim (the `pi` or `omp` on PATH), which builds it at launch',
    };
  }
  return { release, copy };
}

/**
 * Load cc-safety-net's Pi entry with a stand-in Pi API and prove that Agent Guard's
 * Git rules are in force. cc-safety-net drops a rule source it cannot load and goes
 * on allowing, so the sentinel (docs/DESIGN.md section 5, Health) must be denied by
 * the hooks-path rule before any call is allowed.
 */
async function loadChecker() {
  const found = locate();
  if (found.failure) return { failure: found.failure, unguarded: found.unguarded === true };
  for (const name of UNSAFE_NET_ENV) delete process.env[name];
  if (!['strict', 'paranoid'].includes(process.env.CC_SAFETY_NET_LEVEL)) process.env.CC_SAFETY_NET_LEVEL = 'standard';
  process.env.CC_SAFETY_NET_PROJECT_TIGHTEN_ONLY = '1';
  process.env.CC_SAFETY_NET_HOME = found.copy;
  let handler = null;
  try {
    const entry = join(found.release, 'vendor/cc-safety-net/dist/pi/index.js');
    const module = await import(pathToFileURL(entry).href);
    const standIn = {
      on(type, h) {
        if (type === 'tool_call' && typeof h === 'function') handler = h;
      },
      // The entry's `cc-safety-net` command is not offered to Pi.
      registerCommand() {},
      sendUserMessage() {},
    };
    module.default(standIn);
  } catch {
    handler = null;
  }
  if (!handler) {
    return { failure: 'cc-safety-net failed to load; reinstall Agent Guard by rerunning its installer from Terminal outside any agent session, then relaunch' };
  }
  // The working folder can be deleted under a running session; process.cwd() then throws.
  let sessionCwd;
  try {
    sessionCwd = process.cwd();
  } catch {
    return { failure: 'the working folder no longer exists; relaunch Pi or OMP from an existing folder' };
  }
  const probeCwd = isDirectory(sessionCwd) ? sessionCwd : tmpdir();
  let probe;
  try {
    probe = await handler(
      { type: 'tool_call', toolName: 'bash', input: { command: SENTINEL_COMMAND } },
      checkerContext(null, probeCwd),
    );
  } catch {
    probe = null;
  }
  if (!(probe && probe.block === true && typeof probe.reason === 'string' && probe.reason.includes(`Rule: ${SENTINEL_RULE}`))) {
    return {
      failure:
        'cc-safety-net did not load Agent Guard\'s rules. Fix ~/.cc-safety-net/rules/rule.json (`npx cc-safety-net doctor` lists the problem), then relaunch',
    };
  }
  // Decision D18's repository check. The API reads the same session copy as the
  // entry; a release older than this extension has no check, and none is made.
  let checkCommand = null;
  let repositoryDelete = null;
  try {
    checkCommand = (await import(pathToFileURL(join(found.release, 'vendor/cc-safety-net/dist/api.js')).href)).checkCommand;
    repositoryDelete = (await import(pathToFileURL(join(found.release, 'checker/repository.mjs')).href)).repositoryDelete;
  } catch {
    repositoryDelete = null;
  }
  return { handler, copy: found.copy, checkCommand, repositoryDelete };
}

/** The entry reads ctx.cwd and ctx.sessionManager.getSessionId(). */
function checkerContext(ctx, cwd) {
  const c = Object.create(ctx && typeof ctx === 'object' ? ctx : null);
  Object.defineProperty(c, 'cwd', { value: cwd, enumerable: true });
  if (typeof ctx?.sessionManager?.getSessionId !== 'function') {
    Object.defineProperty(c, 'sessionManager', { value: { getSessionId: () => 'agent-guard' }, enumerable: true });
  }
  return c;
}

const block = (reason) => ({ block: true, reason });

// A start without the shim has no session copy; the agent is told what that means.
const UNGUARDED =
  'Agent Guard protects this computer from agent mistakes. Pi or OMP was started without it ' +
  '(the checker\'s session copy is missing), so tools are disabled. Restart it through Agent Guard ' +
  'to use it with protection: quit it and run pi or omp from a new terminal.';

// Decision D18: deleting a whole repository needs the user's approval. An answer that
// comes back sooner than a person can read the question is not the user's.
const CONFIRM_MIN_MS = 1500;

/** Ask before a command deletes `repository`; a block unless the user approves. */
async function confirmDelete(ctx, repository) {
  let home = '';
  try {
    home = realpathSync(homedir());
  } catch {
    // the full path is shown
  }
  const shown = home && repository.startsWith(home + '/') ? `~${repository.slice(home.length)}` : repository;
  const deny = (text) => block(`Agent Guard: this command deletes the repository ${shown} or its Git data. ${text}`);
  if (!ctx || ctx.hasUI !== true || typeof ctx.ui?.confirm !== 'function') {
    return deny('Agent Guard cannot ask the user in this session, so it was not run. The user can run it in a terminal outside Agent Guard.');
  }
  const started = Date.now();
  let approved = false;
  try {
    approved = (await ctx.ui.confirm('Agent Guard', `This command deletes the repository ${shown} or its Git data. Approve only if you asked for that.`)) === true;
  } catch {
    approved = false;
  }
  if (!approved) return deny('The user did not approve it, so it was not run. Do not delete it another way; report this to the user.');
  if (Date.now() - started < CONFIRM_MIN_MS) {
    return deny('The approval came back at once, which Agent Guard takes as automatic, so it was not run. It needs the user\'s own approval; the user can also run it in a terminal outside Agent Guard.');
  }
  return undefined;
}

// Added below a shell command's output that holds a Seatbelt denial, which names no
// guard. The same text as OpenCode's plugin; ps is setuid, and Seatbelt refuses such
// programs under any profile.
const SANDBOX_DENIAL = /operation not permitted/i;
const SANDBOX_NOTE =
  'Agent Guard: this session runs in Agent Guard\'s sandbox, which protects against agent mistakes. ' +
  'It blocks writes outside the allowed folders, reads of credentials and .env files, and the programs ' +
  'ps, open, launchctl and codesign. Do not work around it. The user can run the command in a terminal ' +
  'outside Agent Guard.';

// cc-safety-net's denial text reaches the agent under Agent Guard's name. The Rule
// line keeps cc-safety-net's rule ID.
const renamed = (text) => text.replace(/^BLOCKED by CC Safety Net/, 'Blocked by Agent Guard').replaceAll('CC Safety Net', 'Agent Guard');

/**
 * Pi extension default export.
 * @param {import('./pi-types').ExtensionAPI} pi
 */
export default function (pi) {
  warnIfUnverifiedSandbox();

  // Load once. If the checker cannot run, we do NOT silently allow: every tool
  // call is blocked with the reason, and the reason is announced at startup.
  let checker = { failure: 'the checker has not finished loading' };
  const ready = loadChecker()
    .then((c) => {
      checker = c;
      if (c.failure) {
        // eslint-disable-next-line no-console
        console.error(`Agent Guard: DEGRADED: ${c.failure}. All tool calls will be BLOCKED until fixed.`);
      }
    })
    .catch(() => {
      checker = { failure: 'cc-safety-net failed to load; reinstall Agent Guard by rerunning its installer from Terminal outside any agent session, then relaunch' };
    });

  const handleToolCall = async (event, ctx) => {
    await ready;

    // Checker unavailable (no session copy, cc-safety-net failed to load, or Agent
    // Guard's rules not in force): BLOCK EVERY tool call. A bricked agent is
    // visible and recoverable; a silently allowed destructive command is not.
    if (!checker.handler) {
      if (checker.unguarded) return block(UNGUARDED);
      return block(`Agent Guard: Guard unavailable: ${checker.failure}. All tool calls are blocked until the guard is restored.`);
    }

    // The session copy can disappear after startup; the checker would then go on
    // from what it loaded. Two stats per call keep that visible.
    if (!existsSync(join(checker.copy, 'rules/rule.json')) || !existsSync(join(checker.copy, 'rules/agent-guard-git/rulebook.json'))) {
      return block('Agent Guard: Guard unavailable: the checker\'s session copy is gone. All tool calls are blocked until the guard is restored; relaunch Pi or OMP.');
    }

    // Only shell tools go to the checker, as in OpenCode's plugin. File tools and
    // other tools pass: Seatbelt denies reads of .env files and the credential set.
    if (!event || typeof event !== 'object' || !SHELL_TOOLS.has(event.toolName)) return;

    // A genuinely empty bash invocation is a no-op.
    if (event.toolName === 'bash' && typeof event.input?.command === 'string' && event.input.command.trim().length === 0) {
      return;
    }

    // Run the entry against EVERY distinct candidate directory and take the worst
    // result. With no usable directory the entry sees the session's own cwd and
    // fails closed for the tools that need one.
    const cwds = candidateCwds(event, ctx);
    if (cwds.length === 0) cwds.push(ctx && typeof ctx.cwd === 'string' ? ctx.cwd : '');

    // The entry is contracted never to throw; a throw here would escape into Pi's
    // loop, so catch and fail closed.
    let worst;
    try {
      for (const cwd of cwds) {
        const result = await checker.handler(event, checkerContext(ctx, cwd));
        if (result && result.block) {
          worst = result;
          break;
        }
      }
    } catch {
      return block('Agent Guard: Guard errored; blocked as fail-safe.');
    }
    if (worst) return block(typeof worst.reason === 'string' ? renamed(worst.reason) : 'Blocked by Agent Guard.');
    if (typeof checker.repositoryDelete !== 'function' || typeof event.input?.command !== 'string') return undefined;
    let repository = null;
    try {
      repository = checker.repositoryDelete(checker.checkCommand, event.input.command, cwds);
    } catch {
      repository = null;
    }
    return repository ? confirmDelete(ctx, repository) : undefined;
  };

  // The sandbox note, when the launch applied Seatbelt and the checker is healthy.
  pi.on('tool_result', (event) => {
    if (!process.env.PI_SANDBOX_PROFILE_DIGEST || !checker.handler) return;
    if (!event || typeof event !== 'object' || !SHELL_TOOLS.has(event.toolName) || !Array.isArray(event.content)) return;
    const text = event.content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('\n');
    if (!SANDBOX_DENIAL.test(text) || text.includes(SANDBOX_NOTE)) return;
    const content = [...event.content, { type: 'text', text: `\n${SANDBOX_NOTE}` }];
    // Pi drops structured content when content is replaced without it.
    return event.structuredContent === undefined ? { content } : { content, structuredContent: event.structuredContent };
  });

  pi.on('tool_call', (event, ctx) => {
    if (!event || typeof event !== 'object') return handleToolCall(event, ctx);
    let copyResults = eventState.resultsByCopy.get(COPY_KEY);
    if (!copyResults) {
      copyResults = new WeakMap();
      eventState.resultsByCopy.set(COPY_KEY, copyResults);
    }
    const cached = copyResults.get(event);
    if (cached) return cached;
    eventState.processed += 1;
    const result = handleToolCall(event, ctx);
    copyResults.set(event, result);
    return result;
  });
}
