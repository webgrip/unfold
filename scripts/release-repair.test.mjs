import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseFor, repairRelease } from './release-repair.mjs';

const notes = '## [unfold-v0.4.0-rc.26](https://forgejo.example/compare/unfold-v0.4.0-rc.25...unfold-v0.4.0-rc.26) (2026-10-01)\n\n### Added\n\n* **vloer:** show a run card';

function repository(t, tags) {
  const root = mkdtempSync(join(tmpdir(), 'release-repair-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: root, stdio: 'ignore' });
  run('init', '-q');
  writeFileSync(join(root, 'CHANGELOG.md'), notes);
  run('add', 'CHANGELOG.md');
  run('commit', '-q', '-m', 'chore(release): unfold-v0.4.0-rc.26 [skip ci]', '-m', notes);
  for (const tag of tags) run('tag', tag);
  return root;
}

async function forgejo(t, existing) {
  const requests = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization, body: body && JSON.parse(body) });
      const found = request.method === 'GET' && existing.some(tag => request.url.endsWith(`/releases/tags/${tag}`));
      response.writeHead(request.method === 'POST' ? 201 : found ? 200 : 404, { 'Content-Type': 'application/json' }).end('{}');
    });
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => server.close());
  return { api: `http://127.0.0.1:${server.address().port}/api/v1/repos/webgrip/glide`, requests };
}

test('a release tag without its release gets the release semantic-release would have created', async t => {
  const root = repository(t, ['unfold-v0.4.0-rc.26', 'unfold-site-v0.1.0-rc.5']);
  const { api, requests } = await forgejo(t, []);
  assert.match(await repairRelease({ root, prefix: 'unfold-v', api, token: 'secret' }), /Created the missing unfold-v0\.4\.0-rc\.26 release/);
  assert.deepEqual(requests.map(request => `${request.method} ${request.url}`), ['GET /api/v1/repos/webgrip/glide/releases/tags/unfold-v0.4.0-rc.26', 'POST /api/v1/repos/webgrip/glide/releases']);
  assert.equal(requests[1].authorization, 'token secret');
  assert.deepEqual(requests[1].body, releaseFor('unfold-v0.4.0-rc.26', notes));
});

test('nothing is created when HEAD has no release tag or its release already exists', async t => {
  const untagged = repository(t, []);
  const tagged = repository(t, ['unfold-v0.4.0-rc.26']);
  const { api, requests } = await forgejo(t, ['unfold-v0.4.0-rc.26']);
  await assert.rejects(repairRelease({ root: untagged, prefix: 'unfold-v', api, token: 'secret' }), /failed before tagging/);
  await assert.rejects(repairRelease({ root: tagged, prefix: 'unfold-site-v', api, token: 'secret' }), /No unfold-site-v tag/);
  await assert.rejects(repairRelease({ root: tagged, prefix: 'unfold-v', api, token: 'secret' }), /already has a release/);
  assert.ok(!requests.some(request => request.method === 'POST'));
});

test('a pre-release is marked as one and a stable release is not', () => {
  assert.equal(releaseFor('unfold-v0.4.0-rc.26', notes).prerelease, true);
  assert.equal(releaseFor('unfold-v0.4.0', notes).prerelease, false);
});
