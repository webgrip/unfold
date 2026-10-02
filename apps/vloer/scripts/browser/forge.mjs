/**
 * The forge skin on the Work Item page: the 3D card renders under the strict CSP, paints real pixels, keeps the facts
 * every card shows, turns over, pauses its live loop off screen and on its back, draws one still frame under reduced
 * motion, and falls back to Vloer Native in a browser without WebGL2.
 */
export async function run({ page, app, assert, screenshot }) {
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const forgeState = () => page.evaluate(() => { const article = document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge'); return article ? { state: article.dataset.forgeState, mode: article.dataset.forgeMode, frames: Number(article.dataset.forgeFrames || 0) } : null; });
  const open = async (id, title) => {
    await page.goto(`${base}/#work/${id}?lane=all`);
    await page.waitForFunction(text => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.gc:not([hidden]) [data-slot="title"]')?.textContent === text, title);
    await page.locator('#work-card').scrollIntoViewIfNeeded();
    return page.locator('unfold-card.work-run-card');
  };
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  const foil = await open('117', 'Show the order number in the confirmation email subject');
  assert.equal(await foil.getAttribute('data-skin'), 'forge', 'the demo card chose the forge skin');
  await page.waitForFunction(() => ['still', 'live'].includes(document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.forgeState), null, { timeout: 30000 });
  const first = await forgeState();
  assert.equal(first.mode, 'still', 'a software rasteriser draws the hero as a still frame');
  assert(first.frames >= 1);
  assert.deepEqual(await foil.evaluate(host => { const article = host.shadowRoot.querySelector('.forge'); return [article.dataset.finish, article.dataset.coverage, article.querySelectorAll('canvas').length]; }), ['foil', 'frame', 1], 'a 9-day card has the foil finish on its frame, in one canvas');
  const pixels = await foil.evaluate(host => {
    const canvas = host.shadowRoot.querySelector('.forge canvas');
    const g = canvas.getContext('2d');
    const at = (x, y) => [...g.getImageData(Math.round(canvas.width * x), Math.round(canvas.height * y), 1, 1).data];
    const corner = at(0.02, 0.02);
    const sum = pixel => pixel[0] + pixel[1] + pixel[2];
    const row = Array.from({ length: canvas.width }, (_, x) => [...g.getImageData(x, Math.round(canvas.height * 0.5), 1, 1).data]);
    const edge = row.findIndex(pixel => sum(pixel) > 240);
    const frame = row.slice(Math.max(0, edge), Math.max(0, edge) + Math.round(canvas.width * 0.04)).reduce((best, pixel) => sum(pixel) > sum(best) ? pixel : best, [0, 0, 0, 0]);
    return { corner, art: at(0.5, 0.3), frame, size: [canvas.width, canvas.height] };
  });
  assert(pixels.size[0] > 200 && pixels.size[1] > 260, `the still frame fills the stage: ${pixels.size}`);
  const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  assert(luma(pixels.art) > luma(pixels.corner) + 20, `the art window is painted: ${pixels.art} over ${pixels.corner}`);
  assert(luma(pixels.frame) > luma(pixels.corner) + 20, `the foil frame is painted: ${pixels.frame} over ${pixels.corner}`);
  assert.equal(await foil.locator('[data-slot="state"]').innerText(), 'Merged');
  assert.match(await foil.locator('[data-slot="cost"]').getAttribute('aria-label'), /Demo · no model calls/, 'the forge card invents no spend');
  assert.equal(await foil.locator('[data-slot="steward"] .sr-only').textContent(), 'Signed by demo-operator');
  assert.equal(await foil.locator('.forge-bar .day b').textContent(), 'Day 9');
  await screenshot('work-card-forge-foil');

  const turn = foil.getByRole('button', { name: 'Turn over' });
  await turn.click();
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('[data-forge-action="turn"]')?.getAttribute('aria-pressed') === 'true');
  assert((await forgeState()).frames > first.frames, 'turning a still card draws its back');
  await foil.getByRole('button', { name: 'Show the face' }).click();

  await foil.getByRole('button', { name: 'More info' }).click();
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.activeElement?.matches('[data-card-focus]'));
  assert.equal(await foil.getByRole('tab').count(), 12, 'the back keeps the twelve tabs');
  assert.equal(await foil.locator('.forge-set').innerText(), '4/5', 'the forge bar names the card’s place in its set');
  assert.match(await foil.locator('.forge-facts').textContent(), /Gates\s*Done · right first time/, 'the gates are in the text for screen readers');
  await foil.getByRole('tab', { name: 'Life' }).click();
  assert.match(await foil.getByRole('tabpanel', { name: 'Life' }).innerText(), /Finish\s+Foil/);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.getAttribute('face') === 'front');

  const cracked = await open('119', 'Cache the product price lookup for the cart');
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.forgeState === 'still', null, { timeout: 30000 });
  assert.equal(await cracked.locator('.forge-condition').innerText(), 'Cracked');
  assert.match(await cracked.locator('.forge-facts').textContent(), /Grade 8,5 of 10, provisional/, 'the grade is in the text for screen readers');
  const mended = await open('120', 'Add an audit log entry when an order is refunded');
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.forgeState === 'still', null, { timeout: 30000 });
  assert.equal(await mended.locator('.forge-condition').innerText(), 'Mended');
  await screenshot('work-card-forge-mended');

  await page.evaluate(() => { new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) for (const card of node.querySelectorAll?.('unfold-card') ?? []) card.setAttribute('motion', 'live'); }).observe(document.getElementById('app'), { childList: true, subtree: true }); });
  await open('123', 'Attach the invoice PDF to the shipping confirmation');
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.forgeMode === 'live', null, { timeout: 30000 });
  await page.waitForFunction(() => Number(document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.forgeFrames) > 30, null, { timeout: 60000 });
  assert.equal((await forgeState()).state, 'live', 'the hero renders live when asked to');
  const live = page.locator('unfold-card.work-run-card');
  await live.getByRole('button', { name: 'More info' }).click();
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.forgeState === 'paused');
  const turned = (await forgeState()).frames;
  await page.waitForTimeout(600);
  assert.equal((await forgeState()).frames, turned, 'a card turned to its back stops drawing');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.forgeState === 'live');
  await page.setViewportSize({ width: 1440, height: 420 });
  await page.evaluate(() => { for (let element = document.querySelector('#work-card'); element; element = element.parentElement) element.scrollTop = element.scrollHeight; document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight; });
  assert(await page.evaluate(() => { const box = document.querySelector('unfold-card.work-run-card').getBoundingClientRect(); return box.bottom < 0 || box.top > innerHeight; }), 'the card is scrolled out of the window');
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.forgeState === 'paused');
  const away = (await forgeState()).frames;
  await page.waitForTimeout(600);
  assert.equal((await forgeState()).frames, away, 'a card scrolled off screen stops drawing');
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.locator('#work-card').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.forgeState === 'live');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.forgeState === 'still');
  const still = (await forgeState()).frames;
  await page.waitForTimeout(600);
  assert.equal((await forgeState()).frames, still, 'reduced motion leaves one still frame');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${base}/#work/105?lane=all`);
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.forgeState);

  const plain = await page.context().browser().newPage({ viewport: { width: 1440, height: 1040 } });
  const errors = [];
  plain.on('pageerror', error => errors.push(error.message));
  plain.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await plain.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return kind === 'webgl2' ? null : original.call(this, kind, ...rest); }; });
  await plain.goto(`${base}/#work/117?lane=all`);
  await plain.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.gc:not([hidden]) .card[data-finish]'));
  assert.equal(await plain.locator('unfold-card.work-run-card').getAttribute('data-skin'), 'vloer-native', 'without WebGL2 the forge card falls back to Vloer Native');
  assert.equal(await plain.locator('unfold-card.work-run-card .forge').count(), 0);
  await plain.close();
  assert.deepEqual(errors, [], 'the fallback page has no script or CSP errors');
}
