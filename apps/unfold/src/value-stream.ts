import type { FactsCIRun, FactsGate, FactsPullRequest, WorkItemFacts } from './cards/facts.ts';

/** The tone a value-stream bar or mark is drawn in; the browser's `[data-tone]` palette. */
export type StreamTone = 'neutral' | 'live' | 'attention' | 'review' | 'success' | 'danger';
/** The part of the value stream a lane belongs to, in the order the chart draws them. */
export type StreamGroup = 'ticket' | 'status' | 'pullRequest' | 'ci' | 'environment';
/** One span on a lane. `end` is null while it still runs; `waiting` marks time spent waiting rather than working. */
export type StreamBar = { start: string; end: string | null; label: string; detail: string; tone: StreamTone; waiting: boolean };
/** One moment on a lane. */
export type StreamMark = { at: string; label: string; tone: StreamTone };
/** One row of the chart. */
export type StreamLane = { key: string; group: StreamGroup; label: string; sublabel: string; url: string | null; bars: StreamBar[]; marks: StreamMark[] };
/** A Work Item's value stream from tracker creation to its first deploy per environment, projected from Ploeg's delivery facts (ADR-0079). Shifts and Runs are not repeated here: the Work Item detail carries them. */
export type ValueStream = { workItemId: string; trackerCreatedAt: string | null; admittedAt: string | null; closed: boolean; lanes: StreamLane[]; notes: string[]; demo: boolean; fetchedAt: string };

const gateTone: Record<FactsGate, StreamTone> = { development: 'live', test: 'attention', acceptance: 'review', done: 'success' };
const closedStates = new Set(['done', 'withdrawn', 'stale']);
const at = (value: string) => Date.parse(value);
const byTime = <T>(time: (entry: T) => string) => (a: T, b: T) => at(time(a)) - at(time(b));

function ticketLane(facts: WorkItemFacts): StreamLane {
  const item = facts.workItem;
  const admitted = item.admittedAt ?? item.createdAt;
  const marks: StreamMark[] = [];
  const bars: StreamBar[] = [];
  if (item.trackerCreatedAt) marks.push({ at: item.trackerCreatedAt, label: 'Created in the tracker', tone: 'neutral' });
  if (item.trackerCreatedAt && at(admitted) > at(item.trackerCreatedAt)) bars.push({ start: item.trackerCreatedAt, end: admitted, label: 'Before Ploeg', detail: 'From the tracker creating the task to Ploeg admitting it', tone: 'neutral', waiting: true });
  marks.push({ at: admitted, label: item.admittedAt ? 'Admitted by Ploeg' : 'First seen by Ploeg', tone: 'neutral' });
  for (const withdrawal of facts.workItem.withdrawals) marks.push({ at: withdrawal.at, label: 'Withdrawn', tone: 'danger' });
  return { key: 'ticket', group: 'ticket', label: 'Ticket', sublabel: item.externalRef || item.externalId, url: item.url || null, bars, marks };
}

function statusLane(facts: WorkItemFacts, closed: boolean): StreamLane | null {
  const moves = [...facts.statusTransitions].sort(byTime(move => move.at));
  if (!moves.length) return null;
  const bars = moves.map((move, index): StreamBar => {
    const next = moves[index + 1];
    const last = !next;
    const end = next ? next.at : move.gate === 'done' || closed ? move.at : null;
    const notes = [move.gate ? `${move.gate[0]!.toUpperCase()}${move.gate.slice(1)} gate` : 'No gate', move.observed ? '' : 'move inferred, not observed', last && end === null ? 'still here' : ''].filter(Boolean);
    return { start: move.at, end, label: move.status, detail: notes.join(' · '), tone: move.gate ? gateTone[move.gate] : 'neutral', waiting: !move.gate };
  });
  return { key: 'status', group: 'status', label: 'Tracker status', sublabel: `${moves.length} ${moves.length === 1 ? 'move' : 'moves'}`, url: null, bars, marks: [] };
}

function reviewSpans(pull: FactsPullRequest): StreamBar[] {
  const opened = pull.openedAt ?? pull.firstSeenAt;
  const end = pull.mergedAt ?? pull.closedAt;
  const flips = pull.events.filter(event => event.kind === 'ready' || event.kind === 'draft').sort(byTime(event => event.at));
  let draft = flips.length ? flips[0]!.kind === 'ready' : Boolean(pull.draft && !end);
  let start = opened;
  const bars: StreamBar[] = [];
  const close = (until: string | null) => {
    if (until !== null && at(until) <= at(start)) return;
    bars.push(draft
      ? { start, end: until, label: 'Draft', detail: 'The agent was still working on it', tone: 'neutral', waiting: false }
      : { start, end: until, label: 'In review', detail: until ? 'Ready for review until merged or closed' : 'Waiting for review', tone: 'review', waiting: true });
  };
  for (const flip of flips) {
    if ((flip.kind === 'draft') === draft) continue;
    close(flip.at);
    start = flip.at;
    draft = flip.kind === 'draft';
  }
  close(end);
  return bars;
}

function pullRequestLane(pull: FactsPullRequest): StreamLane {
  const marks: StreamMark[] = [];
  for (const review of pull.reviews) {
    const state = (review.state ?? '').toLowerCase();
    if (state === 'approved') marks.push({ at: review.receivedAt, label: `Approved by ${review.reviewer}`, tone: 'success' });
    else if (state === 'changes_requested' || state === 'request_changes') marks.push({ at: review.receivedAt, label: `Changes requested by ${review.reviewer}`, tone: 'attention' });
  }
  for (const event of pull.events) if (event.kind === 'push' || event.kind === 'force_push') marks.push({ at: event.at, label: event.kind === 'push' ? 'Pushed' : 'Force-pushed', tone: 'neutral' });
  if (pull.mergedAt) marks.push({ at: pull.mergedAt, label: pull.mergedBy ? `Merged by ${pull.mergedBy}` : 'Merged', tone: 'success' });
  else if (pull.closedAt) marks.push({ at: pull.closedAt, label: 'Closed without merging', tone: 'danger' });
  return { key: `pull:${pull.id}`, group: 'pullRequest', label: `Pull request #${pull.number}`, sublabel: `${pull.owner}/${pull.repo}`, url: pull.url || null, bars: reviewSpans(pull), marks: marks.sort(byTime(mark => mark.at)) };
}

const ciTone = (status: string): StreamTone => status === 'success' ? 'success' : status === 'failure' || status === 'error' ? 'danger' : status === 'pending' || status === 'running' ? 'live' : 'neutral';

function ciBars(run: FactsCIRun): StreamBar[] {
  const running = run.status === 'pending' || run.status === 'running';
  const start = run.startedAt ?? run.createdAt;
  if (!start) return [];
  const end = run.completedAt ?? (running ? null : start);
  const failedJobs = run.jobs.filter(job => job.status === 'failure' || job.status === 'error').map(job => job.name);
  const detail = [run.workflow || 'CI', `${run.jobs.length} ${run.jobs.length === 1 ? 'job' : 'jobs'}`, failedJobs.length ? `failed: ${failedJobs.slice(0, 3).join(', ')}${failedJobs.length > 3 ? '…' : ''}` : '', `head ${run.headSha.slice(0, 7)}`].filter(Boolean).join(' · ');
  const bars: StreamBar[] = [];
  if (run.createdAt && run.startedAt && at(run.startedAt) > at(run.createdAt)) bars.push({ start: run.createdAt, end: run.startedAt, label: 'Queued', detail: `${run.workflow || 'CI'} waited for a runner`, tone: 'neutral', waiting: true });
  bars.push({ start, end, label: run.status, detail, tone: ciTone(run.status), waiting: false });
  return bars;
}

function ciLane(pull: FactsPullRequest): StreamLane | null {
  const runs = [...pull.ciRuns].filter(run => run.startedAt ?? run.createdAt).sort(byTime(run => (run.startedAt ?? run.createdAt)!));
  if (!runs.length) return null;
  const failed = runs.filter(run => run.status === 'failure' || run.status === 'error').length;
  return { key: `ci:${pull.id}`, group: 'ci', label: `CI · #${pull.number}`, sublabel: `${runs.length} ${runs.length === 1 ? 'run' : 'runs'}${failed ? `, ${failed} failed` : ''}`, url: null, bars: runs.flatMap(ciBars), marks: [] };
}

function environmentLanes(facts: WorkItemFacts): StreamLane[] {
  const lanes = new Map<string, StreamLane & { first: number }>();
  const lane = (environment: string) => {
    if (!lanes.has(environment)) lanes.set(environment, { key: `env:${environment}`, group: 'environment', label: environment[0]!.toUpperCase() + environment.slice(1), sublabel: 'environment', url: null, bars: [], marks: [], first: Number.MAX_SAFE_INTEGER });
    return lanes.get(environment)!;
  };
  for (const pull of facts.pullRequests) {
    if (!pull.mergedAt) continue;
    const reached = new Set<string>();
    for (const deploy of pull.deployments) {
      const entry = lane(deploy.environment);
      reached.add(deploy.environment);
      entry.first = Math.min(entry.first, at(deploy.firstDeployedAt));
      if (at(deploy.firstDeployedAt) > at(pull.mergedAt)) entry.bars.push({ start: pull.mergedAt, end: deploy.firstDeployedAt, label: `#${pull.number} to ${deploy.environment}`, detail: 'From merge to the first deploy that carried it', tone: 'success', waiting: true });
      entry.marks.push({ at: deploy.firstDeployedAt, label: `Deployed #${pull.number} (${deploy.sha.slice(0, 7)})`, tone: 'success' });
      if (deploy.url) entry.url ??= deploy.url;
    }
    for (const known of facts.deployEnvironments) {
      if (reached.has(known.environment) || known.owner !== pull.owner || known.repo !== pull.repo || known.forge !== pull.forge) continue;
      lane(known.environment).bars.push({ start: pull.mergedAt, end: null, label: `#${pull.number} not deployed yet`, detail: `${known.environment} has not run a deploy carrying this merge`, tone: 'neutral', waiting: true });
    }
  }
  return [...lanes.values()].sort((a, b) => a.first - b.first || a.label.localeCompare(b.label)).map(({ first: _first, ...entry }) => entry);
}

/** Projects a Work Item's delivery facts onto the lanes of its value-stream chart. */
export function valueStream(facts: WorkItemFacts, fetchedAt = new Date().toISOString()): ValueStream {
  const closed = closedStates.has(facts.workItem.state);
  const pulls = [...facts.pullRequests].sort(byTime(pull => pull.openedAt ?? pull.firstSeenAt));
  const lanes = [ticketLane(facts), statusLane(facts, closed), ...pulls.flatMap(pull => [pullRequestLane(pull), ciLane(pull)]), ...environmentLanes(facts)].filter((lane): lane is StreamLane => lane !== null);
  const notes: string[] = [];
  const firstMove = facts.statusTransitions.map(move => at(move.at)).sort((a, b) => a - b)[0];
  if (facts.truncated.statusTransitions) notes.push('Ploeg capped the status history; earlier moves are missing.');
  else if (firstMove !== undefined && facts.workItem.trackerCreatedAt && firstMove - at(facts.workItem.trackerCreatedAt) > 60_000) notes.push('The status history starts when Ploeg first saw the task; earlier moves are not known.');
  if (facts.truncated.pullRequests) notes.push('Ploeg capped the pull requests; earlier ones are missing.');
  if (pulls.some(pull => pull.ciRunsTruncated)) notes.push('CI shows the latest runs Ploeg read for each pull request, at most 30.');
  if (pulls.some(pull => pull.mergedAt) && !facts.deployEnvironments.length) notes.push('No deploy has been reported for this repository, so environments are not shown.');
  return { workItemId: facts.workItem.id, trackerCreatedAt: facts.workItem.trackerCreatedAt, admittedAt: facts.workItem.admittedAt ?? facts.workItem.createdAt, closed, lanes, notes, demo: false, fetchedAt };
}
