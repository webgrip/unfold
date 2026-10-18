import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access } from 'node:fs/promises';
import { meaningLedger, meaningLegend, unexplained } from '../public/live/meaning.js';
import { scenarios } from '../public/live/fixtures.js';
import { liveModel } from '../public/live/model.js';
import { flightPath } from '../public/live/flight-path.js';
import { foldStrip } from '../public/live/fold-strip.js';
import { shiftDial } from '../public/live/dial.js';
import { moveList, traceLanes } from '../public/live/trace.js';
import { instruments } from '../public/live/instruments.js';
import { answers } from '../public/live/answers.js';
import { runHealthBadge, runHealthMarkup } from '../public/ploeg.js';
import { healthEntry } from '../public/live/stories/shared.js';

const components = ['flight', 'folds', 'dial', 'trace', 'instruments', 'answers', 'containment', 'health'];
const containmentUrl = new URL('../public/live/containment.js', import.meta.url);
const containment = await access(containmentUrl).then(() => import(containmentUrl.href), () => null);

function renders(model) {
  const out = {
    flight: [flightPath(model)],
    folds: [foldStrip(model), foldStrip(model, { size: 'mini' })],
    dial: [shiftDial(model)],
    trace: [traceLanes(model), traceLanes(model, { scope: 'run' }), moveList(model), moveList(model, { selectedCall: model.moves.at(-1)?.calls.at(-1)?.id ?? null })],
    instruments: ['tiles', 'strip', 'list'].map(layout => instruments(model, { layout })),
    answers: [answers(model), answers(model, { layout: 'chips' })],
    containment: [],
    health: [healthEntry(model), healthEntry(model, { staleMinutes: 2 })].filter(Boolean).flatMap(entry => [runHealthBadge({ state: 'running' }, entry, model.now), runHealthMarkup({ id: model.running.id, state: 'running' }, entry, { now: model.now })]),
  };
  if (containment) for (const draw of Object.values(containment)) if (typeof draw === 'function') { try { const html = draw(model); if (typeof html === 'string' && /lv-contain/.test(html)) out.containment.push(html); } catch { } }
  return out;
}

test('every mark a live component draws in every scenario has an entry in the meaning ledger', () => {
  const names = Object.keys(scenarios);
  assert.ok(names.length > 0);
  for (const name of names) {
    const output = renders(liveModel(scenarios[name].input()));
    for (const component of components) {
      for (const html of output[component]) assert.deepEqual(unexplained(html, component), [], `${name} ${component}: these classes mean nothing in the ledger`);
    }
  }
});

test('every ledger entry says what it looks like, what it means, where it comes from and how sure that source is', () => {
  const ids = new Set();
  for (const entry of meaningLedger) {
    assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.classes), entry.id);
    assert.ok(!ids.has(entry.id), `duplicate id ${entry.id}`);
    ids.add(entry.id);
    assert.ok(components.includes(entry.component), entry.id);
    assert.ok(entry.classes.length > 0 && entry.classes.every(name => /^(lv-|is-|work-run-health|work-run-judge)[\w-]*\*?$/.test(name)), entry.id);
    for (const field of ['looksLike', 'means', 'source']) assert.ok(typeof entry[field] === 'string' && entry[field].trim().length > 3, `${entry.id}.${field}`);
    assert.ok(['real', 'derived', 'proposed'].includes(entry.status), entry.id);
    if (entry.status === 'proposed') assert.match(entry.source, /^Proposed: Ploeg would have to (emit|report) \S/, `${entry.id}: a proposed source names what Ploeg would have to report`);
    else assert.doesNotMatch(entry.source, /^Proposed/, entry.id);
  }
  assert.ok(Object.isFrozen(meaningLedger));
});

test('unexplained finds an unknown mark and ignores grow, tone and screen-reader classes', () => {
  assert.deepEqual(unexplained('<li class="lv-fp-hop lv-g7 lv-tone-danger sr-only is-machine lv-fp-mystery"></li>', 'flight'), ['lv-fp-mystery']);
  assert.deepEqual(unexplained('<li class="lv-fp-hop"></li>', 'dial'), ['lv-fp-hop']);
  assert.deepEqual(unexplained('<p class="lv-fp-wire is-high">', 'flight'), []);
});

test('the legend lists every entry of a component with its status in words and no inline style', () => {
  for (const component of components) {
    const html = meaningLegend(component);
    const entries = meaningLedger.filter(entry => entry.component === component);
    assert.equal((html.match(/class="lv-legend-row"/g) ?? []).length, entries.length, component);
    for (const entry of entries) assert.ok(html.includes(`data-meaning="${entry.id}"`) && html.includes(`Status: ${entry.status}`), entry.id);
    assert.match(html, /<dl class="lv-legend"/);
    assert.doesNotMatch(html, /\sstyle=/);
  }
  assert.equal((meaningLegend().match(/class="lv-legend-row"/g) ?? []).length, meaningLedger.length);
});
