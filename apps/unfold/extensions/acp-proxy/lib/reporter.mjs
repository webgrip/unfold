import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import { addedLines, attribute, mainAgent, remember, traceRecord } from '../../claude-code/scripts/agent-trace.mjs';

/** How much the reporter keeps: sessions per proxy, tool calls per session, reports waiting to be sent, repositories per session. */
export const reporterLimits = { sessions: 50, toolCalls: 500, queued: 500, repositories: 20 };
const outputBytes = 16 * 1024 * 1024;

/** The Linked Session id of an ACP session: `acp-` and its id when that fits Unfold's id pattern, else `acp-` and a hash of it. */
export function linkedSessionId(acpSessionId) {
  return /^[A-Za-z0-9_-]{4,124}$/.test(acpSessionId) ? `acp-${acpSessionId}` : `acp-${createHash('sha256').update(acpSessionId).digest('hex').slice(0, 40)}`;
}

/** The lines an ACP diff adds: the lines of `newText` that `oldText` does not hold, or all of them for a new file. */
export function addedText(oldText, newText) {
  const before = new Set(typeof oldText === 'string' ? oldText.split('\n').map(line => line.trim()) : []);
  return String(newText ?? '').split('\n').filter(line => !before.has(line.trim())).join('\n');
}

/** Runs git without a shell, for at most two seconds; answers its trimmed output, or an empty string when it fails. */
export function git(cwd, args, input) {
  return new Promise(resolve => {
    let child;
    try { child = spawn('git', ['-C', cwd, ...args], { stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'], timeout: 2000, windowsHide: true }); } catch { resolve(''); return; }
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { if (out.length < outputBytes) out += chunk; });
    child.on('error', () => resolve(''));
    child.on('close', code => resolve(code === 0 ? out.trim() : ''));
    if (input !== undefined) { child.stdin.on('error', () => {}); child.stdin.end(input); }
  });
}

async function repository(cwd) {
  if (!cwd) return null;
  const top = await git(cwd, ['rev-parse', '--show-toplevel']);
  if (!top) return null;
  const [branch, remote, head] = await Promise.all([git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']), git(cwd, ['remote', 'get-url', 'origin']), git(cwd, ['rev-parse', 'HEAD'])]);
  return { top, branch, remote, head };
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

/**
 * Reports ACP sessions to Unfold's `POST /api/linked-sessions/events` as harness `acp`, and Agent Trace records for
 * their commits. Every method returns at once and never throws: reports go out in order on one queue, each bounded
 * by `timeoutMs`, and a failure is dropped (and printed when `debug` is set). It sends ids, the agent's name and
 * version, the repository, branch and commit subjects; never prompt text, tool output or file contents.
 */
export class UnfoldReporter {
  /** @param {{ url: string, token: string, timeoutMs?: number, workItem?: string, debug?: boolean }} options */
  constructor({ url, token, timeoutMs = 3000, workItem = '', debug = false }) {
    this.url = url.replace(/\/+$/, '');
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.workItem = workItem;
    this.debug = debug;
    this.info = { name: '', title: '', version: '' };
    this.sessions = new Map();
    this.chain = Promise.resolve();
    this.queued = 0;
  }

  log(text) { if (this.debug) process.stderr.write(`unfold-acp: ${text}\n`); }

  enqueue(task) {
    if (this.queued >= reporterLimits.queued) { this.log('too many reports wait; dropping one'); return; }
    this.queued += 1;
    this.chain = this.chain.then(task).catch(error => this.log(error?.message ?? String(error))).finally(() => { this.queued -= 1; });
  }

  /** The agent's `agentInfo` from `initialize`. */
  agent(info) { this.info = info; }

  /** A session that `session/new`, `session/fork`, `session/load` or `session/resume` started, in `cwd`. */
  start(acpSessionId, cwd, model) {
    let state = this.sessions.get(acpSessionId);
    if (!state) {
      state = { id: linkedSessionId(acpSessionId), cwd: '', model: '', link: '', workItems: [], repos: {}, toolCalls: new Map(), ended: false };
      this.sessions.set(acpSessionId, state);
      if (this.sessions.size > reporterLimits.sessions) this.sessions.delete(this.sessions.keys().next().value);
    }
    state.cwd = cwd && isAbsolute(cwd) ? cwd : state.cwd;
    state.model = model || state.model;
    state.ended = false;
    this.enqueue(async () => {
      const repo = await repository(state.cwd);
      if (repo) await this.tracked(state, repo.top);
      await this.report(state, 'start', { title: this.title(state.cwd) });
    });
  }

  /** The editor sent a prompt: the session works. */
  prompt(acpSessionId) { this.event(acpSessionId, 'prompt'); }

  /** The agent asks the person for a permission. */
  waiting(acpSessionId) { this.event(acpSessionId, 'waiting', { waitingFor: 'permission_prompt' }); }

  /** The person granted or refused a permission, and the turn goes on. */
  answered(acpSessionId) { this.event(acpSessionId, 'prompt'); }

  /** The model the editor picked with `session/set_model`. */
  model(acpSessionId, model) { const state = this.sessions.get(acpSessionId); if (state) state.model = model; }

  /** A `tool_call` or `tool_call_update`: its diffs are kept, and once it completes their added lines are remembered for Agent Trace. */
  toolCall(acpSessionId, update) {
    const state = this.sessions.get(acpSessionId);
    if (!state || typeof update.toolCallId !== 'string') return;
    let call = state.toolCalls.get(update.toolCallId);
    if (!call) {
      call = { diffs: [], done: false };
      state.toolCalls.set(update.toolCallId, call);
      if (state.toolCalls.size > reporterLimits.toolCalls) state.toolCalls.delete(state.toolCalls.keys().next().value);
    }
    if (Array.isArray(update.content)) call.diffs = update.content.filter(entry => entry && entry.type === 'diff' && typeof entry.path === 'string' && typeof entry.newText === 'string').map(entry => ({ path: entry.path, text: addedText(entry.oldText, entry.newText) }));
    if (update.status === 'failed') { call.diffs = []; return; }
    if (update.status !== 'completed' || call.done) return;
    call.done = true;
    const diffs = call.diffs;
    call.diffs = [];
    if (diffs.length) this.enqueue(() => this.rememberEdits(state, diffs));
  }

  /** The prompt turn ended with `stopReason`: report new commits, then that the session is idle. */
  idle(acpSessionId, _stopReason) {
    const state = this.sessions.get(acpSessionId);
    if (!state) return;
    this.enqueue(async () => { await this.commits(state); await this.report(state, 'idle'); });
  }

  /** The agent exited: report each session's new commits and its end, and resolve once every report is sent or dropped. */
  close() {
    for (const state of this.sessions.values()) {
      if (state.ended) continue;
      state.ended = true;
      this.enqueue(async () => { await this.commits(state); await this.report(state, 'end'); });
    }
    return this.chain;
  }

  event(acpSessionId, event, extra = {}) {
    const state = this.sessions.get(acpSessionId);
    if (state) this.enqueue(() => this.report(state, event, extra));
  }

  title(cwd) {
    const agent = this.info.title || this.info.name || 'ACP agent';
    return cwd ? `${agent} · ${basename(cwd)}` : agent;
  }

  async post(path, body) {
    const response = await fetch(`${this.url}${path}`, { method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json', 'x-unfold-request': '1', 'x-unfold-client': 'unfold-acp' }, body: JSON.stringify(body), signal: AbortSignal.timeout(this.timeoutMs) });
    const text = await response.text();
    if (!response.ok) throw new Error(`Unfold answered ${response.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : {};
  }

  async report(state, event, extra = {}) {
    const repo = await repository(state.cwd);
    const answer = await this.post('/api/linked-sessions/events', {
      harness: 'acp', sessionId: state.id, event, harnessVersion: this.info.version, model: state.model,
      repository: repo?.remote ?? '', branch: repo && repo.branch !== 'HEAD' ? repo.branch : '',
      ...(this.workItem ? { workItem: this.workItem } : {}), ...extra,
    });
    if (answer.session) { state.link = String(answer.session.link ?? ''); state.workItems = (answer.session.workItems ?? []).map(item => ({ id: String(item.id), url: `${this.url}/#work/${encodeURIComponent(item.id)}` })); }
  }

  async tracked(state, top) {
    if (!state.repos[top] && Object.keys(state.repos).length < reporterLimits.repositories) state.repos[top] = { written: {}, head: await git(top, ['rev-parse', 'HEAD']) };
    return state.repos[top];
  }

  async rememberEdits(state, diffs) {
    for (const diff of diffs) {
      const file = isAbsolute(diff.path) ? diff.path : state.cwd ? join(state.cwd, diff.path) : '';
      if (!file) continue;
      let folder = dirname(file);
      while (!(await exists(folder)) && dirname(folder) !== folder) folder = dirname(folder);
      const top = await git(folder, ['rev-parse', '--show-toplevel']);
      if (!top) continue;
      const path = relative(top, join(await realpath(folder), relative(folder, file)));
      const repo = await this.tracked(state, top);
      if (repo && !path.startsWith('..')) remember(repo.written, path.split('\\').join('/'), diff.text, mainAgent);
    }
  }

  async commits(state) {
    for (const top of Object.keys(state.repos)) {
      const repo = state.repos[top];
      const head = await git(top, ['rev-parse', 'HEAD']);
      if (!head || head === repo.head) continue;
      const fresh = repo.head ? (await git(top, ['rev-list', '--max-count=10', `${repo.head}..${head}`])).split('\n').filter(Boolean).reverse() : [head];
      repo.head = head;
      for (const sha of fresh) {
        const message = await git(top, ['show', '-s', '--format=%B', sha]);
        await this.report(state, 'commit', { commit: { sha, subject: message.split('\n')[0].slice(0, 200), trailer: /^Unfold-Session: /m.test(message) } });
        const files = attribute(addedLines(await git(top, ['show', '--format=', '--unified=0', '--no-color', '--no-renames', '--no-ext-diff', sha])), repo.written);
        const record = traceRecord({ revision: sha, timestamp: (await git(top, ['show', '-s', '--format=%cI', sha])) || new Date().toISOString(), files, sessionId: state.id, sessionUrl: state.link || `${this.url}/#linked-session/${encodeURIComponent(state.id)}`, model: state.model, harnessVersion: this.info.version, workItems: state.workItems, toolName: (this.info.name || 'acp-agent').slice(0, 100), harness: 'acp' });
        if (!record) { this.log(`commit ${sha.slice(0, 12)} reported without Agent Trace: none of its lines matches an edit the agent completed in this session`); continue; }
        await git(top, ['notes', '--ref=agent-trace', 'add', '-f', '-F', '-', sha], `${JSON.stringify(record)}\n`);
        await this.post(`/api/linked-sessions/${encodeURIComponent(state.id)}/traces`, record);
      }
    }
  }
}
