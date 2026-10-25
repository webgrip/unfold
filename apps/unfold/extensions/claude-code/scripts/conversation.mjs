import { openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { masked, permissionSummary } from './permission.mjs';

/**
 * The bounds of one conversation read: entries per answer, characters per prompt, reply and tool line, the bytes an
 * answer may hold so it fits Unfold's request limit, and how much of the transcript's end a first read scans.
 */
export const conversationBounds = { entries: 200, prompt: 4000, reply: 6000, tool: 240, answerBytes: 100_000, firstReadBytes: 4_194_304, laterReadBytes: 1_048_576 };

const wrappers = /<(system-reminder|browser_instruction|ide_selection|ide_opened_file|command-message|command-args|local-command-stdout|local-command-stderr)>[\s\S]*?<\/\1>/g;

function promptText(content) {
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter(part => part?.type === 'text').map(part => String(part.text ?? '')).join('\n\n') : '';
  const command = /<command-name>([^<]{1,80})<\/command-name>/.exec(text)?.[1];
  const shown = text.replace(/<command-name>[^<]*<\/command-name>/g, '').replace(wrappers, '').trim();
  return command ? `${command}${shown ? ` ${shown}` : ''}`.trim() : shown;
}

function clipped(text, max) { return text.length > max ? `${text.slice(0, max)}…` : text; }

/**
 * The conversation entries one transcript line holds: a prompt the person typed, a text reply of the agent, or one
 * redacted line per tool call, the summary a permission prompt would show without its list of programs. Tool results, thinking, subagent turns and
 * Claude Code's own bookkeeping give none.
 * @param {string} line One line of a Claude Code transcript.
 * @param {string} cwd The session's folder, so tool lines show paths relative to it.
 * @returns {{ id: string, kind: 'prompt' | 'reply' | 'tool', text: string, at: string }[]}
 */
export function entriesOf(line, cwd = '') {
  let entry;
  try { entry = JSON.parse(line); } catch { return []; }
  if (!entry || typeof entry !== 'object' || entry.isSidechain === true || entry.isMeta === true) return [];
  const id = typeof entry.uuid === 'string' ? entry.uuid.slice(0, 128) : '';
  const at = typeof entry.timestamp === 'string' ? entry.timestamp.slice(0, 40) : '';
  const content = entry.message?.content;
  if (entry.type === 'user') {
    if (Array.isArray(content) && content.some(part => part?.type === 'tool_result')) return [];
    const text = promptText(content);
    return text ? [{ id, kind: 'prompt', text: clipped(masked(text), conversationBounds.prompt), at }] : [];
  }
  if (entry.type !== 'assistant' || !Array.isArray(content)) return [];
  return content.flatMap((part, index) => {
    const partId = index ? `${id}:${index}` : id;
    if (part?.type === 'text' && String(part.text ?? '').trim()) return [{ id: partId, kind: 'reply', text: clipped(masked(String(part.text).trim()), conversationBounds.reply), at }];
    if (part?.type === 'tool_use') {
      const { tool, summary } = permissionSummary({ tool_name: part.name, tool_input: part.input, cwd: cwd || entry.cwd });
      return [{ id: partId, kind: 'tool', text: clipped(`${tool}: ${summary}`, conversationBounds.tool), at }];
    }
    return [];
  });
}

function fitted(entries) {
  let bytes = 0;
  let from = entries.length;
  while (from > 0) {
    const size = Buffer.byteLength(JSON.stringify(entries[from - 1]));
    if (bytes + size > conversationBounds.answerBytes) break;
    bytes += size;
    from -= 1;
  }
  return entries.slice(from);
}

/**
 * Reads the conversation from a transcript on this machine. Without `after` it reads the last
 * {@link conversationBounds.entries} entries; with `after`, a byte offset an earlier read returned, only what was
 * written since. `cursor` is the offset to ask from next time, and `truncated` says older entries were left out.
 * A transcript that shrank, such as one rewritten by Claude Code, is read again from its end.
 * @param {string} transcriptPath The session's transcript, from the hook input's `transcript_path`.
 * @param {{ after?: number | null, cwd?: string }} [options]
 * @returns {{ entries: ReturnType<typeof entriesOf>, cursor: number, truncated: boolean, restarted: boolean }}
 */
export function readConversation(transcriptPath, { after = null, cwd = '' } = {}) {
  let fd;
  try {
    fd = openSync(transcriptPath, 'r');
    const size = fstatSync(fd).size;
    const restarted = after !== null && (!Number.isSafeInteger(after) || after < 0 || after > size);
    const fresh = after === null || restarted;
    const window = fresh ? conversationBounds.firstReadBytes : conversationBounds.laterReadBytes;
    const start = fresh ? Math.max(0, size - window) : after;
    const length = Math.min(size - start, window);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, start);
    const text = buffer.toString('utf8');
    const complete = text.lastIndexOf('\n') + 1 || (length === window ? text.length : 0);
    const lines = text.slice(0, complete).split('\n');
    if (fresh && start > 0) lines.shift();
    const read = lines.flatMap(line => line ? entriesOf(line, cwd) : []);
    const kept = fitted(read.slice(-conversationBounds.entries));
    return { entries: kept, cursor: start + Buffer.byteLength(text.slice(0, complete)), truncated: kept.length < read.length || (fresh && start > 0), restarted };
  } finally { if (fd !== undefined) closeSync(fd); }
}
