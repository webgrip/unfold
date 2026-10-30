/** An Atlassian Document Format node: `type`, optional `attrs`, `content`, `text` and `marks`. */
export type AdfNode = { type: string; attrs?: Record<string, unknown>; content?: AdfNode[]; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] };

const maxDepth = 24;
const maxNodes = 20000;

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeHref = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try { const url = new URL(value); return ['http:', 'https:', 'mailto:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
};
const attr = (node: AdfNode, name: string): string => { const value = node.attrs?.[name]; return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; };
const nodes = (value: unknown): AdfNode[] => Array.isArray(value) ? value.filter((entry): entry is AdfNode => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry) && typeof (entry as AdfNode).type === 'string') : [];

class Walk {
  private seen = 0;
  children(node: AdfNode, depth: number, visit: (child: AdfNode, depth: number) => string): string {
    if (depth > maxDepth) return '';
    return nodes(node.content).map(child => { if (++this.seen > maxNodes) return ''; return visit(child, depth + 1); }).join('');
  }
}

function marked(node: AdfNode): string {
  let html = escapeHtml(typeof node.text === 'string' ? node.text : '');
  for (const mark of Array.isArray(node.marks) ? node.marks : []) {
    if (!mark || typeof mark !== 'object') continue;
    if (mark.type === 'strong') html = `<strong>${html}</strong>`;
    else if (mark.type === 'em') html = `<em>${html}</em>`;
    else if (mark.type === 'strike') html = `<del>${html}</del>`;
    else if (mark.type === 'code') html = `<code>${html}</code>`;
    else if (mark.type === 'link') { const href = safeHref(mark.attrs?.href); if (href) html = `<a href="${escapeHtml(href)}">${html}</a>`; }
  }
  return html;
}

/** Renders an Atlassian Document Format description as HTML in which every text is escaped and only http, https and mailto links survive; anything that is not a document gives an empty string. Unknown nodes keep their text. */
export function adfToHtml(value: unknown): string {
  if (typeof value === 'string') return `<p>${escapeHtml(value)}</p>`;
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value as AdfNode).type !== 'doc') return '';
  const walk = new Walk();
  const visit = (node: AdfNode, depth: number): string => {
    const inner = () => walk.children(node, depth, visit);
    switch (node.type) {
      case 'text': return marked(node);
      case 'hardBreak': return '<br>';
      case 'paragraph': return `<p>${inner()}</p>`;
      case 'heading': { const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1)); return `<h${level}>${inner()}</h${level}>`; }
      case 'bulletList': return `<ul>${inner()}</ul>`;
      case 'orderedList': return `<ol>${inner()}</ol>`;
      case 'listItem': return `<li>${inner()}</li>`;
      case 'taskList': return `<ul>${inner()}</ul>`;
      case 'taskItem': return `<li>${attr(node, 'state') === 'DONE' ? '[x]' : '[ ]'} ${inner()}</li>`;
      case 'blockquote': return `<blockquote>${inner()}</blockquote>`;
      case 'codeBlock': return `<pre><code>${nodes(node.content).map(child => escapeHtml(typeof child.text === 'string' ? child.text : '')).join('')}</code></pre>`;
      case 'rule': return '<hr>';
      case 'table': return `<table>${inner()}</table>`;
      case 'tableRow': return `<tr>${inner()}</tr>`;
      case 'tableHeader': return `<th>${inner()}</th>`;
      case 'tableCell': return `<td>${inner()}</td>`;
      case 'panel': case 'expand': case 'nestedExpand': { const title = attr(node, 'title'); return `${title ? `<p><strong>${escapeHtml(title)}</strong></p>` : ''}${inner()}`; }
      case 'mention': return escapeHtml(attr(node, 'text') || '@someone');
      case 'emoji': return escapeHtml(attr(node, 'text') || attr(node, 'shortName'));
      case 'status': return `<code>${escapeHtml(attr(node, 'text'))}</code>`;
      case 'date': { const at = Number(attr(node, 'timestamp')); return Number.isFinite(at) && at > 0 ? escapeHtml(new Date(at).toISOString().slice(0, 10)) : ''; }
      case 'inlineCard': case 'blockCard': case 'embedCard': { const href = safeHref(node.attrs?.url); return href ? `<a href="${escapeHtml(href)}">${escapeHtml(href)}</a>` : ''; }
      case 'mediaSingle': case 'mediaGroup': return '<p>[attachment]</p>';
      case 'media': case 'mediaInline': return '[attachment]';
      default: return inner();
    }
  };
  return walk.children(value as AdfNode, 0, visit);
}

/** The plain text of an Atlassian Document Format value, one line per block. */
export function adfToText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const walk = new Walk();
  const blocks = new Set(['paragraph', 'heading', 'listItem', 'taskItem', 'codeBlock', 'blockquote', 'tableRow']);
  const visit = (node: AdfNode, depth: number): string => {
    if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'mention') return attr(node, 'text');
    if (node.type === 'emoji') return attr(node, 'text') || attr(node, 'shortName');
    if (node.type === 'inlineCard') return attr(node, 'url');
    if (node.type === 'media' || node.type === 'mediaInline') return '[attachment]';
    if (node.type === 'tableCell' || node.type === 'tableHeader') return `${walk.children(node, depth, visit)} `;
    const inner = walk.children(node, depth, visit);
    return blocks.has(node.type) ? `${inner}\n\n` : inner;
  };
  return visit(value as AdfNode, 0).replace(/\n{3,}/g, '\n\n').trim();
}

const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (text: string) => text.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => entities[entity]).replace(/\\([!-/:-@[-`{-~])/g, '$1').replace(/​/g, '');

/** The inline Markdown Unfold writes (links, images as links, `**strong**`, `_em_`, `` `code` ``, backslash escapes and HTML entities) as ADF text nodes. */
export function inlineAdf(markdown: string): AdfNode[] {
  const out: AdfNode[] = [];
  const pattern = /!?\[([^\]\n]{0,500})\]\(([^)\s]{1,2048})\)|\*\*([^*\n]+)\*\*|(?<![\p{L}\p{N}])_([^_\n]+)_(?![\p{L}\p{N}])|`([^`\n]+)`/gu;
  let last = 0;
  const text = (value: string, marks?: AdfNode['marks']) => { const decoded = decode(value); if (decoded) out.push({ type: 'text', text: decoded, ...(marks ? { marks } : {}) }); };
  for (const match of markdown.matchAll(pattern)) {
    text(markdown.slice(last, match.index));
    last = match.index + match[0].length;
    if (match[2] !== undefined) {
      const href = safeHref(decode(match[2]));
      const label = match[1] || match[2];
      text(label, href ? [{ type: 'link', attrs: { href } }] : undefined);
    } else if (match[3] !== undefined) text(match[3], [{ type: 'strong' }]);
    else if (match[4] !== undefined) text(match[4], [{ type: 'em' }]);
    else if (match[5] !== undefined) out.push({ type: 'text', text: match[5], marks: [{ type: 'code' }] });
  }
  text(markdown.slice(last));
  const joined: AdfNode[] = [];
  for (const node of out) {
    const previous = joined.at(-1);
    if (previous && !previous.marks && !node.marks) previous.text = `${previous.text}${node.text}`;
    else joined.push(node);
  }
  return joined;
}

const paragraph = (lines: string[]): AdfNode => ({ type: 'paragraph', content: lines.flatMap((line, index) => [...(index ? [{ type: 'hardBreak' }] : []), ...inlineAdf(line)]) });
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());

/** Converts the Markdown Unfold writes for a tracker (headings, paragraphs, pipe tables, fenced code, bullet lists and the inline forms of `inlineAdf`) into an ADF document. */
export function markdownToAdf(markdown: string): AdfNode {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const content: AdfNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { content.push({ type: 'heading', attrs: { level: heading[1].length }, content: inlineAdf(heading[2]) }); index++; continue; }
    if (/^```/.test(line)) {
      const code: string[] = [];
      index++;
      while (index < lines.length && !/^```/.test(lines[index])) code.push(lines[index++]);
      index++;
      content.push({ type: 'codeBlock', ...(code.length ? { content: [{ type: 'text', text: code.join('\n') }] } : {}) });
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      let header = false;
      while (index < lines.length && /^\s*\|/.test(lines[index])) {
        const row = cells(lines[index++]);
        if (row.every(cell => /^:?-{3,}:?$/.test(cell))) { if (rows.length === 1) header = true; continue; }
        rows.push(row);
      }
      content.push({ type: 'table', content: rows.map((row, at) => ({ type: 'tableRow', content: row.map(cell => ({ type: header && at === 0 ? 'tableHeader' : 'tableCell', content: [{ type: 'paragraph', content: inlineAdf(cell) }] })) })) });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: AdfNode[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) items.push({ type: 'listItem', content: [paragraph([lines[index++].replace(/^\s*[-*]\s+/, '')])] });
      content.push({ type: 'bulletList', content: items });
      continue;
    }
    const block = [lines[index++]];
    while (index < lines.length && lines[index].trim() && !/^(#{1,6}\s|```|\s*\||\s*[-*]\s+)/.test(lines[index])) block.push(lines[index++]);
    content.push(paragraph(block));
  }
  return { type: 'doc', attrs: { version: 1 }, content };
}
