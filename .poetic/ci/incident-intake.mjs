// Standalone generated kit. No Poetic installation, AI calls, or dependency install required.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const START = '<!-- poetic-ci-incident:v1\n';
const END = '\n-->';
const RUN_START = '<!-- poetic-ci-run:v1\n';
const RESOLUTION_START = '<!-- poetic-ci-resolution:v1\n';
const POLICY = '.poetic/config/delivery-policy.json';
const FAILED = new Set(['failure', 'timed_out', 'action_required', 'startup_failure']);

export function readIncident(body) {
  const start = body?.indexOf(START) ?? -1;
  const end = body?.indexOf(END, start);
  if (start < 0 || end < 0) return undefined;
  try {
    const value = JSON.parse(body.slice(start + START.length, end));
    return value.version === 1 &&
      typeof value.signature === 'string' &&
      Array.isArray(value.scope) &&
      Array.isArray(value.runs) &&
      ['pending', 'active', 'needs-attention', 'awaiting-verification'].includes(value.status) &&
      Number.isInteger(value.attempts) &&
      value.attempts >= 0
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function incidentBody(state) {
  if (state.historyComplete && state.runs.length) {
    const ordered = [
      ...new Map(
        [...state.runs, ...(state.latest ? [state.latest] : [])].map((run) => [
          `${run.id}:${run.attempt}`,
          run,
        ])
      ).values(),
    ].sort((a, b) => a.id - b.id || a.attempt - b.attempt);
    state.latest = ordered.at(-1);
    state.runs = ordered.length === 1 ? ordered : [ordered[0], state.latest];
  }
  return (
    `Background CI failed in ${state.workflow}.\n\n` +
    'This signature groups failed job names; it is not a diagnosed root cause.\n' +
    'Record-only unless repair policy and the owner-provided executor are activated.\n' +
    'An owner may close this incident or update its owned state after inspecting the executor.\n\n' +
    (state.duplicateOf
      ? `Matching failure signature is tracked in #${state.duplicateOf}; this issue is not separately dispatched.\n\n`
      : '') +
    state.runs.map((run) => `${run.url} (${run.sha}; run attempt ${run.attempt})`).join('\n') +
    `\n\n${START}${JSON.stringify(state)}${END}\n`
  );
}

/** Keep owner-controlled status, budget and executor fields from the live body. */
async function writeEvidence(api, base, issue, observed, updates = {}, issueState) {
  const live = await api('GET', `${base}/issues/${issue.number}`);
  const current = live.user?.login === 'github-actions[bot]' && readIncident(live.body);
  if (!current || current.signature !== observed.signature)
    throw new Error('Incident state changed during evidence inspection.');
  const merged = {
    ...current,
    runs: [...current.runs, ...(current.latest ? [current.latest] : []), ...observed.runs],
    latest: observed.latest,
    historyComplete: current.historyComplete || observed.historyComplete,
    ...(observed.resolution && !current.resolution ? { resolution: observed.resolution } : {}),
    ...updates,
  };
  const body = incidentBody(merged);
  await api('PATCH', `${base}/issues/${issue.number}`, {
    body,
    ...(issueState ? { state: issueState } : {}),
  });
  Object.assign(observed, merged);
  issue.body = body;
  issue.state = issueState ?? live.state;
}

async function pages(api, endpoint, key, limit = 20) {
  const values = [];
  for (let page = 1; page <= limit; page++) {
    const response = await api(
      'GET',
      `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`
    );
    const batch = key ? response[key] : response;
    if (!Array.isArray(batch)) throw new Error('GitHub returned an incomplete inventory.');
    values.push(...batch);
    if (batch.length < 100) return values;
  }
  throw new Error(
    'GitHub inventory exceeds the bounded intake limit; owner inspection is required.'
  );
}

async function context(api, repository) {
  const repo = await api('GET', `/repos/${repository}`);
  if (repo.full_name?.toLowerCase() !== repository.toLowerCase() || !repo.default_branch)
    throw new Error('Source repository identity is unavailable.');
  const file = await api(
    'GET',
    `/repos/${repository}/contents/${POLICY}?ref=${encodeURIComponent(repo.default_branch)}`
  );
  const policy = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
  if (policy.schemaVersion !== 1 || !['existing', 'verified', 'fast'].includes(policy.profile))
    throw new Error('Delivery policy is unavailable or unsupported.');
  const background = policy.stages?.background?.githubActions;
  if (policy.repository && policy.repository.fullName?.toLowerCase() !== repository.toLowerCase())
    throw new Error('Delivery policy repository does not match the source.');
  if (
    policy.stages?.background?.owner !== 'github-actions' ||
    !background ||
    !Array.isArray(background.workflows) ||
    !Array.isArray(background.events)
  )
    throw new Error('Background workflows must be explicitly configured.');
  const head = await api(
    'GET',
    `/repos/${repository}/commits/${encodeURIComponent(repo.default_branch)}`
  );
  return { repo, policy, background, head: head.sha, base: `/repos/${repository}` };
}

async function ownedIssues(api, base, { workflow, signature } = {}) {
  const inventory = (
    await pages(
      api,
      `${base}/issues?state=all&creator=github-actions%5Bbot%5D`,
      undefined,
      Infinity
    )
  )
    .flatMap((issue) => {
      const state =
        !issue.pull_request &&
        issue.user?.login === 'github-actions[bot]' &&
        readIncident(issue.body);
      return state ? [{ issue, state, resolved: false }] : [];
    })
    .sort((a, b) => a.issue.number - b.issue.number);
  const openSignatures = new Set(
    inventory.filter((item) => item.issue.state === 'open').map((item) => item.state.signature)
  );
  const incidents = inventory.filter((item) =>
    workflow
      ? item.state.workflow === workflow &&
        (item.issue.state === 'open' || item.state.signature === signature)
      : item.issue.state === 'open' || openSignatures.has(item.state.signature)
  );
  for (const incident of incidents) {
    const { issue, state } = incident;
    const legacy = !state.historyComplete;
    for (const comment of legacy
      ? await pages(api, `${base}/issues/${issue.number}/comments`, undefined, Infinity)
      : []) {
      const resolutionStart = comment.body?.indexOf(RESOLUTION_START) ?? -1;
      if (
        issue.state === 'closed' &&
        comment.user?.login === 'github-actions[bot]' &&
        resolutionStart >= 0
      ) {
        try {
          const resolution = JSON.parse(
            comment.body.slice(
              resolutionStart + RESOLUTION_START.length,
              comment.body.indexOf(END, resolutionStart)
            )
          );
          if (
            resolution.attribution === 'source-check-evidence' &&
            typeof resolution.sha === 'string' &&
            JSON.stringify(resolution.scope) === JSON.stringify(state.failedScope)
          ) {
            incident.resolved = true;
            if (
              !incident.resolution ||
              resolution.runId > incident.resolution.runId ||
              (resolution.runId === incident.resolution.runId &&
                resolution.runAttempt > incident.resolution.runAttempt)
            )
              incident.resolution = resolution;
          }
        } catch {
          /* An unverified close never resets the episode budget. */
        }
      }
      if (!comment.body?.startsWith(RUN_START)) continue;
      try {
        const evidence = JSON.parse(
          comment.body.slice(RUN_START.length, comment.body.indexOf(END))
        );
        // Only GitHub Actions' bot authors the generated evidence. Human comments are not authority.
        if (comment.user?.login !== 'github-actions[bot]' || evidence.signature !== state.signature)
          continue;
        if (
          !state.runs.some(
            (run) => run.id === evidence.run.id && run.attempt === evidence.run.attempt
          )
        )
          state.runs.push(evidence.run);
      } catch {
        /* Uninterpretable comments are not execution inputs. */
      }
    }
    state.runs.sort((a, b) => a.id - b.id || a.attempt - b.attempt);
    state.latest = state.runs.at(-1);
    if (incident.resolution) state.resolution = incident.resolution;
    const resolution = state.resolution;
    if (
      issue.state === 'closed' &&
      resolution?.attribution === 'source-check-evidence' &&
      typeof resolution.sha === 'string' &&
      JSON.stringify(resolution.scope) === JSON.stringify(state.failedScope)
    ) {
      incident.resolved = true;
      incident.resolution = resolution;
    }
    if (legacy) {
      // The writers share one repository lock. Preserve budgets/reservations while
      // migrating complete relevant evidence into the issue body once.
      state.historyComplete = true;
      try {
        await writeEvidence(api, base, issue, state);
      } catch {
        // A failed compaction does not prevent processing already-read evidence.
      }
    }
  }
  return incidents;
}

async function resolveCoveredIncidents(api, ctx, run, jobs, incidents) {
  const errors = [];
  if (run.head_sha !== ctx.head) return errors;
  for (const { issue, state } of incidents.filter((item) => item.issue.state === 'open')) {
    if (!state.failedScope?.length || state.workflow !== run.path?.split('@')[0]) continue;
    const covered = state.failedScope.every(
      (scope) =>
        scope.steps.length &&
        jobs.filter((job) => job.name === scope.job).length &&
        jobs
          .filter((job) => job.name === scope.job)
          .every((job) =>
            scope.steps.every((name) =>
              job.steps?.some((step) => step.name === name && step.conclusion === 'success')
            )
          )
    );
    if (!covered) continue;
    try {
      const comparison = await api(
        'GET',
        `${ctx.base}/compare/${state.runs[0].sha}...${run.head_sha}`
      );
      if (!['ahead', 'identical'].includes(comparison.status)) continue;
      const resolution = {
        runId: run.id,
        runAttempt: run.run_attempt,
        sha: run.head_sha,
        url: run.html_url,
        scope: state.failedScope,
        attribution: 'source-check-evidence',
      };
      // Intake never rewrites dispatcher-owned budgets, even while resolving source evidence.
      await api('POST', `${ctx.base}/issues/${issue.number}/comments`, {
        body: `Verified original failing steps on current default branch.\n<!-- poetic-ci-resolution:v1\n${JSON.stringify(resolution)}${END}`,
      });
      await writeEvidence(api, ctx.base, issue, state, { resolution }, 'closed');
      issue.state = 'closed';
    } catch (error) {
      // Older verification failures must not discard the current run's failure evidence.
      errors.push({ incident: issue.number, message: error.message });
    }
  }
  return errors;
}

/** Trusted workflow_run intake. The API is injectable for hermetic tests. */
export async function handleIncident(api, event, env) {
  const repository = env.GITHUB_REPOSITORY;
  if (event.action !== 'completed' || !event.workflow_run?.id) return { status: 'ignored' };
  const ctx = await context(api, repository);
  const run = await api('GET', `${ctx.base}/actions/runs/${event.workflow_run.id}`);
  if (
    run.id !== event.workflow_run.id ||
    typeof run.head_sha !== 'string' ||
    run.repository?.full_name?.toLowerCase() !== repository.toLowerCase() ||
    run.head_repository?.full_name?.toLowerCase() !== repository.toLowerCase() ||
    run.head_branch !== ctx.repo.default_branch ||
    run.status !== 'completed' ||
    !['push', 'schedule', 'workflow_dispatch'].includes(run.event) ||
    !ctx.background.events.includes(run.event)
  )
    return { status: 'ignored' };
  const workflow = await api('GET', `${ctx.base}/actions/workflows/${run.workflow_id}`);
  if (
    workflow.id !== run.workflow_id ||
    !ctx.background.workflows.includes(workflow.path) ||
    (ctx.background.ref &&
      ctx.background.ref.replace(/^refs\/heads\//, '') !== ctx.repo.default_branch)
  )
    return { status: 'ignored' };
  const jobs = await pages(
    api,
    `${ctx.base}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`,
    'jobs'
  );
  const selected = ctx.background.selectedChecks ?? [];
  const failed = [
    ...new Set(
      jobs
        .filter(
          (job) => FAILED.has(job.conclusion) && (!selected.length || selected.includes(job.name))
        )
        .map((job) => job.name)
    ),
  ].sort();
  const failedScope = failed.map((name) => ({
    job: name,
    steps: [
      ...new Set(
        jobs
          .filter((job) => job.name === name)
          .flatMap((job) =>
            (job.steps ?? []).filter((step) => FAILED.has(step.conclusion)).map((step) => step.name)
          )
      ),
    ].sort(),
  }));
  const signature = createHash('sha256')
    .update(JSON.stringify([workflow.path, failedScope]))
    .digest('hex');
  const incidents = await ownedIssues(api, ctx.base, { workflow: workflow.path, signature });
  const resolutionErrors = await resolveCoveredIncidents(
    api,
    ctx,
    { ...run, path: workflow.path },
    jobs,
    incidents
  );
  const finish = (result) => (resolutionErrors.length ? { ...result, resolutionErrors } : result);
  if (!failed.length) {
    if (run.conclusion === 'success' && run.head_sha === ctx.head) {
      for (const { issue, state } of incidents.filter(
        (item) => item.issue.state === 'open' && item.state.workflow === workflow.path
      )) {
        if (
          !state.scope.every((name) => {
            const matching = jobs.filter((job) => job.name === name);
            return matching.length && matching.every((job) => job.conclusion === 'success');
          })
        )
          continue;
        if (state.coverageObserved) continue;
        await api('POST', `${ctx.base}/issues/${issue.number}/comments`, {
          body: `Passing coverage observed for the incident job scope at ${run.head_sha}: ${run.html_url}. Owner verification is still required.`,
        });
        await writeEvidence(api, ctx.base, issue, state, { coverageObserved: true });
      }
    }
    return finish({ status: 'recorded-coverage' });
  }
  if (
    incidents.some(
      (item) =>
        item.resolved &&
        item.state.signature === signature &&
        (item.resolution.runId > run.id ||
          (item.resolution.runId === run.id &&
            (item.resolution.runAttempt ?? 1) >= run.run_attempt))
    )
  )
    return finish({ status: 'resolved-delivery' });
  const existing = incidents.find((item) => !item.resolved && item.state.signature === signature);
  const evidence = { id: run.id, attempt: run.run_attempt, sha: run.head_sha, url: run.html_url };
  if (
    existing &&
    (existing.state.runs.some((item) => item.id === run.id && item.attempt === run.run_attempt) ||
      (existing.state.historyComplete &&
        existing.state.latest &&
        (existing.state.latest.id > run.id ||
          (existing.state.latest.id === run.id &&
            existing.state.latest.attempt >= run.run_attempt))))
  )
    return finish({ status: 'duplicate', incident: existing.issue.number });
  const state = existing?.state ?? {
    version: 1,
    signature,
    workflow: workflow.path,
    scope: failed,
    status: 'pending',
    attempts: 0,
    runs: [],
    failedScope,
    historyComplete: true,
  };
  if (existing) {
    // Serialized evidence updates preserve the current reservation and budget.
    state.runs.push(evidence);
    await writeEvidence(api, ctx.base, existing.issue, state);
    if (existing.issue.state === 'closed')
      await api('PATCH', `${ctx.base}/issues/${existing.issue.number}`, { state: 'open' });
    return finish({ status: 'recorded', incident: existing.issue.number });
  }
  state.runs.push(evidence);
  state.latest = evidence;
  const issue = await api('POST', `${ctx.base}/issues`, {
    title: `CI incident: ${workflow.path} (${failed.join(', ')})`,
    body: incidentBody(state),
  });
  return finish({ status: 'recorded', incident: issue.number });
}

/** Run only inside the generated repository-wide serialized dispatcher job. */
export async function dispatchIncident(api, env) {
  if (
    env.POETIC_REPAIR_DISPATCH_ENABLED !== 'true' ||
    !env.POETIC_REPAIR_WORKFLOW ||
    env.POETIC_REPAIR_CALLBACK_CONFIGURED !== 'true'
  )
    return { status: 'record-only' };
  const ctx = await context(api, env.GITHUB_REPOSITORY);
  if (ctx.policy.repair?.enabled !== true) return { status: 'record-only' };
  const allIncidents = await ownedIssues(api, ctx.base);
  const incidents = allIncidents.filter((item) => item.issue.state === 'open');
  if (incidents.some((item) => ['active', 'needs-attention'].includes(item.state.status)))
    return { status: 'executor-busy' };
  const max = ctx.policy.repair.maxCandidateAttempts ?? 2;
  if (!Number.isInteger(max) || max < 1 || max > 10)
    throw new Error('Unsupported repair attempt budget.');
  // Concurrent distinct source runs can create duplicate signatures. Only the oldest issue is eligible.
  const canonical = incidents.filter(
    (item, index) =>
      incidents.findIndex((other) => other.state.signature === item.state.signature) === index
  );
  for (const item of canonical) {
    const same = allIncidents.filter(
      (other) => !other.resolved && other.state.signature === item.state.signature
    );
    item.state.attempts = Math.max(...same.map((other) => other.state.attempts));
    item.state.latest = same
      .map((other) => other.state.latest)
      .sort((a, b) => b.id - a.id || b.attempt - a.attempt)[0];
    for (const duplicate of same.filter(
      (other) =>
        other.issue.state === 'open' &&
        other.issue.number !== item.issue.number &&
        other.state.duplicateOf !== item.issue.number
    )) {
      duplicate.state.duplicateOf = item.issue.number;
      duplicate.state.status = 'awaiting-verification';
      await api('PATCH', `${ctx.base}/issues/${duplicate.issue.number}`, {
        body: incidentBody(duplicate.state),
      });
    }
  }
  const candidate = canonical.find(
    ({ state }) =>
      state.status === 'pending' &&
      state.latest?.sha === ctx.head &&
      state.attempts < max &&
      ctx.background.workflows.includes(state.workflow)
  );
  if (!candidate) return { status: 'no-eligible-incident' };
  const source = await api('GET', `${ctx.base}/actions/runs/${candidate.state.latest.id}`);
  const sourceWorkflow = await api('GET', `${ctx.base}/actions/workflows/${source.workflow_id}`);
  if (
    source.head_sha !== ctx.head ||
    source.head_sha !== candidate.state.latest.sha ||
    source.head_branch !== ctx.repo.default_branch ||
    source.status !== 'completed' ||
    source.repository?.full_name?.toLowerCase() !== env.GITHUB_REPOSITORY.toLowerCase() ||
    source.head_repository?.full_name?.toLowerCase() !== env.GITHUB_REPOSITORY.toLowerCase() ||
    !['push', 'schedule', 'workflow_dispatch'].includes(source.event) ||
    !ctx.background.events.includes(source.event) ||
    sourceWorkflow.path !== candidate.state.workflow ||
    sourceWorkflow.id !== source.workflow_id
  )
    return { status: 'source-no-longer-eligible' };
  const jobs = await pages(
    api,
    `${ctx.base}/actions/runs/${source.id}/attempts/${source.run_attempt}/jobs`,
    'jobs'
  );
  if (
    !candidate.state.scope.every((name) =>
      jobs.some((job) => job.name === name && FAILED.has(job.conclusion))
    )
  )
    return { status: 'source-no-longer-failing' };
  const executor = await api(
    'GET',
    `${ctx.base}/actions/workflows/${encodeURIComponent(env.POETIC_REPAIR_WORKFLOW.split('/').at(-1))}`
  );
  if (executor.path !== env.POETIC_REPAIR_WORKFLOW || executor.state !== 'active')
    throw new Error('Owner-provided executor workflow is not active.');
  // All kit writers share the workflow concurrency group. Re-read for external closure
  // or default-branch movement during API inspection before reserving paid execution.
  const live = await api('GET', `${ctx.base}/issues/${candidate.issue.number}`);
  const liveState = live.user?.login === 'github-actions[bot]' && readIncident(live.body);
  const head = await api(
    'GET',
    `${ctx.base}/commits/${encodeURIComponent(ctx.repo.default_branch)}`
  );
  if (
    live.state !== 'open' ||
    !liveState ||
    liveState.signature !== candidate.state.signature ||
    liveState.status !== 'pending' ||
    liveState.attempts !== readIncident(candidate.issue.body)?.attempts ||
    head.sha !== ctx.head
  )
    return { status: 'incident-no-longer-eligible' };
  candidate.state.attempts++;
  candidate.state.status = 'active';
  candidate.state.executor = executor.path;
  // GitHub run created_at has second precision; keep the reservation at the same precision.
  candidate.state.reservedAt = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  // Persist the reservation before dispatch. Unknown outcomes never trigger automatic retry.
  await api('PATCH', `${ctx.base}/issues/${candidate.issue.number}`, {
    body: incidentBody(candidate.state),
  });
  try {
    await api('POST', `${ctx.base}/actions/workflows/${executor.id}/dispatches`, {
      ref: ctx.repo.default_branch,
      inputs: {
        incident_number: String(candidate.issue.number),
        failure_run_id: String(candidate.state.latest.id),
        failed_sha: candidate.state.latest.sha,
        attempt: String(candidate.state.attempts),
      },
    });
  } catch (error) {
    candidate.state.status = 'needs-attention';
    await api('PATCH', `${ctx.base}/issues/${candidate.issue.number}`, {
      body: incidentBody(candidate.state),
    });
    throw error;
  }
  return {
    status: 'dispatched',
    incident: candidate.issue.number,
    attempt: candidate.state.attempts,
  };
}

/** Authenticated owner/executor workflow_dispatch callback, never an issue-comment trigger. */
export async function reconcileIncident(api, event, env) {
  const input = event.inputs;
  if (
    !input ||
    !['retry', 'needs-decision'].includes(input.outcome) ||
    !/^\d+$/.test(input.incident_number) ||
    !/^\d+$/.test(input.expected_attempt) ||
    !/^\d+$/.test(input.executor_run_id)
  )
    throw new Error('Invalid executor completion inputs.');
  const ctx = await context(api, env.GITHUB_REPOSITORY);
  const issue = await api('GET', `${ctx.base}/issues/${input.incident_number}`);
  const state = issue.user?.login === 'github-actions[bot]' && readIncident(issue.body);
  if (
    !state ||
    issue.state !== 'open' ||
    state.status !== 'active' ||
    state.attempts !== Number(input.expected_attempt) ||
    state.executor !== env.POETIC_REPAIR_WORKFLOW
  )
    throw new Error('The callback does not match the active reserved attempt.');
  const run = await api('GET', `${ctx.base}/actions/runs/${input.executor_run_id}`);
  const workflow = await api('GET', `${ctx.base}/actions/workflows/${run.workflow_id}`);
  if (
    run.status !== 'completed' ||
    run.event !== 'workflow_dispatch' ||
    run.repository?.full_name?.toLowerCase() !== env.GITHUB_REPOSITORY.toLowerCase() ||
    run.head_repository?.full_name?.toLowerCase() !== env.GITHUB_REPOSITORY.toLowerCase() ||
    run.head_branch !== ctx.repo.default_branch ||
    workflow.path !== state.executor ||
    workflow.id !== run.workflow_id ||
    Date.parse(run.created_at) < Date.parse(state.reservedAt) ||
    !Number.isFinite(Date.parse(run.created_at)) ||
    !Number.isFinite(Date.parse(state.reservedAt))
  )
    throw new Error(
      'Completed executor evidence is unavailable or does not match the reservation.'
    );
  if (input.repair_pr) {
    if (!/^\d+$/.test(input.repair_pr)) throw new Error('Invalid repair PR.');
    const pr = await api('GET', `${ctx.base}/pulls/${input.repair_pr}`);
    if (
      pr.head?.repo?.full_name?.toLowerCase() !== env.GITHUB_REPOSITORY.toLowerCase() ||
      pr.base?.ref !== ctx.repo.default_branch
    )
      throw new Error('Repair PR source does not match.');
    const checks = await pages(api, `${ctx.base}/commits/${pr.head.sha}/check-runs`, 'check_runs');
    state.candidate = {
      pr: pr.number,
      sha: pr.head.sha,
      checks: checks.map((check) => ({
        name: check.name,
        conclusion: check.conclusion,
        status: check.status,
      })),
    };
  }
  state.completion = { runId: run.id, url: run.html_url, conclusion: run.conclusion };
  const limit = ctx.policy.repair?.maxCandidateAttempts ?? 2;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10)
    throw new Error('Unsupported repair attempt budget.');
  state.status =
    input.outcome === 'retry' && ctx.policy.repair?.enabled === true && state.attempts < limit
      ? 'pending'
      : 'needs-attention';
  await api('PATCH', `${ctx.base}/issues/${issue.number}`, { body: incidentBody(state) });
  return { status: state.status, incident: issue.number, attempt: state.attempts };
}

/** A recorded failure does not authorize dispatch while older resolution is unavailable. */
export function incidentExitCode(result) {
  return result.resolutionErrors?.length ? 1 : 0;
}

async function main() {
  const env = process.env;
  const api = async (method, endpoint, body) => {
    const response = await fetch(`${env.GITHUB_API_URL ?? 'https://api.github.com'}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok)
      throw new Error(`GitHub request failed: ${method} ${endpoint} (${response.status}).`);
    return response.status === 204 ? {} : response.json();
  };
  const result =
    process.argv[2] === 'dispatch'
      ? await dispatchIncident(api, env)
      : await (process.argv[2] === 'reconcile' ? reconcileIncident : handleIncident)(
          api,
          JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8')),
          env
        );
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = incidentExitCode(result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
