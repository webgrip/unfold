import { appendFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

export const ledgerLimits = { entries: 500, command: 300, tail: 300, tailLines: 3 };

const kinds = [
  ['test', /(^|[\s;&|(/])(npm (run )?test|npx (vitest|jest|playwright)|node --test|go test|pytest|cargo test|mise run (verify|test|check)|bats|chainsaw test|kyverno test|helm unittest)\b|scripts\/test[-_][\w.-]+|\btest-[\w.-]+\.sh\b/],
  ['lint', /(^|[\s;&|(/])(eslint|yamllint|shellcheck|tsc --noEmit|ruff|golangci-lint|actionlint|zizmor|markdownlint|lychee|mise run (lint|docs-check|brand-check)|validate[-_][\w.-]+|check[-_][\w.-]+\.(py|sh|mjs))\b/],
  ['render', /(^|[\s;&|(/])(helm template|kustomize build|flux-local|run-flux-local-test|kubeconform|tofu (plan|validate)|terraform (plan|validate))\b/],
  ['ci', /(^|[\s;&|(/])(gh (pr checks|run (view|watch|list))|tea (pr|actions))\b|\/(statuses|status|actions\/(runs|tasks))\b/],
  ['live', /(^|[\s;&|(/])((kubectl|flux)(\s+(-n|--namespace|--context|-A|--all-namespaces)(\s+[\w.-]+)?)*\s+(get|describe|logs|top|events|rollout status|auth can-i)|(bao|vault)(\s+-\S+)*\s+status|curl\b[^|]*https?:\/\/)/],
  ['build', /(^|[\s;&|(/])(npm run build|go build|cargo build|docker (build|buildx)|mise run build|make\b)/],
  ['delivery', /(^|[\s;&|(/])git (push|merge|tag)\b/],
];

const secretPatterns = [
  [/\b(authorization|x-api-key|private-token|cookie)\s*:\s*[^'"\s]+(\s+[^'"\s]+)?/gi, '$1: [redacted]'],
  [/\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [redacted]'],
  [/\b(token|secret|password|passwd|api[_-]?key|access[_-]?key|client[_-]?secret)(=|:\s*|\s+)("[^"]*"|'[^']*'|[^\s'"&]+)/gi, '$1$2[redacted]'],
  [/(--(?:token|password|secret|api-key|client-secret)[= ])\S+/gi, '$1[redacted]'],
  [/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[redacted]@'],
  [/\b(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{16,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g, '[redacted]'],
  [/\b[A-Fa-f0-9]{48,}\b/g, '[redacted]'],
  [/\b[A-Za-z0-9+/]{60,}={0,2}/g, '[redacted]'],
];

export function redact(text) {
  return secretPatterns.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), String(text ?? ''));
}

export function evidenceKind(command) {
  const text = String(command ?? '');
  return kinds.find(([, pattern]) => pattern.test(text))?.[0] ?? '';
}

function clip(text, length) {
  const value = String(text ?? '');
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function tail(text) {
  const lines = String(text ?? '').split('\n').map(line => line.replace(/\x1b\[[0-9;]*m/g, '').trimEnd()).filter(line => line.trim());
  return clip(redact(lines.slice(-ledgerLimits.tailLines).join('\n')), ledgerLimits.tail);
}

export function exitCodeOf(error) {
  const match = /^Exit code (\d+)/.exec(String(error ?? ''));
  return match ? Number(match[1]) : undefined;
}

export function evidenceEntry(input, now = new Date()) {
  if (input.tool_name !== 'Bash') return null;
  const command = String(input.tool_input?.command ?? '');
  const kind = evidenceKind(command);
  if (!kind) return null;
  const failed = input.hook_event_name === 'PostToolUseFailure';
  const interrupted = failed ? input.is_interrupt === true : input.tool_response?.interrupted === true;
  const exitCode = failed ? exitCodeOf(input.error) : interrupted ? undefined : 0;
  const output = failed ? String(input.error ?? '').replace(/^Exit code \d+\n?/, '') : [input.tool_response?.stdout, input.tool_response?.stderr].filter(Boolean).join('\n');
  return {
    at: now.toISOString(),
    kind,
    command: clip(redact(command.replace(/\s+/g, ' ').trim()), ledgerLimits.command),
    cwd: basename(String(input.cwd ?? '')),
    outcome: interrupted ? 'interrupted' : failed ? 'failed' : 'passed',
    ...(exitCode === undefined ? {} : { exitCode }),
    tail: tail(output),
    ...(typeof input.agent_type === 'string' && input.agent_type ? { agent: input.agent_type.slice(0, 80) } : {}),
  };
}

export function ledgerDir() {
  const base = process.env.CLAUDE_PLUGIN_DATA || join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'unfold-claude-code');
  const dir = join(base, 'evidence');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function readLedger(file) {
  try { return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }); } catch { return []; }
}

export function recordEvidence(input, dir = ledgerDir()) {
  if (process.env.UNFOLD_EVIDENCE === '0') return null;
  const entry = evidenceEntry(input);
  if (!entry) return null;
  const file = join(dir, `${input.session_id}.jsonl`);
  const existing = readLedger(file);
  const previous = Number(String(existing.at(-1)?.id ?? 'e0').slice(1)) || 0;
  const numbered = { id: `e${previous + 1}`, ...entry };
  if (existing.length >= ledgerLimits.entries) {
    const kept = [...existing.slice(-(ledgerLimits.entries - 1)), numbered];
    writeFileSync(`${file}.tmp`, `${kept.map(item => JSON.stringify(item)).join('\n')}\n`, { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  } else {
    appendFileSync(file, `${JSON.stringify(numbered)}\n`, { mode: 0o600 });
  }
  return numbered;
}

export function latestLedger(dir = ledgerDir()) {
  const files = readdirSync(dir).filter(name => name.endsWith('.jsonl')).map(name => ({ name, mtime: statSync(join(dir, name)).mtimeMs }));
  return files.sort((a, b) => b.mtime - a.mtime)[0]?.name.replace(/\.jsonl$/, '') ?? '';
}
