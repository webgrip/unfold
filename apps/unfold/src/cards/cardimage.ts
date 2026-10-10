import { clean, count, daysLive, finishFor, fit, goTrim, goUpperRune, nanos, newView, plural } from './cardimage-view.ts';
import type { CardImageCard, CardImagePlay } from './cardimage-view.ts';

export { ContentType, Width, cardPalette, renderCardImage } from './cardimage-svg.ts';
export type { CardImageOptions } from './cardimage-svg.ts';
export { FinishLadder, daysLive, finishFor, money } from './cardimage-view.ts';
export type { CardImageCard, CardImageCondition, CardImageCrew, CardImageGrade, CardImagePlay, CardImageRelease, CardImageTotals, Finish } from './cardimage-view.ts';

/** The compact Markdown table of the facts the card image shows, byte for byte as Ploeg's `cardimage.Summary` writes it. It names no person except the steward, and every card text is escaped so it cannot add Markdown, HTML, a mention or a reference. */
export function cardSummary(card: CardImageCard, now: string | Date): string {
  const v = newView(card, now);
  let b = `| Card | ${md(v.title)} |\n| --- | --- |\n`;
  const row = (label: string, value: string): void => {
    b += `| ${label} | ${md(value)} |\n`;
  };
  row('State', v.state.label);
  row('Cost', v.cost.text);
  row('Diff', v.diff);
  if (v.pr !== '') row('Pull request', `${v.pr} · ${v.prState.label} · ${v.ci.label}`);
  if (v.released) {
    let live = `${v.dayText} · ${v.finish.label} finish`;
    if (v.source === 'merge') live += ' · counted from merge, no deploy signal';
    row('Days live', live);
  }
  const g = v.grade;
  if (g) {
    let grade = g.overall;
    if (g.label !== '') grade += ` · ${g.label}`;
    else if (g.provisional) grade += ' · provisional';
    if (g.qualifiers !== '') grade += ` · ${g.qualifiers}`;
    let evidence = 'evidence complete';
    if (g.missing.length > 0) evidence = `missing ${g.missing.join(', ')}`;
    else if (!g.complete) evidence = 'evidence incomplete';
    row('Grade', `${grade} · formula ${g.formula} · ${evidence}`);
  }
  if (v.cracks > 0) {
    const condition = v.condition === 'mended'
      ? `Mended · ${plural(v.cracks, 'crack')} sealed`
      : `Cracked · ${plural(v.cracks, 'crack')} · ${count(v.mended)} mended`;
    row('Condition', condition);
  }
  let steward = 'Unsigned';
  if (v.steward !== '') {
    steward = v.steward;
    if (v.stewardBy !== '') steward += ` · ${v.stewardBy}`;
  }
  row('Steward', steward);
  row('Crew', v.crew);
  row('Ids', v.ids.join(' · '));
  return b;
}

const mdEscapes: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;',
  '\\': '\\\\', '`': '\\`', '*': '\\*', _: '\\_', '[': '\\[', ']': '\\]',
  '(': '\\(', ')': '\\)', '!': '\\!', '|': '\\|', '~': '\\~', $: '\\$',
  '@': '@⁠', '#': '#⁠', ':': ':⁠',
};

function md(s: string): string {
  let out = '';
  for (const r of clean(s)) out += mdEscapes[r] ?? r;
  return goTrim(out);
}

/** The newest moment worth showing a card has reached (Ploeg ADR-0055). `key` changes exactly when a new moment is reached and is empty before the first merge; `play` is the number of the latest merged play, 0 when none merged. */
export type CardMoment = { key: string; play: number };

/** Reads the moment `card` has reached at `now`, as Ploeg's `cardimage.MomentOf` does. */
export function momentOf(card: CardImageCard, now: string | Date): CardMoment {
  let latest: CardImagePlay | undefined;
  for (const p of card.plays ?? []) {
    if (p.state !== 'merged') continue;
    if (!latest || compareMerged(p, latest) >= 0) latest = p;
  }
  if (!latest || card.state === 'withdrawn') return { key: '', play: 0 };
  const parts = [`merged:${latest.number}`];
  if (card.release && card.release.source === 'deploy') parts.push(`released:${card.release.environment}`);
  const days = daysLive(card, now);
  if (days !== null) parts.push(`finish:${finishFor(days).key}`);
  const mended = mendedCracks(card);
  if (mended > 0) parts.push(`mended:${mended}`);
  return { key: parts.join(';'), play: latest.number };
}

/** Names the moment that moved the card from the key `previous` to `moment`, for the comment's heading: "Mended", "Foil finish", "Released to production" or "Merged". */
export function momentHeadline(moment: CardMoment, previous: string): string {
  const before = fields(previous);
  const now = fields(moment.key);
  const at = (m: Map<string, string>, k: string): string => m.get(k) ?? '';
  if (at(now, 'mended') !== '' && at(now, 'mended') !== at(before, 'mended')) return 'Mended';
  const f = at(now, 'finish');
  if (f !== '' && f !== 'matte' && f !== at(before, 'finish')) {
    const first = [...f][0]!;
    return `${goUpperRune(first)}${f.slice(first.length)} finish`;
  }
  if (at(now, 'released') !== '' && at(now, 'released') !== at(before, 'released')) return `Released to ${at(now, 'released')}`;
  return 'Merged';
}

function fields(key: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of key.split(';')) {
    const i = part.indexOf(':');
    if (i >= 0) out.set(part.slice(0, i), part.slice(i + 1));
  }
  return out;
}

function mendedCracks(card: CardImageCard): number {
  return (card.condition?.cracks ?? []).filter((k) => k.mended && k.mended.confirmedAt !== null && k.mended.confirmedAt !== undefined).length;
}

function compareMerged(a: CardImagePlay, b: CardImagePlay): number {
  const x = a.mergedAt ? nanos(a.mergedAt) : null;
  const y = b.mergedAt ? nanos(b.mergedAt) : null;
  if (x === y) return 0;
  if (x === null) return -1;
  if (y === null) return 1;
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Opens the one card comment on a pull request; the comment is found by it and edited in place. */
export const CommentMarker = '<!-- ploeg:run-card -->';

const anyCardMarker = /^<!--[\t\n\f\r ]*[a-z0-9-]+:run-card[\t\n\f\r ]*-->/;

/** Reports whether a comment body is a Run card comment, recognising the marker of any product name before ":run-card". */
export function isCardComment(body: string): boolean {
  return anyCardMarker.test(goTrim(body));
}

/** The name the card image is stored under on the forge: "run-card-<Work Item digits>.svg". */
export function cardFileName(card: Pick<CardImageCard, 'workItemId'>): string {
  return `run-card-${card.workItemId.replace(/[^0-9]/g, '')}.svg`;
}

/** The card comment, byte for byte as Ploeg's `cardimage.CommentBody` writes it: the marker, a heading naming the moment, the card image when `imageUrl` is an http(s) or root-relative URL, the summary table and a footer. */
export function cardCommentBody(card: CardImageCard, now: string | Date, headline: string, imageUrl: string): string {
  let b = `${CommentMarker}\n### Run card · ${md(headline)}\n\n`;
  const dest = imageDestination(imageUrl);
  if (dest !== null) b += `![Run card: ${md(fit(newView(card, now).title, 120))}](${dest})\n\n`;
  b += cardSummary(card, now);
  b += '\n<sub>Posted by Ploeg when this card reached a moment: a merge, a release to production, a new finish or a mend. '
    + "It shows the change's own facts and its steward; nothing on it ranks or scores a person.</sub>\n";
  return b;
}

function imageDestination(raw: string): string | null {
  const u = goTrim(raw);
  if (u === '' || /[ \t\r\n<>"'()\\`]/.test(u)) return null;
  if (u.startsWith('https://') || u.startsWith('http://')) return u;
  if (u.startsWith('/') && !u.startsWith('//')) return u;
  return null;
}
