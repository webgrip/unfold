import { escape } from './dom.js';
import { badge, button, card, emptyState } from './ui.js';
import { dateTime, relativeWords } from './format.js';

/** The most characters one message to a Linked Session may have. */
export const messageLimit = 2000;

const sources = { person: 'Message', work_item: 'Work Item notice', pull_request: 'Pull request notice', ci: 'CI notice' };

/** Who a message in a session's inbox is from, as its row names it: `You`, a person's name, or Unfold for a notice. */
export function messageSender(message) {
  if (message.kind !== 'person') return `Unfold · ${sources[message.kind] ?? 'notice'}`;
  return message.fromOwner ? `${message.createdBy} · you` : `${message.createdBy} · administrator`;
}

function messageRow(message, now) {
  const delivered = message.deliveredAt
    ? badge({ tone: 'success', glyph: 'check', label: 'Delivered', title: `The session collected it ${dateTime(message.deliveredAt)}` })
    : badge({ tone: 'attention', glyph: 'clock', label: 'Waiting', title: 'The session collects it on its next prompt, command or stop' });
  return `<li class="linked-inbox-row"><p class="linked-session-title">${delivered} <span class="meta">${escape(messageSender(message))} · <time datetime="${escape(message.createdAt)}" title="${escape(dateTime(message.createdAt))}">${escape(relativeWords(message.createdAt, now))}</time></span></p><p class="linked-inbox-text">${escape(message.text)}</p></li>`;
}

/**
 * The Messages card of a Linked Session's page: what Unfold sent the session and whether it collected it, and, for its
 * owner, a box to send it one. `messages` is null while loading; empty for someone who may not read them.
 */
export function linkedInboxCard(session, messages, { now = Date.now(), error = '' } = {}) {
  if (!session?.mine) return '';
  const list = error ? `<p class="meta">${escape(error)}</p>` : !messages ? '<p class="meta">Loading messages…</p>' : messages.length ? `<ul class="linked-session-list">${messages.map(message => messageRow(message, now)).join('')}</ul>` : emptyState({ icon: 'send', title: 'No messages yet', body: 'Unfold also writes here when a linked Work Item waits for review or a person, finishes, or its CI turns red or green.', compact: true });
  const form = `<form class="linked-inbox-form" data-form="linked-session-message" data-id="${escape(session.id)}"><div class="field"><label class="field-label" for="linked-session-message">Send to this session</label><textarea id="linked-session-message" name="text" rows="3" maxlength="${messageLimit}" required></textarea><p class="field-hint">The session reads it as your instruction on its next prompt, command or stop.</p></div>${button({ label: 'Send', icon: 'send', type: 'submit', size: 'sm' })}</form>`;
  return card({ id: 'linked-session-messages', title: 'Messages', subtitle: 'What Unfold sent this session, newest first.', icon: 'send', body: `${form}${list}` });
}
