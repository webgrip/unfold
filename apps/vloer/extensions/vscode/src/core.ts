/** A status tone from the browser's design system. Accent blue is not a tone: it is reserved for interaction. */
export type Tone = 'neutral' | 'live' | 'attention' | 'review' | 'success' | 'danger' | 'severe';

/** How one state reads everywhere: a label, a tone and a glyph name from `public/core/states.js`. */
export type StateMeta = { key: string; label: string; tone: Tone; glyph: string; heading?: string; description?: string; live?: boolean; short?: string };

/** Why a Work Item waits on a person, as `public/core/reasons.js` derives it. */
export type Reason = { code: string; chip: string; sentence: string; fix: string; requeue: string; action: string; tone: Tone; glyph: string; headline?: string | null };

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
};

/** Loads the shared modules from `base`, a directory URL that holds `states.js`, `format.js` and `reasons.js`. */
export async function loadCore(base: string | URL): Promise<Core> {
  const directory = String(base).endsWith('/') ? String(base) : `${base}/`;
  const [states, format, reasons] = await Promise.all(['states.js', 'format.js', 'reasons.js'].map(name => import(new URL(name, directory).href)));
  return {
    workItemState: states.workItemState, displayState: states.displayState, runOutcome: states.runOutcome, verdict: states.verdict, failureReason: states.failureReason,
    playState: states.playState, ciState: states.ciState, humanReview: states.humanReview, sessionStatus: states.sessionStatus,
    listReason: reasons.listReason, detailReason: reasons.detailReason,
    money: format.money, moneyExact: format.moneyExact, count: format.count, dateTime: format.dateTime, time: format.time, relative: format.relative, duration: format.duration, notReported: format.notReported,
  };
}
