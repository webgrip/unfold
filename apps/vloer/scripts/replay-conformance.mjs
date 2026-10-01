import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const vloer = fileURLToPath(new URL('../', import.meta.url));
const builder = resolve(vloer, '../site/scripts/build-demo.mjs');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };
const screenshots = process.env.REPLAY_SCREENSHOTS ? resolve(process.env.REPLAY_SCREENSHOTS) : undefined;
const views = ['now', 'sessions', 'tasks', 'work', 'work/105', 'work/124', 'work/125', 'work/119', 'proposed', 'runs', 'activity', 'insights', 'binder', 'packs', 'season', 'settings/preferences', 'settings/environment', 'settings/cards', 'settings/accounts', 'settings/card-designer'];

const root = await mkdtemp(join(tmpdir(), 'vloer-replay-site-'));
const site = join(root, 'site');
execFileSync(process.execPath, [builder, '--out', join(site, 'demo')], { stdio: 'inherit' });
const apiHits = [];
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path.startsWith('/api/')) { apiHits.push(`${req.method} ${path}`); res.writeHead(599); res.end(); return; }
  if (path === '/demo') { res.writeHead(307, { Location: '/demo/' }); res.end(); return; }
  if (path === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<!doctype html><title>Unfold</title>'); return; }
  const file = normalize(join(site, path.endsWith('/') ? `${path}index.html` : path));
  if (!file.startsWith(site)) { res.writeHead(403); res.end(); return; }
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.VLOER_CHROMIUM_BIN ? { executablePath: process.env.VLOER_CHROMIUM_BIN } : {}) });
  const failures = [];
  const watch = (page, label) => {
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => failures.push(`[${label}] page error: ${error.message}`));
    page.on('console', message => {
      const text = message.text();
      if (message.type() === 'error' && !/status of 409/.test(text)) failures.push(`[${label}] console error: ${text}`);
      if (message.type() === 'warning' && text.startsWith('[replay]')) failures.push(`[${label}] ${text}`);
    });
    page.on('requestfailed', request => { if (!request.url().includes('/api/')) failures.push(`[${label}] request failed: ${request.url()} ${request.failure()?.errorText}`); });
    page.on('response', response => { if (response.status() >= 400 && !response.url().includes('/api/')) failures.push(`[${label}] HTTP ${response.status()} for ${response.url()}`); });
  };
  const report = page => page.evaluate(async () => { await globalThis.__unfoldReplay.ready; return { unmatched: globalThis.__unfoldReplay.unmatched, refused: globalThis.__unfoldReplay.refused, csp: globalThis.__cspViolations ?? [] }; });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  await context.addInitScript(() => { globalThis.__cspViolations = []; document.addEventListener('securitypolicyviolation', event => globalThis.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`)); });
  const page = await context.newPage();
  watch(page, 'desktop');
  await page.goto(`${origin}/demo`);
  assert.equal(new URL(page.url()).pathname, '/demo/');
  await page.locator('.replay-banner').getByText("Recorded replay of Vloer's deterministic demo").waitFor();
  await page.locator('#main h1, #main [data-view-title], .page-title').first().waitFor();
  for (const view of views) {
    await page.goto(`${origin}/demo/#${view}`);
    await page.waitForFunction(() => !document.querySelector('#app .boot'));
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
  }
  await page.goto(`${origin}/demo/#sessions`);
  await page.getByRole('button', { name: 'Run the demonstration' }).first().click();
  await page.waitForURL(/#session\//);
  await page.getByText('DEMO: this deterministic runtime uses no model').first().waitFor();
  if (screenshots) { await mkdir(screenshots, { recursive: true }); await page.screenshot({ path: join(screenshots, 'replay-light-running.png') }); }
  await page.locator('[data-action="review"][data-decision="accepted"]:visible').first().waitFor({ timeout: 60000 });
  if (screenshots) await page.screenshot({ path: join(screenshots, 'replay-light-completed.png'), fullPage: true });
  await page.locator('[data-action="review"][data-decision="accepted"]:visible').first().click();
  await page.locator('#confirm-dialog [type="submit"]').click();
  await page.locator('#toast').getByText('Accepted. Your decision is recorded in the session.').waitFor();
  await page.reload();
  await page.getByText('Accepted', { exact: false }).first().waitFor();
  await page.goto(`${origin}/demo/#sessions`);
  await page.getByRole('button', { name: 'Run the demonstration' }).first().click();
  await page.locator('#toast').getByText('This hosted replay is recorded. Run mise run demo to try this.').waitFor();
  const desktop = await report(page);
  await page.locator('[data-replay-restart]').click();
  await page.waitForURL(/#sessions/);
  await page.getByRole('button', { name: 'Run the demonstration' }).first().waitFor();

  const dark = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  const darkPage = await dark.newPage();
  watch(darkPage, 'dark');
  await darkPage.goto(`${origin}/demo/#work/119`);
  await darkPage.waitForLoadState('networkidle');
  await darkPage.waitForTimeout(1500);
  if (screenshots) await darkPage.screenshot({ path: join(screenshots, 'replay-dark-work-item.png') });
  await darkPage.goto(`${origin}/demo/#now`);
  await darkPage.waitForLoadState('networkidle');
  if (screenshots) await darkPage.screenshot({ path: join(screenshots, 'replay-dark-now.png') });
  const darkReport = await report(darkPage);

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const phonePage = await phone.newPage();
  watch(phonePage, 'phone');
  await phonePage.goto(`${origin}/demo/#sessions`);
  await phonePage.getByRole('button', { name: 'Run the demonstration' }).first().click();
  await phonePage.waitForURL(/#session\//);
  await phonePage.waitForTimeout(6000);
  if (screenshots) await phonePage.screenshot({ path: join(screenshots, 'replay-phone-session.png') });
  assert.equal(await phonePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'the replay scrolls sideways at phone width');
  const phoneReport = await report(phonePage);

  for (const [label, result] of [['desktop', desktop], ['dark', darkReport], ['phone', phoneReport]]) {
    for (const key of result.unmatched) failures.push(`[${label}] unmatched request ${key}`);
    for (const violation of result.csp) failures.push(`[${label}] CSP violation ${violation}`);
  }
  for (const hit of apiHits) failures.push(`request reached the network: ${hit}`);
  assert.deepEqual(desktop.refused, ['POST /api/sessions'], 'only the second demonstration is refused in the scripted flow');
  assert.deepEqual(failures, [], 'the replay must answer every request without errors or CSP violations');
  process.stdout.write(`PASS: Chromium ${browser.version()} replayed Vloer's recorded demo at /demo/ across ${views.length} views, the session timeline and its review; zero unmatched requests, page errors or CSP violations, and no /api/ request reached the network.\n`);
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
  await rm(root, { recursive: true, force: true });
}
