import type { FiledIssue, IssueFile, IssueState, TaskAssignee, TaskPage, TaskSnapshot, TaskSourceConfig } from '../tasks.ts';

/** What an adapter reads from one native task; `tasks.ts` adds the key, revision, link, details and redaction. */
export type ParsedTask = { id: string; title: string; description: string; status: TaskSnapshot['status']; updatedAt?: string; nativeRevision?: string; project: string };
/** The optional task facts an adapter reads for display. */
export type TaskDetails = Pick<TaskSnapshot, 'labels' | 'assignees' | 'priority' | 'dueAt' | 'identifier'>;
/** Readers that redact the source's token, handed to `details`. */
export type DetailReaders = {
  label(entry: unknown, max?: number): string | undefined;
  date(entry: unknown, milliseconds?: boolean): string | undefined;
  labels(list: unknown, name: string, tint: string): { name: string; color?: string }[];
  people(list: unknown, username: string, name: string): TaskAssignee[];
};
/** A GET against the source's API root. */
export type TaskRequest = (path: string, query?: Record<string, string>) => Promise<{ value: unknown; headers: Headers }>;
/** A change against the source's API root with its server credential. */
export type TaskWrite = (method: 'PUT' | 'POST' | 'DELETE', path: string, payload?: unknown) => Promise<void>;
/** A Report a problem request against the source's API root. */
export type FileRequest = (method: 'POST' | 'PUT' | 'PATCH' | 'GET', path: string, body?: unknown) => Promise<unknown>;
/** What `list` and `read` use: the source's request and the snapshot `tasks.ts` builds from a native task. */
export type TaskReading = { request: TaskRequest; snapshot(raw: unknown, truncate?: boolean): TaskSnapshot };
/** One place to look a tracker user up: the path, its query, and how to read the users out of the answer. */
export type UserLookup = [path: string, query: Record<string, string>, users: (value: unknown) => Record<string, unknown>[]];

/** Hand-off to Ploeg: the tracker assigns a team's tracker user, and Ploeg picks the task up. */
export interface TaskHandoff {
  /** The lowercase names a tracker user answers to, from the tracker's user record. */
  handles(user: Record<string, unknown>): string[];
  /** The lowercase names an assignee on a snapshot answers to. */
  personHandles(person: TaskAssignee): string[];
  /** How a hand-off note is written: HTML or plain text. */
  readonly commentFormat: 'html' | 'text';
  /** The project or home List that holds task `id`, or undefined. */
  project(source: TaskSourceConfig, id: string, request: TaskRequest): Promise<string | undefined>;
  /** Where to look a username up, in order. */
  userLookups(source: TaskSourceConfig, username: string): UserLookup[];
  setAssignee(source: TaskSourceConfig, id: string, userId: number, assigned: boolean, write: TaskWrite): Promise<void>;
  comment(source: TaskSourceConfig, id: string, body: string, write: TaskWrite): Promise<void>;
  /** The tracker's webhook event that makes Ploeg queue a Work Item when a team's user is assigned. Present when Ploeg routes this tracker's assignments, which the AHP automation catalogue lists. */
  readonly assignmentEvent?: string;
}

/** Issue filing for Report a problem. */
export interface IssueFiling {
  /** The body format the tracker renders. */
  readonly bodyFormat: 'markdown' | 'html';
  /** The field of the token's own user record that holds its login. */
  readonly loginField: string;
  /** Where the token's own user record is read; `/user` when absent. */
  readonly loginPath?: string;
  /** How the report dialog names the target. */
  describe(project: string): string;
  create(source: TaskSourceConfig, project: string, title: string, body: string, call: FileRequest): Promise<FiledIssue>;
  /** Attaches one file and returns its download address when the tracker gives one. */
  attach(source: TaskSourceConfig, project: string, issue: FiledIssue, file: IssueFile, call: FileRequest): Promise<string | undefined>;
  /** Replaces the filed body, so it can show a screenshot uploaded after it. Absent when the tracker cannot show one. */
  updateBody?(source: TaskSourceConfig, project: string, issue: FiledIssue, body: string, call: FileRequest): Promise<void>;
  state(source: TaskSourceConfig, project: string, issue: FiledIssue, version: string, login: string, call: FileRequest): Promise<IssueState>;
  comment(source: TaskSourceConfig, project: string, issue: FiledIssue, body: string, call: FileRequest): Promise<void>;
}

/** A tracker's reference format: `prefix` and the native id, such as `ABC-12` for prefix `ABC`, or `native` when the native id is already the reference people write, such as a Jira issue key. */
export type ReferenceFormat = { prefix: string; ploegDefault?: true } | { native: true };

/** One task tracker. Code outside an adapter asks for a capability and never names a provider. */
export interface TaskProviderAdapter {
  /** The name a task source's `provider` uses. */
  readonly name: string;
  /** The product name for messages. */
  readonly label: string;
  /** A fixture that only demo mode may configure. */
  readonly fixture?: true;
  /** `html` when the tracker sends descriptions as HTML, which the browser shows as Markdown. */
  readonly descriptionFormat: 'html' | 'markdown';
  /** The reference people write for a task. `ploegDefault` marks the tracker Ploeg means by an empty provider. */
  readonly reference?: ReferenceFormat;
  /** The mark the tracker shows before a native task id that is not a number, such as `#` in `#86c0abc12`. Absent when it shows the id bare. */
  readonly idMark?: string;
  /** The tracker's priority words by the number it stores (index 0 unused), and whether 1 is the highest. Absent when the tracker has no named priorities. */
  readonly priorities?: { readonly names: readonly string[]; readonly oneIsHighest: boolean };
  /** The link provider whose personal token a source without its own token reads with. */
  readonly linkedAccount?: string;
  readonly handoff?: TaskHandoff;
  readonly issues?: IssueFiling;
  /** The native task id. */
  readonly taskId: RegExp;
  /** Throws unless `url` is this tracker's API root; `path` has no trailing slash. */
  apiRoot(url: URL, path: string): void;
  /** Checks and normalizes a configured project, list or repository. */
  project(value: string): string;
  webRoot(source: TaskSourceConfig): string;
  taskUrl(source: TaskSourceConfig, id: string, value: Record<string, unknown>, webRoot: string): string;
  /** Adds the tracker's media type and credential header. */
  headers(source: TaskSourceConfig, headers: Record<string, string>): void;
  parse(source: TaskSourceConfig, value: Record<string, unknown>, limit: number): ParsedTask;
  details(source: TaskSourceConfig, value: Record<string, unknown>, read: DetailReaders): TaskDetails;
  list(source: TaskSourceConfig, page: number, reading: TaskReading): Promise<TaskPage>;
  read(source: TaskSourceConfig, id: string, truncate: boolean, reading: TaskReading): Promise<{ task: TaskSnapshot; value: Record<string, unknown> }>;
}

const adapters = new Map<string, TaskProviderAdapter>();

/** Registers a task provider adapter; a second adapter under the same name is refused. */
export function registerTaskProvider(adapter: TaskProviderAdapter): void {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(adapter.name)) throw new Error(`Task provider names are lowercase slugs: ${adapter.name}`);
  if (adapters.has(adapter.name)) throw new Error(`Task provider ${adapter.name} is already registered`);
  adapters.set(adapter.name, adapter);
}

/** The adapter registered under `name`; throws for a provider no adapter registered. */
export function taskProvider(name: string): TaskProviderAdapter {
  const adapter = adapters.get(name);
  if (!adapter) throw new Error('Unsupported task source provider');
  return adapter;
}

/** The adapter registered under `name`, or undefined. */
export function findTaskProvider(name: string): TaskProviderAdapter | undefined { return adapters.get(name); }

/** Every registered adapter, in registration order. */
export function taskProviders(): TaskProviderAdapter[] { return [...adapters.values()]; }

/** The adapter whose reference prefix is `prefix`, ignoring case. */
export function providerByPrefix(prefix: string): TaskProviderAdapter | undefined {
  const wanted = prefix.toLowerCase();
  return taskProviders().find(adapter => adapter.reference && 'prefix' in adapter.reference && adapter.reference.prefix.toLowerCase() === wanted);
}

/** `A`, `A and B`, `A, B and C`. */
export function andList(names: string[]): string { return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`; }
/** `A`, `A or B`, `A, B or C`. */
export function orList(names: string[]): string { return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`; }

/** The labels of the adapters that hand off to Ploeg, in registration order. */
export function handoffLabels(): string[] { return taskProviders().filter(adapter => adapter.handoff).map(adapter => adapter.label); }
/** The labels of the adapters that file Report a problem issues, in registration order. */
export function issueLabels(): string[] { return taskProviders().filter(adapter => adapter.issues).map(adapter => adapter.label); }
