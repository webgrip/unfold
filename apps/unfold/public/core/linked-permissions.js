import { escape } from './dom.js';
import { button, card } from './ui.js';
import { compactDuration, time } from './format.js';

/** The event views listen for after a prompt was answered here, so they read what still waits. */
export const permissionsChangedEvent = 'unfold:linked-permissions-changed';

/**
 * The waiting prompts of a `GET /api/linked-permissions` list, by session id, oldest first.
 * @param {object[]|null|undefined} requests
 * @returns {Map<string, object[]>}
 */
export function permissionsBySession(requests) {
  const out = new Map();
  for (const request of Array.isArray(requests) ? requests : []) {
    if (!request?.sessionId || !request.id) continue;
    out.set(String(request.sessionId), [...(out.get(String(request.sessionId)) ?? []), request]);
  }
  return out;
}

/**
 * How long a prompt still waits for an answer from Unfold, in seconds, or null when unknown. After that the plugin
 * stops waiting and only the terminal can answer.
 */
export function secondsLeft(request, now = Date.now()) {
  const at = Date.parse(request?.expiresAt ?? '');
  return Number.isFinite(at) ? Math.max(0, Math.round((at - now) / 1000)) : null;
}

/** The tool and summary of a prompt on one line, as the plugin wrote them, such as `Bash: Remove node_modules (Runs rm)`. */
export function permissionLine(request) {
  return `${request.tool}: ${request.summary}${request.detail ? ` (${request.detail})` : ''}`;
}

/**
 * The Approve and Deny buttons of one waiting prompt. Approve asks first for a shell command; Deny asks for an
 * optional reason. `prefix` keeps the ids unique where one page shows the prompt twice.
 * @param {object} request A waiting prompt.
 * @param {{ prefix?: string, size?: 'xs'|'sm'|'md' }} [options]
 */
export function permissionButtons(request, { prefix = 'linked', size = 'sm' } = {}) {
  const key = `${prefix}-${String(request.id).replace(/[^A-Za-z0-9_-]/g, '-')}`;
  const data = { session: request.sessionId, request: request.id, tool: request.tool, line: permissionLine(request) };
  return `<span class="linked-permission-actions">${button({ id: `${key}-allow`, label: 'Approve', icon: 'check', variant: 'primary', size, action: 'linked-permission-allow', data, ariaLabel: `Approve ${permissionLine(request)}` })} ${button({ id: `${key}-deny`, label: 'Deny', icon: 'x', variant: 'secondary', size, action: 'linked-permission-deny', data, ariaLabel: `Deny ${permissionLine(request)}` })}</span>`;
}

/**
 * One waiting prompt: the tool, the summary the plugin wrote (data from the agent, shown as text), how long it still
 * waits for Unfold, and the Approve and Deny buttons.
 * @param {object} request
 * @param {{ now?: number, prefix?: string }} [options]
 */
export function permissionPrompt(request, { now = Date.now(), prefix = 'linked' } = {}) {
  const left = secondsLeft(request, now);
  const until = left === null ? '' : left > 0 ? `Waits for an answer here for ${compactDuration(left)} more, until ${time(request.expiresAt)}; your terminal can answer at any time.` : 'No longer waits for an answer here. Answer it in your terminal.';
  return `<div class="linked-permission" data-request="${escape(request.id)}"><p class="linked-permission-what"><span class="chip" data-tone="attention">${escape(request.tool)}</span> <span title="Written by the agent and the plugin, not checked by Unfold">${escape(request.summary)}</span></p>${request.detail ? `<p class="meta">${escape(request.detail)}</p>` : ''}${until ? `<p class="meta">${escape(until)}</p>` : ''}${left === 0 ? '' : permissionButtons(request, { prefix })}</div>`;
}

/**
 * The "Waiting for your answer" card of a Linked Session's page: each tool prompt the session waits on, for its owner
 * only. Empty when nothing waits.
 * @param {object} session
 * @param {object[]|null|undefined} requests
 * @param {{ now?: number }} [options]
 */
export function permissionsCard(session, requests, { now = Date.now() } = {}) {
  if (!session?.mine || !Array.isArray(requests) || !requests.length) return '';
  const body = `<p class="meta">Approving runs the tool on your machine, once. The summary comes from the session, so read it as the agent’s words. Unfold never offers “always allow”.</p>${requests.map(request => permissionPrompt(request, { now, prefix: 'linked-page' })).join('')}`;
  return card({ id: 'linked-session-permissions', title: 'Waiting for your answer', subtitle: 'Tool prompts this session asked you to answer from Unfold.', icon: 'bell', body });
}
