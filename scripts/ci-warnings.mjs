import { appendFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ansi = /\x1b\[[0-9;?]*[A-Za-z]/g;
const runnerTimestamp = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z\s/;

export const warningPatterns = [
  { tool: 'npm', pattern: /^npm warn\b/i },
  { tool: 'pnpm', pattern: /^\s*WARN\s/ },
  { tool: 'mise', pattern: /^mise WARN\b/ },
  { tool: 'uv', pattern: /^warning: / },
  { tool: 'node', pattern: /^\(node\) (\[[A-Z0-9_]+\] )?\w*Warning: / },
  { tool: 'python', pattern: /^\S+:\d+: \w+Warning: / },
  { tool: 'go', pattern: /^go: warning: / },
  { tool: 'actions', pattern: /^::warning\b/ },
  { tool: 'build', pattern: /^(\d\d:\d\d:\d\d )?\s*(▲ )?\[WARN(ING)?\]/ },
];

const normalize = line => line.replace(ansi, '').replace(runnerTimestamp, '').replace(/^\(node:\d+\)/, '(node)').trimEnd();

/**
 * Lists the distinct tool warnings in captured CI output that no allowlist entry accepts.
 * @param {string} text Captured stdout and stderr of setup and verification.
 * @param {{ pattern: string, reason: string }[]} allowed Reviewed warnings, each with the reason it is accepted.
 * @returns {{ tool: string, line: string, count: number }[]} One entry per distinct warning, in first-seen order.
 */
export function findWarnings(text, allowed = []) {
  const accepted = allowed.map(entry => new RegExp(entry.pattern));
  const found = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = normalize(raw);
    const match = warningPatterns.find(({ pattern }) => pattern.test(line));
    if (!match || accepted.some(pattern => pattern.test(line))) continue;
    const entry = found.get(line) ?? { tool: match.tool, line, count: 0 };
    entry.count += 1;
    found.set(line, entry);
  }
  return [...found.values()];
}

/**
 * Formats warnings as the plain-text report the warnings job prints.
 * @param {{ tool: string, line: string, count: number }[]} warnings
 * @returns {string} An empty string when there is nothing to report.
 */
export function report(warnings) {
  return warnings.map(({ tool, line, count }) => `${tool}: ${line}${count > 1 ? ` (${count}x)` : ''}`).join('\n');
}

function capturedText(paths) {
  return paths.flatMap(path => statSync(path).isDirectory() ? readdirSync(path).sort().map(name => join(path, name)) : [path])
    .map(file => readFileSync(file, 'utf8')).join('\n');
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  const paths = process.argv.slice(2).filter(path => { try { statSync(path); return true; } catch { return false; } });
  const allowed = JSON.parse(readFileSync(new URL('./ci-warnings-allow.json', import.meta.url), 'utf8'));
  const text = report(findWarnings(capturedText(paths), allowed));
  console.log(text ? `Warnings in setup and verification output:\n${text}` : 'No warnings in setup and verification output.');
  if (process.env.GITHUB_OUTPUT) {
    const delimiter = `GLIDE_WARNINGS_${Date.now()}`;
    appendFileSync(process.env.GITHUB_OUTPUT, `report<<${delimiter}\n${text}\n${delimiter}\n`);
  }
}
