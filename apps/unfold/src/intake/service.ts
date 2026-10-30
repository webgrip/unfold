import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { User } from '../types.ts';
import { validTenancyId, type Ownership } from '../tenancy.ts';
import { reaches } from '../tenant-scope.ts';
import { applies, applyMapping, intakeLimits, MappingError, validateMapping, type Mapping } from './mapping.ts';
import { parseInboundJson, parseMime, withoutQuote, type ParsedMail } from './mail.ts';
import { intakeTemplate, intakeTemplates } from './templates.ts';
import { intakeVerifier, intakeVerifierNames } from './signatures.ts';

/** Where a source's Requests come from: a JSON webhook read through a mapping, or inbound email. */
export type IntakeKind = 'webhook' | 'email';

/** One configured way for Requests to enter a Tenant, and optionally one Client within it. */
export type IntakeSource = {
  id: string;
  name: string;
  kind: IntakeKind;
  tenant: string;
  client: string | null;
  template: string | null;
  mapping: Mapping | null;
  verifier: string;
  address: string | null;
  senders: string[];
  createdAt: string;
  createdBy: string;
  secretSetAt: string;
};

/** One message of a Request that arrived by email. Attachment contents are never kept, only their names. */
export type IntakeMessage = { at: string; from: string | null; messageId: string | null; text: string; attachments: string[] };

/**
 * A Client's ask as it arrived (glossary: Request). It waits as `new` until Refinement turns it into Work Items; it is
 * never dispatched and never starts a Run.
 */
export type IntakeRequest = {
  id: string;
  tenant: string;
  client: string | null;
  sourceId: string;
  channel: IntakeKind;
  state: 'new';
  title: string;
  description: string;
  reporter: { name: string | null; email: string | null } | null;
  links: string[];
  attachments: Array<{ url?: string; name?: string }>;
  labels: string[];
  externalId: string | null;
  messages: IntakeMessage[];
  receivedAt: string;
  updatedAt: string;
};

/** What the intake answers a sender: the HTTP status and a small body that never echoes the payload. */
export type IntakeAnswer = { status: number; body: Record<string, unknown> };

/** A refused intake or administration call, answered with its status and code. */
export class IntakeError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'IntakeError';
    this.status = status;
    this.code = code;
  }
}

/** The intake's tuning: the replay window of signed requests and how long a delivery id is remembered. */
export const intakeSettings = { windowSeconds: 300, deliveryRetentionHours: 72, maxBodyBytes: 5 * 1024 * 1024, sources: 100, messages: 50 } as const;

const reservedIds = new Set(['sources', 'requests', 'templates']);
const sourceSlug = /^[a-z0-9][a-z0-9-]{1,62}$/;
const secretKey = (id: string) => `intake-source:${id}`;

type SecretStore = { db: DatabaseSync; setSecret(id: string, value: unknown): void; getSecret<T>(id: string): T | undefined; deleteSecret(id: string): void };

/** The sources, Requests, email threads and seen deliveries of the intake, in the application's SQLite store. */
export class IntakeStore {
  private readonly store: SecretStore;
  constructor(store: SecretStore) {
    this.store = store;
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS intake_sources (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, client TEXT, created_at TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS intake_requests (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, client TEXT, source_id TEXT NOT NULL, external_id TEXT, received_at TEXT NOT NULL, updated_at TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS intake_requests_external ON intake_requests(source_id, external_id);
      CREATE INDEX IF NOT EXISTS intake_requests_owner ON intake_requests(tenant, client, updated_at);
      CREATE TABLE IF NOT EXISTS intake_messages (source_id TEXT NOT NULL, message_id TEXT NOT NULL, request_id TEXT NOT NULL, PRIMARY KEY (source_id, message_id));
      CREATE TABLE IF NOT EXISTS intake_deliveries (source_id TEXT NOT NULL, delivery_id TEXT NOT NULL, request_id TEXT, outcome TEXT NOT NULL, received_at TEXT NOT NULL, PRIMARY KEY (source_id, delivery_id));
    `);
  }
  private get db() { return this.store.db; }

  sources(): IntakeSource[] { return (this.db.prepare('SELECT body FROM intake_sources ORDER BY created_at, id').all() as { body: string }[]).map(row => JSON.parse(row.body)); }
  source(id: string): IntakeSource | undefined {
    const row = this.db.prepare('SELECT body FROM intake_sources WHERE id=?').get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  saveSource(source: IntakeSource, secret?: string): void {
    this.db.prepare('INSERT INTO intake_sources(id,tenant,client,created_at,body) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(source.id, source.tenant, source.client, source.createdAt, JSON.stringify(source));
    if (secret !== undefined) this.store.setSecret(secretKey(source.id), secret);
  }
  secret(id: string): string | undefined { return this.store.getSecret<string>(secretKey(id)); }
  deleteSource(id: string): boolean {
    this.store.deleteSecret(secretKey(id));
    this.db.prepare('DELETE FROM intake_deliveries WHERE source_id=?').run(id);
    return Number(this.db.prepare('DELETE FROM intake_sources WHERE id=?').run(id).changes) === 1;
  }

  request(id: string): IntakeRequest | undefined {
    const row = this.db.prepare('SELECT body FROM intake_requests WHERE id=?').get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  requestByExternalId(sourceId: string, externalId: string): IntakeRequest | undefined {
    const row = this.db.prepare('SELECT body FROM intake_requests WHERE source_id=? AND external_id=? ORDER BY received_at LIMIT 1').get(sourceId, externalId) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  requests(limit: number, before?: string): IntakeRequest[] {
    const rows = before
      ? this.db.prepare('SELECT body FROM intake_requests WHERE updated_at < ? ORDER BY updated_at DESC, id DESC LIMIT ?').all(before, limit)
      : this.db.prepare('SELECT body FROM intake_requests ORDER BY updated_at DESC, id DESC LIMIT ?').all(limit);
    return (rows as { body: string }[]).map(row => JSON.parse(row.body));
  }
  saveRequest(request: IntakeRequest): void {
    this.db.prepare('INSERT INTO intake_requests(id,tenant,client,source_id,external_id,received_at,updated_at,body) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, body=excluded.body')
      .run(request.id, request.tenant, request.client, request.sourceId, request.externalId, request.receivedAt, request.updatedAt, JSON.stringify(request));
  }
  threadOf(sourceId: string, messageIds: string[]): string | undefined {
    for (const id of messageIds) {
      const row = this.db.prepare('SELECT request_id FROM intake_messages WHERE source_id=? AND message_id=?').get(sourceId, id) as { request_id: string } | undefined;
      if (row) return row.request_id;
    }
    return undefined;
  }
  rememberMessage(sourceId: string, messageId: string, requestId: string): void {
    this.db.prepare('INSERT OR IGNORE INTO intake_messages(source_id,message_id,request_id) VALUES(?,?,?)').run(sourceId, messageId, requestId);
  }
  delivery(sourceId: string, deliveryId: string): { requestId: string | null; outcome: string } | undefined {
    const row = this.db.prepare('SELECT request_id, outcome FROM intake_deliveries WHERE source_id=? AND delivery_id=?').get(sourceId, deliveryId) as { request_id: string | null; outcome: string } | undefined;
    return row ? { requestId: row.request_id, outcome: row.outcome } : undefined;
  }
  rememberDelivery(sourceId: string, deliveryId: string, requestId: string | null, outcome: string, at: Date): void {
    this.db.prepare('INSERT OR IGNORE INTO intake_deliveries(source_id,delivery_id,request_id,outcome,received_at) VALUES(?,?,?,?,?)').run(sourceId, deliveryId, requestId, outcome, at.toISOString());
    this.db.prepare('DELETE FROM intake_deliveries WHERE received_at < ?').run(new Date(at.getTime() - intakeSettings.deliveryRetentionHours * 3_600_000).toISOString());
  }
}

/** What the intake needs from the application: whether the flag is on for a Tenant, and the clock. */
export type IntakeOptions = { enabled: (tenant: string) => Promise<boolean>; now?: () => Date; enforced: boolean };

/** A source as an administrator sees it: never its secret, and the address senders post to. */
export function publicSource(source: IntakeSource, baseUrl: string): IntakeSource & { url: string } {
  return { ...source, url: `${baseUrl.replace(/\/+$/, '')}/api/intake/${source.id}` };
}

function text(value: unknown, label: string, max: number, required = true): string {
  if (value === undefined || value === null || value === '') {
    if (required) throw new IntakeError(400, 'intake_source', `${label} is required.`);
    return '';
  }
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new IntakeError(400, 'intake_source', `${label} must be text of at most ${max} characters.`);
  return value.trim();
}

/**
 * Receives Requests from intake sources and keeps them for Refinement. It holds no Ploeg client and no engine, so a
 * Request can never become a Run, and it has no mail transport, so it never writes to a Client.
 */
export class IntakeService {
  readonly store: IntakeStore;
  private readonly options: IntakeOptions;
  constructor(store: IntakeStore, options: IntakeOptions) {
    this.store = store;
    this.options = options;
  }
  private now(): Date { return this.options.now?.() ?? new Date(); }

  /** Whether `user` administers intake sources of `tenant`: an administrator, and while tenancy is enforced an Admin of that Tenant. */
  manages(user: User, tenant: string): boolean {
    if (user.role !== 'admin') return false;
    return !this.options.enforced || (user.memberships ?? []).some(held => held.kind === 'tenant' && held.tenant === tenant && held.role === 'admin');
  }
  /** Whether `user` may read what `owner` owns: everyone signed in while tenancy is not enforced, otherwise its Tenant's members and its Client's. */
  sees(user: User, owner: Ownership): boolean { return !this.options.enforced || reaches(user, owner); }

  /** The registered templates and verifiers, for the Settings section and the docs. */
  catalogue() {
    return {
      templates: intakeTemplates().map(({ id, name, verifier, check, docs, notes, mapping, senderBody }) => ({ id, name, verifier, check, docs, notes, mapping, senderBody: senderBody ?? null })),
      verifiers: intakeVerifierNames().map(name => { const verifier = intakeVerifier(name)!; return { name, signed: verifier.signed, generatesSecret: verifier.generatesSecret }; }),
    };
  }

  /** The sources `user` administers. */
  sources(user: User): IntakeSource[] { return this.store.sources().filter(source => this.manages(user, source.tenant)); }

  /** Creates a source from an administrator's input; answers it with its secret, which is shown only this once. */
  create(user: User, input: Record<string, unknown>): { source: IntakeSource; secret: string | null } {
    const id = text(input.id, 'Source id', 63);
    if (!sourceSlug.test(id) || reservedIds.has(id)) throw new IntakeError(400, 'intake_source', 'A source id is 2 to 63 lower-case letters, digits and hyphens, and not sources, requests or templates.');
    if (this.store.source(id)) throw new IntakeError(409, 'intake_source_exists', 'A source with this id exists.');
    if (this.store.sources().length >= intakeSettings.sources) throw new IntakeError(409, 'intake_sources_full', `At most ${intakeSettings.sources} intake sources.`);
    const tenant = text(input.tenant, 'Tenant', 63);
    const client = text(input.client, 'Client', 63, false) || null;
    if (!validTenancyId(tenant) || (client !== null && !validTenancyId(client))) throw new IntakeError(400, 'intake_source', 'Tenant and Client are lower-case letters, digits and inner hyphens.');
    if (!this.manages(user, tenant)) throw new IntakeError(403, 'forbidden', 'Only an administrator of this Tenant adds its intake sources.');
    const kind = input.kind === 'email' ? 'email' : input.kind === 'webhook' || input.kind === undefined ? 'webhook' : undefined;
    if (!kind) throw new IntakeError(400, 'intake_source', 'kind is webhook or email.');
    let template: string | null = null;
    let mapping: Mapping | null = null;
    if (kind === 'webhook') {
      template = text(input.template, 'Template', 63);
      if (template === 'custom') {
        try { mapping = validateMapping(input.mapping); } catch (error) { if (error instanceof MappingError) throw new IntakeError(400, 'intake_mapping', error.message); throw error; }
      } else if (!intakeTemplate(template)) throw new IntakeError(400, 'intake_source', `Unknown template; use custom or one of ${intakeTemplates().map(entry => entry.id).join(', ')}.`);
    }
    const verifierName = text(input.verifier, 'Verifier', 63, false) || (template && template !== 'custom' ? intakeTemplate(template)!.verifier : 'standard-webhooks');
    const verifier = intakeVerifier(verifierName);
    if (!verifier) throw new IntakeError(400, 'intake_source', `Unknown verifier; use one of ${intakeVerifierNames().join(', ')}.`);
    const given = text(input.secret, 'Secret', 512, false);
    if (!given && !verifier.newSecret) throw new IntakeError(400, 'intake_secret', 'This verifier checks the sender\'s own signature: paste the signing secret the sender shows.');
    const secret = given || verifier.newSecret!();
    const problem = verifier.checkSecret(secret);
    if (problem) throw new IntakeError(400, 'intake_secret', problem);
    const address = kind === 'email' ? text(input.address, 'Address', 320, false) || null : null;
    if (address && !/^[^\s@<>]+@[^\s@<>]+$/.test(address)) throw new IntakeError(400, 'intake_source', 'Address must be an email address.');
    const senders = kind === 'email' && Array.isArray(input.senders) ? input.senders.slice(0, 50).map(item => text(item, 'Sender', 320).toLowerCase().replace(/^@/, '')).filter(Boolean) : [];
    const at = this.now().toISOString();
    const source: IntakeSource = { id, name: text(input.name, 'Name', 100, false) || id, kind, tenant, client, template, mapping, verifier: verifierName, address: address?.toLowerCase() ?? null, senders, createdAt: at, createdBy: user.id, secretSetAt: at };
    this.store.saveSource(source, secret);
    return { source, secret: given ? null : secret };
  }

  /** Replaces a source's secret: a new one Unfold makes, or the sender's own one. Answers the new secret once when Unfold made it. */
  rotate(user: User, id: string, input: Record<string, unknown>): { source: IntakeSource; secret: string | null } {
    const source = this.managed(user, id);
    const verifier = intakeVerifier(source.verifier)!;
    const given = text(input.secret, 'Secret', 512, false);
    if (!given && !verifier.newSecret) throw new IntakeError(400, 'intake_secret', 'Paste the new signing secret the sender shows.');
    const secret = given || verifier.newSecret!();
    const problem = verifier.checkSecret(secret);
    if (problem) throw new IntakeError(400, 'intake_secret', problem);
    const next = { ...source, secretSetAt: this.now().toISOString() };
    this.store.saveSource(next, secret);
    return { source: next, secret: given ? null : secret };
  }

  /** Removes a source and its secret. Its Requests stay. */
  remove(user: User, id: string): void {
    this.managed(user, id);
    this.store.deleteSource(id);
  }

  private managed(user: User, id: string): IntakeSource {
    const source = this.store.source(id);
    if (!source || !this.manages(user, source.tenant)) throw new IntakeError(404, 'not_found', 'Intake source not found.');
    return source;
  }

  /** The Requests `user` reaches, newest change first, filtered by source. */
  requests(user: User, filter: { sourceId?: string; limit?: number; before?: string } = {}): IntakeRequest[] {
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
    const found: IntakeRequest[] = [];
    let before = filter.before;
    for (let page = 0; page < 20 && found.length < limit; page++) {
      const rows = this.store.requests(200, before);
      if (!rows.length) break;
      for (const row of rows) if ((!filter.sourceId || row.sourceId === filter.sourceId) && this.sees(user, { tenant: row.tenant, ...(row.client ? { client: row.client } : {}) })) found.push(row);
      before = rows[rows.length - 1].updatedAt;
    }
    return found.slice(0, limit);
  }

  /** One Request, when `user` reaches it. */
  request(user: User, id: string): IntakeRequest {
    const found = this.store.request(id);
    if (!found || !this.sees(user, { tenant: found.tenant, ...(found.client ? { client: found.client } : {}) })) throw new IntakeError(404, 'not_found', 'Request not found.');
    return found;
  }

  /**
   * Handles one inbound delivery to `sourceId`: proves it came from the sender, drops a delivery it has seen, reads the
   * payload and stores a new Request or threads an email reply onto the Request it answers.
   */
  async receive(sourceId: string, delivery: { headers: IncomingHttpHeaders; query: URLSearchParams; body: Buffer; contentType: string }): Promise<IntakeAnswer> {
    const source = this.store.source(sourceId);
    if (!source || !await this.options.enabled(source.tenant)) throw new IntakeError(404, 'not_found', 'Intake source not found.');
    const secret = this.store.secret(source.id);
    const verifier = intakeVerifier(source.verifier);
    if (!secret || !verifier) throw new IntakeError(404, 'not_found', 'Intake source not found.');
    const now = this.now();
    const verdict = verifier.verify({ headers: delivery.headers, query: delivery.query, body: delivery.body, secret, nowMs: now.getTime(), windowSeconds: intakeSettings.windowSeconds });
    if (!verdict.ok) throw new IntakeError(401, verdict.code, verdict.message);
    if (verdict.deliveryId) {
      const seen = this.store.delivery(source.id, verdict.deliveryId);
      if (seen) return { status: 200, body: { replayed: true, outcome: seen.outcome, request: seen.requestId } };
    }
    const answer = source.kind === 'email' ? this.receiveMail(source, delivery, now) : this.receiveWebhook(source, delivery, now);
    if (verdict.deliveryId) this.store.rememberDelivery(source.id, verdict.deliveryId, typeof answer.body.request === 'string' ? answer.body.request : null, String(answer.body.outcome), now);
    return answer;
  }

  private json(delivery: { body: Buffer; contentType: string }): Record<string, unknown> {
    if (!delivery.contentType.startsWith('application/json')) throw new IntakeError(415, 'content_type', 'Send the payload as application/json.');
    let parsed: unknown;
    try { parsed = JSON.parse(delivery.body.toString('utf8')); } catch { throw new IntakeError(400, 'invalid_json', 'The body is not JSON.'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new IntakeError(400, 'invalid_json', 'Expected a JSON object.');
    return parsed as Record<string, unknown>;
  }

  private receiveWebhook(source: IntakeSource, delivery: { body: Buffer; contentType: string }, now: Date): IntakeAnswer {
    const payload = this.json(delivery);
    const mapping = source.mapping ?? intakeTemplate(source.template ?? '')?.mapping;
    if (!mapping) throw new IntakeError(500, 'intake_mapping', 'The source has no mapping.');
    if (!applies(mapping, payload)) return { status: 202, body: { outcome: 'ignored', reason: 'not_a_new_request', request: null } };
    const mapped = applyMapping(mapping, payload);
    if (!mapped) throw new IntakeError(422, 'intake_no_title', 'The payload has no title where the mapping looks for one.');
    if (mapped.externalId) {
      const existing = this.store.requestByExternalId(source.id, mapped.externalId);
      if (existing) return { status: 200, body: { outcome: 'duplicate', request: existing.id } };
    }
    const at = now.toISOString();
    const request: IntakeRequest = {
      id: randomUUID(), tenant: source.tenant, client: source.client, sourceId: source.id, channel: 'webhook', state: 'new',
      title: mapped.title, description: mapped.description, reporter: mapped.reporter, links: mapped.links,
      attachments: mapped.attachments.map(url => ({ url })), labels: mapped.labels, externalId: mapped.externalId, messages: [], receivedAt: at, updatedAt: at,
    };
    this.store.saveRequest(request);
    return { status: 201, body: { outcome: 'created', request: request.id } };
  }

  private parseMail(delivery: { body: Buffer; contentType: string }): ParsedMail {
    if (/^message\/rfc822\b/i.test(delivery.contentType)) return parseMime(delivery.body.toString('latin1'));
    const parsed = parseInboundJson(this.json(delivery));
    if (!parsed) throw new IntakeError(400, 'intake_mail', 'Expected raw MIME as message/rfc822, a Postmark inbound payload, or {from, subject, text, html, messageId, inReplyTo, references, attachments}.');
    return parsed;
  }

  private receiveMail(source: IntakeSource, delivery: { body: Buffer; contentType: string }, now: Date): IntakeAnswer {
    const mail = this.parseMail(delivery);
    const sender = mail.from?.email ?? '';
    if (source.senders.length && !source.senders.some(allowed => allowed.includes('@') ? sender === allowed : sender.endsWith(`@${allowed}`))) {
      return { status: 202, body: { outcome: 'ignored', reason: 'sender_not_allowed', request: null } };
    }
    if (mail.messageId) {
      const known = this.store.threadOf(source.id, [mail.messageId]);
      if (known) return { status: 200, body: { outcome: 'duplicate', request: known } };
    }
    const at = now.toISOString();
    const from = mail.from ? (mail.from.name ? `${mail.from.name} <${mail.from.email}>` : mail.from.email) : null;
    const thread = mail.replyTo.length ? this.store.threadOf(source.id, mail.replyTo) : undefined;
    const existing = thread ? this.store.request(thread) : undefined;
    if (existing) {
      const message: IntakeMessage = { at, from, messageId: mail.messageId, text: withoutQuote(mail.text).slice(0, intakeLimits.description), attachments: mail.attachments };
      const updated: IntakeRequest = { ...existing, messages: [...existing.messages, message].slice(-intakeSettings.messages), attachments: [...existing.attachments, ...mail.attachments.map(name => ({ name }))].slice(0, intakeLimits.list * 2), updatedAt: at };
      this.store.saveRequest(updated);
      if (mail.messageId) this.store.rememberMessage(source.id, mail.messageId, existing.id);
      return { status: 200, body: { outcome: 'threaded', request: existing.id } };
    }
    const description = mail.text.slice(0, intakeLimits.description);
    const request: IntakeRequest = {
      id: randomUUID(), tenant: source.tenant, client: source.client, sourceId: source.id, channel: 'email', state: 'new',
      title: (mail.subject || description.split('\n')[0] || '(no subject)').slice(0, intakeLimits.title), description,
      reporter: mail.from ? { name: mail.from.name, email: mail.from.email } : null, links: [], attachments: mail.attachments.map(name => ({ name })), labels: [],
      externalId: mail.messageId, messages: [{ at, from, messageId: mail.messageId, text: description, attachments: mail.attachments }], receivedAt: at, updatedAt: at,
    };
    this.store.saveRequest(request);
    if (mail.messageId) this.store.rememberMessage(source.id, mail.messageId, request.id);
    return { status: 201, body: { outcome: 'created', request: request.id } };
  }
}
