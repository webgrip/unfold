import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { assembleCard, defaultCardRules, type CardContext, type CardJson, type CrackRecord } from '../src/cards/assemble.ts';
import { CardStore, firstLocalCrackId } from '../src/cards/card-store.ts';
import { addWorkdays, CrackError, crackView, CrackWorkflow, disputeWorkdays, maxCracksPerBug, mendWindowMicros, severityFloor, type CrackActor } from '../src/cards/cracks.ts';
import { parseWorkItemFacts, type WorkItemFacts } from '../src/cards/facts.ts';
import { micros, rfc3339Micros } from '../src/cards/go.ts';
import { parseCrack } from '../src/ploeg.ts';

const hour = 3_600_000_000;
const day = 24 * hour;
const minute = 60_000_000;
const t = rfc3339Micros;
const silver = (team: string) => team === 'silver';
const gold = (team: string) => team === 'gold';
const noReferees = () => [] as string[];

type Play = { number: number; mergedAt?: number; mergedBy?: string; state?: 'open' | 'merged' | 'closed'; labels?: string[]; reverted?: boolean };

class World {
  readonly db = new DatabaseSync(':memory:');
  readonly store = new CardStore(this.db);
  readonly flow = new CrackWorkflow(this.store);
  readonly now = micros('2026-10-07T12:00:00.123456Z');
  readonly items = new Map<string, WorkItemFacts>();
  private nextItem = 100;
  private nextPullRequest = 500;

  item(externalId: string, team: string, createdAt: number, plays: Play[] = [], state = 'open'): WorkItemFacts {
    const id = String(this.nextItem++);
    const facts = parseWorkItemFacts({
      workItem: { id, provider: 'vikunja', externalId, title: `Item ${externalId}`, state, team, createdAt: t(createdAt), target: { forge: 'forgejo', owner: 'webgrip', repo: 'ploeg', baseBranch: 'development' } },
      activityAt: t(createdAt),
      pullRequests: plays.map(p => {
        const merged = (p.state ?? 'merged') === 'merged';
        return {
          id: String(this.nextPullRequest++), forge: 'forgejo', owner: 'webgrip', repo: 'ploeg', number: p.number, state: p.state ?? 'merged', firstSeenAt: t(createdAt),
          mergedAt: merged ? t(p.mergedAt!) : null, mergedBy: merged ? p.mergedBy ?? null : null, labels: p.labels ?? [],
          reverts: p.reverted ? [{ forge: 'forgejo', owner: 'webgrip', repo: 'ploeg', number: 99, mergeCommitSha: null, mergedAt: t(this.now - day), mergedBy: 'anna', matchedBy: 'title', detectedAt: t(this.now - day) }] : [],
        };
      }),
    });
    this.items.set(id, facts);
    this.store.observe(facts, t(this.now));
    return facts;
  }

  done(facts: WorkItemFacts): void {
    facts.workItem.state = 'done';
    this.store.observe(facts, t(this.now));
  }

  context(): CardContext {
    return {
      now: this.now, rules: defaultCardRules(), bots: new Set(), facts: id => this.items.get(id), epicMembers: () => [], workItemByExternal: () => null,
      cracksOnCard: id => this.store.cracksOnCard(id), cracksOfBug: id => this.store.cracksOfBug(id), storedRarity: () => null, cohort: () => [],
      legacyShape: () => null, touchedBefore: () => false, liveUsage: false,
    };
  }

  card(facts: WorkItemFacts): CardJson {
    return assembleCard(facts, this.context());
  }

  propose(bug: WorkItemFacts, card: WorkItemFacts, by: string, severity: string, extra: { play?: number; share?: string; discovery?: string; note?: string; now?: number } = {}): CrackRecord {
    return this.flow.propose({ bug, card, cardJson: this.card(card), play: extra.play ?? 0, severity, share: extra.share ?? 'primary', discovery: extra.discovery ?? '', note: extra.note ?? '', by: actor(by), now: extra.now ?? this.now });
  }

  confirm(crack: CrackRecord, by: string, extra: { severity?: string; share?: string; cardReverted?: boolean; now?: number; teams?: (team: string) => boolean } = {}): CrackRecord {
    return this.flow.confirm({ crackId: crack.id, teams: extra.teams ?? silver, by: actor(by), severity: extra.severity ?? '', share: extra.share ?? '', note: '', cardReverted: extra.cardReverted ?? false, now: extra.now ?? this.now });
  }

  dispute(crack: CrackRecord, by: string, reason: string, now = this.now + hour): CrackRecord {
    return this.flow.dispute({ crackId: crack.id, teams: silver, by: actor(by), reason, now });
  }

  resolve(crack: CrackRecord, by: string, resolution: string, referees: (team: string) => string[] = noReferees, note = ''): CrackRecord {
    return this.flow.resolve({ crackId: crack.id, teams: silver, by: actor(by), resolution, note, referees, now: this.now + 2 * hour });
  }

  evolved(bug: WorkItemFacts, card: WorkItemFacts, by: string, note = ''): CrackRecord {
    return this.flow.evolved({ bug, card, cardJson: this.card(card), note, by: actor(by), now: this.now });
  }

  view(crack: CrackRecord) {
    const fresh = this.store.crack(crack.id)!;
    return crackView(fresh, id => this.store.workItem(id));
  }

  actions(card: WorkItemFacts): string[] {
    return this.store.auditTrail(card.workItem.id).map(entry => entry.action);
  }
}

function actor(person: string): CrackActor {
  return { person, audit: `operator:console:${person}` };
}

function refused(fn: () => unknown, code: string, status?: number): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof CrackError, `expected a CrackError, got ${String(error)}`);
    assert.equal(error.code, code, error.message);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
  });
}

function silverCard(w: World, externalId = 'card', steward = 'stewart', extra: Partial<Play> = {}): WorkItemFacts {
  return w.item(externalId, 'silver', w.now - 30 * day, [{ number: 10, mergedAt: w.now - 20 * day, mergedBy: steward, ...extra }]);
}

function silverBug(w: World, externalId = 'bug', plays: Play[] = []): WorkItemFacts {
  return w.item(externalId, 'silver', w.now - hour, plays);
}

const goCrackKeys = ['id', 'team', 'state', 'card', 'bug', 'play', 'severity', 'share', 'discovery', 'steward', 'note', 'proposedBy', 'proposedAt', 'confirmedBy', 'confirmedAt', 'disputeUntil', 'disputed',
  'disputedBy', 'disputedAt', 'disputeReason', 'resolvedBy', 'resolvedAt', 'resolution', 'evolvedBy', 'evolvedAt', 'mended'];

test('a crack needs two people to count and a referee to settle a dispute (TestCrackAttributionFlowNeedsTwoPeopleAndARefereeForDisputes)', () => {
  const w = new World();
  const card = silverCard(w);
  const bug = silverBug(w);

  let crack = w.propose(bug, card, 'fixer', 'S2');
  let view = w.view(crack);
  assert.equal(crack.state, 'proposed');
  assert.equal(crack.discovery, 'discovered');
  assert.equal(view.steward, 'stewart');
  assert.equal(view.play, 10);
  assert.deepEqual(view.confirmedBy, []);
  assert.equal(view.bug.externalRef, 'VIK-bug');
  assert.equal(view.card.externalRef, 'VIK-card');
  assert.equal(view.mended, null);
  assert.equal(crack.proposedAt, t(w.now));
  assert.equal(crack.pullRequest?.number, 10);
  assert.equal(crack.pullRequest?.id, card.pullRequests[0]!.id);
  assert.equal(w.card(card).condition, null, 'an unconfirmed proposal cracked the card');

  for (const person of ['Stewart', 'fixer', 'FIXER']) refused(() => w.confirm(crack, person), 'forbidden_actor', 403);
  assert.equal(w.store.crack(crack.id)!.state, 'proposed');

  crack = w.confirm(crack, 'second', { severity: 'S3' });
  view = w.view(crack);
  assert.equal(crack.state, 'confirmed');
  assert.equal(crack.severity, 'S3');
  assert.equal(crack.share, 'primary');
  assert.deepEqual(view.confirmedBy, ['fixer', 'second']);
  assert.equal(crack.confirmedAt, t(w.now));
  assert.equal(crack.disputeUntil, t(addWorkdays(w.now, disputeWorkdays)));
  assert.equal(crack.disputeUntil, '2026-10-14T12:00:00.123456Z');
  refused(() => w.confirm(crack, 'third'), 'invalid_state', 409);

  const cracked = w.card(card);
  assert.equal(cracked.condition?.state, 'cracked');
  assert.equal(cracked.condition?.cracks.length, 1);
  assert.equal(cracked.condition?.cracks[0]!.disputed, false);

  refused(() => w.dispute(crack, 'second', 'not mine'), 'forbidden_actor', 403);
  refused(() => w.dispute(crack, 'stewart', 'too late', addWorkdays(w.now, disputeWorkdays) + minute), 'dispute_closed', 409);
  refused(() => w.dispute(crack, 'stewart', '   '), 'invalid_request', 400);
  refused(() => w.dispute(crack, 'stewart', 'x'.repeat(2001)), 'invalid_request', 400);
  crack = w.dispute(crack, 'stewart', 'the bug predates my change');
  view = w.view(crack);
  assert.equal(crack.state, 'disputed');
  assert.equal(view.disputed, true);
  assert.equal(crack.disputedBy, 'stewart');
  assert.equal(crack.disputeReason, 'the bug predates my change');
  assert.equal(w.card(card).condition?.cracks[0]!.disputed, true, 'a disputed crack must still show on the card');

  for (const person of ['stewart', 'fixer', 'SECOND']) refused(() => w.resolve(crack, person, 'unlinked'), 'forbidden_actor', 403);
  const refs = (team: string) => (team === 'silver' ? ['ref'] : []);
  refused(() => w.resolve(crack, 'bystander', 'unlinked', refs), 'forbidden_actor', 403);
  refused(() => w.resolve(crack, 'ref', 'maybe', refs), 'invalid_request', 400);
  crack = w.resolve(crack, 'REF', 'unlinked', refs);
  assert.equal(crack.state, 'unlinked');
  assert.equal(crack.resolution, 'unlinked');
  assert.equal(crack.resolvedBy, 'REF');
  assert.equal(w.card(card).condition, null, 'an unlinked crack still shows');

  assert.deepEqual(w.actions(card), ['card.crack_proposed', 'card.crack_confirmed', 'card.crack_disputed', 'card.crack_resolved']);
  const trail = w.store.auditTrail(card.workItem.id);
  assert.deepEqual(trail.map(entry => entry.actor), ['operator:console:fixer', 'operator:console:second', 'operator:console:stewart', 'operator:console:REF']);
  assert.deepEqual(trail[0]!.detail, { crackId: crack.id, bugWorkItemId: bug.workItem.id, pr: 10, severity: 'S2', share: 'primary', discovery: 'discovered' });
  assert.deepEqual(trail[1]!.detail, { severity: 'S3', share: 'primary', crackId: crack.id, bugWorkItemId: bug.workItem.id });
  assert.deepEqual(trail[3]!.detail, { resolution: 'unlinked', crackId: crack.id, bugWorkItemId: bug.workItem.id });

  const listed = w.store.cracksOf(bug.workItem.id);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.state, 'unlinked');
});

test('a step on another team\'s crack is not found', () => {
  const w = new World();
  const crack = w.propose(silverBug(w), silverCard(w), 'fixer', 'S2');
  refused(() => w.confirm(crack, 'second', { teams: gold }), 'not_found', 404);
  refused(() => w.flow.confirm({ crackId: '424242', teams: silver, by: actor('second'), severity: '', share: '', note: '', cardReverted: false, now: w.now }), 'not_found', 404);
  refused(() => w.confirm(crack, ''), 'invalid_request', 400);
  refused(() => w.confirm(crack, 'second', { severity: 'S5' }), 'invalid_request', 400);
  refused(() => w.confirm(crack, 'second', { share: 'most' }), 'invalid_request', 400);
  assert.equal(w.store.crack(crack.id)!.state, 'proposed');
});

test('the confirmer may change the share and a dispute is still open at the last instant of its window', () => {
  const w = new World();
  const card = silverCard(w);
  let crack = w.propose(silverBug(w), card, 'fixer', 'S2');
  crack = w.confirm(crack, 'second', { share: 'contributing' });
  assert.equal(crack.share, 'contributing');
  assert.equal(crack.severity, 'S2');
  crack = w.dispute(crack, 'Stewart', 'not mine', micros(crack.disputeUntil!));
  assert.equal(crack.state, 'disputed');
});

test('an upheld dispute confirms the crack again and is final (TestCrackDisputeUpheldConfirmsAgain)', () => {
  const w = new World();
  const card = silverCard(w);
  let crack = w.propose(silverBug(w), card, 'fixer', 'S1');
  crack = w.confirm(crack, 'second');
  crack = w.dispute(crack, 'stewart', 'no');
  crack = w.resolve(crack, 'anyone', 'upheld', noReferees, 'the play did cause it');
  assert.equal(crack.state, 'confirmed');
  assert.equal(w.view(crack).disputed, false);
  assert.equal(crack.resolution, 'upheld');
  assert.equal(crack.severity, 'S1');
  assert.deepEqual(w.store.auditTrail(card.workItem.id).at(-1)!.detail, { resolution: 'upheld', reason: 'the play did cause it', crackId: crack.id, bugWorkItemId: crack.bugWorkItemId });
  refused(() => w.dispute(crack, 'stewart', 'again'), 'invalid_state', 409);
  refused(() => w.resolve(crack, 'anyone', 'unlinked'), 'invalid_state', 409);
});

test('a referee list of another team does not restrict this team\'s referees', () => {
  const w = new World();
  let crack = w.propose(silverBug(w), silverCard(w), 'fixer', 'S2');
  crack = w.confirm(crack, 'second');
  crack = w.dispute(crack, 'stewart', 'no');
  crack = w.resolve(crack, 'anyone', 'unlinked', team => (team === 'gold' ? ['goldref'] : []));
  assert.equal(crack.state, 'unlinked');
});

test('a proposal is refused when it is invalid, unmerged, merged after the bug, unproven or one too many (TestCrackProposalRefusals)', () => {
  const w = new World();
  const card = silverCard(w);
  const draft = w.item('draft', 'silver', w.now - 30 * day);
  const goldCard = w.item('gold-card', 'gold', w.now - 30 * day, [{ number: 30, mergedAt: w.now - 20 * day, mergedBy: 'goldie' }]);
  const bug = silverBug(w);
  const later = w.item('later', 'silver', w.now - 2 * day, [{ number: 11, mergedAt: w.now + hour, mergedBy: 'stewart' }]);

  refused(() => w.propose(bug, card, 'fixer', 'S9'), 'invalid_request', 400);
  refused(() => w.propose(bug, bug, 'fixer', 'S2'), 'invalid_request', 400);
  refused(() => w.propose(bug, card, 'fixer', 'S2', { share: 'most' }), 'invalid_request', 400);
  refused(() => w.propose(bug, card, 'fixer', 'S2', { play: -1 }), 'invalid_request', 400);
  refused(() => w.propose(bug, card, 'fixer', 'S2', { note: 'x'.repeat(2001) }), 'invalid_request', 400);
  refused(() => w.propose(bug, card, 'fixer', 'S2', { discovery: 'self' }), 'invalid_request', 400);
  refused(() => w.propose(bug, card, '', 'S2'), 'invalid_request', 400);
  refused(() => w.propose(bug, draft, 'fixer', 'S2'), 'not_merged', 409);
  refused(() => w.propose(bug, card, 'fixer', 'S2', { play: 12 }), 'not_merged', 409);
  refused(() => w.propose(bug, later, 'fixer', 'S2', { play: 11 }), 'merged_after_bug', 409);
  refused(() => w.propose(bug, later, 'fixer', 'S2'), 'not_merged', 409);
  refused(() => w.propose(bug, goldCard, 'fixer', 'S2'), 'not_found', 404);
  refused(() => w.propose(bug, card, 'fixer', 'S2', { discovery: 'concealed' }), 'concealment_unproven', 409);
  assert.deepEqual(w.store.cracksOfBug(bug.workItem.id), [], 'a refused proposal left a crack');
  assert.deepEqual(w.actions(card), [], 'a refused proposal was audited');

  const self = w.propose(bug, card, 'stewart', 'S2', { discovery: 'concealed' });
  assert.equal(self.discovery, 'self', "the steward's own report is self-discovered whatever was asked");
  refused(() => w.propose(bug, card, 'fixer', 'S2'), 'already_attributed', 409);

  for (let i = 0; i < maxCracksPerBug - 1; i++) {
    const other = w.item(`other-${i}`, 'silver', w.now - 30 * day, [{ number: 40 + i, mergedAt: w.now - 20 * day, mergedBy: 'someone' }]);
    w.propose(bug, other, 'fixer', 'S3');
  }
  const fourth = w.item('fourth', 'silver', w.now - 30 * day, [{ number: 50, mergedAt: w.now - 20 * day, mergedBy: 'someone' }]);
  refused(() => w.propose(bug, fourth, 'fixer', 'S3'), 'crack_limit', 409);
  assert.equal(w.store.cracksOfBug(bug.workItem.id).length, maxCracksPerBug);
});

test('only counting cracks hold a bug at its limit', () => {
  const w = new World();
  const bug = silverBug(w);
  const cards = [0, 1, 2].map(i => w.item(`c-${i}`, 'silver', w.now - 30 * day, [{ number: 60 + i, mergedAt: w.now - 20 * day, mergedBy: 'someone' }]));
  const cracks = cards.map(card => w.propose(bug, card, 'fixer', 'S3'));
  w.evolved(bug, cards[0]!, 'fixer');
  let unlinked = w.confirm(cracks[1]!, 'second');
  unlinked = w.dispute(unlinked, 'someone', 'not mine');
  w.resolve(unlinked, 'ref', 'unlinked');
  const more = [3, 4].map(i => w.item(`c-${i}`, 'silver', w.now - 30 * day, [{ number: 60 + i, mergedAt: w.now - 20 * day, mergedBy: 'someone' }]));
  for (const card of more) w.propose(bug, card, 'fixer', 'S3');
  const last = w.item('c-5', 'silver', w.now - 30 * day, [{ number: 65, mergedAt: w.now - 20 * day, mergedBy: 'someone' }]);
  refused(() => w.propose(bug, last, 'fixer', 'S3'), 'crack_limit', 409);
});

test('concealed is accepted once the steward merged the bug\'s fix, and an explicit play is attributed', () => {
  const w = new World();
  const card = w.item('card', 'silver', w.now - 30 * day, [
    { number: 10, mergedAt: w.now - 20 * day, mergedBy: 'stewart' },
    { number: 12, mergedAt: w.now - 10 * day, mergedBy: 'stewart' },
  ]);
  const bug = silverBug(w, 'bug', [{ number: 20, mergedAt: w.now - minute, mergedBy: 'Stewart' }]);
  const crack = w.propose(bug, card, 'fixer', 'S3', { discovery: 'concealed', play: 10 });
  assert.equal(crack.discovery, 'concealed');
  assert.equal(crack.pullRequest?.number, 10);
  const latest = w.propose(bug, w.item('card-2', 'silver', w.now - 30 * day, [
    { number: 13, mergedAt: w.now - 20 * day, mergedBy: 'someone' },
    { number: 14, mergedAt: w.now - 10 * day, mergedBy: 'someone' },
  ]), 'fixer', 'S3');
  assert.equal(latest.pullRequest?.number, 14, 'play 0 attributes the latest play merged before the bug');
});

test('a reverted card\'s crack is at least S2, at proposal and at confirmation (TestRevertsMarkCardsAndFloorTheirCrackSeverity)', () => {
  const w = new World();
  const card = silverCard(w, 'card', 'stewart', { reverted: true });
  assert.equal(w.card(card).grade?.inputs.reliability.reverted, true);
  const bug = silverBug(w);
  const crack = w.propose(bug, card, 'fixer', 'S4');
  assert.equal(crack.severity, 'S2');
  assert.equal(w.store.auditTrail(card.workItem.id)[0]!.detail.severity, 'S2');
  const confirmed = w.confirm(crack, 'second', { severity: 'S3', cardReverted: true });
  assert.equal(confirmed.severity, 'S2');

  const plain = silverCard(w, 'plain');
  const kept = w.propose(silverBug(w, 'bug-2'), plain, 'fixer', 'S4');
  assert.equal(kept.severity, 'S4');
  assert.equal(w.confirm(kept, 'second', { severity: 'S3' }).severity, 'S3');
  assert.equal(w.confirm(w.propose(silverBug(w, 'bug-3'), plain, 'fixer', 'S1'), 'second', { cardReverted: true }).severity, 'S1');

  assert.equal(severityFloor('S1', true), 'S1');
  assert.equal(severityFloor('S2', true), 'S2');
  assert.equal(severityFloor('S3', true), 'S2');
  assert.equal(severityFloor('S4', true), 'S2');
  assert.equal(severityFloor('S4', false), 'S4');
});

test('mends are recorded from the bug\'s merged fix and confirmed after their window (TestMendsAreRecordedConfirmedAndReopened)', () => {
  const w = new World();
  const card = silverCard(w);
  const fixedAt = w.now - minute;
  const bug = silverBug(w, 'bug', [{ number: 20, mergedAt: fixedAt, mergedBy: 'stewart', labels: ['HotFix'] }]);

  let crack = w.propose(bug, card, 'fixer', 'S2');
  let view = w.view(crack);
  assert.deepEqual(view.mended, { at: t(fixedAt), by: 'stewart', pr: 20, bySteward: true, confirmedAt: null });
  assert.equal(crack.mendPullRequest?.id, bug.pullRequests[0]!.id);
  crack = w.confirm(crack, 'second');
  assert.equal(w.card(card).condition?.state, 'cracked');

  assert.deepEqual(w.flow.confirmMends(w.now + 29 * day, () => true), { confirmed: 0, reopened: 0 }, 'inside the window');
  const after = fixedAt + mendWindowMicros + hour;
  assert.deepEqual(w.flow.confirmMends(after, () => false), { confirmed: 0, reopened: 0 }, 'a mend whose bug is still open was confirmed');
  assert.deepEqual(w.flow.confirmMends(after, () => undefined), { confirmed: 0, reopened: 0 }, 'a mend whose bug is unknown was confirmed');
  w.done(bug);
  const done = (id: string) => (w.store.workItem(id) ? w.store.workItem(id)!.state === 'done' : undefined);
  assert.deepEqual(w.flow.confirmMends(after, done), { confirmed: 1, reopened: 0 });
  assert.deepEqual(w.flow.confirmMends(after + day, done), { confirmed: 0, reopened: 0 }, 'a settled mend was settled again');

  view = w.view(crack);
  assert.equal(view.mended?.confirmedAt, t(after));
  const mendedCard = w.card(card);
  assert.equal(mendedCard.condition?.state, 'mended');
  assert.equal(mendedCard.condition?.cracks[0]!.mended?.confirmedAt, t(after));

  assert.deepEqual(w.actions(card), ['card.crack_proposed', 'card.crack_mended', 'card.crack_confirmed', 'card.mend_confirmed']);
  const trail = w.store.auditTrail(card.workItem.id);
  assert.deepEqual(trail[1]!.detail, { crackId: crack.id, bugWorkItemId: bug.workItem.id, pr: 20, bySteward: true });
  assert.equal(trail[3]!.actor, 'unfold:sweep');
  assert.deepEqual(trail[3]!.detail, { crackId: crack.id });
});

test('a mend at exactly the end of its window is confirmed, and a mend of a crack that does not count is not', () => {
  const w = new World();
  const fixedAt = w.now - minute;
  const bug = silverBug(w, 'bug', [{ number: 20, mergedAt: fixedAt, mergedBy: 'helper' }]);
  const confirmed = w.confirm(w.propose(bug, silverCard(w, 'a'), 'fixer', 'S2'), 'second');
  const proposed = w.propose(bug, silverCard(w, 'b'), 'fixer', 'S2');
  assert.notEqual(w.store.crack(proposed.id)!.mendedAt, null, 'a proposed crack records its mend');
  w.done(bug);
  assert.deepEqual(w.flow.confirmMends(fixedAt + mendWindowMicros - 1, () => true), { confirmed: 0, reopened: 0 });
  assert.deepEqual(w.flow.confirmMends(fixedAt + mendWindowMicros, () => true), { confirmed: 1, reopened: 0 });
  assert.notEqual(w.store.crack(confirmed.id)!.mendConfirmedAt, null);
  assert.equal(w.store.crack(proposed.id)!.mendConfirmedAt, null);
});

test('a later merged fix mends the cracks without one, from the latest merged pull request, once', () => {
  const w = new World();
  const card = silverCard(w);
  const bug = silverBug(w);
  const crack = w.confirm(w.propose(bug, card, 'fixer', 'S2'), 'second');
  const evolvedCard = silverCard(w, 'evolved');
  w.evolved(bug, evolvedCard, 'fixer');
  assert.equal(w.store.crack(crack.id)!.mendedAt, null);
  assert.equal(w.flow.syncMends(bug, 'webhook:forgejo', w.now), 0, 'a bug without a merged fix mended a crack');

  const fixed = parseWorkItemFacts({
    ...structuredClone(bug),
    pullRequests: [
      { id: '900', forge: 'forgejo', owner: 'webgrip', repo: 'ploeg', number: 21, state: 'merged', firstSeenAt: t(w.now), mergedAt: t(w.now + 2 * hour), mergedBy: 'helper' },
      { id: '901', forge: 'forgejo', owner: 'webgrip', repo: 'ploeg', number: 22, state: 'merged', firstSeenAt: t(w.now), mergedAt: t(w.now + 3 * hour), mergedBy: 'Stewart' },
      { id: '902', forge: 'forgejo', owner: 'webgrip', repo: 'ploeg', number: 23, state: 'open', firstSeenAt: t(w.now) },
    ],
  });
  assert.equal(w.flow.syncMends(fixed, 'webhook:forgejo', w.now + 4 * hour), 1);
  assert.equal(w.flow.syncMends(fixed, 'webhook:forgejo', w.now + 5 * hour), 0, 'a mended crack was mended again');
  const view = w.view(crack);
  assert.deepEqual(view.mended, { at: t(w.now + 3 * hour), by: 'Stewart', pr: 22, bySteward: true, confirmedAt: null });
  assert.equal(w.store.cracksOnCard(evolvedCard.workItem.id)[0]!.mendedAt, null, 'an evolved attribution was mended');
  const mended = w.store.auditTrail(card.workItem.id).at(-1)!;
  assert.equal(mended.action, 'card.crack_mended');
  assert.equal(mended.actor, 'webhook:forgejo');
  assert.equal(mended.at, t(w.now + 4 * hour));
});

test('a mend by another person co-signs, and a new confirmed crack on the card within the window reopens it (TestAMendByAnotherPersonCoSignsAndAReCrackReopensIt)', () => {
  const w = new World();
  const card = silverCard(w);
  const fixedAt = w.now - minute;
  const bug = silverBug(w, 'bug', [{ number: 20, mergedAt: fixedAt, mergedBy: 'helper' }]);
  const crack = w.confirm(w.propose(bug, card, 'fixer', 'S2'), 'second');
  assert.equal(w.view(crack).mended?.bySteward, false);
  assert.equal(w.view(crack).mended?.by, 'helper');
  assert.deepEqual(w.store.cosignedCards(['Helper']), [card.workItem.id]);
  assert.deepEqual(w.store.cosignedCards(['stewart']), []);

  const second = silverBug(w, 'bug-2');
  const proposedOnly = w.propose(second, card, 'fixer', 'S3');
  w.done(bug);
  const done = (id: string) => w.store.workItem(id)?.state === 'done';
  assert.deepEqual(w.flow.confirmMends(fixedAt + mendWindowMicros - hour, done), { confirmed: 0, reopened: 0 }, 'a proposed re-crack reopened the mend');

  w.confirm(proposedOnly, 'second');
  assert.deepEqual(w.flow.confirmMends(fixedAt + mendWindowMicros + hour, done), { confirmed: 0, reopened: 1 }, 'want the mend reopened by the new crack');
  const reopened = w.view(crack);
  assert.equal(reopened.mended?.reopenedAt, t(fixedAt + mendWindowMicros + hour));
  assert.equal(reopened.mended?.confirmedAt, null);
  assert.equal(w.card(card).condition?.state, 'cracked');
  assert.ok(w.actions(card).includes('card.mend_reopened'));
  assert.deepEqual(w.flow.confirmMends(fixedAt + mendWindowMicros + 2 * hour, done), { confirmed: 0, reopened: 0 }, 'a reopened mend was settled again');
});

test('a re-crack proposed after the mend window does not reopen the mend', () => {
  const w = new World();
  const card = w.item('card', 'silver', w.now - 60 * day, [{ number: 10, mergedAt: w.now - 50 * day, mergedBy: 'stewart' }]);
  const fixedAt = w.now - 40 * day;
  const bug = w.item('bug', 'silver', w.now - 41 * day, [{ number: 20, mergedAt: fixedAt, mergedBy: 'helper' }]);
  const crack = w.confirm(w.propose(bug, card, 'fixer', 'S2', { now: w.now - 40 * day }), 'second', { now: w.now - 40 * day });
  w.confirm(w.propose(silverBug(w, 'bug-2'), card, 'fixer', 'S3'), 'second');
  w.done(bug);
  assert.deepEqual(w.flow.confirmMends(w.now, id => w.store.workItem(id)?.state === 'done'), { confirmed: 1, reopened: 0 });
  assert.notEqual(w.store.crack(crack.id)!.mendConfirmedAt, null);
});

test('marking a card evolved gives it evolved and no crack (TestMarkEvolvedGivesTheCardEvolvedAndNoCrack)', () => {
  const w = new World();
  const card = silverCard(w);
  const bug = silverBug(w);
  refused(() => w.evolved(bug, card, 'Stewart'), 'forbidden_actor', 403);
  refused(() => w.evolved(bug, bug, 'fixer'), 'invalid_request', 400);
  refused(() => w.evolved(bug, card, 'fixer', 'x'.repeat(2001)), 'invalid_request', 400);
  refused(() => w.evolved(bug, card, ''), 'invalid_request', 400);
  refused(() => w.evolved(bug, w.item('gold', 'gold', w.now - 30 * day, [{ number: 30, mergedAt: w.now - 20 * day, mergedBy: 'goldie' }]), 'fixer'), 'not_found', 404);

  const crack = w.propose(bug, card, 'fixer', 'S2', { note: 'first note' });
  refused(() => w.evolved(bug, card, 'STEWART'), 'forbidden_actor', 403);
  const evolved = w.evolved(bug, card, 'fixer', 'the requirement changed');
  assert.equal(evolved.id, crack.id);
  assert.equal(evolved.state, 'evolved');
  assert.equal(evolved.evolvedBy, 'fixer');
  assert.equal(evolved.evolvedAt, t(w.now));
  assert.equal(evolved.note, 'the requirement changed');
  const cardJson = w.card(card);
  assert.equal(cardJson.evolved, true);
  assert.equal(cardJson.condition, null);
  refused(() => w.confirm(crack, 'second'), 'invalid_state', 409);

  const fresh = silverBug(w, 'bug-2');
  const direct = w.evolved(fresh, card, 'fixer');
  assert.equal(direct.state, 'evolved');
  assert.equal(direct.severity, null);
  assert.equal(direct.note, null);
  assert.equal(w.view(direct).play, null);
  assert.deepEqual(w.actions(card), ['card.crack_proposed', 'card.crack_evolved', 'card.crack_evolved']);

  const keptNote = w.propose(silverBug(w, 'bug-3'), card, 'fixer', 'S2', { note: 'kept' });
  assert.equal(w.evolved(w.items.get(keptNote.bugWorkItemId)!, card, 'second').note, 'kept', 'an empty note keeps the proposal\'s note');
});

test('a confirmed, disputed or unlinked attribution is not changed to evolved', () => {
  const w = new World();
  const card = silverCard(w);
  const bugs = ['b1', 'b2', 'b3'].map(id => silverBug(w, id));
  let confirmed = w.confirm(w.propose(bugs[0]!, card, 'fixer', 'S2'), 'second');
  refused(() => w.evolved(bugs[0]!, card, 'fixer'), 'invalid_state', 409);
  let disputed = w.dispute(w.confirm(w.propose(bugs[1]!, card, 'fixer', 'S2'), 'second'), 'stewart', 'no');
  refused(() => w.evolved(bugs[1]!, card, 'fixer'), 'invalid_state', 409);
  const unlinked = w.resolve(w.dispute(w.confirm(w.propose(bugs[2]!, card, 'fixer', 'S2'), 'second'), 'stewart', 'no'), 'ref', 'unlinked');
  refused(() => w.evolved(bugs[2]!, card, 'fixer'), 'invalid_state', 409);
  confirmed = w.store.crack(confirmed.id)!;
  disputed = w.store.crack(disputed.id)!;
  assert.deepEqual([confirmed.state, disputed.state, w.store.crack(unlinked.id)!.state], ['confirmed', 'disputed', 'unlinked']);
});

test('AddWorkdays skips weekends (TestAddWorkdaysSkipsWeekends)', () => {
  assert.equal(t(addWorkdays(micros('2026-10-02T15:00:00Z'), 5)), '2026-10-09T15:00:00Z', 'five working days after Friday is the next Friday');
  assert.equal(t(addWorkdays(micros('2026-10-03T09:00:00Z'), 1)), '2026-10-05T09:00:00Z', 'one working day after Saturday is Monday');
  assert.equal(t(addWorkdays(micros('2026-10-07T23:30:00.000001Z'), 3)), '2026-10-12T23:30:00.000001Z', 'weekdays are counted in UTC');
  assert.equal(addWorkdays(micros('2026-10-07T12:00:00Z'), 0), micros('2026-10-07T12:00:00Z'));
});

function importedRow(db: DatabaseSync, c: CrackRecord): void {
  db.prepare(`INSERT INTO card_cracks(id,team,state,card_work_item_id,bug_work_item_id,bug_provider,bug_external_id,pull_request,severity,share,discovery,steward,note,proposed_by,proposed_at,origin)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ploeg')`).run(Number(c.id), c.team, c.state, c.cardWorkItemId, c.bugWorkItemId, c.bug.provider, c.bug.externalId, c.pullRequest ? JSON.stringify(c.pullRequest) : null, c.severity, c.share, c.discovery, c.steward, c.note, c.proposedBy, c.proposedAt);
}

test('a crack imported from Ploeg earlier keeps its id and its workflow, and a recorded crack gets a local id', () => {
  const w = new World();
  const card = silverCard(w);
  const bug = silverBug(w);
  const imported: CrackRecord = {
    id: '42', team: 'silver', state: 'proposed', cardWorkItemId: card.workItem.id, bugWorkItemId: bug.workItem.id, bug: { provider: 'vikunja', externalId: 'bug' },
    pullRequest: { id: card.pullRequests[0]!.id, forge: 'forgejo', owner: 'webgrip', repo: 'ploeg', number: 10 }, severity: 'S3', share: 'primary', discovery: 'discovered', steward: 'stewart', note: null,
    proposedBy: 'fixer', proposedAt: t(w.now - day), confirmedBy: null, confirmedAt: null, disputeUntil: null, disputedBy: null, disputedAt: null, disputeReason: null,
    resolvedBy: null, resolvedAt: null, resolution: null, evolvedBy: null, evolvedAt: null, mendPullRequest: null, mendNumber: null, mendedAt: null, mendedBy: null, mendBySteward: null, mendConfirmedAt: null, mendReopenedAt: null,
  };
  importedRow(w.db, imported);
  assert.deepEqual(w.store.crack('42'), imported);
  refused(() => w.propose(bug, card, 'fixer', 'S2'), 'already_attributed', 409);

  const local = w.propose(bug, silverCard(w, 'card-2'), 'fixer', 'S2');
  assert.ok(Number(local.id) >= firstLocalCrackId, `local id ${local.id}`);
  assert.equal(w.store.cracksOfBug(bug.workItem.id).length, 2);
  const again = new CardStore(w.db);
  const next = new CrackWorkflow(again).propose({ bug: silverBug(w, 'bug-2'), card, cardJson: w.card(card), play: 0, severity: 'S2', share: 'primary', discovery: '', note: '', by: actor('fixer'), now: w.now });
  assert.ok(Number(next.id) > Number(local.id), `a reopened store reused id ${next.id}`);

  const confirmed = w.confirm(w.store.crack('42')!, 'second');
  assert.equal(confirmed.id, '42');
  assert.equal(confirmed.state, 'confirmed');
});

test('every crack view is one the crack API parser accepts, with Ploeg\'s fields', () => {
  const w = new World();
  const card = silverCard(w);
  const fixedAt = w.now - minute;
  const views: ReturnType<World['view']>[] = [];
  const mendedBug = silverBug(w, 'mended', [{ number: 20, mergedAt: fixedAt, mergedBy: 'helper' }]);
  const proposed = w.propose(silverBug(w, 'p'), card, 'fixer', 'S2', { note: 'a note' });
  views.push(w.view(proposed));
  const confirmed = w.confirm(w.propose(mendedBug, card, 'fixer', 'S3'), 'second');
  views.push(w.view(confirmed));
  const disputed = w.dispute(w.confirm(w.propose(silverBug(w, 'd'), card, 'fixer', 'S1'), 'second'), 'stewart', 'not mine');
  views.push(w.view(disputed));
  const upheld = w.resolve(w.dispute(w.confirm(w.propose(silverBug(w, 'u'), card, 'fixer', 'S4'), 'second'), 'stewart', 'no'), 'ref', 'upheld');
  views.push(w.view(upheld));
  const unlinked = w.resolve(w.dispute(w.confirm(w.propose(silverBug(w, 'x'), card, 'fixer', 'S4'), 'second'), 'stewart', 'no'), 'ref', 'unlinked');
  views.push(w.view(unlinked));
  const draft = w.item('draft', 'silver', w.now - 30 * day);
  views.push(w.view(w.evolved(silverBug(w, 'e'), draft, 'fixer')));
  const recracked = w.confirm(w.propose(silverBug(w, 'r'), card, 'fixer', 'S2'), 'second');
  views.push(w.view(recracked));
  w.done(mendedBug);
  w.flow.confirmMends(fixedAt + mendWindowMicros + hour, () => true);
  views.push(w.view(confirmed));
  const otherCard = silverCard(w, 'other');
  const otherBug = silverBug(w, 'other-bug', [{ number: 21, mergedAt: fixedAt, mergedBy: 'stewart' }]);
  const settled = w.confirm(w.propose(otherBug, otherCard, 'fixer', 'S2'), 'second');
  w.flow.confirmMends(fixedAt + mendWindowMicros + 2 * hour, () => true);
  views.push(w.view(settled));
  const unknownItem = crackView(w.store.crack(proposed.id)!, () => null);
  views.push(unknownItem);

  assert.deepEqual(new Set(views.map(v => v.state)), new Set(['proposed', 'confirmed', 'disputed', 'unlinked', 'evolved']));
  for (const view of views) {
    const json = JSON.parse(JSON.stringify(view));
    assert.deepEqual(Object.keys(json), goCrackKeys, `view ${view.id} has Ploeg's crack fields in Ploeg's order`);
    const parsed = parseCrack(json);
    assert.equal(parsed.id, view.id);
    assert.equal(parsed.state, view.state);
    assert.equal(parsed.team, 'silver');
    assert.deepEqual(parsed.card.workItemId, view.card.workItemId);
    assert.equal(parsed.bug.externalRef, view.bug.externalRef ?? '');
    assert.equal(parsed.play, view.play);
    assert.equal(parsed.severity, view.severity);
    assert.equal(parsed.steward, view.steward);
    assert.deepEqual(parsed.confirmedBy, view.confirmedBy);
    assert.equal(parsed.disputed, view.disputed);
    assert.equal(parsed.mended === null, view.mended === null);
    if (view.mended) {
      assert.equal(parsed.mended!.pr, view.mended.pr);
      assert.equal(parsed.mended!.bySteward, view.mended.bySteward);
      assert.equal(parsed.mended!.confirmedAt, view.mended.confirmedAt);
      assert.equal(parsed.mended!.reopenedAt, view.mended.reopenedAt ?? null);
      assert.ok(!('reopenedAt' in json.mended) || json.mended.reopenedAt !== null, 'reopenedAt is omitted, never null, as Go\'s omitempty');
    }
  }

  const [p, c, d, up, un, ev, , reopenedMend, settledMend, unknown] = views;
  assert.equal(p!.note, 'a note');
  assert.equal(p!.card.title, 'Item card');
  assert.equal(p!.card.externalRef, 'VIK-card');
  assert.equal(c!.mended?.by, 'helper');
  assert.equal(d!.disputeReason, 'not mine');
  assert.equal(up!.resolution, 'upheld');
  assert.equal(un!.resolution, 'unlinked');
  assert.equal(ev!.steward, null, 'a card without a steward shows none');
  assert.equal(ev!.severity, null);
  assert.deepEqual(ev!.confirmedBy, []);
  assert.equal(reopenedMend!.mended?.reopenedAt, t(fixedAt + mendWindowMicros + hour), 'the re-crack reopened the first mend');
  assert.equal(settledMend!.mended?.confirmedAt, t(fixedAt + mendWindowMicros + 2 * hour));
  assert.deepEqual(unknown!.card, { workItemId: card.workItem.id, title: '' });
  assert.equal(unknown!.bug.externalRef, 'VIK-p', 'the bug reference comes from the crack itself');
});
