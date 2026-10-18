import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const skipped = new Set(['/proc', '/sys', '/dev', '/run', '/tmp']);
const soname = Buffer.from('libexpat.so.1');

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
const users = [];
for (const root of roots.length ? roots : ['/']) {
  for (const path of files(root)) {
    if (basename(path).startsWith('libexpat.so')) continue;
    const buffer = readFileSync(path);
    if (buffer.length < 64 || buffer.readUInt32BE(0) !== 0x7f454c46) continue;
    checked++;
    if (buffer.includes(soname)) users.push(path);
  }
}
if (users.length) {
  console.error('ELF files name libexpat.so.1, which CVE-2026-77214 affects; the OpenVEX not_affected statement for unfold-agent no longer holds:');
  for (const user of users) console.error(`  ${user}`);
  process.exit(1);
}
console.log(`checked ${checked} ELF files; none loads libexpat`);
