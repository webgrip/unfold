import { finishLadder } from '../card-model.js';
import { plural, score } from '../../core/format.js';

const dayMs = 86_400_000;
const time = value => { if (typeof value !== 'string' || !value) return null; const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : null; };
const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
const halfStep = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10 && Number.isInteger(value * 2);

/** The moment kinds the Work Item page plays a ceremony for. Minted is history, not news. */
export const ceremonyKinds = Object.freeze(['merged', 'released', 'finish', 'cracked', 'mended', 'graded', 'set']);

/**
 * A card's moments up to `now`, oldest first, from its facts only. It mirrors `cardMoments` in `src/packs.ts`, which
 * the binder and packs use: minted (the first Run), each merged play, released, each finish step crossed (the release
 * plus the step's days), each confirmed crack and each mend.
 * @param {object} card The card from `GET /api/ploeg/work-items/:id/card`.
 * @param {number} [now] Milliseconds.
 * @returns {{ workItemId: string, kind: string, at: string, detail: Record<string, string | number> }[]}
 */
export function cardMoments(card, now = Date.now()) {
  if (!card) return [];
  const id = card.workItemId;
  const moments = [];
  const add = (kind, at, detail = {}) => { if (at !== null && at <= now) moments.push({ workItemId: id, kind, at: iso(at), detail }); };
  const minted = (card.events ?? []).find(event => event.kind === 'minted');
  add('minted', time(minted?.at) ?? time(card.totals?.firstRunAt));
  for (const play of card.plays ?? []) if (play.state === 'merged') add('merged', time(play.mergedAt), { number: play.number });
  const released = time(card.release?.at);
  if (released !== null) {
    add('released', released, { source: card.release.source, environment: card.release.environment });
    for (let index = 1; index < finishLadder.length; index++) add('finish', released + finishLadder[index].days * dayMs, { from: finishLadder[index - 1].key, to: finishLadder[index].key });
  }
  for (const crack of card.condition?.cracks ?? []) {
    add('cracked', time(crack.confirmedAt), { severity: crack.severity, ...(crack.bug?.ref ? { ref: crack.bug.ref } : {}) });
    if (crack.mended) add('mended', time(crack.mended.at), { ...(crack.bug?.ref ? { ref: crack.bug.ref } : {}), ...(crack.mended.pr !== null && crack.mended.pr !== undefined ? { pr: crack.mended.pr } : {}) });
  }
  return moments.sort((a, b) => a.at.localeCompare(b.at));
}

/** What a seen mark keeps of a card that its moments cannot tell: the overall grade and whether its set is complete. */
export function cardSnapshot(card) {
  return { grade: halfStep(card?.grade?.overall) ? card.grade.overall : null, setComplete: card?.set?.complete === true };
}

/**
 * The news on a card since the person last saw it, oldest first: every ceremony moment after the mark's `seenAt`, a
 * grade that differs from the one they saw, and a set that became complete. Before their first look (no mark) there
 * is no news, so a card's history never plays as a backlog.
 * @param {object} card
 * @param {{ seenAt: string | null, snapshot: { grade: number | null, setComplete: boolean } | null } | null} mark
 * @param {number} [now] Milliseconds.
 */
export function cardNews(card, mark, now = Date.now()) {
  if (!card || !mark?.seenAt) return [];
  const news = cardMoments(card, now).filter(moment => ceremonyKinds.includes(moment.kind) && moment.at > mark.seenAt);
  const seen = mark.snapshot ?? { grade: null, setComplete: false };
  const current = cardSnapshot(card);
  const at = iso(Math.floor(now / 1000) * 1000);
  if (current.grade !== null && current.grade !== seen.grade) news.push({ workItemId: card.workItemId, kind: 'graded', at, detail: { ...(seen.grade !== null ? { from: seen.grade } : {}), to: current.grade } });
  if (current.setComplete && !seen.setComplete) news.push({ workItemId: card.workItemId, kind: 'set', at, detail: { size: card.set?.size ?? 0 } });
  return news;
}

/**
 * The card as it stood just before `moment`, for a skin that replays the change: the grade it had before a grade
 * moment, the set incomplete before a set moment, and otherwise `asOf(card, at - 1 s)` (the collection model's `cardAsOf`).
 * @param {object} card
 * @param {{ kind: string, at: string, detail?: Record<string, unknown> }} moment
 * @param {(card: object, at: number) => object} asOf
 */
export function cardBefore(card, moment, asOf) {
  const at = Date.parse(moment.at) - 1000;
  const before = asOf(card, at);
  if (moment.kind === 'graded') return { ...before, grade: typeof moment.detail?.from === 'number' && before.grade ? { ...before.grade, overall: moment.detail.from } : null };
  if (moment.kind === 'set' && before.set) return { ...before, set: { ...before.set, complete: false } };
  return before;
}

const finishLabel = key => finishLadder.find(step => step.key === key)?.label ?? key;

/**
 * The words a ceremony's title shows for a moment: a short headline and a line under it.
 * @param {{ kind: string, detail?: Record<string, unknown> }} moment
 * @returns {{ main: string, sub: string }}
 */
export function momentHeadline(moment) {
  const detail = moment?.detail ?? {};
  switch (moment?.kind) {
    case 'merged': return { main: 'Merged', sub: detail.number ? `#${detail.number} is in` : 'into the trunk' };
    case 'released': return { main: 'Released', sub: detail.source === 'merge' ? 'counted from the merge' : `to ${detail.environment || 'production'}` };
    case 'finish': return { main: finishLabel(detail.to), sub: `${plural(finishLadder.find(step => step.key === detail.to)?.days ?? 0, 'day')} live` };
    case 'cracked': return { main: 'Cracked', sub: [detail.severity, detail.ref].filter(Boolean).join(' · ') || 'a bug was traced here' };
    case 'mended': return { main: 'Mended', sub: [detail.ref, detail.pr ? `in #${detail.pr}` : ''].filter(Boolean).join(' ') || 'the crack is fixed' };
    case 'graded': return { main: `Grade ${score(detail.to)}`, sub: typeof detail.from === 'number' ? `was ${score(detail.from)}` : 'first grade' };
    case 'set': return { main: 'Set complete', sub: detail.size ? plural(detail.size, 'card') : 'every card settled' };
    default: return { main: 'Changed', sub: '' };
  }
}
