#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, renameSync, openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { addedLines, attribute, remember, traceRecord, writtenText } from './agent-trace.mjs';

const unfoldUrl = (process.env.UNFOLD_URL ?? '').trim().replace(/\/+$/, '');
const token = (process.env.UNFOLD_TOKEN ?? '').trim();
const timeoutMs = Number(process.env.UNFOLD_HOOK_TIMEOUT_MS) || 3000;
const waitingKinds = new Set(['permission_prompt', 'idle_prompt', 'elicitation_dialog', 'agent_needs_input']);
const editingTools = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

function stateDir() {
  const base = process.env.CLAUDE_PLUGIN_DATA || join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'unfold-claude-code');
  const dir = join(base, 'sessions');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function loadState(sessionId) {
  try { return JSON.parse(readFileSync(join(stateDir(), `${sessionId}.json`), 'utf8')); } catch { return { written: {}, head: '', link: '', workItems: [], model: '', harnessVersion: '' }; }
}

function saveState(sessionId, state) {
  const file = join(stateDir(), `${sessionId}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}

function git(cwd, args, input) {
  try { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 2000, maxBuffer: 16 * 1024 * 1024, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'], ...(input === undefined ? {} : { input }) }).trim(); } catch { return ''; }
}

function harnessVersion(transcriptPath) {
  if (!transcriptPath) return '';
  let fd;
  try {
    fd = openSync(transcriptPath, 'r');
    const size = fstatSync(fd).size;
    const length = Math.min(size, 65_536);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    return [...buffer.toString('utf8').matchAll(/"version":"(\d+\.\d+\.\d+[\w.-]*)"/g)].at(-1)?.[1] ?? '';
  } catch { return ''; } finally { if (fd !== undefined) closeSync(fd); }
}

async function post(path, body) {
  const response = await fetch(`${unfoldUrl}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-unfold-request': '1', 'x-unfold-client': 'claude-code-plugin' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Unfold answered ${response.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

function repository(cwd) {
  const top = git(cwd, ['rev-parse', '--show-toplevel']);
  if (!top) return null;
  return { top, branch: git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']), remote: git(cwd, ['remote', 'get-url', 'origin']), head: git(cwd, ['rev-parse', 'HEAD']) };
}

function remoteUrl() {
  const bridge = process.env.CLAUDE_CODE_BRIDGE_SESSION_ID ?? '';
  return /^session_[A-Za-z0-9_-]{8,120}$/.test(bridge) ? `https://claude.ai/code/${bridge}` : '';
}

async function report(input, state, event, extra = {}) {
  const repo = repository(input.cwd ?? process.cwd());
  const answer = await post('/api/linked-sessions/events', {
    harness: 'claude-code', sessionId: input.session_id, event, harnessVersion: state.harnessVersion, model: state.model,
    repository: repo?.remote ?? '', branch: repo && repo.branch !== 'HEAD' ? repo.branch : '', remoteUrl: remoteUrl(),
    ...(process.env.UNFOLD_WORK_ITEM ? { workItem: process.env.UNFOLD_WORK_ITEM } : {}), ...extra,
  });
  if (answer.session) { state.link = answer.session.link; state.workItems = answer.session.workItems.map(item => ({ id: item.id, url: `${unfoldUrl}/#work/${encodeURIComponent(item.id)}` })); }
  return { answer, repo };
}

async function commits(input, state) {
  const cwd = input.cwd ?? process.cwd();
  const repo = repository(cwd);
  if (!repo?.head || repo.head === state.head) return;
  const fresh = state.head ? git(cwd, ['rev-list', '--max-count=10', `${state.head}..${repo.head}`]).split('\n').filter(Boolean).reverse() : [repo.head];
  state.head = repo.head;
  for (const sha of fresh) {
    const message = git(cwd, ['show', '-s', '--format=%B', sha]);
    await report(input, state, 'commit', { commit: { sha, subject: message.split('\n')[0].slice(0, 200), trailer: /^Unfold-Session: /m.test(message) } });
    const files = attribute(addedLines(git(cwd, ['show', '--format=', '--unified=0', '--no-color', '--no-renames', '--no-ext-diff', sha])), state.written);
    const record = traceRecord({ revision: sha, timestamp: git(cwd, ['show', '-s', '--format=%cI', sha]) || new Date().toISOString(), files, sessionId: input.session_id, sessionUrl: state.link || `${unfoldUrl}/#linked-session/${encodeURIComponent(input.session_id)}`, remoteUrl: remoteUrl(), model: state.model, harnessVersion: state.harnessVersion, workItems: state.workItems });
    if (!record) continue;
    git(cwd, ['notes', '--ref=agent-trace', 'add', '-f', '-F', '-', sha], `${JSON.stringify(record)}\n`);
    await post(`/api/linked-sessions/${encodeURIComponent(input.session_id)}/traces`, record);
  }
}

function pullRequests(input) {
  const command = String(input.tool_input?.command ?? '');
  if (!/\bpr\s+create\b|\/pulls\b|\bpull-request\b/.test(command)) return [];
  return [...new Set(JSON.stringify(input.tool_response ?? '').match(/https:\/\/[^\s"'\\]+\/pulls?\/\d+/g) ?? [])].slice(0, 5);
}

async function handle(input) {
  const state = loadState(input.session_id);
  const output = {};
  switch (input.hook_event_name) {
    case 'SessionStart': {
      state.model = String(input.model ?? state.model ?? '');
      state.harnessVersion = harnessVersion(input.transcript_path) || state.harnessVersion;
      const { answer, repo } = await report(input, state, 'start', input.session_title ? { title: input.session_title } : {});
      if (repo?.head && !state.head) state.head = repo.head;
      const hookSpecificOutput = { hookEventName: 'SessionStart', additionalContext: String(answer.context ?? '') };
      if (answer.suggestedTitle && !input.session_title && ['startup', 'resume', 'fork'].includes(input.source)) hookSpecificOutput.sessionTitle = answer.suggestedTitle;
      output.hookSpecificOutput = hookSpecificOutput;
      break;
    }
    case 'UserPromptSubmit': await report(input, state, 'prompt'); break;
    case 'Notification': if (waitingKinds.has(input.notification_type)) await report(input, state, 'waiting', { waitingFor: input.notification_type }); break;
    case 'Stop': await commits(input, state); await report(input, state, 'idle'); break;
    case 'SessionEnd': await commits(input, state); await report(input, state, 'end'); break;
    case 'PostToolUse': {
      if (editingTools.has(input.tool_name)) {
        const repo = repository(input.cwd ?? process.cwd());
        const file = String(input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? '');
        if (repo && file) {
          const path = relative(repo.top, isAbsolute(file) ? file : join(input.cwd ?? process.cwd(), file));
          if (!path.startsWith('..')) remember(state.written, path.split('\\').join('/'), writtenText(input.tool_name, input.tool_input));
        }
      } else if (input.tool_name === 'Bash') {
        await commits(input, state);
        const found = pullRequests(input);
        if (found.length) await report(input, state, 'prompt', { pullRequests: found });
      }
      break;
    }
    default: break;
  }
  saveState(input.session_id, state);
  return output;
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let input;
  try { input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return; }
  if (!input || typeof input.session_id !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(input.session_id)) return;
  if (!unfoldUrl || !token) return;
  try {
    const output = await handle(input);
    if (Object.keys(output).length) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    if (process.env.UNFOLD_HOOK_DEBUG) process.stderr.write(`unfold: ${error.message}\n`);
  }
}

await main();
process.exitCode = 0;
