import type { PloegCard, PloegCardPlay, PloegGate } from './ploeg.ts';
import type { PloegCardFlow, PloegCardPipeline, PloegCardShape, PloegDuration, PloegFlowKind, PloegFlowStatus, PloegPlayCITiming, PloegPlayShape, PloegPlayTimeline, PloegSpan } from './card-kpis.ts';

const minute = 60_000;
const day = 1440;
const zone = 'Europe/Amsterdam';
const workdays = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
const zoneParts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
const localDays = new Map<string, { weekday: string; start: number; end: number }>();

function partsAt(ms: number) {
  return Object.fromEntries(zoneParts.formatToParts(ms).filter(part => part.type !== 'literal').map(part => [part.type, part.value])) as Record<string, string>;
}

function localDay(ms: number) {
  const part = partsAt(ms);
  const key = `${part.year}-${part.month}-${part.day}`;
  if (!localDays.has(key)) {
    const offset = Date.UTC(Number(part.year), Number(part.month) - 1, Number(part.day), Number(part.hour), Number(part.minute)) - Math.floor(ms / minute) * minute;
    const midnight = Date.UTC(Number(part.year), Number(part.month) - 1, Number(part.day));
    localDays.set(key, { weekday: part.weekday, start: midnight + 9 * 3_600_000 - offset, end: midnight + 17 * 3_600_000 - offset });
  }
  return localDays.get(key)!;
}

/** Seconds between two moments inside Monday to Friday, 09:00 to 17:00, Europe/Amsterdam: the default team calendar of Ploeg ADR-0057 (proposed), for the demo's illustrative working time. */
export function demoWorkingSeconds(from: number, to: number): number {
  if (!(to > from)) return 0;
  let total = 0;
  for (let local = localDay(from); local.start < to; local = localDay(local.start + day * minute)) {
    if (workdays.has(local.weekday)) total += Math.max(0, Math.min(to, local.end) - Math.max(from, local.start));
  }
  return Math.round(total / 1000);
}

type Step = [status: string, kind: PloegFlowKind, gate: PloegGate | null, minutes: number];
type CISpec = { runs: number; failed?: number; reruns?: number; lastGreen?: number | null; queue: number; toGreen?: number | null; minutes: number; slowest: [string, number][]; firstPass?: boolean | null };
type ShapeSpec = { added: number; removed: number; depth: number; hotspots: [string, number][]; tests: number; docs: number; languages: [string, number][] };
type PlayKpiSpec = { opened: number; ready?: number; feedback?: number | null; approval?: number | null; rounds: number; comments: number; reviewers: number; response?: number | null; commits: number; firstCommit: number; forcePushes: number; ci: CISpec; shape?: ShapeSpec };
/** One demo card's illustrative KPI facts, in minutes before the demo's anchor. */
export type DemoKpiSpec = { created: number; steps: Step[]; estimate?: number; play?: PlayKpiSpec; observed?: string[] };
type Context = { anchor: number; queuedAt: Record<string, number> };

const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

function span(from: number, to: number, running: boolean, start: string, end: string): PloegSpan {
  return { from: iso(from), to: iso(to), seconds: Math.round((to - from) / 1000), workingSeconds: demoWorkingSeconds(from, to), running, start, end };
}

function pair(from: number, to: number): PloegDuration {
  return { seconds: Math.max(0, Math.round((to - from) / 1000)), workingSeconds: demoWorkingSeconds(from, to) };
}

const median = (values: number[]) => { if (!values.length) return null; const sorted = values.slice().sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2); };

function flowFor(card: PloegCard, spec: DemoKpiSpec, { anchor, queuedAt }: Context): PloegCardFlow {
  const at = (minutes: number) => anchor - minutes * minute;
  const now = anchor;
  const steps = spec.steps.slice().sort((a, b) => b[3] - a[3]);
  const intervals = steps.map((step, index) => ({ status: step[0], kind: step[1], gate: step[2], from: at(step[3]), to: index + 1 < steps.length ? at(steps[index + 1][3]) : now, current: index === steps.length - 1 }));
  const order: string[] = [];
  const byStatus = new Map<string, PloegFlowStatus>();
  for (const entry of intervals) {
    if (!byStatus.has(entry.status)) { order.push(entry.status); byStatus.set(entry.status, { status: entry.status, gate: entry.gate, kind: entry.kind, visits: 0, seconds: 0, workingSeconds: 0, observed: spec.observed?.includes(entry.status) ?? false, current: false }); }
    const status = byStatus.get(entry.status)!;
    const length = pair(entry.from, entry.to);
    status.visits++; status.seconds += length.seconds; status.workingSeconds += length.workingSeconds; status.gate = entry.gate;
    if (entry.current) status.current = true;
  }
  const sum = (key: 'kind' | 'gate') => { const totals: Record<string, PloegDuration> = {}; for (const status of byStatus.values()) { const name = status[key]; if (!name) continue; totals[name] ??= { seconds: 0, workingSeconds: 0 }; totals[name].seconds += status.seconds; totals[name].workingSeconds += status.workingSeconds; } return totals; };
  const runs = card.events.filter(event => event.kind === 'run_started').map(event => Date.parse(event.at));
  const firstRun = runs.length ? Math.min(...runs) : null;
  const firstActive = intervals.find(entry => entry.kind === 'active')?.from ?? null;
  const started = [firstRun, firstActive].filter((value): value is number => value !== null);
  const cycleStart = started.length ? Math.min(...started) : null;
  const created = at(spec.created);
  const merged = card.plays.filter(play => play.mergedAt).map(play => Date.parse(play.mergedAt!)).sort((a, b) => a - b).at(-1) ?? null;
  const release = card.release ? Date.parse(card.release.at) : null;
  const deliverable = card.state !== 'withdrawn' && card.state !== 'closed';
  const leadTime = release !== null ? span(created, release, false, 'tracker_created', 'release') : deliverable ? span(created, now, true, 'tracker_created', 'now') : null;
  const cycleEnd = release ?? merged;
  const cycleTime = cycleStart === null ? null : cycleEnd !== null ? span(cycleStart, cycleEnd, false, cycleStart === firstRun ? 'first_run' : 'first_active', release !== null ? 'release' : 'merge') : span(cycleStart, now, true, cycleStart === firstRun ? 'first_run' : 'first_active', 'now');
  const timeToStart = cycleStart === null ? span(created, now, true, 'tracker_created', 'now') : span(created, cycleStart, false, 'tracker_created', cycleStart === firstRun ? 'first_run' : 'first_active');
  let active = 0; let flowing = 0;
  if (cycleStart !== null) for (const entry of intervals) {
    const from = Math.max(entry.from, cycleStart);
    const to = Math.min(entry.to, cycleEnd ?? now);
    if (to <= from || entry.kind === 'done') continue;
    flowing += to - from;
    if (entry.kind === 'active') active += to - from;
  }
  const reopens = intervals.filter((entry, index) => index > 0 && intervals[index - 1].kind === 'done' && entry.kind !== 'done').length;
  const blocked = intervals.filter(entry => entry.kind === 'blocked').reduce((total, entry) => ({ seconds: total.seconds + pair(entry.from, entry.to).seconds, workingSeconds: total.workingSeconds + pair(entry.from, entry.to).workingSeconds }), { seconds: 0, workingSeconds: 0 });
  const queued = queuedAt[card.workItemId] === undefined ? null : at(queuedAt[card.workItemId]);
  const finishedRuns = card.events.filter(event => event.kind === 'run_finished');
  const agent = card.events.filter(event => event.kind === 'run_started').reduce((total, event) => { const end = finishedRuns.find(other => other.detail.runId === event.detail.runId); return total + ((end ? Date.parse(end.at) : now) - Date.parse(event.at)); }, 0);
  const opened = card.events.filter(event => event.kind === 'pr_opened').map(event => Date.parse(event.at)).sort((a, b) => a - b)[0] ?? null;
  const latestMerged = card.plays.filter(play => play.mergedAt).at(-1);
  const deploys = (latestMerged?.deployments ?? []).filter(entry => entry.firstDeployedAt).map(entry => ({ environment: entry.environment, at: Date.parse(entry.firstDeployedAt!) })).sort((a, b) => a.at - b.at);
  const mergeAt = latestMerged?.mergedAt ? Date.parse(latestMerged.mergedAt) : null;
  const mergeTo = mergeAt === null ? null : Object.fromEntries(deploys.map(entry => [entry.environment, pair(mergeAt, entry.at).seconds]));
  const mergeToWorking = mergeAt === null ? null : Object.fromEntries(deploys.map(entry => [entry.environment, pair(mergeAt, entry.at).workingSeconds]));
  const production = deploys.find(entry => entry.environment === 'production');
  const restores = (card.condition?.cracks ?? []).filter(crack => crack.confirmedAt && crack.mended?.at && crack.mended.confirmedAt !== undefined).map(crack => { const confirmed = Date.parse(crack.confirmedAt!); const mended = Date.parse(crack.mended!.at!); return { crackId: crack.id, confirmedAt: crack.confirmedAt!, mendedAt: crack.mended!.at!, ...(mended <= confirmed ? { seconds: 0, workingSeconds: 0 } : pair(confirmed, mended)) }; });
  return {
    statuses: order.map(name => byStatus.get(name)!), statusesSince: iso(at(steps[0][3])), truncated: false,
    gates: sum('gate'), kinds: sum('kind'),
    leadTime, cycleTime, timeToStart,
    efficiency: flowing ? Math.round((active / flowing) * 1000) / 1000 : null,
    blockedSeconds: blocked.seconds, blockedWorkingSeconds: blocked.workingSeconds, reopens,
    queueSeconds: queued !== null && firstRun !== null ? pair(queued, firstRun).seconds : null, queueWorkingSeconds: queued !== null && firstRun !== null ? pair(queued, firstRun).workingSeconds : null,
    agentSeconds: Math.round(agent / 1000), runs: runs.length,
    firstRunToFirstPlaySeconds: firstRun !== null && opened !== null ? pair(firstRun, opened).seconds : null, firstRunToFirstPlayWorkingSeconds: firstRun !== null && opened !== null ? pair(firstRun, opened).workingSeconds : null,
    mergeTo, mergeToWorking, environmentsReached: deploys.map(entry => entry.environment),
    timeToProduction: production && mergeAt !== null ? { environment: 'production', ...pair(mergeAt, production.at) } : null,
    restores, meanRestoreSeconds: restores.length ? Math.round((restores.reduce((total, entry) => total + entry.seconds, 0) / restores.length) * 10) / 10 : null, meanRestoreWorkingSeconds: restores.length ? Math.round((restores.reduce((total, entry) => total + entry.workingSeconds, 0) / restores.length) * 10) / 10 : null,
    estimateSeconds: spec.estimate ?? null,
    calendar: { timezone: zone, days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '09:00', end: '17:00', holidays: 0 },
    notCollected: [...(spec.estimate === undefined ? ['estimate'] : []), 'holidays'],
  };
}

function timelineFor(play: PloegCardPlay, spec: PlayKpiSpec, anchor: number): PloegPlayTimeline {
  const at = (minutes: number | null | undefined) => minutes === null || minutes === undefined ? null : anchor - minutes * minute;
  const opened = at(spec.opened)!;
  const ready = at(spec.ready ?? spec.opened)!;
  const feedback = at(spec.feedback);
  const merged = play.mergedAt ? Date.parse(play.mergedAt) : null;
  const approval = at(spec.approval) ?? (play.reviews.find(review => review.state === 'approved')?.receivedAt ? Date.parse(play.reviews.find(review => review.state === 'approved')!.receivedAt!) : null);
  const seconds = (from: number | null, to: number | null) => from === null || to === null ? null : Math.max(0, Math.round((to - from) / 1000));
  const firstCommit = at(spec.firstCommit)!;
  return {
    openedAt: iso(opened), readyAt: iso(ready), firstFeedbackAt: feedback === null ? null : iso(feedback), firstApprovalAt: approval === null ? null : iso(approval), lastApprovalAt: approval === null ? null : iso(approval), mergedAt: merged === null ? null : iso(merged),
    toFirstFeedbackSeconds: seconds(ready, feedback), toFirstApprovalSeconds: seconds(ready, approval), approvalToMergeSeconds: seconds(approval, merged), openToMergeSeconds: seconds(opened, merged),
    reviewRounds: spec.rounds, comments: spec.comments, reviewers: spec.reviewers, responseSeconds: spec.response ?? null,
    commits: spec.commits, firstCommitAt: iso(firstCommit), forcePushes: spec.forcePushes, codingSeconds: seconds(firstCommit, ready),
    truncated: false, capturedAt: iso(merged ?? anchor - 5 * minute),
  };
}

function ciFor(play: PloegCardPlay, spec: CISpec, anchor: number): PloegPlayCITiming {
  return {
    runs: spec.runs, failedRuns: spec.failed ?? 0, reruns: spec.reruns ?? 0, lastGreenSeconds: spec.lastGreen ?? null, queueSeconds: spec.queue, timeToGreenSeconds: spec.toGreen ?? null,
    minutes: spec.minutes, slowest: spec.slowest.map(([name, seconds]) => ({ name, seconds })), firstPassGreen: spec.firstPass ?? null, source: 'actions', truncated: false,
    capturedAt: play.mergedAt ?? iso(anchor - 5 * minute),
  };
}

function shapeFor(play: PloegCardPlay, spec: ShapeSpec): PloegPlayShape {
  const counted = (play.additions ?? 0) + (play.deletions ?? 0);
  return {
    complexity: { method: 'indentation/2026.1', added: spec.added, removed: spec.removed, net: spec.added - spec.removed, maxDepth: spec.depth, hotspots: spec.hotspots.map(([path, added]) => ({ path, added })) },
    files: play.changedFiles ?? 0, countedLines: counted, testLines: spec.tests, testRatio: counted - spec.tests > 0 ? Math.round((spec.tests / (counted - spec.tests)) * 1000) / 1000 : null,
    docsTouched: spec.docs, languages: spec.languages.map(([name, lines]) => ({ name, lines })), truncated: false, capturedAt: play.mergedAt!,
  };
}

function pipelineFor(plays: PloegCardPlay[]): PloegCardPipeline | undefined {
  const timed = plays.filter(play => play.timeline || play.ciTiming);
  if (!timed.length) return undefined;
  const first = timed[0];
  const merged = timed.filter(play => play.timeline?.mergedAt).at(-1);
  const known = (values: (number | null | undefined)[]) => values.filter((value): value is number => typeof value === 'number');
  const ci = timed.filter(play => play.ciTiming).map(play => play.ciTiming!);
  return {
    plays: timed.length, toFirstFeedbackSeconds: first.timeline?.toFirstFeedbackSeconds ?? null, openToMergeSeconds: merged?.timeline?.openToMergeSeconds ?? null,
    reviewRounds: known(timed.map(play => play.timeline?.reviewRounds)).reduce((a, b) => a + b, 0), comments: known(timed.map(play => play.timeline?.comments)).reduce((a, b) => a + b, 0),
    firstPassGreen: first.ciTiming?.firstPassGreen ?? null,
    median: { toFirstFeedbackSeconds: median(known(timed.map(play => play.timeline?.toFirstFeedbackSeconds))), openToMergeSeconds: median(known(timed.map(play => play.timeline?.openToMergeSeconds))), responseSeconds: median(known(timed.map(play => play.timeline?.responseSeconds))), lastGreenSeconds: median(known(ci.map(entry => entry.lastGreenSeconds))) },
    ci: ci.length ? { runs: ci.reduce((a, b) => a + (b.runs ?? 0), 0), failedRuns: ci.reduce((a, b) => a + (b.failedRuns ?? 0), 0), reruns: ci.reduce((a, b) => a + (b.reruns ?? 0), 0), minutes: Math.round(ci.reduce((a, b) => a + (b.minutes ?? 0), 0) * 10) / 10, queueSeconds: ci.reduce((a, b) => a + (b.queueSeconds ?? 0), 0) } : null,
  };
}

function cardShapeFor(plays: PloegCardPlay[]): PloegCardShape | undefined {
  const merged = plays.filter(play => play.mergedAt);
  const shapes = merged.map(play => play.shape).filter((shape): shape is PloegPlayShape => Boolean(shape));
  if (!shapes.length) return undefined;
  const single = shapes.length === 1 ? shapes[0] : null;
  if (single) { const { capturedAt: _capturedAt, ...rest } = single; return { plays: 1, complete: merged.length === 1, ...rest }; }
  return undefined;
}

/**
 * Adds illustrative flow, pull request, CI and change-shape figures (Ploeg ADR-0057 and ADR-0058, proposed) to the
 * demo cards that `specs` names, derived from each card's own illustrative times: its plays, deploys, gates, cracks
 * and Runs. No model call or spend is invented; Runs and their times are the demo's own.
 */
export function addDemoKpis(cards: Record<string, PloegCard>, specs: Record<string, DemoKpiSpec>, context: Context): void {
  for (const [id, spec] of Object.entries(specs)) {
    const card = cards[id];
    if (!card) continue;
    card.flow = flowFor(card, spec, context);
    const play = spec.play ? card.plays.at(-1) : null;
    if (play && spec.play) {
      play.timeline = timelineFor(play, spec.play, context.anchor);
      play.ciTiming = ciFor(play, spec.play.ci, context.anchor);
      play.ci ??= { state: spec.play.ci.lastGreen ? 'success' : 'failure', checks: spec.play.ci.slowest.map(([name]) => ({ context: name, state: spec.play!.ci.lastGreen ? 'success' : 'failure' })), headSha: '', capturedAt: play.ciTiming.capturedAt };
      if (spec.play.shape && play.mergedAt) play.shape = shapeFor(play, spec.play.shape);
    }
    const pipeline = pipelineFor(card.plays);
    if (pipeline) card.pipeline = pipeline;
    const shape = cardShapeFor(card.plays);
    if (shape) card.shape = shape;
  }
}
