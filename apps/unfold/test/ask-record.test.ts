import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { money } from '../public/core/format.js';
import { sessionProgress } from '../public/core/progress.js';
import { workItemBrief, briefText, type BriefSession } from '../src/ask/brief.ts';
import { matchIntent, recordAnswer, type RecordIntent } from '../src/ask/record.ts';
import { AskService, type AskAuthority, type AskGrant, type AskWorkItems } from '../src/ask/service.ts';
import type { PloegCard, PloegDetail, PloegItem, PloegRun } from '../src/ploeg.ts';
import { Store } from '../src/store.ts';
import type { Event, Session, User } from '../src/types.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/session-059675b9.json', import.meta.url), 'utf8'));
const fixtureNow = Date.parse(fixture.now);
const owner: User = { id: 'owner', name: 'Owner', role: 'operator' };
const at = '2026-10-10T10:00:00Z';

const standing: Record<RecordIntent, string[]> = {
  doing: ['What is it doing now?', 'Status?', "What's the status of this work item?", 'Where does it stand?', 'How far along is it?', 'Is it still running?', "how's it going", 'Hey, what is happening with the work?', 'What is the agent working on right now?'],
  stopped: ['Why did it stop?', 'Why is it waiting?', "Why's it stuck?", "Why didn't it finish?", 'What is it waiting for?', 'Why did the work fail?', 'Why is this task on hold?'],
  spend: ['What did it cost so far?', 'How much has it cost?', 'How much has been spent?', "What's the cost so far?", 'Cost?', 'How much budget did it use?'],
  next: ['What should I do next?', "What's next?", 'Next steps?', 'What now?', 'Do I need to do anything?', 'What do you need from me?', 'Please, what should we do about this ticket?'],
  who: ['Who is working on it?', "Who's working right now?", 'Which role is working?', 'Which agents are active on this task?'],
  done: ['Is it done?', 'Is it finished yet?', 'Has the work completed?', 'Is it ready?'],
  pull_request: ['Where is the PR?', 'Is there a pull request yet?', 'Has it opened a pull request?', 'What is the status of the pull request?', 'PR?'],
  preview: ['Is there a preview?', "Where's the preview environment?", 'Does it have a preview yet?'],
};

const unmatched = [
  'Is it done and where is the PR?',
  'Why did it stop? What did it cost?',
  'When will it be done?',
  'What changed in the readme?',
  'Why did the reviewer approve the change?',
  'How much will it cost to finish?',
  'Waarom is het gestopt?',
  'Status of the deploy pipeline?',
  'Can you make it funnier?',
  'Is it done? I need it for the demo tomorrow.',
  `What is it doing now ${'and also '.repeat(10)}`,
  'What does it cost?',
];

test('each standing question maps to exactly its intent', () => {
  for (const [intent, questions] of Object.entries(standing)) for (const question of questions) assert.equal(matchIntent(question), intent, question);
});

test('a question that is not exactly a standing question goes to the model', () => {
  for (const question of unmatched) assert.equal(matchIntent(question), null, question);
});

function run(overrides: Partial<PloegRun> = {}): PloegRun {
  return { id: '11', workItemId: '42', shiftId: '5', team: 'bronze', role: 'builder', round: 1, writes: true, state: 'running', startedAt: at, finishedAt: null, expiresAt: null, outcome: null, summary: '', stuckReason: 'LEAK-stuck', links: [], findings: 'LEAK-findings', verdict: '', problem: '', solution: '', failureReason: 'LEAK-failure', authorizedUsd: 2, usage: null, costStatus: 'unknown', keyAlias: null, ...overrides };
}

function detail(item: Partial<PloegItem> = {}, runs: PloegRun[] = [run()]): PloegDetail {
  return {
    item: { id: '42', provider: 'vikunja', externalId: '1957', revision: 'r1', team: 'bronze', state: 'leased', title: 'login: fix Safari', description: 'The login page breaks on Safari.', url: '', priority: 3, attempts: 1, infraFailures: 0, nextEligibleAt: null, createdAt: at, updatedAt: at, target: null, latestShift: null, lease: null, pullRequest: null, ...item } as PloegItem,
    shifts: [], runs, checkpoints: [], events: [], truncated: { shifts: false, runs: false, checkpoints: false, events: false },
  };
}

const card = (costUsd: number, costStatus: 'observed' | 'not_reported' = 'observed') => ({ totals: { costStatus, usageComplete: true, costUsd } }) as unknown as PloegCard;

test('without a session, each intent answers from the brief alone', () => {
  const leased = workItemBrief(detail(), card(0.42));
  assert.equal(recordAnswer('doing', leased, 'internal'), 'It is being worked on now. Running now: builder.');
  assert.equal(recordAnswer('stopped', leased, 'internal'), 'It has not stopped. It is being worked on now.');
  assert.equal(recordAnswer('spend', leased, 'internal'), `Spend on the work so far: ${money(0.42)} (settled). Questions asked about it are counted apart.`);
  assert.equal(recordAnswer('next', leased, 'internal'), 'Nothing is needed now.');
  assert.equal(recordAnswer('who', leased, 'internal'), 'Builder is working on it now.');
  assert.equal(recordAnswer('done', leased, 'internal'), 'No. It is being worked on now.');
  assert.equal(recordAnswer('pull_request', leased, 'internal'), 'The record shows no pull request yet.');
  assert.equal(recordAnswer('preview', leased, 'internal'), 'There is no preview yet.');
  const review = workItemBrief(detail({ state: 'awaiting_review', pullRequest: { url: 'LEAK-url', number: 77, mergeState: 'conflicted', baseBranch: 'main', headSha: 'x', checkedAt: at } } as Partial<PloegItem>, [run({ state: 'finished' })]));
  assert.equal(recordAnswer('done', review, 'internal'), 'The agents finished. It is waiting for a person to review pull request #77.');
  assert.equal(recordAnswer('pull_request', review, 'internal'), 'Pull request #77 is open and has merge conflicts. It is linked on the Work Item page.');
  assert.equal(recordAnswer('who', review, 'internal'), 'No Role is working on it now. It is finished by the agents and waiting for a person to review the pull request. The last Run was the builder, in round 1.');
  assert.equal(recordAnswer('next', review, 'internal'), null, 'the record has no fixed next step for a review, so the model answers');
  assert.equal(recordAnswer('spend', review, 'internal'), 'Spend on the work is not reported yet.');
  const stopped = workItemBrief(detail({ state: 'needs_human', latestShift: { id: '5', closeReason: 'pool_exhausted' } } as Partial<PloegItem>, [run({ state: 'finished' })]));
  assert.equal(recordAnswer('stopped', stopped, 'internal'), 'It stopped because it used up its budget.');
  for (const intent of Object.keys(standing) as RecordIntent[]) assert.doesNotMatch(String(recordAnswer(intent, review, 'internal')), /LEAK/);
});

test('the next step is never answered from the record for a Client', () => {
  assert.equal(recordAnswer('next', workItemBrief(detail()), 'client'), null);
});

function fixtureSession(): BriefSession {
  return { session: fixture.session as Session, events: fixture.events as Event[], now: fixtureNow, viewer: false };
}

const fixtureDetail = (): PloegDetail => ({ ...fixture.ploeg, truncated: { shifts: false, runs: false, checkpoints: false, events: false } });

test('on the 059675b9 session the record answers say what the progress statechart says', () => {
  const brief = workItemBrief(fixtureDetail(), fixture.card, fixtureSession());
  const progress = sessionProgress(fixture.session, { events: fixture.events, now: fixtureNow });
  assert.equal(progress.phase, 'stopped');
  assert.equal(brief.progress?.phase, 'stopped');
  const doing = recordAnswer('doing', brief, 'internal')!;
  assert.ok(doing.startsWith(`${progress.meta.label}: Reviewer approved the change`), doing);
  assert.ok(doing.endsWith(progress.reason!.plain!), doing);
  assert.equal(recordAnswer('stopped', brief, 'internal'), progress.reason!.plain!);
  assert.match(progress.reason!.plain!, /Ploeg did not answer in time, so Unfold stopped the session\. Nothing runs again by itself\./);
  assert.equal(recordAnswer('spend', brief, 'internal'), `Spend on the work so far: ${progress.spend.text} (${progress.spend.note}). Questions asked about it are counted apart.`);
  assert.match(String(recordAnswer('spend', brief, 'internal')), /US\$\s0,03 \(observed, not settled · of US\$\s0,25\)/);
  assert.equal(recordAnswer('who', brief, 'internal'), 'No Role is working on it now. Implementer: finished; Reviewer: interrupted, approved in its transcript, not recorded.');
  const labels = progress.actions.filter((action: { id: string }) => !['open-session', 'cancel'].includes(action.id)).map((action: { label: string }) => action.label);
  assert.ok(labels.includes('Investigate'));
  assert.equal(recordAnswer('next', brief, 'internal'), `Nothing runs again by itself. From its session you can: ${labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`}.`);
  assert.ok(String(recordAnswer('done', brief, 'internal')).startsWith('No. Stopped: '));
  assert.equal(recordAnswer('pull_request', brief, 'internal'), 'The record shows no pull request yet.');
  assert.match(briefText(brief), /Progress as Unfold shows it: Stopped/);
  assert.doesNotMatch(briefText(brief) + JSON.stringify(brief), /retains this stopped|git diff --check|VERDICT/);
});

test('a session\'s failure message, blocker and review note never reach a record answer', () => {
  const base = fixture.session as Session;
  const failed = { ...base, status: 'failed', failure: { stage: 'agent_execution', message: 'LEAK-failure /home/runner token' }, blocker: 'LEAK-blocker' } as unknown as Session;
  const interrupted = { ...base, blocker: 'LEAK-blocker at /srv/secret' } as Session;
  const accepted = { ...base, status: 'completed', review: { decision: 'accepted', byName: 'LEAK-person', note: 'LEAK-note' } } as unknown as Session;
  for (const session of [failed, interrupted, accepted]) {
    const brief = workItemBrief(fixtureDetail(), fixture.card, { session, events: [], now: fixtureNow, viewer: false });
    for (const intent of Object.keys(standing) as RecordIntent[]) assert.doesNotMatch(String(recordAnswer(intent, brief, 'internal')), /LEAK/, `${session.status} ${intent}`);
    assert.doesNotMatch(briefText(brief), /LEAK/);
  }
  const brief = workItemBrief(fixtureDetail(), fixture.card, { session: failed, events: [], now: fixtureNow, viewer: false });
  assert.equal(recordAnswer('stopped', brief, 'internal'), 'It failed, and the record does not say why.');
});

const grant: AskGrant = { askId: 'p-1', key: 'sk-ask-key', models: ['glm-5.3-flash'], expiresAt: at, allowance: null };

function harness({ withAuthority = true, demo = false, item = detail() }: { withAuthority?: boolean; demo?: boolean; item?: PloegDetail } = {}) {
  const store = new Store(':memory:');
  const calls: string[] = [];
  const requests: string[] = [];
  const authority: AskAuthority = {
    async admit(_user, workItemId, _askId, question) { calls.push(`admit ${workItemId} ${question}`); return grant; },
    async finish(_user, workItemId, askId) { calls.push(`finish ${workItemId} ${askId}`); },
    async spend() { return { costUsd: 0.001, costStatus: 'settled' }; },
    async allowance() { return null; },
  };
  const items: AskWorkItems = {
    async detail() { return { ...item, demo }; },
    async card() { return { card: card(0.42), demo, fetchedAt: at } as never; },
  };
  const fetcher = (async (_url: string, init: RequestInit) => {
    requests.push(String(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'From the model.' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  const service = new AskService(store, items, withAuthority ? authority : undefined, { demo, gatewayUrl: withAuthority ? 'http://gateway.test/v1' : undefined, secrets: [], fetch: fetcher, now: () => new Date(fixtureNow) });
  return { store, calls, requests, service };
}

test('a standing question is answered from the record with no admission, no model call and no spend', async () => {
  const { service, calls, requests, store } = harness();
  const ask = await service.ask(owner, '42', 'Why did it stop?');
  assert.deepEqual([ask.status, ask.source, ask.intent, ask.costUsd, ask.costStatus, ask.model, ask.ploegAskId], ['answered', 'record', 'stopped', 0, 'settled', null, null]);
  assert.equal(ask.answer, 'It has not stopped. It is being worked on now.');
  assert.deepEqual(calls, []);
  assert.deepEqual(requests, []);
  assert.equal(store.asksAbout('42', 5)[0].source, 'record');
});

test('a standing question is answered from the record even when no Ploeg or gateway is configured', async () => {
  const { service } = harness({ withAuthority: false });
  assert.equal((await service.ask(owner, '42', 'What did it cost so far?')).source, 'record');
  await assert.rejects(service.ask(owner, '42', 'Which browsers did it test?'), (error: { code?: string }) => error.code === 'ask_unavailable');
});

test('a question that matches nothing goes through Ploeg admission and one model call', async () => {
  const { service, calls, requests } = harness();
  const ask = await service.ask(owner, '42', 'Which browsers did it test?');
  assert.deepEqual([ask.status, ask.source, ask.intent, ask.answer, ask.costStatus, ask.ploegAskId], ['answered', 'model', null, 'From the model.', 'pending', 'p-1']);
  assert.deepEqual(calls, ['admit 42 Which browsers did it test?', 'finish 42 p-1']);
  assert.equal(requests.length, 1);
});

test('asking the model anyway skips the record for a standing question', async () => {
  const { service, calls, requests } = harness();
  const ask = await service.ask(owner, '42', 'Why did it stop?', 'internal', { model: true });
  assert.deepEqual([ask.source, ask.intent, ask.answer], ['model', null, 'From the model.']);
  assert.deepEqual(calls, ['admit 42 Why did it stop?', 'finish 42 p-1']);
  assert.equal(requests.length, 1);
});

test('a standing question the record cannot answer for this audience goes to the model', async () => {
  const { service, calls } = harness();
  const ask = await service.ask(owner, '42', 'What should I do next?', 'client');
  assert.equal(ask.source, 'model');
  assert.equal(calls[0], 'admit 42 What should I do next?');
});

test('the demo answers standing questions from the same rules, and says it has no model for the rest', async () => {
  const { service, requests } = harness({ withAuthority: false, demo: true });
  const record = await service.ask(owner, '42', 'What did it cost?');
  assert.deepEqual([record.source, record.intent, record.costStatus, record.costUsd, record.answer], ['record', 'spend', 'demo', null, 'This is a demo, so no model ran and nothing was spent.']);
  const other = await service.ask(owner, '42', 'Which browsers did it test?');
  assert.deepEqual([other.status, other.source, other.costStatus], ['answered', 'record', 'demo']);
  assert.match(other.answer, /It cannot answer this one/);
  const anyway = await service.ask(owner, '42', 'Why did it stop?', 'internal', { model: true });
  assert.deepEqual([anyway.status, anyway.costStatus], ['refused', 'demo']);
  assert.match(anyway.failure ?? '', /no model to ask/);
  assert.deepEqual(requests, []);
});

test('the service finds the session that drives the Work Item and answers the 059675b9 fixture from it', async () => {
  const { service, store, calls } = harness({ item: fixtureDetail() });
  store.saveSession({ ...(fixture.session as Session), id: 'session-059675b9' });
  const insert = store.db.prepare('INSERT INTO events(session_id,type,at,actor,run_id,data) VALUES(?,?,?,?,?,?)');
  for (const event of fixture.events as Event[]) insert.run('session-059675b9', event.type, event.at, event.actor, event.runId ?? null, JSON.stringify(event.data));
  const progress = sessionProgress(fixture.session, { events: fixture.events, now: fixtureNow });
  const stopped = await service.ask(owner, '184', 'Why did it stop?');
  assert.deepEqual([stopped.source, stopped.answer], ['record', progress.reason!.plain!]);
  const who = await service.ask(owner, '184', 'Who is working on it?');
  assert.equal(who.answer, 'No Role is working on it now. Implementer: finished; Reviewer: interrupted, approved in its transcript, not recorded.');
  assert.deepEqual(calls, []);
});

test('Asks stored before record answers existed read as model or demo answers', async () => {
  const { service, store } = harness();
  const legacy = { id: 'old', workItemId: '42', workItemTitle: 't', askerId: 'owner', askerName: 'Owner', audience: 'internal', question: 'q', answer: 'a', status: 'answered', demo: false, ploegAskId: 'p', model: 'm', costUsd: 0.001, costStatus: 'settled', failure: null, createdAt: at, answeredAt: at };
  store.saveAsk(legacy as never);
  const [listed] = (await service.about(owner, '42')).asks;
  assert.deepEqual([listed.source, listed.intent], ['model', null]);
});
