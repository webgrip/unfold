import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deliveryFailure } from './trusted-candidate.ts';

export type ArchiveRoot = { directory: string; prefix: string };
export const archiveOwner = 65532;
const block = 512;

function octal(value: number, width: number): string {
  return value.toString(8).padStart(width - 1, '0') + '\0';
}

function header(name: string, mode: number, size: number, type: '0' | '5' | 'x'): Buffer {
  const result = Buffer.alloc(block);
  result.write(name, 0, 100, 'utf8');
  result.write(octal(mode, 8), 100, 'ascii');
  result.write(octal(archiveOwner, 8), 108, 'ascii');
  result.write(octal(archiveOwner, 8), 116, 'ascii');
  result.write(octal(size, 12), 124, 'ascii');
  result.write(octal(0, 12), 136, 'ascii');
  result.write(' '.repeat(8), 148, 'ascii');
  result.write(type, 156, 'ascii');
  result.write('ustar\0', 257, 'ascii');
  result.write('00', 263, 'ascii');
  let checksum = 0;
  for (const byte of result) checksum += byte;
  result.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
  return result;
}

function padding(size: number): Buffer {
  return Buffer.alloc((block - (size % block)) % block);
}

function paxPath(name: string): Buffer {
  const body = ` path=${name}\n`;
  let length = Buffer.byteLength(body);
  while (Buffer.byteLength(`${length}${body}`) !== length) length = Buffer.byteLength(`${length}${body}`);
  return Buffer.from(`${length}${body}`, 'utf8');
}

function* entry(name: string, mode: number, type: '0' | '5', content?: Buffer): Generator<Buffer> {
  if (Buffer.byteLength(name) > 100) {
    const record = paxPath(name);
    yield header('PaxHeader', 0o644, record.length, 'x'); yield record; yield padding(record.length);
  }
  const size = content?.length ?? 0;
  yield header(Buffer.byteLength(name) > 100 ? name.slice(0, 50) : name, mode, size, type);
  if (content) { yield content; yield padding(size); }
}

async function* walk(root: string, directory: string, prefix: string): AsyncGenerator<Buffer> {
  const names = (await readdir(join(root, directory))).sort();
  for (const name of names) {
    const relative = directory ? `${directory}/${name}` : name;
    const status = await lstat(join(root, relative));
    if (status.isDirectory()) { yield* entry(`${prefix}/${relative}/`, 0o755, '5'); yield* walk(root, relative, prefix); }
    else if (status.isFile()) yield* entry(`${prefix}/${relative}`, status.mode & 0o111 ? 0o555 : 0o444, '0', await readFile(join(root, relative)));
    else deliveryFailure('unsupported_tree');
  }
}

/** Streams a POSIX tar archive of each root's regular files and directories under its prefix, ending with an empty `complete` marker under `markerPrefix` so a receiver can tell a whole archive from a truncated one. */
export async function* verificationArchive(roots: ArchiveRoot[], markerPrefix: string): AsyncGenerator<Buffer> {
  for (const root of roots) yield* walk(root.directory, '', root.prefix);
  yield* entry(`${markerPrefix}/complete`, 0o444, '0', Buffer.alloc(0));
  yield Buffer.alloc(block * 2);
}
