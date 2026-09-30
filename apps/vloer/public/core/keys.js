import { prefs } from './prefs.js';
import { escape } from './dom.js';
import { button, kbd } from './ui.js';

/**
 * One keyboard shortcut. `keys` is the sequence to press (`Mod` is ⌘ on macOS and Ctrl elsewhere); `single`
 * marks a character-only shortcut, which obeys the single-key preference (WCAG 2.1.4); `route` is where a
 * `g` chord goes; `where` limits it to some pages; `also` is a second key sequence that does the same (it never
 * obeys the single-key preference); `proposed` marks a shortcut that is not implemented yet.
 * @typedef {object} Shortcut
 * @property {string} id
 * @property {string[]} keys
 * @property {string[]} [also]
 * @property {string} label
 * @property {string} group
 * @property {boolean} [single]
 * @property {string} [route]
 * @property {string} [where]
 * @property {boolean} [proposed]
 */

/** Every shortcut, in the order the help dialog shows them. No single key approves, rejects or cancels anything. @type {Shortcut[]} */
export const shortcuts = [
  { id: 'help', keys: ['?'], label: 'Show keyboard shortcuts', group: 'General', single: true },
  { id: 'palette', keys: ['/'], also: ['Mod', 'K'], label: 'Search and commands', group: 'General', single: true },
  { id: 'escape', keys: ['Esc'], label: 'Close a dialog, a menu or the open Work Item', group: 'General' },
  { id: 'go-now', keys: ['g', 'n'], label: 'Now', group: 'Go to', single: true, route: 'now' },
  { id: 'go-work', keys: ['g', 'w'], label: 'Work', group: 'Go to', single: true, route: 'work' },
  { id: 'go-proposed', keys: ['g', 'p'], label: 'Proposed', group: 'Go to', single: true, route: 'proposed' },
  { id: 'go-runs', keys: ['g', 'r'], label: 'Runs', group: 'Go to', single: true, route: 'runs' },
  { id: 'go-activity', keys: ['g', 'a'], label: 'Activity', group: 'Go to', single: true, route: 'activity' },
  { id: 'go-insights', keys: ['g', 'i'], label: 'Insights', group: 'Go to', single: true, route: 'insights' },
  { id: 'go-tasks', keys: ['g', 't'], label: 'Tasks', group: 'Go to', single: true, route: 'tasks' },
  { id: 'go-sessions', keys: ['g', 's'], label: 'Sessions', group: 'Go to', single: true, route: 'sessions' },
  { id: 'next', keys: ['j'], label: 'Next row', group: 'Lists', single: true, where: 'Now, Work and Tasks' },
  { id: 'previous', keys: ['k'], label: 'Previous row', group: 'Lists', single: true, where: 'Now, Work and Tasks' },
  { id: 'open', keys: ['Enter'], label: 'Open the focused row', group: 'Lists' },
  { id: 'open-link', keys: ['o'], label: 'Open the pull request or tracker item', group: 'Lists', single: true, where: 'Now and Work' },
  { id: 'new-session', keys: ['n'], label: 'New session', group: 'Sessions', single: true, where: 'Sessions' },
];

const chords = new Map(shortcuts.filter(entry => entry.route).map(entry => [entry.keys[1], entry.route]));
const chordWindow = 1500;
const textTypes = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'datetime-local', 'month', 'time', 'week']);

/** Whether the platform uses ⌘ rather than Ctrl for shortcuts. */
export function isMac() {
  const platform = globalThis.navigator?.userAgentData?.platform || globalThis.navigator?.platform || '';
  return /mac|iphone|ipad/i.test(platform);
}

/** Names a key for display: `Mod` becomes ⌘ or Ctrl, `Esc` stays, a letter is shown as typed. */
export function keyLabel(key, mac = isMac()) { return key === 'Mod' ? (mac ? '⌘' : 'Ctrl') : key; }

/** Whether `target` takes typed text, so a character key belongs to it and not to a shortcut. */
export function isTyping(target) {
  if (!target || typeof target.closest !== 'function') return false;
  if (target.closest('textarea, select, [contenteditable=""], [contenteditable="true"]')) return true;
  const input = target.closest('input');
  return Boolean(input) && textTypes.has((input.getAttribute('type') || 'text').toLowerCase());
}

const dialogOpen = () => Boolean(globalThis.document?.querySelector('dialog[open]'));

/** Whether single-key shortcuts are switched on in the preferences. */
export function singleKeysEnabled() { return prefs.get('singleKeyShortcuts') !== false; }

/**
 * Whether a character-only shortcut may act on `event`: single-key shortcuts are on, no Ctrl, ⌘ or Alt is held,
 * the focus is not in a text field and no dialog is open.
 */
export function singleKeyAllowed(event) {
  return singleKeysEnabled() && !event.ctrlKey && !event.metaKey && !event.altKey && !isTyping(event.target) && !dialogOpen();
}

/**
 * Creates the global key binding: `?` opens the help, `g` then a letter navigates, `/` and ⌘K or Ctrl K call
 * `dispatch('palette-open', event)`. Character keys obey `singleKeyAllowed`. Returns true when it handled the key.
 */
export function createGlobalKeys({ dispatch, navigate = route => { location.hash = route; }, openHelp = openShortcuts, allowed = singleKeyAllowed, now = () => Date.now() }) {
  let pending = null;
  return function globalKeys(event) {
    if (event.defaultPrevented) return false;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') { event.preventDefault(); pending = null; dispatch('palette-open', event); return true; }
    if (!allowed(event)) { pending = null; return false; }
    const started = pending;
    pending = null;
    if (started !== null && now() - started <= chordWindow) {
      const route = chords.get(event.key.toLowerCase());
      if (route) { event.preventDefault(); navigate(route); return true; }
    }
    if (event.key === 'g') { pending = now(); event.preventDefault(); return true; }
    if (event.key === '?') { event.preventDefault(); openHelp(); return true; }
    if (event.key === '/') { event.preventDefault(); dispatch('palette-open', event); return true; }
    return false;
  };
}

/** Renders the help dialog body from the shortcut table. Proposed shortcuts are labelled as proposed. */
export function shortcutsMarkup({ mac = isMac(), singleKeys = singleKeysEnabled() } = {}) {
  const groups = [...new Set(shortcuts.map(entry => entry.group))];
  const caps = list => kbd(list.map(key => keyLabel(key, mac)));
  const keys = entry => `${entry.keys.map((key, index) => `${index && entry.keys[0] === 'g' ? '<span class="shortcut-then">then</span>' : ''}${kbd([keyLabel(key, mac)])}`).join('')}${entry.also ? `<span class="shortcut-then">or</span>${caps(entry.also)}` : ''}`;
  const row = entry => `<div class="shortcut-row${entry.proposed ? ' is-proposed' : ''}"><dt>${keys(entry)}</dt><dd>${escape(entry.label)}${entry.where ? `<span class="shortcut-where"> · on ${escape(entry.where)}</span>` : ''}${entry.proposed ? ' <span class="shortcut-proposed">Proposed</span>' : ''}</dd></div>`;
  const slug = group => escape(group.toLowerCase().replaceAll(' ', '-'));
  return `<form method="dialog" class="shortcuts-form"><header class="dialog-header"><h2 id="shortcuts-title">Keyboard shortcuts</h2>${button({ label: 'Close', size: 'sm', type: 'submit', ariaLabel: 'Close keyboard shortcuts' })}</header><div class="dialog-body"><label class="shortcuts-toggle"><input type="checkbox" autofocus data-pref="singleKeyShortcuts" ${singleKeys ? 'checked' : ''}><span><strong>Single-key shortcuts</strong><small>When off, only ${escape(keyLabel('Mod', mac))} K, Enter and Esc work, so speech input never triggers a shortcut by accident.</small></span></label>${groups.map(group => `<section class="shortcut-group" aria-labelledby="shortcuts-${slug(group)}"><h3 id="shortcuts-${slug(group)}">${escape(group)}</h3><dl>${shortcuts.filter(entry => entry.group === group).map(row).join('')}</dl></section>`).join('')}</div></form>`;
}

/** Opens the `#shortcuts` dialog with the current table. */
export function openShortcuts() {
  const dialog = globalThis.document?.getElementById('shortcuts');
  if (!dialog || dialog.open) return;
  dialog.innerHTML = shortcutsMarkup();
  dialog.showModal();
}
