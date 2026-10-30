/** One inbound email reduced to what a Request keeps: never its attachment contents, never its HTML. */
export type ParsedMail = {
  from: { name: string | null; email: string } | null;
  subject: string;
  text: string;
  messageId: string | null;
  replyTo: string[];
  attachments: string[];
};

const limits = { depth: 6, parts: 60, attachments: 20, name: 200, ids: 30 } as const;

type Part = { headers: Map<string, string>; body: string };

function splitHeaders(raw: string): Part {
  const match = /\r?\n\r?\n/.exec(raw);
  const head = match ? raw.slice(0, match.index) : raw;
  const body = match ? raw.slice(match.index + match[0].length) : '';
  const headers = new Map<string, string>();
  let last = '';
  for (const line of head.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && last) { headers.set(last, `${headers.get(last)} ${line.trim()}`); continue; }
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    last = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (!headers.has(last)) headers.set(last, /[\x80-\xff]/.test(value) ? Buffer.from(value, 'latin1').toString('utf8') : value);
  }
  return { headers, body };
}

function parameters(value: string): { value: string; params: Map<string, string> } {
  const [first, ...rest] = value.split(';');
  const params = new Map<string, string>();
  for (const item of rest) {
    const eq = item.indexOf('=');
    if (eq < 1) continue;
    const key = item.slice(0, eq).trim().toLowerCase();
    let text = item.slice(eq + 1).trim();
    if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1).replace(/\\(.)/g, '$1');
    if (key.endsWith('*')) {
      const extended = /^([^']*)'[^']*'(.*)$/.exec(text);
      if (extended) {
        try { text = decodeCharset(Buffer.from(decodeURIComponent(extended[2].replace(/%(?![0-9a-f]{2})/gi, '%25')), 'utf8').toString('latin1'), extended[1] || 'utf-8'); } catch { text = extended[2]; }
      }
      params.set(key.slice(0, -1), text);
    } else if (!params.has(key)) params.set(key, text);
  }
  return { value: first.trim().toLowerCase(), params };
}

function decodeCharset(bytes: string, charset: string): string {
  const buffer = Buffer.from(bytes, 'latin1');
  try { return new TextDecoder(charset.trim().toLowerCase() || 'utf-8').decode(buffer); }
  catch { return new TextDecoder('utf-8').decode(buffer); }
}

function decodeTransfer(body: string, encoding: string): string {
  if (encoding === 'base64') return Buffer.from(body.replace(/[^A-Za-z0-9+/=]/g, ''), 'base64').toString('latin1');
  if (encoding === 'quoted-printable') return body.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return body;
}

/** Decodes the RFC 2047 encoded words in a header value, such as `=?utf-8?B?SGFsbG8=?=`. */
export function decodeWords(value: string): string {
  return value.replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g, '$1').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset: string, kind: string, data: string) => {
    const bytes = kind.toUpperCase() === 'B' ? Buffer.from(data, 'base64').toString('latin1') : data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (__, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    return decodeCharset(bytes, charset.split('*')[0]);
  });
}

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', euro: '€', copy: '©' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
    }
    return entities[name.toLowerCase()] ?? whole;
  });
}

/**
 * Plain text from an HTML body: scripts, styles, comments and the head are dropped, block ends become line breaks,
 * a link keeps its address in brackets, every remaining tag is removed and entities are decoded. No HTML survives.
 */
export function htmlToText(html: string): string {
  const lower = html.toLowerCase();
  const out: string[] = [];
  const closes = new Map<string, number>();
  const closing = (name: string, from: number): number | undefined => {
    let at = Math.max(closes.get(name) ?? from, from);
    if (closes.get(name) === -1) return undefined;
    for (;;) {
      at = lower.indexOf(`</${name}`, at);
      if (at === -1) { closes.set(name, -1); return undefined; }
      let end = at + name.length + 2;
      while (end < html.length && /\s/.test(html[end])) end++;
      if (html[end] === '>') { closes.set(name, at); return end + 1; }
      at = end;
    }
  };
  let nextGt = 0;
  let commentEnd = 0;
  let link: { at: number; href: string } | undefined;
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { out.push(html.slice(i)); break; }
    out.push(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) {
      if (commentEnd < lt + 4) commentEnd = html.indexOf('-->', lt + 4);
      if (commentEnd === -1) break;
      i = commentEnd + 3;
      continue;
    }
    if (nextGt !== -1 && nextGt <= lt) nextGt = html.indexOf('>', lt + 1);
    const nextLt = html.indexOf('<', lt + 1);
    if (nextGt === -1 || (nextLt !== -1 && nextLt < nextGt)) { i = lt + 1; continue; }
    const tag = html.slice(lt, nextGt + 1);
    i = nextGt + 1;
    const head = /^<(\/?)([a-z][a-z0-9]*)\b/i.exec(tag);
    if (!head) continue;
    const name = head[2].toLowerCase();
    if (head[1]) {
      if (name === 'a' && link && /^<\/a\s*>$/i.test(tag)) {
        const label = out.splice(link.at).join('').trim();
        out.push(/^https?:\/\//i.test(link.href) && decodeEntities(label) !== link.href ? `${label} (${link.href})` : label);
        link = undefined;
      } else if (!link && /^(p|div|h[1-6]|tr|table|blockquote|ul|ol|section|article|header|footer)$/.test(name) && /^<\/[a-z0-9]+\s*>$/i.test(tag)) out.push('\n\n');
      continue;
    }
    if (['script', 'style', 'head', 'template', 'noscript'].includes(name)) {
      const end = closing(name, lt + name.length + 1);
      if (end !== undefined) i = end;
      continue;
    }
    if (name === 'a' && !link) {
      const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
      if (href && closing('a', i) !== undefined) link = { at: out.length, href: decodeEntities(href[1] ?? href[2] ?? '').trim() };
      continue;
    }
    if (link) continue;
    if (name === 'br' && /^<br\s*\/?>$/i.test(tag)) out.push('\n');
    else if (name === 'li') out.push('\n- ');
  }
  return tidy(decodeEntities(out.join('').replace(/[<>]/g, '')));
}

function tidy(text: string): string {
  return text.replace(/\r\n?/g, '\n').split('\n').map(line => line.replace(/[ \t ]+/g, ' ').trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The reply above the quoted thread: lines from the first `On … wrote:` (or `Op … schreef …:`) on, and `>` lines, are dropped. */
export function withoutQuote(text: string): string {
  const lines = text.split('\n');
  const cut = lines.findIndex(line => /^(On\s.{1,300}\swrote:|Op\s.{1,300}\sschreef\s.{0,200}:)\s*$/.test(line.trim()) || /^-{2,}\s*(Original Message|Oorspronkelijk bericht)\s*-{2,}$/i.test(line.trim()));
  const kept = (cut >= 0 ? lines.slice(0, cut) : lines).filter(line => !line.startsWith('>'));
  const result = tidy(kept.join('\n'));
  return result || tidy(text);
}

/** The name and address of an RFC 5322 mailbox such as `"Jane Smith" <jane@example.com>`; null without an address. */
export function mailbox(value: string | undefined | null): { name: string | null; email: string } | null {
  if (!value) return null;
  const decoded = decodeWords(value).trim();
  let end = 0;
  for (let at = decoded.indexOf('<'); at !== -1;) {
    const next = decoded.indexOf('<', at + 1);
    if (end <= at) end = decoded.indexOf('>', at + 1);
    if (end === -1) break;
    const address = next !== -1 && next < end ? null : /^<\s*([^<>\s]+)\s*>$/.exec(decoded.slice(at, end + 1));
    if (address && address[1].slice(1, -1).includes('@')) {
      const name = decoded.slice(0, at).trim().replace(/^"(.*)"$/, '$1').replace(/\\(.)/g, '$1').trim();
      return { name: name || null, email: address[1].toLowerCase() };
    }
    at = next;
  }
  const bare = decoded.split(/[\s<>(),;:"]+/).find(word => word.slice(1, -1).includes('@'));
  if (!bare) return null;
  const open = decoded.indexOf('(');
  const close = open === -1 ? -1 : decoded.indexOf(')', open + 1);
  const comment = close === -1 ? undefined : decoded.slice(open + 1, close).trim();
  return { name: comment || null, email: bare.toLowerCase() };
}

/** Every `<message-id>` in a Message-ID, In-Reply-To or References value. */
export function messageIds(value: string | undefined | null): string[] {
  if (!value) return [];
  return [...value.matchAll(/<([^<>\s]{1,500})>/g)].map(match => match[1]).slice(0, limits.ids);
}

type Collected = { plain: string[]; html: string[]; attachments: string[] };

function walk(part: Part, collected: Collected, depth: number): void {
  if (depth > limits.depth || collected.plain.length + collected.html.length + collected.attachments.length > limits.parts) return;
  const type = parameters(part.headers.get('content-type') ?? 'text/plain; charset=us-ascii');
  const disposition = parameters(part.headers.get('content-disposition') ?? '');
  const encoding = (part.headers.get('content-transfer-encoding') ?? '7bit').trim().toLowerCase();
  if (type.value.startsWith('multipart/')) {
    const boundary = type.params.get('boundary');
    if (!boundary) return;
    const delimiter = `--${boundary}`;
    const sections = part.body.split(new RegExp(`(?:^|\\r?\\n)${delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    for (const section of sections.slice(1)) {
      if (section.startsWith('--')) break;
      walk(splitHeaders(section.replace(/^[ \t]*\r?\n/, '')), collected, depth + 1);
    }
    return;
  }
  const filename = disposition.params.get('filename') ?? type.params.get('name');
  if (disposition.value === 'attachment' || filename || type.value === 'message/rfc822') {
    if (collected.attachments.length < limits.attachments) collected.attachments.push(decodeWords(filename ?? (type.value === 'message/rfc822' ? 'forwarded-message.eml' : 'attachment')).replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, limits.name));
    return;
  }
  const text = decodeCharset(decodeTransfer(part.body, encoding), type.params.get('charset') ?? 'utf-8');
  if (type.value === 'text/html') collected.html.push(text);
  else if (type.value === 'text/plain' || type.value === '') collected.plain.push(text);
}

function body(collected: Collected): string {
  const plain = collected.plain.map(tidy).find(Boolean);
  if (plain) return plain;
  const html = collected.html.map(htmlToText).find(Boolean);
  return html ?? '';
}

/**
 * Parses a raw RFC 5322 message, multipart (RFC 2046) or not: subject, sender, text, threading ids and attachment
 * names. `raw` holds the message's bytes one character per byte, as `Buffer.toString('latin1')` gives them.
 */
export function parseMime(raw: string): ParsedMail {
  const top = splitHeaders(raw.replace(/^﻿/, ''));
  const collected: Collected = { plain: [], html: [], attachments: [] };
  walk(top, collected, 0);
  return {
    from: mailbox(top.headers.get('from')),
    subject: decodeWords(top.headers.get('subject') ?? '').replace(/\s+/g, ' ').trim(),
    text: body(collected),
    messageId: messageIds(top.headers.get('message-id'))[0] ?? null,
    replyTo: [...new Set([...messageIds(top.headers.get('in-reply-to')), ...messageIds(top.headers.get('references')).reverse()])],
    attachments: collected.attachments,
  };
}

const text = (value: unknown) => typeof value === 'string' ? value : '';

function headerValue(headers: unknown, name: string): string | undefined {
  const lower = name.toLowerCase();
  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (Array.isArray(entry) && typeof entry[0] === 'string' && entry[0].toLowerCase() === lower) return text(entry[1]);
      if (entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).Name === 'string' && ((entry as Record<string, string>).Name).toLowerCase() === lower) return text((entry as Record<string, unknown>).Value);
    }
    return undefined;
  }
  if (headers && typeof headers === 'object') {
    const key = Object.keys(headers).find(item => item.toLowerCase() === lower);
    return key ? text((headers as Record<string, unknown>)[key]) : undefined;
  }
  if (typeof headers === 'string') return splitHeaders(`${headers}\r\n\r\n`).headers.get(lower);
  return undefined;
}

function attachmentNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limits.attachments).map(entry => entry && typeof entry === 'object' ? text((entry as Record<string, unknown>).Name ?? (entry as Record<string, unknown>).filename ?? (entry as Record<string, unknown>).name) : text(entry)).filter(Boolean).map(name => name.replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, limits.name));
}

/**
 * Parses an inbound-mail JSON body: Postmark's inbound webhook (`From`, `Subject`, `TextBody`, `HtmlBody`, `Headers`,
 * `Attachments`), a raw message wrapped as `raw`, `mime` or `email`, or Unfold's own shape `{from, subject, text,
 * html, messageId, inReplyTo, references, headers, attachments}`. Undefined when the body is none of these.
 */
export function parseInboundJson(payload: Record<string, unknown>): ParsedMail | undefined {
  for (const key of ['raw', 'mime', 'email']) {
    const value = payload[key];
    if (typeof value === 'string' && /^[A-Za-z-]+:/m.test(value) && /\r?\n\r?\n/.test(value)) return parseMime(Buffer.from(value, 'utf8').toString('latin1'));
  }
  if (typeof payload.From === 'string' || payload.FromFull) {
    const full = payload.FromFull as { Email?: unknown; Name?: unknown } | undefined;
    const from = full && typeof full.Email === 'string' ? { name: text(full.Name) || null, email: full.Email.toLowerCase() } : mailbox(text(payload.From));
    const html = text(payload.HtmlBody);
    return {
      from,
      subject: text(payload.Subject).replace(/\s+/g, ' ').trim(),
      text: tidy(text(payload.TextBody)) || (html ? htmlToText(html) : ''),
      messageId: messageIds(headerValue(payload.Headers, 'Message-ID'))[0] ?? (text(payload.MessageID) || null),
      replyTo: [...new Set([...messageIds(headerValue(payload.Headers, 'In-Reply-To')), ...messageIds(headerValue(payload.Headers, 'References')).reverse()])],
      attachments: attachmentNames(payload.Attachments),
    };
  }
  if (typeof payload.subject === 'string' || typeof payload.from === 'string' || (payload.from && typeof payload.from === 'object')) {
    const fromValue = payload.from as unknown;
    const from = fromValue && typeof fromValue === 'object' && typeof (fromValue as Record<string, unknown>).email === 'string'
      ? { name: text((fromValue as Record<string, unknown>).name) || null, email: ((fromValue as Record<string, string>).email).toLowerCase() }
      : mailbox(text(fromValue));
    const html = text(payload.html);
    const own = (key: string, header: string) => text(payload[key]) || headerValue(payload.headers, header) || '';
    const ids = (value: string) => messageIds(value).length ? messageIds(value) : value.trim() ? [value.trim().replace(/^<|>$/g, '')] : [];
    return {
      from,
      subject: decodeWords(text(payload.subject)).replace(/\s+/g, ' ').trim(),
      text: tidy(text(payload.text)) || (html ? htmlToText(html) : ''),
      messageId: ids(own('messageId', 'Message-ID'))[0] ?? null,
      replyTo: [...new Set([...ids(own('inReplyTo', 'In-Reply-To')), ...messageIds(own('references', 'References')).reverse()])],
      attachments: attachmentNames(payload.attachments),
    };
  }
  return undefined;
}
