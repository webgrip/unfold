import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';
import { validateTaskSources } from '../src/tasks.ts';
import { repositoryKey } from '../src/tenancy.ts';
import type { Repository } from '../src/types.ts';

const repository = (id: string, url: string, owner: { tenant?: string; client?: string } = {}): Repository => ({ id, name: id, description: '', url, baseBranch: 'main', verify: [], ...owner });
const source = (id: string, repositoryId: string, extra: Record<string, unknown> = {}) => ({ id, name: id, provider: 'vikunja', baseUrl: 'https://tracker.example/api/v1', project: '42', repositoryId, executionOwner: 'ploeg', ...extra });

async function load(t: test.TestContext, value: Record<string, unknown>) {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-tenant-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'config.json');
  await writeFile(file, JSON.stringify({ mode: 'live', dataDir: join(directory, 'data'), models: [{ id: 'coding', name: 'Coding', providerId: 'gateway', modelId: 'coding' }], ...value }));
  return loadConfig(['--config', file]);
}

test('a repository key is the forge host and owner/name, shared by its HTTPS and SSH URLs', () => {
  assert.equal(repositoryKey('https://Forge.example/Team/Orders.git'), 'forge.example/team/orders');
  assert.equal(repositoryKey('ssh://git@forge.example:2222/team/orders.git'), 'forge.example/team/orders');
  assert.equal(repositoryKey('git@forge.example:team/orders.git'), 'forge.example/team/orders');
  assert.notEqual(repositoryKey('https://forge.example/team/orders.git'), repositoryKey('https://other.example/team/orders.git'));
  assert.equal(repositoryKey('/srv/checkouts/orders/'), 'path:/srv/checkouts/orders');
});

test('repositories and task sources take an optional tenant and client, and leave both out when unset', async t => {
  const config = await load(t, {
    repositories: [repository('orders', 'https://forge.example/team/orders.git', { tenant: 'agency', client: 'acme' }), repository('site', 'https://forge.example/team/site.git')],
    taskSources: [{ ...source('board', 'orders', { tenant: 'agency', client: 'acme' }), executionOwner: 'interactive' }, { ...source('plain', 'site', { project: '7' }), executionOwner: 'interactive' }],
  });
  assert.deepEqual(config.repositories.map(({ tenant, client }) => ({ tenant, client })), [{ tenant: 'agency', client: 'acme' }, { tenant: undefined, client: undefined }]);
  assert.deepEqual(config.taskSources!.map(({ tenant, client }) => ({ tenant, client })), [{ tenant: 'agency', client: 'acme' }, { tenant: undefined, client: undefined }]);
  assert.ok(!('tenant' in config.taskSources![1]) && !('client' in config.taskSources![1]), 'an entry without tenant or client keeps its previous shape');
});

test('a tenant or client that is not an id stops startup', async t => {
  for (const owner of [{ tenant: 'Agency' }, { client: '' }, { tenant: 'a/b' }, { client: 7 }]) {
    await assert.rejects(load(t, { repositories: [{ ...repository('orders', 'https://forge.example/team/orders.git'), ...owner }] }), /repositories\[0\] \(orders\) (tenant|client) must be lower-case/);
  }
  assert.throws(() => validateTaskSources([source('board', 'orders', { tenant: 'UPPER' })], [repository('orders', 'https://forge.example/team/orders.git')], 'live'), /taskSources\[0\] \(board\) tenant must be lower-case/);
});

test('one repository registered for two owners stops startup and names both entries', async t => {
  await assert.rejects(load(t, { repositories: [repository('orders', 'https://forge.example/team/orders.git', { tenant: 'agency-a' }), repository('orders-b', 'https://FORGE.example/Team/orders', { tenant: 'agency-b' })] }),
    /repositories\[0\] \(orders\) and repositories\[1\] \(orders-b\) register the same repository forge\.example\/team\/orders for different owners \(Tenant agency-a; Tenant agency-b\)/);
  await assert.rejects(load(t, { repositories: [repository('orders', 'https://forge.example/team/orders.git', { client: 'acme' }), repository('orders-b', 'https://forge.example/team/orders.git')] }), /for different owners \(Tenant default, Client acme; Tenant default\)/);
  const same = await load(t, { repositories: [repository('orders', 'https://forge.example/team/orders.git'), repository('orders-release', 'https://forge.example/team/orders.git', { tenant: 'default' })] });
  assert.equal(same.repositories.length, 2, 'two entries for one repository and one owner still load, as before');
});

test('a task source maps only to a repository of its own Tenant, and to a Client repository only from that Client', () => {
  const repositories = [repository('shared', 'https://forge.example/agency/shared.git', { tenant: 'agency' }), repository('acme', 'https://forge.example/agency/acme.git', { tenant: 'agency', client: 'acme' })];
  assert.throws(() => validateTaskSources([source('board', 'shared')], repositories, 'live'), /taskSources\[0\] \(board\) is owned by Tenant default, but its repository shared is owned by Tenant agency/);
  assert.throws(() => validateTaskSources([source('board', 'acme', { tenant: 'agency' })], repositories, 'live'), /owned by Tenant agency, but its repository acme is owned by Tenant agency, Client acme/);
  assert.throws(() => validateTaskSources([source('board', 'acme', { tenant: 'agency', client: 'other' })], repositories, 'live'), /Client other/);
  assert.equal(validateTaskSources([source('board', 'acme', { tenant: 'agency', client: 'acme' })], repositories, 'live')[0].client, 'acme');
  assert.equal(validateTaskSources([source('board', 'shared', { tenant: 'agency', client: 'acme' })], repositories, 'live')[0].client, 'acme', "a Client's source may use a repository of its Tenant that no Client owns");
});

test('one tracker project registered for two owners stops startup, naming both entries, while same-owner aliases and other instances still load', () => {
  const repositories = [repository('orders', 'https://forge.example/team/orders.git', { tenant: 'agency' }), repository('other', 'https://forge.example/team/other.git', { tenant: 'agency' })];
  const board = source('board', 'orders', { tenant: 'agency', client: 'acme' });
  assert.throws(() => validateTaskSources([board, { ...board, id: 'alias', client: 'globex' }], repositories, 'live'),
    /Aliases of a task source must use the same repository, execution owner, Tenant and Client: taskSources\[0\] \(board\) and taskSources\[1\] \(alias\) both read vikunja 42 at https:\/\/tracker\.example\/api\/v1/);
  assert.throws(() => validateTaskSources([board, { ...board, id: 'alias', client: undefined }], repositories, 'live'), /Aliases/);
  assert.equal(validateTaskSources([board, { ...board, id: 'alias', name: 'Another label' }], repositories, 'live').length, 2);
  const elsewhere = validateTaskSources([board, { ...board, id: 'other-instance', baseUrl: 'https://tracker.other.example/api/v1', repositoryId: 'other', client: 'globex' }], repositories, 'live');
  assert.deepEqual(elsewhere.map(entry => entry.client), ['acme', 'globex'], 'the same project id on another tracker instance is another source');
});
