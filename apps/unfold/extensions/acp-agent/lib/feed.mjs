const clip = (value, max) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const toolStatus = { running: 'in_progress', started: 'in_progress', pending: 'pending', completed: 'completed', done: 'completed', failed: 'failed', error: 'failed' };

const ended = {
  'session.completed': 'The session finished.',
  'session.failed': 'The session failed.',
  'session.cancelled': 'The session was cancelled.',
  'session.paused': 'The session is paused. Nothing more is spent until someone resumes it.',
  'session.interrupted': 'The session was interrupted. It does not restart by itself.',
};

/** A text chunk from the agent, as an ACP `agent_message_chunk` update. */
export function say(text, messageId) {
  return { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text }, ...(messageId ? { messageId } : {}) };
}

/**
 * Turns the events of an Unfold session feed (`GET /api/sessions/{id}/history`) into ACP `session/update` payloads.
 * It remembers which tool calls it announced, so the first event of a tool call is a `tool_call` and later ones are
 * `tool_call_update`s; an event without a part id continues the open tool call of the same Run and name. Permission and question events give no update here: the agent relays them itself.
 */
export class FeedTranslator {
  constructor() { this.tools = new Set(); this.open = new Map(); }

  /** @param {{ id: number, type: string, runId?: string, data: Record<string, any> }} event @returns {object[]} */
  updates(event) {
    const data = event.data ?? {};
    if (event.type === 'message') {
      if (data.role !== 'assistant' || typeof data.text !== 'string' || !data.text) return [];
      return [say(data.text, typeof data.partId === 'string' ? data.partId : `unfold-${event.id}`)];
    }
    if (event.type === 'tool') {
      const status = toolStatus[String(data.status ?? '')] ?? 'pending';
      const name = `${event.runId ?? ''}:${data.name ?? data.command ?? ''}`;
      const toolCallId = typeof data.partId === 'string' && data.partId ? data.partId : this.open.get(name) ?? `unfold-tool-${event.id}`;
      if (status === 'pending' || status === 'in_progress') this.open.set(name, toolCallId); else this.open.delete(name);
      const output = typeof data.output === 'string' && data.output ? data.output : typeof data.text === 'string' ? data.text : '';
      const fields = { toolCallId, status, ...(output ? { content: [{ type: 'content', content: { type: 'text', text: clip(output, 4000) } }] } : {}) };
      if (this.tools.has(toolCallId)) return [{ sessionUpdate: 'tool_call_update', ...fields }];
      this.tools.add(toolCallId);
      return [{ sessionUpdate: 'tool_call', title: clip(data.name || data.command || 'Tool', 200), kind: data.command ? 'execute' : String(data.name ?? '').startsWith('edit') ? 'edit' : 'other', ...fields }];
    }
    if (event.type === 'run.started') return [say(`\n\n**${clip(data.role || 'A Run', 80)}** started.\n\n`)];
    if (event.type === 'run.finished') return [say(`\n\n**Run finished** (${clip(data.status || 'done', 40)})${data.summary ? `: ${clip(data.summary, 2000)}` : '.'}\n\n`)];
    if (event.type in ended) return [say(`\n\n${ended[event.type]}${data.message ? ` ${clip(data.message, 500)}` : ''}\n`)];
    return [];
  }
}

const runStatus = { pending: 'pending', running: 'in_progress', finished: 'completed' };
const toolKinds = new Set(['read', 'edit', 'delete', 'move', 'search', 'execute', 'think', 'fetch', 'switch_mode', 'other']);
const callStatuses = new Set(['pending', 'in_progress', 'completed', 'failed']);

/**
 * A Work Item's Runs as the entries of an ACP `plan` update, oldest first: one entry per Run, named by its Round and
 * Role, pending, in progress or completed as Ploeg reports it. Shadow Runs are left out; at most the 20 newest Runs.
 * @param {{ id: string, role?: string, round?: number, state?: string, outcome?: string | null, shadow?: boolean }[]} runs
 */
export function runPlan(runs) {
  return (Array.isArray(runs) ? runs : [])
    .filter(run => run && run.shadow !== true)
    .sort((left, right) => (Number(left.round) || 0) - (Number(right.round) || 0) || String(left.id).localeCompare(String(right.id), 'en', { numeric: true }))
    .slice(-20)
    .map(run => ({ content: `Round ${Number(run.round) || 1} · ${clip(run.role || 'Run', 80)}${run.state === 'finished' && run.outcome ? ` (${clip(String(run.outcome).replaceAll('_', ' '), 60)})` : ''}`, priority: 'medium', status: runStatus[String(run.state)] ?? 'pending' }));
}

/**
 * Turns the entries of a Ploeg Run transcript (`GET /api/ploeg/work-items/{id}/runs/{runId}/transcript`) into ACP
 * `session/update` payloads: messages, thoughts, tool calls and their output. Tool call ids are prefixed with the Run,
 * so two Runs never share one; the Run's own plan becomes a checklist message, because the session's plan lists Runs.
 */
export class TranscriptTranslator {
  constructor() { this.tools = new Set(); }

  /** @param {string} runId @param {{ seq: number, kind: string, text?: string, toolCallId?: string, title?: string, toolKind?: string, status?: string, input?: string, paths?: string[], plan?: { content: string, status: string }[] }} entry @returns {object[]} */
  updates(runId, entry) {
    const text = typeof entry?.text === 'string' ? entry.text : '';
    if (entry?.kind === 'message') return text ? [say(`${text}\n\n`)] : [];
    if (entry?.kind === 'thought') return text ? [{ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text } }] : [];
    if (entry?.kind === 'stage') return text ? [say(`*${clip(text, 500)}*\n\n`)] : [];
    if (entry?.kind === 'truncated') return [say('*Part of this Run\'s transcript was left out.*\n\n')];
    if (entry?.kind === 'plan') {
      const steps = (Array.isArray(entry.plan) ? entry.plan : []).slice(0, 32);
      return steps.length ? [say(`${steps.map(step => `- [${step.status === 'completed' ? 'x' : ' '}] ${clip(step.content, 256)}`).join('\n')}\n\n`)] : [];
    }
    if (entry?.kind !== 'tool_call' && entry?.kind !== 'tool_output') return [];
    if (typeof entry.toolCallId !== 'string' || !entry.toolCallId) return [];
    const toolCallId = `${runId}:${entry.toolCallId}`;
    const status = callStatuses.has(String(entry.status)) ? entry.status : undefined;
    const content = text ? [{ type: 'content', content: { type: 'text', text: clip(text, 4000) } }] : undefined;
    if (entry.kind === 'tool_output' || this.tools.has(toolCallId)) {
      this.tools.add(toolCallId);
      return [{ sessionUpdate: 'tool_call_update', toolCallId, ...(status ? { status } : {}), ...(content ? { content } : {}) }];
    }
    this.tools.add(toolCallId);
    const paths = (Array.isArray(entry.paths) ? entry.paths : []).filter(path => typeof path === 'string' && path).slice(0, 16);
    return [{ sessionUpdate: 'tool_call', toolCallId, title: clip(entry.title || 'Tool', 200), kind: toolKinds.has(String(entry.toolKind)) ? entry.toolKind : 'other', status: status ?? 'pending', ...(content ? { content } : {}), ...(paths.length ? { locations: paths.map(path => ({ path })) } : {}), ...(typeof entry.input === 'string' && entry.input ? { rawInput: { input: entry.input } } : {}) }];
  }
}
