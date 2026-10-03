import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const expected = 'Apache-2.0';
const expectedLicence = expected;
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

const vendoredThree = read('public/vendor/three/VERSION')?.trim();
if (vendoredThree) {
  const mit = read('public/vendor/three/LICENSE');
  if (!mit?.includes('The MIT License') || !mit.includes('three.js authors')) failures.push('public/vendor/three/ holds three.js but not its MIT licence text; the MIT License requires the notice to travel with the copy');
  if (!read('NOTICE')?.includes(`three.js ${vendoredThree}`)) failures.push(`NOTICE does not name the bundled three.js ${vendoredThree}`);
  if (!/path = "public\/vendor\/three\/\*\*"[\s\S]*?SPDX-License-Identifier = "MIT"/.test(read('REUSE.toml') ?? '')) failures.push('REUSE.toml does not declare public/vendor/three/** as MIT');
  const pinned = JSON.parse(read('package.json') ?? '{}').devDependencies?.three;
  if (pinned !== vendoredThree) failures.push(`public/vendor/three/ is three ${vendoredThree} but package.json pins ${pinned ?? 'nothing'}; run npm run vendor:three`);
  if (!(read('src/http.ts') ?? '').includes('vendor\\/three\\/')) failures.push('src/http.ts does not serve /vendor/three/, so the forge skin would 404 in the running workbench');
}

for (const [doc, target] of [['README.md', '](LICENSE)'], ['README.md', 'docs/brand/TRADEMARK.md']]) {
  if (!read(doc)?.includes(target)) failures.push(`${doc} no longer links ${target}`);
}

const permittedRuntimeLicences = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0']);
const runtimeDependencies = Object.entries(JSON.parse(read('package.json') ?? '{}').dependencies ?? {});
for (const [name, version] of runtimeDependencies) {
  if (!notice?.includes(`${name} ${version}`)) failures.push(`NOTICE does not name the runtime dependency ${name} ${version} that the image ships`);
  const installed = read(`node_modules/${name}/package.json`);
  if (!installed) continue;
  const metadata = JSON.parse(installed);
  if (metadata.version !== version) failures.push(`node_modules/${name} is ${metadata.version} but package.json pins ${version}; run npm ci`);
  if (!permittedRuntimeLicences.has(metadata.license)) failures.push(`runtime dependency ${name} is licensed "${metadata.license}", which is not one of ${[...permittedRuntimeLicences].join(', ')}`);
  if (!read(`node_modules/${name}/LICENSE`)) failures.push(`runtime dependency ${name} ships no LICENSE file, so its licence text would not travel in the image`);
}
if (runtimeDependencies.length && !(read('Dockerfile') ?? '').includes('npm ci --omit=dev')) failures.push('Dockerfile does not install the runtime dependencies with npm ci --omit=dev, so the image would ship without them');

const reuseToml = read('REUSE.toml');
if (!reuseToml) failures.push('REUSE.toml is missing; per-file licensing would stop being declared');
else {
  const declared = [...reuseToml.matchAll(/SPDX-License-Identifier\s*=\s*"([^"]+)"/g)].map(match => match[1]);
  if (!declared.length) failures.push('REUSE.toml declares no SPDX-License-Identifier');
  if (!declared.includes(expectedLicence)) failures.push(`REUSE.toml does not declare ${expectedLicence} for the repository`);
  for (const identifier of new Set(declared)) {
    if (!existsSync(resolve(root, `LICENSES/${identifier}.txt`))) failures.push(`REUSE.toml declares ${identifier} but LICENSES/${identifier}.txt is missing`);
  }
}

if (failures.length) {
  process.stderr.write('License consistency\n' + failures.map(line => `  ${line}`).join('\n') + '\nFAIL — see docs/adrs/0022-apache-2-0-is-the-estate-licence.md\n');
  process.exitCode = 1;
} else {
  process.stdout.write(`License consistency: ${expected}, copyright line present, 2 manifests, 2 image labels and the bundled extension copy agree; Archivo ships with its OFL text and a served route; runtime dependencies (${runtimeDependencies.map(([name, version]) => `${name} ${version}`).join(', ') || 'none'}) carry a permitted licence and a NOTICE line${vendoredThree ? `; three.js ${vendoredThree} ships with its MIT text, a NOTICE line, a REUSE annotation and a served route` : ""}.\n`);
}
