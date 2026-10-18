import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenCodeRuntime, type RuntimeWorkspaces } from '../src/runtime/opencode.ts';
import { managedConfig } from '../src/runtime/workspace.ts';
import type { AppConfig, RuntimeEvent, Workspace } from '../src/types.ts';
import { executionFixture } from './runtime-fixture.ts';

const binary = process.env.UNFOLD_OPENCODE_BINARY;
const skip = binary ? false : 'set UNFOLD_OPENCODE_BINARY to an OpenCode binary, or run `mise run opencode-contract`';
const password = 'contract-secret';

async function listen(server: Server): Promise<number> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  return (server.address() as { port: number }).port;
}

function modelThatGreps() {
  const requests: Array<{ tools: number; toolResults: number }> = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body || '{}');
    const toolResults = (parsed.messages ?? []).filter((message: { role?: string }) => message.role === 'tool').length;
    requests.push({ tools: (parsed.tools ?? []).length, toolResults });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const base = { id: `chunk-${requests.length}`, object: 'chat.completion.chunk', created: 1, model: 'coding' };
    const send = (delta: Record<string, unknown>, finish: string | null = null) => res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
    if (!toolResults && (parsed.tools ?? []).length) {
      send({ role: 'assistant', content: 'I will read the README.' });
      send({ tool_calls: [{ index: 0, id: 'call_grep', type: 'function', function: { name: 'grep', arguments: JSON.stringify({ pattern: 'Run the unit tests' }) } }] });
      send({}, 'tool_calls');
    } else {
      send({ role: 'assistant', content: 'The README says: run the unit tests with pnpm test.' });
      send({}, 'stop');
    }
    res.end('data: [DONE]\n\n');
  });
  return { server, requests };
}

async function opencode(t: TestContext, permission: Record<string, string>) {
  const model = modelThatGreps();
  const modelPort = await listen(model.server);
  const root = mkdtempSync(join(tmpdir(), 'unfold-opencode-contract-'));
  const directory = join(root, 'repository');
  mkdirSync(directory);
  writeFileSync(join(directory, 'README.md'), 'Run the unit tests with pnpm test.\n');
  execFileSync('git', ['init', '-q'], { cwd: directory });
  execFileSync('git', ['-c', 'user.email=contract@unfold.invalid', '-c', 'user.name=contract', 'commit', '-q', '--allow-empty', '-m', 'base'], { cwd: directory });
  const config = { models: [{ id: 'coding', name: 'Coding', providerId: 'litellm', modelId: 'coding' }], litellm: { baseUrl: `http://127.0.0.1:${modelPort}/v1` }, runtime: { timeoutMs: 60_000 } } as AppConfig;
  const managed = { ...managedConfig(config), permission };
  writeFileSync(join(root, 'opencode.json'), JSON.stringify(managed));
  const server = createServer();
  const port = await listen(server);
  await new Promise<void>(resolve => server.close(() => resolve()));
  const env = { PATH: process.env.PATH ?? '', HOME: join(root, '.home'), XDG_DATA_HOME: join(root, '.state'), XDG_CONFIG_HOME: join(root, '.home', '.config'), XDG_CACHE_HOME: process.env.UNFOLD_OPENCODE_CACHE ?? join(root, '.cache'), OPENCODE_CONFIG: join(root, 'opencode.json'), OPENCODE_CONFIG_CONTENT: JSON.stringify(managed), OPENCODE_SERVER_USERNAME: 'opencode', OPENCODE_SERVER_PASSWORD: password, OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_DISABLE_SHARE: 'true', LITELLM_API_KEY: 'contract-key' };
  const child = spawn(binary!, ['serve', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout!.on('data', chunk => { output += chunk; });
  child.stderr!.on('data', chunk => { output += chunk; });
  t.after(() => { child.kill('SIGKILL'); model.server.close(); rmSync(root, { recursive: true, force: true }); });
  const endpoint = `http://127.0.0.1:${port}`;
  const authorization = 'Basic ' + Buffer.from(`opencode:${password}`).toString('base64');
  const deadline = Date.now() + 30_000;
  let healthy = false;
  while (!healthy && Date.now() < deadline) {
    healthy = await fetch(`${endpoint}/global/health`, { headers: { authorization }, signal: AbortSignal.timeout(2000) }).then(response => response.ok, () => false);
    if (!healthy) await new Promise(done => setTimeout(done, 200));
  }
  assert.ok(healthy, `OpenCode never answered /global/health:\n${output}`);
  const workspace: Workspace = { id: 'contract', backend: 'local', directory, endpoint };
  const workspaces: RuntimeWorkspaces = { prepare: async () => workspace, credentials: () => ({ username: 'opencode', password }), executionEnvironment: () => ({}), dispose: async () => {} };
  return { runtime: new OpenCodeRuntime(config, workspaces), workspace, model, output: () => output };
}

function turn(workspace: Workspace, events: RuntimeEvent[]) {
  const context = executionFixture({ runtime: 'opencode', role: { id: 'implementer', name: 'Implementer', mode: 'write', instruction: 'Say how to run the unit tests.' }, workspace, verify: ['git', 'diff', '--check'], prompt: 'Say how to run the unit tests in the README.', signal: AbortSignal.timeout(90_000), emit: event => { events.push(event); } });
  context.session.approval = 'manual';
  return context;
}

test('the managed OpenCode configuration lets a supervised writer grep without asking', { skip, timeout: 120_000 }, async t => {
  const { runtime, workspace, model, output } = await opencode(t, managedConfig({ models: [], runtime: { timeoutMs: 1 } } as unknown as AppConfig).permission as Record<string, string>);
  const events: RuntimeEvent[] = [];
  const result = await runtime.execute(turn(workspace, events));
  assert.match(result.summary, /pnpm test/, output());
  assert.equal(events.some(event => event.type === 'permission'), false, 'grep is a read-only tool and must not ask');
  assert.ok(model.requests.some(request => request.toolResults > 0), 'the grep tool ran and its result reached the model');
});

test('a permission OpenCode raises reaches Unfold, its answer reaches OpenCode, and the turn completes', { skip, timeout: 120_000 }, async t => {
  const { runtime, workspace, model, output } = await opencode(t, { '*': 'ask', external_directory: 'deny' });
  const events: RuntimeEvent[] = [];
  const context = turn(workspace, events);
  context.emit = event => {
    events.push(event);
    if (event.type === 'permission') void runtime.respond(workspace, { id: 'local', sessionId: 'session', runId: 'run', nativeId: String(event.data.nativeId), kind: 'permission', title: String(event.data.title), detail: '' }, { decision: 'once' });
  };
  const result = await runtime.execute(context);
  assert.match(result.summary, /pnpm test/, output());
  const asked = events.find(event => event.type === 'permission');
  assert.equal(asked?.data.title, 'Allow grep?');
  assert.ok(events.some(event => event.type === 'permission.resolved' && event.data.nativeId === asked?.data.nativeId), 'Unfold saw OpenCode accept the answer');
  assert.ok(model.requests.some(request => request.toolResults > 0), 'the approved grep ran and its result reached the model');
});
