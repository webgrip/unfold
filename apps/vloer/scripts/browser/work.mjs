/** Work: the awaiting-review lane, the review screen at phone width, and the needs-human lane. */
export async function run({ page, assert, screenshot }) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.ploeg-tabs').getByRole('link', { name: 'Awaiting review', exact: true }).click();
  await page.locator('[data-action="ploeg-item"][data-id="105"]').click();
  await page.getByRole('heading', { name: 'Ready for your review' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Open pull request' }).getAttribute('href'), 'https://forge.example.invalid/example/order-service/pulls/5');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Ploeg review layout overflows horizontally');
  await screenshot('ploeg-review-mobile');
  await page.getByRole('button', { name: 'Close work item details' }).click();
  await page.locator('.ploeg-lanes').getByRole('button', { name: 'Needs human' }).click();
  await page.locator('[data-action="ploeg-item"][data-id="101"]').waitFor();
  await page.setViewportSize({ width: 1440, height: 1040 });
}
