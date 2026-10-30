import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { RpcError, rpcCodes } from './jsonrpc.mjs';
import { FeedTranslator, say } from './feed.mjs';
import { Unfold, UnfoldError, confirmationFor } from './unfold.mjs';

/** The ACP protocol version this agent speaks. */
export const protocolVersion = 1;

/** The ACP authentication method: the client runs the agent with `login` in a terminal, which is Unfold's editor sign-in. */
export const signInMethod = { id: 'unfold-sign-in', name: 'Sign in to Unfold', description: 'Opens Unfold\'s editor sign-in. Approve it in the browser only when the page shows the code this terminal shows.', type: 'terminal', args: ['login'] };

/** The slash commands an ACP client lists for the agent. */
export const commands = [
  { name: 'now', description: 'List the Work Items that wait for you' },
  { name: 'work', description: 'Follow one Work Item, or one of your workbench sessions', input: { hint: 'Work Item id, session id or Unfold link' } },
  { name: 'ask', description: 'Ask about the Work Item. Free from its record; a model call asks you to confirm the spend first', input: { hint: 'question' } },
  { name: 'steer', description: 'Send the Work Item\'s session a message, or leave a note for its next Run. Asks you to confirm first', input: { hint: 'message' } },
  { name: 'watch', description: 'Stream the Work Item\'s session feed until it stops or waits for you' },
  { name: 'propose', description: 'Draft a proposed Work Item for a person to approve. Never starts a Run', input: { hint: 'what should be done' } },
];

const modes = [
  { id: 'ask', name: 'Ask', description: 'A message is a question about the Work Item. The team never reads it.' },
  { id: 'steer', name: 'Steer', description: 'A message goes to the Work Item\'s session, after you confirm.' },
];

const stateWords = { ingested: 'being taken in', proposed: 'proposed, waits for approval', queued: 'queued', active: 'running', leased: 'running', needs_human: 'needs you', awaiting_review: 'waits for review', stale: 'stale', done: 'done', withdrawn: 'withdrawn' };
const finished = new Set(['completed', 'failed', 'cancelled', 'paused', 'interrupted', 'exporting']);
const steerable = new Set(['queued', 'running', 'waiting_input', 'paused', 'interrupted']);
const usd = value => `US$${(Math.round((Number(value) || 0) * 100) / 100).toFixed(2)}`;
const clip = (value, max) => { const text = String(value ?? '').replace(/\s+/g, ' ').trim(); return text.length > max ? `${text.slice(0, max - 1)}…` : text; };
const quoted = text => `"${clip(text, 160)}"`;

/** The Work Item id or workbench session id an id, `#work/…`, `#session/…` or Unfold link names, or null. */
export function reference(text) {
  const value = String(text ?? '').trim();
  const work = /(?:^|#work\/)([1-9][0-9]{0,18})$/.exec(value);
  if (work) return { kind: 'work', id: work[1] };
  const session = /(?:^|#session\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(value);
  if (session) return { kind: 'session', id: session[1].toLowerCase() };
  return null;
}

/** The command a prompt starts with, and the rest of it. */
export function parsePrompt(text) {
  const match = /^\s*\/([a-z]+)(?=\s|$)\s*/i.exec(text);
  if (!match) return { command: '', rest: text.trim() };
  return { command: match[1].toLowerCase(), rest: text.slice(match[0].length).trim() };
}

function promptText(blocks) {
  if (!Array.isArray(blocks)) throw new RpcError(rpcCodes.invalidParams, 'prompt must be a list of content blocks.');
  return blocks.map(block => block?.type === 'text' ? String(block.text ?? '') : block?.type === 'resource_link' ? String(block.uri ?? '') : '').filter(Boolean).join('\n').trim();
}

/**
 * The `unfold` ACP agent. An ACP session follows one Work Item: a message asks about it (Unfold Ask) or steers its
 * session, the session feed streams back as agent messages and tool calls, and a tool permission the Run's harness asks
 * for reaches the person as an ACP permission prompt with allow and deny only. Anything that spends or changes work asks
 * the person first through `session/request_permission`; a delegation from the editor never starts a Run.
 */
export class UnfoldAgent {
  /**
   * @param {{ url: string, credential: () => Promise<string>, version?: string, pollMs?: number, workItem?: string, fetch?: typeof fetch }} options
   */
  constructor({ url, credential, version = '0.0.0-dev', pollMs = 1000, workItem = '', fetch: fetcher }) {
    this.url = url;
    this.credential = credential;
    this.version = version;
    this.pollMs = pollMs;
    this.defaultWorkItem = workItem;
    this.fetcher = fetcher;
    this.sessions = new Map();
    this.unfold = null;
    this.me = null;
  }

  /** Binds the agent to its connection to the editor. */
  attach(connection) { this.connection = connection; }

  /** Answers one ACP request or notification. */
  async handle(method, params) {
    switch (method) {
      case 'initialize': return this.initialize(params);
      case 'authenticate': return this.authenticate(params);
      case 'session/new': return this.newSession(params);
      case 'session/prompt': return this.prompt(params);
      case 'session/cancel': this.cancel(params); return null;
      case 'session/set_mode': return this.setMode(params);
      case 'session/set_config_option': return this.setConfigOption(params);
      default: throw new RpcError(rpcCodes.methodNotFound, `unfold does not support ${method}.`);
    }
  }

  initialize(params) {
    this.client = params?.clientInfo ?? null;
    return {
      protocolVersion,
      agentCapabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcpCapabilities: { http: false, sse: false } },
      agentInfo: { name: 'unfold', title: 'Unfold', version: this.version },
      authMethods: [signInMethod],
    };
  }

  async authenticate(params) {
    if (params?.methodId !== signInMethod.id) throw new RpcError(rpcCodes.invalidParams, `Use the authentication method ${signInMethod.id}.`);
    this.unfold = null;
    this.me = null;
    await this.signedIn();
    return {};
  }

  async signedIn() {
    if (this.me) return this.me;
    const token = await this.credential();
    this.unfold = new Unfold({ url: this.url, token, ...(this.fetcher ? { fetch: this.fetcher } : {}) });
    try {
      const boot = await this.unfold.get('/api/bootstrap');
      this.me = { id: String(boot.user?.id ?? ''), name: String(boot.user?.name ?? ''), role: String(boot.user?.role ?? ''), demo: boot.mode === 'demo', teams: (boot.teams ?? []).map(team => String(team.id)) };
      return this.me;
    } catch (error) {
      this.unfold = null;
      if (error instanceof UnfoldError && error.status === 401) throw new RpcError(rpcCodes.authRequired, `${error.message} Run \`unfold-acp-agent login\` in a terminal, or authenticate with ${signInMethod.id}.`);
      throw new RpcError(rpcCodes.internal, error.message);
    }
  }

  session(params) {
    const state = this.sessions.get(params?.sessionId);
    if (!state) throw new RpcError(rpcCodes.invalidParams, 'Unknown session.');
    return state;
  }

  update(state, update) { this.connection.notify('session/update', { sessionId: state.id, update }); }

  tell(state, text) { this.update(state, say(text)); }

  async newSession(params) {
    if (typeof params?.cwd !== 'string' || !params.cwd.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(params.cwd)) throw new RpcError(rpcCodes.invalidParams, 'cwd must be an absolute path.');
    await this.signedIn();
    const state = { id: `unfold-${randomUUID()}`, cwd: params.cwd, mode: 'ask', workItem: null, workbench: null, turn: null, greeted: false, relayed: new Set(), waiting: [] };
    this.sessions.set(state.id, state);
    const wanted = reference(params?._meta?.unfold?.workItem ?? this.defaultWorkItem);
    if (wanted) await this.bind(state, wanted, false).catch(() => {});
    setImmediate(() => this.update(state, { sessionUpdate: 'available_commands_update', availableCommands: commands }));
    return { sessionId: state.id, modes: { availableModes: modes, currentModeId: state.mode }, configOptions: await this.configOptions(state) };
  }

  async configOptions(state) {
    let waiting = [];
    try { waiting = ((await this.unfold.get('/api/ploeg/now')).waiting ?? []).slice(0, 30); } catch {}
    state.waiting = waiting.map(item => String(item.id));
    const options = [{ value: 'none', name: 'No Work Item yet' }, ...waiting.map(item => ({ value: String(item.id), name: `#${item.id} ${stateWords[item.state] ?? item.state}: ${clip(item.title, 80)}` }))];
    if (state.workItem && !options.some(option => option.value === state.workItem.id)) options.push({ value: state.workItem.id, name: `#${state.workItem.id}: ${clip(state.workItem.title, 80)}` });
    return [{ id: 'work-item', name: 'Work Item', description: 'The Work Item this session follows. Pick one that waits for you, or use /work with any id.', category: 'other', type: 'select', currentValue: state.workItem?.id ?? 'none', options }];
  }

  setMode(params) {
    const state = this.session(params);
    if (!modes.some(mode => mode.id === params.modeId)) throw new RpcError(rpcCodes.invalidParams, 'Choose the mode ask or steer.');
    state.mode = params.modeId;
    return {};
  }

  async setConfigOption(params) {
    const state = this.session(params);
    if (params.configId !== 'work-item') throw new RpcError(rpcCodes.invalidParams, 'Unknown configuration option.');
    if (params.value === 'none') { state.workItem = null; state.workbench = null; }
    else {
      const wanted = reference(params.value);
      if (!wanted || wanted.kind !== 'work') throw new RpcError(rpcCodes.invalidParams, 'Choose a Work Item from the list.');
      await this.bind(state, wanted, false);
    }
    return { configOptions: await this.configOptions(state) };
  }

  cancel(params) { this.sessions.get(params?.sessionId)?.turn?.abort(); }

  async prompt(params) {
    const state = this.session(params);
    if (state.turn) throw new RpcError(rpcCodes.invalidRequest, 'A prompt is still running in this session.');
    const turn = new AbortController();
    state.turn = turn;
    try {
      await this.signedIn();
      if (!state.greeted) {
        state.greeted = true;
        if (this.me.demo) this.tell(state, '*This Unfold is the illustrative demo: nothing runs and nothing is spent.*\n\n');
      }
      await this.dispatch(state, promptText(params.prompt), turn.signal);
    } catch (error) {
      if (error instanceof RpcError && error.code === rpcCodes.authRequired) throw error;
      if (!turn.signal.aborted) this.tell(state, `\n\n${error instanceof Error ? error.message : String(error)}`);
    } finally { state.turn = null; }
    return { stopReason: turn.signal.aborted ? 'cancelled' : 'end_turn' };
  }

  async dispatch(state, text, signal) {
    const { command, rest } = parsePrompt(text);
    if (command === 'now') return this.listNow(state);
    if (command === 'work') {
      const wanted = reference(rest);
      if (!wanted) return this.tell(state, 'Name a Work Item id, a session id or an Unfold link: `/work 105`.');
      return this.bind(state, wanted, true);
    }
    if (command === 'propose') return this.propose(state, rest);
    if (command === 'help' || command && !commands.some(entry => entry.name === command)) return this.help(state);
    if (!state.workItem && !state.workbench) {
      const wanted = command ? null : reference(rest);
      if (wanted) return this.bind(state, wanted, true);
      return this.listNow(state, true);
    }
    if (command === 'watch') return this.watch(state, signal, true);
    const intent = command || state.mode;
    if (!rest) return this.tell(state, intent === 'steer' ? 'Write the message after `/steer`.' : 'Write your question after `/ask`.');
    if (intent === 'steer') return this.steer(state, rest, signal);
    return this.ask(state, rest);
  }

  help(state) {
    this.tell(state, ['Commands:', ...commands.map(entry => `- \`/${entry.name}\`${entry.input ? ` *${entry.input.hint}*` : ''}: ${entry.description}.`), '', 'In Ask mode a message is a question about the Work Item; in Steer mode it goes to its session.'].join('\n'));
  }

  async listNow(state, unbound = false) {
    const now = await this.unfold.get('/api/ploeg/now');
    const waiting = now.waiting ?? [];
    const lines = waiting.slice(0, 20).map(item => `- **#${item.id}** ${stateWords[item.state] ?? item.state} · ${clip(item.team, 40)} · ${quoted(item.title)}`);
    this.tell(state, [
      now.demo ? '*Illustrative demo: nothing ran and nothing was spent.*\n' : '',
      waiting.length ? `${waiting.length} Work ${waiting.length === 1 ? 'Item waits' : 'Items wait'} for you:` : 'Nothing waits for you.',
      ...lines,
      waiting.length > 20 ? `- … and ${waiting.length - 20} more in Unfold: ${this.unfold.base}/#now` : '',
      '',
      unbound ? 'This session follows no Work Item yet. Pick one with `/work <id>` or the Work Item option, or draft new work with `/propose`.' : '',
    ].filter(line => line !== '').join('\n'));
  }

  async bind(state, wanted, announce) {
    if (wanted.kind === 'session') {
      const session = await this.unfold.get(`/api/sessions/${wanted.id}`);
      state.workbench = { id: String(session.id), ownerId: String(session.ownerId ?? ''), title: String(session.title ?? '') };
      const workItemId = session.execution?.workItemId ? String(session.execution.workItemId) : '';
      state.workItem = workItemId ? await this.workItem(workItemId) : null;
      this.update(state, { sessionUpdate: 'session_info_update', title: clip(`Unfold · ${session.title || session.objective || session.id}`, 120) });
      if (announce) this.tell(state, `Following your workbench session ${quoted(session.title || session.objective)}, now ${String(session.status).replaceAll('_', ' ')}${state.workItem ? `, for Work Item #${state.workItem.id}` : ''}. ${this.unfold.sessionLink(session.id)}\n\nUse \`/watch\` to stream it, \`/steer\` to message its agent${state.workItem ? ' and `/ask` to ask about the Work Item' : ''}.`);
      return;
    }
    const detail = await this.unfold.get(`/api/ploeg/work-items/${wanted.id}`);
    state.workItem = { id: String(detail.item?.id ?? wanted.id), title: String(detail.item?.title ?? ''), state: String(detail.item?.state ?? ''), team: String(detail.item?.team ?? '') };
    state.workbench = await this.workbenchFor(state.workItem.id);
    this.update(state, { sessionUpdate: 'session_info_update', title: clip(`Unfold · #${state.workItem.id} ${state.workItem.title}`, 120) });
    if (announce) {
      this.tell(state, this.summary(detail, state));
      this.update(state, { sessionUpdate: 'config_option_update', configOptions: await this.configOptions(state) });
    }
  }

  async workItem(id) {
    const detail = await this.unfold.get(`/api/ploeg/work-items/${id}`);
    return { id: String(detail.item?.id ?? id), title: String(detail.item?.title ?? ''), state: String(detail.item?.state ?? ''), team: String(detail.item?.team ?? '') };
  }

  async workbenchFor(workItemId) {
    const sessions = await this.unfold.get('/api/sessions').catch(() => []);
    const running = (Array.isArray(sessions) ? sessions : []).filter(session => String(session.execution?.workItemId ?? '') === workItemId && steerable.has(String(session.status)));
    const own = running.find(session => session.ownerId === this.me.id) ?? running[0];
    return own ? { id: String(own.id), ownerId: String(own.ownerId ?? ''), title: String(own.title ?? '') } : null;
  }

  summary(detail, state) {
    const item = detail.item ?? {};
    const spent = (detail.shifts ?? []).reduce((sum, shift) => sum + (Number(shift.spentUsd) || 0), 0);
    const question = detail.question?.text ?? item.question?.text ?? '';
    return [
      `**Work Item #${item.id}** ${quoted(item.title)}`,
      `${stateWords[item.state] ?? item.state} · Team ${clip(item.team, 60)} · ${Number(item.attempts) || 0} ${Number(item.attempts) === 1 ? 'attempt' : 'attempts'} · ${detail.demo || this.me.demo ? 'demo, nothing spent' : `${usd(spent)} spent`}`,
      item.pullRequestUrl || item.pullRequest?.url ? `Pull request: ${item.pullRequestUrl || item.pullRequest.url}` : '',
      question ? `It waits on this question (written by an agent): ${quoted(question)}. Answer it in Unfold.` : '',
      state.workbench ? `Workbench session: ${this.unfold.sessionLink(state.workbench.id)}` : '',
      this.unfold.workItemLink(item.id),
      '',
      'Ask about it with a message (Ask mode) or `/ask`; steer it with `/steer`.',
    ].filter(Boolean).join('\n');
  }

  /**
   * Asks the person through ACP before an action that spends or changes work, shown as a pending tool call. Resolves
   * `allow` or `deny` for the option they chose, or `none` when the prompt was cancelled or never answered.
   */
  async choose(state, { toolCallId, title, message, allow, deny, kind = 'other' }) {
    const call = { toolCallId, title, kind, status: 'pending', content: [{ type: 'content', content: { type: 'text', text: message } }] };
    this.update(state, { sessionUpdate: 'tool_call', ...call });
    let answer;
    try { answer = await this.connection.request('session/request_permission', { sessionId: state.id, toolCall: call, options: [{ optionId: 'allow', name: allow, kind: 'allow_once' }, { optionId: 'deny', name: deny, kind: 'reject_once' }] }); }
    catch { answer = null; }
    return answer?.outcome?.outcome === 'selected' && (answer.outcome.optionId === 'allow' || answer.outcome.optionId === 'deny') ? answer.outcome.optionId : 'none';
  }

  /** {@link choose}, resolving true only for allow; any other answer closes the tool call as not confirmed. */
  async confirm(state, prompt) {
    const agreed = await this.choose(state, prompt) === 'allow';
    if (!agreed) this.update(state, { sessionUpdate: 'tool_call_update', toolCallId: prompt.toolCallId, status: 'failed', content: [{ type: 'content', content: { type: 'text', text: 'Not confirmed. Nothing was changed or spent.' } }] });
    return agreed;
  }

  async ask(state, question) {
    if (!state.workItem) return this.tell(state, 'This workbench session has no Work Item in Ploeg, so there is nothing to ask about. Use `/steer` to message its agent.');
    if (question.length > 2000) return this.tell(state, 'Ask one question of at most 2000 characters.');
    const id = state.workItem.id;
    const path = `/api/ploeg/work-items/${id}/asks`;
    try { return this.answered(state, await this.unfold.post(path, { question, recordOnly: true })); }
    catch (error) { if (!(error instanceof UnfoldError) || error.code !== 'ask_needs_model') throw error; }
    const allowance = (await this.unfold.get(path)).allowance;
    if (!allowance?.asksEnabled) return this.tell(state, 'The record does not answer this, and asking a model is not enabled for this Team. Nothing was asked or spent.');
    const message = `Ask a model about Work Item ${id}? One answer spends up to ${usd(allowance.askBudgetUsd)} from Team ${state.workItem.team}'s Ask Allowance (${usd(allowance.remainingUsd)} left until ${String(allowance.resetAt).slice(0, 10)}). Question: ${clip(question, 300)}`;
    const toolCallId = `unfold-ask-${randomUUID()}`;
    if (!await this.confirm(state, { toolCallId, title: `Ask a model about Work Item ${id}`, message, allow: `Spend up to ${usd(allowance.askBudgetUsd)}`, deny: 'Do not ask a model', kind: 'fetch' })) return this.tell(state, 'Not asked: you did not confirm the spend. Nothing was spent.');
    const ask = await this.unfold.post(path, { question, askModel: true }, confirmationFor(message));
    this.update(state, { sessionUpdate: 'tool_call_update', toolCallId, status: ask.status === 'answered' ? 'completed' : 'failed' });
    return this.answered(state, ask);
  }

  answered(state, ask) {
    const cost = ask.demo ? 'demo, no model call, nothing spent' : ask.source === 'record' ? 'answered from the record, free' : ask.costUsd === null || ask.costUsd === undefined ? 'cost not known yet' : `${usd(ask.costUsd)} from the Ask Allowance${ask.costStatus === 'settled' ? '' : ', not final yet'}`;
    if (ask.status === 'answered') return this.tell(state, `${ask.answer}${ask.cutOff ? '\n\n*The model stopped at its length limit, so this answer may be cut off.*' : ''}\n\n*Ask · not sent to the team · ${cost}*`);
    this.tell(state, `Not answered. ${ask.failure ?? 'The question could not be answered.'}${ask.retryable ? ' Asking again may help.' : ''}\n\n*${cost}*`);
  }

  async steer(state, text, signal) {
    if (text.length > 16000) return this.tell(state, 'A message is at most 16000 characters.');
    if (state.workItem && !state.workbench) state.workbench = await this.workbenchFor(state.workItem.id);
    if (state.workbench) {
      const session = await this.unfold.get(`/api/sessions/${state.workbench.id}`);
      if (session.ownerId !== this.me.id) return this.tell(state, `Only the person who runs workbench session ${quoted(session.title)} can steer it. ${this.unfold.sessionLink(session.id)}`);
      const message = `${this.me.demo ? 'Illustrative demo: nothing real changes. ' : ''}Send this message to the agent in session ${quoted(session.title || session.objective)}? The agent acts on it and may spend from the session's budget; ${usd(session.spentUsd)} of its ${usd(session.budgetUsd)} is used. Message: ${clip(text, 300)}`;
      const toolCallId = `unfold-steer-${randomUUID()}`;
      if (!await this.confirm(state, { toolCallId, title: 'Message the session\'s agent', message, allow: 'Send it', deny: 'Do not send' })) return this.tell(state, 'Not sent: you did not confirm. Nothing was changed.');
      const result = await this.unfold.post(`/api/sessions/${session.id}/messages`, { text }, confirmationFor(message));
      this.update(state, { sessionUpdate: 'tool_call_update', toolCallId, status: 'completed' });
      this.tell(state, `Sent. The session is ${String(result.status ?? '').replaceAll('_', ' ')}.\n\n`);
      return this.watch(state, signal, false);
    }
    const detail = await this.unfold.get(`/api/ploeg/work-items/${state.workItem.id}`);
    const item = detail.item ?? {};
    if (['queued', 'leased', 'active'].includes(item.state)) {
      const open = (detail.shifts ?? []).find(shift => !shift.closedAt);
      if (text.length > 4096) return this.tell(state, 'A note is at most 4096 characters. Nothing was changed.');
      const message = `${detail.demo || this.me.demo ? 'Illustrative demo: nothing real changes. ' : ''}Leave this note on Work Item ${item.id} ${quoted(item.title)} for its next Run? The running Run does not see it, and the note costs nothing by itself. Note: ${clip(text, 300)}`;
      const toolCallId = `unfold-note-${randomUUID()}`;
      if (!await this.confirm(state, { toolCallId, title: 'Leave a note for the next Run', message, allow: 'Leave the note', deny: 'Do not leave it' })) return this.tell(state, 'No note left: you did not confirm. Nothing was changed.');
      const result = await this.unfold.post(`/api/ploeg/work-items/${item.id}/notes`, { commandId: `acp-${randomUUID()}`, text, ...(open?.id ? { expectedShiftId: String(open.id) } : {}) }, confirmationFor(message));
      this.update(state, { sessionUpdate: 'tool_call_update', toolCallId, status: 'completed' });
      return this.tell(state, result.demo ? 'This is the illustrative demo: the note was not stored.' : `Saved the note for Work Item ${item.id}'s next Run.`);
    }
    const why = item.state === 'needs_human' ? 'It waits for a person: answer its question, restart it or stop it in Unfold.'
      : item.state === 'proposed' ? 'It is a proposal: approve or reject it in Unfold first.'
      : item.state === 'awaiting_review' ? 'Its pull request waits for review in the forge.'
      : `It is ${stateWords[item.state] ?? item.state}.`;
    this.tell(state, `Nothing runs Work Item ${item.id} now, so there is no session to steer. ${why} ${this.unfold.workItemLink(item.id)}`);
  }

  async watch(state, signal, replay) {
    if (state.workItem && !state.workbench) state.workbench = await this.workbenchFor(state.workItem.id);
    if (!state.workbench) return this.tell(state, `No workbench session runs Work Item ${state.workItem?.id ?? ''} now. Its Runs and their logs are in Unfold: ${state.workItem ? this.unfold.workItemLink(state.workItem.id) : this.unfold.base}`);
    const id = state.workbench.id;
    const translator = new FeedTranslator();
    const history = await this.unfold.get(`/api/sessions/${id}/history?after=0`);
    const events = Array.isArray(history) ? history : [];
    let cursor = events.at(-1)?.id ?? 0;
    for (const event of replay ? events.slice(-30) : []) for (const update of translator.updates(event)) this.update(state, update);
    while (!signal.aborted) {
      const page = await this.unfold.get(`/api/sessions/${id}/history?after=${cursor}`);
      for (const event of Array.isArray(page) ? page : []) {
        cursor = Math.max(cursor, Number(event.id) || 0);
        for (const update of translator.updates(event)) this.update(state, update);
      }
      const session = await this.unfold.get(`/api/sessions/${id}`);
      if (session.status === 'waiting_input' && await this.relayPermissions(state, session, signal) === 'unanswered') return;
      if (finished.has(session.status)) { this.tell(state, `\n\n${session.status === 'exporting' ? 'The agents are done, and Unfold is preparing the result for review.' : `The session is ${String(session.status).replaceAll('_', ' ')}.`} ${this.unfold.sessionLink(id)}`); return; }
      await delay(this.pollMs, undefined, { signal }).catch(() => {});
    }
  }

  /** Relays each tool permission the session waits on to the person, once, as an ACP prompt with allow and deny only. */
  async relayPermissions(state, session, signal) {
    const requests = await this.unfold.get(`/api/sessions/${session.id}/permissions`);
    for (const request of (Array.isArray(requests) ? requests : []).filter(entry => !entry.resolved && !state.relayed.has(entry.id))) {
      if (signal.aborted) return;
      state.relayed.add(request.id);
      if (request.kind === 'question') { this.tell(state, `\n\nThe agent asks a question (its own words): ${quoted(request.title)}. Answer it in Unfold: ${this.unfold.sessionLink(session.id)}\n`); continue; }
      if (session.ownerId !== this.me.id) { this.tell(state, `\n\nThe agent waits for its session's owner to allow ${quoted(request.title)}.\n`); continue; }
      const message = `The agent in session ${quoted(session.title)} asks to use: ${clip(request.title, 300)}${request.detail ? `\n\n${clip(request.detail, 1500)}` : ''}\n\nThe agent wrote this request; Unfold did not check it. Allow runs it this once; Deny refuses it.`;
      const toolCallId = `unfold-permission-${request.id}`;
      const choice = await this.choose(state, { toolCallId, title: clip(`Permission: ${request.title}`, 200), message, allow: 'Allow once', deny: 'Deny' });
      if (choice === 'none') {
        state.relayed.delete(request.id);
        this.update(state, { sessionUpdate: 'tool_call_update', toolCallId, status: 'failed', content: [{ type: 'content', content: { type: 'text', text: 'Not answered. The request still waits in Unfold.' } }] });
        if (signal.aborted) return;
        this.tell(state, `\n\nNot answered; the request still waits. Answer it here with \`/watch\`, or in Unfold: ${this.unfold.sessionLink(session.id)}\n`);
        return 'unanswered';
      }
      await this.unfold.post(`/api/sessions/${session.id}/permissions/${request.id}`, { decision: choice === 'allow' ? 'once' : 'reject' }, confirmationFor(message));
      this.update(state, { sessionUpdate: 'tool_call_update', toolCallId, status: choice === 'allow' ? 'completed' : 'failed', content: [{ type: 'content', content: { type: 'text', text: choice === 'allow' ? 'Allowed once.' : 'Denied.' } }] });
      this.update(state, { sessionUpdate: 'tool_call_update', toolCallId, status: 'completed' });
    }
  }

  async propose(state, brief) {
    if (!brief) return this.tell(state, 'Describe the work after `/propose`, as you would in a ticket.');
    this.tell(state, [
      '**Draft proposal** (nothing was admitted and nothing runs):',
      '',
      `> ${clip(brief, 2000)}`,
      '',
      'Unfold cannot record a proposed Work Item from an editor yet: Ploeg offers consumers an admission that queues work, and a delegation from an editor must wait for a person, never start a Run. Until Ploeg offers a proposal admission, put this in your tracker and hand it to a Team from Unfold\'s Tasks page, where the Team\'s approval rules apply.',
      `${this.unfold.base}/#tasks`,
    ].join('\n'));
  }
}
