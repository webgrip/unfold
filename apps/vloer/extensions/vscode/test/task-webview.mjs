import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const now = new Date().toISOString();
const theme = `:root{--vscode-font-family:Inter,Arial,sans-serif;--vscode-font-size:13px;--vscode-foreground:#d8dee9;--vscode-editor-background:#171c24;--vscode-descriptionForeground:#98a6b8;--vscode-widget-border:#343e4e;--vscode-button-secondaryForeground:#d8dee9;--vscode-button-secondaryBackground:#303b4e;--vscode-button-secondaryHoverBackground:#3c4c63;--vscode-button-background:#d37145;--vscode-button-foreground:#fff;--vscode-button-hoverBackground:#bc6039;--vscode-focusBorder:#dd9565;--vscode-textLink-foreground:#e4a177;--vscode-errorForeground:#ef9393;--vscode-badge-background:#354252;--vscode-badge-foreground:#d8dee9;--vscode-testing-iconPassed:#82bd9c;--vscode-list-warningForeground:#e5b26c;--vscode-textBlockQuote-background:#202731;--vscode-textCodeBlock-background:#111620;--vscode-list-hoverBackground:#26313e;--vscode-editor-font-family:monospace;}`;
const description = '## Goal\n\nExplain how a Work Item becomes a pull request.\n\n- [x] Read `managed-execution.md`\n- [ ] Write the guide\n\nSee [the ADR](https://forgejo.example/webgrip/glide/src/branch/development/docs/adr/adr-0002.md) and <script>window.compromised=true</script> [bad](javascript:alert(1)).\n\n```sh\nmise run verify\n```';
const view = (status = {}, task = {}) => ({
  task: { key: 'task:k', sourceId: 'glide', provider: 'vikunja', id: '1505', identifier: '#1505', revision: 'a'.repeat(64), title: 'docs: explain how a Work Item becomes a pull request', description: '<p>raw</p>', descriptionMarkdown: description, url: 'https://vikunja.example/tasks/1505', status: 'open', repositoryId: 'ploeg', updatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), priority: 3, labels: [{ name: 'ploeg', color: '1973ff' }, { name: 'docs', color: 'e8b100' }, { name: 'agent-ready', color: '4caf50' }], assignees: [], ...task },
  source: { id: 'glide', name: 'Glide', provider: 'vikunja', handoff: true, executionOwner: 'ploeg' },
  repositoryName: 'Glide', host: 'vloer.example', loadedAt: now, session: { allowed: false }, preferredTeam: 'silver',
  status: { available: true, demo: false, handoff: { allowed: true }, teams: [{ id: 'bronze', assignee: 'bronze', queueDepth: 2, paused: false, roles: ['engineer', 'reviewer', 'tester', 'writer', 'analyst'] }, { id: 'copper', assignee: 'copper', queueDepth: 0, paused: true, roles: ['engineer'] }, { id: 'silver', assignee: 'silver', queueDepth: 0, paused: false, roles: ['engineer', 'reviewer', 'tester'] }], assignedTeams: [], workItems: [], fetchedAt: now, ...status },
});

const surface = createServer(async (request, response) => {
  if (['/task.js', '/task.css', '/session.css', '/common.js'].includes(request.url ?? '')) {
    response.setHeader('Content-Type', request.url.endsWith('.js') ? 'text/javascript' : 'text/css');
    response.end(await readFile(new URL(`../media${request.url}`, import.meta.url)));
  } else if (request.url === '/theme.css') {
    response.setHeader('Content-Type', 'text/css'); response.end(theme);
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; script-src 'nonce-vloer-browser-test'; connect-src 'none'; base-uri 'none'; form-action 'none'"><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/session.css"><link rel="stylesheet" href="/task.css"></head><body data-task-key="glide:1505"><main id="app"></main><div id="announcement" class="sr-only" role="status" aria-live="polite"></div><script nonce="vloer-browser-test" src="/common.js"></script><script nonce="vloer-browser-test" src="/task.js"></script></body></html>`);
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
    window.acquireVsCodeApi = () => ({ getState: () => ({}), setState: state => { window.savedState = state; }, postMessage: message => { window.messages.push(message); } });
  });
  const post = value => page.evaluate(value => new Promise(resolve => { window.postMessage(value, '*'); setTimeout(resolve, 30); }), value);
  const lastMessage = async () => (await page.evaluate(() => window.messages)).at(-1);
  const noOverflow = async label => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${label} must not overflow horizontally`);
  const screenshots = new URL('../.screenshots/', import.meta.url);
  await mkdir(screenshots, { recursive: true });
  const shot = name => page.screenshot({ path: new URL(name, screenshots).pathname, fullPage: true });

  await page.goto(`http://127.0.0.1:${surface.address().port}`);
  assert.equal((await lastMessage()).type, 'ready');
  await page.getByText('Loading the task…').waitFor();
  await post({ type: 'state', view: view() });
  await page.getByRole('heading', { name: 'docs: explain how a Work Item becomes a pull request', level: 1 }).waitFor();
  await page.getByText('Not with Ploeg yet.', { exact: true }).waitFor();
  assert.equal(await page.locator('#app img, #app script, #app a').count(), 0, 'tracker text never becomes markup, anchors or scripts');
  assert.equal(await page.evaluate(() => window.compromised), undefined);
  assert.equal(await page.getByRole('radio', { name: /silver/ }).isChecked(), true, 'the team used last time is preselected');
  assert.equal(await page.locator('.label .swatch').first().evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(25, 115, 255)', 'label colours apply under the strict CSP');
  await noOverflow('task view');
  await shot('task-untouched.png');

  await page.getByRole('radio', { name: /bronze/ }).check();
  await page.getByRole('button', { name: 'Hand to bronze' }).click();
  assert.deepEqual(await lastMessage(), { type: 'handoff', team: 'bronze' });
  await page.getByRole('button', { name: 'Handing over…' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Handing over…' }).isDisabled(), true, 'a hand-off in flight cannot be submitted twice');

  await post({ type: 'state', view: view({ assignedTeams: ['bronze'] }, { assignees: [{ username: 'bronze' }] }) });
  await page.getByText('Assigned to bronze. Waiting for Ploeg to queue it…', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Take back from bronze' }).waitFor();

  await post({ type: 'state', view: view({ assignedTeams: ['bronze'], workItems: [{ id: '42', team: 'bronze', state: 'leased', attempts: 2, updatedAt: now, spentUsd: 0.4231, budgetUsd: 5 }] }, { assignees: [{ username: 'bronze' }] }) });
  await page.getByText('Team bronze is working on it.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Take back/ }).count(), 0, 'started work is cancelled from Ploeg, not taken back');
  await shot('task-in-execution.png');

  await post({ type: 'state', view: view({ assignedTeams: ['bronze'], workItems: [{ id: '42', team: 'bronze', state: 'awaiting_review', attempts: 2, updatedAt: now, prUrl: 'https://forgejo.example/webgrip/glide/pulls/77' }] }, { assignees: [{ username: 'bronze' }] }) });
  await page.getByText('A pull request is waiting for your review.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Review pull request ↗' }).click();
  assert.deepEqual(await lastMessage(), { type: 'open-url', url: 'https://forgejo.example/webgrip/glide/pulls/77' });
  await page.getByRole('link', { name: 'the ADR' }).focus();
  await page.keyboard.press('Enter');
  assert.equal((await lastMessage()).url, 'https://forgejo.example/webgrip/glide/src/branch/development/docs/adr/adr-0002.md', 'description links open through the host by keyboard too');
  await shot('task-review.png');

  await post({ type: 'problem', message: 'The workbench\'s Vikunja token cannot add assignees. An administrator must grant it.' });
  await page.getByRole('alert').getByText(/cannot add assignees/).waitFor();
  await post({ type: 'connection', connected: false });
  await page.getByText('Showing the last loaded state. Reconnect to the workbench to act on it.').waitFor();

  await post({ type: 'state', view: view({ available: false, message: 'Update the workbench server to see Ploeg status and hand tasks to Ploeg from here.', handoff: { allowed: false }, teams: [] }) });
  await page.getByText('Update the workbench server to see Ploeg status and hand tasks to Ploeg from here.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('radio').count(), 0);

  await page.setViewportSize({ width: 390, height: 900 });
  await post({ type: 'state', view: view() });
  await page.getByText('Not with Ploeg yet.', { exact: true }).waitFor();
  await noOverflow('narrow task view');
  await shot('task-narrow.png');
  assert.deepEqual(errors, []);
  console.log('PASS: task view rendered tracker facts, labels with colours under CSP, inert hostile description, team choice with remembered team, hand-off in flight, waiting, execution, review with PR link, keyboard links, problem and offline notices, older server, desktop and narrow layouts. This is browser webview validation, not a VS Code Extension Host test.');
} finally {
  await browser?.close();
  surface.close();
}
