/** The loop on Now: the desk stays while now.loop is off; turning it on under Labs shows Decide, Unstick and Start in that order with the day line, h opens the hand-off sheet on the demo fixture task with its readiness, the demo note and no live button, Escape returns focus to the row, Try again on a stopped demo Work Item asks for a note and says the demo spends nothing, the loop fits 390px without widening the page, with the Fleet board on too the Now switch reads Loop and Fleet and moves between them, and Default brings the desk back. */
export async function run({ app, page, assert, screenshot }) {
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto(`${origin}/#now`);
  await page.getByRole('heading', { level: 1, name: 'Now', exact: true }).waitFor();
  await page.locator('[data-now-row]').first().waitFor();
  assert.equal(await page.locator('.now-loop').count(), 0, 'the loop shows while the flag is off');

  await page.goto(`${origin}/#settings/labs`);
  const choice = page.getByRole('group', { name: 'The loop on Now: your choice' });
  await choice.getByRole('button', { name: 'On', exact: true }).click();
  await page.getByText(/On for you · Your choice: on/).first().waitFor();

  await page.goto(`${origin}/#now`);
  const loop = page.locator('.now-loop');
  await loop.waitFor();
  await page.locator('.boot').first().waitFor({ state: 'detached' });
  const titles = await loop.locator('.loop-lanes > section h2').allTextContents();
  assert.deepEqual(titles.map(title => title.replace(/\d+$/, '')), ['Decide', 'Unstick', 'Up next'], `the lanes are out of order: ${titles.join(', ')}`);
  const day = await loop.locator('.loop-day').textContent();
  assert.match(day, /things need you: \d+ to decide, \d+ stuck, \d+ could not start/);
  assert.match(day, /no spend in the demo/);
  const counted = Number(day.match(/(\d+) things need you/)[1]);
  const listed = Number((await loop.locator('#loop-decide-title .count').textContent()) || 0) + Number((await loop.locator('#loop-unstick-title .count').textContent()) || 0);
  assert.equal(counted, listed, 'the day line and the lane counts disagree');
  const badge = Number(await page.locator('[data-count-for="waiting"]').first().textContent());
  assert.equal(badge, counted, 'the Now badge and the day line disagree');
  const startRow = loop.locator('[data-action="start-open"]').first();
  await startRow.waitFor();
  await screenshot('loop');

  await startRow.focus();
  await page.keyboard.press('h');
  const sheet = page.locator('dialog.sheet-dialog[open]');
  await sheet.waitFor();
  await sheet.getByText('Names acceptance conditions').waitFor();
  await sheet.getByText(/Fixture task · Ploeg cannot receive it/).waitFor();
  await sheet.getByText('Demo fixture tasks are not linked to Ploeg.').waitFor();
  assert.equal(await sheet.locator('#sheet-submit').isDisabled(), true, 'the demo sheet offers a live hand-off');
  await screenshot('loop-sheet');
  await page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.action), 'start-open', 'Escape does not return focus to the task row');

  const retry = loop.locator('[data-action="loop-retry"]').first();
  if (await retry.count()) {
    await retry.click();
    const dialog = page.locator('dialog[open] form[data-form="loop-retry"]');
    await dialog.waitFor();
    await dialog.getByText(/This is the demo: nothing restarts and nothing is spent/).waitFor();
    await dialog.locator('#loop-retry-note').fill('The file moved.');
    await dialog.getByRole('button', { name: 'Try again' }).click();
    await page.getByText(/nothing restarted and nothing was spent|Started .* again/).first().waitFor();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await loop.waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'the loop widens the page at 390px');
  await startRow.click();
  await sheet.waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'the sheet widens the page at 390px');
  await screenshot('loop-sheet-phone');
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto(`${origin}/#settings/labs`);
  const fleetChoice = page.getByRole('group', { name: 'Fleet board on Now: your choice' });
  await fleetChoice.getByRole('button', { name: 'On', exact: true }).click();
  await page.goto(`${origin}/#now`);
  const modes = page.getByRole('group', { name: 'Show Now as' });
  await modes.getByRole('button', { name: 'Loop' }).click();
  await loop.waitFor();
  await modes.getByRole('button', { name: 'Fleet' }).click();
  await page.locator('article.fb').waitFor();
  assert.equal(await page.locator('.now-loop').count(), 0, 'Fleet still shows the loop');
  await modes.getByRole('button', { name: 'Loop' }).click();
  await loop.waitFor();
  await page.goto(`${origin}/#settings/labs`);
  await fleetChoice.getByRole('button', { name: 'Default' }).click();
  await choice.getByRole('button', { name: 'Default' }).click();
  await page.getByText(/Your choice: default/i).first().waitFor().catch(() => {});
  await page.goto(`${origin}/#now`);
  await page.locator('[data-now-row]').first().waitFor();
  assert.equal(await page.locator('.now-loop').count(), 0, 'Default leaves the loop on');
}
