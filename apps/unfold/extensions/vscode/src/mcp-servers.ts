/** The id under `contributes.mcpServerDefinitionProviders` that the Ploeg server is registered with. */
export const ploegMcpProviderId = 'unfold.ploeg';

/** The setting that turns the provider off, for example after the server was added to the user `mcp.json`. */
export const provideServersSetting = 'mcp.provideServers';

/** One entry of `GET /api/mcp-servers`: a remote server by exact URL and the public OAuth client its sign-in uses. */
export type RemoteMcpServer = { id: string; label: string; type: 'http'; url: string; oauth: { clientId: string } };

function isLoopback(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
}

/**
 * The Ploeg server a workbench lists, or undefined when it lists none, lists it in a shape this extension does not know,
 * or names a URL that is not HTTPS (loopback excepted) or carries credentials.
 */
export function ploegMcpServer(listing: unknown): RemoteMcpServer | undefined {
  const servers = (listing as { servers?: unknown } | undefined)?.servers;
  if (!Array.isArray(servers)) return undefined;
  const server = servers.find(item => item && typeof item === 'object' && (item as RemoteMcpServer).id === 'ploeg') as RemoteMcpServer | undefined;
  if (!server || server.type !== 'http' || typeof server.url !== 'string' || typeof server.oauth?.clientId !== 'string' || !server.oauth.clientId) return undefined;
  let url: URL;
  try { url = new URL(server.url); } catch { return undefined; }
  if (url.username || url.password || !(url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback(url.hostname)))) return undefined;
  return { id: 'ploeg', label: typeof server.label === 'string' && server.label ? server.label : 'Ploeg', type: 'http', url: server.url, oauth: { clientId: server.oauth.clientId } };
}

/** The part of a provider this extension returns; `vscode.McpServerDefinitionProvider` from VS Code 1.101 has this shape. */
export type McpProvider<T> = {
  onDidChangeMcpServerDefinitions?: unknown;
  provideMcpServerDefinitions(): Promise<T[]>;
  resolveMcpServerDefinition?(server: T): Promise<T | undefined>;
};

/** The finalized MCP provider API: `vscode.lm.registerMcpServerDefinitionProvider` and `vscode.McpHttpServerDefinition`. */
export type McpProviderApi<T> = {
  register(id: string, provider: McpProvider<T>): { dispose(): unknown };
  http(label: string, url: string): T;
};

type ApiHost = { lm?: { registerMcpServerDefinitionProvider?: unknown }; McpHttpServerDefinition?: unknown; Uri?: { parse(value: string): unknown } };

/**
 * The provider API when the running editor has it, else undefined. `engines.vscode` stays at 1.99 for forks, and the
 * API arrived in 1.101, so it is read from the module at run time. The definition carries only a label and a URL:
 * the API has no field for an OAuth client id, and headers would be written to disk in plain text.
 */
export function mcpProviderApi<T>(host: ApiHost): McpProviderApi<T> | undefined {
  const register = host.lm?.registerMcpServerDefinitionProvider;
  const Definition = host.McpHttpServerDefinition;
  const parse = host.Uri?.parse;
  if (typeof register !== 'function' || typeof Definition !== 'function' || typeof parse !== 'function') return undefined;
  return {
    register: (id, provider) => register.call(host.lm, id, provider),
    http: (label, url) => new (Definition as new (label: string, uri: unknown) => T)(label, parse.call(host.Uri, url)),
  };
}

/** The user `mcp.json` entry that names the pre-registered client, so VS Code signs in without asking for a client id. */
export function mcpJsonEntry(server: RemoteMcpServer): Record<string, { type: 'http'; url: string; oauth: { clientId: string } }> {
  return { ploeg: { type: 'http', url: server.url, oauth: { clientId: server.oauth.clientId } } };
}

/** VS Code's own install link (`<scheme>:mcp/install?<json>`), which opens the server's install view; Install writes the user `mcp.json`. */
export function mcpInstallUri(scheme: string, server: RemoteMcpServer): string {
  return `${scheme}:mcp/install?${encodeURIComponent(JSON.stringify({ name: 'ploeg', type: 'http', url: server.url, oauth: { clientId: server.oauth.clientId } }))}`;
}
