import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { RpcError, rpcCodes } from './jsonrpc.mjs';
import { FeedTranslator, TranscriptTranslator, runPlan, say } from './feed.mjs';
import { Unfold, UnfoldError, confirmationFor } from './unfold.mjs';
import { formAnswers, handOffRequest, pullRequestOf, questionForm, resumeOffer, spentOf, waitingQuestions, workItemOfSession, workSessionId } from './work.mjs';

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
  { name: 'watch', description: 'Follow the Work Item\'s Runs, or its session, until it waits for you or its pull request is ready' },
  { name: 'answer', description: 'Answer the question the Work Item waits on. Asks you to confirm first, naming what restarting it spends', input: { hint: 'your answer' } },
  { name: 'handoff', description: 'Hand a tracker task to a Team. Asks you to confirm first', input: { hint: '<source>/<task> to <team>' } },
  { name: 'propose', description: 'Draft a proposed Work Item for a person to approve. Never starts a Run', input: { hint: 'what should be done' } },
];

const modes = [
  { id: 'ask', name: 'Ask', description: 'A message is a question about the Work Item. The team never reads it.' },
  { id: 'steer', name: 'Steer', description: 'A message goes to the Work Item\'s session, after you confirm.' },
];

const stateWords = { ingested: 'being taken in', proposed: 'proposed, waits for approval', queued: 'queued', active: 'running', leased: 'running', needs_human: 'needs you', awaiting_review: 'waits for review', stale: 'stale', done: 'done', withdrawn: 'withdrawn' };
const finished = new Set(['completed', 'failed', 'cancelled', 'paused', 'interrupted', 'exporting']);
const settledStates = new Set(['awaiting_review', 'done', 'withdrawn', 'stale', 'proposed']);
const absolute = path => typeof path === 'string' && (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path));
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
 * session, its Runs or its workbench session stream back as a plan, agent messages and tool calls, its spend as
 * `usage_update`, and a tool permission the Run's harness asks for reaches the person as an ACP permission prompt with
 * allow and deny only. A question the work waits on arrives as an ACP form elicitation when the client offers one.
 * `session/list` offers the Work Items the person handed off or that wait for them; `session/resume` follows one.
 * Anything that spends or changes work asks the person first; a delegation from the editor never starts a Run.
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
      case 'session/list': return this.listSessions(params);
      case 'session/resume': return this.resumeSession(params);
      case 'session/close': return this.closeSession(params);
      case 'session/prompt': return this.prompt(params);
      case 'session/cancel': this.cancel(params); return null;
      case 'session/set_mode': return this.setMode(params);
      case 'session/set_config_option': return this.setConfigOption(params);
      default: throw new RpcError(rpcCodes.methodNotFound, `unfold does not support ${method}.`);
    }
  }

  initialize(params) {
    this.client = params?.clientInfo ?? null;
    const form = params?.clientCapabilities?.elicitation?.form;
    this.elicitsForms = Boolean(form && typeof form === 'object');
    return {
      protocolVersion,
      agentCapabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcpCapabilities: { http: false, sse: false }, sessionCapabilities: { list: {}, resume: {}, close: {} } },
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
    if (!absolute(params?.cwd)) throw new RpcError(rpcCodes.invalidParams, 'cwd must be an absolute path.');
    await this.signedIn();
    const state = this.open(`unfold-${randomUUID()}`, params.cwd);
    const wanted = reference(params?._meta?.unfold?.workItem ?? this.defaultWorkItem);
    if (wanted) await this.bind(state, wanted, false).catch(() => {});
    return { sessionId: state.id, ...await this.opened(state) };
  }

  open(id, cwd) {
    const state = { id, cwd, mode: 'ask', workItem: null, workbench: null, handoff: null, turn: null, greeted: false, relayed: new Set(), answered: new Set(), waiting: [], ready: false, usage: null, reportedCost: null };
    this.sessions.set(id, state);
    return state;
  }

  async opened(state) {
    const answer = { modes: { availableModes: modes, currentModeId: state.mode }, configOptions: await this.configOptions(state) };
    setImmediate(() => {
      state.ready = true;
      this.update(state, { sessionUpdate: 'available_commands_update', availableCommands: commands });
      if (state.usage) this.update(state, state.usage);
    });
    return answer;
  }

  /**
   * `session/list`: the Work Items the person handed off, from any channel Unfold records (the Tasks page, `unfold-mcp`,
   * an editor, a linked Claude Code session) or approved, and those that wait for them, newest first. Each is an ACP
   * session `session/resume` follows. A Work Item belongs to no folder, so every one is listed under the asked `cwd`.
   */
  async listSessions(params) {
    await this.signedIn();
    if (params?.cwd !== undefined && params.cwd !== null && !absolute(params.cwd)) throw new RpcError(rpcCodes.invalidParams, 'cwd must be an absolute path.');
    if (params?.cursor) return { sessions: [] };
    const cwd = absolute(params?.cwd) ? params.cwd : process.cwd();
    const items = await this.followable();
    return {
      sessions: items.map(item => ({
        sessionId: workSessionId(item.id),
        cwd,
        title: clip(`#${item.id} ${stateWords[item.state] ?? item.state ?? ''} · ${item.title || 'Work Item'}`, 160),
        updatedAt: item.updatedAt || null,
        _meta: { unfold: { workItem: item.id, state: item.state, team: item.team, waitsForYou: item.waitsForYou, handedOff: item.handedOff, pullRequestUrl: item.pullRequestUrl || null, link: this.unfold.workItemLink(item.id) } },
      })),
    };
  }

  async followable() {
    const found = new Map();
    const merge = (id, fields) => {
      const key = String(id);
      if (!/^[1-9][0-9]{0,18}$/.test(key)) return;
      const known = found.get(key) ?? { id: key, title: '', state: '', team: '', updatedAt: '', pullRequestUrl: '', waitsForYou: false, handedOff: false };
      for (const [name, value] of Object.entries(fields)) if (value !== undefined && value !== null && value !== '' && value !== false) known[name] = value;
      found.set(key, known);
    };
    const [now, actions] = await Promise.all([this.unfold.get('/api/ploeg/now').catch(() => null), this.unfold.get('/api/actions?outcome=done&limit=200').catch(() => null)]);
    for (const item of now?.waiting ?? []) merge(item.id, { title: String(item.title ?? ''), state: String(item.state ?? ''), team: String(item.team ?? ''), updatedAt: String(item.updatedAt ?? ''), pullRequestUrl: pullRequestOf(item), waitsForYou: true });
    const tasks = new Map();
    for (const record of Array.isArray(actions?.actions) ? actions.actions : []) {
      const action = String(record?.action ?? '');
      if (!/^POST \S+\/(?:handoff|approve)$/.test(action)) continue;
      if (record.target?.kind === 'task' && action.endsWith('/handoff')) {
        const [source, ...rest] = String(record.target.id).split(':');
        const task = rest.join(':');
        if (/^[a-z0-9-]{1,64}$/.test(source) && /^[A-Za-z0-9_-]{1,128}$/.test(task) && !tasks.has(`${source}:${task}`)) tasks.set(`${source}:${task}`, { source, task, team: String(record.inputs?.team ?? '') });
      }
      if (record.target?.kind === 'work-item') merge(record.target.id, { handedOff: true });
    }
    const statuses = await Promise.all([...tasks.values()].slice(0, 20).map(ref => this.unfold.get(`/api/task-sources/${encodeURIComponent(ref.source)}/tasks/${encodeURIComponent(ref.task)}/ploeg`).then(status => ({ ref, status }), () => null)));
    for (const entry of statuses) {
      for (const item of Array.isArray(entry?.status?.workItems) ? entry.status.workItems : []) {
        if (entry.ref.team && String(item.team) !== entry.ref.team) continue;
        merge(item.id, { state: String(item.state ?? ''), team: String(item.team ?? ''), updatedAt: String(item.updatedAt ?? ''), pullRequestUrl: pullRequestOf(item), handedOff: true });
      }
    }
    const untitled = [...found.values()].filter(item => !item.title).slice(0, 25);
    await Promise.all(untitled.map(item => this.unfold.get(`/api/ploeg/work-items/${item.id}`).then(detail => {
      const fresh = detail?.item ?? {};
      merge(item.id, { title: String(fresh.title ?? ''), state: String(fresh.state ?? ''), team: String(fresh.team ?? ''), updatedAt: String(fresh.updatedAt ?? ''), pullRequestUrl: pullRequestOf(fresh) });
    }, () => {})));
    return [...found.values()].filter(item => item.title || item.state).sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt))).slice(0, 50);
  }

  /** `session/resume`: follows the Work Item a `session/list` entry names, or picks up a session this agent still holds. */
  async resumeSession(params) {
    if (!absolute(params?.cwd)) throw new RpcError(rpcCodes.invalidParams, 'cwd must be an absolute path.');
    await this.signedIn();
    const known = this.sessions.get(params?.sessionId);
    if (known) {
      known.cwd = params.cwd;
      return this.opened(known);
    }
    const workItem = workItemOfSession(params?.sessionId);
    if (!workItem) throw new RpcError(rpcCodes.invalidParams, 'Unknown session. Resume one that session/list offers.');
    const state = this.open(String(params.sessionId), params.cwd);
    try { await this.bind(state, { kind: 'work', id: workItem }, false); }
    catch (error) {
      this.sessions.delete(state.id);
      throw new RpcError(error instanceof UnfoldError && error.status === 404 ? rpcCodes.invalidParams : rpcCodes.internal, error instanceof Error ? error.message : String(error));
    }
    return this.opened(state);
  }

  closeSession(params) {
    const state = this.session(params);
    state.turn?.abort();
    this.sessions.delete(state.id);
    return {};
  }

  /**
   * Reports what the followed work spent so far as an ACP `usage_update`: the Work Item's Shifts, or a workbench session
   * without a Work Item. Unfold's chat holds no model context of its own, so `used` and `size` are 0. Nothing is reported
   * for the demo, which spends nothing, and nothing when the amount has not changed.
   */
  reportUsage(state, spentUsd, demo) {
    if (demo || typeof spentUsd !== 'number' || !Number.isFinite(spentUsd) || spentUsd < 0) return;
    const amount = Math.round(spentUsd * 1e6) / 1e6;
    if (state.reportedCost === amount) return;
    state.reportedCost = amount;
    const of = state.workItem ? { workItem: state.workItem.id } : { session: state.workbench?.id ?? '' };
    state.usage = { sessionUpdate: 'usage_update', used: 0, size: 0, cost: { amount, currency: 'USD' }, _meta: { unfold: { ...of, contextWindow: false } } };
    if (state.ready) this.update(state, state.usage);
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
    if (command === 'handoff') return this.handOff(state, rest);
    const spoken = command ? null : /^hand[\s-]?off\s+(.+\sto\s.+)$/i.exec(rest);
    if (spoken) return this.handOff(state, spoken[1]);
    if (command === 'help' || command && !commands.some(entry => entry.name === command)) return this.help(state);
    if (!state.workItem && !state.workbench) {
      if (command === 'watch' && state.handoff) return this.watch(state, signal, true);
      const wanted = command ? null : reference(rest);
      if (wanted) return this.bind(state, wanted, true);
      return this.listNow(state, true);
    }
    if (command === 'watch') return this.watch(state, signal, true);
    if (command === 'answer') return this.answer(state, rest, signal);
    const intent = command || state.mode;
    if (!rest) return this.tell(state, intent === 'steer' ? 'Write the message after `/steer`.' : 'Write your question after `/ask`.');
    if (intent === 'steer') return this.steer(state, rest, signal);
    return this.ask(state, rest);
  }

  help(state) {
    this.tell(state, ['Commands:', ...commands.map(entry => `- \`/${entry.name}\`${entry.input ? ` *${entry.input.hint}*` : ''}: ${entry.description}.`), '', 'In Ask mode a message is a question about the Work Item; in Steer mode it goes to its session. "hand off board/42 to shop" hands a tracker task to a Team, as `/handoff` does.'].join('\n'));
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
    state.reportedCost = null;
    state.usage = null;
    state.handoff = null;
    if (wanted.kind === 'session') {
      const session = await this.unfold.get(`/api/sessions/${wanted.id}`);
      state.workbench = { id: String(session.id), ownerId: String(session.ownerId ?? ''), title: String(session.title ?? '') };
      const workItemId = session.execution?.workItemId ? String(session.execution.workItemId) : '';
      const detail = workItemId ? await this.unfold.get(`/api/ploeg/work-items/${workItemId}`) : null;
      state.workItem = detail ? this.itemOf(detail, workItemId) : null;
      this.reportUsage(state, detail ? spentOf(detail) : Number(session.spentUsd), Boolean(this.me.demo || detail?.demo));
      this.update(state, { sessionUpdate: 'session_info_update', title: clip(`Unfold · ${session.title || session.objective || session.id}`, 120) });
      if (announce) this.tell(state, `Following your workbench session ${quoted(session.title || session.objective)}, now ${String(session.status).replaceAll('_', ' ')}${state.workItem ? `, for Work Item #${state.workItem.id}` : ''}. ${this.unfold.sessionLink(session.id)}\n\nUse \`/watch\` to stream it, \`/steer\` to message its agent${state.workItem ? ' and `/ask` to ask about the Work Item' : ''}.`);
      return;
    }
    const detail = await this.unfold.get(`/api/ploeg/work-items/${wanted.id}`);
    state.workItem = this.itemOf(detail, wanted.id);
    state.workbench = await this.workbenchFor(state.workItem.id);
    this.reportUsage(state, spentOf(detail), Boolean(this.me.demo || detail.demo));
    this.update(state, { sessionUpdate: 'session_info_update', title: clip(`Unfold · #${state.workItem.id} ${state.workItem.title}`, 120), ...(detail.item?.updatedAt ? { updatedAt: String(detail.item.updatedAt) } : {}) });
    if (announce) {
      this.tell(state, this.summary(detail, state));
      this.update(state, { sessionUpdate: 'config_option_update', configOptions: await this.configOptions(state) });
    }
  }

  itemOf(detail, id) {
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
    if (!state.workItem && !state.workbench && state.handoff && !await this.awaitPickUp(state, signal)) return;
    if (state.workItem && !state.workbench) state.workbench = await this.workbenchFor(state.workItem.id);
    if (!state.workbench) return state.workItem ? this.followWorkItem(state, signal) : this.tell(state, `Nothing to follow yet. ${this.unfold.base}`);
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
      if (!state.workItem) this.reportUsage(state, Number(session.spentUsd), Boolean(this.me.demo));
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
      if (request.kind === 'question') {
        const questions = (Array.isArray(request.questions) ? request.questions : []).slice(0, 20);
        if (!this.elicitsForms || session.ownerId !== this.me.id || !questions.length) { this.tell(state, `\n\nThe agent asks a question (its own words): ${quoted(request.title)}. Answer it in Unfold: ${this.unfold.sessionLink(session.id)}\n`); continue; }
        const message = `The agent in session ${quoted(session.title)} asks you (its own words, not checked by Unfold): ${clip(request.title, 300)}${request.detail ? `\n\n${clip(request.detail, 1500)}` : ''}\n\nSubmitting sends your answers to the agent. Closing this form leaves the question waiting in Unfold.`;
        const reply = await this.elicit(state, message, questionForm(questions));
        const answers = reply?.action === 'accept' ? formAnswers(questions, reply.content) : null;
        if (!answers) {
          state.relayed.delete(request.id);
          if (signal.aborted) return;
          this.tell(state, `\n\nNot answered; the question still waits. Answer it here with \`/watch\`, or in Unfold: ${this.unfold.sessionLink(session.id)}\n`);
          return 'unanswered';
        }
        await this.unfold.post(`/api/sessions/${session.id}/permissions/${request.id}`, { answers }, confirmationFor(message));
        this.tell(state, '\n\nAnswer sent to the agent.\n\n');
        continue;
      }
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
    }
  }

  /** Asks the person for structured input through an ACP form elicitation tied to the session. Null when the client failed to answer. */
  async elicit(state, message, requestedSchema) {
    try { return await this.connection.request('elicitation/create', { sessionId: state.id, mode: 'form', message, requestedSchema }); }
    catch { return null; }
  }

  /**
   * Follows a Work Item that Ploeg runs: each poll sends its Runs as the session's plan, streams the transcript of each
   * running Run, reports its spend, and stops when it waits for the person, its pull request is ready or it settled. A
   * question it waits on is asked in the editor; an answer restarts or resumes it, so the following goes on.
   */
  async followWorkItem(state, signal) {
    const id = state.workItem.id;
    const translator = new TranscriptTranslator();
    const cursors = new Map();
    let plan = '';
    let seen = '';
    while (!signal.aborted) {
      const detail = await this.unfold.get(`/api/ploeg/work-items/${id}`);
      const item = detail.item ?? {};
      const demo = Boolean(detail.demo || this.me.demo);
      state.workItem = this.itemOf(detail, id);
      this.reportUsage(state, spentOf(detail), demo);
      const entries = runPlan(detail.runs);
      if (entries.length && JSON.stringify(entries) !== plan) { plan = JSON.stringify(entries); this.update(state, { sessionUpdate: 'plan', entries }); }
      for (const run of Array.isArray(detail.runs) ? detail.runs : []) if (!signal.aborted) await this.streamRun(state, id, run, cursors, translator);
      if (signal.aborted) return;
      if (item.state !== seen) {
        if (!settledStates.has(item.state) && item.state !== 'needs_human') this.tell(state, seen ? `*Work Item #${id} is ${stateWords[item.state] ?? item.state} now.*\n\n` : `*Following Work Item #${id} ${quoted(item.title)}, ${stateWords[item.state] ?? item.state}. Its Runs show as the plan.*\n\n`);
        seen = item.state;
      }
      if (item.state === 'needs_human') { if (await this.askQuestions(state, detail, signal) !== 'answered') return; }
      else if (settledStates.has(item.state)) return this.settled(state, detail, demo);
      await delay(this.pollMs, undefined, { signal }).catch(() => {});
    }
  }

  async streamRun(state, workItemId, run, cursors, translator) {
    const runId = String(run?.id ?? '');
    if (!/^[1-9][0-9]{0,18}$/.test(runId)) return;
    let cursor = cursors.get(runId);
    if (!cursor) {
      if (run.state !== 'running') return;
      cursor = { after: 0, done: false, fresh: true };
      cursors.set(runId, cursor);
    }
    if (cursor.done) return;
    let tail = [];
    for (let page = 0; page < 20; page += 1) {
      let read;
      try { read = await this.unfold.get(`/api/ploeg/work-items/${workItemId}/runs/${runId}/transcript?after=${cursor.after}`); }
      catch { cursor.done = true; break; }
      if (!read?.available) { cursor.done = true; break; }
      const entries = Array.isArray(read.entries) ? read.entries : [];
      cursor.after = Number(read.nextAfter) || cursor.after;
      if (cursor.fresh) tail = [...tail, ...entries].slice(-30);
      else for (const entry of entries) for (const update of translator.updates(runId, entry)) this.update(state, update);
      if (!read.hasMore) { if (read.complete && run.state === 'finished') cursor.done = true; break; }
    }
    if (cursor.fresh) {
      cursor.fresh = false;
      if (tail.length) this.tell(state, `\n\n**Round ${Number(run.round) || 1} · ${clip(run.role || 'Run', 80)}** is running.\n\n`);
      for (const entry of tail) for (const update of translator.updates(runId, entry)) this.update(state, update);
    }
  }

  settled(state, detail, demo) {
    const item = detail.item ?? {};
    const id = String(item.id ?? state.workItem.id);
    const shifts = Array.isArray(detail.shifts) ? detail.shifts : [];
    const money = demo ? 'Illustrative demo: nothing ran and nothing was spent.' : `Spent ${usd(spentOf(detail))} over ${shifts.length} ${shifts.length === 1 ? 'Shift' : 'Shifts'}.`;
    const pullRequest = pullRequestOf(item);
    const link = this.unfold.workItemLink(id);
    if (item.state === 'awaiting_review') return this.tell(state, [`**The pull request for Work Item #${id} is ready for your review:** ${pullRequest || 'see the Work Item in Unfold.'}`, '', `${quoted(item.title)}, Team ${clip(item.team, 60)}. ${money}`, 'Review it in the forge, then merge it or request changes there; the Team picks up review comments. Unfold has no accept or request-changes action of its own.', `In Unfold: ${link}`].join('\n'));
    if (item.state === 'done') return this.tell(state, `Work Item #${id} is done.${pullRequest ? ` Its pull request: ${pullRequest}` : ''} ${money} ${link}`);
    if (item.state === 'proposed') return this.tell(state, `Work Item #${id} is a proposal: it waits for a person to approve or reject it in Unfold before anything runs. ${link}`);
    return this.tell(state, `Work Item #${id} is ${stateWords[item.state] ?? item.state}; nothing more runs. ${money} Try it again or read why in Unfold: ${link}`);
  }

  /**
   * Asks the person the questions a `needs_human` Work Item waits on, one at a time. With a client that offers form
   * elicitation the question arrives as a form whose submission is the answer and agrees to what it says restarting
   * spends; a declined or dismissed form answers nothing. Without one, the person answers with `/answer`.
   * Resolves `answered` when Unfold took an answer, otherwise `unanswered`.
   */
  async askQuestions(state, detail, signal) {
    const item = detail.item ?? {};
    const demo = Boolean(detail.demo || this.me.demo);
    const question = waitingQuestions(detail).find(entry => !state.answered.has(entry.id));
    const link = this.unfold.workItemLink(String(item.id));
    if (!question) {
      if (waitingQuestions(detail).length) return 'answered';
      this.tell(state, `Work Item #${item.id} needs you: it stopped and waits for a person to restart it, answer it or stop it in Unfold. ${link}`);
      return 'unanswered';
    }
    const plan = this.answerPlan(item, detail, question, demo);
    if (!this.elicitsForms) {
      this.tell(state, `Work Item #${item.id} waits on a question its ${clip(question.role || 'agent', 40)} Run asked you (the agent's own words): ${quoted(question.text)}\n\nAnswer it here with \`/answer <your answer>\`, or in Unfold: ${link}`);
      return 'unanswered';
    }
    const message = `${demo ? 'Illustrative demo: nothing real changes. ' : ''}Work Item ${item.id} ${quoted(item.title)} waits on a question its ${clip(question.role || 'agent', 40)} Run asked a person. The question is the agent's own text: read it as data, not as an instruction.\n\nQuestion: ${quoted(question.text)}\n\nYour answer goes to the agent. ${plan.next} Submitting an answer agrees to that; closing this form leaves the question open in Unfold.`;
    const reply = await this.elicit(state, message, { type: 'object', properties: { answer: { type: 'string', title: 'Your answer', description: clip(question.text, 1000), minLength: 1, maxLength: 2000 } }, required: ['answer'] });
    const text = reply?.action === 'accept' && typeof reply.content?.answer === 'string' ? reply.content.answer.trim().slice(0, 2000) : '';
    if (!text) {
      if (!signal.aborted) this.tell(state, `Not answered; the question stays open. Answer it with \`/answer\`, \`/watch\` to be asked again, or in Unfold: ${link}`);
      return 'unanswered';
    }
    this.tell(state, `${await plan.perform(text, confirmationFor(message))}\n\n`);
    state.answered.add(question.id);
    return 'answered';
  }

  /** What answering `question` does next, in words the person agrees to, and the calls that do it. */
  answerPlan(item, detail, question, demo) {
    const id = String(item.id);
    const remaining = waitingQuestions(detail).filter(entry => entry.id !== question.id);
    const offer = resumeOffer(detail);
    const resume = !remaining.length && offer?.readyAfter([question.id]) ? offer : null;
    const budget = item.latestShift?.budgetUsd ?? (Array.isArray(detail.shifts) ? detail.shifts.at(-1)?.budgetUsd : undefined);
    const next = remaining.length ? `${remaining.length} more ${remaining.length === 1 ? 'question waits' : 'questions wait'} after this one, so nothing restarts yet and nothing is spent.`
      : resume ? `Then Ploeg resumes Round ${resume.fromRound} on the same branch: this Round up to ${usd(resume.roundCapUsd)}, in total up to ${usd(resume.poolUsd)}, from Team ${item.team}'s budget.`
      : `Then Ploeg starts it over, spending from Team ${item.team}'s budget${typeof budget === 'number' ? `, up to ${usd(budget)} like the last attempt` : ''}.`;
    return { next, perform: async (text, confirmation) => {
      const nonce = randomUUID();
      try { await this.unfold.post(`/api/ploeg/work-items/${id}/questions/${encodeURIComponent(question.id)}/answer`, { commandId: `acp-${nonce}-answer`, answer: text }, confirmation); }
      catch (error) { if (!/already answered/i.test(error instanceof Error ? error.message : '')) throw error; }
      const illustrative = demo ? ' This is the illustrative demo: nothing real changed.' : '';
      if (remaining.length) return `Answered. ${remaining.length} more ${remaining.length === 1 ? 'question waits' : 'questions wait'}.${illustrative}`;
      const result = await this.unfold.post(`/api/ploeg/work-items/${id}/requeue`, { commandId: `acp-${nonce}`, expectedState: item.state, ...(resume ? { resume: true } : {}) }, confirmation);
      return `Answered and ${result.resumed ? 'resumed' : 'restarted'} Work Item ${id} from Round ${result.fromRound ?? 1}; it is ${stateWords[result.state] ?? result.state ?? 'queued'}.${illustrative}`;
    } };
  }

  /** `/answer`: answers the oldest question the Work Item waits on, after the person allows what it spends. */
  async answer(state, text, signal) {
    if (!state.workItem) return this.tell(state, 'This session follows no Work Item. Pick one with `/work <id>`.');
    if (!text) return this.tell(state, 'Write your answer after `/answer`.');
    if (text.length > 2000) return this.tell(state, 'An answer is at most 2000 characters. Nothing was sent.');
    const detail = await this.unfold.get(`/api/ploeg/work-items/${state.workItem.id}`);
    const item = detail.item ?? {};
    const question = waitingQuestions(detail)[0];
    if (!question) return this.tell(state, `Work Item ${item.id} waits on no question for a person. Nothing was sent. ${this.unfold.workItemLink(String(item.id))}`);
    const demo = Boolean(detail.demo || this.me.demo);
    const plan = this.answerPlan(item, detail, question, demo);
    const message = `${demo ? 'Illustrative demo: nothing real changes. ' : ''}Answer the question on Work Item ${item.id} ${quoted(item.title)}? Question (the agent's own words): ${clip(question.text, 300)}\n\n${plan.next} Answer: ${clip(text, 300)}`;
    const toolCallId = `unfold-answer-${randomUUID()}`;
    if (!await this.confirm(state, { toolCallId, title: `Answer the question on Work Item ${item.id}`, message, allow: 'Send the answer', deny: 'Do not send' })) return this.tell(state, 'Not answered: you did not confirm. Nothing was changed or spent.');
    const said = await plan.perform(text, confirmationFor(message));
    state.answered.add(question.id);
    this.update(state, { sessionUpdate: 'tool_call_update', toolCallId, status: 'completed' });
    this.tell(state, `${said}\n\n`);
    return this.followWorkItem(state, signal);
  }

  /**
   * Hands a tracker task to a Team through Unfold's confirmed hand-off, as Unfold's Tasks page and `unfold_hand_off` do:
   * Unfold assigns the Team's tracker user and comments on the task, after the person allows it in the editor. The
   * session then waits for Ploeg to pick the task up with `/watch`.
   */
  async handOff(state, text) {
    const wanted = handOffRequest(text);
    if (!wanted) return this.tell(state, 'Name the task and the Team: `/handoff board/42 to shop`, or "hand off board/42 to shop".');
    let source = wanted.source;
    if (!source) {
      const sources = await this.unfold.get('/api/task-sources').catch(() => []);
      const usable = (Array.isArray(sources) ? sources : []).filter(entry => entry?.handoff !== false);
      if (usable.length !== 1) return this.tell(state, `Name the task with its source, such as \`${usable[0]?.id ?? 'board'}/${wanted.task}\`.${usable.length ? ` Your task sources: ${usable.map(entry => entry.id).join(', ')}.` : ''}`);
      source = String(usable[0].id);
    }
    const path = `/api/task-sources/${encodeURIComponent(source)}/tasks/${encodeURIComponent(wanted.task)}`;
    const [found, status] = await Promise.all([this.unfold.get(path), this.unfold.get(`${path}/ploeg?refresh=1`)]);
    const team = wanted.team;
    if (status.handoff?.allowed !== true) return this.tell(state, `${clip(status.handoff?.reason ?? status.message ?? 'This task cannot be handed to Ploeg.', 300)} Nothing was changed.`);
    if ((status.assignedTeams ?? []).includes(team)) return this.tell(state, `Team ${team} already holds this task. Nothing was changed.`);
    const offered = (status.teams ?? []).find(entry => entry.id === team);
    if (!offered) return this.tell(state, `Team ${team} is not one you can hand this task to; choose one of ${(status.teams ?? []).map(entry => entry.id).join(', ') || 'none'}. Nothing was changed.`);
    const baseline = (status.workItems ?? []).map(entry => String(entry.id)).filter(id => /^[1-9][0-9]{0,18}$/.test(id)).map(BigInt).reduce((top, id) => id > top ? id : top, 0n);
    const demo = Boolean(status.demo || this.me.demo);
    const message = `${demo ? 'Illustrative demo: nothing real changes. ' : ''}Hand task ${source}/${wanted.task} ${quoted(found.title)} to Team ${team}? Unfold assigns the Team's tracker user ${clip(offered.assignee, 80)} to the task and comments that you handed it over. Ploeg then picks it up, and its Runs spend from Team ${team}'s budget.`;
    const toolCallId = `unfold-handoff-${randomUUID()}`;
    if (!await this.confirm(state, { toolCallId, title: `Hand task ${source}/${wanted.task} to Team ${team}`, message, allow: 'Hand it off', deny: 'Do not hand it off' })) return this.tell(state, 'Not handed off: you did not confirm. Nothing was changed.');
    const result = await this.unfold.post(`${path}/handoff`, { team, revision: found.revision }, confirmationFor(message));
    this.update(state, { sessionUpdate: 'tool_call_update', toolCallId, status: 'completed' });
    const warnings = (Array.isArray(result?.warnings) ? result.warnings : []).map(entry => clip(entry, 300)).join(' ');
    state.workItem = null;
    state.workbench = null;
    state.handoff = { source, task: wanted.task, team, baseline, title: String(found.title ?? '') };
    this.update(state, { sessionUpdate: 'session_info_update', title: clip(`Unfold · ${source}/${wanted.task} → ${team}`, 120) });
    this.tell(state, `Handed task ${source}/${wanted.task} to Team ${team}.${warnings ? ` ${warnings}` : ''}${demo ? ' This is the illustrative demo: nothing real changed.' : ''} Ploeg picks it up when it next reads the tracker. Follow it here with \`/watch\`, or in Unfold: ${this.unfold.base}/#tasks`);
  }

  /** Waits until Ploeg holds a new Work Item for the handed-off task, then follows it. False when the wait ended without one. */
  async awaitPickUp(state, signal) {
    const ref = state.handoff;
    const path = `/api/task-sources/${encodeURIComponent(ref.source)}/tasks/${encodeURIComponent(ref.task)}/ploeg`;
    let told = false;
    while (!signal.aborted) {
      const status = await this.unfold.get(`${path}?refresh=1`);
      const picked = (Array.isArray(status.workItems) ? status.workItems : []).filter(entry => String(entry.team) === ref.team && /^[1-9][0-9]{0,18}$/.test(String(entry.id)) && BigInt(entry.id) > ref.baseline).sort((left, right) => BigInt(left.id) < BigInt(right.id) ? -1 : 1)[0];
      if (picked) {
        await this.bind(state, { kind: 'work', id: String(picked.id) }, false);
        this.tell(state, `Ploeg picked up task ${ref.source}/${ref.task} as Work Item #${picked.id} for Team ${ref.team}. ${this.unfold.workItemLink(String(picked.id))}\n\n`);
        return true;
      }
      if (!(status.assignedTeams ?? []).includes(ref.team)) { this.tell(state, `The task is no longer assigned to Team ${ref.team} and Ploeg never picked it up, so nothing ran and nothing was spent. ${this.unfold.base}/#tasks`); state.handoff = null; return false; }
      if (!told) { this.tell(state, `Waiting for Ploeg to pick up task ${ref.source}/${ref.task} for Team ${ref.team}…\n\n`); told = true; }
      await delay(this.pollMs, undefined, { signal }).catch(() => {});
    }
    return false;
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
