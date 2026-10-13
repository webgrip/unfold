/** Feature flags: Settings › Labs lists the flight profile off by default, turning it on draws a demo Work Item as a flight under the CSP, its waypoint opens the Run, the profile scrolls inside its frame at phone width without widening the page, Default restores the stage strip, and an administrator's 100 % rollout authored in the editor turns it on without a Labs choice until the rollout is removed. */
export async function run({ app, page, assert, screenshot }) {
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto(`${origin}/#settings/labs`);
  await page.getByRole('heading', { level: 1, name: 'Labs', exact: true }).waitFor();
  const choice = page.getByRole('group', { name: 'Work Item flight profile: your choice' });
  assert.equal(await choice.getByRole('button', { name: 'Default' }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('heading', { name: 'All feature flags', exact: true }).waitFor();
  assert.ok(await page.getByText('work.flight-profile', { exact: true }).first().isVisible(), 'the administrator table does not list the flag');
  await choice.getByRole('button', { name: 'On', exact: true }).click();
  await page.getByText(/On for you · Your choice: on/).waitFor();
  await screenshot('labs');

  await page.goto(`${origin}/#work/102?lane=leased`);
  const flight = page.locator('figure.flight');
  await flight.waitFor();
  assert.equal(await page.locator('.work-stages').count(), 0, 'the stage strip still shows with the flag on');
  assert.equal(await flight.locator('[data-current]').count(), 1, 'the flight has no single current position');
  const waypoint = flight.locator('button.flight-hit[data-action="work-run"]').first();
  const runId = await waypoint.getAttribute('data-id');
  await waypoint.click();
  await page.waitForFunction(id => document.getElementById(`work-run-${id}`)?.open === true, runId);
  await screenshot('flight-profile');

  await page.setViewportSize({ width: 390, height: 844 });
  await flight.waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'the flight profile widens the page at 390px');
  assert.ok(await flight.locator('.flight-sky').evaluate(element => element.scrollWidth > element.clientWidth), 'the profile should scroll inside its own frame on a phone');
  await screenshot('flight-profile-phone');

  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto(`${origin}/#settings/labs`);
  await page.getByRole('group', { name: 'Work Item flight profile: your choice' }).getByRole('button', { name: 'Default' }).click();
  await page.getByText(/Off for you · The default/).waitFor();
  await page.goto(`${origin}/#work/102?lane=leased`);
  await page.locator('.work-stages').waitFor();
  assert.equal(await page.locator('figure.flight').count(), 0, 'the flight profile still shows after choosing Default');

  await page.goto(`${origin}/#settings/labs`);
  const card = page.locator('.flag-card', { has: page.getByText('work.flight-profile', { exact: true }) });
  await card.getByText('Author a rollout', { exact: true }).click();
  const rule = card.locator('fieldset.flag-rule').first();
  await rule.getByLabel('Who').selectOption('everyone');
  await rule.getByText('Percentage split', { exact: true }).click();
  await rule.getByLabel('on %').fill('100');
  await rule.getByLabel('off %').fill('0');
  await card.getByLabel('Reason').first().fill('Everyone, from the browser flow');
  await card.getByRole('button', { name: 'Save rollout' }).click();
  await page.getByText(/The rollout of work.flight-profile is saved/).waitFor();
  await card.getByText(/^Everyone: split 100 % on/).waitFor();
  await screenshot('rollout');
  await page.goto(`${origin}/#work/102?lane=leased`);
  await page.locator('figure.flight').waitFor();
  await page.goto(`${origin}/#settings/labs`);
  await page.locator('.flag-card', { has: page.getByText('work.flight-profile', { exact: true }) }).getByRole('button', { name: 'Remove rollout' }).click();
  await page.getByText(/follows its Git rules again/).waitFor();
}
