/**
 * The query parameters that only ask the server to skip its cache; the recording is keyed without them. This module is
 * the hosted replay's route table, which the product never loads: what the replay answers from the recording, what it
 * plays from the recorded session timeline, and what it refuses. The recorder keys its recording with
 * {@link replayKey}, and its lint checks that every `/api/` path in `public/` matches one of these routes.
 */
export const cacheParams = Object.freeze(['refresh']);

/** The error every refused request answers with: HTTP 409 and this body, which `api()` shows as a toast. */
export const staticDemoError = Object.freeze({ code: 'static_demo', message: 'This hosted replay is recorded. Run mise run demo to try this.' });

/** The text the recorder writes where a person's review note goes; the replay puts the typed note in its place. */
export const notePlaceholder = 'REPLAY-REVIEW-NOTE';

/**
 * The recording key of a request: its method and path, and its query without cache parameters, sorted.
 * @param {string} method
 * @param {string | URL} url An absolute URL, or a path that starts with `/`.
 */
export function replayKey(method, url) {
  const parsed = new URL(url, 'http://replay.invalid');
  const query = [...parsed.searchParams].filter(([name]) => !cacheParams.includes(name)).sort(([a, av], [b, bv]) => a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1);
  const search = new URLSearchParams(query).toString();
  return `${method.toUpperCase()} ${parsed.pathname}${search ? `?${search}` : ''}`;
}

const id = '[^/]+';

/** GET routes answered from the recorded responses. A recorded key the replay lacks answers 404 and counts as unmatched. */
export const recordedRoutes = Object.freeze([
  '/api/bootstrap', '/api/health', '/api/links', '/api/models', '/api/auth/methods', '/api/me/card-identity',
  '/api/binder', '/api/packs', '/api/packs/odds', `/api/packs/${id}`, '/api/season', `/api/cards/${id}/seen`,
  '/api/card-themes', `/api/card-themes/${id}`, `/api/card-themes/${id}/versions`, `/api/card-themes/${id}/versions/${id}`,
  '/api/task-sources', `/api/task-sources/${id}/tasks`, `/api/task-sources/${id}/tasks/${id}`,
  '/api/ploeg', '/api/ploeg/teams', '/api/ploeg/summary', '/api/ploeg/runs', '/api/ploeg/events', '/api/ploeg/proposed', '/api/ploeg/now',
  '/api/ploeg/work-items', `/api/ploeg/work-items/${id}`, `/api/ploeg/work-items/${id}/card`, `/api/ploeg/work-items/${id}/cracks`, `/api/ploeg/work-items/${id}/crack-candidates`,
  `/api/ploeg/work-items/${id}/context`,
].map(path => ({ method: 'GET', path })));

/** Requests answered from the recorded session timeline or acknowledged without being kept. */
export const timelineRoutes = Object.freeze([
  { method: 'GET', path: '/api/sessions' },
  { method: 'POST', path: '/api/sessions' },
  { method: 'GET', path: `/api/sessions/${id}` },
  { method: 'GET', path: `/api/sessions/${id}/history` },
  { method: 'GET', path: `/api/sessions/${id}/permissions` },
  { method: 'GET', path: `/api/sessions/${id}/events` },
  { method: 'POST', path: `/api/sessions/${id}/start` },
  { method: 'POST', path: `/api/sessions/${id}/review` },
  { method: 'POST', path: `/api/ploeg/work-items/${id}/cancel` },
  { method: 'POST', path: `/api/cards/${id}/seen` },
]);

/**
 * What the replay refuses with {@link staticDemoError}: everything that would change recorded state, sign in, reach a
 * tracker or model, or download a file the recording does not hold.
 */
export const refusedRoutes = Object.freeze([
  { method: 'POST', path: '/api/login' }, { method: 'POST', path: '/api/logout' }, { method: 'GET', path: '/api/auth/oidc' },
  { method: '*', path: '/api/editor-credentials' }, { method: '*', path: `/api/editor-credentials/${id}` }, { method: '*', path: `/api/editor-requests/${id}` }, { method: '*', path: `/api/editor-requests/${id}/${id}` },
  { method: '*', path: '/api/links' }, { method: '*', path: `/api/links/${id}` },
  { method: 'PUT', path: '/api/me/card-identity' }, { method: '*', path: `/api/cards/${id}/world` }, { method: 'POST', path: '/api/binder/seen' }, { method: 'POST', path: `/api/packs/${id}/open` },
  { method: '*', path: `/api/card-themes/${id}` }, { method: 'POST', path: '/api/card-assets' }, { method: 'GET', path: `/api/card-assets/${id}` }, { method: 'POST', path: '/api/card-art/generate' },
  { method: 'POST', path: '/api/task-imports' }, { method: '*', path: `/api/task-sources/${id}/tasks/${id}/${id}` },
  { method: 'POST', path: `/api/ploeg/work-items/${id}/${id}` }, { method: 'POST', path: `/api/ploeg/work-items/${id}/cracks/${id}/${id}` },
  { method: 'GET', path: `/api/sessions/${id}/delivery` }, { method: '*', path: `/api/sessions/${id}/${id}` }, { method: '*', path: `/api/sessions/${id}/${id}/${id}` },
]);

const compiled = new Map();
function pattern(path) {
  if (!compiled.has(path)) compiled.set(path, new RegExp(`^${path}$`));
  return compiled.get(path);
}

/**
 * The first route in `routes` that a request matches, or `null`.
 * @param {ReadonlyArray<{ method: string, path: string }>} routes
 * @param {string} method
 * @param {string} pathname
 */
export function findRoute(routes, method, pathname) {
  return routes.find(route => (route.method === '*' || route.method === method.toUpperCase()) && pattern(route.path).test(pathname)) ?? null;
}
