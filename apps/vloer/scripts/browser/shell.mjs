/** The workbench chrome: redirects from old links, focus and title on route changes, keyboard shortcuts, the palette placeholder and the home link at phone width. */
export async function run({ page, app, assert, screenshot }) {
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const hash = () => page.evaluate(() => location.hash);
  await page.setViewportSize({ width: 1440, height: 1040 });
  for (const [from, to, heading] of [['#ploeg/lane/needs_human', '#work?lane=needs_human', 'Work'], ['#ploeg/105', '#work/105', 'Work'], ['#ploeg', '#insights', 'Insights'], ['#ploeg/runs', '#runs', 'Runs'], ['#account', '#settings/accounts', 'Linked accounts'], ['#system', '#settings/environment', 'Environment'], ['#compare/a/b', '#sessions', 'Sessions']]) {
    await page.goto(`${base}/${from}`);
    await page.getByRole('heading', { level: 1, name: heading, exact: true }).waitFor();
    assert.equal(await hash(), to, `${from} did not redirect to ${to}`);
  }
  const historyLength = await page.evaluate(() => history.length);
  await page.evaluate(() => { location.hash = 'ploeg/activity'; });
  await page.waitForFunction(() => location.hash === '#activity');
  assert.equal(await page.evaluate(() => history.length), historyLength + 1, 'a redirect replaces the old entry instead of adding one');
  await page.getByRole('heading', { level: 1, name: 'Activity', exact: true }).waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'page-title');
  assert.equal(await page.title(), 'Activity · De Vloer');
  assert.equal(await page.locator('#announcement').textContent(), 'Activity');
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await help.getByText('Search and commands').first().waitFor();
  await page.keyboard.press('Escape');
  await help.waitFor({ state: 'hidden' });
  await page.keyboard.press('g');
  await page.keyboard.press('w');
  await page.waitForFunction(() => location.hash === '#work');
  await page.getByRole('heading', { level: 1, name: 'Work', exact: true }).waitFor();
  await page.keyboard.press('/');
  const palette = page.getByRole('dialog', { name: 'Search and commands' });
  await palette.getByText('Coming soon.', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await palette.waitFor({ state: 'hidden' });
  await page.keyboard.press('Control+k');
  await palette.waitFor();
  await palette.getByRole('button', { name: 'Close search' }).click();
  await palette.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'De Vloer home' }).click();
  await page.locator('.now-group').first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile Now layout overflows horizontally');
  await screenshot('mobile');
}
