import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Store } from '../store.ts';
import { entitledRole, subjectUserId, type OidcSettings } from '../oidc.ts';
import { membershipsFromGroups } from '../tenancy.ts';
import type { UserRole } from '../types.ts';
import type { IdentityAccounts, ScimGroupRecord, ScimUserRecord } from './accounts.ts';
import type { ScimSettings } from './settings.ts';

/** Where the SCIM service provider is served. */
export const scimBase = '/scim/v2';

const userSchema = 'urn:ietf:params:scim:schemas:core:2.0:User';
const groupSchema = 'urn:ietf:params:scim:schemas:core:2.0:Group';
const listSchema = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const errorSchema = 'urn:ietf:params:scim:api:messages:2.0:Error';
const patchSchema = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
const configSchema = 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig';
const resourceTypeSchema = 'urn:ietf:params:scim:schemas:core:2.0:ResourceType';
const schemaSchema = 'urn:ietf:params:scim:schemas:core:2.0:Schema';
const maxBodyBytes = 1_048_576;
const defaultCount = 100;
const maxCount = 200;
const maxText = 256;
const maxGroupMembers = 10_000;

/** What one SCIM request changed for a person, for the Action Record and the revocation. */
export type ScimEffect = { userId: string; change: 'provisioned' | 'updated' | 'deactivated' | 'reactivated' | 'deleted' | 'memberships' | 'reauthenticate'; detail?: Record<string, unknown> };

/** What the SCIM service provider needs from the rest of Unfold. */
export type ScimDependencies = {
  accounts: IdentityAccounts;
  store: Store;
  oidc: Pick<OidcSettings, 'issuer' | 'subjectNamespace' | 'roleClaim' | 'groupsClaim' | 'roles'>;
  settings: ScimSettings;
  /** Ends every credential of one person and records why. */
  revoke(userId: string, cause: string): void;
  /** Records what changed for a person. */
  effect(effect: ScimEffect): void;
  /** The absolute URL the SCIM base is served at, for `meta.location`. */
  location: string;
};

/** What a SCIM request was about, once it is known, for the Action Record. */
export type ScimTarget = { kind: 'person' | 'group'; id: string };

class ScimError extends Error {
  readonly status: number;
  readonly scimType: string | undefined;
  constructor(status: number, detail: string, scimType?: string) { super(detail); this.status = status; this.scimType = scimType; }
}

const fail = (status: number, detail: string, scimType?: string): never => { throw new ScimError(status, detail, scimType); };

function send(res: ServerResponse, status: number, value?: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/scim+json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(value === undefined ? undefined : JSON.stringify(value));
}

function digest(value: string): Buffer { return createHash('sha256').update(value).digest(); }

function pathSegment(raw: string): string {
  try { return decodeURIComponent(raw); } catch { return raw; }
}

/** Whether `req` carries `Authorization: Bearer <token>` with the token `tokenEnv` names, compared in constant time. */
export function scimAuthorized(req: IncomingMessage, tokenEnv: string): boolean {
  const expected = process.env[tokenEnv];
  const header = req.headers.authorization;
  if (!expected || typeof header !== 'string' || !/^Bearer [!-~]{1,4096}$/i.test(header)) return false;
  return timingSafeEqual(digest(header.slice(7)), digest(expected));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const type = req.headers['content-type'] ?? '';
  if (!/^application\/(?:scim\+)?json\b/i.test(type)) fail(415, 'Send application/scim+json.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) fail(413, 'The request is larger than 1 MiB.', 'tooMany');
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch {}
  return fail(400, 'The body is not a JSON object.', 'invalidSyntax');
}

function text(value: unknown, label: string, required: boolean): string | null {
  if (value === undefined || value === null || value === '') return required ? fail(400, `${label} is required.`, 'invalidValue') : null;
  if (typeof value !== 'string' || value.length > maxText || /[\u0000-\u001f\u007f]/.test(value)) return fail(400, `${label} must be text of at most ${maxText} characters.`, 'invalidValue');
  return value;
}

function bool(value: unknown, label: string): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string' && /^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  return fail(400, `${label} must be true or false.`, 'invalidValue');
}

function emailsOf(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 20) return fail(400, 'emails must be a list of at most 20 addresses.', 'invalidValue');
  const entries = value.map(entry => {
    const address = typeof entry === 'string' ? entry : (entry as { value?: unknown })?.value;
    if (typeof address !== 'string' || !/^[^\s@]{1,200}@[^\s@]{1,200}$/.test(address)) return fail(400, 'Each email needs a value that is an address.', 'invalidValue');
    return { address: address.toLowerCase(), primary: typeof entry === 'object' && entry !== null && bool((entry as { primary?: unknown }).primary ?? false, 'emails.primary') };
  });
  return [...new Set([...entries.filter(entry => entry.primary), ...entries.filter(entry => !entry.primary)].map(entry => entry.address))];
}

type UserFields = { userName: string; externalId: string | null; displayName: string | null; emails: string[]; active: boolean };

function userFields(data: Record<string, unknown>, base?: UserFields): UserFields {
  const read = (key: string) => Object.entries(data).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1];
  const name = read('name') as { formatted?: unknown; givenName?: unknown; familyName?: unknown } | undefined;
  const composed = name && typeof name === 'object' ? (typeof name.formatted === 'string' ? name.formatted : [name.givenName, name.familyName].filter(part => typeof part === 'string' && part).join(' ')) : '';
  const displayName = read('displayName') !== undefined ? text(read('displayName'), 'displayName', false) : composed ? text(composed, 'name', false) : base?.displayName ?? null;
  return {
    userName: read('userName') !== undefined ? text(read('userName'), 'userName', true)! : base?.userName ?? text(undefined, 'userName', true)!,
    externalId: read('externalId') !== undefined ? text(read('externalId'), 'externalId', false) : base?.externalId ?? null,
    displayName,
    emails: read('emails') !== undefined ? emailsOf(read('emails')) : base?.emails ?? [],
    active: read('active') !== undefined ? bool(read('active'), 'active') : base?.active ?? true,
  };
}

/** One SCIM filter Unfold supports: an attribute equal to a value. */
export type ScimFilter = { field: string; value: string };

/**
 * Reads a SCIM `filter` of the one form Unfold supports, `<attribute> eq "<value>"`, where `fields` maps each
 * lower-cased attribute to the field it filters. Undefined without a filter; anything else throws a 400
 * `invalidFilter` error.
 */
export function parseFilter(raw: string | null, fields: Record<string, string>): ScimFilter | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const match = /^\s*([A-Za-z][\w.$:-]*)\s+eq\s+"((?:[^"\\]|\\.){0,512})"\s*$/i.exec(raw);
  const field = match && Object.hasOwn(fields, match[1].toLowerCase()) ? fields[match[1].toLowerCase()] : undefined;
  if (!match || !field) return fail(400, `Only "<attribute> eq \\"value\\"" filters on ${Object.keys(fields).join(', ')} are supported.`, 'invalidFilter');
  return { field, value: match[2].replace(/\\(.)/g, '$1') };
}

function page(url: URL): { offset: number; limit: number; startIndex: number } {
  const start = Number(url.searchParams.get('startIndex') ?? 1);
  const count = Number(url.searchParams.get('count') ?? defaultCount);
  const startIndex = Number.isInteger(start) && start >= 1 ? start : 1;
  const limit = Number.isInteger(count) && count >= 0 ? Math.min(count, maxCount) : defaultCount;
  return { offset: startIndex - 1, limit, startIndex };
}

function list(resources: unknown[], total: number, startIndex: number) {
  return { schemas: [listSchema], totalResults: total, startIndex, itemsPerPage: resources.length, Resources: resources };
}

/** One PATCH operation as RFC 7644 section 3.5.2 describes it, with `op` lower-cased because Entra ID capitalises it. */
type Operation = { op: 'add' | 'replace' | 'remove'; path?: string; value?: unknown };

function operations(data: Record<string, unknown>): Operation[] {
  if (!Array.isArray(data.schemas) || !data.schemas.includes(patchSchema)) fail(400, `A PATCH body names the ${patchSchema} schema.`, 'invalidSyntax');
  const list = data.Operations ?? data.operations;
  if (!Array.isArray(list) || !list.length || list.length > 1000) return fail(400, 'Operations must list one to 1000 operations.', 'invalidSyntax');
  return list.map(entry => {
    const op = typeof entry?.op === 'string' ? entry.op.toLowerCase() : '';
    if (op !== 'add' && op !== 'replace' && op !== 'remove') return fail(400, 'Each operation is add, replace or remove.', 'invalidSyntax');
    if (entry.path !== undefined && (typeof entry.path !== 'string' || entry.path.length > 512)) return fail(400, 'An operation path must be text.', 'invalidPath');
    return { op, ...(entry.path !== undefined ? { path: entry.path } : {}), ...(entry.value !== undefined ? { value: entry.value } : {}) };
  });
}

const userAttributes: Record<string, string> = { username: 'userName', externalid: 'externalId', displayname: 'displayName', active: 'active', emails: 'emails', 'name.formatted': 'name', 'name.givenname': 'name', 'name.familyname': 'name' };

/**
 * A SCIM 2.0 service provider (RFC 7643, RFC 7644) for Users and Groups. A User names an Unfold account through the
 * attribute `linkBy` chooses; a Group's display name grants the membership `unfold/<tenant>/<role>` or
 * `unfold/<tenant>/client/<client>` names, and a Group named in the sign-in role lists sets the account's role.
 * Deactivating or deleting a User turns its account off and ends every credential it holds; a Group change applies
 * to the members' memberships at once.
 */
export class ScimService {
  private readonly deps: ScimDependencies;
  constructor(deps: ScimDependencies) { this.deps = deps; }

  /** Serves one request under `scimBase`; `target` learns what it was about. Errors are SCIM Error responses. */
  async handle(req: IncomingMessage, res: ServerResponse, url: URL, target: (value: ScimTarget) => void): Promise<void> {
    try {
      if (!scimAuthorized(req, this.deps.settings.tokenEnv)) fail(401, 'Send the SCIM bearer token this workbench was given.');
      await this.route(req, res, url, target);
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      const known = error instanceof ScimError ? error : new ScimError(500, 'Unfold hit a fault of its own and did not finish the provisioning request. Your identity provider retries it; if it keeps failing, report a problem to the Unfold administrator.');
      if (!(error instanceof ScimError)) console.error(JSON.stringify({ level: 'error', event: 'scim.failed', message: String((error as Error)?.message).slice(0, 200) }));
      send(res, known.status, { schemas: [errorSchema], status: String(known.status), ...(known.scimType ? { scimType: known.scimType } : {}), detail: known.message }, known.status === 401 ? { 'WWW-Authenticate': 'Bearer realm="scim"' } : {});
    }
  }

  private async route(req: IncomingMessage, res: ServerResponse, url: URL, target: (value: ScimTarget) => void): Promise<void> {
    const method = req.method ?? 'GET';
    const path = url.pathname.slice(scimBase.length) || '/';
    const resource = /^\/(Users|Groups)(?:\/([A-Za-z0-9-]{1,64}))?$/.exec(path);
    if (method === 'GET' && path === '/ServiceProviderConfig') return send(res, 200, this.serviceProviderConfig());
    if (method === 'GET' && path === '/ResourceTypes') return send(res, 200, list(this.resourceTypes(), 2, 1));
    const resourceType = /^\/ResourceTypes\/(User|Group)$/.exec(path);
    if (method === 'GET' && resourceType) return send(res, 200, this.resourceTypes().find(item => item.id === resourceType[1]));
    if (method === 'GET' && path === '/Schemas') return send(res, 200, list(schemas(), 2, 1));
    const schemaPath = /^\/Schemas\/(.+)$/.exec(path);
    if (method === 'GET' && schemaPath) return send(res, 200, schemas().find(item => item.id === pathSegment(schemaPath[1])) ?? fail(404, 'No such schema.'));
    if (!resource) return fail(404, 'No such resource.');
    const [, kind, id] = resource;
    if (kind === 'Users') {
      if (id) target({ kind: 'person', id: this.deps.accounts.user(id)?.userId ?? id });
      if (method === 'GET' && !id) return this.listUsers(res, url);
      if (method === 'POST' && !id) { const user = this.createUser(await readJson(req)); target({ kind: 'person', id: user.userId ?? user.id }); return send(res, 201, this.userView(user), { Location: this.where('Users', user.id), ETag: `W/"${user.version}"` }); }
      if (!id) return fail(405, 'Use GET or POST on /Users.');
      const existing = this.deps.accounts.user(id) ?? fail(404, `User ${id} not found.`);
      if (method === 'GET') return send(res, 200, this.userView(existing), { ETag: `W/"${existing.version}"` });
      if (method === 'PUT') return this.sendUser(res, this.writeUser(existing, userFields(await readJson(req))));
      if (method === 'PATCH') return this.sendUser(res, this.patchUser(existing, operations(await readJson(req))));
      if (method === 'DELETE') { this.deleteUser(existing); return send(res, 204); }
      return fail(405, 'Use GET, PUT, PATCH or DELETE on a User.');
    }
    if (id) target({ kind: 'group', id });
    if (method === 'GET' && !id) return this.listGroups(res, url);
    if (method === 'POST' && !id) { const group = this.createGroup(await readJson(req)); target({ kind: 'group', id: group.id }); return send(res, 201, this.groupView(group, url), { Location: this.where('Groups', group.id), ETag: `W/"${group.version}"` }); }
    if (!id) return fail(405, 'Use GET or POST on /Groups.');
    const group = this.deps.accounts.group(id) ?? fail(404, `Group ${id} not found.`);
    if (method === 'GET') return send(res, 200, this.groupView(group, url), { ETag: `W/"${group.version}"` });
    if (method === 'PUT') return this.sendGroup(res, url, this.writeGroup(group, await readJson(req)));
    if (method === 'PATCH') return this.sendGroup(res, url, this.patchGroup(group, operations(await readJson(req))));
    if (method === 'DELETE') { this.deleteGroup(group); return send(res, 204); }
    return fail(405, 'Use GET, PUT, PATCH or DELETE on a Group.');
  }

  private where(kind: 'Users' | 'Groups', id: string): string { return `${this.deps.location}/${kind}/${id}`; }

  private sendUser(res: ServerResponse, user: ScimUserRecord): void { send(res, 200, this.userView(user), { ETag: `W/"${user.version}"` }); }
  private sendGroup(res: ServerResponse, url: URL, group: ScimGroupRecord): void { send(res, 200, this.groupView(group, url), { ETag: `W/"${group.version}"` }); }

  private listUsers(res: ServerResponse, url: URL): void {
    const filter = parseFilter(url.searchParams.get('filter'), { username: 'userName', externalid: 'externalId', id: 'id', emails: 'email', 'emails.value': 'email' }) as { field: 'id' | 'userName' | 'externalId' | 'email'; value: string } | undefined;
    const { offset, limit, startIndex } = page(url);
    const found = this.deps.accounts.users(filter, offset, limit);
    send(res, 200, list(found.items.map(user => this.userView(user)), found.total, startIndex));
  }

  private listGroups(res: ServerResponse, url: URL): void {
    const filter = parseFilter(url.searchParams.get('filter'), { displayname: 'displayName', externalid: 'externalId', id: 'id' }) as { field: 'id' | 'displayName' | 'externalId'; value: string } | undefined;
    const { offset, limit, startIndex } = page(url);
    const found = this.deps.accounts.groups(filter, offset, limit);
    send(res, 200, list(found.items.map(group => this.groupView(group, url)), found.total, startIndex));
  }

  private linkedUserId(fields: UserFields): string | null {
    const { linkBy } = this.deps.settings;
    const namespace = this.deps.oidc.subjectNamespace ?? this.deps.oidc.issuer;
    if (linkBy === 'externalId') return subjectUserId(namespace, fields.externalId ?? fail(400, 'This workbench links SCIM Users to sign-in by externalId, which must carry the subject the identity provider signs people in with.', 'invalidValue'));
    if (linkBy === 'userName') return subjectUserId(namespace, fields.userName);
    const email = fields.emails[0] ?? (fields.userName.includes('@') ? fields.userName.toLowerCase() : undefined);
    return email ? this.deps.store.getUserByName(email)?.id ?? null : null;
  }

  private createUser(data: Record<string, unknown>): ScimUserRecord {
    const fields = userFields(data);
    if (this.deps.accounts.users({ field: 'userName', value: fields.userName }, 0, 1).total) fail(409, `A User named ${fields.userName} exists.`, 'uniqueness');
    const userId = this.linkedUserId(fields);
    if (userId && this.deps.accounts.usersOf(userId).length) fail(409, 'Another SCIM User already names this person.', 'uniqueness');
    const saved = this.deps.accounts.saveUser({ userId, ...fields, scimRole: null });
    this.applyAccount(saved, undefined);
    return saved;
  }

  private writeUser(existing: ScimUserRecord, fields: UserFields): ScimUserRecord {
    if (fields.userName.toLowerCase() !== existing.userName.toLowerCase()) {
      const holder = this.deps.accounts.users({ field: 'userName', value: fields.userName }, 0, 1).items[0];
      if (holder && holder.id !== existing.id) fail(409, `A User named ${fields.userName} exists.`, 'uniqueness');
    }
    let userId = existing.userId;
    const linkChanged = this.deps.settings.linkBy === 'externalId' ? fields.externalId !== existing.externalId : this.deps.settings.linkBy === 'userName' ? fields.userName !== existing.userName : false;
    if (linkChanged) fail(400, `${this.deps.settings.linkBy} links this User to its sign-in and cannot change.`, 'mutability');
    if (!userId) userId = this.linkedUserId(fields);
    const saved = this.deps.accounts.saveUser({ id: existing.id, userId, ...fields, scimRole: existing.scimRole });
    this.applyAccount(saved, existing);
    return saved;
  }

  private patchUser(existing: ScimUserRecord, ops: Operation[]): ScimUserRecord {
    const current: UserFields = { userName: existing.userName, externalId: existing.externalId, displayName: existing.displayName, emails: existing.emails, active: existing.active };
    let fields = current;
    for (const op of ops) {
      if (op.path === undefined) {
        if (op.op === 'remove') fail(400, 'A remove names a path.', 'noTarget');
        if (!op.value || typeof op.value !== 'object' || Array.isArray(op.value)) fail(400, 'An operation without a path carries an object.', 'invalidValue');
        fields = userFields(op.value as Record<string, unknown>, fields);
        continue;
      }
      const path = op.path.toLowerCase();
      const attribute = userAttributes[path] ?? (/^emails\[.*\](?:\.value)?$/.test(path) ? 'emails' : undefined);
      if (!attribute) continue;
      if (op.op === 'remove') {
        if (attribute === 'userName' || attribute === 'active') fail(400, `${attribute} cannot be removed.`, 'mutability');
        fields = { ...fields, ...(attribute === 'emails' ? { emails: [] } : attribute === 'name' ? {} : { [attribute]: null }) };
        continue;
      }
      if (attribute === 'name') { fields = userFields({ name: { [op.path.split('.')[1]]: op.value } }, fields); continue; }
      const value = attribute === 'emails' && !Array.isArray(op.value) && path !== 'emails' ? [{ value: op.value, primary: true }] : op.value;
      fields = userFields({ [attribute]: value }, fields);
    }
    return this.writeUser(existing, fields);
  }

  private deleteUser(existing: ScimUserRecord): void {
    const groups = this.deps.accounts.groupNamesOf(existing.id);
    this.deps.accounts.deleteUser(existing.id);
    if (!existing.userId) return;
    this.deps.accounts.disable(existing.userId, 'scim', 'SCIM deleted the User');
    if (groups.length && this.deps.store.getUser(existing.userId)) this.deps.store.setMemberships(existing.userId, []);
    this.deps.revoke(existing.userId, 'scim.user_deleted');
    this.deps.effect({ userId: existing.userId, change: 'deleted' });
  }

  /** Brings the Unfold account a User names in line with it: the account exists, and is on or off as `active` says. */
  private applyAccount(user: ScimUserRecord, before: ScimUserRecord | undefined): void {
    if (!user.userId) return;
    const userId = user.userId;
    const stored = this.deps.store.getUser(userId);
    if (!stored) this.deps.store.upsertUser({ id: userId, name: user.emails[0] ?? user.userName, role: 'viewer', passwordHash: '' });
    if (!user.active) {
      const wasOff = this.deps.accounts.disabled(userId)?.by === 'scim';
      this.deps.accounts.disable(userId, 'scim', 'SCIM set active to false');
      if (!wasOff) {
        this.deps.revoke(userId, 'scim.user_deactivated');
        this.deps.effect({ userId, change: 'deactivated' });
      }
      return;
    }
    const reactivated = this.deps.accounts.enable(userId, 'scim');
    this.deps.effect({ userId, change: reactivated ? 'reactivated' : before && before.userId ? 'updated' : 'provisioned' });
  }

  /** Sets a member's memberships and role from the Groups they are in, after a Group changed. */
  private applyGroups(memberId: string): void {
    const user = this.deps.accounts.user(memberId);
    if (!user?.userId) return;
    const stored = this.deps.store.getUser(user.userId);
    if (!stored) return;
    const names = this.deps.accounts.groupNamesOf(memberId);
    const memberships = membershipsFromGroups(names);
    this.deps.store.setMemberships(user.userId, memberships);
    const role: UserRole | undefined = entitledRole(this.deps.oidc, { [this.deps.oidc.groupsClaim]: names });
    if (role && role !== stored.role) this.deps.store.upsertUser({ id: stored.id, name: stored.name, role, passwordHash: stored.passwordHash });
    if (!role && user.scimRole !== null) this.deps.revoke(user.userId, 'scim.role_removed');
    if ((role ?? null) !== user.scimRole) this.deps.accounts.saveUser({ ...user, scimRole: role ?? null });
    this.deps.effect({ userId: user.userId, change: !role && user.scimRole !== null ? 'reauthenticate' : 'memberships', detail: { memberships, role: role ?? null } });
  }

  private members(value: unknown): string[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.length > maxGroupMembers) return fail(400, `members must be a list of at most ${maxGroupMembers} Users.`, 'invalidValue');
    return value.map(entry => {
      const id = typeof entry === 'string' ? entry : (entry as { value?: unknown })?.value;
      return typeof id === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(id) ? id : fail(400, 'Each member needs the value of a User id.', 'invalidValue');
    }).filter(id => this.deps.accounts.user(id) !== undefined);
  }

  private groupInput(data: Record<string, unknown>, base?: ScimGroupRecord): { displayName: string; externalId: string | null; members: string[] } {
    return {
      displayName: data.displayName !== undefined ? text(data.displayName, 'displayName', true)! : base?.displayName ?? text(undefined, 'displayName', true)!,
      externalId: data.externalId !== undefined ? text(data.externalId, 'externalId', false) : base?.externalId ?? null,
      members: data.members !== undefined ? this.members(data.members) : base?.members ?? [],
    };
  }

  private createGroup(data: Record<string, unknown>): ScimGroupRecord {
    const input = this.groupInput(data);
    if (this.deps.accounts.groups({ field: 'displayName', value: input.displayName }, 0, 1).total) fail(409, `A Group named ${input.displayName} exists.`, 'uniqueness');
    const saved = this.deps.accounts.saveGroup(input);
    for (const member of saved.members) this.applyGroups(member);
    return saved;
  }

  private writeGroup(existing: ScimGroupRecord, data: Record<string, unknown>): ScimGroupRecord {
    return this.saveGroup(existing, this.groupInput({ members: [], ...data }, existing));
  }

  private saveGroup(existing: ScimGroupRecord, input: { displayName: string; externalId: string | null; members: string[] }): ScimGroupRecord {
    if (input.displayName.toLowerCase() !== existing.displayName.toLowerCase()) {
      const holder = this.deps.accounts.groups({ field: 'displayName', value: input.displayName }, 0, 1).items[0];
      if (holder && holder.id !== existing.id) fail(409, `A Group named ${input.displayName} exists.`, 'uniqueness');
    }
    const saved = this.deps.accounts.saveGroup({ id: existing.id, ...input });
    const renamed = saved.displayName !== existing.displayName;
    const touched = renamed ? new Set([...existing.members, ...saved.members]) : new Set([...existing.members.filter(id => !saved.members.includes(id)), ...saved.members.filter(id => !existing.members.includes(id))]);
    for (const member of touched) this.applyGroups(member);
    return saved;
  }

  private patchGroup(existing: ScimGroupRecord, ops: Operation[]): ScimGroupRecord {
    let input = { displayName: existing.displayName, externalId: existing.externalId, members: [...existing.members] };
    for (const op of ops) {
      const path = op.path?.trim();
      const memberFilter = path ? /^members\[\s*value\s+eq\s+"([A-Za-z0-9-]{1,64})"\s*\]$/i.exec(path) : null;
      if (memberFilter) {
        if (op.op !== 'remove') fail(400, 'Only remove takes a member filter.', 'invalidPath');
        input = { ...input, members: input.members.filter(id => id !== memberFilter[1]) };
        continue;
      }
      if (path && path.toLowerCase() === 'members') {
        const listed = op.value === undefined ? [] : this.members(op.value);
        if (op.op === 'add') input = { ...input, members: [...new Set([...input.members, ...listed])] };
        else if (op.op === 'replace') input = { ...input, members: listed };
        else input = { ...input, members: op.value === undefined ? [] : input.members.filter(id => !listed.includes(id)) };
        continue;
      }
      if (path && /^(displayname|externalid)$/i.test(path)) {
        const key = path.toLowerCase() === 'displayname' ? 'displayName' : 'externalId';
        if (op.op === 'remove' && key === 'displayName') fail(400, 'displayName cannot be removed.', 'mutability');
        input = { ...input, ...this.groupInput({ [key]: op.op === 'remove' ? null : op.value }, { ...existing, ...input }) };
        continue;
      }
      if (path) fail(400, `Unfold keeps no Group attribute ${path}.`, 'invalidPath');
      if (op.op === 'remove' || !op.value || typeof op.value !== 'object' || Array.isArray(op.value)) fail(400, 'An operation without a path adds or replaces an object.', 'invalidValue');
      const value = op.value as Record<string, unknown>;
      const next = this.groupInput({ ...value, ...(value.members !== undefined && op.op === 'add' ? { members: [...input.members, ...this.members(value.members)] } : {}) }, { ...existing, ...input });
      input = { ...next, members: [...new Set(next.members)] };
    }
    return this.saveGroup(existing, input);
  }

  private deleteGroup(existing: ScimGroupRecord): void {
    this.deps.accounts.deleteGroup(existing.id);
    for (const member of existing.members) this.applyGroups(member);
  }

  private userView(user: ScimUserRecord) {
    const groups = this.deps.accounts.groups(undefined, 0, maxGroupMembers).items.filter(group => group.members.includes(user.id));
    return {
      schemas: [userSchema],
      id: user.id,
      ...(user.externalId !== null ? { externalId: user.externalId } : {}),
      userName: user.userName,
      ...(user.displayName !== null ? { displayName: user.displayName } : {}),
      active: user.active,
      emails: user.emails.map((value, index) => ({ value, primary: index === 0 })),
      groups: groups.map(group => ({ value: group.id, display: group.displayName, $ref: this.where('Groups', group.id) })),
      meta: { resourceType: 'User', created: user.createdAt, lastModified: user.updatedAt, location: this.where('Users', user.id), version: `W/"${user.version}"` },
    };
  }

  private groupView(group: ScimGroupRecord, url: URL) {
    const excluded = (url.searchParams.get('excludedAttributes') ?? '').toLowerCase().split(',').map(item => item.trim());
    return {
      schemas: [groupSchema],
      id: group.id,
      ...(group.externalId !== null ? { externalId: group.externalId } : {}),
      displayName: group.displayName,
      ...(excluded.includes('members') ? {} : { members: group.members.map(id => ({ value: id, display: this.deps.accounts.user(id)?.userName, $ref: this.where('Users', id) })) }),
      meta: { resourceType: 'Group', created: group.createdAt, lastModified: group.updatedAt, location: this.where('Groups', group.id), version: `W/"${group.version}"` },
    };
  }

  private serviceProviderConfig() {
    return {
      schemas: [configSchema],
      documentationUri: 'https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/docs/operations/provision-and-deprovision-people.md',
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: maxCount },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [{ type: 'oauthbearertoken', name: 'Bearer token', description: 'The static bearer token the workbench operator gave the identity provider.', primary: true }],
      meta: { resourceType: 'ServiceProviderConfig', location: `${this.deps.location}/ServiceProviderConfig` },
    };
  }

  private resourceTypes() {
    return [
      { schemas: [resourceTypeSchema], id: 'User', name: 'User', endpoint: '/Users', description: 'A person who signs in to Unfold', schema: userSchema, meta: { resourceType: 'ResourceType', location: `${this.deps.location}/ResourceTypes/User` } },
      { schemas: [resourceTypeSchema], id: 'Group', name: 'Group', endpoint: '/Groups', description: 'A group whose display name may grant an Unfold membership or role', schema: groupSchema, meta: { resourceType: 'ResourceType', location: `${this.deps.location}/ResourceTypes/Group` } },
    ];
  }
}

function attribute(name: string, type: string, extra: Record<string, unknown> = {}) {
  return { name, type, multiValued: false, required: false, caseExact: false, mutability: 'readWrite', returned: 'default', uniqueness: 'none', ...extra };
}

function schemas() {
  return [
    {
      schemas: [schemaSchema], id: userSchema, name: 'User', description: 'User Account',
      attributes: [
        attribute('userName', 'string', { required: true, uniqueness: 'server' }),
        attribute('displayName', 'string'),
        attribute('active', 'boolean'),
        attribute('emails', 'complex', { multiValued: true, subAttributes: [attribute('value', 'string'), attribute('primary', 'boolean')] }),
        attribute('groups', 'complex', { multiValued: true, mutability: 'readOnly', subAttributes: [attribute('value', 'string', { mutability: 'readOnly' }), attribute('display', 'string', { mutability: 'readOnly' })] }),
      ],
      meta: { resourceType: 'Schema', location: `${scimBase}/Schemas/${userSchema}` },
    },
    {
      schemas: [schemaSchema], id: groupSchema, name: 'Group', description: 'Group',
      attributes: [
        attribute('displayName', 'string', { required: true, uniqueness: 'server' }),
        attribute('members', 'complex', { multiValued: true, subAttributes: [attribute('value', 'string', { mutability: 'immutable' }), attribute('display', 'string', { mutability: 'readOnly' })] }),
      ],
      meta: { resourceType: 'Schema', location: `${scimBase}/Schemas/${groupSchema}` },
    },
  ];
}
