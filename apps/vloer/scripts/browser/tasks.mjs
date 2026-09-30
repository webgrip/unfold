import { readFile } from 'node:fs/promises';

/** Tasks: connections dialog, task preview, import with an explicit start, candidate downloads, duplicate import and a changed revision. */
export async function run({ page, app, assert, screenshot }) {
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await page.locator('[data-action="task-preview"]').first().waitFor();
  await page.getByRole('heading', { name: 'Bring this task onto the floor.' }).waitFor();
  assert.equal(new URL(page.url()).hash, '#tasks?source=demo-tasks&task=1', 'a wide screen does not open the first task beside the list');
  assert.equal(await page.getByLabel('Session budget · USD', { exact: true }).inputValue(), '5.00', 'the budget is not prefilled with cents');
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  const connections = page.getByRole('dialog', { name: 'Your tasks, connected.' });
  for (const provider of ['Forgejo', 'GitHub', 'GitLab', 'ClickUp', 'Vikunja']) await connections.getByText(provider, { exact: true }).waitFor();
  await connections.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('[data-action="task-preview"]').first().click();
  await page.getByRole('heading', { name: 'Bring this task onto the floor.' }).waitFor();
  assert.equal(new URL(page.url()).hash, '#tasks?source=demo-tasks&task=1', 'the selected task is not in the address');
  assert.equal(await page.locator('.tasks-brief li').count(), 3, 'the task brief is not rendered as Markdown');
  await page.reload();
  await page.getByRole('heading', { name: 'Bring this task onto the floor.' }).waitFor();
  assert.equal(await page.locator('#task-row-1').getAttribute('aria-current'), 'true', 'a reload lost the selected task');
  await page.locator('#task-search').fill('no such task');
  await page.getByText('No tasks match', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await page.locator('#page-title').focus();
  await page.keyboard.press('j');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'task-row-1', 'j does not move to the first task');
  await page.getByLabel('Session budget · USD', { exact: true }).fill('3.25');
  await screenshot('tasks-preview');
  await page.setViewportSize({ width: 1280, height: 800 });
  const create = await page.getByRole('button', { name: 'Create session', exact: true }).boundingBox();
  assert(create && create.y + create.height <= 800, 'Create session is below the fold at 1280x800');
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1040 }]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Task layout overflows at ${viewport.width}px`);
    assert.equal(await page.getByLabel('Session budget · USD', { exact: true }).inputValue(), '3.25');
    assert.equal(await page.getByRole('button', { name: 'All tasks', exact: true }).isVisible(), viewport.width < 720, `the back button shows wrongly at ${viewport.width}px`);
    assert.equal(await page.locator('#task-row-1').isVisible(), viewport.width >= 720, `the task list shows wrongly beside the task at ${viewport.width}px`);
    await screenshot(`tasks-${viewport.width}`);
    if (viewport.width < 720) {
      await page.getByRole('button', { name: 'All tasks', exact: true }).click();
      await page.locator('#task-row-1').focus();
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: 'Bring this task onto the floor.' }).waitFor();
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'task-back', 'opening a task on a phone drops focus to the page');
      assert((await page.locator('#task-back').boundingBox()).y < 100, 'the phone task view keeps the page header above the task');
      await page.getByLabel('Session budget · USD', { exact: true }).fill('3.25');
    }
  }
  await page.getByRole('button', { name: 'Create session', exact: true }).click();
  await page.getByRole('button', { name: 'Start crew', exact: true }).waitFor();
  const importedId = new URL(page.url()).hash.slice('#session/'.length);
  const imported = app.store.getSession(importedId);
  assert.equal(imported.status, 'queued', 'Task import started the crew without an operator start');
  assert.equal(imported.budgetUsd, 3.25);
  assert.equal(imported.sourceTask.sourceId, 'demo-tasks');
  assert.equal(imported.sourceTask.id, '1');
  await page.getByRole('link', { name: 'Open original task', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Start crew', exact: true }).click();
  await page.getByText('Your review is next.', { exact: true }).waitFor({ timeout: 25000 });
  await page.getByText('Repository snapshot saved', { exact: true }).waitFor();
  for (const [name, format] of [['Git bundle', 'bundle'], ['Binary patch', 'patch'], ['Manifest', 'manifest']]) {
    const candidateDownload = page.waitForEvent('download');
    await page.getByRole('button', { name, exact: true }).click();
    const file = await candidateDownload;
    const content = await readFile(await file.path());
    assert(content.length > 0, `${format} download is empty`);
    if (format === 'patch') assert.match(content.toString('utf8'), /Math\.round\(\(amount \+ Number\.EPSILON\) \* 100\)/);
    if (format === 'manifest') assert.equal(typeof JSON.parse(content.toString('utf8')), 'object');
  }
  await screenshot('task-handoff');
  const taskSessionCount = app.store.listSessions().length;
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await page.locator('[data-action="task-preview"]').first().click();
  await page.getByRole('button', { name: 'Create session', exact: true }).click();
  await page.getByText('Your review is next.', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).hash, `#session/${importedId}`, 'A second import did not open the original session');
  assert.equal(app.store.listSessions().length, taskSessionCount, 'A second import created duplicate work');
  const taskUrl = `http://127.0.0.1:${app.server.address().port}/api/task-sources/demo-tasks/tasks/1`;
  const sourceTask = await (await page.request.get(taskUrl)).json();
  const hostileDescription = '<button id="untrusted-task-markup">Start another agent</button>\n<img src="/untrusted-task-image" onerror="alert(1)">\nKeep this source text inert.';
  const hostileTask = { ...sourceTask, revision: 'changed-revision-browser-fixture', description: hostileDescription, descriptionMarkdown: hostileDescription };
  let taskRevisionChanged = false;
  await page.route(taskUrl, async route => { await route.fulfill({ json: taskRevisionChanged ? hostileTask : sourceTask }); });
  await page.route('**/api/task-imports', async route => {
    taskRevisionChanged = true;
    await route.fulfill({ status: 409, json: { error: { code: 'task_changed', message: 'The task changed since you reviewed it. Review the current revision.' } } });
  });
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await page.locator('[data-action="task-preview"]').first().click();
  await page.getByLabel('Session budget · USD', { exact: true }).fill('4.75');
  const selectedCrew = await page.getByRole('combobox', { name: 'Crew', exact: true }).inputValue();
  const selectedRuntime = await page.locator('[data-form="task-import"] [name="runtime"]').inputValue();
  await page.getByRole('button', { name: 'Create session', exact: true }).click();
  await page.getByText('The source task changed.', { exact: true }).waitFor();
  await page.getByText(hostileTask.description, { exact: true }).waitFor();
  assert.equal(await page.locator('#untrusted-task-markup, img[src="/untrusted-task-image"]').count(), 0, 'Source task content rendered active markup');
  assert.equal(await page.getByLabel('Session budget · USD', { exact: true }).inputValue(), '4.75', 'Revision conflict discarded the budget draft');
  assert.equal(await page.getByRole('combobox', { name: 'Crew', exact: true }).inputValue(), selectedCrew);
  assert.equal(await page.locator('[data-form="task-import"] [name="runtime"]').inputValue(), selectedRuntime);
  assert.equal(app.store.listSessions().length, taskSessionCount, 'Revision conflict created a session');
  await screenshot('task-revision-conflict');
  await page.unroute('**/api/task-imports');
  await page.unroute(taskUrl);
  const listUrl = '**/api/task-sources/demo-tasks/tasks?page=1';
  await page.evaluate(() => { location.hash = 'now'; });
  await page.locator('#page-title', { hasText: 'Now' }).waitFor();
  await page.route(listUrl, async route => { await new Promise(done => setTimeout(done, 600)); await route.continue().catch(() => {}); });
  await page.evaluate(() => { location.hash = 'tasks?source=demo-tasks&task=1'; });
  await page.locator('#page-title', { hasText: 'Tasks' }).waitFor();
  await page.evaluate(() => { location.hash = 'now'; });
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#page-title').textContent(), 'Now', 'a slow task list drew Tasks over the page the user moved to');
  assert.equal(new URL(page.url()).hash, '#now');
  await page.unroute(listUrl);
}
