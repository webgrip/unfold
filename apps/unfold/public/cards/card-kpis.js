import { compactDuration, workingDuration, count, dateTime, decimal, percent, plural } from '../core/format.js';

/** The status kinds of a board (Ploeg ADR-0057, proposed), in the order the Flow tab stacks them, with what each means. */
export const flowKinds = Object.freeze([
  Object.freeze({ key: 'active', label: 'Active', meaning: 'Someone works on it: development, test, or a status that names work in progress.' }),
  Object.freeze({ key: 'waiting', label: 'Waiting', meaning: 'In a queue: to do, ready, to review, awaiting acceptance.' }),
  Object.freeze({ key: 'blocked', label: 'Blocked', meaning: 'Blocked, on hold or impeded.' }),
  Object.freeze({ key: 'done', label: 'Done', meaning: 'Done, closed, resolved or released.' }),
]);

/** How the card shows durations: calendar time, or only the time inside the team's working hours. */
export const clockChoices = Object.freeze([
  Object.freeze({ key: 'calendar', label: 'Calendar' }),
  Object.freeze({ key: 'working', label: 'Working hours' }),
]);

/** The browser storage key that remembers a viewer's clock choice. */
export const clockStorageKey = 'unfold.cards.clock';

/** What each KPI means, in plain words: the back's glossary and every figure's tooltip. */
export const kpiMeanings = Object.freeze({
  leadTime: 'From the ticket’s creation in the tracker (or the moment Ploeg first saw it) to its release. While it can still be delivered it runs to now.',
  cycleTime: 'From the start of work (the first active status or the first agent Run, whichever came first) to the release, else the merge, else now.',
  timeToStart: 'From the ticket’s creation to the start of work.',
  efficiency: 'The share of the cycle spent in active statuses, against active, waiting and blocked time together.',
  blocked: 'Time the ticket sat in a blocked, on-hold or impeded status.',
  reopens: 'Moves out of a done status back into work.',
  queue: 'From the moment the Work Item was queued or approved for Ploeg to its first agent Run.',
  agent: 'Every agent Run’s running time added up. Agents keep no office hours, so it has no working-hours figure.',
  firstPlay: 'From the first agent Run to the first pull request opening.',
  estimate: 'The tracker’s time estimate set against the cycle time in working hours. An estimate is a guess, not a promise.',
  firstFeedback: 'From ready for review to the first review or comment by a person who is neither the author nor Ploeg. It shows how fast the team responded, not how fast the author worked.',
  firstApproval: 'From ready for review to the first approval.',
  approvalToMerge: 'From the last approval to the merge.',
  openToMerge: 'From the forge opening the pull request to its merge.',
  reviewRounds: 'Distinct commits people reviewed: each new round of review counts once.',
  comments: 'Comments and inline review comments by people other than the author.',
  reviewers: 'Distinct people who submitted a review.',
  response: 'The median time from a request for changes to the next push.',
  lastGreen: 'Wall time of the latest successful CI run on the head, without the wait for a runner.',
  ciRuns: 'CI runs across every commit the pull request had.',
  failedRuns: 'CI runs that ended in failure or error.',
  reruns: 'Repeat runs on an unchanged commit, or a job’s second attempt: a hint that CI is flaky.',
  ciMinutes: 'Every CI job attempt’s duration added up.',
  ciQueue: 'Time CI jobs waited for a runner.',
  timeToGreen: 'From ready for review to the first moment every workflow on one commit was green.',
  firstPassGreen: 'Whether the first CI run on the commit that was ready for review passed without a rerun.',
  slowest: 'The jobs whose longest attempt took longest.',
  complexity: 'Indentation complexity: every added or removed line counts its nesting depth. A language-agnostic stand-in for how intricate the change is; it judges nothing.',
  maxDepth: 'The deepest nesting level of an added line.',
  hotspots: 'The files that gained the most indentation complexity.',
  testRatio: 'Lines in test files against the other changed lines.',
  docs: 'Documentation files the change touched.',
  languages: 'The languages the change touched, by file extension, most lines first.',
  commits: 'Commits on the pull request.',
  coding: 'From the first commit’s author date to ready for review.',
  forcePushes: 'Pushes that rewrote the branch’s history.',
  mergeTo: 'From the merge to the first deploy to each environment.',
  timeToProduction: 'From the merge to the first deploy to production.',
  restore: 'From a crack’s confirmation to its mend.',
});

/** The note under every KPI section: what these figures are, and what they are not. */
export const kpiFactsNote = 'Facts about the card, not about people: none of these figures feeds the grade or rarity, and nothing totals them per person. Team pages show team medians only.';
/** The one-line explanation of indentation complexity on the Change tab. */
export const complexityNote = 'Complexity counts how deeply each added or removed line is indented, a proxy for nesting that works in any language. It rewards and punishes nothing, and deeply nested data files score high.';

const known = value => typeof value === 'number' && Number.isFinite(value);
const list = value => Array.isArray(value) ? value : [];
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const text = value => typeof value === 'string' ? value.trim() : '';
const row = (label, value, status = 'ok', extra = {}) => ({ label, value, status, ...extra });
const notReported = 'Not reported';
const dayNames = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const dayOrder = Object.keys(dayNames);
const ciSources = { actions: 'Forgejo Actions', statuses: 'Commit statuses', pipelines: 'GitLab pipelines' };
const signedCount = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${count(Math.abs(value))}`;
const capital = value => value ? value[0].toUpperCase() + value.slice(1) : value;

/**
 * A duration as the card shows it: calendar seconds, working seconds when Ploeg counted them, and both formatted
 * compactly ("2 d 4 h" calendar, "20 h" working: working time is never written in days). Null for an unknown duration.
 * @param {number | null | undefined} seconds
 * @param {number | null | undefined} [working]
 */
export function timePair(seconds, working = null) {
  if (!known(seconds)) return null;
  const hasWorking = known(working);
  return { seconds, working: hasWorking ? working : null, text: compactDuration(seconds), workingText: hasWorking ? workingDuration(working) : '' };
}

/**
 * The team calendar a card's working time was counted in, as one line: "Working hours: Mon–Fri 09:00–17:00
 * Europe/Amsterdam". Consecutive days read as a range; holidays are counted when there are any. Empty without a calendar.
 * @param {{ timezone?: string, days?: string[], start?: string, end?: string, holidays?: number } | null | undefined} calendar
 */
export function calendarLine(calendar) {
  const data = object(calendar);
  const days = dayOrder.filter(day => list(data?.days).includes(day));
  if (!data || !days.length || !text(data.start) || !text(data.end) || !text(data.timezone)) return '';
  const indexes = days.map(day => dayOrder.indexOf(day));
  const run = indexes.every((index, position) => position === 0 || index === indexes[position - 1] + 1);
  const named = days.length > 2 && run ? `${dayNames[days[0]]}–${dayNames[days.at(-1)]}` : days.map(day => dayNames[day]).join(', ');
  const holidays = known(data.holidays) && data.holidays > 0 ? `, ${plural(data.holidays, 'holiday')} off` : '';
  return `Working hours: ${named} ${data.start}–${data.end} ${data.timezone}${holidays}`;
}

function timeRow(label, pair, meaning, empty = notReported) {
  if (!pair) return row(label, empty, 'unreported', { meaning });
  return row(label, pair.text, 'ok', { meaning, ...(pair.workingText ? { working: pair.workingText } : {}) });
}

function countRow(label, value, meaning, extra = {}) {
  return known(value) ? row(label, count(value), 'ok', { meaning, ...extra }) : row(label, notReported, 'unreported', { meaning });
}

const shortLabels = Object.freeze({ leadTime: 'Lead', cycleTime: 'Cycle', timeToStart: 'To start', firstFeedback: 'Feedback', lastGreen: 'CI', complexity: 'Complexity', timeToProduction: 'To prod', blocked: 'Blocked', estimate: 'Estimate', openToMerge: 'To merge' });

function stat(key, label, pair, { detail = '', tone = 'neutral', live = false, value } = {}) {
  return { key, label, short: shortLabels[key] ?? label, value: value ?? pair?.text ?? '', working: pair?.workingText ?? '', detail, meaning: kpiMeanings[key] ?? '', tone, live };
}

const flowStart = { tracker_created: 'the tracker’s creation', first_seen: 'Ploeg’s first sight', first_active: 'the first active status', first_run: 'the first agent Run' };
const flowEnd = { first_active: 'the first active status', first_run: 'the first agent Run', merge: 'the merge', release: 'the release', now: 'now' };
const spanEnds = span => span && flowStart[span.start] && flowEnd[span.end] ? `From ${flowStart[span.start]} to ${flowEnd[span.end]}` : '';

function spanStat(key, label, span, { runningWord = 'so far', detail = '' } = {}) {
  if (!span) return null;
  const entry = stat(key, label, timePair(span.seconds, span.workingSeconds), { detail: [span.running ? runningWord : '', detail].filter(Boolean).join(' · '), live: span.running === true });
  const ends = spanEnds(span);
  return ends ? { ...entry, meaning: `${entry.meaning} This card: ${ends[0].toLowerCase()}${ends.slice(1)}.` } : entry;
}

function plays(card) {
  return list(card.plays).filter(play => play && known(play.number)).slice().sort((a, b) => a.number - b.number);
}

function flowModel(card) {
  const flow = object(card.flow);
  if (!flow) return null;
  const statuses = list(flow.statuses).filter(entry => entry && text(entry.status) && flowKinds.some(kind => kind.key === entry.kind) && known(entry.seconds));
  const drawn = entry => !(entry.current === true && entry.kind === 'done');
  const total = statuses.filter(drawn).reduce((sum, entry) => sum + entry.seconds, 0);
  const workingTotal = statuses.filter(drawn).reduce((sum, entry) => sum + (known(entry.workingSeconds) ? entry.workingSeconds : 0), 0);
  const segments = statuses.map(entry => ({
    status: entry.status, kind: entry.kind, kindLabel: flowKinds.find(kind => kind.key === entry.kind).label, gate: entry.gate ?? null,
    visits: known(entry.visits) ? entry.visits : 1, current: entry.current === true, observed: entry.observed === true, drawn: drawn(entry),
    time: timePair(entry.seconds, entry.workingSeconds),
    share: total && drawn(entry) ? entry.seconds / total : 0, workingShare: workingTotal && drawn(entry) ? (entry.workingSeconds ?? 0) / workingTotal : 0,
  }));
  return { raw: flow, segments, total, workingTotal, calendar: calendarLine(flow.calendar) };
}

function firstPlayWith(all, key) {
  return all.find(play => object(play[key])) ?? null;
}

function latestPlayWith(all, key) {
  return all.filter(play => object(play[key])).at(-1) ?? null;
}

function feedbackStat(card, all, now) {
  const pipeline = object(card.pipeline);
  const timed = firstPlayWith(all, 'timeline');
  const seconds = known(pipeline?.toFirstFeedbackSeconds) ? pipeline.toFirstFeedbackSeconds : known(timed?.timeline?.toFirstFeedbackSeconds) ? timed.timeline.toFirstFeedbackSeconds : null;
  if (seconds !== null) return stat('firstFeedback', 'First feedback', timePair(seconds));
  const open = all.filter(play => play.state !== 'merged' && play.state !== 'closed' && object(play.timeline)).at(-1);
  const ready = Date.parse(open?.timeline?.readyAt ?? '');
  if (open && !open.timeline.firstFeedbackAt && Number.isFinite(ready) && known(now)) {
    const waiting = timePair(Math.max(0, (now - ready) / 1000));
    return stat('firstFeedback', 'First feedback', waiting, { value: `waiting ${waiting.text}`, detail: `since ready on #${open.number}`, live: true });
  }
  return null;
}

function ciStat(card, all) {
  const latest = latestPlayWith(all, 'ciTiming');
  const ci = latest?.ciTiming;
  if (!ci || !known(ci.runs) || ci.runs === 0) return null;
  const totals = object(card.pipeline)?.ci;
  const reruns = known(totals?.reruns) ? totals.reruns : known(ci.reruns) ? ci.reruns : 0;
  const failed = known(ci.failedRuns) ? ci.failedRuns : 0;
  const detail = reruns > 0 ? plural(reruns, 'rerun') : ci.firstPassGreen === true ? 'green first time' : failed > 0 ? `${count(failed)} failed` : plural(ci.runs, 'run');
  const tone = reruns > 0 ? 'attention' : ci.firstPassGreen === true ? 'success' : 'neutral';
  if (known(ci.lastGreenSeconds)) return stat('lastGreen', 'CI', timePair(ci.lastGreenSeconds), { detail, tone });
  return stat('lastGreen', 'CI', null, { value: 'Not green yet', detail: failed > 0 ? `${count(failed)} of ${plural(ci.runs, 'run')} failed` : plural(ci.runs, 'run'), tone });
}

function complexityOf(card, all) {
  const shape = object(card.shape);
  if (object(shape?.complexity)) return shape.complexity;
  return latestPlayWith(all.filter(play => object(play.shape)?.complexity), 'shape')?.shape?.complexity ?? null;
}

function complexityStat(card, all) {
  const complexity = complexityOf(card, all);
  if (!complexity || !known(complexity.added)) return null;
  return stat('complexity', 'Complexity', null, { value: `+${count(complexity.added)}`, detail: [known(complexity.net) ? `net ${signedCount(complexity.net)}` : '', known(complexity.maxDepth) ? `depth ${count(complexity.maxDepth)}` : ''].filter(Boolean).join(' · ') });
}

function productionStat(flow) {
  const entry = object(flow?.raw?.timeToProduction);
  if (!entry || !known(entry.seconds)) return null;
  return stat('timeToProduction', 'To production', timePair(entry.seconds, entry.workingSeconds), { detail: entry.environment && entry.environment !== 'production' ? `merge → ${entry.environment}` : 'merge → live' });
}

function blockedStat(flow) {
  const raw = flow?.raw;
  if (!raw || !known(raw.blockedSeconds) || raw.blockedSeconds <= 0) return null;
  return stat('blocked', 'Blocked', timePair(raw.blockedSeconds, raw.blockedWorkingSeconds), { tone: 'attention' });
}

function estimateStat(flow) {
  const raw = flow?.raw;
  if (!raw || !known(raw.estimateSeconds)) return null;
  const actual = raw.cycleTime && known(raw.cycleTime.workingSeconds) ? raw.cycleTime.workingSeconds : null;
  return stat('estimate', 'Estimate', null, { value: workingDuration(raw.estimateSeconds), detail: actual !== null ? `actual ${workingDuration(actual)}${raw.cycleTime.running ? ' so far' : ''}` : '' });
}

function openToMergeStat(card) {
  const seconds = object(card.pipeline)?.openToMergeSeconds;
  return known(seconds) ? stat('openToMerge', 'Open → merge', timePair(seconds)) : null;
}

/**
 * The three or four figures a card's front leads with for its state (Unfold ADR 0035, proposed), each known and
 * formatted, with its meaning. In review: time to first feedback ("waiting 3 h" while nobody has responded), CI's
 * last green run and its reruns, complexity added, then cycle time so far. Merged: lead time, first feedback, CI,
 * then time to production once a deploy reached it, else complexity. Drafting: time to start or cycle time so far,
 * lead time so far, blocked time and the estimate. Empty when Ploeg sends no KPI figures.
 * @param {object} card A card from the proxy.
 * @param {{ now?: number }} [options]
 */
export function headlineKpis(card, { now = Date.now() } = {}) {
  const data = object(card) ?? {};
  const all = plays(data);
  const flow = flowModel(data);
  const raw = flow?.raw;
  const state = text(data.state) || 'drafting';
  const lead = spanStat('leadTime', 'Lead time', raw?.leadTime);
  const cycle = spanStat('cycleTime', 'Cycle time', raw?.cycleTime);
  const start = raw?.timeToStart?.running ? spanStat('timeToStart', 'Time to start', raw.timeToStart, { runningWord: 'waiting to start' }) : null;
  const feedback = feedbackStat(data, all, now);
  const ci = ciStat(data, all);
  const complexity = complexityStat(data, all);
  const order = {
    drafting: [start ?? cycle, lead, blockedStat(flow), estimateStat(flow)],
    in_review: [feedback, ci, complexity, cycle, blockedStat(flow)],
    merged: [lead ?? cycle, feedback, ci, productionStat(flow) ?? complexity, complexity, openToMergeStat(data)],
  }[state] ?? [cycle, feedback, ci, complexity, lead];
  const seen = new Set();
  return order.filter(entry => entry && !seen.has(entry.key) && seen.add(entry.key)).slice(0, 4);
}

function steps(play, now) {
  const timeline = object(play.timeline);
  if (!timeline) return [];
  const marks = [
    ['opened', 'Opened', timeline.openedAt],
    ['ready', 'Ready for review', timeline.readyAt && timeline.readyAt !== timeline.openedAt ? timeline.readyAt : null],
    ['feedback', 'First feedback', timeline.firstFeedbackAt],
    ['approval', 'First approval', timeline.firstApprovalAt],
    ['last-approval', 'Last approval', timeline.lastApprovalAt && timeline.lastApprovalAt !== timeline.firstApprovalAt ? timeline.lastApprovalAt : null],
    ['merged', 'Merged', timeline.mergedAt],
  ];
  const out = [];
  let previous = null;
  for (const [key, label, at] of marks) {
    const ms = Date.parse(at ?? '');
    if (!Number.isFinite(ms)) continue;
    out.push({ key, label, at: dateTime(at), gap: previous === null ? '' : `+${compactDuration(Math.max(0, (ms - previous) / 1000))}`, state: 'done' });
    previous = ms;
  }
  const open = play.state !== 'merged' && play.state !== 'closed';
  if (open && !timeline.firstFeedbackAt && timeline.readyAt && known(now)) {
    const since = Date.parse(timeline.readyAt);
    if (Number.isFinite(since)) out.push({ key: 'feedback', label: 'Waiting for first feedback', at: '', gap: `${compactDuration(Math.max(0, (now - since) / 1000))} so far`, state: 'waiting' });
  } else if (open && timeline.firstFeedbackAt && !timeline.mergedAt) out.push({ key: 'merged', label: 'Merge', at: '', gap: 'not yet', state: 'ahead' });
  if (!timeline.readyAt && open && timeline.openedAt) out.push({ key: 'ready', label: 'Still a draft', at: '', gap: '', state: 'ahead' });
  return out;
}

function playTitle(play) {
  const word = play.state === 'merged' ? 'Merged' : play.state === 'closed' ? 'Closed unmerged' : 'Open';
  return `#${play.number} · ${word}`;
}

function reviewRows(timeline) {
  return [
    timeRow('Time to first feedback', timePair(timeline.toFirstFeedbackSeconds), kpiMeanings.firstFeedback, timeline.readyAt ? 'No feedback yet' : notReported),
    timeRow('To first approval', timePair(timeline.toFirstApprovalSeconds), kpiMeanings.firstApproval, 'No approval yet'),
    timeRow('Last approval → merge', timePair(timeline.approvalToMergeSeconds), kpiMeanings.approvalToMerge, timeline.mergedAt ? notReported : 'Not merged'),
    timeRow('Open → merge', timePair(timeline.openToMergeSeconds), kpiMeanings.openToMerge, timeline.mergedAt ? notReported : 'Not merged'),
    countRow('Review rounds', timeline.reviewRounds, kpiMeanings.reviewRounds),
    countRow('Comments', timeline.comments, kpiMeanings.comments),
    countRow('Reviewers', timeline.reviewers, kpiMeanings.reviewers),
    timeRow('Response to change requests', timePair(timeline.responseSeconds), kpiMeanings.response, 'No change requested'),
    row('Forge activity read', timeline.capturedAt ? dateTime(timeline.capturedAt) : 'Not yet: webhook reviews only', timeline.capturedAt ? 'ok' : 'unreported'),
    ...(timeline.truncated ? [row('Activity', 'A lower bound: the forge listed more than Ploeg reads', 'unreported')] : []),
  ];
}

function firstPassText(value) {
  return value === true ? 'Yes' : value === false ? 'No' : 'Not known yet';
}

function ciRows(ci) {
  return [
    countRow('CI runs', ci.runs, kpiMeanings.ciRuns),
    countRow('Failed runs', ci.failedRuns, kpiMeanings.failedRuns),
    countRow('Reruns', ci.reruns, kpiMeanings.reruns, ci.reruns > 0 ? { tone: 'attention' } : {}),
    timeRow('Last green run', timePair(ci.lastGreenSeconds), kpiMeanings.lastGreen, ci.runs ? 'Not green yet' : 'No CI runs'),
    timeRow('Time to green', timePair(ci.timeToGreenSeconds), kpiMeanings.timeToGreen, ci.runs ? 'Not green yet' : 'No CI runs'),
    timeRow('Waiting for a runner', timePair(ci.queueSeconds), kpiMeanings.ciQueue),
    known(ci.minutes) ? row('CI minutes', `${decimal(ci.minutes, 1)} min`, 'ok', { meaning: kpiMeanings.ciMinutes }) : row('CI minutes', notReported, 'unreported', { meaning: kpiMeanings.ciMinutes }),
    row('First-pass green', firstPassText(ci.firstPassGreen), ci.firstPassGreen === null ? 'unreported' : 'ok', { meaning: kpiMeanings.firstPassGreen, ...(ci.firstPassGreen === true ? { tone: 'success' } : {}) }),
    row('Read from', ciSources[ci.source] ?? (ci.source || notReported), ci.source ? 'ok' : 'unreported'),
    ...(ci.truncated ? [row('CI history', 'A lower bound: more runs than Ploeg reads', 'unreported')] : []),
  ];
}

function slowestList(play) {
  const jobs = list(play.ciTiming?.slowest).filter(job => text(job?.name) && known(job.seconds));
  return jobs.length ? { title: `Slowest jobs on #${play.number}`, items: jobs.map(job => ({ title: job.name, meta: compactDuration(job.seconds), tone: 'neutral', glyph: 'clock' })) } : null;
}

/**
 * The KPI half of the Review & CI tab (Unfold ADR 0035, proposed): the card's pipeline totals and medians when there
 * are several plays, and for each play with figures its timeline as steps, its review rows and its CI rows. Null
 * without any timeline, CI timing or pipeline.
 * @param {object} card
 * @param {{ now?: number }} [options]
 */
export function reviewKpis(card, { now = Date.now() } = {}) {
  const data = object(card) ?? {};
  const all = plays(data).filter(play => object(play.timeline) || object(play.ciTiming));
  const pipeline = object(data.pipeline);
  if (!all.length && !pipeline) return null;
  const blocks = [];
  const groups = [];
  const lists = [];
  if (pipeline) {
    const ci = object(pipeline.ci);
    const tiles = [
      stat('firstFeedback', 'First feedback', timePair(pipeline.toFirstFeedbackSeconds), { value: known(pipeline.toFirstFeedbackSeconds) ? undefined : 'None yet' }),
      stat('openToMerge', 'Open → merge', timePair(pipeline.openToMergeSeconds), { value: known(pipeline.openToMergeSeconds) ? undefined : 'Not merged' }),
      stat('reviewRounds', 'Review rounds', null, { value: known(pipeline.reviewRounds) ? count(pipeline.reviewRounds) : notReported, detail: known(pipeline.comments) ? plural(pipeline.comments, 'comment') : '' }),
      ...(ci ? [
        stat('ciMinutes', 'CI minutes', null, { value: known(ci.minutes) ? `${decimal(ci.minutes, 1)} min` : notReported, detail: [known(ci.runs) ? plural(ci.runs, 'run') : '', known(ci.failedRuns) && ci.failedRuns ? `${count(ci.failedRuns)} failed` : ''].filter(Boolean).join(' · ') }),
        stat('reruns', 'Reruns', null, { value: known(ci.reruns) ? count(ci.reruns) : notReported, tone: ci.reruns > 0 ? 'attention' : 'neutral', detail: ci.reruns > 0 ? 'flaky CI hint' : '' }),
        stat('firstPassGreen', 'First-pass green', null, { value: firstPassText(pipeline.firstPassGreen), tone: pipeline.firstPassGreen === true ? 'success' : 'neutral' }),
      ] : []),
    ];
    blocks.push({ type: 'stats', label: 'Review and CI across the card', items: tiles });
    if (known(pipeline.plays) && pipeline.plays > 1) {
      const median = object(pipeline.median) ?? {};
      groups.push({ title: `Medians over ${plural(pipeline.plays, 'play')}`, rows: [
        timeRow('First feedback', timePair(median.toFirstFeedbackSeconds), kpiMeanings.firstFeedback),
        timeRow('Open → merge', timePair(median.openToMergeSeconds), kpiMeanings.openToMerge),
        timeRow('Response to change requests', timePair(median.responseSeconds), kpiMeanings.response),
        timeRow('Last green run', timePair(median.lastGreenSeconds), kpiMeanings.lastGreen),
        ...(ci ? [timeRow('Waiting for a runner, all plays', timePair(ci.queueSeconds), kpiMeanings.ciQueue)] : []),
      ] });
    }
  }
  for (const play of all.slice().reverse()) {
    const title = playTitle(play);
    if (object(play.timeline)) groups.push({ title: `${title} · review`, blocks: [{ type: 'steps', label: `Pull request #${play.number} from opened to merged`, items: steps(play, now) }], rows: reviewRows(play.timeline) });
    if (object(play.ciTiming)) groups.push({ title: `${title} · CI`, rows: ciRows(play.ciTiming) });
    const slow = slowestList(play);
    if (slow) lists.push(slow);
  }
  return { blocks, groups, lists };
}

function languagesText(languages) {
  const entries = list(languages).filter(entry => text(entry?.name) && known(entry.lines));
  return entries.length ? entries.map(entry => `${entry.name} ${count(entry.lines)}`).join(' · ') : '';
}

/**
 * The KPI half of the Change tab (Unfold ADR 0035, proposed): indentation complexity added, removed and net, the
 * deepest nesting, hotspots, test ratio, documentation, languages, commits, coding time and force pushes. Null
 * without a change shape or timeline.
 * @param {object} card
 */
export function changeKpis(card) {
  const data = object(card) ?? {};
  const all = plays(data);
  const shape = object(data.shape) ?? latestPlayWith(all, 'shape')?.shape ?? null;
  const timelines = all.map(play => object(play.timeline)).filter(Boolean);
  if (!shape && !timelines.length) return null;
  const complexity = object(shape?.complexity);
  const blocks = [];
  const rows = [];
  if (shape) {
    blocks.push({ type: 'stats', label: 'Change shape', items: [
      stat('complexity', 'Complexity added', null, { value: complexity ? `+${count(complexity.added)}` : notReported, detail: complexity ? `−${count(complexity.removed)} removed · net ${signedCount(complexity.net)}` : 'diff not read' }),
      stat('maxDepth', 'Deepest nesting', null, { value: complexity ? count(complexity.maxDepth) : notReported, detail: complexity ? 'levels' : '' }),
      stat('testRatio', 'Test ratio', null, { value: known(shape.testRatio) ? percent(shape.testRatio) : notReported, detail: known(shape.testLines) ? `${count(shape.testLines)} test lines` : '' }),
      stat('docs', 'Docs touched', null, { value: known(shape.docsTouched) ? count(shape.docsTouched) : notReported, detail: known(shape.docsTouched) ? (shape.docsTouched === 1 ? 'file' : 'files') : '' }),
    ] });
    rows.push(
      row('Languages', languagesText(shape.languages) || notReported, languagesText(shape.languages) ? 'ok' : 'unreported', { meaning: kpiMeanings.languages }),
      countRow('Counted lines', shape.countedLines, 'Lines added and removed, without lockfiles, generated and vendored code.'),
      ...(complexity ? [row('Complexity method', complexity.method, 'ok', { meaning: kpiMeanings.complexity })] : []),
      ...(shape.truncated ? [row('Shape', 'A lower bound: the diff or file list reached Ploeg’s limit', 'unreported')] : []),
      ...(object(data.shape) && data.shape.complete === false ? [row('Measured plays', `${known(data.shape.plays) ? count(data.shape.plays) : 'Some'} of the merged plays`, 'unreported')] : []),
    );
  }
  if (timelines.length) {
    const commits = timelines.filter(entry => known(entry.commits));
    const pushes = timelines.filter(entry => known(entry.forcePushes));
    const coding = timelines.find(entry => known(entry.codingSeconds));
    rows.push(
      commits.length ? row('Commits', count(commits.reduce((sum, entry) => sum + entry.commits, 0)), 'ok', { meaning: kpiMeanings.commits }) : row('Commits', notReported, 'unreported', { meaning: kpiMeanings.commits }),
      timeRow('Coding time', coding ? timePair(coding.codingSeconds) : null, kpiMeanings.coding),
      pushes.length ? row('Force pushes', count(pushes.reduce((sum, entry) => sum + entry.forcePushes, 0)), 'ok', { meaning: kpiMeanings.forcePushes }) : row('Force pushes', 'Not reported by this forge', 'unreported', { meaning: kpiMeanings.forcePushes }),
    );
  }
  const spots = list(complexity?.hotspots).filter(entry => text(entry?.path) && known(entry.added));
  const lists = spots.length ? [{ title: 'Complexity hotspots', items: spots.map(entry => ({ title: entry.path, meta: `+${count(entry.added)} complexity`, tone: 'neutral', glyph: 'code' })) }] : [];
  return { blocks, rows, lists, note: complexity ? complexityNote : '' };
}

/**
 * The KPI half of the Life tab (Unfold ADR 0035, proposed): merge to each environment in deploy order, time to
 * production, and every mended crack's restore time with their mean. Null without flow figures.
 * @param {object} card
 */
export function lifeKpis(card) {
  const flow = object(object(card)?.flow);
  if (!flow) return null;
  const mergeTo = object(flow.mergeTo) ?? {};
  const working = object(flow.mergeToWorking) ?? {};
  const reached = list(flow.environmentsReached).filter(name => known(mergeTo[name]));
  const rows = reached.map(name => timeRow(`Merge → ${name}`, timePair(mergeTo[name], working[name]), kpiMeanings.mergeTo));
  const production = object(flow.timeToProduction);
  rows.push(production && known(production.seconds) ? timeRow(`Time to ${production.environment || 'production'}`, timePair(production.seconds, production.workingSeconds), kpiMeanings.timeToProduction) : row('Time to production', 'No deploy reached it yet', 'unreported', { meaning: kpiMeanings.timeToProduction }));
  const restores = list(flow.restores).filter(entry => entry && known(entry.seconds));
  if (restores.length) rows.push(timeRow('Mean restore time', timePair(flow.meanRestoreSeconds, flow.meanRestoreWorkingSeconds), kpiMeanings.restore));
  const lists = restores.length ? [{ title: `Restores · ${plural(restores.length, 'crack')}`, items: restores.map(entry => ({ title: `${compactDuration(entry.seconds)}${known(entry.workingSeconds) ? ` · ${workingDuration(entry.workingSeconds)} working` : ''}`, meta: `confirmed ${dateTime(entry.confirmedAt)} · mended ${dateTime(entry.mendedAt)}`, tone: 'success', glyph: 'check-circle' })) }] : [];
  return { rows, lists };
}

const notCollectedFlow = Object.freeze({ statuses: 'Time per status: the board records no status moves', estimate: 'Estimate: the tracker keeps none', holidays: 'Holidays: the team calendar lists none' });

function flowLead(flow) {
  const raw = flow.raw;
  const parts = [];
  if (raw.leadTime) parts.push(`${raw.leadTime.running ? 'Open for' : 'Delivered in'} ${compactDuration(raw.leadTime.seconds)}${raw.leadTime.running ? ' so far' : ' from ticket to release'}`);
  else if (raw.cycleTime) parts.push(`${raw.cycleTime.running ? 'In progress for' : 'Worked on for'} ${compactDuration(raw.cycleTime.seconds)}`);
  if (known(raw.efficiency)) parts.push(`${percent(raw.efficiency)} of the cycle was active work`);
  const current = flow.segments.find(entry => entry.current);
  if (current && raw.leadTime?.running !== false) parts.push(`now in ${current.status}`);
  return parts.length ? `${capital(parts.join('; '))}.` : '';
}

/**
 * The Flow tab (Unfold ADR 0035, proposed): a stacked bar of time per tracker status coloured by kind with a table of
 * the same facts, tiles for lead, cycle and start time, flow efficiency, blocked time, reopens, the queue before the
 * first Run, agent time and estimate against actual, the calendar ↔ working-hours toggle, the team calendar and what
 * Ploeg does not collect. A card without flow figures says why.
 * @param {object} card
 */
export function flowTab(card) {
  const data = object(card) ?? {};
  const flow = flowModel(data);
  if (!flow) return { rows: [row('Flow', Object.hasOwn(data, 'flow') ? 'Not reported for this Work Item' : 'This Ploeg does not send flow figures', 'unreported')], lists: [], groups: [], blocks: [], note: 'Flow is how long the ticket spent in every tracker status, and how long it took from ticket to release. Ploeg records it from the board’s status moves (Ploeg ADR-0057, proposed).' };
  const raw = flow.raw;
  const tiles = [
    spanStat('leadTime', 'Lead time', raw.leadTime) ?? stat('leadTime', 'Lead time', null, { value: notReported }),
    spanStat('cycleTime', 'Cycle time', raw.cycleTime) ?? stat('cycleTime', 'Cycle time', null, { value: notReported }),
    spanStat('timeToStart', 'Time to start', raw.timeToStart, { runningWord: 'not started yet' }) ?? stat('timeToStart', 'Time to start', null, { value: notReported }),
    stat('efficiency', 'Flow efficiency', null, { value: known(raw.efficiency) ? percent(raw.efficiency) : notReported, detail: known(raw.efficiency) ? 'active share of the cycle' : '' }),
    stat('blocked', 'Blocked', timePair(raw.blockedSeconds, raw.blockedWorkingSeconds), { value: known(raw.blockedSeconds) ? (raw.blockedSeconds === 0 ? 'None' : undefined) : notReported, tone: raw.blockedSeconds > 0 ? 'attention' : 'neutral' }),
    stat('reopens', 'Reopens', null, { value: known(raw.reopens) ? count(raw.reopens) : notReported, tone: raw.reopens > 0 ? 'attention' : 'neutral' }),
    stat('queue', 'Queue to first Run', timePair(raw.queueSeconds, raw.queueWorkingSeconds), { value: known(raw.queueSeconds) ? undefined : notReported }),
    raw.runs === 0 ? stat('agent', 'Agent time', null, { value: 'No Runs', detail: 'none on record' }) : stat('agent', 'Agent time', timePair(raw.agentSeconds), { value: known(raw.agentSeconds) ? undefined : notReported, detail: known(raw.runs) ? plural(raw.runs, 'Run') : '' }),
    ...(known(raw.estimateSeconds) ? [estimateStat(flow)] : []),
  ];
  const blocks = [{ type: 'clock', calendar: flow.calendar }, { type: 'stats', label: 'Flow figures', items: tiles }];
  if (flow.segments.length) {
    const resting = flow.segments.find(entry => !entry.drawn);
    const kinds = flowKinds.filter(kind => flow.segments.some(entry => entry.drawn && entry.kind === kind.key)).map(kind => { const own = flow.segments.filter(entry => entry.drawn && entry.kind === kind.key); return { ...kind, time: timePair(own.reduce((sum, entry) => sum + entry.time.seconds, 0), own.reduce((sum, entry) => sum + (entry.time.working ?? 0), 0)) }; });
    blocks.push({ type: 'bar', label: 'Time per status', segments: flow.segments.filter(entry => entry.drawn), total: timePair(flow.total, flow.workingTotal), kinds, note: resting ? `${resting.status} since it closed is in the table, not drawn: it runs on for as long as the card lives.` : '' });
    blocks.push({ type: 'table', caption: 'Time per status', columns: [{ key: 'status', label: 'Status' }, { key: 'kind', label: 'Kind' }, { key: 'visits', label: 'Visits', numeric: true }, { key: 'calendar', label: 'Calendar', numeric: true }, { key: 'working', label: 'Working', numeric: true }], rows: flow.segments.map(entry => ({ current: entry.current, kind: entry.kind, cells: { status: `${entry.status}${entry.observed ? ' *' : ''}`, kind: entry.kindLabel, visits: count(entry.visits), calendar: entry.time?.text ?? '', working: entry.time?.workingText ?? '' } })) });
  }
  const groups = [];
  const notes = [
    ...(raw.statusesSince ? [row('Recorded since', dateTime(raw.statusesSince), 'ok', { meaning: 'Time before Ploeg first read the ticket is not counted.' })] : []),
    ...(raw.truncated ? [row('Statuses', 'More than Ploeg lists: totals still count them', 'unreported')] : []),
    ...(flow.segments.some(entry => entry.observed) ? [row('* Timed by Ploeg', 'The tracker gave no usable time for these moves', 'unreported')] : []),
    timeRow('First Run → first pull request', timePair(raw.firstRunToFirstPlaySeconds, raw.firstRunToFirstPlayWorkingSeconds), kpiMeanings.firstPlay),
  ];
  groups.push({ title: 'Record', rows: notes });
  const missing = list(raw.notCollected).filter(key => Object.hasOwn(notCollectedFlow, key));
  if (missing.length) groups.push({ title: 'Not collected', rows: missing.map(key => row(notCollectedFlow[key].split(':')[0], notCollectedFlow[key].split(': ')[1], 'uncollected')) });
  const glossary = tiles.filter(entry => entry.meaning).map(entry => ({ term: entry.label, meaning: entry.meaning }));
  blocks.push({ type: 'glossary', label: 'What these figures mean', items: [...glossary, ...flowKinds.map(kind => ({ term: kind.label, meaning: kind.meaning }))] });
  return { lead: flowLead(flow), rows: [], blocks, groups, lists: [], note: `Kinds come from the board’s status names, or its own list. Working time counts only the team’s working hours. ${kpiFactsNote}` };
}

/**
 * Every KPI view of a card (Unfold ADR 0035, proposed): the front's headline figures and the tab sections. Each part is
 * null or empty when Ploeg sends no figures for it, so an older Ploeg's card looks as it did.
 * @param {object} card A card from the proxy.
 * @param {{ now?: number }} [options]
 */
export function kpiView(card, { now = Date.now() } = {}) {
  const data = object(card) ?? {};
  const flow = flowModel(data);
  return {
    headline: headlineKpis(data, { now }),
    calendar: flow?.calendar ?? '',
    hasWorking: Boolean(flow),
    flow: flowTab(data),
    review: reviewKpis(data, { now }),
    change: changeKpis(data),
    life: lifeKpis(data),
  };
}

