/**
 * Run card KPIs (Unfold ADR 0035) in the demo: the headline strip on Unfold Native, the forge and each DOM skin pack under
 * the CSP, "waiting" while nobody has responded, the Flow tab's stacked bar and table, the calendar ↔ working-hours
 * toggle remembered across a reload, the Review & CI steps and CI rows, the Change tab's complexity, and phone width
 * without horizontal scrolling.
 */
export async function run({ page, app, assert, screenshot }) {
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const host = () => page.locator('unfold-card.work-run-card');
  const open = async id => {
    await page.goto(`${base}/#work/${id}?lane=all`);
    await page.waitForFunction(id => { const card = document.querySelector('unfold-card.work-run-card'); return card?.card?.workItemId === id && card.shadowRoot?.querySelector('.gc:not([hidden]) [data-slot="title"]'); }, id, { timeout: 30000 });
    await page.locator('#work-card').scrollIntoViewIfNeeded();
    return host();
  };
  const noSideScroll = async label => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${label}: no horizontal scroll`);
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.evaluate(() => { try { localStorage.removeItem('unfold.cards.clock'); } catch {} });

  const fronts = [['121', 'unfold-native'], ['109', 'unfold-native'], ['117', 'forge'], ['134', 'holo'], ['136', 'loot'], ['138', 'arcade'], ['140', 'ticker'], ['142', 'patch'], ['113', 'ticker']];
  for (const [id, skin] of fronts) {
    const card = await open(id);
    assert.equal(await card.getAttribute('data-skin'), skin, `#${id} draws ${skin}`);
    if (skin === 'forge') {
      await page.waitForFunction(() => ['still', 'live', 'paused', 'failed'].includes(document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.forgeState), null, { timeout: 30000 });
      assert.match(await card.locator('.forge-kpis').textContent(), /Key figures\s*Lead time [\d ]+d[\s\S]*First feedback 14 min[\s\S]*CI/, `#${id}: the forge's text facts carry the headline figures`);
    } else {
      const items = card.locator('.gc-front .uc-kpis .uc-kpi');
      const count = await items.count();
      assert(count >= 3 && count <= 4, `#${id}: the ${skin} front shows three or four headline figures, not ${count}`);
      const box = await card.locator('.gc-front .uc-kpis').boundingBox();
      const face = await card.locator('.gc-front').boundingBox();
      assert(box && face && box.x >= face.x - 1 && box.x + box.width <= face.x + face.width + 1, `#${id}: the strip stays inside the card`);
      if (id === '109') assert.match(await items.first().innerText(), /waiting \d+ h/i, '#109 still waits for its first feedback');
      if (id === '140') assert.equal(await card.locator('.gc-front .uc-kpi[data-kpi="lastGreen"][data-tone="attention"]').count(), 1, '#140: reruns colour the CI figure as a flakiness hint');
      if (id === '113') assert.equal(await card.locator('.gc-front .uc-kpi[data-kpi="blocked"][data-tone="attention"]').count(), 1, '#113 has been blocked for days');
    }
    await screenshot(`kpis-front-${skin}-${id}`);
  }

  const flowCard = await open('121');
  await flowCard.getByRole('button', { name: 'More info' }).click();
  await flowCard.getByRole('tab', { name: 'Flow' }).click();
  const flow = flowCard.getByRole('tabpanel', { name: 'Flow' });
  assert.match(await flow.innerText(), /^Delivered in \d+ d( \d+ h)? from ticket to release; \d+% of the cycle was active work\./, 'the Flow tab leads with a summary');
  assert(await flow.locator('.kp-bar svg g[data-clock-value="calendar"] rect').count() >= 4, 'a stacked bar of time per status');
  assert.deepEqual(await flow.locator('.kp-legend li').evaluateAll(items => items.map(item => item.dataset.kind)), ['active', 'waiting'], 'the legend names the kinds drawn');
  const rows = await flow.locator('.kp-table tbody tr').count();
  assert(rows >= 5, 'the table lists every status');
  assert.equal(await flow.locator('.kp-table tbody tr[data-current] .kp-now').count(), 1, 'the current status is marked');
  assert.match(await flow.locator('.kp-calendar').textContent(), /^Working hours: Mon–Fri 09:00–17:00 Europe\/Amsterdam$/);
  assert.match(await flow.innerText(), /Not collected[\s\S]*Estimate/i, 'what Ploeg does not collect is listed');
  await screenshot('kpis-flow-121');

  const leadTile = flow.locator('.kp-stat[data-kpi="leadTime"] dd');
  const calendarText = (await leadTile.innerText()).trim();
  await flowCard.getByRole('button', { name: 'Working hours' }).click();
  assert.equal(await flowCard.evaluate(element => element.shadowRoot.querySelector('.gc').dataset.clock), 'working', 'the card switches to working hours');
  assert.equal(await flowCard.getByRole('button', { name: 'Working hours' }).getAttribute('aria-pressed'), 'true');
  const workingText = (await leadTile.innerText()).trim();
  assert.notEqual(workingText, calendarText, 'the lead time reads in working hours');
  assert.match(workingText, /^\d+ h/, 'working time is written in hours');
  assert.equal(await page.evaluate(() => localStorage.getItem('unfold.cards.clock')), 'working', 'the choice is remembered for this viewer');
  await screenshot('kpis-flow-121-working');
  await page.keyboard.press('Escape');
  await page.reload();
  const again = await open('121');
  assert.equal(await again.evaluate(element => element.shadowRoot.querySelector('.gc').dataset.clock), 'working', 'the choice survives a reload');
  assert.match((await again.locator('.gc-front .uc-kpi[data-kpi="leadTime"] .uc-kpi-value').innerText()).trim(), /^\d+ h/, 'the front follows it too');
  await again.getByRole('button', { name: 'More info' }).click();
  await again.getByRole('tab', { name: 'Flow' }).click();
  await again.getByRole('button', { name: 'Calendar' }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('unfold.cards.clock')), 'calendar');
  await page.keyboard.press('Escape');

  const reviewCard = await open('114');
  await reviewCard.getByRole('button', { name: 'More info' }).click();
  await reviewCard.getByRole('tab', { name: 'Review & CI' }).click();
  const review = reviewCard.getByRole('tabpanel', { name: 'Review & CI' });
  const text = await review.innerText();
  assert.match(text, /First feedback\s*31 min/i);
  assert.match(text, /Reruns\s*3\s*flaky CI hint/i);
  assert.deepEqual(await review.locator('.kp-steps li b').allInnerTexts(), ['Opened', 'First feedback', 'First approval', 'Merged'], 'the pull request timeline as steps');
  assert.match(text, /CI minutes\s*31,6 min/i, 'CI minutes in nl-NL');
  assert.match(text, /Slowest jobs on #3\s*e2e/i);
  await screenshot('kpis-review-114');
  await reviewCard.getByRole('tab', { name: 'Change' }).click();
  const change = reviewCard.getByRole('tabpanel', { name: 'Change' });
  assert.match(await change.innerText(), /Complexity added\s*\+58[\s\S]*Test ratio\s*41%[\s\S]*Languages\s*TypeScript 128 · Markdown 12/i);
  assert.match(await change.innerText(), /Complexity counts how deeply each added or removed line is indented/);
  await screenshot('kpis-change-114');
  await reviewCard.getByRole('tab', { name: 'Life' }).click();
  const lifeCard = await open('117');
  await lifeCard.getByRole('button', { name: 'More info' }).click();
  await lifeCard.getByRole('tab', { name: 'Life' }).click();
  assert.match(await lifeCard.getByRole('tabpanel', { name: 'Life' }).innerText(), /Merge → test\s*30 min[\s\S]*Time to production\s*2 d/);
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 390, height: 844 });
  for (const [id, skin] of [['121', 'unfold-native'], ['140', 'ticker'], ['142', 'patch'], ['138', 'arcade']]) {
    const card = await open(id);
    await noSideScroll(`#${id} at phone width`);
    await screenshot(`kpis-phone-${skin}-${id}`);
    if (id === '121') {
      await card.getByRole('button', { name: 'More info' }).click();
      await card.getByRole('tab', { name: 'Flow' }).click();
      await card.locator('.kp-table').scrollIntoViewIfNeeded();
      await noSideScroll('the Flow tab at phone width');
      const table = await card.locator('.kp-table').boundingBox();
      const pane = await card.locator('.gc-back').boundingBox();
      assert(table && pane && table.width <= pane.width, 'the status table fits the card at phone width');
      await screenshot('kpis-phone-flow-121');
      await page.keyboard.press('Escape');
    }
  }
  await page.setViewportSize({ width: 1440, height: 1040 });
}
