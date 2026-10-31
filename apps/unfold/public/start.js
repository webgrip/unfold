import { escape } from './core/dom.js';
import { icon } from './core/icons.js';
import { count as formatCount, money, namedDate, plural } from './core/format.js';
import { badge, button, callout, count, demoNote, emptyState, errorCodeNote, kbd, listRow, skeleton } from './core/ui.js';
import { openTaskLabel, trackerOf, trackerOr } from './core/trackers.js';
import { spendCapLine, spendCapShort } from './core/spend-cap.js';

/** How many agent pull requests may wait for your review before the Start lane says to decide first. */
export const reviewRoom = 4;

/** How many tasks the Start lane lists before Show all. */
export const startLimit = 5;

const readyLabels = ['ready', 'agent-ready', 'do-next'];
const unreadyLabels = ['needs-refinement', 'needs-info', 'blocked', 'on-hold', 'wontfix'];
const epic = task => /^epic\b/i.test(String(task?.title ?? '').trim()) || labelsOf(task).includes('epic');
const acceptance = /acceptance|done when|definition of done|verification|^\s*[-*] \[ \]/im;
const moving = ['ingested', 'queued'];
const labelsOf = task => (Array.isArray(task?.labels) ? task.labels : []).map(label => String(label?.name ?? '').trim().toLowerCase()).filter(Boolean);
const moment = value => { const at = Date.parse(value ?? ''); return Number.isFinite(at) ? at : 0; };
const words = text => (String(text).match(/\S+/g) || []).length;

/** The key a task has in the Now response's standings (`provider:externalId`). */
export const taskKey = task => `${task.provider}:${task.id}`;

/** What a brief alone tells an agent: its length, and whether it names acceptance conditions (`ok` null when not found). */
export function briefFacts(text) {
  const brief = String(text ?? '').trim();
  if (!brief) return [{ ok: false, text: 'No brief: an agent would start from the title alone' }];
  return [{ ok: true, text: `Brief of ${plural(words(brief), 'word')}` }, acceptance.test(brief) ? { ok: true, text: 'Names acceptance conditions' } : { ok: null, text: 'No acceptance conditions found in the brief' }];
}

/**
 * What Unfold can tell about a task before anyone spends on it, from the task alone: its ready or not-ready label,
 * whether it has a brief and whether that brief names acceptance conditions. Each fact is `ok` true, false or null
 * (not found, which is not a failure). `state` is `ready` only when a person labelled it ready and every fact holds,
 * `blocked` when a fact fails, else `check`.
 * @param {object} task A task snapshot from `GET /api/task-sources/:source/tasks`.
 * @returns {{ state: 'ready'|'check'|'blocked', label: string, tone: string, facts: { ok: boolean|null, text: string }[] }}
 */
export function readiness(task) {
  const labels = labelsOf(task);
  const brief = String(task?.description ?? '').trim();
  const marked = labels.find(label => readyLabels.includes(label));
  const unready = labels.find(label => unreadyLabels.includes(label));
  const facts = [];
  if (unready) facts.push({ ok: false, text: `Labelled ${unready}` });
  else if (marked) facts.push({ ok: true, text: `Labelled ${marked}` });
  facts.push(...briefFacts(brief));
  if (facts.some(fact => fact.ok === false)) return { state: 'blocked', label: unready ? 'Not ready' : 'No brief', tone: 'attention', facts };
  if (marked && facts.every(fact => fact.ok === true)) return { state: 'ready', label: 'Marked ready', tone: 'success', facts };
  if (!marked) facts.unshift({ ok: null, text: 'Not labelled ready in the tracker' });
  return { state: 'check', label: 'Not marked ready', tone: 'neutral', facts };
}

const capital = text => text.charAt(0).toUpperCase() + text.slice(1);
const sentence = text => String(text ?? '').trim().replace(/[.\s]+$/, '');

/**
 * A task's priority in its tracker's own word, and its rank (higher goes first), from the tracker registry's priority
 * words: where 1 is the highest it ranks first. Null when the tracker set none.
 * @param {object} task
 * @returns {{ rank: number, name: string } | null}
 */
export function priorityOf(task) {
  const value = task?.priority;
  if (!Number.isSafeInteger(value) || value < 1) return null;
  const scale = trackerOf(task.provider)?.priorities;
  if (scale?.oneIsHighest) return value < scale.names.length ? { rank: scale.names.length - value, name: scale.names[value] } : null;
  return { rank: value, name: scale?.names[value] || `level ${value}` };
}

/**
 * Whether Ploeg routes a task to a repository an agent can work in, from `GET /api/ploeg/connections`: the board
 * that shows the connection, a Team of yours on it, the task's one `repo/` label (or the board's repository or
 * default) and that repository's readiness. Without the connections read, a connection that names a repository routes.
 * @param {object} task
 * @param {{ id: string, name?: string, repositoryId?: string } | undefined} source
 * @param {object|null} connections
 * @returns {{ ok: true, repository: string } | { ok: false, reason: string }}
 */
export function routeOf(task, source, connections) {
  if (!connections?.supported) return source?.repositoryId ? { ok: true, repository: source.repositoryId } : { ok: false, reason: 'This connection names no repository for agents to work in' };
  const board = (connections.boards || []).find(entry => (entry.sources || []).some(item => item.id === source?.id));
  if (!board) return { ok: false, reason: `Ploeg routes no board for ${source?.name || 'this connection'}` };
  const where = `the ${String(board.name || '').replace(/\s+board$/i, '') || 'task'} board`;
  if (board.sources.find(item => item.id === source.id)?.routed === false) return { ok: false, reason: `${capital(where)} does not route to this connection’s repository` };
  if (!board.teams?.length) return { ok: false, reason: `No Team of yours takes work from ${where}` };
  const repositories = connections.repositories || [];
  const allowed = [board.repository, board.default, ...(board.allow || [])].filter(Boolean);
  const hints = labelsOf(task).filter(label => label.startsWith('repo/'));
  let key = board.repository;
  if (!key && hints.length > 1) return { ok: false, reason: `More than one repo/ label (${hints.join(', ')}): keep exactly one` };
  if (!key && hints.length) {
    const known = repositories.find(repository => String(repository.key).toLowerCase() === hints[0].slice('repo/'.length));
    if (!known) return { ok: false, reason: `${hints[0]} names no repository Ploeg knows` };
    if (!allowed.includes(known.key)) return { ok: false, reason: `${hints[0]} is not allowed on ${where}` };
    key = known.key;
  }
  key ||= board.default;
  if (!key) return { ok: false, reason: `${capital(where)} needs a repo/ label on this task` };
  const repository = repositories.find(entry => entry.key === key);
  const name = repository?.label || repository?.repo || key;
  if (repository?.readiness === 'not_ready') return { ok: false, reason: `${name} is not ready for agents: ${sentence(repository.reason) || 'Ploeg gave no reason'}` };
  return { ok: true, repository: name };
}

/**
 * Why a task sits where it does in Up next, in the tracker's words: its priority and due date, or, when the tracker
 * set neither, its place in the list the tracker returned.
 * @param {{ task: object, position: number }} entry A `startQueue` entry.
 * @returns {string}
 */
export function whyHere(entry) {
  const parts = [];
  const priority = priorityOf(entry.task);
  if (priority) parts.push(`Priority ${priority.name}`);
  const due = namedDate(entry.task?.dueAt);
  if (due) parts.push(`${parts.length ? 'due' : 'Due'} ${due}`);
  return parts.length ? parts.join(' · ') : `Tracker order #${formatCount(entry.position + 1)}`;
}

/**
 * The tasks the Start lane offers, from every listed connection: open, not an epic, not with Ploeg in any state Now
 * reports, and not handed over from this page in the meantime. They keep the tracker's order: its priority first, then
 * the earliest due date, then the place in the list the tracker returned. Each entry says whether an agent can take
 * it; when not, `blocker` says why: Ploeg's own refusal, then routing (`routeOf`), then a failing `readiness` fact.
 * @param {{ sourceId: string, tasks: object[] }[]} lists
 * @param {Map<string, object>} standings `taskStandings` of the Now response.
 * @param {{ sourceId: string, taskId: string }[]} [handed]
 * @param {{ sources?: object[], connections?: object|null, refused?: Map<string, string> }} [routing] `refused` maps a `taskKey` to Ploeg's refusal in words.
 * @returns {{ task: object, sourceId: string, position: number, readiness: ReturnType<typeof readiness>, blocker: string }[]}
 */
export function startQueue(lists, standings, handed = [], { sources = [], connections = null, refused = new Map() } = {}) {
  const away = new Set(handed.map(entry => `${entry.sourceId}:${entry.taskId}`));
  const byId = new Map(sources.map(source => [source.id, source]));
  const due = task => moment(task.dueAt) || Infinity;
  return lists.flatMap(({ sourceId, tasks }, list) => (Array.isArray(tasks) ? tasks : [])
    .map((task, position) => ({ task, sourceId, position, list }))
    .filter(({ task }) => task.status === 'open' && !epic(task) && !standings.has(taskKey(task)) && !away.has(`${sourceId}:${task.id}`))
    .map(entry => {
      const state = readiness(entry.task);
      const route = routeOf(entry.task, byId.get(entry.sourceId) ?? { id: entry.sourceId }, connections);
      const failed = state.facts.find(fact => fact.ok === false);
      const blocker = refused.get(taskKey(entry.task)) || (route.ok ? '' : route.reason) || (state.state === 'blocked' ? failed?.text || state.label : '');
      return { ...entry, readiness: state, blocker };
    }))
    .sort((a, b) => (priorityOf(b.task)?.rank ?? 0) - (priorityOf(a.task)?.rank ?? 0) || due(a.task) - due(b.task) || a.position - b.position || a.list - b.list)
    .map(({ list, ...entry }) => entry);
}

/**
 * How much review room is left: the agent pull requests that wait for you now, out of `reviewRoom`. Null when Now
 * could not list what waits.
 * @param {object|null} data A `GET /api/ploeg/now` response.
 * @returns {{ used: number, size: number, full: boolean } | null}
 */
export function roomOf(data, size = reviewRoom) {
  if (!data || data.errors?.waiting) return null;
  const used = (Array.isArray(data.waiting) ? data.waiting : []).filter(entry => entry.state === 'awaiting_review').length;
  return { used, size, full: used >= size };
}

/**
 * The hand-offs made from this page that Now does not show as moving yet, or that are still queued and can be
 * taken back. A hand-off drops out once Ploeg reports the work running or waiting on a person.
 * @param {object[]} handed
 * @param {Map<string, object>} standings
 * @returns {object[]}
 */
export function pendingHandoffs(handed, standings) {
  return handed.filter(entry => { const standing = standings.get(entry.key); return !standing || moving.includes(standing.state); });
}

function roomMarkup(room) {
  if (!room) return '';
  const free = room.size - room.used;
  const waits = room.used === 1 ? 'waits' : 'wait';
  const text = room.full ? `Review room full: ${plural(room.used, 'pull request')} ${waits} for you` : `You can take ${plural(free, 'more review')}${room.used ? ` · ${formatCount(room.used)} ${waits} now` : ''}`;
  const why = `Unfold suggests at most ${room.size} agent pull requests waiting for your review at once.`;
  return `<p class="start-room"${room.full ? ' data-full' : ''} title="${escape(why)}">${escape(text)}</p>`;
}

function readyBadge(state) {
  return badge({ label: state.label, tone: state.tone, glyph: state.state === 'ready' ? 'check' : state.state === 'blocked' ? 'alert' : 'help-circle', size: 'sm' });
}

/** The Team a task's own `team/<name>` label asks for, or empty. */
export function labelledTeam(task) {
  const label = labelsOf(task).find(name => name.startsWith('team/'));
  return label ? label.slice('team/'.length) : '';
}

function rowFacts(entry, sourceName, badges) {
  const { task } = entry;
  const labels = labelsOf(task);
  const facts = [];
  if (entry.blocker) facts.push(`<span class="start-why" data-blocked>${escape(entry.blocker)}</span>`);
  else {
    if (badges && entry.readiness.state === 'ready') facts.push(readyBadge(entry.readiness));
    facts.push(`<span class="start-why">${escape(whyHere(entry))}</span>`);
  }
  if (labels.includes('spike')) facts.push(badge({ label: 'Spike', tone: 'neutral', size: 'sm' }));
  facts.push(escape(task.identifier || `#${task.id}`));
  if (sourceName) facts.push(escape(sourceName));
  const effort = labels.find(name => name.startsWith('effort/'));
  if (effort) facts.push(escape(`size ${effort.slice('effort/'.length).toUpperCase()}`));
  const team = labelledTeam(task);
  if (team) facts.push(escape(`for ${team}`));
  return `<span class="now-facts"><span class="now-facts-list">${facts.map(fact => `<span>${fact}</span>`).join('')}</span></span>`;
}

function startRow(entry, sourceName, badges) {
  const { task, sourceId } = entry;
  const row = listRow({ action: 'start-open', data: { source: sourceId, task: task.id, nowRow: true }, id: `start-row-${sourceId}-${task.id}`, tone: entry.blocker ? 'attention' : 'neutral', lead: icon(entry.blocker ? 'alert' : 'tasks'), title: task.title || `Task ${task.id}`, meta: rowFacts(entry, sourceName, badges), trail: `<span class="start-row-go" aria-hidden="true">${icon('arrow')}Hand off</span>` });
  return `<li class="now-item start-item"${entry.blocker ? ' data-held' : ''}>${row}</li>`;
}

function handedRow(entry, standing) {
  const queued = standing && moving.includes(standing.state);
  const what = queued ? `Queued for ${entry.team} · starts when a worker is free` : `Handed to ${entry.team} · waiting for Ploeg to queue it`;
  const take = button({ label: entry.busy ? 'Taking back…' : 'Take back', icon: 'back', size: 'sm', variant: 'ghost', action: 'start-take-back', data: { source: entry.sourceId, task: entry.taskId, team: entry.team }, busy: Boolean(entry.busy), disabled: Boolean(entry.busy), id: `start-take-back-${entry.sourceId}-${entry.taskId}` });
  const lead = `<span class="start-handed-mark" aria-hidden="true">${icon(queued ? 'circle-dashed' : 'arrow')}</span>`;
  const href = standing?.id ? `#work/${encodeURIComponent(standing.id)}` : '';
  const title = href ? `<a href="${escape(href)}">${escape(entry.title)}</a>` : escape(entry.title);
  return `<li class="start-handed" data-tone="${queued ? 'neutral' : 'live'}">${lead}<span class="start-handed-main"><span class="start-handed-title">${title}</span><span class="start-handed-what">${escape(what)}</span></span>${take}</li>`;
}

/**
 * The hand-offs made from Now that Ploeg has not started, each with Take back. Empty when there are none.
 * @param {object[]} entries `pendingHandoffs` result.
 * @param {Map<string, object>} standings
 * @returns {string}
 */
export function handedMarkup(entries, standings) {
  if (!entries.length) return '';
  return `<ul class="start-handed-list" aria-label="Handed over from Now">${entries.map(entry => handedRow(entry, standings.get(entry.key))).join('')}</ul>`;
}

function boardSwitch(sources, queue, board) {
  if (sources.length < 2 || !queue.length) return '';
  const counts = new Map(sources.map(source => [source.id, 0]));
  for (const entry of queue) counts.set(entry.sourceId, (counts.get(entry.sourceId) ?? 0) + 1);
  const items = [{ id: '', label: `All ${formatCount(queue.length)}` }, ...sources.filter(source => counts.get(source.id)).map(source => ({ id: source.id, label: `${source.name} ${formatCount(counts.get(source.id))}` }))];
  return `<div class="start-boards" role="group" aria-label="Board">${items.map(item => `<button type="button" class="start-board" data-action="start-board" data-board="${escape(item.id)}" aria-pressed="${item.id === board}">${escape(item.label)}</button>`).join('')}</div>`;
}

function toggle({ action, label, pressed }) {
  return `<button type="button" class="button ghost sm" id="${escape(action)}" data-action="${escape(action)}" aria-pressed="${pressed}">${escape(label)}</button>`;
}

/**
 * The Start lane of the loop: the first `startLimit` tasks an agent can take, in the tracker's order, each saying why
 * it is there and opening the hand-off sheet, with the review room above them. Show all lists every task with a board
 * switch when there are several boards; Include adds the tasks agents cannot take, each with its reason. `board` is
 * the chosen connection id, or empty for all; it applies while every task shows.
 * @param {{ queue: object[]|null, sources: object[], error?: string, errorCode?: string, room: object|null, singleKeys?: boolean, demo?: boolean, board?: string, all?: boolean, include?: boolean }} input
 * @returns {string}
 */
export function startCard({ queue, sources, error = '', errorCode = '', room, singleKeys = false, demo = false, board = '', all = false, include = false }) {
  const names = new Map(sources.map(source => [source.id, source.name]));
  let body;
  if (!sources.length) body = emptyState({ icon: 'tasks', compact: true, title: 'No task connection hands work to Ploeg', body: 'An administrator connects your tracker’s list or board on Connections, with Ploeg running its work. Its open tasks show up here to hand off.' });
  else if (error && !queue) body = emptyState({ icon: 'x-circle', compact: true, tone: 'danger', title: 'Could not list your tasks', body: `${escape(error)}${errorCodeNote(errorCode)}`, actions: button({ label: 'Try again', icon: 'refresh', size: 'sm', action: 'start-reload', id: 'start-reload' }) });
  else if (!queue) body = skeleton({ rows: 3 });
  else if (!queue.length) body = emptyState({ icon: 'check-circle', compact: true, title: 'Nothing left to start', body: `Every open task is with Ploeg already. Make more work Ready in ${escape(trackerNames(sources))}.`, actions: button({ label: 'Open Tasks', size: 'sm', variant: 'ghost', href: '#tasks', id: 'start-tasks' }) });
  else {
    const visible = include ? queue : queue.filter(entry => !entry.blocker);
    const chosen = all && board && visible.some(entry => entry.sourceId === board) ? board : '';
    const listed = chosen ? visible.filter(entry => entry.sourceId === chosen) : visible;
    const shown = all ? listed : listed.slice(0, startLimit);
    const takers = queue.filter(entry => !entry.blocker);
    const held = queue.length - takers.length;
    const marked = takers.length > 0 && takers.every(entry => entry.readiness.state === 'ready');
    const order = `<p class="start-order">In your tracker’s order · ${escape(takers.length ? `${plural(takers.length, 'task')} agents can take${marked ? ', all marked ready' : ''}` : 'no task agents can take')}</p>`;
    const controls = [
      visible.length > startLimit ? toggle({ action: 'start-all', label: all ? `Show the first ${formatCount(startLimit)}` : `Show all ${formatCount(visible.length)}`, pressed: all }) : '',
      held ? toggle({ action: 'start-include', label: `Include tasks agents cannot take (${formatCount(held)})`, pressed: include }) : '',
    ].join('');
    const list = shown.length
      ? `<ul class="list now-list start-list" aria-labelledby="loop-start-title">${shown.map(entry => startRow(entry, sources.length > 1 && !chosen ? names.get(entry.sourceId) : '', !marked)).join('')}</ul>`
      : emptyState({ icon: 'help-circle', compact: true, title: 'No task agents can take right now', body: `${plural(held, 'open task')} ${held === 1 ? 'needs' : 'need'} something first. Include ${held === 1 ? 'it' : 'them'} to see why.` });
    body = `${order}${all ? boardSwitch(sources, visible, chosen) : ''}${list}${controls ? `<div class="start-controls">${controls}</div>` : ''}`;
  }
  const keys = singleKeys && queue?.length ? `<p class="now-keys" aria-hidden="true">${kbd('h')}<span>hand off</span></p>` : '';
  const warn = room?.full && queue?.length ? `<p class="start-decide-first">${icon('alert')}<span>Decide on what waits first. You can still hand off; the work queues behind your review.</span></p>` : '';
  return `<section class="card flush now-card loop-start" aria-labelledby="loop-start-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="loop-start-title">Up next</h2>${roomMarkup(room)}</div><div class="card-actions">${keys}</div></header><div class="card-body">${demo && sources.some(source => trackerOf(source.provider)?.fixture) ? demoNote('Fixture tasks · a hand-off needs a connected tracker and a live Ploeg') : ''}${warn}${body}</div></section>`;
}

function trackerNames(sources) {
  const names = [...new Set(sources.map(source => trackerOr(source.provider, '')).filter(Boolean))];
  return names.length ? names.join(' or ') : 'your tracker';
}

function teamFacts(team, summary, demo) {
  const facts = [];
  if (team.paused) facts.push('paused');
  else facts.push(team.queueDepth > 0 ? `${formatCount(team.queueDepth)} queued` : 'nothing queued');
  const cap = spendCapShort(team.spendCap, { demo });
  if (cap) facts.push(cap);
  if (summary) {
    const runs = summary.runs || {};
    const done = (runs.finished ?? 0) + (runs.failed ?? 0) + (runs.stuck ?? 0);
    facts.push(done ? `${plural(done, 'Run')} in 7 d: ${formatCount(runs.failed ?? 0)} failed, ${formatCount(runs.stuck ?? 0)} stuck` : 'no Run in 7 d');
    facts.push(`${money(summary.spend?.settledUsd ?? 0)} in 7 d`);
  }
  return facts;
}

/**
 * What Now says once a hand-off went through: the Team, the user it assigned in the tracker when known, and how to take it back.
 * @param {string} team
 * @param {string} [assignee] The Team's tracker user.
 * @param {string} [provider] The task's tracker.
 * @returns {string}
 */
export function handedNotice(team, assignee = '', provider = '') {
  const where = trackerOr(provider, 'the tracker');
  const assigned = assignee ? ` “${assignee}” is assigned in ${where}.` : '';
  return `Handed to ${team}.${assigned} Take it back from Now until a worker starts it.`;
}

/** The Team a sheet starts on: the one the task's `team/<name>` label asks for, else the one last used for this connection, else the first, each only while it is on offer. */
export function suggestedTeam(teams, remembered, labelled = '') {
  if (!Array.isArray(teams) || !teams.length) return '';
  if (teams.some(team => team.id === labelled)) return labelled;
  return teams.some(team => team.id === remembered) ? remembered : teams[0].id;
}

/**
 * The hand-off sheet: whether the task is ready, the Teams on offer with their roles, queue and last 7 days, what
 * handing it over does, and one button. While Ploeg's answer is loading, the Team list is a skeleton; when Ploeg
 * refuses a hand-off, its reason replaces the button.
 * @param {{ task: object, source: object, repository?: string, status: object|null, statusError?: string, summary?: object|null, team?: string, remembered?: string, busy?: boolean, error?: string, errorCode?: string, room?: object|null, singleKeys?: boolean }} input
 * @returns {string}
 */
export function sheetMarkup({ task, source, repository = '', status, statusError = '', summary = null, team = '', remembered = '', busy = false, error = '', errorCode = '', room = null, singleKeys = false }) {
  const state = readiness(task);
  const ref = task.identifier || `#${task.id}`;
  const tracker = trackerOr(source.provider, 'the tracker');
  const glyph = fact => fact.ok === true ? icon('check') : fact.ok === false ? icon('x-circle') : icon('help-circle');
  const facts = `<ul class="sheet-facts">${state.facts.map(fact => `<li data-ok="${fact.ok === null ? 'unknown' : fact.ok}"><span class="sheet-fact-mark" aria-hidden="true">${glyph(fact)}</span><span>${escape(fact.text)}</span></li>`).join('')}</ul>`;
  const teams = status?.teams || [];
  const chosen = teams.find(entry => entry.id === team) || teams[0];
  const perTeam = new Map((summary?.teams || []).map(entry => [entry.team, entry]));
  let teamBody;
  if (!status && !statusError) teamBody = skeleton({ rows: 2 });
  else if (statusError) teamBody = callout({ tone: 'danger', title: 'Could not ask Ploeg', body: `<p>${escape(statusError)} Nothing was handed over.</p>`, actions: button({ label: 'Try again', icon: 'refresh', size: 'sm', action: 'start-sheet-retry', id: 'start-sheet-retry' }) });
  else if (!teams.length) teamBody = `<p class="sheet-none">${escape(status.handoff?.reason || 'No Team of yours can take this task.')}</p>`;
  else teamBody = `<fieldset class="sheet-teams"><legend class="sr-only">Team</legend>${teams.map((entry, index) => `<label class="sheet-team" for="sheet-team-${escape(entry.id)}"><input type="radio" id="sheet-team-${escape(entry.id)}" name="team" value="${escape(entry.id)}"${entry.id === chosen?.id ? ' checked' : ''}${busy ? ' disabled' : ''}><span class="sheet-team-name">${escape(entry.id)}</span>${entry.id === labelledTeam(task) ? `<span class="sheet-team-why">labelled team/${escape(entry.id)}</span>` : entry.id === remembered ? '<span class="sheet-team-why">last used here</span>' : singleKeys && index < 9 ? `<span class="sheet-team-key" aria-hidden="true">${index + 1}</span>` : ''}<span class="sheet-team-roles">${escape(entry.roles.length ? entry.roles.join(' → ') : 'No Roles reported')}</span><span class="sheet-team-facts">${teamFacts(entry, perTeam.get(entry.id), Boolean(status.demo)).map(fact => `<span>${escape(fact)}</span>`).join('')}</span></label>`).join('')}</fieldset>`;
  const allowed = Boolean(status?.available && status.handoff?.allowed && chosen && !status.assignedTeams?.length);
  const held = status?.assignedTeams?.length ? `Already handed to ${status.assignedTeams.join(', ')}.` : status?.message && !status.handoff?.allowed ? status.message : '';
  const refusal = status && !statusError && !allowed && teams.length ? `<p class="sheet-none">${escape(held || status.handoff?.reason || 'Ploeg does not take this task right now.')}</p>` : '';
  const terms = [
    ['Where', repository ? `A branch of ${repository}, then a pull request for your review. Nothing merges without you.` : 'A branch, then a pull request for your review. Nothing merges without you.'],
    ['Budget', chosen ? `${spendCapLine(chosen.spendCap, { demo: Boolean(status.demo) })}. What this task alone may spend is set by the Team’s plan; the Work Item shows it once a Run starts.` : 'Set by the Team in Ploeg. The Work Item shows it once a Run starts.'],
    ['In ' + tracker, chosen?.assignee ? `Assigns “${chosen.assignee}” to ${ref} in ${tracker} and leaves a comment there. Assigning that user in ${tracker} yourself does the same.` : `Assigns the Team’s user in ${tracker} and leaves a comment there.`],
    ['Next', 'Ploeg queues it for the Team. A worker starts it when one is free; you follow it on Now and on its Work Item page.'],
    ['Take back', `Free until a worker starts it: Take back on Now or Tasks, which removes ${chosen?.assignee ? `“${chosen.assignee}”` : 'the Team’s user'} in ${tracker} again. After a worker starts it, Cancel on its Work Item page stops it.`],
  ].map(([term, value]) => `<dt>${escape(term)}</dt><dd>${escape(value)}</dd>`).join('');
  const roomWarn = room?.full ? callout({ tone: 'attention', title: `${plural(room.used, 'pull request')} already ${room.used === 1 ? 'waits' : 'wait'} for you`, body: '<p>This queues behind your review. Hand it off anyway, or decide on those first.</p>' }) : '';
  const failure = error ? callout({ tone: 'danger', title: 'Ploeg did not take the hand-off', body: `<p>${escape(error)} Nothing changed in ${escape(tracker)}.</p>${errorCodeNote(errorCode)}` }) : '';
  const submit = button({ type: 'submit', variant: 'primary', icon: 'arrow', label: busy ? 'Handing over…' : chosen ? `Hand to ${chosen.id}` : 'Hand off', busy, disabled: busy || !allowed, id: 'sheet-submit', kbd: allowed && !busy ? '↵' : undefined });
  const demo = trackerOf(source.provider)?.fixture ? demoNote('Fixture task · Ploeg cannot receive it, so nothing is handed over') : '';
  return `<form data-form="start-handoff" class="sheet" novalidate aria-labelledby="sheet-title"><input type="hidden" name="source" value="${escape(source.id)}"><input type="hidden" name="task" value="${escape(task.id)}"><header class="dialog-header sheet-header"><div class="sheet-heading"><p class="sheet-eyebrow">Hand off · ${escape(ref)}${source.name ? ` · ${escape(source.name)}` : ''}</p><h2 id="sheet-title">${escape(task.title || `Task ${task.id}`)}</h2></div><button type="button" class="button ghost icon-only" data-action="close-dialog" aria-label="Close" title="Close">${icon('x')}</button></header><div class="dialog-body sheet-body">${demo}<section class="sheet-section" aria-labelledby="sheet-ready"><h3 class="sheet-label" id="sheet-ready">Ready? ${readyBadge(state)}</h3>${facts}${task.url ? `<p class="sheet-open"><a href="${escape(task.url)}" target="_blank" rel="noopener noreferrer" data-link-out="tracker">${escape(`${openTaskLabel(source.provider)} to edit the brief`)}${icon('external')}<span class="sr-only"> (opens in a new tab)</span></a></p>` : ''}</section><section class="sheet-section" aria-labelledby="sheet-team"><h3 class="sheet-label" id="sheet-team">Team</h3>${teamBody}${refusal}</section><section class="sheet-section" aria-labelledby="sheet-terms"><h3 class="sheet-label" id="sheet-terms">What happens</h3><dl class="sheet-terms">${terms}</dl></section>${roomWarn}${failure}</div><footer class="dialog-footer">${button({ label: 'Cancel', action: 'close-dialog', variant: 'ghost' })}${submit}</footer></form>`;
}

/**
 * The Try again dialog of a stopped Work Item: what it costs, an optional note for the next Runs and one button.
 * Ploeg restarts it from Round 1 on the same Team; nothing in the tracker changes.
 * @param {object} entry A waiting Work Item of the Now response.
 * @param {{ demo?: boolean, busy?: boolean, error?: string }} [options]
 * @returns {string}
 */
export function retryMarkup(entry, { demo = false, busy = false, error = '' } = {}) {
  const title = entry.title || `Work Item ${entry.id}`;
  const budget = entry.latestShift?.budgetUsd;
  const cost = demo ? 'This is the demo: nothing restarts and nothing is spent.' : `A new attempt spends from Team ${entry.team}’s budget${typeof budget === 'number' ? `, up to ${money(budget)} like the last one` : ''}.`;
  const failure = error ? callout({ tone: 'danger', title: 'Ploeg did not restart it', body: `<p>${escape(error)}</p>` }) : '';
  return `<form data-form="loop-retry" novalidate aria-labelledby="confirm-title"><input type="hidden" name="id" value="${escape(entry.id)}"><header class="dialog-header"><h2 id="confirm-title">Try “${escape(title)}” again?</h2><button type="button" class="button ghost icon-only" data-action="close-dialog" aria-label="Close" title="Close">${icon('x')}</button></header><div class="dialog-body"><p>Ploeg starts it over from Round 1 with Team ${escape(entry.team)}. ${escape(cost)}</p><div class="field"><label class="field-label" for="loop-retry-note">What should the next attempt know? <span class="subtle">Optional</span></label><textarea id="loop-retry-note" name="note" maxlength="4096" rows="4" placeholder="For example: the file moved to docs/operate/observability.md"></textarea></div>${failure}</div><footer class="dialog-footer">${button({ label: 'Cancel', action: 'close-dialog', variant: 'ghost' })}${button({ type: 'submit', variant: 'primary', icon: 'refresh', label: busy ? 'Starting…' : 'Try again', busy, disabled: busy, id: 'loop-retry-submit' })}</footer></form>`;
}
