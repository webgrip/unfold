import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LinkedSessions, displayTitle, parseLinkedEvent, pullRequestKey, repositoryPath, trackerReferences, type LinkedNowItem, type LinkedPloeg } from '../src/linked-sessions.ts';
import { mentionsIn } from '../extensions/claude-code/scripts/mentions.mjs';
import type { User } from '../src/types.ts';

const owner: User = { id: 'u-ryan', name: 'ryan', role: 'operator' };
const teammate: User = { id: 'u-sam', name: 'sam', role: 'operator' };
const base = 'https://unfold.example.org';
const id = '0f6c1c9e-1111-4222-8333-944445555666';
const sha = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0';
const at = new Date('2026-10-24T10:00:00.000Z');

const open: LinkedNowItem[] = [
  { id: '184', title: 'Fix login', state: 'awaiting_review', updatedAt: '2026-10-24T09:00:00Z', target: { owner: 'webgrip', repo: 'unfold' }, pullRequestUrl: 'https://forgejo.example.org/webgrip/unfold/pulls/514', pullRequest: null },
  { id: '185', title: 'Other on unfold', state: 'active', updatedAt: '2026-10-24T08:00:00Z', target: { owner: 'WebGrip', repo: 'Unfold' }, pullRequestUrl: '' },
  { id: '186', title: 'Elsewhere', state: 'active', updatedAt: '2026-10-24T09:30:00Z', target: { owner: 'webgrip', repo: 'homelab-cluster' }, pullRequestUrl: '' },
];

function fakePloeg(readable: Record<string, string[]> = { 'u-ryan': ['184', '185', '186', '190'], 'u-sam': ['184'] }): LinkedPloeg & { nowCalls: number } {
  const ploeg = {
    nowCalls: 0,
    async detail(user: User, item: string) {
      if (!readable[user.id]?.includes(item)) throw Object.assign(new Error('not found'), { status: 404 });
      return { item: { id: item, title: `Item ${item}`, provider: 'vikunja', externalId: item === '190' ? '2190' : '1' } };
    },
    async trackerItems(user: User, provider: string, externalId: string) {
      return { items: provider === 'vikunja' && externalId === '2190' && readable[user.id]?.includes('190') ? [{ id: '190', state: 'active' }] : [] };
    },
    async now(user: User) {
      ploeg.nowCalls += 1;
      const mine = open.filter(item => readable[user.id]?.includes(item.id));
      return { waiting: mine.filter(item => item.state !== 'active'), active: mine.filter(item => item.state === 'active') };
    },
  };
  return ploeg;
}

const service = (ploeg: LinkedPloeg = fakePloeg()) => new LinkedSessions(new DatabaseSync(':memory:'), {} as never, ploeg, { now: () => at });
const event = (fields: Record<string, unknown>) => parseLinkedEvent({ harness: 'claude-code', sessionId: id, event: 'start', repository: 'git@forgejo-ssh.example.org:webgrip/unfold.git', ...fields }, at);

test('a report keeps only well-formed tracker references and Work Item ids among its mentions', () => {
  const parsed = event({ event: 'prompt', mentions: { refs: ['VIK-2190', 'vik-2190', 'UTF-8', 'ABC-1', 'VIK-0', 42], workItems: ['184', '0', 'x', '184', 7] } });
  assert.deepEqual(parsed.mentions, { refs: [{ provider: 'vikunja', externalId: '2190', ref: 'VIK-2190' }], workItems: ['184'] });
  assert.deepEqual(event({}).mentions, { refs: [], workItems: [] });
  assert.deepEqual(trackerReferences('VIK-1'), []);
});

test('a commit message and a prompt that name a task or a Work Item link it, and an unreadable or unlinked one stays out', async () => {
  const linked = service();
  await linked.report(owner, event({}), base);
  const committed = await linked.report(owner, event({ event: 'commit', commit: { sha, subject: 'fix: login', trailer: true }, mentions: { refs: ['VIK-2190'] } }), base);
  assert.deepEqual(committed.session.workItems.map(entry => [entry.id, entry.how]), [['190', 'commit']]);
  const prompted = await linked.report(owner, event({ event: 'prompt', mentions: { workItems: ['185', '999'] } }), base);
  assert.deepEqual(prompted.session.workItems.map(entry => [entry.id, entry.how]), [['190', 'commit'], ['185', 'mention']]);
  await linked.setLink(owner, id, '185', false, base);
  const again = await linked.report(owner, event({ event: 'prompt', mentions: { workItems: ['185'] } }), base);
  assert.deepEqual(again.session.workItems.map(entry => entry.id), ['190'], 'a Work Item the person unlinked is not linked again by a mention');
});

test('a pull request the session opened links the Work Item that pull request belongs to, across the pull and pulls spellings', async () => {
  const ploeg = fakePloeg();
  const linked = service(ploeg);
  await linked.report(owner, event({}), base);
  assert.equal(ploeg.nowCalls, 0, 'no pull request, no lookup');
  const opened = await linked.report(owner, event({ event: 'prompt', pullRequests: ['https://Forgejo.example.org/webgrip/unfold/pull/514/'] }), base);
  assert.deepEqual(opened.session.workItems.map(entry => [entry.id, entry.how]), [['184', 'pull_request']]);
  await linked.report(owner, event({ event: 'prompt', pullRequests: ['https://Forgejo.example.org/webgrip/unfold/pull/514/'] }), base);
  assert.equal(ploeg.nowCalls, 1, 'a pull request already known is not looked up again');
  assert.equal(pullRequestKey('https://github.com/o/r/pull/3'), pullRequestKey('https://GITHUB.com/o/r/pulls/3/'));
});

test('suggestions offer the Work Item of the session’s pull request first, then open work on its repository, only to its owner', async () => {
  const linked = service();
  await linked.report(owner, parseLinkedEvent({ harness: 'claude-code', sessionId: id, event: 'start', repository: 'https://forgejo.example.org/webgrip/unfold.git' }, at), base);
  const listed = await linked.suggestions(owner, id);
  assert.deepEqual(listed.map(entry => [entry.id, entry.reason]), [['184', 'repository'], ['185', 'repository']], 'newest first; a Work Item on another repository is left out');
  await assert.rejects(linked.suggestions(teammate, id), { status: 404 });
  await linked.setLink(owner, id, '185', true, base);
  assert.deepEqual((await linked.suggestions(owner, id)).map(entry => entry.id), ['184'], 'a linked Work Item is not suggested');
  assert.equal(repositoryPath('forgejo-ssh.example.org:WebGrip/Unfold.git'), 'webgrip/unfold');
  assert.equal(repositoryPath('https://forgejo.example.org/webgrip/unfold'), 'webgrip/unfold');
});

test('a session without a title shows its own first commit, else its branch in words, else its harness and repository', () => {
  const session = { title: '', branch: '', repository: 'git@host:webgrip/unfold.git', harness: 'claude-code' as const, commits: [] as never[] };
  assert.equal(displayTitle({ ...session, title: 'Named' }), 'Named');
  assert.equal(displayTitle({ ...session, branch: 'docs/connect-a-repository' }), 'Connect a repository');
  assert.equal(displayTitle({ ...session, branch: 'feat/vik-2051-login' }), 'VIK-2051 login');
  assert.equal(displayTitle({ ...session, branch: 'development' }), 'Claude Code session in unfold');
  const commits = [{ sha, subject: 'Merge pull request #1', at: '', trailer: true, aiLines: null, files: null }, { sha, subject: 'fix: someone else', at: '', trailer: false, aiLines: null, files: null }, { sha, subject: 'feat(unfold): link by mention', at: '', trailer: true, aiLines: null, files: null }];
  assert.equal(displayTitle({ ...session, branch: 'docs/x', commits }), 'feat(unfold): link by mention');
});

test('a session started with a credential that expires within a week is told so once in its context', async () => {
  const linked = service();
  const soon = await linked.report(owner, event({}), base, { credentialExpiresAt: '2026-10-28T00:00:00Z' });
  assert.deepEqual(soon.credential, { expiresAt: '2026-10-28T00:00:00.000Z', expiresSoon: true });
  assert.match(soon.context, /expires 2026-10-28/);
  const later = await linked.report(owner, event({}), base, { credentialExpiresAt: '2026-11-20T00:00:00Z' });
  assert.equal(later.credential?.expiresSoon, false);
  assert.doesNotMatch(later.context, /expires/);
  assert.equal((await linked.report(owner, event({}), base)).credential, null);
  assert.deepEqual(soon.trackerPrefixes, ['VIK']);
});

test('the plugin finds task references for the prefixes Unfold named, Unfold Work Item links and named Work Items', () => {
  assert.deepEqual(mentionsIn('Fix VIK-2051, see https://u.example/#work/184 and Work Item #77; not UTF-8, vik-0 or VIK-12x', ['VIK'], 'https://u.example'), { refs: ['VIK-2051'], workItems: ['184', '77'] });
  assert.equal(mentionsIn('VIK-2051 https://other.example/#work/184', [], 'https://u.example'), null);
  assert.equal(mentionsIn('nothing here', ['VIK'], 'https://u.example'), null);
});

test('the hook sends the ids a prompt and a commit message name, never their text', async t => {
  const received: { path: string; body: any }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk as Buffer));
    req.on('end', () => {
      received.push({ path: String(req.url), body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(req.url === '/api/linked-sessions/events' ? { session: { link: 'http://unfold.test/#linked-session/plugin-session-9', workItems: [] }, context: '', trackerPrefixes: ['VIK'] } : { stored: true }));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const unfold = `http://127.0.0.1:${address.port}`;
  const dir = await mkdtemp(join(tmpdir(), 'unfold-mentions-'));
  t.after(async () => { await new Promise<void>(done => server.close(() => done())); await rm(dir, { recursive: true, force: true }); });
  const repo = join(dir, 'repo');
  execFileSync('git', ['init', '-q', '-b', 'docs/plain', repo]);
  const gitIn = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  gitIn('config', 'user.email', 'test@example.org'); gitIn('config', 'user.name', 'Test');
  gitIn('commit', '-q', '--allow-empty', '-m', 'root');
  const hook = fileURLToPath(new URL('../extensions/claude-code/scripts/unfold-hook.mjs', import.meta.url));
  const env = { PATH: process.env.PATH ?? '', HOME: dir, UNFOLD_URL: unfold, UNFOLD_TOKEN: 'vle_test', CLAUDE_PLUGIN_DATA: join(dir, 'data') };
  const run = (payload: Record<string, unknown>) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [hook], { env, stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', reject);
    child.on('close', () => resolve());
    child.stdin.end(JSON.stringify({ session_id: 'plugin-session-9', cwd: repo, ...payload }));
  });
  await run({ hook_event_name: 'SessionStart', source: 'startup' });
  await run({ hook_event_name: 'UserPromptSubmit', prompt: `Please finish VIK-2051, it is ${unfold}/#work/184 — secret plan inside` });
  const prompt = received.find(entry => entry.body.event === 'prompt');
  assert.deepEqual(prompt?.body.mentions, { refs: ['VIK-2051'], workItems: ['184'] });
  assert.equal(JSON.stringify(received).includes('secret plan'), false, 'the prompt text never leaves the machine');
  gitIn('commit', '-q', '--allow-empty', '-m', 'fix: login\n\nVIK-2190');
  await run({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'git commit' }, tool_response: {} });
  const commit = received.find(entry => entry.body.event === 'commit');
  assert.deepEqual(commit?.body.mentions, { refs: ['VIK-2190'], workItems: [] });

  const transcript = join(dir, 'transcript.jsonl');
  await writeFile(transcript, [
    { type: 'ai-title', aiTitle: 'Summary of a secret plan', sessionId: 'plugin-session-9' },
    { type: 'custom-title', customTitle: 'Login fix', sessionId: 'plugin-session-9' },
    { type: 'pr-link', sessionId: 'plugin-session-9', prNumber: 514, prUrl: 'https://forgejo.example.org/webgrip/unfold/pulls/514' },
  ].map(line => JSON.stringify(line)).join('\n') + '\n');
  await run({ hook_event_name: 'Stop', transcript_path: transcript });
  const stopped = received.filter(entry => entry.body.event === 'idle').at(-1);
  assert.equal(stopped?.body.title, 'Login fix', 'a name the person gave with /rename is the title');
  assert.deepEqual(stopped?.body.pullRequests, ['https://forgejo.example.org/webgrip/unfold/pulls/514'], 'a pull request Claude Code recorded is reported');
  await run({ hook_event_name: 'Stop', transcript_path: transcript });
  assert.equal(received.filter(entry => entry.body.event === 'idle').at(-1)?.body.pullRequests, undefined, 'a reported pull request is sent once');
  assert.equal(JSON.stringify(received).includes('secret plan'), false, 'Claude Code’s own summary title stays local unless the person shares the transcript');
});
