import { describeAction, isAction, recordedInputs, type ActionTarget } from '../action-records.ts';
import type { User } from '../types.ts';
import { defaultTenant, validTenancyId } from '../tenancy.ts';
import type { AuditFact, AuditOutcome, AuditPerson } from './ocsf.ts';
import { isLinkProvider, linkProviderLabel } from '../links.ts';

/** What the request tap knows about one finished request, with the lookups a rule may need. */
export type TapRequest = {
  method: string;
  path: string;
  query: URLSearchParams;
  status: number;
  /** The response's `Location` header, for the redirect that ends a single sign-on. */
  location?: string;
  /** The person signed in when the request arrived, read before the handler ran; set only for {@link readsUserFirst} routes. */
  before?: User;
  scope?: 'browser' | 'editor' | 'mcp';
  user(): User | undefined;
  inputs(): Record<string, unknown>;
  userByName(name: string): User | undefined;
  /** The person the response's `Set-Cookie` signed in, for single sign-on. */
  signedInByResponse(): User | undefined;
  editorLabel(code: string, user: User): string | undefined;
};

/** One audit fact the tap found, with the person who acted, what the request targeted and the Tenant whose chain it belongs to, when the route names one. */
export type Captured = { fact: AuditFact; actor?: User; target?: ActionTarget | null; tenants?: string[] };

const outcome = (status: number): AuditOutcome => status >= 200 && status < 400 ? 'success' : 'failure';
const person = (user: User | undefined): AuditPerson => user ? { id: user.id, name: user.name, role: user.role, ...(user.memberships ? { memberships: user.memberships } : {}) } : {};
const queryCode = (location: string | undefined, name: string): string | undefined => {
  if (!location) return undefined;
  try { return new URL(location, 'http://unfold.invalid').searchParams.get(name) ?? undefined; } catch { return undefined; }
};
const reasons: Record<number, string> = { 400: 'invalid_input', 401: 'invalid_credentials', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 429: 'rate_limited' };
const reason = (status: number): string | undefined => outcome(status) === 'success' ? undefined : reasons[status] ?? `http_${status}`;
const text = (value: unknown, max = 200): string | undefined => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;

/** Whether a route signs the person out, so the tap reads who it was before the handler runs. */
export function readsUserFirst(method: string, path: string): boolean {
  return method === 'POST' && path === '/api/logout';
}

const downloads: Array<{ pattern: RegExp; resource: (match: RegExpExecArray, query: URLSearchParams) => { type: string; uid?: string; name: string }; activity?: 'read' | 'export' }> = [
  { pattern: /^\/api\/sessions\/([^/]+)\/candidate\/download$/, resource: (match, query) => ({ type: 'Candidate export', uid: match[1], name: `Candidate ${query.get('format') ?? ''} of session ${match[1]}`.replace('  ', ' ') }) },
  { pattern: /^\/api\/sessions\/([^/]+)\/delivery\/download$/, resource: match => ({ type: 'Delivery bundle', uid: match[1], name: `Delivery bundle of session ${match[1]}` }) },
  { pattern: /^\/api\/ploeg\/deliveries$/, resource: (_match, query) => ({ type: 'Delivery ledger', name: `Delivery ledger (${query.get('window') ?? '7d'}, ${query.get('format') ?? 'json'})` }) },
  { pattern: /^\/api\/admin\/flags\/export$/, resource: () => ({ type: 'Feature flag rules', name: 'Feature flag rules' }) },
  { pattern: /^\/api\/linked-sessions\/([^/]+)\/agent-trace$/, resource: match => ({ type: 'Agent Trace records', uid: match[1], name: `Agent Trace records of Linked Session ${match[1]}` }) },
  { pattern: /^\/api\/admin\/audit$/, resource: (_match, query) => ({ type: 'Audit records', ...(query.get('tenant') ? { uid: query.get('tenant')! } : {}), name: `Audit records${query.get('tenant') ? ` of Tenant ${query.get('tenant')}` : ''}` }) },
  { pattern: /^\/api\/admin\/tenant-exports\/([^/]+)\/download$/, resource: match => ({ type: 'Tenant export', uid: match[1], name: `Tenant export ${match[1]}` }) },
  { pattern: /^\/api\/billing\/lines$/, resource: (_match, query) => ({ type: 'Billing lines', name: `Billing lines (${query.get('format') ?? 'csv'})` }) },
  { pattern: /^\/api\/ploeg\/cost-export$/, resource: (_match, query) => ({ type: 'FOCUS cost export', name: `FOCUS cost export (${query.get('format') ?? 'csv'})` }) },
];

type EntityRule = { method: string; pattern: RegExp; entity: string; action: 'create' | 'update' | 'delete' | 'deactivate'; change?: string; tenant?: 'body' | 'query'; owner?: true };

const entityRules: readonly EntityRule[] = [
  { method: 'POST', pattern: /^\/api\/admin\/webhooks$/, entity: 'Webhook subscription', action: 'create', tenant: 'body' },
  { method: 'PATCH', pattern: /^\/api\/admin\/webhooks\/([^/]+)$/, entity: 'Webhook subscription', action: 'update' },
  { method: 'DELETE', pattern: /^\/api\/admin\/webhooks\/([^/]+)$/, entity: 'Webhook subscription', action: 'delete' },
  { method: 'POST', pattern: /^\/api\/admin\/webhooks\/([^/]+)\/rotate-secret$/, entity: 'Webhook subscription', action: 'update', change: 'secret_rotated' },
  { method: 'POST', pattern: /^\/api\/intake\/sources$/, entity: 'Intake source', action: 'create', tenant: 'body' },
  { method: 'DELETE', pattern: /^\/api\/intake\/sources\/([^/]+)$/, entity: 'Intake source', action: 'delete' },
  { method: 'POST', pattern: /^\/api\/intake\/sources\/([^/]+)\/secret$/, entity: 'Intake source', action: 'update', change: 'secret_replaced' },
  { method: 'PUT', pattern: /^\/api\/billing\/mappings$/, entity: 'Billing mapping', action: 'update', tenant: 'body', owner: true },
  { method: 'DELETE', pattern: /^\/api\/billing\/mappings$/, entity: 'Billing mapping', action: 'delete', tenant: 'query', owner: true },
  { method: 'POST', pattern: /^\/api\/billing\/lines\/([^/]+)\/send$/, entity: 'Billing line', action: 'update', change: 'sent_again' },
  { method: 'POST', pattern: /^\/api\/billing\/lines\/([^/]+)\/found$/, entity: 'Billing line', action: 'update', change: 'marked_found' },
  { method: 'POST', pattern: /^\/api\/billing\/lines\/([^/]+)\/price$/, entity: 'Billing line', action: 'update', change: 'priced' },
  { method: 'POST', pattern: /^\/api\/billing\/lines\/([^/]+)\/reverse$/, entity: 'Billing line', action: 'deactivate', change: 'reversed' },
  { method: 'DELETE', pattern: /^\/api\/admin\/tenant-exports\/([^/]+)$/, entity: 'Tenant export', action: 'delete' },
];

function namedTenant(request: TapRequest, from: 'body' | 'query'): string[] | undefined {
  if (outcome(request.status) !== 'success') return undefined;
  const value = from === 'body' ? request.inputs().tenant : request.query.get('tenant');
  if (value === undefined || value === null || value === '') return [defaultTenant];
  return validTenancyId(value) ? [value] : undefined;
}

function entityChange(request: TapRequest, user: User): Captured | undefined {
  for (const rule of entityRules) {
    if (rule.method !== request.method) continue;
    const match = rule.pattern.exec(request.path);
    if (!match) continue;
    const named = (field: string) => text(rule.tenant === 'body' ? request.inputs()[field] : request.query.get(field), 100);
    const owner = rule.owner ? [named('tenant') ?? defaultTenant, named('client')].filter(Boolean).join('/') : undefined;
    const uid = match[1] ?? owner;
    const data = rule.change ? { change: rule.change } : undefined;
    const tenants = rule.tenant ? namedTenant(request, rule.tenant) : undefined;
    return { actor: user, ...(tenants ? { tenants } : {}), fact: { kind: 'entity', action: rule.action, entity: { type: rule.entity, ...(uid ? { uid } : {}), ...(data ? { data } : {}) }, outcome: outcome(request.status), ...(reason(request.status) ? { reason: reason(request.status) } : {}) } };
  }
  return undefined;
}

/**
 * The security-relevant fact one finished request carries, or undefined. Sign-in, sign-out, credentials, linked
 * accounts, feature flags and Client Sign-off map to their own OCSF classes; downloads to Web Resources Activity; every
 * other Action (system ADR-0037) to API Activity. Requests nobody was signed in for are left out, except sign-ins.
 */
export function capture(request: TapRequest): Captured | undefined {
  const { method, path, status } = request;
  const done = outcome(status);
  if (method === 'POST' && path === '/api/login') {
    const name = text(request.inputs().name, 100);
    const user = name ? request.userByName(name) : undefined;
    return { fact: { kind: 'sign_in', method: 'password', user: user ? person(user) : name ? { name } : {}, outcome: done, ...(done === 'failure' ? { reason: status === 404 ? 'local_login_off' : reason(status) } : {}) }, ...(user && done === 'success' ? { actor: user } : {}) };
  }
  if (method === 'GET' && path === '/api/auth/oidc/callback') {
    const failed = queryCode(request.location, 'login_error');
    const user = failed ? undefined : request.signedInByResponse();
    if (!failed && !user) return undefined;
    return { fact: { kind: 'sign_in', method: 'oidc', user: person(user), outcome: failed ? 'failure' : 'success', ...(failed ? { reason: failed } : {}) }, ...(user ? { actor: user } : {}) };
  }
  if (readsUserFirst(method, path)) {
    if (!request.before || done === 'failure') return undefined;
    return { fact: { kind: 'sign_out', user: person(request.before), credential: request.scope === 'editor' ? 'editor' : 'browser' }, actor: request.before };
  }
  const download = method === 'GET' ? downloads.map(entry => ({ entry, match: entry.pattern.exec(path) })).find(found => found.match) : undefined;
  if (method === 'GET' && !download) return undefined;
  if (method !== 'GET' && !isAction(method, path)) return undefined;
  const user = request.user();
  if (!user || status === 401) return undefined;
  if (download) return { actor: user, fact: { kind: 'download', activity: download.entry.activity ?? 'export', resource: download.entry.resource(download.match!, request.query), outcome: done, ...(reason(status) ? { reason: reason(status) } : {}) } };
  const editorDecision = /^\/api\/editor-requests\/([A-Za-z0-9_-]{8,32})\/(approve|deny)$/.exec(path);
  if (method === 'POST' && editorDecision) {
    const label = request.editorLabel(editorDecision[1], user);
    return { actor: user, fact: { kind: 'credential', credential: 'editor', action: editorDecision[2] === 'approve' ? 'issue' : 'deny', user: person(user), ...(label ? { name: label } : {}), outcome: done, ...(reason(status) ? { reason: reason(status) } : {}) } };
  }
  const editorCredential = /^\/api\/editor-credentials\/([a-f0-9]{24})$/.exec(path);
  if (method === 'DELETE' && editorCredential) return { actor: user, fact: { kind: 'credential', credential: 'editor', action: 'revoke', user: person(user), uid: editorCredential[1], outcome: done, ...(reason(status) ? { reason: reason(status) } : {}) } };
  if (method === 'POST' && path === '/api/agent-host/tokens') return { actor: user, fact: { kind: 'credential', credential: 'agents_window', action: 'issue', user: person(user), name: text(request.inputs().label, 80) ?? 'agent host', outcome: done, ...(reason(status) ? { reason: reason(status) } : {}) } };
  const agentToken = /^\/api\/agent-host\/tokens\/([0-9a-f]{64})$/.exec(path);
  if (method === 'DELETE' && agentToken) return { actor: user, fact: { kind: 'credential', credential: 'agents_window', action: 'revoke', user: person(user), uid: agentToken[1], outcome: done, ...(reason(status) ? { reason: reason(status) } : {}) } };
  const link = /^\/api\/links\/([a-z][a-z0-9-]{0,63})$/.exec(path);
  if (link && isLinkProvider(link[1]) && (method === 'PUT' || method === 'DELETE')) {
    const failed = reason(status);
    return { actor: user, fact: { kind: 'credential', credential: 'linked_account', action: method === 'DELETE' ? 'revoke' : 'issue', user: person(user), name: linkProviderLabel(link[1]), outcome: failed ? 'failure' : 'success', ...(failed ? { reason: failed } : {}) } };
  }
  const flag = /^\/api\/admin\/flags\/([a-z][a-z0-9.-]{2,100})\/(override|rollout)$/.exec(path);
  if (method === 'PUT' && flag) {
    const inputs = recordedInputs(request.inputs()) as Record<string, unknown>;
    const data = flag[2] === 'override' ? { change: inputs.variant === null ? 'override_cleared' : 'override_set', variant: inputs.variant ?? null, reason: inputs.reason ?? '' } : { change: inputs.rollout === null || inputs.rollout === undefined ? 'rollout_cleared' : 'rollout_set', reason: inputs.reason ?? '' };
    return { actor: user, fact: { kind: 'entity', action: 'update', entity: { type: 'Feature flag', uid: flag[1], data }, outcome: done, ...(reason(status) ? { reason: reason(status) } : {}) } };
  }
  const segment = /^\/api\/admin\/flag-segments\/([a-z][a-z0-9-]{0,63})$/.exec(path);
  if (segment && (method === 'PUT' || method === 'DELETE')) return { actor: user, fact: { kind: 'entity', action: method === 'PUT' ? 'update' : 'delete', entity: { type: 'Feature flag segment', uid: segment[1] }, outcome: done, ...(reason(status) ? { reason: reason(status) } : {}) } };
  const signOff = /^\/api\/ploeg\/work-items\/([^/]+)\/client-sign-off(\/withdraw)?$/.exec(path);
  if (method === 'POST' && signOff) {
    const inputs = recordedInputs(request.inputs()) as Record<string, unknown>;
    return { actor: user, target: { kind: 'work-item', id: signOff[1] }, fact: { kind: 'entity', action: signOff[2] ? 'deactivate' : 'create', entity: { type: 'Client Sign-off', uid: signOff[1], name: `Client Sign-off on Work Item ${signOff[1]}`, ...(signOff[2] ? {} : { data: { answer: inputs.answer ?? null } }) }, outcome: done, ...(reason(status) ? { reason: reason(status) } : {}) } };
  }
  if (method === 'PUT' && path === '/api/client-sign-off/exclusions') {
    const repository = text(request.inputs().repository, 300);
    return { actor: user, fact: { kind: 'entity', action: 'update', entity: { type: 'Client Sign-off exclusions', ...(repository ? { uid: repository } : {}), name: `Client Sign-off exclusions${repository ? ` of ${repository}` : ''}` }, outcome: done, ...(reason(status) ? { reason: reason(status) } : {}) } };
  }
  if (method === 'POST' && path === '/api/admin/tenant-exports') {
    const tenant = text(request.inputs().tenant, 100) ?? defaultTenant;
    const tenants = namedTenant(request, 'body');
    return { actor: user, ...(tenants ? { tenants } : {}), fact: { kind: 'download', activity: 'export', resource: { type: 'Tenant export', name: `Tenant export of Tenant ${tenant}` }, outcome: done, ...(reason(status) ? { reason: reason(status) } : {}) } };
  }
  const changed = method === 'GET' ? undefined : entityChange(request, user);
  if (changed) return changed;
  if (method === 'GET') return undefined;
  const { action, target } = describeAction(method, path);
  const inputs = recordedInputs({ ...request.inputs(), ...(request.query.size ? { query: Object.fromEntries(request.query) } : {}) }) as Record<string, unknown>;
  return { actor: user, target, fact: { kind: 'api', service: 'unfold-api', operation: action, method, status, outcome: done, target, inputs } };
}
