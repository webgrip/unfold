import { startedBy } from './collisions.js';

const toMs = value => { if (typeof value === 'number') return Number.isFinite(value) ? value : null; const at = Date.parse(value ?? ''); return Number.isFinite(at) ? at : null; };
const openStates = new Set(['working', 'waiting', 'idle']);
const harnessNames = { 'claude-code': 'Claude Code', opencode: 'OpenCode', codex: 'Codex', acp: 'ACP agent' };
const harnessName = harness => harnessNames[harness] ?? String(harness || 'Agent');
const overlap = (a, b) => Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from));
const touches = (a, b) => a.from <= b.to && b.from <= a.to;

/**
 * The attempts (Shifts) of a Work Item as time windows, oldest first, numbered as the value stream numbers them. An
 * open Shift runs until `now`.
 * @param {object} detail A `GET /api/ploeg/work-items/<id>` response.
 * @param {number} now Epoch milliseconds.
 * @returns {{ id: string, attempt: number, from: number, to: number, open: boolean, branch: string }[]}
 */
export function shiftWindows(detail, now) {
  return (detail?.shifts ?? []).filter(shift => toMs(shift.openedAt) !== null).sort((a, b) => toMs(a.openedAt) - toMs(b.openedAt)).map((shift, index) => ({
    id: String(shift.id), attempt: index + 1, from: toMs(shift.openedAt), to: shift.closedAt ? Math.max(toMs(shift.closedAt) ?? now, toMs(shift.openedAt)) : now, open: !shift.closedAt, branch: String(shift.branch ?? ''),
  }));
}

/**
 * The Rounds of each attempt as time windows: from the first Run of the Round starting to the last one finishing, or
 * `now` while one still runs. A Round without a started Run has no window.
 * @returns {{ shiftId: string, round: number, from: number, to: number, runIds: string[] }[]}
 */
export function roundWindows(detail, now) {
  const rounds = new Map();
  for (const run of detail?.runs ?? []) {
    const from = toMs(run.startedAt);
    if (from === null || !run.round) continue;
    const to = run.state === 'running' ? now : toMs(run.finishedAt) ?? from;
    const key = `${run.shiftId ?? ''}#${run.round}`;
    const known = rounds.get(key) ?? { shiftId: String(run.shiftId ?? ''), round: Number(run.round), from, to, runIds: [] };
    known.from = Math.min(known.from, from);
    known.to = Math.max(known.to, to);
    known.runIds.push(String(run.id));
    rounds.set(key, known);
  }
  return [...rounds.values()].sort((a, b) => a.from - b.from);
}

/**
 * When a Linked Session was open: from its start to its end, to `now` while it still works, waits or sits idle, or to
 * when it was last heard from once stale. Null without a start.
 * @returns {{ from: number, to: number, open: boolean } | null}
 */
export function sessionWindow(session, now) {
  const from = toMs(session?.startedAt);
  if (from === null) return null;
  const open = openStates.has(session.state) && !session.endedAt;
  const to = open ? now : toMs(session.endedAt) ?? toMs(session.lastSeenAt) ?? from;
  return { from, to: Math.max(from, to), open };
}

/**
 * Where one Linked Session sits in a Work Item's story, derived from time alone and never stored: the attempt whose
 * open window it overlaps most (`during`), and in it the Round it overlaps most, or none when it fell between Rounds.
 * A session that overlaps no attempt sits `before` the first, `after` the last, or `between` two (after `shiftId`);
 * on a Work Item without attempts it is `alone`. `overlaps` lists the Runs of the Work Item that ran while it was open.
 * @param {object} session A presented Linked Session.
 * @param {object} detail The Work Item detail.
 * @param {number} now Epoch milliseconds.
 * @returns {{ sessionId: string, place: 'during'|'before'|'between'|'after'|'alone'|'unknown', shiftId: string|null, attempt: number|null, round: number|null, overlaps: { runId: string, role: string, round: number }[] }}
 */
export function attachSession(session, detail, now) {
  const window = sessionWindow(session, now);
  const empty = { sessionId: String(session?.id ?? ''), place: 'unknown', shiftId: null, attempt: null, round: null, overlaps: [] };
  if (!window) return empty;
  const runs = (detail?.runs ?? []).filter(run => toMs(run.startedAt) !== null);
  const overlaps = runs.filter(run => touches(window, { from: toMs(run.startedAt), to: run.state === 'running' ? now : toMs(run.finishedAt) ?? toMs(run.startedAt) }))
    .map(run => ({ runId: String(run.id), role: String(run.role || 'agent'), round: Number(run.round) || 0 }));
  const shifts = shiftWindows(detail, now);
  if (!shifts.length) return { ...empty, place: 'alone', overlaps };
  const ranked = shifts.map(shift => ({ shift, share: overlap(window, shift) })).filter(entry => entry.share > 0 || touches(window, entry.shift)).sort((a, b) => b.share - a.share || a.shift.from - b.shift.from);
  if (!ranked.length) {
    if (window.to < shifts[0].from) return { ...empty, place: 'before', overlaps };
    const previous = shifts.filter(shift => shift.to < window.from).at(-1);
    return previous === shifts.at(-1) ? { ...empty, place: 'after', shiftId: previous.id, attempt: previous.attempt, overlaps } : { ...empty, place: 'between', shiftId: previous?.id ?? null, attempt: previous?.attempt ?? null, overlaps };
  }
  const shift = ranked[0].shift;
  const round = roundWindows(detail, now).filter(entry => entry.shiftId === shift.id && touches(window, entry)).sort((a, b) => overlap(window, b) - overlap(window, a) || a.from - b.from)[0];
  return { sessionId: empty.sessionId, place: 'during', shiftId: shift.id, attempt: shift.attempt, round: round?.round ?? null, overlaps };
}

/** Where a session sits, in words: `During attempt 2, Round 3`, `Before Ploeg's first attempt`, `Between attempts 1 and 2`. */
export function attachmentWords(attached) {
  if (attached.place === 'during') return `During attempt ${attached.attempt}${attached.round ? `, Round ${attached.round}` : ', between Rounds'}`;
  if (attached.place === 'before') return 'Before Ploeg’s first attempt';
  if (attached.place === 'after') return `After Ploeg’s last attempt (${attached.attempt})`;
  if (attached.place === 'between') return attached.attempt ? `Between attempts ${attached.attempt} and ${attached.attempt + 1}` : 'Between attempts';
  if (attached.place === 'alone') return 'Ploeg has not started an attempt';
  return '';
}

/**
 * The moments control moved between the people and Ploeg on one Work Item, oldest first. `handoff`: a session handed
 * it to Ploeg with "Let Ploeg finish this" (the next attempt opened after it is `shiftId`). `claim`: a session started
 * the Run `runId` that waited for its person with `/unfold:start`. `take-over`: a session started on the branch of
 * Ploeg's attempt after one of its Runs finished and while none ran, as "Continue in my Claude Code" does. `overlap`:
 * a session started while a Run it did not start itself was working. `from` and `to` name the tracks it connects.
 * @returns {{ kind: 'handoff'|'claim'|'take-over'|'overlap', at: number, sessionId: string, shiftId?: string|null, runId?: string, role?: string, from: 'people'|'ploeg', to: 'people'|'ploeg', label: string }[]}
 */
export function handoverMarks(detail, sessions, now) {
  const id = String(detail?.item?.id ?? '');
  const shifts = shiftWindows(detail, now);
  const runs = (detail?.runs ?? []).filter(run => toMs(run.startedAt) !== null);
  const roleOf = runId => runs.find(run => String(run.id) === String(runId))?.role || 'agent';
  const marks = [];
  for (const session of sessions ?? []) {
    const who = session.mine ? 'You' : session.ownerName || 'Someone';
    for (const handover of session.handovers ?? []) {
      const at = toMs(handover.at);
      if (at === null || String(handover.workItemId) !== id) continue;
      if (handover.kind === 'handoff') {
        const next = shifts.find(shift => shift.from >= at) ?? null;
        marks.push({ kind: 'handoff', at, sessionId: String(session.id), shiftId: next?.id ?? null, from: 'people', to: 'ploeg', label: `${who} let Ploeg finish this${next ? `: attempt ${next.attempt} read the hand-off note` : '; no attempt has opened since'}` });
      } else if (handover.kind === 'claim') {
        marks.push({ kind: 'claim', at, sessionId: String(session.id), runId: String(handover.runId ?? ''), role: roleOf(handover.runId), from: 'people', to: 'ploeg', label: `${who} started the ${roleOf(handover.runId)} Run with /unfold:start` });
      }
    }
    const start = toMs(session.startedAt);
    if (start === null) continue;
    const working = runs.filter(run => toMs(run.startedAt) <= start && (run.state === 'running' ? now : toMs(run.finishedAt) ?? 0) > start);
    const foreign = working.filter(run => !startedBy(session, { id: String(run.id), workItemId: id, startedAt: run.startedAt, shiftOpenedAt: (detail.shifts ?? []).find(shift => String(shift.id) === String(run.shiftId))?.openedAt ?? null }));
    if (foreign.length) {
      marks.push({ kind: 'overlap', at: start, sessionId: String(session.id), runId: String(foreign[0].id), role: foreign[0].role || 'agent', from: 'ploeg', to: 'people', label: `${who} started a ${harnessName(session.harness)} session while the ${foreign[0].role || 'agent'} Run worked` });
      continue;
    }
    const onBranch = session.branch && shifts.some(shift => shift.branch === session.branch && shift.from <= start);
    const finished = runs.filter(run => run.state !== 'running' && (toMs(run.finishedAt) ?? Infinity) <= start).sort((a, b) => toMs(b.finishedAt) - toMs(a.finishedAt))[0];
    if (onBranch && finished) marks.push({ kind: 'take-over', at: start, sessionId: String(session.id), runId: String(finished.id), role: finished.role || 'agent', from: 'ploeg', to: 'people', label: `${who} continued on Ploeg’s branch ${session.branch} in ${harnessName(session.harness)}` });
  }
  return marks.sort((a, b) => a.at - b.at);
}

/**
 * The commit spine: every commit Unfold knows on the Work Item, oldest first, with who wrote its lines. The commits
 * come from the linked sessions, attributed from their Agent Trace records: `agent` when the record holds AI-written
 * lines, `person` when it holds none, `unknown` without a record. Ploeg reports no commits of its own Runs to
 * Unfold, so each push to the pull request is a `push` dot instead, `ploeg` while one of its Runs worked (that Run's
 * Role), `person` while only a linked session on the branch was open, `unknown` otherwise.
 * @param {object} detail The Work Item detail.
 * @param {object[]} sessions Presented Linked Sessions linked to it.
 * @param {object|null} stream Its value stream, for the pull request's pushes.
 * @param {number} now Epoch milliseconds.
 * @returns {{ kind: 'commit'|'push', at: number, by: 'ploeg'|'agent'|'person'|'unknown', who: string, label: string, sha?: string, sessionId?: string, runId?: string }[]}
 */
export function commitSpine(detail, sessions, stream, now) {
  const dots = [];
  const seen = new Set();
  for (const session of sessions ?? []) {
    const owner = session.mine ? 'you' : session.ownerName || 'someone';
    for (const commit of Array.isArray(session.commits) ? session.commits : []) {
      const at = toMs(commit.at);
      if (at === null || !commit.sha || seen.has(commit.sha)) continue;
      seen.add(commit.sha);
      const traced = commit.aiLines !== null && commit.aiLines !== undefined;
      const by = !traced ? 'unknown' : commit.aiLines > 0 ? 'agent' : 'person';
      const who = by === 'agent' ? `${harnessName(session.harness)} on ${owner === 'you' ? 'your' : `${owner}’s`} machine` : owner;
      const lines = by === 'agent' ? `${commit.aiLines} AI-written ${commit.aiLines === 1 ? 'line' : 'lines'} by ${who}` : by === 'person' ? `written by ${who}, no AI-written lines` : 'no Agent Trace record';
      dots.push({ kind: 'commit', at, by, who, sha: String(commit.sha), sessionId: String(session.id), label: `Commit ${String(commit.sha).slice(0, 7)}${commit.subject ? ` ${commit.subject}` : ''} · ${lines}` });
    }
  }
  const runs = (detail?.runs ?? []).filter(run => toMs(run.startedAt) !== null);
  const pushes = (stream?.lanes ?? []).filter(lane => lane.group === 'pullRequest').flatMap(lane => lane.marks ?? []).filter(mark => mark.label === 'Pushed' || mark.label === 'Force-pushed');
  const branches = new Set(shiftWindows(detail, now).map(shift => shift.branch).filter(Boolean));
  for (const push of pushes) {
    const at = toMs(push.at);
    if (at === null) continue;
    const run = runs.find(each => toMs(each.startedAt) <= at && (each.state === 'running' ? now : toMs(each.finishedAt) ?? 0) >= at);
    const person = !run && (sessions ?? []).find(session => { const window = sessionWindow(session, now); return window && window.from <= at && window.to >= at && (!session.branch || branches.has(session.branch)); });
    const by = run ? 'ploeg' : person ? 'person' : 'unknown';
    const who = run ? `Ploeg’s ${run.role || 'agent'} Run` : person ? (person.mine ? 'you' : person.ownerName || 'someone') : 'not known';
    dots.push({ kind: 'push', at, by, who, ...(run ? { runId: String(run.id) } : {}), ...(person ? { sessionId: String(person.id) } : {}), label: `${push.label} to the pull request · ${run ? `while ${who} worked` : person ? `while only ${who === 'you' ? 'your' : `${who}’s`} session was open` : 'by someone Unfold cannot name'}` });
  }
  return dots.sort((a, b) => a.at - b.at);
}

/**
 * The two tracks of one Work Item: Ploeg's attempts and Runs, and the people's Linked Sessions with where each sits,
 * one row per person and harness, the hand-overs between them and the commit spine they share.
 * @param {{ detail: object, sessions?: object[], stream?: object|null, now: number }} input
 */
export function workTracks({ detail, sessions = [], stream = null, now }) {
  const list = (sessions ?? []).filter(session => sessionWindow(session, now));
  const rows = new Map();
  for (const session of list) {
    const key = `${session.mine ? 'you' : session.ownerName || 'someone'}#${session.harness || 'agent'}`;
    const row = rows.get(key) ?? { key, person: session.mine ? 'You' : session.ownerName || 'Someone', harness: harnessName(session.harness), sessions: [] };
    row.sessions.push({ session, window: sessionWindow(session, now), attached: attachSession(session, detail, now) });
    rows.set(key, row);
  }
  return { shifts: shiftWindows(detail, now), rounds: roundWindows(detail, now), people: [...rows.values()], handovers: handoverMarks(detail, list, now), spine: commitSpine(detail, list, stream, now) };
}
