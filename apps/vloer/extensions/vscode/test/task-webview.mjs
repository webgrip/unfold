import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const now = new Date().toISOString();
const ago = minutes => new Date(Date.now() - minutes * 60_000).toISOString();
const theme = `:root{--vscode-font-family:Inter,Arial,sans-serif;--vscode-font-size:13px;--vscode-foreground:#d8dee9;--vscode-editor-background:#171c24;--vscode-descriptionForeground:#98a6b8;--vscode-widget-border:#343e4e;--vscode-button-secondaryForeground:#d8dee9;--vscode-button-secondaryBackground:#303b4e;--vscode-button-secondaryHoverBackground:#3c4c63;--vscode-button-background:#d37145;--vscode-button-foreground:#fff;--vscode-button-hoverBackground:#bc6039;--vscode-focusBorder:#dd9565;--vscode-textLink-foreground:#e4a177;--vscode-errorForeground:#ef9393;--vscode-badge-background:#354252;--vscode-badge-foreground:#d8dee9;--vscode-testing-iconPassed:#82bd9c;--vscode-list-warningForeground:#e5b26c;--vscode-textBlockQuote-background:#202731;--vscode-textCodeBlock-background:#111620;--vscode-list-hoverBackground:#26313e;--vscode-editor-font-family:monospace;--vscode-charts-purple:#b180d7;--vscode-charts-orange:#d18616;--vscode-charts-red:#f14c4c;--vscode-terminal-ansiCyan:#2aa198;}`;
const unbreakable = `theme/de-vloer—[P1·impact-H·effort-M·time-days·unc-low]·researched-against-glide-development@1e40700${'x'.repeat(160)}`;
const description = `## Goal\n\nExplain how a Work Item becomes a pull request.\n\n${unbreakable}\n\n- [x] Read \`apps/ploeg/pkg/store/llm_accounts.go:303\` and \`${'apps/ploeg/pkg/store/'.repeat(6)}llm_accounts.go\`\n- [ ] Write the guide\n\n| Column | Another column | Third |\n|---|---|---|\n| ${'wide-cell-'.repeat(12)} | b | c |\n\nSee [the ADR](https://forgejo.example/webgrip/glide/src/branch/development/docs/adr/adr-0002.md) and <script>window.compromised=true</script> [bad](javascript:alert(1)).\n\n\`\`\`sh\nmise run verify && ${'echo very-long-command-line-without-breaks;'.repeat(4)}\n\`\`\``;
const teams = [{ id: 'bronze', assignee: 'bronze', queueDepth: 2, paused: false, roles: ['engineer', 'reviewer', 'tester', 'writer', 'analyst'] }, { id: 'copper', assignee: 'copper', queueDepth: 0, paused: true, roles: ['', 'builder', 'devops', 'operator', 'reviewer'] }, { id: 'silver', assignee: 'silver', queueDepth: 0, paused: false, roles: ['engineer', 'reviewer', 'tester'] }];
const view = (status = {}, task = {}, extra = {}) => ({
  kind: 'task',
  task: { key: 'task:k', sourceId: 'glide', provider: 'vikunja', id: '1505', identifier: '#1505', revision: 'a'.repeat(64), title: 'vloer: show one provisional total and a cost per role on a Work Item', description: '<p>raw</p>', descriptionMarkdown: description, url: 'https://vikunja.example/tasks/1505', status: 'open', repositoryId: 'ploeg', updatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), dueAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), priority: 3, labels: [{ name: 'ploeg', color: '1973ff' }, { name: 'docs', color: 'e8b100' }, { name: 'agent-ready', color: '4caf50' }, { name: 'theme/de-vloer', color: '9c27b0' }], assignees: [], ...task },
  source: { id: 'glide', name: 'Glide', provider: 'vikunja', handoff: true, executionOwner: 'ploeg' },
  repositoryName: 'Glide', host: 'vloer.example', loadedAt: now, session: { allowed: false }, preferredTeam: 'silver',
  status: { available: true, demo: false, handoff: { allowed: true }, teams, assignedTeams: [], workItems: [], fetchedAt: now, ...status },
  ...extra,
});
const workItem = (state, extra = {}) => ({ id: '42', team: 'bronze', state, attempts: 2, updatedAt: now, ...extra });
const shift = (extra = {}) => ({ id: '7', branch: 'glide/42-one-total', round: 2, budgetUsd: 5, spentUsd: 0.4, reservedUsd: 0, openedAt: ago(40), closedAt: null, closeReason: '', ...extra });
const run = (id, extra = {}) => ({ id, shiftId: '7', role: 'engineer', round: 1, writes: true, state: 'finished', startedAt: ago(38), finishedAt: ago(30), outcome: 'pr_opened', summary: '', stuckReason: '', links: [], findings: '', verdict: '', problem: '', solution: '', failureReason: null, authorizedUsd: 1, usage: { inputTokens: 41200, outputTokens: 5300, costUsd: 0.2141 }, costStatus: 'observed', ...extra });
const detail = (state, extra = {}) => ({
  item: { id: '42', title: 'vloer: show one provisional total and a cost per role on a Work Item', provider: 'vikunja', externalId: '1505', team: 'bronze', state, description: '', descriptionMarkdown: description, attempts: 2, target: { owner: 'webgrip', repo: 'glide' }, url: 'https://vikunja.example/tasks/1505', priority: 3, infraFailures: 0, createdAt: ago(90), updatedAt: ago(1), latestShift: null },
  shifts: [shift()], runs: [], checkpoints: [], events: [], fetchedAt: now, ...extra,
});
const reviewRuns = [
  run('100', { problem: 'The Work Item page showed three different totals and no cost per role, so nobody could tell what a Shift cost.', solution: `Show one provisional total from the Run card, marked as not settled, with a table of cost per role underneath. Touches \`${'apps/vloer/public/views/'.repeat(3)}work.js\`.` }),
  run('101', { role: 'reviewer', writes: false, startedAt: ago(29), finishedAt: ago(25), outcome: 'no_change_needed', verdict: 'request_changes', usage: { inputTokens: 18000, outputTokens: 900, costUsd: 0.051 } }),
  run('102', { round: 2, startedAt: ago(24), finishedAt: ago(22), outcome: 'failed', failureReason: 'infra_node', usage: null, costStatus: 'unknown' }),
  run('103', { round: 2, startedAt: ago(21), finishedAt: ago(15), outcome: 'pr_updated' }),
  run('104', { role: 'reviewer', writes: false, round: 2, startedAt: ago(14), finishedAt: ago(10), outcome: 'no_change_needed', verdict: 'approve', usage: { inputTokens: 16000, outputTokens: 700, costUsd: 0.044 } }),
];
const crew = [{ role: 'engineer', writes: true, runs: 3, costUsd: 0.4282, inputTokens: 82400, outputTokens: 10600 }, { role: '', writes: null, runs: 1 }, { role: 'reviewer', writes: false, runs: 2, costUsd: 0.095, inputTokens: 34000, outputTokens: 1600 }];
const card = (extra = {}) => ({ workItemId: '42', state: 'in_review', crew, plays: [], totals: { costStatus: 'observed', usageComplete: true, costUsd: 0.5232, authorizedUsd: 5, runs: 5, failedRuns: 1, rounds: 2, shifts: 1 }, live: null, demo: false, ...extra });
const play = { number: 77, url: 'https://forgejo.example/webgrip/glide/pulls/77', state: 'open', branch: 'glide/42-one-total', mergedAt: null, additions: 214, deletions: 37, changedFiles: 6, ci: { state: 'success', checks: [{ context: 'verify', state: 'success' }] }, reviews: [] };

const files = { '/task.js': 'task.js', '/task.css': 'task.css', '/session.css': 'session.css', '/tokens.css': 'tokens.css', '/common.js': 'common.js', '/core/states.js': 'core/states.js', '/core/format.js': 'core/format.js', '/core/reasons.js': 'core/reasons.js' };
const surface = createServer(async (request, response) => {
  const file = files[request.url ?? ''];
  if (file) {
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/css');
    response.end(await readFile(new URL(`../media/${file}`, import.meta.url)));
  } else if (request.url === '/theme.css') {
    response.setHeader('Content-Type', 'text/css'); response.end(theme);
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; script-src 'nonce-vloer-browser-test'; connect-src 'none'; base-uri 'none'; form-action 'none'"><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/session.css"><link rel="stylesheet" href="/task.css"></head><body data-task-key="glide:1505"><main id="app"></main><div id="announcement" class="sr-only" role="status" aria-live="polite"></div><script nonce="vloer-browser-test" src="/common.js"></script><script type="module" nonce="vloer-browser-test" src="/task.js"></script></body></html>`);
  }
});
await new Promise(resolve => surface.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.VLOER_CHROMIUM_BIN ? { executablePath: process.env.VLOER_CHROMIUM_BIN, args: ['--no-sandbox', '--no-zygote', '--single-process', '--disable-dev-shm-usage', '--disable-gpu'] } : {}) });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    window.messages = [];
    window.violations = [];
    document.addEventListener('securitypolicyviolation', event => window.violations.push(`${event.violatedDirective} ${event.blockedURI}`));
    window.acquireVsCodeApi = () => ({ getState: () => ({}), setState: state => { window.savedState = state; }, postMessage: message => { window.messages.push(message); } });
  });
  const post = value => page.evaluate(value => new Promise(resolve => { window.postMessage(value, '*'); setTimeout(resolve, 40); }), value);
  const lastMessage = async () => (await page.evaluate(() => window.messages)).at(-1);
  const noOverflow = async label => {
    const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    assert.ok(scrollWidth <= innerWidth, `${label} must not overflow horizontally (${scrollWidth} > ${innerWidth})`);
  };
  const screenshots = new URL('../.screenshots/', import.meta.url);
  await mkdir(screenshots, { recursive: true });
  const taken = [];
  const both = async (name, ready) => {
    for (const [width, suffix] of [[1000, 'desktop'], [420, 'narrow']]) {
      await page.setViewportSize({ width, height: 900 });
      await ready();
      await noOverflow(`${name} at ${width}px`);
      const file = `task-${name}-${suffix}.png`;
      await page.screenshot({ path: new URL(file, screenshots).pathname, fullPage: true });
      taken.push(file);
    }
    await page.setViewportSize({ width: 1000, height: 900 });
  };

  await page.goto(`http://127.0.0.1:${surface.address().port}`);
  assert.equal((await lastMessage()).type, 'ready', 'the module webview loads its core imports under the nonce-only CSP and says ready');
  await page.getByText('Loading…').waitFor();

  await post({ type: 'state', view: view() });
  await page.getByRole('heading', { name: 'vloer: show one provisional total and a cost per role on a Work Item', level: 1 }).waitFor();
  await page.getByRole('heading', { name: 'Not with Ploeg yet.', level: 2 }).waitFor();
  assert.equal(await page.locator('#app img, #app script, #app a').count(), 0, 'tracker text never becomes markup, anchors or scripts');
  assert.equal(await page.evaluate(() => window.compromised), undefined);
  assert.equal(await page.getByRole('radio', { name: /silver/ }).isChecked(), true, 'the team used last time is preselected');
  assert.equal(await page.locator('.label .swatch').first().evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(25, 115, 255)', 'label colours apply under the strict CSP');
  assert.match(await page.locator('.team-option', { hasText: 'copper' }).innerText(), /builder → devops → operator → reviewer\s+Nothing queued/, 'empty roles are dropped and the queue reads in words');
  assert.equal(await page.locator('#announcement').textContent(), 'Not with Ploeg yet.', 'the state is announced to screen readers');
  const toolbar = await page.getByRole('button', { name: 'Open in Vikunja ↗' }).boundingBox();
  assert.ok(toolbar && toolbar.x + toolbar.width <= 1000, 'the header toolbar stays inside the panel');
  await both('untouched', () => page.getByRole('heading', { name: 'Not with Ploeg yet.' }).waitFor());

  await page.getByRole('radio', { name: /bronze/ }).check();
  await page.getByRole('button', { name: 'Hand to bronze' }).click();
  assert.deepEqual(await lastMessage(), { type: 'handoff', team: 'bronze' });
  await page.getByRole('button', { name: 'Handing over…' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Handing over…' }).isDisabled(), true, 'a hand-off in flight cannot be submitted twice');

  await post({ type: 'state', view: view({ assignedTeams: ['bronze'] }, { assignees: [{ username: 'bronze' }] }) });
  await page.getByRole('heading', { name: 'Assigned to bronze. Waiting for Ploeg to queue it…', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Take back from bronze' }).waitFor();

  const running = view({ assignedTeams: ['bronze'], workItems: [workItem('leased', { spentUsd: 0, budgetUsd: 5 })] }, { assignees: [{ username: 'bronze' }] }, { workItemId: '42', detail: detail('leased', { runs: [reviewRuns[0], reviewRuns[1], run('105', { round: 2, state: 'running', startedAt: ago(3), finishedAt: null, outcome: null, usage: null, costStatus: 'unknown' })] }), card: card({ state: 'drafting', live: { runningRuns: 1, observedAt: now, runSeconds: 820, usageComplete: true, costUsd: 0.3112 }, totals: { costStatus: 'observed', usageComplete: true, costUsd: 0.2651, runs: 3, failedRuns: 0, rounds: 2, shifts: 1 } }) });
  await post({ type: 'state', view: running });
  await page.getByRole('heading', { name: 'Team bronze is working on it.', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Take back/ }).count(), 0, 'started work is cancelled from Ploeg, not taken back');
  assert.match((await page.locator('.stat', { hasText: 'Cost' }).innerText()).replace(/\s+/g, ' '), /US\$ 0,31 so far · 1 Run running/, 'a running Work Item shows its live cost so far');
  assert.doesNotMatch(await page.locator('#app').innerText(), /\$0\.00|US\$\s0,00/, 'unknown money never reads as zero');
  await both('running', () => page.getByRole('heading', { name: 'Team bronze is working on it.', exact: true }).waitFor());

  const review = view({ assignedTeams: ['bronze'], workItems: [workItem('awaiting_review', { prUrl: 'https://forgejo.example/webgrip/glide/pulls/77' })] }, { assignees: [{ username: 'bronze' }] }, { workItemId: '42', detail: detail('awaiting_review', { runs: reviewRuns, shifts: [shift({ closedAt: ago(9), closeReason: 'review_approved' })] }), card: card({ plays: [play, { ...play, number: 76, state: 'closed', url: 'https://forgejo.example/webgrip/glide/pulls/76', ci: { state: 'failure', checks: [{ context: 'lint', state: 'failure' }] }, reviews: [{ reviewer: 'ryan', state: 'changes_requested' }] }] }) });
  await post({ type: 'state', view: review });
  await page.getByRole('heading', { name: 'A pull request is waiting for your review.', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Problem → Solution' }).waitFor();
  await page.getByText('The agent’s own account: verify it against pull request #77.').waitFor();
  assert.equal(await page.locator('.crew tbody tr').count(), 2, 'the cost per role lists named roles only');
  assert.match((await page.locator('.stat', { hasText: 'Cost' }).innerText()).replace(/\s+/g, ' '), /US\$ 0,52 observed, not settled/);
  await page.getByText('Agent review: approve').first().waitFor();
  await page.getByText('Human reviews: Changes requested by ryan').waitFor();
  await page.getByRole('button', { name: /^Review pull request ↗/ }).click();
  assert.deepEqual(await lastMessage(), { type: 'open-url', url: 'https://forgejo.example/webgrip/glide/pulls/77' });
  await page.getByRole('link', { name: 'the ADR' }).focus();
  await page.keyboard.press('Enter');
  assert.equal((await lastMessage()).url, 'https://forgejo.example/webgrip/glide/src/branch/development/docs/adr/adr-0002.md', 'description links open through the host by keyboard too');
  await both('review', () => page.getByRole('heading', { name: 'A pull request is waiting for your review.', exact: true }).waitFor());

  const stuck = view({ assignedTeams: ['bronze'], workItems: [workItem('needs_human')] }, { assignees: [{ username: 'bronze' }] }, { workItemId: '42', detail: detail('needs_human', { shifts: [shift({ closedAt: ago(5), closeReason: 'run stuck: engineer round 2' })], runs: [reviewRuns[0], reviewRuns[1], run('106', { round: 2, outcome: 'stuck', stuckReason: `The task names ${'apps/ploeg/pkg/store/'.repeat(4)}llm_accounts.go:303 but the file does not have a cost-per-role query; I cannot tell which total is meant.` })] }), card: card({ totals: { costStatus: 'not_reported', usageComplete: null } }) });
  await post({ type: 'state', view: stuck });
  await page.locator('.reason-chip', { hasText: 'Agent is stuck' }).waitFor();
  await page.getByRole('heading', { name: 'The engineer reported that it cannot finish in Round 2 without a person.' }).waitFor();
  await page.getByText('Read the stuck reason on that Run. Usually the ticket needs clarifying or splitting.').waitFor();
  assert.match((await page.locator('.stat', { hasText: 'Cost' }).innerText()).replace(/\s+/g, ' '), /Not reported/);
  await both('needs-you', () => page.locator('.reason-chip').waitFor());

  await post({ type: 'problem', message: 'The workbench\'s Vikunja token cannot add assignees. An administrator must grant it.' });
  await page.getByRole('alert').getByText(/cannot add assignees/).waitFor();
  await post({ type: 'connection', connected: false });
  await page.getByText('Showing the last loaded state. Reconnect to the workbench to act on it.').waitFor();

  await post({ type: 'state', view: view({ available: false, message: 'Update the workbench server to see Ploeg status and hand tasks to Ploeg from here.', handoff: { allowed: false }, teams: [] }) });
  await page.getByRole('heading', { name: 'Update the workbench server to see Ploeg status and hand tasks to Ploeg from here.' }).waitFor();
  assert.equal(await page.getByRole('radio').count(), 0);

  const proposal = { kind: 'work', workItemId: '58', host: 'vloer.example', loadedAt: now, detail: detail('proposed', { item: { ...detail('proposed').item, id: '58', provider: 'ploeg', externalId: 'proposal-58', url: '', team: 'silver', title: 'Follow-up: split the Run card cost query out of llm_accounts.go', descriptionMarkdown: `Proposed by the reviewer in Round 2.\n\n${unbreakable}` }, shifts: [], runs: [] }) };
  await post({ type: 'state', view: proposal });
  await page.getByRole('heading', { name: 'Ploeg proposed this as follow-up work.' }).waitFor();
  assert.equal(await page.getByRole('radio').count(), 0, 'a Work Item panel never offers the hand-off');
  assert.equal(await page.getByRole('button', { name: /Hand to|Take back/ }).count(), 0);
  await page.getByRole('button', { name: 'Open in browser ↗' }).click();
  assert.deepEqual(await lastMessage(), { type: 'open-ploeg', id: '58', team: undefined });
  await both('work-item', () => page.getByRole('heading', { name: 'Ploeg proposed this as follow-up work.' }).waitFor());

  assert.deepEqual(await page.evaluate(() => window.violations), [], 'no Content Security Policy violation');
  assert.deepEqual(errors, []);
  console.log(`PASS: task view rendered as an ES module under a nonce-only CSP with no violations; tracker facts, labels with colours, inert hostile description, team choice without empty roles, hand-off in flight, waiting, running with live cost, review with pull requests, CI, human reviews, agent verdicts, cost per role, problem and solution, Runs by Round, needs-you reason, problem and offline notices, older server and a Work Item without a tracker task, all without horizontal overflow at 1000px and 420px. Screenshots: ${taken.join(', ')}. This is browser webview validation, not a VS Code Extension Host test.`);
} finally {
  await browser?.close();
  surface.close();
}
