import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

globalThis.location ??= new URL('https://unfold.test/#now');
const { buffers, clearBuffers, consoleLimit, rememberConsole, rememberRequest, rememberRoute, requestLimit, trailLimit } = await import('../public/core/report-capture.js');
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

test('a failed request is kept without its query string, header or body, and only the last twenty stay', () => {
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
