import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

export async function captureUnified(base, sessionId, workItemId, outputDir, phase = 'completed') {
  const origin = new URL(base);
  assert(['http:', 'https:'].includes(origin.protocol) && !origin.username && !origin.password && !origin.search && !origin.hash, 'Use the workbench origin without credentials');
  assert(/^[A-Za-z0-9_-]+$/.test(sessionId), 'Invalid session identifier');
  assert(/^[1-9][0-9]{0,19}$/.test(workItemId), 'Invalid work item identifier');
  assert(/^[A-Za-z0-9_-]+$/.test(phase), 'Invalid evidence phase');
  const directory = resolve(outputDir);
  await mkdir(directory, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.VLOER_CHROMIUM_BIN ? { executablePath: process.env.VLOER_CHROMIUM_BIN } : {}) });
  const paths = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1040 } });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin.origin}/#session/${sessionId}`);
    await page.getByRole('region', { name: 'Ploeg execution ownership', exact: true }).waitFor();
    const sessionResponse = await page.request.get(`${origin.origin}/api/sessions/${sessionId}`);
    assert.equal(sessionResponse.status(), 200);
    const session = await sessionResponse.json();
    assert.equal(session.execution?.workItemId, workItemId, 'The session is not linked to the requested Ploeg item');
    const detailResponse = await page.request.get(`${origin.origin}/api/ploeg/work-items/${workItemId}`);
    assert.equal(detailResponse.status(), 200);
    const detail = await detailResponse.json();
    assert.equal(detail.demo, false, 'Unified evidence must use actual Ploeg records, not illustrative projections');
    assert.equal(detail.item.id, workItemId);
    const capture = async name => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} overflows horizontally`);
      const path = join(directory, `${phase}-${name}.png`);
      await page.screenshot({ path, fullPage: true }); paths.push(path);
    };
    await capture('session-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('session-mobile');
    await page.locator(`a[href="#ploeg/${workItemId}"]`).click();
    await page.locator('#ploeg-item-title').waitFor();
    assert.equal(await page.locator('#ploeg-item-title').textContent(), detail.item.title);
    await page.locator(`.ploeg-linked-sessions a[href="#session/${sessionId}"]`).waitFor();
    await capture('ploeg-mobile');
    await page.setViewportSize({ width: 1440, height: 1040 });
    await capture('ploeg-desktop');
    assert.deepEqual(errors, [], 'Unified browser evidence encountered a script error');
    return { browser: `Chromium ${browser.version()}`, sessionId, workItemId, paths };
  } finally { await browser.close(); }
}
