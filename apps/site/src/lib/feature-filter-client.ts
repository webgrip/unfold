import type { Audience, Category } from '../data/catalogue.ts';
import {
  fillCount,
  filterSearch,
  matchesFilter,
  parseFilter,
  withChange,
  type FilterState,
} from './feature-filter.ts';

/** Enhances the features page: one state, kept in the URL, drives items, links and the count. */
export function initFeatureFilter(root: Document): void {
  const scope = root.querySelector<HTMLElement>('[data-feature-filter]');
  if (!scope) return;
  const items = [...scope.querySelectorAll<HTMLElement>('[data-feature]')];
  const groups = [...scope.querySelectorAll<HTMLElement>('[data-feature-group]')];
  const audienceLinks = [...scope.querySelectorAll<HTMLAnchorElement>('[data-filter-audience]')];
  const categoryLinks = [...scope.querySelectorAll<HTMLAnchorElement>('[data-filter-category]')];
  const status = scope.querySelector<HTMLElement>('[data-filter-status]');
  const empty = scope.querySelector<HTMLElement>('[data-filter-empty]');
  const template = status?.dataset['template'] ?? '';
  const path = root.location.pathname;

  const linkState = (state: FilterState, change: Partial<FilterState>) =>
    `${path}${filterSearch(withChange(state, change))}`;

  function render(state: FilterState): void {
    let shown = 0;
    for (const item of items) {
      const visible = matchesFilter(
        {
          audiences: (item.dataset['audiences'] ?? '').split(' '),
          category: item.dataset['category'] ?? '',
        },
        state,
      );
      item.hidden = !visible;
      if (visible) shown += 1;
    }
    for (const group of groups) {
      group.hidden = !group.querySelector('[data-feature]:not([hidden])');
    }
    for (const link of audienceLinks) {
      const audience = (link.dataset['filterAudience'] || null) as Audience | null;
      link.href = linkState(state, { audience });
      if (audience === state.audience) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
    for (const link of categoryLinks) {
      const category = (link.dataset['filterCategory'] || null) as Category | null;
      link.href = linkState(state, { category });
      if (category === state.category) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
    if (status) status.textContent = fillCount(template, shown, items.length);
    if (empty) empty.hidden = shown > 0;
  }

  scope.addEventListener('click', (event) => {
    const mouse = event as MouseEvent;
    if (mouse.button !== 0 || mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey)
      return;
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
      '[data-filter-audience], [data-filter-category], [data-filter-reset]',
    );
    if (!link) return;
    event.preventDefault();
    const next = parseFilter(new URL(link.href, root.location.href).search);
    root.defaultView?.history.pushState(null, '', `${path}${filterSearch(next)}`);
    render(next);
  });

  root.defaultView?.addEventListener('popstate', () => render(parseFilter(root.location.search)));
  render(parseFilter(root.location.search));
}
