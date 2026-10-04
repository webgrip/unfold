import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const extensionRoot = resolve(root, 'extensions/vscode');
const failures = [];
const notes = [];

const fail = message => failures.push(message);

const manifestPath = resolve(extensionRoot, 'package.json');
if (!existsSync(manifestPath)) {
  process.stderr.write('extensions/vscode/package.json is missing\n');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const httpsUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};

for (const field of ['name', 'displayName', 'description', 'publisher', 'license', 'icon']) {
  if (typeof manifest[field] !== 'string' || !manifest[field].length) fail(`package.json: ${field} is required for a Marketplace listing`);
}

if (!manifest.engines?.vscode) fail('package.json: engines.vscode is required');

const repositoryUrl = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
if (!repositoryUrl || !httpsUrl(repositoryUrl)) fail('package.json: repository.url must be an https URL; vsce otherwise needs --allow-missing-repository');
for (const [field, value] of [['homepage', manifest.homepage], ['bugs.url', manifest.bugs?.url], ['qna', manifest.qna]]) {
  if (value !== undefined && value !== false && !httpsUrl(value)) fail(`package.json: ${field} must be an https URL`);
}

if (manifest.pricing && manifest.pricing !== 'Free') notes.push(`pricing is ${manifest.pricing}; a paid listing needs a Marketplace agreement`);
if (Array.isArray(manifest.keywords) && manifest.keywords.length > 30) fail('package.json: the Marketplace accepts at most 30 keywords');
if (!Array.isArray(manifest.categories) || !manifest.categories.length) fail('package.json: at least one category is required');

if (manifest.galleryBanner?.color && !/^#[0-9a-fA-F]{6}$/.test(manifest.galleryBanner.color)) fail('package.json: galleryBanner.color must be a six-digit hex colour');

for (const badge of manifest.badges ?? []) {
  if (!httpsUrl(badge.url) || !httpsUrl(badge.href)) fail('package.json: every badge url and href must be https');
  if (badge.url?.endsWith('.svg')) fail('package.json: the Marketplace rejects SVG badges from untrusted providers');
}

if (manifest.icon) {
  const iconPath = resolve(extensionRoot, manifest.icon);
  if (!existsSync(iconPath)) fail(`package.json: icon ${manifest.icon} does not exist; run npm run brand:build -- --png`);
  else {
    const bytes = readFileSync(iconPath);
    const png = bytes.length > 24 && bytes.toString('binary', 1, 4) === 'PNG';
    if (!png) fail('the Marketplace requires a PNG icon; SVG is rejected');
    else {
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      if (width < 128 || height < 128) fail(`icon is ${width}x${height}; the Marketplace requires at least 128x128`);
      if (width !== height) fail(`icon is ${width}x${height}; a Marketplace icon must be square`);
    }
  }
}

const readmePath = resolve(extensionRoot, 'README.md');
if (!existsSync(readmePath)) fail('extensions/vscode/README.md is the Marketplace listing page and is required');
else {
  const readme = readFileSync(readmePath, 'utf8');
  if (readme.length < 500) fail('README.md is too thin to serve as the Marketplace listing page');
  for (const [, label, target] of readme.matchAll(/\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    if (/^(https:|mailto:|#)/.test(target)) continue;
    if (target.startsWith('http:')) fail(`README.md: link to ${target} must use https on the Marketplace listing`);
    else fail(`README.md: relative link [${label}](${target}) breaks on the Marketplace; use an absolute https URL`);
  }
  for (const [, alt, target] of readme.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    if (!target.startsWith('https:')) fail(`README.md: image "${alt}" must use an absolute https URL to render on the Marketplace`);
  }
}

if (!existsSync(resolve(extensionRoot, 'CHANGELOG.md'))) fail('extensions/vscode/CHANGELOG.md is shown on the Marketplace listing and is required');
if (!existsSync(resolve(extensionRoot, 'LICENSE'))) fail('extensions/vscode/LICENSE is required; vsce otherwise needs --skip-license');

const version = manifest.version ?? '';
const marketplaceVersion = /^\d+\.\d+\.\d+$/.test(version);
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) fail(`package.json: version ${version} is not semver`);

const forbidden = [
  [/(^|\/)node_modules\//, 'node_modules'],
  [/\.map$/, 'a source map'],
  [/(^|\/)\.env/, 'an environment file'],
  [/\.vsix$/, 'a nested VSIX'],
  [/(^|\/)(test|src)\//, 'uncompiled sources or tests'],
  [/(^|\/)\.screenshots\//, 'screenshots']
];

const vsixes = readdirSync(extensionRoot).filter(name => name.endsWith('.vsix'));
const target = process.env.VSIX_PATH
  ? resolve(process.cwd(), process.env.VSIX_PATH)
  : vsixes.map(name => resolve(extensionRoot, name)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];

if (!target || !existsSync(target)) notes.push('no VSIX found; run npm run extension:package to check the packaged contents');
else {
  let listing = '';
  try {
    listing = execFileSync('unzip', ['-Z1', target], { encoding: 'utf8' });
  } catch {
    notes.push(`could not read ${relative(root, target)}; skipping the content check`);
  }
  const entries = listing.split('\n').map(line => line.trim()).filter(Boolean).map(name => name.replace(/^extension\//, ''));
  for (const name of entries) {
    for (const [pattern, label] of forbidden) {
      if (pattern.test(name)) fail(`${relative(root, target)} ships ${label}: ${name}`);
    }
  }
  if (entries.length && manifest.icon && !entries.includes(manifest.icon)) fail(`${relative(root, target)} does not contain the icon ${manifest.icon}`);
}

process.stdout.write(`Extension ${manifest.publisher}.${manifest.name} ${version}\n`);
process.stdout.write(`  Open VSX            publishable${marketplaceVersion ? '' : ' as a pre-release'}\n`);
process.stdout.write(`  Visual Studio Marketplace  ${marketplaceVersion ? 'publishable' : `skipped — it accepts only major.minor.patch, never ${version}`}\n`);
for (const note of notes) process.stdout.write(`  note: ${note}\n`);

if (failures.length) {
  process.stderr.write(failures.map(line => `  ${line}`).join('\n') + '\n');
  process.stderr.write('FAIL — see docs/operations/release.md\n');
  process.exitCode = 1;
} else {
  process.stdout.write('ok\n');
}
