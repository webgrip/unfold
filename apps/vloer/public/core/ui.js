import { escape, safeUrl } from './dom.js';
import { icon } from './icons.js';
import * as format from './format.js';

const toneNames = new Set(['neutral', 'live', 'attention', 'review', 'success', 'danger', 'severe', 'accent']);
const variants = new Set(['primary', 'secondary', 'ghost', 'danger', 'danger-ghost']);
const sizes = new Set(['xs', 'sm', 'md', 'lg']);
const avatarTones = ['neutral', 'accent', 'review', 'live', 'success', 'severe'];
const calloutIcons = { neutral: 'info', accent: 'info', live: 'activity', attention: 'alert', review: 'eye', success: 'check-circle', danger: 'x-circle', severe: 'alert' };
const workItemStates = {
  proposed: { key: 'proposed', label: 'Proposed', tone: 'neutral', glyph: 'proposed' },
  ingested: { key: 'ingested', label: 'Received', tone: 'neutral', glyph: 'inbox' },
  queued: { key: 'queued', label: 'Queued', tone: 'neutral', glyph: 'circle-dashed' },
  leased: { key: 'leased', label: 'Running', tone: 'live', glyph: 'circle-half', live: true },
  awaiting_review: { key: 'awaiting_review', label: 'Ready for review', tone: 'review', glyph: 'pull-request' },
  needs_human: { key: 'needs_human', label: 'Needs you', tone: 'attention', glyph: 'alert' },
  stale: { key: 'stale', label: 'Stopped retrying', tone: 'severe', glyph: 'clock' },
  withdrawn: { key: 'withdrawn', label: 'Withdrawn', tone: 'neutral', glyph: 'circle-slash' },
  done: { key: 'done', label: 'Done', tone: 'success', glyph: 'check-circle' },
};

const html = value => Array.isArray(value) ? value.join('') : value === undefined || value === null || value === false ? '' : String(value);
const present = value => value !== undefined && value !== null && value !== false && value !== '';
const toneOf = value => toneNames.has(value) ? value : 'neutral';
const toneAttr = value => toneNames.has(value) ? ` data-tone="${value}"` : '';
const attr = (name, value) => value === undefined || value === null || value === false ? '' : value === true ? ` ${name}` : ` ${name}="${escape(value)}"`;
const idAttr = value => present(value) ? ` id="${escape(value)}"` : '';
const humanize = key => { const words = String(key ?? '').replaceAll('_', ' ').trim(); return words ? words[0].toUpperCase() + words.slice(1) : 'Unknown'; };
const amount = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
const round2 = value => Math.round(value * 100) / 100;
const moneyText = value => format.money(value);

function dataAttrs(data) {
  if (!data || typeof data !== 'object') return '';
  return Object.entries(data).map(([key, value]) => {
    const name = String(key).replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`).replace(/[^a-z0-9-]/g, '');
    return name ? attr(`data-${name}`, value) : '';
  }).join('');
}

function actionAttrs(action, data) {
  return `${present(action) ? ` data-action="${escape(action)}"` : ''}${dataAttrs(data)}`;
}

const inAppOrigin = 'http://in-app.invalid';

function inAppPath(text) {
  if (!/^(#|\?|\/(?![/\\]))/.test(text) || /[\u0000-\u001f\u007f\\]/.test(text)) return false;
  try { return new URL(text, `${inAppOrigin}/`).origin === inAppOrigin; } catch { return false; }
}

function linkTarget(href, external) {
  if (!present(href)) return null;
  const text = String(href);
  if (!external && inAppPath(text)) return text;
  return safeUrl(text);
}

function externalAttrs(external) {
  return external ? ' target="_blank" rel="noopener noreferrer"' : '';
}

const newTab = '<span class="sr-only"> (opens in a new tab)</span>';

function lookupState(stateKey) {
  if (stateKey && typeof stateKey === 'object') return stateKey;
  const key = String(stateKey ?? '');
  const bare = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
  return workItemStates[bare] || { key: bare, label: humanize(bare), tone: 'neutral', glyph: 'circle' };
}

function absolute(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}`;
}

function timeElement(iso, display) {
  if (!present(iso)) return '';
  if (typeof format.timeHtml === 'function') {
    const rendered = format.timeHtml(iso, { display });
    if (rendered) return rendered;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return `<span class="subtle">${escape(iso)}</span>`;
  const title = absolute(date);
  const text = display === 'absolute' ? title : format.ago(date.toISOString());
  return `<time class="num" datetime="${escape(date.toISOString())}" title="${escape(title)}">${escape(text)}</time>`;
}

/**
 * A button, or a link styled as one when `href` is set. Text params (`label`, `ariaLabel`, `title`) are escaped;
 * `href` must be an in-app path (`#…`, `?…` or `/…` that resolves to this origin, with no backslash or control character) or pass `safeUrl()`; otherwise the control renders disabled.
 * @param {object} options
 * @param {string} [options.label] Visible text.
 * @param {string} [options.icon] Leading glyph name from core/icons.js.
 * @param {'primary'|'secondary'|'ghost'|'danger'|'danger-ghost'} [options.variant] Defaults to `secondary`.
 * @param {'xs'|'sm'|'md'|'lg'} [options.size] Defaults to `md`.
 * @param {string} [options.action] Value of `data-action`.
 * @param {Record<string, string|number|boolean>} [options.data] Extra `data-*` attributes; camelCase keys become kebab-case.
 * @param {string} [options.href] Renders an `<a>`.
 * @param {boolean} [options.external] Opens `href` in a new tab with `rel="noopener noreferrer"`.
 * @param {boolean} [options.disabled]
 * @param {boolean} [options.busy] Shows a spinner, sets `aria-busy` and disables the button.
 * @param {string|string[]} [options.kbd] Keyboard hint shown after the label, hidden from the accessible name.
 * @param {'button'|'submit'|'reset'} [options.type] Defaults to `button`.
 * @param {string} [options.id]
 * @param {string} [options.ariaLabel]
 * @param {string} [options.title]
 * @returns {string}
 */
export function button({ label = '', icon: glyph, variant = 'secondary', size = 'md', action, data = {}, href, external = false, disabled = false, busy = false, kbd: keys, type = 'button', id, ariaLabel, title } = {}) {
  const classes = ['button', variants.has(variant) ? variant : 'secondary', sizes.has(size) && size !== 'md' ? size : '', !present(label) && glyph ? 'icon-only' : ''].filter(Boolean).join(' ');
  const lead = busy ? '<span class="spinner" aria-hidden="true"></span>' : glyph ? icon(glyph) : '';
  const hint = present(keys) ? kbd(keys).replace('<span class="kbd-group"', '<span class="kbd-group" aria-hidden="true"') : '';
  const common = `${idAttr(id)}${attr('aria-label', ariaLabel)}${attr('title', title)}${actionAttrs(action, data)}`;
  if (present(href)) {
    const target = linkTarget(href, external);
    const inner = `${lead}${present(label) ? `<span class="button-label">${escape(label)}</span>` : ''}${hint}${external && target ? `${icon('external', 'button-external')}${newTab}` : ''}`;
    if (!target || disabled) return `<a class="${classes}" role="link" aria-disabled="true"${common}>${inner}</a>`;
    return `<a class="${classes}" href="${escape(target)}"${externalAttrs(external)}${common}>${inner}</a>`;
  }
  const inner = `${lead}${present(label) ? `<span class="button-label">${escape(label)}</span>` : ''}${hint}`;
  const safeType = ['button', 'submit', 'reset'].includes(type) ? type : 'button';
  return `<button type="${safeType}" class="${classes}"${common}${disabled || busy ? ' disabled' : ''}${busy ? ' aria-busy="true"' : ''}>${inner}</button>`;
}

/**
 * A square button that shows only a glyph; `label` becomes its accessible name and tooltip.
 * @param {object} options
 * @param {string} options.icon Glyph name.
 * @param {string} options.label Accessible name (escaped).
 * @param {string} [options.action]
 * @param {Record<string, string|number|boolean>} [options.data]
 * @param {string} [options.href]
 * @param {boolean} [options.external]
 * @param {'primary'|'secondary'|'ghost'|'danger'|'danger-ghost'} [options.variant] Defaults to `ghost`.
 * @param {'xs'|'sm'|'md'|'lg'} [options.size]
 * @param {boolean} [options.disabled]
 * @param {string} [options.id]
 * @returns {string}
 */
export function iconButton({ icon: glyph, label, action, data, href, external, variant = 'ghost', size = 'md', disabled = false, id } = {}) {
  return button({ icon: glyph || 'circle', variant, size, action, data, href, external, disabled, id, ariaLabel: label, title: label });
}

/**
 * A status lozenge: glyph plus label on a tone tint. Text params are escaped.
 * @param {object} options
 * @param {'neutral'|'live'|'attention'|'review'|'success'|'danger'|'severe'|'accent'} [options.tone]
 * @param {string} [options.glyph] Glyph name; omit for a text-only badge.
 * @param {string} options.label
 * @param {string} [options.title] Tooltip.
 * @param {'sm'|'md'} [options.size]
 * @param {'solid'|'outline'|'plain'} [options.style]
 * @returns {string}
 */
export function badge({ tone, glyph, label = '', title, size, style } = {}) {
  const classes = ['badge', size === 'sm' ? 'sm' : '', ['solid', 'outline', 'plain'].includes(style) ? style : ''].filter(Boolean).join(' ');
  return `<span class="${classes}" data-tone="${toneOf(tone)}"${attr('title', title)}>${glyph ? icon(glyph) : ''}${escape(label)}</span>`;
}

/**
 * The badge of a state from the shared vocabulary, with an optional reason after it (for example the reason a
 * Work Item needs you). `stateKey` is a state key such as `'needs_human'` (a `kind:` prefix is accepted) or a
 * state meta object `{ key, label, tone, glyph, live }`. Running states show the live dot instead of a glyph.
 * @param {string|{key: string, label: string, tone: string, glyph?: string, live?: boolean}} stateKey
 * @param {object} [options]
 * @param {string} [options.reason] Plain text (escaped).
 * @param {'neutral'|'live'|'attention'|'review'|'success'|'danger'|'severe'} [options.reasonTone] Defaults to the state's tone.
 * @returns {string}
 */
export function stateBadge(stateKey, { reason, reasonTone } = {}) {
  const meta = lookupState(stateKey);
  const tone = toneOf(meta.tone);
  const lead = meta.live ? '<span class="live-dot" aria-hidden="true"></span>' : icon(meta.glyph || 'circle');
  const pill = `<span class="badge" data-tone="${tone}" data-state="${escape(meta.key)}">${lead}${escape(meta.label)}</span>`;
  if (!present(reason)) return pill;
  return `<span class="state-badge">${pill}<span class="state-reason" data-tone="${toneOf(reasonTone || tone)}">${escape(reason)}</span></span>`;
}

/**
 * A small tag for metadata (team, repository, reason). A link with `href`, a button with `action`, otherwise a span.
 * @param {object} options
 * @param {string} options.label Escaped.
 * @param {'neutral'|'live'|'attention'|'review'|'success'|'danger'|'severe'|'accent'} [options.tone] Omit for the plain outline chip.
 * @param {string} [options.icon] Glyph name.
 * @param {string} [options.title]
 * @param {string} [options.href]
 * @param {boolean} [options.external]
 * @param {string} [options.action]
 * @param {Record<string, string|number|boolean>} [options.data]
 * @returns {string}
 */
export function chip({ label = '', tone, icon: glyph, title, href, external = false, action, data } = {}) {
  const inner = `${glyph ? icon(glyph) : ''}<span>${escape(label)}</span>`;
  const common = `${toneAttr(tone)}${attr('title', title)}`;
  const target = linkTarget(href, external);
  if (target) return `<a class="chip" href="${escape(target)}"${externalAttrs(external)}${common}${actionAttrs(action, data)}>${inner}${external ? newTab : ''}</a>`;
  if (present(action)) return `<button type="button" class="chip"${common}${actionAttrs(action, data)}>${inner}</button>`;
  return `<span class="chip"${common}${dataAttrs(data)}>${inner}</span>`;
}

/**
 * A round count badge. Returns an empty string when `n` is null or undefined (unknown is not zero).
 * @param {number|string|null|undefined} n
 * @param {object} [options]
 * @param {'neutral'|'live'|'attention'|'review'|'success'|'danger'|'severe'|'accent'} [options.tone] Filled emphasis when set.
 * @param {string} [options.label] Accessible text that replaces the bare number, for example "3 waiting".
 * @returns {string}
 */
export function count(n, { tone, label } = {}) {
  if (n === null || n === undefined || n === '') return '';
  return `<span class="count"${toneAttr(tone)}${present(label) ? ` aria-label="${escape(label)}"` : ''}>${escape(n)}</span>`;
}

/**
 * A bordered surface with an optional header. `title` and `subtitle` are text; `actions` and `body` are HTML.
 * @param {object} options
 * @param {string} [options.id] Element id; the title gets `<id>-title` and labels the card.
 * @param {string} [options.title]
 * @param {string} [options.subtitle]
 * @param {string|string[]} [options.actions] HTML.
 * @param {string|string[]} [options.body] HTML.
 * @param {'neutral'|'live'|'attention'|'review'|'success'|'danger'|'severe'|'accent'} [options.tone] Tints the header.
 * @param {boolean} [options.flush] Removes the body padding, for lists and tables.
 * @param {string} [options.icon] Glyph before the title.
 * @param {2|3|4} [options.level] Heading level of the title; defaults to 2.
 * @returns {string}
 */
export function card({ id, title, subtitle, actions, body, tone, flush = false, icon: glyph, level = 2 } = {}) {
  const heading = [2, 3, 4].includes(level) ? level : 2;
  const titleId = present(id) && present(title) ? `${id}-title` : '';
  const header = present(title) || present(html(actions)) ? `<header class="card-header"><div class="card-heading">${present(title) ? `<h${heading} class="card-title"${idAttr(titleId)}>${glyph ? icon(glyph) : ''}${escape(title)}</h${heading}>` : ''}${present(subtitle) ? `<p class="card-subtitle">${escape(subtitle)}</p>` : ''}</div>${present(html(actions)) ? `<div class="card-actions">${html(actions)}</div>` : ''}</header>` : '';
  const tag = present(title) ? 'section' : 'div';
  return `<${tag} class="card${flush ? ' flush' : ''}"${idAttr(id)}${titleId ? ` aria-labelledby="${escape(titleId)}"` : ''}${toneAttr(tone)}>${header}<div class="card-body">${html(body)}</div></${tag}>`;
}

/**
 * A titled page section. `title` and `description` are text; `actions` and `body` are HTML.
 * @param {object} options
 * @param {string} [options.id] Element id; the title gets `<id>-title` and labels the section.
 * @param {string} options.title
 * @param {number|null} [options.count] Shown as a count badge after the title; null or undefined hides it.
 * @param {string} [options.description]
 * @param {string|string[]} [options.actions] HTML.
 * @param {string|string[]} [options.body] HTML.
 * @param {2|3|4} [options.level] Heading level; defaults to 2.
 * @returns {string}
 */
export function section({ id, title = '', count: total, description, actions, body, level = 2 } = {}) {
  const heading = [2, 3, 4].includes(level) ? level : 2;
  const titleId = present(id) ? `${id}-title` : '';
  return `<section class="section"${idAttr(id)}${titleId ? ` aria-labelledby="${escape(titleId)}"` : ''}><header class="section-header"><div class="section-heading"><h${heading} class="section-title"${idAttr(titleId)}>${escape(title)}${count(total)}</h${heading}>${present(description) ? `<p class="section-description">${escape(description)}</p>` : ''}</div>${present(html(actions)) ? `<div class="section-actions">${html(actions)}</div>` : ''}</header><div class="section-body">${html(body)}</div></section>`;
}

/**
 * The page heading block with the page's single `<h1>` (focusable with `tabindex="-1"` for route changes).
 * `overline`, `title` and `subtitle` are text; `actions` and `meta` are HTML.
 * @param {object} options
 * @param {string} [options.overline]
 * @param {string} options.title
 * @param {string} [options.subtitle]
 * @param {string|string[]} [options.actions] HTML.
 * @param {string|string[]} [options.meta] HTML, for example badges and times.
 * @returns {string}
 */
export function pageHeader({ overline, title = '', subtitle, actions, meta } = {}) {
  return `<header class="page-header"><div class="page-header-text">${present(overline) ? `<p class="overline">${escape(overline)}</p>` : ''}<h1 class="page-title" tabindex="-1">${escape(title)}</h1>${present(subtitle) ? `<p class="page-subtitle">${escape(subtitle)}</p>` : ''}${present(html(meta)) ? `<div class="page-meta">${html(meta)}</div>` : ''}</div>${present(html(actions)) ? `<div class="page-actions">${html(actions)}</div>` : ''}</header>`;
}

/**
 * A centred empty state that says what to do next. `title` is text; `body` and `actions` are HTML.
 * @param {object} options
 * @param {string} [options.icon] Glyph name; defaults to `inbox`.
 * @param {string} options.title
 * @param {string|string[]} [options.body] HTML.
 * @param {string|string[]} [options.actions] HTML.
 * @param {boolean} [options.compact]
 * @param {'neutral'|'live'|'attention'|'review'|'success'|'danger'|'severe'|'accent'} [options.tone] `success` for all-clear, `danger` for errors.
 * @returns {string}
 */
export function emptyState({ icon: glyph = 'inbox', title = '', body, actions, compact = false, tone } = {}) {
  return `<div class="empty-state${compact ? ' compact' : ''}"${toneAttr(tone)}><span class="empty-state-icon" aria-hidden="true">${icon(glyph)}</span><p class="empty-state-title">${escape(title)}</p>${present(html(body)) ? `<div class="empty-state-body">${html(body)}</div>` : ''}${present(html(actions)) ? `<div class="empty-state-actions">${html(actions)}</div>` : ''}</div>`;
}

/**
 * Placeholder blocks while data loads. Hidden from assistive technology except one "Loading…" text; the caller
 * sets `aria-busy="true"` on the region it fills.
 * @param {object} [options]
 * @param {number} [options.rows] 1 to 20; defaults to 3.
 * @param {'list'|'text'|'table'|'cards'} [options.variant] Defaults to `list`.
 * @returns {string}
 */
export function skeleton({ rows = 3, variant = 'list' } = {}) {
  const total = Math.min(20, Math.max(1, Math.floor(Number(rows)) || 1));
  const kind = ['list', 'text', 'table', 'cards'].includes(variant) ? variant : 'list';
  const one = {
    list: '<div class="skeleton-row"><span class="skeleton circle"></span><span class="skeleton-lines"><span class="skeleton title"></span><span class="skeleton text"></span></span><span class="skeleton pill"></span></div>',
    text: '<span class="skeleton text"></span>',
    table: '<div class="skeleton-row"><span class="skeleton text"></span><span class="skeleton text"></span><span class="skeleton text"></span></div>',
    cards: '<span class="skeleton block"></span>',
  }[kind];
  return `<div class="skeleton-wrap"><span class="sr-only">Loading…</span><div class="skeleton-group" data-variant="${kind}" aria-hidden="true">${kind === 'text' ? '<span class="skeleton title"></span>' : ''}${one.repeat(total)}</div></div>`;
}

/**
 * An inline notice inside a view. `title` is text; `body` and `actions` are HTML. Pass `icon: null` for no glyph.
 * @param {object} options
 * @param {'neutral'|'live'|'attention'|'review'|'success'|'danger'|'severe'|'accent'} [options.tone] Defaults to `neutral`.
 * @param {string|null} [options.icon] Defaults to the tone's glyph.
 * @param {string} [options.title]
 * @param {string|string[]} [options.body] HTML.
 * @param {string|string[]} [options.actions] HTML.
 * @returns {string}
 */
export function callout({ tone = 'neutral', icon: glyph, title, body, actions } = {}) {
  const shade = toneOf(tone);
  const mark = glyph === null ? '' : `<span class="callout-icon" aria-hidden="true">${icon(glyph || calloutIcons[shade])}</span>`;
  return `<div class="callout" data-tone="${shade}">${mark}<div class="callout-content">${present(title) ? `<p class="callout-title">${escape(title)}</p>` : ''}${present(html(body)) ? `<div class="callout-body">${html(body)}</div>` : ''}</div>${present(html(actions)) ? `<div class="callout-actions">${html(actions)}</div>` : ''}</div>`;
}

/**
 * A budget meter: settled spend (solid) and reserved spend (lighter) against the authorized amount, drawn with SVG
 * attributes only. Unknown settled spend renders a hatched bar that reads "Not reported", never zero. `demo` reads
 * "Demo · no model calls" and draws no spend. Spend over the authorization turns the bar to the danger tone.
 * @param {object} options
 * @param {number|null} [options.settled] US dollars settled; null or undefined is unknown.
 * @param {number|null} [options.reserved] US dollars reserved by running work.
 * @param {number|null} [options.authorized] US dollars authorized.
 * @param {boolean} [options.demo]
 * @param {string} [options.label] Caption before the amount; defaults to "Spend". Pass '' for none.
 * @param {'sm'|'md'|'lg'} [options.size]
 * @returns {string}
 */
export function meter({ settled, reserved, authorized, demo = false, label = 'Spend', size } = {}) {
  const spent = amount(settled);
  const held = amount(reserved) ?? 0;
  const budget = amount(authorized);
  const classes = `meter${size === 'sm' || size === 'lg' ? ` ${size}` : ''}`;
  const caption = present(label) ? `<span class="meter-caption">${escape(label)}</span> ` : '';
  const bar = rects => `<svg class="meter-bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect class="meter-track" width="100" height="6"/>${rects}</svg>`;
  const budgetText = budget ? `of ${escape(moneyText(budget))}` : 'no budget reported';
  if (demo) {
    return `<div class="${classes}" data-demo><div class="meter-label"><span class="meter-text">${caption}<span class="meter-value">Demo · no model calls</span></span>${budget ? `<span class="meter-end">${escape(moneyText(budget))} authorized</span>` : ''}</div>${bar('')}</div>`;
  }
  if (spent === null) {
    return `<div class="${classes}" data-unknown><div class="meter-label"><span class="meter-text">${caption}<span class="meter-value">Not reported</span></span><span class="meter-end">${budgetText}</span></div>${bar('')}</div>`;
  }
  if (!budget) {
    return `<div class="${classes}" data-unknown="budget"><div class="meter-label"><span class="meter-text">${caption}<strong class="meter-value">${escape(moneyText(spent))}</strong></span><span class="meter-end">${budgetText}</span></div>${bar('')}</div>`;
  }
  const settledWidth = round2(Math.min(100, spent / budget * 100));
  const reservedWidth = round2(Math.max(0, Math.min(100 - settledWidth, held / budget * 100)));
  const over = spent > budget;
  const level = over ? 'over' : (spent + held) / budget >= 0.8 - 1e-9 ? 'warn' : '';
  const reservedText = held > 0 ? `, ${moneyText(held)} reserved` : '';
  const valueText = `${moneyText(spent)} settled of ${moneyText(budget)} authorized${reservedText}${over ? `, ${moneyText(round2(spent - budget))} over budget` : ''}`;
  const end = over ? `${escape(moneyText(round2(spent - budget)))} over` : `${Math.round(spent / budget * 100)}%`;
  const rects = `${settledWidth > 0 ? `<rect class="meter-settled" width="${settledWidth}" height="6"/>` : ''}${reservedWidth > 0 ? `<rect class="meter-reserved" x="${settledWidth}" width="${reservedWidth}" height="6"/>` : ''}`;
  return `<div class="${classes}"${level ? ` data-level="${level}"` : ''} role="meter" aria-label="${escape(present(label) ? label : 'Spend')}" aria-valuemin="0" aria-valuemax="${budget}" aria-valuenow="${Math.min(spent, budget)}" aria-valuetext="${escape(valueText)}"><div class="meter-label"><span class="meter-text">${caption}<strong class="meter-value">${escape(moneyText(spent))}</strong> <span class="meter-of">of ${escape(moneyText(budget))}${held > 0 ? ` · ${escape(moneyText(held))} reserved` : ''}</span></span><span class="meter-end">${end}</span></div>${bar(rects)}</div>`;
}

/**
 * A stat tile that summarises one number and, with `href`, links to the list behind it. Text params are escaped.
 * @param {object} options
 * @param {string} options.label
 * @param {string|number} options.value Already formatted, for example `money(12.4)`.
 * @param {string} [options.detail]
 * @param {string} [options.href] In-app link.
 * @param {'neutral'|'live'|'attention'|'review'|'success'|'danger'|'severe'|'accent'} [options.tone] Colours the label glyph.
 * @param {string} [options.icon] Glyph before the label.
 * @returns {string}
 */
export function stat({ label = '', value = '', detail, href, tone, icon: glyph } = {}) {
  const inner = `<span class="stat-label">${glyph ? icon(glyph) : ''}${escape(label)}</span><strong class="stat-value">${escape(value)}</strong>${present(detail) ? `<span class="stat-detail">${escape(detail)}</span>` : ''}`;
  const target = linkTarget(href, false);
  return target ? `<a class="stat" href="${escape(target)}"${toneAttr(tone)}>${inner}</a>` : `<div class="stat"${toneAttr(tone)}>${inner}</div>`;
}

/**
 * Keyboard key caps. A string is split on spaces into a sequence (`'g n'`); an array is used as given.
 * @param {string|string[]} keys
 * @returns {string}
 */
export function kbd(keys) {
  const list = (Array.isArray(keys) ? keys : String(keys ?? '').split(/\s+/)).map(key => String(key)).filter(Boolean);
  return `<span class="kbd-group">${list.map(key => `<kbd class="kbd">${escape(key)}</kbd>`).join('')}</span>`;
}

/**
 * An avatar. People are round with initials; agents are square with the bot glyph. The tone follows from the name.
 * @param {object} options
 * @param {string} options.name Escaped; also the accessible name.
 * @param {'person'|'agent'} [options.kind] Defaults to `person`.
 * @param {'sm'|'md'|'lg'|'xl'} [options.size]
 * @returns {string}
 */
export function avatar({ name = '', kind = 'person', size } = {}) {
  const text = String(name ?? '');
  const words = text.split(/[\s._@-]+/).filter(Boolean);
  const initials = words.slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase() || '?';
  const tone = avatarTones[Array.from(text).reduce((sum, char) => sum + char.codePointAt(0), 0) % avatarTones.length];
  const agent = kind === 'agent';
  const classes = `avatar${['sm', 'lg', 'xl'].includes(size) ? ` ${size}` : ''}`;
  const labelText = agent ? `${text || 'Agent'} (agent)` : text || 'Unknown person';
  return `<span class="${classes}"${agent ? ' data-kind="agent"' : ''} data-tone="${tone}" role="img" aria-label="${escape(labelText)}" title="${escape(text)}">${agent ? icon('bot') : escape(initials)}</span>`;
}

/**
 * An ARIA tablist. Tab ids are `<id>-tab-<item>` and each tab controls `<id>-panel-<item>` (the session view keeps
 * `evidence-tab-*` and `evidence-panel-*` with `id: 'evidence'`). The selected tab (the first when none is marked)
 * is the only one in the tab order; the view handles arrow keys. Labels are escaped.
 * @param {object} options
 * @param {string} options.id
 * @param {string} options.label Accessible name of the tablist.
 * @param {{id: string, label: string, icon?: string, count?: number|null, selected?: boolean}[]} options.items
 * @param {string} [options.action] Value of `data-action` on every tab; the tab id is in `data-id`.
 * @returns {string}
 */
export function tabs({ id = 'tabs', label = '', items = [], action } = {}) {
  const selected = items.findIndex(item => item.selected);
  const current = selected >= 0 ? selected : 0;
  const buttons = items.map((item, index) => {
    const on = index === current;
    return `<button type="button" role="tab" class="tab${on ? ' selected' : ''}" id="${escape(`${id}-tab-${item.id}`)}" aria-controls="${escape(`${id}-panel-${item.id}`)}" aria-selected="${on ? 'true' : 'false'}" tabindex="${on ? '0' : '-1'}"${actionAttrs(action, { id: item.id })}>${item.icon ? icon(item.icon) : ''}${escape(item.label)}${count(item.count)}</button>`;
  }).join('');
  return `<div class="tabs" role="tablist" aria-label="${escape(label)}">${buttons}</div>`;
}

/**
 * A segmented control for one filter or view switch. Items with `href` are links (`aria-current="true"` when
 * selected); otherwise toggle buttons with `aria-pressed` and `data-id`. Labels are escaped.
 * @param {object} options
 * @param {string} options.label Accessible name of the group.
 * @param {{id: string, label: string, count?: number|null, selected?: boolean, href?: string, icon?: string}[]} options.items
 * @param {string} [options.action] Value of `data-action` on button items.
 * @returns {string}
 */
export function segmented({ label = '', items = [], action } = {}) {
  const parts = items.map(item => {
    const inner = `${item.icon ? icon(item.icon) : ''}${escape(item.label)}${count(item.count)}`;
    const target = linkTarget(item.href, false);
    if (target) return `<a class="segment" href="${escape(target)}"${item.selected ? ' aria-current="true"' : ''}${dataAttrs({ id: item.id })}>${inner}</a>`;
    return `<button type="button" class="segment" aria-pressed="${item.selected ? 'true' : 'false'}"${actionAttrs(action, { id: item.id })}>${inner}</button>`;
  }).join('');
  return `<div class="segmented" role="group" aria-label="${escape(label)}">${parts}</div>`;
}

/**
 * A native `<details>` disclosure. `summary` is text; `body` is HTML.
 * @param {object} options
 * @param {string} options.summary
 * @param {string|string[]} [options.body] HTML.
 * @param {boolean} [options.open]
 * @param {string} [options.id]
 * @param {boolean} [options.plain] Drops the border, for inline "show more" use.
 * @returns {string}
 */
export function disclosure({ summary = '', body, open = false, id, plain = false } = {}) {
  return `<details class="disclosure${plain ? ' plain' : ''}"${idAttr(id)}${open ? ' open' : ''}><summary><span class="disclosure-summary">${escape(summary)}</span>${icon('chevron-down')}</summary><div class="disclosure-body">${html(body)}</div></details>`;
}

/**
 * A definition list of facts. Each pair is `[term, value]` or `{ term, value }`; the term is text and the value is
 * HTML (format and escape it first). A null or undefined value shows a dash.
 * @param {([string, string|null|undefined] | {term: string, value: string|null|undefined})[]} pairs
 * @param {object} [options]
 * @param {boolean} [options.rows] Lays the pairs out as label and value rows instead of a grid.
 * @returns {string}
 */
export function dl(pairs = [], { rows = false } = {}) {
  const items = (pairs || []).map(pair => Array.isArray(pair) ? { term: pair[0], value: pair[1] } : pair || {}).map(({ term, value }) => `<div class="fact"><dt>${escape(term)}</dt><dd>${value === null || value === undefined || value === '' ? '<span class="subtle">—</span>' : html(value)}</dd></div>`).join('');
  return `<dl class="facts${rows ? ' rows' : ''}">${items}</dl>`;
}

/**
 * A data table in a horizontally scrollable, focusable region. Column labels and the caption are text; cells
 * are HTML keyed by column. Numeric columns are right-aligned and tabular. `empty` (HTML) shows when there are
 * no rows.
 * @param {object} options
 * @param {string} options.caption Accessible name of the table (visually hidden).
 * @param {{key: string, label: string, numeric?: boolean}[]} options.columns
 * @param {Record<string, string>[]} [options.rows]
 * @param {string} [options.empty] HTML.
 * @param {boolean} [options.compact]
 * @param {boolean} [options.contained] Scrolls vertically inside the region so the header stays in view.
 * @returns {string}
 */
export function table({ caption = '', columns = [], rows = [], empty, compact = false, contained = false } = {}) {
  const head = columns.map(column => `<th scope="col"${column.numeric ? ' class="num"' : ''}>${escape(column.label)}</th>`).join('');
  const body = rows.length
    ? rows.map(row => `<tr>${columns.map(column => `<td${column.numeric ? ' class="num"' : ''}>${html(row?.[column.key])}</td>`).join('')}</tr>`).join('')
    : `<tr><td class="table-empty" colspan="${Math.max(1, columns.length)}">${present(html(empty)) ? html(empty) : 'Nothing to show.'}</td></tr>`;
  const region = present(caption) ? ` role="region" tabindex="0" aria-label="${escape(caption)}"` : '';
  return `<div class="table-wrap${contained ? ' contained' : ''}"${region}><table class="table${compact ? ' compact' : ''}">${present(caption) ? `<caption class="sr-only">${escape(caption)}</caption>` : ''}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/**
 * A relative time ("5 min ago") inside `<time>` with the ISO value and the absolute date in `title`.
 * Returns '' for a missing value and the escaped raw text for an invalid one.
 * @param {string|number|Date|null|undefined} iso
 * @returns {string}
 */
export function timeAgo(iso) {
  return timeElement(iso, 'relative');
}

/**
 * An absolute date and time (`30-09-2026 21:30`) inside `<time>` with the ISO value.
 * Returns '' for a missing value and the escaped raw text for an invalid one.
 * @param {string|number|Date|null|undefined} iso
 * @returns {string}
 */
export function timeAt(iso) {
  return timeElement(iso, 'absolute');
}

/**
 * The one-line demo disclaimer: a hatched DEMO tag and the text (escaped).
 * @param {string} [text] Defaults to "Illustrative data. No model calls, no spend."
 * @returns {string}
 */
export function demoNote(text = 'Illustrative data. No model calls, no spend.') {
  return `<p class="demo-note"><span class="demo-note-tag">Demo</span><span>${escape(text)}</span></p>`;
}

/**
 * A single row of controls (filters, refresh) that wraps on narrow screens. `html` is markup.
 * @param {string|string[]} markup
 * @returns {string}
 */
export function toolbar(markup) {
  return `<div class="toolbar">${html(markup)}</div>`;
}

/**
 * A list row: a link with `href`, a button with `action`, otherwise a plain row. `title` is text; `lead`
 * (status glyph), `meta` (second line) and `trail` (time, chips) are HTML. `selected` sets `aria-current="true"`.
 * Pass `data: { unread: true }` for the unread dot.
 * @param {object} options
 * @param {string} [options.href]
 * @param {string} [options.action]
 * @param {Record<string, string|number|boolean>} [options.data]
 * @param {boolean} [options.selected]
 * @param {string|string[]} [options.lead] HTML.
 * @param {string} options.title
 * @param {string|string[]} [options.meta] HTML.
 * @param {string|string[]} [options.trail] HTML.
 * @param {string} [options.id]
 * @param {'neutral'|'live'|'attention'|'review'|'success'|'danger'|'severe'|'accent'} [options.tone] Colours the lead glyph.
 * @returns {string}
 */
export function listRow({ href, action, data, selected = false, lead, title = '', meta, trail, id, tone } = {}) {
  const inner = `<span class="list-row-lead">${html(lead)}</span><span class="list-row-main"><span class="list-row-title">${escape(title)}</span>${present(html(meta)) ? `<span class="list-row-meta">${html(meta)}</span>` : ''}</span><span class="list-row-trail">${html(trail)}</span>`;
  const common = `${idAttr(id)}${selected ? ' aria-current="true"' : ''}${toneAttr(tone)}`;
  const target = linkTarget(href, false);
  if (target) return `<a class="list-row" href="${escape(target)}"${common}${actionAttrs(action, data)}>${inner}</a>`;
  if (present(action)) return `<button type="button" class="list-row"${common}${actionAttrs(action, data)}>${inner}</button>`;
  return `<div class="list-row"${common}${dataAttrs(data)}>${inner}</div>`;
}
