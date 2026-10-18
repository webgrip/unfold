/**
 * Agent Trace 0.1 records (https://agent-trace.dev, schema https://agent-trace.dev/schemas/v1/trace-record.json):
 * which lines of a commit an agent conversation wrote. Unfold validates the record as strictly as the hosted schema,
 * where every object except `metadata` refuses unknown properties, and keeps vendor data under reverse-domain keys
 * in `metadata`.
 */

/** The media type the specification registers for one record. */
export const agentTraceMediaType = 'application/vnd.agent-trace.record+json';
/** The `metadata` key under which Unfold puts its own fields. */
export const unfoldTraceNamespace = 'dev.unfoldhq';
/** The most files, ranges per file and ranges in total one stored record may carry. */
export const agentTraceLimits = { files: 500, rangesPerFile: 2000, ranges: 20_000, text: 2048, metadataBytes: 16_384 } as const;

export type TraceContributor = { type: 'human' | 'ai' | 'mixed' | 'unknown'; model_id?: string };
export type TraceRange = { start_line: number; end_line: number; content_hash?: string; contributor?: TraceContributor };
export type TraceConversation = { url?: string; contributor?: TraceContributor; ranges: TraceRange[]; related?: { type: string; url: string }[] };
export type TraceFile = { path: string; conversations: TraceConversation[] };
/** One Agent Trace record as the specification defines it. */
export type AgentTraceRecord = { version: string; id: string; timestamp: string; vcs?: { type: 'git' | 'jj' | 'hg' | 'svn'; revision: string }; tool?: { name: string; version: string }; files: TraceFile[]; metadata?: Record<string, unknown> };

/** A record that does not satisfy the schema; `path` names the offending field, such as `files[2].conversations[0].ranges[4]`. */
export class AgentTraceError extends Error {
  readonly status = 400;
  readonly code = 'agent_trace_invalid';
  readonly path: string;
  constructor(path: string, message: string) { super(`${path}: ${message}`); this.path = path; }
}

type Json = Record<string, unknown>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const contributorTypes = ['human', 'ai', 'mixed', 'unknown'];

function object(value: unknown, path: string, allowed: string[], required: string[]): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AgentTraceError(path, 'must be an object.');
  const record = value as Json;
  const extra = Object.keys(record).find(key => !allowed.includes(key));
  if (extra) throw new AgentTraceError(`${path}.${extra}`, 'is not part of Agent Trace 0.1; put vendor data in metadata.');
  const missing = required.find(key => record[key] === undefined);
  if (missing) throw new AgentTraceError(`${path}.${missing}`, 'is required.');
  return record;
}

function text(value: unknown, path: string, max: number = agentTraceLimits.text): string {
  if (typeof value !== 'string' || !value || value.length > max) throw new AgentTraceError(path, `must be text of 1 to ${max} characters.`);
  return value;
}

function uri(value: unknown, path: string): string {
  const raw = text(value, path);
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new AgentTraceError(path, 'must be an absolute URI.'); }
  if (parsed.username || parsed.password) throw new AgentTraceError(path, 'must not carry credentials.');
  return raw;
}

function line(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new AgentTraceError(path, 'must be a whole line number from 1.');
  return value as number;
}

function contributor(value: unknown, path: string): TraceContributor {
  const record = object(value, path, ['type', 'model_id'], ['type']);
  if (!contributorTypes.includes(record.type as string)) throw new AgentTraceError(`${path}.type`, 'must be human, ai, mixed or unknown.');
  return { type: record.type as TraceContributor['type'], ...(record.model_id !== undefined ? { model_id: text(record.model_id, `${path}.model_id`, 250) } : {}) };
}

function filePath(value: unknown, path: string): string {
  const raw = text(value, path, 1024);
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw) || raw.split(/[\\/]/).includes('..') || /[\0-\x1f]/.test(raw)) throw new AgentTraceError(path, 'must be a path relative to the repository root.');
  return raw;
}

/**
 * Checks one record against Agent Trace 0.1 and Unfold's size limits and returns a copy holding only the fields the
 * specification defines. `version` is `major.minor` in the schema; the specification's own examples write `0.1.0`,
 * so a three-part version is accepted as well.
 */
export function parseAgentTrace(value: unknown): AgentTraceRecord {
  const record = object(value, 'record', ['version', 'id', 'timestamp', 'vcs', 'tool', 'files', 'metadata'], ['version', 'id', 'timestamp', 'files']);
  if (typeof record.version !== 'string' || !/^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/.test(record.version)) throw new AgentTraceError('record.version', 'must be a version such as 0.1.');
  if (typeof record.id !== 'string' || !uuid.test(record.id)) throw new AgentTraceError('record.id', 'must be a UUID.');
  if (typeof record.timestamp !== 'string' || !dateTime.test(record.timestamp) || !Number.isFinite(Date.parse(record.timestamp))) throw new AgentTraceError('record.timestamp', 'must be an RFC 3339 date-time.');
  const out: AgentTraceRecord = { version: record.version, id: record.id.toLowerCase(), timestamp: record.timestamp, files: [] };
  if (record.vcs !== undefined) {
    const vcs = object(record.vcs, 'record.vcs', ['type', 'revision'], ['type', 'revision']);
    if (!['git', 'jj', 'hg', 'svn'].includes(vcs.type as string)) throw new AgentTraceError('record.vcs.type', 'must be git, jj, hg or svn.');
    out.vcs = { type: vcs.type as 'git', revision: text(vcs.revision, 'record.vcs.revision', 128) };
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
      const related = conversation.related === undefined ? undefined : Array.isArray(conversation.related) && conversation.related.length <= 20
        ? conversation.related.map((link, linkIndex) => { const spot = `${where}.related[${linkIndex}]`; const fields = object(link, spot, ['type', 'url'], ['type', 'url']); return { type: text(fields.type, `${spot}.type`, 100), url: uri(fields.url, `${spot}.url`) }; })
        : (() => { throw new AgentTraceError(`${where}.related`, 'must be a list of at most 20 links.'); })();
      return { ...(conversation.url !== undefined ? { url: uri(conversation.url, `${where}.url`) } : {}), ...(conversation.contributor !== undefined ? { contributor: contributor(conversation.contributor, `${where}.contributor`) } : {}), ranges, ...(related ? { related } : {}) };
    });
    out.files.push({ path: filePath(file.path, `${at}.path`), conversations });
  });
  if (record.metadata !== undefined) {
    if (!record.metadata || typeof record.metadata !== 'object' || Array.isArray(record.metadata)) throw new AgentTraceError('record.metadata', 'must be an object.');
    if (JSON.stringify(record.metadata).length > agentTraceLimits.metadataBytes) throw new AgentTraceError('record.metadata', `must stay under ${agentTraceLimits.metadataBytes} bytes.`);
    out.metadata = structuredClone(record.metadata) as Record<string, unknown>;
  }
  return out;
}

/** How many lines a record attributes to each kind of contributor, counting a range's own contributor over its conversation's, and how many files it names. */
export function traceLines(record: AgentTraceRecord): { ai: number; human: number; mixed: number; unknown: number; files: number } {
  const counts = { ai: 0, human: 0, mixed: 0, unknown: 0, files: record.files.length };
  for (const file of record.files) for (const conversation of file.conversations) for (const range of conversation.ranges) {
    const kind = range.contributor?.type ?? conversation.contributor?.type ?? 'unknown';
    counts[kind] += range.end_line - range.start_line + 1;
  }
  return counts;
}
