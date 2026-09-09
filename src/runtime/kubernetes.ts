import { request as httpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { persistRemoteCandidate, unavailableCandidate, type Candidate, type CandidateManifest } from '../candidates.ts';
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

  async request(path: string, method = 'GET', body?: unknown, allowMissing = false, raw = false): Promise<any> {
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
          try { const value = Buffer.concat(chunks).toString('utf8'); done(raw ? value : chunks.length ? JSON.parse(value) : {}); }
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

export const cloneProgram = `import{mkdirSync,existsSync}from'node:fs';import{spawnSync}from'node:child_process';
const env={...process.env,GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
const run=(a)=>{const r=spawnSync('git',a,{env,stdio:'ignore'});if(r.status!==0)process.exit(1)};
mkdirSync('/workspace',{recursive:true});
if(!existsSync('/workspace/repository/.git')){run(['clone','--depth','100','--branch',env.BASE_BRANCH,'--',env.REPOSITORY_URL,'/workspace/repository']);run(['-C','/workspace/repository','checkout','-b',env.WORK_BRANCH]);}
for(const p of['.home','.state','.cache','.tmp'])mkdirSync('/workspace/'+p,{recursive:true});
const base=spawnSync('git',['-C','/workspace/repository','rev-parse','HEAD'],{env,encoding:'utf8',stdio:['ignore','pipe','ignore']});if(base.status!==0||! /^[a-f0-9]{40}$/.test(base.stdout.trim()))process.exit(1);process.stdout.write(JSON.stringify({baseSha:base.stdout.trim()})+'\\n');`;

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
    { name: 'GIT_AUTHOR_NAME', value: 'De Vloer' }, { name: 'GIT_AUTHOR_EMAIL', value: 'agent@localhost' }, { name: 'GIT_COMMITTER_NAME', value: 'De Vloer' }, { name: 'GIT_COMMITTER_EMAIL', value: 'agent@localhost' },
  ];
  const envFrom = (k.agentSecrets ?? []).map(secretName => ({ secretRef: { name: secretName } }));
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
      command: ['opencode', 'serve', '--hostname', '0.0.0.0', '--port', '4096'], workingDir: '/workspace/repository', env, ...(envFrom.length ? { envFrom } : {}),
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

const candidateServerProgram = `
import { createServer as makeExportServer } from 'node:http';
import { timingSafeEqual as candidateEqual } from 'node:crypto';
const exportOptions={dataDir:'/exports',sessionId:process.env.CANDIDATE_SESSION,repositoryId:process.env.CANDIDATE_REPOSITORY,directory:'/workspace/repository',baseSha:process.env.CANDIDATE_BASE,timeoutMs:120000};
const exportResult=await captureLocalCandidate(exportOptions);
const exportAuth=Buffer.from('Basic '+Buffer.from(process.env.OPENCODE_SERVER_USERNAME+':'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64'));
makeExportServer(async(req,res)=>{const received=Buffer.from(req.headers.authorization??'');if(received.length!==exportAuth.length||!candidateEqual(received,exportAuth)){res.writeHead(401);res.end();return;}
if(req.method!=='GET'){res.writeHead(405);res.end();return;}
res.setHeader('Cache-Control','no-store');
if(req.url==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(exportResult));return;}
const format=({'/manifest':'manifest','/bundle':'bundle','/patch':'patch'})[req.url];
if(!format||exportResult.status!=='ready'){res.writeHead(404);res.end();return;}
try{const file=await readCandidate('/exports',process.env.CANDIDATE_SESSION,format);res.setHeader('Content-Type',file.contentType);res.setHeader('Content-Length',file.content.length);res.end(file.content);}catch{res.writeHead(500);res.end();}
}).listen(4096,'0.0.0.0');`;

export function candidateExportManifest(config: AppConfig, session: Session, repository: Repository): KubernetesObject {
  if (!config.kubernetes) throw new Error('Kubernetes workspace configuration missing');
  const k = config.kubernetes; const name = workspaceName(session.id);
  const helper = stripTypeScriptTypes(readFileSync(new URL('../candidates.ts', import.meta.url), 'utf8'));
  const valueFrom = (key: string) => ({ secretKeyRef: { name, key } });
  return { apiVersion: 'v1', kind: 'Pod', metadata: { name, namespace: k.namespace, labels: { 'app.kubernetes.io/name': 'de-vloer-agent', 'de-vloer/session': name, 'de-vloer/purpose': 'candidate-export' } }, spec: {
    automountServiceAccountToken: false, enableServiceLinks: false, restartPolicy: 'Never', activeDeadlineSeconds: 240, terminationGracePeriodSeconds: 20,
    securityContext: { fsGroup: 1000, fsGroupChangePolicy: 'OnRootMismatch', seccompProfile: { type: 'RuntimeDefault' } },
    ...(k.imagePullSecrets?.length ? { imagePullSecrets: k.imagePullSecrets.map(name => ({ name })) } : {}),
    containers: [{ name: 'candidate-export', image: k.image, imagePullPolicy: k.pullPolicy ?? 'IfNotPresent',
      command: ['node', '--input-type=module', '-e', helper + candidateServerProgram],
      env: [{ name: 'CANDIDATE_SESSION', value: session.id }, { name: 'CANDIDATE_REPOSITORY', value: repository.id }, { name: 'CANDIDATE_BASE', value: session.workspace?.metadata?.baseSha ?? '' },
        { name: 'OPENCODE_SERVER_USERNAME', valueFrom: valueFrom('OPENCODE_SERVER_USERNAME') }, { name: 'OPENCODE_SERVER_PASSWORD', valueFrom: valueFrom('OPENCODE_SERVER_PASSWORD') }],
      securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] }, seccompProfile: { type: 'RuntimeDefault' } },
      ports: [{ name: 'http', containerPort: 4096 }],
      resources: { requests: { cpu: '100m', memory: '256Mi' }, limits: { cpu: k.cpu, memory: '512Mi' } },
      volumeMounts: [{ name: 'workspace', mountPath: '/workspace', readOnly: true }, { name: 'exports', mountPath: '/exports' }, { name: 'tmp', mountPath: '/tmp' }],
    }],
    volumes: [{ name: 'workspace', persistentVolumeClaim: { claimName: name, readOnly: true } }, { name: 'exports', emptyDir: { sizeLimit: '512Mi' } }, { name: 'tmp', emptyDir: { sizeLimit: '16Mi' } }],
  } };
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
          let baseSha = session.workspace?.metadata?.baseSha;
          if (!baseSha && !session.workspace) {
            const log = await this.client.request(this.path('Pod', name) + '/log?container=clone', 'GET', undefined, false, true);
            const record = typeof log === 'string' ? JSON.parse(log.trim()) : undefined;
            if (record && typeof record.baseSha === 'string' && /^[a-f0-9]{40}$/.test(record.baseSha)) baseSha = record.baseSha;
          }
          return { id: session.id, backend: 'kubernetes', directory: '/workspace/repository', endpoint: `http://${name}.${this.kube.namespace}.svc:4096`, metadata: { namespace: this.kube.namespace, pod: name, ...(baseSha ? { baseSha } : {}) } };
        }
        await new Promise(done => setTimeout(done, 500));
      }
      throw new RuntimeFailure('timeout', 'workspace');
    } catch (error) {
      await this.dispose({ id: session.id, backend: 'kubernetes', directory: '/workspace/repository' }).catch(() => {});
      throw error;
    }
  }

  async captureCandidate(session: Session, repository: Repository): Promise<Candidate> {
    const workspace = session.workspace;
    const basic = workspace ? this.passwords.get(workspace.id) : undefined;
    if (!workspace || !basic || !workspace.endpoint) return unavailableCandidate('unsupported_workspace');
    const baseSha = workspace.metadata?.baseSha;
    if (!baseSha || !/^[a-f0-9]{40}$/.test(baseSha)) return unavailableCandidate('base_unavailable');
    try { await this.removePod(workspaceName(workspace.id)); } catch { return unavailableCandidate('stop_unconfirmed'); }
    try {
      await this.client.request(this.path('Pod'), 'POST', candidateExportManifest(this.config, session, repository));
      const read = async (path: string, maximum: number): Promise<Buffer> => {
        const response = await fetch(new URL(path, workspace.endpoint), { headers: { authorization: 'Basic ' + Buffer.from(`${basic.username}:${basic.password}`).toString('base64') }, signal: AbortSignal.timeout(15000), redirect: 'error' });
        if (!response.ok || !response.body) throw new Error('Candidate export unavailable');
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of response.body) { size += chunk.length; if (size > maximum) { await response.body.cancel().catch(() => {}); throw new Error('Candidate export is too large'); } chunks.push(Buffer.from(chunk)); }
        return Buffer.concat(chunks);
      };
      const deadline = Date.now() + 180000; let result: Candidate | undefined;
      while (Date.now() < deadline) {
        const pod = await this.client.request(this.path('Pod', workspaceName(workspace.id)));
        if (['Failed', 'Succeeded'].includes(pod.status?.phase)) return unavailableCandidate('capture_failed');
        if (pod.status?.phase === 'Running') {
          try { result = JSON.parse((await read('/health', 16384)).toString()) as Candidate; break; } catch {}
        }
        await new Promise(done => setTimeout(done, 500));
      }
      if (!result || result.status !== 'ready') return unavailableCandidate(result?.reason);
      const manifest = JSON.parse((await read('/manifest', 8 * 1024 * 1024)).toString()) as CandidateManifest;
      if (manifest.sessionId !== session.id || manifest.repositoryId !== repository.id || manifest.baseSha !== baseSha) return unavailableCandidate('capture_failed');
      const bundle = await read('/bundle', 128 * 1024 * 1024);
      const patch = await read('/patch', 128 * 1024 * 1024);
      return await persistRemoteCandidate(this.config.dataDir, session.id, manifest, bundle, patch);
    } catch { return unavailableCandidate('capture_failed'); }
  }

  async dispose(workspace: Workspace): Promise<void> {
    const name = workspaceName(workspace.id);
    await this.removePod(name);
    for (const kind of ['Secret', 'Service', 'NetworkPolicy']) await this.client.request(this.path(kind, name), 'DELETE', undefined, true);
    this.passwords.delete(workspace.id);
  }
}
