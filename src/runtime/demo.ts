import { mkdir, cp, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { captureLocalCandidate, pinCandidateBase, type Candidate } from '../candidates.ts';
import { setTimeout } from 'node:timers/promises';
import type { AgentRuntime, AppConfig, Credential, Session, Repository, Workspace, ExecutionContext, ExecutionResult, Artifact } from '../types.ts';

type DemoOptions = { dataDir: string; delayMs?: number; fixtureDir?: string };
type CommandResult = { exitCode: number; output: string; durationMs: number };

export class DemoRuntime implements AgentRuntime {
  kind = 'demo' as const;
  private root: string;
  private fixture: string;
  private delayMs: number;

  constructor(options: DemoOptions | AppConfig | string) {
    const value: DemoOptions = typeof options === 'string' ? { dataDir: options } : options;
    this.root = resolve(value.dataDir, 'workspaces');
    this.fixture = value.fixtureDir ?? fileURLToPath(new URL('../../examples/order-service/', import.meta.url));
    this.delayMs = value.delayMs ?? 1000;
  }

  async prepare(session: Session, _repository: Repository, credential: Credential | undefined, signal: AbortSignal): Promise<Workspace> {
    if (credential) throw new Error('Demo runtime refuses model credentials');
    signal.throwIfAborted();
    if (!/^[a-zA-Z0-9-]+$/.test(session.id)) throw new Error('Invalid workspace identity');
    const directory = join(this.root, session.id);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    let exists = false;
    try { exists = (await stat(join(directory, '.git'))).isDirectory(); } catch {}
    if (!exists) {
      await cp(this.fixture, directory, { recursive: true });
      for (const args of [['init', '--initial-branch=main'], ['add', 'package.json', 'src/order.js', 'test/order.test.js'], ['-c', 'user.name=De Vloer Demo', '-c', 'user.email=demo@localhost', 'commit', '-m', 'test: establish intentionally failing rounding fixture'], ['checkout', '-b', session.branch]]) {
        const result = await this.command('git', args, directory, signal);
        if (result.exitCode !== 0) throw new Error('Could not initialize demo workspace');
      }
    }
    return { id: session.id, backend: 'demo', directory, metadata: { baseSha: session.workspace?.metadata?.baseSha ?? await pinCandidateBase(directory) } };
  }

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    context.signal.throwIfAborted();
    return context.role.mode === 'write' ? this.write(context) : this.review(context);
  }

  captureCandidate(session: Session, repository: Repository): Promise<Candidate> {
    return captureLocalCandidate({ dataDir: resolve(this.root, '..'), sessionId: session.id, repositoryId: repository.id, directory: session.workspace!.directory, baseSha: session.workspace?.metadata?.baseSha ?? '' });
  }

  async interrupt(_workspace: Workspace): Promise<void> {}
  async dispose(_workspace: Workspace): Promise<void> {}

  private async write(context: ExecutionContext): Promise<ExecutionResult> {
    const artifacts: Artifact[] = [];
    context.emit({ type: 'message', data: { role: 'assistant', text: 'DEMO: this deterministic runtime uses no model. It copies an intentionally broken order service, changes real code, and executes real checks.' } });
    await this.delay(context.signal);
    context.emit({ type: 'tool', data: { name: 'node --test test/order.test.js', status: 'running', purpose: 'baseline' } });
    const baseline = await this.command(process.execPath, ['--test', 'test/order.test.js'], context.workspace.directory, context.signal);
    artifacts.push(this.checkArtifact(baseline.exitCode ? 'Baseline checks (expected failure)' : 'Baseline checks (already passing on resumed workspace)', baseline));
    context.emit({ type: 'tool', data: { name: 'node --test test/order.test.js', status: baseline.exitCode ? 'failed' : 'completed', phase: 'baseline', expectedFailure: true, exitCode: baseline.exitCode, durationMs: baseline.durationMs, output: baseline.output } });
    await this.delay(context.signal);
    const path = join(context.workspace.directory, 'src/order.js');
    const before = await readFile(path, 'utf8');
    const after = before.replace('Math.round(amount * 100)', 'Math.round((amount + Number.EPSILON) * 100)');
    if (!after.includes('Math.round((amount + Number.EPSILON) * 100)')) throw new Error('Demo source no longer matches its bounded fixture');
    context.signal.throwIfAborted();
    await writeFile(path, after);
    context.emit({ type: 'tool', data: { name: 'edit src/order.js', status: 'completed', text: 'Adjusted the fixture rounding expression. This demonstrates a workflow; it is not a general financial arithmetic library.' } });
    await this.delay(context.signal);
    const verify = await this.command(process.execPath, ['--test', 'test/order.test.js'], context.workspace.directory, context.signal);
    artifacts.push(this.checkArtifact('Verification checks', verify));
    context.emit({ type: 'tool', data: { name: 'node --test test/order.test.js', status: verify.exitCode ? 'failed' : 'completed', phase: 'verification', exitCode: verify.exitCode, durationMs: verify.durationMs, output: verify.output } });
    if (verify.exitCode !== 0) throw new Error('Fixture checks still fail after the demo patch');
    const diff = await this.command('git', ['diff', '--no-ext-diff', '--', 'src/order.js', 'test/order.test.js'], context.workspace.directory, context.signal);
    if (diff.exitCode !== 0 || !diff.output.includes('Number.EPSILON')) throw new Error('Demo patch did not produce a reviewable diff');
    artifacts.push({ id: randomUUID(), name: 'Workspace changes', kind: 'diff', content: diff.output });
    await this.delay(context.signal);
    return { summary: 'Patched the bounded order-service rounding fixture; the real verification suite passes and a git diff is ready for review. No merge or model request occurred.', artifacts, costUsd: 0 };
  }

  private async review(context: ExecutionContext): Promise<ExecutionResult> {
    context.emit({ type: 'message', data: { role: 'assistant', text: 'DEMO REVIEW: independently inspecting the actual diff and rerunning the fixture checks. A writer summary alone cannot approve the work.' } });
    await this.delay(context.signal);
    const diff = await this.command('git', ['diff', '--no-ext-diff', '--', 'src/order.js', 'test/order.test.js'], context.workspace.directory, context.signal);
    const source = await readFile(join(context.workspace.directory, 'src/order.js'), 'utf8');
    const result = await this.command(process.execPath, ['--test', 'test/order.test.js'], context.workspace.directory, context.signal);
    context.emit({ type: 'tool', data: { name: 'independent node --test', status: result.exitCode ? 'failed' : 'completed', phase: 'review', exitCode: result.exitCode, durationMs: result.durationMs, output: result.output } });
    await this.delay(context.signal);
    const approve = result.exitCode === 0 && diff.exitCode === 0 && diff.output.includes('+  return Math.round((amount + Number.EPSILON) * 100);') && !diff.output.includes('diff --git a/test/') && source.includes("throw new TypeError('Amount must be a finite non-negative number')");
    return { summary: approve ? 'Explicit approval of this bounded demo fixture: actual patch inspected, regression and invalid-input checks passed, tests were not changed. Human review and merge remain separate.' : 'Review did not establish the expected patch and passing checks. Human attention required.', verdict: approve ? 'approve' : 'request_changes', artifacts: [this.checkArtifact('Independent review checks', result), { id: randomUUID(), name: 'Review findings', kind: 'summary', content: `Runtime: deterministic demo (no model)\nVerdict: ${approve ? 'approve' : 'request_changes'}\nActual checks exit code: ${result.exitCode}\nDiff inspected: ${diff.exitCode === 0}\nScope: the supplied rounding fixture only.\nNo merge was performed.` }], costUsd: 0 };
  }

  private checkArtifact(name: string, result: CommandResult): Artifact {
    return { id: randomUUID(), name, kind: 'test', content: `Command: node --test test/order.test.js\nExit code: ${result.exitCode}\nDuration: ${result.durationMs} ms\nRuntime: deterministic demo (no model calls)\n\n${result.output}` };
  }

  private delay(signal: AbortSignal): Promise<void> { return setTimeout(this.delayMs, undefined, { signal }); }

  private command(binary: string, args: string[], cwd: string, signal: AbortSignal): Promise<CommandResult> {
    signal.throwIfAborted();
    return new Promise((resolveCommand, reject) => {
      const started = performance.now();
      const child = spawn(binary, args, { cwd, env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: cwd, TMPDIR: process.env.TMPDIR ?? '/tmp', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', LC_ALL: 'C' }, signal, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      const append = (value: Buffer) => { output = (output + value.toString()).slice(-100000); };
      child.stdout.on('data', append); child.stderr.on('data', append);
      child.once('error', reject);
      child.once('close', code => { if (signal.aborted) reject(signal.reason); else resolveCommand({ exitCode: code ?? 1, output, durationMs: Math.round(performance.now() - started) }); });
    });
  }
}
