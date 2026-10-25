import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { CodeRabbitConfig, CodeRabbitRepository } from './coderabbit-config.ts';

export type CodeRabbitFinding = { severity: string; fileName: string; title: string; comment: string; codegenInstructions: string; suggestions?: string; startLine?: number; endLine?: number };
export type CodeRabbitReview = { state: 'completed' | 'incomplete' | 'skipped'; findings: CodeRabbitFinding[]; reused: boolean };
export type CodeRabbitSecurityFinding = { id: string; severity: string; state: string; fileName: string; description: string; cwe: string; startLine?: number; endLine?: number; provenance?: { scanId: string; revision: string; evidenceStatus: string } };
export type CodeRabbitProvider = { review(config: NonNullable<CodeRabbitConfig['cli']>, repository: CodeRabbitRepository, headSha: string, key: string, signal: AbortSignal): Promise<CodeRabbitReview>; security(repository: CodeRabbitRepository, key: string, signal: AbortSignal): Promise<CodeRabbitSecurityFinding[]> };
const object = (value: any): boolean => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, limit = 65536): string => { if (typeof value !== 'string') return ''; if (value.length > limit) throw failure(); return value; };
const line = (value: unknown): number | undefined => Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : undefined;
const failure = (): Error => new Error('CodeRabbit returned an invalid, incomplete, oversized or out-of-scope response.');

export function parseCodeRabbitReview(stdout: string, exitCode: number | null, repository: CodeRabbitRepository, headSha: string): CodeRabbitReview {
  const findings: CodeRabbitFinding[] = [];
  let complete: any; let context = false; let failed = false;
  if (Buffer.byteLength(stdout) > 4194304) throw failure();
  for (const record of stdout.split('\n').filter(value => value.trim())) {
    const event = JSON.parse(record);
    if (!object(event) || typeof event.type !== 'string' || complete) throw failure();
    if (event.type === 'review_context') {
      if (context || ![repository.github, `https://github.com/${repository.github}`].includes(event.remote) || event.currentBranch !== headSha || event.baseBranch !== repository.base) throw failure();
      context = true;
    } else if (event.type === 'finding') {
      if (!context || findings.length >= 1000 || !['critical', 'major', 'minor', 'trivial', 'info', 'none'].includes(event.severity) || typeof event.fileName !== 'string') throw failure();
      findings.push({ severity: event.severity, fileName: text(event.fileName, 1024), title: text(event.title, 1024), comment: text(event.comment), codegenInstructions: text(event.codegenInstructions), suggestions: text(typeof event.suggestions === 'string' ? event.suggestions : JSON.stringify(event.suggestions ?? [])), startLine: line(event.startLine), endLine: line(event.endLine) });
    } else if (event.type === 'complete') complete = event;
    else if (event.type === 'error') failed = true;
  }
  const skipped = complete?.status === 'review_skipped';
  const valid = context && complete && ['review_completed', 'review_skipped'].includes(complete.status) && complete.findings === findings.length && (!skipped || !findings.length);
  const succeeded = valid && exitCode === 0 && !failed && (!complete.outcome || ['completed', 'completed_with_warnings'].includes(complete.outcome)) && (complete.unreviewedFileCount === undefined || complete.unreviewedFileCount === 0);
  return { state: succeeded ? skipped ? 'skipped' : 'completed' : 'incomplete', findings, reused: complete?.reused === true };
}

async function command(binary: string, args: string[], home: string, timeoutMs: number, signal: AbortSignal): Promise<{ stdout: string; exitCode: number | null }> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: home, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: `${dirname(binary)}:/usr/local/bin:/usr/bin:/bin`, HOME: home, XDG_CONFIG_HOME: home, XDG_DATA_HOME: home, XDG_CACHE_HOME: home, TMPDIR: home, CI: 'true', NO_COLOR: '1', LANG: 'C.UTF-8' } });
    let stdout = ''; let bytes = 0; let stopped = false;
    const stop = () => { stopped = true; try { if (child.pid) process.kill(-child.pid, 'SIGKILL'); } catch {} child.kill('SIGKILL'); };
    const timer = setTimeout(stop, timeoutMs); signal.addEventListener('abort', stop, { once: true });
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', stop); };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { bytes += Buffer.byteLength(chunk); if (bytes > 4194304) stop(); else stdout += chunk; });
    child.stderr.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 4194304) stop(); });
    child.once('error', () => { cleanup(); reject(new Error('CodeRabbit CLI could not start. Check the configured binary.')); });
    child.once('close', exitCode => { cleanup(); if (stopped) reject(new Error('CodeRabbit stopped after cancellation, timeout or its output limit. Its billing outcome is unknown.')); else resolve({ stdout, exitCode }); });
  });
}

export async function runCodeRabbitReview(config: NonNullable<CodeRabbitConfig['cli']>, repository: CodeRabbitRepository, headSha: string, key: string, signal: AbortSignal): Promise<CodeRabbitReview> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(config.binary)) hash.update(chunk);
  if (hash.digest('hex') !== config.sha256) throw new Error('CodeRabbit CLI digest does not match the configured binary.');
  const home = await mkdtemp(join(tmpdir(), 'unfold-coderabbit-'));
  try {
    const login = await command(config.binary, ['auth', 'login', '--region', repository.region, '--api-key', key], home, 30000, signal);
    if (login.exitCode !== 0) throw new Error('CodeRabbit authentication failed. Check the Agentic key, assigned seat and region.');
    const result = await command(config.binary, ['review', '--remote', repository.github, '--base', repository.base, '--source-branch', headSha, '--agent'], home, config.timeoutMs, signal);
    return parseCodeRabbitReview(result.stdout, result.exitCode, repository, headSha);
  } finally { await rm(home, { recursive: true, force: true }); }
}

async function boundedJson(response: Response): Promise<any> {
  if (!response.ok || !response.body) throw new Error(`CodeRabbit security request failed (HTTP ${response.status}).`);
  const chunks: Uint8Array[] = []; let size = 0;
  const reader = response.body.getReader();
  try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 2097152) throw failure(); chunks.push(next.value); } }
  finally { await reader.cancel(); reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function fetchCodeRabbitSecurity(repository: CodeRabbitRepository, key: string, signal: AbortSignal, request: typeof fetch = fetch): Promise<CodeRabbitSecurityFinding[]> {
  if (!repository.security) throw failure();
  const scope = repository.security; const findings: CodeRabbitSecurityFinding[] = []; const cursors = new Set<string>(); const ids = new Set<string>();
  let cursor = '';
  for (let page = 0; page < 20; page++) {
    const url = new URL('https://api.coderabbit.ai/v1/security/scans/code');
    url.search = new URLSearchParams({ repo_id: scope.repositoryId, state: 'all', limit: '1000', ...(cursor ? { cursor } : {}) }).toString();
    const result = await boundedJson(await request(url, { method: 'GET', headers: { 'x-coderabbitai-api-key': key, Accept: 'application/json' }, redirect: 'error', signal }));
    if (!object(result) || !Object.hasOwn(result, 'next_cursor') || !Array.isArray(result.data) || result.data.length > 1000) throw failure();
    for (const row of result.data) {
      if (!object(row) || row.repository_id !== scope.repositoryId || row.organization_id !== scope.organizationId || typeof row.id !== 'string' || !row.id || ids.has(row.id) || !['open', 'fixed', 'dismissed'].includes(row.state) || typeof row.severity !== 'string' || typeof row.description !== 'string' || typeof row.file_path !== 'string') throw failure();
      const provenance = row.scan_provenance;
      if (provenance && (!object(provenance) || provenance.scope?.primary?.repositoryId !== scope.repositoryId)) throw failure();
      ids.add(row.id);
      findings.push({ id: text(row.id, 256), severity: text(row.severity, 40), state: row.state, fileName: text(row.file_path, 1024), description: text(row.description), cwe: text(row.cwe, 256), startLine: line(row.start_line), endLine: line(row.end_line), ...(provenance ? { provenance: { scanId: text(provenance.scanId, 256), revision: text(provenance.scope.primary.revision, 256), evidenceStatus: text(provenance.evidenceStatus, 64) } } : {}) });
    }
    if (result.next_cursor === undefined || result.next_cursor === null || result.next_cursor === '') return findings;
    if (typeof result.next_cursor !== 'string' || result.next_cursor.length > 4096 || cursors.has(result.next_cursor)) throw failure();
    cursor = result.next_cursor; cursors.add(cursor);
  }
  throw failure();
}

export const codeRabbitProvider: CodeRabbitProvider = { review: runCodeRabbitReview, security: fetchCodeRabbitSecurity };
