import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { effortText, glossary, termTitle, trackerReference } from '../public/core/terms.js';

test('a tracker reference is the ticket key a person knows, never a machine identifier', () => {
  assert.equal(trackerReference({ provider: 'vikunja', externalId: '1505' }), 'VIK-1505');
  assert.equal(trackerReference({ provider: '', externalId: '42' }), 'VIK-42', 'an unnamed provider is Vikunja, as in Ploeg');
  assert.equal(trackerReference({ provider: 'forgejo', externalId: '12' }), 'forgejo-12');
  assert.equal(trackerReference({ provider: 'demo', externalId: 'DEMO-8' }), 'DEMO-8', 'a key that already is one stays as it is');
  assert.equal(trackerReference({ provider: 'manual', externalId: 'de-vloer:ce265d0f9a1b' }), '', 'manual work has no ticket');
  assert.equal(trackerReference({ provider: 'unfold', externalId: 'de-vloer:ce265d0f9a1b' }), '', 'an identifier with a separator is a machine key');
  assert.equal(trackerReference({ provider: 'vikunja', externalId: 'ce265d0f9a1b4c2e' }), '', 'a hash is a machine key');
  assert.equal(trackerReference({ provider: 'vikunja', externalId: '0f3a1b2c-4d5e-6f70-8192-a3b4c5d6e7f8' }), '', 'a UUID is a machine key');
  assert.equal(trackerReference({ provider: 'ploeg', externalId: 'run-53-1' }), '', 'agent-proposed work has no ticket');
  assert.equal(trackerReference({ provider: 'vikunja', externalId: '' }), '');
  assert.equal(trackerReference(null), '');
});

test('agent effort reads in plain words', () => {
  assert.equal(effortText({ runs: 2, attempts: 1 }), '2 agent runs in 1 attempt');
  assert.equal(effortText({ runs: 1, attempts: 3 }), '1 agent run in 3 attempts');
  assert.equal(effortText({ runs: 4 }), '4 agent runs');
  assert.equal(effortText({ runs: 0, attempts: 0 }), '');
  assert.equal(effortText(), '');
});

test('the Round and Shift tooltips say what the glossary says', () => {
  const source = readFileSync(new URL('../../../docs/reference/glossary.md', import.meta.url), 'utf8');
  assert.match(source, /\*\*Round\*\* \| A set of Runs within a Shift that start together\./);
  assert.match(source, /\*\*Shift\*\* \| One Team's engagement with one Work Item/);
  assert.match(glossary.round, /^Round: a set of agent runs within one attempt that start together\./);
  assert.match(glossary.shift, /^Shift: one Team’s whole attempt at a Work Item\./);
  assert.equal(termTitle('shift', 'round'), `${glossary.shift} ${glossary.round}`);
  assert.equal(termTitle('unknown'), '');
});
