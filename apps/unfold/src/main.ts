import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, adoptRenamedDatabase } from './store.ts';
import { Engine } from './engine.ts';
import { DemoRuntime } from './runtime/demo.ts';
import { OpenCodeRuntime } from './runtime/opencode.ts';
import { CommandRuntime } from './runtime/command.ts';
import { WorkspaceManager } from './runtime/workspace.ts';
import { WorkerRelay, storedCredentials } from './runtime/relay.ts';
import { AgentHost } from './ahp/host.ts';
import { LiteLLMBroker } from './broker.ts';
import { Links } from './links.ts';
import { Oidc } from './oidc.ts';
import { buildServer } from './http.ts';
import { loadConfig, requirePloegExecution } from './config.ts';
import { knownSecrets } from './redaction.ts';
import { ErrorReporter } from './error-reports.ts';
import type { AppConfig, AgentRuntime, RuntimeKind } from './types.ts';

export async function createApplication(config: AppConfig, options: { runtimes?: Map<RuntimeKind, AgentRuntime> | ((relay: WorkerRelay) => Map<RuntimeKind, AgentRuntime>) } = {}) {
  const errors = new ErrorReporter(config.errorReports, knownSecrets(config));
  const databasePath = join(config.dataDir, 'unfold.sqlite');
  const adopted = adoptRenamedDatabase(databasePath);
  if (adopted) console.error(JSON.stringify({ level: 'info', event: 'store.renamed', message: `Moved the database from ${adopted} to ${databasePath}.` }));
  const store = new Store(databasePath);
  const relay = new WorkerRelay(storedCredentials(store));
  const runtimes = typeof options.runtimes === 'function' ? options.runtimes(relay) : options.runtimes || new Map<RuntimeKind, AgentRuntime>();
  if (!options.runtimes) {
    if (config.mode === 'demo') runtimes.set('demo', new DemoRuntime(config));
    else {
      const workspaces = new WorkspaceManager(config, { relay });
      if (config.runtime.kind === 'opencode') runtimes.set('opencode', new OpenCodeRuntime(config, workspaces));
      if (config.runtime.kind === 'command') runtimes.set('command', new CommandRuntime(config, workspaces));
    }
  }
  const broker = config.mode === 'live' && config.litellm?.masterKey && !config.execution ? new LiteLLMBroker(config.litellm) : undefined;
  const links = new Links(store, config);
  const engine = new Engine(store, config, runtimes, broker, links);
  engine.recover();
  const agentHost = new AgentHost(config, store, engine);
  const { server, cards, tripwire, closeStreams, stopInsight, reports } = buildServer(config, store, engine, [...runtimes.keys()], relay, agentHost, links, new Oidc(config), errors);
  server.on('upgrade', (req, socket, head) => { if (!agentHost.handleUpgrade(req, socket, head)) socket.destroy(); });
  let closed = false;
  const cardTimers: NodeJS.Timeout[] = [];
  function startCardSweeps() {
    if (!cards) return;
    const sweep = () => { void cards.sweep().catch(error => console.error(JSON.stringify({ level: 'warn', event: 'cards.sweep_failed', message: String(error?.message ?? error).slice(0, 200) }))); };
    cardTimers.push(setTimeout(sweep, 30_000).unref(), setInterval(sweep, 300_000).unref());
  }
  async function close() {
    if (closed) return;
    closed = true;
    for (const timer of cardTimers) clearTimeout(timer);
    agentHost.close();
    closeStreams();
    stopInsight();
    await engine.shutdown();
    relay.close();
    if (server.listening) await new Promise<void>((done) => { server.close(() => done()); server.closeIdleConnections(); });
    store.close();
    await errors.flush();
  }
  return { server, store, engine, agentHost, reports, errors, tripwire, close, startCardSweeps };
}

async function main() {
  const config = loadConfig();
  requirePloegExecution(config);
  if (config.mode === 'live' && !config.repositories.length) throw new Error('Configure at least one repository with --config config/live.example.json. For the credential-free demonstration, run npm run demo.');
  const app = await createApplication(config);
  if (config.mode === 'live' && !app.store.getUserByName(config.auth.bootstrapName)) {
    await app.close();
    throw new Error('Set UNFOLD_ADMIN_PASSWORD to a password of at least 12 characters for the first launch, or create an account with npm run user:add.');
  }
  app.startCardSweeps();
  app.tripwire.start();
  app.server.listen(config.port, config.host, () => {
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : config.port;
    console.log(JSON.stringify({ level: 'info', event: 'server.ready', mode: config.mode, url: config.baseUrl || `http://${config.host}:${port}`, message: config.mode === 'demo' ? 'Local demonstration. Real code verification; no model calls.' : 'Authenticated remote agent workbench.' }));
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
  process.on('unhandledRejection', reason => app.errors.capture(reason, { level: 'error', tags: { feature: 'process', source: 'unhandledRejection' } }));
  process.on('uncaughtException', error => {
    console.error(JSON.stringify({ level: 'error', event: 'process.crashed', message: String(error?.message ?? error).slice(0, 300) }));
    app.errors.capture(error, { level: 'fatal', tags: { feature: 'process', source: 'uncaughtException' } });
    void app.errors.flush().finally(() => process.exit(1));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(JSON.stringify({ level: 'error', event: 'startup.failed', message: error.message })); process.exitCode = 1; });
}
