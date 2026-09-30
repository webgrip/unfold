import { navigate } from './navigate.mjs';

/** Settings: the Environment health checks, and Preferences for theme, density, single-key shortcuts and live updates, kept across a reload. */
export async function run({ page, assert, screenshot }) {
  const root = name => page.evaluate(attribute => document.documentElement.getAttribute(attribute), name);
  await navigate(page, 'Settings');
  await page.getByRole('link', { name: 'Environment', exact: true }).click();
  await page.getByRole('heading', { name: 'Health checks', exact: true }).waitFor();
  const ploegCheck = page.locator('.health-check', { has: page.getByRole('heading', { name: 'Ploeg connection', exact: true }) });
  await ploegCheck.getByText('Demo data', { exact: true }).waitFor();
  assert.equal(await page.locator('.health-check').count(), 6, 'the Environment page does not list every health check');
  await screenshot('environment');
  await page.getByRole('link', { name: 'Preferences', exact: true }).click();
  await page.getByRole('heading', { level: 1, name: 'Preferences', exact: true }).waitFor();
  await page.getByRole('radio', { name: /^Dark/ }).check();
  assert.equal(await root('data-theme'), 'dark');
  await page.getByRole('radio', { name: /^Compact/ }).check();
  assert.equal(await root('data-density'), 'compact');
  await page.reload();
  await page.getByRole('heading', { level: 1, name: 'Preferences', exact: true }).waitFor();
  assert.equal(await root('data-theme'), 'dark', 'the theme did not survive a reload');
  assert.equal(await page.getByRole('radio', { name: /^Dark/ }).isChecked(), true);
  await screenshot('preferences-dark');
  await page.getByRole('switch', { name: 'Refresh automatically', exact: true }).uncheck();
  assert.equal(await page.locator('.app-topbar [data-live-label]').textContent(), 'Paused', 'the live updates switch and the top bar disagree');
  await page.getByRole('switch', { name: 'Refresh automatically', exact: true }).check();
  assert.equal(await page.locator('.app-topbar [data-live-label]').textContent(), 'Live');
  await page.getByRole('switch', { name: 'Single-key shortcuts', exact: true }).uncheck();
  await page.locator('#page-title').focus();
  await page.keyboard.press('?');
  assert.equal(await page.locator('#shortcuts').evaluate(dialog => dialog.open), false, 'a single-key shortcut ran while switched off');
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog', { name: 'Search and commands' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('switch', { name: 'Single-key shortcuts', exact: true }).check();
  await page.getByRole('radio', { name: /^System/ }).check();
  await page.getByRole('radio', { name: /^Comfortable/ }).check();
  assert.equal(await root('data-theme'), null);
  assert.equal(await root('data-density'), null);
}
