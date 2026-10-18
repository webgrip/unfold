import { button } from '../core/ui.js';
import { answers } from './answers.js';
import { containmentPanel, needsContainment } from './containment.js';
import { shiftDial } from './dial.js';
import { flightPath } from './flight-path.js';
import { foldStrip } from './fold-strip.js';
import { instruments } from './instruments.js';
import { nowLine } from './layouts.js';
import { cx, escape, span, usd } from './parts.js';
import { moveList, traceLanes } from './trace.js';
import { acceptanceLedger, roleRoster, decisionDock, intentBar, leaseBaton, originStamp, presenceStack, spendTape, timeline } from './work-parts.js';

/** The Work Item page layouts, in the order the layout switch offers them. */
export const workLayouts = Object.freeze([
  Object.freeze({ id: 'unified', label: 'Unified', means: 'The recommended page: where it stands and what it needs from you first, then the conversation, the brief with its acceptance conditions and the trace, with spend, Roles and free answers beside them.' }),
  Object.freeze({ id: 'thread', label: 'Thread', means: 'Conversation first: the brief, your messages and every Run in one thread, what waits on you above the intent bar.' }),
  Object.freeze({ id: 'cockpit', label: 'Night cockpit', means: 'The flight on a dark ground: flight path and instruments, the Shift dial and Roles, the trace, and the dock.' }),
  Object.freeze({ id: 'desk', label: 'Desk', means: 'Views you switch between: overview, conversation, trace and spend, with what waits on you and the Roles beside them.' }),
  Object.freeze({ id: 'logbook', label: 'Logbook', means: 'A vertical log with clock times, the stage lights on a spine and the spend tape beside every entry.' }),
  Object.freeze({ id: 'proof', label: 'Proof', means: 'The brief as a document with its acceptance conditions and their proof, and everything said pinned in the margin.' }),
]);

function headerActions(view, extras) {
  if (extras.actions !== undefined) return extras.actions;
  const list = [];
  if (view.live.branch) list.push(button({ label: 'Check out', icon: 'branch', size: 'sm', action: 'work-checkout' }));
  if (['leased', 'queued', 'ingested', 'needs_human'].includes(view.live.state)) list.push(button({ label: 'Cancel Work Item', variant: 'danger-ghost', size: 'sm', action: 'work-cancel' }));
  return list.join('');
}

function head(view, extras, { level = 1, size = 'lg' } = {}) {
  const meta = [view.live.ref, `Team ${view.live.team}`, view.live.repo ? `${view.live.repo}${view.live.base ? ` → ${view.live.base}` : ''}` : ''].filter(Boolean).join(' · ');
  const actions = headerActions(view, extras);
  return `<header class="${cx('lv-page-head', `is-${size}`)}"><div class="lv-page-head-text"><div class="lv-page-stamps">${originStamp(view)}<span class="lv-page-meta">${escape(meta)}</span></div><h${level} class="lv-page-title" id="lv-page-title-${escape(view.id)}" tabindex="-1">${escape(view.title)}</h${level}></div><div class="lv-page-head-side">${presenceStack(view)}${actions ? `<div class="lv-page-actions">${actions}</div>` : ''}</div></header>`;
}

function contain(view) {
  return needsContainment(view.live) ? containmentPanel(view.live) : '';
}

/**
 * Direction I, the thread: the fold strip, then one conversation of the brief, every attempt and Run as a ticket,
 * context, Asks and steering with quiet stretches folded, what waits on you, and the intent bar. Beside it the live
 * sentence, the instruments, the Roles with the lease, and the questions answered from the record.
 * @param {object} view A `workView` result.
 * @param {{ primary?: string, actions?: string }} [extras] The app's next-step button and header actions.
 * @returns {string}
 */
export function threadPage(view, extras = {}) {
  return `<article class="lv lv-page lv-thread" data-live="thread" aria-labelledby="lv-page-title-${escape(view.id)}">${head(view, extras)}${foldStrip(view.live)}${contain(view)}<div class="lv-page-cols"><div class="lv-page-main">${timeline(view, { layout: 'chat' })}${decisionDock(view, extras)}${intentBar(view)}</div><aside class="lv-page-side" aria-label="Where it stands">${nowLine(view.live)}${instruments(view.live, { layout: 'list' })}<section class="lv-panel" aria-label="Roles"><h2 class="lv-overline">Roles</h2>${roleRoster(view)}${leaseBaton(view)}</section><section class="lv-panel">${answers(view.live, { layout: 'list', ask: false })}</section></aside></div></article>`;
}

/**
 * Direction J, the night cockpit: the same parts on the dark ground whatever the theme, the flight path with the live
 * sentence and an instrument strip as the hero, then the Shift dial with the Roles, the trace of the whole Shift with
 * its moves, and the dock with the intent bar.
 * @param {object} view A `workView` result.
 * @param {{ primary?: string, actions?: string, selectedCall?: string }} [extras]
 * @returns {string}
 */
export function cockpitPage(view, extras = {}) {
  return `<article class="lv lv-page lv-night" data-live="night-cockpit" aria-labelledby="lv-page-title-${escape(view.id)}">${head(view, extras, { size: 'sm' })}${contain(view)}<section class="lv-panel lv-night-hero" aria-label="Flight">${nowLine(view.live)}${flightPath(view.live, { id: `lv-night-flight-${view.id}` })}${instruments(view.live, { layout: 'strip' })}</section><div class="lv-night-grid"><section class="lv-panel lv-night-roles" aria-label="Shift and Roles">${shiftDial(view.live)}${roleRoster(view)}</section><section class="lv-panel lv-night-deck" aria-label="Decisions and messages">${decisionDock(view, { ...extras, quiet: true })}${intentBar(view, { id: `lv-night-intent-${view.id}` })}</section><section class="lv-panel lv-night-trace" aria-label="Trace"><h2 class="lv-overline">Trace · whole Shift</h2>${traceLanes(view.live, { selectedCall: extras.selectedCall ?? null })}${moveList(view.live, { selectedCall: extras.selectedCall ?? null })}</section></div></article>`;
}

/**
 * Direction K, the desk: a header with a short fold strip, four views switched by radio buttons that work without
 * script (overview, conversation, trace, spend), and beside them what waits on you, the Roles, the lease and the
 * intent bar.
 * @param {object} view A `workView` result.
 * @param {{ primary?: string, actions?: string, tab?: 'overview'|'talk'|'trace'|'spend' }} [extras]
 * @returns {string}
 */
export function deskPage(view, extras = {}) {
  const tab = extras.tab ?? 'overview';
  const name = `lv-desk-${view.id}`;
  const views = [['overview', 'Overview'], ['talk', `Conversation · ${view.entries.filter(entry => entry.kind !== 'fold').length}`], ['trace', `Trace · ${view.live.runs.length} ${view.live.runs.length === 1 ? 'Run' : 'Runs'}`], ['spend', 'Spend']];
  const switches = views.map(([id, label]) => `<label class="lv-desk-tab"><input class="${cx('lv-desk-radio', `is-${id}`)}" type="radio" name="${escape(name)}" value="${id}"${tab === id ? ' checked' : ''}><span>${escape(label)}</span></label>`).join('');
  const panels = [
    `<div class="${cx('lv-desk-panel', 'is-overview')}">${nowLine(view.live)}${instruments(view.live, { layout: 'tiles' })}<h2 class="lv-overline">Acceptance</h2>${acceptanceLedger(view)}${answers(view.live, { layout: 'chips', ask: false })}</div>`,
    `<div class="${cx('lv-desk-panel', 'is-talk')}">${timeline(view, { layout: 'compact', id: `lv-desk-tl-${view.id}` })}</div>`,
    `<div class="${cx('lv-desk-panel', 'is-trace')}">${traceLanes(view.live)}${moveList(view.live)}</div>`,
    `<div class="${cx('lv-desk-panel', 'is-spend')}">${spendTape(view)}${instruments(view.live, { layout: 'list' })}</div>`,
  ].join('');
  return `<article class="lv lv-page lv-desk" data-live="desk" aria-labelledby="lv-page-title-${escape(view.id)}">${head(view, extras, { size: 'md' })}${foldStrip(view.live, { size: 'mini' })}${contain(view)}<div class="lv-page-cols"><section class="lv-panel lv-desk-main" aria-label="Work Item views"><fieldset class="lv-desk-tabs"><legend class="sr-only">Show</legend>${switches}</fieldset>${panels}</section><aside class="lv-page-side" aria-label="Waiting on you and the Roles">${decisionDock(view, { ...extras, quiet: true })}<section class="lv-panel" aria-label="Roles"><h2 class="lv-overline">Roles</h2>${roleRoster(view)}${leaseBaton(view)}</section>${intentBar(view, { id: `lv-desk-intent-${view.id}` })}</aside></div></article>`;
}

/**
 * Direction L, the logbook: a header of figures (time in the air and on the ground, spend, what waits on you), then
 * the whole Work Item as a vertical log with clock times, a spine of stage lights and the spend tape beside every
 * entry; beside it the dock, the spend tape and the intent bar.
 * @param {object} view A `workView` result.
 * @param {{ primary?: string, actions?: string }} [extras]
 * @returns {string}
 */
export function logbookPage(view, extras = {}) {
  const live = view.live;
  const ground = live.time.lead !== null ? Math.max(0, live.time.lead - live.time.agent) : null;
  const figures = [['In the air', span(live.time.agent) || '0 s', ''], ['On the ground', ground === null ? 'Not known' : span(ground) || '0 s', ''], ['Spent', usd(live.spend.usd), ''], ['Waiting on you', String(view.decisions.length), view.decisions.length ? 'is-waiting' : '']];
  const board = `<dl class="lv-log-figures">${figures.map(([label, value, tone]) => `<div class="${cx('lv-log-figure', tone)}"><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>`;
  return `<article class="lv lv-page lv-logbook" data-live="logbook" aria-labelledby="lv-page-title-${escape(view.id)}">${head(view, extras)}${board}${contain(view)}<div class="lv-page-cols"><section class="lv-page-main" aria-label="Log">${timeline(view, { layout: 'log', id: `lv-log-${view.id}` })}</section><aside class="lv-page-side" aria-label="Act on it">${decisionDock(view, { ...extras, quiet: true })}<section class="lv-panel" aria-label="Spend"><h2 class="lv-overline">Spend tape</h2>${spendTape(view)}</section>${intentBar(view, { id: `lv-log-intent-${view.id}` })}</aside></div></article>`;
}

function margin(view) {
  const notes = view.entries.filter(entry => ['ask', 'steer', 'context', 'linked'].includes(entry.kind));
  if (!notes.length) return '<p class="lv-proof-empty">Nothing has been said about this Work Item yet.</p>';
  return timeline({ ...view, entries: notes, decisions: [], live: { ...view.live, running: null } }, { layout: 'compact', id: `lv-proof-margin-${view.id}` });
}

/**
 * Direction M, proof: the stages as a vertical rail, the brief as a document with its acceptance conditions and the
 * proof for each, the delivery under it, and in the margin what waits on you, everything people said about the work
 * and the intent bar.
 * @param {object} view A `workView` result.
 * @param {{ primary?: string, actions?: string }} [extras]
 * @param {(text: string) => string} [render] Renders the brief's Markdown; the app passes its own renderer.
 * @returns {string}
 */
export function proofPage(view, extras = {}, render = text => `<p>${escape(text)}</p>`) {
  const pr = view.live.pullRequest;
  const delivery = pr ? `<p class="lv-proof-delivery">${button({ label: `Open pull request${pr.number ? ` #${pr.number}` : ''}`, size: 'sm', href: pr.url, external: true })}${extras.primary ?? ''}</p>` : '<p class="lv-proof-delivery is-waiting">The pull request opens when the writer finishes and the reviewer approves. Accept and Reject appear here.</p>';
  return `<article class="lv lv-page lv-proof" data-live="proof" aria-labelledby="lv-page-title-${escape(view.id)}"><nav class="lv-proof-rail" aria-label="Where this Work Item stands">${foldStrip(view.live)}${instruments(view.live, { layout: 'list' })}</nav><div class="lv-proof-sheet">${head(view, extras)}${nowLine(view.live)}${contain(view)}<section class="lv-proof-brief" aria-label="Brief"><h2 class="lv-overline">Brief</h2><div class="lv-proof-prose prose" data-private>${view.brief.text ? render(view.brief.text) : '<p>No brief was written.</p>'}</div></section><section aria-label="Acceptance"><h2 class="lv-overline">Acceptance</h2>${acceptanceLedger(view)}</section><section aria-label="Delivery"><h2 class="lv-overline">Delivery</h2>${delivery}</section></div><aside class="lv-proof-margin" aria-label="Margin">${decisionDock(view, { ...extras, quiet: true })}<h2 class="lv-overline">Margin</h2>${margin(view)}${intentBar(view, { id: `lv-proof-intent-${view.id}` })}</aside></article>`;
}

function hero(view, extras) {
  const live = view.live;
  if (extras.decision) return `<div class="lv-unified-decision">${extras.decision}</div>`;
  if (view.decisions.length) return decisionDock(view, extras);
  const inside = live.followed && live.moves.length ? `<details class="lv-unified-inside"><summary class="lv-unified-inside-sum">Inside ${escape(live.followed.role)} · Run ${live.followed.n}: ${live.moves.length} ${live.moves.length === 1 ? 'move' : 'moves'}, ${live.calls.total ?? 0} calls</summary>${traceLanes(live, { scope: 'run', selectedCall: extras.selectedCall ?? null })}${moveList(live, { selectedCall: extras.selectedCall ?? null })}</details>` : '';
  if (live.running) return `<section class="lv-panel lv-unified-hero" aria-label="In flight">${nowLine(live)}${flightPath(live, { id: `lv-unified-flight-${view.id}` })}${instruments(live, { layout: 'strip' })}${inside}</section>`;
  return `<section class="lv-panel lv-unified-hero" aria-label="Where it stands">${nowLine(live)}${instruments(live, { layout: 'strip' })}</section>`;
}

function flightRecord(view) {
  const live = view.live;
  if (live.running && !view.decisions.length) return '';
  if (!live.runs.length) return '';
  return `<details class="lv-panel lv-unified-flight"${live.state === 'done' ? ' open' : ''}><summary class="lv-unified-inside-sum">How it went · ${live.attempts.length} ${live.attempts.length === 1 ? 'attempt' : 'attempts'}, ${live.runs.length} ${live.runs.length === 1 ? 'Run' : 'Runs'}${live.spend.usd !== null ? `, ${escape(usd(live.spend.usd))}` : ''}</summary>${flightPath(live, { id: `lv-unified-record-${view.id}` })}</details>`;
}

/**
 * The unified Work Item page: what a person needs first, then the detail. The fold strip says where the Work Item
 * stands; the band under it answers the one question that state raises: the app's own decision box when it waits
 * on you (a stop with its reason and fix, or the review with its checks), the flight path and instruments while it
 * flies, or the live sentence otherwise. Below it, three views switched without script: the conversation of the
 * brief, every Run, context, Asks and steering; the brief with its acceptance conditions and their proof; and the
 * trace of the whole Shift. Beside them the standing answers, the spend tape and the Roles with the lease. The intent
 * bar stays under the views.
 * @param {object} view A `workView` result.
 * @param {{ primary?: string, actions?: string, decision?: string, account?: string, tab?: 'talk'|'brief'|'trace', selectedCall?: string }} [extras]
 *   `decision` and `account` are the app's own decision box and the writer's problem and solution.
 * @param {(text: string) => string} [render] The brief's Markdown renderer.
 * @returns {string}
 */
export function unifiedPage(view, extras = {}, render = text => `<p>${escape(text)}</p>`) {
  const live = view.live;
  const tab = extras.tab ?? (live.state === 'awaiting_review' ? 'brief' : 'talk');
  const name = `lv-unified-${view.id}`;
  const conditions = view.brief.conditions.length;
  const tabs = [['talk', `Conversation · ${view.entries.filter(entry => entry.kind !== 'fold').length}`], ['brief', conditions ? `Brief · ${conditions} ${conditions === 1 ? 'condition' : 'conditions'}` : 'Brief'], ['trace', `Trace · ${live.runs.length} ${live.runs.length === 1 ? 'Run' : 'Runs'}`]];
  const switches = tabs.map(([id, label]) => `<label class="lv-desk-tab"><input class="${cx('lv-desk-radio', `is-${id}`)}" type="radio" name="${escape(name)}" value="${id}"${tab === id ? ' checked' : ''}><span>${escape(label)}</span></label>`).join('');
  const panels = [
    `<div class="${cx('lv-desk-panel', 'is-talk')}">${timeline(view, { layout: 'chat', id: `lv-unified-tl-${view.id}` })}</div>`,
    `<div class="${cx('lv-desk-panel', 'is-brief')}">${extras.account ?? ''}<section class="lv-proof-brief" aria-label="Brief"><div class="lv-proof-prose prose" data-private>${view.brief.text ? render(view.brief.text) : '<p>No brief was written.</p>'}</div></section><section aria-label="Acceptance"><h2 class="lv-overline">Acceptance</h2>${acceptanceLedger(view)}</section></div>`,
    `<div class="${cx('lv-desk-panel', 'is-trace')}">${live.runs.length ? `${traceLanes(live)}${moveList(live)}` : '<p class="lv-proof-empty">No Run has started yet.</p>'}</div>`,
  ].join('');
  return `<article class="lv lv-page lv-desk lv-unified" data-live="unified" aria-labelledby="lv-page-title-${escape(view.id)}">${head(view, extras)}${foldStrip(live)}${contain(view)}${hero(view, extras)}<div class="lv-page-cols"><div class="lv-page-main"><section class="lv-panel lv-desk-main" aria-label="Work Item views"><fieldset class="lv-desk-tabs"><legend class="sr-only">Show</legend>${switches}</fieldset>${panels}</section>${intentBar(view, { id: `lv-unified-intent-${view.id}` })}</div><aside class="lv-page-side" aria-label="At a glance"><section class="lv-panel">${answers(live, { layout: 'list', ask: false })}</section><section class="lv-panel" aria-label="Spend"><h2 class="lv-overline">Spend</h2>${spendTape(view)}</section><section class="lv-panel" aria-label="Roles"><h2 class="lv-overline">Roles</h2>${roleRoster(view)}${leaseBaton(view)}${presenceStack(view, { names: true })}</section></aside></div>${flightRecord(view)}</article>`;
}

const pages = { unified: unifiedPage, thread: threadPage, cockpit: cockpitPage, desk: deskPage, logbook: logbookPage, proof: proofPage };

/**
 * The Work Item page in one of the `workLayouts`.
 * @param {string} layout A `workLayouts` id.
 * @param {object} view A `workView` result.
 * @param {object} [extras] Passed to the layout.
 * @param {(text: string) => string} [render] The brief's Markdown renderer, for `proof`.
 * @returns {string}
 */
export function workPage(layout, view, extras = {}, render) {
  const draw = pages[layout] ?? unifiedPage;
  return `<div class="lv-page-frame">${draw(view, extras, render)}</div>`;
}
