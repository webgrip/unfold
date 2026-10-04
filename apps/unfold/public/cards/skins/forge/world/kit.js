import * as THREE from '../../../../vendor/three/three-module.js';

/** A seeded generator (mulberry32) returning numbers in [0, 1), so a card's world is laid out the same on every page. */
export function seededRandom(seed) {
  let state = Math.floor((Number(seed) || 0) * 4294967296) >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A cheap smooth noise in about [-1, 1] for terrain heights and colour variation. */
export function noise3(x, y, z) {
  return Math.sin(x * 1.7 + Math.sin(z * 1.3)) * 0.5 + Math.sin(z * 2.1 + x * 0.7) * 0.35 + Math.sin(y * 3.1 + x * 2.3) * 0.15;
}

/** A flat-shaded matte material. */
export function matte(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8, metalness: 0, ...options });
}

/** A material that glows in `color`, for crystals, lamps and neon. */
export function glowing(color, intensity = 2) {
  return new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, flatShading: true, roughness: 0.4 });
}

let softTexture = null;

/** A soft round sprite (a halo, a cloud) drawn from one shared canvas texture. */
export function softSprite(color, size, opacity = 0.8) {
  if (!softTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const g = canvas.getContext('2d');
    const gradient = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 64, 64);
    softTexture = new THREE.CanvasTexture(canvas);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture, color, transparent: true, opacity, depthWrite: false, fog: true }));
  sprite.scale.setScalar(size);
  return sprite;
}

/** Releases the shared sprite texture once the last world is gone. */
export function releaseShared() {
  softTexture?.dispose();
  softTexture = null;
}

/** A floating island: a grassy top over a tapering rock underside, flat shaded with vertex colours, marked as ground. */
export function island(radius, height, seed, colors = {}) {
  const { grass = 0x6fbf5a, rock = 0x7a5a3c, dirt = 0x9a7650 } = colors;
  const geometry = new THREE.IcosahedronGeometry(radius, 4);
  const position = geometry.attributes.position;
  const tones = [];
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    let x = position.getX(i);
    let y = position.getY(i);
    let z = position.getZ(i);
    if (y > 0) {
      y = 0.05 + noise3(x * 0.8 + seed, 0, z * 0.8) * 0.12 * radius;
      c.set(grass).offsetHSL(0, 0, noise3(x * 3, 1, z * 3) * 0.04);
    } else {
      const d = Math.sqrt(x * x + z * z) / radius;
      y = -height * (1 - d) * (0.8 + 0.4 * (noise3(x * 2 + seed, y, z * 2) * 0.5 + 0.5));
      const taper = 1 - Math.min(1, -y / height);
      x *= 0.6 + 0.4 * taper;
      z *= 0.6 + 0.4 * taper;
      c.set(y > -0.18 ? dirt : rock).offsetHSL(0, 0, noise3(x * 4, y * 4, z * 4) * 0.05);
    }
    position.setXYZ(i, x, y, z);
    tones.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(tones, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
  mesh.userData.ground = true;
  return mesh;
}

/** Disposes every geometry, material and texture under `object`, except the shared sprite texture. */
export function disposeTree(object) {
  object.traverse(node => {
    node.geometry?.dispose?.();
    for (const material of [].concat(node.material ?? [])) {
      for (const value of Object.values(material)) if (value?.isTexture && value !== softTexture) value.dispose();
      material.dispose?.();
    }
  });
}

/** The easing of a pop: a quick overshoot that settles at 1. */
export const overshoot = x => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);
