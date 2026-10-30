import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { User } from './types.ts';
import type { CommentRequest, CommentResult } from './cards/service.ts';
import type { FactsChangedPath, FactsPullRequest, WorkItemFacts } from './cards/facts.ts';
import { commentPullRequest } from './agent-trace-comments.ts';
import { markAiMarkdown, pullRequestReview } from './ai-marking.ts';
import type { JobWorker } from './jobs/worker.ts';

/** The key of Unfold's Client Sign-off comment on a Work Item's pull request (Ploeg ADR-0079, system ADR-0049). */
export const clientSignOffCommentKey = 'client-sign-off';
/** The commit status context an Agency may make required in its branch protection (system ADR-0049, part 5). */
export const clientSignOffStatusContext = 'client-sign-off';
/** How long Unfold waits after a change before it writes the comment, so a record and a quick withdrawal make one write. */
export const clientSignOffCommentDelayMs = 30_000;
/** The bounds of a Client Sign-off: note length, exclusion globs per repository, glob length and stored history per Work Item. */
export const clientSignOffLimits = { note: 2000, globs: 100, glob: 200, history: 50 } as const;
/** The Client a Sign-off and its exclusions belong to until Work Items carry a Client (system ADR-0017). */
export const unassignedClient = '';

/** A Client's answer on a pull request. */
export const signOffAnswers = ['looks_good', 'needs_changes'] as const;
export type SignOffAnswer = typeof signOffAnswers[number];
/**
 * Where a Sign-off stands: `current` while its head is the pull request's head; `dismissed` once a newer head was seen,
 * for good; `withdrawn` when a person withdrew it; `superseded` when a later Sign-off on the same pull request replaced it.
 */
export type SignOffState = 'current' | 'dismissed' | 'withdrawn' | 'superseded';

/**
 * The changed paths a Sign-off covers (its Sign-off Paths), computed once and stored with it, so a later change of the
 * exclusions or of the rule never rewrites what a Client signed. `rule` names the rule and its version.
 */
export type SignOffScope = {
  rule: string;
  covered: string[];
  excluded: string[];
  truncated: boolean;
  missing: boolean;
  wholeChange: boolean;
  exclusions: { profile: string[]; kept: string[]; repository: string[] };
};

/** The Agency's exclusions for one Client and repository, held in the Client Profile. */
export type SignOffExclusions = {
  client: string;
  repository: string;
  exclude: string[];
  keep: string[];
  repositoryFile: boolean;
  updatedAt: string;
  updatedBy: string;
};

/** One Client Sign-off, as stored. */
export type ClientSignOff = {
  id: string;
  workItemId: string;
  client: string;
  pullRequest: { id: string; forge: string; owner: string; repo: string; number: number };
  headSha: string;
  answer: SignOffAnswer;
  note: string;
  scope: SignOffScope;
  person: { id: string; name: string; role: string; attribution: 'proven' | 'asserted'; onBehalfOfClient: boolean };
  recordedAt: string;
  state: SignOffState;
  dismissedBy: string | null;
  endedAt: string | null;
  endedBy: string | null;
};

/** A refusal, with the HTTP status and code the route answers with. */
export class ClientSignOffError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; this.name = 'ClientSignOffError'; }
}

const fail = (status: number, code: string, message: string): never => { throw new ClientSignOffError(status, code, message); };

/**
 * Whether a person may record or withdraw a Client Sign-off. Until Client memberships exist (system ADR-0017), only an
 * administrator or operator may, on the Client's behalf; a Client user's check replaces this one.
 */
export function mayRecordSignOff(user: Pick<User, 'role'>): boolean {
  return user.role === 'admin' || user.role === 'operator';
}

const globCache = new Map<string, RegExp>();

/**
 * Whether a repository path matches a glob: `**` spans directories, `*` and `?` stay within one, a glob ending in `/`
 * matches everything below that directory, and a glob without `/` matches a file or directory name at any depth.
 */
export function globMatches(glob: string, path: string): boolean {
  let pattern = globCache.get(glob);
  if (!pattern) {
    let source = glob.replace(/^\.\//, '');
    if (source.endsWith('/')) source += '**';
    const anywhere = !source.includes('/');
    let out = '';
    for (let index = 0; index < source.length; index++) {
      const char = source[index];
      if (char === '*' && source[index + 1] === '*') {
        index++;
        if (source[index + 1] === '/') { index++; out += '(?:.*/)?'; } else out += '.*';
      } else if (char === '*') out += '[^/]*';
      else if (char === '?') out += '[^/]';
      else out += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    pattern = new RegExp(anywhere ? `^(?:.*/)?${out}(?:/.*)?$` : `^${out}(?:/.*)?$`);
    globCache.set(glob, pattern);
  }
  return pattern.test(path);
}

/** Checks a list of exclusion globs from a request or a file: text only, bounded, no empty or NUL entries. */
export function exclusionGlobs(value: unknown, what = 'Exclusions'): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > clientSignOffLimits.globs) return fail(400, 'sign_off_globs', `${what} must be a list of at most ${clientSignOffLimits.globs} globs.`);
  return [...new Set(value.map(entry => {
    if (typeof entry !== 'string' || !entry.trim() || entry.length > clientSignOffLimits.glob || /[\0\r\n]/.test(entry)) return fail(400, 'sign_off_globs', `${what} must be globs of 1 to ${clientSignOffLimits.glob} characters.`);
    return entry.trim();
  }))];
}

/**
 * Reads the exclusion globs of a repository's sign-off file, such as `.unfold/sign-off.yml`: the string items of a
 * top-level `exclude:` list. Every other key, including any that names a Client or a person, is ignored, so the file
 * can only ever narrow the scope.
 */
export function parseSignOffFile(text: string): string[] {
  const globs: string[] = [];
  let inExclude = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').replace(/^#.*$/, '');
    if (!line.trim()) continue;
    if (/^\S/.test(line)) { inExclude = /^exclude\s*:\s*$/.test(line); continue; }
    const item = inExclude ? /^\s+-\s+(?:"([^"]*)"|'([^']*)'|(\S.*?))\s*$/.exec(line) : null;
    if (item) globs.push(item[1] ?? item[2] ?? item[3]);
  }
  return exclusionGlobs(globs.slice(0, clientSignOffLimits.globs), 'The sign-off file');
}

/** What a scope rule reads: the pull request's changed paths at its head, and the exclusions that apply to it. */
export type ScopeInput = {
  changedPaths: FactsPullRequest['changedPaths'];
  profile: Pick<SignOffExclusions, 'exclude' | 'keep'> | null;
  repository: string[];
};

/** A rule that turns the changed paths into a Sign-off's scope. New rules slot in next to this one; stored scopes keep their `rule`. */
export type ScopeRule = { id: string; scope(input: ScopeInput): SignOffScope };

/**
 * The rule of system ADR-0049: every changed path, minus those the Client Profile excludes, minus those the repository
 * file excludes unless the Client Profile keeps them. Truncated or missing paths never make a whole change.
 */
export const wholeChangeMinusExclusions: ScopeRule = {
  id: 'whole-change-minus-exclusions/1',
  scope({ changedPaths, profile, repository }) {
    const exclude = profile?.exclude ?? [];
    const keep = profile?.keep ?? [];
    const paths = [...new Set((changedPaths?.paths ?? []).flatMap((entry: FactsChangedPath) => entry.previousPath && entry.previousPath !== entry.path ? [entry.path, entry.previousPath] : [entry.path]))].sort();
    const excludedBy = (path: string) => exclude.some(glob => globMatches(glob, path)) || (repository.some(glob => globMatches(glob, path)) && !keep.some(glob => globMatches(glob, path)));
    const covered = paths.filter(path => !excludedBy(path));
    const excluded = paths.filter(excludedBy);
    const missing = !changedPaths;
    const truncated = changedPaths?.truncated === true;
    return { rule: this.id, covered, excluded, truncated, missing, wholeChange: !missing && !truncated && excluded.length === 0, exclusions: { profile: [...exclude], kept: [...keep], repository: [...repository] } };
  },
};

/** The head a Sign-off binds to: the changed paths' head when Ploeg read them, otherwise the pull request's. */
export function pullRequestHead(pullRequest: Pick<FactsPullRequest, 'headSha' | 'changedPaths'>): string | null {
  return pullRequest.changedPaths?.headSha ?? pullRequest.headSha ?? null;
}

/** The `owner/repo` a pull request's exclusions are keyed by. */
export function repositoryKey(pullRequest: Pick<FactsPullRequest, 'owner' | 'repo'>): string {
  return `${pullRequest.owner}/${pullRequest.repo}`.toLowerCase();
}

/** The Client Sign-offs and the Client Profile's exclusions, in the workbench database. */
export class ClientSignOffStore {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS client_sign_offs (id TEXT PRIMARY KEY, work_item_id TEXT NOT NULL, pull_request_id TEXT NOT NULL, head_sha TEXT NOT NULL, state TEXT NOT NULL, recorded_at TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS client_sign_offs_work_item ON client_sign_offs(work_item_id, recorded_at);
      CREATE TABLE IF NOT EXISTS client_sign_off_exclusions (client TEXT NOT NULL, repository TEXT NOT NULL, updated_at TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (client, repository));
    `);
  }
  /** A Work Item's Sign-offs, newest first. */
  forWorkItem(workItemId: string): ClientSignOff[] {
    return (this.db.prepare('SELECT state, body FROM client_sign_offs WHERE work_item_id=? ORDER BY recorded_at DESC, rowid DESC LIMIT ?').all(workItemId, clientSignOffLimits.history) as { state: SignOffState; body: string }[])
      .map(row => ({ ...JSON.parse(row.body), state: row.state }));
  }
  add(signOff: ClientSignOff): void {
    this.db.prepare('INSERT INTO client_sign_offs(id,work_item_id,pull_request_id,head_sha,state,recorded_at,body) VALUES(?,?,?,?,?,?,?)').run(signOff.id, signOff.workItemId, signOff.pullRequest.id, signOff.headSha, signOff.state, signOff.recordedAt, JSON.stringify(signOff));
    this.db.prepare('DELETE FROM client_sign_offs WHERE work_item_id=? AND id NOT IN (SELECT id FROM client_sign_offs WHERE work_item_id=? ORDER BY recorded_at DESC, rowid DESC LIMIT ?)').run(signOff.workItemId, signOff.workItemId, clientSignOffLimits.history);
  }
  /** Ends a current Sign-off; answers whether this caller did, so two callers never both end it. */
  end(signOff: ClientSignOff, state: Exclude<SignOffState, 'current'>, at: string, by: string | null, dismissedBy: string | null = null): boolean {
    const next: ClientSignOff = { ...signOff, state, endedAt: at, endedBy: by, dismissedBy };
    return Number(this.db.prepare("UPDATE client_sign_offs SET state=?, body=? WHERE id=? AND state='current'").run(state, JSON.stringify(next), signOff.id).changes) === 1;
  }
  exclusions(client: string, repository: string): SignOffExclusions | null {
    const row = this.db.prepare('SELECT body FROM client_sign_off_exclusions WHERE client=? AND repository=?').get(client, repository.toLowerCase()) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : null;
  }
  allExclusions(client: string): SignOffExclusions[] {
    return (this.db.prepare('SELECT body FROM client_sign_off_exclusions WHERE client=? ORDER BY repository').all(client) as { body: string }[]).map(row => JSON.parse(row.body));
  }
  setExclusions(entry: SignOffExclusions): void {
    const value = { ...entry, repository: entry.repository.toLowerCase() };
    this.db.prepare('INSERT INTO client_sign_off_exclusions(client,repository,updated_at,body) VALUES(?,?,?,?) ON CONFLICT(client,repository) DO UPDATE SET updated_at=excluded.updated_at, body=excluded.body').run(value.client, value.repository, value.updatedAt, JSON.stringify(value));
  }
}

/** The reads and the write the Sign-off needs from Ploeg. */
export type ClientSignOffSource = {
  factsSupported(fresh?: boolean): Promise<boolean>;
  workItemFacts(id: string, fresh?: boolean): Promise<Pick<WorkItemFacts, 'workItem' | 'pullRequests'>>;
  putPullRequestComment(id: string, key: string, body: CommentRequest): Promise<CommentResult>;
};
/** Reads the repository's sign-off file at a head, or null when there is none. Not wired yet: Ploeg offers no file read. */
export type SignOffFileReader = (pullRequest: FactsPullRequest, headSha: string) => Promise<string | null>;
/** The commit status Unfold would keep on the head. */
export type SignOffCommitStatus = { context: typeof clientSignOffStatusContext; sha: string; state: 'success' | 'failure' | 'pending'; description: string };
/** Writes a keyed commit status through Ploeg. Not wired yet: it waits on a generic Ploeg keyed commit status contract. */
export type SignOffStatusWriter = (workItemId: string, status: SignOffCommitStatus) => Promise<void>;

/** What one comment publish did: wrote it, found it unchanged, or why it wrote nothing. */
export type SignOffCommentOutcome = 'published' | 'unchanged' | 'flag_off' | 'unsupported' | 'no_pull_request' | 'no_sign_off';

export type ClientSignOffOptions = {
  /** Whether the Team may record Sign-offs: the `client.sign-off` flag. */
  enabled: (team: string) => Promise<boolean>;
  /** Whether the Team gets the pull request comment: the `client.sign-off-comment` flag. */
  commentEnabled: (team: string) => Promise<boolean>;
  rule?: ScopeRule;
  readFile?: SignOffFileReader;
  writeStatus?: SignOffStatusWriter;
  delayMs?: number;
  /** The worker whose durable queue holds the scheduled writes. Without it, {@link ClientSignOffs.notice} schedules nothing. */
  jobs?: JobWorker;
  now?: () => Date;
  log?: (level: 'info' | 'warn', event: string, detail: Record<string, unknown>) => void;
};

/** What a person submits. `headSha` is the head they looked at. */
export type SignOffInput = { answer?: unknown; note?: unknown; headSha?: unknown };
/** Who submits, and whether Unfold could prove it was them. */
export type SignOffPerson = Pick<User, 'id' | 'name' | 'role'> & { attribution: 'proven' | 'asserted' };

/** A Work Item's Sign-off state for the Agency's reviewer. */
export type SignOffView = {
  workItemId: string;
  team: string;
  pullRequest: { number: number; url: string; headSha: string | null } | null;
  current: ClientSignOff | null;
  history: ClientSignOff[];
  scope: SignOffScope | null;
};

const short = (sha: string) => sha.slice(0, 10);
const answerWords: Record<SignOffAnswer, string> = { looks_good: 'Looks good', needs_changes: 'Needs changes' };

/** The commit status for a head: success for a current "looks good", failure for "needs changes", pending otherwise. */
export function signOffCommitStatus(current: ClientSignOff | null, headSha: string): SignOffCommitStatus {
  if (!current || current.headSha !== headSha) return { context: clientSignOffStatusContext, sha: headSha, state: 'pending', description: 'No current Client Sign-off on this commit.' };
  return current.answer === 'looks_good'
    ? { context: clientSignOffStatusContext, sha: headSha, state: 'success', description: current.scope.wholeChange ? 'The Client signed off the whole change.' : 'The Client signed off part of the change.' }
    : { context: clientSignOffStatusContext, sha: headSha, state: 'failure', description: 'The Client asked for changes.' };
}

/**
 * The comment's Markdown. It names the Client, the answer, the bound head and the coverage, and says the Agency decides
 * Acceptance. It never carries the person, the note, a price or spend, because everyone with forge access reads it.
 */
export function signOffCommentMarkdown(latest: ClientSignOff, headSha: string | null): string {
  const lines = ['### Client Sign-off', ''];
  if (latest.state === 'current') {
    const scope = latest.scope;
    lines.push(`**${answerWords[latest.answer]}** from the Client at \`${short(latest.headSha)}\`${latest.person.onBehalfOfClient ? ', recorded by the Agency on the Client’s behalf' : ''}.`, '');
    if (scope.missing) lines.push('Unfold could not read the changed files, so this sign-off does not claim any part of the change.');
    else {
      const total = scope.covered.length + scope.excluded.length;
      lines.push(scope.wholeChange ? `It covers the whole change: ${total} changed ${total === 1 ? 'file' : 'files'}.` : `It covers ${scope.covered.length} of ${total} changed ${total === 1 ? 'file' : 'files'}${scope.truncated ? '; the full list of changed files was not available, so it does not cover the whole change' : ''}.`);
      if (scope.excluded.length) lines.push('', 'Left out by the Agency’s exclusions:', ...scope.excluded.slice(0, 20).map(path => `- \`${path.replace(/`/g, '')}\``), ...(scope.excluded.length > 20 ? [`- and ${scope.excluded.length - 20} more`] : []));
    }
  } else if (latest.state === 'dismissed') {
    lines.push(`The Client’s sign-off at \`${short(latest.headSha)}\` was dismissed by a newer commit${latest.dismissedBy ? ` \`${short(latest.dismissedBy)}\`` : ''}. No Client Sign-off is current${headSha ? ` for \`${short(headSha)}\`` : ''}.`);
  } else {
    lines.push('The Client Sign-off was withdrawn. No Client Sign-off is current.');
  }
  lines.push('', 'A Client Sign-off is input to the Agency’s review. The Agency decides whether this pull request is accepted.');
  return lines.join('\n');
}

/** The job kind of a scheduled Client Sign-off comment write. */
export const clientSignOffCommentJob = 'client_sign_off.comment';

/**
 * Records and withdraws Client Sign-offs, dismisses them when the pull request's head moves, and keeps one keyed comment
 * on the pull request through Ploeg (Ploeg ADR-0079). A change queues a write {@link clientSignOffCommentDelayMs} later
 * in the durable job queue; further changes in that window join it, and a write whose text did not change is skipped.
 * A failed write is logged and retried with backoff a few times, and never undoes a Sign-off.
 */
export class ClientSignOffs {
  readonly store: ClientSignOffStore;
  private readonly source: ClientSignOffSource;
  private readonly options: ClientSignOffOptions;
  private readonly written = new Map<string, string>();

  constructor(source: ClientSignOffSource, store: ClientSignOffStore, options: ClientSignOffOptions) {
    this.source = source;
    this.store = store;
    this.options = options;
    options.jobs?.register<{ workItemId: string }>({
      kind: clientSignOffCommentJob, leaseMs: 120_000, backoff: { baseMs: 60_000, maxMs: 1_800_000 }, retainMs: 86_400_000,
      run: async job => {
        const workItemId = job.payload.workItemId;
        try {
          this.log('info', 'client_sign_off.comment', { workItem: workItemId, outcome: await this.publish(workItemId) });
          return { done: true };
        } catch (error) {
          const message = String((error as Error).message).slice(0, 200);
          this.log('warn', 'client_sign_off.comment_failed', { workItem: workItemId, message });
          return { retry: message };
        }
      },
    });
  }

  /** The Work Items whose comment write is queued. */
  pending(): string[] {
    const db = this.options.jobs?.queue.store.db;
    if (!db) return [];
    return (db.prepare("SELECT key FROM jobs WHERE kind=? AND state IN ('pending','running') ORDER BY id").all(clientSignOffCommentJob) as { key: string }[]).map(row => row.key);
  }

  /** The Work Item's current Sign-off, its history and the scope a Sign-off now would have, after dismissing stale ones. */
  async view(workItemId: string, client = unassignedClient): Promise<SignOffView> {
    const facts = await this.facts(workItemId);
    if (!(await this.options.enabled(facts.workItem.team))) fail(404, 'client_sign_off_off', 'Client Sign-off is not turned on for this Team.');
    const pullRequest = commentPullRequest(facts.pullRequests);
    const head = pullRequest ? pullRequestHead(pullRequest) : null;
    if (this.reconcile(workItemId, facts.pullRequests)) this.notice(workItemId);
    const history = this.store.forWorkItem(workItemId);
    const current = pullRequest ? history.find(entry => entry.state === 'current' && entry.pullRequest.id === pullRequest.id) ?? null : null;
    return {
      workItemId, team: facts.workItem.team,
      pullRequest: pullRequest ? { number: pullRequest.number, url: pullRequest.url, headSha: head } : null,
      current, history,
      scope: pullRequest && head ? await this.scope(client, pullRequest, head) : null,
    };
  }

  /** Records a Sign-off on the Work Item's newest open pull request at the head the person saw. */
  async record(person: SignOffPerson, workItemId: string, input: SignOffInput, client = unassignedClient): Promise<ClientSignOff> {
    if (!mayRecordSignOff(person)) fail(403, 'forbidden', 'Only an administrator or operator may record a Client Sign-off until Client users can sign in.');
    const answer = signOffAnswers.includes(input.answer as SignOffAnswer) ? input.answer as SignOffAnswer : fail(400, 'sign_off_answer', 'Answer looks_good or needs_changes.');
    const note = input.note === undefined || input.note === null ? '' : typeof input.note === 'string' && input.note.length <= clientSignOffLimits.note ? input.note.trim() : fail(400, 'sign_off_note', `A note is text of at most ${clientSignOffLimits.note} characters.`);
    if (answer === 'needs_changes' && !note) fail(400, 'sign_off_note_required', 'Say what should change.');
    const seen = typeof input.headSha === 'string' && /^[0-9a-f]{7,64}$/.test(input.headSha) ? input.headSha : fail(400, 'sign_off_head', 'Name the head commit you looked at.');
    const facts = await this.facts(workItemId);
    if (!(await this.options.enabled(facts.workItem.team))) fail(404, 'client_sign_off_off', 'Client Sign-off is not turned on for this Team.');
    const pullRequest = commentPullRequest(facts.pullRequests) ?? fail(409, 'no_open_pull_request', 'This Work Item has no open pull request to sign off.');
    const head = pullRequestHead(pullRequest) ?? fail(409, 'head_unknown', 'Ploeg has not reported the pull request’s head commit yet; look again shortly.');
    if (head !== seen && !head.startsWith(seen)) fail(409, 'head_moved', 'The change was updated; look again.');
    this.reconcile(workItemId, facts.pullRequests);
    const at = this.now();
    for (const previous of this.store.forWorkItem(workItemId)) if (previous.state === 'current' && previous.pullRequest.id === pullRequest.id) this.store.end(previous, 'superseded', at, person.id);
    const signOff: ClientSignOff = {
      id: randomUUID(), workItemId, client,
      pullRequest: { id: pullRequest.id, forge: pullRequest.forge, owner: pullRequest.owner, repo: pullRequest.repo, number: pullRequest.number },
      headSha: head, answer, note, scope: await this.scope(client, pullRequest, head),
      person: { id: person.id, name: person.name, role: person.role, attribution: person.attribution, onBehalfOfClient: true },
      recordedAt: at, state: 'current', dismissedBy: null, endedAt: null, endedBy: null,
    };
    this.store.add(signOff);
    this.notice(workItemId);
    return signOff;
  }

  /** Withdraws the current Sign-off of the Work Item's newest open pull request. */
  async withdraw(person: SignOffPerson, workItemId: string): Promise<ClientSignOff> {
    if (!mayRecordSignOff(person)) fail(403, 'forbidden', 'Only an administrator or operator may withdraw a Client Sign-off until Client users can sign in.');
    const facts = await this.facts(workItemId);
    if (!(await this.options.enabled(facts.workItem.team))) fail(404, 'client_sign_off_off', 'Client Sign-off is not turned on for this Team.');
    this.reconcile(workItemId, facts.pullRequests);
    const current = this.store.forWorkItem(workItemId).find(entry => entry.state === 'current') ?? fail(409, 'no_current_sign_off', 'No Client Sign-off is current, so there is nothing to withdraw.');
    const at = this.now();
    if (!this.store.end(current, 'withdrawn', at, person.id)) fail(409, 'no_current_sign_off', 'No Client Sign-off is current, so there is nothing to withdraw.');
    this.notice(workItemId);
    return { ...current, state: 'withdrawn', endedAt: at, endedBy: person.id };
  }

  /** Queues the comment of a Work Item, once per window. */
  notice(workItemId: string): void {
    const jobs = this.options.jobs;
    if (!jobs) return;
    const now = (this.options.now?.() ?? new Date()).getTime();
    jobs.queue.enqueue(clientSignOffCommentJob, workItemId, { workItemId }, now, { runAt: now + (this.options.delayMs ?? clientSignOffCommentDelayMs), maxAttempts: 3, repeat: 'when_finished' });
  }

  /** Writes the comment, and the commit status where a writer exists, of one Work Item now. */
  async publish(workItemId: string): Promise<SignOffCommentOutcome> {
    if (!(await this.source.factsSupported())) return 'unsupported';
    const facts = await this.source.workItemFacts(workItemId, true);
    this.reconcile(workItemId, facts.pullRequests);
    const pullRequest = commentPullRequest(facts.pullRequests);
    if (!pullRequest) return 'no_pull_request';
    const head = pullRequestHead(pullRequest);
    const latest = this.store.forWorkItem(workItemId).find(entry => entry.pullRequest.id === pullRequest.id && entry.state !== 'superseded');
    if (!latest) return 'no_sign_off';
    if (this.options.writeStatus && head) await this.options.writeStatus(workItemId, signOffCommitStatus(latest.state === 'current' ? latest : null, head));
    if (!(await this.options.commentEnabled(facts.workItem.team))) return 'flag_off';
    const markdown = markAiMarkdown(signOffCommentMarkdown(latest, head), { subject: 'pull-request', review: pullRequestReview(pullRequest) });
    const digest = createHash('sha256').update(`${pullRequest.number}\n${markdown}`).digest('hex');
    if (this.written.get(workItemId) === digest) return 'unchanged';
    await this.source.putPullRequestComment(workItemId, clientSignOffCommentKey, { markdown, number: pullRequest.number });
    this.written.set(workItemId, digest);
    return 'published';
  }

  private reconcile(workItemId: string, pullRequests: readonly FactsPullRequest[]): boolean {
    let changed = false;
    for (const signOff of this.store.forWorkItem(workItemId)) {
      if (signOff.state !== 'current') continue;
      const pullRequest = pullRequests.find(entry => entry.id === signOff.pullRequest.id);
      const head = pullRequest ? pullRequestHead(pullRequest) : null;
      if (pullRequest && pullRequest.state === 'open' && (!head || head === signOff.headSha)) continue;
      if (this.store.end(signOff, 'dismissed', this.now(), null, pullRequest?.state === 'open' ? head : null)) changed = true;
    }
    return changed;
  }

  private async scope(client: string, pullRequest: FactsPullRequest, head: string): Promise<SignOffScope> {
    const profile = this.store.exclusions(client, repositoryKey(pullRequest));
    let repository: string[] = [];
    if (profile?.repositoryFile && this.options.readFile) {
      try { const text = await this.options.readFile(pullRequest, head); repository = text ? parseSignOffFile(text) : []; }
      catch (error) { this.log('warn', 'client_sign_off.file_unreadable', { repository: repositoryKey(pullRequest), message: String((error as Error).message).slice(0, 200) }); }
    }
    return (this.options.rule ?? wholeChangeMinusExclusions).scope({ changedPaths: pullRequest.changedPaths?.headSha === head ? pullRequest.changedPaths : null, profile, repository });
  }

  private async facts(workItemId: string): Promise<Pick<WorkItemFacts, 'workItem' | 'pullRequests'>> {
    if (!(await this.source.factsSupported())) fail(503, 'facts_unavailable', 'Ploeg does not supply delivery facts, so Unfold cannot tell which commit a sign-off is for.');
    return this.source.workItemFacts(workItemId, true);
  }

  private now(): string { return (this.options.now?.() ?? new Date()).toISOString(); }

  private log(level: 'info' | 'warn', event: string, detail: Record<string, unknown>): void {
    (this.options.log ?? ((kind, name, fields) => (kind === 'info' ? console.log : console.error)(JSON.stringify({ level: kind, event: name, ...fields }))))(level, event, detail);
  }
}
