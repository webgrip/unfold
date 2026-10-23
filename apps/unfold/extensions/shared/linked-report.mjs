import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { addedLines, attribute, mainAgent, remember, traceRecord } from '../claude-code/scripts/agent-trace.mjs';

/** The session ids Unfold accepts from a harness. */
export const sessionIdPattern = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Where and how a reporter reaches Unfold, from `UNFOLD_URL`, `UNFOLD_TOKEN`, `UNFOLD_HOOK_TIMEOUT_MS`,
 * `UNFOLD_WORK_ITEM` and `UNFOLD_HOOK_DEBUG`; null when the address or token is missing, so nothing is sent.
 */
export function reporterSettings(env = process.env) {
  const url = String(env.UNFOLD_URL ?? '').trim().replace(/\/+$/, '');
  const token = String(env.UNFOLD_TOKEN ?? '').trim();
  if (!url || !token) return null;
  return { url, token, timeoutMs: Number(env.UNFOLD_HOOK_TIMEOUT_MS) || 3000, workItem: String(env.UNFOLD_WORK_ITEM ?? '').trim(), debug: Boolean(env.UNFOLD_HOOK_DEBUG), stateHome: env.XDG_STATE_HOME || join(homedir(), '.local', 'state') };
}

/** Runs git in `cwd` with a short timeout and answers its trimmed output, or an empty string when git fails. */
export function git(cwd, args, input) {
  return new Promise(resolve => {
    const child = execFile('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 2000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => resolve(error ? '' : String(stdout).trim()));
    child.on('error', () => resolve(''));
    if (input === undefined) child.stdin?.end(); else child.stdin?.end(input);
  });
}

/** The repository `cwd` is in: its top folder, branch, origin address and head, or null outside git. */
export async function repository(cwd) {
  const top = await git(cwd, ['rev-parse', '--show-toplevel']);
  if (!top) return null;
  const [branch, remote, head] = await Promise.all([git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']), git(cwd, ['remote', 'get-url', 'origin']), git(cwd, ['rev-parse', 'HEAD'])]);
  return { top, branch, remote, head };
}

/** The pull request addresses a shell command that opens one printed, read locally; only these addresses are ever sent. */
export function pullRequestUrls(command, output) {
  if (!/\bpr\s+create\b|\/pulls\b|\bpull-request\b/.test(String(command ?? ''))) return [];
  const text = typeof output === 'string' ? output : JSON.stringify(output ?? '');
  return [...new Set(text.match(/https:\/\/[^\s"'\\]+\/pulls?\/\d+/g) ?? [])].slice(0, 5);
}

/**
 * The files and added text of a patch in the `*** Begin Patch` format Codex's and OpenCode's `apply_patch` tools take:
 * each `*** Add File:` or `*** Update File:` (followed by an optional `*** Move to:`) with its `+` lines.
 */
export function patchWrites(patch) {
  const writes = [];
  let current = null;
  for (const line of String(patch ?? '').split('\n')) {
    const header = /^\*\*\* (Add|Update) File: (.+)$/.exec(line);
    if (header) { current = { path: header[2].trim(), lines: [] }; writes.push(current); continue; }
    const moved = /^\*\*\* Move to: (.+)$/.exec(line);
    if (moved && current) { current.path = moved[1].trim(); continue; }
    if (/^\*\*\* /.test(line)) { current = null; continue; }
    if (current && line.startsWith('+')) current.lines.push(line.slice(1));
  }
  return writes.filter(entry => entry.path).map(entry => ({ path: entry.path, text: entry.lines.join('\n') }));
}

async function exists(path) { try { await stat(path); return true; } catch { return false; } }

/**
 * Reports one harness's sessions to Unfold the way the Claude Code plugin does: lifecycle events, commits and their
 * Agent Trace records. It keeps a small state file per session under `$XDG_STATE_HOME/<stateName>/sessions`, sends only
 * ids, names and fingerprints, and never sends prompts, tool output or file contents.
 */
export class LinkedReporter {
  constructor({ harness, client, stateName, settings }) {
    this.harness = harness;
    this.client = client;
    this.settings = settings;
    this.dir = join(settings.stateHome, stateName, 'sessions');
  }

  /** The stored state of one session, or a fresh one. */
  async load(sessionId) {
    try { const state = JSON.parse(await readFile(join(this.dir, `${sessionId}.json`), 'utf8')); state.repos ??= {}; state.workItems ??= []; return state; }
    catch { return { link: '', workItems: [], model: '', harnessVersion: '', status: '', repos: {} }; }
  }

  /** Stores the state of one session, readable only by its owner. */
  async save(sessionId, state) {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const file = join(this.dir, `${sessionId}.json`);
    await writeFile(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 });
    await rename(`${file}.tmp`, file);
  }

  /** Sends one JSON body to Unfold within the timeout and answers the parsed reply. */
  async post(path, body, timeoutMs = this.settings.timeoutMs) {
    const response = await fetch(`${this.settings.url}${path}`, { method: 'POST', headers: { authorization: `Bearer ${this.settings.token}`, 'content-type': 'application/json', 'x-unfold-request': '1', 'x-unfold-client': this.client }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    const text = await response.text();
    if (!response.ok) throw new Error(`Unfold answered ${response.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : {};
  }

  /** Reports one event for a session working in `cwd`, with its repository, branch, model and version, and remembers the Work Items Unfold links. */
  async report(sessionId, cwd, state, event, extra = {}, timeoutMs) {
    const repo = cwd ? await repository(cwd) : null;
    const answer = await this.post('/api/linked-sessions/events', {
      harness: this.harness, sessionId, event, harnessVersion: state.harnessVersion, model: state.model,
      repository: repo?.remote ?? '', branch: repo && repo.branch !== 'HEAD' ? repo.branch : '',
      ...(this.settings.workItem ? { workItem: this.settings.workItem } : {}), ...extra,
    }, timeoutMs);
    if (answer.session) { state.link = answer.session.link; state.workItems = (answer.session.workItems ?? []).map(item => ({ id: item.id, url: `${this.settings.url}/#work/${encodeURIComponent(item.id)}` })); }
    if (repo) await this.track(state, repo.top);
    state.status = event === 'prompt' ? 'working' : event === 'commit' ? state.status : event;
    return { answer, repo };
  }

  async track(state, top) {
    state.repos[top] ??= { written: {}, head: await git(top, ['rev-parse', 'HEAD']) };
    return state.repos[top];
  }

  /** Remembers the fingerprints of the lines an agent wrote to `file`, so a later commit can be attributed; nothing is sent. */
  async rememberWrite(state, cwd, file, text, agent = mainAgent) {
    if (!file || !text) return;
    const full = isAbsolute(file) ? file : join(cwd, file);
    let folder = dirname(full);
    while (folder && !(await exists(folder)) && dirname(folder) !== folder) folder = dirname(folder);
    const top = folder ? await git(folder, ['rev-parse', '--show-toplevel']) : '';
    if (!top) return;
    const path = relative(top, join(await realpath(folder), relative(folder, full)));
    if (path.startsWith('..')) return;
    remember((await this.track(state, top)).written, path.split('\\').join('/'), text, agent);
  }

  /** Reports the commits made since the last look in every repository the session touched, each with its Agent Trace record and git note. */
  async commits(sessionId, cwd, state) {
    const here = cwd ? await repository(cwd) : null;
    if (here) await this.track(state, here.top);
    for (const top of Object.keys(state.repos).slice(0, 20)) {
      const repo = state.repos[top];
      const head = await git(top, ['rev-parse', 'HEAD']);
      if (!head || head === repo.head) continue;
      const fresh = repo.head ? (await git(top, ['rev-list', '--max-count=10', `${repo.head}..${head}`])).split('\n').filter(Boolean).reverse() : [head];
      repo.head = head;
      for (const sha of fresh) {
        const message = await git(top, ['show', '-s', '--format=%B', sha]);
        await this.report(sessionId, top, state, 'commit', { commit: { sha, subject: message.split('\n')[0].slice(0, 200), trailer: /^Unfold-Session: /m.test(message) } });
        const files = attribute(addedLines(await git(top, ['show', '--format=', '--unified=0', '--no-color', '--no-renames', '--no-ext-diff', sha])), repo.written);
        const record = traceRecord({ revision: sha, timestamp: (await git(top, ['show', '-s', '--format=%cI', sha])) || new Date().toISOString(), files, sessionId, sessionUrl: state.link || `${this.settings.url}/#linked-session/${encodeURIComponent(sessionId)}`, model: state.model, harnessVersion: state.harnessVersion, harness: this.harness, workItems: state.workItems });
        if (!record) continue;
        await git(top, ['notes', '--ref=agent-trace', 'add', '-f', '-F', '-', sha], `${JSON.stringify(record)}\n`);
        await this.post(`/api/linked-sessions/${encodeURIComponent(sessionId)}/traces`, record);
      }
    }
  }
}
