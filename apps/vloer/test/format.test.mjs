import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ago, clock, configureFormat, count, date, dateTime, duration, formatLocale, money, moneyExact, moneyHtml, notReported, plural, relative, time, timeHtml } from '../public/core/format.js';

const space = ' ';
const local = new Date(2026, 8, 30, 21, 30, 5);

test('money is US dollars in nl-NL with two decimals, and unknown is never zero', () => {
  assert.equal(money(1234.5), `US$${space}1.234,50`);
  assert.equal(money(0.98), `US$${space}0,98`);
  assert.equal(money(0), `US$${space}0,00`, 'a known zero is zero');
  assert.equal(money(-2), `US$${space}-2,00`);
  assert.equal(money(1.999), `US$${space}2,00`);
  for (const unknown of [null, undefined, Number.NaN, Infinity, '3', {}]) assert.equal(money(unknown), 'Not reported', String(unknown));
  assert.equal(notReported, 'Not reported');
});

test('a positive amount under one cent reads as less than a cent, with the exact value up to five decimals', () => {
  assert.equal(money(0.004), `<${space}US$${space}0,01`);
  assert.equal(money(0.00001), `<${space}US$${space}0,01`);
  assert.equal(money(0.01), `US$${space}0,01`);
  assert.equal(moneyExact(0.00123), `US$${space}0,00123`);
  assert.equal(moneyExact(0.0000049), `US$${space}0,00`);
  assert.equal(moneyExact(2.5), `US$${space}2,50`);
  assert.equal(moneyExact(null), 'Not reported');
  assert.equal(moneyHtml(0.004), `<span class="num money" title="US$${space}0,004">&lt;${space}US$${space}0,01</span>`);
  assert.equal(moneyHtml(2.5), `<span class="num money">US$${space}2,50</span>`);
  assert.equal(moneyHtml(null), '<span class="num money unknown">Not reported</span>');
});

test('counts group thousands and plurals follow the count', () => {
  assert.equal(count(12345), '12.345');
  assert.equal(count(0), '0');
  assert.equal(count(null), '—');
  assert.equal(plural(1, 'attempt'), '1 attempt');
  assert.equal(plural(3, 'attempt'), '3 attempts');
  assert.equal(plural(0, 'Run'), '0 Runs');
  assert.equal(plural(1234, 'Run'), '1.234 Runs');
  assert.equal(plural(2, 'entry', 'entries'), '2 entries');
});

test('dates are numeric nl-NL with a 24-hour clock in the browser time zone', () => {
  assert.equal(dateTime(local), '30-09-2026 21:30');
  assert.equal(dateTime(local.toISOString()), '30-09-2026 21:30');
  assert.equal(dateTime(local.getTime()), '30-09-2026 21:30');
  assert.equal(date(local), '30-09-2026');
  assert.equal(time(local), '21:30');
  assert.equal(time(local, { seconds: true }), '21:30:05');
  assert.equal(dateTime(new Date(2026, 0, 2, 3, 4)), '02-01-2026 03:04');
  for (const missing of [null, undefined, '', 'not a date']) {
    assert.equal(dateTime(missing), '');
    assert.equal(date(missing), '');
    assert.equal(time(missing), '');
  }
});

test('relative time is compact English and turns absolute after seven days', () => {
  const now = local.getTime();
  const at = seconds => new Date(now - seconds * 1000).toISOString();
  assert.equal(relative(at(2), now), 'just now');
  assert.equal(relative(at(-3), now), 'just now');
  assert.equal(relative(at(12), now), '12 s ago');
  assert.equal(relative(at(5 * 60 + 20), now), '5 min ago');
  assert.equal(relative(at(3 * 3600 + 59), now), '3 h ago');
  assert.equal(relative(at(2 * 86400 + 10), now), '2 d ago');
  assert.equal(relative(at(7 * 86400 + 3600), now), '7 d ago');
  assert.equal(relative(new Date(2026, 8, 20, 12, 0), now), '20-09-2026');
  assert.equal(relative(at(-5 * 60), now), 'in 5 min');
  assert.equal(relative(at(-2 * 3600), now), 'in 2 h');
  assert.equal(relative(null, now), '');
});

test('durations read as seconds, minutes, hours and days with a padded minor unit', () => {
  assert.equal(duration(45), '45 s');
  assert.equal(duration(44.6), '45 s');
  assert.equal(duration(720), '12 min');
  assert.equal(duration(3900), '1 h 05 min');
  assert.equal(duration(7200), '2 h 00 min');
  assert.equal(duration(90000), '1 d 01 h');
  assert.equal(duration(-3), '0 s');
  assert.equal(duration(null), '');
  assert.equal(duration(undefined), '');
});

test('a moment renders inside <time> with its ISO value and the absolute date as title', () => {
  const now = local.getTime();
  const iso = new Date(now - 600000).toISOString();
  assert.equal(timeHtml(iso, { now }), `<time class="num" datetime="${iso}" title="${dateTime(iso)}">10 min ago</time>`);
  assert.match(timeHtml(iso, { display: 'absolute' }), />30-09-2026 21:20<\/time>$/);
  assert.match(timeHtml(iso, { display: 'time' }), />21:20<\/time>$/);
  assert.equal(timeHtml(null), '');
});

test('the earlier names clock and ago delegate to the new formatters', () => {
  assert.equal(clock(local), '21:30:05');
  assert.equal(ago(new Date(Date.now() - 3 * 60000).toISOString()), '3 min ago');
});

test('the browser locale preference switches number and date formats and can switch back', () => {
  try {
    configureFormat({ locale: 'browser' });
    assert.equal(formatLocale(), 'browser');
    assert.equal(money(2.5), new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(2.5));
    assert.equal(money(null), 'Not reported');
    assert.notEqual(dateTime(local), '');
  } finally { configureFormat({ locale: 'nl' }); }
  assert.equal(formatLocale(), 'nl');
  assert.equal(money(2.5), `US$${space}2,50`);
});
