import { micros, rfc3339Micros } from './go.ts';
import type { FactsPage, WorkItemFacts } from './facts.ts';
import { assembleCard, itemRef, rarityRecord, type CardContext, type CardJson, type CrackRecord, type PullRequestRef } from './assemble.ts';
import { CardStore, type CardImportRecord } from './card-store.ts';
import { CrackWorkflow, crackView, type CrackActor, type CrackView } from './cracks.ts';
import { cardActivity, cardListLogins, namesAny, orderCards } from './list.ts';
import { resolveCardRules, type CardRuleSettings, type ResolvedCardRules } from './settings.ts';
import { cardCommentMarkdown, cardImageAlt, momentHeadline, momentOf } from './cardimage.ts';
import { renderCardImage } from './cardimage-svg.ts';
import type { CardImageCard } from './cardimage-view.ts';
import type { Shape } from './playkpi.ts';

/** A query of Ploeg's facts list. */
export type FactsQuery = { members?: string[]; team?: string; since?: string; before?: string; limit?: number };
/** The body of Ploeg's keyed pull request comment. */
export type CommentRequest = { markdown: string; image?: { svg: string; alt?: string }; number?: number; adoptCommentId?: number };
/** What Ploeg recorded after writing a keyed comment. */
export type CommentResult = { pullRequest: PullRequestRef; commentId: number | null; imageUrl: string | null; created: boolean };

/** How Unfold reads Ploeg: the delivery facts, the facts list and the keyed pull request comment (Ploeg ADR-0079). */
export type FactsSource = {
  factsSupported(fresh?: boolean): Promise<boolean>;
  workItemFacts(id: string, fresh?: boolean): Promise<WorkItemFacts>;
  factsPage(query: FactsQuery, fresh?: boolean): Promise<FactsPage>;
  putPullRequestComment(id: string, key: string, body: CommentRequest): Promise<CommentResult>;
};

/** A log line: Unfold writes structured JSON to the process log. */
export type CardLog = (level: 'info' | 'warn' | 'error', event: string, detail: Record<string, unknown>) => void;
/** The card service's options. `publish` is `cards.publishPullRequestComment`, off by default. */
export type CardServiceOptions = { settings: CardRuleSettings; publish: boolean; now?: () => number; log?: CardLog; taskUrl?: (provider: string, externalId: string) => string };

const defaultLog: CardLog = (level, event, detail) => (level === 'info' ? console.log : console.error)(JSON.stringify({ level, event, ...detail }));
const factsPageLimit = 25;
const memberPages = 6;
const backfillPages = 400;
const sweepBatch = 25;
const commentKey = 'run-card';
const commentRecheckMicros = 3_600_000_000;
const commentRecentMicros = 7 * 86_400_000_000;

/** Unfold's Run card domain on top of Ploeg's delivery facts (root ADR-0030): it assembles cards, keeps the crack workflow, frozen rarities and the card comment in its own store, and publishes the pull request comment. It decides nothing about scope: callers check the Team first. */
export class CardService {
  readonly store: CardStore;
  readonly rules: ResolvedCardRules;
  readonly cracks: CrackWorkflow;
  private readonly source: FactsSource;
  private readonly publish: boolean;
  private readonly now: () => number;
  private readonly log: CardLog;
  private readonly taskUrl?: (provider: string, externalId: string) => string;
  private refreshedUntil: string | null = null;

  constructor(source: FactsSource, store: CardStore, options: CardServiceOptions) {
    this.source = source;
    this.store = store;
    this.rules = resolveCardRules(options.settings);
    this.cracks = new CrackWorkflow(store);
    this.publish = options.publish;
    this.now = options.now ?? (() => Date.now() * 1000);
    this.log = options.log ?? defaultLog;
    this.taskUrl = options.taskUrl;
  }

  /** Whether the connected Ploeg supplies delivery facts. Without them Unfold has no cards to serve. */
  available(fresh = false): Promise<boolean> { return this.source.factsSupported(fresh); }

  /** Reads one Work Item's facts and records what they say about other cards. */
  async facts(id: string, fresh = false): Promise<WorkItemFacts> {
    const facts = await this.source.workItemFacts(id, fresh);
    this.store.observe(facts, rfc3339Micros(this.now()));
    return facts;
  }

  private async factsMaybe(id: string, fresh: boolean): Promise<WorkItemFacts | undefined> {
    try { return await this.facts(id, fresh); }
    catch (error) { this.log('warn', 'cards.facts_unreadable', { workItem: id, message: String((error as Error).message).slice(0, 200) }); return undefined; }
  }

  private async related(facts: WorkItemFacts, fresh: boolean): Promise<Map<string, WorkItemFacts>> {
    const known = new Map<string, WorkItemFacts>([[facts.workItem.id, facts]]);
    const item = facts.workItem;
    const wanted = new Set<string>(this.store.cracksOnCard(item.id).map(c => c.bugWorkItemId));
    if (item.provider && item.externalId && item.provider !== 'manual') {
      for (const id of this.store.epicMembers(item.provider, item.externalId, item.team)) wanted.add(id);
      for (const epic of item.epics.filter(e => e.removedAt === null)) for (const id of this.store.epicMembers(item.provider, epic.externalId, item.team)) wanted.add(id);
    }
    wanted.delete(item.id);
    const ids = [...wanted].slice(0, 200);
    for (let index = 0; index < ids.length; index += 6) {
      const batch = await Promise.all(ids.slice(index, index + 6).map(id => this.factsMaybe(id, fresh)));
      for (const entry of batch) if (entry) known.set(entry.workItem.id, entry);
    }
    return known;
  }

  /** The assembly context over everything Unfold knows: the given facts, its store and its indexes. */
  context(known: Map<string, WorkItemFacts>, rules: ResolvedCardRules = this.rules, freeze = true): CardContext {
    const store = this.store;
    const now = this.now();
    const bots = new Set([...rules.bots, ...[...known.values()].flatMap(f => f.botLogins)].map(b => b.toLowerCase()));
    return {
      now, rules, bots,
      facts: id => known.get(id),
      epicMembers: (provider, epic, team) => store.epicMembers(provider, epic, team),
      workItemByExternal: (provider, externalId, team) => store.workItemByExternal(provider, externalId, team),
      cracksOnCard: id => store.cracksOnCard(id),
      cracksOfBug: id => store.cracksOfBug(id),
      storedRarity: id => store.storedRarity(id),
      cohort: (formula, target, quarter, exclude) => store.cohort(formula, target, quarter, exclude),
      ...(freeze ? { freezeRarity: (id: string, reveal: Parameters<NonNullable<CardContext['freezeRarity']>>[1]) => store.transaction(() => {
        const existing = store.storedRarity(id);
        if (existing) return existing;
        const { record, inserted } = store.freezeRarity(rarityRecord(id, reveal, store.cohort('2026.1', reveal.target, reveal.quarter, id), now), 'unfold');
        if (inserted) this.log('info', 'cards.rarity_frozen', { workItem: id, tier: record.revealedTier, cohort: `${record.cohortTarget} ${record.cohortQuarter}` });
        return record;
      }) } : {}),
      legacyShape: (id): Shape | null => store.playShape(id),
      touchedBefore: (repo, path, from, until, exclude) => store.touchedBefore(repo, path, from, until, exclude),
      liveUsage: true,
      ...(this.taskUrl ? { taskUrl: this.taskUrl } : {}),
    };
  }

  /** Assembles one Work Item's card from Ploeg's facts and Unfold's state, freezing its rarity once it is revealed. */
  async card(id: string, fresh = false): Promise<CardJson> {
    const facts = await this.facts(id, fresh);
    return this.assemble(facts, fresh);
  }

  private async assemble(facts: WorkItemFacts, fresh: boolean): Promise<CardJson> {
    const known = await this.related(facts, fresh);
    return assembleCard(facts, this.context(known));
  }

  /** The cards whose roster or steward names one of `logins`, newest activity first: Ploeg's facts list filtered by member, plus the cards a login co-signed by mending them. `truncated` says the list holds more than was read. */
  async memberCards(logins: string[], fresh = false): Promise<{ cards: CardJson[]; scanned: number; truncated: boolean }> {
    const wanted = cardListLogins(logins, this.rules.bots).slice(0, 20);
    if (!wanted.length) return { cards: [], scanned: 0, truncated: false };
    const { facts, truncated } = await this.pages({ members: wanted }, memberPages, fresh);
    const seen = new Set(facts.map(f => f.workItem.id));
    for (const id of this.store.cosignedCards(wanted)) if (!seen.has(id)) { const extra = await this.factsMaybe(id, fresh); if (extra) { facts.push(extra); seen.add(id); } }
    return { ...(await this.listed(facts, card => namesAny(card, new Set(wanted)), fresh)), truncated };
  }

  /** One Team's cards for its team page, newest activity first, with activity at or after `since` when given. */
  async teamCards(team: string, since: string | undefined, fresh = false): Promise<{ cards: CardJson[]; scanned: number; truncated: boolean }> {
    const { facts, truncated } = await this.pages({ team, ...(since ? { since } : {}) }, memberPages, fresh);
    return { ...(await this.listed(facts.filter(f => f.workItem.team === team), () => true, fresh, since ? micros(since) : null)), truncated };
  }

  private async listed(facts: WorkItemFacts[], keep: (card: CardJson) => boolean, fresh: boolean, since: number | null = null): Promise<{ cards: CardJson[]; scanned: number }> {
    const entries: { id: string; activity: number; card: CardJson }[] = [];
    for (const f of facts) {
      const card = await this.assemble(f, fresh);
      const activity = cardActivity(f, this.store.cracksOnCard(f.workItem.id), this.rules);
      if (keep(card) && (since === null || activity >= since)) entries.push({ id: f.workItem.id, activity, card });
    }
    return { cards: orderCards(entries).map(entry => entry.card), scanned: facts.length };
  }

  private async pages(query: FactsQuery, max: number, fresh: boolean): Promise<{ facts: WorkItemFacts[]; truncated: boolean }> {
    const out: WorkItemFacts[] = [];
    let before: string | undefined;
    for (let page = 0; page < max; page++) {
      const result = await this.source.factsPage({ ...query, limit: factsPageLimit, ...(before ? { before } : {}) }, fresh);
      const at = rfc3339Micros(this.now());
      for (const f of result.facts) { this.store.observe(f, at); out.push(f); }
      if (!result.nextBefore) return { facts: out, truncated: false };
      before = result.nextBefore;
    }
    return { facts: out, truncated: true };
  }

  /** Every attribution where the Work Item is the bug or the card, shown as the crack API shows it. Names come from what Unfold has seen of each Work Item, reading the facts of one it has not. */
  async crackViews(id: string, fresh = false): Promise<CrackView[]> {
    const list = this.store.cracksOf(id);
    for (const other of new Set(list.flatMap(c => [c.cardWorkItemId, c.bugWorkItemId]))) if (!this.store.workItem(other)) await this.factsMaybe(other, fresh);
    return list.map(c => this.view(c));
  }

  /** Shows one crack as the crack API does. */
  view(c: CrackRecord): CrackView { return crackView(c, wid => this.store.workItem(wid)); }

  /** Earlier merged plays of the bug's Team that touched a path the bug's fix touched, within a year before the bug was raised, ranked by shared paths then newest. Unfold only proposes them; a crack needs people (Ploeg ADR-0052). */
  async crackCandidates(bugId: string, fresh = false): Promise<{ bug: { workItemId: string; title: string; externalRef?: string }; fixFiles: number; fixFilesTruncated: boolean; since: string; until: string; candidates: unknown[] }> {
    const bug = await this.facts(bugId, fresh);
    const until = micros(bug.workItem.createdAt);
    const since = until - 365 * 86_400_000_000;
    const fix = new Map<string, { forge: string; repo: string; path: string }>();
    for (const p of bug.pullRequests) for (const f of p.files) { const repo = `${p.owner}/${p.repo}`.toLowerCase(); fix.set(`${p.forge}\u0000${repo}\u0000${f.path}`, { forge: p.forge, repo, path: f.path }); }
    const paths = new Set([...fix.values()].map(k => k.path));
    const head = { workItemId: bug.workItem.id, title: bug.workItem.title.slice(0, 4096), ...(bug.workItem.externalRef ? { externalRef: bug.workItem.externalRef } : {}) };
    const out = { bug: head, fixFiles: paths.size, fixFilesTruncated: bug.pullRequests.some(p => p.filesTruncated === true), since: rfc3339Micros(since), until: rfc3339Micros(until), candidates: [] as unknown[] };
    if (paths.size === 0) return out;
    const hits = new Map<string, { pr: string; workItemId: string; number: number; repo: string; mergedAt: string; mergedBy: string; reverted: boolean; paths: Set<string> }>();
    for (const touch of this.store.touchesFor(bug.workItem.team, bug.workItem.id, [...fix.values()], since, until)) {
      const hit = hits.get(touch.pullRequestId) ?? { pr: touch.pullRequestId, workItemId: touch.workItemId, number: touch.number, repo: touch.repo, mergedAt: touch.mergedAt, mergedBy: touch.mergedBy, reverted: touch.reverted, paths: new Set<string>() };
      hit.paths.add(touch.path);
      hits.set(touch.pullRequestId, hit);
    }
    const ranked = [...hits.values()].sort((a, b) => b.paths.size - a.paths.size || micros(b.mergedAt) - micros(a.mergedAt) || Number(BigInt(b.pr) - BigInt(a.pr))).slice(0, 20);
    out.candidates = ranked.map(hit => {
      const item = this.store.workItem(hit.workItemId);
      const ref = item ? itemRef(item.provider, item.externalId) : '';
      return {
        card: { workItemId: hit.workItemId, title: item?.title ?? '', ...(ref ? { externalRef: ref } : {}) }, play: hit.number, repo: hit.repo, mergedAt: rfc3339Micros(micros(hit.mergedAt)), ...(hit.mergedBy ? { mergedBy: hit.mergedBy } : {}),
        sharedFiles: hit.paths.size, share: hit.paths.size / paths.size, files: [...hit.paths].sort().slice(0, 20), reverted: hit.reverted, attribution: this.store.crackFor(hit.workItemId, bug.workItem.id)?.state ?? null,
      };
    });
    return out;
  }

  /** Proposes a crack: `bugId` was caused by `cardId`'s play. */
  async propose(bugId: string, cardId: string, input: { play: number; severity: string; share: string; discovery: string; note: string }, by: CrackActor): Promise<CrackRecord> {
    const [bug, card] = [await this.facts(bugId, true), await this.facts(cardId, true)];
    const cardJson = await this.assemble(card, true);
    return this.cracks.propose({ bug, card, cardJson, ...input, by, now: this.now() });
  }

  /** Marks the bug a changed requirement of the card. */
  async evolved(bugId: string, cardId: string, note: string, by: CrackActor): Promise<CrackRecord> {
    const [bug, card] = [await this.facts(bugId, true), await this.facts(cardId, true)];
    const cardJson = await this.assemble(card, true);
    return this.cracks.evolved({ bug, card, cardJson, note, by, now: this.now() });
  }

  /** Confirms, disputes or resolves one crack. `teams` says which Teams the caller may act in. */
  async decide(crackId: string, step: 'confirm' | 'dispute' | 'resolve', input: { severity: string; share: string; reason: string; resolution: string; note: string }, by: CrackActor, teams: (team: string) => boolean): Promise<CrackRecord> {
    const now = this.now();
    if (step === 'confirm') {
      const crack = this.store.crack(crackId);
      const card = crack && teams(crack.team) ? await this.facts(crack.cardWorkItemId, true) : undefined;
      return this.cracks.confirm({ crackId, teams, by, severity: input.severity, share: input.share, note: input.note, cardReverted: (card?.pullRequests ?? []).some(p => p.reverts.length > 0), now });
    }
    if (step === 'dispute') return this.cracks.dispute({ crackId, teams, by, reason: input.reason, now });
    return this.cracks.resolve({ crackId, teams, by, resolution: input.resolution, note: input.note, referees: team => this.rules.referees(team), now });
  }

  private async backfill(): Promise<number> {
    const { facts } = await this.pages({}, backfillPages, true);
    return facts.length;
  }

  /** One background pass: indexes every Work Item's facts once while the index is empty, refreshes the indexes from recently active facts, reveals released rarities, records and settles mends, and publishes the card comment where it is turned on. Each part logs its own failure and the pass carries on. */
  async sweep(): Promise<void> {
    if (!(await this.available().catch(() => false))) return;
    if (this.store.indexSize().workItems === 0) {
      const indexed = await this.step('backfill', () => this.backfill());
      if (indexed !== undefined) this.log('info', 'cards.indexed', { workItems: indexed });
    }
    const recent = await this.step('refresh', () => this.refresh());
    await this.step('rarity', () => this.revealRarities(recent ?? []));
    await this.step('mends', () => this.settleMends());
    if (this.publish) await this.step('comments', () => this.publishComments(recent ?? []));
  }

  private async step<T>(name: string, work: () => Promise<T>): Promise<T | undefined> {
    try { return await work(); }
    catch (error) { this.log('warn', `cards.sweep_${name}_failed`, { message: String((error as Error).message).slice(0, 200) }); return undefined; }
  }

  private async refresh(): Promise<WorkItemFacts[]> {
    const since = this.refreshedUntil ?? rfc3339Micros(this.now() - 86_400_000_000);
    const started = rfc3339Micros(this.now());
    const { facts } = await this.pages({ since }, 8, true);
    this.refreshedUntil = started;
    return facts;
  }

  private async revealRarities(recent: WorkItemFacts[]): Promise<void> {
    let n = 0;
    for (const facts of recent) {
      if (n >= sweepBatch) break;
      if (this.store.storedRarity(facts.workItem.id) || !facts.pullRequests.some(p => p.state === 'merged')) continue;
      await this.assemble(facts, false);
      n++;
    }
  }

  private async settleMends(): Promise<void> {
    const unmended = new Set<string>();
    for (const c of this.store.openMends()) unmended.add(c.bugWorkItemId);
    const bugs = [...new Set([...this.store.db.prepare("SELECT DISTINCT bug_work_item_id AS id FROM card_cracks WHERE mended_at IS NULL AND state IN ('proposed','confirmed','disputed') LIMIT 25").all().map(row => String((row as { id: string }).id)), ...unmended])].slice(0, sweepBatch);
    for (const id of bugs) {
      const facts = await this.factsMaybe(id, true);
      if (facts) this.cracks.syncMends(facts, 'unfold:sweep', this.now());
    }
    const result = this.cracks.confirmMends(this.now(), id => { const item = this.store.workItem(id); return item ? item.state === 'done' : undefined; });
    if (result.confirmed || result.reopened) this.log('info', 'cards.mends_settled', result);
  }

  private async publishComments(recent: WorkItemFacts[]): Promise<void> {
    const now = this.now();
    const ids = new Set<string>();
    for (const f of recent) if (this.rules.pullRequestComment(f.workItem.team) && f.workItem.state !== 'withdrawn' && f.pullRequests.some(p => p.state === 'merged' && p.mergedAt !== null && micros(p.mergedAt) >= now - commentRecentMicros)) ids.add(f.workItem.id);
    for (const id of this.store.commentCandidates(rfc3339Micros(now - commentRecheckMicros), sweepBatch)) ids.add(id);
    for (const id of [...ids].slice(0, sweepBatch)) {
      const previous = this.store.comment(id);
      if (previous && micros(previous.checkedAt) > now - commentRecheckMicros && previous.origin === 'unfold' && previous.moment) continue;
      try { await this.publishComment(id); }
      catch (error) { this.log('warn', 'cards.comment_not_published', { workItem: id, message: String((error as Error).message).slice(0, 200) }); }
    }
  }

  /** Publishes or edits the card comment of one Work Item when its card reached a moment the comment does not show yet, through Ploeg's keyed comment (`run-card`). The first publish takes over the comment Ploeg posted. Returns the moment published, or null when nothing changed. */
  async publishComment(id: string): Promise<string | null> {
    if (!this.publish) return null;
    const facts = await this.facts(id, true);
    if (!this.rules.pullRequestComment(facts.workItem.team)) return null;
    const known = await this.related(facts, true);
    const card = assembleCard(facts, this.context(known, { ...this.rules, rarity: false, flow: null }, false)) as unknown as CardImageCard;
    const now = rfc3339Micros(this.now());
    const previous = this.store.comment(id);
    const moment = momentOf(card, now);
    if (!moment.key || moment.key === previous?.moment) { this.store.markCommentChecked(id, now); return null; }
    const headline = momentHeadline(moment, previous?.moment ?? '');
    const adopt = previous && previous.origin === 'ploeg' && !previous.adopted && previous.commentId !== null && previous.pullRequest?.number === moment.play ? previous.commentId : undefined;
    const result = await this.source.putPullRequestComment(id, commentKey, { markdown: cardCommentMarkdown(card, now, headline), image: { svg: renderCardImage(card, { now }), alt: cardImageAlt(card, now) }, number: moment.play, ...(adopt ? { adoptCommentId: adopt } : {}) });
    this.store.saveComment({ workItemId: id, pullRequest: result.pullRequest, moment: moment.key, commentId: result.commentId, image: result.imageUrl !== null, publishedAt: now, checkedAt: now, origin: 'unfold', adopted: Boolean(adopt) || previous?.adopted === true });
    this.log('info', 'cards.comment_published', { workItem: id, moment: moment.key, pullRequest: result.pullRequest.number, comment: result.commentId, image: result.imageUrl !== null, adopted: Boolean(adopt) });
    return moment.key;
  }

  /** The card domain's state for the Status page: the recorded result of the one-time import from Ploeg, whether the comment is published and the index size. */
  status(): { import: CardImportRecord; publish: boolean; index: { workItems: number; files: number } } {
    return { import: this.store.importState(), publish: this.publish, index: this.store.indexSize() };
  }
}

/** The line the Status page shows about the one-time import of Ploeg's card state, which Ploeg v0.2.0-rc.12 no longer offers: the recorded result when there is one, otherwise null. */
export function importStatusLine(state: CardImportRecord): string | null {
  if (state.state === 'pending') return null;
  if (state.state === 'done') return `Imported ${state.cracks} cracks, ${state.rarities} frozen rarities, ${state.comments} card comments and ${state.shapes} play shapes from Ploeg.`;
  return `The import of Ploeg's card state stopped (${state.state}) after ${state.cracks} cracks, ${state.rarities} frozen rarities, ${state.comments} card comments and ${state.shapes} play shapes, and Ploeg no longer offers it.`;
}
