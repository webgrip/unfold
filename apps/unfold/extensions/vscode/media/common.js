function brandMark() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  for (const [d, part] of [['M54.61 6.826L8.824 26.31A2.5 2.5 0 0 0 8.643 30.825L27.671 40.792A2.1 2.1 0 0 0 30.254 40.281L56.347 9.17A1.5 1.5 0 0 0 54.61 6.826Z', 'sheet'], ['M55.414 21.903L45.927 55.474A2.5 2.5 0 0 1 41.754 56.562L32.699 47.507A2.1 2.1 0 0 1 32.575 44.672L52.822 20.532A1.5 1.5 0 0 1 55.414 21.903Z', 'fold']]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', `brand-${part}`);
    svg.append(path);
  }
  return svg;
}

function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false || value === null) continue;
    if (name === 'className') node.className = value;
    else if (name === 'text') node.textContent = value;
    else if (name === 'disabled') node.disabled = Boolean(value);
    else if (name === 'checked') node.checked = Boolean(value);
    else if (name === 'open') node.open = Boolean(value);
    else if (name === 'value') node.value = value;
    else node.setAttribute(name, String(value));
  }
  for (const child of children.flat(Infinity)) if (child !== undefined && child !== null && child !== false) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}

function action(label, type, attributes = {}, ...children) { return element('button', { type: 'button', 'data-action': type, ...attributes }, label, ...children); }
function currency(value) { const amount = value || 0; const digits = amount > 0 && amount < 0.01 ? 5 : amount > 0 && amount < 1 ? 4 : 2; return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: digits }).format(amount); }
function readable(value) { return String(value ?? '').replaceAll('_', ' ').replaceAll('.', ' · '); }
function clock(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function ago(value) { const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000)); return !Number.isFinite(seconds) ? '' : seconds < 45 ? 'just now' : seconds < 3600 ? `${Math.round(seconds / 60)}m ago` : seconds < 86400 ? `${Math.round(seconds / 3600)}h ago` : `${Math.round(seconds / 86400)}d ago`; }
function duration(start, end) { if (!start) return ''; const seconds = Math.max(0, Math.round((Date.parse(end || new Date().toISOString()) - Date.parse(start)) / 1000)); return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`; }
function announce(text) { const node = document.getElementById('announcement'); if (node) node.textContent = text; }
function fact(label, value, attributes = {}) { return element('div', { className: 'fact', ...attributes }, element('dt', {}, label), element('dd', {}, value)); }
function safeHttps(value) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : ''; } catch { return ''; } }
function inline(text) {
  const fragment = document.createDocumentFragment();
  const pattern = /(\\[\\`*_[\]{}()#+\-.!<>~|&])|(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]\n]+\]\([^)\s]+\))/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) fragment.append(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('\\')) fragment.append(token.slice(1));
    else if (token.startsWith('`')) fragment.append(element('code', {}, token.slice(1, -1)));
    else if (token.startsWith('**') || token.startsWith('__')) fragment.append(element('strong', {}, inline(token.slice(2, -2))));
    else if (token.startsWith('[')) { const [, label, url] = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/); const target = safeHttps(url); fragment.append(element('span', { className: target ? 'link-text openable' : 'link-text', 'data-open-url': target || undefined, role: target ? 'link' : undefined, tabindex: target ? '0' : undefined, title: target || undefined }, inline(label)), element('span', { className: 'link-target' }, ` (${target ? new URL(target).host : url})`)); }
    else fragment.append(element('em', {}, inline(token.slice(1, -1))));
    last = match.index + token.length;
  }
  if (last < text.length) fragment.append(text.slice(last));
  return fragment;
}

function markdown(text) {
  const root = element('div', { className: 'markdown' });
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  let index = 0;
  let paragraph = [];
  const flush = () => { if (paragraph.length) { root.append(element('p', {}, inline(paragraph.join(' ')))); paragraph = []; } };
  while (index < lines.length) {
    const line = lines[index];
    const fence = line.match(/^\s*(`{3,}|~{3,})\s*(\S*)/);
    if (fence) {
      flush();
      const body = [];
      index++;
      while (index < lines.length && !lines[index].startsWith(fence[1])) body.push(lines[index++]);
      index++;
      root.append(element('pre', { 'data-language': fence[2] || undefined }, element('code', {}, body.join('\n'))));
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { flush(); root.append(element(heading[1].length <= 2 ? 'h3' : 'h4', {}, inline(heading[2].trim()))); index++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); root.append(element('hr')); index++; continue; }
    if (/^\s*>/.test(line)) {
      flush();
      const quote = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
      root.append(element('blockquote', {}, markdown(quote.join('\n'))));
      continue;
    }
    const listItem = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (listItem) {
      flush();
      const ordered = /\d/.test(listItem[2]);
      const list = element(ordered ? 'ol' : 'ul');
      while (index < lines.length) {
        const item = lines[index].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!item || /\d/.test(item[2]) !== ordered) break;
        const content = [item[3]];
        index++;
        while (index < lines.length && /^\s{2,}\S/.test(lines[index]) && !lines[index].match(/^\s*([-*+]|\d+[.)])\s+/)) content.push(lines[index++].trim());
        const text = content.join(' ');
        const check = text.match(/^\[( |x|X)\]\s+(.*)$/);
        list.append(check ? element('li', { className: 'task-item' }, element('span', { className: 'check', role: 'img', 'aria-label': check[1] === ' ' ? 'not done' : 'done' }, check[1] === ' ' ? '☐' : '☑'), ' ', inline(check[2])) : element('li', {}, inline(text)));
      }
      root.append(list);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && index + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[index + 1])) {
      flush();
      const cells = value => value.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      const table = element('table');
      table.append(element('thead', {}, element('tr', {}, ...cells(line).map(cell => element('th', {}, inline(cell))))));
      const body = element('tbody');
      index += 2;
      while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) body.append(element('tr', {}, ...cells(lines[index++]).map(cell => element('td', {}, inline(cell)))));
      table.append(body);
      root.append(element('div', { className: 'table-scroll' }, table));
      continue;
    }
    if (!line.trim()) { flush(); index++; continue; }
    paragraph.push(line.trim());
    index++;
  }
  flush();
  return root;
}

document.addEventListener('keydown', event => { if (event.key !== 'Enter' && event.key !== ' ') return; const link = event.target.closest?.('[role="link"][data-open-url]'); if (link) { event.preventDefault(); link.click(); } });
