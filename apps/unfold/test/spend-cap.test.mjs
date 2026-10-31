import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capAmount, capLeft, capResets, spendCapLine, spendCapMarkup, spendCapShort } from '../public/core/spend-cap.js';
import { handOffSpend } from '../src/hand-off-spend.ts';

const cap = { usd: 20, period: 'day', periodEnd: '2026-10-31T00:00:00.000Z', remainingUsd: 12.349, settledUsd: 7.5, heldUsd: 0.151 };
const plain = text => text.replace(/ /g, ' ');

test('the cap and what is left of it round as the MCP confirmation rounds them, never saying more is left than Ploeg reported', () => {
  assert.equal(capAmount(150.499), 150.5);
  assert.equal(capLeft(12.349), 12.34);
  assert.equal(capLeft(0.999), 0.99);
  assert.equal(capLeft(0.3), 0.3);
  assert.equal(capResets('2026-11-01T00:00:00.000Z'), '2026-11-01 00:00 UTC');
  assert.match(handOffSpend('silver', cap, false), /over \$20\.00, and \$12\.34 of that is left until 2026-10-31 00:00 UTC\./);
});

test('a capped Team reads what is left of this period\'s cap and when it resets', () => {
  assert.equal(plain(spendCapLine(cap)), 'US$ 12,34 of US$ 20,00 left this day (UTC), resets 2026-10-31 00:00 UTC');
  assert.equal(plain(spendCapLine({ ...cap, period: 'month', usd: 150.5, remainingUsd: 0 })), 'US$ 0,00 of US$ 150,50 left this month (UTC), resets 2026-10-31 00:00 UTC');
  assert.equal(plain(spendCapShort(cap)), 'US$ 12,34 left');
  const html = plain(spendCapMarkup(cap, { id: 'task-handoff-cap' }));
  assert.match(html, /^<div class="spend-cap" id="task-handoff-cap">/);
  assert.match(html, /role="meter" aria-label="Spent today"[^>]*aria-valuetext="US\$ 7,50 settled of US\$ 20,00 authorized, US\$ 0,15 held"/);
  assert.match(html, /left this day \(UTC\), resets <time datetime="2026-10-31T00:00:00.000Z">2026-10-31 00:00 UTC<\/time>\.<\/p>/);
});

test('without settled spend from Ploeg the line stays and no meter is drawn', () => {
  const html = spendCapMarkup({ usd: 5, period: 'week', periodEnd: '2026-11-02T00:00:00.000Z', remainingUsd: 4 });
  assert.doesNotMatch(html, /meter/);
  assert.match(plain(html), /US\$ 4,00 of US\$ 5,00 left this week \(UTC\)/);
});

test('no cap, an unknown cap and the demo each say so and invent no amount', () => {
  assert.equal(spendCapLine(null), 'No spend limit: Ploeg reports no cap for this Team');
  assert.equal(spendCapShort(null), 'no spend cap');
  for (const unknown of [undefined, {}, { ...cap, usd: '20' }, { ...cap, periodEnd: undefined }]) {
    assert.equal(spendCapLine(unknown), 'Spend limit not known: Ploeg did not report one for this Team');
    assert.equal(spendCapShort(unknown), '');
    assert.match(spendCapMarkup(unknown), /data-cap="unknown"/);
  }
  for (const given of [cap, null, undefined]) {
    assert.equal(spendCapLine(given, { demo: true }), 'Demo · no Run starts and no money is spent');
    assert.equal(spendCapShort(given, { demo: true }), '');
    const html = spendCapMarkup(given, { demo: true });
    assert.match(html, /data-cap="demo"/);
    assert.doesNotMatch(html, /\$|\d|meter/);
  }
  assert.doesNotMatch(spendCapMarkup(null), /\$|\d|meter/);
});
