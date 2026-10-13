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

/**
 * Records a tracked event against every flag the person reached in this page load, as OpenFeature's tracking API
 * does: a `flag.tracked` product event per flag with its variant, the event name and an optional numeric value. An
 * experiment's readout counts the people who did it per variant.
 */
export function track(event, { value } = {}) {
  for (const key of exposures) {
    const variant = flag(key, undefined);
    insight.track('flag.tracked', { screen: '', props: { 'feature_flag.key': key, 'feature_flag.result.variant': variant === undefined ? 'unknown' : String(variant), event, ...(Number.isFinite(value) ? { value } : {}) } });
  }
}

let etag = '';

/**
 * Asks the server's OFREP endpoint for every flag again and keeps the answer, revalidating with the last ETag so an
 * unchanged answer costs no body. Resolves to whether any value changed. Any OpenFeature web provider that speaks
 * OFREP can read the same endpoint.
 */
export async function refreshFlags() {
  const response = await fetch('/api/ofrep/v1/evaluate/flags', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(etag ? { 'If-None-Match': etag } : {}) }, body: JSON.stringify({ context: {} }) });
  if (response.status === 304 || !response.ok) return false;
  etag = response.headers.get('etag') ?? '';
  const answer = await response.json();
  const values = Object.fromEntries((answer.flags ?? []).filter(entry => !entry.errorCode && 'value' in entry).map(entry => [entry.key, entry.value]));
  const before = JSON.stringify(flagValues());
  useFlagValues({ ...flagValues(), ...values });
  return JSON.stringify(flagValues()) !== before;
}
