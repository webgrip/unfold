import { state } from '../core/state.js';
import { escape, renderHtml, announce } from '../core/dom.js';
import { configureFormat, dateTime, money } from '../core/format.js';
import { prefs, prefDefaults, applyAppearance } from '../core/prefs.js';
import { live } from '../core/live.js';
import { keyLabel } from '../core/keys.js';
import { button, kbd } from '../core/ui.js';
import { render } from '../core/navigation.js';
import { shell } from '../shell.js';

const sample = new Date(2026, 8, 30, 21, 30);
const spoken = { theme: { system: 'System theme', light: 'Light theme', dark: 'Dark theme' }, density: { comfortable: 'Comfortable density', compact: 'Compact density' }, format: { nl: 'Dutch number and date format', browser: 'Browser number and date format' } };

const act = (attribute, options) => button(options).replace('<button ', `<button ${attribute} `);
const notificationsOffered = () => Object.hasOwn(prefDefaults, 'notifications') && typeof globalThis.Notification === 'function';

function example(locale) {
  const previous = prefs.get('format');
  configureFormat({ locale });
  const text = `${money(1234.5)} · ${dateTime(sample)}`;
  configureFormat({ locale: previous });
  return text;
}

function card(id, title, description, body) {
  return `<section class="card settings-card" aria-labelledby="pref-${id}-title"><header class="settings-card-header"><div><h2 class="settings-card-title" id="pref-${id}-title">${escape(title)}</h2><p class="settings-card-description">${escape(description)}</p></div></header>${body}</section>`;
}

function preview(scheme) {
  const screen = `<span class="theme-screen"><span class="theme-rail"></span><span class="theme-canvas"><span class="theme-line"></span><span class="theme-surface"><span class="theme-line"></span><span class="theme-line short"></span><span class="theme-pill"></span></span></span></span>`;
  return `<span class="theme-preview" data-scheme="${scheme}" aria-hidden="true">${scheme === 'system' ? `<span class="theme-half" data-scheme="light">${screen}</span><span class="theme-half" data-scheme="dark">${screen}</span>` : screen}</span>`;
}

function densityPreview(value) {
  return `<span class="density-preview" data-density-preview="${value}" aria-hidden="true">${'<span class="density-row"><span class="density-dot"></span><span class="density-line"></span></span>'.repeat(4)}</span>`;
}

function tile(name, value, label, picture, hint = '') {
  const id = `pref-${name}-${value}`;
  return `<label class="settings-tile" for="${id}">${picture}<span class="settings-tile-label"><input type="radio" id="${id}" name="${name}" value="${escape(value)}" data-pref="${name}"${prefs.get(name) === value ? ' checked' : ''}><span class="settings-tile-name">${escape(label)}</span>${hint ? `<span class="settings-tile-hint">${escape(hint)}</span>` : ''}</span></label>`;
}

function option(name, value, label, detail) {
  const id = `pref-${name}-${value}`;
  return `<label class="settings-option" for="${id}"><input type="radio" id="${id}" name="${name}" value="${escape(value)}" data-pref="${name}"${prefs.get(name) === value ? ' checked' : ''}><span class="settings-option-name">${escape(label)}</span><span class="settings-option-detail num">${escape(detail)}</span></label>`;
}

function switchRow(name, label, hint) {
  const id = `pref-${name}`;
  return `<div class="settings-row"><div class="settings-row-text"><label class="settings-row-label" for="${id}">${escape(label)}</label><p class="settings-row-hint" id="${id}-hint">${hint}</p></div><input type="checkbox" role="switch" id="${id}" data-pref="${name}" data-pref-label="${escape(label)}" aria-describedby="${id}-hint"${prefs.get(name) ? ' checked' : ''}></div>`;
}

function group(id, legend, hint, body, layout) {
  return `<fieldset class="settings-row settings-choice" aria-describedby="pref-${id}-hint"><legend class="settings-row-label">${escape(legend)}</legend><p class="settings-row-hint" id="pref-${id}-hint">${escape(hint)}</p><div class="${layout}">${body}</div></fieldset>`;
}

function renderPreferences() {
  const mod = keyLabel('Mod');
  const appearance = card('appearance', 'Appearance', 'Stored in this browser only.', `<div class="settings-rows">${group('theme', 'Theme', 'The sidebar stays dark in every theme.', [tile('theme', 'system', 'System', preview('system'), 'Follows your device'), tile('theme', 'light', 'Light', preview('light')), tile('theme', 'dark', 'Dark', preview('dark'))].join(''), 'settings-tiles')}${group('density', 'Density', 'Compact fits more rows on screen; touch screens keep roomy rows.', [tile('density', 'comfortable', 'Comfortable', densityPreview('comfortable')), tile('density', 'compact', 'Compact', densityPreview('compact'))].join(''), 'settings-tiles two')}</div>`);
  const keyboard = card('keyboard', 'Keyboard', 'Move around without the mouse.', `<div class="settings-rows">${switchRow('singleKeyShortcuts', 'Single-key shortcuts', `${kbd('j')} and ${kbd('k')} move through lists, ${kbd('g')} then ${kbd('n')} opens Now, ${kbd('?')} shows help. Turn them off if you use speech input; ${kbd([mod, 'K'])} keeps working.`)}<div class="settings-row"><div class="settings-row-text"><p class="settings-row-label">All shortcuts</p><p class="settings-row-hint">Every shortcut and the page it works on.</p></div>${act('data-action="shortcuts-open"', { label: 'Show shortcuts', icon: 'keyboard', size: 'sm' })}</div></div>`);
  const updates = card('live', 'Live updates', 'Pages refresh themselves while this tab is visible and no dialog is open.', `<div class="settings-rows">${switchRow('live', 'Refresh automatically', 'Open pages check for news every 15 to 60 seconds. The Live button in the top bar switches the same setting. When it is off, use Refresh on each page.')}</div>`);
  const numbers = card('format', 'Numbers and dates', 'Amounts stay in US dollars; this only changes how they are written.', `<div class="settings-rows"><fieldset class="settings-row settings-choice"><legend class="settings-row-label">Format</legend><div class="settings-options">${option('format', 'nl', 'Dutch', example('nl'))}${option('format', 'browser', 'Your browser’s language', example('browser'))}</div></fieldset></div>`);
  const notifications = notificationsOffered() ? card('notifications', 'Notifications', 'Only while a De Vloer tab is open.', `<div class="settings-rows">${switchRow('notifications', 'Desktop notifications', 'A notification when something new starts waiting on you. Your browser asks for permission the first time.')}</div>`) : '';
  const guide = card('design', 'Style guide', 'For people who build De Vloer.', `<div class="settings-rows"><div class="settings-row"><div class="settings-row-text"><p class="settings-row-label">Living style guide</p><p class="settings-row-hint">Every component and token, in the current theme.</p></div>${button({ label: 'Open the style guide', href: '#design', size: 'sm', icon: 'arrow-up-right' })}</div></div>`);
  renderHtml(shell(`<div class="settings-page">${appearance}${keyboard}${updates}${numbers}${notifications}${guide}</div>`, { title: 'Preferences', subtitle: 'How De Vloer looks and behaves in this browser.' }));
}

async function permitNotifications(element) {
  if (!element.checked || globalThis.Notification.permission === 'granted') return true;
  const answer = await globalThis.Notification.requestPermission();
  if (answer === 'granted') return true;
  element.checked = false;
  announce('Your browser blocked notifications for this site');
  return false;
}

/** Stores a changed preference control (`[data-pref]`, on this page or in the shortcuts dialog) and applies it at once. */
export async function changePreference(element) {
  const key = element.dataset.pref;
  const value = element.type === 'checkbox' ? element.checked : element.value;
  if (key === 'notifications' && !(await permitNotifications(element))) return;
  if (!prefs.set(key, value)) return;
  if (key === 'theme' || key === 'density') applyAppearance();
  if (key === 'format') configureFormat({ locale: value });
  if (key === 'live') live.wake();
  const name = element.dataset.prefLabel || element.labels?.[0]?.querySelector('strong')?.textContent || 'Setting';
  announce(typeof value === 'boolean' ? `${name} ${value ? 'on' : 'off'}` : spoken[key]?.[value] || 'Saved');
  if (state.bootstrap && element.closest('#app')) render();
}

/** Preferences (`#settings/preferences`): theme, density, single-key shortcuts, live updates and the number and date format, stored per browser, and a link to the style guide. */
export default {
  id: 'preferences',
  match: hash => hash === 'settings/preferences' ? {} : null,
  render: renderPreferences,
  changes: { '[data-pref]': changePreference },
};
