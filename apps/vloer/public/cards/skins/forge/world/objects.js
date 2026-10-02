import * as THREE from '../../../../vendor/three/three-module.js';
import { glowing, matte, softSprite } from './kit.js';
import { particleKinds } from './particles.js';

/**
 * Builds a clickable thing: marks `group` as one, records the meshes a pointer can hit, and gives it the reaction
 * `onClick(point)`, which plays the effect and returns the sentence a screen reader hears.
 * @param {THREE.Object3D} group
 * @param {string} kind
 * @param {string} label
 * @param {(point: THREE.Vector3) => string} onClick
 */
export function clickable(group, kind, label, onClick) {
  group.userData.kind = kind;
  group.userData.label = label;
  group.userData.onClick = onClick;
  group.traverse(node => { if (node.isMesh && !node.userData.decor) node.userData.owner = group; });
  return group;
}

/**
 * The things a person can place, by type. Each `make(seed, world)` returns a group that animates through
 * `world.updaters` and reacts to a click with particles from `world.particles` and a cue through `world.sound`.
 */
export const objectMakers = Object.freeze({
  crystal(seed, world) {
    const group = new THREE.Group();
    const hue = [0x7ad8ff, 0xc89bff, 0x7affc8, 0xffd36b][Math.floor(seed * 3.999)];
    const material = glowing(hue, 1.4);
    for (let i = 0; i < 3; i++) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 + i * 0.03, 0), material);
      shard.scale.set(0.6, 2.4 - i * 0.5, 0.6);
      shard.position.set((i - 1) * 0.14, 0.32 - i * 0.04, (i % 2) * 0.08);
      shard.rotation.z = (i - 1) * 0.25;
      group.add(shard);
    }
    let pulse = 0;
    world.updaters.push((dt, t) => {
      pulse = Math.max(0, pulse - dt * 1.4);
      material.emissiveIntensity = 1.1 + 0.25 * Math.sin(t * 2 + seed * 9) + pulse * 4;
      group.rotation.y += dt * 0.15;
    });
    return clickable(group, 'crystal', 'Crystal', point => {
      pulse = world.reduced ? 0 : 1;
      world.particles.burst(point, [[0.6, 0.9, 1], [1, 1, 1], [0.8, 0.6, 1]], 50, 2.6);
      world.sound('chime', { notes: [1046.5, 1318.51, 1567.98].map(f => f * (0.8 + seed * 0.4)) });
      return 'The crystal chimes.';
    });
  },

  lantern(seed, world) {
    const group = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.7, 6), matte(0x3a2a1a));
    post.position.y = 0.35;
    const bulbMaterial = glowing(0xffc46b, 2.6);
    const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 1), bulbMaterial);
    bulb.position.y = 0.76;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.08, 6), matte(0x2a1e14));
    cap.position.y = 0.86;
    const halo = softSprite(0xffb85a, 0.9, 0.55);
    halo.position.y = 0.76;
    group.add(post, bulb, cap, halo);
    let lit = true;
    world.updaters.push((dt, t) => {
      const target = lit ? 2.4 + (world.reduced ? 0 : 0.3 * Math.sin(t * 7)) : 0;
      bulbMaterial.emissiveIntensity += (target - bulbMaterial.emissiveIntensity) * world.ease(dt, 9);
      halo.material.opacity = bulbMaterial.emissiveIntensity * 0.22;
    });
    return clickable(group, 'lantern', 'Lantern', point => {
      lit = !lit;
      world.sound('chime', { notes: lit ? [783.99, 1046.5] : [523.25] });
      if (lit) world.particles.burst(point, [[1, 0.8, 0.4]], 18, 1.2);
      return lit ? 'The lantern lights.' : 'The lantern goes out.';
    });
  },

  tree(seed, world) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.35, 5), matte(0x5a3b22));
    trunk.position.y = 0.17;
    const leaves = [0x3f9a4a, 0x2f7f45, 0x5cae4a][Math.floor(seed * 2.999)];
    const crown = new THREE.Group();
    crown.position.y = 0.32;
    for (let i = 0; i < 3; i++) {
      const tier = new THREE.Mesh(new THREE.ConeGeometry(0.28 - i * 0.07, 0.34, 7), matte(leaves));
      tier.position.y = i * 0.17;
      crown.add(tier);
    }
    group.add(trunk, crown);
    let sway = 0;
    world.updaters.push((dt, t) => {
      sway = Math.max(0, sway - dt * 0.8);
      crown.rotation.z = world.reduced ? 0 : Math.sin(t * 1.3 + seed * 5) * 0.04 + Math.sin(t * 9) * sway * 0.25;
    });
    return clickable(group, 'tree', 'Tree', point => {
      sway = 1;
      for (let k = 0; k < 24; k++) world.particles.emit(point.x + (Math.random() - 0.5) * 0.4, point.y + 0.4, point.z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, -0.4 - Math.random() * 0.3, (Math.random() - 0.5) * 0.6, 3, 0.05, [0.4, 0.75, 0.3], particleKinds.leaf);
      world.sound('whoosh');
      return 'The tree shakes and drops a few leaves.';
    });
  },

  windmill(seed, world) {
    const group = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.9, 6), matte(0xe8dcc8));
    tower.position.y = 0.45;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.2, 6), matte(0xa0442c));
    roof.position.y = 1.0;
    const hub = new THREE.Group();
    hub.position.set(0, 0.85, 0.2);
    const sail = matte(0xf2ead8);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.01), sail);
      blade.position.y = 0.27;
      const arm = new THREE.Group();
      arm.rotation.z = i * Math.PI / 2;
      arm.add(blade);
      hub.add(arm);
    }
    group.add(tower, roof, hub);
    let speed = 0.6;
    world.updaters.push(dt => {
      speed += (0.6 - speed) * dt * 0.3;
      hub.rotation.z -= dt * speed * 2;
    });
    return clickable(group, 'windmill', 'Windmill', () => {
      speed = 6;
      if (world.reduced) hub.rotation.z -= Math.PI / 4;
      world.sound('whoosh');
      return 'The windmill’s sails spin up.';
    });
  },

  lighthouse(seed, world) {
    const group = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - i * 0.02, 0.18 - i * 0.02, 0.28, 10), matte(i % 2 ? 0xc0392f : 0xf2efe8));
      band.position.y = 0.14 + i * 0.28;
      group.add(band);
    }
    const lampMaterial = glowing(0xfff2c4, 3);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 10), lampMaterial);
    lamp.position.y = 1.22;
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.18, 10), matte(0x2a2a2a));
    top.position.y = 1.38;
    const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2c4, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.5, 4, 16, 1, true), beamMaterial);
    beam.rotation.z = Math.PI / 2;
    beam.position.x = 2;
    beam.userData.decor = true;
    const pivot = new THREE.Group();
    pivot.position.y = 1.22;
    pivot.rotation.y = seed * Math.PI * 2;
    pivot.add(beam);
    group.add(lamp, top, pivot);
    let on = true;
    world.updaters.push(dt => {
      pivot.rotation.y += dt * 0.9;
      beamMaterial.opacity += ((on ? 0.2 : 0) - beamMaterial.opacity) * world.ease(dt, 6);
      lampMaterial.emissiveIntensity = on ? 3 : 0.3;
    });
    return clickable(group, 'lighthouse', 'Lighthouse', () => {
      on = !on;
      world.sound('chime', { notes: on ? [392, 587.33, 783.99] : [293.66] });
      return on ? 'The lighthouse beam sweeps again.' : 'The lighthouse goes dark.';
    });
  },

  koi(seed, world) {
    const group = new THREE.Group();
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshStandardMaterial({ color: 0x2a6f9a, roughness: 0.15, metalness: 0.2, emissive: 0x0a2a3a, emissiveIntensity: 0.6 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.02;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.04, 6, 24), matte(0x8a8a80));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.03;
    group.add(water, rim);
    const fish = [];
    for (let i = 0; i < 3; i++) {
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 5), glowing(i === 0 ? 0xffc23a : 0xff7a3a, 1.2));
      body.rotation.z = Math.PI / 2;
      const holder = new THREE.Group();
      holder.add(body);
      holder.position.y = 0.05;
      group.add(holder);
      fish.push({ holder, r: 0.15 + i * 0.08, s: 0.8 + i * 0.3, o: i * 2 + seed * 6 });
    }
    let scatter = 0;
    world.updaters.push((dt, t) => {
      scatter = Math.max(0, scatter - dt);
      for (const f of fish) {
        const a = t * f.s * (1 + scatter * 3) + f.o;
        f.holder.position.x = Math.cos(a) * f.r;
        f.holder.position.z = Math.sin(a) * f.r;
        f.holder.rotation.y = -a;
      }
    });
    return clickable(group, 'koi', 'Gold koi pond', point => {
      scatter = 1.5;
      world.particles.burst(point, [[0.6, 0.85, 1], [1, 1, 1]], 30, 1.4);
      world.sound('chime', { notes: [659.25, 880, 1174.66] });
      return 'The gold koi scatter and circle back.';
    });
  },
});
