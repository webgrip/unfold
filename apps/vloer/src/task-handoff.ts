import type { AppConfig, User } from './types.ts';
import { PloegError, type PloegClient, type PloegItem, type PloegTeam } from './ploeg.ts';
import { commentOnTask, findTrackerUser, getHandoffTask, handoffUnsupported, setTrackerAssignee, taskProject, TaskError, type TaskSnapshot, type TaskSourceConfig } from './tasks.ts';

export type TaskPloegTeam = { id: string; assignee: string; queueDepth: number; paused: boolean | null; roles: string[] };
export type TaskPloegWorkItem = { id: string; team: string; state: string; attempts: number; updatedAt: string; prUrl?: string; branch?: string; spentUsd?: number; budgetUsd?: number };
export type TaskPloegStatus = { available: boolean; message?: string; demo: boolean; handoff: { allowed: boolean; reason?: string }; teams: TaskPloegTeam[]; assignedTeams: string[]; workItems: TaskPloegWorkItem[]; fetchedAt: string; warnings?: string[] };

const settled = ['queued', 'withdrawn', 'done', 'stale'];
const olderTeams = 'This Ploeg version does not report which tracker users route work to its teams. Update Ploeg to hand tasks off from here.';
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);
const onTask = (team: PloegTeam, task: TaskSnapshot) => team.assignees.some(name => task.assignees?.some(person => person.username.toLowerCase() === name.toLowerCase()));

/** Hands Vikunja tasks to Ploeg by assigning a team's tracker user, and reports what Ploeg holds for a task. */
export class TaskHandoff {
  private readonly config: AppConfig;
  private readonly ploeg: PloegClient;
  constructor(config: AppConfig, ploeg: PloegClient) { this.config = config; this.ploeg = ploeg; }

  private get demo(): boolean { return this.config.mode === 'demo' && (!this.config.ploeg || this.config.ploeg.demo === true); }

  private idle(source: TaskSourceConfig, message: string): TaskPloegStatus {
    return { available: false, message, demo: this.demo || source.provider === 'demo', handoff: { allowed: false, reason: message }, teams: [], assignedTeams: [], workItems: [], fetchedAt: new Date().toISOString() };
  }

  private async team(user: User, source: TaskSourceConfig, id: string): Promise<{ team: PloegTeam; teams: PloegTeam[] }> {
    if (user.role === 'viewer') throw new TaskError(403, 'forbidden', 'Viewers cannot hand tasks to Ploeg.');
    const unsupported = handoffUnsupported(source, this.config.ploeg);
    if (unsupported) throw new TaskError(422, 'handoff_unsupported', unsupported);
    const { teams, reported } = await this.ploeg.routing(user, true);
    if (!reported) throw new TaskError(404, 'handoff_team', olderTeams);
    const team = teams.find(entry => entry.id === id && entry.assignees.length);
    if (!team) throw new TaskError(404, 'handoff_team', 'That Ploeg team is not available to you or has no tracker user to assign.');
    return { team, teams };
  }

  private async items(user: User, task: TaskSnapshot, fresh: boolean): Promise<{ items: TaskPloegWorkItem[]; supported: boolean; message?: string }> {
    const found = await this.ploeg.trackerItems(user, task.provider, task.id, fresh);
    const ordered = [...found.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 20);
    const links = new Map<string, string>();
    await Promise.all(ordered.slice(0, 3).map(async entry => {
      const detail = await this.ploeg.detail(user, entry.id, fresh).catch(() => undefined);
      const link = detail?.checkpoints.filter(checkpoint => checkpoint.prUrl).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.prUrl;
      if (link) links.set(entry.id, link);
    }));
    const project = (entry: PloegItem): TaskPloegWorkItem => ({ id: entry.id, team: entry.team, state: entry.state, attempts: entry.attempts, updatedAt: entry.updatedAt, ...(links.has(entry.id) ? { prUrl: links.get(entry.id) } : {}), ...(entry.latestShift?.branch ? { branch: entry.latestShift.branch } : {}), ...(entry.latestShift ? { spentUsd: entry.latestShift.spentUsd, budgetUsd: entry.latestShift.budgetUsd } : {}) });
    return { items: ordered.map(project), supported: found.supported, ...(found.message ? { message: found.message } : {}) };
  }

  private async report(user: User, source: TaskSourceConfig, task: TaskSnapshot, fresh: boolean): Promise<TaskPloegStatus> {
    const unsupported = handoffUnsupported(source, this.config.ploeg);
    if (unsupported) return this.idle(source, unsupported);
    let routing: { teams: PloegTeam[]; reported: boolean };
    let found: Awaited<ReturnType<TaskHandoff['items']>>;
    try { [routing, found] = await Promise.all([this.ploeg.routing(user, fresh), this.items(user, task, fresh)]); }
    catch (error) { if (error instanceof PloegError) return this.idle(source, error.message); throw error; }
    const teams = routing.reported ? routing.teams.filter(team => team.assignees.length) : [];
    const assignedTeams = teams.filter(team => onTask(team, task)).map(team => team.id);
    const reason = user.role === 'viewer' ? 'Viewers cannot hand tasks to Ploeg.' : task.status !== 'open' ? 'Only an open task can be handed to Ploeg.' : !routing.reported ? olderTeams : !teams.length ? 'None of your Ploeg teams has a tracker user to assign.' : undefined;
    const active = found.items.find(entry => !['withdrawn', 'done', 'stale'].includes(entry.state));
    const message = found.message ?? (active ? `Ploeg team ${active.team} holds this task (${active.state.replace(/_/g, ' ')}).` : assignedTeams.length ? `Handed to Ploeg team ${assignedTeams.join(', ')}; Ploeg has not listed it yet.` : undefined);
    return { available: true, ...(message ? { message } : {}), demo: false, handoff: reason ? { allowed: false, reason } : { allowed: true }, teams: teams.map(team => ({ id: team.id, assignee: team.assignees[0], queueDepth: team.queueDepth, paused: team.paused, roles: team.roles.map(role => role.id) })), assignedTeams, workItems: found.items, fetchedAt: new Date().toISOString() };
  }

  /** Reports Ploeg's teams, the task's current hand-off and the Work Items Ploeg holds for it. */
  async status(user: User, source: TaskSourceConfig, taskId: string, fresh = false): Promise<TaskPloegStatus> {
    const unsupported = handoffUnsupported(source, this.config.ploeg);
    if (unsupported) return this.idle(source, unsupported);
    const { task } = await getHandoffTask(source, taskId);
    return this.report(user, source, task, fresh);
  }

  /** Assigns the team's tracker user to an open, unchanged task and leaves a comment; repeating it changes nothing. */
  async handOff(user: User, source: TaskSourceConfig, taskId: string, teamId: string, revision: string): Promise<TaskPloegStatus> {
    const { team, teams } = await this.team(user, source, teamId);
    const { task } = await getHandoffTask(source, taskId);
    if (task.status !== 'open') throw new TaskError(409, 'task_closed', 'Only an open task can be handed to Ploeg. Refresh the task.');
    if (task.revision !== revision) throw new TaskError(409, 'task_changed', 'The task changed after you opened it. Reload it and review the current version.');
    const warnings: string[] = [];
    let outcome = 'already_assigned';
    if (!onTask(team, task)) {
      const holder = teams.find(other => other.id !== team.id && onTask(other, task));
      if (holder) throw new TaskError(409, 'handoff_active', `This task is already handed to Ploeg team ${holder.id}. Take it back from ${holder.id} first.`);
      const found = await this.items(user, task, true).catch(() => undefined);
      const active = found?.items.find(entry => entry.team !== team.id && !['withdrawn', 'done', 'stale'].includes(entry.state));
      if (active) throw new TaskError(409, 'handoff_active', `Ploeg team ${active.team} already holds this task (${active.state.replace(/_/g, ' ')}). Finish or cancel that work in the Ploeg view first.`);
      const assignee = team.assignees[0];
      const userId = await findTrackerUser(source, assignee);
      if (!userId) throw new TaskError(502, 'handoff_assignee_unknown', `Vikunja has no user named ${assignee} that the workbench token can see. Check the team's tracker user in Ploeg's configuration.`);
      try { await setTrackerAssignee(source, task.id, userId, true); }
      catch (error) { if (!(error instanceof TaskError && error.code === 'task_write_conflict' && onTask(team, (await getHandoffTask(source, task.id)).task))) throw error; }
      outcome = 'assigned';
      await commentOnTask(source, task.id, `<p>Handed to Ploeg team <code>${escapeHtml(team.id)}</code> by ${escapeHtml(user.name)} from Vloer.</p>`).catch((error: unknown) => { warnings.push(`The task is handed off, but the workbench could not leave a comment on it. ${error instanceof TaskError ? error.message : ''}`.trim()); });
    }
    this.log(user, source, task.id, team.id, 'handoff', outcome, outcome === 'assigned' && !warnings.length);
    return { ...await this.report(user, source, (await getHandoffTask(source, task.id)).task, true), ...(warnings.length ? { warnings } : {}) };
  }

  /** Removes the team's tracker user while Ploeg has not started the task, and leaves a comment. */
  async takeBack(user: User, source: TaskSourceConfig, taskId: string, teamId: string): Promise<TaskPloegStatus> {
    const { team } = await this.team(user, source, teamId);
    const { task, assigneeIds } = await getHandoffTask(source, taskId);
    let found: Awaited<ReturnType<TaskHandoff['items']>>;
    try { found = await this.items(user, task, true); } catch (error) { if (error instanceof PloegError) throw new TaskError(503, 'handoff_unverified', 'The workbench could not confirm with Ploeg that this work has not started. Try again, or cancel it from the Ploeg view.'); throw error; }
    if (!found.supported) throw new TaskError(503, 'handoff_unverified', `The workbench cannot confirm that Ploeg has not started this work. ${found.message ?? ''}`.trim());
    if (found.items.some(entry => entry.team === team.id && !settled.includes(entry.state))) throw new TaskError(409, 'handoff_started', 'Ploeg has already started; cancel it from the Ploeg view instead.');
    const warnings: string[] = [];
    const present = team.assignees.map(name => assigneeIds.get(name.toLowerCase())).filter((id): id is number => id !== undefined);
    for (const id of present) await setTrackerAssignee(source, task.id, id, false);
    if (present.length) await commentOnTask(source, task.id, `<p>Taken back from Ploeg team <code>${escapeHtml(team.id)}</code> by ${escapeHtml(user.name)} from Vloer.</p>`).catch((error: unknown) => { warnings.push(`The task is taken back, but the workbench could not leave a comment on it. ${error instanceof TaskError ? error.message : ''}`.trim()); });
    this.log(user, source, task.id, team.id, 'take_back', present.length ? 'removed' : 'not_assigned', present.length > 0 && !warnings.length);
    return { ...await this.report(user, source, (await getHandoffTask(source, task.id)).task, true), ...(warnings.length ? { warnings } : {}) };
  }

  /** Finds the configured Vikunja source whose project holds a tracker task. */
  async lookup(provider: string | null, id: string | null): Promise<{ sourceId: string }> {
    if (provider !== 'vikunja') throw new TaskError(400, 'lookup_unsupported', 'Only Vikunja tasks can be looked up.');
    if (!id || !/^[1-9][0-9]{0,19}$/.test(id)) throw new TaskError(400, 'task_id_invalid', 'Use the native task ID.');
    const sources = (this.config.taskSources ?? []).filter(source => source.provider === 'vikunja').sort((a, b) => Number(b.executionOwner === 'ploeg') - Number(a.executionOwner === 'ploeg'));
    for (const baseUrl of [...new Set(sources.map(source => source.baseUrl))]) {
      const project = await taskProject(sources.find(source => source.baseUrl === baseUrl)!, id);
      const match = project && sources.find(source => source.baseUrl === baseUrl && source.project === project);
      if (match) return { sourceId: match.id };
    }
    throw new TaskError(404, 'task_source_unknown', 'No configured task connection holds this task.');
  }

  private log(user: User, source: TaskSourceConfig, taskId: string, team: string, action: string, outcome: string, commented: boolean): void {
    console.log(JSON.stringify({ level: 'info', event: `task.${action}`, actor: user.id, sourceId: source.id, taskId, team, outcome, commented }));
  }
}
