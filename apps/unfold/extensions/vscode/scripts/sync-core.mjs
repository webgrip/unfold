import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

export const coreModules = ['states.js', 'format.js', 'reasons.js', 'checkout.js'];
const source = new URL('../../../public/core/', import.meta.url);
const target = new URL('../media/core/', import.meta.url);

await mkdir(target, { recursive: true });
for (const name of coreModules) {
  const text = await readFile(new URL(name, source), 'utf8');
  for (const [, specifier] of text.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)) {
    if (!coreModules.includes(specifier.replace(/^\.\//, ''))) throw new Error(`public/core/${name} imports ${specifier}, which the extension does not ship. Add it to coreModules or keep the module self-contained.`);
  }
  await copyFile(new URL(name, source), new URL(name, target));
}
await writeFile(new URL('package.json', target), '{ "type": "module" }\n');
