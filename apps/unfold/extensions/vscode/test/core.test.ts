import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadCore } from '../src/core.ts';
import { codicon } from '../src/tones.ts';
import * as states from '../../../public/core/states.js';

const core = await loadCore(new URL('../media/core/', import.meta.url));

test('the extension ships the browser vocabulary byte for byte', async () => {
  for (const name of ['states.js', 'format.js', 'reasons.js', 'checkout.js', 'progress.js']) {
    assert.equal(await readFile(new URL(`../media/core/${name}`, import.meta.url), 'utf8'), await readFile(new URL(`../../../public/core/${name}`, import.meta.url), 'utf8'), name);
  }
});

test('states, reasons and money read as they do in the browser', () => {
  assert.equal(core.workItemState('awaiting_review').label, 'Ready for review');
  assert.equal(core.workItemState('awaiting_review').tone, 'review');
  assert.equal(core.workItemState('needs_human').label, 'Needs you');
  assert.equal(core.workItemState('stale').label, 'Stopped retrying');
  assert.equal(core.money(1234.5).replace(/\s/gu, ' '), 'US$ 1.234,50');
  assert.equal(core.money(undefined), 'Not reported');
  const reason = core.listReason({ state: 'needs_human', provider: 'vikunja', latestShift: { closeReason: 'budget exhausted: pool 8, spent 0, reserved 0.43', closedAt: new Date().toISOString() } });
  assert.ok(reason && reason.chip.length > 0 && reason.tone === 'attention');
});

test('every glyph the vocabulary uses has its own codicon', () => {
  const tables = [states.workItemStates, states.runOutcomes, states.verdicts, states.sessionStatuses, states.playStates, states.ciStates, states.humanReviews, states.failureReasons];
  const missing = tables.flatMap(table => Object.values(table).map((meta: { glyph: string }) => meta.glyph)).filter(glyph => codicon(glyph) === 'circle-outline' && glyph !== 'circle');
  assert.deepEqual([...new Set(missing)], []);
});
