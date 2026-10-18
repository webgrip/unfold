import { icon } from '../../core/icons.js';
import { escape } from '../../core/dom.js';
import { runHealth, runHealthMarkup, runHealthReason } from '../../core/run-health.js';
import { fixtureNow } from '../fixtures.js';
import { meta, modelOf } from './shared.js';

const running = '<span class="badge sm" data-tone="live"><span class="live-dot" aria-hidden="true"></span>Running</span>';

function row(health, { role = 'Builder', time = '17 min', cost = 'US$ 0,08' } = {}) {
  if (!health) return '<p class="meta">No Run is running, so no Run has a health.</p>';
  return `<div class="work-detail"><div class="work-runs"><details class="work-run" open data-tone="live"><summary><span class="work-run-lead" aria-hidden="true"><span class="live-dot" aria-hidden="true"></span></span><span class="work-run-name"><strong>${escape(role)}</strong><span class="meta">writer · attempt 2</span></span><span class="work-run-badges">${running}${runHealthMarkup(health)}</span><span class="work-run-numbers meta"><span class="num">${escape(time)}</span><span class="num">${escape(cost)}</span></span>${icon('chevron-down', 'work-run-chevron')}</summary><div class="work-run-body">${runHealthReason(health)}</div></details></div></div>`;
}

const at = minutes => new Date(fixtureNow + minutes * 60000).toISOString();
const plainRun = (startedMinutes, extra = {}) => ({ id: '1', state: 'running', startedAt: at(startedMinutes), authorizedUsd: 1, costStatus: 'observed', usage: { costUsd: 0.02 }, ...extra });
const steadyItems = [{ type: 'tool', at: at(-1), title: 'Read brief', toolKind: 'read', status: 'completed', input: 'BRIEF.md' }];

export default meta({ title: 'Live/Run health', render: ({ scenario }) => row(modelOf(scenario).health) });

export const OnTrack = {};
export const Watch = { args: { scenario: 'run305Watch' } };
export const OffTrack = { args: { scenario: 'run305OffTrack' } };
export const OffTrackByTripwire = { args: { scenario: 'hijacked' } };
export const RaisedByTheAiJudge = { args: { scenario: 'judgeRaises' } };
export const NotJudgedYet = { render: () => row(runHealth({ run: plainRun(-2), transcript: { state: 'loaded', items: steadyItems }, now: fixtureNow }), { time: '2 min', cost: 'US$ 0,02' }) };
export const NotKnown = { render: () => row(runHealth({ run: plainRun(-12, { costStatus: 'unknown', usage: null }), transcript: { state: 'demo', items: [] }, now: fixtureNow }), { time: '12 min', cost: 'Demo' }) };
export const JudgePaused = { render: () => row(runHealth({ run: plainRun(-12), transcript: { state: 'loaded', items: steadyItems }, now: fixtureNow, judge: { refused: 'allowance' } }), { time: '12 min', cost: 'US$ 0,02' }) };
export const StaleTranscript = { args: { scenario: 'run305Watch' }, render: ({ scenario }) => {
  const model = modelOf(scenario);
  const run = { id: '305', state: 'running', startedAt: '2026-10-17T08:34:05Z', authorizedUsd: 1, costStatus: 'observed', usage: { costUsd: 0.19 }, limits: { promptSeconds: 5400, idleSeconds: 600, promptStartedAt: '2026-10-17T08:34:05Z' } };
  const items = model.moves.flatMap(move => move.calls).map(call => ({ type: 'tool', at: new Date(call.at).toISOString(), status: call.status, input: call.input }));
  return row(runHealth({ run, transcript: { state: 'loaded', items, asOf: Date.parse('2026-10-17T09:15:00Z') }, now: model.now }), { time: '43 min', cost: 'US$ 0,19' });
} };
