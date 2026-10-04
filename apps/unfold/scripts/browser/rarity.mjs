/**
 * Run card rarity (Unfold ADR 0034) in the demo: every tier, predicted and revealed, on Unfold Native, each DOM skin pack
 * and the forge, under the CSP with the mark, the frame ring and the Rarity tab; the reveal ceremony at full size for a
 * legendary card and at the revealed tier, without a loss cue, for a reveal below its prediction; the still glow under
 * reduced motion; and the binder's rarity filter and rarest-first sort.
 */
export async function run({ page, app, assert, screenshot }) {
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const cards = [
    ['118', 'unfold-native', 'common', 'revealed'],
    ['114', 'unfold-native', 'uncommon', 'revealed'],
    ['121', 'unfold-native', 'rare', 'revealed'],
    ['109', 'unfold-native', 'uncommon', 'predicted'],
    ['134', 'holo', 'epic', 'revealed'],
    ['137', 'loot', 'legendary', 'revealed'],
    ['136', 'loot', 'rare', 'revealed'],
    ['138', 'arcade', 'uncommon', 'revealed'],
    ['139', 'arcade', 'legendary', 'revealed'],
    ['140', 'ticker', 'common', 'revealed'],
    ['141', 'ticker', 'epic', 'revealed'],
    ['142', 'patch', 'rare', 'revealed'],
    ['117', 'forge', 'common', 'revealed'],
    ['105', 'forge', 'rare', 'predicted'],
    ['123', 'forge', 'epic', 'revealed'],
    ['122', 'forge', 'legendary', 'revealed'],
  ];
  const labels = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
  const host = () => page.locator('unfold-card.work-run-card');
  const open = async id => {
    await page.goto(`${base}/#work/${id}?lane=all`);
    await page.waitForFunction(id => { const card = document.querySelector('unfold-card.work-run-card'); return card?.card?.workItemId === id && card.shadowRoot?.querySelector('.gc:not([hidden]) [data-slot="title"]'); }, id, { timeout: 30000 });
    await page.locator('#work-card').scrollIntoViewIfNeeded();
    return host();
  };
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  for (const [id, skin, tier, state] of cards) {
    const card = await open(id);
    assert.equal(await card.getAttribute('data-skin'), skin, `#${id} draws the ${skin} skin`);
    assert.deepEqual([await card.getAttribute('data-rarity'), await card.getAttribute('data-rarity-state')], [tier, state], `#${id} reflects a ${state} ${tier} rarity`);
    const mark = card.locator(`.gc-front .uc-rarity[data-rarity="${tier}"][data-state="${state}"]`).first();
    assert.equal(await mark.count(), 1, `#${id}: the ${skin} front prints the rarity mark`);
    assert.match(await mark.locator('.sr-only').textContent(), new RegExp(`^Rarity: ${state === 'predicted' ? `predicted ${tier}` : labels[tier]}`), `#${id}: the rarity is read out`);
    if (skin !== 'arcade') assert.match(await mark.innerText(), new RegExp(`${state === 'predicted' ? 'Predicted\\s+' : ''}${labels[tier]}`, 'i'), `#${id}: the tier's word is on the card`);
    if (skin !== 'forge') {
      const ring = await card.evaluate(element => { const frame = element.shadowRoot.querySelector('.gc-front .uc-frame'); if (!frame) return null; const style = getComputedStyle(frame); return { image: style.backgroundImage, animation: style.animationName, display: style.display }; });
      assert(ring, `#${id}: the frame ring is drawn`);
      if (state === 'revealed' && skin !== 'holo') assert.match(ring.image, /gradient/, `#${id}: a revealed ${tier} frame is metal`);
      if (state === 'predicted') assert.deepEqual([ring.image, ring.animation], ['none', 'uc-glow'], `#${id}: a predicted rarity glows instead of showing the metal`);
    } else {
      await page.waitForFunction(() => ['still', 'live', 'paused', 'failed'].includes(document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.forgeState), null, { timeout: 30000 });
      assert.match(await card.locator('.forge-facts').textContent(), new RegExp(`Rarity\\s*${state === 'predicted' ? `Predicted ${tier}` : labels[tier]}`), `#${id}: the forge's text facts carry the rarity`);
    }
    await screenshot(`rarity-${skin}-${tier}-${state}-${id}`);
  }

  const back = await open('120');
  await back.getByRole('button', { name: 'More info' }).click();
  await back.getByRole('tab', { name: 'Rarity' }).click();
  const panel = await back.getByRole('tabpanel', { name: 'Rarity' }).innerText();
  assert.match(panel, /^Rare because it /, 'the back leads with why');
  assert.match(panel, /Predicted\s+Epic, before the merge/, 'the prediction stays on the record');
  assert.match(panel, /Revealed\s+Rare · /);
  assert.match(panel, /Challenge score\s+57,8 of 100/);
  assert.match(panel, /Fixed thresholds: \d+ cards? in example\/order-service for 20\d\d-Q[1-4], fewer than 30/);
  assert.match(panel, /Reach · 30%[\s\S]*Sensitive paths · 25%[\s\S]*Novelty · 20%[\s\S]*Size, damped · 25%/, 'the four components');
  assert.match(panel, /not the grade \(how well it was done\) or the finish \(how long it has lived\)/, 'rarity is challenge, apart from grade and finish');
  assert.match(panel, /Demo · illustrative inputs, not rated by Ploeg/, 'the demo says its rarity is illustrative');
  assert.doesNotMatch(panel, /\b(?:lost|demoted|downgrad)/i, 'no loss words for a reveal below its prediction');
  await screenshot('rarity-back-120');
  await page.keyboard.press('Escape');

  const ceremony = async (id, detail) => {
    await open(id);
    await page.reload();
    await page.waitForFunction(id => document.querySelector('unfold-card.work-run-card')?.card?.workItemId === id && document.querySelector('unfold-card.work-run-card').shadowRoot?.querySelector('.gc:not([hidden])'), id, { timeout: 30000 });
    await page.evaluate(() => {
      window.rarityLog = { titles: [], dim: false };
      new MutationObserver(records => { for (const entry of records) { const target = entry.target; if (target instanceof Element && target.matches('.fx-title') && target.dataset.shown !== undefined) window.rarityLog.titles.push({ main: target.querySelector('.fx-title-main')?.textContent, sub: target.querySelector('.fx-title-sub')?.textContent ?? '', tier: target.dataset.tier, tone: target.dataset.tone }); } }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-shown'] });
    });
    await page.evaluate(async ([id, detail]) => {
      const { effects } = await import('/cards/effects/unfold.js');
      const { cardAsOf } = await import('/cards/collection-model.js');
      const host = document.querySelector('unfold-card.work-run-card');
      const at = host.card.rarity.revealedAt;
      effects.request({ workItemId: id, kind: 'rarity', at, detail }, { key: id, host, card: host.card, before: cardAsOf(host.card, Date.parse(at) - 1000) });
    }, [id, detail]);
    await page.waitForFunction(() => window.rarityLog.titles.length > 0, null, { timeout: 15000 });
  };
  const settled = () => page.waitForFunction(() => !document.querySelector('unfold-card[data-fx]') && (document.querySelector('.fx-title')?.hidden ?? true), null, { timeout: 15000 });

  await ceremony('122', { tier: 'legendary', predicted: 'legendary' });
  await page.waitForTimeout(700);
  await screenshot('rarity-reveal-legendary-forge');
  const legendary = await page.evaluate(() => window.rarityLog.titles[0]);
  assert.deepEqual([legendary.main, legendary.tier, legendary.tone], ['Legendary', 'legendary', 'prism'], 'a legendary reveal is the full ceremony in prism');
  assert.match(legendary.sub, /as predicted/);
  await settled();

  await ceremony('136', { tier: 'rare', predicted: 'epic' });
  const fair = await page.evaluate(() => window.rarityLog.titles[0]);
  assert.deepEqual([fair.main, fair.sub, fair.tier, fair.tone], ['Rare', 'revealed at release', 'major', 'silver'], 'a reveal below its prediction plays at its own tier, without a loss cue');
  await page.waitForTimeout(250);
  await screenshot('rarity-reveal-rare-loot');
  await settled();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const still = await open('109');
  const calm = await still.evaluate(element => ({ ring: getComputedStyle(element.shadowRoot.querySelector('.gc-front .uc-frame')).animationName, gems: [...element.shadowRoot.querySelectorAll('.uc-rarity *')].filter(node => getComputedStyle(node).animationName !== 'none').length }));
  assert.deepEqual(calm, { ring: 'none', gems: 0 }, 'reduced motion keeps the predicted glow still');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.goto(`${base}/#binder`);
  await page.locator('.binder-grid').waitFor({ timeout: 30000 });
  if (await page.locator('.binder-away').count()) await page.getByRole('button', { name: /Skip|Done/ }).click();
  const filter = page.locator('#binder-rarity');
  assert.equal(await filter.count(), 1, 'the binder filters by rarity');
  await page.locator('#binder-sort').selectOption('rarity');
  await page.waitForFunction(() => /rarest first/.test(document.querySelector('#binder-grid-title')?.textContent ?? ''));
  const order = await page.locator('.binder-slot .binder-rarity').evaluateAll(marks => marks.map(mark => mark.dataset.rarity));
  const rank = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
  assert.deepEqual(order, [...order].sort((a, b) => rank[b] - rank[a]), `rarest first: ${order.join(', ')}`);
  assert.equal(order[0], 'legendary');
  await screenshot('rarity-binder-rarest-first');
  await filter.selectOption('epic');
  assert(await page.locator('.binder-slot').evaluateAll(slots => slots.length > 0 && slots.every(slot => slot.querySelector('.binder-rarity')?.dataset.rarity === 'epic')), 'the filter keeps one tier');
  await filter.selectOption('');
  await page.locator('#binder-sort').selectOption('recent');
}
