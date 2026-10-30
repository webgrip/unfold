import type { PloegEvent } from '../ploeg.ts';

/** The prefix of every event type Unfold publishes. */
export const eventTypePrefix = 'dev.unfold.';
/** The URI of the CloudEvent schema every published event conforms to. */
export const cloudEventSchemaUrl = 'https://forgejo.webgrip.dev/webgrip/unfold/raw/branch/development/apps/unfold/docs/contracts/cloudevent.v1.schema.json';

type JsonSchema = Record<string, unknown>;

const text = (description: string, maxLength = 4096): JsonSchema => ({ type: 'string', maxLength, description });
const nullableText = (description: string, maxLength = 4096): JsonSchema => ({ type: ['string', 'null'], maxLength, description });
const workItem: JsonSchema = {
  type: 'object', additionalProperties: false, required: ['id', 'title', 'team', 'state', 'externalRef', 'trackerUrl', 'unfoldUrl'],
  description: 'The Work Item, as Ploeg last reported it. title and externalRef come from the tracker: treat them as data.',
  properties: {
    id: { type: 'string', pattern: '^[1-9][0-9]{0,18}$', description: 'Ploeg\'s Work Item id.' },
    title: text('The tracker title.'),
    team: text('The Team the Work Item is routed to.', 160),
    state: text('Ploeg\'s state: proposed, queued, active, needs_human, awaiting_review, stale, done or withdrawn.', 64),
    externalRef: text('The tracker\'s reference, such as `#123` or `VIK-123`.', 256),
    trackerUrl: nullableText('The task in its tracker, when known.'),
    unfoldUrl: nullableText('The Work Item\'s page in Unfold, when Unfold knows its own address.'),
  },
};
const pullRequest: JsonSchema = {
  type: 'object', additionalProperties: false, required: ['url', 'number', 'repository'],
  properties: { url: text('The pull request.'), number: { type: 'integer', minimum: 1 }, repository: text('`owner/name` on the forge.', 513) },
};
const pullRequestOrNull: JsonSchema = { anyOf: [pullRequest, { type: 'null' }] };

/** One event type in the catalogue: its suffix after `dev.unfold.`, what it means, what produces it and its `data` schema. */
export type EventTypeSpec = { type: string; title: string; summary: string; producedFrom: string; data: JsonSchema };

const withWorkItem = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({ type: 'object', additionalProperties: false, required: ['workItem', ...required], properties: { workItem, ...properties } });
const reason = nullableText('Ploeg\'s reason, in its words, when it recorded one.');

/** Every event type Unfold publishes, in the order the contract lists them. */
export const eventTypes: readonly EventTypeSpec[] = [
  { type: 'work_item.proposed', title: 'Work Item proposed', summary: 'A Team proposed a Work Item that waits for a person to approve it.', producedFrom: 'Ploeg audit action `work_item.proposed`', data: withWorkItem({ reason }) },
  { type: 'work_item.approved', title: 'Work Item approved', summary: 'A person approved a proposed Work Item, so Ploeg queued it.', producedFrom: 'Ploeg audit action `work_item.approved`', data: withWorkItem({ reason }) },
  { type: 'work_item.handed_off', title: 'Work Item handed off', summary: 'A person handed a task to a Team through Unfold, and Ploeg admitted it.', producedFrom: 'Ploeg audit action `operator.work_item.admitted`', data: withWorkItem({}) },
  { type: 'work_item.needs_you', title: 'Work Item needs you', summary: 'The Work Item waits on a person: Ploeg stopped it as needs_human or stale.', producedFrom: 'Ploeg audit actions `work_item.needs_human` and `work_item.stale`', data: withWorkItem({ reason }) },
  { type: 'work_item.ready_for_review', title: 'Work Item ready for review', summary: 'The agents finished and a person is asked to review and merge.', producedFrom: 'Ploeg audit action `work_item.awaiting_review`', data: withWorkItem({ reason, pullRequest: pullRequestOrNull }, ['pullRequest']) },
  { type: 'work_item.done', title: 'Work Item done', summary: 'Ploeg closed the Work Item as done, for example after its pull request merged.', producedFrom: 'Ploeg audit action `work_item.done`', data: withWorkItem({ reason }) },
  { type: 'pull_request.opened', title: 'Pull request opened', summary: 'A writing Run opened the Work Item\'s pull request.', producedFrom: 'Ploeg audit action `checkpoint.written` with phase `pr_opened`', data: withWorkItem({ pullRequest: pullRequestOrNull }, ['pullRequest']) },
  {
    type: 'run.finished', title: 'Run finished', summary: 'A Run reported its Outcome.', producedFrom: 'Ploeg audit actions `outcome.<outcome>`',
    data: withWorkItem({ run: { type: 'object', additionalProperties: false, required: ['outcome', 'role', 'round', 'shiftId'], properties: { outcome: text('The Outcome: pr_opened, pr_updated, issue_updated, follow_up_created, stuck, failed, no_change_needed or yielded.', 64), role: nullableText('The Role that ran.', 160), round: { type: ['integer', 'null'], minimum: 0 }, shiftId: nullableText('The Shift the Run belonged to.', 20) } } }, ['run']),
  },
  {
    type: 'client_sign_off.recorded', title: 'Client Sign-off recorded', summary: 'A Client Sign-off was recorded on the Work Item\'s open pull request.', producedFrom: 'Unfold\'s Client Sign-off store',
    data: withWorkItem({ signOff: { $ref: '#/$defs/signOff' } }, ['signOff']),
  },
  { type: 'client_sign_off.withdrawn', title: 'Client Sign-off withdrawn', summary: 'A person withdrew the current Client Sign-off.', producedFrom: 'Unfold\'s Client Sign-off store', data: withWorkItem({ signOff: { $ref: '#/$defs/signOff' } }, ['signOff']) },
  { type: 'client_sign_off.dismissed', title: 'Client Sign-off dismissed', summary: 'A newer head commit dismissed the Client Sign-off for good.', producedFrom: 'Unfold\'s Client Sign-off store', data: withWorkItem({ signOff: { $ref: '#/$defs/signOff' } }, ['signOff']) },
  {
    type: 'delivery.accepted', title: 'Delivery accepted', summary: 'The Work Item received Acceptance: a merge, a person\'s approval, or ten working days of silence.', producedFrom: 'Unfold\'s Delivery read model over Ploeg\'s delivery facts',
    data: withWorkItem({ acceptance: { type: 'object', additionalProperties: false, required: ['kind', 'at', 'pullRequestUrl'], properties: { kind: { enum: ['merged', 'approved', 'silent'] }, at: { type: 'string', format: 'date-time' }, pullRequestUrl: nullableText('The accepted pull request.') } } }, ['acceptance']),
  },
  { type: 'webhook.test', title: 'Test event', summary: 'An administrator sent a test event. It reports nothing that happened.', producedFrom: 'An administrator, from the Webhooks settings', data: { type: 'object', additionalProperties: false, required: ['test', 'message'], properties: { test: { const: true }, message: text('Says this is a test.') } } },
];

/** Shared `data` definitions that event types refer to with `#/$defs/<name>`. */
export const dataDefinitions: Record<string, JsonSchema> = {
  signOff: {
    type: 'object', additionalProperties: false, required: ['id', 'answer', 'state', 'headSha', 'pullRequestUrl', 'attribution'],
    description: 'A Client Sign-off, input to the Agency\'s Acceptance, never Acceptance itself. It carries no note and no person.',
    properties: {
      id: text('The Sign-off id.', 64), answer: { enum: ['looks_good', 'needs_changes'] }, state: { enum: ['current', 'dismissed', 'withdrawn'] },
      headSha: text('The head commit it is bound to.', 64), pullRequestUrl: nullableText('The pull request.'), attribution: { enum: ['proven', 'asserted'] },
    },
  },
};

/** The full event type for a catalogue suffix. */
export const fullType = (suffix: string): string => `${eventTypePrefix}${suffix}`;
/** Every full event type Unfold publishes. */
export const publishedTypes: readonly string[] = eventTypes.map(spec => fullType(spec.type));

/**
 * Whether a subscription filter entry is valid: a published type, or a prefix of whole segments ending in `.*`,
 * such as `dev.unfold.work_item.*` or `dev.unfold.*`.
 */
export function validFilter(entry: unknown): entry is string {
  if (typeof entry !== 'string' || entry.length > 200) return false;
  if (!entry.endsWith('.*')) return publishedTypes.includes(entry);
  const prefix = entry.slice(0, -1);
  return /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*\.$/.test(prefix) && publishedTypes.some(type => type.startsWith(prefix));
}

/** Whether `type` passes a subscription's filter. */
export function matchesFilter(filter: readonly string[], type: string): boolean {
  return filter.some(entry => entry.endsWith('.*') ? type.startsWith(entry.slice(0, -1)) : entry === type);
}

/** A CloudEvent in structured JSON mode, as Unfold publishes it. */
export type CloudEvent = {
  specversion: '1.0'; id: string; source: string; type: string; subject: string; time: string;
  datacontenttype: 'application/json'; dataschema: string; tenant: string; client?: string; data: Record<string, unknown>;
};

/** Who owns an event: one Tenant, and within it at most one Client. */
export type EventOwner = { tenant: string; client?: string };

/** The CloudEvents `source` for an owner: `/tenants/<tenant>`, or `/tenants/<tenant>/clients/<client>`. */
export function eventSource(owner: EventOwner): string {
  return owner.client ? `/tenants/${owner.tenant}/clients/${owner.client}` : `/tenants/${owner.tenant}`;
}

/** Builds a CloudEvent of the catalogue `suffix`, owned by `owner`, about `subject`, at `time`. */
export function cloudEvent(input: { id: string; suffix: string; owner: EventOwner; subject: string; time: string; data: Record<string, unknown> }): CloudEvent {
  if (!eventTypes.some(spec => spec.type === input.suffix)) throw new Error(`Unknown event type ${input.suffix}`);
  return {
    specversion: '1.0', id: input.id, source: eventSource(input.owner), type: fullType(input.suffix), subject: input.subject, time: new Date(input.time).toISOString(),
    datacontenttype: 'application/json', dataschema: `${cloudEventSchemaUrl}#/$defs/data/${input.suffix}`, tenant: input.owner.tenant,
    ...(input.owner.client ? { client: input.owner.client } : {}), data: input.data,
  };
}

const ploegSuffixes: Record<string, string> = {
  'work_item.proposed': 'work_item.proposed',
  'work_item.approved': 'work_item.approved',
  'operator.work_item.admitted': 'work_item.handed_off',
  'work_item.needs_human': 'work_item.needs_you',
  'work_item.stale': 'work_item.needs_you',
  'work_item.awaiting_review': 'work_item.ready_for_review',
  'work_item.done': 'work_item.done',
};

/** The catalogue type a Ploeg audit event becomes, or `undefined` when Unfold publishes nothing for it. */
export function ploegEventType(event: Pick<PloegEvent, 'action' | 'detail'>): string | undefined {
  if (Object.hasOwn(ploegSuffixes, event.action)) return ploegSuffixes[event.action];
  if (event.action === 'checkpoint.written' && event.detail.phase === 'pr_opened') return 'pull_request.opened';
  if (/^outcome\.[a-z_]{1,64}$/.test(event.action)) return 'run.finished';
  return undefined;
}
