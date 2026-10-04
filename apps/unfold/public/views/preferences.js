import { state } from '../core/state.js';
import { escape, renderHtml, announce } from '../core/dom.js';
import { configureFormat, dateTime, money } from '../core/format.js';
import { prefs, applyAppearance } from '../core/prefs.js';
import { live } from '../core/live.js';
import { attention } from '../core/attention.js';
import { keyLabel } from '../core/keys.js';
import { icon } from '../core/icons.js';
import { button, kbd } from '../core/ui.js';
import { render } from '../core/navigation.js';
import { shell } from '../shell.js';

const sample = new Date(2026, 8, 30, 21, 30);
const spoken = { theme: { system: 'System theme', light: 'Light theme', dark: 'Dark theme' }, density: { comfortable: 'Comfortable density', compact: 'Compact density' }, format: { nl: 'Dutch number and date format', browser: 'Browser number and date format' }, cardMotion: { auto: 'Card motion follows your device', full: 'Full card motion', calm: 'Calm card motion', off: 'Card ceremonies off' } };

let watching = false;

const act = (attribute, options) => button(options).replace('<button ', `<button ${attribute} `);
const notifyHelp = {
  on: 'You hear about each new item that waits on you while an Unfold tab is open.',
  off: 'Off by default. A notification when something new starts waiting on you, only while an Unfold tab is open. Your browser asks for permission first.',
  denied: 'Blocked in this browser’s site settings. Allow notifications for this site, then come back.',
  insecure: 'Browsers allow them only over a secure (HTTPS) connection.',
  unsupported: 'This browser cannot show desktop notifications here.',
};

function example(locale) {
  const previous = prefs.get('format');
  configureFormat({ locale });
  const text = `${money(1234.5)} · ${dateTime(sample)}`;
  configureFormat({ locale: previous });
  return text;
}

function card(id, title, body) {
  return `<section class="card settings-card" aria-labelledby="pref-${id}-title"><header class="card-header"><h2 class="card-title" id="pref-${id}-title">${escape(title)}</h2></header><div class="settings-rows">${body}</div></section>`;
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

function switchRow(name, label, hint, extra = '') {
  const id = `pref-${name}`;
  return `<div class="settings-row"><div class="settings-row-text"><label class="settings-row-label" for="${id}">${escape(label)}</label><p class="settings-row-hint" id="${id}-hint">${hint}</p>${extra ? `<div class="settings-row-extra">${extra}</div>` : ''}</div><div class="settings-row-controls"><input type="checkbox" role="switch" id="${id}" data-pref="${name}" data-pref-label="${escape(label)}" aria-describedby="${id}-hint"${prefs.get(name) ? ' checked' : ''}></div></div>`;
}

function notificationsRow() {
  const status = attention.status();
  const usable = status === 'on' || status === 'off';
  return `<div class="settings-row"><div class="settings-row-text"><label class="settings-row-label" for="pref-notify">Desktop notifications</label><p class="settings-row-hint" id="pref-notify-hint">${escape(notifyHelp[status])} The tab title and the favicon dot always show what waits on you.</p></div><div class="settings-row-controls"><input type="checkbox" role="switch" id="pref-notify" data-notify aria-describedby="pref-notify-hint"${status === 'on' ? ' checked' : ''}${usable ? '' : ' disabled'}></div></div>`;
}

function group(id, legend, hint, body, layout) {
  return `<fieldset class="settings-row settings-choice" aria-describedby="pref-${id}-hint"><legend class="settings-row-label">${escape(legend)}</legend><p class="settings-row-hint" id="pref-${id}-hint">${escape(hint)}</p><div class="${layout}">${body}</div></fieldset>`;
}

function syncWithChrome() {
  if (state.view !== 'preferences' || !state.bootstrap) return;
  for (const input of document.querySelectorAll('#app [data-pref]')) {
    const value = prefs.get(input.dataset.pref);
    input.checked = input.type === 'checkbox' ? Boolean(value) : input.value === String(value);
  }
}

function watchChrome() {
  if (watching) return;
  watching = true;
  live.subscribe(syncWithChrome);
  new MutationObserver(syncWithChrome).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-density'] });
}

function renderPreferences() {
  watchChrome();
  const mod = keyLabel('Mod');
  const themes = group('theme', 'Theme', 'The sidebar stays dark in every theme.', [tile('theme', 'system', 'System', preview('system'), 'Follows your device'), tile('theme', 'light', 'Light', preview('light')), tile('theme', 'dark', 'Dark', preview('dark'))].join(''), 'settings-tiles');
  const density = group('density', 'Density', 'Compact fits more rows on screen; touch screens keep roomy rows.', [tile('density', 'comfortable', 'Comfortable', densityPreview('comfortable')), tile('density', 'compact', 'Compact', densityPreview('compact'))].join(''), 'settings-tiles two');
  const numbers = group('format', 'Numbers and dates', 'Amounts stay in US dollars; this only changes how they are written.', `${option('format', 'nl', 'Dutch', example('nl'))}${option('format', 'browser', 'Your browser’s language', example('browser'))}`, 'settings-options');
  const appearance = card('appearance', 'Appearance', `${themes}${density}${numbers}`);
  const shortcuts = switchRow('singleKeyShortcuts', 'Single-key shortcuts', `${kbd('j')} and ${kbd('k')} move through lists, ${kbd('g')} then ${kbd('n')} opens Now, ${kbd('?')} shows help. Turn them off if you use speech input; ${kbd([mod, 'K'])} keeps working.`, act('data-action="shortcuts-open"', { label: 'Show shortcuts', icon: 'keyboard', size: 'sm', variant: 'ghost' }));
  const updates = switchRow('live', 'Refresh automatically', 'Open pages check for news every 15 to 60 seconds while this tab is visible and no dialog is open. The pause button in the top bar switches the same setting.');
  const notifications = notificationsRow();
  const behaviour = card('behaviour', 'Behaviour', `${shortcuts}${updates}${notifications}`);
  const motion = group('cardMotion', 'Card motion', 'How a Run card celebrates news: a merge, a release, a finish step, a crack or its mend. Screen readers hear the news whatever you choose.', [
    option('cardMotion', 'auto', 'Automatic', globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'Calm now: your device asks for reduced motion' : 'Full now; Calm when your device asks for reduced motion'),
    option('cardMotion', 'full', 'Full', 'Light, particles and a short title around the card'),
    option('cardMotion', 'calm', 'Calm', 'No movement: a brief glow and a fading title'),
    option('cardMotion', 'off', 'Off', 'No ceremonies; the card still updates'),
  ].join(''), 'settings-options');
  const sound = switchRow('cardSound', 'Card sound', 'Off by default. Short synthesised sounds for card ceremonies and pack openings; nothing is downloaded.');
  const cards = card('cards', 'Run cards', `${motion}${sound}`);
  const guide = `<p class="settings-footnote">${icon('spark')}<span>Building Unfold? The <a href="#design">living style guide</a> shows every component and token in the current theme.</span></p>`;
  renderHtml(shell(`<div class="settings-page">${appearance}${behaviour}${cards}${guide}</div>`, { title: 'Preferences', subtitle: 'How Unfold looks and behaves in this browser. Stored here only.' }));
}

async function changeNotifications(element) {
  const status = element.checked ? await attention.enable() : attention.disable();
  announce(status === 'on' ? 'Desktop notifications on' : element.checked ? 'Your browser did not allow notifications for this site' : 'Desktop notifications off');
  render();
}

/** Stores a changed preference control (`[data-pref]`, on this page or in the shortcuts dialog) and applies it at once. */
export function changePreference(element) {
  const key = element.dataset.pref;
  const value = element.type === 'checkbox' ? element.checked : element.value;
  if (!prefs.set(key, value)) return;
  if (key === 'theme' || key === 'density') applyAppearance();
  if (key === 'format') configureFormat({ locale: value });
  if (key === 'live') live.wake();
  const name = element.dataset.prefLabel || element.labels?.[0]?.querySelector('strong')?.textContent || 'Setting';
  announce(typeof value === 'boolean' ? `${name} ${value ? 'on' : 'off'}` : spoken[key]?.[value] || 'Saved');
  if (state.bootstrap && element.closest('#app')) render();
}

/** Preferences (`#settings/preferences`): theme, density, single-key shortcuts, live updates, desktop notifications, the number and date format, card motion and card sound, stored per browser, and a link to the style guide. */
export default {
  id: 'preferences',
  match: hash => hash === 'settings/preferences' ? {} : null,
  render: renderPreferences,
  changes: { '[data-pref]': changePreference, '[data-notify]': changeNotifications },
};
