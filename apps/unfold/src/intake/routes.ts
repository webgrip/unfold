import type { IncomingMessage, ServerResponse } from 'node:http';
import type { User } from '../types.ts';
import { IntakeError, intakeSettings, publicSource, type IntakeService } from './service.ts';

/** What the intake routes borrow from the HTTP server. */
export type IntakeRouteContext = {
  service: IntakeService;
  user: () => User | undefined;
  guard: () => void;
  readJson: () => Promise<Record<string, unknown>>;
  enabledFor: (user: User) => Promise<boolean>;
  baseUrl: string;
  send: (status: number, value: unknown) => void;
};

async function rawBody(req: IncomingMessage): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > intakeSettings.maxBodyBytes) throw new IntakeError(413, 'body_too_large', 'The delivery is larger than 5 MiB.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > intakeSettings.maxBodyBytes) throw new IntakeError(413, 'body_too_large', 'The delivery is larger than 5 MiB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Serves every `/api/intake` route: the public, signed `POST /api/intake/:sourceId` a sender calls, and the signed-in
 * routes that list templates, manage sources and read Requests. Answers false for a path it does not serve.
 */
export async function intakeRoute(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams, context: IntakeRouteContext): Promise<boolean> {
  const method = req.method || 'GET';
  const parts = path.split('/').slice(3);
  const admin = ['templates', 'sources', 'requests'].includes(parts[0] ?? '');
  if (!admin) {
    if (parts.length !== 1 || !parts[0]) return false;
    if (method !== 'POST') throw new IntakeError(405, 'method', 'Deliver a Request with POST.');
    const body = await rawBody(req);
    const answer = await context.service.receive(decodeURIComponent(parts[0]), { headers: req.headers, query, body, contentType: String(req.headers['content-type'] ?? '').toLowerCase() });
    context.send(answer.status, answer.body);
    return true;
  }
  const user = context.user();
  if (!user) { context.send(401, { error: { code: 'unauthenticated', message: 'Sign in to your workbench.' } }); return true; }
  if (method !== 'GET') context.guard();
  if (!await context.enabledFor(user)) throw new IntakeError(404, 'intake_off', 'Request intake is off: turn on the intake.requests flag.');
  const service = context.service;
  const shown = (source: Parameters<typeof publicSource>[0]) => publicSource(source, context.baseUrl);
  if (parts[0] === 'templates' && parts.length === 1) {
    if (method !== 'GET') throw new IntakeError(405, 'method', 'Read the templates with GET.');
    context.send(200, service.catalogue());
    return true;
  }
  if (parts[0] === 'requests') {
    if (method !== 'GET') throw new IntakeError(405, 'method', 'Read Requests with GET.');
    if (parts.length === 2) { context.send(200, { request: service.request(user, decodeURIComponent(parts[1])) }); return true; }
    if (parts.length !== 1) return false;
    const limit = Number(query.get('limit') ?? 50);
    context.send(200, { requests: service.requests(user, { sourceId: query.get('source') ?? undefined, limit: Number.isInteger(limit) ? limit : 50, before: query.get('before') ?? undefined }) });
    return true;
  }
  if (parts.length === 1) {
    if (method === 'GET') { context.send(200, { sources: service.sources(user).map(shown) }); return true; }
    if (method !== 'POST') throw new IntakeError(405, 'method', 'List sources with GET and add one with POST.');
    if (user.role !== 'admin') throw new IntakeError(403, 'forbidden', 'Only administrators add intake sources.');
    const created = service.create(user, await context.readJson());
    context.send(201, { source: shown(created.source), secret: created.secret });
    return true;
  }
  const id = decodeURIComponent(parts[1]);
  if (parts.length === 2 && method === 'DELETE') { service.remove(user, id); context.send(200, { removed: id }); return true; }
  if (parts.length === 3 && parts[2] === 'secret' && method === 'POST') {
    const rotated = service.rotate(user, id, await context.readJson());
    context.send(200, { source: shown(rotated.source), secret: rotated.secret });
    return true;
  }
  throw new IntakeError(405, 'method', 'Remove a source with DELETE, or replace its secret with POST /secret.');
}
