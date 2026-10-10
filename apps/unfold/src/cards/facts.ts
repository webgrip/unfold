/** A gate on a board's delivery path (Ploeg ADR-0051). */
export type FactsGate = 'development' | 'test' | 'acceptance' | 'done';
/** A tracker parent of a Work Item, as Ploeg last read it. */
export type FactsEpic = { provider: string; externalId: string; title: string; firstSeenAt: string; lastSeenAt: string; removedAt: string | null };
/** One withdrawal of the Work Item from Ploeg's audit log. */
export type FactsWithdrawal = { at: string; actor: string };
/** The Work Item a facts document describes. */
export type FactsWorkItem = {
  id: string; provider: string; externalId: string; externalRef: string; url: string; title: string; state: string; team: string;
  createdAt: string; updatedAt: string; trackerCreatedAt: string | null; estimateSeconds: number | null;
  target: { forge: string; owner: string; repo: string; baseBranch: string } | null; epics: FactsEpic[]; withdrawals: FactsWithdrawal[];
};
/** A Shift, in the operator API's shape. */
export type FactsShift = { id: string; workItemId: string; team: string; branch: string; round: number; budgetUsd: number; spentUsd: number; reservedUsd: number; openedAt: string; closedAt: string | null; closeReason: string };
/** A Run's usage; every figure is absent when the harness did not report it. */
export type FactsUsage = Partial<Record<'inputTokens' | 'outputTokens' | 'costUsd' | 'cacheReadInputTokens' | 'cacheCreationInputTokens' | 'turns' | 'toolCalls', number>>;
/** A Run, with the fields a card reads from the operator API's run shape. */
export type FactsRun = { id: string; shiftId: string | null; role: string; round: number; writes: boolean; state: 'pending' | 'running' | 'finished'; startedAt: string | null; finishedAt: string | null; outcome: string | null; links: string[]; authorizedUsd: number; usage: FactsUsage | null };
/** What the gateway recorded so far for one running Run. */
export type FactsLiveUsage = { runId: string; observedAt: string; costUsd: number; inputTokens: number; outputTokens: number };
/** One job of a CI run. */
export type FactsCIJob = { name: string; status: string; startedAt?: string; completedAt?: string; queuedSeconds?: number; attempt: number };
/** One CI run of a pull request. */
export type FactsCIRun = { key: string; headSha: string; workflow: string; status: string; createdAt: string | null; startedAt: string | null; completedAt: string | null; jobs: FactsCIJob[] };
/** One review the forge reported. */
export type FactsReview = { reviewer: string; state: string | null; headSha: string | null; receivedAt: string };
/** One conversation event of a pull request; no text is kept. */
export type FactsEvent = { kind: string; actor: string; at: string; state: string | null; headSha: string | null };
/** The raw indentation measurements of one changed file. */
export type FactsIndentation = { method: string; unit: number; added: number; removed: number; maxDepth: number };
/** One file a merged pull request changed. */
export type FactsFile = { path: string; additions: number | null; deletions: number | null; indentation: FactsIndentation | null };
/** One path an open pull request changes at its head. */
export type FactsChangedPath = { path: string; status: string; previousPath?: string };
/** A merged pull request that reverted this one. */
export type FactsRevert = { forge: string; owner: string; repo: string; number: number; mergeCommitSha: string | null; mergedAt: string | null; mergedBy: string | null; matchedBy: string; detectedAt: string };
/** The first deploy of one environment that carried a pull request's merge commit. */
export type FactsDeployment = { environment: string; firstDeployedAt: string; sha: string; deployedAt: string; url: string | null; source: string | null };
/** One pull request of the Work Item, with every fact Ploeg stored about it. */
export type FactsPullRequest = {
  id: string; forge: string; owner: string; repo: string; number: number; url: string; shiftId: string | null; branch: string | null; baseBranch: string | null;
  state: 'open' | 'merged' | 'closed' | null; draft: boolean | null; author: string | null; headSha: string | null; mergeCommitSha: string | null;
  openedAt: string | null; firstSeenAt: string; mergedAt: string | null; mergedBy: string | null; closedAt: string | null; updatedAt: string;
  additions: number | null; deletions: number | null; changedFiles: number | null; labels: string[] | null;
  commits: number | null; firstCommitAt: string | null; forcePushes: number | null; activityCapturedAt: string | null; activityTruncated: boolean | null;
  commitStatus: { state: string; checks: { context: string; state: string }[]; headSha: string; capturedAt: string } | null;
  ciRunsCapturedAt: string | null; ciRunsSource: string | null; ciRunsTruncated: boolean | null; ciRuns: FactsCIRun[];
  reviews: FactsReview[]; events: FactsEvent[];
  filesCapturedAt: string | null; filesTruncated: boolean | null; files: FactsFile[];
  changedPaths: { headSha: string; truncated: boolean; capturedAt: string; paths: FactsChangedPath[] } | null;
  reverts: FactsRevert[]; deployments: FactsDeployment[];
};
/** One move into a tracker status. */
export type FactsStatusTransition = { status: string; gate: FactsGate | null; at: string; observed: boolean; receivedAt: string };
/** One move into another delivery gate. */
export type FactsGateTransition = { gate: FactsGate; status: string; actor: string | null; reason: string | null; at: string; receivedAt: string };
/** An environment a pull request's repository has reported any deploy of. */
export type FactsDeployEnvironment = { forge: string; owner: string; repo: string; environment: string; firstDeployedAt: string };
/** A login the facts name, with what it did. */
export type FactsRosterEntry = { login: string; roles: string[] };
/** The delivery facts of one Work Item (Ploeg ADR-0079, operator API `workItemFacts`): what Ploeg stored, with no derived figure. */
export type WorkItemFacts = {
  workItem: FactsWorkItem; activityAt: string; shifts: FactsShift[]; runs: FactsRun[]; liveUsage: FactsLiveUsage[]; pullRequests: FactsPullRequest[];
  statusTransitions: FactsStatusTransition[]; gateTransitions: FactsGateTransition[]; deployEnvironments: FactsDeployEnvironment[];
  roster: FactsRosterEntry[]; botLogins: string[];
  truncated: { shifts: boolean; runs: boolean; pullRequests: boolean; statusTransitions: boolean; gateTransitions: boolean };
};
/** A page of the facts list, newest activity first. */
export type FactsPage = { facts: WorkItemFacts[]; nextBefore: string | null };

/** A facts document that does not have the contract's shape; `path` names the first field that failed. */
export class FactsError extends Error {
  readonly path: string;
  constructor(path: string, message: string) { super(`${path}: ${message}`); this.path = path; this.name = 'FactsError'; }
}

type Json = Record<string, unknown>;
const idPattern = /^[1-9][0-9]{0,18}$/;
const gates: FactsGate[] = ['development', 'test', 'acceptance', 'done'];
const timePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function fail(path: string, message: string): never { throw new FactsError(path, message); }
function object(value: unknown, path: string): Json { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object'); return value as Json; }
function text(value: unknown, path: string, max = 65_536): string { if (typeof value !== 'string' || value.length > max || value.includes('\0')) fail(path, 'must be text'); return value; }
function maybeText(value: unknown, path: string, max = 65_536): string | null { return value === null || value === undefined ? null : text(value, path, max); }
function id(value: unknown, path: string): string { const v = text(value, path, 19); if (!idPattern.test(v)) fail(path, 'must be an identifier'); return v; }
function maybeId(value: unknown, path: string): string | null { return value === null || value === undefined ? null : id(value, path); }
function time(value: unknown, path: string): string {
  const v = text(value, path, 64);
  const at = Date.parse(v);
  if (!timePattern.test(v) || !Number.isFinite(at)) fail(path, 'must be an RFC 3339 time');
  const zone = /(Z|([+-])(\d{2}):(\d{2}))$/.exec(v)!;
  const offset = zone[1] === 'Z' ? 0 : (zone[2] === '-' ? -1 : 1) * (Number(zone[3]) * 60 + Number(zone[4]));
  if (new Date(at + offset * 60_000).toISOString().slice(0, 19) !== v.slice(0, 19)) fail(path, 'must be an RFC 3339 time');
  return v;
}
function maybeTime(value: unknown, path: string): string | null { return value === null || value === undefined ? null : time(value, path); }
function count(value: unknown, path: string): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(path, 'must be a whole number'); return value; }
function maybeCount(value: unknown, path: string): number | null { return value === null || value === undefined ? null : count(value, path); }
function amount(value: unknown, path: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a number'); return value; }
function flag(value: unknown, path: string): boolean { if (typeof value !== 'boolean') fail(path, 'must be true or false'); return value; }
function maybeFlag(value: unknown, path: string): boolean | null { return value === null || value === undefined ? null : flag(value, path); }
function list<T>(value: unknown, path: string, parse: (entry: unknown, path: string) => T, max = 5000): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) fail(path, `must be a list of at most ${max}`);
  return value.map((entry, index) => parse(entry, `${path}[${index}]`));
}
function oneOf<T extends string>(value: unknown, path: string, allowed: readonly T[]): T { if (!allowed.includes(value as T)) fail(path, `must be one of ${allowed.join(', ')}`); return value as T; }
function maybeOneOf<T extends string>(value: unknown, path: string, allowed: readonly T[]): T | null { return value === null || value === undefined ? null : oneOf(value, path, allowed); }

function epic(value: unknown, path: string): FactsEpic {
  const d = object(value, path);
  return { provider: text(d.provider, `${path}.provider`, 64), externalId: text(d.externalId, `${path}.externalId`, 256), title: text(d.title ?? '', `${path}.title`, 4096), firstSeenAt: time(d.firstSeenAt, `${path}.firstSeenAt`), lastSeenAt: time(d.lastSeenAt ?? d.firstSeenAt, `${path}.lastSeenAt`), removedAt: maybeTime(d.removedAt, `${path}.removedAt`) };
}
function workItem(value: unknown, path: string): FactsWorkItem {
  const d = object(value, path);
  const target = d.target === null || d.target === undefined ? null : object(d.target, `${path}.target`);
  return {
    id: id(d.id, `${path}.id`), provider: text(d.provider, `${path}.provider`, 64), externalId: text(d.externalId ?? '', `${path}.externalId`, 256), externalRef: text(d.externalRef ?? '', `${path}.externalRef`, 512),
    url: text(d.url ?? '', `${path}.url`, 4096), title: text(d.title ?? '', `${path}.title`, 4096), state: text(d.state, `${path}.state`, 32), team: text(d.team, `${path}.team`, 100),
    createdAt: time(d.createdAt, `${path}.createdAt`), updatedAt: time(d.updatedAt ?? d.createdAt, `${path}.updatedAt`), trackerCreatedAt: maybeTime(d.trackerCreatedAt, `${path}.trackerCreatedAt`), estimateSeconds: maybeCount(d.estimateSeconds, `${path}.estimateSeconds`),
    target: target ? { forge: text(target.forge, `${path}.target.forge`, 64), owner: text(target.owner, `${path}.target.owner`, 256), repo: text(target.repo, `${path}.target.repo`, 256), baseBranch: text(target.baseBranch ?? '', `${path}.target.baseBranch`, 512) } : null,
    epics: list(d.epics, `${path}.epics`, epic, 50), withdrawals: list(d.withdrawals, `${path}.withdrawals`, (e, p) => { const w = object(e, p); return { at: time(w.at, `${p}.at`), actor: text(w.actor ?? '', `${p}.actor`, 512) }; }, 20),
  };
}
function shift(value: unknown, path: string): FactsShift {
  const d = object(value, path);
  return { id: id(d.id, `${path}.id`), workItemId: id(d.workItemId, `${path}.workItemId`), team: text(d.team ?? '', `${path}.team`, 100), branch: text(d.branch ?? '', `${path}.branch`, 1024), round: count(d.round ?? 0, `${path}.round`), budgetUsd: amount(d.budgetUsd ?? 0, `${path}.budgetUsd`), spentUsd: amount(d.spentUsd ?? 0, `${path}.spentUsd`), reservedUsd: amount(d.reservedUsd ?? 0, `${path}.reservedUsd`), openedAt: time(d.openedAt, `${path}.openedAt`), closedAt: maybeTime(d.closedAt, `${path}.closedAt`), closeReason: text(d.closeReason ?? '', `${path}.closeReason`, 4096) };
}
const usageKeys = ['inputTokens', 'outputTokens', 'costUsd', 'cacheReadInputTokens', 'cacheCreationInputTokens', 'turns', 'toolCalls'] as const;
function usage(value: unknown, path: string): FactsUsage | null {
  if (value === null || value === undefined) return null;
  const d = object(value, path);
  const out: FactsUsage = {};
  for (const key of usageKeys) if (d[key] !== undefined && d[key] !== null) out[key] = key === 'costUsd' ? amount(d[key], `${path}.${key}`) : count(d[key], `${path}.${key}`);
  return out;
}
function run(value: unknown, path: string): FactsRun {
  const d = object(value, path);
  return {
    id: id(d.id, `${path}.id`), shiftId: maybeId(d.shiftId, `${path}.shiftId`), role: text(d.role ?? '', `${path}.role`, 64), round: count(d.round ?? 0, `${path}.round`), writes: flag(d.writes ?? false, `${path}.writes`),
    state: oneOf(d.state, `${path}.state`, ['pending', 'running', 'finished'] as const), startedAt: maybeTime(d.startedAt, `${path}.startedAt`), finishedAt: maybeTime(d.finishedAt, `${path}.finishedAt`),
    outcome: maybeText(d.outcome, `${path}.outcome`, 64), links: list(d.links, `${path}.links`, (l, p) => text(l, p, 4096), 1000), authorizedUsd: amount(d.authorizedUsd ?? 0, `${path}.authorizedUsd`), usage: usage(d.usage, `${path}.usage`),
  };
}
function liveUsage(value: unknown, path: string): FactsLiveUsage {
  const d = object(value, path);
  return { runId: id(d.runId, `${path}.runId`), observedAt: time(d.observedAt, `${path}.observedAt`), costUsd: amount(d.costUsd, `${path}.costUsd`), inputTokens: count(d.inputTokens, `${path}.inputTokens`), outputTokens: count(d.outputTokens, `${path}.outputTokens`) };
}
function ciRun(value: unknown, path: string): FactsCIRun {
  const d = object(value, path);
  return {
    key: text(d.key, `${path}.key`, 512), headSha: text(d.headSha ?? '', `${path}.headSha`, 128), workflow: text(d.workflow ?? '', `${path}.workflow`, 512), status: text(d.status, `${path}.status`, 32),
    createdAt: maybeTime(d.createdAt, `${path}.createdAt`), startedAt: maybeTime(d.startedAt, `${path}.startedAt`), completedAt: maybeTime(d.completedAt, `${path}.completedAt`),
    jobs: list(d.jobs, `${path}.jobs`, (j, p) => {
      const job = object(j, p);
      return { name: text(job.name ?? '', `${p}.name`, 512), status: text(job.status ?? '', `${p}.status`, 32), ...(job.startedAt === undefined || job.startedAt === null ? {} : { startedAt: time(job.startedAt, `${p}.startedAt`) }), ...(job.completedAt === undefined || job.completedAt === null ? {} : { completedAt: time(job.completedAt, `${p}.completedAt`) }), ...(job.queuedSeconds === undefined || job.queuedSeconds === null ? {} : { queuedSeconds: count(job.queuedSeconds, `${p}.queuedSeconds`) }), attempt: count(job.attempt ?? 0, `${p}.attempt`) };
    }, 100),
  };
}
function file(value: unknown, path: string): FactsFile {
  const d = object(value, path);
  const indentation = d.indentation === null || d.indentation === undefined ? null : object(d.indentation, `${path}.indentation`);
  return {
    path: text(d.path, `${path}.path`, 1024), additions: maybeCount(d.additions, `${path}.additions`), deletions: maybeCount(d.deletions, `${path}.deletions`),
    indentation: indentation ? { method: text(indentation.method, `${path}.indentation.method`, 64), unit: count(indentation.unit, `${path}.indentation.unit`), added: count(indentation.added, `${path}.indentation.added`), removed: count(indentation.removed, `${path}.indentation.removed`), maxDepth: count(indentation.maxDepth, `${path}.indentation.maxDepth`) } : null,
  };
}
function pullRequest(value: unknown, path: string): FactsPullRequest {
  const d = object(value, path);
  const p = (key: string) => `${path}.${key}`;
  const status = d.commitStatus === null || d.commitStatus === undefined ? null : object(d.commitStatus, p('commitStatus'));
  const changed = d.changedPaths === null || d.changedPaths === undefined ? null : object(d.changedPaths, p('changedPaths'));
  const number = count(d.number, p('number'));
  if (number < 1) fail(p('number'), 'must be at least 1');
  return {
    id: id(d.id, p('id')), forge: text(d.forge, p('forge'), 64), owner: text(d.owner, p('owner'), 256), repo: text(d.repo, p('repo'), 256), number, url: text(d.url ?? '', p('url'), 4096),
    shiftId: maybeId(d.shiftId, p('shiftId')), branch: maybeText(d.branch, p('branch'), 1024), baseBranch: maybeText(d.baseBranch, p('baseBranch'), 1024),
    state: maybeOneOf(d.state, p('state'), ['open', 'merged', 'closed'] as const), draft: maybeFlag(d.draft, p('draft')), author: maybeText(d.author, p('author'), 256),
    headSha: maybeText(d.headSha, p('headSha'), 128), mergeCommitSha: maybeText(d.mergeCommitSha, p('mergeCommitSha'), 128),
    openedAt: maybeTime(d.openedAt, p('openedAt')), firstSeenAt: time(d.firstSeenAt, p('firstSeenAt')), mergedAt: maybeTime(d.mergedAt, p('mergedAt')), mergedBy: maybeText(d.mergedBy, p('mergedBy'), 256), closedAt: maybeTime(d.closedAt, p('closedAt')), updatedAt: time(d.updatedAt ?? d.firstSeenAt, p('updatedAt')),
    additions: maybeCount(d.additions, p('additions')), deletions: maybeCount(d.deletions, p('deletions')), changedFiles: maybeCount(d.changedFiles, p('changedFiles')),
    labels: d.labels === null || d.labels === undefined ? null : list(d.labels, p('labels'), (l, lp) => text(l, lp, 256), 100),
    commits: maybeCount(d.commits, p('commits')), firstCommitAt: maybeTime(d.firstCommitAt, p('firstCommitAt')), forcePushes: maybeCount(d.forcePushes, p('forcePushes')),
    activityCapturedAt: maybeTime(d.activityCapturedAt, p('activityCapturedAt')), activityTruncated: maybeFlag(d.activityTruncated, p('activityTruncated')),
    commitStatus: status ? { state: text(status.state, p('commitStatus.state'), 32), checks: list(status.checks, p('commitStatus.checks'), (c, cp) => { const check = object(c, cp); return { context: text(check.context, `${cp}.context`, 256), state: text(check.state, `${cp}.state`, 32) }; }, 100), headSha: text(status.headSha ?? '', p('commitStatus.headSha'), 128), capturedAt: time(status.capturedAt, p('commitStatus.capturedAt')) } : null,
    ciRunsCapturedAt: maybeTime(d.ciRunsCapturedAt, p('ciRunsCapturedAt')), ciRunsSource: maybeText(d.ciRunsSource, p('ciRunsSource'), 32), ciRunsTruncated: maybeFlag(d.ciRunsTruncated, p('ciRunsTruncated')), ciRuns: list(d.ciRuns, p('ciRuns'), ciRun, 30),
    reviews: list(d.reviews, p('reviews'), (r, rp) => { const review = object(r, rp); return { reviewer: text(review.reviewer ?? '', `${rp}.reviewer`, 256), state: maybeText(review.state, `${rp}.state`, 32), headSha: maybeText(review.headSha, `${rp}.headSha`, 128), receivedAt: time(review.receivedAt, `${rp}.receivedAt`) }; }, 500),
    events: list(d.events, p('events'), (e, ep) => { const event = object(e, ep); return { kind: text(event.kind, `${ep}.kind`, 32), actor: text(event.actor ?? '', `${ep}.actor`, 256), at: time(event.at, `${ep}.at`), state: maybeText(event.state, `${ep}.state`, 32), headSha: maybeText(event.headSha, `${ep}.headSha`, 128) }; }, 500),
    filesCapturedAt: maybeTime(d.filesCapturedAt, p('filesCapturedAt')), filesTruncated: maybeFlag(d.filesTruncated, p('filesTruncated')), files: list(d.files, p('files'), file, 300),
    changedPaths: changed ? { headSha: text(changed.headSha ?? '', p('changedPaths.headSha'), 128), truncated: flag(changed.truncated, p('changedPaths.truncated')), capturedAt: time(changed.capturedAt, p('changedPaths.capturedAt')), paths: list(changed.paths, p('changedPaths.paths'), (c, cp) => { const entry = object(c, cp); return { path: text(entry.path, `${cp}.path`, 1024), status: text(entry.status, `${cp}.status`, 32), ...(entry.previousPath === undefined || entry.previousPath === null ? {} : { previousPath: text(entry.previousPath, `${cp}.previousPath`, 1024) }) }; }, 1000) } : null,
    reverts: list(d.reverts, p('reverts'), (r, rp) => { const revert = object(r, rp); return { forge: text(revert.forge, `${rp}.forge`, 64), owner: text(revert.owner, `${rp}.owner`, 256), repo: text(revert.repo, `${rp}.repo`, 256), number: count(revert.number, `${rp}.number`), mergeCommitSha: maybeText(revert.mergeCommitSha, `${rp}.mergeCommitSha`, 128), mergedAt: maybeTime(revert.mergedAt, `${rp}.mergedAt`), mergedBy: maybeText(revert.mergedBy, `${rp}.mergedBy`, 256), matchedBy: text(revert.matchedBy, `${rp}.matchedBy`, 16), detectedAt: time(revert.detectedAt, `${rp}.detectedAt`) }; }, 100),
    deployments: list(d.deployments, p('deployments'), (e, dp) => { const deploy = object(e, dp); return { environment: text(deploy.environment, `${dp}.environment`, 64), firstDeployedAt: time(deploy.firstDeployedAt, `${dp}.firstDeployedAt`), sha: text(deploy.sha ?? '', `${dp}.sha`, 128), deployedAt: time(deploy.deployedAt ?? deploy.firstDeployedAt, `${dp}.deployedAt`), url: maybeText(deploy.url, `${dp}.url`, 2048), source: maybeText(deploy.source, `${dp}.source`, 32) }; }, 500),
  };
}

/** Parses one `workItemFacts` document strictly but additively: every field the contract defines is checked, a field it does not define is ignored, and a missing list reads empty. Throws {@link FactsError}. */
export function parseWorkItemFacts(value: unknown, path = 'facts'): WorkItemFacts {
  const d = object(value, path);
  const truncated = d.truncated === undefined ? {} : object(d.truncated, `${path}.truncated`);
  const truncation = (key: string) => truncated[key] === undefined ? false : flag(truncated[key], `${path}.truncated.${key}`);
  const facts: WorkItemFacts = {
    workItem: workItem(d.workItem, `${path}.workItem`), activityAt: time(d.activityAt, `${path}.activityAt`),
    shifts: list(d.shifts, `${path}.shifts`, shift, 200), runs: list(d.runs, `${path}.runs`, run, 1000), liveUsage: list(d.liveUsage, `${path}.liveUsage`, liveUsage, 1000),
    pullRequests: list(d.pullRequests, `${path}.pullRequests`, pullRequest, 50),
    statusTransitions: list(d.statusTransitions, `${path}.statusTransitions`, (s, p) => { const t = object(s, p); return { status: text(t.status, `${p}.status`, 256), gate: maybeOneOf(t.gate, `${p}.gate`, gates), at: time(t.at, `${p}.at`), observed: flag(t.observed ?? false, `${p}.observed`), receivedAt: time(t.receivedAt ?? t.at, `${p}.receivedAt`) }; }, 1000),
    gateTransitions: list(d.gateTransitions, `${path}.gateTransitions`, (g, p) => { const t = object(g, p); return { gate: oneOf(t.gate, `${p}.gate`, gates), status: text(t.status ?? '', `${p}.status`, 256), actor: maybeText(t.actor, `${p}.actor`, 256), reason: maybeText(t.reason, `${p}.reason`, 32), at: time(t.at, `${p}.at`), receivedAt: time(t.receivedAt ?? t.at, `${p}.receivedAt`) }; }, 1000),
    deployEnvironments: list(d.deployEnvironments, `${path}.deployEnvironments`, (e, p) => { const env = object(e, p); return { forge: text(env.forge, `${p}.forge`, 64), owner: text(env.owner, `${p}.owner`, 256), repo: text(env.repo, `${p}.repo`, 256), environment: text(env.environment, `${p}.environment`, 64), firstDeployedAt: time(env.firstDeployedAt, `${p}.firstDeployedAt`) }; }, 1000),
    roster: list(d.roster, `${path}.roster`, (r, p) => { const entry = object(r, p); return { login: text(entry.login, `${p}.login`, 256), roles: list(entry.roles, `${p}.roles`, (role, rp) => text(role, rp, 32), 10) }; }, 1000),
    botLogins: list(d.botLogins, `${path}.botLogins`, (b, p) => text(b, p, 256).toLowerCase(), 100),
    truncated: { shifts: truncation('shifts'), runs: truncation('runs'), pullRequests: truncation('pullRequests'), statusTransitions: truncation('statusTransitions'), gateTransitions: truncation('gateTransitions') },
  };
  for (const entry of facts.shifts) if (entry.workItemId !== facts.workItem.id) fail(`${path}.shifts`, 'names another Work Item');
  return facts;
}

/** Parses Ploeg's `GET work-items/{id}/facts` answer (`schemaVersion` 1.x). */
export function parseFactsResponse(value: unknown): WorkItemFacts {
  const d = object(value, 'response');
  if (typeof d.schemaVersion !== 'string' || !/^1\.\d+$/.test(d.schemaVersion)) fail('response.schemaVersion', 'must be 1.x');
  return parseWorkItemFacts(d.facts);
}

/** Parses one page of Ploeg's `GET facts` list (`schemaVersion` 1.x). */
export function parseFactsPage(value: unknown): FactsPage {
  const d = object(value, 'response');
  if (typeof d.schemaVersion !== 'string' || !/^1\.\d+$/.test(d.schemaVersion)) fail('response.schemaVersion', 'must be 1.x');
  return { facts: list(d.facts, 'response.facts', (f, p) => parseWorkItemFacts(f, p), 25), nextBefore: d.nextBefore === null || d.nextBefore === undefined ? null : text(d.nextBefore, 'response.nextBefore', 128) };
}
