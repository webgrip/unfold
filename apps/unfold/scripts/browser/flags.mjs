/** Feature flags: Settings › Labs lists the live view off by default, turning it on draws a demo Work Item's live view under the CSP in place of the stage strip, a hop opens its Run, the flight stands up as a vertical log at phone width without widening the page, Default restores the stage strip, and an administrator's 100 % rollout authored in the editor turns it on without a Labs choice until the rollout is removed. */
export async function run({ app, page, assert, screenshot }) {
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto(`${origin}/#settings/labs`);
  await page.getByRole('heading', { level: 1, name: 'Labs', exact: true }).waitFor();
  const choice = page.getByRole('group', { name: 'Live Work Item view: your choice' });
  assert.equal(await choice.getByRole('button', { name: 'Default' }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('heading', { name: 'All feature flags', exact: true }).waitFor();
  assert.ok(await page.getByText('work.live-view', { exact: true }).first().isVisible(), 'the administrator table does not list the flag');
  await choice.getByRole('button', { name: 'On', exact: true }).click();
  await page.getByText(/On for you · Your choice: on/).waitFor();
  await screenshot('labs');

  await page.goto(`${origin}/#work/102?lane=leased`);
  const flight = page.locator('.work-live figure.lv-fp');
  await flight.waitFor();
  assert.equal(await page.locator('.work-stages').count(), 0, 'the stage strip still shows with the flag on');
  assert.equal(await page.locator('.work-live .lv-folds [aria-current="step"]').count(), 1, 'the fold strip has no single current stage');
  const hop = flight.locator('button.lv-fp-hit[data-action="work-run"]').first();
  const runId = await hop.getAttribute('data-id');
  await hop.click();
  await page.waitForFunction(id => document.getElementById(`work-run-${id}`)?.open === true, runId);
  await screenshot('live-view');

  await page.setViewportSize({ width: 390, height: 844 });
  await flight.waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'the live view widens the page at 390px');
  assert.equal(await flight.locator('.lv-fp-track').evaluate(element => getComputedStyle(element).flexDirection), 'column', 'the flight should stand up as a vertical log on a phone');
  await screenshot('live-view-phone');

  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto(`${origin}/#settings/labs`);
  const liveRow = page.locator('.labs-row', { has: page.getByRole('group', { name: 'Live Work Item view: your choice' }) });
  await liveRow.getByRole('button', { name: 'Default' }).click();
  await liveRow.getByText(/Off for you · The default/).waitFor();
  await page.goto(`${origin}/#work/102?lane=leased`);
  await page.locator('.work-stages').waitFor();
  assert.equal(await page.locator('.work-live').count(), 0, 'the live view still shows after choosing Default');

  await page.goto(`${origin}/#settings/labs`);
  const card = page.locator('.flag-card', { has: page.getByText('work.live-view', { exact: true }) });
  await card.getByText('Author a rollout', { exact: true }).click();
  const rule = card.locator('fieldset.flag-rule').first();
  await rule.getByLabel('Who').selectOption('everyone');
  await rule.getByText('Percentage split', { exact: true }).click();
  await rule.getByLabel('on %').fill('100');
  await rule.getByLabel('off %').fill('0');
  await card.getByLabel('Reason').first().fill('Everyone, from the browser flow');
  await card.getByRole('button', { name: 'Save rollout' }).click();
  await page.getByText(/The rollout of work.live-view is saved/).waitFor();
  await card.getByText(/^Everyone: split 100 % on/).waitFor();
  await screenshot('rollout');
  await page.goto(`${origin}/#work/102?lane=leased`);
  await page.locator('.work-live figure.lv-fp').waitFor();
  await page.goto(`${origin}/#settings/labs`);
  await page.locator('.flag-card', { has: page.getByText('work.live-view', { exact: true }) }).getByRole('button', { name: 'Remove rollout' }).click();
  await page.getByText(/follows its Git rules again/).waitFor();
}
