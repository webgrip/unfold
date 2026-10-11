/** Report a problem: open it from the top bar and the palette, see private text blurred in the screenshot, mark it up, file it in the demo. */
export async function run({ page, app, assert, screenshot }) {
  const base = `http://127.0.0.1:${app.server.address().port}`;
  await page.goto(`${base}/#now`);
  await page.waitForFunction(() => document.getElementById('page-title'));
  const item = await page.evaluate(() => /#work\/(\d+)/.exec(document.querySelector('a[href^="#work/"]')?.getAttribute('href') ?? '')?.[1]);
  assert(item, 'the demo Now page links a Work Item');
  await page.evaluate(next => { location.hash = next; }, `work/${item}`);
  await page.waitForSelector('#work-brief-text[data-private]');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.getElementById('work-brief-text').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);

  const scrolledTo = await page.evaluate(() => scrollY);
  const dialog = page.getByRole('dialog', { name: 'Report a problem' });
  const flag = await page.locator('.app-topbar').getByRole('button', { name: 'Report a problem' }).boundingBox();
  await page.mouse.click(flag.x + flag.width / 2, flag.y + flag.height / 2);
  await dialog.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'report-happened', 'the cursor starts in What happened');
  const canvas = dialog.locator('[data-report-canvas] canvas');
  await canvas.waitFor({ timeout: 15000 });
  await screenshot('report-dialog');
  assert.equal(await page.evaluate(() => scrollY), scrolledTo, 'opening the dialog does not scroll the page it photographs');
  const { secret, open } = await page.evaluate(() => {
    const view = document.querySelector('#report-dialog canvas');
    const scale = view.width / document.documentElement.clientWidth;
    const visible = element => { const box = element.getBoundingClientRect(); return box.bottom > 0 && box.top < innerHeight && box.width > 40 && box.height > 12 ? box : null; };
    const density = box => {
      const height = Math.min(box.height, 16);
      const data = view.getContext('2d').getImageData(Math.round(box.left * scale), Math.round(Math.max(0, box.top) * scale), Math.round(Math.min(box.width, 240) * scale), Math.round(height * scale));
      let edges = 0;
      for (let row = 0; row < data.height; row++) for (let column = 1; column < data.width; column++) { const at = (row * data.width + column) * 4; edges += Math.abs(data.data[at] - data.data[at - 4]); }
      return edges / (data.width * data.height);
    };
    const privateBox = [...document.querySelectorAll('main [data-private]')].map(visible).find(Boolean);
    const openBox = [...document.querySelectorAll('main p')].filter(element => !element.closest('[data-private]') && element.textContent.trim().length > 40).map(visible).find(Boolean);
    return { secret: privateBox ? density(privateBox) : null, open: openBox ? density(openBox) : null };
  });
  assert(secret !== null && open !== null, 'a private and an ordinary text block are on screen');
  assert(open > 1, `ordinary text is sharp in the screenshot (${open.toFixed(2)})`);
  assert(secret < open / 2, `private text is blurred in the screenshot: edge density ${secret.toFixed(2)} against ${open.toFixed(2)} for ordinary text`);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });

  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Search pages, commands and Work Items' }).fill('report a problem');
  await page.getByRole('option', { name: /Report a problem/ }).first().click();
  await dialog.waitFor();
  await canvas.waitFor({ timeout: 15000 });
  assert.equal(await page.locator('#palette[open]').count(), 0, 'the palette closed before the screenshot');

  const box = await canvas.boundingBox();
  const drag = async (from, to) => { await page.mouse.move(box.x + from[0], box.y + from[1]); await page.mouse.down(); await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 4 }); await page.mouse.up(); };
  const undo = dialog.getByRole('button', { name: 'Undo' });
  assert(await undo.isDisabled(), 'nothing to undo yet');
  await drag([40, 40], [160, 110]);
  await dialog.getByRole('button', { name: 'Arrow' }).click();
  assert.equal(await dialog.getByRole('button', { name: 'Arrow' }).getAttribute('aria-pressed'), 'true');
  await drag([260, 160], [180, 100]);
  await dialog.getByRole('button', { name: 'Text' }).click();
  await page.mouse.click(box.x + 60, box.y + 140);
  await page.keyboard.type('Wrong count');
  await page.keyboard.press('Enter');
  assert(!await undo.isDisabled(), 'a mark can be undone');
  await undo.click();
  await screenshot('report-marked');

  await dialog.getByRole('button', { name: 'File report' }).click();
  assert.equal(await page.locator('#report-happened').getAttribute('aria-invalid'), 'true', 'What happened is required');
  await page.locator('#report-happened').fill('The waiting count did not match the rows. It said 9.');
  assert.equal(await page.locator('#report-title-input').inputValue(), `Work Item: The waiting count did not match the rows.`.replace('Work Item', await page.evaluate(() => document.getElementById('page-title')?.textContent?.trim())), 'the title is suggested from the page and the first sentence');
  const posted = page.waitForRequest(request => request.url().endsWith('/api/reports') && request.method() === 'POST');
  await dialog.getByRole('button', { name: 'File report' }).click();
  const request = await posted;
  assert.match(request.headers()['content-type'], /^multipart\/form-data; boundary=/);
  assert.equal(request.headers()['x-unfold-request'], '1');
  await dialog.getByRole('status').filter({ hasText: 'This is the demo: Unfold kept the report and filed nothing.' }).waitFor();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await dialog.waitFor({ state: 'hidden' });
  const stored = app.store.db.prepare('SELECT status, title FROM reports ORDER BY created_at DESC LIMIT 1').get();
  assert.equal(stored.status, 'kept');
  const files = app.store.db.prepare('SELECT name FROM report_files WHERE report_id=(SELECT id FROM reports ORDER BY created_at DESC LIMIT 1)').all().map(row => row.name);
  assert(files.includes('screenshot.png'), 'the marked-up screenshot was attached');
}
