let unauthorizedHandler = () => {};

/** Registers what happens when the server answers 401: the entry signs the browser out and shows the login page. */
export function onUnauthorized(handler) { unauthorizedHandler = handler; }

/** Runs the registered 401 handler. */
export function unauthorized() { unauthorizedHandler(); }

/**
 * Calls the Unfold JSON API with the same-origin request marker. A 401 outside login runs the registered handler.
 * Rejects with an Error that carries the server's `status` and `code`.
 */
export async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', 'X-Unfold-Request': '1', ...options.headers }, credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') unauthorized();
    const error = new Error(data.error?.message || 'The request could not be completed.');
    error.status = response.status;
    error.code = data.error?.code;
    throw error;
  }
  return data;
}
