import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { $, escape, notify, announce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { kbd, count, emptyState, timeAgo, button } from '../core/ui.js';
import { isMac, keyLabel, singleKeysEnabled } from '../core/keys.js';
import { prefs, applyAppearance } from '../core/prefs.js';
import { live } from '../core/live.js';
import { workItemStates, workItemState, sessionStatus } from '../core/states.js';
import { render, boot } from '../core/navigation.js';
import { onCountsChange } from '../core/counts.js';
import { parseHash, redirect } from '../core/route.js';
import { attention, installAttention } from '../core/attention.js';
import { chrome, showsSessions, closeTransientChrome } from '../shell.js';

/** The localStorage key of the recently opened Work Items and sessions, newest first, stored per user. */
export const recentKey = 'vloer.recent';

const recentLimit = 8;
const workItemId = /^[1-9][0-9]{0,19}$/;
const sessionId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const internalRef = /^run-[0-9]+(?:-[0-9]+)?$/i;
const word = /[\p{L}\p{N}]/u;
const combining = /[\u0300-\u036f]/g;
const nowFresh = 60000;
const shortQuery = 2;

const groupLabels = { recent: 'Recent', items: 'Work Items', go: 'Go to', commands: 'Commands', sessions: 'Sessions', next: 'Next step' };
const emptyGroups = ['recent', 'commands', 'go'];
const commandGroups = ['go', 'commands'];
const limits = { recent: 5, items: 8, go: 6, commands: 7, sessions: 5 };
const listNames = { waiting: 'Waiting Work Items', running: 'Running Runs', recent: 'Finished Runs' };

function fold(text) {
  const source = String(text ?? '');
  let folded = '';
  const map = [];
  for (let index = 0; index < source.length; index++) {
    const part = source[index].normalize('NFD').replace(combining, '').toLowerCase();
    for (let offset = 0; offset < part.length; offset++) { folded += part[offset]; map.push(index); }
  }
  map.push(source.length);
  return { folded, map };
}

const boundary = (text, at) => at === 0 || !word.test(text[at - 1]);

function subsequence(token, text, prefer) {
  const positions = [];
  for (const char of token) {
    const last = positions.length ? positions[positions.length - 1] : -1;
    let found = -1;
    for (let at = last + 1; at < text.length; at++) {
      if (text[at] !== char) continue;
      if (found === -1) found = at;
      if (!prefer || at === last + 1 || boundary(text, at)) { found = at; break; }
    }
    if (found === -1) return null;
    positions.push(found);
  }
  const chunks = [];
  for (const at of positions) {
    const chunk = chunks[chunks.length - 1];
    if (chunk && at === chunk[1]) chunk[1] = at + 1;
    else chunks.push([at, at + 1]);
  }
  return { chunks, span: positions[positions.length - 1] - positions[0] };
}

function readable({ chunks }, text) {
  if (chunks.every(([start]) => boundary(text, start))) return true;
  return chunks.length === 2 && boundary(text, chunks[0][0]) && chunks[0][1] - chunks[0][0] >= 3;
}

function matchToken(token, text, starts = false) {
  const anchored = starts || token.length === 1;
  let best = null;
  for (let at = text.indexOf(token); at !== -1; at = text.indexOf(token, at + 1)) {
    if (anchored && !boundary(text, at)) continue;
    const score = 60 + (at === 0 ? 30 : boundary(text, at) ? 20 : 0) + (token.length === text.length ? 20 : 0) - Math.min(at, 40) * 0.25;
    if (!best || score > best.score) best = { score, ranges: [[at, at + token.length]] };
  }
  if (best || anchored || /^[0-9]+$/.test(token)) return best;
  const hit = [subsequence(token, text, true), subsequence(token, text, false)].find(candidate => candidate && readable(candidate, text));
  if (!hit) return null;
  return { score: Math.max(1, Math.min(45, 36 - hit.chunks.length * 2 - hit.span * 0.2)), ranges: hit.chunks };
}

function merge(ranges) {
  const sorted = ranges.filter(([start, end]) => Number.isInteger(start) && Number.isInteger(end) && end > start).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * Scores `entry` against `query`. Every word of the query must match one of the entry's fields: its `label`,
 * `meta` (unless the entry is `quiet`), `parent` or hidden `keywords`, in falling weight. A word matches the
 * parent and keywords only at the start of one of their words, and a one-letter word only at the start of a
 * word of the label or parent. Longer words match the label and meta as a substring (best at the start of a
 * word) or, weaker and never for digits, as a subsequence whose pieces start words (`nh` for "needs human") or
 * that continues a prefix of three letters (`prefs`). Case and accents are ignored. Returns null without a
 * match, otherwise `base` (the match alone), `score` (`base` plus `entry.boost`) and the character ranges to
 * highlight in the label, meta and parent.
 * @returns {{ score: number, base: number, label: number[][], meta: number[][], parent: number[][] } | null}
 */
export function matchEntry(query, entry) {
  const tokens = fold(query).folded.split(/\s+/).filter(Boolean);
  const boost = Number(entry.boost) || 0;
  if (!tokens.length) return { score: boost, base: 0, label: [], meta: [], parent: [] };
  const fields = [['label', entry.label, 1, false], ['meta', entry.quiet ? '' : entry.meta, 0.8, false], ['parent', entry.parent, 0.7, true], ['keywords', entry.keywords, 0.6, true]].map(([name, text, weight, starts]) => ({ name, weight, starts, ...fold(text) }));
  const ranges = { label: [], meta: [], parent: [], keywords: [] };
  let total = 0;
  for (const token of tokens) {
    let best = null;
    for (const field of fields) {
      if (!field.folded || (token.length === 1 && !['label', 'parent'].includes(field.name))) continue;
      const hit = matchToken(token, field.folded, field.starts);
      if (hit && (!best || hit.score * field.weight > best.score)) best = { score: hit.score * field.weight, field, ranges: hit.ranges };
    }
    if (!best) return null;
    total += best.score;
    ranges[best.field.name].push(...best.ranges.map(([start, end]) => [best.field.map[start], best.field.map[end - 1] + 1]));
  }
  const base = total / tokens.length + (fields[0].folded === tokens.join(' ') ? 25 : 0);
  return { score: base + boost, base, label: merge(ranges.label), meta: merge(ranges.meta), parent: merge(ranges.parent) };
}

/** Scores one text against `query` like {@link matchEntry} does for a label: `{ score, ranges }`, or null without a match. */
export function fuzzyMatch(query, text) {
  const match = matchEntry(query, { label: text });
  return match && { score: match.score, ranges: match.label };
}

/** Escapes `text` and wraps each range (start inclusive, end exclusive, in UTF-16 units) in `<mark class="palette-mark">`. */
export function highlight(text, ranges = []) {
  const source = String(text ?? '');
  let markup = '';
  let at = 0;
  for (const [start, end] of merge(ranges)) {
    if (start < at || end > source.length) continue;
    markup += `${escape(source.slice(at, start))}<mark class="palette-mark">${escape(source.slice(start, end))}</mark>`;
    at = end;
  }
  return markup + escape(source.slice(at));
}

const text = value => typeof value === 'string' ? value.trim() : '';
const list = value => Array.isArray(value) ? value : [];

/**
 * Every Work Item the tab has already loaded, one entry per id: the open detail, the Work lanes, the proposed
 * list, Now's groups (in `source.now.data`, then any older Now responses in `more`), the Runs list and the
 * Activity feed. The first source that names a field wins it. A Run that is running puts its Work Item in the
 * `leased` state. Ids that are not Work Item ids are dropped.
 * @returns {{ id: string, title: string, team: string, state: string, externalId: string, provider: string, source: string }[]}
 */
export function workItemIndex(source = {}, more = []) {
  const found = new Map();
  const add = (id, fields = {}) => {
    const key = String(id ?? '');
    if (!workItemId.test(key)) return;
    const known = found.get(key) || { id: key, title: '', team: '', state: '', externalId: '', provider: '', source: '' };
    const origin = String(fields.sourceWorkItemId ?? '');
    found.set(key, {
      id: key,
      title: known.title || text(fields.title),
      team: known.team || text(fields.team),
      state: known.state || (Object.hasOwn(workItemStates, fields.state) ? fields.state : ''),
      externalId: known.externalId || text(fields.externalId),
      provider: known.provider || text(fields.provider),
      source: known.source || (workItemId.test(origin) && origin !== key ? origin : ''),
    });
  };
  const nows = [source.now?.data, ...more].filter(Boolean);
  const detail = source.ploegDetail?.item;
  if (detail) add(detail.id, detail);
  for (const lane of Object.values(source.ploeg?.lanes || {})) for (const item of list(lane?.items)) add(item?.id, item);
  for (const item of list(source.ploegProposed?.items)) add(item?.id, item);
  for (const now of nows) for (const item of list(now.waiting)) add(item?.id, item);
  const fromRun = (run, running) => add(run?.workItemId, { title: run?.workItemTitle, team: run?.team, externalId: run?.externalRef, state: running ? 'leased' : '' });
  for (const now of nows) for (const run of list(now.running)) fromRun(run, true);
  for (const now of nows) for (const run of list(now.recent)) fromRun(run, false);
  for (const run of list(source.ploegRuns?.runs)) fromRun(run, run?.state === 'running');
  for (const event of list(source.ploegFeed?.events)) add(event?.workItemId, { title: event?.workItemTitle, team: event?.team });
  return [...found.values()];
}

/**
 * The short facts that identify a Work Item under its title, most important first: its number, its tracker
 * reference (never a Ploeg-internal one such as `run-53-1`), the Work Item a proposal came from, and its Team.
 * When space runs out the palette drops them from the end, whole.
 */
export function workItemFacts(item, id = item?.id) {
  const facts = [`#${id}`];
  const reference = text(item?.externalId);
  if (reference && item.provider !== 'ploeg' && !internalRef.test(reference)) facts.push(reference);
  if (item?.state === 'proposed' && item.source) facts.push(`by a Run on #${item.source}`);
  if (text(item?.team)) facts.push(text(item.team));
  return facts;
}

/** The Work Item (`work/<id>`) or session (`session/<id>`) a hash opens, or null for any other page. */
export function recentFromHash(hash) {
  const { path } = parseHash(hash);
  const item = /^work\/([1-9][0-9]{0,19})$/.exec(path);
  if (item) return { kind: 'work', id: item[1] };
  const session = /^session\/(.+)$/.exec(path);
  return session && sessionId.test(session[1]) ? { kind: 'session', id: session[1] } : null;
}

const validRecent = entry => entry && (entry.kind === 'work' ? workItemId.test(entry.id) : entry.kind === 'session' && sessionId.test(entry.id)) && typeof entry.title === 'string' && entry.title.length <= 300 && !Number.isNaN(Date.parse(entry.at));

/**
 * Reads the stored recent list of `user`. A list stored for someone else, a list without an owner and anything
 * malformed read as empty.
 */
export function parseRecent(raw, user) {
  if (!user) return [];
  try {
    const stored = JSON.parse(raw || 'null');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored) || stored.user !== user || !Array.isArray(stored.entries)) return [];
    return stored.entries.filter(validRecent).slice(0, recentLimit);
  } catch { return []; }
}

/** The stored form of `user`'s recent list; writing it replaces the list of whoever used this browser before. */
export function serializeRecent(user, entries) { return JSON.stringify({ user, entries }); }

/**
 * Moves `entry` (`{ kind, id, title? }`) to the front of the recent `list`, keeping its known title, and keeps at
 * most eight entries.
 */
export function rememberRecent(list, entry, at = new Date().toISOString()) {
  if (!entry) return list;
  const same = item => item.kind === entry.kind && item.id === entry.id;
  const before = list.find(same);
  return [{ kind: entry.kind, id: entry.id, title: text(entry.title) || before?.title || '', at }, ...list.filter(item => !same(item))].slice(0, recentLimit);
}

/**
 * Tracks who is signed in, so data one person loaded never reaches the next person's search in the same tab.
 * `observe(source)` takes the app state: it returns true when the signed-in user changed (the caller then drops
 * what it keeps per user), and it marks every cached list present when someone signs out, or when a different
 * user appears without a sign-out in between, as stale. `leave(source)` marks them at once, for a sign-out.
 * `trusted(value)` returns a cached list only when it is not stale.
 */
export function createScope() {
  let user = null;
  let away = true;
  const stale = new WeakSet();
  const mark = source => {
    for (const value of [source?.now?.data, source?.ploegDetail, source?.ploeg, source?.ploegProposed, source?.ploegRuns, source?.ploegFeed, source?.sessions]) {
      if (value && typeof value === 'object') stale.add(value);
    }
  };
  return {
    observe(source) {
      const id = String(source?.bootstrap?.user?.id ?? '') || null;
      if (!id) { mark(source); away = true; return false; }
      if (id === user && !away) return false;
      if (user !== null && id !== user && !away) mark(source);
      user = id;
      away = false;
      return true;
    },
    leave(source) { mark(source); away = true; },
    trusted(value) { return value && typeof value === 'object' && !stale.has(value) ? value : null; },
    get user() { return away ? null : user; },
  };
}

function missingLists(data) {
  const names = Object.entries(data?.errors || {}).filter(([, failed]) => failed).map(([group]) => listNames[group] || 'Some lists');
  if (!names.length) return '';
  const unique = [...new Set(names)];
  return unique.length === 1 ? unique[0] : `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`;
}

/**
 * Picks the newest Now response for the Work Item search: the Now page's (`page`, first seen at `pageAt`) or the
 * palette's own read (`cache`: `{ data, error, at }`). Returns it as `newest` with the other as `older`, the
 * failure of the palette's own read only while that read is the newest (the message, or true), and `missing`:
 * the lists the newest response could not read, named for people ("Running Runs").
 * @returns {{ newest: object|null, older: object|null, error: string|boolean, missing: string }}
 */
export function newestNow({ page = null, pageAt = 0, cache = null } = {}) {
  const own = cache && (cache.data || cache.error) && cache.at > pageAt ? cache : null;
  const newest = own ? own.data || null : page;
  const older = own ? page : cache?.data || null;
  const error = own?.error ? own.error.message || true : false;
  return { newest, older, error, missing: missingLists(newest) };
}

const pages = [
  { id: 'now', label: 'Now', icon: 'inbox', keys: ['g', 'n'], keywords: 'home inbox waiting today start', count: 'waiting', tone: 'attention', describe: n => `${n} waiting on you` },
  { id: 'work', label: 'Work', icon: 'work', keys: ['g', 'w'], keywords: 'work items lanes team list board' },
  { id: 'proposed', label: 'Proposed', icon: 'proposed', keys: ['g', 'p'], keywords: 'approve reject proposals suggested', count: 'proposed', describe: n => `${n} proposed` },
  { id: 'runs', label: 'Runs', icon: 'runs', keys: ['g', 'r'], keywords: 'history agents executions attempts' },
  { id: 'activity', label: 'Activity', icon: 'activity', keys: ['g', 'a'], keywords: 'audit events feed log history' },
  { id: 'insights', label: 'Insights', icon: 'insights', keys: ['g', 'i'], keywords: 'spend cost budget money throughput overview' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks', keys: ['g', 't'], keywords: 'tracker import vikunja clickup issues tickets' },
  { id: 'sessions', label: 'Sessions', icon: 'sessions', keys: ['g', 's'], keywords: 'workbench crews interactive', count: 'sessions', tone: 'attention', describe: n => `${n} need you`, sessions: true },
];
const lanes = [
  { hash: 'work?lane=needs_human', label: 'Needs you', icon: 'alert', keywords: 'blocked stuck attention escalated human', count: 'needsYou', tone: 'attention', describe: n => `${n} need you` },
  { hash: 'work?lane=awaiting_review', label: 'Ready for review', icon: 'pull-request', keywords: 'pr pull request review awaiting merge', count: 'review', tone: 'review', describe: n => `${n} ready for review` },
  { hash: 'work?lane=leased', label: 'Running', icon: 'activity', keywords: 'leased working in progress busy', count: 'running', tone: 'live', describe: n => `${n} running` },
  { hash: 'work?lane=queued', label: 'Queued', icon: 'circle', keywords: 'waiting backlog next' },
  { hash: 'work?lane=all', label: 'All Work Items', icon: 'list', keywords: 'everything every lane' },
];
const settings = [
  { hash: 'settings/accounts', label: 'Linked accounts', icon: 'link', keywords: 'github gitlab clickup vikunja token credentials connect' },
  { hash: 'settings/environment', label: 'Environment', icon: 'globe', keywords: 'health system configuration checks gateway status' },
  { hash: 'design', label: 'Style guide', icon: 'grid', keywords: 'design system components tokens colours' },
];

function counted(spec, counts) {
  const value = spec.count ? counts?.[spec.count] : null;
  return typeof value === 'number' && value > 0 ? { value, tone: spec.tone, label: spec.describe(value) } : null;
}

function notificationCommand(status) {
  if (status === 'on') return { label: 'Turn off desktop notifications', meta: 'You are told when something new waits on you' };
  if (status === 'off') return { label: 'Turn on desktop notifications', meta: 'While a De Vloer tab is open, when something new waits on you' };
  const why = { unsupported: 'This browser cannot show them here', insecure: 'They need a secure (HTTPS) connection', denied: 'Blocked for this site. Allow notifications in the browser’s site settings.' }[status];
  return { label: 'Desktop notifications', meta: why, disabled: true };
}

const originFact = /^by a Run on #/;

function workItemEntry(item, fields) {
  const standing = item?.state ? workItemState(item.state) : null;
  const facts = workItemFacts(item);
  return { itemId: item.id, label: item.title || `Work Item #${item.id}`, facts, meta: facts.filter(fact => !originFact.test(fact)).join(' · '), standing, icon: standing?.glyph || 'work', tone: standing?.tone, hash: `work/${item.id}`, run: 'go', ...fields };
}

/**
 * Every palette entry for `context`: the recent Work Items and sessions, destinations (pages, Work lanes and
 * settings), commands, the loaded Work Items and the sessions. Each entry has an `id`, a `group`, a `label` and
 * what it does: a `hash` to open, a `run` command, or a shared chrome `action` (shortcuts, new session, sign
 * out). Work Items and sessions carry their state as `standing` and their identifying `facts`; `primary`
 * entries make up the palette before anything is typed.
 */
export function paletteEntries(context) {
  const { counts = {}, items = [], sessions = [], recent = [] } = context;
  const entries = [];
  const recentIds = new Set(recent.map(entry => `${entry.kind}:${entry.id}`));
  const byId = new Map(items.map(item => [item.id, item]));
  const sessionById = new Map(sessions.map(session => [String(session.id), session]));
  for (const entry of recent) {
    if (context.current && context.current.kind === entry.kind && context.current.id === entry.id) continue;
    if (entry.kind === 'work') {
      const item = byId.get(entry.id);
      if (item) { entries.push(workItemEntry({ ...item, title: item.title || entry.title }, { id: `recent-work-${entry.id}`, group: 'recent', primary: true, time: entry.at })); continue; }
      entries.push({ id: `recent-work-${entry.id}`, group: 'recent', primary: true, label: entry.title || `Work Item #${entry.id}`, facts: entry.title ? [`#${entry.id}`] : [], meta: entry.title ? `#${entry.id}` : '', icon: 'work', time: entry.at, hash: `work/${entry.id}`, run: 'go' });
    } else if (context.sessionsShown) {
      const session = sessionById.get(entry.id);
      if (!session && !entry.title) continue;
      entries.push({ id: `recent-session-${entry.id}`, group: 'recent', primary: true, label: text(session?.title) || entry.title, facts: ['Session'], meta: 'Session', standing: session ? sessionStatus(session) : null, icon: session ? sessionStatus(session).glyph : 'sessions', tone: session ? sessionStatus(session).tone : undefined, time: entry.at, hash: `session/${entry.id}`, run: 'go' });
    }
  }
  for (const page of pages) {
    if (page.sessions && !context.sessionsShown) continue;
    entries.push({ id: `go-${page.id}`, group: 'go', primary: true, label: page.label, keywords: page.keywords, icon: page.icon, keys: page.keys, single: true, count: counted(page, counts), hash: page.id, run: 'go' });
  }
  for (const lane of lanes) entries.push({ id: `go-${lane.hash}`, group: 'go', label: lane.label, parent: 'Work', keywords: lane.keywords, icon: lane.icon, tone: lane.tone, count: counted(lane, counts), hash: lane.hash, run: 'go' });
  for (const page of settings) entries.push({ id: `go-${page.hash}`, group: 'go', label: page.label, parent: 'Settings', keywords: page.keywords, icon: page.icon, hash: page.hash, run: 'go' });
  const dark = Boolean(context.dark);
  entries.push({ id: 'theme', group: 'commands', primary: true, label: dark ? 'Switch to light theme' : 'Switch to dark theme', keywords: 'theme appearance colour mode dark light', icon: dark ? 'sun' : 'moon', run: 'theme', value: dark ? 'light' : 'dark', restore: true });
  if (context.theme !== 'system') entries.push({ id: 'theme-system', group: 'commands', label: 'Follow the system theme', keywords: 'theme appearance automatic os', icon: 'monitor', run: 'theme', value: 'system', restore: true });
  entries.push({ id: 'live', group: 'commands', primary: true, label: context.paused ? 'Resume live updates' : 'Pause live updates', keywords: 'live updates refresh automatically polling', icon: context.paused ? 'play' : 'pause', run: 'live', restore: true });
  entries.push({ id: 'refresh', group: 'commands', primary: true, label: 'Refresh this page', keywords: 'reload update fetch again', icon: 'refresh', run: 'refresh', restore: true });
  if (context.canCreate) entries.push({ id: 'new-session', group: 'commands', primary: true, label: 'New session', keywords: 'create start crew objective', icon: 'plus', action: 'new', keys: context.view === 'sessions' ? ['n'] : null, single: true, restore: true });
  entries.push({ id: 'shortcuts', group: 'commands', primary: true, label: 'Show keyboard shortcuts', keywords: 'keys help hotkeys', icon: 'keyboard', action: 'shortcuts-open', keys: ['?'], single: true, restore: true });
  entries.push({ id: 'preferences', group: 'commands', primary: true, label: 'Open preferences', keywords: 'prefs settings theme density format shortcuts options', icon: 'settings', hash: 'settings/preferences', run: 'go' });
  entries.push({ id: 'notify', group: 'commands', keywords: 'notifications desktop alerts bell notify', icon: 'bell', run: 'notify', restore: true, quiet: true, ...notificationCommand(context.notifications) });
  entries.push({ id: 'density', group: 'commands', label: context.density === 'compact' ? 'Use comfortable density' : 'Use compact density', keywords: 'density rows spacing compact comfortable', icon: 'list', run: 'density', restore: true });
  entries.push({ id: 'single-keys', group: 'commands', label: context.singleKeys ? 'Turn off single-key shortcuts' : 'Turn on single-key shortcuts', keywords: 'keyboard shortcuts speech accessibility keys', icon: 'keyboard', run: 'single-keys', restore: true });
  entries.push({ id: 'copy-link', group: 'commands', label: 'Copy link to this page', keywords: 'share url address clipboard', icon: 'copy', run: 'copy-link', restore: true });
  if (!context.demo) entries.push({ id: 'sign-out', group: 'commands', primary: true, label: 'Sign out', keywords: 'log out logout leave', icon: 'logout', action: 'logout' });
  for (const item of items) entries.push(workItemEntry(item, { id: `item-${item.id}`, group: 'items', boost: recentIds.has(`work:${item.id}`) ? 6 : 0 }));
  if (context.sessionsShown) {
    for (const session of sessions) {
      if (!sessionId.test(String(session?.id ?? ''))) continue;
      const status = sessionStatus(session);
      entries.push({ id: `session-${session.id}`, group: 'sessions', label: text(session.title) || 'Untitled session', keywords: 'session', standing: status, icon: status.glyph, tone: status.tone, hash: `session/${session.id}`, run: 'go', boost: recentIds.has(`session:${session.id}`) ? 6 : 0 });
    }
  }
  return entries;
}

const noMatch = { score: 0, base: 0, label: [], meta: [], parent: [] };
const retryEntry = { id: 'retry-work-items', run: 'retry' };
const nextStep = { id: 'next-work', group: 'next', label: 'Open Work', meta: 'Every lane of every Team', quiet: true, icon: 'work', hash: 'work', run: 'go', enter: true };

function numberQuery(typed) { return /^#?([1-9][0-9]{0,19})$/.exec(typed.replace(/\s+/g, '')); }

/**
 * Filters and orders `entries` for `query`. Without a query: the primary entries under Recent, Commands and Go
 * to. With one: every match, best first within each group (a recent item's boost counts there), a few per group,
 * groups ordered by their best match without that boost; for one or two letters Go to and Commands come first. A
 * Work Item number (`105` or `#105`) always offers that Work Item first, by title when it is loaded. Without
 * any match there is one `next` group that offers the Work page. `status` holds the state of the Work Item
 * search: `loading` shows a loading Work Items group when the query matched no page or command, and `offline` (no
 * Ploeg for this account) drops the number jump and the Work page.
 * @returns {{ id: string, label: string, note?: string, loading?: boolean, results: { entry: object, match: object }[] }[]}
 */
export function searchPalette(query, entries, status = {}) {
  const typed = String(query ?? '').trim();
  if (!typed) {
    return emptyGroups.map(id => ({ id, label: groupLabels[id], results: entries.filter(entry => entry.group === id && entry.primary).slice(0, limits[id]).map(entry => ({ entry, match: noMatch })) })).filter(group => group.results.length);
  }
  const scored = [];
  entries.forEach((entry, order) => {
    if (entry.group === 'recent') return;
    const match = matchEntry(typed, entry);
    if (match) scored.push({ entry, match, order });
  });
  const jump = status.offline ? null : numberQuery(typed);
  if (jump) {
    const known = scored.find(result => result.entry.itemId === jump[1]);
    if (known) known.match = { ...known.match, score: Infinity, base: Infinity };
    else scored.push({ entry: { id: `jump-${jump[1]}`, group: 'items', label: `Open Work Item #${jump[1]}`, meta: 'Go straight to its page', quiet: true, icon: 'hash', hash: `work/${jump[1]}`, run: 'go' }, match: { ...noMatch, score: Infinity, base: Infinity }, order: -1 });
  }
  const groups = new Map();
  for (const result of scored) {
    if (!groups.has(result.entry.group)) groups.set(result.entry.group, []);
    groups.get(result.entry.group).push(result);
  }
  const wantsItems = Boolean(jump) || ![...groups.keys()].some(id => commandGroups.includes(id));
  if (status.loading && wantsItems && !groups.has('items')) groups.set('items', []);
  const short = !jump && typed.replace(/\s+/g, '').length <= shortQuery;
  const rank = id => (jump && id === 'items' ? 2 : short && commandGroups.includes(id) ? 1 : 0);
  const ordered = [...groups.entries()].map(([id, results]) => {
    results.sort((a, b) => Number(Boolean(a.entry.disabled)) - Number(Boolean(b.entry.disabled)) || b.match.score - a.match.score || a.order - b.order);
    const best = Math.max(0, ...results.filter(result => !result.entry.disabled).map(result => result.match.base));
    const group = { id, label: groupLabels[id], best, results: results.slice(0, limits[id]).map(({ entry, match }) => ({ entry, match })) };
    if (id === 'items' && status.loading) { group.loading = true; group.note = 'Loading…'; }
    return group;
  }).sort((a, b) => rank(b.id) - rank(a.id) || b.best - a.best);
  if (!ordered.length) return status.offline ? [] : [{ id: 'next', label: groupLabels.next, results: [{ entry: nextStep, match: noMatch }] }];
  return ordered.map(({ best, ...group }) => group);
}

/**
 * What the palette says about the Work Item search above its results, or null: that the Work Items could not be
 * loaded (with a retry), or which lists are missing from them. It speaks only while the query may be after a
 * Work Item: a number, a query that matched Work Items, or one that matched no page or command.
 * @returns {{ tone: string, text: string, retry: boolean } | null}
 */
export function searchNotice(query, groups, status = {}) {
  const typed = String(query ?? '').trim();
  if (!typed || status.offline || status.loading) return null;
  const others = groups.some(group => commandGroups.includes(group.id) && group.results.length);
  const items = groups.some(group => group.id === 'items' && group.results.some(result => result.entry.itemId));
  const wanted = Boolean(numberQuery(typed)) || !others;
  if (status.error && wanted) return { tone: 'danger', text: ['Work Items could not be loaded.', typeof status.error === 'string' ? status.error : ''].filter(Boolean).join(' '), retry: true };
  if (status.partial && (wanted || items)) return { tone: 'attention', text: `${status.partial} could not be read · results may be incomplete`, retry: true };
  return null;
}

function trailMarkup(entry, { singleKeys = true, mac = false } = {}) {
  const parts = [];
  if (entry.count) parts.push(count(entry.count.value, { tone: entry.count.tone, label: entry.count.label }));
  if (entry.time) parts.push(`<span class="palette-option-time">${timeAgo(entry.time)}</span>`);
  if (entry.keys?.length && (!entry.single || singleKeys)) parts.push(`<span class="palette-option-keys" aria-hidden="true">${kbd(entry.keys.map(key => keyLabel(key, mac)))}</span>`);
  if (entry.enter) parts.push(`<span class="palette-option-keys" aria-hidden="true">${kbd('↵')}</span>`);
  return parts.length ? `<span class="palette-option-trail">${parts.join('')}</span>` : '';
}

function factsMarkup(facts, ranges) {
  let offset = 0;
  return facts.map(fact => {
    if (originFact.test(fact)) return `<span class="palette-fact">${escape(fact)}</span>`;
    const start = offset;
    offset += fact.length + 3;
    const local = ranges.filter(([from, to]) => from < start + fact.length && to > start).map(([from, to]) => [Math.max(from, start) - start, Math.min(to, start + fact.length) - start]);
    return `<span class="palette-fact">${highlight(fact, local)}</span>`;
  }).join('');
}

function optionMarkup({ entry, match }, index, active, options) {
  const disabled = Boolean(entry.disabled);
  const behaviour = disabled ? '' : entry.action ? ` data-action="${escape(entry.action)}"` : ' data-action="palette-run"';
  const value = entry.value ? ` data-value="${escape(entry.value)}"` : '';
  const parent = entry.parent ? `<span class="palette-option-parent">${highlight(entry.parent, match.parent)}${icon('chevron', 'palette-option-separator')}</span>` : '';
  const standing = entry.standing ? `<span class="palette-option-state" data-tone="${escape(entry.standing.tone)}">${escape(entry.standing.label)}</span>` : '';
  const facts = entry.facts?.length ? `<span class="palette-option-facts">${factsMarkup(entry.facts, match.meta)}</span>` : entry.meta ? `<span class="palette-option-detail">${highlight(entry.meta, match.meta)}</span>` : '';
  return `<div class="palette-option" role="option" id="palette-option-${index}" data-entry="${escape(entry.id)}" aria-selected="${index === active}"${disabled ? ' aria-disabled="true"' : ''}${behaviour}${value}><span class="palette-option-icon"${entry.tone ? ` data-tone="${escape(entry.tone)}"` : ''}>${icon(entry.icon || 'circle')}</span><span class="palette-option-main"><span class="palette-option-title">${parent}<span class="palette-option-label">${highlight(entry.label, match.label)}</span></span>${standing}${facts}</span>${trailMarkup(entry, options)}</div>`;
}

/**
 * The listbox content for `groups` from {@link searchPalette}: one `role="group"` per group with its visual
 * label, one `role="option"` per result with the id `palette-option-<n>` in reading order, `aria-selected="true"`
 * on the `active` one, the matched characters marked, a Work Item's state as tinted text before its facts, and
 * each row's shortcut. A loading group shows placeholder rows.
 */
export function resultsMarkup(groups, active = 0, { singleKeys = true, mac = false } = {}) {
  let index = 0;
  return groups.map(group => {
    const note = group.note ? `<span class="palette-group-note">${escape(group.note)}</span>` : '';
    const loading = group.loading && !group.results.length ? '<div class="palette-loading" aria-hidden="true"><span class="skeleton circle"></span><span class="skeleton text"></span></div><div class="palette-loading" aria-hidden="true"><span class="skeleton circle"></span><span class="skeleton text"></span></div>' : '';
    const rows = group.results.map(result => optionMarkup(result, index++, active, { singleKeys, mac })).join('');
    return `<div class="palette-group" role="group" aria-label="${escape(group.label)}"${group.loading ? ' aria-busy="true"' : ''}><div class="palette-group-label" aria-hidden="true"><span>${escape(group.label)}</span>${note}</div>${loading}${rows}</div>`;
  }).join('');
}

/** The note shown outside the listbox when a query matched nothing: what was searched and what search covers. */
export function emptyMarkup(query, { offline = false } = {}) {
  return emptyState({ icon: 'search', compact: true, title: `No matches for “${String(query ?? '').trim()}”`, body: `<p>${offline ? 'Search covers pages and commands.' : 'Search covers pages, commands and the Work Items this tab has loaded.'}</p>` });
}

/** The notice from {@link searchNotice} as markup: a tinted icon, the sentence and, when it can help, a Retry button. */
export function noticeMarkup(notice) {
  if (!notice) return '';
  return `<span class="palette-notice-icon" aria-hidden="true">${icon('alert')}</span><span class="palette-notice-text">${escape(notice.text)}</span>${notice.retry ? button({ label: 'Retry', icon: 'refresh', variant: 'ghost', size: 'xs', action: 'palette-run', data: { entry: retryEntry.id } }) : ''}`;
}

const palette = { opener: null, again: null, query: '', active: 0, groups: [], results: [], statusTimer: null, wired: false };
const nowCache = { data: null, error: null, loading: false, at: 0, generation: 0 };
const scope = createScope();
const firstSeen = new WeakMap();
let pendingRoute = null;

const signedIn = () => (state.bootstrap ? scope.user : null);
const offline = () => ['unconfigured', 'no-access'].includes(state.ploegStatus);

function resetNowCache() { Object.assign(nowCache, { data: null, error: null, loading: false, at: 0, generation: nowCache.generation + 1 }); }

function seenAt(data) {
  if (!data) return 0;
  if (!firstSeen.has(data)) firstSeen.set(data, Date.now());
  return firstSeen.get(data);
}

function observe() {
  if (scope.observe(state)) {
    resetNowCache();
    const pending = pendingRoute;
    pendingRoute = null;
    if (pending) rememberRoute(pending);
  }
  seenAt(scope.trusted(state.now?.data));
}

function readRecent() {
  const user = signedIn();
  if (!user) return [];
  try {
    const raw = globalThis.localStorage?.getItem(recentKey);
    const entries = parseRecent(raw, user);
    if (raw && !entries.length) globalThis.localStorage.removeItem(recentKey);
    return entries;
  } catch { return []; }
}
function writeRecent(entries) { const user = signedIn(); if (!user) return; try { globalThis.localStorage?.setItem(recentKey, serializeRecent(user, entries)); } catch {} }

function rememberRoute(hash = globalThis.location?.hash) {
  if (!signedIn()) { pendingRoute = hash; return; }
  const entry = recentFromHash(hash);
  if (entry) writeRecent(rememberRecent(readRecent(), entry));
}

function resolvedRecent(items, sessions) {
  const entries = readRecent();
  const titles = new Map(items.filter(item => item.title).map(item => [`work:${item.id}`, item.title]));
  for (const session of sessions) if (text(session?.title)) titles.set(`session:${session.id}`, text(session.title));
  let changed = false;
  const resolved = entries.map(entry => {
    const title = titles.get(`${entry.kind}:${entry.id}`);
    if (!title || title === entry.title) return entry;
    changed = true;
    return { ...entry, title };
  });
  if (changed) writeRecent(resolved);
  return resolved;
}

const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);

function paletteContext() {
  observe();
  const user = signedIn();
  const trusted = value => (user ? scope.trusted(value) : null);
  const page = trusted(state.now?.data);
  const { newest, older, error, missing } = newestNow({ page, pageAt: seenAt(page), cache: nowCache });
  const items = workItemIndex({ now: { data: newest }, ploegDetail: trusted(state.ploegDetail), ploeg: trusted(state.ploeg), ploegProposed: trusted(state.ploegProposed), ploegRuns: trusted(state.ploegRuns), ploegFeed: trusted(state.ploegFeed) }, [older].filter(Boolean));
  const sessions = list(trusted(state.sessions));
  const sessionsShown = Boolean(user) && showsSessions();
  const theme = prefs.get('theme');
  return {
    counts: state.counts,
    items,
    sessions,
    recent: resolvedRecent(items, sessions),
    current: recentFromHash(location.hash),
    sessionsShown,
    canCreate: sessionsShown && state.bootstrap?.user?.role !== 'viewer',
    demo: state.bootstrap?.mode === 'demo',
    view: state.view,
    theme,
    dark: theme === 'dark' || (theme === 'system' && prefersDark()),
    density: prefs.get('density'),
    paused: live.paused,
    singleKeys: singleKeysEnabled(),
    mac: isMac(),
    notifications: attention.status(),
    status: { loading: nowCache.loading && !newest, error: nowCache.loading ? false : error, partial: missing, offline: offline() },
  };
}

function frameMarkup() {
  const hints = [[['↑', '↓'], 'Move'], [['↵'], 'Open']].map(([keys, label]) => `<span class="palette-hint">${kbd(keys)}<span>${label}</span></span>`).join('');
  const tip = offline() ? '' : '<span class="palette-footer-tip">Type a number to open that Work Item</span>';
  return `<div class="palette-frame"><h2 id="palette-title" class="sr-only">Search and commands</h2><div class="palette-search">${icon('search', 'palette-search-icon')}<input id="palette-input" class="palette-input" type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" aria-describedby="palette-help" aria-label="Search pages, commands and Work Items" placeholder="Search or jump to…" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"><button class="palette-dismiss" type="button" data-action="palette-close" aria-label="Cancel search" aria-keyshortcuts="Escape"><span class="palette-dismiss-key" aria-hidden="true">${kbd('Esc')}</span><span class="palette-dismiss-text" aria-hidden="true">Cancel</span></button></div><div class="palette-notice" id="palette-notice" hidden></div><div class="palette-empty" id="palette-empty" hidden></div><div class="palette-results" id="palette-list" role="listbox" aria-label="Results" tabindex="-1"></div><div class="palette-footer" aria-hidden="true"><span class="palette-hints">${hints}</span>${tip}</div><p class="sr-only" id="palette-help">Type a page, command or Work Item title or number. Arrow keys choose a result, Enter opens it, Escape closes the search.</p><p class="sr-only" id="palette-status" role="status" aria-live="polite"></p></div>`;
}

function announceResults(notice) {
  clearTimeout(palette.statusTimer);
  palette.statusTimer = setTimeout(() => {
    const status = $('#palette-status');
    if (!status) return;
    const loading = palette.groups.some(group => group.loading);
    const total = palette.results.filter(result => result.entry.group !== 'next').length;
    const summary = loading && !total ? 'Loading Work Items…' : total ? `${total} ${total === 1 ? 'result' : 'results'}` : palette.results.length ? 'No matches. Enter opens Work.' : 'No matches';
    status.textContent = notice ? `${summary}. ${notice.text}` : summary;
  }, 350);
}

function firstEnabled(from = 0, step = 1) {
  const total = palette.results.length;
  for (let offset = 0; offset < total; offset++) {
    const index = ((from + offset * step) % total + total) % total;
    if (!palette.results[index].entry.disabled) return index;
  }
  return 0;
}

function updateOverflow(list = $('#palette-list')) {
  if (!list) return;
  const start = list.scrollTop > 1;
  const end = list.scrollTop + list.clientHeight < list.scrollHeight - 1;
  const value = [start && 'start', end && 'end'].filter(Boolean).join(' ');
  if (value) list.dataset.overflow = value;
  else delete list.dataset.overflow;
}

function refreshResults({ keep = false } = {}) {
  const list = $('#palette-list');
  const input = $('#palette-input');
  if (!list || !input) return;
  const context = paletteContext();
  const typed = palette.query.trim();
  const status = typed ? context.status : {};
  const kept = keep ? palette.results[palette.active]?.entry.id : null;
  palette.groups = searchPalette(palette.query, paletteEntries(context), status);
  palette.results = palette.groups.flatMap(group => group.results);
  const again = kept ? palette.results.findIndex(result => result.entry.id === kept) : -1;
  palette.active = again >= 0 ? again : firstEnabled();
  const matched = palette.groups.some(group => group.id !== 'next');
  const shown = palette.groups.length > 0;
  list.innerHTML = resultsMarkup(palette.groups, palette.active, { singleKeys: context.singleKeys, mac: context.mac });
  list.hidden = !shown;
  input.setAttribute('aria-expanded', String(shown));
  if (palette.results.length) input.setAttribute('aria-activedescendant', `palette-option-${palette.active}`);
  else input.removeAttribute('aria-activedescendant');
  const empty = $('#palette-empty');
  if (empty) { empty.hidden = matched; empty.innerHTML = matched ? '' : emptyMarkup(typed, { offline: context.status.offline }); }
  const notice = searchNotice(palette.query, palette.groups, status);
  const band = $('#palette-notice');
  if (band) {
    const focused = band.contains(document.activeElement);
    band.hidden = !notice;
    band.innerHTML = noticeMarkup(notice);
    if (notice) band.dataset.tone = notice.tone;
    if (focused) input.focus();
  }
  list.closest('.palette-frame')?.toggleAttribute('data-unmatched', !matched || !palette.results.length);
  if (!keep) list.scrollTop = 0;
  updateOverflow(list);
  announceResults(notice);
}

function setActive(index, { scroll = true } = {}) {
  if (!palette.results.length) return;
  const next = Math.max(0, Math.min(palette.results.length - 1, index));
  document.getElementById(`palette-option-${palette.active}`)?.setAttribute('aria-selected', 'false');
  palette.active = next;
  const option = document.getElementById(`palette-option-${next}`);
  option?.setAttribute('aria-selected', 'true');
  $('#palette-input')?.setAttribute('aria-activedescendant', `palette-option-${next}`);
  if (scroll) option?.scrollIntoView({ block: 'nearest' });
}

function move(step) {
  if (!palette.results.length) return;
  setActive(firstEnabled(palette.active + step, step));
}

function cycleFocus(dialog, backwards) {
  const stops = [...dialog.querySelectorAll('input, button, a[href]')].filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
  if (!stops.length) return;
  const at = stops.indexOf(document.activeElement);
  stops[backwards ? (at <= 0 ? stops.length - 1 : at - 1) : (at === -1 || at === stops.length - 1 ? 0 : at + 1)].focus();
}

function onKey(event) {
  if (event.isComposing) return;
  const input = $('#palette-input');
  if (!input) return;
  if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); cycleFocus(event.currentTarget, event.shiftKey); return; }
  const typing = event.target === input;
  const control = !typing && Boolean(event.target.closest?.('button, a[href], input'));
  if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(event.key)) {
    event.preventDefault();
    if (!typing) input.focus();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') move(event.key === 'ArrowDown' ? 1 : -1);
    else setActive(palette.active + (event.key === 'PageDown' ? 5 : -5));
    return;
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
    if (control) return;
    event.preventDefault();
    if (!typing) input.focus();
    const option = document.getElementById(`palette-option-${palette.active}`);
    if (option && option.getAttribute('aria-disabled') !== 'true') option.click();
    return;
  }
  if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Backspace' || (event.key.length === 1 && !(control && event.key === ' '))) input.focus();
}

function openerSelector(element) {
  if (!element?.getAttribute) return null;
  if (element.id) return `#${CSS.escape(element.id)}`;
  return element.getAttribute('data-action') === 'palette-open' && element.closest('.app-topbar') ? '.app-topbar [data-action="palette-open"]' : null;
}

function restoreFocus(opener, again) {
  const target = (opener?.isConnected && opener) || (again && document.querySelector(again)) || document.getElementById('page-title');
  target?.focus({ preventScroll: true });
}

const focusLost = () => !document.activeElement || document.activeElement === document.body;

function entryOf(element) {
  const id = element?.dataset.entry;
  if (id === retryEntry.id) return retryEntry;
  return palette.results.find(result => result.entry.id === id)?.entry || null;
}

function onClick(event) {
  const dialog = event.currentTarget;
  if (event.target === dialog) { closePalette(true); return; }
  const option = event.target.closest('.palette-option');
  if (!option || option.getAttribute('aria-disabled') === 'true') return;
  const entry = entryOf(option);
  if (entry && !entry.keepOpen) closePalette(Boolean(entry.restore) || (Boolean(entry.hash) && location.hash === `#${entry.hash}`));
}

function wire(dialog) {
  if (palette.wired) return;
  palette.wired = true;
  dialog.addEventListener('keydown', onKey);
  dialog.addEventListener('input', event => { if (event.target.id !== 'palette-input') return; palette.query = event.target.value; refreshResults(); });
  dialog.addEventListener('click', onClick);
  dialog.addEventListener('scroll', event => { if (event.target.id === 'palette-list') updateOverflow(event.target); }, { capture: true, passive: true });
  dialog.addEventListener('mousedown', event => { if (event.target.closest('.palette-option')) event.preventDefault(); });
  dialog.addEventListener('pointermove', event => {
    const option = event.target.closest('.palette-option');
    if (!option || option.getAttribute('aria-disabled') === 'true') return;
    const index = Number(option.id.replace('palette-option-', ''));
    if (Number.isInteger(index) && index !== palette.active) setActive(index, { scroll: false });
  });
  dialog.addEventListener('close', () => {
    if (dialog.open || !palette.opener) return;
    clearTimeout(palette.statusTimer);
    const opener = palette.opener;
    palette.opener = null;
    if (focusLost()) restoreFocus(opener, palette.again);
  });
}

async function loadWorkItems(force = false) {
  observe();
  const user = signedIn();
  if (!user || nowCache.loading || offline()) return;
  const page = scope.trusted(state.now?.data);
  if (!force) {
    if (page && (state.view === 'now' || Date.now() - seenAt(page) < nowFresh)) { resetNowCache(); return; }
    if (!nowCache.error && nowCache.data && Date.now() - nowCache.at < nowFresh) return;
  }
  const generation = nowCache.generation;
  const current = () => generation === nowCache.generation && signedIn() === user;
  Object.assign(nowCache, { loading: true, error: null });
  if ($('#palette')?.open) refreshResults({ keep: true });
  try {
    const data = await api('/api/ploeg/now');
    if (current()) nowCache.data = data;
  } catch (error) {
    if (current()) {
      if (['ploeg_unconfigured', 'ploeg_scope'].includes(error.code)) nowCache.data = null;
      else nowCache.error = { message: error.message, code: error.code || '' };
    }
  } finally {
    if (current()) { nowCache.at = Date.now(); nowCache.loading = false; }
    if ($('#palette')?.open) refreshResults({ keep: true });
  }
}

function closePalette(restore = true) {
  const dialog = $('#palette');
  if (!dialog?.open) return;
  const opener = palette.opener;
  palette.opener = null;
  clearTimeout(palette.statusTimer);
  dialog.close();
  if (restore) restoreFocus(opener, palette.again);
}

function openPalette() {
  const dialog = $('#palette');
  if (!dialog || !state.bootstrap) return;
  if (dialog.open) { closePalette(true); return; }
  closeTransientChrome();
  const help = $('#shortcuts');
  if (help?.open) help.close();
  if (document.querySelector('dialog[open]')) return;
  const active = document.activeElement;
  palette.opener = active && active !== document.body ? active : null;
  palette.again = openerSelector(palette.opener);
  palette.query = '';
  palette.active = 0;
  observe();
  rememberRoute();
  wire(dialog);
  dialog.innerHTML = frameMarkup();
  refreshResults();
  dialog.showModal();
  $('#palette-input')?.focus();
  void loadWorkItems();
}

function redraw() {
  const again = palette.again;
  render();
  if (focusLost()) restoreFocus(null, again);
}

function redrawPreferences() { if (state.view === 'preferences') redraw(); }

function toggleDensity() {
  const compact = prefs.get('density') !== 'compact';
  prefs.set('density', compact ? 'compact' : 'comfortable');
  applyAppearance();
  redrawPreferences();
  announce(compact ? 'Compact density' : 'Comfortable density');
}

function toggleSingleKeys() {
  const on = !singleKeysEnabled();
  prefs.set('singleKeyShortcuts', on);
  redraw();
  announce(on ? 'Single-key shortcuts on' : 'Single-key shortcuts off');
}

function setTheme(element) {
  chrome.actions['theme-set'](element);
  redrawPreferences();
}

function toggleLive() {
  chrome.actions['live-toggle']();
  redrawPreferences();
}

async function toggleNotifications() {
  if (attention.status() === 'on') { attention.disable(); notify('Desktop notifications are off.'); redrawPreferences(); return; }
  const status = await attention.enable();
  if (status === 'on') notify('Desktop notifications are on. While a De Vloer tab is open, you hear about each new item that waits on you.');
  else if (status === 'denied') notify('This browser blocks notifications for De Vloer. Allow them in the site settings, then turn them on again.', true);
  else if (status === 'off') notify('Desktop notifications stay off: the browser did not get permission.');
  else notify('This browser cannot show desktop notifications here.', true);
  redrawPreferences();
}

async function copyLink() {
  try { await navigator.clipboard.writeText(location.href); notify('Link to this page copied.'); }
  catch { notify('Could not copy the link. Copy it from the address bar instead.', true); }
}

async function refreshPage() {
  const again = palette.again;
  resetNowCache();
  await boot();
  if (focusLost()) restoreFocus(null, again);
  announce('Page refreshed');
}

function runEntry(element) {
  const entry = entryOf(element);
  if (!entry || entry.disabled) return;
  if (entry.run === 'go') { location.hash = entry.hash; return; }
  if (entry.run === 'theme') return setTheme(element);
  if (entry.run === 'live') return toggleLive();
  if (entry.run === 'refresh') return refreshPage();
  if (entry.run === 'density') return toggleDensity();
  if (entry.run === 'single-keys') return toggleSingleKeys();
  if (entry.run === 'notify') return toggleNotifications();
  if (entry.run === 'copy-link') return copyLink();
  if (entry.run === 'retry') { $('#palette-input')?.focus(); return loadWorkItems(true); }
}

installAttention();
onCountsChange(data => {
  observe();
  const user = signedIn();
  if (user && data && typeof data === 'object' && !Array.isArray(data)) Object.assign(nowCache, { data, error: null, at: Date.now() });
});
live.subscribe(() => observe());
if (globalThis.window && globalThis.location) {
  pendingRoute = redirect(location.hash) ?? location.hash;
  window.addEventListener('hashchange', () => { observe(); rememberRoute(); });
  document.addEventListener('click', event => { if (event.target.closest?.('[data-action="logout"]')) { scope.leave(state); resetNowCache(); } }, true);
}

/**
 * The command palette (`#palette`): `palette-open` (the search button, `/` and ⌘K or Ctrl K) opens a combobox
 * over a grouped listbox of recent items, commands, destinations, Work Items and sessions with fuzzy matching;
 * `palette-run` runs a result or reads the Work Items again, and `palette-close` closes it. Loading
 * the view also connects the favicon dot and desktop notifications to the counts, and records the Work Items and
 * sessions each user opens as recent.
 */
export default {
  id: 'palette',
  actions: {
    'palette-open': () => openPalette(),
    'palette-run': element => runEntry(element),
    'palette-close': () => closePalette(true),
  },
};
