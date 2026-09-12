import { request as httpRequest } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdir, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { captureLocalCandidate, pinCandidateBase, unavailableCandidate, type Candidate } from '../candidates.ts';
import { RuntimeFailure, transportFailure } from '../failures.ts';
import type { AppConfig, Credential, Repository, Session, Workspace } from '../types.ts';
import { cloneProgram, workspaceName } from './kubernetes.ts';
import { gitAccessVariables } from './git-access.ts';
import { WorkerRelay, relayEndpoint } from './relay.ts';

type DockerSettings = NonNullable<AppConfig['docker']>;
type BasicCredentials = { username: string; password: string };
type ContainerSpec = Record<string, any>;
type RelayBinding = { url: string; token: string };

export const relayWorkerPath = '/usr/local/lib/de-vloer/relay-worker.mjs';
export const relayServeCommand = ['node', relayWorkerPath, '--', 'opencode', 'serve', '--hostname', '127.0.0.1', '--port', '4096'];

export const defaultSocketPath = '/var/run/docker.sock';
const containerWorkspace = '/workspace';
const maxLogBytes = 64 * 1024;

export class DockerClient {
  readonly socketPath: string;

  constructor(socketPath = defaultSocketPath) { this.socketPath = socketPath; }

  async request(path: string, method = 'GET', body?: unknown, allowMissing = false, timeoutMs = 30_000): Promise<any> {
    const raw = await this.raw(path, method, body, allowMissing, timeoutMs);
    if (raw === undefined) return undefined;
    if (!raw.length) return {};
    try { return JSON.parse(raw.toString('utf8')); } catch { throw new Error('Docker returned invalid JSON'); }
  }

  raw(path: string, method = 'GET', body?: unknown, allowMissing = false, timeoutMs = 30_000): Promise<Buffer | undefined> {
    return new Promise((done, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = httpRequest({ socketPath: this.socketPath, path, method, headers: { host: 'docker', 'content-type': 'application/json', ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}) } }, response => {
        const chunks: Buffer[] = []; let size = 0;
        response.on('data', chunk => {
          size += chunk.length;
          if (size > 8 * 1024 * 1024) req.destroy(new Error('Docker response is too large'));
          else chunks.push(chunk);
        });
        response.on('end', () => {
          const content = Buffer.concat(chunks);
          if (allowMissing && response.statusCode === 404) { done(undefined); return; }
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            let message = '';
            try { message = String(JSON.parse(content.toString('utf8')).message ?? ''); } catch {}
            reject(new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', response.statusCode, `Docker ${method} ${path.split('?')[0]} returned HTTP ${response.statusCode}${message ? `: ${message}` : ''}`));
            return;
          }
          done(content);
        });
        response.on('error', error => reject(transportFailure(error, 'workspace')));
      });
      req.setTimeout(timeoutMs, () => req.destroy(new RuntimeFailure('timeout', 'workspace')));
      req.on('error', (error: NodeJS.ErrnoException) => reject(['ENOENT', 'EACCES', 'ECONNREFUSED'].includes(error.code ?? '')
        ? new RuntimeFailure('missing_executable', 'workspace', 'not_submitted', undefined, `The Docker Engine socket ${this.socketPath} is unavailable (${error.code})`)
        : new RuntimeFailure('connectivity', 'workspace', 'not_submitted', undefined, `Docker ${method} ${path.split('?')[0]} failed before a response (${error.code ?? error.name})`)));
      req.end(payload);
    });
  }
}

export function demultiplex(stream: Buffer): { stdout: string; stderr: string } {
  const output = { stdout: '', stderr: '' };
  let offset = 0;
  while (offset + 8 <= stream.length) {
    const kind = stream[offset];
    const length = stream.readUInt32BE(offset + 4);
    const frame = stream.subarray(offset + 8, offset + 8 + length).toString('utf8');
    if (kind === 2) output.stderr += frame; else output.stdout += frame;
    offset += 8 + length;
  }
  if (offset < stream.length) output.stdout += stream.subarray(offset).toString('utf8');
  return output;
}

export function agentEnvironment(config: AppConfig, credential: Credential | undefined, basic: BasicCredentials | undefined, managed: Record<string, unknown>, host = process.env): string[] {
  const values: Record<string, string> = {
    HOME: `${containerWorkspace}/.home`, XDG_CONFIG_HOME: `${containerWorkspace}/.home/.config`, XDG_DATA_HOME: `${containerWorkspace}/.state`,
    XDG_CACHE_HOME: `${containerWorkspace}/.cache`, TMPDIR: `${containerWorkspace}/.tmp`, LANG: 'C.UTF-8',
    GIT_TERMINAL_PROMPT: '0', GIT_AUTHOR_NAME: 'De Vloer', GIT_AUTHOR_EMAIL: 'agent@localhost', GIT_COMMITTER_NAME: 'De Vloer', GIT_COMMITTER_EMAIL: 'agent@localhost',
    OPENCODE_CONFIG_CONTENT: JSON.stringify(managed), OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_DISABLE_SHARE: 'true',
  };
  const gateway = config.docker?.gatewayUrl ?? config.litellm?.baseUrl;
  if (gateway) values.LITELLM_BASE_URL = gateway;
  if (credential?.key) values.LITELLM_API_KEY = credential.key;
  if (basic) { values.OPENCODE_SERVER_USERNAME = basic.username; values.OPENCODE_SERVER_PASSWORD = basic.password; }
  for (const name of config.runtime.agentEnvironment ?? []) if (host[name] !== undefined && !(name in values)) values[name] = host[name]!;
  return Object.entries(values).map(([name, value]) => `${name}=${value}`);
}

function hardenedHostConfig(settings: DockerSettings, root: string): ContainerSpec {
  return {
    Binds: [`${root}:${containerWorkspace}`], ReadonlyRootfs: true, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true'],
    Tmpfs: { '/tmp': 'rw,nosuid,size=256m' }, NanoCpus: Math.round((settings.cpus ?? 2) * 1e9), Memory: (settings.memoryMb ?? 4096) * 1024 * 1024,
    MemorySwap: (settings.memoryMb ?? 4096) * 1024 * 1024, PidsLimit: settings.pidsLimit ?? 512, NetworkMode: settings.network ?? 'bridge',
    ExtraHosts: ['host.docker.internal:host-gateway'], RestartPolicy: { Name: 'no' }, Init: true, AutoRemove: false,
  };
}

export function containerSpecs(config: AppConfig, session: Session, repository: Repository, root: string, credential: Credential | undefined, basic: BasicCredentials, managed: Record<string, unknown>, host = process.env, relay?: RelayBinding): { clone: ContainerSpec; agent: ContainerSpec } {
  const settings = config.docker;
  if (!settings) throw new Error('Docker workspace configuration missing');
  const user = settings.user ?? (process.platform === 'linux' && typeof process.getuid === 'function' ? `${process.getuid()}:${process.getgid!()}` : undefined);
  const labels = { 'dev.webgrip.de-vloer/session': workspaceName(session.id), 'dev.webgrip.de-vloer/repository': repository.id };
  const environment = agentEnvironment(config, credential, basic, managed, host);
  const clone = {
    Image: settings.image, Cmd: ['node', '--input-type=module', '-e', cloneProgram], WorkingDir: containerWorkspace, Labels: { ...labels, 'dev.webgrip.de-vloer/purpose': 'clone' },
    Env: [...environment.filter(entry => !/^(LITELLM_API_KEY|OPENCODE_SERVER_)/.test(entry) && !(repository.access && entry.startsWith('GIT_CONFIG_COUNT='))), ...Object.entries(gitAccessVariables(Object.fromEntries(environment.map(entry => [entry.slice(0, entry.indexOf('=')), entry.slice(entry.indexOf('=') + 1)])), repository)).map(([key, value]) => `${key}=${value}`), `REPOSITORY_URL=${repository.url}`, `BASE_BRANCH=${repository.baseBranch}`, `WORK_BRANCH=${session.branch}`],
    HostConfig: hardenedHostConfig(settings, root), ...(user ? { User: user } : {}),
  };
  const agent = relay ? {
    Image: settings.image, Cmd: relayServeCommand, WorkingDir: `${containerWorkspace}/repository`, Labels: { ...labels, 'dev.webgrip.de-vloer/purpose': 'agent', 'dev.webgrip.de-vloer/transport': 'pull' },
    Env: [...environment, `VLOER_RELAY_URL=${relay.url}`, `VLOER_RELAY_TOKEN=${relay.token}`, 'VLOER_RELAY_TARGET=http://127.0.0.1:4096'],
    HostConfig: hardenedHostConfig(settings, root), ...(user ? { User: user } : {}),
  } : {
    Image: settings.image, Cmd: ['opencode', 'serve', '--hostname', '0.0.0.0', '--port', '4096'], WorkingDir: `${containerWorkspace}/repository`, Labels: { ...labels, 'dev.webgrip.de-vloer/purpose': 'agent' },
    Env: environment, ExposedPorts: { '4096/tcp': {} },
    HostConfig: { ...hardenedHostConfig(settings, root), PortBindings: { '4096/tcp': [{ HostIp: '127.0.0.1', HostPort: '' }] } }, ...(user ? { User: user } : {}),
  };
  return { clone, agent };
}

export class DockerWorkspaces {
  readonly config: AppConfig;
  readonly settings: DockerSettings;
  readonly client: DockerClient;
  readonly passwords = new Map<string, BasicCredentials>();
  readonly host: NodeJS.ProcessEnv;
  readonly relay: WorkerRelay;

  constructor(config: AppConfig, client?: DockerClient, host: NodeJS.ProcessEnv = process.env, relay: WorkerRelay = new WorkerRelay()) {
    if (!config.docker) throw new Error('Docker workspace configuration missing');
    this.config = config; this.settings = config.docker; this.host = host; this.relay = relay;
    this.client = client ?? new DockerClient(config.docker.socketPath ?? defaultSocketPath);
  }

  relayUrl(sessionId: string): string {
    const base = this.settings.relayUrl ?? `http://host.docker.internal:${this.config.port}`;
    return `${base.replace(/\/$/, '')}${this.relay.basePath}${sessionId}`;
  }

  credentials(workspace: Workspace): BasicCredentials | undefined { return this.passwords.get(workspace.id); }

  hostDirectory(sessionId: string): string { return resolve(this.config.dataDir, 'workspaces', sessionId); }

  private async inspect(name: string): Promise<ContainerSpec | undefined> {
    return this.client.request(`/containers/${encodeURIComponent(name)}/json`, 'GET', undefined, true);
  }

  private async logs(name: string): Promise<{ stdout: string; stderr: string }> {
    const raw = await this.client.raw(`/containers/${encodeURIComponent(name)}/logs?stdout=1&stderr=1&tail=200`, 'GET', undefined, true).catch(() => undefined);
    const output = demultiplex(raw ?? Buffer.alloc(0));
    return { stdout: output.stdout.slice(-maxLogBytes), stderr: output.stderr.slice(-maxLogBytes) };
  }

  async remove(name: string): Promise<void> {
    await this.client.request(`/containers/${encodeURIComponent(name)}?force=1&v=1`, 'DELETE', undefined, true);
    const until = Date.now() + 40_000;
    while (Date.now() < until) {
      if (!(await this.inspect(name))) return;
      await new Promise(done => setTimeout(done, 250));
    }
    throw new RuntimeFailure('timeout', 'workspace', 'not_submitted', undefined, `Container ${name} was not removed within 40s`);
  }

  async stop(name: string): Promise<boolean> {
    await this.client.request(`/containers/${encodeURIComponent(name)}/stop?t=20`, 'POST', undefined, true, 45_000);
    const until = Date.now() + 40_000;
    while (Date.now() < until) {
      const current = await this.inspect(name);
      if (!current || current.State?.Running === false) return true;
      await new Promise(done => setTimeout(done, 250));
    }
    return false;
  }

  private async runClone(name: string, spec: ContainerSpec, signal: AbortSignal, deadline: number): Promise<string | undefined> {
    await this.remove(name);
    await this.client.request(`/containers/create?name=${encodeURIComponent(name)}`, 'POST', spec);
    try {
      await this.client.request(`/containers/${encodeURIComponent(name)}/start`, 'POST');
      const waited = await this.client.request(`/containers/${encodeURIComponent(name)}/wait`, 'POST', undefined, false, Math.max(1000, deadline - Date.now()));
      signal.throwIfAborted();
      const output = await this.logs(name);
      if (waited?.StatusCode !== 0) throw new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', undefined, `git clone inside ${this.settings.image} exited with code ${waited?.StatusCode ?? 'unknown'}\n${output.stderr}`);
      const record = output.stdout.trim().split('\n').at(-1);
      try { const parsed = JSON.parse(record ?? ''); if (typeof parsed.baseSha === 'string' && /^[a-f0-9]{40}$/.test(parsed.baseSha)) return parsed.baseSha; } catch {}
      return undefined;
    } finally { await this.remove(name).catch(() => {}); }
  }

  async prepare(session: Session, repository: Repository, credential: Credential | undefined, signal: AbortSignal, managed: Record<string, unknown>): Promise<Workspace> {
    const name = workspaceName(session.id);
    const root = this.hostDirectory(session.id);
    await mkdir(root, { recursive: true, mode: 0o700 });
    const basic = { username: 'opencode', password: randomBytes(32).toString('base64url') };
    const pull = this.settings.transport === 'pull';
    const relay = pull ? { url: this.relayUrl(session.id), token: this.relay.register(session.id) } : undefined;
    const specs = containerSpecs(this.config, session, repository, root, credential, basic, managed, this.host, relay);
    const deadline = Date.now() + (this.settings.provisionTimeoutMs ?? 180_000);
    await this.remove(name);
    let baseSha = session.workspace?.metadata?.baseSha;
    let cloned = false;
    try { await access(join(root, 'repository', '.git')); cloned = true; } catch {}
    if (!cloned) baseSha = await this.runClone(`${name}-clone`, specs.clone, signal, deadline) ?? baseSha;
    if (!baseSha) baseSha = await pinCandidateBase(join(root, 'repository')).catch(() => undefined);
    signal.throwIfAborted();
    await this.client.request(`/containers/create?name=${encodeURIComponent(name)}`, 'POST', specs.agent);
    try {
      await this.client.request(`/containers/${encodeURIComponent(name)}/start`, 'POST');
      const authorization = 'Basic ' + Buffer.from(`${basic.username}:${basic.password}`).toString('base64');
      let endpoint: string | undefined;
      const probe = pull ? this.relay.fetcher(session.id) : fetch;
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        const current = await this.inspect(name);
        if (!current || current.State?.Running === false) {
          const output = await this.logs(name);
          throw new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', undefined, `opencode serve inside ${this.settings.image} exited with code ${current?.State?.ExitCode ?? 'unknown'} before answering /global/health\n${output.stderr || output.stdout}`);
        }
        if (pull) {
          if (!this.relay.connected(session.id, 5000)) { await new Promise(done => setTimeout(done, 250)); continue; }
          endpoint = relayEndpoint(session.id);
        } else {
          const port = Number(current.NetworkSettings?.Ports?.['4096/tcp']?.[0]?.HostPort);
          if (!Number.isInteger(port) || port <= 0) { await new Promise(done => setTimeout(done, 250)); continue; }
          endpoint = `http://127.0.0.1:${port}`;
        }
        try {
          const response = await probe((pull ? 'http://workspace' : endpoint) + '/global/health', { headers: { authorization }, signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]), redirect: 'error' });
          if (response.ok) {
            this.passwords.set(session.id, basic);
            return { id: session.id, backend: 'docker', directory: `${containerWorkspace}/repository`, endpoint, metadata: { container: name, image: this.settings.image, hostDirectory: join(root, 'repository'), transport: pull ? 'pull' : 'publish', ...(baseSha ? { baseSha } : {}) } };
          }
        } catch {}
        await new Promise(done => setTimeout(done, 250));
      }
      const output = await this.logs(name);
      throw new RuntimeFailure('timeout', 'workspace', 'not_submitted', undefined, `opencode serve inside ${this.settings.image} did not answer /global/health within ${Math.round((this.settings.provisionTimeoutMs ?? 180_000) / 1000)}s\n${output.stderr || output.stdout}`);
    } catch (error) {
      await this.remove(name).catch(() => {});
      this.passwords.delete(session.id);
      this.relay.unregister(session.id);
      throw error;
    }
  }

  async captureCandidate(session: Session, repository: Repository): Promise<Candidate> {
    const workspace = session.workspace;
    if (!workspace || workspace.backend !== 'docker') return unavailableCandidate('unsupported_workspace');
    const baseSha = workspace.metadata?.baseSha;
    if (!baseSha || !/^[a-f0-9]{40}$/.test(baseSha)) return unavailableCandidate('base_unavailable');
    let stopped = false;
    try { stopped = await this.stop(workspaceName(workspace.id)); } catch { stopped = false; }
    if (!stopped) return unavailableCandidate('stop_unconfirmed');
    return captureLocalCandidate({ dataDir: this.config.dataDir, sessionId: session.id, repositoryId: repository.id, directory: workspace.metadata?.hostDirectory ?? join(this.hostDirectory(session.id), 'repository'), baseSha });
  }

  async dispose(workspace: Workspace): Promise<void> {
    await this.remove(workspaceName(workspace.id));
    this.passwords.delete(workspace.id);
    this.relay.unregister(workspace.id);
  }
}
