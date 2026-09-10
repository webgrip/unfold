import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { application, sessionUntil } from '../../../test/api-support.ts';
import { VloerClient } from '../src/client.ts';

const server = await application('demo', config => { config.taskSources = [{ id: 'demo-tasks', name: 'Demo tasks', provider: 'demo', baseUrl: 'https://example.invalid', project: 'demo', repositoryId: 'order-service', executionOwner: 'interactive' }]; });
const secrets = { async get() {}, async store() {}, async delete() {} };
const client = new VloerClient(server.url, secrets);
const task = await client.task('demo-tasks', '1');
const session = await client.importTask({ sourceId: task.sourceId, taskId: task.id, revision: task.revision, crewId: 'delivery', runtime: 'demo', budgetUsd: 3 });
await client.action(session.id, 'start');
await sessionUntil(server.url, session.id, value => ['completed', 'failed'].includes(value.status));
const freshness = () => ({ transport: 'live', observedAt: new Date().toISOString() });
const detail = { session: await client.session(session.id), events: await client.history(session.id), permissions: [], user: (await client.bootstrap()).user, mode: 'demo', origin: server.url, freshness: freshness() };
assert.equal(detail.session.status, 'completed', 'the demo fixture must complete before the panel is validated');
const theme = `:root{--vscode-font-family:Inter,Arial,sans-serif;--vscode-font-size:13px;--vscode-foreground:#d8dee9;--vscode-editor-background:#171c24;--vscode-descriptionForeground:#98a6b8;--vscode-widget-border:#343e4e;--vscode-button-secondaryForeground:#d8dee9;--vscode-button-secondaryBackground:#303b4e;--vscode-button-secondaryHoverBackground:#3c4c63;--vscode-button-background:#d37145;--vscode-button-foreground:#fff;--vscode-button-hoverBackground:#bc6039;--vscode-focusBorder:#dd9565;--vscode-textLink-foreground:#e4a177;--vscode-errorForeground:#ef9393;--vscode-badge-background:#354252;--vscode-badge-foreground:#d8dee9;--vscode-testing-iconPassed:#82bd9c;--vscode-list-warningForeground:#e5b26c;--vscode-textBlockQuote-background:#202731;--vscode-textCodeBlock-background:#111620;--vscode-list-hoverBackground:#26313e;--vscode-input-foreground:#d8dee9;--vscode-input-background:#202733;--vscode-input-border:#394558;--vscode-input-placeholderForeground:#8390a5;--vscode-scrollbarSlider-background:#303c4b;--vscode-progressBar-background:#d37145;--vscode-editor-font-family:monospace;}`;
const surface = createServer(async (request, response) => {
  if (request.url === '/session.js' || request.url === '/session.css') {
    response.setHeader('Content-Type', request.url.endsWith('.js') ? 'text/javascript' : 'text/css');
    response.end(await readFile(new URL(`../media${request.url}`, import.meta.url)));
  } else if (request.url === '/theme.css') {
    response.setHeader('Content-Type', 'text/css'); response.end(theme);
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; script-src 'nonce-vloer-browser-test'; connect-src 'none'; base-uri 'none'; form-action 'none'"><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/session.css"></head><body data-session-id="${session.id}"><main id="app"></main><div id="announcement" class="sr-only" role="status" aria-live="polite"></div><script nonce="vloer-browser-test" src="/session.js"></script></body></html>`);
  }
});
await new Promise(resolve => surface.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.VLOER_CHROMIUM_BIN ? { executablePath: process.env.VLOER_CHROMIUM_BIN, args: ['--no-sandbox', '--no-zygote', '--single-process', '--disable-dev-shm-usage', '--disable-gpu'] } : {}) });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.messages = [];
    window.acquireVsCodeApi = () => ({ getState: () => ({}), setState: state => { window.savedState = state; }, postMessage: message => { window.messages.push(message); } });
  });
  const post = value => page.evaluate(value => new Promise(resolve => { window.postMessage(value, '*'); setTimeout(resolve, 20); }), value);
  const send = () => post({ type: 'session', detail: { ...detail, freshness: freshness() } });
  const messages = () => page.evaluate(() => window.messages);
  const lastMessage = async () => (await messages()).at(-1);
  const noOverflow = async label => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${label} must not overflow horizontally`);
  const screenshots = new URL('../.screenshots/', import.meta.url);
  await mkdir(screenshots, { recursive: true });
  const shot = name => page.screenshot({ path: new URL(name, screenshots).pathname, fullPage: true });

  await page.goto(`http://127.0.0.1:${surface.address().port}`);
  assert.equal((await lastMessage()).type, 'ready');
  assert.equal((await page.evaluate(() => window.savedState)).sessionId, session.id, 'the panel records its session for restoration after a window reload');
  await send();
  await page.getByRole('heading', { name: detail.session.title, level: 1 }).waitFor();
  await page.getByText('Demo · no AI calls', { exact: true }).waitFor();
  await page.getByText('Required reviewers approved (1 of 1).', { exact: true }).waitFor();
  await page.getByText('Explicitly approved', { exact: true }).waitFor();
  assert(await page.locator('.run-summary .markdown').count() >= 1, 'run findings render as structured Markdown');
  await page.getByText(/^Live · observed/).waitFor();
  await shot('session-brief.png');

  await page.getByRole('button', { name: 'Open imported snapshot' }).click();
  assert.equal((await lastMessage()).type, 'source-task');
  await page.getByRole('heading', { name: 'Review candidate' }).waitFor();
  for (const [label, format] of [['Download Git bundle', 'bundle'], ['Download patch', 'patch'], ['Download manifest', 'manifest']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    assert.deepEqual(await lastMessage(), { type: 'download-candidate', format });
  }
  await page.getByRole('button', { name: 'Copy link' }).click();
  assert.equal((await lastMessage()).type, 'copy-link');

  await page.getByRole('tab', { name: /^Changes/ }).click();
  const files = page.locator('.files .file');
  assert(await files.count() >= 1, 'the retained patch lists its files');
  const firstFile = await files.first().locator('.file-path').textContent();
  await files.first().click();
  const fileMessage = await lastMessage();
  assert.equal(fileMessage.type, 'artifact');
  assert.equal(fileMessage.file, firstFile);
  await page.getByRole('button', { name: 'Open full patch' }).click();
  assert.equal((await lastMessage()).file, undefined);
  await shot('session-changes.png');

  await page.getByRole('tab', { name: /^Checks/ }).click();
  await page.getByText('Expected failure', { exact: true }).waitFor();
  await page.getByText('Passed', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Open full output' }).first().click();
  assert.equal((await lastMessage()).type, 'artifact');
  await shot('session-checks.png');

  await page.getByRole('tab', { name: /^Checks/ }).press('ArrowRight');
  assert.equal(await page.getByRole('tab', { name: 'Activity' }).getAttribute('aria-selected'), 'true');
  const allEvents = await page.locator('#stream > *').count();
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  assert(await page.locator('#stream .tool').count() >= 2, 'tool events are listed');
  assert.equal(await page.locator('#stream .message, #stream .system-event').count(), 0, 'the Tools filter hides other activity');
  await page.getByRole('button', { name: 'Crew', exact: true }).click();
  assert(await page.locator('#stream .message').count() >= 1);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  assert.equal(await page.locator('#stream > *').count(), allEvents);
  await page.locator('#stream .tool details summary').first().click();
  assert(await page.locator('#stream .tool details[open] pre').count() >= 1, 'tool output folds open inline');
  assert(await page.locator('#stream .brief-event').count() >= 1, 'each run.started event renders a brief card');
  await page.locator('#stream .brief-event summary').first().click();
  await page.locator('#stream .brief-event details[open] .markdown').first().waitFor();
  assert.equal(await page.locator('#stream .brief-event details[open] .eyebrow', { hasText: 'OBJECTIVE' }).count(), 1, 'the brief lists the objective the role received');
  assert.equal(await page.locator('#stream .system-text', { hasText: 'Reviewer finished · Explicitly approved' }).count(), 1, 'run.finished shows the role and verdict');
  await page.getByRole('button', { name: 'Open complete history' }).click();
  assert.equal((await lastMessage()).type, 'history');
  await shot('session-activity.png');

  await page.getByRole('tab', { name: /^Gateway/ }).click();
  await page.getByText('No gateway requests recorded yet', { exact: true }).waitFor();
  await page.getByText('The demonstration runtime does not call a model gateway.', { exact: true }).waitFor();
  assert.equal(await page.locator('.approval-card').count(), 0, 'the demo placement offers no approval switch');
  await page.getByRole('tab', { name: 'Activity' }).click();

  detail.session.status = 'waiting_input';
  detail.session.runs[1].status = 'waiting_input';
  detail.permissions = [
    { id: 'perm-1', kind: 'permission', title: 'Allow bash?', detail: JSON.stringify({ permission: 'bash', patterns: ['npm test', 'node --test'], always: true }), options: ['once', 'always', 'reject'], runId: detail.session.runs[1].id },
    { id: 'q-1', kind: 'question', title: 'Agent needs your answer', detail: 'Which rounding mode?', questions: [{ header: 'Rounding', question: 'Which rounding mode should the fix use?', options: [{ label: 'Half up', description: 'Round .5 away from zero' }, { label: 'Bankers', description: 'Round half to even' }], multiple: false, custom: true }, { question: 'Anything else the reviewer should know?', custom: true }], runId: detail.session.runs[1].id },
  ];
  await send();
  await page.getByText('Reviewer is waiting for your decision.', { exact: true }).waitFor();
  await page.getByRole('heading', { name: '2 decisions waiting' }).waitFor();
  const permission = page.locator('#decision-perm-1');
  await permission.getByText('npm test', { exact: true }).waitFor();
  await permission.getByRole('button', { name: 'Allow matching requests' }).waitFor();
  await permission.getByRole('button', { name: 'Reject' }).waitFor();
  await shot('session-decisions.png');
  await permission.getByRole('button', { name: 'Allow once' }).click();
  assert.deepEqual(await lastMessage(), { type: 'decide', id: 'perm-1', decision: 'once' });
  assert.equal(await permission.getByRole('button', { name: 'Reject' }).isDisabled(), true, 'decision buttons lock while a decision is in flight');
  await post({ type: 'idle' });
  assert.equal(await permission.getByRole('button', { name: 'Reject' }).isDisabled(), false);
  const question = page.locator('#decision-q-1');
  assert.equal(await question.getByRole('button', { name: 'Review answers' }).isDisabled(), true, 'answers are required before review');
  await question.getByLabel(/Half up/).check();
  await question.getByPlaceholder('Your answer').last().fill('Keep the existing validation tests.');
  await question.getByRole('button', { name: 'Review answers' }).click();
  await question.getByText('You are about to answer:').waitFor();
  await question.getByText('Half up', { exact: true }).waitFor();
  await question.getByRole('button', { name: 'Edit' }).click();
  assert.equal(await question.getByLabel(/Half up/).isChecked(), true, 'editing keeps the chosen answers');
  await question.getByRole('button', { name: 'Review answers' }).click();
  await question.getByRole('button', { name: 'Send answers' }).click();
  assert.deepEqual(await lastMessage(), { type: 'answer', id: 'q-1', answers: [['Half up'], ['Keep the existing validation tests.']] });
  await post({ type: 'idle' });
  await page.getByRole('button', { name: 'Review 2 decisions' }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#decisions') !== null), true, 'jumping to decisions moves keyboard focus into them');

  detail.session.status = 'running';
  detail.session.runs[1].status = 'running';
  detail.permissions = [];
  await send();
  await page.getByText('Reviewer is working in the remote workspace.', { exact: true }).waitFor();
  assert.equal(await page.locator('#decisions').count(), 0, 'resolved decisions leave the panel');
  await page.getByText('The crew is working', { exact: true }).waitFor();
  const composer = page.getByRole('textbox', { name: 'Steer the crew' });
  await composer.fill('Keep the source API unchanged.');
  await page.locator('#instruction-state', { hasText: 'Draft on this device.' }).waitFor();
  await send();
  assert.equal(await composer.inputValue(), 'Keep the source API unchanged.', 'a draft survives server refreshes');
  await page.getByLabel('Pause the active run first').check();
  await page.getByRole('button', { name: 'Pause and send' }).click();
  assert.deepEqual(await lastMessage(), { type: 'instruction', text: 'Keep the source API unchanged.', pauseFirst: true });
  await page.getByText('Sending…', { exact: true }).first().waitFor();
  await post({ type: 'instruction', state: 'unknown', message: 'The request outcome could not be confirmed.' });
  await page.locator('#instruction-state', { hasText: 'Delivery unknown.' }).waitFor();
  assert.equal(await composer.inputValue(), 'Keep the source API unchanged.', 'an unconfirmed delivery keeps the draft');
  assert.equal(await page.getByLabel('Pause the active run first').isChecked(), true, 'an unconfirmed delivery keeps the pause-first choice');
  await page.getByLabel('Pause the active run first').uncheck();
  await composer.press('Meta+Enter');
  assert.deepEqual(await lastMessage(), { type: 'instruction', text: 'Keep the source API unchanged.', pauseFirst: false });
  await post({ type: 'instruction', state: 'saved' });
  await page.locator('#instruction-state', { hasText: 'Saved for the next execution' }).waitFor();
  assert.equal(await composer.inputValue(), '');
  await shot('session-running.png');

  await post({ type: 'connection', connected: false, message: 'Lost connection during test.', freshness: { transport: 'offline', observedAt: new Date().toISOString() } });
  await page.getByText('Lost connection during test.', { exact: false }).waitFor();
  await page.getByText(/^Disconnected · last observed/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Pause', exact: true }).isDisabled(), true);
  await page.getByRole('tab', { name: 'Brief' }).click();
  assert.equal(await page.getByRole('button', { name: 'Download Git bundle' }).isDisabled(), true);

  detail.session.status = 'paused';
  detail.session.runs[1].status = 'paused';
  detail.session.title = '<img src=x onerror="window.compromised=true"> Remote review';
  detail.session.objective = '# Objective\n\n<script>window.compromised=true</script> Review the [actual changes](javascript:alert(1)) and **keep** `validation`.\n\n- one\n- two\n\n| a | b |\n| --- | --- |\n| 1 | 2 |';
  detail.session.sourceTask.title = '<img src=x onerror="window.compromised=true"> Hostile tracker title';
  detail.session.runs[1].summary = '## Findings\n\n<img src=x onerror="window.compromised=true">\n\n```js\nconst a = "<b>"\n```';
  await send();
  await page.getByRole('heading', { name: 'Objective', level: 3 }).waitFor();
  assert.equal(await page.locator('#app img, #app script, #app a').count(), 0, 'server text never becomes markup, links or scripts');
  assert.equal(await page.evaluate(() => window.compromised), undefined);
  assert.equal(await page.locator('.objective table td').count(), 2, 'Markdown tables render');
  assert.equal(await page.locator('.objective strong').count(), 1);
  assert.equal(await page.locator('.objective li').count(), 2);
  await page.locator('.run-summary summary').last().click();
  assert((await page.locator('.run-summary pre').last().textContent()).includes('<b>'), 'fenced code stays literal');
  await page.getByText('Paused while Reviewer was working.', { exact: true }).waitFor();
  await post({ type: 'connection', connected: false, message: 'Lost connection again.', freshness: { transport: 'offline', observedAt: new Date().toISOString() } });
  assert.equal(await page.getByRole('button', { name: 'Resume', exact: true }).isDisabled(), true, 'mutations stay disabled while disconnected');
  await send();
  assert.equal(await page.getByRole('button', { name: 'Resume', exact: true }).isDisabled(), false, 'a fresh snapshot reconnects the panel');

  detail.session.title = 'Correct the order rounding';
  detail.session.sourceTask.title = task.title;
  detail.session.objective = 'Fix the rounding regression, preserve validation and provide actual verification results for independent review.';
  detail.session.runs[1].summary = 'Reviewed the diff and reran the checks.';
  await send();
  await composer.fill('Keep validation intact and explain the changed rounding boundary.');
  await shot('session-desktop.png');
  await page.setViewportSize({ width: 390, height: 900 });
  for (const name of ['Brief', /^Changes/, /^Checks/, 'Activity']) { await page.getByRole('tab', { name }).click(); await noOverflow(`Tab ${name}`); }
  await page.getByRole('tab', { name: 'Brief' }).click();
  await shot('session-narrow.png');

  await post({ type: 'focus', tab: 'changes' });
  assert.equal(await page.getByRole('tab', { name: /^Changes/ }).getAttribute('aria-selected'), 'true', 'the extension host can focus a tab');

  detail.session.status = 'failed';
  detail.session.runs[1].status = 'failed';
  detail.session.failure = { category: 'prompt_acceptance_unknown', stage: 'prompt', message: 'The runtime may already have started paid work. <img src=x onerror="window.compromised=true">', remediation: 'Confirm remote interruption and reconcile spending. <script>window.compromised=true</script>', promptAcceptance: 'unknown', automaticRetry: false, detail: 'opencode: exit 137\n<img src=x onerror="window.compromised=true">' };
  await send();
  await page.getByText('Submission outcome unconfirmed · no automatic retry.', { exact: false }).waitFor();
  await page.getByText('Prompt submission failed: The runtime may already have started paid work.', { exact: false }).waitFor();
  await page.getByText('Recorded error output', { exact: true }).click();
  assert((await page.locator('.failure-detail').textContent()).includes('exit 137'));
  assert.equal(await page.locator('.execution-failure img, .execution-failure script').count(), 0);
  assert.equal(await page.evaluate(() => window.compromised), undefined);
  assert.equal(await page.getByRole('button', { name: /^(Start remote crew|Resume)$/ }).count(), 0);
  await noOverflow('Failure guidance');
  await shot('session-failed-narrow.png');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  assert.equal((await lastMessage()).type, 'refresh');

  detail.user = { ...detail.user, role: 'admin' };
  detail.session.status = 'paused';
  await send();
  await page.getByRole('button', { name: 'Authorize more budget' }).click();
  await page.getByLabel('Additional amount · USD').fill('2.5');
  await page.getByRole('button', { name: 'Authorize', exact: true }).click();
  assert.deepEqual(await lastMessage(), { type: 'budget', amountUsd: 2.5 });
  assert.deepEqual(errors, []);
  process.stdout.write('PASS: real demo session rendered with situation sentence, Markdown findings, per-file changes, check outcomes, filtered activity, inline permission and question decisions with confirmation, composer delivery states with pause-first, disconnect and reconnect, hostile text kept inert, failure guidance with recorded cause, admin budget form, desktop and narrow layouts. This is browser webview validation, not a VS Code Extension Host test.\n');
} finally {
  await browser?.close();
  await new Promise(resolve => surface.close(resolve));
  await server.close();
}
