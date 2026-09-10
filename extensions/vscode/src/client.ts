import type { AccountLink, Approval, Bootstrap, Session, SessionEvent, SessionInput, Permission, Decision, TaskSource, TaskSnapshot, TaskPage, TaskImportInput, CandidateFormat } from './types.js';

export type StreamHandlers = { onOpen?: () => void; onEvent: (event: SessionEvent) => void };

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
  async authMethods(): Promise<{ local: boolean; oidc: { name: string; issuer: string } | null }> {
    const result = await this.request<{ local?: boolean; oidc?: { name: string; issuer: string } | null }>('/api/auth/methods');
    return { local: result?.local !== false, oidc: result?.oidc && typeof result.oidc.name === 'string' ? result.oidc : null };
  }
  async beginBrowserLogin(): Promise<{ code: string; secret: string; url: string; expiresIn: number }> {
    const result = await this.request<{ code?: string; secret?: string; url?: string; expiresIn?: number }>('/api/auth/editor', 'POST', {});
    if (typeof result?.code !== 'string' || typeof result?.secret !== 'string' || typeof result?.url !== 'string') throw new ApiError(0, 'invalid_response', 'The workbench did not start a browser sign-in.');
    return { code: result.code, secret: result.secret, url: result.url, expiresIn: typeof result.expiresIn === 'number' ? result.expiresIn : 600 };
  }
  async collectBrowserLogin(code: string, secret: string): Promise<{ status: 'pending' } | { status: 'ready'; cookie: string; user: { name: string } }> {
    const result = await this.request<{ status?: string; cookie?: string; user?: { name: string } }>(`/api/auth/editor/${encodeURIComponent(code)}`, 'POST', { secret });
    if (result?.status === 'ready' && typeof result.cookie === 'string' && result.user) return { status: 'ready', cookie: result.cookie, user: result.user };
    return { status: 'pending' };
  }
  async acceptCookie(cookie: string): Promise<void> {
    const authenticated = cookie.split(';')[0];
    if (!/^(?:__Host-)?vloer=[A-Za-z0-9_-]{32,200}$/.test(authenticated)) throw new ApiError(0, 'invalid_cookie', 'The browser sign-in did not return a valid workbench session.');
    await this.secrets.store(this.secretKey, authenticated);
  }
  async logout(): Promise<void> { try { await this.request('/api/logout', 'POST', {}); } finally { await this.secrets.delete(this.secretKey); } }
  async models(): Promise<Array<{ id: string; name: string; modelId: string; providerId: string; provider?: string; providers?: string[]; tiers?: Record<string, string> }>> {
    const result = await this.request<{ models?: Array<{ id: string; name: string; modelId: string; providerId: string; provider?: string; providers?: string[]; tiers?: Record<string, string> }> }>('/api/models');
    return Array.isArray(result?.models) ? result.models : [];
  }
  sessions(): Promise<Session[]> { return this.request('/api/sessions'); }
  session(id: string): Promise<Session> { return this.request(`/api/sessions/${identifier(id)}`); }
  history(id: string, after = 0): Promise<SessionEvent[]> { return this.request(`/api/sessions/${identifier(id)}/history?after=${Math.max(0, Math.floor(after))}`); }
  permissions(id: string): Promise<Permission[]> { return this.request(`/api/sessions/${identifier(id)}/permissions`); }
  create(input: SessionInput): Promise<Session> { return this.request('/api/sessions', 'POST', input); }
  action(id: string, action: 'start' | 'pause' | 'resume' | 'cancel' | 'retry'): Promise<Session> { return this.request(`/api/sessions/${identifier(id)}/${action}`, 'POST', {}); }
  review(id: string, decision: 'accepted' | 'rejected', note?: string): Promise<Session> { return this.request(`/api/sessions/${identifier(id)}/review`, 'POST', { decision, ...(note ? { note } : {}) }); }
  message(id: string, text: string): Promise<Session> { return this.request(`/api/sessions/${identifier(id)}/messages`, 'POST', { text }); }
  respond(id: string, requestId: string, answer: Decision): Promise<Session> {
    return this.request(`/api/sessions/${identifier(id)}/permissions/${identifier(requestId)}`, 'POST', answer);
  }
  setApproval(id: string, approval: Approval): Promise<Session> {
    if (approval !== 'manual' && approval !== 'auto') throw new Error('Approval is manual or auto.');
    return this.request(`/api/sessions/${identifier(id)}/approval`, 'POST', { approval });
  }
  async links(): Promise<AccountLink[]> {
    const result = await this.request<{ links?: AccountLink[] }>('/api/links');
    return Array.isArray(result?.links) ? result.links : [];
  }
  async link(provider: string): Promise<string> {
    const result = await this.request<{ url?: string }>(`/api/links/${encodeURIComponent(provider)}`, 'POST', {});
    if (typeof result?.url !== 'string' || !/^https?:\/\//.test(result.url)) throw new ApiError(0, 'invalid_response', 'The workbench did not return an authorization URL.');
    return result.url;
  }
  async unlink(provider: string): Promise<void> { await this.request(`/api/links/${encodeURIComponent(provider)}`, 'DELETE'); }
  async paste(provider: string, token: string): Promise<void> { await this.request(`/api/links/${encodeURIComponent(provider)}`, 'PUT', { token }); }
  linkGitlab(): Promise<string> { return this.link('gitlab'); }
  unlinkGitlab(): Promise<void> { return this.unlink('gitlab'); }
  budget(id: string, amountUsd: number): Promise<Session> {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw new Error('Additional budget must be a positive amount.');
    return this.request(`/api/sessions/${identifier(id)}/budget`, 'POST', { amountUsd });
  }
  async stream(id: string, after: number, handlers: StreamHandlers, signal: AbortSignal): Promise<void> {
    const cookie = await this.secrets.get(this.secretKey);
    const headers: Record<string, string> = { Accept: 'text/event-stream', Origin: this.origin, 'X-Vloer-Request': '1' };
    if (cookie) headers.Cookie = cookie;
    let response: Response;
    try { response = await fetch(`${this.origin}/api/sessions/${identifier(id)}/events?after=${Math.max(0, Math.floor(after))}`, { headers, signal, redirect: 'manual' }); }
    catch (error) { if (signal.aborted) return; throw new ApiError(0, 'unreachable', 'The live event stream could not be opened.'); }
    if (response.status === 401) { await this.secrets.delete(this.secretKey); throw new ApiError(401, 'unauthenticated', 'Sign in to your workbench.'); }
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('text/event-stream') || !response.body) { await response.body?.cancel(); throw new ApiError(response.status, 'stream_unavailable', 'The workbench did not offer a live event stream.'); }
    handlers.onOpen?.();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const dispatch = (block: string) => {
      const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
      if (!data) return;
      let event: SessionEvent;
      try { event = JSON.parse(data); } catch { return; }
      if (event && typeof event.id === 'number' && event.sessionId === id && typeof event.type === 'string') handlers.onEvent(event);
    };
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        if (buffer.length > 4_194_304) throw new ApiError(0, 'stream_overflow', 'The live event stream sent an oversized message.');
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) { dispatch(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); boundary = buffer.indexOf('\n\n'); }
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, 'stream_closed', 'The live event stream closed.');
    } finally { await reader.cancel().catch(() => undefined); }
  }
  taskSources(): Promise<TaskSource[]> { return this.request('/api/task-sources'); }
  tasks(sourceId: string, page = 1): Promise<TaskPage> {
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new Error('Invalid task page.');
    return this.request(`/api/task-sources/${identifier(sourceId)}/tasks?page=${page}`);
  }
  task(sourceId: string, taskId: string): Promise<TaskSnapshot> { return this.request(`/api/task-sources/${identifier(sourceId)}/tasks/${identifier(taskId)}`); }
  importTask(input: TaskImportInput): Promise<Session> { return this.request('/api/task-imports', 'POST', input); }
  async downloadCandidate(id: string, format: CandidateFormat): Promise<Uint8Array> {
    if (!['bundle', 'patch', 'manifest', 'attestation', 'trace'].includes(format)) throw new Error('Invalid candidate format.');
    const path = `/api/sessions/${identifier(id)}/candidate/download?format=${format}`;
    const cookie = await this.secrets.get(this.secretKey);
    const headers: Record<string, string> = { Accept: '*/*', Origin: this.origin, 'X-Vloer-Request': '1' };
    if (cookie) headers.Cookie = cookie;
    let response: Response;
    try { response = await fetch(`${this.origin}${path}`, { headers, redirect: 'manual', signal: AbortSignal.timeout(60_000) }); }
    catch { throw new ApiError(0, 'unreachable', 'The candidate could not be downloaded. Check the workbench connection.'); }
    if (response.status >= 300 && response.status < 400) throw new ApiError(response.status, 'redirect', 'The API redirected the download. Configure the final workbench origin; credentials are never forwarded.');
    if (response.status === 401) await this.secrets.delete(this.secretKey);
    if (!response.ok) {
      await response.body?.cancel();
      throw new ApiError(response.status, 'download_failed', response.status === 404 ? 'This candidate is not available to your account. Refresh the session.' : 'The candidate download is unavailable. Refresh the session and inspect its export status.');
    }
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
    const allowed = format === 'manifest' ? ['application/json'] : format === 'patch' ? ['text/plain', 'text/x-diff', 'application/octet-stream'] : ['application/octet-stream', 'application/x-git-bundle'];
    if (!allowed.includes(contentType)) { await response.body?.cancel(); throw new ApiError(0, 'invalid_response', 'The workbench returned an unexpected candidate file type.'); }
    const limit = 128 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new ApiError(0, 'response_too_large', 'This candidate exceeds the editor download limit of 128 MiB.'); }
    const reader = response.body?.getReader();
    if (!reader) throw new ApiError(0, 'invalid_response', 'The workbench returned an empty candidate response.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > limit) { await reader.cancel(); throw new ApiError(0, 'response_too_large', 'This candidate exceeds the editor download limit of 128 MiB.'); }
        chunks.push(chunk.value);
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, 'incomplete_download', 'The candidate download was interrupted. No file has been saved; download it again when connected.');
    }
    if (!size && format !== 'patch') throw new ApiError(0, 'invalid_response', 'The workbench returned an empty candidate file.');
    return Buffer.concat(chunks, size);
  }
  dashboard(id?: string): string { return `${this.origin}/#${id ? `session/${identifier(id)}` : 'sessions'}`; }
}
