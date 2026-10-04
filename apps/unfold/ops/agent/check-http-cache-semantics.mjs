import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

const skipped = new Set(['/proc', '/sys', '/dev', '/run', '/tmp']);
const npmCli = realpathSync(execFileSync('sh', ['-c', 'command -v npm'], { encoding: 'utf8' }).trim());
const allowed = join(dirname(dirname(npmCli)), 'node_modules', 'http-cache-semantics');

function* copies(directory) {
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (skipped.has(path) || !entry.isDirectory() || lstatSync(path).isSymbolicLink()) continue;
    if (entry.name === 'http-cache-semantics' && existsSync(join(path, 'package.json'))) yield path;
    else yield* copies(path);
  }
}

const found = [...copies('/')];
const unexpected = found.filter(path => path !== allowed);
if (unexpected.length) throw new Error(`http-cache-semantics outside npm's bundled dependencies: ${unexpected.join(', ')}. The CVE-2026-93748 OpenVEX statement no longer holds; review it before shipping.`);
console.log(`http-cache-semantics appears only as npm's bundled copy (${found.length} found)`);
