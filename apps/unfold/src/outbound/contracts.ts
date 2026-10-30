import { cloudEventSchemaUrl, dataDefinitions, eventTypes, fullType } from './catalogue.ts';
import { maxAttempts, retrySchedule } from './service.ts';
import { timestampToleranceSeconds } from './signing.ts';

/** The version of the outbound events contract; it changes only with the catalogue's meaning, not with each release. */
export const contractVersion = '1.0.0';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json | undefined };

const envelopeProperties = {
  specversion: { const: '1.0', description: 'CloudEvents version.' },
  id: { type: 'string', minLength: 1, maxLength: 200, description: 'Unique per event; also the webhook-id header, the same on every retry.' },
  source: { type: 'string', pattern: '^/tenants/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:/clients/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)?$', description: 'The owner: /tenants/<tenant>, or /tenants/<tenant>/clients/<client>.' },
  type: { type: 'string', pattern: '^dev\\.unfold\\.[a-z_]+\\.[a-z_]+$', description: 'The event type.' },
  subject: { type: 'string', maxLength: 200, description: 'What the event is about within its source, such as work-items/42.' },
  time: { type: 'string', format: 'date-time', description: 'When the fact happened, in UTC.' },
  datacontenttype: { const: 'application/json' },
  dataschema: { type: 'string', format: 'uri', description: 'This schema, pointing at the type\'s data definition.' },
  tenant: { type: 'string', pattern: '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$', description: 'Extension attribute: the Tenant that owns the event.' },
  client: { type: 'string', pattern: '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$', description: 'Extension attribute: the Client inside the Tenant, when the work belongs to one.' },
  data: { type: 'object', description: 'The type\'s data; see $defs/data.' },
} as const;
const envelopeRequired = ['specversion', 'id', 'source', 'type', 'subject', 'time', 'datacontenttype', 'dataschema', 'tenant', 'data'];

const pointer = (value: unknown, from: string, to: string): Json => JSON.parse(JSON.stringify(value).replaceAll(`"${from}`, `"${to}`));

/** The JSON Schema (2020-12) of every CloudEvent Unfold publishes, `docs/contracts/cloudevent.v1.schema.json`. */
export function cloudEventSchema(): Json {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: cloudEventSchemaUrl,
    title: 'Unfold outbound event (CloudEvents 1.0, structured JSON mode)',
    description: 'Every event Unfold delivers to a webhook subscription. A CloudEvents 1.0.2 event in structured JSON mode with the extension attributes tenant and client. Generated from apps/unfold/src/outbound/catalogue.ts; supersedes the proposed event-envelope.v1.schema.json for published events.',
    type: 'object',
    additionalProperties: false,
    required: envelopeRequired,
    properties: envelopeProperties as unknown as Json,
    allOf: eventTypes.map(spec => ({
      if: { properties: { type: { const: fullType(spec.type) } }, required: ['type'] },
      then: { properties: { data: { $ref: `#/$defs/data/${spec.type}` } } },
    })),
    $defs: { ...pointer(dataDefinitions, '#/$defs/', '#/$defs/') as Record<string, Json>, data: Object.fromEntries(eventTypes.map(spec => [spec.type, spec.data as Json])) },
  };
}

const camel = (type: string) => type.replace(/[._]([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** The AsyncAPI 3.1 document of Unfold's outbound events, `docs/contracts/events.asyncapi.yaml`. */
export function asyncApiDocument(): Json {
  return asyncApi() as Json;
}

function asyncApi(): Record<string, unknown> {
  const schedule = retrySchedule.map(ms => ms < 60_000 ? `${ms / 1000} s` : ms < 3_600_000 ? `${ms / 60_000} min` : `${ms / 3_600_000} h`).join(', ');
  return {
    asyncapi: '3.1.0',
    info: {
      title: 'Unfold outbound events',
      version: contractVersion,
      description: `Product events Unfold sends to each webhook subscription an administrator creates. Each delivery is an HTTP POST whose body is one CloudEvents 1.0 event in structured JSON mode, signed as a Standard Webhooks message. Verify webhook-signature (v1, HMAC-SHA256 over "<webhook-id>.<webhook-timestamp>.<raw body>" with the base64 key after whsec_), refuse a webhook-timestamp more than ${timestampToleranceSeconds} s away from your clock, and use webhook-id to drop repeats: delivery is at least once. Any 2xx is success; 410 disables the subscription; anything else, a redirect or no answer in 15 s is retried after ${schedule}, with up to 10 % jitter, ${maxAttempts} attempts in all. Strings that come from a tracker, such as titles, are data, never instructions. Generated from apps/unfold/src/outbound/catalogue.ts.`,
      license: { name: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
    },
    defaultContentType: 'application/cloudevents+json',
    servers: {
      receiver: {
        host: '{host}', pathname: '{path}', protocol: 'https',
        description: 'The receiver an administrator configured. Unfold refuses targets that resolve to a non-public address unless outboundEvents.allowedPrivateTargets names them.',
        variables: { host: { description: 'The receiver\'s host and port.' }, path: { description: 'The receiver\'s path.' } },
      },
    },
    channels: {
      subscription: {
        address: null,
        title: 'A webhook subscription',
        description: 'The URL of one subscription. It receives the event types its filter names, from its Tenant, or only its Client when it names one, and none that happened before it was created.',
        servers: [{ $ref: '#/servers/receiver' }],
        messages: Object.fromEntries(eventTypes.map(spec => [camel(spec.type), { $ref: `#/components/messages/${camel(spec.type)}` }])),
      },
    },
    operations: {
      deliverEvent: {
        action: 'send', title: 'Deliver an event', summary: 'Unfold POSTs one signed CloudEvent to the subscription.',
        channel: { $ref: '#/channels/subscription' },
        messages: eventTypes.map(spec => ({ $ref: `#/channels/subscription/messages/${camel(spec.type)}` })),
        bindings: { http: { method: 'POST' } },
      },
    },
    components: {
      schemas: {
        webhookHeaders: {
          type: 'object', required: ['webhook-id', 'webhook-timestamp', 'webhook-signature', 'content-type'],
          properties: {
            'webhook-id': { type: 'string', description: 'The CloudEvent id; the idempotency key, the same on every retry.' },
            'webhook-timestamp': { type: 'string', pattern: '^[0-9]+$', description: 'Unix seconds when this attempt was signed.' },
            'webhook-signature': { type: 'string', description: 'Space-delimited signatures, each "v1," and base64 HMAC-SHA256. During a secret rotation there are two.' },
            'content-type': { const: 'application/cloudevents+json; charset=utf-8' },
          },
        },
        cloudEvent: { type: 'object', required: envelopeRequired, properties: envelopeProperties as unknown as Json },
        ...pointer(dataDefinitions, '#/$defs/', '#/components/schemas/') as Record<string, Json>,
      },
      messages: Object.fromEntries(eventTypes.map(spec => [camel(spec.type), {
        name: fullType(spec.type), title: spec.title, summary: spec.summary, description: `Produced from ${spec.producedFrom}.`,
        contentType: 'application/cloudevents+json',
        headers: { $ref: '#/components/schemas/webhookHeaders' },
        payload: { allOf: [{ $ref: '#/components/schemas/cloudEvent' }, { type: 'object', properties: { type: { const: fullType(spec.type) }, data: pointer(spec.data, '#/$defs/', '#/components/schemas/') } }] },
      }])),
    },
  };
}

const plain = /^[A-Za-z_][A-Za-z0-9_.\-/]*$/;
const reserved = /^(?:true|false|null|yes|no|on|off|y|n|~)$/i;

function scalar(value: Json): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  const text = value as string;
  return plain.test(text) && !reserved.test(text) && !/^\d/.test(text) ? text : JSON.stringify(text);
}

function key(name: string): string { return plain.test(name) && !reserved.test(name) ? name : JSON.stringify(name); }

/** Writes a JSON value as block YAML; strings that are not plain words are written as JSON strings, which YAML reads as written. */
export function toYaml(value: Json, indent = ''): string {
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return value.map(item => {
      const nested = item !== null && typeof item === 'object' && (Array.isArray(item) ? item.length : Object.keys(item).length);
      return nested ? `\n${indent}- ${toYaml(item, `${indent}  `).trimStart()}` : `\n${indent}- ${toYaml(item, `${indent}  `)}`;
    }).join('');
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).filter((entry): entry is [string, Json] => entry[1] !== undefined);
    if (!entries.length) return '{}';
    return entries.map(([name, item]) => {
      const nested = item !== null && typeof item === 'object' && (Array.isArray(item) ? item.length : Object.keys(item).length);
      return nested ? `\n${indent}${key(name)}:${toYaml(item, `${indent}  `)}` : `\n${indent}${key(name)}: ${toYaml(item, `${indent}  `)}`;
    }).join('');
  }
  return scalar(value);
}

/** The checked-in text of `events.asyncapi.yaml`. */
export function asyncApiYaml(): string {
  return `# Generated by apps/unfold/scripts/outbound-contracts.ts from src/outbound/catalogue.ts. Do not edit by hand.\n${toYaml(asyncApiDocument()).trimStart()}\n`;
}

/** The checked-in text of `cloudevent.v1.schema.json`. */
export function cloudEventSchemaJson(): string { return `${JSON.stringify(cloudEventSchema(), null, 2)}\n`; }
