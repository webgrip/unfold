import { navigate } from './navigate.mjs';

/** Work: lanes, the review decision at phone width, master-detail at desktop width, keys, the demo cancel dialog and the remembered Team. */
export async function run({ page, assert, screenshot }) {
  const overviewReads = [];
  const sessionReads = [];
  const onRequest = request => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/ploeg') overviewReads.push(request.url());
    if (path === '/api/sessions') sessionReads.push(request.url());
  };
  page.on('request', onRequest);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await navigate(page, 'Work');
    const lanes = page.getByRole('group', { name: 'Lane' });
    await lanes.getByRole('button', { name: /^Ready for review/ }).click();
    assert.equal(await page.evaluate(() => location.hash), '#work?lane=awaiting_review');
    const listReads = overviewReads.length;
    await page.locator('[data-work-row][data-id="105"]').click();
    await page.getByRole('heading', { name: 'Ready for your review' }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id === 'ploeg-item-title');
    assert.equal(await page.locator('#ploeg-item-title').textContent(), 'Round half-cent totals consistently');
    assert.equal(await page.getByRole('link', { name: 'Open pull request' }).getAttribute('href'), 'https://forge.example.invalid/example/order-service/pulls/5');
    assert.equal(await page.locator('.work-sticky-actions').isVisible(), true, 'phones keep the pull request in a sticky action bar');
    assert.equal(await page.getByText('CI checks: not reported').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'the Work Item page overflows horizontally at 390 px');
    await screenshot('ploeg-review-mobile');
    await page.locator('.work-back').click();
    await page.locator('[data-work-row][data-id="105"]').waitFor();
    assert.equal(overviewReads.length, listReads, 'opening and closing a Work Item does not reload the lists');
    await page.waitForFunction(() => document.activeElement?.dataset?.id === '105');
    await lanes.getByRole('button', { name: /^Needs you/ }).click();
    await page.locator('[data-work-row][data-id="101"]').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'the Work list overflows horizontally at 390 px');

    await page.setViewportSize({ width: 1440, height: 1040 });
    await page.locator('[data-work-row][data-id="109"]').click();
    await page.getByRole('heading', { name: 'Why this needs you' }).waitFor();
    assert.equal(await page.locator('.work-list-pane').isVisible(), true, 'the list stays beside the Work Item on wide screens');
    assert.equal(await page.locator('[data-work-row][data-id="109"]').getAttribute('aria-current'), 'true');
    assert.equal(await page.locator('.work-sticky-actions').isVisible(), false);
    await page.locator('[data-action="work-run"][data-id="44"]').first().click();
    assert.equal(await page.locator('#work-run-44').evaluate(element => element.open), true, 'the evidence link opens its Run');
    await page.getByRole('button', { name: 'Cancel Work Item' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cancel this Work Item?' });
    await dialog.waitFor();
    assert.equal(await dialog.getByText('Not available in the demo').isVisible(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Cancel Work Item' }).isDisabled(), true, 'the demo cannot cancel anything');
    await dialog.getByRole('button', { name: 'Keep it' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => location.hash === '#work?lane=needs_human');
    await page.locator('#ploeg-item-title').waitFor({ state: 'detached' });
    await page.locator('[data-work-row][data-id="109"]').focus();
    await page.keyboard.press('j');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.id), '110', 'j moves to the next row');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.id === 'ploeg-item-title');
    assert.equal(await page.locator('#ploeg-item-title').textContent(), 'Summarise payment-provider fees for the pricing brief');
    await page.getByRole('button', { name: 'Close work item details' }).click();
    await page.locator('#ploeg-item-title').waitFor({ state: 'detached' });
    assert(sessionReads.length <= 1, `Work reads the sessions at most once, read ${sessionReads.length} times`);

    await page.locator('#ploeg-team').selectOption('research');
    await page.locator('[data-work-row][data-id="110"]').waitFor();
    assert.equal(await page.locator('[data-work-row][data-id="109"]').count(), 0);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('vloer.prefs')).team), 'research', 'the Team choice is remembered');
    await page.locator('#ploeg-team').selectOption('');
    await page.locator('[data-work-row][data-id="109"]').waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('vloer.prefs')).team), null);
    await page.getByRole('button', { name: 'Refresh' }).focus();
    const reads = overviewReads.length;
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.work-refresh[aria-busy="true"]'));
    assert(overviewReads.length > reads, 'Refresh reads the lists again');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.action), 'ploeg-refresh', 'Refresh keeps the keyboard focus');
  } finally {
    page.off('request', onRequest);
  }
}
