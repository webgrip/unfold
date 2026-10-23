/** The longest line the proxy reads; a longer message is still relayed, only not observed. */
export const maxLineBytes = 16 * 1024 * 1024;

/**
 * A chunk consumer that calls `onLine` with each complete newline-delimited line, decoded as UTF-8, without the
 * newline. It copies what it keeps, so the chunks it sees can be relayed as they are.
 * @param {(line: string) => void} onLine
 * @param {number} [limit]
 * @returns {(chunk: Buffer) => void}
 */
export function lineSplitter(onLine, limit = maxLineBytes) {
  let parts = [];
  let size = 0;
  let skipping = false;
  return chunk => {
    let start = 0;
    for (;;) {
      const end = chunk.indexOf(10, start);
      if (end === -1) {
        if (skipping || start >= chunk.length) return;
        size += chunk.length - start;
        if (size > limit) { skipping = true; parts = []; size = 0; } else parts.push(Buffer.from(chunk.subarray(start)));
        return;
      }
      if (!skipping) {
        parts.push(chunk.subarray(start, end));
        onLine(Buffer.concat(parts).toString('utf8'));
      }
      parts = []; size = 0; skipping = false; start = end + 1;
    }
  };
}

/**
 * The JSON-RPC message on one line, or null when the line is not a JSON object.
 * @param {string} line
 * @returns {Record<string, any> | null}
 */
export function message(line) {
  if (!line.trim()) return null;
  try {
    const value = JSON.parse(line);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
