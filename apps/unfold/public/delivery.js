import { escape } from './core/dom.js';
import { icon } from './core/icons.js';
import { badge, button, callout, dl } from './core/ui.js';

/**
 * Whether the open session goes through the delivery gate instead of a plain review: it runs under a Ploeg
 * execution on a repository with a delivery policy, and its crew finished.
 * @param {{ session?: object, bootstrap?: object }} state
 * @returns {boolean}
 */
export function deliveryGated(state) {
  const session = state.session;
  return Boolean(session?.execution && state.bootstrap?.deliveryRepositories?.includes(session.repositoryId) && session.status === 'completed');
}

/**
 * The state a delivery-gated session shows in the list and on its page: "Awaiting your approval" until the
 * approval of the current candidate is known to be recorded, then "Commit approved", and "Pull request #N opened"
 * once the publisher's pull request is verified. Returns null when the session does not go through the gate.
 * @param {{ session?: object, bootstrap?: object, delivery?: object|null }} state
 * @returns {{ key: string, label: string, tone: string, glyph: string } | null}
 */
export function deliveryStatus(state) {
  if (!deliveryGated(state)) return null;
  const view = state.delivery;
  const approved = Boolean(view?.approval && (!view.candidate || view.candidate.policySha256 === view.policySha256));
  const pullRequest = view?.publication?.phase === 'published' ? view.publication.pullRequest : undefined;
  if (pullRequest) return { key: 'pull_request_opened', label: `Pull request #${pullRequest.number} opened`, tone: 'success', glyph: 'pull-request' };
  return approved ? { key: 'commit_approved', label: 'Commit approved', tone: 'success', glyph: 'check-circle' } : { key: 'awaiting_approval', label: 'Awaiting your approval', tone: 'review', glyph: 'shield' };
}

const inFlight = ['reserving', 'authorized', 'pushed', 'proposed'];
const recoveryText = {
  recovery_required: 'Publishing stopped before Unfold could confirm it was allowed to push. Nothing was pushed. An operator reconciles it with Ploeg before anything continues.',
  unknown: 'The branch or pull request on the forge does not match this commit, so Unfold stopped and closed anything it could not verify. A person decides what happens next.',
};

/**
 * Stage 4 of the gate when this workbench publishes: what Accept and open pull request does, then its progress, the verified
 * pull request, or why it stopped. Returns null when publishing is disabled and nothing was ever reserved.
 * @param {{ publicationEnabled?: boolean, publication?: { phase: string, branch: string, pullRequest?: { number: number, url: string } } } | null | undefined} view
 * @param {boolean} busy
 * @returns {{ done: boolean, tone: string, title: string, text: string, extra: string } | null}
 */
export function publicationStage(view, busy) {
  const publication = view?.publication;
  if (!view?.publicationEnabled && !publication) return null;
  const pullRequest = publication?.phase === 'published' ? publication.pullRequest : undefined;
  if (pullRequest) return { done: true, tone: '', title: `Pull request #${pullRequest.number}`, text: `Opened from ${publication.branch}. Merging it stays with you on the forge.`, extra: !/^https:\/\//.test(String(pullRequest.url)) ? '' : `<a class="button secondary sm" href="${escape(pullRequest.url)}" target="_blank" rel="noopener noreferrer">${icon('pull-request')}<span class="button-label">Open pull request #${escape(String(pullRequest.number))}</span></a>` };
  if (busy || inFlight.includes(publication?.phase)) return { done: false, tone: '', title: 'Publishing…', text: publication ? `Pushing this commit to ${publication.branch} and opening one pull request.` : 'Pushing this commit to its own branch and opening one pull request.', extra: '' };
  if (recoveryText[publication?.phase]) return { done: false, tone: 'danger', title: 'Needs recovery', text: recoveryText[publication.phase], extra: '' };
  if (publication?.phase === 'refused') return { done: false, tone: 'danger', title: 'Refused', text: 'Ploeg refused to reserve publication for this commit, for example because its delivery policy does not allow publishing. Nothing was pushed.', extra: '' };
  return { done: false, tone: '', title: 'Opens after your decision', text: 'Accepting pushes this exact commit to its own branch and opens one pull request. Merging it stays with you.', extra: '' };
}

function stage({ number, done, tone, title, name, text, extra = '' }) {
  const marker = done ? icon('check') : tone === 'danger' ? icon('x') : '';
  return `<li class="gate-stage"${tone ? ` data-tone="${tone}"` : ''}${done ? ' data-done' : ''}><span class="gate-marker" aria-hidden="true">${marker || number}</span><div class="gate-body"><p class="overline gate-name">${escape(name)}</p><h3 class="gate-title">${escape(title)}</h3><p class="gate-text">${escape(text)}</p>${extra}</div></li>`;
}

/**
 * The delivery gate of a finished session under a Ploeg execution: the frozen candidate commit, independent
 * verification against the registered policy, and the operator's approval of that exact commit. Returns an
 * empty string when the session does not go through the gate. DOM-free; every value is escaped.
 * @param {{ session?: object, bootstrap?: object, delivery?: object|null, deliveryError?: string, deliveryPublishError?: string, deliveryBusy?: boolean }} state
 * @returns {string}
 */
export function deliveryMarkup(state) {
  const session = state.session;
  if (!deliveryGated(state) || session.candidate?.status !== 'ready') return '';
  const view = state.delivery;
  const candidate = view?.candidate;
  const receipt = view?.receipt;
  const currentPolicy = !candidate || candidate.policySha256 === view?.policySha256;
  const approval = currentPolicy ? view?.approval : null;
  const authorized = state.bootstrap.user.role !== 'viewer';
  const checks = view?.checks ?? [];
  const verified = receipt?.passed === true && candidate?.policySha256 === view?.policySha256;
  const interrupted = view?.localPhase === 'interrupted';
  const published = view?.publication?.phase === 'published' ? view.publication.pullRequest : undefined;
  const status = published ? ['success', `Pull request #${published.number} opened`, 'pull-request'] : interrupted ? ['severe', 'Verification interrupted', 'zap'] : !currentPolicy ? ['attention', 'Policy changed · review required', 'alert'] : approval ? ['success', 'Commit approved', 'check-circle'] : verified ? ['success', 'Independent checks passed', 'check-circle'] : receipt ? ['danger', 'Checks need attention', 'x-circle'] : ['neutral', 'Independent verification', 'shield'];
  const notices = [
    interrupted ? callout({ tone: 'severe', title: 'Verification stopped before its result was recorded', body: '<p>This candidate stays blocked until an operator reconciles it. Checks do not restart on their own.</p>' }) : '',
    !currentPolicy ? callout({ tone: 'attention', title: 'The registered policy changed', body: '<p>This evidence belongs to the previous policy and cannot authorize delivery.</p>' }) : '',
    state.deliveryPublishError ? callout({ tone: 'danger', title: 'The pull request was not opened', body: `<p>${escape(state.deliveryPublishError)}</p>` }) : '',
    state.deliveryError ? callout({ tone: 'danger', title: 'Could not read the delivery status', body: `<p>${escape(state.deliveryError)}</p>`, actions: button({ label: 'Try again', icon: 'refresh', size: 'sm', action: 'delivery-refresh' }) }) : '',
  ].filter(Boolean).map(notice => `<div class="gate-notice" role="alert">${notice}</div>`).join('');
  const commit = candidate ? `${dl([['Commit', `<code title="${escape(candidate.canonicalSha)}">${escape(String(candidate.canonicalSha).slice(0, 12))}</code>`], ['Policy', `<code title="${escape(candidate.policySha256)}">${escape(String(candidate.policySha256).slice(0, 12))}</code>`]], { rows: true })}<a class="button secondary sm" href="/api/sessions/${encodeURIComponent(session.id)}/delivery/download" download>${icon('download')}<span class="button-label">Review Git bundle</span></a>` : '';
  const results = checks.length ? `<ul class="gate-checks">${checks.map(check => `<li data-tone="${check.passed ? 'success' : 'danger'}">${icon(check.passed ? 'check-circle' : 'x-circle')}<span class="gate-check-name">${escape(check.id)}</span><span class="gate-check-result">${check.passed ? 'Passed' : 'Failed'}</span></li>`).join('')}</ul>` : '';
  const verify = authorized && view?.configured && !state.deliveryError && !interrupted && !receipt ? button({ label: state.deliveryBusy ? 'Verifying…' : view?.localPhase === 'verified' ? 'Reconcile verification' : 'Run independent checks', icon: 'shield', variant: 'primary', size: 'sm', action: 'delivery-verify', busy: state.deliveryBusy }) : '';
  const publishing = Boolean(view?.publicationEnabled);
  const pullRequestStage = publicationStage(view, publishing && verified && Boolean(state.deliveryBusy));
  const publishable = publishing && verified && (!view?.publication || inFlight.includes(view.publication.phase));
  const approve = !authorized || !verified ? '' : publishable ? button({ label: view?.publication ? 'Continue opening the pull request' : 'Accept and open pull request', icon: 'pull-request', variant: 'primary', size: 'sm', action: 'delivery-publish', busy: state.deliveryBusy }) : !publishing && !approval ? button({ label: 'Approve this commit', icon: 'check', variant: 'primary', size: 'sm', action: 'delivery-approve', busy: state.deliveryBusy }) : '';
  const stages = [
    stage({ number: 1, done: Boolean(candidate), name: 'Frozen candidate', title: candidate ? 'One reviewable commit' : 'Preserve the exact change', text: 'Your checks and approval name the same commit, on its approved repository base.', extra: commit }),
    stage({ number: 2, done: verified, tone: receipt && !verified ? 'danger' : '', name: 'Independent verification', title: verified ? 'Checks passed' : receipt ? 'Checks need attention' : 'Evidence before approval', text: 'A fresh, isolated verifier runs the fixed checks in your registered policy.', extra: `${results}${verify}` }),
    stage({ number: 3, done: Boolean(approval), name: 'Your decision', title: approval ? 'Commit approved' : 'Review the evidence', text: approval ? `Recorded by ${approval.actor}. Ploeg keeps the commit, its checks and your approval together.` : publishing ? 'Inspect the change and its check results, then accept this specific commit into a pull request.' : 'Inspect the change and its check results, then approve this specific commit.', extra: approve }),
    pullRequestStage ? stage({ number: 4, name: 'Pull request', ...pullRequestStage }) : '',
  ].join('');
  const subtitle = publishing ? 'Accepting a verified commit opens one pull request through the trusted publisher. Merging stays with you.' : 'Publication is disabled in this workbench baseline. Approval does not push, merge or deploy.';
  return `<section class="card session-decision session-gate" data-tone="${approval ? 'success' : 'review'}" aria-labelledby="delivery-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="delivery-title">${icon('shield')}Delivery gate</h2><p class="card-subtitle">${subtitle}</p></div><div class="card-actions">${badge({ tone: status[0], glyph: status[2], label: status[1] })}</div></header><div class="card-body">${notices}<ol class="gate-stages">${stages}</ol></div></section>`;
}
