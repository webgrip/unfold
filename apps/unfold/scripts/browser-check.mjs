import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
import { createApplication } from '../src/main.ts';
import { loadConfig } from '../src/config.ts';
import { startFakeArtModel } from './browser/fake-art-model.mjs';

const flows = [
  ['now', 'the Now page: waiting groups with reason chips, the digest with counts that jump to their rows and Mark as caught up, stat links, the running meter, keyboard row navigation and o at desktop/mobile widths'],
  ['tasks', 'task connections for five providers, fixture import with explicit start, duplicate import, binary candidate downloads, changed-revision draft preservation and inert source text, task desktop/mobile layout, task selection in the address, j/k, wide auto-open, the sticky Create session and the phone master-detail'],
  ['sessions', 'demo, diff, checks, export, reload, create, pause, evidence keyboard navigation at desktop/mobile widths, draft preservation, stream reading-position and tail-follow preservation, instruction, resume, cancel, actionable ambiguous-failure guidance and escaped error text, the review decision at phone width and its contrast, reviewed labels and list search'],
  ['shell', 'redirects from old links, heading focus, title and announcement on route changes, the status strip, the account menu, live updates, the shortcut help, g chords, opening the command palette, the skip link, mobile navigation'],
  ['palette', 'the command palette (fuzzy search, keyboard from any focus, recent Work Items kept per user, number jumps, commands that keep Preferences in sync, the Work Item failure notice and retry, the no-match next step) at desktop/mobile widths, the favicon dot and opt-in desktop notifications'],
  ['settings', 'the Environment health checks, one content width on every Settings page, theme, density, single-key and live-update preferences kept across a reload and in step with the top bar and account menu'],
  ['feeds', 'Insights tiles, tables and phone cards, activity days and paging, Runs filters with phone cards, and proposed-work approval and rejection at desktop/mobile widths'],
  ['effects', 'the effects director: news since the person last saw a Run card plays once and not on reload (a merge seal on Unfold Native, a finish wipe-in on the forge), the calm swap under reduced motion with no overlay and no movement, and Off playing nothing while the news is still announced'],
  ['work', 'Work lanes, reason groups and master-detail, the Work Item decision box and review receipt, the demo Run card above Rounds turned over by More info, its keyboard tabs and Escape, the day chip, finish and pointer light of released demo cards, their Life tab with deployments and the merge fallback, the still finish under reduced motion, the demo cancel dialog, j/k and Esc, and the phone sticky bar'],
  ['progress', 'a Work Item that an Unfold session drives, read through the shared progress statechart: the 059675b9 worst case as one stopped state with its Roles in order, the cut-off reviewer and Ploeg\'s unclosed Run as a fact, the session link by keyboard, at desktop and phone widths without horizontal overflow'],
  ['trace', 'gates, cracks and sets on the Run card: the gates strip with its bounce marker and right-first-time chip, the crack, evolved and set chips, the Gates, Condition and Set tabs, the epic’s children grid, and Trace this bug on a demo bug Work Item with its candidates, a pending crack, the Confirm and Propose dialogs, their field checks and the demo’s nothing-recorded outcome at desktop/phone widths'],
  ['forge', 'the forge skin: the 3D Run card renders under the CSP with painted pixels and the same facts, turns over, draws a still frame on a software rasteriser, pauses its live loop on its back and off screen, holds one still frame under reduced motion, and falls back to Unfold Native without WebGL2'],
  ['world', 'the forge card’s inner world: a demo card’s islands in the art window under the CSP with a screen reader description, flatten and back by button and F, a thing found by its hover cursor reacting to a click and to the keyboard, a crystal placed by pointer and a thing erased by keyboard, the decoration saved for its owner and shown again after a reload, the reset to the card’s own world, and a reduced-motion world that flattens at once without particles'],
  ['collection', 'the collection side of Run cards: card logins, the private binder with forge thumbnails, a focused card and the once-only While you were away replay, a demo pack ripped by keyboard to its summary, the published odds, the reduced-motion ceremony and the Team season page'],
  ['skins', 'the DOM skin packs (holo, loot, arcade, ticker and patch): each demo card under the CSP with the facts every card shows and no amount, the Set Cards, the back tabs, no horizontal scrolling at desktop and phone widths, the mend moment and its event, idle only while on screen and facing front, and the still end state under reduced motion'],
  ['rarity', 'Run card rarity: every tier predicted and revealed on Unfold Native, the DOM skin packs and the forge with its mark, frame ring and Rarity tab, a legendary reveal at full size and a reveal below its prediction at its own tier without a loss cue, the still glow under reduced motion, and the binder rarity filter and rarest-first sort'],
  ['kpis', 'Run card KPIs: three or four headline figures on Unfold Native, the forge and each DOM skin pack, waiting while nobody has responded, reruns and blocked time as the only colours, the Flow tab’s stacked bar, status table, calendar line and what is not collected, the calendar ↔ working-hours toggle remembered across a reload, the Review & CI steps and CI rows, the Change tab’s complexity, Life’s merge to each environment, and phone width without horizontal scrolling'],
  ['designer', 'the card designer: a new theme changes the live forge preview (frame, foil pattern, art preset, colour tokens through the CSSOM, an uploaded set symbol, a pasted shader), a hostile SVG and a broken shader are refused with a reason, the theme saves, versions, reloads and previews on a real Work Item, the page fits 390px, and in live mode generated art retries once with the browser compiler log from a fake model and ends as the card art'],
  ['confusion', 'confusion signals from real clicks: a rage click and a dead click on named elements, no dead click when a menu opens, no rage click for triple-click text selection, a U-turn after two quick visits to one Work Item, and no screen text in any signal'],
  ['brand', 'the Vouwvlieger at desktop, tablet and three phone sizes: the loading flight lands before the loading screen lifts and never widens the page, the brand link pops on hover in the sidebar and on tap in the phone drawer, the sign-in lockup pops, and reduced motion keeps every mark still'],
  ['login', 'live login with a failed attempt that keeps the account name, the password reveal, logout, an expired session that keeps its deep link, and a sign-out after which the next person never sees the previous Now page'],
];

const only = (process.env.UNFOLD_BROWSER_FLOWS ?? '').split(',').map(name => name.trim()).filter(Boolean);
const unknown = only.filter(name => !flows.some(([flow]) => flow === name));
if (unknown.length) throw new Error(`UNFOLD_BROWSER_FLOWS names unknown flows: ${unknown.join(', ')}`);
const selected = only.length ? flows.filter(([name]) => only.includes(name)) : flows;

const root = await mkdtemp(join(tmpdir(), 'unfold-browser-'));
const previousDataDir = process.env.UNFOLD_DATA_DIR;
process.env.UNFOLD_DATA_DIR = join(root, 'demo');
const demoConfig = loadConfig(['--demo']);
if (previousDataDir === undefined) delete process.env.UNFOLD_DATA_DIR;
else process.env.UNFOLD_DATA_DIR = previousDataDir;
const app = await createApplication(demoConfig);
const artModel = await startFakeArtModel();
process.env.UNFOLD_BROWSER_ART_KEY = randomBytes(12).toString('hex');
const password = randomBytes(24).toString('hex');
const live = await createApplication({ ...demoConfig, mode: 'live', dataDir: join(root, 'live'), litellm: undefined, runtime: { ...demoConfig.runtime, kind: 'opencode' }, cardThemes: { assetQuotaMb: 64, ai: { baseUrl: artModel.url, model: 'fake-art', keyEnv: 'UNFOLD_BROWSER_ART_KEY', maxTokens: 2048, timeoutMs: 10000, requestsPerHour: 30 } }, auth: { ...demoConfig.auth, secureCookies: false, bootstrapName: 'browser-operator', bootstrapPassword: password } });
let browser;
const screenshots = process.env.UNFOLD_SCREENSHOTS ? resolve(process.env.UNFOLD_SCREENSHOTS) : undefined;
try {
  await Promise.all([new Promise(done => app.server.listen(0, '127.0.0.1', done)), new Promise(done => live.server.listen(0, '127.0.0.1', done))]);
  browser = await chromium.launch({ headless: true, ...(process.env.UNFOLD_CHROMIUM_BIN ? { executablePath: process.env.UNFOLD_CHROMIUM_BIN, args: ['--no-sandbox', '--no-zygote', '--single-process', '--disable-dev-shm-usage', '--disable-gpu'] } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1040 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const refusedOnPurpose = message => /\b400\b/.test(message.text()) && String(message.location()?.url ?? '').includes('/api/card-assets?purpose=symbol');
  page.on('console', message => { if (message.type() === 'error' && !/\b(401|409|503)\b/.test(message.text()) && !refusedOnPurpose(message)) errors.push(message.text()); });
  const screenshot = async name => { if (screenshots) { await mkdir(screenshots, { recursive: true }); await page.screenshot({ path: join(screenshots, `${name}.png`), fullPage: true }); } };
  for (const [name] of selected) {
    const { run } = await import(`./browser/${name}.mjs`);
    try { await run({ page, app, live, password, assert, screenshot, artModel }); }
    catch (error) { error.message = `[${name} flow] ${error.message}`; throw error; }
  }
  assert.deepEqual(errors, [], 'Browser script or CSP errors occurred');
  process.stdout.write(`PASS: Chromium ${browser.version()}; ${selected.map(([, covers]) => covers).join(', ')}, navigation. No inference requests: generated art comes from a local fake model.\n`);
} finally {
  await browser?.close();
  await Promise.all([app.close(), live.close(), artModel.close()]);
  await rm(root, { recursive: true, force: true });
}
