import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { RuntimeFailure } from '../failures.ts';

type PendingRequest = { id: string; method: string; path: string; headers: Record<string, string>; body?: string; signal?: AbortSignal; deliver(response: Response): void; fail(error: Error): void; cancelled: boolean; picked: boolean; abortIncoming?: () => void };
type Registration = { token: Buffer; queue: PendingRequest[]; inFlight: Map<string, PendingRequest>; waiters: Set<(value: void) => void>; lastSeen: number; cancelled: Set<string> };

const maxRequestBody = 16 * 1024 * 1024;
const maxPollMs = 25_000;
const pickupTimeoutMs = 30_000;

export function relayEndpoint(workspaceId: string): string { return `relay://${workspaceId}`; }

export class WorkerRelay {
  private readonly registrations = new Map<string, Registration>();
  readonly basePath = '/api/relay/';

  register(workspaceId: string): string {
    this.unregister(workspaceId);
    const token = randomBytes(32).toString('base64url');
    this.registrations.set(workspaceId, { token: Buffer.from(token), queue: [], inFlight: new Map(), waiters: new Set(), lastSeen: 0, cancelled: new Set() });
    return token;
  }

  unregister(workspaceId: string): void {
    const registration = this.registrations.get(workspaceId);
    if (!registration) return;
    for (const pending of [...registration.queue, ...registration.inFlight.values()]) pending.fail(new RuntimeFailure('connectivity', 'runtime', 'unknown', undefined, 'The workspace relay was closed'));
    for (const wake of registration.waiters) wake();
    this.registrations.delete(workspaceId);
  }

  connected(workspaceId: string, withinMs = 2 * maxPollMs): boolean {
    const registration = this.registrations.get(workspaceId);
    return Boolean(registration && Date.now() - registration.lastSeen < withinMs);
  }

  async waitForWorker(workspaceId: string, signal: AbortSignal, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      if (this.connected(workspaceId, maxPollMs)) return;
      await new Promise(done => setTimeout(done, 200));
    }
    throw new RuntimeFailure('timeout', 'workspace', 'not_submitted', undefined, `No workspace worker connected to the relay within ${Math.round(timeoutMs / 1000)}s`);
  }

  fetcher(workspaceId: string): typeof fetch {
    return async (input, init = {}) => {
      const registration = this.registrations.get(workspaceId);
      if (!registration) throw new RuntimeFailure('connectivity', 'runtime', 'not_submitted', undefined, 'The workspace relay is not registered');
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const headers: Record<string, string> = {};
      new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined)).forEach((value, key) => { headers[key] = value; });
      let body: string | undefined;
      if (init.body !== undefined && init.body !== null) {
        if (typeof init.body !== 'string') throw new Error('The relay only forwards string request bodies');
        body = Buffer.from(init.body).toString('base64');
      }
      const id = randomBytes(12).toString('base64url');
      return new Promise<Response>((resolve, reject) => {
        const pending: PendingRequest = {
          id, method: init.method ?? 'GET', path: url.pathname + url.search, headers, body, signal: init.signal ?? undefined, cancelled: false, picked: false,
          deliver: response => { clearTimeout(pickup); resolve(response); },
          fail: error => { clearTimeout(pickup); registration.inFlight.delete(id); reject(error); },
        };
        const pickup = setTimeout(() => {
          if (pending.picked) return;
          registration.queue.splice(registration.queue.indexOf(pending), 1);
          pending.fail(new RuntimeFailure('connectivity', 'runtime', 'not_submitted', undefined, 'The workspace worker did not pick up the request in time'));
        }, pickupTimeoutMs);
        pickup.unref();
        init.signal?.addEventListener('abort', () => {
          pending.cancelled = true;
          registration.cancelled.add(id);
          const index = registration.queue.indexOf(pending);
          if (index >= 0) registration.queue.splice(index, 1);
          pending.abortIncoming?.();
          for (const wake of registration.waiters) wake();
          pending.fail(init.signal?.reason instanceof Error ? init.signal.reason : new DOMException('Relay request aborted', 'AbortError'));
        }, { once: true });
        registration.queue.push(pending);
        for (const wake of registration.waiters) wake();
      });
    };
  }

  private authorized(registration: Registration | undefined, req: IncomingMessage): registration is Registration {
    if (!registration) return false;
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) return false;
    const presented = Buffer.from(header.slice(7));
    return presented.length === registration.token.length && timingSafeEqual(presented, registration.token);
  }

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (!url.pathname.startsWith(this.basePath)) return false;
    const match = url.pathname.slice(this.basePath.length).match(/^([a-zA-Z0-9_-]{1,80})\/(requests|responses\/([a-zA-Z0-9_-]{1,32}))$/);
    const json = (status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
    if (!match) { json(404, { error: { code: 'not_found', message: 'Relay route not found.' } }); return true; }
    const registration = this.registrations.get(match[1]);
    if (!this.authorized(registration, req)) { json(401, { error: { code: 'unauthorized', message: 'Relay token rejected.' } }); return true; }
    registration.lastSeen = Date.now();
    if (match[2] === 'requests' && req.method === 'GET') {
      const wait = Math.min(maxPollMs, Math.max(0, Number(url.searchParams.get('wait') ?? maxPollMs) || 0));
      if (!registration.queue.length && wait > 0) {
        await new Promise<void>(done => {
          const timer = setTimeout(() => { registration.waiters.delete(wake); done(); }, wait);
          const wake = () => { clearTimeout(timer); registration.waiters.delete(wake); done(); };
          registration.waiters.add(wake);
          req.on('close', wake);
        });
      }
      if (req.destroyed) return true;
      registration.lastSeen = Date.now();
      const batch = registration.queue.splice(0, 32);
      for (const pending of batch) { pending.picked = true; registration.inFlight.set(pending.id, pending); }
      const cancelled = [...registration.cancelled]; registration.cancelled.clear();
      for (const id of cancelled) registration.inFlight.delete(id);
      json(200, { requests: batch.map(({ id, method, path, headers, body }) => ({ id, method, path, headers, ...(body ? { body } : {}) })), cancelled });
      return true;
    }
    if (match[3] && req.method === 'POST') {
      const pending = registration.inFlight.get(match[3]);
      if (!pending) { json(404, { error: { code: 'unknown_request', message: 'No request awaits this response.' } }); return true; }
      registration.inFlight.delete(match[3]);
      const status = Number(req.headers['x-relay-status']);
      let headers: Record<string, string> = {};
      try { headers = JSON.parse(String(req.headers['x-relay-headers'] ?? '{}')); } catch {}
      if (!Number.isInteger(status) || status < 200 || status > 599) { pending.fail(new RuntimeFailure('harness_rejected', 'runtime', 'unknown', undefined, 'The worker relayed an invalid status')); json(400, { error: { code: 'invalid_status', message: 'x-relay-status must be an HTTP status code.' } }); return true; }
      if (pending.cancelled) { req.resume(); json(200, { ok: true, cancelled: true }); return true; }
      pending.abortIncoming = () => req.destroy();
      const stream = Readable.toWeb(req) as ReadableStream<Uint8Array>;
      const safeHeaders = new Headers();
      for (const [key, value] of Object.entries(headers)) if (typeof value === 'string' && !/^(content-length|transfer-encoding|connection)$/i.test(key)) safeHeaders.set(key, value);
      const noBody = status === 204 || status === 304;
      if (noBody) req.resume();
      pending.deliver(new Response(noBody ? null : stream, { status, headers: safeHeaders }));
      req.on('end', () => json(200, { ok: true }));
      req.on('error', () => { if (!res.headersSent) json(400, { error: { code: 'body', message: 'Relayed body failed.' } }); });
      return true;
    }
    json(405, { error: { code: 'method', message: 'Unsupported relay method.' } });
    return true;
  }
}

export const relayLimits = { maxRequestBody, maxPollMs, pickupTimeoutMs };
