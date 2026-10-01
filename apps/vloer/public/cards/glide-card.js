import { icon } from '../core/icons.js';
import { cardView, cardTabs, finishLadder } from './card-model.js';
import { defaultSkin, loadSkin, requiredSlots, resolveSkin } from './registry.js';

const runtimeStylesheet = '/cards/glide-card.css';
const tabIds = cardTabs.map(tab => tab.id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const safeLink = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; } };
const slotLabels = { title: 'Work Item', state: 'State', cost: 'Cost', steward: 'Steward', ids: 'Ids' };
const slotValue = (view, slot) => ({ title: view.title, state: view.state.label, cost: view.cost.text, steward: view.steward.text, ids: view.ids.join(' · ') }[slot]);
const Base = globalThis.HTMLElement ?? class {};

/** What a skin's `render(view, helpers)` receives besides the view model. Skins escape every value with `escape`. */
export const skinHelpers = Object.freeze({ escape: escapeHtml, icon, link: safeLink });

function stylesheet(href) {
  const element = document.createElement('link');
  element.rel = 'stylesheet';
  element.href = href;
  element.loaded = new Promise(resolve => { element.addEventListener('load', resolve, { once: true }); element.addEventListener('error', resolve, { once: true }); });
  return element;
}

function parse(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  return template.content;
}

/**
 * `<glide-card>`: renders one Run card in a shadow root with the skin its Work Target chose, falling back to Vloer
 * Native. Set the card object (`GET /api/ploeg/work-items/:id/card` → `card`) on the `card` property. The `face`
 * (`front` or `back`) and `tab` attributes hold the view and are reflected; every change fires `glide-card-change`
 * with `{ face, tab }`. "More info" turns the card, Escape turns it back, and the back's tabs follow the ARIA tabs
 * pattern. The turn is a 3D flip that becomes a crossfade when the reader prefers reduced motion. Whatever a skin
 * draws, the front always carries the title, state, cost, steward and ids.
 */
export class GlideCard extends Base {
  static get observedAttributes() { return ['face', 'tab']; }

  #card = null;
  #view = null;
  #ticket = 0;
  #root;
  #stage = null;
  #links = null;
  #focus = null;
  #detach = null;
  #skin = null;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.addEventListener('click', event => this.#click(event));
    this.#root.addEventListener('keydown', event => this.#key(event));
  }

  get card() { return this.#card; }
  set card(value) { this.#card = value && typeof value === 'object' ? value : null; void this.#update(); }

  get face() { return this.getAttribute('face') === 'back' ? 'back' : 'front'; }
  set face(value) { this.setAttribute('face', value === 'back' ? 'back' : 'front'); }

  get tab() { const value = this.getAttribute('tab'); return tabIds.includes(value) ? value : tabIds[0]; }
  set tab(value) { this.setAttribute('tab', tabIds.includes(value) ? value : tabIds[0]); }

  /** The control that has focus inside the card, as a key `restoreFocus` understands; null when focus is elsewhere. */
  get focusKey() { return this.#root.activeElement?.dataset?.cardKey ?? null; }

  /** Focuses the control `focusKey` named, once the card has drawn. */
  restoreFocus(key) {
    if (!key) return;
    const target = this.#stage?.querySelector(`[data-card-key="${CSS.escape(key)}"]`);
    if (target) target.focus({ preventScroll: true });
    else this.#focus = key;
  }

  connectedCallback() {
    if (this.#card && !this.#view) void this.#update();
    else if (this.#stage && !this.#stage.hidden) this.#startSkin();
  }

  disconnectedCallback() { this.#stopSkin(); }

  #startSkin() {
    this.#stopSkin();
    const front = this.#stage?.querySelector('.gc-front');
    if (!front || typeof this.#skin?.attach !== 'function') return;
    try { this.#detach = this.#skin.attach(front) ?? null; } catch { this.#detach = null; }
  }

  #stopSkin() {
    const detach = this.#detach;
    this.#detach = null;
    try { detach?.(); } catch { this.#detach = null; }
  }

  attributeChangedCallback(name, previous, value) {
    if (previous === value || !this.#stage) return;
    if (name === 'face') this.#applyFace();
    else this.#applyTab();
  }

  async #update() {
    const ticket = ++this.#ticket;
    const card = this.#card;
    if (!card) { this.#stopSkin(); this.#view = null; this.#stage = null; this.#root.replaceChildren(); return; }
    let skin = null;
    try { skin = await loadSkin(resolveSkin(card.style)); }
    catch { try { skin = await loadSkin(defaultSkin); } catch { skin = null; } }
    if (ticket !== this.#ticket) return;
    const view = cardView(card);
    if (!(skin?.manifest?.finishes ?? []).includes(view.finish.key)) view.finish = finishLadder[0];
    this.#view = view;
    await this.#paint(skin, ticket);
  }

  async #paint(skin, ticket) {
    const view = this.#view;
    const links = this.#links ?? { base: stylesheet(runtimeStylesheet), skin: null };
    const skinHref = skin?.stylesheet ?? '';
    if (links.skin?.getAttribute('href') !== skinHref) { links.skin?.remove(); links.skin = skinHref ? stylesheet(skinHref) : null; }
    this.#links = links;
    const stage = document.createElement('div');
    stage.className = 'gc';
    stage.hidden = true;
    if (view.demo) stage.dataset.demo = '';
    stage.dataset.state = view.state.key;
    const inner = document.createElement('div');
    inner.className = 'gc-inner';
    const faces = { front: document.createElement('div'), back: document.createElement('div') };
    for (const [face, element] of Object.entries(faces)) {
      element.className = `gc-face gc-${face}`;
      element.dataset.face = face;
      let markup = '';
      try { markup = skin ? skin.render(view, { face, ...skinHelpers }) : ''; } catch { markup = ''; }
      element.append(parse(markup));
      inner.append(element);
    }
    this.#requireSlots(faces.front, view);
    this.#requireFlip(faces.front, 'front');
    this.#requireFlip(faces.back, 'back');
    this.#requireTabs(faces.back);
    stage.append(inner);
    this.#stopSkin();
    this.#root.replaceChildren(...[links.base, links.skin].filter(Boolean), stage);
    this.#stage = stage;
    this.#applyFace({ focus: false });
    this.#applyTab();
    await Promise.all([links.base.loaded, links.skin?.loaded]);
    if (ticket !== this.#ticket) return;
    stage.hidden = false;
    this.#skin = skin;
    if (this.isConnected) this.#startSkin();
    if (this.#focus) { const key = this.#focus; this.#focus = null; this.restoreFocus(key); }
  }

  #requireSlots(front, view) {
    const missing = requiredSlots.filter(slot => !front.querySelector(`[data-slot="${slot}"]`));
    if (!missing.length) return;
    front.append(parse(`<dl class="gc-required">${missing.map(slot => `<div data-slot="${slot}"><dt>${escapeHtml(slotLabels[slot])}</dt><dd>${escapeHtml(slotValue(view, slot))}</dd></div>`).join('')}</dl>`));
  }

  #requireFlip(face, side) {
    if (!face.querySelector('[data-card-action="flip"]')) face.append(parse(`<button type="button" class="gc-flip" data-card-action="flip">${side === 'front' ? 'More info' : 'Show the front'}</button>`));
    for (const button of face.querySelectorAll('[data-card-action="flip"]')) {
      button.dataset.cardKey = `flip-${side}`;
      if (side === 'front') button.setAttribute('aria-expanded', 'false');
    }
    const heading = face.querySelector('[data-card-focus]');
    if (heading) { heading.dataset.cardKey = `heading-${side}`; if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1'); }
  }

  #requireTabs(back) {
    for (const tab of back.querySelectorAll('[data-card-tab]')) tab.dataset.cardKey = `tab-${tab.dataset.cardTab}`;
  }

  #applyFace({ focus = true } = {}) {
    const stage = this.#stage;
    if (!stage) return;
    const face = this.face;
    stage.dataset.face = face;
    for (const element of stage.querySelectorAll('.gc-face')) {
      const hidden = element.dataset.face !== face;
      element.inert = hidden;
      if (hidden) element.setAttribute('aria-hidden', 'true');
      else element.removeAttribute('aria-hidden');
    }
    for (const button of stage.querySelectorAll('.gc-front [data-card-action="flip"]')) button.setAttribute('aria-expanded', String(face === 'back'));
    if (!focus) return;
    const target = face === 'back' ? stage.querySelector('.gc-back [data-card-focus]') || stage.querySelector('.gc-back [data-card-tab][aria-selected="true"]') : stage.querySelector('.gc-front [data-card-action="flip"]');
    target?.focus({ preventScroll: true });
  }

  #applyTab() {
    const stage = this.#stage;
    if (!stage) return;
    const tab = this.tab;
    for (const button of stage.querySelectorAll('[data-card-tab]')) {
      const selected = button.dataset.cardTab === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    for (const panel of stage.querySelectorAll('[data-card-panel]')) panel.hidden = panel.dataset.cardPanel !== tab;
  }

  #changed() { this.dispatchEvent(new CustomEvent('glide-card-change', { bubbles: true, detail: { face: this.face, tab: this.tab } })); }

  #click(event) {
    const control = event.target instanceof Element ? event.target.closest('[data-card-action="flip"], [data-card-tab]') : null;
    if (!control) return;
    if (control.dataset.cardAction === 'flip') this.face = this.face === 'back' ? 'front' : 'back';
    else this.tab = control.dataset.cardTab;
    this.#changed();
  }

  #key(event) {
    if (event.key === 'Escape' && this.face === 'back') {
      event.preventDefault();
      event.stopPropagation();
      this.face = 'front';
      this.#changed();
      return;
    }
    const tab = event.target instanceof Element ? event.target.closest('[data-card-tab]') : null;
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...this.#stage.querySelectorAll('[data-card-tab]')];
    const index = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    this.tab = tabs[next].dataset.cardTab;
    tabs[next].focus();
    this.#changed();
  }
}

if (globalThis.customElements && !customElements.get('glide-card')) customElements.define('glide-card', GlideCard);
