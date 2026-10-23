import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentTraceReport } from '../extensions/claude-code/scripts/agent-trace-report.mjs';
import { noteRecords, parseAgentTrace as parsePortable } from '../extensions/claude-code/scripts/agent-trace-schema.mjs';
import { parseAgentTrace } from '../src/agent-trace.ts';

const script = fileURLToPath(new URL('../extensions/claude-code/scripts/agent-trace-report.mjs', import.meta.url));
const git = (dir: string, args: string[], input?: string) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', ...(input === undefined ? { stdio: ['ignore', 'pipe', 'pipe'] } : { input }) }).trim();
const record = (revision: string, tool: { name: string; version: string }, path: string, conversation: Record<string, unknown>) => ({ version: '0.1.0', id: crypto.randomUUID(), timestamp: '2026-10-24T10:00:00Z', vcs: { type: 'git', revision }, tool, files: [{ path, conversations: [conversation] }] });

test('the portable validator agrees with Unfold’s on valid records from any tool and on every refusal', () => {
  const sha = 'a'.repeat(40);
  const valid = [
    record(sha, { name: 'claude-code', version: '2.1.302' }, 'src/a.ts', { url: 'https://unfold.example.org/#linked-session/abcd1234', contributor: { type: 'ai', model_id: 'anthropic/claude-opus-5-5' }, ranges: [{ start_line: 1, end_line: 2, content_hash: 'sha256:00' }], related: [{ type: 'session', url: 'https://claude.ai/code/session_0123456789' }] }),
    record(sha, { name: 'cursor', version: '2.4.0' }, 'src/a.ts', { url: 'https://cursor.com/agents/abc', contributor: { type: 'ai', model_id: 'openai/gpt-6' }, ranges: [{ start_line: 3, end_line: 3 }] }),
    { ...record(sha, { name: 'git-ai', version: '1.0.0' }, 'lib/x.go', { ranges: [{ start_line: 1, end_line: 4, contributor: { type: 'mixed' } }] }), metadata: { 'com.git-ai': { prompt_count: 3 } } },
    { version: '0.1', id: crypto.randomUUID(), timestamp: '2026-10-24T10:00:00.123+02:00', files: [] },
  ];
  for (const value of valid) assert.deepEqual(parsePortable(value), parseAgentTrace(value));
  const invalid = [
    { ...valid[0], extra: true }, { ...valid[0], version: 'one' }, { ...valid[0], id: 'x' }, { ...valid[0], timestamp: '2026-10-24' },
    { ...valid[0], vcs: { type: 'cvs', revision: sha } }, { ...valid[0], tool: { name: 'cursor' } },
    record(sha, { name: 't', version: '1' }, '../etc/passwd', { ranges: [] }), record(sha, { name: 't', version: '1' }, 'a', { ranges: [{ start_line: 3, end_line: 2 }] }),
    record(sha, { name: 't', version: '1' }, 'a', { ranges: [{ start_line: 0, end_line: 2 }] }), record(sha, { name: 't', version: '1' }, 'a', { url: 'https://u:p@x.example', ranges: [] }),
    record(sha, { name: 't', version: '1' }, 'a', { ranges: [], contributor: { type: 'robot' } }), { ...valid[0], metadata: [] },
  ];
  for (const value of invalid) {
    const ours = (() => { try { parseAgentTrace(value); return 'accepted'; } catch (error) { return (error as { path: string }).path; } })();
    const theirs = (() => { try { parsePortable(value); return 'accepted'; } catch (error) { return (error as { path: string }).path; } })();
    assert.notEqual(ours, 'accepted');
    assert.equal(theirs, ours);
  }
});

test('a note may hold one record, a list, or JSON Lines from a cat_sort_uniq merge, and bad parts are named', () => {
  const one = record('b'.repeat(40), { name: 'amp', version: '1' }, 'a', { ranges: [] });
  const two = record('b'.repeat(40), { name: 'opencode', version: '1' }, 'a', { ranges: [] });
  assert.equal(noteRecords(JSON.stringify(one)).records.length, 1);
  assert.equal(noteRecords(JSON.stringify([one, two])).records.length, 2);
  const merged = noteRecords(`${JSON.stringify(one)}\n${JSON.stringify(two)}\n${JSON.stringify(one)}\nnot json\n${JSON.stringify({ version: '0.1' })}\n`);
  assert.deepEqual(merged.records.map(entry => entry.tool?.name), ['amp', 'opencode'], 'a record repeated by id counts once');
  assert.deepEqual(merged.errors, ['a line is not JSON', 'record.id: is required.']);
  assert.deepEqual(noteRecords(''), { records: [], errors: [] });
});

test('the report counts AI-written against added lines per commit and file, for records from two tools, read-only', async t => {
  const repo = await mkdtemp(join(tmpdir(), 'unfold-report-'));
  t.after(() => rm(repo, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  git(repo, ['config', 'user.email', 't@example.org']); git(repo, ['config', 'user.name', 'T']);
  git(repo, ['commit', '-q', '--allow-empty', '-m', 'root']);
  const base = git(repo, ['rev-parse', 'HEAD']);
  await mkdir(join(repo, 'src'));
  await writeFile(join(repo, 'src/a.ts'), 'one\ntwo\nthree\nfour\n');
  git(repo, ['add', '.']); git(repo, ['commit', '-q', '-m', 'feat: a | pipes']);
  const first = git(repo, ['rev-parse', 'HEAD']);
  const claude = record(first, { name: 'claude-code', version: '2.1.302' }, 'src/a.ts', { url: 'https://unfold.example.org/#linked-session/abcd1234', contributor: { type: 'ai', model_id: 'anthropic/claude-opus-5-5' }, ranges: [{ start_line: 1, end_line: 2 }] });
  const cursor = record(first, { name: 'cursor', version: '2.4.0' }, 'src/a.ts', { url: 'https://cursor.com/agents/abc', contributor: { type: 'ai', model_id: 'openai/gpt-6' }, ranges: [{ start_line: 2, end_line: 3 }, { start_line: 40, end_line: 90 }] });
  git(repo, ['notes', '--ref=agent-trace', 'add', '-F', '-', first], `${JSON.stringify(claude)}\n${JSON.stringify(cursor)}\n`);
  await writeFile(join(repo, 'README.md'), 'by hand\n');
  git(repo, ['add', '.']); git(repo, ['commit', '-q', '-m', 'docs: readme']);
  await writeFile(join(repo, 'src/b.go'), 'package b\nfunc B() {}\n');
  git(repo, ['add', '.']); git(repo, ['commit', '-q', '-m', 'feat: b']);
  const third = git(repo, ['rev-parse', 'HEAD']);
  git(repo, ['notes', '--ref=agent-trace', 'add', '-F', '-', third], JSON.stringify(record(third, { name: 'git-ai', version: '1.0.0' }, 'src/b.go', { ranges: [{ start_line: 1, end_line: 1, contributor: { type: 'human' } }, { start_line: 2, end_line: 2, contributor: { type: 'ai', model_id: 'amp/smart' } }] })));
  await writeFile(join(repo, 'src/c.ts'), 'c\n');
  git(repo, ['add', '.']); git(repo, ['commit', '-q', '-m', 'feat: c']);
  git(repo, ['notes', '--ref=agent-trace', 'add', '-m', '{"version":"0.1","oops":1}', 'HEAD']);
  const refsBefore = git(repo, ['for-each-ref']);

  const report = agentTraceReport({ cwd: repo, base, head: 'HEAD' });
  assert.equal(git(repo, ['for-each-ref']), refsBefore, 'the report changes no ref');
  assert.match(report, /2 of 4 commits carry an \[Agent Trace\]/);
  assert.match(report, /Agents wrote 4 of 8 added lines \(50%\)/, 'lines two tools claim count once, and ranges past the added lines count not at all');
  assert.match(report, new RegExp(`\\| \`${first.slice(0, 10)}\` feat: a \\\\\\| pipes \\| \`src/a.ts\` \\| 3 / 4 \\| claude-code 2\\.1\\.302, cursor 2\\.4\\.0 \\| anthropic/claude-opus-5-5, openai/gpt-6 \\| \\[1\\]\\(https://unfold\\.example\\.org/#linked-session/abcd1234\\) \\[2\\]\\(https://cursor\\.com/agents/abc\\) \\|`));
  assert.match(report, /`src\/b\.go` \| 1 \/ 2 \| git-ai 1\.0\.0 \| amp\/smart \| — \|/, 'a range’s own contributor wins, and a human range is not counted');
  assert.match(report, /docs: readme \| — \| no record/);
  assert.match(report, /Skipped 1 note part that is not valid Agent Trace 0\.1:\n\n- [0-9a-f]{10}: record\.oops: is not part of Agent Trace 0\.1/);

  const cli = execFileSync(process.execPath, [script, '--base', base, '--head', 'HEAD', '--repo', repo], { encoding: 'utf8' });
  assert.equal(cli, report);
  assert.match(execFileSync(process.execPath, [script, '--base', 'no-such-rev', '--repo', repo], { encoding: 'utf8' }), /^## Agent Trace\n\nNo report: /, 'a bad range still prints a summary and exits 0');
  assert.match(agentTraceReport({ cwd: repo, base: 'HEAD', head: 'HEAD' }), /No commits between/);
  assert.throws(() => execFileSync(process.execPath, [script], { stdio: 'pipe' }), (error: { status: number }) => error.status === 2);
});
