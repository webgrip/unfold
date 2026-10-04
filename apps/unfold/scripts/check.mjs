import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { spawnSync } from 'node:child_process';
import { threeVersion, vendoredFiles } from './vendor-three.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const syncedCoreDirectory = resolve(root, 'extensions/vscode/media/core');
const failures = [];
const files = [];
const excluded = new Set(['.git', 'node_modules', '.unfold', 'dist', 'coverage', 'test-results', 'playwright-report']);

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name === '.env' || entry.name.startsWith('.env.')) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile()) files.push(path);
  }
}

function fail(path, message) {
  failures.push(`${relative(root, path)}: ${message}`);
}

function inspectConfig(value, path, pointer = '') {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    const location = `${pointer}/${key}`;
    if (/^(masterKey|bootstrapPassword|password|apiKey|accessToken|privateKey|token)$/i.test(key) && typeof item === 'string' && item.length && !/^\$\{[A-Z_][A-Z0-9_]*\}$/.test(item)) fail(path, `credential value at ${location}; supply it through the supported environment or secret mount`);
    if (/^(url|endpoint|baseUrl|adminUrl)$/i.test(key) && typeof item === 'string' && /^https?:/.test(item)) {
      try {
        const parsed = new URL(item);
        if (parsed.username || parsed.password) fail(path, `embedded URL credentials at ${location}`);
      } catch { fail(path, `invalid URL at ${location}`); }
    }
    inspectConfig(item, path, location);
  }
}

if (Number(process.versions.node.split('.')[0]) !== 24) failures.push('Node 24 is required');
walk(root);
const packagePath = resolve(root, 'package.json');
const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));
const decidedRuntimeDependencies = { ws: 'docs/adrs/0036-the-agent-host-speaks-websocket-through-ws.md' };
for (const [name, version] of Object.entries(manifest.dependencies || {})) {
  if (!Object.hasOwn(decidedRuntimeDependencies, name)) fail(packagePath, `production npm dependency ${name} requires an architecture decision`);
  else if (!existsSync(resolve(root, decidedRuntimeDependencies[name]))) fail(packagePath, `production npm dependency ${name} names ${decidedRuntimeDependencies[name]}, which is missing`);
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail(packagePath, `production npm dependency ${name} must pin an exact version, not ${version}`);
}
if (Object.keys(manifest.optionalDependencies || {}).length || Object.keys(manifest.peerDependencies || {}).length) fail(packagePath, 'optional and peer npm dependencies require an architecture decision');
let sources = 0;
let jsonFiles = 0;
for (const path of files) {
  const extension = extname(path);
  if (!['.ts', '.js', '.mjs', '.json', '.md', '.yml', '.yaml', '.toml', '.py', '.sh'].includes(extension)) continue;
  const source = readFileSync(path, 'utf8');
  if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/.test(source)) fail(path, 'private-key material detected');
  if (extension === '.json') {
    try {
      const value = JSON.parse(source);
      jsonFiles++;
      if (relative(root, path).startsWith('config/') || /(?:^|\/)config(?:\.[^/]+)?\.json$/.test(relative(root, path))) inspectConfig(value, path);
    } catch { fail(path, 'invalid JSON'); }
  }
  if (!['.ts', '.js', '.mjs'].includes(extension)) continue;
  sources++;
  let javascript;
  try {
    javascript = extension === '.ts' ? stripTypeScriptTypes(source, { mode: 'strip', sourceUrl: path }) : source;
  } catch { fail(path, 'TypeScript must use native erasable syntax'); continue; }
  const checked = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: javascript, encoding: 'utf8', timeout: 10000 });
  if (checked.status !== 0 || checked.error) fail(path, 'module syntax check failed');
  const importPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])([^'"\n]+)\1/g;
  for (const match of javascript.matchAll(importPattern)) {
    const specifier = match[2];
    if (specifier.startsWith('.')) {
      const target = resolve(dirname(path), specifier.split('?')[0]);
      const compiledExtensionImport = relative(root, path).startsWith('extensions/vscode/') && extension === '.ts' && target.endsWith('.js') && existsSync(target.slice(0, -3) + '.ts');
      const syncedCoreImport = dirname(target) === syncedCoreDirectory && existsSync(resolve(root, 'public/core', basename(target)));
      if (!extname(target) || (!existsSync(target) && !compiledExtensionImport && !syncedCoreImport)) fail(path, `missing relative import ${specifier}`);
      if (relative(root, target).startsWith('..') || isAbsolute(relative(root, target))) fail(path, 'source import escapes repository');
    } else if (relative(root, path).startsWith('src/') && !specifier.startsWith('node:') && !Object.hasOwn(decidedRuntimeDependencies, specifier)) {
      fail(path, 'application imports must use native Node modules, repository files or a decided runtime dependency');
    }
  }
}
const vendorDirectory = resolve(root, 'public/vendor/three');
let vendored = 0;
if (existsSync(vendorDirectory)) {
  const allowed = new Set([...Object.values(vendoredFiles), 'LICENSE', 'VERSION']);
  for (const name of readdirSync(vendorDirectory)) if (!allowed.has(name)) fail(resolve(vendorDirectory, name), 'is not a vendored three.js file; vendor only through scripts/vendor-three.mjs');
  for (const name of Object.values(vendoredFiles)) {
    const path = resolve(vendorDirectory, name);
    if (!existsSync(path)) fail(path, 'vendored three.js file is missing; run npm run vendor:three');
    else if (!readFileSync(path, 'utf8').startsWith(`// three.js ${threeVersion} `)) fail(path, `is not the unedited three.js ${threeVersion} copy; run npm run vendor:three`);
    else vendored++;
  }
  if (existsSync(resolve(root, 'node_modules/three/package.json'))) {
    const drift = spawnSync(process.execPath, [resolve(root, 'scripts/vendor-three.mjs'), '--check'], { encoding: 'utf8', timeout: 30000 });
    if (drift.status !== 0) failures.push(drift.stderr.trim() || 'public/vendor/three/ drifted from node_modules/three');
  }
}
if (failures.length) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Checked ${sources} source modules and ${jsonFiles} JSON files; ${vendored} vendored three.js ${threeVersion} files are unedited; no application entrypoint executed.\n`);
}
