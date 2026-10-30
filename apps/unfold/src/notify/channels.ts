import { randomBytes } from 'node:crypto';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import type { NotifyStore, Target } from './store.ts';
import type { NtfySettings, WebPushSettings } from './settings.ts';
import type { NotificationMessage } from './triggers.ts';
import { encryptPayload, validPublicKey, vapidAuthorization, vapidSigningKey, fromBase64Url, type VapidKeys } from './web-push.ts';
import { refuse } from './preferences.ts';

/** What one attempt achieved: sent, worth retrying (with the receiver's `Retry-After`), refused for good, or the target is gone. */
export type SendOutcome = { kind: 'delivered' } | { kind: 'retry'; reason: string; retryAfterMs?: number } | { kind: 'failed'; reason: string } | { kind: 'gone'; reason: string };
/** One HTTP answer, or the error that stopped the request. */
export type HttpResult = { status: number; retryAfterMs?: number } | { error: string };
/** Sends one POST; `publicOnly` refuses any address that is not public at connection time. Replaceable in tests. */
export type Transport = (url: URL, headers: Record<string, string>, body: Buffer, publicOnly: boolean) => Promise<HttpResult>;
/** A channel's answer to one of its own routes under `/api/me/notifications/channels/<id>/`. */
export type ChannelAnswer = { status: number; body: unknown };
/** An unauthenticated request to a channel's public route under `/api/notifications/channels/<id>/`: its headers and raw body. */
export type PublicRequest = { method: string; rest: string[]; headers: Record<string, string | string[] | undefined>; rawBody: Buffer; at: string };
/** What a channel's public route may ask of Unfold: whether notifications and the channel's flag are on for a person. */
export type PublicContext = { allowed: (userId: string) => Promise<boolean> };

/**
 * A notification channel adapter. Unfold knows channels only through this interface and the registry: a new
 * channel (Slack, Microsoft Teams, e-mail) is a new adapter registered by id, with its own targets and routes.
 */
export interface NotificationChannel {
  /** The registry id, as preferences and the API name it. */
  readonly id: string;
  /** The name a person reads. */
  readonly label: string;
  /** Whether the deployment configured this channel, so people can choose it. */
  available(): boolean;
  /** Called when a person turns the channel on, to create a target that needs no browser, such as an ntfy topic. */
  enable(userId: string, at: string): void;
  /** Delivers one notice to one of the person's targets. */
  send(message: NotificationMessage, target: Target): Promise<SendOutcome>;
  /** What the Notifications page shows the person about this channel. Never a key or token. */
  describe(userId: string): Record<string, unknown>;
  /** Answers the channel's own routes, such as subscribing a browser. */
  route?(userId: string, method: string, rest: string[], readBody: () => Promise<unknown>, at: string): Promise<ChannelAnswer>;
  /** The feature flag that must be on for a person, besides `notifications.push`, before they may use this channel. */
  readonly flag?: string;
  /** Answers a request the channel's provider sends without an Unfold sign-in, such as a signed Slack interaction. */
  publicRoute?(request: PublicRequest, context: PublicContext): Promise<ChannelAnswer>;
  /** Forgets what the channel keeps about a person outside the target table, such as a linked chat account. */
  forget?(userId: string): void;
}

/** The registered channels, by id. */
export class ChannelRegistry {
  private readonly channels = new Map<string, NotificationChannel>();
  /** Adds a channel; a second channel with the same id is refused. */
  register(channel: NotificationChannel): this {
    if (this.channels.has(channel.id)) throw new Error(`A notification channel ${channel.id} is already registered`);
    this.channels.set(channel.id, channel);
    return this;
  }
  get(id: string): NotificationChannel | undefined { return this.channels.get(id); }
  list(): NotificationChannel[] { return [...this.channels.values()]; }
  /** The ids of the channels people can choose now. */
  available(): string[] { return this.list().filter(channel => channel.available()).map(channel => channel.id); }
}

const blocked = new BlockList();
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]] as const) blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [['::', 127], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96]] as const) blocked.addSubnet(network, prefix, 'ipv6');

/** Whether `address` is a public unicast address: not private, loopback, link-local, shared, reserved or multicast. */
export function publicAddress(address: string): boolean {
  const family = isIP(address);
  if (!family) return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return publicAddress(mapped[1]);
  return !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

function guardedLookup(hostname: string, options: object, callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void): void {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
    if (error) return callback(error, []);
    const usable = addresses.filter(entry => publicAddress(entry.address));
    if (!usable.length) return callback(Object.assign(new Error('not_public'), { code: 'not_public' }), []);
    if ((options as { all?: boolean }).all) return callback(null, usable);
    callback(null, usable[0].address, usable[0].family);
  });
}

function retryAfter(value: string | string[] | undefined): number | undefined {
  const text = Array.isArray(value) ? value[0] : value;
  if (!text) return undefined;
  if (/^\d{1,7}$/.test(text)) return Number(text) * 1000;
  const at = Date.parse(text);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

/** Sends with `node:http(s)`, following no redirect, waiting at most 15 seconds and reading at most 64 KiB of the answer. */
export const httpTransport: Transport = (url, headers, body, publicOnly) => new Promise(resolve => {
  if (publicOnly && (url.protocol !== 'https:' || (isIP(url.hostname.replace(/^\[|\]$/g, '')) && !publicAddress(url.hostname.replace(/^\[|\]$/g, ''))))) { resolve({ error: 'not_public' }); return; }
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const request = send(url, { method: 'POST', headers: { ...headers, 'content-length': body.length }, timeout: 15_000, ...(publicOnly ? { lookup: guardedLookup as never } : {}) }, (response: IncomingMessage) => {
    let size = 0;
    response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 65_536) response.destroy(); });
    response.on('close', () => resolve({ status: response.statusCode ?? 0, retryAfterMs: retryAfter(response.headers['retry-after']) }));
  });
  request.on('timeout', () => request.destroy(Object.assign(new Error('timeout'), { code: 'timeout' })));
  request.on('error', (error: NodeJS.ErrnoException) => resolve({ error: String(error.code ?? 'request_failed').slice(0, 64) }));
  request.end(body);
});

/** The outcome of an HTTP answer: 2xx sent, 429 and 5xx and network errors retried, `goneStatuses` gone, anything else final. */
export function outcomeOf(result: HttpResult, goneStatuses: readonly number[] = []): SendOutcome {
  if ('error' in result) return result.error === 'not_public' ? { kind: 'failed', reason: 'not_public' } : { kind: 'retry', reason: result.error };
  if (result.status >= 200 && result.status < 300) return { kind: 'delivered' };
  if (goneStatuses.includes(result.status)) return { kind: 'gone', reason: `http_${result.status}` };
  if (result.status === 429 || result.status >= 500 || result.status === 408) return { kind: 'retry', reason: `http_${result.status}`, ...(result.retryAfterMs !== undefined ? { retryAfterMs: result.retryAfterMs } : {}) };
  return { kind: 'failed', reason: `http_${result.status}` };
}

const priorities: Record<string, number> = { needs_you: 4, question: 4, review: 4, sign_off: 3, budget: 4, test: 3 };

/**
 * ntfy: each person gets one topic on the configured server, named by Unfold with 128 random bits so nobody can guess
 * it, and Unfold publishes with ntfy's JSON publish, with the access token from `tokenEnv` when one is named.
 */
export class NtfyChannel implements NotificationChannel {
  readonly id = 'ntfy';
  readonly label = 'ntfy';
  private readonly store: NotifyStore;
  private readonly settings: NtfySettings | undefined;
  private readonly transport: Transport;
  private readonly env: NodeJS.ProcessEnv;
  constructor(store: NotifyStore, settings: NtfySettings | undefined, transport: Transport = httpTransport, env: NodeJS.ProcessEnv = process.env) {
    this.store = store; this.settings = settings; this.transport = transport; this.env = env;
  }
  private token(): string | undefined { return this.settings?.tokenEnv ? this.env[this.settings.tokenEnv] || undefined : undefined; }
  available(): boolean { return Boolean(this.settings) && (!this.settings!.tokenEnv || Boolean(this.token())); }
  private newTopic(userId: string, at: string): Target {
    return this.store.putTarget(userId, this.id, 'topic', { topic: `${this.settings!.topicPrefix}${randomBytes(16).toString('base64url')}` }, at, 1);
  }
  enable(userId: string, at: string): void { if (this.settings && !this.store.targets(userId, this.id).length) this.newTopic(userId, at); }
  async send(message: NotificationMessage, target: Target): Promise<SendOutcome> {
    if (!this.settings) return { kind: 'failed', reason: 'not_configured' };
    const token = this.token();
    const body = { topic: String(target.address.topic), title: message.title, message: message.body, tags: ['bell'], priority: priorities[message.trigger] ?? 3, ...(message.url ? { click: message.url } : {}) };
    const result = await this.transport(new URL(`${this.settings.server}/`), { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, Buffer.from(JSON.stringify(body)), false);
    return outcomeOf(result);
  }
  describe(userId: string): Record<string, unknown> {
    const topic = this.store.targets(userId, this.id)[0]?.address.topic;
    return { server: this.settings?.server ?? null, topic: topic ?? null, subscribeUrl: this.settings && topic ? `${this.settings.server}/${topic}` : null, protected: Boolean(this.settings?.tokenEnv) };
  }
  async route(userId: string, method: string, rest: string[], _readBody: () => Promise<unknown>, at: string): Promise<ChannelAnswer> {
    if (rest.join('/') !== 'topic') return refuse(404, 'not_found', 'Unknown ntfy route.');
    if (method !== 'POST') return refuse(405, 'method', 'Use POST to get a new topic.');
    if (!this.available()) return refuse(409, 'notify_unavailable', 'ntfy is not configured on this server.');
    for (const old of this.store.targets(userId, this.id)) this.store.deleteTarget(old.id);
    this.newTopic(userId, at);
    return { status: 200, body: this.describe(userId) };
  }
}

/** The most push subscriptions one person keeps; the oldest goes when a new browser subscribes. */
export const maxPushSubscriptions = 10;

/** Reads a browser's `PushSubscription.toJSON()`: an HTTPS endpoint on a public host and its `p256dh` and `auth` keys. */
export function parseSubscription(raw: unknown): { endpoint: string; p256dh: string; auth: string } {
  const value = (raw && typeof raw === 'object' ? raw : {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  let url: URL;
  try { url = new URL(String(value.endpoint ?? '')); } catch { return refuse(400, 'notify_subscription', 'The subscription has no endpoint URL.'); }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048 || host === 'localhost' || host.endsWith('.localhost') || (isIP(host) && !publicAddress(host))) refuse(400, 'notify_subscription', 'A push endpoint must be an HTTPS URL on a public host.');
  const p256dh = value.keys?.p256dh;
  const auth = value.keys?.auth;
  if (!validPublicKey(p256dh) || typeof auth !== 'string' || !/^[A-Za-z0-9_-]{22,24}$/.test(auth) || fromBase64Url(auth).length !== 16) refuse(400, 'notify_subscription', 'The subscription keys are not valid.');
  return { endpoint: url.href, p256dh: p256dh as string, auth: auth as string };
}

/**
 * Web Push: a browser subscribes through the service worker, and Unfold sends each notice encrypted for that
 * subscription (RFC 8291) with a VAPID signature (RFC 8292) from the keys in `publicKeyEnv` and `privateKeyEnv`.
 * A subscription the push service answers 404 or 410 for is gone and deleted.
 */
export class WebPushChannel implements NotificationChannel {
  readonly id = 'web-push';
  readonly label = 'Web Push';
  private readonly store: NotifyStore;
  private readonly settings: WebPushSettings | undefined;
  private readonly transport: Transport;
  private readonly env: NodeJS.ProcessEnv;
  private readonly clock: () => number;
  private checked: VapidKeys | null | undefined;
  constructor(store: NotifyStore, settings: WebPushSettings | undefined, transport: Transport = httpTransport, env: NodeJS.ProcessEnv = process.env, clock: () => number = Date.now) {
    this.store = store; this.settings = settings; this.transport = transport; this.env = env; this.clock = clock;
  }
  private keys(): VapidKeys | null {
    if (this.checked !== undefined) return this.checked;
    const publicKey = this.settings ? this.env[this.settings.publicKeyEnv] : undefined;
    const privateKey = this.settings ? this.env[this.settings.privateKeyEnv] : undefined;
    try { this.checked = publicKey && privateKey && vapidSigningKey({ publicKey, privateKey }) ? { publicKey, privateKey } : null; }
    catch { this.checked = null; console.error(JSON.stringify({ level: 'warn', event: 'notify.vapid_invalid', message: 'The VAPID keys do not form a P-256 key pair; Web Push stays off.' })); }
    return this.checked;
  }
  available(): boolean { return this.keys() !== null; }
  enable(): void {}
  async send(message: NotificationMessage, target: Target): Promise<SendOutcome> {
    const keys = this.keys();
    if (!keys || !this.settings) return { kind: 'failed', reason: 'not_configured' };
    const endpoint = String(target.address.endpoint);
    const payload = encryptPayload(Buffer.from(JSON.stringify({ title: message.title, body: message.body, url: message.url, tag: message.tag })), { p256dh: String(target.address.p256dh), auth: String(target.address.auth) });
    const headers = {
      authorization: vapidAuthorization(endpoint, this.settings.subject, keys, Math.floor(this.clock() / 1000)),
      'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: message.trigger === 'sign_off' || message.trigger === 'test' ? 'normal' : 'high',
    };
    return outcomeOf(await this.transport(new URL(endpoint), headers, payload, true), [404, 410]);
  }
  describe(userId: string): Record<string, unknown> {
    return { publicKey: this.keys()?.publicKey ?? null, subscriptions: this.store.targets(userId, this.id).map(entry => ({ id: entry.id, host: new URL(String(entry.address.endpoint)).host, createdAt: entry.createdAt })) };
  }
  async route(userId: string, method: string, rest: string[], readBody: () => Promise<unknown>, at: string): Promise<ChannelAnswer> {
    if (rest[0] !== 'subscriptions' || rest.length > 2) return refuse(404, 'not_found', 'Unknown Web Push route.');
    if (rest.length === 1 && method === 'POST') {
      if (!this.available()) return refuse(409, 'notify_unavailable', 'Web Push is not configured on this server.');
      const subscription = parseSubscription(await readBody());
      const stored = this.store.putTarget(userId, this.id, subscription.endpoint, subscription, at, maxPushSubscriptions);
      return { status: 201, body: { id: stored.id, ...this.describe(userId) } };
    }
    if (rest.length === 2 && method === 'DELETE') {
      const found = this.store.target(rest[1]);
      if (!found || found.userId !== userId || found.channel !== this.id) return refuse(404, 'not_found', 'Subscription not found.');
      this.store.deleteTarget(found.id);
      return { status: 200, body: this.describe(userId) };
    }
    return refuse(405, 'method', 'Unsupported method.');
  }
}
