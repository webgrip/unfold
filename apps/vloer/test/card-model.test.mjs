import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { cardView, cardTabs, notCollected, notReported, demoCost, plannedLife } from '../public/cards/card-model.js';
import { defaultSkin, firstPartySkins, requiredSlots, resolveSkin, runtimeVersion, skinBase, validateManifest } from '../public/cards/registry.js';
import { render } from '../public/cards/skins/vloer-native/skin.js';
import { cardSectionMarkup, detailMarkup } from '../public/ploeg.js';
import { ploegDemo } from '../src/ploeg-demo.ts';

const space = ' ';
const usd = amount => `US$${space}${amount}`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const helpers = face => ({ face, escape, icon: name => `<svg data-icon="${name}"></svg>`, link: value => /^https?:\/\//.test(value) ? value : '' });
const tab = (view, id) => view.tabs.find(entry => entry.id === id);
const value = (view, id, label) => tab(view, id).rows.find(entry => entry.label === label);

function contractCard() {
  return {
    workItemId: '138', title: 'Retry sandbox claims that never become ready', externalRef: 'VIK-1612', url: 'https://tracker.test/tasks/1612', team: 'glide-core',
    target: { forge: 'forgejo', owner: 'webgrip', repo: 'glide' }, style: { skin: 'vloer-native', theme: null }, state: 'in_review',
    rarity: null, finish: 'matte', grade: null, condition: null,
    steward: { name: 'ryan', source: 'approver' }, roster: [{ name: 'ryan', roles: ['reviewer'] }],
    crew: [{ role: 'builder', writes: true, runs: 3, costUsd: 0.58, inputTokens: 12100000, outputTokens: 88000 }, { role: 'reviewer', writes: false, runs: 2 }],
    plays: [{ number: 57, url: 'https://forge.test/webgrip/glide/pulls/57', state: 'open', shiftId: '113', branch: 'ploeg/138-retry', headSha: 'abc', mergeCommitSha: '', mergedAt: null, mergedBy: '', closedAt: null, additions: 214, deletions: 38, changedFiles: 6, ci: { state: 'success', checks: [{ context: 'verify', state: 'success' }] }, reviews: [{ reviewer: 'ryan', state: 'approved', receivedAt: '2026-10-01T10:30:00Z', headSha: 'abc' }] }],
    totals: { costUsd: 0.58, authorizedUsd: 2, costStatus: 'observed', inputTokens: 12100000, outputTokens: 88000, cacheReadInputTokens: 9800000, cacheCreationInputTokens: 120000, turns: 61, toolCalls: 143, usageComplete: true, runs: 5, failedRuns: 1, rounds: 1, shifts: 1, firstRunAt: '2026-10-01T09:00:00Z', lastRunAt: '2026-10-01T09:35:00Z', runSeconds: 2100 },
    events: [{ at: '2026-10-01T10:00:00Z', kind: 'pr_opened', actor: 'team:glide-core', detail: { number: 57 } }, { at: '2026-10-01T09:00:00Z', kind: 'minted', actor: 'team:glide-core', detail: {} }, { at: '2026-10-01T10:30:00Z', kind: 'review', actor: 'ryan', detail: { number: 57, state: 'approved' } }],
    demo: false,
  };
}

test('the front formats every slot in nl-NL from the contract card', () => {
  const view = cardView(contractCard());
  assert.equal(view.title, 'Retry sandbox claims that never become ready');
  assert.deepEqual([view.state.label, view.state.tone], ['In review', 'review']);
  assert.equal(view.cost.value, usd('0,58'));
  assert.equal(view.cost.caption, `of ${usd('2,00')}`);
  assert.equal(view.cost.share, 0.29);
  assert.match(view.cost.label, /29% of US\$.2,00 authorized/);
  assert.equal(view.tokens.value, `12,1${space}mln. in · 88K out`);
  assert.equal(view.runTime.value, '35 min');
  assert.equal(view.diff.value, '+214 −38 · 6 files');
  assert.deepEqual([view.pr.text, view.pr.state.label, view.pr.ci.label], ['#57', 'Open', 'CI passed']);
  assert.equal(view.crew, 'builder ×3 · reviewer ×2');
  assert.deepEqual([view.steward.text, view.steward.detail], ['Signed by ryan', 'Approved the pull request']);
  assert.equal(view.plays.text, '1 play');
  assert.deepEqual(view.ids, ['#138', 'VIK-1612', 'webgrip/glide']);
});

test('the back has six tabs and shows what the contract gives, oldest event first', () => {
  const view = cardView(contractCard());
  assert.deepEqual(view.tabs.map(entry => entry.label), cardTabs.map(entry => entry.label));
  assert.deepEqual(view.tabs.map(entry => entry.label), ['Economics', 'Agent', 'Change', 'Review & CI', 'Life', 'Context']);
  assert.equal(value(view, 'economics', 'Cache read tokens').value, '9.800.000');
  assert.equal(value(view, 'agent', 'Turns').value, '61');
  assert.equal(value(view, 'agent', 'Tool calls').value, '143');
  assert.equal(value(view, 'economics', 'Model mix').value, notCollected);
  assert.equal(value(view, 'economics', 'Model mix').status, 'uncollected');
  assert.deepEqual(tab(view, 'economics').lists[0].items.map(item => [item.title, item.meta]), [['builder', `${usd('0,58')} · 12,1${space}mln. tokens in`], ['reviewer', notReported]]);
  assert.equal(value(view, 'review', 'Time to first review').value, '30 min');
  assert.equal(value(view, 'review', 'CI on #57').value, 'CI passed');
  assert.deepEqual(tab(view, 'review').lists.map(group => group.title), ['Reviews by people', 'Checks on #57', 'Roster']);
  assert.equal(value(view, 'life', 'Days in production').value, plannedLife);
  assert.match(tab(view, 'life').note, /deploy events, planned for phase 2/);
  assert.deepEqual(tab(view, 'context').lists[0].items.map(item => item.title), ['Card minted: the first Run started', 'Opened pull request #57', 'ryan: approved on #57']);
  assert.equal(tab(view, 'context').lists[0].items[0].meta.endsWith('Agent · glide-core'), true);
});

test('missing and unknown fields read Not reported or Not collected yet, never an invented zero', () => {
  const view = cardView({ workItemId: '9', title: '', team: 'delivery', state: 'something_new', plays: [], totals: { costStatus: 'not_reported', usageComplete: null } });
  assert.equal(view.title, 'Work Item #9');
  assert.deepEqual([view.state.label, view.state.tone], ['Something new', 'neutral']);
  assert.equal(view.cost.value, notReported);
  assert.equal(view.cost.share, null);
  assert.equal(view.tokens.value, notReported);
  assert.equal(view.runTime.value, notReported);
  assert.equal(view.diff.value, 'No pull request yet');
  assert.equal(view.pr, null);
  assert.equal(view.steward.text, 'Unsigned');
  assert.equal(view.crew, 'No agent Runs yet');
  for (const entry of view.tabs.flatMap(group => group.rows)) assert.doesNotMatch(entry.value, /^(?:US\$.)?0(?:,00)?$/, `${entry.label} reads zero`);
  assert.equal(value(view, 'agent', 'Turns').value, notReported);
  const empty = cardView(null);
  assert.equal(empty.title, 'Untitled Work Item');
  const partial = cardView({ ...contractCard(), plays: [{ number: 3, state: 'merged', reviews: [] }], totals: { costUsd: 0.5, costStatus: 'reserved', inputTokens: 100, usageComplete: false } });
  assert.equal(partial.diff.value, notReported);
  assert.equal(partial.pr.ciText, 'CI not reported');
  assert.equal(partial.cost.caption, 'reserved');
  assert.equal(partial.tokens.partial, true);
  assert.equal(partial.tokens.detail, 'Some Runs did not report usage');
  const unstated = cardView({ ...contractCard(), plays: [{ number: 4, reviews: [{ reviewer: 'ryan', state: 'commented' }], ci: { state: 'pending', checks: [], headSha: 'abc', capturedAt: '2026-10-01T11:00:00Z' } }] });
  assert.deepEqual([unstated.pr.state.label, unstated.pr.state.tone], ['In review', 'review'], 'a play the forge has not described reads as in review');
  assert.equal(unstated.pr.ci.label, 'CI running');
  assert.match(value(unstated, 'review', 'CI read').value, /^01-10-2026 \d\d:00$/);
  assert.equal(tab(unstated, 'change').lists[0].items[0].title, '#4 · In review');
});

test('a demo card says so and shows no spend or usage', () => {
  const view = cardView(ploegDemo.cards['114']);
  assert.equal(view.demo, true);
  assert.equal(view.cost.text, demoCost);
  assert.equal(view.cost.share, null);
  assert.equal(view.tokens.value, 'None');
  assert.equal(value(view, 'economics', 'Input tokens').value, 'None · demo');
  assert.equal(value(view, 'economics', 'Cost').value, demoCost);
  assert.deepEqual([view.state.label, view.steward.text], ['Merged', 'Signed by demo-operator']);
  for (const card of Object.values(ploegDemo.cards)) {
    assert.equal(card.demo, true);
    assert.equal(card.totals.costStatus, 'not_reported');
    for (const key of ['costUsd', 'inputTokens', 'outputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens', 'turns', 'toolCalls']) assert.equal(card.totals[key], undefined, `${card.workItemId} ${key}`);
    assert(card.crew.every(member => member.costUsd === undefined && member.inputTokens === undefined));
    assert.deepEqual([card.rarity, card.grade, card.condition, card.finish], [null, null, null, 'matte']);
  }
  assert.equal(ploegDemo.cards['115'].state, 'withdrawn');
  assert.equal(ploegDemo.cards['103'].state, 'drafting');
  assert.equal(ploegDemo.cards['105'].state, 'in_review');
});

test('skin packs resolve to shipped skins and their manifests are checked', () => {
  assert.equal(runtimeVersion, 1);
  assert.equal(resolveSkin({ skin: 'vloer-native' }), 'vloer-native');
  assert.equal(resolveSkin({ skin: 'holo-rarity' }), defaultSkin, 'an unshipped skin falls back');
  assert.equal(resolveSkin({ skin: '../../core/x' }), defaultSkin);
  assert.equal(resolveSkin(null), defaultSkin);
  assert.throws(() => skinBase('../x'));
  for (const id of firstPartySkins) {
    const folder = new URL(`../public/cards/skins/${id}/`, import.meta.url);
    const manifest = validateManifest(JSON.parse(readFileSync(new URL('manifest.json', folder), 'utf8')), id);
    assert.deepEqual(manifest.finishes, ['matte']);
    assert(existsSync(new URL(manifest.stylesheet, folder)));
    if (manifest.script) assert(existsSync(new URL(manifest.script, folder)));
    assert.doesNotMatch(readFileSync(new URL(manifest.stylesheet, folder), 'utf8'), /@import|url\(\s*["']?https?:/, 'a skin loads nothing from elsewhere');
  }
  const good = { id: 'x', name: 'X', version: '1.0.0', runtime: 1, stylesheet: 'skin.css', script: null, finishes: ['matte'] };
  assert.equal(validateManifest(good, 'x').script, null);
  for (const bad of [{ ...good, id: 'y' }, { ...good, runtime: 2 }, { ...good, stylesheet: '../core.css' }, { ...good, script: 'https://evil.test/x.js' }, { ...good, finishes: ['holo'] }, { ...good, version: 'one' }]) assert.throws(() => validateManifest(bad, 'x'));
});

test('Vloer Native fills the required slots, escapes every value and draws without inline styles', () => {
  const hostile = { ...contractCard(), title: '<img src=x onerror=alert(1)>', steward: { name: '"><script>x</script>', source: 'merged_by' }, plays: [{ ...contractCard().plays[0], url: 'javascript:alert(1)' }] };
  const view = cardView(hostile);
  const front = render(view, helpers('front'));
  const back = render(view, helpers('back'));
  for (const slot of requiredSlots) assert.match(front, new RegExp(`data-slot="${slot}"`), slot);
  assert.match(front, /data-card-action="flip"/);
  assert.match(back, /data-card-action="flip"/);
  assert.equal((back.match(/role="tab"/g) || []).length, 6);
  assert.equal((back.match(/role="tabpanel"/g) || []).length, 6);
  for (const markup of [front, back]) {
    assert(!markup.includes('<img'), 'title is escaped');
    assert(!markup.includes('<script'), 'steward is escaped');
    assert(!markup.includes('javascript:'), 'unsafe links are dropped');
    assert(!/\sstyle=/.test(markup), 'no inline style attributes under the CSP');
    assert(!/<[^>]*\son[a-z]+=/.test(markup.replace(/"[^"]*"/g, '""')), 'no inline handlers');
  }
  assert.match(front, /stroke-dasharray="29.0 100"/, 'the budget ring is drawn with an SVG attribute');
  assert.doesNotMatch(render(cardView({ workItemId: '1', title: 'x', team: 't', totals: {} }), helpers('front')), /stroke-dasharray="[0-9.]+ 100"/, 'unknown cost draws no arc');
  assert.doesNotMatch(front, /rarity|grade/i, 'P1 shows no rarity or grade');
});

test('the Work Item page holds a card slot above Rounds only when Ploeg sent a card', () => {
  const detail = { ...structuredClone(ploegDemo.details['105']), demo: true, fetchedAt: '2026-10-01T00:00:00Z' };
  const model = { lane: 'awaiting_review', team: '', detailId: '105', listHref: '#work', canCancel: false, sessions: [], now: Date.now() };
  assert.equal(cardSectionMarkup(detail, model), '');
  assert.equal(cardSectionMarkup(detail, { ...model, card: { ...ploegDemo.cards['114'] } }), '', 'a card for another Work Item is ignored');
  const html = detailMarkup(detail, { ...model, card: ploegDemo.cards['105'] });
  assert.match(html, /<glide-card class="work-run-card" data-work-item="105"><\/glide-card>/);
  assert(html.indexOf('id="work-card"') < html.indexOf('id="work-rounds"'), 'the card sits above Rounds');
  assert(html.includes('id="work-rounds"'), 'the Runs stay');
});
