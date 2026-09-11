import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const brandDirectory = resolve(root, 'docs/brand');
const pngDirectory = resolve(brandDirectory, 'png');
const extensionIcon = resolve(root, 'extensions/vscode/media/icon.png');
const extensionIconSize = 256;

const palette = {
  vlak: '#15191C',
  peil: '#3D84E8',
  peilDiep: '#2A66D6',
  krijt: '#F3F5F4',
  hal: '#0F1416',
  stof: '#5C6A6B',
  stofLicht: '#8B9A9A'
};

const stroke = 15;
const half = stroke / 2;
const armTop = { left: 17.5, right: 46.5, y: 14.5 };
const vertex = { x: 32, y: 49.5 };
const foot = vertex.y + half;
const envelope = { left: armTop.left - half, right: armTop.right + half, top: armTop.y - half, bottom: foot };
const floor = { x: envelope.left, y: foot - stroke, width: envelope.right - envelope.left, depth: 8 };

const favicon = (() => {
  const s = 15, h = s / 2;
  const arm = { left: 15.5, right: 48.5, y: 11.5 };
  const apex = { x: 32, y: 51.5 };
  const bottom = apex.y + h;
  const box = { left: arm.left - h, right: arm.right + h, top: arm.y - h, bottom };
  return { stroke: s, arm, apex, box, floor: { x: box.left, y: bottom - s, width: box.right - box.left, depth: 8 } };
})();

const wordmark = {
  face: 'Archivo',
  weight: 800,
  width: 110,
  tracking: -0.014,
  ascenderTrimmedToCap: true,
  cap: 687,
  bbox: { x1: 79, y1: -687, x2: 4549, y2: 12 },
  d: 'M405 0L79 0L79-687L405-687Q523-687 606-649Q689-611 733-535Q777-459 777-344L777-344Q777-229 733-152.50Q689-76 606-38Q523 0 405 0L405 0ZM268-543L268-145L399-145Q443-145 477-157Q511-169 535-192Q559-215 571-249Q583-283 583-326L583-326L583-361Q583-405 571-439Q559-473 535-496Q511-519 477-531Q443-543 399-543L399-543L268-543ZM1164 12L1164 12Q1066 12 996-17.50Q926-47 888.50-108Q851-169 851-264L851-264Q851-357 888.50-418Q926-479 994-509Q1062-539 1157-539L1157-539Q1252-539 1319-510Q1386-481 1421-421Q1456-361 1456-268L1456-268L1456-230L1028-230Q1029-188 1044-159.50Q1059-131 1089-117Q1119-103 1164-103L1164-103Q1189-103 1211-108.50Q1233-114 1249-125Q1265-136 1274-152Q1283-168 1283-187L1283-187L1455-187Q1455-140 1434.50-103Q1414-66 1375.50-40.50Q1337-15 1283.50-1.50Q1230 12 1164 12ZM1029-323L1029-323L1277-323Q1277-348 1268.50-366.50Q1260-385 1245-398Q1230-411 1209-417.50Q1188-424 1162-424L1162-424Q1121-424 1093-412Q1065-400 1049.50-377.50Q1034-355 1029-323ZM2207 0L1996 0L1715-687L1921-687L2057-321Q2063-306 2071-283Q2079-260 2087.50-236Q2096-212 2102-193L2102-193L2109-193Q2115-210 2123-233Q2131-256 2139-279.50Q2147-303 2154-320L2154-320L2290-687L2488-687L2207 0ZM2723 0L2550 0L2550-687L2723-687L2723 0ZM3119 12L3119 12Q3024 12 2955-18.50Q2886-49 2848.50-110Q2811-171 2811-264L2811-264Q2811-357 2848.50-418Q2886-479 2955-509Q3024-539 3119-539L3119-539Q3214-539 3283-509Q3352-479 3389-418Q3426-357 3426-264L3426-264Q3426-171 3389-110Q3352-49 3283-18.50Q3214 12 3119 12ZM3119-110L3119-110Q3164-110 3193.50-126.50Q3223-143 3237-174Q3251-205 3251-248L3251-248L3251-279Q3251-322 3237-353.50Q3223-385 3193.50-401.50Q3164-418 3119-418L3119-418Q3073-418 3044-401.50Q3015-385 3001-353.50Q2987-322 2987-279L2987-279L2987-248Q2987-205 3001-174Q3015-143 3044-126.50Q3073-110 3119-110ZM3804 12L3804 12Q3706 12 3636-17.50Q3566-47 3528.50-108Q3491-169 3491-264L3491-264Q3491-357 3528.50-418Q3566-479 3634-509Q3702-539 3797-539L3797-539Q3892-539 3959-510Q4026-481 4061-421Q4096-361 4096-268L4096-268L4096-230L3668-230Q3669-188 3684-159.50Q3699-131 3729-117Q3759-103 3804-103L3804-103Q3829-103 3851-108.50Q3873-114 3889-125Q3905-136 3914-152Q3923-168 3923-187L3923-187L4095-187Q4095-140 4074.50-103Q4054-66 4015.50-40.50Q3977-15 3923.50-1.50Q3870 12 3804 12ZM3669-323L3669-323L3917-323Q3917-348 3908.50-366.50Q3900-385 3885-398Q3870-411 3849-417.50Q3828-424 3802-424L3802-424Q3761-424 3733-412Q3705-400 3689.50-377.50Q3674-355 3669-323ZM4357 0L4184 0L4184-527L4325-527L4337-443L4345-443Q4358-472 4378.50-494Q4399-516 4426.50-528Q4454-540 4487-540L4487-540Q4506-540 4522-536.50Q4538-533 4549-529L4549-529L4549-385L4483-385Q4450-385 4426-375Q4402-365 4386.50-347Q4371-329 4364-304Q4357-279 4357-248L4357-248L4357 0Z'
};

const wordmarkCap = 46;
const wordmarkScale = wordmarkCap / wordmark.cap;
const gap = stroke;

const round = value => Number(value.toFixed(3)).toString();
const centreline = (arm, apex) => `M${arm.left} ${arm.y}L${apex.x} ${apex.y}L${arm.right} ${arm.y}`;

function vee(colour, s = stroke, arm = armTop, apex = vertex) {
  return `<path d="${centreline(arm, apex)}" stroke="${colour}" stroke-width="${s}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
}

function slab(colour, box = floor) {
  return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.depth}" fill="${colour}"/>`;
}

function veeOutline(arm = armTop, apex = vertex, s = stroke) {
  const h = s / 2;
  const length = Math.hypot(apex.x - arm.left, apex.y - arm.y);
  const unit = { x: (apex.x - arm.left) / length, y: (apex.y - arm.y) / length };
  const outward = { x: -unit.y, y: unit.x };
  const point = (base, sign) => ({ x: base.x + sign * h * outward.x, y: base.y + sign * h * outward.y });
  const mirror = p => ({ x: 2 * apex.x - p.x, y: p.y });
  const start = point({ x: arm.left, y: arm.y }, 1);
  const joinLeft = point(apex, 1);
  const joinRight = mirror(joinLeft);
  const capRightOuter = mirror(start);
  const capRightInner = mirror(point({ x: arm.left, y: arm.y }, -1));
  const inner = { x: apex.x, y: apex.y - h / Math.sin(Math.atan2(apex.x - arm.left, apex.y - arm.y)) };
  const capLeftInner = point({ x: arm.left, y: arm.y }, -1);
  const arc = p => `A${h} ${h} 0 0 0 ${round(p.x)} ${round(p.y)}`;
  const line = p => `L${round(p.x)} ${round(p.y)}`;
  return `M${round(start.x)} ${round(start.y)}${line(joinLeft)}${arc(joinRight)}${line(capRightOuter)}${arc(capRightInner)}${line(inner)}${line(capLeftInner)}${arc(start)}Z`;
}

function slabOutline(box = floor) {
  return `M${box.x} ${box.y}V${box.y + box.depth}H${box.x + box.width}V${box.y}Z`;
}

const open = (viewBox, width, height, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}" fill="none" role="img" aria-label="${label}">`;

const square = (body, label = 'De Vloer') => `${open('0 0 64 64', 64, 64, label)}
${body}
</svg>
`;

function wordmarkBody(colour, x, baseline) {
  const scale = round(wordmarkScale);
  return `<g transform="translate(${round(x)} ${baseline}) scale(${scale})"><path d="${wordmark.d}" fill="${colour}"/></g>`;
}

const wordmarkInk = { left: wordmark.bbox.x1 * wordmarkScale, right: wordmark.bbox.x2 * wordmarkScale, top: wordmark.bbox.y1 * wordmarkScale, bottom: wordmark.bbox.y2 * wordmarkScale };
const wordmarkWidth = wordmarkInk.right - wordmarkInk.left;

function horizontalLockup(inkColour, accentColour) {
  const originX = envelope.right + gap - wordmarkInk.left;
  const right = originX + wordmarkInk.right;
  const top = Math.min(envelope.top, foot + wordmarkInk.top);
  const bottom = Math.max(envelope.bottom, foot + wordmarkInk.bottom);
  const width = right - envelope.left;
  const height = bottom - top;
  return `${open(`0 0 ${round(width)} ${round(height)}`, Math.round(width), Math.round(height), 'De Vloer')}
<g transform="translate(${round(-envelope.left)} ${round(-top)})">
${vee(accentColour)}
${slab(inkColour)}
${wordmarkBody(inkColour, originX, foot)}
</g>
</svg>
`;
}

const stackedMarkScale = 1.5;

function stackedLockup(inkColour, accentColour) {
  const markHeight = (envelope.bottom - envelope.top) * stackedMarkScale;
  const markWidth = (envelope.right - envelope.left) * stackedMarkScale;
  const baseline = envelope.top + markHeight + gap * stackedMarkScale + wordmarkCap;
  const originX = 32 - wordmarkWidth / 2 - wordmarkInk.left;
  const top = envelope.top;
  const bottom = baseline + wordmarkInk.bottom;
  const left = Math.min(32 - markWidth / 2, originX + wordmarkInk.left);
  const right = Math.max(32 + markWidth / 2, originX + wordmarkInk.right);
  const width = right - left;
  const height = bottom - top;
  return `${open(`0 0 ${round(width)} ${round(height)}`, Math.round(width), Math.round(height), 'De Vloer')}
<g transform="translate(${round(-left)} ${round(-top)})">
<g transform="translate(32 ${envelope.top}) scale(${stackedMarkScale}) translate(-32 ${-envelope.top})">
${vee(accentColour)}
${slab(inkColour)}
</g>
${wordmarkBody(inkColour, originX, baseline)}
</g>
</svg>
`;
}

function wordmarkFile(colour) {
  const width = wordmarkWidth;
  const height = wordmarkInk.bottom - wordmarkInk.top;
  return `${open(`0 0 ${round(width)} ${round(height)}`, Math.round(width), Math.round(height), 'De Vloer')}
${wordmarkBody(colour, -wordmarkInk.left, -wordmarkInk.top)}
</svg>
`;
}

function banner(groundColour, inkColour) {
  const pad = gap;
  const originX = envelope.right + gap - wordmarkInk.left;
  const contentWidth = originX + wordmarkInk.right - envelope.left;
  const contentTop = Math.min(envelope.top, foot + wordmarkInk.top);
  const contentHeight = Math.max(envelope.bottom, foot + wordmarkInk.bottom) - contentTop;
  const width = contentWidth + pad * 2;
  const height = contentHeight + pad * 2;
  return `${open(`0 0 ${round(width)} ${round(height)}`, Math.round(width), Math.round(height), 'De Vloer')}
<rect width="${round(width)}" height="${round(height)}" rx="${gap}" fill="${groundColour}"/>
<g transform="translate(${round(pad - envelope.left)} ${round(pad - contentTop)})">
${vee(palette.peil)}
${slab(inkColour)}
${wordmarkBody(inkColour, originX, foot)}
</g>
</svg>
`;
}

const tileScale = 0.75;
const tile = `<rect width="64" height="64" rx="14" fill="${palette.vlak}"/>
<g transform="translate(32 32) scale(${tileScale}) translate(-32 -32)">
${vee(palette.peil)}
${slab(palette.krijt)}
</g>`;

const faviconBody = colour => `${vee(palette.peil, favicon.stroke, favicon.arm, favicon.apex)}
${slab(colour, favicon.floor)}`;

const faviconAuto = `<style>.grond{fill:${palette.vlak}}@media (prefers-color-scheme:dark){.grond{fill:${palette.krijt}}}</style>
${vee(palette.peil, favicon.stroke, favicon.arm, favicon.apex)}
<rect class="grond" x="${favicon.floor.x}" y="${favicon.floor.y}" width="${favicon.floor.width}" height="${favicon.floor.depth}"/>`;

const tokens = `:root {
  --vloer-vlak:       ${palette.vlak};
  --vloer-peil:       ${palette.peil};
  --vloer-peil-diep:  ${palette.peilDiep};
  --vloer-krijt:      ${palette.krijt};
  --vloer-hal:        ${palette.hal};
  --vloer-stof:       ${palette.stof};
  --vloer-stof-licht: ${palette.stofLicht};

  --vloer-grond:  var(--vloer-krijt);
  --vloer-tekst:  var(--vloer-vlak);
  --vloer-zacht:  var(--vloer-stof);
  --vloer-accent: var(--vloer-peil-diep);

  --vloer-sans: "Archivo", "Helvetica Neue", Arial, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --vloer-grond:  var(--vloer-hal);
    --vloer-tekst:  var(--vloer-krijt);
    --vloer-zacht:  var(--vloer-stof-licht);
    --vloer-accent: var(--vloer-peil);
  }
}

:root[data-theme="dark"] {
  --vloer-grond:  var(--vloer-hal);
  --vloer-tekst:  var(--vloer-krijt);
  --vloer-zacht:  var(--vloer-stof-licht);
  --vloer-accent: var(--vloer-peil);
}
`;

const contrast = (() => {
  const channel = value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const luminance = hex => { const n = parseInt(hex.slice(1), 16);
    return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255); };
  return (a, b) => { const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05); };
})();

const ratio = (a, b) => contrast(a, b).toFixed(2);

const swatches = [
  ['Vlak', palette.vlak, 'ink — the plane that carries'],
  ['Peil', palette.peil, 'accent — the level a floor is checked against'],
  ['Peil Diep', palette.peilDiep, 'accent for small text on light'],
  ['Krijt', palette.krijt, 'paper'],
  ['Hal', palette.hal, 'dark ground'],
  ['Stof', palette.stof, 'muted text on light'],
  ['Stof Licht', palette.stofLicht, 'muted text on dark']
];

const typeCandidates = [
  ['Space Grotesk', 700, 100, 18.9, 'far too light'],
  ['Manrope', 800, 100, 18.9, 'far too light'],
  ['Instrument Sans', 700, 100, 21.4, ''],
  ['Familjen Grotesk', 700, 100, 21.5, ''],
  ['Public Sans', 800, 100, 23.5, ''],
  ['Inter', 800, 100, 23.6, ''],
  ['Chivo', 700, 100, 24.3, ''],
  ['Archivo', 800, 100, 26.1, 'the same face at its default width'],
  ['Archivo', 800, 110, 27.5, 'chosen'],
  ['Chivo', 800, 100, 27.6, '']
];

const counterClose = vertex.y - half / Math.sin(Math.atan2(vertex.x - armTop.left, vertex.y - armTop.y));

const guide = `<svg viewBox="-6 -8 78 78" width="420" height="420" fill="none" aria-hidden="true">
<g stroke="var(--vloer-zacht)" stroke-width="0.4" opacity="0.5">
<rect x="${envelope.left}" y="${envelope.top}" width="${envelope.right - envelope.left}" height="${envelope.bottom - envelope.top}" stroke-dasharray="2 2"/>
<path d="M32 -6V68" stroke-dasharray="1 3"/>
<path d="M${armTop.left} ${armTop.y}L${vertex.x} ${vertex.y}L${armTop.right} ${armTop.y}"/>
<path d="M-4 ${round(counterClose)}H54M-4 ${floor.y}H54M-4 ${envelope.bottom}H54" stroke-dasharray="1 3"/>
</g>
${vee(palette.peil)}
${slab('currentColor')}
<g fill="var(--vloer-zacht)" font-size="2.8" font-family="ui-monospace, monospace">
<text x="${armTop.left}" y="-3" text-anchor="middle">${armTop.left}</text>
<text x="${armTop.right}" y="-3" text-anchor="middle">${armTop.right}</text>
<text x="56" y="${round(counterClose + 1)}">${counterClose.toFixed(1)}</text>
<text x="56" y="${floor.y + 1}">${floor.y}</text>
<text x="56" y="${envelope.bottom + 1}">${envelope.bottom}</text>
<text x="32" y="66" text-anchor="middle">32, ${vertex.y}</text>
</g>
</svg>`;

function brandbook() {
  const themed = svg => svg.replaceAll(palette.vlak, 'currentColor');
  const sizeRow = [160, 64, 32, 24, 16].map(size =>
    themed(files['mark.svg']).replace('width="64" height="64"', `width="${size}" height="${size}"`)).join('');
  const scaled = (name, height) => themed(files[name]).replace(/width="([\d.]+)" height="([\d.]+)"/, (m, w, h) =>
    `width="${round(Number(w) * height / Number(h))}" height="${height}"`);
  const fixed = (name, height) => files[name].replace(/width="([\d.]+)" height="([\d.]+)"/, (m, w, h) =>
    `width="${round(Number(w) * height / Number(h))}" height="${height}"`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>De Vloer — brand</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="tokens.css">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100,800;110,400;110,600;110,700;110,800&family=Chivo:wght@700;800&family=Familjen+Grotesk:wght@700&family=Instrument+Sans:wght@700&family=Inter:wght@800&family=Manrope:wght@800&family=Public+Sans:wght@800&family=Space+Grotesk:wght@700&display=swap">
<style>
*{box-sizing:border-box}
body{margin:0;background:var(--vloer-grond);color:var(--vloer-tekst);font-family:var(--vloer-sans);font-stretch:110%;font-size:15px;line-height:1.6}
main{max-width:960px;margin:0 auto;padding:48px 24px 96px}
h1{font-size:15px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--vloer-zacht);margin:0 0 32px}
h2{font-size:28px;font-weight:800;letter-spacing:-.02em;margin:64px 0 8px}
h3{font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--vloer-zacht);margin:32px 0 12px}
p{max-width:68ch;margin:0 0 16px}
a{color:var(--vloer-accent)}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.86em}
.row{display:flex;align-items:flex-end;gap:28px;flex-wrap:wrap}
.panel{border:1px solid color-mix(in srgb, var(--vloer-zacht) 34%, transparent);border-radius:14px;padding:28px;margin:20px 0}
table{border-collapse:collapse;width:100%;margin:12px 0 4px}
th,td{text-align:left;padding:9px 14px 9px 0;border-bottom:1px solid color-mix(in srgb, var(--vloer-zacht) 26%, transparent);vertical-align:baseline}
th{font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--vloer-zacht);font-weight:600}
.chip{width:44px;height:44px;border-radius:9px;display:inline-block;border:1px solid color-mix(in srgb, var(--vloer-zacht) 40%, transparent)}
.toggle{position:fixed;top:20px;right:20px;background:var(--vloer-accent);color:var(--vloer-grond);border:0;border-radius:999px;padding:9px 18px;font:inherit;font-weight:600;cursor:pointer}
.dont{color:var(--vloer-zacht)}
.dont b{color:var(--vloer-tekst);font-weight:600}
.specimen{font-size:34px;line-height:1.1;letter-spacing:-.02em}
.note{color:var(--vloer-zacht);font-size:13.5px}
.ground{background:var(--vloer-hal);border-radius:14px;padding:28px}
.tilebed{display:inline-flex;align-items:center;gap:18px;padding:16px 20px;border-radius:12px;background:color-mix(in srgb, var(--vloer-zacht) 28%, transparent)}
</style>
</head>
<body>
<button class="toggle" id="ground">Invert</button>
<main>
<h1>De Vloer — brand identity · v1 · 2026-09-11</h1>
<div class="row">${scaled('lockup-horizontal.svg', 72)}</div>
<p style="margin-top:28px"><em>Vloer</em> is Dutch for floor, and <em>de werkvloer</em> is where the work actually
happens. De Vloer is the shop floor of an agent estate: it does not do the work, it carries it and gives a person
somewhere to stand while they watch. The mark draws that, and everything below is built from one measure.</p>
<p class="note">Full written guide: <a href="README.md">README.md</a>. Terms for the name and mark:
<a href="TRADEMARK.md">TRADEMARK.md</a>.</p>

<h2>The mark</h2>
<p>A capital V standing on a floor, with the floor drawn over its foot. The V is the work, the floor is what carries
it, and the colour codes exactly that. The point sits below the floor's underside: set into the ground, not balanced
on a plinth.</p>
<div class="panel"><div class="row">${guide}
<div>
<table>
<tr><th>Stroke <span class="mono">w</span></th><td class="mono">${stroke}</td></tr>
<tr><th>Arm ends</th><td class="mono">17.5, 14.5 · 46.5, 14.5</td></tr>
<tr><th>Point</th><td class="mono">32, 49.5</td></tr>
<tr><th>Arms</th><td class="mono">22.5° from vertical</td></tr>
<tr><th>Floor</th><td class="mono">x 10, y 42, 44 × 8</td></tr>
<tr><th>Envelope</th><td class="mono">44 × 50 on (32, 32)</td></tr>
<tr><th>Counter closes</th><td class="mono">y ${counterClose.toFixed(1)}</td></tr>
</table>
<p class="note">The floor never rises above the line where the counter closes. Drawn higher, the counter shows
through it and the mark falls apart into two wedges above a bar.</p>
</div></div></div>

<h3>At size · 160 / 64 / 32 / 24 / 16</h3>
<div class="row">${sizeRow}</div>
<h3>Favicon at 16, beside the master at 16</h3>
<div class="row">${scaled('favicon.svg', 64)}${scaled('favicon.svg', 32)}${scaled('favicon.svg', 16)}
<span style="width:24px"></span>${scaled('mark.svg', 16)}</div>
<p class="note">The favicon is framed fuller and stroked lighter in proportion — 27.3 % of its height against 30 %
in the master. Heavy strokes clog small; you thin them relative to the frame rather than thickening them.</p>

<h2>Colour</h2>
<table>
<tr><th></th><th>Name</th><th>Hex</th><th>on Krijt</th><th>on Hal</th><th>Role</th></tr>
${swatches.map(([name, hex, role]) => `<tr>
<td><span class="chip" style="background:${hex}"></span></td>
<td><b>${name}</b></td><td class="mono">${hex}</td>
<td class="mono">${ratio(hex, palette.krijt)}:1</td>
<td class="mono">${ratio(hex, palette.hal)}:1</td>
<td class="note">${role}</td></tr>`).join('\n')}
</table>
<p>Peil clears the graphic threshold on a light ground and not the text one, so it is a mark colour there and not a
link colour; Peil Diep takes small text on Krijt, and on Hal the two swap. <code>tokens.css</code> makes that swap
through <code>--vloer-accent</code>.</p>
<p class="note">Peil carries the same weight as Ploeg's Klei on both grounds — Klei measures 3.39:1 and 4.95:1,
Peil ${ratio(palette.peil, palette.krijt)}:1 and ${ratio(palette.peil, palette.hal)}:1. The hue is what tells the two
products apart, not the strength.</p>

<h2>Type</h2>
<p class="specimen" style="font-weight:800;letter-spacing:-.014em">De Vloer · Archivo 800 / wdth 110</p>
<p>The same face Ploeg uses, at the same setting. Two products in one estate, one typographic voice; what tells
them apart is the mark and the accent, not the lettering. The weight still has to measure: the mark's stroke is
30.0 % of its height and the wordmark sits just under at 27.5 %, because the mark is a solid object and should
read slightly heavier than the text beside it.</p>
<table>
<tr><th>Candidate</th><th>Stem / cap</th><th>Set in the face</th><th></th></tr>
${typeCandidates.map(([face, weight, width, pct, note]) => `<tr>
<td>${face} ${weight}${width === 110 ? ' / wdth 110' : ''}</td><td class="mono">${pct.toFixed(1)} %</td>
<td style="font-family:'${face}',var(--vloer-sans);font-weight:${weight};font-stretch:${width}%;font-size:22px;letter-spacing:-.014em">De Vloer</td>
<td class="note">${note}</td></tr>`).join('\n')}
</table>
<p class="note">Measured by scanning a line across the H at 15 % below its cap line, above the crossbar. The
wdth 110 instance is cut from the variable font with <code>fontTools.varLib.instancer</code> — Google Fonts serves
the same default-width static file whichever wdth you ask its CSS API for. A different scanline moves the absolute
numbers; only the ordering and the gaps matter.</p>

<h2>Lockups</h2>
<div class="panel"><div class="row">${scaled('lockup-horizontal.svg', 60)}</div></div>
<div class="panel"><div class="row" style="align-items:center">${scaled('lockup-stacked.svg', 130)}
<span class="tilebed">${fixed('mark-tile.svg', 96)}${fixed('mark-tile.svg', 48)}</span></div></div>
<p>Wordmark cap height is 46 against a mark height of 50, the baseline sits on the mark's foot, and the space between
them is one stroke width measured ink to ink. Stacked, the mark is set at 1.5× — at 1× a mark this open reads as an
afterthought above a word this long. Keep one stroke width clear on every side of either lockup.</p>

<h2>On a dark ground</h2>
<div class="ground"><div class="row" style="align-items:center">${fixed('lockup-horizontal-white.svg', 56)}
${fixed('mark-reverse.svg', 72)}${fixed('favicon-dark.svg', 48)}</div></div>
<p class="note">The ink mark never goes on Hal: Vlak against Hal is ${ratio(palette.vlak, palette.hal)}:1 and the
floor disappears, leaving a floating V. Use <code>mark-reverse.svg</code> or
<code>mark-currentcolor.svg</code>.</p>

<h2>What not to do</h2>
<div class="panel">
<p class="dont"><b>Do not</b> swap the two colours. The floor is ink because it carries; the V is Peil because it is
what stands on it.</p>
<p class="dont"><b>Do not</b> move the floor up into the counter, change the stroke width, the 22.5° arms or the
envelope. Scale the file.</p>
<p class="dont"><b>Do not</b> set Peil as small text on a light ground, or re-set the wordmark in a live font.</p>
<p class="dont"><b>Do not</b> rotate the mark. A floor is level; that is the only thing the word means.</p>
<p class="dont"><b>Do not</b> edit files in this directory. They are written by
<code>scripts/build-brand.mjs</code>, and <code>npm run brand:check</code> fails when a committed file no longer
matches the construction.</p>
</div>
</main>
<script>
document.getElementById('ground').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = getComputedStyle(root).getPropertyValue('--vloer-grond').trim() === getComputedStyle(root).getPropertyValue('--vloer-hal').trim();
  root.setAttribute('data-theme', dark ? 'light' : 'dark');
});
</script>
</body>
</html>
`;
}

const files = {
  'mark.svg': square(`${vee(palette.peil)}\n${slab(palette.vlak)}`),
  'mark-currentcolor.svg': square(`${vee('var(--vloer-peil, ' + palette.peil + ')')}\n${slab('currentColor')}`),
  'mark-mono.svg': square(`<path d="${veeOutline()}${slabOutline()}" fill="currentColor"/>`),
  'mark-black.svg': square(`<path d="${veeOutline()}${slabOutline()}" fill="${palette.vlak}"/>`),
  'mark-white.svg': square(`<path d="${veeOutline()}${slabOutline()}" fill="${palette.krijt}"/>`),
  'mark-peil.svg': square(`<path d="${veeOutline()}${slabOutline()}" fill="${palette.peil}"/>`),
  'mark-reverse.svg': square(`${vee(palette.peil)}\n${slab(palette.krijt)}`),
  'mark-tile.svg': square(tile),
  'favicon.svg': square(faviconBody(palette.vlak)),
  'favicon-dark.svg': square(faviconBody(palette.krijt)),
  'wordmark.svg': wordmarkFile(palette.vlak),
  'wordmark-white.svg': wordmarkFile(palette.krijt),
  'lockup-horizontal.svg': horizontalLockup(palette.vlak, palette.peil),
  'lockup-horizontal-white.svg': horizontalLockup(palette.krijt, palette.peil),
  'lockup-horizontal-mono.svg': horizontalLockup('currentColor', 'currentColor'),
  'lockup-stacked.svg': stackedLockup(palette.vlak, palette.peil),
  'lockup-stacked-white.svg': stackedLockup(palette.krijt, palette.peil),
  'banner.svg': banner(palette.krijt, palette.vlak),
  'banner-dark.svg': banner(palette.hal, palette.krijt),
  'tokens.css': tokens
};

files['brandbook.html'] = brandbook();

const tagline = 'Self-hosted workbench for remote agent crews';

const socialBanners = [
  { name: 'og-linkpreview-1200x630', width: 1200, height: 630, ground: 'light', lockup: 132, tag: 30 },
  { name: 'og-linkpreview-nacht-1200x630', width: 1200, height: 630, ground: 'dark', lockup: 132, tag: 30 },
  { name: 'x-bluesky-header-1500x500', width: 1500, height: 500, ground: 'dark', lockup: 108, tag: 26 },
  { name: 'x-bluesky-header-dag-1500x500', width: 1500, height: 500, ground: 'light', lockup: 108, tag: 26 },
  { name: 'linkedin-profiel-1584x396', width: 1584, height: 396, ground: 'dark', lockup: 92, tag: 23 },
  { name: 'linkedin-bedrijfspagina-strip-1128x191', width: 1128, height: 191, ground: 'dark', lockup: 54, tag: 0 },
  { name: 'vierkant-1080x1080', width: 1080, height: 1080, ground: 'light', lockup: 150, tag: 32 }
];

function bannerMarkup({ width, height, ground, lockup, tag }) {
  const dark = ground === 'dark';
  const bg = dark ? palette.hal : palette.krijt;
  const fg = dark ? palette.krijt : palette.vlak;
  const soft = dark ? palette.stofLicht : palette.stof;
  const art = (dark ? files['lockup-horizontal-white.svg'] : files['lockup-horizontal.svg'])
    .replace(/width="([\d.]+)" height="([\d.]+)"/, (m, w, h) =>
      `width="${round(Number(w) * lockup / Number(h))}" height="${lockup}"`);
  const floorY = Math.round(height * 0.78);
  const gutter = Math.round(height * 0.11);
  const rise = Math.round(height * 0.07);
  return `<div class="banner" style="width:${width}px;height:${height}px;background:${bg};color:${fg}">
<div class="inner" style="height:${floorY - rise}px;padding:0 ${gutter}px">
${art}
${tag ? `<p style="color:${soft};font-size:${tag}px">${tagline}</p>` : ''}
</div>
<div class="floor" style="top:${floorY}px;background:${palette.peil}"></div>
</div>`;
}

const iconTargets = [
  { file: 'public/favicon-16x16.png', size: 16, art: 'favicon' },
  { file: 'public/favicon-32x32.png', size: 32, art: 'favicon' },
  { file: 'public/apple-touch-icon.png', size: 180, art: 'tile-square' },
  { file: 'public/android-chrome-192x192.png', size: 192, art: 'tile' },
  { file: 'public/android-chrome-512x512.png', size: 512, art: 'tile' }
];

const tileSquare = square(`<rect width="64" height="64" fill="${palette.vlak}"/>
<g transform="translate(32 32) scale(${tileScale}) translate(-32 -32)">
${vee(palette.peil)}
${slab(palette.krijt)}
</g>`);

function icoFrom(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(count, 4);
  const entries = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  pngs.forEach(({ size, data }, index) => {
    const at = index * 16;
    entries.writeUInt8(size >= 256 ? 0 : size, at);
    entries.writeUInt8(size >= 256 ? 0 : size, at + 1);
    entries.writeUInt8(0, at + 2); entries.writeUInt8(0, at + 3);
    entries.writeUInt16LE(1, at + 4); entries.writeUInt16LE(32, at + 6);
    entries.writeUInt32LE(data.length, at + 8);
    entries.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, entries, ...pngs.map(p => p.data)]);
}

const webmanifest = JSON.stringify({
  name: 'De Vloer',
  short_name: 'De Vloer',
  description: tagline,
  icons: [
    { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
    { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
  ],
  theme_color: palette.vlak,
  background_color: palette.krijt,
  display: 'standalone',
  start_url: '/'
}, null, 2) + '\n';

const editorIcon = `${open('0 0 64 64', 24, 24, 'De Vloer')}
<path d="${veeOutline()}${slabOutline()}" fill="currentColor"/>
</svg>
`;

const served = { 'public/favicon.svg': square(faviconAuto), 'public/site.webmanifest': webmanifest, 'extensions/vscode/media/vloer.svg': editorIcon };

const check = process.argv.includes('--check');
const failures = [];
if (!check) { mkdirSync(brandDirectory, { recursive: true }); mkdirSync(pngDirectory, { recursive: true }); }
const targets = [
  ...Object.entries(files).map(([name, content]) => [`docs/brand/${name}`, content]),
  ...Object.entries(served)
];
for (const [name, content] of targets) {
  const path = resolve(root, name);
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content) failures.push(`${name} is stale; run npm run brand:build`);
  } else writeFileSync(path, content);
}

if (process.argv.includes('--png')) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const exports = readdirSync(brandDirectory).filter(name => name.endsWith('.svg') && name !== 'mark-currentcolor.svg' && !name.endsWith('-mono.svg'));
  for (const name of exports) {
    const source = readFileSync(resolve(brandDirectory, name), 'utf8');
    for (const height of [512, 1024]) {
      const scaled = source.replace(/width="(\d+)" height="(\d+)"/, (match, w, h) => `width="${Math.round(Number(w) * height / Number(h))}" height="${height}"`);
      await page.setContent(`<style>html,body{margin:0;background:none}svg{display:block}</style>${scaled}`);
      const element = await page.$('svg');
      await element.screenshot({ path: resolve(pngDirectory, `${name.replace('.svg', '')}-${height}.png`), omitBackground: true });
    }
  }
  const iconSource = readFileSync(resolve(brandDirectory, 'mark-tile.svg'), 'utf8').replace(/width="(\d+)" height="(\d+)"/, `width="${extensionIconSize}" height="${extensionIconSize}"`);
  await page.setContent(`<style>html,body{margin:0;background:none}svg{display:block}</style>${iconSource}`);
  mkdirSync(dirname(extensionIcon), { recursive: true });
  await (await page.$('svg')).screenshot({ path: extensionIcon, omitBackground: true });
  await browser.close();
}

if (process.argv.includes('--social')) {
  const { chromium } = await import('playwright');
  const socialDirectory = resolve(brandDirectory, 'social');
  mkdirSync(socialDirectory, { recursive: true });
  const browser = await chromium.launch();

  const shoot = async (html, width, height, scale, path) => {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    await page.setContent(`<style>
html,body{margin:0;padding:0;background:none}
.banner{position:relative;overflow:hidden;display:flex;align-items:flex-end;font-family:Archivo,"Helvetica Neue",Arial,sans-serif;font-stretch:110%}
.inner{position:absolute;left:0;right:0;top:0;z-index:1;display:flex;flex-direction:column;gap:.55em;justify-content:flex-end;align-items:flex-start;box-sizing:border-box}
.inner svg{display:block}
.inner p{margin:0;font-weight:500;letter-spacing:-.01em}
.floor{position:absolute;left:0;right:0;height:4px}
.icon{display:grid;place-items:center}
.icon svg{display:block;width:100%;height:100%}
</style>${html}`);
    const element = await page.$('.banner, .icon');
    await element.screenshot({ path, omitBackground: true });
    await page.close();
  };

  for (const banner of socialBanners) {
    await shoot(bannerMarkup(banner), banner.width, banner.height, 2,
      resolve(socialDirectory, `${banner.name}@2x.png`));
  }
  await shoot(bannerMarkup(socialBanners[0]), 1200, 630, 1, resolve(root, 'public/og-image.png'));
  await shoot(`<div class="icon" style="width:1024px;height:1024px">${files['mark-tile.svg']}</div>`,
    1024, 1024, 1, resolve(socialDirectory, 'avatar-1024.png'));

  const iconArt = { favicon: files['favicon.svg'], tile: files['mark-tile.svg'], 'tile-square': tileSquare };
  for (const target of iconTargets) {
    await shoot(`<div class="icon" style="width:${target.size}px;height:${target.size}px">${iconArt[target.art]}</div>`,
      target.size, target.size, 1, resolve(root, target.file));
  }

  const icoSizes = [16, 32, 48];
  const icoPngs = [];
  for (const size of icoSizes) {
    const path = resolve(pngDirectory, `ico-${size}.png`);
    await shoot(`<div class="icon" style="width:${size}px;height:${size}px">${files['favicon.svg']}</div>`, size, size, 1, path);
    icoPngs.push({ size, data: readFileSync(path) });
  }
  writeFileSync(resolve(root, 'public/favicon.ico'), icoFrom(icoPngs));
  for (const size of icoSizes) rmSync(resolve(pngDirectory, `ico-${size}.png`));

  await browser.close();
  process.stdout.write(`Rendered ${socialBanners.length} social banners, ${iconTargets.length} icons, favicon.ico and og-image.png.\n`);
}

if (failures.length) {
  process.stderr.write(failures.join('\n') + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write(`${check ? 'Checked' : 'Built'} ${targets.length} brand sources in ${relative(root, brandDirectory)}; stroke ${stroke}, envelope ${envelope.right - envelope.left} x ${envelope.bottom - envelope.top}.\n`);
}
