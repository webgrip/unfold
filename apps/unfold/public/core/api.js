import { activity } from './confusion.js';
import { rememberRequest } from './report-capture.js';
let unauthorizedHandler = () => {};

/** Registers what happens when the server answers 401: the entry signs the browser out and shows the login page. */
export function onUnauthorized(handler) { unauthorizedHandler = handler; }

/** Runs the registered 401 handler. */
export function unauthorized() { unauthorizedHandler(); }

/** What a failed answer without an Unfold error body means: a proxy answered in Unfold's place, or Unfold gave no reason. */
function unexplained(status) {
  if (status >= 502 && status <= 504) return 'Unfold is not reachable right now; the proxy in front of it answered instead. It may be restarting. Try again in a minute.';
  return `Unfold answered ${status} without saying why. Try again in a minute; if it keeps failing, report a problem.`;
}

/**
 * Calls the Unfold JSON API with the same-origin request marker. A 401 outside login runs the registered handler.
 * Rejects with an Error that carries the server's `status` and `code`, also when a gateway answered with a body that is not JSON
 * (`gateway_unavailable`) or the network failed (`network_unreachable`, status 0); see docs/contracts/error-codes.md.
 */
export async function api(path, options = {}) {
  activity();
  const started = performance.now();
  let response;
  try { response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', 'X-Unfold-Request': '1', ...options.headers }, credentials: 'same-origin' }); }
  catch (error) {
    rememberRequest({ method: options.method, url: path, durationMs: performance.now() - started });
    if (error?.name === 'AbortError') throw error;
    throw Object.assign(new Error('Unfold did not answer: the browser could not reach it. Check your connection, then try again.'), { status: 0, code: 'network_unreachable' });
  }
  rememberRequest({ method: options.method, url: path, status: response.status, durationMs: performance.now() - started });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== '/api/login') unauthorized();
    const error = new Error(data.error?.message || unexplained(response.status));
    error.status = response.status;
    error.code = data.error?.code || (response.status >= 502 && response.status <= 504 ? 'gateway_unavailable' : response.status >= 500 ? 'internal_error' : 'request_failed');
    throw error;
  }
  return response.json();
}
