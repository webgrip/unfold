import { button } from '../core/ui.js';
import { answers } from './answers.js';
import { containmentPanel, needsContainment } from './containment.js';
import { shiftDial } from './dial.js';
import { flightPath } from './flight-path.js';
import { foldStrip } from './fold-strip.js';
import { instruments } from './instruments.js';
import { nowLine } from './layouts.js';
import { cx, escape } from './parts.js';
import { activitySummary, moveList, traceLanes } from './trace.js';
import { workKindMeta } from '../core/work-kind.js';
import { acceptanceLedger, roleRoster, decisionDock, intentBar, leaseBaton, originStamp, presenceStack, spendTape, timeline } from './work-parts.js';

function headerActions(view, extras) {
  const own = extras.session?.actions ?? '';
  if (extras.actions !== undefined) return `${extras.actions}${own}`;
  const list = [];
  if (view.live.branch) list.push(button({ label: 'Check out', icon: 'branch', size: 'sm', action: 'work-checkout' }));
  const cancel = extras.cancel !== undefined ? extras.cancel : ['leased', 'active', 'queued', 'ingested'].includes(view.live.state) ? {} : null;
  if (cancel && !own.includes('data-action="cancel"')) list.push(button({ label: 'Cancel Work Item', variant: 'danger-ghost', size: 'sm', action: 'work-cancel', data: { id: view.live.id ?? view.id }, busy: Boolean(cancel.busy) }));
  return `${list.join('')}${own}`;
}

function head(view, extras) {
  const meta = [view.live.ref, `Team ${view.live.team}`, view.live.repo ? `${view.live.repo}${view.live.base ? ` → ${view.live.base}` : ''}` : ''].filter(Boolean).join(' · ');
  const actions = headerActions(view, extras);
  return `<header class="lv-page-head is-lg"><div class="lv-page-head-text"><div class="lv-page-stamps">${originStamp(view)}<span class="lv-page-meta">${escape(meta)}</span></div><h1 class="lv-page-title" id="lv-page-title-${escape(view.id)}" tabindex="-1">${escape(view.title)}</h1></div><div class="lv-page-head-side">${presenceStack(view)}${actions ? `<div class="lv-page-actions">${actions}</div>` : ''}</div></header>`;
}

function contain(view) {
  const live = view.live;
  const current = Boolean(live.guard?.signals.length || live.guard?.drift?.length) || ['watch', 'off_track'].includes(live.health?.health);
  return needsContainment(live) && current ? containmentPanel(live) : '';
}

function decisionBand(view, extras) {
  const own = `${extras.session?.decision ?? ''}${extras.decision ?? ''}`;
  if (own) return `<div class="lv-unified-decision">${own}</div>`;
  return view.decisions.length ? decisionDock(view, extras) : '';
}

function flightDeck(view, extras) {
  const live = view.live;
  const inside = live.followed && live.moves.length ? `<details class="lv-unified-inside"${live.running ? ' open' : ''}><summary class="lv-unified-inside-sum">Inside ${escape(live.followed.role)} · Run ${live.followed.n}${live.work ? ` · <span class="lv-work-kind" title="${escape(`${live.work.label}, because ${live.work.rule}. Expected result: ${workKindMeta(live.work.kind).result}.`)}">${escape(live.work.label)}${live.work.source === 'default' ? ' (default)' : ''}</span>` : ''}: ${escape(activitySummary(live) ?? `${live.calls.total ?? 0} calls`)}</summary>${traceLanes(live, { scope: 'run', selectedCall: extras.selectedCall ?? null })}${moveList(live, { selectedCall: extras.selectedCall ?? null })}</details>` : '';
  return `<section class="lv-panel lv-unified-deck" aria-label="Flight">${nowLine(live)}${flightPath(live, { id: `lv-unified-flight-${view.id}` })}${instruments(live, { layout: 'strip' })}${inside}</section>`;
}

/** The views the Work Item page switches between under its flight deck, in order; `evidence` shows only for a Work Item started in Unfold. */
export const workTabs = Object.freeze(['log', 'brief', 'trace', 'evidence']);

/**
 * The Work Item page: one page for a Work Item and, when it was started in Unfold, the session that started it.
 * The fold strip says where it stands; under it what waits on a person (the app's stop or review box and the
 * session's own questions and permission requests), then the flight deck on the dark ground: the live sentence, the
 * flight path, the instrument strip and, open while a Run works, what that Run is doing. Below it, views switched
 * without script: the log of everything that happened with clock times and the spend tape, where every Run opens in
 * place to what the agent did and its pod logs; the brief with its acceptance conditions; the trace of the whole
 * Shift; and, for a Work Item started in Unfold, the session's evidence (activity, gateway calls, changes, checks and
 * hand-off). The intent bar sits under the views. Beside them the Shift dial, the standing answers, the spend tape,
 * the Roles with the lease and who is here, then the session's budget, candidate and execution facts.
 * @param {object} view A `workView` result.
 * @param {object} [extras]
 * @param {string} [extras.primary] The app's next-step button.
 * @param {string} [extras.actions] Header actions that replace the defaults.
 * @param {{ busy?: boolean } | null} [extras.cancel] Whether Cancel would stop anything; null hides the button.
 * @param {string} [extras.decision] The app's own decision box.
 * @param {string} [extras.account] The writer's problem and solution.
 * @param {'log'|'brief'|'trace'|'evidence'} [extras.tab] The view that opens.
 * @param {'steer'|'ask'|'context'} [extras.intent] The intent bar's mode.
 * @param {string} [extras.selectedCall]
 * @param {(runId: string) => string} [extras.runDetail] The body of one Run: what it did, its transcript and its pod
 *   logs. Without it a Run in the log is a closed ticket.
 * @param {{ decision?: string, actions?: string, evidence?: string, evidenceLabel?: string, side?: string }} [extras.session]
 *   The parts of the session that started the Work Item, already drawn by the app.
 * @param {(text: string) => string} [render] The brief's Markdown renderer.
 * @returns {string}
 */
export function workItemPage(view, extras = {}, render = text => `<p>${escape(text)}</p>`) {
  const live = view.live;
  const session = extras.session ?? null;
  const evidence = Boolean(session?.evidence);
  const fallback = live.state === 'awaiting_review' ? 'brief' : 'log';
  const tab = extras.tab === 'evidence' && !evidence ? fallback : extras.tab ?? fallback;
  const name = `lv-unified-${view.id}`;
  const conditions = view.brief.conditions.length;
  const tabs = [['log', `Log · ${view.entries.filter(entry => entry.kind !== 'fold').length}`], ['brief', conditions ? `Brief · ${conditions} ${conditions === 1 ? 'condition' : 'conditions'}` : 'Brief'], ['trace', `Trace · ${live.runs.length} ${live.runs.length === 1 ? 'Run' : 'Runs'}`], ...(evidence ? [['evidence', session.evidenceLabel || 'Evidence']] : [])];
  const switches = tabs.map(([id, label]) => `<label class="lv-desk-tab"><input class="${cx('lv-desk-radio', `is-${id}`)}" type="radio" name="${escape(name)}" value="${id}"${tab === id ? ' checked' : ''}><span>${escape(label)}</span></label>`).join('');
  const panels = [
    `<div class="${cx('lv-desk-panel', 'is-log')}">${timeline(view, { layout: 'log', id: `lv-unified-tl-${view.id}`, runDetail: extras.runDetail })}</div>`,
    `<div class="${cx('lv-desk-panel', 'is-brief')}">${extras.account ?? ''}<section class="lv-proof-brief" aria-label="Brief"><div class="lv-proof-prose prose" data-private>${view.brief.text ? render(view.brief.text) : '<p>No brief was written.</p>'}</div></section><section aria-label="Acceptance"><h2 class="lv-overline">Acceptance</h2>${acceptanceLedger(view)}</section></div>`,
    `<div class="${cx('lv-desk-panel', 'is-trace')}">${live.runs.length ? `${traceLanes(live)}${moveList(live)}` : '<p class="lv-proof-empty">No Run has started yet.</p>'}</div>`,
    evidence ? `<div class="${cx('lv-desk-panel', 'is-evidence')}">${session.evidence}</div>` : '',
  ].join('');
  const side = [
    live.runs.length ? `<section class="lv-panel lv-unified-dial" aria-label="Shift">${shiftDial(live)}</section>` : '',
    `<section class="lv-panel">${answers(live, { layout: 'list', ask: false })}</section>`,
    `<section class="lv-panel" aria-label="Spend"><h2 class="lv-overline">Spend</h2>${spendTape(view)}</section>`,
    `<section class="lv-panel" aria-label="Roles"><h2 class="lv-overline">Roles</h2>${roleRoster(view)}${leaseBaton(view)}${presenceStack(view, { names: true })}</section>`,
    session?.side ? `<div class="lv-unified-session">${session.side}</div>` : '',
  ].join('');
  return `<article class="lv lv-page lv-desk lv-unified" data-live="work-item" aria-labelledby="lv-page-title-${escape(view.id)}">${head(view, extras)}${foldStrip(live)}${contain(view)}${decisionBand(view, extras)}${flightDeck(view, extras)}<div class="lv-page-cols"><div class="lv-page-main"><section class="lv-panel lv-desk-main" aria-label="Work Item views"><fieldset class="lv-desk-tabs"><legend class="sr-only">Show</legend>${switches}</fieldset>${panels}</section>${intentBar(view, { id: `lv-unified-intent-${view.id}`, mode: extras.intent })}</div><aside class="lv-page-side" aria-label="At a glance">${side}</aside></div></article>`;
}

/**
 * The Work Item page in its frame.
 * @param {object} view A `workView` result.
 * @param {object} [extras] Passed to `workItemPage`.
 * @param {(text: string) => string} [render] The brief's Markdown renderer.
 * @returns {string}
 */
export function workPage(view, extras = {}, render) {
  return `<div class="lv-page-frame">${workItemPage(view, extras, render)}</div>`;
}
