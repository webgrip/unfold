import { readFile } from 'node:fs/promises';

const recorded = JSON.parse(await readFile(new URL('../../test/fixtures/session-059675b9.json', import.meta.url), 'utf8'));
const id = '109';
const fixture = { ...recorded, ploeg: { ...recorded.ploeg, item: { ...recorded.ploeg.item, id } }, card: { ...recorded.card, workItemId: id }, session: { ...recorded.session, execution: { ...recorded.session.execution, workItemId: id } } };

/** The 059675b9 worst case, served as the demo's Work Item 109 so every other read of that Work Item still answers. */
export async function run({ page, app, assert, screenshot }) {
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const detail = route => route.fulfill({ json: { ...fixture.ploeg, demo: false } });
  const card = route => route.fulfill({ json: { card: fixture.card } });
  const sessions = async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, json: [...await response.json(), fixture.session] });
  };
  await page.route(`**/api/ploeg/work-items/${id}`, detail);
  await page.route(`**/api/ploeg/work-items/${id}?*`, detail);
  await page.route(`**/api/ploeg/work-items/${id}/card`, card);
  await page.route('**/api/sessions', sessions);
  try {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1040 });
      await page.goto(`${origin}/#work/${id}?lane=all`);
      await page.reload();
      const callout = page.locator('.callout', { hasText: 'Implementer finished · stopped: Ploeg holds it' });
      await callout.waitFor();
      const text = (await callout.innerText()).replace(/\s+/g, ' ');
      assert.match(text, /Implementer finished · stopped: Ploeg holds it for reconciliation/, 'the browser reads the session through the same statechart as VS Code');
      assert.match(text, /Reviewer reader · Cut off/);
      assert.match(text, /Ploeg still lists its operator Run as running/);
      const page2 = (await page.locator('.work-detail, main').first().innerText()).replace(/\s+/g, ' ');
      assert.doesNotMatch(page2, /0 Rounds/, 'Rounds never read 0 beside Round 1');
      assert.doesNotMatch(text, /Reviewer reader · Running/);
      await callout.getByRole('link', { name: /Open the session/ }).focus();
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), `#session/${fixture.session.id}`, 'the session link is reachable by keyboard');
      const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      assert.ok(scrollWidth <= innerWidth, `no horizontal overflow at ${width}px`);
      await callout.scrollIntoViewIfNeeded();
      await screenshot(`work-progress-059675b9-${width}`);
    }
  } finally {
    await page.unroute(`**/api/ploeg/work-items/${id}`, detail);
    await page.unroute(`**/api/ploeg/work-items/${id}?*`, detail);
    await page.unroute(`**/api/ploeg/work-items/${id}/card`, card);
    await page.unroute('**/api/sessions', sessions);
    await page.setViewportSize({ width: 1440, height: 1040 });
  }
}
