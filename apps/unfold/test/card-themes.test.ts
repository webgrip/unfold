import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { application, login, repositoryRoot, request } from './api-support.ts';
import { hashPassword } from '../src/auth.ts';
import { sanitizeSvg, SvgError } from '../src/svg-sanitize.ts';
import { assetLimits, imageSize, maxImageSide, prepareAsset, sniff } from '../src/card-assets.ts';
import { loadSkinRules, validateTheme } from '../src/card-themes.ts';
import { artPrompt, artPromptTemplate, extractGlsl } from '../src/card-art.ts';
import { cardThemeSettings } from '../src/config.ts';

const skins = loadSkinRules(join(repositoryRoot, 'public'));
const noAssets = () => undefined;
const theme = (overrides: Record<string, unknown> = {}) => ({ schemaVersion: 1, id: 'acme', name: 'Acme 2026', extends: 'forge', ...overrides });
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2 L22 22 L2 22 Z" fill="#f2c35b"/></svg>';
const shader = 'vec3 art_custom(vec2 uv, float t) {\n  return vec3(uv, 0.5 + 0.5 * sin(t));\n}';

function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'latin1');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header[24] = 8;
  header[25] = 6;
  return Buffer.concat([header, Buffer.alloc(64)]);
}

function jpeg(width: number, height: number): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9, 0, 0, 0]);
}

function webp(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(40);
  bytes.write('RIFF', 0, 'latin1');
  bytes.writeUInt32LE(32, 4);
  bytes.write('WEBP', 8, 'latin1');
  bytes.write('VP8X', 12, 'latin1');
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}

const mp4 = () => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(64)]);
const webm = () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]), Buffer.from('webm', 'latin1'), Buffer.alloc(64)]);

test('the published JSON schema names the same fields and tokens the validator accepts', async () => {
  const { readFile } = await import('node:fs/promises');
  const { tokenTypes } = await import('../src/card-themes.ts');
  const schema = JSON.parse(await readFile(join(repositoryRoot, 'docs/contracts/card-theme.v1.schema.json'), 'utf8'));
  assert.deepEqual(Object.keys(schema.properties).sort(), ['art', 'cardBack', 'extends', 'foilPattern', 'frame', 'id', 'name', 'schemaVersion', 'setSymbol', 'soundBank', 'tokens', 'world']);
  assert.deepEqual(Object.keys(schema.properties.tokens.properties).sort(), Object.keys(tokenTypes).sort());
  assert.equal(schema.additionalProperties, false);
});

test('a theme passes only with allow-listed keys, tokens, frames, patterns and presets for its skin', () => {
  const full = validateTheme(theme({ tokens: { '--gc-accent': '#5b8cff', '--forge-frame': '#c0392b', '--gc-radius': '20px' }, frame: 'fullart', foilPattern: 'gold', art: { preset: 'warp' } }), skins, noAssets);
  assert.deepEqual(full, { schemaVersion: 1, id: 'acme', name: 'Acme 2026', extends: 'forge', tokens: { '--gc-accent': '#5b8cff', '--forge-frame': '#c0392b', '--gc-radius': '20px' }, frame: 'fullart', foilPattern: 'gold', art: { preset: 'warp' }, world: null, setSymbol: null, cardBack: null, soundBank: null });
  assert.deepEqual(validateTheme(theme({ extends: 'unfold-native', tokens: { '--gc-surface': '#fff' } }), skins, noAssets).tokens, { '--gc-surface': '#fff' });
  assert.deepEqual(['islands', 'deepsea', 'city', 'off', null].map(world => validateTheme(theme({ world }), skins, noAssets).world), ['islands', 'deepsea', 'city', null, null], 'a forge theme may name an inner world; off and null show the art');
  const refused: [Record<string, unknown>, RegExp][] = [
    [theme({ script: 'alert(1)' }), /no field script/],
    [theme({ version: 3 }), /no field version/],
    [theme({ schemaVersion: 2 }), /schemaVersion/],
    [theme({ id: 'Acme Corp' }), /id must be/],
    [theme({ id: '../etc' }), /id must be/],
    [theme({ name: '' }), /name must be/],
    [theme({ name: 'a\u0000b' }), /name must be/],
    [theme({ extends: 'evil-skin' }), /extends must name a skin/],
    [theme({ extends: 'https://evil.test/skin.js' }), /extends must name a skin/],
    [theme({ tokens: { color: 'red' } }), /does not read the token color/],
    [theme({ tokens: { '--gc-accent': 'red; background: url(https://evil.test/x)' } }), /hex colour/],
    [theme({ tokens: { '--gc-accent': 'expression(alert(1))' } }), /hex colour/],
    [theme({ tokens: { '--gc-accent': 'var(--x)' } }), /hex colour/],
    [theme({ tokens: { '--gc-radius': '999px' } }), /whole number of pixels/],
    [theme({ tokens: { '--gc-radius': 'calc(1px + 1em)' } }), /whole number of pixels/],
    [theme({ extends: 'unfold-native', tokens: { '--forge-frame': '#000' } }), /does not read the token --forge-frame/],
    [theme({ extends: 'unfold-native', frame: 'fullart' }), /does not draw frame/],
    [theme({ frame: 'octagon' }), /frame must be one of/],
    [theme({ foilPattern: 'sparkle' }), /foilPattern must be one of/],
    [theme({ art: { preset: 'nope' } }), /art.preset must be one of/],
    [theme({ art: { preset: 'warp', shader: 'x' } }), /art must be one of/],
    [theme({ art: { url: 'https://evil.test/art.png' } }), /art must be one of/],
    [theme({ art: { media: 'https://evil.test/art.png' } }), /must name an uploaded asset/],
    [theme({ art: { media: 'a'.repeat(64) } }), /does not have/],
    [theme({ setSymbol: '<svg onload="alert(1)"/>' }), /must name an uploaded asset/],
    [theme({ extends: 'unfold-native', setSymbol: 'a'.repeat(64) }), /does not draw a set symbol/],
    [theme({ soundBank: 'airhorn' }), /no sound banks yet/],
    [theme({ world: 'moon' }), /world must be one of islands, deepsea, city/],
    [theme({ world: { kind: 'islands' } }), /world must be one of/],
    [theme({ extends: 'unfold-native', world: 'islands' }), /does not draw world/],
    [theme({ tokens: [] }), /tokens must be an object/],
  ];
  for (const [input, reason] of refused) assert.throws(() => validateTheme(input, skins, noAssets), reason, JSON.stringify(input));
  const symbolAsset = { id: 'b'.repeat(64), purpose: 'symbol' as const, mediaType: 'image/svg+xml' as const, bytes: 10 };
  const lookup = (id: string) => (id === symbolAsset.id ? symbolAsset : undefined);
  assert.equal(validateTheme(theme({ setSymbol: symbolAsset.id }), skins, lookup).setSymbol, symbolAsset.id);
  assert.throws(() => validateTheme(theme({ cardBack: symbolAsset.id }), skins, lookup), /uploaded for something else/);
  assert.throws(() => validateTheme(theme({ art: { media: symbolAsset.id } }), skins, lookup), /uploaded for something else/);
});

test('the SVG sanitizer rebuilds an allow-listed SVG and refuses scripts, handlers, styles, links and external references', () => {
  assert.equal(sanitizeSvg(`<?xml version="1.0" encoding="UTF-8"?>\n<!-- made by hand -->\n${svg}`), svg);
  const gradient = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#000" stop-opacity="0.5"/></linearGradient></defs><g transform="rotate(45 5 5)"><rect x="1" y="1" width="8" height="8" rx="2" fill="url(#g)"/></g></svg>';
  assert.equal(sanitizeSvg(gradient), gradient.replace(' xmlns:xlink="http://www.w3.org/1999/xlink"', ''));
  const refused: [string, RegExp][] = [
    ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', /<script>/],
    ['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', /event handler \(onload\)/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><circle r="4" ONCLICK="x()"/></svg>', /event handler/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.test/x.svg#a"/></svg>', /<use>/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><a xlink:href="javascript:alert(1)"><circle r="4"/></a></svg>', /<a>/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" xlink:href="https://evil.test"/></svg>', /links to another resource/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.test/x.png"/></svg>', /<image>/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><style>circle{fill:url(https://evil.test)}</style></svg>', /<style>/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><circle r="4" style="fill:red"/></svg>', /style attribute/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><circle r="4" fill="url(https://evil.test/p.svg#x)"/></svg>', /value Unfold does not accept/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><circle r="4" fill="javascript:alert(1)"/></svg>', /value Unfold does not accept/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><circle r="4" fill="url(#missing)"/></svg>', /does not define/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>', /<foreignObject>/],
    ['<!DOCTYPE svg [<!ENTITY x "boom">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>', /DOCTYPE/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><text>Acme</text></svg>', /<text>/],
    ['<svg xmlns="http://www.w3.org/2000/svg">Acme</svg>', /text content/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><![CDATA[x]]></svg>', /CDATA/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="href" to="javascript:alert(1)"/></svg>', /<animate>/],
    ['<svg xmlns="http://evil.test/ns"/>', /value Unfold does not accept/],
    ['<?xml-stylesheet href="https://evil.test/x.css"?><svg xmlns="http://www.w3.org/2000/svg"/>', /XML declaration|processing instruction/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><g>', /leaves <g> open/],
    ['<html><body>hi</body></html>', /<html>/],
    ['<svg xmlns="http://www.w3.org/2000/svg"><circle r="4" fill="&#x6a;avascript:x"/></svg>', /value Unfold does not accept/],
    [`<svg xmlns="http://www.w3.org/2000/svg"><path d="${'M0 0 '.repeat(7000)}"/></svg>`, /larger than 32 KiB/],
  ];
  for (const [input, reason] of refused) assert.throws(() => sanitizeSvg(input), (error: any) => error instanceof SvgError && reason.test(error.message), input.slice(0, 80));
});

test('assets are typed by their bytes, bounded in size and pixels, and checked for their purpose', () => {
  assert.equal(sniff(png(10, 10)), 'image/png');
  assert.equal(sniff(jpeg(10, 10)), 'image/jpeg');
  assert.equal(sniff(webp(10, 10)), 'image/webp');
  assert.equal(sniff(mp4()), 'video/mp4');
  assert.equal(sniff(webm()), 'video/webm');
  assert.equal(sniff(Buffer.from('<html><script>alert(1)</script></html>')), null);
  assert.deepEqual([imageSize(png(640, 512), 'image/png'), imageSize(jpeg(300, 200), 'image/jpeg'), imageSize(webp(63, 88), 'image/webp')], [{ width: 640, height: 512 }, { width: 300, height: 200 }, { width: 63, height: 88 }]);
  const art = prepareAsset('art', png(640, 512));
  assert.equal(art.mediaType, 'image/png');
  assert.match(art.id, /^[a-f0-9]{64}$/);
  assert.equal(prepareAsset('art', mp4()).mediaType, 'video/mp4');
  assert.equal(prepareAsset('back', webp(630, 880)).mediaType, 'image/webp');
  assert.equal(prepareAsset('symbol', Buffer.from(`<!-- x -->${svg}`)).content.toString(), svg, 'a set symbol is stored as its sanitized copy');
  assert.equal(prepareAsset('shader', Buffer.from(shader.replace(/\n/g, '\r\n'))).content.toString(), shader);
  const refused: [string, Buffer, RegExp, number?][] = [
    ['art', Buffer.from('<html><script>alert(1)</script></html>'), /PNG, JPEG or WebP image, or an MP4 or WebM video/],
    ['art', Buffer.from(svg), /PNG, JPEG or WebP image/],
    ['back', mp4(), /card back must be a PNG, JPEG or WebP/],
    ['symbol', png(10, 10), /must be an SVG/],
    ['symbol', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"/>'), /event handler/],
    ['shader', Buffer.from(`uniform float x;\n${shader}`), /declares a uniform/],
    ['art', png(maxImageSide + 1, 10), /at most 4096 pixels/],
    ['art', Buffer.concat([png(10, 10), Buffer.alloc(assetLimits['image/png'])]), /larger than 2 MiB/, 413],
    ['art', Buffer.concat([mp4(), Buffer.alloc(assetLimits['video/mp4'])]), /larger than 8 MiB/, 413],
    ['art', Buffer.alloc(0), /empty/],
    ['logo', png(10, 10), /art, back, symbol or shader/],
  ];
  for (const [purpose, bytes, reason, status = 400] of refused) assert.throws(() => prepareAsset(purpose, bytes), (error: any) => reason.test(error.message) && error.status === status, `${purpose}: ${reason}`);
});

test('the art prompt is the Card Forge template with the subject, and carries the compiler log only on a retry', () => {
  const first = artPrompt('A koi pond at night');
  assert.match(first, /^Write a GLSL ES 3\.0 function `vec3 art_custom\(vec2 uv, float t\)`/);
  assert.match(first, /Subject: A koi pond at night\n/);
  assert.doesNotMatch(first, /COMPILER_LOG|failed to compile/);
  const retry = artPrompt('A koi pond at night', "ERROR: 0:2: '=' : cannot convert");
  assert.match(retry, /failed to compile with this log[\s\S]*```\nERROR: 0:2: '=' : cannot convert\n```$/);
  assert.match(artPrompt('$& $1 {{COMPILER_LOG}}'), /Subject: \$& \$1 \{\{COMPILER_LOG\}\}/, 'the subject is inserted literally');
  assert.equal(artPromptTemplate.includes('{{PROMPT}}'), true);
  assert.equal(extractGlsl('Here:\n```glsl\nvec3 a;\n```\nthanks'), 'vec3 a;');
  assert.equal(extractGlsl('```\nvec3 b;\n```'), 'vec3 b;');
});

test('art generation settings need Unfold’s own UNFOLD_ key, never the master key, and the demo ignores them', () => {
  const ai = { baseUrl: 'https://litellm.test/v1', model: 'claude-sonnet', keyEnv: 'UNFOLD_TEST_ART_KEY' };
  const previous = { key: process.env.UNFOLD_TEST_ART_KEY, master: process.env.LITELLM_MASTER_KEY };
  try {
    delete process.env.UNFOLD_TEST_ART_KEY;
    assert.throws(() => cardThemeSettings({ ai }, 'live'), /not set to a valid key/);
    process.env.UNFOLD_TEST_ART_KEY = 'sk-unfold-art';
    assert.deepEqual(cardThemeSettings({ ai }, 'live')?.ai, { ...ai, maxTokens: 4096, timeoutMs: 90_000, requestsPerHour: 30 });
    assert.equal(cardThemeSettings({ ai }, 'demo')?.ai, undefined, 'the demo never calls a model');
    assert.throws(() => cardThemeSettings({ ai: { ...ai, keyEnv: 'LITELLM_MASTER_KEY' } }, 'live'), /UNFOLD_ environment variable/);
    assert.throws(() => cardThemeSettings({ ai: { ...ai, apiKey: 'sk-inline' } }, 'live'), /not a setting/);
    assert.throws(() => cardThemeSettings({ customSkins: true }, 'live'), /custom code skins are not supported/);
    assert.throws(() => cardThemeSettings({ ai: { ...ai, baseUrl: 'https://user:pass@litellm.test/v1' } }, 'live'), /without embedded credentials/);
    process.env.LITELLM_MASTER_KEY = 'sk-unfold-art';
    assert.throws(() => cardThemeSettings({ ai }, 'live'), /never the LiteLLM master key/);
  } finally {
    if (previous.key === undefined) delete process.env.UNFOLD_TEST_ART_KEY; else process.env.UNFOLD_TEST_ART_KEY = previous.key;
    if (previous.master === undefined) delete process.env.LITELLM_MASTER_KEY; else process.env.LITELLM_MASTER_KEY = previous.master;
  }
});

async function fakeModel(answers: (content: string) => string) {
  const requests: { authorization?: string; body: any }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requests.push({ authorization: req.headers.authorization, body });
      const content = String(body.messages[0].content);
      if (content.includes('Subject: fail upstream')) { res.writeHead(500); res.end('{}'); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: answers(content) } }] }));
    });
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  assert(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}/v1`, requests, close: () => new Promise<void>(done => server.close(() => done())) };
}

test('only administrators write themes, upload assets and generate art; every signed-in role reads them', async () => {
  const model = await fakeModel(content => content.includes('failed to compile') ? `\`\`\`glsl\n${shader}\n\`\`\`` : '```glsl\nvec3 art_custom(vec2 uv, float t) { float k = 1; return vec3(k); }\n```');
  process.env.UNFOLD_TEST_CARD_ART = 'sk-unfold-card-art-test';
  const server = await application('live', config => { config.cardThemes = { assetQuotaMb: 1, ai: { baseUrl: model.url, model: 'fake-art', keyEnv: 'UNFOLD_TEST_CARD_ART', maxTokens: 1024, timeoutMs: 5000, requestsPerHour: 3 } }; });
  try {
    for (const [id, role] of [['op', 'operator'], ['viewer', 'viewer']] as const) server.app.store.addUser({ id, name: id, role, passwordHash: hashPassword('card-theme-password-1') });
    const admin = (await login(server.url)).cookie;
    const operator = (await login(server.url, 'op', 'card-theme-password-1')).cookie;
    const viewer = (await login(server.url, 'viewer', 'card-theme-password-1')).cookie;
    assert.equal((await request(server.url, '/api/card-themes')).status, 401, 'reading themes needs a sign-in');
    const put = (cookie: string, body: unknown, id = 'acme') => request(server.url, `/api/card-themes/${id}`, { method: 'PUT', cookie, body });
    for (const cookie of [operator, viewer]) {
      assert.equal((await put(cookie, { theme: theme() })).status, 403);
      assert.equal((await request(server.url, '/api/card-art/generate', { method: 'POST', cookie, body: { prompt: 'koi' } })).status, 403);
      const upload = await fetch(`${server.url}/api/card-assets?purpose=art`, { method: 'POST', headers: { cookie, 'x-unfold-request': '1', 'content-type': 'application/octet-stream' }, body: new Uint8Array(png(10, 10)) });
      assert.equal(upload.status, 403);
    }
    assert.equal((await request(server.url, '/api/card-themes/acme', { method: 'PUT', cookie: admin, body: { theme: theme() }, csrf: false })).status, 403, 'a write without the request marker is refused');
    const created = await put(admin, { theme: theme({ tokens: { '--forge-frame': '#c0392b' }, frame: 'slab' }) });
    assert.equal(created.status, 201, created.text);
    assert.deepEqual([created.body.version, created.body.source, created.body.updatedBy], [1, 'store', 'admin']);
    assert.equal((await request(server.url, '/api/card-themes/acme', { method: 'DELETE', cookie: operator })).status, 403);
    for (const cookie of [operator, viewer]) {
      const listed = await request(server.url, '/api/card-themes', { cookie });
      assert.equal(listed.status, 200);
      assert.deepEqual([listed.body.canEdit, listed.body.themes.map((entry: any) => entry.id), listed.body.art.model], [false, ['acme'], null]);
      assert.equal((await request(server.url, '/api/card-themes/acme', { cookie })).body.frame, 'slab');
    }
    const catalog = await request(server.url, '/api/card-themes', { cookie: admin });
    assert.deepEqual([catalog.body.canEdit, catalog.body.art.configured, catalog.body.art.model, catalog.body.skins.map((skin: any) => skin.id)], [true, true, 'fake-art', ['arcade', 'forge', 'holo', 'loot', 'patch', 'ticker', 'unfold-native']]);
    assert.doesNotMatch(catalog.text, /sk-unfold-card-art-test/, 'the key never reaches the browser');

    const stale = await put(admin, { theme: theme({ name: 'Second' }), baseVersion: 0 });
    assert.equal(stale.status, 409, 'saving over a version you did not open is refused');
    assert.equal(stale.body.error.code, 'theme_changed');
    const second = await put(admin, { theme: theme({ name: 'Second' }), baseVersion: 1 });
    assert.equal(second.body.version, 2);
    assert.deepEqual((await request(server.url, '/api/card-themes/acme/versions', { cookie: admin })).body.versions.map((entry: any) => entry.version), [2, 1]);
    assert.equal((await request(server.url, '/api/card-themes/acme/versions/1', { cookie: admin })).body.frame, 'slab');
    assert.equal((await put(admin, { theme: theme({ id: 'other' }) })).status, 400, 'the id must match the address');
    assert.match((await put(admin, { theme: theme({ tokens: { '--gc-accent': 'red;}*{display:none' } }), baseVersion: 2 })).body.error.message, /hex colour/);

    const uploadAs = (purpose: string, body: Buffer, contentType = 'application/octet-stream') => fetch(`${server.url}/api/card-assets?purpose=${purpose}`, { method: 'POST', headers: { cookie: admin, 'x-unfold-request': '1', 'content-type': contentType }, body: new Uint8Array(body) });
    assert.equal((await uploadAs('art', png(10, 10), 'image/png')).status, 415, 'uploads are raw octet streams; Unfold types them itself');
    const symbolResponse = await uploadAs('symbol', Buffer.from(svg));
    assert.equal(symbolResponse.status, 201);
    const symbol = await symbolResponse.json() as { id: string; mediaType: string };
    assert.equal(symbol.mediaType, 'image/svg+xml');
    const hostile = await uploadAs('symbol', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
    assert.equal(hostile.status, 400);
    assert.match(((await hostile.json()) as any).error.message, /<script>/);
    assert.equal((await uploadAs('art', Buffer.concat([png(10, 10), Buffer.alloc(9 * 1024 * 1024)]))).status, 413);
    const video = await (await uploadAs('art', Buffer.concat([mp4(), Buffer.alloc(700 * 1024)]))).json() as { id: string };
    assert.equal((await uploadAs('art', Buffer.concat([webm(), Buffer.alloc(400 * 1024)]))).status, 507, 'the asset quota holds');
    const served = await fetch(`${server.url}/api/card-assets/${symbol.id}`, { headers: { cookie: viewer } });
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/svg+xml');
    assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(served.headers.get('content-security-policy'), "default-src 'none'; sandbox");
    assert.equal(await served.text(), svg);
    assert.equal((await fetch(`${server.url}/api/card-assets/${symbol.id}`)).status, 401);
    const ranged = await fetch(`${server.url}/api/card-assets/${video.id}`, { headers: { cookie: admin, range: 'bytes=0-15' } });
    assert.deepEqual([ranged.status, ranged.headers.get('content-range'), (await ranged.arrayBuffer()).byteLength], [206, `bytes 0-15/${700 * 1024 + 76}`, 16]);

    const themed = await put(admin, { theme: theme({ name: 'With assets', setSymbol: symbol.id, art: { media: video.id } }), baseVersion: 2 });
    assert.equal(themed.status, 200, themed.text);
    assert.deepEqual(themed.body.assets[symbol.id], { purpose: 'symbol', mediaType: 'image/svg+xml', bytes: svg.length });
    assert.equal(themed.body.assets[video.id].mediaType, 'video/mp4');

    const first = await request(server.url, '/api/card-art/generate', { method: 'POST', cookie: admin, body: { prompt: 'A koi pond at night' } });
    assert.equal(first.status, 200, first.text);
    assert.equal(first.body.attempt, 1);
    assert.match(first.body.code, /float k = 1;/);
    const retry = await request(server.url, '/api/card-art/generate', { method: 'POST', cookie: admin, body: { prompt: 'A koi pond at night', attempt: 2, compilerLog: "ERROR: 0:1: '=' : cannot convert from 'const int' to 'highp float'" } });
    assert.equal(retry.body.code, shader);
    assert.deepEqual(retry.body.problems, []);
    assert.equal(model.requests.length, 2);
    assert.equal(model.requests[0].authorization, 'Bearer sk-unfold-card-art-test', 'Unfold sends its own key');
    assert.equal(model.requests[0].body.model, 'fake-art');
    assert.match(model.requests[0].body.messages[0].content, /Subject: A koi pond at night\n/);
    assert.doesNotMatch(model.requests[0].body.messages[0].content, /failed to compile/);
    assert.match(model.requests[1].body.messages[0].content, /failed to compile with this log\. Fix every error[^\n]*\n\n```\nERROR: 0:1: '=' : cannot convert from 'const int' to 'highp float'\n```/);
    assert.equal((await request(server.url, '/api/card-art/generate', { method: 'POST', cookie: admin, body: { prompt: 'koi', attempt: 4, compilerLog: 'x' } })).status, 400, 'at most three attempts');
    assert.equal((await request(server.url, '/api/card-art/generate', { method: 'POST', cookie: admin, body: { prompt: 'koi', attempt: 2 } })).status, 400, 'a retry carries the log');
    const upstream = await request(server.url, '/api/card-art/generate', { method: 'POST', cookie: admin, body: { prompt: 'fail upstream' } });
    assert.deepEqual([upstream.status, upstream.body.error.code], [502, 'art_gateway']);
    assert.match(upstream.body.error.message, /HTTP 500/);
    const limited = await request(server.url, '/api/card-art/generate', { method: 'POST', cookie: admin, body: { prompt: 'one too many' } });
    assert.deepEqual([limited.status, limited.body.error.code], [429, 'rate_limited']);

    assert.equal((await request(server.url, '/api/card-themes/acme', { method: 'DELETE', cookie: admin })).status, 200);
    assert.equal((await request(server.url, '/api/card-themes/acme', { cookie: admin })).status, 404);
  } finally {
    await server.close();
    await model.close();
    delete process.env.UNFOLD_TEST_CARD_ART;
  }
});

test('art generation is off in the demo and when unconfigured, and says how to enable it', async () => {
  const server = await application('demo');
  try {
    const catalog = await request(server.url, '/api/card-themes');
    assert.deepEqual([catalog.body.art.configured, catalog.body.art.demo], [false, true]);
    const refused = await request(server.url, '/api/card-art/generate', { method: 'POST', body: { prompt: 'koi pond' } });
    assert.deepEqual([refused.status, refused.body.error.code], [409, 'art_unconfigured']);
    assert.match(refused.body.error.message, /cardThemes\.ai/);
  } finally { await server.close(); }
});

test('themes in the mounted folder are read-only, resolve their file assets and report refused files', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'unfold-themes-'));
  await mkdir(join(folder, 'assets'));
  await writeFile(join(folder, 'assets', 'acme.svg'), svg);
  await writeFile(join(folder, 'assets', 'art.glsl'), shader);
  await writeFile(join(folder, 'client.json'), JSON.stringify(theme({ id: 'client', name: 'Client', setSymbol: 'acme.svg', art: { shader: 'art.glsl' }, frame: 'classic' })));
  await writeFile(join(folder, 'wrong-name.json'), JSON.stringify(theme({ id: 'other' })));
  await writeFile(join(folder, 'evil.json'), JSON.stringify(theme({ id: 'evil', tokens: { '--gc-accent': 'url(https://evil.test)' } })));
  await writeFile(join(folder, 'broken.json'), '{');
  const server = await application('demo', config => { config.cardThemes = { directory: folder, assetQuotaMb: 8 }; });
  try {
    const catalog = await request(server.url, '/api/card-themes');
    assert.deepEqual(catalog.body.themes.map((entry: any) => [entry.id, entry.source]), [['client', 'directory']]);
    assert.deepEqual(catalog.body.directory.problems.map((entry: any) => entry.file).sort(), ['broken.json', 'evil.json', 'wrong-name.json']);
    const client = await request(server.url, '/api/card-themes/client');
    assert.match(client.body.setSymbol, /^[a-f0-9]{64}$/);
    assert.equal(client.body.assets[client.body.setSymbol].purpose, 'symbol');
    assert.equal(await (await fetch(`${server.url}/api/card-assets/${client.body.art.shader}`)).text(), shader);
    const change = await request(server.url, '/api/card-themes/client', { method: 'PUT', body: { theme: theme({ id: 'client' }), baseVersion: 0 } });
    assert.deepEqual([change.status, change.body.error.code], [409, 'theme_managed']);
    assert.equal((await request(server.url, '/api/card-themes/client', { method: 'DELETE' })).status, 409);
  } finally {
    await server.close();
    await rm(folder, { recursive: true, force: true });
  }
});
