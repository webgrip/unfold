import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConfusionRules, insightName, rageWindowMs, uTurnLeaveMs, uTurnWindowMs } from '../public/core/confusion.js';
import { insightCatalogue } from '../src/insight.ts';

function rules() {
  const tracked = [];
  const confusion = createConfusionRules({ track: (name, fields) => tracked.push({ name, ...fields }), where: () => ({ screen: 'now' }) });
  return { confusion, tracked };
}

const click = (at, x = 10, y = 10, extra = {}) => ({ x, y, at, element: 'now.row.needs-you', selecting: false, ...extra });

test('three clicks within a second and 100 px are one rage click, however long the burst goes on', () => {
  const { confusion, tracked } = rules();
  for (const at of [0, 200, 400, 600, 800]) confusion.click(click(at, 10 + at / 20, 10));
  assert.deepEqual(tracked, [{ name: 'ui.rage_click', screen: 'now', props: { element: 'now.row.needs-you' } }]);
  confusion.click(click(5000));
  confusion.click(click(5100));
  confusion.click(click(5200));
  assert.equal(tracked.length, 2, 'a new burst after a pause is reported again');
});

test('slow clicks, clicks far apart and clicks that select text are not rage clicks', () => {
  const { confusion, tracked } = rules();
  for (const at of [0, rageWindowMs / 2 + 1, rageWindowMs + 2]) confusion.click(click(at));
  confusion.click(click(10_000, 0, 0));
  confusion.click(click(10_100, 150, 0));
  confusion.click(click(10_200, 300, 0));
  confusion.click(click(20_000));
  confusion.click(click(20_100, 10, 10, { selecting: true }));
  confusion.click(click(20_200, 10, 10, { selecting: true }));
  assert.deepEqual(tracked, [], 'double- and triple-click selection stays quiet');
});

test('leaving a Work Item within 3 s twice within 2 minutes is one U-turn on that item', () => {
  const { confusion, tracked } = rules();
  confusion.viewed({ screen: 'work', workItemId: 7, at: 0 });
  confusion.viewed({ screen: 'now', at: 1000 });
  confusion.viewed({ screen: 'work', workItemId: 7, at: 30_000 });
  confusion.viewed({ screen: 'now', at: 31_000 });
  assert.deepEqual(tracked, [{ name: 'ui.u_turn', screen: 'work', workItemId: 7 }]);
  confusion.viewed({ screen: 'work', workItemId: 7, at: 40_000 });
  confusion.viewed({ screen: 'now', at: 41_000 });
  assert.equal(tracked.length, 1, 'the pair that made a U-turn is not counted again');
});

test('a detail read for longer, a second quick leave much later or of another item is not a U-turn', () => {
  const { confusion, tracked } = rules();
  confusion.viewed({ screen: 'work', workItemId: 7, at: 0 });
  confusion.viewed({ screen: 'now', at: uTurnLeaveMs + 1 });
  confusion.viewed({ screen: 'work', workItemId: 7, at: 10_000 });
  confusion.viewed({ screen: 'now', at: 11_000 });
  confusion.viewed({ screen: 'work', workItemId: 7, at: 11_000 + uTurnWindowMs + 1 });
  confusion.viewed({ screen: 'now', at: 11_000 + uTurnWindowMs + 1000 });
  confusion.viewed({ screen: 'work', workItemId: 8, at: 200_000 });
  confusion.viewed({ screen: 'work', workItemId: 9, at: 200_500 });
  confusion.viewed({ screen: 'now', at: 201_000 });
  assert.deepEqual(tracked, []);
});

test('an element is named only by its data-insight value, never by its text', () => {
  const element = name => ({ closest: () => (name === undefined ? null : { getAttribute: () => name }) });
  assert.equal(insightName(element('now.row.primary')), 'now.row.primary');
  assert.equal(insightName(element(undefined)), 'unnamed');
  assert.equal(insightName(element('Approve “Fix login”')), 'unnamed', 'a value that could carry screen text is refused');
  assert.equal(insightName(element('x'.repeat(65))), 'unnamed');
  assert.equal(insightName(null), 'unnamed');
});

test('every signal the detector sends is in the server catalogue with the properties it uses', () => {
  assert.deepEqual(insightCatalogue['ui.rage_click'], ['element']);
  assert.deepEqual(insightCatalogue['ui.dead_click'], ['element']);
  assert.deepEqual(insightCatalogue['ui.u_turn'], []);
});
