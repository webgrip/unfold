import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkList, connectionCard, previewList, serviceAccountGuide, sourceEntry, sourceOrigin } from '../public/views/task-setup.js';

const clickup = { provider: 'clickup', label: 'ClickUp', levels: [{ kind: 'list', label: 'List' }], serviceAccount: { noun: 'ClickUp user', steps: ['Invite <b>a member</b>.', 'Generate its token.'], docs: 'javascript:alert(1)', tokenLabel: 'API token of that ClickUp user' } };
const connection = { id: 'tc-0123456789ab', provider: 'clickup', tenant: 'default', account: '<Unfold bot>', token: 'set', tokenSetAt: '2026-10-31T00:00:00.000Z', updatedAt: '2026-10-31T00:00:00.000Z', updatedBy: 'olga', manage: true, sources: [] };

test('the setup page explains why Unfold needs its own tracker user and asks an administrator once for its token in a write-only field', () => {
  const guide = serviceAccountGuide(clickup);
  assert.match(guide, /Handing a task to an agent means Unfold assigns it to a Team's ClickUp user/);
  assert.match(guide, /Invite &lt;b&gt;a member&lt;\/b&gt;\./, 'the adapter\'s steps are escaped');
  assert.doesNotMatch(guide, /href="javascript/);
  const add = connectionCard(clickup, undefined, { manageTenants: ['default'] });
  assert.match(add, /<input id="setup-token" name="token" type="password" autocomplete="off"/);
  assert.match(add, /stores it encrypted and never shows it again/);
  assert.match(add, /data-form="connection-token"/);
  assert.doesNotMatch(add, /id="setup-tenant"/, 'one Tenant needs no choice');
  assert.match(connectionCard(clickup, undefined, { manageTenants: ['agency', 'other'], tenant: 'other' }), /<option value="other" selected>other<\/option>/);
  const viewer = connectionCard(clickup, undefined, { manageTenants: [] });
  assert.doesNotMatch(viewer, /setup-token/);
  assert.match(viewer, /Only an administrator adds it/);
  assert.equal(connectionCard({ ...clickup, serviceAccount: undefined }, undefined), '', 'a tracker whose adapter has no service account gets no card');
});

test('a stored connection shows whose token it is, never the token, and offers replace and remove only to someone who may', () => {
  const shown = connectionCard(clickup, connection, {});
  assert.match(shown, /Unfold hands tasks off as <strong>&lt;Unfold bot&gt;<\/strong>/);
  assert.doesNotMatch(shown, /id="setup-token"/, 'the field shows only when replacing');
  assert.match(shown, /data-action="connection-replace"/);
  assert.match(connectionCard(clickup, connection, { replacing: true }), /id="setup-token"/);
  const used = connectionCard(clickup, { ...connection, sources: [{ id: 'sprint-12' }] }, {});
  assert.match(used, /data-action="connection-remove"[^>]*disabled/);
  assert.match(used, /One task source uses it\./);
  const readOnly = connectionCard(clickup, { ...connection, manage: false }, {});
  assert.doesNotMatch(readOnly, /connection-replace|connection-remove/);
  assert.match(readOnly, /data-action="connection-test"/);
  const missing = connectionCard(clickup, { ...connection, token: 'missing' }, {});
  assert.match(missing, /No token stored/);
  assert.match(missing, /id="setup-token"/, 'a missing token asks for one at once');
  assert.match(connectionCard(clickup, connection, { replacing: true, error: 'ClickUp refused this token.' }), /role="alert">ClickUp refused this token\./);
  assert.match(sourceOrigin({ managedBy: 'unfold' }), /Added here/);
  assert.match(sourceOrigin({ managedBy: 'configuration' }), /Server configuration/);
});

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
