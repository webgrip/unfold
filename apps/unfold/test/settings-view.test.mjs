import assert from 'node:assert/strict';
import { test } from 'node:test';
import { failureCallout, failureOf } from '../public/core/failure.js';
import { settingsNavMarkup } from '../public/shell.js';
import { auditVerdict, jobKindName, sizeText } from '../public/views/admin.js';

test('a failed read keeps its message and its catalogued code, and its notice offers Try again', () => {
  assert.deepEqual(failureOf(Object.assign(new Error('Notifications are not switched on for you.'), { status: 404, code: 'notifications_off' })), { message: 'Notifications are not switched on for you.', code: 'notifications_off' });
  assert.deepEqual(failureOf(new Error('')), { message: 'Unfold did not answer.', code: '' });
  assert.equal(failureOf({ message: 'x', code: 'Not A Code' }).code, '', 'only a code in the catalogue shape is shown');
  const notice = failureCallout({ title: 'Could not read your notifications', failure: { message: 'Unfold did not answer: the browser could not reach it.', code: 'network_unreachable' }, action: 'notify-retry' });
  assert.match(notice, /data-tone="danger"/);
  assert.match(notice, /Error code <code>network_unreachable<\/code>/);
  assert.match(notice, /data-action="notify-retry">.*<span class="button-label">Try again<\/span>/s);
  const plain = failureCallout({ title: 'Could not check the audit trail', failure: 'No reason <given>' });
  assert.doesNotMatch(plain, /Error code|Try again/, 'a notice without a code or a retry shows neither');
  assert.match(plain, /No reason &lt;given&gt;/);
});

test('Settings groups a person’s own pages apart from the workbench’s and shows administrators’ pages only to them', () => {
  const viewer = settingsNavMarkup('preferences', { admin: false, intake: false });
  assert.match(viewer, /<nav class="app-subnav" aria-label="Settings">/);
  assert.match(viewer, /id="subnav-yours">Yours<\/p><ul aria-labelledby="subnav-yours">/);
  assert.match(viewer, /id="subnav-workbench">Workbench<\/p>/);
  assert.match(viewer, /href="#settings\/preferences" aria-current="page"/);
  for (const page of ['Webhooks', 'Billing', 'Request intake', 'Administration']) assert.doesNotMatch(viewer, new RegExp(`>${page}<`), `${page} shows to someone who is not an administrator`);
  for (const page of ['Notifications', 'Labs', 'Linked accounts', 'Signed-in editors', 'Agent sessions', 'Card logins', 'Environment', 'Connections', 'Connect a tracker', 'Card designer']) assert.match(viewer, new RegExp(`>${page}<`));
  const yours = viewer.slice(0, viewer.indexOf('subnav-workbench'));
  assert.ok(yours.includes('>Linked accounts<') && !yours.includes('>Environment<'), 'a person’s own pages and the workbench’s are mixed');
  const admin = settingsNavMarkup('admin', { admin: true, intake: false });
  assert.match(admin, /href="#settings\/admin" aria-current="page">Administration</);
  assert.match(admin, />Webhooks</);
  assert.doesNotMatch(admin, />Request intake</, 'Request intake needs its flag');
  assert.match(settingsNavMarkup('system', { admin: true, intake: true }), />Request intake</);
});

test('the audit trail check reads in words, with the break and the checkpoint problems named', () => {
  const intact = auditVerdict({ tenant: 'default', ok: true, checked: 42, anchor: null, head: { sequence: 42 }, break: null, checkpoints: null });
  assert.equal(intact.tone, 'success');
  assert.equal(intact.title, 'The audit trail is intact');
  assert.deepEqual(intact.lines, ['42 records checked in Tenant default, up to record 42.', 'No signed checkpoints are configured, so only the chain itself was checked.']);
  const pruned = auditVerdict({ tenant: 'agency', ok: true, checked: 1, anchor: { sequence: 900 }, head: { sequence: 901 }, break: null, checkpoints: { ok: true, checked: 1, problems: [] } });
  assert.deepEqual(pruned.lines, ['1 record checked in Tenant agency, from record 900 where older records were removed by retention, up to record 901.', '1 signed checkpoint matches the chain.']);
  const broken = auditVerdict({ tenant: 'default', ok: false, checked: 12, anchor: null, head: { sequence: 12 }, break: { sequence: 7, reason: 'hash' }, checkpoints: { ok: false, checked: 1, problems: [{ reason: 'bad_signature', sequence: 10 }, { reason: 'storage_unavailable' }] } });
  assert.equal(broken.tone, 'danger');
  assert.ok(broken.lines.includes('Record 7: this record changed after it was written.'));
  assert.ok(broken.lines.includes('Checkpoint at record 10: the signature does not match.'));
  assert.ok(broken.lines.includes('Checkpoint: the checkpoint storage did not answer.'));
  assert.match(broken.lines.at(-1), /Keep the database file as it is/);
  assert.deepEqual(auditVerdict({ tenant: 'new', ok: true, checked: 0, anchor: null, head: null, break: null, checkpoints: null }).lines[0], 'Tenant new has no audit records yet.');
});

test('background job kinds and export sizes read in plain words', () => {
  assert.equal(jobKindName('outbound.delivery'), 'Webhook deliveries');
  assert.equal(jobKindName('billing.line'), 'Billing lines');
  assert.equal(jobKindName('something.new'), 'something.new');
  assert.equal(sizeText(512), '512 bytes');
  assert.equal(sizeText(1_534_000), '1,5 MB');
  assert.equal(sizeText(null), 'Not known');
});
