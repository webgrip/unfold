import { clean, count, fit, formatFixed1, goFields, goUpperRune, newView, plural } from './cardimage-view.ts';
import type { CardImageCard, CardView, Finish, Tone } from './cardimage-view.ts';

/** The card image's width in CSS pixels. Its height grows with the slots the card fills. */
export const Width = 360;

/** The media type of a rendered card. */
export const ContentType = 'image/svg+xml';

/** What a card image takes besides the card. `now` counts days live; the image never reads the system clock. */
export type CardImageOptions = { now: string | Date };

const pad = 20;
const font = `Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
const maxTitle = 3;

const finishColours: Record<string, string> = {
  foil: '#9FB4C7',
  holo: '#7FD1E8',
  prism: '#B48CF2',
  gilded: '#D4A73A',
  infinity: '#E86FB0',
};

/** The one palette Ploeg draws its card image in. */
export const cardPalette = {
  surface: '#FFFFFF', text: '#15191C', muted: '#56636A', border: '#D9DFE1',
  accent: '#3D84E8', accentFg: '#2A66D6', selected: '#E6EFFC', track: '#E4E9EB',
  tones: { neutral: '#869396', review: '#9A72D9', success: '#3C9A63', danger: '#E0625A', attention: '#BC8624', live: '#3D84E8' } satisfies Record<Tone, string>,
  gold: '#C9962B',
} as const;

const p = cardPalette;

function finishColour(f: Finish): string {
  return Object.hasOwn(finishColours, f.key) ? finishColours[f.key]! : p.border;
}

/** Draws `card` as a standalone SVG document, Ploeg's own card face, byte for byte as Ploeg's `cardimage.Render` does. Every text from the card is XML-escaped and truncated to its slot. */
export function renderCardImage(card: CardImageCard, opts: CardImageOptions): string {
  const v = newView(card, opts.now);
  const body: string[] = [];
  header(body, v);
  let y = title(body, v);
  y = chips(body, v, y + 14);
  y = main(body, v, y + 18);
  if (v.grade) y = slab(body, v, y + 12);
  if (v.cracks > 0) y = conditionRow(body, v, y + 12);
  y = crewRow(body, v, y + 14);
  y = stewardRow(body, v, y + 12);
  const height = y + 52;

  const c: string[] = [];
  c.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${Width}" height="${height}" viewBox="0 0 ${Width} ${height}" role="img" aria-labelledby="card-title card-desc">`);
  c.push(`<title id="card-title">Run card: ${esc(v.title)}</title>`);
  c.push(`<desc id="card-desc">${esc(describe(v))}</desc>`);
  c.push(`<defs><clipPath id="card-clip"><rect x="0" y="0" width="${Width}" height="${height}" rx="14"/></clipPath>`);
  c.push(`<linearGradient id="card-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.5" stop-color="${finishColour(v.finish)}" stop-opacity="0.16"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient></defs>`);
  c.push(`<g font-family="${esc(font)}">`);
  frame(c, v, height);
  c.push(...body);
  cracks(c, v);
  footer(c, v, height);
  c.push('</g></svg>\n');
  return c.join('');
}

function frame(c: string[], v: CardView, height: number): void {
  c.push(`<rect x="0.5" y="0.5" width="${Width - 1}" height="${height - 1}" rx="14" fill="${p.surface}" stroke="${p.border}"/>`);
  c.push(`<g clip-path="url(#card-clip)"><rect x="0" y="0" width="${Width}" height="4" fill="${p.tones[v.state.tone]}"/>`);
  const level = v.finish.level;
  if (level >= 2) c.push(`<rect x="0" y="0" width="${Width}" height="${height}" fill="url(#card-sheen)"/>`);
  if (level >= 3) c.push(`<path d="M-40 ${height - 120} L${Width + 40} -40" stroke="${finishColour(v.finish)}" stroke-opacity="0.18" stroke-width="36"/>`);
  c.push('</g>');
  if (level >= 1) c.push(`<rect x="1.5" y="1.5" width="${Width - 3}" height="${height - 3}" rx="13" fill="none" stroke="${finishColour(v.finish)}" stroke-width="3" data-finish="${v.finish.key}"/>`);
  if (level >= 4) c.push(`<rect x="7" y="7" width="${Width - 14}" height="${height - 14}" rx="10" fill="none" stroke="${p.gold}" stroke-width="1"/>`);
  if (level >= 5) c.push(`<rect x="4" y="4" width="${Width - 8}" height="${height - 8}" rx="12" fill="none" stroke="${finishColour(v.finish)}" stroke-width="1" stroke-dasharray="2 4"/>`);
}

function header(c: string[], v: CardView): void {
  c.push(`<rect x="${pad}" y="20" width="32" height="32" rx="8" fill="${p.selected}"/>`);
  if (v.pr !== '') c.push(`<g fill="none" stroke="${p.accentFg}" stroke-width="1.8" stroke-linecap="round"><circle cx="31" cy="29" r="2.5"/><circle cx="31" cy="43" r="2.5"/><circle cx="41" cy="43" r="2.5"/><path d="M31 31.5 V40.5 M41 40.5 V34 a4 4 0 0 0 -4 -4 H35"/></g>`);
  else c.push(`<g fill="none" stroke="${p.accentFg}" stroke-width="1.8" stroke-linejoin="round"><rect x="29" y="29" width="14" height="14" rx="2"/><path d="M32 34 H40 M32 38 H37"/></g>`);
  c.push(`<text x="62" y="33" font-size="13" font-weight="700" fill="${p.text}">Ticket card</text>`);
  const sub = v.repo === '' ? 'No repository' : v.repo;
  c.push(`<text x="62" y="49" font-size="12" fill="${p.muted}">${esc(fit(sub, 32))}</text>`);
  c.push(`<text x="${Width - pad}" y="33" font-size="12" font-weight="800" letter-spacing="1.5" text-anchor="end" fill="${p.accentFg}">PLOEG</text>`);
  if (v.demo) {
    c.push(`<rect x="${Width - pad - 44}" y="39" width="44" height="16" rx="8" fill="${p.tones.attention}" fill-opacity="0.16" stroke="${p.tones.attention}"/>`);
    c.push(`<text x="${Width - pad - 22}" y="51" font-size="10" font-weight="700" text-anchor="middle" fill="${p.text}">Demo</text>`);
  }
}

function title(c: string[], v: CardView): number {
  const lines = wrap(v.title, 30, maxTitle);
  const y = 84;
  lines.forEach((line, i) => c.push(`<text x="${pad}" y="${y + i * 23}" font-size="18" font-weight="700" fill="${p.text}">${esc(line)}</text>`));
  return y + (lines.length - 1) * 23;
}

function chips(c: string[], v: CardView, y: number): number {
  let x = pad;
  const w = chipWidth(v.state.label);
  const col = p.tones[v.state.tone];
  c.push(`<rect x="${x}" y="${y}" width="${w}" height="24" rx="12" fill="${col}" fill-opacity="0.14" stroke="${col}"/>`);
  c.push(`<circle cx="${x + 13}" cy="${y + 12}" r="4" fill="${col}"/>`);
  c.push(`<text x="${x + 23}" y="${y + 16}" font-size="12" font-weight="600" fill="${p.text}">${esc(v.state.label)}</text>`);
  x += w + 8;
  if (v.released) {
    const label = `${v.dayText} · ${v.finish.label}`;
    const lw = chipWidth(label);
    const fc = finishColour(v.finish);
    c.push(`<rect x="${x}" y="${y}" width="${lw}" height="24" rx="12" fill="${p.selected}" stroke="${fc}"/>`);
    c.push(`<circle cx="${x + 13}" cy="${y + 12}" r="4" fill="${fc}"/>`);
    c.push(`<text x="${x + 23}" y="${y + 16}" font-size="12" font-weight="600" fill="${p.text}">${esc(label)}</text>`);
  }
  return y + 24;
}

function chipWidth(label: string): number {
  return 32 + [...label].length * 7;
}

function main(c: string[], v: CardView, y: number): number {
  const cx = pad + 44;
  const cy = y + 48;
  const r = 40;
  c.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${p.track}" stroke-width="8"/>`);
  if (v.cost.arc) {
    const col = v.cost.over ? p.tones.danger : p.accent;
    c.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round" pathLength="100" stroke-dasharray="${formatFixed1(v.cost.share * 100)} 100" transform="rotate(-90 ${cx} ${cy})"/>`);
  }
  const size = [...v.cost.value].length > 10 ? 10 : 13;
  c.push(`<text x="${cx}" y="${cy + 2}" font-size="${size}" font-weight="700" text-anchor="middle" fill="${p.text}">${esc(v.cost.value)}</text>`);
  if (v.cost.caption !== '') c.push(`<text x="${cx}" y="${cy + 15}" font-size="9" text-anchor="middle" fill="${p.muted}">${esc(fit(v.cost.caption, 14))}</text>`);
  const tx = pad + 104;
  const tw = Width - pad - (pad + 104);
  tile(c, tx, y, tw, 'DIFF');
  if (v.diffKnown) {
    c.push(`<text x="${tx + 10}" y="${y + 35}" font-size="13" font-weight="700"><tspan fill="${p.tones.success}">${esc(v.adds)}</tspan> <tspan fill="${p.tones.danger}">${esc(v.dels)}</tspan>`);
    if (v.files !== '') c.push(` <tspan font-weight="400" fill="${p.muted}">${esc(v.files)}</tspan>`);
    c.push('</text>');
  } else {
    c.push(`<text x="${tx + 10}" y="${y + 35}" font-size="12" fill="${p.muted}">${esc(v.diff)}</text>`);
  }
  tile(c, tx, y + 52, tw, 'PR · CI');
  if (v.pr === '') c.push(`<text x="${tx + 10}" y="${y + 87}" font-size="12" fill="${p.muted}">No pull request yet</text>`);
  else c.push(`<text x="${tx + 10}" y="${y + 87}" font-size="13" font-weight="700" fill="${p.accentFg}">${esc(v.pr)} <tspan font-size="12" fill="${p.tones[v.prState.tone]}">${esc(v.prState.label)}</tspan> <tspan font-size="12" font-weight="600" fill="${p.tones[v.ci.tone]}">· ${esc(v.ci.label)}</tspan></text>`);
  return y + 96;
}

function tile(c: string[], x: number, y: number, w: number, label: string): void {
  c.push(`<rect x="${x}" y="${y}" width="${w}" height="44" rx="8" fill="${p.selected}" fill-opacity="0.5" stroke="${p.border}"/>`);
  c.push(`<text x="${x + 10}" y="${y + 16}" font-size="9" font-weight="700" letter-spacing="0.8" fill="${p.muted}">${esc(label)}</text>`);
}

function slab(c: string[], v: CardView, y: number): number {
  const g = v.grade!;
  c.push(`<rect x="${pad}" y="${y}" width="${Width - 2 * pad}" height="56" rx="8" fill="${p.selected}" stroke="${p.accent}" stroke-width="1.5" data-slot="grade"/>`);
  c.push(`<text x="${pad + 12}" y="${y + 18}" font-size="9" font-weight="700" letter-spacing="0.8" fill="${p.muted}">GRADE</text>`);
  c.push(`<text x="${pad + 12}" y="${y + 46}" font-size="26" font-weight="800" fill="${p.text}">${esc(g.overall)}</text>`);
  let status = g.provisional ? 'Provisional' : 'Settled';
  if (g.label !== '') status = g.label;
  c.push(`<text x="${pad + 80}" y="${y + 25}" font-size="12" font-weight="700" fill="${p.text}">${esc(status)}</text>`);
  const evidence = g.complete ? 'evidence complete' : 'evidence incomplete';
  c.push(`<text x="${pad + 80}" y="${y + 41}" font-size="10" fill="${p.muted}">Formula ${esc(g.formula)} · ${evidence}</text>`);
  if (g.qualifiers !== '') c.push(`<text x="${Width - pad - 12}" y="${y + 33}" font-size="12" font-weight="700" letter-spacing="1" text-anchor="end" fill="${p.tones.attention}">${esc(fit(g.qualifiers, 16))}</text>`);
  return y + 56;
}

function conditionRow(c: string[], v: CardView, y: number): number {
  let col: string = p.tones.danger;
  let label = `Cracked · ${plural(v.cracks, 'crack')}`;
  if (v.mended > 0) label += ` · ${count(v.mended)} mended`;
  if (v.condition === 'mended') {
    col = p.gold;
    label = `Mended · ${plural(v.cracks, 'crack')} sealed in gold`;
  }
  c.push(`<g data-slot="condition"><path d="M${pad} ${y + 16} l5 -6 l3 4 l5 -8" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);
  c.push(`<text x="${pad + 22}" y="${y + 15}" font-size="12" font-weight="600" fill="${p.text}">${esc(label)}</text></g>`);
  return y + 20;
}

function cracks(c: string[], v: CardView): void {
  const n = Math.min(v.cracks, 3);
  for (let i = 0; i < n; i++) {
    const col = i < v.mended ? p.gold : p.tones.danger;
    c.push(`<path d="M${Width - 10} ${64 + i * 72} l-6 14 l8 10 l-7 14 l6 12 l-5 14" fill="none" stroke="${col}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" data-crack="${i + 1}"/>`);
  }
}

function crewRow(c: string[], v: CardView, y: number): number {
  c.push(`<text x="${pad}" y="${y + 12}" font-size="9" font-weight="700" letter-spacing="0.8" fill="${p.muted}">CREW</text>`);
  c.push(`<text x="${pad + 44}" y="${y + 12}" font-size="12" fill="${p.text}">${esc(fit(v.crew, 42))}</text>`);
  return y + 16;
}

function stewardRow(c: string[], v: CardView, y: number): number {
  const cy = y + 20;
  c.push(`<line x1="${pad}" y1="${y}" x2="${Width - pad}" y2="${y}" stroke="${p.border}"/>`);
  if (v.steward === '') {
    c.push(`<circle cx="${pad + 16}" cy="${cy + 4}" r="16" fill="none" stroke="${p.border}" stroke-dasharray="3 3"/>`);
    c.push(`<line x1="${pad + 42}" y1="${cy + 2}" x2="${pad + 180}" y2="${cy + 2}" stroke="${p.border}"/>`);
    c.push(`<text x="${pad + 42}" y="${cy + 16}" font-size="10" fill="${p.muted}">Unsigned · no merge or approval yet</text>`);
    return y + 44;
  }
  c.push(`<circle cx="${pad + 16}" cy="${cy + 4}" r="16" fill="${p.selected}"/>`);
  c.push(`<text x="${pad + 16}" y="${cy + 8}" font-size="12" font-weight="700" text-anchor="middle" fill="${p.accentFg}">${esc(initials(v.steward))}</text>`);
  c.push(`<text x="${pad + 42}" y="${cy + 2}" font-size="14" font-weight="700" font-style="italic" fill="${p.text}">${esc(fit(v.steward, 30))}</text>`);
  let detail = 'Steward';
  if (v.stewardBy !== '') detail += ` · ${v.stewardBy}`;
  c.push(`<text x="${pad + 42}" y="${cy + 16}" font-size="10" fill="${p.muted}">${esc(detail)}</text>`);
  return y + 44;
}

function footer(c: string[], v: CardView, height: number): void {
  const y = height - 18;
  c.push(`<line x1="${pad}" y1="${y - 18}" x2="${Width - pad}" y2="${y - 18}" stroke="${p.border}"/>`);
  c.push(`<text x="${pad}" y="${y}" font-size="11" fill="${p.muted}">${esc(v.plays)}</text>`);
  c.push(`<text x="${Width - pad}" y="${y}" font-size="11" text-anchor="end" fill="${p.muted}">${esc(fit(v.ids.join(' · '), 40))}</text>`);
}

function describe(v: CardView): string {
  const parts = [v.state.label, `Cost ${v.cost.text}`, `Diff ${v.diff}`];
  if (v.pr !== '') parts.push(`Pull request ${v.pr} ${v.prState.label}, ${v.ci.label}`);
  if (v.released) parts.push(`${v.dayText} live, ${v.finish.label} finish`);
  if (v.grade) parts.push(`Grade ${v.grade.overall}${v.grade.complete ? ', evidence complete' : ', evidence incomplete'}`);
  if (v.cracks > 0) parts.push(`${plural(v.cracks, 'crack')}, ${count(v.mended)} mended`);
  if (v.steward !== '') parts.push(`Steward ${v.steward}`);
  return `${parts.join('. ')}.`;
}

const xmlEscapes: Record<string, string> = { '"': '&#34;', "'": '&#39;', '&': '&amp;', '<': '&lt;', '>': '&gt;', '\t': '&#x9;', '\n': '&#xA;', '\r': '&#xD;' };

function inXmlCharRange(cp: number): boolean {
  return cp === 0x09 || cp === 0x0a || cp === 0x0d || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);
}

/** Cleans and XML-escapes a text like Go's `xml.EscapeText`. */
export function esc(s: string): string {
  let out = '';
  for (const r of clean(s)) {
    const e = xmlEscapes[r];
    if (e !== undefined) out += e;
    else if (!inXmlCharRange(r.codePointAt(0)!)) out += '�';
    else out += r;
  }
  return out;
}

function wrap(s: string, width: number, lines: number): string[] {
  const words = goFields(clean(s));
  const out: string[] = [];
  let cur = '';
  for (const word of words) {
    let w = word;
    while ([...w].length > width) {
      if (cur !== '') {
        out.push(cur);
        cur = '';
      }
      const r = [...w];
      out.push(r.slice(0, width).join(''));
      w = r.slice(width).join('');
    }
    if (cur === '') cur = w;
    else if ([...cur].length + 1 + [...w].length <= width) cur += ` ${w}`;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur !== '') out.push(cur);
  if (out.length === 0) return [''];
  if (out.length > lines) {
    const last = out.slice(lines - 1).join(' ');
    return [...out.slice(0, lines - 1), fit(last, width)];
  }
  return out;
}

function initials(name: string): string {
  const parts = name.split(/[^\p{L}\p{Nd}]+/u).filter((part) => part !== '');
  const b: string[] = [];
  for (const part of parts) {
    b.push([...part][0]!);
    if (b.length === 2) break;
  }
  return b.map(goUpperRune).join('');
}
