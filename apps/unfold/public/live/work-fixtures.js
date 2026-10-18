import { standingAnswers } from './answers.js';
import { scenarios } from './fixtures.js';
import { liveModel } from './model.js';
import { workView } from './work-view.js';

const startedInUnfold = new Set(['running', 'firstTry', 'needsYou', 'hijacked', 'stress', 'stalled']);
const iso = ms => new Date(ms).toISOString();

function briefFor(title) {
  return [
    `${title}.`,
    '',
    'The job runs past the shared runner’s sixty-minute limit about once a day and blocks every merge behind it. Find where the time goes and bring it back under the limit without dropping a test.',
    '',
    '## Acceptance',
    '- The job finishes inside 60 minutes on the shared runner, three runs in a row',
    '- No test is skipped, deleted or marked flaky to get there',
    '- The profile that shows where the time went is attached to the pull request',
  ].join('\n');
}

function proofsFor(state) {
  if (state === 'awaiting_review' || state === 'done') return [
    { condition: 0, label: 'CI run 4411 · 41 min', state: 'proven' }, { condition: 0, label: 'CI run 4412 · 43 min', state: 'proven' }, { condition: 0, label: 'CI run 4415 · 39 min', state: 'proven' },
    { condition: 1, label: 'test count 412 → 412', state: 'proven' },
    { condition: 2, label: 'profile.txt on the pull request', state: 'proven' },
  ];
  if (state === 'leased') return [
    { condition: 0, label: 'CI run 4411 · 41 min', state: 'running', note: '1 of 3 runs' },
    { condition: 1, label: 'test count 412 → 412', state: 'claimed', note: 'the writer says so; no check covers it yet' },
  ];
  return [];
}

/**
 * The `workView` inputs for one live fixture scenario, with illustrative work around it: a brief with acceptance
 * conditions, one Ask answered from the record, one context file, steering and a linked session where the scenario
 * started in Unfold, and proof for the acceptance conditions. Proof is proposed: Ploeg does not report it yet.
 * @param {string} name A scenario name from `fixtures.js`.
 * @param {{ origin?: 'unfold'|'tracker' }} [options] Overrides where the Work Item came from.
 * @returns {object}
 */
export function workInputOf(name, { origin } = {}) {
  const input = scenarios[name].input();
  const live = liveModel(input);
  const item = { ...input.detail.item, description: briefFor(input.detail.item.title) };
  const detail = { ...input.detail, item };
  const unfold = origin ? origin === 'unfold' : startedInUnfold.has(name);
  const created = Date.parse(item.createdAt);
  const firstRun = live.runs.find(run => run.startedAt !== null)?.startedAt ?? null;
  const span = Math.max(60000, live.now - (firstRun ?? created));
  const after = share => iso(Math.min(live.now - 30000, (firstRun ?? created) + span * share));
  const progress = standingAnswers(live).find(entry => entry.id === 'progress' || entry.id === 'cost');
  const sessions = unfold ? [{ id: `session-${item.id}`, ownerName: 'Ryan', status: live.state === 'needs_human' ? 'waiting_input' : live.state === 'done' ? 'completed' : 'running', objective: item.description, execution: { workItemId: item.id } }] : [];
  return {
    live,
    detail,
    viewer: 'Ryan',
    sessions,
    asks: { items: live.runs.length ? [{ id: `ask-${item.id}`, askerName: 'Ryan', question: 'Is it getting anywhere?', answer: progress?.answer ?? 'Nothing has run yet.', status: 'answered', source: 'record', costStatus: 'settled', costUsd: 0, createdAt: after(0.97) }] : [], allowance: { remainingUsd: 4.86, limitUsd: 5, askBudgetUsd: 0.05, asksEnabled: true, resetAt: '2026-11-01T00:00:00Z' } },
    context: { items: firstRun ? [{ name: 'ci-timings.csv', bytes: 18234, files: 1, addedBy: 'Ryan', addedAt: after(0.3), phase: 'while_steering', note: 'The last ten runs of the job, slowest first.' }] : [] },
    messages: unfold && firstRun ? [{ at: after(0.4), text: 'Profile first. Do not skip or delete a test to get under the limit.', by: 'Ryan' }] : [],
    linked: { sessions: name === 'running' ? [{ id: 'linked-0f3c2a9b', ownerName: 'Ryan', harness: 'claude-code', state: 'active', branch: live.branch, commits: 2, lastSeenAt: after(0.9) }] : [] },
    proofs: proofsFor(live.state),
  };
}

/** The `workView` of one live fixture scenario; see `workInputOf`. */
export const workViewOf = (name, options) => workView(workInputOf(name, options));
