import { escape, safeUrl } from './dom.js';
import { icon } from './icons.js';

let registry = new Map();

/**
 * Sets the trackers the screens name, from the bootstrap's `trackers` list (the server's tracker registry). Until it
 * is set, every tracker reads as "its tracker".
 * @param {{ name: string, label: string, idMark?: string, handsOffByAssignment?: boolean, fixture?: boolean }[]} list
 */
export function setTrackers(list) {
  registry = new Map((Array.isArray(list) ? list : []).filter(entry => entry && typeof entry.name === 'string' && typeof entry.label === 'string').map(entry => [entry.name, entry]));
}

/** The registry facts of `provider`, or null for a provider the registry does not know. */
export function trackerOf(provider) { return registry.get(String(provider ?? '')) ?? null; }

/** The product name of a real tracker (`ClickUp`), or '' for an unknown provider and for a demo fixture. */
export function trackerName(provider) {
  const entry = trackerOf(provider);
  return entry && !entry.fixture ? entry.label : '';
}

/** The tracker's name, or `fallback` ("its tracker") when it is not a known real tracker. */
export function trackerOr(provider, fallback = 'its tracker') { return trackerName(provider) || fallback; }

/**
 * A task's id as its tracker shows it: `#624` for a number, the tracker's mark before another native id (`#86c0abc12`),
 * and a key that already reads as one (`WEB-12`, `DEMO-8`) as it is.
 */
export function taskIdText(provider, externalId) {
  const id = String(externalId ?? '').trim();
  if (!id) return '';
  if (/^\d+$/.test(id)) return `#${id}`;
  const mark = trackerOf(provider)?.idMark;
  return mark && /^[a-z0-9]+$/.test(id) ? `${mark}${id}` : id;
}

/** The label of a link that opens a task: "Open in ClickUp", or "Open the task" for an unknown tracker. */
export function openTaskLabel(provider) {
  const name = trackerName(provider);
  return name ? `Open in ${name}` : 'Open the task';
}

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
