import type { AppConfig, User } from '../types.ts';
import { PloegClient, PloegError, type PloegTeam } from '../ploeg.ts';
import { handoffUnsupported, type TaskSourceConfig } from '../tasks.ts';
import { routedTeams, type Routing } from '../task-handoff.ts';

type Json = Record<string, any>;

/** The automation catalogue channel of AHP 0.9 and 1.0. */
export const automationsChannel = 'ahp-automations://';
/** The `InitializeResult._meta` key without which VS Code 1.141 reports a host's automations as needing an update. It declares that the host, not the client, evaluates triggers and runs automations. */
export const autonomousAutomationsMeta = 'vscode.autonomousAutomations';
/** The event-trigger type of a tracker route: Ploeg queues a Work Item when a team's tracker user is assigned to a task on the board. */
export const trackerAssignmentTrigger = 'unfold.tracker-assignment';
const assignmentEvent = 'task.assignee.created';
const metaKey = 'dev.webgrip.unfold';

/** Why the host refuses `automation/createRequested`, `runAutomation` and every other change from a client. */
export const readOnlyReason = 'Unfold lists tracker routes but does not create, change or run automations: each run would start budgeted work that Ploeg has not authorized. Hand a tracker task to a Ploeg team from the Tasks page, or assign it in the tracker.';
const routeChangeReason = 'A tracker route is Ploeg team routing and tracker assignment. Change it in Ploeg or in the tracker, not from an agent host client.';

/** What the host gives the catalogue: who is watching it, how to publish an action to one person's watching clients, and a repository's folder in the workspace picker. */
export type AutomationHost = {
  watchers(): User[];
  publish(userId: string, action: Json): void;
  workspaceFolder(repositoryId: string): string | undefined;
};

type Routes = { entries: Json[]; reason?: string };
type Known = { fingerprint: string; createdAt: string; modifiedAt: string };

/** A board whose tracker-driven work Ploeg runs: a Vikunja source handed to Ploeg, whose assignment webhook queues Work Items. */
export function routedSources(config: AppConfig): TaskSourceConfig[] {
  return (config.taskSources ?? []).filter(source => source.provider === 'vikunja' && source.executionOwner === 'ploeg');
}

/**
 * Projects Ploeg's tracker routes as a read-only AHP automation catalogue. One entry stands for one board and one Ploeg
 * team a person may route its tasks to; its event trigger is the tracker assignment that makes Ploeg queue a Work Item.
 * Every entry advertises no operations, so a client can neither run, change nor remove it, and the host advertises no
 * `create` capability.
 */
export class TrackerAutomations {
  /** How often the catalogue is recomputed for the people watching it. */
  refreshMs = 60_000;
  private readonly config: AppConfig;
  private readonly host: AutomationHost;
  private readonly ploeg: PloegClient;
  private readonly known = new Map<string, Known>();
  private readonly published = new Map<string, Map<string, string>>();
  private timer?: ReturnType<typeof setInterval>;
  private refreshing = false;

  constructor(config: AppConfig, host: AutomationHost, ploeg = new PloegClient(config)) {
    this.config = config; this.host = host; this.ploeg = ploeg;
  }

  /** Whether the host advertises automations: a live Ploeg operator connection and at least one board Ploeg runs. A demo advertises none. */
  get available(): boolean {
    const ploeg = this.config.ploeg;
    return Boolean(ploeg?.url && ploeg.tokenEnv && !ploeg.demo) && routedSources(this.config).length > 0;
  }

  /** `InitializeResult.automations`: the baseline catalogue only, without `create`, `schedules` or `runCancellation`. */
  capabilities(): Json { return {}; }

  /** The catalogue snapshot for one person, empty with a reason when the host advertises no automations. It also becomes the baseline later refreshes publish changes against. */
  async snapshot(user: User): Promise<Json> {
    const routes = await this.routes(user);
    this.publish(user, routes.entries);
    if (this.available) this.start();
    return { entries: routes.entries, _meta: { [metaKey]: { readOnly: true, reason: routes.reason ?? readOnlyReason } } };
  }

  /** The rejection reason for any action a client dispatches on the catalogue. */
  refuse(action: Json): string {
    return action?.type === 'automation/createRequested' ? readOnlyReason : routeChangeReason;
  }

  /** Answers the catalogue's commands. `runAutomation` is refused; there are no older runs to fetch. */
  async command(user: User, method: string, params: Json): Promise<{ result: Json } | { refused: string; code: 'permissionDenied' | 'notFound' }> {
    if (method === 'listAutomationTriggerDefinitions') return { result: { items: [this.triggerDefinition()] } };
    const resource = typeof params.automation === 'string' ? params.automation : '';
    const known = (await this.routes(user)).entries.some(entry => entry.resource === resource);
    if (!known) return { refused: 'No tracker route of yours has this resource', code: 'notFound' };
    if (method === 'fetchAutomationRuns') return { result: {} };
    return { refused: readOnlyReason, code: 'permissionDenied' };
  }

  /** Recomputes every watcher's catalogue and publishes `automation/set` and `automation/removed` for what changed. */
  async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const watchers = new Map(this.host.watchers().map(user => [user.id, user]));
      for (const id of [...this.published.keys()]) if (!watchers.has(id)) this.published.delete(id);
      if (!watchers.size) { this.stop(); return; }
      for (const user of watchers.values()) this.publish(user, (await this.routes(user, true)).entries);
    } finally { this.refreshing = false; }
  }

  close(): void { this.stop(); this.published.clear(); }

  private start(): void { if (!this.timer) { this.timer = setInterval(() => void this.refresh().catch(() => {}), this.refreshMs); this.timer.unref?.(); } }
  private stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = undefined; } }

  private publish(user: User, entries: Json[]): void {
    const before = this.published.get(user.id);
    const after = new Map(entries.map(entry => [entry.resource as string, JSON.stringify(entry)]));
    this.published.set(user.id, after);
    if (!before) return;
    for (const automation of entries) if (before.get(automation.resource) !== after.get(automation.resource)) this.host.publish(user.id, { type: 'automation/set', automation });
    for (const resource of before.keys()) if (!after.has(resource)) this.host.publish(user.id, { type: 'automation/removed', resource });
  }

  private async routes(user: User, fresh = false): Promise<Routes> {
    if (!this.available) return { entries: [], reason: 'This workbench has no live Ploeg connection or no board that Ploeg runs.' };
    let routing: Routing;
    try { routing = await this.ploeg.routing(user, fresh); }
    catch (error) { if (error instanceof PloegError) return { entries: [], reason: error.message }; throw error; }
    if (!routing.reported) return { entries: [], reason: 'This Ploeg version does not report which tracker users route work to its teams.' };
    const entries: Json[] = [];
    for (const source of routedSources(this.config)) {
      const offer = routedTeams(routing, source, team => this.ploeg.allows(user, team));
      for (const team of offer.teams) entries.push(this.entry(source, team, offer.pinned === team.id));
    }
    return { entries };
  }

  private entry(source: TaskSourceConfig, team: PloegTeam, pinned: boolean): Json {
    const resource = `ahp-automation:/tracker.${encodeURIComponent(source.id)}.${encodeURIComponent(team.id)}`;
    const assignee = team.assignees[0];
    const folder = this.host.workspaceFolder(source.repositoryId);
    const handoff = !handoffUnsupported(source, this.config.ploeg);
    const definition = {
      title: `${source.name} → ${team.id}`,
      message: { text: `Tasks on ${source.name} assigned to ${assignee} become Work Items for Ploeg team ${team.id}. Ploeg authorizes, budgets and runs each one, and nothing here starts work. ${handoff ? `Hand a task over from Unfold's Tasks page, or assign it to ${assignee} in the tracker.` : `Assign a task to ${assignee} in the tracker.`}`, origin: { kind: 'automation' } },
      session: { provider: 'unfold', ...(folder ? { workingDirectories: [folder] } : {}) },
      enabled: team.paused !== true,
      triggers: [{ id: 'tracker-assignment', kind: 'event', type: trackerAssignmentTrigger, title: 'Tracker assignment', description: 'Ploeg queues a Work Item when its tracker user is assigned to a task on this board.', events: [{ id: assignmentEvent, title: `Assigned to ${assignee}` }], config: { source: source.id, team: team.id, assignee } }],
      _meta: { [metaKey]: { kind: 'trackerRoute', source: source.id, team: team.id, assignee, pinned, handoff } },
    };
    const fingerprint = JSON.stringify(definition);
    const now = new Date().toISOString();
    const known = this.known.get(resource);
    const stamp = !known ? { fingerprint, createdAt: now, modifiedAt: now } : known.fingerprint === fingerprint ? known : { ...known, fingerprint, modifiedAt: now };
    this.known.set(resource, stamp);
    return { resource, definition, runs: [], operations: [], createdAt: stamp.createdAt, modifiedAt: stamp.modifiedAt, _meta: { [metaKey]: { queueDepth: team.queueDepth, paused: team.paused } } };
  }

  private triggerDefinition(): Json {
    return { type: trackerAssignmentTrigger, title: 'Tracker assignment', description: 'Ploeg queues a Work Item when a team\'s tracker user is assigned to a task on a board it runs. Unfold lists these routes; it does not create them.', events: [{ id: assignmentEvent, title: 'Task assigned to the team\'s tracker user' }] };
  }
}
