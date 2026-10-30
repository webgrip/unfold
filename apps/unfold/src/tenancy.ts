import type { UserRole } from './types.ts';

/** The Access Roles a Tenant membership carries, lowest first (system ADR-0017, glossary "Access Role"). */
export const accessRoles = ['viewer', 'developer', 'admin'] as const;
export type AccessRole = typeof accessRoles[number];
/** A person's membership of one Tenant with one Access Role in it. */
export type TenantMembership = { kind: 'tenant'; tenant: string; role: AccessRole };
/** A person's Client membership: they act for one Client inside one Tenant. */
export type ClientMembership = { kind: 'client'; tenant: string; client: string };
export type Membership = TenantMembership | ClientMembership;

/** The Tenant every install has, which local password accounts and the demo belong to. */
export const defaultTenant = 'default';
/** Every SSO group that carries a membership starts with this. */
export const membershipGroupPrefix = 'unfold/';

const groupRoles: Readonly<Record<string, AccessRole>> = { viewer: 'viewer', member: 'developer', admin: 'admin' };
const accountRoles: Readonly<Record<UserRole, AccessRole>> = { viewer: 'viewer', operator: 'developer', admin: 'admin' };
const slug = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const maxGroupLength = 200;

/** Whether `value` is a valid Tenant or Client id: lower-case letters, digits and inner hyphens, at most 63 characters. */
export function validTenancyId(value: unknown): value is string {
  return typeof value === 'string' && slug.test(value);
}

/** The membership one SSO group grants: `unfold/<tenant>/<viewer|member|admin>` or `unfold/<tenant>/client/<client>`. Undefined for any other group. */
export function membershipFromGroup(group: unknown): Membership | undefined {
  if (typeof group !== 'string' || group.length > maxGroupLength || !group.startsWith(membershipGroupPrefix)) return undefined;
  const parts = group.slice(membershipGroupPrefix.length).split('/');
  if (!validTenancyId(parts[0])) return undefined;
  if (parts.length === 2 && Object.hasOwn(groupRoles, parts[1])) return { kind: 'tenant', tenant: parts[0], role: groupRoles[parts[1]] };
  if (parts.length === 3 && parts[1] === 'client' && validTenancyId(parts[2])) return { kind: 'client', tenant: parts[0], client: parts[2] };
  return undefined;
}

/**
 * The memberships a list of SSO groups grants, sorted and without duplicates. A Tenant named by several role groups
 * keeps the highest of them. Anything that is not a well-formed membership group is ignored.
 */
export function membershipsFromGroups(groups: unknown): Membership[] {
  if (!Array.isArray(groups)) return [];
  return canonical(groups.map(membershipFromGroup));
}

/** The memberships a local password account or the demo account holds: its role in the default Tenant. */
export function defaultMemberships(role: UserRole): Membership[] {
  return [{ kind: 'tenant', tenant: defaultTenant, role: accountRoles[role] }];
}

/**
 * The memberships a credential acting with `role` keeps from two sets it must satisfy at once, such as what the
 * account held when the credential was minted and what it holds now: a Tenant held in both, at the lowest of the two
 * roles and of the Access Role `role` maps to, and a Client membership held in both. Never more than either set.
 */
export function narrowedMemberships(held: readonly Membership[], allowed: readonly Membership[], role: UserRole): Membership[] {
  const rank = (value: AccessRole) => accessRoles.indexOf(value);
  const cap = rank(accountRoles[role]);
  return canonical(held.map(entry => {
    if (entry.kind === 'client') return allowed.some(other => other.kind === 'client' && other.tenant === entry.tenant && other.client === entry.client) ? entry : undefined;
    const other = allowed.find((candidate): candidate is TenantMembership => candidate.kind === 'tenant' && candidate.tenant === entry.tenant);
    return other ? { kind: 'tenant', tenant: entry.tenant, role: accessRoles[Math.min(rank(entry.role), rank(other.role), cap)] } : undefined;
  }));
}

/** Stored memberships read back: each well-formed entry, sorted and without duplicates; undefined when `value` is no list. */
export function storedMemberships(value: unknown): Membership[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return canonical(value.map(entry => {
    if (!entry || typeof entry !== 'object') return undefined;
    const item = entry as Record<string, unknown>;
    if (item.kind === 'tenant' && validTenancyId(item.tenant) && accessRoles.includes(item.role as AccessRole)) return { kind: 'tenant', tenant: item.tenant, role: item.role as AccessRole };
    if (item.kind === 'client' && validTenancyId(item.tenant) && validTenancyId(item.client)) return { kind: 'client', tenant: item.tenant, client: item.client };
    return undefined;
  }));
}

function canonical(items: Array<Membership | undefined>): Membership[] {
  const tenants = new Map<string, AccessRole>();
  const clients = new Map<string, ClientMembership>();
  for (const item of items) {
    if (item?.kind === 'tenant') {
      const held = tenants.get(item.tenant);
      if (!held || accessRoles.indexOf(item.role) > accessRoles.indexOf(held)) tenants.set(item.tenant, item.role);
    } else if (item?.kind === 'client') clients.set(`${item.tenant}/${item.client}`, item);
  }
  const byName = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  return [
    ...[...tenants].sort(([left], [right]) => byName(left, right)).map(([tenant, role]): TenantMembership => ({ kind: 'tenant', tenant, role })),
    ...[...clients.values()].sort((left, right) => byName(left.tenant, right.tenant) || byName(left.client, right.client)),
  ];
}

/** Who owns a configured repository or task source: one Tenant, and within it at most one Client (system ADR-0017). */
export type Ownership = { tenant: string; client?: string };

/** The owner `entry` names: its `tenant`, or the default Tenant when it names none, and its `client` when it names one. */
export function ownership(entry: { tenant?: string; client?: string }): Ownership {
  return { tenant: entry.tenant ?? defaultTenant, ...(entry.client !== undefined ? { client: entry.client } : {}) };
}

/** Whether two owners are the same Tenant with the same Client, or the same Tenant with no Client. */
export function sameOwnership(left: Ownership, right: Ownership): boolean {
  return left.tenant === right.tenant && left.client === right.client;
}

/** An owner in words for configuration errors, such as `Tenant default` or `Tenant agency, Client acme`. */
export function describeOwnership(owner: Ownership): string {
  return owner.client === undefined ? `Tenant ${owner.tenant}` : `Tenant ${owner.tenant}, Client ${owner.client}`;
}

/**
 * The optional `tenant` and `client` of a configuration entry, checked: each, when present, is a Tenant or Client id.
 * Throws an error that starts with `label` otherwise. Only the fields the entry sets are returned.
 */
export function configuredOwnership(entry: Record<string, unknown>, label: string): { tenant?: string; client?: string } {
  for (const key of ['tenant', 'client'] as const) if (entry[key] !== undefined && !validTenancyId(entry[key])) throw new Error(`${label} ${key} must be lower-case letters, digits and inner hyphens, at most 63 characters`);
  return { ...(entry.tenant !== undefined ? { tenant: entry.tenant as string } : {}), ...(entry.client !== undefined ? { client: entry.client as string } : {}) };
}

/**
 * The instance-qualified key of a repository URL: its forge host and its `owner/name` path, lower-cased and without
 * `.git`, so the HTTPS and SSH URLs of one repository share a key. A local path keys by the path itself.
 */
export function repositoryKey(url: string): string {
  const scp = /^[A-Za-z0-9._-]+@([A-Za-z0-9.-]+):(?!\/)(.+)$/.exec(url);
  let host: string;
  let path: string;
  if (scp) { host = scp[1]; path = scp[2]; }
  else {
    let parsed: URL;
    try { parsed = new URL(url); } catch { return `path:${url.replace(/\/+$/, '')}`; }
    if (parsed.protocol === 'file:') return `path:${decodeURIComponent(parsed.pathname).replace(/\/+$/, '')}`;
    host = parsed.hostname;
    path = decodeURIComponent(parsed.pathname);
  }
  return `${host.toLowerCase()}/${path.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '').toLowerCase()}`;
}
