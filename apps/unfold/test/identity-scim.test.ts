import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { request } from './api-support.ts';
import { signIn } from './oidc-support.ts';
import { identityBench, scim } from './identity-support.ts';
import { subjectUserId } from '../src/oidc.ts';

const userSchema = 'urn:ietf:params:scim:schemas:core:2.0:User';
const groupSchema = 'urn:ietf:params:scim:schemas:core:2.0:Group';
const patchSchema = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
const subject = 'person@example.com';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const cookieOf = (response: Response) => response.headers.get('set-cookie')!.split(';')[0];

test('SCIM answers only with the bearer token, and not at all while its flag is off', async t => {
  const { server } = await identityBench(t);
  assert.equal((await scim(server.url, '/Users', { token: null })).status, 401);
  const wrong = await scim(server.url, '/Users', { token: 'not-the-token-0123456789abcdef0123456789' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get('www-authenticate'), 'Bearer realm="scim"');
  assert.deepEqual(wrong.body.schemas, ['urn:ietf:params:scim:api:messages:2.0:Error']);
  assert.equal(wrong.body.status, '401');
  assert.equal((await scim(server.url, '/Users')).status, 200);
  const off = await identityBench(t, { scim: false });
  assert.equal((await scim(off.server.url, '/Users')).status, 404);
  const refused = server.app.store.actionRecords({ channel: 'scim', limit: 10 });
  assert.ok(refused.some(record => record.outcome === 'refused' && record.status === 401), 'a refused SCIM call is an Action Record');
});

test('SCIM describes itself: ServiceProviderConfig, ResourceTypes and Schemas', async t => {
  const { server } = await identityBench(t);
  const config = await scim(server.url, '/ServiceProviderConfig');
  assert.equal(config.status, 200);
  assert.equal(config.headers.get('content-type'), 'application/scim+json; charset=utf-8');
  assert.deepEqual(config.body.schemas, ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig']);
  assert.equal(config.body.patch.supported, true);
  assert.equal(config.body.filter.supported, true);
  assert.equal(config.body.bulk.supported, false);
  assert.equal(config.body.authenticationSchemes[0].type, 'oauthbearertoken');
  const types = await scim(server.url, '/ResourceTypes');
  assert.deepEqual(types.body.Resources.map((item: { id: string }) => item.id), ['User', 'Group']);
  assert.equal((await scim(server.url, '/ResourceTypes/User')).body.endpoint, '/Users');
  const schemas = await scim(server.url, '/Schemas');
  assert.deepEqual(schemas.body.Resources.map((item: { id: string }) => item.id), [userSchema, groupSchema]);
  assert.equal((await scim(server.url, `/Schemas/${userSchema}`)).body.name, 'User');
});

test('SCIM creates, reads, filters, pages, replaces and patches a User', async t => {
  const { server } = await identityBench(t);
  const created = await scim(server.url, '/Users', { method: 'POST', body: { schemas: [userSchema], userName: 'Person@Example.com', externalId: subject, name: { givenName: 'Pat', familyName: 'Person' }, emails: [{ value: 'person@example.com', primary: true, type: 'work' }], active: true } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.id;
  assert.equal(created.headers.get('location'), `/scim/v2/Users/${id}`);
  assert.equal(created.body.displayName, 'Pat Person');
  assert.equal(created.body.active, true);
  assert.deepEqual(created.body.emails, [{ value: 'person@example.com', primary: true }]);
  assert.equal(created.body.meta.resourceType, 'User');
  const userId = subjectUserId(server.config.auth.oidc!.issuer, subject);
  assert.equal(server.app.store.getUser(userId)?.name, 'person@example.com', 'the User names the account single sign-on signs in as');
  const duplicate = await scim(server.url, '/Users', { method: 'POST', body: { schemas: [userSchema], userName: 'person@example.com', externalId: 'other' } });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.scimType, 'uniqueness');
  assert.equal((await scim(server.url, `/Users/${id}`)).body.userName, 'Person@Example.com');
  const byName = await scim(server.url, `/Users?filter=${encodeURIComponent('userName eq "person@example.com"')}`);
  assert.equal(byName.body.totalResults, 1, 'userName matches without regard to case');
  assert.equal(byName.body.Resources[0].id, id);
  assert.deepEqual(byName.body.schemas, ['urn:ietf:params:scim:api:messages:2.0:ListResponse']);
  assert.equal((await scim(server.url, `/Users?filter=${encodeURIComponent(`externalId eq "${subject}"`)}`)).body.totalResults, 1);
  assert.equal((await scim(server.url, `/Users?filter=${encodeURIComponent('externalId eq "nobody"')}`)).body.totalResults, 0);
  const bad = await scim(server.url, `/Users?filter=${encodeURIComponent('title co "x"')}`);
  assert.equal(bad.status, 400);
  assert.equal(bad.body.scimType, 'invalidFilter');
  for (const attribute of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    const inherited = await scim(server.url, `/Users?filter=${encodeURIComponent(`${attribute} eq "person@example.com"`)}`);
    assert.equal(inherited.status, 400, `${attribute} is not a User attribute: ${JSON.stringify(inherited.body)}`);
    assert.equal(inherited.body.scimType, 'invalidFilter');
    assert.equal((await scim(server.url, `/Groups?filter=${encodeURIComponent(`${attribute} eq "x"`)}`)).status, 400, `${attribute} is not a Group attribute`);
  }
  for (const index of [1, 2, 3]) assert.equal((await scim(server.url, '/Users', { method: 'POST', body: { schemas: [userSchema], userName: `user${index}@example.com`, externalId: `user-${index}` } })).status, 201);
  const second = await scim(server.url, '/Users?startIndex=2&count=2');
  assert.equal(second.body.totalResults, 4);
  assert.equal(second.body.startIndex, 2);
  assert.equal(second.body.itemsPerPage, 2);
  assert.deepEqual(second.body.Resources.map((user: { userName: string }) => user.userName), ['user1@example.com', 'user2@example.com']);
  const replaced = await scim(server.url, `/Users/${id}`, { method: 'PUT', body: { schemas: [userSchema], userName: 'person@example.com', externalId: subject, displayName: 'Pat', emails: [{ value: 'person@example.com', primary: true }], active: true } });
  assert.equal(replaced.status, 200);
  assert.equal(replaced.body.displayName, 'Pat');
  assert.equal(replaced.body.meta.version, 'W/"2"');
  const relink = await scim(server.url, `/Users/${id}`, { method: 'PUT', body: { schemas: [userSchema], userName: 'person@example.com', externalId: 'someone-else' } });
  assert.equal(relink.status, 400, 'the attribute that links a User to its sign-in never changes');
  assert.equal(relink.body.scimType, 'mutability');
  const patched = await scim(server.url, `/Users/${id}`, { method: 'PATCH', body: { schemas: [patchSchema], Operations: [{ op: 'Replace', path: 'displayName', value: 'Patricia' }, { op: 'replace', value: { 'name.givenName': 'ignored' } }, { op: 'Add', path: 'title', value: 'Developer' }] } });
  assert.equal(patched.status, 200, JSON.stringify(patched.body));
  assert.equal(patched.body.displayName, 'Patricia');
  assert.equal((await scim(server.url, '/Users/00000000-0000-0000-0000-000000000000')).status, 404);
});

test('deactivating a User through SCIM ends every credential at once and refuses its next sign-in', async t => {
  const { server, idp } = await identityBench(t);
  const created = await scim(server.url, '/Users', { method: 'POST', body: { schemas: [userSchema], userName: subject, externalId: subject } });
  const userId = subjectUserId(server.config.auth.oidc!.issuer, subject);
  const first = await signIn(server, idp);
  const cookie = cookieOf(first.callback);
  const login = hash(cookie.split('=')[1]);
  const { store, agentHost } = server.app;
  store.setPersonGrant(login, { userId, subject, accessToken: 'at', accessExpiresAt: Date.now() + 60_000, refreshToken: 'rt' });
  const editorToken = `vle_${randomBytes(32).toString('base64url')}`;
  store.createEditorCredential({ id: randomBytes(12).toString('hex'), tokenHash: hash(editorToken), userId, label: 'VS Code', scope: 'editor', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', cookie, body: { label: 'Agents window' } });
  assert.equal(issued.status, 201, issued.text);
  agentHost.issueToken({ id: userId, name: subject, role: 'operator' }, 'unbound');
  assert.equal((await request(server.url, '/api/bootstrap', { cookie })).status, 200);
  assert.equal((await request(server.url, '/api/bootstrap', { headers: { authorization: `Bearer ${editorToken}` } })).status, 200);
  assert.equal(store.secretIds('ahp-token:').length, 2);

  const deactivated = await scim(server.url, `/Users/${created.body.id}`, { method: 'PATCH', body: { schemas: [patchSchema], Operations: [{ op: 'Replace', path: 'active', value: 'False' }] } });
  assert.equal(deactivated.status, 200, JSON.stringify(deactivated.body));
  assert.equal(deactivated.body.active, false);
  assert.equal((await request(server.url, '/api/bootstrap', { cookie })).status, 401, 'the browser session is gone');
  assert.equal((await request(server.url, '/api/bootstrap', { headers: { authorization: `Bearer ${editorToken}` } })).status, 401, 'the editor credential is gone');
  assert.deepEqual(store.secretIds('ahp-token:'), [], 'every Agents-window token is gone, bound to the sign-in or not');
  assert.equal(store.getSecret(`person-grant:${login}`), undefined, 'the kept sign-in tokens are gone');
  assert.deepEqual(store.loginHashes(userId), []);
  assert.deepEqual(store.editorCredentialHashes(userId), []);
  const again = await signIn(server, idp);
  assert.equal(again.callback.headers.get('location'), '/?login_error=account_disabled');
  const revoked = store.actionRecords({ channel: 'scim', limit: 20 }).find(record => record.action === 'REVOKE scim.user_deactivated');
  assert.ok(revoked, 'the revocation is an Action Record');
  assert.deepEqual(revoked!.target, { kind: 'person', id: userId });
  assert.deepEqual(revoked!.inputs.ended, { browserSessions: 1, editors: 1, agentsWindow: 2, delegated: 0, keptSignIns: 1 });

  assert.equal((await scim(server.url, `/Users/${created.body.id}`, { method: 'PATCH', body: { schemas: [patchSchema], Operations: [{ op: 'replace', value: { active: true } }] } })).body.active, true);
  const back = await signIn(server, idp);
  assert.equal(back.callback.headers.get('location'), '/', 'reactivating the User admits the next sign-in');
});

test('deleting a User through SCIM revokes it and keeps the account off', async t => {
  const { server, idp } = await identityBench(t);
  const created = await scim(server.url, '/Users', { method: 'POST', body: { schemas: [userSchema], userName: subject, externalId: subject } });
  const cookie = cookieOf((await signIn(server, idp)).callback);
  assert.equal((await scim(server.url, `/Users/${created.body.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await scim(server.url, `/Users/${created.body.id}`)).status, 404);
  assert.equal((await request(server.url, '/api/bootstrap', { cookie })).status, 401);
  assert.equal((await signIn(server, idp)).callback.headers.get('location'), '/?login_error=account_disabled');
});

test('a Group grants its membership and role at once, and removing a member through SCIM is enforced on the next request', async t => {
  const { server, idp } = await identityBench(t, { configure: config => {
    config.tenancy = { enforce: true };
    config.repositories = [...config.repositories, { id: 'acme-site', name: 'Acme site', description: 'Owned by Tenant acme', url: 'https://forge.example/acme/site.git', baseBranch: 'main', verify: [], tenant: 'acme' }];
  } });
  const user = (await scim(server.url, '/Users', { method: 'POST', body: { schemas: [userSchema], userName: subject, externalId: subject } })).body;
  const cookie = cookieOf((await signIn(server, idp)).callback);
  const before = await request(server.url, '/api/bootstrap', { cookie });
  assert.deepEqual(before.body.repositories, [], 'without a membership the person reaches nothing');
  const group = await scim(server.url, '/Groups', { method: 'POST', body: { schemas: [groupSchema], displayName: 'unfold/acme/member', members: [{ value: user.id }] } });
  assert.equal(group.status, 201, JSON.stringify(group.body));
  assert.deepEqual(group.body.members.map((member: { value: string }) => member.value), [user.id]);
  const member = await request(server.url, '/api/bootstrap', { cookie });
  assert.deepEqual(member.body.user.memberships, [{ kind: 'tenant', tenant: 'acme', role: 'developer' }]);
  assert.deepEqual(member.body.repositories.map((repository: { id: string }) => repository.id), ['acme-site']);
  assert.equal((await scim(server.url, `/Groups?filter=${encodeURIComponent('displayName eq "unfold/acme/member"')}&excludedAttributes=members`)).body.Resources[0].members, undefined);
  assert.deepEqual((await scim(server.url, `/Users/${user.id}`)).body.groups.map((item: { display: string }) => item.display), ['unfold/acme/member']);

  const removed = await scim(server.url, `/Groups/${group.body.id}`, { method: 'PATCH', body: { schemas: [patchSchema], Operations: [{ op: 'Remove', path: `members[value eq "${user.id}"]` }] } });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.deepEqual(removed.body.members, []);
  const after = await request(server.url, '/api/bootstrap', { cookie });
  assert.equal(after.status, 200);
  assert.deepEqual(after.body.user.memberships, []);
  assert.deepEqual(after.body.repositories, [], 'the removed membership is enforced on the very next request');

  const admins = await scim(server.url, '/Groups', { method: 'POST', body: { schemas: [groupSchema], displayName: 'unfold-admins' } });
  await scim(server.url, `/Groups/${admins.body.id}`, { method: 'PATCH', body: { schemas: [patchSchema], Operations: [{ op: 'add', path: 'members', value: [{ value: user.id }] }] } });
  assert.equal((await request(server.url, '/api/bootstrap', { cookie })).body.user.role, 'admin', 'a role group applies without a new sign-in');
  await scim(server.url, `/Groups/${admins.body.id}`, { method: 'PATCH', body: { schemas: [patchSchema], Operations: [{ op: 'Remove', path: 'members', value: [{ value: user.id }] }] } });
  assert.equal((await request(server.url, '/api/bootstrap', { cookie })).status, 401, 'losing the last role group ends the sign-ins, so the next one asks the identity provider');
  assert.equal((await scim(server.url, `/Groups/${admins.body.id}`, { method: 'DELETE' })).status, 204);
});

test('a SCIM User linked by email waits for the first sign-in with that address', async t => {
  const { server, idp } = await identityBench(t, { linkBy: 'email' });
  const user = (await scim(server.url, '/Users', { method: 'POST', body: { schemas: [userSchema], userName: 'pat', emails: [{ value: 'person@example.com', primary: true }], active: false } })).body;
  assert.equal(user.active, false);
  assert.equal((await signIn(server, idp)).callback.headers.get('location'), '/?login_error=account_disabled', 'an inactive User refuses the sign-in it links to');
  await scim(server.url, `/Users/${user.id}`, { method: 'PATCH', body: { schemas: [patchSchema], Operations: [{ op: 'replace', path: 'active', value: true }] } });
  assert.equal((await signIn(server, idp)).callback.headers.get('location'), '/');
});
