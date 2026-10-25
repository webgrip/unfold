import { openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, sep } from 'node:path';

/** The bounds of a reported permission prompt: summary and detail lengths, and the wait in seconds (default, least, most). */
export const permissionBounds = { summary: 200, detail: 120, defaultWaitSeconds: 120, minWaitSeconds: 10, maxWaitSeconds: 300, defaultPollMs: 2000, minPollMs: 500 };
const programsWithSubcommands = new Set(['git', 'npm', 'npx', 'pnpm', 'yarn', 'bun', 'deno', 'node', 'docker', 'podman', 'kubectl', 'helm', 'gh', 'glab', 'tea', 'mise', 'cargo', 'go', 'pip', 'uv', 'terraform', 'tofu', 'systemctl', 'brew', 'apt', 'make', 'sudo']);
const transcriptTail = 524_288;

/**
 * Text that is safe to send: control characters removed, credentials in URLs, `sk-` keys, bearer, basic and token
 * values, `key=value` secrets and long strings that mix letters and digits masked, on one line and at most `max` characters.
 */
export function redact(value, max) {
  return masked(String(value ?? '').replace(/[\0-\x1f\x7f]/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Text with the secrets {@link redact} masks replaced by `[redacted]`, its lines and spacing kept. */
export function masked(value) {
  return String(value ?? '')
    .replace(/:\/\/[^\s/@]+@/g, '://[redacted]@')
    .replace(/\bsk-[\w-]+/g, '[redacted]')
    .replace(/\b(vle_|ghp_|gho_|github_pat_|glpat-|xox[abp]-)[\w-]+/g, '[redacted]')
    .replace(/\b(Bearer|Basic|token)\s+\S+/gi, '$1 [redacted]')
    .replace(/\b(token|password|passwd|secret|key|authorization|api[-_]?key)=[^\s&]+/gi, '$1=[redacted]')
    .replace(/[A-Za-z0-9+_=-]{24,}/g, word => /\d/.test(word) && /[A-Za-z]/.test(word) ? '[redacted]' : word);
}

/**
 * The programs a shell command runs, such as `rm` or `git push`, without their arguments: the first word of each
 * part between `&&`, `||`, `;`, `|` and line breaks, after variable assignments, with the subcommand of a few
 * well-known tools. At most five; a word that does not look like a program name is left out.
 */
export function programs(command) {
  const found = [];
  for (const part of String(command ?? '').split(/&&|\|\||[;|\n]/)) {
    const words = part.trim().replace(/^[({]\s*/, '').split(/\s+/).map(word => word.replace(/[)}]+$/, '')).filter(Boolean);
    while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) words.shift();
    if (!words.length) continue;
    const program = words[0].split('/').at(-1);
    if (!/^[A-Za-z0-9._+-]{1,40}$/.test(program)) continue;
    const sub = programsWithSubcommands.has(program) && /^[a-z][a-z0-9-]{1,30}$/.test(words[1] ?? '') ? ` ${words[1]}` : '';
    const name = `${program}${sub}`;
    if (!found.includes(name)) found.push(name);
    if (found.length >= 5) break;
  }
  return found;
}

function shownPath(path, cwd) {
  const given = String(path ?? '');
  if (!given) return '';
  if (isAbsolute(given)) {
    const inside = cwd ? relative(cwd, given) : '';
    if (cwd && inside && !inside.startsWith('..') && !isAbsolute(inside)) return inside.split(sep).join('/');
    const home = homedir();
    if (given === home || given.startsWith(`${home}${sep}`)) return `~${given.slice(home.length).split(sep).join('/')}`;
  }
  return given.split(sep).join('/');
}

function host(url) { try { return new URL(String(url)).host; } catch { return ''; } }

/**
 * What the plugin tells Unfold about a waiting tool-permission prompt: the tool name, one short line and an optional
 * detail, all redacted. For a shell command that is the description Claude gave it and the programs it runs, never
 * the command; for a file tool the path relative to the session's folder; for a web fetch only the host. Never tool
 * input beyond that, and never file contents.
 * @param {{ tool_name?: string, tool_input?: Record<string, unknown>, cwd?: string }} input The PermissionRequest hook input.
 * @returns {{ tool: string, summary: string, detail: string }}
 */
export function permissionSummary(input) {
  const tool = /^[A-Za-z0-9_.:-]{1,80}$/.test(String(input?.tool_name ?? '')) ? String(input.tool_name) : 'unknown';
  const given = input?.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
  const cwd = typeof input?.cwd === 'string' ? input.cwd : '';
  let summary = '';
  let detail = '';
  if (tool === 'Bash') {
    summary = given.description ? String(given.description) : 'Run a shell command';
    const ran = programs(given.command);
    detail = ran.length ? `Runs ${ran.join(', ')}` : '';
  } else if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Read'].includes(tool)) {
    const verb = { Write: 'Write', Edit: 'Edit', MultiEdit: 'Edit', NotebookEdit: 'Edit the notebook', Read: 'Read' }[tool];
    const path = shownPath(given.file_path ?? given.notebook_path, cwd);
    summary = path ? `${verb} ${path}` : `${verb} a file`;
  } else if (tool === 'WebFetch') {
    const name = host(given.url);
    summary = name ? `Fetch a page from ${name}` : 'Fetch a web page';
  } else if (tool === 'WebSearch') {
    summary = 'Search the web';
  } else if (tool === 'Task' || tool === 'Agent') {
    summary = `Start a subagent${typeof given.subagent_type === 'string' && /^[\w.:-]{1,60}$/.test(given.subagent_type) ? ` (${given.subagent_type})` : ''}`;
  } else if (tool === 'ExitPlanMode') {
    summary = 'Leave plan mode and start working';
  } else if (tool.startsWith('mcp__')) {
    const [, server = '', name = ''] = tool.split('__');
    summary = name ? `Call ${name} on the MCP server ${server}` : `Call a tool on the MCP server ${server}`;
  } else {
    summary = `Use ${tool}`;
  }
  return { tool, summary: redact(summary, permissionBounds.summary), detail: redact(detail, permissionBounds.detail) };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

/**
 * Whether the person already answered this prompt in the terminal: the transcript's latest call of this tool with
 * this input has a result. Read locally from the end of the transcript; nothing is sent.
 */
export function answeredLocally(transcriptPath, toolName, toolInput) {
  if (!transcriptPath) return false;
  let fd;
  try {
    fd = openSync(transcriptPath, 'r');
    const size = fstatSync(fd).size;
    const length = Math.min(size, transcriptTail);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    const wanted = canonical(toolInput ?? {});
    let call = '';
    const results = new Set();
    for (const line of buffer.toString('utf8').split('\n')) {
      if (!line.includes('"tool_use') && !line.includes('"tool_result')) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      const content = Array.isArray(entry?.message?.content) ? entry.message.content : [];
      for (const part of content) {
        if (part?.type === 'tool_use' && part.name === toolName && canonical(part.input ?? {}) === wanted) call = String(part.id ?? '');
        if (part?.type === 'tool_result' && part.tool_use_id) results.add(String(part.tool_use_id));
      }
    }
    return Boolean(call) && results.has(call);
  } catch { return false; } finally { if (fd !== undefined) closeSync(fd); }
}

/** The wait and poll interval from `UNFOLD_REMOTE_APPROVAL_WAIT_S` and `UNFOLD_REMOTE_APPROVAL_POLL_MS`, clamped. */
export function waitSettings(env = process.env) {
  const asked = Number(env.UNFOLD_REMOTE_APPROVAL_WAIT_S);
  const poll = Number(env.UNFOLD_REMOTE_APPROVAL_POLL_MS);
  return {
    waitSeconds: Number.isFinite(asked) && asked > 0 ? Math.min(permissionBounds.maxWaitSeconds, Math.max(permissionBounds.minWaitSeconds, Math.round(asked))) : permissionBounds.defaultWaitSeconds,
    pollMs: Number.isFinite(poll) && poll > 0 ? Math.max(permissionBounds.minPollMs, Math.round(poll)) : permissionBounds.defaultPollMs,
  };
}

/** The PermissionRequest hook output for an answer given in Unfold. */
export function decisionOutput(collected) {
  if (collected?.decision === 'allow') return { systemMessage: 'Allowed from Unfold.', hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } };
  if (collected?.decision === 'deny') {
    const reason = redact(collected.reason ?? '', 500);
    return { systemMessage: 'Denied from Unfold.', hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: `The person denied this from Unfold.${reason ? ` They said: ${reason}` : ''}` } } };
  }
  return {};
}

/**
 * Reports a waiting prompt to Unfold and waits up to `waitSeconds` for its owner to answer it there. Claude Code shows
 * its own prompt in the terminal at the same time, and whichever answer comes first applies. The wait ends early when
 * the transcript shows the prompt was answered in the terminal, or `signal` aborts (Claude Code stops the hook when
 * the person declines); the request is then withdrawn. Answers the hook output, or `{}` for no decision.
 * @param {object} options
 * @param {object} options.input The PermissionRequest hook input.
 * @param {(path: string, body: object, timeoutMs?: number) => Promise<any>} options.post Sends to Unfold with the owner's editor credential.
 * @param {() => Promise<unknown>} options.reportWaiting Reports the session as waiting for a permission prompt.
 * @param {{ waitSeconds: number, pollMs: number }} options.settings
 * @param {AbortSignal} [options.signal]
 */
export async function awaitRemoteAnswer({ input, post, reportWaiting, settings, signal }) {
  const started = Date.now();
  const session = encodeURIComponent(input.session_id);
  await reportWaiting();
  const { request } = await post(`/api/linked-sessions/${session}/permissions`, { ...permissionSummary(input), waitSeconds: settings.waitSeconds });
  const base = `/api/linked-sessions/${session}/permissions/${encodeURIComponent(String(request?.id ?? ''))}`;
  if (!request?.id) return {};
  const withdraw = (answered = false) => post(`${base}/withdraw`, answered ? { answered: true } : {}, 1500).catch(() => undefined);
  signal?.addEventListener('abort', () => { void withdraw(); }, { once: true });
  const deadline = started + settings.waitSeconds * 1000 - 500;
  while (Date.now() < deadline && !signal?.aborted) {
    await new Promise(resolve => { const timer = setTimeout(resolve, settings.pollMs); signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true }); });
    if (signal?.aborted) break;
    if (answeredLocally(input.transcript_path, input.tool_name, input.tool_input)) { await withdraw(true); return {}; }
    let collected;
    try { collected = await post(`${base}/collect`, {}); } catch { continue; }
    if (collected?.state === 'delivered') return decisionOutput(collected);
    if (collected?.state && collected.state !== 'pending' && collected.state !== 'answered') return {};
  }
  await withdraw();
  return {};
}
