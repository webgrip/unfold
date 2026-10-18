import { button } from '../core/ui.js';
import { answers } from './answers.js';
import { containmentPanel } from './containment.js';
import { shiftDial } from './dial.js';
import { flightPath } from './flight-path.js';
import { foldStrip } from './fold-strip.js';
import { instruments } from './instruments.js';
import { clock, cx, escape, liveSentence, span, usd } from './parts.js';
import { moveList, traceLanes } from './trace.js';

function header(model, { level = 1 } = {}) {
  const meta = [model.ref, `Team ${model.team}`, model.repo ? `${model.repo}${model.base ? ` → ${model.base}` : ''}` : ''].filter(Boolean).join(' · ');
  return `<header class="lv-head"><div class="lv-head-text"><p class="lv-meta">${escape(meta)}</p><h${level} class="lv-title">${escape(model.title)}</h${level}></div><div class="lv-actions">${actions(model)}</div></header>`;
}

function actions(model) {
  const list = [];
  if (model.state === 'awaiting_review' && model.pullRequest) list.push(button({ label: 'Open the pull request', variant: 'primary', href: model.pullRequest.url, external: true }));
  if (['leased', 'queued', 'ingested', 'needs_human'].includes(model.state)) list.push(button({ label: 'Add context', variant: 'ghost' }));
  if (['leased', 'queued', 'ingested'].includes(model.state)) list.push(button({ label: 'Cancel Work Item', variant: 'secondary' }));
  return list.join('');
}

/**
 * The live sentence block: where the Work Item stands in one line, with a dot in its health tone.
 * @param {object} model A `liveModel` result.
 * @returns {string}
 */
export function nowLine(model) {
  const sentence = liveSentence(model);
  return `<div class="${cx('lv-now', `lv-tone-${sentence.tone}`)}" role="status"><span class="${cx('lv-now-dot', model.running ? 'is-live' : '')}" aria-hidden="true"></span><p class="lv-now-text"><strong class="lv-now-head">${escape(sentence.head)}</strong> <span class="lv-now-sub">${escape(sentence.sub)}</span></p>${model.running && model.calls.lastAt ? `<p class="lv-now-beat">last call ${escape(clock(model.calls.lastAt))}${model.lease?.secondsLeft !== null && model.lease ? ` · lease ${model.lease.secondsLeft > 0 ? `${span(model.lease.secondsLeft)} left` : 'expired'}` : ''}</p>` : ''}</div>`;
}

function facts(model) {
  const list = [model.lease?.expiresAt ? `Lease to ${clock(model.lease.expiresAt)}` : '', model.branch ? `Branch ${model.branch}` : '', model.allowance ? `Ask Allowance ${usd(model.allowance.leftUsd)} left` : ''].filter(Boolean);
  return list.length ? `<p class="lv-facts">${list.map(fact => `<span>${escape(fact)}</span>`).join('')}</p>` : '';
}

/**
 * Direction F, the cockpit: the flight path with its instruments, the trace of the selected attempt opening right
 * under it, and the standing answers beside it. The containment panel sits above the flight when a tripwire, a rules
 * change or an AI judge verdict gives a reason to look.
 * @param {object} model A `liveModel` result.
 * @param {{ selectedCall?: string }} [options]
 * @returns {string}
 */
export function cockpit(model, { selectedCall = null } = {}) {
  const followed = model.followed;
  const trace = followed && model.moves.length
    ? `<section class="lv-panel lv-panel-attached" aria-labelledby="lv-cockpit-trace-${escape(model.id)}"><h2 class="lv-overline lv-overline-live" id="lv-cockpit-trace-${escape(model.id)}">Inside attempt ${followed.attempt} · Run ${followed.n} · ${escape(clock(followed.startedAt))} → ${followed.state === 'running' ? 'now' : escape(clock(followed.finishedAt))}</h2>${traceLanes(model, { selectedCall, scope: 'run' })}${moveList(model, { selectedCall })}</section>`
    : '';
  return `<article class="lv lv-cockpit" data-live="cockpit">${header(model)}<div class="lv-cols"><div class="lv-main">${containmentPanel(model)}<section class="${cx('lv-panel', trace ? 'lv-panel-top' : '')}" aria-label="Flight">${nowLine(model)}${instruments(model, { layout: 'strip' })}${flightPath(model)}</section>${trace}</div><aside class="lv-side lv-panel">${answers(model, { layout: 'list' })}${facts(model)}</aside></div></article>`;
}

/**
 * Direction G, the instrument: the Shift dial and its figures in a side column, the fold strip on top, the standing
 * answers as questions to open, and the whole Shift's trace with the moves below. The containment panel leads the
 * main column when there is a reason to look.
 * @param {object} model A `liveModel` result.
 * @param {{ selectedCall?: string }} [options]
 * @returns {string}
 */
export function instrumentPanel(model, { selectedCall = null } = {}) {
  return `<article class="lv lv-instrument" data-live="instrument"><div class="lv-cols lv-cols-reverse"><aside class="lv-side">${header(model)}${shiftDial(model)}${instruments(model, { layout: 'list' })}${facts(model)}</aside><div class="lv-main">${containmentPanel(model)}${foldStrip(model)}<section class="lv-panel">${nowLine(model)}${answers(model, { layout: 'chips', ask: false })}</section><section class="lv-panel" aria-label="Trace"><h2 class="lv-overline">Trace · whole Shift</h2>${traceLanes(model, { selectedCall })}${moveList(model, { selectedCall })}</section></div></div></article>`;
}

/**
 * One row of the Work list: reference, title, the mini fold strip and one line of state.
 * @param {object} model A `liveModel` result.
 * @param {{ selected?: boolean, href?: string }} [options]
 * @returns {string}
 */
export function fleetRow(model, { selected = false, href = `#work/${model.id}` } = {}) {
  const sentence = liveSentence(model);
  const trail = model.running ? span(model.running.seconds) : usd(model.spend.usd);
  return `<li class="lv-row-item"><a class="${cx('lv-row', selected ? 'is-selected' : '')}" href="${escape(href)}"${selected ? ' aria-current="true"' : ''}><span class="lv-row-meta"><span>${escape(model.ref)}${model.repo ? ` · ${escape(model.repo)}` : ''}</span><span class="${cx('lv-row-trail', model.running ? 'is-live' : '')}">${escape(trail)}</span></span><span class="lv-row-title">${escape(model.title)}</span>${foldStrip(model, { size: 'mini' })}<span class="lv-row-sub">${escape(sentence.head)} ${escape(sentence.sub)}</span></a></li>`;
}

/**
 * Direction H, the fleet: the Work list where every row carries its fold strip, and the selected Work Item's flight,
 * instruments and two standing answers beside it.
 * @param {object[]} models `liveModel` results, in list order.
 * @param {{ selected?: number }} [options] Index of the selected row.
 * @returns {string}
 */
export function fleet(models, { selected = 0 } = {}) {
  const chosen = models[selected];
  const running = models.filter(model => model.running).length;
  const waiting = models.filter(model => ['awaiting_review', 'needs_human'].includes(model.state)).length;
  const landed = models.filter(model => model.state === 'done').length;
  const summary = `<dl class="lv-fleet-counts"><div><dt>In flight</dt><dd>${running}</dd></div><div class="${waiting ? 'lv-tone-review' : ''}"><dt>Waiting for you</dt><dd>${waiting}</dd></div><div><dt>Landed</dt><dd>${landed}</dd></div></dl>`;
  const list = `<ol class="lv-rows" aria-label="Work Items">${models.map((model, index) => fleetRow(model, { selected: index === selected })).join('')}</ol>`;
  const detail = chosen ? `<section class="lv-panel lv-fleet-detail" aria-label="Selected Work Item">${header(chosen, { level: 2 })}${nowLine(chosen)}${flightPath(chosen, { id: `lv-fleet-flight-${chosen.id}` })}${instruments(chosen, { layout: 'strip' })}${answers(chosen, { layout: 'chips', ask: false })}</section>` : '';
  return `<article class="lv lv-fleet" data-live="fleet"><header class="lv-fleet-head"><h1 class="lv-title">Work</h1>${summary}</header><div class="lv-cols"><div class="lv-fleet-list">${list}</div><div class="lv-main">${detail}</div></div></article>`;
}
