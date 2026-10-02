import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { cardView, cardTabs, notCollected, notReported, demoCost, mergeFallback, notLive, daysLive, finishFor, nextFinish, finishLadder } from '../public/cards/card-model.js';
import { defaultSkin, firstPartySkins, requiredSlots, resolveSkin, runtimeVersion, skinBase, validateManifest } from '../public/cards/registry.js';
import { render, attach } from '../public/cards/skins/vloer-native/skin.js';
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
    workItemId: '138', title: 'Retry sandbox claims that never become ready', externalRef: 'VIK-1612', url: 'https://tracker.test/tasks/1612', team: 'unfold-core',
    target: { forge: 'forgejo', owner: 'webgrip', repo: 'glide' }, style: { skin: 'vloer-native', theme: null }, state: 'in_review',
    rarity: null, finish: 'matte', grade: null, condition: null,
    steward: { name: 'ryan', source: 'approver' }, roster: [{ name: 'ryan', roles: ['reviewer'] }],
    crew: [{ role: 'builder', writes: true, runs: 3, costUsd: 0.58, inputTokens: 12100000, outputTokens: 88000 }, { role: 'reviewer', writes: false, runs: 2 }],
    plays: [{ number: 57, url: 'https://forge.test/webgrip/glide/pulls/57', state: 'open', shiftId: '113', branch: 'ploeg/138-retry', headSha: 'abc', mergeCommitSha: '', mergedAt: null, mergedBy: '', closedAt: null, additions: 214, deletions: 38, changedFiles: 6, ci: { state: 'success', checks: [{ context: 'verify', state: 'success' }] }, reviews: [{ reviewer: 'ryan', state: 'approved', receivedAt: '2026-10-01T10:30:00Z', headSha: 'abc' }] }],
    totals: { costUsd: 0.58, authorizedUsd: 2, costStatus: 'observed', inputTokens: 12100000, outputTokens: 88000, cacheReadInputTokens: 9800000, cacheCreationInputTokens: 120000, turns: 61, toolCalls: 143, usageComplete: true, runs: 5, failedRuns: 1, rounds: 1, shifts: 1, firstRunAt: '2026-10-01T09:00:00Z', lastRunAt: '2026-10-01T09:35:00Z', runSeconds: 2100 },
    events: [{ at: '2026-10-01T10:00:00Z', kind: 'pr_opened', actor: 'team:unfold-core', detail: { number: 57 } }, { at: '2026-10-01T09:00:00Z', kind: 'minted', actor: 'team:unfold-core', detail: {} }, { at: '2026-10-01T10:30:00Z', kind: 'review', actor: 'ryan', detail: { number: 57, state: 'approved' } }],
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

test('the back has twelve tabs and shows what the contract gives, oldest event first', () => {
  const view = cardView(contractCard());
  assert.deepEqual(view.tabs.map(entry => entry.label), cardTabs.map(entry => entry.label));
  assert.deepEqual(view.tabs.map(entry => entry.label), ['Economics', 'Agent', 'Change', 'Review & CI', 'Flow', 'Gates', 'Grade', 'Rarity', 'Condition', 'Life', 'Set', 'Context']);
  assert.equal(value(view, 'economics', 'Cache read tokens').value, '9.800.000');
  assert.equal(value(view, 'agent', 'Turns').value, '61');
  assert.equal(value(view, 'agent', 'Tool calls').value, '143');
  assert.equal(value(view, 'economics', 'Model mix').value, notCollected);
  assert.equal(value(view, 'economics', 'Model mix').status, 'uncollected');
  assert.deepEqual(tab(view, 'economics').lists[0].items.map(item => [item.title, item.meta]), [['builder', `${usd('0,58')} · 12,1${space}mln. tokens in`], ['reviewer', notReported]]);
  assert.equal(value(view, 'review', 'Time to first review').value, '30 min');
  assert.equal(value(view, 'review', 'CI on #57').value, 'CI passed');
  assert.deepEqual(tab(view, 'review').lists.map(group => group.title), ['Reviews by people', 'Checks on #57', 'Roster']);
  assert.deepEqual([value(view, 'life', 'Days live').value, value(view, 'life', 'Days live').status], [notReported, 'unreported'], 'an older Ploeg without releases reads Not reported');
  assert.match(tab(view, 'life').note, /does not report deploys or releases yet, so the card stays matte/);
  assert.deepEqual(tab(view, 'context').lists[0].items.map(item => item.title), ['Card minted: the first Run started', 'Opened pull request #57', 'ryan: approved on #57']);
  assert.equal(tab(view, 'context').lists[0].items[0].meta.endsWith('Agent · unfold-core'), true);
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
    assert.equal(card.finish, 'matte');
    if (card.rarity) assert.equal(cardView(card).tabs.find(entry => entry.id === 'rarity').rows.find(entry => entry.label === 'Source').value, 'Demo · illustrative inputs, not rated by Ploeg', `${card.workItemId} says its rarity is a demo`);
    if (card.grade) assert.match(ploegDemo.items.find(item => item.id === card.workItemId).description, /grade and cracks are sample data/, `${card.workItemId} labels its grade and cracks as sample data`);
    if (card.condition || card.gates) assert.match(ploegDemo.items.find(item => item.id === card.workItemId).description, /^Illustrative/, `${card.workItemId} says it is illustrative`);
    if (card.condition) assert.match(ploegDemo.items.find(item => item.id === card.workItemId).description, /cracks are sample data/, `${card.workItemId} labels its cracks as sample data`);
  }
  assert.deepEqual(Object.values(ploegDemo.cards).filter(card => card.grade).map(card => card.workItemId), ['119', '120', '122', '123', '134', '136', '137', '138', '140', '141', '142']);
  assert.deepEqual(Object.values(ploegDemo.cards).filter(card => card.condition).map(card => [card.workItemId, card.condition.state]), [['118', 'cracked'], ['119', 'cracked'], ['120', 'mended'], ['134', 'mended'], ['136', 'cracked'], ['140', 'mended'], ['141', 'cracked']]);
  const skins = {};
  for (const card of Object.values(ploegDemo.cards)) (skins[card.style.skin] ??= []).push(card.workItemId);
  assert.deepEqual(skins.forge, ['105', '117', '119', '120', '122', '123']);
  assert.deepEqual([skins.holo, skins.loot, skins.arcade, skins.ticker, skins.patch], [['111', '134', '135'], ['108', '136', '137'], ['102', '138', '139'], ['113', '140', '141'], ['101', '142', '143']], 'each DOM skin pack has three demo cards');
  assert.deepEqual(Object.keys(skins).sort(), [...firstPartySkins].sort(), 'every shipped skin appears in the demo');
  assert(['109', '114', '118', '121', '124', '125'].every(id => skins['vloer-native'].includes(id)), 'Vloer Native keeps the cards the Work and trace pages check');
  assert.deepEqual(Object.values(ploegDemo.cards).filter(card => card.set?.role === 'epic').map(card => [card.workItemId, card.style.skin, card.set.complete]), [['125', 'vloer-native', false], ['135', 'holo', false], ['139', 'arcade', true], ['143', 'patch', false]], 'four epics, one complete set');
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
  assert.deepEqual(firstPartySkins, ['vloer-native', 'forge', 'holo', 'loot', 'arcade', 'ticker', 'patch']);
  assert.equal(resolveSkin({ skin: 'forge' }), 'forge');
  for (const id of firstPartySkins) {
    const folder = new URL(`../public/cards/skins/${id}/`, import.meta.url);
    const manifest = validateManifest(JSON.parse(readFileSync(new URL('manifest.json', folder), 'utf8')), id);
    assert.deepEqual(manifest.finishes, finishLadder.map(step => step.key));
    assert(existsSync(new URL(manifest.stylesheet, folder)));
    if (manifest.script) assert(existsSync(new URL(manifest.script, folder)));
    assert.doesNotMatch(readFileSync(new URL(manifest.stylesheet, folder), 'utf8').replace(/^@import url\("\.\.\/\.\.\/skin-kit\.css"\);\n/, ''), /@import|url\(\s*["']?(?:https?:|\/\/)/, 'a skin loads nothing from elsewhere; it may import only the shared skin kit');
  }
  const good = { id: 'x', name: 'X', version: '1.0.0', runtime: 1, stylesheet: 'skin.css', script: null, finishes: ['matte'] };
  assert.equal(validateManifest(good, 'x').script, null);
  assert.deepEqual([validateManifest(good, 'x').renderer, validateManifest(good, 'x').fallback, validateManifest(good, 'x').extends], ['dom', null, null]);
  assert.deepEqual(validateManifest({ ...good, renderer: 'webgl2', fallback: 'vloer-native', extends: 'vloer-native' }, 'x').renderer, 'webgl2');
  for (const bad of [{ ...good, id: 'y' }, { ...good, runtime: 2 }, { ...good, stylesheet: '../core.css' }, { ...good, script: 'https://evil.test/x.js' }, { ...good, finishes: ['holo'] }, { ...good, finishes: ['matte', 'sparkle'] }, { ...good, version: 'one' }, { ...good, renderer: 'canvas' }, { ...good, renderer: 'webgl2' }, { ...good, renderer: 'webgl2', fallback: 'holo-rarity' }, { ...good, extends: '../vloer-native' }, { ...good, fallback: 'x' }]) assert.throws(() => validateManifest(bad, 'x'));
});

test('Vloer Native fills the required slots, escapes every value and draws without inline styles', () => {
  const hostile = { ...contractCard(), title: '<img src=x onerror=alert(1)>', steward: { name: '"><script>x</script>', source: 'merged_by' }, plays: [{ ...contractCard().plays[0], url: 'javascript:alert(1)' }] };
  const view = cardView(hostile);
  const front = render(view, helpers('front'));
  const back = render(view, helpers('back'));
  for (const slot of requiredSlots) assert.match(front, new RegExp(`data-slot="${slot}"`), slot);
  assert.match(front, /data-card-action="flip"/);
  assert.match(back, /data-card-action="flip"/);
  assert.equal((back.match(/role="tab"/g) || []).length, 12);
  assert.equal((back.match(/role="tabpanel"/g) || []).length, 12);
  for (const markup of [front, back]) {
    assert(!markup.includes('<img'), 'title is escaped');
    assert(!markup.includes('<script'), 'steward is escaped');
    assert(!markup.includes('javascript:'), 'unsafe links are dropped');
    assert(!/\sstyle=/.test(markup), 'no inline style attributes under the CSP');
    assert(!/<[^>]*\son[a-z]+=/.test(markup.replace(/"[^"]*"/g, '""')), 'no inline handlers');
  }
  assert.match(front, /stroke-dasharray="29.0 100"/, 'the budget ring is drawn with an SVG attribute');
  assert.doesNotMatch(render(cardView({ workItemId: '1', title: 'x', team: 't', totals: {} }), helpers('front')), /stroke-dasharray="[0-9.]+ 100"/, 'unknown cost draws no arc');
  assert.doesNotMatch(front, /rarity|grade/i, 'a card without a rarity or a grade shows neither');
  assert.doesNotMatch(front, /class="day"|class="fx /, 'an unreleased card draws no day chip and no finish layer');
});

test('the Work Item page heads the detail with a card only when Ploeg sent one, and falls back when it did not', () => {
  const detail = { ...structuredClone(ploegDemo.details['105']), demo: true, fetchedAt: '2026-10-01T00:00:00Z' };
  const model = { lane: 'awaiting_review', team: '', detailId: '105', listHref: '#work', canCancel: false, sessions: [], now: Date.now() };
  assert.equal(cardSectionMarkup(detail, model), '');
  assert.equal(cardSectionMarkup(detail, { ...model, card: { ...ploegDemo.cards['114'] } }), '', 'a card for another Work Item is ignored');
  const html = detailMarkup(detail, { ...model, card: ploegDemo.cards['105'] });
  assert.match(html, /<h3 class="work-card-headline" id="work-card-headline">Ready for your review · No verdict PR #5 after 2 Rounds<\/h3>/, 'the headline states what happened');
  assert.match(html, /<unfold-card class="work-run-card" data-work-item="105"><\/unfold-card>/);
  assert.match(html, /<div class="work-card-actions"><a class="button primary" href="https:\/\/forge\.example\.invalid\/example\/order-service\/pulls\/5"[^>]*data-link-out="pr">[^]*Open pull request #5/, 'the card carries the primary action');
  assert(html.indexOf('id="work-card"') > html.indexOf('id="ploeg-item-title"') && html.indexOf('id="work-card"') < html.indexOf('id="work-account"'), 'the card heads the detail, above the problem and solution');
  assert(html.indexOf('id="work-card"') < html.indexOf('id="work-decision"'), 'the card sits above the review box');
  assert(html.indexOf('id="work-card"') < html.indexOf('id="work-rounds"'), 'the card sits above Rounds');
  assert(html.includes('id="work-rounds"'), 'the Runs stay');
  assert.match(html, /<details class="disclosure" id="work-forge-105">/, 'the forge outcomes are a closed disclosure');
  assert.doesNotMatch(html, /class="overline" id="work-card-title"/, 'the separate Run card caption is gone');
  const without = detailMarkup(detail, model);
  assert.doesNotMatch(without, /id="work-card"/);
  assert.match(without, /<div class="work-receipt">/, 'without a card the review box keeps the full receipt');
  assert.match(without, /The reviewer reported no change needed but gave no verdict\./, 'and the verdict check');
  assert.equal((without.match(/Open pull request #5/g) || []).length, 2, 'and its own primary action (box and phone bar)');
});

test('with a card the review box keeps only the checks, folding the neutral ones and closing the forge outcomes', () => {
  const detail = { ...structuredClone(ploegDemo.details['105']), demo: true, fetchedAt: '2026-10-01T00:00:00Z' };
  const model = { lane: 'awaiting_review', team: '', detailId: '105', listHref: '#work', canCancel: false, sessions: [], now: Date.now() };
  const html = detailMarkup(detail, { ...model, card: ploegDemo.cards['105'] });
  const box = html.slice(html.indexOf('id="work-decision"'), html.indexOf('id="work-brief"'));
  assert.doesNotMatch(box, /<div class="work-receipt">/, 'the card already shows the receipt the box would repeat');
  assert.doesNotMatch(box, /The reviewer reported no change needed but gave no verdict\./, 'and the verdict the headline carries');
  assert.match(box, /<p class="meta work-checklist-note">2 not reported: CI, tracker link<\/p>/, 'neutral checks fold into one muted line');
  assert.doesNotMatch(box, /data-tone="neutral"/, 'no neutral check item is left in the list');
  assert.match(box, /<li class="work-check" data-tone="attention">[^]*Findings name an instruction file/, 'warnings stay visible');
  assert.match(box, /<li class="work-check" data-tone="success">[^]*Pull request #5 reported by the writer/, 'successes stay visible');
  assert.match(box, /<details class="disclosure" id="work-forge-105"><summary><span class="disclosure-summary">On the forge<\/span>/, 'the forge outcomes are a closed disclosure');
  assert.doesNotMatch(box, /class="work-check" data-tone="success"[^]*The agent reviewer approved/, 'the verdict check is the card headline now');
  assert.match(box, /data-action="work-run" data-id="53">Read the findings/, 'the box keeps the findings action');
  assert.doesNotMatch(box, /Open pull request #5/, 'the card carries the primary action, not the box');
});

const now = Date.parse('2026-10-01T12:00:00Z');
const released = (days, extra = {}) => ({ ...contractCard(), state: 'merged', plays: [{ ...contractCard().plays[0], state: 'merged', mergedAt: '2025-01-01T09:00:00Z', mergedBy: 'ryan' }], release: { at: new Date(now - days * 86_400_000 - 3_600_000).toISOString(), source: 'deploy', environment: 'production' }, ...extra });

test('days live are whole days since the release, from an injectable clock', () => {
  assert.equal(daysLive('2026-10-01T11:00:00Z', now), 0, 'the release day is day 0');
  assert.equal(daysLive('2026-09-30T12:00:00Z', now), 1);
  assert.equal(daysLive('2026-09-30T12:00:01Z', now), 0, 'a day is 24 whole hours');
  assert.equal(daysLive('2025-10-01T12:00:00Z', now), 365);
  assert.equal(daysLive('2026-10-02T12:00:00Z', now), 0, 'a release ahead of the clock is never negative');
  assert.equal(daysLive('', now), null);
  assert.equal(daysLive('not a time', now), null);
  assert.equal(daysLive(undefined, now), null);
});

test('the finish ladder steps at 7, 30, 90, 180 and 365 days and names the next finish with the days to go', () => {
  const steps = [[0, 'matte', 'foil', 7], [6, 'matte', 'foil', 1], [7, 'foil', 'holo', 23], [29, 'foil', 'holo', 1], [30, 'holo', 'prism', 60], [89, 'holo', 'prism', 1], [90, 'prism', 'gilded', 90], [179, 'prism', 'gilded', 1], [180, 'gilded', 'infinity', 185], [364, 'gilded', 'infinity', 1]];
  for (const [days, finish, next, toGo] of steps) {
    assert.equal(finishFor(days).key, finish, `${days} days`);
    assert.deepEqual([nextFinish(days).finish.key, nextFinish(days).daysToGo], [next, toGo], `${days} days`);
  }
  assert.equal(finishFor(365).key, 'infinity');
  assert.equal(finishFor(2000).key, 'infinity');
  assert.equal(nextFinish(365), null, 'infinity is the top of the ladder');
  assert.equal(finishFor(null).key, 'matte');
  assert.equal(finishFor(-3).key, 'matte');
  assert.deepEqual(finishLadder.map(step => [step.key, step.days]), [['matte', 0], ['foil', 7], ['holo', 30], ['prism', 90], ['gilded', 180], ['infinity', 365]]);
});

test('a released card shows its day, finish, release source, deployments and the next finish', () => {
  const card = released(41, { finish: 'matte', deployments: [
    { environment: 'production', firstDeployedAt: '2026-08-21T10:00:00Z', sha: '0123456789abcdef0123456789abcdef01234567', url: 'https://ci.test/runs/9' },
    { environment: 'test', firstDeployedAt: '2026-08-19T10:00:00Z', sha: '0123456789abcdef0123456789abcdef01234567', url: 'javascript:alert(1)' },
    { environment: 'Acceptance', firstDeployedAt: '2026-08-20T10:00:00Z', sha: 'fedcba9876543210', url: '' },
  ] });
  const view = cardView(card, { now });
  assert.deepEqual([view.release.released, view.release.days, view.release.dayText, view.finish.key, view.release.finish.label], [true, 41, 'Day 41', 'holo', 'Holo'], "Ploeg's own finish is ignored");
  assert.equal(view.release.next.text, 'Prism in 49 days');
  assert.equal(value(view, 'life', 'Days live').value, '41 days');
  assert.equal(value(view, 'life', 'Release source').value, 'First deploy to production');
  assert.match(value(view, 'life', 'Released').value, /^\d\d-08-2026 \d\d:\d\d · production$/);
  assert.equal(value(view, 'life', 'Finish').value, 'Holo');
  assert.equal(value(view, 'life', 'Next finish').value, 'Prism in 49 days');
  assert.equal(tab(view, 'life').note, '');
  const [deployments] = tab(view, 'life').lists;
  assert.equal(deployments.title, 'Deployments · 3 environments');
  assert.deepEqual(deployments.items.map(item => [item.title, item.tone]), [['test', 'neutral'], ['acceptance', 'neutral'], ['production', 'success']], 'environments in pipeline order, production marked');
  assert.match(deployments.items[2].meta, /^first deployed \d\d-08-2026 \d\d:\d\d · 0123456$/, 'a short sha');
  const front = render(view, helpers('front'));
  assert.match(front, /<span class="day" data-finish="holo" data-source="deploy"[^>]*><b>Day 41<\/b><span class="dot" aria-hidden="true"><\/span><span class="fin">Holo<\/span><\/span>/);
  assert.match(front, /data-finish="holo" data-finish-level="2"/);
  assert.deepEqual([...front.matchAll(/class="fx fx-([a-z]+)"/g)].map(match => match[1]), ['edge', 'spot'], 'one restrained layer per step');
  const back = render(view, helpers('back'));
  assert(back.includes('href="https://ci.test/runs/9"'), 'the production pipeline links out');
  assert(!back.includes('javascript:'), 'an unsafe deployment link is dropped');
  for (const markup of [front, back]) assert(!/\sstyle=/.test(markup), 'no inline style attributes under the CSP');
});

test('every finish draws at most three moving layers, and infinity swaps the lit hairline for the orbit', () => {
  const layersAt = days => [...render(cardView(released(days), { now }), helpers('front')).matchAll(/class="fx fx-([a-z]+)"/g)].map(match => match[1]);
  assert.deepEqual(layersAt(3), []);
  assert.deepEqual(layersAt(7), ['edge']);
  assert.deepEqual(layersAt(30), ['edge', 'spot']);
  assert.deepEqual(layersAt(90), ['edge', 'spot', 'film']);
  assert.deepEqual(layersAt(180), ['edge', 'spot', 'film', 'gild']);
  assert.deepEqual(layersAt(365), ['orbit', 'spot', 'film', 'gild']);
  for (const days of [7, 30, 90, 180, 365]) assert(layersAt(days).filter(name => name !== 'gild').length <= 3, `${days} days`);
  assert.equal(typeof attach(null), 'function', 'lighting a missing face is a no-op');
});

test('a release counted from the merge says so, and a card with nothing released stays matte', () => {
  const merge = cardView(released(9, { release: { at: '2026-09-22T09:00:00Z', source: 'merge', environment: 'production' }, deployments: [] }), { now });
  assert.deepEqual([merge.release.source, merge.finish.key, merge.release.note], ['merge', 'foil', mergeFallback]);
  assert.equal(mergeFallback, 'counted from merge · no deploy signal');
  assert.equal(value(merge, 'life', 'Release source').value, 'Merge · no deploy signal');
  assert.equal(value(merge, 'life', 'Released'), undefined, 'the merge row already gives the time');
  assert.match(tab(merge, 'life').note, /counted from merge · no deploy signal/);
  assert.deepEqual(tab(merge, 'life').lists, []);
  assert.match(render(merge, helpers('front')), /data-source="merge" title="9 days live since the merge \(counted from merge · no deploy signal\)"/);
  const unreleased = cardView({ ...contractCard(), release: null, deployments: [{ environment: 'test', firstDeployedAt: '2026-09-30T10:00:00Z', sha: 'abc', url: '' }] }, { now });
  assert.deepEqual([unreleased.release.released, unreleased.release.reported, unreleased.finish.key], [false, true, 'matte']);
  assert.deepEqual([value(unreleased, 'life', 'Days live').value, value(unreleased, 'life', 'Finish').value], ['Not released', 'Matte until released']);
  assert.equal(tab(unreleased, 'life').lists[0].items[0].title, 'test');
  const waiting = cardView(released(0, { release: null, deployments: [{ environment: 'test', firstDeployedAt: '2026-09-30T10:00:00Z', sha: 'a'.repeat(64), url: 'https://ci.test/runs/3' }] }), { now });
  assert.deepEqual([waiting.release.released, waiting.finish.key, value(waiting, 'life', 'Days live').value], [false, 'matte', notLive], 'a merged card whose project reports deploys waits for production');
  assert.equal(notLive, 'Not live in production yet');
  assert.match(tab(waiting, 'life').note, /reports deploys to production, and none has carried this change yet/);
  assert.match(tab(waiting, 'life').lists[0].items[0].meta, / · aaaaaaa$/, 'a 64-character sha is shortened too');
  assert.doesNotMatch(render(waiting, helpers('front')), /class="day"/, 'no day chip before production');
  const older = cardView({ ...contractCard(), finish: 'infinity' }, { now });
  assert.deepEqual([older.release.reported, older.finish.key, value(older, 'life', 'Days live').value], [false, 'matte', notReported], 'absent fields from an older Ploeg read Not reported and stay matte');
  const broken = cardView({ ...contractCard(), release: { at: 'yesterday', source: 'deploy' } }, { now });
  assert.equal(broken.release.released, false, 'an unreadable release time is not a release');
  for (const entry of [...tab(older, 'life').rows, ...tab(unreleased, 'life').rows]) assert.doesNotMatch(entry.value, /^0 days$/, `${entry.label} invents a zero`);
});

test('the demo shows the finish ladder on illustrative releases, with no spend', () => {
  const finishes = Object.values(ploegDemo.cards).map(card => cardView(card).finish.key);
  for (const key of finishLadder.map(step => step.key)) assert(finishes.includes(key), `the demo shows ${key}`);
  const merged = cardView(ploegDemo.cards['114']);
  assert.deepEqual([merged.release.source, merged.release.note], ['merge', mergeFallback], 'one demo card counts from the merge');
  const holo = Object.values(ploegDemo.cards).find(card => cardView(card).finish.key === 'holo');
  assert.deepEqual(holo.deployments.map(entry => entry.environment), ['test', 'acceptance', 'production']);
  assert(holo.deployments.every(entry => /^[0-9a-f]{40}$/.test(entry.sha) && entry.url.startsWith('https://forge.example.invalid/')));
  assert.equal(holo.release.source, 'deploy');
  for (const card of Object.values(ploegDemo.cards).filter(entry => entry.release)) {
    assert.equal(card.demo, true);
    assert.equal(card.totals.costUsd, undefined);
    assert.equal(card.state, 'merged', 'only a merged card is released');
  }
  for (const id of ['117', '118', '119', '120', '121']) assert.match(ploegDemo.items.find(item => item.id === id).description, /^Illustrative/);
});

test('a running Run shows the live usage so far, and a figure the gateway did not give reads Not reported yet', () => {
  const running = { ...contractCard(), state: 'drafting', plays: [], totals: { authorizedUsd: 2, costStatus: 'reserved', usageComplete: false, runs: 1, failedRuns: 0, rounds: 1, shifts: 1 } };
  const view = cardView({ ...running, live: { runningRuns: 1, observedAt: '2026-10-01T13:32:00Z', runSeconds: 2040, costUsd: 0.27, inputTokens: 10418740, outputTokens: 127480, usageComplete: true } });
  assert.deepEqual([view.cost.value, view.cost.caption, view.cost.status], [usd('0,27'), `so far · of ${usd('2,00')}`, 'live']);
  assert.equal(view.cost.share, 0.135);
  assert.match(view.cost.label, /^Cost so far: US\$.0,27, 14% of US\$.2,00 authorized$/);
  assert.equal(view.tokens.value, `10,4${space}mln. in · 127,5K out`);
  assert.equal(view.tokens.detail, 'So far, while a Run is running');
  assert.deepEqual([view.runTime.value, view.runTime.live], ['34 min', true]);
  assert.equal(value(view, 'economics', 'Cost so far').value, `${usd('0,27')} so far`);
  assert.equal(value(view, 'economics', 'Input tokens').value, '10.418.740');
  assert.equal(value(view, 'agent', 'Run time so far').value, '34 min');

  const unread = cardView({ ...running, live: { runningRuns: 1, observedAt: '2026-10-01T13:32:00Z', runSeconds: 60, usageComplete: false } });
  assert.deepEqual([unread.cost.value, unread.cost.caption, unread.cost.share], ['Not reported yet', `of ${usd('2,00')}`, null]);
  assert.equal(unread.tokens.value, 'Not reported yet');
  assert.equal(unread.runTime.value, '1 min');
  assert.equal(value(unread, 'economics', 'Input tokens').value, 'Not reported yet');

  const settled = cardView({ ...contractCard(), live: null });
  assert.deepEqual([settled.cost.value, settled.runTime.value, settled.runTime.live], [usd('0,58'), '35 min', undefined], 'without a running Run the stored totals stand');
  assert.equal(cardView({ ...running, demo: true, live: { runningRuns: 1, runSeconds: 60, costUsd: 1, usageComplete: true } }).cost.value, 'Demo', 'a demo never shows live spend');
});

test('a grade and a condition from Ploeg reach the view; anything unreadable stays null', () => {
  const graded = cardView({ ...contractCard(), grade: { formula: '2026.1', overall: 8.5, provisional: true, subgrades: { reliability: 10, durability: 8.5, delivery: 9, review: 8 }, label: null, qualifiers: ['HF', 'XX'] }, condition: { state: 'mended', cracks: [{ id: 'c1', bug: { ref: 'VIK-1642', title: 'Lease renewal raced the watcher' }, severity: 'S2', discovery: 'discovered', mended: { at: '2026-09-30T10:00:00Z', by: 'ryan', pr: 68, bySteward: true } }] } });
  assert.deepEqual([graded.grade.text, graded.grade.provisional, graded.grade.summary], ['8,5', true, '8,5 · provisional · HF']);
  assert.deepEqual(graded.grade.subgrades.map(entry => `${entry.short} ${entry.text}`), ['REL 10', 'DUR 8,5', 'DEL 9', 'REV 8']);
  assert.match(graded.grade.description, /^Grade 8,5 of 10, provisional until 180 days live, hotfixed, formula 2026\.1$/);
  assert.equal(value(graded, 'review', 'Grade').value, '8,5 · provisional · HF');
  assert.equal(value(graded, 'grade', 'Formula').value, '2026.1');
  assert.match(tab(graded, 'grade').note, /^Overall = 0\.40 × reliability/, 'the Grade tab prints the formula it knows');
  assert.deepEqual(tab(graded, 'grade').groups[0].rows, [{ label: 'Inputs', value: 'This Ploeg did not send them', status: 'unreported' }], 'a grade without inputs says so instead of inventing them');
  assert.equal(graded.condition.text, 'Mended · VIK-1642, S2 · mended by its steward in #68');
  assert.equal(value(graded, 'life', 'Condition').value, graded.condition.text);
  assert.equal(tab(graded, 'condition').groups[0].title, 'VIK-1642 · Lease renewal raced the watcher');
  assert.match(tab(graded, 'condition').groups[0].rows.find(entry => entry.label === 'Mend').value, /^#68 by the steward · \d\d-09-2026 \d\d:\d\d$/);
  assert.deepEqual(tab(graded, 'condition').groups[0].rows.find(entry => entry.label === 'Weight'), { label: 'Weight', value: 'Not reported', status: 'unreported' }, 'a crack weight Ploeg did not send is not invented');
  assert.equal(cardView({ ...contractCard(), grade: { formula: '2026.1', overall: 8.4, provisional: false } }).grade, null, 'a grade off the half-step scale is not shown');
  assert.equal(cardView({ ...contractCard(), grade: 9 }).grade, null);
  assert.equal(cardView({ ...contractCard(), condition: 'cracked' }).condition, null);
  assert.equal(cardView({ ...contractCard(), condition: { state: 'shattered', cracks: [] } }).condition, null);
  const plain = cardView(contractCard());
  assert.deepEqual([plain.grade, plain.condition, plain.foilPattern], [null, null, null]);
  assert.equal(value(plain, 'life', 'Reverts and linked bugs').value, notCollected);
  assert.equal(value(plain, 'review', 'Grade'), undefined, 'no grade row without a grade');
  assert.deepEqual(plain.style, { skin: 'vloer-native', theme: '' });
  assert.equal(plain.rounds, 1);
});
