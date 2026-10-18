/** A failure text as a person reads it: the exception and its message with the last frames, and whether anything was left out. */
export type CondensedFailure = { text: string; condensed: boolean };

/** How much of a traceback a condensed failure keeps: the frames nearest the error, the exception's message lines, and the words before the traceback. */
export const tracebackLimits = Object.freeze({ frames: 3, messageLines: 6, lead: 300, line: 400 });

const boxEdge = /^[\s]*[│┃║╭╮╰╯┏┓┗┛─━]/;
const richStart = /^\s*[╭┏][─━\s]*Traceback\b/;
const plainStart = /Traceback \(most recent call last\):/;
const richFrame = /^\s*[│┃]\s*(\S+?):(\d+) in (\S+)/;
const plainFrame = /^\s*File "([^"]+)", line (\d+), in (\S+)/;
const exceptionLine = /^\s*((?:[A-Za-z_][\w]*\.)*[A-Za-z_]\w*(?:Error|Exception|Exit|Interrupt|Warning|Failure|Fault)|(?:[a-z_][\w]*\.)+[A-Z]\w*)(?::\s?(.*))?$/;

const shortPath = (path: string) => path.split('/').slice(-3).join('/');
const cut = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text;

/**
 * Reduces a Python traceback, in Rich's box-drawing form or the plain interpreter form, to the exception type and message
 * and the last frames. Text that holds no traceback, or one whose exception cannot be found, comes back unchanged.
 */
export function condenseTraceback(text: string): CondensedFailure {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex(line => richStart.test(line) || plainStart.test(line));
  if (start < 0) return { text, condensed: false };
  const frames: string[] = [];
  let end = start;
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    const frame = richFrame.exec(line) ?? plainFrame.exec(line);
    if (frame) frames.push(`${shortPath(frame[1])}:${frame[2]} in ${frame[3]}`);
    if (!frame && !boxEdge.test(line) && !/^\s+\S/.test(line) && line.trim()) break;
    end = index;
  }
  const at = lines.findIndex((line, index) => index > end && index <= end + 3 && exceptionLine.test(line));
  if (at < 0) return { text, condensed: false };
  const message = [lines[at].trim()];
  for (let index = at + 1; index < lines.length && message.length < tracebackLimits.messageLines; index++) {
    const line = lines[index];
    if (!line.trim()) { if (message.length > 1) break; continue; }
    if (boxEdge.test(line) || richStart.test(line) || plainStart.test(line)) break;
    message.push(line.trim());
  }
  const lead = lines.slice(0, start).join('\n').trim();
  const kept = [
    ...(lead ? [cut(lead, tracebackLimits.lead)] : []),
    ...message.map(line => cut(line, tracebackLimits.line)),
    ...(frames.length ? ['', `Last ${Math.min(frames.length, tracebackLimits.frames) === 1 ? 'frame' : 'frames'}:`, ...frames.slice(-tracebackLimits.frames).map(frame => `  ${frame}`)] : []),
  ];
  return { text: kept.join('\n'), condensed: true };
}

/** A Markdown code block that holds `text` verbatim, fenced longer than any backtick run inside it. */
export function fencedBlock(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map(match => match[0].length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}text\n${text}\n${fence}`;
}

/** A failure section of a Run's report: the condensed failure, then the full text in a code block when anything was left out. */
export function failureMarkdown(text: string): string {
  const trimmed = text.trim();
  const condensed = condenseTraceback(trimmed);
  return condensed.condensed ? `${fencedBlock(condensed.text)}\n\n**Full output**\n\n${fencedBlock(trimmed)}` : trimmed;
}

/** The one-line form of a failure for an error message: the condensed text's first lines. */
export function failureHeadline(text: string): string {
  const condensed = condenseTraceback(text.trim());
  return condensed.condensed ? condensed.text.split('\n').filter(line => line.trim()).slice(0, 3).join(' · ') : text;
}
