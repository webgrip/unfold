/**
 * Fixed moments the live Work Item fixtures are built around. Every fixture is deterministic: the same scenario always
 * gives the same model.
 */
export const fixtureNow = Date.parse('2026-10-17T08:51:30Z');

const at = minutes => new Date(fixtureNow + minutes * 60000).toISOString();
const target = { forge: 'forgejo', owner: 'webgrip', repo: 'homelab-cluster', baseBranch: 'main' };
const empty = { truncated: { shifts: false, runs: false, checkpoints: false, events: false }, checkpoints: [], events: [] };

function item(extra = {}) {
  return { id: '190', provider: 'vikunja', externalId: '2049', revision: '2026-10-17T08:09:41Z', team: 'bronze', state: 'leased', title: 'ci: the Omnigraph and brain test job must finish inside the 60-minute runner limit', description: '', url: 'https://vikunja.example/tasks/2049', priority: 0, attempts: 1, infraFailures: 0, nextEligibleAt: null, createdAt: at(-41.8), updatedAt: at(-17.3), target, latestShift: null, lease: null, ...extra };
}

function shift(id, opened, extra = {}) {
  return { id, workItemId: '190', team: 'bronze', branch: 'agent/vik-2049', round: 1, budgetUsd: 1, spentUsd: 0, reservedUsd: 1, openedAt: at(opened), closedAt: null, closeReason: '', ...extra };
}

function run(id, shiftId, started, finished, extra = {}) {
  return { id, workItemId: '190', shiftId, team: 'bronze', role: 'builder', round: 1, writes: true, state: finished === null ? 'running' : 'finished', startedAt: at(started), finishedAt: finished === null ? null : at(finished), expiresAt: null, outcome: null, summary: '', stuckReason: '', links: [], findings: '', verdict: '', problem: '', solution: '', failureReason: null, authorizedUsd: 1, usage: null, costStatus: 'unknown', keyAlias: null, ...extra };
}

let seq = 0;
const tool = (minutes, title, toolKind, input, status = 'completed', paths = []) => ({ type: 'tool', key: `c${++seq}`, id: `call-${seq}`, at: at(minutes), title, toolKind, status, input, paths, outputs: [], clipped: false });
const thought = (minutes, text) => ({ type: 'thought', key: `e${++seq}`, at: at(minutes), text, clipped: false });
const stage = (minutes, text) => ({ type: 'stage', key: `e${++seq}`, at: at(minutes), text, clipped: false });

function vik2049Transcript() {
  seq = 0;
  const profile = Array.from({ length: 14 }, (_, index) => tool(-14.5 + index * 0.6, index % 3 === 0 ? 'Read profile config' : 'Run suite with profiler', index % 3 === 0 ? 'read' : 'execute', index % 3 === 0 ? 'scripts/conftest.py' : `cd /mnt/ci-shared/vik-2049 && python3 -m cProfile -o /tmp/prof-brain${index}.out -m pytest scripts/test_omnigraph_brain_eval.py -k part${index}`));
  return [
    stage(-17.2, 'Read the brief and the CI workflow'),
    tool(-17.1, 'Read brief', 'read', 'BRIEF.md'),
    tool(-16.8, 'Read CI workflow', 'read', '.forgejo/workflows/ci.yaml'),
    tool(-16.5, 'Find the omnigraph-tests job', 'search', 'omnigraph-tests'),
    tool(-16.1, 'Show commit 58a02c5f', 'execute', 'git show --stat 58a02c5f'),
    tool(-15.7, 'Read test module', 'read', 'scripts/test_omnigraph_brain_eval.py'),
    tool(-15.4, 'Read brain fixtures', 'read', 'scripts/fixtures/brain.json'),
    tool(-15.1, 'List test files', 'search', 'scripts/test_*.py'),
    tool(-14.8, 'Read runner limits', 'read', 'ops/runner/values.yaml'),
    stage(-14.6, 'Profile the Omnigraph and brain suites'),
    ...profile,
    stage(-5.5, 'Recover a hung profiling run'),
    thought(-5.4, '**Reasoning**: There’s something weird with the terminal and files with the profile output.'),
    tool(-5.3, 'Grep profile file', 'execute', 'grep -c . /tmp/prof-brain2.txt; echo "==="; grep -a "TOTAL" /tmp/prof-brain2.txt'),
    tool(-4.4, 'Summarise profile', 'execute', 'python3 -c "import pstats; pstats.Stats(\'/tmp/prof-brain2.out\').sort_stats(\'cumtime\').print_stats(20)"', 'failed'),
    thought(-1.6, '**Reasoning**: There’s a stuck process. The previous python3 -c command never returned.'),
    tool(-1.5, 'Interrupt stuck process', 'execute', 'C-c'),
    stage(-1.2, 'Read the profile'),
    tool(-1.0, 'Check profile output', 'execute', 'cd /mnt/ci-shared/vik-2049 && ls -la /tmp/prof-brain2.txt && tail -c 1500 /tmp/prof-brain2.txt'),
    thought(-0.7, '**Reasoning**: My profiling script’s shutdown hangs because server.shutdown() waits on serve_forever in the same thread.'),
    stage(-0.5, 'Find how the eval server starts'),
    tool(-0.4, 'List test classes', 'search', 'grep -nE "^class " scripts/test_omnigraph_brain_eval.py'),
    tool(-0.37, 'Find serve helper', 'search', 'grep -n "def serve\\|ThreadingHTTPServer\\|serve_forever\\|daemon" scripts/test_omnigraph_brain_eval.py | head'),
  ];
}

function vik2049Detail(extra = {}) {
  const machine = { failureReason: 'infra_node', outcome: 'failed', costStatus: 'observed', usage: { costUsd: 0 } };
  return {
    ...empty,
    item: item({ infraFailures: 5, lease: { renewedAt: at(-2.5), expiresAt: at(12.5) } }),
    shifts: [shift('165', -40, { closedAt: at(-18.2), closeReason: 'infra retries' }), shift('166', -17.5)],
    runs: [
      run('1', '165', -39.5, -37.5, machine), run('2', '165', -35.5, -31.5, machine), run('3', '165', -30.5, -26.5, machine),
      run('4', '165', -25.5, -21.5, machine), run('5', '165', -21, -20, machine),
      run('6', '165', -19.0, -18.2, { outcome: 'stuck', failureReason: 'lease_lost', costStatus: 'observed', usage: { costUsd: 0 } }),
      run('7', '166', -17.3, null, { costStatus: 'observed', usage: { inputTokens: 1900000, outputTokens: 35100, costUsd: 0.08 } }),
    ],
    ...extra,
  };
}

const steady = () => {
  seq = 0;
  return [
    stage(-6, 'Read the brief'), tool(-5.9, 'Read brief', 'read', 'BRIEF.md'), tool(-5.6, 'Read README', 'read', 'README.md'),
    stage(-5, 'Write the change'), tool(-4.8, 'Edit README', 'edit', 'README.md', 'completed', ['README.md']), tool(-3.9, 'Edit docs index', 'edit', 'docs/index.md', 'completed', ['docs/index.md']),
    tool(-3.1, 'Edit changelog', 'edit', 'CHANGELOG.md', 'completed', ['CHANGELOG.md']),
    stage(-2, 'Check the change'), tool(-1.8, 'Run docs check', 'execute', 'mise run docs-check'), tool(-0.3, 'Run tests', 'execute', 'npm test'),
  ];
};

const allowance = { leftUsd: 2, totalUsd: 2, resetsAt: '2026-11-01T00:00:00Z' };

/**
 * The scenarios every live Work Item story and test draws from. `input()` returns what `liveModel` takes.
 * @type {Record<string, { label: string, description: string, input: () => object }>}
 */
export const scenarios = {
  running: {
    label: 'VIK-2049, running after lost machines',
    description: 'The real case from 17 October 2026: five machines ended the Run, a sixth got stuck, the second attempt is profiling and recovering from a hung terminal.',
    input: () => ({ detail: vik2049Detail(), transcript: vik2049Transcript(), now: fixtureNow, ticketCreatedAt: '2026-10-14T06:10:00Z', allowance }),
  },
  firstTry: {
    label: 'First try, steady',
    description: 'One attempt, six minutes in, three files edited, checks running.',
    input: () => ({ detail: { ...empty, item: item({ lease: { renewedAt: at(-1), expiresAt: at(14) } }), shifts: [shift('170', -6.5)], runs: [run('1', '170', -6.2, null, { costStatus: 'observed', usage: { inputTokens: 210000, outputTokens: 8200, costUsd: 0.03 } })] }, transcript: steady(), now: fixtureNow, allowance }),
  },
  stalled: {
    label: 'Stalled: silent for seven minutes',
    description: 'The Run is still leased but has not made a call for seven minutes.',
    input: () => {
      const transcript = steady().map(entry => ({ ...entry, at: new Date(Date.parse(entry.at) - 7 * 60000).toISOString() }));
      return { detail: { ...empty, item: item({ lease: { renewedAt: at(-6), expiresAt: at(1) } }), shifts: [shift('171', -14)], runs: [run('1', '171', -13.5, null, { costStatus: 'observed', usage: { inputTokens: 480000, outputTokens: 12000, costUsd: 0.05 } })] }, transcript, now: fixtureNow, allowance };
    },
  },
  nearBudget: {
    label: 'Close to the budget',
    description: 'US$ 0,93 of US$ 1,00 spent on a long Run.',
    input: () => ({ detail: { ...empty, item: item({ createdAt: at(-52), lease: { renewedAt: at(-1), expiresAt: at(14) } }), shifts: [shift('172', -48)], runs: [run('1', '172', -47.5, null, { costStatus: 'observed', usage: { inputTokens: 8400000, outputTokens: 160000, costUsd: 0.93 } })] }, transcript: steady(), now: fixtureNow, allowance }),
  },
  review: {
    label: 'Ready for your review',
    description: 'The writer opened a pull request and the reviewer approved it.',
    input: () => ({ detail: { ...empty, item: item({ state: 'awaiting_review', createdAt: at(-70), pullRequest: { url: 'https://forgejo.example/webgrip/homelab-cluster/pulls/812', number: 812, mergeState: 'clean', baseBranch: 'main', headSha: 'a1b2c3d', checkedAt: at(-1) } }), shifts: [shift('173', -55)], runs: [
      run('1', '173', -54, -31, { outcome: 'pr_opened', costStatus: 'settled', usage: { inputTokens: 2300000, outputTokens: 41000, costUsd: 0.21 } }),
      run('2', '173', -30, -24, { role: 'reviewer', writes: false, verdict: 'approve', costStatus: 'settled', usage: { inputTokens: 600000, outputTokens: 9000, costUsd: 0.04 } }),
    ] }, now: fixtureNow, estimate: null, allowance }),
  },
  needsYou: {
    label: 'Needs you after agent failures',
    description: 'The harness failed three times; Ploeg stopped and asks a person.',
    input: () => ({ detail: { ...empty, item: item({ state: 'needs_human', attempts: 3, createdAt: at(-75) }), shifts: [shift('174', -60, { closedAt: at(-20), closeReason: 'agent attempts exhausted' })], runs: [
      run('1', '174', -59, -50, { failureReason: 'agent_error', outcome: 'failed', costStatus: 'settled', usage: { inputTokens: 300000, outputTokens: 4000, costUsd: 0.06 } }),
      run('2', '174', -45, -36, { failureReason: 'agent_error', outcome: 'failed', costStatus: 'settled', usage: { inputTokens: 310000, outputTokens: 4100, costUsd: 0.06 } }),
      run('3', '174', -30, -21, { failureReason: 'idle', outcome: 'failed', costStatus: 'settled', usage: { inputTokens: 280000, outputTokens: 3900, costUsd: 0.05 } }),
    ] }, now: fixtureNow, allowance }),
  },
  landed: {
    label: 'Landed',
    description: 'Merged after one fix round.',
    input: () => ({ detail: { ...empty, item: item({ state: 'done', createdAt: at(-200), pullRequest: { url: 'https://forgejo.example/webgrip/homelab-cluster/pulls/812', number: 812, mergeState: 'clean', baseBranch: 'main', headSha: 'a1b2c3d', checkedAt: at(-30) } }), shifts: [shift('175', -180, { closedAt: at(-60), closeReason: 'merged' })], runs: [
      run('1', '175', -179, -150, { outcome: 'pr_opened', costStatus: 'settled', usage: { inputTokens: 2100000, outputTokens: 40000, costUsd: 0.19 } }),
      run('2', '175', -149, -140, { role: 'reviewer', writes: false, verdict: 'request_changes', round: 2, costStatus: 'settled', usage: { inputTokens: 500000, outputTokens: 8000, costUsd: 0.04 } }),
      run('3', '175', -139, -120, { outcome: 'pr_updated', round: 3, costStatus: 'settled', usage: { inputTokens: 1200000, outputTokens: 20000, costUsd: 0.11 } }),
      run('4', '175', -119, -110, { role: 'reviewer', writes: false, verdict: 'approve', round: 4, costStatus: 'settled', usage: { inputTokens: 520000, outputTokens: 8100, costUsd: 0.04 } }),
    ] }, now: fixtureNow, allowance }),
  },
  queued: {
    label: 'Queued, no Run yet',
    description: 'Ploeg has the Work Item but no worker picked it up.',
    input: () => ({ detail: { ...empty, item: item({ state: 'queued', attempts: 0 }), shifts: [], runs: [] }, now: fixtureNow, ticketCreatedAt: '2026-10-14T06:10:00Z', allowance }),
  },
  unreported: {
    label: 'Usage not reported',
    description: 'A Run whose gateway reported neither cost nor tokens.',
    input: () => ({ detail: { ...empty, item: item({ lease: { renewedAt: at(-1), expiresAt: at(14) } }), shifts: [shift('176', -9)], runs: [run('1', '176', -8.5, null)] }, transcript: steady(), now: fixtureNow, allowance: null }),
  },
  stress: {
    label: 'Stress: three attempts, 40 Runs, 240 calls, long title',
    description: 'Checks the layout holds under far more than a normal Work Item has.',
    input: () => {
      seq = 0;
      const runs = Array.from({ length: 40 }, (_, index) => {
        const attempt = index < 15 ? '180' : index < 30 ? '181' : '182';
        const start = -200 + index * 4.8;
        const last = index === 39;
        return run(String(index + 1), attempt, start, last ? null : start + 3.9, last ? { costStatus: 'observed', usage: { inputTokens: 12000000, outputTokens: 230000, costUsd: 1.37 } } : index % 4 === 0 ? { failureReason: 'infra_llm', outcome: 'failed' } : { role: index % 2 ? 'reviewer' : 'builder', writes: index % 2 === 0, outcome: index % 2 ? null : 'pr_updated', costStatus: 'settled', usage: { inputTokens: 900000, outputTokens: 12000, costUsd: 0.07 } });
      });
      const transcript = Array.from({ length: 240 }, (_, index) => index % 30 === 0 ? stage(-12 + index * 0.045, `Step ${index / 30 + 1}: an unusually long stage name that keeps going to test how the move list wraps text on a phone`) : tool(-12 + index * 0.045, `Call ${index} with a long title that should wrap and not widen the page`, ['read', 'execute', 'edit', 'search'][index % 4], `echo ${'x'.repeat(index % 7 * 30)}`, index % 37 === 0 ? 'failed' : 'completed', index % 4 === 2 ? [`src/file-${index}.ts`] : []));
      return { detail: { ...empty, item: item({ createdAt: at(-205), title: 'feat(platform): make every long-running integration suite across the Omnigraph, brain, Ploeg dispatch and Unfold browser checks finish inside the shared runner’s sixty-minute job limit without dropping coverage', lease: { renewedAt: at(-1), expiresAt: at(14) }, infraFailures: 10 }), shifts: [shift('180', -201, { closedAt: at(-128), budgetUsd: 2 }), shift('181', -128, { closedAt: at(-56), budgetUsd: 2 }), shift('182', -56, { budgetUsd: 2 })], runs }, transcript, now: fixtureNow, ticketCreatedAt: '2026-09-01T08:00:00Z', estimate: { text: 'about 25 min (fixture estimate)', source: 'fixture' }, allowance };
    },
  },
};

const relabel = (input, id, externalId, title, extra = {}) => ({ ...input, detail: { ...input.detail, item: { ...input.detail.item, id, externalId, title, ...extra } } });

/**
 * A Work list for the fleet layout: the running VIK-2049 first, then Work Items in other states. The landed titles are
 * real bronze Work Items; their Runs come from the fixtures above.
 * @returns {object[]} `liveModel` inputs in list order.
 */
export function fleetInputs() {
  return [
    scenarios.running.input(),
    relabel(scenarios.review.input(), '201', '2061', 'ci: cache the Playwright browsers between runner jobs'),
    relabel(scenarios.needsYou.input(), '202', '2058', 'ops: rotate the Harbor robot token before it expires'),
    relabel(scenarios.landed.input(), '185', '1993', 'unfold: make the agent host grace-period test stable under load'),
    relabel(scenarios.landed.input(), '186', '1092', 'toolchain: plan the TypeScript 7 route off astro check onto the content mapper'),
  ];
}
