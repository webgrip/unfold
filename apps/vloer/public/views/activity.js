import { activityMarkup, eventGroups, mergeFeed } from '../ploeg-activity.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { renderHtml } from '../core/dom.js';
import { buildHash } from '../core/route.js';
import { shell } from '../shell.js';
import { enterPloegView, loadPloegTeams, onPloegReload, ploegFailure, ploegHelpers, ploegVisible } from './ploeg-common.js';

const kinds = eventGroups.map(([id]) => id);

function renderActivity() {
  renderHtml(shell(activityMarkup(state.ploegFeed, state.ploegTeams || [], ploegHelpers()), { title: 'Activity', subtitle: 'What Ploeg recorded across your Teams, newest first.' }));
}

function keepReadingPosition(render) {
  const anchor = window.scrollY > 0 ? [...document.querySelectorAll('[data-event-id]')].find(row => row.getBoundingClientRect().top >= 0) : null;
  const before = anchor?.getBoundingClientRect().top;
  render();
  const after = anchor && document.getElementById(anchor.id)?.getBoundingClientRect().top;
  if (anchor && after !== undefined) window.scrollBy(0, after - before);
}

async function loadFeed(mode = 'reset', fresh = false) {
  const feed = state.ploegFeed;
  if (feed.loading && mode !== 'reset') return;
  const request = mode === 'reset' ? ++state.ploegRequest : state.ploegRequest;
  feed.loading = true;
  if (mode === 'reset') { feed.events = null; feed.nextCursor = null; feed.error = null; }
  if (mode !== 'newer') renderActivity();
  const query = new URLSearchParams();
  if (feed.team) query.set('team', feed.team);
  if (mode === 'older') query.set('before', feed.nextCursor);
  if (fresh || mode === 'newer') query.set('refresh', '1');
  try {
    const page = await api(`/api/ploeg/events?${query}`);
    if (request !== state.ploegRequest) return;
    const merged = mergeFeed(mode === 'reset' ? null : feed, page, mode === 'older' ? 'older' : 'newer');
    Object.assign(feed, { events: merged.events, nextCursor: merged.nextCursor, demo: page.demo, error: null, refreshedAt: page.fetchedAt });
  } catch (error) { if (request !== state.ploegRequest) return; feed.error = ploegFailure(error); }
  finally { if (request === state.ploegRequest) { feed.loading = false; if (ploegVisible('activity')) { if (mode === 'newer') keepReadingPosition(renderActivity); else renderActivity(); } } }
}

function keepFiltersInHash() {
  history.replaceState(null, '', `#${buildHash('activity', { team: state.ploegFeed.team, kind: state.ploegFeed.kind })}`);
}

async function enterActivity({ query = {} } = {}) {
  enterPloegView('activity');
  state.ploegFeed.team = query.team || '';
  state.ploegFeed.kind = kinds.includes(query.kind) ? query.kind : '';
  if (state.ploegTeams === null) void loadPloegTeams();
  state.ploegTimer = setInterval(() => { if (document.visibilityState === 'visible' && ploegVisible('activity') && !state.ploegFeed.loading && !document.querySelector('dialog[open]')) void loadFeed('newer'); }, 15000);
  return await loadFeed('reset');
}

onPloegReload('activity', () => loadFeed('reset', true));

/** Activity: Ploeg's audit feed across the Teams you can read, newest first, filtered by Team and kind (`#activity?team=&kind=`). Refreshes every 15 seconds. */
export default {
  id: 'activity',
  match: hash => hash === 'activity' ? {} : null,
  enter: enterActivity,
  render: renderActivity,
  actions: { 'ploeg-feed-older': () => loadFeed('older') },
  changes: {
    '#ploeg-feed-team': element => { state.ploegFeed.team = element.value; keepFiltersInHash(); void loadFeed('reset'); },
    '#ploeg-feed-kind': element => { state.ploegFeed.kind = element.value; keepFiltersInHash(); renderActivity(); },
  },
};
