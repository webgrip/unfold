/** Report a problem: open it from the top bar, the palette and !, see private text blurred, point at a control, mark it up, keep a draft, file with Ctrl Enter in the demo. */
export async function run({ page, app, assert, screenshot }) {
  const base = `http://127.0.0.1:${app.server.address().port}`;
  await page.goto(`${base}/#now`);
  await page.waitForFunction(() => document.getElementById('page-title'));
  await page.waitForSelector('main a[href^="#work/"]');
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
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'report-happened', 'the cursor starts in What went wrong');
  const canvas = dialog.locator('[data-report-canvas] canvas');
  await canvas.waitFor({ timeout: 15000 });
  await screenshot('report-dialog');
  assert.equal(await page.evaluate(() => scrollY), scrolledTo, 'opening the dialog does not scroll the page it photographs');
  const { secret, open } = await page.evaluate(() => {
    const view = document.querySelector('#report-dialog canvas');
    const scale = view.width / document.documentElement.clientWidth;
    const visible = element => { const box = element.getBoundingClientRect(); return box.bottom > 0 && box.top < innerHeight && box.width > 40 && box.height > 12 ? box : null; };
    const density = (box, inset = 0) => {
      const height = Math.min(box.height - inset, 16);
      const data = view.getContext('2d').getImageData(Math.round((box.left + inset) * scale), Math.round((Math.max(0, box.top) + inset) * scale), Math.round(Math.min(box.width - 2 * inset, 240) * scale), Math.round(height * scale));
      let edges = 0;
      for (let row = 0; row < data.height; row++) for (let column = 1; column < data.width; column++) { const at = (row * data.width + column) * 4; edges += Math.abs(data.data[at] - data.data[at - 4]); }
      return edges / (data.width * data.height);
    };
    const privateBox = [...document.querySelectorAll('main [data-private]')].map(visible).find(Boolean);
    const openBox = [...document.querySelectorAll('main p')].filter(element => !element.closest('[data-private]') && element.textContent.trim().length > 40).map(visible).find(Boolean);
    return { secret: privateBox ? density(privateBox, 22) : null, open: openBox ? density(openBox) : null };
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
  assert.equal(await dialog.getByRole('button', { name: 'Highlight' }).getAttribute('aria-pressed'), 'true', 'Highlight is the tool a report starts with');
  const flagOnShot = await page.evaluate(() => {
    const view = document.querySelector('#report-dialog canvas').getBoundingClientRect();
    const ratio = view.width / document.documentElement.clientWidth;
    const flag = document.querySelector('.app-topbar .app-report').getBoundingClientRect();
    return { x: view.left + (flag.left + flag.width / 2) * ratio, y: view.top + (flag.top + flag.height / 2) * ratio };
  });
  await page.mouse.move(flagOnShot.x, flagOnShot.y);
  await page.mouse.click(flagOnShot.x, flagOnShot.y);
  await dialog.getByText('Pointed at button “Report a problem”').waitFor();
  await screenshot('report-pointed');
  await drag([40, 40], [160, 110]);
  await page.keyboard.press('a');
  assert.equal(await dialog.getByRole('button', { name: 'Arrow' }).getAttribute('aria-pressed'), 'true', 'A picks the arrow while the focus is not in a text field');
  await drag([260, 160], [180, 100]);
  await dialog.getByRole('button', { name: 'Label' }).click();
  await page.mouse.click(box.x + 60, box.y + 140);
  await page.keyboard.type('Wrong count');
  await page.keyboard.press('Enter');
  assert(!await undo.isDisabled(), 'a mark can be undone');
  await dialog.getByText('4 marks.', { exact: false }).waitFor();
  await undo.click();
  await dialog.getByText('3 marks.', { exact: false }).waitFor();

  await dialog.getByRole('button', { name: 'File report' }).click();
  assert.equal(await page.locator('#report-happened').getAttribute('aria-invalid'), 'true', 'What went wrong is required');
  await page.locator('#report-happened').fill('The waiting count did not match the rows. It said 9.');
  const pageTitle = await page.evaluate(() => document.getElementById('page-title')?.textContent?.trim());
  await dialog.getByText(`${pageTitle}: The waiting count did not match the rows.`).waitFor();
  await dialog.getByRole('button', { name: 'Add what you expected instead' }).click();
  await page.locator('#report-expected').fill('The count matches the rows.');
  await dialog.getByRole('group', { name: 'How much is it in your way?' }).getByRole('button', { name: 'Slows me down' }).click();
  await screenshot('report-marked');

  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.keyboard.press('!');
  await dialog.waitFor();
  await dialog.getByText('Your unsent report is back.').waitFor();
  assert.equal(await page.locator('#report-happened').inputValue(), 'The waiting count did not match the rows. It said 9.', 'closing by accident keeps the text');
  assert.equal(await page.locator('#report-expected').inputValue(), 'The count matches the rows.');
  await canvas.waitFor({ timeout: 15000 });

  const posted = page.waitForRequest(request => request.url().endsWith('/api/reports') && request.method() === 'POST');
  await page.locator('#report-happened').press('Control+Enter');
  const request = await posted;
  assert.match(request.headers()['content-type'], /^multipart\/form-data; boundary=/);
  assert.equal(request.headers()['x-unfold-request'], '1');
  await dialog.getByRole('status').filter({ hasText: 'This is the demo: Unfold kept the report and filed nothing.' }).waitFor();
  await screenshot('report-filed');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await dialog.waitFor({ state: 'hidden' });
  const stored = app.store.db.prepare('SELECT status, title, body FROM reports ORDER BY created_at DESC LIMIT 1').get();
  assert.equal(stored.status, 'kept');
  assert.equal(stored.title, `${pageTitle}: The waiting count did not match the rows.`);
  const body = JSON.parse(stored.body);
  assert.deepEqual({ kind: body.kind, impact: body.impact, expected: body.expected }, { kind: 'broken', impact: 'slows', expected: 'The count matches the rows.' }, 'the kind, impact and expectation came back with the draft');
  assert.equal(body.context.element, undefined, 'the reopened report starts without the earlier marks');
  const files = app.store.db.prepare('SELECT name FROM report_files WHERE report_id=(SELECT id FROM reports ORDER BY created_at DESC LIMIT 1)').all().map(row => row.name);
  assert(files.includes('screenshot.png'), 'the screenshot was attached');

  await page.keyboard.press('!');
  await dialog.waitFor();
  assert.equal(await page.locator('#report-happened').inputValue(), '', 'a filed report leaves no draft behind');
  await dialog.getByRole('button', { name: 'Idea' }).click();
  await dialog.getByText('What would help?').waitFor();
  assert(await dialog.locator('[data-report-impact]').isHidden(), 'an idea has no impact');
  await page.keyboard.press('Escape');
}
