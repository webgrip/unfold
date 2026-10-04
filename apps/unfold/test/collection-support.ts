import { parseCard, type PloegCard } from '../src/ploeg.ts';

/** A Run card as the proxy validates it: merged on 2 September 2026 and released the next day, rostered to ryan (developer, merger) and iris (reviewer). */
export function card(id: string, overrides: Record<string, unknown> = {}): PloegCard {
  return parseCard({
    workItemId: id, title: `Work Item ${id}`, team: 'delivery', state: 'merged', style: { skin: 'unfold-native' },
    steward: { name: 'ryan', source: 'merged_by' }, roster: [{ name: 'ryan', roles: ['developer', 'merger'] }, { name: 'iris', roles: ['reviewer'] }],
    plays: [{ number: 5, state: 'merged', mergedAt: '2026-09-02T10:00:00Z', mergedBy: 'ryan', reviews: [] }],
    totals: { costStatus: 'not_reported', firstRunAt: '2026-09-01T08:00:00Z' },
    events: [{ at: '2026-09-01T08:00:00Z', kind: 'minted', actor: 'team:delivery' }],
    release: { at: '2026-09-03T12:00:00Z', source: 'deploy', environment: 'production' },
    ...overrides,
  });
}
