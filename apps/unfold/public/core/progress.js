import { money, plural, time } from './format.js';

/**
 * One derived state for an Unfold session and the Ploeg Work Item it drives: the phase, a headline, the steps of its
 * Roles, the change, the spend, why it stopped, the facts that reconcile contradicting sources, and the actions that
 * fit. Every surface reads this, so the extension, the Agents window and the browser cannot disagree.
 *
 * @typedef {'ready' | 'preparing' | 'working' | 'asking' | 'capturing' | 'paused' | 'stopped' | 'failed' | 'review' | 'changes_requested' | 'accepted' | 'rejected' | 'cancelled'} Phase
 * @typedef {'neutral' | 'live' | 'attention' | 'review' | 'success' | 'danger' | 'severe'} Tone
 * @typedef {{ id: string, label: string, primary?: boolean, confirm?: { title: string, detail: string, button: string }, hint?: string, outcome?: string }} ProgressAction
 * @typedef {{ id: string, role: string, mode: 'write' | 'read', state: 'done' | 'working' | 'asking' | 'paused' | 'cut_off' | 'failed' | 'cancelled' | 'waiting', label: string, tone: Tone, verdict: { key: string, label: string, tone: Tone, recorded: boolean } | null, startedAt: string, finishedAt: string, seconds: number | null, summary: string }} ProgressStep
 */

const active = ['running', 'waiting_input', 'exporting'];
const unfinishedRun = ['running', 'waiting_input', 'paused', 'queued'];
const stopTypes = ['execution.authority_lost', 'session.interrupted', 'execution.reconciliation_required', 'execution.reconciliation_pending', 'session.failed', 'run.runaway', 'session.paused', 'session.cancelled', 'execution.stop_pending'];
const verdictWords = { approve: 'approved', request_changes: 'requested changes', inconclusive: 'gave no clear verdict' };
const causeWords = { timeout: 'did not answer in time', network: 'could not be reached', http: 'answered with an error', stale: 'rejected a call as stale', refused: 'no longer allowed the execution' };
const verdictTones = { approve: 'success', request_changes: 'attention', inconclusive: 'neutral' };

/** Phase labels, tones and glyphs, in the vocabulary of `states.js`. */
export const phases = Object.freeze({
  ready: { label: 'Ready to start', tone: 'neutral', glyph: 'circle' },
  preparing: { label: 'Preparing', tone: 'live', glyph: 'activity', live: true },
  working: { label: 'Working', tone: 'live', glyph: 'activity', live: true },
  asking: { label: 'Needs your answer', tone: 'attention', glyph: 'alert' },
  capturing: { label: 'Capturing the change', tone: 'live', glyph: 'activity', live: true },
  paused: { label: 'Paused', tone: 'neutral', glyph: 'pause-circle' },
  stopped: { label: 'Stopped', tone: 'severe', glyph: 'zap' },
  failed: { label: 'Failed', tone: 'danger', glyph: 'x-circle' },
  review: { label: 'Ready for your review', tone: 'review', glyph: 'eye' },
  changes_requested: { label: 'Changes requested', tone: 'attention', glyph: 'alert' },
  accepted: { label: 'Accepted', tone: 'success', glyph: 'check-circle' },
  rejected: { label: 'Rejected', tone: 'neutral', glyph: 'x' },
  cancelled: { label: 'Cancelled', tone: 'neutral', glyph: 'stop' },
});

const text = value => typeof value === 'string' ? value.trim() : '';
const amount = value => typeof value === 'number' && Number.isFinite(value);
const ms = value => { const parsed = Date.parse(value || ''); return Number.isFinite(parsed) ? parsed : null; };
const capital = value => value ? value[0].toUpperCase() + value.slice(1) : value;
const lower = value => value ? value[0].toLowerCase() + value.slice(1) : value;

/** A running clock for elapsed seconds: "0:07", "12:05", "1:02:03". Empty for a missing value. */
export function elapsedClock(seconds) {
  if (!amount(seconds)) return '';
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Lines added and removed per file in a unified diff, keyed by the file's new path. */
export function patchCounts(patch) {
  const files = new Map();
  let current = null;
  for (const line of String(patch || '').split('\n')) {
    const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (header) { current = header[2]; files.set(current, { added: 0, removed: 0 }); continue; }
    if (!current || line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) files.get(current).added++;
    else if (line.startsWith('-')) files.get(current).removed++;
  }
  return files;
}

/** The files a session's diff artifacts describe, with before and after text when the runtime kept them. */
export function changedFiles(session) {
  const files = new Map();
  for (const artifact of session?.artifacts || []) {
    if (artifact?.kind !== 'diff') continue;
    let parsed = null;
    try { parsed = JSON.parse(artifact.content); } catch {}
    if (Array.isArray(parsed)) {
      for (const entry of parsed) if (entry && typeof entry.file === 'string') files.set(entry.file, { file: entry.file, added: Number(entry.additions) || 0, removed: Number(entry.deletions) || 0, ...(typeof entry.before === 'string' ? { before: entry.before } : {}), ...(typeof entry.after === 'string' ? { after: entry.after } : {}), artifactId: artifact.id });
    } else {
      for (const [file, counts] of patchCounts(artifact.content)) files.set(file, { file, ...counts, artifactId: artifact.id });
    }
  }
  return [...files.values()];
}

/** The verdict a reading Run wrote in its own text, when its record has none: `VERDICT: approve` or a JSON `"verdict"`. */
export function transcriptVerdict(events, runId) {
  const said = (events || []).filter(event => event?.type === 'message' && event.runId === runId && event.data?.role !== 'operator').map(event => String(event.data?.text ?? '')).join('');
  const found = [...said.matchAll(/"verdict"\s*:\s*"(approve|request_changes|inconclusive)"|VERDICT:\s*(approve|request_changes|inconclusive)/gi)].at(-1);
  return found ? (found[1] || found[2]).toLowerCase() : null;
}

function lastStop(session, events) {
  const stop = [...(events || [])].reverse().find(event => stopTypes.includes(event?.type));
  if (stop) return { at: stop.at, type: stop.type, data: stop.data || {} };
  const blocker = text(session?.blocker);
  if (session?.status === 'interrupted' && blocker) return { at: session.updatedAt, type: /reconciliation/i.test(blocker) ? 'execution.reconciliation_required' : /restart/i.test(blocker) ? 'session.interrupted' : /authority/i.test(blocker) ? 'execution.authority_lost' : 'session.interrupted', data: { message: blocker } };
  return null;
}

/** Why a session stopped, in a few words and in a sentence, from its last stop event and its blocker. */
export function stopReason(session, events) {
  const stop = lastStop(session, events);
  const blocker = text(session?.blocker);
  if (session?.status === 'failed') {
    const failure = session.failure;
    return { code: 'failed', short: 'failed', sentence: failure?.message || blocker || 'The session failed.', at: stop?.at || session.updatedAt };
  }
  if (session?.status === 'paused') return { code: 'paused', short: 'paused', sentence: 'A person paused it. Nothing runs until someone resumes it.', at: stop?.at || session.updatedAt };
  if (session?.status === 'cancelled') return { code: 'cancelled', short: 'cancelled', sentence: 'A person cancelled it. Its history and evidence stay.', at: stop?.at || session.updatedAt };
  if (session?.status !== 'interrupted') return null;
  const restarted = /restart|server stopped/i.test(blocker) || /restart/i.test(String(stop?.data?.message ?? ''));
  const reconciling = stop?.type === 'execution.reconciliation_required' || /retains this stopped/i.test(blocker);
  const pending = stop?.type === 'execution.reconciliation_pending' || /not confirmed reconciliation|Restore the Ploeg execution connection/i.test(blocker);
  const lost = stop?.type === 'execution.authority_lost' || /authority was lost/i.test(blocker);
  const at = stop?.at || session.updatedAt;
  const lostFirst = (events || []).find(event => event?.type === 'execution.authority_lost');
  const cause = lostFirst ? `Unfold lost Ploeg's authority to run it at ${time(lostFirst.at)}${lostFirst.data?.cause ? `, after Ploeg ${causeWords[lostFirst.data.cause] || 'did not answer'}` : ''}. ` : '';
  const plain = lostFirst ? `At ${time(lostFirst.at)} Ploeg ${causeWords[lostFirst.data?.cause] || 'stopped answering'}, so Unfold stopped the session. Nothing runs again by itself.` : '';
  if (reconciling) return { code: 'reconciliation', short: 'Ploeg holds it for reconciliation', sentence: `${cause}Ploeg stopped the execution and holds it for reconciliation. It will not retry by itself.`, plain: plain || 'Ploeg stopped the session. Nothing runs again by itself.', cause: cause.trim(), at, retained: true };
  if (pending) return { code: 'reconciliation_pending', short: 'waiting for Ploeg to confirm the stop', sentence: 'Execution stopped here, and Ploeg has not confirmed the stop yet. Its budget stays reserved and nothing retries by itself.', plain: 'The session stopped and Ploeg has not confirmed it yet, so its budget stays held. Nothing runs again by itself.', at, retained: true };
  if (lost) return { code: 'authority_lost', short: 'Ploeg authority lost', sentence: 'Unfold lost Ploeg\'s authority to run it and stopped. Nothing retries by itself.', plain: plain || 'Ploeg stopped answering, so Unfold stopped the session. Nothing runs again by itself.', at, retained: Boolean(session.execution) };
  if (restarted) return { code: 'restart', short: 'Unfold restarted', sentence: 'The workbench restarted while it ran. Nothing resumed by itself.', plain: 'Unfold restarted while the session ran. Nothing resumed by itself.', at, retained: false };
  return { code: 'interrupted', short: 'interrupted', sentence: blocker || 'This session stopped. Nothing runs until you choose what to do.', plain: blocker || 'The session stopped. Nothing runs until you choose what to do.', at, retained: Boolean(session.execution) };
}

function stepFor(session, run, events, sessionActive, stoppedAt, now) {
  const start = ms(run.startedAt);
  const finishedRecorded = ms(run.finishedAt);
  const cutOff = !sessionActive && (['running', 'waiting_input'].includes(run.status) || (run.status === 'paused' && session?.status !== 'paused'));
  const end = finishedRecorded ?? (cutOff ? ms(stoppedAt) : sessionActive && ['running', 'waiting_input'].includes(run.status) ? now : null);
  const seconds = start !== null && end !== null && end >= start ? (end - start) / 1000 : null;
  const recorded = run.verdict && run.verdictSource !== 'transcript' ? run.verdict : null;
  const settled = cutOff || !unfinishedRun.includes(run.status);
  const spoken = recorded ? null : run.verdict && run.verdictSource === 'transcript' ? run.verdict : settled && run.mode === 'read' ? transcriptVerdict(events, run.id) : null;
  const key = recorded || spoken;
  const verdict = key ? { key, label: capital(verdictWords[key] || key), tone: verdictTones[key] || 'neutral', recorded: Boolean(recorded) } : null;
  let state, label, tone;
  if (cutOff) { state = 'cut_off'; label = 'Interrupted'; tone = 'severe'; }
  else if (run.status === 'running') { state = 'working'; label = 'Working'; tone = 'live'; }
  else if (run.status === 'waiting_input') { state = 'asking'; label = 'Waiting for you'; tone = 'attention'; }
  else if (run.status === 'paused') { state = 'paused'; label = 'Paused'; tone = 'neutral'; }
  else if (run.status === 'queued') { state = 'waiting'; label = 'Not started'; tone = 'neutral'; }
  else if (run.status === 'failed') { state = 'failed'; label = 'Failed'; tone = 'danger'; }
  else if (run.status === 'cancelled') { state = 'cancelled'; label = 'Cancelled'; tone = 'neutral'; }
  else { state = 'done'; label = 'Finished'; tone = 'success'; }
  return { id: run.id, roleId: run.roleId || '', role: run.roleName || run.roleId || 'Role', mode: run.mode === 'read' ? 'read' : 'write', state, label, tone, verdict, startedAt: run.startedAt || '', finishedAt: run.finishedAt || (cutOff ? stoppedAt || '' : ''), seconds, summary: text(run.summary), costUsd: amount(run.costUsd) && run.costUsd > 0 ? run.costUsd : null };
}

/**
 * The labelled findings in a reviewer's report: bullets that open with a bold label, such as "**Links:** all resolve".
 * The labels are the reviewer's own words; an empty list when the report has none.
 */
export function reportFindings(report) {
  const source = String(report || '');
  const found = [];
  for (const match of source.matchAll(/(?:^|\n|\s)[-*]\s+\*\*([^*\n]{1,60}?):?\*\*:?\s*([\s\S]*?)(?=\s[-*]\s+\*\*[^*\n]{1,60}\*\*|\n\n|\n[-*]\s|$)/g)) {
    const label = text(match[1]).replace(/:$/, '');
    const detail = text(match[2]).replace(/\s*VERDICT:[\s\S]*$/i, '').replace(/\s+/g, ' ').trim();
    if (label && detail && !/^verdict$/i.test(label)) found.push({ label, detail: detail.length > 280 ? `${detail.slice(0, 279)}…` : detail });
    if (found.length === 12) break;
  }
  return found;
}

/** The checks the session's Runs recorded as evidence, each with its command and whether it passed. */
export function checksOf(session) {
  return (session?.artifacts || []).filter(artifact => artifact?.kind === 'test' && text(artifact.name)).map(artifact => {
    const output = text(artifact.content);
    const exit = /\bexit(?: code)?:?\s*(-?\d+)/i.exec(output);
    const passed = exit ? Number(exit[1]) === 0 : /\b(?:pass(?:ed)?|ok)\b/i.test(output) && !/\bfail/i.test(output) ? true : /\bfail/i.test(output) ? false : null;
    return { id: artifact.id, name: text(artifact.name), passed, output: output.length > 400 ? `${output.slice(0, 399)}…` : output };
  });
}

/**
 * Cost and tokens per Role: the gateway's requests attributed to each Role when the session has them, otherwise the
 * cost each Run reported. Roles with nothing reported read null, never a made-up zero.
 */
export function roleCosts(session, steps) {
  const requests = Array.isArray(session?.requests) ? session.requests.filter(entry => entry && text(entry.roleId)) : [];
  const roles = new Map();
  for (const step of steps) {
    const key = step.roleId || step.role;
    if (!roles.has(key)) roles.set(key, { roleId: key, role: step.role, mode: step.mode, runs: 0, costUsd: null, inputTokens: null, outputTokens: null, source: '' });
    const entry = roles.get(key);
    entry.runs++;
    if (!requests.length && step.costUsd !== null) { entry.costUsd = (entry.costUsd || 0) + step.costUsd; entry.source = 'run'; }
  }
  for (const request of requests) {
    const entry = roles.get(request.roleId);
    if (!entry) continue;
    entry.costUsd = (entry.costUsd || 0) + (amount(request.usd) ? request.usd : 0);
    entry.inputTokens = (entry.inputTokens || 0) + (amount(request.inputTokens) ? request.inputTokens : 0);
    entry.outputTokens = (entry.outputTokens || 0) + (amount(request.outputTokens) ? request.outputTokens : 0);
    entry.source = 'gateway';
  }
  return [...roles.values()];
}

const timelineWords = {
  'session.started': () => 'Session started',
  'workspace.ready': () => 'Workspace ready',
  'execution.heartbeat_missed': event => `Ploeg ${causeWords[event.data?.cause] || 'did not answer'}; a heartbeat was missed`,
  'execution.authority_lost': event => `Unfold lost Ploeg's authority to run it${event.data?.cause ? `: Ploeg ${causeWords[event.data.cause] || 'did not answer'}` : ''}`,
  'execution.reconciliation_required': () => 'Ploeg stopped the execution and holds it',
  'execution.reconciliation_pending': () => 'Stopped here; Ploeg has not confirmed the stop',
  'session.interrupted': () => 'Session interrupted',
  'session.paused': () => 'Paused by a person',
  'session.cancelled': () => 'Cancelled by a person',
  'session.failed': () => 'Session failed',
  'candidate.ready': () => 'Change captured',
  'candidate.unavailable': () => 'Change could not be captured',
  'session.delivering': () => 'Delivering the approved work',
  'session.completed': () => 'Session completed',
};

/** What happened, in order: when the session and each Role started and ended, and every stop. At most 16 entries. */
export function timelineOf(session, events) {
  const roles = new Map((session?.runs || []).map(run => [run.id, run.roleName || run.roleId || 'Role']));
  const entries = [];
  for (const event of events || []) {
    if (!event?.at) continue;
    if (event.type === 'run.started') entries.push({ at: event.at, text: `${capital(text(event.data?.role) || roles.get(event.runId) || 'A Role')} started`, tone: 'live' });
    else if (event.type === 'run.finished') entries.push({ at: event.at, text: `${capital(roles.get(event.runId) || text(event.data?.role) || 'A Role')} finished`, tone: event.data?.status === 'failed' ? 'danger' : 'success' });
    else if (event.type === 'run.halted') entries.push({ at: event.at, text: `${capital(roles.get(event.runId) || 'A Role')} was cut off`, tone: 'attention' });
    else if (timelineWords[event.type]) entries.push({ at: event.at, text: timelineWords[event.type](event), tone: stopTypes.includes(event.type) || event.type === 'execution.heartbeat_missed' ? 'attention' : event.type === 'candidate.ready' ? 'success' : 'neutral' });
  }
  return entries.slice(-16);
}

/** Spend as one figure with its status: settled, observed and not settled, a demo, or not reported. */
export function spendOf(session) {
  const budget = amount(session?.budgetUsd) ? session.budgetUsd : null;
  if (session?.costStatus === 'demo') return { valueUsd: null, budgetUsd: budget, status: 'demo', text: 'Demo', note: 'no model calls or spend' };
  const settled = session?.costStatus === 'settled' && amount(session.spentUsd);
  if (settled) return { valueUsd: session.spentUsd, budgetUsd: budget, status: 'settled', text: money(session.spentUsd), note: budget !== null ? `settled · of ${money(budget)}` : 'settled' };
  const observed = amount(session?.observedUsd) && session.observedUsd > (session.spentUsd || 0) ? session.observedUsd : amount(session?.spentUsd) && session.spentUsd > 0 ? session.spentUsd : null;
  if (observed !== null) return { valueUsd: observed, budgetUsd: budget, status: 'observed', text: money(observed), note: `observed, not settled${budget !== null ? ` · of ${money(budget)}` : ''}` };
  return { valueUsd: null, budgetUsd: budget, status: 'unknown', text: 'Not reported', note: budget !== null ? `of ${money(budget)}` : '' };
}

function lastActivity(events, runId, mode) {
  const event = [...(events || [])].reverse().find(entry => entry?.runId === runId && ['tool', 'message', 'permission'].includes(entry.type));
  if (!event) return null;
  if (event.type === 'tool') {
    const name = text(event.data?.title) || text(event.data?.name) || text(event.data?.tool) || 'a tool';
    return { at: event.at, text: event.data?.status === 'completed' ? `ran ${name}` : event.data?.status === 'error' ? `${name} failed` : `running ${name}` };
  }
  if (event.type === 'permission') return { at: event.at, text: 'asked you something' };
  return { at: event.at, text: mode === 'read' ? 'writing its review' : 'writing' };
}

function changeOf(session, card) {
  const files = changedFiles(session);
  const candidate = session?.candidate;
  const added = files.reduce((sum, file) => sum + file.added, 0);
  const removed = files.reduce((sum, file) => sum + file.removed, 0);
  const play = [...(card?.plays || [])].filter(entry => amount(entry?.number)).sort((a, b) => b.number - a.number)[0] || null;
  const fileCount = candidate?.status === 'ready' && amount(candidate.fileCount) ? candidate.fileCount : files.length;
  return {
    files: fileCount, added, removed, viewable: files.length > 0 || candidate?.status === 'ready',
    candidate: candidate?.status || null, candidateText: candidate?.status === 'ready' ? 'Candidate captured' : candidate?.status === 'unavailable' ? `No candidate: ${candidate.message || candidate.reason || 'unavailable'}` : '',
    branch: text(play?.branch) || text(session?.branch),
    pullRequest: play ? { number: play.number, url: text(play.url), state: play.state } : null,
  };
}

/** "3 files +57 −45", or '' when nothing changed. */
export function changeText(change) {
  if (!change?.files) return '';
  return [plural(change.files, 'file'), change.added || change.removed ? `+${change.added} −${change.removed}` : ''].filter(Boolean).join(' ');
}

function recoveryActions(recovery) {
  const listed = Array.isArray(recovery?.actions) ? recovery.actions : [];
  return new Map(listed.filter(entry => entry && entry.available !== false && ['capture', 'deliver', 'run_again'].includes(entry.id)).map(entry => [entry.id, entry]));
}

function resumeListed(recovery) {
  const entry = Array.isArray(recovery?.actions) ? recovery.actions.find(item => item?.id === 'resume') : undefined;
  return entry ? entry.available !== false : null;
}

function actionsFor(phase, session, { reason, change, approved, unrecorded, viewer, demo, budget, recovery: listed }) {
  if (viewer) return change.viewable ? [{ id: 'view-change', label: 'View change', primary: true }] : [];
  const recovery = recoveryActions(listed);
  const list = [];
  const add = (id, label, extra = {}) => list.push({ id, label, ...extra });
  const team = session?.execution?.team ? `team ${session.execution.team}` : 'the crew';
  const deliver = recovery.get('deliver');
  const again = recovery.get('run_again');
  const capture = recovery.get('capture');
  const captureAction = () => capture && !change.viewable && add('capture', 'Capture and view change', { hint: capture.description || 'Captures the change from the workspace so you can read it. No model call; nothing is sent to Ploeg.' });
  const deliverAction = () => deliver && add('deliver', 'Finish and review', { outcome: 'Finishing starts no model and spends nothing. You then accept or reject the change; nothing is pushed or merged.', confirm: { title: 'Finish the session with this change?', detail: `${unrecorded ? 'The reviewer approved in its last message, then it was interrupted before Unfold recorded the review. ' : ''}Unfold captures the change${change.branch ? ` on branch ${change.branch}` : ''} and Ploeg completes the session with it. No model runs and nothing is spent. You then accept or reject the change; nothing is pushed or merged.`, button: 'Finish' } });
  const againAction = () => again && add('run-again', again.label || 'Run again', { hint: again.description || 'Creates a new session with the same brief, crew and budget. It does not start until you start it, and this session stays as it is.' });
  const viewChange = () => change.viewable && add('view-change', 'View change');
  switch (phase) {
    case 'ready': add('start', 'Start'); add('open-session', 'Open session'); break;
    case 'preparing': case 'working': case 'capturing': add('open-session', 'Open session'); if (phase !== 'capturing') add('pause', 'Pause'); break;
    case 'asking': add('answer', 'Answer'); add('open-session', 'Open session'); break;
    case 'paused': add('resume', 'Resume'); add('cancel', 'Cancel session…'); break;
    case 'stopped':
      if (approved && deliver) { captureAction(); deliverAction(); againAction(); add('investigate', 'Investigate'); }
      else { add('investigate', 'Investigate'); captureAction(); againAction(); deliverAction(); }
      { const resumable = resumeListed(listed); if (resumable ?? (!reason?.retained && !demo)) add('resume', 'Resume'); }
      viewChange(); add('open-session', 'Open session'); add('cancel', 'Cancel session…');
      break;
    case 'failed': add('investigate', 'Investigate'); againAction(); viewChange(); add('open-session', 'Open session'); break;
    case 'review': viewChange(); add('accept', 'Accept'); add('reject', 'Reject'); if (change.pullRequest?.url) add('open-pr', `Open pull request #${change.pullRequest.number}`); break;
    case 'changes_requested': viewChange(); againAction(); add('open-session', 'Open session'); break;
    case 'accepted': case 'rejected': if (change.pullRequest?.url) add('open-pr', `Open pull request #${change.pullRequest.number}`); viewChange(); break;
    case 'cancelled': add('open-session', 'Open session'); break;
  }
  if (list.length) list[0] = { ...list[0], primary: true };
  return list;
}

function phaseOf(session, steps, change) {
  const lastReader = [...steps].reverse().find(step => step.mode === 'read' && step.verdict);
  switch (session?.status) {
    case 'queued': return 'ready';
    case 'running': return steps.some(step => step.state === 'working' || step.state === 'asking') ? 'working' : steps.length ? 'working' : 'preparing';
    case 'waiting_input': return 'asking';
    case 'exporting': return 'capturing';
    case 'paused': return 'paused';
    case 'interrupted': return 'stopped';
    case 'failed': return lastReader?.verdict.key === 'request_changes' && !session.failure ? 'changes_requested' : 'failed';
    case 'completed':
      if (session.review) return session.review.decision === 'accepted' ? 'accepted' : 'rejected';
      return lastReader?.verdict.key === 'request_changes' ? 'changes_requested' : 'review';
    case 'cancelled': return 'cancelled';
    default: return change.files ? 'review' : 'ready';
  }
}

/**
 * The progress of one session. `events` are its durable events (optional; without them a cut-off reader's transcript
 * verdict is not read), `now` the clock, `viewer` hides mutating actions, `ploeg` is the Work Item's Ploeg detail,
 * `card` its Run card and `recovery` the answer of `GET /api/sessions/:id/recovery` when the caller has them.
 *
 * @param {any} session
 * @param {{ events?: any[], now?: number, viewer?: boolean, ploeg?: any, card?: any, recovery?: any }} [options]
 */
export function sessionProgress(session, { events = [], now = Date.now(), viewer = false, ploeg = null, card = null, recovery = null } = {}) {
  const sessionActive = active.includes(session?.status);
  const reason = stopReason(session, events);
  const stoppedAt = reason?.at || (sessionActive ? '' : session?.updatedAt || '');
  const steps = (session?.runs || []).map(run => stepFor(session, run, events, sessionActive, stoppedAt, now));
  const change = changeOf(session, card);
  const phase = phaseOf(session, steps, change);
  const meta = phases[phase];
  const demo = session?.costStatus === 'demo';
  const spend = spendOf(session);
  const working = steps.find(step => step.state === 'working' || step.state === 'asking');
  const round = ploeg?.item?.latestShift?.round || null;
  const current = working ? { role: working.role, mode: working.mode, runId: working.id, startedAt: working.startedAt, seconds: working.seconds, round, activity: lastActivity(events, working.id, working.mode) } : null;
  const lastReader = [...steps].reverse().find(step => step.mode === 'read' && step.verdict);
  const approved = lastReader?.verdict.key === 'approve';
  const writer = [...steps].reverse().find(step => step.mode === 'write' && step.state === 'done');
  const achieved = lastReader ? `${capital(lastReader.role)} ${verdictWords[lastReader.verdict.key] || lastReader.verdict.key}${lastReader.verdict.recorded ? '' : ' in its transcript'}` : writer ? `${capital(writer.role)} finished` : '';
  const changed = changeText(change);
  let headline, short, next;
  switch (phase) {
    case 'ready': headline = 'Ready to start · nothing has run'; short = 'Ready to start'; next = 'Start the crew when the brief is right.'; break;
    case 'preparing': headline = 'Preparing the workspace'; short = 'Preparing the workspace'; next = 'The first Role starts as soon as the workspace is ready.'; break;
    case 'working': headline = [`${capital(current?.role || 'The crew')} is working`, round ? `Round ${round}` : ''].filter(Boolean).join(' · '); short = `${capital(current?.role || 'The crew')} is working`; next = 'Nothing is needed from you now. Pause to steer.'; break;
    case 'asking': headline = `${capital(current?.role || 'The crew')} asks you a question`; short = 'Waiting for your answer'; next = 'Nothing continues until you answer.'; break;
    case 'capturing': headline = 'Capturing the change for review'; short = 'Capturing the change'; next = 'The change is ready to view in a moment.'; break;
    case 'paused': { const held = steps.find(step => step.state === 'paused'); headline = held ? `Paused while ${held.role} worked` : 'Paused'; } short = 'Paused'; next = 'Resume to continue; an instruction you add applies when it resumes.'; break;
    case 'stopped': {
      const delivered = change.pullRequest ? '' : approved && change.candidate === 'ready' ? 'captured, not finished yet' : approved ? 'the session stopped before finishing' : `stopped: ${reason?.short || 'interrupted'}`;
      headline = [approved ? `${capital(lastReader.role)} approved the change` : achieved, delivered || `stopped: ${reason?.short || 'interrupted'}`].filter(Boolean).join(' · ');
      short = lastReader ? `Stopped · ${lower(achieved)}` : reason ? `Stopped · ${reason.short}` : 'Stopped';
      const offered = recoveryActions(recovery);
      const why = reason?.cause || reason?.sentence;
      next = recovery?.summary ? `${why ? `${why} ` : ''}${recovery.summary}` : `${reason?.sentence || 'Execution stopped.'} ${offered.size ? 'You can act on it from here.' : approved ? 'This workbench does not offer delivery of approved work yet; Investigate shows the evidence, and the earlier Runs stay.' : 'Investigate shows the evidence; the earlier Runs stay.'}`;
      break;
    }
    case 'failed': headline = `${session.failure?.stage ? `${capital(String(session.failure.stage).replaceAll('_', ' '))} failed` : 'Failed'}${session.failure?.message ? `: ${session.failure.message}` : session.blocker ? `: ${session.blocker}` : ''}`; short = 'Failed'; next = session.failure?.remediation || 'Investigate to see why; nothing retries by itself.'; break;
    case 'review': headline = ['Ready for your review', achieved && lastReader ? lower(achieved) : '', changed].filter(Boolean).join(' · '); short = 'Ready for your review'; next = 'View the change, then accept or reject it. Nothing was pushed or merged.'; break;
    case 'changes_requested': headline = `${capital(lastReader?.role || 'The reviewer')} requested changes${changed ? ` · ${changed}` : ''}`; short = 'Changes requested'; next = 'Read the findings, then run it again with an instruction, or reject it.'; break;
    case 'accepted': headline = `Accepted by ${session.review?.byName || 'a person'}`; short = 'Accepted'; next = session.review?.note || ''; break;
    case 'rejected': headline = `Rejected by ${session.review?.byName || 'a person'}`; short = 'Rejected'; next = session.review?.note || ''; break;
    case 'cancelled': headline = 'Cancelled'; short = 'Cancelled'; next = 'Its history and evidence stay. Start a new session to try again.'; break;
  }
  const notes = [];
  const facts = { push: (text, kind = 'other') => notes.push({ kind, text }) };
  for (const step of steps) {
    if (step.verdict && !step.verdict.recorded) facts.push(`${capital(step.role)} ${verdictWords[step.verdict.key] || step.verdict.key} in its own transcript before it was cut off; no finished Run recorded that verdict. It is evidence for your review, not a decision.`, 'verdict');
  }
  const ploegRunning = (ploeg?.runs || []).filter(entry => entry?.state === 'running' || entry?.listedAs === 'running');
  if (ploegRunning.length && !sessionActive) facts.push(`Ploeg still lists ${ploegRunning.length === 1 ? `its ${ploegRunning[0].role || 'operator'} Run` : `${ploegRunning.length} Runs`} as running; this session stopped${reason?.at ? ` at ${time(reason.at)}` : ''}.`);
  if (!demo && change.candidate !== 'ready' && ['stopped', 'failed'].includes(phase) && (writer || change.files)) facts.push(recoveryActions(recovery).has('capture') ? 'The change is not captured yet. Capture it to read it before you deliver; that makes no model call.' : recoveryActions(recovery).has('deliver') ? 'No candidate was captured yet, so the change is only in the Run\'s evidence. Delivering captures it from the workspace first.' : 'No candidate was captured, so the change is only in the Run\'s evidence.', 'capture');
  const actions = actionsFor(phase, session, { reason, change, approved, unrecorded: Boolean(lastReader && !lastReader.verdict.recorded), viewer, demo, budget: spend.budgetUsd, recovery });
  const activity = phase === 'working' ? `${capital(current?.role || 'The crew')} is working` : phase === 'preparing' ? 'Preparing the workspace' : short;
  const reviewer = [...steps].reverse().find(step => step.mode === 'read' && step.summary);
  const findings = reviewer ? { role: reviewer.role, verdict: reviewer.verdict, items: reportFindings(reviewer.summary) } : null;
  return { phase, meta, headline, short, next, reason, current, steps, change, spend, facts: notes.map(note => note.text), notes, actions, activity, demo,
    timeline: timelineOf(session, events), findings: findings?.items.length ? findings : null, checks: checksOf(session), roles: roleCosts(session, steps), workItemId: session?.execution?.workItemId ? String(session.execution.workItemId) : '', sessionId: session?.id || '' };
}

/** The session that drives Ploeg Work Item `workItemId`, newest first, or null. */
export function sessionForWorkItem(sessions, workItemId) {
  const id = String(workItemId ?? '');
  if (!id) return null;
  return [...(sessions || [])].filter(session => session?.execution && String(session.execution.workItemId) === id).sort((a, b) => (ms(b.createdAt) ?? 0) - (ms(a.createdAt) ?? 0))[0] || null;
}

/**
 * Ploeg's detail as every surface should show it: a Run Ploeg still lists as running reads `stopped` (with `listedAs:
 * 'running'`) once its Work Item is not leased or the session that drives it stopped, and a Shift's Round is never
 * lower than the Rounds its own Runs report.
 */
export function reconcileDetail(detail, sessions = []) {
  if (!detail?.item) return detail;
  const session = sessionForWorkItem(sessions, detail.item.id);
  const stopped = detail.item.state !== 'leased' || Boolean(session && !active.includes(session.status));
  const runs = (detail.runs || []).map(run => run?.state === 'running' && stopped ? { ...run, state: 'stopped', listedAs: 'running' } : run);
  const roundOf = shift => shift ? { ...shift, round: Math.max(Number(shift.round) || 0, ...runs.filter(run => !shift.id || !run.shiftId || String(run.shiftId) === String(shift.id)).map(run => Number(run.round) || 0)) } : shift;
  return { ...detail, runs, shifts: (detail.shifts || []).map(roundOf), item: { ...detail.item, latestShift: roundOf(detail.item.latestShift) } };
}

/** Whether a Run on Ploeg's detail is really running: only while its Work Item is leased. */
export function ploegRunActive(item, run) {
  return run?.state === 'running' && item?.state === 'leased';
}

/** Which Now group a session belongs to by its progress: waiting on you, ready for review, running, or none. */
export function progressGroup(progress) {
  if (['asking', 'stopped', 'failed', 'changes_requested'].includes(progress?.phase)) return 'needs';
  if (progress?.phase === 'review') return 'review';
  if (['preparing', 'working', 'capturing'].includes(progress?.phase)) return 'running';
  return null;
}

/**
 * The outcome of a session as Markdown, for the end of a turn in the Agents window: the headline, the steps, the
 * change, spend against budget, why it ended and what to do next, with a link to the session page. With `nextSteps`
 * false the chat offers the next steps as a choice of its own, so the outcome says only why it ended.
 */
export function outcomeMarkdown(progress, { sessionUrl = '', nextSteps = true } = {}) {
  const label = progress.meta.label;
  const headline = progress.headline === label ? '' : progress.headline.startsWith(`${label} · `) ? progress.headline.slice(label.length + 3) : progress.headline;
  const lines = [`**${label}**${headline ? ` · ${headline}` : ''}`];
  if (progress.steps.length) lines.push('', ...progress.steps.map(step => `- **${step.role}** (${step.mode === 'read' ? 'reader' : 'writer'}): ${step.label.toLowerCase()}${step.verdict ? `, ${step.verdict.label.toLowerCase()}${step.verdict.recorded ? '' : ' in its transcript'}` : ''}`));
  const change = changeText(progress.change);
  const details = [change ? `Change: ${change}${progress.change.branch ? ` on \`${progress.change.branch}\`` : ''}` : '', progress.change.pullRequest?.url ? `Pull request: [#${progress.change.pullRequest.number}](${progress.change.pullRequest.url})` : '', `Spend: ${progress.spend.text}${progress.spend.note ? ` (${progress.spend.note})` : ''}`];
  lines.push('', ...details.filter(Boolean));
  const why = nextSteps ? progress.next : progress.reason?.sentence;
  if (why) lines.push('', why);
  const actions = nextSteps ? progress.actions.filter(action => !['open-session', 'cancel'].includes(action.id)).map(action => action.label) : [];
  if (actions.length) lines.push('', `Next: ${actions.join(' · ')}${sessionUrl ? ` — in VS Code's Work Item view or on [the session page](${sessionUrl})` : ''}.`);
  else if (sessionUrl) lines.push('', `[Open the session page](${sessionUrl})`);
  return lines.join('\n');
}
