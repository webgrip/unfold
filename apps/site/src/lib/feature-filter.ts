import { AUDIENCES, CATEGORIES, type Audience, type Category } from '../data/catalogue.ts';

/** The one selection state of the feature list. The URL query is its only home. */
export interface FilterState {
  audience: Audience | null;
  category: Category | null;
}

export const AUDIENCE_PARAM = 'for';
export const CATEGORY_PARAM = 'category';

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function parseFilter(search: string): FilterState {
  const params = new URLSearchParams(search);
  return {
    audience: pick(params.get(AUDIENCE_PARAM), AUDIENCES),
    category: pick(params.get(CATEGORY_PARAM), CATEGORIES),
  };
}

export function filterSearch(state: FilterState): string {
  const params = new URLSearchParams();
  if (state.audience) params.set(AUDIENCE_PARAM, state.audience);
  if (state.category) params.set(CATEGORY_PARAM, state.category);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function withChange(state: FilterState, change: Partial<FilterState>): FilterState {
  return { ...state, ...change };
}

export function matchesFilter(
  item: { audiences: readonly string[]; category: string },
  state: FilterState,
): boolean {
  return (
    (state.audience === null || item.audiences.includes(state.audience)) &&
    (state.category === null || item.category === state.category)
  );
}

export function fillCount(template: string, shown: number, total: number): string {
  return template.replace('{shown}', String(shown)).replace('{total}', String(total));
}
