import { icon } from '../core/icons.js';
import { cardView, cardTabs, finishLadder } from './card-model.js';
import { defaultSkin, loadSkin, requiredSlots, resolveSkin, webglSupport } from './registry.js';
import { applyTokens, loadTheme, themeView } from './themes.js';

const runtimeStylesheet = new URL('./unfold-card.css', import.meta.url).href;
const tabIds = cardTabs.map(tab => tab.id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const safeLink = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; } };
const slotLabels = { title: 'Work Item', state: 'State', cost: 'Cost', steward: 'Steward', ids: 'Ids' };
const slotValue = (view, slot) => ({ title: view.title, state: view.state.label, cost: view.cost.text, steward: view.steward.text, ids: view.ids.join(' · ') }[slot]);
const Base = globalThis.HTMLElement ?? class {};
const skinMomentNames = Object.freeze({ cracked: 'crack', mended: 'mend', graded: 'grade' });

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
 * `<unfold-card>`: renders one Run card in a shadow root with the skin its Work Target chose, falling back to Vloer
 * Native. Set the card object (`GET /api/ploeg/work-items/:id/card` → `card`) on the `card` property. The `face`
 * (`front` or `back`) and `tab` attributes hold the view and are reflected; every change fires `unfold-card-change`
 * with `{ face, tab }`. "More info" turns the card, Escape turns it back, and the back's tabs follow the ARIA tabs
 * pattern. The turn is a 3D flip that becomes a crossfade when the reader prefers reduced motion. Whatever a skin
 * draws, the front always carries the title, state, cost, steward and ids. The element reflects the skin it draws as
 * `data-skin`; a WebGL2 skin is replaced by its fallback when the browser has no WebGL2. A skin's `attach(front, view)`
 * receives the drawn front and the view model; the forge skin also reads `motion` (`still` or `live`) on the element.
 * A card whose `style.theme` names a theme loads it from Vloer; a theme picks the skin it `extends`, sets its tokens
 * on the element through the CSSOM and reaches the skin as `view.theme`. Setting the `theme` property to a theme
 * object (the designer's draft) or to null overrides that lookup; the element reflects the theme it drew as
 * `data-theme`. A card with a rarity reflects its tier as `data-rarity` and whether it is `predicted` or `revealed` as
 * `data-rarity-state`, which the runtime's stylesheet turns into the tier's metal and symbol tokens for every skin.
 * Setting `asOf` shows the card as it was at
 * that moment, which the binder uses to replay what changed while its owner was away. Every skin's `attach` fires
 * `unfold-card-moment` on the element through `skin-kit.js`'s `emitMoments`, and `playMoment(moment, api)` hands the
 * effects director's ceremony to the skin's `onMoment`.
 */
export class UnfoldCard extends Base {
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
  #asOf = null;
  #theme = undefined;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.addEventListener('click', event => this.#click(event));
    this.#root.addEventListener('keydown', event => this.#key(event));
  }

  get card() { return this.#card; }
  set card(value) { this.#card = value && typeof value === 'object' ? value : null; void this.#update(); }

  /** The moment, in milliseconds, the card is shown as of (days live and finish count to it); null shows it as of now. */
  get asOf() { return this.#asOf; }
  set asOf(value) { this.#asOf = Number.isFinite(value) ? value : null; if (this.#card) void this.#update(); }
  /** The theme this element draws with instead of the one `card.style.theme` names; undefined follows the card. */
  get theme() { return this.#theme; }
  set theme(value) { this.#theme = value === undefined ? undefined : value && typeof value === 'object' ? value : null; void this.#update(); }

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

  /**
   * Plays one moment's reaction on the drawn front: the skin's `onMoment(moment, api)` with `front`, `view` and `host`
   * added to the director's `api`, or, for a skin without one, the moment's name on the skin root's `data-moment` for
   * the ceremony's length. Skins react on the card only and leave page-level light to the director. Returns what the
   * skin returns (a promise it settles when its reaction ends), or null when nothing is drawn.
   * @param {{ kind: string, at?: string, detail?: object }} moment
   * @param {{ mode: 'full' | 'calm', durationMs: number, signal?: AbortSignal, [name: string]: unknown }} api
   */
  playMoment(moment, api) {
    const front = this.#stage?.querySelector('.gc-front');
    if (!front || !moment) return null;
    if (typeof this.#skin?.onMoment === 'function') return this.#skin.onMoment(moment, { ...api, front, view: this.#view, host: this });
    const root = front.querySelector('[data-skin-root]') ?? front.firstElementChild;
    if (!root || api?.mode !== 'full') return null;
    root.dataset.moment = skinMomentNames[moment.kind] ?? moment.kind;
    return new Promise(resolve => {
      const end = () => { delete root.dataset.moment; resolve(); };
      const timer = setTimeout(end, Math.max(300, api.durationMs ?? 900));
      api.signal?.addEventListener?.('abort', () => { clearTimeout(timer); end(); }, { once: true });
    });
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
    try { this.#detach = this.#skin.attach(front, this.#view) ?? null; } catch { this.#detach = null; }
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
    const theme = this.#theme !== undefined ? this.#theme : card.style?.theme ? await loadTheme(card.style.theme) : null;
    if (ticket !== this.#ticket) return;
    const wanted = resolveSkin(card.style, theme);
    if (this.dataset.skin !== wanted) this.dataset.skin = wanted;
    try {
      skin = await loadSkin(wanted);
      if (skin.manifest.renderer === 'webgl2' && webglSupport() === 'none') skin = await loadSkin(skin.manifest.fallback);
    } catch { try { skin = await loadSkin(defaultSkin); } catch { skin = null; } }
    if (ticket !== this.#ticket) return;
    const drawn = skin?.manifest?.id ?? defaultSkin;
    if (this.dataset.skin !== drawn) this.dataset.skin = drawn;
    let themed = null;
    try { themed = await themeView(theme, skin?.manifest ?? null); } catch { themed = null; }
    if (ticket !== this.#ticket) return;
    applyTokens(this, themed ? theme : null, skin?.manifest ?? null);
    if (themed?.id) this.dataset.theme = themed.id;
    else delete this.dataset.theme;
    const view = cardView(card, this.#asOf === null ? {} : { now: this.#asOf });
    if (!(skin?.manifest?.finishes ?? []).includes(view.finish.key)) view.finish = finishLadder[0];
    view.theme = themed;
    if (view.rarity) { this.dataset.rarity = view.rarity.key; this.dataset.rarityState = view.rarity.state; }
    else { delete this.dataset.rarity; delete this.dataset.rarityState; }
    this.#view = view;
    await this.#paint(skin, ticket);
  }

  async #paint(skin, ticket) {
    const view = this.#view;
    const links = this.#links ?? { base: stylesheet(runtimeStylesheet), skins: [] };
    const hrefs = skin?.stylesheets ?? (skin?.stylesheet ? [skin.stylesheet] : []);
    if (links.skins.map(link => link.getAttribute('href')).join(' ') !== hrefs.join(' ')) { for (const link of links.skins) link.remove(); links.skins = hrefs.map(stylesheet); }
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
    this.#root.replaceChildren(links.base, ...links.skins, stage);
    this.#stage = stage;
    this.#applyFace({ focus: false });
    this.#applyTab();
    await Promise.all([links.base.loaded, ...links.skins.map(link => link.loaded)]);
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

  #changed() { this.dispatchEvent(new CustomEvent('unfold-card-change', { bubbles: true, detail: { face: this.face, tab: this.tab } })); }

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

if (globalThis.customElements && !customElements.get('unfold-card')) customElements.define('unfold-card', UnfoldCard);
