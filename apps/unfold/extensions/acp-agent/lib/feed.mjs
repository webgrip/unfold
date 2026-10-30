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
