import { request as httpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { RuntimeFailure, transportFailure } from '../failures.ts';
import type { AppConfig, Credential, Repository, Session, Workspace } from '../types.ts';

type KubernetesConfig = NonNullable<AppConfig['kubernetes']> & {
  ingressFrom?: Record<string, unknown>[]; egress?: Record<string, unknown>[];
  gitSecretName?: string; imagePullSecrets?: string[]; provisionTimeoutMs?: number;
};

type BasicCredentials = { username: string; password: string };
type KubernetesObject = Record<string, any>;

export function workspaceName(sessionId: string): string {
  return 'vloer-' + createHash('sha256').update(sessionId).digest('hex').slice(0, 24);
}

export class KubernetesClient {
  readonly config: KubernetesConfig;

  constructor(config: KubernetesConfig) { this.config = config; }

  async request(path: string, method = 'GET', body?: unknown, allowMissing = false): Promise<any> {
    const origin = this.config.apiUrl ?? `https://${process.env.KUBERNETES_SERVICE_HOST ?? 'kubernetes.default.svc'}:${process.env.KUBERNETES_SERVICE_PORT_HTTPS ?? '443'}`;
    const url = new URL(path, origin);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Kubernetes API requires HTTPS');
    const [token, ca] = await Promise.all([
      readFile(this.config.tokenFile ?? '/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf8'),
      readFile(this.config.caFile ?? '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'),
    ]);
    return new Promise((done, reject) => {
      const req = httpsRequest(url, { method, ca, headers: {
        authorization: `Bearer ${token.trim()}`, 'content-type': 'application/json',
      } }, response => {
        let size = 0;
        const chunks: Buffer[] = [];
        response.on('data', chunk => {
          size += chunk.length;
          if (size > 4 * 1024 * 1024) req.destroy(new Error('Kubernetes response is too large'));
          else chunks.push(chunk);
        });
        response.on('end', () => {
          if (allowMissing && response.statusCode === 404) { done(undefined); return; }
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new RuntimeFailure('workspace_setup', 'workspace')); return;
          }
          try { done(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
          catch { reject(new Error('Kubernetes returned invalid JSON')); }
        });
        response.on('error', error => reject(transportFailure(error, 'workspace')));
      });
      req.setTimeout(10_000, () => req.destroy(new RuntimeFailure('timeout', 'workspace')));
      req.on('error', error => reject(transportFailure(error, 'workspace')));
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
}

const cloneProgram = `import{mkdirSync,existsSync}from'node:fs';import{spawnSync}from'node:child_process';
const env={...process.env,GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
const run=(a)=>{const r=spawnSync('git',a,{env,stdio:'ignore'});if(r.status!==0)process.exit(1)};
mkdirSync('/workspace',{recursive:true});
if(!existsSync('/workspace/repository/.git')){run(['clone','--depth','100','--branch',env.BASE_BRANCH,'--',env.REPOSITORY_URL,'/workspace/repository']);run(['-C','/workspace/repository','checkout','-b',env.WORK_BRANCH]);}
for(const p of['.home','.state','.cache','.tmp'])mkdirSync('/workspace/'+p,{recursive:true});`;

const askpassProgram = '#!/usr/bin/env node\nprocess.stdout.write((process.argv[2]??" ").toLowerCase().includes("username")?process.env.GIT_USERNAME??"":process.env.GIT_PASSWORD??"");\n';

const healthProgram = `fetch('http://127.0.0.1:4096/global/health',{headers:{authorization:'Basic '+Buffer.from(process.env.OPENCODE_SERVER_USERNAME+':'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64')},signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`;

export function workspaceManifests(config: AppConfig, session: Session, repository: Repository, credential: Credential, basic: BasicCredentials, managed: Record<string, unknown>): KubernetesObject[] {
  if (!config.kubernetes) throw new Error('Kubernetes workspace configuration missing');
  const k = config.kubernetes as KubernetesConfig;
  const name = workspaceName(session.id);
  const labels = { 'app.kubernetes.io/name': 'de-vloer-agent', 'de-vloer/session': name };
  const metadata = { name, namespace: k.namespace, labels };
  const secret = {
    apiVersion: 'v1', kind: 'Secret', metadata, type: 'Opaque',
    stringData: { LITELLM_API_KEY: credential.key, OPENCODE_SERVER_USERNAME: basic.username, OPENCODE_SERVER_PASSWORD: basic.password, 'opencode.json': JSON.stringify(managed), askpass: askpassProgram },
  };
  const pvc = { apiVersion: 'v1', kind: 'PersistentVolumeClaim', metadata, spec: {
    accessModes: ['ReadWriteOnce'], resources: { requests: { storage: k.storageSize } },
    ...(k.storageClass ? { storageClassName: k.storageClass } : {}),
  } };
  const valueFrom = (key: string) => ({ secretKeyRef: { name, key } });
  const env = [
    { name: 'LITELLM_API_KEY', valueFrom: valueFrom('LITELLM_API_KEY') },
    { name: 'LITELLM_BASE_URL', value: config.litellm?.baseUrl ?? '' },
    { name: 'OPENCODE_SERVER_USERNAME', valueFrom: valueFrom('OPENCODE_SERVER_USERNAME') },
    { name: 'OPENCODE_SERVER_PASSWORD', valueFrom: valueFrom('OPENCODE_SERVER_PASSWORD') },
    { name: 'OPENCODE_CONFIG', value: '/etc/opencode/opencode.json' },
    { name: 'OPENCODE_CONFIG_CONTENT', valueFrom: valueFrom('opencode.json') },
    { name: 'HOME', value: '/workspace/.home' }, { name: 'XDG_DATA_HOME', value: '/workspace/.state' },
    { name: 'XDG_CONFIG_HOME', value: '/workspace/.home/.config' }, { name: 'XDG_CACHE_HOME', value: '/workspace/.cache' },
    { name: 'TMPDIR', value: '/workspace/.tmp' }, { name: 'GIT_TERMINAL_PROMPT', value: '0' },
    { name: 'OPENCODE_DISABLE_AUTOUPDATE', value: 'true' }, { name: 'OPENCODE_DISABLE_SHARE', value: 'true' },
  ];
  const securityContext = { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] }, seccompProfile: { type: 'RuntimeDefault' } };
  const pod = { apiVersion: 'v1', kind: 'Pod', metadata, spec: {
    automountServiceAccountToken: false, enableServiceLinks: false, restartPolicy: 'Never', terminationGracePeriodSeconds: 30,
    securityContext: { fsGroup: 1000, fsGroupChangePolicy: 'OnRootMismatch', seccompProfile: { type: 'RuntimeDefault' } },
    ...(k.imagePullSecrets?.length ? { imagePullSecrets: k.imagePullSecrets.map(name => ({ name })) } : {}),
    initContainers: [{ name: 'clone', image: k.image, imagePullPolicy: k.pullPolicy ?? 'IfNotPresent', securityContext,
      command: ['node', '--input-type=module', '-e', cloneProgram], env: [
        { name: 'REPOSITORY_URL', value: repository.url }, { name: 'BASE_BRANCH', value: repository.baseBranch }, { name: 'WORK_BRANCH', value: session.branch },
        ...(k.gitSecretName ? [
          { name: 'GIT_ASKPASS', value: '/clone-auth/askpass' },
          { name: 'GIT_USERNAME', valueFrom: { secretKeyRef: { name: k.gitSecretName, key: 'username' } } },
          { name: 'GIT_PASSWORD', valueFrom: { secretKeyRef: { name: k.gitSecretName, key: 'password' } } },
        ] : []),
      ], volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }, { name: 'clone-auth', mountPath: '/clone-auth', readOnly: true }],
      resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: k.cpu, memory: k.memory } },
    }],
    containers: [{ name: 'agent', image: k.image, imagePullPolicy: k.pullPolicy ?? 'IfNotPresent', securityContext,
      command: ['opencode', 'serve', '--hostname', '0.0.0.0', '--port', '4096'], workingDir: '/workspace/repository', env,
      ports: [{ name: 'http', containerPort: 4096 }],
      startupProbe: { exec: { command: ['node', '-e', healthProgram] }, periodSeconds: 2, failureThreshold: 90, timeoutSeconds: 3 },
      readinessProbe: { exec: { command: ['node', '-e', healthProgram] }, periodSeconds: 10, timeoutSeconds: 3 },
      resources: { requests: { cpu: k.cpu, memory: k.memory }, limits: { cpu: k.cpu, memory: k.memory } },
      volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }, { name: 'config', mountPath: '/etc/opencode', readOnly: true }, { name: 'tmp', mountPath: '/tmp' }],
    }],
    volumes: [ { name: 'workspace', persistentVolumeClaim: { claimName: name } },
      { name: 'config', secret: { secretName: name, items: [{ key: 'opencode.json', path: 'opencode.json' }], defaultMode: 292 } },
      { name: 'clone-auth', secret: { secretName: name, items: [{ key: 'askpass', path: 'askpass' }], defaultMode: 365 } }, { name: 'tmp', emptyDir: { sizeLimit: '256Mi' } } ],
  } };
  const service = { apiVersion: 'v1', kind: 'Service', metadata, spec: { type: 'ClusterIP', selector: labels, ports: [{ name: 'http', port: 4096, targetPort: 4096 }] } };
  const networkPolicy = { apiVersion: 'networking.k8s.io/v1', kind: 'NetworkPolicy', metadata, spec: {
    podSelector: { matchLabels: labels }, policyTypes: ['Ingress', 'Egress'],
    ingress: [{ from: k.ingressFrom ?? [{ podSelector: { matchLabels: { 'app.kubernetes.io/name': 'de-vloer' } } }], ports: [{ protocol: 'TCP', port: 4096 }] }],
    egress: [ { to: [{ namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'kube-system' } }, podSelector: { matchLabels: { 'k8s-app': 'kube-dns' } } }], ports: [{ protocol: 'UDP', port: 53 }, { protocol: 'TCP', port: 53 }] }, ...(k.egress ?? []) ],
  } };
  return [secret, pvc, service, networkPolicy, pod];
}

export class KubernetesWorkspaces {
  readonly config: AppConfig;
  readonly kube: KubernetesConfig;
  readonly client: KubernetesClient;
  readonly passwords = new Map<string, BasicCredentials>();

  constructor(config: AppConfig, client?: KubernetesClient) {
    if (!config.kubernetes) throw new Error('Kubernetes workspace configuration missing');
    this.config = config; this.kube = config.kubernetes as KubernetesConfig;
    this.client = client ?? new KubernetesClient(this.kube);
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(this.kube.namespace)) throw new Error('Invalid workspace namespace');
  }

  credentials(workspace: Workspace): BasicCredentials | undefined { return this.passwords.get(workspace.id); }

  path(kind: string, name?: string): string {
    const resource = ({ Secret: 'secrets', Pod: 'pods', Service: 'services', PersistentVolumeClaim: 'persistentvolumeclaims', NetworkPolicy: 'networkpolicies' } as Record<string, string>)[kind];
    if (!resource) throw new Error('Unsupported workspace resource');
    return `${kind === 'NetworkPolicy' ? '/apis/networking.k8s.io/v1' : '/api/v1'}/namespaces/${this.kube.namespace}/${resource}${name ? '/' + name : ''}`;
  }

  async removePod(name: string): Promise<void> {
    await this.client.request(this.path('Pod', name), 'DELETE', { gracePeriodSeconds: 20 }, true);
    const until = Date.now() + 40_000;
    while (Date.now() < until) {
      if (!(await this.client.request(this.path('Pod', name), 'GET', undefined, true))) return;
      await new Promise(done => setTimeout(done, 300));
    }
    throw new RuntimeFailure('timeout', 'workspace');
  }

  async prepare(session: Session, repository: Repository, credential: Credential | undefined, signal: AbortSignal, managed: Record<string, unknown>): Promise<Workspace> {
    if (!credential) throw new Error('Kubernetes workspaces require a budgeted credential');
    const name = workspaceName(session.id);
    const basic = { username: 'opencode', password: randomBytes(32).toString('base64url') };
    await this.removePod(name);
    const manifests = workspaceManifests(this.config, session, repository, credential, basic, managed);
    try {
      for (const object of manifests) {
        signal.throwIfAborted();
        const existing = await this.client.request(this.path(object.kind, name), 'GET', undefined, true);
        if (existing && object.kind === 'PersistentVolumeClaim') continue;
        if (existing) {
          object.metadata.resourceVersion = existing.metadata.resourceVersion;
          if (object.kind === 'Service') object.spec.clusterIP = existing.spec.clusterIP;
          await this.client.request(this.path(object.kind, name), 'PUT', object);
        } else await this.client.request(this.path(object.kind), 'POST', object);
      }
      const deadline = Date.now() + (this.kube.provisionTimeoutMs ?? 180_000);
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        const pod = await this.client.request(this.path('Pod', name));
        if (pod.status?.phase === 'Failed' || pod.status?.phase === 'Succeeded') throw new Error('Workspace agent exited before readiness');
        if (pod.status?.conditions?.some((item: any) => item.type === 'Ready' && item.status === 'True')) {
          this.passwords.set(session.id, basic);
          return { id: session.id, backend: 'kubernetes', directory: '/workspace/repository', endpoint: `http://${name}.${this.kube.namespace}.svc:4096`, metadata: { namespace: this.kube.namespace, pod: name } };
        }
        await new Promise(done => setTimeout(done, 500));
      }
      throw new RuntimeFailure('timeout', 'workspace');
    } catch (error) {
      await this.dispose({ id: session.id, backend: 'kubernetes', directory: '/workspace/repository' }).catch(() => {});
      throw error;
    }
  }

  async dispose(workspace: Workspace): Promise<void> {
    const name = workspaceName(workspace.id);
    await this.removePod(name);
    for (const kind of ['Secret', 'Service', 'NetworkPolicy']) await this.client.request(this.path(kind, name), 'DELETE', undefined, true);
    this.passwords.delete(workspace.id);
  }
}
