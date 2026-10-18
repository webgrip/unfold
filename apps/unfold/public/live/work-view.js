import { liveSentence } from './parts.js';

const providers = Object.freeze({ vikunja: 'Vikunja', github: 'GitHub', forgejo: 'Forgejo', gitlab: 'GitLab', jira: 'Jira', linear: 'Linear', clickup: 'ClickUp', demo: 'Demo tracker', manual: 'Manual' });
const harnesses = Object.freeze({ 'claude-code': 'Claude Code', claude_code: 'Claude Code', opencode: 'OpenCode', codex: 'Codex', openhands: 'OpenHands', cursor: 'Cursor' });

/** The gap in seconds after which a timeline folds the quiet time between two entries shut. */
export const foldGapSeconds = 10 * 60;

const toMs = value => { const at = typeof value === 'number' ? value : Date.parse(value ?? ''); return Number.isFinite(at) ? at : null; };
const isAmount = value => typeof value === 'number' && Number.isFinite(value);
const initial = name => String(name || '?').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?';
const conditionHeading = /^#{1,6}\s*(acceptance|done when|definition of done|verification|acceptatie)/i;
const listItem = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.+)$/;

/**
 * The brief of a Work Item and the acceptance conditions it lists: the list items under the first heading that names
 * acceptance, done-when, the definition of done or verification. A brief without such a heading has no conditions.
 * @param {string} text Markdown.
 * @returns {{ text: string, conditions: string[] }}
 */
export function briefOf(text) {
  const source = String(text ?? '').trim();
  const lines = source.split('\n');
  const start = lines.findIndex(line => conditionHeading.test(line.trim()));
  if (start < 0) return { text: source, conditions: [] };
  const conditions = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line.trim())) break;
    const match = listItem.exec(line);
    if (match) conditions.push(match[1].trim());
  }
  return { text: lines.slice(0, start).join('\n').trim() || source, conditions };
}

function origin(detail, session) {
  const item = detail.item;
  if (session) return { kind: 'unfold', label: `Started in Unfold${session.ownerName ? ` by ${session.ownerName}` : ''}`, by: session.ownerName || '', initials: initial(session.ownerName || 'Unfold'), sessionId: session.id };
  if (item.parentId || item.followUpOf) return { kind: 'follow-up', label: `Follow-Up of #${item.parentId ?? item.followUpOf}`, by: '', initials: 'F', sessionId: null };
  const provider = providers[item.provider] ?? String(item.provider ?? 'Tracker');
  return { kind: 'tracker', label: `From ${provider} #${item.externalId}`, by: '', initials: provider[0] ?? 'T', url: item.url || null, sessionId: null };
}

function conditionsOf(brief, proofs) {
  return brief.conditions.map((text, index) => {
    const found = proofs.filter(proof => proof.condition === index);
    const state = found.some(proof => proof.state === 'proven') ? 'proven' : found.some(proof => proof.state === 'claimed') ? 'claimed' : found.some(proof => proof.state === 'running') ? 'running' : 'open';
    return { index, text, state, proofs: found.map(proof => proof.label), note: found.find(proof => proof.note)?.note ?? '' };
  });
}

function runEntry(run) {
  const ending = run.state === 'running' ? 'live' : run.machine ? 'machine' : run.status === 'failed' || run.status === 'stuck' ? 'failed' : run.status === 'cancelled' ? 'cancelled' : run.status === 'pending' ? 'pending' : 'done';
  return { kind: 'run', move: null, at: run.startedAt, end: run.finishedAt, id: run.id, n: run.n, attempt: run.attempt, role: run.role, writes: run.writes, ending, seconds: run.seconds, costUsd: run.costUsd, tokensIn: run.tokensIn, failure: run.failure?.label ?? '', verdict: run.verdict };
}

function burstsOf(entries) {
  const out = [];
  for (const entry of entries) {
    const last = out.at(-1);
    const same = last?.kind === 'run' && entry.kind === 'run' && last.ending === 'machine' && entry.ending === 'machine' && last.role === entry.role && last.attempt === entry.attempt;
    if (!same) { out.push(entry.kind === 'run' ? { ...entry, count: 1, firstN: entry.n, members: [{ id: entry.id, n: entry.n }] } : entry); continue; }
    out[out.length - 1] = { ...last, id: entry.id, members: [...last.members, { id: entry.id, n: entry.n }], end: entry.end, seconds: last.seconds + entry.seconds, costUsd: last.costUsd === null && entry.costUsd === null ? null : (last.costUsd ?? 0) + (entry.costUsd ?? 0), n: entry.n, count: last.count + 1 };
  }
  return out;
}

function entriesOf(live, { detail, brief, asks, context, linked, messages, origin: from }) {
  const list = [];
  const created = toMs(detail.item.createdAt);
  list.push({ kind: 'brief', at: created, who: from.by || 'The tracker', text: brief.text, conditions: brief.conditions.length });
  for (const attempt of live.attempts) list.push({ kind: 'admit', at: attempt.openedAt, attempt: attempt.n, budgetUsd: attempt.budgetUsd });
  const move = live.moves.findLast(each => each.live) ?? null;
  for (const run of live.runs) if (run.startedAt !== null) list.push({ ...runEntry(run), move: run.state === 'running' && move ? { title: move.title, calls: move.calls.length } : null });
  for (const file of context?.items ?? []) list.push({ kind: 'context', at: toMs(file.addedAt), who: file.addedBy || 'Someone', name: file.name, note: file.note || '', steering: file.phase === 'while_steering' });
  for (const ask of asks?.items ?? []) list.push({ kind: 'ask', at: toMs(ask.createdAt), who: ask.askerName || 'Someone', question: ask.question, answer: ask.status === 'answered' ? ask.answer : '', status: ask.status, fromRecord: ask.source === 'record', costUsd: isAmount(ask.costUsd) ? ask.costUsd : null });
  for (const message of messages) {
    const at = toMs(message.at);
    const flying = live.runs.find(run => run.startedAt !== null && at !== null && run.startedAt <= at && (run.finishedAt === null || run.finishedAt > at)) ?? null;
    const reader = live.runs.find(run => run.startedAt !== null && at !== null && run.startedAt >= at) ?? null;
    list.push({ kind: 'steer', at, who: message.by || 'You', text: message.text, flying: flying ? { role: flying.role, n: flying.n, attempt: flying.attempt } : null, readBy: reader ? { role: reader.role, n: reader.n, attempt: reader.attempt, at: reader.startedAt } : null });
  }
  for (const session of linked?.sessions ?? []) list.push({ kind: 'linked', at: toMs(session.lastSeenAt ?? session.startedAt), who: session.ownerName || 'Someone', harness: harnesses[session.harness] ?? String(session.harness ?? 'Agent'), branch: session.branch || '', commits: Array.isArray(session.commits) ? session.commits.length : Number(session.commits) || 0, state: session.state || '' });
  const ordered = burstsOf(list.filter(entry => entry.at !== null).sort((a, b) => a.at - b.at));
  const firstRun = live.runs.find(run => run.startedAt !== null)?.startedAt ?? null;
  const withFolds = [];
  let busyUntil = null;
  for (const entry of ordered) {
    if (busyUntil !== null && (entry.at - busyUntil) / 1000 >= foldGapSeconds) {
      const waiting = firstRun === null || entry.at <= firstRun;
      withFolds.push({ kind: 'fold', at: busyUntil, seconds: Math.round((entry.at - busyUntil) / 1000), reason: waiting ? 'Waiting for a worker' : 'Between Runs' });
    }
    const until = entry.kind === 'run' && entry.ending === 'live' ? live.now : entry.end ?? entry.at;
    busyUntil = Math.max(busyUntil ?? until, until);
    withFolds.push(entry);
  }
  return withFolds;
}

function decisionsOf(live, { session, linked, sentence }) {
  const list = [];
  if (live.state === 'needs_human' || live.state === 'stale') list.push({ kind: 'stop', tone: live.state === 'stale' ? 'severe' : 'attention', title: sentence.head, detail: sentence.sub });
  if (live.state === 'awaiting_review') list.push({ kind: 'review', tone: 'review', title: sentence.head, detail: sentence.sub, pullRequest: live.pullRequest });
  if (session && session.status === 'waiting_input') list.push({ kind: 'session', tone: 'attention', title: 'An agent asked you something', detail: 'Answer it on this page; the Run waits until you do.', sessionId: session.id });
  for (const each of linked?.sessions ?? []) if (each.waitingFor) list.push({ kind: 'linked', tone: 'attention', title: `${each.ownerName || 'A linked session'} waits for ${each.waitingFor}`, detail: `${harnesses[each.harness] ?? 'An agent'} on ${each.branch || 'its branch'}. Unfold does not run it, so answer it where it runs.`, sessionId: each.id });
  return list;
}

function rolesOf(live) {
  const roles = new Map();
  for (const run of live.runs) {
    const seat = roles.get(run.role) ?? { role: run.role, initials: initial(run.role), runs: 0, lost: 0, seconds: 0, costUsd: null, writes: run.writes, status: 'done', live: false };
    seat.runs += 1;
    if (run.machine) seat.lost += 1;
    seat.seconds += run.seconds;
    if (run.costUsd !== null) seat.costUsd = (seat.costUsd ?? 0) + run.costUsd;
    seat.status = run.state === 'running' ? 'live' : run.machine ? 'machine' : run.status;
    seat.live = run.state === 'running';
    roles.set(run.role, seat);
  }
  return [...roles.values()];
}

function leaseOf(live) {
  if (!live.lease) return { state: live.runs.some(run => run.failure?.key === 'lease_lost') ? 'lost' : 'free', holder: null, branch: live.branch, secondsLeft: null, share: null };
  const total = live.lease.expiresAt !== null && live.lease.renewedAt !== null ? Math.max(1, (live.lease.expiresAt - live.lease.renewedAt) / 1000) : null;
  const left = live.lease.secondsLeft;
  return { state: left !== null && left <= 0 ? 'expired' : 'held', holder: live.running?.role ?? null, branch: live.branch, secondsLeft: left, share: total !== null && left !== null ? Math.max(0, Math.min(1, left / total)) : null };
}

function tapeOf(live, asks) {
  const segments = live.runs.filter(run => run.costUsd !== null && run.costUsd > 0).map(run => ({ kind: run.state === 'running' ? 'live' : run.machine ? 'lost' : 'run', usd: run.costUsd, label: `${run.role} · Run ${run.n}${run.machine ? ' · lost to a machine' : ''}` }));
  const asked = (asks?.items ?? []).reduce((sum, ask) => sum + (isAmount(ask.costUsd) ? ask.costUsd : 0), 0);
  if (asked > 0) segments.push({ kind: 'ask', usd: asked, label: 'Asks' });
  const held = live.running && live.spend.heldUsd !== null && live.spend.attemptUsd !== null ? Math.max(0, live.spend.heldUsd - live.spend.attemptUsd) : 0;
  if (held > 0) segments.push({ kind: 'held', usd: held, label: 'Held for the running Run' });
  const total = segments.filter(segment => segment.kind !== 'held').reduce((sum, segment) => sum + segment.usd, 0);
  const scale = Math.max(total + held, live.spend.heldUsd ?? 0, 0.01);
  return { segments, totalUsd: segments.length ? total : null, heldUsd: held || null, budgetUsd: live.spend.heldUsd, scaleUsd: scale };
}

function presenceOf(live, linked, viewer) {
  const list = [{ kind: 'person', name: viewer, initials: initial(viewer), detail: 'viewing now' }];
  if (live.running) list.push({ kind: 'agent', name: live.running.role, initials: initial(live.running.role), detail: 'working now' });
  for (const each of linked?.sessions ?? []) if (each.state !== 'ended') list.push({ kind: 'linked', name: `${harnesses[each.harness] ?? 'Agent'}${each.ownerName ? ` · ${each.ownerName}` : ''}`, initials: initial(harnesses[each.harness] ?? 'Agent'), detail: each.branch ? `linked · ${each.branch}` : 'linked' });
  return list;
}

/**
 * One view of a Work Item for the Work Item pages: the live model plus everything people did around it. Where the
 * Work Item came from (a session started in Unfold, a tracker task or a Follow-Up), its brief and acceptance
 * conditions, one timeline of the brief, the attempts, the Runs, context, Asks, steering and linked agent sessions
 * with long quiet stretches folded, what waits on a person, each Role, the lease, the spend as a tape and who
 * is here now.
 * @param {object} input
 * @param {object} input.live A `liveModel` result.
 * @param {object} input.detail The Ploeg Work Item detail the live model was built from.
 * @param {{ items: object[] }|null} [input.asks] Unfold's Asks about this Work Item.
 * @param {{ items: object[] }|null} [input.context] The context files Ploeg keeps for it.
 * @param {{ sessions: object[] }|null} [input.linked] Agent sessions people linked to it.
 * @param {object[]} [input.sessions] Unfold sessions; the one whose execution names this Work Item is its origin.
 * @param {{ at: string, text: string, by?: string }[]} [input.messages] Steering messages sent to that session.
 * @param {{ condition: number, label: string, state: 'proven'|'claimed'|'running', note?: string }[]} [input.proofs]
 *   Proof for each acceptance condition. Proposed: Ploeg does not report it yet, so the app passes none.
 * @param {string} [input.viewer] The signed-in person's name.
 * @param {boolean} [input.canOperate] Whether the signed-in person may steer and add context; a viewer only reads and asks.
 * @returns {object}
 */
export function workView({ live, detail, asks = null, context = null, linked = null, sessions = [], messages = [], proofs = [], viewer = 'You', canOperate = true }) {
  const session = (sessions ?? []).find(each => String(each.execution?.workItemId ?? '') === String(detail.item.id)) ?? null;
  const from = origin(detail, session);
  const brief = briefOf(detail.item.descriptionMarkdown ?? detail.item.description ?? session?.objective ?? '');
  const sentence = liveSentence(live);
  const closed = ['done', 'withdrawn'].includes(live.state);
  return {
    live,
    id: live.id,
    title: live.title,
    origin: from,
    session: session ? { id: session.id, status: session.status } : null,
    sentence,
    brief: { text: brief.text, conditions: conditionsOf(brief, proofs), proofsReported: proofs.length > 0 },
    entries: entriesOf(live, { detail, brief, asks, context, linked, messages, origin: from }),
    decisions: decisionsOf(live, { session, linked, sentence }),
    roles: rolesOf(live),
    lease: leaseOf(live),
    tape: tapeOf(live, asks),
    presence: presenceOf(live, linked, viewer),
    allowance: asks?.allowance ?? null,
    canSteer: Boolean(session) && !closed && canOperate,
    canAddContext: !closed && canOperate,
    steerReason: closed ? 'This Work Item is closed.' : !canOperate ? 'Your role reads this Work Item; a developer steers it.' : session ? '' : `Steering reaches Work Items started in Unfold. This one came ${from.kind === 'tracker' ? 'from a tracker task' : 'from other work'}; add context instead, and the next Run reads it.`,
    canAsk: Boolean(asks) && !asks.error,
    closed,
  };
}
