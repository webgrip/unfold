/** The moment every fleet fixture is read at: 18 October 2026, 08:40 UTC. */
export const fleetAt = Date.parse('2026-10-18T08:40:00Z');

const ago = minutes => new Date(fleetAt - minutes * 60_000).toISOString();

const item = (id, team, state, title, { ref, minutes = 30, round = 1, pr = '' } = {}) => ({
  id: String(id), team, state, title, url: '', createdAt: ago(minutes + 40), updatedAt: ago(minutes),
  provider: ref ? 'vikunja' : 'manual', externalId: ref ? String(ref) : `manual-${id}`, priority: 0, attempts: round, infraFailures: 0,
  target: null, pullRequest: null, closeReason: null, latestShift: { round, closeReason: null, budgetUsd: 9.2, spentUsd: 0.34, reservedUsd: 0, closedAt: null }, spentUsd: 0.34, pullRequestUrl: pr,
});

let runIds = 900;
const run = (workItemId, team, title, ref, { role = 'builder', writes = true, state = 'finished', outcome = 'pr_opened', failure = '', minutes = 20, took = 600, round = 1, usd = 0.12 } = {}) => ({
  id: String(runIds++), workItemId: String(workItemId), workItemTitle: title, externalRef: ref ? `Vikunja #${ref}` : '', team, role, round, writes,
  state, outcome: state === 'running' ? '' : outcome, verdict: '', failureReason: failure,
  startedAt: ago(minutes + took / 60), finishedAt: state === 'running' ? null : ago(minutes), durationSeconds: state === 'running' ? null : took,
  authorizedUsd: 1, settledUsd: state === 'running' ? null : usd, observedUsd: null, reservedModels: [], usage: null,
});

const team = (name, { finished = 0, failed = 0, stuck = 0, settledUsd = 0, reservedUsd = 0, last = null } = {}) => ({
  team: name, workItems: { queued: 0, leased: 0, awaitingReview: 0, needsHuman: 0, proposed: 0, withdrawn: 0, done: 0, stale: 0 },
  runs: { pending: 0, running: 0, finished, failed, stuck }, spend: { settledUsd, reservedUsd }, lastActivityAt: last === null ? null : ago(last),
});

const summaryOf = (teams, unsettled = { count: 0, heldUsd: 0, accounts: [] }) => ({ demo: false, window: '24h', generatedAt: ago(0), teams, totals: null, unsettled, unsettledError: null, fetchedAt: ago(0) });

const nowOf = ({ teams, waiting = [], active = [], running = [], recent = [], refused = [], errors = {} }) => ({ demo: false, teams, waiting, active, refused, running, recent, runningTruncated: false, recentTruncated: false, truncatedStates: [], errors, fetchedAt: ago(0) });

const observability = 'docs: link observability.md to the agent observability RFC';

function today() {
  const recent = [
    run(232, 'bronze', observability, 2200, { role: 'reviewer', writes: false, outcome: 'no_change_needed', minutes: 11, took: 240, round: 2 }),
    run(232, 'bronze', observability, 2200, { role: 'reviewer', writes: false, outcome: 'failed', failure: 'infra_node', minutes: 14, took: 90, round: 2 }),
    run(232, 'bronze', observability, 2200, { role: 'shadow-reviewer', writes: false, outcome: 'no_change_needed', minutes: 15, took: 200, round: 2 }),
    run(232, 'bronze', observability, 2200, { role: 'reviewer', writes: false, outcome: 'failed', failure: 'infra_node', minutes: 16, took: 60, round: 2 }),
    run(232, 'bronze', observability, 2200, { minutes: 17, took: 1500 }),
    run(232, 'bronze', observability, 2200, { outcome: 'failed', failure: 'agent_error', minutes: 47, took: 300 }),
    run(240, 'copper', 'toolchain: plan the TypeScript 7 route off astro check', 2210, { outcome: 'stuck', minutes: 100, took: 1200 }),
    run(241, 'pewter', 'Pin the agent image digest in the runner chart', 2214, { outcome: 'failed', failure: 'timeout', minutes: 160, took: 1800 }),
  ];
  return {
    now: nowOf({
      teams: ['bronze', 'copper', 'pewter', 'silver', 'unfold'],
      waiting: [
        item(232, 'bronze', 'awaiting_review', observability, { ref: 2200, minutes: 11, round: 2, pr: 'https://forge.example.invalid/homelab-cluster/pulls/784' }),
        item(227, 'unfold', 'needs_human', 'Say how to run the unit tests in the README', { minutes: 12 * 60 }),
        item(192, 'unfold', 'needs_human', 'Say how to run the unit tests in the README', { minutes: 14 * 60 }),
      ],
      recent,
      refused: [{ provider: 'vikunja', externalId: '2025', externalScope: '10', team: 'unfold', title: 'ploeg: tell each Run which skills bear on its Work Item', labels: ['repo/ploeg'], code: 'label_unregistered', reason: '', allowedLabels: [], refusedAt: ago(4 * 1440), board: 'Glide', url: '', link: 'none' }],
    }),
    summary: summaryOf([
      team('bronze', { finished: 19, failed: 14, stuck: 1, settledUsd: 1.38, last: 61 }),
      team('copper', { finished: 9, stuck: 4, last: 100 }),
      team('pewter', { finished: 3, failed: 3, last: 160 }),
      team('silver', { last: 7 * 1440 + 560 }),
      team('unfold', { finished: 3, stuck: 3, settledUsd: 0.01, last: 13 * 60 }),
    ]),
  };
}

function rush() {
  const titles = ['Add a retry budget to the webhook relay', 'Show the delivery window on the order summary', 'Split the session store into read and write halves', 'Rename the Ask allowance meter', 'Cache the Team summary for 30 seconds', 'Drop the dead vloerUrl announce', 'Explain the 412 on conditional writes', 'Move the brand tokens into one file', 'Name browser errors with their flow', 'Keep the Work Item header inside a phone screen', 'Count machine-ended Runs as lost time', 'Pin Ploeg rc.27'];
  const active = [
    item(301, 'bronze', 'leased', titles[0], { ref: 2301, minutes: 6 }),
    item(302, 'bronze', 'leased', titles[1], { ref: 2302, minutes: 3, round: 2 }),
    item(303, 'copper', 'leased', titles[2], { ref: 2303, minutes: 9 }),
    item(304, 'pewter', 'leased', titles[3], { ref: 2304, minutes: 1 }),
    item(305, 'bronze', 'queued', titles[4], { ref: 2305, minutes: 2 }),
    item(306, 'bronze', 'queued', titles[5], { ref: 2306, minutes: 1 }),
    item(307, 'copper', 'queued', titles[6], { ref: 2307, minutes: 4 }),
    item(308, 'bronze', 'leased', titles[7], { ref: 2308, minutes: 12 }),
    item(309, 'bronze', 'leased', titles[8], { ref: 2309, minutes: 14 }),
    item(310, 'bronze', 'leased', titles[9], { ref: 2310, minutes: 18 }),
  ];
  const running = [
    run(301, 'bronze', titles[0], 2301, { state: 'running', minutes: 0, took: 360 }),
    run(302, 'bronze', titles[1], 2302, { role: 'reviewer', writes: false, state: 'running', minutes: 0, took: 120, round: 2 }),
    run(303, 'copper', titles[2], 2303, { state: 'running', minutes: 0, took: 540 }),
    run(304, 'pewter', titles[3], 2304, { state: 'running', minutes: 0, took: 45 }),
    run(308, 'bronze', titles[7], 2308, { state: 'running', minutes: 0, took: 720 }),
    run(310, 'bronze', titles[9], 2310, { role: 'reviewer', writes: false, state: 'running', minutes: 0, took: 1080, round: 3 }),
  ];
  const recent = [
    run(311, 'bronze', titles[10], 2311, { minutes: 4 }),
    run(312, 'copper', titles[11], 2312, { role: 'reviewer', writes: false, outcome: 'no_change_needed', minutes: 7 }),
    run(313, 'bronze', titles[10], 2311, { outcome: 'failed', failure: 'infra_node', minutes: 9 }),
    run(314, 'pewter', titles[3], 2304, { outcome: 'pr_updated', minutes: 22 }),
    run(315, 'bronze', titles[0], 2301, { outcome: 'follow_up_created', minutes: 31 }),
    run(316, 'unfold', titles[5], 2306, { outcome: 'stuck', minutes: 44 }),
    run(317, 'copper', titles[2], 2303, { outcome: 'failed', failure: 'budget', minutes: 58 }),
    run(318, 'bronze', titles[8], 2309, { minutes: 70 }),
    run(319, 'bronze', titles[9], 2310, { minutes: 90 }),
  ];
  return {
    now: nowOf({
      teams: ['bronze', 'copper', 'pewter', 'silver', 'unfold'],
      active, running, recent,
      waiting: [
        item(320, 'bronze', 'awaiting_review', titles[10], { ref: 2311, minutes: 4, pr: 'https://forge.example.invalid/unfold/pulls/431' }),
        item(321, 'copper', 'awaiting_review', titles[11], { ref: 2312, minutes: 7, round: 2, pr: 'https://forge.example.invalid/unfold/pulls/432' }),
        item(322, 'unfold', 'needs_human', titles[5], { ref: 2306, minutes: 44 }),
        item(323, 'pewter', 'proposed', 'Found while working: the runner chart pins no digest', { ref: 2313, minutes: 15 }),
      ],
    }),
    summary: summaryOf([
      team('bronze', { finished: 42, failed: 6, stuck: 1, settledUsd: 7.84, reservedUsd: 1.2, last: 0 }),
      team('copper', { finished: 17, failed: 2, settledUsd: 3.05, reservedUsd: 0.4, last: 1 }),
      team('pewter', { finished: 8, settledUsd: 0.92, reservedUsd: 0.25, last: 1 }),
      team('silver', {}),
      team('unfold', { finished: 5, stuck: 1, settledUsd: 0.31, last: 44 }),
    ], { count: 1, heldUsd: 0.25, accounts: [] }),
  };
}

function clear() {
  return {
    now: nowOf({ teams: ['bronze', 'silver'] }),
    summary: summaryOf([team('bronze', { last: 3 * 1440 }), team('silver', {})]),
  };
}

function partial() {
  const base = today();
  return { now: { ...base.now, recent: [], errors: { recent: 'Ploeg could not be reached.' } }, summary: null };
}

/** The fleet board fixtures: today as it ran, a rush hour across four Teams, clear skies, and Ploeg half answering. */
export const fleetScenarios = Object.freeze({ today, rush, clear, partial });
