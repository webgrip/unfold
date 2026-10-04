import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');

const palette = {
  vouw: '#141A1D',
  baken: '#D23A4E',
  bakenDiep: '#CC394D',
  bakenNacht: '#D65162',
  vel: '#F4F6F2',
  zwerk: '#111619',
  grafiet: '#5E6B66',
  grafietLicht: '#8C9A94',
};

const siteTokens = {
  ink: palette.vouw,
  paper: palette.vel,
  'ground-dark': palette.zwerk,
  muted: palette.grafiet,
  'muted-light': palette.grafietLicht,
  accent: palette.baken,
  'accent-deep': palette.bakenDiep,
  'accent-night': palette.bakenNacht,
};

const base = { N: [55, 10], W: [8, 30], T1: [29, 41], K: [42, 56], T2: [30, 44] };
const optical = 0;
const cuts = {
  master: { scale: 1.04, gap: 2.75, radii: { tip: 1, wing: 1.8, tail: 1.5 } },
  favicon: { scale: 1.2, gap: 4.6, radii: { tip: 1.5, wing: 2.5, tail: 2.1 } },
};

const wordmark = {
  text: 'Unfold',
  face: 'Archivo',
  weight: 800,
  width: 110,
  tracking: -0.014,
  cap: 687.27,
  bbox: { x1: 76.56, y1: -734.99, x2: 3478.9, y2: 12 },
  d: 'M428.44 12Q314.15 12 235.75 -22.43Q157.35 -56.87 116.95 -124.25Q76.56 -191.63 76.56 -289.38V-687.27H265.68V-295.12Q265.68 -218.77 307.59 -175.65Q349.5 -132.52 428.12 -132.52Q506.96 -132.52 549.3 -175.65Q591.65 -218.77 591.65 -295.12V-687.27H780.77V-289.38Q780.77 -191.63 740.4 -124.25Q700.03 -56.87 621.61 -22.43Q543.2 12 428.44 12ZM906.38 0V-527.27H1047.3L1059.37 -446.88H1067.17Q1090.11 -478.29 1120.65 -498.73Q1151.18 -519.18 1187.49 -529.22Q1223.81 -539.27 1262.43 -539.27Q1327.35 -539.27 1371.56 -516.93Q1415.76 -494.6 1438.64 -449.62Q1461.51 -404.65 1461.51 -336.12V0H1289.03V-312.01Q1289.03 -336 1282.75 -353.78Q1276.46 -371.57 1264.62 -383.36Q1252.78 -395.15 1235.28 -401.04Q1217.78 -406.93 1195.08 -406.93Q1162.03 -406.93 1135.73 -392.36Q1109.43 -377.79 1094 -352.7Q1078.58 -327.61 1078.58 -294.95V0ZM1609.41 0V-405.67H1519.74V-527.27H1609.41V-564.24Q1609.41 -622.05 1630.43 -659.95Q1651.45 -697.86 1691.82 -716.42Q1732.2 -734.99 1789.57 -734.99Q1807.22 -734.99 1828.22 -732.72Q1849.21 -730.45 1869.42 -726.68Q1889.62 -722.9 1904.31 -718V-613.39H1849.28Q1811.48 -613.39 1796.55 -601.29Q1781.61 -589.19 1781.61 -561.85V-527.27H1904.31V-405.67H1781.61V0ZM2238.64 12Q2143.6 12 2074.75 -18.32Q2005.89 -48.63 1968.64 -109.89Q1931.38 -171.14 1931.38 -263.73Q1931.38 -357.09 1968.64 -418.06Q2005.89 -479.03 2074.75 -509.15Q2143.6 -539.27 2238.64 -539.27Q2333.96 -539.27 2402.84 -509.15Q2471.72 -479.03 2508.98 -418.06Q2546.24 -357.09 2546.24 -263.73Q2546.24 -171.14 2508.98 -109.89Q2471.72 -48.63 2402.84 -18.32Q2333.96 12 2238.64 12ZM2238.64 -109.6Q2284.08 -109.6 2313.37 -126.15Q2342.65 -142.69 2356.57 -173.79Q2370.5 -204.9 2370.5 -248.35V-278.77Q2370.5 -322.41 2356.57 -353.59Q2342.65 -384.76 2313.37 -401.21Q2284.08 -417.67 2238.64 -417.67Q2193.2 -417.67 2164.09 -401.21Q2134.97 -384.76 2121.04 -353.59Q2107.11 -322.41 2107.11 -278.77V-248.35Q2107.11 -204.9 2121.04 -173.79Q2134.97 -142.69 2164.09 -126.15Q2193.2 -109.6 2238.64 -109.6ZM2635.38 0V-724.27H2807.58V0ZM3137.17 12Q3064.67 12 3010.53 -17.78Q2956.39 -47.56 2926.38 -108.82Q2896.38 -170.07 2896.38 -264.14Q2896.38 -357.98 2926.43 -418.85Q2956.48 -479.71 3009.98 -509.49Q3063.48 -539.27 3133.61 -539.27Q3166.58 -539.27 3197.76 -531.9Q3228.95 -524.53 3255.21 -509.05Q3281.46 -493.56 3299.54 -469.74H3306.7V-724.27H3478.9V0H3338.58L3325.39 -76.61H3317.77Q3286.12 -29.69 3239.26 -8.85Q3192.39 12 3137.17 12ZM3189.19 -119.79Q3229.86 -119.79 3256.08 -136.65Q3282.29 -153.51 3295.02 -183.86Q3307.75 -214.2 3307.75 -254.43V-271.51Q3307.75 -301.85 3300.58 -326.89Q3293.41 -351.93 3278.74 -369.77Q3264.06 -387.62 3241.59 -397.55Q3219.11 -407.48 3188.82 -407.48Q3147.69 -407.48 3121.59 -391.79Q3095.5 -376.1 3083.19 -347.05Q3070.88 -318 3070.88 -277.08V-249.31Q3070.88 -208.67 3083.28 -179.56Q3095.68 -150.44 3121.78 -135.12Q3147.87 -119.79 3189.19 -119.79Z',
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = a => Math.hypot(a[0], a[1]);
const unit = a => mul(a, 1 / len(a));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const f = n => Number(n.toFixed(3)).toString();

function intersect(p, d, q, e) {
  return add(p, mul(d, cross(sub(q, p), e) / cross(d, e)));
}

function wings({ N, W, T1, K, T2, gap, radii }) {
  const fold = unit(sub(T1, N));
  let normal = [-fold[1], fold[0]];
  if (dot(normal, sub(K, N)) < 0) normal = mul(normal, -1);
  const offset = add(N, mul(normal, gap));
  const A1 = intersect(offset, fold, N, unit(sub(K, N)));
  const A2 = intersect(offset, fold, K, unit(sub(T2, K)));
  const corners = [radii.tip, radii.wing, radii.tail];
  return {
    ink: { points: [N, W, T1], names: ['N', 'W', 'T1'], radii: corners },
    accent: { points: [A1, K, A2], names: ['A1', 'K', 'A2'], radii: corners },
    gap,
  };
}

function translate(shape, delta) {
  for (const part of [shape.ink, shape.accent]) part.points = part.points.map(p => add(p, delta));
}

function fillet(points, radii) {
  const n = points.length;
  const corners = points.map((P, i) => {
    const prev = points[(i + n - 1) % n];
    const next = points[(i + 1) % n];
    const u1 = unit(sub(prev, P));
    const u2 = unit(sub(next, P));
    const theta = Math.acos(Math.max(-1, Math.min(1, dot(u1, u2))));
    const r = radii[i];
    const d = r / Math.tan(theta / 2);
    const turn = cross(sub(P, prev), sub(next, P));
    return {
      a: add(P, mul(u1, d)),
      b: add(P, mul(u2, d)),
      r,
      sweep: turn > 0 ? 1 : 0,
      centre: add(P, mul(unit(add(u1, u2)), r / Math.sin(theta / 2))),
    };
  });
  let d = `M${f(corners[0].b[0])} ${f(corners[0].b[1])}`;
  for (let i = 1; i <= n; i++) {
    const c = corners[i % n];
    d += `L${f(c.a[0])} ${f(c.a[1])}A${f(c.r)} ${f(c.r)} 0 0 ${c.sweep} ${f(c.b[0])} ${f(c.b[1])}`;
  }
  return { d: `${d}Z`, corners };
}

function outline(points, radii, steps = 400) {
  const { corners } = fillet(points, radii);
  const out = [];
  for (let i = 0; i < corners.length; i++) {
    const c = corners[i];
    const next = corners[(i + 1) % corners.length];
    const a0 = Math.atan2(c.a[1] - c.centre[1], c.a[0] - c.centre[0]);
    let da = Math.atan2(c.b[1] - c.centre[1], c.b[0] - c.centre[0]) - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    for (let s = 0; s <= 40; s++) out.push(add(c.centre, mul([Math.cos(a0 + (da * s) / 40), Math.sin(a0 + (da * s) / 40)], c.r)));
    for (let s = 0; s <= steps; s++) out.push(add(c.b, mul(sub(next.a, c.b), s / steps)));
  }
  return out;
}

function inside(pt, poly) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const c = cross(sub(poly[(i + 1) % poly.length], poly[i]), sub(pt, poly[i]));
    if (Math.abs(c) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  return true;
}

function measure(shape) {
  const ink = outline(shape.ink.points, shape.ink.radii);
  const accent = outline(shape.accent.points, shape.accent.radii);
  let minGap = Infinity;
  for (const p of ink) for (const q of accent) minGap = Math.min(minGap, len(sub(p, q)));
  const overlap = accent.some(p => inside(p, shape.ink.points)) || ink.some(p => inside(p, shape.accent.points));
  const xs = [...ink, ...accent].map(p => p[0]);
  const ys = [...ink, ...accent].map(p => p[1]);
  return { minGap, overlap, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
}

function centroid(shape) {
  let area = 0, cx = 0, cy = 0;
  for (const { points: [p, q, r] } of [shape.ink, shape.accent]) {
    const a = Math.abs(cross(sub(q, p), sub(r, p))) / 2;
    area += a;
    cx += (a * (p[0] + q[0] + r[0])) / 3;
    cy += (a * (p[1] + q[1] + r[1])) / 3;
  }
  return [cx / area, cy / area];
}

function cut({ scale, gap, radii }) {
  const pivot = [32, 32.5];
  const s = p => add(pivot, mul(sub(p, pivot), scale));
  const shape = wings({ N: s(base.N), W: s(base.W), T1: s(base.T1), K: s(base.K), T2: s(base.T2), gap, radii });
  const { bbox } = measure(shape);
  translate(shape, [32 - (bbox[0] + bbox[2]) / 2, 32 - (bbox[1] + bbox[3]) / 2]);
  const c = centroid(shape);
  translate(shape, [(32 - c[0]) * optical, (32 - c[1]) * optical]);
  const measured = measure(shape);
  return {
    ...shape,
    measured,
    paths: { ink: fillet(shape.ink.points, shape.ink.radii).d, accent: fillet(shape.accent.points, shape.accent.radii).d },
  };
}

const marks = Object.fromEntries(Object.entries(cuts).map(([name, spec]) => [name, cut(spec)]));
const master = marks.master;
const [mx0, my0, mx1, my1] = master.measured.bbox;
const markHeight = my1 - my0;

const open = (viewBox, width, height) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}" fill="none" role="img" aria-label="Unfold">`;
const square = body => `${open('0 0 64 64', 64, 64)}\n${body}\n</svg>\n`;
const markBody = (shape, ink, accent) => `<path d="${shape.paths.ink}" fill="${ink}"/>\n<path d="${shape.paths.accent}" fill="${accent}"/>`;

function wordmarkBody(colour, x, baseline, scale) {
  return `<g transform="translate(${f(x)} ${f(baseline)}) scale(${Number(scale.toFixed(6))})"><path d="${wordmark.d}" fill="${colour}"/></g>`;
}

function frame(left, top, right, bottom) {
  const width = right - left;
  const height = bottom - top;
  return { left, top, width, height, viewBox: `0 0 ${f(width)} ${f(height)}`, shift: `translate(${f(-left)} ${f(-top)})` };
}

const horizontal = (() => {
  const capHeight = markHeight * 0.75;
  const scale = capHeight / wordmark.cap;
  const space = markHeight * 0.25;
  const x = mx1 + space - wordmark.bbox.x1 * scale;
  const baseline = (my0 + my1) / 2 + capHeight / 2;
  const right = x + wordmark.bbox.x2 * scale;
  const top = Math.min(my0, baseline + wordmark.bbox.y1 * scale);
  const bottom = Math.max(my1, baseline + wordmark.bbox.y2 * scale);
  return { scale, x, baseline, capHeight, space, ...frame(mx0, top, right, bottom) };
})();

const stacked = (() => {
  const capHeight = markHeight * 0.6;
  const scale = capHeight / wordmark.cap;
  const space = markHeight * 0.25;
  const wordWidth = (wordmark.bbox.x2 - wordmark.bbox.x1) * scale;
  const x = (mx0 + mx1) / 2 - wordWidth / 2 - wordmark.bbox.x1 * scale;
  const baseline = my1 + space - wordmark.bbox.y1 * scale;
  const left = Math.min(mx0, x + wordmark.bbox.x1 * scale);
  const right = Math.max(mx1, x + wordmark.bbox.x2 * scale);
  return { scale, x, baseline, capHeight, space, ...frame(left, my0, right, baseline + wordmark.bbox.y2 * scale) };
})();

function lockup(layout, ink, accent) {
  return `${open(layout.viewBox, Math.round(layout.width), Math.round(layout.height))}
<g transform="${layout.shift}">
${markBody(master, ink, accent)}
${wordmarkBody(ink, layout.x, layout.baseline, layout.scale)}
</g>
</svg>
`;
}

const wordmarkFile = (() => {
  const scale = (markHeight * 0.75) / wordmark.cap;
  const box = frame(wordmark.bbox.x1 * scale, wordmark.bbox.y1 * scale, wordmark.bbox.x2 * scale, wordmark.bbox.y2 * scale);
  return `${open(box.viewBox, Math.round(box.width), Math.round(box.height))}
${wordmarkBody(palette.vouw, -box.left, -box.top, scale)}
</svg>
`;
})();

const tileScale = 0.72;
const tile = square(`<rect width="64" height="64" rx="14" fill="${palette.vouw}"/>
<g transform="translate(32 32) scale(${tileScale}) translate(-32 -32)">
${markBody(master, palette.vel, palette.bakenNacht)}
</g>`);

const tokens = `:root {
  --unfold-vouw:          ${palette.vouw};
  --unfold-baken:         ${palette.baken};
  --unfold-baken-diep:    ${palette.bakenDiep};
  --unfold-baken-nacht:   ${palette.bakenNacht};
  --unfold-vel:           ${palette.vel};
  --unfold-zwerk:         ${palette.zwerk};
  --unfold-grafiet:       ${palette.grafiet};
  --unfold-grafiet-licht: ${palette.grafietLicht};

  --unfold-ground: var(--unfold-vel);
  --unfold-text:   var(--unfold-vouw);
  --unfold-muted:  var(--unfold-grafiet);
  --unfold-mark:   var(--unfold-baken);
  --unfold-accent: var(--unfold-baken-diep);

  --unfold-font: "Archivo", "Helvetica Neue", Arial, sans-serif;
  --unfold-wordmark-weight: ${wordmark.weight};
  --unfold-wordmark-width: ${wordmark.width}%;
  --unfold-wordmark-tracking: ${wordmark.tracking}em;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --unfold-ground: var(--unfold-zwerk);
    --unfold-text:   var(--unfold-vel);
    --unfold-muted:  var(--unfold-grafiet-licht);
    --unfold-mark:   var(--unfold-baken-nacht);
    --unfold-accent: var(--unfold-baken-nacht);
  }
}

:root[data-theme="dark"] {
  --unfold-ground: var(--unfold-zwerk);
  --unfold-text:   var(--unfold-vel);
  --unfold-muted:  var(--unfold-grafiet-licht);
  --unfold-mark:   var(--unfold-baken-nacht);
  --unfold-accent: var(--unfold-baken-nacht);
}
`;

const viewBoxOf = ([x0, y0, x1, y1]) => `${f(x0)} ${f(y0)} ${f(x1 - x0)} ${f(y1 - y0)}`;
const placement = (layout, box) => ({ x: Number(f(box[0] - layout.left)), y: Number(f(box[1] - layout.top)), width: Number(f(box[2] - box[0])), height: Number(f(box[3] - box[1])) });
const wordBox = layout => [
  layout.x + wordmark.bbox.x1 * layout.scale,
  layout.baseline + wordmark.bbox.y1 * layout.scale,
  layout.x + wordmark.bbox.x2 * layout.scale,
  layout.baseline + wordmark.bbox.y2 * layout.scale,
];

const siteGeometry = {
  master: { frame: '0 0 64 64', bounds: viewBoxOf(master.measured.bbox), ...master.paths },
  favicon: { frame: '0 0 64 64', bounds: viewBoxOf(marks.favicon.measured.bbox), ...marks.favicon.paths },
  wordmark: { viewBox: viewBoxOf([wordmark.bbox.x1, wordmark.bbox.y1, wordmark.bbox.x2, wordmark.bbox.y2]), d: wordmark.d },
  lockup: {
    viewBox: horizontal.viewBox,
    mark: placement(horizontal, master.measured.bbox),
    wordmark: placement(horizontal, wordBox(horizontal)),
  },
};


const appMark = `<path class="brand-ink" d="${master.paths.ink}"/><path class="brand-fold" d="${master.paths.accent}"/>`;
const appLockup = `<g transform="${horizontal.shift}">${appMark}${wordmarkBody('currentColor', horizontal.x, horizontal.baseline, horizontal.scale).replace(/ fill="currentColor"/g, ' class="brand-ink"')}</g>`;
const appBrand = `/* Generated by scripts/build-brand.mjs from the Unfold mark; run \`mise run brand\` instead of editing. */

const mark = '${appMark}';
const lockup = '${appLockup}';

/** The favicon cut of the mark on its 64-unit grid, as SVG path data: the ink wing and the fold. */
export const faviconPaths = Object.freeze({ ink: '${marks.favicon.paths.ink}', fold: '${marks.favicon.paths.accent}' });

/**
 * The outlined horizontal Unfold lockup (the Vouwvlieger and the wordmark) as inline SVG; the wordmark is never typed
 * as live text. Ink follows the text colour and the fold follows \`--brand-fold\`. With \`label\` it is an image with
 * that accessible name, otherwise it is decorative. \`className\` and \`label\` are trusted constants.
 * @param {{ className: string, label?: string }} options
 * @returns {string}
 */
export function lockupSvg({ className, label }) {
  const name = label ? \`role="img" aria-label="\${label}"\` : 'aria-hidden="true"';
  return \`<svg class="\${className}" viewBox="${horizontal.viewBox}" fill="none" \${name} focusable="false">\${lockup}</svg>\`;
}

/**
 * The Unfold mark, the Vouwvlieger, as decorative inline SVG. \`className\` is a trusted constant.
 * @param {{ className: string }} options
 * @returns {string}
 */
export function markSvg({ className }) {
  return \`<svg class="\${className}" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">\${mark}</svg>\`;
}
`;

const files = {
  'docs/brand/mark.svg': square(markBody(master, palette.vouw, palette.baken)),
  'docs/brand/mark-night.svg': square(markBody(master, palette.vel, palette.bakenNacht)),
  'docs/brand/mark-mono.svg': square(`<path d="${master.paths.ink}${master.paths.accent}" fill="currentColor"/>`),
  'docs/brand/favicon.svg': square(markBody(marks.favicon, palette.vouw, palette.baken)),
  'docs/brand/tile.svg': tile,
  'docs/brand/wordmark.svg': wordmarkFile,
  'docs/brand/lockup-horizontal.svg': lockup(horizontal, palette.vouw, palette.baken),
  'docs/brand/lockup-horizontal-night.svg': lockup(horizontal, palette.vel, palette.bakenNacht),
  'docs/brand/lockup-horizontal-mono.svg': lockup(horizontal, 'currentColor', 'currentColor'),
  'docs/brand/lockup-stacked.svg': lockup(stacked, palette.vouw, palette.baken),
  'docs/brand/lockup-stacked-night.svg': lockup(stacked, palette.vel, palette.bakenNacht),
  'docs/brand/tokens.css': tokens,
  'apps/site/src/brand/geometry.json': `${JSON.stringify(siteGeometry, null, 2)}\n`,
  'apps/unfold/public/core/brand.js': appBrand,
  'apps/unfold/public/favicon.svg': square(markBody(marks.favicon, palette.vouw, palette.baken)),
};

const failures = [];
const tolerance = 0.005;
for (const [name, shape] of Object.entries(marks)) {
  const { minGap, overlap, bbox } = shape.measured;
  if (overlap) failures.push(`${name}: the wings overlap`);
  if (Math.abs(minGap - shape.gap) > tolerance) failures.push(`${name}: the crease measures ${minGap.toFixed(3)}, not the design gap ${shape.gap}`);
  const centre = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
  if (Math.hypot(centre[0] - 32, centre[1] - 32) > tolerance) failures.push(`${name}: the bounding box is centred on ${centre.map(f).join(', ')}, not 32, 32`);
}

const brandCss = readFileSync(resolve(root, 'apps/site/src/styles/brand.css'), 'utf8');
for (const [token, hex] of Object.entries(siteTokens)) {
  const declared = brandCss.match(new RegExp(`--brand-${token}:\\s*([^;]+);`))?.[1].trim();
  if (declared?.toLowerCase() !== hex.toLowerCase()) failures.push(`apps/site/src/styles/brand.css: --brand-${token} is ${declared ?? 'missing'}, the palette says ${hex.toLowerCase()}`);
}

if (!existsSync(resolve(root, 'docs/brand/TRADEMARK.md'))) failures.push('docs/brand/TRADEMARK.md is missing; ADR-0014 makes it the only terms for the name and mark');
const stray = existsSync(resolve(root, 'docs/brand')) ? readdirSync(resolve(root, 'docs/brand')).filter(name => /^(LICEN[CS]E|COPYING)/i.test(name)) : [];
if (stray.length) failures.push(`docs/brand/ holds a second copyright answer (${stray.join(', ')}); ADR-0014 keeps the assets under the root Apache-2.0`);
if (!readFileSync(resolve(root, 'README.md'), 'utf8').includes('docs/brand/TRADEMARK.md')) failures.push('README.md no longer links docs/brand/TRADEMARK.md');
if (!readFileSync(resolve(root, 'apps/unfold/public/index.html'), 'utf8').includes(appMark)) failures.push('apps/unfold/public/index.html: the boot screen does not draw the generated mark; copy `mark` from apps/unfold/public/core/brand.js');

for (const [name, content] of Object.entries(files)) {
  const path = resolve(root, name);
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content) failures.push(`${name} is stale; run mise run brand`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

if (failures.length) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  const summary = Object.entries(marks).map(([name, shape]) => `${name} crease ${shape.measured.minGap.toFixed(3)}`).join(', ');
  process.stdout.write(`${check ? 'Checked' : 'Built'} ${Object.keys(files).length} brand files; ${summary}; no overlap; centred on 32, 32.\n`);
}
