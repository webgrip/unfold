import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTrackers, taskChip, taskIdText, trackerName, trackerOr, openTaskLabel } from '../public/core/trackers.js';
import { errorCodeNote } from '../public/core/ui.js';
import { workItemRef } from '../public/ploeg.js';
import { handedNotice, priorityOf, sheetMarkup, startCard } from '../public/start.js';
import { taskIdText as serverTaskIdText, trackerDisplay } from '../src/tracker-display.ts';

const registry = trackerDisplay();
const clickupTask = { provider: 'clickup', externalId: '86c0abc12', url: 'https://app.clickup.com/t/86c0abc12', title: 'Show VAT per line' };

test('screens name trackers only from the registry the bootstrap sends', () => {
  setTrackers([]);
  assert.equal(trackerName('clickup'), '', 'before the bootstrap no tracker is named');
  assert.equal(trackerOr('clickup'), 'its tracker');
  assert.equal(openTaskLabel('clickup'), 'Open the task');
  setTrackers(registry);
  assert.equal(trackerName('clickup'), 'ClickUp');
  assert.equal(trackerName('demo'), '', 'a demo fixture is not a tracker a person can open');
  assert.equal(trackerName('linear'), '', 'a provider the registry lacks is not guessed');
  assert.equal(openTaskLabel('clickup'), 'Open in ClickUp');
  for (const entry of registry) assert.equal(typeof entry.handsOffByAssignment, 'boolean');
  assert.ok(registry.find(entry => entry.name === 'clickup').handsOffByAssignment, 'ClickUp hands off by assignment');
});

test('a task id reads as its tracker shows it, the same in the browser and on the server', () => {
  setTrackers(registry);
  const cases = [['clickup', '86c0abc12', '#86c0abc12'], ['clickup', 'WEB-12', 'WEB-12'], ['vikunja', '624', '#624'], ['jira', 'SHOP-7', 'SHOP-7'], ['demo', 'DEMO-8', 'DEMO-8'], ['clickup', '', '']];
  for (const [provider, id, text] of cases) {
    assert.equal(taskIdText(provider, id), text, `${provider} ${id}`);
    assert.equal(serverTaskIdText(provider, id), text, `server ${provider} ${id}`);
  }
  assert.equal(workItemRef({ id: '9', ...clickupTask }), 'ClickUp #86c0abc12');
  assert.equal(workItemRef({ id: '9', provider: 'clickup', externalId: 'WEB-12' }), 'ClickUp WEB-12', 'a custom task id is kept');
});

test('the task chip names the tracker and the id, opens the task in a new tab and never clips', () => {
  setTrackers(registry);
  const html = taskChip(clickupTask);
  assert.match(html, /^<a class="task-chip" href="https:\/\/app\.clickup\.com\/t\/86c0abc12" target="_blank" rel="noopener noreferrer" data-link-out="tracker"><span class="task-chip-from">ClickUp<\/span> <span class="task-chip-ref">#86c0abc12<\/span>/);
  assert.match(html, /<span class="sr-only">, open the task in ClickUp \(opens in a new tab\)<\/span><\/a>$/, 'the link names where it goes for a screen reader, after the visible text');
  assert.doesNotMatch(html, /aria-label/, 'the accessible name starts with the visible label');
  assert.equal(taskChip({ ...clickupTask, url: 'javascript:alert(1)' }), '<span class="task-chip"><span class="task-chip-from">ClickUp</span> <span class="task-chip-ref">#86c0abc12</span></span>', 'an unsafe address is no link');
  assert.equal(taskChip(clickupTask, { link: false }).startsWith('<span class="task-chip">'), true, 'inside a row link it is plain text');
  assert.equal(taskChip({ provider: 'clickup', externalId: '' }), '');
  const css = readFileSync(new URL('../public/styles/components.css', import.meta.url), 'utf8');
  const rule = css.slice(css.indexOf('.task-chip {'), css.indexOf('}', css.indexOf('.task-chip {')));
  assert.doesNotMatch(rule, /ellipsis|nowrap/, 'the chip wraps instead of clipping');
  assert.match(rule, /min-height: 1\.5rem/, 'the link is at least 24 px high');
});

test('the hand-off sheet names the tracker user, what happens next and how to take it back', () => {
  setTrackers(registry);
  const source = { id: 'agency', name: 'Agency list', provider: 'clickup' };
  const task = { id: '86c0abc12', identifier: 'WEB-12', provider: 'clickup', title: 'Show VAT per line', description: 'Done when: each line shows VAT.', url: 'https://app.clickup.com/t/86c0abc12', labels: [] };
  const status = { available: true, handoff: { allowed: true }, teams: [{ id: 'bronze', assignee: 'unfold-bronze', roles: ['writer', 'reviewer'], queueDepth: 0 }], assignedTeams: [] };
  const html = sheetMarkup({ task, source, status, team: 'bronze' });
  assert.match(html, /<dt>In ClickUp<\/dt><dd>Assigns “unfold-bronze” to WEB-12 in ClickUp and leaves a comment there\. Assigning that user in ClickUp yourself does the same\.<\/dd>/);
  assert.match(html, /<dt>Next<\/dt><dd>Ploeg queues it for the Team\. A worker starts it when one is free; you follow it on Now and on its Work Item page\.<\/dd>/);
  assert.match(html, /<dt>Take back<\/dt><dd>Free until a worker starts it: Take back on Now or Tasks, which removes “unfold-bronze” in ClickUp again\./);
  assert.match(html, /data-link-out="tracker">Open in ClickUp to edit the brief/);
  const failed = sheetMarkup({ task, source, status, team: 'bronze', error: 'The ClickUp token cannot assign users.', errorCode: 'task_write_forbidden' });
  assert.match(failed, /Nothing changed in ClickUp\.<\/p><p class="error-code">Error code <code>task_write_forbidden<\/code><\/p>/);
  assert.equal(handedNotice('bronze', 'unfold-bronze', 'clickup'), 'Handed to bronze. “unfold-bronze” is assigned in ClickUp. Take it back from Now until a worker starts it.');
  assert.equal(handedNotice('bronze'), 'Handed to bronze. Take it back from Now until a worker starts it.');
});

test('Up next names no tracker it does not know, and a failed list shows its error code', () => {
  setTrackers(registry);
  const none = startCard({ queue: null, sources: [] });
  assert.doesNotMatch(none, /Vikunja|ClickUp/, 'the empty state names no tracker');
  assert.match(none, /connects your tracker’s list or board on Connections/);
  const failed = startCard({ queue: null, sources: [{ id: 'a', provider: 'clickup' }], error: 'ClickUp did not answer.', errorCode: 'task_source_unavailable' });
  assert.match(failed, /Could not list your tasks[\s\S]*Error code <code>task_source_unavailable<\/code>/);
  const empty = startCard({ queue: [], sources: [{ id: 'a', provider: 'clickup' }] });
  assert.match(empty, /Make more work Ready in ClickUp\./);
  assert.equal(errorCodeNote('<b>'), '', 'only a catalogue-shaped code is shown');
});

test('priority words come from the registry', () => {
  setTrackers(registry);
  assert.deepEqual(priorityOf({ provider: 'clickup', priority: 1 }), { rank: 4, name: 'urgent' });
  assert.deepEqual(priorityOf({ provider: 'vikunja', priority: 5 }), { rank: 5, name: 'do now' });
  assert.deepEqual(priorityOf({ provider: 'jira', priority: 3 }), { rank: 3, name: 'level 3' });
});

test('daily-use screens do not branch on a tracker name', () => {
  const files = ['now.js', 'start.js', 'ploeg.js', 'core/reasons.js', 'core/states.js', 'live/model.js', 'live/work-view.js'];
  for (const file of files) {
    const source = readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8').replace(/\/\*\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(source, /provider\s*===?\s*'(clickup|vikunja|jira|github|gitlab|forgejo)'|'(ClickUp|Vikunja)'/, `${file} names a tracker`);
  }
});
