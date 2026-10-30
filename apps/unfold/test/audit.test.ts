import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Store } from '../src/store.ts';
import { AuditTrail } from '../src/audit/service.ts';
import { auditSettings, defaultRetentionDays } from '../src/audit/settings.ts';
import { canonicalJson, genesisHash, recordHash, sha256Fingerprint } from '../src/audit/chain.ts';
import { ndjson, verifyExported } from '../src/audit/export.ts';
import { ocsfClasses, ocsfEvent, ocsfVersion, type AuditFact, type AuditPerson } from '../src/audit/ocsf.ts';
import { capture, type TapRequest } from '../src/audit/capture.ts';
import { ocsfErrors, ocsfSchema } from './ocsf-schema.ts';

const ada: AuditPerson = { id: 'u-ada', name: 'ada@example.test', role: 'admin', memberships: [{ kind: 'tenant', tenant: 'default', role: 'admin' }] };
const at = new Date('2026-10-30T09:00:00Z');

const facts: Array<[string, AuditFact, keyof typeof ocsfClasses, number]> = [
  ['password sign-in', { kind: 'sign_in', method: 'password', user: ada, outcome: 'success' }, 'authentication', 1],
  ['failed single sign-on', { kind: 'sign_in', method: 'oidc', user: {}, outcome: 'failure', reason: 'access_denied' }, 'authentication', 1],
  ['sign-out', { kind: 'sign_out', user: ada, credential: 'browser' }, 'authentication', 2],
  ['editor credential approved', { kind: 'credential', credential: 'editor', action: 'issue', user: ada, name: 'VS Code on laptop', outcome: 'success' }, 'entity_management', 1],
  ['editor credential denied', { kind: 'credential', credential: 'editor', action: 'deny', user: ada, outcome: 'success' }, 'entity_management', 1],
  ['editor credential revoked', { kind: 'credential', credential: 'editor', action: 'revoke', user: ada, uid: 'a'.repeat(24), outcome: 'success' }, 'entity_management', 4],
  ['Agents window token issued', { kind: 'credential', credential: 'agents_window', action: 'issue', user: ada, name: 'desk', outcome: 'success' }, 'entity_management', 1],
  ['Agents window token revoked', { kind: 'credential', credential: 'agents_window', action: 'revoke', user: ada, uid: 'b'.repeat(64), outcome: 'success' }, 'entity_management', 4],
  ['linked account', { kind: 'credential', credential: 'linked_account', action: 'issue', user: ada, name: 'GitLab', outcome: 'success' }, 'entity_management', 1],
  ['account created', { kind: 'account', action: 'create', user: ada }, 'account_change', 1],
  ['account renamed', { kind: 'account', action: 'rename', user: ada, previousName: 'ada' }, 'account_change', 99],
  ['role changed', { kind: 'role', user: ada, role: 'admin', previous: 'operator' }, 'user_access', 3],
  ['Tenant membership added', { kind: 'membership', action: 'add', user: ada, tenant: 'acme', role: 'developer' }, 'group_management', 3],
  ['Client membership removed', { kind: 'membership', action: 'remove', user: ada, tenant: 'acme', client: 'shop' }, 'group_management', 4],
  ['Tenant role changed', { kind: 'membership', action: 'role', user: ada, tenant: 'acme', role: 'admin', previous: 'viewer' }, 'group_management', 12],
  ['flag override', { kind: 'entity', action: 'update', entity: { type: 'Feature flag', uid: 'work.live-view', data: { change: 'override_set', variant: 'on', reason: 'Try it' } }, outcome: 'success' }, 'entity_management', 3],
  ['Client Sign-off withdrawn', { kind: 'entity', action: 'deactivate', entity: { type: 'Client Sign-off', uid: '42' }, outcome: 'success' }, 'entity_management', 11],
  ['candidate download', { kind: 'download', activity: 'export', resource: { type: 'Candidate export', uid: 's-1', name: 'Candidate bundle of session s-1' }, outcome: 'success' }, 'web_resources_activity', 7],
  ['Action', { kind: 'api', service: 'unfold-api', operation: 'POST /api/ploeg/work-items/:id/approve', method: 'POST', status: 200, outcome: 'success', target: { kind: 'work-item', id: '42' }, inputs: { reason: 'ok' } }, 'api_activity', 1],
  ['unfold-mcp request', { kind: 'api', service: 'unfold-mcp', operation: 'tools/call unfold_approve_work', method: 'POST', status: 200, outcome: 'success', agent: { name: 'claude-code', uid: 'claude-code' }, delegation: { uid: 'c'.repeat(32), issuer: 'https://id.example.test', createdAt: at.getTime() } }, 'api_activity', 1],
];

test('each Unfold audit fact maps to its OCSF class and activity and validates against the vendored 1.9.0 schema', () => {
  assert.equal(ocsfSchema.version, ocsfVersion);
  for (const [name, fact, type, activity] of facts) {
    const event = ocsfEvent({ fact, actor: { user: ada, session: 'abcd' }, origin: { ip: '192.0.2.10', userAgent: 'test', method: 'POST', channel: 'browser' }, at });
    const expected = ocsfClasses[type];
    assert.equal(event.class_uid, expected.uid, name);
    assert.equal(event.activity_id, activity, name);
    assert.equal(event.type_uid, expected.uid * 100 + activity, name);
    assert.equal(event.time, at.getTime(), name);
    assert.deepEqual((event.metadata as any).product.name, 'Unfold', name);
    assert.equal((event.src_endpoint as any).ip, '192.0.2.10', name);
    assert.deepEqual(ocsfErrors({ ...event, metadata: { ...event.metadata, uid: 'x', tenant_uid: 'default', sequence: 1 } }), [], name);
  }
  const failed = ocsfEvent({ fact: facts[1][1], actor: {}, at });
  assert.deepEqual([failed.status_id, failed.severity_id, failed.status_code, (failed.user as any).name], [2, 3, 'access_denied', 'unknown']);
  const denied = ocsfEvent({ fact: facts[4][1], actor: { user: ada }, at });
  assert.equal(denied.status_id, 2, 'a denied editor credential is a failed Create');
  const mcp = ocsfEvent({ fact: facts[19][1], actor: { user: ada }, at });
  assert.deepEqual([(mcp.ai_agent as any).name, (mcp.delegation as any).uid, (mcp.src_endpoint as any).name], ['claude-code', 'c'.repeat(32), 'unknown'], 'API Activity always has a source endpoint');
});

test('the schema check refuses what OCSF 1.9.0 does not allow', () => {
  const event = ocsfEvent({ fact: facts[0][1], actor: { user: ada }, at });
  assert.match(ocsfErrors({ ...event, user: undefined }).join('\n'), /event\.user is required/);
  assert.match(ocsfErrors({ ...event, type_uid: 1 }).join('\n'), /type_uid/);
  assert.match(ocsfErrors({ ...event, severity_id: 42 }).join('\n'), /not in its enum/);
  assert.match(ocsfErrors({ ...event, invented: true }).join('\n'), /invented is not an OCSF 1\.9\.0 attribute/);
  assert.match(ocsfErrors({ ...event, service: undefined }).join('\n'), /at least one of service, dst_endpoint/);
  assert.match(ocsfErrors({ ...event, time: 'yesterday' }).join('\n'), /time must be an integer/);
});

function trail(options: Partial<ConstructorParameters<typeof AuditTrail>[0]> = {}) {
  const store = new Store(':memory:');
  return { store, audit: new AuditTrail({ store, ...options }) };
}

test('records chain per Tenant and verify; an edited record breaks the chain at its sequence', () => {
  const { store, audit } = trail();
  for (let index = 0; index < 5; index++) audit.record({ fact: { kind: 'sign_in', method: 'password', user: ada, outcome: 'success' }, actor: { user: ada }, at: new Date(at.getTime() + index) });
  audit.record({ fact: { kind: 'membership', action: 'add', user: ada, tenant: 'acme', role: 'viewer' }, actor: {} });
  assert.deepEqual(audit.chain.tenants(), ['acme', 'default']);
  const verified = audit.chain.verify('default');
  assert.deepEqual([verified.ok, verified.checked, verified.head?.sequence], [true, 5, 5]);
  assert.equal(audit.chain.verify('acme').checked, 1, 'each Tenant has its own chain');

  const records = audit.chain.page('default', { limit: 10 });
  const attestation = (index: number) => (records[index].event.attestation_list as any[])[0];
  assert.equal(records[0].previousHash, genesisHash);
  assert.equal(attestation(0).prev_event, undefined, 'the first record is the genesis of its chain');
  assert.equal(records[1].previousHash, records[0].hash);
  assert.deepEqual(attestation(2).prev_event, { uid: records[1].event.metadata.uid, type_uid: 300201, fingerprint: sha256Fingerprint(records[1].hash) });
  assert.deepEqual([attestation(2).chain_uid, attestation(2).fingerprint.value, recordHash(records[2].event)], ['unfold-audit:default', records[2].hash, records[2].hash]);
  assert.deepEqual([records[2].event.metadata.sequence, records[2].event.metadata.tenant_uid, records[2].event.metadata.profiles], [3, 'default', ['record_integrity']]);

  assert.throws(() => store.db.prepare("UPDATE audit_records SET event='{}' WHERE seq=3").run(), /append-only/);
  assert.throws(() => store.db.prepare('DELETE FROM audit_records WHERE seq=3').run(), /retention anchor/);

  store.db.exec('DROP TRIGGER audit_records_append_only');
  const edited = { ...records[2].event, message: 'Nothing happened.' };
  store.db.prepare("UPDATE audit_records SET event=? WHERE tenant_id='default' AND seq=3").run(canonicalJson(edited));
  assert.deepEqual(audit.chain.verify('default').break, { sequence: 3, reason: 'hash' });

  const rehashed = { ...edited, attestation_list: [{ ...attestation(2), fingerprint: sha256Fingerprint(recordHash(edited)) }] };
  store.db.prepare("UPDATE audit_records SET event=?, hash=? WHERE tenant_id='default' AND seq=3").run(canonicalJson(rehashed), recordHash(edited));
  assert.deepEqual(audit.chain.verify('default').break, { sequence: 4, reason: 'previous_hash' }, 'recomputing the edited hash breaks the next link');
});

test('a removed record shows as a gap', () => {
  const { store, audit } = trail();
  for (let index = 0; index < 3; index++) audit.record({ fact: { kind: 'sign_out', user: ada, credential: 'browser' }, actor: { user: ada } });
  store.db.exec('DROP TRIGGER audit_records_anchored_delete');
  store.db.prepare("DELETE FROM audit_records WHERE tenant_id='default' AND seq=2").run();
  assert.deepEqual(audit.chain.verify('default').break, { sequence: 2, reason: 'sequence_gap' });
});

test('retention prunes old records behind an anchor and the rest of the chain still verifies', () => {
  let now = new Date('2025-01-01T00:00:00Z');
  const { store, audit } = trail({ settings: { retentionDays: 30 }, now: () => now });
  for (let day = 0; day < 10; day++) audit.record({ fact: { kind: 'sign_in', method: 'password', user: ada, outcome: 'success' }, actor: { user: ada }, at: new Date(now.getTime() + day * 10 * 86_400_000) });
  const before = audit.chain.page('default', { limit: 20 });
  now = new Date('2025-03-25T00:00:00Z');
  audit.prune();
  const anchor = audit.chain.anchor('default');
  const kept = audit.chain.page('default', { limit: 20 });
  assert.ok(anchor && anchor.sequence === before.length - kept.length, `pruned ${anchor?.pruned}`);
  assert.equal(anchor!.hash, before[anchor!.sequence - 1].hash);
  assert.equal(kept[0].sequence, anchor!.sequence + 1);
  const verified = audit.chain.verify('default');
  assert.deepEqual([verified.ok, verified.checked, verified.anchor?.sequence], [true, kept.length, anchor!.sequence]);
  assert.throws(() => store.db.prepare("DELETE FROM audit_anchors").run(), /never removed/);

  audit.record({ fact: { kind: 'sign_out', user: ada, credential: 'browser' }, actor: { user: ada }, at: now });
  assert.equal(audit.chain.verify('default').ok, true, 'appending after pruning continues the chain');
  assert.equal(verifyExported(kept.map(record => record.event), anchor!.hash).ok, true, 'an exported copy verifies from the anchor without Unfold');

  now = new Date('2027-01-01T00:00:00Z');
  audit.prune();
  assert.equal(audit.chain.page('default', { limit: 20 }).length, 0);
  assert.equal(audit.chain.verify('default').ok, true, 'an empty chain verifies from its last anchor');
  audit.record({ fact: { kind: 'sign_out', user: ada, credential: 'browser' }, actor: { user: ada }, at: now });
  assert.deepEqual([audit.chain.page('default', { limit: 1 })[0].sequence, audit.chain.verify('default').ok], [12, true]);
});

test('exported NDJSON carries the chain and verifies line by line; a changed line is caught', () => {
  const { audit } = trail();
  for (let index = 0; index < 3; index++) audit.record({ fact: { kind: 'api', service: 'unfold-api', operation: 'POST /api/sessions', method: 'POST', status: 201, outcome: 'success', inputs: {} }, actor: { user: ada }, origin: { ip: '192.0.2.1', channel: 'browser' } });
  const lines = ndjson(audit.chain.page('default', { limit: 10 })).trimEnd().split('\n').map(line => JSON.parse(line));
  assert.equal(lines.length, 3);
  assert.deepEqual([lines[0].attestation_list[0].chain_uid, lines[1].attestation_list[0].prev_event.fingerprint.value], ['unfold-audit:default', lines[0].attestation_list[0].fingerprint.value]);
  assert.equal(lines[0].unmapped.channel, 'browser');
  for (const line of lines) assert.deepEqual(ocsfErrors(line), []);
  assert.deepEqual(verifyExported(lines), { ok: true, checked: 3 });
  lines[1].api.response.code = 500;
  assert.deepEqual(verifyExported(lines).break, { sequence: 2, reason: 'hash' });
});

test('account writes are audited as account, role and membership records in the right Tenants', () => {
  const { store, audit } = trail({ config: { mode: 'live', repositories: [], auth: { secureCookies: false, sessionHours: 1, bootstrapName: 'admin', oidc: { issuer: 'https://id.example.test', clientId: 'unfold', scopes: ['openid'], displayName: 'Example ID', roleClaim: 'role', groupsClaim: 'groups', roles: { admin: [], operator: [], viewer: [] } } } } });
  store.upsertUser({ id: 'u-1', name: 'bo@example.test', role: 'operator', passwordHash: '', memberships: [{ kind: 'tenant', tenant: 'acme', role: 'developer' }, { kind: 'client', tenant: 'acme', client: 'shop' }] });
  store.upsertUser({ id: 'u-1', name: 'bo@example.test', role: 'operator', passwordHash: '', memberships: [{ kind: 'tenant', tenant: 'acme', role: 'developer' }, { kind: 'client', tenant: 'acme', client: 'shop' }] });
  store.upsertUser({ id: 'u-1', name: 'bo@example.test', role: 'admin', passwordHash: '', memberships: [{ kind: 'tenant', tenant: 'acme', role: 'admin' }, { kind: 'tenant', tenant: 'beta', role: 'viewer' }] });
  const acme = audit.chain.page('acme', { limit: 50 }).map(record => [record.event.class_uid, record.event.activity_id, record.event.message]);
  assert.deepEqual(acme.map(([uid, activity]) => `${uid}:${activity}`), ['3001:1', '3006:3', '3006:3', '3005:3', '3006:12', '3006:4']);
  assert.deepEqual(audit.chain.page('beta', { limit: 50 }).map(record => `${record.event.class_uid}:${record.event.activity_id}`), ['3005:3', '3006:3'], 'beta sees the role change of its new member and the join, not acme\'s Client');
  const join = audit.chain.page('acme', { limit: 2 })[1].event as any;
  assert.deepEqual([join.actor.idp.name, join.actor.invoked_by, join.group.type, join.privileges], ['Example ID', 'single sign-on at sign-in', 'Tenant', ['developer']]);
  for (const record of [...audit.chain.page('acme', { limit: 50 }), ...audit.chain.page('beta', { limit: 50 })]) assert.deepEqual(ocsfErrors(record.event), []);

  store.addUser({ id: 'u-2', name: 'local', role: 'viewer', passwordHash: 'scrypt$x' });
  assert.deepEqual(audit.chain.page('default', { limit: 10 }).map(record => `${record.event.class_uid}:${record.event.activity_id}`), ['3001:1', '3006:3'], 'a local account joins the default Tenant');
});

test('unfold-mcp requests are API Activity with the MCP client as AI agent and the delegated credential', () => {
  const { audit } = trail();
  audit.mcp({ user: { id: 'u-ada', name: 'ada', role: 'admin', memberships: [{ kind: 'tenant', tenant: 'default', role: 'admin' }] }, client: 'claude-code', method: 'tools/call', tool: 'unfold_approve_work', status: 200, outcome: 'success', ip: '192.0.2.5', delegation: 'vlm_secret', issuer: 'https://id.example.test' });
  audit.mcp({ status: 401, outcome: 'failure', reason: 'token_refused: expired', ip: '192.0.2.6' });
  const [ok, refused] = audit.chain.page('default', { limit: 10 }).map(record => record.event as any);
  assert.deepEqual([ok.class_uid, ok.api.operation, ok.api.service.name, ok.ai_agent.name, ok.delegation.issuer_uid, ok.unmapped.channel], [6003, 'tools/call unfold_approve_work', 'unfold-mcp', 'claude-code', 'https://id.example.test', 'mcp:claude-code']);
  assert.equal(ok.delegation.uid.length, 32);
  assert.equal(JSON.stringify(ok).includes('vlm_secret'), false, 'the delegated credential is never stored, only its hash');
  assert.deepEqual([refused.status_id, refused.api.response.code, refused.api.request.data.refused], [2, 401, 'token_refused: expired']);
  assert.deepEqual(ocsfErrors(ok), []);
  assert.deepEqual(ocsfErrors(refused), []);
});

async function collector(answer: () => number) {
  const received: { headers: IncomingMessage['headers']; body: any }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => { received.push({ headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); res.writeHead(answer()); res.end(); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  return { received, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/logs`, close: () => new Promise(resolve => server.close(resolve)) };
}

test('OTLP export sends each enabled Tenant\'s records once, and resends from the last accepted one after a refusal', async t => {
  let status = 200;
  const fake = await collector(() => status);
  t.after(() => fake.close());
  const { audit } = trail({ settings: { retentionDays: 400, otlp: { url: fake.url, headers: { authorization: 'Bearer collector-token' } } }, exportEnabled: async tenant => tenant === 'default' });
  audit.record({ fact: { kind: 'sign_in', method: 'password', user: ada, outcome: 'success' }, actor: { user: ada } });
  audit.record({ fact: { kind: 'membership', action: 'add', user: ada, tenant: 'quiet', role: 'viewer' }, actor: {} });
  await audit.flush();
  assert.equal(fake.received.length, 1);
  const sent = fake.received[0];
  assert.equal(sent.headers.authorization, 'Bearer collector-token');
  const scope = sent.body.resourceLogs[0].scopeLogs[0];
  assert.equal(scope.scope.name, 'unfold.audit');
  assert.equal(scope.logRecords.length, 1, 'a Tenant with export off sends nothing');
  const log = scope.logRecords[0];
  const attribute = (key: string) => log.attributes.find((entry: any) => entry.key === key)?.value;
  assert.deepEqual([attribute('ocsf.class_uid'), attribute('unfold.tenant'), attribute('ocsf.version')], [{ intValue: '3002' }, { stringValue: 'default' }, { stringValue: '1.9.0' }]);
  const event = JSON.parse(log.body.stringValue);
  assert.deepEqual(ocsfErrors(event), []);
  assert.equal(log.timeUnixNano, `${BigInt(event.time) * 1_000_000n}`);

  await audit.flush();
  assert.equal(fake.received.length, 1, 'nothing new, nothing sent');
  status = 503;
  audit.record({ fact: { kind: 'sign_out', user: ada, credential: 'browser' }, actor: { user: ada } });
  await audit.flush();
  assert.equal(fake.received.length, 2);
  status = 200;
  await audit.flush();
  assert.equal(fake.received.length, 3);
  assert.equal(JSON.parse(fake.received[2].body.resourceLogs[0].scopeLogs[0].logRecords[0].body.stringValue).metadata.sequence, 2, 'the refused record is sent again');
  assert.equal(audit.chain.exportedThrough('default'), 2);
  assert.equal(audit.chain.exportedThrough('quiet'), 0);
});

test('audit settings default to 400 days and read the OTLP endpoint with its headers', () => {
  assert.deepEqual(auditSettings(undefined, {}), { retentionDays: defaultRetentionDays });
  assert.equal(defaultRetentionDays, 400);
  assert.deepEqual(auditSettings({ retentionDays: 30 }, { UNFOLD_AUDIT_OTLP_URL: 'https://otel.example.test/v1/logs', UNFOLD_AUDIT_OTLP_HEADERS: 'Authorization=Bearer%20abc, x-scope=audit' }), { retentionDays: 30, otlp: { url: 'https://otel.example.test/v1/logs', headers: { Authorization: 'Bearer abc', 'x-scope': 'audit' } } });
  assert.equal(auditSettings({ retentionDays: 30 }, { UNFOLD_AUDIT_RETENTION_DAYS: '730' }).retentionDays, 730);
  assert.throws(() => auditSettings({}, { UNFOLD_AUDIT_RETENTION_DAYS: '0' }), /1 to 3650/);
  assert.throws(() => auditSettings({}, { UNFOLD_AUDIT_OTLP_URL: 'https://user:pw@otel.example.test' }), /without embedded credentials/);
  assert.throws(() => auditSettings('yes', {}), /audit must be an object/);
});

test('the request tap classifies each security-relevant route and leaves the rest alone', () => {
  const signedIn = { id: 'u-ada', name: 'ada', role: 'admin' as const, memberships: [{ kind: 'tenant' as const, tenant: 'default', role: 'admin' as const }] };
  const tap = (method: string, url: string, status: number, extra: Partial<TapRequest> = {}) => {
    const parsed = new URL(url, 'http://localhost');
    return capture({ method, path: parsed.pathname, query: parsed.searchParams, status, user: () => signedIn, inputs: () => ({}), userByName: () => undefined, signedInByResponse: () => undefined, editorLabel: () => 'VS Code', ...extra });
  };
  const kind = (captured: ReturnType<typeof capture>) => captured && `${captured.fact.kind}${'action' in captured.fact ? `:${captured.fact.action}` : ''}${'outcome' in captured.fact ? `:${captured.fact.outcome}` : ''}`;
  assert.equal(kind(tap('GET', '/api/auth/oidc/callback', 303, { location: '/', signedInByResponse: () => signedIn })), 'sign_in:success');
  assert.deepEqual(tap('GET', '/api/auth/oidc/callback', 303, { location: '/?login_error=access_denied' })?.fact, { kind: 'sign_in', method: 'oidc', user: {}, outcome: 'failure', reason: 'access_denied' });
  assert.equal((tap('POST', '/api/logout', 200, { before: signedIn, scope: 'editor' })?.fact as any).credential, 'editor');
  assert.deepEqual(tap('POST', '/api/editor-requests/abcdefgh12/approve', 200)?.fact, { kind: 'credential', credential: 'editor', action: 'issue', user: { id: 'u-ada', name: 'ada', role: 'admin', memberships: signedIn.memberships }, name: 'VS Code', outcome: 'success' });
  assert.equal(kind(tap('POST', '/api/editor-requests/abcdefgh12/deny', 200)), 'credential:deny:success');
  assert.equal(kind(tap('DELETE', `/api/editor-credentials/${'a'.repeat(24)}`, 404)), 'credential:revoke:failure');
  assert.equal(kind(tap('POST', '/api/agent-host/tokens', 201)), 'credential:issue:success');
  assert.equal(kind(tap('DELETE', `/api/agent-host/tokens/${'b'.repeat(64)}`, 200)), 'credential:revoke:success');
  assert.equal(kind(tap('PUT', '/api/links/gitlab', 200)), 'credential:issue:success');
  assert.equal(kind(tap('DELETE', '/api/links/clickup', 200)), 'credential:revoke:success');
  assert.equal(kind(tap('PUT', '/api/admin/flags/work.live-view/rollout', 200)), 'entity:update:success');
  assert.equal(kind(tap('DELETE', '/api/admin/flag-segments/beta-testers', 200)), 'entity:delete:success');
  assert.equal(kind(tap('POST', '/api/ploeg/work-items/42/client-sign-off', 201)), 'entity:create:success');
  assert.equal(kind(tap('POST', '/api/ploeg/work-items/42/client-sign-off/withdraw', 200)), 'entity:deactivate:success');
  assert.equal(kind(tap('PUT', '/api/client-sign-off/exclusions', 403)), 'entity:update:failure');
  assert.equal(kind(tap('GET', '/api/sessions/s-1/candidate/download?format=bundle', 200)), 'download:success');
  assert.equal(kind(tap('GET', '/api/ploeg/deliveries?format=csv', 200)), 'download:success');
  assert.equal(kind(tap('POST', '/api/sessions/s-1/budget', 403)), 'api:failure');
  assert.equal(tap('GET', '/api/ploeg/work-items/42', 200), undefined, 'ordinary reads are not audited');
  assert.equal(tap('POST', '/api/insight/events', 202), undefined, 'telemetry is not an Action');
  assert.equal(tap('POST', '/api/sessions', 401, { user: () => undefined }), undefined, 'a request nobody signed in for is left out');
  const budget = tap('POST', '/api/sessions/session-0123456789abc/budget?x=1', 200, { inputs: () => ({ amountUsd: 5, token: 'secret' }) });
  assert.deepEqual([(budget?.fact as any).operation, (budget?.fact as any).inputs, budget?.target], ['POST /api/sessions/:id/budget', { amountUsd: 5, token: '[redacted]', query: { x: '1' } }, { kind: 'session', id: 'session-0123456789abc' }]);
});
