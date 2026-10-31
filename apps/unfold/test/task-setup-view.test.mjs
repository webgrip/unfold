import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkList, previewList, sourceEntry } from '../public/views/task-setup.js';

test('the setup page escapes tracker text, shows the fix only under a finding that is not fine, and fills the repository into the entry', () => {
  const markup = checkList({ checks: [
    { id: 'account', status: 'ok', title: 'ClickUp account', text: 'Unfold reads as <b>Ada</b>.', fix: 'never shown' },
    { id: 'tasks', status: 'problem', title: 'Open tasks', text: 'ClickUp is limiting how often this account may ask.', fix: 'Wait the time the message names, then check again.', code: 'task_rate_limited' },
  ] }, 'check');
  assert.match(markup, /&lt;b&gt;Ada&lt;\/b&gt;/);
  assert.doesNotMatch(markup, /never shown/);
  assert.match(markup, /<code>task_rate_limited<\/code>/);
  assert.match(markup, /data-status="problem"/);
  const preview = previewList({ more: true, tasks: [{ id: '86c', reference: 'SHOP-12', title: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)', excerpt: '', assignees: ['Ada', 'Grace'], labels: ['checkout'] }] });
  assert.match(preview, /SHOP-12/);
  assert.doesNotMatch(preview, /<img|href="javascript/);
  assert.match(preview, /Assigned to Ada, Grace · checkout/);
  assert.match(preview, /No description\. An agent gets only the title\./);
  assert.match(preview, /the first few/);
  assert.equal(previewList({ more: false, tasks: [] }), '');
  const entry = { id: 'sprint-12', name: 'Sprint 12 · ClickUp', provider: 'clickup', baseUrl: 'https://api.clickup.com/api/v2', project: '777', repositoryId: '', executionOwner: 'ploeg' };
  assert.equal(JSON.parse(sourceEntry(entry, 'shop')).repositoryId, 'shop');
  assert.equal(JSON.parse(sourceEntry(entry, '')).repositoryId, 'REPOSITORY-ID');
  assert.equal(sourceEntry(undefined, 'shop'), '');
});
