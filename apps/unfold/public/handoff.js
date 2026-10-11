import { escape } from './core/dom.js';
import { icon } from './core/icons.js';
import { markSvg } from './core/brand.js';
import { badge, button, stateBadge } from './core/ui.js';

const settled = ['done', 'withdrawn', 'stale'];
const moving = ['ingested', 'queued', 'leased'];
const waiting = ['awaiting_review', 'needs_human'];

/** The Work Item that says where a task stands with Ploeg: the first one still in progress, otherwise the most recent. */
export function currentWorkItem(status) { return status?.workItems?.find(item => !settled.includes(item.state)) || status?.workItems?.[0]; }

/**
 * The hand-off track of a task: Handed over, Queued, Running, then Ready for review (or Needs you, or Done), with
 * the step the work has reached. Null when the task is not with Ploeg: never handed over, withdrawn or stopped retrying.
 * @param {object} status A task's Ploeg status (`GET /api/task-sources/:source/tasks/:id/ploeg`).
 * @returns {{ at: number, tone: string, team: string, workItemId: string, steps: { id: string, label: string, detail: string, state: 'done'|'current'|'todo', tone: string }[] } | null}
 */
export function handoffTrack(status) {
  if (!status?.available) return null;
  const item = currentWorkItem(status);
  const live = item && !settled.includes(item.state) ? item : null;
  const done = item?.state === 'done' ? item : null;
  if (!live && !done && (!status.assignedTeams.length || item?.state === 'stale')) return null;
  const team = live?.team || done?.team || status.assignedTeams[0];
  const ahead = status.teams.find(entry => entry.id === team)?.queueDepth;
  const plan = {
    listing: { at: 1, tone: 'neutral', detail: 'Waiting for Ploeg to pick up the assignment' },
    ingested: { at: 1, tone: 'neutral', detail: 'Ploeg is preparing it for the queue' },
    queued: { at: 1, tone: 'neutral', detail: typeof ahead === 'number' && ahead > 1 ? `Waiting for a ${team} worker · ${ahead} in the queue` : `Waiting for a ${team} worker` },
    leased: { at: 2, tone: 'live', detail: 'An agent is working on it' },
    awaiting_review: { at: 3, tone: 'review', detail: 'A pull request waits for you' },
    needs_human: { at: 3, tone: 'attention', detail: 'Ploeg stopped and waits for your decision' },
    done: { at: 4, tone: 'success', detail: '' },
  }[done ? 'done' : live ? live.state : 'listing'] || { at: 2, tone: 'neutral', detail: '' };
  const last = done ? 'Done' : live?.state === 'needs_human' ? 'Needs you' : 'Ready for review';
  const labels = [['handed', 'Handed over'], ['queued', 'Queued'], ['running', 'Running'], ['ready', last]];
  const steps = labels.map(([id, label], index) => {
    const state = index < plan.at ? 'done' : index === plan.at ? 'current' : 'todo';
    return { id, label, detail: state === 'current' ? plan.detail : index === 0 ? `To ${team}` : '', state, tone: state === 'current' ? plan.tone : state === 'done' ? 'success' : 'neutral' };
  });
  return { at: plan.at, tone: plan.tone, team, workItemId: (live || done)?.id || '', steps };
}

/** A key that changes whenever the track moves on, so the page can tell a new step from a repeated read. */
export function trackKey(track) { return track ? `${track.workItemId}:${track.at}:${track.tone}` : ''; }

/**
 * The hand-off track as an ordered list. The current step carries the Unfold mark, which the page pops when the work
 * reaches that step (`arrived`). `id` prefixes element ids.
 * @param {ReturnType<typeof handoffTrack>} track
 * @param {{ arrived?: boolean, id?: string }} [options]
 * @returns {string}
 */
export function trackMarkup(track, { arrived = false, id = 'handoff-track' } = {}) {
  if (!track) return '';
  const spoken = { done: 'done', current: 'now', todo: 'next' };
  const items = track.steps.map(step => {
    const current = step.state === 'current';
    const dot = current ? markSvg({ className: 'handoff-mark' }) : step.state === 'done' ? icon('check') : '';
    const detail = step.detail ? `<span class="handoff-detail">${escape(step.detail)}</span>` : '';
    return `<li class="handoff-step" data-step="${step.state}" data-tone="${escape(step.tone)}"${current ? ' aria-current="step"' : ''}${current && arrived ? ' data-arrived' : ''}><span class="handoff-dot" aria-hidden="true">${dot}</span><span class="handoff-text"><span class="handoff-label">${escape(step.label)}<span class="sr-only">, ${spoken[step.state]}</span></span>${detail}</span></li>`;
  }).join('');
  return `<ol class="handoff-track" id="${escape(id)}" data-tone="${escape(track.tone)}" data-reached="${track.at}" aria-label="Where this task is with Ploeg">${items}</ol>`;
}

/**
 * The one link that takes you to the work after a hand-off: the pull request when it waits for review, otherwise the
 * Work Item page. Null while Ploeg has not listed a Work Item yet.
 * @param {object} status
 * @returns {{ href: string, label: string, external: boolean, icon: string } | null}
 */
export function followTarget(status) {
  const track = handoffTrack(status);
  if (!track?.workItemId) return null;
  const state = currentWorkItem(status)?.state;
  const label = state === 'needs_human' ? `Decide on Work Item #${track.workItemId}` : ['done', 'awaiting_review'].includes(state) ? `Open Work Item #${track.workItemId}` : `Follow Work Item #${track.workItemId}`;
  return { href: `#work/${encodeURIComponent(track.workItemId)}`, label, external: false, icon: 'arrow' };
}

/**
 * How long the Tasks page waits before it reads a task's Ploeg status again: quickly while the hand-off moves through
 * Handed over and Queued, slower while an agent runs, and not at all once the work waits on a person or settled.
 * @param {object|null} status
 * @returns {number|null} Milliseconds, or null to stop.
 */
export function followDelay(status) {
  const track = handoffTrack(status);
  if (!track) return null;
  if (track.at <= 1) return 3000;
  if (track.at === 2) return 15000;
  return null;
}

/**
 * Where each tracker task stands with Ploeg, from a `GET /api/ploeg/now` response: a Map from `provider:externalId`
 * to the Work Item's id, state and Team. Waiting Work Items win over active ones; proposals are left out.
 * @param {object|null} data
 * @returns {Map<string, { id: string, state: string, team: string }>}
 */
export function taskStandings(data) {
  const map = new Map();
  const add = list => {
    for (const entry of Array.isArray(list) ? list : []) {
      if (!entry?.provider || !entry.externalId || ![...moving, ...waiting].includes(entry.state)) continue;
      const key = `${entry.provider}:${entry.externalId}`;
      if (!map.has(key)) map.set(key, { id: String(entry.id), state: entry.state, team: entry.team || '' });
    }
  };
  if (!data?.errors?.waiting) add(data?.waiting);
  if (!data?.errors?.active) add(data?.active);
  return map;
}

/**
 * The standing a task's own Ploeg status gives it, which is fresher than the Now list: the current Work Item while it
 * is in progress, `handed` while a Team holds the assignment Ploeg has not listed yet, otherwise null.
 * @param {object|null} status
 * @returns {{ id: string, state: string, team: string } | null}
 */
export function standingFromStatus(status) {
  if (!status?.available) return null;
  const item = currentWorkItem(status);
  if (item && [...moving, ...waiting].includes(item.state)) return { id: String(item.id), state: item.state, team: item.team };
  if (status.assignedTeams?.length && (!item || settled.includes(item.state))) return { id: '', state: 'handed', team: status.assignedTeams[0] };
  return null;
}

/**
 * The badge a task row shows for its standing: the shared state badge, or "Handed to <team>" before Ploeg lists it.
 * @param {{ state: string, team: string } | null | undefined} standing
 * @returns {string}
 */
export function standingBadge(standing) {
  if (!standing) return '';
  if (standing.state === 'handed') return badge({ label: `Handed to ${standing.team}`, glyph: 'arrow', tone: 'neutral', size: 'sm', title: 'Assigned to a Ploeg Team; Ploeg has not listed it yet' });
  return `<span class="tasks-standing" title="${escape(`Team ${standing.team}`)}">${stateBadge(standing.state)}</span>`;
}

/** The filters of the task list: every task, those not with Ploeg, and those with Ploeg. */
export const taskFilters = Object.freeze([{ id: 'all', label: 'All' }, { id: 'idle', label: 'Not started' }, { id: 'ploeg', label: 'With Ploeg' }]);

/** Whether `task` passes the filter `id`, given its standing (or none). */
export function passesFilter(id, standing) {
  if (id === 'idle') return !standing;
  if (id === 'ploeg') return Boolean(standing);
  return true;
}

/**
 * Whether the Ploeg card offers to notify you when the work you handed over is ready: the work is in progress, desktop
 * notifications are `off` but could be turned on, and you have not said "Not now" in this browser.
 * @param {object|null} status
 * @param {'unsupported'|'insecure'|'denied'|'off'|'on'} notifications
 * @param {boolean} dismissed
 * @returns {boolean}
 */
export function offersNotify(status, notifications, dismissed) {
  const track = handoffTrack(status);
  return Boolean(track) && track.at < 3 && notifications === 'off' && !dismissed;
}

/** The "Tell me when it is ready" row of the Ploeg card. `busy` while the browser asks for permission. */
export function notifyOffer({ busy = false } = {}) {
  const yes = button({ label: busy ? 'Asking your browser…' : 'Notify me', icon: 'bell', size: 'sm', variant: 'secondary', busy, disabled: busy, id: 'task-notify-on' }).replace('<button ', '<button data-action="task-notify-on" ');
  const no = button({ label: 'Not now', size: 'sm', variant: 'ghost', disabled: busy, id: 'task-notify-later' }).replace('<button ', '<button data-action="task-notify-later" ');
  return `<div class="handoff-notify" role="group" aria-labelledby="handoff-notify-text"><span class="handoff-notify-icon" aria-hidden="true">${icon('bell')}</span><p class="handoff-notify-text" id="handoff-notify-text">Get a desktop notification when it is ready for review or needs you, so you do not have to watch this page.</p><div class="handoff-notify-actions">${yes}${no}</div></div>`;
}
