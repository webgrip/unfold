/** Following a report: the news dot and toast, Your reports with the fix, the release and the team's comment, a reply posted from Unfold, and a repeat report suggested while typing and joined. The tracker answers are faked at the network, since the demo files nothing. */
export async function run({ page, app, assert, screenshot }) {
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const now = Date.now();
  const iso = minutes => new Date(now + minutes * 60_000).toISOString();
  let seen = false;
  const replies = [];
  const posted = [];
  const fixed = {
    id: '6f0c1c1e-0000-4000-8000-000000000001', title: 'Approve does nothing on the delivery gate', status: 'filed', url: 'https://forgejo.test/webgrip/unfold/issues/252', createdAt: iso(-2880),
    stage: 'shipped', words: 'Fixed in 0.4.0-rc.75', unread: true, others: 2, joined: false,
    fix: { number: '351', url: 'https://forgejo.test/webgrip/unfold/pulls/351', merged: true }, release: { tag: '0.4.0-rc.75', url: 'https://forgejo.test/webgrip/unfold/releases/tag/unfold-v0.4.0-rc.75', live: true },
    comments: [{ author: 'ryangr0', text: 'Found it: the gate ignored a second click while the first was saving. Fixed in #351.', at: iso(-600), mine: false }],
  };
  const asked = {
    id: '6f0c1c1e-0000-4000-8000-000000000002', title: 'Runs list jumps while it refreshes', status: 'filed', url: 'https://forgejo.test/webgrip/unfold/issues/260', createdAt: iso(-300),
    stage: 'replied', words: 'The team replied', unread: true, others: 0, joined: false,
    comments: [{ author: 'ryangr0', text: 'Which browser, and does it happen with live updates paused?', at: iso(-30), mine: false }],
  };
  const list = () => ({ reports: [fixed, asked].map(report => ({ ...report, unread: seen ? false : report.unread })), updates: seen ? 0 : 2 });
  await page.route('**/api/bootstrap', async route => { const response = await route.fetch(); const body = await response.json(); await route.fulfill({ response, json: { ...body, reports: { target: 'Forgejo · webgrip/unfold', demo: false } } }); });
  await page.route('**/api/reports', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: list() });
    posted.push(route.request().headers()['content-type']);
    return route.fulfill({ status: 201, json: { id: '6f0c1c1e-0000-4000-8000-000000000003', status: 'filed', url: fixed.url, message: 'Added to the existing report.', joined: true, others: 3, acknowledgement: 'We read every report on weekdays.' } });
  });
  await page.route('**/api/reports/seen', route => { seen = true; return route.fulfill({ json: { updates: 0 } }); });
  await page.route('**/api/reports/similar?*', route => route.fulfill({ json: { reports: /approve/i.test(new URL(route.request().url()).searchParams.get('q') ?? '') ? [{ id: fixed.id, title: fixed.title, words: 'Got it', people: 3, mine: false }] : [] } }));
  await page.route('**/api/reports/*/replies', async route => {
    replies.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: { report: { ...asked, unread: false, stage: 'looking', words: 'Looking into it', comments: [...asked.comments, { author: 'unfold-reports', text: 'Chrome, and yes, also when paused.', at: iso(0), mine: true }] } } });
  });

  await page.goto(`${base}/#now`);
  await page.reload();
  await page.waitForFunction(() => document.getElementById('page-title'));
  const flag = page.locator('.app-topbar [data-report-flag]');
  await page.locator('.app-topbar [data-report-signal]:not([hidden])').waitFor();
  assert.match(await flag.getAttribute('aria-label'), /2 of your reports have news/, 'the flag says how many reports have news');
  await page.locator('#toast.visible').waitFor();
  assert.match(await page.locator('#toast').textContent(), /Your report “Approve does nothing on the delivery gate” is now Fixed in 0\.4\.0-rc\.75/);

  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Search pages, commands and Work Items' }).fill('your reports');
  await page.getByRole('option', { name: /Your reports/ }).first().click();
  const mine = page.getByRole('dialog', { name: 'Your reports' });
  await mine.waitFor();
  await mine.locator('.report-follow').first().waitFor();
  const first = mine.locator('.report-follow').first();
  assert.match(await first.textContent(), /Fixed in 0\.4\.0-rc\.75/);
  assert.match(await first.textContent(), /Fixed by webgrip\/unfold#351 · live in 0\.4\.0-rc\.75 · 2 other people hit this too/);
  assert.match(await first.textContent(), /the gate ignored a second click/);
  assert.equal(await mine.locator('.report-follow.is-new').count(), 2, 'both reports show as new the first time');
  await screenshot('report-follow-mine');
  await page.waitForFunction(() => document.querySelector('.app-topbar [data-report-signal]')?.hidden === true);
  assert(seen, 'opening Your reports marks them seen');

  const second = mine.locator('.report-follow').nth(1);
  assert(await second.locator('details.report-reply').evaluate(element => element.open), 'a team question opens the answer box');
  await second.locator('textarea').fill('Chrome, and yes, also when paused.');
  await second.getByRole('button', { name: 'Send' }).click();
  await mine.getByText('Looking into it').waitFor();
  assert.deepEqual(replies, [{ text: 'Chrome, and yes, also when paused.' }]);
  assert.match(await mine.locator('.report-follow').nth(1).textContent(), /Added from Unfold/);

  await mine.getByRole('button', { name: 'Report a new problem' }).click();
  const dialog = page.getByRole('dialog', { name: 'Report a problem' });
  await dialog.waitFor();
  await dialog.locator('[data-report-canvas] canvas').waitFor({ timeout: 15000 });
  await page.locator('#report-happened').fill('Approve does nothing when I click it on the delivery gate');
  const same = dialog.getByRole('button', { name: 'Same problem' });
  await same.waitFor();
  await screenshot('report-follow-similar');
  await same.click();
  await dialog.getByText(/You join “Approve does nothing on the delivery gate”\. 3 people have hit it/).waitFor();
  assert.equal(await dialog.locator('#report-submit .button-label').textContent(), 'Add to report');
  await dialog.getByRole('button', { name: 'Not the same' }).click();
  assert.equal(await dialog.locator('#report-submit .button-label').textContent(), 'File report');
  assert(await dialog.locator('[data-report-similar]').isHidden(), 'a refused suggestion goes away');
  await page.locator('#report-happened').fill('Approve does nothing when I click it on the delivery gate, again');
  await page.waitForTimeout(900);
  assert(await dialog.locator('[data-report-similar]').isHidden(), 'and does not come back');
  await page.locator('#report-happened').fill('');
  await page.locator('#report-happened').fill('Approve on the gate still ignores me');
  await page.evaluate(() => { const holder = document.querySelector('[data-report-similar]'); holder.hidden = false; });

  await page.unroute('**/api/reports/similar?*');
  await page.route('**/api/reports/similar?*', route => route.fulfill({ json: { reports: [{ id: '6f0c1c1e-0000-4000-8000-000000000004', title: 'Approve ignores clicks', words: 'Looking into it', people: 1, mine: false }] } }));
  await page.locator('#report-happened').fill('Approve on the gate still ignores my click');
  await dialog.getByRole('button', { name: 'Same problem' }).click();
  await page.keyboard.press('Control+Enter');
  await dialog.getByText('Thanks, you’re on it too').waitFor();
  assert.match(await dialog.locator('.report-outcome').textContent(), /3 other people hit it before you\..*We read every report on weekdays\./s);
  await screenshot('report-follow-joined');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(posted.length, 1);

  await page.unrouteAll({ behavior: 'wait' });
  await page.evaluate(() => { try { localStorage.removeItem('unfold.report.draft'); localStorage.removeItem('unfold.report.noticed'); } catch {} });
  await page.goto(`${base}/#now`);
  await page.reload();
  await page.waitForFunction(() => document.getElementById('page-title'));
}
