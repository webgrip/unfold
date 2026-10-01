import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { IncomingHttpHeaders } from 'node:http';
import { application } from './api-support.ts';
import { testTimeout } from './timeframes.ts';
import { acceptsGzip, matchesEtag } from '../src/static.ts';

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

function fetchRaw(base: string, path: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }> {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname, port, path, method: 'GET', headers }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    request.on('error', reject);
    request.end();
  });
}

const securityHeaders = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" };

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

test('the card runtime and its skin packs are served by a strict path pattern', { timeout: testTimeout(15_000) }, async t => {
  const server = await application('demo');
  t.after(() => server.close());
  for (const [path, type] of [['/cards/glide-card.js', 'text/javascript; charset=utf-8'], ['/cards/card-model.js', 'text/javascript; charset=utf-8'], ['/cards/registry.js', 'text/javascript; charset=utf-8'], ['/cards/glide-card.css', 'text/css; charset=utf-8'], ['/cards/skins/vloer-native/manifest.json', 'application/json; charset=utf-8'], ['/cards/skins/vloer-native/skin.css', 'text/css; charset=utf-8'], ['/cards/skins/vloer-native/skin.js', 'text/javascript; charset=utf-8']]) {
    const response = await get(server.url, path);
    assert.equal(response.status, 200, `${path}: ${response.body}`);
    assert.equal(response.type, type, path);
    assert.equal(response.body, await readFile(join(server.config.publicDir, path.slice(1)), 'utf8'), path);
  }
  for (const path of ['/cards/../package.json', '/cards/skins/../../package.json', '/cards/%2e%2e/package.json', '/cards/skins/a/b/skin.js', '/cards/skins/vloer-native/skin.html', '/cards/skins/Vloer/skin.css', '/cards/missing.js', '/cards/skins/vloer-native/', '/cards/x.json/']) {
    const response = await get(server.url, path);
    assert.equal(response.status, 404, `${path}: ${response.status}`);
  }
});

test('static files carry a strong content ETag, revalidate with 304 and keep every security header', { timeout: testTimeout(15_000) }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'vloer-etag-'));
  const publicDir = join(root, 'public');
  await mkdir(join(publicDir, 'core'), { recursive: true });
  const module = join(publicDir, 'core', 'probe.js');
  await writeFile(module, `export const probe = '${'first '.repeat(200)}';`);
  await writeFile(join(publicDir, 'index.html'), '<!doctype html><title>probe</title>');
  const server = await application('demo', config => { config.publicDir = publicDir; });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });

  const first = await fetchRaw(server.url, '/core/probe.js');
  assert.equal(first.status, 200);
  const etag = first.headers.etag!;
  assert.match(etag, /^"[A-Za-z0-9_-]{32}"$/, 'a strong validator, not W/');
  assert.equal(first.headers['cache-control'], 'no-cache');
  assert.equal(first.headers.vary, 'Accept-Encoding');
  assert.equal(first.headers['content-encoding'], undefined, 'no compression without Accept-Encoding');
  assert.equal(Number(first.headers['content-length']), first.body.length);
  assert.equal((await fetchRaw(server.url, '/core/probe.js')).headers.etag, etag, 'the ETag is stable while the file is');

  for (const header of [etag, `W/${etag}`, `"other", ${etag}`, '*']) {
    const revalidated = await fetchRaw(server.url, '/core/probe.js', { 'if-none-match': header });
    assert.equal(revalidated.status, 304, header);
    assert.equal(revalidated.body.length, 0);
    assert.equal(revalidated.headers.etag, etag);
    assert.equal(revalidated.headers['cache-control'], 'no-cache');
    assert.equal(revalidated.headers.vary, 'Accept-Encoding');
    for (const [name, value] of Object.entries(securityHeaders)) assert.equal(revalidated.headers[name], value, `${name} on 304`);
  }
  for (const [name, value] of Object.entries(securityHeaders)) assert.equal(first.headers[name], value, `${name} on 200`);
  assert.equal((await fetchRaw(server.url, '/core/probe.js', { 'if-none-match': '"stale"' })).status, 200);

  await writeFile(module, `export const probe = '${'second '.repeat(300)}';`);
  const changed = await fetchRaw(server.url, '/core/probe.js', { 'if-none-match': etag });
  assert.equal(changed.status, 200, 'a changed file is served again');
  assert.notEqual(changed.headers.etag, etag);
  assert.match(changed.body.toString('utf8'), /second/);

  const page = await fetchRaw(server.url, '/', { 'if-none-match': (await fetchRaw(server.url, '/')).headers.etag! });
  assert.equal(page.status, 304, 'the entry page revalidates too');
  assert.equal(page.headers['content-security-policy'], securityHeaders['content-security-policy']);
});

test('text assets are gzipped when the browser accepts it, with their own ETag and a cached body; binary assets are not', { timeout: testTimeout(15_000) }, async t => {
  const server = await application('demo');
  t.after(() => server.close());
  for (const [path, type] of [['/app.js', 'text/javascript; charset=utf-8'], ['/styles.css', 'text/css; charset=utf-8'], ['/', 'text/html; charset=utf-8'], ['/favicon.svg', 'image/svg+xml'], ['/site.webmanifest', 'application/manifest+json'], ['/core/state.js', 'text/javascript; charset=utf-8']] as const) {
    const plain = await fetchRaw(server.url, path);
    const zipped = await fetchRaw(server.url, path, { 'accept-encoding': 'br, gzip;q=0.8, deflate' });
    assert.equal(zipped.status, 200, path);
    assert.equal(zipped.headers['content-type'], type, path);
    assert.equal(zipped.headers['content-encoding'], 'gzip', path);
    assert.equal(zipped.headers.vary, 'Accept-Encoding', path);
    assert.equal(Number(zipped.headers['content-length']), zipped.body.length, path);
    assert(zipped.body.length < plain.body.length, `${path} got smaller`);
    assert.deepEqual(gunzipSync(zipped.body), plain.body, path);
    assert.notEqual(zipped.headers.etag, plain.headers.etag, `${path}: each encoding has its own validator`);
    assert.equal(zipped.headers.etag, plain.headers.etag!.replace(/"$/, '-gzip"'));
    assert.equal((await fetchRaw(server.url, path, { 'accept-encoding': 'gzip', 'if-none-match': zipped.headers.etag! })).status, 304, path);
    assert.equal((await fetchRaw(server.url, path, { 'accept-encoding': 'gzip', 'if-none-match': plain.headers.etag! })).status, 200, `${path}: an identity validator does not revalidate the gzip body`);
    assert.deepEqual((await fetchRaw(server.url, path, { 'accept-encoding': 'gzip' })).body, zipped.body, `${path}: the compressed body is reused`);
    assert.equal((await fetchRaw(server.url, path, { 'accept-encoding': 'gzip;q=0' })).headers['content-encoding'], undefined, `${path}: q=0 refuses gzip`);
  }
  for (const path of ['/favicon-32x32.png', '/fonts/archivo-latin-wght-wdth110.woff2']) {
    const binary = await fetchRaw(server.url, path, { 'accept-encoding': 'gzip' });
    assert.equal(binary.status, 200, path);
    assert.equal(binary.headers['content-encoding'], undefined, path);
    assert.equal(binary.headers.vary, undefined, path);
    assert.match(binary.headers.etag!, /^"[A-Za-z0-9_-]{32}"$/, path);
    assert.equal(binary.headers['cache-control'], 'no-cache', path);
  }
});

test('Accept-Encoding and If-None-Match parsing is strict', () => {
  assert.equal(acceptsGzip('gzip'), true);
  assert.equal(acceptsGzip('deflate, GZIP ; q=0.5'), true);
  assert.equal(acceptsGzip(['br', 'x-gzip']), true);
  assert.equal(acceptsGzip('gzip;q=0'), false);
  assert.equal(acceptsGzip('gzip;q=0.000'), false);
  assert.equal(acceptsGzip('*'), false, 'only an explicit gzip is trusted');
  assert.equal(acceptsGzip('gzipped, br'), false);
  assert.equal(acceptsGzip(undefined), false);
  assert.equal(matchesEtag('"a", W/"b"', '"b"'), true);
  assert.equal(matchesEtag('"a-gzip"', '"a"'), false);
  assert.equal(matchesEtag(undefined, '"a"'), false);
});

test('a tiny text file is served uncompressed even when gzip is accepted', { timeout: testTimeout(15_000) }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'vloer-tiny-'));
  await mkdir(join(root, 'public', 'styles'), { recursive: true });
  await writeFile(join(root, 'public', 'styles', 'tiny.css'), 'a{}');
  const server = await application('demo', config => { config.publicDir = join(root, 'public'); });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  const tiny = await fetchRaw(server.url, '/styles/tiny.css', { 'accept-encoding': 'gzip' });
  assert.equal(tiny.status, 200);
  assert.equal(tiny.headers['content-encoding'], undefined);
  assert.equal(tiny.headers.vary, 'Accept-Encoding', 'the response still varies by encoding');
  assert.equal(tiny.body.toString('utf8'), 'a{}');
  assert.equal((await fetchRaw(server.url, '/styles/tiny.css', { 'accept-encoding': 'gzip', 'if-none-match': tiny.headers.etag! })).status, 304);
});
