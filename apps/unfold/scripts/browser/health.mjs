export async function run({ app, page, assert, screenshot }) {
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  for (const [width, height, scheme] of [[1440, 1040, 'light'], [320, 720, 'dark']]) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`${origin}/#work/102?lane=leased`);
    const row = page.locator('#work-run-51');
    await row.waitFor();
    const badge = row.locator(':scope > summary .work-run-health-badge .badge');
    await badge.waitFor();
    assert.equal(await badge.evaluate(element => [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim()), 'On track', 'the running demo Run shows its health word');
    assert.equal((await badge.textContent()).trim(), 'Health: On track', 'a screen reader hears Health: before the word');
    assert.equal(await badge.locator('.sr-only').evaluate(element => getComputedStyle(element).clip !== 'auto' || getComputedStyle(element).clipPath !== 'none'), true, 'the Health: prefix is not shown');
    assert.equal(await badge.locator('svg.icon').count(), 1, 'the health badge has a glyph, never colour alone');
    assert.match(await badge.getAttribute('title'), /^Health: On track · \d+ of 90 min · demo data$/);
    if (!await row.evaluate(element => element.open)) await row.locator(':scope > summary').click();
    const health = row.locator('section.work-run-health');
    await health.waitFor();
    assert.match(await health.innerText(), /Signals: On track · \d+ of 90 min/);
    assert.match(await health.innerText(), /Demo: health computed from illustrative data\. No judge runs in the demo\./);
    assert.equal(await health.locator('[aria-label="AI judgement"]').count(), 0, 'the demo never shows a judge verdict');
    const wide = await page.evaluate(() => [...document.querySelectorAll('#work-run-51, #work-run-51 *')].filter(element => element.getBoundingClientRect().right > innerWidth + 1).slice(-6).map(element => `${element.tagName}.${element.className} ${Math.round(element.getBoundingClientRect().right)}`));
    assert.deepEqual(wide, [], `the running Run's row runs past the viewport at ${width}px`);
    assert.equal(await page.locator('#work-run-50 .work-run-health-badge').count(), 0, 'a finished Run has no health badge');
    await screenshot(`run-health-${width}-${scheme}`);
  }
  await page.emulateMedia({ colorScheme: null });
  await page.setViewportSize({ width: 1440, height: 1040 });
}
