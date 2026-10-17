import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { watch } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const served = ['public', 'workbench'];
const demoRecording = join(root, '../site/replay/replay.json');
const recordedDir = join(root, 'workbench/recorded');
const recordingName = /^[a-z0-9][a-z0-9-]{0,63}$/;

async function recordings() {
  const local = await readdir(recordedDir).catch(() => []);
  return [{ name: 'demo', label: 'Deterministic demo (committed)', file: demoRecording }, ...local.filter(file => file.endsWith('.json') && recordingName.test(file.slice(0, -5))).sort().map(file => ({ name: file.slice(0, -5), label: `${file.slice(0, -5)} (recorded, local only)`, file: join(recordedDir, file) }))];
}

async function workItems(file) {
  const data = JSON.parse(await readFile(file, 'utf8'));
  const ids = new Map();
  for (const [key, recorded] of Object.entries(data.routes ?? {})) {
    const match = /^GET \/api\/ploeg\/work-items\/([^/?]+)$/.exec(key);
    if (match && recorded.status === 200) ids.set(match[1], { id: match[1], title: recorded.body?.item?.title ?? match[1], state: recorded.body?.item?.state ?? '' });
  }
  return [...ids.values()].sort((a, b) => Number(a.id) - Number(b.id) || a.id.localeCompare(b.id));
}

async function appPage(response) {
  const html = (await readFile(join(root, 'public/index.html'), 'utf8')).replace('<script type="module" src="app.js"></script>', '<script type="module" src="replay/replay.js"></script>\n  <script type="module" src="/workbench/app-frame.js"></script>\n  <script type="module" src="app.js"></script>');
  response.writeHead(200, { 'Content-Type': types['.html'], 'Cache-Control': 'no-cache' });
  response.end(html);
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'";

/**
 * Serves the component workbench on its own, without the Unfold application: `public/` for the components and their
 * styles, `workbench/` for the story browser, and `/app/<recording>/` for the real app answering its API from a
 * recording through the replay shim: `demo` is the committed deterministic demo, and every `workbench/recorded/*.json`
 * is a live recording kept on this machine. `/app/<recording>~<flag>,<flag>/` turns those boolean flags on in the
 * recorded bootstrap, so a frame shows a Labs view. Every response carries the application's Content Security Policy, so a
 * component that needs an inline style or script fails here as it would in the app. `/events` tells open pages when a
 * file changed.
 * @param {{ port?: number, host?: string, watchFiles?: boolean }} [options]
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function startWorkbench({ port = Number(process.env.UNFOLD_WORKBENCH_PORT ?? 7745), host = '127.0.0.1', watchFiles = true } = {}) {
  const listeners = new Set();
  const seen = new Map();
  let pending = null;
  const changed = (folder, name) => {
    if (!name) return;
    const file = join(root, folder, name);
    let stamp = 'gone';
    try { const info = statSync(file); stamp = `${info.size}:${info.mtimeMs}`; } catch {}
    if (seen.get(file) === stamp) return;
    const known = seen.has(file);
    seen.set(file, stamp);
    if (!known && stamp !== 'gone' && Date.now() - statSync(file).mtimeMs > 2000) return;
    clearTimeout(pending);
    pending = setTimeout(() => { for (const response of listeners) response.write('event: change\ndata: {}\n\n'); }, 120);
  };
  const watchers = watchFiles ? served.map(folder => watch(join(root, folder), { recursive: true }, (event, name) => changed(folder, name))) : [];
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://workbench').pathname);
    response.setHeader('Content-Security-Policy', policy);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (path === '/' || path === '/workbench') { response.writeHead(302, { Location: '/workbench/' }); response.end(); return; }
    if (path === '/events') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
      response.write(': open\n\n');
      listeners.add(response);
      request.on('close', () => listeners.delete(response));
      return;
    }
    if (path === '/workbench/recordings.json') {
      const list = await recordings();
      const body = await Promise.all(list.map(async entry => ({ name: entry.name, label: entry.label, workItems: await workItems(entry.file).catch(() => []) })));
      response.writeHead(200, { 'Content-Type': types['.json'], 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(body));
      return;
    }
    const app = /^\/app\/([^/]+)\/(.*)$/.exec(path);
    if (app) {
      const [name, flagList = ''] = app[1].split('~');
      const flags = flagList.split(',').filter(flag => /^[a-z0-9][a-z0-9.-]{0,63}$/.test(flag));
      const entry = (await recordings()).find(item => item.name === name);
      if (!entry) { response.writeHead(404); response.end('No such recording'); return; }
      if (app[2] === '' || app[2] === 'index.html') { await appPage(response); return; }
      if (app[2] === 'replay/replay.json') {
        const data = JSON.parse(await readFile(entry.file, 'utf8'));
        const bootstrap = data.routes?.['GET /api/bootstrap'];
        if (bootstrap?.body && flags.length) bootstrap.body.flags = { ...(bootstrap.body.flags ?? {}), ...Object.fromEntries(flags.map(flag => [flag, true])) };
        response.writeHead(200, { 'Content-Type': types['.json'], 'Cache-Control': 'no-store' });
        response.end(JSON.stringify(data));
        return;
      }
    }
    const relative = app ? normalize(`public/${app[2]}`) : normalize(path.endsWith('/') ? `${path}index.html` : path).replace(/^[/\\]+/, '');
    if (!served.some(folder => relative === folder || relative.startsWith(`${folder}${sep}`)) || relative.split(sep).includes('..')) { response.writeHead(404); response.end('Not found'); return; }
    try {
      const file = join(root, relative);
      const info = await stat(file);
      if (!info.isFile()) throw new Error('not a file');
      const tag = `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
      const headers = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: tag };
      if (request.headers['if-none-match'] === tag) { response.writeHead(304, headers); response.end(); return; }
      response.writeHead(200, headers);
      response.end(await readFile(file));
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(port, host, done); });
  const address = server.address();
  return {
    url: `http://${host}:${address.port}`,
    close: () => new Promise(done => { clearTimeout(pending); for (const watcher of watchers) watcher.close(); for (const response of listeners) response.end(); server.closeAllConnections(); server.close(() => done()); }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await startWorkbench();
  process.stdout.write(`Unfold workbench: ${url}/workbench/\n`);
}
