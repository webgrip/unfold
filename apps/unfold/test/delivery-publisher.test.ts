import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { deliveryFixture } from './delivery-fixture.ts';
import { canonicalizeCandidate } from '../src/trusted-candidate.ts';
import { policyDigest, validateDeliveryConfig } from '../src/delivery-config.ts';
import { DeliveryService } from '../src/delivery.ts';
import { ForgejoPublisher, publicationBranch, publicationMarker, type PublicationRecord } from '../src/delivery-publisher.ts';
import { Store } from '../src/store.ts';
import type { AppConfig, Session } from '../src/types.ts';

const publisherToken = 'p'.repeat(40);
process.env.EXECUTOR_TOKEN = 'e'.repeat(40);
process.env.VERIFIER_TOKEN = 'v'.repeat(40);
process.env.PUBLISHER_TOKEN = publisherToken;

const executionId = 'a'.repeat(32);
const candidateId = 'b'.repeat(32);
const owner = { id: 'owner', name: 'Owner', role: 'operator' as const };
const branch = `unfold/wi-1980/${candidateId.slice(0, 12)}`;

const listen = async (server: Server): Promise<string> => { await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); return `http://127.0.0.1:${(server.address() as AddressInfo).port}`; };
const readBody = async (req: IncomingMessage): Promise<Buffer> => { const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk as Buffer); return Buffer.concat(chunks); };
const reply = (res: ServerResponse, status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
const gitEnvironment = { PATH: process.env.PATH ?? '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', HOME: '/nonexistent' };

type ForgePull = { number: number; title: string; body: string; head: string; base: string };

async function fakeForgejo(root: string, source: string) {
  const projects = join(root, 'forge'); await mkdir(join(projects, 'owner'), { recursive: true });
  const bare = join(projects, 'owner', 'repo.git');
  execFileSync('git', ['clone', '--bare', '--quiet', source, bare], { env: gitEnvironment });
  execFileSync('git', ['config', 'http.receivepack', 'true'], { cwd: bare, env: { ...gitEnvironment, GIT_DIR: bare } });
  const state = { url: '', pulls: [] as ForgePull[], pullPosts: [] as number[], receivePacks: 0, paths: [] as string[], dropNextPullPost: undefined as undefined | 'before' | 'after' };
  const headSha = (ref: string): string => { try { return execFileSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${ref}`], { env: { ...gitEnvironment, GIT_DIR: bare }, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
  const render = (pull: ForgePull) => ({ number: pull.number, title: pull.title, body: pull.body, html_url: `${state.url}/owner/repo/pulls/${pull.number}`, head: { ref: pull.head, sha: headSha(pull.head), repo: { full_name: 'owner/repo' } }, base: { ref: pull.base, repo: { full_name: 'owner/repo' } } });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', state.url); state.paths.push(req.url ?? '');
    if (url.pathname.startsWith('/owner/repo.git/')) {
      const authorization = req.headers.authorization ?? '';
      const password = authorization.startsWith('Basic ') ? Buffer.from(authorization.slice(6), 'base64').toString().split(':').slice(1).join(':') : '';
      if (password !== publisherToken) { res.writeHead(401, { 'www-authenticate': 'Basic realm="forge"' }); res.end(); return; }
      if (url.pathname.endsWith('/git-receive-pack')) state.receivePacks++;
      const cgi = spawn('git', ['http-backend'], { env: { ...gitEnvironment, GIT_PROJECT_ROOT: projects, GIT_HTTP_EXPORT_ALL: '1', PATH_INFO: url.pathname, QUERY_STRING: url.search.slice(1), REQUEST_METHOD: req.method ?? 'GET', CONTENT_TYPE: req.headers['content-type'] ?? '', REMOTE_USER: 'publisher', REMOTE_ADDR: '127.0.0.1', ...(req.headers['content-encoding'] ? { HTTP_CONTENT_ENCODING: String(req.headers['content-encoding']) } : {}), ...(req.headers['git-protocol'] ? { GIT_PROTOCOL: String(req.headers['git-protocol']) } : {}) } });
      req.pipe(cgi.stdin);
      const chunks: Buffer[] = []; cgi.stdout.on('data', chunk => chunks.push(chunk)); cgi.stderr.resume();
      cgi.on('close', () => {
        const output = Buffer.concat(chunks); const split = output.indexOf('\r\n\r\n');
        const headers: Record<string, string> = {}; let status = 200;
        for (const line of output.subarray(0, split).toString().split('\r\n')) { const [key, ...rest] = line.split(':'); const value = rest.join(':').trim(); if (key.toLowerCase() === 'status') status = Number(value.split(' ')[0]); else headers[key] = value; }
        res.writeHead(status, headers); res.end(output.subarray(split + 4));
      });
      return;
    }
    if (req.headers.authorization !== `token ${publisherToken}`) return reply(res, 401, { message: 'unauthorized' });
    if (req.method === 'POST' && url.pathname === '/api/v1/repos/owner/repo/pulls') {
      const input = JSON.parse((await readBody(req)).toString());
      if (state.dropNextPullPost === 'before') { state.dropNextPullPost = undefined; state.pullPosts.push(0); req.socket.destroy(); return; }
      if (state.pulls.some(pull => pull.head === input.head && pull.base === input.base)) { state.pullPosts.push(409); return reply(res, 409, { message: 'pull request already exists' }); }
      const pull = { number: state.pulls.length + 1, title: input.title, body: input.body, head: input.head, base: input.base }; state.pulls.push(pull);
      if (state.dropNextPullPost === 'after') { state.dropNextPullPost = undefined; state.pullPosts.push(0); req.socket.destroy(); return; }
      state.pullPosts.push(201); return reply(res, 201, render(pull));
    }
    if (req.method === 'GET' && url.pathname === '/api/v1/repos/owner/repo/pulls') {
      const limit = Number(url.searchParams.get('limit')); const page = Number(url.searchParams.get('page'));
      return reply(res, 200, state.pulls.slice((page - 1) * limit, page * limit).map(render));
    }
    const single = /^\/api\/v1\/repos\/owner\/repo\/pulls\/(\d+)$/.exec(url.pathname);
    if (req.method === 'GET' && single) { const pull = state.pulls.find(item => item.number === Number(single[1])); return pull ? reply(res, 200, render(pull)) : reply(res, 404, { message: 'not found' }); }
    reply(res, 404, { message: 'not found' });
  });
  state.url = await listen(server);
  return { state, server, bare, setBranch: (sha: string) => execFileSync('git', ['update-ref', `refs/heads/${branch}`, sha], { env: { ...gitEnvironment, GIT_DIR: bare } }), headSha };
}

async function fakePloeg(delivery: { candidate: any; receipt: any; approval: any; operation: any }) {
  const state = { url: '', reservations: [] as number[], statuses: [] as { state: string; token: string }[], dropNextReservation: false, dropNextStatus: false };
  const server = createServer(async (req, res) => {
    const prefix = `/api/v1/operator/executions/${executionId}/delivery`; const path = (req.url ?? '').slice(prefix.length);
    const token = (req.headers.authorization ?? '').replace('Bearer ', '');
    const input = req.method === 'POST' ? JSON.parse((await readBody(req)).toString()) : undefined;
    if (req.method === 'GET' && path === '') return reply(res, 200, { schemaVersion: '1.0', delivery, lifecycle: 'single-completed-execution' });
    if (path === '/approval') { delivery.approval ??= { id: 'd'.repeat(32), candidateId: input.candidateId, receiptId: input.receiptId, policySha256: input.policySha256, actor: owner.id }; return reply(res, 201, { schemaVersion: '1.0', approval: delivery.approval, created: true }); }
    if (path === '/publication') {
      if (delivery.operation) { const same = delivery.operation.branch === input.branch && delivery.operation.id === input.operationId; state.reservations.push(same ? 200 : 409); return same ? reply(res, 200, { schemaVersion: '1.0', operation: delivery.operation, effectAuthorized: false }) : reply(res, 409, { error: 'conflict' }); }
      if (!delivery.approval) { state.reservations.push(409); return reply(res, 409, { error: 'conflict' }); }
      delivery.operation = { id: input.operationId, executionId, candidateId: input.candidateId, receiptId: input.receiptId, approvalId: input.approvalId, policySha256: input.policySha256, branch: input.branch, state: 'reserved', canonicalSha: delivery.candidate.canonicalSha, repositoryUrl: delivery.candidate.repositoryUrl, baseBranch: 'main' };
      state.reservations.push(201);
      if (state.dropNextReservation) { state.dropNextReservation = false; req.socket.destroy(); return; }
      return reply(res, 201, { schemaVersion: '1.0', operation: delivery.operation, effectAuthorized: true });
    }
    if (path === `/publication/${delivery.operation?.id}/status`) {
      state.statuses.push({ state: input.state, token });
      if (delivery.operation.state !== 'published') Object.assign(delivery.operation, { state: input.state, ...(input.remoteId ? { remoteId: input.remoteId, remoteUrl: input.remoteUrl } : {}) });
      if (state.dropNextStatus) { state.dropNextStatus = false; req.socket.destroy(); return; }
      return reply(res, 200, { schemaVersion: '1.0', operation: delivery.operation });
    }
    reply(res, 404, { error: 'not_found' });
  });
  state.url = await listen(server);
  return { state, server, delivery };
}

async function scenario(options: { approved?: boolean } = {}) {
  const f = await deliveryFixture(); const store = new Store(':memory:');
  await f.fix(); await f.capture('publish');
  const candidate = await canonicalizeCandidate(f.dataDir, 'publish', f.policy);
  const forge = await fakeForgejo(f.root, f.repository);
  const repositoryUrl = `${forge.state.url}/owner/repo.git`;
  const policySha256 = policyDigest(f.policy);
  const ploegCandidate = { id: candidateId, executionId, workItemId: '1980', repositoryId: 'prices', repositoryUrl, generation: 1, canonicalSha: candidate.canonicalSha, baseSha: candidate.baseSha, treeSha: candidate.treeSha, policySha256, artifactSha256: candidate.artifactSha };
  const receipt = { id: 'c'.repeat(32), candidateId, policySha256, canonicalSha: candidate.canonicalSha, treeSha: candidate.treeSha, artifactSha256: candidate.artifactSha, passed: true, testCount: 2, evidenceSha256: 'f'.repeat(64) };
  const ploeg = await fakePloeg({ candidate: ploegCandidate, receipt, approval: options.approved === false ? null : { id: 'd'.repeat(32), candidateId, receiptId: receipt.id, policySha256, actor: owner.id }, operation: null });
  const session = { id: 'publish', title: 'Multiply prices', repositoryId: 'prices', ownerId: owner.id, status: 'completed', updatedAt: new Date().toISOString(), trackerUrl: 'https://tracker.example/1980', execution: { id: executionId, workItemId: '1980', team: 'delivery', state: 'completed', revision: 1, generation: 1, supervision: 'human', expiresAt: new Date(Date.now() + 3600000).toISOString(), stopConfirmed: true } } as unknown as Session;
  store.saveSession(session);
  store.setSecret('delivery:publish', { candidate, generation: 1, phase: 'recorded', result: { verifierId: 'unfold-docker-v1', passed: true, testCount: 2, evidenceSha256: 'f'.repeat(64), checks: [] } });
  const config = { dataDir: f.dataDir, baseUrl: 'https://unfold.example', repositories: [{ id: 'prices', url: repositoryUrl, baseBranch: 'main' }], execution: { team: 'delivery' }, ploeg: { url: ploeg.state.url, tokenEnv: 'EXECUTOR_TOKEN', userTeams: { owner: ['delivery'] } }, runtime: { agentEnvironment: [] }, delivery: { verifierTokenEnv: 'VERIFIER_TOKEN', policies: [f.policy], publisher: { kind: 'forgejo', apiUrl: `${forge.state.url}/api/v1`, tokenEnv: 'PUBLISHER_TOKEN' } } } as unknown as AppConfig;
  const publisher = new ForgejoPublisher(config.delivery!.publisher!, { plainHttp: true });
  const service = () => new DeliveryService(config, store, publisher);
  const record = () => store.getSecret<PublicationRecord>('publication:publish');
  const input = { candidateId, policySha256 };
  const cleanup = async () => { forge.server.close(); ploeg.server.close(); store.close(); await f.cleanup(); };
  return { f, store, config, candidate, forge, ploeg, service, record, input, cleanup };
}

test('happy path approves, reserves, pushes once, opens one pull request, verifies it and reports it published', async () => {
  const s = await scenario({ approved: false });
  try {
    const view = await s.service().publish('publish', owner, s.input);
    assert.equal(view.publication?.phase, 'published'); assert.equal(view.publicationEnabled, true);
    assert.equal(s.forge.state.receivePacks, 1); assert.deepEqual(s.forge.state.pullPosts, [201]);
    assert.equal(s.forge.headSha(branch), s.candidate.canonicalSha);
    const pull = s.forge.state.pulls[0];
    assert.equal(pull.head, branch); assert.equal(pull.base, 'main');
    assert.ok(pull.body.startsWith(publicationMarker(`pub-${candidateId}`)));
    for (const fact of ['Work Item 1980', 'https://unfold.example/#session/publish', 'https://tracker.example/1980', candidateId, 'c'.repeat(32), 'd'.repeat(32), s.candidate.canonicalSha, s.candidate.baseSha, s.candidate.treeSha, policyDigest(s.f.policy), 'unfold-docker-v1', 'by owner', 'Merge stays human']) assert.ok(pull.body.includes(fact), fact);
    assert.equal(s.ploeg.delivery.operation.state, 'published'); assert.equal(s.ploeg.delivery.operation.remoteUrl, `${s.forge.state.url}/owner/repo/pulls/1`);
    assert.deepEqual(s.ploeg.state.statuses, [{ state: 'published', token: process.env.VERIFIER_TOKEN }]);
    assert.ok(s.forge.state.paths.every(path => !path.includes(publisherToken)));
    const replay = await s.service().publish('publish', owner, s.input);
    assert.equal(replay.publication?.phase, 'published'); assert.equal(s.forge.state.receivePacks, 1); assert.equal(s.forge.state.pullPosts.length, 1);
  } finally { await s.cleanup(); }
});

test('replayed reservation never pushes: a lost 201 ends publication_recovery_required', async () => {
  const s = await scenario();
  try {
    s.ploeg.state.dropNextReservation = true;
    await assert.rejects(s.service().publish('publish', owner, s.input), { code: 'delivery_authority_unconfirmed' });
    assert.equal(s.record()?.phase, 'reserving');
    await assert.rejects(s.service().publish('publish', owner, s.input), { code: 'publication_recovery_required' });
    await assert.rejects(s.service().publish('publish', owner, s.input), { code: 'publication_recovery_required' });
    assert.deepEqual(s.ploeg.state.reservations, [201, 200]);
    assert.equal(s.forge.state.receivePacks, 0); assert.equal(s.forge.state.pullPosts.length, 0); assert.equal(s.forge.headSha(branch), '');
    assert.equal(s.ploeg.delivery.operation.state, 'unknown');
    assert.equal((await s.service().view('publish', owner)).publication?.phase, 'recovery_required');
  } finally { await s.cleanup(); }
});

test('a crash after the push reconciles on startup from the pushed ref and opens exactly one pull request', async () => {
  const s = await scenario();
  try {
    s.forge.state.dropNextPullPost = 'before';
    await assert.rejects(s.service().publish('publish', owner, s.input), { code: 'publication_forge_unavailable' });
    assert.equal(s.record()?.phase, 'pushed');
    s.store.setSecret('publication:publish', { ...s.record()!, phase: 'authorized' });
    const restarted = s.service(); await restarted.reconcileAll();
    assert.equal(s.record()?.phase, 'pushed');
    const view = await restarted.publish('publish', owner, s.input);
    assert.equal(view.publication?.phase, 'published');
    assert.equal(s.forge.state.receivePacks, 1); assert.equal(s.forge.state.pulls.length, 1);
  } finally { await s.cleanup(); }
});

test('a lost pull request response is found through the paged lookup after the forge answers 409', async () => {
  const s = await scenario();
  try {
    for (let index = 0; index < 60; index++) s.forge.state.pulls.push({ number: index + 1, title: 'other', body: '', head: `other-${index}`, base: 'main' });
    s.forge.state.dropNextPullPost = 'after';
    await assert.rejects(s.service().publish('publish', owner, s.input), { code: 'publication_forge_unavailable' });
    assert.equal(s.record()?.phase, 'pushed');
    const view = await s.service().publish('publish', owner, s.input);
    assert.equal(view.publication?.phase, 'published'); assert.equal(view.publication?.pullRequest?.number, 61);
    assert.deepEqual(s.forge.state.pullPosts, [0, 409]);
    assert.equal(s.forge.state.pulls.filter(pull => pull.head === branch).length, 1);
    assert.ok(s.forge.state.paths.some(path => path.includes('page=2')));
  } finally { await s.cleanup(); }
});

test('a foreign commit on the reserved branch becomes unknown for a human and opens no pull request', async () => {
  const s = await scenario();
  try {
    s.forge.setBranch(s.candidate.baseSha);
    await assert.rejects(s.service().publish('publish', owner, s.input), { code: 'publication_unknown' });
    assert.equal(s.record()?.phase, 'unknown'); assert.equal(s.forge.headSha(branch), s.candidate.baseSha);
    assert.equal(s.forge.state.pullPosts.length, 0); assert.equal(s.ploeg.delivery.operation.state, 'unknown');
    await assert.rejects(s.service().publish('publish', owner, s.input), { code: 'publication_unknown' });
    assert.equal((await s.service().view('publish', owner)).publication?.phase, 'unknown');
  } finally { await s.cleanup(); }
});

test('a lost status report is replayed by reconciliation on view without a second pull request', async () => {
  const s = await scenario();
  try {
    s.ploeg.state.dropNextStatus = true;
    await assert.rejects(s.service().publish('publish', owner, s.input), { code: 'delivery_authority_unconfirmed' });
    assert.equal(s.record()?.phase, 'proposed');
    const view = await s.service().view('publish', owner);
    assert.equal(view.publication?.phase, 'published'); assert.equal(view.operation?.state, 'published');
    assert.deepEqual(s.forge.state.pullPosts, [201]); assert.equal(s.forge.state.receivePacks, 1);
    assert.deepEqual(s.ploeg.state.statuses.map(status => status.state), ['published', 'published']);
  } finally { await s.cleanup(); }
});

test('publication stays disabled without a configured publisher', async () => {
  const s = await scenario();
  try {
    const service = new DeliveryService({ ...s.config, delivery: { ...s.config.delivery!, publisher: undefined } }, s.store);
    assert.equal((await service.view('publish', owner)).publicationEnabled, false);
    await assert.rejects(service.publish('publish', owner, s.input), { code: 'publication_disabled' });
    assert.equal(s.ploeg.state.reservations.length, 0);
  } finally { await s.cleanup(); }
});

test('publisher configuration rejects shared or agent-visible tokens and plain-text forges', async () => {
  const f = await deliveryFixture();
  try {
    const config = { dataDir: f.dataDir, repositories: [{ id: 'prices', url: 'https://forge.example/owner/repo.git' }], execution: { team: 'delivery' }, ploeg: { tokenEnv: 'EXECUTOR_TOKEN' }, runtime: { agentEnvironment: ['AGENT_VISIBLE'] } } as unknown as AppConfig;
    const raw = (publisher: unknown) => ({ verifierTokenEnv: 'VERIFIER_TOKEN', policies: [f.policy], publisher });
    const valid = { kind: 'forgejo', apiUrl: 'https://forge.example/api/v1/', tokenEnv: 'PUBLISHER_TOKEN' };
    assert.deepEqual(validateDeliveryConfig(raw(valid), config)?.publisher, { ...valid, apiUrl: 'https://forge.example/api/v1' });
    for (const tokenEnv of ['AGENT_VISIBLE', 'EXECUTOR_TOKEN', 'VERIFIER_TOKEN', 'lowercase']) assert.throws(() => validateDeliveryConfig(raw({ ...valid, tokenEnv }), config), /delivery.publisher/);
    assert.throws(() => validateDeliveryConfig(raw({ ...valid, apiUrl: 'http://forge.example/api/v1' }), config), /delivery.publisher/);
    assert.throws(() => validateDeliveryConfig(raw({ ...valid, apiUrl: 'https://user:secret@forge.example/api/v1' }), config), /delivery.publisher/);
    assert.throws(() => validateDeliveryConfig(raw({ ...valid, kind: 'github' }), config), /delivery.publisher/);
    assert.throws(() => validateDeliveryConfig(raw({ ...valid, token: 'inline' }), config), /delivery.publisher/);
    config.repositories[0].url = 'ssh://git@forge.example/owner/repo.git';
    assert.throws(() => validateDeliveryConfig(raw(valid), config), /delivery.publisher/);
    assert.equal(validateDeliveryConfig(raw(undefined), config)?.publisher, undefined);
  } finally { await f.cleanup(); }
});

test('publication branches follow the Work Item and fall back to the session when Ploeg would reject the name', () => {
  assert.equal(publicationBranch('1980', 'session-1', candidateId), branch);
  assert.equal(publicationBranch('', 'session-1', candidateId), `unfold/session-session-1/${candidateId.slice(0, 12)}`);
  assert.equal(publicationBranch('bad name', 'session-1', candidateId), `unfold/session-session-1/${candidateId.slice(0, 12)}`);
  assert.equal(publicationBranch('x.lock', 'session-1', candidateId), `unfold/session-session-1/${candidateId.slice(0, 12)}`);
});
