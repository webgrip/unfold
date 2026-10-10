/** Rage clicks, dead clicks and U-turns from real clicks and route changes, and the clicks that must stay quiet. */
export async function run({ page, app, assert }) {
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const posted = [];
  await page.route('**/api/insight/events', async route => {
    posted.push(...(route.request().postDataJSON()?.events ?? []));
    await route.continue();
  });
  const flush = async () => {
    const before = posted.length;
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.visibilityState;
    });
    await page.waitForFunction(() => true);
    for (let tries = 0; tries < 20 && posted.length === before; tries++) await page.waitForTimeout(50);
  };
  const named = (name, element) => posted.filter(event => event.name === name && (element === undefined || event.props?.element === element));
  const route = async target => { await page.evaluate(next => { location.hash = next; }, target); await page.waitForFunction(next => location.hash.split('?')[0] === `#${next}` && document.getElementById('page-title'), target); };

  await page.goto(`${base}/#now`);
  await page.waitForFunction(() => document.getElementById('page-title'));
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    for (const [index, name] of ['probe.inert', 'probe.dead'].entries()) {
      const element = document.createElement('div');
      element.dataset.insight = name;
      element.style.cssText = `position:fixed;left:${400 + index * 200}px;bottom:24px;width:120px;height:48px;z-index:9999;user-select:none;background:transparent`;
      document.body.append(element);
    }
  });

  const inert = page.locator('[data-insight="probe.inert"]');
  for (let index = 0; index < 4; index++) await inert.click({ position: { x: 20 + index * 5, y: 20 }, delay: 0 });
  await page.locator('[data-insight="probe.dead"]').click();
  await flush();
  assert.equal(named('ui.rage_click', 'probe.inert').length, 1, 'four quick clicks on one spot are one rage click');
  assert.equal(named('ui.dead_click', 'probe.dead').length, 1, 'a click on a named element that changes nothing is a dead click');
  assert.equal(named('ui.rage_click', 'probe.inert')[0].screen, 'now');

  const deadBefore = named('ui.dead_click').length;
  const rageBefore = named('ui.rage_click').length;
  const menu = page.locator('.app-user-trigger:visible').first();
  await menu.click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  const text = page.locator('main p').first();
  await text.click({ clickCount: 3 });
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await flush();
  assert.equal(named('ui.dead_click').length, deadBefore, 'a click that opens a menu is not a dead click');
  assert.equal(named('ui.rage_click').length, rageBefore, 'triple-click text selection is not a rage click');

  const item = await page.evaluate(() => /#work\/(\d+)/.exec(document.querySelector('a[href^="#work/"]')?.getAttribute('href') ?? '')?.[1]);
  assert(item, 'the demo Now page links a Work Item');
  for (let visit = 0; visit < 2; visit++) {
    await route(`work/${item}`);
    await route('now');
  }
  await flush();
  const turns = named('ui.u_turn');
  assert.equal(turns.length, 1, 'leaving a Work Item quickly twice is one U-turn');
  assert.equal(turns[0].workItemId, Number(item));
  for (const event of posted.filter(entry => entry.name.startsWith('ui.'))) assert(!JSON.stringify(event).includes('Mark as caught up'), 'no screen text travels');
  await page.unroute('**/api/insight/events');
}
