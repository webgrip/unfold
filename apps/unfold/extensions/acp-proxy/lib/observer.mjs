const trackedLimit = 1000;
const startedBy = new Set(['session/new', 'session/fork']);
const resumedBy = new Set(['session/load', 'session/resume']);

const key = id => `${typeof id}:${id}`;
const text = (value, max = 4096) => typeof value === 'string' ? value.slice(0, max) : '';
const isRequest = value => typeof value.method === 'string' && 'id' in value && value.id !== null;
const isNotification = value => typeof value.method === 'string' && !('id' in value);
const isResponse = value => !('method' in value) && 'id' in value && ('result' in value || 'error' in value);

function remember(calls, id, call) {
  calls.set(key(id), call);
  if (calls.size > trackedLimit) calls.delete(calls.keys().next().value);
}

function take(calls, id) {
  const call = calls.get(key(id));
  calls.delete(key(id));
  return call;
}

/**
 * The session facts in an Agent Client Protocol stream. It reads the messages between an editor and an agent and calls
 * the reporter with what happened: the agent's name, a session that started, a prompt turn, a permission request and
 * its answer, a tool call's update, the turn's end. It never changes, holds back or answers a message.
 */
export class AcpObserver {
  /** @param {{ agent(info: { name: string, title: string, version: string }): void, start(sessionId: string, cwd: string, model: string): void, prompt(sessionId: string): void, waiting(sessionId: string): void, answered(sessionId: string): void, toolCall(sessionId: string, update: Record<string, unknown>): void, idle(sessionId: string, stopReason: string): void, model(sessionId: string, model: string): void }} reporter */
  constructor(reporter) {
    this.reporter = reporter;
    this.editorCalls = new Map();
    this.agentCalls = new Map();
    this.loading = new Set();
  }

  /** One message the editor sent to the agent. */
  fromEditor(value) {
    if (!value) return;
    if (isRequest(value)) {
      const params = value.params && typeof value.params === 'object' ? value.params : {};
      const sessionId = text(params.sessionId, 512);
      if (value.method === 'initialize') remember(this.editorCalls, value.id, { method: value.method });
      else if (startedBy.has(value.method)) remember(this.editorCalls, value.id, { method: value.method, cwd: text(params.cwd) });
      else if (resumedBy.has(value.method) && sessionId) { remember(this.editorCalls, value.id, { method: value.method, sessionId, cwd: text(params.cwd) }); this.loading.add(sessionId); }
      else if (value.method === 'session/prompt' && sessionId) { remember(this.editorCalls, value.id, { method: value.method, sessionId }); this.reporter.prompt(sessionId); }
      else if (value.method === 'session/set_model' && sessionId) remember(this.editorCalls, value.id, { method: value.method, sessionId, model: text(params.modelId, 200) });
    } else if (isResponse(value)) {
      const call = take(this.agentCalls, value.id);
      if (call?.method === 'session/request_permission' && value.result?.outcome?.outcome === 'selected') this.reporter.answered(call.sessionId);
    }
  }

  /** One message the agent sent to the editor. */
  fromAgent(value) {
    if (!value) return;
    const params = value.params && typeof value.params === 'object' ? value.params : {};
    if (isRequest(value)) {
      if (value.method === 'session/request_permission' && text(params.sessionId, 512)) {
        remember(this.agentCalls, value.id, { method: value.method, sessionId: text(params.sessionId, 512) });
        this.reporter.waiting(text(params.sessionId, 512));
      }
    } else if (isNotification(value)) {
      const update = params.update;
      const sessionId = text(params.sessionId, 512);
      if (value.method === 'session/update' && sessionId && !this.loading.has(sessionId) && update && typeof update === 'object' && (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update')) this.reporter.toolCall(sessionId, update);
    } else if (isResponse(value)) {
      const call = take(this.editorCalls, value.id);
      if (!call) return;
      const ok = !('error' in value);
      const result = ok && value.result && typeof value.result === 'object' ? value.result : {};
      if (call.method === 'initialize' && result.agentInfo && typeof result.agentInfo === 'object') {
        const info = result.agentInfo;
        this.reporter.agent({ name: text(info.name, 100), title: text(info.title, 100), version: text(info.version, 40) });
      } else if (startedBy.has(call.method) && text(result.sessionId, 512)) this.reporter.start(text(result.sessionId, 512), call.cwd, text(result.models?.currentModelId, 200));
      else if (resumedBy.has(call.method)) {
        this.loading.delete(call.sessionId);
        if (ok) this.reporter.start(call.sessionId, call.cwd, text(result.models?.currentModelId, 200));
      } else if (call.method === 'session/prompt') this.reporter.idle(call.sessionId, ok ? text(result.stopReason, 40) : 'error');
      else if (call.method === 'session/set_model' && ok && call.model) this.reporter.model(call.sessionId, call.model);
    }
  }
}
