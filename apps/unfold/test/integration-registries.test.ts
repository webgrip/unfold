import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assignmentEvent, canHandOff, commentOnIssue, createIssue, describeIssueTarget, filesIssues, handoffUnsupported, readIssueState, sourceLinkProvider, validateTaskSources, type FiledIssue, type TaskSourceConfig } from '../src/tasks.ts';
import { registerTaskProvider, taskProvider, taskProviders, trackerReference, ploegTrackerReference, referencePrefixes, type TaskProviderAdapter } from '../src/task-providers/index.ts';
import { readOne, listPage } from '../src/task-providers/shared.ts';
import { descriptionMarkdown } from '../src/rich-text.ts';
import { itemRef } from '../src/cards/assemble.ts';
import { branchReferences, trackerReferences } from '../src/linked-sessions.ts';
import { Links, LinkError, isLinkProvider, linkProviderLabel, linkProviders } from '../src/links.ts';
import { createDeliveryPublisher, GitHubPublisher, GitLabPublisher, publicationMarker, type PublicationRecord } from '../src/delivery-publisher.ts';
import { validateDeliveryConfig } from '../src/delivery-config.ts';
import { reportSettings, ReportService } from '../src/reports.ts';
import { Store } from '../src/store.ts';
import type { AppConfig, Repository } from '../src/types.ts';

const ploeg = { url: 'https://ploeg.example', tokenEnv: 'PLOEG_TOKEN' };
const repositories: Repository[] = [{ id: 'orders', name: 'Orders', description: '', url: 'https://forge.example/team/orders.git', baseBranch: 'main', verify: ['node', '--test'] }];
const sourceOf = (provider: string, overrides: Partial<TaskSourceConfig> = {}): TaskSourceConfig => ({ id: `${provider}-tasks`, name: provider, provider, baseUrl: 'https://tracker.example/api/v1', project: '42', repositoryId: 'orders', executionOwner: 'ploeg', token: 'tracker-token', ...overrides });

async function listen(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); }) };
}

const readBody = async (request: IncomingMessage): Promise<Buffer> => { const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(chunk as Buffer); return Buffer.concat(chunks); };
const reply = (response: ServerResponse, status: number, value: unknown) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); };

test('every registry refuses a provider no adapter registered', async () => {
  assert.throws(() => validateTaskSources([{ id: 'jira', name: 'Jira', provider: 'jira', baseUrl: 'https://jira.example/api/v1', project: '1', repositoryId: 'orders', executionOwner: 'interactive' }], repositories, 'live'), /Unsupported task source provider/);
  assert.throws(() => validateTaskSources([{ id: 'proto', name: 'Proto', provider: '__proto__', baseUrl: 'https://x.example/api/v1', project: '1', repositoryId: 'orders', executionOwner: 'interactive' }], repositories, 'live'), /Unsupported task source provider/);
  assert.throws(() => taskProvider('jira'), /Unsupported task source provider/);
  assert.throws(() => registerTaskProvider(taskProvider('vikunja')), /already registered/);
  assert.throws(() => registerTaskProvider({ ...taskProvider('vikunja'), name: 'Not A Slug' }), /lowercase slugs/);

  const links = new Links(new Store(':memory:'), { baseUrl: 'https://unfold.example' } as AppConfig);
  assert.deepEqual(linkProviders(), ['gitlab', 'clickup']);
  assert.equal(isLinkProvider('jira'), false);
  assert.throws(() => links.describe('u1', 'jira'), (error: unknown) => error instanceof LinkError && error.status === 404);
  assert.equal(await links.token('u1', 'jira'), undefined);

  assert.throws(() => createDeliveryPublisher({ kind: 'bitbucket', apiUrl: 'https://api.bitbucket.org/2.0', tokenEnv: 'PUBLISHER_TOKEN' }), /not a registered forge/);
  const config = { dataDir: '/nonexistent', repositories: [{ id: 'orders', url: 'https://forge.example/team/orders.git' }], execution: { team: 'delivery' }, ploeg: { tokenEnv: 'EXECUTOR_TOKEN' }, runtime: { agentEnvironment: [] } } as unknown as AppConfig;
  const policy = { repositoryId: 'orders', approvedBaseSha: 'a'.repeat(40), approvedBaseBundle: '/srv/base.bundle', image: `sha256:${'b'.repeat(64)}`, directory: '/srv/policy', files: { 'package.json': 'c'.repeat(64) }, protectedPaths: [], checks: [{ id: 'test', argv: ['/usr/bin/node', '--test'], stdout: '', exitCode: 0 }] };
  const delivery = (publisher: unknown) => validateDeliveryConfig({ verifierTokenEnv: 'VERIFIER_TOKEN', policies: [policy], publisher }, config);
  assert.throws(() => delivery({ kind: 'bitbucket', apiUrl: 'https://api.bitbucket.org/2.0', tokenEnv: 'PUBLISHER_TOKEN' }), /delivery.publisher requires a kind of forgejo, github, gitlab/);
  assert.equal(delivery({ kind: 'github', apiUrl: 'https://api.github.com', tokenEnv: 'PUBLISHER_TOKEN' })?.publisher?.kind, 'github');
  assert.equal(delivery({ kind: 'github', apiUrl: 'https://github.example/api/v3', tokenEnv: 'PUBLISHER_TOKEN' })?.publisher?.apiUrl, 'https://github.example/api/v3');
  assert.throws(() => delivery({ kind: 'github', apiUrl: 'https://github.example/api/v1', tokenEnv: 'PUBLISHER_TOKEN' }), /delivery.publisher/);
  assert.equal(delivery({ kind: 'gitlab', apiUrl: 'https://gitlab.example/api/v4', tokenEnv: 'PUBLISHER_TOKEN' })?.publisher?.kind, 'gitlab');
  assert.throws(() => delivery({ kind: 'gitlab', apiUrl: 'https://gitlab.example/api/v3', tokenEnv: 'PUBLISHER_TOKEN' }), /delivery.publisher/);
});

test('each task provider adapter declares its capabilities and the shared code honours them', () => {
  const expected: Record<string, { handoff: boolean; issues: boolean; html: boolean; reference?: string; link?: string; routes: boolean; fixture: boolean }> = {
    forgejo: { handoff: false, issues: true, html: false, routes: false, fixture: false },
    github: { handoff: false, issues: false, html: false, routes: false, fixture: false },
    gitlab: { handoff: false, issues: false, html: false, link: 'gitlab', routes: false, fixture: false },
    vikunja: { handoff: true, issues: true, html: true, reference: 'VIK-7', routes: true, fixture: false },
    clickup: { handoff: true, issues: false, html: false, link: 'clickup', routes: false, fixture: false },
    demo: { handoff: false, issues: false, html: false, routes: false, fixture: true },
  };
  assert.deepEqual(taskProviders().map(adapter => adapter.name), Object.keys(expected), 'registration order fixes the order of every generated message');
  for (const [name, want] of Object.entries(expected)) {
    const source = sourceOf(name);
    assert.equal(canHandOff(name), want.handoff, `${name} hand-off`);
    const unsupported = handoffUnsupported(source, ploeg);
    if (want.fixture) assert.equal(unsupported, 'Demo fixture tasks are not linked to Ploeg.', name);
    else if (want.handoff) assert.equal(unsupported, undefined, name);
    else assert.equal(unsupported, 'Only Vikunja and ClickUp tasks can be handed to Ploeg from the workbench.', name);
    assert.equal(filesIssues(name), want.issues, `${name} issue filing`);
    assert.equal(descriptionMarkdown(name, '<p><strong>Bold</strong></p>') !== '<p><strong>Bold</strong></p>', want.html, `${name} description format`);
    assert.equal(trackerReference(name, '7'), want.reference, `${name} reference`);
    assert.equal(sourceLinkProvider({ ...source, token: undefined }), want.link, `${name} linked account`);
    assert.equal(sourceLinkProvider(source), undefined, `${name} with its own token needs no link`);
    assert.equal(Boolean(assignmentEvent(source)), want.routes, `${name} assignment routes`);
  }
  assert.equal(describeIssueTarget(sourceOf('forgejo'), 'team/orders'), 'Forgejo · team/orders');
  assert.equal(describeIssueTarget(sourceOf('vikunja'), '30'), 'Vikunja · project 30');
  assert.equal(linkProviderLabel('gitlab'), 'GitLab');
  assert.equal(linkProviderLabel('clickup'), 'ClickUp');
});

test('a tracker reference is the adapter\'s format: Vikunja keeps its prefix, Ploeg\'s empty provider means Vikunja, others have none', () => {
  assert.equal(trackerReference('vikunja', '2051'), 'VIK-2051');
  assert.equal(trackerReference('', '2051'), undefined, 'outside Ploeg records an empty provider is no tracker');
  assert.equal(ploegTrackerReference('', '2051'), 'VIK-2051');
  assert.equal(trackerReference('github', '12'), undefined);
  assert.equal(itemRef('vikunja', '12'), 'VIK-12');
  assert.equal(itemRef('', '12'), 'VIK-12');
  assert.equal(itemRef('github', '12'), 'github-12');
  assert.equal(itemRef('manual', '12'), '');
  assert.deepEqual(referencePrefixes(), { vik: 'vikunja' });
  assert.deepEqual(branchReferences('feat/vik-2051-login').map(entry => entry.ref), ['VIK-2051']);
  assert.deepEqual(branchReferences('feat/gh-12-login'), [], 'a prefix no adapter supplies names no tracker');
  assert.deepEqual(trackerReferences(['VIK-7', 'GH-7']).map(entry => entry.provider), ['vikunja']);
});

type Call = { method: string; path: string; authorization: string; body: string };

async function fakeForge(kind: 'github' | 'gitlab', token: string) {
  const root = await mkdtemp(join(tmpdir(), `unfold-${kind}-forge-`));
  const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: root, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' };
  const work = join(root, 'work');
  await mkdir(work);
  execFileSync('git', ['init', '--quiet', '--initial-branch=main', work], { env });
  await writeFile(join(work, 'README.md'), 'base\n');
  execFileSync('git', ['add', 'README.md'], { cwd: work, env });
  execFileSync('git', ['commit', '--quiet', '-m', 'base'], { cwd: work, env });
  const namespace = kind === 'gitlab' ? 'group/sub' : 'owner';
  const projects = join(root, 'forge');
  await mkdir(join(projects, namespace), { recursive: true });
  const bare = join(projects, namespace, 'repo.git');
  execFileSync('git', ['clone', '--bare', '--quiet', work, bare], { env });
  execFileSync('git', ['config', 'http.receivepack', 'true'], { env: { ...env, GIT_DIR: bare } });
  await writeFile(join(work, 'README.md'), 'change\n');
  execFileSync('git', ['commit', '--quiet', '-am', 'change'], { cwd: work, env });
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: work, env }).toString().trim();
  const headOf = (branch: string) => { try { return execFileSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { env: { ...env, GIT_DIR: bare }, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
  const calls: Call[] = [];
  const pulls: { number: number; title: string; body: string; head: string; base: string; state: string; labels: string[] }[] = [];
  const labels: string[] = [];
  const gitUser = kind === 'github' ? 'x-access-token' : 'oauth2';
  let origin = '';
  const page = (pull: typeof pulls[number]) => kind === 'github'
    ? { number: pull.number, html_url: `${origin}/owner/repo/pull/${pull.number}`, body: pull.body, state: pull.state, user: { login: 'unfold-bot' }, head: { ref: pull.head, sha: headOf(pull.head), repo: { full_name: 'Owner/Repo' } }, base: { ref: pull.base, repo: { full_name: 'owner/repo' } } }
    : { iid: pull.number, web_url: `${origin}/group/sub/repo/-/merge_requests/${pull.number}`, description: pull.body, state: pull.state, author: { username: 'unfold-bot' }, source_branch: pull.head, target_branch: pull.base, sha: headOf(pull.head), source_project_id: 9, target_project_id: 9, labels: pull.labels };
  const server = await listen(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://forge.invalid');
    const raw = request.url ?? '/';
    if (url.pathname.includes('.git/')) {
      const [user, ...secret] = Buffer.from((request.headers.authorization ?? '').replace(/^Basic /, ''), 'base64').toString().split(':');
      if (user !== gitUser || secret.join(':') !== token) { response.writeHead(401, { 'www-authenticate': 'Basic realm="forge"' }); response.end(); return; }
      const cgi = spawn('git', ['http-backend'], { env: { ...env, GIT_PROJECT_ROOT: projects, GIT_HTTP_EXPORT_ALL: '1', PATH_INFO: url.pathname, QUERY_STRING: url.search.slice(1), REQUEST_METHOD: request.method ?? 'GET', CONTENT_TYPE: request.headers['content-type'] ?? '', REMOTE_USER: 'publisher', REMOTE_ADDR: '127.0.0.1', ...(request.headers['git-protocol'] ? { GIT_PROTOCOL: String(request.headers['git-protocol']) } : {}) } });
      request.pipe(cgi.stdin);
      const chunks: Buffer[] = []; cgi.stdout.on('data', chunk => chunks.push(chunk)); cgi.stderr.resume();
      cgi.on('close', () => {
        const output = Buffer.concat(chunks); const split = output.indexOf('\r\n\r\n');
        const headers: Record<string, string> = {}; let status = 200;
        for (const line of output.subarray(0, split).toString().split('\r\n')) { const [key, ...rest] = line.split(':'); const value = rest.join(':').trim(); if (key.toLowerCase() === 'status') status = Number(value.split(' ')[0]); else headers[key] = value; }
        response.writeHead(status, headers); response.end(output.subarray(split + 4));
      });
      return;
    }
    const body = (await readBody(request)).toString();
    calls.push({ method: request.method ?? 'GET', path: raw, authorization: String(request.headers.authorization ?? ''), body });
    if (request.headers.authorization !== `Bearer ${token}`) return reply(response, 401, { message: 'unauthorized' });
    const input = body ? JSON.parse(body) : {};
    if (kind === 'github') {
      const base = '/api/v3/repos/owner/repo';
      if (raw === `${base}/labels/ai-generated`) return labels.length ? reply(response, 200, { name: 'ai-generated' }) : reply(response, 404, { message: 'Not Found' });
      if (request.method === 'POST' && raw === `${base}/labels`) { labels.push(input.name); return reply(response, 201, input); }
      if (request.method === 'POST' && raw === `${base}/pulls`) {
        if (pulls.some(pull => pull.state === 'open' && pull.head === input.head)) return reply(response, 422, { message: 'Validation Failed', errors: [{ message: 'A pull request already exists' }] });
        const pull = { number: pulls.length + 1, title: input.title, body: input.body, head: input.head, base: input.base, state: 'open', labels: [] as string[] }; pulls.push(pull);
        return reply(response, 201, page(pull));
      }
      const added = /\/issues\/(\d+)\/labels$/.exec(url.pathname);
      if (request.method === 'POST' && added) { pulls.find(pull => pull.number === Number(added[1]))!.labels.push(...input.labels); return reply(response, 200, input.labels.map((name: string) => ({ name }))); }
      if (request.method === 'GET' && url.pathname === `${base}/pulls`) return reply(response, 200, pulls.filter(pull => pull.state === url.searchParams.get('state') && `owner:${pull.head}` === url.searchParams.get('head')).map(page));
      const single = new RegExp(`^${base}/pulls/(\\d+)$`).exec(url.pathname);
      const pull = single ? pulls.find(item => item.number === Number(single[1])) : undefined;
      if (single && !pull) return reply(response, 404, { message: 'Not Found' });
      if (request.method === 'PATCH' && pull) { pull.state = input.state; return reply(response, 200, page(pull)); }
      if (request.method === 'GET' && pull) return reply(response, 200, page(pull));
    } else {
      const base = '/api/v4/projects/group%2Fsub%2Frepo';
      if (raw === `${base}/labels/ai-generated`) return labels.length ? reply(response, 200, { name: 'ai-generated' }) : reply(response, 404, { message: '404 Label Not Found' });
      if (request.method === 'POST' && raw === `${base}/labels`) { labels.push(input.name); return reply(response, 201, input); }
      if (request.method === 'POST' && raw === `${base}/merge_requests`) {
        if (pulls.some(pull => pull.state === 'opened' && pull.head === input.source_branch)) return reply(response, 409, { message: ['Another open merge request already exists for this source branch'] });
        const pull = { number: pulls.length + 1, title: input.title, body: input.description, head: input.source_branch, base: input.target_branch, state: 'opened', labels: input.labels ? [input.labels] : [] }; pulls.push(pull);
        return reply(response, 201, page(pull));
      }
      if (request.method === 'GET' && url.pathname === `${base}/merge_requests`) return reply(response, 200, pulls.filter(pull => pull.state === url.searchParams.get('state') && pull.head === url.searchParams.get('source_branch')).map(page));
      const single = new RegExp(`^${base.replace(/%/g, '%')}/merge_requests/(\\d+)$`).exec(url.pathname);
      const pull = single ? pulls.find(item => item.number === Number(single[1])) : undefined;
      if (single && !pull) return reply(response, 404, { message: '404 Not found' });
      if (request.method === 'PUT' && pull) { if (input.state_event === 'close') pull.state = 'closed'; return reply(response, 200, page(pull)); }
      if (request.method === 'GET' && pull) return reply(response, 200, page(pull));
    }
    reply(response, 404, { message: 'not found' });
  });
  origin = server.origin;
  return { calls, pulls, labels, sha, gitDirectory: join(work, '.git'), headOf, origin, close: async () => { await server.close(); await rm(root, { recursive: true, force: true }); } };
}

const facts = (sha: string) => ({ workItemId: '7', sessionId: 's1', sessionUrl: 'https://unfold.example/#session/s1', title: 'Fix rounding', candidateId: 'c'.repeat(32), receiptId: 'r'.repeat(32), approvalId: 'a'.repeat(32), canonicalSha: sha, baseSha: 'b'.repeat(40), treeSha: 't'.repeat(40), policySha256: 'p'.repeat(64), verifierId: 'unfold-docker-v1', approver: 'owner' });

for (const kind of ['github', 'gitlab'] as const) {
  test(`the ${kind} publisher pushes the branch and opens one labelled proposal through the REST API, and finds it again after a restart`, async t => {
    const token = `${kind}-publisher-token-0123456789`;
    process.env.UNFOLD_REGISTRY_PUBLISHER_TOKEN = token;
    const forge = await fakeForge(kind, token);
    t.after(() => forge.close());
    const apiUrl = `${forge.origin}${kind === 'github' ? '/api/v3' : '/api/v4'}`;
    const publisher = createDeliveryPublisher({ kind, apiUrl, tokenEnv: 'UNFOLD_REGISTRY_PUBLISHER_TOKEN', username: 'unfold-bot' }, { plainHttp: true });
    assert.ok(publisher instanceof (kind === 'github' ? GitHubPublisher : GitLabPublisher));
    const repositoryUrl = `${forge.origin}/${kind === 'github' ? 'owner' : 'group/sub'}/repo.git`;
    const branch = 'unfold/wi-7/cccccccccccc';
    const operationId = 'pub-op-1';
    const record: PublicationRecord = { operationId, branch, baseBranch: 'main', repositoryUrl, phase: 'pushed', facts: facts(forge.sha) };

    assert.equal(await publisher.remoteHead(forge.gitDirectory, repositoryUrl, branch), null);
    assert.equal(await publisher.push(forge.gitDirectory, repositoryUrl, forge.sha, branch), 'pushed');
    assert.equal(forge.headOf(branch), forge.sha);

    const body = `${publicationMarker(operationId)}\nVerified delivery candidate.`;
    const created = await publisher.createPullRequest(repositoryUrl, { head: branch, base: 'main', title: 'Unfold: Fix rounding', body });
    assert.notEqual(created, 'exists');
    assert.equal((created as { number: number }).number, 1);
    assert.deepEqual(forge.pulls[0].labels, ['ai-generated']);
    assert.deepEqual(forge.labels, ['ai-generated'], 'the label is created once, with its colour and description');
    assert.equal(await publisher.createPullRequest(repositoryUrl, { head: branch, base: 'main', title: 'again', body }), 'exists');
    assert.equal(forge.pulls.length, 1);

    assert.equal((await publisher.findPullRequest(record))?.number, 1);
    assert.equal((await publisher.findPullRequest({ ...record, operationId: 'pub-other' })), undefined, 'a proposal without this operation\'s marker is not ours');
    const evidence = await publisher.verifiedPullRequest(record, 1);
    assert.deepEqual(evidence, { number: 1, url: kind === 'github' ? `${forge.origin}/owner/repo/pull/1` : `${forge.origin}/group/sub/repo/-/merge_requests/1` });
    assert.equal(await publisher.verifiedPullRequest({ ...record, facts: facts('f'.repeat(40)) }, 1), undefined, 'another canonical commit is not this publication');
    assert.equal(await publisher.verifiedPullRequest(record, 99), undefined);
    await publisher.closePullRequest(record, 1);
    assert.equal(forge.pulls[0].state, 'closed');

    const api = forge.calls.map(call => `${call.method} ${call.path.replace(/\?.*$/, '')}`);
    const prefix = kind === 'github' ? '/api/v3/repos/owner/repo' : '/api/v4/projects/group%2Fsub%2Frepo';
    const proposals = kind === 'github' ? 'pulls' : 'merge_requests';
    assert.deepEqual(api, kind === 'github'
      ? [`POST ${prefix}/pulls`, `GET ${prefix}/labels/ai-generated`, `POST ${prefix}/labels`, `POST ${prefix}/issues/1/labels`, `POST ${prefix}/pulls`, `GET ${prefix}/pulls`, `GET ${prefix}/pulls`, `GET ${prefix}/pulls/1`, `GET ${prefix}/pulls/1`, `GET ${prefix}/pulls/99`, `PATCH ${prefix}/pulls/1`]
      : [`GET ${prefix}/labels/ai-generated`, `POST ${prefix}/labels`, `POST ${prefix}/merge_requests`, `GET ${prefix}/labels/ai-generated`, `POST ${prefix}/merge_requests`, `GET ${prefix}/merge_requests`, `GET ${prefix}/merge_requests`, `GET ${prefix}/merge_requests/1`, `GET ${prefix}/merge_requests/1`, `GET ${prefix}/merge_requests/99`, `PUT ${prefix}/merge_requests/1`]);
    assert.ok(forge.calls.every(call => call.authorization === `Bearer ${token}`), 'every API call carries the token as a Bearer header');
    assert.ok(forge.calls.every(call => !call.path.includes(token)), 'the token never appears in a URL');
    const posted = JSON.parse(forge.calls.find(call => call.method === 'POST' && call.path.endsWith(`/${proposals}`))!.body);
    assert.equal(kind === 'github' ? posted.head : posted.source_branch, branch);
    assert.equal(kind === 'github' ? posted.base : posted.target_branch, 'main');
    const label = JSON.parse(forge.calls.find(call => call.method === 'POST' && call.path.endsWith('/labels'))!.body);
    assert.equal(label.description, 'Written by an AI agent. A person reviews it before merge.');
    assert.equal(label.color, kind === 'github' ? '7c3aed' : '#7c3aed');
  });
}

test('the GitHub publisher refuses a plain-HTTP API and a missing token before it calls the forge', async () => {
  delete process.env.UNFOLD_REGISTRY_MISSING_TOKEN;
  const record: PublicationRecord = { operationId: 'pub-x', branch: 'unfold/wi-1/x', baseBranch: 'main', repositoryUrl: 'https://github.example/owner/repo.git', phase: 'pushed', facts: facts('a'.repeat(40)) };
  await assert.rejects(new GitHubPublisher({ kind: 'github', apiUrl: 'http://github.example/api/v3', tokenEnv: 'UNFOLD_REGISTRY_MISSING_TOKEN' }).findPullRequest(record), { code: 'publisher_unconfigured' });
  await assert.rejects(new GitHubPublisher({ kind: 'github', apiUrl: 'https://github.example/api/v3', tokenEnv: 'UNFOLD_REGISTRY_MISSING_TOKEN' }).findPullRequest(record), { code: 'publisher_credential_unavailable' });
  await assert.rejects(new GitLabPublisher({ kind: 'gitlab', apiUrl: 'https://gitlab.example/api/v4', tokenEnv: 'UNFOLD_REGISTRY_MISSING_TOKEN' }).findPullRequest({ ...record, repositoryUrl: 'https://gitlab.example/repo.git' }), { code: 'publication_repository_unsupported' });
});

test('Report a problem files into a third registered tracker that declares issue filing', async t => {
  const calls: { method: string; path: string; body: string }[] = [];
  const server = await listen(async (request, response) => {
    const body = (await readBody(request)).toString();
    calls.push({ method: request.method ?? 'GET', path: request.url ?? '', body });
    if (request.url === '/rest/user') return reply(response, 200, { handle: 'unfold-bot' });
    if (request.method === 'POST' && request.url === '/rest/boards/ops/items') return reply(response, 201, { key: 'OPS-5', link: 'https://desk.example/items/OPS-5' });
    if (request.method === 'POST' && request.url?.endsWith('/files')) return reply(response, 201, { download: 'https://desk.example/files/screenshot.png' });
    if (request.method === 'GET' && request.url === '/rest/items/OPS-5') return reply(response, 200, { open: true, tags: ['triage'], owner: null, notes: [{ id: 1, by: 'unfold-bot', text: 'From Unfold', at: '2026-10-30T10:00:00Z' }] });
    if (request.method === 'POST' && request.url === '/rest/items/OPS-5/notes') return reply(response, 201, {});
    reply(response, 404, {});
  });
  t.after(() => server.close());
  const desk: TaskProviderAdapter = {
    ...taskProvider('forgejo'),
    name: 'desk',
    label: 'Desk',
    issues: {
      bodyFormat: 'markdown',
      loginField: 'handle',
      describe: project => `Desk · board ${project}`,
      async create(_source, project, title, body, call) {
        const item = await call('POST', `/boards/${project}/items`, { title, body }) as { key: string; link: string };
        return { id: item.key, number: item.key, url: item.link };
      },
      async attach(_source, _project, issue, file, call) {
        const form = new FormData();
        form.append('file', new Blob([file.bytes], { type: file.type }), file.name);
        return (await call('POST', `/items/${issue.id}/files`, form) as { download: string }).download;
      },
      async state(_source, _project, issue, _version, login, call) {
        const item = await call('GET', `/items/${issue.id}`) as { open: boolean; tags: string[]; owner: string | null; notes: { id: number; by: string; text: string; at: string }[] };
        return { open: item.open, labels: item.tags, assigned: Boolean(item.owner), comments: item.notes.map(note => ({ id: String(note.id), author: note.by, text: note.text, at: note.at, mine: note.by === login })) };
      },
      async comment(_source, _project, issue, body, call) { await call('POST', `/items/${issue.id}/notes`, { body }); },
    },
    taskId: /^[A-Z]+-\d+$/,
    apiRoot: () => undefined,
    project: value => { if (!/^[a-z]+$/.test(value)) throw new Error('Task source project must be a Desk board'); return value; },
    list: (_source, page, reading) => listPage(page, reading, { path: '/items', query: {}, pageSize: 50 }),
    read: (_source, id, truncate, reading) => readOne(id, truncate, reading, `/items/${id}`),
  };
  registerTaskProvider(desk);

  const source: TaskSourceConfig = { id: 'desk-feedback', name: 'Feedback', provider: 'desk', baseUrl: `${server.origin}/rest`, project: 'ops', repositoryId: 'orders', executionOwner: 'interactive', token: 'desk-token' };
  assert.deepEqual(reportSettings(undefined, [source], 'live'), { source, project: 'ops' }, 'a registered tracker that files issues can be the default target');
  assert.throws(() => reportSettings({ source: 'nope' }, [source], 'live'), /must name a Forgejo, Vikunja or Desk task source/);
  assert.throws(() => reportSettings({ provider: 'github', baseUrl: 'https://api.github.com', project: 'a/b', tokenEnv: 'X' }, [], 'live'), /reports.provider must be forgejo, vikunja or desk/);

  const store = new Store(':memory:');
  t.after(() => store.close());
  const reports = new ReportService(store, { mode: 'live', baseUrl: 'https://unfold.example', reports: { source, project: 'ops' } } as unknown as AppConfig, '1.2.3', undefined, { schedule: false });
  t.after(() => reports.stop());
  assert.equal(reports.publicTarget(), 'Desk · board ops');
  const user = { id: 'u1', name: 'Ada', role: 'operator' as const };
  const outcome = await reports.submit(user, { title: 'The Save button does nothing', kind: 'broken', happened: 'I pressed Save.', expected: 'It saves.', context: { route: '/#tasks' }, files: [{ name: 'screenshot.png', type: 'image/png', content: new Uint8Array([137, 80, 78, 71]) }] });
  assert.equal(outcome.status, 'filed');
  assert.equal(outcome.url, 'https://desk.example/items/OPS-5');
  const created = calls.find(call => call.method === 'POST' && call.path === '/rest/boards/ops/items')!;
  assert.match(JSON.parse(created.body).body, /I pressed Save/, 'the body is Markdown, as the adapter declares');
  assert.ok(calls.some(call => call.path === '/rest/items/OPS-5/files'), 'the screenshot is attached through the adapter');

  const issue: FiledIssue = { id: 'OPS-5', number: 'OPS-5', url: 'https://desk.example/items/OPS-5' };
  const state = await readIssueState(source, 'ops', issue, '1.2.3');
  assert.deepEqual(state.labels, ['triage']);
  assert.equal(state.comments[0].mine, true, 'the token\'s own login comes from the adapter\'s login field');
  await commentOnIssue(source, 'ops', issue, 'More detail.');
  assert.ok(calls.some(call => call.path === '/rest/items/OPS-5/notes' && JSON.parse(call.body).body === 'More detail.'));
  assert.equal((await createIssue(source, 'ops', 'Again', 'Body')).id, 'OPS-5');
});

test('no closed provider union, provider comparison or Vikunja reference appears outside an adapter', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const adapters = ['src/task-providers/', 'src/link-providers/', 'src/delivery-publishers/'];
  const vendor = '(?:forgejo|github|gitlab|clickup|vikunja)';
  const rules: [string, RegExp][] = [
    ['a union of provider names', new RegExp(`'${vendor}'\\s*\\|\\s*'[a-z-]+'|'[a-z-]+'\\s*\\|\\s*'${vendor}'`)],
    ['a comparison with a provider name', new RegExp(`(?:===|!==)\\s*'${vendor}'|'${vendor}'\\s*(?:===|!==)`)],
    ['a list of provider names', new RegExp(`\\[\\s*'${vendor}'\\s*[,\\]]`)],
    ['a pattern alternation of provider names', new RegExp(`\\((?:\\?:)?${vendor}\\|`)],
    ['a hardcoded Vikunja reference', /VIK-(?:\$\{|['"`])/i],
    ['a reference prefix table', /\bvik\s*:\s*['"]/],
  ];
  const files: string[] = [];
  const walk = async (directory: string) => { for (const name of await readdir(directory)) { const path = join(directory, name); if ((await stat(path)).isDirectory()) await walk(path); else if (path.endsWith('.ts')) files.push(path); } };
  await walk(join(root, 'src'));
  files.push(join(root, 'extensions/vscode/src/types.ts'));
  const blank = (text: string) => text.replace(/[^\n]/g, '');
  const found: string[] = [];
  for (const file of files) {
    const path = relative(root, file);
    if (adapters.some(prefix => path.startsWith(prefix))) continue;
    const code = (await readFile(file, 'utf8')).replace(/^\s*\/\*\*[\s\S]*?\*\//gm, blank).replace(/\/\*\*.*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    code.split('\n').forEach((line, index) => { for (const [name, rule] of rules) if (rule.test(line)) found.push(`${path}:${index + 1} has ${name}: ${line.trim().slice(0, 120)}`); });
  }
  assert.ok(files.length > 100, 'the scan reads the source tree');
  assert.deepEqual(found, [], 'register an adapter in src/task-providers/, src/link-providers/ or src/delivery-publishers/ and ask it for the capability instead (system ADR-0050 rule 1)');

  const probe = (line: string) => rules.some(([, rule]) => rule.test(line));
  assert.ok(probe("export type TaskProvider = 'forgejo' | 'jira';"), 'the guard sees a new closed union');
  assert.ok(probe("if (source.provider === 'vikunja') return x;"), 'the guard sees a provider switch');
  assert.ok(probe('const ref = `VIK-${id}`;'), 'the guard sees a hardcoded reference');
  assert.ok(!probe("const example = 'such as VIK-123';"), 'an example reference in prose is not a builder');
});
