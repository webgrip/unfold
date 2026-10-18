import { activityMarkup, eventGroups, eventKind, mergeFeed, newerEvents } from '../ploeg-activity.js';
import { activitySwitch } from '../action-log.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { announce, renderHtml } from '../core/dom.js';
import { buildHash } from '../core/route.js';
import { live } from '../core/live.js';
import { plural } from '../core/format.js';
import { shell } from '../shell.js';
import { autoPages, eventInRange, eventMoment, reachesStart } from '../controls/range-filter.js';
import { listRangeControl } from './time-range-control.js';
import { enterPloegView, liveRefresh, loadPloegTeams, onPloegReload, ploegFailure, ploegHelpers, ploegVisible, refreshButton, settle, track } from './ploeg-common.js';

const kinds = eventGroups.map(([id]) => id);

let range = null;

function renderActivity() {
  const feed = state.ploegFeed;
  const actions = refreshButton({ busy: feed.mode === 'reset' || feed.mode === 'refresh', shown: Boolean(feed.events) || !feed.error });
  const shown = range ? { ...feed, range: range.resolved(), rangeControl: range.markup(), rangeFilling: feed.filling } : feed;
  renderHtml(shell(activitySwitch('events') + activityMarkup(shown, state.ploegTeams || [], ploegHelpers(), Date.now(), state.bootstrap.user), { title: 'Activity', subtitle: 'What Ploeg recorded across your Teams, newest first.', actions }));
}

function eventsQuery(feed, { before, fresh } = {}) {
  const query = new URLSearchParams();
  if (feed.team) query.set('team', feed.team);
  if (before) query.set('before', before);
  if (fresh) query.set('refresh', '1');
  return query;
}

const pending = feed => feed.latest ? newerEvents(feed, feed.latest).events.map(entry => entry.id) : [];
const signature = feed => JSON.stringify([pending(feed), feed.error?.message ?? null, feed.events?.length ?? null, feed.events?.[0]?.id ?? null, feed.demo]);

async function load(mode) {
  const feed = state.ploegFeed;
  const request = ++state.ploegRequest;
  feed.mode = mode;
  feed.loading = true;
  if (mode === 'reset') Object.assign(feed, { events: null, nextCursor: null, error: null, latest: null });
  renderActivity();
  try {
    const page = await api(`/api/ploeg/events?${eventsQuery(feed, { fresh: mode === 'refresh' })}`);
    if (request !== state.ploegRequest) return;
    const merged = mergeFeed(mode === 'refresh' ? feed : null, page, 'newer');
    Object.assign(feed, { events: merged.events, nextCursor: merged.nextCursor, latest: null, demo: page.demo, error: null, refreshedAt: page.fetchedAt, loadedAt: Date.now() });
    live.touch('activity');
  } catch (error) {
    if (request !== state.ploegRequest) return;
    feed.error = ploegFailure(error);
  } finally {
    if (request === state.ploegRequest) { feed.mode = null; feed.loading = false; if (ploegVisible('activity')) renderActivity(); }
  }
}

const loadFeed = mode => track('activity', load(mode));

async function loadOlder() {
  const feed = state.ploegFeed;
  if (feed.mode || !feed.nextCursor) return;
  const request = state.ploegRequest;
  feed.mode = 'older';
  feed.loading = true;
  renderActivity();
  try {
    const page = await api(`/api/ploeg/events?${eventsQuery(feed, { before: feed.nextCursor })}`);
    if (request !== state.ploegRequest) return;
    const merged = mergeFeed(feed, page, 'older');
    Object.assign(feed, { events: merged.events, nextCursor: merged.nextCursor, error: null });
  } catch (error) {
    if (request !== state.ploegRequest) return;
    feed.error = ploegFailure(error);
  } finally {
    if (request === state.ploegRequest) { feed.mode = null; feed.loading = false; if (ploegVisible('activity')) renderActivity(); }
  }
}

async function poll() {
  const feed = state.ploegFeed;
  const request = state.ploegRequest;
  const before = signature(feed);
  let page;
  try { page = await api(`/api/ploeg/events?${eventsQuery(feed, { fresh: true })}`); }
  catch (error) {
    if (request !== state.ploegRequest) return settle('activity');
    feed.error = ploegFailure(error);
    if (ploegVisible('activity') && signature(feed) !== before) renderActivity();
    throw error;
  }
  if (request !== state.ploegRequest) return settle('activity');
  if (feed.events) feed.latest = newerEvents(feed, page).events.length ? page : null;
  else Object.assign(feed, { events: mergeFeed(null, page, 'newer').events, nextCursor: page.nextCursor, latest: null });
  Object.assign(feed, { demo: page.demo, error: null, refreshedAt: page.fetchedAt, loadedAt: Date.now() });
  if (ploegVisible('activity') && signature(feed) !== before) renderActivity();
}

function showNewEvents() {
  const feed = state.ploegFeed;
  if (!feed.latest) return;
  const shown = newerEvents(feed, feed.latest).events.length;
  const merged = mergeFeed(feed, feed.latest, 'newer');
  Object.assign(feed, { events: merged.events, nextCursor: merged.nextCursor, latest: null });
  renderActivity();
  const region = document.getElementById('activity-feed');
  region?.scrollIntoView({ block: 'start' });
  region?.focus({ preventScroll: true });
  announce(`${shown} new ${shown === 1 ? 'event' : 'events'} shown`);
}

async function fillRange() {
  const feed = state.ploegFeed;
  const request = state.ploegRequest;
  feed.filling = true;
  try {
    for (let pages = 0; pages < autoPages; pages++) {
      const resolved = range?.resolved();
      if (!resolved || !feed.events || !feed.nextCursor || request !== state.ploegRequest || reachesStart(feed.events, eventMoment, resolved, Boolean(feed.nextCursor))) break;
      const cursor = feed.nextCursor;
      await loadOlder();
      if (feed.nextCursor === cursor) break;
    }
  } finally {
    feed.filling = false;
    if (ploegVisible('activity')) renderActivity();
  }
}

async function changeRange() {
  keepFiltersInHash();
  renderActivity();
  await fillRange();
  announceEvents();
}

function announceEvents() {
  const feed = state.ploegFeed;
  if (!ploegVisible('activity')) return;
  if (!feed.events) { announce('Could not load Activity'); return; }
  const resolved = range?.resolved();
  const shown = feed.events.filter(entry => (!feed.kind || eventKind(entry.action).group === feed.kind) && (!resolved || eventInRange(entry, resolved))).length;
  announce(`${plural(shown, 'event')}${feed.nextCursor ? ' loaded, more are older' : ''}`);
}

async function filterTeam(element) {
  state.ploegFeed.team = element.value;
  keepFiltersInHash();
  const loading = loadFeed('reset').then(fillRange);
  const request = state.ploegRequest;
  await loading.catch(() => {});
  if (request === state.ploegRequest) announceEvents();
}

function filterKind(element) {
  state.ploegFeed.kind = element.value;
  keepFiltersInHash();
  renderActivity();
  announceEvents();
}

function keepFiltersInHash() {
  history.replaceState(null, '', `#${buildHash('activity', { team: state.ploegFeed.team, kind: state.ploegFeed.kind, ...range?.query() })}`);
}

async function enterActivity({ query = {} } = {}) {
  enterPloegView('activity');
  state.ploegFeed.team = query.team || '';
  state.ploegFeed.kind = kinds.includes(query.kind) ? query.kind : '';
  range?.picker.destroy();
  range = listRangeControl('activity-range', query, () => void changeRange());
  if (state.ploegTeams === null) void loadPloegTeams();
  const loaded = await loadFeed('reset');
  void fillRange();
  return loaded;
}

onPloegReload('activity', () => loadFeed(state.ploegFeed.events ? 'refresh' : 'reset'));
live.register('activity', { interval: 15000, refresh: liveRefresh('activity', poll, () => state.ploegFeed.error) });

/** Activity: Ploeg's audit feed across the Teams you can read, grouped by day and filtered by Team, kind and a time range (`#activity?team=&kind=&from=&to=`, the last 7 days by default), loading older pages by itself to reach the start of the range. Checks for new events every 15 seconds and holds them behind an "N new" button. */
export default {
  id: 'activity',
  match: hash => hash === 'activity' ? {} : null,
  enter: enterActivity,
  render: renderActivity,
  actions: { 'ploeg-feed-older': loadOlder, 'activity-show-new': showNewEvents, 'activity-range-zoom-out': () => range?.picker.dispatch({ type: 'zoom-out' }) },
  changes: {
    '#ploeg-feed-team': filterTeam,
    '#ploeg-feed-kind': filterKind,
  },
};
