import * as THREE from '../../../../vendor/three/three-module.js';
import { glowing, island, matte, noise3, softSprite } from './kit.js';
import { clickable } from './objects.js';
import { particleKinds } from './particles.js';

const fallVertex = 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const fallFragment = 'uniform float t; varying vec2 vU; void main(){ float s = fract(vU.y * 6.0 + t * 1.6 + sin(vU.x * 20.0) * 0.1); float a = (0.55 + 0.45 * s) * smoothstep(0.0, 0.25, vU.x) * smoothstep(1.0, 0.75, vU.x) * smoothstep(0.0, 0.3, vU.y); gl_FragColor = vec4(vec3(0.75, 0.9, 1.0) * (0.8 + s * 0.4), a * 0.85); }';

function caustics(random) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  g.filter = 'blur(2px)';
  g.strokeStyle = 'rgba(160,235,255,0.75)';
  g.lineWidth = 3;
  for (let i = 0; i < 70; i++) {
    const x = random() * 256;
    const y = random() * 256;
    const r = 10 + random() * 22;
    g.beginPath();
    for (let a = 0; a <= 7; a++) {
      const angle = a / 7 * Math.PI * 2;
      const rr = r * (0.7 + 0.3 * Math.sin(a * 2.3 + i));
      const px = x + Math.cos(angle) * rr;
      const py = y + Math.sin(angle) * rr;
      if (a) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(5, 3);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function windows(random) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#05060a';
  g.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 8) {
    if (random() < 0.55) {
      g.fillStyle = ['#ffd27a', '#7ad8ff', '#ff7ad8', '#ffffff'][Math.floor(random() * 4)];
      g.globalAlpha = 0.5 + random() * 0.5;
      g.fillRect(x, y, 4, 4);
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.NearestFilter;
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/**
 * The worlds, by kind. Each `build(group, world, random)` fills `group` with the world's ground (meshes marked
 * `userData.ground`), scenery and its own clickable things, animates them through `world.updaters`, and returns its
 * settings: the fog, a time of day it always shows, the colours its sky leans toward (`water`, with how far), a hook
 * that relights it for a time of day, and its ambient particles.
 */
export const worldBuilders = Object.freeze({
  islands(group, world, random) {
    const main = island(2.3, 2.6, 1.3);
    group.add(main);
    const small = [[-3.4, 0.9, -1.8, 0.7], [3.3, 1.6, -2.4, 0.55], [2.6, -0.6, 1.2, 0.45]].map(([x, y, z, r], i) => {
      const mesh = island(r, r * 1.2, i * 3.1);
      mesh.userData.ground = false;
      mesh.position.set(x, y, z);
      group.add(mesh);
      return { mesh, y, i };
    });
    const fallMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { t: { value: 0 } }, vertexShader: fallVertex, fragmentShader: fallFragment });
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 3.2), fallMaterial);
    fall.position.set(1.55, -1.45, 1.25);
    fall.rotation.y = -0.6;
    group.add(fall);
    const clouds = [];
    for (let i = 0; i < 9; i++) {
      const cloud = softSprite(0xffffff, 2.2 + random() * 2, 0.45);
      cloud.position.set((random() - 0.5) * 14, -1.4 + random() * 3.5, -3 - random() * 5);
      group.add(cloud);
      clouds.push(cloud);
    }
    const birds = new THREE.Group();
    const wing = matte(0x2a2a3a);
    for (let i = 0; i < 6; i++) {
      const bird = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 3), wing);
      bird.rotation.z = Math.PI / 2;
      bird.position.set(i * 0.25, Math.sin(i) * 0.1, i * 0.1);
      birds.add(bird);
    }
    group.add(birds);
    world.updaters.push((dt, t) => {
      fallMaterial.uniforms.t.value = t;
      for (const s of small) { s.mesh.position.y = s.y + Math.sin(t * 0.6 + s.i) * 0.12; s.mesh.rotation.y += dt * 0.05; }
      clouds.forEach((cloud, i) => { cloud.position.x += dt * (0.12 + i * 0.01); if (cloud.position.x > 8) cloud.position.x = -8; });
      birds.position.set(Math.cos(t * 0.25) * 3.5, 2.2 + Math.sin(t * 0.5) * 0.3, Math.sin(t * 0.25) * 2 - 1);
      birds.rotation.y = -t * 0.25 + Math.PI / 2;
    });
    return {
      fogDensity: 0.035,
      ambient: emit => { if (Math.random() < 0.2) emit(1.55 + (Math.random() - 0.5) * 0.7, -3, 1.25 + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 0.4, 0, 1.5, 0.1, [0.3, 0.34, 0.38], particleKinds.drift); },
    };
  },

  deepsea(group, world, random) {
    const floorGeometry = new THREE.PlaneGeometry(16, 10, 60, 40);
    const position = floorGeometry.attributes.position;
    const tones = [];
    for (let i = 0; i < position.count; i++) {
      position.setZ(i, noise3(position.getX(i) * 0.6, 0, position.getY(i) * 0.6) * 0.35);
      const n = noise3(position.getX(i) * 1.7, 3, position.getY(i) * 1.7);
      const c = new THREE.Color(0xd8c08e).lerp(new THREE.Color(0x6a8a8a), n * 0.7);
      tones.push(c.r, c.g, c.b);
    }
    floorGeometry.computeVertexNormals();
    floorGeometry.setAttribute('color', new THREE.Float32BufferAttribute(tones, 3));
    const light = caustics(random);
    const floorMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, emissive: 0x3aa8c8, emissiveMap: light, emissiveIntensity: 0.4 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.2;
    floor.userData.ground = true;
    group.add(floor);
    const stone = matte(0x4a5a66);
    for (let i = 0; i < 9; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + random() * 0.35, 0), stone);
      rock.position.set((random() - 0.5) * 8, -0.15, -0.6 - random() * 3);
      rock.scale.y = 0.6;
      rock.rotation.set(random(), random(), 0);
      group.add(rock);
    }
    const coralColors = [0xff6a6a, 0xff9a4a, 0xff7ad8, 0xffd25a];
    for (let i = 0; i < 7; i++) {
      const coral = new THREE.Group();
      const color = coralColors[i % 4];
      const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, roughness: 0.6 });
      for (let b = 0; b < 5; b++) {
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.045, 0.35 + random() * 0.3, 6), material);
        branch.position.y = 0.18;
        branch.rotation.set((random() - 0.5) * 1.1, 0, (random() - 0.5) * 1.1);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), material);
        tip.position.y = 0.22;
        branch.add(tip);
        coral.add(branch);
      }
      let x;
      let z;
      do { x = (random() - 0.5) * 7; z = -0.3 - random() * 2.6; } while (Math.abs(x) < 0.7 && z > -1.2);
      coral.position.set(x, -0.2, z);
      group.add(coral);
    }
    const fish = [];
    for (let i = 0; i < 14; i++) {
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 4), glowing(i % 3 ? 0xffd27a : 0x7ad8ff, 0.8));
      body.rotation.z = Math.PI / 2;
      group.add(body);
      fish.push({ body, r: 1.2 + (i % 5) * 0.35, h: 0.5 + (i % 4) * 0.3, s: 0.35 + (i % 3) * 0.12, o: i * 0.45 });
    }
    const kelp = [];
    const frond = matte(0x2f8a4a);
    for (let i = 0; i < 16; i++) {
      const stalk = new THREE.Group();
      for (let j = 0; j < 7; j++) {
        const segment = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.02), frond);
        segment.position.y = j * 0.3;
        stalk.add(segment);
      }
      stalk.position.set((random() - 0.5) * 9, -0.2, -1 - random() * 3);
      group.add(stalk);
      kelp.push(stalk);
    }
    const jellies = [0xff7ad8, 0x7ad8ff, 0xc89bff, 0x7affc8].map((color, i) => {
      const material = glowing(color, 1.6);
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), material);
      bell.position.set(-2.5 + i * 1.7, 1.2 + i * 0.3, -0.5 - (i % 2));
      bell.add(softSprite(color, 1.2, 0.35));
      group.add(bell);
      const jelly = { bell, i, boost: 0 };
      clickable(bell, 'jelly', 'Jellyfish', point => {
        jelly.boost = world.reduced ? 0 : 1;
        world.particles.burst(point, [[1, 0.6, 0.9], [0.7, 0.9, 1]], 40, 1.6);
        world.sound('chime', { notes: [523.25, 659.25, 783.99, 1046.5] });
        return 'The jellyfish pulses and rises.';
      });
      return jelly;
    });
    const shafts = [];
    for (let i = 0; i < 4; i++) {
      const material = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.9, 7, 12, 1, true), material);
      shaft.position.set(-3 + i * 2.1, 2.8, -2);
      shaft.rotation.z = 0.25;
      group.add(shaft);
      shafts.push(shaft);
    }
    world.updaters.push((dt, t) => {
      kelp.forEach((stalk, i) => stalk.children.forEach((segment, j) => { segment.rotation.z = Math.sin(t * 0.8 + i + j * 0.4) * 0.08 * j; segment.position.x = Math.sin(t * 0.8 + i + j * 0.3) * 0.03 * j * j; }));
      for (const jelly of jellies) {
        jelly.boost = Math.max(0, jelly.boost - dt);
        jelly.bell.position.y = 1.2 + jelly.i * 0.3 + Math.sin(t * 0.8 + jelly.i) * 0.25 + jelly.boost * 0.6;
        jelly.bell.scale.y = 1 + Math.sin(t * 2.2 + jelly.i) * 0.12;
      }
      shafts.forEach((shaft, i) => { shaft.material.opacity = 0.05 + 0.03 * Math.sin(t * 0.5 + i); });
      light.offset.set(Math.sin(t * 0.13) * 0.4, t * 0.025);
      floorMaterial.emissiveIntensity = 0.32 + 0.1 * Math.sin(t * 0.9);
      for (const f of fish) { const a = t * f.s + f.o; f.body.position.set(Math.cos(a) * f.r * 1.6, f.h + Math.sin(a * 2) * 0.05, -1.4 + Math.sin(a) * f.r * 0.6); f.body.rotation.y = -a; }
    });
    return {
      fogDensity: 0.07,
      fogColor: 0x0a3550,
      water: { top: 0x020c1a, mid: 0x0a3550, bottom: 0x0d4a6a, sun: 0x9fdcff, share: 0.85 },
      ambient: emit => { if (Math.random() < 0.35) emit((Math.random() - 0.5) * 8, -0.2, (Math.random() - 0.5) * 4, 0, 0.5 + Math.random() * 0.4, 0, 5, 0.05, [0.8, 0.95, 1], particleKinds.drift); },
      relight: () => { world.hemi.intensity = 0.6; world.sun.intensity = 1.2; world.sun.color.set(0x9fdcff); },
    };
  },

  city(group, world, random) {
    const glass = windows(random);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), new THREE.MeshStandardMaterial({ color: 0x0a0c14, roughness: 0.25, metalness: 0.6 }));
    ground.rotation.x = -Math.PI / 2;
    ground.userData.ground = true;
    group.add(ground);
    for (let i = 0; i < 46; i++) {
      const w = 0.35 + random() * 0.45;
      const h = 0.6 + random() * (i < 10 ? 3.6 : 2.2);
      const d = 0.35 + random() * 0.45;
      const map = glass.clone();
      map.needsUpdate = true;
      map.repeat.set(Math.max(1, w * 3), Math.max(1, h * 2));
      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0x141826, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 1.1, roughness: 0.6 }));
      let x;
      let z;
      do { x = (random() - 0.5) * 11; z = -0.5 - random() * 5; } while (Math.abs(x) < 1.1 && z > -2);
      tower.position.set(x, h / 2, z);
      group.add(tower);
    }
    glass.dispose();
    const holoMaterial = glowing(0x7ad8ff, 1.6);
    const holo = new THREE.Mesh(new THREE.TorusKnotGeometry(0.35, 0.08, 80, 8), holoMaterial);
    holo.position.set(0, 2.6, -2.8);
    group.add(holo);
    let spin = 0;
    clickable(holo, 'holo', 'Hologram', point => {
      spin = world.reduced ? 0 : 1;
      if (world.reduced) holo.rotation.y += Math.PI / 3;
      world.particles.burst(point, [[0.5, 0.9, 1], [1, 0.5, 0.9]], 60, 2.4);
      world.sound('chime', { notes: [392, 523.25, 659.25, 783.99] });
      return 'The hologram spins and flares.';
    });
    const cars = [];
    for (let i = 0; i < 10; i++) {
      const car = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.08), glowing(i % 2 ? 0xff5a8a : 0x5ad8ff, 2.4));
      car.position.set(0, 1 + (i % 4) * 0.45, -1.5 - (i % 3) * 1.2);
      group.add(car);
      cars.push({ car, s: 0.8 + random() * 1.6, o: random() * 20, d: i % 2 ? 1 : -1 });
    }
    const street = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.06), new THREE.MeshBasicMaterial({ color: 0xff7ad8 }));
    street.rotation.x = -Math.PI / 2;
    street.position.set(0, 0.01, -1.4);
    group.add(street);
    world.updaters.push((dt, t) => {
      spin = Math.max(0, spin - dt * 0.5);
      holo.rotation.y += dt * (0.4 + spin * 6);
      holo.rotation.x = Math.sin(t * 0.5) * 0.3;
      holoMaterial.emissiveIntensity = 1.4 + Math.sin(t * 3) * 0.3 + spin * 2;
      for (const k of cars) k.car.position.x = ((t * k.s * k.d + k.o) % 16 + 16) % 16 - 8;
    });
    return { fogDensity: 0.05, fogColor: 0x140a2a, forceTod: 'night' };
  },
});
