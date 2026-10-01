import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ceremonyCapMs, momentTier, quieter, tierSpecs, tiers } from '../public/cards/effects/tiers.js';
import { ceremonyTimeline, createFlashGuard, flashLimit, flashSafe, flashTones, momentLooks, palettes, peakFlashes, saturatedRed } from '../public/cards/effects/timeline.js';
import { createDirector, directorRules, resolveMotion } from '../public/cards/effects/director.js';
import { cardBefore, cardMoments, cardNews, cardSnapshot, ceremonyKinds, momentHeadline } from '../public/cards/effects/moments.js';
import { createSeenGate } from '../public/cards/effects/seen.js';
import { createTimeScale, timeLimits } from '../public/cards/effects/time.js';
import { Particles } from '../public/cards/effects/particles.js';
import { createSoundPlayer, registerSoundBank, soundBankFor, soundBankIds } from '../public/cards/effects/sound.js';
import { cardAsOf, momentText } from '../public/cards/collection-model.js';
import { prefDefaults, validPref } from '../public/core/prefs.js';
import { cardMoments as serverMoments } from '../src/packs.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';

const kinds = ['minted', 'merged', 'released', 'finish', 'cracked', 'mended', 'graded', 'set'];
const moment = (kind, detail = {}, at = '2026-10-01T10:00:00Z') => ({ workItemId: '114', kind, at, detail });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: ms => { now += ms; }, set: ms => { now = ms; } };
}

function recordingStage(time, { auto = true } = {}) {
  const played = [];
  const pending = [];
  return {
    played,
    pending,
    counts: [],
    play(ticket, timeline) {
      played.push({ ticket, timeline, at: time.now() });
      if (auto) return Promise.resolve();
      return new Promise(resolve => pending.push(resolve));
    },
    skip(ticket) { ticket.skippedByStage = true; pending.shift()?.(); },
    count(ticket, count) { this.counts.push([ticket.id, count]); },
  };
}

test('a moment’s tier comes from its kind and facts, never from rarity or who did it', () => {
  assert.equal(momentTier(moment('merged')), 'major');
  assert.equal(momentTier(moment('released')), 'major');
  assert.equal(momentTier(moment('finish', { from: 'matte', to: 'foil' })), 'epic');
  assert.equal(momentTier(moment('finish', { from: 'prism', to: 'gilded' })), 'epic');
  assert.equal(momentTier(moment('finish', { from: 'gilded', to: 'infinity' })), 'legendary', 'the year-long step is the one legendary finish');
  assert.equal(momentTier(moment('cracked', { severity: 'S1' })), 'major', 'a crack informs; it does not punish');
  assert.equal(momentTier(moment('mended')), 'epic', 'the mend is bigger than the crack, so the arc ends on the repair');
  assert.equal(tierSpecs[momentTier(moment('mended'))].rank > tierSpecs[momentTier(moment('cracked'))].rank, true);
  assert.equal(momentTier(moment('graded', { to: 8 })), 'major');
  assert.equal(momentTier(moment('graded', { from: 9, to: 8.5 })), 'minor', 'a lower grade is news, quietly');
  assert.equal(momentTier(moment('set', { size: 5 })), 'legendary');
  assert.equal(momentTier(moment('minted')), 'minor');
  assert.equal(momentTier({ kind: 'merged', detail: { rarity: 'legendary', person: 'ryan' } }), 'major', 'rarity and people do not move the tier');
  assert.equal(momentTier({ kind: 'something-new' }), 'minor');
  assert.deepEqual(tiers.map(quieter), ['minor', 'minor', 'major', 'epic']);
  assert.equal(ceremonyCapMs('cracked', 'legendary'), 1500, 'a crack never runs past 1.5 s');
  assert.equal(ceremonyCapMs('mended', 'legendary'), 2500, 'a mend never runs past 2.5 s');
  assert.equal(ceremonyCapMs('merged', 'major'), 900);
  assert.equal(ceremonyCapMs('set', 'legendary'), 3500);
});

test('a full ceremony runs anticipation, impact, follow-through and settle inside its cap; calm swaps every motion for a pulse', () => {
  for (const kind of kinds) for (const tier of tiers) {
    const full = ceremonyTimeline(moment(kind), tier, 'full');
    const cap = ceremonyCapMs(kind, tier);
    assert.equal(full.durationMs, cap, `${kind}/${tier}`);
    assert(full.cues.every(cue => cue.at <= cap), `${kind}/${tier}: no cue after the cap`);
    assert(full.cues.some(cue => cue.type === 'impact' && cue.at === tierSpecs[tier].anticipationMs), `${kind}/${tier}: impact after anticipation`);
    assert(full.cues.some(cue => cue.type === 'settle'), `${kind}/${tier}: settles`);
    assert.equal(full.cues.some(cue => cue.type === 'takeover'), tier === 'legendary', `${kind}/${tier}: only legendary takes over`);
    assert(full.cues.filter(cue => cue.type === 'hitstop').every(cue => cue.ms <= 90), 'hit-stop stays under 90 ms');
    assert(full.cues.filter(cue => cue.type === 'shake').every(cue => cue.trauma <= 0.5));
    const calm = ceremonyTimeline(moment(kind), tier, 'calm');
    assert(calm.durationMs <= 400 && calm.durationMs <= cap / 2 + 1, `${kind}/${tier}: calm is halved and capped at 400 ms`);
    assert.deepEqual(calm.cues.filter(cue => ['shake', 'particles', 'flash', 'hitstop', 'slowmo', 'takeover', 'anticipate', 'impact'].includes(cue.type)), [], `${kind}/${tier}: calm has no motion`);
    assert(calm.cues.some(cue => cue.type === 'pulse' && cue.ms === 150), 'calm pulses brightness for 150 ms');
  }
  assert.equal(ceremonyTimeline(moment('cracked'), 'legendary', 'full').cues.some(cue => cue.type === 'flash'), false, 'a crack never flashes');
  assert.equal(ceremonyTimeline(moment('set'), 'legendary', 'full', { takeover: false }).cues.some(cue => cue.type === 'takeover'), false);
  assert.equal(ceremonyTimeline(moment('merged'), 'major', 'full', { count: 3 }).cues.find(cue => cue.type === 'title').count, 3, 'the title carries the coalesced count');
});

test('flash safety: at most three flashes in any second, never above half opacity, never a saturated red', () => {
  for (const kind of kinds) for (const tier of tiers) for (const mode of ['full', 'calm']) {
    const timeline = ceremonyTimeline(moment(kind), tier, mode);
    assert(flashSafe([{ timeline }]), `${kind}/${tier}/${mode}`);
    const flashes = timeline.cues.filter(cue => cue.type === 'flash');
    assert(flashes.length <= 1, `${kind}/${tier}/${mode}: at most one flash per ceremony`);
    assert(flashes.every(cue => cue.opacity <= flashLimit.opacity && !saturatedRed(flashTones[cue.tone])));
  }
  assert.equal(peakFlashes([0, 100, 200, 300]), 4);
  assert.equal(peakFlashes([0, 400, 800, 1200, 1600]), 3);
  assert.equal(peakFlashes([0, 1000, 2000]), 1);
  const burst = kinds.map((kind, index) => ({ offset: index * 200, timeline: ceremonyTimeline(moment(kind), 'epic', 'full') }));
  assert.equal(flashSafe(burst), false, 'back-to-back flashing timelines would break the rule, so the page ledger must catch them');
  for (const tone of Object.values(flashTones)) assert.equal(saturatedRed(tone), false);
  for (const palette of Object.values(palettes)) for (const color of palette) assert.equal(saturatedRed(color), false, `palette colour ${color} is not a saturated red`);
  assert.equal(saturatedRed([1, 0.1, 0.1]), true);
  assert.equal(saturatedRed([0.9, 0.85, 0.8]), false);
  assert(Object.values(momentLooks).every(look => look.flash === null || flashTones[look.flash]));

  const time = clock();
  const guard = createFlashGuard(time.now);
  assert.equal(guard.allow(0.9, 'warm'), 0.5, 'opacity is lowered to half');
  assert.equal(guard.allow(0.3, [1, 0.1, 0.1]), 0, 'a saturated red never flashes');
  time.advance(100); assert.equal(guard.allow(0.3, 'white'), 0.3);
  time.advance(100); assert.equal(guard.allow(0.3, 'white'), 0.3);
  time.advance(100); assert.equal(guard.allow(0.3, 'white'), 0, 'a fourth flash inside one second is refused');
  time.advance(800); assert.equal(guard.allow(0.3, 'white'), 0.3, 'the window slides');
});

test('the page ledger keeps every ceremony timeline the director plays at three flashes a second or fewer', async () => {
  const time = clock();
  const allowed = [];
  const stage = {
    play(ticket, timeline) {
      const start = time.now();
      for (const cue of timeline.cues) if (cue.type === 'flash') { time.set(start + cue.at); if (director.flash(cue.opacity, cue.tone)) allowed.push(time.now()); }
      time.set(start + 60);
      return Promise.resolve();
    },
  };
  const director = createDirector({ stage, now: time.now, rules: { ...directorRules, budget: { count: 100, windowMs: 60_000 }, queueLimit: 100 } });
  for (let index = 0; index < 30; index++) director.request(moment(index % 2 ? 'merged' : 'released'), { key: String(index) });
  for (let index = 0; index < 30; index++) director.request(moment('finish', { to: 'holo' }), { key: `f${index}` });
  await flush();
  for (let i = 0; i < 100; i++) await flush();
  assert(allowed.length >= 3, `flashes did play: ${allowed.length}`);
  assert(peakFlashes(allowed) <= flashLimit.count, `at most three flashes in any second: ${peakFlashes(allowed)}`);
});

test('the director coalesces the same moment on the same card within 2 s, and plays a repeat within 10 s a tier quieter', async () => {
  const time = clock();
  const stage = recordingStage(time, { auto: false });
  const director = createDirector({ stage, now: time.now });
  const first = director.request(moment('merged'), { key: '114' });
  time.advance(1500);
  const twin = director.request(moment('merged'), { key: '114' });
  assert.equal(twin.status, 'coalesced');
  assert.equal(twin.into, first);
  assert.equal(first.count, 2);
  assert.deepEqual(stage.counts, [[first.id, 2]], 'the playing title hears the new count');
  time.advance(1000);
  const later = director.request(moment('merged'), { key: '114' });
  assert.equal(later.status, 'queued', 'outside the 2 s window it is its own ceremony');
  assert.equal(later.habituated, true);
  assert.equal(later.tier, 'minor', 'a merge again within 10 s plays a tier quieter');
  const other = director.request(moment('merged'), { key: '115' });
  assert.equal(other.tier, 'minor', 'habituation is by kind, across cards');
  time.advance(11_000);
  const fresh = director.request(moment('merged'), { key: '116' });
  assert.equal(fresh.tier, 'major', 'after 10 s the full tier is back');
  assert.equal(stage.played.length, 1, 'one ceremony plays at a time');
  stage.pending.shift()();
  await flush();
  assert.equal(stage.played.length, 2);
  assert.equal(first.status, 'played');
});

test('one takeover per 10 minutes, never while the person types; the budget and the queue limit hold', async () => {
  const time = clock();
  let typing = false;
  const stage = recordingStage(time);
  const director = createDirector({ stage, now: time.now, typing: () => typing });
  const first = director.request(moment('set'), { key: '1' });
  await flush();
  assert.equal(first.takeover, true);
  assert(stage.played[0].timeline.cues.some(cue => cue.type === 'takeover'));
  time.advance(60_000);
  const second = director.request(moment('finish', { to: 'infinity' }), { key: '2' });
  await flush();
  assert.equal(second.tier, 'legendary');
  assert.equal(second.takeover, false, 'a second takeover within 10 minutes plays without taking over');
  assert.equal(stage.played[1].timeline.cues.some(cue => cue.type === 'takeover'), false);
  time.advance(directorRules.takeoverEveryMs);
  typing = true;
  const typed = director.request(moment('set'), { key: '3' });
  await flush();
  assert.equal(typed.takeover, false, 'no takeover while the person types');
  typing = false;
  time.advance(20_000);
  const allowed = director.request(moment('set'), { key: '4' });
  await flush();
  assert.equal(allowed.takeover, true, 'after 10 minutes and no typing, a takeover may play again');

  const busy = createDirector({ stage: recordingStage(time), now: time.now });
  const tickets = [];
  for (let index = 0; index < 8; index++) { tickets.push(busy.request(moment(kinds[1 + (index % 6)]), { key: `b${index}` })); time.advance(5000); await flush(); }
  assert.equal(tickets.filter(ticket => ticket.budgeted).length, 2, 'past six ceremonies a minute the rest play as minor');
  assert(tickets.filter(ticket => ticket.budgeted).every(ticket => ticket.tier === 'minor'));

  const held = createDirector({ stage: recordingStage(time, { auto: false }), now: time.now });
  const queued = Array.from({ length: 9 }, (_, index) => held.request(moment('merged'), { key: `q${index}` }));
  assert.equal(queued.filter(ticket => ticket.status === 'dropped').length, 2, 'at most six wait behind the playing one');
});

test('Off plays nothing, Calm plays the calm swap, Full plays motion; the auto preference follows reduced motion', async () => {
  const time = clock();
  let mode = 'off';
  const stage = recordingStage(time);
  const director = createDirector({ stage, now: time.now, motion: () => mode });
  const off = director.request(moment('merged'), { key: '1' });
  assert.equal(off.status, 'off');
  assert.equal(stage.played.length, 0);
  mode = 'calm';
  director.request(moment('released'), { key: '2' });
  await flush();
  assert.equal(stage.played[0].timeline.mode, 'calm');
  mode = 'full';
  time.advance(20_000);
  director.request(moment('mended'), { key: '3' });
  await flush();
  assert.equal(stage.played[1].timeline.mode, 'full');
  mode = 'nonsense';
  assert.equal(director.mode, 'full');
  assert.equal(resolveMotion('auto', false), 'full');
  assert.equal(resolveMotion('auto', true), 'calm', 'under prefers-reduced-motion the default is Calm');
  assert.equal(resolveMotion('full', true), 'full', 'an explicit choice wins');
  assert.equal(resolveMotion('calm', false), 'calm');
  assert.equal(resolveMotion('off', false), 'off');
  assert.equal(prefDefaults.cardMotion, 'auto');
  assert.equal(prefDefaults.cardSound, false, 'sound is off by default');
  for (const value of ['auto', 'full', 'calm', 'off']) assert.equal(validPref('cardMotion', value), true);
  assert.equal(validPref('cardMotion', 'wild'), false);
  assert.equal(validPref('cardSound', 'yes'), false);
  assert.equal(Object.hasOwn(prefDefaults, 'packSound'), false, 'one sound preference for every card ceremony');
});

test('a hidden page or a held director queues ceremonies; a skip only lands 300 ms in', async () => {
  const time = clock();
  let hidden = true;
  const stage = recordingStage(time, { auto: false });
  const director = createDirector({ stage, now: time.now, hidden: () => hidden });
  director.request(moment('merged'), { key: '1' });
  assert.equal(stage.played.length, 0, 'nothing plays in a hidden tab');
  hidden = false;
  director.resume();
  assert.equal(stage.played.length, 1, 'it plays when the tab is visible again');
  time.advance(200);
  assert.equal(director.skip(), false, 'too early to skip');
  time.advance(150);
  assert.equal(director.skip(), true);
  await flush();
  assert.equal(stage.played[0].ticket.status, 'skipped');
  const release = director.hold('pack');
  director.request(moment('released'), { key: '2' });
  assert.equal(stage.played.length, 1, 'a held director waits');
  release();
  assert.equal(stage.played.length, 2, 'and plays on release');
  director.request(moment('mended'), { key: '3' });
  director.clear();
  await flush();
  assert.equal(director.waiting.length, 0);
});

test('card moments mirror the server’s, and news is what happened since the person’s seen mark', () => {
  for (const card of Object.values(ploegDemo.cards)) assert.deepEqual(cardMoments(card), serverMoments(card), `card ${card.workItemId}`);
  const card = structuredClone(ploegDemo.cards['114']);
  assert.deepEqual(cardNews(card, null), [], 'no news before the first look');
  assert.deepEqual(cardNews(card, { seenAt: null, snapshot: null }), []);
  const merged = card.plays.find(play => play.state === 'merged').mergedAt;
  const news = cardNews(card, { seenAt: new Date(Date.parse(merged) - 60_000).toISOString(), snapshot: cardSnapshot(card) });
  assert.deepEqual(news.map(entry => entry.kind), ['merged', 'released', 'rarity'], 'the rarity reveals at the release, after it');
  assert.deepEqual(news[2].detail, { tier: 'uncommon', predicted: 'rare' });
  assert(news.every(entry => ceremonyKinds.includes(entry.kind)), 'minted is history, not news');
  assert.deepEqual(cardNews(card, { seenAt: new Date().toISOString(), snapshot: cardSnapshot(card) }), [], 'nothing after the mark');
  const graded = { ...card, grade: { overall: 8.5 } };
  const regrade = cardNews(graded, { seenAt: new Date().toISOString(), snapshot: { grade: 9, setComplete: false } });
  assert.deepEqual(regrade.map(entry => [entry.kind, entry.detail]), [['graded', { from: 9, to: 8.5 }]]);
  const completed = { ...card, set: { ...card.set, complete: true, size: 5 } };
  assert.deepEqual(cardNews(completed, { seenAt: new Date().toISOString(), snapshot: { grade: null, setComplete: false } }).map(entry => entry.kind), ['set']);
  assert.deepEqual(cardSnapshot({ grade: { overall: 7.25 } }), { grade: null, setComplete: false }, 'only half steps count as a grade');
  const before = cardBefore(card, news[0], cardAsOf);
  assert(before.plays.every(play => play.state !== 'merged'), 'the card before its merge has the play open');
  assert.equal(cardBefore(graded, regrade[0], cardAsOf).grade.overall, 9, 'the card before a regrade carries the old grade');
  assert.equal(cardBefore(completed, { kind: 'set', at: new Date().toISOString() }, cardAsOf).set.complete, false);
  assert.deepEqual(momentHeadline(news[0]), { main: 'Merged', sub: '#3 is in' });
  assert.equal(momentHeadline({ kind: 'finish', detail: { to: 'holo' } }).main, 'Holo');
  assert.equal(momentHeadline({ kind: 'graded', detail: { from: 9, to: 8.5 } }).main, 'Grade 8,5');
  assert.equal(momentText({ kind: 'graded', detail: { to: 8.5 } }), 'Graded 8,5');
  assert.equal(momentText({ kind: 'set', detail: { size: 5 } }), 'Set of 5 complete');
});

test('the seen gate plays news once: it marks before it plays, never replays, and only marks on a first look', async () => {
  const card = structuredClone(ploegDemo.cards['114']);
  const merged = Date.parse(card.plays.find(play => play.state === 'merged').mergedAt);
  const server = new Map();
  const order = [];
  let hidden = false;
  let wake;
  const gate = createSeenGate({
    load: async id => { order.push(`load ${id}`); return server.get(id) ?? { seenAt: null, snapshot: null }; },
    save: async (id, snapshot) => { order.push(`save ${id}`); const mark = { seenAt: new Date().toISOString(), snapshot }; server.set(id, mark); return mark; },
    play: news => order.push(`play ${news.map(entry => entry.kind).join(',')}`),
    hidden: () => hidden,
    whenVisible: () => new Promise(resolve => { wake = resolve; }),
  });
  assert.deepEqual(await gate.check(card), [], 'a first look only creates the mark');
  assert.deepEqual(order, ['load 114', 'save 114']);
  const other = createSeenGate({ load: async () => ({ seenAt: new Date(merged - 60_000).toISOString(), snapshot: cardSnapshot(card) }), save: async (id, snapshot) => { order.push('save'); return { seenAt: new Date().toISOString(), snapshot }; }, play: news => order.push(`play ${news.length}`) });
  order.length = 0;
  const [a, b] = await Promise.all([other.check(card), other.check(card)]);
  assert.deepEqual(a.map(entry => entry.kind), ['merged', 'released', 'rarity']);
  assert.deepEqual(b, [], 'a second check of the same card, even at once, does not replay');
  assert.deepEqual(order, ['save', 'play 3'], 'the mark moves before anything plays');
  hidden = true;
  const waiting = gate.check(structuredClone(ploegDemo.cards['117']));
  await flush();
  assert(!order.includes('load 117'), 'a hidden page marks nothing');
  hidden = false;
  wake();
  await waiting;
  assert(order.includes('save 117'));
  assert.deepEqual(await gate.check(null), []);
});

test('hit-stop and slow motion are clamped, and the shared particles move like the pack ceremony’s did', () => {
  const time = clock(0);
  const scale = createTimeScale(time.now);
  scale.hitStop(500);
  assert.equal(scale.scale(), 0);
  time.advance(timeLimits.hitStopMs + 1);
  assert.equal(scale.scale(), 1, 'a hit-stop never lasts past 120 ms');
  scale.slowMo(0.01, 9000);
  assert.equal(scale.scale(), timeLimits.slowestScale);
  assert.equal(scale.scaled(0.1), 0.1 * timeLimits.slowestScale);
  time.advance(2001);
  assert.equal(scale.scale(), 1, 'slow motion never lasts past 2 s');
  scale.slowMo(0.5, 1000); scale.reset();
  assert.equal(scale.scale(), 1);

  const particles = new Particles(2);
  particles.spawn({ x: 0, y: 0, z: 0, vx: 1, vy: 1, vz: 1, life: 0.1, color: [1, 1, 1] });
  assert.equal(particles.step(0.05), 1);
  assert.deepEqual([...particles.positions.slice(0, 3)].map(value => +value.toFixed(4)), [0.05, 0.05, 0.05]);
  assert.equal(+particles.velocities[0].toFixed(4), 0.985, 'drag on x');
  assert.equal(+particles.velocities[1].toFixed(4), +((1 - 0.4 * 0.05) * 0.985).toFixed(4), 'gravity then drag on y');
  assert.equal(particles.velocities[2], 1, 'no drag on z');
  particles.step(0.06);
  particles.step(0.01);
  assert.equal(particles.positions[2], -50, 'a dead particle is parked out of sight');
  particles.spawn({ x: 1, y: 1, vx: 0, vy: 0, life: 1, color: [0, 0, 0] });
  particles.spawn({ x: 2, y: 2, vx: 0, vy: 0, life: 1, color: [0, 0, 0] });
  assert.equal(particles.positions[3], 1);
  assert.equal(particles.positions[0], 2, 'a full buffer overwrites the oldest');
});

test('sound banks: a default and a bright bank, a theme picks one by soundBank, and a disabled player stays silent', () => {
  assert.deepEqual(soundBankIds().slice(0, 2), ['default', 'bright']);
  assert.equal(soundBankFor(null), 'default');
  assert.equal(soundBankFor({ soundBank: 'bright' }), 'bright');
  assert.equal(soundBankFor({ soundBank: 'missing' }), 'default', 'an unknown bank falls back to the default');
  assert.equal(soundBankFor('bright'), 'bright');
  assert.throws(() => registerSoundBank('Bad Id', { cues: {} }));
  registerSoundBank('test-quiet', { label: 'Quiet', cues: { tick: () => {} } });
  assert.equal(soundBankFor({ soundBank: 'test-quiet' }), 'test-quiet');
  const player = createSoundPlayer({ enabled: () => false });
  assert.equal(player.play('seal'), false);
  assert.equal(player.tear(), false);
  const on = createSoundPlayer({ enabled: () => true });
  assert.equal(on.play('seal'), false, 'without WebAudio (Node) nothing plays and nothing throws');
});
