/**
 * The effects director on the Work Item page: news since the person last saw a card plays once and not on reload (a
 * merge on a Vloer Native card, a finish step on a forge card), the calm swap under reduced motion with no overlay and
 * no movement, and the Off preference that plays nothing while the news is still announced.
 */
export async function run({ page, app, assert, screenshot }) {
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const daysAgo = days => new Date(Date.now() - days * 86_400_000).toISOString();
  const markSeen = (id, until) => page.evaluate(async ([id, until]) => {
    const { card } = await (await fetch(`/api/ploeg/work-items/${id}/card`)).json();
    const snapshot = { grade: typeof card.grade?.overall === 'number' ? card.grade.overall : null, setComplete: card.set?.complete === true };
    const response = await fetch(`/api/cards/${id}/seen`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Vloer-Request': '1' }, body: JSON.stringify({ until, snapshot }) });
    return [response.status, (await response.json()).seenAt];
  }, [id, until]);
  const seenAt = id => page.evaluate(async id => (await (await fetch(`/api/cards/${id}/seen`)).json()).seenAt, id);
  const record = () => page.evaluate(() => {
    const log = { titles: [], overlay: 0, phases: new Set(), skins: new Set() };
    window.fxLog = log;
    const watch = new MutationObserver(records => {
      for (const entry of records) {
        const target = entry.target;
        if (target instanceof Element && target.matches('.fx-title') && entry.attributeName === 'data-shown') log.titles.push({ text: target.querySelector('.fx-title-main').textContent, mode: target.dataset.mode, tier: target.dataset.tier });
        if (target instanceof Element && target.matches('unfold-card') && target.dataset.fx) log.phases.add(target.dataset.fx);
        for (const node of entry.addedNodes ?? []) if (node instanceof Element && node.matches('.fx-overlay')) log.overlay++;
      }
    });
    watch.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-shown', 'data-fx'] });
    const card = document.querySelector('unfold-card.work-run-card');
    if (card?.shadowRoot) watch.observe(card.shadowRoot, { subtree: true, attributes: true, attributeFilter: ['data-fx-sweep', 'data-forge-state'] });
  });
  const log = () => page.evaluate(() => ({ ...window.fxLog, phases: [...window.fxLog.phases] }));
  const open = async id => {
    await page.evaluate(id => { location.hash = `#work/${id}?lane=all`; }, id);
    await page.waitForFunction(id => document.querySelector('unfold-card.work-run-card')?.dataset.workItem === id && document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.gc:not([hidden])'), id, { timeout: 30000 });
  };
  const settled = () => page.waitForFunction(() => !document.querySelector('unfold-card[data-fx]') && (document.querySelector('.fx-title')?.hidden ?? true), null, { timeout: 15000 });

  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${base}/#work/101?lane=all`);
  await page.evaluate(() => { const prefs = JSON.parse(localStorage.getItem('vloer.prefs') || '{}'); delete prefs.cardMotion; localStorage.setItem('vloer.prefs', JSON.stringify(prefs)); });
  await page.reload();
  await page.locator('unfold-card.work-run-card, .work-detail').first().waitFor();

  const [status, mark] = await markSeen('114', daysAgo(3));
  assert.equal(status, 200, 'a person can set their seen mark on a card in their Teams');
  assert(Date.parse(mark) < Date.now() - 2 * 86_400_000, 'the mark is three days old, before the demo merge');
  await record();
  await open('114');
  await page.waitForFunction(() => window.fxLog.titles.some(title => title.text === 'Merged'), null, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.card[data-fx-sweep="gold"]'), null, { timeout: 5000 });
  await page.waitForTimeout(260);
  await screenshot('effects-merge-native');
  await settled();
  const merge = await log();
  assert.deepEqual(merge.titles.map(title => title.text).slice(0, 1), ['Merged'], 'the merge plays first');
  assert.equal(merge.titles.filter(title => title.text === 'Merged').length, 1, 'the merge plays once');
  assert.equal(merge.titles.find(title => title.text === 'Merged').mode, 'full');
  assert.equal(merge.titles.find(title => title.text === 'Merged').tier, 'major', 'a merge is a major ceremony');
  assert(merge.overlay >= 1, 'full motion draws page light on the shared overlay');
  assert(merge.phases.includes('impact'), 'the card takes the impact');
  assert.match(await page.locator('#announcement').textContent(), /Merged #3/, 'the news is announced');
  assert(Date.parse(await seenAt('114')) > Date.now() - 120_000, 'the mark moved forward before the ceremony ended');
  await page.waitForFunction(() => window.fxLog.titles.some(title => title.text === 'Released'), null, { timeout: 10000 });
  await settled();
  await page.waitForFunction(() => !document.querySelector('canvas.fx-overlay'), null, { timeout: 8000 });

  await page.reload();
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.gc:not([hidden])'), null, { timeout: 30000 });
  await record();
  await page.waitForTimeout(1500);
  assert.equal((await log()).titles.length, 0, 'a reload does not replay the merge');
  assert.equal(await page.locator('.fx-title:not([hidden])').count(), 0);

  await markSeen('117', daysAgo(3));
  await record();
  await open('117');
  await page.waitForFunction(() => window.fxLog.titles.some(title => title.text === 'Foil'), null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.forgeState === 'ceremony', null, { timeout: 10000 });
  await page.waitForTimeout(500);
  await screenshot('effects-finish-forge');
  await settled();
  await page.waitForFunction(() => document.querySelector('unfold-card.work-run-card')?.shadowRoot?.querySelector('.forge')?.dataset.forgeState === 'still', null, { timeout: 10000 });
  const finish = await log();
  assert.equal(finish.titles.find(title => title.text === 'Foil')?.tier, 'epic', 'a finish step is an epic ceremony');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await markSeen('124', daysAgo(3));
  await record();
  await open('124');
  await page.waitForFunction(() => window.fxLog.titles.length >= 2, null, { timeout: 15000 });
  await screenshot('effects-calm');
  await settled();
  const calm = await log();
  assert(calm.titles.every(title => title.mode === 'calm'), `reduced motion plays the calm swap: ${JSON.stringify(calm.titles)}`);
  assert.deepEqual(calm.titles.map(title => title.text), ['Merged', 'Released'], 'the merge and the release play in order');
  assert.equal(calm.overlay, 0, 'calm draws no page light');
  assert.deepEqual(calm.phases, [], 'calm never moves the card');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.goto(`${base}/#settings/preferences`);
  await page.getByRole('heading', { level: 1, name: 'Preferences' }).waitFor();
  await page.getByRole('radio', { name: /^Off/ }).check();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('vloer.prefs')).cardMotion), 'off');
  assert.equal(await page.getByRole('switch', { name: 'Card sound' }).isChecked(), false, 'card sound is off by default');
  await markSeen('118', daysAgo(3));
  await page.goto(`${base}/#work/101?lane=all`);
  await page.locator('.work-detail, unfold-card').first().waitFor();
  await record();
  await open('118');
  await page.waitForFunction(() => /Cracked/.test(document.querySelector('#announcement')?.textContent ?? ''), null, { timeout: 15000 });
  await page.waitForTimeout(800);
  assert.equal((await log()).titles.length, 0, 'Off plays no ceremony, but the news is still announced');
  await page.goto(`${base}/#settings/preferences`);
  await page.getByRole('radio', { name: /^Automatic/ }).check();
}
