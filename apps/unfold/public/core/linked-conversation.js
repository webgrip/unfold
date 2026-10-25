import { escape } from './dom.js';
import { card } from './ui.js';
import { icon } from './icons.js';
import { dateTime } from './format.js';
import { markdown } from './markdown.js';

/** How many entries the page keeps in memory: older ones drop off the top as new ones arrive. */
export const conversationKept = 400;

/** Why the conversation cannot be shown, in the words the page uses, per reason the API gives. */
export const conversationGaps = {
  ended: 'The session ended. Its conversation stays on the machine that ran it; resume it there to read it.',
  not_relaying: 'The session’s machine is not answering: it may be asleep or offline, the session may have closed, its Unfold plugin may be older than 0.14.0, or it runs with UNFOLD_CONVERSATION=0.',
  no_answer: 'The session’s machine did not answer in time. Trying again.',
  no_transcript: 'The session has not written a transcript yet, or its hooks have not run since the plugin was updated. Send it a prompt.',
};

/**
 * The conversation the page holds after one read: the new entries appended, or, when the machine started over (the
 * first read, or a transcript Claude Code rewrote), replaced; at most {@link conversationKept}. A read that failed keeps
 * what was already shown and records why.
 */
export function mergedConversation(current, read) {
  const known = current ?? { entries: [], cursor: null, truncated: false };
  if (!read?.reachable) return { ...known, reachable: false, reason: read?.reason ?? 'no_answer' };
  const fresh = known.cursor === null || read.restarted;
  const seen = new Set(fresh ? [] : known.entries.map(entry => entry.id));
  const entries = [...(fresh ? [] : known.entries), ...read.entries.filter(entry => !entry.id || !seen.has(entry.id))];
  return { entries: entries.slice(-conversationKept), cursor: read.cursor, truncated: (fresh ? read.truncated : known.truncated) || entries.length > conversationKept, reachable: true, reason: '' };
}

function entryRow(entry) {
  const at = entry.at ? `<time class="meta" datetime="${escape(entry.at)}" title="${escape(dateTime(entry.at))}">${escape(dateTime(entry.at))}</time>` : '';
  if (entry.kind === 'tool') return `<li class="linked-conversation-entry is-tool">${icon('terminal')}<span data-private class="linked-conversation-tool">${escape(entry.text)}</span></li>`;
  const who = entry.kind === 'prompt' ? 'You' : 'Claude';
  const body = entry.kind === 'prompt' ? `<p data-private class="linked-conversation-prompt">${escape(entry.text)}</p>` : `<div data-private class="prose linked-conversation-reply">${markdown(entry.text, { baseLevel: 4 })}</div>`;
  return `<li class="linked-conversation-entry is-${entry.kind}"><p class="linked-conversation-who"><span class="field-label">${who}</span> ${at}</p>${body}</li>`;
}

/** The list of entries alone, which the page swaps in place on each refresh so the reader's scroll position holds. */
export function conversationList(conversation) {
  if (!conversation?.entries?.length) return '';
  const older = conversation.truncated ? '<li class="linked-conversation-older meta">Older messages are on the machine that runs the session.</li>' : '';
  return `${older}${conversation.entries.map(entryRow).join('')}`;
}

/**
 * The Conversation card of a Linked Session's page, for its owner only: the prompts, replies and tool calls read live
 * from the machine that runs it, and a plain reason when that machine does not answer. `conversation` is null while
 * the first read is on its way.
 */
export function conversationCard(session, conversation) {
  if (!session?.mine) return '';
  const gap = conversation && !conversation.reachable ? `<p class="linked-conversation-gap meta" role="status">${escape(conversationGaps[conversation.reason] ?? conversationGaps.no_answer)}</p>` : '';
  const entries = conversationList(conversation);
  const body = !conversation ? '<p class="meta">Asking the session’s machine for its conversation…</p>'
    : `${entries ? `<ol class="linked-conversation" id="linked-conversation-list" aria-live="polite" tabindex="0" aria-label="Conversation">${entries}</ol>` : conversation.reachable ? '<p class="meta">Nothing said yet.</p>' : ''}${gap}`;
  return card({ id: 'linked-session-conversation', title: 'Conversation', subtitle: 'Read live from the machine that runs this session. Unfold passes it to you and keeps none of it.', icon: 'bot', body });
}
