/** The Vouwvlieger's motion at desktop, tablet and three phone sizes: the loading flight lands before the loading screen lifts and never widens the page, the brand link pops on hover (sidebar) or tap (phone drawer), the sign-in lockup pops, and reduced motion keeps every mark still. */
const viewports = [
  { name: 'desktop', width: 1440, height: 1040, phone: false },
  { name: 'tablet', width: 820, height: 1180, phone: false },
  { name: 'phone', width: 390, height: 844, phone: true },
  { name: 'small phone', width: 360, height: 740, phone: true },
  { name: 'smallest phone', width: 320, height: 568, phone: true },
];

const markTransform = (page, selector) => page.evaluate(scope => {
  const ink = [...document.querySelectorAll(`${scope} .brand-ink`)].find(node => node.getBoundingClientRect().width > 0);
  return ink?.parentNode?.getAttribute('transform') ?? null;
}, selector);

async function expectPop(page, selector, assert, label) {
  await page.waitForTimeout(150);
  assert.match(String(await markTransform(page, selector)), /scale/, `${label}: the mark did not pop`);
  await page.waitForFunction(scope => {
    const ink = [...document.querySelectorAll(`${scope} .brand-ink`)].find(node => node.getBoundingClientRect().width > 0);
    return ink && !ink.parentNode.getAttribute('transform');
  }, selector, { timeout: 3000 });
}

async function context(browser, viewport, options = {}) {
  const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.phone, isMobile: viewport.phone, deviceScaleFactor: viewport.phone ? 3 : 1, ...options });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/\b(401|409|503)\b/.test(message.text())) errors.push(message.text()); });
  return { ctx, page, errors };
}

export async function run({ page: shared, app, live, assert }) {
  const browser = shared.context().browser();
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const liveBase = `http://127.0.0.1:${live.server.address().port}`;

  for (const viewport of viewports) {
    const label = `${viewport.name} ${viewport.width}×${viewport.height}`;
    const { ctx, page, errors } = await context(browser, viewport);
    try {
      await page.goto(`${base}/#now`);
      await page.locator('.boot-curtain').waitFor({ state: 'attached' });
      const samples = [];
      let widest = 0;
      for (let index = 0; index < 8; index++) {
        samples.push(await markTransform(page, '.boot-curtain'));
        widest = Math.max(widest, await page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
        await page.waitForTimeout(90);
      }
      assert.ok(new Set(samples.filter(Boolean)).size >= 3, `${label}: the loading mark did not fly (${samples.length} samples, ${new Set(samples).size} distinct)`);
      assert.ok(widest <= 0, `${label}: the loading flight widened the page by ${widest}px`);
      await page.locator('.boot-curtain').waitFor({ state: 'detached', timeout: 4000 });
      await page.waitForFunction(() => document.getElementById('page-title'));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: the page scrolls sideways after loading`);

      if (viewport.phone) {
        await page.locator('[data-action="nav-open"]').first().tap();
        const brand = page.locator('.app-drawer .app-brand');
        await brand.waitFor();
        await brand.tap();
        await expectPop(page, '.app-drawer .app-brand', assert, `${label} drawer tap`);
      } else {
        await page.mouse.move(viewport.width - 4, viewport.height - 4);
        await page.locator('.app-sidebar .app-brand').hover();
        await expectPop(page, '.app-sidebar .app-brand', assert, `${label} sidebar hover`);
        await page.mouse.move(viewport.width - 4, viewport.height - 4);
        await page.locator('.app-sidebar .app-brand').hover();
        await expectPop(page, '.app-sidebar .app-brand', assert, `${label} second sidebar hover`);
      }

      await page.goto(liveBase);
      await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
      await page.locator('.boot-curtain').waitFor({ state: 'detached', timeout: 4000 });
      const lockup = page.locator('.signin-lockup');
      if (viewport.phone) await lockup.tap(); else { await page.mouse.move(2, viewport.height - 2); await lockup.hover(); }
      await expectPop(page, '.signin-brand', assert, `${label} sign-in lockup`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: the sign-in page scrolls sideways`);
      assert.deepEqual(errors, [], `${label}: browser errors`);
    } finally {
      await ctx.close();
    }
  }

  const { ctx, page, errors } = await context(browser, viewports[0], { reducedMotion: 'reduce' });
  try {
    await page.goto(`${base}/#now`);
    await page.waitForFunction(() => document.getElementById('page-title'));
    assert.equal(await page.locator('.boot-curtain').count(), 0, 'reduced motion: the loading screen was held for a flight');
    await page.locator('.app-sidebar .app-brand').hover();
    await page.waitForTimeout(200);
    assert.doesNotMatch(String(await markTransform(page, '.app-sidebar .app-brand')), /scale/, 'reduced motion: the brand link popped');
    assert.deepEqual(errors, [], 'reduced motion: browser errors');
  } finally {
    await ctx.close();
  }
}
