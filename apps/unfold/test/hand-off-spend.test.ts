import test from 'node:test';
import assert from 'node:assert/strict';
import { handOffSpend, teamSpendCap } from '../src/hand-off-spend.ts';

const reported = { usd: 20, period: 'day', periodStart: '2026-10-30T00:00:00Z', periodEnd: '2026-10-31T00:00:00Z', settledUsd: 7.5, heldUsd: 0.151, remainingUsd: 12.349 };

test('teamSpendCap reads Ploeg\'s spendCap, keeps null as no cap and treats an unknown shape as not reported', () => {
  assert.deepEqual(teamSpendCap(reported), { usd: 20, period: 'day', periodEnd: '2026-10-31T00:00:00.000Z', remainingUsd: 12.349, settledUsd: 7.5, heldUsd: 0.151 });
  assert.deepEqual(teamSpendCap({ ...reported, settledUsd: undefined, heldUsd: -1 }), { usd: 20, period: 'day', periodEnd: '2026-10-31T00:00:00.000Z', remainingUsd: 12.349 });
  assert.equal(teamSpendCap(null), null);
  assert.equal(teamSpendCap(undefined), undefined);
  for (const broken of [{ ...reported, usd: -1 }, { ...reported, usd: 0 }, { ...reported, usd: '20' }, { ...reported, period: 'year' }, { ...reported, periodEnd: 'soon' }, { ...reported, remainingUsd: Number.NaN }, { ...reported, remainingUsd: undefined }, [reported], 'cap']) {
    assert.equal(teamSpendCap(broken), undefined, JSON.stringify(broken));
  }
});

test('handOffSpend states the cap Ploeg enforces and what is left of it, never rounding what is left up', () => {
  assert.equal(handOffSpend('silver', teamSpendCap(reported), false),
    'Its Runs spend from Team silver\'s budget: Ploeg starts no Run for Team silver that would take its spend this day (UTC) over $20.00, and $12.34 of that is left until 2026-10-31 00:00 UTC. What this task alone may spend is set by the Team\'s plan and is not known until Ploeg picks it up.');
  assert.match(handOffSpend('silver', { usd: 150.5, period: 'month', periodEnd: '2026-11-01T00:00:00.000Z', remainingUsd: 0.999 }, false), /this month \(UTC\) over \$150\.50, and \$0\.99 of that is left until 2026-11-01 00:00 UTC\./);
  assert.match(handOffSpend('silver', { usd: 5, period: 'week', periodEnd: '2026-11-02T00:00:00.000Z', remainingUsd: 0.3 }, false), /this week \(UTC\) over \$5\.00, and \$0\.30 of that is left/);
  assert.match(handOffSpend('silver', { usd: 5, period: 'day', periodEnd: '2026-10-31T00:00:00.000Z', remainingUsd: 0 }, false), /and \$0\.00 of that is left/);
});

test('handOffSpend says plainly when the limit is not known, and invents no amount', () => {
  const unknown = handOffSpend('silver', undefined, false);
  assert.equal(unknown, 'Its Runs spend from Team silver\'s budget. The spend limit for Team silver is not known until Ploeg picks this up.');
  const uncapped = handOffSpend('silver', null, false);
  assert.equal(uncapped, 'Its Runs spend from Team silver\'s budget, and Ploeg reports no spend cap for Team silver. What this task may spend is not known until Ploeg picks it up.');
  for (const text of [unknown, uncapped]) assert.doesNotMatch(text, /\$|\d/);
});

test('handOffSpend in the demo says so and that no money is spent, whatever cap it is given', () => {
  for (const cap of [teamSpendCap(reported), null, undefined]) {
    const text = handOffSpend('silver', cap, true);
    assert.equal(text, 'This is the illustrative demo: no Run starts and no money is spent.');
    assert.doesNotMatch(text, /\$|\d/);
  }
});
