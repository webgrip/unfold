const escaped = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The tracker tasks (`VIK-2051`, for the prefixes Unfold named) and Work Items (an Unfold `#work/<id>` link on `base`,
 * or "Work Item 184") a prompt or commit message names. Only these ids leave the machine, never the text.
 * @param {string} text
 * @param {string[]} [prefixes]
 * @param {string} [base]
 * @returns {{ refs: string[], workItems: string[] } | null}
 */
export function mentionsIn(text, prefixes = [], base = '') {
  const known = prefixes.filter(prefix => /^[A-Za-z]{2,10}$/.test(prefix));
  const refs = known.length ? [...new Set([...String(text).matchAll(new RegExp(`(?:^|[^A-Za-z0-9])(${known.join('|')})-([1-9][0-9]{0,18})(?![0-9A-Za-z])`, 'gi'))].map(match => `${match[1].toUpperCase()}-${match[2]}`))].slice(0, 10) : [];
  const links = base ? [...String(text).matchAll(new RegExp(`${escaped(base)}/?#work/([1-9][0-9]{0,18})(?![0-9])`, 'g'))].map(match => match[1]) : [];
  const named = [...String(text).matchAll(/\bwork[ -]item #?([1-9][0-9]{0,18})(?![0-9])/gi)].map(match => match[1]);
  const workItems = [...new Set([...links, ...named])].slice(0, 10);
  return refs.length || workItems.length ? { refs, workItems } : null;
}
