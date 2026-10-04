import { htmlToMarkdown, looksLikeHtml } from './markdown.ts';

const htmlProviders = new Set(['vikunja']);
const memoLimit = 256;
const memo = new Map<string, string>();

/** Returns tracker text for display with the browser's `markdown()` renderer: HTML from a provider known to send it (Vikunja) is converted to the `unfold` Markdown subset, anything else is returned unchanged. */
export function descriptionMarkdown(provider: string, description: string, base?: string): string {
  if (!htmlProviders.has(provider) || !looksLikeHtml(description)) return description;
  const key = `${base ?? ''}\u0000${description}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  const markdown = htmlToMarkdown(description, base, 'unfold');
  if (memo.size >= memoLimit) memo.delete(memo.keys().next().value!);
  memo.set(key, markdown);
  return markdown;
}
