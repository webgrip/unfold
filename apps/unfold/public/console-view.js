import { escape } from './core/dom.js';

const stderrMark = /(?:^| \| )stderr: /;
const partSeparator = ' | ';
const labelledPart = /^(last agent message|last agent output|stdout|stderr|error): /i;
const errorLine = /(?:error|exception)\b|\b(?:traceback|failed|fatal|panic)\b/i;

function expandEscapes(text) {
  return text.replace(/\\r\\n|\\n/g, '\n').replace(/\\t/g, '  ').replace(/\\"/g, '"');
}

function jsonPart(text) {
  if (!text.startsWith('{') && !text.startsWith('[')) return null;
  try { return expandEscapes(JSON.stringify(JSON.parse(text), null, 2)); } catch { return null; }
}

function sentenceCase(text) {
  return `${text[0].toUpperCase()}${text.slice(1).toLowerCase()}`;
}

/**
 * The sections of a harness's failure output as a console shows them: the parts Ploeg joined with ` | `, each under the
 * label it led with (`last agent message:`) or `JSON` when it is a JSON value (pretty-printed), and everything after
 * `stderr: ` as one `stderr` section with its own lines kept. Escaped `\n` in the joined parts become line breaks.
 * @param {string} text
 * @returns {{ label: string, text: string }[]}
 */
export function consoleSections(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return [];
  const match = stderrMark.exec(raw);
  const head = match ? raw.slice(0, match.index) : raw;
  const stderr = match ? raw.slice(match.index + match[0].length) : '';
  const sections = head.split(partSeparator).map(part => part.trim()).filter(Boolean).map(part => {
    const labelled = labelledPart.exec(part);
    const body = labelled ? part.slice(labelled[0].length) : part;
    const json = jsonPart(body);
    return { label: labelled ? sentenceCase(labelled[1]) : json || /^[{[]/.test(body) ? 'JSON' : '', text: json ?? expandEscapes(body) };
  });
  if (stderr.trim()) sections.push({ label: 'stderr', text: stderr.replace(/\s+$/, '') });
  return sections;
}

function linesMarkup(text) {
  return text.split('\n').map(line => `<span class="console-line"${errorLine.test(line) ? ' data-tone="danger"' : ''}>${escape(line) || ' '}</span>`).join('');
}

/**
 * A terminal-style block for text a program printed: dark in both themes, monospace, each section under a muted
 * label, lines that name an error in the danger colour. `label` names the block for assistive technology.
 * @param {{ label: string, text: string }[]} sections
 * @param {{ label: string }} options
 * @returns {string}
 */
export function consoleMarkup(sections, { label }) {
  const body = sections.map(section => `<div class="console-section">${section.label ? `<p class="console-label">${escape(section.label)}</p>` : ''}<pre data-private class="console-text">${linesMarkup(section.text)}</pre></div>`).join('');
  return `<div class="console" data-private tabindex="0" role="region" aria-label="${escape(label)}">${body}</div>`;
}
