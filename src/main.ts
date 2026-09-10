import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.ts';
import { Engine } from './engine.ts';
import { DemoRuntime } from './runtime/demo.ts';
import { OpenCodeRuntime } from './runtime/opencode.ts';
import { CommandRuntime } from './runtime/command.ts';
import { WorkspaceManager } from './runtime/workspace.ts';
import { WorkerRelay } from './runtime/relay.ts';
import { LiteLLMBroker } from './broker.ts';
import { buildServer } from './http.ts';
import { loadConfig } from './config.ts';
import type { AppConfig, AgentRuntime, RuntimeKind } from './types.ts';

export async function createApplication(config: AppConfig, options: { runtimes?: Map<RuntimeKind, AgentRuntime> } = {}) {
  const store = new Store(join(config.dataDir, 'vloer.sqlite'));
  const runtimes = options.runtimes || new Map<RuntimeKind, AgentRuntime>();
  const relay = new WorkerRelay();
  if (!options.runtimes) {
    if (config.mode === 'demo') runtimes.set('demo', new DemoRuntime(config));
    else {
      const workspaces = new WorkspaceManager(config, { relay });
      if (config.runtime.kind === 'opencode') runtimes.set('opencode', new OpenCodeRuntime(config, workspaces));
      if (config.runtime.kind === 'command') runtimes.set('command', new CommandRuntime(config, workspaces));
    }
  }
  const broker = config.mode === 'live' && config.litellm ? new LiteLLMBroker(config.litellm) : undefined;
  const engine = new Engine(store, config, runtimes, broker);
  engine.recover();
  const { server, closeStreams } = buildServer(config, store, engine, [...runtimes.keys()], relay);
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    closeStreams();
    await engine.shutdown();
    if (server.listening) await new Promise<void>((done) => { server.close(() => done()); server.closeIdleConnections(); });
    store.close();
  }
  return { server, store, engine, close };
}

async function main() {
  const config = loadConfig();
  if (config.mode === 'live' && !config.repositories.length) throw new Error('Configure at least one repository with --config config/live.example.json. For the credential-free demonstration, run npm run demo.');
  const app = await createApplication(config);
  if (config.mode === 'live' && !app.store.getUserByName(config.auth.bootstrapName)) {
    await app.close();
    throw new Error('Set VLOER_ADMIN_PASSWORD to a password of at least 12 characters for the first launch, or create an account with npm run user:add.');
  }
  app.server.listen(config.port, config.host, () => {
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : config.port;
    console.log(JSON.stringify({ level: 'info', event: 'server.ready', mode: config.mode, url: config.baseUrl || `http://${config.host}:${port}`, message: config.mode === 'demo' ? 'Local demonstration. Real code verification; no model calls.' : 'Authenticated remote agent workbench.' }));
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(JSON.stringify({ level: 'error', event: 'startup.failed', message: error.message })); process.exitCode = 1; });
}
