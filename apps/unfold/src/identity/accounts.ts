import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

/** Who turned an account off: SCIM provisioning or a Shared Signals event. */
export type DisabledBy = 'scim' | 'ssf';

/** A SCIM User as Unfold keeps it. `userId` is the Unfold account it names, or null until that person first signs in. */
export type ScimUserRecord = { id: string; userId: string | null; userName: string; externalId: string | null; displayName: string | null; emails: string[]; active: boolean; scimRole: string | null; createdAt: string; updatedAt: string; version: number };

/** A SCIM Group as Unfold keeps it, with the SCIM ids of its member Users. */
export type ScimGroupRecord = { id: string; displayName: string; externalId: string | null; members: string[]; createdAt: string; updatedAt: string; version: number };

const schema = `
  CREATE TABLE IF NOT EXISTS account_states (user_id TEXT PRIMARY KEY, disabled_at TEXT NOT NULL, disabled_by TEXT NOT NULL, reason TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS scim_users (id TEXT PRIMARY KEY, user_id TEXT, user_name TEXT NOT NULL, external_id TEXT, display_name TEXT, emails TEXT NOT NULL, active INTEGER NOT NULL, scim_role TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS scim_users_user_name ON scim_users(user_name COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS scim_users_user ON scim_users(user_id);
  CREATE TABLE IF NOT EXISTS scim_groups (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, external_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS scim_groups_display_name ON scim_groups(display_name COLLATE NOCASE);
  CREATE TABLE IF NOT EXISTS scim_group_members (group_id TEXT NOT NULL REFERENCES scim_groups(id) ON DELETE CASCADE, member_id TEXT NOT NULL REFERENCES scim_users(id) ON DELETE CASCADE, PRIMARY KEY (group_id, member_id));
  CREATE INDEX IF NOT EXISTS scim_group_members_member ON scim_group_members(member_id);
  CREATE TABLE IF NOT EXISTS ssf_seen (issuer TEXT NOT NULL, jti TEXT NOT NULL, seen_at TEXT NOT NULL, PRIMARY KEY (issuer, jti));
`;

/** The tables `IdentityAccounts` keeps, for the Tenant export's classification. */
export const identityTables = ['account_states', 'scim_users', 'scim_groups', 'scim_group_members', 'ssf_seen'] as const;

const instances = new WeakMap<DatabaseSync, IdentityAccounts>();

/** The one `IdentityAccounts` of a database, creating its tables on first use. */
export function identityAccounts(db: DatabaseSync): IdentityAccounts {
  let accounts = instances.get(db);
  if (!accounts) { accounts = new IdentityAccounts(db); instances.set(db, accounts); }
  return accounts;
}

/** Whether the identity provider turned the account `userId` off through SCIM or Shared Signals. Every sign-in path asks this. */
export function accountDisabled(db: DatabaseSync, userId: string): boolean { return identityAccounts(db).disabled(userId) !== undefined; }

function userRow(row: Record<string, unknown>): ScimUserRecord {
  return { id: String(row.id), userId: row.user_id === null ? null : String(row.user_id), userName: String(row.user_name), externalId: row.external_id === null ? null : String(row.external_id), displayName: row.display_name === null ? null : String(row.display_name), emails: JSON.parse(String(row.emails)), active: Number(row.active) === 1, scimRole: row.scim_role === null ? null : String(row.scim_role), createdAt: String(row.created_at), updatedAt: String(row.updated_at), version: Number(row.version) };
}

/**
 * The provisioning state the identity provider pushes: which accounts it turned off, the SCIM Users and Groups it
 * provisioned, and the Security Event Token ids already processed. It lives in the workbench's own database.
 */
export class IdentityAccounts {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
    this.db.exec(schema);
  }

  /** Why `userId` is turned off, or undefined while it is on. */
  disabled(userId: string): { at: string; by: DisabledBy; reason: string } | undefined {
    const row = this.db.prepare('SELECT disabled_at, disabled_by, reason FROM account_states WHERE user_id=?').get(userId) as Record<string, string> | undefined;
    return row ? { at: row.disabled_at, by: row.disabled_by as DisabledBy, reason: row.reason } : undefined;
  }

  disable(userId: string, by: DisabledBy, reason: string): void {
    this.db.prepare('INSERT INTO account_states(user_id,disabled_at,disabled_by,reason) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET disabled_at=excluded.disabled_at, disabled_by=excluded.disabled_by, reason=excluded.reason').run(userId, new Date().toISOString(), by, reason.slice(0, 200));
  }

  /** Turns `userId` back on. With `onlyBy`, only an account that source turned off. Returns whether it was off. */
  enable(userId: string, onlyBy?: DisabledBy): boolean {
    const result = onlyBy ? this.db.prepare('DELETE FROM account_states WHERE user_id=? AND disabled_by=?').run(userId, onlyBy) : this.db.prepare('DELETE FROM account_states WHERE user_id=?').run(userId);
    return Number(result.changes) > 0;
  }

  user(id: string): ScimUserRecord | undefined {
    const row = this.db.prepare('SELECT * FROM scim_users WHERE id=?').get(id) as Record<string, unknown> | undefined;
    return row ? userRow(row) : undefined;
  }

  /** The SCIM Users that name the Unfold account `userId`. */
  usersOf(userId: string): ScimUserRecord[] {
    return (this.db.prepare('SELECT * FROM scim_users WHERE user_id=? ORDER BY created_at, id').all(userId) as Record<string, unknown>[]).map(userRow);
  }

  /** SCIM Users whose `field` equals `value` (`userName` without regard to case), oldest first, from `offset`, at most `limit`, and how many there are. */
  users(filter: { field: 'id' | 'userName' | 'externalId' | 'email'; value: string } | undefined, offset: number, limit: number): { total: number; items: ScimUserRecord[] } {
    const where = !filter ? '' : filter.field === 'id' ? ' WHERE id=?' : filter.field === 'userName' ? ' WHERE user_name=? COLLATE NOCASE' : filter.field === 'externalId' ? ' WHERE external_id=?' : ' WHERE EXISTS (SELECT 1 FROM json_each(scim_users.emails) WHERE lower(json_each.value)=lower(?))';
    const values = filter ? [filter.value] : [];
    const total = Number((this.db.prepare(`SELECT COUNT(*) AS total FROM scim_users${where}`).get(...values) as { total: number }).total);
    const items = (this.db.prepare(`SELECT * FROM scim_users${where} ORDER BY created_at, id LIMIT ? OFFSET ?`).all(...values, limit, offset) as Record<string, unknown>[]).map(userRow);
    return { total, items };
  }

  /** Stores a SCIM User, new or changed, and returns it as stored. A changed one gets the next version. */
  saveUser(user: Omit<ScimUserRecord, 'id' | 'createdAt' | 'updatedAt' | 'version'> & { id?: string }): ScimUserRecord {
    const now = new Date().toISOString();
    const id = user.id ?? randomUUID();
    this.db.prepare('INSERT INTO scim_users(id,user_id,user_name,external_id,display_name,emails,active,scim_role,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, user_name=excluded.user_name, external_id=excluded.external_id, display_name=excluded.display_name, emails=excluded.emails, active=excluded.active, scim_role=excluded.scim_role, updated_at=excluded.updated_at, version=scim_users.version+1')
      .run(id, user.userId, user.userName, user.externalId, user.displayName, JSON.stringify(user.emails), user.active ? 1 : 0, user.scimRole, now, now);
    return this.user(id)!;
  }

  deleteUser(id: string): void { this.db.prepare('DELETE FROM scim_users WHERE id=?').run(id); }

  /** The display names of the SCIM Groups the SCIM User `memberId` belongs to. */
  groupNamesOf(memberId: string): string[] {
    return (this.db.prepare('SELECT g.display_name FROM scim_groups g JOIN scim_group_members m ON m.group_id=g.id WHERE m.member_id=? ORDER BY g.display_name').all(memberId) as { display_name: string }[]).map(row => row.display_name);
  }

  group(id: string): ScimGroupRecord | undefined {
    const row = this.db.prepare('SELECT * FROM scim_groups WHERE id=?').get(id) as Record<string, unknown> | undefined;
    return row ? this.groupOf(row) : undefined;
  }

  groups(filter: { field: 'id' | 'displayName' | 'externalId'; value: string } | undefined, offset: number, limit: number): { total: number; items: ScimGroupRecord[] } {
    const where = !filter ? '' : filter.field === 'id' ? ' WHERE id=?' : filter.field === 'displayName' ? ' WHERE display_name=? COLLATE NOCASE' : ' WHERE external_id=?';
    const values = filter ? [filter.value] : [];
    const total = Number((this.db.prepare(`SELECT COUNT(*) AS total FROM scim_groups${where}`).get(...values) as { total: number }).total);
    const items = (this.db.prepare(`SELECT * FROM scim_groups${where} ORDER BY created_at, id LIMIT ? OFFSET ?`).all(...values, limit, offset) as Record<string, unknown>[]).map(row => this.groupOf(row));
    return { total, items };
  }

  /** Stores a SCIM Group with exactly `members`, which must be SCIM User ids, and returns it as stored. */
  saveGroup(group: { id?: string; displayName: string; externalId: string | null; members: string[] }): ScimGroupRecord {
    const now = new Date().toISOString();
    const id = group.id ?? randomUUID();
    this.db.prepare('INSERT INTO scim_groups(id,display_name,external_id,created_at,updated_at,version) VALUES(?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name, external_id=excluded.external_id, updated_at=excluded.updated_at, version=scim_groups.version+1').run(id, group.displayName, group.externalId, now, now);
    this.db.prepare('DELETE FROM scim_group_members WHERE group_id=?').run(id);
    const insert = this.db.prepare('INSERT OR IGNORE INTO scim_group_members(group_id,member_id) VALUES(?,?)');
    for (const member of group.members) insert.run(id, member);
    return this.group(id)!;
  }

  deleteGroup(id: string): void { this.db.prepare('DELETE FROM scim_groups WHERE id=?').run(id); }

  /** Records that the SET `jti` from `issuer` was processed; false when it already was. Forgets ids older than `forgetBefore`. */
  firstDelivery(issuer: string, jti: string, forgetBefore: string): boolean {
    this.db.prepare('DELETE FROM ssf_seen WHERE seen_at<?').run(forgetBefore);
    return Number(this.db.prepare('INSERT OR IGNORE INTO ssf_seen(issuer,jti,seen_at) VALUES(?,?,?)').run(issuer, jti, new Date().toISOString()).changes) === 1;
  }

  private groupOf(row: Record<string, unknown>): ScimGroupRecord {
    const members = (this.db.prepare('SELECT member_id FROM scim_group_members WHERE group_id=? ORDER BY member_id').all(String(row.id)) as { member_id: string }[]).map(item => item.member_id);
    return { id: String(row.id), displayName: String(row.display_name), externalId: row.external_id === null ? null : String(row.external_id), members, createdAt: String(row.created_at), updatedAt: String(row.updated_at), version: Number(row.version) };
  }
}
