import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { User } from '../types.ts';
import type { LinkedPermissions, PermissionRequest } from '../linked-permissions.ts';
import type { ChannelAnswer, NotificationChannel, PublicContext, PublicRequest, SendOutcome } from './channels.ts';
import { refuse } from './preferences.ts';
import type { SlackSettings } from './settings.ts';
import type { NotifyStore, Target } from './store.ts';
import type { NotificationMessage } from './triggers.ts';

/** One HTTP answer from Slack, or the error that stopped the request. */
export type SlackHttpResult = { status: number; retryAfter: string | null; text: string } | { error: string };
/** Sends one POST to Slack. Replaceable in tests. */
export type SlackHttp = (url: string, init: { headers: Record<string, string>; body: string }) => Promise<SlackHttpResult>;
/** A Web API method's answer: Slack's `ok` and `error`, the HTTP status and `Retry-After`, and the parsed body. */
export type SlackCall = { ok: boolean; error?: string; status: number; retryAfterMs?: number; data: Record<string, any> };
/** What the Slack adapter needs to answer a person's own tool-permission prompts. */
export type SlackPermissions = Pick<LinkedPermissions, 'answer' | 'optedIn'> & { store: { get(id: string): PermissionRequest | undefined } };
/** The Slack adapter's collaborators: the permission answers, the deployment's public URL, the clock, the environment and the HTTP client. */
export type SlackDependencies = { permissions?: SlackPermissions; baseUrl?: string; clock?: () => number; env?: NodeJS.ProcessEnv; http?: SlackHttp };

/** How far a request's `X-Slack-Request-Timestamp` may be from Unfold's clock, as Slack's request-signing guide recommends. */
export const slackSignatureToleranceSeconds = 300;
/** How long a link request sent to a Slack account waits for its confirmation. */
export const slackLinkMinutes = 15;
/**
 * The `action_id`s Unfold answers from Slack. Every other action, including anything that would spend money such as
 * retrying, approving or raising a budget, is refused with a pointer to Unfold.
 */
export const slackActions = {
  open: 'unfold.open',
  linkConfirm: 'unfold.link.confirm',
  openTask: 'unfold.open.task',
  permissionReview: 'unfold.permission.review',
  permissionAllow: 'unfold.permission.allow',
  permissionDeny: 'unfold.permission.deny',
} as const;

/** The answer Slack's interactions get for an action Unfold never takes from chat. */
export const chatRefusal = 'Unfold does not take this action from Slack. Open Unfold to do it: anything that spends money needs you there.';

/** Posts with `fetch`, following no redirect and waiting at most 15 seconds. */
export const fetchSlackHttp: SlackHttp = async (url, init) => {
  try {
    const response = await fetch(url, { method: 'POST', headers: init.headers, body: init.body, redirect: 'error', signal: AbortSignal.timeout(15_000) });
    return { status: response.status, retryAfter: response.headers.get('retry-after'), text: (await response.text()).slice(0, 262_144) };
  } catch (error: any) {
    return { error: String(error?.name === 'TimeoutError' ? 'timeout' : error?.cause?.code ?? 'request_failed').slice(0, 64) };
  }
};

const header = (headers: PublicRequest['headers'], name: string): string | undefined => {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/**
 * Checks Slack's request signature (version `v0`): the hex HMAC-SHA256, keyed with the signing secret, of
 * `v0:<X-Slack-Request-Timestamp>:<raw body>`, compared in constant time with `X-Slack-Signature`. A timestamp more
 * than {@link slackSignatureToleranceSeconds} from `nowMs` is stale.
 */
export function verifySlackSignature(secret: string, headers: PublicRequest['headers'], rawBody: Buffer, nowMs: number): 'ok' | 'missing' | 'stale' | 'invalid' {
  const timestamp = header(headers, 'x-slack-request-timestamp');
  const signature = header(headers, 'x-slack-signature');
  if (!timestamp || !signature) return 'missing';
  if (!/^\d{1,12}$/.test(timestamp)) return 'invalid';
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > slackSignatureToleranceSeconds) return 'stale';
  const expected = Buffer.from(`v0=${createHmac('sha256', secret).update(`v0:${timestamp}:`).update(rawBody).digest('hex')}`);
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given) ? 'ok' : 'invalid';
}

const retryable = new Set(['ratelimited', 'internal_error', 'fatal_error', 'service_unavailable', 'request_timeout']);
const goneErrors = new Set(['channel_not_found', 'is_archived', 'user_disabled', 'user_not_found', 'cannot_dm_bot']);

/** The outcome of a `chat.postMessage` answer: network errors, 429, 5xx and Slack's transient errors retried; a DM that went away gone. */
export function slackOutcome(call: SlackCall): SendOutcome {
  if (call.status === 0) return { kind: 'retry', reason: call.error ?? 'request_failed' };
  if (call.status === 429 || call.error === 'ratelimited') return { kind: 'retry', reason: 'slack_ratelimited', ...(call.retryAfterMs !== undefined ? { retryAfterMs: call.retryAfterMs } : {}) };
  if (call.status >= 500) return { kind: 'retry', reason: `http_${call.status}` };
  if (call.ok) return { kind: 'delivered' };
  if (call.error && retryable.has(call.error)) return { kind: 'retry', reason: `slack_${call.error}` };
  if (call.error && goneErrors.has(call.error)) return { kind: 'gone', reason: `slack_${call.error}` };
  return { kind: 'failed', reason: call.error ? `slack_${call.error}`.slice(0, 64) : `http_${call.status}` };
}

const plain = (text: string, max = 3000) => ({ type: 'plain_text', text: text.length > max ? `${text.slice(0, max - 1)}…` : text, emoji: false });
const clip = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

type Link = { userId: string; teamId: string; slackUserId: string; linkedAt: string };
type Pending = { userId: string; teamId: string; slackUserId: string; channel: string; createdAt: string; expiresAt: string };
type Payload = {
  type?: string; team?: { id?: string }; user?: { id?: string; team_id?: string }; trigger_id?: string; response_url?: string;
  container?: { type?: string }; view?: { id?: string; hash?: string }; actions?: { action_id?: string; value?: string; action_ts?: string }[];
};

/**
 * Slack: a Slack app with a bot token (`chat:write`, `im:write`, `users:read.email`) sends each notice as a direct
 * message in Block Kit with a link into Unfold. A person links their Slack account by email; Slack shows them a
 * confirmation that only that Slack account can press. With `permissionAnswers` on, the owner of a tool-permission
 * prompt may review and answer it from Slack; every interaction must carry a valid Slack request signature.
 */
export class SlackChannel implements NotificationChannel {
  readonly id = 'slack';
  readonly label = 'Slack';
  readonly flag = 'notifications.slack';
  private readonly store: NotifyStore;
  private readonly settings: SlackSettings | undefined;
  private readonly permissions: SlackPermissions | undefined;
  private readonly baseUrl: string | undefined;
  private readonly clock: () => number;
  private readonly env: NodeJS.ProcessEnv;
  private readonly http: SlackHttp;

  constructor(store: NotifyStore, settings: SlackSettings | undefined, dependencies: SlackDependencies = {}) {
    this.store = store;
    this.settings = settings;
    this.permissions = dependencies.permissions;
    this.baseUrl = dependencies.baseUrl;
    this.clock = dependencies.clock ?? Date.now;
    this.env = dependencies.env ?? process.env;
    this.http = dependencies.http ?? fetchSlackHttp;
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS notify_slack_links (user_id TEXT PRIMARY KEY, team_id TEXT NOT NULL, slack_user_id TEXT NOT NULL, linked_at TEXT NOT NULL, UNIQUE (team_id, slack_user_id));
      CREATE TABLE IF NOT EXISTS notify_slack_pending (user_id TEXT PRIMARY KEY, team_id TEXT NOT NULL, slack_user_id TEXT NOT NULL, channel TEXT NOT NULL, nonce_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
    `);
  }

  private token(): string | undefined { return this.settings ? this.env[this.settings.tokenEnv] || undefined : undefined; }
  private secret(): string | undefined { return this.settings ? this.env[this.settings.signingSecretEnv] || undefined : undefined; }
  private now(): string { return new Date(this.clock()).toISOString(); }
  private answersPermissions(): boolean { return Boolean(this.settings?.permissionAnswers && this.permissions); }

  available(): boolean { return Boolean(this.settings && this.token() && this.secret()); }
  enable(): void {}

  /** Calls one Slack Web API method with the bot token, as JSON or, with `form`, form-encoded. */
  async call(method: string, body: Record<string, unknown>, form = false): Promise<SlackCall> {
    const token = this.token();
    if (!this.settings || !token) return { ok: false, error: 'not_configured', status: 400, data: {} };
    const encoded = form ? new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)])).toString() : JSON.stringify(body);
    const result = await this.http(`${this.settings.apiUrl}/${method}`, { headers: { authorization: `Bearer ${token}`, 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json; charset=utf-8' }, body: encoded });
    if ('error' in result) return { ok: false, error: result.error, status: 0, data: {} };
    let data: Record<string, any> = {};
    try { const parsed = JSON.parse(result.text); if (parsed && typeof parsed === 'object') data = parsed; } catch { data = {}; }
    const wait = result.retryAfter && /^\d{1,7}$/.test(result.retryAfter) ? Number(result.retryAfter) * 1000 : undefined;
    return { ok: data.ok === true, ...(typeof data.error === 'string' ? { error: data.error } : {}), status: result.status, ...(wait !== undefined ? { retryAfterMs: wait } : {}), data };
  }

  /** The Block Kit of one notice: the headline and body as plain text, an Open button, an Open-in-tracker button for work a tracker holds, and a Review button for the owner's own prompt. */
  blocks(message: NotificationMessage): Record<string, unknown>[] {
    const elements: Record<string, unknown>[] = [];
    if (message.url) elements.push({ type: 'button', action_id: slackActions.open, text: plain(message.trigger === 'question' ? 'Answer in Unfold' : 'Open in Unfold', 75), url: message.url });
    if (message.task?.url) elements.push({ type: 'button', action_id: slackActions.openTask, text: plain(message.task.label, 75), url: message.task.url });
    if (message.subject?.kind === 'permission' && this.answersPermissions()) elements.push({ type: 'button', action_id: slackActions.permissionReview, style: 'primary', text: plain('Review and answer', 75), value: message.subject.requestId });
    return [{ type: 'section', text: plain(`${message.title}\n${message.body}`) }, ...(elements.length ? [{ type: 'actions', block_id: 'unfold.notice', elements }] : [])];
  }

  async send(message: NotificationMessage, target: Target): Promise<SendOutcome> {
    if (!this.available()) return { kind: 'failed', reason: 'not_configured' };
    const call = await this.call('chat.postMessage', { channel: String(target.address.channel), text: `${message.title}: ${message.body}`, blocks: this.blocks(message), unfurl_links: false, unfurl_media: false });
    return slackOutcome(call);
  }

  private link(userId: string): Link | undefined {
    const row = this.store.db.prepare('SELECT * FROM notify_slack_links WHERE user_id=?').get(userId) as Record<string, string> | undefined;
    return row ? { userId: row.user_id, teamId: row.team_id, slackUserId: row.slack_user_id, linkedAt: row.linked_at } : undefined;
  }
  private linkOf(teamId: string, slackUserId: string): Link | undefined {
    const row = this.store.db.prepare('SELECT user_id FROM notify_slack_links WHERE team_id=? AND slack_user_id=?').get(teamId, slackUserId) as { user_id: string } | undefined;
    return row ? this.link(row.user_id) : undefined;
  }
  private pending(userId: string): Pending | undefined {
    const row = this.store.db.prepare('SELECT * FROM notify_slack_pending WHERE user_id=?').get(userId) as Record<string, string> | undefined;
    return row ? { userId: row.user_id, teamId: row.team_id, slackUserId: row.slack_user_id, channel: row.channel, createdAt: row.created_at, expiresAt: row.expires_at } : undefined;
  }

  describe(userId: string): Record<string, unknown> {
    const link = this.link(userId);
    const pending = this.pending(userId);
    return {
      linked: link ? { teamId: link.teamId, slackUserId: link.slackUserId, linkedAt: link.linkedAt } : null,
      pending: pending && pending.expiresAt > this.now() ? { expiresAt: pending.expiresAt } : null,
      permissionAnswers: this.answersPermissions(),
    };
  }

  forget(userId: string): void {
    this.store.db.prepare('DELETE FROM notify_slack_links WHERE user_id=?').run(userId);
    this.store.db.prepare('DELETE FROM notify_slack_pending WHERE user_id=?').run(userId);
  }

  /**
   * `POST link` with `{ email }` finds that Slack account with `users.lookupByEmail`, opens a direct message with
   * `conversations.open` and asks there for a confirmation; `DELETE link` unlinks.
   */
  async route(userId: string, method: string, rest: string[], readBody: () => Promise<unknown>, at: string): Promise<ChannelAnswer> {
    if (rest.join('/') !== 'link') return refuse(404, 'not_found', 'Unknown Slack route.');
    if (method === 'DELETE') {
      for (const target of this.store.targets(userId, this.id)) this.store.deleteTarget(target.id);
      this.forget(userId);
      return { status: 200, body: this.describe(userId) };
    }
    if (method !== 'POST') return refuse(405, 'method', 'Use POST to link and DELETE to unlink.');
    if (!this.available()) return refuse(409, 'notify_unavailable', 'Slack is not configured on this server.');
    const raw = await readBody() as { email?: unknown } | undefined;
    const email = typeof raw?.email === 'string' ? raw.email.trim().toLowerCase() : '';
    if (!/^[^\s@]{1,200}@[^\s@]{1,200}$/.test(email)) return refuse(400, 'slack_email', 'Give the email address of your Slack account.');
    const earlier = this.pending(userId);
    if (earlier && Date.parse(at) - Date.parse(earlier.createdAt) < 60_000) return refuse(429, 'slack_link_wait', 'A link request was sent less than a minute ago. Confirm it in Slack, or wait a minute.');
    const lookup = await this.call('users.lookupByEmail', { email }, true);
    if (!lookup.ok) return lookup.error === 'users_not_found' ? refuse(404, 'slack_user_not_found', 'No one in the Slack workspace has that email address.') : refuse(409, 'slack_failed', `Slack answered ${lookup.error ?? `HTTP ${lookup.status}`}.`);
    const slackUserId = String(lookup.data.user?.id ?? '');
    const teamId = String(lookup.data.user?.team_id ?? '');
    if (!slackUserId || lookup.data.user?.is_bot === true) return refuse(404, 'slack_user_not_found', 'No one in the Slack workspace has that email address.');
    if (this.settings!.teamId && teamId !== this.settings!.teamId) return refuse(403, 'slack_workspace', 'That Slack account is in another workspace.');
    const taken = this.linkOf(teamId, slackUserId);
    if (taken && taken.userId !== userId) return refuse(409, 'slack_user_linked', 'That Slack account is linked to someone else in Unfold.');
    const opened = await this.call('conversations.open', { users: slackUserId });
    const channel = String(opened.data.channel?.id ?? '');
    if (!opened.ok || !channel) return refuse(409, 'slack_failed', `Slack answered ${opened.error ?? `HTTP ${opened.status}`}.`);
    const nonce = randomBytes(16).toString('base64url');
    const name = this.store.store.getUser(userId)?.name ?? userId;
    const posted = await this.call('chat.postMessage', {
      channel, text: 'Link this Slack account to Unfold?', unfurl_links: false, unfurl_media: false,
      blocks: [
        { type: 'section', text: plain(`Someone signed in to Unfold as ${clip(name, 120)} asked to send their Unfold notices to this Slack account. If that was you, link it. If not, ignore this message.`) },
        { type: 'actions', block_id: 'unfold.link', elements: [{ type: 'button', action_id: slackActions.linkConfirm, style: 'primary', text: plain('Link to Unfold', 75), value: nonce }] },
      ],
    });
    if (!posted.ok) return refuse(409, 'slack_failed', `Slack answered ${posted.error ?? `HTTP ${posted.status}`}.`);
    this.store.db.prepare('INSERT INTO notify_slack_pending(user_id,team_id,slack_user_id,channel,nonce_hash,created_at,expires_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET team_id=excluded.team_id, slack_user_id=excluded.slack_user_id, channel=excluded.channel, nonce_hash=excluded.nonce_hash, created_at=excluded.created_at, expires_at=excluded.expires_at')
      .run(userId, teamId, slackUserId, channel, hash(nonce), at, new Date(Date.parse(at) + slackLinkMinutes * 60_000).toISOString());
    return { status: 202, body: this.describe(userId) };
  }

  private responseUrlAllowed(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value);
      return (url.protocol === 'https:' && url.hostname === 'hooks.slack.com') || (Boolean(this.settings) && url.origin === new URL(this.settings!.apiUrl).origin);
    } catch { return false; }
  }

  private async reply(responseUrl: unknown, text: string, replaceOriginal = false): Promise<void> {
    if (!this.responseUrlAllowed(responseUrl)) return;
    await this.http(responseUrl, { headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ response_type: 'ephemeral', replace_original: replaceOriginal, text }) });
  }

  /**
   * Answers Slack's interactions at `POST interactions`. Nothing is read before the `v0` signature verifies; then only
   * the actions in {@link slackActions} do anything, and only for the Slack account linked to the person concerned.
   */
  async publicRoute(request: PublicRequest, context: PublicContext): Promise<ChannelAnswer> {
    if (request.rest.join('/') !== 'interactions') return refuse(404, 'not_found', 'Unknown Slack route.');
    if (request.method !== 'POST') return refuse(405, 'method', 'Slack posts interactions.');
    const secret = this.secret();
    if (!secret) return refuse(404, 'not_found', 'Slack is not configured on this server.');
    const verdict = verifySlackSignature(secret, request.headers, request.rawBody, this.clock());
    if (verdict !== 'ok') return refuse(401, 'slack_signature', verdict === 'stale' ? 'The Slack request timestamp is too far from now.' : 'The Slack request signature does not verify.');
    if (!String(header(request.headers, 'content-type') ?? '').startsWith('application/x-www-form-urlencoded')) return refuse(415, 'content_type', 'Slack posts interactions form-encoded.');
    let payload: Payload;
    try { payload = JSON.parse(new URLSearchParams(request.rawBody.toString('utf8')).get('payload') ?? ''); } catch { return refuse(400, 'slack_payload', 'The interaction has no JSON payload.'); }
    if (!payload || typeof payload !== 'object' || payload.type !== 'block_actions') return { status: 200, body: {} };
    const teamId = String(payload.team?.id ?? payload.user?.team_id ?? '');
    const slackUserId = String(payload.user?.id ?? '');
    const action = payload.actions?.[0];
    const actionId = String(action?.action_id ?? '');
    const value = String(action?.value ?? '');
    if (this.settings?.teamId && teamId !== this.settings.teamId) return refuse(403, 'slack_workspace', 'This Slack workspace is not the one Unfold serves.');
    if (actionId === slackActions.open || actionId === slackActions.openTask) return { status: 200, body: {} };
    if (actionId === slackActions.linkConfirm) return this.confirmLink(payload, teamId, slackUserId, value, request.at, context);
    if (actionId === slackActions.permissionReview || actionId === slackActions.permissionAllow || actionId === slackActions.permissionDeny) return this.permission(payload, actionId, teamId, slackUserId, value, request.at, context);
    await this.reply(payload.response_url, chatRefusal);
    return { status: 200, body: { refused: actionId.slice(0, 255) } };
  }

  private async confirmLink(payload: Payload, teamId: string, slackUserId: string, nonce: string, at: string, context: PublicContext): Promise<ChannelAnswer> {
    const row = nonce ? this.store.db.prepare('SELECT user_id FROM notify_slack_pending WHERE nonce_hash=?').get(hash(nonce)) as { user_id: string } | undefined : undefined;
    const pending = row ? this.pending(row.user_id) : undefined;
    if (!pending || pending.expiresAt <= at || pending.slackUserId !== slackUserId || pending.teamId !== teamId) {
      await this.reply(payload.response_url, 'This link request is no longer valid. Ask for a new one on your Notifications page in Unfold.');
      return { status: 200, body: { linked: false } };
    }
    const taken = this.linkOf(teamId, slackUserId);
    if ((taken && taken.userId !== pending.userId) || !await context.allowed(pending.userId)) {
      await this.reply(payload.response_url, taken && taken.userId !== pending.userId ? 'This Slack account is linked to someone else in Unfold.' : 'Slack notifications are not switched on for you in Unfold.');
      return { status: 200, body: { linked: false } };
    }
    if (Number(this.store.db.prepare('DELETE FROM notify_slack_pending WHERE user_id=? AND nonce_hash=?').run(pending.userId, hash(nonce)).changes) !== 1) return { status: 200, body: { linked: false } };
    this.store.putTarget(pending.userId, this.id, `${teamId}:${slackUserId}`, { teamId, slackUserId, channel: pending.channel }, at, 1);
    this.store.db.prepare('INSERT INTO notify_slack_links(user_id,team_id,slack_user_id,linked_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET team_id=excluded.team_id, slack_user_id=excluded.slack_user_id, linked_at=excluded.linked_at').run(pending.userId, teamId, slackUserId, at);
    await this.reply(payload.response_url, 'This Slack account is linked to Unfold. The notices you choose in Unfold arrive here.', true);
    return { status: 200, body: { linked: true } };
  }

  private permissionView(request: PermissionRequest): Record<string, unknown> {
    const confirm = (title: string, verb: string) => ({ title: plain(title, 100), text: plain(`${request.tool}: ${request.summary}`, 300), confirm: plain(verb, 30), deny: plain('Cancel', 30) });
    return {
      type: 'modal', callback_id: 'unfold.permission', private_metadata: request.id, title: plain('Tool permission', 24), close: plain('Close', 24),
      blocks: [
        { type: 'section', text: plain(`Your agent session asks to use ${request.tool}.`) },
        { type: 'section', text: plain(request.summary) },
        ...(request.detail ? [{ type: 'context', elements: [plain(request.detail)] }] : []),
        { type: 'context', elements: [plain(`It waits until ${request.expiresAt.slice(11, 19)} UTC. Unfold answers once; it never answers "always allow".`)] },
        { type: 'actions', block_id: 'unfold.permission', elements: [
          { type: 'button', action_id: slackActions.permissionAllow, style: 'primary', text: plain('Allow once', 75), value: request.id, confirm: confirm('Allow this tool once?', 'Allow once') },
          { type: 'button', action_id: slackActions.permissionDeny, style: 'danger', text: plain('Deny', 75), value: request.id, confirm: confirm('Deny this tool?', 'Deny') },
        ] },
      ],
    };
  }

  private resultView(text: string): Record<string, unknown> {
    return { type: 'modal', callback_id: 'unfold.permission.done', title: plain('Tool permission', 24), close: plain('Close', 24), blocks: [{ type: 'section', text: plain(text) }] };
  }

  private async permission(payload: Payload, actionId: string, teamId: string, slackUserId: string, requestId: string, at: string, context: PublicContext): Promise<ChannelAnswer> {
    const link = this.linkOf(teamId, slackUserId);
    const refusal = async (text: string, code: string) => { await this.reply(payload.response_url, text); return { status: 200, body: { answered: false, code } }; };
    if (!this.answersPermissions()) return refusal('Answer this prompt in Unfold.', 'permission_answers_off');
    if (!link) return refusal('Link your Slack account on your Notifications page in Unfold first.', 'slack_not_linked');
    if (!await context.allowed(link.userId)) return refusal('Slack notifications are not switched on for you in Unfold.', 'notifications_off');
    const request = this.permissions!.store.get(requestId);
    if (!request || request.ownerId !== link.userId) return refusal('Only the person whose session asks can answer this prompt.', 'not_owner');
    if (request.state !== 'pending' || request.expiresAt <= at || !this.permissions!.optedIn(request.sessionId)) return refusal('This prompt no longer waits for an answer from Unfold.', 'permission_closed');
    if (actionId === slackActions.permissionReview) {
      if (!payload.trigger_id) return refusal('Slack sent no trigger to open the prompt with.', 'slack_trigger');
      const opened = await this.call('views.open', { trigger_id: payload.trigger_id, view: this.permissionView(request) });
      if (!opened.ok) return refusal('Slack could not show the prompt. Answer it in Unfold.', 'slack_failed');
      return { status: 200, body: { answered: false, code: 'reviewing' } };
    }
    if (payload.container?.type !== 'view' || !payload.view?.id) return refusal('Review the prompt before you answer it.', 'review_first');
    const stored = this.store.store.getUser(link.userId);
    if (!stored) return refusal('Your Unfold account is gone.', 'not_owner');
    const user: User = { id: stored.id, name: stored.name, role: stored.role, ...(stored.memberships ? { memberships: stored.memberships } : {}) };
    const decision = actionId === slackActions.permissionAllow ? 'allow' : 'deny';
    const confirmation = `slack:${payload.view.id}:${String(payload.actions?.[0]?.action_ts ?? '')}`.slice(0, 200);
    let text: string;
    let answered = false;
    let status = 200;
    try {
      this.permissions!.answer({ user, scope: 'chat', confirmation }, request.sessionId, request.id, { decision });
      answered = true;
      text = decision === 'allow' ? 'Allowed once. Your session runs the tool.' : 'Denied. Your session does not run the tool.';
    } catch (error: any) {
      status = Number(error?.status) || 500;
      text = String(error?.message ?? 'Unfold could not answer the prompt.');
    }
    this.store.store.recordAction({
      at, userId: user.id, userName: user.name, role: user.role, channel: 'slack', action: 'POST /api/linked-sessions/:id/permissions/:requestId/answer', method: 'POST',
      target: { kind: 'session', id: request.sessionId }, inputs: { decision, request: request.id }, confirmation, status, outcome: answered ? 'done' : status < 500 ? 'refused' : 'failed',
    });
    await this.call('views.update', { view_id: payload.view.id, ...(payload.view.hash ? { hash: payload.view.hash } : {}), view: this.resultView(text) });
    return { status: 200, body: { answered, ...(answered ? { decision } : {}) } };
  }
}
