/** The Now page: landing route, mobile layout and j/k row navigation. */
export async function run({ page, app, assert, screenshot }) {
  await page.goto(`http://127.0.0.1:${app.server.address().port}`);
  await page.getByRole('heading', { name: 'Now', exact: true }).first().waitFor();
  assert.equal(new URL(page.url()).hash, '#now', 'Vloer does not open on the Now page');
  await page.locator('.now-group').first().waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Now layout overflows horizontally at 390px');
  await page.keyboard.press('j');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.nowRow !== undefined), true, 'j did not focus a Now row');
  const firstNowRow = await page.evaluate(() => document.activeElement?.getAttribute('href'));
  await page.keyboard.press('j');
  assert.notEqual(await page.evaluate(() => document.activeElement?.getAttribute('href')), firstNowRow, 'j did not move to the next Now row');
  await page.keyboard.press('k');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), firstNowRow, 'k did not move back to the previous Now row');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.hash.startsWith('#ploeg/'));
  await page.getByRole('link', { name: 'Now', exact: true }).click();
  await page.locator('.now-group').first().waitFor();
  await screenshot('now-mobile');
  await page.setViewportSize({ width: 1440, height: 1040 });
  await screenshot('dashboard');
}
