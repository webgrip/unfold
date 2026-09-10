import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AppConfig, Credential, Repository, Session, Workspace, WorkspaceBackend } from '../types.ts';
import { KubernetesWorkspaces } from './kubernetes.ts';
import { DockerWorkspaces } from './docker.ts';
import { WorkerRelay } from './relay.ts';
import { RuntimeFailure } from '../failures.ts';
import { captureLocalCandidate, pinCandidateBase, unavailableCandidate, type Candidate } from '../candidates.ts';

type InternalWorkspace = { username: string; password: string; env: Record<string, string>; process?: ChildProcess };

const supervisorProgram = `const{spawn}=require('node:child_process');
const child=spawn(process.argv[1],process.argv.slice(2),{env:process.env,stdio:['ignore','ignore','inherit'],detached:process.platform!=='win32'});
let stopping=false;const stop=()=>{if(stopping)return;stopping=true;try{process.platform==='win32'?child.kill('SIGTERM'):process.kill(-child.pid,'SIGTERM')}catch{};setTimeout(()=>{try{process.platform==='win32'?child.kill('SIGKILL'):process.kill(-child.pid,'SIGKILL')}catch{};process.exit(0)},2000).unref()};
process.stdin.resume();process.stdin.on('end',stop);process.on('SIGTERM',stop);process.on('SIGINT',stop);
child.once('error',error=>{if(process.send)process.send({type:'launch.error',missing:error.code==='ENOENT'||error.code==='EACCES'},()=>process.exit(1));else process.exit(1)});child.once('exit',code=>process.exit(code??1));`;

export function managedConfig(config: AppConfig): Record<string, unknown> {
  const providers: Record<string, any> = {};
  for (const model of config.models) {
    providers[model.providerId] ??= {
      npm: '@ai-sdk/openai-compatible', name: 'Managed LiteLLM',
      options: { baseURL: config.litellm?.baseUrl, apiKey: '{env:LITELLM_API_KEY}' }, models: {},
    };
    providers[model.providerId].models[model.modelId] = { name: model.name };
  }
  const first = config.models[0];
  return {
    provider: providers, enabled_providers: Object.keys(providers),
    ...(first ? { model: `${first.providerId}/${first.modelId}`, small_model: `${first.providerId}/${first.modelId}` } : {}),
    share: 'disabled', autoupdate: false, permission: { '*': 'ask', external_directory: 'deny' },
  };
}

export function isolatedEnvironment(directory: string, credential: Credential | undefined, config: AppConfig, host: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: join(directory, '.home'), XDG_CONFIG_HOME: join(directory, '.home', '.config'),
    XDG_DATA_HOME: join(directory, '.state'), XDG_CACHE_HOME: join(directory, '.cache'),
    TMPDIR: join(directory, '.tmp'), LANG: 'C.UTF-8', GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    OPENCODE_CONFIG_CONTENT: JSON.stringify(managedConfig(config)),
    OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_DISABLE_SHARE: 'true',
  };
  if (config.litellm?.baseUrl) env.LITELLM_BASE_URL = config.litellm.baseUrl;
  if (credential?.key) env.LITELLM_API_KEY = credential.key;
  for (const name of config.runtime.agentEnvironment ?? []) if (host[name] !== undefined && !(name in env)) env[name] = host[name]!;
  return env;
}

export function sessionPlacement(config: AppConfig, session: Pick<Session, 'placement'>): WorkspaceBackend | 'external' {
  const backends = config.runtime.backends ?? (config.runtime.backend === 'external' ? [] : [config.runtime.backend]);
  if (session.placement) {
    if (!backends.includes(session.placement)) throw new Error(`The ${session.placement} workspace backend is not enabled on this workbench`);
    return session.placement;
  }
  return config.runtime.backend;
}

const maxOutputChars = 4096;

function outputTail(): { append(chunk: Buffer | string): void; text(): string } {
  let text = '';
  return {
    append(chunk) { text = (text + String(chunk)).slice(-maxOutputChars); },
    text() { return text; },
  };
}

function withoutServerPaths(text: string, ...paths: string[]): string {
  for (const path of paths) if (path) text = text.split(path).join('<workspace>');
  return text;
}

export function runProcess(binary: string, args: string[], cwd: string, env: Record<string, string>, signal?: AbortSignal): Promise<void> {
  const command = withoutServerPaths([binary, ...args].join(' '), cwd);
  return new Promise((done, reject) => {
    const stderr = outputTail();
    const child = spawn(binary, args, { cwd, env, stdio: ['ignore', 'ignore', 'pipe'], signal });
    child.stderr?.on('data', chunk => stderr.append(chunk));
    child.once('error', (error: NodeJS.ErrnoException) => {
      const missing = ['ENOENT', 'EACCES'].includes(error.code ?? '');
      reject(new RuntimeFailure(missing ? 'missing_executable' : 'workspace_setup', 'workspace', 'not_submitted', undefined, missing ? `${binary} was not found or is not executable on the server PATH (${error.code})` : `${command} could not start (${error.code ?? 'unknown error'})`));
    });
    child.once('exit', (code, signalName) => code === 0 ? done() : reject(new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', undefined, `${command} exited with ${code === null ? `signal ${signalName}` : `code ${code}`}\n${withoutServerPaths(stderr.text(), cwd)}`)));
  });
}

async function unusedPort(): Promise<number> {
  return new Promise((done, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('No workspace port')); return; }
      server.close(error => error ? reject(error) : done(address.port));
    });
  });
}

export class WorkspaceManager {
  readonly config: AppConfig;
  readonly internal = new Map<string, InternalWorkspace>();
  readonly kubernetes?: KubernetesWorkspaces;
  readonly docker?: DockerWorkspaces;
  readonly relay: WorkerRelay;

  constructor(config: AppConfig, options: { docker?: DockerWorkspaces; kubernetes?: KubernetesWorkspaces; relay?: WorkerRelay } = {}) {
    this.config = config;
    this.relay = options.relay ?? new WorkerRelay();
    const backends = config.runtime.backends ?? [config.runtime.backend];
    if (backends.includes('kubernetes')) this.kubernetes = options.kubernetes ?? new KubernetesWorkspaces(config, undefined, this.relay);
    if (backends.includes('docker')) this.docker = options.docker ?? new DockerWorkspaces(config, undefined, process.env, this.relay);
  }

  transport(workspace: Workspace): typeof fetch | undefined {
    return workspace.metadata?.transport === 'pull' ? this.relay.fetcher(workspace.id) : undefined;
  }

  credentials(workspace: Workspace): { username: string; password: string } | undefined {
    const state = this.internal.get(workspace.id);
    if (state) return { username: state.username, password: state.password };
    if (workspace.backend === 'external' && this.config.runtime.password) return {
      username: this.config.runtime.username ?? 'opencode', password: this.config.runtime.password,
    };
    if (workspace.backend === 'docker') return this.docker?.credentials(workspace);
    return this.kubernetes?.credentials(workspace);
  }

  executionEnvironment(workspace: Workspace): Record<string, string> {
    const state = this.internal.get(workspace.id);
    if (!state) throw new Error('Workspace credentials are not available; prepare the workspace first');
    return { ...state.env };
  }

  async prepare(session: Session, repository: Repository, credential: Credential | undefined, signal: AbortSignal): Promise<Workspace> {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(session.id)) throw new Error('Invalid workspace identity');
    const configured = this.config.repositories.find(item => item.id === repository.id);
    if (!configured || configured.url !== repository.url || configured.baseBranch !== repository.baseBranch) throw new Error('Repository is not configured for this workbench');
    const placement = sessionPlacement(this.config, session);
    if (this.config.runtime.kind === 'command' && placement !== 'local') throw new Error('The command adapter requires the local backend');
    if (placement === 'kubernetes') {
      if (!this.kubernetes) throw new Error('The kubernetes workspace backend is not enabled on this workbench');
      return this.kubernetes.prepare(session, configured, credential, signal, managedConfig(this.config));
    }
    if (placement === 'docker') {
      if (!this.docker) throw new Error('The docker workspace backend is not enabled on this workbench');
      return this.docker.prepare(session, configured, credential, signal, managedConfig(this.config));
    }
    if (placement === 'external') {
      if (!this.config.runtime.endpoint || !this.config.runtime.password) throw new Error('External OpenCode requires an endpoint and server password');
      if (credential) throw new Error('External OpenCode cannot receive per-session credentials safely; use local or Kubernetes provisioning');
      return { id: session.id, backend: 'external', directory: '/', endpoint: this.config.runtime.endpoint };
    }
    const root = resolve(this.config.dataDir, 'workspaces', session.id);
    const directory = join(root, 'repository');
    await mkdir(root, { recursive: true, mode: 0o700 });
    const env = isolatedEnvironment(root, credential, this.config);
    for (const path of [env.HOME, env.XDG_CONFIG_HOME, env.XDG_DATA_HOME, env.XDG_CACHE_HOME, env.TMPDIR]) await mkdir(path, { recursive: true, mode: 0o700 });
    let exists = false;
    try { await access(join(directory, '.git')); exists = true; } catch {}
    if (!exists) {
      await runProcess('git', ['clone', '--depth', '100', '--branch', repository.baseBranch, '--', repository.url, directory], root, env, signal);
      await runProcess('git', ['checkout', '-b', session.branch], directory, env, signal);
      await runProcess('git', ['config', 'user.name', 'De Vloer'], directory, env, signal);
      await runProcess('git', ['config', 'user.email', 'agent@localhost'], directory, env, signal);
    }
    const previous = this.internal.get(session.id);
    if (previous?.process) await this.stop(previous.process);
    const state: InternalWorkspace = { username: 'opencode', password: randomBytes(32).toString('base64url'), env };
    this.internal.set(session.id, state);
    const workspace: Workspace = { id: session.id, backend: 'local', directory, metadata: { baseSha: session.workspace?.metadata?.baseSha ?? await pinCandidateBase(directory) } };
    if (this.config.runtime.kind !== 'opencode') return workspace;
    const port = await unusedPort();
    workspace.endpoint = `http://127.0.0.1:${port}`;
    await writeFile(join(root, 'opencode.json'), JSON.stringify(managedConfig(this.config), null, 2), { mode: 0o600 });
    const child = spawn(process.execPath, ['-e', supervisorProgram, this.config.runtime.binary ?? 'opencode', 'serve', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: directory, env: { ...env, OPENCODE_SERVER_USERNAME: state.username, OPENCODE_SERVER_PASSWORD: state.password }, stdio: ['pipe', 'ignore', 'pipe', 'ipc'],
    });
    state.process = child;
    const binary = this.config.runtime.binary ?? 'opencode';
    const stderr = outputTail();
    child.stderr?.on('data', chunk => stderr.append(chunk));
    const launchDetail = (summary: string) => `${summary}\n${withoutServerPaths(stderr.text(), root)}`;
    let launchError = false;
    let missingExecutable = false;
    child.on('error', () => { launchError = true; });
    child.on('message', record => {
      if (record && typeof record === 'object' && 'type' in record && record.type === 'launch.error' && 'missing' in record) missingExecutable = record.missing === true;
    });
    const started = Date.now();
    const deadline = started + Math.min(this.config.runtime.timeoutMs, 120_000);
    try {
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        if (launchError || child.exitCode !== null) throw new RuntimeFailure(missingExecutable ? 'missing_executable' : 'workspace_setup', 'workspace', 'not_submitted', undefined, missingExecutable ? `${binary} was not found or is not executable on the server PATH` : launchDetail(`${binary} serve exited with code ${child.exitCode ?? 'unknown'} before answering /global/health`));
        try {
          const response = await fetch(workspace.endpoint + '/global/health', {
            headers: { authorization: 'Basic ' + Buffer.from(`${state.username}:${state.password}`).toString('base64') },
            signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]), redirect: 'error',
          });
          if (response.ok) return workspace;
        } catch {}
        await new Promise(done => setTimeout(done, 200));
      }
      throw new RuntimeFailure('timeout', 'workspace', 'not_submitted', undefined, launchDetail(`${binary} serve did not answer /global/health within ${Math.round((deadline - started) / 1000)}s`));
    } catch (error) { await this.stop(child); this.internal.delete(session.id); throw error; }
  }

  async stop(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null) return;
    await new Promise<void>(done => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); done(); }, 5000);
      child.once('exit', () => { clearTimeout(timer); done(); });
      child.kill('SIGTERM');
    });
  }

  async captureCandidate(session: Session, repository: Repository): Promise<Candidate> {
    const workspace = session.workspace;
    if (!workspace) return unavailableCandidate('unsupported_workspace');
    if (workspace.backend === 'kubernetes') return this.kubernetes?.captureCandidate(session, repository) ?? unavailableCandidate('unsupported_workspace');
    if (workspace.backend === 'docker') return this.docker?.captureCandidate(session, repository) ?? unavailableCandidate('unsupported_workspace');
    if (workspace.backend !== 'local') return unavailableCandidate('unsupported_workspace');
    const state = this.internal.get(workspace.id);
    if (state?.process) await this.stop(state.process);
    return captureLocalCandidate({ dataDir: this.config.dataDir, sessionId: session.id, repositoryId: repository.id, directory: workspace.directory, baseSha: workspace.metadata?.baseSha ?? '' });
  }

  async interrupt(_workspace: Workspace): Promise<void> {}

  async dispose(workspace: Workspace): Promise<void> {
    const state = this.internal.get(workspace.id);
    if (state?.process) await this.stop(state.process);
    this.internal.delete(workspace.id);
    if (workspace.backend === 'kubernetes') await this.kubernetes?.dispose(workspace);
    if (workspace.backend === 'docker') await this.docker?.dispose(workspace);
  }
}
