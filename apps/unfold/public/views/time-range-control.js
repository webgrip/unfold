import { timePickerController } from '../controls/time-picker.js';
import { rangeFromQuery, rangeToQuery, resolveRange } from '../controls/time-range.js';
import { singleKeyAllowed } from '../core/keys.js';

/** The range Runs and Activity show when the address names none. */
export const listRange = Object.freeze({ from: 'now-7d', to: 'now' });

/**
 * The time picker of a list page, read from the page's address (`from`, `to`). The page refreshes itself, so the
 * picker has no auto-refresh; its `t ←`, `t →` and `t z` keys obey the single-key shortcut preference.
 * @param {string} id The picker's element id.
 * @param {Record<string, string>} query The page's address query.
 * @param {(range: { from: string, to: string }) => void} onChange
 */
export function listRangeControl(id, query, onChange) {
  const time = typeof Intl === 'object' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
  const picker = timePickerController({ id, state: { range: rangeFromQuery(query, Date.now(), listRange).range, ...(time ? { timeZone: time } : {}) }, refreshControls: false, allowed: singleKeyAllowed, onChange: change => onChange(change.range) });
  return {
    picker,
    markup: picker.markup,
    /** The applied range in milliseconds, resolved now. */
    resolved: () => { const resolved = resolveRange(picker.state().range, Date.now()); return resolved.ok ? { from: resolved.from, to: resolved.to } : null; },
    /** The address parameters for the applied range, empty for the default. */
    query: () => { const { from, to } = rangeToQuery(picker.state().range, '', listRange); return { from, to }; },
  };
}
