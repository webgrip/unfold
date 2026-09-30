/** The workbench chrome: the home link at phone width. */
export async function run({ page, assert, screenshot }) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'De Vloer home' }).click();
  await page.locator('.now-group').first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile Now layout overflows horizontally');
  await screenshot('mobile');
}
