import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = join(root, 'test', 'fixtures', 'ocsf');

/** The OCSF schema version Unfold's audit records declare in `metadata.version`. */
export const ocsfVersion = '1.9.0';
const server = `https://schema.ocsf.io/${ocsfVersion}/api`;

/** The event classes Unfold's audit records use. */
export const classes = ['authentication', 'account_change', 'entity_management', 'user_access', 'group_management', 'web_resources_activity', 'api_activity'];

/** The objects whose attributes the audit records fill; any other object attribute is refused by the schema test. */
export const objects = ['metadata', 'product', 'actor', 'user', 'idp', 'session', 'network_endpoint', 'http_request', 'api', 'request', 'response', 'service', 'managed_entity', 'group', 'web_resource', 'ai_agent', 'delegation', 'iam_role', 'attestation', 'fingerprint', 'prev_event'];

/**
 * The profiles Unfold's audit records declare in `metadata.profiles`: Record Integrity for the hash chain, AI Operation
 * for unfold-mcp, and Host where only that profile gives a class its `actor` (Web Resources Activity).
 */
export const profiles = ['record_integrity', 'ai_operation', 'host'];

function attributes(raw) {
  const list = Array.isArray(raw) ? raw : Object.entries(raw).map(([name, value]) => ({ [name]: value }));
  const result = {};
  for (const entry of list) for (const [name, value] of Object.entries(entry)) {
    result[name] = {
      type: value.type,
      requirement: value.requirement ?? 'optional',
      ...(value.object_type ? { object_type: value.object_type } : {}),
      ...(value.is_array ? { is_array: true } : {}),
      ...(value.enum ? { enum: Object.keys(value.enum).every(key => /^-?\d+$/.test(key)) ? Object.keys(value.enum).map(Number).sort((left, right) => left - right) : Object.keys(value.enum).sort() } : {}),
    };
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left < right ? -1 : 1));
}

async function read(path, query = '?profiles=') {
  const response = await fetch(`${server}/${path}${query}`, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

/**
 * Writes test/fixtures/ocsf/ocsf-1.9.0.json: for each class and object Unfold uses, every attribute with its type,
 * requirement, object type, whether it is an array and its enum ids, plus each class's activities, constraints and the
 * profiles it accepts, and the attributes of the profiles Unfold declares. Classes and objects are read without
 * profiles, so only the base requirements apply; a record gains a profile's attributes only by declaring it.
 */
export async function vendorOcsf() {
  const schema = { version: ocsfVersion, source: server, classes: {}, objects: {}, profiles: {} };
  for (const name of classes) {
    const data = await read(`classes/${name}`);
    const all = attributes(data.attributes);
    schema.classes[name] = { uid: data.uid, category_uid: all.category_uid?.enum?.[0] ?? null, caption: data.caption, ...(data.constraints ? { constraints: data.constraints } : {}), profiles: [...(data.profiles ?? [])].sort(), attributes: all };
    const raw = Array.isArray(data.attributes) ? Object.assign({}, ...data.attributes) : data.attributes;
    schema.classes[name].activities = Object.fromEntries(Object.entries(raw.activity_id.enum).map(([id, value]) => [id, value.caption]).sort(([left], [right]) => Number(left) - Number(right)));
    schema.classes[name].category_uid = Math.floor(data.uid / 1000);
  }
  for (const name of objects) {
    const data = await read(`objects/${name}`);
    schema.objects[name] = { caption: data.caption, ...(data.constraints ? { constraints: data.constraints } : {}), attributes: attributes(data.attributes) };
  }
  const available = await read('profiles', '');
  for (const name of profiles) schema.profiles[name] = { caption: available[name].caption, attributes: attributes(available[name].attributes) };
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, `ocsf-${ocsfVersion}.json`), `${JSON.stringify(schema, null, 1)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) await vendorOcsf();
