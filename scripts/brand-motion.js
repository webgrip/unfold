/* global document, getComputedStyle, performance, requestAnimationFrame, matchMedia, Element, Node */
const DEG = Math.PI / 180;
const AXIS = -52;
const FORWARD = [Math.cos(AXIS * DEG), Math.sin(AXIS * DEG)];
const CREASE = { x: 31.309, y: 42.395, angle: -50 };
const SVG = 'http://www.w3.org/2000/svg';
const rigs = new WeakMap();

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (e0, e1, x) => {
  const u = clamp((x - e0) / (e1 - e0), 0, 1);
  return u * u * (3 - 2 * u);
};
const inOutSine = (u) => -(Math.cos(Math.PI * clamp(u, 0, 1)) - 1) / 2;
const outCubic = (u) => 1 - Math.pow(1 - clamp(u, 0, 1), 3);
const springStep = (w, z, t) => {
  const wd = w * Math.sqrt(1 - z * z);
  return Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
};
const springKick = (w, z, t) => {
  const wd = w * Math.sqrt(1 - z * z);
  return Math.exp(-z * w * t) * Math.sin(wd * t);
};

function lemniscate(s) {
  const d = 1 + Math.cos(s) ** 2;
  const x = (40 * Math.sin(s)) / d;
  const y = (-40 * Math.sin(s) * Math.cos(s)) / d;
  const c = Math.cos(-7 * DEG);
  const n = Math.sin(-7 * DEG);
  return [x * c - y * n, x * n + y * c];
}

const STING = {
  wind: { dur: 0.16, pull: 3.2, squash: 0.2, nose: 9 },
  fly: 0.68,
  dip: 0.46,
  wing: { w: 30, z: 0.42 },
  land: { w: 21, z: 0.32, push: 2.6, squash: 0.3, nose: 10 },
  burst: { count: 8, reach: 14, size: 1.8, life: 0.46, ring: 19 },
  trail: { every: 1 / 110, life: 0.42, size: 1 },
};
const POP = {
  wind: { dur: 0.14, pull: 0, squash: 0.24, nose: 6 },
  fly: 0,
  dip: 0,
  wing: { w: 26, z: 0.3 },
  land: { w: 19, z: 0.28, push: 0, squash: 0.34, nose: 14 },
  burst: { count: 12, reach: 12, size: 1.6, life: 0.44, ring: 20 },
  trail: null,
};

/** Seconds from the first frame of the sting until the mark rests exactly as drawn. */
export const STING_LENGTH = STING.wind.dur + STING.fly + 0.62;
/** Seconds from the first frame of the pop until the mark rests exactly as drawn. */
export const POP_LENGTH = POP.wind.dur + 0.8;
/** Seconds the mark rests between two stings of the loading loop. */
export const LOOP_REST = 1.1;

const flight = (() => {
  const steps = Math.round(STING.fly * 240);
  const n = 3000;
  const acc = [0];
  const pace = (x) => 1 + 0.42 * Math.cos(4 * Math.PI * x) + 0.25 * x;
  for (let i = 1; i <= n; i++) acc.push(acc[i - 1] + pace((i - 0.5) / n));
  const warp = (x) => {
    const i = clamp(x, 0, 1) * n;
    const lo = Math.floor(i);
    const hi = Math.min(n, lo + 1);
    return ((acc[lo] + (acc[hi] - acc[lo]) * (i - lo)) / acc[n]) * 2 * Math.PI;
  };
  const dt = STING.fly / steps;
  const points = [];
  for (let k = 0; k <= steps; k++) points.push(lemniscate(warp(k / steps)));
  const rows = [];
  let previous = null;
  let turned = 0;
  for (let k = 0; k <= steps; k++) {
    const a = points[Math.max(0, k - 1)];
    const b = points[Math.min(steps, k + 1)];
    const span = (Math.min(steps, k + 1) - Math.max(0, k - 1)) * dt;
    const vx = (b[0] - a[0]) / span;
    const vy = (b[1] - a[1]) / span;
    const heading = Math.atan2(vy, vx) / DEG;
    if (previous === null) turned = heading;
    else {
      let d = heading - previous;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      turned += d;
    }
    previous = heading;
    rows.push({ x: points[k][0], y: points[k][1], heading: turned, speed: Math.hypot(vx, vy) });
  }
  const end = rows[steps].heading;
  for (const row of rows) row.rot = row.heading - end;
  return { rows, steps, dt };
})();

function along(tau) {
  const i = clamp(tau / flight.dt, 0, flight.steps);
  const lo = Math.floor(i);
  const hi = Math.min(flight.steps, lo + 1);
  const k = i - lo;
  const a = flight.rows[lo];
  const b = flight.rows[hi];
  const mix = (key) => a[key] + (b[key] - a[key]) * k;
  return {
    x: mix('x'),
    y: mix('y'),
    rot: mix('rot'),
    heading: mix('heading'),
    speed: mix('speed'),
  };
}

function poseOf(cfg, t) {
  const pose = {
    x: 0,
    y: 0,
    rot: 0,
    stretch: 1,
    dir: AXIS,
    hinge: 180,
    size: 1,
    flying: false,
    burst: -1,
  };
  const wind = cfg.wind;
  const impact = wind.dur + cfg.fly;
  if (t < wind.dur) {
    const u = inOutSine(t / wind.dur);
    pose.x = -FORWARD[0] * wind.pull * u;
    pose.y = -FORWARD[1] * wind.pull * u;
    pose.rot = -wind.nose * u;
    pose.stretch = 1 - wind.squash * u;
  } else if (t < impact) {
    const tau = t - wind.dur;
    const p = along(tau);
    const release = 1 - outCubic(tau / 0.12);
    pose.x = p.x - FORWARD[0] * wind.pull * release;
    pose.y = p.y - FORWARD[1] * wind.pull * release;
    pose.rot = p.rot - wind.nose * release;
    pose.dir = p.heading;
    const target = 1 + clamp((p.speed - 60) / 900, 0, 0.34);
    pose.stretch = 1 - wind.squash + (target - (1 - wind.squash)) * smooth(0, 0.05, tau);
    pose.size = 1 - cfg.dip * smooth(0, 0.1, tau) + cfg.dip * smooth(cfg.fly - 0.17, cfg.fly, tau);
    pose.flying = true;
  } else {
    const tau = t - impact;
    const land = cfg.land;
    const push = land.push * springKick(land.w, land.z, tau);
    pose.x = FORWARD[0] * push;
    pose.y = FORWARD[1] * push;
    pose.rot = land.nose * springKick(land.w * 0.9, land.z, tau);
    pose.stretch = 1 - land.squash * springStep(land.w, land.z, tau);
    if (!cfg.fly) {
      pose.dir = -90;
      pose.rot += 6 * springKick(land.w * 1.3, land.z, tau);
    }
    pose.burst = tau;
  }
  if (t >= wind.dur) pose.hinge = 180 * springStep(cfg.wing.w, cfg.wing.z, t - wind.dur);
  return pose;
}

/**
 * The sting's pose `t` seconds in: offset from the resting mark, rotation and squash-and-stretch in degrees and
 * factors, and the fold's hinge angle (180 folded behind the sheet, 0 open). At `STING_LENGTH` it is the drawn mark.
 * @param {number} t
 */
export const stingPose = (t) => poseOf(STING, t);

/**
 * The pop's pose `t` seconds in, in the same shape as `stingPose`. At `POP_LENGTH` it is the drawn mark.
 * @param {number} t
 */
export const popPose = (t) => poseOf(POP, t);

function planeTransform(p) {
  return `translate(${32 + p.x} ${32 + p.y}) rotate(${p.dir}) scale(${p.stretch} ${1 / p.stretch}) rotate(${-p.dir}) rotate(${p.rot}) scale(${p.size}) translate(-32 -32)`;
}

function hingeTransform(hinge) {
  const s = Math.cos(hinge * DEG).toFixed(4);
  return `translate(${CREASE.x} ${CREASE.y}) rotate(${CREASE.angle}) scale(1 ${s}) rotate(${-CREASE.angle}) translate(${-CREASE.x} ${-CREASE.y})`;
}

function make(name, attributes, parent, before) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (parent) parent.insertBefore(node, before ?? null);
  return node;
}

function rig(ink, fold) {
  if (rigs.has(ink)) return rigs.get(ink);
  const parent = ink.parentNode;
  const fill = (node) => getComputedStyle(node).fill;
  const effects = make('g', { 'aria-hidden': 'true' }, parent, ink);
  const plane = make('g', {}, parent, ink);
  const back = make('path', { d: fold.getAttribute('d'), fill: fill(ink), display: 'none' });
  plane.append(back, ink, fold);
  for (let svg = plane.ownerSVGElement; svg; svg = svg.parentNode?.closest?.('svg') ?? null)
    svg.setAttribute('overflow', 'visible');
  const rigged = { plane, back, ink, fold, effects, accent: fill(fold), busy: false };
  rigs.set(ink, rigged);
  return rigged;
}

function draw(r, p) {
  r.plane.setAttribute('transform', planeTransform(p));
  const tf = hingeTransform(p.hinge);
  r.fold.setAttribute('transform', tf);
  r.back.setAttribute('transform', tf);
  const open = Math.cos(p.hinge * DEG) >= 0;
  r.fold.setAttribute('display', open ? 'inline' : 'none');
  r.back.setAttribute('display', open ? 'none' : 'inline');
}

function rest(r) {
  r.plane.removeAttribute('transform');
  r.fold.removeAttribute('transform');
  r.fold.removeAttribute('display');
  r.back.setAttribute('display', 'none');
  r.effects.replaceChildren();
}

function play(r, cfg, poseAt, length, onFrame) {
  const B = cfg.burst;
  r.effects.replaceChildren();
  const trail = [];
  if (cfg.trail) {
    for (let born = cfg.wind.dur; born < cfg.wind.dur + cfg.fly; born += cfg.trail.every) {
      const p = poseAt(born);
      trail.push({
        born,
        dot: make('circle', { cx: 32 + p.x, cy: 32 + p.y, r: 0, fill: r.accent }, r.effects),
      });
    }
  }
  const burst = Array.from({ length: B.count }, (_, i) => ({
    angle: (AXIS + 180 / B.count + (i * 360) / B.count) * DEG,
    dot: make('circle', { r: 0, fill: r.accent }, r.effects),
  }));
  const ghosts = cfg.trail
    ? [3, 2, 1].map((k) => {
        const g = make('g', { opacity: 0.22 - k * 0.05, display: 'none' }, r.effects);
        g.append(r.ink.cloneNode(), r.fold.cloneNode());
        return { k, g };
      })
    : [];
  const start = performance.now();
  return new Promise((resolve) => {
    const frame = (now) => {
      const t = (now - start) / 1000;
      if (!r.plane.isConnected || onFrame?.(t) === false || t >= length) {
        rest(r);
        resolve(t >= length);
        return;
      }
      const p = poseAt(t);
      draw(r, p);
      for (const { k, g } of ghosts) {
        const g0 = poseAt(t - k / 120);
        const on = p.flying && t - k / 120 > cfg.wind.dur;
        g.setAttribute('display', on ? 'inline' : 'none');
        if (on) g.setAttribute('transform', planeTransform(g0));
      }
      for (const { born, dot } of trail) {
        const age = t - born;
        let radius = 0;
        if (age >= 0 && age < cfg.trail.life) {
          const pop = age < 0.06 ? 1.4 * smooth(0, 0.06, age) : 1.4 - 0.4 * smooth(0.06, 0.12, age);
          radius = cfg.trail.size * pop * (1 - smooth(0.12, cfg.trail.life, age));
        }
        dot.setAttribute('r', radius.toFixed(3));
      }
      for (const { angle, dot } of burst) {
        let radius = 0;
        let reach = 0;
        if (p.burst >= 0 && p.burst < B.life) {
          const u = p.burst / B.life;
          reach = B.ring + B.reach * outCubic(u);
          radius = B.size * (1 - u * u) * smooth(0, 0.03, p.burst);
        }
        dot.setAttribute('cx', (32 + Math.cos(angle) * reach).toFixed(2));
        dot.setAttribute('cy', (32 + Math.sin(angle) * reach).toFixed(2));
        dot.setAttribute('r', radius.toFixed(3));
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

/** True when the visitor asked for reduced motion; every animation here then leaves the mark still. */
export function prefersStill() {
  return typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Pops the mark once: a squash, the fold snapping open with an overshoot, a jiggle and a ring of approach lights.
 * `ink` and `fold` are the mark's two paths. A pop already in progress is not restarted.
 * @param {SVGPathElement} ink
 * @param {SVGPathElement} fold
 */
export function popMark(ink, fold) {
  if (prefersStill()) return;
  const r = rig(ink, fold);
  if (r.busy) return;
  r.busy = true;
  play(r, POP, popPose, POP_LENGTH).then(() => {
    r.busy = false;
  });
}

/**
 * Plays the sting on repeat, resting `LOOP_REST` seconds between flights, until `stop()` is called or the mark leaves
 * the document. With reduced motion the mark stays still.
 * @param {SVGPathElement} ink
 * @param {SVGPathElement} fold
 * @returns {{ stop: () => void }}
 */
export function loopMark(ink, fold) {
  let stopped = false;
  if (prefersStill()) return { stop: () => {} };
  const r = rig(ink, fold);
  r.busy = true;
  (async () => {
    while (!stopped && r.plane.isConnected) {
      await play(r, STING, stingPose, STING_LENGTH, () => !stopped);
      const until = performance.now() + LOOP_REST * 1000;
      while (!stopped && r.plane.isConnected && performance.now() < until)
        await new Promise((next) => requestAnimationFrame(next));
    }
    r.busy = false;
  })();
  return {
    stop: () => {
      stopped = true;
    },
  };
}

/**
 * Pops the first mark inside `root` whenever a pointer or keyboard focus enters an element matching `selector`.
 * The listener is delegated, so marks rendered later are covered too. Touch input does not pop.
 * @param {ParentNode & EventTarget} root
 * @param {string} selector
 * @param {{ ink: string, fold: string }} classes
 */
export function popOnHover(root, selector, classes) {
  const trigger = (event) => {
    if (event.pointerType === 'touch') return;
    const host = event.target instanceof Element ? event.target.closest(selector) : null;
    if (!host || (event.relatedTarget instanceof Node && host.contains(event.relatedTarget)))
      return;
    const marks = [...host.querySelectorAll(`.${classes.ink}`)]
      .map((ink) => ({ ink, fold: ink.parentNode.querySelector(`.${classes.fold}`) }))
      .filter(({ ink, fold }) => fold && ink.getBoundingClientRect().width > 0);
    if (marks[0]) popMark(marks[0].ink, marks[0].fold);
  };
  root.addEventListener('pointerover', trigger);
  root.addEventListener('focusin', (event) => {
    if (event.target instanceof Element && event.target.matches(':focus-visible')) trigger(event);
  });
}
