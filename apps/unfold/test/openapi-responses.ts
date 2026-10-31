import { createHash } from 'node:crypto';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { openApiDocument } from '../src/http.ts';

type Content = Record<string, { schema?: unknown }>;
type Response = { $ref?: string; content?: Content };
type Operation = { responses?: Record<string, Response> };
type Parameter = { $ref?: string; name: string; in: string; schema?: { enum?: unknown[] } };
type PathItem = { parameters?: Parameter[] } & Record<string, Operation | Parameter[] | undefined>;
type Spec = { paths: Record<string, PathItem>; components: { responses: Record<string, Response>; parameters: Record<string, Parameter> } };

const readJson = (path: string): unknown => {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return undefined; }
};

/**
 * The parsed YAML `source`, read from the JSON copy in the temporary directory named by the source's SHA-256 when an
 * earlier test process left one there, and parsed and left there otherwise.
 */
export function parseDescription(source: string): unknown {
  const copy = join(tmpdir(), `unfold-openapi-${createHash('sha256').update(source).digest('hex')}.json`);
  const cached = readJson(copy);
  if (cached !== undefined) return cached;
  const parsed = parse(source);
  const partial = `${copy}.${process.pid}`;
  try {
    writeFileSync(partial, JSON.stringify(parsed));
    renameSync(partial, copy);
  } catch {
    rmSync(partial, { force: true });
  }
  return parsed;
}

const documentId = 'https://unfold.invalid/contracts/openapi.yaml';
const source = readFileSync(openApiDocument, 'utf8');
const spec = parseDescription(source) as Spec;
const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
for (const external of new Set([...source.matchAll(/\$ref: '([^#'][^'#]*)/g)].map(match => match[1]))) {
  const schema = JSON.parse(readFileSync(new URL(external, openApiDocument), 'utf8'));
  ajv.addSchema({ ...schema, $id: new URL(external, documentId).href });
}
ajv.addSchema({ ...spec, $id: documentId });

const pointer = (...parts: string[]) => parts.map(part => part.replaceAll('~', '~0').replaceAll('/', '~1')).join('/');

const routes = Object.keys(spec.paths).map(path => {
  const declared = [...(spec.paths[path].parameters ?? [])].map(item => item.$ref ? spec.components.parameters[item.$ref.split('/').pop()!] : item);
  const operationParameters = Object.values(spec.paths[path]).flatMap(value => value && !Array.isArray(value) && 'responses' in value ? ((value as { parameters?: Parameter[] }).parameters ?? []) : []).map(item => item.$ref ? spec.components.parameters[item.$ref.split('/').pop()!] : item);
  const parameters = [...declared, ...operationParameters];
  const body = path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{([^}]+)\}/g, (_, name) => {
    const values = parameters.find(item => item.in === 'path' && item.name === name)?.schema?.enum;
    return values ? `(?:${values.map(String).join('|')})` : '[^/]+';
  });
  return { path, pattern: new RegExp(`^${body}$`), literals: path.replace(/\{[^}]+\}/g, '').length };
}).sort((a, b) => b.literals - a.literals);

const compiled = new Map<string, ValidateFunction>();

/** The documented path template of a request path, or undefined when the description has none. */
export function documentedPath(path: string): string | undefined {
  return routes.find(route => route.pattern.test(path))?.path;
}

/**
 * Every way a response breaks the OpenAPI description: an undocumented status, or a JSON body that does not match the
 * documented schema. Empty for a path outside `/api/`, or one the description does not list (the drift test owns that).
 */
export function responseProblems(method: string, url: string, status: number, contentType: string | null, body: unknown): string[] {
  const path = new URL(url, 'http://unfold.invalid').pathname;
  if (!path.startsWith('/api/')) return [];
  const template = documentedPath(path);
  if (!template) return [];
  const operation = spec.paths[template][method.toLowerCase()] as Operation | undefined;
  if (!operation?.responses) return [];
  const name = `${method.toUpperCase()} ${template}`;
  const key = [String(status), `${String(status)[0]}XX`, 'default'].find(candidate => operation.responses![candidate]);
  if (!key) return [`${name}: answered ${status}, which the description does not list (it lists ${Object.keys(operation.responses).join(', ')})`];
  const declared = operation.responses[key];
  const response = declared.$ref ? spec.components.responses[declared.$ref.split('/').pop()!] : declared;
  if (!contentType?.startsWith('application/json') || !response.content?.['application/json']?.schema) return [];
  const at = declared.$ref ? `#/components/responses/${pointer(declared.$ref.split('/').pop()!)}/content/application~1json/schema` : `#/paths/${pointer(template)}/${method.toLowerCase()}/responses/${key}/content/application~1json/schema`;
  const validate = compiled.get(at) ?? ajv.compile({ $ref: `${documentId}${at}` });
  compiled.set(at, validate);
  if (validate(body)) return [];
  return [`${name} ${status}: the body does not match the documented schema: ${(validate.errors ?? []).slice(0, 5).map(error => `${error.instancePath || '/'} ${error.message}${error.params && 'additionalProperty' in error.params ? ` (${String(error.params.additionalProperty)})` : ''}`).join('; ')}`];
}

/** Throws when a response breaks the OpenAPI description; see {@link responseProblems}. */
export function assertDocumentedResponse(method: string, url: string, status: number, contentType: string | null, body: unknown): void {
  const problems = responseProblems(method, url, status, contentType, body);
  if (!problems.length) return;
  throw new Error(`The response breaks docs/contracts/openapi.yaml; fix the route or the description:\n${problems.join('\n')}`);
}

/** Every `example` of a media type and every entry of a schema's `examples` in the description that its own schema refuses. */
export function exampleProblems(): string[] {
  const problems: string[] = [];
  const check = (at: string, example: unknown) => {
    const validate = ajv.compile({ $ref: `${documentId}#${at}` });
    if (!validate(example)) problems.push(`${at}: ${(validate.errors ?? []).slice(0, 3).map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')}`);
  };
  const visit = (node: unknown, at: string, mediaType: boolean) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((item, index) => visit(item, `${at}/${index}`, false)); return; }
    const record = node as Record<string, unknown>;
    if (mediaType && 'example' in record && record.schema) check(`${at}/schema`, record.example);
    if (!mediaType && Array.isArray(record.examples) && ('type' in record || 'properties' in record)) record.examples.forEach(example => check(at, example));
    for (const [key, value] of Object.entries(record)) {
      if (key === 'examples' || key === 'example') continue;
      visit(value, `${at}/${pointer(key)}`, at.endsWith('/content'));
    }
  };
  visit(spec, '', false);
  return problems;
}
