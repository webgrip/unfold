import { state } from '../core/state.js';
import { escape, renderHtml, announce } from '../core/dom.js';
import { configureFormat, dateTime, money } from '../core/format.js';
import { prefs, applyAppearance } from '../core/prefs.js';
import { live } from '../core/live.js';
import { keyLabel } from '../core/keys.js';
import { render } from '../core/navigation.js';
import { shell } from '../shell.js';

const sample = new Date(2026, 8, 30, 21, 30);

function choice(name, value, label, help = '') {
  const id = `pref-${name}-${value}`;
  return `<label class="pref-choice" for="${id}"><input type="radio" id="${id}" name="${name}" value="${escape(value)}" data-pref="${name}" ${prefs.get(name) === value ? 'checked' : ''}><span><strong>${escape(label)}</strong>${help ? `<small>${escape(help)}</small>` : ''}</span></label>`;
}

function toggle(name, label, help) {
  const id = `pref-${name}`;
  return `<label class="pref-choice pref-toggle" for="${id}"><input type="checkbox" id="${id}" data-pref="${name}" ${prefs.get(name) ? 'checked' : ''}><span><strong>${escape(label)}</strong><small>${escape(help)}</small></span></label>`;
}

function example(locale) {
  const previous = prefs.get('format');
  configureFormat({ locale });
  const text = `${money(1234.5)} · ${dateTime(sample)}`;
  configureFormat({ locale: previous });
  return text;
}

function section(id, title, description, body) {
  return `<section class="panel pref-section" aria-labelledby="pref-${id}-title"><div class="panel-heading"><div><h2 id="pref-${id}-title">${escape(title)}</h2><p>${escape(description)}</p></div></div><div class="pref-body">${body}</div></section>`;
}

function renderPreferences() {
  const content = [
    section('appearance', 'Appearance', 'Stored in this browser only.', `<fieldset class="pref-group"><legend>Theme</legend>${choice('theme', 'system', 'System', 'Follow the operating system')}${choice('theme', 'light', 'Light')}${choice('theme', 'dark', 'Dark')}</fieldset><fieldset class="pref-group"><legend>Density</legend>${choice('density', 'comfortable', 'Comfortable', 'Roomier rows')}${choice('density', 'compact', 'Compact', 'More rows on screen')}</fieldset>`),
    section('keyboard', 'Keyboard', 'Shortcuts help you move without the mouse.', `${toggle('singleKeyShortcuts', 'Single-key shortcuts', `Keys such as j, k, g then n, / and ?. Turn them off if you use speech input; ${keyLabel('Mod')} K keeps working.`)}<button class="button secondary" type="button" data-action="shortcuts-open">Show all shortcuts</button>`),
    section('live', 'Live updates', 'Open pages refresh themselves while this tab is visible and no dialog is open.', toggle('live', 'Refresh automatically', 'Activity every 15 seconds; the counts in the navigation every minute. Refresh by hand when this is off.')),
    section('format', 'Numbers and dates', 'Amounts stay in US dollars; this only changes how they are written.', `<fieldset class="pref-group"><legend>Format</legend>${choice('format', 'nl', 'Dutch', example('nl'))}${choice('format', 'browser', 'Your browser’s language', example('browser'))}</fieldset>`),
    section('design', 'Style guide', 'The living style guide shows every component in both themes.', '<a class="button secondary" href="#design">Open the style guide</a>'),
  ].join('');
  renderHtml(shell(`<div class="pref-sections">${content}</div>`, { title: 'Preferences', subtitle: 'How De Vloer looks and behaves in this browser.' }));
}

const spoken = { theme: { system: 'System theme', light: 'Light theme', dark: 'Dark theme' }, density: { comfortable: 'Comfortable density', compact: 'Compact density' }, format: { nl: 'Dutch number and date format', browser: 'Browser number and date format' } };

/** Stores a changed preference control (`[data-pref]`, on this page or in the shortcuts dialog) and applies it at once. */
export function changePreference(element) {
  const key = element.dataset.pref;
  const value = element.type === 'checkbox' ? element.checked : element.value;
  if (!prefs.set(key, value)) return;
  if (key === 'theme' || key === 'density') applyAppearance();
  if (key === 'format') configureFormat({ locale: value });
  if (key === 'live') live.wake();
  announce(typeof value === 'boolean' ? `${element.closest('label')?.querySelector('strong')?.textContent || 'Setting'} ${value ? 'on' : 'off'}` : spoken[key]?.[value] || 'Saved');
  if (state.bootstrap && element.closest('#app')) render();
}

/** Preferences (`#settings/preferences`): theme, density, single-key shortcuts, live updates and the number and date format, stored per browser. */
export default {
  id: 'preferences',
  match: hash => hash === 'settings/preferences' ? {} : null,
  render: renderPreferences,
  changes: { '[data-pref]': changePreference },
};
