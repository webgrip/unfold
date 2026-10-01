/**
 * The forge card's inner world on the Work Item page: a demo card held by the demo login draws its islands in the
 * art window under the CSP, describes them for screen readers, flattens and comes back by button and by F, reacts to
 * a click on a thing found by its hover cursor and to the keyboard, places a crystal by pointer and erases a thing by
 * keyboard, saves the decoration for its owner and shows it again after a reload, and goes back to the card's own
 * world. A world built under reduced motion flattens at once and throws no particles.
 */
export async function run({ page, app, assert, screenshot }) {
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const card = () => page.locator('unfold-card.work-run-card');
  const article = () => page.evaluate(() => { const forge = document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge'); return forge ? { ...forge.dataset } : null; });
  const inShadow = (selector, read) => page.evaluate(([selector, read]) => { const node = document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector(selector); return node ? node[read] ?? node.getAttribute(read) : null; }, [selector, read]);
  const announced = () => inShadow('[data-world-announce]', 'textContent');
  const description = () => inShadow('[data-world-description]', 'textContent');
  const stored = () => page.evaluate(async () => (await (await fetch('/api/cards/117/world')).json()).world);
  const open = async () => {
    await page.goto(`${base}/#work/117?lane=all`);
    await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.world === 'islands', null, { timeout: 30000 });
    await page.locator('#work-card').scrollIntoViewIfNeeded();
  };
  const canvasBox = async () => card().locator('.forge-canvas').boundingBox();
  const sweep = async wanted => {
    const box = await canvasBox();
    for (let row = 0; row < 9; row++) {
      for (let column = 0; column < 14; column++) {
        const x = box.x + box.width * (0.28 + column * 0.033);
        const y = box.y + box.height * (0.25 + row * 0.022);
        await page.mouse.move(x, y);
        if (await inShadow('.forge-canvas', 'data-cursor') === wanted) {
          await page.waitForTimeout(500);
          await page.mouse.move(x + 1, y);
          if (await inShadow('.forge-canvas', 'data-cursor') === wanted) return { x: x + 1, y };
        }
      }
    }
    return null;
  };

  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => { if (sessionStorage.getItem('vloer-browser-live-cards') === '1') new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) for (const element of node.querySelectorAll?.('unfold-card') ?? []) element.setAttribute('motion', 'live'); }).observe(document, { childList: true, subtree: true }); });
  await page.goto(`${base}/#now`);
  await page.evaluate(() => sessionStorage.setItem('vloer-browser-live-cards', '1'));
  await page.reload();
  await page.evaluate(async () => { await fetch('/api/cards/117/world', { method: 'DELETE', headers: { 'X-Vloer-Request': '1' } }); });
  await open();

  const state = await article();
  assert.equal(state.forgeMode, 'live');
  assert.equal(state.worldFlat, 'false');
  assert.match(await description(), /^Inner world: Sky islands, morning, following the card’s days live\. You can touch 3 trees, a crystal, a lantern and a windmill\.$/, 'a merged card nine days live shows morning and its windmill');
  assert.equal(await inShadow('[data-forge-stage]', 'role'), 'group');
  assert.match(await inShadow('[data-forge-stage]', 'aria-label'), /Arrow keys move between the things in it, Enter touches one or places the chosen thing, F flattens it\./);
  await page.waitForFunction(() => Number(document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.forgeFrames) > 20, null, { timeout: 30000 });
  await screenshot('work-card-forge-world');

  const flat = card().getByRole('button', { name: 'Flatten art' });
  assert.equal(await flat.getAttribute('aria-keyshortcuts'), 'F');
  await flat.click();
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.worldFlat === 'true');
  assert.equal(await card().getByRole('button', { name: 'Make it 3D' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await announced(), 'The art is flat.');
  await page.waitForTimeout(900);
  await screenshot('work-card-forge-world-flat');
  await card().locator('[data-forge-stage]').focus();
  await page.keyboard.press('f');
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.worldFlat === 'false');
  assert.equal(await announced(), 'The art is 3D again.', 'F brings the depth back');

  await page.keyboard.press('ArrowRight');
  assert.match(await announced(), /^(Tree|Crystal|Lantern|Windmill), 1 of 6$/, 'the arrow keys walk the things in the world');
  await page.keyboard.press('Enter');
  assert.match(await announced(), /^The (tree shakes|crystal chimes|lantern|windmill’s sails)/, 'Enter touches the focused thing');

  const target = await sweep('pointer');
  assert(target, 'hovering a thing in the art shows the pointer cursor');
  await page.evaluate(() => { document.querySelector('unfold-card.work-run-card').shadowRoot.querySelector('[data-world-announce]').textContent = ''; });
  await page.mouse.click(target.x, target.y);
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('[data-world-announce]')?.textContent);
  assert.match(await announced(), /^The (tree|crystal|lantern|windmill|lighthouse)/, 'a click on a thing plays its reaction');
  await screenshot('work-card-forge-world-click');

  await card().getByRole('button', { name: 'Decorate' }).click();
  const panel = card().locator('[data-forge-decor]');
  await panel.waitFor({ state: 'visible' });
  assert.match(await panel.innerText(), /Only you see how you decorate your copy/);
  assert.equal(await panel.locator('[data-decor-tool="lighthouse"]').isDisabled(), true, 'the lighthouse waits for 180 days live');
  assert.match(await panel.locator('[data-decor-tool="lighthouse"]').innerText(), /Unlocks at 180 days live/);
  assert.equal(await panel.locator('option[value="noon"]').evaluate(option => option.disabled), true, 'noon waits for 30 days live');
  await panel.locator('[data-decor-tool="crystal"]').click();
  assert.equal(await inShadow('.forge', 'data-world-tool'), 'crystal');
  const ground = await sweep('copy');
  assert(ground, 'with a thing chosen, the ground in the art shows the copy cursor');
  await page.mouse.click(ground.x, ground.y);
  const placed = /^Placed a crystal\.$/.test(await announced() ?? '');
  assert(placed, `a click on the ground places the chosen thing: ${await announced()}`);
  await page.waitForFunction(() => /^Saved · 7 placed · only you see it$/.test(document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('[data-decor-status]')?.textContent ?? ''), null, { timeout: 10000 });
  await screenshot('work-card-forge-world-placed');
  await panel.locator('[data-decor-tool="erase"]').click();
  await card().locator('[data-forge-stage]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  assert.match(await announced(), /^Removed the (tree|crystal|lantern|windmill)\.$/, 'the eraser removes the focused thing by keyboard');
  await page.waitForFunction(() => /^Saved · 6 placed/.test(document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('[data-decor-status]')?.textContent ?? ''), null, { timeout: 10000 });
  await panel.locator('[data-decor-field="weather"]').selectOption('snow');
  await page.waitForFunction(() => /^Saved/.test(document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('[data-decor-status]')?.textContent ?? ''), null, { timeout: 10000 });
  const saved = await stored();
  assert.equal(saved.objects.length, 6);
  assert.equal(saved.weather, 'snow');
  assert(saved.objects.some(item => item.t === 'crystal' && item.s !== undefined), 'the placed crystal is stored');

  await page.reload();
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.world === 'islands', null, { timeout: 30000 });
  const counts = saved.objects.reduce((total, item) => ({ ...total, [item.t]: (total[item.t] ?? 0) + 1 }), {});
  const text = await description();
  assert.match(text, /, with snow\./, 'the saved weather comes back');
  for (const [type, count] of Object.entries(counts)) assert.match(text, count === 1 ? new RegExp(`\\ba ${type}\\b`) : new RegExp(`\\b${count} ${type}s\\b`), `${count} ${type} after the reload: ${text}`);

  await card().getByRole('button', { name: 'Decorate' }).click();
  await card().locator('[data-decor-action="reset"]').click();
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('[data-world-announce]')?.textContent === 'Back to the card’s own world');
  assert.equal(await stored(), null, 'the reset forgets the decoration');
  assert.match(await description(), /You can touch 3 trees, a crystal, a lantern and a windmill\.$/);

  const reduced = await page.evaluate(async () => {
    const { InnerWorld } = await import('/cards/skins/forge/world/index.js');
    const world = new InnerWorld({ seed: 0.3, reduced: true });
    world.show({ kind: 'islands', tod: 'auto', weather: 'snow', objects: [{ t: 'tree', x: 0, z: 0, s: 0.2 }, { t: 'crystal', x: 0.6, z: 0.2, s: 0.4 }] }, { days: 40, merged: true, condition: null });
    world.setFlat(true);
    const flatNow = world.state.flat;
    world.step(0.5, { tiltX: 0.2, tiltY: 0.2, look: 0.3 });
    world.focusStep(1);
    const touched = world.activate();
    world.step(0.5, { tiltX: 0.2, tiltY: 0.2, look: 0.3 });
    const result = { flatNow, time: world.timeOfDay(), particles: world.particles.live, text: touched.text, look: world.state.look };
    world.dispose();
    return result;
  });
  assert.deepEqual(reduced, { flatNow: 1, time: 'noon', particles: 0, text: reduced.text, look: 0 }, 'under reduced motion the world flattens at once, throws no particles and does not pan');
  assert.match(reduced.text, /^The (tree|crystal)/, 'and its things still answer');
  await page.evaluate(() => sessionStorage.removeItem('vloer-browser-live-cards'));
}
