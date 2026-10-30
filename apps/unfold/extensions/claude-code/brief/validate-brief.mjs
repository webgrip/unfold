import { readFileSync } from 'node:fs';

/** The Delivery Brief schema this validator walks, read from brief.schema.json beside it. */
export const briefSchema = JSON.parse(readFileSync(new URL('./brief.schema.json', import.meta.url), 'utf8'));

const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i;

const typeChecks = {
  object: value => value !== null && typeof value === 'object' && !Array.isArray(value),
  array: value => Array.isArray(value),
  string: value => typeof value === 'string',
  integer: value => Number.isInteger(value),
  number: value => typeof value === 'number' && Number.isFinite(value),
  boolean: value => typeof value === 'boolean',
};

/** True when the text parses as an absolute http: or https: URL. */
export function isWebUrl(text) {
  if (typeof text !== 'string') return false;
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isDateTime(text) {
  return dateTimePattern.test(text) && !Number.isNaN(Date.parse(text));
}

function describe(value) {
  return JSON.stringify(value)?.slice(0, 60) ?? String(value);
}

function at(path) {
  return path || 'the record';
}

function checkString(value, schema, path, errors) {
  const length = [...value].length;
  if (schema.minLength !== undefined && length < schema.minLength) errors.push(`${at(path)}: must be at least ${schema.minLength} character${schema.minLength === 1 ? '' : 's'} long`);
  if (schema.maxLength !== undefined && length > schema.maxLength) errors.push(`${at(path)}: must be at most ${schema.maxLength} characters long, is ${length}`);
  if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${at(path)}: ${describe(value)} does not match ${schema.pattern}`);
  if (schema.format === 'uri' && !isWebUrl(value)) errors.push(`${at(path)}: ${describe(value)} is not an http(s) URL`);
  if (schema.format === 'date-time' && !isDateTime(value)) errors.push(`${at(path)}: ${describe(value)} is not an RFC 3339 date-time`);
}

function checkObject(value, schema, path, errors) {
  const properties = schema.properties ?? {};
  for (const name of schema.required ?? []) {
    if (!Object.hasOwn(value, name)) errors.push(`${at(path)}: ${name} is required`);
  }
  for (const [name, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${name}` : name;
    if (Object.hasOwn(properties, name)) walk(child, properties[name], childPath, errors);
    else if (schema.additionalProperties === false) errors.push(`${childPath}: is not a field of ${briefSchema.properties.schema.const}`);
  }
}

function checkArray(value, schema, path, errors) {
  if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at(path)}: needs at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}`);
  if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at(path)}: holds at most ${schema.maxItems} items, has ${value.length}`);
  if (schema.items) value.forEach((item, index) => walk(item, schema.items, `${path}[${index}]`, errors));
}

function walk(value, schema, path, errors) {
  if (Object.hasOwn(schema, 'const') && value !== schema.const) {
    errors.push(`${at(path)}: must be ${describe(schema.const)}, is ${describe(value)}`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${at(path)}: must be one of ${schema.enum.join(', ')}, is ${describe(value)}`);
    return;
  }
  if (schema.type) {
    const check = typeChecks[schema.type];
    if (!check) throw new Error(`brief.schema.json uses type ${schema.type}, which validate-brief.mjs does not know`);
    if (!check(value)) {
      errors.push(`${at(path)}: must be ${schema.type === 'array' || schema.type === 'object' || schema.type === 'integer' ? 'an' : 'a'} ${schema.type}`);
      return;
    }
  }
  if (typeof value === 'string') checkString(value, schema, path, errors);
  else if (Array.isArray(value)) checkArray(value, schema, path, errors);
  else if (typeChecks.object(value)) checkObject(value, schema, path, errors);
}

function checkEvidenceReferences(record, errors) {
  const evidence = Array.isArray(record.evidence) ? record.evidence : [];
  const seen = new Set();
  evidence.forEach((item, index) => {
    const id = item?.id;
    if (typeof id !== 'string') return;
    if (seen.has(id)) errors.push(`evidence[${index}].id: ${describe(id)} is used by an earlier evidence item`);
    seen.add(id);
  });
  if (!Array.isArray(record.rollout)) return;
  record.rollout.forEach((step, stepIndex) => {
    if (!Array.isArray(step?.evidence)) return;
    step.evidence.forEach((ref, refIndex) => {
      if (typeof ref === 'string' && !seen.has(ref)) errors.push(`rollout[${stepIndex}].evidence[${refIndex}]: ${describe(ref)} names no evidence item`);
    });
  });
}

/** Validate a Delivery Brief record against brief.schema.json and its cross-references; returns readable errors, empty when valid. */
export function validateBrief(record) {
  const errors = [];
  walk(record, briefSchema, '', errors);
  if (typeChecks.object(record)) checkEvidenceReferences(record, errors);
  return errors;
}
