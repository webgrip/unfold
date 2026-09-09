import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { application, createInput, sessionUntil } from '../../../test/api-support.ts';
import { VloerClient } from '../src/client.ts';

const server = await application();
const secrets = { async get() {}, async store() {}, async delete() {} };
const client = new VloerClient(server.url, secrets);
const session = await client.create(createInput());
await client.action(session.id, 'start');
await sessionUntil(server.url, session.id, value => ['completed', 'failed'].includes(value.status));
const detail = { session: await client.session(session.id), events: await client.history(session.id), permissions: [], user: (await client.bootstrap()).user, mode: 'demo' };
const theme = `:root{--vscode-font-family:Inter,Arial,sans-serif;--vscode-font-size:13px;--vscode-foreground:#d8dee9;--vscode-editor-background:#171c24;--vscode-descriptionForeground:#98a6b8;--vscode-widget-border:#343e4e;--vscode-button-secondaryForeground:#d8dee9;--vscode-button-secondaryBackground:#303b4e;--vscode-button-secondaryHoverBackground:#3c4c63;--vscode-button-background:#d37145;--vscode-button-foreground:#fff;--vscode-button-hoverBackground:#bc6039;--vscode-focusBorder:#dd9565;--vscode-textLink-foreground:#e4a177;--vscode-errorForeground:#ef9393;--vscode-badge-background:#354252;--vscode-badge-foreground:#d8dee9;--vscode-testing-iconPassed:#82bd9c;--vscode-list-warningForeground:#e5b26c;--vscode-textBlockQuote-background:#202731;--vscode-list-hoverBackground:#26313e;--vscode-input-foreground:#d8dee9;--vscode-input-background:#202733;--vscode-input-border:#394558;--vscode-input-placeholderForeground:#8390a5;--vscode-scrollbarSlider-background:#303c4b;--vscode-progressBar-background:#d37145;--vscode-editor-font-family:monospace;}`;
const surface = createServer(async (request, response) => {
  if (request.url === '/session.js' || request.url === '/session.css') {
    response.setHeader('Content-Type', request.url.endsWith('.js') ? 'text/javascript' : 'text/css');
    response.end(await readFile(new URL(`../media${request.url}`, import.meta.url)));
  } else if (request.url === '/theme.css') {
    response.setHeader('Content-Type', 'text/css'); response.end(theme);
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; script-src 'nonce-vloer-browser-test'; connect-src 'none'; base-uri 'none'; form-action 'none'"><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/session.css"></head><body><main id="app"></main><div id="announcement" class="sr-only" role="status" aria-live="polite"></div><script nonce="vloer-browser-test" src="/session.js"></script></body></html>`);
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
  await page.goto(`http://127.0.0.1:${surface.address().port}`);
  await page.evaluate(detail => window.postMessage({ type: 'session', detail }, '*'), detail);
  await page.getByRole('heading', { name: detail.session.title }).waitFor();
  await page.getByText('Demo · no AI calls', { exact: true }).waitFor();
  await page.getByText('Review: approve', { exact: true }).waitFor();
  await mkdir(new URL('../.screenshots/', import.meta.url), { recursive: true });
  await page.screenshot({ path: new URL('../.screenshots/session-actual-completed.png', import.meta.url).pathname, fullPage: true });
  await page.getByRole('tab', { name: /Evidence/ }).click();
  await page.getByRole('button', { name: /Open diff: Workspace changes/ }).click();
  assert((await page.evaluate(() => window.messages)).some(message => message.type === 'artifact' && message.id === detail.session.artifacts.find(artifact => artifact.kind === 'diff').id));
  await page.getByRole('tab', { name: /Evidence/ }).press('ArrowRight');
  assert.equal(await page.getByRole('tab', { name: 'Activity' }).getAttribute('aria-selected'), 'true');
  await page.getByRole('button', { name: 'Open complete history' }).click();
  assert((await page.evaluate(() => window.messages)).some(message => message.type === 'history'));
  detail.session.status = 'paused';
  detail.session.title = '<img src=x onerror="window.compromised=true"> Remote review';
  detail.session.objective = '<script>window.compromised=true</script> Review the actual changes.';
  await page.evaluate(detail => window.postMessage({ type: 'session', detail }, '*'), detail);
  await page.getByRole('tab', { name: 'Work', exact: true }).click();
  assert.equal(await page.locator('h1 img, .objective script').count(), 0);
  assert.equal(await page.evaluate(() => window.compromised), undefined);
  await page.getByRole('textbox', { name: 'Steer the crew' }).fill('Keep the source API unchanged.');
  await page.evaluate(detail => window.postMessage({ type: 'session', detail }, '*'), detail);
  assert.equal(await page.getByRole('textbox', { name: 'Steer the crew' }).inputValue(), 'Keep the source API unchanged.');
  await page.getByRole('button', { name: 'Send instruction' }).click();
  assert((await page.evaluate(() => window.messages)).some(message => message.type === 'instruction' && message.text === 'Keep the source API unchanged.'));
  await page.evaluate(() => window.postMessage({ type: 'instruction-saved' }, '*'));
  assert.equal(await page.getByRole('textbox', { name: 'Steer the crew' }).inputValue(), '');
  await page.evaluate(() => window.postMessage({ type: 'connection', connected: false, message: 'Lost connection during test.' }, '*'));
  assert.equal(await page.getByRole('button', { name: 'Resume', exact: true }).isDisabled(), true);
  await page.getByText('Displaying the last received state.', { exact: false }).waitFor();
  detail.session.title = 'Correct the order rounding';
  detail.session.objective = 'Fix the rounding regression, preserve validation and provide actual verification results for independent review.';
  await page.evaluate(detail => window.postMessage({ type: 'session', detail }, '*'), detail);
  await page.getByRole('textbox', { name: 'Steer the crew' }).fill('Keep validation intact and explain the changed rounding boundary.');
  await mkdir(new URL('../.screenshots/', import.meta.url), { recursive: true });
  await page.screenshot({ path: new URL('../.screenshots/session-desktop.png', import.meta.url).pathname, fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Narrow editor layout must not overflow horizontally');
  await page.screenshot({ path: new URL('../.screenshots/session-narrow.png', import.meta.url).pathname, fullPage: true });
  assert.deepEqual(errors, []);
  process.stdout.write('PASS: actual demo evidence rendered; keyboard tabs; instruction messages; draft retention; text-only hostile content; disconnect state; desktop and narrow layout. This is browser webview validation, not a VS Code Extension Host test.\n');
} finally {
  await browser?.close();
  await new Promise(resolve => surface.close(resolve));
  await server.close();
}
