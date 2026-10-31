import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { httpTransport, outcomeOf, publicAddress, type ChannelAnswer, type NotificationChannel, type SendOutcome, type Transport } from './channels.ts';
import { refuse } from './preferences.ts';
import type { TeamsSettings } from './settings.ts';
import type { NotifyStore, Target } from './store.ts';
import type { NotificationMessage } from './triggers.ts';

/** The most Teams workflow webhooks one person keeps; the oldest goes when a new one is added. */
export const maxTeamsWebhooks = 5;

/** Reads a Power Automate workflow webhook URL: HTTPS on a public host that ends in one of `allowedHosts`, without user info. */
export function parseWorkflowUrl(raw: unknown, allowedHosts: readonly string[]): URL {
  let url: URL;
  try { url = new URL(String(raw ?? '')); } catch { return refuse(400, 'teams_webhook', 'Paste the workflow webhook URL from Microsoft Teams.'); }
  const host = url.hostname.toLowerCase();
  const allowed = allowedHosts.some(suffix => host === suffix || host.endsWith(`.${suffix}`));
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.href.length > 2048 || (isIP(host.replace(/^\[|\]$/g, '')) && !publicAddress(host.replace(/^\[|\]$/g, ''))) || !allowed) {
    return refuse(400, 'teams_webhook', `A workflow webhook is an HTTPS URL on ${allowedHosts.join(' or ')}.`);
  }
  return url;
}

const run = (text: string, extra: Record<string, unknown> = {}) => ({ type: 'TextRun', text: text.replace(/\{\{/g, '{ {'), ...extra });

/**
 * The Adaptive Card a workflow webhook posts: the headline and body as `RichTextBlock` text runs, which render no
 * Markdown, an `Action.OpenUrl` into Unfold and, for work a tracker holds, one to the tracker task. Teams takes it as a `message` with one attachment.
 */
export function adaptiveCardMessage(message: NotificationMessage): Record<string, unknown> {
  const label = message.trigger === 'question' ? 'Answer in Unfold' : 'Open in Unfold';
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'RichTextBlock', inlines: [run(message.title, { weight: 'Bolder', size: 'Medium' })] },
          { type: 'RichTextBlock', inlines: [run(message.body)] },
        ],
        actions: [...(message.url ? [{ type: 'Action.OpenUrl', title: label, url: message.url }] : []), ...(message.task?.url ? [{ type: 'Action.OpenUrl', title: message.task.label, url: message.task.url }] : [])],
      },
    }],
  };
}

/**
 * Microsoft Teams through Power Automate Workflows: a person creates a workflow from the "Send webhook alerts to a
 * chat" or "… to a channel" template, which posts to the chat or channel they choose, and pastes its webhook URL.
 * Unfold posts an Adaptive Card with an Open link; the cards carry no action Unfold answers. The URL is a secret: it
 * stays in the target table and the API shows only its host.
 */
export class TeamsChannel implements NotificationChannel {
  readonly id = 'teams';
  readonly label = 'Microsoft Teams';
  readonly flag = 'notifications.teams';
  private readonly store: NotifyStore;
  private readonly settings: TeamsSettings | undefined;
  private readonly transport: Transport;
  constructor(store: NotifyStore, settings: TeamsSettings | undefined, transport: Transport = httpTransport) {
    this.store = store; this.settings = settings; this.transport = transport;
  }
  available(): boolean { return Boolean(this.settings); }
  enable(): void {}
  async send(message: NotificationMessage, target: Target): Promise<SendOutcome> {
    if (!this.settings) return { kind: 'failed', reason: 'not_configured' };
    const url = new URL(String(target.address.url));
    return outcomeOf(await this.transport(url, { 'content-type': 'application/json' }, Buffer.from(JSON.stringify(adaptiveCardMessage(message))), true), [404, 410]);
  }
  describe(userId: string): Record<string, unknown> {
    return { webhooks: this.store.targets(userId, this.id).map(entry => ({ id: entry.id, host: new URL(String(entry.address.url)).host, label: String(entry.address.label ?? ''), createdAt: entry.createdAt })) };
  }
  /** `POST webhooks` with `{ url, label }` adds a workflow webhook; `DELETE webhooks/<id>` removes one. */
  async route(userId: string, method: string, rest: string[], readBody: () => Promise<unknown>, at: string): Promise<ChannelAnswer> {
    if (rest[0] !== 'webhooks' || rest.length > 2) return refuse(404, 'not_found', 'Unknown Microsoft Teams route.');
    if (rest.length === 1 && method === 'POST') {
      if (!this.settings) return refuse(409, 'notify_unavailable', 'Microsoft Teams is not configured on this server.');
      const raw = (await readBody() ?? {}) as { url?: unknown; label?: unknown };
      const url = parseWorkflowUrl(raw.url, this.settings.allowedHosts);
      const label = typeof raw.label === 'string' ? raw.label.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
      const stored = this.store.putTarget(userId, this.id, createHash('sha256').update(url.href).digest('hex'), { url: url.href, label }, at, maxTeamsWebhooks);
      return { status: 201, body: { id: stored.id, ...this.describe(userId) } };
    }
    if (rest.length === 2 && method === 'DELETE') {
      const found = this.store.target(rest[1]);
      if (!found || found.userId !== userId || found.channel !== this.id) return refuse(404, 'not_found', 'Webhook not found.');
      this.store.deleteTarget(found.id);
      return { status: 200, body: this.describe(userId) };
    }
    return refuse(405, 'method', 'Unsupported method.');
  }
}
