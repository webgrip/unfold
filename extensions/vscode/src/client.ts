import type { Bootstrap, Session, SessionEvent, SessionInput, Permission } from './types.js';

export interface Secrets {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function normalizeServerUrl(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a complete HTTPS workbench URL.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('Use HTTPS for a remote server. HTTP is supported only on localhost.');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use the server origin without credentials, path, query or fragment.');
  return url.origin;
}

function identifier(value: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Invalid remote session or request identifier.');
  return value;
}

export class VloerClient {
  readonly origin: string;
  readonly secretKey: string;
  private readonly secrets: Secrets;
  private readonly requestTimeout: number;
  constructor(origin: string, secrets: Secrets, requestTimeout = 15_000) {
    this.origin = normalizeServerUrl(origin);
    this.secretKey = `vloer.session:${this.origin}`;
    this.secrets = secrets;
    this.requestTimeout = requestTimeout;
  }
  async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (!path.startsWith('/api/') || path.includes('://') || path.includes('..')) throw new Error('Invalid API route.');
    const cookie = await this.secrets.get(this.secretKey);
    const headers: Record<string, string> = { Accept: 'application/json', Origin: this.origin, 'X-Vloer-Request': '1' };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response: Response;
    try {
      response = await fetch(`${this.origin}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(this.requestTimeout), redirect: 'manual' });
    } catch {
      throw new ApiError(0, 'unreachable', method === 'GET' ? 'The workbench could not be reached. Check the server URL, network and certificate.' : 'The request outcome could not be confirmed. Refresh the session before repeating the action; check the network and server connection.');
    }
    if (response.status >= 300 && response.status < 400) throw new ApiError(response.status, 'redirect', 'The API redirected the request. Configure the final workbench origin; credentials are never forwarded.');
    if (response.status === 401) await this.secrets.delete(this.secretKey);
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) throw new ApiError(response.status, 'invalid_response', 'The server did not return the Vloer JSON API. Check the server URL or reverse proxy.');
    if (Number(response.headers.get('content-length')) > 16_777_216) throw new ApiError(0, 'response_too_large', 'This response is too large for the editor. Open the web dashboard.');
    const reader = response.body?.getReader();
    if (!reader) throw new ApiError(0, 'invalid_response', 'The workbench returned an empty response.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 16_777_216) { await reader.cancel(); throw new ApiError(0, 'response_too_large', 'This response is too large for the editor. Open the web dashboard.'); }
      chunks.push(chunk.value);
    }
    let data: any;
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(0, 'invalid_response', 'The workbench returned invalid JSON.'); }
    if (!response.ok) throw new ApiError(response.status, String(data?.error?.code || 'request_failed'), String(data?.error?.message || `Request failed (${response.status}).`));
    if (path === '/api/login') {
      const cookieHeader = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') || ''];
      const authenticated = cookieHeader.map(value => value.split(';')[0]).find(value => /^(?:__Host-)?vloer=[A-Za-z0-9_-]{32,200}$/.test(value));
      if (!authenticated) throw new ApiError(0, 'invalid_cookie', 'Login did not return a valid workbench session.');
      await this.secrets.store(this.secretKey, authenticated);
    }
    return data as T;
  }
  bootstrap(): Promise<Bootstrap> { return this.request('/api/bootstrap'); }
  async login(name: string, password: string): Promise<void> { await this.request('/api/login', 'POST', { name, password }); }
  async logout(): Promise<void> { try { await this.request('/api/logout', 'POST', {}); } finally { await this.secrets.delete(this.secretKey); } }
  sessions(): Promise<Session[]> { return this.request('/api/sessions'); }
  session(id: string): Promise<Session> { return this.request(`/api/sessions/${identifier(id)}`); }
  history(id: string, after = 0): Promise<SessionEvent[]> { return this.request(`/api/sessions/${identifier(id)}/history?after=${Math.max(0, Math.floor(after))}`); }
  permissions(id: string): Promise<Permission[]> { return this.request(`/api/sessions/${identifier(id)}/permissions`); }
  create(input: SessionInput): Promise<Session> { return this.request('/api/sessions', 'POST', input); }
  action(id: string, action: 'start' | 'pause' | 'resume' | 'cancel'): Promise<Session> { return this.request(`/api/sessions/${identifier(id)}/${action}`, 'POST', {}); }
  message(id: string, text: string): Promise<Session> { return this.request(`/api/sessions/${identifier(id)}/messages`, 'POST', { text }); }
  respond(id: string, requestId: string, answer: { decision?: 'once' | 'always' | 'reject'; answers?: string[][] }): Promise<Session> {
    return this.request(`/api/sessions/${identifier(id)}/permissions/${identifier(requestId)}`, 'POST', answer);
  }
  dashboard(id?: string): string { return `${this.origin}/#${id ? `session/${identifier(id)}` : 'sessions'}`; }
}
