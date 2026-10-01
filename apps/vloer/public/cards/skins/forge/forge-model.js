import { stableHash } from '../../card-model.js';

/** Every foil pattern the forge shaders draw, in catalogue order, with its display name. */
export const foilPatterns = Object.freeze([
  Object.freeze({ key: 'galaxy', label: 'Galaxy', derived: true }),
  Object.freeze({ key: 'crackedice', label: 'Cracked ice', derived: true }),
  Object.freeze({ key: 'rainbow', label: 'Rainbow', derived: true }),
  Object.freeze({ key: 'gold', label: 'Gold', derived: true }),
  Object.freeze({ key: 'refractor', label: 'Refractor', derived: true }),
  Object.freeze({ key: 'superfractor', label: 'Superfractor', derived: true }),
  Object.freeze({ key: 'etched', label: 'Etched', derived: true }),
  Object.freeze({ key: 'prism', label: 'Prism', derived: true }),
  Object.freeze({ key: 'glitter', label: 'Glitter', derived: true }),
  Object.freeze({ key: 'liquid', label: 'Liquid metal', derived: true }),
  Object.freeze({ key: 'lenticular', label: 'Lenticular', derived: true }),
  Object.freeze({ key: 'blacklabel', label: 'Black chrome', derived: true }),
  Object.freeze({ key: 'holo', label: 'Holo', derived: false }),
  Object.freeze({ key: 'reverse', label: 'Reverse holo', derived: false }),
  Object.freeze({ key: 'cosmos', label: 'Cosmos', derived: false }),
  Object.freeze({ key: 'none', label: 'Plain', derived: false }),
]);

/** The patterns a card gets before packs assign one: those that draw on the frame and the art window, so every earned coverage shows. */
export const derivedPatterns = Object.freeze(foilPatterns.filter(pattern => pattern.derived));

/** The art presets the forge shaders draw, with the colour the frame metal is tinted from. */
export const artPresets = Object.freeze([
  Object.freeze({ key: 'nebula', label: 'Nebula', tint: '#3b1f63' }),
  Object.freeze({ key: 'aurora', label: 'Aurora', tint: '#0f4a46' }),
  Object.freeze({ key: 'liquid', label: 'Liquid', tint: '#6b4ca8' }),
  Object.freeze({ key: 'crystal', label: 'Crystal', tint: '#2e5f8a' }),
  Object.freeze({ key: 'flow', label: 'Flow', tint: '#1f3b5c' }),
  Object.freeze({ key: 'synth', label: 'Synthwave', tint: '#7a1f6b' }),
  Object.freeze({ key: 'rain', label: 'Code rain', tint: '#0b3a1e' }),
  Object.freeze({ key: 'plasma', label: 'Plasma', tint: '#8a2a5c' }),
  Object.freeze({ key: 'ocean', label: 'Ocean', tint: '#a8562e' }),
  Object.freeze({ key: 'fire', label: 'Fire', tint: '#8a3a0f' }),
  Object.freeze({ key: 'warp', label: 'Warp', tint: '#14184a' }),
  Object.freeze({ key: 'topo', label: 'Topo', tint: '#2c4a3a' }),
  Object.freeze({ key: 'gen_koi', label: 'Koi pond', tint: '#123a3a' }),
  Object.freeze({ key: 'gen_gold', label: 'Gold river', tint: '#5a3a0a' }),
  Object.freeze({ key: 'gen_jelly', label: 'Jellyfish', tint: '#1a1450' }),
]);

/**
 * How much of the card the foil covers at each earned finish. Coverage only grows: matte has none, foil (7 days live)
 * covers the frame, holo (30) adds the art window, prism (90) the whole card, gilded (180) adds gold edges and
 * infinity (365) an animated border.
 */
export const coverageLadder = Object.freeze([
  Object.freeze({ finish: 'matte', key: 'none', level: 0, frame: 0, art: 0, card: 0, gilded: false, border: false, label: 'No foil yet' }),
  Object.freeze({ finish: 'foil', key: 'frame', level: 1, frame: 1, art: 0, card: 0, gilded: false, border: false, label: 'Foil on the frame' }),
  Object.freeze({ finish: 'holo', key: 'art', level: 2, frame: 1, art: 1, card: 0, gilded: false, border: false, label: 'Foil on the frame and the art window' }),
  Object.freeze({ finish: 'prism', key: 'card', level: 3, frame: 1, art: 1, card: 1, gilded: false, border: false, label: 'Foil over the whole card' }),
  Object.freeze({ finish: 'gilded', key: 'gilded', level: 4, frame: 1, art: 1, card: 1, gilded: true, border: false, label: 'Foil over the whole card, gilded edges' }),
  Object.freeze({ finish: 'infinity', key: 'border', level: 5, frame: 1, art: 1, card: 1, gilded: true, border: true, label: 'Foil over the whole card, gilded edges and an animated border' }),
]);

/** The coverage a finish earns; an unknown finish covers nothing. */
export function coverageFor(finish) {
  return coverageLadder.find(step => step.finish === finish) ?? coverageLadder[0];
}

const salt = view => view?.style?.theme || view?.style?.skin || 'forge';

/** The frames a theme may give the forge: the classic window, full art behind translucent panels, or the card in a grading slab. */
export const frames = Object.freeze(['classic', 'fullart', 'slab']);

/** The frame a card is drawn in: its theme's, or classic. */
export function frameFor(view) {
  return frames.includes(view?.theme?.frame) ? view.theme.frame : 'classic';
}

/**
 * The foil pattern a card shows: the one a pack pull assigned (`view.foilPattern`) when the forge draws it, then its
 * theme's default pattern, otherwise one picked by a stable hash of the Work Item id and the theme (or skin), so it
 * never changes between pages or reloads.
 * @param {{ id: string, foilPattern?: string | null, style?: { skin?: string, theme?: string }, theme?: { foilPattern?: string | null } | null }} view
 */
export function patternFor(view) {
  const pulled = foilPatterns.find(pattern => pattern.key === view?.foilPattern);
  if (pulled) return { ...pulled, source: 'pull' };
  const themed = foilPatterns.find(pattern => pattern.key === view?.theme?.foilPattern);
  if (themed) return { ...themed, source: 'theme' };
  return { ...derivedPatterns[stableHash(`pattern|${view?.id ?? ''}|${salt(view)}`) % derivedPatterns.length], source: 'derived' };
}

/**
 * The art a card shows. An alternate-art pull (`view.copy.altArt`, 0–13) names one of the other presets, counted on
 * from the card's own. Otherwise it is its theme's preset, shader or uploaded image or video, else a preset picked by a
 * stable hash of the Work Item id and the theme (or skin). A shader carries its GLSL as `code` and draws as `custom`;
 * an upload draws as `media` from `url`.
 */
export function artFor(view) {
  const art = view?.theme?.art;
  const tint = view?.theme?.tokens?.['--forge-frame'] ?? null;
  const themed = art?.kind === 'preset' ? artPresets.findIndex(entry => entry.key === art.preset) : -1;
  const own = themed >= 0 ? themed : stableHash(`art|${view?.id ?? ''}|${salt(view)}`) % artPresets.length;
  const alternate = view?.copy?.altArt;
  if (Number.isInteger(alternate) && alternate >= 0) return { ...artPresets[(own + 1 + (alternate % (artPresets.length - 1))) % artPresets.length], source: 'alt' };
  if (themed >= 0) return { ...artPresets[themed], source: 'theme' };
  if (art?.kind === 'shader' && typeof art.code === 'string' && art.code) return { key: 'custom', label: 'Custom shader', tint: tint ?? '#2a3340', code: art.code, source: 'theme' };
  if (art?.kind === 'media' && typeof art.url === 'string') return { key: 'media', label: art.video ? 'Uploaded video' : 'Uploaded image', tint: tint ?? '#2a3340', url: art.url, video: Boolean(art.video), source: 'theme' };
  return { ...artPresets[own], source: 'derived' };
}

/** The art a card falls back to when its theme's shader does not compile on this GPU. */
export function fallbackArt(view) {
  return { ...artPresets[stableHash(`art|${view?.id ?? ''}|${salt(view)}`) % artPresets.length], source: 'fallback' };
}

/** A stable number in [0, 1) for a card, which seeds the shaders' sparkle and crack layout. */
export function seedFor(view) {
  return (stableHash(`seed|${view?.id ?? ''}`) % 100_000) / 100_000;
}

/**
 * How the forge paints each rarity tier (Vloer ADR 0034): the frame metal's dark and light stops (sRGB, 0 to 1)
 * the front shader blends through, whether it turns iridescent, the hint colour a predicted rarity glows in, the ink of
 * the tier's word and the set symbol's fill (two stops, or `spectrum` for iridescent).
 */
export const rarityMetals = Object.freeze({
  common: Object.freeze({ lo: Object.freeze([0.2, 0.22, 0.24]), hi: Object.freeze([0.62, 0.66, 0.7]), irid: 0, hint: Object.freeze([0.66, 0.72, 0.78]), ink: '#c4ccd2', symbol: Object.freeze(['#2a2f33', '#121518']), rim: '#cfd8da' }),
  uncommon: Object.freeze({ lo: Object.freeze([0.3, 0.16, 0.06]), hi: Object.freeze([0.86, 0.56, 0.3]), irid: 0, hint: Object.freeze([0.9, 0.6, 0.34]), ink: '#e2ae76', symbol: Object.freeze(['#f4f7fa', '#8e99a5']), rim: '#1a1d20' }),
  rare: Object.freeze({ lo: Object.freeze([0.42, 0.46, 0.52]), hi: Object.freeze([0.96, 0.98, 1]), irid: 0, hint: Object.freeze([0.82, 0.9, 1]), ink: '#e8eef4', symbol: Object.freeze(['#fff1b8', '#c98f22']), rim: '#2a1a05' }),
  epic: Object.freeze({ lo: Object.freeze([0.42, 0.26, 0.03]), hi: Object.freeze([1, 0.8, 0.36]), irid: 0, hint: Object.freeze([1, 0.8, 0.36]), ink: '#ffd36b', symbol: Object.freeze(['#ffb27a', '#c8400f']), rim: '#fff0c8' }),
  legendary: Object.freeze({ lo: Object.freeze([0.42, 0.36, 0.6]), hi: Object.freeze([0.98, 0.94, 1]), irid: 0.85, hint: Object.freeze([0.8, 0.68, 1]), ink: '#e9dcff', symbol: 'spectrum', rim: '#ffffff' }),
});

/** What the forge paints for a card's rarity: its tier, whether it is predicted or revealed, the word on the type line and the tier's metal; null without a rarity. */
export function rarityLook(view) {
  const rarity = view?.rarity;
  const metal = rarity ? rarityMetals[rarity.key] : null;
  if (!metal) return null;
  return { key: rarity.key, state: rarity.state, label: rarity.label, word: rarity.state === 'predicted' ? `Predicted ${rarity.label}` : rarity.label, ...metal };
}

const money = /^US\$\s*/u;

function coin(view) {
  const cost = view.cost ?? {};
  if (view.demo || cost.status === 'demo') return { top: 'COST', main: 'Demo', caption: '', status: 'demo' };
  if (typeof cost.value === 'string' && money.test(cost.value) && cost.value !== '< US$ 0,01') return { top: 'US$', main: cost.value.replace(money, ''), caption: cost.status === 'live' ? 'so far' : cost.status === 'reserved' ? 'reserved' : '', status: cost.status ?? '' };
  if (typeof cost.value === 'string' && cost.value.startsWith('<')) return { top: 'US$', main: '< 0,01', caption: '', status: cost.status ?? '' };
  return { top: 'COST', main: '—', caption: (cost.text || 'Not reported').toLowerCase(), status: cost.status ?? 'not_reported' };
}

function releaseLine(view) {
  const release = view.release ?? {};
  if (release.released) return `${release.dayText} · ${release.source === 'merge' ? 'counted from the merge' : `since the first deploy to ${release.environment}`}`;
  if (view.state?.key === 'merged' && release.reported) return 'Not live in production yet';
  return release.reported ? 'Not released' : 'Releases not reported';
}

function gatesLine(gates, evolved) {
  if (!gates) return '';
  const counted = gates.bounces.filter(entry => entry.counts).length;
  const back = gates.bounces.length ? `${gates.bounces.length} back${counted < gates.bounces.length ? ` (${[...new Set(gates.bounces.map(entry => entry.reasonText.toLowerCase()))].join(', ')})` : ''}` : '';
  const first = gates.rightFirstTime?.state === 'yes' ? 'right first time' : '';
  return [gates.current.label, first, back, evolved ? 'evolved' : ''].filter(Boolean).join(' · ');
}

function gradeWord(grade) {
  if (!grade) return '';
  if (grade.labelKey === 'black') return 'BLACK LABEL';
  if (grade.labelKey === 'gold') return 'GOLD LABEL';
  return grade.provisional ? 'PROVISIONAL' : 'FINAL';
}

/**
 * Everything the forge paints on the card, as plain text: the same facts as every other skin, from the view model, so
 * a demo card reads "Demo · no model calls" and an unknown value never reads as zero.
 * @param {object} view The `cardView` model.
 */
export function faceFacts(view) {
  const coverage = coverageFor(view.finish?.key);
  const pattern = patternFor(view);
  const art = artFor(view);
  const grade = view.grade ?? null;
  const condition = view.condition ?? null;
  const sub = [view.repo || view.team || 'No repository', view.rounds ? `Round ${view.rounds}` : ''].filter(Boolean).join(' · ');
  const playLine = view.pr ? [view.plays?.text, `${view.pr.text} ${view.pr.state?.label ?? ''}`.trim(), view.pr.ciText].filter(Boolean).join(' · ') : 'No pull request yet';
  return {
    title: view.title,
    sub,
    coin: coin(view),
    state: { label: view.state?.label ?? '', tone: view.state?.tone ?? 'neutral' },
    condition: condition ? { state: condition.state, label: condition.label, text: condition.text } : null,
    finishLine: view.release?.released ? `${view.release.dayText} · ${view.finish.label}` : view.finish?.label ?? 'Matte',
    rows: [
      ['Crew', view.crew || 'No agent Runs yet'],
      ['Plays', playLine],
      ['Diff', view.diff?.value ?? 'Not reported'],
      ['Run time', view.runTime?.value ?? 'Not reported'],
      ['Live', releaseLine(view)],
      ...(view.gates ? [['Gates', gatesLine(view.gates, view.evolved)]] : []),
    ],
    set: view.set ? { symbol: view.set.symbol, text: view.set.text, complete: view.set.complete } : null,
    grade: grade ? { text: grade.text, word: gradeWord(grade), qualifiers: grade.qualifiers.map(entry => entry.code).join(' '), subgrades: grade.subgrades.map(entry => `${entry.short} ${entry.text}`).join(' · '), formula: grade.formula, label: grade.labelKey } : null,
    steward: { signed: Boolean(view.steward?.signed), name: view.steward?.name ?? '', detail: view.steward?.detail ?? '' },
    ids: (view.ids ?? []).join(' · '),
    demo: Boolean(view.demo),
    demoLine: view.demo ? 'Demo · no model calls · illustrative' : '',
    coverage,
    pattern,
    art,
    variant: { altArt: art.source === 'alt', fullArt: view.copy?.fullArt === true, goldSignature: view.copy?.goldSignature === true },
    frame: frameFor(view),
    theme: view.theme ? { id: view.theme.id, name: view.theme.name, tokens: { ...view.theme.tokens }, setSymbol: view.theme.setSymbol ?? null, cardBack: view.theme.cardBack ?? null } : null,
    images: { symbol: null, back: null },
    seed: seedFor(view),
    edge: coverage.gilded ? 'gold' : coverage.level > 0 ? 'chrome' : 'steel',
    rarity: rarityLook(view),
  };
}

/** A string that changes whenever anything the forge paints changes, so a refresh with the same facts repaints nothing. */
export function factsSignature(facts) {
  const art = facts.art.key === 'custom' ? `custom:${facts.art.code}` : facts.art.key === 'media' ? `media:${facts.art.url}` : facts.art.key;
  return JSON.stringify([facts.title, facts.sub, facts.coin, facts.state, facts.condition, facts.finishLine, facts.rows, facts.set, facts.grade, facts.steward, facts.ids, facts.demoLine, facts.coverage.key, facts.pattern.key, art, facts.frame, facts.theme, Boolean(facts.images?.symbol), Boolean(facts.images?.back), facts.variant, facts.rarity ? `${facts.rarity.key}|${facts.rarity.state}` : '']);
}
