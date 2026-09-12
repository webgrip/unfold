import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { defaultCrews } from '../src/config.ts';
import { SigningKey } from '../src/attestations.ts';
import { Engine } from '../src/engine.ts';
import { buildServer } from '../src/http.ts';
import { DemoRuntime } from '../src/runtime/demo.ts';
import { Store } from '../src/store.ts';
import type { AppConfig, Session } from '../src/types.ts';

class EphemeralDemoEngine extends Engine {
  private readonly localSigningKey = new SigningKey(generateKeyPairSync('ed25519').privateKey);
  override signing(): SigningKey { return this.localSigningKey; }
}

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: mise exec -- node scripts/unified-demo.ts [--smoke]\nRequires sibling ../ploeg, Go 1.25+, PostgreSQL 17+ binaries and Git.\nPLOEG_PATH overrides the sibling checkout. PG_BIN overrides the PostgreSQL binary directory.\nVLOER_DEMO_PORT selects the loopback workbench port (default: an available port).\nCtrl+C stops both applications and PostgreSQL, then removes temporary data.');
} else {
  if (args.some(arg => arg !== '--smoke')) throw new Error('Unknown option; use --help.');
  await main(args.includes('--smoke'));
}

async function main(smoke: boolean) {
  if (process.platform === 'win32' || process.getuid?.() === 0) throw new Error('Run as a regular macOS or Linux user; PostgreSQL cannot run as root.');
  const ploegPath = resolve(process.env.PLOEG_PATH || join(root, '../ploeg'));
  assert.ok((await stat(join(ploegPath, 'go.mod'))).isFile(), 'PLOEG_PATH must point to the matching Ploeg checkout.');
  const port = Number(process.env.VLOER_DEMO_PORT || 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('VLOER_DEMO_PORT must be an integer between 0 and 65535.');
  const binary = (name: string) => process.env.PG_BIN ? join(process.env.PG_BIN, name) : name;
  const environment = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LC_ALL: 'C' };
  const token = randomBytes(32).toString('hex');
  const priorToken = process.env.VLOER_UNIFIED_DEMO_TOKEN;
  process.env.VLOER_UNIFIED_DEMO_TOKEN = token;
  const directory = await mkdtemp(join(tmpdir(), 'vloer-local-'));
  const databaseDir = join(directory, 'db');
  const socketDir = join(directory, 'socket');
  const children: { child: ChildProcess; done: Promise<number | null>; output: () => string }[] = [];
  let app: { server: ReturnType<typeof buildServer>['server']; closeStreams: () => void; store: Store; engine: Engine } | undefined;
  let closing = false;
  let stopped = false;
  let fail: (reason: Error) => void = () => undefined;
  let stop: () => void = () => undefined;
  const lifetime = new Promise<void>((resolveLifetime, reject) => { stop = resolveLifetime; fail = reject; });
  void lifetime.catch(() => undefined);
  const onSignal = () => { stopped = true; stop(); };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  function child(binaryPath: string, argv: string[], cwd: string, env: NodeJS.ProcessEnv = environment) {
    if (stopped) throw new Error('Local demonstration startup interrupted.');
    const processChild = spawn(binaryPath, argv, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const append = (chunk: Buffer) => { output = (output + chunk.toString()).split(token).join('[redacted]').slice(-24000); };
    processChild.stdout!.on('data', append); processChild.stderr!.on('data', append);
    const done = new Promise<number | null>((resolveDone, reject) => { processChild.once('error', reject); processChild.once('close', resolveDone); });
    void done.catch(() => undefined);
    const result = { child: processChild, done, output: () => output };
    children.push(result);
    return result;
  }
  async function command(binaryPath: string, argv: string[], cwd = root) {
    const run = child(binaryPath, argv, cwd);
    const exit = await run.done;
    if (exit !== 0) throw new Error(`${binaryPath} failed (${exit}): ${run.output()}`);
    if (stopped) throw new Error('Local demonstration startup interrupted.');
    return run.output();
  }
  async function until(read: () => boolean | Promise<boolean>, label: string, timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (!await read()) {
      if (stopped) throw new Error('Local demonstration interrupted.');
      if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
      await delay(30);
    }
  }
  try {
    console.log('LOCAL DEMONSTRATION: real Ploeg authority and PostgreSQL; deterministic fixture runtime; no model calls or spend.');
    await command('git', ['--version']);
    await command('go', ['version'], ploegPath);
    await command(binary('postgres'), ['--version']);
    console.log('Building the Ploeg HTTP helper from the sibling checkout…');
    const helper = join(directory, 'ploeg-demo');
    await command('go', ['build', '-o', helper, join(root, 'scripts/unified-demo/main.go')], ploegPath);
    await mkdir(socketDir, { mode: 0o700 });
    await command(binary('initdb'), ['-D', databaseDir, '-U', 'ploeg_demo', '--auth-local=trust', '--auth-host=reject', '--no-instructions']);
    const postgres = child(binary('postgres'), ['-D', databaseDir, '-k', socketDir, '-h', '', '-p', '5432'], root);
    void postgres.done.then(code => { if (!closing) fail(new Error(`Temporary PostgreSQL stopped (${code}): ${postgres.output()}`)); }, fail);
    const databaseUrl = new URL('postgresql:///postgres');
    databaseUrl.searchParams.set('host', socketDir);
    databaseUrl.searchParams.set('user', 'ploeg_demo');
    const ploeg = child(helper, [], root, { ...environment, VLOER_DEMO_DATABASE_URL: databaseUrl.toString(), VLOER_UNIFIED_DEMO_TOKEN: token });
    void ploeg.done.then(code => { if (!closing) fail(new Error(`Ploeg stopped (${code}): ${ploeg.output()}`)); }, fail);
    let upstream = '';
    await Promise.race([until(() => {
      for (const line of ploeg.output().split('\n')) {
        try { const ready = JSON.parse(line); if (ready.event === 'ploeg.ready') upstream = ready.url; } catch {}
      }
      return Boolean(upstream);
    }, 'Ploeg and temporary PostgreSQL readiness'), lifetime.then(() => { throw new Error('Startup interrupted.'); })]);
    assert.equal(new URL(upstream).hostname, '127.0.0.1');
    const ready = await fetch(`${upstream}/readyz`, { signal: AbortSignal.timeout(5000) });
    assert.equal(ready.status, 200, 'Ploeg database readiness');
    const config: AppConfig = {
      mode: 'demo', dataDir: join(directory, 'vloer'), publicDir: join(root, 'public'), host: '127.0.0.1', port,
      repositories: [{ id: 'order-service', name: 'Order service · local fixture', description: 'Deterministic code repair with real checks. No external repository, model, delivery gate or publication.', url: join(root, 'examples/order-service'), baseBranch: 'main', verify: ['node', '--test'], executionOwner: 'ploeg' }],
      crews: defaultCrews.filter(crew => crew.id === 'delivery'), models: [],
      runtime: { kind: 'demo', backend: 'local', timeoutMs: 120000, briefCheck: false },
      auth: { secureCookies: false, sessionHours: 1, bootstrapName: 'admin' }, maxConcurrentSessions: 2, maxBudgetUsd: 1,
      ploeg: { url: upstream, tokenEnv: 'VLOER_UNIFIED_DEMO_TOKEN', teams: ['delivery'] }, execution: { team: 'delivery', heartbeatMs: 1000 },
    };
    const store = new Store(':memory:');
    const runtime = new DemoRuntime({ dataDir: config.dataDir, delayMs: smoke ? 100 : 5000 });
    const engine = new EphemeralDemoEngine(store, config, new Map([['demo', runtime]]));
    app = { ...buildServer(config, store, engine, ['demo']), store, engine };
    await new Promise<void>((resolveListen, reject) => { app!.server.once('error', reject); app!.server.listen(port, '127.0.0.1', resolveListen); });
    const address = app.server.address(); assert(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    async function request(path: string, body?: object): Promise<any> {
      const response = await fetch(`${base}/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { origin: base, 'x-vloer-request': '1', ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      const result = await response.json(); assert(response.ok, `${path}: HTTP ${response.status} ${JSON.stringify(result)}`); return result;
    }
    const queued: Session = await request('sessions', { title: 'Local shared execution · no model calls', objective: 'Fix the supplied order-service rounding fixture, run its real checks, and independently review the actual patch. This deterministic demonstration publishes nothing.', repositoryId: 'order-service', crewId: 'delivery', runtime: 'demo', budgetUsd: 1 });
    console.log(JSON.stringify({ event: 'unified-demo.ready', url: base, sessionUrl: `${base}/#session/${queued.id}`, ploegUrl: upstream, dataDir: directory, pid: process.pid, database: 'private Unix socket only', storage: 'temporary PostgreSQL and in-memory workbench state', modelCalls: 0, spendUsd: 0, deliveryGate: 'not configured', cleanup: 'Ctrl+C or SIGTERM stops all services and removes the temporary directory' }));
    console.log(`Open ${base}/#session/${queued.id}\nPress Start, then try background supervision, take control, pause and resume.\nThe fixture takes about 30 seconds. Review its actual patch and checks, then open its Ploeg Work Item.\nDelivery approval and publication are not configured. Ctrl+C cleans up all test state.`);
    if (smoke) {
      const started: Session = await request(`sessions/${queued.id}/start`, {});
      assert.ok(started.execution);
      await request(`sessions/${queued.id}/supervision`, { supervision: 'background' });
      await until(() => app!.store.getSession(queued.id)?.execution?.state === 'completed', 'deterministic shared execution completed');
      const completed: Session = await request(`sessions/${queued.id}`);
      assert.equal(completed.status, 'completed'); assert.equal(completed.execution!.id, started.execution.id);
      assert.equal(completed.execution!.supervision, 'background'); assert.equal(completed.spentUsd, 0); assert.equal(completed.costStatus, 'demo'); assert.equal(completed.candidate?.status, 'ready');
      for (const [name, exit] of [['Baseline checks (expected failure)', 1], ['Verification checks', 0], ['Independent review checks', 0]] as const) assert.match(completed.artifacts.find(artifact => artifact.name === name)!.content, new RegExp(`Exit code: ${exit}`));
      const response = await fetch(`${upstream}/api/v1/operator/work-items/${completed.execution!.workItemId}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200); const detail = await response.json() as any;
      assert.equal(detail.item.id, completed.execution!.workItemId); assert.equal(detail.item.state, 'done'); assert.equal(detail.runs.length, 1);
      assert.deepEqual((await readdir(directory, { recursive: true })).filter(path => /(?:\.key|pwfile)$/.test(path)), [], 'The local demonstration must not write credential or private-key files.');
      console.log(JSON.stringify({ event: 'unified-demo.smoke-passed', ok: true, workItemId: detail.item.id, executionId: completed.execution!.id, checks: ['real failing baseline', 'real patch and passing verification', 'independent passing review', 'same execution after background handback', 'one Ploeg operator Run'], modelCalls: 0, spendUsd: 0, publication: 'not configured' }));
    } else await lifetime;
  } finally {
    closing = true;
    try {
      if (app) {
        app.closeStreams();
        await app.engine.shutdown();
        await new Promise<void>(done => { app!.server.close(() => done()); app!.server.closeAllConnections(); });
        app.store.close();
      }
    } finally {
      for (const processChild of [...children].reverse()) {
        if (processChild.child.exitCode === null && processChild.child.signalCode === null) processChild.child.kill('SIGTERM');
        await Promise.race([processChild.done.catch(() => undefined), delay(10000, undefined, { ref: false })]);
        if (processChild.child.exitCode === null && processChild.child.signalCode === null) { processChild.child.kill('SIGKILL'); await processChild.done.catch(() => undefined); }
      }
      await rm(directory, { recursive: true, force: true });
      if (priorToken === undefined) delete process.env.VLOER_UNIFIED_DEMO_TOKEN; else process.env.VLOER_UNIFIED_DEMO_TOKEN = priorToken;
      process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
      console.log(JSON.stringify({ event: 'unified-demo.stopped', removedDataDir: directory, modelCalls: 0, spendUsd: 0 }));
    }
  }
}
