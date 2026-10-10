import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { cardActivity, cardListLogins, namesAny, orderCards } from '../src/cards/list.ts';
import { assembleCard, defaultCardRules, rarityRecord, type CardContext, type CrackRecord, type RarityRecord } from '../src/cards/assemble.ts';
import { parseWorkItemFacts, type WorkItemFacts } from '../src/cards/facts.ts';
import { importedCrack } from '../src/cards/service.ts';
import { micros, rfc3339Micros } from '../src/cards/go.ts';
import { newCalendar, newKindMap } from '../src/cards/flow.ts';
import type { CI, Shape, Timeline } from '../src/cards/playkpi.ts';

const directory = new URL('./fixtures/cards/assembly/', import.meta.url);
type Fixture = {
  kind: string; test: string; workItemId: string; teams: string[] | null; error?: string; card?: Record<string, unknown>;
  options: { now: string; bots: string[] | null; releaseEnvironments: Record<string, string> | null; hotfixLabels: Record<string, string[]> | null; rarity: boolean; live: boolean; flow?: { cardCalendar?: { timezone: string; days: string[]; start: string; end: string } } };
  world: unknown[]; state: { cracks: CrackRecord[]; rarity: RarityRecord[]; shapes: { pullRequest: { id: string }; shape: Shape }[]; kpis: { pullRequestId: string; kpis: { timeline?: Timeline; ci?: CI } }[] }; stateAfter: { rarity: RarityRecord[] };
  liveReadings: { runId: string; costUsd?: number; inputTokens?: number; outputTokens?: number; error?: boolean }[]; taskUrls: Record<string, string>;
};

const kindsByTest: Record<string, Record<string, Record<string, ReturnType<typeof newKindMap>>>> = {
  TestOperatorCard_FlowFromStoredFacts: { vikunja: { 10: newKindMap({ active: ['UAT'] }) } },
};

/** Builds the context Unfold would have after seeing every Work Item of the fixture's world and importing Ploeg's card state. */
export function fixtureContext(fixture: Fixture): { facts: WorkItemFacts; ctx: CardContext; frozen: RarityRecord[] } {
  const live = new Map((fixture.liveReadings ?? []).filter(r => !r.error).map(r => [r.runId, r]));
  const world = new Map<string, WorkItemFacts>();
  for (const raw of fixture.world) {
    const facts = parseWorkItemFacts(raw);
    facts.liveUsage = facts.runs.filter(r => live.has(r.id)).map(r => { const l = live.get(r.id)!; return { runId: r.id, observedAt: fixture.options.now, costUsd: l.costUsd!, inputTokens: l.inputTokens!, outputTokens: l.outputTokens! }; });
    world.set(facts.workItem.id, facts);
  }
  const frozen: RarityRecord[] = [];
  const cracks = fixture.state.cracks.map(importedCrack);
  const stored = new Map(fixture.state.rarity.map(r => [r.workItemId, r]));
  const now = micros(fixture.options.now);
  const calendar = fixture.options.flow?.cardCalendar;
  const kinds = kindsByTest[fixture.test] ?? {};
  const ctx: CardContext = {
    now,
    bots: new Set((fixture.options.bots ?? []).map(b => b.toLowerCase())),
    rules: defaultCardRules({
      releaseEnvironment: repo => fixture.options.releaseEnvironments?.[repo.toLowerCase()] || 'production',
      hotfixLabels: team => fixture.options.hotfixLabels?.[team]?.length ? fixture.options.hotfixLabels[team]!.map(l => l.toLowerCase()) : ['hotfix'],
      style: () => ({ skin: '', theme: null }),
      rarity: fixture.options.rarity,
      flow: fixture.options.flow ? { kinds: (provider, scope) => kinds[provider]?.[scope] ?? null, calendar: () => newCalendar(calendar ? { timezone: calendar.timezone, days: calendar.days, start: calendar.start, end: calendar.end } : {}) } : null,
    }),
    facts: id => world.get(id),
    epicMembers: (provider, epic) => [...world.values()].filter(f => f.workItem.epics.some(e => e.provider === provider && e.externalId === epic && e.removedAt === null)).map(f => f.workItem.id),
    workItemByExternal: (provider, externalId, team) => { const f = [...world.values()].find(w => w.workItem.provider === provider && w.workItem.externalId === externalId && w.workItem.team === team); return f ? { id: f.workItem.id, title: f.workItem.title } : null; },
    cracksOnCard: id => cracks.filter(c => c.cardWorkItemId === id),
    cracksOfBug: id => cracks.filter(c => c.bugWorkItemId === id),
    storedRarity: id => stored.get(id) ?? null,
    cohort: (formula, target, quarter, exclude) => [...stored.values()].filter(r => r.formula === formula && r.cohortTarget === target && r.cohortQuarter === quarter && r.workItemId !== exclude).map(r => r.score),
    freezeRarity: (id, reveal) => {
      const row = rarityRecord(id, reveal, [...stored.values()].filter(r => r.formula === '2026.1' && r.cohortTarget === reveal.target && r.cohortQuarter === reveal.quarter && r.workItemId !== id).map(r => r.score), now);
      stored.set(id, row);
      frozen.push(row);
      return row;
    },
    storedKpis: id => fixture.state.kpis.find(k => k.pullRequestId === id)?.kpis ?? null,
    legacyShape: id => fixture.state.shapes.find(s => s.pullRequest.id === id)?.shape ?? null,
    touchedBefore: (repo, path, from, until, exclude) => [...world.values()].some(f => f.workItem.id !== exclude && f.pullRequests.some(p => p.state === 'merged' && p.mergedAt !== null && `${p.owner}/${p.repo}`.toLowerCase() === repo && micros(p.mergedAt) < until && micros(p.mergedAt) >= from && p.files.some(file => file.path === path))),
    liveUsage: fixture.options.live,
    taskUrl: (provider, externalId) => (fixture.taskUrls ?? {})[`${provider}\u0000${externalId}`] ?? '',
  };
  return { facts: world.get(fixture.workItemId)!, ctx, frozen };
}

const timePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
/** Replaces every time string by its instant in microseconds, so a time Go printed in Postgres's zone equals the same instant in UTC. */
export function instants(value: unknown): unknown {
  if (typeof value === 'string' && timePattern.test(value)) return micros(value);
  if (Array.isArray(value)) return value.map(instants);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, instants(v)]));
  return value;
}

const fixtures = readdirSync(directory).filter(name => name.endsWith('.json')).map(name => ({ name, fixture: JSON.parse(readFileSync(new URL(name, directory), 'utf8')) as Fixture }));

test('every card Ploeg assembled in its own store tests is assembled identically from the delivery facts and the imported card state', () => {
  const cards = fixtures.filter(({ fixture }) => fixture.kind === 'card' && fixture.card);
  assert.ok(cards.length >= 60, `only ${cards.length} card fixtures`);
  const failures: string[] = [];
  for (const { name, fixture } of cards) {
    const { facts, ctx, frozen } = fixtureContext(fixture);
    const card = assembleCard(facts, ctx);
    try { assert.deepEqual(instants(JSON.parse(JSON.stringify(card))), instants(fixture.card)); }
    catch (error) { failures.push(`${name}: ${(error as Error).message.slice(0, 3000)}`); continue; }
    const after = fixture.stateAfter.rarity.find(r => r.workItemId === fixture.workItemId);
    const before = fixture.state.rarity.find(r => r.workItemId === fixture.workItemId);
    if (after && !before) {
      assert.equal(frozen.length, 1, `${name}: Ploeg froze a rarity; Unfold must freeze one too`);
      const { recordedAt: _r, checkedAt: _c, ...mine } = frozen[0]!;
      const { recordedAt: _r2, checkedAt: _c2, ...theirs } = after;
      assert.deepEqual(JSON.parse(JSON.stringify({ ...mine, revealedAt: micros(mine.revealedAt) })), { ...theirs, revealedAt: micros(theirs.revealedAt) }, `${name}: frozen rarity`);
    }
  }
  assert.deepEqual(failures, []);
});

test('the review and CI figures Ploeg stored per play are what Unfold derives from the same delivery facts', () => {
  let compared = 0;
  for (const { name, fixture } of fixtures) {
    if (fixture.kind !== 'card' || !fixture.card) continue;
    const { facts, ctx } = fixtureContext(fixture);
    const derived = assembleCard(facts, { ...ctx, storedKpis: undefined });
    const stored = assembleCard(facts, ctx);
    const prs = [...facts.pullRequests].sort((a, b) => a.number - b.number || Number(BigInt(a.id) - BigInt(b.id)));
    stored.plays.forEach((play, index) => {
      if (!fixture.state.kpis.some(k => k.pullRequestId === prs[index]?.id)) return;
      compared++;
      assert.deepEqual(instants(JSON.parse(JSON.stringify({ timeline: derived.plays[index]!.timeline, ci: derived.plays[index]!.ciTiming }))), instants(JSON.parse(JSON.stringify({ timeline: play.timeline, ci: play.ciTiming }))), `${name} play ${play.number}`);
    });
  }
  assert.ok(compared > 0, 'no play with stored figures');
});

test('the card list holds the cards whose roster or steward names a member, newest activity first, as Ploeg listed them', () => {
  let compared = 0;
  for (const { name, fixture: raw } of fixtures) {
    const fixture = raw as unknown as Fixture & { filter: { teams: string[] | null; team: string; members: string[]; since: string | null; limit: number; before?: string }; cards?: string[] };
    if (fixture.kind !== 'list' || !fixture.cards || fixture.filter.before) continue;
    const { ctx } = fixtureContext({ ...fixture, workItemId: '' });
    const logins = new Set(cardListLogins(fixture.filter.members, fixture.options.bots ?? []));
    const limit = Math.min(fixture.filter.limit > 0 ? fixture.filter.limit : 20, 50);
    const since = fixture.filter.since ? micros(fixture.filter.since) : null;
    const listed = orderCards(fixture.world.map(entry => ctx.facts((entry as { workItem: { id: string } }).workItem.id)!)
      .filter(f => (!fixture.filter.teams || fixture.filter.teams.includes(f.workItem.team)) && (!fixture.filter.team || f.workItem.team === fixture.filter.team))
      .map(f => ({ id: f.workItem.id, activity: cardActivity(f, ctx.cracksOnCard(f.workItem.id), ctx.rules), card: assembleCard(f, ctx) }))
      .filter(entry => logins.size > 0 && namesAny(entry.card, logins) && (since === null || entry.activity >= since)));
    assert.deepEqual(listed.slice(0, limit).map(entry => entry.id), fixture.cards, name);
    compared++;
  }
  assert.ok(compared >= 15, `only ${compared} lists`);
});

test('a checkpoint that named a pull request before Ploeg first saw it opens the play at the checkpoint, and budget holds follow runBudgetHolds', () => {
  const entry = fixtures.find(({ fixture }) => fixture.kind === 'card' && fixture.card && (fixture.card as { plays: unknown[] }).plays.length > 0 && (fixture.card as { plays: { url?: string }[] }).plays[0]!.url);
  assert.ok(entry, 'a card fixture with a linked play');
  const { facts, ctx } = fixtureContext(entry.fixture);
  const pr = facts.pullRequests[0]!;
  const before = assembleCard(facts, ctx).events.find(event => event.kind === 'pr_opened' && event.detail.number === pr.number)!;
  const earlier = rfc3339Micros(micros(before.at) - 3_600_000_000);
  const withCheckpoint = { ...facts, checkpoints: [{ id: '1', phase: 'pushed', branch: pr.branch ?? '', prUrl: pr.url, createdAt: earlier }] };
  const opened = assembleCard(withCheckpoint, ctx).events.find(event => event.kind === 'pr_opened' && event.detail.number === pr.number);
  assert.equal(opened?.at, earlier);
  const other = { ...facts, checkpoints: [{ id: '1', phase: 'pushed', branch: '', prUrl: 'https://forge.example/other/repo/pulls/999', createdAt: earlier }] };
  assert.notEqual(assembleCard(other, ctx).events.find(event => event.kind === 'pr_opened' && event.detail.number === pr.number)?.at, earlier);
  const started = facts.runs.find(run => run.startedAt !== null);
  if (started) {
    assert.equal(assembleCard({ ...facts, runBudgetHolds: [{ runId: started.id, shiftId: started.shiftId, reservedUsd: 0.5 }] }, ctx).totals.costStatus, 'reserved');
    assert.notEqual(assembleCard({ ...facts, runBudgetHolds: [] }, ctx).totals.costStatus, 'reserved');
  }
});
