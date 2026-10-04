import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gzip, constants } from 'node:zlib';

const compress = promisify(gzip);
const mediaTypes: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const compressible = new Set(['text/css', 'text/javascript', 'text/html', 'image/svg+xml', 'application/manifest+json', 'application/json']);
const cacheLimit = 512;

type Entry = { mtimeMs: number; size: number; content: Buffer; etag: string; gzipped?: Promise<Buffer | null> };

function missing(): never { throw Object.assign(new Error('Page not found.'), { status: 404, code: 'not_found' }); }

/** Reports whether an Accept-Encoding header accepts gzip with a non-zero quality. */
export function acceptsGzip(header: string | string[] | undefined): boolean {
  const value = Array.isArray(header) ? header.join(',') : header ?? '';
  return value.split(',').some(part => {
    const [name, ...parameters] = part.split(';').map(piece => piece.trim().toLowerCase());
    if (name !== 'gzip' && name !== 'x-gzip') return false;
    const quality = parameters.find(parameter => parameter.startsWith('q='));
    return quality === undefined || Number(quality.slice(2)) > 0;
  });
}

/** Reports whether an If-None-Match header names `etag` (weak comparison) or is `*`. */
export function matchesEtag(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header.split(',').map(tag => tag.trim().replace(/^W\//, '')).some(tag => tag === '*' || tag === etag);
}

/** Serves files from the public directory with a strong content-hash ETag, 304 revalidation and cached gzip for text types. */
export class StaticFiles {
  private readonly root: string;
  private readonly entries = new Map<string, Entry>();
  constructor(root: string) { this.root = root; }

  /** Answers a GET for `file`; a missing file is a 404 unless `registered` names a file the application ships, which is a server fault. */
  async serve(req: IncomingMessage, res: ServerResponse, file: string, registered: boolean): Promise<void> {
    const entry = await this.entry(file, registered);
    const type = mediaTypes[file.slice(file.lastIndexOf('.'))] ?? 'text/javascript; charset=utf-8';
    const textual = compressible.has(type.split(';')[0]);
    const gzipped = textual && acceptsGzip(req.headers['accept-encoding']) ? await (entry.gzipped ??= compress(entry.content, { level: constants.Z_BEST_COMPRESSION }).then(body => body.length < entry.content.length ? body : null, () => null)) : null;
    const etag = gzipped ? `${entry.etag.slice(0, -1)}-gzip"` : entry.etag;
    const headers: Record<string, string | number> = { 'Cache-Control': 'no-cache', ETag: etag, ...(textual ? { Vary: 'Accept-Encoding' } : {}) };
    if (matchesEtag(req.headers['if-none-match'], etag)) { res.writeHead(304, headers); res.end(); return; }
    const body = gzipped ?? entry.content;
    res.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Length': body.length, ...(gzipped ? { 'Content-Encoding': 'gzip' } : {}) });
    res.end(body);
  }

  private async entry(file: string, registered: boolean): Promise<Entry> {
    const path = join(this.root, file);
    const info = await stat(path).catch(error => { if (!registered && ['ENOENT', 'ENOTDIR'].includes(error?.code)) missing(); throw error; });
    if (!info.isFile()) { if (!registered) missing(); throw Object.assign(new Error(`${file} is not a file`), { code: 'EISDIR' }); }
    const cached = this.entries.get(path);
    if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached;
    const content = await readFile(path);
    const entry: Entry = { mtimeMs: info.mtimeMs, size: info.size, content, etag: `"${createHash('sha256').update(content).digest('base64url').slice(0, 32)}"` };
    this.entries.delete(path);
    if (this.entries.size >= cacheLimit) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(path, entry);
    return entry;
  }
}
