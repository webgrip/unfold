import { escape, safeUrl } from './dom.js';
import { icon } from './icons.js';
import { trackerName, trackerOr, taskIdText } from './tracker-registry.js';

export { setTrackers, trackerOf, trackerName, trackerOr, taskIdText, openTaskLabel } from './tracker-registry.js';

/**
 * The task a Work Item came from, as one chip: the tracker's name and the task's id, and, when `href` is allowed and
 * the task has a web address, a link that opens it in a new tab. Empty for work no tracker holds.
 * @param {{ provider?: string, externalId?: string, url?: string }} item
 * @param {{ link?: boolean, text?: string }} [options] `text` replaces the id, such as a full reference.
 * @returns {string}
 */
export function taskChip(item, { link = true, text = '' } = {}) {
  const id = text || taskIdText(item?.provider, item?.externalId);
  if (!id) return '';
  const name = trackerName(item?.provider);
  const inner = `${name ? `<span class="task-chip-from">${escape(name)}</span> ` : ''}<span class="task-chip-ref">${escape(id)}</span>`;
  const href = link ? safeUrl(item?.url) : null;
  if (!href) return `<span class="task-chip">${inner}</span>`;
  return `<a class="task-chip" href="${escape(href)}" target="_blank" rel="noopener noreferrer" data-link-out="tracker">${inner}${icon('external')}<span class="sr-only">, open the task in ${escape(trackerOr(item?.provider))} (opens in a new tab)</span></a>`;
}
