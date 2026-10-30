import { readFileSync } from 'node:fs';

type Attribute = { type: string; requirement: string; object_type?: string; is_array?: boolean; enum?: number[] };
type Definition = { uid?: number; category_uid?: number; activities?: Record<string, string>; profiles?: string[]; constraints?: { at_least_one?: string[]; just_one?: string[] }; attributes: Record<string, Attribute> };
type Schema = { version: string; classes: Record<string, Definition>; objects: Record<string, Definition>; profiles: Record<string, { attributes: Record<string, Attribute> }> };

/** The vendored OCSF 1.9.0 extract `scripts/vendor-ocsf.mjs` writes. */
export const ocsfSchema: Schema = JSON.parse(readFileSync(new URL('./fixtures/ocsf/ocsf-1.9.0.json', import.meta.url), 'utf8'));

const integers = new Set(['integer_t', 'long_t', 'timestamp_t', 'port_t']);

function checkValue(where: string, value: unknown, attribute: Attribute, errors: string[]): void {
  if (attribute.type === 'json_t') return;
  if (attribute.type === 'object_t') {
    const definition = attribute.object_type ? ocsfSchema.objects[attribute.object_type] : undefined;
    if (attribute.object_type === 'object') { if (!value || typeof value !== 'object' || Array.isArray(value)) errors.push(`${where} must be an object`); return; }
    if (!definition) { errors.push(`${where} uses object ${attribute.object_type}, which is not vendored`); return; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(`${where} must be a ${attribute.object_type} object`); return; }
    checkObject(where, value as Record<string, unknown>, definition, errors);
    return;
  }
  if (integers.has(attribute.type)) { if (!Number.isInteger(value)) errors.push(`${where} must be an integer (${attribute.type})`); }
  else if (attribute.type === 'float_t') { if (typeof value !== 'number') errors.push(`${where} must be a number`); }
  else if (attribute.type === 'boolean_t') { if (typeof value !== 'boolean') errors.push(`${where} must be a boolean`); }
  else if (typeof value !== 'string') errors.push(`${where} must be a string (${attribute.type})`);
  if (attribute.enum && !attribute.enum.includes(value as number)) errors.push(`${where} ${String(value)} is not in its enum`);
}

function checkObject(where: string, value: Record<string, unknown>, definition: Definition, errors: string[]): void {
  for (const [name, attribute] of Object.entries(definition.attributes)) if (attribute.requirement === 'required' && value[name] === undefined) errors.push(`${where}.${name} is required`);
  const present = (names: string[]) => names.filter(name => value[name] !== undefined).length;
  if (definition.constraints?.at_least_one && !present(definition.constraints.at_least_one)) errors.push(`${where} needs at least one of ${definition.constraints.at_least_one.join(', ')}`);
  if (definition.constraints?.just_one && present(definition.constraints.just_one) !== 1) errors.push(`${where} needs exactly one of ${definition.constraints.just_one.join(', ')}`);
  for (const [name, item] of Object.entries(value)) {
    const attribute = definition.attributes[name];
    if (!attribute) { errors.push(`${where}.${name} is not an OCSF ${ocsfSchema.version} attribute here`); continue; }
    if (attribute.is_array) {
      if (!Array.isArray(item)) { errors.push(`${where}.${name} must be an array`); continue; }
      item.forEach((entry, index) => checkValue(`${where}.${name}[${index}]`, entry, attribute, errors));
    } else checkValue(`${where}.${name}`, item, attribute, errors);
  }
}

/** Every way `event` breaks the vendored OCSF 1.9.0 extract: its class, type id, activity, declared profiles, requirements, attribute types, enums and constraints. */
export function ocsfErrors(event: Record<string, any>): string[] {
  const errors: string[] = [];
  const definition = Object.values(ocsfSchema.classes).find(entry => entry.uid === event.class_uid);
  if (!definition) return [`class_uid ${event.class_uid} is not a vendored class`];
  if (event.category_uid !== definition.category_uid) errors.push(`category_uid ${event.category_uid} is not ${definition.category_uid}`);
  if (!Object.hasOwn(definition.activities ?? {}, String(event.activity_id))) errors.push(`activity_id ${event.activity_id} is not an activity of class ${event.class_uid}`);
  else if (event.activity_id !== 99 && event.activity_name !== definition.activities![String(event.activity_id)]) errors.push(`activity_name ${event.activity_name} does not match activity ${event.activity_id}`);
  if (event.type_uid !== event.class_uid * 100 + event.activity_id) errors.push(`type_uid ${event.type_uid} is not class_uid * 100 + activity_id`);
  if (event.metadata?.version !== ocsfSchema.version) errors.push(`metadata.version ${event.metadata?.version} is not ${ocsfSchema.version}`);
  const declared: string[] = Array.isArray(event.metadata?.profiles) ? event.metadata.profiles : [];
  const attributes = { ...definition.attributes };
  for (const profile of declared) {
    if (!definition.profiles?.includes(profile)) errors.push(`class ${event.class_uid} does not take the ${profile} profile`);
    else if (!ocsfSchema.profiles[profile]) errors.push(`profile ${profile} is not vendored`);
    else Object.assign(attributes, ocsfSchema.profiles[profile].attributes);
  }
  checkObject('event', event, { ...definition, attributes }, errors);
  return errors;
}
