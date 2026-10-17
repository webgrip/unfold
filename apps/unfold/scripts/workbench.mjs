import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { watch } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const served = ['public', 'workbench'];
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'";

/**
 * Serves the component workbench on its own, without the Unfold application: `public/` for the components and their
 * styles, `workbench/` for the story browser. Every response carries the application's Content Security Policy, so a
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
    const relative = normalize(path.endsWith('/') ? `${path}index.html` : path).replace(/^[/\\]+/, '');
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
