import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
import { createApplication } from '../src/main.ts';
import { loadConfig } from '../src/config.ts';

const flows = [
  ['now', 'the Now page: waiting groups with reason chips, the digest and Mark as caught up, stat links, the running meter, keyboard row navigation and o at desktop/mobile widths'],
  ['tasks', 'task connections for five providers, fixture import with explicit start, duplicate import, binary candidate downloads, changed-revision draft preservation and inert source text, task desktop/mobile layout, task selection in the address, j/k, wide auto-open, the sticky Create session and the phone master-detail'],
  ['sessions', 'demo, diff, checks, export, reload, create, pause, evidence keyboard navigation at desktop/mobile widths, draft preservation, stream reading-position and tail-follow preservation, instruction, resume, cancel, actionable ambiguous-failure guidance and escaped error text, the review decision at phone width and its contrast, reviewed labels and list search'],
  ['shell', 'redirects from old links, heading focus, title and announcement on route changes, the status strip, the account menu, live updates, the shortcut help, g chords, opening the command palette, the skip link, mobile navigation'],
  ['palette', 'the command palette (fuzzy search, keyboard from any focus, recent Work Items kept per user, number jumps, commands that keep Preferences in sync, the Work Item failure notice and retry, the no-match next step) at desktop/mobile widths, the favicon dot and opt-in desktop notifications'],
  ['settings', 'the Environment health checks, one content width on every Settings page, theme, density, single-key and live-update preferences kept across a reload and in step with the top bar and account menu'],
  ['feeds', 'Insights tiles, tables and phone cards, activity days and paging, Runs filters with phone cards, and proposed-work approval and rejection at desktop/mobile widths'],
  ['work', 'Work lanes, reason groups and master-detail, the Work Item decision box and review receipt, the demo cancel dialog, j/k and Esc, and the phone sticky bar'],
  ['login', 'live login with a failed attempt that keeps the account name, the password reveal, logout, and an expired session that keeps its deep link'],
];

const root = await mkdtemp(join(tmpdir(), 'vloer-browser-'));
const previousDataDir = process.env.VLOER_DATA_DIR;
process.env.VLOER_DATA_DIR = join(root, 'demo');
const demoConfig = loadConfig(['--demo']);
if (previousDataDir === undefined) delete process.env.VLOER_DATA_DIR;
else process.env.VLOER_DATA_DIR = previousDataDir;
const app = await createApplication(demoConfig);
const password = randomBytes(24).toString('hex');
const live = await createApplication({ ...demoConfig, mode: 'live', dataDir: join(root, 'live'), litellm: undefined, runtime: { ...demoConfig.runtime, kind: 'opencode' }, auth: { ...demoConfig.auth, secureCookies: false, bootstrapName: 'browser-operator', bootstrapPassword: password } });
let browser;
const screenshots = process.env.VLOER_SCREENSHOTS ? resolve(process.env.VLOER_SCREENSHOTS) : undefined;
try {
  await Promise.all([new Promise(done => app.server.listen(0, '127.0.0.1', done)), new Promise(done => live.server.listen(0, '127.0.0.1', done))]);
  browser = await chromium.launch({ headless: true, ...(process.env.VLOER_CHROMIUM_BIN ? { executablePath: process.env.VLOER_CHROMIUM_BIN, args: ['--no-sandbox', '--no-zygote', '--single-process', '--disable-dev-shm-usage', '--disable-gpu'] } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1040 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/\b(401|409|503)\b/.test(message.text())) errors.push(message.text()); });
  const screenshot = async name => { if (screenshots) { await mkdir(screenshots, { recursive: true }); await page.screenshot({ path: join(screenshots, `${name}.png`), fullPage: true }); } };
  for (const [name] of flows) {
    const { run } = await import(`./browser/${name}.mjs`);
    try { await run({ page, app, live, password, assert, screenshot }); }
    catch (error) { error.message = `[${name} flow] ${error.message}`; throw error; }
  }
  assert.deepEqual(errors, [], 'Browser script or CSP errors occurred');
  process.stdout.write(`PASS: Chromium ${browser.version()}; ${flows.map(([, covers]) => covers).join(', ')}, navigation. No inference requests.\n`);
} finally {
  await browser?.close();
  await Promise.all([app.close(), live.close()]);
  await rm(root, { recursive: true, force: true });
}
