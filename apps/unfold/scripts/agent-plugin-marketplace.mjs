import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const plugin = fileURLToPath(new URL('../extensions/claude-code/', import.meta.url));
const pluginPath = 'apps/unfold/extensions/claude-code';
const pluginSchema = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const mcpSchema = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);

export const defaultRepository = 'https://forgejo.webgrip.dev/webgrip/unfold.git';
export const connectionPlugin = 'unfold-mcp';

/**
 * Checks an unfold-mcp endpoint against Agent Plugins 1.0.0 §7.2.1 and returns it normalized.
 * It refuses user information, a query and a fragment, so no credential can ride along in the URL.
 */
export function mcpEndpoint(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('pass the unfold-mcp URL with --mcp-url or UNFOLD_MCP_RESOURCE, such as https://unfold.example.com/mcp');
  if (value.includes('${')) throw new Error('Agent Plugins clients never expand placeholders in a remote server url; pass the real URL');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error(`${value} is not an absolute URL`); }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback.has(url.hostname))) throw new Error(`${value} must use https; http is allowed for localhost only`);
  if (url.username || url.password) throw new Error(`${value} carries user information; the client signs in through OAuth instead`);
  if (url.search || url.hash) throw new Error(`${value} carries a query or fragment; use the exact UNFOLD_MCP_RESOURCE of the installation`);
  if (url.pathname === '/' || !url.pathname) throw new Error(`${value} names no path; unfold-mcp is served on the path of UNFOLD_MCP_RESOURCE, such as /mcp`);
  return url.href;
}

/**
 * Builds a marketplace for one Unfold installation: the upstream `unfold` plugin pinned to one commit,
 * and a generated `unfold-mcp` plugin whose mcp.json names that installation's unfold-mcp endpoint.
 * Returns the files to write as a map of relative path to text.
 */
export function buildMarketplace({ mcpUrl, sha, repository = defaultRepository, name = 'unfold', owner = 'Unfold' }) {
  const url = mcpEndpoint(mcpUrl);
  if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) throw new Error('pass --sha with the full 40-character commit of the Unfold release to pin, such as the output of git rev-parse unfold-v0.4.0^{commit}');
  if (!/^https:\/\/[^\s#?]+\.git$/.test(repository)) throw new Error(`${repository} must be an https git URL ending in .git, which VS Code requires`);
  if (!/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(name) || name.length > 64) throw new Error(`${name} is not a valid marketplace name`);
  const upstream = JSON.parse(readFileSync(join(plugin, 'plugin.json'), 'utf8'));
  const host = new URL(url).host;
  const manifest = {
    $schema: pluginSchema,
    name: connectionPlugin,
    version: upstream.version,
    description: `Connects Agent Plugins clients to the Unfold MCP tools at ${host}. Sign in through the browser when the client asks.`,
    author: upstream.author,
    homepage: upstream.homepage,
    repository: upstream.repository,
    license: upstream.license,
    keywords: ['unfold', 'mcp', 'work-items'],
  };
  const mcp = { $schema: mcpSchema, mcpServers: { unfold: { type: 'streamable-http', url } } };
  const marketplace = {
    name,
    owner: { name: owner },
    metadata: { description: `The Unfold plugin and the MCP connection for ${host}.` },
    plugins: [
      { name: upstream.name, source: { source: 'git-subdir', url: repository, path: pluginPath, sha }, description: upstream.description },
      { name: connectionPlugin, source: `./${connectionPlugin}`, description: manifest.description },
    ],
  };
  const json = value => `${JSON.stringify(value, null, 2)}\n`;
  return {
    '.claude-plugin/marketplace.json': json(marketplace),
    [`${connectionPlugin}/plugin.json`]: json(manifest),
    [`${connectionPlugin}/mcp.json`]: json(mcp),
  };
}

function main() {
  const { values } = parseArgs({
    options: {
      'mcp-url': { type: 'string' },
      sha: { type: 'string' },
      repository: { type: 'string' },
      name: { type: 'string' },
      owner: { type: 'string' },
      out: { type: 'string' },
    },
  });
  if (!values.out) throw new Error('pass --out with the directory of your marketplace repository');
  const files = buildMarketplace({
    mcpUrl: values['mcp-url'] ?? process.env.UNFOLD_MCP_RESOURCE,
    sha: values.sha,
    repository: values.repository,
    name: values.name,
    owner: values.owner,
  });
  for (const [path, text] of Object.entries(files)) {
    const target = resolve(values.out, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    process.stdout.write(`${target}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
