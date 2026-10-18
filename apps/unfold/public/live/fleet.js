import { workItemRef } from '../ploeg.js';
import { demoNote } from '../core/ui.js';
import { runFailure, runOutcome } from '../core/states.js';
import { dateTime, money, plural, relative, time } from '../core/format.js';
import { cx, escape, plane, span } from './parts.js';

/** The places a Work Item can be on the fleet board, in flight order. */
export const fleetStages = Object.freeze([
  { id: 'gate', label: 'At the gate', hint: 'Queued for a worker of its Team, or proposed and waiting for a yes' },
  { id: 'air', label: 'In the air', hint: 'An agent is working on it' },
  { id: 'holding', label: 'Holding', hint: 'Ploeg stopped and will not retry by itself' },
  { id: 'approach', label: 'On approach', hint: 'A pull request waits for your review' },
  { id: 'landed', label: 'Landed · 24 h', hint: 'Runs that finished in the last 24 hours' },
]);

/** How many Work Items one stage of a lane draws before it links to the rest. */
export const stageLimit = 4;

/** How many of a Team's most recent Runs its contrail draws. */
export const trailLimit = 10;

/** How many rows each flight board lists. */
export const boardLimit = 8;

const day = 86_400_000;
const moment = value => { const at = typeof value === 'number' ? value : Date.parse(value ?? ''); return Number.isFinite(at) ? at : null; };
const list = value => Array.isArray(value) ? value : [];
const runRef = run => String(run.externalRef || `#${run.workItemId}`);
const amount = value => typeof value === 'number' && Number.isFinite(value) ? value : 0;

function planeOf(item, run, at) {
  const started = moment(run?.startedAt);
  return {
    id: String(item.id),
    ref: workItemRef(item),
    title: String(item.title ?? ''),
    href: `#work/${encodeURIComponent(item.id)}`,
    state: item.state,
    role: run?.role ?? '',
    round: run?.round ?? item.latestShift?.round ?? null,
    reads: run ? run.writes === false : false,
    seconds: started === null ? null : Math.max(0, Math.round((at - started) / 1000)),
    since: moment(item.updatedAt) ?? moment(item.createdAt),
    pullRequestUrl: item.pullRequestUrl || '',
    proposed: item.state === 'proposed',
  };
}

function trailTone(run) {
  if (run.outcome === 'failed') return runFailure(run)?.infra ? 'machine' : 'failed';
  return runOutcome(run.outcome)?.tone ?? 'neutral';
}

function remark(run) {
  if (run.state === 'running') return { text: 'Running', tone: 'live' };
  if (run.outcome === 'failed') { const failure = runFailure(run); return { text: failure?.infra ? 'Machine ended it' : (failure?.label ?? 'Failed'), tone: failure?.infra ? 'machine' : 'failed' }; }
  const outcome = runOutcome(run.outcome);
  return { text: outcome?.short ?? outcome?.label ?? 'Finished', tone: outcome?.tone ?? 'neutral' };
}

function laneTone(lane) {
  if (lane.holding.length || lane.refused) return 'attention';
  if (lane.approach.length) return 'review';
  if (lane.air.length) return 'live';
  if (lane.gate.length) return 'neutral';
  return 'quiet';
}

/**
 * The whole fleet as one view model: every Team the person can read as a lane, its Work Items placed from the gate
 * to landed, its last Runs as a contrail, its spend, and the departures and arrivals boards. Built only from a
 * `GET /api/ploeg/now` and a 24-hour `GET /api/ploeg/summary` response; nothing is estimated. A Team that has nothing
 * placed and flew no Run in 24 hours is parked. `missing` names what Ploeg could not list, so a short count says so.
 * @param {{ now: object|null, summary?: object|null, at?: number }} input
 * @returns {object}
 */
export function fleetModel({ now, summary = null, at = Date.now() } = {}) {
  const waiting = list(now?.waiting);
  const active = list(now?.active);
  const running = list(now?.running);
  const recent = list(now?.recent);
  const refused = list(now?.refused);
  const teamSummaries = new Map(list(summary?.teams).map(entry => [entry.team, entry]));
  const runFor = new Map();
  for (const run of running) if (!runFor.has(String(run.workItemId))) runFor.set(String(run.workItemId), run);
  const names = [...new Set([...list(now?.teams), ...teamSummaries.keys(), ...waiting.map(item => item.team), ...active.map(item => item.team), ...running.map(run => run.team), ...recent.map(run => run.team)].filter(Boolean))];

  const lanes = names.map(team => {
    const own = items => items.filter(item => item.team === team);
    const facts = teamSummaries.get(team) ?? null;
    const runs = recent.filter(run => run.team === team);
    const lane = {
      team,
      gate: [...own(active).filter(item => item.state === 'queued'), ...own(waiting).filter(item => item.state === 'proposed')].map(item => planeOf(item, null, at)),
      air: own(active).filter(item => item.state === 'leased').map(item => planeOf(item, runFor.get(String(item.id)), at)),
      holding: own(waiting).filter(item => item.state === 'needs_human').map(item => planeOf(item, null, at)),
      approach: own(waiting).filter(item => item.state === 'awaiting_review').map(item => planeOf(item, null, at)),
      refused: refused.filter(entry => entry.team === team).length,
      landed: facts ? { finished: amount(facts.runs?.finished), failed: amount(facts.runs?.failed), stuck: amount(facts.runs?.stuck) } : null,
      trail: runs.slice(0, trailLimit).reverse().map(run => ({ id: String(run.id), tone: trailTone(run), label: `${run.role || 'Run'}: ${remark(run).text}` })),
      spend: facts ? { settledUsd: amount(facts.spend?.settledUsd), reservedUsd: amount(facts.spend?.reservedUsd) } : null,
      lastActivityAt: moment(facts?.lastActivityAt) ?? moment(runs[0]?.finishedAt),
    };
    const flown = (lane.landed?.finished ?? 0) > 0 || runs.some(run => (moment(run.finishedAt) ?? 0) > at - day);
    lane.parked = !lane.gate.length && !lane.air.length && !lane.holding.length && !lane.approach.length && !lane.refused && !flown;
    lane.tone = laneTone(lane);
    return lane;
  });
  const weight = lane => lane.holding.length * 1000 + lane.approach.length * 100 + lane.air.length * 10 + lane.gate.length;
  lanes.sort((a, b) => Number(a.parked) - Number(b.parked) || weight(b) - weight(a) || (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0) || a.team.localeCompare(b.team));

  const sum = pick => lanes.reduce((total, lane) => total + pick(lane), 0);
  const totals = {
    teams: lanes.length,
    flying: lanes.filter(lane => !lane.parked).length,
    gate: sum(lane => lane.gate.length),
    air: sum(lane => lane.air.length),
    holding: sum(lane => lane.holding.length),
    approach: sum(lane => lane.approach.length),
    refused: refused.length,
    finished: summary ? sum(lane => lane.landed?.finished ?? 0) : null,
    failed: summary ? sum(lane => lane.landed?.failed ?? 0) : null,
    settledUsd: summary ? sum(lane => lane.spend?.settledUsd ?? 0) : null,
    reservedUsd: summary ? sum(lane => lane.spend?.reservedUsd ?? 0) : null,
    stuckHolds: summary?.unsettled?.count ?? 0,
  };

  const departures = [
    ...running.map(run => ({ id: `r${run.id}`, at: moment(run.startedAt), ref: runRef(run), workItemId: String(run.workItemId), title: run.workItemTitle, team: run.team, role: [run.role, `Round ${run.round || 1}`].filter(Boolean).join(' · '), remark: remark(run) })),
    ...active.filter(item => item.state === 'queued').map(item => ({ id: `q${item.id}`, at: moment(item.createdAt), ref: workItemRef(item), workItemId: String(item.id), title: item.title, team: item.team, role: '', remark: { text: 'Queued', tone: 'neutral' } })),
  ].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).slice(0, boardLimit);
  const arrivals = recent.slice(0, boardLimit).map(run => ({ id: `f${run.id}`, at: moment(run.finishedAt), ref: runRef(run), workItemId: String(run.workItemId), title: run.workItemTitle, team: run.team, role: run.role, remark: remark(run) }));

  const missing = [
    ...['waiting', 'active', 'running', 'recent', 'refused'].filter(group => now?.errors?.[group]),
    ...(summary ? [] : ['summary']),
  ];
  return { at, demo: Boolean(now?.demo), lanes, totals, departures, arrivals, missing };
}

/**
 * One sentence over the whole fleet, the board's headline: what holds, what is on approach and what flies.
 * @param {object} model A `fleetModel` result.
 * @returns {string}
 */
export function fleetHeadline(model) {
  const { holding, approach, air, gate, flying, teams } = model.totals;
  if (!teams) return 'No Team is in the sky yet.';
  const parts = [
    holding ? `${holding} holding for you` : '',
    approach ? `${approach} on approach to your review` : '',
    air ? `${air} in the air` : '',
    gate ? `${gate} at the gate` : '',
  ].filter(Boolean);
  const fleet = flying === teams ? `${plural(teams, 'Team')} flying` : `${flying} of ${plural(teams, 'Team')} flying`;
  if (!parts.length) return `Clear skies. ${fleet}, nothing waits.`;
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return `${joined[0].toUpperCase()}${joined.slice(1)}. ${fleet}.`;
}

const markSvg = className => `<svg class="${className}" viewBox="-16 -16 32 32" aria-hidden="true" focusable="false">${plane(28, 'fb-mark')}</svg>`;

function totalsMarkup(model) {
  const t = model.totals;
  const entry = (label, value, { tone = '', detail = '', id }) => `<div class="${cx('fb-total', tone ? `fb-tone-${tone}` : '')}"${id ? ` id="${id}"` : ''}><dt>${escape(label)}</dt><dd><span class="fb-total-value num">${escape(value)}</span>${detail ? `<span class="fb-total-detail">${escape(detail)}</span>` : ''}</dd></div>`;
  const spend = t.settledUsd === null ? 'Not known' : money(t.settledUsd);
  const held = t.reservedUsd ? `${money(t.reservedUsd)} held` : 'nothing held';
  return `<dl class="fb-totals">${[
    entry('Holding', String(t.holding), { tone: t.holding ? 'attention' : '', detail: t.refused ? `${plural(t.refused, 'task')} refused at the gate` : 'needs you' }),
    entry('On approach', String(t.approach), { tone: t.approach ? 'review' : '', detail: 'your review' }),
    entry('In the air', String(t.air), { tone: t.air ? 'live' : '', detail: t.air ? 'agents working' : 'nothing working' }),
    entry('At the gate', String(t.gate), { detail: 'queued or proposed' }),
    entry('Landed · 24 h', t.finished === null ? '–' : String(t.finished), { detail: t.failed === null ? 'Not known' : t.failed ? `${t.failed} failed` : 'none failed' }),
    entry('Spend · 24 h', spend, { detail: t.stuckHolds ? `${held} · ${plural(t.stuckHolds, 'hold')} stuck` : held, tone: t.stuckHolds ? 'attention' : '' }),
  ].join('')}</dl>`;
}

function chip(entry, stage) {
  const sub = stage === 'air'
    ? [entry.role, entry.seconds === null ? 'between Runs' : span(entry.seconds)].filter(Boolean).join(' · ')
    : stage === 'gate' ? (entry.proposed ? 'proposed' : 'queued') : entry.round ? `Round ${entry.round}` : '';
  const label = `${entry.ref}: ${entry.title}`;
  return `<li class="fb-chip-item"><a class="${cx('fb-chip', `is-${stage}`, entry.reads ? 'is-reader' : '')}" href="${escape(entry.href)}" title="${escape(label)}">${markSvg('fb-chip-mark')}<span class="fb-chip-text"><span class="fb-chip-ref">${escape(entry.ref)}</span><span class="fb-chip-title">${escape(entry.title)}</span>${sub ? `<span class="fb-chip-sub">${escape(sub)}</span>` : ''}</span></a></li>`;
}

const moreHref = { gate: 'queued', air: 'leased', holding: 'needs_human', approach: 'awaiting_review' };

function stageCell(lane, stage) {
  const head = `<span class="fb-cell-label">${escape(stage.label)}</span>`;
  if (stage.id === 'landed') {
    const landed = lane.landed;
    const count = landed ? `<span class="fb-landed-count num">${landed.finished}</span><span class="fb-landed-note">${landed.finished ? `${landed.failed ? `${landed.failed} failed` : 'none failed'}${landed.stuck ? ` · ${landed.stuck} stuck` : ''}` : 'no Run'}</span>` : '<span class="fb-landed-note">Not known</span>';
    const tones = lane.trail.reduce((counts, tick) => ({ ...counts, [tick.tone]: (counts[tick.tone] ?? 0) + 1 }), {});
    const said = Object.entries(tones).map(([tone, n]) => `${n} ${{ success: 'changed something', neutral: 'without a change', attention: 'stuck', failed: 'failed', machine: 'ended by the machine', live: 'running', review: 'reviewed' }[tone] ?? tone}`).join(', ');
    const trail = lane.trail.length ? `<span class="fb-trail" role="img" aria-label="${escape(`Last ${plural(lane.trail.length, 'Run')}, oldest first: ${said}`)}">${lane.trail.map(tick => `<span class="${cx('fb-tick', `is-${tick.tone}`)}" title="${escape(tick.label)}"></span>`).join('')}</span>` : '';
    return `<li class="fb-cell is-landed">${head}<span class="fb-landed">${count}</span>${trail}</li>`;
  }
  const entries = lane[stage.id];
  const shown = entries.slice(0, stageLimit);
  const rest = entries.length - shown.length;
  const extra = stage.id === 'gate' && lane.refused ? `<p class="fb-refused">${escape(plural(lane.refused, 'task'))} refused</p>` : '';
  const lights = stage.id === 'approach' ? `<span class="${cx('fb-lights', entries.length ? 'is-on' : '')}" aria-hidden="true">${'<span class="fb-light"></span>'.repeat(5)}</span>` : '';
  const body = shown.length ? `<ul class="fb-chips">${shown.map(entry => chip(entry, stage.id)).join('')}</ul>` : `<span class="fb-empty">${stage.id === 'holding' ? 'Nothing holds' : stage.id === 'approach' ? 'Clear' : '–'}</span>`;
  const more = rest > 0 ? `<a class="fb-more" href="${escape(`#work?team=${encodeURIComponent(lane.team)}&lane=${moreHref[stage.id]}`)}">${escape(`${rest} more`)}</a>` : '';
  return `<li class="${cx('fb-cell', `is-${stage.id}`, entries.length || extra ? 'has-entries' : '')}">${head}${body}${more}${extra}${lights}</li>`;
}

function laneMarkup(lane, index, at) {
  const id = `fb-lane-${index}`;
  const last = lane.lastActivityAt === null ? 'no activity yet' : `active ${relative(lane.lastActivityAt, at)}`;
  const spend = lane.spend ? `${money(lane.spend.settledUsd)}${lane.spend.reservedUsd ? ` + ${money(lane.spend.reservedUsd)} held` : ''}` : '';
  const facts = [spend, last].filter(Boolean).map(fact => `<span>${escape(fact)}</span>`).join('');
  const path = '<svg class="fb-path" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="fb-path-line" d="M2 21 C 14 21, 22 6, 40 5 L 60 5 C 72 5, 80 19, 98 21"></path></svg>';
  return `<li class="${cx('fb-lane', `fb-tone-${lane.tone}`)}" aria-labelledby="${id}"><div class="fb-lane-head"><h3 class="fb-lane-name" id="${id}"><span class="fb-lane-dot" aria-hidden="true"></span>${escape(lane.team)}</h3><p class="fb-lane-facts">${facts}</p></div><div class="fb-lane-sky">${path}<ol class="fb-cells">${fleetStages.map(stage => stageCell(lane, stage)).join('')}</ol></div></li>`;
}

/**
 * The airspace: one lane per flying Team, the five places across it on a climbing glide path, a plane per Work Item
 * that links to its page, approach lights that run while a pull request waits, and the Team's last Runs as a
 * contrail. Parked Teams are one line under it.
 * @param {object} model A `fleetModel` result.
 * @returns {string}
 */
export function airspace(model) {
  const flying = model.lanes.filter(lane => !lane.parked);
  const parked = model.lanes.filter(lane => lane.parked);
  const header = `<div class="fb-columns" aria-hidden="true"><span class="fb-columns-team">Team</span>${fleetStages.map(stage => `<span title="${escape(stage.hint)}">${escape(stage.label)}</span>`).join('')}</div>`;
  const lanes = flying.length ? `<ol class="fb-lanes" aria-label="Teams in the sky">${flying.map((lane, index) => laneMarkup(lane, index, model.at)).join('')}</ol>` : '<p class="fb-clear">Every Team is parked. Nothing flew in the last 24 hours.</p>';
  const ground = parked.length ? `<p class="fb-parked">${markSvg('fb-parked-mark')}<span><strong>Parked</strong> ${parked.map(lane => `<span class="fb-parked-team">${escape(lane.team)}${lane.lastActivityAt === null ? '' : ` <span class="fb-parked-when">last active ${escape(relative(lane.lastActivityAt, model.at))}</span>`}</span>`).join('')}</span></p>` : '';
  return `<section class="fb-sky" aria-labelledby="fb-sky-title"><h2 class="fb-overline" id="fb-sky-title">Airspace</h2>${header}${lanes}${ground}</section>`;
}

function clock(at) {
  if (at === null) return '<span class="fb-clock is-empty">--:--</span>';
  const text = time(at);
  return `<time class="fb-clock" datetime="${escape(new Date(at).toISOString())}" title="${escape(dateTime(at))}"><span class="fb-flaps" aria-hidden="true">${[...text].map(char => `<span class="${cx('fb-flap', /\d/.test(char) ? '' : 'is-sep')}">${escape(char)}</span>`).join('')}</span><span class="sr-only">${escape(text)}</span></time>`;
}

/**
 * A flight information board, Departures or Arrivals, always on the night ground: time in flaps, Work Item, Team,
 * Role and a remark in its tone. Rows link to the Work Item.
 * @param {object[]} rows `departures` or `arrivals` of a `fleetModel` result.
 * @param {{ kind: 'departures'|'arrivals' }} options
 * @returns {string}
 */
export function flightBoard(rows, { kind }) {
  const title = kind === 'departures' ? 'Departures' : 'Arrivals';
  const note = kind === 'departures' ? 'Running now, then queued, oldest first' : 'Runs that finished, newest first';
  const id = `fb-board-${kind}`;
  const body = rows.length
    ? rows.map(row => `<tr><td class="fb-col-time">${clock(row.at)}</td><td class="fb-col-item"><a href="#work/${escape(encodeURIComponent(row.workItemId))}" class="fb-flight"><span class="fb-flight-ref">${escape(row.ref)}</span><span class="fb-flight-title">${escape(row.title)}</span></a></td><td class="fb-col-team"><span class="fb-team-name">${escape(row.team)}</span>${row.role ? `<span class="fb-team-role">${escape(row.role)}</span>` : ''}</td><td class="fb-col-remark"><span class="${cx('fb-remark', `is-${row.remark.tone}`)}">${escape(row.remark.text)}</span></td></tr>`).join('')
    : `<tr><td class="fb-board-empty" colspan="4">${kind === 'departures' ? 'No departures. Nothing runs or waits for a worker.' : 'No arrivals yet.'}</td></tr>`;
  return `<section class="fb-board" aria-labelledby="${id}"><header class="fb-board-head">${markSvg('fb-board-mark')}<h2 class="fb-board-title" id="${id}">${title}</h2><p class="fb-board-note">${escape(note)}</p></header><div class="fb-board-scroll" role="region" aria-labelledby="${id}" tabindex="0"><table class="fb-fids"><thead><tr><th scope="col">Time</th><th scope="col">Work Item</th><th scope="col">Team · Role</th><th scope="col">Remark</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}

const missingWords = { waiting: 'what waits on you', active: 'what runs and is queued', running: 'running Runs', recent: 'finished Runs', refused: 'refused tasks', summary: 'the 24-hour Team summary' };

/**
 * The fleet board: the headline and totals, the airspace with every Team, and the departures and arrivals boards.
 * The Now page shows it in place of the desk while the `now.fleet` Labs flag is on and the person picked Fleet.
 * @param {object} model A `fleetModel` result.
 * @returns {string}
 */
export function fleetBoard(model) {
  const missing = model.missing.length ? `<p class="fb-missing" role="status">Ploeg could not list ${escape(model.missing.map(group => missingWords[group] ?? group).join(', '))}. Counts that depend on it may be short.</p>` : '';
  const waits = model.totals.holding + model.totals.approach;
  const desk = waits ? `<button type="button" class="button secondary sm fb-desk" data-action="now-mode" data-id="desk">${escape(`${plural(waits, 'Work Item')} ${waits === 1 ? 'waits' : 'wait'} on you · Open the desk`)}</button>` : '';
  return `<article class="fb" data-live="fleet-board"><header class="fb-head"><div class="fb-head-text"><p class="fb-overline">Fleet</p><p class="fb-headline">${escape(fleetHeadline(model))}</p></div>${desk}</header>${model.demo ? demoNote() : ''}${missing}${totalsMarkup(model)}${airspace(model)}<div class="fb-boards">${flightBoard(model.departures, { kind: 'departures' })}${flightBoard(model.arrivals, { kind: 'arrivals' })}</div></article>`;
}
