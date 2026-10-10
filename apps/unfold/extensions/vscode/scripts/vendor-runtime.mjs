import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const vendored = { 'jsonc-parser': { files: ['lib/umd', 'LICENSE.md', 'package.json'], main: 'lib/umd/main.js' } };

for (const [name, { files }] of Object.entries(vendored)) {
  const target = join(dist, 'vendor', name);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const file of files) await cp(join(root, 'node_modules', name, file), join(target, file), { recursive: true });
}

const compiled = async folder => (await readdir(folder, { withFileTypes: true, recursive: true })).filter(entry => entry.isFile() && entry.name.endsWith('.js') && !join(entry.parentPath, entry.name).startsWith(join(dist, 'vendor'))).map(entry => join(entry.parentPath, entry.name));

for (const file of await compiled(dist)) {
  const text = await readFile(file, 'utf8');
  let next = text;
  for (const [name, { main }] of Object.entries(vendored)) {
    const local = relative(dirname(file), join(dist, 'vendor', name, main)).split('\\').join('/');
    next = next.replaceAll(`require("${name}")`, `require("${local.startsWith('.') ? local : `./${local}`}")`);
  }
  if (next !== text) await writeFile(file, next);
}
