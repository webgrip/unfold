/**
 * A ring buffer of particles in three axes, shared by the pack ceremony's 3D scene and the page overlay. A spawn
 * takes the next slot and overwrites the oldest particle when the buffer is full. `step` moves every live particle by
 * its velocity, applies gravity on y and drag on x and y, and parks dead ones at `hiddenZ` so a points mesh drawn from
 * `positions` hides them. `positions` and `colors` are plain Float32Arrays a renderer may bind directly.
 */
export class Particles {
  /**
   * @param {number} capacity
   * @param {{ gravity?: number, drag?: number, hiddenZ?: number }} [options] Gravity in units per second squared along y; drag per step on x and y.
   */
  constructor(capacity, { gravity = -0.4, drag = 0.985, hiddenZ = -50 } = {}) {
    this.capacity = capacity;
    this.gravity = gravity;
    this.drag = drag;
    this.hiddenZ = hiddenZ;
    this.positions = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.next = 0;
  }

  /**
   * Places one particle and returns its slot.
   * @param {{ x: number, y: number, z?: number, vx: number, vy: number, vz?: number, life: number, color: ArrayLike<number>, size?: number }} particle
   */
  spawn({ x, y, z = 0, vx, vy, vz = 0, life, color, size = 1 }) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.positions[i * 3] = x; this.positions[i * 3 + 1] = y; this.positions[i * 3 + 2] = z;
    this.velocities[i * 3] = vx; this.velocities[i * 3 + 1] = vy; this.velocities[i * 3 + 2] = vz;
    this.colors[i * 3] = color[0]; this.colors[i * 3 + 1] = color[1]; this.colors[i * 3 + 2] = color[2];
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    return i;
  }

  /** Advances every particle by `dt` seconds; returns how many are still alive. */
  step(dt) {
    const p = this.positions;
    const v = this.velocities;
    let alive = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) { p[i * 3 + 2] = this.hiddenZ; continue; }
      this.life[i] -= dt;
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += v[i * 3 + 2] * dt;
      v[i * 3 + 1] += this.gravity * dt;
      v[i * 3] *= this.drag;
      v[i * 3 + 1] *= this.drag;
      alive++;
    }
    return alive;
  }

  /** Kills every particle. */
  clear() { this.life.fill(0); }
}
