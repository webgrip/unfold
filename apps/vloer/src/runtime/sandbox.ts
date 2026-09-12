import { randomBytes } from 'node:crypto';
import { unavailableCandidate, type Candidate } from '../candidates.ts';
import { RuntimeFailure } from '../failures.ts';
import type { AppConfig, Credential, Repository, Session, Workspace } from '../types.ts';
import { KubernetesClient, captureInPlace, cloneProgram, workspaceManifests, workspaceName } from './kubernetes.ts';
import { WorkerRelay, relayEndpoint } from './relay.ts';
import { agentEnvironment, relayServeCommand } from './docker.ts';

type KubernetesObject = Record<string, any>;
type BasicCredentials = { username: string; password: string };
const sandboxApi = '/apis/agents.x-k8s.io/v1beta1';
const claimApi = '/apis/extensions.agents.x-k8s.io/v1beta1';

export function sandboxManifests(config: AppConfig, session: Session, repository: Repository, credential: Credential, basic: BasicCredentials, managed: Record<string, unknown>, relay: { url: string; token: string }): KubernetesObject[] {
  const k = config.kubernetes!;
  const [secret, , networkPolicy, pod] = workspaceManifests(config, session, repository, credential, basic, managed, relay);
  const name = workspaceName(session.id);
  const labels = pod.metadata.labels;
  const spec = { ...pod.spec, runtimeClassName: k.sandbox?.runtimeClassName ?? 'kata', volumes: pod.spec.volumes.filter((volume: KubernetesObject) => volume.name !== 'workspace') };
  const sandbox = { apiVersion: 'agents.x-k8s.io/v1beta1', kind: 'Sandbox', metadata: { name, namespace: k.namespace, labels }, spec: {
    podTemplate: { metadata: { labels }, spec },
    volumeClaimTemplates: [{ metadata: { name: 'workspace' }, spec: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: k.storageSize } }, ...(k.storageClass ? { storageClassName: k.storageClass } : {}) } }],
    service: false, shutdownPolicy: 'Retain',
  } };
  return [secret, networkPolicy, sandbox];
}

export function sandboxClaimManifest(config: AppConfig, session: Session): KubernetesObject {
  const k = config.kubernetes!;
  const name = workspaceName(session.id);
  return { apiVersion: 'extensions.agents.x-k8s.io/v1beta1', kind: 'SandboxClaim', metadata: { name, namespace: k.namespace, labels: { 'app.kubernetes.io/name': 'de-vloer-agent', 'de-vloer/session': name } }, spec: {
    warmPoolRef: { name: k.sandbox!.warmPool }, lifecycle: { shutdownPolicy: 'Delete' },
  } };
}

export class SandboxWorkspaces {
  readonly config: AppConfig;
  readonly client: KubernetesClient;
  readonly relay: WorkerRelay;
  readonly passwords = new Map<string, BasicCredentials>();
  readonly tokens = new Map<string, string>();
  readonly pods = new Map<string, string>();

  constructor(config: AppConfig, client?: KubernetesClient, relay: WorkerRelay = new WorkerRelay()) {
    if (!config.kubernetes?.sandbox) throw new Error('Sandbox provisioner configuration missing');
    if (config.kubernetes.transport !== 'pull' || !config.kubernetes.relayUrl) throw new Error('The sandbox provisioner requires kubernetes.transport pull and kubernetes.relayUrl');
    this.config = config; this.relay = relay;
    this.client = client ?? new KubernetesClient(config.kubernetes);
    const poolToken = process.env[config.kubernetes.sandbox.poolTokenEnv ?? 'VLOER_POOL_TOKEN'];
    if (config.kubernetes.sandbox.warmPool) {
      if (!poolToken) throw new Error(`kubernetes.sandbox.warmPool requires the pool token in ${config.kubernetes.sandbox.poolTokenEnv ?? 'VLOER_POOL_TOKEN'}`);
      relay.configurePool(poolToken);
    }
  }

  credentials(workspace: Workspace): BasicCredentials | undefined { return this.passwords.get(workspace.id); }

  private path(kind: 'Sandbox' | 'SandboxClaim' | 'Secret' | 'NetworkPolicy', name?: string): string {
    const namespace = this.config.kubernetes!.namespace;
    const base = kind === 'Sandbox' ? `${sandboxApi}/namespaces/${namespace}/sandboxes` : kind === 'SandboxClaim' ? `${claimApi}/namespaces/${namespace}/sandboxclaims` : kind === 'Secret' ? `/api/v1/namespaces/${namespace}/secrets` : `/apis/networking.k8s.io/v1/namespaces/${namespace}/networkpolicies`;
    return name ? `${base}/${name}` : base;
  }

  private binding(sessionId: string): { url: string; token: string } {
    let token = this.tokens.get(sessionId);
    if (!token) { token = this.relay.register(sessionId); this.tokens.set(sessionId, token); }
    return { url: `${this.config.kubernetes!.relayUrl!.replace(/\/$/, '')}${this.relay.basePath}${sessionId}`, token };
  }

  private async apply(object: KubernetesObject): Promise<void> {
    const existing = await this.client.request(this.path(object.kind, object.metadata.name), 'GET', undefined, true);
    if (existing) { object.metadata.resourceVersion = existing.metadata.resourceVersion; await this.client.request(this.path(object.kind, object.metadata.name), 'PUT', object); }
    else await this.client.request(this.path(object.kind), 'POST', object);
  }

  async prepare(session: Session, repository: Repository, credential: Credential | undefined, signal: AbortSignal, managed: Record<string, unknown>): Promise<Workspace> {
    if (!credential) throw new Error('Sandbox workspaces require a budgeted credential');
    const k = this.config.kubernetes!;
    const name = workspaceName(session.id);
    const basic = { username: 'opencode', password: randomBytes(32).toString('base64url') };
    const relay = this.binding(session.id);
    const deadline = Date.now() + (k.provisionTimeoutMs ?? 180_000);
    try {
      let baseSha = session.workspace?.metadata?.baseSha;
      if (k.sandbox?.warmPool) {
        await this.apply(sandboxClaimManifest(this.config, session));
        let pod: string | undefined;
        while (Date.now() < deadline && !pod) {
          signal.throwIfAborted();
          const claim = await this.client.request(this.path('SandboxClaim', name));
          const failed = claim.status?.conditions?.find((item: any) => item.type === 'Ready' && item.status === 'False' && ['WarmPoolNotFound', 'ClaimExpired'].includes(item.reason));
          if (failed) throw new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', undefined, `SandboxClaim ${name} cannot be satisfied: ${failed.reason}`);
          pod = claim.status?.sandbox?.name ?? claim.metadata?.annotations?.['agents.x-k8s.io/sandbox-name'];
          if (!pod) await new Promise(done => setTimeout(done, 500));
        }
        if (!pod) throw new RuntimeFailure('timeout', 'workspace', 'not_submitted', undefined, `No warm sandbox was bound to ${name} in time`);
        this.pods.set(session.id, pod);
        const env = Object.fromEntries(agentEnvironment(this.config, credential, basic, managed, process.env).map(entry => entry.split(/=(.*)/s).slice(0, 2)));
        this.relay.assign(pod, { sessionId: session.id, token: relay.token, env: { ...env, REPOSITORY_URL: repository.url, BASE_BRANCH: repository.baseBranch, WORK_BRANCH: session.branch, VLOER_RELAY_TARGET: 'http://127.0.0.1:4096' } });
        await this.relay.waitForWorker(session.id, signal, Math.max(1000, deadline - Date.now()));
        const transport = this.relay.fetcher(session.id);
        const control = async (path: string, body: unknown, timeoutMs: number) => { const response = await transport(`http://workspace${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) }); if (!response.ok) throw new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', undefined, `Warm sandbox control ${path} returned HTTP ${response.status}`); return response.json() as Promise<any>; };
        const cloned = await control('/__vloer/exec', { argv: ['node', '--input-type=module', '-e', cloneProgram] }, Math.max(5000, deadline - Date.now()));
        if (cloned.exitCode !== 0) throw new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', undefined, `git clone inside the warm sandbox exited with code ${cloned.exitCode}\n${cloned.stderr ?? ''}`);
        try { const record = JSON.parse(String(cloned.stdout ?? '').trim().split('\n').at(-1) ?? ''); if (/^[a-f0-9]{40}$/.test(record.baseSha)) baseSha = record.baseSha; } catch {}
        await control('/__vloer/run', { argv: relayServeCommand.slice(3) }, 15_000);
      } else {
        for (const object of sandboxManifests(this.config, session, repository, credential, basic, managed, relay)) { signal.throwIfAborted(); await this.apply(object); }
        while (Date.now() < deadline) {
          signal.throwIfAborted();
          const sandbox = await this.client.request(this.path('Sandbox', name));
          const ready = sandbox.status?.conditions?.some((item: any) => item.type === 'Ready' && item.status === 'True');
          const finished = sandbox.status?.conditions?.some((item: any) => item.type === 'Finished' && item.status === 'True');
          if (finished) throw new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', undefined, `Sandbox ${name} finished before it became ready`);
          if (ready && this.relay.connected(session.id, 5000)) break;
          await new Promise(done => setTimeout(done, 500));
        }
        if (!this.relay.connected(session.id, 5000)) throw new RuntimeFailure('timeout', 'workspace', 'not_submitted', undefined, `Sandbox ${name} did not connect to the relay in time`);
      }
      const authorization = 'Basic ' + Buffer.from(`${basic.username}:${basic.password}`).toString('base64');
      const transport = this.relay.fetcher(session.id);
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        try { const health = await transport('http://workspace/global/health', { headers: { authorization }, signal: AbortSignal.timeout(2000) }); if (health.ok) break; } catch {}
        await new Promise(done => setTimeout(done, 500));
      }
      this.passwords.set(session.id, basic);
      return { id: session.id, backend: 'kubernetes', directory: '/workspace/repository', endpoint: relayEndpoint(session.id), metadata: { namespace: k.namespace, pod: this.pods.get(session.id) ?? name, provisioner: 'sandbox', transport: 'pull', runtimeClassName: k.sandbox?.runtimeClassName ?? 'kata', ...(baseSha ? { baseSha } : {}) } };
    } catch (error) {
      await this.dispose({ id: session.id, backend: 'kubernetes', directory: '/workspace/repository' }).catch(() => {});
      throw error;
    }
  }

  async captureCandidate(session: Session, repository: Repository): Promise<Candidate> {
    const workspace = session.workspace;
    const basic = workspace ? this.passwords.get(workspace.id) : undefined;
    if (!workspace || !basic) return unavailableCandidate('unsupported_workspace');
    const baseSha = workspace.metadata?.baseSha;
    if (!baseSha || !/^[a-f0-9]{40}$/.test(baseSha)) return unavailableCandidate('base_unavailable');
    return captureInPlace(this.relay, this.config, session, repository, basic, baseSha);
  }

  async dispose(workspace: Workspace): Promise<void> {
    const name = workspaceName(workspace.id);
    const pod = this.pods.get(workspace.id);
    if (pod) this.relay.unassign(pod);
    await this.client.request(this.path('SandboxClaim', name), 'DELETE', undefined, true);
    await this.client.request(this.path('Sandbox', name), 'DELETE', undefined, true);
    for (const kind of ['Secret', 'NetworkPolicy'] as const) await this.client.request(this.path(kind, name), 'DELETE', undefined, true);
    this.passwords.delete(workspace.id); this.tokens.delete(workspace.id); this.pods.delete(workspace.id);
    this.relay.unregister(workspace.id);
  }
}
