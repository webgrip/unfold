import test from 'node:test';
import assert from 'node:assert/strict';
import { application, createSession, login, request, sessionUntil } from './api-support.ts';
import { RuntimeFailure } from '../src/failures.ts';
import type { AgentRuntime, RuntimeKind } from '../src/types.ts';

test('a failed session writes one server log line naming the session, its category, stage and cause', async t => {
  const runtime: AgentRuntime = {
    kind: 'opencode',
    prepare: async session => ({ id: session.id, backend: 'external', directory: '/repository', endpoint: 'https://runtime.fixture.invalid' }),
    execute: async () => { throw new RuntimeFailure('harness_rejected', 'execution', 'accepted', 400, 'GET /permission answered HTTP 400'); },
    interrupt: async () => {}, dispose: async () => {},
  };
  const server = await application('live', config => { config.runtime.briefCheck = false; }, new Map<RuntimeKind, AgentRuntime>([['opencode', runtime]]));
  t.after(() => server.close());
  server.app.engine.broker = { mint: async session => ({ key: 'scoped-key-that-must-not-be-logged', alias: 'alias', reference: `reference-${session.id}`, budgetUsd: session.budgetUsd }), revoke: async () => {}, spend: async () => 0 };
  const auth = await login(server.url);
  const logged: string[] = [];
  const original = console.error;
  console.error = (...line: unknown[]) => { logged.push(line.map(String).join(' ')); };
  t.after(() => { console.error = original; });
  const session = await createSession(server.url, { cookie: auth.cookie, overrides: { runtime: 'opencode' } });
  assert.equal((await request(server.url, `/api/sessions/${session.id}/start`, { method: 'POST', cookie: auth.cookie })).status, 200);
  await sessionUntil(server.url, session.id, value => value.status === 'failed', auth.cookie);
  const lines = logged.filter(line => line.includes('"event":"session.failed"')).map(line => JSON.parse(line));
  assert.equal(lines.length, 1, logged.join('\n'));
  assert.equal(lines[0].session, session.id);
  assert.equal(lines[0].category, 'harness_rejected');
  assert.equal(lines[0].stage, 'execution');
  assert.equal(lines[0].role, 'Builder');
  assert.match(lines[0].detail, /GET \/permission answered HTTP 400/);
  assert.equal(logged.join('\n').includes('scoped-key-that-must-not-be-logged'), false);
});
