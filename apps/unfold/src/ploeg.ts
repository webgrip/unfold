import type { AppConfig, User } from './types.ts';
import { ploegDemo } from './ploeg-demo.ts';
import { descriptionMarkdown } from './rich-text.ts';
import { cardKpis, playKpis } from './card-kpis.ts';
import { sourceTaskUrl, type TaskSourceConfig } from './tasks.ts';
import { FactsError, parseFactsPage, parseFactsResponse, type FactsPage, type WorkItemFacts } from './cards/facts.ts';
import { CrackError } from './cards/cracks.ts';
import type { CardService, CommentRequest, CommentResult, FactsQuery } from './cards/service.ts';
import type { PloegCardFlow, PloegCardPipeline, PloegCardShape, PloegPlayCITiming, PloegPlayShape, PloegPlayTimeline } from './card-kpis.ts';

export type PloegState = 'ingested' | 'queued' | 'leased' | 'done' | 'needs_human' | 'awaiting_review' | 'stale' | 'withdrawn' | 'proposed';
export type PloegTeam = { id: string; paused: boolean | null; queueDepth: number; roles: { id: string; queueDepth: number }[]; assignees: string[]; pinnedScopes: string[] };
export type PloegTrackerItems = { items: PloegItem[]; supported: boolean; message?: string };
export type PloegShift = { id: string; workItemId: string; team: string; branch: string; round: number; budgetUsd: number; spentUsd: number; reservedUsd: number; openedAt: string; closedAt: string | null; closeReason: string };
export type PloegItem = { id: string; provider: string; externalId: string; revision: string; team: string; state: PloegState; title: string; description: string; url: string; priority: number; attempts: number; infraFailures: number; nextEligibleAt: string | null; createdAt: string; updatedAt: string; target: { forge: string; owner: string; repo: string; baseBranch: string } | null; latestShift: PloegShift | null; lease: { expiresAt: string; renewedAt: string } | null; pullRequest?: PloegPullRequest | null; sourceWorkItemId?: string; createdKind?: string; ready?: boolean };
/** Whether a Work Item's pull request merges into its base branch, as Ploeg's review poll last confirmed it (Ploeg ADR-0040). */
export type PloegMergeState = 'clean' | 'conflicted' | 'unknown';
/** A Work Item's pull request as Ploeg reports it. `mergeState` is null when Ploeg did not report one; `number`, `baseBranch` and `checkedAt` are null when unknown. */
export type PloegPullRequest = { url: string; number: number | null; mergeState: PloegMergeState | null; baseBranch: string | null; headSha: string; checkedAt: string | null };
export type PloegRun = { id: string; workItemId: string; shiftId: string | null; team: string; role: string; round: number; writes: boolean; state: 'pending' | 'running' | 'finished'; startedAt: string | null; finishedAt: string | null; expiresAt: string | null; outcome: string | null; summary: string; stuckReason: string; links: string[]; findings: string; verdict: string; problem: string; solution: string; failureReason: string | null; authorizedUsd: number; usage: { inputTokens?: number; outputTokens?: number; costUsd?: number } | null; costStatus: 'observed' | 'unknown'; keyAlias: string | null };
export type PloegCheckpoint = { id: string; workItemId: string; phase: string; branch: string; prUrl: string; createdAt: string; nodeName: string; podUid: string };
export type PloegEvent = { id: string; at: string; actor: string; action: string; workItemId: string; team: string; detail: Record<string, unknown> };
export type PloegPresentedItem = PloegItem & { descriptionMarkdown: string };
export type PloegDetail = { item: PloegItem; shifts: PloegShift[]; runs: PloegRun[]; checkpoints: PloegCheckpoint[]; events: PloegEvent[]; truncated: { shifts: boolean; runs: boolean; checkpoints: boolean; events: boolean }; demo?: boolean; fetchedAt?: string };
export type PloegLane = 'awaiting_review' | 'needs_human' | 'leased' | 'queued' | 'all';
export type PloegPage = { items: PloegItem[]; nextCursor: string | null };
export type PloegPresentedPage = { items: PloegPresentedItem[]; nextCursor: string | null };
export type PloegWindow = '24h' | '7d' | '30d';
export type PloegWorkCounts = Record<'queued' | 'leased' | 'awaitingReview' | 'needsHuman' | 'proposed' | 'withdrawn' | 'done' | 'stale', number>;
export type PloegRunCounts = Record<'pending' | 'running' | 'finished' | 'failed' | 'stuck', number>;
export type PloegSpend = { settledUsd: number; reservedUsd: number };
export type PloegTeamSummary = { team: string; workItems: PloegWorkCounts; runs: PloegRunCounts; spend: PloegSpend; lastActivityAt: string | null };
export type PloegUnsettledAccount = { runId: string; workItemId: string; team: string; accountState: 'minting' | 'issued' | 'unknown'; heldUsd: number; since: string };
/** Finished Runs whose budget hold Ploeg cannot release, oldest first, with their count and held total summed from exactly these rows. */
export type PloegUnsettled = { count: number; heldUsd: number; accounts: PloegUnsettledAccount[] };
export type PloegSummary = { demo: boolean; window: PloegWindow; generatedAt: string; teams: PloegTeamSummary[]; totals: { workItems: PloegWorkCounts; runs: PloegRunCounts; spend: PloegSpend }; unsettled: PloegUnsettled | null; unsettledError: { code: string; message: string } | null; fetchedAt: string };
export type PloegRunRow = { id: string; workItemId: string; workItemTitle: string; externalRef: string; team: string; role: string; round: number; writes: boolean; state: string; outcome: string; verdict: string; failureReason: string; startedAt: string | null; finishedAt: string | null; durationSeconds: number | null; authorizedUsd: number | null; settledUsd: number | null; observedUsd: number | null; reservedModels: string[]; usage: { inputTokens: number | null; outputTokens: number | null; models: string[] } | null };
export type PloegRunsPage = { demo: boolean; runs: PloegRunRow[]; nextBefore: string | null; fetchedAt: string };
export type PloegActivityEvent = PloegEvent & { workItemTitle: string };
export type PloegEventsPage = { demo: boolean; events: PloegActivityEvent[]; nextCursor: string | null; fetchedAt: string };
export type PloegProposedItem = PloegPresentedItem & { sourceTitle: string };
export type PloegProposedPage = { demo: boolean; items: PloegProposedItem[]; truncated: boolean; fetchedAt: string };
export type PloegNowShift = Pick<PloegShift, 'round' | 'closeReason' | 'budgetUsd' | 'spentUsd' | 'reservedUsd' | 'closedAt'>;
export type PloegNowItem = Pick<PloegItem, 'id' | 'team' | 'state' | 'title' | 'url' | 'createdAt' | 'updatedAt' | 'provider' | 'externalId' | 'priority' | 'attempts' | 'infraFailures' | 'target' | 'pullRequest'> & { closeReason: string | null; latestShift: PloegNowShift | null; spentUsd: number | null; pullRequestUrl: string } & Partial<Pick<PloegProposedItem, 'sourceWorkItemId' | 'sourceTitle' | 'createdKind' | 'ready'>>;
/** Why Ploeg's routing refused a tracker task (Ploeg ADR-0038). `unclassified` is a refusal Ploeg recorded before it named codes, or a code this Unfold does not know; its `reason` explains it. */
export type PloegRefusalCode = 'label_missing' | 'label_not_allowed' | 'label_unregistered' | 'multiple_labels' | 'labels_unread' | 'no_board_rule' | 'target_not_ready' | 'unclassified';
/** A tracker task Ploeg could not start because routing refused it. It is not a Work Item: none exists. `board` names the task source whose provider and project match the task, or is empty; `link` says whether `url` is the task itself, the tracker's root or absent. */
export type PloegRefusal = { provider: string; externalId: string; externalScope: string; team: string; title: string; labels: string[]; code: PloegRefusalCode; reason: string; allowedLabels: string[]; refusedAt: string; board: string; url: string; link: 'task' | 'tracker' | 'none' };
export type PloegNowGroup = 'waiting' | 'active' | 'running' | 'recent' | 'refused';
export type PloegNow = { demo: boolean; teams: string[]; waiting: PloegNowItem[]; active: PloegNowItem[]; refused: PloegRefusal[]; running: PloegRunRow[]; recent: PloegRunRow[]; runningTruncated: boolean; recentTruncated: boolean; truncatedStates: PloegNowTruncatedState[]; errors: Partial<Record<PloegNowGroup, string>>; fetchedAt: string };
export type PloegNowTruncatedState = 'awaiting_review' | 'needs_human' | 'proposed' | 'leased' | 'queued';
/** How many Work Items Now reads per team and state before it marks that state truncated. */
export const nowStateCap = 200;
export type PloegDecision = 'approve' | 'reject' | 'cancel';
export type PloegDecisionResult = { workItemId: string; team: string; state: string; demo: boolean };
/** When a person attached a context file: before the Work Item's first Shift, or while a Shift was open (steering). */
export type PloegContextPhase = 'before_start' | 'while_steering';
/** One context file attached to a Ploeg Work Item, as Ploeg stored it. Its bytes stay in Ploeg; Unfold never executes with them. */
export type PloegContextItem = { id: string; workItemId: string; name: string; mediaType: string; sha256: string; bytes: number; files: number; note: string; addedBy: string; addedAt: string; phase: PloegContextPhase };
/** The context attached to one Work Item, in the order Ploeg added it. The demo stores none. */
export type PloegContextList = { workItemId: string; context: PloegContextItem[]; demo: boolean };
/** What an upload returns: the stored item, and `created: false` when Ploeg already held the same file for this Work Item. */
export type PloegContextAdded = { context: PloegContextItem; created: boolean; demo: false };
/** The largest context file Unfold forwards to Ploeg, in bytes (20 MiB, Ploeg's default per-upload limit). */
export const contextUploadLimit = 20 * 1024 * 1024;
/** What the deterministic demo answers an upload: it keeps nothing and says so. */
export const demoContextRefusal = 'The demo does not store context files.';
export type PloegCancellation = PloegDecisionResult & { withdrawn: boolean | null; shiftId: string | null; cancelledRuns: number | null; stoppedRuns: number | null; keysBlocked: boolean | null; message: string };
export type PloegRunFilter = { team?: string; state?: string; outcome?: string; before?: string };
export type PloegCardStyle = { skin: string; theme: string | null };
export type PloegCardCheck = { context: string; state: string };
export type PloegCardReview = { reviewer: string; state: string; receivedAt: string | null; headSha: string };
export type PloegCardPlay = { number: number; url: string; state: string; shiftId: string | null; branch: string; headSha: string; mergeCommitSha: string; mergedAt: string | null; mergedBy: string; closedAt: string | null; additions?: number; deletions?: number; changedFiles?: number; ci: { state: string; checks: PloegCardCheck[]; headSha: string; capturedAt: string | null } | null; reviews: PloegCardReview[]; deployments?: PloegCardDeployment[]; timeline?: PloegPlayTimeline | null; ciTiming?: PloegPlayCITiming | null; shape?: PloegPlayShape | null };
export type PloegCardCrew = { role: string; writes: boolean | null; runs?: number; costUsd?: number; inputTokens?: number; outputTokens?: number };
export type PloegCardTotals = { costStatus: 'observed' | 'reserved' | 'not_reported'; usageComplete: boolean | null; firstRunAt: string | null; lastRunAt: string | null } & Partial<Record<'costUsd' | 'authorizedUsd' | 'inputTokens' | 'outputTokens' | 'cacheReadInputTokens' | 'cacheCreationInputTokens' | 'turns' | 'toolCalls' | 'runs' | 'failedRuns' | 'rounds' | 'shifts' | 'runSeconds', number>>;
export type PloegCardEvent = { at: string; kind: string; actor: string; detail: Record<string, string | number | boolean> };
/** The first deploy of a Work Item's merged plays to one environment. */
export type PloegCardDeployment = { environment: string; firstDeployedAt: string | null; sha: string; url: string };
/** When the latest merged play reached production (`deploy`), or its merge when the project reports no deploys (`merge`). */
export type PloegCardRelease = { at: string; source: string; environment: string };
/** The Work Item's usage so far while a Run is running (Ploeg ADR-0049): what finished Runs recorded plus the gateway's running total. A cost or token figure Ploeg could not read is absent. */
export type PloegCardLive = { runningRuns: number; observedAt: string | null; runSeconds: number; usageComplete: boolean } & Partial<Record<'costUsd' | 'inputTokens' | 'outputTokens', number>>;
/** The facts a card's grade used, per subgrade (card contract P2b). `null` is a fact Ploeg does not know; `notCollected` names every input Ploeg has no source for yet, as `subgrade.input`. `missing` (formula 2026.3, Ploeg ADR-0061) names the inputs Ploeg can collect but has no fact for on this card, and is absent when Ploeg did not send it. */
export type PloegCardGradeInputs = { reliability: { crackWeight: number | null; reverted: boolean | null }; durability: { daysLive: number | null; liveSince: string | null; reverts: number | null; hotfixes: number | null; survival: number | null }; delivery: { budgetShare: number | null; defectBounces: number | null; extraPlays: number | null; failedRuns: number | null }; review: { ciFirstGreen: boolean | null; findings: number | null; changeRequests: number | null; reviewRounds: number | null; reworkRounds: number | null }; notCollected: string[]; missing?: string[] };
/** A card's grade (card contract P2b): Ploeg computes it with a versioned formula (2026.1, 2026.2 with cracks, reverts and hotfixes, or 2026.3 counting rework rounds and missing inputs); Unfold only displays it. `inputs` is absent when Ploeg sent none or a shape Unfold cannot read. */
export type PloegCardGrade = { formula: string; overall: number; provisional: boolean; subgrades: Partial<Record<'reliability' | 'durability' | 'delivery' | 'review', number>>; label: 'black' | 'gold' | null; qualifiers: string[]; inputs?: PloegCardGradeInputs };
/** One confirmed crack (card contract P3): a bug traced back to this card, and its mend when someone fixed it. `weight`, `warranty` and the mend's `confirmedAt` stay absent when Ploeg does not send them. */
export type PloegCardCrack = { id: string; bug: { workItemId: string | null; ref: string; title: string } | null; severity: string; share: string; discovery: string; proposedAt: string | null; confirmedAt: string | null; confirmedBy: string[]; disputed: boolean; weight?: number; warranty?: 'full' | 'half' | 'history'; mended: { at: string | null; by: string; pr: number | null; bySteward: boolean; confirmedAt?: string | null } | null };
/** A card's condition (card contract P3): cracked while a confirmed crack is open, mended once every crack was fixed. */
export type PloegCardCondition = { state: 'cracked' | 'mended'; cracks: PloegCardCrack[] };
/** A delivery gate on the Work Item's board (Ploeg ADR-0051). */
export type PloegGate = 'development' | 'test' | 'acceptance' | 'done';
/** Where the Work Item stands on its board's delivery gates and how it got there (Ploeg ADR-0051). `rightFirstTime` counts, per gate after development that the Work Item entered, the defect and unknown bounces that left it. */
export type PloegCardGates = { current: PloegGate; history: { gate: PloegGate; enteredAt: string; leftAt: string | null }[]; bounces: { from: PloegGate; to: PloegGate; at: string; reason: string; actor: string }[]; rightFirstTime: Partial<Record<'test' | 'acceptance' | 'done', number>> };
/** The card's place in its epic's set (Ploeg ADR-0053). `children` is listed on the epic's own card only; `position` is null there. */
export type PloegCardSet = { role: 'epic' | 'child'; epic: { workItemId: string | null; ref: string; title: string }; position: number | null; size: number; children: { workItemId: string; title: string; state: string; settled: boolean; cracked: boolean }[]; complete: boolean };
/** A rarity tier (Ploeg ADR-0056, proposed), lowest first. */
export type PloegRarityTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
/** The facts a rarity score used (Ploeg ADR-0056, proposed). null is a fact Ploeg does not know. */
export type PloegCardRarityInputs = { reach: { modules: number | null; repos: number | null }; sensitive: { files: number | null; paths: string[] }; novelty: { share: number | null; files: number | null; novel: number | null }; size: { countedLines: number | null }; set: boolean | null; truncated: boolean; notCollected: string[] };
/** A card's rarity (Ploeg ADR-0056, proposed): how exceptional its change was, as a challenge score from 0 to 100, predicted before the merge and revealed at release, tiered by percentile in its repository and quarter. */
export type PloegCardRarity = { formula: string; predicted: PloegRarityTier | null; revealed: PloegRarityTier | null; tier: PloegRarityTier; score: number | null; percentile: number | null; cohort: { target: string; quarter: string; size: number } | null; inputs: PloegCardRarityInputs | null; revealedAt: string | null };
/** A Run card: one per Work Item, its pull requests as plays, as Unfold assembles it from Ploeg's delivery facts (root ADR-0030). Facts only; an unknown value is absent or null, never zero. `finish` is always `matte`; the browser derives the finish from `release`. `rarity`, `grade`, `condition`, `gates` and `set` are validated, and a shape the browser cannot read becomes null. `deployments`, `release`, `live`, `gates`, `evolved`, `set`, `flow`, `pipeline` and `shape`, and a play's `timeline`, `ciTiming` and `shape`, are absent when the card has none, and an unreadable one is null. */
export type PloegCard = { workItemId: string; title: string; externalRef: string; url: string; team: string; target: { forge: string; owner: string; repo: string } | null; style: PloegCardStyle; state: string; rarity: PloegCardRarity | null; finish: 'matte'; grade: PloegCardGrade | null; condition: PloegCardCondition | null; steward: { name: string; source: string } | null; roster: { name: string; roles: string[] }[]; crew: PloegCardCrew[]; plays: PloegCardPlay[]; totals: PloegCardTotals; events: PloegCardEvent[]; deployments?: PloegCardDeployment[]; release?: PloegCardRelease | null; live?: PloegCardLive | null; gates?: PloegCardGates | null; evolved?: true; set?: PloegCardSet | null; flow?: PloegCardFlow | null; pipeline?: PloegCardPipeline | null; shape?: PloegCardShape | null; demo: boolean };
export type PloegCardView = { card: PloegCard; demo: boolean; fetchedAt: string };
/** A Work Item named in an attribution. */
export type PloegCrackItem = { workItemId: string; title: string; externalRef: string };
/** The state of an attribution (Ploeg ADR-0052): proposed by the fixer, confirmed by a second person, disputed by the steward, unlinked by a referee, or evolved when the requirement changed. */
export type PloegCrackState = 'proposed' | 'confirmed' | 'disputed' | 'unlinked' | 'evolved';
/** One attribution of a bug Work Item to the card whose play caused it (Ploeg ADR-0052), as the crack API shows it. */
export type PloegCrack = { id: string; team: string; state: PloegCrackState; card: PloegCrackItem; bug: PloegCrackItem; play: number | null; severity: string | null; share: string | null; discovery: string | null; steward: string | null; note: string | null; proposedBy: string; proposedAt: string; confirmedBy: string[]; confirmedAt: string | null; disputeUntil: string | null; disputed: boolean; disputedBy: string | null; disputedAt: string | null; disputeReason: string | null; resolvedBy: string | null; resolvedAt: string | null; resolution: 'upheld' | 'unlinked' | null; evolvedBy: string | null; evolvedAt: string | null; mended: { at: string; by: string; pr: number; bySteward: boolean; confirmedAt: string | null; reopenedAt: string | null } | null };
/** An earlier merged play that touched a path the bug's fix touched. Ploeg only proposes it; a crack needs people. */
export type PloegCrackCandidate = { card: PloegCrackItem; play: number; repo: string; mergedAt: string; mergedBy: string; sharedFiles: number; share: number; files: string[]; reverted: boolean; attribution: PloegCrackState | null };
/** The candidates for a bug Work Item's cause: plays merged between `since` and `until`, the bug's creation. */
export type PloegCrackCandidates = { bug: PloegCrackItem; fixFiles: number; fixFilesTruncated: boolean; since: string; until: string; candidates: PloegCrackCandidate[] };
/** The caller in the attribution flow: the forge login Ploeg compares with stewards and proposers, whether they may take a step at all, and why not. */
export type PloegAttributionViewer = { login: string | null; canAct: boolean; reason: string };
export type PloegCracksView = { workItemId: string; cracks: PloegCrack[]; viewer: PloegAttributionViewer; demo: boolean; fetchedAt: string };
export type PloegCrackCandidatesView = { workItemId: string; crackCandidates: PloegCrackCandidates; demo: boolean; fetchedAt: string };
/** An attribution step: `propose` and `evolved` act on a bug Work Item, `confirm`, `dispute` and `resolve` on one of its cracks. */
export type PloegAttributionStep = 'propose' | 'evolved' | 'confirm' | 'dispute' | 'resolve';
/** What an attribution step returns: the attribution as Ploeg recorded it, or in the demo as Ploeg would record it, with nothing kept. */
export type PloegAttributionResult = { crack: PloegCrack; demo: boolean; message: string };
/** Cards for a binder or team page, and where they came from: Ploeg's card list, a bounded scan of recent Work Items, or the demo. */
export type PloegCardList = { cards: PloegCard[]; source: { kind: 'list' | 'scan' | 'demo'; scanned: number; truncated: boolean } };
export type PloegOverview ={ configured: boolean; available: boolean; demo: boolean; teams: PloegTeam[]; selectedTeam?: string; lanes?: Record<PloegLane, PloegPresentedPage>; fetchedAt?: string; trackerUrl?: string; message: string };

export class PloegError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.name = 'PloegError'; this.status = status; this.code = code; }
}

/** Ploeg refused an Ask because the scope's Ask Allowance cannot cover another one (system ADR-0031, Ploeg ADR-0081). `resetAt` is when the next period opens. */
export class AskAllowanceUsedUp extends PloegError {
  readonly resetAt: string;
  constructor(resetAt: string) { super(402, 'allowance_exhausted', 'Ask Allowance used up.'); this.name = 'AskAllowanceUsedUp'; this.resetAt = resetAt; }
}
/** A Team's Ask Allowance for the current month, as Ploeg reports it. */
export type PloegAskAllowance = { limitUsd: number; settledUsd: number; heldUsd: number; remainingUsd: number; resetAt: string; askCount: number; askBudgetUsd: number; asksEnabled: boolean };
/** An admitted Ask's key and allowance. `key` is shown once; Unfold calls its own gateway with it. */
export type PloegAskGrant = { askId: string; key: string; models: string[]; expiresAt: string; allowance: PloegAskAllowance | null };
/** An Ask's spend as Ploeg last read it. */
export type PloegAskSpend = { state: 'open' | 'finished' | 'expired'; costStatus: 'provisional' | 'settled' | 'unknown'; usd: number | null };

const askRole = 'ask';
const states: PloegState[] = ['ingested', 'queued', 'leased', 'done', 'needs_human', 'awaiting_review', 'stale', 'withdrawn', 'proposed'];
const invalid = () => new PloegError(502, 'ploeg_response', 'Ploeg returned an unsupported operator response.');
const forgeLogin = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const identifier = (value: unknown): string => { if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/.test(value)) throw invalid(); return value; };
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(); return value as Record<string, unknown>; }
function field(value: unknown, max = 512): string { if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw invalid(); return value; }
function numeric(value: unknown, integer = false): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) throw invalid(); return value; }
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') throw invalid(); return value; }
function nullable<T>(value: unknown, parse: (value: unknown) => T): T | null { return value === null ? null : parse(value); }
function optionalText(value: unknown, max: number): string { return value === undefined ? '' : field(value, max); }
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
function envelope(value: unknown, versions: unknown[] = ['1.0']): Record<string, unknown> { const data = record(value); if (!versions.includes(data.schemaVersion)) throw invalid(); return data; }
const refusalCodes: PloegRefusalCode[] = ['label_missing', 'label_not_allowed', 'label_unregistered', 'multiple_labels', 'labels_unread', 'no_board_rule', 'target_not_ready', 'unclassified'];
function routeRefusal(value: unknown): Omit<PloegRefusal, 'board' | 'url' | 'link'> {
  const data = record(value);
  const code = field(data.code, 64);
  return { provider: field(data.provider, 128), externalId: field(data.externalId, 256), externalScope: field(data.externalScope, 512), team: field(data.team, 128), title: field(data.title, 4096), labels: array(data.labels, entry => field(entry, 512), 200), code: (refusalCodes as string[]).includes(code) ? code as PloegRefusalCode : 'unclassified', reason: field(data.reason, 4096), allowedLabels: array(data.allowedLabels, entry => field(entry, 512), 200), refusedAt: timestamp(data.refusedAt) };
}
function team(value: unknown): PloegTeam {
  const data = record(value);
  return { id: field(data.id, 100), paused: nullable(data.paused, boolean), queueDepth: numeric(data.queueDepth, true), roles: array(data.roles, value => { const role = record(value); return { id: field(role.id, 100), queueDepth: numeric(role.queueDepth, true) }; }, 100), assignees: data.assignees === undefined || data.assignees === null ? [] : array(data.assignees, value => field(value, 256), 100).filter(Boolean), pinnedScopes: data.pinnedScopes === undefined || data.pinnedScopes === null ? [] : array(data.pinnedScopes, value => field(value, 256), 500).filter(Boolean) };
}
function shift(value: unknown): PloegShift {
  const data = record(value);
  return { id: identifier(data.id), workItemId: identifier(data.workItemId), team: field(data.team, 100), branch: field(data.branch), round: numeric(data.round, true), budgetUsd: numeric(data.budgetUsd), spentUsd: numeric(data.spentUsd), reservedUsd: numeric(data.reservedUsd), openedAt: timestamp(data.openedAt), closedAt: nullable(data.closedAt, timestamp), closeReason: field(data.closeReason, 16000) };
}
function item(value: unknown): PloegItem {
  const data = record(value);
  if (!states.includes(data.state as PloegState) || typeof data.priority !== 'number' || !Number.isSafeInteger(data.priority)) throw invalid();
  const result = { id: identifier(data.id), provider: field(data.provider, 100), externalId: field(data.externalId, 512), revision: field(data.revision, 512), team: field(data.team, 100), state: data.state as PloegState, title: field(data.title, 4096), description: field(data.description, 16384), url: link(data.url), priority: data.priority, attempts: numeric(data.attempts, true), infraFailures: numeric(data.infraFailures, true), nextEligibleAt: nullable(data.nextEligibleAt, timestamp), createdAt: timestamp(data.createdAt), updatedAt: timestamp(data.updatedAt), target: nullable(data.target, value => { const target = record(value); return { forge: field(target.forge, 100), owner: field(target.owner), repo: field(target.repo), baseBranch: field(target.baseBranch) }; }), latestShift: nullable(data.latestShift, shift), lease: nullable(data.lease, value => { const lease = record(value); return { expiresAt: timestamp(lease.expiresAt), renewedAt: timestamp(lease.renewedAt) }; }), ...(data.pullRequest === undefined ? {} : { pullRequest: nullable(data.pullRequest, pullRequest) }) };
  if (result.latestShift && (result.latestShift.workItemId !== result.id || result.latestShift.team !== result.team)) throw invalid();
  return { ...result, ...provenance(data) };
}
const mergeStates: PloegMergeState[] = ['clean', 'conflicted', 'unknown'];
function pullRequest(value: unknown): PloegPullRequest {
  const data = record(value);
  const number = data.number === undefined || data.number === null ? null : numeric(data.number, true);
  if (number === 0) throw invalid();
  const mergeState = data.mergeState === undefined ? null : field(data.mergeState, 32);
  return { url: data.url === undefined ? '' : link(data.url), number, mergeState: mergeStates.includes(mergeState as PloegMergeState) ? mergeState as PloegMergeState : null, baseBranch: data.baseBranch === undefined || data.baseBranch === null ? null : field(data.baseBranch, 1024) || null, headSha: optionalText(data.headSha, 128), checkedAt: data.checkedAt === undefined || data.checkedAt === null ? null : timestamp(data.checkedAt) };
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
  return { id: identifier(data.id), workItemId: identifier(data.workItemId), shiftId: nullable(data.shiftId, identifier), team: field(data.team, 100), role: field(data.role, 100), round: numeric(data.round, true), writes: boolean(data.writes), state: data.state as PloegRun['state'], startedAt: nullable(data.startedAt, timestamp), finishedAt: nullable(data.finishedAt, timestamp), expiresAt: nullable(data.expiresAt, timestamp), outcome: nullable(data.outcome, value => field(value, 100)), summary: field(data.summary, 64000), stuckReason: field(data.stuckReason, 16000), links: array(data.links, link, 100).filter(Boolean), findings: field(data.findings, 64000), verdict: field(data.verdict, 100), problem: optionalText(data.problem, 16000), solution: optionalText(data.solution, 16000), failureReason: nullable(data.failureReason, value => field(value, 16000)), authorizedUsd: numeric(data.authorizedUsd), usage, costStatus: data.costStatus as PloegRun['costStatus'], keyAlias: nullable(data.keyAlias, value => field(value, 512)) };
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
const unsettledStates = ['minting', 'issued', 'unknown'] as const;
function unsettledAccount(value: unknown): PloegUnsettledAccount {
  const data = record(value);
  const state = oneOf(data.accountState, unsettledStates);
  if (!state) throw invalid();
  return { runId: identifier(data.runId), workItemId: identifier(data.workItemId), team: field(data.team, 100), accountState: state, heldUsd: numeric(data.heldUsd), since: timestamp(data.since) };
}
/** Sums unsettled accounts into the count and held total a caller sees. */
export function unsettledTotals(accounts: PloegUnsettledAccount[]): PloegUnsettled {
  return { count: accounts.length, heldUsd: Math.round(accounts.reduce((sum, entry) => sum + entry.heldUsd, 0) * 10000) / 10000, accounts };
}
function runRow(value: unknown): PloegRunRow {
  const data = record(value);
  const text = (entry: unknown, max: number) => entry === null || entry === undefined ? '' : field(entry, max);
  const count = (entry: unknown) => entry === null || entry === undefined ? null : numeric(entry, true);
  const usage = nullable(data.usage ?? null, entry => { const usage = record(entry); return { inputTokens: count(usage.inputTokens), outputTokens: count(usage.outputTokens), models: usage.models === undefined || usage.models === null ? [] : array(usage.models, model => field(model, 200), 20) }; });
  const state = token(data.state);
  if (!state) throw invalid();
  return { id: identifier(data.id), workItemId: identifier(data.workItemId), workItemTitle: text(data.workItemTitle, 4096), externalRef: text(data.externalRef, 512), team: field(data.team, 100), role: field(data.role, 100), round: numeric(data.round, true), writes: boolean(data.writes), state, outcome: token(data.outcome), verdict: token(data.verdict), failureReason: text(data.failureReason, 16000), startedAt: nullable(data.startedAt ?? null, timestamp), finishedAt: nullable(data.finishedAt ?? null, timestamp), durationSeconds: nullable(data.durationSeconds ?? null, value => numeric(value)), authorizedUsd: nullable(data.authorizedUsd ?? null, value => numeric(value)), settledUsd: nullable(data.settledUsd ?? null, value => numeric(value)), observedUsd: nullable(data.observedUsd ?? null, value => numeric(value)), reservedModels: data.reservedModels === undefined || data.reservedModels === null ? [] : array(data.reservedModels, model => field(model, 200), 32), usage };
}
const pullRequestPath = /\/(?:pulls?|merge_requests)\/\d+\/?$/;
/** Extracts the pull request link Ploeg recorded for a Work Item, preferring a checkpoint. */
export function pullRequestUrl(data: PloegDetail): string {
  const checkpoint = data.checkpoints.find(entry => entry.prUrl);
  if (checkpoint) return checkpoint.prUrl;
  const ordered = data.runs.slice().sort((a, b) => a.round - b.round || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  for (const run of ordered.reverse()) for (const link of run.links.slice().reverse()) if (pullRequestPath.test(link)) return link;
  return '';
}
function nowItem(entry: PloegItem & Partial<Pick<PloegProposedItem, 'sourceTitle'>>): PloegNowItem {
  const shift = entry.latestShift;
  const provenance = { ...(entry.sourceWorkItemId ? { sourceWorkItemId: entry.sourceWorkItemId } : {}), ...(entry.sourceTitle ? { sourceTitle: entry.sourceTitle } : {}), ...(entry.createdKind ? { createdKind: entry.createdKind } : {}), ...(entry.ready !== undefined ? { ready: entry.ready } : {}) };
  return { id: entry.id, team: entry.team, state: entry.state, title: entry.title, url: entry.url, createdAt: entry.createdAt, updatedAt: entry.updatedAt, provider: entry.provider, externalId: entry.externalId, priority: entry.priority, attempts: entry.attempts, infraFailures: entry.infraFailures, target: entry.target ? { ...entry.target } : null, closeReason: shift?.closeReason || null, latestShift: shift ? { round: shift.round, closeReason: shift.closeReason, budgetUsd: shift.budgetUsd, spentUsd: shift.spentUsd, reservedUsd: shift.reservedUsd, closedAt: shift.closedAt } : null, spentUsd: shift?.spentUsd ?? null, pullRequestUrl: '', ...(entry.pullRequest === undefined ? {} : { pullRequest: entry.pullRequest ? { ...entry.pullRequest } : null }), ...provenance };
}
function presented<T extends PloegItem>(entry: T): T & { descriptionMarkdown: string } { return { ...entry, descriptionMarkdown: descriptionMarkdown(entry.provider, entry.description, entry.url || undefined) }; }
function activityEvent(value: unknown): PloegActivityEvent { const data = record(value); return { ...event(data), workItemTitle: typeof data.workItemTitle === 'string' && data.workItemTitle.length <= 4096 ? data.workItemTitle : '' }; }
function cancellation(data: Record<string, unknown>): Omit<PloegCancellation, keyof PloegDecisionResult> {
  const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const flag = (value: unknown) => typeof value === 'boolean' ? value : null;
  const shift = typeof data.shiftId === 'number' ? String(data.shiftId) : data.shiftId;
  return { withdrawn: flag(data.withdrawn), shiftId: typeof shift === 'string' && /^[1-9][0-9]{0,19}$/.test(shift) ? shift : null, cancelledRuns: count(data.cancelledRuns), stoppedRuns: count(data.stoppedRuns), keysBlocked: flag(data.keysBlocked), message: typeof data.message === 'string' && data.message.length <= 4096 && !data.message.includes('\0') ? data.message : '' };
}
const demoCancellation = 'Illustrative demo record. Nothing was cancelled: no Run was stopped, no model key or push token was blocked and the tracker was not told.';
const unsupported = () => new PloegError(501, 'ploeg_unsupported', 'This Ploeg version does not provide activity data yet.');
const olderTracker = 'This Ploeg version cannot look up work by tracker task. Update Ploeg to see its work here.';
const askFailures: Record<number, [string, string]> = {
  400: ['ask_question', 'Ploeg refused the question.'],
  403: ['ploeg_decision_forbidden', 'Unfold’s Ploeg credential cannot admit Asks. An administrator must grant it execute permission.'],
  409: ['ask_unconfigured', 'Asking is not set up for this Team yet: Ploeg has no ask model policy for it.'],
  503: ['ask_unavailable', 'Ploeg cannot admit Asks right now: its model gateway is not available.'],
};

async function askRefusal(response: Response): Promise<PloegError | null> {
  if (response.status !== 402 && !askFailures[response.status]) return null;
  let data: any;
  try { data = Number(response.headers.get('content-length') ?? 0) <= 65_536 ? await response.json() : null; } catch { data = null; }
  if (response.status === 402) { const resetAt = data?.allowance?.resetAt; return new AskAllowanceUsedUp(typeof resetAt === 'string' && !Number.isNaN(Date.parse(resetAt)) ? resetAt : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString()); }
  const [code, message] = data?.error?.code === 'credential_unresolved' ? ['ask_unavailable', 'Ploeg could not issue a key for this Ask. Try again in a minute.'] : askFailures[response.status];
  return new PloegError(response.status, code, message);
}

function askAllowance(value: unknown): PloegAskAllowance {
  const data = record(value);
  const time = field(data.resetAt, 64);
  if (Number.isNaN(Date.parse(time))) throw invalid();
  return { limitUsd: numeric(data.limitUsd), settledUsd: numeric(data.settledUsd), heldUsd: numeric(data.heldUsd), remainingUsd: typeof data.remainingUsd === 'number' && Number.isFinite(data.remainingUsd) ? data.remainingUsd : 0, resetAt: time, askCount: numeric(data.askCount, true), askBudgetUsd: numeric(data.askBudgetUsd), asksEnabled: data.asksEnabled === true };
}

function askSpend(value: unknown): PloegAskSpend {
  const ask = record(value);
  const spend = record(ask.spend);
  const state = ['open', 'finished', 'expired'].includes(String(ask.state)) ? ask.state as PloegAskSpend['state'] : 'finished';
  const costStatus = ['provisional', 'settled', 'unknown'].includes(String(spend.costStatus)) ? spend.costStatus as PloegAskSpend['costStatus'] : 'unknown';
  return { state, costStatus, usd: spend.usd === null || spend.usd === undefined ? null : numeric(spend.usd) };
}

const decisionFailures: Record<number, [string, string]> = {
  400: ['ploeg_decision', 'Ploeg refused the request. A rejection needs a reason of at most 4096 characters.'],
  403: ['ploeg_decision_forbidden', 'Unfold’s Ploeg credential cannot record decisions. An administrator must grant it execute permission.'],
  404: ['ploeg_not_found', 'Ploeg work item not found in your authorized teams.'],
  409: ['ploeg_decision_conflict', 'Ploeg did not apply this: the Work Item changed state or is bound to an execution. Refresh to see where it stands.'],
};

function page(value: unknown): PloegPage { const data = envelope(value); return { items: array(data.items, item, 100), nextCursor: nullable(data.nextCursor, identifier) }; }
/** Parses a Work Item detail from Ploeg's operator API. Every Shift, Run, checkpoint and event must belong to the Work Item and carry its team, except an earlier closed Shift and its finished Runs, which keep the team the item had then. */
export function detail(value: unknown): PloegDetail {
  const data = envelope(value);
  const truncated = record(data.truncated);
  const result = { item: item(data.item), shifts: array(data.shifts, shift), runs: array(data.runs, run).filter(entry => entry.role !== askRole), checkpoints: array(data.checkpoints, checkpoint), events: array(data.events, event), truncated: { shifts: boolean(truncated.shifts), runs: boolean(truncated.runs), checkpoints: boolean(truncated.checkpoints), events: boolean(truncated.events) } };
  const latestShift = result.item.latestShift?.id ?? result.shifts[0]?.id;
  const earlierShifts = new Set(result.shifts.filter(entry => entry.id !== latestShift && entry.closedAt).map(entry => entry.id));
  const fromEarlierTeam = (entry: { team?: string; id?: string; shiftId?: string | null; state?: string }) => 'shiftId' in entry ? entry.state === 'finished' && !!entry.shiftId && earlierShifts.has(entry.shiftId) : 'closedAt' in entry && earlierShifts.has(entry.id!);
  for (const entry of [...result.shifts, ...result.runs, ...result.checkpoints, ...result.events]) if (entry.workItemId !== result.item.id || ('team' in entry && entry.team !== result.item.team && !fromEarlierTeam(entry as any))) throw invalid();
  return result;
}

const defaultSkin = 'unfold-native';
/** Skin names that Ploeg and saved card themes still send from before the product was named Unfold, with the skin that replaced each. */
export const renamedSkins: Readonly<Record<string, string>> = Object.freeze({ 'vloer-native': 'unfold-native' });
/** The current name of a card skin: `name` itself, or its replacement when it was renamed. */
export function currentSkin(name: string): string { return renamedSkins[name] ?? name; }
const cardEventKeys: Record<string, 'text' | 'number' | 'flag'> = { number: 'number', state: 'text', role: 'text', round: 'number', outcome: 'text', verdict: 'text', shiftId: 'text', runId: 'text', reviewer: 'text', reason: 'text', source: 'text', writes: 'flag' };
const absent = (value: unknown) => value === undefined || value === null;
function optionalNumbers<K extends string>(data: Record<string, unknown>, keys: readonly K[], integers: readonly string[] = []): Partial<Record<K, number>> {
  return Object.fromEntries(keys.filter(key => !absent(data[key])).map(key => [key, numeric(data[key], integers.includes(key))])) as Partial<Record<K, number>>;
}
function looseId(value: unknown): string | null {
  if (absent(value) || value === '') return null;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  return identifier(value);
}
function cardToken(value: unknown, fallback = ''): string { if (absent(value) || value === '') return fallback; const text = field(value, 64); if (!/^[a-z][a-z0-9_]{0,63}$/.test(text)) throw invalid(); return text; }
function cardText(value: unknown, max = 256): string { return absent(value) ? '' : field(value, max); }
function cardTime(value: unknown): string | null { return absent(value) || value === '' ? null : timestamp(value); }
function cardList<T>(value: unknown, parse: (value: unknown) => T, max: number): T[] { return absent(value) ? [] : array(value, parse, max); }
function styleName(value: unknown): string | null { return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value) ? value : null; }
function cardPlay(value: unknown): PloegCardPlay {
  const data = record(value);
  if (typeof data.number !== 'number' || !Number.isSafeInteger(data.number) || data.number < 1) throw invalid();
  const status = absent(data.ci) ? null : record(data.ci);
  const ci = status ? { state: cardToken(status.state, 'unknown'), checks: cardList(status.checks, entry => { const check = record(entry); return { context: field(check.context, 256), state: cardToken(check.state, 'unknown') }; }, 100), headSha: cardText(status.headSha, 64), capturedAt: cardTime(status.capturedAt) } : null;
  const reviews = cardList(data.reviews, entry => { const review = record(entry); return { reviewer: cardText(review.reviewer), state: cardToken(review.state, 'commented'), receivedAt: cardTime(review.receivedAt), headSha: cardText(review.headSha, 64) }; }, 200);
  const counts = ['additions', 'deletions', 'changedFiles'] as const;
  return { number: data.number, url: absent(data.url) ? '' : link(data.url), state: cardToken(data.state), shiftId: looseId(data.shiftId), branch: cardText(data.branch, 512), headSha: cardText(data.headSha, 64), mergeCommitSha: cardText(data.mergeCommitSha, 64), mergedAt: cardTime(data.mergedAt), mergedBy: cardText(data.mergedBy), closedAt: cardTime(data.closedAt), ...optionalNumbers(data, counts, counts), ci, reviews, ...cardDeployments(data.deployments), ...playKpis(data) };
}
function cardCrew(value: unknown): PloegCardCrew {
  const data = record(value);
  return { role: field(data.role, 100), writes: absent(data.writes) ? null : boolean(data.writes), ...optionalNumbers(data, ['runs', 'costUsd', 'inputTokens', 'outputTokens'] as const, ['runs', 'inputTokens', 'outputTokens']) };
}
function cardTotals(value: unknown): PloegCardTotals {
  const data = absent(value) ? {} : record(value);
  const status = absent(data.costStatus) ? 'not_reported' : data.costStatus;
  if (!['observed', 'reserved', 'not_reported'].includes(status as string)) throw invalid();
  const counts = ['inputTokens', 'outputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens', 'turns', 'toolCalls', 'runs', 'failedRuns', 'rounds', 'shifts'] as const;
  return { costStatus: status as PloegCardTotals['costStatus'], usageComplete: absent(data.usageComplete) ? null : boolean(data.usageComplete), firstRunAt: cardTime(data.firstRunAt), lastRunAt: cardTime(data.lastRunAt), ...optionalNumbers(data, ['costUsd', 'authorizedUsd', 'runSeconds', ...counts] as const, counts) };
}
function cardEvent(value: unknown): PloegCardEvent {
  const data = record(value);
  const raw = absent(data.detail) ? {} : record(data.detail);
  const detail: Record<string, string | number | boolean> = {};
  for (const [key, kind] of Object.entries(cardEventKeys)) {
    const entry = raw[key];
    if (kind === 'text' && typeof entry === 'string' && entry.length <= 4096 && !entry.includes('\0')) detail[key] = entry;
    else if (kind === 'number' && typeof entry === 'number' && Number.isFinite(entry)) detail[key] = entry;
    else if (kind === 'flag' && typeof entry === 'boolean') detail[key] = entry;
  }
  return { at: timestamp(data.at), kind: cardToken(data.kind, 'unknown'), actor: cardText(data.actor), detail };
}
function cardDeployment(value: unknown): PloegCardDeployment {
  const data = record(value);
  return { environment: field(data.environment, 64).toLowerCase(), firstDeployedAt: cardTime(data.firstDeployedAt), sha: cardText(data.sha, 64), url: absent(data.url) ? '' : link(data.url) };
}
function cardDeployments(value: unknown): { deployments?: PloegCardDeployment[] } {
  return value === undefined ? {} : { deployments: cardList(value, cardDeployment, 50).filter(entry => entry.environment) };
}
function cardRelease(value: unknown): PloegCardRelease | null {
  if (value === null) return null;
  const data = record(value);
  return { at: timestamp(data.at), source: cardToken(data.source, 'deploy'), environment: absent(data.environment) || data.environment === '' ? 'production' : field(data.environment, 64).toLowerCase() };
}
function cardLive(value: unknown): PloegCardLive | null {
  if (value === null) return null;
  const data = record(value);
  const { runningRuns, runSeconds, ...usage } = optionalNumbers(data, ['runningRuns', 'runSeconds', 'costUsd', 'inputTokens', 'outputTokens'] as const, ['runningRuns', 'runSeconds', 'inputTokens', 'outputTokens']);
  if (runningRuns === undefined || runSeconds === undefined) throw invalid();
  return { runningRuns, runSeconds, observedAt: cardTime(data.observedAt), usageComplete: boolean(data.usageComplete), ...usage };
}
const gradeKeys = ['reliability', 'durability', 'delivery', 'review'] as const;
const gradeQualifierCodes = ['RV', 'HF', 'OB', 'RT', 'MN'];
function halfStep(value: unknown): number { if (typeof value !== 'number' || value < 1 || value > 10 || !Number.isInteger(value * 2)) throw invalid(); return value; }
function readable<T>(parse: () => T): T | null { try { return parse(); } catch { return null; } }
const gradeInputKeys = /^(?:reliability|durability|delivery|review)\.[A-Za-z]{1,64}$/;
function maybe<T>(value: unknown, parse: (value: unknown) => T): T | null { return absent(value) ? null : parse(value); }
function gradeInputs(value: unknown): PloegCardGradeInputs | undefined {
  if (absent(value)) return undefined;
  return readable(() => {
    const data = record(value);
    const part = (key: string) => record(data[key]);
    const count = (entry: unknown) => maybe(entry, item => numeric(item, true));
    const reliability = part('reliability');
    const durability = part('durability');
    const delivery = part('delivery');
    const review = part('review');
    const survival = maybe(durability.survival, numeric);
    if (survival !== null && survival > 1) throw invalid();
    return {
      reliability: { crackWeight: maybe(reliability.crackWeight, numeric), reverted: maybe(reliability.reverted, boolean) },
      durability: { daysLive: count(durability.daysLive), liveSince: cardTime(durability.liveSince), reverts: count(durability.reverts), hotfixes: count(durability.hotfixes), survival },
      delivery: { budgetShare: maybe(delivery.budgetShare, numeric), defectBounces: count(delivery.defectBounces), extraPlays: count(delivery.extraPlays), failedRuns: count(delivery.failedRuns) },
      review: { ciFirstGreen: maybe(review.ciFirstGreen, boolean), findings: count(review.findings), changeRequests: count(review.changeRequests), reviewRounds: count(review.reviewRounds), reworkRounds: count(review.reworkRounds) },
      notCollected: cardList(data.notCollected, entry => field(entry, 80), 40).filter(entry => gradeInputKeys.test(entry)),
      ...(absent(data.missing) ? {} : { missing: cardList(data.missing, entry => field(entry, 80), 40).filter(entry => gradeInputKeys.test(entry)) }),
    };
  }) ?? undefined;
}
function cardGrade(value: unknown): PloegCardGrade | null {
  if (absent(value)) return null;
  return readable(() => {
    const data = record(value);
    const parts = absent(data.subgrades) ? {} : record(data.subgrades);
    const formula = field(data.formula, 32);
    if (!/^[0-9A-Za-z][0-9A-Za-z.-]{0,31}$/.test(formula)) throw invalid();
    const label = absent(data.label) ? null : data.label;
    if (label !== null && label !== 'black' && label !== 'gold') throw invalid();
    const inputs = gradeInputs(data.inputs);
    return {
      formula, overall: halfStep(data.overall), provisional: boolean(data.provisional),
      subgrades: Object.fromEntries(gradeKeys.filter(key => !absent(parts[key])).map(key => [key, halfStep(parts[key])])),
      label, qualifiers: cardList(data.qualifiers, entry => field(entry, 8), 10).filter(code => gradeQualifierCodes.includes(code)),
      ...(inputs ? { inputs } : {}),
    };
  });
}
const warranties = ['full', 'half', 'history'] as const;
function cardCrack(value: unknown): PloegCardCrack {
  const data = record(value);
  const bug = absent(data.bug) ? null : record(data.bug);
  const mended = absent(data.mended) ? null : record(data.mended);
  const severity = field(data.severity, 4);
  if (!/^S[1-4]$/.test(severity)) throw invalid();
  if (data.warranty !== undefined && !warranties.includes(data.warranty as typeof warranties[number])) throw invalid();
  return {
    id: field(data.id, 128), bug: bug ? { workItemId: looseId(bug.workItemId), ref: cardText(bug.ref, 512), title: cardText(bug.title, 4096) } : null,
    severity, share: cardToken(data.share, 'primary'), discovery: cardToken(data.discovery, 'discovered'),
    proposedAt: cardTime(data.proposedAt), confirmedAt: cardTime(data.confirmedAt), confirmedBy: cardList(data.confirmedBy, entry => field(entry, 256), 10),
    disputed: absent(data.disputed) ? false : boolean(data.disputed),
    ...(absent(data.weight) ? {} : { weight: numeric(data.weight) }),
    ...(data.warranty === undefined ? {} : { warranty: data.warranty as typeof warranties[number] }),
    mended: mended ? { at: cardTime(mended.at), by: cardText(mended.by), pr: absent(mended.pr) ? null : numeric(mended.pr, true), bySteward: absent(mended.bySteward) ? false : boolean(mended.bySteward), ...(mended.confirmedAt === undefined ? {} : { confirmedAt: cardTime(mended.confirmedAt) }) } : null,
  };
}
function cardCondition(value: unknown): PloegCardCondition | null {
  if (absent(value)) return null;
  return readable(() => {
    const data = record(value);
    if (data.state !== 'cracked' && data.state !== 'mended') throw invalid();
    return { state: data.state, cracks: cardList(data.cracks, cardCrack, 20) };
  });
}
const gateNames: PloegGate[] = ['development', 'test', 'acceptance', 'done'];
const bounceReasons = ['defect', 'requirement', 'misunderstood', 'environment', 'unknown'];
function gate(value: unknown): PloegGate { if (!gateNames.includes(value as PloegGate)) throw invalid(); return value as PloegGate; }
function cardGates(value: unknown): PloegCardGates | null {
  if (absent(value)) return null;
  return readable(() => {
    const data = record(value);
    const rft = absent(data.rightFirstTime) ? {} : record(data.rightFirstTime);
    return {
      current: gate(data.current),
      history: cardList(data.history, entry => { const visit = record(entry); return { gate: gate(visit.gate), enteredAt: timestamp(visit.enteredAt), leftAt: cardTime(visit.leftAt) }; }, 200),
      bounces: cardList(data.bounces, entry => { const bounce = record(entry); const reason = absent(bounce.reason) ? 'unknown' : field(bounce.reason, 32); if (!bounceReasons.includes(reason)) throw invalid(); return { from: gate(bounce.from), to: gate(bounce.to), at: timestamp(bounce.at), reason, actor: cardText(bounce.actor) }; }, 200),
      rightFirstTime: Object.fromEntries((['test', 'acceptance', 'done'] as const).filter(key => !absent(rft[key])).map(key => [key, numeric(rft[key], true)])),
    };
  });
}
const setStates = ['drafting', 'in_review', 'merged', 'closed', 'withdrawn'];
function cardSet(value: unknown): PloegCardSet | null {
  if (absent(value)) return null;
  return readable(() => {
    const data = record(value);
    if (data.role !== 'epic' && data.role !== 'child') throw invalid();
    const epic = record(data.epic);
    const size = numeric(data.size, true);
    const position = absent(data.position) ? null : numeric(data.position, true);
    if (size < 1 || (position !== null && (position < 1 || position > size))) throw invalid();
    return {
      role: data.role, epic: { workItemId: looseId(epic.workItemId), ref: cardText(epic.ref, 512), title: field(epic.title, 4096) }, position, size,
      children: data.role === 'epic' ? cardList(data.children, entry => { const child = record(entry); const state = cardToken(child.state, 'drafting'); if (!setStates.includes(state)) throw invalid(); return { workItemId: identifier(typeof child.workItemId === 'number' ? String(child.workItemId) : child.workItemId), title: field(child.title, 4096), state, settled: boolean(child.settled), cracked: boolean(child.cracked) }; }, 100) : [],
      complete: boolean(data.complete),
    };
  });
}
const rarityTiers: PloegRarityTier[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
function rarityTier(value: unknown): PloegRarityTier { if (!rarityTiers.includes(value as PloegRarityTier)) throw invalid(); return value as PloegRarityTier; }
function share(value: unknown): number { const number = numeric(value); if (number > 1) throw invalid(); return number; }
function rarityInputs(value: unknown): PloegCardRarityInputs | null {
  if (absent(value)) return null;
  const data = record(value);
  const part = (key: string) => absent(data[key]) ? {} : record(data[key]);
  const whole = (entry: unknown) => maybe(entry, item => numeric(item, true));
  const reach = part('reach');
  const sensitive = part('sensitive');
  const novelty = part('novelty');
  const size = part('size');
  return {
    reach: { modules: whole(reach.modules), repos: whole(reach.repos) },
    sensitive: { files: whole(sensitive.files), paths: cardList(sensitive.paths, entry => field(entry, 1024), 20) },
    novelty: { share: maybe(novelty.share, share), files: whole(novelty.files), novel: whole(novelty.novel) },
    size: { countedLines: whole(size.countedLines) },
    set: maybe(data.set, boolean),
    truncated: absent(data.truncated) ? false : boolean(data.truncated),
    notCollected: cardList(data.notCollected, entry => field(entry, 64), 20).filter(entry => /^[a-z][A-Za-z.]{0,63}$/.test(entry)),
  };
}
/** Reads a card's rarity (Ploeg ADR-0056, proposed): strict on every field it knows, blind to fields it does not, and null when absent, null or unreadable. */
export function cardRarity(value: unknown): PloegCardRarity | null {
  if (absent(value)) return null;
  return readable(() => {
    const data = record(value);
    const formula = field(data.formula, 32);
    if (!/^[0-9A-Za-z][0-9A-Za-z.-]{0,31}$/.test(formula)) throw invalid();
    const score = maybe(data.score, numeric);
    if (score !== null && score > 100) throw invalid();
    const percentile = maybe(data.percentile, numeric);
    if (percentile !== null && (percentile === 0 || percentile > 100)) throw invalid();
    const cohortData = absent(data.cohort) ? null : record(data.cohort);
    const cohort = cohortData ? { target: field(cohortData.target, 512), quarter: field(cohortData.quarter, 8), size: numeric(cohortData.size, true) } : null;
    if (cohort && (cohort.target.length < 3 || !/^[0-9]{4}Q[1-4]$/.test(cohort.quarter) || cohort.size < 1)) throw invalid();
    return {
      formula, predicted: maybe(data.predicted, rarityTier), revealed: maybe(data.revealed, rarityTier), tier: rarityTier(data.tier),
      score, percentile, cohort, inputs: rarityInputs(data.inputs), revealedAt: cardTime(data.revealedAt),
    };
  });
}
/** Validates a Run card from Ploeg: known fields only, safe links, bounded lists, absent values kept absent. It drops Ploeg's finish, and keeps a rarity, grade, condition, gates or set only in the shape the card contract defines; KPI figures pass through figure by figure (`card-kpis.ts`). */
export function parseCard(value: unknown): PloegCard {
  const data = record(value);
  const style = absent(data.style) ? {} : record(data.style);
  const stewardData = absent(data.steward) ? null : record(data.steward);
  const steward = stewardData && cardText(stewardData.name) ? { name: cardText(stewardData.name), source: cardToken(stewardData.source) } : null;
  const targetData = absent(data.target) ? null : record(data.target);
  const workItemId = looseId(data.workItemId);
  if (!workItemId) throw invalid();
  return {
    workItemId,
    title: field(data.title, 4096),
    externalRef: cardText(data.externalRef, 512),
    url: absent(data.url) ? '' : link(data.url),
    team: field(data.team, 100),
    target: targetData ? { forge: field(targetData.forge, 100), owner: field(targetData.owner), repo: field(targetData.repo) } : null,
    style: { skin: currentSkin(styleName(style.skin) ?? defaultSkin), theme: styleName(style.theme) },
    state: cardToken(data.state, 'drafting'),
    rarity: cardRarity(data.rarity), finish: 'matte', grade: cardGrade(data.grade), condition: cardCondition(data.condition),
    steward,
    roster: cardList(data.roster, entry => { const person = record(entry); return { name: field(person.name, 256), roles: cardList(person.roles, role => cardToken(role), 10) }; }, 50),
    crew: cardList(data.crew, cardCrew, 50),
    plays: cardList(data.plays, cardPlay, 100),
    totals: cardTotals(data.totals),
    events: cardList(data.events, cardEvent, 500),
    ...cardDeployments(data.deployments),
    ...(data.release === undefined ? {} : { release: cardRelease(data.release) }),
    ...(data.live === undefined ? {} : { live: cardLive(data.live) }),
    ...(data.gates === undefined ? {} : { gates: cardGates(data.gates) }),
    ...(data.evolved === true ? { evolved: true as const } : {}),
    ...(data.set === undefined ? {} : { set: cardSet(data.set) }),
    ...cardKpis(data),
    demo: data.demo === true,
  };
}

const crackStates: PloegCrackState[] = ['proposed', 'confirmed', 'disputed', 'unlinked', 'evolved'];
function crackItem(value: unknown): PloegCrackItem { const data = record(value); return { workItemId: identifier(typeof data.workItemId === 'number' ? String(data.workItemId) : data.workItemId), title: field(data.title, 4096), externalRef: cardText(data.externalRef, 512) }; }
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null { if (absent(value)) return null; if (!allowed.includes(value as T)) throw invalid(); return value as T; }
function person(value: unknown): string | null { return absent(value) || value === '' ? null : field(value, 256); }
/** Validates one attribution from Ploeg's crack API: known fields only, bounded text, states and enums from the operator contract. */
export function parseCrack(value: unknown): PloegCrack {
  const data = record(value);
  const state = oneOf(data.state, crackStates);
  if (!state) throw invalid();
  const mended = absent(data.mended) ? null : record(data.mended);
  return {
    id: identifier(typeof data.id === 'number' ? String(data.id) : data.id), team: field(data.team, 100), state, card: crackItem(data.card), bug: crackItem(data.bug),
    play: absent(data.play) ? null : numeric(data.play, true),
    severity: oneOf(data.severity, ['S1', 'S2', 'S3', 'S4'] as const), share: oneOf(data.share, ['primary', 'contributing'] as const), discovery: oneOf(data.discovery, ['self', 'discovered', 'concealed'] as const),
    steward: person(data.steward), note: absent(data.note) ? null : field(data.note, 4096), proposedBy: field(data.proposedBy, 256), proposedAt: timestamp(data.proposedAt),
    confirmedBy: cardList(data.confirmedBy, entry => field(entry, 256), 2), confirmedAt: cardTime(data.confirmedAt), disputeUntil: cardTime(data.disputeUntil),
    disputed: absent(data.disputed) ? state === 'disputed' : boolean(data.disputed), disputedBy: person(data.disputedBy), disputedAt: cardTime(data.disputedAt), disputeReason: absent(data.disputeReason) ? null : field(data.disputeReason, 4096),
    resolvedBy: person(data.resolvedBy), resolvedAt: cardTime(data.resolvedAt), resolution: oneOf(data.resolution, ['upheld', 'unlinked'] as const),
    evolvedBy: person(data.evolvedBy), evolvedAt: cardTime(data.evolvedAt),
    mended: mended ? { at: timestamp(mended.at), by: cardText(mended.by), pr: numeric(mended.pr, true), bySteward: boolean(mended.bySteward), confirmedAt: cardTime(mended.confirmedAt), reopenedAt: cardTime(mended.reopenedAt) } : null,
  };
}
/** Validates Ploeg's candidates for a bug Work Item's cause: at most 20, each a merged play with the paths it shares with the fix. */
export function parseCrackCandidates(value: unknown): PloegCrackCandidates {
  const data = record(value);
  return {
    bug: crackItem(data.bug), fixFiles: numeric(data.fixFiles, true), fixFilesTruncated: boolean(data.fixFilesTruncated), since: timestamp(data.since), until: timestamp(data.until),
    candidates: array(data.candidates, entry => {
      const candidate = record(entry);
      const share = numeric(candidate.share);
      if (share > 1) throw invalid();
      return { card: crackItem(candidate.card), play: numeric(candidate.play, true), repo: field(candidate.repo, 512), mergedAt: timestamp(candidate.mergedAt), mergedBy: cardText(candidate.mergedBy), sharedFiles: numeric(candidate.sharedFiles, true), share, files: cardList(candidate.files, file => field(file, 1024), 20), reverted: boolean(candidate.reverted), attribution: oneOf(candidate.attribution, crackStates) };
    }, 20),
  };
}

const attributionRefusals: Record<string, [number, string]> = {
  invalid_request: [400, 'Ploeg refused the attribution as invalid.'],
  forbidden_actor: [403, 'Ploeg refused: this step is not yours to take on this crack.'],
  invalid_state: [409, 'The attribution changed state. Refresh to see where it stands.'],
  crack_limit: [409, 'A bug cracks at most three cards; more than that is a systemic bug, not a card’s.'],
  already_attributed: [409, 'This card is already attributed to this bug.'],
  not_merged: [409, 'The card has no merged play to attribute the bug to.'],
  merged_after_bug: [409, 'That play merged after the bug was raised, so it cannot have caused it.'],
  dispute_closed: [409, 'The five working days to dispute this crack have passed.'],
  concealment_unproven: [409, 'Concealed needs the card’s steward to have merged the bug’s fix.'],
};
async function commentRefusal(response: Response, token: string): Promise<PloegError | null> {
  if (!response.body || Number(response.headers.get('content-length')) > 65_536) return null;
  let code = '';
  let message = '';
  try { const data = JSON.parse(await response.text()); code = typeof data?.error?.code === 'string' ? data.error.code : ''; message = typeof data?.error?.message === 'string' ? data.error.message : ''; } catch { return null; }
  if (!/^[a-z_]{1,64}$/.test(code)) return null;
  const plain = message.length > 0 && message.length <= 500 && !/[\u0000-\u001f\u007f]/.test(message) && !message.includes(token);
  return new PloegError(response.status === 404 ? 404 : response.status >= 500 ? 502 : response.status, `comment_${code}`, plain ? message : 'Ploeg refused the pull request comment.');
}
const contextVersions = ['1.0', undefined];
const contextFailures: Record<number, [string, string]> = {
  400: ['ploeg_context_refused', 'Ploeg refused the file.'],
  403: ['ploeg_decision_forbidden', 'Unfold’s Ploeg credential cannot add context. An administrator must grant it execute permission.'],
  404: ['ploeg_not_found', 'Ploeg work item not found in your authorized teams.'],
  409: ['ploeg_context_closed', 'This Work Item is done or withdrawn, so it takes no more context.'],
  413: ['ploeg_context_too_large', 'The file is larger than Ploeg accepts for one upload or for this Work Item.'],
};
async function contextRefusal(response: Response, token: string): Promise<PloegError | null> {
  const failure = contextFailures[response.status];
  if (!failure) return null;
  let message = '';
  if (response.body && Number(response.headers.get('content-length')) <= 65_536) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try { while (size <= 65_536) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; chunks.push(chunk.value); } } catch { chunks.length = 0; } finally { await reader.cancel().catch(() => undefined); }
    try { const data = JSON.parse(Buffer.concat(chunks).toString('utf8')); message = typeof data?.error === 'string' ? data.error : typeof data?.error?.message === 'string' ? data.error.message : ''; } catch { message = ''; }
  }
  const plain = message.length > 0 && message.length <= 500 && !/[\u0000-\u001f\u007f]/.test(message) && !message.includes(token);
  if (response.status === 404 && !plain) return new PloegError(501, 'ploeg_unsupported', 'This Ploeg version does not store context files yet.');
  return new PloegError(response.status, failure[0], plain && response.status !== 403 ? message : failure[1]);
}
/** Parses one context item from Ploeg strictly: an unexpected shape is an unsupported response, never a guess. */
export function parseContextItem(value: unknown): PloegContextItem {
  const data = record(value);
  const id = field(data.id, 80);
  const name = field(data.name, 200);
  const mediaType = field(data.mediaType, 255);
  const sha256 = field(data.sha256, 64);
  if (!/^ctx_[A-Za-z0-9]{1,64}$/.test(id) || !name || /[\u0000-\u001f\u007f/\\]/.test(name) || !/^[\w.+-]+\/[\w.+-]+(?:\s*;[^\u0000-\u001f\u007f]*)?$/.test(mediaType) || !/^[0-9a-f]{64}$/.test(sha256)) throw invalid();
  if (data.phase !== 'before_start' && data.phase !== 'while_steering') throw invalid();
  return { id, workItemId: identifier(typeof data.workItemId === 'number' ? String(data.workItemId) : data.workItemId), name, mediaType, sha256, bytes: numeric(data.bytes, true), files: numeric(data.files, true), note: data.note === null ? '' : optionalText(data.note, 500), addedBy: field(data.addedBy, 256), addedAt: timestamp(data.addedAt), phase: data.phase };
}
/**
 * Checks a context file's name and note before anything reaches Ploeg: the name is 1 to 200 characters, a base name
 * without folders or control characters; the note is optional and at most 500 characters. Returns both trimmed.
 */
export function contextInput(name: unknown, note: unknown): { name: string; note: string } {
  const base = typeof name === 'string' ? name.trim() : '';
  if (!base || base.length > 200 || base === '.' || base === '..' || /[\u0000-\u001f\u007f/\\]/.test(base)) throw new PloegError(400, 'context_name', 'Name the file with 1 to 200 characters: a file name without folders or control characters.');
  const text = note === undefined || note === null ? '' : typeof note === 'string' ? note.trim() : null;
  if (text === null || text.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new PloegError(400, 'context_note', 'Keep the note to at most 500 characters of text.');
  return { name: base, note: text };
}
const cardsFactsUnavailable = "Unfold builds Run cards from Ploeg's delivery facts, and the connected Ploeg did not supply them, so there are no cards or cracks to show. Ploeg may be down or older than v0.2.0-rc.10; an administrator should check the Ploeg connection on the Status page.";
const demoAttribution = 'Demo: Ploeg recorded nothing. In a live workbench Ploeg checks the same rules, records this step under your forge login and writes it to its audit log.';
const samePerson = (a: string | null | undefined, b: string | null | undefined) => Boolean(a) && Boolean(b) && a!.toLowerCase() === b!.toLowerCase();
const attributionText = (value: unknown, label: string, required = false): string => {
  if (value !== undefined && value !== null && typeof value !== 'string') throw new PloegError(400, 'crack_invalid_request', `${label} must be text.`);
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > 2000 || (required && !text)) throw new PloegError(400, 'crack_invalid_request', required ? `${label} is required, at most 2000 characters.` : `${label} is at most 2000 characters.`);
  return text;
};
const attributionChoice = <T extends string>(value: unknown, allowed: readonly T[], label: string, required = false): T | '' => {
  if ((value === undefined || value === null || value === '') && !required) return '';
  if (!allowed.includes(value as T)) throw new PloegError(400, 'crack_invalid_request', `${label} must be one of ${allowed.join(', ')}.`);
  return value as T;
};
const attributionId = (value: unknown, label: string): string => {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^[1-9][0-9]{0,19}$/.test(text)) throw new PloegError(400, 'crack_invalid_request', `${label} must be a Ploeg Work Item identifier.`);
  return text;
};

export function validatePloeg(raw: unknown, mode: AppConfig['mode']): AppConfig['ploeg'] {
  if (raw === undefined) return undefined;
  const data = record(raw);
  if (Object.keys(data).some(key => !['url', 'tokenEnv', 'teams', 'userTeams', 'forgeLogins', 'trackerUrl', 'demo'].includes(key))) throw new Error('Unknown ploeg field; credentials must use tokenEnv');
  if (data.demo !== undefined && (data.demo !== true || mode !== 'demo')) throw new Error('ploeg.demo requires explicit application demo mode');
  let url: URL;
  try { url = new URL(field(data.url, 2048)); } catch { throw new Error('ploeg.url must be an HTTP(S) origin or base path'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /[%\\]/.test(url.pathname)) throw new Error('ploeg.url must use HTTP(S) without credentials, query or fragment');
  if (data.tokenEnv !== undefined && (typeof data.tokenEnv !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/.test(data.tokenEnv))) throw new Error('ploeg.tokenEnv must name an environment variable');
  if (!data.demo && !data.tokenEnv) throw new Error('ploeg.tokenEnv is required for the authenticated operator API');
  const parseTeams = (value: unknown) => { if (!Array.isArray(value) || value.length > 50 || value.some(team => typeof team !== 'string' || !team.trim() || team.length > 100 || /[\u0000-\u001f\u007f]/.test(team))) throw new Error('ploeg.teams and userTeams must list at most 50 team names'); return [...new Set(value as string[])]; };
  const userTeams = data.userTeams === undefined ? undefined : record(data.userTeams);
  if (userTeams && (Object.keys(userTeams).length > 1000 || Object.keys(userTeams).some(id => !/^[A-Za-z0-9_-]{1,128}$/.test(id)))) throw new Error('ploeg.userTeams must map user IDs to team names');
  if (data.forgeLogins !== undefined && (!data.forgeLogins || typeof data.forgeLogins !== 'object' || Array.isArray(data.forgeLogins))) throw new Error('ploeg.forgeLogins must map user IDs to forge logins');
  const forgeLogins = data.forgeLogins === undefined ? undefined : data.forgeLogins as Record<string, unknown>;
  if (forgeLogins && (Object.keys(forgeLogins).length > 1000 || Object.entries(forgeLogins).some(([id, login]) => !/^[A-Za-z0-9_-]{1,128}$/.test(id) || typeof login !== 'string' || !forgeLogin.test(login)))) throw new Error('ploeg.forgeLogins must map user IDs to forge logins');
  const trackerUrl = data.trackerUrl === undefined ? undefined : link(data.trackerUrl);
  if (data.trackerUrl !== undefined && !trackerUrl) throw new Error('ploeg.trackerUrl must be an HTTP(S) URL without credentials');
  return { url: url.href.replace(/\/+$/, ''), ...(data.tokenEnv ? { tokenEnv: data.tokenEnv as string } : {}), ...(data.teams !== undefined ? { teams: parseTeams(data.teams) } : {}), ...(userTeams ? { userTeams: Object.fromEntries(Object.entries(userTeams).map(([id, value]) => [id, parseTeams(value)])) } : {}), ...(forgeLogins ? { forgeLogins: { ...forgeLogins } as Record<string, string> } : {}), ...(trackerUrl ? { trackerUrl } : {}), ...(data.demo ? { demo: true } : {}) };
}

export class PloegClient {
  private readonly config?: AppConfig['ploeg'];
  private readonly taskSources: TaskSourceConfig[];
  private readonly demo: boolean;
  private cachedToken: string | undefined;
  private readonly cache = new Map<string, { until: number; value: unknown }>();
  private readonly titles = new Map<string, string>();
  private readonly demoDecisions = new Map<string, PloegDecision>();
  private cardService: CardService | undefined;
  private factsProbe: { until: number; supported: boolean } | null = null;
  /** Lets Unfold's own card domain (root ADR-0030) serve every card and crack route outside the demo. */
  useCards(service: CardService): void { this.cardService = service; }
  private async cards(fresh = false): Promise<CardService> {
    if (!this.config) throw new PloegError(503, 'ploeg_unconfigured', 'Connect the authenticated Ploeg operator API in the server configuration.');
    if (!this.cardService || !(await this.cardService.available(fresh).catch(() => false))) throw new PloegError(503, 'cards_facts_unavailable', cardsFactsUnavailable);
    return this.cardService;
  }
  private crackFailure(error: unknown): never {
    if (error instanceof CrackError) throw new PloegError(error.status, error.code === 'not_found' ? 'ploeg_not_found' : `crack_${error.code}`, error.message);
    throw error;
  }
  /** Whether the connected Ploeg serves delivery facts (Ploeg ADR-0079), probed at most once a minute. */
  async factsSupported(fresh = false): Promise<boolean> {
    if (this.demo || !this.config) return false;
    if (!fresh && this.factsProbe && this.factsProbe.until > Date.now()) return this.factsProbe.supported;
    try { await this.request('facts?limit=1', true, { added: true }); this.factsProbe = { until: Date.now() + 60_000, supported: true }; }
    catch (error) {
      if (!(error instanceof PloegError && error.code === 'ploeg_unsupported')) return this.factsProbe?.supported ?? false;
      this.factsProbe = { until: Date.now() + 60_000, supported: false };
    }
    return this.factsProbe.supported;
  }
  /** Reads one Work Item's delivery facts within the consumer's scope. */
  async workItemFacts(id: string, fresh = false): Promise<WorkItemFacts> {
    if (!/^[1-9][0-9]{0,18}$/.test(id)) throw new PloegError(400, 'ploeg_id', 'Use a valid Ploeg work item identifier.');
    const data = await this.request(`work-items/${id}/facts`, fresh);
    try { return parseFactsResponse(data); } catch (error) { if (error instanceof FactsError) throw new PloegError(502, 'ploeg_facts_invalid', `Ploeg returned delivery facts Unfold cannot read (${error.path}).`); throw error; }
  }
  /** Reads one page of Ploeg's facts list, newest activity first. */
  async factsPage(query: FactsQuery, fresh = false): Promise<FactsPage> {
    const params = new URLSearchParams();
    for (const member of query.members ?? []) params.append('member', member);
    if (query.team) params.set('team', query.team);
    if (query.since) params.set('since', query.since);
    if (query.before) params.set('before', query.before);
    params.set('limit', String(Math.min(25, Math.max(1, query.limit ?? 25))));
    const data = await this.request(`facts?${params}`, fresh);
    try { return parseFactsPage(data); } catch (error) { if (error instanceof FactsError) throw new PloegError(502, 'ploeg_facts_invalid', `Ploeg returned delivery facts Unfold cannot read (${error.path}).`); throw error; }
  }
  /** Writes Unfold's keyed comment on one of the Work Item's pull requests through Ploeg (Ploeg ADR-0079), as the `unfold-cards` actor. */
  async putPullRequestComment(id: string, key: string, body: CommentRequest): Promise<CommentResult> {
    if (!/^[1-9][0-9]{0,18}$/.test(id) || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(key)) throw new PloegError(400, 'comment_invalid', 'Name a Work Item and a comment key.');
    const data = envelope(await this.request(`work-items/${id}/pull-request-comments/${key}`, true, { actor: 'unfold-cards', body, method: 'PUT', comment: true }));
    const comment = record(data.comment);
    const pr = record(comment.pullRequest);
    return { pullRequest: { id: identifier(pr.id), forge: field(pr.forge, 64), owner: field(pr.owner, 256), repo: field(pr.repo, 256), number: numeric(pr.number, true) }, commentId: comment.commentId === null || comment.commentId === undefined ? null : numeric(comment.commentId, true), imageUrl: comment.imageUrl === null || comment.imageUrl === undefined ? null : field(comment.imageUrl, 4096), created: comment.created === true };
  }
  constructor(config: AppConfig) { this.config = config.ploeg; this.taskSources = config.taskSources ?? []; this.demo = config.mode === 'demo' && (!config.ploeg || config.ploeg.demo === true); }
  private allowed(user: User, team: string): boolean { return (!this.config?.teams || this.config.teams.includes(team)) && (user.role === 'admin' || this.config?.userTeams?.[user.id]?.includes(team) === true); }
  private connected(user: User): void { if (!this.config && !this.demo) throw new PloegError(503, 'ploeg_unconfigured', 'Connect the authenticated Ploeg operator API in the server configuration.'); this.authorize(user); }
  private authorize(user: User): void { if (user.role !== 'admin' && !this.config?.userTeams?.[user.id]?.length) throw new PloegError(403, 'ploeg_scope', 'Your account has no Ploeg team access. Ask an administrator to grant it.'); }
  private async request(path: string, fresh = false, options: { added?: boolean; actor?: string; body?: unknown; raw?: Uint8Array; versions?: unknown[]; context?: boolean; comment?: boolean; ask?: boolean; method?: 'PUT' | 'DELETE'; answer?: { status: number } } = {}): Promise<unknown> {
    const token = this.config?.tokenEnv ? process.env[this.config.tokenEnv] : undefined;
    if (!token || token.length > 4096 || /[^\x21-\x7e]/.test(token)) throw new PloegError(503, 'ploeg_credential', 'The Ploeg operator credential is unavailable. An administrator must check the connection.');
    if (token !== this.cachedToken) { this.cache.clear(); this.cachedToken = token; }
    const post = options.actor !== undefined;
    const cached = this.cache.get(path);
    if (!post && !fresh && cached && cached.until > Date.now()) return structuredClone(cached.value);
    try {
      const headers: Record<string, string> = { accept: 'application/json', authorization: `Bearer ${token}`, ...(post ? { 'X-Ploeg-Actor': options.actor!, 'X-Ploeg-Acting-User': options.actor! } : {}), ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(options.raw !== undefined ? { 'content-type': 'application/octet-stream' } : {}) };
      const response = await fetch(`${this.config!.url}/api/v1/operator/${path}`, { method: options.method ?? (post ? 'POST' : 'GET'), headers, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}), ...(options.raw !== undefined ? { body: new Uint8Array(options.raw) } : {}), signal: AbortSignal.timeout(options.raw !== undefined ? 60_000 : options.comment ? 45_000 : 5000), redirect: 'manual' });
      if (post) this.cache.clear();
      if (!response.ok) {
        const refusal = options.context ? await contextRefusal(response, token) : options.comment ? await commentRefusal(response, token) : options.ask ? await askRefusal(response) : null;
        await response.body?.cancel().catch(() => undefined);
        if (refusal) throw refusal;
        if (options.added && (response.status === 404 || (response.status === 400 && /^(?:events|work-items)\?/.test(path)))) throw unsupported();
        if (post && decisionFailures[response.status]) { const [code, message] = decisionFailures[response.status]; throw new PloegError(response.status, code, message); }
        throw new PloegError(response.status === 404 ? 404 : 503, 'ploeg_unavailable', response.status === 404 ? 'Ploeg work item not found in your authorized teams.' : 'Ploeg could not provide its operator data. Check the connection and consumer access.');
      }
      if (options.answer) options.answer.status = response.status;
      if (!(response.headers.get('content-type') ?? '').includes('application/json') || Number(response.headers.get('content-length')) > 16_777_216 || !response.body) { await response.body?.cancel(); throw new PloegError(502, 'ploeg_response_size', 'Ploeg returned an unsupported response type or a snapshot larger than 16 MiB.'); }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 16_777_216) throw new PloegError(502, 'ploeg_response_size', 'Ploeg returned a snapshot larger than the 16 MiB operator limit.'); chunks.push(chunk.value); } } finally { await reader.cancel().catch(() => undefined); }
      const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8').split(token).join('[redacted]'));
      envelope(data, options.versions);
      if (process.env[this.config!.tokenEnv!] !== token) throw new PloegError(503, 'ploeg_credential_changed', 'The Ploeg operator credential changed while reading this snapshot. Refresh to use the current access.');
      if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value!);
      if (!post && token === this.cachedToken) this.cache.set(path, { until: Date.now() + 5000, value: data });
      return structuredClone(data);
    } catch (error) { if (error instanceof PloegError) throw error; throw new PloegError(503, 'ploeg_unavailable', 'Ploeg could not be reached or returned incomplete data. Refresh to try again.'); }
  }
  async teams(user: User, fresh = false): Promise<PloegTeam[]> { return (await this.routing(user, fresh)).teams; }
  /** Lists the caller's teams and whether this Ploeg reports the tracker users that route work to each team. */
  /** Reads Ploeg's team routing: `teams` the caller may use, and `all` teams the consumer sees, for safety checks that must not depend on the caller's scope. */
  async routing(user: User, fresh = false): Promise<{ teams: PloegTeam[]; all: PloegTeam[]; reported: boolean }> {
    this.authorize(user);
    if (this.demo) return { teams: ploegDemo.teams.filter(team => this.allowed(user, team.id)), all: ploegDemo.teams, reported: false };
    const data = envelope(await this.request('teams', fresh));
    const all = array(data.teams, team, 500).filter(entry => !this.config?.teams || this.config.teams.includes(entry.id));
    return { teams: all.filter(team => this.allowed(user, team.id)), all, reported: (data.teams as unknown[]).some(entry => Array.isArray(record(entry).assignees)) };
  }
  allows(user: User, team: string): boolean { return this.allowed(user, team); }
  /** Lists Work Items for one tracker task across the caller's teams; a Ploeg without that filter yields none and says why. */
  async trackerItems(user: User, provider: string, externalId: string, fresh = false, scoped = true): Promise<PloegTrackerItems> {
    this.authorize(user);
    if (this.demo) return { items: [], supported: false, message: 'Illustrative Ploeg records are not linked to tracker tasks.' };
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(provider) || !/^[A-Za-z0-9_-]{1,128}$/.test(externalId)) throw new PloegError(400, 'ploeg_filter', 'Use a valid tracker provider and task identifier.');
    let result: PloegPage;
    try { result = page(await this.request(`work-items?${new URLSearchParams({ provider, externalId, limit: '25' })}`, fresh, { added: true })); }
    catch (error) { if (error instanceof PloegError && error.code === 'ploeg_unsupported') return { items: [], supported: false, message: olderTracker }; throw error; }
    if (result.items.some(entry => entry.provider !== provider || entry.externalId !== externalId)) return { items: [], supported: false, message: olderTracker };
    if (!scoped) return { items: result.items, supported: true };
    const items = result.items.filter(entry => this.allowed(user, entry.team));
    for (const entry of items) this.remember(entry.id, entry.title);
    return { items, supported: true };
  }
  async items(user: User, selectedTeam: string, state: PloegState | 'all' = 'all', after = '0', fresh = false): Promise<PloegPresentedPage> {
    this.authorize(user);
    if (!this.allowed(user, selectedTeam)) throw new PloegError(404, 'ploeg_not_found', 'Ploeg team not found.');
    if (!/^(0|[1-9][0-9]{0,19})$/.test(after) || (state !== 'all' && !states.includes(state))) throw new PloegError(400, 'ploeg_filter', 'Choose a valid Ploeg state and page cursor.');
    const query = new URLSearchParams({ team: selectedTeam, after, limit: '25' });
    if (state !== 'all') query.set('state', state);
    const result = this.demo ? { items: this.demoItems().filter(item => item.team === selectedTeam && (state === 'all' || item.state === state) && BigInt(item.id) > BigInt(after)), nextCursor: null } : page(await this.request(`work-items?${query}`, fresh));
    if (result.items.some(item => item.team !== selectedTeam || (state !== 'all' && item.state !== state))) throw invalid();
    for (const entry of result.items) this.remember(entry.id, entry.title);
    return { items: result.items.map(entry => presented(entry)), nextCursor: result.nextCursor };
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
  async detail(user: User, id: string, fresh = false): Promise<PloegDetail & { item: PloegPresentedItem }> {
    this.authorize(user);
    if (!/^[1-9][0-9]{0,19}$/.test(id)) throw new PloegError(400, 'ploeg_id', 'Use a valid Ploeg work item identifier.');
    const demoDetail = this.demo ? ploegDemo.details[id] : undefined;
    const result = this.demo ? demoDetail && { ...demoDetail, item: this.demoItems().find(entry => entry.id === id)! } : detail(await this.request(`work-items/${id}`, fresh));
    if (!result || result.item.id !== id || !this.allowed(user, result.item.team)) throw new PloegError(404, 'ploeg_not_found', 'Ploeg work item not found in your authorized teams.');
    this.remember(result.item.id, result.item.title);
    const copy = structuredClone(result);
    return { ...copy, item: presented(copy.item), demo: this.demo, fetchedAt: new Date().toISOString() };
  }
  /** Reads a Work Item's Run card, assembled by Unfold from Ploeg's delivery facts. Without those facts it refuses with 503 `cards_facts_unavailable`. */
  async card(user: User, id: string, fresh = false): Promise<PloegCardView> {
    this.authorize(user);
    if (!/^[1-9][0-9]{0,19}$/.test(id)) throw new PloegError(400, 'ploeg_id', 'Use a valid Ploeg work item identifier.');
    if (this.demo) {
      const card = ploegDemo.cards[id];
      if (!card || card.workItemId !== id || !this.allowed(user, card.team)) throw new PloegError(404, 'ploeg_not_found', 'Ploeg work item not found in your authorized teams.');
      return { card: structuredClone(card), demo: true, fetchedAt: new Date().toISOString() };
    }
    const owned = parseCard(await (await this.cards(fresh)).card(id, fresh));
    if (owned.workItemId !== id || !this.allowed(user, owned.team)) throw new PloegError(404, 'ploeg_not_found', 'Ploeg work item not found in your authorized teams.');
    return { card: owned, demo: false, fetchedAt: new Date().toISOString() };
  }
  /** Lists the cards whose roster or steward names any of `logins`, newest activity first, across the caller's teams. The demo lists the demo cards. Without Ploeg's delivery facts it refuses with 503 `cards_facts_unavailable`. */
  async memberCards(user: User, logins: string[], fresh = false): Promise<PloegCardList> {
    this.authorize(user);
    const wanted = new Set(logins.map(login => login.toLowerCase()));
    const holds = (card: PloegCard) => card.roster.some(person => wanted.has(person.name.toLowerCase())) || Boolean(card.steward && wanted.has(card.steward.name.toLowerCase()));
    if (!wanted.size) return { cards: [], source: { kind: this.demo ? 'demo' : 'list', scanned: 0, truncated: false } };
    if (this.demo) return { cards: Object.values(ploegDemo.cards).filter(card => this.allowed(user, card.team) && holds(card)).map(card => structuredClone(card)), source: { kind: 'demo', scanned: 0, truncated: false } };
    const owned = await (await this.cards(fresh)).memberCards([...wanted], fresh);
    return { cards: owned.cards.map(card => parseCard(card)).filter(card => this.allowed(user, card.team) && holds(card)), source: { kind: 'list', scanned: owned.scanned, truncated: owned.truncated } };
  }
  /** Lists one Team's cards for its team page; the demo lists the demo cards. Without Ploeg's delivery facts it refuses with 503 `cards_facts_unavailable`. */
  async teamCards(user: User, team: string, since: string | undefined, fresh = false): Promise<PloegCardList> {
    this.authorize(user);
    if (!this.allowed(user, team)) throw new PloegError(404, 'ploeg_not_found', 'Ploeg team not found.');
    if (this.demo) return { cards: Object.values(ploegDemo.cards).filter(card => card.team === team).map(card => structuredClone(card)), source: { kind: 'demo', scanned: 0, truncated: false } };
    const owned = await (await this.cards(fresh)).teamCards(team, since, fresh);
    return { cards: owned.cards.map(card => parseCard(card)).filter(card => card.team === team), source: { kind: 'list', scanned: owned.scanned, truncated: owned.truncated } };
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
    const { unsettled, unsettledError } = await this.unsettled(user, fresh);
    return { demo: this.demo, window: window as PloegWindow, generatedAt, teams: visible, totals: summaryTotals(visible), unsettled, unsettledError, fetchedAt: new Date().toISOString() };
  }
  private async unsettled(user: User, fresh: boolean): Promise<Pick<PloegSummary, 'unsettled' | 'unsettledError'>> {
    if (this.demo) return { unsettled: unsettledTotals([]), unsettledError: null };
    try {
      const data = envelope(await this.request('unsettled-accounts', fresh, { added: true }));
      const accounts = array(data.accounts, unsettledAccount, 200).filter(entry => this.allowed(user, entry.team));
      return { unsettled: unsettledTotals(accounts), unsettledError: null };
    } catch (error) {
      const older = error instanceof PloegError && error.code === 'ploeg_unsupported';
      return { unsettled: null, unsettledError: older ? { code: 'ploeg_unsupported', message: 'This Ploeg version does not report Runs whose budget it cannot release.' } : { code: 'ploeg_unavailable', message: 'Ploeg could not list the Runs whose budget it cannot release.' } };
    }
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
      runs = array(data.runs, runRow, 200).filter(entry => entry.role !== askRole); nextBefore = nullable(data.nextBefore ?? null, identifier);
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
  /**
   * Everything the caller can read, for the Now page: what waits on them, what Ploeg holds queued or leased, what runs now and what finished recently.
   * `runningTruncated` and `recentTruncated` say whether Ploeg holds more Runs than the first page lists.
   * `truncatedStates` names the Work Item states for which Ploeg holds more than Now lists: each team and state is read up to `nowStateCap`, proposals up to the proposed list's limit.
   */
  async now(user: User, fresh = false): Promise<PloegNow> {
    this.connected(user);
    const teams = await this.teams(user, fresh);
    const errors: PloegNow['errors'] = {};
    const capture = async <T>(group: PloegNowGroup, work: () => Promise<T>, empty: T): Promise<T> => {
      try { return await work(); }
      catch (error) { errors[group] = error instanceof PloegError ? error.message : 'Ploeg could not be reached.'; return empty; }
    };
    const none = { rows: [] as PloegNowItem[], truncated: [] as PloegNowTruncatedState[] };
    const waiting = await capture('waiting', () => this.waitingItems(user, teams, fresh), none);
    const active = await capture('active', () => this.activeItems(user, teams, fresh), none);
    const page = async (state: 'running' | 'finished') => { const found = await this.runs(user, { state }, fresh); return { runs: found.runs, more: found.nextBefore !== null }; };
    const running = await capture('running', () => page('running'), { runs: [] as PloegRunRow[], more: false });
    const recent = await capture('recent', () => page('finished'), { runs: [] as PloegRunRow[], more: false });
    const refused = await capture('refused', () => this.refusals(user, fresh), [] as PloegRefusal[]);
    return { demo: this.demo, teams: teams.map(entry => entry.id), waiting: waiting.rows, active: active.rows, refused, running: running.runs, recent: recent.runs, runningTruncated: running.more, recentTruncated: recent.more, truncatedStates: [...waiting.truncated, ...active.truncated], errors, fetchedAt: new Date().toISOString() };
  }
  private async refusals(user: User, fresh: boolean): Promise<PloegRefusal[]> {
    if (this.demo) return structuredClone(ploegDemo.refusals.filter(entry => this.allowed(user, entry.team)));
    let data: Record<string, unknown>;
    try { data = envelope(await this.request('route-refusals', fresh, { added: true })); }
    catch (error) { if (error instanceof PloegError && error.code === 'ploeg_unsupported') return []; throw error; }
    return array(data.refusals, routeRefusal, 200).filter(entry => this.allowed(user, entry.team)).map(entry => {
      const source = this.taskSources.find(candidate => candidate.provider === entry.provider && candidate.project === entry.externalScope);
      const task = source ? sourceTaskUrl(source, entry.externalId) : '';
      const root = this.config?.trackerUrl ?? '';
      return { ...entry, board: source?.name ?? '', url: task || root, link: task ? 'task' : root ? 'tracker' : 'none' };
    });
  }
  private async activeItems(user: User, teams: PloegTeam[], fresh: boolean): Promise<{ rows: PloegNowItem[]; truncated: PloegNowTruncatedState[] }> {
    const states = ['leased', 'queued'] as const;
    const reads = await Promise.all(teams.flatMap(entry => states.map(async state => ({ state, ...await this.stateItems(user, entry.id, state, fresh) }))));
    const order: Record<string, number> = { leased: 0, queued: 1 };
    const rows = reads.flatMap(read => read.items).map(nowItem).sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9) || a.createdAt.localeCompare(b.createdAt) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    return { rows, truncated: states.filter(state => reads.some(read => read.state === state && read.truncated)) };
  }

  private async waitingItems(user: User, teams: PloegTeam[], fresh: boolean): Promise<{ rows: PloegNowItem[]; truncated: PloegNowTruncatedState[] }> {
    const states = ['awaiting_review', 'needs_human'] as const;
    const reads = await Promise.all(teams.flatMap(entry => states.map(async state => ({ state, ...await this.stateItems(user, entry.id, state, fresh) }))));
    const proposed = await this.proposed(user, fresh);
    const order: Record<string, number> = { awaiting_review: 0, needs_human: 1, proposed: 2 };
    const rows = [...reads.flatMap(read => read.items), ...proposed.items].map(nowItem);
    await Promise.all(rows.filter(row => row.state === 'awaiting_review').slice(0, 10).map(async row => { row.pullRequestUrl = row.pullRequest?.url || await this.reviewUrl(user, row.id, fresh); }));
    const truncated: PloegNowTruncatedState[] = [...states.filter(state => reads.some(read => read.state === state && read.truncated)), ...(proposed.truncated ? ['proposed' as const] : [])];
    return { rows: rows.sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9) || a.createdAt.localeCompare(b.createdAt) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1)), truncated };
  }
  private async stateItems(user: User, team: string, state: PloegState, fresh: boolean): Promise<{ items: PloegPresentedItem[]; truncated: boolean }> {
    const items: PloegPresentedItem[] = [];
    let after = '0';
    while (items.length < nowStateCap) {
      const result = await this.items(user, team, state, after, fresh);
      items.push(...result.items);
      if (!result.nextCursor || !result.items.length) return { items: items.slice(0, nowStateCap), truncated: items.length > nowStateCap };
      after = result.nextCursor;
    }
    return { items: items.slice(0, nowStateCap), truncated: true };
  }
  private async reviewUrl(user: User, id: string, fresh: boolean): Promise<string> {
    try { return pullRequestUrl(await this.detail(user, id, fresh)); } catch { return ''; }
  }
  /** Approves, rejects or cancels a Work Item for an operator or administrator, as that user. A cancellation also reports what Ploeg stopped; the demo reports that nothing was cancelled. */
  async decide(user: User, id: string, decision: PloegDecision, reason = ''): Promise<PloegDecisionResult | PloegCancellation> {
    if (user.role === 'viewer') throw new PloegError(403, 'forbidden', 'Viewers cannot change Ploeg work.');
    this.connected(user);
    if (!decisionKinds.includes(decision)) throw new PloegError(404, 'not_found', 'Ploeg operator view not found.');
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(user.id)) throw new PloegError(403, 'ploeg_actor', 'Your account identity cannot be recorded by Ploeg. Ask an administrator.');
    const text = reason.trim();
    if (text.length > 4096 || (decision === 'reject' && !text)) throw new PloegError(400, 'ploeg_decision', 'A rejection needs a reason of at most 4096 characters.');
    const current = await this.detail(user, id, true);
    if (decision !== 'cancel' && current.item.state !== 'proposed') throw new PloegError(409, 'ploeg_decision_conflict', 'Only a proposed Work Item can be approved or rejected. Refresh to see where it stands.');
    if (this.demo) {
      if (decision === 'cancel') return { workItemId: id, team: current.item.team, state: current.item.state, demo: true, withdrawn: false, shiftId: null, cancelledRuns: 0, stoppedRuns: 0, keysBlocked: null, message: demoCancellation };
      this.demoDecisions.set(id, decision);
      return { workItemId: id, team: current.item.team, state: decision === 'approve' ? 'queued' : 'withdrawn', demo: true };
    }
    const body = decision === 'cancel' ? undefined : text ? { reason: text } : {};
    const response = await this.request(`work-items/${id}/${decision}`, true, { actor: user.id, body }).catch(error => {
      if (decision === 'cancel' && error instanceof PloegError && error.status === 409) throw new PloegError(409, error.code, 'Ploeg did not cancel this Work Item: a workbench session drives it. Cancel that session instead.');
      throw error;
    });
    const data = envelope(response);
    const result = record(decision === 'cancel' ? data.cancellation : data.decision);
    const workItemId = identifier(typeof result.workItemId === 'number' ? String(result.workItemId) : result.workItemId);
    if (workItemId !== id) throw invalid();
    const decided = { workItemId, team: typeof result.team === 'string' ? result.team : current.item.team, state: token(result.state), demo: false };
    return decision === 'cancel' ? { ...decided, ...cancellation(result) } : decided;
  }
  /** The forge login Ploeg knows the caller by in the attribution flow: the administrator's `ploeg.forgeLogins` entry, in the demo the account id, otherwise null. Never a value the caller sets, because Ploeg compares it with the card's steward and the proposer. */
  forgeLogin(user: User): string | null {
    const login = this.demo ? user.id : this.config?.forgeLogins?.[user.id];
    return login && forgeLogin.test(login) ? login : null;
  }
  /** Who the caller is in the attribution flow and whether they may take a step at all. Unfold's card domain decides each step; this only says why the browser offers none. */
  attributionViewer(user: User): PloegAttributionViewer {
    const login = this.forgeLogin(user);
    if (user.role === 'viewer') return { login, canAct: false, reason: 'Viewers can read attributions but cannot propose, confirm, dispute or resolve one.' };
    if (!login) return { login: null, canAct: false, reason: 'Your account has no forge login yet. Ploeg compares it with the card’s steward and the proposer, so an administrator must add yours under ploeg.forgeLogins.' };
    return { login, canAct: true, reason: '' };
  }
  private actingLogin(user: User): string {
    if (user.role === 'viewer') throw new PloegError(403, 'forbidden', 'Viewers cannot change Ploeg work.');
    this.connected(user);
    const login = this.forgeLogin(user);
    if (!login) throw new PloegError(403, 'ploeg_forge_login', this.attributionViewer(user).reason);
    return login;
  }
  /** Lists the candidates for a bug Work Item's cause, for a caller who may read the Work Item. Unfold only proposes them. */
  async crackCandidates(user: User, id: string, fresh = false): Promise<PloegCrackCandidatesView> {
    const detail = await this.detail(user, id, fresh);
    const crackCandidates: PloegCrackCandidates = this.demo
      ? structuredClone(ploegDemo.crackCandidates[id] ?? { bug: { workItemId: id, title: detail.item.title, externalRef: detail.item.externalId }, fixFiles: 0, fixFilesTruncated: false, since: detail.item.createdAt, until: detail.item.createdAt, candidates: [] })
      : parseCrackCandidates(await (await this.cards(fresh)).crackCandidates(id, fresh));
    if (crackCandidates.bug.workItemId !== id) throw invalid();
    return { workItemId: id, crackCandidates, demo: this.demo, fetchedAt: new Date().toISOString() };
  }
  /** Lists every attribution in which the Work Item is the bug or the card, within the caller's Teams, and who the caller is in that flow. */
  async cracks(user: User, id: string, fresh = false): Promise<PloegCracksView> {
    await this.detail(user, id, fresh);
    const list = this.demo ? structuredClone(ploegDemo.cracks.filter(entry => entry.bug.workItemId === id || entry.card.workItemId === id)) : (await (await this.cards(fresh)).crackViews(id, fresh)).map(parseCrack);
    if (list.some(entry => entry.bug.workItemId !== id && entry.card.workItemId !== id)) throw invalid();
    return { workItemId: id, cracks: list.filter(entry => this.allowed(user, entry.team)), viewer: this.attributionViewer(user), demo: this.demo, fetchedAt: new Date().toISOString() };
  }
  /** Lists the context files attached to Work Item `id` for a caller in its Team, in the order Ploeg added them. The demo stores none, so it lists none. */
  async listContext(user: User, id: string, fresh = false): Promise<PloegContextList> {
    await this.detail(user, id, fresh);
    if (this.demo) return { workItemId: id, context: [], demo: true };
    const context = array(envelope(await this.request(`work-items/${id}/context`, fresh, { versions: contextVersions, context: true }), contextVersions).context, parseContextItem, 500);
    if (context.some(entry => entry.workItemId !== id)) throw invalid();
    return { workItemId: id, context, demo: false };
  }
  /**
   * Forwards one context file (`bytes`, a zip, a tar.gz or a single file) to Ploeg for Work Item `id`, as the caller.
   * Ploeg stores it and gives it to every Run claimed after the upload; uploaded while a Shift is open, it reaches the
   * next Run, not the one running. Unfold keeps nothing and never executes with it. The demo refuses with
   * {@link demoContextRefusal}.
   */
  async addContext(user: User, id: string, name: unknown, note: unknown, bytes: Uint8Array): Promise<PloegContextAdded> {
    if (user.role === 'viewer') throw new PloegError(403, 'forbidden', 'Viewers cannot change Ploeg work.');
    this.connected(user);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(user.id)) throw new PloegError(403, 'ploeg_actor', 'Your account identity cannot be recorded by Ploeg. Ask an administrator.');
    const input = contextInput(name, note);
    if (!bytes.byteLength) throw new PloegError(400, 'context_empty', 'The file is empty.');
    if (bytes.byteLength > contextUploadLimit) throw new PloegError(413, 'context_too_large', 'The file is larger than the 20 MiB upload limit.');
    await this.detail(user, id, true);
    if (this.demo) throw new PloegError(409, 'ploeg_demo', demoContextRefusal);
    const query = `name=${encodeURIComponent(input.name)}${input.note ? `&note=${encodeURIComponent(input.note)}` : ''}`;
    const answer = { status: 0 };
    const data = envelope(await this.request(`work-items/${id}/context?${query}`, true, { actor: user.id, raw: bytes, versions: contextVersions, context: true, answer }), contextVersions);
    const context = parseContextItem(data.context);
    if (context.workItemId !== id) throw invalid();
    return { context, created: answer.status === 201, demo: false };
  }
  /**
   * Proposes a crack (`propose`: the bug Work Item `bug` caused by `input.card`'s play) or marks the bug as a changed requirement for that card
   * (`evolved`), as the caller's forge login. Both Work Items must be in the caller's Teams and the same Team. Unfold's card domain applies the rules; the demo
   * applies them and keeps nothing.
   */
  async attribute(user: User, bug: string, step: 'propose' | 'evolved', input: Record<string, unknown>): Promise<PloegAttributionResult> {
    const login = this.actingLogin(user);
    attributionId(bug, 'The bug');
    const card = attributionId(input.card, 'card');
    if (card === bug) throw new PloegError(400, 'crack_invalid_request', 'A bug cannot crack its own card.');
    const note = attributionText(input.note, 'The note');
    const body: Record<string, unknown> = { card };
    if (step === 'propose') {
      const play = input.play === undefined || input.play === null || input.play === 0 || input.play === '' ? 0 : Number(input.play);
      if (!Number.isSafeInteger(play) || play < 0) throw new PloegError(400, 'crack_invalid_request', 'play must be a pull request number.');
      if (play) body.play = play;
      body.severity = attributionChoice(input.severity, ['S1', 'S2', 'S3', 'S4'] as const, 'Severity', true);
      body.share = attributionChoice(input.share, ['primary', 'contributing'] as const, 'Share', true);
      const discovery = attributionChoice(input.discovery, ['discovered', 'concealed'] as const, 'Discovery');
      if (discovery) body.discovery = discovery;
    }
    if (note) body.note = note;
    const [bugDetail, cardDetail] = [await this.detail(user, bug, true), await this.detail(user, card, true)];
    if (bugDetail.item.team !== cardDetail.item.team) throw new PloegError(404, 'ploeg_not_found', 'Ploeg work item not found in your authorized teams.');
    if (this.demo) return { crack: this.demoAttribute(login, bugDetail.item, cardDetail.item, step, body), demo: true, message: demoAttribution };
    const cards = await this.cards();
    const by = { person: login, audit: `unfold:${user.id}` };
    const recorded = await (step === 'propose'
      ? cards.propose(bug, card, { play: typeof body.play === 'number' ? body.play : 0, severity: String(body.severity ?? ''), share: String(body.share ?? ''), discovery: String(body.discovery ?? ''), note: String(body.note ?? '') }, by)
      : cards.evolved(bug, card, String(body.note ?? ''), by)).catch(error => this.crackFailure(error));
    const crack = parseCrack(cards.view(recorded));
    if (crack.bug.workItemId !== bug || crack.card.workItemId !== card || !this.allowed(user, crack.team)) throw invalid();
    return { crack, demo: false, message: '' };
  }
  /**
   * Confirms, disputes or resolves one attribution of the Work Item `workItem`, as the caller's forge login. Unfold first reads that Work Item's
   * attributions within the caller's Teams, so a crack elsewhere is not found. Unfold's card domain decides who may take the step; the demo applies its rules and keeps nothing.
   */
  async decideCrack(user: User, workItem: string, crackId: string, step: 'confirm' | 'dispute' | 'resolve', input: Record<string, unknown>): Promise<PloegAttributionResult> {
    const login = this.actingLogin(user);
    attributionId(workItem, 'The Work Item');
    attributionId(crackId, 'The attribution');
    const body: Record<string, unknown> = {};
    if (step === 'confirm') {
      const severity = attributionChoice(input.severity, ['S1', 'S2', 'S3', 'S4'] as const, 'Severity');
      const share = attributionChoice(input.share, ['primary', 'contributing'] as const, 'Share');
      if (severity) body.severity = severity;
      if (share) body.share = share;
    }
    if (step === 'dispute') body.reason = attributionText(input.reason, 'A reason', true);
    if (step === 'resolve') body.resolution = attributionChoice(input.resolution, ['upheld', 'unlinked'] as const, 'The resolution', true);
    if (step !== 'dispute') { const note = attributionText(input.note, 'The note'); if (note) body.note = note; }
    const current = (await this.cracks(user, workItem, true)).cracks.find(entry => entry.id === crackId);
    if (!current) throw new PloegError(404, 'ploeg_not_found', 'That attribution is not on this Work Item in your Teams.');
    if (this.demo) return { crack: this.demoDecide(login, current, step, body), demo: true, message: demoAttribution };
    const cards = await this.cards();
    const recorded = await cards.decide(crackId, step, { severity: String(body.severity ?? ''), share: String(body.share ?? ''), reason: String(body.reason ?? ''), resolution: String(body.resolution ?? ''), note: String(body.note ?? '') }, { person: login, audit: `unfold:${user.id}` }, team => this.allowed(user, team)).catch(error => this.crackFailure(error));
    const crack = parseCrack(cards.view(recorded));
    if (crack.id !== crackId || !this.allowed(user, crack.team)) throw invalid();
    return { crack, demo: false, message: '' };
  }
  private demoAttribute(login: string, bug: PloegItem, cardItem: PloegItem, step: 'propose' | 'evolved', body: Record<string, unknown>): PloegCrack {
    const refuse = (status: number, code: string) => new PloegError(status, `crack_${code}`, attributionRefusals[code][1]);
    const card = ploegDemo.cards[cardItem.id];
    const steward = card?.steward?.name ?? null;
    const existing = ploegDemo.cracks.find(entry => entry.bug.workItemId === bug.id && entry.card.workItemId === cardItem.id);
    const item = (entry: PloegItem): PloegCrackItem => ({ workItemId: entry.id, title: entry.title, externalRef: entry.externalId });
    const now = new Date().toISOString();
    const base: PloegCrack = { id: String(9000 + Number(cardItem.id)), team: bug.team, state: 'proposed', card: item(cardItem), bug: item(bug), play: null, severity: null, share: null, discovery: null, steward, note: typeof body.note === 'string' ? body.note : null, proposedBy: login, proposedAt: now, confirmedBy: [], confirmedAt: null, disputeUntil: null, disputed: false, disputedBy: null, disputedAt: null, disputeReason: null, resolvedBy: null, resolvedAt: null, resolution: null, evolvedBy: null, evolvedAt: null, mended: null };
    if (step === 'evolved') {
      if (samePerson(login, existing?.steward ?? steward)) throw new PloegError(403, 'crack_forbidden_actor', 'The card’s steward does not decide that their own card evolved.');
      if (existing && existing.state !== 'proposed') throw refuse(409, 'invalid_state');
      return { ...(existing ?? base), state: 'evolved', evolvedBy: login, evolvedAt: now };
    }
    const merged = card?.plays.filter(play => play.state === 'merged' && play.mergedAt && Date.parse(play.mergedAt) <= Date.parse(bug.createdAt)).at(-1);
    if (!merged) throw refuse(409, 'not_merged');
    if (existing) throw refuse(409, 'already_attributed');
    if (ploegDemo.cracks.filter(entry => entry.bug.workItemId === bug.id && ['proposed', 'confirmed', 'disputed'].includes(entry.state)).length >= 3) throw refuse(409, 'crack_limit');
    let discovery = typeof body.discovery === 'string' ? body.discovery : 'discovered';
    if (samePerson(login, steward)) discovery = 'self';
    if (discovery === 'concealed' && !ploegDemo.cards[bug.id]?.plays.some(play => play.state === 'merged' && samePerson(play.mergedBy, steward))) throw refuse(409, 'concealment_unproven');
    return { ...base, play: merged.number, severity: body.severity as string, share: body.share as string, discovery };
  }
  private demoDecide(login: string, crack: PloegCrack, step: 'confirm' | 'dispute' | 'resolve', body: Record<string, unknown>): PloegCrack {
    const forbidden = (message: string) => new PloegError(403, 'crack_forbidden_actor', message);
    const state = (message: string) => new PloegError(409, 'crack_invalid_state', message);
    const now = new Date();
    if (step === 'confirm') {
      if (crack.state !== 'proposed') throw state('Only a proposed crack can be confirmed.');
      if (samePerson(login, crack.steward) || samePerson(login, crack.proposedBy)) throw forbidden('The second person is neither the card’s steward nor the proposer.');
      let until = now.getTime(); for (let days = 5; days > 0;) { until += 86_400_000; const weekday = new Date(until).getUTCDay(); if (weekday !== 0 && weekday !== 6) days--; }
      return { ...crack, state: 'confirmed', severity: (body.severity as string) || crack.severity, share: (body.share as string) || crack.share, confirmedBy: [crack.proposedBy, login], confirmedAt: now.toISOString(), disputeUntil: new Date(until).toISOString() };
    }
    if (step === 'dispute') {
      if (crack.state !== 'confirmed' || crack.resolution) throw state('Only a confirmed crack that no referee decided can be disputed.');
      if (!samePerson(login, crack.steward)) throw forbidden('Only the card’s steward disputes a crack.');
      if (crack.disputeUntil && now.getTime() > Date.parse(crack.disputeUntil)) throw new PloegError(409, 'crack_dispute_closed', attributionRefusals.dispute_closed[1]);
      return { ...crack, state: 'disputed', disputed: true, disputedBy: login, disputedAt: now.toISOString(), disputeReason: body.reason as string };
    }
    if (crack.state !== 'disputed') throw state('Only a disputed crack is resolved.');
    if ([crack.steward, crack.proposedBy, crack.confirmedBy[1], crack.disputedBy].some(involved => samePerson(login, involved))) throw forbidden('A referee took no part in the crack.');
    return { ...crack, state: body.resolution === 'unlinked' ? 'unlinked' : 'confirmed', disputed: false, resolvedBy: login, resolvedAt: now.toISOString(), resolution: body.resolution as 'upheld' | 'unlinked' };
  }
  /** Admits an Ask on a Work Item the caller can see, as the caller (system ADR-0031, Ploeg ADR-0081). Throws {@link AskAllowanceUsedUp} when the Team's allowance is used up. The demo admits nothing. */
  async admitAsk(user: User, id: string, askId: string, question: string): Promise<PloegAskGrant> {
    this.connected(user);
    if (this.demo) throw new PloegError(409, 'ploeg_demo', 'The demo answers Asks without Ploeg.');
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(user.id)) throw new PloegError(403, 'ploeg_actor', 'Your account identity cannot be recorded by Ploeg. Ask an administrator.');
    await this.detail(user, id, true);
    const data = envelope(await this.request(`work-items/${id}/asks`, true, { actor: user.id, body: { askId, question }, ask: true }));
    const ask = record(data.ask);
    if (ask.workItemId !== id || ask.askId !== askId) throw invalid();
    if (data.credential === null) throw new PloegError(409, 'ask_replayed', 'Ploeg already issued a key for this Ask. Ask again.');
    const credential = record(data.credential);
    const models = Array.isArray(credential.models) ? credential.models.map(model => field(model, 200)) : [];
    return { askId, key: field(credential.key, 4096), models, expiresAt: field(credential.expiresAt, 64), allowance: data.allowance ? askAllowance(data.allowance) : null };
  }
  /** Finishes an Ask so Ploeg blocks its key. Safe to call again. */
  async finishAsk(user: User, id: string, askId: string): Promise<void> {
    if (this.demo) return;
    envelope(await this.request(`work-items/${id}/asks/${encodeURIComponent(askId)}/finish`, true, { actor: user.id, ask: true }));
  }
  /** Reads an Ask's spend from Ploeg. */
  async askSpend(user: User, id: string, askId: string): Promise<PloegAskSpend> {
    this.authorize(user);
    return askSpend(envelope(await this.request(`work-items/${id}/asks/${encodeURIComponent(askId)}`, true)).ask);
  }
  /** A Team's Ask Allowance for this month, or null in the demo. */
  async askAllowance(user: User, team: string): Promise<PloegAskAllowance | null> {
    this.connected(user);
    if (this.demo) return null;
    if (!this.allowed(user, team)) throw new PloegError(404, 'ploeg_not_found', 'Ploeg work item not found in your authorized teams.');
    return askAllowance(envelope(await this.request(`allowances?team=${encodeURIComponent(team)}`)).allowance);
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
