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

/**
 * Remembers the lines an agent wrote to one repository file. `written` maps a repository-relative path to the
 * fingerprints of its written lines; short lines such as `}` are not remembered on their own.
 */
export function remember(written, path, text) {
  const keys = new Set(written[path] ?? []);
  for (const line of String(text ?? '').split('\n')) if (significant(line)) keys.add(lineKey(line));
  written[path] = [...keys].slice(-limits.linesPerFile);
  return written;
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
 * Which added lines the agent wrote: a significant line whose fingerprint the session remembers for that file, and a
 * short line directly between or beside such lines. Returns ranges of consecutive agent-written lines per file.
 */
export function attribute(added, written) {
  const result = [];
  for (const [path, lines] of added) {
    const keys = new Set(written[path] ?? []);
    if (!keys.size) continue;
    const marks = lines.map(line => significant(line.text) ? (keys.has(lineKey(line.text)) ? 'ai' : 'other') : 'short');
    const resolved = marks.map((mark, index) => {
      if (mark !== 'short') return mark;
      const before = index > 0 && lines[index - 1].number === lines[index].number - 1 ? marks[index - 1] : null;
      const after = index + 1 < lines.length && lines[index + 1].number === lines[index].number + 1 ? marks[index + 1] : null;
      return before === 'ai' || after === 'ai' ? 'ai' : 'other';
    });
    const ranges = [];
    lines.forEach((line, index) => {
      if (resolved[index] !== 'ai') return;
      const last = ranges.at(-1);
      if (last && last.end_line === line.number - 1) { last.end_line = line.number; last.text.push(line.text); }
      else ranges.push({ start_line: line.number, end_line: line.number, text: [line.text] });
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

/**
 * One Agent Trace 0.1 record for a commit: the files and line ranges this session wrote, linked to the session's
 * Unfold page. Returns null when the commit holds no line the session wrote. A record that would exceed
 * {@link limits}.recordBytes drops its hashes, then files, and says so in its metadata.
 */
export function traceRecord({ revision, timestamp, files, sessionId, sessionUrl, remoteUrl = '', model = '', harnessVersion = '', workItems = /** @type {{ id: string, url: string }[]} */ ([]) }) {
  if (!files.length) return null;
  const contributor = { type: 'ai', ...(modelId(model) ? { model_id: modelId(model).slice(0, 250) } : {}) };
  const related = [...(remoteUrl ? [{ type: 'session', url: remoteUrl }] : []), ...workItems.slice(0, 10).map(item => ({ type: 'work-item', url: item.url }))];
  const build = (entries, hashes, truncated) => ({
    version: '0.1', id: randomUUID(), timestamp, vcs: { type: 'git', revision }, tool: { name: 'claude-code', version: harnessVersion || 'unknown' },
    files: entries.map(entry => ({ path: entry.path, conversations: [{ url: sessionUrl, contributor, ranges: entry.ranges.map(range => hashes ? range : { start_line: range.start_line, end_line: range.end_line }), ...(related.length ? { related } : {}) }] })),
    metadata: { [namespace]: { session_id: sessionId, harness: 'claude-code', method: 'line-fingerprint', work_items: workItems.map(item => item.id), ...(truncated ? { truncated: true } : {}) } },
  });
  let record = build(files, true, false);
  if (JSON.stringify(record).length <= limits.recordBytes) return record;
  record = build(files, false, true);
  let kept = files.length;
  while (kept > 1 && JSON.stringify(record).length > limits.recordBytes) { kept = Math.ceil(kept / 2); record = build(files.slice(0, kept), false, true); }
  return record;
}
