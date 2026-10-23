/**
 * Agent Trace 0.1 validation without dependencies, for scripts that run outside Unfold's server: the same rules as
 * Unfold's `src/agent-trace.ts` `parseAgentTrace`, which a parity test holds this copy to. Every object except
 * `metadata` refuses unknown properties; any tool may have written the record.
 */

/** The most files, ranges per file and ranges in total one record may carry. */
export const agentTraceLimits = Object.freeze({ files: 500, rangesPerFile: 2000, ranges: 20_000, text: 2048, metadataBytes: 16_384 });

/** A record that does not satisfy the schema; `path` names the offending field. */
export class AgentTraceError extends Error {
  constructor(path, message) { super(`${path}: ${message}`); this.path = path; this.code = 'agent_trace_invalid'; }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const contributorTypes = ['human', 'ai', 'mixed', 'unknown'];
const unreadable = Symbol('unreadable');

function object(value, path, allowed, required) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AgentTraceError(path, 'must be an object.');
  const extra = Object.keys(value).find(key => !allowed.includes(key));
  if (extra) throw new AgentTraceError(`${path}.${extra}`, 'is not part of Agent Trace 0.1; put vendor data in metadata.');
  const missing = required.find(key => value[key] === undefined);
  if (missing) throw new AgentTraceError(`${path}.${missing}`, 'is required.');
  return value;
}

function text(value, path, max = agentTraceLimits.text) {
  if (typeof value !== 'string' || !value || value.length > max) throw new AgentTraceError(path, `must be text of 1 to ${max} characters.`);
  return value;
}

function uri(value, path) {
  const raw = text(value, path);
  let parsed;
  try { parsed = new URL(raw); } catch { throw new AgentTraceError(path, 'must be an absolute URI.'); }
  if (parsed.username || parsed.password) throw new AgentTraceError(path, 'must not carry credentials.');
  return raw;
}

function line(value, path) {
  if (!Number.isSafeInteger(value) || value < 1) throw new AgentTraceError(path, 'must be a whole line number from 1.');
  return value;
}

function contributor(value, path) {
  const record = object(value, path, ['type', 'model_id'], ['type']);
  if (!contributorTypes.includes(record.type)) throw new AgentTraceError(`${path}.type`, 'must be human, ai, mixed or unknown.');
  return { type: record.type, ...(record.model_id !== undefined ? { model_id: text(record.model_id, `${path}.model_id`, 250) } : {}) };
}

function filePath(value, path) {
  const raw = text(value, path, 1024);
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw) || raw.split(/[\\/]/).includes('..') || /[\0-\x1f]/.test(raw)) throw new AgentTraceError(path, 'must be a path relative to the repository root.');
  return raw;
}

function related(value, where) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 20) throw new AgentTraceError(`${where}.related`, 'must be a list of at most 20 links.');
  return value.map((link, index) => { const spot = `${where}.related[${index}]`; const fields = object(link, spot, ['type', 'url'], ['type', 'url']); return { type: text(fields.type, `${spot}.type`, 100), url: uri(fields.url, `${spot}.url`) }; });
}

/** Checks one record against Agent Trace 0.1 and returns a copy holding only the fields the specification defines. */
export function parseAgentTrace(value) {
  const record = object(value, 'record', ['version', 'id', 'timestamp', 'vcs', 'tool', 'files', 'metadata'], ['version', 'id', 'timestamp', 'files']);
  if (typeof record.version !== 'string' || !/^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/.test(record.version)) throw new AgentTraceError('record.version', 'must be a version such as 0.1.');
  if (typeof record.id !== 'string' || !uuid.test(record.id)) throw new AgentTraceError('record.id', 'must be a UUID.');
  if (typeof record.timestamp !== 'string' || !dateTime.test(record.timestamp) || !Number.isFinite(Date.parse(record.timestamp))) throw new AgentTraceError('record.timestamp', 'must be an RFC 3339 date-time.');
  const out = /** @type {{ version: string, id: string, timestamp: string, vcs?: { type: string, revision: string }, tool?: { name: string, version: string }, files: any[], metadata?: Record<string, unknown> }} */ ({ version: record.version, id: record.id.toLowerCase(), timestamp: record.timestamp, files: [] });
  if (record.vcs !== undefined) {
    const vcs = object(record.vcs, 'record.vcs', ['type', 'revision'], ['type', 'revision']);
    if (!['git', 'jj', 'hg', 'svn'].includes(vcs.type)) throw new AgentTraceError('record.vcs.type', 'must be git, jj, hg or svn.');
    out.vcs = { type: vcs.type, revision: text(vcs.revision, 'record.vcs.revision', 128) };
  }
  if (record.tool !== undefined) {
    const tool = object(record.tool, 'record.tool', ['name', 'version'], ['name', 'version']);
    out.tool = { name: text(tool.name, 'record.tool.name', 100), version: text(tool.version, 'record.tool.version', 100) };
  }
  if (!Array.isArray(record.files)) throw new AgentTraceError('record.files', 'must be a list.');
  if (record.files.length > agentTraceLimits.files) throw new AgentTraceError('record.files', `may list at most ${agentTraceLimits.files} files.`);
  let total = 0;
  record.files.forEach((entry, fileIndex) => {
    const at = `files[${fileIndex}]`;
    const file = object(entry, at, ['path', 'conversations'], ['path', 'conversations']);
    if (!Array.isArray(file.conversations)) throw new AgentTraceError(`${at}.conversations`, 'must be a list.');
    let perFile = 0;
    const conversations = file.conversations.map((item, conversationIndex) => {
      const where = `${at}.conversations[${conversationIndex}]`;
      const conversation = object(item, where, ['url', 'contributor', 'ranges', 'related'], ['ranges']);
      if (!Array.isArray(conversation.ranges)) throw new AgentTraceError(`${where}.ranges`, 'must be a list.');
      perFile += conversation.ranges.length;
      total += conversation.ranges.length;
      if (perFile > agentTraceLimits.rangesPerFile || total > agentTraceLimits.ranges) throw new AgentTraceError(`${where}.ranges`, `a record carries at most ${agentTraceLimits.rangesPerFile} ranges per file and ${agentTraceLimits.ranges} in all.`);
      const ranges = conversation.ranges.map((range, rangeIndex) => {
        const spot = `${where}.ranges[${rangeIndex}]`;
        const fields = object(range, spot, ['start_line', 'end_line', 'content_hash', 'contributor'], ['start_line', 'end_line']);
        const start = line(fields.start_line, `${spot}.start_line`);
        const end = line(fields.end_line, `${spot}.end_line`);
        if (end < start) throw new AgentTraceError(`${spot}.end_line`, 'must not come before start_line.');
        return { start_line: start, end_line: end, ...(fields.content_hash !== undefined ? { content_hash: text(fields.content_hash, `${spot}.content_hash`, 200) } : {}), ...(fields.contributor !== undefined ? { contributor: contributor(fields.contributor, `${spot}.contributor`) } : {}) };
      });
      const links = related(conversation.related, where);
      return { ...(conversation.url !== undefined ? { url: uri(conversation.url, `${where}.url`) } : {}), ...(conversation.contributor !== undefined ? { contributor: contributor(conversation.contributor, `${where}.contributor`) } : {}), ranges, ...(links ? { related: links } : {}) };
    });
    out.files.push({ path: filePath(file.path, `${at}.path`), conversations });
  });
  if (record.metadata !== undefined) {
    if (!record.metadata || typeof record.metadata !== 'object' || Array.isArray(record.metadata)) throw new AgentTraceError('record.metadata', 'must be an object.');
    if (JSON.stringify(record.metadata).length > agentTraceLimits.metadataBytes) throw new AgentTraceError('record.metadata', `must stay under ${agentTraceLimits.metadataBytes} bytes.`);
    out.metadata = structuredClone(record.metadata);
  }
  return out;
}

/**
 * The records one git note holds. A note may carry one JSON record, a JSON list of records, or JSON Lines with one
 * record per line, which is what `git notes merge -s cat_sort_uniq` leaves when two tools noted the same commit.
 * Returns the valid records and, for each part that failed, why.
 */
export function noteRecords(note) {
  const textValue = String(note ?? '').trim();
  if (!textValue) return { records: [], errors: [] };
  let parts;
  try { const whole = JSON.parse(textValue); parts = Array.isArray(whole) ? whole : [whole]; }
  catch { parts = textValue.split('\n').map(entry => entry.trim()).filter(Boolean).map(entry => { try { return JSON.parse(entry); } catch { return unreadable; } }); }
  const records = [];
  const errors = [];
  const seen = new Set();
  for (const part of parts) {
    if (part === unreadable) { errors.push('a line is not JSON'); continue; }
    try { const record = parseAgentTrace(part); if (!seen.has(record.id)) { seen.add(record.id); records.push(record); } }
    catch (error) { errors.push(error instanceof AgentTraceError ? error.message : String(error)); }
  }
  return { records, errors };
}

/** Whether a range counts as AI-written: its own contributor, or else its conversation's, is `ai`. */
export function aiRange(conversation, range) {
  return (range.contributor?.type ?? conversation.contributor?.type) === 'ai';
}
