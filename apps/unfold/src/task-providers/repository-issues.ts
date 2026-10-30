import type { TaskSourceConfig } from '../tasks.ts';
import type { DetailReaders, ParsedTask, TaskDetails } from './registry.ts';
import { field, nativeTaskId, numericId, pathProject, record, TaskError, updated } from './shared.ts';

/** The issues collection of an `owner/repository` source, as Forgejo and GitHub name it. */
export function repositoryIssuePath(source: TaskSourceConfig): string {
  return `/repos/${source.project.split('/').map(encodeURIComponent).join('/')}/issues`;
}

/** An `owner/repository` project, lowercased. */
export function ownerRepository(value: string): string {
  pathProject(value, 2);
  return value.toLowerCase();
}

/** Whether a listed issue is a pull request, which Forgejo and GitHub list among issues. */
export const isPullRequest = (value: unknown): boolean => Boolean(record(value).pull_request);

/** Reads a Forgejo or GitHub issue. */
export function parseRepositoryIssue(source: TaskSourceConfig, value: Record<string, unknown>, limit: number): ParsedTask {
  if (value.pull_request) throw new TaskError(422, 'task_is_pull_request', 'Select an issue instead of a pull request.');
  return { id: nativeTaskId(numericId, value.number), title: field(value.title, 500), description: field(value.body, limit, true), status: value.state === 'open' ? 'open' : value.state === 'closed' ? 'closed' : 'unknown', updatedAt: updated(value.updated_at), project: source.project };
}

/** Labels, assignees, due date and number of a Forgejo or GitHub issue. */
export function repositoryIssueDetails(value: Record<string, unknown>, read: DetailReaders): TaskDetails {
  return { labels: read.labels(value.labels, 'name', 'color'), assignees: read.people(value.assignees, 'login', 'full_name'), dueAt: read.date(value.due_date), identifier: typeof value.number === 'number' ? `#${value.number}` : undefined };
}

/** The web link of an issue under `base/owner/repository/issues/id`. */
export function repositoryIssueUrl(source: TaskSourceConfig, id: string, base: string): string {
  return `${base}/${source.project.split('/').map(encodeURIComponent).join('/')}/issues/${id}`;
}

/** The `Authorization` header, when the source has a token. */
export function authorize(source: TaskSourceConfig, headers: Record<string, string>, scheme: string): void {
  if (source.token) headers.Authorization = scheme ? `${scheme} ${source.token}` : source.token;
}
