import { plainRedactedText } from '../redaction.ts';
import { findTaskProvider } from '../task-providers/index.ts';
import { taskMention } from '../tracker-display.ts';

/** What can notify a person. */
export const triggerIds = ['needs_you', 'question', 'review', 'sign_off', 'budget'] as const;
export type TriggerId = typeof triggerIds[number];

/** One trigger as the Notifications page lists it, with where Unfold detects it. */
export type TriggerSpec = { id: TriggerId; label: string; detectedFrom: string };

/** Every trigger, in the order the Notifications page lists them. */
export const triggers: readonly TriggerSpec[] = [
  { id: 'needs_you', label: 'A Work Item needs you', detectedFrom: 'Ploeg audit actions work_item.needs_human and work_item.stale' },
  { id: 'question', label: 'A question or tool permission waits for you', detectedFrom: 'work_item.needs_human after a Shift closed question_for_person, and a pending tool-permission request in your own agent session' },
  { id: 'review', label: 'A pull request is ready for review', detectedFrom: 'Ploeg audit action work_item.awaiting_review' },
  { id: 'sign_off', label: 'A Client Sign-off was recorded', detectedFrom: 'Unfold\'s Client Sign-off store' },
  { id: 'budget', label: 'A Work Item crossed a budget threshold', detectedFrom: 'the latest Shift\'s spent and held share of its budget after each Run\'s outcome' },
];

/** Whether `value` names a trigger. */
export function isTrigger(value: unknown): value is TriggerId { return typeof value === 'string' && (triggerIds as readonly string[]).includes(value); }

/** What a notice is about when a channel may offer an action on it: a tool-permission request of a person's own session. */
export type NoticeSubject = { kind: 'permission'; sessionId: string; requestId: string };
/**
 * What a channel sends: a headline, one line of body, where a click goes, a tag that collapses repeats of the same
 * notice, and optionally what it is about, for a channel that offers an action on it. `about` is `handed_off` when
 * the notice goes to the person who handed the Work Item off, under their "work I handed off" choice instead of the trigger.
 */
export type NotificationMessage = { trigger: TriggerId | 'test'; title: string; body: string; url: string | null; tag: string; subject?: NoticeSubject; about?: 'handed_off'; task?: NoticeTask };

/** The tracker task a Work Item came from, as a notice carries it: how to name it (`ClickUp #86c0abc12`), the label of its link (`Open in ClickUp`) and its web address. */
export type NoticeTask = { mention: string; label: string; url: string | null };

/** The Work Item facts a notice may carry. */
export type NoticeWorkItem = { id: string; title: string; provider?: string; externalId?: string; url?: string };

const headlines: Record<Exclude<TriggerId, 'budget'>, string> = {
  needs_you: 'A Work Item needs you',
  question: 'A question waits for you',
  review: 'A pull request is ready for review',
  sign_off: 'A Client Sign-off was recorded',
};

/** The Work Item title as a notice may carry it: one line, secrets masked, at most 120 characters. */
export function noticeTitle(title: string): string {
  const line = plainRedactedText(title).replace(/\s+/g, ' ').trim();
  return line.length > 120 ? `${line.slice(0, 119).trimEnd()}…` : line;
}

const link = (baseUrl: string | undefined, hash: string) => baseUrl ? `${baseUrl.replace(/\/+$/, '')}/#${hash}` : null;

/**
 * The notice for a trigger about one Work Item: a fixed headline, the Work Item's number and title, a link to its page
 * and, for work a tracker holds, the task's name and link. A budget notice names the share used, never an amount.
 * Nothing else from the Work Item is carried.
 */
export function workItemMessage(trigger: TriggerId, workItem: NoticeWorkItem, baseUrl?: string, share?: number): NotificationMessage {
  const title = trigger === 'budget' ? `A Work Item used ${Math.round((share ?? 1) * 100)} % of its budget` : headlines[trigger];
  const name = noticeTitle(workItem.title);
  const task = noticeTask(workItem);
  const body = `${name ? `#${workItem.id} ${name}` : `Work Item #${workItem.id}`}${task ? ` · ${task.mention}` : ''}`;
  return { trigger, title, body, url: link(baseUrl, `work/${encodeURIComponent(workItem.id)}`), tag: `${trigger}-${workItem.id}`, ...(task ? { task } : {}) };
}

/** The tracker task of a Work Item a tracker holds, or undefined for work no tracker the registry knows holds. Only an http(s) address without credentials is kept. */
export function noticeTask(workItem: NoticeWorkItem): NoticeTask | undefined {
  const provider = workItem.provider ?? '';
  const adapter = findTaskProvider(provider);
  if (!adapter || adapter.fixture || !workItem.externalId?.trim()) return undefined;
  return { mention: noticeTitle(taskMention(provider, workItem.externalId)).slice(0, 80), label: `Open in ${adapter.label}`, url: webLink(workItem.url) };
}

function webLink(value: string | undefined): string | null {
  try { const url = new URL(value ?? ''); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}

const handedHeadlines: Record<'needs_you' | 'question' | 'review', string> = {
  needs_you: 'Work you handed off needs you',
  question: 'Work you handed off asks you a question',
  review: 'Work you handed off has a pull request ready',
};

/**
 * The notice to the person who handed a Work Item off, when it starts needing them or its pull request becomes ready:
 * a fixed headline, the Work Item's number and clipped title, and a link to its page, where its question is answered.
 */
export function handedOffMessage(trigger: 'needs_you' | 'question' | 'review', workItem: NoticeWorkItem, baseUrl?: string): NotificationMessage {
  return { ...workItemMessage(trigger, workItem, baseUrl), title: handedHeadlines[trigger], about: 'handed_off' };
}

/** The notice for a tool-permission request in the person's own agent session. It never carries the tool or its arguments. */
export function permissionMessage(sessionId: string, baseUrl?: string, requestId?: string): NotificationMessage {
  return {
    trigger: 'question', title: 'A tool permission waits for you', body: 'Your agent session asks before it runs a tool.', url: link(baseUrl, `linked-session/${encodeURIComponent(sessionId)}`), tag: `permission-${sessionId}`,
    ...(requestId ? { subject: { kind: 'permission' as const, sessionId, requestId } } : {}),
  };
}

/** The test notice a person sends themselves from the Notifications page. */
export function testMessage(baseUrl?: string): NotificationMessage {
  return { trigger: 'test', title: 'Unfold notifications work', body: 'This is the test notice you asked for.', url: link(baseUrl, 'settings/notifications'), tag: 'test' };
}
