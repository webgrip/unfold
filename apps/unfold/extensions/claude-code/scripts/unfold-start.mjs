#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const unfoldUrl = (process.env.UNFOLD_URL ?? '').trim().replace(/\/+$/, '');
const token = (process.env.UNFOLD_TOKEN ?? '').trim();
const claude = process.env.UNFOLD_CLAUDE_BIN || 'claude';
const dispatchTimeoutMs = Number(process.env.UNFOLD_DISPATCH_TIMEOUT_MS) || 180_000;

/** The Work Item id an argument names: `184`, `#184` or an Unfold link ending in `#work/184`. */
export function workItemArgument(value) {
  const text = String(value ?? '').trim();
  const match = /(?:^#?|#work\/)([1-9][0-9]{0,18})$/.exec(text);
  return match ? match[1] : '';
}

/** The owner and name a git remote names, lower-cased: `webgrip/unfold` for `git@host:webgrip/unfold.git`. */
export function remoteName(remote) {
  const path = String(remote ?? '').trim().replace(/^[a-z+]+:\/\/[^/]+\//i, '').replace(/^[^/:@]+@[^:]+:/, '').replace(/\.git$/, '').replace(/\/+$/, '');
  const parts = path.split('/').filter(Boolean);
  return parts.length >= 2 ? `${parts.at(-2)}/${parts.at(-1)}`.toLowerCase() : '';
}

/** The session id in the last line `claude -p … --output-format json` prints for an environment dispatch. */
export function dispatchedSession(output) {
  const line = String(output ?? '').trim().split('\n').at(-1) ?? '';
  let result;
  try { result = JSON.parse(line); } catch { throw new Error('Claude Code printed no dispatch result.'); }
  if (!result?.ok || typeof result.session_id !== 'string' || !result.session_id) throw new Error(`Claude Code refused the dispatch: ${String(result?.error ?? 'no reason given').slice(0, 300)}`);
  return result.session_id;
}

/** What a claim sends: the id of the Claude Code session that runs `/unfold:start`, so Unfold links it and never warns that it collides with the Run it started. Nothing else about the session. */
export function claimBody(sessionId) {
  const id = String(sessionId ?? '').trim();
  return /^[A-Za-z0-9_-]{8,128}$/.test(id) ? { linkedSession: id } : {};
}

async function call(path, init = {}) {
  const response = await fetch(`${unfoldUrl}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'x-unfold-request': '1', 'x-unfold-client': 'claude-code-plugin', ...(init.body ? { 'content-type': 'application/json' } : {}) }, signal: AbortSignal.timeout(15_000) });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) throw new Error(data?.error?.message || `Unfold answered ${response.status}.`);
  return data;
}

function say(text) { process.stdout.write(`${text}\n`); }

async function main() {
  const id = workItemArgument(process.argv[2]);
  if (!id) { say('Name the Work Item: /unfold:start 184, or paste its Unfold link.'); return 2; }
  if (!unfoldUrl || !token) { say('Set UNFOLD_URL and UNFOLD_TOKEN in ~/.claude/settings.json first; see Settings › Agent sessions in Unfold.'); return 2; }
  const { item } = await call(`/api/ploeg/work-items/${id}`);
  if (!item?.waitingForClient) { say(`No Run of Work Item ${id} waits for your Claude Code.`); return 1; }
  const wanted = item.target ? `${item.target.owner}/${item.target.repo}`.toLowerCase() : '';
  let remote = '';
  try { remote = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { remote = ''; }
  if (!wanted || remoteName(remote) !== wanted) { say(`Run /unfold:start in a clone of ${wanted || 'the Work Item\'s repository'}; this directory's origin is ${remote || 'not a git remote'}. Nothing was claimed.`); return 1; }
  const claimed = await call(`/api/ploeg/work-items/${id}/claim`, { method: 'POST', body: JSON.stringify(claimBody(process.env.CLAUDE_CODE_SESSION_ID)) });
  const { run, dispatch, deadline } = claimed;
  say(`Claimed Run ${run.id} (${run.role}, round ${run.round}) of Work Item ${id}. Dispatching it to the Team's Claude environment with your own Claude login…`);
  let session;
  try {
    const output = execFileSync(claude, ['-p', dispatch.prompt, '--environment', dispatch.environmentId, '--ref', dispatch.ref, '--output-format', 'json'], { encoding: 'utf8', timeout: dispatchTimeoutMs, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    session = dispatchedSession(output);
  } catch (error) {
    say(`The dispatch failed: ${String(error?.message ?? error).split('\n')[0].slice(0, 300)}`);
    say(`The Run stays claimed until ${deadline} and then lapses; run /unfold:start ${id} again after that.`);
    return 1;
  }
  await call(`/api/ploeg/work-items/${id}/claude-session`, { method: 'POST', body: JSON.stringify({ runId: run.id, sessionId: session }) });
  const web = /^session_[A-Za-z0-9_-]+$/.test(session) ? ` Follow it at https://claude.ai/code/${session}.` : '';
  say(`Started: session ${session} runs Work Item ${id} on branch ${dispatch.branch} in the Team's environment, on your Claude seat.${web} Ploeg settles the Run when the session ends; you may close this machine. Unfold: ${unfoldUrl}/#work/${id}`);
  return 0;
}

let invoked = '';
try { invoked = pathToFileURL(realpathSync(process.argv[1] ?? '')).href; } catch { invoked = ''; }
if (invoked === import.meta.url) {
  main().then(code => { process.exitCode = code; }, error => { say(String(error?.message ?? error).slice(0, 500)); process.exitCode = 1; });
}
