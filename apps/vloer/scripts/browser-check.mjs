import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
import { createApplication } from '../src/main.ts';
import { loadConfig } from '../src/config.ts';

const flows = [
  ['now', 'the Now page at mobile width and its keyboard row navigation'],
  ['tasks', 'task connections for five providers, fixture import with explicit start, duplicate import, binary candidate downloads, changed-revision draft preservation and inert source text, task desktop/mobile layout'],
  ['sessions', 'demo, diff, checks, export, reload, create, pause, evidence keyboard navigation at desktop/mobile widths, draft preservation, stream reading-position and tail-follow preservation, instruction, resume, cancel, actionable ambiguous-failure guidance and escaped error text'],
  ['shell', 'redirects from old links, heading focus, title and announcement on route changes, the shortcut help, g chords, opening the command palette, mobile navigation'],
  ['palette', 'the command palette (fuzzy search, keyboard, recent Work Items, number jumps, commands) at desktop/mobile widths, the favicon dot and opt-in desktop notifications'],
  ['settings', 'the Environment page, theme, density and single-key preferences kept across a reload'],
  ['feeds', 'Ploeg overview, activity paging, Runs filters and proposed-work rejection at desktop/mobile widths'],
  ['work', 'Ploeg awaiting-review lane and review screen'],
  ['login', 'live login/logout and an expired session that keeps its deep link'],
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
