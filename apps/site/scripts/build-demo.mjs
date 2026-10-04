#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = fileURLToPath(new URL('..', import.meta.url));
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : resolve(process.argv[index + 1]);
};
const unfoldPublic = option('--unfold', resolve(site, '../unfold/public'));
const replayDir = option('--replay', resolve(site, 'replay'));
const out = option('--out', resolve(site, 'public/demo'));

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

async function files(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await files(path)));
    else if (entry.isFile()) found.push(path);
  }
  return found.sort();
}

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );

function insert(html, anchor, addition, where) {
  if (!html.includes(anchor))
    throw new Error(
      `Unfold's public/index.html no longer contains ${JSON.stringify(anchor)}; update apps/site/scripts/build-demo.mjs`,
    );
  return html.replace(anchor, where === 'before' ? `${addition}${anchor}` : `${anchor}${addition}`);
}

const manifest = JSON.parse(await readFile(join(replayDir, 'manifest.json'), 'utf8'));
const replay = await readFile(join(replayDir, 'replay.json'));
const stale = [];
if (createHash('sha256').update(replay).digest('hex') !== manifest.replay)
  stale.push('replay.json does not match its manifest');
const sources = await files(unfoldPublic);
const present = new Set();
for (const path of sources) {
  const name = relative(unfoldPublic, path).split(sep).join('/');
  present.add(name);
  const hash = createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
  if (manifest.files[name] !== hash) stale.push(`public/${name} changed since the recording`);
}
for (const name of Object.keys(manifest.files))
  if (!present.has(name)) stale.push(`public/${name} was removed since the recording`);
if (stale.length)
  throw new Error(
    `The demo replay was recorded against another Unfold UI. Run mise run demo-record.\n  ${stale.join('\n  ')}`,
  );

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const path of sources) {
  const name = relative(unfoldPublic, path);
  if (name === 'index.html') continue;
  await mkdir(join(out, name, '..'), { recursive: true });
  await cp(path, join(out, name));
}
await writeFile(join(out, 'replay', 'replay.json'), replay);

const banner = `<aside class="replay-banner" aria-label="About this replay"><p>Recorded replay of Unfold's deterministic demo at <code>${escape(manifest.commit)}</code> (recorded ${escape(manifest.recordedAt)}). Nothing runs here; run <code>mise run demo</code> locally.</p><div class="replay-banner-actions"><button type="button" class="replay-banner-button" data-replay-restart>Restart the replay</button><a class="replay-banner-link" href="/">Unfold home</a></div></aside>`;
let html = await readFile(join(unfoldPublic, 'index.html'), 'utf8');
html = insert(
  html,
  '<meta charset="utf-8">',
  `\n  <meta http-equiv="Content-Security-Policy" content="${csp}">\n  <meta name="robots" content="noindex, nofollow">`,
  'after',
);
html = insert(
  html,
  '<link rel="stylesheet" href="styles.css">',
  '\n  <link rel="stylesheet" href="replay/banner.css">',
  'after',
);
html = insert(
  html,
  '<script type="module" src="app.js"></script>',
  '<script type="module" src="replay/replay.js"></script>\n  ',
  'before',
);
html = insert(html, '<div id="app">', `${banner}\n  `, 'before');
await writeFile(join(out, 'index.html'), html);
process.stdout.write(
  `demo: Unfold ${manifest.unfoldVersion} at ${manifest.commit}, recorded ${manifest.recordedAt}, into ${relative(process.cwd(), out) || out}\n`,
);
