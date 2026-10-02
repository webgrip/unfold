import { money, count, compactCount, duration, dateTime, plural, score, decimal, percent } from '../core/format.js';
import { cardState, playState, ciState, humanReview, runOutcome, actorName } from '../core/states.js';
import { kpiView } from './card-kpis.js';

/** What a card shows for a value Ploeg does not collect at all yet. */
export const notCollected = 'Not collected yet';
/** What a card shows for a value Ploeg collects but did not report for this Work Item. */
export const notReported = 'Not reported';
/** The demo's cost line: a demo makes no model calls and spends nothing. */
export const demoCost = 'Demo · no model calls';
/** What the Life tab says when a release was counted from the merge because the project reports no deploys. */
export const mergeFallback = 'counted from merge · no deploy signal';

/** What the Life tab says for a merged card whose project reports deploys, before one carried the change to production. */
export const notLive = 'Not live in production yet';

/** The finish ladder: the whole days live at which a released card reaches each finish. */
export const finishLadder = Object.freeze([
  Object.freeze({ key: 'matte', label: 'Matte', days: 0, level: 0 }),
  Object.freeze({ key: 'foil', label: 'Foil', days: 7, level: 1 }),
  Object.freeze({ key: 'holo', label: 'Holo', days: 30, level: 2 }),
  Object.freeze({ key: 'prism', label: 'Prism', days: 90, level: 3 }),
  Object.freeze({ key: 'gilded', label: 'Gilded', days: 180, level: 4 }),
  Object.freeze({ key: 'infinity', label: 'Infinity', days: 365, level: 5 }),
]);

const dayMs = 86_400_000;

/**
 * Whole days since `at`, the release time; 0 on the release day and for a release time ahead of the clock, null when
 * `at` is missing or not a time.
 * @param {string | null | undefined} at
 * @param {number} [now] The clock in milliseconds since the epoch.
 */
export function daysLive(at, now = Date.now()) {
  const start = typeof at === 'string' ? Date.parse(at) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.floor((now - start) / dayMs));
}

/** The finish a card has after `days` whole days live; matte for an unknown or negative count. */
export function finishFor(days) {
  if (!known(days) || days < 0) return finishLadder[0];
  return finishLadder.findLast(step => days >= step.days);
}

/** The next finish after `days` whole days live and the days still to go, or null at the top of the ladder. */
export function nextFinish(days) {
  const current = finishFor(days);
  const next = finishLadder[current.level + 1];
  if (!next) return null;
  return { finish: next, daysToGo: next.days - (known(days) && days > 0 ? days : 0) };
}

/**
 * A stable unsigned 32-bit hash (FNV-1a over code points) of `value`. Skins pick a look from a card's identity with it,
 * so the same Work Item gets the same look on every page and every reload.
 * @param {unknown} value
 */
export function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value ?? '')) hash = Math.imul(hash ^ char.codePointAt(0), 0x01000193) >>> 0;
  return hash >>> 0;
}

/** The grade qualifiers Ploeg may send (card contract P2b), with what each one means. */
export const gradeQualifiers = Object.freeze({ RV: 'Reverted', HF: 'Hotfixed', OB: 'Over budget', RT: 'Retried Run', MN: 'Manual takeover' });
/** The four subgrades in the order the formula weighs them, with their labels and short codes. */
export const subgrades = Object.freeze([
  Object.freeze({ key: 'reliability', label: 'Reliability', short: 'REL' }),
  Object.freeze({ key: 'durability', label: 'Durability', short: 'DUR' }),
  Object.freeze({ key: 'delivery', label: 'Delivery', short: 'DEL' }),
  Object.freeze({ key: 'review', label: 'Review', short: 'REV' }),
]);

/**
 * The rarity tiers (Ploeg ADR-0056, proposed), lowest first: what each is called, the share of its cohort it stands
 * in (`top`, percent), the fixed score it starts at while the cohort is small, the metal its frame is drawn in and the
 * colour of its set symbol. Frames climb steel, bronze, silver, gold, prismatic; set symbols follow the trading-card
 * convention of black, silver, gold and mythic orange, one step ahead of the frame, and legendary turns both iridescent.
 */
export const rarityTiers = Object.freeze([
  Object.freeze({ key: 'common', label: 'Common', rank: 0, top: 100, from: 0, metal: 'steel', metalLabel: 'Steel', symbol: 'black', symbolLabel: 'Black' }),
  Object.freeze({ key: 'uncommon', label: 'Uncommon', rank: 1, top: 40, from: 35, metal: 'bronze', metalLabel: 'Bronze', symbol: 'silver', symbolLabel: 'Silver' }),
  Object.freeze({ key: 'rare', label: 'Rare', rank: 2, top: 15, from: 55, metal: 'silver', metalLabel: 'Silver', symbol: 'gold', symbolLabel: 'Gold' }),
  Object.freeze({ key: 'epic', label: 'Epic', rank: 3, top: 5, from: 70, metal: 'gold', metalLabel: 'Gold', symbol: 'mythic', symbolLabel: 'Mythic orange' }),
  Object.freeze({ key: 'legendary', label: 'Legendary', rank: 4, top: 1, from: 85, metal: 'prismatic', metalLabel: 'Prismatic', symbol: 'iridescent', symbolLabel: 'Iridescent' }),
]);

/** The four components of a challenge score under formula 2026.1, in the order Ploeg weighs them. */
export const rarityParts = Object.freeze([
  Object.freeze({ key: 'reach', label: 'Reach', weight: 0.3 }),
  Object.freeze({ key: 'sensitive', label: 'Sensitive paths', weight: 0.25 }),
  Object.freeze({ key: 'novelty', label: 'Novelty', weight: 0.2 }),
  Object.freeze({ key: 'size', label: 'Size, damped', weight: 0.25 }),
]);

/** The back's tabs in order. */
export const cardTabs = Object.freeze([
  { id: 'economics', label: 'Economics' },
  { id: 'agent', label: 'Agent' },
  { id: 'change', label: 'Change' },
  { id: 'review', label: 'Review & CI' },
  { id: 'flow', label: 'Flow' },
  { id: 'gates', label: 'Gates' },
  { id: 'grade', label: 'Grade' },
  { id: 'rarity', label: 'Rarity' },
  { id: 'condition', label: 'Condition' },
  { id: 'life', label: 'Life' },
  { id: 'set', label: 'Set' },
  { id: 'context', label: 'Context' },
]);

/** The delivery gates on a board, in order (Ploeg ADR-0051), with the short names the gates strip prints. */
export const gateSteps = Object.freeze([
  Object.freeze({ key: 'development', label: 'Development', short: 'Dev' }),
  Object.freeze({ key: 'test', label: 'Test', short: 'Test' }),
  Object.freeze({ key: 'acceptance', label: 'Acceptance', short: 'Accept' }),
  Object.freeze({ key: 'done', label: 'Done', short: 'Done' }),
]);

/** Why a Work Item moved back to an earlier gate, and whether that bounce counts against right first time. */
export const bounceReasons = Object.freeze({
  defect: Object.freeze({ label: 'Defect', counts: true }),
  requirement: Object.freeze({ label: 'Requirement changed', counts: false }),
  misunderstood: Object.freeze({ label: 'Misunderstood', counts: false }),
  environment: Object.freeze({ label: 'Environment', counts: false }),
  unknown: Object.freeze({ label: 'No reason given', counts: true }),
});

/** What each crack severity means, as triage sets it. */
export const crackSeverities = Object.freeze({ S1: 'S1 · critical', S2: 'S2 · major', S3: 'S3 · minor', S4: 'S4 · cosmetic' });
/** How a crack was found: self-reported weighs half, discovered counts once, concealed one and a half times. */
export const crackDiscoveries = Object.freeze({ self: 'Self-reported by the steward', discovered: 'Found by someone else', concealed: 'Fixed by the steward without linking it' });
/** How much of a crack's weight still counts by the card's age when the bug was raised. */
export const crackWarranties = Object.freeze({ full: 'Full: raised within 180 days of release', half: 'Half: raised within a year of release', history: 'History: raised after a year, weighs nothing' });

const known = value => typeof value === 'number' && Number.isFinite(value);
const notReportedYet = 'Not reported yet';
const liveUsage = card => !card.demo && card.live && typeof card.live === 'object' && known(card.live.runSeconds) ? card.live : null;
const text = value => typeof value === 'string' ? value.trim() : '';
const list = value => Array.isArray(value) ? value : [];
const sum = (entries, key) => entries.reduce((total, entry) => total + entry[key], 0);
const row = (label, value, status = 'ok') => ({ label, value, status });
const reported = (label, value, format) => known(value) ? row(label, format(value)) : row(label, notReported, 'unreported');
const uncollected = label => row(label, notCollected, 'uncollected');
const byTime = (a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0);
const repository = target => target && text(target.owner) && text(target.repo) ? `${text(target.owner)}/${text(target.repo)}` : '';
const stewardSources = { merged_by: 'Merged the pull request', approver: 'Approved the pull request' };
const rosterRoles = { merger: 'merger', reviewer: 'reviewer', qa: 'QA (moved it out of test)', acceptor: 'acceptor (moved it out of acceptance)', cosigner: 'cosigner (mended a crack)' };
const inReview = Object.freeze({ key: 'in_review', label: 'In review', tone: 'review', glyph: 'pull-request' });
const playMeta = state => state ? playState(state) : inReview;
const costStatuses = { observed: 'Observed', reserved: 'Reserved, not settled', not_reported: notReported };
const environmentOrder = ['development', 'test', 'acceptance', 'staging', 'production'];
const environmentRank = name => { const index = environmentOrder.indexOf(name); return index === -1 ? environmentOrder.length : index; };
const shortSha = sha => text(sha).slice(0, 7);

const halfStep = value => known(value) && value >= 1 && value <= 10 && Number.isInteger(value * 2);

function gradeView(card) {
  const grade = card.grade;
  if (!grade || typeof grade !== 'object' || !halfStep(grade.overall)) return null;
  const parts = subgrades.filter(entry => halfStep(grade.subgrades?.[entry.key])).map(entry => ({ ...entry, value: grade.subgrades[entry.key], text: score(grade.subgrades[entry.key]) }));
  const label = grade.label === 'black' ? 'Black label' : grade.label === 'gold' ? 'Gold label' : '';
  const qualifiers = list(grade.qualifiers).filter(code => Object.hasOwn(gradeQualifiers, code)).map(code => ({ code, text: gradeQualifiers[code] }));
  const provisional = grade.provisional === true;
  const formula = text(grade.formula);
  const overall = score(grade.overall);
  return {
    overall: grade.overall, text: overall, provisional, label, labelKey: label ? grade.label : '', qualifiers, subgrades: parts, formula,
    summary: [overall, provisional ? 'provisional' : '', label, ...qualifiers.map(entry => entry.code)].filter(Boolean).join(' · '),
    description: `Grade ${overall} of 10${provisional ? ', provisional until 180 days live' : ''}${label ? `, ${label.toLowerCase()}` : ''}${qualifiers.length ? `, ${qualifiers.map(entry => entry.text.toLowerCase()).join(', ')}` : ''}${formula ? `, formula ${formula}` : ''}`,
  };
}

function conditionView(card) {
  const condition = card.condition;
  if (!condition || typeof condition !== 'object' || !['cracked', 'mended'].includes(condition.state)) return null;
  const cracks = list(condition.cracks).filter(crack => crack && typeof crack === 'object').map(crack => {
    const mended = crack.mended && typeof crack.mended === 'object' ? { at: text(crack.mended.at), by: text(crack.mended.by), pr: known(crack.mended.pr) ? crack.mended.pr : null, bySteward: crack.mended.bySteward === true, confirmedAt: text(crack.mended.confirmedAt) } : null;
    return {
      id: text(crack.id), ref: text(crack.bug?.ref), title: text(crack.bug?.title), workItemId: text(String(crack.bug?.workItemId ?? '')), severity: /^S[1-4]$/.test(crack.severity) ? crack.severity : '', share: text(crack.share), discovery: text(crack.discovery),
      proposedAt: text(crack.proposedAt), confirmedAt: text(crack.confirmedAt), confirmedBy: list(crack.confirmedBy).map(text).filter(Boolean), disputed: crack.disputed === true,
      weight: known(crack.weight) ? crack.weight : null, warranty: Object.hasOwn(crackWarranties, crack.warranty) ? crack.warranty : '', mended,
    };
  });
  const state = condition.state;
  const first = cracks[0];
  const what = first ? [first.ref, first.severity].filter(Boolean).join(', ') : '';
  const fixed = state === 'mended' && first?.mended ? ` · ${first.mended.bySteward ? 'mended by its steward' : 'mended'}${first.mended.pr !== null ? ` in #${first.mended.pr}` : ''}` : '';
  const open = cracks.filter(crack => !crack.mended?.confirmedAt).length;
  const chip = state === 'mended' ? `Mended${cracks.length > 1 ? ` ×${cracks.length}` : ''}` : `Cracked${first?.severity ? ` · ${first.severity}` : ''}${open > 1 ? ` ×${open}` : ''}`;
  const weights = cracks.filter(crack => crack.weight !== null);
  return { state, label: state === 'mended' ? 'Mended' : 'Cracked', chip, cracks, weight: weights.length ? weights.reduce((total, crack) => total + crack.weight, 0) : null, disputed: cracks.some(crack => crack.disputed), text: `${state === 'mended' ? 'Mended' : 'Cracked'}${what ? ` · ${what}` : ''}${fixed}`, seed: stableHash(cracks.map(crack => crack.id).join('|') || String(card.workItemId ?? '')) };
}

const gateKeys = gateSteps.map(step => step.key);

function gatesView(card) {
  const gates = card.gates;
  if (!gates || typeof gates !== 'object' || !gateKeys.includes(gates.current)) return null;
  const current = gateKeys.indexOf(gates.current);
  const bounces = list(gates.bounces).filter(entry => gateKeys.includes(entry?.from) && gateKeys.includes(entry?.to)).map(entry => {
    const reason = Object.hasOwn(bounceReasons, entry.reason) ? entry.reason : 'unknown';
    return { from: entry.from, to: entry.to, at: text(entry.at), reason, reasonText: bounceReasons[reason].label, counts: bounceReasons[reason].counts, actor: text(entry.actor) };
  });
  const history = list(gates.history).filter(entry => gateKeys.includes(entry?.gate)).map(entry => ({ gate: entry.gate, enteredAt: text(entry.enteredAt), leftAt: text(entry.leftAt) }));
  const rft = gates.rightFirstTime && typeof gates.rightFirstTime === 'object' ? gates.rightFirstTime : {};
  const measured = ['test', 'acceptance', 'done'].filter(key => known(rft[key]));
  const defects = measured.reduce((total, key) => total + rft[key], 0);
  const steps = gateSteps.map((step, index) => ({ ...step, state: index < current ? 'passed' : index === current ? 'current' : 'ahead', bounces: bounces.filter(entry => entry.from === step.key), rightFirstTime: known(rft[step.key]) ? rft[step.key] === 0 : null }));
  const rightFirstTime = measured.length ? (defects === 0 ? { state: 'yes', text: 'Right first time', detail: `No defect bounce from ${measured.map(key => gateSteps.find(step => step.key === key).label.toLowerCase()).join(', ')}` } : { state: 'no', text: `${plural(defects, 'bounce')} back`, detail: measured.filter(key => rft[key] > 0).map(key => `${plural(rft[key], 'defect bounce')} from ${gateSteps.find(step => step.key === key).label.toLowerCase()}`).join(', ') }) : null;
  const label = `Gates: now in ${gateSteps[current].label.toLowerCase()}${bounces.length ? `, ${plural(bounces.length, 'bounce')} back` : ''}${rightFirstTime?.state === 'yes' ? ', right first time' : ''}`;
  return { current: gateSteps[current], steps, bounces, history, rightFirstTime, label };
}

function setView(card) {
  const set = card.set;
  if (!set || typeof set !== 'object' || !['epic', 'child'].includes(set.role) || !known(set.size) || set.size < 1) return null;
  const epic = { workItemId: text(String(set.epic?.workItemId ?? '')), ref: text(set.epic?.ref), title: text(set.epic?.title) || 'Untitled epic' };
  const children = list(set.children).filter(child => child && text(child.title)).map(child => ({ workItemId: text(String(child.workItemId ?? '')), title: text(child.title), state: cardState(text(child.state) || 'drafting'), settled: child.settled === true, cracked: child.cracked === true }));
  const position = set.role === 'child' && known(set.position) ? set.position : null;
  const settled = children.filter(child => child.settled).length;
  const chip = set.role === 'epic' ? `Epic · ${plural(set.size, 'card')}` : position !== null ? `${position}/${set.size} · ${epic.title}` : `Set of ${set.size} · ${epic.title}`;
  const summary = set.role === 'epic' ? `Epic of ${plural(set.size, 'Work Item')}${children.length ? `, ${settled} settled` : ''}` : position !== null ? `${position}/${set.size} of ${epic.title}` : `One of ${set.size} in ${epic.title}`;
  return { role: set.role, epic, position, size: set.size, children, settled, complete: set.complete === true, chip, text: summary, symbol: set.role === 'epic' ? `EPIC ${settled}/${set.size}` : position !== null ? `${position}/${set.size}` : `SET ${set.size}` };
}

function plays(card) {
  return list(card.plays).filter(play => play && known(play.number)).slice().sort((a, b) => a.number - b.number);
}

function costView(card) {
  const totals = card.totals || {};
  const authorized = known(totals.authorizedUsd) && totals.authorizedUsd > 0 ? totals.authorizedUsd : null;
  const of = authorized === null ? '' : `of ${money(authorized)}`;
  if (card.demo) return { value: 'Demo', caption: 'no model calls', text: demoCost, share: null, over: false, status: 'demo', label: `Cost: ${demoCost}${authorized === null ? '' : `, ${money(authorized)} authorized`}` };
  const live = liveUsage(card);
  if (live && !known(live.costUsd)) return { value: notReportedYet, caption: of, text: notReportedYet, share: null, over: false, status: 'not_reported', label: `Cost: not reported yet${authorized === null ? '' : `, ${money(authorized)} authorized`}` };
  if (live) {
    const share = authorized === null ? null : Math.min(1, live.costUsd / authorized);
    const percent = authorized === null ? '' : `, ${Math.round(live.costUsd / authorized * 100)}% of ${money(authorized)} authorized`;
    return { value: money(live.costUsd), caption: ['so far', of].filter(Boolean).join(' · '), text: `${money(live.costUsd)} so far`, share, over: authorized !== null && live.costUsd > authorized, status: 'live', label: `Cost so far: ${money(live.costUsd)}${percent}` };
  }
  if (!known(totals.costUsd) || totals.costStatus === 'not_reported') return { value: notReported, caption: of, text: notReported, share: null, over: false, status: 'not_reported', label: `Cost: not reported${authorized === null ? '' : `, ${money(authorized)} authorized`}` };
  const reserved = totals.costStatus === 'reserved';
  const share = authorized === null ? null : Math.min(1, totals.costUsd / authorized);
  const caption = [reserved ? 'reserved' : '', of].filter(Boolean).join(' · ');
  const percent = authorized === null ? '' : `, ${Math.round(totals.costUsd / authorized * 100)}% of ${money(authorized)} authorized`;
  return { value: money(totals.costUsd), caption, text: money(totals.costUsd), share, over: authorized !== null && totals.costUsd > authorized, status: reserved ? 'reserved' : 'observed', label: `Cost: ${money(totals.costUsd)}${reserved ? ' reserved' : ''}${percent}` };
}

function tokensView(card) {
  const totals = card.totals || {};
  if (card.demo) return { value: 'None', detail: 'Demo · no model calls', known: false, partial: false };
  const live = liveUsage(card);
  const source = live || totals;
  const parts = [known(source.inputTokens) ? `${compactCount(source.inputTokens)} in` : '', known(source.outputTokens) ? `${compactCount(source.outputTokens)} out` : ''].filter(Boolean);
  if (!parts.length) return { value: live ? notReportedYet : notReported, detail: '', known: false, partial: false, live: Boolean(live) };
  const partial = source.usageComplete === false;
  return { value: parts.join(' · '), detail: [live ? 'So far, while a Run is running' : '', partial ? 'Some Runs did not report usage' : ''].filter(Boolean).join(' · '), known: true, partial, live: Boolean(live) };
}

function runTimeView(card) {
  const totals = card.totals || {};
  const live = liveUsage(card);
  if (live) return { value: duration(live.runSeconds), known: true, live: true };
  if (known(totals.runSeconds)) return { value: duration(totals.runSeconds), known: true };
  if (totals.runs === 0) return { value: 'No Runs yet', known: false };
  return { value: notReported, known: false };
}

function diffView(all) {
  if (!all.length) return { known: false, value: 'No pull request yet', partial: false };
  const measured = all.filter(play => known(play.additions) && known(play.deletions));
  if (!measured.length) return { known: false, value: notReported, partial: false };
  const files = measured.filter(play => known(play.changedFiles));
  return {
    known: true,
    additions: sum(measured, 'additions'),
    deletions: sum(measured, 'deletions'),
    files: files.length ? sum(files, 'changedFiles') : null,
    addText: `+${count(sum(measured, 'additions'))}`,
    delText: `−${count(sum(measured, 'deletions'))}`,
    filesText: files.length ? plural(sum(files, 'changedFiles'), 'file') : '',
    partial: measured.length < all.length,
    value: `+${count(sum(measured, 'additions'))} −${count(sum(measured, 'deletions'))}${files.length ? ` · ${plural(sum(files, 'changedFiles'), 'file')}` : ''}`,
  };
}

function prView(all) {
  const latest = all.at(-1);
  if (!latest) return null;
  const ci = ciState(latest.ci?.state && latest.ci.state !== 'unknown' ? latest.ci.state : '');
  return { number: latest.number, url: text(latest.url), text: `#${latest.number}`, state: playMeta(latest.state), ci, ciText: ci ? ci.label : 'CI not reported' };
}

function crewLine(card) {
  const crew = list(card.crew).filter(member => text(member?.role));
  if (!crew.length) return 'No agent Runs yet';
  return crew.map(member => known(member.runs) ? `${member.role} ×${member.runs}` : member.role).join(' · ');
}

function stewardView(card) {
  const name = text(card.steward?.name);
  if (!name) return { signed: false, name: '', text: 'Unsigned', detail: 'no merge or approval yet' };
  return { signed: true, name, text: `Signed by ${name}`, detail: stewardSources[card.steward.source] || '' };
}

function eventLine(entry) {
  const detail = entry.detail || {};
  const who = text(entry.actor) ? actorName(entry.actor) : '';
  const number = known(detail.number) ? `#${detail.number}` : 'the pull request';
  const role = text(detail.role) ? text(detail.role)[0].toUpperCase() + text(detail.role).slice(1) : 'An agent';
  const round = known(detail.round) && detail.round > 0 ? `, Round ${detail.round}` : '';
  switch (entry.kind) {
    case 'minted': return { title: 'Card minted: the first Run started', tone: 'neutral', glyph: 'spark' };
    case 'run_started': return { title: `${role} started${round}`, tone: 'live', glyph: 'play' };
    case 'run_finished': { const outcome = runOutcome(text(detail.outcome)); return { title: `${role} finished${round}${outcome ? `: ${outcome.label.toLowerCase()}` : ''}`, tone: outcome?.tone || 'neutral', glyph: outcome?.glyph || 'check' }; }
    case 'pr_opened': return { title: `Opened pull request ${number}`, tone: 'review', glyph: 'pull-request' };
    case 'review': { const review = humanReview(text(detail.state) || 'commented'); return { title: `${who || 'A person'}: ${review.label.toLowerCase()} on ${number}`, tone: review.tone, glyph: review.glyph }; }
    case 'merged': return { title: `${who || 'A person'} merged ${number}`, tone: 'success', glyph: 'check-circle' };
    case 'closed': return { title: `${number} closed without a merge`, tone: 'neutral', glyph: 'x-circle' };
    case 'withdrawn': return { title: 'Withdrawn', tone: 'neutral', glyph: 'circle-slash' };
    default: { const words = String(entry.kind || 'event').replaceAll('_', ' '); return { title: words[0].toUpperCase() + words.slice(1), tone: 'neutral', glyph: 'circle' }; }
  }
}

function firstReviewAfterOpen(card, all) {
  const opened = list(card.events).filter(entry => entry.kind === 'pr_opened').map(entry => Date.parse(entry.at)).filter(Number.isFinite);
  const reviewed = all.flatMap(play => list(play.reviews)).map(review => Date.parse(review.receivedAt)).filter(Number.isFinite);
  if (!opened.length || !reviewed.length) return null;
  const start = Math.min(...opened);
  const later = reviewed.filter(at => at >= start);
  return later.length ? (Math.min(...later) - start) / 1000 : null;
}

function usageRow(card, label, value) {
  if (card.demo) return row(label, 'None · demo', 'demo');
  return reported(label, value, count);
}

function liveRow(card, label, value) {
  if (liveUsage(card) && !known(value)) return row(label, notReportedYet, 'unreported');
  return usageRow(card, label, value);
}

function economics(card, cost) {
  const totals = card.totals || {};
  const live = liveUsage(card);
  const crew = list(card.crew).filter(member => text(member?.role));
  return {
    rows: [
      row(live ? 'Cost so far' : 'Cost', card.demo ? demoCost : cost.text, cost.status === 'not_reported' ? 'unreported' : 'ok'),
      card.demo ? row('Authorized', 'None · demo', 'demo') : reported('Authorized', totals.authorizedUsd, money),
      live ? row('Cost status', 'Running, read from the gateway') : row('Cost status', card.demo ? 'Demo' : costStatuses[totals.costStatus] || notReported, card.demo || totals.costStatus === 'not_reported' || !totals.costStatus ? 'unreported' : 'ok'),
      liveRow(card, 'Input tokens', live ? live.inputTokens : totals.inputTokens),
      liveRow(card, 'Output tokens', live ? live.outputTokens : totals.outputTokens),
      usageRow(card, 'Cache read tokens', totals.cacheReadInputTokens),
      usageRow(card, 'Cache write tokens', totals.cacheCreationInputTokens),
      card.demo ? row('Every Run reported usage', 'None · demo', 'demo') : live ? row('Every Run reported usage', live.usageComplete ? 'Yes, so far' : 'No, figures so far are partial', live.usageComplete ? 'ok' : 'unreported') : totals.usageComplete === true ? row('Every Run reported usage', 'Yes') : totals.usageComplete === false ? row('Every Run reported usage', 'No, totals are partial', 'unreported') : row('Every Run reported usage', notReported, 'unreported'),
      uncollected('Model mix'),
    ],
    lists: crew.length ? [{ title: 'Cost by Role', items: crew.map(member => ({ title: member.role, meta: card.demo ? 'Demo · no spend' : [known(member.costUsd) ? money(member.costUsd) : notReported, known(member.inputTokens) ? `${compactCount(member.inputTokens)} tokens in` : ''].filter(Boolean).join(' · '), tone: 'neutral', glyph: member.writes ? 'code' : 'eye' })) }] : [],
  };
}

function agent(card) {
  const totals = card.totals || {};
  const live = liveUsage(card);
  const crew = list(card.crew).filter(member => text(member?.role));
  return {
    rows: [
      reported('Runs', totals.runs, count),
      reported('Failed Runs', totals.failedRuns, count),
      reported('Rounds', totals.rounds, count),
      reported('Shifts', totals.shifts, count),
      usageRow(card, 'Turns', totals.turns),
      usageRow(card, 'Tool calls', totals.toolCalls),
      live ? row('Run time so far', duration(live.runSeconds)) : reported('Run time', totals.runSeconds, duration),
      row('First Run', dateTime(totals.firstRunAt) || notReported, totals.firstRunAt ? 'ok' : 'unreported'),
      row('Last Run', dateTime(totals.lastRunAt) || notReported, totals.lastRunAt ? 'ok' : 'unreported'),
      uncollected('Peak context'),
      uncollected('Active time'),
    ],
    lists: crew.length ? [{ title: 'Crew', items: crew.map(member => ({ title: `${member.role}${member.writes === true ? ' · writer' : member.writes === false ? ' · reader' : ''}`, meta: known(member.runs) ? plural(member.runs, 'Run') : notReported, tone: 'neutral', glyph: member.writes ? 'code' : 'eye' })) }] : [],
  };
}

function change(card, all, diff, kpis) {
  const measured = all.length && diff.known;
  return {
    blocks: kpis?.blocks ?? [],
    rows: [
      measured ? row('Lines added', diff.addText) : row('Lines added', all.length ? notReported : 'No pull request yet', 'unreported'),
      measured ? row('Lines removed', diff.delText) : row('Lines removed', all.length ? notReported : 'No pull request yet', 'unreported'),
      measured && diff.files !== null ? row('Files changed', count(diff.files)) : row('Files changed', all.length ? notReported : 'No pull request yet', 'unreported'),
      ...(kpis ? kpis.rows : [uncollected('Languages'), uncollected('Test and code lines')]),
    ],
    ...(kpis?.note ? { note: kpis.note } : {}),
    lists: all.length ? [{ title: plural(all.length, 'play'), items: all.slice().reverse().map(play => {
      const meta = playMeta(play.state);
      const lines = known(play.additions) && known(play.deletions) ? `+${count(play.additions)} −${count(play.deletions)}${known(play.changedFiles) ? ` · ${plural(play.changedFiles, 'file')}` : ''}` : 'Diff not reported';
      const merged = play.mergedAt ? `merged ${dateTime(play.mergedAt)}${text(play.mergedBy) ? ` by ${text(play.mergedBy)}` : ''}` : play.closedAt ? `closed ${dateTime(play.closedAt)}` : '';
      return { title: `#${play.number} · ${meta.label}`, meta: [text(play.branch), lines, merged].filter(Boolean).join(' · '), tone: meta.tone, glyph: meta.glyph, url: text(play.url) };
    }) }, ...(kpis?.lists ?? [])] : kpis?.lists ?? [],
  };
}

function review(card, all, grade, kpis) {
  const reviews = all.flatMap(play => list(play.reviews).map(entry => ({ ...entry, number: play.number })));
  const latest = all.at(-1);
  const ci = latest ? ciState(latest.ci?.state && latest.ci.state !== 'unknown' ? latest.ci.state : '') : null;
  const wait = firstReviewAfterOpen(card, all);
  const roster = list(card.roster).filter(person => text(person?.name));
  const lists = [];
  if (reviews.length) lists.push({ title: 'Reviews by people', items: reviews.map(entry => { const meta = humanReview(entry.state); return { title: `${text(entry.reviewer) || 'Someone'} · ${meta.label}`, meta: [`#${entry.number}`, dateTime(entry.receivedAt)].filter(Boolean).join(' · '), tone: meta.tone, glyph: meta.glyph }; }) });
  const checks = list(latest?.ci?.checks);
  if (checks.length) lists.push({ title: `Checks on #${latest.number}`, items: checks.map(check => { const meta = ciState(check.state) || { label: notReported, tone: 'neutral', glyph: 'circle' }; return { title: text(check.context) || 'Check', meta: meta.short || meta.label, tone: meta.tone, glyph: meta.glyph }; }) });
  if (roster.length) lists.push({ title: 'Roster', items: roster.map(person => ({ title: person.name, meta: list(person.roles).map(role => rosterRoles[role] || role).join(', '), tone: list(person.roles).includes('cosigner') ? 'success' : 'neutral', glyph: 'user' })) });
  if (kpis) lists.unshift(...kpis.lists);
  return {
    blocks: kpis?.blocks ?? [],
    rows: [
      all.length ? row('Reviews by people', count(reviews.length)) : row('Reviews by people', 'No pull request yet', 'unreported'),
      ...(kpis ? [] : [wait === null ? row('Time to first review', reviews.length ? notReported : 'No review yet', 'unreported') : row('Time to first review', duration(wait))]),
      latest ? row(`CI on #${latest.number}`, ci ? ci.label : notReported, ci ? 'ok' : 'unreported') : row('CI', 'No pull request yet', 'unreported'),
      ...(latest?.ci?.capturedAt ? [row('CI read', dateTime(latest.ci.capturedAt))] : []),
      ...(kpis ? [] : [uncollected('CI duration'), uncollected('Review rounds by people')]),
      ...(grade ? [row('Grade', grade.summary)] : []),
    ],
    groups: kpis?.groups ?? [],
    lists,
  };
}

function deployments(card) {
  return list(card.deployments)
    .filter(entry => entry && text(entry.environment))
    .map(entry => ({ environment: text(entry.environment).toLowerCase(), firstDeployedAt: text(entry.firstDeployedAt), sha: text(entry.sha), url: text(entry.url) }))
    .sort((a, b) => environmentRank(a.environment) - environmentRank(b.environment) || (Date.parse(a.firstDeployedAt) || 0) - (Date.parse(b.firstDeployedAt) || 0) || a.environment.localeCompare(b.environment));
}

function releaseView(card, now) {
  const reported = Object.hasOwn(card, 'release');
  const release = card.release && typeof card.release === 'object' ? card.release : null;
  const days = release ? daysLive(release.at, now) : null;
  if (days === null) {
    const finish = finishLadder[0];
    return { released: false, reported, days: null, dayText: '', finish, next: null, source: '', environment: '', at: '', note: '' };
  }
  const source = text(release.source) === 'merge' ? 'merge' : 'deploy';
  const environment = text(release.environment).toLowerCase() || 'production';
  const finish = finishFor(days);
  const next = nextFinish(days);
  return {
    released: true, reported, days, dayText: `Day ${count(days)}`, finish, source, environment, at: text(release.at),
    next: next ? { ...next, text: `${next.finish.label} in ${plural(next.daysToGo, 'day')}` } : null,
    note: source === 'merge' ? mergeFallback : '',
    label: `${plural(days, 'day')} live, ${finish.label.toLowerCase()} finish${source === 'merge' ? `, ${mergeFallback}` : ''}`,
  };
}

function life(card, all, release, condition, kpis) {
  const merged = all.filter(play => play.mergedAt).at(-1);
  const deployed = deployments(card);
  const live = release.environment || 'production';
  const rows = [merged ? row('Merged', dateTime(merged.mergedAt)) : row('Merged', 'Not merged', 'unreported')];
  let note = '';
  if (release.released) {
    rows.push(
      row('Days live', plural(release.days, 'day')),
      ...(release.source === 'merge' ? [] : [row('Released', `${dateTime(release.at)} · ${release.environment}`)]),
      row('Release source', release.source === 'merge' ? 'Merge · no deploy signal' : `First deploy to ${release.environment}`),
      row('Finish', release.finish.label),
      release.next ? row('Next finish', release.next.text) : row('Next finish', 'Top of the ladder'),
    );
    if (release.source === 'merge') note = `Days live are ${mergeFallback}. Once a pipeline reports deploys to Ploeg, they count from the first deploy to ${release.environment}.`;
  } else if (release.reported) {
    rows.push(row('Days live', merged ? notLive : 'Not released', 'unreported'), row('Finish', `${finishLadder[0].label} until released`, 'unreported'));
    note = merged
      ? 'This project reports deploys to production, and none has carried this change yet. Days live start at its first deploy there.'
      : 'Days live start at the first deploy to production, or at the merge when the project has never reported a deploy there.';
  } else {
    rows.push(row('Days live', notReported, 'unreported'), row('Finish', `${finishLadder[0].label} · this Ploeg reports no releases`, 'unreported'));
    note = 'This Ploeg does not report deploys or releases yet, so the card stays matte.';
  }
  if (kpis && merged) rows.push(...kpis.rows);
  rows.push(uncollected('Lines still alive'), condition ? row('Condition', condition.text) : card.grade?.formula === '2026.2' ? row('Condition', 'No confirmed crack') : uncollected('Reverts and linked bugs'));
  const lists = deployed.length ? [{ title: `Deployments · ${plural(deployed.length, 'environment')}`, items: deployed.map(entry => ({
    title: entry.environment,
    meta: [entry.firstDeployedAt ? `first deployed ${dateTime(entry.firstDeployedAt)}` : 'first deploy time not reported', shortSha(entry.sha)].filter(Boolean).join(' · '),
    tone: entry.environment === live ? 'success' : 'neutral',
    glyph: entry.environment === live ? 'check-circle' : 'circle',
    url: entry.url,
  })) }] : [];
  if (kpis) lists.push(...kpis.lists);
  return { rows, lists, note };
}

function context(card, set) {
  const events = list(card.events).filter(entry => entry && entry.at).slice().sort(byTime);
  const shown = events.slice(-40);
  return {
    rows: [
      row('Work Item', `#${card.workItemId}`),
      text(card.externalRef) ? row('Tracker', text(card.externalRef)) : row('Tracker', notReported, 'unreported'),
      text(card.team) ? row('Team', text(card.team)) : row('Team', notReported, 'unreported'),
      repository(card.target) ? row('Repository', repository(card.target)) : row('Repository', notReported, 'unreported'),
      set ? row('Epic', [set.epic.ref, set.epic.title].filter(Boolean).join(' · ')) : Object.hasOwn(card, 'set') ? row('Epic', 'None', 'unreported') : uncollected('Epic'),
    ],
    lists: [{ title: events.length ? `Timeline · ${plural(events.length, 'event')}` : 'Timeline', empty: 'Nothing happened yet.', more: events.length - shown.length, items: shown.map(entry => ({ ...eventLine(entry), meta: [dateTime(entry.at), text(entry.actor) ? actorName(entry.actor) : ''].filter(Boolean).join(' · ') })) }],
  };
}

const formulas = Object.freeze({
  '2026.1': 'Overall = 0.40 × reliability + 0.25 × durability + 0.20 × delivery + 0.15 × review, each subgrade rounded to the nearest half. Provisional (at most 9) until 180 days live.',
  '2026.2': 'Overall = 0.40 × reliability + 0.25 × durability + 0.20 × delivery + 0.15 × review, each subgrade rounded to the nearest half. Reliability is 10 minus the crack weight, at most 9.5 with a crack in warranty or a revert. Durability loses 2 per revert and 1 per hotfix. Provisional (at most 9) until 180 days live.',
});
const yesNo = value => value ? 'Yes' : 'No';
const gradeInputRows = Object.freeze({
  reliability: [['crackWeight', 'Crack weight', value => decimal(value)], ['reverted', 'Reverted', yesNo]],
  durability: [['daysLive', 'Days live', value => plural(value, 'day')], ['liveSince', 'Live since', value => dateTime(value) || notReported], ['reverts', 'Reverts', count], ['hotfixes', 'Hotfixes', count], ['survival', 'Lines still alive', percent]],
  delivery: [['budgetShare', 'Budget used', percent], ['defectBounces', 'Defect bounces', count], ['extraPlays', 'Extra plays', count], ['failedRuns', 'Failed Runs', count]],
  review: [['ciFirstGreen', 'CI green first time', yesNo], ['findings', 'Review findings', count], ['changeRequests', 'Change requests', count], ['reviewRounds', 'Review rounds', count]],
});

function gradeTab(card, grade) {
  if (!grade) return { rows: [row('Grade', 'Not graded yet', 'unreported')], lists: [], groups: [], note: 'Ploeg grades a card once a person approved or requested changes on a play, or a play merged.' };
  const raw = card.grade || {};
  const inputs = raw.inputs && typeof raw.inputs === 'object' ? raw.inputs : null;
  const missing = new Set(list(inputs?.notCollected).filter(entry => typeof entry === 'string'));
  const groups = subgrades.map(part => ({
    title: `${part.label} inputs`,
    rows: !inputs ? [row('Inputs', 'This Ploeg did not send them', 'unreported')] : gradeInputRows[part.key].map(([key, label, format]) => {
      const value = inputs[part.key]?.[key];
      if (missing.has(`${part.key}.${key}`)) return uncollected(label);
      if (value === null || value === undefined) return row(label, notReported, 'unreported');
      return row(label, format(value));
    }),
  }));
  return {
    rows: [
      row('Grade', grade.summary),
      row('Formula', grade.formula || notReported, grade.formula ? 'ok' : 'unreported'),
      row('Provisional', grade.provisional ? 'Yes, until 180 days live' : 'No'),
      row('Label', grade.label || 'None'),
      ...subgrades.map(part => { const found = grade.subgrades.find(entry => entry.key === part.key); return found ? row(part.label, found.text) : row(part.label, notReported, 'unreported'); }),
      row('Qualifiers', grade.qualifiers.length ? grade.qualifiers.map(entry => `${entry.code} · ${entry.text}`).join(', ') : 'None'),
    ],
    lists: [],
    groups,
    note: formulas[grade.formula] ?? `Ploeg computed this grade with formula ${grade.formula || 'unknown'}, which this Vloer cannot describe.`,
  };
}

function gatesTab(card, gates) {
  const evolved = card.evolved === true;
  if (!gates) return { rows: [row('Gate now', 'No gate move recorded', 'unreported'), ...(evolved ? [row('Requirement changed', 'Yes, the card evolved')] : [])], lists: [], groups: [], note: 'Ploeg records gates once the board maps its columns to development, test, acceptance and done.' };
  const rows = [
    row('Gate now', gates.current.label),
    gates.rightFirstTime ? row('Right first time', gates.rightFirstTime.state === 'yes' ? 'Yes' : `No · ${gates.rightFirstTime.detail}`) : row('Right first time', notReported, 'unreported'),
    ...gates.steps.filter(step => step.rightFirstTime !== null).map(step => row(step.label, step.rightFirstTime ? 'Right first time' : plural(step.bounces.filter(entry => entry.counts).length, 'defect bounce'))),
    row('Bounces back', gates.bounces.length ? count(gates.bounces.length) : 'None'),
    row('Requirement changed', evolved ? 'Yes, the card evolved' : 'No'),
  ];
  const byName = key => gateSteps.find(step => step.key === key)?.label ?? key;
  const lists = [];
  if (gates.bounces.length) lists.push({ title: plural(gates.bounces.length, 'bounce'), items: gates.bounces.slice().sort(byTime).map(entry => ({ title: `${byName(entry.from)} → ${byName(entry.to)} · ${entry.reasonText}`, meta: [dateTime(entry.at), entry.actor ? `moved by ${entry.actor}` : '', entry.counts ? 'counts against right first time' : 'does not count against right first time'].filter(Boolean).join(' · '), tone: entry.counts ? 'danger' : 'attention', glyph: 'back' })) });
  if (gates.history.length) lists.push({ title: 'Path through the gates', items: gates.history.map(entry => { const stay = entry.leftAt ? (Date.parse(entry.leftAt) - Date.parse(entry.enteredAt)) / 1000 : null; return { title: byName(entry.gate), meta: [`entered ${dateTime(entry.enteredAt)}`, entry.leftAt ? `left ${dateTime(entry.leftAt)}` : 'here now', known(stay) && stay >= 0 ? duration(stay) : ''].filter(Boolean).join(' · '), tone: entry.leftAt ? 'neutral' : 'live', glyph: entry.leftAt ? 'check' : 'circle-half' }; }) });
  return { rows, lists, groups: [], note: 'A bounce is a move back to an earlier gate. Only defect bounces, and bounces without a reason, count against right first time.' };
}

function conditionTab(card, condition) {
  if (!condition) return { rows: [row('Condition', card.grade?.formula === '2026.2' ? 'No confirmed crack' : notReported, card.grade?.formula === '2026.2' ? 'ok' : 'unreported'), ...(card.evolved === true ? [row('Requirement changed', 'Yes, the card evolved')] : [])], lists: [], groups: [], note: 'A crack is an inquiry, not a verdict. It appears here only after two people confirmed that a bug came from this card.' };
  const groups = condition.cracks.map(crack => ({
    title: [crack.ref || 'Bug', crack.title].filter(Boolean).join(' · '),
    rows: [
      row('Severity', crackSeverities[crack.severity] || notReported, crack.severity ? 'ok' : 'unreported'),
      row('Share', crack.share === 'contributing' ? 'Contributing cause' : 'Primary cause'),
      row('Discovery', crackDiscoveries[crack.discovery] || notReported, crackDiscoveries[crack.discovery] ? 'ok' : 'unreported'),
      crack.warranty ? row('Warranty', crackWarranties[crack.warranty]) : row('Warranty', notReported, 'unreported'),
      crack.weight !== null ? row('Weight', `${decimal(crack.weight)} off reliability`) : row('Weight', notReported, 'unreported'),
      crack.confirmedBy.length >= 2 ? row('Confirmed by', `${crack.confirmedBy[0]} (proposed) and ${crack.confirmedBy[1]}`) : row('Confirmed by', crack.confirmedBy.join(', ') || notReported, crack.confirmedBy.length ? 'ok' : 'unreported'),
      row('Confirmed', dateTime(crack.confirmedAt) || notReported, crack.confirmedAt ? 'ok' : 'unreported'),
      row('Dispute', crack.disputed ? 'Disputed by the steward, waiting for a referee' : 'None'),
      crack.mended ? row('Mend', `${crack.mended.pr !== null ? `#${crack.mended.pr}` : 'Fixed'}${crack.mended.bySteward ? ' by the steward' : crack.mended.by ? ` by ${crack.mended.by}` : ''}${crack.mended.at ? ` · ${dateTime(crack.mended.at)}` : ''}`) : row('Mend', 'Not mended yet', 'unreported'),
      ...(crack.mended ? [row('Mend confirmed', crack.mended.confirmedAt ? dateTime(crack.mended.confirmedAt) : Object.hasOwn(card.condition.cracks.find(entry => entry?.id === crack.id)?.mended ?? {}, 'confirmedAt') ? 'Not yet: a mend stands 30 days first' : notReported, crack.mended.confirmedAt ? 'ok' : 'unreported')] : []),
    ],
  }));
  return {
    rows: [
      row('Condition', condition.label),
      row('Cracks', count(condition.cracks.length)),
      condition.weight !== null ? row('Crack weight', `${decimal(condition.weight)} off reliability`) : row('Crack weight', notReported, 'unreported'),
      row('Requirement changed', card.evolved === true ? 'Yes, the card evolved' : 'No'),
    ],
    lists: [],
    groups,
    note: 'A crack is an inquiry, not a verdict: the fixer proposed it, a second person who is neither the steward nor the proposer confirmed it, and the steward may dispute it within five working days.',
  };
}

function setTab(set) {
  if (!set) return { rows: [row('Set', 'Not part of an epic set', 'unreported')], lists: [], groups: [], note: 'Ploeg builds a set from the tracker’s parent relations: the Work Items an epic named as its children before their first Shift.' };
  const epicName = [set.epic.ref, set.epic.title].filter(Boolean).join(' · ');
  if (set.role === 'child') return {
    rows: [row('Set', set.text), row('Epic', epicName), row('Position', set.position !== null ? `${set.position} of ${set.size}, in the order their first Shifts opened` : notReported, set.position !== null ? 'ok' : 'unreported'), row('Set complete', set.complete ? 'Yes' : 'Not yet')],
    lists: [], groups: [], note: 'A set completes when every Work Item in it merged, has been live 30 days and has no crack without a confirmed mend.',
  };
  return {
    rows: [row('Set', set.text), row('Settled', `${set.settled} of ${set.size}`), row('Cracked', count(set.children.filter(child => child.cracked).length)), row('Set complete', set.complete ? 'Yes' : 'Not yet')],
    lists: [{ title: `Children · ${plural(set.children.length, 'card')}`, layout: 'grid', empty: 'Ploeg listed no children.', items: set.children.map((child, index) => ({ title: child.title, meta: [`${index + 1}/${set.size}`, child.state.label, child.settled ? 'settled' : 'not settled yet', child.cracked ? 'cracked' : ''].filter(Boolean).join(' · '), tone: child.cracked ? 'danger' : child.settled ? 'success' : child.state.tone, glyph: child.cracked ? 'x-circle' : child.settled ? 'check-circle' : child.state.glyph })) }],
    groups: [], note: 'A set completes when every child merged, has been live 30 days and has no crack without a confirmed mend.',
  };
}

/** A rarity tier by its key, or null for a key Vloer does not know. */
export function rarityTier(key) {
  return rarityTiers.find(entry => entry.key === key) ?? null;
}

/**
 * The share of its cohort, in percent from the top, that a card stands in, from Ploeg's percentile (100 × (1 + scores
 * below) / size): the top card of 200 is in the top 0,5 %. Null when either is unknown.
 * @param {number | null} percentile
 * @param {number | null} size
 */
export function rarityTop(percentile, size) {
  if (!known(percentile) || !known(size) || size < 1) return null;
  return Math.min(100, Math.max(100 / size, 100 - percentile + 100 / size));
}

const topText = top => top >= 1 ? percent(Math.ceil(top - 1e-9) / 100) : `${decimal(Math.ceil(top * 10 - 1e-9) / 10, 1)}%`;
const quarterText = quarter => /^\d{4}Q[1-4]$/.test(quarter) ? quarter.replace('Q', '-Q') : quarter;
const wholeOrNull = value => known(value) && value >= 0 ? value : null;

/**
 * Each component of a challenge score from 0 to 1 under formula 2026.1 (Ploeg ADR-0056, proposed): reach from the
 * modules and repositories touched, sensitive from the files on sensitive ground, novelty from the share of files new
 * to the repository, and size from the counted lines, damped by a logarithm. An unknown input adds nothing. It matches
 * `rarityComponents` in `src/rarity.ts`.
 * @param {{ reach?: object, sensitive?: object, novelty?: object, size?: object }} inputs
 */
export function rarityComponents(inputs) {
  const modules = Math.max(1, wholeOrNull(inputs?.reach?.modules) ?? 0);
  const repos = Math.max(1, wholeOrNull(inputs?.reach?.repos) ?? 1);
  const files = wholeOrNull(inputs?.novelty?.files) ?? 0;
  const novel = wholeOrNull(inputs?.novelty?.novel);
  const share = known(inputs?.novelty?.share) ? inputs.novelty.share : files > 0 && novel !== null ? novel / files : 0;
  return {
    reach: Math.min(1, Math.log(modules + 3 * (repos - 1)) / Math.log(12)),
    sensitive: Math.min(1, Math.log(1 + (wholeOrNull(inputs?.sensitive?.files) ?? 0)) / Math.log(9)),
    novelty: Math.min(1, Math.max(0, share)),
    size: Math.min(1, Math.log(1 + (wholeOrNull(inputs?.size?.countedLines) ?? 0)) / Math.log(2001)),
  };
}

function rarityInputs(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const files = wholeOrNull(raw.novelty?.files);
  const novel = wholeOrNull(raw.novelty?.novel);
  return {
    modules: wholeOrNull(raw.reach?.modules), repos: wholeOrNull(raw.reach?.repos),
    sensitiveFiles: wholeOrNull(raw.sensitive?.files), paths: list(raw.sensitive?.paths).map(text).filter(Boolean).slice(0, 20),
    share: known(raw.novelty?.share) ? raw.novelty.share : files && novel !== null ? novel / files : null, files, novel,
    lines: wholeOrNull(raw.size?.countedLines),
    set: typeof raw.set === 'boolean' ? raw.set : null, truncated: raw.truncated === true,
    notCollected: list(raw.notCollected).map(text).filter(Boolean),
  };
}

const rarityFacts = Object.freeze({
  reach: inputs => inputs.modules === null ? notReported : `${plural(inputs.modules, 'module')}${inputs.repos !== null ? ` in ${plural(inputs.repos, 'repository', 'repositories')}` : ''}`,
  sensitive: inputs => inputs.sensitiveFiles === null ? notReported : inputs.sensitiveFiles ? `${plural(inputs.sensitiveFiles, 'file')} on sensitive ground` : 'No sensitive files',
  novelty: inputs => inputs.share === null ? notReported : inputs.files !== null && inputs.novel !== null ? `${count(inputs.novel)} of ${plural(inputs.files, 'file')} new to the repository` : `${percent(inputs.share)} new ground`,
  size: inputs => inputs.lines === null ? notReported : `${count(inputs.lines)} counted lines`,
});

const rarityDrivers = Object.freeze({
  reach: inputs => `reached ${plural(inputs.modules, 'module')}${inputs.repos > 1 ? ` across ${plural(inputs.repos, 'repository', 'repositories')}` : ''}`,
  sensitive: inputs => `touched ${plural(inputs.sensitiveFiles, 'file')} on sensitive ground`,
  novelty: inputs => `broke new ground in ${percent(inputs.share)} of its files`,
  size: inputs => `changed ${count(inputs.lines)} lines`,
});
const driverWeight = part => part.key === 'size' ? part.value - 0.25 : part.value;

const notCollectedRarity = Object.freeze({ complexity: 'Complexity of the code touched', estimate: 'Estimate versus actual' });

function rarityParts2026(inputs, state) {
  const values = rarityComponents({ reach: { modules: inputs.modules, repos: inputs.repos }, sensitive: { files: inputs.sensitiveFiles }, novelty: { share: inputs.share, files: inputs.files, novel: inputs.novel }, size: { countedLines: inputs.lines } });
  return rarityParts.map(part => ({ ...part, value: values[part.key], points: values[part.key] * part.weight * 100, max: part.weight * 100, fact: rarityFacts[part.key](inputs), known: rarityFacts[part.key](inputs) !== notReported }))
    .concat(state === 'predicted' && inputs.set === true ? [{ key: 'set', label: 'Epic set', weight: 0, value: 1, points: 10, max: 10, fact: 'In an epic’s set: adds 10 while predicted', known: true }] : []);
}

function rarityWhy(view) {
  const { tier, state, fromSet, inputs, parts, points, rank, cohort } = view;
  const own = view.revealed ?? view.predicted;
  if (fromSet) return `Legendary while its epic’s set is complete: every Work Item in the set merged, has been live 30 days and has no open crack. It drops back if the set reopens.${own ? ` Its own change is ${own.label.toLowerCase()}.` : ''}`;
  const scoreLine = points !== null ? `a challenge score of ${score(points)}` : '';
  const where = rank ? `in the ${rank}` : cohort ? `on the fixed thresholds while ${cohort.target} has fewer than 30 cards in ${cohort.quarterText}` : '';
  const tail = [scoreLine, where].filter(Boolean).join(', ');
  const lead = state === 'predicted' ? `Predicted ${tier.label.toLowerCase()}` : tier.label;
  const after = state === 'predicted' ? ' The merged change reveals its rarity at release.' : '';
  if (!parts || !inputs) return `${lead}${tail ? `: ${tail}` : ''}.${view.formula ? ` This Vloer cannot break formula ${view.formula} down.` : ''}${after}`;
  const drivers = parts.filter(part => part.key !== 'set' && part.known && driverWeight(part) >= 0.5).sort((a, b) => driverWeight(b) - driverWeight(a)).slice(0, 2).map(part => rarityDrivers[part.key](inputs));
  const because = drivers.length && tier.rank > 0 ? ` because it ${drivers.join(' and ')}` : ', a contained change';
  return `${lead}${because}${tail ? `: ${tail}` : ''}.${after}`;
}

function rarityView(card) {
  const raw = card.rarity;
  if (!raw || typeof raw !== 'object') return null;
  const tier = rarityTier(raw.tier);
  if (!tier) return null;
  const predicted = rarityTier(raw.predicted);
  const revealed = rarityTier(raw.revealed);
  const own = revealed ?? predicted;
  const fromSet = tier.key === 'legendary' && own?.key !== 'legendary' && card.set?.role === 'epic' && card.set?.complete === true;
  const state = revealed || fromSet ? 'revealed' : 'predicted';
  const points = known(raw.score) ? raw.score : null;
  const percentile = known(raw.percentile) ? raw.percentile : null;
  const cohort = raw.cohort && typeof raw.cohort === 'object' && text(raw.cohort.target) ? { target: text(raw.cohort.target), quarter: text(raw.cohort.quarter), quarterText: quarterText(text(raw.cohort.quarter)), size: known(raw.cohort.size) ? raw.cohort.size : null } : null;
  const top = rarityTop(percentile, cohort?.size ?? null);
  const rank = top !== null && cohort ? `top ${topText(top)} of ${cohort.target} in ${cohort.quarterText}` : '';
  const formula = text(raw.formula);
  const inputs = rarityInputs(raw.inputs);
  const parts = formula === '2026.1' && inputs && !(fromSet && points === null) ? rarityParts2026(inputs, state) : null;
  const change = revealed && predicted ? (revealed.rank > predicted.rank ? 'up' : revealed.rank < predicted.rank ? 'down' : 'same') : null;
  const chip = state === 'predicted' ? `Predicted ${tier.label.toLowerCase()}` : tier.label;
  const view = { tier, key: tier.key, label: tier.label, state, predicted, revealed, fromSet, change, points, scoreText: points === null ? '' : `${score(points)} of 100`, percentile, top, topText: top === null ? '' : topText(top), cohort, rank, formula, inputs, parts, revealedAt: text(raw.revealedAt), chip };
  const description = state === 'predicted'
    ? `Rarity: predicted ${tier.label.toLowerCase()} from what was known before the merge, revealed at release. Rarity is how challenging the change was, not how well it was done.`
    : `Rarity: ${tier.label}${rank ? `, ${rank}` : fromSet ? ', while its set is complete' : ''}. Rarity is how challenging the change was, not how well it was done.`;
  return { ...view, text: [chip, rank].filter(Boolean).join(' · '), description, why: rarityWhy(view) };
}

const rarityNote = 'Rarity is how exceptional the work was: a challenge score from how far the change reached, whether it touched sensitive ground, how new that ground was, and its size, damped. It is not the grade (how well it was done) or the finish (how long it has lived), and cost, time, tokens, bounces and the grade never count. It is predicted before the merge, revealed at release from the merged change, ranked against the same repository’s cards that quarter, and frozen once revealed; an epic’s own card is legendary only while its set is complete. Cosmetic only: it never changes what Ploeg authorizes, budgets or merges, or a pack’s odds.';

function rarityTab(card, rarity) {
  if (!rarity) return { rows: [row('Rarity', 'Not rated', 'unreported')], lists: [], groups: [], note: `${Object.hasOwn(card, 'rarity') ? 'Ploeg rates a card once it has a play: predicted before the merge and revealed at release. An older Ploeg sends no rarity.' : 'This Ploeg does not send rarity.'} ${rarityNote}` };
  const { tier, state, predicted, revealed, fromSet, cohort, rank, parts, inputs } = rarity;
  const rows = [
    row('Rarity', state === 'predicted' ? `${tier.label}, predicted` : tier.label),
    predicted ? row('Predicted', `${predicted.label}, before the merge`) : row('Predicted', fromSet ? 'Not predicted: an epic’s own card' : notReported, 'unreported'),
    revealed ? row('Revealed', `${revealed.label}${rarity.revealedAt ? ` · ${dateTime(rarity.revealedAt)}` : ''}`) : row('Revealed', fromSet ? 'Legendary while the set is complete' : 'At release, from the merged change', fromSet ? 'ok' : 'unreported'),
    rarity.points !== null ? row('Challenge score', rarity.scoreText) : row('Challenge score', fromSet ? 'None: an epic’s card is rated by its set' : notReported, 'unreported'),
    rank ? row('Rank', `${rank[0].toUpperCase()}${rank.slice(1)}${cohort.size ? ` · ${plural(cohort.size, 'card')}` : ''}`) : cohort ? row('Rank', `Fixed thresholds: ${cohort.size ? plural(cohort.size, 'card') : 'a few cards'} in ${cohort.target} for ${cohort.quarterText}, fewer than 30`) : row('Rank', 'No cohort yet', 'unreported'),
    row('Formula', rarity.formula || notReported, rarity.formula ? 'ok' : 'unreported'),
    row('On the card', state === 'predicted' ? `A ${tier.metalLabel.toLowerCase()} glow until release` : `${tier.metalLabel} frame, ${tier.symbolLabel.toLowerCase()} set symbol`),
    ...(card.demo ? [row('Source', 'Demo · illustrative inputs, not rated by Ploeg', 'demo')] : []),
  ];
  const groups = [];
  if (parts) groups.push({ title: 'Score components', rows: [
    ...parts.map(part => part.key === 'set' ? row(part.label, `+10 points · ${part.fact}`) : part.known ? row(`${part.label} · ${Math.round(part.weight * 100)}%`, `${score(Math.round(part.points * 10) / 10)} of ${part.max} points · ${part.fact}`) : row(`${part.label} · ${Math.round(part.weight * 100)}%`, `${notReported} · adds nothing`, 'unreported')),
    ...(inputs?.truncated ? [row('File facts', 'A lower bound: a play touched more files than Ploeg keeps', 'unreported')] : []),
    ...inputs.notCollected.filter(key => Object.hasOwn(notCollectedRarity, key)).map(key => uncollected(notCollectedRarity[key])),
  ] });
  else if (inputs === null && !fromSet) groups.push({ title: 'Score components', rows: [row('Inputs', 'This Ploeg did not send them', 'unreported')] });
  else if (!fromSet) groups.push({ title: 'Score components', rows: [row('Inputs', `Formula ${rarity.formula} is newer than this Vloer`, 'unreported')] });
  const lists = inputs?.paths.length ? [{ title: `Sensitive paths · ${plural(inputs.paths.length, 'file')}`, items: inputs.paths.map(path => ({ title: path, meta: 'On the Work Target’s sensitive ground', tone: 'attention', glyph: 'shield' })) }] : [];
  return { lead: rarity.why, rows, groups, lists, note: rarityNote };
}

/** The role that names a person's copy of a card, as the binder shows it. */
export const copyRoleLabels = Object.freeze({ developer: 'Developer', reviewer: 'Reviewer', qa: 'QA', po: 'PO', acceptor: 'Acceptor', merger: 'Merger', steward: 'Steward' });

function copyView(card) {
  const copy = card.copy && typeof card.copy === 'object' ? card.copy : null;
  if (!copy) return null;
  const role = text(copy.role);
  const altArt = Number.isInteger(copy.altArt) && copy.altArt >= 0 && copy.altArt < 64 ? copy.altArt : null;
  return { role, roleLabel: copyRoleLabels[role] ?? (role ? role[0].toUpperCase() + role.slice(1) : ''), altArt, fullArt: copy.fullArt === true, goldSignature: copy.goldSignature === true, pulled: Boolean(text(copy.foilPattern)) };
}

/**
 * The view model of a Run card: every slot formatted (nl-NL money with two decimals, compact counts, durations),
 * and every value Ploeg left out marked "Not reported", never zero. While a Run is running, cost, tokens and run time
 * are Ploeg's `live` reading so far, and a figure missing from it reads "Not reported yet". Values Ploeg does not collect yet read
 * "Not collected yet". A demo card reads "Demo · no model calls" for cost and usage. `rarity` is null until Ploeg sends a
 * readable rarity (Ploeg ADR-0056, proposed): its tier, whether it is still `predicted` or `revealed`, the challenge
 * score, the rank in its cohort, the components and a plain "why" line. `grade` and
 * `condition` are null until Ploeg sends a readable grade (P2b) or a confirmed crack (P3). The finish comes from the
 * whole days since `release.at` on the finish ladder; Ploeg's own `finish` is ignored, and a card without a release is
 * matte. A card in a binder carries `copy`, the person's copy: its role and its first pull from a pack (ADR 0029).
 * `foilPattern` is the pattern that pull assigned, and null on a card without a pull, for which a skin derives a stable
 * pattern from the card's identity; `copy` in the view holds the role and the pull's other cosmetics. `kpis.headline`
 * holds the three or four KPI figures the front leads with for the card's state, and the Flow, Review & CI, Change and
 * Life tabs carry the flow, pull request, CI and change-shape figures (Ploeg ADR-0057 and ADR-0058, proposed; Vloer ADR
 * 0035): durations compact, with a working-hours twin where Ploeg counted one. A tab may carry `blocks` (stat tiles, a
 * stacked bar, a table, steps, the clock toggle, a glossary) that the shared back draws before its rows.
 * @param {object} card A card from `GET /api/ploeg/work-items/:id/card`.
 * @param {{ now?: number }} [options] `now` is the clock in milliseconds, for tests.
 */
export function cardView(card, { now = Date.now() } = {}) {
  const data = card && typeof card === 'object' ? card : {};
  const all = plays(data);
  const release = releaseView(data, now);
  const cost = costView(data);
  const diff = diffView(all);
  const id = text(String(data.workItemId ?? ''));
  const repo = repository(data.target);
  const grade = gradeView(data);
  const condition = conditionView(data);
  const gates = gatesView(data);
  const set = setView(data);
  const rarity = rarityView(data);
  const kpis = kpiView(data, { now });
  const tabs = { economics: economics(data, cost), agent: agent(data), change: change(data, all, diff, kpis.change), review: review(data, all, grade, kpis.review), flow: kpis.flow, gates: gatesTab(data, gates), grade: gradeTab(data, grade), rarity: rarityTab(data, rarity), condition: conditionTab(data, condition), life: life(data, all, release, condition, kpis.life), set: setTab(set), context: context({ ...data, workItemId: id }, set) };
  const style = data.style && typeof data.style === 'object' ? data.style : {};
  return {
    id,
    title: text(data.title) || (id ? `Work Item #${id}` : 'Untitled Work Item'),
    demo: data.demo === true,
    state: cardState(text(data.state) || 'drafting'),
    cost,
    tokens: tokensView(data),
    runTime: runTimeView(data),
    diff,
    pr: prView(all),
    crew: crewLine(data),
    steward: stewardView(data),
    plays: { count: all.length, text: all.length ? plural(all.length, 'play') : 'No plays yet' },
    ids: [id ? `#${id}` : '', text(data.externalRef), repo].filter(Boolean),
    team: text(data.team),
    repo,
    url: text(data.url),
    release,
    finish: release.finish,
    rounds: known(data.totals?.rounds) ? data.totals.rounds : null,
    grade,
    rarity,
    condition,
    gates,
    set,
    evolved: data.evolved === true,
    style: { skin: text(style.skin), theme: text(style.theme) },
    foilPattern: text(data.copy?.foilPattern) || null,
    copy: copyView(data),
    kpis: { headline: kpis.headline, calendar: kpis.calendar, hasWorking: kpis.hasWorking },
    tabs: cardTabs.map(tab => ({ groups: [], blocks: [], ...tab, ...tabs[tab.id] })),
  };
}
