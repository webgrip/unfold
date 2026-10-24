import { randomUUID } from 'node:crypto';
import type { AppConfig, User } from './types.ts';
import { LinkedSessionError, LinkedSessions, type LinkedHandover, type LinkedSession, type PresentedLinkedSession } from './linked-sessions.ts';
import { digestSessionLimit, readSessionsCost } from './linked-telemetry.ts';
import { PloegError, type PloegAdmitted, type PloegClient, type PloegClientClaim, type PloegConnectionRepository, type PloegRequeued, type PloegState } from './ploeg.ts';

/** The Ploeg calls moving work between a person's own sessions and Ploeg needs. */
export type HandoffPloeg = Pick<PloegClient, 'detail' | 'teams' | 'connections' | 'admitWorkItem' | 'requeue' | 'claimClientRun'>;
/** Where a claimed Run's credential waits, encrypted, until the person's client records its session. */
export type ClaimVault = { setSecret(id: string, value: unknown): void; getSecret<T>(id: string): T | undefined; deleteSecret(id: string): void };

/** The windows a person's own session digest covers, in days. */
export const digestWindows = { '7d': 7, '30d': 30 } as const;
export type DigestWindow = keyof typeof digestWindows;
/** How many of a person's sessions one digest reads from the workbench database. */
export const digestReadLimit = 200;
/** The longest brief a Work Item started from a session takes. */
export const briefLimit = 20_000;
/** The most hand-overs one Linked Session keeps; older ones drop off first. */
export const handoverLimit = 20;

/** What a person's own Linked Sessions did in a window: counts from Unfold's records and one cost estimate from telemetry. */
export type SessionDigest = {
  window: DigestWindow; since: string; until: string;
  started: number; active: number; workItems: number; commits: number; aiLines: number;
  costUsd: number | null; costStatus: 'estimate'; costReason: string | null; truncated: boolean;
};

/** Whether a Work Item can be handed back to Ploeg with a requeue now, and in plain words why not. */
export type HandoffReadiness = { available: boolean; reason: string };

const fail = (status: number, code: string, message: string): never => { throw new LinkedSessionError(status, code, message); };
const commandPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const workItemPattern = /^[1-9][0-9]{0,18}$/;
const requeueable: PloegState[] = ['needs_human', 'stale', 'awaiting_review'];
const notRequeueable: Partial<Record<PloegState, string>> = {
  queued: 'Ploeg already has it queued.',
  leased: 'Ploeg is working on it now.',
  ingested: 'Ploeg is still taking it in.',
  proposed: 'It waits for someone to approve it first.',
  done: 'It is closed.',
  withdrawn: 'It was withdrawn.',
};

/** The counts of a digest from the sessions a person owns, for the window that starts at `since` (epoch ms). */
export function digestFacts(sessions: Pick<LinkedSession, 'id' | 'startedAt' | 'lastSeenAt' | 'workItems' | 'commits'>[], since: number): Pick<SessionDigest, 'started' | 'active' | 'workItems' | 'commits' | 'aiLines'> & { ids: string[] } {
  const active = sessions.filter(session => Date.parse(session.lastSeenAt) >= since);
  const commits = active.flatMap(session => session.commits.filter(commit => Date.parse(commit.at) >= since));
  return {
    started: active.filter(session => Date.parse(session.startedAt) >= since).length,
    active: active.length,
    workItems: new Set(active.flatMap(session => session.workItems.map(entry => entry.id))).size,
    commits: commits.length,
    aiLines: commits.reduce((sum, commit) => sum + (commit.aiLines ?? 0), 0),
    ids: active.map(session => session.id),
  };
}

/** Whether a Work Item in this state, with this latest Shift, can be requeued (Ploeg ADR-0044). */
export function handoffReadiness(item: { state: PloegState; latestShift: { closedAt: string | null } | null }): HandoffReadiness {
  if (!requeueable.includes(item.state)) return { available: false, reason: notRequeueable[item.state] ?? 'Ploeg cannot restart it in this state.' };
  if (item.latestShift && !item.latestShift.closedAt) return { available: false, reason: 'An attempt is still open. Wait for it to stop, or stop it first.' };
  return { available: true, reason: '' };
}

/** The operator note a hand-off adds to every Run of the new attempt: what the person's own session left behind. Ids and links only. */
export function handoffNote(session: Pick<LinkedSession, 'branch' | 'commits' | 'pullRequests'>, link: string): string {
  const last = session.commits.at(-1);
  const lines = [
    `A person worked on this Work Item in their own Claude Code session (${link}) and handed it to Ploeg to finish.`,
    session.branch ? `Their branch: ${session.branch}.` : 'Their session reported no branch.',
    last ? `Their last commit: ${last.sha.slice(0, 12)}${last.subject ? ` (${last.subject})` : ''}.` : 'Their session reported no commits.',
    session.pullRequests.length ? `Their pull request: ${session.pullRequests.at(-1)}.` : '',
    'Read that branch and pull request first and build on that work instead of starting over.',
  ];
  return lines.filter(Boolean).join(' ').replace(/[\0-\x1f\x7f]/g, ' ').slice(0, 4096);
}

/** The owner and name a repository address names, such as `webgrip/unfold` for `https://forgejo.example.org/webgrip/unfold.git`. */
export function repositoryName(address: string): string {
  const path = address.replace(/^[a-z]+:\/\/[^/]+\//i, '').replace(/^[^/:]+:/, '').replace(/\.git$/, '').replace(/\/+$/, '');
  const parts = path.split('/').filter(Boolean);
  return parts.length >= 2 ? `${parts.at(-2)}/${parts.at(-1)}`.toLowerCase() : '';
}

/** The registered, ready Work Targets a Work Item can be admitted to, and the one the session's repository names, if any. */
export function admissionTargets(repositories: PloegConnectionRepository[], sessionRepository: string): { targets: { key: string; repository: string; baseBranch: string }[]; suggested: string | null } {
  const targets = repositories.filter(entry => entry.readiness === 'ready' && commandPattern.test(entry.key)).map(entry => ({ key: entry.key, repository: `${entry.owner}/${entry.repo}`, baseBranch: entry.baseBranch }));
  const name = repositoryName(sessionRepository);
  const matching = name ? targets.filter(entry => entry.repository.toLowerCase() === name) : [];
  return { targets, suggested: matching.length === 1 ? matching[0].key : null };
}

type StoredClaim = { userId: string; workItemId: string; runToken: string; controlToken: string | null; workerId: string | null; environmentId: string; baseBranch: string; title: string; reference: string; deadline: string };

/**
 * Moves work both ways between a person's own Claude Code sessions and Ploeg: a digest of their sessions, a Work Item
 * started from a session, a session handed to Ploeg to finish, and a Run that waits for their own Claude Code claimed
 * and recorded through Unfold, which keeps the Run credential and never hands it to the client.
 */
export class LinkedHandoff {
  private linked: LinkedSessions;
  private ploeg: HandoffPloeg;
  private vault: ClaimVault;
  private config: AppConfig;
  private fetcher: typeof fetch;
  private clock: () => Date;
  constructor(linked: LinkedSessions, ploeg: HandoffPloeg, vault: ClaimVault, config: AppConfig, options: { fetch?: typeof fetch; now?: () => Date } = {}) {
    this.linked = linked; this.ploeg = ploeg; this.vault = vault; this.config = config;
    this.fetcher = options.fetch ?? fetch;
    this.clock = options.now ?? (() => new Date());
  }

  /** What the person's own sessions did in `window`: sessions, Work Items touched, commits, AI-written lines and the estimated cost. */
  async digest(user: User, window: string): Promise<SessionDigest> {
    if (!Object.hasOwn(digestWindows, window)) fail(400, 'digest_window', 'Use window=7d or window=30d.');
    const days = digestWindows[window as DigestWindow];
    const until = this.clock();
    const since = until.getTime() - days * 86_400_000;
    const sessions = this.linked.store.owned(user.id, digestReadLimit);
    const facts = digestFacts(sessions, since);
    const cost = await readSessionsCost(this.config.observability, facts.ids.slice(0, digestSessionLimit), `${days * 86_400}s`, { fetch: this.fetcher });
    const truncated = sessions.length >= digestReadLimit || facts.ids.length > digestSessionLimit;
    return { window: window as DigestWindow, since: new Date(since).toISOString(), until: until.toISOString(), started: facts.started, active: facts.active, workItems: facts.workItems, commits: facts.commits, aiLines: facts.aiLines, costUsd: cost.costUsd, costStatus: 'estimate', costReason: cost.reason, truncated };
  }

  private remember(session: LinkedSession, handover: LinkedHandover): void {
    session.handovers = [...(session.handovers ?? []), handover].slice(-handoverLimit);
    this.linked.store.save(session);
  }

  private owned(user: User, id: string, adminToo: boolean): LinkedSession {
    const session = this.linked.store.get(id);
    if (!session || (session.ownerId !== user.id && !(adminToo && user.role === 'admin'))) fail(404, 'not_found', 'Linked session not found.');
    return session!;
  }

  /** The Teams and ready Work Targets a person can start a Work Item from their own session with, the session's repository preselected when it matches one. */
  async startOptions(user: User, id: string): Promise<{ teams: string[]; targets: { key: string; repository: string; baseBranch: string }[]; suggested: string | null; message: string }> {
    const session = this.owned(user, id, false);
    const teams = (await this.ploeg.teams(user)).map(team => team.id);
    const connections = await this.ploeg.connections(user);
    const { targets, suggested } = admissionTargets(connections.repositories, session.repository);
    const message = !connections.supported ? 'This Ploeg cannot list its repositories, so none can be offered.' : !targets.length ? 'Ploeg has no ready repository to start a Work Item in.' : '';
    return { teams, targets, suggested, message };
  }

  /** Admits a Work Item from the person's own session and links the session to it. Admission only queues: the Team's budget pays when Ploeg runs it. */
  async startWorkItem(user: User, id: string, input: Record<string, unknown>, base: string): Promise<{ workItem: PloegAdmitted; session: PresentedLinkedSession | null; linkError: string; link: string }> {
    this.owned(user, id, false);
    const text = (value: unknown, label: string, max: number) => {
      const entry = typeof value === 'string' ? value.trim() : '';
      if (!entry || entry.length > max) fail(400, 'start_input', `${label} must be 1 to ${max} characters.`);
      return entry;
    };
    const team = text(input.team, 'Team', 128);
    const target = text(input.target, 'Repository', 128);
    const title = text(input.title, 'Title', 200);
    const description = text(input.brief, 'Brief', briefLimit);
    const requestId = input.requestId === undefined ? `unfold-linked-${randomUUID()}` : String(input.requestId);
    if (!commandPattern.test(team) || !commandPattern.test(target) || !commandPattern.test(requestId)) fail(400, 'start_input', 'Choose a Team and a repository from the lists.');
    const workItem = await this.ploeg.admitWorkItem(user, { requestId, team, target, title, description });
    let session: PresentedLinkedSession | null = null;
    let linkError = '';
    try { session = await this.linked.setLink(user, id, workItem.id, true, base); }
    catch (error) { linkError = `Ploeg admitted Work Item ${workItem.id}, but this session could not be linked to it: ${(error as Error).message}`; }
    return { workItem, session, linkError, link: `${base.replace(/\/+$/, '')}/#work/${workItem.id}` };
  }

  /** Whether each Work Item the session is linked to can be handed to Ploeg now, read from Ploeg for at most five of them. */
  async readiness(user: User, id: string): Promise<{ workItems: { id: string; title: string; state: string; available: boolean; reason: string }[] }> {
    const session = this.owned(user, id, true);
    const workItems = await Promise.all(session.workItems.slice(0, 5).map(async entry => {
      try {
        const { item } = await this.ploeg.detail(user, entry.id, true);
        return { id: entry.id, title: item.title, state: item.state, ...handoffReadiness(item) };
      } catch (error) { return { id: entry.id, title: '', state: '', available: false, reason: error instanceof PloegError ? error.message : 'Ploeg could not be read.' }; }
    }));
    return { workItems };
  }

  /** Hands a linked Work Item to Ploeg: one requeue whose note says what the session left behind, so the new attempt's Runs read it. */
  async handOff(user: User, id: string, workItemId: string, commandId: unknown, base: string): Promise<{ requeue: PloegRequeued; note: string }> {
    const session = this.owned(user, id, true);
    if (!workItemPattern.test(workItemId)) fail(400, 'work_item_id', 'Use a Work Item id.');
    if (!session.workItems.some(entry => entry.id === workItemId)) fail(409, 'handoff_not_linked', 'This session is not linked to that Work Item. Link it first.');
    const command = commandId === undefined ? `unfold-handoff-${randomUUID()}` : String(commandId);
    if (!commandPattern.test(command)) fail(400, 'ploeg_command', 'A hand-off needs a command id of 1 to 128 identifier characters.');
    const { item } = await this.ploeg.detail(user, workItemId, true);
    const ready = handoffReadiness(item);
    if (!ready.available) fail(409, 'handoff_unavailable', ready.reason);
    const note = handoffNote(session, LinkedSessions.page(base, session.id));
    const requeue = await this.ploeg.requeue(user, workItemId, { commandId: command, expectedState: item.state, note });
    if (!requeue.replayed && !requeue.demo) this.remember(this.linked.store.get(session.id) ?? session, { kind: 'handoff', workItemId, at: this.clock().toISOString() });
    return { requeue, note };
  }

  /**
   * Claims the Run of a Work Item that waits for the person's own Claude Code (Ploeg ADR-0112). Answers what their
   * client dispatches; Unfold keeps the Run credential, encrypted, for {@link recordSession}. When `linkedSession`
   * names one of the person's own Linked Sessions, the session that ran `/unfold:start`, it is linked to the Work Item
   * and remembers the claim, so it never collides with the Run it started.
   */
  async claim(user: User, workItemId: string, input: Record<string, unknown> = {}, base = ''): Promise<{ run: PloegClientClaim['run']; dispatch: PloegClientClaim['dispatch']; deadline: string }> {
    const claim = await this.ploeg.claimClientRun(user, workItemId);
    const stored: StoredClaim = { userId: user.id, workItemId, runToken: claim.credential.runToken, controlToken: claim.credential.controlToken, workerId: claim.credential.workerId, environmentId: claim.dispatch.environmentId, baseBranch: claim.dispatch.baseBranch, title: claim.dispatch.title, reference: claim.dispatch.reference, deadline: claim.credential.deadline };
    this.vault.setSecret(`client-claim:${claim.run.id}`, stored);
    await this.claimedBy(user, typeof input.linkedSession === 'string' ? input.linkedSession : '', workItemId, claim.run.id, base);
    return { run: claim.run, dispatch: claim.dispatch, deadline: claim.credential.deadline };
  }

  private async claimedBy(user: User, sessionId: string, workItemId: string, runId: string, base: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(sessionId) || this.linked.store.get(sessionId)?.ownerId !== user.id) return;
    await this.linked.setLink(user, sessionId, workItemId, true, base).catch(() => null);
    const session = this.linked.store.get(sessionId);
    if (session) this.remember(session, { kind: 'claim', workItemId, runId, at: this.clock().toISOString() });
  }

  /** Records the Claude session the person's client dispatched for a claimed Run on Ploeg's run API, with the credential the claim kept. */
  async recordSession(user: User, workItemId: string, input: Record<string, unknown>): Promise<{ recorded: true; runId: string; sessionId: string }> {
    const runId = String(input.runId ?? '');
    const sessionId = String(input.sessionId ?? '');
    if (!workItemPattern.test(runId)) fail(400, 'run_id', 'Name the Run you claimed.');
    if (!/^(?:session|cse)_[A-Za-z0-9_-]{4,200}$/.test(sessionId)) fail(400, 'claude_session_id', 'sessionId must be the session_… or cse_… id Claude Code printed.');
    const stored = this.vault.getSecret<StoredClaim>(`client-claim:${runId}`);
    if (!stored || stored.userId !== user.id || stored.workItemId !== workItemId) fail(404, 'claim_not_found', 'Unfold holds no claim of yours for this Run. Start it again with /unfold:start.');
    const ploegUrl = this.config.ploeg?.url;
    if (!ploegUrl) return fail(503, 'ploeg_unconfigured', 'Connect the Ploeg operator API in the server configuration.');
    const clip = (value: string) => value.slice(0, 512);
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json', ...(stored!.controlToken ? { authorization: `Bearer ${stored!.controlToken}` } : {}), ...(stored!.workerId ? { 'X-Ploeg-Worker-ID': stored!.workerId } : {}) };
    let response: Response;
    try {
      response = await this.fetcher(`${ploegUrl}/api/v1/runs/${encodeURIComponent(stored!.runToken)}/claude-session`, { method: 'POST', headers, body: JSON.stringify({ environmentId: stored!.environmentId, sessionId, baseBranch: clip(stored!.baseBranch), title: clip(stored!.title), reference: clip(stored!.reference) }), signal: AbortSignal.timeout(5000), redirect: 'manual' });
    } catch { return fail(503, 'ploeg_unavailable', 'Ploeg could not be reached, so the session was not recorded. Run the command again to retry.'); }
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 409) fail(409, 'claude_session_conflict', 'Ploeg already recorded another session for this Run.');
    if (response.status === 404) { this.vault.deleteSecret(`client-claim:${runId}`); fail(409, 'run_not_running', 'The Run is no longer running, so its session cannot be recorded. Its Lease lapsed; start it again.'); }
    if (!response.ok) fail(response.status === 401 || response.status === 403 ? 503 : 502, 'claude_session_refused', `Ploeg refused to record the session (${response.status}).`);
    this.vault.deleteSecret(`client-claim:${runId}`);
    return { recorded: true, runId, sessionId };
  }
}

/** One request to the hand-off routes, as `http.ts` hands it over. */
export type HandoffRequest = { method: string; path: string; query: URLSearchParams; user: User; base: string; body: () => Promise<Record<string, unknown>> };

const routes = {
  digest: /^\/api\/linked-sessions\/digest$/,
  options: /^\/api\/linked-sessions\/([A-Za-z0-9_-]{8,128})\/start-options$/,
  start: /^\/api\/linked-sessions\/([A-Za-z0-9_-]{8,128})\/work-items$/,
  readiness: /^\/api\/linked-sessions\/([A-Za-z0-9_-]{8,128})\/handoff$/,
  handOff: /^\/api\/linked-sessions\/([A-Za-z0-9_-]{8,128})\/work-items\/([1-9][0-9]{0,18})\/handoff$/,
  claim: /^\/api\/ploeg\/work-items\/([1-9][0-9]{0,18})\/claim$/,
  record: /^\/api\/ploeg\/work-items\/([1-9][0-9]{0,18})\/claude-session$/,
};

/** Whether `path` is one of the hand-off routes, so `http.ts` sends it here before its other Linked Session and Ploeg routes. */
export function isHandoffRoute(path: string): boolean { return Object.values(routes).some(pattern => pattern.test(path)); }

/** Serves the hand-off routes; answers the status and JSON body. Refusals throw {@link LinkedSessionError} or {@link PloegError}. */
export async function handoffRoute(service: LinkedHandoff, request: HandoffRequest): Promise<{ status: number; body: unknown }> {
  const { method, path, user } = request;
  const only = (wanted: string, message: string) => { if (method !== wanted) fail(405, 'method', message); };
  let match: RegExpExecArray | null;
  if (routes.digest.test(path)) { only('GET', 'Read your session digest with GET.'); return { status: 200, body: { digest: await service.digest(user, request.query.get('window') ?? '7d') } }; }
  if ((match = routes.options.exec(path))) { only('GET', 'Read the start options with GET.'); return { status: 200, body: await service.startOptions(user, match[1]) }; }
  if ((match = routes.start.exec(path))) { only('POST', 'Start a Work Item with POST.'); return { status: 201, body: await service.startWorkItem(user, match[1], await request.body(), request.base) }; }
  if ((match = routes.readiness.exec(path))) { only('GET', 'Read whether the session can be handed to Ploeg with GET.'); return { status: 200, body: await service.readiness(user, match[1]) }; }
  if ((match = routes.handOff.exec(path))) { only('POST', 'Hand the session to Ploeg with POST.'); const input = await request.body(); return { status: 200, body: await service.handOff(user, match[1], match[2], input.commandId, request.base) }; }
  if ((match = routes.claim.exec(path))) { only('POST', 'Claim the Run with POST.'); return { status: 200, body: await service.claim(user, match[1], await request.body(), request.base) }; }
  if ((match = routes.record.exec(path))) { only('POST', 'Record the Claude session with POST.'); return { status: 200, body: await service.recordSession(user, match[1], await request.body()) }; }
  return fail(404, 'not_found', 'API route not found.');
}
