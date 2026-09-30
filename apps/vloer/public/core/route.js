const moved = {
  ploeg: 'insights',
  'ploeg/overview': 'insights',
  'ploeg/work': 'work',
  'ploeg/activity': 'activity',
  'ploeg/runs': 'runs',
  'ploeg/proposed': 'proposed',
  account: 'settings/accounts',
  system: 'settings/environment',
  settings: 'settings/accounts',
};

/**
 * Splits a location hash (`#work?lane=queued`, `work?lane=queued` or empty) into its path and its query
 * parameters, read with URLSearchParams. The path keeps its original encoding.
 * @param {string} hash
 * @returns {{ path: string, query: Record<string, string> }}
 */
export function parseHash(hash) {
  const text = String(hash ?? '').replace(/^#/, '');
  const index = text.indexOf('?');
  return { path: index === -1 ? text : text.slice(0, index), query: Object.fromEntries(new URLSearchParams(index === -1 ? '' : text.slice(index + 1))) };
}

/**
 * Builds a hash without the leading `#` from a path and query parameters. Empty, null and undefined values are
 * left out, so `buildHash('work', { lane: '', team: 'delivery' })` is `work?team=delivery`.
 * @param {string} path
 * @param {Record<string, unknown>} [query]
 * @returns {string}
 */
export function buildHash(path, query = {}) {
  const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([key, value]) => [key, String(value)]));
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/**
 * Returns the current hash for an old or empty one, without the leading `#`, or null when `hash` needs no
 * redirect. Old Ploeg links move to Work, Proposed, Runs, Activity and Insights, the old account and system
 * pages move under Settings, compare links go to Sessions and an empty hash opens Now.
 * @param {string} hash
 * @returns {string | null}
 */
export function redirect(hash) {
  const { path, query } = parseHash(hash);
  if (!path) return buildHash('now', query);
  if (Object.hasOwn(moved, path)) return buildHash(moved[path], query);
  const item = /^ploeg\/([1-9][0-9]{0,19})$/.exec(path);
  if (item) return buildHash(`work/${item[1]}`, query);
  const lane = /^ploeg\/lane\/([a-z_]+)$/.exec(path);
  if (lane) return buildHash('work', { ...query, lane: lane[1] });
  if (path.startsWith('ploeg/')) return buildHash('insights', query);
  if (path === 'compare' || path.startsWith('compare/')) return 'sessions';
  return null;
}
