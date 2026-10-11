import { plainRedactedText } from './redaction.ts';

export type TranscriptKind = 'message' | 'thought' | 'tool_call' | 'tool_output' | 'plan' | 'stage' | 'truncated';
export type TranscriptToolKind = 'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'think' | 'fetch' | 'switch_mode' | 'other';
export type TranscriptToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type TranscriptPlanStep = { content: string; status: 'pending' | 'in_progress' | 'completed' };
export type TranscriptEntry = { seq: number; at: string; kind: TranscriptKind; text?: string; toolCallId?: string; title?: string; toolKind?: TranscriptToolKind; status?: TranscriptToolStatus; input?: string; paths?: string[]; plan?: TranscriptPlanStep[]; clipped?: boolean };
export type TranscriptPage = { entries: TranscriptEntry[]; nextAfter: number; hasMore: boolean; truncated: boolean; complete: boolean };
export type RunTranscriptReason = 'demo' | 'unsupported';
export type RunTranscript = TranscriptPage & { workItemId: string; runId: string; available: boolean; reason?: RunTranscriptReason; message?: string; demo: boolean; fetchedAt: string };

/** The bounds Unfold holds a transcript page to: Ploeg's own field limits (ADR-0090) and the largest page it asks for. */
export const transcriptLimits = Object.freeze({ page: 500, text: 4096, title: 256, input: 512, toolCallId: 128, paths: 16, path: 256, plan: 32, step: 256, seq: 1_073_741_824 });

export class TranscriptError extends Error {
  readonly path: string;
  constructor(path: string) { super(`invalid transcript at ${path}`); this.name = 'TranscriptError'; this.path = path; }
}

const kinds = new Set<string>(['message', 'thought', 'tool_call', 'tool_output', 'plan', 'stage', 'truncated']);
const toolKinds = new Set<string>(['read', 'edit', 'delete', 'move', 'search', 'execute', 'think', 'fetch', 'switch_mode', 'other']);
const toolStatuses = new Set<string>(['pending', 'in_progress', 'completed', 'failed']);
const stepStatuses = new Set<string>(['pending', 'in_progress', 'completed']);
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/** Whether `value` is a transcript cursor: a whole number from 0 to Ploeg's largest seq. */
export function transcriptCursor(value: string | undefined): number | null {
  if (value === undefined) return 0;
  if (!/^(?:0|[1-9][0-9]{0,9})$/.test(value)) return null;
  const cursor = Number(value);
  return cursor <= transcriptLimits.seq ? cursor : null;
}

function text(value: unknown, max: number, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TranscriptError(path);
  const clean = plainRedactedText(value);
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function seq(value: unknown, path: string, min = 1): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > transcriptLimits.seq) throw new TranscriptError(path);
  return value;
}

function flag(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new TranscriptError(path);
  return value;
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TranscriptError(path);
  return value as Record<string, unknown>;
}

function entry(value: unknown, path: string): TranscriptEntry | null {
  const raw = object(value, path);
  const position = seq(raw.seq, `${path}.seq`);
  if (typeof raw.at !== 'string' || !timestamp.test(raw.at) || !Number.isFinite(Date.parse(raw.at))) throw new TranscriptError(`${path}.at`);
  if (typeof raw.kind !== 'string' || !kinds.has(raw.kind)) return null;
  const kind = raw.kind as TranscriptKind;
  const result: TranscriptEntry = { seq: position, at: raw.at, kind };
  const body = text(raw.text, transcriptLimits.text, `${path}.text`);
  if (body !== undefined && kind !== 'tool_call' && kind !== 'plan') result.text = body;
  if (kind === 'tool_call' || kind === 'tool_output') {
    const id = text(raw.toolCallId, transcriptLimits.toolCallId, `${path}.toolCallId`);
    if (!id) throw new TranscriptError(`${path}.toolCallId`);
    result.toolCallId = id;
  }
  if (kind === 'tool_call') {
    const title = text(raw.title, transcriptLimits.title, `${path}.title`);
    if (title) result.title = title;
    if (raw.toolKind !== undefined) result.toolKind = typeof raw.toolKind === 'string' && toolKinds.has(raw.toolKind) ? raw.toolKind as TranscriptToolKind : 'other';
    if (raw.status !== undefined) { if (typeof raw.status !== 'string' || !toolStatuses.has(raw.status)) throw new TranscriptError(`${path}.status`); result.status = raw.status as TranscriptToolStatus; }
    const input = text(raw.input, transcriptLimits.input, `${path}.input`);
    if (input) result.input = input;
    if (raw.paths !== undefined) {
      if (!Array.isArray(raw.paths)) throw new TranscriptError(`${path}.paths`);
      const paths = raw.paths.slice(0, transcriptLimits.paths).map((item, index) => text(item, transcriptLimits.path, `${path}.paths[${index}]`)).filter((item): item is string => Boolean(item));
      if (paths.length) result.paths = paths;
    }
  }
  if (kind === 'plan') {
    if (!Array.isArray(raw.plan)) throw new TranscriptError(`${path}.plan`);
    result.plan = raw.plan.slice(0, transcriptLimits.plan).map((item, index) => {
      const step = object(item, `${path}.plan[${index}]`);
      if (typeof step.status !== 'string' || !stepStatuses.has(step.status)) throw new TranscriptError(`${path}.plan[${index}].status`);
      return { content: text(step.content, transcriptLimits.step, `${path}.plan[${index}].content`) ?? '', status: step.status as TranscriptPlanStep['status'] };
    });
  }
  if (raw.clipped === true) result.clipped = true;
  return result;
}

/**
 * Reads one page of Ploeg's Run transcript (operator API `transcriptResponse`, ADR-0090) for `runId`, read after `after`.
 * Entries of a kind Unfold does not know are dropped, entries at or before `after` or out of order are dropped, text is
 * cut at Ploeg's limits and passed through Unfold's redaction again. Anything else malformed throws {@link TranscriptError}.
 */
export function parseTranscriptPage(value: unknown, runId: string, after: number): TranscriptPage {
  const data = object(value, '$');
  if (data.schemaVersion !== '1.0') throw new TranscriptError('$.schemaVersion');
  if (data.runId !== runId) throw new TranscriptError('$.runId');
  if (!Array.isArray(data.entries) || data.entries.length > transcriptLimits.page) throw new TranscriptError('$.entries');
  const entries: TranscriptEntry[] = [];
  let last = after;
  data.entries.forEach((item, index) => {
    const parsed = entry(item, `$.entries[${index}]`);
    if (!parsed || parsed.seq <= last) return;
    last = parsed.seq;
    entries.push(parsed);
  });
  const nextAfter = seq(data.nextAfter, '$.nextAfter', 0);
  return { entries, nextAfter: Math.max(nextAfter, last, after), hasMore: flag(data.hasMore, '$.hasMore'), truncated: flag(data.truncated, '$.truncated'), complete: flag(data.complete, '$.complete') };
}

/** The answer for a Run whose transcript Unfold cannot read: the demo, which runs no agents, or a Ploeg without the transcript endpoint. */
export function unavailableTranscript(workItemId: string, runId: string, reason: RunTranscriptReason, after: number, demo: boolean): RunTranscript {
  const message = reason === 'demo' ? 'The demo runs no agents, so it has no transcript to show.' : 'Ploeg on this workbench does not record agent transcripts yet.';
  return { workItemId, runId, available: false, reason, message, entries: [], nextAfter: after, hasMore: false, truncated: false, complete: true, demo, fetchedAt: new Date().toISOString() };
}
