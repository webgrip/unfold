/** Following handed-off work: Now's "Handed off by you" card from a stubbed `GET /api/handoffs` with each row's app, state and why it waits and agent text kept as text, then the deep link a notification opens, `#work/101`, with a question stubbed into the demo detail, answered in place by keyboard at 390px without widening the page. Nothing is submitted, so the demo records and spends nothing. */
export async function run({ app, page, assert, screenshot }) {
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const handoffs = {
    demo: true, fetchedAt: '2026-10-30T12:00:00Z',
    handoffs: [
      { id: 2, at: '2026-10-30T09:00:00Z', channel: 'mcp:ChatGPT', team: 'core', origin: { kind: 'task', sourceId: 'board', sourceName: 'Board', taskId: 'DEMO-1' }, note: '', workItem: { id: '101', team: 'core', state: 'needs_human', title: 'Review the rounding <b>acceptance</b> criteria', url: '', createdAt: '2026-10-30T09:01:00Z', updatedAt: '2026-10-30T10:00:00Z', provider: 'vikunja', externalId: 'DEMO-1', attempts: 1, infraFailures: 0, target: null, closeReason: 'question_for_person', latestShift: null, spentUsd: null, pullRequestUrl: '' } },
      { id: 1, at: '2026-10-30T08:00:00Z', channel: 'VS Code (GitHub Copilot Chat with a rather long client name)', team: 'core', origin: { kind: 'task', sourceId: 'board', sourceName: 'Board', taskId: 'DEMO-2' }, note: 'Ploeg has not listed a Work Item for this hand-off yet.', workItem: null },
    ],
  };
  await page.route('**/api/handoffs*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(handoffs) }));
  await page.route(/\/api\/ploeg\/work-items\/101(\?.*)?$/, async route => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.questions = [{ id: 'q-rounding', runId: '1', role: 'builder', round: 1, to: 'person', text: 'Round half up or half to even?', waitingForPerson: true }];
    await route.fulfill({ response, json: detail });
  });
  try {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1040 });
      await page.goto(`${origin}/#now`);
      const card = page.locator('.now-handed');
      await card.waitFor();
      assert.match(await card.locator('h2').textContent(), /^Handed off by you/);
      assert.equal(await card.locator('.now-item').count(), 2);
      const first = card.locator('.now-item').first();
      assert.match(await first.textContent(), /From ChatGPT/);
      assert.match(await first.textContent(), /Question for you/);
      assert.equal(await first.locator('b').count(), 0, 'agent text was rendered as markup');
      assert.match(await first.locator('.list-row-title').textContent(), /<b>acceptance<\/b>/);
      assert.match(await card.locator('.now-item').nth(1).textContent(), /Not picked up yet/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Now widens the page at ${width}px`);
      await screenshot(`handed-off-${width}`);
    }
    await page.locator('.now-handed').getByRole('link', { name: /Answer the question on/ }).click();
    await page.waitForURL(/#work\/101$/);
    const answer = page.getByRole('button', { name: 'Answer', exact: true }).first();
    await answer.waitFor();
    await answer.focus();
    await page.keyboard.press('Enter');
    const dialog = page.locator('dialog[open]');
    await dialog.waitFor();
    assert.match(await dialog.textContent(), /Round half up or half to even\?/);
    const field = dialog.locator('#work-answer-text-0');
    assert.equal(await field.evaluate(element => element === document.activeElement), true, 'the answer field does not take focus');
    await field.fill('Half to even.');
    const box = await field.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390, 'the answer field does not fit 390px');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'the Work Item page widens the page at 390px');
    await screenshot('handed-off-answer-390');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' }).catch(() => dialog.waitFor({ state: 'hidden' }));
  } finally {
    await page.unroute('**/api/handoffs*');
    await page.unroute(/\/api\/ploeg\/work-items\/101(\?.*)?$/);
    await page.setViewportSize({ width: 1440, height: 1040 });
  }
}
