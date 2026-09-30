import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fuzzyMatch, highlight, workItemIndex, recentFromHash, parseRecent, rememberRecent, paletteEntries, searchPalette, resultsMarkup } from '../public/views/palette.js';

const source = {
  ploegDetail: { item: { id: '105', title: 'Round half-cent totals consistently', team: 'delivery', state: 'awaiting_review', externalId: 'DEMO-5' } },
  ploeg: { lanes: { needs_human: { items: [{ id: '108', title: 'Show VAT per line on the order confirmation', team: 'delivery', state: 'needs_human', externalId: 'DEMO-8' }] }, all: { items: [{ id: '105', title: 'An older title', state: 'queued' }] } } },
  now: { data: { waiting: [{ id: '109', title: 'Reject negative quantities in the cart API', team: 'delivery', state: 'needs_human' }], running: [{ id: '51', workItemId: '102', workItemTitle: 'Prepare a regression investigation', team: 'delivery', state: 'running' }], recent: [] } },
  ploegRuns: { runs: [{ id: '40', workItemId: '103', workItemTitle: 'Document the order verification workflow', externalRef: 'DEMO-3' }] },
  ploegFeed: { events: [{ workItemId: '104', workItemTitle: '', team: 'research' }, { workItemId: 'abc', workItemTitle: 'Not a Work Item id' }, { workItemId: '0' }] },
};
const index = workItemIndex(source, [{ waiting: [{ id: '110', title: 'Summarise payment-provider fees', team: 'research', state: 'needs_human' }] }]);

const context = (extra = {}) => ({
  counts: { waiting: 9, review: 1, needsYou: 6, proposed: 2, running: 1, sessions: 0 },
  items: index,
  sessions: [{ id: 'a1b2', title: 'Fix order total rounding', status: 'completed' }],
  recent: [{ kind: 'work', id: '108', title: '', at: '2026-09-30T10:00:00Z' }, { kind: 'work', id: '105', title: 'Round half-cent totals consistently', at: '2026-09-30T09:00:00Z' }],
  current: { kind: 'work', id: '105' },
  sessionsShown: true, canCreate: true, demo: true, view: 'now', theme: 'system', dark: false, density: 'comfortable', paused: false, singleKeys: true, mac: false, notifications: 'off',
  ...extra,
});
const labels = group => group.results.map(result => result.entry.label);

test('fuzzy matching prefers word starts, ignores case and accents, and needs every word of the query', () => {
  assert.deepEqual(fuzzyMatch('ins', 'Insights').ranges, [[0, 3]]);
  assert(fuzzyMatch('run', 'Runs').score > fuzzyMatch('run', 'Rerun the tests').score, 'a word start beats the middle of a word');
  assert.deepEqual(fuzzyMatch('cafe', 'Café opening').ranges, [[0, 4]]);
  assert.deepEqual(fuzzyMatch('line vat', 'Show VAT per line').ranges, [[5, 8], [13, 17]]);
  assert.equal(fuzzyMatch('vat total', 'Show VAT per line'), null);
  assert.deepEqual(fuzzyMatch('nh', 'Needs human').ranges, [[0, 1], [6, 7]]);
  assert.deepEqual(fuzzyMatch('prefs', 'Preferences').ranges, [[0, 4], [10, 11]]);
  assert.equal(fuzzyMatch('vat', 'Document the order verification workflow'), null, 'scattered letters inside words are noise');
  assert.equal(fuzzyMatch('105', '#106 · run-53-1'), null, 'numbers match only as written');
  assert.deepEqual(fuzzyMatch('105', '#105 · DEMO-5').ranges, [[1, 4]]);
  assert.equal(fuzzyMatch('x', ''), null);
});

test('highlighting escapes every character and marks only the matched ranges', () => {
  assert.equal(highlight('<img src=x onerror=alert(1)> VAT', [[29, 32]]), '&lt;img src=x onerror=alert(1)&gt; <mark class="palette-mark">VAT</mark>');
  assert.equal(highlight('a & b "c"', []), 'a &amp; b &quot;c&quot;');
  assert.equal(highlight('abc', [[1, 2], [0, 1]]), '<mark class="palette-mark">ab</mark>c');
  assert.equal(highlight('abc', [[2, 9]]), 'abc', 'a range past the end is ignored');
});

test('the Work Item index merges everything the tab loaded, one entry per id, and keeps the first known fields', () => {
  assert.deepEqual(index.map(item => item.id), ['105', '108', '109', '110', '102', '103', '104']);
  assert.deepEqual(index[0], { id: '105', title: 'Round half-cent totals consistently', team: 'delivery', state: 'awaiting_review', externalId: 'DEMO-5' });
  assert.equal(index.find(item => item.id === '102').state, '', 'a Run row does not say what state its Work Item is in');
  assert.equal(index.find(item => item.id === '103').externalId, 'DEMO-3');
  assert.deepEqual(workItemIndex({}), []);
  assert.deepEqual(workItemIndex({ now: { data: { waiting: 'broken', running: null } } }), []);
});

test('recent Work Items and sessions come from the hash, move to the front and keep at most eight', () => {
  assert.deepEqual(recentFromHash('#work/105'), { kind: 'work', id: '105' });
  assert.deepEqual(recentFromHash('#work/105?lane=queued'), { kind: 'work', id: '105' });
  assert.deepEqual(recentFromHash('#session/0f1e-22'), { kind: 'session', id: '0f1e-22' });
  for (const hash of ['#work', '#work/0', '#work/abc', '#now', '#session/<b>', '']) assert.equal(recentFromHash(hash), null, hash);
  let list = rememberRecent([], { kind: 'work', id: '105' }, '2026-09-30T10:00:00Z');
  list = rememberRecent(list, { kind: 'work', id: '108', title: 'Show VAT' }, '2026-09-30T10:01:00Z');
  list = rememberRecent(list, { kind: 'work', id: '105', title: 'Round' }, '2026-09-30T10:02:00Z');
  list = rememberRecent(list, { kind: 'work', id: '105' }, '2026-09-30T10:03:00Z');
  assert.deepEqual(list, [{ kind: 'work', id: '105', title: 'Round', at: '2026-09-30T10:03:00Z' }, { kind: 'work', id: '108', title: 'Show VAT', at: '2026-09-30T10:01:00Z' }]);
  for (let id = 1; id <= 12; id++) list = rememberRecent(list, { kind: 'work', id: String(id) }, '2026-09-30T11:00:00Z');
  assert.equal(list.length, 8);
  assert.equal(list[0].id, '12');
  assert.deepEqual(parseRecent(JSON.stringify(list)), list);
  assert.deepEqual(parseRecent('not json'), []);
  assert.deepEqual(parseRecent('{"kind":"work"}'), []);
  assert.deepEqual(parseRecent(JSON.stringify([{ kind: 'work', id: '1', title: 'ok', at: '2026-09-30T10:00:00Z' }, { kind: 'work', id: 'x', title: '', at: '2026-09-30T10:00:00Z' }, { kind: 'other', id: '1', title: '', at: '2026-09-30T10:00:00Z' }, { kind: 'work', id: '2', title: 'no date', at: 'never' }])).map(entry => entry.id), ['1']);
});

test('before anything is typed the palette offers recent items, destinations and commands, each with its shortcut', () => {
  const groups = searchPalette('', paletteEntries(context()));
  assert.deepEqual(groups.map(group => group.id), ['recent', 'go', 'commands']);
  assert.deepEqual(labels(groups[0]), ['Show VAT per line on the order confirmation'], 'the page on screen is not offered again and titles come from loaded data');
  assert.deepEqual(labels(groups[1]), ['Now', 'Work', 'Proposed', 'Runs', 'Activity', 'Insights']);
  assert.deepEqual(labels(groups[2]), ['Switch to dark theme', 'Pause live updates', 'Refresh this page', 'New session', 'Show keyboard shortcuts', 'Open preferences']);
  const now = groups[1].results[0].entry;
  assert.deepEqual([now.hash, now.keys, now.count], ['now', ['g', 'n'], { value: 9, tone: 'attention', label: '9 waiting on you' }]);
  const all = paletteEntries(context());
  assert(!all.some(entry => entry.label === 'Sign out'), 'the demo has no sign-out');
  assert(paletteEntries(context({ demo: false })).some(entry => entry.label === 'Sign out' && entry.action === 'logout'));
  assert(!paletteEntries(context({ canCreate: false })).some(entry => entry.id === 'new-session'), 'viewers cannot start sessions');
  assert(!paletteEntries(context({ sessionsShown: false })).some(entry => entry.group === 'sessions' || entry.id === 'go-sessions'));
  assert.equal(all.find(entry => entry.id === 'theme').value, 'dark');
  assert.equal(paletteEntries(context({ dark: true, theme: 'dark' })).find(entry => entry.id === 'theme').label, 'Switch to light theme');
  assert(paletteEntries(context({ theme: 'dark' })).some(entry => entry.label === 'Follow the system theme'));
  assert.equal(paletteEntries(context({ paused: true })).find(entry => entry.id === 'live').label, 'Resume live updates');
});

test('typing searches destinations, commands, loaded Work Items and sessions, best group first', () => {
  const entries = paletteEntries(context());
  const blocked = searchPalette('blocked', entries);
  assert.equal(blocked[0].id, 'go');
  assert.deepEqual([blocked[0].results[0].entry.parent, blocked[0].results[0].entry.label, blocked[0].results[0].entry.hash], ['Work', 'Needs you', 'work?lane=needs_human']);
  const vat = searchPalette('vat', entries);
  assert.equal(vat[0].id, 'items');
  assert.deepEqual(labels(vat[0]), ['Show VAT per line on the order confirmation']);
  assert.deepEqual(vat[0].results[0].match.label, [[5, 8]]);
  assert.equal(searchPalette('dark', entries)[0].results[0].entry.label, 'Switch to dark theme');
  assert.equal(searchPalette('rounding', entries).find(group => group.id === 'sessions').results[0].entry.hash, 'session/a1b2');
  assert.deepEqual(searchPalette('zzqxv', entries), []);
});

test('a Work Item number always opens that Work Item first, by title when it is loaded', () => {
  const entries = paletteEntries(context());
  const unknown = searchPalette('999', entries);
  assert.equal(unknown[0].id, 'items');
  assert.deepEqual([unknown[0].results[0].entry.label, unknown[0].results[0].entry.hash], ['Open Work Item #999', 'work/999']);
  const known = searchPalette('#108', entries);
  assert.deepEqual([known[0].results[0].entry.label, known[0].results[0].entry.hash], ['Show VAT per line on the order confirmation', 'work/108']);
  assert.equal(searchPalette('0', entries).some(group => group.results.some(result => result.entry.label.startsWith('Open Work Item'))), false, 'zero is not a Work Item id');
});

test('the Work Item search shows its loading, failure and partial states', () => {
  const entries = paletteEntries(context());
  const loading = searchPalette('qqq', entries, { loading: true });
  assert.deepEqual(loading.map(group => [group.id, group.loading, group.note, group.results.length]), [['items', true, 'Loading…', 0]]);
  assert.match(resultsMarkup(loading), /aria-busy="true"/);
  const failed = searchPalette('qqq', entries, { error: true });
  assert.deepEqual(failed.map(group => group.id), ['items']);
  assert.deepEqual([failed[0].results[0].entry.label, failed[0].results[0].entry.run, failed[0].results[0].entry.keepOpen], ['Work Items could not be loaded', 'retry', true]);
  assert.equal(searchPalette('vat', entries, { partial: true })[0].note, 'Some lists could not be read');
});

test('the listbox markup is one option per result with sequential ids, one selected row, escaped text and no inline style', () => {
  const hostile = paletteEntries(context({ items: [{ id: '7', title: '<img src=x onerror=alert(1)>', team: 'x"y', state: 'needs_human', externalId: '' }] }));
  const groups = searchPalette('img', hostile);
  const markup = resultsMarkup(groups, 0);
  assert.doesNotMatch(markup, /<img/);
  assert.match(markup, /&lt;<mark class="palette-mark">img<\/mark> src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(markup, /style=/);
  const all = resultsMarkup(searchPalette('', paletteEntries(context())), 2);
  const ids = [...all.matchAll(/id="palette-option-(\d+)"/g)].map(match => Number(match[1]));
  assert.deepEqual(ids, ids.map((_, index) => index));
  assert.equal((all.match(/aria-selected="true"/g) || []).length, 1);
  assert.match(all, /id="palette-option-2"[^>]*aria-selected="true"/);
  assert.match(all, /data-action="theme-set" data-value="dark"/);
  assert.match(all, /data-entry="refresh"[^>]*data-action="palette-run"/);
  assert.match(all, /role="group" aria-label="Go to"/);
  assert.match(all, /<kbd class="kbd">g<\/kbd><kbd class="kbd">n<\/kbd>/);
  assert.doesNotMatch(resultsMarkup(searchPalette('', paletteEntries(context({ singleKeys: false }))), 0, { singleKeys: false }), /<kbd class="kbd">g<\/kbd>/, 'single-key hints hide when single keys are off');
  const denied = resultsMarkup(searchPalette('notif', paletteEntries(context({ notifications: 'denied' }))), 0);
  assert.match(denied, /data-entry="notify"[^>]*aria-disabled="true"/);
  assert.doesNotMatch(denied, /data-entry="notify"[^>]*data-action/);
  assert.match(resultsMarkup([], 0, { query: 'zzqxv' }), /No matches for “zzqxv”/);
});
