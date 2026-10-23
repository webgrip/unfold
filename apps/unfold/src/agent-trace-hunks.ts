import type { AgentTraceRecord } from './agent-trace.ts';

/** One hunk of a unified diff with how many of the lines it adds an agent wrote, by the Agent Trace records given. */
export type AttributedHunk = {
  path: string; header: string; oldStart: number; oldLines: number; newStart: number; newLines: number;
  added: number; removed: number; aiLines: number; index: number;
};

function diffPath(raw: string): string {
  const bare = raw.replace(/\t.*$/, '');
  const unquoted = bare.startsWith('"') && bare.endsWith('"') ? JSON.parse(bare) as string : bare;
  return unquoted.replace(/^[ab]\//, '');
}

function aiLineSets(records: readonly AgentTraceRecord[]): Map<string, Set<number>> {
  const lines = new Map<string, Set<number>>();
  for (const record of records) for (const file of record.files) for (const conversation of file.conversations) for (const range of conversation.ranges) {
    if ((range.contributor?.type ?? conversation.contributor?.type) !== 'ai') continue;
    const set = lines.get(file.path) ?? new Set<number>();
    for (let number = range.start_line; number <= range.end_line && set.size < 1_000_000; number += 1) set.add(number);
    lines.set(file.path, set);
  }
  return lines;
}

/**
 * Splits a unified diff, such as a pull request's, into its hunks and counts per hunk the added lines whose
 * new-side line number an `ai` range of a record names for that file; a line several records name counts once. The
 * records' line numbers must refer to the diff's new side, which holds for records of the diff's head commit.
 * Hunks keep the diff's order and carry their position in `index`.
 */
export function attributeHunks(diff: string, records: readonly AgentTraceRecord[]): AttributedHunk[] {
  const ai = aiLineSets(records);
  const hunks: AttributedHunk[] = [];
  let oldPath = '';
  let path = '';
  let current: AttributedHunk | null = null;
  let oldLeft = 0;
  let newLeft = 0;
  let next = 0;
  for (const line of String(diff).split('\n')) {
    if (current && (oldLeft > 0 || newLeft > 0) && !line.startsWith('@@ ') && !line.startsWith('diff --git ')) {
      if (line.startsWith('+')) { current.added += 1; newLeft -= 1; if (ai.get(current.path)?.has(next)) current.aiLines += 1; next += 1; }
      else if (line.startsWith('-')) { current.removed += 1; oldLeft -= 1; }
      else if (line.startsWith(' ') || line === '') { oldLeft -= 1; newLeft -= 1; next += 1; }
      continue;
    }
    if (line.startsWith('diff --git ')) { current = null; oldPath = ''; path = ''; continue; }
    if (line.startsWith('--- ')) { oldPath = line === '--- /dev/null' ? '' : diffPath(line.slice(4)); continue; }
    if (line.startsWith('+++ ')) { path = line === '+++ /dev/null' ? oldPath : diffPath(line.slice(4)); continue; }
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!header) continue;
    current = { path, header: line, oldStart: Number(header[1]), oldLines: header[2] === undefined ? 1 : Number(header[2]), newStart: Number(header[3]), newLines: header[4] === undefined ? 1 : Number(header[4]), added: 0, removed: 0, aiLines: 0, index: hunks.length };
    hunks.push(current);
    oldLeft = current.oldLines;
    newLeft = current.newLines;
    next = current.newStart;
  }
  return hunks;
}

/**
 * The reading order the review walkthrough proposes (proposed in OpenSpec change `add-review-walkthrough`): hunks
 * with AI-written lines first, most AI-written lines first, then the rest; ties keep the diff's order.
 */
export function aiHunksFirst(hunks: readonly AttributedHunk[]): AttributedHunk[] {
  return [...hunks].sort((a, b) => Number(b.aiLines > 0) - Number(a.aiLines > 0) || b.aiLines - a.aiLines || a.index - b.index);
}
