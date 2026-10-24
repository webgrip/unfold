import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { LinkedSessions, parseLinkedEvent, type LinkedPloeg } from '../src/linked-sessions.ts';
import { foreignTool, parseAgentTrace, type AgentTraceRecord } from '../src/agent-trace.ts';
import { aiHunksFirst, attributeHunks } from '../src/agent-trace-hunks.ts';
import { AgentTraceComments, agentTraceCommentKey, agentTraceCommentMarkdown, commentPullRequest, sameRepository, type AgentTraceCommentSource } from '../src/agent-trace-comments.ts';
import type { CommentRequest } from '../src/cards/service.ts';
import type { FactsPullRequest } from '../src/cards/facts.ts';
import type { AppConfig, User } from '../src/types.ts';
import { linkedSessionPage } from '../public/core/linked-sessions.js';

const owner: User = { id: 'u-ryan', name: 'ryan', role: 'operator' };
const base = 'https://unfold.example.org';
const at = new Date('2026-10-24T10:00:00.000Z');
const shaA = 'a'.repeat(40);
const shaB = 'b'.repeat(40);

const record = (revision: string, fields: Partial<AgentTraceRecord> & { ranges?: { start_line: number; end_line: number }[]; path?: string } = {}) => parseAgentTrace({
  version: '0.1', id: crypto.randomUUID(), timestamp: fields.timestamp ?? '2026-10-24T09:00:00Z', vcs: { type: 'git', revision }, tool: fields.tool ?? { name: 'claude-code', version: '2.1.302' },
  files: [{ path: fields.path ?? 'src/login.ts', conversations: [{ url: `${base}/#linked-session/x`, contributor: { type: 'ai', model_id: 'anthropic/claude-opus-5-5' }, ranges: fields.ranges ?? [{ start_line: 1, end_line: 4 }] }] }],
  ...(fields.metadata ? { metadata: fields.metadata } : {}),
});

function ploegFor(readable: string[] = ['184']): LinkedPloeg {
  return {
    async detail(_user, id) { if (!readable.includes(id)) throw Object.assign(new Error('not found'), { status: 404 }); return { item: { id, title: 'Fix login', provider: 'vikunja', externalId: '2051' } }; },
    async trackerItems() { return { items: [] }; },
  };
}

const pullRequest = (fields: Partial<FactsPullRequest> = {}) => ({ id: '9', forge: 'forgejo', owner: 'webgrip', repo: 'unfold', number: 42, url: 'https://forgejo.example.org/webgrip/unfold/pulls/42', state: 'open', openedAt: '2026-10-24T08:00:00Z', firstSeenAt: '2026-10-24T08:00:00Z', branch: 'feat/vik-2051-login', ...fields }) as FactsPullRequest;

function fakeSource(pullRequests: FactsPullRequest[] = [pullRequest()], team = 'bronze') {
  const puts: { id: string; key: string; body: CommentRequest }[] = [];
  const source: AgentTraceCommentSource = {
    async factsSupported() { return true; },
    async workItemFacts(id) { return { workItem: { id, team } as never, pullRequests }; },
    async putPullRequestComment(id, key, body) { puts.push({ id, key, body }); return { pullRequest: { id: '9', forge: 'forgejo', owner: 'webgrip', repo: 'unfold', number: body.number ?? 42 }, commentId: 7, imageUrl: null, created: puts.length === 1 }; },
  };
  return { source, puts };
}

async function linkedWithTraces() {
  const linked = new LinkedSessions(new DatabaseSync(':memory:'), {} as AppConfig, ploegFor(), { now: () => at });
  const id = '0f6c1c9e-1111-4222-8333-944445555666';
  await linked.report(owner, parseLinkedEvent({ harness: 'claude-code', sessionId: id, event: 'start', workItem: '184', repository: 'git@forgejo.example.org:webgrip/unfold.git' }, at), base);
  await linked.report(owner, parseLinkedEvent({ harness: 'claude-code', sessionId: id, event: 'commit', commit: { sha: shaA, subject: 'feat: login | form', trailer: true } }, at), base);
  linked.addTrace(owner, id, record(shaA, { metadata: { 'dev.unfoldhq': { session_id: id } } }));
  return { linked, id };
}

test('records from any tool are stored, and a commit names the tool when it is not Unfold’s plugin', async () => {
  const { linked, id } = await linkedWithTraces();
  assert.equal(foreignTool(record(shaA, { metadata: { 'dev.unfoldhq': {} } })), null);
  assert.equal(foreignTool(record(shaA, { tool: { name: 'cursor', version: '2.4.0' } })), 'cursor 2.4.0');
  for (const [name, sha] of [['cursor', shaB], ['opencode', 'c'.repeat(40)], ['git-ai', 'd'.repeat(40)]]) assert.equal(linked.addTrace(owner, id, record(sha, { tool: { name, version: '1.0.0' } })).stored, true);
  const shown = await linked.view(owner, id, base);
  assert.deepEqual(shown.commits.map(commit => commit.tool ?? null), [null, 'cursor 1.0.0', 'opencode 1.0.0', 'git-ai 1.0.0']);
  const html = linkedSessionPage(shown, { now: at.getTime() });
  assert.match(html, /<span class="mono" title="Agent Trace record written by cursor 1\.0\.0, not by Unfold's plugin">cursor 1\.0\.0<\/span> · /);
  assert.doesNotMatch(html, /claude-code 2\.1\.302<\/span> · /, 'the plugin’s own records name no tool');
  assert.equal((await linked.tracesFor(owner, shaB))[0].record.tool?.name, 'cursor');
});

test('the comment goes on the newest open pull request, for sessions of its repository, with counts and session links only', async () => {
  assert.equal(commentPullRequest([pullRequest({ state: 'merged' })]), null);
  assert.equal(commentPullRequest([pullRequest({ number: 1, openedAt: '2026-10-01T00:00:00Z' }), pullRequest({ number: 2, openedAt: '2026-10-02T00:00:00Z' }), pullRequest({ number: 3, state: 'closed' })])?.number, 2);
  assert.equal(sameRepository({ repository: 'forgejo.example.org:webgrip/unfold.git' }, pullRequest()), true);
  assert.equal(sameRepository({ repository: 'https://forgejo.example.org/webgrip/unfold-site' }, pullRequest()), false);
  assert.equal(sameRepository({ repository: '' }, pullRequest()), true);
  const { linked, id } = await linkedWithTraces();
  const session = linked.store.get(id)!;
  const markdown = agentTraceCommentMarkdown([{ session, records: [record(shaA), record(shaB, { ranges: [{ start_line: 1, end_line: 1 }], timestamp: '2026-10-24T09:30:00Z' })] }], `${base}/`)!;
  assert.match(markdown, /Agents wrote \*\*5 lines\*\* in 2 commits, from 1 linked agent session/);
  assert.match(markdown, new RegExp(`\\| \`aaaaaaaaaa\` feat: login \\\\\\| form \\| 4 \\| 1 \\| \\[session 1\\]\\(${base}/#linked-session/${id}\\) \\|`));
  assert.doesNotMatch(markdown, /claude-opus|cost|token|\$|telemetry/i, 'no model, cost or telemetry');
  assert.equal(agentTraceCommentMarkdown([{ session, records: [] }], base), null);
});

test('stored records schedule one comment write per Work Item and window, a repeat with the same text writes nothing, and a Team without the flag gets none', async () => {
  const { linked, id } = await linkedWithTraces();
  const { source, puts } = fakeSource();
  const timers: { run: () => void; ms: number }[] = [];
  let flag = true;
  const logged: string[] = [];
  const comments = new AgentTraceComments(source, linked.store, { enabled: async team => flag && team === 'bronze', schedule: (run, ms) => timers.push({ run, ms }), log: (_level, event, detail) => logged.push(`${event}:${detail.outcome ?? detail.message}`) });
  comments.notice(['184'], base);
  comments.notice(['184', '184'], base);
  assert.deepEqual(timers.map(timer => timer.ms), [300_000], 'a burst of records makes one write five minutes later');
  assert.deepEqual(comments.pending(), ['184']);
  timers[0].run();
  await new Promise(done => setImmediate(done));
  assert.deepEqual(comments.pending(), []);
  assert.equal(puts.length, 1);
  assert.equal(puts[0].key, agentTraceCommentKey);
  assert.equal(puts[0].body.number, 42);
  assert.match(puts[0].body.markdown, /4 lines/);
  assert.deepEqual(logged, ['agent_trace.comment:published']);

  assert.equal(await comments.publish('184', base), 'unchanged', 'the same records give the same text, so nothing is written');
  linked.addTrace(owner, id, record(shaB, { ranges: [{ start_line: 1, end_line: 2 }] }));
  assert.equal(await comments.publish('184', base), 'published');
  assert.equal(puts.length, 2, 'Ploeg replaces the keyed comment; Unfold writes it again instead of appending');
  assert.match(puts[1].body.markdown, /6 lines\*\* in 2 commits/);

  flag = false;
  linked.addTrace(owner, id, record('e'.repeat(40)));
  assert.equal(await comments.publish('184', base), 'flag_off');
  assert.equal(await new AgentTraceComments(fakeSource([pullRequest({ state: 'merged' })]).source, linked.store, { enabled: async () => true }).publish('184', base), 'no_pull_request');
  assert.equal(await new AgentTraceComments(fakeSource([pullRequest({ repo: 'other' })]).source, linked.store, { enabled: async () => true }).publish('184', base), 'no_records', 'sessions of another repository are left out');
  const failing = { ...fakeSource().source, async putPullRequestComment(): Promise<never> { throw new Error('ploeg down'); } };
  const later: (() => void)[] = [];
  new AgentTraceComments(failing, linked.store, { enabled: async () => true, schedule: run => later.push(run), log: (_level, event, detail) => logged.push(`${event}:${detail.message}`) }).notice(['184'], base);
  later[0]();
  await new Promise(done => setImmediate(done));
  assert.equal(logged.at(-1), 'agent_trace.comment_failed:ploeg down', 'a failed write is logged, never thrown into the request');
});

test('each hunk of a diff carries its AI-written line count, and AI hunks read first', () => {
  const diff = [
    'diff --git a/src/login.ts b/src/login.ts',
    '--- a/src/login.ts',
    '+++ b/src/login.ts',
    '@@ -1,2 +1,4 @@',
    ' const checked = true;',
    '-export function login() {}',
    '+export function login(user) {',
    '+  return check(user);',
    '+}',
    '@@ -10,2 +11,3 @@ export function logout() {',
    ' const a = 1;',
    '+--- a line that looks like a header',
    ' const b = 2;',
    'diff --git a/README.md b/README.md',
    '--- a/README.md',
    '+++ b/README.md',
    '@@ -5 +5,2 @@',
    '-old',
    '+new',
    '+by a person',
    '\\ No newline at end of file',
    'diff --git a/gone.txt b/gone.txt',
    '--- a/gone.txt',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-bye',
  ].join('\n');
  const records = [
    record(shaA, { ranges: [{ start_line: 2, end_line: 3 }] }),
    record(shaA, { tool: { name: 'cursor', version: '2' }, ranges: [{ start_line: 3, end_line: 4 }, { start_line: 12, end_line: 12 }] }),
    parseAgentTrace({ version: '0.1', id: crypto.randomUUID(), timestamp: '2026-10-24T09:00:00Z', files: [{ path: 'README.md', conversations: [{ contributor: { type: 'human' }, ranges: [{ start_line: 5, end_line: 6 }] }] }] }),
  ];
  const hunks = attributeHunks(diff, records);
  assert.deepEqual(hunks.map(hunk => [hunk.path, hunk.newStart, hunk.added, hunk.removed, hunk.aiLines]), [['src/login.ts', 1, 3, 1, 3], ['src/login.ts', 11, 1, 0, 1], ['README.md', 5, 2, 1, 0], ['gone.txt', 0, 0, 1, 0]], 'a line two tools claim counts once, a human range counts not at all, and an added line starting with --- stays in its hunk');
  assert.deepEqual(aiHunksFirst(hunks).map(hunk => hunk.index), [0, 1, 2, 3]);
  assert.deepEqual(aiHunksFirst([...hunks].reverse()).map(hunk => [hunk.path, hunk.newStart]), [['src/login.ts', 1], ['src/login.ts', 11], ['README.md', 5], ['gone.txt', 0]]);
  assert.deepEqual(attributeHunks('', records), []);
});
