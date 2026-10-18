import { actionsCsv, actionsJson, actionsPageMarkup, recordRow } from '../action-log.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { announce, download, renderHtml } from '../core/dom.js';
import { buildHash } from '../core/route.js';
import { plural } from '../core/format.js';
import { shell } from '../shell.js';
import { editing, enterPloegView, ploegVisible } from './ploeg-common.js';

const pageSize = 50;
const outcomeValues = ['done', 'refused', 'failed'];
const page = { person: '', outcome: '', channel: '', records: null, nextBefore: null, error: '', loadingOlder: false, facets: null, request: 0 };

const user = () => state.bootstrap?.user || {};
const admin = () => user().role === 'admin';

function renderActions() {
  if (!ploegVisible('actions')) return;
  renderHtml(shell(actionsPageMarkup(page, { admin: admin(), userId: user().id, demo: state.bootstrap?.mode === 'demo', now: Date.now() }), { title: 'Activity', subtitle: admin() ? 'Who did what across Work Items and sessions, newest first.' : 'What you did across Work Items and sessions, newest first.' }));
}

/** The `GET /api/actions` query for the page's person, outcome and channel, older than `before` when given. */
export function actionsQuery({ person, outcome, channel }, { isAdmin, userId, before } = {}) {
  const query = new URLSearchParams({ limit: String(pageSize) });
  if (isAdmin && person !== 'all') query.set('userId', person || userId || '');
  if (outcome) query.set('outcome', outcome);
  if (channel) query.set('channel', channel);
  if (before) query.set('before', String(before));
  if (query.get('userId') === '') query.delete('userId');
  return query;
}

const query = before => actionsQuery(page, { isAdmin: admin(), userId: user().id, before });

async function loadFacets() {
  const scoped = admin() && page.person !== 'all' ? `?${new URLSearchParams({ userId: page.person })}` : '';
  try {
    const [chosen, everyone] = await Promise.all([api(`/api/actions/filters${scoped}`), admin() && scoped ? api('/api/actions/filters') : null]);
    page.facets = { people: (everyone || chosen).people, channels: chosen.channels };
  } catch { page.facets = page.facets || { people: [], channels: [] }; }
  if (!editing()) renderActions();
}

async function load() {
  const request = ++page.request;
  Object.assign(page, { records: null, nextBefore: null, error: '', loadingOlder: false });
  renderActions();
  try {
    const result = await api(`/api/actions?${query()}`);
    if (request !== page.request) return;
    Object.assign(page, { records: result.actions, nextBefore: result.nextBefore ?? null });
  } catch (error) {
    if (request !== page.request) return;
    page.error = error.message || 'Unfold did not answer.';
  }
  renderActions();
  announce(page.records ? `${plural(page.records.length, 'action')}${page.nextBefore ? ' loaded, more are older' : ''}` : 'Could not load who did what');
}

async function loadOlder() {
  if (page.loadingOlder || !page.nextBefore) return;
  const request = page.request;
  page.loadingOlder = true;
  renderActions();
  try {
    const result = await api(`/api/actions?${query(page.nextBefore)}`);
    if (request !== page.request) return;
    Object.assign(page, { records: [...page.records, ...result.actions], nextBefore: result.nextBefore ?? null, error: '' });
    announce(`${plural(result.actions.length, 'older action')} shown`);
  } catch (error) {
    if (request !== page.request) return;
    page.error = `Could not load older actions: ${error.message || 'Unfold did not answer.'}`;
  } finally {
    if (request === page.request) { page.loadingOlder = false; renderActions(); }
  }
}

function keepFiltersInHash() {
  history.replaceState(null, '', `#${buildHash('activity/actions', { person: admin() && page.person !== user().id ? page.person : '', outcome: page.outcome, channel: page.channel })}`);
}

function filter(key) {
  return element => {
    page[key] = element.value;
    if (key === 'person') page.channel = '';
    keepFiltersInHash();
    if (key === 'person') void loadFacets();
    void load();
  };
}

function exportActions(button) {
  const rows = (page.records || []).map(recordRow);
  if (!rows.length) return;
  const who = admin() ? page.person === 'all' ? 'everyone' : page.person || user().id : user().id;
  const scope = [`person ${who}`, page.outcome && `outcome ${page.outcome}`, page.channel && `channel ${page.channel}`].filter(Boolean).join(', ');
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `unfold-actions-${String(who).replace(/[^A-Za-z0-9_-]/g, '_')}-${stamp}`;
  if (button.dataset.format === 'json') download(`${name}.json`, actionsJson(rows, { scope }), 'application/json');
  else download(`${name}.csv`, actionsCsv(rows), 'text/csv');
  announce(`Downloaded ${plural(rows.length, 'action')}`);
}

async function enterActions({ query: params = {} } = {}) {
  enterPloegView('actions');
  page.person = admin() ? params.person || user().id || 'all' : user().id || '';
  page.outcome = outcomeValues.includes(params.outcome) ? params.outcome : '';
  page.channel = params.channel || '';
  void loadFacets();
  await load();
}

/** Who did what (`#activity/actions?person=&outcome=&channel=`): the signed-in person's Action Records across Work Items and sessions, or anyone's for an administrator, with paging, filters and CSV and JSON downloads (system ADR-0037). */
export default {
  id: 'actions',
  match: hash => hash === 'activity/actions' ? {} : null,
  enter: enterActions,
  render: renderActions,
  actions: { 'actions-older': loadOlder, 'actions-retry': () => load(), 'actions-export': exportActions },
  changes: {
    '#actions-person': filter('person'),
    '#actions-outcome': filter('outcome'),
    '#actions-channel': filter('channel'),
  },
};
