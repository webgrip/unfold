import { createHash } from 'node:crypto';
import { traceLines, type AgentTraceRecord } from './agent-trace.ts';
import type { LinkedSession, LinkedSessionStore } from './linked-sessions.ts';
import type { CommentRequest, CommentResult } from './cards/service.ts';
import type { FactsPullRequest, WorkItemFacts } from './cards/facts.ts';
import { markAiMarkdown, pullRequestReview } from './ai-marking.ts';
import type { JobWorker } from './jobs/worker.ts';

/** The key of Unfold's Agent Trace comment on a Work Item's pull request (Ploeg ADR-0079). */
export const agentTraceCommentKey = 'agent-trace';
/** How long Unfold waits after a stored record before it writes the comment, so a burst of commits makes one write. */
export const agentTraceCommentDelayMs = 5 * 60_000;
/** The most Linked Sessions, records per session and commit rows one comment reads and shows. */
export const agentTraceCommentLimits = { sessions: 50, records: 500, rows: 50 } as const;

/** The reads and the write the comment needs from Ploeg. */
export type AgentTraceCommentSource = {
  factsSupported(fresh?: boolean): Promise<boolean>;
  workItemFacts(id: string, fresh?: boolean): Promise<Pick<WorkItemFacts, 'workItem' | 'pullRequests'>>;
  putPullRequestComment(id: string, key: string, body: CommentRequest): Promise<CommentResult>;
};
/** What one publish did: wrote the comment, found it unchanged, or why it wrote nothing. */
export type AgentTraceCommentOutcome = 'published' | 'unchanged' | 'flag_off' | 'unsupported' | 'no_pull_request' | 'no_records';
export type AgentTraceCommentOptions = {
  /** Whether the Team may get the comment: the `linked.trace-comment` flag. */
  enabled: (team: string) => Promise<boolean>;
  delayMs?: number;
  /** The worker whose durable queue holds the scheduled writes. Without it, {@link AgentTraceComments.notice} schedules nothing. */
  jobs?: JobWorker;
  clock?: () => number;
  log?: (level: 'info' | 'warn', event: string, detail: Record<string, unknown>) => void;
};
/** The job kind of a scheduled Agent Trace comment write. */
export const agentTraceCommentJob = 'agent_trace.comment';

type CommitRow = { sha: string; subject: string; at: string; ai: number; files: number; sessions: Set<string> };

const cell = (value: string) => value.replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').replace(/[<>]/g, '');
const repoPath = (address: string) => address.toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '');

/** Whether a Linked Session's reported repository is the pull request's, or the session reported none. */
export function sameRepository(session: Pick<LinkedSession, 'repository'>, pullRequest: Pick<FactsPullRequest, 'owner' | 'repo'>): boolean {
  if (!session.repository) return true;
  const path = repoPath(session.repository);
  const want = `${pullRequest.owner}/${pullRequest.repo}`.toLowerCase();
  return path.endsWith(`/${want}`) || path.endsWith(`:${want}`);
}

/** The pull request the comment belongs on: the Work Item's newest open one, or null when none is open. */
export function commentPullRequest(pullRequests: readonly FactsPullRequest[]): FactsPullRequest | null {
  const open = pullRequests.filter(entry => entry.state === 'open');
  return open.sort((a, b) => (b.openedAt ?? b.firstSeenAt).localeCompare(a.openedAt ?? a.firstSeenAt) || b.number - a.number)[0] ?? null;
}

/**
 * The comment's Markdown: AI-written lines per commit from the stored Agent Trace records of the Work Item's Linked
 * Sessions, with a link to each session's Unfold page. It carries counts and links only: no prompt, cost, model or
 * telemetry, and no clock time, so the same records always give the same text.
 */
export function agentTraceCommentMarkdown(entries: readonly { session: LinkedSession; records: readonly AgentTraceRecord[] }[], base: string): string | null {
  const rows = new Map<string, CommitRow>();
  const order = new Map<string, number>();
  entries.forEach((entry, index) => order.set(entry.session.id, index + 1));
  for (const { session, records } of entries) for (const record of records) {
    const sha = record.vcs?.revision;
    if (!sha) continue;
    const lines = traceLines(record);
    const row = rows.get(sha) ?? { sha, subject: session.commits.find(commit => commit.sha === sha)?.subject ?? '', at: record.timestamp, ai: 0, files: 0, sessions: new Set<string>() };
    row.ai += lines.ai;
    row.files = Math.max(row.files, lines.files);
    row.subject ||= session.commits.find(commit => commit.sha === sha)?.subject ?? '';
    if (record.timestamp < row.at) row.at = record.timestamp;
    row.sessions.add(session.id);
    rows.set(sha, row);
  }
  const commits = [...rows.values()].filter(row => row.ai > 0).sort((a, b) => a.at.localeCompare(b.at) || a.sha.localeCompare(b.sha));
  if (!commits.length) return null;
  const page = (id: string) => `${base.replace(/\/+$/, '')}/#linked-session/${encodeURIComponent(id)}`;
  const total = commits.reduce((sum, row) => sum + row.ai, 0);
  const sessions = new Set(commits.flatMap(row => [...row.sessions]));
  const body = [
    '### Which lines agents wrote',
    '',
    `Agents wrote **${total.toLocaleString('en-US')} ${total === 1 ? 'line' : 'lines'}** in ${commits.length} ${commits.length === 1 ? 'commit' : 'commits'}, from ${sessions.size} linked agent ${sessions.size === 1 ? 'session' : 'sessions'}. The counts come from the [Agent Trace](https://agent-trace.dev/) records those sessions sent to Unfold. Read the AI-written lines first; lines a person wrote are not counted.`,
    '',
    '| Commit | AI-written lines | Files | Session |',
    '| --- | ---: | ---: | --- |',
    ...commits.slice(0, agentTraceCommentLimits.rows).map(row => `| \`${row.sha.slice(0, 10)}\`${row.subject ? ` ${cell(row.subject.slice(0, 80))}` : ''} | ${row.ai.toLocaleString('en-US')} | ${row.files} | ${[...row.sessions].map(id => `[session ${order.get(id)}](${page(id)})`).join(', ')} |`),
    ...(commits.length > agentTraceCommentLimits.rows ? ['', `${commits.length - agentTraceCommentLimits.rows} older commits are not listed.`] : []),
    '',
    'Session pages open in Unfold for people who may read this Work Item. Unfold replaces this comment when a linked session records another commit.',
  ];
  return body.join('\n');
}

/**
 * Keeps one Agent Trace comment on each Work Item's open pull request through Ploeg's keyed comment: a stored record
 * for a session linked to the Work Item queues a write {@link agentTraceCommentDelayMs} later in the durable job
 * queue, further records in that window join it, and a write whose text did not change is skipped. Ploeg replaces the
 * keyed comment, so a repeated write never adds a second comment.
 */
export class AgentTraceComments {
  private readonly source: AgentTraceCommentSource;
  private readonly store: LinkedSessionStore;
  private readonly options: AgentTraceCommentOptions;
  private readonly written = new Map<string, string>();

  constructor(source: AgentTraceCommentSource, store: LinkedSessionStore, options: AgentTraceCommentOptions) {
    this.source = source;
    this.store = store;
    this.options = options;
    options.jobs?.register<{ workItemId: string; base: string }>({
      kind: agentTraceCommentJob, leaseMs: 120_000, backoff: { baseMs: 60_000, maxMs: 1_800_000 }, retainMs: 86_400_000,
      run: async job => {
        try {
          const outcome = await this.publish(job.payload.workItemId, job.payload.base);
          this.log('info', 'agent_trace.comment', { workItem: job.payload.workItemId, outcome });
          return { done: true };
        } catch (error) {
          const message = String((error as Error).message).slice(0, 200);
          this.log('warn', 'agent_trace.comment_failed', { workItem: job.payload.workItemId, message });
          return { retry: message };
        }
      },
    });
  }

  private now(): number { return (this.options.clock ?? Date.now)(); }

  /** The Work Items whose comment write is queued. */
  pending(): string[] {
    const db = this.options.jobs?.queue.store.db;
    if (!db) return [];
    return (db.prepare("SELECT key FROM jobs WHERE kind=? AND state IN ('pending','running') ORDER BY id").all(agentTraceCommentJob) as { key: string }[]).map(row => row.key);
  }

  /** Queues the comment of each Work Item, once per window; `base` is the workbench address the session links use. */
  notice(workItemIds: readonly string[], base: string): void {
    const jobs = this.options.jobs;
    if (!jobs) return;
    const now = this.now();
    for (const id of new Set(workItemIds)) {
      const queued = jobs.queue.enqueue(agentTraceCommentJob, id, { workItemId: id, base }, now, { runAt: now + (this.options.delayMs ?? agentTraceCommentDelayMs), maxAttempts: 5, repeat: 'when_finished' }).queued;
      if (!queued) jobs.queue.update(agentTraceCommentJob, id, { workItemId: id, base }, now);
    }
  }

  /** Writes the comment of one Work Item now, when its Team has the flag and it has an open pull request. */
  async publish(id: string, base: string): Promise<AgentTraceCommentOutcome> {
    if (!(await this.source.factsSupported())) return 'unsupported';
    const facts = await this.source.workItemFacts(id, true);
    if (!(await this.options.enabled(facts.workItem.team))) return 'flag_off';
    const pullRequest = commentPullRequest(facts.pullRequests);
    if (!pullRequest) return 'no_pull_request';
    const entries = this.store.forWorkItem(id, agentTraceCommentLimits.sessions).filter(session => sameRepository(session, pullRequest)).reverse()
      .map(session => ({ session, records: this.store.traces({ sessionId: session.id }, agentTraceCommentLimits.records).map(entry => entry.record) }));
    const table = agentTraceCommentMarkdown(entries, base);
    if (!table) return 'no_records';
    const markdown = markAiMarkdown(table, { subject: 'pull-request', review: pullRequestReview(pullRequest), agentTraces: entries.flatMap(entry => entry.records.map(record => record.id)) });
    const digest = createHash('sha256').update(`${pullRequest.number}\n${markdown}`).digest('hex');
    if (this.written.get(id) === digest) return 'unchanged';
    await this.source.putPullRequestComment(id, agentTraceCommentKey, { markdown, number: pullRequest.number });
    this.written.set(id, digest);
    return 'published';
  }

  private log(level: 'info' | 'warn', event: string, detail: Record<string, unknown>): void {
    (this.options.log ?? ((kind, name, fields) => (kind === 'info' ? console.log : console.error)(JSON.stringify({ level: kind, event: name, ...fields }))))(level, event, detail);
  }
}
