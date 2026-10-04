import { copyRoleLabels, finishLadder, rarityTier } from './card-model.js';
import { count, date, plural, score } from '../core/format.js';

/** The pattern names the odds table and the reveal use, keyed like the forge's foil patterns. */
export const patternLabels = Object.freeze({ none: 'Plain', holo: 'Holo', reverse: 'Reverse holo', rainbow: 'Rainbow', etched: 'Etched', glitter: 'Glitter', cosmos: 'Cosmos', crackedice: 'Cracked ice', liquid: 'Liquid metal', prism: 'Prism', galaxy: 'Galaxy', refractor: 'Refractor', lenticular: 'Lenticular', gold: 'Gold', blacklabel: 'Black chrome', superfractor: 'Superfractor' });

const percentFormat = new Intl.NumberFormat('nl-NL', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A probability in basis points as an nl-NL percentage with two decimals: 2400 is "24,00%". */
export function oddsPercent(basisPoints) {
  return Number.isFinite(basisPoints) ? percentFormat.format(basisPoints / 10_000) : '—';
}

/** A probability in basis points as "1 in N", rounded: 20 is "1 in 500". */
export function oddsOneIn(basisPoints) {
  return Number.isFinite(basisPoints) && basisPoints > 0 ? `1 in ${count(Math.round(10_000 / basisPoints))}` : '—';
}

/** The basis points of a pulled pattern in the published odds, or null when the odds do not list it. */
export function patternBasisPoints(odds, pattern) {
  return odds?.patterns?.find(entry => entry.key === pattern)?.basisPoints ?? null;
}

/**
 * How much anticipation a reveal builds, 0 to 3, from the pull alone and never from the card: a pattern drawn at 10 %
 * or more is 0, from 3 % 1, from 1 % 2 and below 1 % 3; each cosmetic extra adds one, up to 3. The charge time and
 * the burst grow with it.
 */
export function pullIntensity(pull, odds) {
  if (!pull) return { level: 0, chargeMs: 300, burst: 0 };
  const share = (patternBasisPoints(odds, pull.pattern) ?? 10_000) / 10_000;
  let level = share >= 0.1 ? 0 : share >= 0.03 ? 1 : share >= 0.01 ? 2 : 3;
  level = Math.min(3, level + (pull.altArt !== null && pull.altArt !== undefined ? 1 : 0) + (pull.fullArt ? 1 : 0) + (pull.goldSignature ? 1 : 0));
  return { level, chargeMs: [450, 900, 1500, 2300][level], burst: [40, 110, 220, 420][level] };
}

/** The extras a pull carries, in the odds table's words. */
export function pullExtras(pull) {
  if (!pull) return [];
  return [pull.altArt !== null && pull.altArt !== undefined ? 'Alt art' : '', pull.fullArt ? 'Full art' : '', pull.goldSignature ? 'Gold signature' : ''].filter(Boolean);
}

/** A pull in words: "Gold foil · Alt art". A plain pull reads "Plain". */
export function pullText(pull) {
  if (!pull) return 'No pull yet';
  const pattern = pull.pattern === 'none' ? 'Plain' : `${patternLabels[pull.pattern] ?? pull.pattern} foil`;
  return [pattern, ...pullExtras(pull)].join(' · ');
}

const finishLabel = key => finishLadder.find(step => step.key === key)?.label ?? key;

/** A card moment in words: "Finish rose to Holo", "Rarity revealed: Epic", "Cracked · S2 · VIK-1642", "Merged #57", "Graded 8,5", "Set of 5 complete". */
export function momentText(moment) {
  const detail = moment?.detail ?? {};
  switch (moment?.kind) {
    case 'minted': return 'Minted: the first Run started';
    case 'merged': return detail.number ? `Merged #${detail.number}` : 'Merged';
    case 'released': return detail.source === 'merge' ? 'Released (counted from the merge)' : `Released to ${detail.environment || 'production'}`;
    case 'rarity': return `Rarity revealed: ${rarityTier(detail.tier)?.label ?? 'a new tier'}`;
    case 'finish': return `Finish rose from ${finishLabel(detail.from)} to ${finishLabel(detail.to)}`;
    case 'cracked': return ['Cracked', detail.severity, detail.ref].filter(Boolean).join(' · ');
    case 'mended': return ['Mended', detail.ref, detail.pr ? `in #${detail.pr}` : ''].filter(Boolean).join(' · ');
    case 'graded': return typeof detail.from === 'number' ? `Grade changed from ${score(detail.from)} to ${score(detail.to)}` : `Graded ${score(detail.to)}`;
    case 'set': return detail.size ? `Set of ${detail.size} complete` : 'Set complete';
    default: return 'Changed';
  }
}

/** A pack's period in words: "Week 40 · 2026", or "delivery sprint · 28-09-2026 to 11-10-2026". */
export function periodLabel(period) {
  if (!period) return 'Pack';
  if (period.kind === 'week') return `Week ${period.week} · ${period.year}`;
  const last = Date.parse(period.end) - 86_400_000;
  return `${period.team} sprint · ${date(period.start)} to ${date(new Date(last).toISOString())}`;
}

/** What an opened pack held: "6 cards · 2 foil pulls · 1 alt art · 1 upgrade". */
export function packSummaryText(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const firsts = list.filter(entry => entry.kind === 'new');
  const foil = firsts.filter(entry => entry.pull && entry.pull.pattern !== 'none').length;
  const alt = firsts.filter(entry => entry.pull && entry.pull.altArt !== null && entry.pull.altArt !== undefined).length;
  const full = firsts.filter(entry => entry.pull?.fullArt).length;
  const gold = firsts.filter(entry => entry.pull?.goldSignature).length;
  const upgrades = list.length - firsts.length;
  return [plural(list.length, 'card'), foil ? plural(foil, 'foil pull') : '', alt ? `${count(alt)} alt art` : '', full ? `${count(full)} full art` : '', gold ? plural(gold, 'gold signature') : '', upgrades ? plural(upgrades, 'upgrade') : ''].filter(Boolean).join(' · ');
}

/** The role that names a copy, as a label. */
export function roleLabel(role) {
  return copyRoleLabels[role] ?? (role ? role[0].toUpperCase() + role.slice(1) : '');
}

/**
 * The card a person's copy shows: the card itself, drawn with the forge skin (pulls are forge cosmetics), carrying the
 * copy's role and its first pull. A copy without a pull keeps the card's own derived pattern.
 */
export function copyCard(card, copy) {
  if (!card) return null;
  const pull = copy?.pull ?? null;
  return { ...card, style: { ...(card.style ?? {}), skin: 'forge' }, copy: { role: copy?.role ?? '', foilPattern: pull?.pattern ?? null, altArt: pull?.altArt ?? null, fullArt: pull?.fullArt === true, goldSignature: pull?.goldSignature === true } };
}

const after = (value, at) => { const ms = typeof value === 'string' ? Date.parse(value) : NaN; return Number.isFinite(ms) && ms > at; };

/**
 * The card as it stood at `at` (milliseconds): plays merged later are still open, a later release has not happened, a
 * rarity revealed later is still its prediction (without the revealed score), cracks confirmed later are absent and
 * mends made later are undone. With the card element's `asOf` set to the same
 * moment, it replays what changed since.
 */
export function cardAsOf(card, at) {
  if (!card) return card;
  const copy = structuredClone(card);
  copy.plays = (copy.plays ?? []).map(play => play.state === 'merged' && after(play.mergedAt, at) ? { ...play, state: 'open', mergedAt: null, mergedBy: '' } : play);
  if (copy.release && after(copy.release.at, at)) copy.release = null;
  if (copy.rarity?.revealed && after(copy.rarity.revealedAt, at)) copy.rarity = copy.rarity.predicted ? { ...copy.rarity, revealed: null, tier: copy.rarity.predicted, score: null, percentile: null, cohort: null, inputs: null, revealedAt: null } : null;
  if (copy.plays.length && !copy.plays.some(play => play.state === 'merged') && copy.state === 'merged') copy.state = 'in_review';
  if (copy.condition) {
    const cracks = copy.condition.cracks.filter(crack => !after(crack.confirmedAt, at)).map(crack => crack.mended && after(crack.mended.at, at) ? { ...crack, mended: null } : crack);
    copy.condition = cracks.length ? { state: cracks.some(crack => !crack.mended) ? 'cracked' : 'mended', cracks } : null;
  }
  return copy;
}
