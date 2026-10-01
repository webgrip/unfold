import { Particles } from './particles.js';
import { flashTones, palettes } from './timeline.js';

const maxRatio = 1.5;
const idleMs = 1500;

function rgb(color, alpha = 1) {
  return `rgba(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)},${alpha})`;
}

function roundedRect(g, rect, radius) {
  const r = Math.min(radius, rect.width / 2, rect.height / 2);
  g.beginPath();
  g.moveTo(rect.left + r, rect.top);
  g.arcTo(rect.right, rect.top, rect.right, rect.bottom, r);
  g.arcTo(rect.right, rect.bottom, rect.left, rect.bottom, r);
  g.arcTo(rect.left, rect.bottom, rect.left, rect.top, r);
  g.arcTo(rect.left, rect.top, rect.right, rect.top, r);
  g.closePath();
}

/**
 * The page's one overlay for page-level light: a fixed 2D canvas above the page that ignores the pointer and is hidden
 * from assistive technology. It draws particle bursts, expanding rings, a soft flash confined to the card and the dim
 * of a takeover. It uses no WebGL context, so a page keeps the forge's budget of two, and it exists only while it has
 * something to draw: it is created on the first effect and removed when it has been idle for 1.5 s. Its clock follows
 * `scale()`, so particles slow down with a ceremony's slow motion.
 */
export class EffectsOverlay {
  /** @param {{ scale?: () => number }} [options] */
  constructor({ scale = () => 1 } = {}) {
    this.scale = scale;
    this.canvas = null;
    this.sparks = new Particles(480, { gravity: 520, drag: 0.97, hiddenZ: 0 });
    this.embers = new Particles(240, { gravity: -220, drag: 0.98, hiddenZ: 0 });
    this.debris = new Particles(120, { gravity: 1100, drag: 0.99, hiddenZ: 0 });
    this.rings = [];
    this.flashes = [];
    this.dims = [];
    this.sprites = new Map();
    this.frame = 0;
    this.idleSince = 0;
    this.onResize = () => this.resize();
  }

  ensure() {
    if (this.canvas?.isConnected) return true;
    if (!globalThis.document?.body) return false;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fx-overlay';
    this.canvas.setAttribute('aria-hidden', 'true');
    document.body.append(this.canvas);
    this.g = this.canvas.getContext('2d');
    if (!this.g) { this.canvas.remove(); this.canvas = null; return false; }
    this.resize();
    addEventListener('resize', this.onResize);
    return true;
  }

  resize() {
    if (!this.canvas) return;
    this.ratio = Math.min(maxRatio, globalThis.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(innerWidth * this.ratio));
    this.canvas.height = Math.max(1, Math.round(innerHeight * this.ratio));
  }

  sprite(color) {
    const key = color.join(',');
    let sprite = this.sprites.get(key);
    if (sprite) return sprite;
    sprite = document.createElement('canvas');
    sprite.width = sprite.height = 32;
    const g = sprite.getContext('2d');
    const glow = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.2, rgb(color, 0.9));
    glow.addColorStop(1, rgb(color, 0));
    g.fillStyle = glow;
    g.fillRect(0, 0, 32, 32);
    this.sprites.set(key, sprite);
    return sprite;
  }

  kick() {
    if (!this.ensure()) return false;
    this.idleSince = 0;
    if (!this.frame) { this.last = performance.now(); this.frame = requestAnimationFrame(now => this.tick(now)); }
    return true;
  }

  /**
   * Bursts `count` particles from a card's rectangle in one of the moment shapes: `seal` (a spark ring from the
   * centre), `rise` (from the bottom edge upward), `prism` (sparks off the edges), `debris` (dark chips falling from an
   * impact point), `flow` (gold embers rising along the edges), `confetti` or `sparks`.
   */
  burst(rect, { count = 20, palette = 'gold', shape = 'sparks', seed = Math.random } = {}) {
    if (!rect || !this.kick()) return;
    const colors = palettes[palette] ?? palettes.gold;
    const pick = () => colors[Math.floor(seed() * colors.length) % colors.length];
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const span = Math.max(rect.width, rect.height);
    for (let n = 0; n < count; n++) {
      const angle = seed() * Math.PI * 2;
      if (shape === 'debris') {
        const x = rect.left + rect.width * (0.35 + seed() * 0.3);
        const y = rect.top + rect.height * (0.4 + seed() * 0.2);
        this.debris.spawn({ x, y, vx: Math.cos(angle) * (40 + seed() * 120), vy: -80 - seed() * 160, life: 0.7 + seed() * 0.5, color: pick(), size: 2 + seed() * 3 });
      } else if (shape === 'flow' || shape === 'rise') {
        const t = seed();
        const edge = shape === 'rise' ? { x: rect.left + rect.width * t, y: rect.bottom } : t < 0.5 ? { x: seed() < 0.5 ? rect.left : rect.right, y: rect.top + rect.height * seed() } : { x: rect.left + rect.width * seed(), y: rect.bottom };
        this.embers.spawn({ x: edge.x, y: edge.y, vx: (seed() - 0.5) * 30, vy: -60 - seed() * 120, life: 1 + seed() * 1.2, color: pick(), size: 4 + seed() * 6 });
      } else if (shape === 'prism') {
        const side = Math.floor(seed() * 4);
        const t = seed();
        const x = side === 0 ? rect.left + rect.width * t : side === 1 ? rect.right : side === 2 ? rect.left + rect.width * t : rect.left;
        const y = side === 0 ? rect.top : side === 1 ? rect.top + rect.height * t : side === 2 ? rect.bottom : rect.top + rect.height * t;
        const out = Math.atan2(y - cy, x - cx);
        const speed = span * (0.25 + seed() * 0.45);
        this.sparks.spawn({ x, y, vx: Math.cos(out) * speed, vy: Math.sin(out) * speed - span * 0.15, life: 0.6 + seed() * 0.6, color: pick(), size: 5 + seed() * 6 });
      } else {
        const speed = span * (shape === 'confetti' ? 0.4 + seed() * 0.5 : 0.35 + seed() * 0.6);
        const from = shape === 'seal' ? { x: cx + Math.cos(angle) * rect.width * 0.18, y: cy + Math.sin(angle) * rect.width * 0.18 } : { x: cx, y: cy };
        this.sparks.spawn({ x: from.x, y: from.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (shape === 'confetti' ? span * 0.6 : 0), life: 0.5 + seed() * 0.7, color: pick(), size: shape === 'confetti' ? 6 + seed() * 4 : 4 + seed() * 6 });
      }
    }
    if (shape === 'seal' || shape === 'confetti') this.ring(rect, colors[0]);
  }

  /** An expanding ring from a card's centre. */
  ring(rect, color = palettes.gold[0], seconds = 0.7) {
    if (!rect || !this.kick()) return;
    this.rings.push({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, from: Math.min(rect.width, rect.height) * 0.3, to: Math.max(rect.width, rect.height) * 0.7, t: 0, seconds, color });
  }

  /** A soft flash confined to a card's rectangle, fading from `opacity` (the caller has the flash ledger's permission) over `ms`. */
  flash(rect, opacity, tone = 'white', ms = 180) {
    if (!rect || !(opacity > 0) || !this.kick()) return;
    this.flashes.push({ rect, opacity, color: flashTones[tone] ?? flashTones.white, t: 0, seconds: ms / 1000 });
  }

  /** A takeover's dim: the page darkens around the card for `ms`, easing in and out. */
  dim(rect, ms) {
    if (!rect || !this.kick()) return;
    this.dims.push({ rect, t: 0, seconds: ms / 1000 });
  }

  /** Removes everything at once, as when a ceremony is skipped. */
  clear() {
    this.sparks.clear(); this.embers.clear(); this.debris.clear();
    this.rings.length = 0; this.flashes.length = 0; this.dims.length = 0;
    if (this.g) this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Whether anything is still drawing. */
  get busy() { return this.rings.length + this.flashes.length + this.dims.length > 0 || [this.sparks, this.embers, this.debris].some(pool => pool.life.some(life => life > 0)); }

  tick(now) {
    this.frame = 0;
    if (!this.canvas?.isConnected) return;
    const raw = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const dt = raw * this.scale();
    const g = this.g;
    g.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const dim of this.dims) {
      dim.t += raw / dim.seconds;
      const k = Math.min(1, dim.t);
      const alpha = 0.42 * Math.min(1, k / 0.15, (1 - k) / 0.2);
      g.save();
      g.fillStyle = `rgba(4,6,8,${alpha.toFixed(3)})`;
      g.beginPath();
      g.rect(0, 0, innerWidth, innerHeight);
      roundedRect(g, dim.rect, 16);
      g.fill('evenodd');
      g.restore();
    }
    for (const flash of this.flashes) {
      flash.t += raw / flash.seconds;
      const alpha = flash.opacity * Math.max(0, 1 - flash.t);
      const r = flash.rect;
      g.save();
      roundedRect(g, r, 14);
      g.clip();
      const glow = g.createRadialGradient(r.left + r.width / 2, r.top + r.height * 0.45, 0, r.left + r.width / 2, r.top + r.height / 2, Math.max(r.width, r.height) * 0.7);
      glow.addColorStop(0, rgb(flash.color, alpha));
      glow.addColorStop(1, rgb(flash.color, alpha * 0.4));
      g.fillStyle = glow;
      g.fillRect(r.left, r.top, r.width, r.height);
      g.restore();
    }
    g.globalCompositeOperation = 'lighter';
    for (const ring of this.rings) {
      ring.t += dt / ring.seconds;
      const k = Math.min(1, ring.t);
      g.strokeStyle = rgb(ring.color, 0.55 * (1 - k));
      g.lineWidth = 2 + 6 * (1 - k);
      g.beginPath();
      g.arc(ring.x, ring.y, ring.from + (ring.to - ring.from) * (1 - (1 - k) ** 3), 0, Math.PI * 2);
      g.stroke();
    }
    for (const pool of [this.sparks, this.embers]) {
      pool.step(dt);
      for (let i = 0; i < pool.capacity; i++) {
        if (pool.life[i] <= 0) continue;
        const alpha = Math.max(0, pool.life[i] / pool.maxLife[i]);
        const size = pool.size[i] * (0.6 + alpha * 0.6);
        g.globalAlpha = alpha;
        g.drawImage(this.sprite([pool.colors[i * 3], pool.colors[i * 3 + 1], pool.colors[i * 3 + 2]]), pool.positions[i * 3] - size, pool.positions[i * 3 + 1] - size, size * 2, size * 2);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    this.debris.step(dt);
    for (let i = 0; i < this.debris.capacity; i++) {
      if (this.debris.life[i] <= 0) continue;
      const alpha = Math.max(0, this.debris.life[i] / this.debris.maxLife[i]);
      const s = this.debris.size[i];
      g.fillStyle = rgb([this.debris.colors[i * 3], this.debris.colors[i * 3 + 1], this.debris.colors[i * 3 + 2]], alpha);
      g.fillRect(this.debris.positions[i * 3] - s / 2, this.debris.positions[i * 3 + 1] - s / 2, s, s * 0.7);
    }
    this.rings = this.rings.filter(ring => ring.t < 1);
    this.flashes = this.flashes.filter(flash => flash.t < 1);
    this.dims = this.dims.filter(dim => dim.t < 1);
    if (this.busy) { this.idleSince = 0; this.frame = requestAnimationFrame(next => this.tick(next)); return; }
    this.idleSince ||= now;
    if (now - this.idleSince > idleMs) { this.remove(); return; }
    this.frame = requestAnimationFrame(next => this.tick(next));
  }

  /** Removes the canvas from the page. */
  remove() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    removeEventListener('resize', this.onResize);
    this.canvas?.remove();
    this.canvas = null;
    this.g = null;
  }
}
