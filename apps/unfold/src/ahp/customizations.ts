import { sessionPlacement } from '../runtime/workspace.ts';
import type { AppConfig, Session, WorkspaceBackend } from '../types.ts';

type Json = Record<string, any>;

export const gatewayServerName = 'litellm';

const gatewayToolPrefix = `${gatewayServerName}_`;
const maxClientPlugins = 64;

export const pluginRefusal = 'Unfold does not load plugins from VS Code. A session\'s agent runs in an isolated workspace with only the tools its repository is granted through the gateway, and a plugin can bring hooks, MCP servers and their credentials, which Unfold neither reads nor forwards. Ask the workbench owner to grant the tools to the repository instead.';

export const readOnlyRefusal = 'Unfold decides a session\'s MCP servers from its repository configuration; they cannot be started, stopped, enabled or disabled from a client.';

const readOnlyActions = new Set(['session/customizationToggled', 'session/mcpServerStartRequested', 'session/mcpServerStopRequested', 'session/mcpServerBackgroundRequested']);

const ploegKeyScope = 'Ploeg mints this session\'s gateway key and does not yet apply the repository\'s MCP access groups to it (VIK-1934), so the gateway alone decides which tools, if any, the agent gets.';

/** The facts that decide whether a session's agent is configured with the gateway's MCP server, for a started or a pending session. */
export type GatewaySubject = { repositoryId: string; runtime: Session['runtime']; placement?: WorkspaceBackend; status?: Session['status']; execution?: Session['execution'] };

/** The customization id VS Code's own host would mint for a top-level MCP server of this session. */
export function gatewayCustomizationId(publicId: string): string {
  return `mcp-top-level:unfold:${publicId}:${gatewayServerName}`;
}

function placementOf(config: AppConfig, subject: GatewaySubject): WorkspaceBackend | 'external' {
  try { return sessionPlacement(config, subject); } catch { return 'external'; }
}

function gatewayGrant(config: AppConfig, subject: GatewaySubject) {
  const repository = config.repositories.find(item => item.id === subject.repositoryId);
  if (!repository?.mcp || !config.litellm?.baseUrl || subject.runtime !== 'opencode') return undefined;
  if (placementOf(config, subject) === 'external') return undefined;
  return { repository, mcp: repository.mcp, ploeg: Boolean(subject.execution) || repository.executionOwner === 'ploeg' };
}

function lifecycleState(status: Session['status'] | undefined): Json {
  if (status === undefined || status === 'queued') return { kind: 'starting' };
  if (['running', 'waiting_input', 'exporting'].includes(status)) return { kind: 'ready' };
  return { kind: 'stopped' };
}

function gatewayServer(config: AppConfig, subject: GatewaySubject, publicId: string): Json | undefined {
  const grant = gatewayGrant(config, subject);
  if (!grant) return undefined;
  const id = gatewayCustomizationId(publicId);
  const ended = subject.status !== undefined && ['completed', 'failed', 'cancelled'].includes(subject.status);
  const state = grant.ploeg && !ended ? { kind: 'error', error: { errorType: 'gateway_key_unscoped', message: ploegKeyScope } } : lifecycleState(subject.status);
  return {
    type: 'mcpServer', id, uri: id, name: gatewayServerName, state,
    _meta: {
      'agentHost.mcpServerSource': 'managed',
      'vscode.mcpServerDisplayName': `Gateway tools (${grant.mcp.accessGroups.join(', ')})`,
      'dev.webgrip.unfold': { source: 'repository', repository: grant.repository.id, team: grant.mcp.litellmTeamId, accessGroups: [...grant.mcp.accessGroups], keyScope: grant.ploeg ? 'ploeg' : 'repository', clientControl: false },
    },
  };
}

function refusedPlugin(clientId: string, plugin: unknown): Json | undefined {
  if (!plugin || typeof plugin !== 'object') return undefined;
  const { id, uri, name } = plugin as Json;
  if (typeof id !== 'string' || !id || typeof uri !== 'string' || !uri || typeof name !== 'string') return undefined;
  return { type: 'plugin', id, uri, name, clientId, load: { kind: 'error', message: pluginRefusal }, children: [] };
}

/**
 * A session's `customizations`: the gateway MCP server its repository grants, when the agent is configured with it,
 * and every plugin an active client published, marked as refused. Nothing a client publishes is loaded or read.
 */
export function sessionCustomizations(config: AppConfig, subject: GatewaySubject, publicId: string, activeClients: readonly Json[]): Json[] {
  const server = gatewayServer(config, subject, publicId);
  const refused: Json[] = [];
  const seen = new Set<string>(server ? [server.id] : []);
  for (const client of activeClients) {
    if (typeof client?.clientId !== 'string' || !Array.isArray(client.customizations)) continue;
    for (const plugin of client.customizations) {
      if (refused.length >= maxClientPlugins) break;
      const entry = refusedPlugin(client.clientId, plugin);
      if (entry && !seen.has(entry.id)) { seen.add(entry.id); refused.push(entry); }
    }
  }
  return [...(server ? [server] : []), ...refused];
}

/** Attributes a tool call to the gateway MCP server when OpenCode named it after that server. */
export function gatewayToolCall(config: AppConfig, subject: GatewaySubject, publicId: string, toolName: string): { contributor: Json; _meta: Json } | undefined {
  if (!toolName.startsWith(gatewayToolPrefix) || toolName.length === gatewayToolPrefix.length || !gatewayGrant(config, subject)) return undefined;
  return { contributor: { kind: 'mcp', customizationId: gatewayCustomizationId(publicId) }, _meta: { mcpServerName: gatewayServerName, mcpToolName: toolName.slice(gatewayToolPrefix.length) } };
}

/** Why the host refuses a client action on a session's customizations, or undefined for any other action. */
export function customizationRefusal(actionType: unknown): string | undefined {
  return readOnlyActions.has(String(actionType)) ? readOnlyRefusal : undefined;
}

/** Why the host refuses a `root/configChanged`: VS Code's **Add Remote Plugin** sends the host's plugin list in it. */
export function rootConfigRefusal(config: unknown): string | undefined {
  const customizations = config && typeof config === 'object' ? (config as Json).customizations : undefined;
  return Array.isArray(customizations) && customizations.length ? pluginRefusal : undefined;
}

/** Remembers what each session's subscribers were last told, so a change is announced once. */
export class AnnouncedCustomizations {
  private readonly announced = new Map<string, string>();

  changed(publicId: string, customizations: Json[]): boolean {
    const fingerprint = JSON.stringify(customizations);
    const previous = this.announced.get(publicId) ?? '[]';
    this.announced.set(publicId, fingerprint);
    return previous !== fingerprint;
  }
}
