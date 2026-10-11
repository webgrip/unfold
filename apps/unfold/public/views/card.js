import { state, disconnect, onForget } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, renderHtml } from '../core/dom.js';
import { button, callout, emptyState, skeleton } from '../core/ui.js';
import { shell } from '../shell.js';
import '../cards/unfold-card.js';
import { cardMotion, clearEffects, watchCardMoments } from '../cards/effects/unfold.js';

const selector = 'unfold-card.card-page-card';
const path = /^card\/([1-9][0-9]{0,19})$/;
const refreshEvery = 30000;
const view = { id: null, data: null, error: null, loading: false, request: 0, timer: 0, signature: '' };
if (globalThis.document) watchCardMoments(selector);

function stop() {
  clearTimeout(view.timer);
  view.timer = 0;
}

onForget(() => { stop(); Object.assign(view, { id: null, data: null, error: null, loading: false, request: view.request + 1, signature: '' }); });

function hydrate(previous, focusKey) {
  const slot = document.querySelector(selector);
  if (!slot || !view.data) return;
  let element = slot;
  if (previous && previous !== slot && previous.dataset.workItem === slot.dataset.workItem) { slot.replaceWith(previous); element = previous; }
  if (cardMotion() !== 'full') element.setAttribute('motion', 'still');
  else if (element.getAttribute('motion') === 'still') element.removeAttribute('motion');
  if (element.card !== view.data) element.card = view.data;
  if (focusKey) element.restoreFocus(focusKey);
}

function content() {
  if (view.data) return `<section class="card-page" id="card-page" aria-label="${escape(`Card of Work Item ${view.id}`)}"><unfold-card class="card-page-card" data-work-item="${escape(view.id)}"></unfold-card></section>`;
  if (view.loading) return `<div class="card">${skeleton({ rows: 5, variant: 'text' })}</div>`;
  if (view.error?.code === 'cards_facts_unavailable') return `<div class="card">${emptyState({ icon: 'cards', title: 'No card for this Work Item', body: `<p>${escape(view.error.message || 'Ploeg sends no delivery facts, so Unfold cannot assemble its card.')}</p>` })}</div>`;
  return callout({ tone: 'danger', title: 'Could not read this card', body: `<p>${escape(view.error?.message || 'The workbench did not answer.')}</p>` });
}

function renderCard() {
  if (state.view !== 'card') return;
  const previous = document.querySelector(selector);
  const focusKey = previous && document.activeElement === previous ? previous.focusKey : null;
  const title = view.data?.title || `Work Item #${view.id}`;
  const actions = button({ label: `Open Work Item #${view.id}`, icon: 'arrow', variant: 'secondary', href: `#work/${encodeURIComponent(view.id)}` });
  renderHtml(shell(`<div class="card-page-wrap">${content()}</div>`, { title, subtitle: 'The Work Item’s card: its plays, grade and life after merge.', actions, documentTitle: `Card · ${title}`, breadcrumbs: [{ label: 'Binder', href: '#binder' }, { label: `Card #${view.id}` }] }));
  hydrate(previous, focusKey);
}

async function load(fresh = false) {
  const request = ++view.request;
  const id = view.id;
  try {
    const data = (await api(`/api/ploeg/work-items/${encodeURIComponent(id)}/card${fresh ? '?refresh=1' : ''}`)).card ?? null;
    if (request !== view.request) return;
    const next = JSON.stringify(data ?? null, (key, entry) => key === 'fetchedAt' ? undefined : entry);
    view.error = null;
    if (next === view.signature && !view.loading) return;
    view.data = data;
    view.signature = next;
  } catch (error) {
    if (request !== view.request) return;
    if (!view.data) view.error = { code: error.code, message: error.message };
  } finally {
    if (request === view.request) view.loading = false;
  }
  renderCard();
}

function schedule() {
  stop();
  view.timer = setTimeout(async () => {
    if (state.view !== 'card' || !view.id) return;
    if (!document.hidden) await load(true);
    schedule();
  }, refreshEvery);
}

async function enterCard({ id }) {
  disconnect(); state.session = null; state.view = 'card';
  if (view.id !== id) { clearEffects(); Object.assign(view, { id, data: null, error: null, signature: '' }); }
  view.loading = !view.data;
  renderCard();
  await load();
  schedule();
}

/** A Work Item's card on its own page (`#card/<id>`), under Your cards: the full card with its motion, refreshed while open. The Work Item page shows plain figures instead. */
export default {
  id: 'card',
  match: hash => { const found = path.exec(hash); return found ? { id: found[1] } : null; },
  enter: enterCard,
  render: renderCard,
};
