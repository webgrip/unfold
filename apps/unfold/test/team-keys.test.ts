import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';
import { Store } from '../src/store.ts';
import { parseCard } from '../src/ploeg.ts';
import { cardView } from '../public/cards/card-model.js';
import { application, createInput, request } from './api-support.ts';
import { testTimeout } from './timeframes.ts';

const base = {
  mode: 'live',
  models: [{ id: 'coding', name: 'Coding', providerId: 'gateway', modelId: 'coding' }],
  repositories: [{ id: 'app', name: 'App', description: '', url: 'https://forge.example/app.git', baseBranch: 'main', verify: ['npm', 'test'] }],
};
const review = { id: 'review', name: 'Review', description: 'One reader', roles: [{ id: 'reader', name: 'Reader', mode: 'read', instruction: 'Read the change.' }] };
const audit = { ...review, id: 'audit', name: 'Audit' };

async function load(t: test.TestContext, value: Record<string, unknown>) {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-team-keys-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'config.json');
  await writeFile(file, JSON.stringify({ ...base, dataDir: join(directory, 'data'), ...value }));
  return loadConfig(['--config', file]);
}

test('configuration reads teams, still reads the retired crews, and refuses both when they list different Teams', async t => {
  assert.deepEqual((await load(t, { teams: [review] })).teams.map(team => team.id), ['review']);
  assert.deepEqual((await load(t, { crews: [review] })).teams.map(team => team.id), ['review']);
  assert.deepEqual((await load(t, { teams: [review], crews: [review] })).teams.map(team => team.id), ['review']);
  await assert.rejects(load(t, { teams: [review], crews: [audit] }), /Set teams only/);
});

test('a session stored before the rename reads with teamId, and keeps crewId beside it for one release', () => {
  const store = new Store(':memory:');
  const now = new Date().toISOString();
  const stored = { id: 'before-rename', title: 'Old', objective: 'Stored before the rename.', repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', ownerId: 'admin', ownerName: 'Admin', status: 'completed', budgetUsd: 1, spentUsd: 0, costStatus: 'demo', createdAt: now, updatedAt: now, branch: 'operator/before-rename', runs: [], artifacts: [] };
  store.db.prepare('INSERT INTO sessions(id,owner_id,updated_at,body) VALUES(?,?,?,?)').run(stored.id, stored.ownerId, now, JSON.stringify(stored));
  const session = store.getSession(stored.id)!;
  assert.equal(session.teamId, 'delivery');
  assert.equal(session.crewId, 'delivery');
  const row = store.db.prepare('SELECT body FROM sessions WHERE id=?').get(stored.id) as { body: string };
  assert.equal(JSON.parse(row.body).teamId, undefined, 'reading never rewrites the stored row');
});

test('the API takes teamId or the retired crewId, answers with both, and refuses two different Teams', { timeout: testTimeout(15_000) }, async t => {
  const server = await application();
  t.after(() => server.close());
  const bootstrap = await request(server.url, '/api/bootstrap');
  assert.ok(bootstrap.body.teams.length > 0);
  assert.deepEqual(bootstrap.body.crews, bootstrap.body.teams, 'bootstrap sends the retired crews beside teams for one release');

  const current = await request(server.url, '/api/sessions', { method: 'POST', body: createInput() });
  assert.equal(current.status, 201, current.text);
  assert.deepEqual([current.body.teamId, current.body.crewId], ['delivery', 'delivery']);

  const { teamId: _unused, ...withoutTeam } = createInput();
  const older = await request(server.url, '/api/sessions', { method: 'POST', body: { ...withoutTeam, crewId: 'delivery' } });
  assert.equal(older.status, 201, older.text);
  assert.deepEqual([older.body.teamId, older.body.crewId], ['delivery', 'delivery']);

  const both = await request(server.url, '/api/sessions', { method: 'POST', body: createInput({ crewId: 'delivery' }) });
  assert.equal(both.status, 201, both.text);

  const conflicting = await request(server.url, '/api/sessions', { method: 'POST', body: createInput({ crewId: 'investigation' }) });
  assert.equal(conflicting.status, 400, conflicting.text);
  assert.equal(conflicting.body.error.code, 'team_conflict');

  const listed = await request(server.url, '/api/sessions');
  assert.ok(listed.body.every((session: { teamId: string; crewId: string }) => session.teamId === 'delivery' && session.crewId === 'delivery'));
});

test('a card names its Roles under roles, reads a stored card that still says crew, and sends crew beside roles for one release', () => {
  const stored = { workItemId: '42', title: 'Round the totals', team: 'delivery', state: 'merged', crew: [{ role: 'builder', writes: true, runs: 2 }] };
  const card = parseCard(stored);
  assert.deepEqual(card.roles, [{ role: 'builder', writes: true, runs: 2 }]);
  assert.deepEqual(card.crew, card.roles);
  assert.deepEqual(parseCard({ ...stored, crew: undefined, roles: stored.crew }).roles, card.roles);
  assert.equal(cardView(stored).roles, 'builder ×2', 'the browser reads a card stored with crew only');
});
