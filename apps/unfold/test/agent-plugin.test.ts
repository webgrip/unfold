import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMarketplace, connectionPlugin, mcpEndpoint } from '../scripts/agent-plugin-marketplace.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const plugin = fileURLToPath(new URL('../extensions/claude-code/', import.meta.url));
const agentPluginSchemaId = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const mcpSchemaId = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
const generator = fileURLToPath(new URL('../scripts/agent-plugin-marketplace.mjs', import.meta.url));
const pinned = '0123456789abcdef0123456789abcdef01234567';
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

type Schema = { type?: string; const?: unknown; enum?: unknown[]; minLength?: number; maxLength?: number; pattern?: string; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean | Schema; items?: Schema; propertyNames?: Schema; not?: Schema; oneOf?: Schema[]; $ref?: string; $defs?: Record<string, Schema> };
const annotations = new Set(['$schema', '$id', 'title', 'description', '$defs']);
const keywords = new Set(['type', 'const', 'enum', 'minLength', 'maxLength', 'pattern', 'properties', 'required', 'additionalProperties', 'items', 'propertyNames', 'not', 'oneOf', '$ref']);

function violations(schema: Schema, value: unknown, at = '$', root: Schema = schema): string[] {
  for (const keyword of Object.keys(schema)) if (!annotations.has(keyword) && !keywords.has(keyword)) throw new Error(`the test validator does not implement ${keyword} at ${at}`);
  if (schema.$ref !== undefined) {
    const name = schema.$ref.match(/^#\/\$defs\/([A-Za-z]+)$/)?.[1];
    if (!name || !root.$defs?.[name]) throw new Error(`the test validator resolves only local $defs references, not ${schema.$ref}`);
    return violations(root.$defs[name], value, at, root);
  }
  const found: string[] = [];
  if (schema.oneOf) {
    const matching = schema.oneOf.filter(branch => violations(branch, value, at, root).length === 0).length;
    if (matching !== 1) found.push(`${at} matches ${matching} of the oneOf branches, not exactly one`);
  }
  if (schema.not && violations(schema.not, value, at, root).length === 0) found.push(`${at} matches a schema it must not match`);
  if (schema.enum && !schema.enum.includes(value)) found.push(`${at} must be one of ${JSON.stringify(schema.enum)}`);
  if (schema.const !== undefined && value !== schema.const) found.push(`${at} must be ${JSON.stringify(schema.const)}`);
  if (schema.type === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) return [...found, `${at} must be an object`];
  if (schema.type === 'array' && !Array.isArray(value)) return [...found, `${at} must be an array`];
  if (schema.type === 'string' && typeof value !== 'string') return [...found, `${at} must be a string`];
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) found.push(`${at} is shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) found.push(`${at} is longer than ${schema.maxLength}`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) found.push(`${at} does not match ${schema.pattern}`);
  }
  if (Array.isArray(value) && schema.items) value.forEach((item, index) => found.push(...violations(schema.items!, item, `${at}[${index}]`, root)));
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in record)) found.push(`${at}.${key} is required`);
    for (const [key, member] of Object.entries(record)) {
      if (schema.propertyNames) found.push(...violations(schema.propertyNames, key, `${at}.${key} (name)`, root));
      const declared = schema.properties?.[key];
      if (declared) found.push(...violations(declared, member, `${at}.${key}`, root));
      else if (schema.additionalProperties === false) found.push(`${at}.${key} is not allowed`);
      else if (typeof schema.additionalProperties === 'object') found.push(...violations(schema.additionalProperties, member, `${at}.${key}`, root));
    }
  }
  return found;
}

const schema: Schema = readJson(join(plugin, 'schemas/agent-plugins/1.0.0/plugin.schema.json'));
const mcpSchema: Schema = readJson(join(plugin, 'schemas/agent-plugins/1.0.0/mcp.schema.json'));
const generated = (mcpUrl: string) => Object.fromEntries(Object.entries(buildMarketplace({ mcpUrl, sha: pinned })).map(([path, text]) => [path, JSON.parse(text)]));
const secretShaped = /vle_|bearer|token|secret|password|api[_-]?key|authorization|\$\{/i;

test('the root plugin.json is an Agent Plugins 1.0.0 manifest, checked against the published schema', () => {
  assert.equal((schema as Record<string, unknown>).$id, agentPluginSchemaId);
  const manifest = readJson(join(plugin, 'plugin.json'));
  assert.equal(manifest.$schema, agentPluginSchemaId);
  assert.deepEqual(violations(schema, manifest), []);
  assert.deepEqual(violations(schema, { ...manifest, hooks: './hooks/hooks.json' }), ['$.hooks is not allowed'], 'the manifest schema is closed');
  for (const name of ['My-Plugin', '-start', 'has--double', 'too.many..dots', '']) assert.notDeepEqual(violations(schema, { ...manifest, name }), [], `${JSON.stringify(name)} is not a valid plugin name`);
  assert.deepEqual(violations(schema, { name: 'unfold' }), ['$.$schema is required']);
});

test('every manifest that carries a version carries the same one, and names the same plugin', () => {
  const agent = readJson(join(plugin, 'plugin.json'));
  const claude = readJson(join(plugin, '.claude-plugin/plugin.json'));
  assert.equal(agent.name, claude.name);
  assert.match(agent.version, /^\d+\.\d+\.\d+$/);
  assert.equal(claude.version, agent.version);
  const marketplace = readJson(join(repository, '.claude-plugin/marketplace.json'));
  for (const entry of marketplace.plugins) if (entry.version !== undefined) assert.equal(entry.version, agent.version, `the marketplace entry ${entry.name} carries its own version`);
});

test('every skill meets the Agent Skills name and description rules and is named after its folder', () => {
  const skills = readdirSync(join(plugin, 'skills'), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
  assert.ok(skills.length > 0);
  for (const folder of skills) {
    const text = readFileSync(join(plugin, 'skills', folder, 'SKILL.md'), 'utf8');
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
    assert.ok(frontmatter, `${folder}/SKILL.md starts with YAML frontmatter`);
    const fields = Object.fromEntries(frontmatter.split('\n').map(line => line.match(/^([a-z-]+):\s*(.*)$/)).filter(match => match !== null).map(match => [match[1], match[2].trim()]));
    assert.equal(fields.name, folder, `${folder}: the skill's name matches its folder`);
    assert.match(fields.name, /^(?!.*--)[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, `${folder}: lowercase letters, digits and single hyphens, 1 to 64 characters`);
    assert.ok(fields.description && fields.description.length <= 1024, `${folder}: a description of 1 to 1024 characters`);
  }
});

test('the plugin ships no MCP server definition that names a host, and its Claude Code hooks stay where only Claude Code reads them', () => {
  const urls: string[] = [];
  for (const file of ['mcp.json', '.mcp.json']) if (existsSync(join(plugin, file))) for (const server of Object.values(readJson(join(plugin, file)).mcpServers ?? {}) as { url?: string }[]) if (server.url) urls.push(server.url);
  for (const server of Object.values(readJson(join(plugin, '.claude-plugin/plugin.json')).mcpServers ?? {}) as { url?: string }[]) if (server.url) urls.push(server.url);
  assert.deepEqual(urls.filter(url => !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)), [], 'the plugin works with any Unfold installation, so it names none; scripts/agent-plugin-marketplace.mjs generates the mcp.json of one installation');
  assert.ok(existsSync(join(plugin, 'hooks/hooks.json')));
  for (const path of ['hooks.json', 'com.github.copilot/hooks/hooks.json']) assert.equal(existsSync(join(plugin, path)), false, `${path} would hand Claude Code's hook script another client's payloads`);
});

test('every client finds the same marketplace, and each entry points at a plugin directory with both manifests', () => {
  for (const shadowing of ['marketplace.json', '.plugin/marketplace.json', '.github/plugin/marketplace.json']) assert.equal(existsSync(join(repository, shadowing)), false, `${shadowing} is read before .claude-plugin/marketplace.json by Copilot CLI and VS Code`);
  const marketplace = readJson(join(repository, '.claude-plugin/marketplace.json'));
  assert.ok(marketplace.owner?.name);
  for (const entry of marketplace.plugins) {
    assert.equal(typeof entry.source, 'string', `${entry.name} is a relative path inside this repository`);
    assert.match(entry.source, /^\.\//);
    const directory = join(repository, entry.source);
    assert.ok(statSync(directory).isDirectory(), `${entry.source} exists`);
    assert.equal(readJson(join(directory, 'plugin.json')).name, entry.name);
    assert.equal(readJson(join(directory, '.claude-plugin/plugin.json')).name, entry.name);
  }
});

test('the vendored mcp.json schema is the Agent Plugins 1.0.0 one, and the test validator enforces its closed server variants', () => {
  assert.equal((mcpSchema as Record<string, unknown>).$id, mcpSchemaId);
  const valid = { $schema: mcpSchemaId, mcpServers: { unfold: { type: 'streamable-http', url: 'https://unfold.example.com/mcp' } } };
  assert.deepEqual(violations(mcpSchema, valid), []);
  assert.notDeepEqual(violations(mcpSchema, { ...valid, mcpServers: { unfold: { type: 'streamable-http', url: 'https://unfold.example.com/mcp', oauth: { clientId: 'unfold-mcp' } } } }), [], 'Agent Plugins 1.0.0 has no OAuth field');
  assert.notDeepEqual(violations(mcpSchema, { ...valid, mcpServers: { unfold: { type: 'http', url: 'https://unfold.example.com/mcp' } } }), [], 'http is not an Agent Plugins transport name');
  assert.notDeepEqual(violations(mcpSchema, { ...valid, mcpServers: { local: { type: 'stdio', command: 'node', env: { PLUGIN_ROOT: '/x' } } } }), [], 'PLUGIN_ROOT is reserved');
  assert.notDeepEqual(violations(mcpSchema, { mcpServers: {} }), []);
});

test('the generated marketplace pins the upstream plugin by commit and adds an Agent Plugin whose mcp.json names the configured unfold-mcp URL', () => {
  const files = generated('https://unfold.example.com/mcp');
  assert.deepEqual(Object.keys(files).sort(), ['.claude-plugin/marketplace.json', `${connectionPlugin}/mcp.json`, `${connectionPlugin}/plugin.json`]);
  const manifest = files[`${connectionPlugin}/plugin.json`];
  assert.deepEqual(violations(schema, manifest), []);
  assert.equal(manifest.version, readJson(join(plugin, 'plugin.json')).version);
  const mcp = files[`${connectionPlugin}/mcp.json`];
  assert.deepEqual(violations(mcpSchema, mcp), []);
  assert.deepEqual(mcp.mcpServers, { unfold: { type: 'streamable-http', url: 'https://unfold.example.com/mcp' } });
  assert.notEqual(generated('https://work.acme.example/tools/mcp')[`${connectionPlugin}/mcp.json`].mcpServers.unfold.url, mcp.mcpServers.unfold.url);
  assert.equal(generated('https://work.acme.example/tools/mcp')[`${connectionPlugin}/mcp.json`].mcpServers.unfold.url, 'https://work.acme.example/tools/mcp');
  const [upstream, connection] = files['.claude-plugin/marketplace.json'].plugins;
  assert.deepEqual(upstream.source, { source: 'git-subdir', url: 'https://forgejo.webgrip.dev/webgrip/unfold.git', path: 'apps/unfold/extensions/claude-code', sha: pinned });
  assert.equal(readJson(join(repository, upstream.source.path, 'plugin.json')).name, upstream.name);
  assert.deepEqual(connection, { name: connectionPlugin, source: `./${connectionPlugin}`, description: manifest.description });
  assert.throws(() => buildMarketplace({ mcpUrl: 'https://unfold.example.com/mcp', sha: 'development' }), /40-character commit/);
  assert.throws(() => buildMarketplace({ mcpUrl: 'https://unfold.example.com/mcp', sha: pinned, repository: 'https://forgejo.example/unfold' }), /ending in \.git/);
});

test('the generated mcp.json holds no secret: no headers, no credential in the URL, and only the documented fields', () => {
  for (const url of ['https://unfold.example.com/mcp', 'http://localhost:8080/mcp', 'http://127.0.0.1:8080/mcp']) {
    const files = buildMarketplace({ mcpUrl: url, sha: pinned });
    for (const [path, text] of Object.entries(files)) assert.doesNotMatch(text, secretShaped, `${path} looks like it carries a credential`);
    const server = JSON.parse(files[`${connectionPlugin}/mcp.json`]).mcpServers.unfold;
    assert.deepEqual(Object.keys(server).sort(), ['type', 'url']);
  }
  for (const [url, reason] of [
    ['http://unfold.example.com/mcp', /must use https/],
    ['https://person:vle_abc@unfold.example.com/mcp', /user information/],
    ['https://unfold.example.com/mcp?token=vle_abc', /query or fragment/],
    ['https://unfold.example.com/mcp#x', /query or fragment/],
    ['https://${UNFOLD_HOST}/mcp', /placeholders/],
    ['https://unfold.example.com/', /no path/],
    ['unfold.example.com/mcp', /absolute URL/],
    ['', /--mcp-url or UNFOLD_MCP_RESOURCE/],
  ] as const) assert.throws(() => mcpEndpoint(url), reason, url);
});

test('the generator takes the URL from UNFOLD_MCP_RESOURCE, the variable the Unfold server serves unfold-mcp on, and writes the marketplace files', t => {
  const out = mkdtempSync(join(tmpdir(), 'unfold-plugin-marketplace-'));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  const run = spawnSync(process.execPath, [generator, '--sha', pinned, '--out', out], { encoding: 'utf8', env: { ...process.env, UNFOLD_MCP_RESOURCE: 'https://unfold.acme.example/mcp' } });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(readJson(join(out, connectionPlugin, 'mcp.json')).mcpServers.unfold.url, 'https://unfold.acme.example/mcp');
  assert.equal(readJson(join(out, '.claude-plugin/marketplace.json')).plugins[0].source.sha, pinned);
  const refused = spawnSync(process.execPath, [generator, '--sha', pinned, '--out', out, '--mcp-url', 'http://unfold.acme.example/mcp'], { encoding: 'utf8', env: { ...process.env, UNFOLD_MCP_RESOURCE: '' } });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /must use https/);
});
