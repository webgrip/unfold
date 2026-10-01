/**
 * The collection side of Run cards in the demo: card logins, the private binder with forge thumbnails, a focused 3D
 * card and the "While you were away" replay, ripping a demo pack by keyboard (Enter tears, Space reveals) to its
 * summary, the published odds, the reduced-motion ceremony with instant reveals and skip after 300 ms, and the Team
 * season page with Team totals only.
 */
export async function run({ page, app, assert, screenshot }) {
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const phase = () => page.evaluate(() => document.querySelector('#pack-stage')?.dataset.phase ?? null);
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.goto(`${base}/#settings/cards`);
  await page.getByRole('heading', { level: 1, name: 'Card logins' }).waitFor();
  assert.equal(await page.locator('.identity-logins').innerText(), 'demo-operator', 'the demo binder uses the demo login');
  assert.match(await page.locator('.settings-footnote').innerText(), /no one else, an administrator included, can open them/);

  const seen = await page.evaluate(async until => (await fetch('/api/binder/seen', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Vloer-Request': '1' }, body: JSON.stringify({ until }) })).status, new Date(Date.now() - 15 * 86_400_000).toISOString());
  assert.equal(seen, 200);
  await page.goto(`${base}/#binder`);
  await page.getByRole('heading', { level: 1, name: 'Binder' }).waitFor();
  await page.locator('.binder-away').waitFor();
  assert.match(await page.locator('.binder-away').textContent(), /While you were away\s*\d+ of \d+/, 'moments since the last visit replay one by one');
  await page.waitForFunction(() => ['still', 'live'].includes(document.querySelector('#binder-focus')?.shadowRoot?.querySelector('.forge')?.dataset.forgeState), null, { timeout: 30000 });
  await page.getByRole('button', { name: 'Skip' }).click();
  assert.equal(await page.locator('.binder-away').count(), 0, 'skipping ends the replay');
  const replay = await page.evaluate(async () => (await (await fetch('/api/binder')).json()).away.length);
  assert.equal(replay, 0, 'nothing replays twice');
  const copies = await page.evaluate(async () => (await (await fetch('/api/binder')).json()).copies.length);
  assert(copies >= 8, `the demo binder holds the demo login's copies: ${copies}`);
  assert.match(await page.locator('.binder-readouts').textContent(), new RegExp(`Cards\\s*${copies}`), 'the readout counts the person\'s own copies');
  assert.equal(await page.locator('.binder-readouts').getByText(/rank|top|leader/i).count(), 0, 'personal readouts only');
  await page.waitForFunction(() => document.querySelectorAll('canvas[data-thumb][data-drawn="true"]').length >= 3, null, { timeout: 60000 });
  const thumb = await page.locator('canvas[data-thumb][data-drawn="true"]').first().evaluate(canvas => { const g = canvas.getContext('2d'); const pixel = g.getImageData(Math.round(canvas.width / 2), Math.round(canvas.height * 0.3), 1, 1).data; return [canvas.width, pixel[0] + pixel[1] + pixel[2]]; });
  assert(thumb[0] > 100 && thumb[1] > 30, `a thumbnail is a painted still frame: ${thumb}`);
  assert(await page.locator('.binder-sleeve').count() >= 1, 'cards whose pull waits in a pack sit in a sleeve');
  const slot = page.locator('.binder-slot').nth(2);
  const title = await slot.locator('.binder-slot-title').innerText();
  await slot.click();
  assert.equal(await slot.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.binder-focus-title').innerText(), title, 'clicking a card focuses it large');
  await page.getByRole('button', { name: 'Developer', exact: true }).click();
  assert(await page.locator('.binder-slot').evaluateAll(slots => slots.every(button => button.getAttribute('aria-label').includes('Developer copy'))), 'the role filter keeps developer copies only');
  await page.getByRole('button', { name: 'All roles', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('canvas[data-thumb][data-drawn="true"]').length >= 3, null, { timeout: 60000 });
  await screenshot('binder');

  await page.goto(`${base}/#packs`);
  await page.getByRole('heading', { level: 2, name: /Week \d+ · \d{4}/ }).first().waitFor();
  await page.waitForFunction(() => document.querySelector('#pack-stage')?.dataset.scene === 'ready' && Number(document.querySelector('#pack-stage')?.dataset.packFrames) > 2, null, { timeout: 30000 });
  assert.match(await page.locator('.pack-demo').innerText(), /Demo pack · illustrative cards · no spend/);
  await screenshot('pack-sealed');
  await page.locator('#pack-primary').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#pack-stage')?.dataset.phase === 'ready', null, { timeout: 30000 });
  assert.match(await page.locator('#pack-primary').innerText(), /Reveal card 1 of \d+/);
  assert(await page.locator('#pack-skip[data-shown]').count(), 'the ceremony can be skipped after 300 ms');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('#pack-stage')?.dataset.phase === 'charging');
  await screenshot('pack-rip-charging');
  await page.waitForFunction(() => document.querySelector('#pack-stage')?.dataset.phase === 'revealed', null, { timeout: 30000 });
  await page.waitForTimeout(400);
  assert.match(await page.locator('#pack-title').innerText(), /new card|upgrade/i);
  assert.match(await page.locator('#announcement').innerText(), /Card 1 of \d+/, 'each reveal is announced');
  await screenshot('pack-rip-revealed');
  for (let guard = 0; guard < 12 && !(await page.locator('.pack-summary').count()); guard++) {
    await page.keyboard.press('Space');
    await page.waitForFunction(() => ['ready', 'revealed'].includes(document.querySelector('#pack-stage')?.dataset.phase) || document.querySelector('.pack-summary'), null, { timeout: 30000 });
    if (await phase() === 'ready') { await page.keyboard.press('Space'); await page.waitForFunction(() => document.querySelector('#pack-stage')?.dataset.phase === 'revealed', null, { timeout: 30000 }); }
  }
  await page.locator('.pack-summary').waitFor();
  assert.match(await page.locator('.pack-summary-line').innerText(), /^\d+ cards?/);
  await page.waitForFunction(() => [...document.querySelectorAll('canvas[data-summary]')].every(canvas => canvas.dataset.drawn), null, { timeout: 60000 });
  await screenshot('pack-summary');
  await page.getByRole('button', { name: 'Add to binder' }).click();
  await page.getByRole('heading', { level: 1, name: 'Binder' }).waitFor();
  assert(await page.locator('.binder-slot-meta').evaluateAll(metas => metas.some(meta => /foil|Plain/.test(meta.textContent))), 'pulled copies show their pull in the binder');

  await page.goto(`${base}/#packs/odds`);
  await page.getByRole('heading', { level: 1, name: 'Pack odds' }).waitFor();
  assert.equal(await page.getByRole('table', { name: 'Foil pattern odds' }).locator('tbody tr').count(), 16, 'every pattern has its published chance');
  assert.match(await page.locator('.odds-page').innerText(), /add up to 100,00%/);
  assert.match(await page.locator('.odds-page').innerText(), /cannot be bought, re-rolled, traded/);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/#packs`);
  await page.waitForFunction(() => document.querySelector('#pack-stage')?.dataset.scene === 'ready', null, { timeout: 30000 });
  await page.locator('#pack-primary').click();
  await page.waitForFunction(() => document.querySelector('#pack-stage')?.dataset.phase === 'ready', null, { timeout: 10000 });
  await page.locator('#pack-primary').click();
  const started = Date.now();
  await page.waitForFunction(() => document.querySelector('#pack-stage')?.dataset.phase === 'revealed', null, { timeout: 5000 });
  assert(Date.now() - started < 2500, 'reduced motion reveals at once, with no charge or burst');
  await page.getByRole('button', { name: 'Skip to summary' }).click();
  await page.locator('.pack-summary').waitFor();
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.goto(`${base}/#season?quarter=2026-Q3`);
  await page.getByRole('heading', { level: 1, name: /^Season · delivery$/ }).waitFor();
  assert.match(await page.locator('.season-privacy').innerText(), /Team totals only/);
  assert.equal(await page.locator('.season-page').getByText('demo-operator').count(), 0, 'the season page names nobody');
  await screenshot('season');
}
