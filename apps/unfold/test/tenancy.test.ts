import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { defaultMemberships, membershipFromGroup, membershipsFromGroups, storedMemberships, type Membership } from '../src/tenancy.ts';
import { Auth, signedInUser } from '../src/auth.ts';
import { Oidc } from '../src/oidc.ts';
import { Store } from '../src/store.ts';
import { application, configuration, login, request } from './api-support.ts';

test('membership groups parse into typed Tenant and Client memberships', () => {
  assert.deepEqual(membershipFromGroup('unfold/acme/viewer'), { kind: 'tenant', tenant: 'acme', role: 'viewer' });
  assert.deepEqual(membershipFromGroup('unfold/acme/member'), { kind: 'tenant', tenant: 'acme', role: 'developer' }, 'the group word member grants the Developer Access Role');
  assert.deepEqual(membershipFromGroup('unfold/acme/admin'), { kind: 'tenant', tenant: 'acme', role: 'admin' });
  assert.deepEqual(membershipFromGroup('unfold/acme/client/bakery-42'), { kind: 'client', tenant: 'acme', client: 'bakery-42' });
  assert.deepEqual(membershipFromGroup('unfold/default/admin'), { kind: 'tenant', tenant: 'default', role: 'admin' });
});

test('a malformed or unknown group is ignored and never widens', () => {
  const ignored = [
    'unfold-admins', 'unfold', 'unfold/', 'unfold/acme', 'unfold/acme/', 'unfold//admin', 'Unfold/acme/admin', 'unfold/Acme/admin',
    'unfold/acme/ADMIN', 'unfold/acme/owner', 'unfold/acme/operator', 'unfold/acme/developer', 'unfold/acme/admin/', 'unfold/acme/admin/extra',
    'unfold/acme/client', 'unfold/acme/client/', 'unfold/acme/client/Bakery', 'unfold/acme/client/bakery/admin', 'unfold/-acme/admin',
    'unfold/acme-/admin', 'unfold/ac me/admin', 'unfold/acme/toString', 'unfold/acme/__proto__', 'unfold/acme/constructor', ' unfold/acme/admin',
    'unfold/acme/admin ', `unfold/${'a'.repeat(64)}/admin`, `unfold/acme/client/${'b'.repeat(64)}`, `unfold/acme/client/${'b'.repeat(200)}`,
  ];
  for (const group of ignored) assert.equal(membershipFromGroup(group), undefined, group);
  for (const value of [undefined, null, 7, {}, ['unfold/acme/admin']]) assert.equal(membershipFromGroup(value), undefined);
  for (const value of [undefined, null, 'unfold/acme/admin', { 0: 'unfold/acme/admin' }]) assert.deepEqual(membershipsFromGroups(value), [], 'only a list of groups grants anything');
});

test('a list of groups gives each Tenant its highest role once, and each Client once, in a stable order', () => {
  const groups = ['unfold/zeta/viewer', 'unfold-operators', 'unfold/acme/viewer', 'unfold/acme/admin', 'unfold/acme/member', 'unfold/acme/client/b', 'unfold/acme/client/a', 'unfold/acme/client/a', 'unfold/acme-b/client/a', 7, 'unfold/acme/owner'];
  const expected: Membership[] = [
    { kind: 'tenant', tenant: 'acme', role: 'admin' },
    { kind: 'tenant', tenant: 'zeta', role: 'viewer' },
    { kind: 'client', tenant: 'acme', client: 'a' },
    { kind: 'client', tenant: 'acme', client: 'b' },
    { kind: 'client', tenant: 'acme-b', client: 'a' },
  ];
  assert.deepEqual(membershipsFromGroups(groups), expected);
  assert.deepEqual(membershipsFromGroups([...groups].reverse()), expected, 'order of the groups does not matter');
  assert.deepEqual(membershipsFromGroups(['unfold/acme/client/bakery']), [{ kind: 'client', tenant: 'acme', client: 'bakery' }], 'a Client membership grants no Tenant role');
});

test('stored memberships keep only well-formed entries', () => {
  assert.equal(storedMemberships('[]'), undefined);
  assert.deepEqual(storedMemberships([{ kind: 'tenant', tenant: 'acme', role: 'admin' }, { kind: 'tenant', tenant: 'acme', role: 'owner' }, { kind: 'client', tenant: 'Acme', client: 'b' }, null, 'x', { kind: 'client', tenant: 'acme', client: 'b', extra: true }]),
    [{ kind: 'tenant', tenant: 'acme', role: 'admin' }, { kind: 'client', tenant: 'acme', client: 'b' }]);
});

test('local password accounts and the demo hold their role in the default Tenant; a single sign-on account holds what its groups granted', () => {
  assert.deepEqual(defaultMemberships('admin'), [{ kind: 'tenant', tenant: 'default', role: 'admin' }]);
  assert.deepEqual(defaultMemberships('operator'), [{ kind: 'tenant', tenant: 'default', role: 'developer' }]);
  assert.deepEqual(defaultMemberships('viewer'), [{ kind: 'tenant', tenant: 'default', role: 'viewer' }]);
  assert.deepEqual(signedInUser({ id: 'l', name: 'local', role: 'operator', passwordHash: 'scrypt$x$y' }), { id: 'l', name: 'local', role: 'operator', memberships: [{ kind: 'tenant', tenant: 'default', role: 'developer' }] });
  assert.deepEqual(signedInUser({ id: 'l', name: 'local', role: 'admin', passwordHash: 'scrypt$x$y' }, 'viewer').memberships, [{ kind: 'tenant', tenant: 'default', role: 'viewer' }], 'a lowered role lowers the default membership too');
  assert.deepEqual(signedInUser({ id: 'l', name: 'local', role: 'admin', passwordHash: 'scrypt$x$y', memberships: [{ kind: 'tenant', tenant: 'acme', role: 'admin' }] }).memberships, [{ kind: 'tenant', tenant: 'default', role: 'admin' }], 'a local account never holds another Tenant');
  assert.deepEqual(signedInUser({ id: 's', name: 'sso', role: 'viewer', passwordHash: '' }), { id: 's', name: 'sso', role: 'viewer' }, 'no stored memberships, none reported');
  assert.deepEqual(signedInUser({ id: 's', name: 'sso', role: 'viewer', passwordHash: '', memberships: [] }), { id: 's', name: 'sso', role: 'viewer', memberships: [] });
  const demo = new Auth(new Store(':memory:'), configuration('/tmp/unused', 'demo'));
  assert.deepEqual(demo.user({ headers: {} } as IncomingMessage)?.memberships, [{ kind: 'tenant', tenant: 'default', role: 'admin' }]);
});

test('single sign-on reads memberships from the groups claim and they never change the role it entitles', () => {
  const config = configuration('/tmp/unused', 'live');
  config.auth.oidc = { issuer: 'https://auth.example/', clientId: 'unfold', scopes: ['openid'], displayName: 'Authentik', roleClaim: 'unfold_role', groupsClaim: 'groups', roles: { admin: ['unfold-admins'], operator: ['unfold-operators'], viewer: ['unfold-viewers'] } };
  const oidc = new Oidc(config);
  const identity = oidc.identity({ sub: 'p1', email: 'p@example.com', groups: ['unfold-viewers', 'unfold/acme/admin', 'unfold/acme/client/bakery', 'unfold/acme/boss'] });
  assert.equal(identity.role, 'viewer', 'a Tenant admin group does not raise the workbench role');
  assert.deepEqual(identity.memberships, [{ kind: 'tenant', tenant: 'acme', role: 'admin' }, { kind: 'client', tenant: 'acme', client: 'bakery' }]);
  assert.throws(() => oidc.identity({ sub: 'p2', groups: ['unfold/acme/admin'] }), (error: any) => error.code === 'oidc_not_entitled', 'membership groups alone admit nobody');
});

test('the store keeps memberships beside the user, replaces them only when given, and opens a database from before them', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'unfold-tenancy-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'unfold.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, role TEXT NOT NULL, password_hash TEXT NOT NULL);
    INSERT INTO users VALUES ('u1', 'kept', 'operator', '');`);
  legacy.close();
  const store = new Store(path);
  assert.deepEqual(store.getUser('u1'), { id: 'u1', name: 'kept', role: 'operator', passwordHash: '' }, 'an account from before memberships has none');
  const memberships: Membership[] = [{ kind: 'tenant', tenant: 'acme', role: 'developer' }];
  store.upsertUser({ id: 'u1', name: 'kept', role: 'operator', passwordHash: '', memberships });
  assert.deepEqual(store.getUser('u1')?.memberships, memberships);
  assert.deepEqual(store.getUserByName('KEPT')?.memberships, memberships);
  store.upsertUser({ id: 'u1', name: 'kept', role: 'admin', passwordHash: '' });
  assert.deepEqual(store.getUser('u1')?.memberships, memberships, 'an upsert without memberships keeps the stored ones');
  store.upsertUser({ id: 'u1', name: 'kept', role: 'admin', passwordHash: '', memberships: [] });
  assert.deepEqual(store.getUser('u1')?.memberships, [], 'an empty list removes every membership');
  store.addUser({ id: 'u2', name: 'new', role: 'viewer', passwordHash: '', memberships: [{ kind: 'client', tenant: 'acme', client: 'bakery' }] });
  store.db.prepare("UPDATE user_memberships SET memberships='not json' WHERE user_id='u2'").run();
  assert.equal(store.getUser('u2')?.memberships, undefined, 'unreadable stored memberships grant nothing');
  store.close();
});

test('the session endpoint reports the memberships of a local account', async t => {
  const server = await application('live');
  t.after(() => server.close());
  const { cookie, user } = await login(server.url);
  assert.deepEqual(user.memberships, [{ kind: 'tenant', tenant: 'default', role: 'admin' }]);
  const bootstrap = await request(server.url, '/api/bootstrap', { cookie });
  assert.equal(bootstrap.status, 200);
  assert.deepEqual(bootstrap.body.user.memberships, [{ kind: 'tenant', tenant: 'default', role: 'admin' }]);
});

test('the demo session reports the default Tenant', async t => {
  const server = await application('demo');
  t.after(() => server.close());
  const bootstrap = await request(server.url, '/api/bootstrap');
  assert.deepEqual(bootstrap.body.user.memberships, [{ kind: 'tenant', tenant: 'default', role: 'admin' }]);
});
