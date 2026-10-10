import { micros, rfc3339Micros } from './go.ts';
import type { WorkItemFacts } from './facts.ts';
import { itemRef, type CardJson, type CrackRecord } from './assemble.ts';
import type { CardStore } from './card-store.ts';

/** A crack step Unfold refused (Ploeg ADR-0052, now root ADR-0030): `code` is one of Ploeg's attribution refusal codes. */
export class CrackError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.status = code === 'invalid_request' ? 400 : code === 'forbidden_actor' ? 403 : code === 'not_found' ? 404 : code === 'importing' ? 503 : 409;
    this.name = 'CrackError';
  }
}

/** The person taking a crack step: `person` is their forge login, compared without case; `audit` is how the audit trail names them. */
export type CrackActor = { person: string; audit: string };
/** A crack as Unfold's crack API shows it, the same shape Ploeg's operator API used. */
export type CrackView = {
  id: string; team: string; state: CrackRecord['state']; card: CrackItem; bug: CrackItem; play: number | null; severity: string | null; share: string | null; discovery: string | null;
  steward: string | null; note: string | null; proposedBy: string; proposedAt: string; confirmedBy: string[]; confirmedAt: string | null; disputeUntil: string | null; disputed: boolean;
  disputedBy: string | null; disputedAt: string | null; disputeReason: string | null; resolvedBy: string | null; resolvedAt: string | null; resolution: 'upheld' | 'unlinked' | null;
  evolvedBy: string | null; evolvedAt: string | null; mended: { at: string; by?: string; pr: number; bySteward: boolean; confirmedAt: string | null; reopenedAt?: string } | null;
};
/** A Work Item named in a crack. */
export type CrackItem = { workItemId: string; title: string; externalRef?: string };

/** The most cards one bug may crack. */
export const maxCracksPerBug = 3;
/** The working days a steward has to dispute a confirmed crack. */
export const disputeWorkdays = 5;
/** How long a mend must stand, with its bug done and no new crack on the card, before it is confirmed. */
export const mendWindowMicros = 30 * 86_400_000_000;

const severities: Record<string, number> = { S1: 1, S2: 2, S3: 3, S4: 4 };
const validSeverity = (s: string) => Object.hasOwn(severities, s);
const validShare = (s: string) => s === 'primary' || s === 'contributing';
const samePerson = (a: string | null | undefined, b: string | null | undefined) => Boolean(a) && a!.toLowerCase() === (b ?? '').toLowerCase();
const t = rfc3339Micros;

/** A reverted card's crack is at least S2. */
export function severityFloor(severity: string, reverted: boolean): string {
  return reverted && (severities[severity] ?? 0) > 2 ? 'S2' : severity;
}

/** Moves an instant `n` working days (Monday to Friday, in UTC) later, as Ploeg's `AddWorkdays`. Instants are epoch microseconds. */
export function addWorkdays(at: number, n: number): number {
  let out = at;
  for (let left = n; left > 0;) {
    out += 86_400_000_000;
    const weekday = new Date(Math.floor(out / 1000)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) left--;
  }
  return out;
}

/** The crack workflow (Ploeg ADR-0052): only people propose, confirm, dispute and resolve; Unfold only records mends from the bug's merged fix. Every step runs in one transaction of Unfold's store and is audited. */
export class CrackWorkflow {
  readonly store: CardStore;
  constructor(store: CardStore) { this.store = store; }

  /** The fixer names the card whose play caused the bug. Play 0 means the card's latest play merged before the bug Work Item was created. Discovery is `self` whatever was asked when the fixer is the card's steward. */
  propose(args: { bug: WorkItemFacts; card: WorkItemFacts; cardJson: CardJson; play: number; severity: string; share: string; discovery: string; note: string; by: CrackActor; now: number }): CrackRecord {
    const { bug, card, cardJson, by } = args;
    if (!validSeverity(args.severity) || !validShare(args.share) || card.workItem.id === bug.workItem.id || args.play < 0 || args.note.length > 2000 || (args.discovery !== '' && args.discovery !== 'discovered' && args.discovery !== 'concealed') || !by.person) {
      throw new CrackError('invalid_request', 'A proposal names a card, a severity S1 to S4, a share primary or contributing and at most a 2000-character note.');
    }
    if (card.workItem.team !== bug.workItem.team) throw new CrackError('not_found', 'Ploeg work item not found in your authorized teams.');
    const bugCreated = micros(bug.workItem.createdAt);
    let play: CardJson['plays'][number] | null = null;
    for (const p of cardJson.plays) {
      if (p.state !== 'merged' || !p.mergedAt || (args.play !== 0 && p.number !== args.play)) continue;
      if (args.play === 0 && micros(p.mergedAt) > bugCreated) continue;
      if (play === null || micros(p.mergedAt) > micros(play.mergedAt!)) play = p;
    }
    if (!play) throw new CrackError('not_merged', 'The card has no merged play to attribute the bug to.');
    if (micros(play.mergedAt!) > bugCreated) throw new CrackError('merged_after_bug', 'The play merged after the bug Work Item was created, so it cannot have caused it.');
    const steward = cardJson.steward?.name ?? '';
    let discovery = args.discovery || 'discovered';
    if (samePerson(by.person, steward)) discovery = 'self';
    if (discovery === 'concealed' && !(steward !== '' && bug.pullRequests.some(p => p.state === 'merged' && (p.mergedBy ?? '').toLowerCase() === steward.toLowerCase()))) {
      throw new CrackError('concealment_unproven', "Concealed needs the card's steward to have merged the bug's fix.");
    }
    const reverted = cardJson.grade?.inputs.reliability.reverted === true;
    const severity = severityFloor(args.severity, reverted);
    return this.store.transaction(() => {
      const open = this.store.cracksOfBug(bug.workItem.id).filter(c => c.state === 'proposed' || c.state === 'confirmed' || c.state === 'disputed').length;
      if (open >= maxCracksPerBug) throw new CrackError('crack_limit', "A bug cracks at most three cards; more than that is a systemic bug, not a card's.");
      if (this.store.crackFor(card.workItem.id, bug.workItem.id)) throw new CrackError('already_attributed', 'This card is already attributed to this bug.');
      const pr = [...card.pullRequests].filter(p => p.number === play!.number && p.state === 'merged').sort((a, b) => (micros(b.mergedAt ?? '1970-01-01T00:00:00Z') - micros(a.mergedAt ?? '1970-01-01T00:00:00Z')) || Number(BigInt(b.id) - BigInt(a.id)))[0];
      const record = this.store.insertCrack({
        team: bug.workItem.team, state: 'proposed', cardWorkItemId: card.workItem.id, bugWorkItemId: bug.workItem.id, bug: { provider: bug.workItem.provider, externalId: bug.workItem.externalId },
        pullRequest: pr ? { id: pr.id, forge: pr.forge, owner: pr.owner, repo: pr.repo, number: pr.number } : null, severity, share: args.share, discovery, steward: steward.slice(0, 256), note: args.note || null,
        proposedBy: by.person.slice(0, 256), proposedAt: t(args.now), confirmedBy: null, confirmedAt: null, disputeUntil: null, disputedBy: null, disputedAt: null, disputeReason: null,
        resolvedBy: null, resolvedAt: null, resolution: null, evolvedBy: null, evolvedAt: null, mendPullRequest: null, mendNumber: null, mendedAt: null, mendedBy: null, mendBySteward: null, mendConfirmedAt: null, mendReopenedAt: null,
      });
      this.store.audit({ crackId: record.id, cardWorkItemId: card.workItem.id, action: 'card.crack_proposed', actor: by.audit, at: t(args.now), detail: { crackId: record.id, bugWorkItemId: bug.workItem.id, pr: play!.number, severity, share: args.share, discovery } });
      this.syncMends(bug, by.audit, args.now);
      return this.store.crack(record.id)!;
    });
  }

  private decide(crackId: string, teams: (team: string) => boolean, by: CrackActor, now: number, apply: (c: CrackRecord) => [string, Record<string, unknown>]): CrackRecord {
    if (!by.person) throw new CrackError('invalid_request', 'An attribution step needs the person who takes it.');
    return this.store.transaction(() => {
      const c = this.store.crack(crackId);
      if (!c || !teams(c.team)) throw new CrackError('not_found', 'That attribution is not on this Work Item in your Teams.');
      const [action, detail] = apply(c);
      this.store.audit({ crackId: c.id, cardWorkItemId: c.cardWorkItemId, action, actor: by.audit, at: t(now), detail: { ...detail, crackId: c.id, bugWorkItemId: c.bugWorkItemId } });
      return this.store.crack(c.id)!;
    });
  }

  /** A second person, neither the card's steward nor the proposer, confirms a proposed crack and may correct its severity and share. */
  confirm(args: { crackId: string; teams: (team: string) => boolean; by: CrackActor; severity: string; share: string; note: string; cardReverted: boolean; now: number }): CrackRecord {
    if ((args.severity && !validSeverity(args.severity)) || (args.share && !validShare(args.share)) || args.note.length > 2000) throw new CrackError('invalid_request', 'Severity is S1 to S4 and share is primary or contributing.');
    return this.decide(args.crackId, args.teams, args.by, args.now, c => {
      if (c.state !== 'proposed') throw new CrackError('invalid_state', 'Only a proposed crack can be confirmed.');
      if (samePerson(args.by.person, c.steward) || samePerson(args.by.person, c.proposedBy)) throw new CrackError('forbidden_actor', "The second person is neither the card's steward nor the proposer.");
      const severity = severityFloor(args.severity || c.severity || '', args.cardReverted);
      const share = args.share || c.share || '';
      this.store.updateCrack(c.id, { state: 'confirmed', confirmed_by: args.by.person.slice(0, 256), confirmed_at: t(args.now), dispute_until: t(addWorkdays(args.now, disputeWorkdays)), severity, share });
      return ['card.crack_confirmed', { severity, share }];
    });
  }

  /** The card's steward disputes a confirmed crack within five working days of its confirmation. The crack keeps counting until a referee unlinks it. */
  dispute(args: { crackId: string; teams: (team: string) => boolean; by: CrackActor; reason: string; now: number }): CrackRecord {
    if (!args.reason.trim() || args.reason.length > 2000) throw new CrackError('invalid_request', 'A dispute gives a reason of at most 2000 characters.');
    return this.decide(args.crackId, args.teams, args.by, args.now, c => {
      if (c.state !== 'confirmed') throw new CrackError('invalid_state', 'Only a confirmed crack can be disputed.');
      if (c.resolution) throw new CrackError('invalid_state', 'A referee already decided this crack; the decision is final.');
      if (!samePerson(args.by.person, c.steward)) throw new CrackError('forbidden_actor', "Only the card's steward disputes a crack.");
      if (c.disputeUntil !== null && args.now > micros(c.disputeUntil)) throw new CrackError('dispute_closed', 'The five working days to dispute this crack have passed.');
      this.store.updateCrack(c.id, { state: 'disputed', disputed_by: args.by.person.slice(0, 256), disputed_at: t(args.now), dispute_reason: args.reason });
      return ['card.crack_disputed', { reason: args.reason.slice(0, 4096) }];
    });
  }

  /** A referee decides a disputed crack: upheld confirms it again, unlinked removes it from the card. A referee took no part in the crack and is on the Team's referee list when it names one. */
  resolve(args: { crackId: string; teams: (team: string) => boolean; by: CrackActor; resolution: string; note: string; referees: (team: string) => string[]; now: number }): CrackRecord {
    if ((args.resolution !== 'upheld' && args.resolution !== 'unlinked') || args.note.length > 2000) throw new CrackError('invalid_request', 'A resolution is upheld or unlinked.');
    return this.decide(args.crackId, args.teams, args.by, args.now, c => {
      if (c.state !== 'disputed') throw new CrackError('invalid_state', 'Only a disputed crack is resolved.');
      if ([c.steward, c.proposedBy, c.confirmedBy, c.disputedBy].some(involved => samePerson(args.by.person, involved))) throw new CrackError('forbidden_actor', 'A referee took no part in the crack.');
      const referees = args.referees(c.team);
      if (referees.length > 0 && !referees.some(r => samePerson(args.by.person, r))) throw new CrackError('forbidden_actor', 'This team names its referees, and this person is not one.');
      this.store.updateCrack(c.id, { state: args.resolution === 'unlinked' ? 'unlinked' : 'confirmed', resolved_by: args.by.person.slice(0, 256), resolved_at: t(args.now), resolution: args.resolution });
      return ['card.crack_resolved', { resolution: args.resolution, ...(args.note ? { reason: args.note.slice(0, 4096) } : {}) }];
    });
  }

  /** Someone other than the card's steward says the bug is no defect of the card: the requirement changed. A proposed attribution becomes evolved; a confirmed, disputed or unlinked one is refused. */
  evolved(args: { bug: WorkItemFacts; card: WorkItemFacts; cardJson: CardJson; note: string; by: CrackActor; now: number }): CrackRecord {
    const { bug, card, by } = args;
    if (card.workItem.id === bug.workItem.id || args.note.length > 2000 || !by.person) throw new CrackError('invalid_request', 'Name a card other than the bug and at most a 2000-character note.');
    if (card.workItem.team !== bug.workItem.team) throw new CrackError('not_found', 'Ploeg work item not found in your authorized teams.');
    const steward = args.cardJson.steward?.name ?? '';
    return this.store.transaction(() => {
      const existing = this.store.crackFor(card.workItem.id, bug.workItem.id);
      let id: string;
      if (!existing) {
        if (samePerson(by.person, steward)) throw new CrackError('forbidden_actor', "The card's steward does not decide that their own card evolved.");
        id = this.store.insertCrack({
          team: bug.workItem.team, state: 'evolved', cardWorkItemId: card.workItem.id, bugWorkItemId: bug.workItem.id, bug: { provider: bug.workItem.provider, externalId: bug.workItem.externalId },
          pullRequest: null, severity: null, share: null, discovery: null, steward: steward.slice(0, 256), note: args.note || null, proposedBy: by.person.slice(0, 256), proposedAt: t(args.now),
          confirmedBy: null, confirmedAt: null, disputeUntil: null, disputedBy: null, disputedAt: null, disputeReason: null, resolvedBy: null, resolvedAt: null, resolution: null,
          evolvedBy: by.person.slice(0, 256), evolvedAt: t(args.now), mendPullRequest: null, mendNumber: null, mendedAt: null, mendedBy: null, mendBySteward: null, mendConfirmedAt: null, mendReopenedAt: null,
        }).id;
      } else {
        if (existing.state !== 'proposed') throw new CrackError('invalid_state', 'Only a proposed attribution can be changed to evolved.');
        if (samePerson(by.person, existing.steward)) throw new CrackError('forbidden_actor', "The card's steward does not decide that their own card evolved.");
        this.store.updateCrack(existing.id, { state: 'evolved', evolved_by: by.person.slice(0, 256), evolved_at: t(args.now), ...(args.note ? { note: args.note } : {}) });
        id = existing.id;
      }
      this.store.audit({ crackId: id, cardWorkItemId: card.workItem.id, action: 'card.crack_evolved', actor: by.audit, at: t(args.now), detail: { crackId: id, bugWorkItemId: bug.workItem.id } });
      return this.store.crack(id)!;
    });
  }

  /** Records, for every counting crack of the bug without a mend, that the bug's latest merged pull request mended it. Returns how many it newly marked. */
  syncMends(bug: WorkItemFacts, actor: string, now: number): number {
    const merged = bug.pullRequests.filter(p => p.state === 'merged' && p.mergedAt !== null)
      .sort((a, b) => micros(b.mergedAt!) - micros(a.mergedAt!) || Number(BigInt(b.id) - BigInt(a.id)))[0];
    if (!merged) return 0;
    let marked = 0;
    this.store.transaction(() => {
      for (const c of this.store.cracksOfBug(bug.workItem.id)) {
        if (c.mendedAt !== null || !['proposed', 'confirmed', 'disputed'].includes(c.state)) continue;
        const bySteward = c.steward !== '' && (merged.mergedBy ?? '').toLowerCase() === c.steward.toLowerCase();
        this.store.updateCrack(c.id, { mend_pull_request: JSON.stringify({ id: merged.id, forge: merged.forge, owner: merged.owner, repo: merged.repo, number: merged.number }), mend_number: merged.number, mended_at: t(micros(merged.mergedAt!)), mended_by: merged.mergedBy, mend_by_steward: bySteward ? 1 : 0 });
        this.store.audit({ crackId: c.id, cardWorkItemId: c.cardWorkItemId, action: 'card.crack_mended', actor, at: t(now), detail: { crackId: c.id, bugWorkItemId: bug.workItem.id, pr: merged.number, bySteward } });
        marked++;
      }
    });
    return marked;
  }

  /** Settles every recorded mend whose window has an answer at `now`: reopened when another crack on the same card was confirmed within the window, confirmed once the window passed, the bug Work Item is done and the crack still counts. `bugDone` says whether a bug is done, or undefined when unknown. */
  confirmMends(now: number, bugDone: (bugId: string) => boolean | undefined, actor = 'unfold:sweep'): { confirmed: number; reopened: number } {
    let confirmed = 0, reopened = 0;
    this.store.transaction(() => {
      const open = this.store.openMends();
      for (const c of open) {
        const mended = micros(c.mendedAt!);
        const recracked = this.store.cracksOnCard(c.cardWorkItemId).some(o => o.id !== c.id && (o.state === 'confirmed' || o.state === 'disputed') && micros(o.proposedAt) > mended && micros(o.proposedAt) <= mended + mendWindowMicros);
        if (recracked) {
          this.store.updateCrack(c.id, { mend_reopened_at: t(now) });
          this.store.audit({ crackId: c.id, cardWorkItemId: c.cardWorkItemId, action: 'card.mend_reopened', actor, at: t(now), detail: { crackId: c.id } });
          reopened++;
        }
      }
      for (const c of this.store.openMends()) {
        if ((c.state !== 'confirmed' && c.state !== 'disputed') || micros(c.mendedAt!) + mendWindowMicros > now || bugDone(c.bugWorkItemId) !== true) continue;
        this.store.updateCrack(c.id, { mend_confirmed_at: t(now) });
        this.store.audit({ crackId: c.id, cardWorkItemId: c.cardWorkItemId, action: 'card.mend_confirmed', actor, at: t(now), detail: { crackId: c.id } });
        confirmed++;
      }
    });
    return { confirmed, reopened };
  }
}

/** Shows a crack as the crack API does. `item` names a Work Item from what Unfold knows of it. */
export function crackView(c: CrackRecord, item: (id: string) => { title: string; provider: string; externalId: string } | null): CrackView {
  const named = (id: string): CrackItem => { const known = item(id); const ref = known ? itemRef(known.provider, known.externalId) : ''; return { workItemId: id, title: (known?.title ?? '').slice(0, 4096), ...(ref ? { externalRef: ref } : {}) }; };
  return {
    id: c.id, team: c.team, state: c.state, card: named(c.cardWorkItemId), bug: { ...named(c.bugWorkItemId), ...(itemRef(c.bug.provider, c.bug.externalId) ? { externalRef: itemRef(c.bug.provider, c.bug.externalId) } : {}) },
    play: c.pullRequest?.number ?? null, severity: c.severity, share: c.share, discovery: c.discovery, steward: c.steward || null, note: c.note, proposedBy: c.proposedBy, proposedAt: c.proposedAt,
    confirmedBy: c.confirmedBy !== null ? [c.proposedBy, c.confirmedBy] : [], confirmedAt: c.confirmedAt, disputeUntil: c.disputeUntil, disputed: c.state === 'disputed',
    disputedBy: c.disputedBy, disputedAt: c.disputedAt, disputeReason: c.disputeReason, resolvedBy: c.resolvedBy, resolvedAt: c.resolvedAt, resolution: c.resolution,
    evolvedBy: c.evolvedBy, evolvedAt: c.evolvedAt,
    mended: c.mendedAt !== null && c.mendNumber !== null ? { at: c.mendedAt, ...(c.mendedBy ? { by: c.mendedBy } : {}), pr: c.mendNumber, bySteward: c.mendBySteward === true, confirmedAt: c.mendConfirmedAt, ...(c.mendReopenedAt ? { reopenedAt: c.mendReopenedAt } : {}) } : null,
  };
}
