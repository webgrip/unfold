/** The Team builder: no Teams item in the sidebar while teams.builder is off and the page says it is a Labs feature, then after opting in under Labs the builder greys the models Claude Code cannot run with the reason and names the repository OpenHands cannot enter, a saved agent lands in the roster, a Team saves as its next version with an empty record, the gate ranks the Teams that fit an unassigned card and answers on the card after Unfold is assigned, 390px without horizontal scrolling, and Default hides the item again. */
export async function run({ app, page, assert, screenshot }) {
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto(`${origin}/#teams`);
  await page.getByRole('heading', { level: 1, name: 'Teams', exact: true }).waitFor();
  await page.getByText('Teams is a Labs feature').waitFor();
  assert.equal(await page.locator('.app-nav a[href="#teams"]').count(), 0, 'the Teams item shows while the flag is off');

  await page.goto(`${origin}/#settings/labs`);
  const choice = page.getByRole('group', { name: 'Team builder: your choice' });
  await choice.getByRole('button', { name: 'On', exact: true }).click();
  await page.getByText(/On for you · Your choice: on/).first().waitFor();

  await page.goto(`${origin}/#teams/agents`);
  await page.locator('.tb-agent-form').waitFor();
  await page.locator('.boot').first().waitFor({ state: 'detached' });
  assert.ok(await page.locator('.app-nav a[href="#teams"]').count() > 0, 'the Teams item is missing from the sidebar with the flag on');
  await page.locator('#tb-agent-name').fill('Flow agent');
  await page.locator('.tb-agent-form input[name=harness][value=claude-code]').check({ force: true });
  await page.locator('.tb-agent-form').waitFor();
  assert.ok(await page.locator('.tb-option.is-off', { hasText: 'Claude Code runs Claude models only' }).count() > 0, 'Claude Code does not grey the models it cannot run');
  await page.locator('.tb-agent-form input[name=harness][value=openhands]').check({ force: true });
  await page.getByText('OpenHands refuses a repository that ships .openhands/hooks.json').first().waitFor();
  await page.locator('.tb-agent-form input[name=harness][value=opencode]').check({ force: true });
  await page.locator('.tb-agent-form').waitFor();
  await page.locator('#tb-agent-name').fill('Flow agent');
  await screenshot('teams-builder');
  await page.getByRole('button', { name: 'Save agent' }).click();
  await page.locator('.tb-roster .tb-card', { hasText: 'Flow agent' }).waitFor();

  await page.goto(`${origin}/#teams`);
  await page.locator('.tb-team-form').waitFor();
  const version = await page.locator('.tb-team-form button[type=submit]').textContent();
  assert.match(version ?? '', /Save as v\d+/);
  await page.locator('.tb-team-form button[type=submit]').click();
  await page.getByText('No Runs on this version yet.').waitFor();
  await screenshot('teams-record');

  await page.goto(`${origin}/#teams/assign`);
  await page.locator('.tb-assign-form').waitFor();
  await page.getByText('Which Team?').first().waitFor();
  assert.ok(await page.locator('.tb-gate .tb-rank').count() > 0, 'the gate ranks no Team for an unassigned card');
  await page.locator('#tb-card-team').selectOption('tm-erf');
  await page.getByText('Erf cannot take this card').first().waitFor();
  await page.getByRole('button', { name: 'Assign Unfold' }).click();
  await page.locator('.tb-comments .tb-comment', { hasText: 'Erf cannot take this card' }).waitFor();
  await screenshot('teams-assign');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.tb-assign-form').waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'the gate page widens the page at 390px');
  await page.goto(`${origin}/#teams/agents`);
  await page.locator('.tb-agent-form').waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'the builder widens the page at 390px');

  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto(`${origin}/#settings/labs`);
  await choice.getByRole('button', { name: 'Default' }).click();
  await page.getByText(/Your choice: default/i).first().waitFor().catch(() => {});
  await page.goto(`${origin}/#teams`);
  await page.getByText('Teams is a Labs feature').waitFor();
  assert.equal(await page.locator('.app-nav a[href="#teams"]').count(), 0, 'Default leaves the Teams item in the sidebar');
}
