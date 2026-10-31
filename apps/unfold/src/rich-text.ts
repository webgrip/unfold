import { htmlToMarkdown, looksLikeHtml } from './markdown.ts';
import { displayDescription, sendsHtml } from './task-providers/index.ts';

const memoLimit = 256;
const memo = new Map<string, string>();

/** Returns tracker text for display with the browser's `markdown()` renderer: HTML from a provider whose adapter says it sends HTML is converted to the `unfold` Markdown subset, anything else is tidied by its adapter when the adapter does so. */
export function descriptionMarkdown(provider: string, description: string, base?: string): string {
  if (!sendsHtml(provider) || !looksLikeHtml(description)) return displayDescription(provider, description);
  const key = `${base ?? ''}\u0000${description}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  const markdown = htmlToMarkdown(description, base, 'unfold');
  if (memo.size >= memoLimit) memo.delete(memo.keys().next().value!);
  memo.set(key, markdown);
  return markdown;
}
