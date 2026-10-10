import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FactsError, parseFactsPage, parseFactsResponse, parseWorkItemFacts } from '../src/cards/facts.ts';

type Json = Record<string, any>;

const fixture = JSON.parse(readFileSync(new URL('./fixtures/cards/service/proposal-refusals.json', import.meta.url), 'utf8')) as { world: Json[] };

function document(): Json {
  const facts = structuredClone(fixture.world[0]!);
  facts.shifts = [{ id: '7', workItemId: '181', team: 'silver', branch: 'ploeg/181', round: 1, budgetUsd: 2, spentUsd: 0.5, reservedUsd: 0, openedAt: '2026-09-19T10:00:00Z', closedAt: '2026-09-20T10:00:00Z', closeReason: 'merged' }];
  facts.runs = [{ id: '11', shiftId: '7', role: 'builder', round: 1, writes: true, state: 'finished', startedAt: '2026-09-19T10:00:00Z', finishedAt: '2026-09-19T11:00:00Z', outcome: 'done', links: ['https://forge.example/pr/10'], authorizedUsd: 2, usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.5 } }];
  facts.liveUsage = [{ runId: '11', observedAt: '2026-09-19T10:30:00Z', costUsd: 0.25, inputTokens: 4, outputTokens: 2 }];
  facts.statusTransitions = [{ status: 'Doing', gate: 'development', at: '2026-09-19T09:00:00Z', observed: false, receivedAt: '2026-09-19T09:00:01Z' }, { status: 'Inbox', gate: null, at: '2026-09-18T09:00:00Z', observed: true, receivedAt: '2026-09-18T09:00:00Z' }];
  facts.gateTransitions = [{ gate: 'test', status: 'Review', actor: 'iris', reason: null, at: '2026-09-20T09:00:00Z', receivedAt: '2026-09-20T09:00:00Z' }];
  facts.roster = [{ login: 'stewart', roles: ['merger'] }];
  facts.botLogins = ['Ploeg-Bot'];
  facts.workItem.epics = [{ provider: 'vikunja', externalId: 'epic-1', title: 'Epic', firstSeenAt: '2026-09-01T00:00:00Z', lastSeenAt: '2026-09-02T00:00:00Z', removedAt: null }];
  const pr = facts.pullRequests[0];
  pr.files = [{ path: 'src/a.ts', additions: 3, deletions: 1, indentation: { method: 'indentation/2026.1', unit: 2, added: 4, removed: 1, maxDepth: 2 } }];
  pr.filesCapturedAt = '2026-09-20T12:28:00Z';
  pr.ciRuns = [{ key: 'run-1', headSha: 'abc', workflow: 'ci', status: 'success', createdAt: '2026-09-20T10:00:00Z', startedAt: '2026-09-20T10:00:05Z', completedAt: '2026-09-20T10:05:00Z', jobs: [{ name: 'test', status: 'success', startedAt: '2026-09-20T10:00:10Z', completedAt: '2026-09-20T10:04:00Z', queuedSeconds: 5, attempt: 1 }] }];
  pr.labels = ['hotfix'];
  return facts;
}

function refused(mutate: (facts: Json) => void, path: string | RegExp, parse: (value: unknown) => unknown = parseWorkItemFacts): void {
  const facts = document();
  mutate(facts);
  assert.throws(() => parse(facts), (error: unknown) => {
    assert(error instanceof FactsError, `expected a FactsError, got ${String(error)}`);
    if (typeof path === 'string') assert.equal(error.path, path);
    else assert.match(error.path, path);
    assert.ok(error.message.startsWith(`${error.path}: `), 'the message starts with the path');
    return true;
  });
}

test('a well-formed facts document parses and keeps what the contract defines', () => {
  const facts = parseWorkItemFacts(document());
  assert.equal(facts.workItem.id, '181');
  assert.equal(facts.workItem.team, 'silver');
  assert.equal(facts.runs[0]!.state, 'finished');
  assert.deepEqual(facts.runs[0]!.usage, { inputTokens: 10, outputTokens: 5, costUsd: 0.5 });
  assert.equal(facts.gateTransitions[0]!.gate, 'test');
  assert.equal(facts.statusTransitions[1]!.gate, null);
  assert.deepEqual(facts.botLogins, ['ploeg-bot'], 'bot logins are compared without case');
  assert.equal(facts.pullRequests[0]!.ciRuns[0]!.jobs[0]!.queuedSeconds, 5);
  assert.deepEqual(facts.truncated, { shifts: false, runs: false, pullRequests: false, statusTransitions: false, gateTransitions: false });
});

test('every assembly fixture world document parses', () => {
  for (const name of readdirSync(new URL('./fixtures/cards/assembly/', import.meta.url)).filter(file => file.endsWith('.json'))) {
    const data = JSON.parse(readFileSync(new URL(`./fixtures/cards/assembly/${name}`, import.meta.url), 'utf8')) as { world: unknown[] };
    for (const raw of data.world) assert.doesNotThrow(() => parseWorkItemFacts(raw), name);
  }
});

test('the parser is strict on the fields it knows: wrong types fail with the path of the field', () => {
  refused(f => { f.workItem.title = 5; }, 'facts.workItem.title');
  refused(f => { f.workItem.team = null; }, 'facts.workItem.team');
  refused(f => { f.workItem = []; }, 'facts.workItem');
  refused(f => { f.runs[0].writes = 'yes'; }, 'facts.runs[0].writes');
  refused(f => { f.runs[0].usage.inputTokens = 1.5; }, 'facts.runs[0].usage.inputTokens');
  refused(f => { f.runs[0].usage.costUsd = 'free'; }, 'facts.runs[0].usage.costUsd');
  refused(f => { f.shifts[0].budgetUsd = Number.NaN; }, 'facts.shifts[0].budgetUsd');
  refused(f => { f.pullRequests[0].number = 0; }, 'facts.pullRequests[0].number');
  refused(f => { f.pullRequests[0].additions = -1; }, 'facts.pullRequests[0].additions');
  refused(f => { f.pullRequests[0].labels = 'hotfix'; }, 'facts.pullRequests[0].labels');
  refused(f => { f.pullRequests[0].files[0].indentation.unit = '2'; }, 'facts.pullRequests[0].files[0].indentation.unit');
  refused(f => { f.pullRequests[0].ciRuns[0].jobs[0].attempt = -1; }, 'facts.pullRequests[0].ciRuns[0].jobs[0].attempt');
  refused(f => { f.truncated.runs = 'no'; }, 'facts.truncated.runs');
  refused(f => { f.roster[0].roles = ['merger', 7]; }, 'facts.roster[0].roles[1]');
  refused(f => { f.workItem.title = 'a\u0000b'; }, 'facts.workItem.title');
  refused(f => { f.workItem.title = 'x'.repeat(4097); }, 'facts.workItem.title');
});

test('identifiers must be Ploeg ids', () => {
  for (const bad of ['0', '01', 'abc', '-1', '12345678901234567890', 181, '']) refused(f => { f.workItem.id = bad; }, 'facts.workItem.id');
  refused(f => { f.runs[0].id = '07'; }, 'facts.runs[0].id');
  refused(f => { f.runs[0].shiftId = 'seven'; }, 'facts.runs[0].shiftId');
  refused(f => { f.pullRequests[0].id = '9a'; }, 'facts.pullRequests[0].id');
  refused(f => { f.liveUsage[0].runId = '0'; }, 'facts.liveUsage[0].runId');
  refused(f => { f.shifts[0].workItemId = '182'; }, 'facts.shifts', parseWorkItemFacts);
});

test('times must be RFC 3339 instants', () => {
  for (const bad of ['2026-10-10', 'yesterday', '2026-13-45T00:00:00Z', '2026-10-10T12:00:00', '2026-10-10 12:00:00Z', 1_760_000_000]) refused(f => { f.activityAt = bad; }, 'facts.activityAt');
  refused(f => { f.workItem.createdAt = undefined; }, 'facts.workItem.createdAt');
  refused(f => { f.runs[0].startedAt = 'soon'; }, 'facts.runs[0].startedAt');
  refused(f => { f.pullRequests[0].mergedAt = '2026-09-20'; }, 'facts.pullRequests[0].mergedAt');
  refused(f => { f.workItem.epics[0].firstSeenAt = 'then'; }, 'facts.workItem.epics[0].firstSeenAt');
  assert.doesNotThrow(() => parseWorkItemFacts({ ...document(), activityAt: '2026-10-10T14:27:48.153298123+02:00' }), 'nanoseconds and an offset are an instant');
});

test('unknown enum values of a gate, a run state or a pull request state are refused', () => {
  refused(f => { f.gateTransitions[0].gate = 'staging'; }, 'facts.gateTransitions[0].gate');
  refused(f => { f.gateTransitions[0].gate = null; }, 'facts.gateTransitions[0].gate');
  refused(f => { f.statusTransitions[0].gate = 'staging'; }, 'facts.statusTransitions[0].gate');
  refused(f => { f.runs[0].state = 'paused'; }, 'facts.runs[0].state');
  refused(f => { delete f.runs[0].state; }, 'facts.runs[0].state');
  refused(f => { f.pullRequests[0].state = 'draft'; }, 'facts.pullRequests[0].state');
});

test('a list longer than the contract allows is refused with its path', () => {
  const pr = () => document().pullRequests[0];
  refused(f => { f.pullRequests = Array.from({ length: 51 }, (_, i) => ({ ...pr(), id: String(100 + i) })); }, 'facts.pullRequests');
  refused(f => { f.workItem.epics = Array.from({ length: 51 }, () => f.workItem.epics[0]); }, 'facts.workItem.epics');
  refused(f => { f.roster = Array.from({ length: 1001 }, (_, i) => ({ login: `p${i}`, roles: ['author'] })); }, 'facts.roster');
  refused(f => { f.botLogins = Array.from({ length: 101 }, (_, i) => `bot${i}`); }, 'facts.botLogins');
  refused(f => { f.pullRequests[0].files = Array.from({ length: 301 }, (_, i) => ({ path: `f${i}`, additions: 1, deletions: 0, indentation: null })); }, 'facts.pullRequests[0].files');
  refused(f => { f.runs = 'none'; }, 'facts.runs');
  assert.doesNotThrow(() => parseWorkItemFacts({ ...document(), pullRequests: Array.from({ length: 50 }, (_, i) => ({ ...pr(), id: String(100 + i) })) }), 'exactly the limit is fine');
});

test('the parser is additive: unknown fields anywhere are ignored', () => {
  const plain = parseWorkItemFacts(document());
  const extended = document();
  extended.futureField = { nested: true };
  extended.workItem.priorityScore = 42;
  extended.workItem.epics[0].colour = 'red';
  extended.shifts[0].model = 'x';
  extended.runs[0].harness = 'opencode';
  extended.runs[0].usage.reasoningTokens = 99;
  extended.liveUsage[0].source = 'gateway';
  extended.pullRequests[0].mergeQueue = { position: 1 };
  extended.pullRequests[0].files[0].language = 'ts';
  extended.pullRequests[0].files[0].indentation.version = 2;
  extended.pullRequests[0].ciRuns[0].jobs[0].runner = 'big';
  extended.statusTransitions[0].board = 'b';
  extended.gateTransitions[0].comment = 'c';
  extended.roster[0].avatar = 'a';
  extended.truncated.contextFiles = true;
  assert.deepEqual(parseWorkItemFacts(extended), plain);
});

test('missing lists read empty, missing truncation reads false, and optional fields take their defaults', () => {
  const facts = document();
  for (const key of ['shifts', 'runs', 'liveUsage', 'pullRequests', 'statusTransitions', 'gateTransitions', 'deployEnvironments', 'roster', 'botLogins', 'truncated']) delete facts[key];
  delete facts.workItem.epics;
  delete facts.workItem.withdrawals;
  delete facts.workItem.externalRef;
  delete facts.workItem.updatedAt;
  const parsed = parseWorkItemFacts(facts);
  assert.deepEqual([parsed.shifts, parsed.runs, parsed.liveUsage, parsed.pullRequests, parsed.statusTransitions, parsed.gateTransitions, parsed.deployEnvironments, parsed.roster, parsed.botLogins], [[], [], [], [], [], [], [], [], []]);
  assert.deepEqual([parsed.workItem.epics, parsed.workItem.withdrawals, parsed.workItem.externalRef], [[], [], '']);
  assert.equal(parsed.workItem.updatedAt, parsed.workItem.createdAt);
  assert.deepEqual(parsed.truncated, { shifts: false, runs: false, pullRequests: false, statusTransitions: false, gateTransitions: false });
  const pr = document();
  for (const key of ['ciRuns', 'reviews', 'events', 'files', 'reverts', 'deployments']) delete pr.pullRequests[0][key];
  const parsedPr = parseWorkItemFacts(pr).pullRequests[0]!;
  assert.deepEqual([parsedPr.ciRuns, parsedPr.reviews, parsedPr.events, parsedPr.files, parsedPr.reverts, parsedPr.deployments], [[], [], [], [], [], []]);
});

test('the facts response accepts schemaVersion 1.x and refuses 2.0', () => {
  for (const schemaVersion of ['1.0', '1.1', '1.27']) assert.equal(parseFactsResponse({ schemaVersion, facts: document(), extra: 1 }).workItem.id, '181', schemaVersion);
  for (const schemaVersion of ['2.0', '1', '1.x', 1, 1.0, null, undefined]) {
    assert.throws(() => parseFactsResponse({ schemaVersion, facts: document() }), (error: unknown) => error instanceof FactsError && error.path === 'response.schemaVersion', String(schemaVersion));
  }
  assert.throws(() => parseFactsResponse({ schemaVersion: '1.0', facts: { ...document(), activityAt: 'now' } }), (error: unknown) => error instanceof FactsError && error.path === 'facts.activityAt');
  assert.throws(() => parseFactsResponse([]), (error: unknown) => error instanceof FactsError && error.path === 'response');
});

test('a facts page accepts 1.x, at most 25 documents, and names the failing document', () => {
  const page = parseFactsPage({ schemaVersion: '1.3', facts: [document(), document()], nextBefore: 'cursor-1', future: true });
  assert.deepEqual([page.facts.length, page.nextBefore], [2, 'cursor-1']);
  assert.deepEqual(parseFactsPage({ schemaVersion: '1.0' }), { facts: [], nextBefore: null }, 'a page without facts reads empty');
  assert.throws(() => parseFactsPage({ schemaVersion: '2.0', facts: [], nextBefore: null }), (error: unknown) => error instanceof FactsError && error.path === 'response.schemaVersion');
  assert.throws(() => parseFactsPage({ schemaVersion: '1.0', facts: Array.from({ length: 26 }, document), nextBefore: null }), (error: unknown) => error instanceof FactsError && error.path === 'response.facts');
  const bad = document();
  bad.runs[0].state = 'paused';
  assert.throws(() => parseFactsPage({ schemaVersion: '1.0', facts: [document(), bad], nextBefore: null }), (error: unknown) => error instanceof FactsError && error.path === 'response.facts[1].runs[0].state');
  assert.throws(() => parseFactsPage({ schemaVersion: '1.0', facts: [], nextBefore: 7 }), (error: unknown) => error instanceof FactsError && error.path === 'response.nextBefore');
});

test('a time on a date the calendar does not have is refused, in UTC and with an offset', () => {
  for (const bad of ['2026-02-30T00:00:00Z', '2026-04-31T12:00:00+02:00', '2026-10-10T24:00:00Z']) {
    const facts = document();
    facts.activityAt = bad;
    assert.throws(() => parseWorkItemFacts(facts), (error: unknown) => error instanceof FactsError && error.path === 'facts.activityAt', bad);
  }
  const facts = document();
  facts.activityAt = '2026-10-10T23:30:00.123456-05:00';
  assert.equal(parseWorkItemFacts(facts).activityAt, '2026-10-10T23:30:00.123456-05:00');
});

test('the board, admission time, checkpoints and budget holds are read when Ploeg sends them and stay absent from an older Ploeg', () => {
  const older = document();
  for (const key of ['checkpoints', 'runBudgetHolds']) delete older[key];
  delete older.workItem.externalScope;
  delete older.workItem.admittedAt;
  delete older.truncated.checkpoints;
  const parsedOlder = parseWorkItemFacts(older);
  assert.equal('checkpoints' in parsedOlder, false);
  assert.equal('runBudgetHolds' in parsedOlder, false);
  assert.equal('externalScope' in parsedOlder.workItem, false);
  assert.equal('admittedAt' in parsedOlder.workItem, false);
  const newer = document();
  newer.workItem.externalScope = '10';
  newer.workItem.admittedAt = '2026-09-21T10:00:00+02:00';
  newer.checkpoints = [{ id: '4', phase: 'pushed', branch: 'ploeg/181', prUrl: 'https://forge.example/webgrip/ploeg/pulls/9', createdAt: '2026-09-20T10:00:00Z' }];
  newer.runBudgetHolds = [{ runId: '12', shiftId: null, reservedUsd: 0.75 }];
  newer.truncated.checkpoints = false;
  const parsed = parseWorkItemFacts(newer);
  assert.equal(parsed.workItem.externalScope, '10');
  assert.equal(parsed.workItem.admittedAt, '2026-09-21T10:00:00+02:00');
  assert.deepEqual(parsed.checkpoints, newer.checkpoints);
  assert.deepEqual(parsed.runBudgetHolds, newer.runBudgetHolds);
  assert.equal(parsed.truncated.checkpoints, false);
  refused(f => { f.workItem.externalScope = 10; }, 'facts.workItem.externalScope');
  refused(f => { f.workItem.admittedAt = 'yesterday'; }, 'facts.workItem.admittedAt');
  refused(f => { f.checkpoints = [{ id: 'x', phase: '', branch: '', prUrl: '', createdAt: '2026-09-20T10:00:00Z' }]; }, 'facts.checkpoints[0].id');
  refused(f => { f.runBudgetHolds = [{ runId: '1', shiftId: null, reservedUsd: 'lots' }]; }, 'facts.runBudgetHolds[0].reservedUsd');
});
