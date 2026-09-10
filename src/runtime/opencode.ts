import { randomUUID } from 'node:crypto';
import { unavailableCandidate, type Candidate } from '../candidates.ts';
import { setTimeout as delay } from 'node:timers/promises';
import type { AgentRuntime, AppConfig, Artifact, Credential, ExecutionContext, ExecutionResult, PermissionRequest, Repository, Session, Workspace } from '../types.ts';
import { WorkspaceManager } from './workspace.ts';
import { RuntimeFailure, classifyFailure, transportFailure, type PromptAcceptance } from '../failures.ts';

export interface RuntimeWorkspaces {
  prepare(session: Session, repository: Repository, credential: Credential | undefined, signal: AbortSignal): Promise<Workspace>;
  credentials(workspace: Workspace): { username: string; password: string } | undefined;
  executionEnvironment(workspace: Workspace): Record<string, string>;
  dispose(workspace: Workspace): Promise<void>;
  captureCandidate?(session: Session, repository: Repository): Promise<Candidate>;
  transport?(workspace: Workspace): typeof fetch | undefined;
}

type WireRecord = Record<string, any>;
type WireMessage = { info: WireRecord; parts: WireRecord[] };

export function reportedVerdict(text: string, structured?: unknown): ExecutionResult['verdict'] {
  const values: unknown[] = [structured];
  try { values.push(JSON.parse(text)); } catch {}
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) {
    try { values.push(JSON.parse(match[1])); } catch {}
  }
  for (const value of values) {
    const verdict = value && typeof value === 'object' ? (value as WireRecord).verdict : undefined;
    if (verdict === 'approve' || verdict === 'request_changes' || verdict === 'inconclusive') return verdict;
  }
  return undefined;
}

export class OpenCodeRuntime implements AgentRuntime {
  readonly kind = 'opencode' as const;
  private readonly config: AppConfig;
  private readonly workspaces: RuntimeWorkspaces;
  private readonly fetcher: typeof fetch;

  constructor(config: AppConfig, workspaces: RuntimeWorkspaces = new WorkspaceManager(config), fetcher: typeof fetch = fetch) {
    this.config = config;
    this.workspaces = workspaces;
    this.fetcher = fetcher;
  }

  prepare(session: Session, repository: Repository, credential: Credential | undefined, signal: AbortSignal): Promise<Workspace> {
    return this.workspaces.prepare(session, repository, credential, signal);
  }

  private url(workspace: Workspace, path: string): URL {
    if (!workspace.endpoint) throw new Error('The OpenCode workspace has no endpoint');
    const url = new URL(path, workspace.endpoint.endsWith('/') ? workspace.endpoint : `${workspace.endpoint}/`);
    url.searchParams.set('directory', workspace.directory);
    return url;
  }

  private fetch(workspace: Workspace): typeof fetch {
    return this.workspaces.transport?.(workspace) ?? this.fetcher;
  }

  private headers(workspace: Workspace): Record<string, string> {
    const auth = this.workspaces.credentials(workspace);
    return { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}` } : {}) };
  }

  private async request(workspace: Workspace, path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<any> {
    const timeout = AbortSignal.timeout(15000);
    try {
      const response = await this.fetch(workspace)(this.url(workspace, path), {
        method, headers: this.headers(workspace), redirect: 'error',
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) throw new RuntimeFailure('harness_rejected', 'runtime', 'not_submitted', response.status);
      if (response.status === 204) return undefined;
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let text = '';
      let size = 0;
      if (reader) try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) { text += decoder.decode(); break; }
          size += chunk.value.byteLength;
          if (size > 16 * 1024 * 1024) throw new RuntimeFailure('harness_rejected', 'runtime');
          text += decoder.decode(chunk.value, { stream: true });
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      try { return text ? JSON.parse(text) : undefined; } catch { throw new RuntimeFailure('harness_rejected', 'runtime'); }
    } catch (error) {
      if (error instanceof RuntimeFailure) throw error;
      if (signal?.aborted) throw signal.reason;
      if (timeout.aborted) throw new RuntimeFailure('timeout', 'runtime');
      throw transportFailure(error, 'runtime');
    }
  }

  private async stream(workspace: Workspace, signal: AbortSignal, receive: (event: WireRecord) => void): Promise<void> {
    const response = await this.fetch(workspace)(this.url(workspace, '/event'), { headers: this.headers(workspace), redirect: 'error', signal });
    if (!response.ok || !response.body) throw new Error(`OpenCode event stream failed (HTTP ${response.status})`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (!signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer = (buffer + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, '\n');
        if (buffer.length > 4 * 1024 * 1024) throw new Error('OpenCode event exceeded the size limit');
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (!data) continue;
          try { receive(JSON.parse(data)); } catch (error) { if (error instanceof SyntaxError) continue; throw error; }
        }
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const { workspace, signal, emit } = context;
    signal.throwIfAborted();
    const timeout = AbortSignal.timeout(this.config.runtime.timeoutMs);
    const completion = new AbortController();
    const operation = AbortSignal.any([signal, timeout, completion.signal]);
    const model = context.model ?? this.config.models[0];
    if (!model) throw new RuntimeFailure('harness_rejected', 'runtime');
    let nativeId = context.run.nativeId;
    let baseline: WireMessage[];
    try {
      if (!nativeId) {
        const permission = context.role.mode === 'read'
          ? [{ permission: '*', pattern: '*', action: 'ask' }, { permission: 'edit', pattern: '*', action: 'deny' }, { permission: 'bash', pattern: '*', action: 'deny' }, { permission: 'task', pattern: '*', action: 'deny' }, { permission: 'read', pattern: '*', action: 'allow' }, { permission: 'glob', pattern: '*', action: 'allow' }, { permission: 'grep', pattern: '*', action: 'allow' }, { permission: 'external_directory', pattern: '*', action: 'deny' }]
          : undefined;
        const created = await this.request(workspace, '/session', 'POST', { title: `${context.session.title} · ${context.role.name}`, ...(permission ? { permission } : {}) }, operation);
        if (typeof created?.id !== 'string') throw new RuntimeFailure('harness_rejected', 'runtime');
        nativeId = created.id;
      }
      if (typeof nativeId !== 'string') throw new RuntimeFailure('harness_rejected', 'runtime');
      workspace.nativeSessionId = nativeId;
      emit({ type: 'native.session', data: { nativeId } });
      baseline = await this.request(workspace, `/session/${encodeURIComponent(nativeId)}/message`, 'GET', undefined, operation);
      if (!Array.isArray(baseline)) throw new RuntimeFailure('harness_rejected', 'runtime');
    } catch (error) {
      if (signal.aborted) throw new DOMException('Agent turn cancelled', 'AbortError');
      if (timeout.aborted) throw new RuntimeFailure('timeout', 'runtime');
      const failure = classifyFailure(error, 'runtime');
      throw new RuntimeFailure(failure.category, 'runtime');
    }
    const base = `/session/${encodeURIComponent(nativeId)}`;
    const existing = new Set(baseline.map(item => item.info?.id));
    const sessions = new Set([nativeId]);
    const seenEvents = new Set<string>();
    const pending = new Set<string>();
    const textParts = new Map<string, string>();
    let failure: Error | undefined;
    let promptAcceptance: PromptAcceptance = 'not_submitted';
    const receive = (event: WireRecord): void => {
      if (event.id && seenEvents.has(event.id)) return;
      if (event.id) { seenEvents.add(event.id); if (seenEvents.size > 20000) seenEvents.delete(seenEvents.values().next().value!); }
      const p = event.properties ?? {};
      if (event.type === 'session.created' && p.info?.parentID && sessions.has(p.info.parentID)) sessions.add(p.info.id);
      const sid = p.sessionID ?? p.info?.sessionID ?? p.part?.sessionID;
      if (sid && !sessions.has(sid)) return;
      if (event.type === 'session.error' && sid === nativeId) failure = this.agentFailure(p.error);
      if (event.type === 'message.part.delta' && p.field === 'text' && typeof p.delta === 'string') {
        const key = `${sid}:${p.messageID}:${p.partID}`;
        textParts.set(key, (textParts.get(key) ?? '') + p.delta);
        emit({ type: 'message', data: { text: p.delta, role: 'assistant', nativeSessionId: sid, partId: p.partID } });
      }
      if (event.type === 'message.part.updated' && p.part?.type === 'tool') {
        emit({ type: 'tool', data: { name: String(p.part.tool ?? 'tool'), status: String(p.part.state?.status ?? 'unknown'), nativeSessionId: sid } });
      }
      if (event.type === 'permission.asked' || event.type === 'question.asked') {
        if (typeof p.id !== 'string' || pending.has(p.id)) return;
        pending.add(p.id);
        const question = event.type === 'question.asked';
        emit({ type: 'permission', data: { nativeId: p.id, kind: question ? 'question' : 'permission', title: question ? 'Agent needs your answer' : `Allow ${p.permission ?? 'action'}?`, detail: question ? (p.questions ?? []).map((q: WireRecord) => q.question).join('\n') : JSON.stringify({ permission: p.permission, patterns: p.patterns, always: p.always }), ...(question ? { questions: p.questions } : { options: ['once', 'always', 'reject'] }) } });
      }
      if (event.type === 'permission.replied' || event.type === 'question.replied' || event.type === 'question.rejected') {
        pending.delete(p.requestID);
        emit({ type: 'permission.resolved', data: { nativeId: p.requestID } });
      }
    };
    const watch = async (): Promise<void> => {
      while (!operation.aborted) {
        try { await this.stream(workspace, operation, receive); } catch { if (operation.aborted) return; }
        await delay(500, undefined, { signal: operation }).catch(() => {});
      }
    };
    const watching = watch();
    const prompt = context.prompt + (context.role.mode === 'read'
      ? '\nInspect the repository and the verification evidence supplied in the task. Shell execution and edits are unavailable in this read role; do not claim to have run tests. Finish with a fenced JSON object containing summary and verdict (approve, request_changes, or inconclusive). Approve only what the available evidence supports.'
      : `\nThe configured verification command is this exact argv array: ${JSON.stringify(context.repository.verify)}. Run it when authorized and report its actual result.`);
    try {
      promptAcceptance = 'unknown';
      await this.request(workspace, `${base}/prompt_async`, 'POST', { model: { providerID: model.providerId, modelID: model.modelId }, agent: 'build', parts: [{ type: 'text', text: prompt }] }, operation);
      promptAcceptance = 'accepted';
      while (true) {
        operation.throwIfAborted();
        if (failure) throw failure;
        const [statuses, messages, permissions, questions, children] = await Promise.all([
          this.request(workspace, '/session/status', 'GET', undefined, operation),
          this.request(workspace, `${base}/message`, 'GET', undefined, operation),
          this.request(workspace, '/permission', 'GET', undefined, operation),
          this.request(workspace, '/question', 'GET', undefined, operation),
          this.request(workspace, `${base}/children`, 'GET', undefined, operation),
        ]);
        if (!Array.isArray(permissions) || !Array.isArray(questions)) throw new Error('OpenCode returned an invalid pending-request list');
        for (const child of Array.isArray(children) ? children : []) if (typeof child.id === 'string') sessions.add(child.id);
        const activeRequests = new Set([...permissions, ...questions].filter(p => sessions.has(p.sessionID)).map(p => p.id));
        for (const id of pending) if (!activeRequests.has(id)) { pending.delete(id); emit({ type: 'permission.resolved', data: { nativeId: id } }); }
        for (const p of Array.isArray(permissions) ? permissions : []) receive({ type: 'permission.asked', properties: p });
        for (const p of Array.isArray(questions) ? questions : []) receive({ type: 'question.asked', properties: p });
        if (!Array.isArray(messages)) throw new Error('OpenCode returned an invalid message list');
        const assistants: WireMessage[] = messages.filter((item: WireMessage) => item.info?.role === 'assistant' && !existing.has(item.info.id));
        const last = assistants.at(-1);
        if (last?.info.error) throw this.agentFailure(last.info.error);
        const idle = !statuses?.[nativeId] || statuses[nativeId].type === 'idle';
        const terminal = last?.info.finish && !['tool-calls', 'unknown'].includes(last.info.finish);
        if (idle && last?.info.time?.completed && terminal && !pending.size) {
          const summary = last.parts.filter(part => part.type === 'text').map(part => String(part.text ?? '')).join('\n').trim();
          if (!summary && !last.info.finish) throw new Error('OpenCode stopped without a final response');
          const resultText = summary || 'The agent finished without a textual summary.';
          const allMessages = [...assistants];
          for (const childId of sessions) {
            if (childId === nativeId) continue;
            const child = await this.request(workspace, `/session/${encodeURIComponent(childId)}/message`, 'GET', undefined, operation);
            if (Array.isArray(child)) allMessages.push(...child.filter((item: WireMessage) => item.info?.role === 'assistant'));
          }
          const costUsd = allMessages.reduce((sum, item) => sum + (Number.isFinite(item.info.cost) ? item.info.cost : 0), 0);
          emit({ type: 'usage', data: { costUsd, source: 'harness-estimate', inputTokens: allMessages.reduce((n, m) => n + (m.info.tokens?.input ?? 0), 0), outputTokens: allMessages.reduce((n, m) => n + (m.info.tokens?.output ?? 0), 0) } });
          const artifacts: Artifact[] = [{ id: randomUUID(), kind: 'summary', name: `${context.role.name} report`, content: resultText }];
          const diff = await this.request(workspace, `${base}/diff`, 'GET', undefined, operation);
          if (Array.isArray(diff) && diff.length) artifacts.push({ id: randomUUID(), kind: 'diff', name: `${context.role.name} native file diff`, content: JSON.stringify(diff, null, 2) });
          for (const message of allMessages) {
            for (const part of message.parts ?? []) {
              if (part.type === 'tool' && part.state?.status === 'completed' && typeof part.state.output === 'string') {
                const command = String(part.state.input?.command ?? '');
                const configuredCommand = context.repository.verify.map(arg => /^[A-Za-z0-9_./:=@+-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`).join(' ');
                if (configuredCommand && command === configuredCommand) artifacts.push({ id: randomUUID(), kind: 'test', name: command, content: part.state.output });
              }
            }
          }
          if (!textParts.size) emit({ type: 'message', data: { role: 'assistant', text: resultText } });
          return { summary: resultText, nativeId, costUsd, artifacts, verdict: reportedVerdict(resultText, last.info.structured) ?? (context.role.mode === 'read' ? 'inconclusive' : undefined) };
        }
        await delay(750, undefined, { signal: operation });
      }
    } catch (error) {
      await this.interrupt(workspace).catch(() => {});
      if (signal.aborted) throw new DOMException('Agent turn cancelled', 'AbortError');
      if (promptAcceptance === 'unknown') {
        const status = error instanceof RuntimeFailure ? error.httpStatus : undefined;
        if (status && status >= 400 && status < 500 && status !== 408) throw new RuntimeFailure('harness_rejected', 'prompt', 'rejected');
        throw new RuntimeFailure('prompt_acceptance_unknown', 'prompt', 'unknown');
      }
      if (timeout.aborted) throw new RuntimeFailure('timeout', 'execution', promptAcceptance);
      const failure = classifyFailure(error, 'execution', promptAcceptance);
      throw new RuntimeFailure(failure.category, 'execution', promptAcceptance);
    } finally { completion.abort(); await watching; }
  }

  private agentFailure(error: unknown): RuntimeFailure {
    const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined;
    return new RuntimeFailure(['APIError', 'APICallError', 'ProviderAuthError', 'ModelNotFoundError'].includes(String(name)) ? 'gateway_rejected' : 'harness_rejected', 'execution', 'accepted');
  }

  async respond(workspace: Workspace, request: PermissionRequest, answer: { decision?: 'once' | 'always' | 'reject'; answers?: string[][] }): Promise<void> {
    const id = encodeURIComponent(request.nativeId);
    if (request.kind === 'question') {
      if (answer.decision === 'reject') await this.request(workspace, `/question/${id}/reject`, 'POST');
      else {
        if (!Array.isArray(answer.answers)) throw new Error('Question answers are required');
        await this.request(workspace, `/question/${id}/reply`, 'POST', { answers: answer.answers });
      }
    } else {
      if (!answer.decision || !['once', 'always', 'reject'].includes(answer.decision)) throw new Error('A permission decision is required');
      await this.request(workspace, `/permission/${id}/reply`, 'POST', { reply: answer.decision });
    }
  }

  async interrupt(workspace: Workspace): Promise<void> {
    if (!this.workspaces.credentials(workspace) && ['local', 'docker', 'kubernetes'].includes(workspace.backend)) {
      await this.workspaces.dispose(workspace);
      return;
    }
    if (workspace.nativeSessionId) await this.request(workspace, `/session/${encodeURIComponent(workspace.nativeSessionId)}/abort`, 'POST');
  }

  captureCandidate(session: Session, repository: Repository): Promise<Candidate> { return this.workspaces.captureCandidate?.(session, repository) ?? Promise.resolve(unavailableCandidate('unsupported_workspace')); }

  dispose(workspace: Workspace): Promise<void> { return this.workspaces.dispose(workspace); }
}
