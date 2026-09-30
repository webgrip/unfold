import { htmlToMarkdown, looksLikeHtml } from './markdown.ts';

const htmlProviders = new Set(['vikunja']);
const memoLimit = 256;
const memo = new Map<string, string>();

/** Returns tracker text for display as Markdown: HTML from a provider known to send it (Vikunja) is converted, anything else is returned unchanged. */
export function descriptionMarkdown(provider: string, description: string, base?: string): string {
  if (!htmlProviders.has(provider) || !looksLikeHtml(description)) return description;
  const key = `${base ?? ''}\u0000${description}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  const markdown = htmlToMarkdown(description, base);
  if (memo.size >= memoLimit) memo.delete(memo.keys().next().value!);
  memo.set(key, markdown);
  return markdown;
}

/** Lists the forms a secret can take in converted Markdown (as written, and with Markdown escapes), so a caller can redact each one. */
export function markdownForms(secret: string): string[] {
  const escaped = secret.replace(/[\\`*_[\]<>~|&]/g, '\\$&');
  return escaped === secret ? [secret] : [secret, escaped];
}
