import assert from 'node:assert/strict';
import { test } from 'node:test';
import { candidateSteps, crackSteps, stepDialogMarkup, stepOutcome, stepRequest, traceMarkup, traceRules } from '../public/core/attribution.js';
import { cardView } from '../public/cards/card-model.js';
import { render as nativeRender } from '../public/cards/skins/unfold-native/skin.js';
import { faceFacts } from '../public/cards/skins/forge/forge-model.js';
import { skinHelpers } from '../public/cards/unfold-card.js';
import { ploegDemo } from '../src/ploeg-demo.ts';

const now = Date.parse('2026-10-01T12:00:00Z');
const item = (id, title) => ({ workItemId: id, title, externalRef: `VIK-${id}` });
const crack = extra => ({ id: '7', team: 'delivery', state: 'proposed', card: item('118', 'Validate postcodes'), bug: item('124', 'Postcode with a space'), play: 11, severity: 'S3', share: 'primary', discovery: 'discovered', steward: 'stew', note: null, proposedBy: 'fixer', proposedAt: '2026-09-29T10:00:00Z', confirmedBy: [], confirmedAt: null, disputeUntil: null, disputed: false, disputedBy: null, disputedAt: null, disputeReason: null, resolvedBy: null, resolvedAt: null, resolution: null, evolvedBy: null, evolvedAt: null, mended: null, ...extra });
const viewer = login => ({ login, canAct: true, reason: '' });
const candidate = extra => ({ card: item('120', 'Audit log on refund'), play: 15, repo: 'example/order-service', mergedAt: '2026-03-01T10:00:00Z', mergedBy: 'merger', sharedFiles: 1, share: 1 / 3, files: ['src/orders/errors.js'], reverted: false, attribution: null, ...extra });

test('the page offers each attribution step only to the people Ploeg allows, and says why not', () => {
  const pending = crack();
  assert.equal(crackSteps(pending, viewer('other'), { now }).confirm.allowed, true, 'a second person confirms');
  assert.match(crackSteps(pending, viewer('STEW'), { now }).confirm.why, /steward, so someone else confirms/, 'the steward never confirms, whatever the case of the login');
  assert.match(crackSteps(pending, viewer('fixer'), { now }).confirm.why, /proposed it, so a second person confirms/);
  assert.equal(crackSteps(pending, viewer('stew'), { now }).evolved.allowed, false, 'the steward does not decide their own card evolved');
  assert.equal(crackSteps(pending, viewer('other'), { now }).evolved.allowed, true);
  const confirmed = crack({ state: 'confirmed', confirmedBy: ['fixer', 'second'], confirmedAt: '2026-09-30T10:00:00Z', disputeUntil: '2026-10-07T10:00:00Z' });
  assert.equal(crackSteps(confirmed, viewer('stew'), { now }).dispute.allowed, true, 'the steward disputes within five working days');
  assert.equal(crackSteps(confirmed, viewer('other'), { now }).dispute.allowed, false, 'only the steward disputes');
  assert.match(crackSteps(confirmed, viewer('stew'), { now: Date.parse('2026-10-08T10:00:00Z') }).dispute.why, /five working days/);
  assert.equal(crackSteps({ ...confirmed, resolution: 'upheld' }, viewer('stew'), { now }).dispute.allowed, false, 'a referee’s decision is final');
  const disputed = crack({ state: 'disputed', confirmedBy: ['fixer', 'second'], disputedBy: 'stew' });
  for (const involved of ['stew', 'fixer', 'second']) assert.match(crackSteps(disputed, viewer(involved), { now }).resolve.why, /took part/, `${involved} cannot referee`);
  assert.equal(crackSteps(disputed, viewer('referee'), { now }).resolve.allowed, true);
  const reader = crackSteps(pending, { login: null, canAct: false, reason: 'Your account has no forge login yet.' }, { now });
  assert.deepEqual(Object.values(reader).map(step => step.allowed), [false, false, false, false]);
  assert.equal(reader.confirm.why, 'Your account has no forge login yet.');
  for (const state of ['unlinked', 'evolved']) assert(Object.values(crackSteps(crack({ state }), viewer('other'), { now })).every(step => !step.allowed), `${state} takes no step`);
});

test('a candidate can be proposed until the bug has three open attributions, and its merger is warned that it self-reports', () => {
  assert.deepEqual([candidateSteps(candidate(), viewer('other'), 0).propose.allowed, candidateSteps(candidate(), viewer('other'), 0).self], [true, false]);
  assert.match(candidateSteps(candidate(), viewer('other'), 3).propose.why, /at most 3 cards/);
  assert.equal(candidateSteps(candidate({ attribution: 'proposed' }), viewer('other'), 1).propose.allowed, false, 'an attributed card is not proposed twice');
  const merger = candidateSteps(candidate(), viewer('MERGER'), 0);
  assert.deepEqual([merger.propose.allowed, merger.self, merger.evolved.allowed], [true, true, false]);
});

test('Trace this bug lists candidates and attributions with the steps the viewer may take, and states the rules', () => {
  const trace = { workItemId: '124', demo: false, viewer: viewer('other'), cracks: [crack({ note: '<img src=x onerror=alert(1)>' }), crack({ id: '8', state: 'confirmed', card: item('121', '404s'), confirmedBy: ['fixer', 'second'], confirmedAt: '2026-09-30T10:00:00Z', disputeUntil: '2026-10-07T10:00:00Z' })], candidates: { bug: item('124', 'Postcode with a space'), fixFiles: 3, fixFilesTruncated: false, since: '2025-09-25T10:00:00Z', until: '2026-09-25T10:00:00Z', candidates: [candidate({ card: item('118', 'Validate postcodes'), attribution: 'proposed' }), candidate()] } };
  const html = traceMarkup(trace, { now });
  assert.match(html, /<h3 class="card-title" id="work-trace-title">.*Trace this bug<\/h3>/);
  assert.match(html, /A crack is an inquiry, not a verdict\./);
  for (const rule of traceRules) assert(html.includes(rule.replaceAll('’', '’')), `the rules say: ${rule.slice(0, 40)}`);
  assert.match(html, /Two people confirm/);
  assert.match(html, /within five working days/);
  assert.equal((html.match(/data-action="trace-confirm"/g) || []).length, 1, 'only the proposed crack can be confirmed');
  assert.equal((html.match(/data-action="trace-dispute"/g) || []).length, 0, 'someone who is not the steward cannot dispute');
  assert.equal((html.match(/data-action="trace-propose"/g) || []).length, 1, 'only the unattributed candidate can be proposed');
  assert.match(html, /1 file of 3 the fix touched \(33%\)/);
  assert.match(html, /The steward <span class="trace-person">stew<\/span> can dispute until/);
  assert(!html.includes('<img src=x'), 'notes are escaped');
  assert(!/style="/.test(html), 'no inline styles under the CSP');
  const steward = traceMarkup({ ...trace, viewer: viewer('stew') }, { now });
  assert.equal((steward.match(/data-action="trace-dispute"/g) || []).length, 1, 'the steward may dispute the confirmed crack');
  assert.equal((steward.match(/data-action="trace-confirm"/g) || []).length, 0);
  const reader = traceMarkup({ ...trace, viewer: { login: null, canAct: false, reason: 'Your account has no forge login yet.' } }, { now });
  assert.equal((reader.match(/data-action="trace-/g) || []).length, 0, 'someone who may not act gets no step buttons');
  assert.match(reader, /You can read this, not act on it/);
  assert.match(traceMarkup({ ...trace, demo: true }, { now }), /The actions check Ploeg’s rules and record nothing/);
  assert.equal(traceMarkup({ ...trace, cracks: [], candidates: { ...trace.candidates, candidates: [] } }, { now }), '', 'a Work Item with nothing to trace shows no panel');
  const card = traceMarkup({ ...trace, workItemId: '118', candidates: null, cracks: [crack({ state: 'confirmed', confirmedBy: ['fixer', 'second'], disputeUntil: '2026-10-07T10:00:00Z' })], viewer: viewer('stew') }, { now });
  assert.match(card, /Bugs traced to this Work Item/);
  assert.match(card, /data-action="trace-dispute"/, 'the steward can dispute from their own card’s page');
});

test('step dialogs ask for what Ploeg needs, check it before sending, and the outcome says when nothing was recorded', () => {
  const bug = { workItemId: '124', title: 'Postcode with a space' };
  const propose = stepDialogMarkup('propose', candidate({ mergedBy: 'me' }), { bug, viewer: viewer('me'), demo: true });
  assert.match(propose, /data-form="trace-step" data-step="propose" data-id="120" data-bug="124"/);
  for (const name of ['severity', 'share', 'discovery', 'note', 'play']) assert.match(propose, new RegExp(`name="${name}"`), `asks for ${name}`);
  assert.match(propose, /records the proposal as self-reported/);
  assert.match(propose, /Demo: this checks Ploeg’s rules and records nothing/);
  assert.match(stepDialogMarkup('dispute', crack({ state: 'confirmed' }), { bug }), /name="reason"[^>]*required/);
  assert.match(stepDialogMarkup('resolve', crack({ state: 'disputed', disputeReason: 'Not mine' }), { bug }), /If your team names referees, only they can resolve/);
  assert.match(stepDialogMarkup('evolved', { card: '121', bug: '124', title: '404s' }, { bug }), /marked evolved and gets no crack/);
  assert.deepEqual(stepRequest('propose', { play: '15', note: '' }).errors, { severity: 'Choose a severity.', share: 'Choose primary or contributing.' });
  assert.deepEqual(stepRequest('propose', { severity: 'S2', share: 'primary', discovery: 'discovered', play: '15', note: ' Pattern. ' }).body, { severity: 'S2', share: 'primary', discovery: 'discovered', play: 15, note: 'Pattern.' });
  assert.deepEqual(stepRequest('confirm', { severity: '', share: '' }).body, {}, 'keeping severity and share sends neither');
  assert.equal(stepRequest('dispute', { reason: '  ' }).errors.reason, 'Say why the bug did not come from this card.');
  assert.equal(stepRequest('resolve', {}).errors.resolution, 'Choose uphold or unlink.');
  const result = { crack: crack({ state: 'confirmed' }), demo: true, message: 'Demo: Ploeg recorded nothing.' };
  assert.deepEqual(stepOutcome('confirm', result), { tone: 'neutral', title: 'Demo · nothing recorded', text: 'Ploeg would now record the attribution Validate postcodes → Postcode with a space as confirmed. Demo: Ploeg recorded nothing.' });
  assert.equal(stepOutcome('resolve', { ...result, demo: false, crack: crack({ state: 'confirmed', resolution: 'upheld' }) }).title, 'Attribution upheld and confirmed again');
});

test('a card shows its gates strip, right first time, crack, evolved and set on the front, and the forge paints gates and the set', () => {
  const bounced = cardView(ploegDemo.cards['118'], { now: Date.now() });
  assert.deepEqual(bounced.gates.steps.map(step => [step.key, step.state, step.bounces.length]), [['development', 'passed', 0], ['test', 'passed', 1], ['acceptance', 'passed', 0], ['done', 'current', 0]]);
  assert.deepEqual([bounced.gates.rightFirstTime.state, bounced.gates.rightFirstTime.text], ['no', '1 bounce back']);
  assert.deepEqual([bounced.condition.chip, bounced.set.chip, bounced.set.symbol], ['Cracked · S3', '2/5 · Checkout and confirmation hardening', '2/5']);
  const front = nativeRender(bounced, { face: 'front', ...skinHelpers });
  assert.match(front, /<ol class="gs" aria-label="Gates: now in done, 1 bounce back">/);
  assert.match(front, /<li data-gate="done" data-state="current" aria-current="step">/);
  assert.match(front, /<span class="gb" data-counts="true" title="1 back from test: defect \(demo-tester\)">/);
  assert.match(front, /data-slot="condition" data-condition="cracked" data-tone="danger"/);
  assert.match(front, /data-slot="set"/);
  assert(!/style="/.test(front));
  const evolved = cardView(ploegDemo.cards['119']);
  assert.equal(evolved.evolved, true);
  assert.match(nativeRender(evolved, { face: 'front', ...skinHelpers }), /data-slot="evolved"/);
  assert.equal(evolved.gates.rightFirstTime.text, 'Right first time', 'a requirement bounce does not count against right first time');
  const epic = cardView(ploegDemo.cards['125']);
  assert.deepEqual([epic.set.role, epic.set.chip, epic.set.settled, epic.set.complete], ['epic', 'Epic · 5 cards', 3, false]);
  const back = nativeRender(epic, { face: 'back', ...skinHelpers });
  assert.match(back, /<ol class="items grid">/, 'the epic lists its children as a grid');
  const facts = faceFacts(bounced);
  assert.deepEqual(facts.rows.at(-1), ['Gates', 'Done · 1 back']);
  assert.deepEqual(facts.set, { symbol: '2/5', text: '2/5 of Checkout and confirmation hardening', complete: false });
  assert.deepEqual(faceFacts(cardView(ploegDemo.cards['117'])).rows.map(([label]) => label), ['Plays', 'Diff', 'Live', 'Gates'], 'a card with headline KPIs leaves crew and run time to the text facts and the back');
  assert.deepEqual(faceFacts(cardView(ploegDemo.cards['117'])).kpis.map(entry => entry.label), ['Lead time', 'First feedback', 'CI', 'To production']);
});
