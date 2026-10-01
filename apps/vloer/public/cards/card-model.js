import { money, count, compactCount, duration, dateTime, plural } from '../core/format.js';
import { cardState, playState, ciState, humanReview, runOutcome, actorName } from '../core/states.js';

/** What a card shows for a value Ploeg does not collect at all yet. */
export const notCollected = 'Not collected yet';
/** What a card shows for a value Ploeg collects but did not report for this Work Item. */
export const notReported = 'Not reported';
/** The demo's cost line: a demo makes no model calls and spends nothing. */
export const demoCost = 'Demo · no model calls';
/** Days in production need deploy events, which phase 2 adds. */
export const plannedLife = 'Arrives with deploy events (P2)';

/** The back's tabs in order. */
export const cardTabs = Object.freeze([
  { id: 'economics', label: 'Economics' },
  { id: 'agent', label: 'Agent' },
  { id: 'change', label: 'Change' },
  { id: 'review', label: 'Review & CI' },
  { id: 'life', label: 'Life' },
  { id: 'context', label: 'Context' },
]);

const known = value => typeof value === 'number' && Number.isFinite(value);
const text = value => typeof value === 'string' ? value.trim() : '';
const list = value => Array.isArray(value) ? value : [];
const sum = (entries, key) => entries.reduce((total, entry) => total + entry[key], 0);
const row = (label, value, status = 'ok') => ({ label, value, status });
const reported = (label, value, format) => known(value) ? row(label, format(value)) : row(label, notReported, 'unreported');
const uncollected = label => row(label, notCollected, 'uncollected');
const byTime = (a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0);
const repository = target => target && text(target.owner) && text(target.repo) ? `${text(target.owner)}/${text(target.repo)}` : '';
const stewardSources = { merged_by: 'Merged the pull request', approver: 'Approved the pull request' };
const rosterRoles = { merger: 'merger', reviewer: 'reviewer' };
const inReview = Object.freeze({ key: 'in_review', label: 'In review', tone: 'review', glyph: 'pull-request' });
const playMeta = state => state ? playState(state) : inReview;
const costStatuses = { observed: 'Observed', reserved: 'Reserved, not settled', not_reported: notReported };

function plays(card) {
  return list(card.plays).filter(play => play && known(play.number)).slice().sort((a, b) => a.number - b.number);
}

function costView(card) {
  const totals = card.totals || {};
  const authorized = known(totals.authorizedUsd) && totals.authorizedUsd > 0 ? totals.authorizedUsd : null;
  const of = authorized === null ? '' : `of ${money(authorized)}`;
  if (card.demo) return { value: 'Demo', caption: 'no model calls', text: demoCost, share: null, over: false, status: 'demo', label: `Cost: ${demoCost}${authorized === null ? '' : `, ${money(authorized)} authorized`}` };
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
  const parts = [known(totals.inputTokens) ? `${compactCount(totals.inputTokens)} in` : '', known(totals.outputTokens) ? `${compactCount(totals.outputTokens)} out` : ''].filter(Boolean);
  if (!parts.length) return { value: notReported, detail: '', known: false, partial: false };
  const partial = totals.usageComplete === false;
  return { value: parts.join(' · '), detail: partial ? 'Some Runs did not report usage' : '', known: true, partial };
}

function runTimeView(card) {
  const totals = card.totals || {};
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

function economics(card, cost) {
  const totals = card.totals || {};
  const crew = list(card.crew).filter(member => text(member?.role));
  return {
    rows: [
      row('Cost', card.demo ? demoCost : cost.text, cost.status === 'not_reported' ? 'unreported' : 'ok'),
      card.demo ? row('Authorized', 'None · demo', 'demo') : reported('Authorized', totals.authorizedUsd, money),
      row('Cost status', card.demo ? 'Demo' : costStatuses[totals.costStatus] || notReported, card.demo || totals.costStatus === 'not_reported' || !totals.costStatus ? 'unreported' : 'ok'),
      usageRow(card, 'Input tokens', totals.inputTokens),
      usageRow(card, 'Output tokens', totals.outputTokens),
      usageRow(card, 'Cache read tokens', totals.cacheReadInputTokens),
      usageRow(card, 'Cache write tokens', totals.cacheCreationInputTokens),
      card.demo ? row('Every Run reported usage', 'None · demo', 'demo') : totals.usageComplete === true ? row('Every Run reported usage', 'Yes') : totals.usageComplete === false ? row('Every Run reported usage', 'No, totals are partial', 'unreported') : row('Every Run reported usage', notReported, 'unreported'),
      uncollected('Model mix'),
    ],
    lists: crew.length ? [{ title: 'Cost by Role', items: crew.map(member => ({ title: member.role, meta: card.demo ? 'Demo · no spend' : [known(member.costUsd) ? money(member.costUsd) : notReported, known(member.inputTokens) ? `${compactCount(member.inputTokens)} tokens in` : ''].filter(Boolean).join(' · '), tone: 'neutral', glyph: member.writes ? 'code' : 'eye' })) }] : [],
  };
}

function agent(card) {
  const totals = card.totals || {};
  const crew = list(card.crew).filter(member => text(member?.role));
  return {
    rows: [
      reported('Runs', totals.runs, count),
      reported('Failed Runs', totals.failedRuns, count),
      reported('Rounds', totals.rounds, count),
      reported('Shifts', totals.shifts, count),
      usageRow(card, 'Turns', totals.turns),
      usageRow(card, 'Tool calls', totals.toolCalls),
      reported('Run time', totals.runSeconds, duration),
      row('First Run', dateTime(totals.firstRunAt) || notReported, totals.firstRunAt ? 'ok' : 'unreported'),
      row('Last Run', dateTime(totals.lastRunAt) || notReported, totals.lastRunAt ? 'ok' : 'unreported'),
      uncollected('Peak context'),
      uncollected('Active time'),
    ],
    lists: crew.length ? [{ title: 'Crew', items: crew.map(member => ({ title: `${member.role}${member.writes === true ? ' · writer' : member.writes === false ? ' · reader' : ''}`, meta: known(member.runs) ? plural(member.runs, 'Run') : notReported, tone: 'neutral', glyph: member.writes ? 'code' : 'eye' })) }] : [],
  };
}

function change(card, all, diff) {
  const measured = all.length && diff.known;
  return {
    rows: [
      measured ? row('Lines added', diff.addText) : row('Lines added', all.length ? notReported : 'No pull request yet', 'unreported'),
      measured ? row('Lines removed', diff.delText) : row('Lines removed', all.length ? notReported : 'No pull request yet', 'unreported'),
      measured && diff.files !== null ? row('Files changed', count(diff.files)) : row('Files changed', all.length ? notReported : 'No pull request yet', 'unreported'),
      uncollected('Languages'),
      uncollected('Test and code lines'),
    ],
    lists: all.length ? [{ title: plural(all.length, 'play'), items: all.slice().reverse().map(play => {
      const meta = playMeta(play.state);
      const lines = known(play.additions) && known(play.deletions) ? `+${count(play.additions)} −${count(play.deletions)}${known(play.changedFiles) ? ` · ${plural(play.changedFiles, 'file')}` : ''}` : 'Diff not reported';
      const merged = play.mergedAt ? `merged ${dateTime(play.mergedAt)}${text(play.mergedBy) ? ` by ${text(play.mergedBy)}` : ''}` : play.closedAt ? `closed ${dateTime(play.closedAt)}` : '';
      return { title: `#${play.number} · ${meta.label}`, meta: [text(play.branch), lines, merged].filter(Boolean).join(' · '), tone: meta.tone, glyph: meta.glyph, url: text(play.url) };
    }) }] : [],
  };
}

function review(card, all) {
  const reviews = all.flatMap(play => list(play.reviews).map(entry => ({ ...entry, number: play.number })));
  const latest = all.at(-1);
  const ci = latest ? ciState(latest.ci?.state && latest.ci.state !== 'unknown' ? latest.ci.state : '') : null;
  const wait = firstReviewAfterOpen(card, all);
  const roster = list(card.roster).filter(person => text(person?.name));
  const lists = [];
  if (reviews.length) lists.push({ title: 'Reviews by people', items: reviews.map(entry => { const meta = humanReview(entry.state); return { title: `${text(entry.reviewer) || 'Someone'} · ${meta.label}`, meta: [`#${entry.number}`, dateTime(entry.receivedAt)].filter(Boolean).join(' · '), tone: meta.tone, glyph: meta.glyph }; }) });
  const checks = list(latest?.ci?.checks);
  if (checks.length) lists.push({ title: `Checks on #${latest.number}`, items: checks.map(check => { const meta = ciState(check.state) || { label: notReported, tone: 'neutral', glyph: 'circle' }; return { title: text(check.context) || 'Check', meta: meta.short || meta.label, tone: meta.tone, glyph: meta.glyph }; }) });
  if (roster.length) lists.push({ title: 'Roster', items: roster.map(person => ({ title: person.name, meta: list(person.roles).map(role => rosterRoles[role] || role).join(', '), tone: 'neutral', glyph: 'user' })) });
  return {
    rows: [
      all.length ? row('Reviews by people', count(reviews.length)) : row('Reviews by people', 'No pull request yet', 'unreported'),
      wait === null ? row('Time to first review', reviews.length ? notReported : 'No review yet', 'unreported') : row('Time to first review', duration(wait)),
      latest ? row(`CI on #${latest.number}`, ci ? ci.label : notReported, ci ? 'ok' : 'unreported') : row('CI', 'No pull request yet', 'unreported'),
      ...(latest?.ci?.capturedAt ? [row('CI read', dateTime(latest.ci.capturedAt))] : []),
      uncollected('CI duration'),
      uncollected('Review rounds by people'),
    ],
    lists,
  };
}

function life(card, all) {
  const merged = all.filter(play => play.mergedAt).at(-1);
  return {
    rows: [
      merged ? row('Merged', dateTime(merged.mergedAt)) : row('Merged', 'Not merged', 'unreported'),
      row('Days in production', plannedLife, 'planned'),
      uncollected('Lines still alive'),
      uncollected('Reverts and linked bugs'),
    ],
    lists: [],
    note: 'Days in production arrive with deploy events, planned for phase 2. Until then the card stays matte.',
  };
}

function context(card) {
  const events = list(card.events).filter(entry => entry && entry.at).slice().sort(byTime);
  const shown = events.slice(-40);
  return {
    rows: [
      row('Work Item', `#${card.workItemId}`),
      text(card.externalRef) ? row('Tracker', text(card.externalRef)) : row('Tracker', notReported, 'unreported'),
      text(card.team) ? row('Team', text(card.team)) : row('Team', notReported, 'unreported'),
      repository(card.target) ? row('Repository', repository(card.target)) : row('Repository', notReported, 'unreported'),
      uncollected('Epic'),
    ],
    lists: [{ title: events.length ? `Timeline · ${plural(events.length, 'event')}` : 'Timeline', empty: 'Nothing happened yet.', more: events.length - shown.length, items: shown.map(entry => ({ ...eventLine(entry), meta: [dateTime(entry.at), text(entry.actor) ? actorName(entry.actor) : ''].filter(Boolean).join(' · ') })) }],
  };
}

/**
 * The view model of a Run card: every slot formatted (nl-NL money with two decimals, compact counts, durations),
 * and every value Ploeg left out marked "Not reported", never zero. Values Ploeg does not collect yet read
 * "Not collected yet". A demo card reads "Demo · no model calls" for cost and usage. Rarity, grade and condition
 * are not shown in P1; every card is matte.
 * @param {object} card A card from `GET /api/ploeg/work-items/:id/card`.
 */
export function cardView(card) {
  const data = card && typeof card === 'object' ? card : {};
  const all = plays(data);
  const cost = costView(data);
  const diff = diffView(all);
  const id = text(String(data.workItemId ?? ''));
  const repo = repository(data.target);
  const tabs = { economics: economics(data, cost), agent: agent(data), change: change(data, all, diff), review: review(data, all), life: life(data, all), context: context({ ...data, workItemId: id }) };
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
    tabs: cardTabs.map(tab => ({ ...tab, ...tabs[tab.id] })),
  };
}
