import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AppConfig, User, RuntimeKind, Session } from './types.ts';
import { Auth } from './auth.ts';
import type { Engine } from './engine.ts';
import { publicSession, type Store } from './store.ts';
import { getTask, listTasks, presentTask, publicTaskSource, TaskError } from './tasks.ts';
import { readCandidate, unavailableCandidate } from './candidates.ts';
import { placements } from './config.ts';
import type { WorkerRelay } from './runtime/relay.ts';
import type { AgentHost } from './ahp/host.ts';
import { protocolVersion as agentHostProtocolVersion } from './ahp/host.ts';
import type { Links } from './links.ts';
import type { Oidc } from './oidc.ts';
import { readFileSync } from 'node:fs';
import { PloegClient, PloegError, type PloegDecision, type PloegState } from './ploeg.ts';
import { DeliveryService } from './delivery.ts';
import { TaskHandoff } from './task-handoff.ts';
import { StaticFiles } from './static.ts';
import { Collection, CollectionError } from './collection.ts';
import { CardThemes, ThemeError } from './card-themes.ts';
import { AssetError, assetLimits, maxImageSide, maxUploadBytes } from './card-assets.ts';
import { CardArtError, CardArtGenerator, maxArtAttempts } from './card-art.ts';

const applicationVersion = (() => { try { return String(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version); } catch { return 'unknown'; } })();

const browserModule = /^\/(?:(?:core|views|styles)\/[a-z0-9][a-z0-9-]*\.(?:js|css)|cards\/(?:(?:skins\/[a-z0-9][a-z0-9-]*|effects)\/)?[a-z0-9][a-z0-9-]*\.(?:js|css|json)|vendor\/three\/[a-z0-9][a-z0-9-]*\.js)$/;

function fault(status: number, code: string, message: string): never { throw Object.assign(new Error(message), { status, code }); }

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json')) fault(415, 'content_type', 'Use application/json.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 131072) fault(413, 'body_too_large', 'Request is too large.');
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch { return fault(400, 'invalid_json', 'Expected a JSON object.'); }
}

async function upload(req: IncomingMessage, limit: number): Promise<Buffer> {
  if (req.headers['content-type'] !== 'application/octet-stream') fault(415, 'content_type', 'Upload the file as application/octet-stream.');
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > limit) fault(413, 'asset_too_large', `The file is larger than the ${Math.round(limit / 1024 / 1024)} MiB upload limit.`);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) fault(413, 'asset_too_large', `The file is larger than the ${Math.round(limit / 1024 / 1024)} MiB upload limit.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendAsset(req: IncomingMessage, res: ServerResponse, asset: { mediaType: string; content: Buffer }): void {
  const type = asset.mediaType === 'text/x-glsl' ? 'text/plain; charset=utf-8' : asset.mediaType;
  const headers: Record<string, string | number> = { 'Content-Type': type, 'Cache-Control': 'private, max-age=31536000, immutable', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': 'inline', 'Accept-Ranges': 'bytes', 'Cross-Origin-Resource-Policy': 'same-origin' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
  const total = asset.content.length;
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
    if (start >= total || start > end) { res.writeHead(416, { ...headers, 'Content-Range': `bytes */${total}` }); res.end(); return; }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': end - start + 1 });
    res.end(asset.content.subarray(start, end + 1));
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': total });
  res.end(asset.content);
}

function placementInput(value: unknown): 'local' | 'docker' | 'kubernetes' | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !['local', 'docker', 'kubernetes'].includes(value)) fault(400, 'placement', 'Choose a workspace placement enabled on this workbench.');
  return value as 'local' | 'docker' | 'kubernetes';
}

function text(value: unknown, name: string, max: number, optional = false): string {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max) fault(400, 'invalid_input', `${name} must be text between 1 and ${max} characters.`);
  return (value as string).trim();
}

function mutationGuard(req: IncomingMessage, config: AppConfig): void {
  if (req.headers['x-vloer-request'] !== '1') fault(403, 'csrf', 'The request is missing the application request header.');
  const origin = req.headers.origin;
  if (origin) {
    let expected: string;
    try { expected = new URL(config.baseUrl || `http://${req.headers.host}`).origin; }
    catch { return fault(403, 'origin', 'Invalid request origin.'); }
    if (origin !== expected) fault(403, 'origin', 'This request came from another origin.');
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') fault(403, 'origin', 'Cross-site requests are not allowed.');
}

export function buildServer(config: AppConfig, store: Store, engine: Engine, runtimeKinds: RuntimeKind[], relay?: WorkerRelay, agentHost?: AgentHost, links?: Links, oidc?: Oidc) {
  const auth = new Auth(store, config);
  const ploeg = new PloegClient(config);
  const delivery = new DeliveryService(config, store);
  const handoff = new TaskHandoff(config, ploeg);
  const streams = new Set<ServerResponse>();
  const staticFiles = new StaticFiles(config.publicDir);
  const collection = new Collection(config, store, ploeg, config.mode === 'demo' && (!config.ploeg || config.ploeg.demo === true));
  const themes = new CardThemes(store, config);
  const cardArt = new CardArtGenerator(config);
  const knownSecrets = [config.cardThemes?.ai ? process.env[config.cardThemes.ai.keyEnv] : undefined, config.delivery?.verifierTokenEnv ? process.env[config.delivery.verifierTokenEnv] : undefined, config.litellm?.masterKey, config.runtime.password, config.auth.bootstrapPassword, config.ploeg?.tokenEnv ? process.env[config.ploeg.tokenEnv] : undefined, ...(config.taskSources ?? []).map(source => source.token)].filter((value): value is string => Boolean(value));
  function sanitize<T>(value: T): T {
    if (typeof value === 'string') {
      let cleaned: string = value;
      for (const secret of knownSecrets) cleaned = cleaned.split(secret).join('[redacted]');
      return cleaned as T;
    }
    if (Array.isArray(value)) return value.map(item => sanitize(item)) as T;
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)])) as T;
    return value;
  }
  function visible(id: string, user: User): Session {
    const session = store.getSession(id);
    if (!session || (session.ownerId !== user.id && user.role !== 'admin')) fault(404, 'not_found', 'Session not found.');
    return session as Session;
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const path = url.pathname;
      const method = req.method || 'GET';
      if (path === '/healthz' || path === '/readyz') {
        if (method !== 'GET') return json(res, 405, { error: { code: 'method', message: 'GET required.' } });
        store.listSessions();
        return json(res, 200, { status: 'ok', version: applicationVersion });
      }
      if (relay && await relay.handle(req, res, url)) return;
      if (['POST','PUT','PATCH','DELETE'].includes(method) && !path.startsWith('/api/auth/editor')) mutationGuard(req, config);
      if (method === 'POST' && path === '/api/login') {
        const data = await body(req);
        const result = auth.login(text(data.name, 'Name', 100), typeof data.password === 'string' ? data.password : '', req.socket.remoteAddress || 'unknown');
        res.setHeader('Set-Cookie', result.cookie);
        return json(res, 200, { user: result.user });
      }
      if (method === 'GET' && path === '/api/auth/methods') return json(res, 200, { local: true, oidc: oidc?.configured() ? { name: config.auth.oidc!.displayName, issuer: config.auth.oidc!.issuer } : null });
      if (method === 'POST' && path === '/api/auth/editor' && oidc?.configured()) {
        const started = auth.beginEditor();
        return json(res, 200, { code: started.code, secret: started.secret, expiresIn: started.expiresIn, url: `${config.baseUrl ?? `http://${req.headers.host}`}/api/auth/oidc?editor=${encodeURIComponent(started.code)}` });
      }
      const editorCollect = path.match(/^\/api\/auth\/editor\/([A-Za-z0-9_-]{8,32})$/);
      if (method === 'POST' && editorCollect) {
        const data = await body(req);
        const result = auth.collectEditor(editorCollect[1], typeof data.secret === 'string' ? data.secret : '');
        return json(res, result.status === 'ready' ? 200 : 202, result);
      }
      if (method === 'GET' && path === '/api/auth/oidc' && oidc?.configured()) {
        const editor = url.searchParams.get('editor') ?? undefined;
        if (editor !== undefined && !auth.editorPending(editor)) return fault(404, 'editor_login_unknown', 'This editor sign-in is unknown or has expired. Start it again from your editor.');
        res.writeHead(303, { Location: await oidc.begin(editor) });
        res.end();
        return;
      }
      if (method === 'GET' && path === '/api/auth/oidc/callback' && oidc?.configured()) {
        const denied = url.searchParams.get('error');
        try {
          if (denied) throw Object.assign(new Error(denied), { code: denied.replace(/[^a-z_]/gi, '').slice(0, 40) || 'denied' });
          const identity = await oidc.complete(url.searchParams.get('code') ?? '', url.searchParams.get('state') ?? '');
          store.upsertUser({ id: identity.id, name: identity.email ?? identity.name, role: identity.role, passwordHash: '' });
          const issued = auth.issue({ id: identity.id, name: identity.email ?? identity.name, role: identity.role });
          if (identity.editor) { auth.bindEditor(identity.editor, auth.issue(issued.user)); }
          res.writeHead(303, { Location: identity.editor ? '/?editor=done' : '/', 'Set-Cookie': issued.cookie });
        } catch (error: any) {
          console.error(JSON.stringify({ level: 'warn', event: 'login.failed', method: 'oidc', code: String(error?.code || 'oidc_failed'), message: String(error?.message || '').slice(0, 300) }));
          res.writeHead(303, { Location: `/?login_error=${encodeURIComponent(String(error?.code || 'oidc_failed').replace(/[^a-z0-9_]/gi, '').slice(0, 40))}` });
        }
        res.end();
        return;
      }
      if (method === 'POST' && path === '/api/logout') {
        const signIn = auth.signIn(req);
        if (signIn) agentHost?.revokeSignIn(signIn);
        res.setHeader('Set-Cookie', auth.logout(req));
        return json(res, 200, { ok: true });
      }
      const linkCallback = path.match(/^\/api\/links\/(gitlab|clickup)\/callback$/);
      if (method === 'GET' && linkCallback && links) {
        const provider = linkCallback[1] as 'gitlab' | 'clickup';
        const denied = url.searchParams.get('error');
        let location = `/?linked=${provider}`;
        if (denied) location = `/?link_error=${encodeURIComponent(denied.replace(/[^a-z_]/gi, '').slice(0, 40) || 'denied')}`;
        else {
          try { await links.complete(provider, url.searchParams.get('code') ?? '', url.searchParams.get('state') ?? ''); }
          catch (error: any) {
            const code = typeof error?.httpStatus === 'number' ? `exchange_${error.httpStatus}` : String(error?.code || 'link_failed');
            console.error(JSON.stringify({ level: 'warn', event: 'link.failed', provider, code, detail: String(error?.detail || error?.message || '').slice(0, 300) }));
            location = `/?link_error=${encodeURIComponent(code.replace(/[^a-z0-9_]/gi, '').slice(0, 40))}`;
          }
        }
        res.writeHead(303, { Location: location });
        res.end();
        return;
      }
      if (path.startsWith('/api/')) {
        const user = auth.user(req);
        if (!user) return json(res, 401, { error: { code: 'unauthenticated', message: 'Sign in to your workbench.' } });
        if (method === 'GET' && path === '/api/bootstrap') return json(res, 200, sanitize({
          user, mode: config.mode, sharedExecution: Boolean(config.execution), deliveryRepositories: config.delivery?.policies.map(policy => policy.repositoryId) ?? [], gateway: config.litellm ? new URL(config.litellm.baseUrl).host : undefined,
          gatewayPolicy: config.gatewayPolicy ?? null,
          observability: config.observability ?? null,
          repositories: config.repositories.map(({ id, name, description, baseBranch, trackerUrl, executionOwner }) => ({ id, name, description, baseBranch, trackerUrl, executionOwner: executionOwner ?? 'interactive' })),
          taskSources: (config.taskSources ?? []).map(source => ({ ...publicTaskSource(source, config.ploeg), needsLink: !source.token && (source.provider === 'gitlab' || source.provider === 'clickup') ? source.provider : null })),
          crews: config.crews, models: config.models,
          runtimes: runtimeKinds.map(id => ({ id, name: id === 'demo' ? 'Demonstration' : id === 'opencode' ? 'OpenCode' : 'Command bridge', available: true })),
          placements: placements(config),
          maxBudgetUsd: config.maxBudgetUsd, maxConcurrentSessions: config.maxConcurrentSessions
        }));
        if (method === 'GET' && path === '/api/health') return json(res, 200, { status: 'ok', mode: config.mode, version: applicationVersion, runtimes: runtimeKinds, litellm: Boolean(config.litellm), gateway: config.litellm ? new URL(config.litellm.baseUrl).host : undefined, workspaceBackend: config.mode === 'demo' ? 'demo' : config.runtime.backend, workspaceBackends: placements(config).map(item => item.id) });
        if (path === '/api/agent-host' || path === '/api/agent-host/tokens') {
          if (!agentHost) fault(404, 'agent_host_disabled', 'The agent host is not enabled on this workbench.');
          const address = (config.baseUrl ?? `http://${config.host}:${config.port}`).replace(/^http/, 'ws');
          if (method === 'GET' && path === '/api/agent-host') return json(res, 200, { protocolVersion: agentHostProtocolVersion, address, provider: 'de-vloer', clients: agentHost!.clients.size, vscodeSetting: { key: 'chat.remoteAgentHosts', entry: { address, name: 'De Vloer', connectionToken: '<token from POST /api/agent-host/tokens>' } } });
          if (method === 'POST' && path === '/api/agent-host/tokens') {
            if (user.role === 'viewer') fault(403, 'forbidden', 'Viewers cannot connect an agent host.');
            const data = await body(req);
            const token = agentHost!.issueToken(user, text(data.label, 'Label', 80, true) || 'agent host', auth.signIn(req));
            return json(res, 201, { token, address, vscodeSetting: { key: 'chat.remoteAgentHosts', entry: { address, name: 'De Vloer', connectionToken: token } } });
          }
          fault(405, 'method', 'Unsupported method.');
        }
        if (method === 'GET' && path === '/api/attestations/public-key') {
          const key = engine.signing();
          res.writeHead(200, { 'Content-Type': 'application/x-pem-file', 'Content-Disposition': 'attachment; filename="de-vloer-attestation.pub"', 'Cache-Control': 'no-store', 'X-Key-Id': key.id });
          res.end(key.publicPem());
          return;
        }
        if (method === 'GET' && path === '/api/models') return json(res, 200, { models: await engine.describeModels() });
        if (method === 'GET' && path === '/api/links') return json(res, 200, { links: links ? links.describeAll(user.id) : [] });
        const linkRoute = path.match(/^\/api\/links\/(gitlab|clickup)$/);
        if (linkRoute && links) {
          const provider = linkRoute[1] as 'gitlab' | 'clickup';
          if (method === 'POST') return json(res, 200, { url: links.begin(provider, user.id) });
          if (method === 'PUT') { const data = await body(req); return json(res, 200, { link: await links.paste(provider, user.id, typeof data.token === 'string' ? data.token : '') }); }
          if (method === 'DELETE') { await links.revoke(provider, user.id); return json(res, 200, { ok: true }); }
        }
        const withUserToken = async (source: NonNullable<AppConfig['taskSources']>[number]) => {
          if (source.token) return source;
          if (source.provider !== 'gitlab' && source.provider !== 'clickup') return source;
          const linked = links ? await links.token(user.id, source.provider) : undefined;
          if (!linked) fault(409, 'source_unlinked', `Link ${source.provider === 'gitlab' ? 'GitLab' : 'ClickUp'} under Linked accounts to use this connection.`);
          return { ...source, token: linked!.token, ...(source.provider === 'gitlab' && linked!.type === 'bearer' ? { tokenType: 'bearer' as const } : {}) };
        };
        if (method === 'GET' && path === '/api/task-sources') return json(res, 200, sanitize((config.taskSources ?? []).map(source => ({ ...publicTaskSource(source, config.ploeg), needsLink: !source.token && (source.provider === 'gitlab' || source.provider === 'clickup') ? source.provider : null }))));
        const handoffRoute = path.match(/^\/api\/task-sources\/([a-z0-9-]+)\/tasks\/([a-zA-Z0-9_-]+)\/(ploeg|handoff)$/);
        if (handoffRoute) {
          const source = config.taskSources?.find(item => item.id === handoffRoute[1]);
          if (!source) fault(404, 'source_not_found', 'Task connection not found.');
          if (handoffRoute[3] === 'ploeg' && method === 'GET') return json(res, 200, sanitize(await handoff.status(user, source!, handoffRoute[2], url.searchParams.get('refresh') === '1')));
          if (handoffRoute[3] === 'handoff' && (method === 'POST' || method === 'DELETE')) {
            if (user.role === 'viewer') fault(403, 'forbidden', 'Viewers cannot hand tasks to Ploeg.');
            if (method === 'DELETE') return json(res, 200, sanitize(await handoff.takeBack(user, source!, handoffRoute[2], text(url.searchParams.get('team'), 'Team', 100))));
            const data = await body(req);
            return json(res, 200, sanitize(await handoff.handOff(user, source!, handoffRoute[2], text(data.team, 'Team', 100), text(data.revision, 'Task revision', 128))));
          }
          fault(405, 'method', 'Unsupported method.');
        }
        if (method === 'GET' && path === '/api/tasks/lookup') return json(res, 200, sanitize(await handoff.lookup(url.searchParams.get('provider'), url.searchParams.get('id'))));
        const taskRoute = path.match(/^\/api\/task-sources\/([a-z0-9-]+)\/tasks(?:\/([a-zA-Z0-9_-]+))?$/);
        if (method === 'GET' && taskRoute) {
          const source = config.taskSources?.find(item => item.id === taskRoute[1]);
          if (!source) fault(404, 'source_not_found', 'Task connection not found.');
          const resolved = await withUserToken(source!);
          if (taskRoute[2]) return json(res, 200, sanitize(presentTask(resolved, await engine.previewTask(await getTask(resolved, taskRoute[2], url.searchParams.get('truncate') === '1'), user))));
          const page = Number(url.searchParams.get('page') ?? 1);
          if (!Number.isSafeInteger(page) || page < 1 || page > 1000) fault(400, 'page', 'Choose a page between 1 and 1000.');
          return json(res, 200, sanitize(await listTasks(resolved, page)));
        }
        if (method === 'POST' && path === '/api/task-imports') {
          if (user.role === 'viewer') fault(403, 'forbidden', 'Viewers cannot import tasks.');
          const data = await body(req);
          const sourceId = text(data.sourceId, 'Connection', 64);
          const taskId = text(data.taskId, 'Task', 128);
          const revision = text(data.revision, 'Task revision', 128);
          const crewId = text(data.crewId, 'Crew', 64);
          const runtime = text(data.runtime, 'Runtime', 32) as RuntimeKind;
          const source = config.taskSources?.find(item => item.id === sourceId);
          if (!source) fault(404, 'source_not_found', 'Task connection not found.');
          if (!config.execution && (source!.executionOwner !== 'interactive' || config.repositories.find(repo => repo.id === source!.repositoryId)?.executionOwner === 'ploeg')) fault(403, 'ploeg_owned', 'Ploeg owns execution for this task connection. Assign its work through the tracker.');
          if (!runtimeKinds.includes(runtime) || !config.crews.some(crew => crew.id === crewId)) fault(400, 'unknown_profile', 'Choose a configured crew and runtime.');
          if (typeof data.budgetUsd !== 'number' || !Number.isFinite(data.budgetUsd) || data.budgetUsd <= 0 || data.budgetUsd > config.maxBudgetUsd) fault(400, 'budget', `Budget must be greater than zero and at most $${config.maxBudgetUsd}.`);
          const snapshot = await getTask(await withUserToken(source!), taskId);
          if (snapshot.revision !== revision) fault(409, 'task_changed', 'The task changed after your preview. Refresh it and review the updated version.');
          const result = await engine.importTask(snapshot, { crewId, runtime, budgetUsd: data.budgetUsd as number, placement: placementInput(data.placement) }, user, typeof data.bindingRevision === 'string' ? data.bindingRevision : undefined);
          return json(res, result.created ? 201 : 200, sanitize(publicSession(result.session)));
        }
        if (method === 'GET' && path === '/api/sessions') return json(res, 200, sanitize(store.listSessions().filter(session => session.ownerId === user.id || user.role === 'admin').map(publicSession)));
        if (method === 'POST' && path === '/api/sessions') {
          if (user.role === 'viewer') fault(403, 'forbidden', 'Viewers cannot start work.');
          const data = await body(req);
          const runtime = text(data.runtime, 'Runtime', 32) as RuntimeKind;
          const repositoryId = text(data.repositoryId, 'Repository', 64);
          const crewId = text(data.crewId, 'Crew', 64);
          if (!runtimeKinds.includes(runtime) || !config.repositories.some(repo => repo.id === repositoryId) || !config.crews.some(crew => crew.id === crewId)) fault(400, 'unknown_profile', 'Choose a configured repository, crew and runtime.');
          if (typeof data.budgetUsd !== 'number' || !Number.isFinite(data.budgetUsd) || data.budgetUsd <= 0 || data.budgetUsd > config.maxBudgetUsd) fault(400, 'budget', `Budget must be greater than zero and at most $${config.maxBudgetUsd}.`);
          const trackerUrl = text(data.trackerUrl, 'Tracker link', 2048, true);
          if (trackerUrl) {
            let parsed: URL;
            try { parsed = new URL(trackerUrl); } catch { return fault(400, 'tracker_url', 'Use an HTTP(S) tracker link.'); }
            if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password) fault(400, 'tracker_url', 'Use an HTTP(S) tracker link without credentials.');
          }
          const session = engine.create({ approval: data.approval as 'manual' | 'auto' | undefined, model: text(data.model, 'Model', 64, true) || undefined, title: text(data.title, 'Title', 160), objective: text(data.objective, 'Objective', 16000), repositoryId, crewId, runtime, placement: placementInput(data.placement), budgetUsd: data.budgetUsd as number, trackerUrl: trackerUrl || undefined }, user);
          return json(res, 201, sanitize(publicSession(session)));
        }
        if (path === '/api/me/card-identity' || path.startsWith('/api/binder') || path.startsWith('/api/packs') || path === '/api/season' || path.startsWith('/api/cards/')) {
          try {
            if (path === '/api/me/card-identity') {
              if (method === 'GET') return json(res, 200, collection.identity(user));
              if (method === 'PUT') { const data = await body(req); return json(res, 200, collection.setIdentity(user, data.logins)); }
            }
            if (path === '/api/binder' && method === 'GET') return json(res, 200, sanitize(await collection.binder(user)));
            if (path === '/api/binder/seen' && method === 'POST') { const data = await body(req); return json(res, 200, collection.markSeen(user, data.until, data.cards)); }
            const seen = /^\/api\/cards\/([^/]{1,40})\/seen$/.exec(path);
            if (seen && method === 'GET') return json(res, 200, await collection.cardSeen(user, seen[1]));
            if (seen && method === 'POST') { const data = await body(req); return json(res, 200, await collection.markCardSeen(user, seen[1], data.until, data.snapshot)); }
            if (path === '/api/packs' && method === 'GET') return json(res, 200, sanitize(await collection.packs(user)));
            if (path === '/api/packs/odds' && method === 'GET') return json(res, 200, collection.odds());
            const pack = /^\/api\/packs\/([A-Za-z0-9_.:@~-]{1,120})(\/open)?$/.exec(path);
            if (pack && !pack[2] && method === 'GET') return json(res, 200, sanitize(await collection.pack(user, pack[1])));
            if (pack && pack[2] && method === 'POST') { await body(req); return json(res, 200, sanitize(await collection.openPack(user, pack[1]))); }
            if (path === '/api/season' && method === 'GET') return json(res, 200, sanitize(await collection.season(user, url.searchParams.get('team') || undefined, url.searchParams.get('quarter') || undefined)));
            fault(405, 'method', 'Unsupported method.');
          } catch (error) {
            if (error instanceof CollectionError || error instanceof PloegError) return json(res, error.status, { error: { code: error.code, message: error.message } });
            throw error;
          }
        }
        if (path === '/api/ploeg' || path.startsWith('/api/ploeg/')) {
          const decision = /^\/api\/ploeg\/work-items\/([^/]+)\/(approve|reject|cancel)$/.exec(path);
          const attribution = /^\/api\/ploeg\/work-items\/([^/]+)\/(cracks|evolved)$/.exec(path);
          const crackStep = /^\/api\/ploeg\/work-items\/([^/]+)\/cracks\/([^/]+)\/(confirm|dispute|resolve)$/.exec(path);
          if (method !== 'GET' && !(method === 'POST' && (decision || attribution || crackStep))) fault(405, 'method', 'Ploeg operator views are read-only except Work Item decisions and crack attributions.');
          try {
            if (method === 'POST' && (decision || attribution || crackStep)) {
              if (user.role === 'viewer') fault(403, 'forbidden', 'Viewers cannot change Ploeg work.');
              const data = await body(req);
              if (decision) return json(res, 200, sanitize(await ploeg.decide(user, decision[1], decision[2] as PloegDecision, typeof data.reason === 'string' ? data.reason : '')));
              if (attribution) return json(res, attribution[2] === 'cracks' ? 201 : 200, sanitize(await ploeg.attribute(user, attribution[1], attribution[2] === 'cracks' ? 'propose' : 'evolved', data)));
              return json(res, 200, sanitize(await ploeg.decideCrack(user, crackStep![1], crackStep![2], crackStep![3] as 'confirm' | 'dispute' | 'resolve', data)));
            }
            const fresh = url.searchParams.get('refresh') === '1';
            const optional = (name: string) => url.searchParams.get(name) || undefined;
            if (path === '/api/ploeg') return json(res, 200, sanitize(await ploeg.overview(user, url.searchParams.get('team') ?? undefined, fresh)));
            if (path === '/api/ploeg/teams') return json(res, 200, sanitize({ teams: (await ploeg.teams(user, fresh)).map(team => team.id) }));
            if (path === '/api/ploeg/summary') return json(res, 200, sanitize(await ploeg.summary(user, url.searchParams.get('window') ?? '24h', fresh)));
            if (path === '/api/ploeg/runs') return json(res, 200, sanitize(await ploeg.runs(user, { team: optional('team'), state: optional('state'), outcome: optional('outcome'), before: optional('before') }, fresh)));
            if (path === '/api/ploeg/events') return json(res, 200, sanitize(await ploeg.events(user, { team: optional('team'), before: optional('before') }, fresh)));
            if (path === '/api/ploeg/proposed') return json(res, 200, sanitize(await ploeg.proposed(user, fresh)));
            if (path === '/api/ploeg/now') return json(res, 200, sanitize(await ploeg.now(user, fresh)));
            if (path === '/api/ploeg/work-items') return json(res, 200, sanitize(await ploeg.items(user, text(url.searchParams.get('team'), 'Team', 100), (url.searchParams.get('state') ?? 'all') as PloegState | 'all', url.searchParams.get('after') ?? '0', fresh)));
            const card = /^\/api\/ploeg\/work-items\/([^/]+)\/card$/.exec(path);
            if (card) return json(res, 200, sanitize(await ploeg.card(user, card[1], fresh)));
            const candidates = /^\/api\/ploeg\/work-items\/([^/]+)\/crack-candidates$/.exec(path);
            if (candidates) return json(res, 200, sanitize(await ploeg.crackCandidates(user, candidates[1], fresh)));
            const cracks = /^\/api\/ploeg\/work-items\/([^/]+)\/cracks$/.exec(path);
            if (cracks) return json(res, 200, sanitize(await ploeg.cracks(user, cracks[1], fresh)));
            const match = /^\/api\/ploeg\/work-items\/([^/]+)$/.exec(path);
            if (match) return json(res, 200, sanitize(await ploeg.detail(user, match[1], fresh)));
            fault(404, 'not_found', 'Ploeg operator view not found.');
          } catch (error) { if (error instanceof PloegError) return json(res, error.status, { error: { code: error.code, message: error.message } }); throw error; }
        }
        if (path === '/api/card-themes' || path.startsWith('/api/card-themes/') || path === '/api/card-assets' || path.startsWith('/api/card-assets/') || path === '/api/card-art/generate') {
          const administrator = user.role === 'admin';
          const onlyAdministrators = (what: string) => { if (!administrator) fault(403, 'forbidden', `Only administrators can ${what}.`); };
          if (path === '/api/card-themes') {
            if (method !== 'GET') fault(405, 'method', 'Unsupported method.');
            return json(res, 200, sanitize({
              themes: themes.list(), canEdit: administrator, skins: [...themes.skins.values()],
              limits: { assets: assetLimits, maxImageSide, quotaMb: Math.round(themes.quotaBytes / 1024 / 1024) },
              art: { configured: cardArt.configured(), model: administrator ? cardArt.model() : null, maxAttempts: maxArtAttempts, demo: config.mode === 'demo' },
              directory: administrator && themes.directoryPath ? { problems: themes.problems } : null,
            }));
          }
          const themeRoute = /^\/api\/card-themes\/([a-z0-9][a-z0-9-]{0,63})(\/versions(?:\/([1-9]\d{0,8}))?)?$/.exec(path);
          if (themeRoute) {
            const [, id, versions, version] = themeRoute;
            if (versions) {
              if (method !== 'GET') fault(405, 'method', 'Unsupported method.');
              if (version) { const found = themes.version(id, Number(version)); if (!found) fault(404, 'not_found', 'Theme version not found.'); return json(res, 200, found); }
              return json(res, 200, { versions: themes.versions(id) });
            }
            if (method === 'GET') { const found = themes.get(id); if (!found) fault(404, 'not_found', 'Theme not found.'); return json(res, 200, found); }
            if (method === 'PUT') {
              onlyAdministrators('create or change card themes');
              const data = await body(req);
              const existed = Boolean(themes.get(id));
              return json(res, existed ? 200 : 201, themes.save(id, data.theme, data.baseVersion, user));
            }
            if (method === 'DELETE') { onlyAdministrators('delete card themes'); themes.remove(id); return json(res, 200, { ok: true }); }
            fault(405, 'method', 'Unsupported method.');
          }
          if (path === '/api/card-assets') {
            if (method !== 'POST') fault(405, 'method', 'Unsupported method.');
            onlyAdministrators('upload theme assets');
            const purpose = url.searchParams.get('purpose') ?? '';
            return json(res, 201, themes.putAsset(purpose, await upload(req, maxUploadBytes), user));
          }
          const assetRoute = /^\/api\/card-assets\/([a-f0-9]{64})$/.exec(path);
          if (assetRoute) {
            if (method !== 'GET') fault(405, 'method', 'Unsupported method.');
            const asset = themes.asset(assetRoute[1]);
            if (!asset) fault(404, 'not_found', 'Asset not found.');
            return sendAsset(req, res, asset!);
          }
          if (path === '/api/card-art/generate') {
            if (method !== 'POST') fault(405, 'method', 'Unsupported method.');
            onlyAdministrators('generate card art');
            const data = await body(req);
            return json(res, 200, await cardArt.generate(user, data));
          }
          fault(404, 'not_found', 'API route not found.');
        }
        const match = path.match(/^\/api\/sessions\/([a-zA-Z0-9_-]+)(?:\/(.*))?$/);
        if (match) {
          const [, id, action = ''] = match;
          const session = visible(id, user);
          if (method === 'GET' && !action) return json(res, 200, sanitize(publicSession(session)));
          if (method === 'GET' && action === 'delivery') return json(res, 200, sanitize(await delivery.view(id, user)));
          if (method === 'GET' && action === 'delivery/download') {
            const content = await delivery.download(id, user);
            res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="canonical-candidate.git.bundle"', 'Content-Length': content.length, 'Cache-Control': 'no-store' }); res.end(content); return;
          }
          if (method === 'GET' && action === 'candidate') return json(res, 200, sanitize(session.candidate ?? unavailableCandidate(['completed', 'failed', 'cancelled'].includes(session.status) ? 'unsupported_workspace' : 'not_ready')));
          if (method === 'GET' && action === 'candidate/download') {
            const format = url.searchParams.get('format');
            if (!['bundle', 'patch', 'manifest', 'attestation', 'trace'].includes(format ?? '')) fault(400, 'candidate_format', 'Choose bundle, patch, manifest, attestation or trace.');
            if (session.candidate?.status !== 'ready') fault(409, 'candidate_unavailable', 'A complete export is not available for this session.');
            if ((format === 'attestation' || format === 'trace') && !session.candidate.formats?.includes(format)) fault(409, 'candidate_unavailable', 'This candidate has no signed attestation.');
            const artifact = await readCandidate(config.dataDir, id, format as 'bundle' | 'patch' | 'manifest' | 'attestation' | 'trace');
            res.writeHead(200, { 'Content-Type': artifact.contentType, 'Content-Length': artifact.content.length, 'Content-Disposition': `attachment; filename="${artifact.filename}"`, 'Cache-Control': 'no-store' });
            res.end(artifact.content);
            return;
          }
          if (method === 'GET' && action === 'history') {
            const after = Math.max(0, Math.floor(Number(url.searchParams.get('after')) || 0));
            return json(res, 200, sanitize(store.events(id, after)));
          }
          if (method === 'GET' && action === 'permissions') return json(res, 200, sanitize(store.permissions(id).map(({ nativeId, ...request }) => request)));
          if (method === 'GET' && action === 'events') {
            if (streams.size >= 100) fault(429, 'streams', 'Too many live connections.');
            let cursor = Math.max(0, Math.floor(Number(url.searchParams.get('after') || req.headers['last-event-id']) || 0));
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
            streams.add(res);
            res.write('retry: 1500\n\n');
            let heartbeat = 0;
            const tick = () => {
              try {
                if (!auth.user(req)) { res.end(); return; }
                for (const event of store.events(id, cursor)) {
                  if (res.writableLength > 1048576) { res.destroy(); return; }
                  res.write(`id: ${event.id}\ndata: ${JSON.stringify(sanitize(event))}\n\n`);
                  cursor = event.id;
                }
                if (++heartbeat % 30 === 0) res.write(': heartbeat\n\n');
              } catch { res.end(); }
            };
            tick();
            const timer = setInterval(tick, 500);
            res.on('close', () => { clearInterval(timer); streams.delete(res); });
            return;
          }
          if (method === 'POST') {
            if (user.role === 'viewer') fault(403, 'forbidden', 'Viewers cannot change work.');
            const data = await body(req);
            if (action === 'delivery/verify') return json(res, 200, sanitize(await delivery.verify(id, user)));
            if (action === 'delivery/approve') return json(res, 200, sanitize(await delivery.approve(id, user, data)));
            let result: Session;
            if (action === 'start') result = await engine.start(id, user);
            else if (action === 'pause') result = await engine.pause(id, user);
            else if (action === 'resume') result = await engine.resume(id, user);
            else if (action === 'cancel') result = await engine.cancel(id, user);
            else if (action === 'retry') result = await engine.retry(id, user);
            else if (action === 'review') result = engine.review(id, { decision: data.decision, note: data.note }, user);
            else if (action === 'messages') result = await engine.message(id, text(data.text, 'Instruction', 16000), user);
            else if (action === 'supervision') result = await engine.setSupervision(id, data.supervision, user);
            else if (action === 'approval') result = await engine.setApproval(id, data.approval, user);
            else if (action === 'budget') {
              if (user.role !== 'admin') fault(403, 'forbidden', 'An administrator must authorize additional budget.');
              if (typeof data.amountUsd !== 'number' || !Number.isFinite(data.amountUsd) || data.amountUsd <= 0) fault(400, 'budget', 'Additional budget must be positive.');
              result = await engine.addBudget(id, data.amountUsd as number, user);
            } else if (action.startsWith('permissions/')) {
              if (data.decision !== undefined && !['once','always','reject'].includes(String(data.decision))) fault(400, 'permission', 'Invalid permission decision.');
              if (data.answers !== undefined && (!Array.isArray(data.answers) || data.answers.length > 20 || data.answers.some((answers: unknown) => !Array.isArray(answers) || answers.some(value => typeof value !== 'string' || value.length > 4000)))) fault(400, 'answers', 'Invalid question answers.');
              result = await engine.respond(id, action.slice('permissions/'.length), data as any, user);
            } else return fault(404, 'not_found', 'Action not found.');
            return json(res, 200, sanitize(publicSession(result)));
          }
        }
        return fault(404, 'not_found', 'API route not found.');
      }
      const assets: Record<string, string> = { '/': 'index.html', '/app.js': 'app.js', '/shell.js': 'shell.js', '/now.js': 'now.js', '/ploeg.js': 'ploeg.js', '/ploeg-activity.js': 'ploeg-activity.js', '/delivery.js': 'delivery.js', '/styles.css': 'styles.css', '/favicon.svg': 'favicon.svg', '/favicon.ico': 'favicon.ico', '/favicon-16x16.png': 'favicon-16x16.png', '/favicon-32x32.png': 'favicon-32x32.png', '/apple-touch-icon.png': 'apple-touch-icon.png', '/android-chrome-192x192.png': 'android-chrome-192x192.png', '/android-chrome-512x512.png': 'android-chrome-512x512.png', '/site.webmanifest': 'site.webmanifest', '/og-image.png': 'og-image.png', '/fonts/archivo-latin-wght-wdth110.woff2': 'fonts/archivo-latin-wght-wdth110.woff2', '/fonts/archivo-latin-ext-wght-wdth110.woff2': 'fonts/archivo-latin-ext-wght-wdth110.woff2', '/fonts/OFL.txt': 'fonts/OFL.txt' };
      const file = assets[path] ?? (browserModule.test(path) ? path.slice(1) : undefined);
      if (method !== 'GET' || !file) return fault(404, 'not_found', 'Page not found.');
      await staticFiles.serve(req, res, file, Boolean(assets[path]));
    } catch (error: any) {
      if (res.headersSent) { res.end(); return; }
      const status = Number(error.status || error.statusCode) || 500;
      const code = error.code || (status === 500 ? 'internal_error' : 'request_failed');
      const message = status >= 500 && !(error instanceof TaskError) && !(error instanceof PloegError) && !(error instanceof CardArtError) && !(error instanceof AssetError) && !(error instanceof ThemeError) ? 'The operation could not be completed. Check the server log.' : error.message;
      if (status >= 500) console.error(JSON.stringify({ level: 'error', event: 'http.failed', message: String(error.message).slice(0, 200).replace(/sk-[\w-]+/g, '[redacted]') }));
      json(res, status, sanitize({ error: { code, message } }));
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return { server, closeStreams: () => { for (const stream of streams) stream.end(); streams.clear(); } };
}
