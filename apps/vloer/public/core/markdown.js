import { escape } from './dom.js';

/** Renders the Markdown subset agents write (code fences, inline code, bold, links, lists and headings) as escaped HTML. */
export function markdown(text) {
  const blocks = [];
  let html = escape(text || '').replace(/```([a-z0-9_-]*)\n?([\s\S]*?)```/g, (_, lang, code) => { blocks.push(`<pre class="md-code"${lang ? ` data-lang="${escape(lang)}"` : ''}>${code.replace(/\n$/, '')}</pre>`); return `\u0000${blocks.length - 1}\u0000`; });
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const out = []; let list = null;
  for (const line of html.split('\n')) {
    const item = /^\s*(?:[-*]|\d+[.)])\s+(.*)$/.exec(line);
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (item) { if (!list) { list = []; } list.push(`<li>${item[1]}</li>`); continue; }
    if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
    if (heading) out.push(`<h${heading[1].length + 2}>${heading[2]}</h${heading[1].length + 2}>`);
    else if (/^\u0000\d+\u0000$/.test(line.trim())) out.push(line.trim());
    else if (line.trim()) out.push(`<p>${line}</p>`);
  }
  if (list) out.push(`<ul>${list.join('')}</ul>`);
  return out.join('').replace(/\u0000(\d+)\u0000/g, (_, index) => blocks[Number(index)]);
}
