/** Sessions: the demonstration, evidence tabs, export, a new session with pause, keyboard evidence navigation, instructions, cancel and failure guidance. */
export async function run({ page, app, assert, screenshot }) {
  await page.getByRole('link', { name: 'Sessions', exact: true }).click();
  await page.getByRole('heading', { name: 'Sessions', exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Run the demonstration' }).click();
  await page.getByText('Your review is next.', { exact: true }).waitFor({ timeout: 25000 });
  await screenshot('session');
  await page.getByRole('tab', { name: /Changes/ }).click();
  await page.getByText('+  return Math.round((amount + Number.EPSILON) * 100);', { exact: true }).waitFor();
  await screenshot('changes');
  await page.getByRole('tab', { name: /Checks/ }).click();
  await page.getByRole('heading', { name: 'Baseline checks (expected failure)', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Independent review checks', exact: true }).waitFor();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export handoff' }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^de-vloer-.*\.md$/);
  const downloadPath = await download.path();
  assert(downloadPath);
  await page.reload();
  await page.getByText('Your review is next.', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'All sessions' }).click();
  await page.getByRole('button', { name: /New session/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create session' }).click();
  await page.getByRole('button', { name: 'Start crew' }).click();
  const keyboardSessionId = new URL(page.url()).hash.slice('#session/'.length);
  const pausePath = `**/api/sessions/${keyboardSessionId}/pause`;
  const pauseReceived = Promise.withResolvers();
  const releasePause = Promise.withResolvers();
  await page.route(pausePath, async route => {
    const response = await route.fetch();
    pauseReceived.resolve();
    await releasePause.promise;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await pauseReceived.promise;
    await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Resume', exact: true }).isDisabled(), true, 'SSE exposed an enabled resume action while pause was still awaiting its response');
    assert.equal(await page.getByRole('button', { name: 'Cancel', exact: true }).isDisabled(), true, 'SSE exposed an enabled cancel action while pause was still awaiting its response');
  } finally { releasePause.resolve(); }
  await page.waitForFunction(() => document.querySelector('[data-action="resume"]')?.disabled === false);
  await page.unroute(pausePath);
  for (let index = 0; index < 32; index++) app.store.appendEvent(keyboardSessionId, 'message', 'browser-test', { role: 'operator', text: `Keyboard evidence fixture ${index + 1}: preserve the current reading position during durable stream refreshes.` });
  await page.getByText('Keyboard evidence fixture 32: preserve the current reading position during durable stream refreshes.', { exact: true }).waitFor();
  const draft = 'Keep this unsent instruction while I inspect the evidence.';
  await page.getByRole('textbox', { name: 'Steer the next execution' }).fill(draft);
  const selectedTab = async id => {
    const tabs = await page.getByRole('tab').evaluateAll(elements => elements.map(element => ({ id: element.dataset.id, selected: element.getAttribute('aria-selected'), tabIndex: element.tabIndex, panel: document.getElementById(element.getAttribute('aria-controls'))?.id, label: document.getElementById(element.getAttribute('aria-controls'))?.getAttribute('aria-labelledby') })));
    assert.equal(tabs.length, 5);
    assert.deepEqual(tabs.filter(tab => tab.selected === 'true').map(tab => tab.id), [id]);
    assert.deepEqual(tabs.filter(tab => tab.tabIndex === 0).map(tab => tab.id), [id]);
    for (const tab of tabs) {
      assert.equal(tab.panel, `evidence-panel-${tab.id}`);
      assert.equal(tab.label, `evidence-tab-${tab.id}`);
      assert.equal(tab.tabIndex, tab.id === id ? 0 : -1);
    }
    assert.equal(await page.locator('[role="tabpanel"]:visible').count(), 1);
    assert.equal(await page.locator('[role="tabpanel"]:visible').getAttribute('id'), `evidence-panel-${id}`);
    assert.equal(await page.evaluate(() => document.activeElement.id), `evidence-tab-${id}`);
    assert.equal(await page.getByRole('textbox', { name: 'Steer the next execution' }).inputValue(), draft);
  };
  for (const viewport of [{ width: 1440, height: 1040 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole('tab', { name: 'Activity', exact: true }).click();
    await selectedTab('stream');
    for (const [key, id] of [['ArrowRight', 'gateway'], ['ArrowRight', 'diff'], ['ArrowRight', 'test'], ['End', 'handoff'], ['ArrowRight', 'stream'], ['ArrowLeft', 'handoff'], ['Home', 'stream']]) {
      await page.keyboard.press(key);
      await selectedTab(id);
    }
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'evidence-panel-stream');
    await page.keyboard.press('Shift+Tab');
    await selectedTab('stream');
    const readingPosition = await page.locator('#evidence-panel-stream').evaluate(panel => {
      if (panel.scrollHeight - panel.clientHeight < 200) throw new Error('Stream fixture must overflow to verify reading-position preservation');
      panel.scrollTop = 120;
      return panel.scrollTop;
    });
    await page.keyboard.press('ArrowRight');
    await selectedTab('gateway');
    await page.keyboard.press('ArrowRight');
    await selectedTab('diff');
    const hiddenUpdate = `Durable event while inspecting Changes at width ${viewport.width}.`;
    app.store.appendEvent(keyboardSessionId, 'message', 'browser-test', { role: 'operator', text: hiddenUpdate });
    await page.keyboard.press('Home');
    await page.getByText(hiddenUpdate, { exact: true }).waitFor();
    await selectedTab('stream');
    assert.equal(await page.locator('#evidence-panel-stream').evaluate(panel => panel.scrollTop), readingPosition, 'Switching tabs or receiving an event moved the stream away from the reading position');
    await page.locator('#evidence-panel-stream').evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
    await page.keyboard.press('End');
    const tailUpdate = `Durable event while following the stream tail at width ${viewport.width}.`;
    app.store.appendEvent(keyboardSessionId, 'message', 'browser-test', { role: 'operator', text: tailUpdate });
    await page.keyboard.press('Home');
    await page.getByText(tailUpdate, { exact: true }).waitFor();
    assert(await page.locator('#evidence-panel-stream').evaluate(panel => panel.scrollHeight - panel.scrollTop - panel.clientHeight < 2), 'Following the stream tail was lost after switching tabs');
    await selectedTab('stream');
    await screenshot(`evidence-keyboard-${viewport.width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.getByRole('textbox', { name: 'Steer the next execution' }).fill('Preserve the invalid input checks and explain the scope of the rounding fix.');
  await page.getByRole('button', { name: 'Save instruction' }).click();
  await page.getByText('Next execution', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel session' }).click();
  try { await page.getByText('Cancelled', { exact: true }).first().waitFor(); }
  catch (error) {
    const stopped = app.store.getSession(keyboardSessionId);
    process.stderr.write(JSON.stringify({ status: stopped?.status, failure: stopped?.failure, runStatuses: stopped?.runs.map(run => run.status), toast: await page.locator('#toast').textContent(), url: page.url() }) + '\n');
    await screenshot('cancel-failure');
    throw error;
  }
  const failedSession = app.store.getSession(keyboardSessionId);
  failedSession.status = 'failed';
  failedSession.failure = { category: 'prompt_acceptance_unknown', stage: 'prompt', message: 'Prompt acceptance is unknown; the runtime may already have started paid work.', remediation: 'Do not resubmit the prompt. Confirm the remote turn has stopped, inspect its evidence and reconcile gateway spend before deciding whether to start new work.', promptAcceptance: 'unknown', automaticRetry: false };
  failedSession.blocker = failedSession.failure.message;
  app.store.saveSession(failedSession);
  await page.reload();
  const failure = page.getByRole('region', { name: 'Prompt submission needs attention' });
  await failure.getByText(failedSession.failure.message, { exact: true }).waitFor();
  await failure.getByText(failedSession.failure.remediation, { exact: true }).waitFor();
  await failure.getByText('Prompt submission is unconfirmed. Check remote execution and gateway spend before starting new work.', { exact: true }).waitFor();
  await failure.getByText('No automatic retry will be started.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^(Start crew|Resume|Retry)$/ }).count(), 0, 'Ambiguous paid execution offers an unsafe repeat action');
  await screenshot('failure-guidance');
  failedSession.failure.message = '<button id="untrusted-runtime-markup">Execute again</button>';
  failedSession.failure.remediation = '<img src="/untrusted-runtime-markup" onerror="alert(1)">';
  app.store.saveSession(failedSession);
  await page.reload();
  await failure.getByText(failedSession.failure.message, { exact: true }).waitFor();
  await failure.getByText(failedSession.failure.remediation, { exact: true }).waitFor();
  assert.equal(await page.locator('#untrusted-runtime-markup, img[src="/untrusted-runtime-markup"]').count(), 0, 'Failure guidance rendered untrusted markup');
}
