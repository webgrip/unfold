import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Membership } from '../tenancy.ts';

/** The OCSF schema version every audit record declares in `metadata.version`. */
export const ocsfVersion = '1.9.0';

/** The Unfold release that writes the records, read from `package.json`. */
export const productVersion = (() => { try { return String(JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version); } catch { return 'unknown'; } })();

/** The OCSF 1.9.0 event classes Unfold's audit uses, with their category. */
export const ocsfClasses = {
  account_change: { uid: 3001, name: 'Account Change', category: 3 },
  authentication: { uid: 3002, name: 'Authentication', category: 3 },
  entity_management: { uid: 3004, name: 'Entity Management', category: 3 },
  user_access: { uid: 3005, name: 'User Access Management', category: 3 },
  group_management: { uid: 3006, name: 'Group Management', category: 3 },
  web_resources_activity: { uid: 6001, name: 'Web Resources Activity', category: 6 },
  api_activity: { uid: 6003, name: 'API Activity', category: 6 },
} as const;
export type OcsfClass = keyof typeof ocsfClasses;

const categories: Record<number, string> = { 3: 'Identity & Access Management', 6: 'Application Activity' };
const severities: Record<number, string> = { 1: 'Informational', 2: 'Low', 3: 'Medium', 4: 'High' };

/** A person an audit record names. `memberships` decide which Tenants see the record and never leave Unfold. */
export type AuditPerson = { id?: string; name?: string; role?: string; memberships?: Membership[] };

/** Who did it: a person, or Unfold itself acting on an identity provider's or an operator's behalf. */
export type AuditActor = { user?: AuditPerson; idp?: { name: string; uid?: string }; invokedBy?: string; session?: string };

/** Where a request came from and through which channel (system ADR-0037). */
export type AuditOrigin = { ip?: string; userAgent?: string; method?: string; channel?: string; confirmation?: string | null };

export type AuditOutcome = 'success' | 'failure';

/** What happened, in Unfold's words. Each kind maps to one OCSF class and activity in {@link ocsfEvent}. */
export type AuditFact =
  | { kind: 'sign_in'; method: 'password' | 'oidc'; user: AuditPerson; outcome: AuditOutcome; reason?: string }
  | { kind: 'sign_out'; user: AuditPerson; credential: 'browser' | 'editor' }
  | { kind: 'credential'; credential: 'editor' | 'agents_window' | 'linked_account'; action: 'issue' | 'deny' | 'revoke'; user: AuditPerson; uid?: string; name?: string; outcome: AuditOutcome; reason?: string }
  | { kind: 'account'; action: 'create' | 'rename'; user: AuditPerson; previousName?: string }
  | { kind: 'role'; user: AuditPerson; role: string; previous: string }
  | { kind: 'membership'; action: 'add' | 'remove' | 'role'; user: AuditPerson; tenant: string; client?: string; role?: string; previous?: string }
  | { kind: 'entity'; action: 'create' | 'update' | 'delete' | 'deactivate'; entity: { type: string; uid?: string; name?: string; data?: Record<string, unknown> }; outcome: AuditOutcome; reason?: string }
  | { kind: 'download'; activity: 'read' | 'export'; resource: { type: string; uid?: string; name: string }; outcome: AuditOutcome; reason?: string }
  | { kind: 'api'; service: 'unfold-api' | 'unfold-mcp'; operation: string; method: string; status: number; outcome: AuditOutcome; target?: { kind: string; id: string } | null; inputs?: Record<string, unknown>; agent?: { name: string; uid?: string }; delegation?: { uid: string; issuer?: string; createdAt?: number } };

/** One fact with its actor, origin and moment, as the audit trail receives it. */
export type AuditEntry = { fact: AuditFact; actor: AuditActor; origin?: AuditOrigin; at: Date };

/** An OCSF event as Unfold writes it: a plain JSON object whose `metadata` the chain completes. */
export type OcsfEvent = Record<string, unknown> & { class_uid: number; activity_id: number; time: number; metadata: Record<string, unknown> };

const credentialTypes = { editor: 'Editor credential', agents_window: 'Agents window token', linked_account: 'Linked account' } as const;

function ocsfUser(person: AuditPerson | undefined): Record<string, unknown> {
  if (!person || (!person.id && !person.name)) return { name: 'unknown', type_id: 0, type: 'Unknown' };
  const admin = person.role === 'admin';
  return { ...(person.id ? { uid: person.id } : {}), ...(person.name ? { name: person.name } : {}), type_id: admin ? 2 : 1, type: admin ? 'Admin' : 'User' };
}

function ocsfActor(actor: AuditActor): Record<string, unknown> {
  return {
    ...(actor.user ? { user: ocsfUser(actor.user) } : {}),
    app_name: 'Unfold',
    ...(actor.idp ? { idp: { name: actor.idp.name, ...(actor.idp.uid ? { uid: actor.idp.uid } : {}) } } : {}),
    ...(actor.invokedBy ? { invoked_by: actor.invokedBy } : {}),
    ...(actor.session ? { session: { uid: actor.session } } : {}),
  };
}

type Shape = { type: OcsfClass; activity: number; activityName: string; outcome: AuditOutcome; severity?: number; statusCode?: string; detail?: string; message: string; fields: Record<string, unknown> };

function named(person: AuditPerson): string { return person.name ?? person.id ?? 'someone'; }

function shape(fact: AuditFact): Shape {
  switch (fact.kind) {
    case 'sign_in': return {
      type: 'authentication', activity: 1, activityName: 'Logon', outcome: fact.outcome, severity: fact.outcome === 'failure' ? 3 : 1, ...(fact.reason ? { statusCode: fact.reason, detail: fact.reason } : {}),
      message: fact.outcome === 'success' ? `${named(fact.user)} signed in with ${fact.method === 'oidc' ? 'single sign-on' : 'a password'}.` : `A ${fact.method === 'oidc' ? 'single sign-on' : 'password'} sign-in${fact.user.name ? ` as ${fact.user.name}` : ''} failed: ${fact.reason ?? 'unknown reason'}.`,
      fields: { user: ocsfUser(fact.user), auth_protocol_id: fact.method === 'oidc' ? 4 : 99, auth_protocol: fact.method === 'oidc' ? 'OpenID' : 'Password', is_remote: true, service: { name: 'Unfold' } },
    };
    case 'sign_out': return { type: 'authentication', activity: 2, activityName: 'Logoff', outcome: 'success', message: `${named(fact.user)} signed out ${fact.credential === 'editor' ? 'an editor' : 'of the browser'}.`, fields: { user: ocsfUser(fact.user), is_remote: true, service: { name: 'Unfold' }, unmapped: { credential: fact.credential } } };
    case 'credential': {
      const type = credentialTypes[fact.credential];
      const entity = { type, type_id: 99, ...(fact.uid ? { uid: fact.uid } : {}), ...(fact.name ? { name: fact.name } : {}), ...(!fact.uid && !fact.name ? { name: type } : {}), user: ocsfUser(fact.user) };
      if (fact.action === 'revoke') return { type: 'entity_management', activity: 4, activityName: 'Delete', outcome: fact.outcome, ...(fact.reason ? { statusCode: fact.reason, detail: fact.reason } : {}), message: `${named(fact.user)} revoked ${type.toLowerCase()}${fact.name ? ` ${fact.name}` : ''}.`, fields: { entity } };
      const denied = fact.action === 'deny';
      return { type: 'entity_management', activity: 1, activityName: 'Create', outcome: denied ? 'failure' : fact.outcome, ...(denied ? { statusCode: 'denied', detail: 'The person denied it in the browser.' } : fact.reason ? { statusCode: fact.reason, detail: fact.reason } : {}), message: `${named(fact.user)} ${denied ? 'denied' : 'approved'} a new ${type.toLowerCase()}${fact.name ? ` for ${fact.name}` : ''}.`, fields: { entity } };
    }
    case 'account': return fact.action === 'create'
      ? { type: 'account_change', activity: 1, activityName: 'Create', outcome: 'success', message: `The account ${named(fact.user)} was created.`, fields: { user: ocsfUser(fact.user) } }
      : { type: 'account_change', activity: 99, activityName: 'Rename', outcome: 'success', message: `The account ${fact.previousName ?? ''} is now named ${named(fact.user)}.`, fields: { user: ocsfUser(fact.user), unmapped: { previous_name: fact.previousName ?? null } } };
    case 'role': return { type: 'user_access', activity: 3, activityName: 'Assign Role', outcome: 'success', message: `${named(fact.user)} now has the ${fact.role} role (was ${fact.previous}).`, fields: { user: ocsfUser(fact.user), iam_role: { name: fact.role }, unmapped: { previous_role: fact.previous } } };
    case 'membership': {
      const group = fact.client === undefined ? { uid: fact.tenant, name: fact.tenant, type: 'Tenant' } : { uid: `${fact.tenant}/${fact.client}`, name: fact.client, type: 'Client' };
      const where = fact.client === undefined ? `Tenant ${fact.tenant}` : `Client ${fact.client} of Tenant ${fact.tenant}`;
      const fields = { group, user: ocsfUser(fact.user), ...(fact.role ? { privileges: [fact.role] } : {}), ...(fact.previous ? { unmapped: { previous_role: fact.previous } } : {}) };
      if (fact.action === 'add') return { type: 'group_management', activity: 3, activityName: 'Add User', outcome: 'success', message: `${named(fact.user)} joined ${where}${fact.role ? ` as ${fact.role}` : ''}.`, fields };
      if (fact.action === 'remove') return { type: 'group_management', activity: 4, activityName: 'Remove User', outcome: 'success', message: `${named(fact.user)} left ${where}.`, fields };
      return { type: 'group_management', activity: 12, activityName: 'Assign Roles', outcome: 'success', message: `${named(fact.user)} is now ${fact.role} in ${where} (was ${fact.previous}).`, fields };
    }
    case 'entity': {
      const activity = { create: [1, 'Create'], update: [3, 'Update'], delete: [4, 'Delete'], deactivate: [11, 'Deactivate'] }[fact.action] as [number, string];
      return { type: 'entity_management', activity: activity[0], activityName: activity[1], outcome: fact.outcome, ...(fact.reason ? { statusCode: fact.reason, detail: fact.reason } : {}), message: `${activity[1]} ${fact.entity.type}${fact.entity.uid ? ` ${fact.entity.uid}` : ''}.`, fields: { entity: { type: fact.entity.type, type_id: 99, ...(fact.entity.uid ? { uid: fact.entity.uid } : {}), name: fact.entity.name ?? fact.entity.uid ?? fact.entity.type, ...(fact.entity.data ? { data: fact.entity.data } : {}) } } };
    }
    case 'download': return { type: 'web_resources_activity', activity: fact.activity === 'read' ? 2 : 7, activityName: fact.activity === 'read' ? 'Read' : 'Export', outcome: fact.outcome, ...(fact.reason ? { statusCode: fact.reason, detail: fact.reason } : {}), message: `${fact.activity === 'read' ? 'Read' : 'Exported'} ${fact.resource.name}.`, fields: { web_resources: [{ type: fact.resource.type, name: fact.resource.name, ...(fact.resource.uid ? { uid: fact.resource.uid } : {}) }] } };
    case 'api': {
      const activity = ({ POST: [1, 'Create'], PUT: [3, 'Update'], PATCH: [3, 'Update'], DELETE: [4, 'Delete'], GET: [2, 'Read'] } as Record<string, [number, string]>)[fact.method] ?? [99, 'Other'];
      return {
        type: 'api_activity', activity: activity[0], activityName: activity[1], outcome: fact.outcome, statusCode: String(fact.status), message: `${fact.operation} answered ${fact.status}.`,
        fields: {
          api: { operation: fact.operation, service: { name: fact.service }, request: { uid: randomUUID(), ...(fact.inputs && Object.keys(fact.inputs).length ? { data: fact.inputs } : {}) }, response: { code: fact.status, ...(fact.outcome === 'failure' ? { error: fact.status >= 500 ? 'failed' : 'refused' } : {}) } },
          ...(fact.agent ? { ai_agent: { name: fact.agent.name, ...(fact.agent.uid ? { uid: fact.agent.uid } : {}), type_id: 99, type: 'MCP client' } } : {}),
          ...(fact.delegation ? { delegation: { uid: fact.delegation.uid, ...(fact.delegation.issuer ? { issuer_uid: fact.delegation.issuer } : {}), ...(fact.delegation.createdAt ? { created_time: fact.delegation.createdAt } : {}) } } : {}),
          ...(fact.target ? { unmapped: { target: fact.target } } : {}),
        },
      };
    }
  }
}

/**
 * The OCSF 1.9.0 record of one audit entry, without the chain's `metadata.sequence`, `metadata.tenant_uid` and
 * `metadata.uid`, which {@link AuditChain.append} adds per Tenant.
 */
export function ocsfEvent(entry: AuditEntry): OcsfEvent {
  const described = shape(entry.fact);
  const descriptor = ocsfClasses[described.type];
  const severity = described.severity ?? (described.outcome === 'failure' ? 2 : 1);
  const origin = entry.origin ?? {};
  const unmapped = { ...(described.fields.unmapped as Record<string, unknown> | undefined), ...(origin.channel ? { channel: origin.channel } : {}), ...(origin.confirmation ? { confirmation: origin.confirmation } : {}) };
  const fields = { ...described.fields };
  delete fields.unmapped;
  const profiles = [...(fields.ai_agent || fields.delegation ? ['ai_operation'] : []), ...(descriptor.uid === ocsfClasses.web_resources_activity.uid ? ['host'] : [])];
  const sourceEndpoint = origin.ip ? { ip: origin.ip } : descriptor.uid === ocsfClasses.api_activity.uid ? { name: 'unknown' } : undefined;
  return {
    class_uid: descriptor.uid, class_name: descriptor.name, category_uid: descriptor.category, category_name: categories[descriptor.category],
    activity_id: described.activity, activity_name: described.activityName, type_uid: descriptor.uid * 100 + described.activity, type_name: `${descriptor.name}: ${described.activityName}`,
    time: entry.at.getTime(), severity_id: severity, severity: severities[severity],
    status_id: described.outcome === 'success' ? 1 : 2, status: described.outcome === 'success' ? 'Success' : 'Failure',
    ...(described.statusCode ? { status_code: described.statusCode } : {}), ...(described.detail ? { status_detail: described.detail } : {}),
    message: described.message,
    metadata: { version: ocsfVersion, product: { name: 'Unfold', vendor_name: 'WebGrip', uid: 'unfold', version: productVersion }, log_name: 'audit', log_provider: 'unfold', ...(profiles.length ? { profiles } : {}) },
    actor: ocsfActor(entry.actor),
    ...(sourceEndpoint ? { src_endpoint: sourceEndpoint } : {}),
    ...(origin.method || origin.userAgent ? { http_request: { ...(origin.method ? { http_method: origin.method } : {}), ...(origin.userAgent ? { user_agent: origin.userAgent } : {}) } } : {}),
    ...fields,
    ...(Object.keys(unmapped).length ? { unmapped } : {}),
  };
}
