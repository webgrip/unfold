import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

globalThis.location ??= new URL('https://unfold.test/#now');
const { buffers, clearBuffers, consoleLimit, inlineSvgPaint, privateRegions, rememberConsole, rememberRequest, rememberRoute, requestLimit, trailLimit } = await import('../public/core/report-capture.js');
const { arrowHead, markAround, markFrom, spanned, targetAt } = await import('../public/core/annotate.js');

const publicDir = new URL('../public/', import.meta.url);

async function sources(directory = publicDir, prefix = '') {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'vendor') continue;
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) found.push(...await sources(new URL(`${entry.name}/`, directory), path));
    else if (entry.name.endsWith('.js')) found.push(path);
  }
  return found;
}

test('every component that renders code, logs, diffs or tracker and pull-request text marks it data-private, so the screenshot blurs it (markdown code blocks sit in a marked container)', async () => {
  const missing = [];
  for (const path of await sources()) {
    if (path === join('views', 'design.js') || path === join('core', 'markdown.js')) continue;
    const text = await readFile(new URL(path, publicDir), 'utf8');
    for (const match of text.matchAll(/<pre(?=[\s>])[^>]*>/g)) if (!match[0].includes('data-private')) missing.push(`${path}: ${match[0].slice(0, 60)}`);
    for (const match of text.matchAll(/\$\{markdown\(/g)) {
      const before = text.slice(0, match.index);
      const opening = before.slice(before.lastIndexOf('<div'));
      if (!opening.startsWith('<div') || !opening.slice(0, opening.indexOf('>') + 1).includes('data-private')) missing.push(`${path}: markdown() at ${before.split('\n').length}`);
    }
    for (const match of text.matchAll(/<(?:div|details) class="diff-(?:view|file)"[^>]*>/g)) if (!match[0].includes('data-private')) missing.push(`${path}: ${match[0]}`);
  }
  assert.deepEqual(missing, []);
});

function fakeStyle(initial = {}) {
  const values = new Map(Object.entries(initial).map(([name, value]) => [name, [value, '']]));
  return {
    values,
    getPropertyValue: name => values.get(name)?.[0] ?? '',
    getPropertyPriority: name => values.get(name)?.[1] ?? '',
    setProperty: (name, value, priority = '') => values.set(name, [value, priority]),
    removeProperty: name => values.delete(name),
  };
}

test('a shape inside an svg carries its stylesheet paint into the copy, and every inline style is put back afterwards', () => {
  const ring = { style: fakeStyle({ stroke: 'red' }), painted: { fill: 'none', stroke: 'rgb(0, 128, 0)', 'stroke-width': '12px' } };
  const label = { style: fakeStyle({ fill: 'rgb(1, 2, 3)' }), painted: { fill: 'rgb(1, 2, 3)' } };
  const root = { querySelectorAll: selector => (assert.equal(selector, 'svg *'), [ring, label]) };
  const restore = inlineSvgPaint(root, element => fakeStyle(element.painted));
  assert.deepEqual(Object.fromEntries(ring.style.values), { stroke: ['rgb(0, 128, 0)', 'important'], fill: ['none', 'important'], 'stroke-width': ['12px', 'important'] });
  assert.deepEqual(Object.fromEntries(label.style.values), { fill: ['rgb(1, 2, 3)', ''] });
  restore();
  assert.deepEqual(Object.fromEntries(ring.style.values), { stroke: ['red', ''] });
  assert.deepEqual(Object.fromEntries(label.style.values), { fill: ['rgb(1, 2, 3)', ''] });
});

test('a private region the person cannot see, such as one inside a closed fold, is not marked as hidden on the screenshot', () => {
  const box = (top, height = 20) => ({ left: 10, top, width: 100, height, bottom: top + height });
  const region = (rect, { visible = true, nested = false } = {}) => ({ getBoundingClientRect: () => rect, checkVisibility: () => visible, parentElement: { closest: () => (nested ? {} : null) } });
  const shown = region(box(40));
  const folded = region(box(80), { visible: false });
  const inside = region(box(45, 5), { nested: true });
  const below = region(box(900));
  const dialog = region(box(60));
  const legacy = { ...region(box(120)), checkVisibility: undefined };
  const root = { querySelectorAll: () => [shown, folded, inside, below, dialog, legacy] };
  assert.deepEqual(privateRegions(root, { exclude: { contains: element => element === dialog }, height: 800 }), [{ x: 10, y: 40, w: 100, h: 20 }, { x: 10, y: 120, w: 100, h: 20 }]);
});

test('every request is kept without its query string, header or body, and only the last fifty stay', () => {
  clearBuffers();
  rememberRequest({ method: 'post', url: '/api/work?token=secret#x', status: 500, durationMs: 12.6, at: Date.parse('2026-10-11T10:00:00Z') });
  assert.deepEqual(buffers(Date.parse('2026-10-11T10:00:01Z')).requests, [{ method: 'POST', path: '/api/work', status: 500, durationMs: 13, at: '2026-10-11T10:00:00.000Z' }]);
  for (let index = 0; index < requestLimit + 5; index++) rememberRequest({ url: `/api/item/${index}` });
  assert.equal(buffers().requests.length, requestLimit);
  assert.equal(buffers().requests.at(-1).path, `/api/item/${requestLimit + 4}`);
});

test('console entries name objects by type instead of serialising them, and older than ten minutes are left out', () => {
  clearBuffers();
  const now = Date.parse('2026-10-11T10:30:00Z');
  rememberConsole({ level: 'error', args: ['Saving failed', { password: 'p' }, [1, 2], new TypeError('x is undefined')], at: now - 1000 });
  rememberConsole({ level: 'warn', message: 'old', source: 'https://unfold.test/app.js?v=3', line: 9, at: now - 11 * 60_000 });
  const kept = buffers(now).console;
  assert.deepEqual(kept, [{ level: 'error', message: 'Saving failed [Object] [array of 2] TypeError: x is undefined', at: '2026-10-11T10:29:59.000Z' }]);
  assert(!JSON.stringify(kept).includes('password'));
  for (let index = 0; index < consoleLimit + 3; index++) rememberConsole({ level: 'error', message: `e${index}`, at: now });
  assert.equal(buffers(now).console.length, consoleLimit);
});

test('a drag becomes a box, arrow or blur mark only when it is big enough, and text needs words', () => {
  assert.deepEqual(spanned({ x: 50, y: 40 }, { x: 10, y: 20 }), { x: 10, y: 20, w: 40, h: 20 });
  assert.deepEqual(markFrom('box', { x: 0, y: 0 }, { x: 30, y: 20 }), { kind: 'box', x: 0, y: 0, w: 30, h: 20 });
  assert.deepEqual(markFrom('blur', { x: 30, y: 20 }, { x: 0, y: 0 }), { kind: 'blur', x: 0, y: 0, w: 30, h: 20 });
  assert.equal(markFrom('box', { x: 0, y: 0 }, { x: 2, y: 30 }), null, 'a sliver is a slip, not a box');
  assert.deepEqual(markFrom('arrow', { x: 0, y: 0 }, { x: 10, y: 0 }), { kind: 'arrow', x1: 0, y1: 0, x2: 10, y2: 0 });
  assert.equal(markFrom('text', { x: 5, y: 5 }, { x: 5, y: 5 }, '   '), null);
  assert.deepEqual(markFrom('text', { x: 5, y: 5 }, { x: 5, y: 5 }, ' Wrong count '), { kind: 'text', x: 5, y: 5, text: 'Wrong count' });
  const [left, right] = arrowHead(0, 0, 100, 0, 10);
  assert(left[0] < 100 && right[0] < 100 && Math.sign(left[1]) === -Math.sign(right[1]), 'the head points back from the tip on both sides');
});

test('a click picks the smallest thing under the pointer, lifted to the control it sits in, and boxes it with a little room', () => {
  const button = { id: 'button', x: 100, y: 100, w: 80, h: 30 };
  const glyph = { id: 'glyph', x: 104, y: 106, w: 16, h: 16 };
  const card = { id: 'card', x: 0, y: 0, w: 400, h: 300 };
  const targets = [card, button, glyph];
  assert.equal(targetAt(targets, { x: 110, y: 110 }).id, 'glyph');
  assert.equal(targetAt(targets, { x: 110, y: 110 }, target => (target === glyph ? button : undefined)).id, 'button', 'an icon inside a button picks the button');
  assert.equal(targetAt(targets, { x: 300, y: 250 }).id, 'card');
  assert.equal(targetAt(targets, { x: 500, y: 500 }), null);
  assert.deepEqual(markAround('box', { ...button, label: 'button “Approve”' }, { width: 1000, height: 800 }), { kind: 'box', x: 96, y: 96, w: 88, h: 38, element: 'button “Approve”' });
  assert.deepEqual(markAround('blur', { x: 0, y: 2, w: 20, h: 10 }, { width: 22, height: 800 }), { kind: 'blur', x: 0, y: 0, w: 22, h: 16 }, 'the room stops at the screenshot edge');
});

test('the trail keeps the last pages visited without their queries or repeats', () => {
  clearBuffers();
  rememberRoute('#now');
  rememberRoute('#now');
  rememberRoute('#work/12?token=secret');
  rememberRoute('javascript:alert(1)');
  assert.deepEqual(buffers().trail, ['#now', '#work/12']);
  for (let index = 0; index < trailLimit + 3; index++) rememberRoute(`#work/${index}`);
  assert.equal(buffers().trail.length, trailLimit);
});

test('the suggested title is the page name and the first sentence of what happened, and says when it is an idea or confusing', async () => {
  const { suggestTitle } = await import('../public/views/report.js');
  assert.equal(suggestTitle('Now', 'The count says 9. Only 7 rows show.'), 'Now: The count says 9.');
  assert.equal(suggestTitle('Runs', 'Filter by repository.', 'idea'), 'Idea for Runs: Filter by repository.');
  assert.equal(suggestTitle('Runs', 'Is it still going?', 'confusing'), 'Confusing on Runs: Is it still going?');
  assert.equal(suggestTitle('Work', 'Retry does nothing\nsecond line'), 'Work: Retry does nothing');
  assert.equal(suggestTitle('Now', '  '), '');
});

test('a followed report shows where it stands, the proof and the team’s words as text, and a reply box only when filed', async () => {
  const { followRow, stageLooks } = await import('../public/views/report.js');
  const row = followRow({
    id: 'r1', title: 'Approve <does> nothing', status: 'filed', url: 'https://forgejo.test/webgrip/unfold/issues/252', createdAt: '2026-10-12T08:00:00.000Z',
    stage: 'shipped', words: 'Fixed in 0.4.0-rc.75', unread: true, others: 2, joined: false,
    fix: { number: '351', url: 'https://forgejo.test/webgrip/unfold/pulls/351', merged: true }, release: { tag: '0.4.0-rc.75', url: 'https://forgejo.test/r', live: true },
    comments: [{ author: 'ryangr0', text: '<img src=x onerror=alert(1)>', at: '2026-10-12T09:00:00.000Z', mine: false }],
  }, { reply: true });
  assert.match(row, /Fixed in 0\.4\.0-rc\.75/);
  assert.match(row, /Fixed by <a href="https:\/\/forgejo\.test\/webgrip\/unfold\/pulls\/351"[^>]*>webgrip\/unfold#351<\/a>/);
  assert.match(row, /live in <a [^>]*>0\.4\.0-rc\.75<\/a>/);
  assert.match(row, /2 other people hit this too/);
  assert.match(row, /Approve &lt;does&gt; nothing/);
  assert.doesNotMatch(row, /<img/, 'tracker text is escaped');
  assert.match(row, /data-form="report-reply"/);
  assert.match(row, /is-new/);
  assert.doesNotMatch(followRow({ id: 'r2', title: 'Kept', status: 'kept', createdAt: '2026-10-12T08:00:00.000Z', stage: 'kept', words: 'Kept in Unfold', unread: false, others: 0, joined: false, comments: [] }, { reply: true }), /report-reply/, 'nothing to reply on before it is filed');
  const stages = ['filing', 'waiting', 'not-filed', 'kept', 'got-it', 'looking', 'needs-info', 'replied', 'fix-coming', 'fix-merged', 'fixed', 'shipped', 'duplicate', 'not-planned', 'closed'];
  assert.deepEqual(Object.keys(stageLooks).sort(), [...stages].sort(), 'every stage the server names has a look');
});

test('news about a report is announced once per stage', async () => {
  const { noticeFor } = await import('../public/core/report-follow.js');
  const reports = [{ id: 'a', title: 'Approve does nothing', words: 'Fixed in 0.4.0-rc.75', unread: true }, { id: 'b', title: 'Old', words: 'Got it', unread: false }];
  assert.equal(noticeFor(reports, {}), 'Your report “Approve does nothing” is now Fixed in 0.4.0-rc.75. Open Report a problem to see it.');
  assert.equal(noticeFor(reports, { a: 'Fixed in 0.4.0-rc.75' }), '', 'already announced');
  assert.match(noticeFor(reports, { a: 'Fix merged' }), /is now Fixed/, 'a new stage is news again');
});
