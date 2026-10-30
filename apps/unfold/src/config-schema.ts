import { readFileSync } from 'node:fs';

/** A JSON Schema node: an object of keywords, of which this validator understands those in {@link supportedKeywords}. */
export type Schema = { [keyword: string]: unknown };

/** One place a value breaks its schema: a JSON Pointer into the value and what is wrong there, in words. */
export type SchemaProblem = { path: string; message: string };

/**
 * The JSON Schema 2020-12 keywords {@link schemaProblems} applies or knows to ignore. The configuration schema may use
 * no other; a test fails when it does. `$ref` resolves only to `#/$defs/<name>` in the same document.
 */
export const supportedKeywords: readonly string[] = Object.freeze([
  '$schema', '$id', '$defs', '$ref', 'title', 'description', 'default', 'deprecated',
  'type', 'enum', 'const', 'not', 'anyOf',
  'pattern', 'minLength', 'maxLength',
  'minimum', 'maximum', 'exclusiveMinimum',
  'items', 'minItems', 'maxItems', 'uniqueItems',
  'properties', 'additionalProperties', 'required', 'propertyNames', 'maxProperties',
]);

/** The configuration file's schema, `docs/contracts/config.v1.schema.json`. */
export const configSchemaPath = new URL('../docs/contracts/config.v1.schema.json', import.meta.url);

type Found = SchemaProblem & { keyword: string };

const typeWords: Record<string, string> = { string: 'text', integer: 'a whole number', number: 'a number', boolean: 'true or false', object: 'an object', array: 'a list', null: 'null' };

const plainObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function hasType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string': return typeof value === 'string';
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'boolean': return typeof value === 'boolean';
    case 'object': return plainObject(value);
    case 'array': return Array.isArray(value);
    case 'null': return value === null;
    default: throw new Error(`Unsupported JSON Schema type ${type}`);
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (plainObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

const pointer = (path: string, key: string | number): string => `${path}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const kept = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = kept;
    }
  }
  return row[b.length];
}

/** The known key `key` most likely meant, or undefined when none is close: a different case, or at most a third of its letters off. */
export function closestKey(key: string, known: readonly string[]): string | undefined {
  let best: { name: string; cost: number } | undefined;
  for (const name of known) {
    const cost = name.toLowerCase() === key.toLowerCase() ? 0 : distance(key.toLowerCase(), name.toLowerCase());
    if (cost <= Math.max(1, Math.floor(Math.max(key.length, name.length) / 3)) && (!best || cost < best.cost)) best = { name, cost };
  }
  return best?.name;
}

function resolve(root: Schema, reference: unknown): Schema {
  const match = typeof reference === 'string' ? /^#\/\$defs\/([^/]+)$/.exec(reference) : null;
  const target = match ? (root.$defs as Record<string, Schema> | undefined)?.[match[1]] : undefined;
  if (!target) throw new Error(`Unsupported or unknown $ref ${String(reference)}`);
  return target;
}

function check(schema: Schema, value: unknown, path: string, root: Schema, out: Found[], described?: string): void {
  const description = typeof schema.description === 'string' ? schema.description : described;
  if (schema.$ref !== undefined) check(resolve(root, schema.$ref), value, path, root, out, description);
  if (schema.not !== undefined) {
    const inner: Found[] = [];
    check(schema.not as Schema, value, path, root, inner);
    if (!inner.length) out.push({ path, keyword: 'not', message: `must not be set${description ? `: ${description}` : ''}` });
  }
  if (schema.anyOf !== undefined) {
    const branches = (schema.anyOf as Schema[]).map(branch => { const found: Found[] = []; check(branch, value, path, root, found, description); return found; });
    if (branches.every(found => found.length)) {
      const wrongShape = (found: Found[]) => found.some(item => item.path === path && (item.keyword === 'type' || item.keyword === 'const')) ? 1 : 0;
      const closest = branches.reduce((best, found) => (wrongShape(found) - wrongShape(best) || found.length - best.length) < 0 ? found : best);
      if (wrongShape(closest)) out.push({ path, keyword: 'anyOf', message: `must match one of its forms${description ? `: ${description}` : ''}` });
      else out.push(...closest);
    }
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type as string[] : [schema.type as string];
    if (!types.some(type => hasType(value, type))) {
      out.push({ path, keyword: 'type', message: `must be ${types.map(type => typeWords[type] ?? type).join(' or ')}` });
      return;
    }
  }
  if (schema.const !== undefined && canonical(value) !== canonical(schema.const)) out.push({ path, keyword: 'const', message: `must be ${JSON.stringify(schema.const)}` });
  if (schema.enum !== undefined && !(schema.enum as unknown[]).some(option => canonical(option) === canonical(value))) out.push({ path, keyword: 'enum', message: `must be one of ${(schema.enum as unknown[]).map(option => typeof option === 'string' ? option : JSON.stringify(option)).join(', ')}` });
  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) out.push({ path, keyword: 'minLength', message: schema.minLength === 1 ? 'must not be empty' : `must be at least ${schema.minLength} characters` });
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) out.push({ path, keyword: 'maxLength', message: `must be at most ${schema.maxLength} characters` });
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(value)) out.push({ path, keyword: 'pattern', message: `must match ${schema.pattern}${description ? ` (${description})` : ''}` });
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) out.push({ path, keyword: 'minimum', message: `must be at least ${schema.minimum}` });
    if (typeof schema.maximum === 'number' && value > schema.maximum) out.push({ path, keyword: 'maximum', message: `must be at most ${schema.maximum}` });
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) out.push({ path, keyword: 'exclusiveMinimum', message: `must be more than ${schema.exclusiveMinimum}` });
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) out.push({ path, keyword: 'minItems', message: schema.minItems === 1 ? 'must not be empty' : `must list at least ${schema.minItems} entries` });
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) out.push({ path, keyword: 'maxItems', message: `must list at most ${schema.maxItems} entries` });
    if (schema.uniqueItems === true) {
      const seen = new Set<string>();
      value.forEach((item, index) => { const key = canonical(item); if (seen.has(key)) out.push({ path: pointer(path, index), keyword: 'uniqueItems', message: `repeats ${JSON.stringify(item)}` }); seen.add(key); });
    }
    if (plainObject(schema.items)) value.forEach((item, index) => check(schema.items as Schema, item, pointer(path, index), root, out));
  }
  if (plainObject(value)) {
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    for (const key of (schema.required ?? []) as string[]) if (!Object.hasOwn(value, key)) out.push({ path: pointer(path, key), keyword: 'required', message: `is required${properties[key]?.description ? `: ${properties[key].description}` : ''}` });
    if (typeof schema.maxProperties === 'number' && Object.keys(value).length > schema.maxProperties) out.push({ path, keyword: 'maxProperties', message: `must have at most ${schema.maxProperties} keys` });
    for (const [key, item] of Object.entries(value)) {
      const at = pointer(path, key);
      if (plainObject(schema.propertyNames)) {
        const found: Found[] = [];
        check(schema.propertyNames, key, at, root, found);
        for (const problem of found) out.push({ ...problem, message: `key ${JSON.stringify(key)} ${problem.message}` });
      }
      if (Object.hasOwn(properties, key)) check(properties[key], item, at, root, out);
      else if (schema.additionalProperties === false) {
        const meant = closestKey(key, Object.keys(properties));
        out.push({ path: at, keyword: 'additionalProperties', message: `unknown key${meant ? ` (did you mean ${meant}?)` : ''}` });
      } else if (plainObject(schema.additionalProperties)) check(schema.additionalProperties, item, at, root, out);
    }
  }
}

/** Every way `value` breaks `schema`, in document order; empty when it conforms. `root` holds the `$defs` a `$ref` names. */
export function schemaProblems(schema: Schema, value: unknown, root: Schema = schema): SchemaProblem[] {
  const found: Found[] = [];
  check(schema, value, '', root, found);
  return found.map(({ path, message }) => ({ path, message }));
}

let cached: Schema | undefined;

/** The parsed configuration schema, read once. */
export function configSchema(): Schema {
  cached ??= JSON.parse(readFileSync(configSchemaPath, 'utf8')) as Schema;
  return cached;
}

/** Every way a parsed configuration file breaks the configuration schema. */
export function configFileProblems(raw: unknown): SchemaProblem[] {
  return schemaProblems(configSchema(), raw);
}

/**
 * Throws one error that lists every problem of a parsed configuration file, one per line with its JSON Pointer, such
 * as `config.json: 2 problems:` followed by `  /auths: unknown key (did you mean auth?)`. Returns when there is none.
 */
export function assertConfigFile(raw: unknown, label: string): void {
  const problems = configFileProblems(raw);
  if (!problems.length) return;
  throw new Error(`${label}: ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${problems.map(problem => `  ${problem.path || '/'}: ${problem.message}`).join('\n')}`);
}
