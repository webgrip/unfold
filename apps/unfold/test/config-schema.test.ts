import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { assertConfigFile, closestKey, configSchema, schemaProblems, supportedKeywords, type Schema } from '../src/config-schema.ts';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const environment = JSON.parse(read('docs/contracts/config.v1.environment.json')) as { variables: { name: string; type: string; description: string }[]; workspaceVariables: { names: string[] } };

function sourceFiles(directory: string): string[] {
  return readdirSync(new URL(`../${directory}`, import.meta.url), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? sourceFiles(`${directory}/${entry.name}`) : /\.(ts|mjs|js)$/.test(entry.name) ? [`${directory}/${entry.name}`] : []);
}

const valid = [
  {},
  JSON.parse(read('config/live.example.json')),
  JSON.parse(read('config/unified.example.json')),
  { mode: 'live', port: 4080, auth: { localLogin: false, oidc: { issuer: 'https://id.example/application/o/unfold/', clientId: 'unfold' } } },
];

const invalid = [
  { auths: {} },
  { port: 'eighty' },
  { port: 70000 },
  { mode: 'staging' },
  { runtime: { backends: ['cloud'] } },
  { auth: { agentHostOriginMode: 'strict' } },
  { hsts: { subdomains: true } },
  { repositories: [{ id: 'Orders', name: 'Orders', url: 'https://forge.example/o.git', baseBranch: 'main', verify: ['npm', 'test'] }] },
  { kubernetes: { memoryRequest: 'a lot' } },
];

test('the configuration schema uses only the keywords the startup validator applies', () => {
  const allowed = new Set(supportedKeywords);
  const unknown = new Set<string>();
  const visit = (node: unknown, mapOfSchemas = false) => {
    if (Array.isArray(node)) return node.forEach(item => visit(item));
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (mapOfSchemas) { visit(value); continue; }
      if (!allowed.has(key)) unknown.add(key);
      if (key === 'properties' || key === '$defs') visit(value, true);
      else if (['items', 'additionalProperties', 'propertyNames', 'not', 'anyOf'].includes(key)) visit(value);
    }
  };
  visit(configSchema());
  assert.deepEqual([...unknown], []);
});

test('the configuration schema is a valid JSON Schema 2020-12, and ajv and the startup validator agree on every fixture', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(configSchema());
  for (const fixture of valid) {
    assert.equal(validate(fixture), true, `${JSON.stringify(fixture).slice(0, 80)}: ${JSON.stringify(validate.errors)}`);
    assert.deepEqual(schemaProblems(configSchema(), fixture), []);
  }
  for (const fixture of invalid) {
    assert.equal(validate(fixture), false, `ajv accepts ${JSON.stringify(fixture)}`);
    assert.notDeepEqual(schemaProblems(configSchema(), fixture), [], `the startup validator accepts ${JSON.stringify(fixture)}`);
  }
});

test('a configuration file with several problems stops startup with one error listing each with its JSON Pointer', () => {
  assert.throws(() => assertConfigFile({ auths: {}, port: 'eighty', hsts: { subdomains: true } }, 'config.json'), (error: Error) => {
    assert.match(error.message, /^config\.json: 3 problems:\n/);
    assert.match(error.message, /\n {2}\/auths: unknown key \(did you mean auth\?\)/);
    assert.match(error.message, /\n {2}\/port: must be/);
    assert.match(error.message, /\n {2}\/hsts\/subdomains: unknown key/);
    return true;
  });
  assert.doesNotThrow(() => assertConfigFile({}, 'config.json'));
  assert.equal(closestKey('reposotories', ['repositories', 'teams']), 'repositories');
  assert.equal(closestKey('zzz', ['repositories', 'teams']), undefined);
});

test('a $ref resolves inside the schema and an unknown $ref is refused', () => {
  const schema: Schema = { $defs: { id: { type: 'string', pattern: '^[a-z]+$' } }, type: 'object', properties: { id: { $ref: '#/$defs/id' } }, additionalProperties: false };
  assert.deepEqual(schemaProblems(schema, { id: 'ok' }), []);
  assert.equal(schemaProblems(schema, { id: 'NO' })[0].path, '/id');
  assert.throws(() => schemaProblems({ $ref: 'https://elsewhere.example/schema' }, {}), /Unsupported or unknown \$ref/);
});

test('every environment variable src/ reads is in the environment reference, and the reference lists no variable src/ never reads', () => {
  const read = new Set<string>();
  for (const file of sourceFiles('src')) {
    const code = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const match of code.matchAll(/\b(?:process\.)?env\??\.([A-Z][A-Z0-9_]+)\b|\b(?:process\.)?env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g)) read.add(match[1] ?? match[2]);
  }
  const documented = new Set([...environment.variables.map(variable => variable.name), ...environment.workspaceVariables.names]);
  assert.deepEqual([...read].filter(name => !documented.has(name)).sort(), [], 'read in src/ but missing from docs/contracts/config.v1.environment.json');
  assert.deepEqual([...documented].filter(name => !read.has(name)).sort(), [], 'listed in docs/contracts/config.v1.environment.json but never read in src/');
  for (const variable of environment.variables) assert(variable.type && variable.description, `${variable.name} needs a type and a description`);
});
