import { createHash, randomUUID } from 'node:crypto';

/** The namespace under `metadata` that carries Unfold's own fields, in Agent Trace's reverse-domain style. */
export const namespace = 'dev.unfoldhq';
/** The most lines a session remembers per file, and the largest record it sends. */
export const limits = { linesPerFile: 50_000, recordBytes: 120_000 };

const significant = line => line.trim().length >= 3;

/** The fingerprint of one written line: its trimmed text, hashed, so indentation changes and moves still match. */
export function lineKey(line) {
  return createHash('sha256').update(line.trim()).digest('base64url').slice(0, 16);
}

/** The agent name used for lines the session's main agent wrote, as opposed to one of its subagents. */
export const mainAgent = 'main';

/**
 * Remembers the lines an agent wrote to one repository file. `written` maps a repository-relative path to the
 * fingerprints of its written lines, each naming the agent that wrote it last (`main` or a subagent's type); short
 * lines such as `}` are not remembered on their own. A list of fingerprints from an older state counts as `main`.
 */
export function remember(written, path, text, agent = mainAgent) {
  const previous = written[path];
  const keys = Array.isArray(previous) ? Object.fromEntries(previous.map(key => [key, mainAgent])) : { ...(previous ?? {}) };
  for (const line of String(text ?? '').split('\n')) if (significant(line)) { const key = lineKey(line); delete keys[key]; keys[key] = agent; }
  const entries = Object.entries(keys);
  written[path] = Object.fromEntries(entries.slice(-limits.linesPerFile));
  return written;
}

function writers(written, path) {
  const entry = written[path];
  return new Map(Array.isArray(entry) ? entry.map(key => [key, mainAgent]) : Object.entries(entry ?? {}));
}

/** The text an editing tool call wrote, from its input: Write's content, Edit's new_string, MultiEdit's edits, NotebookEdit's new_source. */
export function writtenText(toolName, input) {
  if (!input || typeof input !== 'object') return '';
  if (toolName === 'Write') return String(input.content ?? '');
  if (toolName === 'Edit') return String(input.new_string ?? '');
  if (toolName === 'MultiEdit') return (Array.isArray(input.edits) ? input.edits : []).map(edit => String(edit?.new_string ?? '')).join('\n');
  if (toolName === 'NotebookEdit') return String(input.new_source ?? '');
  return '';
}

/** The lines a commit adds, per file, with their line numbers in the new file, from `git show --unified=0` output. */
export function addedLines(diff) {
  const files = new Map();
  let path = null;
  let next = 0;
  for (const line of String(diff).split('\n')) {
    if (line.startsWith('+++ ')) { path = line === '+++ /dev/null' ? null : line.slice(4).replace(/^b\//, ''); if (path && !files.has(path)) files.set(path, []); continue; }
    if (line.startsWith('--- ') || line.startsWith('diff --git ')) continue;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) { next = Number(hunk[1]); continue; }
    if (path && line.startsWith('+')) { files.get(path).push({ number: next, text: line.slice(1) }); next += 1; }
  }
  return files;
}

/**
 * Which added lines the session's agents wrote: a significant line whose fingerprint the session remembers for that
 * file, and a short line directly between or beside such lines, which takes its neighbour's agent. Returns ranges of
 * consecutive lines by one agent per file, each naming its agent.
 */
export function attribute(added, written) {
  const result = [];
  for (const [path, lines] of added) {
    const keys = writers(written, path);
    if (!keys.size) continue;
    const marks = lines.map(line => significant(line.text) ? keys.get(lineKey(line.text)) ?? null : undefined);
    const resolved = marks.map((mark, index) => {
      if (mark !== undefined) return mark;
      const before = index > 0 && lines[index - 1].number === lines[index].number - 1 ? marks[index - 1] : null;
      const after = index + 1 < lines.length && lines[index + 1].number === lines[index].number + 1 ? marks[index + 1] : null;
      return before || after || null;
    });
    const ranges = [];
    lines.forEach((line, index) => {
      const agent = resolved[index];
      if (!agent) return;
      const last = ranges.at(-1);
      if (last && last.agent === agent && last.end_line === line.number - 1) { last.end_line = line.number; last.text.push(line.text); }
      else ranges.push({ start_line: line.number, end_line: line.number, agent, text: [line.text] });
    });
    if (ranges.length) result.push({ path, ranges: ranges.map(({ text, ...range }) => ({ ...range, content_hash: `sha256:${createHash('sha256').update(text.join('\n')).digest('hex').slice(0, 16)}` })) });
  }
  return result;
}

/** A model id in the provider/model form Agent Trace uses: `claude-opus-5-5[1m]` becomes `anthropic/claude-opus-5-5`. */
export function modelId(model) {
  const bare = String(model ?? '').replace(/\[.*\]$/, '').trim();
  if (!bare) return '';
  return bare.includes('/') ? bare : /^claude-/.test(bare) ? `anthropic/${bare}` : bare;
}

/** The conversation URL of one agent in a session: the session's page, with `?agent=` for a subagent. */
export function agentUrl(sessionUrl, agent) {
  return agent === mainAgent ? sessionUrl : `${sessionUrl}?agent=${encodeURIComponent(agent)}`;
}

/**
 * One Agent Trace 0.1 record for a commit: the files and line ranges this session wrote, one conversation per agent
 * (the main agent at the session's Unfold page, each subagent at that page with `?agent=`). Returns null when the
 * commit holds no line the session wrote. A record that would exceed {@link limits}.recordBytes drops its hashes,
 * then files, and says so in its metadata.
 */
export function traceRecord({ revision, timestamp, files, sessionId, sessionUrl, remoteUrl = '', model = '', harnessVersion = '', workItems = /** @type {{ id: string, url: string }[]} */ ([]) }) {
  if (!files.length) return null;
  const contributor = { type: 'ai', ...(modelId(model) ? { model_id: modelId(model).slice(0, 250) } : {}) };
  const related = [...(remoteUrl ? [{ type: 'session', url: remoteUrl }] : []), ...workItems.slice(0, 10).map(item => ({ type: 'work-item', url: item.url }))];
  const agents = [...new Set(files.flatMap(entry => entry.ranges.map(range => range.agent ?? mainAgent)))];
  const conversations = (entry, hashes) => agents.map(agent => {
    const ranges = entry.ranges.filter(range => (range.agent ?? mainAgent) === agent).map(range => hashes && range.content_hash ? { start_line: range.start_line, end_line: range.end_line, content_hash: range.content_hash } : { start_line: range.start_line, end_line: range.end_line });
    const links = agent === mainAgent ? related : [{ type: 'parent-session', url: sessionUrl }, ...related];
    return ranges.length ? { url: agentUrl(sessionUrl, agent), contributor, ranges, ...(links.length ? { related: links } : {}) } : null;
  }).filter(Boolean);
  const build = (entries, hashes, truncated) => ({
    version: '0.1', id: randomUUID(), timestamp, vcs: { type: 'git', revision }, tool: { name: 'claude-code', version: harnessVersion || 'unknown' },
    files: entries.map(entry => ({ path: entry.path, conversations: conversations(entry, hashes) })),
    metadata: { [namespace]: { session_id: sessionId, harness: 'claude-code', method: 'line-fingerprint', agents, work_items: workItems.map(item => item.id), ...(truncated ? { truncated: true } : {}) } },
  });
  let record = build(files, true, false);
  if (JSON.stringify(record).length <= limits.recordBytes) return record;
  record = build(files, false, true);
  let kept = files.length;
  while (kept > 1 && JSON.stringify(record).length > limits.recordBytes) { kept = Math.ceil(kept / 2); record = build(files.slice(0, kept), false, true); }
  return record;
}
