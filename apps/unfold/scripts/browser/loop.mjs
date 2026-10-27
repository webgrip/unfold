/** The loop on Now: the desk stays while now.loop is off; turning it on under Labs shows Decide, Unstick and Start in that order with the day line (at most two facts), every Unstick button labelled, j and k still moving between rows and Cancel in the demo disabled, Up next lists the first five fixture tasks agents can take in the tracker’s order with why each is there, Show all and Include add the rest with their reasons, h opens the hand-off sheet on the demo fixture task with its readiness, the demo note and no live button, Escape returns focus to the row, Try again on a stopped demo Work Item asks for a note and says the demo spends nothing, Snooze opens its choices by keyboard and Escape closes them, a snoozed row and a dismissed refusal leave the lane, the day line and the Now badge alike, survive a reload, list under "N snoozed · Show" and come back with Unsnooze, the loop fits 390px without widening the page, with the Fleet board on too the Now switch reads Loop and Fleet and moves between them, and Default brings the desk back. */
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
  assert.match(day, /things need you: \d+ to decide, \d+ to unstick, \d+ could not start/);
  assert.match(day, /no spend in the demo/);
  const counted = Number(day.match(/(\d+) things need you/)[1]);
  const listed = Number((await loop.locator('#loop-decide-title .count').textContent()) || 0) + Number((await loop.locator('#loop-unstick-title .count').textContent()) || 0);
  assert.equal(counted, listed, 'the day line and the lane counts disagree');
  const badge = Number(await page.locator('[data-count-for="waiting"]').first().textContent());
  assert.equal(badge, counted, 'the Now badge and the day line disagree');
  const facts = await loop.locator('.loop-day-facts').textContent();
  assert.ok(facts.split(' · ').length <= 2, `the day line carries more than two facts: ${facts}`);
  assert.doesNotMatch(facts, /finished in 24 h|stopped retrying|moving/);
  const unstickButtons = loop.locator('.loop-unstick .now-item-actions .button');
  assert.ok(await unstickButtons.count() > 0, 'Unstick rows offer no button');
  for (const label of await unstickButtons.evaluateAll(buttons => buttons.map(button => ({ text: button.querySelector('.button-label')?.textContent.trim() || '', iconOnly: button.classList.contains('icon-only'), externals: button.querySelectorAll('.icon').length })))) {
    assert.ok(label.text && !label.iconOnly, 'an Unstick button has no visible label');
    assert.ok(label.externals <= 2, `"${label.text}" carries more than a lead and an external icon`);
  }
  const firstRow = loop.locator('.loop-unstick [data-now-row]').first();
  await firstRow.focus();
  await page.keyboard.press('j');
  assert.notEqual(await page.evaluate(() => document.activeElement?.id), await firstRow.getAttribute('id'), 'j does not move past an Unstick row and its buttons');
  await page.keyboard.press('k');
  assert.equal(await page.evaluate(() => document.activeElement?.id), await firstRow.getAttribute('id'), 'k does not come back to the Unstick row');
  const cancel = loop.locator('[data-action="now-cancel"]').first();
  if (await cancel.count()) {
    await cancel.click();
    const dialog = page.locator('dialog[open] form.work-cancel-form');
    await dialog.waitFor();
    await dialog.getByText('Not available in the demo').waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Cancel Work Item' }).isDisabled(), true, 'the demo cancels from Now');
    await dialog.getByRole('button', { name: 'Keep it' }).click();
  }
  const startRow = loop.locator('[data-action="start-open"]').first();
  await startRow.waitFor();
  const upNext = loop.locator('.loop-start');
  const rows = upNext.locator('[data-action="start-open"]');
  assert.equal(await rows.count(), 5, 'Up next does not stop at the first five tasks agents can take');
  await upNext.getByText('In your tracker’s order · 6 tasks agents can take, all marked ready').waitFor();
  await upNext.getByText(/^You can take \d+ more reviews?/).waitFor();
  assert.equal(await upNext.getByText('Marked ready', { exact: true }).count(), 0, 'every row repeats Marked ready');
  assert.match(await rows.first().textContent(), /Fix checkout rounding[\s\S]*Priority urgent · due /);
  assert.equal(await upNext.getByText(/Packaging boxes|Interview five shops/i).count(), 0, 'Up next lists tasks agents cannot take by default');
  await screenshot('loop');
  await upNext.getByRole('button', { name: 'Show all 6' }).click();
  await upNext.getByText('Tracker order #6').waitFor();
  assert.equal(await rows.count(), 6);
  await upNext.getByRole('button', { name: 'Include tasks agents cannot take (2)' }).click();
  await upNext.getByText('repo/warehouse names no repository Ploeg knows').waitFor();
  await upNext.getByText(/^market-research is not ready for agents: example\/market-research has no AGENTS\.md/).waitFor();
  assert.equal(await rows.count(), 8);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'start-include', 'Include loses focus when the lane redraws');
  await screenshot('loop-up-next-all');
  await upNext.getByRole('button', { name: 'Include tasks agents cannot take (2)' }).click();
  await upNext.getByRole('button', { name: 'Show the first 5' }).click();
  assert.equal(await rows.count(), 5);

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

  const needYou = async () => Number(((await loop.locator('.loop-day-title').textContent()).match(/^(\d+) things? needs? you/) || [0, 0])[1]);
  const nowBadge = async () => Number(await page.locator('[data-count-for="waiting"]').first().textContent() || 0);
  const announced = text => page.waitForFunction(pattern => new RegExp(pattern).test(document.getElementById('announcement')?.textContent || ''), text.source);
  const before = await needYou();
  const toggle = loop.locator('[data-action="now-snooze-menu"][data-target="work"]').first();
  const workKey = await toggle.getAttribute('data-key');
  await toggle.focus();
  await page.keyboard.press('Enter');
  const options = loop.getByRole('group', { name: /^Snooze “.+” on your Now$/ });
  await options.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.until), '1d', 'opening Snooze does not move focus to its first choice');
  await page.keyboard.press('Escape');
  await options.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.key), workKey, 'Escape does not return focus to Snooze');
  await page.keyboard.press('Enter');
  await options.waitFor();
  await page.keyboard.press('Enter');
  await announced(/Snoozed “.+” for a day; it comes back sooner if it changes\. Only your Now changed\. This is the demo: nothing was written outside Unfold\./);
  assert.equal(await loop.locator(`[data-action="now-snooze-menu"][data-key="${workKey}"]`).count(), 0, 'a snoozed row still shows');
  assert.equal(await needYou(), before - 1, 'a snoozed row still counts in the day line');
  assert.equal(await nowBadge(), before - 1, 'the Now badge and the day line disagree after a snooze');
  await loop.getByRole('button', { name: '1 snoozed · Show' }).waitFor();

  const refused = loop.locator('[data-action="now-snooze-menu"][data-target="task"]').first();
  if (await refused.count()) {
    await refused.click();
    await loop.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await announced(/Dismissed “.+” until it changes\./);
    assert.equal(await needYou(), before - 2, 'a dismissed refusal still counts');
    await page.reload();
    await loop.waitFor();
    await loop.getByRole('button', { name: '2 snoozed or dismissed · Show' }).waitFor();
    assert.equal(await needYou(), before - 2, 'snoozes did not survive a reload');
    assert.equal(await nowBadge(), before - 2, 'the Now badge and the day line disagree after a reload');
  }
  await loop.locator('#now-snoozed-toggle').click();
  await loop.locator('[data-action="now-unsnooze"]').first().waitFor();
  await screenshot('loop-snoozed');
  while (await loop.locator('[data-action="now-unsnooze"]').count()) {
    await loop.locator('[data-action="now-unsnooze"]').first().click();
    await announced(/Unsnoozed\. It shows on your Now again\./);
    await page.evaluate(() => { document.getElementById('announcement').textContent = ''; });
  }
  assert.equal(await loop.locator('#now-snoozed-toggle').count(), 0, 'the snoozed line stays after unsnoozing everything');
  assert.equal(await needYou(), before, 'unsnoozing does not bring the count back');
  assert.equal(await nowBadge(), before);

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
