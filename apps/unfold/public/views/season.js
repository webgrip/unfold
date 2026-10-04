import { state, disconnect, onForget } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, renderHtml } from '../core/dom.js';
import { compactDuration, count, decimal, percent } from '../core/format.js';
import { buildHash } from '../core/route.js';
import { callout, demoNote, emptyState, segmented, skeleton, stat, table } from '../core/ui.js';
import { finishLadder } from '../cards/card-model.js';
import { shell } from '../shell.js';

const view = { data: null, error: '', loading: false, request: 0, team: '', quarter: '' };
onForget(() => Object.assign(view, { data: null, error: '', loading: false, request: view.request + 1, team: '', quarter: '' }));

const reasonLabels = { defect: 'Defect', requirement: 'Requirement changed', misunderstood: 'Misunderstood', environment: 'Environment', unknown: 'No reason given' };
const notCollected = 'Not collected yet';

function quarterLabel(id) {
  return String(id ?? '').replace('-', ' ');
}

function tiles(a) {
  const rft = a.rightFirstTime;
  return `<div class="season-tiles" role="group" aria-label="Team totals">${[
    stat({ label: 'Cards shipped', value: count(a.shipped), detail: 'A play merged this quarter' }),
    stat({ label: 'Days live added', value: count(a.daysLiveAdded), detail: 'Across the Team\'s released cards' }),
    stat({ label: 'Mends', value: count(a.mends), detail: 'Cracks fixed this quarter' }),
    stat({ label: 'Cracks confirmed', value: count(a.cracks), detail: 'More reported after rollout is a good sign' }),
    stat({ label: 'Right first time', value: rft ? percent(rft.share) : notCollected, detail: rft ? `Of ${count(rft.cards)} shipped cards with gate facts: no defect or unknown bounce` : 'Needs gate facts from Ploeg', quiet: !rft, text: !rft }),
    stat({ label: 'Sets complete', value: a.sets ? `${count(a.sets.complete)} of ${count(a.sets.total)}` : notCollected, detail: a.sets ? 'Epic set cards now complete' : 'Needs set facts from Ploeg', quiet: !a.sets, text: true }),
  ].join('')}</div>`;
}

function medianTile(label, median, format, detail) {
  if (!median) return stat({ label, value: notCollected, detail: 'No shipped card carries this figure yet', quiet: true, text: true });
  return stat({ label, value: format(median.value), detail: `${detail} · median of ${count(median.cards)} ${median.cards === 1 ? 'card' : 'cards'}` });
}

function medians(a) {
  const m = a.medians;
  if (!m) return '';
  return `<section class="card season-card season-medians" aria-labelledby="season-medians"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="season-medians">Team medians</h2><p class="card-subtitle">Typical figures of the cards shipped this quarter: half took longer, half shorter. Team aggregates only.</p></div></header><div class="season-tiles" role="group" aria-label="Team medians">${[
    medianTile('Lead time', m.leadTimeSeconds, compactDuration, 'Ticket to release'),
    medianTile('First feedback', m.firstFeedbackSeconds, compactDuration, 'Ready to the first human response'),
    medianTile('CI minutes', m.ciMinutes, value => `${decimal(value, 1)} min`, 'Every CI job attempt added up'),
    medianTile('Flow efficiency', m.flowEfficiency, percent, 'Active share of the cycle'),
  ].join('')}</div></section>`;
}

function finishes(a) {
  const rows = finishLadder.filter(step => step.level > 0).map(step => ({ finish: escape(step.label), days: `${count(step.days)} days live`, reached: escape(count(a.finishes[step.key] ?? 0)) }));
  return `<section class="card season-card" aria-labelledby="season-finishes"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="season-finishes">Finishes reached</h2><p class="card-subtitle">Cards of the Team that crossed a finish step this quarter.</p></div></header>${table({ caption: 'Finishes reached', compact: true, region: false, rowHeader: true, columns: [{ key: 'finish', label: 'Finish' }, { key: 'days', label: 'At' }, { key: 'reached', label: 'Cards', numeric: true }], rows })}</section>`;
}

function bounces(a) {
  const body = a.bounceReasons
    ? table({ caption: 'Bounce reasons', compact: true, region: false, rowHeader: true, columns: [{ key: 'reason', label: 'Reason' }, { key: 'count', label: 'Bounces', numeric: true }], rows: Object.entries(a.bounceReasons).map(([reason, total]) => ({ reason: escape(reasonLabels[reason] ?? reason), count: escape(count(total)) })) })
    : `<p class="season-empty">${notCollected}: Ploeg does not send gate facts for these cards.</p>`;
  return `<section class="card season-card" aria-labelledby="season-bounces"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="season-bounces">Bounce reasons</h2><p class="card-subtitle">Why work went back a gate this quarter. Requirement and misunderstanding point at the process, not at a person.</p></div></header>${body}</section>`;
}

function controls(data) {
  const teams = data.teams.length > 1 ? segmented({ label: 'Team', items: data.teams.map(team => ({ id: team, label: team, selected: team === data.team, href: `#${buildHash('season', { team, quarter: data.quarter.id })}` })) }) : '';
  const quarters = segmented({ label: 'Quarter', items: data.quarters.map(quarter => ({ id: quarter.id, label: quarterLabel(quarter.id), selected: quarter.id === data.quarter.id, href: `#${buildHash('season', { team: data.team, quarter: quarter.id })}` })) });
  return `<div class="season-controls">${teams}${quarters}</div>`;
}

function renderSeason() {
  const data = view.data;
  let content;
  if (!data && view.loading) content = skeleton({ rows: 6, variant: 'cards' });
  else if (!data) content = callout({ tone: 'danger', title: 'Could not read the season', body: `<p>${escape(view.error || 'The workbench did not answer.')}</p>` });
  else if (!data.team) content = emptyState({ icon: 'calendar', title: 'No Teams', body: 'Your account has no Ploeg Teams, so there is no season page to show.' });
  else {
    const a = data.aggregates;
    const notice = data.justStarted ? `<p class="season-notice">${escape(quarterLabel(data.justStarted))} has just started, so this shows ${escape(quarterLabel(data.quarter.id))}.</p>` : '';
    const scan = data.source?.kind === 'scan' ? `<p class="season-notice">Ploeg has no card list yet, so these totals cover the Team's ${count(data.source.scanned)} most recently updated Work Items.</p>` : '';
    content = `${data.demo ? demoNote('Demo season · illustrative cards · no model calls, no spend') : ''}${controls(data)}${notice}${scan}<p class="season-privacy">Team totals only. No person is named or counted here, and nothing on this page ranks anyone.</p>${tiles(a)}${medians(a)}<div class="season-grid">${finishes(a)}${bounces(a)}</div>`;
  }
  const title = data?.team ? `Season · ${data.team}` : 'Season';
  renderHtml(shell(`<div class="season-page">${content}</div>`, { title, subtitle: data?.quarter ? `${quarterLabel(data.quarter.id)}: what the Team's cards did this quarter.` : 'What a Team\'s cards did each quarter.', wide: true }));
}

async function load() {
  const request = ++view.request;
  view.loading = true;
  renderSeason();
  try {
    const data = await api(`/api/season?${new URLSearchParams(Object.entries({ team: view.team, quarter: view.quarter }).filter(([, value]) => value))}`);
    if (request !== view.request) return;
    view.data = data;
    view.error = '';
  } catch (error) { if (request !== view.request) return; if (error.status !== 401) view.error = error.message; view.data = null; }
  view.loading = false;
  if (state.view === 'season') renderSeason();
}

async function enterSeason({ query = {} } = {}) {
  disconnect(); state.session = null; state.view = 'season';
  view.team = query.team ?? '';
  view.quarter = /^[0-9]{4}-Q[1-4]$/.test(query.quarter ?? '') ? query.quarter : '';
  await load();
}

/** A Team's season page (`#season?team=&quarter=`): the quarter's Team totals from its cards, and never a number per person. */
export default {
  id: 'season',
  match: hash => hash === 'season' ? {} : null,
  enter: enterSeason,
  render: renderSeason,
};
