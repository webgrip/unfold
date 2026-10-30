import { createReadStream, createWriteStream, statSync } from 'node:fs';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createGzip, type Gzip } from 'node:zlib';
import type { WriteStream } from 'node:fs';

const block = 512;

function octal(value: number, width: number): string {
  return value.toString(8).padStart(width - 1, '0');
}

/** A POSIX ustar header for one regular file of `size` bytes named `name` (at most 100 bytes). */
export function ustarHeader(name: string, size: number, mtime: Date): Buffer {
  const bytes = Buffer.byteLength(name);
  if (bytes === 0 || bytes > 100 || name.includes('\0')) throw new Error(`tar member name must be 1 to 100 bytes: ${name}`);
  const header = Buffer.alloc(block, 0);
  header.write(name, 0, 100, 'utf8');
  header.write(`${octal(0o644, 8)}\0`, 100, 8, 'ascii');
  header.write(`${octal(0, 8)}\0`, 108, 8, 'ascii');
  header.write(`${octal(0, 8)}\0`, 116, 8, 'ascii');
  header.write(`${octal(size, 12)}\0`, 124, 12, 'ascii');
  header.write(`${octal(Math.floor(mtime.getTime() / 1000), 12)}\0`, 136, 12, 'ascii');
  header.write('        ', 148, 8, 'ascii');
  header.write('0', 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${octal(sum, 7)}\0 `, 148, 8, 'ascii');
  return header;
}

/**
 * Writes a gzip-compressed POSIX ustar archive to a file, one member at a time, streaming each member's content from
 * disk so memory stays bounded whatever the member's size. The archive's SHA-256 is computed as it is written.
 */
export class TarGzipWriter {
  private readonly gzip: Gzip;
  private readonly out: WriteStream;
  private readonly hash = createHash('sha256');
  private bytes = 0;
  private readonly done: Promise<void>;

  constructor(path: string) {
    this.gzip = createGzip({ level: 6 });
    this.out = createWriteStream(path, { mode: 0o600 });
    this.gzip.on('data', (chunk: Buffer) => { this.hash.update(chunk); this.bytes += chunk.length; });
    this.gzip.pipe(this.out);
    this.done = new Promise((resolve, reject) => {
      this.out.once('finish', () => resolve());
      this.out.once('error', reject);
      this.gzip.once('error', reject);
    });
  }

  private async push(chunk: Buffer): Promise<void> {
    if (!this.gzip.write(chunk)) await once(this.gzip, 'drain');
  }

  /** Adds the file at `source` as member `name`. */
  async addFile(name: string, source: string, mtime: Date): Promise<void> {
    const size = statSync(source).size;
    await this.push(ustarHeader(name, size, mtime));
    let written = 0;
    for await (const chunk of createReadStream(source)) { written += (chunk as Buffer).length; await this.push(chunk as Buffer); }
    if (written !== size) throw new Error(`tar member ${name} changed while it was archived`);
    const padding = (block - (size % block)) % block;
    if (padding) await this.push(Buffer.alloc(padding, 0));
  }

  /** Adds `content` as member `name`. */
  async addBuffer(name: string, content: Buffer, mtime: Date): Promise<void> {
    await this.push(ustarHeader(name, content.length, mtime));
    await this.push(content);
    const padding = (block - (content.length % block)) % block;
    if (padding) await this.push(Buffer.alloc(padding, 0));
  }

  /** Ends the archive with its two zero blocks and answers its compressed size and SHA-256. */
  async finish(): Promise<{ bytes: number; sha256: string }> {
    await this.push(Buffer.alloc(block * 2, 0));
    this.gzip.end();
    await this.done;
    return { bytes: this.bytes, sha256: this.hash.digest('hex') };
  }

  /** Stops writing after a failure; the partial file is the caller's to remove. */
  abort(): void { this.gzip.destroy(); this.out.destroy(); }
}
