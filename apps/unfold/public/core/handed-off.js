import { escape, safeUrl } from './dom.js';
import { icon } from './icons.js';
import * as format from './format.js';
import { workItemState } from './states.js';
import { listReason, reasonGlyph } from './reasons.js';
import { button, count, listRow } from './ui.js';

const needsYou = new Set(['needs_human', 'stale']);
const finished = new Set(['done', 'withdrawn']);

/**
 * The app a hand-off came through, as its Action Record names the channel: `browser`, an editor credential's name
 * with the client it names, or `mcp:<client>` for `unfold-mcp` over HTTPS.
 * @param {unknown} channel
 * @returns {string}
 */
export function channelLabel(channel) {
  const text = typeof channel === 'string' ? channel.replace(/[^ -~]/g, '').trim() : '';
  if (!text) return 'an unnamed app';
  if (text === 'browser' || text.startsWith('browser (')) return 'the browser';
  if (text.startsWith('mcp:')) return text === 'mcp:unnamed client' ? 'an MCP client' : text.slice(4);
  return text;
}

/**
 * Where a handed-off row stands: `needs` (it waits on a person), `review` (its pull request is ready), `running`,
 * `finished` or `waiting` (Ploeg has not picked it up yet).
 * @param {{ workItem: object | null }} row One entry of `GET /api/handoffs`.
 * @returns {'needs' | 'review' | 'running' | 'finished' | 'waiting'}
 */
export function handedStanding(row) {
  const state = row?.workItem?.state;
  if (!state) return 'waiting';
  if (needsYou.has(state)) return 'needs';
  if (state === 'awaiting_review') return 'review';
  if (finished.has(state)) return 'finished';
  return 'running';
}

const order = { needs: 0, review: 1, running: 2, waiting: 3, finished: 4 };

/**
 * The rows in the order the card lists them: what needs the person, then pull requests ready for review, then what
 * runs, what Ploeg has not picked up and what finished, each newest hand-off first.
 * @param {object[]} rows
 * @returns {object[]}
 */
export function orderHanded(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => order[handedStanding(a)] - order[handedStanding(b)] || String(b.at).localeCompare(String(a.at)));
}

function chip(label, tone, title = '') {
  return `<span class="chip" data-tone="${escape(tone)}"${title ? ` title="${escape(title)}"` : ''}><span>${escape(label)}</span></span>`;
}

function spendOf(item, demo) {
  if (demo || !item) return '';
  const shift = item.latestShift;
  const spent = shift ? shift.spentUsd : item.spentUsd;
  if (typeof spent !== 'number' || !Number.isFinite(spent)) return '';
  return typeof shift?.budgetUsd === 'number' && shift.budgetUsd > 0 ? `${format.moneyHtml(spent)} of ${format.moneyHtml(shift.budgetUsd)}` : `${format.moneyHtml(spent)} spent`;
}

function titleOf(row) {
  if (row.workItem?.title) return row.workItem.title;
  if (row.origin?.kind === 'task') return `Task ${row.origin.taskId} in ${row.origin.sourceName || row.origin.sourceId}`;
  return 'A session you handed to Ploeg';
}

function rowMarkup(row, { now, demo }) {
  const item = row.workItem;
  const standing = handedStanding(row);
  const reason = item ? listReason(item, { demo }) : null;
  const meta = item ? workItemState(item.state) : workItemState('queued');
  const state = item ? chip(reason?.chip || meta.label, reason?.tone || meta.tone, reason ? `${reason.sentence} ${reason.action}` : meta.description || '') : chip('Not picked up yet', 'neutral', row.note || '');
  const pr = safeUrl(item?.pullRequestUrl || item?.pullRequest?.url || '');
  const spend = spendOf(item, demo);
  const facts = [
    `<span>From ${escape(channelLabel(row.channel))}</span>`,
    row.team ? `<span>${escape(row.team)}</span>` : '',
    spend ? `<span>${spend}</span>` : '',
  ].filter(Boolean).join('');
  const why = reason?.fix ? `<span class="now-why now-why-fix">${escape(reason.fix)}</span>` : !item && row.note ? `<span class="now-why">${escape(row.note)}</span>` : '';
  const href = item?.id ? `#work/${encodeURIComponent(item.id)}` : row.origin?.kind === 'task' ? '#tasks' : '#settings/agent-sessions';
  const title = titleOf(row);
  const actions = [
    standing === 'needs' && item ? button({ id: `now-handed-open-${row.id}`, label: reason?.code === 'person_question' ? 'Answer' : 'Open', icon: reason?.code === 'person_question' ? 'send' : 'arrow', size: 'sm', href, ariaLabel: `${reason?.code === 'person_question' ? 'Answer the question on' : 'Open'} “${title}”` }) : '',
    pr ? button({ id: `now-handed-pr-${row.id}`, label: 'Pull request', icon: 'pull-request', size: 'sm', variant: standing === 'review' ? 'secondary' : 'ghost', href: pr, external: true, ariaLabel: `Open the pull request for “${title}” (opens in a new tab)` }) : '',
  ].filter(Boolean);
  const actionRow = actions.length ? `<div class="now-item-actions" data-primary><span class="now-action-primary">${actions.join('')}</span></div>` : '';
  return `<li class="now-item" data-handed="${standing}">${listRow({
    href,
    id: `now-handed-${String(row.id).replace(/[^A-Za-z0-9_-]/g, '-')}`,
    tone: reason?.tone || (item ? meta.tone : 'neutral'),
    lead: icon(reason ? reasonGlyph(reason) : item ? meta.glyph : 'circle-dashed'),
    title,
    meta: `${state}<span class="now-facts"><span class="now-facts-list">${facts}</span></span>${why}`,
    trail: row.at ? `<span class="now-when"><span class="now-when-label">Handed off </span>${format.timeHtml(row.at, { now })}</span>` : '',
  })}${actionRow}</li>`;
}

/**
 * The "Handed off by you" card on Now: the signed-in person's hand-offs from any app, with the app it came from, its
 * Team, its state, why it waits, its pull request and its spend. Tracker and agent text is shown as plain text.
 * Empty when they handed nothing off.
 * @param {{ demo?: boolean, handoffs?: object[] } | null | undefined} data `GET /api/handoffs`.
 * @param {{ now?: number }} [options]
 * @returns {string}
 */
export function handedOffCard(data, { now = Date.now() } = {}) {
  const rows = orderHanded(data?.handoffs);
  if (!rows.length) return '';
  const demo = Boolean(data.demo);
  const waiting = rows.filter(row => ['needs', 'review'].includes(handedStanding(row))).length;
  return `<section class="card flush now-card now-handed" aria-labelledby="now-handed-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="now-handed-title">Handed off by you${waiting ? count(waiting, { tone: 'attention', label: `${waiting} wait on you` }) : ''}</h2></div></header><div class="card-body"><p class="now-group-hint">What you handed off, from the browser, your editor or an AI app. Open one to answer its question or review its pull request.</p><ul class="list now-list" aria-labelledby="now-handed-title">${rows.map(row => rowMarkup(row, { now, demo })).join('')}</ul></div></section>`;
}
