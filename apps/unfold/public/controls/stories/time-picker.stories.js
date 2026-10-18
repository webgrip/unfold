import { mountTimePicker, pickerState, pickerUpdate, timePicker } from '../time-picker.js';
import { absoluteRange, refreshIntervals } from '../time-range.js';
import { click, expect, find, press, shown, type } from '../../live/stories/play.js';

/** The moment every time picker story renders at: 18 October 2026, 09:30 in Amsterdam. */
export const storyNow = Date.UTC(2026, 9, 18, 7, 30);
const HOUR = 3600000;

function stateOf({ from, to, refresh, open, query, recent, typedFrom, typedTo }) {
  const state = pickerState({ range: { from, to }, refresh, open, query, recent, timeZone: 'Europe/Amsterdam' });
  if (typedFrom === undefined && typedTo === undefined) return state;
  const typed = { ...state, draft: { from: typedFrom ?? from, to: typedTo ?? to } };
  return pickerUpdate(typed, { type: 'apply' }, storyNow).state;
}

function mount(canvasElement, args, options = {}) {
  const host = find(canvasElement, '.tp-story');
  const changes = [];
  const refreshes = [];
  const picker = mountTimePicker(host, { state: stateOf(args), now: () => storyNow, onChange: change => changes.push(change), onRefresh: change => refreshes.push(change), ...options });
  return { host, picker, changes, refreshes, trigger: () => find(host, '[data-tp="toggle"]'), panel: () => find(host, '.tp-panel') };
}

export default {
  title: 'Controls/Time range',
  render: args => timePicker(stateOf(args), { id: 'tp', now: storyNow }),
  args: { from: 'now-6h', to: 'now', refresh: '', open: false, query: '', recent: [] },
  argTypes: {
    from: { control: 'text' },
    to: { control: 'text' },
    refresh: { control: 'select', options: refreshIntervals.map(([id]) => id) },
    open: { control: 'boolean' },
    query: { control: 'text' },
  },
  decorators: [story => `<div class="tp-story">${story()}</div>`],
  parameters: { layout: 'padded', frame: 'panel' },
};

export const LastSixHours = {};
export const Today = { args: { from: 'now/d', to: 'now/d' } };
export const AbsoluteRange = { args: absoluteRange(storyNow - 12.25 * HOUR, storyNow - 0.5 * HOUR) };
export const AutoRefresh = { args: { from: 'now-15m', refresh: '30s' } };
export const Open = { args: { open: true } };
export const OpenWithRecent = { args: { open: true, ...absoluteRange(storyNow - 3 * HOUR, storyNow - HOUR), recent: [absoluteRange(storyNow - 3 * HOUR, storyNow - HOUR), absoluteRange(storyNow - 30 * HOUR, storyNow - 26 * HOUR)] } };
export const TypedSpan = { args: { open: true, query: '45m' } };
export const NoMatch = { args: { open: true, query: 'fortnight' } };
export const InvalidFrom = { args: { open: true, typedFrom: 'yesterday 9am' } };
export const FromAfterTo = { args: { open: true, typedFrom: 'now', typedTo: 'now-1h' } };

/** The picker acting, so a person can try it in the workbench. */
export const Interactive = { play: ({ canvasElement, args }) => mount(canvasElement, args).picker.destroy };

/** Opens with a click, types a span, applies it with Enter and lands focus back on the trigger. */
export const PicksATypedSpan = {
  play: ({ canvasElement, args }) => {
    const { host, picker, changes, trigger, panel } = mount(canvasElement, args);
    click(trigger());
    expect(shown(panel()), 'the panel to open on a click');
    expect(trigger().getAttribute('aria-expanded') === 'true', 'the trigger to say it is expanded');
    const search = find(host, '[data-tp-search]');
    expect(host.ownerDocument.activeElement === search, 'focus in the quick-range search');
    type(search, '2h');
    const first = find(host, '.tp-quick-list .tp-quick-item');
    expect(first.textContent.includes('Last 2 hours') && first.classList.contains('is-suggested'), `the typed span first, got “${first.textContent}”`);
    press(search, 'Enter');
    expect(!shown(panel()), 'the panel to close after picking');
    expect(trigger().textContent.includes('Last 2 hours'), `the trigger to read Last 2 hours, got “${trigger().textContent}”`);
    expect(host.ownerDocument.activeElement === trigger(), 'focus back on the trigger');
    expect(changes.length === 1 && changes[0].range.from === 'now-2h' && changes[0].to === storyNow, 'one change for now-2h to now');
    return picker.destroy;
  },
};

/** Grafana's t ←, t → and t z move and widen the range from anywhere on the page. */
export const KeyboardShortcuts = {
  play: ({ canvasElement, args }) => {
    const { picker, changes, trigger } = mount(canvasElement, args);
    const body = canvasElement.ownerDocument.body;
    press(body, 't');
    expect(!press(body, 'ArrowLeft'), 't ← to be handled');
    const back = absoluteRange(storyNow - 9 * HOUR, storyNow - 3 * HOUR);
    expect(picker.state().range.from === back.from && picker.state().range.to === back.to, 't ← to move six hours back by three');
    press(body, 't');
    press(body, 'ArrowRight');
    expect(picker.state().range.from === 'now-6h' && picker.state().range.to === 'now', 't → to return to Last 6 hours');
    press(body, 't');
    press(body, 'z');
    expect(trigger().textContent.includes('Last 12 hours'), `t z to zoom out to Last 12 hours, got “${trigger().textContent}”`);
    press(body, 'z');
    expect(picker.state().range.from === 'now-12h', 'a z without t to do nothing');
    expect(changes.length === 3, `three changes, got ${changes.length}`);
    return picker.destroy;
  },
};

/** A typed absolute range is checked, the mistake is named and focused, and a good range lands in Recently used. */
export const ChecksTypedRanges = {
  play: ({ canvasElement, args }) => {
    const { host, picker, changes, trigger } = mount(canvasElement, args);
    click(trigger());
    const from = find(host, '#tp-from');
    type(from, 'tomorrow');
    find(host, '[data-tp-form]').requestSubmit();
    const alert = find(host, '#tp-error');
    expect(alert.getAttribute('role') === 'alert' && /From is not a time/.test(alert.textContent), 'an alert that names From');
    expect(host.ownerDocument.activeElement === find(host, '#tp-from'), 'focus on the field at fault');
    expect(find(host, '#tp-from').getAttribute('aria-invalid') === 'true', 'From marked invalid');
    expect(changes.length === 0, 'no change for a bad range');
    type(find(host, '#tp-from'), '18-10-2026 07:00');
    expect(!host.querySelector('#tp-error'), 'the alert to clear once From is edited');
    type(find(host, '#tp-to'), '18-10-2026 08:15');
    find(host, '[data-tp-form]').requestSubmit();
    expect(changes.length === 1, 'one change for a good range');
    expect(trigger().textContent.includes('18-10-2026 07:00 to 08:15'), `the trigger to read the range, got “${trigger().textContent}”`);
    click(trigger());
    expect(find(host, '.tp-recent').textContent.includes('07:00 to 08:15'), 'the range under Recently used');
    return picker.destroy;
  },
};

/** Escape and a click outside both close the panel; Escape returns focus to the trigger, the outside click leaves it. */
export const ClosesLikeAPopover = {
  play: ({ canvasElement, args }) => {
    const { host, picker, trigger, panel } = mount(canvasElement, args);
    click(trigger());
    press(find(host, '[data-tp-search]'), 'Escape');
    expect(!shown(panel()), 'Escape to close the panel');
    expect(host.ownerDocument.activeElement === trigger(), 'focus back on the trigger after Escape');
    click(trigger());
    canvasElement.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(!shown(panel()), 'a click outside to close the panel');
    click(trigger());
    press(find(host, '[data-tp-search]'), 'ArrowDown');
    expect(host.ownerDocument.activeElement === find(host, '.tp-quick-item'), 'ArrowDown to move into the quick ranges');
    press(host.ownerDocument.activeElement, 'End');
    expect(host.ownerDocument.activeElement.textContent.includes('Previous month'), 'End to reach the last quick range');
    return picker.destroy;
  },
};

/** Refresh now and the chosen interval both ask for fresh data with the range resolved at that moment. */
export const RefreshesOnSchedule = {
  args: { refresh: '' },
  play: ({ canvasElement, args }) => {
    const scheduled = [];
    const timers = { set: (run, ms) => { scheduled.push({ run, ms, live: true }); return scheduled.length; }, clear: handle => { scheduled[handle - 1].live = false; } };
    const { host, picker, refreshes, changes } = mount(canvasElement, args, { timers });
    click(find(host, '[data-tp="refresh-now"]'));
    expect(refreshes.length === 1 && refreshes[0].to === storyNow && refreshes[0].from === storyNow - 6 * HOUR, 'Refresh now to ask once for the last six hours');
    const every = find(host, '[data-tp-refresh]');
    every.value = '30s';
    every.dispatchEvent(new Event('change', { bubbles: true }));
    expect(scheduled.length === 1 && scheduled[0].ms === 30000, 'a 30 second timer');
    expect(changes.at(-1)?.refresh === '30s', 'the refresh choice reported as a change');
    scheduled[0].run();
    expect(refreshes.length === 2, 'the timer to ask for fresh data');
    expect(find(host, '.tp-live').classList.contains('is-ticking'), 'the live dot to tick while auto-refresh is on');
    picker.destroy();
    expect(!scheduled[0].live, 'destroy to stop the timer');
    return null;
  },
};
