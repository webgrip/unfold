import { api } from './core/api.js';
import { $, escape } from './core/dom.js';
import { icon } from './core/icons.js';
import { callout, skeleton } from './core/ui.js';
import { agentsWindowLink } from './core/vscode.js';

const subjects = { sessions: 'session', 'work-items': 'Work Item' };

/** Whether this person may open their work in VS Code's Agents window: the workbench serves an agent host and their account can attach one. */
export function agentsWindowAvailable(bootstrap) {
  return Boolean(bootstrap?.agentHost) && Boolean(bootstrap?.user) && bootstrap.user.role !== 'viewer';
}

/** The header tool that opens the Agents window dialog: on the session page for a session (`kind` `sessions`), on the Work Item page for a Ploeg Work Item (`work-items`). */
export function agentsWindowButton(kind, id, { size = 'sm' } = {}) {
  const action = kind === 'sessions' ? 'data-action="session-agents-window"' : 'data-action="work-agents-window"';
  return `<button type="button" class="button ghost${size === 'md' ? '' : ` ${size}`}" ${action} data-kind="${escape(kind)}" data-id="${escape(id)}">${icon('code')}<span class="button-label">Open in Agents window</span></button>`;
}

function refusal(kind, error) {
  if (error?.status === 404 && kind === 'work-items') return { title: 'This Work Item has no session in your Agents window', body: 'Ploeg does not show it to you there, or an Unfold session drives it. Open that session instead.' };
  if (error?.status === 404) return { title: 'This session is not in your Agents window', body: 'It may have been removed, or your account cannot see it.' };
  if (error?.status === 403) return { title: 'Your account cannot open the Agents window', body: error.message || 'An operator account connects VS Code.' };
  return { title: 'The link could not be built', body: error?.message || 'Try again in a moment.' };
}

function connectMarkup(origin) {
  return callout({
    tone: 'attention',
    title: 'No Agents window of yours is attached right now',
    body: `<p>${escape('The link only finds the session once VS Code’s Agents window has this workbench as a remote agent host. If you have not added it yet, connect VS Code first. Once added, the Agents window reconnects by itself when it opens.')}</p>`,
    actions: `<a class="button primary sm" href="${escape(agentsWindowLink(origin))}">${icon('code')}<span class="button-label">Connect VS Code</span></a><a class="button ghost sm" href="#settings/editors">Other ways to connect</a>`,
  });
}

/**
 * The Agents window dialog: loading, a refusal, or the Stable and Insiders links with what they need. `view` is
 * `{ kind, title, loading?, error?, link? }`, `link` the body of `GET /api/agent-host/<kind>/<id>/link`; `origin` is this
 * workbench, which the connect link hands the Unfold extension.
 */
export function agentsWindowDialogMarkup(view, { origin = '' } = {}) {
  const subject = subjects[view.kind] || 'session';
  let body;
  if (view.loading) body = skeleton({ variant: 'text', rows: 3 });
  else if (view.error || !view.link?.links?.stable) {
    const shown = refusal(view.kind, view.error);
    body = callout({ tone: view.error?.status && view.error.status < 500 ? 'neutral' : 'danger', title: shown.title, body: `<p>${escape(shown.body)}</p>` });
  } else {
    const { links, attached } = view.link;
    const open = `<div class="agents-window-part"><div class="agents-window-actions"><a class="button ${attached ? 'primary' : 'secondary'}" href="${escape(links.stable)}">${icon('code')}<span class="button-label">Open in VS Code</span></a>${links.insiders ? `<a class="button ghost" href="${escape(links.insiders)}"><span class="button-label">Open in VS Code Insiders</span></a>` : ''}</div><p class="meta">${escape(`Opens this ${subject} in VS Code’s Agents window, through the Unfold host it is attached to. Needs VS Code 1.142 or later. If VS Code cannot find the ${subject}, the Agents window says so after about 15 seconds; this page stays as it is.`)}</p></div>`;
    body = `${attached ? '' : connectMarkup(origin)}${open}`;
  }
  const heading = view.title ? `<p><strong>${escape(view.title)}</strong></p>` : '';
  return `<form method="dialog" class="agents-window-form"><header class="dialog-header"><h2 id="confirm-title">Open in Agents window</h2><button type="submit" class="button ghost icon-only sm" value="close" aria-label="Close" title="Close">${icon('x')}</button></header><div class="dialog-body"${view.loading ? ' aria-busy="true"' : ''}>${heading}${body}</div><footer class="dialog-footer"><button type="submit" class="button secondary" value="close" autofocus>Close</button></footer></form>`;
}

/** Opens the Agents window dialog for the control's `data-kind` and `data-id`, then asks the workbench for the person's link. */
export async function openAgentsWindow(control, title) {
  const kind = control?.dataset?.kind;
  const id = control?.dataset?.id;
  if (!subjects[kind] || !id) return;
  const dialog = $('#confirm-dialog');
  const previousClass = dialog.className;
  const view = { kind, title, loading: true };
  const draw = () => { dialog.innerHTML = agentsWindowDialogMarkup(view, { origin: location.origin }); };
  dialog.className = 'dialog agents-window-dialog';
  draw();
  dialog.addEventListener('close', () => { dialog.className = previousClass; control.isConnected && control.focus(); }, { once: true });
  dialog.showModal();
  try { view.link = await api(`/api/agent-host/${kind}/${encodeURIComponent(id)}/link`); }
  catch (error) { view.error = error; }
  view.loading = false;
  if (dialog.open && dialog.classList.contains('agents-window-dialog')) draw();
}
