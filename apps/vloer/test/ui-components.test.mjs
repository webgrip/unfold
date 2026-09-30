import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as ui from '../public/core/ui.js';
import { icons } from '../public/core/icons.js';
import { money } from '../public/core/format.js';

const hostile = '<img src=x onerror="alert(1)">\'&';
const attack = '" onmouseover="alert(1)';
const clean = markup => {
  assert(!markup.includes('<img'), `raw tag in ${markup}`);
  for (const tag of markup.match(/<[a-z][^>]*>/g) || []) {
    const names = tag.replaceAll(/="[^"]*"/g, '').split(/\s+/).slice(1);
    assert(!names.some(name => /^on/i.test(name)), `injected attribute in ${tag}`);
  }
  return markup;
};
const count = (markup, pattern) => (markup.match(pattern) || []).length;

test('every builder escapes hostile text in content and attributes', () => {
  const outputs = {
    button: ui.button({ label: hostile, ariaLabel: attack, title: attack, id: attack, action: attack, data: { team: attack, [attack]: 'x' } }),
    buttonLink: ui.button({ label: hostile, href: `#work/${attack}` }),
    iconButton: ui.iconButton({ icon: 'x', label: attack }),
    badge: ui.badge({ label: hostile, title: attack, tone: attack, glyph: attack }),
    stateBadge: ui.stateBadge(hostile, { reason: hostile }),
    chip: ui.chip({ label: hostile, title: attack, tone: 'attention', action: attack, data: { id: attack } }),
    count: ui.count(hostile, { label: attack }),
    card: ui.card({ id: attack, title: hostile, subtitle: hostile, tone: attack }),
    section: ui.section({ id: attack, title: hostile, description: hostile, count: hostile }),
    pageHeader: ui.pageHeader({ overline: hostile, title: hostile, subtitle: hostile }),
    emptyState: ui.emptyState({ title: hostile, icon: attack, tone: attack }),
    skeleton: ui.skeleton({ rows: attack, variant: attack }),
    callout: ui.callout({ title: hostile, tone: attack, icon: attack }),
    meter: ui.meter({ settled: 1, authorized: 2, label: hostile }),
    meterUnknown: ui.meter({ label: hostile }),
    stat: ui.stat({ label: hostile, value: hostile, detail: hostile, href: `#${attack}` }),
    kbd: ui.kbd([hostile, attack]),
    avatar: ui.avatar({ name: hostile }),
    agent: ui.avatar({ name: attack, kind: 'agent' }),
    tabs: ui.tabs({ id: attack, label: attack, items: [{ id: attack, label: hostile, count: hostile }], action: attack }),
    segmented: ui.segmented({ label: attack, items: [{ id: attack, label: hostile, count: 2 }, { id: 'b', label: hostile, href: `#${attack}` }] }),
    disclosure: ui.disclosure({ summary: hostile, id: attack }),
    dl: ui.dl([[hostile, 'safe'], { term: hostile, value: null }]),
    table: ui.table({ caption: hostile, columns: [{ key: 'a', label: hostile }] }),
    timeAgo: ui.timeAgo(hostile),
    timeAt: ui.timeAt(hostile),
    demoNote: ui.demoNote(hostile),
    toolbar: ui.toolbar(ui.button({ label: hostile })),
    listRow: ui.listRow({ title: hostile, id: attack, href: `#work/${attack}`, data: { id: attack } }),
    listRowButton: ui.listRow({ title: hostile, action: attack }),
  };
  for (const [name, markup] of Object.entries(outputs)) {
    assert.doesNotThrow(() => clean(markup), name);
  }
  assert.match(outputs.button, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&#39;&amp;/);
  assert.match(outputs.button, /aria-label="&quot; onmouseover=&quot;alert\(1\)"/);
  assert.match(outputs.button, /data-team="&quot; onmouseover=&quot;alert\(1\)"/);
  assert.match(outputs.stateBadge, /<span class="state-reason"[^>]*>&lt;img/);
  assert.match(outputs.badge, /data-tone="neutral"/, 'an unknown tone falls back to neutral');
  assert.match(outputs.tabs, /id="&quot; onmouseover=&quot;alert\(1\)-tab-&quot; onmouseover=&quot;alert\(1\)"/);
  assert.match(outputs.timeAgo, /^<span class="subtle">&lt;img/);
});

test('links only render for in-app paths and safe http(s) URLs, and external links do not leak the opener', () => {
  assert(!ui.button({ label: 'Run', href: 'javascript:alert(1)' }).includes('href='));
  assert.match(ui.button({ label: 'Run', href: 'javascript:alert(1)' }), /aria-disabled="true"/);
  assert(!ui.button({ label: 'Run', href: 'https://user:pass@example.org/' }).includes('href='));
  assert(!ui.chip({ label: 'x', href: 'data:text/html,hi' }).includes('<a'));
  assert(!ui.listRow({ title: 'x', href: 'javascript:alert(1)' }).includes('<a'));
  assert(!ui.stat({ label: 'x', value: 1, href: '//evil.example' }).includes('<a'));
  assert(!ui.button({ label: 'x', href: '//evil.example' }).includes('href='));
  const pr = ui.button({ label: 'Open pull request', href: 'https://forge.example/pulls/4', external: true });
  assert.match(pr, /href="https:\/\/forge\.example\/pulls\/4" target="_blank" rel="noopener noreferrer"/);
  assert.match(pr, /opens in a new tab/);
  assert.match(ui.button({ label: 'Open', href: '#work/101' }), /<a class="button secondary" href="#work\/101">/);
  assert.match(ui.chip({ label: 'Tracker', href: 'https://tracker.example/t/1', external: true }), /rel="noopener noreferrer"/);
  assert.equal(count(ui.button({ label: 'x', href: 'https://a.example', external: false }), /target=/g), 0);
});

test('buttons carry their variant, size, state and hints', () => {
  assert.match(ui.button({ label: 'Save' }), /^<button type="button" class="button secondary">/);
  assert.match(ui.button({ label: 'Go', variant: 'primary', size: 'sm', type: 'submit' }), /type="submit" class="button primary sm"/);
  assert.match(ui.button({ label: 'x', variant: 'nonsense' }), /class="button secondary"/);
  assert.match(ui.button({ label: 'x', type: 'nonsense' }), /type="button"/);
  const busy = ui.button({ label: 'Refreshing', busy: true });
  assert.match(busy, /disabled aria-busy="true"/);
  assert.match(busy, /class="spinner" aria-hidden="true"/);
  assert.match(ui.button({ label: 'x', disabled: true }), / disabled>/);
  assert.match(ui.button({ label: 'New session', kbd: 'N' }), /<span class="kbd-group" aria-hidden="true"><kbd class="kbd">N<\/kbd><\/span>/);
  assert.match(ui.button({ label: 'x', action: 'now-retry', data: { workItem: 101, open: true, skip: false, none: null } }), /data-action="now-retry" data-work-item="101" data-open>/);
  const iconOnly = ui.iconButton({ icon: 'copy', label: 'Copy link' });
  assert.match(iconOnly, /class="button ghost icon-only"/);
  assert.match(iconOnly, /aria-label="Copy link" title="Copy link"/);
});

test('tabs are an ARIA tablist with roving tabindex and ids the session view can keep', () => {
  const markup = ui.tabs({ id: 'evidence', label: 'Session evidence', action: 'tab', items: [{ id: 'stream', label: 'Stream' }, { id: 'diff', label: 'Changes', count: 2, selected: true }] });
  assert.match(markup, /^<div class="tabs" role="tablist" aria-label="Session evidence">/);
  assert.equal(count(markup, /role="tab"/g), 2);
  assert.match(markup, /id="evidence-tab-stream" aria-controls="evidence-panel-stream" aria-selected="false" tabindex="-1" data-action="tab" data-id="stream"/);
  assert.match(markup, /class="tab selected" id="evidence-tab-diff" aria-controls="evidence-panel-diff" aria-selected="true" tabindex="0"/);
  assert.match(markup, /Changes<span class="count">2<\/span>/);
  const none = ui.tabs({ id: 't', label: 'x', items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] });
  assert.equal(count(none, /aria-selected="true"/g), 1, 'the first tab is selected when none is');
  assert.equal(count(none, /tabindex="0"/g), 1);
});

test('segmented controls are labelled groups of pressed buttons or current links', () => {
  const buttons = ui.segmented({ label: 'Lane', action: 'lane', items: [{ id: 'needs_human', label: 'Needs you', count: 3, selected: true }, { id: 'all', label: 'All' }] });
  assert.match(buttons, /^<div class="segmented" role="group" aria-label="Lane">/);
  assert.match(buttons, /aria-pressed="true" data-action="lane" data-id="needs_human">Needs you<span class="count">3<\/span>/);
  assert.match(buttons, /aria-pressed="false" data-action="lane" data-id="all">All<\/button>/);
  const links = ui.segmented({ label: 'Window', items: [{ id: '24h', label: '24 h', href: '#insights?window=24h', selected: true }, { id: '7d', label: '7 d', href: '#insights?window=7d' }] });
  assert.match(links, /<a class="segment" href="#insights\?window=24h" aria-current="true" data-id="24h">/);
  assert.match(links, /<a class="segment" href="#insights\?window=7d" data-id="7d">/);
  assert(!links.includes('aria-pressed'));
});

test('the meter draws settled and reserved spend from SVG attributes with an ARIA meter', () => {
  const markup = ui.meter({ settled: 1.2, reserved: 0.5, authorized: 3 });
  assert.match(markup, /role="meter" aria-label="Spend" aria-valuemin="0" aria-valuemax="3" aria-valuenow="1.2"/);
  assert(markup.includes(`aria-valuetext="${money(1.2)} settled of ${money(3)} authorized, ${money(0.5)} reserved"`));
  assert.match(markup, /<rect class="meter-track" width="100" height="6"\/>/);
  assert.match(markup, /<rect class="meter-settled" width="40" height="6"\/>/);
  assert.match(markup, /<rect class="meter-reserved" x="40" width="16.67" height="6"\/>/);
  assert.match(markup, /<span class="meter-end">40%<\/span>/);
  assert(!markup.includes('data-level'));
  assert(!markup.includes('style='), 'geometry never uses inline styles');
});

test('the meter warns near the budget, reports overspend and clamps its geometry', () => {
  assert.match(ui.meter({ settled: 2.4, authorized: 3 }), /data-level="warn"/);
  assert.match(ui.meter({ settled: 0.4, reserved: 2.2, authorized: 3 }), /data-level="warn"/, 'reservations count towards the warning');
  const over = ui.meter({ settled: 3.4, reserved: 1, authorized: 3 });
  assert.match(over, /data-level="over"/);
  assert.match(over, /class="meter-settled" width="100"/);
  assert(!over.includes('meter-reserved'), 'no room is left for reservations');
  assert(over.includes(`${money(0.4)} over`));
  assert.match(over, /aria-valuenow="3"/, 'aria-valuenow stays within the range');
  assert(over.includes('over budget"'));
  const clamped = ui.meter({ settled: 1, reserved: 5, authorized: 2 });
  assert.match(clamped, /class="meter-reserved" x="50" width="50"/);
  const zero = ui.meter({ settled: 0, authorized: 2.5 });
  assert(!zero.includes('meter-settled'));
  assert.match(zero, /0%/);
  const negative = ui.meter({ settled: -4, authorized: 2 });
  assert.match(negative, /aria-valuenow="0"/);
});

test('unknown or demo spend is never drawn or written as zero', () => {
  for (const settled of [null, undefined, Number.NaN, '1.2']) {
    const markup = ui.meter({ settled, reserved: 1, authorized: 3 });
    assert.match(markup, /data-unknown/, String(settled));
    assert.match(markup, /Not reported/);
    assert(!markup.includes('role="meter"'));
    assert(!markup.includes('meter-settled'));
    assert(!markup.includes(money(0)), 'unknown spend does not print a zero amount');
  }
  const noBudget = ui.meter({ settled: 1.2, authorized: null });
  assert.match(noBudget, /data-unknown="budget"/);
  assert.match(noBudget, /no budget reported/);
  assert(!noBudget.includes('role="meter"'));
  const demo = ui.meter({ settled: 1.2, authorized: 2.5, demo: true });
  assert.match(demo, /data-demo/);
  assert.match(demo, /Demo · no model calls/);
  assert(!demo.includes('meter-settled'));
  assert(!demo.includes(money(1.2)), 'a demo meter shows no spend');
});

test('state badges read the shared vocabulary', () => {
  const cases = [
    ['proposed', 'Proposed', 'neutral'], ['ingested', 'Received', 'neutral'], ['queued', 'Queued', 'neutral'],
    ['leased', 'Running', 'live'], ['awaiting_review', 'Ready for review', 'review'], ['needs_human', 'Needs you', 'attention'],
    ['stale', 'Stopped retrying', 'severe'], ['withdrawn', 'Withdrawn', 'neutral'], ['done', 'Done', 'success'],
  ];
  for (const [key, label, tone] of cases) {
    const markup = ui.stateBadge(key);
    assert.match(markup, new RegExp(`^<span class="badge" data-tone="${tone}" data-state="${key}">.*${label}</span>$`), key);
    assert(!markup.includes('Merged'));
  }
  assert.match(ui.stateBadge('leased'), /<span class="live-dot" aria-hidden="true"><\/span>Running/);
  assert(!ui.stateBadge('needs_human').includes('live-dot'));
  assert.match(ui.stateBadge('workItem:done'), />Done<\/span>$/, 'a kind prefix is accepted');
  assert.match(ui.stateBadge('some_new_state'), /data-tone="neutral" data-state="some_new_state">.*Some new state<\/span>$/);
  assert.match(ui.stateBadge({ key: 'running', label: 'Working', tone: 'live', live: true }), /data-tone="live" data-state="running"><span class="live-dot"/);
  const reason = ui.stateBadge('needs_human', { reason: 'Budget ran out' });
  assert.match(reason, /^<span class="state-badge"><span class="badge" data-tone="attention"[^>]*>.*Needs you<\/span><span class="state-reason" data-tone="attention">Budget ran out<\/span><\/span>$/);
  assert.match(ui.stateBadge('needs_human', { reason: 'Not routed', reasonTone: 'severe' }), /class="state-reason" data-tone="severe"/);
});

test('small builders keep unknown values honest and structure predictable', () => {
  assert.equal(ui.count(null), '');
  assert.equal(ui.count(undefined), '');
  assert.equal(ui.count(0), '<span class="count">0</span>');
  assert.match(ui.count(3, { tone: 'attention', label: '3 waiting on you' }), /data-tone="attention" aria-label="3 waiting on you">3</);
  assert.match(ui.dl([['Pull request', null]]), /<dd><span class="subtle">—<\/span><\/dd>/);
  assert.match(ui.dl([['Spend', '<span class="num">x</span>']], { rows: true }), /^<dl class="facts rows"><div class="fact"><dt>Spend<\/dt><dd><span class="num">x<\/span><\/dd><\/div><\/dl>$/);
  const empty = ui.table({ caption: 'Runs', columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'Spend', numeric: true }], rows: [] });
  assert.match(empty, /<td class="table-empty" colspan="2">Nothing to show\.<\/td>/);
  assert.match(empty, /role="region" tabindex="0" aria-label="Runs"/);
  assert.match(empty, /<th scope="col" class="num">Spend<\/th>/);
  const filled = ui.table({ caption: 'Runs', columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'Spend', numeric: true }], rows: [{ a: '<b>1</b>', b: '2' }] });
  assert.match(filled, /<tr><td><b>1<\/b><\/td><td class="num">2<\/td><\/tr>/);
  assert.match(ui.avatar({ name: 'Ryan Grippeling' }), /^<span class="avatar" data-tone="[a-z]+" role="img" aria-label="Ryan Grippeling" title="Ryan Grippeling">RG<\/span>$/);
  assert.match(ui.avatar({ name: 'reviewer', kind: 'agent' }), /data-kind="agent"[^>]*aria-label="reviewer \(agent\)"[^>]*><svg class="icon"/);
  assert.equal(ui.avatar({ name: 'Marit Vos' }), ui.avatar({ name: 'Marit Vos' }), 'the tone is stable per name');
  assert.match(ui.kbd('g n'), /^<span class="kbd-group"><kbd class="kbd">g<\/kbd><kbd class="kbd">n<\/kbd><\/span>$/);
  assert.match(ui.pageHeader({ title: 'Work' }), /<h1 class="page-title" tabindex="-1">Work<\/h1>/);
  assert.equal(count(ui.pageHeader({ title: 'Work', subtitle: 'x', overline: 'y', actions: 'a', meta: 'm' }), /<h1/g), 1);
  assert.match(ui.section({ id: 'waiting', title: 'Waiting', count: 3 }), /aria-labelledby="waiting-title"><header class="section-header"><div class="section-heading"><h2 class="section-title" id="waiting-title">Waiting<span class="count">3<\/span><\/h2>/);
  assert.match(ui.card({ title: 'Shift', level: 3, flush: true }), /^<section class="card flush"><header class="card-header"><div class="card-heading"><h3 class="card-title">Shift<\/h3>/);
  assert.match(ui.card({ body: 'x' }), /^<div class="card"><div class="card-body">x<\/div><\/div>$/);
  assert.match(ui.callout({ tone: 'attention', title: 'Budget ran out' }), /data-tone="attention"><span class="callout-icon" aria-hidden="true">/);
  assert(!ui.callout({ icon: null, body: 'x' }).includes('callout-icon'));
  assert.match(ui.skeleton({ rows: 99, variant: 'text' }), /aria-hidden="true"/);
  assert.equal(count(ui.skeleton({ rows: 99, variant: 'text' }), /skeleton text/g), 20);
  assert.match(ui.skeleton(), /<span class="sr-only">Loading…<\/span>/);
  assert.match(ui.disclosure({ summary: 'Details', body: '<p>x</p>', open: true }), /^<details class="disclosure" open><summary><span class="disclosure-summary">Details<\/span>/);
  assert.match(ui.listRow({ title: 'Row', href: '#work/1', selected: true, tone: 'attention', data: { unread: true } }), /^<a class="list-row" href="#work\/1" aria-current="true" data-tone="attention" data-unread>/);
  assert.match(ui.listRow({ title: 'Row', action: 'open', data: { id: 'x' } }), /^<button type="button" class="list-row" data-action="open" data-id="x">/);
  assert.match(ui.listRow({ title: 'Row' }), /^<div class="list-row">/);
  assert.match(ui.demoNote(), /<span class="demo-note-tag">Demo<\/span><span>Illustrative data\. No model calls, no spend\.<\/span>/);
  assert.equal(ui.toolbar(['a', 'b']), '<div class="toolbar">ab</div>');
});

test('times render inside <time> with the ISO value and an absolute title', () => {
  assert.equal(ui.timeAgo(null), '');
  assert.equal(ui.timeAt(''), '');
  const at = ui.timeAt('2026-09-30T19:30:00Z');
  assert.match(at, /^<time class="num" datetime="2026-09-30T19:30:00\.000Z" title="[^"]+">[^<]+<\/time>$/);
  assert.match(at, /^<time[^>]*>\d\d-\d\d-2026 \d\d:\d\d<\/time>$/);
  const ago = ui.timeAgo(new Date(Date.now() - 5 * 60000).toISOString());
  assert.match(ago, /^<time class="num" datetime="[^"]+" title="\d\d-\d\d-\d{4} \d\d:\d\d">[^<]+<\/time>$/);
});

test('icons keep every existing name and add the redesign glyphs', () => {
  const existing = ['grid', 'layers', 'link', 'activity', 'plus', 'play', 'pause', 'stop', 'check', 'x', 'code', 'terminal', 'arrow', 'back', 'chevron', 'download', 'branch', 'shield', 'search', 'external', 'logout', 'circle', 'folder', 'send', 'clock', 'info'];
  const added = ['inbox', 'work', 'proposed', 'runs', 'insights', 'tasks', 'sessions', 'settings', 'sun', 'moon', 'monitor', 'command', 'keyboard', 'bell', 'filter', 'copy', 'refresh', 'more', 'menu', 'chevron-down', 'chevron-up', 'chevron-left', 'alert', 'check-circle', 'x-circle', 'pause-circle', 'pull-request', 'user', 'bot', 'coins', 'calendar', 'eye', 'lock', 'zap', 'arrow-up-right', 'spark', 'list', 'panel', 'hash', 'globe', 'tag'];
  for (const name of [...existing, ...added]) assert(icons[name], `missing icon ${name}`);
  for (const [name, paths] of Object.entries(icons)) assert(!/<script|on[a-z]+=|href=|<use/i.test(paths), `${name} carries only path data`);
});
