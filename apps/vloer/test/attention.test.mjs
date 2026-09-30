import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAttention, newlyWaiting, notificationFor, summaryNotification, spellKey, waitingRows, notifiedKey } from '../public/core/attention.js';
import { createFavicon, drawFavicon, faviconShape, faviconTokens } from '../public/core/favicon.js';
import { listReason } from '../public/core/reasons.js';
import { prefsKey } from '../public/core/prefs.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => { data.set(key, String(value)); }, data };
}

function notificationEnv({ permission = 'granted', secure = true, attentive = false, storage = memoryStorage(), supported = true, throws = false, answer = 'granted' } = {}) {
  const shown = [];
  const favicons = [];
  const opened = [];
  class FakeNotification {
    static permission = permission;
    static requests = 0;
    static async requestPermission() { FakeNotification.requests++; FakeNotification.permission = answer; return answer; }
    constructor(title, options) { if (throws) throw new TypeError('Illegal constructor'); Object.assign(this, { title, ...options }); shown.push(this); }
    close() { this.closed = true; }
  }
  const env = { favicon: visible => favicons.push(visible), notifications: () => supported ? FakeNotification : null, secure: () => secure, storage: () => storage, attentive: () => attentive, open: hash => opened.push(hash) };
  return { env, shown, favicons, opened, storage, FakeNotification };
}

const waiting = ids => ids.map(id => ({ id: String(id), state: 'needs_human', title: `Item ${id}`, team: 'delivery', updatedAt: '2026-09-30T10:00:00Z', closeReason: 'plan_exhausted', latestShift: { closeReason: 'plan_exhausted', closedAt: '2026-09-30T10:00:00Z' } }));

test('the favicon dot follows the count of what waits on you, and unknown counts show no dot', () => {
  const { env, favicons } = notificationEnv();
  const attention = createAttention(env);
  attention.update({ waiting: 3 });
  attention.update({ waiting: 0 });
  attention.update({ waiting: null });
  attention.reset();
  assert.deepEqual(favicons, [true, false, false, false]);
});

test('desktop notifications announce each item that starts waiting, once, only when on and while the person looks elsewhere', async () => {
  const { env, shown, opened, storage } = notificationEnv();
  const attention = createAttention(env);
  assert.equal(attention.status(), 'off', 'off by default');
  attention.update({ waiting: 2, items: waiting([101, 105]) });
  attention.update({ waiting: 3, items: waiting([101, 105, 108]) });
  assert.equal(shown.length, 0, 'nothing is sent while notifications are off');
  assert.equal(await attention.enable(), 'on');
  assert.equal(JSON.parse(storage.data.get(prefsKey)).notify, true);
  assert.deepEqual(attention.update({ waiting: 3, items: waiting([101, 105, 108]) }), [], 'items already waiting are not new');
  const sent = attention.update({ waiting: 4, items: waiting([101, 105, 108, 109]) });
  assert.equal(sent.length, 1);
  assert.deepEqual({ title: shown[0].title, body: shown[0].body, tag: shown[0].tag }, { title: 'Item 109', body: `Needs you: ${listReason(waiting([109])[0]).chip} · delivery · #109`, tag: 'vloer-waiting-109' });
  shown[0].onclick();
  assert.deepEqual(opened, ['work/109']);
  assert.equal(shown[0].closed, true);
  attention.update({ waiting: 1, items: waiting([109]) });
  attention.update({ waiting: null, items: null });
  assert.equal(attention.update({ waiting: 1, items: waiting([109]) }).length, 0, 'an unknown read keeps the previous list');
  attention.update({ waiting: 0, items: [] });
  assert.equal(attention.update({ waiting: 1, items: waiting([109]) }).length, 0, 'an empty read in between does not make the same spell new');
  const again = waiting([109]).map(item => ({ ...item, updatedAt: '2026-09-30T12:00:00Z' }));
  attention.update({ waiting: 0, items: [] });
  assert.equal(attention.update({ waiting: 1, items: again }).length, 1, 'waiting again later is a new spell');
  assert.equal(attention.disable(), 'off');
  assert.equal(attention.update({ waiting: 2, items: waiting([109, 120]) }).length, 0);
});

test('a focused tab, a second tab and a burst of items keep notifications quiet and short', async () => {
  const shared = memoryStorage();
  const first = notificationEnv({ storage: shared });
  const second = notificationEnv({ storage: shared });
  const one = createAttention(first.env);
  const two = createAttention(second.env);
  await one.enable();
  for (const attention of [one, two]) attention.update({ waiting: 1, items: waiting([1]) });
  one.update({ waiting: 2, items: waiting([1, 2]) });
  two.update({ waiting: 2, items: waiting([1, 2]) });
  assert.deepEqual([first.shown.length, second.shown.length], [1, 0], 'the second tab sees the spell was announced');
  assert.equal(JSON.parse(shared.data.get(notifiedKey))[0][0], spellKey(waiting([2])[0]));
  one.update({ waiting: 7, items: waiting([1, 2, 3, 4, 5, 6, 7]) });
  assert.deepEqual({ title: first.shown[1].title, tag: first.shown[1].tag }, { title: '5 new items wait on you', tag: 'vloer-waiting' });
  assert.deepEqual(summaryNotification(5), { title: '5 new items wait on you', body: 'Open De Vloer to see what needs you.', tag: 'vloer-waiting', hash: 'now' });
  const focused = notificationEnv({ attentive: true });
  const looking = createAttention(focused.env);
  await looking.enable();
  looking.update({ waiting: 1, items: waiting([1]) });
  looking.update({ waiting: 2, items: waiting([1, 2]) });
  assert.equal(focused.shown.length, 0, 'someone looking at the tab needs no notification');
});

test('notification status reflects the browser, and permission is asked for only when turning them on', async () => {
  assert.equal(createAttention(notificationEnv({ supported: false }).env).status(), 'unsupported');
  assert.equal(createAttention(notificationEnv({ secure: false }).env).status(), 'insecure');
  assert.equal(createAttention(notificationEnv({ permission: 'denied' }).env).status(), 'denied');
  const asking = notificationEnv({ permission: 'default', storage: memoryStorage({ [prefsKey]: JSON.stringify({ theme: 'dark' }) }) });
  const attention = createAttention(asking.env);
  assert.equal(asking.FakeNotification.requests, 0);
  assert.equal(await attention.enable(), 'on');
  assert.equal(asking.FakeNotification.requests, 1);
  assert.deepEqual(JSON.parse(asking.storage.data.get(prefsKey)), { theme: 'dark', notify: true }, 'other preferences are kept');
  const refused = notificationEnv({ permission: 'default', answer: 'denied' });
  const no = createAttention(refused.env);
  assert.equal(await no.enable(), 'denied');
  assert.equal(refused.storage.data.has(prefsKey), false);
  const broken = notificationEnv({ throws: true });
  const phone = createAttention(broken.env);
  await phone.enable();
  phone.update({ waiting: 1, items: waiting([1]) });
  phone.update({ waiting: 2, items: waiting([1, 2]) });
  assert.equal(phone.status(), 'unsupported', 'a browser that refuses page notifications is reported as unsupported');
});

test('notification copy says what the item waits for, and waiting rows ignore failed or malformed reads', () => {
  assert.deepEqual(notificationFor({ id: '105', state: 'awaiting_review', title: 'Round half-cent totals', team: 'delivery' }), { title: 'Round half-cent totals', body: 'Ready for your review · delivery · #105', tag: 'vloer-waiting-105', hash: 'work/105' });
  assert.equal(notificationFor({ id: '107', state: 'proposed', title: '', team: 'research' }).title, 'Work Item #107');
  assert.equal(notificationFor({ id: '107', state: 'proposed', title: 'x', team: 'research' }).body, 'Proposed: approve or reject it · research · #107');
  assert.equal(notificationFor({ id: '1', state: 'needs_human', title: 'a'.repeat(300) }).title.length, 120);
  assert.deepEqual(newlyWaiting(new Set(['1']), waiting([1, 2])).map(item => item.id), ['2']);
  assert.deepEqual(newlyWaiting(new Set(), waiting([1, 2]), new Set([spellKey(waiting([1])[0])])).map(item => item.id), ['2'], 'a spell this tab already saw is not new');
  assert.equal(waitingRows({ errors: { waiting: 'Ploeg could not be read.' }, waiting: [] }), null);
  assert.equal(waitingRows(null), null);
  assert.deepEqual(waitingRows({ errors: {}, waiting: [{ id: '5' }, { id: 'x' }, null] }), [{ id: '5' }]);
});

function recordingContext() {
  const calls = [];
  const context = new Proxy({}, {
    get: (target, name) => name in target ? target[name] : (...args) => calls.push([name, ...args]),
    set: (target, name, value) => { target[name] = value; calls.push([`=${String(name)}`, value]); return true; },
  });
  return { context, calls };
}

test('the favicon is the mark from favicon.svg, with a dot cut out of its corner when something waits', () => {
  const colors = { vee: 'rgb(61, 132, 232)', ground: 'rgb(21, 25, 28)', dot: 'oklch(0.645 0.136 75)' };
  const plain = recordingContext();
  drawFavicon(plain.context, colors, false);
  assert(plain.calls.some(([name, value]) => name === '=strokeStyle' && value === colors.vee));
  assert(plain.calls.some(([name, ...args]) => name === 'fillRect' && args.join() === faviconShape.ground.join()));
  assert(!plain.calls.some(([name]) => name === 'arc'));
  const dotted = recordingContext();
  drawFavicon(dotted.context, colors, true);
  const arcs = dotted.calls.filter(([name]) => name === 'arc').map(([, x, y, radius]) => [x, y, radius]);
  assert.deepEqual(arcs, [[48, 16, 18], [48, 16, 15]]);
  assert(faviconShape.dot.radius * 2 >= faviconShape.size * 0.45, 'the dot is nearly half the icon wide, so it reads at 16 pixels');
  assert.deepEqual(dotted.calls.filter(([name]) => name === '=globalCompositeOperation').map(([, value]) => value), ['source-over', 'destination-out', 'source-over']);
  assert(dotted.calls.some(([name, value]) => name === '=fillStyle' && value === colors.dot));
  assert.deepEqual(faviconTokens, { vee: '--peil', groundLight: '--vlak', groundDark: '--krijt', dot: '--attention-signal', dotFallback: '--attention-solid' });
});

test('the favicon switch points the icon links at a PNG with the dot and puts the originals back', () => {
  const link = attrs => ({ attrs: { ...attrs }, writes: 0, getAttribute(name) { return this.attrs[name] ?? null; }, setAttribute(name, value) { this.writes++; this.attrs[name] = String(value); }, removeAttribute(name) { this.writes++; delete this.attrs[name]; } });
  const links = [link({ href: '/favicon.svg', type: 'image/svg+xml' }), link({ href: '/favicon.ico', sizes: '48x48' })];
  let dark = false;
  let canvases = 0;
  const grounds = [];
  const dots = [];
  const favicon = createFavicon({
    links: () => links,
    dark: () => dark,
    color: (token, fallback) => `color(${token}${fallback ? `, ${fallback}` : ''})`,
    canvas: () => { canvases++; const { context, calls } = recordingContext(); return { getContext: () => context, toDataURL: type => { grounds.push(calls.find(([name, value]) => name === '=fillStyle' && value.includes('--vlak') || name === '=fillStyle' && value.includes('--krijt'))[1]); dots.push(calls.filter(([name]) => name === '=fillStyle').at(-1)[1]); return `data:${type};base64,${canvases}`; } }; },
  });
  favicon.show(false);
  assert.equal(links[0].writes, 0, 'nothing changes while the dot stays hidden');
  favicon.show(true);
  assert.deepEqual(links.map(item => [item.attrs.href, item.attrs.type]), [['data:image/png;base64,1', 'image/png'], ['data:image/png;base64,1', 'image/png']]);
  favicon.show(true);
  favicon.refresh();
  assert.equal(canvases, 1, 'an unchanged dot is not painted again');
  dark = true;
  favicon.refresh();
  assert.equal(canvases, 2);
  assert.deepEqual(grounds, ['color(--vlak)', 'color(--krijt)'], 'the ground follows the browser scheme like the SVG favicon');
  assert.deepEqual(dots, ['color(--attention-signal, --attention-solid)', 'color(--attention-signal, --attention-solid)'], 'the dot is the high-chroma signal, with the solid attention tone as fallback');
  favicon.show(false);
  assert.deepEqual(links.map(item => item.attrs), [{ href: '/favicon.svg', type: 'image/svg+xml' }, { href: '/favicon.ico', sizes: '48x48' }]);
  assert.equal(favicon.visible, false);
});
