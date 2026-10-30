import { createHash } from 'node:crypto';
import { createWriteStream, mkdirSync } from 'node:fs';
import { once } from 'node:events';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig, Repository, Session } from './types.ts';
import type { TaskSourceConfig } from './tasks.ts';
import type { DeliveryRow } from './delivery-ledger.ts';
import { publicSession } from './store.ts';
import { defaultMemberships, defaultTenant, ownership, repositoryKey, storedMemberships } from './tenancy.ts';
import { withoutKnownSecrets } from './redaction.ts';
import { TarGzipWriter } from './tar-writer.ts';

/** The bundle format name written into every manifest. */
export const tenantExportFormat = 'unfold-tenant-export';
/** The version of the bundle layout and manifest. Each entity carries its own schema version as well. */
export const tenantExportFormatVersion = 1;
/** The file in the bundle that says how to export what Ploeg holds. */
export const ploegPointerFile = 'ploeg-data.md';

/** Which rows of an entity belong to the exported Tenant. */
export type Scoping =
  | { by: 'installation' }
  | { by: 'tenant'; column: string }
  | { by: 'person'; column: string }
  | { by: 'work-item'; column: string }
  | { by: 'repository'; column: string }
  | { by: 'parent'; parent: string; column: string };

/**
 * One entity read straight from one table: its columns as camelCase fields, JSON columns parsed, BLOB columns as base64.
 * Each `credentialUrls` column is written as its origin, with `<field>Redacted: true` and `<field>Fingerprint`, the
 * SHA-256 in hex of the full stored URL.
 */
export type TableEntity = { entity: string; table: string; scope: Scoping; json?: string[]; drop?: string[]; credentialUrls?: string[]; collect?: string; description: string };

/** A table Unfold keeps that the bundle leaves out, and why. */
export type ExcludedTable = { table: string; reason: string };

/** The tables the bundle reads through a curated entity rather than {@link tableEntities}. */
export const curatedSources: Readonly<Record<string, readonly string[]>> = {
  users: ['users', 'user_memberships'],
  sessions: ['sessions'],
};

const person = (column: string): Scoping => ({ by: 'person', column });
const workItem = (column: string): Scoping => ({ by: 'work-item', column });
const installation: Scoping = { by: 'installation' };
const byTenant = (column: string): Scoping => ({ by: 'tenant', column });

/** Every table exported as it is stored, in the order the bundle writes them. A parent precedes its children. */
export const tableEntities: readonly TableEntity[] = [
  { entity: 'session-events', table: 'events', scope: { by: 'parent', parent: 'sessions', column: 'session_id' }, json: ['data'], description: 'The durable event log of each workbench session: status changes, agent messages and tool calls, the session transcript.' },
  { entity: 'session-permissions', table: 'permissions', scope: { by: 'parent', parent: 'sessions', column: 'session_id' }, json: ['body'], description: 'Permission requests a workbench session raised and how they were answered.' },
  { entity: 'linked-sessions', table: 'linked_sessions', scope: person('owner_id'), json: ['body'], collect: 'id', description: 'Agent sessions people ran in their own editor and linked to Unfold.' },
  { entity: 'linked-session-work-items', table: 'linked_session_work_items', scope: { by: 'parent', parent: 'linked-sessions', column: 'session_id' }, description: 'Which Work Items each Linked Session worked on.' },
  { entity: 'agent-traces', table: 'agent_traces', scope: { by: 'parent', parent: 'linked-sessions', column: 'session_id' }, json: ['body'], description: 'Agent Trace records (which lines an agent wrote) reported by Linked Sessions.' },
  { entity: 'linked-session-messages', table: 'linked_session_messages', scope: { by: 'parent', parent: 'linked-sessions', column: 'session_id' }, json: ['body'], description: 'Messages and notices sent to a Linked Session.' },
  { entity: 'linked-session-permissions', table: 'linked_session_permissions', scope: { by: 'parent', parent: 'linked-sessions', column: 'session_id' }, json: ['body'], description: 'Permission prompts a Linked Session forwarded and their answers.' },
  { entity: 'linked-session-remote-approval', table: 'linked_session_remote_approval', scope: person('owner_id'), description: 'Whether a person allowed approving a Linked Session from Unfold.' },
  { entity: 'client-sign-offs', table: 'client_sign_offs', scope: workItem('work_item_id'), json: ['body'], description: 'Client Sign-offs recorded on Work Items, with their state and history.' },
  { entity: 'client-sign-off-exclusions', table: 'client_sign_off_exclusions', scope: { by: 'repository', column: 'repository' }, json: ['body'], description: 'The paths a Client Sign-off leaves out, per Client and repository.' },
  { entity: 'asks', table: 'asks', scope: person('asker_id'), json: ['body'], description: 'Questions people asked about a Work Item and the answers.' },
  { entity: 'chats', table: 'chats', scope: person('owner_id'), json: ['body'], collect: 'id', description: 'Chats with Unfold.' },
  { entity: 'chat-turns', table: 'chat_turns', scope: { by: 'parent', parent: 'chats', column: 'chat_id' }, json: ['body'], description: 'The turns of each chat.' },
  { entity: 'reports', table: 'reports', scope: person('user_id'), collect: 'id', description: 'Problems people reported, with their filing state.' },
  { entity: 'report-files', table: 'report_files', scope: { by: 'parent', parent: 'reports', column: 'report_id' }, description: 'Files attached to a reported problem, as base64.' },
  { entity: 'report-follow', table: 'report_follow', scope: { by: 'parent', parent: 'reports', column: 'report_id' }, description: 'The last known state of each filed report.' },
  { entity: 'action-records', table: 'action_records', scope: person('user_id'), json: ['inputs'], description: 'Every state-changing call a person made through Unfold, with its channel and outcome (system ADR-0037). Inputs are stored with secrets already redacted.' },
  { entity: 'product-events', table: 'product_event', scope: { by: 'tenant', column: 'tenant_id' }, json: ['props'], description: 'Product events as stored: the actor is a pseudonym that cannot be reversed without the Tenant actor key, which is not exported.' },
  { entity: 'product-event-daily', table: 'product_event_daily', scope: { by: 'tenant', column: 'tenant_id' }, description: 'Daily product event counts.' },
  { entity: 'flag-overrides', table: 'flag_overrides', scope: installation, description: 'Feature flag variants an administrator forced.' },
  { entity: 'flag-rollouts', table: 'flag_rollouts', scope: installation, json: ['spec'], description: 'Authored feature flag rollouts.' },
  { entity: 'flag-segments', table: 'flag_segments', scope: installation, json: ['spec'], description: 'Named audiences rollouts target.' },
  { entity: 'flag-audit', table: 'flag_audit', scope: installation, description: 'Every change to a flag override, rollout or segment.' },
  { entity: 'flag-choices', table: 'flag_choices', scope: person('user_id'), description: 'Labs choices each person made.' },
  { entity: 'now-snoozes', table: 'now_snoozes', scope: person('user_id'), description: 'Rows each person snoozed on Now.' },
  { entity: 'agent-host-views', table: 'agent_host_views', scope: person('user_id'), description: 'What each person has seen of an editor agent host session.' },
  { entity: 'status-notes', table: 'status_notes', scope: installation, description: 'Notes administrators posted on the Status page.' },
  { entity: 'card-themes', table: 'card_themes', scope: installation, json: ['body'], description: 'Run card themes (card-theme.v1).' },
  { entity: 'card-theme-versions', table: 'card_theme_versions', scope: installation, json: ['body'], description: 'Every saved version of each card theme.' },
  { entity: 'card-assets', table: 'card_assets', scope: installation, description: 'Images uploaded for card themes, as base64.' },
  { entity: 'card-identities', table: 'card_identities', scope: person('user_id'), json: ['logins'], description: 'The forge logins each person collects Run cards for.' },
  { entity: 'card-binders', table: 'card_binders', scope: person('user_id'), description: 'When each person started their card binder.' },
  { entity: 'card-seen', table: 'card_seen', scope: person('user_id'), json: ['snapshot'], description: 'The cards each person has seen.' },
  { entity: 'card-packs', table: 'card_packs', scope: person('user_id'), json: ['body'], description: 'Card packs each person opened.' },
  { entity: 'card-pulls', table: 'card_pulls', scope: person('user_id'), description: 'The card each person pulled for a Work Item.' },
  { entity: 'card-worlds', table: 'card_worlds', scope: person('user_id'), json: ['body'], description: 'The private inner world a card holder decorated.' },
  { entity: 'card-work-items', table: 'card_work_items', scope: workItem('work_item_id'), description: 'The Work Items Run cards were made from.' },
  { entity: 'card-epic-links', table: 'card_epic_links', scope: workItem('work_item_id'), description: 'Epics each carded Work Item belonged to.' },
  { entity: 'card-file-touches', table: 'card_file_touches', scope: workItem('work_item_id'), description: 'Files each merged pull request touched.' },
  { entity: 'card-cracks', table: 'card_cracks', scope: workItem('card_work_item_id'), description: 'Bugs linked back to the Work Item that caused them.' },
  { entity: 'card-crack-audit', table: 'card_crack_audit', scope: workItem('card_work_item_id'), json: ['detail'], description: 'Every change to a crack.' },
  { entity: 'card-rarity', table: 'card_rarity', scope: workItem('work_item_id'), json: ['inputs'], description: 'The rarity each Run card was given and its inputs.' },
  { entity: 'card-play-shapes', table: 'card_play_shapes', scope: workItem('work_item_id'), description: 'The play shape of each pull request.' },
  { entity: 'card-comments', table: 'card_comments', scope: workItem('work_item_id'), description: 'The Run card comment Unfold keeps on each pull request.' },
  { entity: 'run-judgements', table: 'run_judgements', scope: workItem('work_item_id'), json: ['body'], description: 'Run health judgements Unfold made while a Run ran.' },
  { entity: 'tripwire-hits', table: 'tripwire_hits', scope: workItem('work_item_id'), description: 'Tool calls and messages the decider flagged, with the verdicts people gave.' },
  { entity: 'tripwire-runs', table: 'tripwire_runs', scope: workItem('work_item_id'), json: ['transcript', 'seen'], description: 'How far the decider read each Run.' },
  { entity: 'decider-kinds', table: 'decider_kinds', scope: workItem('work_item_id'), description: 'The Work Kind the decider guessed for a Run.' },
  { entity: 'audit-records', table: 'audit_records', scope: byTenant('tenant_id'), json: ['event'], description: 'The security audit trail of the Tenant as OCSF events, each chained to the one before it by its SHA-256 hash.' },
  { entity: 'audit-anchors', table: 'audit_anchors', scope: byTenant('tenant_id'), description: 'Retention anchors: the last hash of audit records removed by retention, from which the remaining chain still verifies.' },
  { entity: 'audit-checkpoints', table: 'audit_checkpoints', scope: byTenant('tenant_id'), json: ['checkpoint'], description: 'The daily checkpoints of the audit chain head: sequence, hash, time and the OpenBao Transit signature, and when each was copied to object storage.' },
  { entity: 'billing-mappings', table: 'billing_mappings', scope: byTenant('tenant'), json: ['body'], description: 'The price and billing tool target each Client\'s accepted Work Items are billed at.' },
  { entity: 'billing-lines', table: 'billing_lines', scope: byTenant('tenant'), json: ['body'], description: 'One billing line per accepted Work Item and per reversal, with its state and what the billing tool answered.' },
  { entity: 'account-states', table: 'account_states', scope: person('user_id'), description: 'Accounts that were disabled, by whom and why.' },
  { entity: 'scim-users', table: 'scim_users', scope: person('user_id'), json: ['emails'], collect: 'id', description: 'People the identity provider provisioned through SCIM, and the account each is linked to.' },
  { entity: 'scim-groups', table: 'scim_groups', scope: installation, description: 'Groups the identity provider provisioned through SCIM.' },
  { entity: 'scim-group-members', table: 'scim_group_members', scope: { by: 'parent', parent: 'scim-users', column: 'member_id' }, description: 'Which SCIM group each provisioned person is in.' },
  { entity: 'intake-sources', table: 'intake_sources', scope: byTenant('tenant'), json: ['body'], description: 'Request intake sources: where Requests arrive and how they are mapped. No signing secret.' },
  { entity: 'intake-requests', table: 'intake_requests', scope: byTenant('tenant'), json: ['body'], collect: 'id', description: 'Requests received through intake, with their state.' },
  { entity: 'intake-messages', table: 'intake_messages', scope: { by: 'parent', parent: 'intake-requests', column: 'request_id' }, description: 'Which mail message belongs to which Request, so replies stay on their Request.' },
  { entity: 'notify-preferences', table: 'notify_preferences', scope: person('user_id'), json: ['body'], description: 'The channels and triggers each person chose to be notified on.' },
  { entity: 'notify-targets', table: 'notify_targets', scope: person('user_id'), drop: ['address_key', 'address'], description: 'Which notification targets each person has (ntfy, Web Push, Slack and Microsoft Teams), by channel and date. The ntfy topic, the push endpoint and its keys, the Slack direct-message id and the Teams workflow URL are left out; people subscribe again at the destination.' },
  { entity: 'outbound-subscriptions', table: 'outbound_subscriptions', scope: byTenant('tenant'), json: ['types'], credentialUrls: ['url'], collect: 'id', description: 'Outbound webhook subscriptions: the origin of the receiver URL with a SHA-256 fingerprint of the full URL, the event types and whether each is active. No signing secret, and no URL path or query, which receivers such as Slack and Power Automate use as a credential.' },
  { entity: 'outbound-events', table: 'outbound_events', scope: byTenant('tenant'), json: ['body'], description: 'Webhook events still in the outbox, as the CloudEvents they are sent as. They are signed when sent, so no secret is stored with them.' },
  { entity: 'outbound-deliveries', table: 'outbound_deliveries', scope: { by: 'parent', parent: 'outbound-subscriptions', column: 'subscription_id' }, description: 'Each webhook delivery to a subscription still in the delivery log: its status, attempts and the receiver\'s last answer.' },
  { entity: 'notify-slack-links', table: 'notify_slack_links', scope: person('user_id'), description: 'The Slack account each person linked for notifications: workspace and member id. No token.' },
];

/** Every table Unfold keeps that the bundle leaves out. Secrets are never exported. */
export const excludedTables: readonly ExcludedTable[] = [
  { table: 'logins', reason: 'Secret: hashes of browser sign-in tokens. People sign in again at the destination.' },
  { table: 'editor_credentials', reason: 'Secret: hashes of editor credentials. Editors are signed in again at the destination.' },
  { table: 'internal_state', reason: 'Secret: encrypted workspace credentials and the sign-in access and refresh tokens Unfold keeps to prove a person to Ploeg.' },
  { table: 'linked_session_notice_snapshots', reason: 'Cache: the last notice check of each Linked Session, rebuilt on the next check.' },
  { table: 'card_import', reason: 'Operational: progress of the one-time import of card records from Ploeg.' },
  { table: 'sqlite_sequence', reason: 'SQLite internal: the next AUTOINCREMENT value of each table.' },
  { table: 'notify_slack_pending', reason: 'Operational: Slack link requests waiting for their confirmation, with the hash of a one-time code, kept 15 minutes.' },
  { table: 'audit_exports', reason: 'Operational: how far the audit trail of each Tenant was sent to its log collector.' },
  { table: 'ssf_seen', reason: 'Deduplication: the ids of Shared Signals events already handled, forgotten after a while.' },
  { table: 'intake_deliveries', reason: 'Deduplication: the delivery ids each intake source already received and their outcome, kept for a few hours.' },
  { table: 'notify_outbox', reason: 'Delivery queue: notices waiting to be sent, or already sent, over ntfy, Web Push, Slack and Microsoft Teams.' },
  { table: 'notify_cursors', reason: 'Operational: how far notifications have read each source.' },
  { table: 'notify_handed_transitions', reason: 'Operational: the last moment each handed-off Work Item notified about, so a repeat notifies nobody. It holds Work Item and Ploeg event ids, no person.' },
  { table: 'outbound_cursors', reason: 'Operational: how far outbound webhooks have read each source.' },
  { table: 'outbound_sign_off_changes', reason: 'Operational: Client Sign-off changes waiting to become webhook events. The sign-offs are exported as client-sign-offs.' },
];

/** What the bundle never contains, as the manifest states it. */
export const secretsStatement = {
  exported: false,
  statement: 'This bundle contains no secrets. Password hashes, sign-in and editor token hashes, access and refresh tokens, encryption keys, the product event actor key, task source and repository credentials, gateway keys, webhook and intake signing secrets, push subscription keys and the path and query of webhook receiver URLs are left out, and every configured secret value is replaced by [redacted] wherever it appears in a record.',
  omitted: ['password hashes', 'sign-in token hashes', 'editor credential hashes', 'OIDC access and refresh tokens', 'the store encryption key', 'the product event actor key', 'task source tokens', 'repository access passwords', 'model gateway keys', 'webhook secrets', 'intake source signing secrets', 'Web Push subscription keys and ntfy topics', 'the path and query of webhook receiver URLs'],
};

/** A person as the bundle holds them: no password hash. */
export type ExportedUser = { id: string; name: string; role: string; memberships: unknown[] };

/** What one export reads from. */
export type ExportSources = {
  /** A connection to the workbench database. Open it read-only inside a transaction for a consistent snapshot. */
  db: DatabaseSync;
  config: Pick<AppConfig, 'repositories' | 'taskSources' | 'tenancy'>;
  /** Configured secret values, replaced by `[redacted]` wherever they appear. */
  secrets: readonly string[];
  application: { name: string; version: string };
  requestedBy: { id: string; name: string };
  /** The flagd document the authored rollouts compile to, when flags are available. */
  flagDocument?: () => unknown;
  /** The delivery ledger rows for the widest window, or a reason they are unavailable. */
  deliveryLedger?: () => Promise<{ rows: DeliveryRow[]; window: string } | { unavailable: string }>;
  /** Which of the given Work Item ids belong to the Tenant. Only consulted while Tenant checks are enforced. */
  workItemsInTenant?: (ids: string[]) => Promise<Set<string>>;
  now?: () => Date;
  /** How many rows to write between yields to the event loop. */
  yieldEvery?: number;
};

/** One file in the bundle as the manifest lists it. */
export type ManifestFile = { path: string; mediaType: string; bytes: number; sha256: string; entity?: string; rows?: number };
/** One entity in the bundle as the manifest lists it. */
export type ManifestEntity = { name: string; file: string; schema: string; schemaVersion: number; rows: number; sources: string[]; scope: string; description: string; derived?: boolean; unavailable?: string };
/** The bundle's `manifest.json`. */
export type TenantExportManifest = {
  format: typeof tenantExportFormat; formatVersion: number;
  tenant: string; tenancyEnforced: boolean; createdAt: string;
  application: { name: string; version: string }; requestedBy: { id: string; name: string };
  secrets: typeof secretsStatement;
  entities: ManifestEntity[]; files: ManifestFile[]; excluded: ExcludedTable[];
  notExported: { what: string; reason: string }[];
  elsewhere: { holder: string; what: string; file: string };
};

type Row = Record<string, unknown>;
type Column = { name: string; type: string; notnull: number; pk: number };
type Schema = Record<string, unknown>;

const camel = (name: string) => name.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
const schemaUrl = 'https://json-schema.org/draft/2020-12/schema';
const schemaId = (entity: string, version: number) => `urn:webgrip:unfold:tenant-export:${entity}:${version}`;

function parsed(text: unknown): unknown {
  if (typeof text !== 'string') return text;
  try { return JSON.parse(text); } catch { return text; }
}

function columnsOf(db: DatabaseSync, table: string): Column[] {
  return db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as unknown as Column[];
}

function rowOrder(db: DatabaseSync, table: string): string {
  const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as { sql?: string } | undefined)?.sql ?? '';
  if (!/WITHOUT\s+ROWID/i.test(sql)) return 'rowid';
  return columnsOf(db, table).filter(column => column.pk > 0).sort((left, right) => left.pk - right.pk).map(column => JSON.stringify(column.name)).join(', ');
}

/** The names of every table in the database, excluding SQLite's own schema tables. */
export function databaseTables(db: DatabaseSync): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_stat%' ORDER BY name").all() as { name: string }[]).map(row => row.name);
}

function columnSchema(column: Column, json: boolean): Schema {
  if (json) return { description: 'A JSON value Unfold stores as it is.' };
  const declared = column.type.toUpperCase();
  const base: Schema = declared.includes('INT') ? { type: 'integer' } : declared.includes('REAL') || declared.includes('FLOA') || declared.includes('DOUB') ? { type: 'number' } : declared.includes('BLOB') ? { type: 'string', contentEncoding: 'base64' } : { type: 'string' };
  return column.notnull || column.pk ? base : { ...base, type: [base.type as string, 'null'] };
}

/** The JSON Schema of a table entity, from the table's own column definitions. */
export function tableSchema(db: DatabaseSync, entity: TableEntity, version = 1): Schema {
  const columns = columnsOf(db, entity.table).filter(column => !entity.drop?.includes(column.name));
  const properties: [string, Schema][] = columns.flatMap((column): [string, Schema][] => {
    const name = camel(column.name);
    if (!entity.credentialUrls?.includes(column.name)) return [[name, columnSchema(column, entity.json?.includes(column.name) === true)]];
    return [
      [name, { type: 'string', description: 'The origin (scheme, host and port) of the URL. Its path and query are left out because a receiver may use them as a credential.' }],
      [`${name}Redacted`, { const: true }],
      [`${name}Fingerprint`, { type: 'string', pattern: '^[0-9a-f]{64}$', description: 'SHA-256, in hex, of the full URL as stored, to match it against a URL configured again at the destination.' }],
    ];
  });
  return {
    $schema: schemaUrl, $id: schemaId(entity.entity, version), title: `Unfold ${entity.entity}`, description: entity.description,
    type: 'object', additionalProperties: false, required: properties.map(([name]) => name),
    properties: Object.fromEntries(properties),
  };
}

const nullable = (type: string) => ({ type: [type, 'null'] });
const curatedSchemas: Record<string, Schema> = {
  users: { title: 'Unfold users', description: 'People with a workbench account in the Tenant and their memberships. No password hash.', required: ['id', 'name', 'role', 'memberships'], properties: { id: { type: 'string' }, name: { type: 'string' }, role: { enum: ['viewer', 'operator', 'admin'] }, memberships: { type: 'array', items: { type: 'object', required: ['kind', 'tenant'], properties: { kind: { enum: ['tenant', 'client'] }, tenant: { type: 'string' }, role: { enum: ['viewer', 'developer', 'admin'] }, client: { type: 'string' } } } } } },
  repositories: { title: 'Unfold repositories', description: 'Registered repositories, from configuration. No access credentials; credentials in a URL are removed.', required: ['id', 'name', 'description', 'url', 'baseBranch', 'verify', 'tenant'], properties: { id: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, url: { type: 'string' }, baseBranch: { type: 'string' }, verify: { type: 'array', items: { type: 'string' } }, trackerUrl: { type: 'string' }, executionOwner: { enum: ['interactive', 'ploeg'] }, mcp: { type: 'object' }, tenant: { type: 'string' }, client: { type: 'string' } } },
  'task-sources': { title: 'Unfold task sources', description: 'Configured task sources. No token.', required: ['id', 'name', 'provider', 'baseUrl', 'project', 'repositoryId', 'executionOwner', 'tenant'], properties: { id: { type: 'string' }, name: { type: 'string' }, provider: { type: 'string' }, baseUrl: { type: 'string' }, project: { type: 'string' }, repositoryId: { type: 'string' }, executionOwner: { enum: ['interactive', 'ploeg'] }, ploeg: { type: 'object' }, tenant: { type: 'string' }, client: { type: 'string' } } },
  sessions: { title: 'Unfold workbench sessions', description: 'Workbench sessions as Unfold stores them, without workspace credentials or native harness ids.', required: ['id', 'ownerId', 'updatedAt', 'body'], properties: { id: { type: 'string' }, ownerId: { type: 'string' }, updatedAt: { type: 'string' }, body: { type: 'object', description: 'The session record.' } } },
  'delivery-ledger': { title: 'Unfold delivery ledger', description: 'One row per Work Item with its Acceptance and Token Charge base in US$, derived from Ploeg delivery facts for the widest window. Nothing here is a charge.', required: ['workItemId', 'acceptance', 'tokenChargeBaseUsd'], properties: { workItemId: { type: 'string' }, externalRef: { type: 'string' }, title: { type: 'string' }, team: { type: 'string' }, state: { type: 'string' }, acceptance: { type: 'object', properties: { kind: { enum: ['merged', 'approved', 'silent', 'closed_without_acceptance', 'open'] }, at: nullable('string'), pullRequestUrl: nullable('string') } }, readyForReviewAt: nullable('string'), silentDueAt: nullable('string'), tokenChargeBaseUsd: { type: 'number' }, unsettled: { type: 'object' }, unknownRuns: { type: 'integer' }, runsTruncated: { type: 'boolean' } } },
};

function curatedSchema(entity: string, version = 1): Schema {
  const { title, description, ...rest } = curatedSchemas[entity];
  return { $schema: schemaUrl, $id: schemaId(entity, version), title, description, type: 'object', ...rest };
}

function withoutUrlCredentials(url: string): string {
  try {
    const parsedUrl = new URL(url);
    if (!parsedUrl.username && !parsedUrl.password) return url;
    parsedUrl.username = ''; parsedUrl.password = '';
    return parsedUrl.toString();
  } catch { return url.replace(/:\/\/[^\s/@]+@/, '://'); }
}

/** A repository as the bundle holds it: configuration without `access`, and no credentials in its URL. */
export function exportedRepository(repository: Repository): Row {
  const { access: _access, ...rest } = repository;
  return { ...rest, url: withoutUrlCredentials(repository.url), tenant: ownership(repository).tenant };
}

/** A task source as the bundle holds it: configuration without its token. */
export function exportedTaskSource(source: TaskSourceConfig): Row {
  const { token: _token, tokenType: _tokenType, ...rest } = source;
  return { ...rest, baseUrl: withoutUrlCredentials(source.baseUrl), tenant: ownership(source).tenant };
}

type Scope = { tenant: string; enforced: boolean; installation: boolean; users: Set<string> | null; repositories: Set<string> | null; repositoryPaths: Set<string> | null; workItems: Set<string> | null; parents: Map<string, Set<string>> };

function scopeLabel(scope: Scoping | 'config' | 'derived'): string {
  if (scope === 'config') return 'configuration entries the Tenant owns';
  if (scope === 'derived') return 'Work Items of the Tenant';
  if (scope.by === 'installation') return 'installation-wide; exported with the default Tenant only';
  if (scope.by === 'tenant') return `rows whose ${scope.column} is the Tenant`;
  if (scope.by === 'person') return `rows whose ${scope.column} is a person in the Tenant`;
  if (scope.by === 'work-item') return `rows whose ${scope.column} is a Work Item of the Tenant`;
  if (scope.by === 'repository') return `rows whose ${scope.column} is a repository of the Tenant`;
  return `rows whose ${scope.column} belongs to an exported ${scope.parent} row`;
}

function inScope(scope: Scope, scoping: Scoping, row: Row): boolean {
  if (scoping.by === 'installation') return scope.installation;
  const value = String(row[scoping.column] ?? '');
  if (scoping.by === 'tenant') return value === scope.tenant;
  if (scoping.by === 'person') return scope.users === null || scope.users.has(value);
  if (scoping.by === 'work-item') return scope.workItems === null || scope.workItems.has(value);
  if (scoping.by === 'repository') return scope.repositoryPaths === null || scope.repositoryPaths.has(value.toLowerCase());
  const parents = scope.parents.get(scoping.parent);
  return parents === undefined ? scope.users === null : parents.has(value);
}

function membershipsOf(row: Row): unknown[] {
  const stored = typeof row.memberships === 'string' ? storedMemberships(parsed(row.memberships)) : undefined;
  return stored ?? defaultMemberships(row.role as 'viewer' | 'operator' | 'admin');
}

async function buildScope(sources: ExportSources, tenant: string): Promise<Scope> {
  const enforced = sources.config.tenancy?.enforce === true;
  const scope: Scope = { tenant, enforced, installation: !enforced || tenant === defaultTenant, users: null, repositories: null, repositoryPaths: null, workItems: null, parents: new Map() };
  if (!enforced) return scope;
  const db = sources.db;
  scope.users = new Set();
  for (const row of db.prepare('SELECT users.id, users.role, user_memberships.memberships FROM users LEFT JOIN user_memberships ON user_memberships.user_id = users.id').iterate() as Iterable<Row>) {
    if (membershipsOf(row).some(entry => (entry as { tenant?: string }).tenant === tenant)) scope.users.add(String(row.id));
  }
  const repositories = (sources.config.repositories ?? []).filter(entry => ownership(entry).tenant === tenant);
  scope.repositories = new Set(repositories.map(entry => entry.id));
  scope.repositoryPaths = new Set(repositories.map(entry => { const key = repositoryKey(entry.url); return key.startsWith('path:') ? key : key.slice(key.indexOf('/') + 1); }));
  const ids = new Set<string>();
  for (const entity of tableEntities) {
    if (entity.scope.by !== 'work-item') continue;
    for (const row of db.prepare(`SELECT DISTINCT ${entity.scope.column} AS id FROM ${entity.table}`).iterate() as Iterable<Row>) ids.add(String(row.id));
  }
  scope.workItems = new Set();
  const all = [...ids];
  for (let index = 0; index < all.length && sources.workItemsInTenant; index += 100) {
    for (const id of await sources.workItemsInTenant(all.slice(index, index + 100))) scope.workItems.add(id);
  }
  return scope;
}

class JsonLinesFile {
  readonly path: string;
  rows = 0;
  bytes = 0;
  private readonly stream;
  private readonly hash = createHash('sha256');
  private readonly secrets: readonly string[];
  private readonly yieldEvery: number;

  constructor(path: string, secrets: readonly string[], yieldEvery: number) {
    this.path = path;
    this.stream = createWriteStream(path, { mode: 0o600 });
    this.secrets = secrets;
    this.yieldEvery = yieldEvery;
  }

  async write(value: unknown): Promise<void> {
    const line = Buffer.from(`${withoutKnownSecrets(JSON.stringify(value), this.secrets)}\n`);
    this.hash.update(line);
    this.bytes += line.length;
    this.rows++;
    if (!this.stream.write(line)) await once(this.stream, 'drain');
    else if (this.rows % this.yieldEvery === 0) await new Promise(resolve => setImmediate(resolve));
  }

  async close(): Promise<{ rows: number; bytes: number; sha256: string }> {
    this.stream.end();
    await once(this.stream, 'finish');
    return { rows: this.rows, bytes: this.bytes, sha256: this.hash.digest('hex') };
  }
}

function urlOrigin(value: string): string {
  try {
    const origin = new URL(value).origin;
    return origin === 'null' ? '[redacted]' : origin;
  } catch { return '[redacted]'; }
}

function tableRow(entity: TableEntity, row: Row): Row {
  const out: Row = {};
  for (const [name, value] of Object.entries(row)) {
    if (entity.drop?.includes(name)) continue;
    if (entity.credentialUrls?.includes(name)) {
      out[camel(name)] = urlOrigin(String(value));
      out[`${camel(name)}Redacted`] = true;
      out[`${camel(name)}Fingerprint`] = createHash('sha256').update(String(value)).digest('hex');
      continue;
    }
    out[camel(name)] = value instanceof Uint8Array ? Buffer.from(value).toString('base64') : entity.json?.includes(name) ? parsed(value) : value;
  }
  return out;
}

/** The pointer file that says what Ploeg holds and how to get it. */
export function ploegPointer(tenant: string): string {
  return [
    '# Data Ploeg holds',
    '',
    `This bundle holds what Unfold stores for the Tenant \`${tenant}\`. Ploeg, the engine that authorizes, budgets and runs every agent Run, keeps its own records, and they are Ploeg's to export:`,
    '',
    '- Work Items as Ploeg knows them, with their states and revisions',
    '- Shifts, Runs and their outcomes',
    '- Run transcripts and checkpoints',
    '- spend, holds and allowances',
    '- Ploeg\'s audit log',
    '- delivery facts (pull requests, reviews and merges per Work Item)',
    '',
    '`data/delivery-ledger.jsonl` in this bundle is Unfold\'s reading of those delivery facts for its widest window, not a copy of them.',
    '',
    '## Exporting from Ploeg',
    '',
    'Ploeg\'s Operator API serves team-scoped read projections of each of these records (its `operator-api.v1` contract). Until Ploeg offers a bulk export, read them page by page with an operator credential for each Team the Tenant uses, and keep the JSON as it comes. Ask the operator of your Ploeg installation for that credential; it is not in this bundle.',
    '',
  ].join('\n');
}

const mediaTypes: Record<string, string> = { jsonl: 'application/jsonl', json: 'application/json', md: 'text/markdown' };
const mediaType = (path: string) => mediaTypes[path.slice(path.lastIndexOf('.') + 1)] ?? 'application/octet-stream';

/**
 * Builds the export bundle for one Tenant: a gzip-compressed POSIX tar of one JSON Lines file per entity under
 * `data/`, a JSON Schema per entity under `schemas/`, the Ploeg pointer file and `manifest.json` last. Rows are
 * streamed from the database to files in `workDir` and from there into `bundlePath`, so memory stays bounded.
 */
export async function buildTenantExport(sources: ExportSources, tenant: string, workDir: string, bundlePath: string): Promise<{ manifest: TenantExportManifest; bytes: number; sha256: string }> {
  const now = sources.now?.() ?? new Date();
  const yieldEvery = sources.yieldEvery ?? 500;
  const db = sources.db;
  mkdirSync(join(workDir, 'data'), { recursive: true, mode: 0o700 });
  const scope = await buildScope(sources, tenant);
  const present = new Set(databaseTables(db));
  const entities: ManifestEntity[] = [];
  const staged: { path: string; source: string; entity?: string; rows?: number; bytes: number; sha256: string }[] = [];
  const schemas: { path: string; content: Buffer }[] = [];

  const open = (entity: string) => new JsonLinesFile(join(workDir, 'data', `${entity}.jsonl`), sources.secrets, yieldEvery);
  const finish = async (file: JsonLinesFile, entry: Omit<ManifestEntity, 'file' | 'schema' | 'rows'>, schema: Schema) => {
    const result = await file.close();
    const path = `data/${entry.name}.jsonl`;
    const schemaPath = `schemas/${entry.name}.schema.json`;
    staged.push({ path, source: file.path, entity: entry.name, rows: result.rows, bytes: result.bytes, sha256: result.sha256 });
    schemas.push({ path: schemaPath, content: Buffer.from(`${JSON.stringify(schema, null, 2)}\n`) });
    entities.push({ ...entry, file: path, schema: schemaPath, rows: result.rows });
  };

  const users = open('users');
  for (const row of db.prepare('SELECT users.id, users.name, users.role, user_memberships.memberships FROM users LEFT JOIN user_memberships ON user_memberships.user_id = users.id ORDER BY users.rowid').iterate() as Iterable<Row>) {
    if (scope.users !== null && !scope.users.has(String(row.id))) continue;
    const exported: ExportedUser = { id: String(row.id), name: String(row.name), role: String(row.role), memberships: membershipsOf(row) };
    await users.write(exported);
  }
  await finish(users, { name: 'users', schemaVersion: 1, sources: [...curatedSources.users], scope: scope.enforced ? 'people with a membership of the Tenant' : 'every person', description: String(curatedSchemas.users.description) }, curatedSchema('users'));

  const repositories = open('repositories');
  for (const entry of sources.config.repositories ?? []) if (!scope.enforced || ownership(entry).tenant === tenant) await repositories.write(exportedRepository(entry));
  await finish(repositories, { name: 'repositories', schemaVersion: 1, sources: ['configuration: repositories'], scope: scopeLabel('config'), description: String(curatedSchemas.repositories.description) }, curatedSchema('repositories'));

  const taskSources = open('task-sources');
  for (const entry of sources.config.taskSources ?? []) if (!scope.enforced || ownership(entry).tenant === tenant) await taskSources.write(exportedTaskSource(entry));
  await finish(taskSources, { name: 'task-sources', schemaVersion: 1, sources: ['configuration: taskSources'], scope: scopeLabel('config'), description: String(curatedSchemas['task-sources'].description) }, curatedSchema('task-sources'));

  const sessions = open('sessions');
  const sessionIds = new Set<string>();
  for (const row of db.prepare('SELECT id, owner_id, updated_at, body FROM sessions ORDER BY rowid').iterate() as Iterable<Row>) {
    const body = parsed(row.body) as Session;
    if (scope.repositories !== null && !scope.repositories.has(String(body?.repositoryId))) continue;
    sessionIds.add(String(row.id));
    await sessions.write({ id: row.id, ownerId: row.owner_id, updatedAt: row.updated_at, body: body && typeof body === 'object' && Array.isArray(body.runs) ? publicSession(body) : body });
  }
  scope.parents.set('sessions', sessionIds);
  await finish(sessions, { name: 'sessions', schemaVersion: 1, sources: [...curatedSources.sessions], scope: scope.enforced ? 'sessions on a repository of the Tenant' : 'every session', description: String(curatedSchemas.sessions.description) }, curatedSchema('sessions'));

  for (const entity of tableEntities) {
    const file = open(entity.entity);
    const collected = entity.collect ? new Set<string>() : undefined;
    if (present.has(entity.table)) {
      for (const row of db.prepare(`SELECT * FROM ${entity.table} ORDER BY ${rowOrder(db, entity.table)}`).iterate() as Iterable<Row>) {
        if (!inScope(scope, entity.scope, row)) continue;
        if (collected) collected.add(String(row[entity.collect!]));
        await file.write(tableRow(entity, row));
      }
    }
    if (collected) scope.parents.set(entity.entity, collected);
    const schema = present.has(entity.table) ? tableSchema(db, entity) : { $schema: schemaUrl, $id: schemaId(entity.entity, 1), title: `Unfold ${entity.entity}`, description: entity.description, type: 'object' };
    await finish(file, { name: entity.entity, schemaVersion: 1, sources: [entity.table], scope: scopeLabel(entity.scope), description: entity.description }, schema);
  }

  const ledger = open('delivery-ledger');
  const read = sources.deliveryLedger ? await sources.deliveryLedger().catch((error: Error) => ({ unavailable: `Ploeg could not be read: ${String(error.message).slice(0, 200)}` })) : { unavailable: 'Ploeg is not connected.' };
  if ('rows' in read) for (const row of read.rows) if (scope.workItems === null || scope.workItems.has(row.workItemId)) await ledger.write(row);
  await finish(ledger, { name: 'delivery-ledger', schemaVersion: 1, sources: ['Ploeg delivery facts'], scope: scopeLabel('derived'), description: `${String(curatedSchemas['delivery-ledger'].description)}${'window' in read ? ` Window: ${read.window}.` : ''}`, derived: true, ...('unavailable' in read ? { unavailable: read.unavailable } : {}) }, curatedSchema('delivery-ledger'));

  const extras: { path: string; content: Buffer }[] = [{ path: ploegPointerFile, content: Buffer.from(ploegPointer(tenant)) }];
  if (sources.flagDocument && scope.installation) extras.push({ path: 'flags.flagd.json', content: Buffer.from(`${withoutKnownSecrets(JSON.stringify(sources.flagDocument(), null, 2), sources.secrets)}\n`) });

  const sha = (content: Buffer) => createHash('sha256').update(content).digest('hex');
  const files: ManifestFile[] = [
    ...staged.map(entry => ({ path: entry.path, mediaType: mediaType(entry.path), bytes: entry.bytes, sha256: entry.sha256, entity: entry.entity, rows: entry.rows })),
    ...schemas.map(entry => ({ path: entry.path, mediaType: 'application/schema+json', bytes: entry.content.length, sha256: sha(entry.content) })),
    ...extras.map(entry => ({ path: entry.path, mediaType: mediaType(entry.path), bytes: entry.content.length, sha256: sha(entry.content) })),
  ];
  const manifest: TenantExportManifest = {
    format: tenantExportFormat, formatVersion: tenantExportFormatVersion,
    tenant, tenancyEnforced: scope.enforced, createdAt: now.toISOString(),
    application: sources.application, requestedBy: sources.requestedBy,
    secrets: secretsStatement, entities, files, excluded: [...excludedTables],
    notExported: [{ what: 'signing secrets of outbound webhook subscriptions and intake sources', reason: 'They are secrets. Issue new ones at the destination and configure the senders and receivers with them again.' }],
    elsewhere: { holder: 'Ploeg', what: 'Work Items as Ploeg records them, Shifts, Runs, Run transcripts, checkpoints, spend and Ploeg\'s audit log', file: ploegPointerFile },
  };

  const writer = new TarGzipWriter(bundlePath);
  try {
    for (const entry of staged) await writer.addFile(entry.path, entry.source, now);
    for (const entry of [...schemas, ...extras]) await writer.addBuffer(entry.path, entry.content, now);
    await writer.addBuffer('manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), now);
    const archive = await writer.finish();
    return { manifest, ...archive };
  } catch (error) { writer.abort(); throw error; }
}
