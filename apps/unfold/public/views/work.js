import { workMarkup, askDialogMarkup, contextDialogMarkup, contextErrors, ploegLanes, activePloegLane, mergeOverviews, teamOverview, appendPage, refreshOverview, reviewFacts, cancelDialogMarkup, checkoutDialogMarkup, workItemRef, workRefreshButton, laneBackLabel } from '../ploeg.js';
import { state, onForget } from '../core/state.js';
import { api, unauthorized } from '../core/api.js';
import { $, renderHtml, notify, announce, safeUrl } from '../core/dom.js';
import { buildHash } from '../core/route.js';
import { live } from '../core/live.js';
import { prefs } from '../core/prefs.js';
import { plural } from '../core/format.js';
import { singleKeyAllowed, isTyping } from '../core/keys.js';
import { shell } from '../shell.js';
import { enterPloegView, openPloegDialog } from './ploeg-common.js';
import { stepDialogMarkup, stepOutcome, stepRequest } from '../core/attribution.js';
import '../cards/unfold-card.js';
import { cardMotion, clearEffects, watchCardMoments } from '../cards/effects/unfold.js';

const lanes = ploegLanes.map(lane => lane.id);
const itemPath = /^work\/([1-9][0-9]{0,19})$/;
const runPath = /^[1-9][0-9]{0,19}$/;
const liveInterval = 30000;
const reviewFactLimit = 12;
const runCard = 'unfold-card.work-run-card';
if (globalThis.document) watchCardMoments(runCard);
const work = { team: '', teams: [], loadedTeam: null, listRequest: 0, detailRequest: 0, detailId: null, revealedId: null, pendingRun: null, runNotice: '', loadingMore: false, refreshing: false, cancelBusy: false, cancelResult: null, briefOpen: new Set(), sessionsLoaded: false, listScroll: 0, registered: false, reviewFacts: new Map(), reviewPending: new Set(), paneFrame: 0, stickyObserver: null, savedTeam: false, pickLane: null, card: null, cardRequest: 0, trace: null, traceRequest: 0, traceBusy: false, traceResult: null, context: null, contextRequest: 0, contextBusy: false, contextResult: null, asks: null, askRequest: 0, askBusy: false, askDraft: '' };

onForget(() => Object.assign(work, { team: '', teams: [], loadedTeam: null, listRequest: work.listRequest + 1, detailRequest: work.detailRequest + 1, detailId: null, revealedId: null, pendingRun: null, runNotice: '', loadingMore: false, refreshing: false, cancelBusy: false, cancelResult: null, briefOpen: new Set(), sessionsLoaded: false, listScroll: 0, reviewFacts: new Map(), reviewPending: new Set(), pickLane: null, card: null, cardRequest: work.cardRequest + 1, trace: null, traceRequest: work.traceRequest + 1, traceBusy: false, traceResult: null, context: null, contextRequest: work.contextRequest + 1, contextBusy: false, contextResult: null, asks: null, askRequest: work.askRequest + 1, askBusy: false, askDraft: '' }));

const laneOfState = { needs_human: 'needs_human', awaiting_review: 'awaiting_review', leased: 'leased', queued: 'queued' };
const laneFor = item => laneOfState[item?.state] || 'all';
const canCancel = () => ['operator', 'admin'].includes(state.bootstrap?.user?.role);
const canAddContext = () => Boolean(state.bootstrap?.user?.role) && state.bootstrap.user.role !== 'viewer';

function knownItem(id) {
  if (state.ploegDetail?.item.id === id) return state.ploegDetail.item;
  for (const page of Object.values(state.ploeg?.available ? state.ploeg.lanes || {} : {})) { const found = page.items.find(item => item.id === id); if (found) return found; }
  return null;
}
const visible = () => Boolean(state.bootstrap) && state.view === 'work';
const signature = value => JSON.stringify(value ?? null, (key, entry) => key === 'fetchedAt' ? undefined : entry);

function listHash() {
  return buildHash('work', { lane: state.ploegLane, team: work.team });
}

function model() {
  const detail = state.ploegDetail && state.ploegDetail.item.id === work.detailId ? state.ploegDetail : null;
  return {
    data: state.ploeg,
    lane: activePloegLane(state),
    lanePending: Boolean(work.pickLane) && work.pickLane === work.detailId,
    team: work.team,
    teams: work.teams,
    loading: state.ploegLoading,
    refreshing: work.refreshing,
    loadingMore: work.loadingMore,
    detailId: work.detailId,
    detail,
    detailLoading: state.ploegDetailLoading,
    detailError: state.ploegDetailError || null,
    listHref: `#${listHash()}`,
    canCancel: canCancel(),
    cancelBusy: work.cancelBusy,
    cancelResult: work.cancelResult?.id === work.detailId ? work.cancelResult : null,
    briefOpen: work.briefOpen.has(work.detailId),
    sessions: state.sessions,
    userId: state.bootstrap?.user?.id,
    trackerUrl: state.ploeg?.trackerUrl,
    reviewFacts: Object.fromEntries(work.reviewFacts),
    demoMode: state.bootstrap?.mode === 'demo',
    grafanaUrl: state.bootstrap?.observability?.grafanaUrl,
    runNotice: work.runNotice,
    now: Date.now(),
    card: work.card?.id === work.detailId ? work.card.data : null,
    trace: work.trace?.id === work.detailId ? work.trace.data : null,
    traceBusy: work.traceBusy,
    traceResult: work.traceResult?.id === work.detailId ? work.traceResult : null,
    context: work.context?.id === work.detailId ? work.context.data : null,
    contextBusy: work.contextBusy,
    contextResult: work.contextResult?.id === work.detailId ? work.contextResult : null,
    canAddContext: canAddContext(),
    asks: work.asks?.id === work.detailId ? work.asks.data : null,
    askBusy: work.askBusy,
    askDraft: work.askDraft,
  };
}

function tabTitle(item) {
  const ref = item.provider === 'ploeg' || !String(item.externalId ?? '').trim() ? `#${item.id}` : workItemRef(item);
  return `${ref} ${item.title || `Work Item ${item.id}`} · Work`;
}

function shellOptions(current) {
  const title = 'Work';
  const subtitle = 'Work Items of your Teams by lane. Open one to see why it waits and what to do.';
  const actions = workRefreshButton(current);
  if (!current.detailId) return { title, subtitle, actions };
  const item = current.detail?.item;
  return { title, subtitle, actions, documentTitle: item ? tabTitle(item) : undefined, back: { label: laneBackLabel(current.lanePending ? 'all' : current.lane), href: current.listHref }, breadcrumbs: [{ label: 'Work', href: current.listHref }, { label: item ? workItemRef(item) : `#${current.detailId}` }] };
}

function focusTarget() {
  const active = document.activeElement;
  if (!active || active === document.body || active.id) return null;
  if (active.matches('[data-work-row]')) return `[data-work-row][data-id="${CSS.escape(active.dataset.id)}"]`;
  if (active.dataset.action) return `[data-action="${CSS.escape(active.dataset.action)}"]${active.dataset.id ? `[data-id="${CSS.escape(active.dataset.id)}"]` : ''}`;
  const details = active.closest('details[id]');
  if (active.tagName === 'SUMMARY' && details) return `#${CSS.escape(details.id)} > summary`;
  return null;
}

function renderWork() {
  if (!visible()) return;
  const open = new Map([...document.querySelectorAll('#app details[id]')].map(element => [element.id, element.open]));
  const scroller = $('.work-list-pane .work-list');
  const listTop = scroller ? scroller.scrollTop : 0;
  const target = focusTarget();
  const current = model();
  const previousCard = document.querySelector('unfold-card.work-run-card');
  const cardFocus = previousCard && document.activeElement === previousCard ? previousCard.focusKey : null;
  renderHtml(shell(workMarkup(current), shellOptions(current)));
  hydrateCard(previousCard, cardFocus);
  for (const element of document.querySelectorAll('#app details[id]')) if (open.has(element.id)) element.open = open.get(element.id);
  const list = $('.work-list-pane .work-list');
  if (list && listTop) list.scrollTop = listTop;
  if (target && (!document.activeElement || document.activeElement === document.body)) (document.querySelector(target) || (target.includes('ploeg-refresh') ? $('[data-action="ploeg-refresh"][data-id="toolbar"]') : null))?.focus({ preventScroll: true });
  revealLane();
  syncPane();
  revealSelected();
  observeActions();
}

function revealPendingRun() {
  const runId = work.pendingRun;
  if (!runId || !work.detailId || state.ploegDetail?.item.id !== work.detailId) return;
  work.pendingRun = null;
  if (!(state.ploegDetail.runs || []).some(run => String(run.id) === runId)) {
    work.runNotice = `Run ${runId} is not on this Work Item.`;
    renderWork();
    return;
  }
  const run = document.getElementById(`work-run-${runId}`);
  if (!run) return;
  const more = run.closest('details:not(.work-run)');
  if (more) more.open = true;
  run.open = true;
  run.scrollIntoView({ block: 'start', behavior: motion() });
  run.querySelector('summary')?.focus({ preventScroll: true });
}

function hydrateCard(previous, focusKey) {
  const slot = document.querySelector('unfold-card.work-run-card');
  const data = work.card?.id === work.detailId ? work.card.data : null;
  if (!slot || !data) return;
  let element = slot;
  if (previous && previous !== slot && previous.dataset.workItem === slot.dataset.workItem) { slot.replaceWith(previous); element = previous; }
  if (previous && previous.dataset.workItem !== slot.dataset.workItem) clearEffects();
  if (cardMotion() !== 'full') element.setAttribute('motion', 'still');
  else if (element.getAttribute('motion') === 'still') element.removeAttribute('motion');
  if (element.card !== data) element.card = data;
  if (focusKey) element.restoreFocus(focusKey);
}

function revealLane() {
  const lanes = $('.work-lanes');
  const pressed = lanes?.querySelector('[aria-pressed="true"]');
  if (!pressed || lanes.scrollWidth <= lanes.clientWidth) return;
  const start = pressed.offsetLeft - lanes.offsetLeft;
  if (start < lanes.scrollLeft || start + pressed.offsetWidth > lanes.scrollLeft + lanes.clientWidth) lanes.scrollLeft = Math.max(0, start - (lanes.clientWidth - pressed.offsetWidth) / 2);
}

function syncPane() {
  const pane = $('.work[data-detail] .work-list-pane');
  if (!pane) return;
  if (getComputedStyle(pane).position !== 'sticky') { pane.style.removeProperty('--work-pane-max'); return; }
  const stick = parseFloat(getComputedStyle(pane).top) || 0;
  const top = Math.max(stick, pane.getBoundingClientRect().top);
  pane.style.setProperty('--work-pane-max', `${Math.max(240, Math.floor(innerHeight - top - 16))}px`);
}

function schedulePane() {
  if (work.paneFrame || !visible()) return;
  work.paneFrame = requestAnimationFrame(() => { work.paneFrame = 0; if (visible()) syncPane(); });
}

function revealSelected() {
  if (!work.detailId || work.revealedId === work.detailId) return;
  const scroller = $('.work[data-detail] .work-list-pane > .work-list');
  const row = scroller?.querySelector('[data-work-row][aria-current="true"]');
  if (!row || !scroller.offsetParent) return;
  const id = work.detailId;
  work.revealedId = id;
  if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { if (visible() && work.detailId === id && work.revealedId === id) { work.revealedId = null; revealSelected(); } });
  if (scroller.scrollHeight <= scroller.clientHeight) return;
  const header = row.closest('.work-group')?.querySelector('.work-group-header');
  const offset = header ? header.offsetHeight : 0;
  const top = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  const bottom = top + row.offsetHeight;
  if (top - offset < scroller.scrollTop) scroller.scrollTop = Math.max(0, top - offset - 8);
  else if (bottom > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = bottom - scroller.clientHeight + 8;
}

function observeActions() {
  work.stickyObserver?.disconnect();
  work.stickyObserver = null;
  const bar = $('.work-sticky-actions');
  const primary = $('.work-card-actions .button.primary') || $('#work-decision .button.primary');
  if (!bar || !primary || typeof IntersectionObserver !== 'function') return;
  work.stickyObserver = new IntersectionObserver(entries => { for (const entry of entries) bar.toggleAttribute('data-covered', entry.isIntersecting); }, { rootMargin: '0px 0px -96px 0px' });
  work.stickyObserver.observe(primary);
}

function focusTitle() {
  const title = $('#ploeg-item-title');
  if (!title || !state.ploegDetail) return;
  title.focus({ preventScroll: true });
  if (title.getBoundingClientRect().top < 0) window.scrollTo({ top: 0 });
  announce(`${state.ploegDetail.item.title || `Work Item ${state.ploegDetail.item.id}`}, ${workItemRef(state.ploegDetail.item)}`);
}

function keepFiltersInHash() {
  const id = work.detailId;
  history.replaceState(null, '', `#${buildHash(id ? `work/${id}` : 'work', { lane: state.ploegLane, team: work.team })}`);
}

async function readTeam(team, refresh) {
  return api(`/api/ploeg?${new URLSearchParams({ team, ...refresh })}`).then(data => ({ team, data }), error => ({ team, error }));
}

async function readOverview(team, fresh) {
  const refresh = fresh ? { refresh: '1' } : {};
  if (team) return teamOverview(await api(`/api/ploeg?${new URLSearchParams({ team, ...refresh })}`));
  if (work.teams.length > 1) {
    const results = await Promise.all(work.teams.map(id => readTeam(id, refresh)));
    if (!results.every(result => result.error)) return mergeOverviews(results);
    work.teams = [];
  }
  const first = await api(`/api/ploeg?${new URLSearchParams(refresh)}`);
  if (!first.available || first.teams.length < 2) return teamOverview(first);
  const others = first.teams.map(entry => entry.id).filter(id => id !== first.selectedTeam);
  const rest = await Promise.all(others.map(id => readTeam(id, refresh)));
  return mergeOverviews([{ team: first.selectedTeam, data: first }, ...rest]);
}

async function loadOverview({ fresh = false, quiet = false, spinner = false } = {}) {
  const request = ++work.listRequest;
  const team = work.team;
  let changed = !quiet || spinner;
  if (spinner) work.refreshing = true;
  if (!quiet) { state.ploegLoading = true; if (work.loadedTeam !== team) state.ploeg = null; }
  if (changed) renderWork();
  try {
    let data = await readOverview(team, fresh);
    if (request !== work.listRequest || !visible()) return;
    if (work.loadedTeam === team) data = refreshOverview(state.ploeg, data);
    if (signature(data) !== signature(state.ploeg)) changed = true;
    state.ploeg = data;
    work.loadedTeam = team;
    if (data.available) {
      if (data.teams?.length) work.teams = data.teams.map(entry => entry.id);
      live.touch('work');
      void loadReviewFacts();
    }
  } catch (error) {
    if (request !== work.listRequest || !state.bootstrap) return;
    if (error.code === 'ploeg_not_found' && team) {
      if (prefs.get('team') === team) prefs.set('team', null);
      work.team = '';
      keepFiltersInHash();
      notify(work.savedTeam ? 'The Team saved in this browser is not available to your account. Showing all Teams.' : `Team ${team} is not available to your account. Showing all Teams.`, true);
      state.ploegLoading = false; work.refreshing = false;
      return loadOverview({ fresh });
    }
    if (quiet && state.ploeg?.available) throw error;
    changed = true;
    state.ploeg = { configured: error.code !== 'ploeg_unconfigured', available: false, demo: false, teams: [], message: error.message };
    work.loadedTeam = team;
    if (quiet) throw error;
  } finally {
    if (request === work.listRequest) { state.ploegLoading = false; work.refreshing = false; if (changed) renderWork(); }
  }
}

async function loadReviewFacts() {
  const page = state.ploeg?.available ? state.ploeg.lanes?.awaiting_review : null;
  if (!page || activePloegLane(state) !== 'awaiting_review') return;
  const wanted = page.items.slice(0, reviewFactLimit).filter(item => work.reviewFacts.get(item.id)?.updatedAt !== item.updatedAt && !work.reviewPending.has(item.id));
  if (!wanted.length) return;
  for (const item of wanted) work.reviewPending.add(item.id);
  const results = await Promise.all(wanted.map(item => api(`/api/ploeg/work-items/${encodeURIComponent(item.id)}`).then(detail => [item.id, reviewFacts(detail)], () => [item.id, null])));
  for (const [id, facts] of results) { work.reviewPending.delete(id); if (facts) work.reviewFacts.set(id, facts); }
  if (visible() && results.some(([, facts]) => facts)) renderWork();
}

async function ensureSessions() {
  if (work.sessionsLoaded) return;
  work.sessionsLoaded = true;
  try {
    const sessions = await api('/api/sessions');
    state.sessions = sessions;
    if (visible() && work.detailId && sessions.some(session => session.execution?.workItemId === work.detailId)) renderWork();
  } catch { work.sessionsLoaded = false; }
}

async function loadCard(id, { fresh = false } = {}) {
  const request = ++work.cardRequest;
  let card = null;
  try { card = (await api(`/api/ploeg/work-items/${encodeURIComponent(id)}/card${fresh ? '?refresh=1' : ''}`)).card ?? null; }
  catch { if (work.card?.id === id && work.card.data) return; }
  if (request !== work.cardRequest || work.detailId !== id) return;
  const next = signature(card);
  if (work.card?.id === id && work.card.signature === next) return;
  work.card = { id, data: card, signature: next };
  if (visible() && !state.ploegDetailLoading) renderWork();
}

async function loadTrace(id, { fresh = false } = {}) {
  const request = ++work.traceRequest;
  const query = fresh ? '?refresh=1' : '';
  const base = `/api/ploeg/work-items/${encodeURIComponent(id)}`;
  const [cracks, candidates] = await Promise.all([api(`${base}/cracks${query}`).catch(() => null), api(`${base}/crack-candidates${query}`).catch(() => null)]);
  if (request !== work.traceRequest || work.detailId !== id) return;
  const data = cracks ? { workItemId: id, cracks: cracks.cracks, viewer: cracks.viewer, demo: cracks.demo, candidates: candidates?.crackCandidates ?? null } : null;
  if (!data && work.trace?.id === id && work.trace.data) return;
  const next = signature(data);
  if (work.trace?.id === id && work.trace.signature === next) return;
  work.trace = { id, data, signature: next };
  if (visible() && !state.ploegDetailLoading) renderWork();
}

async function loadContext(id, { fresh = false } = {}) {
  const request = ++work.contextRequest;
  let data;
  try {
    const result = await api(`/api/ploeg/work-items/${encodeURIComponent(id)}/context${fresh ? '?refresh=1' : ''}`);
    data = { items: result.context, demo: result.demo, error: '' };
  } catch (error) {
    if (work.context?.id === id && work.context.data && !work.context.data.error) return;
    data = { items: [], demo: false, error: error.message || 'Ploeg did not list the context files.' };
  }
  if (request !== work.contextRequest || work.detailId !== id) return;
  const next = signature(data);
  if (work.context?.id === id && work.context.signature === next) return;
  work.context = { id, data, signature: next };
  if (visible() && !state.ploegDetailLoading) renderWork();
}

async function loadAsks(id) {
  const request = ++work.askRequest;
  let data;
  try {
    const result = await api(`/api/ploeg/work-items/${encodeURIComponent(id)}/asks`);
    data = { items: result.asks, demo: result.asks.some(ask => ask.demo) || state.bootstrap?.mode === 'demo', error: '' };
  } catch (error) {
    if (work.asks?.id === id && work.asks.data && !work.asks.data.error) return;
    data = { items: [], demo: false, error: error.message || 'Unfold could not list the Asks.' };
  }
  if (request !== work.askRequest || work.detailId !== id) return;
  const next = signature(data);
  if (work.asks?.id === id && work.asks.signature === next) return;
  work.asks = { id, data, signature: next };
  if (visible() && !state.ploegDetailLoading) renderWork();
}

function openAsk() {
  const detail = state.ploegDetail;
  if (!detail || detail.item.id !== work.detailId || work.askBusy) return;
  const dialog = openPloegDialog(askDialogMarkup(detail));
  dialog.querySelector('#work-ask-question')?.focus();
  dialog.addEventListener('close', () => { if (!work.askBusy) $('[data-action="work-ask-open"]')?.focus(); }, { once: true });
}

async function submitAsk(data, form) {
  const id = form.dataset.id;
  const question = String(data.question ?? '').trim();
  const error = form.querySelector('[data-error-for="question"]');
  const field = form.querySelector('[name="question"]');
  if (error) { error.hidden = true; error.textContent = ''; }
  field?.removeAttribute('aria-invalid');
  if (!question || question.length > 2000) {
    if (error) { error.textContent = question ? 'Keep the question under 2000 characters.' : 'Type a question.'; error.hidden = false; }
    field?.setAttribute('aria-invalid', 'true');
    field?.focus();
    return;
  }
  if (!id || id !== work.detailId || work.askBusy) return;
  form.closest('dialog')?.close();
  work.askBusy = true;
  work.askDraft = question;
  renderWork();
  try {
    const ask = await api(`/api/ploeg/work-items/${encodeURIComponent(id)}/asks`, { method: 'POST', body: JSON.stringify({ question }) });
    work.askDraft = '';
    announce(ask.status === 'answered' ? 'Answered.' : ask.failure || 'No answer.');
  } catch (failure) {
    notify(failure.message, true);
  } finally {
    work.askBusy = false;
    if (visible() && work.detailId === id) {
      await loadAsks(id);
      renderWork();
      $('#work-ask-list')?.focus();
    }
  }
}

function openContext() {
  const detail = state.ploegDetail;
  if (!detail || detail.item.id !== work.detailId || work.contextBusy) return;
  const dialog = openPloegDialog(contextDialogMarkup(detail));
  dialog.querySelector('#work-context-file')?.focus();
  dialog.addEventListener('close', () => { if (!work.contextBusy) $('[data-action="work-context-add"]')?.focus(); }, { once: true });
}

async function submitContext(data, form) {
  const id = form.dataset.id;
  const file = data.file && typeof data.file === 'object' ? data.file : null;
  const note = String(data.note ?? '').trim();
  const errors = contextErrors(file, note);
  for (const element of form.querySelectorAll('[data-error-for]')) { element.hidden = true; element.textContent = ''; }
  for (const element of form.querySelectorAll('[aria-invalid]')) element.removeAttribute('aria-invalid');
  const invalid = Object.keys(errors);
  if (invalid.length) {
    for (const key of invalid) {
      const element = form.querySelector(`[data-error-for="${CSS.escape(key)}"]`);
      if (element) { element.textContent = errors[key]; element.hidden = false; }
      form.querySelector(`[name="${CSS.escape(key)}"]`)?.setAttribute('aria-invalid', 'true');
    }
    form.querySelector(`[name="${CSS.escape(invalid[0])}"]`)?.focus();
    return;
  }
  if (!id || id !== work.detailId) return;
  form.closest('dialog')?.close();
  work.contextBusy = true;
  work.contextResult = null;
  renderWork();
  try {
    const query = new URLSearchParams({ name: file.name, ...(note ? { note } : {}) });
    const response = await fetch(`/api/ploeg/work-items/${encodeURIComponent(id)}/context?${query}`, { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream', 'X-Unfold-Request': '1' }, credentials: 'same-origin' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) unauthorized();
      throw new Error(result.error?.message || 'Ploeg did not store the file.');
    }
    work.contextResult = result.created
      ? { id, tone: 'success', title: 'Context added', text: `Ploeg stored ${result.context?.name || file.name}. The next Run that starts on this Work Item gets it.` }
      : { id, tone: 'neutral', title: 'Already attached', text: `Ploeg already holds this file for this Work Item, so nothing changed.` };
    notify(work.contextResult.title);
  } catch (error) {
    work.contextResult = { id, tone: 'danger', title: 'Ploeg did not store the file', text: error.message };
  } finally {
    work.contextBusy = false;
    if (visible() && work.detailId === id) {
      await loadContext(id, { fresh: true });
      renderWork();
      $('#work-context-result')?.focus();
    }
  }
}

async function loadDetail(id, { fresh = false, quiet = false } = {}) {
  void loadCard(id, { fresh });
  void loadContext(id, { fresh });
  void loadAsks(id);
  void loadTrace(id, { fresh });
  const request = ++work.detailRequest;
  let changed = !quiet;
  if (!quiet) { state.ploegDetailLoading = true; state.ploegDetailError = ''; if (state.ploegDetail?.item.id !== id) state.ploegDetail = null; renderWork(); }
  try {
    const detail = await api(`/api/ploeg/work-items/${encodeURIComponent(id)}${fresh ? '?refresh=1' : ''}`);
    if (request !== work.detailRequest || !visible() || work.detailId !== id) return;
    if (signature(detail) !== signature(state.ploegDetail)) changed = true;
    if (!quiet) work.revealedId = null;
    state.ploegDetail = detail;
    state.ploegDetailError = '';
    if (work.pickLane === id) { work.pickLane = null; state.ploegLane = laneFor(detail.item); keepFiltersInHash(); changed = true; void loadReviewFacts(); }
    if (detail.item.state === 'awaiting_review') work.reviewFacts.set(id, reviewFacts(detail));
  } catch (error) {
    if (request !== work.detailRequest || !visible() || work.detailId !== id) return;
    if (quiet && state.ploegDetail?.item.id === id) throw error;
    changed = true;
    if (work.pickLane === id) work.pickLane = null;
    state.ploegDetail = null;
    state.ploegDetailError = { message: error.message, code: error.code || '' };
    if (quiet) throw error;
  } finally {
    if (request === work.detailRequest && visible() && work.detailId === id) {
      state.ploegDetailLoading = false;
      if (changed) renderWork();
      if (!quiet && state.ploegDetail) {
        focusTitle();
        void ensureSessions();
      }
    }
  }
}

async function refreshQuietly() {
  if (!visible() || work.cancelBusy) return;
  await Promise.all([loadOverview({ quiet: true }), work.detailId ? loadDetail(work.detailId, { quiet: true }) : null]);
}

function registerLive() {
  if (work.registered) return;
  work.registered = true;
  live.register('work', { interval: liveInterval, refresh: refreshQuietly });
  addEventListener('scroll', schedulePane, { passive: true });
  addEventListener('resize', schedulePane, { passive: true });
}

function teamFromQuery(query) {
  work.savedTeam = !Object.hasOwn(query, 'team');
  return work.savedTeam ? prefs.get('team') || '' : query.team || '';
}

async function enterWork({ id, query = {} } = {}) {
  const within = state.view === 'work';
  const previous = within ? work.detailId : null;
  enterPloegView('work');
  registerLive();
  work.pickLane = null;
  let chosen = false;
  if (lanes.includes(query.lane)) state.ploegLane = query.lane;
  else if (id) { const known = knownItem(id); if (known) { state.ploegLane = laneFor(known); chosen = true; } else work.pickLane = id; }
  else if (!within) state.ploegLane = null;
  const team = teamFromQuery(query);
  const teamChanged = team !== work.team;
  work.team = team;
  if (!previous && id) work.listScroll = window.scrollY;
  work.detailId = id || null;
  work.pendingRun = id && runPath.test(String(query.run ?? '')) ? String(query.run) : null;
  work.runNotice = '';
  if (chosen) keepFiltersInHash();
  if (!id) { state.ploegDetailLoading = false; state.ploegDetailError = ''; work.revealedId = null; }
  const listReady = within && !teamChanged && state.ploeg && work.loadedTeam === team;
  const detailReady = id && previous === id && state.ploegDetail?.item.id === id && !state.ploegDetailError;
  const loads = [];
  if (!listReady) loads.push(loadOverview());
  if (id && !detailReady) loads.push(loadDetail(id));
  if (!loads.length) {
    renderWork();
    if (id) focusTitle();
    else if (previous) restoreListPosition(previous);
    revealPendingRun();
    void loadReviewFacts();
    return;
  }
  await Promise.all(loads);
  if (!id && previous) restoreListPosition(previous);
  else if (id) revealPendingRun();
}

function restoreListPosition(id) {
  if (!visible()) return;
  window.scrollTo({ top: work.listScroll || 0 });
  document.querySelector(`[data-work-row][data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
}

function selectLane(button) {
  if (!lanes.includes(button.dataset.id)) return;
  state.ploegLane = button.dataset.id;
  keepFiltersInHash();
  renderWork();
  const page = state.ploeg?.available ? state.ploeg.lanes?.[button.dataset.id] : null;
  const total = page ? `, ${plural(page.items.length, 'Work Item')}${page.partial || state.ploeg.errors?.length ? ' loaded' : ''}` : '';
  announce(`${ploegLanes.find(lane => lane.id === button.dataset.id).label}${total}`);
  void loadReviewFacts();
}

function changeTeam(select) {
  const team = select.value || '';
  prefs.set('team', team || null);
  work.team = team;
  work.savedTeam = false;
  keepFiltersInHash();
  void loadOverview();
}

async function loadMore() {
  const lane = activePloegLane(state);
  const team = work.team;
  const page = state.ploeg?.lanes?.[lane];
  if (work.loadingMore || !page?.partial) return;
  work.loadingMore = true;
  renderWork();
  try {
    const pages = await Promise.all(Object.entries(page.cursors).map(([owner, after]) => api(`/api/ploeg/work-items?${new URLSearchParams({ team: owner, state: lane, after })}`).then(result => [owner, result])));
    const current = state.ploeg;
    if (!visible() || work.loadedTeam !== team || !current?.lanes?.[lane]) return;
    let next = current.lanes[lane];
    for (const [owner, result] of pages) next = appendPage(next, owner, result);
    current.lanes[lane] = next;
  } catch (error) { if (state.bootstrap) notify(error.message, true); }
  finally { work.loadingMore = false; renderWork(); }
}

function closeDetail() {
  location.hash = listHash();
}

async function copyLink(button) {
  const url = `${location.origin}${location.pathname}#work/${button.dataset.id}`;
  try { await navigator.clipboard.writeText(url); notify('Link copied'); }
  catch { notify(`Copy did not work. The link is ${url}`, true); }
}

async function copyRunLink(button) {
  const workItem = button.dataset.workItem || work.detailId;
  const runId = button.dataset.id;
  if (!workItem || !runId) return;
  const url = `${location.origin}${location.pathname}#work/${workItem}?run=${encodeURIComponent(runId)}`;
  try { await navigator.clipboard.writeText(url); notify('Link copied'); }
  catch { notify(`Copy did not work. The link is ${url}`, true); }
}

async function copyRef(button) {
  const value = button.dataset.value || '';
  if (!value) return;
  try { await navigator.clipboard.writeText(value); notify(`Copied ${value}`); }
  catch { notify(`Copy did not work. The task is ${value}`, true); }
}

function openCheckout() {
  const detail = state.ploegDetail;
  const markup = detail ? checkoutDialogMarkup(detail, work.card?.id === work.detailId ? work.card.data : null, { origin: location.origin }) : '';
  if (!markup) return;
  const dialog = $('#confirm-dialog');
  const previousClass = dialog.className;
  dialog.className = 'dialog work-checkout-dialog';
  dialog.innerHTML = markup;
  dialog.addEventListener('close', () => { dialog.className = previousClass; $('[data-action="work-checkout"]')?.focus(); }, { once: true });
  dialog.showModal();
}

async function copyCommand(button) {
  const value = button.dataset.value || '';
  if (!value) return;
  try { await navigator.clipboard.writeText(value); notify('Command copied'); }
  catch { notify(`Copy did not work. The command is ${value}`, true); }
}

function openCancel() {
  const detail = state.ploegDetail;
  if (!detail || !canCancel()) return;
  const dialog = $('#confirm-dialog');
  const previousClass = dialog.className;
  const demo = Boolean(detail.demo || state.bootstrap?.mode === 'demo');
  dialog.className = 'dialog work-cancel-dialog';
  dialog.innerHTML = cancelDialogMarkup(detail, { demo });
  dialog.returnValue = '';
  dialog.addEventListener('close', () => {
    dialog.className = previousClass;
    if (dialog.returnValue === 'cancel' && !demo) void submitCancel(detail.item.id);
    else $('[data-action="work-cancel"]')?.focus();
  }, { once: true });
  dialog.showModal();
}

async function submitCancel(id) {
  work.cancelBusy = true;
  work.cancelResult = null;
  renderWork();
  try {
    const result = await api(`/api/ploeg/work-items/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' });
    work.cancelResult = { id, ...result };
    notify(result.withdrawn ? 'Cancelled. Ploeg withdrew the Work Item.' : 'Ploeg answered the cancel.');
  } catch (error) {
    work.cancelResult = { id, error: error.message };
    notify(error.message, true);
  } finally {
    work.cancelBusy = false;
    if (visible() && work.detailId === id) {
      await Promise.all([loadOverview({ fresh: true, quiet: true }).catch(() => {}), loadDetail(id, { fresh: true, quiet: true }).catch(() => {})]);
      renderWork();
      $('#work-cancel-result')?.focus();
    }
  }
}

function traceData() {
  return work.trace?.id === work.detailId ? work.trace.data : null;
}

function openTraceStep(step, target, bug) {
  const trace = traceData();
  if (!trace || !target) return;
  openPloegDialog(stepDialogMarkup(step, target, { bug, viewer: trace.viewer, demo: trace.demo }));
}

function traceBug() {
  const item = state.ploegDetail?.item;
  return item && item.id === work.detailId ? { workItemId: item.id, title: item.title || `Work Item ${item.id}` } : null;
}

function openPropose(button) {
  const candidate = traceData()?.candidates?.candidates.find(entry => entry.card.workItemId === button.dataset.card);
  openTraceStep('propose', candidate, traceBug());
}

function openEvolved(button) {
  const trace = traceData();
  if (!trace) return;
  const crack = trace.cracks.find(entry => entry.id === button.dataset.crack);
  const candidate = trace.candidates?.candidates.find(entry => entry.card.workItemId === button.dataset.card);
  const bug = crack ? crack.bug : traceBug();
  const title = crack?.card.title || candidate?.card.title || '';
  openTraceStep('evolved', { card: button.dataset.card, bug: button.dataset.bug, crack: button.dataset.crack, title }, bug ? { workItemId: bug.workItemId, title: bug.title } : null);
}

function openCrackStep(step) {
  return button => {
    const crack = traceData()?.cracks.find(entry => entry.id === button.dataset.id);
    openTraceStep(step, crack, crack ? { workItemId: crack.bug.workItemId, title: crack.bug.title } : null);
  };
}

async function submitTraceStep(data, form) {
  const step = form.dataset.step;
  const { body, errors } = stepRequest(step, data);
  for (const element of form.querySelectorAll('[data-error-for]')) { element.hidden = true; element.textContent = ''; }
  for (const element of form.querySelectorAll('[aria-invalid]')) element.removeAttribute('aria-invalid');
  const invalid = Object.keys(errors);
  if (invalid.length) {
    for (const key of invalid) {
      const element = form.querySelector(`[data-error-for="${CSS.escape(key)}"]`);
      if (element) { element.textContent = errors[key]; element.hidden = false; }
      for (const control of form.querySelectorAll(`[name="${CSS.escape(key)}"]`)) control.setAttribute('aria-invalid', 'true');
    }
    form.querySelector(`[name="${CSS.escape(invalid[0])}"]`)?.focus();
    return;
  }
  const id = work.detailId;
  if (!id) return;
  let path;
  if (step === 'propose') path = `/api/ploeg/work-items/${encodeURIComponent(form.dataset.bug || id)}/cracks`;
  else if (step === 'evolved') path = `/api/ploeg/work-items/${encodeURIComponent(form.dataset.bug || id)}/evolved`;
  else path = `/api/ploeg/work-items/${encodeURIComponent(id)}/cracks/${encodeURIComponent(form.dataset.id)}/${step}`;
  if (step === 'propose' || step === 'evolved') body.card = form.dataset.id;
  form.closest('dialog')?.close();
  work.traceBusy = true;
  work.traceResult = null;
  renderWork();
  try {
    const result = await api(path, { method: 'POST', body: JSON.stringify(body) });
    work.traceResult = { id, ...stepOutcome(step, result) };
    notify(work.traceResult.title);
  } catch (error) {
    work.traceResult = { id, tone: 'danger', title: 'Ploeg did not record this step', text: error.message };
    notify(error.message, true);
  } finally {
    work.traceBusy = false;
    if (visible() && work.detailId === id) {
      await Promise.all([loadTrace(id, { fresh: true }), loadCard(id, { fresh: true })]);
      renderWork();
      $('#work-trace-result')?.focus();
    }
  }
}

function toggleBrief() {
  const id = work.detailId;
  if (!id) return;
  if (work.briefOpen.has(id)) work.briefOpen.delete(id); else work.briefOpen.add(id);
  renderWork();
  $('[data-action="work-brief"]')?.focus();
}

function motion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function jumpToRun(button) {
  const run = document.getElementById(`work-run-${button.dataset.id}`);
  if (!run) return;
  const more = run.closest('details:not(.work-run)');
  if (more) more.open = true;
  run.open = true;
  run.scrollIntoView({ block: 'start', behavior: motion() });
  run.querySelector('summary')?.focus({ preventScroll: true });
}

function jumpToSection(button) {
  const section = document.getElementById(button.dataset.id);
  if (!section) return;
  section.setAttribute('tabindex', '-1');
  section.scrollIntoView({ block: 'start', behavior: motion() });
  section.focus({ preventScroll: true });
}

function openLinkOut() {
  const detail = state.ploegDetail;
  if (!detail || detail.item.id !== work.detailId) return false;
  const link = document.querySelector('.work-detail [data-link-out="pr"][href]') || document.querySelector('.work-detail [data-link-out="tracker"][href]');
  const url = link && safeUrl(link.href);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

function moveRow(step) {
  const rows = [...document.querySelectorAll('.work-list-pane [data-work-row]')];
  if (!rows.length) return false;
  const current = rows.indexOf(document.activeElement);
  const selected = rows.findIndex(row => row.getAttribute('aria-current') === 'true');
  const from = current !== -1 ? current : selected;
  const next = from === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, from + step));
  rows[next].focus();
  rows[next].scrollIntoView({ block: 'nearest' });
  return true;
}

function workKeys(event) {
  if (state.view !== 'work' || event.defaultPrevented) return false;
  if (event.key === 'Escape') {
    if (!work.detailId || document.querySelector('dialog[open]') || document.querySelector('.app-user-menu:not([hidden])') || isTyping(event.target)) return false;
    event.preventDefault();
    closeDetail();
    return true;
  }
  if (!['j', 'k', 'o'].includes(event.key) || !singleKeyAllowed(event)) return false;
  if (event.key === 'o') { if (!openLinkOut()) return false; event.preventDefault(); return true; }
  if (!moveRow(event.key === 'j' ? 1 : -1)) return false;
  event.preventDefault();
  return true;
}

/**
 * Work: the Work Items of one Team or all Teams by lane (`#work?lane=&team=`, the Team remembered per browser),
 * and one Work Item's decision, evidence and history (`#work/<id>`), beside the list on wide screens. Refreshes
 * every 30 s while on screen without dropping pages loaded with Load more. `j`/`k` move between rows, `o` opens
 * the pull request or tracker task, Esc closes.
 */
export default {
  id: 'work',
  match: hash => { if (hash === 'work') return {}; const item = itemPath.exec(hash); return item ? { id: item[1] } : null; },
  enter: enterWork,
  render: renderWork,
  actions: {
    'ploeg-refresh': () => state.ploegLoading || work.refreshing ? null : Promise.all([loadOverview({ fresh: true, quiet: Boolean(state.ploeg?.available), spinner: true }).catch(error => notify(error.message, true)), work.detailId ? loadDetail(work.detailId, { fresh: true, quiet: Boolean(state.ploegDetail) }).catch(error => notify(error.message, true)) : null]),
    'ploeg-close': () => closeDetail(),
    'ploeg-lane': selectLane,
    'ploeg-more': () => loadMore(),
    'work-detail-retry': () => work.detailId && loadDetail(work.detailId, { fresh: true }),
    'work-copy-link': copyLink,
    'work-copy-run': copyRunLink,
    'work-copy-ref': copyRef,
    'work-checkout': () => openCheckout(),
    'work-copy-command': copyCommand,
    'work-cancel': () => work.cancelBusy ? null : openCancel(),
    'work-brief': () => toggleBrief(),
    'work-run': jumpToRun,
    'work-section': jumpToSection,
    'work-context-add': () => openContext(),
    'work-ask-open': () => openAsk(),
    'trace-propose': openPropose,
    'trace-evolved': openEvolved,
    'trace-confirm': openCrackStep('confirm'),
    'trace-dispute': openCrackStep('dispute'),
    'trace-resolve': openCrackStep('resolve'),
  },
  forms: { 'trace-step': submitTraceStep, 'work-context': submitContext, 'work-ask': submitAsk },
  changes: {
    '#ploeg-team': changeTeam,
  },
  keys: [workKeys],
};
