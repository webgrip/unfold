import * as THREE from '../../../../vendor/three/three-module.js';

/** How each particle moves: drifting, a burst that falls, rain, snow that sways, a firefly that wanders, a leaf that flutters. */
export const particleKinds = Object.freeze({ drift: 0, burst: 1, rain: 2, snow: 3, firefly: 4, leaf: 5 });

const vertexShader = 'attribute float size; attribute float alpha; varying vec3 vC; varying float vA; void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(48.0, size * uScale / -mv.z); gl_Position = projectionMatrix * mv; }';
const fragmentShader = 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float c = smoothstep(0.5, 0.0, r); gl_FragColor = vec4(vC * c * vA * 1.6, 1.0); }';

/**
 * The world's particles in one fixed pool drawn as additive points: bursts from clicks, the weather and each world's
 * ambient motion. Under reduced motion it emits nothing.
 */
export class WorldParticles {
  constructor(count = 1400, { reduced = false } = {}) {
    this.count = count;
    this.reduced = reduced;
    this.position = new Float32Array(count * 3);
    this.color = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.velocity = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.kind = new Uint8Array(count);
    this.next = 0;
    this.live = 0;
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.color, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, fog: false, uniforms: { uScale: { value: 420 } }, vertexShader: `uniform float uScale; ${vertexShader}`, fragmentShader });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  /** Adds one particle at (x, y, z) moving at (vx, vy, vz) for `life` seconds. */
  emit(x, y, z, vx, vy, vz, life, size, color, kind = particleKinds.drift) {
    if (this.reduced) return;
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    this.position.set([x, y, z], i * 3);
    this.velocity.set([vx, vy, vz], i * 3);
    this.life[i] = this.maxLife[i] = life;
    this.size[i] = size;
    this.color.set(color, i * 3);
    this.kind[i] = kind;
  }

  /** A burst of `n` sparks from `point` in `colors`, thrown at `speed` and lifted by `up`. */
  burst(point, colors, n = 40, speed = 2.2, up = 1) {
    if (this.reduced) return;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI - Math.PI / 2;
      const v = speed * (0.3 + Math.random());
      this.emit(point.x, point.y, point.z, Math.cos(a) * Math.cos(e) * v, Math.abs(Math.sin(e)) * v * up + 0.6, Math.sin(a) * Math.cos(e) * v, 0.7 + Math.random() * 0.8, 0.04 + Math.random() * 0.05, colors[k % colors.length], particleKinds.burst);
    }
  }

  /** Emits `dt` seconds of `weather` and of the world's own `ambient(emit)`. */
  weather(weather, dt, ambient) {
    if (this.reduced) return;
    const emit = this.emit.bind(this);
    const steps = Math.round(dt * 60);
    for (let k = 0; k < steps; k++) {
      if (weather === 'rain') for (let j = 0; j < 4; j++) emit((Math.random() - 0.5) * 12, 6, (Math.random() - 0.5) * 8, 0, -9 - Math.random() * 3, 0, 0.9, 0.025, [0.6, 0.75, 1], particleKinds.rain);
      if (weather === 'snow') for (let j = 0; j < 2; j++) emit((Math.random() - 0.5) * 12, 6, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 0.3, -0.7 - Math.random() * 0.4, 0, 9, 0.05, [1, 1, 1], particleKinds.snow);
      if (weather === 'fireflies' && Math.random() < 0.25) emit((Math.random() - 0.5) * 6, Math.random() * 2.2, (Math.random() - 0.5) * 4, 0, 0, 0, 5, 0.07, [1, 0.9, 0.4], particleKinds.firefly);
      ambient?.(emit);
    }
  }

  /** Moves and fades every live particle by `dt` seconds at time `t`. */
  update(dt, t) {
    let live = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      live++;
      this.life[i] -= dt;
      const k = this.kind[i];
      const v = this.velocity;
      if (k === particleKinds.burst) v[i * 3 + 1] -= 3.2 * dt;
      if (k === particleKinds.snow) v[i * 3] = Math.sin(t * 1.3 + i) * 0.3;
      if (k === particleKinds.firefly) { v[i * 3] = Math.sin(t * 0.9 + i * 1.7) * 0.25; v[i * 3 + 1] = Math.cos(t * 1.1 + i) * 0.18; v[i * 3 + 2] = Math.sin(t * 0.7 + i * 0.3) * 0.2; }
      if (k === particleKinds.leaf) v[i * 3] += Math.sin(t * 2 + i) * 0.01;
      this.position[i * 3] += v[i * 3] * dt;
      this.position[i * 3 + 1] += v[i * 3 + 1] * dt;
      this.position[i * 3 + 2] += v[i * 3 + 2] * dt;
      const left = this.life[i] / this.maxLife[i];
      this.alpha[i] = k === particleKinds.firefly ? (0.5 + 0.5 * Math.sin(t * 6 + i)) * Math.min(1, left * 3) : k === particleKinds.rain ? 0.55 : Math.min(1, left * 1.8);
    }
    this.live = live;
    const a = this.geometry.attributes;
    a.position.needsUpdate = a.alpha.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = true;
  }

  /** Scales point sizes to the render target's height, so a spark is the same size at any resolution. */
  setScale(height) { this.material.uniforms.uScale.value = 420 * (height / 820); }

  clear() { this.life.fill(0); this.alpha.fill(0); this.live = 0; }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
