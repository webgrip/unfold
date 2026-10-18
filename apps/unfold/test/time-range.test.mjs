import assert from 'node:assert/strict';
import { test } from 'node:test';
import { absoluteRange, atNow, isAbsolute, isLive, normalizeEnd, parseTime, quickRanges, rangeFromQuery, rangeLabel, rangeToQuery, refreshMs, rememberRange, resolveRange, searchQuickRanges, shiftRange, shortcutAction, spanExpression, spanWords, suggestRange, zoomOut } from '../public/controls/time-range.js';
import { pickerState, pickerUpdate, quickList, timePicker } from '../public/controls/time-picker.js';

process.env.TZ = 'Europe/Amsterdam';
const HOUR = 3600000;
const now = new Date(2026, 9, 18, 9, 30, 0).getTime();
const at = (...parts) => new Date(...parts).getTime();

test('reads Grafana expressions of now, with rounding to the start or end of a unit', () => {
  assert.equal(parseTime('now', now), now);
  assert.equal(parseTime('now-6h', now), now - 6 * HOUR);
  assert.equal(parseTime(' now - 90m ', now), now - 1.5 * HOUR);
  assert.equal(parseTime('now+1d', now), at(2026, 9, 19, 9, 30));
  assert.equal(parseTime('now/d', now), at(2026, 9, 18));
  assert.equal(parseTime('now/d', now, { roundUp: true }), at(2026, 9, 19) - 1);
  assert.equal(parseTime('now-1d/d', now), at(2026, 9, 17));
  assert.equal(parseTime('now/w', now), at(2026, 9, 12), 'weeks start on Monday');
  assert.equal(parseTime('now-1w/w', now, { roundUp: true }), at(2026, 9, 12) - 1);
  assert.equal(parseTime('now/M', now), at(2026, 9, 1));
  assert.equal(parseTime('now-1M/M', now), at(2026, 8, 1));
  assert.equal(parseTime('now/y', now), at(2026, 0, 1));
  for (const bad of ['now-', 'now-6x', 'now6h', 'now-6h junk', 'nowish', '', null, undefined]) assert.equal(parseTime(bad, now), null, String(bad));
});

test('reads days and moments as nl-NL and ISO write them, and refuses impossible dates', () => {
  assert.equal(parseTime('18-10-2026 09:00', now), at(2026, 9, 18, 9));
  assert.equal(parseTime('18-10-2026 09:00:15', now), at(2026, 9, 18, 9, 0, 15));
  assert.equal(parseTime('2026-10-18 09:00', now), at(2026, 9, 18, 9));
  assert.equal(parseTime('18-10-2026', now), at(2026, 9, 18));
  assert.equal(parseTime('18-10-2026', now, { roundUp: true }), at(2026, 9, 19) - 1, 'a bare day as To means the whole day');
  assert.equal(parseTime('2026-10-18T07:00:00Z', now), Date.UTC(2026, 9, 18, 7));
  assert.equal(parseTime('2026-10-18T09:00:00+02:00', now), Date.UTC(2026, 9, 18, 7));
  assert.equal(parseTime('1760772600000', now), 1760772600000);
  for (const bad of ['31-02-2026', '18-13-2026', '18-10-2026 24:00', '18-10-2026 09:60', 'yesterday', '18/10/2026']) assert.equal(parseTime(bad, now), null, bad);
});

test('the 25-hour day at the end of summer time keeps calendar arithmetic on the calendar', () => {
  const sunday = at(2026, 9, 25, 12);
  assert.equal(parseTime('now-1d', sunday), at(2026, 9, 24, 12));
  assert.equal(parseTime('now/d', sunday, { roundUp: true }) - parseTime('now/d', sunday), 25 * HOUR - 1);
});

test('a range resolves only when both ends are times and From comes first', () => {
  assert.deepEqual(resolveRange({ from: 'now-6h', to: 'now' }, now), { ok: true, from: now - 6 * HOUR, to: now });
  assert.equal(resolveRange({ from: 'later', to: 'now' }, now).field, 'from');
  assert.equal(resolveRange({ from: 'now-1h', to: 'soon' }, now).field, 'to');
  assert.deepEqual(resolveRange({ from: 'now', to: 'now-1h' }, now).message, 'From must be before To.');
  assert.ok(resolveRange({ from: 'now/d', to: 'now/d' }, now).ok, 'Today rounds To up to the end of the day');
});

test('names ranges the way a person says them', () => {
  assert.equal(rangeLabel({ from: 'now-6h', to: 'now' }, now), 'Last 6 hours');
  assert.equal(rangeLabel({ from: 'now-1d/d', to: 'now-1d/d' }, now), 'Yesterday');
  assert.equal(rangeLabel({ from: 'now-45m', to: 'now' }, now), 'Last 45 minutes');
  assert.equal(rangeLabel({ from: 'now-1y', to: 'now' }, now), 'Last year');
  assert.equal(rangeLabel(absoluteRange(at(2026, 9, 18, 7), at(2026, 9, 18, 8, 15)), now), '18-10-2026 07:00 to 08:15');
  assert.equal(rangeLabel(absoluteRange(at(2026, 9, 17, 21, 15), at(2026, 9, 18, 9)), now), '17-10-2026 21:15 to 18-10-2026 09:00');
  assert.equal(rangeLabel(absoluteRange(at(2026, 9, 18, 7, 0, 30), at(2026, 9, 18, 8)), now), '18-10-2026 07:00:30 to 08:00');
  assert.equal(rangeLabel({ from: 'now-2d', to: 'now-1d' }, now), 'now-2d to now-1d');
  for (const entry of quickRanges) assert.ok(resolveRange(entry, now).ok, entry.label);
});

test('moves a range by half its span and follows the clock again once it reaches now', () => {
  const back = shiftRange({ from: 'now-6h', to: 'now' }, -1, now);
  assert.deepEqual(back, absoluteRange(now - 9 * HOUR, now - 3 * HOUR));
  assert.deepEqual(shiftRange(back, 1, now), { from: 'now-6h', to: 'now' });
  assert.deepEqual(shiftRange({ from: 'now-6h', to: 'now' }, 1, now), { from: 'now-6h', to: 'now' }, 'never past now');
  assert.deepEqual(shiftRange({ from: 'bad', to: 'now' }, -1, now), { from: 'bad', to: 'now' });
  assert.equal(atNow({ from: 'now-6h', to: 'now' }, now), true);
  assert.equal(atNow(back, now), false);
  assert.equal(atNow({ from: 'now/d', to: 'now/d' }, now), true, 'Today already reaches past now');
});

test('zooms out around the middle without reaching past now', () => {
  assert.deepEqual(zoomOut({ from: 'now-6h', to: 'now' }, now), { from: 'now-12h', to: 'now' });
  assert.deepEqual(zoomOut(absoluteRange(now - 10 * HOUR, now - 8 * HOUR), now), absoluteRange(now - 11 * HOUR, now - 7 * HOUR));
  assert.deepEqual(zoomOut(absoluteRange(now - 3 * HOUR, now - HOUR), now), { from: 'now-4h', to: 'now' });
  assert.deepEqual(zoomOut({ from: 'now-7m', to: 'now' }, now, 3), { from: 'now-21m', to: 'now' });
});

test('spans read as words and as Grafana durations', () => {
  assert.equal(spanWords(6 * HOUR), '6 hours');
  assert.equal(spanWords(HOUR), '1 hour');
  assert.equal(spanWords(90 * 60000), '90 minutes');
  assert.equal(spanWords(2 * 24 * HOUR), '2 days');
  assert.equal(spanWords(1500), '2 seconds');
  assert.equal(spanExpression(36 * HOUR), '36h');
  assert.equal(spanExpression(48 * HOUR), '2d');
  assert.equal(spanExpression(1500), null);
});

test('a typed span becomes a range, and a search puts it before the matching quick ranges', () => {
  assert.deepEqual(suggestRange('45m'), { from: 'now-45m', to: 'now', label: 'Last 45 minutes' });
  assert.deepEqual(suggestRange('3 days'), { from: 'now-3d', to: 'now', label: 'Last 3 days' });
  assert.deepEqual(suggestRange('last 2 weeks'), { from: 'now-2w', to: 'now', label: 'Last 2 weeks' });
  assert.deepEqual(suggestRange('now-1M'), { from: 'now-1M', to: 'now', label: 'Last month' });
  assert.equal(suggestRange('2 fortnights'), null);
  assert.equal(suggestRange('0h'), null);
  assert.equal(searchQuickRanges('').length, quickRanges.length);
  assert.deepEqual(searchQuickRanges('week').map(entry => entry.label), ['This week', 'This week so far', 'Previous week']);
  const typed = searchQuickRanges('45m');
  assert.equal(typed[0].label, 'Last 45 minutes');
  assert.equal(typed[0].suggested, true);
  assert.equal(searchQuickRanges('6h').filter(entry => entry.from === 'now-6h').length, 1, 'no suggestion that repeats a quick range');
});

test('remembers the last four absolute ranges, newest first and without repeats', () => {
  const ranges = [1, 2, 3, 4, 5].map(n => absoluteRange(now - (n + 1) * HOUR, now - n * HOUR));
  let recent = [];
  for (const range of ranges) recent = rememberRange(recent, range);
  assert.deepEqual(recent, ranges.slice(1).reverse());
  assert.deepEqual(rememberRange(recent, ranges[2]), [ranges[2], ranges[4], ranges[3], ranges[1]]);
  assert.equal(rememberRange(recent, { from: 'now-1h', to: 'now' }), recent);
  assert.equal(isAbsolute(ranges[0]), true);
  assert.equal(isLive({ from: 'now-1h', to: 'now' }), true);
  assert.equal(isLive({ from: 'now/d', to: 'now/d' }), false);
});

test('a range and auto-refresh round-trip through the address and refuse what they do not know', () => {
  assert.deepEqual(rangeFromQuery({ from: 'now-24h', to: 'now', refresh: '30s' }, now), { range: { from: 'now-24h', to: 'now' }, refresh: '30s' });
  assert.deepEqual(rangeFromQuery({ from: 'now', to: 'now-1h', refresh: '7s' }, now), { range: { from: 'now-6h', to: 'now' }, refresh: '' });
  assert.deepEqual(rangeFromQuery({}, now, { from: 'now-7d', to: 'now' }).range, { from: 'now-7d', to: 'now' });
  assert.deepEqual(rangeToQuery({ from: 'now-6h', to: 'now' }), { from: '', to: '', refresh: '' });
  assert.deepEqual(rangeToQuery({ from: 'now-1h', to: 'now' }, '1m'), { from: 'now-1h', to: 'now', refresh: '1m' });
  assert.equal(refreshMs('1m'), 60000);
  assert.equal(refreshMs('1h'), HOUR);
  assert.equal(refreshMs(''), 0);
  assert.equal(refreshMs('2s'), 0);
  assert.equal(normalizeEnd('18-10-2026 07:00', now, false), String(at(2026, 9, 18, 7)));
  assert.equal(normalizeEnd(' now - 2h ', now, false), 'now-2h');
  assert.equal(normalizeEnd('rubbish', now, false), 'rubbish');
});

test('only t followed quickly by an arrow or z is a shortcut', () => {
  assert.equal(shortcutAction('t', 'ArrowLeft', 200), 'shift-back');
  assert.equal(shortcutAction('t', 'ArrowRight', 200), 'shift-forward');
  assert.equal(shortcutAction('t', 'z', 200), 'zoom-out');
  assert.equal(shortcutAction('t', 'z', 2000), null);
  assert.equal(shortcutAction('x', 'z', 200), null);
  assert.equal(shortcutAction(null, 'ArrowLeft', 0), null);
});

test('the picker state machine opens, checks, applies and reports changes', () => {
  let state = pickerState();
  let result = pickerUpdate(state, { type: 'toggle' }, now);
  assert.equal(result.state.open, true);
  assert.equal(result.changed, false);
  state = pickerUpdate(result.state, { type: 'draft', field: 'from', value: 'soon' }, now).state;
  result = pickerUpdate(state, { type: 'apply' }, now);
  assert.equal(result.changed, false);
  assert.deepEqual(result.state.error, { field: 'from', message: 'From is not a time. Try now-6h, now/d or 18-10-2026 09:00.' });
  assert.equal(result.state.open, true, 'a bad range keeps the panel open');
  state = pickerUpdate(result.state, { type: 'draft', field: 'from', value: '18-10-2026 07:00' }, now).state;
  assert.equal(state.error, null, 'editing the field at fault clears its error');
  result = pickerUpdate({ ...state, draft: { from: '18-10-2026 07:00', to: '18-10-2026 08:00' } }, { type: 'apply' }, now);
  assert.equal(result.changed, true);
  assert.equal(result.state.open, false);
  assert.deepEqual(result.state.range, absoluteRange(at(2026, 9, 18, 7), at(2026, 9, 18, 8)));
  assert.deepEqual(result.state.recent, [result.state.range]);
  assert.equal(pickerUpdate(result.state, { type: 'pick', from: result.state.range.from, to: result.state.range.to }, now).changed, false, 'picking the applied range changes nothing');
  assert.equal(pickerUpdate(result.state, { type: 'pick', from: 'x', to: 'now' }, now).changed, false);
  assert.deepEqual(pickerUpdate(pickerState(), { type: 'zoom-out' }, now).state.range, { from: 'now-12h', to: 'now' });
  assert.equal(pickerUpdate(pickerState(), { type: 'shift', direction: 1 }, now).changed, false);
  assert.equal(pickerUpdate(pickerState(), { type: 'refresh', value: '30s' }, now).state.refresh, '30s');
  assert.equal(pickerUpdate(pickerState(), { type: 'refresh', value: '3s' }, now).state.refresh, '');
  assert.equal(pickerUpdate(pickerState({ open: true, error: { field: 'to', message: 'x' } }), { type: 'close' }, now).state.error, null);
  const closed = pickerUpdate(pickerState({ open: true, query: 'week' }), { type: 'toggle' }, now).state;
  assert.equal(pickerUpdate(closed, { type: 'toggle' }, now).state.query, '', 'reopening starts a fresh search');
});

test('the markup names every control and says what the arrows will do', () => {
  const closed = timePicker(pickerState(), { now });
  assert.match(closed, /aria-label="Move back 3 hours"/);
  assert.match(closed, /aria-label="Zoom out to 12 hours"/);
  assert.match(closed, /data-tp="shift-forward"[^>]*disabled/, 'nothing lies after now');
  assert.match(closed, /aria-expanded="false"/);
  assert.match(closed, /class="tp-panel"[^>]*hidden/);
  assert.match(closed, /follows the clock/);
  const open = timePicker(pickerState({ open: true, range: absoluteRange(now - 3 * HOUR, now - HOUR) }), { now, id: 'range' });
  assert.match(open, /aria-expanded="true"/);
  assert.doesNotMatch(open, /class="tp-panel"[^>]*hidden/);
  assert.doesNotMatch(open, /data-tp="shift-forward"[^>]*disabled/);
  assert.doesNotMatch(open, /follows the clock/);
  assert.match(open, /id="range-from"[^>]*value="18-10-2026 06:30"/);
  assert.ok([...open.matchAll(/\sid="([^"]+)"/g)].every(match => match[1].startsWith('range')), 'every id carries the picker id');
  assert.match(quickList(pickerState({ query: 'nothing here' }), 'tp'), /No quick range matches “nothing here”/);
  assert.match(quickList(pickerState(), 'tp'), /data-from="now-6h" data-to="now" aria-pressed="true"/);
  assert.match(timePicker(pickerState({ query: '<b>' , open: true }), { now }), /value="&lt;b&gt;"/);
});

test('a Run is in a range when it worked at any time inside it, and an event when it happened inside it', async () => {
  const { eventInRange, reachesStart, runInRange, runSpan } = await import('../public/controls/range-filter.js');
  const range = { from: now - 6 * HOUR, to: now };
  const iso = ms => new Date(ms).toISOString();
  assert.equal(runInRange({ startedAt: iso(now - 8 * HOUR), finishedAt: iso(now - 5 * HOUR) }, range, now), true, 'overlaps the start');
  assert.equal(runInRange({ startedAt: iso(now - 8 * HOUR), finishedAt: iso(now - 7 * HOUR) }, range, now), false);
  assert.equal(runInRange({ startedAt: iso(now - 30 * HOUR), finishedAt: null }, range, now), true, 'still running');
  assert.equal(runInRange({ startedAt: null, finishedAt: null }, range, now), true, 'waiting for a worker');
  assert.equal(runInRange({ startedAt: null, finishedAt: null }, { from: now - 9 * HOUR, to: now - 3 * HOUR }, now), false, 'a waiting Run is not in the past');
  assert.deepEqual(runSpan({ startedAt: 'garbage', finishedAt: iso(now - HOUR) }, now), { start: now - HOUR, end: now - HOUR });
  assert.equal(eventInRange({ at: iso(now - HOUR) }, range), true);
  assert.equal(eventInRange({ at: iso(now - 7 * HOUR) }, range), false);
  assert.equal(eventInRange({ at: '' }, range), true, 'an event without a time is never hidden');
  const start = entry => Date.parse(entry.at);
  assert.equal(reachesStart([{ at: iso(now - HOUR) }], start, range, true), false);
  assert.equal(reachesStart([{ at: iso(now - HOUR) }, { at: iso(now - 7 * HOUR) }], start, range, true), true);
  assert.equal(reachesStart([], start, range, false), true, 'nothing older exists');
  assert.equal(reachesStart([], start, range, true), false);
});

test('Runs and Activity show only what falls in the range, and offer to zoom out when nothing does', async () => {
  const { activityMarkup, runsMarkup } = await import('../public/ploeg-activity.js');
  const helpers = { escape: value => String(value), icon: name => `<i data-icon="${name}"></i>`, money: value => String(value), safeUrl: value => value, ago: () => '' };
  const iso = ms => new Date(ms).toISOString();
  const run = (id, hoursAgo) => ({ id, workItemId: '1', workItemTitle: `Run ${id} item`, team: 'a', role: 'builder', round: 1, state: 'finished', outcome: 'pr_opened', startedAt: iso(now - (hoursAgo + 1) * HOUR), finishedAt: iso(now - hoursAgo * HOUR), durationSeconds: 3600 });
  const view = { runs: [run('3', 1), run('2', 30), run('1', 200)], nextBefore: null, filter: {}, range: { from: now - 24 * HOUR, to: now }, rangeControl: '<div class="tp" id="runs-range"></div>' };
  const html = runsMarkup(view, [], helpers, now);
  assert.match(html, /id="runs-range"/);
  assert.match(html, /Run 3 item/);
  assert.doesNotMatch(html, /Run 2 item/);
  assert.match(html, /1 Run of 3 loaded in this time range/);
  const none = runsMarkup({ ...view, range: { from: now - 400 * HOUR, to: now - 300 * HOUR } }, [], helpers, now);
  assert.match(none, /No Runs in this time range/);
  assert.match(none, /data-action="runs-range-zoom-out"/);
  assert.match(runsMarkup({ ...view, range: { from: now - 400 * HOUR, to: now - 300 * HOUR }, nextBefore: '1', rangeFilling: true }, [], helpers, now), /Reaching the start of the range/);
  const events = [{ id: '9', at: iso(now - HOUR), action: 'run.finished', actor: 'ploeg', team: 'a', detail: {} }, { id: '8', at: iso(now - 50 * HOUR), action: 'run.finished', actor: 'ploeg', team: 'a', detail: {} }];
  const feed = activityMarkup({ events, nextCursor: null, team: '', kind: '', range: { from: now - 24 * HOUR, to: now }, rangeControl: '' }, [], helpers, now);
  assert.match(feed, /2 events loaded, 1 in this time range/);
  assert.match(activityMarkup({ events, nextCursor: null, team: '', kind: '', range: { from: now - 400 * HOUR, to: now - 300 * HOUR } }, [], helpers, now), /No events in this time range[\s\S]*activity-range-zoom-out/);
});
