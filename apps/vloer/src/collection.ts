import { createHash, randomBytes } from 'node:crypto';
import type { AppConfig, User } from './types.ts';
import type { Store, StoredPack, StoredPackEntry, StoredPull } from './store.ts';
import type { PloegCard, PloegCardList } from './ploeg.ts';
import { validateCards } from './config.ts';
import { cardMoments, copyOf, drawPull, lastActivity, packFloor, periodById, planPacks, publishedOdds, type Moment, type PackPlan, type Period, type PeriodRules } from './packs.ts';
import { quarterAt, quarterById, recentQuarters, seasonAggregates } from './season.ts';

/** Where the collection reads cards: Ploeg's operator API through `PloegClient`, or a stub in tests. */
export interface CardSource {
  memberCards(user: User, logins: string[], fresh?: boolean): Promise<PloegCardList>;
  teamCards(user: User, team: string, since: string | undefined, fresh?: boolean): Promise<PloegCardList>;
  teams(user: User, fresh?: boolean): Promise<{ id: string }[]>;
  forgeLogin?(user: User): string | null;
}

export class CollectionError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.name = 'CollectionError'; this.status = status; this.code = code; }
}

const day = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');
const loginPattern = /^[A-Za-z0-9][A-Za-z0-9._@+:-]{0,99}$/;
const demoLogins = ['demo-operator'];
const pullKeyId = 'cards:pull-key';
const demoPullKey = createHash('sha256').update('unfold-demo-pack-pulls').digest();
const awayLimit = 12;

export type PackState = 'opened' | 'sealed' | 'filling';
export type PackSummary = { id: string; period: Period; state: PackState; count: number; firsts: number; upgrades: number; openedAt: string | null; next: boolean; demo: boolean };
export type CopyPull = Omit<StoredPull, 'message' | 'digest'> & { digest: string };

function publicPull(pull: StoredPull | undefined): CopyPull | null {
  if (!pull) return null;
  const { message: _message, ...rest } = pull;
  return rest;
}

/**
 * A person's private card collection: the logins that find their copies, their binder, their packs and pulls, and
 * the team season pages. Every read and write is keyed by the signed-in person's own id; no method takes another
 * person's id, so nobody, an administrator included, reads someone else's binder or packs through it.
 */
export class Collection {
  private readonly rules: PeriodRules;
  private readonly backfill: number;
  private readonly store: Store;
  private readonly source: CardSource;
  private readonly demo: boolean;
  private readonly clock: () => number;
  constructor(config: AppConfig, store: Store, source: CardSource, demo: boolean, clock: () => number = () => Date.now()) {
    this.store = store;
    this.source = source;
    this.demo = demo;
    this.clock = clock;
    const cards = config.cards ?? validateCards(undefined, config.mode);
    this.rules = { teams: cards.teams };
    this.backfill = cards.backfillPeriods;
  }

  /**
   * The person's logins. `mapped` is the forge login an administrator mapped to them (`ploeg.forgeLogins`), or the
   * demo login in the demo; it comes first and is the only one `verified`. `declared` are the logins the person listed
   * themselves, which find copies to collect and never attribute anything. `logins` is both together.
   */
  identity(user: User): { logins: string[]; mapped: string | null; declared: string[]; verified: string[]; source: 'mapped' | 'setting' | 'demo' | 'none'; updatedAt: string | null } {
    const stored = this.store.cardIdentity(user.id);
    const mapped = (this.source.forgeLogin?.(user) ?? (this.demo ? demoLogins[0] : null))?.toLowerCase() ?? null;
    const declared = stored?.logins ?? [];
    const logins = [...new Set([...(mapped ? [mapped] : []), ...declared])];
    const source = this.demo ? (stored ? 'setting' : 'demo') : mapped ? 'mapped' : stored ? 'setting' : 'none';
    return { logins, mapped, declared, verified: mapped ? [mapped] : [], source, updatedAt: stored?.updatedAt ?? null };
  }

  /** Replaces the person's own logins: at most 10, each a forge or tracker login without spaces; duplicates and case are folded. */
  setIdentity(user: User, value: unknown): ReturnType<Collection['identity']> {
    if (!Array.isArray(value) || value.length > 10 || value.some(login => typeof login !== 'string' || !loginPattern.test(login.trim()))) throw new CollectionError(400, 'card_logins', 'List up to 10 logins, each one word of letters, digits and . _ @ + : -');
    const logins = [...new Set((value as string[]).map(login => login.trim().toLowerCase()))];
    this.store.setCardIdentity(user.id, logins, iso(this.clock()));
    return this.identity(user);
  }

  private pullKey(): Buffer {
    if (this.demo) return demoPullKey;
    const stored = this.store.getSecret<string>(pullKeyId);
    if (stored) return Buffer.from(stored, 'base64');
    const key = randomBytes(32);
    this.store.setSecret(pullKeyId, key.toString('base64'));
    return key;
  }

  private async copies(user: User) {
    const identity = this.identity(user);
    const list = await this.source.memberCards(user, identity.logins);
    const cards = list.cards.filter(card => copyOf(card, identity.logins, identity.verified));
    return { identity, list, cards };
  }

  private plans(user: User, cards: PloegCard[], now: number) {
    const started = Date.parse(this.store.binderMark(user.id)?.startedAt ?? iso(now));
    return planPacks(cards, this.rules, team => packFloor(started, team, this.rules, this.backfill), now);
  }

  private summaries(user: User, plans: PackPlan[], now: number): PackSummary[] {
    const pulled = new Set(this.store.pulls(user.id).keys());
    let next = false;
    return plans.map(plan => {
      const opened = this.store.openedPack(user.id, plan.period.id);
      const state: PackState = opened ? 'opened' : Date.parse(plan.period.end) <= now ? 'sealed' : 'filling';
      const entries = opened ? opened.entries : plan.entries.map(entry => ({ workItemId: entry.workItemId, kind: pulled.has(entry.workItemId) ? 'upgrade' : 'new' }));
      if (!opened) for (const entry of plan.entries) pulled.add(entry.workItemId);
      const isNext = state === 'sealed' && !next;
      if (isNext) next = true;
      return { id: plan.period.id, period: plan.period, state, count: entries.length, firsts: entries.filter(entry => entry.kind === 'new').length, upgrades: entries.filter(entry => entry.kind === 'upgrade').length, openedAt: opened?.openedAt ?? null, next: isNext, demo: this.demo };
    });
  }

  /**
   * The person's binder: each copy with its role from the roster, its first pull or the pack it waits in, newest
   * activity first; personal readouts (cards, days live, mends; never a comparison); and the moments since their last
   * visit, oldest first, for "While you were away".
   */
  async binder(user: User) {
    const now = this.clock();
    const { identity, list, cards } = await this.copies(user);
    const mark = this.store.binderMark(user.id);
    const pulls = this.store.pulls(user.id);
    const plans = this.plans(user, cards, now);
    const summaries = this.summaries(user, plans, now);
    const waiting = new Map<string, string>();
    for (const plan of plans) {
      const summary = summaries.find(entry => entry.id === plan.period.id);
      if (summary?.state === 'opened') continue;
      for (const entry of plan.entries) if (!pulls.has(entry.workItemId) && !waiting.has(entry.workItemId)) waiting.set(entry.workItemId, plan.period.id);
    }
    const quarter = quarterAt(now);
    const quarterStart = Date.parse(quarter.start);
    let daysLive = 0; let daysLiveThisQuarter = 0; let mends = 0; let released = 0;
    const away: Moment[] = [];
    const copies = cards.map(card => {
      const copy = copyOf(card, identity.logins, identity.verified)!;
      const moments = cardMoments(card, now);
      const releaseAt = card.release?.at ? Date.parse(card.release.at) : NaN;
      if (Number.isFinite(releaseAt)) { released++; daysLive += Math.floor((now - releaseAt) / day); daysLiveThisQuarter += Math.floor((now - Math.max(releaseAt, quarterStart)) / day); }
      mends += moments.filter(moment => moment.kind === 'mended').length;
      if (mark) away.push(...moments.filter(moment => moment.at > mark.seenAt));
      return { card, copy: { ...copy, pull: publicPull(pulls.get(card.workItemId)), waitingIn: waiting.get(card.workItemId) ?? null }, lastActivityAt: lastActivity(card, now) };
    }).sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '') || a.card.workItemId.localeCompare(b.card.workItemId));
    away.sort((a, b) => a.at.localeCompare(b.at));
    return {
      demo: this.demo, identity, source: list.source, now: iso(now), startedAt: mark?.startedAt ?? null, seenAt: mark?.seenAt ?? null,
      copies,
      readouts: { cards: copies.length, released, daysLive, daysLiveThisQuarter, quarter: quarter.id, mends, pulled: copies.filter(entry => entry.copy.pull).length },
      away: away.slice(-awayLimit), awayTotal: away.length, seenUntil: iso(now),
      filters: { teams: [...new Set(copies.map(entry => entry.card.team))].sort(), roles: [...new Set(copies.map(entry => entry.copy.role))] },
    };
  }

  /** Moves the person's seen moment forward to `until` (never past now), creating their binder mark on the first visit. */
  markSeen(user: User, until: unknown) {
    const now = this.clock();
    const at = typeof until === 'string' && Number.isFinite(Date.parse(until)) ? Math.min(Date.parse(until), now) : now;
    return this.store.markBinder(user.id, iso(now), iso(at));
  }

  /** The person's packs, oldest first: opened, sealed (only the oldest sealed one can be opened next) and the current period's pack while it fills. */
  async packs(user: User) {
    const now = this.clock();
    const { identity, list, cards } = await this.copies(user);
    const opened = new Map(this.store.openedPacks(user.id).map(pack => [pack.packId, pack]));
    const planned = this.summaries(user, this.plans(user, cards, now), now);
    const known = new Set(planned.map(pack => pack.id));
    const history: PackSummary[] = [...opened.values()].filter(pack => !known.has(pack.packId)).map(pack => ({ id: pack.packId, period: pack.period as Period, state: 'opened', count: pack.entries.length, firsts: pack.entries.filter(entry => entry.kind === 'new').length, upgrades: pack.entries.filter(entry => entry.kind === 'upgrade').length, openedAt: pack.openedAt, next: false, demo: pack.demo }));
    const packs = [...history, ...planned].sort((a, b) => a.period.start.localeCompare(b.period.start) || a.id.localeCompare(b.id));
    return { demo: this.demo, identity, source: list.source, now: iso(now), odds: { version: publishedOdds().version }, packs };
  }

  /** Opens the person's next sealed pack: draws a first pull for every card it holds that has none, records the pack and its pulls, and returns its contents. */
  async openPack(user: User, packId: string) {
    const now = this.clock();
    if (!periodById(packId, this.rules)) throw new CollectionError(404, 'pack_not_found', 'This pack does not exist.');
    const { cards } = await this.copies(user);
    const plans = this.plans(user, cards, now);
    const summaries = this.summaries(user, plans, now);
    const summary = summaries.find(entry => entry.id === packId);
    if (!summary) throw new CollectionError(404, 'pack_not_found', 'You have no pack for this period.');
    if (summary.state === 'opened') throw new CollectionError(409, 'pack_opened', 'You opened this pack already.');
    if (summary.state === 'filling') throw new CollectionError(409, 'pack_filling', 'This pack is still filling. It opens when its period ends.');
    if (!summary.next) throw new CollectionError(409, 'pack_order', 'Open your older packs first; packs open in order.');
    const plan = plans.find(entry => entry.period.id === packId)!;
    const key = this.pullKey();
    const existing = this.store.pulls(user.id);
    const openedAt = iso(now);
    const entries: StoredPackEntry[] = plan.entries.map(entry => ({ workItemId: entry.workItemId, kind: existing.has(entry.workItemId) ? 'upgrade' : 'new', moments: entry.moments.map(({ kind, at, detail }) => ({ kind, at, detail })) }));
    const pulls: StoredPull[] = entries.filter(entry => entry.kind === 'new').map(entry => ({ workItemId: entry.workItemId, packId, pulledAt: openedAt, ...drawPull(key, user.id, entry.workItemId, packId) }));
    this.store.markBinder(user.id, openedAt, this.store.binderMark(user.id)?.seenAt ?? openedAt);
    this.store.recordPack(user.id, { packId, openedAt, period: plan.period, entries, demo: this.demo }, pulls);
    return this.present(user, this.store.openedPack(user.id, packId)!, cards);
  }

  /** One of the person's opened packs, with its cards as they are now. */
  async pack(user: User, packId: string) {
    const stored = this.store.openedPack(user.id, packId);
    if (!stored) throw new CollectionError(404, 'pack_not_found', 'You have not opened this pack.');
    const { cards } = await this.copies(user);
    return this.present(user, stored, cards);
  }

  private present(user: User, stored: StoredPack, cards: PloegCard[]) {
    const pulls = this.store.pulls(user.id);
    const identity = this.identity(user);
    return {
      demo: stored.demo, odds: { version: publishedOdds().version },
      pack: {
        id: stored.packId, period: stored.period, openedAt: stored.openedAt, demo: stored.demo,
        entries: stored.entries.map(entry => {
          const card = cards.find(item => item.workItemId === entry.workItemId) ?? null;
          return { ...entry, card, copy: card ? copyOf(card, identity.logins, identity.verified) : null, pull: publicPull(pulls.get(entry.workItemId)) };
        }),
      },
    };
  }

  odds() { return publishedOdds(); }

  /** A Team's season page for a quarter: aggregates over the Team's cards only, with no person named. */
  async season(user: User, team: string | undefined, quarterId: string | undefined) {
    const now = this.clock();
    const teams = (await this.source.teams(user)).map(entry => entry.id);
    const selected = team ?? teams[0];
    if (!selected) return { demo: this.demo, team: null, teams, quarters: recentQuarters(now), quarter: quarterAt(now), aggregates: null, source: null };
    if (!teams.includes(selected)) throw new CollectionError(404, 'team_not_found', 'Team not found in your teams.');
    const current = quarterAt(now);
    const early = !quarterId && now - Date.parse(current.start) < 7 * day;
    const quarter = quarterId ? quarterById(quarterId) : early ? quarterAt(Date.parse(current.start) - day) : current;
    if (!quarter || Date.parse(quarter.start) > now) throw new CollectionError(400, 'quarter', 'Choose a quarter such as 2026-Q4 that has started.');
    const list = await this.source.teamCards(user, selected, undefined);
    return { demo: this.demo, team: selected, teams, quarters: recentQuarters(now), quarter, justStarted: early ? current.id : null, aggregates: seasonAggregates(list.cards, selected, quarter, now), source: list.source };
  }

}
