import { micros } from './go.ts';
import type { WorkItemFacts } from './facts.ts';
import type { CardJson, CardRules, CrackRecord } from './assemble.ts';

/** The most logins one card list names. */
export const cardListMembers = 20;

/** When a card last moved, as Ploeg's card list ordered it (Ploeg ADR-0054): the latest of its first Run, its newest pull request seen or merged, its release deploy and its newest crack step, else its Work Item's creation. Epoch microseconds. */
export function cardActivity(facts: WorkItemFacts, cracks: readonly CrackRecord[], rules: Pick<CardRules, 'releaseEnvironment'>): number {
  const parts: number[] = [];
  const starts = facts.runs.filter(r => r.startedAt !== null).map(r => micros(r.startedAt!));
  if (starts.length) parts.push(Math.min(...starts));
  const plays = facts.pullRequests.map(p => Math.max(micros(p.firstSeenAt), p.state === 'merged' && p.mergedAt ? micros(p.mergedAt) : -Infinity));
  if (plays.length) parts.push(Math.max(...plays));
  const releases = facts.pullRequests.filter(p => p.state === 'merged').flatMap(p => p.deployments.filter(d => d.environment === rules.releaseEnvironment(`${p.owner}/${p.repo}`)).map(d => micros(d.firstDeployedAt)));
  if (releases.length) parts.push(Math.max(...releases));
  const steps = cracks.filter(c => (c.state === 'confirmed' || c.state === 'disputed') && c.confirmedAt !== null).map(c => Math.max(...[c.confirmedAt, c.mendedAt, c.mendConfirmedAt].filter((v): v is string => v !== null).map(micros)));
  if (steps.length) parts.push(Math.max(...steps));
  return parts.length ? Math.max(...parts) : micros(facts.workItem.createdAt);
}

/** Whether a card's roster or steward names one of `logins`, compared without case, as Ploeg's `namesAny`. */
export function namesAny(card: Pick<CardJson, 'roster' | 'steward'>, logins: ReadonlySet<string>): boolean {
  return card.roster.some(person => logins.has(person.name.toLowerCase())) || Boolean(card.steward && logins.has(card.steward.name.toLowerCase()));
}

/** The logins a card list names: trimmed, lowercased, without bots or duplicates, sorted. */
export function cardListLogins(members: readonly string[], bots: readonly string[]): string[] {
  const bot = new Set(bots.map(b => b.toLowerCase()));
  return [...new Set(members.map(m => m.trim().toLowerCase()).filter(l => l && !bot.has(l)))].sort();
}

/** Orders cards newest activity first, then by Work Item id descending, as Ploeg's card list did. */
export function orderCards<T extends { activity: number; id: string }>(cards: T[]): T[] {
  return [...cards].sort((a, b) => b.activity - a.activity || (BigInt(b.id) > BigInt(a.id) ? 1 : BigInt(b.id) < BigInt(a.id) ? -1 : 0));
}
