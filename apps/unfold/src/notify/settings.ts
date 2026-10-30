/** The ntfy server Unfold publishes to, the variable holding its optional access token, and the prefix of each person's topic. */
export type NtfySettings = { server: string; tokenEnv?: string; topicPrefix: string };
/** The VAPID subject (`mailto:` or `https:`) and the variables holding the VAPID public and private keys. */
export type WebPushSettings = { subject: string; publicKeyEnv: string; privateKeyEnv: string };
/** The `notifications` configuration block: which channels the deployment offers, and the budget shares that notify. */
export type NotificationSettings = { ntfy?: NtfySettings; webPush?: WebPushSettings; budgetThresholds: number[] };

/** The budget shares that notify when no `budgetThresholds` is configured: 80 % and all of it. */
export const defaultBudgetThresholds: readonly number[] = [0.8, 1];

const envName = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !/^[A-Z_][A-Z0-9_]{0,127}$/.test(value)) throw new Error(`${label} must name an environment variable`);
  return value;
};
const only = (raw: Record<string, unknown>, keys: string[], label: string) => {
  const extra = Object.keys(raw).find(key => !keys.includes(key));
  if (extra) throw new Error(`${label} does not take ${extra}`);
};
const object = (raw: unknown, label: string): Record<string, unknown> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${label} must be an object`);
  return raw as Record<string, unknown>;
};

/**
 * Reads the optional `notifications` block. `ntfy.server` is an http(s) URL without credentials; `ntfy.tokenEnv`,
 * `webPush.publicKeyEnv` and `webPush.privateKeyEnv` name variables a Secret fills, never the values themselves.
 */
export function notificationSettings(raw: unknown): NotificationSettings {
  const block = object(raw, 'notifications');
  only(block, ['ntfy', 'webPush', 'budgetThresholds'], 'notifications');
  const settings: NotificationSettings = { budgetThresholds: [...defaultBudgetThresholds] };
  if (block.ntfy !== undefined) {
    const ntfy = object(block.ntfy, 'notifications.ntfy');
    only(ntfy, ['server', 'tokenEnv', 'topicPrefix'], 'notifications.ntfy');
    let server: URL;
    try { server = new URL(String(ntfy.server)); } catch { throw new Error('notifications.ntfy.server must be a URL'); }
    if (!['http:', 'https:'].includes(server.protocol) || server.username || server.password || server.search || server.hash) throw new Error('notifications.ntfy.server must be an http or https URL without credentials, query or fragment');
    const prefix = ntfy.topicPrefix === undefined ? 'unfold-' : ntfy.topicPrefix;
    if (typeof prefix !== 'string' || !/^[A-Za-z0-9_-]{0,32}$/.test(prefix)) throw new Error('notifications.ntfy.topicPrefix takes at most 32 letters, digits, - and _');
    settings.ntfy = { server: server.href.replace(/\/+$/, ''), topicPrefix: prefix, ...(ntfy.tokenEnv !== undefined ? { tokenEnv: envName(ntfy.tokenEnv, 'notifications.ntfy.tokenEnv') } : {}) };
  }
  if (block.webPush !== undefined) {
    const push = object(block.webPush, 'notifications.webPush');
    only(push, ['subject', 'publicKeyEnv', 'privateKeyEnv'], 'notifications.webPush');
    if (typeof push.subject !== 'string' || !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(push.subject)) throw new Error('notifications.webPush.subject must be a mailto: or https: contact (RFC 8292)');
    settings.webPush = { subject: push.subject, publicKeyEnv: envName(push.publicKeyEnv, 'notifications.webPush.publicKeyEnv'), privateKeyEnv: envName(push.privateKeyEnv, 'notifications.webPush.privateKeyEnv') };
  }
  if (block.budgetThresholds !== undefined) {
    const shares = block.budgetThresholds;
    if (!Array.isArray(shares) || shares.length > 5 || shares.some(share => typeof share !== 'number' || !(share > 0 && share <= 1))) throw new Error('notifications.budgetThresholds takes up to five shares above 0 and at most 1');
    settings.budgetThresholds = [...new Set(shares as number[])].sort((a, b) => a - b);
  }
  return settings;
}
