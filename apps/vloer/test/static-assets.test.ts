import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { application } from './api-support.ts';
import { testTimeout } from './timeframes.ts';

function get(base: string, path: string): Promise<{ status: number; type: string | undefined; body: string }> {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname, port, path, method: 'GET' }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, type: response.headers['content-type'], body }));
    });
    request.on('error', reject);
    request.end();
  });
}

test('nested browser modules are served from core, views and styles with their media type, and nothing else is', { timeout: testTimeout(15_000) }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'vloer-static-'));
  const publicDir = join(root, 'public');
  const files: Record<string, string> = {
    'index.html': '<!doctype html>',
    'core/state-probe.js': 'export const probe = 1;',
    'views/probe-2.js': 'export default {};',
    'styles/probe.css': ':root { --probe: 1; }',
    'styles/probe.js': 'export {};',
    'core/x.JS': 'export {};',
    'core/.x.js': 'export {};',
    'views/a/b.js': 'export {};',
    'styles/x.css.map': '{}',
    'other/probe.js': 'export {};',
    'core/folder.js/inner.js': 'export {};',
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(publicDir, path, '..'), { recursive: true });
    await writeFile(join(publicDir, path), content);
  }
  await writeFile(join(root, 'package.json'), '{"secret":true}');
  const server = await application('demo', config => { config.publicDir = publicDir; });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });

  for (const [path, type] of [['/core/state-probe.js', 'text/javascript; charset=utf-8'], ['/views/probe-2.js', 'text/javascript; charset=utf-8'], ['/styles/probe.css', 'text/css; charset=utf-8'], ['/styles/probe.js', 'text/javascript; charset=utf-8']]) {
    const response = await get(server.url, path);
    assert.equal(response.status, 200, `${path}: ${response.body}`);
    assert.equal(response.type, type, path);
    assert.equal(response.body, files[path.slice(1)], path);
  }
  for (const path of ['/core/../package.json', '/core/../../package.json', '/core/%2e%2e/package.json', '/core/%2e%2e/%2e%2e/package.json', '/core/..%2f..%2fpackage.json', '/core/x.JS', '/core/.x.js', '/views/a/b.js', '/styles/x.css.map', '/other/probe.js', '/core/missing.js', '/core/folder.js', '/core/', '/core/state-probe.js/', '/core//state-probe.js', '/CORE/state-probe.js', '/core/state_probe.js', '/core/-probe.js']) {
    const response = await get(server.url, path);
    assert.equal(response.status, 404, `${path}: ${response.status} ${response.body}`);
    assert(!response.body.includes('secret'), path);
  }
});

test('the workbench entry, shell and its core and view modules are served from the application public directory', { timeout: testTimeout(15_000) }, async t => {
  const server = await application('demo');
  t.after(() => server.close());
  for (const path of ['/app.js', '/shell.js', '/core/state.js', '/core/registry.js', '/views/index.js', '/views/session.js']) {
    const response = await get(server.url, path);
    assert.equal(response.status, 200, `${path}: ${response.body}`);
    assert.equal(response.type, 'text/javascript; charset=utf-8', path);
    assert.equal(response.body, await readFile(join(server.config.publicDir, path.slice(1)), 'utf8'), path);
  }
});
