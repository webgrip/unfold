/**
 * A field pick: a JSON Pointer (RFC 6901) into the payload, a pointer with one bounded step, a fixed value, or a join
 * of pointers. Nothing in it is evaluated as code; every pick reads at most one level of array elements.
 */
export type Pick =
  | string
  | { pointer: string; each?: string; split?: string }
  | { join: string[]; separator?: string }
  | { value: string };

/** One condition a payload must meet for the mapping to apply, such as `/type` equals `issue.created`. */
export type Condition = { pointer: string; equals: string | number | boolean };

/** How one sender's JSON payload becomes a Request. */
export type Mapping = {
  when?: Condition[];
  fields: {
    title: Pick;
    description?: Pick;
    reporterName?: Pick;
    reporterEmail?: Pick;
    externalId?: Pick;
    links?: Pick[];
    attachments?: Pick[];
    labels?: Pick[];
  };
};

/** What a mapping draws from one payload, before the Request is stored. */
export type Mapped = {
  title: string;
  description: string;
  reporter: { name: string | null; email: string | null } | null;
  externalId: string | null;
  links: string[];
  attachments: string[];
  labels: string[];
};

export const intakeLimits = { title: 300, description: 20_000, name: 200, email: 320, externalId: 200, url: 2048, label: 100, list: 20, picks: 12, conditions: 8, pointer: 300, json: 16_384 } as const;

const singleFields = ['title', 'description', 'reporterName', 'reporterEmail', 'externalId'] as const;
const listFields = ['links', 'attachments', 'labels'] as const;

/** Reads the value `pointer` names in `document` (RFC 6901), or undefined when it names nothing. `""` is the whole document. */
export function resolvePointer(document: unknown, pointer: string): unknown {
  if (pointer === '') return document;
  if (!pointer.startsWith('/')) return undefined;
  let current: unknown = document;
  for (const raw of pointer.slice(1).split('/')) {
    const token = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]{0,8})$/.test(token)) return undefined;
      current = current[Number(token)];
    } else if (current && typeof current === 'object') {
      if (!Object.hasOwn(current, token)) return undefined;
      current = (current as Record<string, unknown>)[token];
    } else return undefined;
  }
  return current;
}

function scalar(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return undefined;
}

function values(document: unknown, pick: Pick): string[] {
  if (typeof pick === 'string') {
    const found = resolvePointer(document, pick);
    if (Array.isArray(found)) return found.slice(0, intakeLimits.list).map(scalar).filter((item): item is string => item !== undefined);
    const one = scalar(found);
    return one === undefined ? [] : [one];
  }
  if ('value' in pick) return [pick.value];
  if ('join' in pick) {
    const parts = pick.join.map(pointer => scalar(resolvePointer(document, pointer)));
    if (parts.some(part => part === undefined || part === '')) return [];
    return [parts.join(pick.separator ?? '')];
  }
  const found = resolvePointer(document, pick.pointer);
  const items = Array.isArray(found) ? found.slice(0, intakeLimits.list) : [found];
  const picked = items.map(item => scalar(pick.each === undefined ? item : resolvePointer(item, pick.each))).filter((item): item is string => item !== undefined);
  if (pick.split === undefined) return picked;
  return picked.flatMap(item => item.split(pick.split!));
}

const clean = (value: string, max: number) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

/** Keeps `value` when it is an absolute http or https URL without credentials, of at most 2048 characters. */
export function safeUrl(value: string): string | undefined {
  const text = value.trim();
  if (!text || text.length > intakeLimits.url) return undefined;
  let parsed: URL;
  try { parsed = new URL(text); } catch { return undefined; }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return undefined;
  return parsed.href;
}

const unique = (items: string[]) => [...new Set(items)].slice(0, intakeLimits.list);

/** Whether `payload` meets every condition of `mapping`. */
export function applies(mapping: Mapping, payload: unknown): boolean {
  return (mapping.when ?? []).every(condition => resolvePointer(payload, condition.pointer) === condition.equals);
}

/** Applies `mapping` to `payload`. Undefined when the payload yields no title. */
export function applyMapping(mapping: Mapping, payload: unknown): Mapped | undefined {
  const first = (pick: Pick | undefined, max: number) => pick === undefined ? '' : clean(values(payload, pick).map(item => clean(item, max)).find(Boolean) ?? '', max);
  const all = (picks: Pick[] | undefined) => (picks ?? []).flatMap(pick => values(payload, pick));
  const title = first(mapping.fields.title, intakeLimits.title).replace(/\s+/g, ' ');
  if (!title) return undefined;
  const name = first(mapping.fields.reporterName, intakeLimits.name);
  const email = first(mapping.fields.reporterEmail, intakeLimits.email).toLowerCase();
  const validEmail = /^[^\s@<>]+@[^\s@<>]+$/.test(email) ? email : '';
  return {
    title,
    description: first(mapping.fields.description, intakeLimits.description),
    reporter: name || validEmail ? { name: name || null, email: validEmail || null } : null,
    externalId: first(mapping.fields.externalId, intakeLimits.externalId) || null,
    links: unique(all(mapping.fields.links).map(safeUrl).filter((item): item is string => item !== undefined)),
    attachments: unique(all(mapping.fields.attachments).map(safeUrl).filter((item): item is string => item !== undefined)),
    labels: unique(all(mapping.fields.labels).map(item => clean(item, intakeLimits.label).replace(/\s+/g, ' ')).filter(Boolean)),
  };
}

/** An error in a mapping an administrator wrote, with the path of the offending part. */
export class MappingError extends Error {
  constructor(message: string) { super(message); this.name = 'MappingError'; }
}

function pointer(value: unknown, at: string): string {
  if (typeof value !== 'string' || value.length > intakeLimits.pointer || (value !== '' && !value.startsWith('/')) || /~(?![01])/.test(value)) throw new MappingError(`${at} must be a JSON Pointer such as /data/title`);
  return value;
}

function pick(value: unknown, at: string): Pick {
  if (typeof value === 'string') return pointer(value, at);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MappingError(`${at} must be a JSON Pointer or a pick object`);
  const entry = value as Record<string, unknown>;
  const keys = Object.keys(entry).sort().join(',');
  if (keys === 'value') {
    if (typeof entry.value !== 'string' || entry.value.length > intakeLimits.label) throw new MappingError(`${at}.value must be text of at most ${intakeLimits.label} characters`);
    return { value: entry.value };
  }
  if (keys === 'join' || keys === 'join,separator') {
    if (!Array.isArray(entry.join) || entry.join.length < 1 || entry.join.length > 4) throw new MappingError(`${at}.join must list one to four JSON Pointers`);
    if (entry.separator !== undefined && (typeof entry.separator !== 'string' || entry.separator.length > 10)) throw new MappingError(`${at}.separator must be at most 10 characters`);
    return { join: entry.join.map((item, index) => pointer(item, `${at}.join[${index}]`)), ...(entry.separator !== undefined ? { separator: entry.separator as string } : {}) };
  }
  if (!Object.hasOwn(entry, 'pointer') || Object.keys(entry).some(key => !['pointer', 'each', 'split'].includes(key))) throw new MappingError(`${at} takes pointer with each or split, join with separator, or value`);
  if (entry.split !== undefined && (typeof entry.split !== 'string' || entry.split.length < 1 || entry.split.length > 10)) throw new MappingError(`${at}.split must be one to ten characters`);
  return { pointer: pointer(entry.pointer, `${at}.pointer`), ...(entry.each !== undefined ? { each: pointer(entry.each, `${at}.each`) } : {}), ...(entry.split !== undefined ? { split: entry.split as string } : {}) };
}

/** Checks a mapping an administrator wrote and returns it in canonical form; throws {@link MappingError} otherwise. */
export function validateMapping(raw: unknown): Mapping {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new MappingError('A mapping must be an object with fields and an optional when');
  if (JSON.stringify(raw).length > intakeLimits.json) throw new MappingError(`A mapping must be at most ${intakeLimits.json} characters of JSON`);
  const entry = raw as Record<string, unknown>;
  if (Object.keys(entry).some(key => key !== 'fields' && key !== 'when')) throw new MappingError('A mapping takes only fields and when');
  const fields = entry.fields as Record<string, unknown> | undefined;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new MappingError('mapping.fields must be an object');
  const known = new Set<string>([...singleFields, ...listFields]);
  for (const key of Object.keys(fields)) if (!known.has(key)) throw new MappingError(`mapping.fields.${key} is not a Request field`);
  if (fields.title === undefined) throw new MappingError('mapping.fields.title is required');
  const result: Mapping = { fields: { title: pick(fields.title, 'mapping.fields.title') } };
  for (const key of singleFields) if (key !== 'title' && fields[key] !== undefined) result.fields[key] = pick(fields[key], `mapping.fields.${key}`);
  for (const key of listFields) {
    if (fields[key] === undefined) continue;
    const list = fields[key];
    if (!Array.isArray(list) || list.length > intakeLimits.picks) throw new MappingError(`mapping.fields.${key} must list at most ${intakeLimits.picks} picks`);
    result.fields[key] = list.map((item, index) => pick(item, `mapping.fields.${key}[${index}]`));
  }
  if (entry.when !== undefined) {
    if (!Array.isArray(entry.when) || entry.when.length > intakeLimits.conditions) throw new MappingError(`mapping.when must list at most ${intakeLimits.conditions} conditions`);
    result.when = entry.when.map((item, index) => {
      const condition = item as Record<string, unknown>;
      if (!condition || typeof condition !== 'object' || Object.keys(condition).sort().join(',') !== 'equals,pointer' || !['string', 'number', 'boolean'].includes(typeof condition.equals)) throw new MappingError(`mapping.when[${index}] must be {pointer, equals} with a text, number or true/false value`);
      return { pointer: pointer(condition.pointer, `mapping.when[${index}].pointer`), equals: condition.equals as string | number | boolean };
    });
  }
  return result;
}
