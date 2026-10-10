/** A status tone from the browser's design system. Accent blue is not a tone: it is reserved for interaction. */
export type Tone = 'neutral' | 'live' | 'attention' | 'review' | 'success' | 'danger' | 'severe';

/** How one state reads everywhere: a label, a tone and a glyph name from `public/core/states.js`. */
export type StateMeta = { key: string; label: string; tone: Tone; glyph: string; heading?: string; description?: string; live?: boolean; short?: string };

/** Why a Work Item waits on a person, as `public/core/reasons.js` derives it. */
export type Reason = { code: string; chip: string; sentence: string; fix: string; requeue: string; action: string; tone: Tone; glyph: string; headline?: string | null };

/** One action a progress state offers, primary first, with a specific confirmation when it is costly or irreversible. */
export type ProgressAction = { id: string; label: string; primary?: boolean; confirm?: { title: string; detail: string; button: string } };

/** One Role's Run as a progress step. */
export type ProgressStep = { id: string; role: string; mode: 'write' | 'read'; state: string; label: string; tone: Tone; verdict: { key: string; label: string; tone: Tone; recorded: boolean } | null; startedAt: string; finishedAt: string; seconds: number | null; summary: string };

/** The derived state of a session and its Work Item, as `public/core/progress.js` builds it for every surface. */
export type Progress = {
  phase: string; meta: { label: string; tone: Tone; glyph: string; live?: boolean }; headline: string; short: string; next: string; activity: string; demo: boolean;
  reason: { code: string; short: string; sentence: string; at: string; retained?: boolean } | null;
  current: { role: string; mode: string; runId: string; startedAt: string; seconds: number | null; round: number | null; activity: { at: string; text: string } | null } | null;
  steps: ProgressStep[];
  change: { files: number; added: number; removed: number; viewable: boolean; candidate: string | null; candidateText: string; branch: string; pullRequest: { number: number; url: string; state: string } | null };
  spend: { valueUsd: number | null; budgetUsd: number | null; status: string; text: string; note: string };
  facts: string[]; actions: ProgressAction[]; workItemId: string; sessionId: string;
};

/** A Work Item as far as the reason derivation reads it. */
export type ReasonInput = { state: string; provider?: string; url?: string; closeReason?: string | null; attempts?: number; infraFailures?: number; latestShift?: { closeReason?: string; closedAt?: string | null } | null };

/** The browser's shared vocabulary and formatter, loaded from the copies `scripts/sync-core.mjs` ships in `media/core/`. */
export type Core = {
  workItemState(key: string): StateMeta;
  displayState(item: { state?: string; provider?: string; latestShift?: object | null; attempts?: number }, events?: { action: string; id?: string }[]): string;
  runOutcome(key: string | null | undefined): StateMeta | null;
  verdict(key: string | null | undefined): StateMeta;
  failureReason(key: string | null | undefined): (StateMeta & { cause?: string; next?: string; infra?: boolean }) | null;
  playState(key: string): StateMeta;
  ciState(key: string | null | undefined): StateMeta | null;
  humanReview(key: string): StateMeta;
  sessionStatus(session: { status: string; review?: { decision: string } }): StateMeta;
  listReason(item: ReasonInput, options?: { demo?: boolean }): Reason | null;
  detailReason(detail: unknown): (Reason & { variant: string | null; headline: string | null; run: { id: string; role: string; round: number; text: string } | null }) | null;
  money(value: unknown): string;
  moneyExact(value: unknown): string;
  count(value: unknown): string;
  dateTime(value: unknown): string;
  time(value: unknown, options?: { seconds?: boolean }): string;
  relative(value: unknown, now?: number): string;
  duration(seconds: unknown): string;
  notReported: string;
  checkoutTarget(detail: unknown, card?: unknown): CheckoutTarget | null;
  checkoutCommand(branch: string, remote?: string): string;
  checkoutableBranch(name: unknown): boolean;
  sessionProgress(session: unknown, options?: { events?: unknown[]; now?: number; viewer?: boolean; ploeg?: unknown; card?: unknown; recovery?: unknown }): Progress;
  progressGroup(progress: Progress): 'needs' | 'review' | 'running' | null;
  sessionForWorkItem<T extends { execution?: { workItemId: string } }>(sessions: T[], workItemId: string): T | null;
  elapsedClock(seconds: number | null | undefined): string;
  changedFiles(session: unknown): { file: string; added: number; removed: number; before?: string; after?: string; artifactId: string }[];
};

/** The branch a Work Item's change is on and the repository it belongs to, as `public/core/checkout.js` reads them. */
export type CheckoutTarget = { branch: string; owner: string; repo: string; baseBranch: string };

/** Loads the shared modules from `base`, a directory URL that holds `states.js`, `format.js`, `reasons.js`, `checkout.js` and `progress.js`. */
export async function loadCore(base: string | URL): Promise<Core> {
  const directory = String(base).endsWith('/') ? String(base) : `${base}/`;
  const [states, format, reasons, checkout, progress] = await Promise.all(['states.js', 'format.js', 'reasons.js', 'checkout.js', 'progress.js'].map(name => import(new URL(name, directory).href)));
  return {
    workItemState: states.workItemState, displayState: states.displayState, runOutcome: states.runOutcome, verdict: states.verdict, failureReason: states.failureReason,
    playState: states.playState, ciState: states.ciState, humanReview: states.humanReview, sessionStatus: states.sessionStatus,
    listReason: reasons.listReason, detailReason: reasons.detailReason,
    money: format.money, moneyExact: format.moneyExact, count: format.count, dateTime: format.dateTime, time: format.time, relative: format.relative, duration: format.duration, notReported: format.notReported,
    checkoutTarget: checkout.checkoutTarget, checkoutCommand: checkout.checkoutCommand, checkoutableBranch: checkout.checkoutableBranch,
    sessionProgress: progress.sessionProgress, progressGroup: progress.progressGroup, sessionForWorkItem: progress.sessionForWorkItem, elapsedClock: progress.elapsedClock, changedFiles: progress.changedFiles,
  };
}
