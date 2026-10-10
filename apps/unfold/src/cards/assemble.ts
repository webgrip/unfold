import { micros, rfc3339Micros } from './go.ts';
import type { FactsPullRequest, FactsRun, WorkItemFacts } from './facts.ts';
import { walk, bounceCounts, type GateMap, type Journey, type Transition, type Reason } from './gate.ts';
import { computeFlow, type Calendar, type Flow, type FlowFacts, type KindMap } from './flow.ts';
import { derive, shownShape, summarize, measureFromFiles, type CardShape, type Pipeline, type Play, type Shape, type ShapeMatcher, type Timeline, type CI } from './playkpi.ts';
import { compileRarityRules, formula as rarityFormula, moduleOf, notCollected as rarityNotCollected, noveltyWindowMs, quarter as rarityQuarter, score as rarityScore, sortedUnique, tier as rarityTier, type FileLines, type RarityMatcher, type Facts as RarityFacts } from './rarity.ts';
import { compareStrings } from './rarity-go.ts';
import { computeGrade, crackWeight, warranty, crackedCeiling, type CardGrade } from './grade.ts';

/** The environment whose first deploy releases a merged change when the repository names none. */
export const defaultReleaseEnvironment = 'production';
/** The pull request label that marks a fix as a hotfix for a team that names none. */
export const defaultHotfixLabel = 'hotfix';
/** How long a merged set member must be live before its set can complete. */
export const settledDays = 30;
/** The skin of a repository without a card style. */
export const defaultCardSkin = 'default';

const dayMicros = 86_400_000_000;
const playLimit = 50;
const eventLimit = 1000;
const runLimit = 1000;
const crackListLimit = 100;
const setMemberLimit = 100;
const epicRefLimit = 20;
const rarityPathLimit = 20;

/** One crack attribution as Unfold stores it; the field names follow Ploeg's `legacyCrack` export so an import is a copy. */
export type CrackRecord = {
  id: string; team: string; state: 'proposed' | 'confirmed' | 'disputed' | 'unlinked' | 'evolved';
  cardWorkItemId: string; bugWorkItemId: string; bug: { provider: string; externalId: string };
  pullRequest: PullRequestRef | null; severity: string | null; share: string | null; discovery: string | null; steward: string; note: string | null;
  proposedBy: string; proposedAt: string; confirmedBy: string | null; confirmedAt: string | null; disputeUntil: string | null;
  disputedBy: string | null; disputedAt: string | null; disputeReason: string | null; resolvedBy: string | null; resolvedAt: string | null;
  resolution: 'upheld' | 'unlinked' | null; evolvedBy: string | null; evolvedAt: string | null;
  mendPullRequest: PullRequestRef | null; mendNumber: number | null; mendedAt: string | null; mendedBy: string | null; mendBySteward: boolean | null;
  mendConfirmedAt: string | null; mendReopenedAt: string | null;
};
/** A pull request named by Ploeg's id, forge, repository and number. */
export type PullRequestRef = { id: string; forge: string; owner: string; repo: string; number: number };
/** One frozen rarity, as Unfold stores it; the field names follow Ploeg's `legacyRarity` export. */
export type RarityRecord = {
  workItemId: string; formula: string; revealedTier: string; predictedTier: string; score: number; predictedScore: number; percentile: number | null;
  cohortTarget: string; cohortQuarter: string; cohortSize: number; inputs: CardRarityInputs; revealedAt: string; recordedAt: string; checkedAt: string;
};
/** A rarity about to be frozen: everything but the tiers, which the cohort decides when it is stored. */
export type RarityReveal = { target: string; quarter: string; score: number; predictedScore: number; inputs: CardRarityInputs; revealedAt: string };

/** The card rules of one Unfold deployment, resolved: what Ploeg's card configuration used to say. */
export type CardRules = {
  releaseEnvironment(repo: string): string;
  hotfixLabels(team: string): string[];
  rarityMatcher(repo: string): RarityMatcher;
  shapeMatcher(repo: string): ShapeMatcher;
  style(repo: string | null): CardStyle;
  rarity: boolean;
  flow: null | { kinds(provider: string, scope: string): KindMap | null; calendar(team: string): Calendar; gates?(provider: string, scope: string): GateMap | null };
};

/** What assembling a card reads besides the card's own facts. Every lookup is synchronous: Unfold's store is, and other Work Items' facts are fetched before assembly. Times are epoch microseconds. */
export type CardContext = {
  now: number;
  rules: CardRules;
  bots: ReadonlySet<string>;
  facts(id: string): WorkItemFacts | undefined;
  epicMembers(provider: string, epicExternalId: string, team: string): string[];
  workItemByExternal(provider: string, externalId: string, team: string): { id: string; title: string } | null;
  cracksOnCard(cardId: string): CrackRecord[];
  cracksOfBug(bugId: string): CrackRecord[];
  storedRarity(workItemId: string): RarityRecord | null;
  cohort(formula: string, target: string, quarter: string, exclude: string): number[];
  freezeRarity?(workItemId: string, reveal: RarityReveal): RarityRecord | null;
  legacyShape(pullRequestId: string): Shape | null;
  storedKpis?(pullRequestId: string): { timeline?: Timeline | null; ci?: CI | null } | null;
  touchedBefore(repo: string, path: string, from: number, until: number, exclude: string): boolean;
  liveUsage: boolean;
  taskUrl?(provider: string, externalId: string): string;
};

/** The skin and theme a card is drawn with. */
export type CardStyle = { skin: string; theme: string | null };
/** One review of a play. */
export type CardReview = { reviewer: string; state?: string; receivedAt: string; headSha?: string };
/** The first deploy of one environment that carried a merge commit. */
export type CardDeployment = { environment: string; firstDeployedAt: string; sha: string; url?: string };
/** One pull request of the card. */
export type CardPlay = {
  number: number; url?: string; state?: string; shiftId?: string; branch?: string; headSha?: string; mergeCommitSha?: string; mergedAt?: string; mergedBy?: string; closedAt?: string;
  additions?: number; deletions?: number; changedFiles?: number; ci?: { state: string; checks: { context: string; state: string }[]; headSha?: string; capturedAt: string };
  reviews: CardReview[]; deployments: CardDeployment[]; timeline?: Timeline; ciTiming?: CI; shape?: Shape;
  changedPaths?: { path: string; status: string; previousPath?: string }[]; changedPathsTruncated?: boolean;
};
/** Every started Run summed. */
export type CardTotals = {
  costUsd?: number; authorizedUsd: number; costStatus: string; inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number;
  turns?: number; toolCalls?: number; usageComplete: boolean; runs: number; failedRuns: number; rounds: number; shifts: number; firstRunAt?: string; lastRunAt?: string; runSeconds?: number;
};
/** A card's rarity inputs. */
export type CardRarityInputs = {
  reach: { modules: number | null; repos: number | null }; sensitive: { files: number | null; paths: string[] }; novelty: { share: number | null; files: number | null; novel: number | null };
  size: { countedLines: number | null }; set: boolean | null; truncated: boolean; notCollected: string[];
};
/** A card's rarity. */
export type CardRarity = { formula: string; predicted: string | null; revealed: string | null; tier: string; score: number | null; percentile: number | null; cohort: { target: string; quarter: string; size: number } | null; inputs: CardRarityInputs; revealedAt: string | null };
/** One confirmed crack on the card. */
export type CardCrack = {
  id: string; bug: { workItemId: string; ref?: string; title: string }; severity: string; share: string; discovery: string; proposedAt: string; confirmedAt: string; confirmedBy: string[];
  disputed: boolean; weight: number; warranty: string; mended: { at: string; by?: string; pr: number; bySteward: boolean; confirmedAt: string | null } | null;
};
/** The card's place in its epic's set. */
export type CardSet = { role: 'epic' | 'child'; epic: { workItemId: string | null; ref?: string; title: string }; position: number | null; size: number; children?: CardSetChild[]; complete: boolean };
/** One member of a set as the epic card lists it. */
export type CardSetChild = { workItemId: string; title: string; state: string; settled: boolean; cracked: boolean };
/** A Run card as Ploeg's `store.OperatorCard` encodes it (Ploeg ADR-0046): the browser contract Unfold's `parseCard` reads. */
export type CardJson = {
  workItemId: string; title: string; externalRef?: string; url?: string; team: string; target: { forge: string; owner: string; repo: string } | null; style: CardStyle;
  state: string; rarity: CardRarity | null; finish: 'matte'; grade: CardGrade | null; condition: { state: string; cracks: CardCrack[] } | null;
  steward: { name: string; source: string } | null; roster: { name: string; roles: string[] }[];
  crew: { role: string; writes: boolean; runs: number; costUsd?: number; inputTokens?: number; outputTokens?: number }[];
  plays: CardPlay[]; totals: CardTotals; events: { at: string; kind: string; actor?: string; detail: Record<string, string | number | boolean> }[];
  deployments: CardDeployment[]; release: { at: string; source: string; environment: string } | null;
  live: { runningRuns: number; observedAt: string; runSeconds: number; costUsd?: number; inputTokens?: number; outputTokens?: number; usageComplete: boolean } | null;
  gates: { current: string; history: { gate: string; enteredAt: string; leftAt?: string }[]; bounces: { from: string; to: string; at: string; reason: string; actor?: string }[]; rightFirstTime: Record<string, number> } | null;
  evolved?: true; set?: CardSet; flow?: Flow; pipeline?: Pipeline; shape?: CardShape; demo: boolean;
};

type Run = FactsRun & { started: number; finished: number | null; cost: number | null; held: boolean };
type Play_ = CardPlay & { id: string; forge: string; repo: string; openedAt: number; mergedAtUs: number | null; fullShape: Shape | null; facts: FactsPullRequest };
type Crack_ = { crack: CardCrack; bugCreated: number; primaries: number; mendBy: string };

/** The tracker reference of a Work Item, as Ploeg's `work.Reference`: `VIK-<id>` for Vikunja, `<provider>-<id>` otherwise, empty for manual work. */
export function itemRef(provider: string, externalId: string): string {
  if (provider === 'manual' || externalId === '') return '';
  if (provider === '' || provider === 'vikunja') return `VIK-${externalId}`;
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/gu, '-');
  return `${safe(provider)}-${safe(externalId)}`;
}

/** A card's state from its Work Item's state and its plays' states, oldest play first. */
export function cardState(itemState: string, plays: readonly string[]): string {
  if (itemState === 'withdrawn') return 'withdrawn';
  if (plays.length === 0) return 'drafting';
  let merged = false;
  for (const state of plays) {
    if (state === 'open' || state === '') return 'in_review';
    if (state === 'merged') merged = true;
  }
  return plays[plays.length - 1] === 'merged' || (merged && itemState === 'done') ? 'merged' : 'closed';
}

const pullLink = /\/(?:pulls?|merge_requests)\/([0-9]+)\/?$/u;
function linkNames(link: string, repo: string, number: number): boolean {
  let path: string;
  try { path = decodeURI(new URL(link).pathname); } catch { return false; }
  const m = pullLink.exec(path);
  return m !== null && m[1] === String(number) && path.toLowerCase().includes(`/${repo.toLowerCase()}/`);
}

function cleanUrl(value: string): string {
  let u: URL;
  try { u = new URL(value); } catch { return ''; }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !u.host || u.username || u.password) return '';
  const cut = value.search(/[?#]/u);
  return cut < 0 ? value : value.slice(0, cut);
}

const runTokenPattern = /\b[0-9a-f]{48}\b/gu;
const keyPattern = /\b(?:sk-[A-Za-z0-9_-]{8,}|Bearer [A-Za-z0-9._~+/=-]{8,})/giu;
function clean(value: unknown, key: string): unknown {
  if (Array.isArray(value)) return value.map(entry => clean(entry, key));
  if (value && typeof value === 'object') { for (const [k, v] of Object.entries(value)) (value as Record<string, unknown>)[k] = clean(v, k); return value; }
  if (typeof value === 'string') {
    const text = value.replace(runTokenPattern, '[redacted]').replace(keyPattern, '[redacted]');
    return key === 'url' || key === 'prUrl' || key === 'links' ? cleanUrl(text) : text;
  }
  return value;
}

const us = (value: string) => micros(value);
const usOrNull = (value: string | null | undefined) => (value === null || value === undefined ? null : micros(value));
const t = rfc3339Micros;

class Assembly {
  readonly ctx: CardContext;
  readonly facts: WorkItemFacts;
  readonly runs: Run[];
  readonly plays: Play_[] = [];
  cracks: Crack_[] = [];
  evolvedByAttribution = false;
  reverts = 0;
  hotfixes = 0;
  release: CardJson['release'] = null;
  card: CardJson;

  constructor(facts: WorkItemFacts, ctx: CardContext) {
    this.ctx = ctx;
    this.facts = facts;
    const item = facts.workItem;
    const held = new Set(facts.shifts.filter(s => s.reservedUsd > 0).map(s => s.id));
    this.runs = facts.runs.slice(0, runLimit).map(r => ({ ...r, started: usOrNull(r.startedAt) ?? NaN, finished: usOrNull(r.finishedAt), cost: r.usage?.costUsd ?? null, held: (r.shiftId !== null && held.has(r.shiftId)) || (r.state === 'running' && r.authorizedUsd > 0) }));
    this.card = {
      workItemId: item.id, title: item.title.slice(0, 4096), team: item.team,
      target: item.target && item.target.owner && item.target.repo ? { forge: item.target.forge, owner: item.target.owner, repo: item.target.repo } : null,
      style: ctx.rules.style(item.target && item.target.owner && item.target.repo ? `${item.target.owner}/${item.target.repo}` : null),
      state: '', rarity: null, finish: 'matte', grade: null, condition: null, steward: null, roster: [], crew: [], plays: [],
      totals: { authorizedUsd: 0, costStatus: 'not_reported', usageComplete: true, runs: 0, failedRuns: 0, rounds: 0, shifts: facts.shifts.length },
      events: [], deployments: [], release: null, live: null, gates: null, demo: false,
    };
    const ref = item.externalRef || itemRef(item.provider, item.externalId);
    if (item.provider !== 'manual' && item.externalId !== '' && ref) this.card.externalRef = ref;
    const url = item.url || (ctx.taskUrl ? ctx.taskUrl(item.provider, item.externalId) : '');
    if (url) this.card.url = url;
  }

  human(name: string | null | undefined): boolean { return Boolean(name) && !this.ctx.bots.has(name!.toLowerCase()); }
  started(): Run[] { return this.runs.filter(r => r.startedAt !== null); }

  loadPlays(): void {
    const prs = [...this.facts.pullRequests].sort((a, b) => a.number - b.number || Number(BigInt(a.id) - BigInt(b.id))).slice(0, playLimit);
    const checkpoints = ((this.facts as unknown as { checkpoints?: { at: string; pullRequestUrl: string }[] }).checkpoints ?? []);
    for (const pr of prs) {
      const repo = `${pr.owner}/${pr.repo}`;
      let opened = us(pr.firstSeenAt);
      for (const cp of checkpoints) if (linkNames(cp.pullRequestUrl, repo, pr.number) && us(cp.at) < opened) opened = us(cp.at);
      for (const r of this.runs) for (const l of r.links.slice(0, 30)) if (linkNames(l, repo, pr.number) && r.outcome === 'pr_opened' && r.finished !== null && r.finished < opened) opened = r.finished;
      const shift = pr.shiftId ? this.facts.shifts.find(s => s.id === pr.shiftId) : undefined;
      const play: Play_ = {
        number: pr.number, reviews: [], deployments: [], id: pr.id, forge: pr.forge, repo, openedAt: opened, mergedAtUs: usOrNull(pr.mergedAt), fullShape: null, facts: pr,
      };
      if (pr.url) play.url = pr.url;
      if (pr.state) play.state = pr.state;
      if (pr.shiftId) play.shiftId = pr.shiftId;
      const branch = pr.branch ?? shift?.branch ?? '';
      if (branch) play.branch = branch;
      if (pr.headSha) play.headSha = pr.headSha;
      if (pr.mergeCommitSha) play.mergeCommitSha = pr.mergeCommitSha;
      if (pr.mergedAt) play.mergedAt = t(us(pr.mergedAt));
      if (pr.mergedBy) play.mergedBy = pr.mergedBy;
      if (pr.closedAt) play.closedAt = t(us(pr.closedAt));
      if (pr.additions !== null) play.additions = pr.additions;
      if (pr.deletions !== null) play.deletions = pr.deletions;
      if (pr.changedFiles !== null) play.changedFiles = pr.changedFiles;
      if (pr.commitStatus) play.ci = { state: pr.commitStatus.state, checks: pr.commitStatus.checks.map(c => ({ context: c.context, state: c.state })), ...(pr.commitStatus.headSha ? { headSha: pr.commitStatus.headSha } : {}), capturedAt: t(us(pr.commitStatus.capturedAt)) };
      play.reviews = [...pr.reviews].map((r, index) => ({ r, index })).sort((a, b) => us(a.r.receivedAt) - us(b.r.receivedAt) || a.index - b.index).slice(0, 500).map(({ r }) => ({ reviewer: r.reviewer.slice(0, 256), ...(r.state ? { state: r.state } : {}), receivedAt: t(us(r.receivedAt)), ...(r.headSha ? { headSha: r.headSha } : {}) }));
      const stored = this.ctx.storedKpis ? this.ctx.storedKpis(pr.id) : undefined;
      const [timeline, ci] = stored === undefined ? derive(this.kpiPlay(pr), login => this.human(login)) : [stored?.timeline ?? null, stored?.ci ?? null];
      if (timeline) play.timeline = timeline;
      if (ci) play.ciTiming = ci;
      const full = this.measuredShape(pr, repo);
      if (full) { play.fullShape = full; play.shape = shownShape(full); }
      if (pr.changedPaths && pr.headSha !== null && pr.changedPaths.headSha === pr.headSha) {
        play.changedPaths = pr.changedPaths.paths.map(p => ({ path: p.path, status: p.status, ...(p.previousPath ? { previousPath: p.previousPath } : {}) }));
        play.changedPathsTruncated = pr.changedPaths.truncated;
      }
      this.plays.push(play);
    }
    const all = this.plays.flatMap((p, index) => p.facts.deployments.map(d => ({ p, index, d }))).sort((a, b) => us(a.d.firstDeployedAt) - us(b.d.firstDeployedAt) || compareStrings(a.d.environment, b.d.environment)).slice(0, 500);
    const seen = new Set<string>();
    for (const { p, d } of all) {
      const deployment: CardDeployment = { environment: d.environment, firstDeployedAt: t(us(d.firstDeployedAt)), sha: d.sha, ...(d.url ? { url: d.url.slice(0, 2048) } : {}) };
      p.deployments.push(deployment);
      if (!seen.has(d.environment)) { seen.add(d.environment); this.card.deployments.push({ ...deployment }); }
    }
  }

  kpiPlay(pr: FactsPullRequest): Play {
    return {
      openedAt: usOrNull(pr.openedAt), author: pr.author ?? '', draft: pr.draft, mergedAt: pr.state === 'merged' ? usOrNull(pr.mergedAt) : null, headSha: pr.headSha ?? '',
      reviews: pr.reviews.map(r => ({ reviewer: r.reviewer, state: r.state ?? '', headSha: r.headSha ?? '', at: us(r.receivedAt) })),
      activityCapturedAt: usOrNull(pr.activityCapturedAt), activityTruncated: pr.activityTruncated === true,
      events: pr.events.map(e => ({ kind: e.kind, actor: e.actor, at: us(e.at), state: e.state ?? '', headSha: e.headSha ?? '' })),
      commits: pr.commits, firstCommitAt: usOrNull(pr.firstCommitAt), forcePushes: pr.forcePushes,
      ciCapturedAt: usOrNull(pr.ciRunsCapturedAt), ciSource: pr.ciRunsSource ?? '', ciTruncated: pr.ciRunsTruncated === true,
      runs: pr.ciRuns.map(r => ({ id: r.key, sha: r.headSha, workflow: r.workflow, status: r.status, createdAt: usOrNull(r.createdAt), startedAt: usOrNull(r.startedAt), completedAt: usOrNull(r.completedAt), jobs: r.jobs.map(j => ({ name: j.name, status: j.status, startedAt: usOrNull(j.startedAt), completedAt: usOrNull(j.completedAt), queuedSeconds: j.queuedSeconds ?? null, attempt: j.attempt })) })),
    };
  }

  measuredShape(pr: FactsPullRequest, repo: string): Shape | null {
    const legacy = this.ctx.legacyShape(pr.id);
    if (legacy) return legacy;
    if (pr.state !== 'merged' || pr.filesCapturedAt === null || pr.files.length === 0 || pr.files.some(f => f.indentation === null)) return null;
    const total = pr.additions !== null && pr.deletions !== null ? pr.additions + pr.deletions : null;
    return measureFromFiles({ files: pr.files, filesTruncated: pr.filesTruncated === true, total, size: this.ctx.rules.rarityMatcher(repo), paths: this.ctx.rules.shapeMatcher(repo), capturedAt: us(pr.filesCapturedAt) });
  }

  latestMerged(): Play_ | null {
    let latest: Play_ | null = null;
    for (const p of this.plays) {
      if (p.state !== 'merged') continue;
      if (latest === null || (p.mergedAtUs ?? -Infinity) >= (latest.mergedAtUs ?? -Infinity)) latest = p;
    }
    return latest;
  }

  releaseOf(): CardJson['release'] {
    const play = this.latestMerged();
    if (!play) return null;
    const environment = this.ctx.rules.releaseEnvironment(play.repo);
    const deployed = play.deployments.find(d => d.environment === environment);
    if (deployed) return { at: deployed.firstDeployedAt, source: 'deploy', environment };
    if (!play.repo.includes('/')) return null;
    const reported = this.facts.deployEnvironments.some(e => e.forge === play.forge && e.owner.toLowerCase() === play.facts.owner.toLowerCase() && e.repo.toLowerCase() === play.facts.repo.toLowerCase() && e.environment === environment);
    if (reported || play.mergedAtUs === null) return null;
    return { at: t(play.mergedAtUs), source: 'merge', environment };
  }

  transitions(): Transition[] {
    return this.facts.gateTransitions.slice(0, 500).map(g => ({ gate: g.gate, status: g.status, at: us(g.at), actor: g.actor ?? '', reason: (g.reason ?? '') as Reason | '' }));
  }

  loadCondition(): void {
    const id = this.facts.workItem.id;
    const labels = this.ctx.rules.hotfixLabels(this.facts.workItem.team).map(l => l.toLowerCase());
    const counted = this.ctx.cracksOnCard(id).filter(c => (c.state === 'confirmed' || c.state === 'disputed') && c.confirmedAt !== null)
      .sort((a, b) => us(a.confirmedAt!) - us(b.confirmedAt!) || Number(BigInt(a.id) - BigInt(b.id))).slice(0, crackListLimit);
    for (const c of counted) {
      const bug = this.ctx.facts(c.bugWorkItemId);
      const primaries = this.ctx.cracksOfBug(c.bugWorkItemId).filter(o => o.share === 'primary' && (o.state === 'confirmed' || o.state === 'disputed')).length;
      const crack: CardCrack = {
        id: c.id, bug: { workItemId: c.bugWorkItemId, title: (bug?.workItem.title ?? '').slice(0, 4096) }, severity: c.severity ?? '', share: c.share ?? '', discovery: c.discovery ?? '',
        proposedAt: t(us(c.proposedAt)), confirmedAt: t(us(c.confirmedAt!)), confirmedBy: [c.proposedBy, c.confirmedBy ?? ''], disputed: c.state === 'disputed', weight: 0, warranty: '', mended: null,
      };
      const ref = itemRef(c.bug.provider, c.bug.externalId);
      if (ref) crack.bug.ref = ref;
      if (c.mendedAt !== null && c.mendNumber !== null) crack.mended = { at: t(us(c.mendedAt)), ...(c.mendedBy ? { by: c.mendedBy } : {}), pr: c.mendNumber, bySteward: c.mendBySteward === true, confirmedAt: c.mendConfirmedAt === null ? null : t(us(c.mendConfirmedAt)) };
      this.cracks.push({ crack, bugCreated: bug ? us(bug.workItem.createdAt) : NaN, primaries, mendBy: c.mendedAt !== null && c.mendNumber !== null ? c.mendedBy ?? '' : '' });
    }
    this.evolvedByAttribution = this.ctx.cracksOnCard(id).some(c => c.state === 'evolved');
    this.reverts = this.facts.pullRequests.reduce((n, p) => n + p.reverts.length, 0);
    const fixes = new Set<string>();
    for (const c of this.ctx.cracksOnCard(id)) {
      if (c.state !== 'confirmed' && c.state !== 'disputed') continue;
      for (const p of this.ctx.facts(c.bugWorkItemId)?.pullRequests ?? []) if (p.state === 'merged' && (p.labels ?? []).some(l => labels.includes(l.toLowerCase()))) fixes.add(p.id);
    }
    this.hotfixes = fixes.size;
  }

  condition(): [CardJson['condition'], number, boolean] {
    if (this.cracks.length === 0) return [null, 0, false];
    const liveSince = this.release ? us(this.release.at) : null;
    const out = { state: 'mended', cracks: [] as CardCrack[] };
    let total = 0;
    let inWarranty = false;
    for (const k of this.cracks) {
      const cr: CardCrack = structuredClone(k.crack);
      if (cr.mended && !this.human(cr.mended.by)) delete cr.mended.by;
      const [name, factor] = warranty(liveSince, k.bugCreated);
      cr.warranty = name;
      cr.weight = crackWeight(cr.severity, cr.share, cr.discovery, k.primaries, factor, cr.mended);
      total += cr.weight;
      if (name !== 'history') inWarranty = true;
      if (!cr.mended || cr.mended.confirmedAt === null) out.state = 'cracked';
      out.cracks.push(cr);
    }
    return [out, total, inWarranty];
  }

  totals(): CardTotals {
    const out: CardTotals = { authorizedUsd: 0, costStatus: 'not_reported', usageComplete: true, runs: 0, failedRuns: 0, rounds: 0, shifts: this.facts.shifts.length };
    const runs = this.started();
    out.runs = runs.length;
    let cost = 0, costs = 0, held = false, seconds = 0, finished = 0;
    const sums: Record<string, [number, number]> = {};
    const add = (key: string, v: number | undefined) => { if (v === undefined) return; const s = (sums[key] ??= [0, 0]); s[0] += v; s[1]++; };
    const rounds = new Set<string>();
    let first: number | null = null, last: number | null = null;
    for (const r of runs) {
      out.authorizedUsd += r.authorizedUsd;
      if (r.cost !== null) { cost += r.cost; costs++; }
      if (r.held) held = true;
      for (const key of ['inputTokens', 'outputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens', 'turns', 'toolCalls'] as const) add(key, r.usage?.[key]);
      if (r.shiftId !== null) rounds.add(`${r.shiftId}:${r.round}`);
      if (r.state === 'finished' && (r.outcome === 'failed' || r.outcome === 'stuck')) out.failedRuns++;
      if (first === null || r.started < first) first = r.started;
      let end = r.started;
      if (r.finished !== null) { end = r.finished; const d = r.finished - r.started; if (d > 0) seconds += Math.trunc(d / 1e6); finished++; }
      if (last === null || end > last) last = end;
    }
    if (first !== null) out.firstRunAt = t(first);
    if (last !== null) out.lastRunAt = t(last);
    out.rounds = rounds.size;
    if (finished > 0) out.runSeconds = seconds;
    if (costs > 0) out.costUsd = cost;
    out.costStatus = held ? 'reserved' : costs > 0 ? 'observed' : 'not_reported';
    for (const key of ['inputTokens', 'outputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens', 'turns', 'toolCalls'] as const) if (sums[key]) out[key] = sums[key]![0];
    const reported = (key: string) => sums[key]?.[1] ?? 0;
    if (costs < runs.length || reported('inputTokens') < runs.length || reported('outputTokens') < runs.length) out.usageComplete = false;
    for (const key of ['cacheReadInputTokens', 'cacheCreationInputTokens', 'turns', 'toolCalls']) if (reported(key) > 0 && reported(key) < runs.length) out.usageComplete = false;
    return out;
  }

  crew(): CardJson['crew'] {
    const order: string[] = [];
    const by = new Map<string, { crew: CardJson['crew'][number]; cost: number; costs: number; inp: number; inN: number; out: number; outN: number }>();
    for (const r of this.started()) {
      const key = `${r.role}\u0000${r.writes}`;
      let a = by.get(key);
      if (!a) { a = { crew: { role: r.role, writes: r.writes, runs: 0 }, cost: 0, costs: 0, inp: 0, inN: 0, out: 0, outN: 0 }; by.set(key, a); order.push(key); }
      a.crew.runs++;
      if (r.cost !== null) { a.cost += r.cost; a.costs++; }
      if (r.usage?.inputTokens !== undefined) { a.inp += r.usage.inputTokens; a.inN++; }
      if (r.usage?.outputTokens !== undefined) { a.out += r.usage.outputTokens; a.outN++; }
    }
    return order.map(key => { const a = by.get(key)!; return { ...a.crew, ...(a.costs > 0 ? { costUsd: a.cost } : {}), ...(a.inN > 0 ? { inputTokens: a.inp } : {}), ...(a.outN > 0 ? { outputTokens: a.out } : {}) }; });
  }

  roster(): CardJson['roster'] {
    const roles = new Map<string, Set<string>>();
    const mark = (name: string | null | undefined, role: string) => { if (!this.human(name)) return; let set = roles.get(name!); if (!set) roles.set(name!, set = new Set()); set.add(role); };
    for (const p of this.plays) { mark(p.mergedBy, 'merger'); for (const r of p.reviews) mark(r.reviewer, 'reviewer'); }
    for (const k of this.cracks) if (k.crack.mended && !k.crack.mended.bySteward) mark(k.mendBy, 'cosigner');
    let current = '';
    for (const g of this.facts.gateTransitions.slice(0, 500)) {
      if (!['development', 'test', 'acceptance', 'done'].includes(g.gate) || g.gate === current) continue;
      if (current === 'test') mark(g.actor, 'qa');
      if (current === 'acceptance') mark(g.actor, 'acceptor');
      current = g.gate;
    }
    return [...roles.keys()].sort(compareStrings).map(name => ({ name, roles: ['merger', 'reviewer', 'qa', 'acceptor', 'cosigner'].filter(role => roles.get(name)!.has(role)) }));
  }

  steward(): CardJson['steward'] {
    for (let i = this.plays.length - 1; i >= 0; i--) { const p = this.plays[i]!; if (p.state === 'merged' && this.human(p.mergedBy)) return { name: p.mergedBy!, source: 'merged_by' }; }
    let approver: CardReview | null = null;
    for (const p of this.plays) for (const r of p.reviews) if (r.state === 'approved' && this.human(r.reviewer) && (approver === null || !(us(r.receivedAt) < us(approver.receivedAt)))) approver = r;
    return approver ? { name: approver.reviewer, source: 'approver' } : null;
  }

  events(): CardJson['events'] {
    const out: { at: number; seq: number; e: CardJson['events'][number] }[] = [];
    const add = (at: number, kind: string, actor: string | null | undefined, detail: Record<string, string | number | boolean>) => {
      out.push({ at, seq: out.length, e: { at: t(at), kind, ...(this.human(actor) ? { actor: actor! } : {}), detail } });
    };
    const runs = this.started();
    let first = -1;
    runs.forEach((r, i) => { if (first < 0 || r.started < runs[first]!.started) first = i; });
    if (first >= 0) add(runs[first]!.started, 'minted', '', { runId: runs[first]!.id });
    for (const r of runs) {
      add(r.started, 'run_started', '', { runId: r.id, role: r.role, round: r.round, writes: r.writes });
      if (r.finished !== null) add(r.finished, 'run_finished', '', { runId: r.id, role: r.role, ...(r.outcome !== null ? { outcome: r.outcome } : {}) });
    }
    for (const p of this.plays) {
      add(p.openedAt, 'pr_opened', '', { number: p.number });
      for (const r of p.reviews) add(us(r.receivedAt), 'review', r.reviewer, { number: p.number, ...(r.state ? { state: r.state } : {}) });
      if (p.state === 'merged' && p.mergedAtUs !== null) add(p.mergedAtUs, 'merged', p.mergedBy, { number: p.number });
      if (p.state === 'closed' && p.closedAt) add(us(p.closedAt), 'closed', '', { number: p.number });
    }
    for (const w of this.facts.workItem.withdrawals) {
      let actor = '', source = 'tracker';
      if (w.actor.startsWith('operator:')) { source = 'operator'; const rest = w.actor.slice('operator:'.length); const cut = rest.indexOf(':'); if (cut >= 0) actor = rest.slice(cut + 1); }
      add(us(w.at), 'withdrawn', actor, { source });
    }
    out.sort((a, b) => a.at - b.at || a.seq - b.seq);
    return out.slice(0, eventLimit).map(x => x.e);
  }

  live(): CardJson['live'] {
    const now = this.ctx.now;
    const live: NonNullable<CardJson['live']> = { runningRuns: 0, observedAt: t(now), runSeconds: 0, usageComplete: true };
    let cost = 0, costs = 0, readable = true, inp = 0, inN = 0, out = 0, outN = 0;
    const runs = this.started();
    const readings = new Map(this.ctx.liveUsage ? this.facts.liveUsage.map(l => [l.runId, l]) : []);
    for (const r of runs) {
      if (r.state !== 'running' || r.finished !== null) {
        if (r.finished !== null) { const d = r.finished - r.started; if (d > 0) live.runSeconds += Math.trunc(d / 1e6); }
        if (r.cost !== null) { cost += r.cost; costs++; }
        if (r.usage?.inputTokens !== undefined) { inp += r.usage.inputTokens; inN++; }
        if (r.usage?.outputTokens !== undefined) { out += r.usage.outputTokens; outN++; }
        continue;
      }
      live.runningRuns++;
      const d = now - r.started;
      if (d > 0) live.runSeconds += Math.trunc(d / 1e6);
      const reading = readings.get(r.id);
      if (!readable || !reading || !(reading.costUsd >= 0) || !Number.isFinite(reading.costUsd) || reading.inputTokens < 0 || reading.outputTokens < 0) { readable = false; continue; }
      cost += reading.costUsd; costs++;
      inp += reading.inputTokens; inN++;
      out += reading.outputTokens; outN++;
    }
    if (live.runningRuns === 0) return null;
    if (!readable) { live.usageComplete = false; return live; }
    if (costs > 0) live.costUsd = cost;
    if (inN > 0) live.inputTokens = inp;
    if (outN > 0) live.outputTokens = out;
    if (costs < runs.length || inN < runs.length || outN < runs.length) live.usageComplete = false;
    return live;
  }

  gates(): [Journey | null, boolean] {
    const journey = walk(this.transitions());
    if (!journey) return [null, false];
    this.card.gates = {
      current: journey.Current,
      history: journey.History.map(v => ({ gate: v.Gate, enteredAt: v.Entered, ...(v.Left !== null ? { leftAt: v.Left } : {}) })),
      bounces: (journey.Bounces ?? []).map(b => ({ from: b.From, to: b.To, at: b.At, reason: b.Reason, ...(this.human(b.Actor) ? { actor: b.Actor } : {}) })),
      rightFirstTime: { ...journey.RightFirstTime } as Record<string, number>,
    };
    return [journey, journey.Evolved];
  }

  grade(journey: Journey | null, weight: number, cracked: boolean): CardGrade | null {
    let verdict = false, merged = false, changeRequests = 0;
    const rounds = new Set<string>(), rework = new Set<string>();
    for (const p of this.plays) {
      if (p.state === 'merged') merged = true;
      for (const r of p.reviews) {
        if (!this.human(r.reviewer)) continue;
        const round = `${p.number}@${r.headSha ?? ''}`;
        if (r.state === 'approved') verdict = true;
        if (r.state === 'changes_requested') { verdict = true; changeRequests++; rework.add(round); }
        rounds.add(round);
      }
    }
    if (!verdict && !merged) return null;
    const totals = this.card.totals;
    return computeGrade({
      now: this.ctx.now, liveSince: this.release ? us(this.release.at) : null, liveSinceText: this.release ? this.release.at : null,
      costUsd: totals.costUsd ?? null, authorizedUsd: totals.authorizedUsd, defectBounces: journey ? (journey.Bounces ?? []).filter(b => bounceCounts(b)).length : null,
      plays: this.plays.length, failedRuns: totals.failedRuns, changeRequests, reviewRounds: rounds.size, reworkRounds: rework.size,
      crackWeight: weight, cracked, reverts: this.reverts, hotfixes: this.hotfixes,
    });
  }

  flow(): Flow | undefined {
    const rules = this.ctx.rules.flow;
    if (!rules) return undefined;
    const item = this.facts.workItem;
    const scope = (item as unknown as { externalScope?: string }).externalScope ?? '';
    const admitted = (item as unknown as { admittedAt?: string | null }).admittedAt ?? null;
    const statuses = this.facts.statusTransitions.length > 500 ? this.facts.statusTransitions.slice(-500) : this.facts.statusTransitions;
    const facts: FlowFacts = {
      now: this.ctx.now, statuses: statuses.map(s => ({ status: s.status, gate: s.gate ?? rules.gates?.(item.provider, scope)?.resolve([s.status])?.gate ?? '', at: us(s.at), observed: s.observed })),
      truncated: this.facts.statusTransitions.length > 500 || this.facts.truncated.statusTransitions,
      trackerCreated: usOrNull(item.trackerCreatedAt), firstSeen: us(item.createdAt), admitted: usOrNull(admitted),
      open: this.card.state !== 'withdrawn' && this.card.state !== 'closed', estimateSeconds: item.estimateSeconds,
      calendar: rules.calendar(item.team), runs: this.started().map(r => ({ started: r.started, finished: r.finished })),
      ...(rules.kinds(item.provider, scope) ? { kinds: rules.kinds(item.provider, scope)! } : {}),
    };
    for (const p of this.plays) if (facts.firstPlay === undefined || facts.firstPlay === null || p.openedAt < (facts.firstPlay as number)) facts.firstPlay = p.openedAt;
    const play = this.latestMerged();
    if (play && play.mergedAtUs !== null) {
      facts.merge = play.mergedAtUs;
      facts.releaseEnvironment = this.ctx.rules.releaseEnvironment(play.repo);
      facts.deploys = play.deployments.map(d => ({ environment: d.environment, at: us(d.firstDeployedAt) }));
    }
    if (this.release) facts.release = us(this.release.at);
    facts.restores = this.cracks.filter(k => k.crack.mended).map(k => ({ crackId: k.crack.id, confirmed: us(k.crack.confirmedAt), mended: us(k.crack.mended!.at) }));
    return computeFlow(facts);
  }

  set(): CardSet | undefined {
    const item = this.facts.workItem;
    if (!item.provider || !item.externalId || item.provider === 'manual') return undefined;
    const firstShift = (f: WorkItemFacts) => f.shifts.reduce<number | null>((m, s) => { const at = us(s.openedAt); return m === null || at < m ? at : m; }, null);
    const counts = (firstSeen: number, shift: number | null) => shift === null || !(firstSeen > shift);
    const members = (epicId: string) => {
      const out: { f: WorkItemFacts; shift: number | null }[] = [];
      for (const id of this.ctx.epicMembers(item.provider, epicId, item.team)) {
        const f = id === item.id ? this.facts : this.ctx.facts(id);
        if (!f || f.workItem.team !== item.team) continue;
        const relation = f.workItem.epics.find(e => e.provider === item.provider && e.externalId === epicId && e.removedAt === null);
        if (!relation) continue;
        out.push({ f, shift: firstShift(f) });
        (out[out.length - 1] as { seen?: number }).seen = us(relation.firstSeenAt);
      }
      out.sort((a, b) => (a.shift === null ? 1 : 0) - (b.shift === null ? 1 : 0) || (a.shift ?? 0) - (b.shift ?? 0) || Number(BigInt(a.f.workItem.id) - BigInt(b.f.workItem.id)));
      return out.slice(0, setMemberLimit).filter(m => counts((m as { seen?: number }).seen!, m.shift));
    };
    let epicId = item.externalId, epicTitle = this.card.title, role: 'epic' | 'child' = 'epic';
    let list = members(epicId);
    if (list.length === 0) {
      role = 'child';
      const own = item.epics.filter(e => e.removedAt === null).sort((a, b) => us(a.firstSeenAt) - us(b.firstSeenAt) || compareStrings(a.externalId, b.externalId)).slice(0, epicRefLimit);
      const shift = firstShift(this.facts);
      const found = own.find(e => counts(us(e.firstSeenAt), shift));
      if (!found) return undefined;
      epicId = found.externalId; epicTitle = found.title;
      list = members(epicId);
    }
    if (list.length === 0) return undefined;
    const set: CardSet = { role, epic: { workItemId: null, title: epicTitle }, position: null, size: list.length, complete: true };
    const ref = itemRef(item.provider, epicId);
    if (ref) set.epic.ref = ref;
    if (role === 'epic') set.epic.workItemId = item.id;
    else {
      const epicItem = this.ctx.workItemByExternal(item.provider, epicId, item.team);
      if (epicItem) { set.epic.workItemId = epicItem.id; if (epicItem.title) set.epic.title = epicItem.title.slice(0, 4096); }
    }
    const children: CardSetChild[] = list.map(({ f }) => {
      const prs = [...f.pullRequests].sort((a, b) => a.number - b.number || Number(BigInt(a.id) - BigInt(b.id)));
      const cracked = this.ctx.cracksOnCard(f.workItem.id).some(c => (c.state === 'confirmed' || c.state === 'disputed') && c.mendConfirmedAt === null);
      const child: CardSetChild = { workItemId: f.workItem.id, title: f.workItem.title.slice(0, 4096), state: cardState(f.workItem.state, prs.map(p => p.state ?? '')), settled: false, cracked };
      let latest: FactsPullRequest | null = null;
      for (const p of prs) if (p.state === 'merged' && (latest === null || (usOrNull(p.mergedAt) ?? -Infinity) >= (usOrNull(latest.mergedAt) ?? -Infinity))) latest = p;
      if (child.state === 'merged' && latest) {
        const live = this.liveSince(f, latest);
        child.settled = live !== null && this.ctx.now - live >= settledDays * dayMicros;
      }
      return child;
    });
    children.forEach((child, i) => {
      set.complete = set.complete && child.settled && !child.cracked;
      if (role === 'child' && child.workItemId === item.id) set.position = i + 1;
    });
    if (role === 'child' && set.position === null) return undefined;
    if (role === 'epic' && children.length > 0) set.children = children;
    return set;
  }

  liveSince(f: WorkItemFacts, p: FactsPullRequest): number | null {
    const repo = `${p.owner}/${p.repo}`;
    const environment = this.ctx.rules.releaseEnvironment(repo);
    const deploy = p.deployments.find(d => d.environment === environment);
    if (deploy) return us(deploy.firstDeployedAt);
    const known = f.deployEnvironments.some(e => e.forge === p.forge && e.owner.toLowerCase() === p.owner.toLowerCase() && e.repo.toLowerCase() === p.repo.toLowerCase() && e.environment === environment);
    return known ? null : usOrNull(p.mergedAt);
  }

  rarityTarget(): string {
    if (this.card.target) return `${this.card.target.owner}/${this.card.target.repo}`.toLowerCase();
    const latest = this.latestMerged();
    if (latest) return latest.repo.toLowerCase();
    return this.plays.length > 0 ? this.plays[this.plays.length - 1]!.repo.toLowerCase() : '';
  }

  touches(plays: Play_[]): { repo: string; path: string; at: number }[] {
    const first = new Map<string, number>();
    for (const p of plays) {
      if (p.facts.filesCapturedAt === null || p.mergedAtUs === null) continue;
      const m = this.ctx.rules.rarityMatcher(p.repo);
      for (const f of p.facts.files) {
        if (m.excluded(f.path)) continue;
        const key = `${p.repo.toLowerCase()}\u0000${f.path}`;
        const at = first.get(key);
        if (at === undefined || p.mergedAtUs < at) first.set(key, p.mergedAtUs);
      }
    }
    return [...first.entries()].map(([key, at]) => { const [repo, path] = key.split('\u0000') as [string, string]; return { repo, path, at }; })
      .sort((a, b) => compareStrings(a.repo, b.repo) || compareStrings(a.path, b.path));
  }

  mergedPlays(): Play_[] { return this.plays.filter(p => p.state === 'merged'); }
  previousPlays(): Play_[] { return this.plays.length < 2 ? [] : this.plays.slice(0, -1).filter(p => p.state === 'merged'); }

  countedLines(p: Play_): number | null {
    if (p.facts.filesCapturedAt === null) return null;
    const files: FileLines[] = [...p.facts.files].sort((a, b) => compareStrings(a.path, b.path)).map(f => ({ path: f.path, additions: f.additions, deletions: f.deletions }));
    const total = p.additions !== undefined && p.deletions !== undefined ? p.additions + p.deletions : null;
    return this.ctx.rules.rarityMatcher(p.repo).countedLines(files, total, p.facts.filesTruncated === true);
  }

  newRarityInputs(): CardRarityInputs {
    return { reach: { modules: null, repos: null }, sensitive: { files: null, paths: [] }, novelty: { share: null, files: null, novel: null }, size: { countedLines: null }, set: null, truncated: false, notCollected: [...rarityNotCollected] };
  }

  fileFacts(plays: Play_[], seen: Set<string>, inputs: CardRarityInputs, facts: RarityFacts): void {
    const touched = this.touches(plays);
    if (touched.length === 0) return;
    const modules = new Set<string>();
    const sensitive: string[] = [];
    let novel = 0;
    for (const touch of touched) {
      modules.add(`${touch.repo}\u0000${moduleOf(touch.path)}`);
      if (this.ctx.rules.rarityMatcher(touch.repo).sensitive(touch.path)) sensitive.push(touch.path);
      if (!seen.has(`${touch.repo}\u0000${touch.path}\u0000${touch.at}`)) novel++;
    }
    facts.modules = modules.size; facts.sensitiveFiles = sensitive.length; facts.files = touched.length; facts.novelFiles = novel;
    inputs.reach.modules = modules.size;
    inputs.sensitive.files = sensitive.length;
    inputs.sensitive.paths = sortedUnique(sensitive).slice(0, rarityPathLimit);
    inputs.novelty = { share: novel / touched.length, files: touched.length, novel };
    if (plays.some(p => p.facts.filesTruncated === true)) inputs.truncated = true;
  }

  distinctRepos(plays: Play_[]): number | null {
    return plays.length === 0 ? null : new Set(plays.map(p => p.repo.toLowerCase())).size;
  }

  revealedFacts(seen: Set<string>): { facts: RarityFacts; inputs: CardRarityInputs } | null {
    const merged = this.mergedPlays();
    if (!this.release || this.card.state !== 'merged' || merged.length === 0 || merged.some(p => p.facts.filesCapturedAt === null)) return null;
    const r = { facts: {} as RarityFacts, inputs: this.newRarityInputs() };
    this.fileFacts(merged, seen, r.inputs, r.facts);
    r.facts.repos = this.distinctRepos(merged);
    r.inputs.reach.repos = r.facts.repos;
    let lines = 0, known = true;
    for (const p of merged) { const n = this.countedLines(p); if (n === null) { known = false; break; } lines += n; }
    if (known) { r.facts.countedLines = lines; r.inputs.size.countedLines = lines; }
    return r;
  }

  predictedFacts(seen: Set<string>): { facts: RarityFacts; inputs: CardRarityInputs } {
    const r = { facts: {} as RarityFacts, inputs: this.newRarityInputs() };
    const previous = this.previousPlays();
    this.fileFacts(previous, seen, r.inputs, r.facts);
    if (this.plays.length > 0) r.facts.repos = this.distinctRepos(this.plays);
    else if (this.card.target) r.facts.repos = 1;
    r.inputs.reach.repos = r.facts.repos ?? null;
    if (this.plays.length > 0) {
      let lines = 0, known = true;
      for (const p of previous) { const n = this.countedLines(p); if (n === null) { known = false; break; } lines += n; }
      const current = this.plays[this.plays.length - 1]!;
      if (current.additions !== undefined && current.deletions !== undefined) lines += current.additions + current.deletions;
      else if (previous.length === 0) known = false;
      if (known) { r.facts.countedLines = lines; r.inputs.size.countedLines = lines; }
    }
    const set = this.card.set !== undefined;
    r.facts.set = set;
    r.inputs.set = set;
    return r;
  }

  noveltySeen(): Set<string> {
    const seen = new Set<string>();
    const touched = new Map<string, { repo: string; path: string; at: number }>();
    for (const x of [...this.touches(this.mergedPlays()), ...this.touches(this.previousPlays())]) touched.set(`${x.repo}\u0000${x.path}\u0000${x.at}`, x);
    const window = noveltyWindowMs * 1000;
    for (const [key, x] of touched) if (this.ctx.touchedBefore(x.repo, x.path, x.at - window, x.at, this.facts.workItem.id)) seen.add(key);
    return seen;
  }

  fromStored(s: RarityRecord, setComplete: boolean): CardRarity {
    return { formula: s.formula, predicted: s.predictedTier, revealed: s.revealedTier, tier: setComplete ? 'legendary' : s.revealedTier, score: s.score, percentile: s.percentile, cohort: { target: s.cohortTarget, quarter: s.cohortQuarter, size: s.cohortSize }, inputs: s.inputs, revealedAt: t(us(s.revealedAt)) };
  }

  rarity(): CardRarity | null {
    const id = this.facts.workItem.id;
    const setComplete = this.card.set !== undefined && this.card.set.role === 'epic' && this.card.set.complete;
    const stored = this.ctx.storedRarity(id);
    if (stored) return this.fromStored(stored, setComplete);
    const target = this.rarityTarget();
    const minted = this.started().length > 0;
    const seen = this.plays.length > 0 ? this.noveltySeen() : new Set<string>();
    const revealed = this.revealedFacts(seen);
    if (revealed && target !== '') {
      const predicted = this.predictedFacts(seen);
      const reveal: RarityReveal = { target, quarter: rarityQuarter(us(this.release!.at)), score: rarityScore(revealed.facts, false)[0], predictedScore: rarityScore(predicted.facts, true)[0], inputs: revealed.inputs, revealedAt: this.release!.at };
      const frozen = this.ctx.freezeRarity ? this.ctx.freezeRarity(id, reveal) : null;
      return frozen ? this.fromStored(frozen, setComplete) : null;
    }
    if (!minted && !setComplete) return null;
    const out: CardRarity = { formula: rarityFormula, predicted: null, revealed: null, tier: '', score: null, percentile: null, cohort: null, inputs: this.newRarityInputs(), revealedAt: null };
    if (minted) {
      const quarter = rarityQuarter(this.ctx.now);
      const predicted = this.predictedFacts(seen);
      const score = rarityScore(predicted.facts, true)[0];
      const cohort = target !== '' ? this.ctx.cohort(rarityFormula, target, quarter, id) : [];
      const [tierName, percentile, size] = rarityTier(score, cohort);
      Object.assign(out, { predicted: tierName, tier: tierName, score, percentile, inputs: predicted.inputs });
      if (target !== '') out.cohort = { target, quarter, size };
    }
    if (setComplete) out.tier = 'legendary';
    return out;
  }
}

/** Tiers a reveal against its cohort and builds the row to freeze, as Ploeg's `freezeRarity` does inside its lock. */
export function rarityRecord(workItemId: string, reveal: RarityReveal, cohort: readonly number[], now: number): RarityRecord {
  const [revealedTier, percentile, size] = rarityTier(reveal.score, cohort);
  const [predictedTier] = rarityTier(reveal.predictedScore, cohort);
  const at = t(now);
  return { workItemId, formula: rarityFormula, revealedTier, predictedTier, score: reveal.score, predictedScore: reveal.predictedScore, percentile, cohortTarget: reveal.target, cohortQuarter: reveal.quarter, cohortSize: size, inputs: reveal.inputs, revealedAt: reveal.revealedAt, recordedAt: at, checkedAt: at };
}

/** Assembles one Work Item's Run card from Ploeg's delivery facts and Unfold's card state, exactly as Ploeg's `store.OperatorCard` assembled it from its own tables (Ploeg ADR-0046 and the card ADRs after it). */
export function assembleCard(facts: WorkItemFacts, ctx: CardContext): CardJson {
  const a = new Assembly(facts, ctx);
  a.loadPlays();
  a.release = a.releaseOf();
  a.loadCondition();
  const card = a.card;
  card.release = a.release;
  card.plays = a.plays.map(({ id: _id, forge: _forge, repo: _repo, openedAt: _opened, mergedAtUs: _merged, fullShape: _full, facts: _facts, ...play }) => play);
  card.totals = a.totals();
  const [pipeline, shape] = summarize(a.plays.map(p => ({ state: p.state ?? '', mergedAt: p.mergedAtUs, timeline: p.timeline ?? null, ci: p.ciTiming ?? null, shape: p.fullShape })));
  if (pipeline) card.pipeline = pipeline;
  if (shape) card.shape = shape;
  card.crew = a.crew();
  card.roster = a.roster();
  card.steward = a.steward();
  card.state = cardState(facts.workItem.state, a.plays.map(p => p.state ?? ''));
  card.events = a.events();
  card.live = a.live();
  const [journey, evolved] = a.gates();
  if (evolved || a.evolvedByAttribution) card.evolved = true;
  const [condition, weight, cracked] = a.condition();
  card.condition = condition;
  card.grade = a.grade(journey, weight, cracked);
  const flow = a.flow();
  if (flow) card.flow = flow;
  const set = a.set();
  if (set) card.set = set;
  if (ctx.rules.rarity) card.rarity = a.rarity();
  return clean(JSON.parse(JSON.stringify(card)), '') as CardJson;
}

/** The rules Ploeg applied when its configuration said nothing: production releases, the `hotfix` label, default path rules, the default skin, no flow figures and no rarity. */
export function defaultCardRules(overrides: Partial<CardRules> = {}): CardRules {
  const matcher = compileRarityRules();
  return {
    releaseEnvironment: () => defaultReleaseEnvironment, hotfixLabels: () => [defaultHotfixLabel], rarityMatcher: () => matcher,
    shapeMatcher: () => ({ test: () => false, doc: () => false }), style: () => ({ skin: defaultCardSkin, theme: null }), rarity: false, flow: null, ...overrides,
  };
}

/** Whether a crack keeps its card cracked. */
export const crackCeiling = crackedCeiling;
