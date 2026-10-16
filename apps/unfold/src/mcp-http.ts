import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccessTokenVerifier, KeysUnavailable, TokenRefused, challenge, metadataPath, resourceMetadata, type AccessToken, type McpHttpSettings } from './mcp-auth.ts';
import { confirmationLedger, createMcpServer, mcpModernProtocolVersions, mcpProtocolVersions } from './mcp.ts';
import { subjectUserId } from './oidc.ts';
import type { User } from './types.ts';

/** What the MCP endpoint inside the Unfold server needs from the rest of it. */
export type McpHttpOptions = {
  settings: McpHttpSettings;
  /** The namespace browser sign-in derives account ids from: `auth.oidc.subjectNamespace`, or its issuer. */
  subjectNamespace: string;
  findUser(id: string): User | undefined;
  findUserByName(name: string): User | undefined;
  delegate(user: User, ttlMs: number): { token: string; revoke(): void };
  /** Where this process's own API answers, such as its loopback address. */
  apiUrl(): string;
  /** Where links in tool results point: the Unfold people open in a browser. */
  linkUrl: string;
  version: string;
  fetch?: typeof fetch;
  now?: () => number;
};

const maxBodyBytes = 1_048_576;
const delegationMs = 120_000;
const knownVersions: readonly string[] = [...mcpModernProtocolVersions, ...mcpProtocolVersions];

function send(res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
}

function problem(res: ServerResponse, status: number, code: string, message: string, headers: Record<string, string> = {}): void {
  send(res, status, { error: { code, message } }, headers);
}

function rpcError(res: ServerResponse, status: number, id: unknown, code: number, message: string, data?: unknown): void {
  send(res, status, { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } });
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value.join(',') : value;
}

function decodeHeader(value: string): string | undefined {
  const encoded = /^=\?base64\?([A-Za-z0-9+/]*={0,2})\?=$/.exec(value);
  if (!encoded) return /^[\x20-\x7e\t]*$/.test(value) ? value : undefined;
  try { return Buffer.from(encoded[1], 'base64').toString('utf8'); } catch { return undefined; }
}

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (Number(req.headers['content-length'] ?? 0) > maxBodyBytes) return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBodyBytes) return undefined;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Serves `unfold-mcp` as stateless Streamable HTTP with JSON responses, behind an OAuth 2.1 resource-server check.
 * Each request's access token is verified, its subject is mapped to an Unfold account, and the tools then call
 * Unfold's API as that account with a short-lived credential of this process. The caller's token goes no further.
 */
export function createMcpHttp(options: McpHttpOptions) {
  const { settings } = options;
  const resource = new URL(settings.resource);
  const endpoint = resource.pathname;
  const metadataPaths = new Set(['/.well-known/oauth-protected-resource', metadataPath(endpoint)]);
  const verifier = new AccessTokenVerifier(settings, { ...(options.fetch ? { fetch: options.fetch } : {}), ...(options.now ? { now: options.now } : {}) });
  const confirmations = confirmationLedger();
  const metadata = resourceMetadata(settings);

  function identify(token: AccessToken): User | undefined {
    const bySubject = options.findUser(subjectUserId(options.subjectNamespace, token.subject));
    if (bySubject) return bySubject;
    if (!token.email || !token.emailVerified) return undefined;
    const byEmail = options.findUserByName(token.email);
    return byEmail?.id.startsWith('oidc-') ? byEmail : undefined;
  }

  async function serveEndpoint(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authorization = /^Bearer\s+([A-Za-z0-9._~+/-]+=*)\s*$/i.exec(header(req, 'authorization') ?? '');
    if (!authorization) return problem(res, 401, 'unauthorized', 'Sign in to use this MCP server.', { 'WWW-Authenticate': challenge(settings) });
    let token: AccessToken;
    try { token = await verifier.verify(authorization[1]); }
    catch (error) {
      if (error instanceof TokenRefused) return problem(res, 401, 'unauthorized', `The access token was refused: ${error.reason}.`, { 'WWW-Authenticate': challenge(settings, { code: 'invalid_token', description: error.reason }) });
      if (error instanceof KeysUnavailable) return problem(res, 503, 'service_unavailable', 'The identity provider\'s signing keys are unavailable; try again shortly.');
      throw error;
    }
    if (!token.scopes.includes(settings.scope)) return problem(res, 403, 'forbidden', `The access token lacks the scope ${settings.scope}; sign in again and grant it.`, { 'WWW-Authenticate': challenge(settings, { code: 'insufficient_scope', description: `requires ${settings.scope}` }) });
    const user = identify(token);
    if (!user) {
      const who = token.email ?? token.username ?? token.subject;
      console.error(JSON.stringify({ level: 'warn', event: 'mcp.unmapped', client: token.client }));
      return problem(res, 403, 'forbidden', `Signed in as ${who}, but no Unfold account belongs to this identity. Sign in to Unfold in the browser once with the same account, then connect again.`);
    }
    const origin = header(req, 'origin');
    if (origin !== undefined && origin !== resource.origin) return problem(res, 403, 'forbidden', 'This request came from another origin.');
    if (req.method !== 'POST') return problem(res, 405, 'method_not_allowed', 'This MCP endpoint is stateless and accepts only POST.', { Allow: 'POST' });
    if (!header(req, 'content-type')?.toLowerCase().startsWith('application/json')) return problem(res, 415, 'unsupported_media_type', 'Send one JSON-RPC message as application/json.');
    const raw = await readBody(req);
    if (!raw) return rpcError(res, 413, null, -32600, 'Message exceeds 1 MiB.');
    let message: any;
    try { message = JSON.parse(raw.toString('utf8')); } catch { return rpcError(res, 400, null, -32700, 'Parse error.'); }
    if (!message || typeof message !== 'object' || Array.isArray(message)) return rpcError(res, 400, null, -32600, 'Expected one JSON-RPC request object.');
    if (message.id === undefined) { res.writeHead(202, { 'Cache-Control': 'no-store' }); res.end(); return; }
    const { id, method, params } = message;
    const versionHeader = header(req, 'mcp-protocol-version');
    const declared = params?._meta?.['io.modelcontextprotocol/protocolVersion'];
    if (versionHeader !== undefined && !knownVersions.includes(versionHeader)) return rpcError(res, 400, id, -32022, 'Unsupported protocol version', { supported: knownVersions, requested: versionHeader });
    const modern = versionHeader !== undefined && (mcpModernProtocolVersions as readonly string[]).includes(versionHeader);
    if (modern || declared !== undefined) {
      if (declared !== versionHeader) return rpcError(res, 400, id, -32020, `Header mismatch: MCP-Protocol-Version ${JSON.stringify(versionHeader ?? null)} does not match _meta ${JSON.stringify(declared ?? null)}.`);
      if (header(req, 'mcp-method') !== method) return rpcError(res, 400, id, -32020, 'Header mismatch: Mcp-Method is missing or does not match the method.');
      if (method === 'tools/call') {
        const name = header(req, 'mcp-name');
        if (name === undefined || decodeHeader(name) !== params?.name) return rpcError(res, 400, id, -32020, 'Header mismatch: Mcp-Name is missing or does not match the tool name.');
      }
    }
    const delegated = options.delegate(user, delegationMs);
    let answer: any;
    try {
      const server = createMcpServer({ url: options.linkUrl, apiUrl: options.apiUrl(), token: delegated.token, version: options.version, principal: user.id, confirmations });
      answer = await server.handle(message);
    } finally { delegated.revoke(); }
    console.log(JSON.stringify({ level: 'info', event: 'mcp.request', actor: user.id, method: String(method).slice(0, 64), ...(method === 'tools/call' ? { tool: String(params?.name ?? '').slice(0, 64) } : {}), protocol: modern ? 'stateless' : 'legacy' }));
    const code = answer?.error?.code;
    const status = code === undefined ? 200 : modern && code === -32601 ? 404 : modern || [-32020, -32021, -32022].includes(code) ? 400 : 200;
    send(res, status, answer);
  }

  return {
    /** Whether a request path is the MCP endpoint or its protected resource metadata. */
    handles(path: string): boolean { return path === endpoint || metadataPaths.has(path); },
    /** Resolves once the issuer's keys have been fetched; rejects while they cannot be. */
    ready(): Promise<void> { return verifier.ready(); },
    async handle(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
      if (path !== endpoint) {
        const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'MCP-Protocol-Version' };
        if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
        if (req.method !== 'GET' && req.method !== 'HEAD') return problem(res, 405, 'method_not_allowed', 'Read the metadata with GET.', { Allow: 'GET, HEAD, OPTIONS' });
        return send(res, 200, metadata, { ...cors, 'Cache-Control': 'public, max-age=300' });
      }
      return serveEndpoint(req, res);
    },
  };
}
