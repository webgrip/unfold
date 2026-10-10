import type { Event, Session } from '../types.ts';
import { money } from '../../public/core/format.js';

type Json = Record<string, any>;

/** The shares of the budget at which a chat says what has been spent: half, four fifths and all of it. */
export const spendThresholds = [0.5, 0.8, 1] as const;

/** What a chat knows about a session's spend at one point in its events. */
export type SpendState = { budgetUsd: number; observedUsd?: number; settledUsd?: number; settled: boolean; demo: boolean; crossed: number };

const amount = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

/** The spend state just before the earliest of `later`: today's budget less every increase recorded in `later`. */
export function initialSpend(session: Pick<Session, 'budgetUsd' | 'costStatus'>, later: readonly Pick<Event, 'type' | 'data'>[]): SpendState {
  const increases = later.filter(event => event.type === 'budget.increased').reduce((sum, event) => sum + (amount(event.data.amountUsd) ?? 0), 0);
  return { budgetUsd: Math.max(0, Math.round((session.budgetUsd - increases) * 1e8) / 1e8), settled: false, demo: session.costStatus === 'demo', crossed: 0 };
}

const spent = (state: SpendState): number | undefined => {
  const values = [state.settledUsd, state.observedUsd].filter((value): value is number => value !== undefined);
  return values.length ? Math.max(...values) : undefined;
};

/** One line of spend against budget, as the chat's system notification reads: "Spent US$ 1,20 of US$ 8,00". */
export function spendLine(state: SpendState): string {
  if (state.demo) return 'Demo · no model calls or spend.';
  const value = spent(state);
  if (value === undefined) return `Spend not reported yet · budget ${money(state.budgetUsd)}.`;
  const qualifier = state.settled && value === state.settledUsd ? '' : ' · observed, not settled';
  return `Spent ${money(value)} of ${money(state.budgetUsd)}${qualifier}.`;
}

const percent = (share: number) => `${Math.round(share * 100)} %`;

/**
 * Applies one budget event and returns the notification it earns: the spend line with the highest threshold it crossed,
 * once per threshold and budget. A raised budget starts the thresholds again; a demo never earns one.
 */
export function observeSpend(state: SpendState, event: Pick<Event, 'type' | 'data'>): string | undefined {
  const data = event.data as Json;
  if (event.type === 'budget.increased') {
    const total = amount(data.totalBudgetUsd) ?? state.budgetUsd + (amount(data.amountUsd) ?? 0);
    if (total !== state.budgetUsd) { state.budgetUsd = total; state.crossed = 0; }
    return undefined;
  }
  if (event.type === 'budget.observed') { state.observedUsd = amount(data.observedUsd) ?? state.observedUsd; if (amount(data.budgetUsd) !== undefined) state.budgetUsd = data.budgetUsd; }
  else if (event.type === 'budget.settled') { state.settledUsd = amount(data.spentUsd) ?? state.settledUsd; state.settled = data.costStatus === 'settled'; }
  else return undefined;
  const value = spent(state);
  if (state.demo || value === undefined || !(state.budgetUsd > 0)) return undefined;
  const reached = spendThresholds.filter(share => value >= share * state.budgetUsd).length;
  if (reached <= state.crossed) return undefined;
  state.crossed = reached;
  return `${spendLine(state).replace(/\.$/, '')} · ${percent(spendThresholds[reached - 1])} of the budget.`;
}

/** Keeps one spend state per chat projection for as long as the projection lives. */
export class SpendNotices {
  private readonly states = new WeakMap<object, SpendState>();

  /** The projection's spend state, created on first use as it stood just before the event `at` is applied. */
  of(projection: object, session: Session, at: number, events: () => readonly Event[]): SpendState {
    let state = this.states.get(projection);
    if (!state) { state = initialSpend(session, events().filter(event => event.id >= at)); this.states.set(projection, state); }
    return state;
  }
}
