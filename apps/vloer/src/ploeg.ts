import type { AppConfig, User } from './types.ts';
import { ploegDemo } from './ploeg-demo.ts';

export type PloegState = 'ingested' | 'queued' | 'leased' | 'done' | 'needs_human' | 'awaiting_review' | 'stale' | 'withdrawn' | 'proposed';
export type PloegTeam = { id: string; paused: boolean | null; queueDepth: number; roles: { id: string; queueDepth: number }[] };
export type PloegShift = { id: string; workItemId: string; team: string; branch: string; round: number; budgetUsd: number; spentUsd: number; reservedUsd: number; openedAt: string; closedAt: string | null; closeReason: string };
export type PloegItem = { id: string; provider: string; externalId: string; revision: string; team: string; state: PloegState; title: string; description: string; url: string; priority: number; attempts: number; infraFailures: number; nextEligibleAt: string | null; createdAt: string; updatedAt: string; target: { forge: string; owner: string; repo: string; baseBranch: string } | null; latestShift: PloegShift | null; lease: { expiresAt: string; renewedAt: string } | null; sourceWorkItemId?: string; createdKind?: string; ready?: boolean };
export type PloegRun = { id: string; workItemId: string; shiftId: string | null; team: string; role: string; round: number; writes: boolean; state: 'pending' | 'running' | 'finished'; startedAt: string | null; finishedAt: string | null; expiresAt: string | null; outcome: string | null; summary: string; stuckReason: string; links: string[]; findings: string; verdict: string; failureReason: string | null; authorizedUsd: number; usage: { inputTokens?: number; outputTokens?: number; costUsd?: number } | null; costStatus: 'observed' | 'unknown'; keyAlias: string | null };
export type PloegCheckpoint = { id: string; workItemId: string; phase: string; branch: string; prUrl: string; createdAt: string; nodeName: string; podUid: string };
export type PloegEvent = { id: string; at: string; actor: string; action: string; workItemId: string; team: string; detail: Record<string, unknown> };
export type PloegDetail = { item: PloegItem; shifts: PloegShift[]; runs: PloegRun[]; checkpoints: PloegCheckpoint[]; events: PloegEvent[]; truncated: { shifts: boolean; runs: boolean; checkpoints: boolean; events: boolean }; demo?: boolean; fetchedAt?: string };
export type PloegLane = 'awaiting_review' | 'needs_human' | 'leased' | 'queued' | 'all';
export type PloegPage = { items: PloegItem[]; nextCursor: string | null };
export type PloegWindow = '24h' | '7d' | '30d';
export type PloegWorkCounts = Record<'queued' | 'leased' | 'awaitingReview' | 'needsHuman' | 'proposed' | 'withdrawn' | 'done' | 'stale', number>;
export type PloegRunCounts = Record<'pending' | 'running' | 'finished' | 'failed' | 'stuck', number>;
export type PloegSpend = { settledUsd: number; reservedUsd: number };
export type PloegTeamSummary = { team: string; workItems: PloegWorkCounts; runs: PloegRunCounts; spend: PloegSpend; lastActivityAt: string | null };
export type PloegSummary = { demo: boolean; window: PloegWindow; generatedAt: string; teams: PloegTeamSummary[]; totals: { workItems: PloegWorkCounts; runs: PloegRunCounts; spend: PloegSpend }; fetchedAt: string };
export type PloegRunRow = { id: string; workItemId: string; workItemTitle: string; externalRef: string; team: string; role: string; round: number; writes: boolean; state: string; outcome: string; verdict: string; failureReason: string; startedAt: string | null; finishedAt: string | null; durationSeconds: number | null; authorizedUsd: number | null; settledUsd: number | null; usage: { inputTokens: number | null; outputTokens: number | null; models: string[] } | null };
export type PloegRunsPage = { demo: boolean; runs: PloegRunRow[]; nextBefore: string | null; fetchedAt: string };
export type PloegActivityEvent = PloegEvent & { workItemTitle: string };
export type PloegEventsPage = { demo: boolean; events: PloegActivityEvent[]; nextCursor: string | null; fetchedAt: string };
export type PloegProposedItem = PloegItem & { sourceTitle: string };
export type PloegProposedPage = { demo: boolean; items: PloegProposedItem[]; truncated: boolean; fetchedAt: string };
export type PloegDecision = 'approve' | 'reject' | 'cancel';
export type PloegRunFilter = { team?: string; state?: string; outcome?: string; before?: string };
export type PloegOverview = { configured: boolean; available: boolean; demo: boolean; teams: PloegTeam[]; selectedTeam?: string; lanes?: Record<PloegLane, PloegPage>; fetchedAt?: string; trackerUrl?: string; message: string };

export class PloegError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.name = 'PloegError'; this.status = status; this.code = code; }
}

const states: PloegState[] = ['ingested', 'queued', 'leased', 'done', 'needs_human', 'awaiting_review', 'stale', 'withdrawn', 'proposed'];
const invalid = () => new PloegError(502, 'ploeg_response', 'Ploeg returned an unsupported operator response.');
const identifier = (value: unknown): string => { if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/.test(value)) throw invalid(); return value; };
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(); return value as Record<string, unknown>; }
function field(value: unknown, max = 512): string { if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw invalid(); return value; }
function numeric(value: unknown, integer = false): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) throw invalid(); return value; }
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') throw invalid(); return value; }
function nullable<T>(value: unknown, parse: (value: unknown) => T): T | null { return value === null ? null : parse(value); }
function timestamp(value: unknown): string { const text = field(value, 64); if (!text || !Number.isFinite(Date.parse(text))) throw invalid(); return text; }
function array<T>(value: unknown, parse: (value: unknown) => T, max = 500): T[] { if (!Array.isArray(value) || value.length > max) throw invalid(); return value.map(parse); }
function link(value: unknown): string {
  const text = field(value, 4096);
  if (!text) return '';
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || [...url.searchParams.keys()].some(key => /token|password|secret|api.?key|signature/i.test(key))) return '';
    return url.href;
  } catch { return ''; }
}
function envelope(value: unknown): Record<string, unknown> { const data = record(value); if (data.schemaVersion !== '1.0') throw invalid(); return data; }
function team(value: unknown): PloegTeam {
  const data = record(value);
  return { id: field(data.id, 100), paused: nullable(data.paused, boolean), queueDepth: numeric(data.queueDepth, true), roles: array(data.roles, value => { const role = record(value); return { id: field(role.id, 100), queueDepth: numeric(role.queueDepth, true) }; }, 100) };
}
function shift(value: unknown): PloegShift {
  const data = record(value);
  return { id: identifier(data.id), workItemId: identifier(data.workItemId), team: field(data.team, 100), branch: field(data.branch), round: numeric(data.round, true), budgetUsd: numeric(data.budgetUsd), spentUsd: numeric(data.spentUsd), reservedUsd: numeric(data.reservedUsd), openedAt: timestamp(data.openedAt), closedAt: nullable(data.closedAt, timestamp), closeReason: field(data.closeReason, 16000) };
}
function item(value: unknown): PloegItem {
  const data = record(value);
  if (!states.includes(data.state as PloegState) || typeof data.priority !== 'number' || !Number.isSafeInteger(data.priority)) throw invalid();
  const result = { id: identifier(data.id), provider: field(data.provider, 100), externalId: field(data.externalId, 512), revision: field(data.revision, 512), team: field(data.team, 100), state: data.state as PloegState, title: field(data.title, 4096), description: field(data.description, 16384), url: link(data.url), priority: data.priority, attempts: numeric(data.attempts, true), infraFailures: numeric(data.infraFailures, true), nextEligibleAt: nullable(data.nextEligibleAt, timestamp), createdAt: timestamp(data.createdAt), updatedAt: timestamp(data.updatedAt), target: nullable(data.target, value => { const target = record(value); return { forge: field(target.forge, 100), owner: field(target.owner), repo: field(target.repo), baseBranch: field(target.baseBranch) }; }), latestShift: nullable(data.latestShift, shift), lease: nullable(data.lease, value => { const lease = record(value); return { expiresAt: timestamp(lease.expiresAt), renewedAt: timestamp(lease.renewedAt) }; }) };
  if (result.latestShift && (result.latestShift.workItemId !== result.id || result.latestShift.team !== result.team)) throw invalid();
  return { ...result, ...provenance(data) };
}
function provenance(data: Record<string, unknown>): Pick<PloegItem, 'sourceWorkItemId' | 'createdKind' | 'ready'> {
  const source = data.sourceWorkItemId ?? data.source_work_item_id;
  const kind = data.createdKind ?? data.kind;
  const sourceId = typeof source === 'string' && /^[1-9][0-9]{0,19}$/.test(source) ? source : typeof source === 'number' && Number.isSafeInteger(source) && source > 0 ? String(source) : undefined;
  return { ...(sourceId ? { sourceWorkItemId: sourceId } : {}), ...(typeof kind === 'string' && /^[a-z_]{1,32}$/.test(kind) ? { createdKind: kind } : {}), ...(typeof data.ready === 'boolean' ? { ready: data.ready } : {}) };
}
function run(value: unknown): PloegRun {
  const data = record(value);
  if (!['pending', 'running', 'finished'].includes(data.state as string) || !['observed', 'unknown'].includes(data.costStatus as string)) throw invalid();
  const usage = nullable(data.usage, value => { const usage = record(value); return Object.fromEntries(['inputTokens', 'outputTokens', 'costUsd'].filter(key => usage[key] !== undefined).map(key => [key, numeric(usage[key], key !== 'costUsd')])); });
  if (data.costStatus === 'observed' && usage?.costUsd === undefined) throw invalid();
  return { id: identifier(data.id), workItemId: identifier(data.workItemId), shiftId: nullable(data.shiftId, identifier), team: field(data.team, 100), role: field(data.role, 100), round: numeric(data.round, true), writes: boolean(data.writes), state: data.state as PloegRun['state'], startedAt: nullable(data.startedAt, timestamp), finishedAt: nullable(data.finishedAt, timestamp), expiresAt: nullable(data.expiresAt, timestamp), outcome: nullable(data.outcome, value => field(value, 100)), summary: field(data.summary, 64000), stuckReason: field(data.stuckReason, 16000), links: array(data.links, link, 100).filter(Boolean), findings: field(data.findings, 64000), verdict: field(data.verdict, 100), failureReason: nullable(data.failureReason, value => field(value, 16000)), authorizedUsd: numeric(data.authorizedUsd), usage, costStatus: data.costStatus as PloegRun['costStatus'], keyAlias: nullable(data.keyAlias, value => field(value, 512)) };
}
function checkpoint(value: unknown): PloegCheckpoint { const data = record(value); return { id: identifier(data.id), workItemId: identifier(data.workItemId), phase: field(data.phase, 100), branch: field(data.branch), prUrl: link(data.prUrl), createdAt: timestamp(data.createdAt), nodeName: field(data.nodeName), podUid: field(data.podUid) }; }
function auditDetail(value: unknown): Record<string, unknown> {
  const data = record(value);
  const parsers: Record<string, (value: unknown) => unknown> = { shiftId: identifier, round: value => numeric(value, true), role: value => field(value, 100), writes: boolean, authorizedUsd: numeric, phase: value => field(value, 100), reason: value => field(value, 4096), infraFailures: value => numeric(value, true) };
  return Object.fromEntries(Object.entries(parsers).filter(([key]) => data[key] !== undefined).map(([key, parse]) => [key, parse(data[key])]));
}
function event(value: unknown): PloegEvent { const data = record(value); return { id: identifier(data.id), at: timestamp(data.at), actor: field(data.actor, 256), action: field(data.action, 256), workItemId: identifier(data.workItemId), team: field(data.team, 100), detail: record(auditDetail(data.detail)) }; }
export const ploegWindows: PloegWindow[] = ['24h', '7d', '30d'];
const workKeys = ['queued', 'leased', 'awaitingReview', 'needsHuman', 'proposed', 'withdrawn', 'done', 'stale'] as const;
const runKeys = ['pending', 'running', 'finished', 'failed', 'stuck'] as const;
const decisionKinds: PloegDecision[] = ['approve', 'reject', 'cancel'];
const pageSize = 25;
function token(value: unknown): string { if (value === null || value === undefined || value === '') return ''; const text = field(value, 64); if (!/^[a-z][a-z0-9_]*$/.test(text)) throw invalid(); return text; }
function counts<K extends string>(value: unknown, keys: readonly K[]): Record<K, number> { const data = record(value); return Object.fromEntries(keys.map(key => [key, numeric(data[key], true)])) as Record<K, number>; }
function spend(value: unknown): PloegSpend { const data = record(value); return { settledUsd: numeric(data.settledUsd), reservedUsd: numeric(data.reservedUsd) }; }
function teamSummary(value: unknown): PloegTeamSummary { const data = record(value); return { team: field(data.team, 100), workItems: counts(data.workItems, workKeys), runs: counts(data.runs, runKeys), spend: spend(data.spend), lastActivityAt: nullable(data.lastActivityAt, timestamp) }; }
/** Sums per-team summaries into totals for exactly the teams a caller may see. */
export function summaryTotals(teams: PloegTeamSummary[]): PloegSummary['totals'] {
  const add = <K extends string>(keys: readonly K[], pick: (team: PloegTeamSummary) => Record<K, number>) => Object.fromEntries(keys.map(key => [key, teams.reduce((sum, team) => sum + pick(team)[key], 0)])) as Record<K, number>;
  return { workItems: add(workKeys, team => team.workItems), runs: add(runKeys, team => team.runs), spend: add(['settledUsd', 'reservedUsd'] as const, team => team.spend) };
}
function runRow(value: unknown): PloegRunRow {
  const data = record(value);
  const text = (entry: unknown, max: number) => entry === null || entry === undefined ? '' : field(entry, max);
  const count = (entry: unknown) => entry === null || entry === undefined ? null : numeric(entry, true);
  const usage = nullable(data.usage ?? null, entry => { const usage = record(entry); return { inputTokens: count(usage.inputTokens), outputTokens: count(usage.outputTokens), models: usage.models === undefined || usage.models === null ? [] : array(usage.models, model => field(model, 200), 20) }; });
  const state = token(data.state);
  if (!state) throw invalid();
  return { id: identifier(data.id), workItemId: identifier(data.workItemId), workItemTitle: text(data.workItemTitle, 4096), externalRef: text(data.externalRef, 512), team: field(data.team, 100), role: field(data.role, 100), round: numeric(data.round, true), writes: boolean(data.writes), state, outcome: token(data.outcome), verdict: token(data.verdict), failureReason: text(data.failureReason, 16000), startedAt: nullable(data.startedAt ?? null, timestamp), finishedAt: nullable(data.finishedAt ?? null, timestamp), durationSeconds: nullable(data.durationSeconds ?? null, value => numeric(value)), authorizedUsd: nullable(data.authorizedUsd ?? null, value => numeric(value)), settledUsd: nullable(data.settledUsd ?? null, value => numeric(value)), usage };
}
function activityEvent(value: unknown): PloegActivityEvent { const data = record(value); return { ...event(data), workItemTitle: typeof data.workItemTitle === 'string' && data.workItemTitle.length <= 4096 ? data.workItemTitle : '' }; }
const unsupported = () => new PloegError(501, 'ploeg_unsupported', 'This Ploeg version does not provide activity data yet.');
const decisionFailures: Record<number, [string, string]> = {
  400: ['ploeg_decision', 'Ploeg refused the request. A rejection needs a reason of at most 4096 characters.'],
  403: ['ploeg_decision_forbidden', 'Vloer’s Ploeg credential cannot record decisions. An administrator must grant it execute permission.'],
  404: ['ploeg_not_found', 'Ploeg work item not found in your authorized teams.'],
  409: ['ploeg_decision_conflict', 'Ploeg did not apply this: the Work Item changed state or is bound to an execution. Refresh to see where it stands.'],
};

function page(value: unknown): PloegPage { const data = envelope(value); return { items: array(data.items, item, 100), nextCursor: nullable(data.nextCursor, identifier) }; }
function detail(value: unknown): PloegDetail {
  const data = envelope(value);
  const truncated = record(data.truncated);
  const result = { item: item(data.item), shifts: array(data.shifts, shift), runs: array(data.runs, run), checkpoints: array(data.checkpoints, checkpoint), events: array(data.events, event), truncated: { shifts: boolean(truncated.shifts), runs: boolean(truncated.runs), checkpoints: boolean(truncated.checkpoints), events: boolean(truncated.events) } };
  for (const entry of [...result.shifts, ...result.runs, ...result.checkpoints, ...result.events]) if (entry.workItemId !== result.item.id || ('team' in entry && entry.team !== result.item.team)) throw invalid();
  return result;
}

export function validatePloeg(raw: unknown, mode: AppConfig['mode']): AppConfig['ploeg'] {
  if (raw === undefined) return undefined;
  const data = record(raw);
  if (Object.keys(data).some(key => !['url', 'tokenEnv', 'teams', 'userTeams', 'trackerUrl', 'demo'].includes(key))) throw new Error('Unknown ploeg field; credentials must use tokenEnv');
  if (data.demo !== undefined && (data.demo !== true || mode !== 'demo')) throw new Error('ploeg.demo requires explicit application demo mode');
  let url: URL;
  try { url = new URL(field(data.url, 2048)); } catch { throw new Error('ploeg.url must be an HTTP(S) origin or base path'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /[%\\]/.test(url.pathname)) throw new Error('ploeg.url must use HTTP(S) without credentials, query or fragment');
  if (data.tokenEnv !== undefined && (typeof data.tokenEnv !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/.test(data.tokenEnv))) throw new Error('ploeg.tokenEnv must name an environment variable');
  if (!data.demo && !data.tokenEnv) throw new Error('ploeg.tokenEnv is required for the authenticated operator API');
  const parseTeams = (value: unknown) => { if (!Array.isArray(value) || value.length > 50 || value.some(team => typeof team !== 'string' || !team.trim() || team.length > 100 || /[\u0000-\u001f\u007f]/.test(team))) throw new Error('ploeg.teams and userTeams must list at most 50 team names'); return [...new Set(value as string[])]; };
  const userTeams = data.userTeams === undefined ? undefined : record(data.userTeams);
  if (userTeams && (Object.keys(userTeams).length > 1000 || Object.keys(userTeams).some(id => !/^[A-Za-z0-9_-]{1,128}$/.test(id)))) throw new Error('ploeg.userTeams must map user IDs to team names');
  const trackerUrl = data.trackerUrl === undefined ? undefined : link(data.trackerUrl);
  if (data.trackerUrl !== undefined && !trackerUrl) throw new Error('ploeg.trackerUrl must be an HTTP(S) URL without credentials');
  return { url: url.href.replace(/\/+$/, ''), ...(data.tokenEnv ? { tokenEnv: data.tokenEnv as string } : {}), ...(data.teams !== undefined ? { teams: parseTeams(data.teams) } : {}), ...(userTeams ? { userTeams: Object.fromEntries(Object.entries(userTeams).map(([id, value]) => [id, parseTeams(value)])) } : {}), ...(trackerUrl ? { trackerUrl } : {}), ...(data.demo ? { demo: true } : {}) };
}

export class PloegClient {
  private readonly config?: AppConfig['ploeg'];
  private readonly demo: boolean;
  private cachedToken: string | undefined;
  private readonly cache = new Map<string, { until: number; value: unknown }>();
  private readonly titles = new Map<string, string>();
  private readonly demoDecisions = new Map<string, PloegDecision>();
  constructor(config: AppConfig) { this.config = config.ploeg; this.demo = config.mode === 'demo' && (!config.ploeg || config.ploeg.demo === true); }
  private allowed(user: User, team: string): boolean { return (!this.config?.teams || this.config.teams.includes(team)) && (user.role === 'admin' || this.config?.userTeams?.[user.id]?.includes(team) === true); }
  private connected(user: User): void { if (!this.config && !this.demo) throw new PloegError(503, 'ploeg_unconfigured', 'Connect the authenticated Ploeg operator API in the server configuration.'); this.authorize(user); }
  private authorize(user: User): void { if (user.role !== 'admin' && !this.config?.userTeams?.[user.id]?.length) throw new PloegError(403, 'ploeg_scope', 'Your account has no Ploeg team access. Ask an administrator to grant it.'); }
  private async request(path: string, fresh = false, options: { added?: boolean; actor?: string; body?: unknown } = {}): Promise<unknown> {
    const token = this.config?.tokenEnv ? process.env[this.config.tokenEnv] : undefined;
    if (!token || token.length > 4096 || /[^\x21-\x7e]/.test(token)) throw new PloegError(503, 'ploeg_credential', 'The Ploeg operator credential is unavailable. An administrator must check the connection.');
    if (token !== this.cachedToken) { this.cache.clear(); this.cachedToken = token; }
    const post = options.actor !== undefined;
    const cached = this.cache.get(path);
    if (!post && !fresh && cached && cached.until > Date.now()) return structuredClone(cached.value);
    try {
      const headers: Record<string, string> = { accept: 'application/json', authorization: `Bearer ${token}`, ...(post ? { 'X-Ploeg-Actor': options.actor!, 'X-Ploeg-Acting-User': options.actor! } : {}), ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}) };
      const response = await fetch(`${this.config!.url}/api/v1/operator/${path}`, { method: post ? 'POST' : 'GET', headers, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}), signal: AbortSignal.timeout(5000), redirect: 'manual' });
      if (post) this.cache.clear();
      if (!response.ok) {
        await response.body?.cancel();
        if (options.added && (response.status === 404 || (response.status === 400 && path.startsWith('events?')))) throw unsupported();
        if (post && decisionFailures[response.status]) { const [code, message] = decisionFailures[response.status]; throw new PloegError(response.status, code, message); }
        throw new PloegError(response.status === 404 ? 404 : 503, 'ploeg_unavailable', response.status === 404 ? 'Ploeg work item not found in your authorized teams.' : 'Ploeg could not provide its operator data. Check the connection and consumer access.');
      }
      if (!(response.headers.get('content-type') ?? '').includes('application/json') || Number(response.headers.get('content-length')) > 16_777_216 || !response.body) { await response.body?.cancel(); throw new PloegError(502, 'ploeg_response_size', 'Ploeg returned an unsupported response type or a snapshot larger than 16 MiB.'); }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 16_777_216) throw new PloegError(502, 'ploeg_response_size', 'Ploeg returned a snapshot larger than the 16 MiB operator limit.'); chunks.push(chunk.value); } } finally { await reader.cancel().catch(() => undefined); }
      const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8').split(token).join('[redacted]'));
      envelope(data);
      if (process.env[this.config!.tokenEnv!] !== token) throw new PloegError(503, 'ploeg_credential_changed', 'The Ploeg operator credential changed while reading this snapshot. Refresh to use the current access.');
      if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value!);
      if (!post && token === this.cachedToken) this.cache.set(path, { until: Date.now() + 5000, value: data });
      return structuredClone(data);
    } catch (error) { if (error instanceof PloegError) throw error; throw new PloegError(503, 'ploeg_unavailable', 'Ploeg could not be reached or returned incomplete data. Refresh to try again.'); }
  }
  async teams(user: User, fresh = false): Promise<PloegTeam[]> {
    this.authorize(user);
    const teams = this.demo ? ploegDemo.teams : array(envelope(await this.request('teams', fresh)).teams, team, 500);
    return teams.filter(team => this.allowed(user, team.id));
  }
  async items(user: User, selectedTeam: string, state: PloegState | 'all' = 'all', after = '0', fresh = false): Promise<PloegPage> {
    this.authorize(user);
    if (!this.allowed(user, selectedTeam)) throw new PloegError(404, 'ploeg_not_found', 'Ploeg team not found.');
    if (!/^(0|[1-9][0-9]{0,19})$/.test(after) || (state !== 'all' && !states.includes(state))) throw new PloegError(400, 'ploeg_filter', 'Choose a valid Ploeg state and page cursor.');
    const query = new URLSearchParams({ team: selectedTeam, after, limit: '25' });
    if (state !== 'all') query.set('state', state);
    const result = this.demo ? { items: this.demoItems().filter(item => item.team === selectedTeam && (state === 'all' || item.state === state) && BigInt(item.id) > BigInt(after)), nextCursor: null } : page(await this.request(`work-items?${query}`, fresh));
    if (result.items.some(item => item.team !== selectedTeam || (state !== 'all' && item.state !== state))) throw invalid();
    for (const entry of result.items) this.remember(entry.id, entry.title);
    return result;
  }
  async overview(user: User, selectedTeam?: string, fresh = false): Promise<PloegOverview> {
    this.authorize(user);
    const base = { configured: Boolean(this.config) || this.demo, available: false, demo: this.demo, teams: [] as PloegTeam[], ...(this.config?.trackerUrl ? { trackerUrl: this.config.trackerUrl } : {}) };
    if (!base.configured) return { ...base, message: 'Connect the authenticated Ploeg operator API in the server configuration.' };
    try {
      const teams = await this.teams(user, fresh);
      const selected = selectedTeam ?? teams[0]?.id;
      if (selected && !teams.some(team => team.id === selected)) throw new PloegError(404, 'ploeg_not_found', 'Ploeg team not found.');
      const lanes = selected ? Object.fromEntries(await Promise.all((['awaiting_review', 'needs_human', 'leased', 'queued', 'all'] as const).map(async state => [state, await this.items(user, selected, state, '0', fresh)]))) as PloegOverview['lanes'] : undefined;
      return { ...base, available: true, teams, selectedTeam: selected, lanes, fetchedAt: new Date().toISOString(), message: this.demo ? 'Illustrative Ploeg records. These runs were not executed; no model calls or charges.' : 'Read-only operator snapshot. Ploeg owns execution; open a linked workbench session to supervise interactive work.' };
    } catch (error) { if (error instanceof PloegError && [403, 404].includes(error.status)) throw error; return { ...base, message: error instanceof PloegError ? error.message : 'Ploeg operator data is unavailable.' }; }
  }
  async detail(user: User, id: string, fresh = false): Promise<PloegDetail> {
    this.authorize(user);
    if (!/^[1-9][0-9]{0,19}$/.test(id)) throw new PloegError(400, 'ploeg_id', 'Use a valid Ploeg work item identifier.');
    const demoDetail = this.demo ? ploegDemo.details[id] : undefined;
    const result = this.demo ? demoDetail && { ...demoDetail, item: this.demoItems().find(entry => entry.id === id)! } : detail(await this.request(`work-items/${id}`, fresh));
    if (!result || result.item.id !== id || !this.allowed(user, result.item.team)) throw new PloegError(404, 'ploeg_not_found', 'Ploeg work item not found in your authorized teams.');
    this.remember(result.item.id, result.item.title);
    return { ...structuredClone(result), demo: this.demo, fetchedAt: new Date().toISOString() };
  }
  /** Reads per-team counts and spend for a window, scoped to the caller's teams. */
  async summary(user: User, window: string, fresh = false): Promise<PloegSummary> {
    this.connected(user);
    if (!ploegWindows.includes(window as PloegWindow)) throw new PloegError(400, 'ploeg_filter', 'Choose a window of 24h, 7d or 30d.');
    let generatedAt: string; let teams: PloegTeamSummary[];
    if (this.demo) ({ generatedAt, teams } = ploegDemo.summary(window as PloegWindow, this.demoItems()));
    else {
      const data = envelope(await this.request(`summary?window=${window}`, fresh, { added: true }));
      if (data.window !== window) throw invalid();
      generatedAt = timestamp(data.generatedAt); teams = array(data.teams, teamSummary, 500);
      record(data.totals);
    }
    const visible = teams.filter(entry => this.allowed(user, entry.team));
    return { demo: this.demo, window: window as PloegWindow, generatedAt, teams: visible, totals: summaryTotals(visible), fetchedAt: new Date().toISOString() };
  }
  /** Lists Runs newest first; `before` pages to older Runs. */
  async runs(user: User, filter: PloegRunFilter, fresh = false): Promise<PloegRunsPage> {
    this.connected(user);
    if (filter.team && !this.allowed(user, filter.team)) throw new PloegError(404, 'ploeg_not_found', 'Ploeg team not found.');
    if ((filter.before && !/^[1-9][0-9]{0,19}$/.test(filter.before)) || (filter.state && !['pending', 'running', 'finished'].includes(filter.state)) || (filter.outcome && filter.state && filter.state !== 'finished') || (filter.outcome && !/^[a-z_]{1,32}$/.test(filter.outcome))) throw new PloegError(400, 'ploeg_filter', 'Choose a valid team, state, outcome and page cursor.');
    let runs: PloegRunRow[]; let nextBefore: string | null;
    if (this.demo) {
      const matching = ploegDemo.runs.filter(run => (!filter.team || run.team === filter.team) && (!filter.state || run.state === filter.state) && (!filter.outcome || run.outcome === filter.outcome) && (!filter.before || BigInt(run.id) < BigInt(filter.before)));
      runs = matching.slice(0, ploegDemo.pageSize); nextBefore = matching.length > ploegDemo.pageSize ? runs.at(-1)!.id : null;
    } else {
      const query = new URLSearchParams({ limit: String(pageSize) });
      for (const key of ['team', 'state', 'outcome', 'before'] as const) if (filter[key]) query.set(key, filter[key]!);
      const data = envelope(await this.request(`runs?${query}`, fresh, { added: true }));
      runs = array(data.runs, runRow, 200); nextBefore = nullable(data.nextBefore ?? null, identifier);
      if (runs.some(run => (filter.team && run.team !== filter.team) || (filter.state && run.state !== filter.state) || (filter.outcome && run.outcome !== filter.outcome))) throw invalid();
    }
    for (const run of runs) if (run.workItemTitle) this.remember(run.workItemId, run.workItemTitle);
    return { demo: this.demo, runs: runs.filter(run => this.allowed(user, run.team)), nextBefore, fetchedAt: new Date().toISOString() };
  }
  /** Lists audit events newest first across the caller's teams; `before` pages to older events. */
  async events(user: User, filter: { team?: string; before?: string }, fresh = false): Promise<PloegEventsPage> {
    this.connected(user);
    if (filter.team && !this.allowed(user, filter.team)) throw new PloegError(404, 'ploeg_not_found', 'Ploeg team not found.');
    if (filter.before && !/^[1-9][0-9]{0,19}$/.test(filter.before)) throw new PloegError(400, 'ploeg_filter', 'Choose a valid page cursor.');
    let events: PloegActivityEvent[]; let nextCursor: string | null;
    if (this.demo) {
      const matching = ploegDemo.events.filter(entry => (!filter.team || entry.team === filter.team) && (!filter.before || BigInt(entry.id) < BigInt(filter.before)));
      events = matching.slice(0, ploegDemo.pageSize); nextCursor = matching.length > ploegDemo.pageSize ? events.at(-1)!.id : null;
    } else {
      const query = new URLSearchParams({ order: 'desc', limit: String(pageSize) });
      if (filter.team) query.set('team', filter.team);
      if (filter.before) query.set('before', filter.before);
      const data = envelope(await this.request(`events?${query}`, fresh, { added: true }));
      events = array(data.events, activityEvent, 200); nextCursor = nullable(data.nextCursor ?? null, identifier);
      if (events.some(entry => filter.team && entry.team !== filter.team)) throw invalid();
    }
    const visible = structuredClone(events.filter(entry => this.allowed(user, entry.team)));
    const missing = [...new Set(visible.filter(entry => !entry.workItemTitle && !this.titles.has(entry.workItemId)).map(entry => entry.workItemId))].slice(0, 10);
    await Promise.all(missing.map(id => this.detail(user, id).catch(() => undefined)));
    for (const entry of visible) entry.workItemTitle ||= this.titles.get(entry.workItemId) ?? '';
    return { demo: this.demo, events: visible, nextCursor, fetchedAt: new Date().toISOString() };
  }
  /** Lists Work Items waiting in state `proposed` across the caller's teams, with where each came from. */
  async proposed(user: User, fresh = false): Promise<PloegProposedPage> {
    this.connected(user);
    const teams = await this.teams(user, fresh);
    const pages = await Promise.all(teams.map(team => this.items(user, team.id, 'proposed', '0', fresh)));
    const items = pages.flatMap(entry => entry.items).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (BigInt(b.id) > BigInt(a.id) ? 1 : -1)).slice(0, 50);
    const enriched = await Promise.all(items.map(async entry => {
      let source = entry.sourceWorkItemId;
      const origin = /^run-([1-9][0-9]{0,19})-[0-9]+$/.exec(entry.externalId);
      if (!source && !this.demo && entry.provider === 'ploeg' && origin) source = await this.request(`runs/${origin[1]}`, fresh).then(data => identifier(record(envelope(data).run).workItemId), () => undefined);
      if (source && !this.titles.has(source)) await this.detail(user, source).catch(() => undefined);
      return { ...entry, ...(source ? { sourceWorkItemId: source } : {}), sourceTitle: source ? this.titles.get(source) ?? '' : '' };
    }));
    return { demo: this.demo, items: enriched, truncated: pages.some(entry => entry.nextCursor !== null) || enriched.length === 50, fetchedAt: new Date().toISOString() };
  }
  /** Approves, rejects or cancels a Work Item for an operator or administrator, as that user. */
  async decide(user: User, id: string, decision: PloegDecision, reason = ''): Promise<{ workItemId: string; team: string; state: string; demo: boolean }> {
    if (user.role === 'viewer') throw new PloegError(403, 'forbidden', 'Viewers cannot change Ploeg work.');
    this.connected(user);
    if (!decisionKinds.includes(decision)) throw new PloegError(404, 'not_found', 'Ploeg operator view not found.');
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(user.id)) throw new PloegError(403, 'ploeg_actor', 'Your account identity cannot be recorded by Ploeg. Ask an administrator.');
    const text = reason.trim();
    if (text.length > 4096 || (decision === 'reject' && !text)) throw new PloegError(400, 'ploeg_decision', 'A rejection needs a reason of at most 4096 characters.');
    const current = await this.detail(user, id, true);
    if (decision !== 'cancel' && current.item.state !== 'proposed') throw new PloegError(409, 'ploeg_decision_conflict', 'Only a proposed Work Item can be approved or rejected. Refresh to see where it stands.');
    if (this.demo) {
      if (decision === 'cancel') throw new PloegError(409, 'ploeg_demo', 'Demo records are illustrative. Cancel is not available in the demo.');
      this.demoDecisions.set(id, decision);
      return { workItemId: id, team: current.item.team, state: decision === 'approve' ? 'queued' : 'withdrawn', demo: true };
    }
    const body = decision === 'cancel' ? undefined : text ? { reason: text } : {};
    const data = envelope(await this.request(`work-items/${id}/${decision}`, true, { actor: user.id, body }));
    const result = record(decision === 'cancel' ? data.cancellation : data.decision);
    const workItemId = identifier(typeof result.workItemId === 'number' ? String(result.workItemId) : result.workItemId);
    if (workItemId !== id) throw invalid();
    return { workItemId, team: typeof result.team === 'string' ? result.team : current.item.team, state: token(result.state), demo: false };
  }
  private remember(id: string, title: string): void {
    if (!title) return;
    if (this.titles.size >= 2000) this.titles.delete(this.titles.keys().next().value!);
    this.titles.set(id, title);
  }
  private demoItems(): PloegItem[] {
    return ploegDemo.items.map(entry => { const decision = this.demoDecisions.get(entry.id); return decision ? { ...entry, state: decision === 'approve' ? 'queued' : 'withdrawn' } : entry; });
  }
}
