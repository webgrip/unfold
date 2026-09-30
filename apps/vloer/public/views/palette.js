import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { $, escape, notify, announce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { kbd, count, stateBadge, emptyState, timeAgo } from '../core/ui.js';
import { isMac, keyLabel, singleKeysEnabled } from '../core/keys.js';
import { prefs, applyAppearance } from '../core/prefs.js';
import { live } from '../core/live.js';
import { workItemStates, workItemState, sessionStatus } from '../core/states.js';
import { render, boot } from '../core/navigation.js';
import { onCountsChange } from '../core/counts.js';
import { parseHash, redirect } from '../core/route.js';
import { attention, installAttention } from '../core/attention.js';
import { showsSessions, closeTransientChrome } from '../shell.js';

/** The localStorage key of the recently opened Work Items and sessions, newest first. */
export const recentKey = 'vloer.recent';

const recentLimit = 8;
const workItemId = /^[1-9][0-9]{0,19}$/;
const sessionId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const word = /[\p{L}\p{N}]/u;
const combining = /[\u0300-\u036f]/g;
const nowFresh = 60000;

const groupLabels = { recent: 'Recent', items: 'Work Items', go: 'Go to', commands: 'Commands', sessions: 'Sessions' };
const emptyGroups = ['recent', 'go', 'commands'];
const limits = { recent: 5, items: 8, go: 6, commands: 6, sessions: 5 };

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
  let best = null;
  for (let at = text.indexOf(token); at !== -1; at = text.indexOf(token, at + 1)) {
    if (starts && !boundary(text, at)) continue;
    const score = 60 + (at === 0 ? 30 : boundary(text, at) ? 20 : 0) + (token.length === text.length ? 20 : 0) - Math.min(at, 40) * 0.25;
    if (!best || score > best.score) best = { score, ranges: [[at, at + token.length]] };
  }
  if (best || starts || token.length < 2 || /^[0-9]+$/.test(token)) return best;
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
 * parent and keywords only at the start of one of their words. In the label and meta it matches as a substring
 * (best at the start of a word) or, weaker and never for digits, as a subsequence whose pieces start
 * words (`nh` for "needs human") or that continues a prefix of three letters (`prefs`). Case and accents are
 * ignored. Returns null without a match, otherwise the score (plus `entry.boost`) and the character ranges to
 * highlight in the label, meta and parent.
 * @returns {{ score: number, label: number[][], meta: number[][], parent: number[][] } | null}
 */
export function matchEntry(query, entry) {
  const tokens = fold(query).folded.split(/\s+/).filter(Boolean);
  if (!tokens.length) return { score: 0, label: [], meta: [], parent: [] };
  const fields = [['label', entry.label, 1, false], ['meta', entry.quiet ? '' : entry.meta, 0.8, false], ['parent', entry.parent, 0.7, true], ['keywords', entry.keywords, 0.6, true]].map(([name, text, weight, starts]) => ({ name, weight, starts, ...fold(text) }));
  const ranges = { label: [], meta: [], parent: [], keywords: [] };
  let total = 0;
  for (const token of tokens) {
    let best = null;
    for (const field of fields) {
      if (!field.folded) continue;
      const hit = matchToken(token, field.folded, field.starts);
      if (hit && (!best || hit.score * field.weight > best.score)) best = { score: hit.score * field.weight, field, ranges: hit.ranges };
    }
    if (!best) return null;
    total += best.score;
    ranges[best.field.name].push(...best.ranges.map(([start, end]) => [best.field.map[start], best.field.map[end - 1] + 1]));
  }
  const exact = fields[0].folded === tokens.join(' ') ? 25 : 0;
  return { score: total / tokens.length + exact + (Number(entry.boost) || 0), label: merge(ranges.label), meta: merge(ranges.meta), parent: merge(ranges.parent) };
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

/**
 * Every Work Item the tab has already loaded, one entry per id: the open detail, the Work lanes, the proposed
 * list, Now's groups, the Runs list and the Activity feed, plus any extra Now responses in `more`. The first
 * source that names a title, Team, state or tracker reference wins for that field. Ids that are not Work Item
 * ids are dropped.
 * @returns {{ id: string, title: string, team: string, state: string, externalId: string }[]}
 */
export function workItemIndex(source = {}, more = []) {
  const found = new Map();
  const add = (id, fields = {}) => {
    const key = String(id ?? '');
    if (!workItemId.test(key)) return;
    const known = found.get(key) || { id: key, title: '', team: '', state: '', externalId: '' };
    found.set(key, {
      id: key,
      title: known.title || text(fields.title),
      team: known.team || text(fields.team),
      state: known.state || (Object.hasOwn(workItemStates, fields.state) ? fields.state : ''),
      externalId: known.externalId || text(fields.externalId),
    });
  };
  const nows = [source.now?.data, ...more].filter(Boolean);
  const detail = source.ploegDetail?.item;
  if (detail) add(detail.id, detail);
  for (const lane of Object.values(source.ploeg?.lanes || {})) for (const item of lane?.items || []) add(item?.id, item);
  for (const item of source.ploegProposed?.items || []) add(item?.id, item);
  for (const now of nows) for (const item of Array.isArray(now.waiting) ? now.waiting : []) add(item?.id, item);
  const runs = [...nows.flatMap(now => [...(Array.isArray(now.running) ? now.running : []), ...(Array.isArray(now.recent) ? now.recent : [])]), ...(source.ploegRuns?.runs || [])];
  for (const run of runs) add(run?.workItemId, { title: run?.workItemTitle, team: run?.team, externalId: run?.externalRef });
  for (const event of source.ploegFeed?.events || []) add(event?.workItemId, { title: event?.workItemTitle, team: event?.team });
  return [...found.values()];
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

/** Reads the stored recent list; anything malformed is dropped. */
export function parseRecent(raw) {
  try { const list = JSON.parse(raw || '[]'); return Array.isArray(list) ? list.filter(validRecent).slice(0, recentLimit) : []; } catch { return []; }
}

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
  if (status === 'on') return { label: 'Turn off desktop notifications', meta: 'You are told when something new waits on you', primary: true };
  if (status === 'off') return { label: 'Turn on desktop notifications', meta: 'While a De Vloer tab is open, when something new waits on you', primary: true };
  const why = { unsupported: 'This browser cannot show them here', insecure: 'They need a secure (HTTPS) connection', denied: 'Blocked in this browser’s site settings' }[status];
  return { label: 'Desktop notifications', meta: why, disabled: true };
}

/**
 * Every palette entry for `context`: the recent Work Items and sessions, destinations (pages, Work lanes and
 * settings), commands, the loaded Work Items and the sessions. Each entry has an `id`, a `group`, a `label` and
 * what it does: a `hash` to open, a `run` command, or a shared chrome `action` (theme, live updates, shortcuts,
 * new session, sign out). `primary` entries make up the palette before anything is typed.
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
      const title = item?.title || entry.title;
      const standing = item?.state ? workItemState(item.state) : null;
      entries.push({ id: `recent-work-${entry.id}`, group: 'recent', primary: true, label: title || `Work Item #${entry.id}`, meta: title ? `Work Item #${entry.id}${item?.team ? ` · ${item.team}` : ''}` : 'Work Item', icon: standing?.glyph || 'work', tone: standing?.tone, time: entry.at, hash: `work/${entry.id}`, run: 'go' });
    } else if (context.sessionsShown) {
      const session = sessionById.get(entry.id);
      if (!session && !entry.title) continue;
      entries.push({ id: `recent-session-${entry.id}`, group: 'recent', primary: true, label: text(session?.title) || entry.title, meta: 'Session', icon: 'sessions', time: entry.at, hash: `session/${entry.id}`, run: 'go' });
    }
  }
  for (const page of pages) {
    if (page.sessions && !context.sessionsShown) continue;
    entries.push({ id: `go-${page.id}`, group: 'go', primary: true, label: page.label, keywords: page.keywords, icon: page.icon, keys: page.keys, single: true, count: counted(page, counts), hash: page.id, run: 'go' });
  }
  for (const lane of lanes) entries.push({ id: `go-${lane.hash}`, group: 'go', label: lane.label, parent: 'Work', keywords: lane.keywords, icon: lane.icon, tone: lane.tone, count: counted(lane, counts), hash: lane.hash, run: 'go' });
  for (const page of settings) entries.push({ id: `go-${page.hash}`, group: 'go', label: page.label, parent: 'Settings', keywords: page.keywords, icon: page.icon, hash: page.hash, run: 'go' });
  const dark = Boolean(context.dark);
  entries.push({ id: 'theme', group: 'commands', primary: true, label: dark ? 'Switch to light theme' : 'Switch to dark theme', keywords: 'theme appearance colour mode dark light', icon: dark ? 'sun' : 'moon', action: 'theme-set', value: dark ? 'light' : 'dark', restore: true });
  if (context.theme !== 'system') entries.push({ id: 'theme-system', group: 'commands', label: 'Follow the system theme', keywords: 'theme appearance automatic os', icon: 'monitor', action: 'theme-set', value: 'system', restore: true });
  entries.push({ id: 'live', group: 'commands', primary: true, label: context.paused ? 'Resume live updates' : 'Pause live updates', keywords: 'live updates refresh automatically polling', icon: context.paused ? 'play' : 'pause', action: 'live-toggle', restore: true });
  entries.push({ id: 'refresh', group: 'commands', primary: true, label: 'Refresh this page', keywords: 'reload update fetch again', icon: 'refresh', run: 'refresh', restore: true });
  if (context.canCreate) entries.push({ id: 'new-session', group: 'commands', primary: true, label: 'New session', keywords: 'create start crew objective', icon: 'plus', action: 'new', keys: context.view === 'sessions' ? ['n'] : null, single: true, restore: true });
  entries.push({ id: 'shortcuts', group: 'commands', primary: true, label: 'Show keyboard shortcuts', keywords: 'keys help hotkeys', icon: 'keyboard', action: 'shortcuts-open', keys: ['?'], single: true, restore: true });
  entries.push({ id: 'preferences', group: 'commands', primary: true, label: 'Open preferences', keywords: 'prefs settings theme density format shortcuts options', icon: 'settings', hash: 'settings/preferences', run: 'go' });
  const notice = notificationCommand(context.notifications);
  entries.push({ id: 'notify', group: 'commands', keywords: 'notifications desktop alerts bell notify', icon: 'bell', run: 'notify', restore: true, quiet: true, ...notice, primary: Boolean(notice.primary) });
  entries.push({ id: 'density', group: 'commands', label: context.density === 'compact' ? 'Use comfortable density' : 'Use compact density', keywords: 'density rows spacing compact comfortable', icon: 'list', run: 'density', restore: true });
  entries.push({ id: 'single-keys', group: 'commands', label: context.singleKeys ? 'Turn off single-key shortcuts' : 'Turn on single-key shortcuts', keywords: 'keyboard shortcuts speech accessibility keys', icon: 'keyboard', run: 'single-keys', restore: true });
  entries.push({ id: 'copy-link', group: 'commands', label: 'Copy link to this page', keywords: 'share url address clipboard', icon: 'copy', run: 'copy-link', restore: true });
  if (!context.demo) entries.push({ id: 'sign-out', group: 'commands', primary: true, label: 'Sign out', keywords: 'log out logout leave', icon: 'logout', action: 'logout' });
  for (const item of items) {
    const meta = item.state ? workItemState(item.state) : null;
    entries.push({ id: `item-${item.id}`, group: 'items', itemId: item.id, label: item.title || `Work Item #${item.id}`, meta: [`#${item.id}`, item.externalId, item.team].filter(Boolean).join(' · '), icon: meta?.glyph || 'work', tone: meta?.tone, state: item.state || null, hash: `work/${item.id}`, run: 'go', boost: recentIds.has(`work:${item.id}`) ? 6 : 0 });
  }
  if (context.sessionsShown) {
    for (const session of sessions) {
      if (!sessionId.test(String(session?.id ?? ''))) continue;
      const status = sessionStatus(session);
      entries.push({ id: `session-${session.id}`, group: 'sessions', label: text(session.title) || 'Untitled session', meta: 'Session', icon: status.glyph, tone: status.tone, status, hash: `session/${session.id}`, run: 'go', boost: recentIds.has(`session:${session.id}`) ? 6 : 0 });
    }
  }
  return entries;
}

/**
 * Filters and orders `entries` for `query`. Without a query: the primary entries under Recent, Go to and
 * Commands. With one: every match, best first within each group, a few per group, groups ordered by their best
 * match. A Work Item number (`105` or `#105`) always offers that Work Item first, by title when it is loaded.
 * `status` adds the state of the Work Item search: `loading`, `partial`, `error` (true or the failure message),
 * or `offline` when this account has no Ploeg to open Work Items in.
 * @returns {{ id: string, label: string, note?: string, loading?: boolean, results: { entry: object, match: object }[] }[]}
 */
export function searchPalette(query, entries, status = {}) {
  const typed = String(query ?? '').trim();
  const none = { label: [], meta: [], parent: [] };
  if (!typed) {
    return emptyGroups.map(id => ({ id, label: groupLabels[id], results: entries.filter(entry => entry.group === id && entry.primary).slice(0, limits[id]).map(entry => ({ entry, match: { score: 0, ...none } })) })).filter(group => group.results.length);
  }
  const scored = [];
  entries.forEach((entry, order) => {
    if (entry.group === 'recent') return;
    const match = matchEntry(typed, entry);
    if (match) scored.push({ entry, match, order });
  });
  const jump = status.offline ? null : /^#?([1-9][0-9]{0,19})$/.exec(typed.replace(/\s+/g, ''));
  if (jump) {
    const known = scored.find(result => result.entry.itemId === jump[1]);
    if (known) known.match.score = Infinity;
    else scored.push({ entry: { id: `jump-${jump[1]}`, group: 'items', label: `Open Work Item #${jump[1]}`, meta: 'Go straight to its page', icon: 'hash', hash: `work/${jump[1]}`, run: 'go' }, match: { score: Infinity, ...none }, order: -1 });
  }
  const groups = new Map();
  for (const result of scored) {
    if (!groups.has(result.entry.group)) groups.set(result.entry.group, []);
    groups.get(result.entry.group).push(result);
  }
  if (status.loading && !groups.has('items')) groups.set('items', []);
  const ordered = [...groups.entries()].map(([id, results]) => {
    results.sort((a, b) => Number(Boolean(a.entry.disabled)) - Number(Boolean(b.entry.disabled)) || b.match.score - a.match.score || a.order - b.order);
    return { id, label: groupLabels[id], best: results.find(result => !result.entry.disabled)?.match.score ?? 0, results: results.slice(0, limits[id]).map(({ entry, match }) => ({ entry, match })) };
  }).sort((a, b) => b.best - a.best);
  for (const group of ordered) {
    if (group.id !== 'items') continue;
    if (status.loading) { group.loading = true; group.note = 'Loading…'; }
    else if (status.partial) group.note = 'Some lists could not be read';
  }
  if (status.error) {
    const retry = { id: 'items-retry', group: 'items', label: 'Work Items could not be loaded', meta: [typeof status.error === 'string' ? status.error : '', 'Select to try again.'].filter(Boolean).join(' '), icon: 'refresh', tone: 'danger', run: 'retry', keepOpen: true, quiet: true };
    const items = ordered.find(group => group.id === 'items');
    if (items) items.results.push({ entry: retry, match: { score: 0, ...none } });
    else ordered.push({ id: 'items', label: groupLabels.items, best: 0, results: [{ entry: retry, match: { score: 0, ...none } }] });
  }
  return ordered.map(({ best, ...group }) => group);
}

function trailMarkup(entry, { singleKeys = true, mac = false } = {}) {
  const parts = [];
  if (entry.count) parts.push(count(entry.count.value, { tone: entry.count.tone, label: entry.count.label }));
  if (entry.state) parts.push(stateBadge(entry.state));
  if (entry.status) parts.push(stateBadge(entry.status));
  if (entry.time) parts.push(`<span class="palette-option-time">${timeAgo(entry.time)}</span>`);
  if (entry.keys?.length && (!entry.single || singleKeys)) parts.push(`<span class="palette-option-keys" aria-hidden="true">${kbd(entry.keys.map(key => keyLabel(key, mac)))}</span>`);
  return parts.length ? `<span class="palette-option-trail">${parts.join('')}</span>` : '';
}

function optionMarkup({ entry, match }, index, active, options) {
  const disabled = Boolean(entry.disabled);
  const behaviour = disabled ? '' : entry.action ? ` data-action="${escape(entry.action)}"${entry.value ? ` data-value="${escape(entry.value)}"` : ''}` : ' data-action="palette-run"';
  const parent = entry.parent ? `<span class="palette-option-parent">${highlight(entry.parent, match.parent)}${icon('chevron', 'palette-option-separator')}</span>` : '';
  const standing = entry.state ? workItemState(entry.state) : entry.status || null;
  const status = standing ? `<span class="palette-option-state" data-tone="${escape(standing.tone)}">${escape(standing.label)}</span>` : '';
  const meta = entry.meta || status ? `<span class="palette-option-meta">${status}${entry.meta ? `<span class="palette-option-detail">${highlight(entry.meta, match.meta)}</span>` : ''}</span>` : '';
  return `<div class="palette-option" role="option" id="palette-option-${index}" data-entry="${escape(entry.id)}" aria-selected="${index === active}"${disabled ? ' aria-disabled="true"' : ''}${behaviour}><span class="palette-option-icon"${entry.tone ? ` data-tone="${escape(entry.tone)}"` : ''}>${icon(entry.icon || 'circle')}</span><span class="palette-option-main"><span class="palette-option-title">${parent}<span class="palette-option-label">${highlight(entry.label, match.label)}</span></span>${meta}</span>${trailMarkup(entry, options)}</div>`;
}

/**
 * The listbox content for `groups` from {@link searchPalette}: one `role="group"` per group with its visual
 * label, one `role="option"` per result with the id `palette-option-<n>` in reading order, `aria-selected="true"`
 * on the `active` one, the matched characters marked, and each row's shortcut. Without results it is an empty state.
 */
export function resultsMarkup(groups, active = 0, { query = '', singleKeys = true, mac = false } = {}) {
  if (!groups.length) {
    const typed = String(query).trim();
    return `<div class="palette-empty">${emptyState({ icon: 'search', compact: true, title: typed ? `No matches for “${typed}”` : 'Nothing to show', body: '<p>Search covers pages, commands and the Work Items this tab has loaded. A number always opens that Work Item.</p>' })}</div>`;
  }
  let index = 0;
  return groups.map(group => {
    const note = group.note ? `<span class="palette-group-note">${escape(group.note)}</span>` : '';
    const loading = group.loading && !group.results.length ? '<div class="palette-loading" aria-hidden="true"><span class="skeleton circle"></span><span class="skeleton text"></span></div><div class="palette-loading" aria-hidden="true"><span class="skeleton circle"></span><span class="skeleton text"></span></div>' : '';
    const rows = group.results.map(result => optionMarkup(result, index++, active, { singleKeys, mac })).join('');
    return `<div class="palette-group" role="group" aria-label="${escape(group.label)}"${group.loading ? ' aria-busy="true"' : ''}><div class="palette-group-label" aria-hidden="true"><span>${escape(group.label)}</span>${note}</div>${loading}${rows}</div>`;
  }).join('');
}

const palette = { opener: null, again: null, query: '', active: 0, groups: [], results: [], statusTimer: null, wired: false };
const nowCache = { data: null, error: null, loading: false, at: 0 };

function readRecent() { try { return parseRecent(globalThis.localStorage?.getItem(recentKey)); } catch { return []; } }
function writeRecent(list) { try { globalThis.localStorage?.setItem(recentKey, JSON.stringify(list)); } catch {} }

function rememberRoute(hash = globalThis.location?.hash) {
  const entry = recentFromHash(hash);
  if (entry) writeRecent(rememberRecent(readRecent(), entry));
}

function resolvedRecent(items) {
  const list = readRecent();
  const titles = new Map(items.filter(item => item.title).map(item => [`work:${item.id}`, item.title]));
  for (const session of state.sessions || []) if (text(session?.title)) titles.set(`session:${session.id}`, text(session.title));
  let changed = false;
  const resolved = list.map(entry => {
    const title = titles.get(`${entry.kind}:${entry.id}`);
    if (!title || title === entry.title) return entry;
    changed = true;
    return { ...entry, title };
  });
  if (changed) writeRecent(resolved);
  return resolved;
}

const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const nowData = () => [nowCache.data].filter(Boolean);

function paletteContext() {
  const theme = prefs.get('theme');
  const items = workItemIndex(state, nowData());
  const sessionsShown = Boolean(state.bootstrap) && showsSessions();
  const partial = [state.now?.data, nowCache.data].some(data => Object.values(data?.errors || {}).some(Boolean));
  return {
    counts: state.counts,
    items,
    sessions: state.sessions || [],
    recent: resolvedRecent(items),
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
    status: { loading: nowCache.loading, error: nowCache.error && !nowCache.loading ? nowCache.error.message || true : false, partial, offline: ['unconfigured', 'no-access'].includes(state.ploegStatus) },
  };
}

function frameMarkup() {
  const hints = [[['↑', '↓'], 'Move'], [['↵'], 'Open']].map(([keys, label]) => `<span class="palette-hint">${kbd(keys)}<span>${label}</span></span>`).join('');
  return `<div class="palette-frame"><h2 id="palette-title" class="sr-only">Search and commands</h2><div class="palette-search">${icon('search', 'palette-search-icon')}<input id="palette-input" class="palette-input" type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" aria-describedby="palette-help" aria-label="Search pages, commands and Work Items" placeholder="Search or jump to…" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"><button class="palette-dismiss" type="button" data-action="palette-close" aria-label="Close search"><span class="palette-dismiss-key" aria-hidden="true">${kbd('Esc')}</span><span class="palette-dismiss-text" aria-hidden="true">Cancel</span></button></div><div class="palette-results" id="palette-list" role="listbox" aria-label="Results"></div><div class="palette-footer" aria-hidden="true">${hints}<span class="palette-footer-tip">Type a number to open that Work Item</span></div><p class="sr-only" id="palette-help">Type a page, command or Work Item title or number. Arrow keys choose a result, Enter opens it, Escape closes the search.</p><p class="sr-only" id="palette-status" role="status" aria-live="polite"></p></div>`;
}

function announceResults() {
  clearTimeout(palette.statusTimer);
  palette.statusTimer = setTimeout(() => {
    const status = $('#palette-status');
    if (!status) return;
    const loading = palette.groups.some(group => group.loading);
    const total = palette.results.length;
    status.textContent = loading && !total ? 'Loading Work Items…' : total ? `${total} ${total === 1 ? 'result' : 'results'}` : 'No results';
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

function refreshResults({ keep = false } = {}) {
  const list = $('#palette-list');
  const input = $('#palette-input');
  if (!list || !input) return;
  const context = paletteContext();
  const kept = keep ? palette.results[palette.active]?.entry.id : null;
  palette.groups = searchPalette(palette.query, paletteEntries(context), palette.query.trim() ? context.status : {});
  palette.results = palette.groups.flatMap(group => group.results);
  const again = kept ? palette.results.findIndex(result => result.entry.id === kept) : -1;
  palette.active = again >= 0 ? again : firstEnabled();
  list.innerHTML = resultsMarkup(palette.groups, palette.active, { query: palette.query, singleKeys: context.singleKeys, mac: context.mac });
  if (palette.results.length) input.setAttribute('aria-activedescendant', `palette-option-${palette.active}`);
  else input.removeAttribute('aria-activedescendant');
  if (!keep) list.scrollTop = 0;
  announceResults();
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
  const total = palette.results.length;
  if (!total) return;
  setActive(firstEnabled(palette.active + step, step));
}

function onKey(event) {
  if (event.target.id !== 'palette-input' || event.isComposing) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1); return; }
  if (event.key === 'PageDown' || event.key === 'PageUp') { event.preventDefault(); setActive(palette.active + (event.key === 'PageDown' ? 5 : -5)); return; }
  if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    const option = document.getElementById(`palette-option-${palette.active}`);
    if (option && option.getAttribute('aria-disabled') !== 'true') option.click();
  }
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

function entryOf(option) { return palette.results.find(result => result.entry.id === option?.dataset.entry)?.entry || null; }

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
  if (!state.bootstrap || nowCache.loading || ['unconfigured', 'no-access'].includes(state.ploegStatus)) return;
  if (!force && (Date.now() - nowCache.at < nowFresh || (state.view === 'now' && state.now?.data))) return;
  nowCache.loading = true;
  nowCache.error = null;
  if ($('#palette')?.open) refreshResults({ keep: true });
  try { nowCache.data = await api('/api/ploeg/now'); }
  catch (error) { if (['ploeg_unconfigured', 'ploeg_scope'].includes(error.code)) nowCache.data = null; else nowCache.error = { message: error.message, code: error.code || '' }; }
  finally { nowCache.at = Date.now(); nowCache.loading = false; if ($('#palette')?.open) refreshResults({ keep: true }); }
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
  rememberRoute();
  wire(dialog);
  dialog.innerHTML = frameMarkup();
  refreshResults();
  dialog.showModal();
  $('#palette-input')?.focus();
  void loadWorkItems();
}

function toggleDensity() {
  const compact = prefs.get('density') !== 'compact';
  prefs.set('density', compact ? 'compact' : 'comfortable');
  applyAppearance();
  if (state.view === 'preferences') redraw();
  announce(compact ? 'Compact density' : 'Comfortable density');
}

function redraw() {
  const again = palette.again;
  render();
  if (focusLost()) restoreFocus(null, again);
}

function toggleSingleKeys() {
  const on = !singleKeysEnabled();
  prefs.set('singleKeyShortcuts', on);
  redraw();
  announce(on ? 'Single-key shortcuts on' : 'Single-key shortcuts off');
}

async function toggleNotifications() {
  if (attention.status() === 'on') { attention.disable(); notify('Desktop notifications are off.'); return; }
  const status = await attention.enable();
  if (status === 'on') notify('Desktop notifications are on. While a De Vloer tab is open, you hear about each new item that waits on you.');
  else if (status === 'denied') notify('This browser blocks notifications for De Vloer. Allow them in the site settings, then turn them on again.', true);
  else if (status === 'off') notify('Desktop notifications stay off: the browser did not get permission.');
  else notify('This browser cannot show desktop notifications here.', true);
}

async function copyLink() {
  try { await navigator.clipboard.writeText(location.href); notify('Link to this page copied.'); }
  catch { notify('Could not copy the link. Copy it from the address bar instead.', true); }
}

async function refreshPage() {
  const again = palette.again;
  nowCache.at = 0;
  await boot();
  if (focusLost()) restoreFocus(null, again);
  announce('Page refreshed');
}

function runEntry(element) {
  const entry = entryOf(element);
  if (!entry || entry.disabled) return;
  if (entry.run === 'go') { location.hash = entry.hash; return; }
  if (entry.run === 'retry') { void loadWorkItems(true); return; }
  if (entry.run === 'refresh') return refreshPage();
  if (entry.run === 'density') return toggleDensity();
  if (entry.run === 'single-keys') return toggleSingleKeys();
  if (entry.run === 'notify') return toggleNotifications();
  if (entry.run === 'copy-link') return copyLink();
}

installAttention();
onCountsChange((...args) => { if (args[0] && typeof args[0] === 'object') { nowCache.data = args[0]; nowCache.error = null; nowCache.at = Date.now(); } });
if (globalThis.window && globalThis.location) {
  window.addEventListener('hashchange', () => rememberRoute());
  rememberRoute(redirect(location.hash) ?? location.hash);
}

/**
 * The command palette (`#palette`): `palette-open` (the search button, `/` and ⌘K or Ctrl K) opens a combobox
 * over a grouped listbox of recent items, destinations, commands, Work Items and sessions with fuzzy matching;
 * `palette-run` runs a result and `palette-close` closes it. Loading the view also connects the favicon dot and
 * desktop notifications to the counts, and records the Work Items and sessions opened as recent.
 */
export default {
  id: 'palette',
  actions: {
    'palette-open': () => openPalette(),
    'palette-run': element => runEntry(element),
    'palette-close': () => closePalette(true),
  },
};
