import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fuzzyMatch, highlight, workItemIndex, workItemFacts, recentFromHash, parseRecent, serializeRecent, rememberRecent, createScope, newestNow, paletteEntries, searchPalette, searchNotice, resultsMarkup, emptyMarkup, noticeMarkup } from '../public/views/palette.js';

const source = {
  ploegDetail: { item: { id: '105', title: 'Round half-cent totals consistently', team: 'delivery', state: 'awaiting_review', externalId: 'DEMO-5', provider: 'demo' } },
  ploeg: { lanes: { needs_human: { items: [{ id: '108', title: 'Show VAT per line on the order confirmation', team: 'delivery', state: 'needs_human', externalId: 'DEMO-8' }] }, all: { items: [{ id: '105', title: 'An older title', state: 'queued' }] } } },
  now: { data: { waiting: [{ id: '109', title: 'Reject negative quantities in the cart API', team: 'delivery', state: 'needs_human' }, { id: '106', title: 'Add a regression test for negative half-cent totals', team: 'delivery', state: 'proposed', provider: 'ploeg', externalId: 'run-53-1', sourceWorkItemId: '105' }], running: [{ id: '51', workItemId: '102', workItemTitle: 'Prepare a regression investigation', team: 'delivery', state: 'running' }], recent: [] } },
  ploegRuns: { runs: [{ id: '40', workItemId: '103', workItemTitle: 'Document the order verification workflow', externalRef: 'DEMO-3', state: 'finished' }, { id: '44', workItemId: '111', workItemTitle: 'Draft the market-sizing section', state: 'running' }] },
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
const ids = groups => groups.map(group => group.id);

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

test('one letter matches only at the start of a word', () => {
  for (const label of ['Insights', 'Environment', 'Runs', 'Open preferences', 'Copy link to this page']) assert.equal(fuzzyMatch('n', label), null, label);
  assert.deepEqual(fuzzyMatch('n', 'Now').ranges, [[0, 1]]);
  assert.deepEqual(fuzzyMatch('n', 'Needs you').ranges, [[0, 1]]);
  assert.deepEqual(fuzzyMatch('r', 'Add retry backoff').ranges, [[4, 5]]);
  const entries = paletteEntries(context());
  const found = searchPalette('n', entries).flatMap(group => labels(group));
  for (const label of ['Insights', 'Environment', 'Runs', 'Open preferences', 'Copy link to this page']) assert(!found.includes(label), `'n' does not find ${label}`);
});

test('highlighting escapes every character and marks only the matched ranges', () => {
  assert.equal(highlight('<img src=x onerror=alert(1)> VAT', [[29, 32]]), '&lt;img src=x onerror=alert(1)&gt; <mark class="palette-mark">VAT</mark>');
  assert.equal(highlight('a & b "c"', []), 'a &amp; b &quot;c&quot;');
  assert.equal(highlight('abc', [[1, 2], [0, 1]]), '<mark class="palette-mark">ab</mark>c');
  assert.equal(highlight('abc', [[2, 9]]), 'abc', 'a range past the end is ignored');
});

test('the Work Item index merges everything the tab loaded, one entry per id, and keeps the first known fields', () => {
  assert.deepEqual(index.map(item => item.id), ['105', '108', '109', '106', '110', '102', '103', '111', '104']);
  assert.deepEqual(index[0], { id: '105', title: 'Round half-cent totals consistently', team: 'delivery', state: 'awaiting_review', externalId: 'DEMO-5', provider: 'demo', source: '' });
  assert.equal(index.find(item => item.id === '102').state, 'leased', 'a running Run on Now puts its Work Item in Running');
  assert.equal(index.find(item => item.id === '111').state, 'leased', 'so does a running Run in the Runs list');
  assert.equal(index.find(item => item.id === '103').state, '', 'a finished Run does not say what state its Work Item is in');
  assert.equal(index.find(item => item.id === '103').externalId, 'DEMO-3');
  assert.deepEqual([index.find(item => item.id === '106').provider, index.find(item => item.id === '106').source], ['ploeg', '105']);
  assert.deepEqual(workItemIndex({}), []);
  assert.deepEqual(workItemIndex({ now: { data: { waiting: 'broken', running: null } } }), []);
});

test('a Work Item is identified by its number, tracker reference, origin and Team, never by a Ploeg-internal id', () => {
  const item = id => index.find(entry => entry.id === id);
  assert.deepEqual(workItemFacts(item('108')), ['#108', 'DEMO-8', 'delivery']);
  assert.deepEqual(workItemFacts(item('106')), ['#106', 'by a Run on #105', 'delivery']);
  assert.deepEqual(workItemFacts({ id: '107', state: 'proposed', externalId: 'run-46-1', team: 'research' }), ['#107', 'research'], 'a run-… id is hidden even without a provider');
  assert.deepEqual(workItemFacts({ id: '104' }), ['#104']);
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
  assert.deepEqual(parseRecent(serializeRecent('u1', list), 'u1'), list);
  assert.deepEqual(parseRecent('not json', 'u1'), []);
  assert.deepEqual(parseRecent('{"kind":"work"}', 'u1'), []);
  assert.deepEqual(parseRecent(serializeRecent('u1', [{ kind: 'work', id: '1', title: 'ok', at: '2026-09-30T10:00:00Z' }, { kind: 'work', id: 'x', title: '', at: '2026-09-30T10:00:00Z' }, { kind: 'other', id: '1', title: '', at: '2026-09-30T10:00:00Z' }, { kind: 'work', id: '2', title: 'no date', at: 'never' }]), 'u1').map(entry => entry.id), ['1']);
});

test('the recent list belongs to the user who opened those pages', () => {
  const stored = serializeRecent('u1', [{ kind: 'work', id: '4242', title: 'Confidential acquisition of Acme', at: '2026-09-30T10:00:00Z' }]);
  assert.equal(parseRecent(stored, 'u1').length, 1);
  assert.deepEqual(parseRecent(stored, 'u2'), [], 'another account sees nothing');
  assert.deepEqual(parseRecent(stored, null), [], 'nobody signed in sees nothing');
  assert.deepEqual(parseRecent(JSON.stringify([{ kind: 'work', id: '4242', title: 'Confidential acquisition of Acme', at: '2026-09-30T10:00:00Z' }]), 'u1'), [], 'a list without an owner is dropped');
});

test('a user switch in the same tab hides every list the previous user loaded', () => {
  const scope = createScope();
  const app = { bootstrap: { user: { id: 'u1' } }, now: { data: { waiting: [] } }, ploegRuns: { runs: [] }, ploegFeed: { events: [] }, ploegProposed: { items: [] }, ploeg: { lanes: {} }, ploegDetail: { item: {} }, sessions: [] };
  const before = { now: app.now.data, runs: app.ploegRuns, feed: app.ploegFeed, proposed: app.ploegProposed, ploeg: app.ploeg, detail: app.ploegDetail, sessions: app.sessions };
  assert.equal(scope.observe(app), true, 'the first user to appear is a change');
  assert.equal(scope.user, 'u1');
  assert.equal(scope.observe(app), false);
  for (const value of Object.values(before)) assert.equal(scope.trusted(value), value);
  app.bootstrap = null;
  assert.equal(scope.observe(app), false);
  assert.equal(scope.user, null, 'nobody is signed in');
  app.bootstrap = { user: { id: 'u2' } };
  assert.equal(scope.observe(app), true);
  for (const value of Object.values(before)) assert.equal(scope.trusted(value), null, 'the previous user’s lists stay hidden');
  app.ploegRuns = { runs: [] };
  assert.equal(scope.trusted(app.ploegRuns), app.ploegRuns, 'a list loaded for the new user counts');

  const direct = createScope();
  const tab = { bootstrap: { user: { id: 'u1' } }, ploegRuns: { runs: [] } };
  direct.observe(tab);
  tab.bootstrap = { user: { id: 'u2' } };
  assert.equal(direct.observe(tab), true);
  assert.equal(direct.trusted(tab.ploegRuns), null, 'a switch nobody saw the sign-out of still hides the old lists');

  const leaving = createScope();
  const page = { bootstrap: { user: { id: 'u1' } }, ploegFeed: { events: [] } };
  leaving.observe(page);
  leaving.leave(page);
  assert.equal(leaving.trusted(page.ploegFeed), null, 'signing out hides the lists at once');
  assert.equal(leaving.observe(page), true, 'the same user signing in again starts afresh');
  assert.equal(createScope().trusted(null), null);
});

test('the Work Item search reports only the state of the newest Now response', () => {
  const page = { waiting: [], errors: {} };
  const failed = { data: null, error: { message: 'Ploeg did not answer.' }, at: 1000 };
  assert.deepEqual(newestNow({ page, pageAt: 2000, cache: failed }), { newest: page, older: null, error: false, missing: '' }, 'a Now page read after the failure clears it');
  assert.deepEqual(newestNow({ page, pageAt: 500, cache: failed }), { newest: null, older: page, error: 'Ploeg did not answer.', missing: '' });
  assert.equal(newestNow({ cache: { data: null, error: {}, at: 1 } }).error, true);
  const partial = { waiting: [], errors: { running: 'Ploeg could not list running Runs.' } };
  assert.equal(newestNow({ page: partial, pageAt: 100, cache: { data: { waiting: [], errors: {} }, error: null, at: 200 } }).missing, '', 'an older partial response says nothing');
  assert.equal(newestNow({ page: partial, pageAt: 300, cache: { data: { waiting: [] }, error: null, at: 200 } }).missing, 'Running Runs');
  assert.equal(newestNow({ page: { errors: { waiting: 'x', running: 'y', recent: 'z' } } }).missing, 'Waiting Work Items, Running Runs and Finished Runs');
  assert.deepEqual(newestNow({ page, pageAt: 10, cache: { data: null, error: null, at: 0 } }).newest, page);
});

test('before anything is typed the palette offers recent items, commands and destinations, each with its shortcut', () => {
  const groups = searchPalette('', paletteEntries(context()));
  assert.deepEqual(ids(groups), ['recent', 'commands', 'go'], 'commands come before the destinations the sidebar already lists');
  assert.deepEqual(labels(groups[0]), ['Show VAT per line on the order confirmation'], 'the page on screen is not offered again and titles come from loaded data');
  const recent = groups[0].results[0].entry;
  assert.deepEqual([recent.icon, recent.tone, recent.standing.label, recent.facts], ['alert', 'attention', 'Needs you', ['#108', 'DEMO-8', 'delivery']], 'a recent Work Item shows its state as a glyph and a label, and the same facts as in search');
  assert.deepEqual(labels(groups[1]), ['Switch to dark theme', 'Pause live updates', 'Refresh this page', 'New session', 'Show keyboard shortcuts', 'Open preferences']);
  assert.deepEqual(labels(searchPalette('', paletteEntries(context({ demo: false }))).find(group => group.id === 'commands')), ['Switch to dark theme', 'Pause live updates', 'Refresh this page', 'New session', 'Show keyboard shortcuts', 'Open preferences', 'Sign out'], 'every command the brief names fits');
  assert.deepEqual(labels(groups[2]), ['Now', 'Work', 'Proposed', 'Runs', 'Activity', 'Insights']);
  const now = groups[2].results[0].entry;
  assert.deepEqual([now.hash, now.keys, now.count], ['now', ['g', 'n'], { value: 9, tone: 'attention', label: '9 waiting on you' }]);
  const all = paletteEntries(context());
  assert(!all.some(entry => entry.label === 'Sign out'), 'the demo has no sign-out');
  assert(paletteEntries(context({ demo: false })).some(entry => entry.label === 'Sign out' && entry.action === 'logout'));
  assert(!paletteEntries(context({ canCreate: false })).some(entry => entry.id === 'new-session'), 'viewers cannot start sessions');
  assert(!paletteEntries(context({ sessionsShown: false })).some(entry => entry.group === 'sessions' || entry.id === 'go-sessions'));
  assert.deepEqual([all.find(entry => entry.id === 'theme').run, all.find(entry => entry.id === 'theme').value], ['theme', 'dark']);
  assert.equal(all.find(entry => entry.id === 'live').run, 'live', 'theme and live updates run through the palette, which redraws Preferences');
  assert.equal(paletteEntries(context({ dark: true, theme: 'dark' })).find(entry => entry.id === 'theme').label, 'Switch to light theme');
  assert(paletteEntries(context({ theme: 'dark' })).some(entry => entry.label === 'Follow the system theme'));
  assert.equal(paletteEntries(context({ paused: true })).find(entry => entry.id === 'live').label, 'Resume live updates');
  const unknown = paletteEntries(context({ items: [], recent: [{ kind: 'work', id: '4', title: 'Stored title', at: '2026-09-30T10:00:00Z' }], current: null })).find(entry => entry.id === 'recent-work-4');
  assert.deepEqual([unknown.icon, unknown.standing, unknown.facts], ['work', undefined, ['#4']], 'an unknown state shows the neutral glyph and no label');
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
  assert(!searchPalette('rou', entries).some(group => group.results.some(result => result.entry.label === 'Insights')), 'hidden keywords match only at the start of a word (not "throughput")');
  assert.equal(searchPalette('run-53', entries).some(group => group.id === 'items'), false, 'a hidden Ploeg-internal id is not searchable');
  assert.equal(searchPalette('ru', entries).some(group => group.results.some(result => result.entry.itemId === '106')), false, 'nor is the "by a Run" origin, so "ru" does not find every proposal');
  const origin = resultsMarkup(searchPalette('106 delivery', entries), 0);
  assert.match(origin, /<span class="palette-fact">#<mark class="palette-mark">106<\/mark><\/span><span class="palette-fact">by a Run on #105<\/span><span class="palette-fact"><mark class="palette-mark">delivery<\/mark><\/span>/, 'marks stay on the right fact around the origin');
});

test('short queries put pages and commands first, and a recent item never lifts its whole group', () => {
  const entries = paletteEntries(context({ recent: [{ kind: 'work', id: '109', title: '', at: '2026-09-30T10:00:00Z' }] }));
  const r = searchPalette('r', entries);
  assert.deepEqual(ids(r).slice(0, 2), ['go', 'commands'], 'one letter ranks Go to and Commands above Work Items');
  assert.equal(r[0].results[0].entry.label, 'Runs');
  assert.deepEqual(ids(searchPalette('re', entries)).slice(0, 2), ['go', 'commands']);
  const reject = searchPalette('reject', entries);
  assert.equal(reject[0].id, 'items');
  assert.equal(reject[0].results[0].entry.label, 'Reject negative quantities in the cart API');
  const boosted = searchPalette('alpha', [{ id: 'page', group: 'go', label: 'Alpha' }, { id: 'item', group: 'items', label: 'Alpha soup', boost: 50 }]);
  assert.deepEqual(ids(boosted), ['go', 'items'], 'groups are ordered by their best match without the recent boost');
  const items = searchPalette('negative', paletteEntries(context({ recent: [{ kind: 'work', id: '106', title: '', at: '2026-09-30T10:00:00Z' }] }))).find(group => group.id === 'items');
  assert.equal(items.results[0].entry.itemId, '106', 'inside its group a recent item comes first');
});

test('a Work Item number always opens that Work Item first, by title when it is loaded', () => {
  const entries = paletteEntries(context());
  const unknown = searchPalette('999', entries);
  assert.equal(unknown[0].id, 'items');
  assert.deepEqual([unknown[0].results[0].entry.label, unknown[0].results[0].entry.hash], ['Open Work Item #999', 'work/999']);
  const known = searchPalette('#108', entries);
  assert.deepEqual([known[0].results[0].entry.label, known[0].results[0].entry.hash], ['Show VAT per line on the order confirmation', 'work/108']);
  assert.equal(searchPalette('12', entries)[0].id, 'items', 'a short number still leads with the Work Item');
  assert.equal(searchPalette('0', entries).some(group => group.results.some(result => result.entry.label.startsWith('Open Work Item'))), false, 'zero is not a Work Item id');
  assert.deepEqual(searchPalette('999', entries, { offline: true }), [], 'without Ploeg there is no Work Item to open');
});

test('without a match the palette offers the Work page as the one next step', () => {
  const entries = paletteEntries(context());
  const none = searchPalette('zzqxv', entries);
  assert.deepEqual(ids(none), ['next']);
  assert.deepEqual([none[0].results[0].entry.label, none[0].results[0].entry.hash], ['Open Work', 'work']);
  assert.deepEqual(searchPalette('zzqxv', entries, { offline: true }), [], 'without Ploeg there is nothing to suggest');
  assert.match(emptyMarkup('zzqxv'), /No matches for “zzqxv”/);
  assert.match(emptyMarkup('zzqxv'), /Search covers pages, commands and the Work Items this tab has loaded\./);
  assert.doesNotMatch(emptyMarkup('zzqxv'), /number/, 'the footer, not the empty state, explains numbers');
  assert.match(emptyMarkup('zzqxv', { offline: true }), /Search covers pages and commands/);
  assert.doesNotMatch(emptyMarkup('<b>'), /<b>/);
});

test('the Work Item search shows loading, and says what failed only when the query is after a Work Item', () => {
  const entries = paletteEntries(context());
  const loading = searchPalette('qqq', entries, { loading: true });
  assert.deepEqual(loading.map(group => [group.id, group.loading, group.note, group.results.length]), [['items', true, 'Loading…', 0]]);
  assert.match(resultsMarkup(loading), /aria-busy="true"/);
  assert.deepEqual(ids(searchPalette('dark', entries, { loading: true })), ['commands'], 'a query for a command shows no loading Work Items');
  const error = { error: 'Ploeg did not answer.' };
  for (const query of ['qqq', '999', '#108']) assert.deepEqual(searchNotice(query, searchPalette(query, entries, error), error), { tone: 'danger', text: 'Work Items could not be loaded. Ploeg did not answer.', retry: true }, query);
  for (const query of ['dark', 'help', 'settings', 'accounts', 'budget']) assert.equal(searchNotice(query, searchPalette(query, entries, error), error), null, `${query} finds what it is after without Work Items`);
  assert.equal(searchNotice('rounding', searchPalette('rounding', entries, error), error)?.tone, 'danger', 'a session with that title does not hide the missing Work Items');
  assert.equal(searchNotice('qqq', searchPalette('qqq', entries, { error: true }), { error: true }).text, 'Work Items could not be loaded.');
  assert.equal(searchNotice('qqq', [], { error: true, loading: true }), null);
  assert.equal(searchNotice('qqq', [], { error: true, offline: true }), null);
  assert.equal(searchNotice('', [], { error: true }), null);
  const partial = { partial: 'Running Runs' };
  assert.deepEqual(searchNotice('vat', searchPalette('vat', entries, partial), partial), { tone: 'attention', text: 'Running Runs could not be read · results may be incomplete', retry: true });
  assert.equal(searchNotice('dark', searchPalette('dark', entries, partial), partial), null);
  const markup = noticeMarkup({ tone: 'danger', text: 'Work Items could not be loaded. <b>', retry: true });
  assert.match(markup, /&lt;b&gt;/);
  assert.match(markup, /class="button ghost xs"[^>]*data-action="palette-run"[^>]*data-entry="retry-work-items"/);
  assert.doesNotMatch(noticeMarkup({ tone: 'attention', text: 'x', retry: false }), /button/);
  assert.equal(noticeMarkup(null), '');
});

test('the listbox markup is one option per result with sequential ids, one selected row, escaped text and no inline style', () => {
  const hostile = paletteEntries(context({ items: [{ id: '7', title: '<img src=x onerror=alert(1)>', team: 'x"y', state: 'needs_human', externalId: '' }] }));
  const groups = searchPalette('img', hostile);
  const markup = resultsMarkup(groups, 0);
  assert.doesNotMatch(markup, /<img/);
  assert.match(markup, /&lt;<mark class="palette-mark">img<\/mark> src=x onerror=alert\(1\)&gt;/);
  assert.match(markup, /<span class="palette-fact">x&quot;y<\/span>/);
  assert.doesNotMatch(markup, /style=/);
  const all = resultsMarkup(searchPalette('', paletteEntries(context())), 2);
  const optionIds = [...all.matchAll(/id="palette-option-(\d+)"/g)].map(match => Number(match[1]));
  assert.deepEqual(optionIds, optionIds.map((_, index) => index));
  assert.equal((all.match(/aria-selected="true"/g) || []).length, 1);
  assert.match(all, /id="palette-option-2"[^>]*aria-selected="true"/);
  assert.match(all, /data-entry="theme"[^>]*data-action="palette-run" data-value="dark"/);
  assert.match(all, /data-entry="refresh"[^>]*data-action="palette-run"/);
  assert.match(all, /role="group" aria-label="Go to"/);
  assert.match(all, /<kbd class="kbd">g<\/kbd><kbd class="kbd">n<\/kbd>/);
  assert.match(all, /<span class="palette-option-state" data-tone="attention">Needs you<\/span><span class="palette-option-facts"><span class="palette-fact">#108<\/span><span class="palette-fact">DEMO-8<\/span><span class="palette-fact">delivery<\/span><\/span>/, 'a Work Item row shows its state as tinted text before its facts');
  assert.doesNotMatch(all, /class="badge/, 'no state pill competes with the titles');
  const items = resultsMarkup(searchPalette('vat', paletteEntries(context())), 0);
  assert.match(items, /<span class="palette-option-state" data-tone="attention">Needs you<\/span>/);
  assert.doesNotMatch(items, /class="badge/);
  assert.doesNotMatch(resultsMarkup(searchPalette('', paletteEntries(context({ singleKeys: false }))), 0, { singleKeys: false }), /<kbd class="kbd">g<\/kbd>/, 'single-key hints hide when single keys are off');
  const denied = paletteEntries(context({ notifications: 'denied' })).find(entry => entry.id === 'notify');
  assert.equal(denied.meta, 'Blocked for this site. Allow notifications in the browser’s site settings.');
  const deniedMarkup = resultsMarkup(searchPalette('notif', paletteEntries(context({ notifications: 'denied' }))), 0);
  assert.match(deniedMarkup, /data-entry="notify"[^>]*aria-disabled="true"/);
  assert.doesNotMatch(deniedMarkup, /data-entry="notify"[^>]*data-action/);
  const next = resultsMarkup(searchPalette('zzqxv', paletteEntries(context())), 0);
  assert.match(next, /data-entry="next-work"[^>]*data-action="palette-run"/);
  assert.match(next, /<kbd class="kbd">↵<\/kbd>/);
});
