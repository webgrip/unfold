/**
 * Gates, cracks and sets on the Run card, and Trace this bug on a bug Work Item: the gates strip with its bounce marker
 * and right-first-time chip, the crack and set chips, the Gates, Condition and Set tabs, the epic's children grid, and
 * the demo attribution flow (candidates, a pending crack, Confirm and Propose dialogs that check their fields and say
 * the demo recorded nothing) at desktop and phone widths.
 */
export async function run({ page, app, assert, screenshot }) {
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const open = async (id, title) => {
    await page.goto(`${base}/#work/${id}?lane=all`);
    await page.waitForFunction(() => document.activeElement?.id === 'ploeg-item-title');
    await page.waitForFunction(text => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.gc:not([hidden]) [data-slot="title"]')?.textContent === text, title);
    return page.locator('unfold-card.work-run-card');
  };
  const capture = async name => { await page.evaluate(() => window.scrollTo(0, 0)); await screenshot(name); };
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  const card = await open('118', 'Validate postcodes on the shipping address form');
  const strip = card.locator('.gc-front [data-slot="gates"]');
  assert.equal(await strip.getByRole('list').getAttribute('aria-label'), 'Gates: now in done, 1 bounce back');
  assert.equal(await strip.locator('[aria-current="step"]').getAttribute('data-gate'), 'done', 'the current gate is marked as the current step');
  assert.equal(await strip.locator('[data-gate="test"] .gb').getAttribute('data-counts'), 'true', 'a defect bounce from test is marked against right first time');
  assert.equal(await strip.locator('.rft').innerText(), '1 bounce back');
  assert.equal(await card.locator('.gc-front [data-slot="condition"]').innerText(), 'Cracked · S3');
  assert.equal(await card.locator('.gc-front [data-slot="set"]').innerText(), '2/5 · Checkout and confirmation hardening');
  await capture('work-card-gates-cracks-set');
  await card.getByRole('button', { name: 'More info' }).click();
  await card.getByRole('tab', { name: 'Gates' }).click();
  const gates = await card.getByRole('tabpanel', { name: 'Gates' }).innerText();
  assert.match(gates, /Right first time\s+No · 1 defect bounce from test/);
  assert.match(gates, /Test → Development · Defect/);
  assert.match(gates, /moved by demo-tester · counts against right first time/);
  await card.getByRole('tab', { name: 'Condition' }).click();
  const condition = await card.getByRole('tabpanel', { name: 'Condition' }).innerText();
  assert.match(condition, /Crack weight\s+1 off reliability/);
  assert.match(condition, /Confirmed by\s+demo-dev \(proposed\) and demo-tester/);
  assert.match(condition, /Mend confirmed\s+Not yet: a mend stands 30 days first/);
  assert.match(condition, /A crack is an inquiry, not a verdict/);
  await capture('work-card-condition-tab');
  await card.getByRole('tab', { name: 'Set' }).click();
  assert.match(await card.getByRole('tabpanel', { name: 'Set' }).innerText(), /Set\s+2\/5 of Checkout and confirmation hardening/);
  await card.getByRole('tab', { name: 'Review & CI' }).click();
  assert.match(await card.getByRole('tabpanel', { name: 'Review & CI' }).innerText(), /demo-dev\s+cosigner \(mended a crack\)/, 'the person who mended the crack is on the roster as cosigner');
  await page.keyboard.press('Escape');
  const traced = page.locator('#work-trace');
  assert.equal(await traced.getByRole('heading', { level: 3 }).innerText(), 'Bugs traced to this Work Item');
  assert.equal(await traced.getByRole('button', { name: 'Dispute' }).count(), 1, 'the card’s steward may dispute a confirmed crack within five working days');

  const epic = await open('125', 'Checkout and confirmation hardening');
  assert.equal(await epic.locator('.gc-front [data-slot="set"]').innerText(), 'Epic · 5 cards');
  await epic.getByRole('button', { name: 'More info' }).click();
  await epic.getByRole('tab', { name: 'Set' }).click();
  const children = epic.getByRole('tabpanel', { name: 'Set' }).locator('.items.grid li');
  assert.equal(await children.count(), 5, 'the epic card lists its five children');
  assert.match(await children.nth(1).innerText(), /Validate postcodes on the shipping address form\s+2\/5 · Merged · settled · cracked/);
  await capture('work-card-epic-set');
  await page.keyboard.press('Escape');

  await open('124', 'A postcode with a space makes the shipping form answer 500');
  const panel = page.locator('#work-trace');
  await panel.waitFor();
  assert.equal(await panel.getByRole('heading', { level: 3 }).innerText(), 'Trace this bug');
  assert.match(await panel.innerText(), /These candidates and attributions are sample data/, 'the demo says it is one');
  assert.match(await panel.innerText(), /Ploeg knows you as demo-operator/);
  assert.equal(await panel.locator('.trace-candidate').count(), 3);
  assert.equal(await panel.getByRole('button', { name: 'Confirm' }).count(), 1, 'only the proposed crack on someone else’s card can be confirmed');
  assert.equal(await panel.getByRole('button', { name: 'Propose as cause' }).count(), 1, 'only the candidate nobody attributed yet can be proposed');
  await panel.locator('#work-trace-rules summary').click();
  assert.match(await panel.locator('#work-trace-rules').innerText(), /Two people confirm/);
  await capture('work-trace-bug');

  await panel.getByRole('button', { name: 'Confirm' }).click();
  const dialog = page.locator('#confirm-dialog');
  await dialog.getByRole('heading', { name: 'Confirm this crack?' }).waitFor();
  assert.match(await dialog.innerText(), /Demo: this checks Ploeg’s rules and records nothing/);
  await capture('work-trace-confirm-dialog');
  await dialog.getByRole('button', { name: 'Confirm crack' }).click();
  const result = page.locator('#work-trace-result');
  await result.waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'work-trace-result');
  assert.match(await result.innerText(), /Demo · nothing recorded\s+Ploeg would now record the attribution Return 404 instead of 500 for unknown order ids → A postcode with a space makes the shipping form answer 500 as confirmed\. Demo: Ploeg recorded nothing/);
  assert.equal(await panel.getByRole('button', { name: 'Confirm' }).count(), 1, 'the demo kept nothing, so the crack still waits for a second person');

  await panel.getByRole('button', { name: 'Propose as cause' }).click();
  await dialog.getByRole('heading', { name: 'Propose a cause' }).waitFor();
  assert.match(await dialog.innerText(), /records the proposal as self-reported/, 'the person who merged the play is told it counts as self-reported');
  await dialog.getByRole('button', { name: 'Propose crack' }).click();
  assert.equal(await dialog.locator('[data-error-for="severity"]').innerText(), 'Choose a severity.', 'a proposal needs a severity before anything is sent');
  assert.equal(await page.evaluate(() => document.activeElement?.name), 'severity');
  await dialog.getByRole('radio', { name: /S4 · cosmetic/ }).check();
  await dialog.getByLabel('Note').fill('The shared error handler swallowed the 422.');
  await dialog.getByRole('button', { name: 'Propose crack' }).click();
  await page.waitForFunction(() => /as proposed/.test(document.getElementById('work-trace-result')?.innerText ?? ''));
  await capture('work-trace-result');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('#work-trace').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'the trace panel fits a phone without sideways scrolling');
  await capture('work-trace-bug-phone');
  await page.setViewportSize({ width: 1440, height: 1040 });
}
