/** The Markdown to produce: CommonMark with backslash escapes, or `vloer`, the subset that Vloer's browser renderer (`public/core/markdown.js`) displays without escapes. */
export type MarkdownDialect = 'commonmark' | 'vloer';

type Child = Element | string;
type Element = { tag: string; attrs: Map<string, string>; children: Child[] };
type Token = { kind: 'text'; text: string } | { kind: 'open'; tag: string; attrs: Map<string, string>; selfClosing: boolean } | { kind: 'close'; tag: string };

const maxInput = 262144;
const maxOutput = 65536;
const maxDepth = 48;
const voids = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const skipped = new Set(['script', 'style', 'iframe', 'noscript', 'template', 'textarea', 'title', 'object', 'svg', 'math', 'head', 'frameset', 'frame', 'xmp', 'select', 'button', 'canvas', 'audio', 'video']);
const blocks = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'hr', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'dl', 'dt', 'dd', 'details', 'summary', 'address', 'center', 'form', 'fieldset', 'legend', 'body', 'html']);
const closesParagraph = new Set(['p', 'div', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote', 'table', 'hr', 'section', 'article', 'header', 'footer', 'dl', 'figure', 'details']);
const entities = new Map(Object.entries({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶', deg: '°', plusmn: '±', times: '×', divide: '÷', larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', check: '✓', shy: '' }));

function decode(text: string): string {
  return text.replace(/&(#[0-9]{1,8}|#[xX][0-9a-fA-F]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31})(;?)/g, (match, body: string, semicolon: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return !Number.isFinite(code) || code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? '�' : String.fromCodePoint(code);
    }
    const value = entities.get(body) ?? entities.get(body.toLowerCase());
    return value === undefined || (!semicolon && !['amp', 'lt', 'gt', 'quot', 'nbsp'].includes(body.toLowerCase())) ? match : value;
  });
}

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const n = html.length;
  let i = 0;
  const text = (value: string) => { if (value) tokens.push({ kind: 'text', text: decode(value) }); };
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { text(html.slice(i)); break; }
    text(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) { const end = html.indexOf('-->', lt + 4); i = end === -1 ? n : end + 3; continue; }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') { const end = html.indexOf('>', lt); i = end === -1 ? n : end + 1; continue; }
    const head = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]{0,63})/.exec(html.slice(lt, lt + 66));
    if (!head) { text('<'); i = lt + 1; continue; }
    const tag = head[2].toLowerCase();
    const attrs = new Map<string, string>();
    let j = lt + head[0].length;
    let selfClosing = false;
    while (j < n && html[j] !== '>') {
      if (/\s/.test(html[j]) || html[j] === '/') { selfClosing = html[j] === '/'; j++; continue; }
      selfClosing = false;
      const start = j;
      while (j < n && !/[\s/>=]/.test(html[j])) j++;
      const name = html.slice(start, j).toLowerCase();
      if (!name) { j++; continue; }
      while (j < n && /\s/.test(html[j])) j++;
      let value = '';
      if (html[j] === '=') {
        j++;
        while (j < n && /\s/.test(html[j])) j++;
        if (html[j] === '"' || html[j] === "'") {
          const end = html.indexOf(html[j], j + 1);
          value = html.slice(j + 1, end === -1 ? n : end);
          j = end === -1 ? n : end + 1;
        } else {
          const begin = j;
          while (j < n && !/[\s>]/.test(html[j])) j++;
          value = html.slice(begin, j);
        }
      }
      if (!attrs.has(name) && attrs.size < 32) attrs.set(name, decode(value));
    }
    i = j + 1;
    if (head[1]) { tokens.push({ kind: 'close', tag }); continue; }
    if (skipped.has(tag)) {
      if (selfClosing) continue;
      const close = new RegExp(`</${tag}\\s*>`, 'ig');
      close.lastIndex = i;
      const found = close.exec(html);
      i = found ? found.index + found[0].length : n;
      continue;
    }
    tokens.push({ kind: 'open', tag, attrs, selfClosing });
  }
  return tokens;
}

function parse(html: string): Element {
  const root: Element = { tag: '#root', attrs: new Map(), children: [] };
  const stack: Element[] = [root];
  const top = () => stack[stack.length - 1];
  const popTo = (index: number) => { stack.length = Math.max(1, index); };
  const nearest = (tags: string[], boundary: string[]) => { for (let k = stack.length - 1; k > 0; k--) { if (tags.includes(stack[k].tag)) return k; if (boundary.includes(stack[k].tag)) return -1; } return -1; };
  for (const token of tokenize(html)) {
    if (token.kind === 'text') {
      const children = top().children;
      if (typeof children[children.length - 1] === 'string') children[children.length - 1] += token.text; else children.push(token.text);
      continue;
    }
    if (token.kind === 'close') {
      if (token.tag === 'br') { top().children.push({ tag: 'br', attrs: new Map(), children: [] }); continue; }
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].tag === token.tag) { popTo(k); break; }
      continue;
    }
    if (closesParagraph.has(token.tag) && top().tag === 'p') stack.pop();
    if (token.tag === 'li') { const open = nearest(['li'], ['ul', 'ol']); if (open > 0) popTo(open); }
    if (token.tag === 'dt' || token.tag === 'dd') { const open = nearest(['dt', 'dd'], ['dl']); if (open > 0) popTo(open); }
    if (token.tag === 'td' || token.tag === 'th') { const open = nearest(['td', 'th'], ['tr', 'table']); if (open > 0) popTo(open); }
    if (token.tag === 'tr') { const open = nearest(['tr'], ['table']); if (open > 0) popTo(open); }
    const open = !voids.has(token.tag) && !token.selfClosing;
    if (open && stack.length >= maxDepth) continue;
    const element: Element = { tag: token.tag, attrs: token.attrs, children: [] };
    top().children.push(element);
    if (open) stack.push(element);
  }
  return root;
}

function escapeText(text: string): string { return text.replace(/[\\`*_[\]<>~|&]/g, '\\$&'); }
function escapeLineStart(line: string): string { return line.replace(/^(\s*)([#+=-])/, '$1\\$2').replace(/^(\s*)(\d{1,9})([.)])/, '$1$2\\$3'); }
function textContent(node: Child): string { return typeof node === 'string' ? node : node.tag === 'br' ? '\n' : node.children.map(textContent).join(''); }
function oneLine(text: string): string { return text.replace(/\s*\n\s*/g, ' ').replace(/ {2,}/g, ' ').trim(); }

function safeUrl(value: string | undefined, base?: string): string | undefined {
  if (!value) return undefined;
  const raw = value.replace(/[\u0000- \u007f]+/g, '');
  if (!raw) return undefined;
  let url: URL;
  try { url = base ? new URL(raw, base) : new URL(raw); } catch { return undefined; }
  if (!['http:', 'https:', 'mailto:'].includes(url.protocol) || url.username || url.password) return undefined;
  return url.href.replace(/[()<>[\]\\\s]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

function wrap(marker: string, inner: string): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner)!;
  return match[2] ? `${match[1]}${marker}${match[2]}${marker}${match[3]}` : inner;
}

function codeSpan(text: string): string {
  const content = text.replace(/\n/g, ' ');
  if (!content) return '';
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map(run => run.length));
  const fence = '`'.repeat(longest + 1);
  const pad = /^[` ]|[` ]$/.test(content) ? ' ' : '';
  return `${fence}${pad}${content}${pad}${fence}`;
}

class Renderer {
  private readonly base?: string;
  private readonly subset: boolean;
  constructor(base?: string, dialect: MarkdownDialect = 'commonmark') { this.base = base; this.subset = dialect === 'vloer'; }

  text(value: string): string { return this.subset ? value : escapeText(value); }
  lineStart(line: string): string { return this.subset ? line : escapeLineStart(line); }
  linkText(value: string): string { return this.subset ? value.replace(/\[/g, '(').replace(/\]/g, ')') : value; }

  codeSpan(text: string): string {
    if (!this.subset) return codeSpan(text);
    const content = text.replace(/\n/g, ' ');
    return !content.trim() || content.includes('`') ? content : `\`${content}\``;
  }

  inline(children: Child[]): string {
    return children.map(child => {
      if (typeof child === 'string') return this.text(child.replace(/\s+/g, ' ').replace(/[­]/g, ''));
      const inner = () => this.inline(child.children);
      switch (child.tag) {
        case 'br': return '\n';
        case 'strong': case 'b': return wrap('**', inner());
        case 'em': case 'i': case 'cite': case 'dfn': return this.subset ? inner() : wrap('*', inner());
        case 's': case 'del': case 'strike': return wrap('~~', inner());
        case 'code': case 'kbd': case 'samp': case 'tt': return this.codeSpan(textContent(child));
        case 'a': {
          const href = safeUrl(child.attrs.get('href'), this.base);
          const text = inner();
          if (!href) return text;
          if (this.subset && href.startsWith('mailto:')) { const address = href.slice(7); return !text.trim() ? address : text.includes(address) ? text : `${text} (${address})`; }
          return `[${text.trim() ? this.linkText(text.replace(/\n/g, ' ')) : this.text(href)}](${href})`;
        }
        case 'img': {
          const alt = this.text(oneLine(child.attrs.get('alt') || child.attrs.get('title') || 'image'));
          const src = safeUrl(child.attrs.get('src'), this.base);
          if (this.subset) return src && !src.startsWith('mailto:') ? `[image: ${this.linkText(alt)}](${src})` : `[image: ${alt}]`;
          return src ? `[image: ${alt}](${src})` : `\\[image: ${alt}\\]`;
        }
        case 'input': return '';
        default: return blocks.has(child.tag) ? ` ${inner()} ` : inner();
      }
    }).join('');
  }

  paragraph(children: Child[]): string {
    const lines = this.inline(children).split('\n').map(line => line.replace(/ {2,}/g, ' ').trim());
    while (lines.length && !lines[0]) lines.shift();
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    return lines.map(line => this.lineStart(line)).join(this.subset ? '\n' : '  \n');
  }

  blocks(children: Child[]): string[] { return this.parts(children).map(part => part.text); }

  parts(children: Child[]): { text: string; list: boolean }[] {
    const out: { text: string; list: boolean }[] = [];
    let run: Child[] = [];
    const flush = () => { const text = this.paragraph(run); if (text) out.push({ text, list: false }); run = []; };
    for (const child of children) {
      if (typeof child === 'string' || !blocks.has(child.tag)) { run.push(child); continue; }
      flush();
      const rendered = this.block(child);
      if (rendered.trim()) out.push({ text: rendered, list: child.tag === 'ul' || child.tag === 'ol' });
    }
    flush();
    return out;
  }

  block(node: Element): string {
    const heading = /^h([1-6])$/.exec(node.tag);
    if (heading) { const text = oneLine(this.inline(node.children)); return text ? `${'#'.repeat(this.subset ? Math.min(4, Number(heading[1])) : Number(heading[1]))} ${this.lineStart(text)}` : ''; }
    switch (node.tag) {
      case 'hr': return this.subset ? '' : '---';
      case 'ul': case 'ol': return this.list(node);
      case 'li': return this.list({ tag: 'ul', attrs: new Map(), children: [node] });
      case 'pre': return this.code(node);
      case 'table': return this.table(node);
      case 'blockquote': return this.blocks(node.children).join('\n\n').split('\n').map(line => line ? `> ${line}` : '>').join('\n');
      default: return this.blocks(node.children).join('\n\n');
    }
  }

  list(node: Element): string {
    const ordered = node.tag === 'ol';
    const taskList = node.attrs.get('data-type') === 'taskList';
    const start = Number(node.attrs.get('start'));
    let number = ordered && Number.isSafeInteger(start) && start >= 0 && start < 1e9 ? start : 1;
    const items: string[] = [];
    for (const child of node.children) {
      if (typeof child === 'string') { if (child.trim()) items.push(`- ${this.lineStart(this.text(oneLine(child)))}`); continue; }
      if (child.tag !== 'li') { const nested = this.block(child); if (nested.trim()) items.push(nested); continue; }
      const checked = child.attrs.get('data-checked');
      const task = taskList || checked !== undefined || child.attrs.get('data-type') === 'taskItem';
      const marker = ordered ? `${number++}.` : '-';
      const prefix = task ? `${marker} [${checked === 'true' ? 'x' : ' '}] ` : `${marker} `;
      const body = this.parts(child.children).map((part, index) => (index === 0 ? '' : part.list ? '\n' : '\n\n') + part.text).join('').split('\n');
      const indent = ' '.repeat(marker.length + 1);
      items.push([prefix + (body[0] ?? ''), ...body.slice(1).map(line => line ? indent + line : '')].join('\n').trimEnd());
    }
    return items.join('\n');
  }

  code(node: Element): string {
    const inner = node.children.find((child): child is Element => typeof child !== 'string' && child.tag === 'code');
    const declared = /(?:^|\s)language-([A-Za-z0-9+#.-]{1,30})(?:\s|$)/.exec(inner?.attrs.get('class') ?? '')?.[1] ?? '';
    const language = this.subset ? (/^[a-z0-9_-]+$/.test(declared.toLowerCase()) ? declared.toLowerCase() : '') : declared;
    const content = textContent(node).replace(/^\n/, '').replace(/\n$/, '');
    if (this.subset) return `\`\`\`${language}\n${content}\n\`\`\``;
    const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map(run => run.length));
    const fence = '`'.repeat(Math.max(3, longest + 1));
    return `${fence}${language}\n${content}\n${fence}`;
  }

  table(node: Element): string {
    const rows: Element[] = [];
    const collect = (element: Element, depth: number) => { for (const child of element.children) if (typeof child !== 'string' && rows.length < 200) { if (child.tag === 'tr') rows.push(child); else if (depth < 3 && ['thead', 'tbody', 'tfoot'].includes(child.tag)) collect(child, depth + 1); } };
    collect(node, 0);
    const cells = rows.map(row => row.children.filter((child): child is Element => typeof child !== 'string' && (child.tag === 'td' || child.tag === 'th')).slice(0, 20).map(cell => oneLine(this.inline(cell.children))));
    const width = Math.max(0, ...cells.map(row => row.length));
    if (!width) return '';
    if (this.subset) return cells.filter(row => row.some(Boolean)).map(row => `- ${row.join(' | ')}`).join('\n');
    const line = (row: string[]) => `| ${Array.from({ length: width }, (_, index) => row[index] ?? '').join(' | ')} |`;
    return [line(cells[0]), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...cells.slice(1).map(line)].join('\n');
  }
}

/** Converts tracker HTML (such as Vikunja's TipTap output) to inert Markdown text in the given dialect; links and images are kept only for http(s) and mailto URLs, resolved against `base` when given. */
export function htmlToMarkdown(html: string, base?: string, dialect: MarkdownDialect = 'commonmark'): string {
  const source = html.slice(0, maxInput).replace(/\r\n?/g, '\n');
  const renderer = new Renderer(base, dialect);
  const markdown = renderer.blocks(parse(source).children).join('\n\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return markdown.length > maxOutput ? markdown.slice(0, maxOutput).replace(/[\ud800-\udbff]$/, '') : markdown;
}

/** Reports whether tracker text contains HTML markup rather than plain text or Markdown. */
export function looksLikeHtml(text: string): boolean {
  return /<\/?(?:p|br|div|span|strong|b|em|i|s|u|code|pre|ul|ol|li|h[1-6]|blockquote|a|hr|img|table|tr|td|th|label|input)(?:\s[^>]*)?\/?>/i.test(text);
}
