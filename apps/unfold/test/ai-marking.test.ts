import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { execFileSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { aiCommitTrailers, aiDisclosure, aiGeneratedLabel, aiGeneratedMarker, markAiMarkdown, pullRequestReview, readAiMarking, withTrailers } from '../src/ai-marking.ts';
import { ForgejoPublisher, pullRequestBody, type PublicationFacts } from '../src/delivery-publisher.ts';
import { canonicalizeCandidate } from '../src/trusted-candidate.ts';
import { deliveryFixture } from './delivery-fixture.ts';
import { ClientSignOffStore, ClientSignOffs, type SignOffPerson } from '../src/client-sign-off.ts';
import { AgentTraceComments, type AgentTraceCommentSource } from '../src/agent-trace-comments.ts';
import { LinkedSessions, parseLinkedEvent, type LinkedPloeg } from '../src/linked-sessions.ts';
import { parseAgentTrace } from '../src/agent-trace.ts';
import type { CommentRequest } from '../src/cards/service.ts';
import type { FactsPullRequest } from '../src/cards/facts.ts';
import type { AppConfig, User } from '../src/types.ts';

const shaA = 'a'.repeat(40);
const traceId = '0f6c1c9e-1111-4222-8333-944445555666';
const pullRequest = (fields: Partial<FactsPullRequest> = {}) => ({
  id: '9', forge: 'forgejo', owner: 'webgrip', repo: 'shop', number: 42, url: 'https://forgejo.example.org/webgrip/shop/pulls/42', state: 'open',
  openedAt: '2026-10-29T08:00:00Z', firstSeenAt: '2026-10-29T08:00:00Z', headSha: shaA, branch: 'feat/vik-2051-login', reviews: [], ...fields,
}) as FactsPullRequest;
const approvedBy = (reviewer: string, headSha: string | null = shaA, receivedAt = '2026-10-29T09:00:00Z') => ({ reviewer, state: 'APPROVED', headSha, receivedAt });

test('the sentence names who reviewed the AI-written change, or says it awaits review', () => {
  assert.equal(aiDisclosure({ state: 'approved', by: ['Ryan'] }), 'Written by an AI agent and reviewed by Ryan.');
  assert.equal(aiDisclosure({ state: 'approved', by: ['ann', 'bob', 'cy'] }), 'Written by an AI agent and reviewed by ann, bob and cy.');
  assert.equal(aiDisclosure({ state: 'merged', by: 'ann' }), 'Written by an AI agent and merged by ann without a recorded approval.');
  assert.equal(aiDisclosure({ state: 'pending' }), 'Written by an AI agent and awaiting review by a person.');
  assert.equal(aiDisclosure({ state: 'approved', by: [] }), 'Written by an AI agent and awaiting review by a person.');
  assert.equal(aiDisclosure({ state: 'approved', by: ['@team *x*\n- Merge: automatic'] }), 'Written by an AI agent and reviewed by @​team \\*x\\* - Merge: automatic.');
});

test('the marker is one HTML comment a reviewer name or session address cannot close early, and it reads back', () => {
  const marker = aiGeneratedMarker({ subject: 'pull-request', review: { state: 'approved', by: ['Ann --> <b>x</b>', 'Bob'] }, agentTraces: [traceId.toUpperCase(), 'not-a-uuid', traceId], session: 'https://unfold.example/#session/a b>c' });
  assert.equal(marker.indexOf('-->'), marker.length - 3);
  assert.equal(marker.split('\n').length, 1);
  assert.match(marker, /^<!-- unfold:ai-generated v=1 subject=pull-request review=approved reviewer=Ann%20--%3E%20%3Cb%3Ex%3C%2Fb%3E reviewer=Bob agent-trace=0f6c1c9e-1111-4222-8333-944445555666 session=https:\/\/unfold\.example\/#session\/a%20b%3Ec -->$/);
  assert.deepEqual(readAiMarking(`text\n${marker}\nmore`), { version: 1, subject: 'pull-request', review: 'approved', reviewers: ['Ann --> <b>x</b>', 'Bob'], agentTraces: [traceId], session: 'https://unfold.example/#session/a%20b%3Ec' });
  assert.equal(readAiMarking('no marker here'), null);
  assert.doesNotMatch(aiGeneratedMarker({ subject: 'commit', review: { state: 'pending' }, session: 'https://user:secret@unfold.example/' }), /session=|secret/);
});

test('marking Markdown puts the marker and sentence first, once', () => {
  const marked = markAiMarkdown('### Body', { subject: 'pull-request', review: { state: 'pending' } });
  assert.equal(marked, '<!-- unfold:ai-generated v=1 subject=pull-request review=pending -->\n_Written by an AI agent and awaiting review by a person._\n\n### Body');
  assert.equal(markAiMarkdown(marked, { subject: 'pull-request', review: { state: 'approved', by: ['x'] } }), marked);
});

test('the review counts each reviewer’s latest verdict on the current head, then the merger, then pending', () => {
  assert.deepEqual(pullRequestReview(pullRequest({ reviews: [approvedBy('ann'), approvedBy('bob', null)] })), { state: 'approved', by: ['ann', 'bob'] });
  assert.deepEqual(pullRequestReview(pullRequest({ reviews: [approvedBy('ann', 'b'.repeat(40))] })), { state: 'pending' }, 'an approval of an older head does not count');
  assert.deepEqual(pullRequestReview(pullRequest({ reviews: [approvedBy('ann'), { reviewer: 'ann', state: 'REQUEST_CHANGES', headSha: shaA, receivedAt: '2026-10-29T10:00:00Z' }] })), { state: 'pending' }, 'a later request for changes replaces the approval');
  assert.deepEqual(pullRequestReview(pullRequest({ reviews: [{ reviewer: 'bot', state: 'COMMENT', headSha: shaA, receivedAt: '2026-10-29T10:00:00Z' }] })), { state: 'pending' });
  assert.deepEqual(pullRequestReview(pullRequest({ state: 'merged', mergedBy: 'cy' })), { state: 'merged', by: 'cy' });
  assert.deepEqual(pullRequestReview({ headSha: null, reviews: undefined as never }), { state: 'pending' });
});

test('commit trailers follow the kernel’s Assisted-by tag, Agent-Trace-Id and Unfold-Session, and never sign for the agent', () => {
  assert.deepEqual(aiCommitTrailers({ agent: 'opencode', model: 'qwen3 coder', agentTrace: 'run-42', session: 'https://unfold.example/#session/s1' }), ['Assisted-by: opencode:qwen3-coder', 'Agent-Trace-Id: run-42', 'Unfold-Session: https://unfold.example/#session/s1']);
  assert.deepEqual(aiCommitTrailers({ agent: 'claude-code\nSigned-off-by: x', agentTrace: 'bad id\n', session: 'javascript:alert(1)' }), ['Assisted-by: claude-code-Signed-off-by:-x']);
  assert.equal(withTrailers('Subject\n\nArtifact: abc\nPolicy: def', ['Assisted-by: opencode']), 'Subject\n\nArtifact: abc\nPolicy: def\nAssisted-by: opencode\n');
  assert.equal(withTrailers('Subject\n\nA paragraph of prose.', ['Assisted-by: opencode']), 'Subject\n\nA paragraph of prose.\n\nAssisted-by: opencode\n');
  assert.equal(withTrailers('Subject', ['Assisted-by: opencode']), 'Subject\n\nAssisted-by: opencode\n');
  assert.equal(withTrailers('Subject\n\nAssisted-by: opencode\n', ['Assisted-by: opencode']), 'Subject\n\nAssisted-by: opencode\n');
});

test('path: the canonical delivery commit carries the AI trailers git reads as trailers', async () => {
  const f = await deliveryFixture();
  try {
    await f.fix(); await f.capture('marked');
    const candidate = await canonicalizeCandidate(f.dataDir, 'marked', f.policy, { agent: 'opencode', model: 'qwen3-coder', session: 'https://unfold.example/#session/marked' });
    const message = execFileSync('git', ['--git-dir', candidate.gitDirectory, 'log', '-1', '--format=%B', candidate.canonicalSha], { encoding: 'utf8' });
    const trailers = execFileSync('git', ['interpret-trailers', '--parse'], { input: message, encoding: 'utf8' }).trim().split('\n');
    assert.ok(message.startsWith('Verified delivery candidate marked\n'));
    for (const line of ['Assisted-by: opencode:qwen3-coder', 'Unfold-Session: https://unfold.example/#session/marked']) assert.ok(trailers.includes(line), line);
    assert.ok(trailers.some(line => line.startsWith('Artifact: ')) && trailers.some(line => line.startsWith('Policy: ')), 'the existing artifact and policy lines stay in the same trailer block');
  } finally { await f.cleanup(); }
});

test('path: the delivery pull request body carries the marker and names the approver as reviewer', () => {
  const facts: PublicationFacts = { workItemId: '1980', sessionId: 'publish', sessionUrl: 'https://unfold.example/#session/publish', title: 'Title', candidateId: 'b'.repeat(32), receiptId: 'c'.repeat(32), approvalId: 'd'.repeat(32), canonicalSha: shaA, baseSha: 'b'.repeat(40), treeSha: 'c'.repeat(40), policySha256: 'd'.repeat(64), verifierId: 'unfold-docker-v1', approver: 'ryan' };
  const lines = pullRequestBody('pub-x', facts).split('\n');
  assert.equal(lines[0], '<!-- unfold-publication: pub-x -->');
  assert.equal(lines[1], '<!-- unfold:ai-generated v=1 subject=pull-request review=approved reviewer=ryan session=https://unfold.example/#session/publish -->');
  assert.equal(lines[2], '_Written by an AI agent and reviewed by ryan._');
});

async function fakeLabelForge(options: { existing?: boolean; refuseCreate?: boolean; refuseList?: boolean }) {
  const seen = { created: [] as unknown[], pullBodies: [] as Record<string, unknown>[] };
  const read = async (req: IncomingMessage) => { const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk as Buffer); return JSON.parse(Buffer.concat(chunks).toString() || '{}'); };
  const reply = (res: ServerResponse, status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://forge');
    if (url.pathname === '/api/v1/repos/owner/repo/labels' && req.method === 'GET') return options.refuseList ? reply(res, 403, {}) : reply(res, 200, [{ id: 3, name: 'bug' }, ...(options.existing ? [{ id: 7, name: aiGeneratedLabel.name }] : [])]);
    if (url.pathname === '/api/v1/repos/owner/repo/labels' && req.method === 'POST') { seen.created.push(await read(req)); return options.refuseCreate ? reply(res, 403, {}) : reply(res, 201, { id: 11, name: aiGeneratedLabel.name }); }
    if (url.pathname === '/api/v1/repos/owner/repo/pulls' && req.method === 'POST') { const body = await read(req); seen.pullBodies.push(body); return reply(res, 201, { number: 1, html_url: 'x', body: body.body, state: 'open', head: { ref: body.head, sha: shaA }, base: { ref: body.base } }); }
    reply(res, 404, {});
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.AIMARK_PUBLISHER_TOKEN = 't'.repeat(40);
  const publisher = new ForgejoPublisher({ kind: 'forgejo', apiUrl: `${origin}/api/v1`, tokenEnv: 'AIMARK_PUBLISHER_TOKEN' } as never, { plainHttp: true });
  return { seen, publisher, repositoryUrl: `${origin}/owner/repo.git`, close: () => server.close() };
}

test('path: the delivery pull request gets the ai-generated label, created when missing, and still opens when the forge refuses it', async () => {
  for (const [options, label, creates] of [[{ existing: true }, 7, 0], [{}, 11, 1], [{ refuseCreate: true }, undefined, 1], [{ refuseList: true }, undefined, 0]] as const) {
    const forge = await fakeLabelForge(options);
    try {
      await forge.publisher.createPullRequest(forge.repositoryUrl, { head: 'h', base: 'main', title: 't', body: 'b' });
      assert.deepEqual(forge.seen.pullBodies[0].labels, label === undefined ? undefined : [label], JSON.stringify(options));
      assert.equal(forge.seen.created.length, creates);
      if (creates) assert.deepEqual(forge.seen.created[0], { ...aiGeneratedLabel });
    } finally { forge.close(); }
  }
});

test('path: the Client Sign-off comment opens with the AI marking of the agent’s pull request', async () => {
  const puts: CommentRequest[] = [];
  const world = { pullRequests: [pullRequest({ changedPaths: { headSha: shaA, truncated: false, capturedAt: '2026-10-29T09:00:00Z', paths: [{ path: 'src/a.ts', status: 'modified' }] } })] };
  const signOffs = new ClientSignOffs({
    factsSupported: async () => true,
    workItemFacts: async id => ({ workItem: { id, team: 'bronze' } as never, pullRequests: world.pullRequests }),
    putPullRequestComment: async (_id, _key, body) => { puts.push(body); return { pullRequest: { id: '9', forge: 'forgejo', owner: 'webgrip', repo: 'shop', number: 42 }, commentId: 7, imageUrl: null, created: puts.length === 1 }; },
  }, new ClientSignOffStore(new DatabaseSync(':memory:')), { enabled: async () => true, commentEnabled: async () => true, schedule: () => undefined });
  const person: SignOffPerson = { id: 'u-olga', name: 'olga', role: 'operator', attribution: 'proven' };
  await signOffs.record(person, '184', { answer: 'looks_good', headSha: shaA });
  assert.equal(await signOffs.publish('184'), 'published');
  assert.match(puts[0].markdown, /^<!-- unfold:ai-generated v=1 subject=pull-request review=pending -->\n_Written by an AI agent and awaiting review by a person\._\n\n### Client Sign-off/);
  world.pullRequests = [{ ...world.pullRequests[0], reviews: [approvedBy('dev-ann')] }];
  assert.equal(await signOffs.publish('184'), 'published', 'an approval changes the comment, so it is written again');
  assert.match(puts[1].markdown, /review=approved reviewer=dev-ann -->\n_Written by an AI agent and reviewed by dev-ann\._/);
});

test('path: the Agent Trace comment carries the marker with the record ids it counts', async () => {
  const owner: User = { id: 'u-ryan', name: 'ryan', role: 'operator' };
  const base = 'https://unfold.example.org';
  const at = new Date('2026-10-24T10:00:00.000Z');
  const ploeg: LinkedPloeg = { async detail(_user, id) { return { item: { id, title: 'Fix login', provider: 'vikunja', externalId: '2051' } }; }, async trackerItems() { return { items: [] }; } };
  const linked = new LinkedSessions(new DatabaseSync(':memory:'), {} as AppConfig, ploeg, { now: () => at });
  const session = '0f6c1c9e-2222-4222-8333-944445555666';
  await linked.report(owner, parseLinkedEvent({ harness: 'claude-code', sessionId: session, event: 'start', workItem: '184', repository: 'git@forgejo.example.org:webgrip/shop.git' }, at), base);
  await linked.report(owner, parseLinkedEvent({ harness: 'claude-code', sessionId: session, event: 'commit', commit: { sha: shaA, subject: 'feat: login', trailer: true } }, at), base);
  linked.addTrace(owner, session, parseAgentTrace({ version: '0.1', id: traceId, timestamp: '2026-10-24T09:00:00Z', vcs: { type: 'git', revision: shaA }, files: [{ path: 'src/login.ts', conversations: [{ contributor: { type: 'ai' }, ranges: [{ start_line: 1, end_line: 4 }] }] }] }));
  const puts: CommentRequest[] = [];
  const source: AgentTraceCommentSource = {
    async factsSupported() { return true; },
    async workItemFacts(id) { return { workItem: { id, team: 'bronze' } as never, pullRequests: [pullRequest({ reviews: [approvedBy('dev-ann')] })] }; },
    async putPullRequestComment(_id, _key, body) { puts.push(body); return { pullRequest: { id: '9', forge: 'forgejo', owner: 'webgrip', repo: 'shop', number: 42 }, commentId: 7, imageUrl: null, created: true }; },
  };
  const comments = new AgentTraceComments(source, linked.store, { enabled: async () => true, schedule: () => undefined });
  assert.equal(await comments.publish('184', base), 'published');
  assert.match(puts[0].markdown, new RegExp(`^<!-- unfold:ai-generated v=1 subject=pull-request review=approved reviewer=dev-ann agent-trace=${traceId} -->\\n_Written by an AI agent and reviewed by dev-ann\\._\\n\\n### Which lines agents wrote`));
});

test('path: a linked agent session is told the commit trailers and the pull request marking to write', async () => {
  const owner: User = { id: 'u-ryan', name: 'ryan', role: 'operator' };
  const at = new Date('2026-10-24T10:00:00.000Z');
  const ploeg: LinkedPloeg = { async detail(_user, id) { return { item: { id, title: 'Fix login', provider: 'vikunja', externalId: '2051' } }; }, async trackerItems() { return { items: [] }; } };
  const linked = new LinkedSessions(new DatabaseSync(':memory:'), {} as AppConfig, ploeg, { now: () => at });
  const reported = await linked.report(owner, parseLinkedEvent({ harness: 'claude-code', sessionId: 'aimark-1', event: 'start', model: 'claude-opus-5-5' }, at), 'https://unfold.example.org');
  assert.match(reported.context, /end the message with the trailer lines "Assisted-by: claude-code:claude-opus-5-5" and "Unfold-Session: https:\/\/unfold\.example\.org\/#linked-session\/aimark-1"\./);
  assert.match(reported.context, /start its description with these two lines: "<!-- unfold:ai-generated v=1 subject=pull-request review=pending session=https:\/\/unfold\.example\.org\/#linked-session\/aimark-1 -->" and "_Written by an AI agent and awaiting review by a person\._"\./);
});
