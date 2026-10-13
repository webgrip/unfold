import { state } from './state.js';
import { insight } from './insight.js';

const exposures = new Set();

/**
 * The value of a feature flag for the signed-in person, as the server evaluated it at bootstrap or on the last Labs
 * change; `fallback` when the server sent none. The browser never sees targeting rules, only values.
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @returns {T}
 */
export function flag(key, fallback) {
  const values = state.bootstrap?.flags;
  return values && Object.hasOwn(values, key) ? values[key] : fallback;
}

/** Whether a boolean feature flag is on for the signed-in person. */
export function enabled(key) {
  return flag(key, false) === true;
}

/** Every flag value the server sent, for a view model. */
export function flagValues() {
  return { ...(state.bootstrap?.flags ?? {}) };
}

/** Replaces the flag values after a Labs change, so the next render uses them without a reload. */
export function useFlagValues(values) {
  if (state.bootstrap && values && typeof values === 'object') state.bootstrap = { ...state.bootstrap, flags: { ...values } };
}

/**
 * Records that the person reached a flagged code path, once per page load and flag: the OpenTelemetry feature-flag
 * attributes `feature_flag.key` and `feature_flag.result.variant` as a `flag.exposed` product event.
 */
export function exposed(key, { screen = '', workItemId } = {}) {
  if (exposures.has(key)) return;
  exposures.add(key);
  const value = flag(key, undefined);
  const id = Number(workItemId);
  insight.track('flag.exposed', { screen, ...(Number.isSafeInteger(id) && id > 0 ? { workItemId: id } : {}), props: { 'feature_flag.key': key, 'feature_flag.result.variant': value === undefined ? 'unknown' : String(value) } });
}
