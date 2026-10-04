import * as THREE from '../../../../vendor/three/three-module.js';

/** The light of each time of day: the sky gradient, the sun's colour, strength and direction, the fog, the stars and the aurora. */
export const skyTones = Object.freeze({
  dawn: Object.freeze({ top: 0x2b3f7a, mid: 0xf2a37a, bottom: 0xffd9a8, sun: 0xffb37a, sunI: 1.6, hemiI: 0.7, fog: 0xe0b4a0, stars: 0.25, aurora: 0, sunDir: [-0.9, 0.18, -0.4] }),
  morning: Object.freeze({ top: 0x3f7fd8, mid: 0x9cc8f2, bottom: 0xe8f3ff, sun: 0xfff1d6, sunI: 2.4, hemiI: 1.1, fog: 0xbcd6f0, stars: 0, aurora: 0, sunDir: [-0.5, 0.6, -0.3] }),
  noon: Object.freeze({ top: 0x2a6fe0, mid: 0x7fb6ff, bottom: 0xd9ecff, sun: 0xffffff, sunI: 2.8, hemiI: 1.2, fog: 0xaecdf2, stars: 0, aurora: 0, sunDir: [0.1, 1, 0.2] }),
  sunset: Object.freeze({ top: 0x3b2a6e, mid: 0xff7a59, bottom: 0xffc46b, sun: 0xff8a4d, sunI: 2.0, hemiI: 0.8, fog: 0xf0a07a, stars: 0.15, aurora: 0, sunDir: [0.9, 0.12, -0.3] }),
  golden: Object.freeze({ top: 0x52306e, mid: 0xf2b45b, bottom: 0xffe2a0, sun: 0xffc36b, sunI: 2.2, hemiI: 0.9, fog: 0xe8c08a, stars: 0.1, aurora: 0, sunDir: [0.7, 0.25, 0.2] }),
  night: Object.freeze({ top: 0x050a1c, mid: 0x0f1d3d, bottom: 0x1d2c52, sun: 0x8fb0ff, sunI: 0.7, hemiI: 0.35, fog: 0x101a33, stars: 1, aurora: 1, sunDir: [-0.3, 0.8, -0.6] }),
});

const vertexShader = 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const fragmentShader = `uniform vec3 top, mid, bottom, sunC, sunDir; uniform float stars, aurora, t; varying vec3 vD;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main(){
  float y = vD.y;
  vec3 c = y > 0.05 ? mix(mid, top, smoothstep(0.05, 0.75, y)) : mix(bottom, mid, smoothstep(-0.25, 0.05, y));
  float s = max(dot(normalize(vD), normalize(sunDir)), 0.0);
  c += sunC * (pow(s, 600.0) * 6.0 + pow(s, 12.0) * 0.35);
  vec3 g = floor(vD * 220.0);
  float st = step(0.9965, h(g)) * smoothstep(0.0, 0.3, y) * stars;
  c += st * (0.6 + 0.4 * sin(t * 3.0 + h(g + 1.0) * 30.0)) * 1.6;
  float a = aurora * smoothstep(0.15, 0.45, y) * smoothstep(0.95, 0.5, y);
  float band = sin(vD.x * 6.0 + sin(vD.z * 4.0 + t * 0.25) * 2.0 + t * 0.15) * 0.5 + 0.5;
  band *= sin(vD.z * 9.0 - t * 0.2 + vD.x * 3.0) * 0.5 + 0.5;
  c += a * band * mix(vec3(0.1, 1.0, 0.55), vec3(0.6, 0.3, 1.0), smoothstep(0.3, 0.8, y)) * 1.4;
  gl_FragColor = vec4(c, 1.0);
}`;

/** The sky dome: a gradient with a sun disc, twinkling stars and, at night, an aurora. */
export class Sky {
  constructor() {
    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunC: { value: new THREE.Color() }, stars: { value: 0 }, aurora: { value: 0 }, t: { value: 0 } },
      vertexShader, fragmentShader,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), this.material);
    this.key = null;
  }

  /**
   * Paints the sky for the time of day `key` and lights `sun` and `hemi` to match; returns its tone. A world under
   * water passes `water`, the colours its sky leans toward and by how much (`share`), so its time of day only tints it.
   */
  apply(key, sun, hemi, water = null) {
    const tone = skyTones[key] ?? skyTones.dawn;
    const u = this.material.uniforms;
    const lean = (uniform, from, to) => { uniform.value.set(from); if (water) uniform.value.lerp(new THREE.Color(to), water.share); };
    lean(u.top, tone.top, water?.top);
    lean(u.mid, tone.mid, water?.mid);
    lean(u.bottom, tone.bottom, water?.bottom);
    lean(u.sunC, tone.sun, water?.sun);
    u.sunDir.value.set(...tone.sunDir).normalize();
    u.stars.value = water ? tone.stars * 0.3 : tone.stars;
    u.aurora.value = water ? 0 : tone.aurora;
    sun.color.set(tone.sun);
    sun.intensity = tone.sunI;
    sun.position.set(...tone.sunDir).multiplyScalar(10);
    hemi.intensity = tone.hemiI;
    this.key = key;
    return tone;
  }

  tick(t) { this.material.uniforms.t.value = t; }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
