import { escape } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { atNow, defaultRange, fieldText, isLive, normalizeEnd, rangeLabel, refreshIntervals, refreshMs, rememberRange, resolveRange, searchQuickRanges, shiftRange, shortcutAction, spanWords, zoomOut } from './time-range.js';

const cx = (...names) => names.filter(Boolean).join(' ');

/**
 * A time picker's state: the applied `range`, the `draft` being typed in the panel, whether the panel is `open`, the
 * auto-refresh id, the recently used absolute ranges, the quick-range `query`, a field `error` and the time zone named
 * in the footer.
 * @typedef {{ range: { from: string, to: string }, draft: { from: string, to: string }, open: boolean, refresh: string, recent: { from: string, to: string }[], query: string, error: { field: 'from'|'to', message: string }|null, timeZone: string }} TimePickerState
 */

/**
 * A new picker state. `range` and `refresh` usually come from `rangeFromQuery`.
 * @param {Partial<TimePickerState>} [state]
 * @returns {TimePickerState}
 */
export function pickerState(state = {}) {
  const range = state.range ?? { ...defaultRange };
  return { range, draft: state.draft ?? { ...range }, open: false, refresh: '', recent: [], query: '', error: null, timeZone: 'your browser’s time zone', ...state };
}

/**
 * The picker's state machine. Every user action is one of these, so the picker's behaviour is tested without a browser:
 * `toggle`, `close`, `draft` ({ field, value }), `apply`, `pick` ({ from, to }), `shift` ({ direction }), `zoom-out`,
 * `refresh` ({ value }) and `search` ({ query }). `changed` is true when the applied range or auto-refresh changed.
 * @param {TimePickerState} state
 * @param {{ type: string, [key: string]: unknown }} action
 * @param {number} now
 * @returns {{ state: TimePickerState, changed: boolean }}
 */
export function pickerUpdate(state, action, now) {
  const applied = range => ({ state: { ...state, range, draft: { ...range }, open: false, error: null, query: '', recent: rememberRange(state.recent, range) }, changed: range.from !== state.range.from || range.to !== state.range.to });
  switch (action.type) {
    case 'toggle': return { state: state.open ? { ...state, open: false } : { ...state, open: true, draft: { ...state.range }, error: null, query: '' }, changed: false };
    case 'close': return { state: { ...state, open: false, error: null }, changed: false };
    case 'draft': return { state: { ...state, draft: { ...state.draft, [action.field]: String(action.value ?? '') }, error: state.error?.field === action.field ? null : state.error }, changed: false };
    case 'search': return { state: { ...state, query: String(action.query ?? '') }, changed: false };
    case 'apply': {
      const draft = { from: normalizeEnd(state.draft.from, now, false), to: normalizeEnd(state.draft.to, now, true) };
      const resolved = resolveRange(draft, now);
      if (!resolved.ok) return { state: { ...state, error: { field: resolved.field, message: resolved.message } }, changed: false };
      return applied(draft);
    }
    case 'pick': return resolveRange({ from: action.from, to: action.to }, now).ok ? applied({ from: String(action.from), to: String(action.to) }) : { state, changed: false };
    case 'shift': return applied(shiftRange(state.range, action.direction < 0 ? -1 : 1, now));
    case 'zoom-out': return applied(zoomOut(state.range, now));
    case 'refresh': {
      const value = refreshIntervals.some(([id]) => id === action.value) ? String(action.value) : '';
      return { state: { ...state, refresh: value }, changed: value !== state.refresh };
    }
    default: return { state, changed: false };
  }
}

/**
 * The quick-range list for a search, each entry a button that applies its range; the applied range is pressed.
 * @param {TimePickerState} state
 * @param {string} id The picker's id, which prefixes every id inside it.
 */
export function quickList(state, id) {
  const entries = searchQuickRanges(state.query);
  if (!entries.length) return `<p class="tp-empty" id="${id}-empty">No quick range matches “${escape(state.query)}”. Type a span such as 45m or 3 days.</p>`;
  return `<ul class="tp-quick-list" id="${id}-quick" aria-label="Quick ranges">${entries.map(entry => {
    const current = entry.from === state.range.from && entry.to === state.range.to;
    return `<li><button type="button" class="${cx('tp-quick-item', entry.suggested && 'is-suggested')}" data-tp="pick" data-from="${escape(entry.from)}" data-to="${escape(entry.to)}" aria-pressed="${current}">${entry.suggested ? `<span class="tp-quick-tag">Use</span>` : ''}<span class="tp-quick-name">${escape(entry.label)}</span><code class="tp-quick-expr">${escape(entry.from)}${entry.to === 'now' ? '' : ` → ${escape(entry.to)}`}</code></button></li>`;
  }).join('')}</ul>`;
}

function field(state, id, name, label, hint) {
  const error = state.error?.field === name;
  const describedBy = [`${id}-${name}-hint`, error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return `<div class="field tp-field"><label class="field-label" for="${id}-${name}">${label}</label><input class="tp-input" id="${id}-${name}" name="${name}" value="${escape(fieldText(state.draft[name]))}" autocomplete="off" spellcheck="false" aria-describedby="${describedBy}"${error ? ' aria-invalid="true"' : ''}><p class="field-hint" id="${id}-${name}-hint">${hint}</p></div>`;
}

/**
 * A Grafana-style time picker: arrows that move the range back and forward by half its span, the range in words that
 * opens the panel, zoom out, refresh now and auto-refresh. The panel takes an absolute range in two fields (`now-6h`,
 * `now/d` or `18-10-2026 09:00`), offers the quick ranges with a search that turns a typed span such as `45m` into a
 * range, and lists the recently used ranges. The markup works on its own; `mountTimePicker` makes it act.
 * @param {TimePickerState} state
 * @param {{ id?: string, now: number }} options
 * @returns {string}
 */
export function timePicker(state, { id = 'tp', now }) {
  const resolved = resolveRange(state.range, now);
  const label = rangeLabel(state.range, now);
  const span = resolved.ok ? resolved.to - resolved.from : 0;
  const half = spanWords(Math.round(span / 2));
  const live = isLive(state.range);
  const refreshing = Boolean(state.refresh);
  const recent = state.recent.length ? `<section class="tp-recent" aria-labelledby="${id}-recent-title"><h3 class="tp-heading" id="${id}-recent-title">Recently used</h3><ul class="tp-recent-list">${state.recent.map(entry => `<li><button type="button" class="tp-quick-item" data-tp="pick" data-from="${escape(entry.from)}" data-to="${escape(entry.to)}" aria-pressed="${entry.from === state.range.from && entry.to === state.range.to}"><span class="tp-quick-name">${escape(rangeLabel(entry, now))}</span></button></li>`).join('')}</ul></section>` : '';
  const panel = `<div class="tp-panel" id="${id}-panel" role="dialog" aria-label="Choose a time range"${state.open ? '' : ' hidden'}>
<form class="tp-absolute" data-tp-form novalidate aria-labelledby="${id}-absolute-title"><h3 class="tp-heading" id="${id}-absolute-title">Absolute time range</h3>${field(state, id, 'from', 'From', 'now-6h, now/d or 18-10-2026 09:00')}${field(state, id, 'to', 'To', 'now, now/d or 18-10-2026 17:00')}${state.error ? `<p class="field-error tp-error" id="${id}-error" role="alert">${icon('alert')}<span>${escape(state.error.message)}</span></p>` : ''}<button type="submit" class="button sm primary tp-apply">Apply time range</button>${recent}</form>
<section class="tp-quick" aria-labelledby="${id}-quick-title"><h3 class="tp-heading" id="${id}-quick-title">Quick ranges</h3><label class="sr-only" for="${id}-search">Search quick ranges or type a span such as 45m</label><div class="tp-search">${icon('search')}<input type="search" class="tp-input" id="${id}-search" data-tp-search value="${escape(state.query)}" placeholder="Search or type 45m, 3 days" autocomplete="off" spellcheck="false" aria-controls="${id}-quick-region"></div><div class="tp-quick-region" id="${id}-quick-region" data-tp-quick aria-live="polite">${quickList(state, id)}</div></section>
<p class="tp-foot"><span>Times in ${escape(state.timeZone)}.</span><span class="tp-keys"><kbd class="kbd">t</kbd> <kbd class="kbd">←</kbd> back · <kbd class="kbd">t</kbd> <kbd class="kbd">→</kbd> forward · <kbd class="kbd">t</kbd> <kbd class="kbd">z</kbd> zoom out</span></p>
</div>`;
  return `<div class="${cx('tp', state.open && 'is-open', live && 'is-live')}" id="${id}" data-time-picker>
<div class="tp-bar" role="group" aria-label="Time range">
<button type="button" class="button sm icon-only tp-step" data-tp="shift-back" aria-label="Move back ${half}" title="Move back ${half} (t ←)"${resolved.ok ? '' : ' disabled'}>${icon('chevron-left')}</button>
<button type="button" class="button sm tp-trigger" data-tp="toggle" title="${escape(label)}" aria-expanded="${state.open}" aria-controls="${id}-panel" aria-haspopup="dialog">${icon('clock')}<span class="tp-label">${escape(label)}</span>${live ? `<span class="${cx('tp-live', refreshing && 'is-ticking')}" aria-hidden="true"></span><span class="sr-only">, follows the clock</span>` : ''}${icon('chevron-down', 'tp-caret')}</button>
<button type="button" class="button sm icon-only tp-step" data-tp="shift-forward" aria-label="Move forward ${half}" title="Move forward ${half} (t →)"${resolved.ok && !atNow(state.range, now) ? '' : ' disabled'}>${icon('chevron')}</button>
<button type="button" class="button sm icon-only tp-zoom" data-tp="zoom-out" aria-label="Zoom out to ${spanWords(span * 2)}" title="Zoom out (t z)"${resolved.ok ? '' : ' disabled'}>${icon('zoom-out')}</button>
<span class="tp-refresh"><button type="button" class="button sm icon-only" data-tp="refresh-now" aria-label="Refresh now" title="Refresh now">${icon('refresh')}</button><select class="tp-every" data-tp-refresh aria-label="Refresh automatically">${refreshIntervals.map(([value, text]) => `<option value="${value}"${value === state.refresh ? ' selected' : ''}>${value ? `Every ${text}` : 'Auto off'}</option>`).join('')}</select></span>
</div>
${panel}
</div>`;
}

const typing = target => target instanceof Element && (target.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));

/**
 * Makes a picker act inside `host`, which it owns: it renders the state, runs every action through `pickerUpdate`,
 * keeps focus where the person was, closes on Escape or a click outside, moves through quick ranges with the arrow keys,
 * reads Grafana's `t ←`, `t →` and `t z` shortcuts anywhere on the page, and refreshes on the chosen interval while
 * the page is visible.
 * `timers` replaces `setInterval` and `clearInterval`, so a test can fire auto-refresh without waiting.
 * @param {Element} host
 * @param {{ state?: Partial<TimePickerState>, id?: string, now?: () => number, timers?: { set: (run: () => void, ms: number) => unknown, clear: (handle: unknown) => void }, onChange?: (change: { range: { from: string, to: string }, refresh: string, from: number, to: number }) => void, onRefresh?: (change: { range: { from: string, to: string }, from: number, to: number }) => void, shortcuts?: boolean }} [options]
 * @returns {{ state: () => TimePickerState, dispatch: (action: object) => void, destroy: () => void }}
 */
export function mountTimePicker(host, { state: initial = {}, id = 'tp', now = () => Date.now(), timers = null, onChange = () => {}, onRefresh = () => {}, shortcuts = true } = {}) {
  let state = pickerState(initial);
  let timer = null;
  let lastKey = null;
  let lastKeyAt = 0;
  const doc = host.ownerDocument;
  const view = doc.defaultView;
  const clock = timers ?? { set: (run, ms) => view.setInterval(run, ms), clear: handle => view.clearInterval(handle) };

  const emitRefresh = () => {
    const resolved = resolveRange(state.range, now());
    if (resolved.ok) onRefresh({ range: state.range, from: resolved.from, to: resolved.to });
  };
  const schedule = () => {
    if (timer) clock.clear(timer);
    timer = null;
    const every = refreshMs(state.refresh);
    if (every) timer = clock.set(() => { if (doc.visibilityState !== 'hidden') emitRefresh(); }, every);
  };
  const render = focus => {
    host.innerHTML = timePicker(state, { id, now: now() });
    if (focus) host.querySelector(focus)?.focus();
  };
  const dispatch = (action, focus) => {
    const result = pickerUpdate(state, action, now());
    const wasOpen = state.open;
    state = result.state;
    render(focus === undefined ? (wasOpen && !state.open ? `#${id} [data-tp="toggle"]` : null) : focus);
    if (action.type === 'refresh') schedule();
    if (result.changed) {
      const resolved = resolveRange(state.range, now());
      onChange({ range: state.range, refresh: state.refresh, from: resolved.from, to: resolved.to });
    }
  };

  const onClick = event => {
    const target = event.target.closest('[data-tp]');
    if (!target || !host.contains(target) || target.disabled) return;
    const kind = target.dataset.tp;
    if (kind === 'toggle') dispatch({ type: 'toggle' }, state.open ? undefined : `#${id}-search`);
    else if (kind === 'pick') dispatch({ type: 'pick', from: target.dataset.from, to: target.dataset.to });
    else if (kind === 'shift-back') dispatch({ type: 'shift', direction: -1 }, `#${id} [data-tp="shift-back"]`);
    else if (kind === 'shift-forward') dispatch({ type: 'shift', direction: 1 }, atNow(shiftRange(state.range, 1, now()), now()) ? `#${id} [data-tp="toggle"]` : `#${id} [data-tp="shift-forward"]`);
    else if (kind === 'zoom-out') dispatch({ type: 'zoom-out' }, `#${id} [data-tp="zoom-out"]`);
    else if (kind === 'refresh-now') emitRefresh();
  };
  const onInput = event => {
    if (event.target.matches('[data-tp-search]')) {
      state = pickerUpdate(state, { type: 'search', query: event.target.value }, now()).state;
      const region = host.querySelector('[data-tp-quick]');
      if (region) region.innerHTML = quickList(state, id);
    } else if (event.target.matches('.tp-absolute input')) {
      const hadError = Boolean(state.error);
      state = pickerUpdate(state, { type: 'draft', field: event.target.name, value: event.target.value }, now()).state;
      if (hadError && !state.error) {
        host.querySelector(`#${id}-error`)?.remove();
        event.target.removeAttribute('aria-invalid');
        event.target.setAttribute('aria-describedby', `${id}-${event.target.name}-hint`);
      }
    }
  };
  const onChangeEvent = event => {
    if (event.target.matches('[data-tp-refresh]')) dispatch({ type: 'refresh', value: event.target.value }, `#${id} [data-tp-refresh]`);
  };
  const onSubmit = event => {
    if (!event.target.matches('[data-tp-form]')) return;
    event.preventDefault();
    for (const input of event.target.querySelectorAll('input[name]')) state = pickerUpdate(state, { type: 'draft', field: input.name, value: input.value }, now()).state;
    dispatch({ type: 'apply' });
    if (state.error) host.querySelector(`#${id}-${state.error.field}`)?.focus();
  };
  const quickButtons = () => [...host.querySelectorAll('.tp-quick-list .tp-quick-item')];
  const onKeydown = event => {
    if (event.key === 'Escape' && state.open) { event.preventDefault(); dispatch({ type: 'close' }); return; }
    if (event.target.matches('[data-tp-search]')) {
      if (event.key === 'ArrowDown') { event.preventDefault(); quickButtons()[0]?.focus(); }
      else if (event.key === 'Enter') { event.preventDefault(); quickButtons()[0]?.click(); }
      return;
    }
    if (event.target.matches('.tp-quick-list .tp-quick-item') && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const buttons = quickButtons();
      const index = buttons.indexOf(event.target);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1);
      if (next < 0) host.querySelector('[data-tp-search]')?.focus();
      else buttons[Math.min(next, buttons.length - 1)]?.focus();
    }
  };
  const onDocumentKeydown = event => {
    if (!shortcuts || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
    const at = view.performance.now();
    const action = shortcutAction(lastKey, event.key, at - lastKeyAt);
    lastKey = event.key;
    lastKeyAt = at;
    if (!action) return;
    event.preventDefault();
    lastKey = null;
    if (action === 'zoom-out') dispatch({ type: 'zoom-out' });
    else dispatch({ type: 'shift', direction: action === 'shift-back' ? -1 : 1 });
  };
  const onPointerdown = event => { if (state.open && !host.contains(event.target)) dispatch({ type: 'close' }, null); };

  host.addEventListener('click', onClick);
  host.addEventListener('input', onInput);
  host.addEventListener('change', onChangeEvent);
  host.addEventListener('submit', onSubmit);
  host.addEventListener('keydown', onKeydown);
  doc.addEventListener('keydown', onDocumentKeydown);
  doc.addEventListener('pointerdown', onPointerdown);
  render();
  schedule();

  return {
    state: () => state,
    dispatch: action => dispatch(action),
    destroy() {
      if (timer) clock.clear(timer);
      host.removeEventListener('click', onClick);
      host.removeEventListener('input', onInput);
      host.removeEventListener('change', onChangeEvent);
      host.removeEventListener('submit', onSubmit);
      host.removeEventListener('keydown', onKeydown);
      doc.removeEventListener('keydown', onDocumentKeydown);
      doc.removeEventListener('pointerdown', onPointerdown);
    },
  };
}
