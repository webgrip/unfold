import { cardView } from '../../card-model.js';
import { clockText, emitMoments, kpiStrip, rarityFrame, rarityMark } from '../../skin-kit.js';
import { clockChoices } from '../../card-kpis.js';

/** The skin's name, matching its folder and manifest. */
export const id = 'vloer-native';

const newTab = '<span class="sr-only"> (opens in a new tab)</span>';
const statusNote = { uncollected: 'Ploeg does not collect this yet', unreported: 'Ploeg did not report this', planned: 'Planned for a later phase', demo: 'The demo makes no model calls' };
const restingLight = Object.freeze({ x: 0.82, y: 0.12 });
const idleFinishes = new Set(['foil', 'holo', 'infinity']);
const movingLimit = 3;
const lightProperties = [['--gc-dx', 'number', String(restingLight.x)], ['--gc-dy', 'number', String(restingLight.y)], ['--gc-orbit', 'angle', '220deg'], ['--gc-sweep', 'angle', '0deg']];
const rarityTones = Object.freeze({ common: 'silver', uncommon: 'gold', rare: 'silver', epic: 'gold', legendary: 'prism' });
const momentTones = Object.freeze({ merged: 'gold', released: 'live', finish: 'prism', cracked: 'ink', mended: 'gold', graded: 'silver', set: 'gold' });
const momentTargets = Object.freeze({ merged: '[data-slot="state"]', released: '.day, [data-slot="state"]', rarity: '.uc-rarity', finish: '.day', cracked: '[data-slot="condition"]', mended: '[data-slot="condition"]', graded: '[data-slot="state"]', set: '[data-slot="set"]' });

function register() {
  if (typeof CSS === 'undefined' || typeof CSS.registerProperty !== 'function') return false;
  for (const [name, syntax, initialValue] of lightProperties) {
    try { CSS.registerProperty({ name, syntax: `<${syntax}>`, inherits: true, initialValue }); }
    catch (error) { if (error?.name !== 'InvalidModificationError') return false; }
  }
  return true;
}

const registered = register();
const moving = new Set();
const waiting = new Set();
const observer = registered && typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => { for (const entry of entries) (entry.isIntersecting ? claimSlot : freeSlot)(entry.target); }) : null;

function claimSlot(card) {
  if (moving.has(card)) return;
  if (moving.size >= movingLimit) { waiting.add(card); return; }
  moving.add(card);
  card.dataset.gcAnimate = '';
}

function freeSlot(card) {
  waiting.delete(card);
  if (!moving.delete(card)) return;
  delete card.dataset.gcAnimate;
  const next = waiting.values().next().value;
  if (next) { waiting.delete(next); claimSlot(next); }
}

function link(h, url, label, extra = '') {
  const href = h.link(url);
  return href ? `<a href="${h.escape(href)}" target="_blank" rel="noopener noreferrer"${extra}>${label}${newTab}</a>` : label;
}

function ring(v, h) {
  const share = v.cost.share;
  const arc = share !== null && share > 0 ? `<circle class="fg" cx="20" cy="20" r="16" pathLength="100" stroke-dasharray="${(share * 100).toFixed(1)} 100"/>` : '';
  return `<div class="ring" data-slot="cost" data-status="${h.escape(v.cost.status)}"${v.cost.over ? ' data-over' : ''} role="img" aria-label="${h.escape(v.cost.label)}">
    <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle class="tr" cx="20" cy="20" r="16"/>${arc}</svg>
    <div class="mid" aria-hidden="true"><b>${h.escape(v.cost.value)}</b>${v.cost.caption ? `<span>${h.escape(v.cost.caption)}</span>` : ''}</div>
  </div>`;
}

function tile(label, body, { cls = '', title = '' } = {}) {
  return `<div class="t${cls ? ` ${cls}` : ''}"${title ? ` title="${title}"` : ''}><small>${label}</small><b>${body}</b></div>`;
}

function tiles(v, h) {
  const e = h.escape;
  const quiet = value => `<span class="sub">${e(value)}</span>`;
  const tokens = v.tokens.known ? `${e(v.tokens.value)}${v.tokens.partial ? '<span class="partial" aria-hidden="true">*</span>' : ''}` : quiet(v.tokens.value);
  const time = v.runTime.known ? `${e(v.runTime.value)}${v.runTime.live ? ` ${quiet('so far')}` : ''}` : quiet(v.runTime.value);
  const diff = v.diff.known ? `<span class="add">${e(v.diff.addText)}</span> <span class="rem">${e(v.diff.delText)}</span>${v.diff.filesText ? ` <span class="sub">${e(v.diff.filesText)}</span>` : ''}` : quiet(v.diff.value);
  let pr = quiet('No pull request yet');
  if (v.pr) {
    const ci = v.pr.ci
      ? `<span class="ci" data-tone="${e(v.pr.ci.tone)}" title="${e(v.pr.ci.label)}">${h.icon(v.pr.ci.glyph)}<span class="sr-only">${e(v.pr.ci.label)}</span></span>`
      : `<span class="ci" data-tone="none" title="CI not reported"><span aria-hidden="true">–</span><span class="sr-only">CI not reported</span></span>`;
    pr = `${link(h, v.pr.url, e(v.pr.text))} <span class="pst" data-tone="${e(v.pr.state.tone)}">${e(v.pr.state.label)}</span>${ci}`;
  }
  return `<div class="tiles">
    ${tile('Tokens', tokens, { title: v.tokens.detail ? e(v.tokens.detail) : '' })}
    ${tile('Run time', time)}
    ${tile('Diff', diff, { cls: 't-wide' })}
    ${tile('PR · CI', pr, { cls: 't-wide' })}
  </div>`;
}

const finishLayers = {
  matte: [],
  foil: ['edge'],
  holo: ['edge', 'spot'],
  prism: ['edge', 'spot', 'film'],
  gilded: ['edge', 'spot', 'film', 'gild'],
  infinity: ['orbit', 'spot', 'film', 'gild'],
};

function layers(v) {
  return (finishLayers[v.finish.key] || []).map(name => `<i class="fx fx-${name}" aria-hidden="true"></i>`).join('');
}

function dayChip(v, h) {
  const e = h.escape;
  const release = v.release;
  if (!release?.released) return '';
  const since = release.source === 'merge' ? `since the merge (${release.note})` : `since the first deploy to ${release.environment}`;
  return `<span class="day" data-finish="${e(release.finish.key)}" data-source="${e(release.source)}" title="${e(`${release.days} ${release.days === 1 ? 'day' : 'days'} live ${since}`)}"><b>${e(release.dayText)}</b><span class="dot" aria-hidden="true"></span><span class="fin">${e(release.finish.label)}</span></span>`;
}

function gatesStrip(v, h) {
  const e = h.escape;
  const gates = v.gates;
  if (!gates) return '';
  const steps = gates.steps.map(step => {
    const counted = step.bounces.filter(entry => entry.counts).length;
    const why = step.bounces.map(entry => `${entry.reasonText.toLowerCase()}${entry.actor ? ` (${entry.actor})` : ''}`).join(', ');
    const marker = step.bounces.length ? `<span class="gb" data-counts="${counted ? 'true' : 'false'}" title="${e(`${step.bounces.length} back from ${step.label.toLowerCase()}: ${why}`)}">${h.icon('back')}<span aria-hidden="true">${e(step.bounces.length)}</span><span class="sr-only">${e(`, ${step.bounces.length === 1 ? 'one bounce' : `${step.bounces.length} bounces`} back: ${why}`)}</span></span>` : '';
    return `<li data-gate="${e(step.key)}" data-state="${e(step.state)}"${step.state === 'current' ? ' aria-current="step"' : ''}><span class="gd" aria-hidden="true"></span><span class="gl">${e(step.short)}<span class="sr-only">${e(` (${step.label}${step.state === 'current' ? ', now' : step.state === 'passed' ? ', passed' : ', ahead'})`)}</span></span>${marker}</li>`;
  }).join('');
  const rft = gates.rightFirstTime;
  const chip = rft ? `<span class="chip rft" data-tone="${rft.state === 'yes' ? 'success' : 'attention'}" title="${e(rft.detail)}">${h.icon(rft.state === 'yes' ? 'check' : 'back')}<span>${e(rft.text)}</span></span>` : '';
  return `<div class="gates" data-slot="gates"><ol class="gs" aria-label="${e(gates.label)}">${steps}</ol>${chip}</div>`;
}

function badges(v, h) {
  const e = h.escape;
  const out = [];
  if (v.condition) out.push(`<span class="chip" data-slot="condition" data-condition="${e(v.condition.state)}" data-tone="${v.condition.state === 'mended' ? 'success' : 'danger'}" title="${e(v.condition.text)}">${h.icon(v.condition.state === 'mended' ? 'check-circle' : 'x-circle')}<span>${e(v.condition.chip)}</span></span>`);
  if (v.evolved) out.push(`<span class="chip" data-slot="evolved" data-tone="attention" title="The requirement changed after acceptance, or a bug was traced to a changed requirement">${h.icon('refresh')}<span>Evolved</span></span>`);
  if (v.set) out.push(`<span class="chip set" data-slot="set" title="${e(`${v.set.text}${v.set.complete ? ' · set complete' : ''}`)}">${h.icon('grid')}<span>${e(v.set.chip)}</span></span>`);
  return out.join('');
}

function front(v, h) {
  const e = h.escape;
  const signed = v.steward.signed;
  const initials = signed ? v.steward.name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() : '';
  return `<article class="card" data-tone="${e(v.state.tone)}" data-finish="${e(v.finish.key)}" data-finish-level="${e(v.finish.level)}" aria-label="Run card: ${e(v.title)}">
    ${layers(v)}${rarityFrame(v)}<header class="hd">
      <span class="role" aria-hidden="true">${h.icon(v.pr ? 'pull-request' : 'work')}</span>
      <div class="who"><b>Ticket card</b><span>${e(v.repo || v.team || 'No repository')}</span></div>
      <span class="hd-end">${rarityMark(v, h)}${v.demo ? '<span class="demo" title="Illustrative record: no model calls, no spend">Demo</span>' : ''}</span>
    </header>
    <div class="tl">
      <h3 class="title" data-slot="title">${e(v.title)}</h3>
      <div class="row"><span class="chip" data-slot="state" data-tone="${e(v.state.tone)}" title="${e(v.state.description || '')}">${h.icon(v.state.glyph)}<span>${e(v.state.label)}</span></span>${dayChip(v, h)}${badges(v, h)}</div>
    </div>
    ${gatesStrip(v, h)}
    ${kpiStrip(v, h)}
    <div class="main">${ring(v, h)}${tiles(v, h)}</div>
    <p class="crew"><small>Crew</small><span>${e(v.crew)}</span></p>
    <div class="sign${signed ? '' : ' off'}" data-slot="steward">
      <span class="av" aria-hidden="true">${e(initials)}</span>
      <span class="sg">${signed ? `<span class="name">${e(v.steward.name)}</span>` : '<span class="line" aria-hidden="true"></span>'}<small>${signed ? `Steward · ${e(v.steward.detail || 'signed')}` : `Unsigned · ${e(v.steward.detail)}`}</small></span>
      <span class="sr-only">${e(v.steward.text)}</span>
    </div>
    <footer class="meta">
      <span class="plays">${h.icon('layers')}${e(v.plays.text)}</span>
      <span class="ids" data-slot="ids">${e(v.ids.join(' · '))}</span>
    </footer>
    <button type="button" class="more" data-card-action="flip">More info${h.icon('chevron')}</button>
  </article>`;
}

function rows(tab, h) {
  const e = h.escape;
  if (!tab.rows?.length) return '';
  return `<dl class="rows">${tab.rows.map(entry => `<div data-status="${e(entry.status)}"${entry.tone ? ` data-tone="${e(entry.tone)}"` : ''}><dt${entry.meaning ? ` title="${e(entry.meaning)}"` : ''}>${e(entry.label)}</dt><dd${statusNote[entry.status] ? ` title="${e(statusNote[entry.status])}"` : ''}>${clockText(entry.value, entry.working, h)}</dd></div>`).join('')}</dl>`;
}

function groups(tab, h) {
  const e = h.escape;
  return (tab.groups || []).map(group => `<section class="group"><h4>${e(group.title)}</h4>${blocks(group, h)}${rows(group, h)}</section>`).join('');
}

function clockBlock(block, h) {
  const e = h.escape;
  const buttons = clockChoices.map(choice => `<button type="button" class="kp-choice" data-card-action="clock" data-clock-choice="${e(choice.key)}" aria-pressed="${choice.key === 'calendar'}">${e(choice.label)}</button>`).join('');
  return `<div class="kp-clock"><div class="kp-toggle" role="group" aria-label="Show durations as">${buttons}</div>${block.calendar ? `<p class="kp-calendar">${e(block.calendar)}</p>` : ''}</div>`;
}

function statsBlock(block, h) {
  const e = h.escape;
  return `<dl class="kp-stats" aria-label="${e(block.label)}">${block.items.map(item => `<div class="kp-stat" data-kpi="${e(item.key)}" data-tone="${e(item.tone)}"${item.live ? ' data-live' : ''}${item.meaning ? ` title="${e(item.meaning)}"` : ''}><dt>${e(item.label)}</dt><dd>${clockText(item.value, item.working, h)}${item.detail ? `<small>${e(item.detail)}</small>` : ''}</dd></div>`).join('')}</dl>`;
}

function barRects(segments, share, h) {
  const e = h.escape;
  let x = 0;
  return segments.map(entry => {
    const width = entry[share] * 1000;
    const rect = width > 0 ? `<rect x="${x.toFixed(2)}" y="0" width="${Math.max(0, width - 2).toFixed(2)}" height="24" data-kind="${e(entry.kind)}"${entry.current ? ' data-current' : ''}><title>${e(`${entry.status} · ${entry.kindLabel.toLowerCase()} · ${share === 'share' ? entry.time?.text : entry.time?.workingText} (${Math.round(entry[share] * 100)}%)`)}</title></rect>` : '';
    x += width;
    return rect;
  }).join('');
}

function barBlock(block, h) {
  const e = h.escape;
  const legend = block.kinds.map(kind => `<li data-kind="${e(kind.key)}" title="${e(kind.meaning)}"><i aria-hidden="true"></i>${e(kind.label)} <b>${clockText(kind.time?.text ?? '', kind.time?.workingText ?? '', h)}</b></li>`).join('');
  const working = block.total?.working ? barRects(block.segments, 'workingShare', h) : '';
  const summary = `${block.label}: ${block.segments.map(entry => `${entry.status} ${entry.time?.text ?? ''}`).join(', ')}. The table below lists the same.`;
  return `<figure class="kp-bar">
    <figcaption>${e(block.label)} <span>${clockText(block.total?.text ?? '', block.total?.workingText ?? '', h)}</span></figcaption>
    <svg viewBox="0 0 1000 24" preserveAspectRatio="none" role="img" aria-label="${e(summary)}" focusable="false"><defs><pattern id="kp-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="10" class="kp-hatch"/></pattern></defs><g data-clock-value="calendar">${barRects(block.segments, 'share', h)}</g><g data-clock-value="working">${working || '<text x="500" y="16" text-anchor="middle" class="kp-none">No working hours in these statuses</text>'}</g></svg>
    <ul class="kp-legend">${legend}</ul>
    ${block.note ? `<p class="kp-bar-note">${e(block.note)}</p>` : ''}
  </figure>`;
}

function tableBlock(block, h) {
  const e = h.escape;
  const head = block.columns.map(column => `<th scope="col"${column.numeric ? ' class="num"' : ''}>${e(column.label)}</th>`).join('');
  const body = block.rows.map(entry => `<tr data-kind="${e(entry.kind)}"${entry.current ? ' data-current' : ''}>${block.columns.map((column, index) => index === 0 ? `<th scope="row"><i class="kp-swatch" aria-hidden="true"></i>${e(entry.cells[column.key])}${entry.current ? ' <span class="kp-now">now</span>' : ''}</th>` : `<td${column.numeric ? ' class="num"' : ''}>${e(entry.cells[column.key])}</td>`).join('')}</tr>`).join('');
  return `<div class="kp-table-wrap"><table class="kp-table"><caption class="sr-only">${e(block.caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function stepsBlock(block, h) {
  const e = h.escape;
  if (!block.items.length) return '';
  return `<ol class="kp-steps" aria-label="${e(block.label)}">${block.items.map(item => `<li data-state="${e(item.state)}" data-step="${e(item.key)}"><span class="kp-dot" aria-hidden="true"></span><span class="kp-step"><b>${e(item.label)}</b>${item.at ? `<small>${e(item.at)}</small>` : ''}${item.gap ? `<span class="kp-gap"${item.state === 'done' ? ' title="Since the step before"' : ''}>${e(item.gap)}</span>` : ''}</span></li>`).join('')}</ol>`;
}

function glossaryBlock(block, h) {
  const e = h.escape;
  return `<details class="kp-glossary"><summary>${e(block.label)}</summary><dl>${block.items.map(item => `<div><dt>${e(item.term)}</dt><dd>${e(item.meaning)}</dd></div>`).join('')}</dl></details>`;
}

const blockRenderers = { clock: clockBlock, stats: statsBlock, bar: barBlock, table: tableBlock, steps: stepsBlock, glossary: glossaryBlock };

function blocks(tab, h) {
  return (tab.blocks || []).map(block => blockRenderers[block.type]?.(block, h) ?? '').join('');
}

function lists(tab, h) {
  const e = h.escape;
  return tab.lists.map(group => `<section class="group"><h4>${e(group.title)}</h4>${group.items.length ? `<ol class="items${group.layout === 'grid' ? ' grid' : ''}">${group.items.map(item => `<li data-tone="${e(item.tone)}"><span class="glyph" aria-hidden="true">${h.icon(item.glyph)}</span><span class="it"><b>${item.url ? link(h, item.url, e(item.title)) : e(item.title)}</b>${item.meta ? `<small>${e(item.meta)}</small>` : ''}</span></li>`).join('')}</ol>` : `<p class="empty">${e(group.empty || 'None.')}</p>`}${group.more > 0 ? `<p class="empty">${e(`${group.more} earlier events are not shown.`)}</p>` : ''}</section>`).join('');
}

function back(v, h) {
  const e = h.escape;
  const tabs = v.tabs.map(tab => `<button type="button" role="tab" class="tab" id="gc-tab-${e(tab.id)}" aria-controls="gc-panel-${e(tab.id)}" data-card-tab="${e(tab.id)}">${e(tab.label)}</button>`).join('');
  const panels = v.tabs.map(tab => {
    const legend = [...tab.rows, ...(tab.groups || []).flatMap(group => group.rows || [])].some(entry => entry.status === 'uncollected') ? '<p class="legend"><i class="dot" aria-hidden="true"></i>Not collected yet: Ploeg does not record this yet.</p>' : '';
    return `<section class="pane" role="tabpanel" id="gc-panel-${e(tab.id)}" aria-labelledby="gc-tab-${e(tab.id)}" data-card-panel="${e(tab.id)}" tabindex="0">${tab.lead ? `<p class="lead">${e(tab.lead)}</p>` : ''}${blocks(tab, h)}${rows(tab, h)}${tab.note ? `<p class="note">${e(tab.note)}</p>` : ''}${groups(tab, h)}${lists(tab, h)}${legend}</section>`;
  }).join('');
  return `<article class="card back" aria-label="More info: ${e(v.title)}">
    <header class="bh">
      <div class="bh-text"><h3 data-card-focus>More info</h3><span>${e(v.title)}</span></div>
      <button type="button" class="front-btn" data-card-action="flip">${h.icon('chevron-left')}Front</button>
    </header>
    <div class="tabs" role="tablist" aria-label="Card details">${tabs}</div>
    <div class="bscroll">${panels}</div>
    <footer class="bf"><span>${e(v.ids.join(' · '))}</span>${v.demo ? '<span class="demo">Demo</span>' : ''}</footer>
  </article>`;
}

/**
 * Lights a drawn front face. The pointer's position over the card sets `--gc-px`, `--gc-py` and `--gc-po`, eased in
 * one animation frame at a time, and the finish layers in `skin.css` follow it. Foil, holo and infinity cards also run
 * a slow idle animation while they are on screen, and at most three cards on a page run one. With reduced motion the
 * card keeps the still version. It also fires `unfold-card-moment` through `skin-kit.js` when the facts changed since
 * the page last drew this Work Item. Returns the function that stops all of it.
 * @param {Element} face The front face the runtime drew.
 * @param {object} [view] The `cardView` model the face was drawn from.
 * @returns {() => void}
 */
export function attach(face, view) {
  if (view) emitMoments(face?.getRootNode?.()?.host ?? null, view);
  const card = face?.querySelector?.('.card[data-finish]');
  if (!card || card.dataset.finish === 'matte') return () => {};
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const light = { x: restingLight.x, y: restingLight.y, o: 0, tx: restingLight.x, ty: restingLight.y, to: 0, frame: 0 };
  const clamp = value => Math.min(1, Math.max(0, value));
  const step = () => {
    light.frame = 0;
    let settled = true;
    for (const [key, target] of [['x', 'tx'], ['y', 'ty'], ['o', 'to']]) {
      const gap = light[target] - light[key];
      if (Math.abs(gap) < 0.002) light[key] = light[target];
      else { light[key] += gap * 0.2; settled = false; }
    }
    card.style.setProperty('--gc-px', light.x.toFixed(4));
    card.style.setProperty('--gc-py', light.y.toFixed(4));
    card.style.setProperty('--gc-po', light.o.toFixed(4));
    if (!settled) light.frame = requestAnimationFrame(step);
  };
  const kick = () => { if (!light.frame) light.frame = requestAnimationFrame(step); };
  const move = event => {
    if (reduced?.matches) return;
    const box = card.getBoundingClientRect();
    if (!box.width || !box.height) return;
    light.tx = clamp((event.clientX - box.left) / box.width);
    light.ty = clamp((event.clientY - box.top) / box.height);
    light.to = 1;
    kick();
  };
  const leave = () => { light.tx = restingLight.x; light.ty = restingLight.y; light.to = 0; kick(); };
  card.addEventListener('pointermove', move);
  card.addEventListener('pointerleave', leave);
  const idle = observer && idleFinishes.has(card.dataset.finish);
  if (idle) observer.observe(card);
  return () => {
    card.removeEventListener('pointermove', move);
    card.removeEventListener('pointerleave', leave);
    if (light.frame) cancelAnimationFrame(light.frame);
    if (idle) { observer.unobserve(card); freeSlot(card); }
  };
}

/**
 * Draws one face of a card as markup. Every value comes from the view model and is escaped with `h.escape`; links go
 * through `h.link`, which keeps only http(s) URLs. The front fills the required slots (title, state, cost, steward,
 * ids) and carries the "More info" control; the back carries the tabs.
 * @param {object} view The `cardView` model.
 * @param {{ face: 'front' | 'back', escape: Function, icon: Function, link: Function }} h
 * @returns {string}
 */
export function render(view, h) {
  return h.face === 'back' ? back(view, h) : front(view, h);
}

function rollNumber(element, from, to, ms, signal) {
  const match = /^(\D*)(\d+)(.*)$/.exec(element?.textContent ?? '');
  if (!match || !Number.isFinite(from) || from === to) return Promise.resolve();
  const [, prefix, , suffix] = match;
  const start = performance.now();
  return new Promise(resolve => {
    const step = now => {
      const k = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - k) ** 3;
      element.textContent = `${prefix}${Math.round(from + (to - from) * eased)}${suffix}`;
      if (k < 1 && !signal?.aborted) requestAnimationFrame(step);
      else { element.textContent = `${prefix}${to}${suffix}`; resolve(); }
    };
    requestAnimationFrame(step);
  });
}

/**
 * Vloer Native's restrained reaction to a moment the effects director plays: a border sweep in the moment's tone, the
 * chip that changed popping once, the day count rolling up for a release or a finish step, and for a rarity reveal the
 * frame ring lighting up in its metal. Calm only lights the
 * chip and the border in that tone, without movement. It draws inside the card and resolves when it is done.
 * @param {{ kind: string, at?: string }} moment
 * @param {{ front: Element, mode: 'full' | 'calm', durationMs: number, before?: object, view?: object, signal?: AbortSignal }} api
 */
export function onMoment(moment, api) {
  const card = api?.front?.querySelector?.('.card[data-finish]');
  if (!card) return null;
  const chip = card.querySelector(momentTargets[moment.kind] ?? '[data-slot="state"]');
  const length = Math.max(300, Math.min(api.durationMs ?? 900, 1400));
  const calm = api.mode !== 'full';
  const frame = moment.kind === 'rarity' && !calm ? card.querySelector('.uc-frame') : null;
  card.dataset.fxSweep = moment.kind === 'rarity' ? rarityTones[moment.detail?.tier] ?? 'gold' : momentTones[moment.kind] ?? 'gold';
  if (frame) { frame.style.setProperty('--uc-reveal-ms', `${length}ms`); frame.dataset.reveal = ''; }
  card.dataset.fxMode = calm ? 'calm' : 'full';
  if (chip) chip.dataset.fxPop = calm ? 'calm' : 'full';
  const rolls = [];
  if (!calm && (moment.kind === 'released' || moment.kind === 'finish') && api.view?.release?.released) {
    const at = Date.parse(moment.at ?? '');
    const earlier = moment.kind === 'released' ? 0 : api.before ? cardView(api.before, Number.isFinite(at) ? { now: at - 1000 } : {}).release?.days : null;
    rolls.push(rollNumber(card.querySelector('.day b'), earlier ?? 0, api.view.release.days, 520, api.signal));
  }
  return new Promise(resolve => {
    const end = () => { delete card.dataset.fxSweep; delete card.dataset.fxMode; if (chip) delete chip.dataset.fxPop; if (frame) delete frame.dataset.reveal; resolve(); };
    const timer = setTimeout(() => Promise.all(rolls).then(end), length);
    api.signal?.addEventListener?.('abort', () => { clearTimeout(timer); end(); }, { once: true });
  });
}
