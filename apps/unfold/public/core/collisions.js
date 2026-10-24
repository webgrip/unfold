import { escape } from './dom.js';
import { callout } from './ui.js';

/** The Linked Session states that still work a checkout: ended and stale sessions do not collide. */
export const liveLinkedStates = Object.freeze(['working', 'waiting', 'idle']);

const harnessNames = { 'claude-code': 'Claude Code' };

/** The Linked Session states that change a checkout while a Run works: an idle session edits nothing, so it never collides with a Run. */
export const busyLinkedStates = Object.freeze(['working', 'waiting']);

/** Whether a Linked Session is live: it works, waits for its person or sits idle, and has reported recently enough not to be stale. */
export function isLiveSession(session) { return liveLinkedStates.includes(session?.state); }

const toMs = value => { const at = Date.parse(value ?? ''); return Number.isFinite(at) ? at : null; };

/**
 * Whether a running Run is one the session itself started: the Run it claimed with `/unfold:start`, or a Run of an
 * attempt Ploeg opened after the session handed that Work Item to Ploeg with "Let Ploeg finish this".
 * @param {{ handovers?: { kind: 'handoff'|'claim', workItemId: string, at: string, runId?: string }[] }} session
 * @param {{ id: string, workItemId: string, shiftOpenedAt?: string|null, startedAt?: string|null }} run
 * @returns {boolean}
 */
export function startedBy(session, run) {
  return (session?.handovers ?? []).some(handover => {
    if (String(handover.workItemId) !== String(run.workItemId)) return false;
    if (handover.kind === 'claim') return String(handover.runId ?? '') === String(run.id);
    const handed = toMs(handover.at);
    const opened = toMs(run.shiftOpenedAt) ?? toMs(run.startedAt);
    return handover.kind === 'handoff' && handed !== null && opened !== null && opened >= handed;
  });
}

/** Whether a session and a running Run can step on each other: the session works or waits, and did not start that Run itself. */
export function clashesWithRun(session, run) { return busyLinkedStates.includes(session?.state) && !startedBy(session, run); }

/**
 * The `owner/repo` a repository address or a Ploeg target names, lowercased and without `.git`, so
 * `https://forgejo.example.org/webgrip/Unfold.git`, `forgejo.example.org:webgrip/unfold` and
 * `{ owner: 'webgrip', repo: 'unfold' }` are the same repository. Empty when it names none.
 * @param {string|{ owner?: string, repo?: string }|null|undefined} value
 * @returns {string}
 */
export function repositoryKey(value) {
  if (value && typeof value === 'object') return value.repo ? `${value.owner ? `${value.owner}/` : ''}${value.repo}`.toLowerCase().replace(/\.git$/, '') : '';
  const parts = String(value ?? '').trim().replace(/\.git$/i, '').replace(/\/+$/, '').split(/[/:]/).filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join('/').toLowerCase() : '';
}

/**
 * The running Ploeg Runs of one Work Item detail as collision subjects: each with its Work Item, Role, repository
 * (the Work Item's target), branch (its Shift's), when it started and when its Shift opened.
 * @param {object|null|undefined} detail A `GET /api/ploeg/work-items/<id>` response.
 * @returns {{ id: string, workItemId: string, role: string, repository: string, branch: string, startedAt: string|null, shiftOpenedAt: string|null }[]}
 */
export function runningRunsOf(detail) {
  if (!detail?.item) return [];
  const shifts = new Map((detail.shifts ?? []).map(shift => [String(shift.id), shift]));
  return (detail.runs ?? []).filter(run => run.state === 'running').map(run => ({
    id: String(run.id),
    workItemId: String(run.workItemId ?? detail.item.id),
    role: String(run.role ?? ''),
    repository: repositoryKey(detail.item.target),
    branch: String(shifts.get(String(run.shiftId))?.branch ?? ''),
    startedAt: run.startedAt ?? null,
    shiftOpenedAt: shifts.get(String(run.shiftId))?.openedAt ?? null,
  }));
}

function sessionMember(session) {
  return { kind: 'session', id: String(session.id), mine: Boolean(session.mine), who: session.mine ? 'you' : String(session.ownerName || 'someone'), harness: harnessNames[session.harness] ?? String(session.harness || 'Agent'), state: session.state, href: `#linked-session/${encodeURIComponent(session.id)}` };
}

function runMember(run) {
  return { kind: 'run', id: String(run.id), role: run.role || 'agent', workItemId: String(run.workItemId), href: `#work/${encodeURIComponent(run.workItemId)}` };
}

/**
 * Where two pieces of live work would step on each other: two live Linked Sessions, or a working or waiting Linked
 * Session and a running Ploeg Run it did not start itself, on the same Work Item, or on the same repository and
 * branch. An idle session collides only with other sessions, and a session never collides with the Run it claimed or
 * the Runs of the attempt it handed to Ploeg ({@link startedBy}). Each collision names what they share and its
 * members, sessions first. Every collision has at least one session; Runs Ploeg itself coordinates on one Work Item
 * never collide with each other alone. A branch collision whose members a Work Item collision already names is left
 * out, so one clash warns once. Sessions and Runs listed twice count once.
 * @param {{ sessions?: object[], runs?: { id: string, workItemId: string, role?: string, repository?: string, branch?: string }[] }} input
 * @returns {{ key: string, on: 'work-item'|'branch', workItemId?: string, repository?: string, branch?: string, members: object[] }[]}
 */
export function collisions({ sessions = [], runs = [] } = {}) {
  const live = [...new Map((sessions ?? []).filter(isLiveSession).map(session => [String(session.id), session])).values()];
  const running = [...new Map((runs ?? []).map(run => [String(run.id), run])).values()];
  const groups = new Map();
  const sessionsIn = new Map();
  const add = (key, base, member, session = null) => {
    if (session) sessionsIn.set(key, [...(sessionsIn.get(key) ?? []), session]);
    const group = groups.get(key) ?? { key, ...base, members: [] };
    if (!group.members.some(known => known.kind === member.kind && known.id === member.id)) group.members.push(member);
    groups.set(key, group);
  };
  for (const session of live) {
    for (const entry of session.workItems ?? []) add(`work-item:${entry.id}`, { on: 'work-item', workItemId: String(entry.id) }, sessionMember(session), session);
    const repository = repositoryKey(session.repository);
    if (repository && session.branch) add(`branch:${repository}#${session.branch}`, { on: 'branch', repository, branch: String(session.branch) }, sessionMember(session), session);
  }
  const meets = (key, run) => (sessionsIn.get(key) ?? []).some(session => clashesWithRun(session, run));
  for (const run of running) {
    const item = `work-item:${run.workItemId}`;
    if (meets(item, run)) add(item, { on: 'work-item', workItemId: String(run.workItemId) }, runMember(run));
    const repository = repositoryKey(run.repository);
    const branch = `branch:${repository}#${run.branch}`;
    if (repository && run.branch && meets(branch, run)) add(branch, { on: 'branch', repository, branch: String(run.branch) }, runMember(run));
  }
  const found = [...groups.values()].filter(group => group.members.length > 1 && group.members.some(member => member.kind === 'session'));
  const signature = group => group.members.map(member => `${member.kind}:${member.id}`).sort().join(',');
  const named = new Set(found.filter(group => group.on === 'work-item').map(signature));
  return found.filter(group => group.on === 'work-item' || !named.has(signature(group)));
}

/**
 * The collisions one Linked Session or one Work Item takes part in.
 * @param {ReturnType<typeof collisions>} found
 * @param {{ sessionId?: string, workItemId?: string }} subject
 */
export function collisionsOf(found, { sessionId, workItemId } = {}) {
  return found.filter(group => (sessionId && group.members.some(member => member.kind === 'session' && member.id === String(sessionId)))
    || (workItemId && (group.workItemId === String(workItemId) || group.members.some(member => member.kind === 'run' && member.workItemId === String(workItemId)))));
}

function memberWords(member) {
  if (member.kind === 'run') return `Ploeg’s ${member.role} Run`;
  return member.mine ? `your ${member.harness} session` : `${member.who}’s ${member.harness} session`;
}

/**
 * One collision in plain words, seen from `sessionId` when given: "Your Claude Code session and Ploeg's builder Run
 * both work Work Item 184." or "This session and sam's Claude Code session are both on webgrip/unfold, branch main."
 * @param {ReturnType<typeof collisions>[number]} group
 * @param {{ sessionId?: string }} [options]
 * @returns {string}
 */
export function collisionSentence(group, { sessionId } = {}) {
  const self = sessionId ? group.members.find(member => member.kind === 'session' && member.id === String(sessionId)) : null;
  const others = group.members.filter(member => member !== self).map(memberWords);
  const names = self ? ['this session', ...others] : others;
  const list = names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const where = group.on === 'work-item' ? `work Work Item ${group.workItemId}` : `are on ${group.repository}, branch ${group.branch}`;
  const verb = group.on === 'work-item' ? (names.length === 2 ? 'both ' : 'all ') : '';
  const sentence = group.on === 'work-item' ? `${list} ${verb}${where}.` : `${list} ${where}.`;
  return `${sentence[0].toUpperCase()}${sentence.slice(1)}`;
}

/**
 * A warning that live work collides, one line per collision with links to the other sessions and Runs, and what to do
 * about it. Empty when nothing collides.
 * @param {ReturnType<typeof collisions>} found
 * @param {{ sessionId?: string }} [options]
 * @returns {string}
 */
export function collisionCallout(found, { sessionId } = {}) {
  if (!found.length) return '';
  const links = group => group.members.filter(member => member.id !== String(sessionId ?? '') || member.kind !== 'session').map(member => `<a class="work-inline-link" href="${escape(member.href)}">${escape(member.kind === 'run' ? `${member.role} Run` : `${member.mine ? 'Your' : `${member.who}’s`} session`)}</a>`).join(' · ');
  const rows = found.map(group => `<li class="collision-row"><span>${escape(collisionSentence(group, { sessionId }))}</span> <span class="meta">${links(group)}</span></li>`).join('');
  const title = found.length === 1 ? 'Another agent works the same thing' : `Other agents work the same thing in ${found.length} places`;
  return `<div class="collision-warning" data-collisions="${found.length}">${callout({ tone: 'attention', icon: 'alert', title, body: `<ul class="collision-list">${rows}</ul><p class="meta">Their edits and pushes can overwrite each other. Stop or pause one, or move it to its own branch.</p>` })}</div>`;
}
