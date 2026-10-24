import { escape } from './dom.js';
import { icon } from './icons.js';
import { button, count, iconButton, listRow } from './ui.js';
import { compactDuration, dateTime } from './format.js';
import { harnessName } from './linked-sessions.js';
import { permissionButtons, permissionLine, permissionsBySession } from './linked-permissions.js';

const asks = {
  permission_prompt: { chip: 'Approve a tool', wants: 'waits for you to approve a tool', fix: 'Approve or deny the tool in your terminal.' },
  idle_prompt: { chip: 'Your turn', wants: 'waits for your next prompt', fix: 'Give it the next step, or end it.' },
  elicitation_dialog: { chip: 'Answer a question', wants: 'asks you a question', fix: 'Answer the question in your terminal.' },
  agent_needs_input: { chip: 'Needs input', wants: 'needs your input', fix: 'Answer it where it runs.' },
};
const unknownAsk = { chip: 'Waits for you', wants: 'waits for you', fix: 'Answer it where it runs.' };

/**
 * Why a waiting Linked Session waits, in plain words: a short chip, the sentence ("Your Claude Code session waits for
 * you to approve a tool") and what to do. When the session asked Unfold to answer a tool prompt (`asked`, its waiting
 * prompts), the sentence names the tool and the person may answer here; otherwise they answer where the session runs.
 * @param {{ harness?: string, waitingFor?: string }} session
 * @param {object[]} [asked] The session's waiting prompts from `GET /api/linked-permissions`.
 * @returns {{ code: string, chip: string, sentence: string, fix: string }}
 */
export function linkedWaitReason(session, asked = []) {
  const known = asks[session?.waitingFor] ?? unknownAsk;
  const request = Array.isArray(asked) ? asked[0] : undefined;
  if (request) return { code: 'permission_prompt', chip: asks.permission_prompt.chip, sentence: `Your ${harnessName(session?.harness)} session asks to use ${permissionLine(request)}.`, fix: 'Approve or deny it here, or in your terminal.' };
  return { code: asks[session?.waitingFor] ? session.waitingFor : 'waiting', chip: known.chip, sentence: `Your ${harnessName(session?.harness)} session ${known.wants}.`, fix: known.fix };
}

/**
 * How long a session has waited, in seconds: since its last report, which is the one that said it waits. Null when
 * the report time is unknown.
 */
export function waitedSeconds(session, now = Date.now()) {
  const at = Date.parse(session?.lastSeenAt ?? '');
  return Number.isFinite(at) ? Math.max(0, Math.round((now - at) / 1000)) : null;
}

/**
 * The signed-in person's own Linked Sessions that wait for them, longest wait first. A stale session (one that claims
 * to wait but has not reported for half an hour) is left out: it may have closed without saying so.
 * @param {object[]|null|undefined} sessions A `GET /api/linked-sessions` `sessions` list.
 * @param {number} [now]
 * @returns {object[]}
 */
export function waitingLinked(sessions, now = Date.now()) {
  return (Array.isArray(sessions) ? sessions : []).filter(session => session?.mine && session.state === 'waiting').map((session, index) => ({ session, index, waited: waitedSeconds(session, now) })).sort((a, b) => (b.waited ?? -1) - (a.waited ?? -1) || a.index - b.index).map(entry => entry.session);
}

function title(session) { return session.displayTitle || session.title || (session.branch ? `On ${session.branch}` : `${harnessName(session.harness)} session`); }

function row(session, now, asked = []) {
  const reason = linkedWaitReason(session, asked);
  const id = String(session.id);
  const key = id.replace(/[^A-Za-z0-9_-]/g, '-');
  const facts = [session.branch ? `<span class="now-repo">${icon('branch')}<span>${escape(session.branch)}</span></span>` : '', session.workItems?.length ? `<span>${escape(`Work Item ${session.workItems.map(entry => entry.id).join(', ')}`)}</span>` : ''].filter(Boolean).join('');
  const meta = `<span class="chip" data-tone="attention" title="${escape(`${reason.sentence} ${reason.fix}`)}">${icon('bell')}<span>${escape(reason.chip)}</span></span>${facts ? `<span class="now-facts"><span class="now-facts-list">${facts}</span></span>` : ''}<span class="now-why now-why-fix" title="${escape(`${reason.sentence} ${reason.fix}`)}">${escape(reason.sentence)}</span>`;
  const waited = waitedSeconds(session, now);
  const trail = waited === null ? '' : `<span class="now-when"><span class="now-when-label">Waiting </span><time datetime="${escape(session.lastSeenAt)}" title="${escape(`Since ${dateTime(session.lastSeenAt)}`)}">${escape(compactDuration(waited))}</time></span>`;
  const link = listRow({ href: `#linked-session/${encodeURIComponent(id)}`, id: `now-row-l-${key}`, tone: 'attention', lead: icon('terminal'), title: title(session), meta, trail, data: { nowRow: true, openUrl: session.remoteUrl || null, openLabel: session.remoteUrl ? 'session in Claude' : null } });
  const resume = session.resume || `claude --resume ${id}`;
  const primary = session.remoteUrl
    ? button({ id: `now-linked-open-${key}`, label: 'Open in Claude', icon: 'external', size: 'sm', href: session.remoteUrl, external: true, ariaLabel: `Open “${title(session)}” in Claude (opens in a new tab)` })
    : button({ id: `now-linked-copy-${key}`, label: 'Copy resume command', icon: 'copy', size: 'sm', action: 'linked-session-copy', data: { text: resume }, ariaLabel: `Copy ${resume}` });
  const answer = asked[0] ? permissionButtons(asked[0], { prefix: `now-linked-${key}` }) : '';
  const links = session.remoteUrl ? iconButton({ id: `now-linked-copy-${key}`, icon: 'copy', label: `Copy ${resume}`, action: 'linked-session-copy', data: { text: resume }, size: 'sm' }) : '';
  return `<li class="now-item now-linked" data-insight="now.row.linked-session">${link}<div class="now-item-actions" data-primary><span class="now-action-primary">${answer || primary}</span><span class="now-action-links">${answer ? `${primary}${links}` : links}</span></div></li>`;
}

/**
 * The Now card for the signed-in person's own agent sessions that wait for them, such as a Claude Code session asking
 * to approve a tool: each with why it waits, since when, and how to answer it (open it in Claude when it runs there,
 * copy `claude --resume <id>` otherwise, or open its page). Empty when none waits or the list could not be read.
 * @param {object[]|null|undefined} sessions A `GET /api/linked-sessions` `sessions` list.
 * @param {{ now?: number, permissions?: object[] }} [options] `permissions` is the `GET /api/linked-permissions` list: a
 * session with a waiting prompt shows its tool and summary with Approve and Deny.
 * @returns {string}
 */
export function linkedWaitingCard(sessions, { now = Date.now(), permissions = [] } = {}) {
  const waiting = waitingLinked(sessions, now);
  if (!waiting.length) return '';
  const asked = permissionsBySession(permissions);
  return `<section class="card flush now-card now-waiting now-yours" aria-labelledby="now-yours-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="now-yours-title">Your sessions wait${count(waiting.length, { tone: 'attention' })}</h2></div></header><div class="card-body"><p class="now-group-hint">${asked.size ? 'Agent sessions you run on your own machine. Answer a tool prompt here when its session asked Unfold to; answer the rest where they run.' : 'Agent sessions you run on your own machine. Unfold does not run them, so answer each where it runs.'}</p><ul class="list now-list" aria-labelledby="now-yours-title">${waiting.map(session => row(session, now, asked.get(String(session.id)) ?? [])).join('')}</ul></div></section>`;
}
