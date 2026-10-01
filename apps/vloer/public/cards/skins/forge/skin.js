import { render as nativeRender } from '../vloer-native/skin.js';
import { webglSupport } from '../../registry.js';
import { faceFacts } from './forge-model.js';

/** The skin's name, matching its folder and manifest. */
export const id = 'forge';
/** How long a forge card keeps its WebGL scene after the runtime detaches it, so a live refresh that redraws the card reuses it. */
export const keepAliveMs = 3000;

const controllers = new WeakMap();
const revealed = new Set();
let hero = null;
let shared = null;

function chip(view, h) {
  const e = h.escape;
  const release = view.release;
  const day = release?.released ? `<span class="day" data-finish="${e(release.finish.key)}" data-source="${e(release.source)}"><b>${e(release.dayText)}</b><span class="dot" aria-hidden="true"></span><span class="fin">${e(release.finish.label)}</span></span>` : '';
  const condition = view.condition ? `<span class="forge-condition" data-condition="${e(view.condition.state)}" title="${e(view.condition.text)}">${e(view.condition.label)}</span>` : '';
  return `<span class="chip" data-slot="state" data-tone="${e(view.state.tone)}" title="${e(view.state.description || '')}">${h.icon(view.state.glyph)}<span>${e(view.state.label)}</span></span>${day}${condition}`;
}

function facts(view, facts, h) {
  const e = h.escape;
  const rows = facts.rows.map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join('');
  const grade = view.grade ? `<div><dt>Grade</dt><dd>${e(view.grade.description)}</dd></div>` : '';
  const finish = `<div><dt>Finish</dt><dd>${e(`${view.finish.label}: ${facts.coverage.label.toLowerCase()} · ${facts.pattern.label} foil, ${facts.art.label} art`)}</dd></div>`;
  return `<div class="forge-facts">
    <h3 class="title" data-slot="title">${e(view.title)}</h3>
    <dl>
      ${rows}${grade}${finish}
      <div data-slot="steward"><dt>Steward</dt><dd>${e(view.steward.signed ? `${view.steward.name} · ${view.steward.detail || 'signed'}` : `Unsigned · ${view.steward.detail}`)}</dd><span class="sr-only">${e(view.steward.text)}</span></div>
      <div><dt>Ids</dt><dd data-slot="ids">${e(view.ids.join(' · '))}</dd></div>
    </dl>
  </div>`;
}

function front(view, h) {
  const e = h.escape;
  const look = faceFacts(view);
  return `<article class="forge" data-finish="${e(view.finish.key)}" data-coverage="${e(look.coverage.key)}" data-pattern="${e(look.pattern.key)}" data-pattern-source="${e(look.pattern.source)}" data-art="${e(look.art.key)}" data-forge-state="loading" aria-label="Run card: ${e(view.title)}">
    <div class="forge-stage" data-forge-stage>
      <div class="forge-poster" aria-hidden="true"><span class="forge-poster-card"></span></div>
    </div>
    <div class="forge-bar">${chip(view, h)}<span class="forge-cost" data-slot="cost" data-status="${e(view.cost.status)}" role="img" aria-label="${e(view.cost.label)}">${e(view.cost.text)}</span></div>
    <div class="forge-actions">
      <button type="button" class="forge-turn" data-forge-action="turn" aria-pressed="false">Turn over</button>
      <button type="button" class="more" data-card-action="flip">More info${h.icon('chevron')}</button>
    </div>
    ${facts(view, look, h)}
  </article>`;
}

/**
 * Draws one face of a card as markup. The front holds the stage the 3D card renders into, a bar with the state, the
 * cost and the day chip, the turn and More info controls, and the card's facts as text for screen readers (shown
 * instead of the 3D card when WebGL fails). The back is Vloer Native's tabs.
 * @param {object} view The `cardView` model.
 * @param {{ face: 'front' | 'back', escape: Function, icon: Function, link: Function }} h
 * @returns {string}
 */
export function render(view, h) {
  return h.face === 'back' ? nativeRender(view, h) : front(view, h);
}

function motionFor(host) {
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  const asked = host?.getAttribute?.('motion');
  if (reduced || asked === 'still') return 'still';
  if (asked === 'live') return 'live';
  return webglSupport() === 'hardware' ? 'live' : 'still';
}

async function sharedStage(engine) {
  if (!shared) {
    const canvas = document.createElement('canvas');
    shared = { stage: new engine.ForgeStage(canvas), users: 0, timer: 0 };
  }
  clearTimeout(shared.timer);
  shared.users++;
  return shared.stage;
}

function releaseShared() {
  if (!shared) return;
  shared.users--;
  if (shared.users > 0) return;
  shared.timer = setTimeout(() => { if (shared && shared.users <= 0) { shared.stage.dispose(); shared = null; } }, keepAliveMs);
}

/** One forge card's WebGL lifecycle on a page: builds the scene once, keeps it across the runtime's redraws, renders live or still, and pauses whenever nobody can see it. */
class ForgeController {
  constructor(host) {
    this.host = host;
    this.engine = null;
    this.scene = null;
    this.stage = null;
    this.canvas = null;
    this.mode = null;
    this.frames = 0;
    this.visible = true;
    this.inert = false;
    this.running = 0;
    this.last = 0;
    this.disposeTimer = 0;
    this.cleanup = [];
  }

  mount(article, stage, front, view) {
    clearTimeout(this.disposeTimer);
    this.article = article;
    this.stageElement = stage;
    this.front = front;
    this.view = view;
    this.facts = faceFacts(view);
    this.watch();
    if (this.scene) this.show();
    else void this.build();
  }

  async build() {
    const ticket = (this.ticket = (this.ticket ?? 0) + 1);
    try {
      const engine = this.engine ?? (this.engine = await import('./engine.js'));
      const { faceFonts } = await import('./face.js');
      await engine.fontsReady(faceFonts);
      if (ticket !== this.ticket || !this.article) return;
      if (hero && hero !== this && !hero.article) hero.dispose();
      const mode = motionFor(this.host) === 'live' && (!hero || hero === this) ? 'live' : 'still';
      this.mode = mode;
      if (mode === 'live') {
        hero = this;
        this.canvas = document.createElement('canvas');
        this.stage = new engine.ForgeStage(this.canvas);
      } else {
        this.canvas = document.createElement('canvas');
        this.stage = await sharedStage(engine);
      }
      this.canvas.className = 'forge-canvas';
      this.canvas.setAttribute('aria-hidden', 'true');
      this.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.fail(); });
      this.scene = new engine.ForgeScene(this.facts, { motion: mode });
      this.bindPointer();
      if (mode === 'live' && this.view?.id && !revealed.has(this.view.id)) { revealed.add(this.view.id); this.scene.reveal(); }
      this.show();
    } catch {
      this.fail();
    }
  }

  show() {
    if (!this.scene || !this.article) return;
    if (this.canvas.parentElement !== this.stageElement) this.stageElement.append(this.canvas);
    this.scene.setFacts(this.facts);
    this.article.dataset.forgeMode = this.mode;
    this.syncTurn();
    if (this.mode === 'live') { this.article.dataset.forgeState = 'live'; this.resize(); this.update(); }
    else this.drawStill();
  }

  fail() {
    this.stop();
    if (this.article) this.article.dataset.forgeState = 'failed';
    this.canvas?.remove();
  }

  drawStill() {
    if (!this.scene || !this.stage || !this.stageElement) return;
    const box = this.stageElement.getBoundingClientRect();
    if (!box.width || !box.height) return;
    try {
      this.scene.settle();
      this.stage.setSize(box.width, box.height);
      this.stage.render(this.scene);
      if (this.stage.failed) throw new Error(this.stage.failed);
      if (this.mode === 'still') {
        const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
        this.canvas.width = Math.round(box.width * ratio);
        this.canvas.height = Math.round(box.height * ratio);
        this.canvas.getContext('2d').drawImage(this.stage.canvas, 0, 0, this.canvas.width, this.canvas.height);
      }
      this.frames++;
      this.article.dataset.forgeFrames = String(this.frames);
      this.article.dataset.forgeState = 'still';
    } catch {
      this.fail();
    }
  }

  resize() {
    if (!this.stageElement || !this.stage) return;
    const box = this.stageElement.getBoundingClientRect();
    if (this.mode === 'live' && box.width && box.height) this.stage.setSize(box.width, box.height);
    else if (this.mode === 'still') this.drawStill();
  }

  bindPointer() {
    const canvas = this.canvas;
    const local = event => { const box = canvas.getBoundingClientRect(); return [((event.clientX - box.left) / box.width) * 2 - 1, ((event.clientY - box.top) / box.height) * 2 - 1]; };
    canvas.addEventListener('pointermove', event => { if (this.mode !== 'live') return; const [x, y] = local(event); this.scene.pointer(x, y); this.scene.dragMove(event.clientX); });
    canvas.addEventListener('pointerleave', () => this.scene?.leave());
    canvas.addEventListener('pointerdown', event => { if (this.mode !== 'live') return; this.scene.dragStart(event.clientX); canvas.setPointerCapture?.(event.pointerId); });
    const end = () => { if (!this.scene) return; this.scene.dragEnd(); this.syncTurn(); };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  syncTurn() {
    const button = this.front?.querySelector('[data-forge-action="turn"]');
    if (!button || !this.scene) return;
    button.setAttribute('aria-pressed', String(this.scene.showingBack));
    button.textContent = this.scene.showingBack ? 'Show the face' : 'Turn over';
  }

  watch() {
    for (const stop of this.cleanup.splice(0)) stop();
    const turn = this.front.querySelector('[data-forge-action="turn"]');
    const onTurn = () => { if (!this.scene) return; this.scene.turn(); this.syncTurn(); if (this.mode === 'still') this.drawStill(); };
    turn?.addEventListener('click', onTurn);
    this.cleanup.push(() => turn?.removeEventListener('click', onTurn));
    if (typeof IntersectionObserver === 'function') {
      const seen = new IntersectionObserver(entries => { for (const entry of entries) this.visible = entry.isIntersecting; this.update(); });
      seen.observe(this.stageElement);
      this.cleanup.push(() => seen.disconnect());
    }
    if (typeof ResizeObserver === 'function') {
      const sized = new ResizeObserver(() => this.resize());
      sized.observe(this.stageElement);
      this.cleanup.push(() => sized.disconnect());
    }
    const onVisibility = () => this.update();
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanup.push(() => document.removeEventListener('visibilitychange', onVisibility));
    this.inert = this.front.inert === true;
    const turned = new MutationObserver(() => { this.inert = this.front.inert === true; this.update(); });
    turned.observe(this.front, { attributes: true, attributeFilter: ['inert'] });
    this.cleanup.push(() => turned.disconnect());
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onMotion = () => { if (reduced.matches && this.mode === 'live') this.toStill(); };
    reduced?.addEventListener?.('change', onMotion);
    this.cleanup.push(() => reduced?.removeEventListener?.('change', onMotion));
  }

  toStill() {
    this.stop();
    this.scene.settle();
    this.stage.render(this.scene);
    this.article.dataset.forgeState = 'still';
  }

  update() {
    const go = this.mode === 'live' && this.scene && this.visible && !this.inert && document.visibilityState !== 'hidden' && !(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    if (go && !this.running) { this.last = performance.now(); this.running = requestAnimationFrame(now => this.tick(now)); if (this.article) this.article.dataset.forgeState = 'live'; }
    else if (!go && this.running) { this.stop(); if (this.article && this.mode === 'live' && this.article.dataset.forgeState !== 'failed') this.article.dataset.forgeState = 'paused'; }
  }

  tick(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    try {
      this.scene.step(dt);
      this.stage.render(this.scene);
      if (this.stage.failed) throw new Error(this.stage.failed);
    } catch { this.fail(); return; }
    this.frames++;
    if (this.frames % 30 === 1) this.article.dataset.forgeFrames = String(this.frames);
    this.running = requestAnimationFrame(next => this.tick(next));
  }

  stop() {
    if (this.running) cancelAnimationFrame(this.running);
    this.running = 0;
    if (this.article) this.article.dataset.forgeFrames = String(this.frames);
  }

  unmount() {
    this.stop();
    for (const stop of this.cleanup.splice(0)) stop();
    this.article = null;
    this.disposeTimer = setTimeout(() => this.dispose(), keepAliveMs);
  }

  dispose() {
    this.ticket = (this.ticket ?? 0) + 1;
    this.scene?.dispose();
    if (this.mode === 'live') this.stage?.dispose();
    else if (this.stage) releaseShared();
    if (hero === this) hero = null;
    this.canvas?.remove();
    this.scene = null;
    this.stage = null;
    this.canvas = null;
    if (controllers.get(this.host) === this) controllers.delete(this.host);
  }
}

/**
 * Brings a drawn front to life. The first forge card on a page that may move renders live in its own WebGL canvas:
 * springs tilt it toward the pointer, the light follows, the art and foil animate, and it pauses while off screen,
 * turned to its back, in a hidden tab, or once the reader asks for reduced motion. Every other forge card, a card
 * with `motion="still"`, a reader who prefers reduced motion and a software rasteriser get one still frame from a
 * shared renderer. The scene survives the runtime's redraws for `keepAliveMs`. Returns the function that detaches it.
 * @param {Element} face The front face the runtime drew.
 * @param {object} view The `cardView` model the face was drawn from.
 * @returns {() => void}
 */
export function attach(face, view) {
  const article = face?.querySelector?.('.forge');
  const stage = article?.querySelector('[data-forge-stage]');
  if (!stage || !view) return () => {};
  const host = face.getRootNode?.()?.host ?? face;
  let controller = controllers.get(host);
  if (!controller || controller.view?.id !== view.id) { controller?.dispose(); controller = new ForgeController(host); controllers.set(host, controller); }
  controller.mount(article, stage, face, view);
  return () => controller.unmount();
}
