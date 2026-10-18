import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { replayKey } from '../public/replay/routes.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const usage = 'Usage: UNFOLD_COOKIE="<name>=<value>" npm run workbench:record -- <recording-name> <work-item-id>...';
const [name, ...ids] = process.argv.slice(2);
const base = (process.env.UNFOLD_URL ?? 'https://unfold.webgrip.dev').replace(/\/+$/, '');
const cookie = process.env.UNFOLD_COOKIE ?? '';
if (!name || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name) || name === 'demo' || !ids.length || ids.some(id => !/^[\w-]{1,64}$/.test(id))) throw new Error(usage);
if (!cookie.includes('=')) throw new Error(`UNFOLD_COOKIE is missing. Copy your Unfold session cookie from the browser's developer tools.\n${usage}`);

const routes = {};
const refused = [];
const browser = await chromium.launch({ headless: true, ...(process.env.UNFOLD_CHROMIUM_BIN ? { executablePath: process.env.UNFOLD_CHROMIUM_BIN } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies(cookie.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const at = part.indexOf('=');
    return { name: part.slice(0, at), value: part.slice(at + 1), url: base };
  }));
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === new URL(base).origin && url.pathname.startsWith('/api/') && request.method() !== 'GET') { refused.push(`${request.method()} ${url.pathname}`); return route.abort('blockedbyclient'); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('response', async response => {
    const request = response.request();
    const url = new URL(response.url());
    if (request.method() !== 'GET' || !url.pathname.startsWith('/api/') || !/json/.test(response.headers()['content-type'] ?? '')) return;
    try { routes[replayKey('GET', url)] = { status: response.status(), body: await response.json() }; } catch {}
  });
  const visit = async hash => {
    await page.goto(`${base}/${hash}`);
    await page.waitForTimeout(3000);
    for (let round = 0; round < 3; round += 1) {
      await page.evaluate(() => { for (const details of document.querySelectorAll('main details:not([open])')) details.open = true; });
      await page.waitForTimeout(2000);
    }
  };
  await visit('#now');
  const signedIn = routes['GET /api/bootstrap']?.body?.user;
  if (!signedIn) throw new Error(`UNFOLD_COOKIE did not sign in to ${base}; copy a fresh session cookie.`);
  await visit('#work');
  for (const id of ids) await visit(`#work/${encodeURIComponent(id)}`);
} finally {
  await browser.close();
}

const demo = JSON.parse(await readFile(join(root, '../site/replay/replay.json'), 'utf8'));
const kept = Object.fromEntries(Object.entries(demo.routes).filter(([key]) => !key.startsWith('GET /api/ploeg') && !key.startsWith('GET /api/bootstrap')));
const recording = { ...demo, anchor: new Date().toISOString(), recordedFrom: base, routes: { ...kept, ...routes } };
await mkdir(join(root, 'workbench/recorded'), { recursive: true });
const out = join(root, 'workbench/recorded', `${name}.json`);
await writeFile(out, JSON.stringify(recording));
process.stdout.write(`Recorded ${Object.keys(routes).length} responses from ${base} into ${out} (kept on this machine only). Work Items: ${ids.join(', ')}. Blocked ${refused.length} non-GET requests.\n`);
