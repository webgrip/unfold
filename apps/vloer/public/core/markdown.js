import { escape, safeUrl } from './dom.js';

const maxListDepth = 6;
const maxQuoteDepth = 3;
const placeholder = /\u0001(\d+)\u0001/g;
const escapable = /\\(&(?:amp|lt|gt|quot|#39);|[!#$%()*+,\-./:;=?@[\]\\^_`{|}~])/g;
const bareUrl = /(^|[\s(])(https?:\/\/(?:(?!&(?:lt|gt|quot|#39);)[^\s<>"'`\u0000\u0001])+)/g;

const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

function link(href, label) {
  if (!safeUrl(href.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => entities[entity]))) return label;
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

function trimUrl(url) {
  let end = url.length;
  while (end > 0 && /[.,:;!?*_~]/.test(url[end - 1])) end--;
  let trimmed = url.slice(0, end);
  while (trimmed.endsWith(')') && (trimmed.match(/\(/g) || []).length < (trimmed.match(/\)/g) || []).length) trimmed = trimmed.slice(0, -1);
  return trimmed;
}

function emphasis(html) {
  return html
    .replace(/\*\*(?![\s*])([^*\n]+?)(?<![\s*])\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\p{L}\p{N}_])__(?![\s_])([^_\n]+?)(?<![\s_])__(?![\p{L}\p{N}_])/gu, '$1<strong>$2</strong>')
    .replace(/(^|[^\p{L}\p{N}*])\*(?![\s*])([^*\n]+?)(?<![\s*])\*(?![\p{L}\p{N}*])/gu, '$1<em>$2</em>')
    .replace(/(^|[^\p{L}\p{N}_])_(?![\s_])([^_\n]+?)(?<![\s_])_(?![\p{L}\p{N}_])/gu, '$1<em>$2</em>')
    .replace(/~~(?![\s~])([^~\n]+?)(?<![\s~])~~/g, '<del>$1</del>');
}

function inline(text) {
  const tokens = [];
  const keep = html => `\u0001${tokens.push(html) - 1}\u0001`;
  let html = text
    .replace(/`([^`\n]+)`/g, (_, code) => keep(`<code>${code}</code>`))
    .replace(escapable, (_, char) => keep(char))
    .replace(/\[([^\]\n]{1,500})\]\((https?:\/\/[^)\s\u0000\u0001]{1,2048})\)/g, (_, label, href) => keep(link(href, emphasis(label))))
    .replace(/&lt;(https?:\/\/(?:(?!&gt;)[^\s\u0000\u0001]){1,2048})&gt;/g, (_, href) => keep(link(href, href)))
    .replace(bareUrl, (_, before, url) => { const href = trimUrl(url); return `${before}${keep(link(href, href))}${url.slice(href.length)}`; });
  html = emphasis(html);
  for (let round = 0; round < 4 && /\u0001\d+\u0001/.test(html); round++) html = html.replace(placeholder, (_, index) => tokens[Number(index)] ?? '');
  return html;
}

function taskItem(text) {
  const task = /^\[( |x|X)\]\s+(.*)$/.exec(text);
  if (!task) return { open: '<li>', body: inline(text) };
  const done = task[1] !== ' ';
  return { open: '<li class="md-task">', body: `<span class="md-check${done ? ' done' : ''}" aria-hidden="true"></span><span class="sr-only">${done ? 'Done: ' : 'To do: '}</span>${inline(task[2])}` };
}

function headingLevel(outline, marks) {
  if (outline.first === null) outline.first = marks;
  let level = outline.base + Math.max(0, marks - outline.first);
  if (outline.previous !== null) level = Math.min(level, outline.previous + 1);
  level = Math.max(outline.base, Math.min(6, level));
  outline.previous = level;
  return level;
}

function blocks(lines, depth, outline) {
  const out = [];
  const lists = [];
  let paragraph = [];
  let quote = null;
  let blank = false;
  const flushParagraph = () => { if (paragraph.length) out.push(`<p>${paragraph.map(inline).join('<br>\n')}</p>`); paragraph = []; };
  const flushQuote = () => { if (quote) out.push(`<blockquote>${depth < maxQuoteDepth ? blocks(quote, depth + 1, outline) : `<p>${quote.map(inline).join('<br>\n')}</p>`}</blockquote>`); quote = null; };
  const closeLists = () => { while (lists.length) out.push(`</li></${lists.pop().tag}>`); };
  for (const raw of lines) {
    const line = raw.replace(/\t/g, '    ').trimEnd();
    if (!line) { flushParagraph(); flushQuote(); blank = true; continue; }
    const indent = line.length - line.trimStart().length;
    const text = line.trim();
    const code = /^\u0000\d+\u0000$/.test(text);
    const rule = /^(?:(?:\*[ ]*){3,}|(?:-[ ]*){3,}|(?:_[ ]*){3,})$/.test(text);
    const item = rule ? null : /^(?:[-*+]|(\d{1,9})[.)])\s+(.*)$/.exec(text);
    const quoted = /^&gt;\s?(.*)$/.exec(text);
    const heading = /^(#{1,6})\s+(.*)$/.exec(text);
    if (quoted && !(lists.length && indent >= 2)) { flushParagraph(); closeLists(); (quote ||= []).push(quoted[1]); blank = false; continue; }
    flushQuote();
    if (item) {
      flushParagraph();
      const entry = taskItem(item[2]);
      const tag = item[1] === undefined ? 'ul' : 'ol';
      const start = tag === 'ol' && Number(item[1]) !== 1 ? ` start="${Number(item[1])}"` : '';
      if (!lists.length || (indent >= lists.at(-1).indent + 2 && lists.length < maxListDepth)) { out.push(`<${tag}${start}>${entry.open}`); lists.push({ indent, tag }); }
      else {
        while (lists.length > 1 && indent < lists.at(-1).indent) out.push(`</li></${lists.pop().tag}>`);
        if (lists.at(-1).tag === tag) out.push(`</li>${entry.open}`);
        else { out.push(`</li></${lists.at(-1).tag}><${tag}${start}>${entry.open}`); lists.at(-1).tag = tag; }
      }
      out.push(entry.body);
      blank = false;
      continue;
    }
    if (lists.length && (indent >= 2 || !blank) && !heading && !rule && !quoted) {
      out.push(code ? text : `<br>\n${inline(text)}`);
      blank = false;
      continue;
    }
    closeLists();
    blank = false;
    if (code) { flushParagraph(); out.push(text); }
    else if (heading) { flushParagraph(); const level = headingLevel(outline, heading[1].length); out.push(`<h${level}>${inline(heading[2])}</h${level}>`); }
    else if (rule) { flushParagraph(); out.push('<hr>'); }
    else paragraph.push(text);
  }
  flushParagraph();
  flushQuote();
  closeLists();
  return out.join('');
}

/**
 * Renders the Markdown that trackers and agents write as HTML, escape-first: the whole text is escaped before any
 * tag is added, so nothing in it can become markup. Supports paragraphs with line breaks, headings, bullet, numbered
 * and task lists with nesting, quotes, rules, fenced code blocks, inline code, bold, emphasis,
 * strikethrough, backslash escapes and http(s) links (Markdown links, `<url>` and bare URLs), which open in a new tab.
 * The first heading becomes `baseLevel` (h3 by default, below the card or section that holds the text); later
 * headings keep their distance from it but never skip a level, and none goes above `baseLevel` or below h6.
 * @param {string|null|undefined} text
 * @param {{ baseLevel?: number }} [options]
 * @returns {string}
 */
export function markdown(text, { baseLevel = 3 } = {}) {
  const fences = [];
  const html = escape(String(text ?? '').replace(/[\u0000\u0001]/g, '').replace(/\r\n?/g, '\n'))
    .replace(/```([a-z0-9_-]*)\n?([\s\S]*?)```/g, (_, lang, code) => { fences.push(`<pre class="md-code"${lang ? ` data-lang="${lang}"` : ''}>${code.replace(/\n[ ]*$/, '')}</pre>`); return `\u0000${fences.length - 1}\u0000`; });
  const outline = { base: Math.max(1, Math.min(6, Math.trunc(Number(baseLevel)) || 3)), first: null, previous: null };
  return blocks(html.split('\n'), 0, outline).replace(/\u0000(\d+)\u0000/g, (_, index) => fences[Number(index)] ?? '');
}
