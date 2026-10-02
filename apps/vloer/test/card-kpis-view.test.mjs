import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compactDuration, workingDuration } from '../public/core/format.js';
import { calendarLine, changeKpis, clockChoices, clockStorageKey, flowKinds, flowTab, headlineKpis, kpiMeanings, lifeKpis, reviewKpis, timePair } from '../public/cards/card-kpis.js';
import { cardView } from '../public/cards/card-model.js';
import { clockText, kpiStrip } from '../public/cards/skin-kit.js';
import { render as nativeRender } from '../public/cards/skins/vloer-native/skin.js';
import { render as holoRender } from '../public/cards/skins/holo/skin.js';
import { render as lootRender } from '../public/cards/skins/loot/skin.js';
import { render as arcadeRender } from '../public/cards/skins/arcade/skin.js';
import { render as tickerRender } from '../public/cards/skins/ticker/skin.js';
import { render as patchRender } from '../public/cards/skins/patch/skin.js';
import { faceFacts } from '../public/cards/skins/forge/forge-model.js';
import { ploegDemo } from '../src/ploeg-demo.ts';

const now = Date.parse('2026-10-02T12:00:00Z');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const h = face => ({ face, escape, icon: name => `<svg data-icon="${name}"></svg>`, link: value => /^https?:\/\//.test(value) ? value : '' });
const span = (seconds, working, extra = {}) => ({ from: '2026-09-20T09:00:00Z', to: '2026-09-28T15:00:00Z', seconds, workingSeconds: working, running: false, start: 'tracker_created', end: 'release', ...extra });
const status = (name, kind, seconds, working, extra = {}) => ({ status: name, gate: null, kind, visits: 1, seconds, workingSeconds: working, observed: false, current: false, ...extra });
const calendar = { timezone: 'Europe/Amsterdam', days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '09:00', end: '17:00', holidays: 0 };
const flow = (extra = {}) => ({
  statuses: [status('Backlog', 'waiting', 172800, 28800), status('Doing', 'active', 190800, 57600), status('Blocked', 'blocked', 86400, 28800), status('Done', 'done', 900000, 200000, { current: true })], statusesSince: '2026-09-20T09:00:00Z', truncated: false, gates: {}, kinds: {},
  leadTime: span(712800, 165600), cycleTime: span(450000, 100800, { start: 'first_active' }), timeToStart: span(172800, 28800, { end: 'first_active' }),
  efficiency: 0.4125, blockedSeconds: 86400, blockedWorkingSeconds: 28800, reopens: 0, queueSeconds: 300, queueWorkingSeconds: 0, agentSeconds: 2100, runs: 3,
  firstRunToFirstPlaySeconds: 1800, firstRunToFirstPlayWorkingSeconds: 1800, mergeTo: { test: 1800, production: 172800 }, mergeToWorking: { test: 1800, production: 28800 }, environmentsReached: ['test', 'production'],
  timeToProduction: { environment: 'production', seconds: 172800, workingSeconds: 28800 }, restores: [], meanRestoreSeconds: null, meanRestoreWorkingSeconds: null,
  estimateSeconds: null, calendar, notCollected: ['estimate', 'holidays'], ...extra,
});
const timeline = (extra = {}) => ({ openedAt: '2026-10-02T08:00:00Z', readyAt: '2026-10-02T09:00:00Z', firstFeedbackAt: '2026-10-02T09:42:00Z', firstApprovalAt: '2026-10-02T11:00:00Z', lastApprovalAt: '2026-10-02T11:00:00Z', mergedAt: null, toFirstFeedbackSeconds: 2520, toFirstApprovalSeconds: 7200, approvalToMergeSeconds: null, openToMergeSeconds: null, reviewRounds: 1, comments: 3, reviewers: 1, responseSeconds: null, commits: 4, firstCommitAt: '2026-10-02T06:00:00Z', forcePushes: 1, codingSeconds: 10800, truncated: false, capturedAt: '2026-10-02T11:30:00Z', ...extra });
const ci = (extra = {}) => ({ runs: 3, failedRuns: 1, reruns: 2, lastGreenSeconds: 312, queueSeconds: 140, timeToGreenSeconds: 3600, minutes: 21.46, slowest: [{ name: 'e2e', seconds: 280 }], firstPassGreen: false, source: 'actions', truncated: false, capturedAt: '2026-10-02T11:30:00Z', ...extra });
const shape = { complexity: { method: 'indentation/2026.1', added: 38, removed: 17, net: 21, maxDepth: 5, hotspots: [{ path: 'src/<a>.ts', added: 22 }] }, files: 4, countedLines: 120, testLines: 30, testRatio: 0.333, docsTouched: 1, languages: [{ name: 'TypeScript', lines: 100 }, { name: 'Markdown', lines: 20 }], truncated: false, capturedAt: '2026-10-02T12:00:00Z' };
const card = (extra = {}) => ({ workItemId: '7', title: 'Rotate merchant keys', team: 'delivery', state: 'merged', plays: [], totals: { costStatus: 'not_reported' }, events: [], ...extra });

test('durations are compact and human, working time is in hours, and unknown stays empty', () => {
  assert.deepEqual([compactDuration(45), compactDuration(2520), compactDuration(11400), compactDuration(10800), compactDuration(187200), compactDuration(172800), compactDuration(12 * 86400 + 7200), compactDuration(1234 * 86400)], ['45 s', '42 min', '3 h 10 min', '3 h', '2 d 4 h', '2 d', '12 d', '1.234 d']);
  assert.deepEqual([workingDuration(0), workingDuration(2520), workingDuration(11400), workingDuration(93600), workingDuration(1240 * 3600)], ['0 h', '42 min', '3 h 10 min', '26 h', '1.240 h'], 'working time is never written in days and is grouped in nl-NL');
  for (const unknown of [null, undefined, Number.NaN, '3']) { assert.equal(compactDuration(unknown), ''); assert.equal(workingDuration(unknown), ''); }
  assert.deepEqual(timePair(187200, 57600), { seconds: 187200, working: 57600, text: '2 d 4 h', workingText: '16 h' });
  assert.deepEqual(timePair(600), { seconds: 600, working: null, text: '10 min', workingText: '' }, 'a figure without working time has no twin');
  assert.equal(timePair(null), null);
});

test('the team calendar reads as one line with a day range', () => {
  assert.equal(calendarLine(calendar), 'Working hours: Mon–Fri 09:00–17:00 Europe/Amsterdam');
  assert.equal(calendarLine({ ...calendar, days: ['mon', 'wed', 'fri'], holidays: 3 }), 'Working hours: Mon, Wed, Fri 09:00–17:00 Europe/Amsterdam, 3 holidays off');
  assert.equal(calendarLine(null), '');
  assert.deepEqual(clockChoices.map(choice => choice.key), ['calendar', 'working']);
  assert.equal(clockStorageKey, 'vloer.cards.clock');
});

test('the front leads with the figures that tell the most for each state', () => {
  const labels = entries => entries.map(entry => entry.label);
  const merged = headlineKpis(card({ flow: flow(), pipeline: { toFirstFeedbackSeconds: 2520 }, shape, plays: [{ number: 3, state: 'merged', ciTiming: ci() }] }), { now });
  assert.deepEqual(labels(merged), ['Lead time', 'First feedback', 'CI', 'To production'], 'merged and released: lead time, first feedback, CI and time to production');
  assert.deepEqual(merged.map(entry => [entry.value, entry.working]), [['8 d 6 h', '46 h'], ['42 min', ''], ['5 min', ''], ['2 d', '8 h']]);
  assert.deepEqual([merged[2].detail, merged[2].tone], ['2 reruns', 'attention'], 'reruns are a flakiness hint');
  const notLive = headlineKpis(card({ flow: flow({ timeToProduction: null }), shape, plays: [{ number: 3, state: 'merged', ciTiming: ci({ reruns: 0, firstPassGreen: true }) }] }), { now });
  assert.deepEqual(labels(notLive), ['Lead time', 'CI', 'Complexity'], 'merged but not live: complexity takes the last place');
  assert.deepEqual([notLive[1].detail, notLive[1].tone, notLive[2].value, notLive[2].detail], ['green first time', 'success', '+38', 'net +21 · depth 5']);
  const review = headlineKpis(card({ state: 'in_review', flow: flow({ cycleTime: span(9000, 3600, { running: true, end: 'now' }), leadTime: span(99000, 9000, { running: true, end: 'now' }) }), plays: [{ number: 5, state: 'open', timeline: timeline({ firstFeedbackAt: null, toFirstFeedbackSeconds: null }), ciTiming: ci() }] }), { now });
  assert.deepEqual(labels(review), ['First feedback', 'CI', 'Cycle time', 'Blocked'], 'in review: first feedback, CI, then cycle time so far');
  assert.deepEqual([review[0].value, review[0].live, review[0].tone], ['waiting 3 h', true, 'neutral'], 'nobody responded yet: it waits, live, and is never coloured');
  assert.equal(review[2].detail, 'so far');
  const drafting = headlineKpis(card({ state: 'drafting', flow: flow({ leadTime: span(99000, 9000, { running: true }), cycleTime: null, timeToStart: span(99000, 9000, { running: true, end: 'now' }), blockedSeconds: 0, estimateSeconds: 7200 }) }), { now });
  assert.deepEqual(labels(drafting), ['Time to start', 'Lead time', 'Estimate']);
  assert.deepEqual([drafting[0].detail, drafting[2].value], ['waiting to start', '2 h']);
  assert.deepEqual(headlineKpis(card({ plays: [{ number: 3, state: 'merged', reviews: [] }] }), { now }), [], 'an older Ploeg’s card has no headline figures');
  for (const entry of [...merged, ...review, ...drafting]) assert(entry.meaning.length > 20, `${entry.label} says what it means`);
});

test('the Flow tab draws a bar and a table of time per status, tiles with meanings, the clock toggle and what is not collected', () => {
  const tab = flowTab(card({ flow: flow() }));
  assert.match(tab.lead, /^Delivered in 8 d 6 h from ticket to release; 41% of the cycle was active work\.$/);
  const types = tab.blocks.map(block => block.type);
  assert.deepEqual(types, ['clock', 'stats', 'bar', 'table', 'glossary']);
  assert.equal(tab.blocks[0].calendar, 'Working hours: Mon–Fri 09:00–17:00 Europe/Amsterdam');
  const tiles = Object.fromEntries(tab.blocks[1].items.map(entry => [entry.label, entry]));
  assert.deepEqual(Object.keys(tiles), ['Lead time', 'Cycle time', 'Time to start', 'Flow efficiency', 'Blocked', 'Reopens', 'Queue to first Run', 'Agent time']);
  assert.deepEqual([tiles['Flow efficiency'].value, tiles.Blocked.value, tiles.Blocked.working, tiles.Blocked.tone, tiles['Agent time'].working, tiles.Reopens.value], ['41%', '1 d', '8 h', 'attention', '', '0']);
  assert.match(tiles['Lead time'].meaning, /This card: from the tracker’s creation to the release\.$/);
  const bar = tab.blocks[2];
  assert.deepEqual(bar.segments.map(entry => entry.status), ['Backlog', 'Doing', 'Blocked'], 'the current done status runs on forever and is listed, not drawn');
  assert.equal(Math.round(bar.segments.reduce((sum, entry) => sum + entry.share, 0) * 1000), 1000);
  assert.match(bar.note, /^Done since it closed is in the table/);
  assert.deepEqual(bar.kinds.map(kind => kind.key), ['active', 'waiting', 'blocked'], 'the legend follows the kind order');
  assert.deepEqual(tab.blocks[3].rows.map(entry => [entry.cells.status, entry.cells.kind, entry.cells.calendar, entry.cells.working, entry.current]), [['Backlog', 'Waiting', '2 d', '8 h', false], ['Doing', 'Active', '2 d 5 h', '16 h', false], ['Blocked', 'Blocked', '1 d', '8 h', false], ['Done', 'Done', '10 d', '55 h', true]]);
  assert.deepEqual(tab.groups.find(group => group.title === 'Not collected').rows.map(entry => [entry.label, entry.status]), [['Estimate', 'uncollected'], ['Holidays', 'uncollected']]);
  assert.match(tab.note, /not about people/);
  const estimate = flowTab(card({ flow: flow({ estimateSeconds: 28800 }) })).blocks[1].items.at(-1);
  assert.deepEqual([estimate.label, estimate.value, estimate.detail], ['Estimate', '8 h', 'actual 28 h']);
  assert.deepEqual(flowKinds.map(kind => kind.key), ['active', 'waiting', 'blocked', 'done']);
  assert.match(flowTab(card()).rows[0].value, /does not send flow/);
  assert.match(flowTab(card({ flow: null })).rows[0].value, /Not reported/);
});

test('Review & CI, Change and Life gain the pull request, CI and change-shape figures; an older card keeps its rows', () => {
  const data = card({ pipeline: { plays: 2, toFirstFeedbackSeconds: 2520, openToMergeSeconds: 15000, reviewRounds: 3, comments: 6, firstPassGreen: false, median: { toFirstFeedbackSeconds: 2000, openToMergeSeconds: 14000, responseSeconds: null, lastGreenSeconds: 300 }, ci: { runs: 6, failedRuns: 1, reruns: 2, minutes: 30.24, queueSeconds: 200 } }, shape: { ...shape, plays: 1, complete: true }, flow: flow({ restores: [{ crackId: '7', confirmedAt: '2026-09-25T10:00:00Z', mendedAt: '2026-09-26T10:00:00Z', seconds: 86400, workingSeconds: 28800 }], meanRestoreSeconds: 86400, meanRestoreWorkingSeconds: 28800 }), plays: [{ number: 2, state: 'closed', timeline: timeline({ readyAt: null }) }, { number: 3, state: 'merged', mergedAt: '2026-10-02T12:00:00Z', timeline: timeline({ mergedAt: '2026-10-02T12:00:00Z', openToMergeSeconds: 14400 }), ciTiming: ci() }] });
  const review = reviewKpis(data, { now });
  assert.deepEqual(review.blocks[0].items.map(entry => [entry.label, entry.value]), [['First feedback', '42 min'], ['Open → merge', '4 h 10 min'], ['Review rounds', '3'], ['CI minutes', '30,2 min'], ['Reruns', '2'], ['First-pass green', 'No']]);
  assert.equal(review.groups[0].title, 'Medians over 2 plays');
  assert.deepEqual(review.groups.map(group => group.title).slice(1), ['#3 · Merged · review', '#3 · Merged · CI', '#2 · Closed unmerged · review'], 'newest play first');
  assert.deepEqual(review.groups[1].blocks[0].items.map(step => [step.label, step.gap]), [['Opened', ''], ['Ready for review', '+1 h'], ['First feedback', '+42 min'], ['First approval', '+1 h 18 min'], ['Merged', '+1 h']]);
  const ciRows = Object.fromEntries(review.groups[2].rows.map(entry => [entry.label, entry]));
  assert.deepEqual([ciRows.Reruns.value, ciRows.Reruns.tone, ciRows['CI minutes'].value, ciRows['Read from'].value, ciRows['First-pass green'].value], ['2', 'attention', '21,5 min', 'Forgejo Actions', 'No']);
  assert.deepEqual(review.lists[0].items.map(item => [item.title, item.meta]), [['e2e', '4 min']]);
  const view = cardView(data, { now });
  const reviewTab = view.tabs.find(tab => tab.id === 'review');
  assert(!reviewTab.rows.some(entry => entry.status === 'uncollected'), 'CI duration and review rounds are collected now');
  const change = changeKpis(data);
  assert.deepEqual(change.blocks[0].items.map(entry => [entry.label, entry.value, entry.detail]), [['Complexity added', '+38', '−17 removed · net +21'], ['Deepest nesting', '5', 'levels'], ['Test ratio', '33%', '30 test lines'], ['Docs touched', '1', 'file']]);
  assert.deepEqual(Object.fromEntries(change.rows.map(entry => [entry.label, entry.value])), { Languages: 'TypeScript 100 · Markdown 20', 'Counted lines': '120', 'Complexity method': 'indentation/2026.1', Commits: '8', 'Coding time': '3 h', 'Force pushes': '2' });
  assert.match(change.note, /indented/);
  const life = lifeKpis(data);
  assert.deepEqual(life.rows.map(entry => [entry.label, entry.value, entry.working ?? '']), [['Merge → test', '30 min', '30 min'], ['Merge → production', '2 d', '8 h'], ['Time to production', '2 d', '8 h'], ['Mean restore time', '1 d', '8 h']]);
  assert.equal(life.lists[0].title, 'Restores · 1 crack');
  const older = cardView(card({ state: 'in_review', plays: [{ number: 3, state: 'open', reviews: [] }] }), { now });
  assert.deepEqual(older.tabs.find(tab => tab.id === 'review').rows.filter(entry => entry.status === 'uncollected').map(entry => entry.label), ['CI duration', 'Review rounds by people']);
  assert.deepEqual(older.tabs.find(tab => tab.id === 'change').rows.filter(entry => entry.status === 'uncollected').map(entry => entry.label), ['Languages', 'Test and code lines']);
  assert.deepEqual(older.kpis.headline, []);
});

test('the skin kit prints the strip and clock pairs escaped, and the shared back draws every block without inline styles', () => {
  const hostile = card({ title: '<img src=x>', flow: flow({ statuses: [status('<script>x</script>', 'active', 3600, 3600)] }), shape: { ...shape, plays: 1, complete: true }, plays: [{ number: 3, state: 'merged', mergedAt: '2026-10-02T12:00:00Z', timeline: timeline(), ciTiming: ci({ slowest: [{ name: '"><b>', seconds: 9 }] }) }] });
  const view = cardView(hostile, { now });
  assert.equal(clockText('2 d', '16 h', h('front')), '<span data-clock-value="calendar">2 d</span><span data-clock-value="working">16 h<span class="sr-only"> in working hours</span></span>');
  assert.equal(clockText('<b>', '', h('front')), '&lt;b&gt;');
  const strip = kpiStrip(view, h('front'));
  assert.match(strip, /^<ul class="uc-kpis" aria-label="Key figures" data-count="4">/);
  assert.match(strip, /data-kpi="leadTime" data-tone="neutral" title="From the ticket’s creation/);
  assert.match(strip, /<span class="uc-kpi-long">Lead time<\/span><span class="uc-kpi-short" aria-hidden="true">Lead<\/span>/);
  assert.equal(kpiStrip(cardView(card(), { now }), h('front')), '', 'no strip without figures');
  assert.equal((kpiStrip(view, h('front'), { max: 2 }).match(/<li /g) || []).length, 2);
  const back = nativeRender(view, h('back'));
  assert.match(back, /data-card-panel="flow"/);
  assert.match(back, /<button type="button" class="kp-choice" data-card-action="clock" data-clock-choice="working" aria-pressed="false">Working hours<\/button>/);
  assert.match(back, /<svg viewBox="0 0 1000 24" preserveAspectRatio="none" role="img" aria-label="Time per status: /);
  assert.match(back, /<table class="kp-table"><caption class="sr-only">Time per status<\/caption>/);
  assert.match(back, /<ol class="kp-steps" aria-label="Pull request #3 from opened to merged">/);
  assert.match(back, /<details class="kp-glossary"><summary>What these figures mean<\/summary>/);
  assert.match(back, /&lt;script&gt;x&lt;\/script&gt;/);
  assert(!back.includes('<script>') && !back.includes('<img'), 'every value is escaped');
  assert(back.includes('&quot;&gt;&lt;b&gt;'), 'a hostile job name is escaped');
  assert(!/\sstyle=/.test(back + strip), 'no inline styles under the CSP');
  const front = nativeRender(view, h('front'));
  assert.match(front, /<ul class="uc-kpis"/, 'Vloer Native prints the strip on its front');
});

test('the forge paints the headline figures on its face, and every demo card in a state with figures has them', () => {
  const facts = faceFacts(cardView(ploegDemo.cards['123'], { now }));
  assert.deepEqual(facts.kpis.map(entry => entry.label), ['Lead time', 'First feedback', 'CI', 'To production']);
  assert.equal(facts.kpis[2].tone, 'attention', 'its reruns show');
  for (const id of ['105', '109', '113', '114', '117', '121', '134', '136', '138', '140', '142']) assert(cardView(ploegDemo.cards[id]).kpis.headline.length >= 3, `#${id} leads with three or four figures`);
  for (const key of ['leadTime', 'firstFeedback', 'reruns', 'complexity', 'efficiency']) assert.equal(typeof kpiMeanings[key], 'string');
});

test('every DOM skin prints the headline strip in its own place, and none prints it without figures', () => {
  const skins = { holo: [holoRender, '134'], loot: [lootRender, '136'], arcade: [arcadeRender, '138'], ticker: [tickerRender, '140'], patch: [patchRender, '142'] };
  for (const [name, [draw, id]] of Object.entries(skins)) {
    const view = cardView(ploegDemo.cards[id]);
    const front = draw(view, h('front'));
    assert.equal((front.match(/<ul class="uc-kpis"/g) || []).length, 1, `${name} prints one strip`);
    assert.match(front, /data-kpi="leadTime"/, `${name} leads with lead time on a released card`);
    assert.doesNotMatch(draw(cardView(card({ style: { skin: name } }), { now }), h('front')), /uc-kpis/, `${name} without figures prints no strip`);
  }
});
