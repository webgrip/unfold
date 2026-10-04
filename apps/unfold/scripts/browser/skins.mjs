/**
 * The DOM skin packs on the Work Item page: each draws its demo cards under the strict CSP with the facts every card
 * shows, turns to Unfold Native's tabs, fits a phone without horizontal scrolling, plays a moment when the card changes,
 * runs its idle animation only while on screen, and keeps still under reduced motion.
 */
export async function run({ page, app, assert, screenshot }) {
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const skins = [
    ['holo', [['134', 'Store the chosen payment method on the checkout session'], ['135', 'Checkout overhaul']]],
    ['loot', [['136', 'Recalculate shipping costs when the address changes'], ['137', 'Retry failed stock reservations with backoff']]],
    ['arcade', [['138', 'Show an order summary step before payment'], ['139', 'Order service reliability']]],
    ['ticker', [['141', 'Validate discount codes before the payment step'], ['140', 'Send the order confirmation in the customer language']]],
    ['patch', [['142', 'Remember the last used delivery address'], ['143', 'Order flow polish']]],
  ];
  const host = () => page.locator('unfold-card.work-run-card');
  const open = async (id, title) => {
    await page.goto(`${base}/#work/${id}?lane=all`);
    await page.waitForFunction(text => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.gc:not([hidden]) [data-slot="title"]')?.textContent === text, title);
    await page.locator('#work-card').scrollIntoViewIfNeeded();
    return host();
  };
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width > 600 ? 1040 : 844 });
    for (const [skin, cards] of skins) {
      for (const [id, title] of cards) {
        const card = await open(id, title);
        assert.equal(await card.getAttribute('data-skin'), skin, `#${id} draws the ${skin} skin`);
        const root = card.locator('.gc-front [data-skin-root]');
        assert.equal(await root.count(), 1, `#${id}: the ${skin} front is drawn`);
        assert.match(await card.locator('.gc-front [data-slot="cost"]').getAttribute('aria-label'), /Demo · no model calls/, `#${id}: the ${skin} card invents no spend`);
        assert.equal(await card.locator('.gc-front [data-slot="state"]').count() >= 1, true);
        assert.equal(await card.locator('.gc-front [data-slot="steward"] .sr-only').first().textContent(), await card.evaluate(element => element.card.steward ? `Signed by ${element.card.steward.name}` : 'Unsigned'), `#${id}: the steward is read out`);
        assert.match(await card.locator('.gc-front [data-slot="ids"]').first().textContent(), new RegExp(`#${id}`));
        assert.doesNotMatch(await root.innerText(), /US\$/, `#${id}: no amount on a demo card`);
        assert.equal(await overflow(), 0, `#${id} ${skin} at ${width}px: no horizontal scrolling`);
        const fits = await card.evaluate(element => { const front = element.shadowRoot.querySelector('.sk-card').getBoundingClientRect(); const box = element.getBoundingClientRect(); return front.left >= box.left - 1 && front.right <= box.right + 1; });
        assert(fits, `#${id} ${skin} at ${width}px: the card fits its column`);
        if (width > 600) await screenshot(`work-card-${skin}-${id}`);
        else await screenshot(`work-card-${skin}-${id}-phone`);
      }
      if (width > 600) {
        const card = host();
        await card.getByRole('button', { name: 'More info' }).click();
        await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.activeElement?.matches('[data-card-focus]'));
        assert.equal(await card.getByRole('tab').count(), await card.evaluate(element => element.card ? element.shadowRoot.querySelectorAll('.gc-back [data-card-tab]').length : 0), `${skin}: the back keeps Unfold Native's tabs`);
        assert(await card.getByRole('tab').count() >= 6);
        await card.getByRole('tab', { name: 'Context' }).click();
        assert.match(await card.getByRole('tabpanel', { name: 'Context' }).innerText(), /Epic\s+\S/, `${skin}: the Context tab names the epic`);
        await screenshot(`work-card-${skin}-back`);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.getAttribute('face') === 'front');
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1040 });

  const cracked = await open('136', 'Recalculate shipping costs when the address changes');
  assert.equal(await cracked.locator('.gc-front [data-skin-root]').getAttribute('data-condition'), 'cracked', 'a cracked card says so on its root');
  assert(await cracked.locator('.gc-front [data-skin-root] path[pathLength="1"]').count() > 0, 'and draws its crack');
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('[data-skin-root]')?.hasAttribute('data-idle'));
  const heard = page.evaluate(() => new Promise(resolve => document.addEventListener('unfold-card-moment', event => resolve(event.detail), { once: true })));
  await cracked.evaluate(element => { const next = structuredClone(element.card); next.condition = { ...next.condition, state: 'mended', cracks: next.condition.cracks.map(crack => ({ ...crack, mended: { at: null, by: 'demo-operator', pr: 80, bySteward: true } })) }; element.card = next; });
  assert.deepEqual(await heard, { moments: ['mend'], workItemId: '136', skin: 'loot' }, 'a mend plays the mend moment and tells the page');
  assert.match(await cracked.locator('.gc-front [data-skin-root]').getAttribute('data-moment'), /\bmend\b/, 'the root carries the moment while it plays');
  await page.waitForFunction(() => !document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('[data-skin-root]')?.hasAttribute('data-moment'), null, { timeout: 5000 });
  assert.equal(await cracked.locator('.gc-front [data-skin-root]').getAttribute('data-condition'), 'mended', 'the gold seams stay');

  await cracked.getByRole('button', { name: 'More info' }).click();
  await page.waitForFunction(() => !document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('[data-skin-root]')?.hasAttribute('data-idle'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('[data-skin-root]')?.hasAttribute('data-idle'));
  await page.setViewportSize({ width: 1440, height: 420 });
  await page.evaluate(() => { for (let element = document.querySelector('#work-card'); element; element = element.parentElement) element.scrollTop = element.scrollHeight; document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight; });
  await page.waitForFunction(() => !document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('[data-skin-root]')?.hasAttribute('data-idle'), null, { timeout: 5000 });
  await page.setViewportSize({ width: 1440, height: 1040 });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const still = await open('142', 'Remember the last used delivery address');
  await still.evaluate(element => { const next = structuredClone(element.card); next.condition = { state: 'cracked', cracks: [{ id: 'browser', bug: { workItemId: null, ref: 'DEMO-90', title: 'Browser check crack' }, severity: 'S3', share: 'primary', discovery: 'discovered', proposedAt: null, confirmedAt: null, confirmedBy: [], disputed: false, mended: null }] }; element.card = next; });
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('[data-skin-root]')?.dataset.condition === 'cracked');
  const motion = await still.evaluate(element => { const root = element.shadowRoot.querySelector('[data-skin-root]'); const moving = [...element.shadowRoot.querySelectorAll('*')].filter(node => getComputedStyle(node).animationName !== 'none'); return { moment: root.hasAttribute('data-moment'), moving: moving.length }; });
  assert.deepEqual(motion, { moment: false, moving: 0 }, 'reduced motion shows the end state without animation');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}
