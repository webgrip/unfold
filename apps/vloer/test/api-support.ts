import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import type { Server } from 'node:http';
import { createApplication } from '../src/main.ts';
import type { AgentRuntime, AppConfig, Event, RuntimeKind, Session } from '../src/types.ts';

export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

export function configuration(dataDir: string, mode: 'demo' | 'live' = 'demo'): AppConfig {
  return {
    mode,
    host: '127.0.0.1',
    port: 0,
    dataDir,
    publicDir: join(repositoryRoot, 'public'),
    repositories: [{ id: 'order-service', name: 'Order service', description: 'Order rounding verification fixture', url: 'demo://order-service', baseBranch: 'main', verify: ['node', '--test', 'test/order.test.js'] }],
    crews: [{ id: 'delivery', name: 'Delivery crew', description: 'One implementation followed by independent review', roles: [
      { id: 'builder', name: 'Builder', mode: 'write', instruction: 'Fix the order rounding regression and verify the repository.' },
      { id: 'reviewer', name: 'Reviewer', mode: 'read', instruction: 'Review the diff and verify the checks.' },
    ] }],
    models: [{ id: 'coding', name: 'Coding', providerId: 'litellm', modelId: 'coding' }],
    runtime: { kind: mode === 'demo' ? 'demo' : 'opencode', backend: 'local', timeoutMs: 30_000 },
    auth: { secureCookies: false, sessionHours: 1, bootstrapName: 'admin', ...(mode === 'live' ? { bootstrapPassword: 'test-admin-password-314159' } : {}) },
    maxConcurrentSessions: 3,
    maxBudgetUsd: 25,
  };
}

export async function application(mode: 'demo' | 'live' = 'demo', configure?: (config: AppConfig) => void, runtimes?: Map<RuntimeKind, AgentRuntime>) {
  const dataDir = await mkdtemp(join(tmpdir(), 'vloer-api-'));
  const config = configuration(dataDir, mode);
  configure?.(config);
  let app = await createApplication(config, runtimes ? { runtimes } : undefined);
  let url = await listen(app.server);
  return {
    config,
    get app() { return app; },
    get url() { return url; },
    async restart() {
      await app.close();
      app = await createApplication(config, runtimes ? { runtimes } : undefined);
      url = await listen(app.server);
    },
    async close() {
      await app.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

export async function request(url: string, path: string, options: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string>; csrf?: boolean } = {}) {
  const body = options.body ?? (options.method === 'POST' ? {} : undefined);
  const headers: Record<string, string> = { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.csrf === false ? {} : { 'x-vloer-request': '1' }), ...options.headers };
  const response = await fetch(`${url}${path}`, { method: options.method ?? 'GET', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  let parsedBody: any;
  try { parsedBody = JSON.parse(text); } catch { parsedBody = text; }
  return { response, status: response.status, body: parsedBody, text };
}

export async function login(url: string, name = 'admin', password = 'test-admin-password-314159') {
  const result = await request(url, '/api/login', { method: 'POST', body: { name, password } });
  assert.equal(result.status, 200, result.text);
  const setCookie = result.response.headers.get('set-cookie');
  assert(setCookie, 'successful login must set an authenticated session cookie');
  return { cookie: setCookie.split(';')[0], setCookie, user: result.body.user };
}

export function createInput(overrides: Record<string, unknown> = {}) {
  return { title: 'Correct the order rounding', objective: 'Fix the order rounding regression and provide the actual verification result.', repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 3, ...overrides };
}

export async function createSession(url: string, options: { cookie?: string; overrides?: Record<string, unknown> } = {}): Promise<Session> {
  const result = await request(url, '/api/sessions', { method: 'POST', cookie: options.cookie, body: createInput(options.overrides) });
  assert([200, 201].includes(result.status), result.text);
  assert.equal(typeof result.body.id, 'string');
  return result.body;
}

export async function sessionUntil(url: string, id: string, accepts: (session: Session) => boolean, cookie?: string): Promise<Session> {
  const deadline = Date.now() + 20_000;
  let last: Session | undefined;
  while (Date.now() < deadline) {
    const result = await request(url, `/api/sessions/${id}`, { cookie });
    assert.equal(result.status, 200, result.text);
    last = result.body;
    if (last && accepts(last)) return last;
    await delay(40);
  }
  assert.fail(`session did not reach the expected state: ${JSON.stringify(last)}`);
}

export async function replay(url: string, id: string, after: number, count: number, cookie?: string): Promise<Event[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  const events: Event[] = [];
  try {
    const response = await fetch(`${url}/api/sessions/${id}/events?after=${after}`, { signal: controller.signal, headers: cookie ? { cookie } : {} });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    assert(response.body);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (events.length < count) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true }).replaceAll('\r\n', '\n');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const eventId = frame.match(/^id:\s*(\d+)$/m);
        const payload = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!eventId || !payload) continue;
        const event = JSON.parse(payload) as Event;
        assert.equal(Number(eventId[1]), event.id);
        assert.equal(event.sessionId, id);
        events.push(event);
      }
    }
    assert.equal(events.length, count, 'SSE must replay all retained events after the cursor');
    return events;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
