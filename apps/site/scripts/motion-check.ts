import { strict as assert } from 'node:assert';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

const viewports = [
  { name: 'desktop', width: 1440, height: 900, phone: false },
  { name: 'tablet', width: 820, height: 1180, phone: false },
  { name: 'phone', width: 390, height: 844, phone: true },
  { name: 'small phone', width: 360, height: 740, phone: true },
  { name: 'smallest phone', width: 320, height: 568, phone: true },
];
const targets = [
  { name: 'header lockup', selector: 'header a.brand' },
  { name: 'hero mark', selector: '.brief-mark' },
  { name: 'guard mark', selector: '.guard-brand' },
  { name: 'footer lockup', selector: '.footer-brand svg.lockup' },
  { name: 'footer signature', selector: '.footer-signature' },
];

if (!existsSync(join(dist, 'index.html')))
  throw new Error('Build the site first: dist/index.html is missing');

const server = createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://site').pathname));
  let file = join(dist, path);
  if (existsSync(`${file}.html`)) file = `${file}.html`;
  else if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(dist) || !existsSync(file)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const markTransform = (page: Page, selector: string) =>
  page.evaluate((scope) => {
    const ink = [...document.querySelectorAll(`${scope} .mark-ink`)].find(
      (node) => node.getBoundingClientRect().width > 0,
    );
    return ink?.parentElement?.getAttribute('transform') ?? null;
  }, selector);
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

let browser: Browser | undefined;
const checked: string[] = [];
try {
  browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  );
  for (const viewport of viewports) {
    for (const path of ['/', '/nl']) {
      const label = `${viewport.name} ${viewport.width}×${viewport.height} ${path}`;
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        hasTouch: viewport.phone,
        isMobile: viewport.phone,
        deviceScaleFactor: viewport.phone ? 3 : 1,
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource'))
          errors.push(message.text());
      });
      page.on('response', (response) => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
      });
      await page.goto(`${base}${path}`);
      await page.evaluate(() =>
        document
          .querySelector('header a.brand')
          ?.addEventListener('click', (event) => event.preventDefault()),
      );
      for (const target of targets) {
        const host = page.locator(target.selector).first();
        if (!(await host.isVisible())) continue;
        await host.scrollIntoViewIfNeeded();
        if (viewport.phone) await host.tap();
        else {
          await page.mouse.move(viewport.width - 2, viewport.height - 2);
          await host.hover();
        }
        let widest = -Infinity;
        for (let sample = 0; sample < 4; sample++) {
          widest = Math.max(widest, await overflow(page));
          await page.waitForTimeout(40);
        }
        assert.match(
          String(await markTransform(page, target.selector)),
          /scale/,
          `${label} ${target.name}: the mark did not pop`,
        );
        assert.ok(widest <= 0, `${label} ${target.name}: the pop widened the page by ${widest}px`);
        await page.waitForFunction(
          (scope) => {
            const ink = [...document.querySelectorAll(`${scope} .mark-ink`)].find(
              (node) => node.getBoundingClientRect().width > 0,
            );
            return ink !== undefined && !ink.parentElement?.getAttribute('transform');
          },
          target.selector,
          { timeout: 3000 },
        );
        checked.push(`${label} ${target.name}`);
      }
      assert.deepEqual(errors, [], `${label}: browser errors`);
      await context.close();
    }
  }

  const still = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await still.newPage();
  await page.goto(base);
  await page.locator('header a.brand').hover();
  await page.waitForTimeout(200);
  assert.doesNotMatch(
    String(await markTransform(page, 'header a.brand')),
    /scale/,
    'reduced motion: the header lockup popped',
  );
  await still.close();
  process.stdout.write(
    `PASS: the mark pops in ${checked.length} places across ${viewports.length} viewports and both languages, never widens the page, and stays still under reduced motion\n`,
  );
} finally {
  await browser?.close();
  server.close();
}
