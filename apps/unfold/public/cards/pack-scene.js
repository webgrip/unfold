import * as THREE from '../vendor/three/three-module.js';
import { RoomEnvironment } from '../vendor/three/room-environment.js';
import { EffectComposer } from '../vendor/three/effect-composer.js';
import { RenderPass } from '../vendor/three/render-pass.js';
import { UnrealBloomPass } from '../vendor/three/unreal-bloom-pass.js';
import { OutputPass } from '../vendor/three/output-pass.js';
import { ForgeScene, fontsReady } from './skins/forge/engine.js';
import { faceFonts } from './skins/forge/face.js';
import { Particles } from './effects/particles.js';

const pack = Object.freeze({ width: 0.84, height: 1.18, crimp: 0.075, strip: 0.11, bulge: 0.085 });
const markSheet = 'M52.625 9.758L11.079 27.437A1.8 1.8 0 0 0 10.949 30.688L28.354 39.805A1.5 1.5 0 0 0 30.199 39.44L53.782 11.321A1 1 0 0 0 52.625 9.758Z';
const markFold = 'M53.371 19.067L43.778 53.011A1.8 1.8 0 0 1 40.773 53.795L31.398 44.42A1.5 1.5 0 0 1 31.309 42.395L51.642 18.152A1 1 0 0 1 53.371 19.067Z';
const sans = 'Archivo, "Helvetica Neue", Arial, sans-serif';
const mono = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
const glowColors = [0xbfd4ff, 0x5ee0d0, 0xb38cff, 0xffc861];
const dealtFit = Object.freeze({ height: 1.75, width: 2.05 });
const focusY = 0.11;
const focusScale = 1.2;

function seeded(seed) {
  let state = seed >>> 0 || 1;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function canvas(width, height) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return element;
}

function crinkleNormals(random) {
  const size = 512;
  const field = canvas(size, size);
  const g = field.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 140; i++) {
    const shade = Math.round(90 + random() * 80);
    g.fillStyle = `rgba(${shade},${shade},${shade},0.22)`;
    g.beginPath();
    const x = random() * size;
    const y = random() * size;
    g.moveTo(x, y);
    for (let k = 0; k < 3; k++) g.lineTo(x + (random() - 0.5) * 220, y + (random() - 0.5) * 220);
    g.closePath();
    g.fill();
  }
  g.lineWidth = 1.2;
  for (let i = 0; i < 90; i++) {
    const shade = random() > 0.5 ? 210 : 50;
    g.strokeStyle = `rgba(${shade},${shade},${shade},0.35)`;
    g.beginPath();
    const x = random() * size;
    const y = random() * size;
    g.moveTo(x, y);
    g.lineTo(x + (random() - 0.5) * 260, y + (random() - 0.5) * 120);
    g.stroke();
  }
  const soft = canvas(size, size);
  const s = soft.getContext('2d');
  if ('filter' in s) s.filter = 'blur(1.4px)';
  s.drawImage(field, 0, 0);
  const height = s.getImageData(0, 0, size, size).data;
  const normals = s.createImageData(size, size);
  const at = (x, y) => height[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x - 1, y) - at(x + 1, y)) * 3.2;
    const dy = (at(x, y - 1) - at(x, y + 1)) * 3.2;
    const length = Math.hypot(dx, dy, 1);
    const index = (y * size + x) * 4;
    normals.data[index] = Math.round((dx / length * 0.5 + 0.5) * 255);
    normals.data[index + 1] = Math.round((dy / length * 0.5 + 0.5) * 255);
    normals.data[index + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
    normals.data[index + 3] = 255;
  }
  s.putImageData(normals, 0, 0);
  const map = new THREE.CanvasTexture(soft);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1.6, 2.2);
  return map;
}

function drawMark(g, x, y, size, ink = '#F4F6F2', accent = '#D65162') {
  g.save();
  g.translate(x, y);
  g.scale(size / 64, size / 64);
  g.fillStyle = ink;
  g.fill(new Path2D(markSheet));
  g.fillStyle = accent;
  g.fill(new Path2D(markFold));
  g.restore();
}

function spaced(g, text, x, y, spacing) {
  let cursor = x - (g.measureText(text).width + spacing * (text.length - 1)) / 2;
  for (const char of text) { g.fillText(char, cursor, y); cursor += g.measureText(char).width + spacing; }
}

function frontLabel({ title, subtitle, count, demo }) {
  const W = 1024;
  const H = Math.round(1024 * pack.height / pack.width);
  const element = canvas(W, H);
  const g = element.getContext('2d');
  const base = g.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, '#1b2830');
  base.addColorStop(0.5, '#0f171c');
  base.addColorStop(1, '#22313a');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  g.save();
  g.globalAlpha = 0.55;
  const band = g.createLinearGradient(0, H * 0.25, W, H * 0.75);
  band.addColorStop(0, 'rgba(210,58,78,0)');
  band.addColorStop(0.5, 'rgba(214,81,98,0.55)');
  band.addColorStop(1, 'rgba(210,58,78,0)');
  g.fillStyle = band;
  g.beginPath();
  g.moveTo(0, H * 0.62);
  g.lineTo(W, H * 0.38);
  g.lineTo(W, H * 0.46);
  g.lineTo(0, H * 0.7);
  g.closePath();
  g.fill();
  g.restore();
  g.strokeStyle = 'rgba(244,246,242,0.07)';
  g.lineWidth = 2;
  for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(W / 2, H * 0.36, 60 + i * 34, 0, Math.PI * 2); g.stroke(); }
  const crimp = Math.round(H * pack.crimp / pack.height);
  g.save();
  g.globalCompositeOperation = 'screen';
  for (let i = -H; i < W + H; i += 46) {
    const stripe = g.createLinearGradient(i, 0, i + 46, 0);
    const hue = ((i + H) / 46) * 23 % 360;
    stripe.addColorStop(0, `hsla(${hue},90%,62%,0)`);
    stripe.addColorStop(0.5, `hsla(${hue},90%,62%,0.07)`);
    stripe.addColorStop(1, `hsla(${hue},90%,62%,0)`);
    g.fillStyle = stripe;
    g.beginPath();
    g.moveTo(i, 0); g.lineTo(i + 46, 0); g.lineTo(i + 46 - H * 0.45, H); g.lineTo(i - H * 0.45, H);
    g.closePath();
    g.fill();
  }
  const sheen = g.createRadialGradient(W * 0.35, H * 0.3, 20, W * 0.35, H * 0.3, W * 0.9);
  sheen.addColorStop(0, 'rgba(160,200,255,0.16)');
  sheen.addColorStop(1, 'rgba(160,200,255,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, W, H);
  g.restore();
  for (const y0 of [0, H - crimp]) {
    g.fillStyle = 'rgba(10,14,18,0.55)';
    g.fillRect(0, y0, W, crimp);
    g.strokeStyle = 'rgba(244,246,242,0.16)';
    g.lineWidth = 3;
    for (let x = 0; x < W; x += 18) { g.beginPath(); g.moveTo(x, y0 + 6); g.lineTo(x + 9, y0 + crimp - 6); g.stroke(); }
  }
  const tear = Math.round(H * pack.strip / pack.height);
  g.setLineDash([14, 12]);
  g.strokeStyle = 'rgba(244,246,242,0.55)';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(40, tear); g.lineTo(W - 40, tear); g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(244,246,242,0.7)';
  g.font = `700 22px ${mono}`;
  g.textAlign = 'right';
  g.fillText('TEAR HERE  ›', W - 48, tear - 14);
  g.textAlign = 'center';
  drawMark(g, W / 2 - 150, H * 0.2, 300);
  g.fillStyle = '#F4F6F2';
  g.font = `800 112px ${sans}`;
  spaced(g, 'UNFOLD', W / 2, H * 0.5, 6);
  g.font = `700 30px ${mono}`;
  g.fillStyle = 'rgba(244,246,242,0.75)';
  spaced(g, 'RUN CARD PACK', W / 2, H * 0.5 + 56, 8);
  g.font = `800 64px ${sans}`;
  g.fillStyle = '#F4F6F2';
  g.fillText(title.toUpperCase(), W / 2, H * 0.68);
  g.font = `600 30px ${mono}`;
  g.fillStyle = 'rgba(244,246,242,0.8)';
  if (subtitle) g.fillText(subtitle.toUpperCase(), W / 2, H * 0.68 + 52);
  g.fillStyle = '#D65162';
  g.beginPath();
  g.arc(W / 2, H * 0.82, 70, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#111619';
  g.font = `800 64px ${sans}`;
  g.fillText(String(count), W / 2, H * 0.82 + 22);
  g.font = `700 22px ${mono}`;
  g.fillStyle = '#F4F6F2';
  g.fillText(count === 1 ? 'CARD' : 'CARDS', W / 2, H * 0.82 + 110);
  if (demo) {
    g.fillStyle = 'rgba(255,207,107,0.92)';
    g.fillRect(0, H - crimp - 72, W, 52);
    g.fillStyle = '#1a1405';
    g.font = `800 24px ${mono}`;
    g.fillText('DEMO PACK · ILLUSTRATIVE · NO SPEND', W / 2, H - crimp - 38);
  }
  const map = new THREE.CanvasTexture(element);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

function backLabel() {
  const element = canvas(512, Math.round(512 * pack.height / pack.width));
  const g = element.getContext('2d');
  g.fillStyle = '#121a1f';
  g.fillRect(0, 0, element.width, element.height);
  g.strokeStyle = 'rgba(244,246,242,0.08)';
  for (let x = -element.height; x < element.width; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + element.height, element.height); g.stroke(); }
  drawMark(g, element.width / 2 - 60, element.height / 2 - 70, 120, 'rgba(244,246,242,0.6)', 'rgba(214,81,98,0.7)');
  const map = new THREE.CanvasTexture(element);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function cardBack() {
  const W = 512;
  const H = Math.round(512 * 88 / 63);
  const element = canvas(W, H);
  const g = element.getContext('2d');
  const glow = g.createRadialGradient(W / 2, H * 0.45, 20, W / 2, H / 2, H * 0.72);
  glow.addColorStop(0, '#2f6fd0');
  glow.addColorStop(0.58, '#0d1a3a');
  glow.addColorStop(1, '#04070e');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(160,190,255,0.16)';
  g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(W / 2, H / 2, 18 + i * 11, 0, Math.PI * 2); g.stroke(); }
  g.strokeStyle = 'rgba(200,220,255,0.55)';
  g.lineWidth = 3;
  g.strokeRect(20, 20, W - 40, H - 40);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = `800 66px ${sans}`;
  g.fillText('UNFOLD', W / 2, H / 2 + 18);
  g.font = `600 15px ${mono}`;
  g.fillStyle = '#a9c2ff';
  g.fillText('R U N   C A R D', W / 2, H / 2 + 52);
  const map = new THREE.CanvasTexture(element);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function pillow(geometry, top, bottom, side) {
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const nx = (2 * x) / pack.width;
    const crimpTop = pack.height / 2 - pack.crimp;
    const crimpBottom = -pack.height / 2 + pack.crimp;
    const ny = Math.max(-1, Math.min(1, (y - (crimpTop + crimpBottom) / 2) / ((crimpTop - crimpBottom) / 2)));
    const edge = t => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };
    let z = pack.bulge * edge((1 - Math.abs(nx)) / 0.35) * edge((1 - Math.abs(ny)) / 0.3);
    if (y > crimpTop || y < crimpBottom) z = 0.003 * Math.sin(x * 140);
    position.setZ(i, z * side);
    uv.setXY(i, side > 0 ? x / pack.width + 0.5 : 0.5 - x / pack.width, (y + pack.height / 2) / pack.height);
  }
  geometry.translate(0, 0, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function packGeometry(top, bottom, columns, rows, side) {
  const geometry = new THREE.PlaneGeometry(pack.width, top - bottom, columns, rows);
  geometry.translate(0, (top + bottom) / 2, 0);
  return pillow(geometry, top, bottom, side);
}

function roundedCard(width, height, radius) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  const geometry = new THREE.ShapeGeometry(shape, 12);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) uv.setXY(i, (position.getX(i) + width / 2) / width, (position.getY(i) + height / 2) / height);
  return geometry;
}

function glowTexture() {
  const element = canvas(256, 256);
  const g = element.getContext('2d');
  const glow = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(element);
}

const ease = { out: x => 1 - (1 - x) ** 3, inOut: x => x * x * (3 - 2 * x), back: x => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2, linear: x => x };

/**
 * The pack ceremony's 3D scene: a sealed foil pack (a pillowed wrapper with crimped ends, a crinkle normal map and
 * iridescence, the Unfold mark, the period and the card count) that tears along its top edge, deals its cards face
 * down, and reveals them one at a time on the forge card. Anticipation, flip, foil wipe, particles and bloom scale
 * with the pull only. With `reduced` set every step is instant and nothing flies or sparkles. It owns one WebGL renderer.
 */
export class PackCeremony {
  constructor(host, { title, subtitle = '', count, demo = false, seed = 1, reduced = false, software = false, sounds = null }) {
    this.host = host;
    this.reduced = reduced;
    this.sounds = sounds;
    this.count = count;
    this.random = seeded(seed);
    this.tweens = [];
    this.cards = [];
    this.current = -1;
    this.state = 'sealed';
    this.fit = { height: 1.42, width: 1.3 };
    this.tearProgress = 0;
    this.time = 0;
    this.disposed = false;
    this.pointer = new THREE.Vector2();
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pack-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.append(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(software ? 1 : Math.min(2, globalThis.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.failed = null;
    this.renderer.debug.onShaderError = (gl, program, vertex, fragment) => { this.failed = gl.getShaderInfoLog(fragment) || 'Shader compile failed'; };
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.camera.position.set(0, 0, 3.3);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.environment;
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: software ? 0 : 4 }));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.55, 0.88);
    this.bloomBase = 0.35;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.build({ title, subtitle, count, demo });
    this.resize();
    this.observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.resize()) : null;
    this.observer?.observe(host);
    this.bind();
    this.last = performance.now();
    this.frame = requestAnimationFrame(now => this.tick(now));
  }

  build(label) {
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(1.2, 1.6, 2.4);
    const rim = new THREE.DirectionalLight(0x9fb8ff, 1.2);
    rim.position.set(-1.6, -0.4, 1.2);
    this.key = key;
    this.scene.add(key, rim, new THREE.AmbientLight(0x8899aa, 0.4));
    const background = canvas(256, 320);
    const g = background.getContext('2d');
    const glow = g.createRadialGradient(128, 130, 10, 128, 160, 240);
    glow.addColorStop(0, '#1f2e3a');
    glow.addColorStop(0.6, '#0a1015');
    glow.addColorStop(1, '#040607');
    g.fillStyle = glow;
    g.fillRect(0, 0, 256, 320);
    this.scene.background = new THREE.CanvasTexture(background);
    this.scene.background.colorSpace = THREE.SRGBColorSpace;

    this.textures = { front: frontLabel(label), back: backLabel(), normal: crinkleNormals(this.random), card: cardBack(), glow: glowTexture() };
    const foil = map => new THREE.MeshPhysicalMaterial({ map, normalMap: this.textures.normal, normalScale: new THREE.Vector2(0.55, 0.55), metalness: 0.58, roughness: 0.36, iridescence: 1, iridescenceIOR: 1.65, iridescenceThicknessRange: [160, 680], clearcoat: 0.35, clearcoatRoughness: 0.3, transparent: true, side: THREE.FrontSide });
    this.materials = { front: foil(this.textures.front), back: foil(this.textures.back), cardBack: new THREE.MeshStandardMaterial({ map: this.textures.card, metalness: 0.2, roughness: 0.45, transparent: true }), cardEdge: new THREE.MeshStandardMaterial({ color: 0x9aa6a8, metalness: 0.8, roughness: 0.3, transparent: true }) };
    const tearY = pack.height / 2 - pack.strip;
    this.pack = new THREE.Group();
    const body = new THREE.Mesh(packGeometry(tearY, -pack.height / 2, 40, 56, 1), this.materials.front);
    const bodyBack = new THREE.Mesh(packGeometry(tearY, -pack.height / 2, 20, 28, -1), this.materials.back);
    bodyBack.rotation.y = Math.PI;
    bodyBack.scale.x = -1;
    this.pack.add(body, bodyBack);
    this.strip = new THREE.Group();
    this.strip.position.set(pack.width / 2, tearY, 0);
    const stripFront = new THREE.Mesh(packGeometry(pack.height / 2, tearY, 40, 6, 1), this.materials.front);
    const stripBack = new THREE.Mesh(packGeometry(pack.height / 2, tearY, 20, 3, -1), this.materials.back);
    stripBack.rotation.y = Math.PI;
    stripBack.scale.x = -1;
    for (const mesh of [stripFront, stripBack]) { mesh.position.set(-pack.width / 2, -tearY, 0); this.strip.add(mesh); }
    this.pack.add(this.strip);
    this.tearLine = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.006), new THREE.MeshBasicMaterial({ color: 0xfff2d0, transparent: true, opacity: 0.95 }));
    this.tearLine.position.set(-pack.width / 2, tearY, pack.bulge * 0.2 + 0.004);
    this.tearLine.scale.x = 0.0001;
    this.pack.add(this.tearLine);
    this.scene.add(this.pack);
    this.packRest = { y: 0 };
    this.cardGeometry = roundedCard(0.63, 0.88, 0.032);

    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textures.glow, color: glowColors[0], transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow.scale.set(1.6, 1.6, 1);
    this.glow.position.set(0, 0, -0.2);
    this.scene.add(this.glow);

    this.particles = new Particles(600, { gravity: -0.4, drag: 0.985, hiddenZ: -50 });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.particles.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.particles.colors, 3));
    this.particles.geometry = geometry;
    this.particles.material = new THREE.PointsMaterial({ size: 0.02, map: this.textures.glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.scene.add(new THREE.Points(geometry, this.particles.material));
  }

  resize() {
    const box = this.host.getBoundingClientRect();
    const width = Math.max(1, Math.round(box.width));
    const height = Math.max(1, Math.round(box.height));
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.position.z = this.distance(this.fit);
    this.camera.updateProjectionMatrix();
  }

  distance(fit) {
    const span = 2 * Math.tan(THREE.MathUtils.degToRad(15));
    return Math.max(fit.height / span, (this.camera.aspect < 0.9 ? Math.min(fit.width, 1.3) : fit.width) / (span * this.camera.aspect));
  }

  zoomTo(fit, seconds) {
    const from = { ...this.fit };
    if (this.reduced || !seconds) { this.fit = fit; this.resize(); return; }
    this.tween(seconds, k => { this.fit = { height: from.height + (fit.height - from.height) * k, width: from.width + (fit.width - from.width) * k }; this.camera.position.z = this.distance(this.fit); }, null, ease.inOut);
  }

  bind() {
    const local = event => { const box = this.canvas.getBoundingClientRect(); return [((event.clientX - box.left) / box.width) * 2 - 1, -(((event.clientY - box.top) / box.height) * 2 - 1)]; };
    const onMove = event => {
      const [x, y] = local(event);
      this.pointer.set(x, y);
      if (this.dragging && this.state === 'sealed') {
        const progress = Math.max(0, Math.min(1, (this.worldX(x) - this.dragStart) / pack.width));
        this.setTear(Math.max(this.tearProgress, progress));
        if (this.tearProgress >= 0.92) { this.dragging = false; this.onTearComplete?.(); }
      }
    };
    const onDown = event => {
      if (this.state !== 'sealed') return;
      const [x, y] = local(event);
      if (!this.nearTopEdge(x, y)) return;
      this.dragging = true;
      this.dragStart = Math.min(this.worldX(x), -pack.width / 2 + 0.2);
      this.canvas.setPointerCapture?.(event.pointerId);
    };
    const onUp = () => { if (!this.dragging) return; this.dragging = false; if (this.state === 'sealed' && this.tearProgress < 0.92) this.tween(0.35, k => this.setTear(this.tearProgress * (1 - k)), null, ease.out); };
    this.canvas.addEventListener('pointermove', onMove);
    this.canvas.addEventListener('pointerdown', onDown);
    this.canvas.addEventListener('pointerup', onUp);
    this.canvas.addEventListener('pointercancel', onUp);
    this.unbind = () => { this.canvas.removeEventListener('pointermove', onMove); this.canvas.removeEventListener('pointerdown', onDown); this.canvas.removeEventListener('pointerup', onUp); this.canvas.removeEventListener('pointercancel', onUp); };
  }

  worldX(ndcX) {
    const halfWidth = this.camera.position.z * Math.tan(THREE.MathUtils.degToRad(15)) * this.camera.aspect;
    return ndcX * halfWidth;
  }

  nearTopEdge(ndcX, ndcY) {
    const halfHeight = this.camera.position.z * Math.tan(THREE.MathUtils.degToRad(15));
    const y = ndcY * halfHeight - this.pack.position.y;
    const x = this.worldX(ndcX);
    return Math.abs(x) <= pack.width / 2 + 0.08 && y >= pack.height / 2 - pack.strip - 0.12 && y <= pack.height / 2 + 0.1;
  }

  setTear(progress) {
    this.tearProgress = progress;
    this.tearLine.scale.x = Math.max(0.0001, progress * pack.width);
    this.tearLine.position.x = -pack.width / 2 + (progress * pack.width) / 2;
    this.strip.rotation.z = progress * 0.16;
    this.onTearProgress?.(progress);
    if (!this.reduced && progress > 0.02 && this.random() < 0.6) this.emit(new THREE.Vector3(-pack.width / 2 + progress * pack.width, pack.height / 2 - pack.strip + this.pack.position.y, 0.05), 3, 0.25, [1, 0.92, 0.75]);
  }

  /** Tears the pack open: the strip flies off. Resolves when the pack is open. */
  tear() {
    if (this.state !== 'sealed') return Promise.resolve();
    this.state = 'torn';
    this.dragging = false;
    this.sounds?.tear();
    if (this.reduced) { this.strip.visible = false; this.tearLine.visible = false; this.onTearProgress?.(1); return Promise.resolve(); }
    const from = this.tearProgress;
    return new Promise(done => {
      this.tween(0.22, k => this.setTear(from + (1 - from) * k), () => {
        this.tearLine.visible = false;
        this.emit(new THREE.Vector3(0, pack.height / 2 - pack.strip, 0.05), 60, 0.6, [1, 0.9, 0.7]);
        const start = this.strip.position.clone();
        this.tween(0.7, k => { this.strip.position.set(start.x + k * 0.6, start.y + k * 0.9 - k * k * 0.4, start.z + k * 0.3); this.strip.rotation.z = 0.16 + k * 1.4; this.strip.rotation.x = -k * 0.8; }, () => { this.strip.visible = false; done(); }, ease.out);
      }, ease.inOut);
    });
  }

  /** Deals the opened pack's cards: each slides out of the pack face down and the pack drops away. `entries` carries the facts each card is revealed with. */
  deal(entries) {
    this.entries = entries;
    this.state = 'dealing';
    for (let index = 0; index < entries.length; index++) {
      const placeholder = new THREE.Group();
      const back = new THREE.Mesh(this.cardGeometry, this.materials.cardBack);
      back.position.z = 0.004;
      const edge = new THREE.Mesh(this.cardGeometry, this.materials.cardEdge);
      edge.scale.setScalar(1.012);
      placeholder.add(edge, back);
      placeholder.position.set(0, -0.05, -0.02 - index * 0.004);
      placeholder.scale.setScalar(0.92);
      placeholder.visible = this.reduced;
      this.scene.add(placeholder);
      this.cards.push({ placeholder, forge: null, entry: entries[index], revealed: false });
    }
    const slots = entries.map((_, index) => this.stackSlot(index));
    if (this.reduced) {
      this.zoomTo(dealtFit, 0);
      this.pack.visible = false;
      this.cards.forEach((card, index) => this.place(card.placeholder, slots[index]));
      this.state = 'ready';
      this.focusNext();
      return Promise.resolve();
    }
    this.sounds?.deal();
    this.zoomTo(dealtFit, 1.2);
    return new Promise(done => {
      this.cards.forEach((card, index) => {
        const object = card.placeholder;
        setTimeout(() => {
          if (this.disposed) return;
          object.visible = true;
          const slot = slots[index];
          this.tween(0.45, k => { object.position.set(0, -0.05 + k * 1.05, 0.05 + index * 0.002); object.rotation.z = (k - 0.5) * 0.08; }, () => {
            this.tween(0.5, k => { object.position.set(slot.x * k, 1.0 + (slot.y - 1.0) * k, 0.05 + (slot.z - 0.05) * k); object.rotation.set(0, 0, slot.rz * k); object.scale.setScalar(0.92 + (slot.s - 0.92) * k); }, null, ease.out);
          }, ease.out);
        }, index * 110);
      });
      setTimeout(() => {
        if (this.disposed) return;
        this.tween(0.6, k => { this.pack.position.y = -k * 1.9; this.pack.rotation.x = k * 0.4; }, () => { this.pack.visible = false; this.state = 'ready'; this.focusNext(); setTimeout(done, 520); }, ease.inOut);
      }, entries.length * 110 + 450);
    });
  }

  stackSlot(index) {
    const span = 2 * Math.tan(THREE.MathUtils.degToRad(15));
    const half = (this.distance(dealtFit) * span * this.camera.aspect) / 2;
    const x = Math.max(0.62, Math.min(1.1, half - 0.26));
    return { x: x + index * 0.012, y: -0.1 - index * 0.006, z: -0.3 - index * 0.004, rz: -0.05 + index * 0.01, s: 0.6 };
  }

  place(object, slot) {
    object.position.set(slot.x, slot.y, slot.z);
    object.rotation.set(0, 0, slot.rz);
    object.scale.setScalar(slot.s);
  }

  focusNext() {
    const index = this.cards.findIndex(card => !card.revealed);
    this.current = index;
    if (index < 0) { this.state = 'done'; return; }
    const object = this.cards[index].placeholder;
    const from = { x: object.position.x, y: object.position.y, z: object.position.z, s: object.scale.x, rz: object.rotation.z };
    const to = { x: 0, y: focusY, z: 0.2, s: focusScale, rz: 0 };
    if (this.reduced) { this.place(object, { ...to, rz: 0 }); return; }
    this.tween(0.42, k => { object.position.set(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, from.z + (to.z - from.z) * k); object.rotation.set(0, 0, from.rz * (1 - k)); object.scale.setScalar(from.s + (to.s - from.s) * k); }, null, ease.out);
  }

  /** Builds the forge card for an entry ahead of its reveal, so the flip never waits on a shader compile. */
  prepare(index) {
    const card = this.cards[index];
    if (!card || card.forge || !card.entry.facts) return;
    card.forge = new ForgeScene(card.entry.before ?? card.entry.facts, { motion: 'live' });
    card.forge.scene.remove(card.forge.group);
    card.holder = new THREE.Group();
    card.holder.add(card.forge.group);
    card.holder.scale.setScalar(0.0001);
    card.holder.position.set(0, 0, -1);
    this.scene.add(card.holder);
    this.renderer.compile(this.scene, this.camera);
  }

  /** Reveals the focused card: anticipation for the pull, the flip, the foil wiping in, and for an upgrade the finish rising. Resolves when it has settled. */
  reveal() {
    const index = this.current;
    const card = this.cards[index];
    if (!card || this.state !== 'ready') return Promise.resolve(null);
    this.state = 'charging';
    this.prepare(index);
    const forge = card.forge;
    const intensity = card.entry.intensity ?? { level: 0, chargeMs: 450, burst: 40 };
    const holder = card.holder ?? new THREE.Group();
    if (!card.holder) { this.scene.add(holder); card.holder = holder; }
    holder.position.copy(card.placeholder.position);
    holder.scale.copy(card.placeholder.scale);
    holder.rotation.set(0, Math.PI, 0);
    if (forge) forge.uniforms.uWipe.value = card.entry.pull && !this.reduced ? -0.2 : 2;
    card.placeholder.visible = false;
    const preview = forge && card.entry.preview;
    if (preview) forge.uniforms.uCover.value.set(1, 1, 1);
    const finish = () => {
      card.revealed = true;
      this.state = 'revealed';
      if (forge && card.entry.before) forge.setFacts(card.entry.facts, { ceremony: !this.reduced });
      return card.entry;
    };
    if (this.reduced) {
      holder.rotation.set(0, 0, 0);
      if (forge) { forge.uniforms.uWipe.value = 2; const c = card.entry.facts.coverage; forge.uniforms.uCover.value.set(c.frame, c.art, c.card); }
      return Promise.resolve(finish());
    }
    const level = intensity.level;
    const charge = intensity.chargeMs / 1000;
    this.glow.material.color.setHex(glowColors[level]);
    this.sounds?.charge(charge, level);
    return new Promise(done => {
      this.charging = { holder, level, t: 0 };
      this.tween(charge, k => {
        this.glow.material.opacity = k * (0.12 + level * 0.1);
        this.glow.scale.setScalar(0.9 + k * (0.35 + level * 0.25));
        this.glow.position.set(holder.position.x, holder.position.y, holder.position.z - 0.15);
        if (forge && level >= 1) forge.uniforms.uFlash.value = (0.5 + 0.5 * Math.sin(this.time * Math.PI * 4)) * k * 0.05 * level;
        const shake = k * k * (0.004 + level * 0.006);
        holder.rotation.z = Math.sin(this.time * 60) * shake * 4;
        holder.position.x = Math.sin(this.time * 47) * shake;
        if (level > 0 && this.random() < 0.4 + level * 0.15) this.converge(holder.position, level);
      }, () => {
        this.charging = null;
        holder.position.x = 0;
        holder.rotation.z = 0;
        if (forge) forge.uniforms.uFlash.value = 0;
        this.tween(0.55, k => { holder.rotation.y = Math.PI * (1 - k); holder.scale.setScalar(focusScale + Math.sin(Math.PI * k) * 0.06); }, null, ease.back);
        setTimeout(() => {
          if (this.disposed) return;
          this.sounds?.reveal(level);
          this.emit(holder.position.clone().add(new THREE.Vector3(0, 0, 0.1)), intensity.burst, 0.9 + level * 0.35, null);
          this.tween(1.2, k => { this.bloom.strength = this.bloomBase + (0.25 + level * 0.32) * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k * 0.3); this.glow.material.opacity = (0.12 + level * 0.1) * (1 - k); }, () => { this.bloom.strength = this.bloomBase; this.glow.material.opacity = 0; }, ease.linear);
          if (forge && level >= 2) this.tween(0.5, k => { forge.uniforms.uFlash.value = 0.45 * (1 - k); }, () => { forge.uniforms.uFlash.value = 0; }, ease.out);
          if (forge && card.entry.pull) this.tween(0.95, k => { forge.uniforms.uWipe.value = -0.2 + k * 1.45; }, () => { forge.uniforms.uWipe.value = 2; }, ease.inOut);
        }, 260);
        setTimeout(() => {
          if (this.disposed) return;
          const entry = finish();
          if (preview) {
            const c = card.entry.facts.coverage;
            setTimeout(() => { if (!this.disposed && card.forge) this.tween(0.9, k => forge.uniforms.uCover.value.set(1 + (c.frame - 1) * k, 1 + (c.art - 1) * k, 1 + (c.card - 1) * k), null, ease.inOut); }, 1100);
          }
          done(entry);
        }, 1150);
      }, ease.inOut);
    });
  }

  /** Moves the revealed card away and brings the next one forward; resolves with whether a card is left to reveal. */
  advance() {
    const card = this.cards[this.current];
    if (!card || this.state !== 'revealed') return Promise.resolve(this.cards.some(item => !item.revealed));
    this.state = 'moving';
    const holder = card.holder;
    const finishMove = () => {
      if (card.forge) { card.forge.dispose(); card.forge = null; }
      if (holder) { this.scene.remove(holder); }
      const next = this.cards.findIndex(item => !item.revealed);
      if (next < 0) { this.state = 'done'; return false; }
      this.state = 'ready';
      this.focusNext();
      setTimeout(() => this.prepare(this.cards.findIndex(item => !item.revealed && item !== this.cards[this.current])), 600);
      return true;
    };
    if (this.reduced || !holder) return Promise.resolve(finishMove());
    const from = holder.position.clone();
    return new Promise(done => this.tween(0.45, k => { holder.position.set(from.x - k * 1.3, from.y - k * 0.25, from.z - k * 0.4); holder.scale.setScalar(focusScale * (1 - k * 0.5)); holder.rotation.z = k * 0.25; }, () => done(finishMove()), ease.inOut));
  }

  /** Ends the ceremony at once: every card counts as revealed. */
  skip() {
    for (const card of this.cards) card.revealed = true;
    this.state = 'done';
  }

  emit(origin, amount, speed, color) {
    if (this.reduced) return;
    for (let n = 0; n < amount; n++) {
      const theta = this.random() * Math.PI * 2;
      const phi = Math.acos(2 * this.random() - 1);
      const v = speed * (0.35 + this.random() * 0.65);
      const hue = color ?? new THREE.Color().setHSL(this.random(), 0.85, 0.7).toArray();
      this.particles.spawn({ x: origin.x, y: origin.y, z: origin.z, vx: Math.sin(phi) * Math.cos(theta) * v, vy: Math.sin(phi) * Math.sin(theta) * v, vz: Math.abs(Math.cos(phi)) * v * 0.5, color: hue, life: 0.7 + this.random() * 0.9 });
    }
    this.particles.geometry.attributes.color.needsUpdate = true;
  }

  converge(target, level) {
    const angle = this.random() * Math.PI * 2;
    const radius = 0.9 + this.random() * 0.4;
    const start = new THREE.Vector3(target.x + Math.cos(angle) * radius, target.y + Math.sin(angle) * radius, target.z);
    const v = new THREE.Vector3().subVectors(target, start).multiplyScalar(1.6);
    this.particles.spawn({ x: start.x, y: start.y, z: start.z, vx: v.x, vy: v.y, vz: v.z, color: new THREE.Color(glowColors[level]).toArray(), life: 0.6 });
    this.particles.geometry.attributes.color.needsUpdate = true;
  }

  tween(duration, step, done, curve = ease.out) { this.tweens.push({ t: 0, duration, step, done, curve }); }

  updateCardUniforms(card, dt) {
    const forge = card.forge;
    if (!forge || !card.holder) return;
    forge.step(dt);
    forge.state.light.set(this.pointer.x * 0.8, this.pointer.y * 0.6);
    const group = forge.group;
    group.rotation.set(-this.pointer.y * 0.12, this.pointer.x * 0.18, 0);
    group.updateMatrixWorld(true);
    const view = this.camera.position.clone().sub(new THREE.Vector3().setFromMatrixPosition(group.matrixWorld)).normalize().applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()).invert());
    forge.uniforms.uV.value.copy(view);
  }

  tick(now) {
    if (this.disposed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tween = this.tweens[i];
      tween.t += dt / tween.duration;
      const k = Math.min(1, tween.t);
      tween.step(tween.curve(k));
      if (k >= 1) { this.tweens.splice(i, 1); tween.done?.(); }
    }
    if (this.pack.visible) {
      const tilt = this.reduced ? 0 : 1;
      this.pack.rotation.y += ((this.pointer.x * 0.35 + Math.sin(this.time * 0.6) * 0.06 - 0.16) * tilt - this.pack.rotation.y) * 0.08;
      if (this.state === 'sealed') this.pack.rotation.x += ((-this.pointer.y * 0.2 + Math.sin(this.time * 0.45) * 0.03 + 0.05) * tilt - this.pack.rotation.x) * 0.08;
      if (this.state === 'sealed' && !this.reduced) this.pack.position.y = Math.sin(this.time * 1.2) * 0.012;
    }
    this.key.position.set(1.2 + this.pointer.x * 1.4, 1.6 + this.pointer.y * 1.2, 2.4);
    for (const card of this.cards) this.updateCardUniforms(card, dt);
    this.particles.step(dt);
    this.particles.geometry.attributes.position.needsUpdate = true;
    try { this.composer.render(); } catch (error) { this.failed = String(error?.message ?? error); }
    this.frames = (this.frames ?? 0) + 1;
    this.host.dataset.packFrames = String(this.frames);
    this.host.dataset.packState = this.state;
    this.frame = requestAnimationFrame(next => this.tick(next));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.unbind?.();
    this.observer?.disconnect();
    for (const card of this.cards) card.forge?.dispose();
    for (const texture of Object.values(this.textures)) texture.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.scene.traverse(object => { if (object.geometry) object.geometry.dispose(); });
    this.particles.material.dispose();
    this.environment.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}

/** Loads the ceremony's fonts and creates it in `host`. */
export async function createPackCeremony(host, options) {
  await fontsReady([...faceFonts, `800 64px ${sans}`]);
  return new PackCeremony(host, options);
}
