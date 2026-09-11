import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const expected = 'Apache-2.0';
const holder = 'Copyright 2026 Ryan Grippeling / WebGrip';
const failures = [];
const read = path => (existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), 'utf8') : null);

const licence = read('LICENSE');
if (!licence) failures.push('LICENSE is missing');
else {
  if (!licence.includes('Apache License')) failures.push(`LICENSE is not ${expected}`);
  if (/\[yyyy\]|\[name of copyright owner\]/.test(licence)) failures.push('LICENSE still carries the Apache appendix placeholders; name the year and the owner');
  if (!licence.includes(holder)) failures.push(`LICENSE does not carry the estate copyright line: ${holder}`);
}

const bundled = read('extensions/vscode/LICENSE');
if (!bundled) failures.push('extensions/vscode/LICENSE is missing; the packaged VSIX would ship without one');
else if (licence && bundled !== licence) failures.push('extensions/vscode/LICENSE has drifted from the root LICENSE');

const notice = read('NOTICE');
if (!notice) failures.push('NOTICE is missing; Apache-2.0 section 4(d) is how attribution travels with a fork');
else if (!notice.includes(holder)) failures.push(`NOTICE does not carry the estate copyright line: ${holder}`);

for (const manifest of ['package.json', 'extensions/vscode/package.json']) {
  const parsed = JSON.parse(read(manifest) ?? '{}');
  if (parsed.license !== expected) failures.push(`${manifest} declares "${parsed.license}", expected "${expected}"`);
}

for (const image of ['Dockerfile', 'ops/agent/Dockerfile']) {
  const source = read(image);
  if (!source) continue;
  const label = source.match(/org\.opencontainers\.image\.licenses="([^"]+)"/)?.[1];
  if (label !== expected) failures.push(`${image} labels the image "${label}", expected "${expected}"`);
}

const fonts = ['public/fonts/archivo-latin-wght-wdth110.woff2', 'public/fonts/archivo-latin-ext-wght-wdth110.woff2'];
const shippedFonts = fonts.filter(font => existsSync(resolve(root, font)));
if (shippedFonts.length) {
  const ofl = read('public/fonts/OFL.txt');
  if (!ofl) failures.push('public/fonts/ holds Archivo but not OFL.txt; the SIL Open Font Licence requires its text to travel with the font');
  else if (!ofl.includes('SIL OPEN FONT LICENSE')) failures.push('public/fonts/OFL.txt is not the SIL Open Font Licence text');
  const served = read('src/http.ts') ?? '';
  for (const font of [...shippedFonts, 'public/fonts/OFL.txt']) {
    const route = font.replace('public/', '');
    if (!served.includes(route)) failures.push(`src/http.ts does not serve /${route}, so it would 404 in the running workbench`);
  }
  if (!read('public/styles.css')?.includes('@font-face')) failures.push('public/styles.css names Archivo but declares no @font-face, so the interface would silently fall back');
}

for (const [doc, target] of [['README.md', '](LICENSE)'], ['README.md', 'docs/brand/TRADEMARK.md']]) {
  if (!read(doc)?.includes(target)) failures.push(`${doc} no longer links ${target}`);
}

if (failures.length) {
  process.stderr.write('License consistency\n' + failures.map(line => `  ${line}`).join('\n') + '\nFAIL — see docs/adrs/0022-apache-2-0-is-the-estate-licence.md\n');
  process.exitCode = 1;
} else {
  process.stdout.write(`License consistency: ${expected}, copyright line present, 2 manifests, 2 image labels and the bundled extension copy agree; Archivo ships with its OFL text and a served route.\n`);
}
