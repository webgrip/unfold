/** The ntfy server Unfold publishes to, the variable holding its optional access token, and the prefix of each person's topic. */
export type NtfySettings = { server: string; tokenEnv?: string; topicPrefix: string };
/** The VAPID subject (`mailto:` or `https:`) and the variables holding the VAPID public and private keys. */
export type WebPushSettings = { subject: string; publicKeyEnv: string; privateKeyEnv: string };
/**
 * The Slack app: the variables holding its bot token (`xoxb-…`) and signing secret, the Web API base, the one
 * workspace it may serve when `teamId` is set, and whether a person may answer their own tool-permission prompts from Slack.
 */
export type SlackSettings = { tokenEnv: string; signingSecretEnv: string; apiUrl: string; teamId?: string; permissionAnswers: boolean };
/** Microsoft Teams through Power Automate Workflows webhooks: the host suffixes a person's workflow URL may use. */
export type TeamsSettings = { allowedHosts: string[] };
/** The `notifications` configuration block: which channels the deployment offers, and the budget shares that notify. */
export type NotificationSettings = { ntfy?: NtfySettings; webPush?: WebPushSettings; slack?: SlackSettings; teams?: TeamsSettings; budgetThresholds: number[] };

/** The Slack Web API base Unfold calls when `slack.apiUrl` is not set. */
export const slackApiUrl = 'https://slack.com/api';
/** The hosts a Teams workflow webhook URL may end in when `teams.allowedHosts` is not set. */
export const defaultTeamsHosts: readonly string[] = ['logic.azure.com', 'api.powerplatform.com'];

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
 * `webPush.publicKeyEnv`, `webPush.privateKeyEnv`, `slack.tokenEnv` and `slack.signingSecretEnv` name variables a
 * Secret fills, never the values themselves.
 */
export function notificationSettings(raw: unknown): NotificationSettings {
  const block = object(raw, 'notifications');
  only(block, ['ntfy', 'webPush', 'slack', 'teams', 'budgetThresholds'], 'notifications');
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
  if (block.slack !== undefined) {
    const slack = object(block.slack, 'notifications.slack');
    only(slack, ['tokenEnv', 'signingSecretEnv', 'apiUrl', 'teamId', 'permissionAnswers'], 'notifications.slack');
    let api: URL;
    try { api = new URL(String(slack.apiUrl ?? slackApiUrl)); } catch { throw new Error('notifications.slack.apiUrl must be a URL'); }
    if (!['http:', 'https:'].includes(api.protocol) || api.username || api.password || api.search || api.hash) throw new Error('notifications.slack.apiUrl must be an http or https URL without credentials, query or fragment');
    if (slack.teamId !== undefined && (typeof slack.teamId !== 'string' || !/^[TE][A-Z0-9]{2,20}$/.test(slack.teamId))) throw new Error('notifications.slack.teamId must be a Slack workspace id such as T012AB3C4');
    if (slack.permissionAnswers !== undefined && typeof slack.permissionAnswers !== 'boolean') throw new Error('notifications.slack.permissionAnswers must be true or false');
    settings.slack = {
      tokenEnv: envName(slack.tokenEnv, 'notifications.slack.tokenEnv'), signingSecretEnv: envName(slack.signingSecretEnv, 'notifications.slack.signingSecretEnv'),
      apiUrl: api.href.replace(/\/+$/, ''), permissionAnswers: slack.permissionAnswers === true, ...(slack.teamId ? { teamId: slack.teamId as string } : {}),
    };
  }
  if (block.teams !== undefined) {
    const teams = object(block.teams, 'notifications.teams');
    only(teams, ['allowedHosts'], 'notifications.teams');
    const hosts = teams.allowedHosts ?? [...defaultTeamsHosts];
    if (!Array.isArray(hosts) || !hosts.length || hosts.length > 10 || hosts.some(host => typeof host !== 'string' || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host))) throw new Error('notifications.teams.allowedHosts takes one to ten host names such as logic.azure.com');
    settings.teams = { allowedHosts: [...new Set(hosts as string[])] };
  }
  if (block.budgetThresholds !== undefined) {
    const shares = block.budgetThresholds;
    if (!Array.isArray(shares) || shares.length > 5 || shares.some(share => typeof share !== 'number' || !(share > 0 && share <= 1))) throw new Error('notifications.budgetThresholds takes up to five shares above 0 and at most 1');
    settings.budgetThresholds = [...new Set(shares as number[])].sort((a, b) => a - b);
  }
  return settings;
}
