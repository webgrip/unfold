import * as THREE from '../../../../vendor/three/three-module.js';
import { Sky } from './sky.js';
import { WorldParticles } from './particles.js';
import { objectMakers } from './objects.js';
import { worldBuilders } from './worlds.js';
import { disposeTree, overshoot, releaseShared, seededRandom, softSprite } from './kit.js';
import { autoTimeOfDay, objectUnlocked, lockedReason, timesOfDay, worldKinds, worldLabel, worldLimits } from './rules.js';

const eye = Object.freeze(new THREE.Vector3(0, 1.7, 7.2));
const aim = Object.freeze(new THREE.Vector3(0, 0.55, 0));
const eyeDistance = eye.distanceTo(aim);
const minimumFrameWidth = 5.8;
const minimumFrameHeight = 3.6;
const stillTime = 3.7;
const spring = (current, velocity, target, stiffness, damping, dt) => { const v = velocity + ((target - current) * stiffness - velocity * damping) * dt; return [current + v * dt, v]; };
const plurals = Object.freeze({ jellyfish: 'jellyfish', 'gold koi pond': 'gold koi ponds' });
const counted = (count, word) => (count === 1 ? `a${/^[aeiou]/i.test(word) ? 'n' : ''} ${word}` : `${count} ${plurals[word] ?? `${word}s`}`);

function listed(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * A Run card's inner world: a small 3D scene rendered into a texture that the forge's front shader draws in the art
 * window. The card's tilt moves its camera, so the art reads as a window into a place. It can squash itself flat (a
 * dolly zoom to a near-orthographic, posterized picture) and spring back, it lights itself for the card's time of day,
 * draws a fissure for a crack and a gold seam for a mend, and holds clickable things that react with particles and a
 * sound. A person who holds a copy can place and erase things; `config()` is what they saved. Under reduced motion it
 * draws without animation, particles or springs. It owns one render target and frees every GPU resource on `dispose()`.
 */
export class InnerWorld {
  /**
   * @param {{ seed?: number, reduced?: boolean, sound?: (cue: string, params?: object) => void }} [options]
   */
  constructor({ seed = 0, reduced = false, sound = () => {} } = {}) {
    this.seed = seed;
    this.reduced = reduced;
    this.cue = sound;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1.6, 0.1, 200);
    this.root = new THREE.Group();
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a2c1a, 1.1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    this.sun.position.set(4, 7, 3);
    this.scene.fog = new THREE.FogExp2(0x9fb8d8, 0.035);
    this.sky = new Sky();
    this.particles = new WorldParticles(1400, { reduced });
    this.halo = softSprite(0xffffff, 0.8, 0);
    this.halo.material.blending = THREE.AdditiveBlending;
    this.halo.visible = false;
    this.scene.add(this.root, this.hemi, this.sun, this.sky.mesh, this.particles.points, this.halo);
    this.updaters = [];
    this.tweens = [];
    this.placed = [];
    this.grounds = [];
    this.pickables = [];
    this.fissure = null;
    this.settings = {};
    this.facts = { days: null, merged: false, condition: null };
    this.state = { kind: null, tod: 'auto', weather: 'clear', flat: 0, flatV: 0, flatT: 0, tool: null, hover: null, focus: -1, look: 0, t: stillTime + seed * 20 };
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.size = { width: 0, height: 0 };
    this.target = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 4 });
    this.setSize(640, 400);
  }

  /** The texture the front shader samples: the world as linear HDR colour. */
  get texture() { return this.target.texture; }

  /** The world kind it draws, or null when it draws none. */
  get kind() { return this.state.kind; }

  /** Whether it is flat or on its way to flat. */
  get flat() { return this.state.flatT > 0.5; }

  /** The placing tool: a thing's type, `erase`, or null. */
  get tool() { return this.state.tool; }

  /** Sizes the render target to `width` × `height` pixels, at most 1024 a side with the aspect kept, and its camera to match. */
  setSize(width, height) {
    const fit = Math.min(1, 1024 / Math.max(width, height, 1));
    const w = Math.max(64, Math.round(width * fit));
    const h = Math.max(64, Math.round(height * fit));
    if (w === this.size.width && h === this.size.height) return;
    this.size = { width: w, height: h };
    this.target.setSize(w, h);
    this.camera.aspect = w / h;
    this.particles.setScale(h);
  }

  /** Plays a cue through the card's sound player, which stays silent unless the person turned card sound on; a failing cue is ignored. */
  sound(cue, params) { try { this.cue(cue, params); } catch { return; } }

  /** The share of the way to a target that a value moves in `dt` seconds at `rate`; all of it under reduced motion. */
  ease(dt, rate) { return this.reduced ? 1 : 1 - Math.exp(-rate * dt); }

  /**
   * Shows a decoration: rebuilds the world when its kind changed, places its things and applies its time of day and
   * weather. A `kind` of `off` empties it.
   * @param {{ kind: string, tod: string, weather: string, objects: { t: string, x: number, z: number, s: number }[] }} config
   * @param {{ days: number | null, merged: boolean, condition: string | null }} facts
   */
  show(config, facts) {
    this.facts = { ...facts };
    this.state.tod = config.tod;
    this.state.weather = config.weather;
    const kind = worldKinds.some(entry => entry.key === config.kind) ? config.kind : null;
    if (kind !== this.state.kind) this.build(kind);
    this.setObjects(config.objects ?? []);
    this.drawFissure();
    this.light();
  }

  /** Applies new card facts: the time of day `auto` shows, and the fissure. A crack or a mend arriving with `ceremony` bursts along it. */
  setFacts(facts, { ceremony = false } = {}) {
    const was = this.facts.condition;
    this.facts = { ...facts };
    if (!this.state.kind) return;
    if (was !== facts.condition) {
      this.drawFissure();
      if (ceremony && this.fissure) this.burstAlongFissure(facts.condition === 'mended' ? [[1, 0.82, 0.35], [1, 0.95, 0.7]] : [[0.25, 0.22, 0.22], [0.55, 0.5, 0.5]]);
    }
    this.light();
  }

  build(kind) {
    this.clear();
    this.state.kind = kind;
    if (!kind) return;
    const group = new THREE.Group();
    this.root.add(group);
    const index = worldKinds.findIndex(entry => entry.key === kind);
    this.settings = worldBuilders[kind](group, this, seededRandom((this.seed + index * 0.137) % 1)) ?? {};
    this.grounds = [];
    group.traverse(node => { if (node.isMesh && node.userData.ground) this.grounds.push(node); });
    this.refreshPickables();
  }

  clear() {
    for (const child of [...this.root.children]) { this.root.remove(child); disposeTree(child); }
    this.updaters.length = 0;
    this.tweens.length = 0;
    this.placed = [];
    this.grounds = [];
    this.pickables = [];
    this.fissure = null;
    this.settings = {};
    this.state.hover = null;
    this.state.focus = -1;
    this.halo.visible = false;
    this.particles.clear();
  }

  refreshPickables() {
    this.pickables = [];
    this.root.traverse(node => { if (node.isMesh && node.userData.owner) this.pickables.push(node); });
  }

  /** The ground's height at the world's own (x, z), or 0 off the ground. */
  groundAt(x, z) {
    const squash = this.root.scale.z;
    this.root.scale.z = 1;
    this.root.updateMatrixWorld(true);
    this.raycaster.set(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
    const hit = this.raycaster.intersectObjects(this.grounds, false)[0];
    this.root.scale.z = squash;
    this.root.updateMatrixWorld(true);
    return hit?.point.y ?? 0;
  }

  setObjects(list) {
    for (const group of this.placed) { this.root.remove(group); disposeTree(group); }
    this.placed = [];
    this.state.hover = null;
    if (!this.state.kind) return;
    for (const item of list) this.place(item.t, item.x, item.z, item.s, { animate: false });
    this.refreshPickables();
  }

  place(type, x, z, seed = Math.random(), { animate = true } = {}) {
    const make = objectMakers[type];
    if (!make || !this.state.kind) return null;
    const own = Object.create(this);
    own.updaters = [];
    const group = make(seed, own);
    group.userData.updaters = own.updaters;
    group.position.set(x, this.groundAt(x, z), z);
    group.rotation.y = seed * Math.PI * 2;
    group.userData.placed = { t: type, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, s: Math.round(seed * 1000) / 1000 };
    this.root.add(group);
    this.placed.push(group);
    if (animate && !this.reduced) {
      group.scale.setScalar(0.01);
      this.tweens.push({ t: 0, duration: 0.45, step: k => group.scale.setScalar(Math.max(0.01, overshoot(k))), done: () => group.scale.setScalar(1) });
    }
    return group;
  }

  remove(group) {
    this.root.remove(group);
    this.placed = this.placed.filter(entry => entry !== group);
    disposeTree(group);
    if (this.state.hover === group) this.state.hover = null;
    this.refreshPickables();
  }

  drawFissure() {
    if (this.fissure) { this.root.remove(this.fissure); disposeTree(this.fissure); this.fissure = null; }
    const condition = this.facts.condition;
    if (!this.state.kind || !condition) return;
    const random = seededRandom((this.seed * 7.31) % 1);
    const points = [];
    let x = -1.6;
    let z = -0.2;
    for (let i = 0; i < 14; i++) {
      points.push(new THREE.Vector3(x, this.groundAt(x, z) + 0.03, z));
      x += 0.24;
      z += Math.sin(i * 1.7) * 0.18 + (random() - 0.5) * 0.12;
    }
    const mended = condition === 'mended';
    const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 80, mended ? 0.055 : 0.05, 6, false);
    const material = mended ? new THREE.MeshStandardMaterial({ color: 0x2a1a00, emissive: 0xffc23a, emissiveIntensity: 3.2, roughness: 0.3, metalness: 0.8 }) : new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0x6a1f0c, emissiveIntensity: 1.4, roughness: 0.9 });
    this.fissure = new THREE.Mesh(geometry, material);
    this.fissure.userData.points = points;
    this.root.add(this.fissure);
  }

  burstAlongFissure(colors) {
    for (const point of this.fissure?.userData.points ?? []) this.particles.burst(this.root.localToWorld(point.clone()), colors, 6, 1.1, 0.8);
  }

  /** The time of day it shows now: the world's own, the decoration's choice, or the card's. */
  timeOfDay() {
    if (this.settings.forceTod) return this.settings.forceTod;
    return this.state.tod === 'auto' ? autoTimeOfDay(this.facts) : this.state.tod;
  }

  light() {
    if (!this.state.kind) return;
    const tone = this.sky.apply(this.timeOfDay(), this.sun, this.hemi, this.settings.water ?? null);
    this.scene.fog.color.set(this.settings.fogColor ?? tone.fog);
    this.settings.relight?.();
  }

  setTimeOfDay(key) { this.state.tod = key; this.light(); }

  setWeather(key) { this.state.weather = key; if (key === 'clear') this.particles.clear(); }

  setTool(tool) { this.state.tool = tool || null; }

  setFlat(flat) {
    this.state.flatT = flat ? 1 : 0;
    if (this.reduced) { this.state.flat = this.state.flatT; this.state.flatV = 0; }
    this.sound('whoosh');
  }

  /** Springs the depth for a moment, as the card is revealed. */
  pop() { if (!this.reduced && this.state.flatT < 0.5) this.state.flatV -= 2.5; }

  /**
   * Advances the world by `dt` seconds and points its camera through the art window: the card's tilt (`tiltX`,
   * `tiltY`, its rotations in radians) moves the eye, and `look`, the pointer's horizontal place in the art from -0.5
   * to 0.5, pans it a little.
   */
  step(dt, { tiltX = 0, tiltY = 0, look = 0 } = {}) {
    const s = this.state;
    if (!s.kind) return;
    const live = this.reduced ? 0 : dt;
    s.t += live;
    this.sky.tick(s.t);
    if (this.reduced) { s.flat = s.flatT; s.flatV = 0; }
    else [s.flat, s.flatV] = spring(s.flat, s.flatV, s.flatT, 40, 10, Math.max(dt, 1 / 120));
    const f = Math.min(1, Math.max(0, s.flat));
    this.root.scale.set(1, 1, 1 - 0.96 * f);
    this.scene.fog.density = (this.settings.fogDensity ?? 0.035) / (1 + f * 6.5);
    const frameHeight = Math.max(minimumFrameHeight, minimumFrameWidth / this.camera.aspect);
    const distance = eyeDistance * (1 + f * 6);
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(frameHeight / 2 / distance));
    s.look += ((this.reduced ? 0 : look) - s.look) * this.ease(dt || 1, 6);
    const offset = new THREE.Vector3(-tiltY * 7.5 * (1 - f) + s.look * 0.6, tiltX * 5 * (1 - f), 0);
    const direction = new THREE.Vector3().subVectors(eye, aim).normalize();
    this.camera.position.copy(aim).addScaledVector(direction, distance).add(offset);
    this.camera.lookAt(aim);
    this.camera.updateProjectionMatrix();
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tween = this.tweens[i];
      tween.t += live / tween.duration;
      tween.step(Math.min(1, tween.t));
      if (tween.t >= 1) { this.tweens.splice(i, 1); tween.done?.(); }
    }
    for (const update of this.updaters) update(live, s.t);
    for (const group of this.placed) for (const update of group.userData.updaters) update(live, s.t);
    this.highlight();
    if (!this.reduced) { this.particles.weather(s.weather, dt, this.settings.ambient); this.particles.update(dt, s.t); }
  }

  highlight() {
    const owner = this.state.hover;
    this.halo.visible = Boolean(owner);
    if (!owner) return;
    owner.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(owner);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    this.halo.position.copy(center);
    this.halo.scale.setScalar(Math.max(0.5, Math.max(size.x, size.y) * 1.8));
    this.halo.material.opacity = this.reduced ? 0.4 : 0.32 + 0.12 * Math.sin(this.state.t * 6);
  }

  /** Draws the world into its render target with `renderer`, leaving the renderer's own target as it was. */
  render(renderer) {
    if (!this.state.kind) return;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(previous);
  }

  /** What is under the art window's point (`u`, `v`), both from 0 to 1 with v up: the thing, the hit point and its place in the world. */
  pick(u, v) {
    if (!this.state.kind) return null;
    this.pointer.set(u * 2 - 1, v * 2 - 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects([...this.pickables, ...this.grounds], false)[0];
    if (!hit) return null;
    const owner = hit.object.userData.owner ?? null;
    return { owner, point: hit.point.clone(), local: this.root.worldToLocal(hit.point.clone()), ground: !owner };
  }

  /** Marks what the pointer is over and answers the cursor the card should show. */
  hover(u, v) {
    const hit = u === null ? null : this.pick(u, v);
    const s = this.state;
    const owner = hit?.owner ?? null;
    const target = s.tool === 'erase' ? (owner?.userData.placed ? owner : null) : (owner?.userData.onClick ? owner : null);
    s.hover = target;
    if (this.reduced) this.highlight();
    if (s.tool === 'erase') return target ? 'not-allowed' : 'crosshair';
    if (s.tool) return hit ? 'copy' : 'default';
    return target ? 'pointer' : null;
  }

  /**
   * Acts on a click at the art window's point (`u`, `v`): erases a placed thing with the eraser or `erase`, places the
   * chosen thing on the ground, or plays a thing's reaction. Answers whether it handled the click (so the card does not
   * start a drag), whether the decoration changed, and what a screen reader should hear.
   * @returns {{ handled: boolean, changed: boolean, text: string }}
   */
  click(u, v, { erase = false } = {}) {
    const hit = this.pick(u, v);
    const s = this.state;
    if ((erase || s.tool === 'erase') && hit?.owner?.userData.placed) return this.erase(hit.owner);
    if (s.tool === 'erase') return { handled: true, changed: false, text: '' };
    if (s.tool) return hit ? this.placeAt(s.tool, hit.local.x, hit.local.z, hit.point) : { handled: true, changed: false, text: '' };
    if (hit?.owner?.userData.onClick) return { handled: true, changed: false, text: hit.owner.userData.onClick(hit.point) };
    return { handled: false, changed: false, text: '' };
  }

  erase(group) {
    const label = group.userData.label ?? 'thing';
    const point = group.getWorldPosition(new THREE.Vector3());
    this.remove(group);
    this.particles.burst(point, [[0.8, 0.8, 0.8]], 20, 1);
    this.sound('whoosh');
    return { handled: true, changed: true, text: `Removed the ${label.toLowerCase()}.` };
  }

  placeAt(type, x, z, point = null) {
    if (!objectUnlocked(type, this.facts)) return { handled: true, changed: false, text: `${worldLabel(type)} is locked. ${lockedReason(type, this.facts)}.` };
    if (this.placed.length >= worldLimits.objects) return { handled: true, changed: false, text: `A world holds at most ${worldLimits.objects} things. Erase one first.` };
    if (x < worldLimits.x[0] || x > worldLimits.x[1] || z < worldLimits.z[0] || z > worldLimits.z[1]) return { handled: true, changed: false, text: 'That is outside the world.' };
    const group = this.place(type, x, z);
    this.refreshPickables();
    this.particles.burst(point ?? group.getWorldPosition(new THREE.Vector3()), [[1, 0.95, 0.7], [0.7, 0.9, 1]], 30, 1.2);
    this.sound('chime', { notes: [659.25, 987.77] });
    return { handled: true, changed: true, text: `Placed a${/^[aeiou]/i.test(worldLabel(type)) ? 'n' : ''} ${worldLabel(type).toLowerCase()}.` };
  }

  /** The clickable things, left to right as the camera sees them, for keyboard focus. */
  focusables() {
    const owners = [...new Set(this.pickables.map(mesh => mesh.userData.owner))].filter(owner => owner && (this.state.tool === 'erase' ? owner.userData.placed : owner.userData.onClick));
    const at = owner => owner.getWorldPosition(new THREE.Vector3()).project(this.camera).x;
    return owners.map(owner => [owner, at(owner)]).sort((a, b) => a[1] - b[1]).map(([owner]) => owner);
  }

  /** Moves keyboard focus `direction` (1 or -1) through the clickable things and answers the focused one's label. */
  focusStep(direction) {
    const list = this.focusables();
    if (!list.length) { this.state.focus = -1; this.state.hover = null; return ''; }
    const current = list.indexOf(this.state.hover);
    const next = current === -1 ? (direction > 0 ? 0 : list.length - 1) : (current + direction + list.length) % list.length;
    this.state.hover = list[next];
    this.highlight();
    this.state.focus = next;
    return `${list[next].userData.label}, ${next + 1} of ${list.length}`;
  }

  /** Clears keyboard focus and the hover highlight. */
  blur() { this.state.hover = null; this.state.focus = -1; this.highlight(); }

  /** Acts on the focused thing as a click would; with a placing tool, places the thing on open ground near the middle. */
  activate() {
    const s = this.state;
    if (s.tool && s.tool !== 'erase') {
      const random = Math.random;
      for (let attempt = 0; attempt < 12; attempt++) {
        const x = (random() - 0.5) * 2.6;
        const z = (random() - 0.5) * 1.8;
        if (!this.placed.some(group => Math.hypot(group.position.x - x, group.position.z - z) < 0.35)) return this.placeAt(s.tool, x, z);
      }
      return this.placeAt(s.tool, (random() - 0.5) * 2.6, (random() - 0.5) * 1.8);
    }
    const owner = s.hover;
    if (!owner) return { handled: false, changed: false, text: '' };
    if (s.tool === 'erase') return owner.userData.placed ? this.erase(owner) : { handled: true, changed: false, text: '' };
    const point = owner.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.4, 0));
    return { handled: true, changed: false, text: owner.userData.onClick?.(point) ?? '' };
  }

  /** The decoration as it stands: what a person saves for their copy. */
  config() {
    return { v: 1, kind: this.state.kind ?? 'off', tod: this.state.tod, weather: this.state.weather, objects: this.placed.map(group => ({ ...group.userData.placed })) };
  }

  /** A sentence describing the world for screen readers: the place, the light, what can be touched and the card's condition. */
  describe() {
    const s = this.state;
    if (!s.kind) return '';
    const time = this.timeOfDay();
    const follows = !this.settings.forceTod && s.tod === 'auto';
    const counts = new Map();
    for (const owner of new Set(this.pickables.map(mesh => mesh.userData.owner))) if (owner?.userData.onClick) counts.set(owner.userData.label.toLowerCase(), (counts.get(owner.userData.label.toLowerCase()) ?? 0) + 1);
    const things = listed([...counts].map(([label, count]) => counted(count, label)));
    const condition = this.facts.condition === 'cracked' ? ' A dark fissure runs through the ground: the card has a confirmed crack.' : this.facts.condition === 'mended' ? ' A gold seam runs through the ground where a crack was mended.' : '';
    const weather = s.weather === 'clear' ? '' : `, with ${s.weather === 'fireflies' ? 'fireflies' : s.weather}`;
    return `Inner world: ${worldLabel(s.kind)}, ${(timesOfDay.find(step => step.key === time)?.label ?? time).toLowerCase()}${follows ? ', following the card’s days live' : ''}${weather}${this.flat ? ', drawn flat' : ''}. ${things ? `You can touch ${things}.` : 'Nothing to touch yet.'}${condition}`;
  }

  dispose() {
    this.clear();
    this.halo.material.dispose();
    this.sky.dispose();
    this.particles.dispose();
    this.target.dispose();
    releaseShared();
  }
}
