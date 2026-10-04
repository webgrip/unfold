import type { PloegCard } from './ploeg.ts';
import { cardMoments } from './packs.ts';

const day = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

export type Quarter = { id: string; start: string; end: string };

/** The calendar quarter (UTC) that holds `ms`, as `2026-Q4`. */
export function quarterAt(ms: number): Quarter {
  const date = new Date(ms);
  const index = Math.floor(date.getUTCMonth() / 3);
  const start = Date.UTC(date.getUTCFullYear(), index * 3, 1);
  const end = Date.UTC(date.getUTCFullYear(), index * 3 + 3, 1);
  return { id: `${date.getUTCFullYear()}-Q${index + 1}`, start: iso(start), end: iso(end) };
}

/** The quarter a `2026-Q4` id names, or null. */
export function quarterById(id: string): Quarter | null {
  const match = /^([0-9]{4})-Q([1-4])$/.exec(id);
  return match ? quarterAt(Date.UTC(Number(match[1]), (Number(match[2]) - 1) * 3, 1)) : null;
}

/** The current quarter and the three before it, newest first. */
export function recentQuarters(now = Date.now()): Quarter[] {
  const quarters = [quarterAt(now)];
  while (quarters.length < 4) quarters.push(quarterAt(Date.parse(quarters.at(-1)!.start) - day));
  return quarters;
}

export const bounceReasons = Object.freeze(['defect', 'requirement', 'misunderstood', 'environment', 'unknown']);

export type SeasonAggregates = {
  quarter: Quarter;
  team: string;
  cards: number;
  shipped: number;
  daysLiveAdded: number;
  finishes: Record<string, number>;
  cracks: number;
  mends: number;
  rightFirstTime: { share: number; cards: number } | null;
  bounceReasons: Record<string, number> | null;
  sets: { complete: number; total: number } | null;
  medians: SeasonMedians;
};

/** A team median over the quarter's shipped cards that know the figure, and how many cards it covers; null when none does. */
export type SeasonMedian = { value: number; cards: number } | null;
/** Team medians of the quarter's shipped cards (Unfold ADR 0035, proposed): never per person. */
export type SeasonMedians = { leadTimeSeconds: SeasonMedian; firstFeedbackSeconds: SeasonMedian; ciMinutes: SeasonMedian; flowEfficiency: SeasonMedian };

function median(values: number[]): SeasonMedian {
  const known = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  if (!known.length) return null;
  const middle = Math.floor(known.length / 2);
  return { value: known.length % 2 ? known[middle] : (known[middle - 1] + known[middle]) / 2, cards: known.length };
}

/** Medians of the KPI figures over the given cards: lead time of delivered cards, time to first feedback, CI minutes and flow efficiency. */
export function seasonMedians(cards: PloegCard[]): SeasonMedians {
  const numbers = (pick: (card: PloegCard) => number | null | undefined) => cards.map(pick).filter((value): value is number => typeof value === 'number');
  return {
    leadTimeSeconds: median(numbers(card => card.flow?.leadTime && !card.flow.leadTime.running ? card.flow.leadTime.seconds : null)),
    firstFeedbackSeconds: median(numbers(card => card.pipeline?.toFirstFeedbackSeconds)),
    ciMinutes: median(numbers(card => card.pipeline?.ci?.minutes)),
    flowEfficiency: median(numbers(card => card.flow?.efficiency)),
  };
}

/**
 * One Team's aggregates for a quarter, computed from its cards only, and never per person: cards shipped (a play
 * merged in the quarter), whole days live added in the quarter across released cards, finish steps reached, confirmed
 * cracks and mends, the right-first-time share of shipped cards that carry gate facts (no defect or unknown bounce),
 * the bounce reasons recorded in the quarter, complete set cards, and the team medians of lead time, time to first
 * feedback, CI minutes and flow efficiency over the shipped cards. A figure whose facts no card carries is null.
 */
export function seasonAggregates(cards: PloegCard[], team: string, quarter: Quarter, now = Date.now()): SeasonAggregates {
  const start = Date.parse(quarter.start);
  const end = Math.min(Date.parse(quarter.end), now);
  const within = (at: string) => { const ms = Date.parse(at); return ms >= start && ms < end; };
  const own = cards.filter(card => card.team === team);
  let shipped = 0; let liveMs = 0; let cracks = 0; let mends = 0;
  const finishes: Record<string, number> = {};
  const shippedCards: PloegCard[] = [];
  for (const card of own) {
    const moments = cardMoments(card, now);
    if (moments.some(moment => moment.kind === 'merged' && within(moment.at))) { shipped++; shippedCards.push(card); }
    for (const moment of moments) {
      if (!within(moment.at)) continue;
      if (moment.kind === 'finish') finishes[String(moment.detail.to)] = (finishes[String(moment.detail.to)] ?? 0) + 1;
      if (moment.kind === 'cracked') cracks++;
      if (moment.kind === 'mended') mends++;
    }
    const released = card.release?.at ? Date.parse(card.release.at) : NaN;
    if (Number.isFinite(released)) liveMs += Math.max(0, end - Math.max(start, released));
  }
  const gated = shippedCards.filter(card => card.gates);
  const clean = gated.filter(card => !(card.gates!.bounces ?? []).some(bounce => bounce.reason === 'defect' || bounce.reason === 'unknown'));
  const withGates = own.filter(card => card.gates);
  const reasons = withGates.length ? Object.fromEntries(bounceReasons.map(reason => [reason, 0])) as Record<string, number> : null;
  if (reasons) for (const card of withGates) for (const bounce of card.gates!.bounces) if (within(bounce.at)) reasons[bounceReasons.includes(bounce.reason) ? bounce.reason : 'unknown']++;
  const epics = own.filter(card => card.set?.role === 'epic');
  return {
    quarter, team, cards: own.length, shipped,
    daysLiveAdded: Math.floor(liveMs / day),
    finishes, cracks, mends,
    rightFirstTime: gated.length ? { share: clean.length / gated.length, cards: gated.length } : null,
    bounceReasons: reasons,
    sets: epics.length ? { complete: epics.filter(card => card.set!.complete).length, total: epics.length } : null,
    medians: seasonMedians(shippedCards),
  };
}
