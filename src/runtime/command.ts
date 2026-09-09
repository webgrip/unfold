import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import type { AgentRuntime, AppConfig, Artifact, Credential, ExecutionContext, ExecutionResult, PermissionRequest, Repository, Session, Workspace } from '../types.ts';
import { WorkspaceManager } from './workspace.ts';
import { RuntimeFailure } from '../failures.ts';
import { reportedVerdict, type RuntimeWorkspaces } from './opencode.ts';

type ActiveProcess = { child: ChildProcessWithoutNullStreams; stop: () => void; closed: Promise<void> };

const supervisorProgram = `const {spawn}=require('node:child_process');
const child=spawn(process.argv[1],process.argv.slice(2),{env:process.env,stdio:['pipe','inherit','inherit'],detached:process.platform!=='win32'});
let stopped=false,timer;
const kill=signal=>{try{if(process.platform!=='win32'&&child.pid)process.kill(-child.pid,signal);else child.kill(signal)}catch{}};
const stop=()=>{if(stopped)return;stopped=true;kill('SIGTERM');timer=setTimeout(()=>kill('SIGKILL'),1000)};
process.stdin.pipe(child.stdin);process.stdin.on('end',stop);process.on('SIGTERM',stop);process.on('SIGINT',stop);
child.stdin.on('error',()=>{});child.on('error',error=>{if(process.send)process.send({type:'launch.error',missing:error.code==='ENOENT'||error.code==='EACCES'},()=>process.exit(1));else process.exit(1)});
child.on('close',code=>{clearTimeout(timer);process.exit(code??1)});`;

export class CommandRuntime implements AgentRuntime {
  readonly kind = 'command' as const;
  private readonly config: AppConfig;
  private readonly workspaces: RuntimeWorkspaces;
  private readonly active = new Map<string, ActiveProcess>();

  constructor(config: AppConfig, workspaces: RuntimeWorkspaces = new WorkspaceManager(config)) {
    this.config = config;
    this.workspaces = workspaces;
  }

  prepare(session: Session, repository: Repository, credential: Credential | undefined, signal: AbortSignal): Promise<Workspace> {
    if (this.config.runtime.backend !== 'local') throw new Error('The command bridge requires a local runtime backend on the De Vloer server');
    return this.workspaces.prepare(session, repository, credential, signal);
  }

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    context.signal.throwIfAborted();
    const argv = this.config.runtime.command;
    if (!argv?.length) throw new Error('No command bridge argv is configured');
    if (this.active.has(context.workspace.id)) throw new Error('This workspace already has an active command bridge');
    const model = context.model ?? this.config.models[0];
    const environment = this.workspaces.executionEnvironment(context.workspace);
    const child = spawn(process.execPath, ['-e', supervisorProgram, ...argv], { cwd: context.workspace.directory, env: environment, shell: false, stdio: ['pipe', 'pipe', 'pipe', 'ipc'], detached: process.platform !== 'win32' }) as ChildProcessWithoutNullStreams;
    const closed = new Promise<void>(resolve => { child.once('close', () => resolve()); });
    return await new Promise<ExecutionResult>((resolve, reject) => {
      let stdout = '';
      const decoder = new StringDecoder('utf8');
      let result: ExecutionResult | undefined;
      let failure: Error | undefined;
      let stopped = false;
      let finished = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const stop = (): void => {
        if (stopped || finished) return;
        stopped = true;
        try { child.stdin.write(`${JSON.stringify({ type: 'cancel' })}\n`); } catch {}
        try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM'); } catch {}
        killTimer = setTimeout(() => { try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch {} }, 2000);
        killTimer.unref();
      };
      this.active.set(context.workspace.id, { child, stop, closed });
      const abort = (): void => { stop(); };
      context.signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => { failure = new RuntimeFailure('timeout', 'execution', 'unknown'); stop(); }, this.config.runtime.timeoutMs);
      timer.unref();
      const finish = (error?: Error): void => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        context.signal.removeEventListener('abort', abort);
        this.active.delete(context.workspace.id);
        if (context.signal.aborted || stopped && !failure) reject(new DOMException('Agent turn cancelled', 'AbortError'));
        else if (error || failure) reject(error ?? failure);
        else if (!result) reject(new Error('Command bridge exited without a result record'));
        else resolve(result);
      };
      child.on('error', () => finish(new RuntimeFailure('runtime_failure', 'runtime')));
      child.on('message', record => {
        if (record && typeof record === 'object' && 'type' in record && record.type === 'launch.error') failure = new RuntimeFailure('missing' in record && record.missing === true ? 'missing_executable' : 'runtime_failure', 'runtime');
      });
      child.stdin.on('error', () => {});
      child.stderr.on('data', () => {});
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += decoder.write(chunk);
        if (stdout.length > 4 * 1024 * 1024) { failure = new Error('Command bridge record exceeded the size limit'); stop(); return; }
        let boundary: number;
        while ((boundary = stdout.indexOf('\n')) !== -1) {
          const line = stdout.slice(0, boundary).trim();
          stdout = stdout.slice(boundary + 1);
          if (!line) continue;
          let record: Record<string, any>;
          try { record = JSON.parse(line); } catch { failure = new Error('Command bridge returned invalid JSON Lines'); stop(); return; }
          if (!record || typeof record !== 'object' || Array.isArray(record)) { failure = new Error('Command bridge returned an invalid record'); stop(); return; }
          if (record.type === 'result') {
            if (result || typeof record.summary !== 'string') { failure = new Error('Command bridge returned an invalid or duplicate result'); stop(); return; }
            const artifacts: Artifact[] = [];
            for (const artifact of Array.isArray(record.artifacts) ? record.artifacts : []) {
              if (!artifact || !['diff', 'test', 'summary'].includes(artifact.kind) || typeof artifact.name !== 'string' || typeof artifact.content !== 'string') continue;
              artifacts.push({ id: randomUUID(), kind: artifact.kind, name: artifact.name, content: artifact.content });
            }
            result = { summary: record.summary, artifacts, nativeId: context.workspace.nativeSessionId, verdict: reportedVerdict('', record) ?? (context.role.mode === 'read' ? 'inconclusive' : undefined), ...(Number.isFinite(record.costUsd) && record.costUsd >= 0 ? { costUsd: record.costUsd } : {}) };
          } else if (record.type === 'error') {
            failure = new RuntimeFailure('harness_rejected', 'execution', 'unknown');
            stop();
          } else if (record.type === 'event' && typeof record.event?.type === 'string' && record.event.data && typeof record.event.data === 'object') {
            const event = record.event;
            if (!['native.session', 'message', 'tool', 'status', 'permission', 'permission.resolved', 'usage'].includes(event.type)) continue;
            if (event.type === 'native.session' && typeof event.data.nativeId === 'string') context.workspace.nativeSessionId = event.data.nativeId;
            context.emit(event);
          }
        }
      });
      child.on('close', code => {
        stdout += decoder.end();
        finish(failure ? undefined : code !== 0 && !stopped ? new Error(`Command bridge exited with code ${code ?? 'unknown'}`) : stdout.trim() && !stopped ? new Error('Command bridge ended with an incomplete JSON Lines record') : undefined);
      });
      child.stdin.write(`${JSON.stringify({ type: 'start', version: 1, sessionId: context.session.id, runId: context.run.id, nativeId: context.run.nativeId, directory: context.workspace.directory, prompt: context.prompt, role: { id: context.role.id, mode: context.role.mode, instruction: context.role.instruction }, model: model ? { providerId: model.providerId, modelId: model.modelId } : undefined, verify: context.repository.verify })}\n`);
      if (context.signal.aborted) abort();
    });
  }

  async respond(workspace: Workspace, request: PermissionRequest, answer: { decision?: 'once' | 'always' | 'reject'; answers?: string[][] }): Promise<void> {
    const active = this.active.get(workspace.id);
    if (!active) throw new Error('The command bridge is not running');
    await new Promise<void>((resolve, reject) => { active.child.stdin.write(`${JSON.stringify({ type: 'response', requestId: request.nativeId, kind: request.kind, ...answer })}\n`, error => error ? reject(new Error('Unable to deliver the command bridge response')) : resolve()); });
  }

  async interrupt(workspace: Workspace): Promise<void> {
    const active = this.active.get(workspace.id);
    active?.stop();
    if (active) await active.closed;
  }
  dispose(workspace: Workspace): Promise<void> { return this.workspaces.dispose(workspace); }
}
