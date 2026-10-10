import type { Event, Session } from './types.ts';

/** One revision of a Ploeg execution, as `GET /api/v1/operator/executions/{id}/events` returns it. */
export type PloegRevision = { revision: number; at: string; actor: string; kind: string; detail?: Record<string, unknown> };

/** The likely reason a session stopped. `unclear` means no rule matched the evidence. */
export type InvestigationClass = 'unfold_stall' | 'ploeg_unreachable' | 'ploeg_refused' | 'unfold_restart' | 'operator_stop' | 'guard' | 'unclear';

/** A read-only first diagnosis of a stopped session, built from Unfold's events and Ploeg's execution revisions. */
export type Investigation = {
  sessionId: string;
  generatedAt: string;
  class: InvestigationClass;
  verdict: string;
  rule: string;
  stop?: { at: string; type: string };
  facts: { label: string; value: string }[];
  timeline: { at: string; source: 'unfold' | 'ploeg'; text: string }[];
  next: string[];
  ploeg: 'read' | 'unavailable' | 'not_bound';
};

const stopTypes = ['execution.authority_lost', 'session.interrupted', 'execution.reconciliation_required', 'execution.reconciliation_pending', 'session.failed', 'run.runaway', 'session.paused', 'session.cancelled'];
const burstPerSecond = 50;
const causeText: Record<string, string> = { timeout: 'did not answer in time', network: 'could not be reached', http: 'answered with an error', stale: 'rejected the call as stale', refused: 'no longer allowed the execution', invalid_response: 'sent an unusable answer', not_configured: 'connection is not configured' };

const ms = (value: string) => Date.parse(value);
const seconds = (value: number) => `${Math.round(value / 1000)} s`;

function eventRate(events: Event[], stopAt: number) {
  const perSecond = new Map<number, number>();
  for (const event of events) {
    const at = ms(event.at);
    if (at > stopAt || at < stopAt - 60_000) continue;
    const second = Math.floor(at / 1000);
    perSecond.set(second, (perSecond.get(second) ?? 0) + 1);
  }
  const counts = [...perSecond.values()];
  return { peak: Math.max(0, ...counts), total: counts.reduce((sum, value) => sum + value, 0) };
}

function heartbeatGap(revisions: PloegRevision[], stopAt: number) {
  const accepted = revisions.filter(revision => ['execution.start', 'execution.heartbeat', 'execution.report', 'execution.resume'].includes(revision.kind)).map(revision => ms(revision.at)).sort((a, b) => a - b);
  const before = accepted.filter(at => at <= stopAt);
  const last = before.at(-1);
  const intervals = before.slice(1).map((at, index) => at - before[index]);
  const typical = intervals.length ? intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)] : undefined;
  return { last, silentMs: last === undefined ? undefined : stopAt - last, typical };
}

function leaseLength(events: Event[]) {
  const bound = events.filter(event => event.type === 'execution.authority' && typeof event.data.expiresAt === 'string').map(event => ms(String(event.data.expiresAt)) - ms(event.at)).filter(value => value > 0);
  return bound.length ? Math.max(...bound) : undefined;
}

function lastAnswer(events: Event[], session: Session) {
  const run = session.runs.at(-1);
  if (!run) return undefined;
  const text = events.filter(event => event.type === 'message' && event.runId === run.id && event.data.role !== 'operator').map(event => String(event.data.text ?? '')).join('');
  const verdict = /"verdict"\s*:\s*"(approve|request_changes|inconclusive)"/.exec(text)?.[1] ?? /VERDICT:\s*(approve|request_changes|inconclusive)/i.exec(text)?.[1]?.toLowerCase();
  return { run, verdict };
}

/** Classifies why a session stopped. Pure: the caller supplies the events, the Ploeg revisions (or `undefined` when they could not be read) and the clock. */
export function investigate(session: Session, events: Event[], revisions: PloegRevision[] | undefined, heartbeatMs: number, now = new Date()): Investigation {
  const stop = events.find(event => stopTypes.includes(event.type));
  const stopAt = stop ? ms(stop.at) : session.updatedAt ? ms(session.updatedAt) : now.getTime();
  const facts: Investigation['facts'] = [];
  const timeline: Investigation['timeline'] = [];
  const next: string[] = [];
  const ploeg: Investigation['ploeg'] = !session.execution ? 'not_bound' : revisions ? 'read' : 'unavailable';
  const lost = events.find(event => event.type === 'execution.authority_lost');
  const cause = typeof lost?.data.cause === 'string' ? lost.data.cause : undefined;
  const missed = events.filter(event => event.type === 'execution.heartbeat_missed' && ms(event.at) <= stopAt);
  const rate = eventRate(events, stopAt);
  const gap = revisions ? heartbeatGap(revisions, stopAt) : undefined;
  const lease = leaseLength(events);
  const leaseLeftMs = typeof lost?.data.leaseLeftMs === 'number' ? lost.data.leaseLeftMs : gap?.last !== undefined && lease ? Math.max(0, gap.last + lease - stopAt) : undefined;
  const restarted = events.some(event => event.type === 'session.interrupted' && ms(event.at) >= stopAt - 1000);
  const operatorStop = events.find(event => ['session.paused', 'session.cancelled'].includes(event.type) && ms(event.at) <= stopAt + 1000);
  const refusedInPloeg = revisions?.find(revision => ms(revision.at) <= stopAt && ['cancel_requested', 'pause_requested'].includes(String(revision.detail?.state ?? '')) && revision.actor !== session.ownerId);
  const guard = events.find(event => ['run.runaway', 'policy.violated'].includes(event.type) || (event.type === 'session.failed' && /budget/i.test(JSON.stringify(event.data))));

  if (stop) facts.push({ label: 'Stopped', value: `${stop.type} at ${stop.at}` });
  if (cause) facts.push({ label: 'Recorded cause', value: `Ploeg ${causeText[cause] ?? cause}${typeof lost?.data.status === 'number' ? ` (HTTP ${lost.data.status})` : ''}` });
  if (missed.length) facts.push({ label: 'Heartbeats missed before the stop', value: String(missed.length) });
  if (gap?.last !== undefined) facts.push({ label: 'Last heartbeat Ploeg accepted', value: `${new Date(gap.last).toISOString()}, ${seconds(gap.silentMs!)} before the stop${gap.typical ? ` (normally every ${seconds(gap.typical)})` : ''}` });
  if (leaseLeftMs !== undefined) facts.push({ label: 'Lease left when it stopped', value: seconds(leaseLeftMs) });
  facts.push({ label: 'Unfold events in the minute before', value: `${rate.total}, peak ${rate.peak} a second` });
  if (ploeg === 'unavailable') facts.push({ label: 'Ploeg side', value: 'Could not be read now; findings use Unfold\'s records only.' });

  let found: Pick<Investigation, 'class' | 'verdict' | 'rule'>;
  if (operatorStop) found = { class: 'operator_stop', rule: 'a pause or cancel was recorded before the stop', verdict: `${operatorStop.type === 'session.paused' ? 'Paused' : 'Cancelled'} by a person. Nothing failed.` };
  else if (guard) found = { class: 'guard', rule: `${guard.type} was recorded`, verdict: 'A safety guard stopped the Run. Read the recorded message before trying again.' };
  else if (restarted) found = { class: 'unfold_restart', rule: 'Unfold recorded a server restart or shutdown at the stop', verdict: 'Unfold restarted while this session was running. Ploeg holds the execution until it is reconciled.' };
  else if (cause === 'stale' || cause === 'refused' || refusedInPloeg) found = { class: 'ploeg_refused', rule: cause ? `Ploeg ${causeText[cause]}` : `Ploeg recorded ${refusedInPloeg!.detail?.state} from another actor`, verdict: 'Ploeg no longer allowed this execution. Another actor or a newer generation took over; this is Ploeg working as intended.' };
  else if (lost && rate.peak >= burstPerSecond && (cause === undefined || cause === 'timeout' || cause === 'unknown') && (leaseLeftMs === undefined || leaseLeftMs > 0)) found = { class: 'unfold_stall', rule: `Unfold wrote up to ${rate.peak} events a second just before a heartbeat failed${cause ? ` (${cause})` : ''}, with lease left`, verdict: `Unfold stalled while saving a fast stream and missed its heartbeat to Ploeg${leaseLeftMs !== undefined ? ` with about ${seconds(leaseLeftMs)} of lease left` : ''}. Ploeg was not the problem.` };
  else if (lost && (cause === 'network' || cause === 'http' || cause === 'timeout')) found = { class: 'ploeg_unreachable', rule: `the heartbeat failed because Ploeg ${causeText[cause]}`, verdict: 'Unfold could not reach Ploeg long enough for the lease to run out. Check Ploeg\'s health and recent rollouts.' };
  else found = { class: 'unclear', rule: 'no rule matched', verdict: 'No known pattern matches. The facts below are what is known; investigate further before resuming.' };

  const answer = lastAnswer(events, session);
  if (answer) {
    facts.push({ label: `${answer.run.roleName}`, value: `${answer.run.status}${answer.verdict ? `; its streamed answer already contains verdict ${answer.verdict}` : ''}` });
    const repeats = session.runs.filter(run => run.status !== 'completed').map(run => run.roleName);
    if (repeats.length && ['interrupted', 'paused'].includes(session.status)) next.push(`Resume repeats: ${repeats.join(', ')}.`);
    if (answer.verdict) next.push(`The ${answer.run.roleName} had already answered "${answer.verdict}" before the stop; resuming asks it again.`);
  }
  facts.push({ label: 'Spend', value: `${(session.observedUsd ?? session.spentUsd).toFixed(2)} of ${session.budgetUsd.toFixed(2)} USD` });
  if (found.class === 'unfold_stall' || found.class === 'ploeg_unreachable') next.push('The workspace and branch are kept; resuming is safe once Ploeg answers again.');
  if (found.class === 'unclear') next.push('Ask an agent to run the investigate-session skill for cluster-level facts (restarts, probes, rollouts).');

  for (const event of events) {
    const at = ms(event.at);
    if (at < stopAt - 120_000 || at > stopAt + 30_000) continue;
    if (['execution.heartbeat_missed', 'execution.authority_lost', 'execution.reconciliation_required', 'execution.reconciliation_pending', 'session.interrupted', 'run.started', 'run.finished', 'session.paused', 'session.cancelled', 'session.failed'].includes(event.type)) timeline.push({ at: event.at, source: 'unfold', text: event.type + (typeof event.data.cause === 'string' ? ` (${event.data.cause})` : '') });
  }
  for (const revision of revisions ?? []) {
    const at = ms(revision.at);
    if (at < stopAt - 120_000 || at > stopAt + 30_000) continue;
    timeline.push({ at: revision.at, source: 'ploeg', text: `r${revision.revision} ${revision.kind}${revision.detail?.state ? ` → ${revision.detail.state}` : ''}` });
  }
  timeline.sort((a, b) => ms(a.at) - ms(b.at));
  if (gap?.typical && gap.silentMs !== undefined && gap.silentMs > Math.max(gap.typical, heartbeatMs) * 1.5) {
    const index = timeline.findIndex(item => ms(item.at) > gap.last!);
    timeline.splice(index === -1 ? timeline.length : index, 0, { at: new Date(gap.last! + 1).toISOString(), source: 'ploeg', text: `no heartbeat for ${seconds(gap.silentMs)}` });
  }
  return { sessionId: session.id, generatedAt: now.toISOString(), ...found, ...(stop ? { stop: { at: stop.at, type: stop.type } } : {}), facts, timeline: timeline.slice(-40), next, ploeg };
}
