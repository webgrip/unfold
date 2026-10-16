import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { actionContext, channelOf, confirmationOf, describeAction, isAction, outcomeOf, recordedInputs } from './action-records.ts';
import type { AppConfig, User, RuntimeKind, Session } from './types.ts';
import { Auth, editorCredentialDays, editorLabel, type EditorRequestView } from './auth.ts';
import type { Engine } from './engine.ts';
import { publicSession, type Store } from './store.ts';
import { getTask, listTasks, presentTask, publicTaskSource, TaskError } from './tasks.ts';
import { readCandidate, unavailableCandidate } from './candidates.ts';
import { placements } from './config.ts';
import type { WorkerRelay } from './runtime/relay.ts';
import type { AgentHost } from './ahp/host.ts';
import { agentHostTokenId, protocolBaselines as agentHostProtocolVersions, protocolVersion as agentHostProtocolVersion } from './ahp/host.ts';
import type { Links } from './links.ts';
import type { Oidc } from './oidc.ts';
import { readFileSync } from 'node:fs';
import { StatusBoard, gatewayProbe } from './status.ts';
import { CardService, importStatusLine } from './cards/service.ts';
import { CardStore } from './cards/card-store.ts';
import { PloegClient, PloegError, contextInput, contextUploadLimit, type PloegDecision } from './ploeg.ts';
import { DeliveryService } from './delivery.ts';
import { TaskHandoff } from './task-handoff.ts';
import { StaticFiles } from './static.ts';
import { Collection, CollectionError } from './collection.ts';
import { CardThemes, ThemeError } from './card-themes.ts';
import { AssetError, assetLimits, maxImageSide, maxUploadBytes } from './card-assets.ts';
import { CardArtError, CardArtGenerator, maxArtAttempts } from './card-art.ts';
import { InsightService, maxEventPayloadBytes, parseInsightEvents } from './insight.ts';
import { ReportError, ReportService, parseReport } from './reports.ts';
import { knownSecrets, withoutKnownSecrets } from './redaction.ts';
import { AskService, type AskAuthority } from './ask/service.ts';
import { noErrorReports, type ErrorReports } from './error-reports.ts';
import { FeatureFlags, loadRegistry, type FlagContext } from './flags.ts';
import { clientContext, ofrepBulk, ofrepFlag } from './flag-ofrep.ts';
import { defaultTenant } from './insight.ts';
import { createMcpHttp } from './mcp-http.ts';
import { entitledRole } from './oidc.ts';
import type { AddressInfo } from 'node:net';

const reportRefreshWaitMs = 2500;
const applicationVersion = (() => { try { return String(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version); } catch { return 'unknown'; } })();

/** The most events one storage read loads while streaming a session's history to a live event client. */
export const eventReplayBatch = 200;
const eventReplayBuffered = 262144;
const browserModule = /^\/(?:(?:core|views|styles)\/[a-z0-9][a-z0-9-]*\.(?:js|css)|cards\/(?:(?:skins\/[a-z0-9][a-z0-9-]*(?:\/world)?|effects)\/)?[a-z0-9][a-z0-9-]*\.(?:js|css|json)|vendor\/(?:three|html-to-image)\/[a-z0-9][a-z0-9-]*\.js)$/;

/** A request path with its ids replaced by `:id`, so errors on one route group together. */
export function routeShape(path: string): string {
  return path.split('/').map(part => /^[0-9]+$|^[0-9a-f-]{16,}$|^[A-Za-z0-9_-]{20,}$/i.test(part) ? ':id' : part).join('/').slice(0, 200);
}

function fault(status: number, code: string, message: string): never { throw Object.assign(new Error(message), { status, code }); }

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

const parsedBodies = new WeakMap<IncomingMessage, Record<string, unknown>>();

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const parsed = await readBody(req);
  parsedBodies.set(req, parsed);
  return parsed;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
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

async function upload(req: IncomingMessage, limit: number, tooLarge = 'asset_too_large'): Promise<Buffer> {
  if (req.headers['content-type'] !== 'application/octet-stream') fault(415, 'content_type', 'Upload the file as application/octet-stream.');
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > limit) fault(413, tooLarge, `The file is larger than the ${Math.round(limit / 1024 / 1024)} MiB upload limit.`);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) fault(413, tooLarge, `The file is larger than the ${Math.round(limit / 1024 / 1024)} MiB upload limit.`);
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

/** The Team a request names: `teamId`, or the retired `crewId` an older client still sends (system ADR-0036). Both at once must agree. */
function teamInput(data: Record<string, unknown>): string {
  if (data.teamId !== undefined && data.crewId !== undefined && data.teamId !== data.crewId) fault(400, 'team_conflict', 'teamId and crewId name different Teams. Send teamId only.');
  return text(data.teamId ?? data.crewId, 'Team', 64);
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

function loopbackUrl(address: AddressInfo): string {
  const host = address.address === '::' || address.address === '0.0.0.0' ? '127.0.0.1' : address.family === 'IPv6' ? `[${address.address}]` : address.address;
  return `http://${host}:${address.port}`;
}

function mutationGuard(req: IncomingMessage, config: AppConfig): void {
  if (req.headers['x-unfold-request'] !== '1') fault(403, 'csrf', 'The request is missing the application request header.');
  const origin = req.headers.origin;
  if (origin) {
    let expected: string;
    try { expected = new URL(config.baseUrl || `http://${req.headers.host}`).origin; }
    catch { return fault(403, 'origin', 'Invalid request origin.'); }
    if (origin !== expected) fault(403, 'origin', 'This request came from another origin.');
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') fault(403, 'origin', 'Cross-site requests are not allowed.');
}

export function buildServer(config: AppConfig, store: Store, engine: Engine, runtimeKinds: RuntimeKind[], relay?: WorkerRelay, agentHost?: AgentHost, links?: Links, oidc?: Oidc, errors: ErrorReports = noErrorReports) {
  const auth = new Auth(store, config);
  const ploeg = new PloegClient(config);
  const cards = config.ploeg && !config.ploeg.demo ? new CardService(ploeg, new CardStore(store.db), { settings: config.cards?.rules ?? {}, publish: config.cards?.publishPullRequestComment === true }) : undefined;
  if (cards) ploeg.useCards(cards);
  const delivery = new DeliveryService(config, store);
  void delivery.reconcileAll().catch(() => undefined);
  const handoff = new TaskHandoff(config, ploeg);
  const status = new StatusBoard(config, store, () => engine.provisioning(), {
    gateway: gatewayProbe(config),
    ploeg: async user => {
      if (!config.ploeg && config.mode !== 'demo') return 'unconfigured';
      try { await ploeg.teams(user, true); return 'ok'; }
      catch (error) { return error instanceof PloegError && error.code === 'ploeg_unconfigured' ? 'unconfigured' : error instanceof PloegError && error.status === 403 ? 'ok' : 'down'; }
    },
    ...(cards ? { cards: () => importStatusLine(cards.status().import) } : {}),
  });
  const streams = new Set<ServerResponse>();
  const staticFiles = new StaticFiles(config.publicDir);
  const collection = new Collection(config, store, ploeg, config.mode === 'demo' && (!config.ploeg || config.ploeg.demo === true));
  const themes = new CardThemes(store, config);
  const cardArt = new CardArtGenerator(config);
  const insight = new InsightService(store, config, applicationVersion);
  const reports = new ReportService(store, config, applicationVersion);
  const secrets = knownSecrets(config);
  const askDemo = config.mode === 'demo' && (!config.ploeg || config.ploeg.demo === true);
  const askAuthority: AskAuthority | undefined = config.ploeg && !askDemo ? {
    admit: (user, id, askId, question) => ploeg.admitAsk(user, id, askId, question),
    finish: (user, id, askId) => ploeg.finishAsk(user, id, askId),
    spend: async (user, id, askId) => { const spend = await ploeg.askSpend(user, id, askId); return { costUsd: spend.usd, costStatus: spend.costStatus }; },
    allowance: (user, team) => ploeg.askAllowance(user, team),
  } : undefined;
  const asks = new AskService(store, ploeg, askAuthority, { demo: askDemo, gatewayUrl: config.litellm?.baseUrl, secrets, reports: errors });
  agentHost?.useAsks(asks);
  const flags = new FeatureFlags({ registry: loadRegistry(), settings: config.flags ?? { document: {}, unknown: [] }, store });
  flags.watch();
  const flagContext = (user: User): FlagContext => {
    const choices = store.flagChoices(user.id);
    return { targetingKey: user.id, userId: user.id, role: user.role, tenantId: defaultTenant, mode: config.mode, teams: config.ploeg?.userTeams?.[user.id] ?? [], labs: Object.keys(choices).filter(key => choices[key]), labsOff: Object.keys(choices).filter(key => !choices[key]) };
  };
  const labsView = async (user: User) => {
    const context = flagContext(user);
    const choices = store.flagChoices(user.id);
    return {
      values: await flags.clientValues(context),
      labs: (await flags.labs(context)).map(({ key, metadata, evaluation }) => ({ key, title: metadata.title, description: metadata.description, kind: metadata.kind, expires: metadata.expires ?? null, value: evaluation.value, variant: evaluation.variant ?? null, reason: evaluation.reason, choice: Object.hasOwn(choices, key) ? (choices[key] ? 'on' : 'off') : 'default' })),
    };
  };
  const experimentDays = 30;
  const adminFlags = async (user: User) => {
    const since = new Date(Date.now() - experimentDays * 86_400_000).toISOString();
    const listed = await flags.list(flagContext(user));
    return sanitize({
      flags: listed.map(view => ({ ...view, experiment: view.metadata.kind === 'experiment' || Object.keys(view.rule.variants).length > 2 ? { days: experimentDays, ...store.flagExperiment(view.key, since) } : null })),
      segments: flags.segmentList(),
      audit: store.flagAudit(50),
      file: flags.fileStatus(),
      providers: flags.providerStatus(),
      strategy: flags.strategy,
      console: flags.console,
    });
  };
  agentHost?.useDelivery(delivery);
  function sanitize<T>(value: T): T {
    if (typeof value === 'string') return withoutKnownSecrets(value, secrets) as T;
    if (Array.isArray(value)) return value.map(item => sanitize(item)) as T;
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)])) as T;
    return value;
  }
  const account = (record: { id: string; name: string; role: User['role'] } | undefined): User | undefined => record ? { id: record.id, name: record.name, role: record.role } : undefined;
  const mcp = config.mcp && config.auth.oidc ? createMcpHttp({
    settings: config.mcp,
    subjectNamespace: config.mcp.subjectNamespace ?? config.auth.oidc.subjectNamespace ?? config.auth.oidc.issuer,
    findUser: id => account(store.getUser(id)),
    entitle: claims => entitledRole(config.auth.oidc!, claims),
    delegate: (user, ttlMs) => auth.delegate(user, ttlMs),
    apiUrl: () => loopbackUrl(server.address() as AddressInfo),
    linkUrl: config.baseUrl ?? new URL(config.mcp.resource).origin,
    version: applicationVersion,
  }) : undefined;
  function visible(id: string, user: User): Session {
    const session = store.getSession(id);
    if (!session || (session.ownerId !== user.id && user.role !== 'admin')) fault(404, 'not_found', 'Session not found.');
    return session as Session;
  }
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
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
        if (path === '/readyz') store.ping();
        return json(res, 200, { status: 'ok', version: applicationVersion });
      }
      if (mcp?.handles(path)) return await mcp.handle(req, res, path);
      if (relay && await relay.handle(req, res, url)) return;
      const editorCollect = path.match(/^\/api\/auth\/editor\/([A-Za-z0-9_-]{8,32})$/);
      const ofrep = path.startsWith('/api/ofrep/v1/evaluate/flags');
      if (['POST','PUT','PATCH','DELETE'].includes(method) && path !== '/api/auth/editor' && !editorCollect && !ofrep) mutationGuard(req, config);
      if (method === 'POST' && path === '/api/login') {
        const data = await body(req);
        const result = auth.login(text(data.name, 'Name', 100), typeof data.password === 'string' ? data.password : '', req.socket.remoteAddress || 'unknown');
        res.setHeader('Set-Cookie', result.cookie);
        return json(res, 200, { user: result.user });
      }
      if (method === 'GET' && path === '/api/auth/methods') return json(res, 200, { local: true, oidc: oidc?.configured() ? { name: config.auth.oidc!.displayName, issuer: config.auth.oidc!.issuer } : null });
      if (method === 'POST' && path === '/api/auth/editor' && oidc?.configured()) {
        const requested = req.headers['content-type']?.startsWith('application/json') ? await body(req) : {};
        const started = auth.beginEditor(req.socket.remoteAddress || 'unknown', editorLabel(requested.client, requested.host));
        return json(res, 200, { code: started.code, secret: started.secret, userCode: started.userCode, expiresIn: started.expiresIn, interval: started.interval, url: `${config.baseUrl ?? `http://${req.headers.host}`}/api/auth/oidc?editor=${encodeURIComponent(started.code)}` });
      }
      if (method === 'POST' && editorCollect) {
        const data = await body(req);
        const result = auth.collectEditor(editorCollect[1], typeof data.secret === 'string' ? data.secret : '');
        return json(res, result.status === 'ready' ? 200 : 202, result);
      }
      if (method === 'GET' && path === '/api/auth/oidc' && oidc?.configured()) {
        const editor = url.searchParams.get('editor') ?? undefined;
        if (editor !== undefined && !auth.editorPending(editor)) return fault(404, 'editor_login_unknown', 'This editor sign-in is unknown or has expired. Start it again from your editor.');
        const browser = auth.beginBrowserFlow(req);
        res.writeHead(303, { Location: await oidc.begin(browser.binding, editor), 'Set-Cookie': browser.cookie });
        res.end();
        return;
      }
      if (method === 'GET' && path === '/api/auth/oidc/callback' && oidc?.configured()) {
        const denied = url.searchParams.get('error');
        try {
          if (denied) throw Object.assign(new Error(denied), { code: denied.replace(/[^a-z_]/gi, '').slice(0, 40) || 'denied' });
          const identity = await oidc.complete(url.searchParams.get('code') ?? '', url.searchParams.get('state') ?? '', auth.browserBinding(req));
          const claimedName = identity.email ?? identity.name;
          const name = store.upsertUser({ id: identity.id, name: claimedName, role: identity.role, passwordHash: '' });
          if (name !== claimedName) console.error(JSON.stringify({ level: 'warn', event: 'login.name_taken', method: 'oidc', user: identity.id, name }));
          const issued = auth.issue({ id: identity.id, name, role: identity.role });
          if (identity.editor) auth.claimEditor(identity.editor, issued.user);
          res.writeHead(303, { Location: identity.editor ? `/#editor-sign-in/${encodeURIComponent(identity.editor)}` : '/', 'Set-Cookie': issued.cookie });
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
          try { await links.complete(provider, url.searchParams.get('code') ?? '', url.searchParams.get('state') ?? '', auth.browserBinding(req)); }
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
        const editorRequest = path.match(/^\/api\/editor-requests\/([A-Za-z0-9_-]{8,32})(?:\/(approve|deny))?$/);
        const editorCredential = path.match(/^\/api\/editor-credentials(?:\/([a-f0-9]{24}))?$/);
        if (editorRequest || editorCredential) {
          if (auth.scope(req) !== 'browser') fault(403, 'browser_only', 'Approve, list and revoke editor sign-ins from the workbench in your browser.');
          const requestView = (view: EditorRequestView) => ({ ...view, workbench: new URL(config.baseUrl ?? `http://${req.headers.host}`).host, user: user.name, role: user.role, credentialDays: editorCredentialDays });
          if (editorRequest && method === 'GET' && !editorRequest[2]) {
            const found = auth.editorRequest(editorRequest[1], user);
            if (!found) fault(404, 'editor_login_unknown', 'This editor sign-in is unknown or has expired. Start it again from your editor.');
            return json(res, 200, requestView(found));
          }
          if (editorRequest && method === 'POST' && editorRequest[2]) {
            const decided = auth.decideEditor(editorRequest[1], user, editorRequest[2] === 'approve' ? 'approved' : 'denied');
            console.log(JSON.stringify({ level: 'info', event: `editor.${decided.status}`, actor: user.id }));
            return json(res, 200, requestView(decided));
          }
          if (editorCredential && method === 'GET' && !editorCredential[1]) return json(res, 200, { editors: auth.editorCredentials(user) });
          if (editorCredential && method === 'DELETE' && editorCredential[1]) {
            agentHost?.revokeSignIn(auth.revokeEditorCredential(user, editorCredential[1]));
            return json(res, 200, { editors: auth.editorCredentials(user) });
          }
          fault(405, 'method', 'Unsupported method.');
        }
        if (method === 'GET' && path === '/api/reports') {
          await Promise.race([reports.refresh(user).catch(() => undefined), new Promise(done => setTimeout(done, reportRefreshWaitMs).unref())]);
          const mine = reports.mine(user);
          return json(res, 200, { reports: mine, updates: mine.filter(report => report.unread).length });
        }
        if (method === 'POST' && path === '/api/reports/seen') { reports.seen(user); return json(res, 200, { updates: 0 }); }
        if (method === 'GET' && path === '/api/reports/similar') return json(res, 200, { reports: reports.similar(user, (url.searchParams.get('q') ?? '').slice(0, 4000), url.searchParams.get('route')?.slice(0, 200) || undefined) });
        const reportReply = /^\/api\/reports\/([^/]+)\/replies$/.exec(path);
        if (method === 'POST' && reportReply) {
          try { return json(res, 201, { report: await reports.reply(user, reportReply[1], (await body(req)).text) }); }
          catch (error) {
            if (error instanceof ReportError || error instanceof TaskError) return json(res, error.status, { error: { code: error.code, message: error.message } });
            throw error;
          }
        }
        if (method === 'POST' && path === '/api/reports') {
          try {
            const parsed = await parseReport(req);
            const outcome = await reports.submit(user, parsed);
            if (config.productEvents !== false) insight.ingest([{ name: 'report.filed', at: new Date().toISOString(), session: '', screen: parsed.context.screen ?? '', ...(parsed.context.workItemId !== undefined ? { workItemId: parsed.context.workItemId } : {}), props: {} }], user);
            return json(res, 201, outcome);
          } catch (error) {
            if (error instanceof ReportError) return json(res, error.status, { error: { code: error.code, message: error.message } });
            throw error;
          }
        }
        if (method === 'POST' && path === '/api/insight/events') {
          if (config.productEvents === false) { res.writeHead(204, { 'Cache-Control': 'no-store' }); return res.end(); }
          if (user.role === 'viewer') fault(403, 'forbidden', 'Viewers cannot post product events.');
          const declared = Number(req.headers['content-length'] ?? 0);
          if (declared > maxEventPayloadBytes) fault(413, 'insight_batch_too_large', `A batch is at most ${maxEventPayloadBytes} bytes.`);
          const data = await body(req);
          if (JSON.stringify(data.events ?? data).length > maxEventPayloadBytes) fault(413, 'insight_batch_too_large', `A batch is at most ${maxEventPayloadBytes} bytes.`);
          const posted = Array.isArray(data.events) ? data.events.length : 0;
          const events = parseInsightEvents(data.events, new Date().toISOString());
          insight.ingest(events, user);
          return json(res, 202, { accepted: events.length, dropped: posted - events.length });
        }
        if (ofrep) {
          if (method !== 'POST') fault(405, 'method', 'OFREP evaluation uses POST.');
          const requested = req.headers['content-type']?.startsWith('application/json') ? await body(req) : {};
          const context = { ...clientContext(requested.context), ...flagContext(user) };
          const single = path.match(/^\/api\/ofrep\/v1\/evaluate\/flags\/([A-Za-z0-9_.-]{1,200})$/);
          if (single) {
            const key = decodeURIComponent(single[1]);
            if (!flags.provider.registry.flags[key]?.metadata.client) return json(res, 404, { key, errorCode: 'FLAG_NOT_FOUND', errorDetails: 'No flag by this key is visible to clients.' });
            const flag = ofrepFlag(await flags.details(key, context));
            return json(res, 'errorCode' in flag ? 400 : 200, flag);
          }
          if (path !== '/api/ofrep/v1/evaluate/flags') fault(404, 'not_found', 'Unknown OFREP path.');
          const { body: answer, etag } = ofrepBulk(await flags.clientDetails(context));
          if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-store' }); return res.end(); }
          res.setHeader('ETag', etag);
          return json(res, 200, answer);
        }
        if (method === 'GET' && path === '/api/flags') return json(res, 200, await labsView(user));
        const flagChoice = path.match(/^\/api\/flags\/([a-z][a-z0-9.-]{2,100})\/choice$/);
        if (flagChoice && method === 'PUT') {
          const key = flagChoice[1];
          if (!flags.provider.registry.flags[key]?.metadata.labs) fault(404, 'flag_not_found', 'This flag is not offered in Labs.');
          const data = await body(req);
          if (!['on', 'off', 'default'].includes(String(data.choice))) fault(400, 'flag_choice', 'Choose on, off or default.');
          store.setFlagChoice(user.id, key, data.choice === 'default' ? null : data.choice === 'on', new Date().toISOString());
          console.log(JSON.stringify({ level: 'info', event: 'flag.choice', actor: user.id, 'feature_flag.key': key, choice: data.choice }));
          return json(res, 200, await labsView(user));
        }
        const flagOverride = path.match(/^\/api\/admin\/flags\/([a-z][a-z0-9.-]{2,100})\/override$/);
        const flagRollout = path.match(/^\/api\/admin\/flags\/([a-z][a-z0-9.-]{2,100})\/rollout$/);
        const flagSegment = path.match(/^\/api\/admin\/flag-segments\/([a-z][a-z0-9-]{0,63})$/);
        if ((path.startsWith('/api/admin/flags') || path.startsWith('/api/admin/flag-segments')) && user.role !== 'admin') fault(403, 'forbidden', 'Only administrators manage feature flags.');
        if (method === 'GET' && path === '/api/admin/flags') return json(res, 200, await adminFlags(user));
        if (method === 'GET' && path === '/api/admin/flags/export') return json(res, 200, flags.exportDocument());
        if (flagRollout && method === 'PUT') {
          const data = await body(req);
          const reason = data.rollout === null ? text(data.reason, 'Reason', 300, true) : text(data.reason, 'Reason', 300);
          const spec = flags.setRollout(flagRollout[1], data.rollout ?? null, user.name, reason);
          console.log(JSON.stringify({ level: 'info', event: spec ? 'flag.rollout_set' : 'flag.rollout_cleared', actor: user.id, 'feature_flag.key': flagRollout[1], rules: spec?.rules.length ?? 0 }));
          return json(res, 200, await adminFlags(user));
        }
        if (flagSegment && (method === 'PUT' || method === 'DELETE')) {
          const data = method === 'PUT' ? await body(req) : null;
          flags.setSegment(flagSegment[1], data, user.name);
          console.log(JSON.stringify({ level: 'info', event: method === 'PUT' ? 'flag.segment_set' : 'flag.segment_deleted', actor: user.id, segment: flagSegment[1] }));
          return json(res, 200, await adminFlags(user));
        }
        if (flagOverride && method === 'PUT') {
          const data = await body(req);
          const variant = data.variant === null ? null : text(data.variant, 'Variant', 64);
          const reason = variant === null ? text(data.reason, 'Reason', 300, true) : text(data.reason, 'Reason', 300);
          const override = flags.setOverride(flagOverride[1], variant, user.name, reason);
          console.log(JSON.stringify({ level: 'info', event: override ? 'flag.override_set' : 'flag.override_cleared', actor: user.id, 'feature_flag.key': flagOverride[1], variant }));
          return json(res, 200, await adminFlags(user));
        }
        if (method === 'GET' && path === '/api/bootstrap') return json(res, 200, sanitize({
          user, mode: config.mode, sharedExecution: Boolean(config.execution), deliveryRepositories: config.delivery?.policies.map(policy => policy.repositoryId) ?? [], deliveryPublisher: Boolean(config.delivery?.publisher), gateway: config.litellm ? new URL(config.litellm.baseUrl).host : undefined,
          gatewayPolicy: config.gatewayPolicy ?? null,
          observability: config.observability ?? null,
          insight: { events: config.productEvents !== false && user.role !== 'viewer' },
          reports: { target: reports.publicTarget(), demo: config.mode === 'demo' },
          repositories: config.repositories.map(({ id, name, description, baseBranch, trackerUrl, executionOwner }) => ({ id, name, description, baseBranch, trackerUrl, executionOwner: executionOwner ?? 'interactive' })),
          taskSources: (config.taskSources ?? []).map(source => ({ ...publicTaskSource(source, config.ploeg), needsLink: !source.token && (source.provider === 'gitlab' || source.provider === 'clickup') ? source.provider : null })),
          teams: config.teams, crews: config.teams, models: config.models,
          runtimes: runtimeKinds.map(id => ({ id, name: id === 'demo' ? 'Demonstration' : id === 'opencode' ? 'OpenCode' : 'Command bridge', available: true })),
          placements: placements(config),
          maxBudgetUsd: config.maxBudgetUsd, maxConcurrentSessions: config.maxConcurrentSessions,
          flags: await flags.clientValues(flagContext(user))
        }));
        if (method === 'GET' && path === '/api/status') return json(res, 200, sanitize(await status.report(user)));
        if (method === 'POST' && path === '/api/status/notes') return json(res, 201, sanitize(status.addNote(user, await body(req))));
        const statusNote = path.match(/^\/api\/status\/notes\/([0-9a-f-]{36})\/resolve$/);
        if (method === 'POST' && statusNote) return json(res, 200, sanitize(status.resolveNote(user, statusNote[1])));
        if (method === 'GET' && path === '/api/health') return json(res, 200, { status: 'ok', mode: config.mode, version: applicationVersion, runtimes: runtimeKinds, litellm: Boolean(config.litellm), gateway: config.litellm ? new URL(config.litellm.baseUrl).host : undefined, workspaceBackend: config.mode === 'demo' ? 'demo' : config.runtime.backend, workspaceBackends: placements(config).map(item => item.id) });
        const agentHostToken = path.match(/^\/api\/agent-host\/tokens\/([0-9a-f]{64})$/);
        if (path === '/api/agent-host' || path === '/api/agent-host/tokens' || agentHostToken) {
          if (!agentHost) fault(404, 'agent_host_disabled', 'The agent host is not enabled on this workbench.');
          const address = (config.baseUrl ?? `http://${config.host}:${config.port}`).replace(/^http/, 'ws');
          if (method === 'GET' && path === '/api/agent-host') {
            const attached = agentHost!.attachedClients(user);
            return json(res, 200, { protocolVersion: agentHostProtocolVersion, protocolVersions: agentHostProtocolVersions, address, provider: 'unfold', clients: attached.length, attached, vscodeSetting: { key: 'chat.remoteAgentHosts', entry: { address, name: 'Unfold', connectionToken: '<token from POST /api/agent-host/tokens>' } } });
          }
          if (method === 'POST' && path === '/api/agent-host/tokens') {
            if (user.role === 'viewer') fault(403, 'forbidden', 'Viewers cannot connect an agent host.');
            const data = await body(req);
            const token = agentHost!.issueToken(user, text(data.label, 'Label', 80, true) || 'agent host', auth.signIn(req));
            return json(res, 201, { token, id: agentHostTokenId(token), address, vscodeSetting: { key: 'chat.remoteAgentHosts', entry: { address, name: 'Unfold', connectionToken: token } } });
          }
          if (method === 'DELETE' && agentHostToken) {
            if (!agentHost!.revokeToken(user, agentHostToken[1])) fault(404, 'not_found', 'No connection token of yours has this identifier.');
            return json(res, 200, { revoked: true });
          }
          fault(405, 'method', 'Unsupported method.');
        }
        if (method === 'GET' && path === '/api/attestations/public-key') {
          const key = engine.signing();
          res.writeHead(200, { 'Content-Type': 'application/x-pem-file', 'Content-Disposition': 'attachment; filename="unfold-attestation.pub"', 'Cache-Control': 'no-store', 'X-Key-Id': key.id });
          res.end(key.publicPem());
          return;
        }
        if (method === 'GET' && path === '/api/models') return json(res, 200, { models: await engine.describeModels() });
        if (method === 'GET' && path === '/api/links') return json(res, 200, { links: links ? links.describeAll(user.id) : [] });
        const linkRoute = path.match(/^\/api\/links\/(gitlab|clickup)$/);
        if (linkRoute && links) {
          const provider = linkRoute[1] as 'gitlab' | 'clickup';
          if (method === 'POST') {
            const browser = auth.beginBrowserFlow(req);
            const url = links.begin(provider, user.id, browser.binding);
            res.setHeader('Set-Cookie', browser.cookie);
            return json(res, 200, { url });
          }
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
          const teamId = teamInput(data);
          const runtime = text(data.runtime, 'Runtime', 32) as RuntimeKind;
          const source = config.taskSources?.find(item => item.id === sourceId);
          if (!source) fault(404, 'source_not_found', 'Task connection not found.');
          if (!config.execution && (source!.executionOwner !== 'interactive' || config.repositories.find(repo => repo.id === source!.repositoryId)?.executionOwner === 'ploeg')) fault(403, 'ploeg_owned', 'Ploeg owns execution for this task connection. Assign its work through the tracker.');
          if (!runtimeKinds.includes(runtime) || !config.teams.some(team => team.id === teamId)) fault(400, 'unknown_profile', 'Choose a configured team and runtime.');
          if (typeof data.budgetUsd !== 'number' || !Number.isFinite(data.budgetUsd) || data.budgetUsd <= 0 || data.budgetUsd > config.maxBudgetUsd) fault(400, 'budget', `Budget must be greater than zero and at most $${config.maxBudgetUsd}.`);
          const snapshot = await getTask(await withUserToken(source!), taskId);
          if (snapshot.revision !== revision) fault(409, 'task_changed', 'The task changed after your preview. Refresh it and review the updated version.');
          const result = await engine.importTask(snapshot, { teamId, runtime, budgetUsd: data.budgetUsd as number, placement: placementInput(data.placement) }, user, typeof data.bindingRevision === 'string' ? data.bindingRevision : undefined);
          return json(res, result.created ? 201 : 200, sanitize(publicSession(result.session)));
        }
        if (method === 'GET' && path === '/api/sessions') return json(res, 200, sanitize(store.listSessions().filter(session => session.ownerId === user.id || user.role === 'admin').map(publicSession)));
        if (method === 'POST' && path === '/api/sessions') {
          if (user.role === 'viewer') fault(403, 'forbidden', 'Viewers cannot start work.');
          const data = await body(req);
          const runtime = text(data.runtime, 'Runtime', 32) as RuntimeKind;
          const repositoryId = text(data.repositoryId, 'Repository', 64);
          const teamId = teamInput(data);
          if (!runtimeKinds.includes(runtime) || !config.repositories.some(repo => repo.id === repositoryId) || !config.teams.some(team => team.id === teamId)) fault(400, 'unknown_profile', 'Choose a configured repository, team and runtime.');
          if (typeof data.budgetUsd !== 'number' || !Number.isFinite(data.budgetUsd) || data.budgetUsd <= 0 || data.budgetUsd > config.maxBudgetUsd) fault(400, 'budget', `Budget must be greater than zero and at most $${config.maxBudgetUsd}.`);
          const trackerUrl = text(data.trackerUrl, 'Tracker link', 2048, true);
          if (trackerUrl) {
            let parsed: URL;
            try { parsed = new URL(trackerUrl); } catch { return fault(400, 'tracker_url', 'Use an HTTP(S) tracker link.'); }
            if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password) fault(400, 'tracker_url', 'Use an HTTP(S) tracker link without credentials.');
          }
          const session = engine.create({ approval: data.approval as 'manual' | 'auto' | undefined, model: text(data.model, 'Model', 64, true) || undefined, title: text(data.title, 'Title', 160), objective: text(data.objective, 'Objective', 16000), repositoryId, teamId, runtime, placement: placementInput(data.placement), budgetUsd: data.budgetUsd as number, trackerUrl: trackerUrl || undefined }, user);
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
            const world = /^\/api\/cards\/([^/]{1,40})\/world$/.exec(path);
            if (world && method === 'GET') return json(res, 200, await collection.cardWorld(user, world[1]));
            if (world && method === 'PUT') { const data = await body(req); return json(res, 200, await collection.saveCardWorld(user, world[1], data.world)); }
            if (world && method === 'DELETE') return json(res, 200, await collection.resetCardWorld(user, world[1]));
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
        if (path === '/api/actions') {
          if (method !== 'GET') fault(405, 'method', 'List actions with GET.');
          const workItem = url.searchParams.get('workItemId');
          const session = url.searchParams.get('sessionId');
          const before = Number(url.searchParams.get('before') ?? '');
          const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? '') || 50));
          const target = workItem ? { kind: 'work-item' as const, id: text(workItem, 'Work Item', 40) } : session ? { kind: 'session' as const, id: text(session, 'Session', 80) } : undefined;
          const person = user.role === 'admin' ? url.searchParams.get('userId') || undefined : user.id;
          const actions = store.actionRecords({ userId: person, target, before: Number.isInteger(before) && before > 0 ? before : undefined, limit: limit + 1 });
          return json(res, 200, sanitize({ actions: actions.slice(0, limit), nextBefore: actions.length > limit ? actions[limit - 1].id : null }));
        }
        if (path === '/api/asks') {
          if (method !== 'GET') fault(405, 'method', 'List your Asks with GET.');
          return json(res, 200, sanitize(await asks.mine(user)));
        }
        if (path === '/api/ploeg' || path.startsWith('/api/ploeg/')) {
          const decision = /^\/api\/ploeg\/work-items\/([^/]+)\/(approve|reject|cancel)$/.exec(path);
          const attribution = /^\/api\/ploeg\/work-items\/([^/]+)\/(cracks|evolved)$/.exec(path);
          const crackStep = /^\/api\/ploeg\/work-items\/([^/]+)\/cracks\/([^/]+)\/(confirm|dispute|resolve)$/.exec(path);
          const context = /^\/api\/ploeg\/work-items\/([^/]+)\/context$/.exec(path);
          const asked = /^\/api\/ploeg\/work-items\/([^/]+)\/asks$/.exec(path);
          if (asked) {
            try {
              if (method === 'GET') return json(res, 200, sanitize(await asks.about(user, asked[1])));
              if (method !== 'POST') fault(405, 'method', 'Ask with POST; list Asks with GET.');
              const data = await body(req);
              if (data.askModel === true && data.recordOnly === true) fault(400, 'ask_request', 'Choose askModel or recordOnly, not both.');
              return json(res, 201, sanitize(await asks.ask(user, asked[1], data.question, 'internal', { model: data.askModel === true, recordOnly: data.recordOnly === true })));
            } catch (error) {
              if (error instanceof PloegError) return json(res, error.status, { error: { code: error.code, message: error.message } });
              throw error;
            }
          }
          if (method !== 'GET' && !(method === 'POST' && (decision || attribution || crackStep || context))) fault(405, 'method', 'Ploeg operator views are read-only except Work Item decisions, context files and crack attributions.');
          try {
            if (method === 'POST' && (decision || attribution || crackStep || context)) {
              if (user.role === 'viewer') fault(403, 'forbidden', 'Viewers cannot change Ploeg work.');
              if (context) {
                const input = contextInput(url.searchParams.get('name'), url.searchParams.get('note') ?? undefined);
                const added = await ploeg.addContext(user, context[1], input.name, input.note, await upload(req, contextUploadLimit, 'context_too_large'));
                return json(res, added.created ? 201 : 200, sanitize(added));
              }
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
            if (path === '/api/ploeg/work-items') return json(res, 200, sanitize(await ploeg.items(user, text(url.searchParams.get('team'), 'Team', 100), url.searchParams.get('state') ?? 'all', url.searchParams.get('cursor') ?? '0', fresh)));
            const card = /^\/api\/ploeg\/work-items\/([^/]+)\/card$/.exec(path);
            if (card) return json(res, 200, sanitize(await ploeg.card(user, card[1], fresh)));
            const stream = /^\/api\/ploeg\/work-items\/([^/]+)\/value-stream$/.exec(path);
            if (stream) return json(res, 200, sanitize(await ploeg.valueStream(user, stream[1], fresh)));
            const runLogs = /^\/api\/ploeg\/work-items\/([^/]+)\/runs\/([^/]+)\/logs$/.exec(path);
            if (runLogs) return json(res, 200, sanitize(await ploeg.runLogs(user, runLogs[1], runLogs[2], optional('after'), fresh)));
            const runTranscript = /^\/api\/ploeg\/work-items\/([^/]+)\/runs\/([^/]+)\/transcript$/.exec(path);
            if (runTranscript) return json(res, 200, sanitize(await ploeg.runTranscript(user, runTranscript[1], runTranscript[2], optional('after'), fresh)));
            const candidates = /^\/api\/ploeg\/work-items\/([^/]+)\/crack-candidates$/.exec(path);
            if (candidates) return json(res, 200, sanitize(await ploeg.crackCandidates(user, candidates[1], fresh)));
            const cracks = /^\/api\/ploeg\/work-items\/([^/]+)\/cracks$/.exec(path);
            if (cracks) return json(res, 200, sanitize(await ploeg.cracks(user, cracks[1], fresh)));
            if (context) return json(res, 200, sanitize(await ploeg.listContext(user, context[1], fresh)));
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
          if (method === 'GET' && action === 'investigation') return json(res, 200, sanitize(await engine.investigation(id)));
          if (method === 'GET' && action === 'recovery') return json(res, 200, sanitize(await engine.recovery(id, user)));
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
                for (;;) {
                  const page = store.eventPage(id, cursor, eventReplayBatch);
                  for (const event of page) {
                    if (res.writableLength > 1048576) { res.destroy(); return; }
                    res.write(`id: ${event.id}\ndata: ${JSON.stringify(sanitize(event))}\n\n`);
                    cursor = event.id;
                  }
                  if (page.length < eventReplayBatch || res.writableLength > eventReplayBuffered) break;
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
            if (action === 'delivery/publish') return json(res, 200, sanitize(await delivery.publish(id, user, data)));
            if (action === 'run-again') return json(res, 201, sanitize(publicSession(engine.runAgain(id, user))));
            let result: Session;
            if (action === 'deliver') result = await engine.deliver(id, user);
            else if (action === 'capture') result = await engine.capture(id, user);
            else if (action === 'start') result = await engine.start(id, user);
            else if (action === 'pause') result = await engine.pause(id, user);
            else if (action === 'resume') result = await engine.resume(id, user);
            else if (action === 'cancel') result = await engine.cancel(id, user);
            else if (action === 'retry') result = await engine.retry(id, user);
            else if (action === 'close-work-item') result = await engine.closeWorkItem(id, user);
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
      const assets: Record<string, string> = { '/': 'index.html', '/app.js': 'app.js', '/shell.js': 'shell.js', '/now.js': 'now.js', '/handoff.js': 'handoff.js', '/ploeg.js': 'ploeg.js', '/ploeg-activity.js': 'ploeg-activity.js', '/run-transcript.js': 'run-transcript.js', '/run-log-view.js': 'run-log-view.js', '/delivery.js': 'delivery.js', '/styles.css': 'styles.css', '/favicon.svg': 'favicon.svg', '/favicon.ico': 'favicon.ico', '/favicon-16x16.png': 'favicon-16x16.png', '/favicon-32x32.png': 'favicon-32x32.png', '/apple-touch-icon.png': 'apple-touch-icon.png', '/android-chrome-192x192.png': 'android-chrome-192x192.png', '/android-chrome-512x512.png': 'android-chrome-512x512.png', '/site.webmanifest': 'site.webmanifest', '/og-image.png': 'og-image.png', '/fonts/archivo-latin-wght-wdth110.woff2': 'fonts/archivo-latin-wght-wdth110.woff2', '/fonts/archivo-latin-ext-wght-wdth110.woff2': 'fonts/archivo-latin-ext-wght-wdth110.woff2', '/fonts/OFL.txt': 'fonts/OFL.txt' };
      const file = assets[path] ?? (browserModule.test(path) ? path.slice(1) : undefined);
      if (method !== 'GET' || !file) return fault(404, 'not_found', 'Page not found.');
      await staticFiles.serve(req, res, file, Boolean(assets[path]));
    } catch (error: any) {
      if (res.headersSent) { res.end(); return; }
      const status = Number(error.status || error.statusCode) || 500;
      const code = error.code || (status === 500 ? 'internal_error' : 'request_failed');
      const message = status >= 500 && !(error instanceof TaskError) && !(error instanceof PloegError) && !(error instanceof CardArtError) && !(error instanceof AssetError) && !(error instanceof ThemeError) ? 'The operation could not be completed. Check the server log.' : error.message;
      if (status >= 500) {
        console.error(JSON.stringify({ level: 'error', event: 'http.failed', message: String(error.message).slice(0, 200).replace(/sk-[\w-]+/g, '[redacted]') }));
        const route = `${req.method || 'GET'} ${routeShape(new URL(req.url || '/', 'http://localhost').pathname)}`;
        errors.capture(error, { level: 'error', tags: { feature: 'http', route, http_status: status, code }, fingerprint: ['http', route, String(code)] });
      }
      json(res, status, sanitize({ error: { code, message } }));
    }
  };
  const server = createServer((req, res) => {
    const method = req.method || 'GET';
    const requested = new URL(req.url || '/', 'http://localhost');
    const path = requested.pathname;
    if (!isAction(method, path)) { void handle(req, res); return; }
    const scope = auth.scope(req);
    const signIn = scope === 'editor' ? auth.signIn(req) : undefined;
    const channel = channelOf(scope, signIn ? store.getEditorCredential(signIn)?.label : undefined, req.headers['x-unfold-client']);
    const confirmation = confirmationOf(req.headers['x-unfold-confirmation']);
    res.once('finish', () => {
      const user = auth.user(req);
      if (!user || res.statusCode === 401) return;
      const { action, target } = describeAction(method, path);
      try { store.recordAction({ at: new Date().toISOString(), userId: user.id, userName: user.name, role: user.role, channel, action, method, target, inputs: recordedInputs({ ...(parsedBodies.get(req) ?? {}), ...(requested.search ? { query: Object.fromEntries(requested.searchParams) } : {}) }) as Record<string, unknown>, confirmation, status: res.statusCode, outcome: outcomeOf(res.statusCode) }); }
      catch (error) { console.error(JSON.stringify({ level: 'error', event: 'action_record.failed', action, message: String((error as Error).message).slice(0, 300) })); }
    });
    void actionContext.run({ via: channel, confirmation }, () => handle(req, res));
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return { server, cards, closeStreams: () => { for (const stream of streams) stream.end(); streams.clear(); }, stopInsight: () => { insight.stop(); reports.stop(); flags.close(); }, reports };
}
