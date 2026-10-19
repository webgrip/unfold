/** The fleet board: Now offers no Desk and Fleet switch while now.fleet is off, turning it on under Labs shows the fleet with the demo's Teams as lanes under the CSP, a plane opens its Work Item without a script error, Desk brings back the waiting list and stays chosen across a reload, the board fits 390px without widening the page, reduced motion stops the planes and approach lights, and Default removes the switch again. */
export async function run({ app, page, assert, screenshot }) {
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto(`${origin}/#now`);
  await page.getByRole('heading', { level: 1, name: 'Now', exact: true }).waitFor();
  assert.equal(await page.getByRole('group', { name: 'Show Now as' }).count(), 0, 'the Desk and Fleet switch shows while the flag is off');

  await page.goto(`${origin}/#settings/labs`);
  const choice = page.getByRole('group', { name: 'Fleet board on Now: your choice' });
  await choice.getByRole('button', { name: 'On', exact: true }).click();
  await page.getByText(/On for you · Your choice: on/).first().waitFor();

  await page.goto(`${origin}/#now`);
  const board = page.locator('article.fb');
  await board.waitFor();
  await page.locator('.boot').first().waitFor({ state: 'detached' });
  assert.ok(await board.locator('.fb-lane').count() > 0, 'the fleet board draws no Team lane');
  assert.equal(await page.getByRole('group', { name: 'Show Now as' }).getByRole('button', { name: 'Fleet' }).getAttribute('aria-pressed'), 'true');
  await screenshot('fleet');

  const planeLink = board.locator('a.fb-chip').first();
  const href = await planeLink.getAttribute('href');
  await planeLink.click();
  await page.waitForFunction(target => location.hash === target, href);
  await page.locator('.boot').first().waitFor({ state: 'detached' });
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  assert.equal(await page.locator('#toast').evaluate(toast => /Cannot read|is not a function|undefined/.test(toast.textContent ?? '')), false, 'opening a plane\'s Work Item showed a script error');
  await page.goBack();
  await board.waitFor();

  await page.getByRole('group', { name: 'Show Now as' }).getByRole('button', { name: 'Desk' }).click();
  await page.locator('[data-now-row]').first().waitFor();
  assert.equal(await page.locator('article.fb').count(), 0, 'Desk still shows the fleet board');
  await page.reload();
  await page.locator('[data-now-row]').first().waitFor();
  assert.equal(await page.locator('article.fb').count(), 0, 'the Desk choice is not kept across a reload');
  await page.getByRole('group', { name: 'Show Now as' }).getByRole('button', { name: 'Fleet' }).click();
  await board.waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await board.waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'the fleet board widens the page at 390px');
  await screenshot('fleet-phone');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.fb *')].filter(element => getComputedStyle(element).animationName !== 'none').length), 0, 'the fleet board moves under reduced motion');
  await page.emulateMedia({ reducedMotion: null });

  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto(`${origin}/#settings/labs`);
  await choice.getByRole('button', { name: 'Default' }).click();
  await page.getByText(/Your choice: default/i).first().waitFor().catch(() => {});
  await page.goto(`${origin}/#now`);
  await page.getByRole('heading', { level: 1, name: 'Now', exact: true }).waitFor();
  assert.equal(await page.getByRole('group', { name: 'Show Now as' }).count(), 0, 'Default leaves the switch on Now');
}
