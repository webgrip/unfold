import * as THREE from '../../../vendor/three/three-module.js';
import { RoomEnvironment } from '../../../vendor/three/room-environment.js';
import { RoundedBoxGeometry } from '../../../vendor/three/rounded-box-geometry.js';
import { EffectComposer } from '../../../vendor/three/effect-composer.js';
import { RenderPass } from '../../../vendor/three/render-pass.js';
import { UnrealBloomPass } from '../../../vendor/three/unreal-bloom-pass.js';
import { OutputPass } from '../../../vendor/three/output-pass.js';
import { prelude } from './shader-prelude.js';
import { foils } from './shader-foils.js';
import { art } from './shader-art.js';
import { artWindow, faceCanvases, faceSize, paintBack, paintFace, paintLabel, softenHeight } from './face.js';
import { factsSignature } from './forge-model.js';

const card = Object.freeze({ width: 0.63, height: 0.88, radius: 0.032, depth: 0.014 });
const edges = Object.freeze({
  steel: { color: 0x8d979b, metalness: 0.55, roughness: 0.42 },
  chrome: { color: 0xd3dde6, metalness: 1, roughness: 0.16 },
  gold: { color: 0xf2c35b, metalness: 1, roughness: 0.13 },
});
const stillTime = 3.7;
const stillLight = Object.freeze({ x: 0.55, y: 0.42 });

function roundedShape(width, height, radius) {
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
  return shape;
}

function faceGeometry(shape) {
  const geometry = new THREE.ShapeGeometry(shape, 24);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) uv.setXY(i, (position.getX(i) + card.width / 2) / card.width, (position.getY(i) + card.height / 2) / card.height);
  return geometry;
}

function texture(source, colorSpace = THREE.NoColorSpace) {
  const map = new THREE.CanvasTexture(source);
  map.colorSpace = colorSpace;
  map.anisotropy = 8;
  return map;
}

const vertex = 'out vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

function frontShader(artKey, patternKey) {
  return `precision highp float; precision highp int;
uniform sampler2D uFace, uMask, uHeight;
uniform vec4 uArtRect; uniform float uTime; uniform vec2 uP; uniform vec3 uV; uniform float uIntensity; uniform vec3 uCover; uniform float uBorder;
uniform float uSeed; uniform float uCrack, uMend, uCrackSeed; uniform vec2 uImpact; uniform float uFlash, uDesat; uniform float uRelief; uniform vec2 uTexel; uniform float uArtDepth;
in vec2 vUv; out vec4 outColor;
${prelude}
${foils}
${art}
vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
vec2 crackField(vec2 uv){
  vec2 q = (uv - uImpact) * vec2(0.716, 1.0);
  float best = 9.0, reach = 0.0;
  for (int k = 0; k < 6; k++) {
    float fk = float(k) + uCrackSeed * 17.0;
    float a = float(k) * 1.0471976 + (hash11(fk + 3.1) - 0.5) * 0.9;
    float len = 0.22 + 0.5 * hash11(fk * 7.3);
    vec2 dir = vec2(cos(a), sin(a));
    vec2 p0 = vec2(0.0);
    for (int s = 0; s < 8; s++) {
      float fs = float(s);
      float turn = (hash11(fk * 13.0 + fs * 1.7) - 0.5) * 0.9;
      dir = normalize(dir + vec2(-dir.y, dir.x) * turn);
      vec2 p1 = p0 + dir * len / 8.0;
      float d = seg(q, p0, p1);
      float along = (fs + 0.5) / 8.0 * len;
      if (d < best) { best = d; reach = along; }
      if (s == 3) {
        vec2 bdir = normalize(dir + vec2(-dir.y, dir.x) * (hash11(fk) > 0.5 ? 1.2 : -1.2));
        vec2 b1 = p1 + bdir * len * 0.22;
        float db = seg(q, p1, b1);
        if (db < best) { best = db; reach = along + 0.05; }
      }
      p0 = p1;
    }
  }
  return vec2(best, reach);
}
void main(){
  vec4 face = texture(uFace, vUv);
  vec4 m = texture(uMask, vUv);
  float hC = texture(uHeight, vUv).r;
  float hL = texture(uHeight, vUv - vec2(uTexel.x, 0.0)).r;
  float hR = texture(uHeight, vUv + vec2(uTexel.x, 0.0)).r;
  float hD = texture(uHeight, vUv - vec2(0.0, uTexel.y)).r;
  float hU = texture(uHeight, vUv + vec2(0.0, uTexel.y)).r;
  vec3 N = normalize(vec3((hL - hR) * uRelief, (hD - hU) * uRelief, 1.0));
  vec3 Vd = normalize(uV);
  vec2 auv = (vUv - uArtRect.xy) / (uArtRect.zw - uArtRect.xy);
  vec2 par = -Vd.xy / max(Vd.z, 0.35) * uArtDepth;
  vec3 artC = art_${artKey}(clamp((auv - 0.5) * 0.9 + 0.5 + par, 0.0, 1.0), uTime);
  vec2 wall = auv + par * 2.2;
  float edgeDist = min(min(wall.x, 1.0 - wall.x), min(wall.y * 1.4, (1.0 - wall.y) * 1.4));
  artC *= mix(0.4, 1.0, smoothstep(-0.005, 0.07, edgeDist));
  vec3 base = mix(artC, face.rgb, face.a);
  float luma = dot(base, vec3(0.2126, 0.7152, 0.0722));
  FoilIn fb = FoilIn(vUv, uP, Vd, uTime, base, luma, m.r, m.g, m.b, uSeed, uIntensity);
  vec3 matte = foil_none(fb);
  float cover = clamp(m.g * uCover.x + m.r * uCover.y + (1.0 - clamp(m.g + m.r, 0.0, 1.0)) * uCover.z, 0.0, 1.0);
  FoilIn ff = fb;
  ff.intensity = uIntensity * cover;
  vec3 foiled = foil_${patternKey}(ff);
  vec3 col = mix(matte, foiled, step(0.001, cover));
  if (uBorder > 0.5) {
    vec2 q = (vUv - 0.5) * vec2(0.716, 1.0);
    float ang = atan(q.y, q.x) / TAU + 0.5;
    float d = fract(fract(uTime * 0.085) - ang);
    float comet = exp(-d * 7.0) * 0.9 + exp(-(1.0 - d) * 90.0);
    float d2 = fract(fract(uTime * 0.085 + 0.5) - ang);
    comet += exp(-d2 * 7.0) * 0.5;
    float band = m.g * (1.0 - m.r);
    vec3 hue = spectrum(ang * 2.0 - uTime * 0.04);
    col = fl_screen(col, (hue * 0.6 + 0.3) * comet * band * 0.8);
  }
  vec2 pos = (vUv - 0.5) * vec2(0.716, 1.0);
  vec2 lp = uP * vec2(0.716, 1.0) * 0.62;
  vec3 L = normalize(vec3(lp - pos, 0.48));
  float lambert = dot(N, L) - L.z;
  vec3 Hh = normalize(L + Vd);
  float shine = clamp((hC - 0.52) * 2.5, 0.0, 1.0) * 0.45 * (1.0 - m.b * 0.5) + m.g * (1.0 - m.r) * 0.6;
  float spec = max(pow(clamp(dot(N, Hh), 0.0, 1.0), 48.0) - pow(clamp(Hh.z, 0.0, 1.0), 48.0), 0.0);
  col *= 1.0 + lambert * 1.4;
  col += spec * shine * vec3(1.0, 0.96, 0.88) * 0.85;
  if (uCrack > 0.0) {
    vec2 cf = crackField(vUv);
    float on = step(cf.y, uCrack * 0.7 + 0.02);
    float line = smoothstep(0.0032, 0.0006, cf.x) * on;
    float halo = smoothstep(0.012, 0.0, cf.x) * on;
    float gold = uMend > 0.0 ? step(cf.y, uMend * 0.7 + 0.02) : 0.0;
    vec3 dark = mix(col * 0.45, vec3(0.02), line);
    col = mix(col, dark, line * (1.0 - gold) + halo * 0.25 * (1.0 - gold));
    vec3 g = vec3(1.0, 0.8, 0.38) * (1.02 + 0.18 * sin(uTime * 3.0 + cf.y * 40.0));
    float ridge = 0.85 + 0.45 * max(dot(normalize(vec3(L.xy, 0.8)), vec3(0.0, 0.0, 1.0)), 0.0);
    col = mix(col, g * ridge, line * gold);
    col += vec3(1.0, 0.7, 0.3) * halo * gold * 0.14;
  }
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(l), uDesat);
  col += uFlash * vec3(1.0, 0.95, 0.85);
  outColor = vec4(toLin(col), 1.0);
}`;
}

const backShader = `precision highp float; uniform sampler2D uBack; uniform float uTime; uniform vec3 uV; in vec2 vUv; out vec4 outColor;
${prelude}
void main(){ vec3 c = texture(uBack, vUv).rgb; vec2 cell = vUv * vec2(90.0, 126.0); vec2 g = floor(cell); float s = hash12(g);
  float dotMask = smoothstep(0.32, 0.0, length(fract(cell) - 0.5 - (hash22(g) - 0.5) * 0.4));
  float tw = pow(sat(sin(uTime * 2.0 + s * 40.0 + uV.x * 9.0) * 0.5 + 0.5), 24.0) * step(0.9, s) * dotMask * 0.7;
  float sheen = exp(-pow((vUv.x + vUv.y - 1.0 - uV.x * 1.5) * 3.0, 2.0)); c += vec3(0.6, 0.75, 1.0) * sheen * 0.18 + tw * 0.8; outColor = vec4(pow(c, vec3(2.2)), 1.0); }`;

/**
 * A WebGL2 renderer with its post-processing chain (a render pass, a soft bloom and the sRGB output pass) and a room
 * environment for the metal edge. The hero card owns one; every other forge card on a page shares one that draws
 * still frames.
 */
export class ForgeStage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'default' });
    this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.failed = null;
    this.renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => { this.failed = gl.getShaderInfoLog(fragmentShader) || gl.getProgramInfoLog(program) || 'Shader compile failed'; };
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.pass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.5, 0.84);
    this.composer.addPass(this.pass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.size = { width: 0, height: 0 };
  }

  /** Sizes the drawing buffer to `width` × `height` CSS pixels; the canvas's own size comes from CSS. */
  setSize(width, height) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === this.size.width && h === this.size.height) return;
    this.size = { width: w, height: h };
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
  }

  /** Draws `scene` once. */
  render(scene) {
    scene.scene.environment = this.environment;
    this.pass.scene = scene.scene;
    this.pass.camera = scene.camera;
    scene.frame(this.size.width / this.size.height);
    this.bloom.strength = scene.bloomStrength;
    this.composer.render();
  }

  dispose() {
    this.environment.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

const spring = (current, velocity, target, stiffness, damping, dt) => { const v = velocity + ((target - current) * stiffness - velocity * damping) * dt; return [current + v * dt, v]; };

/**
 * One card's 3D scene: the extruded body with its metal edge, the composited front (face canvas over art, foil within
 * the earned coverage, relief lit by the moving light, cracks or kintsugi), the back, the grading slab when the card
 * has a grade, ambient motes and the springs that tilt and turn it. It draws nothing itself; a `ForgeStage` renders it.
 */
export class ForgeScene {
  constructor(facts, { motion }) {
    this.motion = motion;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 0.75, 0.1, 50);
    this.canvases = faceCanvases();
    this.textures = { face: texture(this.canvases.face), mask: texture(this.canvases.mask), height: null, back: texture(this.canvases.back), label: texture(this.canvases.label, THREE.SRGBColorSpace) };
    this.textures.mask.anisotropy = 1;
    this.disposables = [];
    this.tweens = [];
    this.state = { rx: -0.05, ry: 0.12, vx: 0, vy: 0, spin: 0, spinV: 0, spinT: 0, hover: false, px: 0, py: 0, dragging: false, lastX: 0, dropY: 0, dropV: 0, t: stillTime, light: new THREE.Vector2(stillLight.x, stillLight.y) };
    this.bloomStrength = 0.32;
    this.build();
    this.setFacts(facts, { ceremony: false });
  }

  build() {
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(1, 1.4, 2);
    this.keyLight = keyLight;
    this.scene.add(keyLight, new THREE.AmbientLight(0x8899aa, 0.35));
    const background = document.createElement('canvas');
    background.width = 256;
    background.height = 320;
    const g = background.getContext('2d');
    const glow = g.createRadialGradient(128, 110, 8, 128, 160, 230);
    glow.addColorStop(0, '#1d2a35');
    glow.addColorStop(0.55, '#0a0f13');
    glow.addColorStop(1, '#040506');
    g.fillStyle = glow;
    g.fillRect(0, 0, 256, 320);
    this.scene.background = texture(background, THREE.SRGBColorSpace);
    this.disposables.push(this.scene.background);

    this.group = new THREE.Group();
    this.tilt = new THREE.Group();
    this.group.add(this.tilt);
    this.scene.add(this.group);
    const shape = roundedShape(card.width, card.height, card.radius);
    this.edgeMaterial = new THREE.MeshPhysicalMaterial({ color: edges.chrome.color, metalness: 1, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1 });
    const edgeGeometry = new THREE.ExtrudeGeometry(shape, { depth: card.depth, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 24 });
    edgeGeometry.translate(0, 0, -card.depth / 2);
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    this.tilt.add(new THREE.Mesh(edgeGeometry, [hidden, this.edgeMaterial]));
    this.disposables.push(edgeGeometry, hidden, this.edgeMaterial);

    this.uniforms = {
      uFace: { value: this.textures.face }, uMask: { value: this.textures.mask }, uHeight: { value: null },
      uArtRect: { value: new THREE.Vector4(artWindow.x0 / faceSize.width, 1 - artWindow.y1 / faceSize.height, artWindow.x1 / faceSize.width, 1 - artWindow.y0 / faceSize.height) },
      uTime: { value: stillTime }, uP: { value: this.state.light }, uV: { value: new THREE.Vector3(0, 0, 1) }, uIntensity: { value: 1 }, uCover: { value: new THREE.Vector3() }, uBorder: { value: 0 },
      uSeed: { value: 0 }, uCrack: { value: 0 }, uMend: { value: 0 }, uCrackSeed: { value: 0 }, uImpact: { value: new THREE.Vector2(0.62, 0.58) }, uFlash: { value: 0 }, uDesat: { value: 0 },
      uRelief: { value: 8 }, uTexel: { value: new THREE.Vector2(1.6 / faceSize.width, 1.6 / faceSize.height) }, uArtDepth: { value: 0.05 },
    };
    this.faceGeometry = faceGeometry(shape);
    this.disposables.push(this.faceGeometry);
    this.front = new THREE.Mesh(this.faceGeometry, new THREE.MeshBasicMaterial());
    this.front.position.z = card.depth / 2 + 0.0017;
    this.tilt.add(this.front);
    const backMaterial = new THREE.ShaderMaterial({ uniforms: { uBack: { value: this.textures.back }, uTime: this.uniforms.uTime, uV: this.uniforms.uV }, vertexShader: vertex, fragmentShader: backShader, glslVersion: THREE.GLSL3 });
    const back = new THREE.Mesh(this.faceGeometry, backMaterial);
    back.rotation.y = Math.PI;
    back.position.z = -card.depth / 2 - 0.0017;
    this.tilt.add(back);
    this.disposables.push(backMaterial);

    this.slab = new THREE.Group();
    const slabMaterial = new THREE.MeshPhysicalMaterial({ color: 0x8fa3b8, metalness: 0, roughness: 0.08, clearcoat: 0.5, clearcoatRoughness: 0.1, specularIntensity: 0.45, transparent: true, opacity: 0.035, depthWrite: false, envMapIntensity: 0.22, side: THREE.DoubleSide });
    const slabGeometry = new RoundedBoxGeometry(card.width + 0.09, card.height + 0.28, 0.07, 4, 0.02);
    const slabBody = new THREE.Mesh(slabGeometry, slabMaterial);
    slabBody.position.y = 0.085;
    const labelGeometry = new THREE.PlaneGeometry(card.width + 0.04, 0.17);
    const labelMaterial = new THREE.MeshBasicMaterial({ map: this.textures.label, color: 0xdedede });
    const label = new THREE.Mesh(labelGeometry, labelMaterial);
    label.position.set(0, card.height / 2 + 0.115, 0.036);
    this.slab.add(slabBody, label);
    this.slab.visible = false;
    this.tilt.add(this.slab);
    this.disposables.push(slabMaterial, slabGeometry, labelGeometry, labelMaterial);

    if (this.motion === 'live') this.buildMotes();
  }

  buildMotes() {
    const count = 140;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    this.motes = { positions, speeds: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
      positions.set([(Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.2, -0.5 - Math.random() * 1.4], i * 3);
      sizes[i] = 0.004 + Math.random() * 0.008;
      this.motes.speeds[i] = 0.01 + Math.random() * 0.03;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uScale: { value: 300 }, uTime: this.uniforms.uTime },
      vertexShader: 'attribute float size; uniform float uScale; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = 0.25 + 0.2 * sin(position.x * 40.0); gl_PointSize = min(24.0, size * uScale / max(0.35, -mv.z)); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; gl_FragColor = vec4(vec3(0.5, 0.62, 0.85) * smoothstep(0.5, 0.0, r) * vA, 1.0); }',
    });
    this.motes.geometry = geometry;
    this.motes.material = material;
    this.scene.add(new THREE.Points(geometry, material));
    this.disposables.push(geometry, material);
  }

  /** Paints and applies `facts`. A changed condition on a live card plays its moment: the crack spreading, or the kintsugi filling it with gold. */
  setFacts(facts, { ceremony = this.motion === 'live' } = {}) {
    const signature = factsSignature(facts);
    if (signature === this.signature) return false;
    const previous = this.facts;
    this.facts = facts;
    this.signature = signature;
    paintFace(this.canvases, facts);
    paintBack(this.canvases.back, facts);
    if (facts.grade) paintLabel(this.canvases.label, facts);
    const soft = softenHeight(this.canvases.height, 2.2);
    this.textures.height?.dispose();
    this.textures.height = texture(soft);
    this.uniforms.uHeight.value = this.textures.height;
    for (const key of ['face', 'mask', 'back', 'label']) this.textures[key].needsUpdate = true;
    if (!previous || previous.art.key !== facts.art.key || previous.pattern.key !== facts.pattern.key) {
      const material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vertex, fragmentShader: frontShader(facts.art.key, facts.pattern.key), glslVersion: THREE.GLSL3 });
      this.front.material.dispose();
      this.front.material = material;
    }
    const coverage = facts.coverage;
    this.uniforms.uCover.value.set(coverage.frame, coverage.art, coverage.card);
    this.uniforms.uBorder.value = coverage.border ? 1 : 0;
    this.uniforms.uSeed.value = facts.seed;
    this.uniforms.uCrackSeed.value = facts.seed;
    this.uniforms.uImpact.value.set(0.36 + facts.seed * 0.3, 0.42 + ((facts.seed * 7.31) % 1) * 0.24);
    const edge = edges[facts.edge] ?? edges.chrome;
    this.edgeMaterial.color.setHex(edge.color);
    this.edgeMaterial.metalness = edge.metalness;
    this.edgeMaterial.roughness = edge.roughness;
    this.slab.visible = Boolean(facts.grade);
    this.group.scale.setScalar(facts.grade ? 0.84 : 1);
    this.baseY = facts.grade ? -0.075 : 0;
    const was = previous?.condition?.state ?? null;
    const now = facts.condition?.state ?? null;
    if (ceremony && now === 'cracked' && was !== 'cracked') this.tween(0.5, k => { this.uniforms.uCrack.value = k; this.uniforms.uMend.value = 0; }, null, x => 1 - Math.pow(1 - x, 4));
    else if (ceremony && now === 'mended' && was !== 'mended') { this.uniforms.uCrack.value = 1; this.tween(2.2, k => { this.uniforms.uMend.value = k; }, null, x => x * x * (3 - 2 * x)); }
    else { this.uniforms.uCrack.value = now ? 1 : 0; this.uniforms.uMend.value = now === 'mended' ? 1 : 0; }
    return true;
  }

  tween(duration, step, done, ease = x => 1 - Math.pow(1 - x, 3)) { this.tweens.push({ t: 0, duration, step, done, ease }); }

  /** The first appearance of a live card: it drops in face down and turns over, with a short bloom swell for earned foil. */
  reveal() {
    const s = this.state;
    s.dropY = 1.2;
    s.dropV = 0;
    s.spin = Math.PI;
    s.spinT = 0;
    const peak = 0.25 + this.facts.coverage.level * 0.12;
    this.tween(1.6, k => { this.bloomStrength = 0.32 + peak * Math.sin(Math.PI * Math.min(1, k * 1.3)); }, () => { this.bloomStrength = 0.32; }, x => x);
  }

  /** Turns the card over to show its back, or back to its front. */
  turn() {
    const s = this.state;
    s.spinT = Math.round(s.spinT / Math.PI) % 2 === 0 ? s.spinT + Math.PI : s.spinT - Math.PI;
    if (this.motion !== 'live') { s.spin = s.spinT; s.spinV = 0; }
  }

  /** Whether the back is the face toward the viewer. */
  get showingBack() { return Math.abs(Math.round(this.state.spinT / Math.PI)) % 2 === 1; }

  pointer(x, y) {
    const s = this.state;
    s.px = x;
    s.py = y;
    s.hover = true;
  }

  leave() { this.state.hover = false; }

  dragStart(x) { this.state.dragging = true; this.state.lastX = x; }

  dragMove(x) {
    const s = this.state;
    if (!s.dragging) return;
    const dx = x - s.lastX;
    s.lastX = x;
    s.spinT += dx * 0.012;
    s.spinV = dx * 0.6;
  }

  dragEnd() {
    const s = this.state;
    if (!s.dragging) return;
    s.dragging = false;
    s.spinT = Math.round((s.spinT + s.spinV * 0.08) / Math.PI) * Math.PI;
  }

  /** Advances the springs, tweens and motes by `dt` seconds. */
  step(dt) {
    const s = this.state;
    s.t += dt;
    this.uniforms.uTime.value = s.t;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tween = this.tweens[i];
      tween.t += dt / tween.duration;
      const k = Math.min(1, tween.t);
      tween.step(tween.ease(k));
      if (k >= 1) { this.tweens.splice(i, 1); tween.done?.(); }
    }
    const targetX = s.hover ? -s.py * 0.24 : Math.sin(s.t * 0.55) * 0.06 - 0.03;
    const targetY = s.hover ? s.px * 0.32 : Math.sin(s.t * 0.37) * 0.11;
    [s.rx, s.vx] = spring(s.rx, s.vx, targetX, 60, 9, dt);
    [s.ry, s.vy] = spring(s.ry, s.vy, targetY, 60, 9, dt);
    [s.spin, s.spinV] = spring(s.spin, s.spinV, s.spinT, 34, 7.5, dt);
    [s.dropY, s.dropV] = spring(s.dropY, s.dropV, 0, 26, 6.5, dt);
    const light = s.hover ? new THREE.Vector2(s.px, -s.py) : new THREE.Vector2(Math.sin(s.t * 0.43) * 0.6, Math.cos(s.t * 0.31) * 0.5);
    s.light.lerp(light, 0.12);
    s.bob = Math.sin(s.t * 1.1) * 0.01;
    if (this.motes) {
      const { positions, speeds, geometry } = this.motes;
      for (let i = 0; i < speeds.length; i++) { positions[i * 3 + 1] += speeds[i] * dt; if (positions[i * 3 + 1] > 1.1) positions[i * 3 + 1] = -1.1; }
      geometry.attributes.position.needsUpdate = true;
    }
  }

  /** Whether a moment is still playing, so a still card keeps drawing until it settles. */
  get busy() { return this.tweens.length > 0 || Math.abs(this.state.spin - this.state.spinT) > 0.002 || Math.abs(this.state.spinV) > 0.002; }

  /** Settles a still card: final spin, resting tilt and light, no tweens. */
  settle() {
    const s = this.state;
    for (const tween of this.tweens.splice(0)) { tween.step(tween.ease(1)); tween.done?.(); }
    s.spin = s.spinT;
    s.spinV = 0;
    s.rx = -0.05;
    s.ry = this.showingBack ? -0.12 : 0.12;
    s.dropY = 0;
    s.bob = 0;
    s.light.set(stillLight.x, stillLight.y);
    this.uniforms.uTime.value = stillTime + this.facts.seed * 20;
  }

  /** Places the camera and the card for a frame at `aspect` (width / height). */
  frame(aspect) {
    const s = this.state;
    const graded = Boolean(this.facts?.grade);
    const fitHeight = graded ? 1.18 : 1.05;
    const fitWidth = graded ? 0.82 : 0.76;
    const span = 2 * Math.tan(THREE.MathUtils.degToRad(15));
    this.camera.aspect = aspect;
    this.camera.position.set(0, 0, Math.max(fitHeight / span, fitWidth / (span * aspect)));
    this.camera.updateProjectionMatrix();
    this.group.position.set(0, (this.baseY || 0) + s.dropY + (s.bob || 0), 0);
    this.group.rotation.set(s.rx, s.ry + s.spin, 0);
    this.group.updateMatrixWorld();
    const view = this.camera.position.clone().sub(this.group.position).normalize().applyQuaternion(this.group.quaternion.clone().invert());
    this.uniforms.uV.value.copy(view);
    this.keyLight.position.set(s.light.x * 2, s.light.y * 2 + 0.6, 2);
    if (this.motes) this.motes.material.uniforms.uScale.value = this.camera.position.z * 120;
  }

  dispose() {
    for (const item of this.disposables) item.dispose();
    for (const map of Object.values(this.textures)) map?.dispose();
    this.front.material.dispose();
  }
}

/** Waits for the face fonts, so the first painted face uses Archivo rather than a fallback. */
export async function fontsReady(fonts) {
  if (!globalThis.document?.fonts?.load) return;
  await Promise.all(fonts.map(font => document.fonts.load(font).catch(() => null)));
}
