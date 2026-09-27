import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';

const forbidden = new Set(['gzprintf', 'gzvprintf', 'gzwrite', 'gzopen', 'gzopen64', 'gzdopen']);
const skipped = new Set(['/proc', '/sys', '/dev', '/run', '/tmp']);
const SHT_DYNSYM = 11;

function importedSymbols(buffer) {
  if (buffer.length < 64 || buffer.readUInt32BE(0) !== 0x7f454c46) return null;
  if (buffer[4] !== 2 || buffer[5] !== 1) throw new Error('only 64-bit little-endian ELF is supported');
  const sectionOffset = Number(buffer.readBigUInt64LE(0x28));
  const sectionSize = buffer.readUInt16LE(0x3a);
  const sectionCount = buffer.readUInt16LE(0x3c);
  if (sectionCount === 0) throw new Error('ELF without section headers cannot be checked');
  const section = index => {
    const at = sectionOffset + index * sectionSize;
    return {
      type: buffer.readUInt32LE(at + 4),
      offset: Number(buffer.readBigUInt64LE(at + 0x18)),
      size: Number(buffer.readBigUInt64LE(at + 0x20)),
      link: buffer.readUInt32LE(at + 0x28),
      entrySize: Number(buffer.readBigUInt64LE(at + 0x38)),
    };
  };
  const imports = [];
  for (let index = 0; index < sectionCount; index++) {
    const symbols = section(index);
    if (symbols.type !== SHT_DYNSYM || symbols.entrySize === 0) continue;
    const strings = section(symbols.link);
    for (let at = symbols.offset; at + symbols.entrySize <= symbols.offset + symbols.size; at += symbols.entrySize) {
      if (buffer.readUInt16LE(at + 6) !== 0) continue;
      const start = strings.offset + buffer.readUInt32LE(at);
      const end = buffer.indexOf(0, start);
      if (end > start) imports.push(buffer.toString('latin1', start, end));
    }
  }
  return imports;
}

function* files(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (skipped.has(path)) continue;
    const stat = lstatSync(path);
    if (stat.isDirectory()) yield* files(path);
    else if (stat.isFile()) yield path;
  }
}

const roots = process.argv.slice(2);
let checked = 0;
const offenders = [];
for (const root of roots.length ? roots : ['/']) {
  for (const path of files(root)) {
    let imports;
    try {
      imports = importedSymbols(readFileSync(path));
    } catch (error) {
      offenders.push(`${path}: ${error.message}`);
      continue;
    }
    if (imports === null) continue;
    checked++;
    const found = imports.filter(name => forbidden.has(name));
    if (found.length) offenders.push(`${path}: imports ${found.join(', ')}`);
  }
}
if (offenders.length) {
  console.error('Binaries use the zlib gz file API that CVE-2026-85091 affects; the OpenVEX not_affected statement for de-vloer-agent no longer holds:');
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}
console.log(`checked ${checked} ELF files; none imports the zlib gz file API`);
