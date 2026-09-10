import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppConfig, User, RuntimeKind, Session } from './types.ts';
import { Auth } from './auth.ts';
import type { Engine } from './engine.ts';
import { publicSession, type Store } from './store.ts';
import { getTask, listTasks, publicTaskSource, TaskError } from './tasks.ts';
import { readCandidate, unavailableCandidate } from './candidates.ts';
import { placements } from './config.ts';
import type { WorkerRelay } from './runtime/relay.ts';
import type { AgentHost } from './ahp/host.ts';
import { protocolVersion as agentHostProtocolVersion } from './ahp/host.ts';
import type { Links } from './links.ts';
import type { Oidc } from './oidc.ts';
import { readFileSync } from 'node:fs';

const applicationVersion = (() => { try { return String(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version); } catch { return 'unknown'; } })();

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
  const streams = new Set<ServerResponse>();
  const knownSecrets = [config.litellm?.masterKey, config.runtime.password, config.auth.bootstrapPassword, ...(config.taskSources ?? []).map(source => source.token)].filter((value): value is string => Boolean(value));
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
          user, mode: config.mode, gateway: config.litellm ? new URL(config.litellm.baseUrl).host : undefined,
          gatewayPolicy: config.gatewayPolicy ?? null,
          observability: config.observability ?? null,
          repositories: config.repositories.map(({ id, name, description, baseBranch, trackerUrl, executionOwner }) => ({ id, name, description, baseBranch, trackerUrl, executionOwner: executionOwner ?? 'interactive' })),
          taskSources: (config.taskSources ?? []).map(source => ({ ...publicTaskSource(source), needsLink: !source.token && (source.provider === 'gitlab' || source.provider === 'clickup') ? source.provider : null })),
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
            const token = agentHost!.issueToken(user, text(data.label, 'Label', 80, true) || 'agent host');
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
        if (method === 'GET' && path === '/api/task-sources') return json(res, 200, sanitize((config.taskSources ?? []).map(source => ({ ...publicTaskSource(source), needsLink: !source.token && (source.provider === 'gitlab' || source.provider === 'clickup') ? source.provider : null }))));
        const taskRoute = path.match(/^\/api\/task-sources\/([a-z0-9-]+)\/tasks(?:\/([a-zA-Z0-9_-]+))?$/);
        if (method === 'GET' && taskRoute) {
          const source = config.taskSources?.find(item => item.id === taskRoute[1]);
          if (!source) fault(404, 'source_not_found', 'Task connection not found.');
          const resolved = await withUserToken(source!);
          if (taskRoute[2]) return json(res, 200, sanitize(await getTask(resolved, taskRoute[2])));
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
          if (source!.executionOwner !== 'interactive' || config.repositories.find(repo => repo.id === source!.repositoryId)?.executionOwner === 'ploeg') fault(403, 'ploeg_owned', 'Ploeg owns execution for this task connection. Assign its work through the tracker.');
          if (!runtimeKinds.includes(runtime) || !config.crews.some(crew => crew.id === crewId)) fault(400, 'unknown_profile', 'Choose a configured crew and runtime.');
          if (typeof data.budgetUsd !== 'number' || !Number.isFinite(data.budgetUsd) || data.budgetUsd <= 0 || data.budgetUsd > config.maxBudgetUsd) fault(400, 'budget', `Budget must be greater than zero and at most $${config.maxBudgetUsd}.`);
          const snapshot = await getTask(await withUserToken(source!), taskId);
          if (snapshot.revision !== revision) fault(409, 'task_changed', 'The task changed after your preview. Refresh it and review the updated version.');
          const result = engine.importTask(snapshot, { crewId, runtime, budgetUsd: data.budgetUsd as number, placement: placementInput(data.placement) }, user);
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
        if (method === 'GET' && path === '/api/ploeg') {
          if (!config.ploeg) return json(res, 200, { configured: false, teams: [], message: 'Connect Ploeg in the server configuration to inspect its queues.' });
          const teams = await Promise.all(config.ploeg.teams.map(async team => {
            try {
              const response = await fetch(`${config.ploeg!.url}/api/v1/queue/depth?team=${encodeURIComponent(team)}`, { signal: AbortSignal.timeout(4000), redirect: 'error' });
              if (!response.ok) throw new Error();
              const data = await response.json() as Record<string, unknown>;
              const depth = Number(data.depth ?? data.queued ?? data.count);
              if (!Number.isSafeInteger(depth) || depth < 0) throw new Error();
              return { team, available: true, depth };
            } catch { return { team, available: false, message: 'Queue could not be reached.' }; }
          }));
          return json(res, 200, { configured: true, teams, trackerUrl: config.ploeg.trackerUrl, message: 'Ploeg retains ownership of unattended dispatch. Assign work in the tracker.' });
        }
        const match = path.match(/^\/api\/sessions\/([a-zA-Z0-9_-]+)(?:\/(.*))?$/);
        if (match) {
          const [, id, action = ''] = match;
          const session = visible(id, user);
          if (method === 'GET' && !action) return json(res, 200, sanitize(publicSession(session)));
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
            let result: Session;
            if (action === 'start') result = await engine.start(id, user);
            else if (action === 'pause') result = await engine.pause(id, user);
            else if (action === 'resume') result = await engine.resume(id, user);
            else if (action === 'cancel') result = await engine.cancel(id, user);
            else if (action === 'retry') result = await engine.retry(id, user);
            else if (action === 'messages') result = engine.message(id, text(data.text, 'Instruction', 16000), user);
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
      const assets: Record<string, string> = { '/': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css', '/favicon.svg': 'favicon.svg' };
      if (method !== 'GET' || !assets[path]) return fault(404, 'not_found', 'Page not found.');
      const file = assets[path];
      const content = await readFile(join(config.publicDir, file));
      res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(content);
    } catch (error: any) {
      if (res.headersSent) { res.end(); return; }
      const status = Number(error.status || error.statusCode) || 500;
      const code = error.code || (status === 500 ? 'internal_error' : 'request_failed');
      const message = status >= 500 && !(error instanceof TaskError) ? 'The operation could not be completed. Check the server log.' : error.message;
      if (status >= 500) console.error(JSON.stringify({ level: 'error', event: 'http.failed', message: String(error.message).slice(0, 200).replace(/sk-[\w-]+/g, '[redacted]') }));
      json(res, status, sanitize({ error: { code, message } }));
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return { server, closeStreams: () => { for (const stream of streams) stream.end(); streams.clear(); } };
}
