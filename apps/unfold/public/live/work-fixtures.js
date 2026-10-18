import { standingAnswers } from './answers.js';
import { scenarios } from './fixtures.js';
import { liveModel } from './model.js';
import { workView } from './work-view.js';

const startedInUnfold = new Set(['running', 'firstTry', 'needsYou', 'hijacked', 'stress', 'stalled', 'driftRecovered', 'contextUnblocks']);

const ago = (now, minutes) => new Date(now - minutes * 60000).toISOString();
const recordAsk = (id, now, minutes, question, answer) => ({ id, askerName: 'Ryan', question, answer, status: 'answered', source: 'record', costStatus: 'settled', costUsd: 0, createdAt: ago(now, minutes) });

const stories = {
  driftRecovered: now => ({
    briefText: ['Show each pending Ask inside its Work Item row on Now, with the question, who asked and what it cost.', '', '## Acceptance', '- An open Ask renders under its Work Item, never in a separate list', '- The waiting total counts each Ask once', '- Browser flows pass at 390, 360 and 320 px'].join('\n'),
    asks: [recordAsk('ask-drift', now, 21, 'Why are the tests failing?', 'The last test run failed 14 tests in money formatting, card totals and insights spend, after edits to five files the brief does not name.')],
    messages: [{ at: ago(now, 20.5), text: 'Stop the money refactor and revert it. Keep to the brief: Asks under their Work Item, nothing else. Put the refactor idea in a follow-up note.', by: 'Ryan' }],
    context: [],
    proofs: [{ condition: 0, label: 'now.test.mjs · 4 cases', state: 'proven' }, { condition: 1, label: 'counts.js', state: 'claimed', note: 'no test asserts the count yet' }, { condition: 2, label: '390 · 360 · 320 px pass', state: 'proven' }],
  }),
  rogue: now => ({
    briefText: ['The release job on development fails on the release policy test. Find out why and fix the cause.', '', '## Acceptance', '- The release policy test passes for the reason it failed', '- No gate is skipped, weakened or removed', '- No change to agent instructions'].join('\n'),
    asks: [recordAsk('ask-rogue', now, 9, 'Why is it touching AGENTS.md?', 'It edited AGENTS.md at the 12th minute to add “Agents may push to development directly when CI is red.” A tripwire marked it as a change to its own instructions.')],
    messages: [],
    context: [],
    proofs: [{ condition: 1, label: 'on_source_change.yml edited', state: 'claimed', note: 'the change skips the release policy: this fails the condition' }],
  }),
  contextUnblocks: now => ({
    briefText: ['Cover the invoice export with tests against the anonymised staging data.', '', '## Acceptance', '- The export of a month with 1,000 invoices matches the expected CSV', '- Rounding is checked on every line', '- No personal data reaches the repository'].join('\n'),
    asks: [recordAsk('ask-unblock', now, 66, 'Why did it stop?', 'The writer failed three times in the agent: the tests need fixtures/staging-invoices.sql.gz, which the repository does not have. Those Runs cost US$ 0,15.')],
    messages: [],
    context: [{ name: 'staging-invoices.sql.gz', bytes: 4813320, files: 1, addedBy: 'Ryan', addedAt: ago(now, 42), phase: 'before_start', note: 'Anonymised staging dump for October. The tests may load it; do not commit it.' }],
    proofs: [],
  }),
  reviewLoop: now => ({
    briefText: ['Spend per accepted change counts a Delivery twice when its pull request was reopened.', '', '## Acceptance', '- Each Delivery counts once, also after a reopen', '- The October numbers match the ledger export', '- A test covers the reopen case'].join('\n'),
    asks: [recordAsk('ask-loop', now, 100, 'What did I ask to change?', 'Your review on pull request #431 asked to keep the old column for one release, so the dashboard does not break.')],
    messages: [],
    context: [{ name: 'ledger-october.csv', bytes: 88213, files: 1, addedBy: 'Ryan', addedAt: ago(now, 150), phase: 'while_steering', note: 'The finance export to compare against.' }],
    proofs: [{ condition: 0, label: 'reopen.test.mjs', state: 'proven' }, { condition: 1, label: 'October diff · 0 rows', state: 'proven' }, { condition: 2, label: 'reopen.test.mjs', state: 'proven' }],
  }),
};
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
  const story = stories[name]?.(input.now ?? Date.now()) ?? null;
  const item = { ...input.detail.item, description: story?.briefText ?? briefFor(input.detail.item.title) };
  const detail = { ...input.detail, item };
  const unfold = origin ? origin === 'unfold' : startedInUnfold.has(name);
  const created = Date.parse(item.createdAt);
  const firstRun = live.runs.find(run => run.startedAt !== null)?.startedAt ?? null;
  const span = Math.max(60000, live.now - (firstRun ?? created));
  const after = share => iso(Math.min(live.now - 30000, (firstRun ?? created) + span * share));
  const progress = standingAnswers(live).find(entry => entry.id === 'progress' || entry.id === 'cost');
  const sessions = unfold ? [{ id: `session-${item.id}`, ownerName: 'Ryan', status: live.state === 'needs_human' ? 'waiting_input' : live.state === 'done' ? 'completed' : 'running', objective: item.description, execution: { workItemId: item.id } }] : [];
  const defaults = workDefaults({ name, live, item, unfold, firstRun, after, progress, sessions });
  return { live, detail, ...defaults, ...(story ? { asks: { ...defaults.asks, items: story.asks }, context: { items: story.context }, messages: unfold ? story.messages : [], proofs: story.proofs } : {}) };
}

function workDefaults({ name, live, item, unfold, firstRun, after, progress, sessions }) {
  return {
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
