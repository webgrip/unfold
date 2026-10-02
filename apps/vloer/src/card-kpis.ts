/** A status kind on a Work Item's board (Ploeg ADR-0057, proposed). */
export type PloegFlowKind = 'active' | 'waiting' | 'blocked' | 'done';
/** A duration on the human timeline: calendar seconds and the seconds inside the team's working hours. */
export type PloegDuration = { seconds: number; workingSeconds: number };
/** A span between two moments (Ploeg ADR-0057, proposed): where each end came from, and `running` while it still runs to now. */
export type PloegSpan = PloegDuration & { from: string; to: string; running: boolean; start: string; end: string };
/** The time a Work Item spent in one tracker status (Ploeg ADR-0057, proposed). */
export type PloegFlowStatus = PloegDuration & { status: string; gate: string | null; kind: PloegFlowKind; visits: number; observed: boolean; current: boolean };
/** The working calendar a card's working seconds were counted in. */
export type PloegFlowCalendar = { timezone: string; days: string[]; start: string; end: string; holidays: number };
/** One mended confirmed crack's time from confirmation to mend. */
export type PloegFlowRestore = PloegDuration & { crackId: string; confirmedAt: string; mendedAt: string };
/** A Run card's flow figures (Ploeg ADR-0057, proposed): time per tracker status, lead and cycle time, queue and agent time, merge to deploy. null is a fact Ploeg does not know. */
export type PloegCardFlow = {
  statuses: PloegFlowStatus[]; statusesSince: string | null; truncated: boolean;
  gates: Record<string, PloegDuration>; kinds: Partial<Record<PloegFlowKind, PloegDuration>>;
  leadTime: PloegSpan | null; cycleTime: PloegSpan | null; timeToStart: PloegSpan | null;
  efficiency: number | null; blockedSeconds: number | null; blockedWorkingSeconds: number | null; reopens: number | null;
  queueSeconds: number | null; queueWorkingSeconds: number | null; agentSeconds: number | null; runs: number | null;
  firstRunToFirstPlaySeconds: number | null; firstRunToFirstPlayWorkingSeconds: number | null;
  mergeTo: Record<string, number> | null; mergeToWorking: Record<string, number> | null; environmentsReached: string[];
  timeToProduction: (PloegDuration & { environment: string }) | null;
  restores: PloegFlowRestore[]; meanRestoreSeconds: number | null; meanRestoreWorkingSeconds: number | null;
  estimateSeconds: number | null; calendar: PloegFlowCalendar | null; notCollected: string[];
};
/** When a play moved from opened to merged and how its review went (Ploeg ADR-0058, proposed). */
export type PloegPlayTimeline = {
  openedAt: string | null; readyAt: string | null; firstFeedbackAt: string | null; firstApprovalAt: string | null; lastApprovalAt: string | null; mergedAt: string | null;
  toFirstFeedbackSeconds: number | null; toFirstApprovalSeconds: number | null; approvalToMergeSeconds: number | null; openToMergeSeconds: number | null;
  reviewRounds: number | null; comments: number | null; reviewers: number | null; responseSeconds: number | null;
  commits: number | null; firstCommitAt: string | null; forcePushes: number | null; codingSeconds: number | null;
  truncated: boolean; capturedAt: string | null;
};
/** One of a play's slowest CI jobs. */
export type PloegSlowJob = { name: string; seconds: number };
/** How a play's CI runs went (Ploeg ADR-0058, proposed). */
export type PloegPlayCITiming = {
  runs: number | null; failedRuns: number | null; reruns: number | null; lastGreenSeconds: number | null; queueSeconds: number | null; timeToGreenSeconds: number | null;
  minutes: number | null; slowest: PloegSlowJob[]; firstPassGreen: boolean | null; source: string; truncated: boolean; capturedAt: string | null;
};
/** Indentation complexity of a change (Ploeg ADR-0058, proposed): logical indentation levels on added and removed lines. */
export type PloegComplexity = { method: string; added: number; removed: number; net: number; maxDepth: number; hotspots: { path: string; added: number }[] };
/** A language a change touched, by file extension. */
export type PloegLanguage = { name: string; lines: number };
/** How large, tested and complex a merged play's change was (Ploeg ADR-0058, proposed). */
export type PloegPlayShape = {
  complexity: PloegComplexity | null; files: number | null; countedLines: number | null; testLines: number | null; testRatio: number | null;
  docsTouched: number | null; languages: PloegLanguage[]; truncated: boolean; capturedAt: string | null;
};
/** Review and CI summed up across a card's plays (Ploeg ADR-0058, proposed). */
export type PloegCardPipeline = {
  plays: number | null; toFirstFeedbackSeconds: number | null; openToMergeSeconds: number | null; reviewRounds: number | null; comments: number | null; firstPassGreen: boolean | null;
  median: { toFirstFeedbackSeconds: number | null; openToMergeSeconds: number | null; responseSeconds: number | null; lastGreenSeconds: number | null };
  ci: { runs: number | null; failedRuns: number | null; reruns: number | null; minutes: number | null; queueSeconds: number | null } | null;
};
/** The change shape of a card's merged plays added up (Ploeg ADR-0058, proposed). */
export type PloegCardShape = Omit<PloegPlayShape, 'capturedAt'> & { plays: number | null; complete: boolean };

type Json = Record<string, unknown>;
const flowKinds: PloegFlowKind[] = ['active', 'waiting', 'blocked', 'done'];
const gateNames = ['development', 'test', 'acceptance', 'done'];
const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const token = /^[a-z][a-z0-9_]{0,31}$/;
const environmentName = /^[a-z0-9][a-z0-9_.-]{0,62}$/;
const notCollectedName = /^[a-z][A-Za-z.]{0,63}$/;

const isRecord = (value: unknown): value is Json => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const whole = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const signed = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
const amount = (value: unknown, max = Number.MAX_VALUE): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
const flag = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null;
const time = (value: unknown): string | null => typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value)) ? value : null;
const words = (value: unknown, max: number): string | null => typeof value === 'string' && value.trim() !== '' && value.length <= max && !value.includes('\0') ? value : null;
const tokenOf = (value: unknown): string => typeof value === 'string' && token.test(value) ? value : '';
const present = <T>(value: T | null): value is T => value !== null;
const entries = <T>(value: unknown, parse: (entry: unknown) => T | null, max: number): T[] => Array.isArray(value) ? value.slice(0, max).map(entry => { try { return parse(entry); } catch { return null; } }).filter(present) : [];
const guarded = <T>(value: unknown, parse: (data: Json) => T | null): T | null => { if (!isRecord(value)) return null; try { return parse(value); } catch { return null; } };

function duration(value: unknown): PloegDuration | null {
  return guarded(value, data => {
    const seconds = whole(data.seconds);
    const workingSeconds = whole(data.workingSeconds);
    return seconds === null || workingSeconds === null ? null : { seconds, workingSeconds };
  });
}

function span(value: unknown): PloegSpan | null {
  return guarded(value, data => {
    const length = duration(data);
    const from = time(data.from);
    const to = time(data.to);
    if (!length || !from || !to) return null;
    return { from, to, ...length, running: flag(data.running) ?? false, start: tokenOf(data.start), end: tokenOf(data.end) };
  });
}

function durations(value: unknown, keys: readonly string[]): Record<string, PloegDuration> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, duration(value[key])] as const).filter((entry): entry is [string, PloegDuration] => entry[1] !== null));
}

function perEnvironment(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null;
  return Object.fromEntries(Object.entries(value).slice(0, 20).filter(([name, seconds]) => environmentName.test(name) && whole(seconds) !== null) as [string, number][]);
}

function flowStatus(value: unknown): PloegFlowStatus | null {
  return guarded(value, data => {
    const status = words(data.status, 256);
    const kind = flowKinds.includes(data.kind as PloegFlowKind) ? data.kind as PloegFlowKind : null;
    const length = duration(data);
    if (!status || !kind || !length) return null;
    return { status, gate: gateNames.includes(data.gate as string) ? data.gate as string : null, kind, visits: whole(data.visits) ?? 1, ...length, observed: flag(data.observed) ?? false, current: flag(data.current) ?? false };
  });
}

function calendar(value: unknown): PloegFlowCalendar | null {
  return guarded(value, data => {
    const timezone = words(data.timezone, 64);
    const days = Array.isArray(data.days) ? data.days.filter(day => weekdays.includes(day as string)) as string[] : [];
    const clock = (entry: unknown) => typeof entry === 'string' && /^[0-2][0-9]:[0-5][0-9]$/.test(entry) ? entry : null;
    const start = clock(data.start);
    const end = clock(data.end);
    if (!timezone || !days.length || !start || !end) return null;
    return { timezone, days: weekdays.filter(day => days.includes(day)), start, end, holidays: whole(data.holidays) ?? 0 };
  });
}

function restore(value: unknown): PloegFlowRestore | null {
  return guarded(value, data => {
    const crackId = words(data.crackId, 128);
    const confirmedAt = time(data.confirmedAt);
    const mendedAt = time(data.mendedAt);
    const length = duration(data);
    return crackId && confirmedAt && mendedAt && length ? { crackId, confirmedAt, mendedAt, ...length } : null;
  });
}

/**
 * Reads a card's flow figures (Ploeg ADR-0057, proposed) strictly but additively: each known field is checked, a field
 * Vloer does not know is dropped, an unreadable figure or sub-object becomes null (an unreadable list entry is left out),
 * and anything that is not an object, including an older Ploeg's absent flow, is null.
 */
export function cardFlow(value: unknown): PloegCardFlow | null {
  return guarded(value, data => {
    const production = guarded(data.timeToProduction, entry => { const length = duration(entry); const environment = typeof entry.environment === 'string' && environmentName.test(entry.environment) ? entry.environment : null; return length && environment ? { environment, ...length } : null; });
    return {
      statuses: entries(data.statuses, flowStatus, 50),
      statusesSince: time(data.statusesSince),
      truncated: flag(data.truncated) ?? false,
      gates: durations(data.gates, gateNames),
      kinds: durations(data.kinds, flowKinds),
      leadTime: span(data.leadTime), cycleTime: span(data.cycleTime), timeToStart: span(data.timeToStart),
      efficiency: amount(data.efficiency, 1),
      blockedSeconds: whole(data.blockedSeconds), blockedWorkingSeconds: whole(data.blockedWorkingSeconds),
      reopens: whole(data.reopens),
      queueSeconds: whole(data.queueSeconds), queueWorkingSeconds: whole(data.queueWorkingSeconds),
      agentSeconds: whole(data.agentSeconds), runs: whole(data.runs),
      firstRunToFirstPlaySeconds: whole(data.firstRunToFirstPlaySeconds), firstRunToFirstPlayWorkingSeconds: whole(data.firstRunToFirstPlayWorkingSeconds),
      mergeTo: perEnvironment(data.mergeTo), mergeToWorking: perEnvironment(data.mergeToWorking),
      environmentsReached: entries(data.environmentsReached, entry => typeof entry === 'string' && environmentName.test(entry) ? entry : null, 20),
      timeToProduction: production,
      restores: entries(data.restores, restore, 20),
      meanRestoreSeconds: amount(data.meanRestoreSeconds), meanRestoreWorkingSeconds: amount(data.meanRestoreWorkingSeconds),
      estimateSeconds: whole(data.estimateSeconds),
      calendar: calendar(data.calendar),
      notCollected: entries(data.notCollected, entry => typeof entry === 'string' && notCollectedName.test(entry) ? entry : null, 20),
    };
  });
}

/** Reads a play's pull request timeline (Ploeg ADR-0058, proposed), strictly but additively; null when it is not an object. */
export function playTimeline(value: unknown): PloegPlayTimeline | null {
  return guarded(value, data => ({
    openedAt: time(data.openedAt), readyAt: time(data.readyAt), firstFeedbackAt: time(data.firstFeedbackAt), firstApprovalAt: time(data.firstApprovalAt), lastApprovalAt: time(data.lastApprovalAt), mergedAt: time(data.mergedAt),
    toFirstFeedbackSeconds: whole(data.toFirstFeedbackSeconds), toFirstApprovalSeconds: whole(data.toFirstApprovalSeconds), approvalToMergeSeconds: whole(data.approvalToMergeSeconds), openToMergeSeconds: whole(data.openToMergeSeconds),
    reviewRounds: whole(data.reviewRounds), comments: whole(data.comments), reviewers: whole(data.reviewers), responseSeconds: whole(data.responseSeconds),
    commits: whole(data.commits), firstCommitAt: time(data.firstCommitAt), forcePushes: whole(data.forcePushes), codingSeconds: whole(data.codingSeconds),
    truncated: flag(data.truncated) ?? false, capturedAt: time(data.capturedAt),
  }));
}

/** Reads a play's CI timing (Ploeg ADR-0058, proposed), strictly but additively; null when it is not an object. */
export function playCITiming(value: unknown): PloegPlayCITiming | null {
  return guarded(value, data => ({
    runs: whole(data.runs), failedRuns: whole(data.failedRuns), reruns: whole(data.reruns),
    lastGreenSeconds: whole(data.lastGreenSeconds), queueSeconds: whole(data.queueSeconds), timeToGreenSeconds: whole(data.timeToGreenSeconds),
    minutes: amount(data.minutes),
    slowest: entries(data.slowest, entry => guarded(entry, job => { const name = words(job.name, 256); const seconds = whole(job.seconds); return name && seconds !== null ? { name, seconds } : null; }), 3),
    firstPassGreen: flag(data.firstPassGreen), source: tokenOf(data.source), truncated: flag(data.truncated) ?? false, capturedAt: time(data.capturedAt),
  }));
}

function complexity(value: unknown): PloegComplexity | null {
  return guarded(value, data => {
    const method = words(data.method, 64);
    const added = whole(data.added);
    const removed = whole(data.removed);
    const net = signed(data.net);
    const maxDepth = whole(data.maxDepth);
    if (!method || added === null || removed === null || net === null || maxDepth === null) return null;
    return { method, added, removed, net, maxDepth, hotspots: entries(data.hotspots, entry => guarded(entry, spot => { const path = words(spot.path, 1024); const lines = whole(spot.added); return path && lines !== null ? { path, added: lines } : null; }), 3) };
  });
}

function shapeFields(data: Json): Omit<PloegPlayShape, 'capturedAt'> {
  return {
    complexity: complexity(data.complexity), files: whole(data.files), countedLines: whole(data.countedLines), testLines: whole(data.testLines), testRatio: amount(data.testRatio),
    docsTouched: whole(data.docsTouched),
    languages: entries(data.languages, entry => guarded(entry, language => { const name = words(language.name, 64); const lines = whole(language.lines); return name && lines !== null ? { name, lines } : null; }), 3),
    truncated: flag(data.truncated) ?? false,
  };
}

/** Reads a merged play's change shape (Ploeg ADR-0058, proposed), strictly but additively; null when it is not an object. */
export function playShape(value: unknown): PloegPlayShape | null {
  return guarded(value, data => ({ ...shapeFields(data), capturedAt: time(data.capturedAt) }));
}

/** Reads a card's review and CI summary across its plays (Ploeg ADR-0058, proposed), strictly but additively; null when it is not an object. */
export function cardPipeline(value: unknown): PloegCardPipeline | null {
  return guarded(value, data => {
    const median = isRecord(data.median) ? data.median : {};
    const ci = guarded(data.ci, totals => ({ runs: whole(totals.runs), failedRuns: whole(totals.failedRuns), reruns: whole(totals.reruns), minutes: amount(totals.minutes), queueSeconds: whole(totals.queueSeconds) }));
    return {
      plays: whole(data.plays), toFirstFeedbackSeconds: whole(data.toFirstFeedbackSeconds), openToMergeSeconds: whole(data.openToMergeSeconds),
      reviewRounds: whole(data.reviewRounds), comments: whole(data.comments), firstPassGreen: flag(data.firstPassGreen),
      median: { toFirstFeedbackSeconds: whole(median.toFirstFeedbackSeconds), openToMergeSeconds: whole(median.openToMergeSeconds), responseSeconds: whole(median.responseSeconds), lastGreenSeconds: whole(median.lastGreenSeconds) },
      ci,
    };
  });
}

/** Reads a card's change shape over its merged plays (Ploeg ADR-0058, proposed), strictly but additively; null when it is not an object. */
export function cardShape(value: unknown): PloegCardShape | null {
  return guarded(value, data => ({ plays: whole(data.plays), complete: flag(data.complete) ?? false, ...shapeFields(data) }));
}

/** The KPI fields of a play, each present only when Ploeg sent it, so an older Ploeg's card keeps its shape. */
export function playKpis(data: Json): { timeline?: PloegPlayTimeline | null; ciTiming?: PloegPlayCITiming | null; shape?: PloegPlayShape | null } {
  return {
    ...(data.timeline === undefined ? {} : { timeline: playTimeline(data.timeline) }),
    ...(data.ciTiming === undefined ? {} : { ciTiming: playCITiming(data.ciTiming) }),
    ...(data.shape === undefined ? {} : { shape: playShape(data.shape) }),
  };
}

/** The KPI fields of a card, each present only when Ploeg sent it, so an older Ploeg's card keeps its shape. */
export function cardKpis(data: Json): { flow?: PloegCardFlow | null; pipeline?: PloegCardPipeline | null; shape?: PloegCardShape | null } {
  return {
    ...(data.flow === undefined ? {} : { flow: cardFlow(data.flow) }),
    ...(data.pipeline === undefined ? {} : { pipeline: cardPipeline(data.pipeline) }),
    ...(data.shape === undefined ? {} : { shape: cardShape(data.shape) }),
  };
}
