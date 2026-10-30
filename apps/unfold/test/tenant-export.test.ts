import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';
import { Store } from '../src/store.ts';
import { CardStore } from '../src/cards/card-store.ts';
import { ClientSignOffStore } from '../src/client-sign-off.ts';
import { ChatStore } from '../src/chat/store.ts';
import { LinkedSessionStore } from '../src/linked-sessions.ts';
import { LinkedInboxStore } from '../src/linked-inbox.ts';
import { LinkedPermissionStore } from '../src/linked-permissions.ts';
import { buildTenantExport, curatedSources, databaseTables, excludedTables, tableEntities, type ExportSources, type TenantExportManifest } from '../src/tenant-export.ts';
import { ustarHeader } from '../src/tar-writer.ts';
import type { AppConfig, Session } from '../src/types.ts';
import { application, login, request } from './api-support.ts';
import { hashPassword } from '../src/auth.ts';

type Bundle = { members: Map<string, Buffer>; manifest: TenantExportManifest; bytes: number; sha256: string };

function untar(archive: Buffer): Map<string, Buffer> {
  const tar = gunzipSync(archive);
  const members = new Map<string, Buffer>();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(header.subarray(124, 136).toString('ascii').replace(/\0.*$/s, ''), 8);
    let sum = 0;
    for (let index = 0; index < 512; index++) sum += index >= 148 && index < 156 ? 32 : header[index];
    assert.equal(parseInt(header.subarray(148, 156).toString('ascii'), 8), sum, `${name} has a valid ustar checksum`);
    assert.equal(header.subarray(257, 263).toString('ascii'), 'ustar\0');
    members.set(name, Buffer.from(tar.subarray(offset + 512, offset + 512 + size)));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return members;
}

async function workspace(t: test.TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'unfold-export-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new Store(join(dir, 'unfold.sqlite'));
  t.after(() => store.close());
  new CardStore(store.db); new ClientSignOffStore(store.db); new ChatStore(store.db);
  new LinkedSessionStore(store.db); new LinkedInboxStore(store.db); new LinkedPermissionStore(store.db);
  return { dir, store };
}

async function exported(dir: string, sources: ExportSources, tenant = 'default', name = 'bundle'): Promise<Bundle> {
  const path = join(dir, `${name}.tar.gz`);
  const built = await buildTenantExport(sources, tenant, join(dir, `${name}.work`), path);
  const archive = await readFile(path);
  const members = untar(archive);
  const manifest = JSON.parse(members.get('manifest.json')!.toString('utf8'));
  assert.deepEqual(manifest, JSON.parse(JSON.stringify(built.manifest)));
  return { members, manifest, bytes: built.bytes, sha256: built.sha256 };
}

const rows = (bundle: Bundle, entity: string) => bundle.members.get(`data/${entity}.jsonl`)!.toString('utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));

function base(store: Store, config: Partial<AppConfig> = {}): ExportSources {
  return { db: store.db, config: { repositories: [], taskSources: [], ...config }, secrets: [], application: { name: 'unfold', version: 'test' }, requestedBy: { id: 'admin', name: 'admin' } };
}

function session(id: string, repositoryId: string, ownerId: string, extra: Partial<Session> = {}): Session {
  return { id, title: id, objective: 'o', repositoryId, teamId: 'delivery', runtime: 'demo', ownerId, ownerName: ownerId, status: 'completed', budgetUsd: 1, spentUsd: 0, costStatus: 'demo', createdAt: '2026-10-30T00:00:00.000Z', updatedAt: '2026-10-30T00:00:00.000Z', branch: 'b', runs: [], artifacts: [], ...extra } as Session;
}

test('every table the code creates is either exported or excluded with a reason', async () => {
  const sourceDir = new URL('../src/', import.meta.url);
  const created = new Set<string>();
  const walk = async (dir: URL): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(new URL(`${entry.name}/`, dir));
      else if (entry.name.endsWith('.ts')) for (const match of (await readFile(new URL(entry.name, dir), 'utf8')).matchAll(/CREATE TABLE (?:IF NOT EXISTS )?([a-z_]+)/g)) created.add(match[1]);
    }
  };
  await walk(sourceDir);
  const exportedTables = [...tableEntities.map(entity => entity.table), ...Object.values(curatedSources).flat()];
  const excluded = excludedTables.map(entry => entry.table);
  for (const entry of excludedTables) assert.ok(entry.reason.length > 20, `${entry.table} gives a reason`);
  assert.equal(new Set(exportedTables).size, exportedTables.length, 'each table is exported by one entity');
  for (const table of exportedTables) assert.ok(!excluded.includes(table), `${table} is not both exported and excluded`);
  const classified = new Set([...exportedTables, ...excluded]);
  const unclassified = [...created].filter(table => !classified.has(table));
  assert.deepEqual(unclassified, [], `classify each new table in src/tenant-export.ts: export it or list it in excludedTables with a reason`);
  for (const table of classified) assert.ok(created.has(table) || table === 'sqlite_sequence', `${table} is still created somewhere`);
});

test('a fully started workbench has no table the export does not classify', async t => {
  const app = await application('live');
  t.after(() => app.close());
  const classified = new Set([...tableEntities.map(entity => entity.table), ...Object.values(curatedSources).flat(), ...excludedTables.map(entry => entry.table)]);
  assert.deepEqual(databaseTables(app.app.store.db).filter(table => !classified.has(table)), []);
});

test('the bundle carries no secret: no password hash, token, key, credential or webhook secret', async t => {
  const { dir, store } = await workspace(t);
  const secrets = { password: 'pw-hash-scrypt$do-not-export', login: 'login-token-hash-do-not-export', editor: 'editor-token-hash-do-not-export', access: 'oidc-access-token-do-not-export', refresh: 'oidc-refresh-token-do-not-export', task: 'task-source-token-do-not-export', repo: 'repository-password-do-not-export', workspace: 'workspace-endpoint-secret-do-not-export', gateway: 'sk-gateway-master-do-not-export' };
  store.addUser({ id: 'alice', name: 'alice@example.test', role: 'admin', passwordHash: secrets.password });
  store.createLogin(secrets.login, 'alice', '2099-01-01T00:00:00.000Z');
  store.setPersonGrant(secrets.login, { userId: 'alice', subject: 'alice', accessToken: secrets.access, accessExpiresAt: 0, refreshToken: secrets.refresh });
  store.createEditorCredential({ id: 'a'.repeat(24), tokenHash: secrets.editor, userId: 'alice', label: 'VS Code', scope: 'editor', createdAt: '2026-10-30T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' });
  store.saveSession(session('s1', 'repo', 'alice', { workspace: { id: 'w', backend: 'local', directory: '/tmp/w', endpoint: `https://${secrets.workspace}@host` }, objective: `use ${secrets.gateway} please` }));
  store.db.prepare('INSERT INTO events(session_id,type,at,actor,data) VALUES(?,?,?,?,?)').run('s1', 'message', '2026-10-30T00:00:00.000Z', 'agent', JSON.stringify({ text: `the key is ${secrets.gateway}` }));
  const config: Partial<AppConfig> = {
    repositories: [{ id: 'repo', name: 'Repo', description: 'd', url: `https://bot:${secrets.repo}@forge.example.test/acme/repo.git`, baseBranch: 'main', verify: [], access: { username: 'bot', password: secrets.repo } }],
    taskSources: [{ id: 'board', name: 'Board', provider: 'forgejo', baseUrl: 'https://forge.example.test', project: 'acme/repo', repositoryId: 'repo', token: secrets.task, executionOwner: 'interactive' }],
  };
  const bundle = await exported(dir, { ...base(store, config), secrets: [secrets.gateway, secrets.task, secrets.repo] });
  const everything = [...bundle.members.values()].map(buffer => buffer.toString('utf8')).join('\n');
  for (const [name, value] of Object.entries(secrets)) assert.ok(!everything.includes(value), `the ${name} secret is not in the bundle`);
  assert.ok(!/passwordHash|password_hash|tokenHash|token_hash|refreshToken|accessToken|ciphertext/.test(everything), 'no secret field name appears');
  assert.equal(rows(bundle, 'users')[0].name, 'alice@example.test');
  assert.equal(rows(bundle, 'repositories')[0].url, 'https://forge.example.test/acme/repo.git');
  assert.equal(rows(bundle, 'task-sources')[0].project, 'acme/repo');
  assert.match(rows(bundle, 'session-events')[0].data.text, /\[redacted\]/);
  assert.equal(bundle.manifest.secrets.exported, false);
  assert.deepEqual(bundle.manifest.excluded.map(entry => entry.table).sort(), ['card_import', 'editor_credentials', 'internal_state', 'linked_session_notice_snapshots', 'logins', 'sqlite_sequence']);
});

test('with Tenant checks enforced, the bundle holds only what the Tenant owns', async t => {
  const { dir, store } = await workspace(t);
  store.addUser({ id: 'alice', name: 'alice@acme.test', role: 'admin', passwordHash: 'x', memberships: [{ kind: 'tenant', tenant: 'acme', role: 'admin' }] });
  store.addUser({ id: 'carol', name: 'carol@client.test', role: 'viewer', passwordHash: 'x', memberships: [{ kind: 'client', tenant: 'acme', client: 'shop' }] });
  store.addUser({ id: 'bob', name: 'bob@globex.test', role: 'admin', passwordHash: 'x', memberships: [{ kind: 'tenant', tenant: 'globex', role: 'admin' }] });
  const config: Partial<AppConfig> = {
    tenancy: { enforce: true },
    repositories: [
      { id: 'acme-repo', name: 'A', description: '', url: 'https://forge.example.test/acme/app.git', baseBranch: 'main', verify: [], tenant: 'acme' },
      { id: 'globex-repo', name: 'G', description: '', url: 'https://forge.example.test/globex/app.git', baseBranch: 'main', verify: [], tenant: 'globex' },
    ],
    taskSources: [
      { id: 'acme-board', name: 'A', provider: 'forgejo', baseUrl: 'https://forge.example.test', project: 'acme/app', repositoryId: 'acme-repo', executionOwner: 'interactive', tenant: 'acme' },
      { id: 'globex-board', name: 'G', provider: 'forgejo', baseUrl: 'https://forge.example.test', project: 'globex/app', repositoryId: 'globex-repo', executionOwner: 'interactive', tenant: 'globex' },
    ],
  };
  store.saveSession(session('s-acme', 'acme-repo', 'alice'));
  store.saveSession(session('s-globex', 'globex-repo', 'bob'));
  for (const id of ['s-acme', 's-globex']) store.db.prepare('INSERT INTO events(session_id,type,at,actor,data) VALUES(?,?,?,?,?)').run(id, 'message', '2026-10-30T00:00:00.000Z', 'agent', JSON.stringify({ text: id }));
  for (const [id, owner] of [['c-acme', 'alice'], ['c-globex', 'bob']]) {
    store.db.prepare('INSERT INTO chats(id,owner_id,updated_at,body) VALUES(?,?,?,?)').run(id, owner, '2026-10-30T00:00:00.000Z', '{}');
    store.db.prepare('INSERT INTO chat_turns(chat_id,turn_id,seq,body) VALUES(?,?,?,?)').run(id, 't1', 1, JSON.stringify({ text: id }));
    store.db.prepare('INSERT INTO linked_sessions(id,owner_id,last_seen_at,body) VALUES(?,?,?,?)').run(`l-${id}`, owner, '2026-10-30T00:00:00.000Z', '{}');
    store.db.prepare('INSERT INTO agent_traces(id,session_id,revision,recorded_at,body) VALUES(?,?,?,?,?)').run(`tr-${id}`, `l-${id}`, 'r', '2026-10-30T00:00:00.000Z', '{}');
  }
  store.recordProductEvents([{ tenantId: 'acme', actor: 'p1', session: '', name: 'ui.view', screen: 'now', props: {}, at: '2026-10-30T00:00:00.000Z' }, { tenantId: 'globex', actor: 'p2', session: '', name: 'ui.view', screen: 'now', props: {}, at: '2026-10-30T00:00:00.000Z' }]);
  for (const [id, item] of [['so-acme', '101'], ['so-globex', '202']]) store.db.prepare('INSERT INTO client_sign_offs(id,work_item_id,pull_request_id,head_sha,state,recorded_at,body) VALUES(?,?,?,?,?,?,?)').run(id, item, 'pr', 'sha', 'current', '2026-10-30T00:00:00.000Z', '{}');
  for (const repository of ['acme/app', 'globex/app']) store.db.prepare('INSERT INTO client_sign_off_exclusions(client,repository,updated_at,body) VALUES(?,?,?,?)').run('', repository, '2026-10-30T00:00:00.000Z', '{}');
  store.db.prepare('INSERT INTO flag_overrides(flag_key,variant,reason,set_by,set_at) VALUES(?,?,?,?,?)').run('work.live-view', 'on', 'r', 'admin', '2026-10-30T00:00:00.000Z');
  const asked: string[] = [];
  const sources: ExportSources = { ...base(store, config), workItemsInTenant: async ids => { asked.push(...ids); return new Set(ids.filter(id => id === '101')); }, deliveryLedger: async () => ({ window: '30d', rows: [{ workItemId: '101' }, { workItemId: '202' }] as never }) };

  const acme = await exported(dir, sources, 'acme', 'acme');
  const everything = [...acme.members.values()].map(buffer => buffer.toString('utf8')).join('\n');
  assert.ok(!/globex|bob|s-globex|c-globex|so-globex|"202"/.test(everything), 'nothing of the other Tenant leaks');
  assert.deepEqual(rows(acme, 'users').map(row => row.id).sort(), ['alice', 'carol']);
  assert.deepEqual(rows(acme, 'repositories').map(row => row.id), ['acme-repo']);
  assert.deepEqual(rows(acme, 'task-sources').map(row => row.id), ['acme-board']);
  assert.deepEqual(rows(acme, 'sessions').map(row => row.id), ['s-acme']);
  assert.deepEqual(rows(acme, 'session-events').map(row => row.sessionId), ['s-acme']);
  assert.deepEqual(rows(acme, 'chat-turns').map(row => row.chatId), ['c-acme']);
  assert.deepEqual(rows(acme, 'agent-traces').map(row => row.sessionId), ['l-c-acme']);
  assert.deepEqual(rows(acme, 'product-events').map(row => row.actor), ['p1']);
  assert.deepEqual(rows(acme, 'client-sign-offs').map(row => row.workItemId), ['101']);
  assert.deepEqual(rows(acme, 'client-sign-off-exclusions').map(row => row.repository), ['acme/app']);
  assert.deepEqual(rows(acme, 'delivery-ledger').map(row => row.workItemId), ['101']);
  assert.deepEqual(rows(acme, 'flag-overrides'), [], 'installation-wide rows go only with the default Tenant');
  assert.equal(acme.members.has('flags.flagd.json'), false);
  assert.deepEqual([...new Set(asked)].sort(), ['101', '202']);
  assert.equal(acme.manifest.tenant, 'acme');
  assert.equal(acme.manifest.tenancyEnforced, true);

  const open = await exported(dir, { ...sources, config: { ...sources.config, tenancy: { enforce: false } } }, 'default', 'open');
  assert.deepEqual(rows(open, 'users').map(row => row.id).sort(), ['alice', 'bob', 'carol'], 'with Tenant checks off the installation is one Tenant');
  assert.equal(rows(open, 'sessions').length, 2);
  assert.equal(rows(open, 'flag-overrides').length, 1);
  assert.deepEqual(rows(open, 'product-events').map(row => row.actor), [], 'product events keep their stored Tenant id');
});

function validates(schema: any, value: any, path: string): void {
  const types = schema.type === undefined ? null : [schema.type].flat();
  if (types) {
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) && types.includes('integer') ? 'integer' : typeof value;
    assert.ok(types.includes(actual) || (actual === 'integer' && types.includes('number')), `${path} is ${types.join('|')}, not ${actual}`);
  }
  if (schema.enum) assert.ok(schema.enum.includes(value), `${path} is one of ${schema.enum}`);
  if (value && typeof value === 'object' && !Array.isArray(value) && schema.properties) {
    for (const key of schema.required ?? []) assert.ok(key in value, `${path}.${key} is present`);
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) assert.ok(key in schema.properties, `${path}.${key} is in the schema`);
    for (const [key, item] of Object.entries(value)) if (schema.properties[key]) validates(schema.properties[key], item, `${path}.${key}`);
  }
}

test('the manifest lists every file with its row count and SHA-256, and every row matches its entity schema', async t => {
  const { dir, store } = await workspace(t);
  store.addUser({ id: 'alice', name: 'alice@example.test', role: 'operator', passwordHash: 'x' });
  store.saveSession(session('s1', 'repo', 'alice'));
  for (let index = 0; index < 3; index++) store.db.prepare('INSERT INTO events(session_id,type,at,actor,run_id,data) VALUES(?,?,?,?,?,?)').run('s1', 'message', '2026-10-30T00:00:00.000Z', 'agent', index ? null : 'run-1', JSON.stringify({ index }));
  store.db.prepare('INSERT INTO card_assets(id,purpose,media_type,bytes,created_at,created_by,content) VALUES(?,?,?,?,?,?,?)').run('asset', 'art', 'image/png', 3, '2026-10-30T00:00:00.000Z', 'alice', Buffer.from([1, 2, 3]));
  store.recordAction({ at: '2026-10-30T00:00:00.000Z', userId: 'alice', userName: 'alice', role: 'operator', channel: 'browser', action: 'POST /api/sessions', method: 'POST', target: null, inputs: { title: 't' }, confirmation: null, status: 201, outcome: 'done' });
  const bundle = await exported(dir, { ...base(store), flagDocument: () => ({ flags: {} }) });

  assert.equal(bundle.manifest.format, 'unfold-tenant-export');
  assert.equal(bundle.manifest.formatVersion, 1);
  assert.equal(bundle.sha256, createHash('sha256').update(await readFile(join(dir, 'bundle.tar.gz'))).digest('hex'));
  const listed = new Set(bundle.manifest.files.map(file => file.path));
  assert.deepEqual([...bundle.members.keys()].filter(name => name !== 'manifest.json').sort(), [...listed].sort(), 'the manifest lists every other member');
  assert.ok(listed.has('ploeg-data.md') && listed.has('flags.flagd.json'));
  for (const file of bundle.manifest.files) {
    const content = bundle.members.get(file.path)!;
    assert.equal(createHash('sha256').update(content).digest('hex'), file.sha256, `${file.path} matches its checksum`);
    assert.equal(content.length, file.bytes);
    if (file.rows !== undefined) assert.equal(content.toString('utf8').split('\n').filter(Boolean).length, file.rows, `${file.path} has ${file.rows} rows`);
  }
  assert.equal(bundle.manifest.entities.length, tableEntities.length + 5);
  for (const entity of bundle.manifest.entities) {
    const schema = JSON.parse(bundle.members.get(entity.schema)!.toString('utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(entity.schemaVersion, 1);
    for (const [index, row] of rows(bundle, entity.name).entries()) validates(schema, row, `${entity.name}[${index}]`);
  }
  assert.equal(bundle.manifest.entities.find(entity => entity.name === 'session-events')!.rows, 3);
  assert.equal(rows(bundle, 'card-assets')[0].content, 'AQID', 'BLOB columns are base64');
  assert.deepEqual(rows(bundle, 'action-records')[0].inputs, { title: 't' });
  assert.equal(bundle.manifest.entities.find(entity => entity.name === 'delivery-ledger')!.unavailable, 'Ploeg is not connected.');
  assert.match(bundle.members.get('ploeg-data.md')!.toString('utf8'), /Shifts, Runs/);
});

test('a ustar header carries the size, a valid checksum and refuses long names', () => {
  const header = ustarHeader('data/users.jsonl', 1234, new Date(0));
  assert.equal(header.length, 512);
  assert.equal(parseInt(header.subarray(124, 136).toString('ascii'), 8), 1234);
  assert.throws(() => ustarHeader('x'.repeat(101), 1, new Date(0)), /1 to 100 bytes/);
});

test('a large export streams rows to disk with bounded memory and keeps the event loop free', async t => {
  const { dir, store } = await workspace(t);
  store.saveSession(session('big', 'repo', 'alice'));
  const payload = 'x'.repeat(2000);
  const insert = store.db.prepare('INSERT INTO events(session_id,type,at,actor,data) VALUES(?,?,?,?,?)');
  const count = 40_000;
  store.transaction(() => { for (let index = 0; index < count; index++) insert.run('big', 'message', '2026-10-30T00:00:00.000Z', 'agent', JSON.stringify({ index, payload })); });
  (globalThis as { gc?: () => void }).gc?.();
  const baseline = process.memoryUsage().heapUsed;
  let peak = baseline;
  let ticks = 0;
  const sampler = setInterval(() => { ticks++; peak = Math.max(peak, process.memoryUsage().heapUsed); }, 5);
  const bundle = await exported(dir, { ...base(store), yieldEvery: 200 }).finally(() => clearInterval(sampler));
  const events = bundle.manifest.files.find(file => file.path === 'data/session-events.jsonl')!;
  assert.equal(events.rows, count);
  assert.ok(events.bytes > 80_000_000, `the events file is large (${events.bytes} bytes)`);
  const grown = peak - baseline;
  assert.ok(grown < events.bytes / 2, `heap grew ${grown} bytes while writing ${events.bytes} bytes of rows`);
  assert.ok(ticks > 5, `the event loop ran ${ticks} timer ticks during the export`);
});

test('administrators export a Tenant through the API once the flag is on, and every step is audited', async t => {
  const app = await application('live');
  t.after(() => app.close());
  const admin = await login(app.url);
  app.app.store.addUser({ id: 'operator-otto', name: 'otto@example.test', role: 'operator', passwordHash: await hashPassword('operator-password-1414') });
  const operator = await login(app.url, 'otto@example.test', 'operator-password-1414');

  const off = await request(app.url, '/api/admin/tenant-exports', { method: 'POST', cookie: admin.cookie, body: { tenant: 'default', confirm: 'default' } });
  assert.equal(off.status, 403, off.text);
  assert.equal(off.body.error.code, 'tenant_export_off');
  const on = await request(app.url, '/api/admin/flags/tenant.export/override', { method: 'PUT', cookie: admin.cookie, body: { variant: 'on', reason: 'leaving test' } });
  assert.equal(on.status, 200, on.text);

  assert.equal((await request(app.url, '/api/admin/tenant-exports', { method: 'POST', cookie: operator.cookie, body: { confirm: 'default' } })).status, 403);
  assert.equal((await request(app.url, '/api/admin/tenant-exports', { method: 'POST', cookie: admin.cookie, body: {} })).body.error.code, 'tenant_export_confirm');
  assert.equal((await request(app.url, '/api/admin/tenant-exports', { method: 'POST', cookie: admin.cookie, body: { tenant: 'acme', confirm: 'acme' } })).status, 404, 'with Tenant checks off only the default Tenant exists');

  const started = await request(app.url, '/api/admin/tenant-exports', { method: 'POST', cookie: admin.cookie, body: { confirm: 'default' } });
  assert.equal(started.status, 202, started.text);
  const id = started.body.export.id;
  let job = started.body.export;
  for (let attempt = 0; job.state === 'running' && attempt < 400; attempt++) { await delay(25); job = (await request(app.url, `/api/admin/tenant-exports/${id}`, { cookie: admin.cookie })).body.export; }
  assert.equal(job.state, 'ready', JSON.stringify(job));
  assert.ok(Date.parse(job.expiresAt) > Date.now());
  assert.equal((await request(app.url, `/api/admin/tenant-exports/${id}`, { cookie: operator.cookie })).status, 403);

  const download = await fetch(`${app.url}${job.downloadUrl}`, { headers: { cookie: admin.cookie } });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'application/gzip');
  const archive = Buffer.from(await download.arrayBuffer());
  assert.equal(download.headers.get('repr-digest'), `sha-256=:${createHash('sha256').update(archive).digest('base64')}:`);
  assert.equal(createHash('sha256').update(archive).digest('hex'), job.sha256);
  const manifest = JSON.parse(untar(archive).get('manifest.json')!.toString('utf8'));
  assert.equal(manifest.tenant, 'default');
  assert.ok(manifest.entities.find((entity: { name: string; rows: number }) => entity.name === 'users').rows >= 2);

  const actions = await request(app.url, '/api/actions?limit=50', { cookie: admin.cookie });
  const recorded = (actions.body.actions ?? []).map((entry: { action: string }) => entry.action);
  assert.ok(recorded.includes('POST /api/admin/tenant-exports'), JSON.stringify(recorded));
  assert.ok(recorded.includes('GET /api/admin/tenant-exports/:id/download'), JSON.stringify(recorded));

  assert.equal((await request(app.url, `/api/admin/tenant-exports/${id}`, { method: 'DELETE', cookie: admin.cookie })).status, 200);
  assert.equal((await fetch(`${app.url}${job.downloadUrl}`, { headers: { cookie: admin.cookie } })).status, 404);
});
