import type { AppConfig, Repository, User } from './types.ts';
import type { TaskSourceConfig, TaskTarget } from './tasks.ts';
import { defaultTenant, ownership, repositoryKey, sameOwnership, type Ownership } from './tenancy.ts';

/** The `tenancy` configuration block: `enforce` turns on the Tenant and Client checks of system ADR-0017. Off by default. */
export type TenancySettings = { enforce: boolean };

/** Reads the optional `tenancy` block: `{ enforce: true | false }`, nothing else. Absent means not enforced. */
export function tenancySettings(raw: unknown): TenancySettings {
  if (raw === undefined) return { enforce: false };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => key !== 'enforce')) throw new Error('tenancy takes only enforce');
  const enforce = (raw as { enforce?: unknown }).enforce ?? false;
  if (typeof enforce !== 'boolean') throw new Error('tenancy.enforce must be true or false');
  return { enforce };
}

/**
 * Whether `user` may see what `owner` owns: they hold a Tenant membership of its Tenant, with any Access Role, or the
 * owner is a Client and they hold that Client's membership. A Client membership never reaches what no Client owns.
 */
export function reaches(user: User, owner: Ownership): boolean {
  return (user.memberships ?? []).some(held => held.tenant === owner.tenant && (held.kind === 'tenant' || (owner.client !== undefined && held.client === owner.client)));
}

/** Whether `user` may change what `owner` owns: a Tenant membership of its Tenant as Developer or Admin. */
export function actsFor(user: User, owner: Ownership): boolean {
  return (user.memberships ?? []).some(held => held.kind === 'tenant' && held.tenant === owner.tenant && held.role !== 'viewer');
}

const targetKey = (forge: string, owner: string, repo: string) => JSON.stringify([forge, owner.toLowerCase(), repo.toLowerCase()]);
const pathOf = (key: string) => key.startsWith('path:') ? key : key.slice(key.indexOf('/') + 1);

/**
 * The Tenant and Client checks one configuration implies (system ADR-0017). While `tenancy.enforce` is off every
 * method answers as if each person reached everything, so nothing changes; while it is on, a person reaches only
 * the repositories, task sources and Work Items their memberships reach, and everything else reads as absent.
 */
export class TenantScope {
  readonly enforced: boolean;
  private readonly repositoryList: Repository[];
  private readonly sourceList: TaskSourceConfig[];
  private readonly byTarget = new Map<string, Repository[]>();
  private readonly byPath = new Map<string, Repository[]>();

  constructor(config: Pick<AppConfig, 'repositories' | 'taskSources' | 'tenancy'>) {
    this.enforced = config.tenancy?.enforce === true;
    this.repositoryList = config.repositories ?? [];
    this.sourceList = config.taskSources ?? [];
    const add = (map: Map<string, Repository[]>, key: string, repository: Repository) => { const list = map.get(key) ?? []; if (!list.includes(repository)) list.push(repository); map.set(key, list); };
    for (const source of this.sourceList) {
      const repository = this.repositoryList.find(entry => entry.id === source.repositoryId);
      if (repository && source.ploeg) add(this.byTarget, targetKey(source.ploeg.target.forge, source.ploeg.target.owner, source.ploeg.target.repo), repository);
    }
    for (const repository of this.repositoryList) add(this.byPath, pathOf(repositoryKey(repository.url)), repository);
  }

  /** The registered repositories `user` reaches, in configuration order. */
  repositories(user: User): Repository[] { return this.enforced ? this.repositoryList.filter(entry => reaches(user, ownership(entry))) : this.repositoryList; }
  /** The registered repository `id`, or undefined when there is none or `user` does not reach it. */
  repository(user: User, id: string): Repository | undefined { return this.repositories(user).find(entry => entry.id === id); }
  /** The task sources `user` reaches, in configuration order. */
  sources(user: User): TaskSourceConfig[] { return this.enforced ? this.sourceList.filter(entry => reaches(user, ownership(entry))) : this.sourceList; }
  /** The task source `id`, or undefined when there is none or `user` does not reach it, so both answer the same 404. */
  source(user: User, id: string): TaskSourceConfig | undefined { return this.sources(user).find(entry => entry.id === id); }
  /** Whether `user` may import or hand off from `entry`, a source they reach. Always true while not enforced. */
  mayAct(user: User, entry: { tenant?: string; client?: string }): boolean { return !this.enforced || actsFor(user, ownership(entry)); }

  /**
   * The owner of a Work Item, which is the owner of the registered repository its target names: a task source's
   * Ploeg target first, otherwise a repository whose `owner/name` path matches. A Work Item with no target, or one
   * no registered repository matches, belongs to the default Tenant with no Client, like a repository that names
   * no owner. Undefined when the target matches repositories of different owners, and then nobody reaches it.
   */
  workItemOwner(target: TaskTarget | Pick<TaskTarget, 'forge' | 'owner' | 'repo'> | null): Ownership | undefined {
    if (!target) return { tenant: defaultTenant };
    const matches = this.byTarget.get(targetKey(target.forge, target.owner, target.repo)) ?? this.byPath.get(`${target.owner}/${target.repo}`.toLowerCase()) ?? [];
    const owners = matches.map(entry => ownership(entry));
    if (!owners.length) return { tenant: defaultTenant };
    return owners.every(owner => sameOwnership(owner, owners[0])) ? owners[0] : undefined;
  }
  /** Whether `user` reaches a Work Item with `target`. Always true while not enforced. */
  reachesWorkItem(user: User, target: TaskTarget | Pick<TaskTarget, 'forge' | 'owner' | 'repo'> | null): boolean {
    if (!this.enforced) return true;
    const owner = this.workItemOwner(target);
    return owner !== undefined && reaches(user, owner);
  }
}
