import { activityMarkup, eventGroups, mergeFeed, newerEvents } from '../ploeg-activity.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { announce, renderHtml } from '../core/dom.js';
import { buildHash } from '../core/route.js';
import { live } from '../core/live.js';
import { shell } from '../shell.js';
import { enterPloegView, loadPloegTeams, onPloegReload, ploegFailure, ploegHelpers, ploegVisible, refreshButton } from './ploeg-common.js';

const kinds = eventGroups.map(([id]) => id);

function renderActivity() {
  const feed = state.ploegFeed;
  renderHtml(shell(activityMarkup(feed, state.ploegTeams || [], ploegHelpers(), Date.now(), state.bootstrap.user), { title: 'Activity', subtitle: 'What Ploeg recorded across your Teams, newest first.', actions: refreshButton(feed.loading && feed.mode !== 'older') }));
}

async function loadFeed(mode = 'reset', fresh = false) {
  const feed = state.ploegFeed;
  if (feed.loading && mode !== 'reset') return;
  const request = mode === 'reset' || mode === 'refresh' ? ++state.ploegRequest : state.ploegRequest;
  feed.loading = true;
  feed.mode = mode;
  if (mode === 'reset') { feed.events = null; feed.nextCursor = null; feed.error = null; feed.latest = null; }
  if (mode !== 'newer') renderActivity();
  const query = new URLSearchParams();
  if (feed.team) query.set('team', feed.team);
  if (mode === 'older') query.set('before', feed.nextCursor);
  if (fresh || mode === 'newer') query.set('refresh', '1');
  try {
    const page = await api(`/api/ploeg/events?${query}`);
    if (request !== state.ploegRequest) return;
    if (mode === 'newer' && feed.events?.length) feed.latest = newerEvents(feed, page).events.length ? page : null;
    else {
      const merged = mergeFeed(mode === 'older' ? feed : null, page, mode === 'older' ? 'older' : 'newer');
      Object.assign(feed, { events: merged.events, nextCursor: merged.nextCursor });
      if (mode !== 'older') feed.latest = null;
    }
    Object.assign(feed, { demo: page.demo, error: null, refreshedAt: page.fetchedAt });
    live.touch('activity');
  } catch (error) {
    if (request !== state.ploegRequest) return;
    feed.error = ploegFailure(error);
    if (mode === 'newer') throw error;
  } finally { if (request === state.ploegRequest) { feed.loading = false; feed.mode = null; if (ploegVisible('activity')) renderActivity(); } }
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

function keepFiltersInHash() {
  history.replaceState(null, '', `#${buildHash('activity', { team: state.ploegFeed.team, kind: state.ploegFeed.kind })}`);
}

async function enterActivity({ query = {} } = {}) {
  enterPloegView('activity');
  state.ploegFeed.team = query.team || '';
  state.ploegFeed.kind = kinds.includes(query.kind) ? query.kind : '';
  if (state.ploegTeams === null) void loadPloegTeams();
  return await loadFeed('reset');
}

async function refreshFeed() {
  if (state.ploegFeed.loading || !state.ploegFeed.events) return;
  await loadFeed('newer');
}

onPloegReload('activity', () => loadFeed(state.ploegFeed.events ? 'refresh' : 'reset', true));
live.register('activity', { interval: 15000, refresh: refreshFeed });

/** Activity: Ploeg's audit feed across the Teams you can read, grouped by day and filtered by Team and kind (`#activity?team=&kind=`). Checks for new events every 15 seconds and holds them behind an "N new" button. */
export default {
  id: 'activity',
  match: hash => hash === 'activity' ? {} : null,
  enter: enterActivity,
  render: renderActivity,
  actions: { 'ploeg-feed-older': () => loadFeed('older'), 'activity-show-new': showNewEvents },
  changes: {
    '#ploeg-feed-team': element => { state.ploegFeed.team = element.value; keepFiltersInHash(); void loadFeed('reset'); },
    '#ploeg-feed-kind': element => { state.ploegFeed.kind = element.value; keepFiltersInHash(); renderActivity(); },
  },
};
