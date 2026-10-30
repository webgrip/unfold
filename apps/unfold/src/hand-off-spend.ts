/** A Team's spend cap per calendar period in UTC and what is left of it, as Ploeg's Teams read reports it (Ploeg ADR-0162). Amounts are US dollars. */
export type TeamSpendCap = { usd: number; period: 'day' | 'week' | 'month'; periodEnd: string; remainingUsd: number };

const periods = ['day', 'week', 'month'] as const;
const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

/**
 * Reads `spendCap` from one team of Ploeg's Teams read: the cap, null when Ploeg reports the Team has none, and
 * undefined when this Ploeg does not report it or reports it in a shape Unfold does not know.
 */
export function teamSpendCap(value: unknown): TeamSpendCap | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  const usd = amount(data.usd);
  const remainingUsd = amount(data.remainingUsd);
  const period = periods.find(entry => entry === data.period);
  const periodEnd = typeof data.periodEnd === 'string' && Number.isFinite(Date.parse(data.periodEnd)) ? new Date(Date.parse(data.periodEnd)).toISOString() : undefined;
  if (usd === undefined || usd === 0 || remainingUsd === undefined || !period || !periodEnd) return undefined;
  return { usd, period, periodEnd, remainingUsd };
}

const dollars = (value: number) => `$${value.toFixed(2)}`;
const atMost = (value: number) => Math.round(value * 100) / 100;
const leftOf = (value: number) => Math.floor(value * 100 + 1e-6) / 100;
const until = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

/**
 * The spend sentence of `unfold_hand_off`'s confirmation, from figures Ploeg reported and nothing else. `cap` is the
 * offered Team's `spendCap`: what is left of it is rounded down, so the sentence never says more is left than Ploeg
 * reported. The pool of one Work Item comes from the Team's plan, which Ploeg reports only once the Work Item exists.
 */
export function handOffSpend(team: string, cap: TeamSpendCap | null | undefined, demo: boolean): string {
  if (demo) return 'This is the illustrative demo: no Run starts and no money is spent.';
  const unknown = `The spend limit for Team ${team} is not known until Ploeg picks this up.`;
  if (cap === undefined) return `Its Runs spend from Team ${team}'s budget. ${unknown}`;
  if (cap === null) return `Its Runs spend from Team ${team}'s budget, and Ploeg reports no spend cap for Team ${team}. What this task may spend is not known until Ploeg picks it up.`;
  return `Its Runs spend from Team ${team}'s budget: Ploeg starts no Run for Team ${team} that would take its spend this ${cap.period} (UTC) over ${dollars(atMost(cap.usd))}, and ${dollars(leftOf(cap.remainingUsd))} of that is left until ${until(cap.periodEnd)}. What this task alone may spend is set by the Team's plan and is not known until Ploeg picks it up.`;
}
