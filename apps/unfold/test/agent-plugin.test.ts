import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const plugin = fileURLToPath(new URL('../extensions/claude-code/', import.meta.url));
const agentPluginSchemaId = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

type Schema = { type?: string; const?: unknown; minLength?: number; maxLength?: number; pattern?: string; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean | Schema; items?: Schema };
const annotations = new Set(['$schema', '$id', 'title', 'description']);
const keywords = new Set(['type', 'const', 'minLength', 'maxLength', 'pattern', 'properties', 'required', 'additionalProperties', 'items']);

function violations(schema: Schema, value: unknown, at = '$'): string[] {
  for (const keyword of Object.keys(schema)) if (!annotations.has(keyword) && !keywords.has(keyword)) throw new Error(`the test validator does not implement ${keyword} at ${at}`);
  const found: string[] = [];
  if (schema.const !== undefined && value !== schema.const) found.push(`${at} must be ${JSON.stringify(schema.const)}`);
  if (schema.type === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) return [...found, `${at} must be an object`];
  if (schema.type === 'array' && !Array.isArray(value)) return [...found, `${at} must be an array`];
  if (schema.type === 'string' && typeof value !== 'string') return [...found, `${at} must be a string`];
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) found.push(`${at} is shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) found.push(`${at} is longer than ${schema.maxLength}`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) found.push(`${at} does not match ${schema.pattern}`);
  }
  if (Array.isArray(value) && schema.items) value.forEach((item, index) => found.push(...violations(schema.items!, item, `${at}[${index}]`)));
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in record)) found.push(`${at}.${key} is required`);
    for (const [key, member] of Object.entries(record)) {
      const declared = schema.properties?.[key];
      if (declared) found.push(...violations(declared, member, `${at}.${key}`));
      else if (schema.additionalProperties === false) found.push(`${at}.${key} is not allowed`);
      else if (typeof schema.additionalProperties === 'object') found.push(...violations(schema.additionalProperties, member, `${at}.${key}`));
    }
  }
  return found;
}

const schema: Schema = readJson(join(plugin, 'schemas/agent-plugins/1.0.0/plugin.schema.json'));

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
  assert.deepEqual(urls.filter(url => !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)), [], 'the plugin works with any Unfold installation, so it names none');
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
