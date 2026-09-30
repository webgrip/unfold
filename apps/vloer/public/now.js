import { usd2 } from './ploeg.js';
import { duration, relativeTime } from './ploeg-activity.js';

const stateLabels = { awaiting_review: 'Awaiting review', needs_human: 'Needs your attention', proposed: 'Proposed' };
const groupTitles = { waiting: 'Waiting on you', running: 'Running now', recent: 'Recently finished' };

function caption(helpers, data) {
  const { escape, icon } = helpers;
  if (data.demo) return `<div class="ploeg-caption illustrative">${icon('info')}<span>Illustrative Ploeg records. No Run executed, no model was called and spend is US$ 0,00.</span><time datetime="${escape(data.fetchedAt)}">Illustrative snapshot</time></div>`;
  const stamp = new Date(data.fetchedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  return `<div class="ploeg-caption">${icon('info')}<span>Every team you can read: what waits on a human, what runs now and what finished recently.</span><time datetime="${escape(data.fetchedAt)}">Fetched ${escape(stamp)}</time></div>`;
}
function notice(title, body, helpers, action = '') {
  const { escape, icon } = helpers;
  return `<div class="empty compact now-notice">${icon('info')}<h3>${escape(title)}</h3><p>${escape(body)}</p>${action ? `<button class="button secondary" data-action="now-retry">Try again</button>` : ''}</div>`;
}
function groupMarkup(id, description, count, body, error, helpers) {
  const { escape, icon } = helpers;
  const content = error ? `<div class="now-error" role="alert">${icon('info')}<div><strong>${escape(groupTitles[id])} could not be read</strong><p>${escape(error)}</p><button class="button secondary" data-action="now-retry" data-group="${escape(id)}">Try again</button></div></div>` : body;
  return `<section class="panel now-group" aria-labelledby="now-${id}-title"><div class="panel-heading"><div><h2 id="now-${id}-title">${escape(groupTitles[id])}</h2><p>${escape(description)}</p></div>${error ? '' : `<span class="count-badge">${count}</span>`}</div>${content}</section>`;
}
function linksMarkup(links, helpers) {
  const { escape, icon } = helpers;
  const present = links.filter(link => link && link.href);
  if (!present.length) return '';
  return `<div class="now-row-links">${present.map(link => `<a class="now-link" href="${escape(link.href)}" target="_blank" rel="noopener noreferrer">${icon('external')}${escape(link.label)}</a>`).join('')}</div>`;
}
function grafanaLink(team, helpers) {
  if (!helpers.grafanaUrl) return null;
  return { label: 'Grafana', href: `${String(helpers.grafanaUrl).replace(/\/$/, '')}/d/glide-loop?var-team=${encodeURIComponent(team)}` };
}
function waitingRow(entry, helpers, now) {
  const { escape } = helpers;
  const links = [
    helpers.safeUrl(entry.url) ? { label: 'Tracker', href: helpers.safeUrl(entry.url) } : null,
    entry.state === 'awaiting_review' && helpers.safeUrl(entry.pullRequestUrl) ? { label: 'Pull request', href: helpers.safeUrl(entry.pullRequestUrl) } : null,
    grafanaLink(entry.team, helpers),
  ];
  const cost = entry.spentUsd === null || entry.spentUsd === undefined ? 'Cost not reported' : `${usd2(entry.spentUsd)} spent`;
  return `<article class="now-row"><a class="now-row-main" data-now-row href="#work/${escape(entry.id)}"><span class="now-row-head"><span class="tag">${escape(entry.team)}</span><span class="ploeg-state ${escape(entry.state)}">${escape(stateLabels[entry.state] || entry.state)}</span></span><strong>${escape(entry.title || `Work Item ${entry.id}`)}</strong><span class="now-row-meta"><span>${escape(relativeTime(entry.createdAt, now))}</span><span>${escape(cost)}</span></span></a>${linksMarkup(links, helpers)}</article>`;
}
function runningRow(run, helpers, now) {
  const { escape } = helpers;
  const models = run.reservedModels?.length ? run.reservedModels : run.usage?.models ?? [];
  const model = models.length ? models.join(', ') : 'not reported';
  const spend = run.observedUsd === null || run.observedUsd === undefined ? 'not reported' : usd2(run.observedUsd);
  const cap = run.authorizedUsd === null || run.authorizedUsd === undefined ? 'not reported' : usd2(run.authorizedUsd);
  const elapsed = run.startedAt ? `${duration(Math.max(0, (now - Date.parse(run.startedAt)) / 1000))} elapsed` : 'not started';
  return `<article class="now-row"><a class="now-row-main" data-now-row href="#work/${escape(run.workItemId)}"><span class="now-row-head"><span class="tag">${escape(run.team)}</span><span class="ploeg-state run-running">Running</span></span><strong>${escape(run.workItemTitle || `Work Item ${run.workItemId}`)}</strong><span class="now-row-meta"><span>${escape(run.role)}${run.round ? ` · round ${run.round}` : ''}</span><span>Model ${escape(model)}</span><span>${escape(elapsed)}</span><span>Spend ${escape(spend)} of ${escape(cap)}</span></span></a></article>`;
}
function recentRow(run, helpers, now) {
  const { escape } = helpers;
  const outcome = run.outcome ? run.outcome.replaceAll('_', ' ') : 'No outcome reported';
  const verdict = run.verdict ? run.verdict.replaceAll('_', ' ') : '';
  return `<article class="now-row"><a class="now-row-main" data-now-row href="#work/${escape(run.workItemId)}"><span class="now-row-head"><span class="tag">${escape(run.team)}</span><span class="ploeg-state run-finished">Finished</span></span><strong>${escape(run.workItemTitle || `Work Item ${run.workItemId}`)}</strong><span class="now-row-meta"><span>${escape(run.role)}${run.round ? ` · round ${run.round}` : ''}</span><span>Outcome ${escape(outcome)}</span>${verdict ? `<span>Verdict ${escape(verdict)}</span>` : ''}<span>${escape(relativeTime(run.finishedAt, now))}</span></span></a></article>`;
}

/** Renders the Now page: what waits on a human, what runs now and what finished recently. */
export function nowMarkup(view, helpers, now = Date.now()) {
  if (!view.data) {
    if (view.error) return notice('Now could not be read', view.error.message, helpers, 'retry');
    return `<div class="empty compact now-loading">${helpers.icon('clock')}<h3>Reading what needs you…</h3><p>Waiting on you, running now and recently finished, across every team you can read.</p></div>`;
  }
  const data = view.data;
  const waiting = data.waiting.length ? data.waiting.map(entry => waitingRow(entry, helpers, now)).join('') : notice('Nothing waits on you', 'No Work Item awaits review, needs a human or is proposed.', helpers);
  const running = data.running.length ? data.running.map(run => runningRow(run, helpers, now)).join('') : notice('Nothing runs now', 'No Run is executing across your teams.', helpers);
  const recent = data.recent.length ? data.recent.map(run => recentRow(run, helpers, now)).join('') : notice('Nothing finished recently', 'No Run finished recently across your teams.', helpers);
  return `${caption(helpers, data)}<div class="now-groups">${groupMarkup('waiting', 'Work Items of every team you can read that need a human.', data.waiting.length, waiting, data.errors.waiting, helpers)}${groupMarkup('running', 'Runs executing right now, with their model and spend against authorization.', data.running.length, running, data.errors.running, helpers)}${groupMarkup('recent', 'Finished Runs across your teams, newest first.', data.recent.length, recent, data.errors.recent, helpers)}</div>`;
}
