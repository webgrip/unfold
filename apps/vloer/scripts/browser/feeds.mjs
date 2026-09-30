import { navigate } from './navigate.mjs';

/** Ploeg feeds: Insights tiles and table, activity paging and kinds, Runs filters and proposed-work rejection, at desktop and phone widths. */
export async function run({ page, assert, screenshot }) {
  await navigate(page, 'Insights');
  const noOverflow = async label => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${label} overflows horizontally`);
  await page.getByRole('heading', { name: 'Teams', exact: true }).waitFor();
  for (const viewport of [{ width: 1440, height: 1040 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await navigate(page, 'Insights');
    await page.getByRole('heading', { name: 'Teams', exact: true }).waitFor();
    await page.getByRole('button', { name: '7 days', exact: true }).click();
    await page.getByText('Settled · 7d', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Refresh', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '7 days', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.ploeg-tile').count(), 6);
    await page.getByText('Illustrative Ploeg records. No Run executed, no model was called and spend is US$ 0,00.', { exact: true }).waitFor();
    assert.equal(await page.locator('.ploeg-table tbody tr').count(), 2);
    assert.equal(await page.locator('main svg polyline, main canvas').count(), 0, 'The overview must not draw a line chart');
    await noOverflow(`Ploeg overview at ${viewport.width}px`);
    await screenshot(`ploeg-overview-${viewport.width}`);
    await navigate(page, 'Activity');
    await page.locator('.ploeg-feed-item').first().waitFor();
    assert.equal(await page.locator('.ploeg-feed-item').count(), 10);
    await page.getByRole('button', { name: 'Load older', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.ploeg-feed-item').length === 15);
    assert.equal(new Set(await page.locator('.ploeg-feed-item').evaluateAll(rows => rows.map(row => row.dataset.eventId))).size, 15, 'The activity feed repeated an event');
    await page.getByLabel('Event kind', { exact: true }).selectOption('work');
    assert(await page.locator('.ploeg-feed-item').count() < 15);
    await page.getByLabel('Event kind', { exact: true }).selectOption('');
    await noOverflow(`Ploeg activity at ${viewport.width}px`);
    await screenshot(`ploeg-activity-${viewport.width}`);
    await navigate(page, 'Runs');
    await page.locator('.ploeg-runs-table tbody tr').first().waitFor();
    assert.equal(await page.locator('.ploeg-runs-table tbody tr').count(), 7);
    await page.getByLabel('Run state', { exact: true }).selectOption('running');
    await page.waitForFunction(() => document.querySelectorAll('.ploeg-runs-table tbody tr').length === 1);
    assert.equal(await page.getByLabel('Run outcome', { exact: true }).isDisabled(), true, 'Only finished Runs have an outcome');
    await page.getByLabel('Run state', { exact: true }).selectOption('');
    await page.waitForFunction(() => document.querySelectorAll('.ploeg-runs-table tbody tr').length === 7);
    await noOverflow(`Ploeg runs at ${viewport.width}px`);
    await screenshot(`ploeg-runs-${viewport.width}`);
    await navigate(page, 'Proposed');
    await page.getByRole('heading', { name: 'Proposed work', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Add a regression test for negative half-cent totals', exact: true }).waitFor();
    await noOverflow(`Ploeg proposed work at ${viewport.width}px`);
    await screenshot(`ploeg-proposed-${viewport.width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1040 });
  const research = page.getByRole('article', { name: 'Clarify which markets the research brief covers' });
  await research.getByRole('button', { name: 'Reject', exact: true }).click();
  const rejection = page.getByRole('dialog');
  await rejection.getByRole('button', { name: 'Reject', exact: true }).click();
  assert.equal(await rejection.isVisible(), true, 'A rejection without a reason was submitted');
  await rejection.getByLabel('Reason', { exact: true }).fill('The brief already names its markets.');
  await rejection.getByRole('button', { name: 'Reject', exact: true }).click();
  await page.getByText('Recorded in this demo only. Nothing was dispatched.', { exact: true }).waitFor();
  await research.waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: 'Approve', exact: true }).count(), 1);
}
