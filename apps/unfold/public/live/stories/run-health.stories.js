import { icon } from '../../core/icons.js';
import { runHealthBadge, runHealthMarkup } from '../../ploeg.js';
import { fixtureNow, scenarios } from '../fixtures.js';
import { liveModel } from '../model.js';
import { nowLine } from '../layouts.js';
import { healthEntry, meta, modelOf } from './shared.js';

const running = '<span class="badge sm" data-tone="live"><span class="live-dot" aria-hidden="true"></span>Running</span>';

function view(model, options = {}) {
  const entry = healthEntry(model, options);
  if (!entry) return `${nowLine(model)}<p class="meta">No Run is running, so no Run has a health.</p>`;
  const run = { id: model.running.id, state: 'running' };
  const row = `<div class="work-detail"><div class="work-runs"><details class="work-run" open data-tone="live"><summary><span class="work-run-lead" aria-hidden="true"><span class="live-dot" aria-hidden="true"></span></span><span class="work-run-name"><strong>${model.running.role}</strong><span class="meta">writer</span></span><span class="work-run-badges">${running}${runHealthBadge(run, entry, model.now)}</span>${icon('chevron-down', 'work-run-chevron')}</summary><div class="work-run-body">${runHealthMarkup(run, entry, { now: model.now })}</div></details></div></div>`;
  return `${nowLine(model)}${row}`;
}

const startingRun = () => {
  const input = scenarios.firstTry.input();
  const runs = input.detail.runs.map(run => ({ ...run, startedAt: new Date(fixtureNow - 2 * 60000).toISOString(), limits: { ...run.limits, promptStartedAt: new Date(fixtureNow - 2 * 60000).toISOString() } }));
  return liveModel({ ...input, detail: { ...input.detail, runs } });
};

export default meta({ title: 'Live/Run health', scenario: 'firstTry', render: ({ scenario }) => view(modelOf(scenario)) });

export const OnTrack = {};
export const Watch = { args: { scenario: 'run305Watch' } };
export const OffTrack = { args: { scenario: 'run305OffTrack' } };
export const OffTrackByTripwire = { args: { scenario: 'hijacked' } };
export const RaisedByTheAiJudge = { args: { scenario: 'judgeRaises' } };
export const NotKnown = { args: { scenario: 'running' } };
export const NotJudgedYet = { render: () => view(startingRun()) };
export const JudgePaused = { args: { scenario: 'run305Watch' }, render: ({ scenario }) => view(modelOf(scenario), { judgeState: 'paused_allowance' }) };
export const Stale = { args: { scenario: 'run305Watch' }, render: ({ scenario }) => view(modelOf(scenario), { staleMinutes: 2 }) };
