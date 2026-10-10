import { closeReasonLabel, displayState, failureReason, humanReview, ciState, playState, runOutcome, runState, unreportedOutcome, verdict, withdrawnReason, workItemState } from './core/states.js';
import { compactCount, count, date, duration, money, notReported, plural, relative, time } from './core/format.js';
import { detailReason } from './core/reasons.js';
import { checkoutTarget } from './core/checkout.js';
import { changeText, elapsedClock, ploegRunActive, reconcileDetail, sessionProgress } from './core/progress.js';

const bridge = acquireVsCodeApi();
const saved = bridge.getState() || {};
const panelKey = document.body.dataset.taskKey || saved.taskKey || '';
let view;
let team = saved.team || '';
let busy = '';
let problem = '';
let connected = true;
let spoken = '';
const opened = new Set();

const providerNames = { vikunja: 'Vikunja', forgejo: 'Forgejo', github: 'GitHub', gitlab: 'GitLab', clickup: 'ClickUp', gitea: 'Gitea', ploeg: 'Ploeg', manual: 'Unfold', demo: 'Demo' };
const settled = ['done', 'withdrawn', 'stale'];
const priorities = ['', 'Low', 'Medium', 'High', 'Urgent', 'Do now'];
const visibleRuns = 6;
const pullRequestPath = /\/(?:pulls?|merge_requests)\/(\d+)\/?$/;
const amount = value => typeof value === 'number' && Number.isFinite(value);
const text = value => typeof value === 'string' ? value.trim() : '';
const newestFirst = (a, b) => { try { const x = BigInt(a.id), y = BigInt(b.id); return x < y ? 1 : x > y ? -1 : 0; } catch { return 0; } };
const oldestFirst = (a, b) => newestFirst(b, a);
const plain = (label, tone = 'neutral', extra = {}) => ({ key: label, label, tone, glyph: 'circle', ...extra });
const folded = (key, attributes, ...children) => element('details', { ...attributes, 'data-keep': key, ...(opened.has(key) ? { open: true } : {}) }, ...children);
const shortReportLength = 160;

function remember() { bridge.setState({ taskKey: panelKey, team }); }
function providerName(provider) { return providerNames[provider] || provider || 'the tracker'; }
function isWork(current) { return current?.kind === 'work'; }

/** The status lozenge for a state meta from `core/states.js`: a dot and a word, never colour alone. */
export function pill(meta, attributes = {}) {
  return element('span', { className: `pill-state tone-${meta.tone || 'neutral'}${meta.live ? ' live' : ''}`, title: meta.title || meta.description, ...attributes }, meta.label);
}

/** The Work Item the task panel follows: the first one that is not settled, else the newest. */
export function currentItem(status) {
  const items = status?.workItems || [];
  return items.find(item => !settled.includes(item.state)) || items[0];
}

function detailFor(current, id) {
  const detail = current.detail;
  return detail?.item && (!id || String(detail.item.id) === String(id)) ? detail : null;
}

function cardFor(current, id) {
  const card = current.card;
  return card && (!id || String(card.workItemId) === String(id)) ? card : null;
}

/** The Work Item, detail and card the panel shows, for a task panel and a Work Item panel alike. */
export function subject(current) {
  const linked = current?.linked?.session ? [current.linked.session] : [];
  if (isWork(current)) {
    const detail = current.detail ? reconcileDetail(current.detail, linked) : null;
    const item = detail?.item || null;
    return { item, detail, card: cardFor(current, item?.id), demo: Boolean(detail?.demo || current.card?.demo) };
  }
  const entry = currentItem(current.status);
  const recorded = entry ? detailFor(current, entry.id) : null;
  const detail = recorded ? reconcileDetail(recorded, linked) : null;
  const item = entry ? { ...entry, ...(detail ? { state: detail.item.state, team: detail.item.team, attempts: detail.item.attempts } : {}) } : null;
  return { item, detail, card: entry ? cardFor(current, entry.id) : null, demo: Boolean(current.status?.demo || detail?.demo) };
}

/** The progress state of the session that drives this Work Item, from `core/progress.js`, or null when no session does. */
export function progressOf(current) {
  const linked = current?.linked;
  if (!linked?.session) return null;
  const { detail, card } = subject(current);
  return sessionProgress(linked.session, { events: linked.events || [], viewer: Boolean(linked.viewer), ploeg: detail, card, recovery: linked.recovery || null });
}

function latestShift(detail) {
  return detail?.shifts?.[0] || detail?.item?.latestShift || null;
}

/** The pull request to review: the tracker status link, the newest open play, a checkpoint or a Run link; '' when none is HTTPS. */
export function pullRequestUrl(current) {
  const { item, detail, card } = subject(current);
  const plays = [...(card?.plays || [])].filter(play => amount(play.number)).sort((a, b) => b.number - a.number);
  const candidates = [
    item?.prUrl,
    ...plays.filter(play => play.state === 'open').map(play => play.url),
    ...plays.map(play => play.url),
    ...(detail?.checkpoints || []).map(entry => entry.prUrl),
    ...[...(detail?.runs || [])].sort(newestFirst).flatMap(run => [...(run.links || [])].reverse().filter(link => pullRequestPath.test(String(link)))),
  ];
  for (const candidate of candidates) { const url = safeHttps(candidate); if (url) return url; }
  return '';
}

function pullRequestNumber(url) { return pullRequestPath.exec(url ? new URL(url).pathname : '')?.[1] || ''; }

function latestVerdict(detail) {
  const shift = latestShift(detail);
  const readers = (detail?.runs || []).filter(run => !run.writes && run.state === 'finished' && (!shift || !run.shiftId || run.shiftId === shift.id)).sort((a, b) => (a.round || 0) - (b.round || 0) || oldestFirst(a, b));
  return readers.length ? verdict(readers.at(-1).verdict) : null;
}

function stateSituation(item, detail, { taskOpen = null } = {}) {
  const key = detail ? displayState(detail.item, detail.events) : item.state;
  const meta = workItemState(key);
  const who = item.team ? `team ${item.team}` : 'its Team';
  const Who = item.team ? `Team ${item.team}` : 'Its Team';
  const reason = detail && ['needs_human', 'stale'].includes(detail.item.state) ? detailReason(detail) : null;
  const shift = latestShift(detail);
  switch (key) {
    case 'proposed': return { meta, headline: 'Ploeg proposed this as follow-up work.', next: 'Nothing runs until a person approves it. Approve or reject it in the browser.' };
    case 'ingested': return { meta, headline: `${Who} received it.`, next: 'Ploeg recorded the task and is preparing it for the queue.' };
    case 'queued': return { meta, headline: `Queued for ${who}.`, next: `Ploeg starts it when a ${item.team || 'Team'} worker is free. The tracker sets its priority.${taskOpen !== null ? ' You can take it back until then.' : ''}` };
    case 'leased': {
      const running = (detail?.runs || []).filter(run => run.state === 'running');
      const line = running.length ? `${running.map(run => `The ${run.role || 'agent'}`).join(' and ')} ${running.length === 1 ? 'is' : 'are'} running${shift?.round ? ` in Round ${shift.round}` : ''}.` : shift?.round ? `Round ${shift.round} is running.` : '';
      return { meta, headline: `${Who} is working on it.`, next: [`Attempt ${item.attempts || 1}.`, line, 'Nothing is needed from you now.'].filter(Boolean).join(' ') };
    }
    case 'awaiting_review': {
      const agent = latestVerdict(detail);
      return { meta, headline: 'A pull request is waiting for your review.', next: 'Ploeg finished its work. Review and merge it on the forge, or request changes there; Unfold does not merge.', verdict: agent };
    }
    case 'needs_human':
      if (reason) return { meta, reason, headline: reason.sentence, next: reason.fix };
      return { meta, headline: `${Who} stopped and needs a human.`, next: 'Open it in the browser to read why, then decide how to continue.' };
    case 'stale':
      if (reason) return { meta, reason, headline: reason.sentence, next: reason.fix };
      return { meta, headline: `Ploeg stopped retrying ${who}’s work.`, next: 'Open it in the browser to read the failed Runs.' };
    case 'rejected': return { meta, headline: 'A person rejected this proposal, so it never ran.', next: '' };
    case 'done': {
      const merged = (detail?.events || []).some(entry => entry.action === 'work_item.done' && entry.detail?.reason === 'pull request merged');
      const why = merged ? 'The pull request was merged.' : shift?.closeReason ? `${closeReasonLabel(shift.closeReason)}.` : '';
      return { meta, headline: `Done by ${who}.`, next: [why, taskOpen === true ? 'The task is still open in the tracker. Hand it over again if more work is needed.' : ''].filter(Boolean).join(' ') };
    }
    case 'withdrawn': {
      const event = (detail?.events || []).find(entry => entry.action === 'work_item.withdrawn');
      const why = withdrawnReason(event?.detail?.reason) || withdrawnReason(shift?.closeReason) || '';
      return { meta, headline: `Taken back from ${who}.`, next: [why, 'Hand it over again when it is ready.'].filter(Boolean).join(' ') };
    }
    default: return { meta, headline: `${meta.label} in ${who}.`, next: '' };
  }
}

/** The one-line answer to "is Unfold working on this, and what happens next?" for the current view. */
export function ploegSituation(current) {
  const progress = progressOf(current);
  if (progress) return { meta: { ...progress.meta, key: progress.phase }, headline: progress.headline, next: progress.next, progress };
  if (isWork(current)) {
    const { item, detail } = subject(current);
    if (!item) return { meta: plain('Not loaded'), headline: 'The Work Item could not be loaded.', next: '' };
    return stateSituation(item, detail);
  }
  const status = current.status;
  const task = current.task;
  if (!status.available) return { meta: plain('Status unavailable'), headline: status.message || 'Ploeg status is unavailable.', next: '' };
  const { item, detail } = subject(current);
  if (item && !settled.includes(item.state)) return stateSituation(item, detail, { taskOpen: task.status === 'open' });
  if (status.assignedTeams.length) return { meta: plain('Waiting for Ploeg'), headline: `Assigned to ${status.assignedTeams.join(', ')}. Waiting for Ploeg to queue it…`, next: 'Ploeg normally queues an assigned task within seconds. If this stays, check the board webhook and routing in Ploeg.' };
  if (item) return stateSituation(item, detail, { taskOpen: task.status === 'open' });
  if (task.status !== 'open') return { meta: plain('Closed'), headline: 'This task is closed in the tracker.', next: 'Reopen it there before handing it to Ploeg.' };
  return { meta: plain('Not with Ploeg'), headline: 'Not with Ploeg yet.', next: 'Choose a team to hand it over. Ploeg works on a branch and opens a pull request for your review; nothing merges without you.' };
}

/** Whether the task can be handed to a Ploeg team from this panel now. */
export function canHandOff(current) {
  if (isWork(current)) return false;
  const status = current.status;
  const item = currentItem(status);
  return status.available && status.handoff.allowed && current.task.status === 'open' && !status.assignedTeams.length && (!item || settled.includes(item.state)) && status.teams.length > 0;
}

function canTakeBack(current) {
  if (isWork(current)) return false;
  const status = current.status;
  const item = currentItem(status);
  return Boolean(status.available && status.handoff.allowed && status.assignedTeams.length && (!item || item.state === 'queued' || settled.includes(item.state)));
}

/** A team's roles as a readable chain ("builder → devops → reviewer"), skipping empty entries. */
export function teamRoles(entry) {
  const roles = (entry?.roles || []).map(role => text(typeof role === 'string' ? role : role?.id)).filter(Boolean);
  return roles.length ? roles.join(' → ') : 'no roles reported';
}

/** How much work waits ahead in a team: "Nothing queued" or "2 queued". */
export function queueText(depth) {
  return amount(depth) && depth > 0 ? `${count(depth)} queued` : amount(depth) ? 'Nothing queued' : 'Queue not reported';
}

/** The one primary action for the state the panel is in, or null when the hand-off form or nothing is primary. */
export function primaryAction(current) {
  const { item } = subject(current);
  if (canHandOff(current)) return null;
  const situation = ploegSituation(current);
  const url = pullRequestUrl(current);
  if (situation.meta.key === 'awaiting_review' && url) {
    const number = pullRequestNumber(url);
    return element('button', { type: 'button', className: 'primary', 'data-open-url': url, title: url }, 'Review pull request ↗', number ? element('span', { className: 'sr-only' }, ` #${number}`) : null);
  }
  if (item?.id) return action('Open in browser ↗', 'open-ploeg', { className: 'primary', 'data-id': item.id, title: 'Open this Work Item in the Unfold workbench in your browser' });
  return null;
}

function secondaryActions(current, primary) {
  const { item, detail, card } = subject(current);
  const buttons = [];
  if (canTakeBack(current)) for (const name of current.status.assignedTeams) buttons.push(action(busy === 'take-back' ? 'Taking back…' : `Take back from ${name}`, 'take-back', { 'data-team': name, disabled: Boolean(busy) }));
  const checkout = checkoutTarget(detail, card);
  if (checkout) buttons.push(action(busy === 'checkout' ? 'Checking out…' : 'Check out branch', 'checkout', { className: 'quiet', disabled: Boolean(busy), title: `Fetch ${checkout.branch} from ${checkout.owner}/${checkout.repo} and switch the open clone to it` }));
  if (!isWork(current) && current.session?.allowed) buttons.push(action('Start a supervised session', 'start-session', { className: 'quiet', disabled: Boolean(busy), title: 'Set up an operator-led session from this task instead' }));
  if (item?.id && primary?.dataset?.action !== 'open-ploeg') buttons.push(action('Open in browser ↗', 'open-ploeg', { className: 'quiet', 'data-id': item.id, title: 'Open this Work Item in the Unfold workbench in your browser' }));
  return buttons;
}

/** The headline cost of a Work Item: one observed total, marked unsettled, a live "so far", a demo, or "Not reported". Never a made-up zero. */
export function costSummary(current) {
  const { item, card, demo } = subject(current);
  if (demo) return { value: 'Demo', note: 'no model calls' };
  if (card) {
    const live = card.live && typeof card.live === 'object' && amount(card.live.runSeconds) && card.live.runningRuns > 0 && item?.state === 'leased' ? card.live : null;
    if (live) return amount(live.costUsd) ? { value: money(live.costUsd), note: `so far · ${plural(live.runningRuns, 'Run')} running`, live: true } : { value: 'Not reported yet', note: 'a Run is running', live: true };
    const totals = card.totals || {};
    if (totals.costStatus === 'observed' && amount(totals.costUsd)) return { value: money(totals.costUsd), note: totals.usageComplete === false ? 'observed, not settled · partial' : 'observed, not settled' };
    if (totals.costStatus === 'reserved' && amount(totals.costUsd)) return { value: money(totals.costUsd), note: 'reserved, not settled' };
    return { value: notReported, note: 'Ploeg reported no cost' };
  }
  if (amount(item?.spentUsd) && item.spentUsd > 0) return { value: money(item.spentUsd), note: 'Shift spend' };
  return { value: notReported, note: '' };
}

function budgetSummary(current) {
  const { item, detail, card, demo } = subject(current);
  const shift = latestShift(detail);
  const value = amount(shift?.budgetUsd) && shift.budgetUsd > 0 ? shift.budgetUsd : amount(item?.budgetUsd) && item.budgetUsd > 0 ? item.budgetUsd : amount(card?.totals?.authorizedUsd) && card.totals.authorizedUsd > 0 ? card.totals.authorizedUsd : null;
  if (value === null) return { value: notReported, note: '' };
  return { value: money(value), note: demo ? 'demo fixture' : shift ? 'latest Shift' : 'authorized' };
}

function runsSummary(current) {
  const { detail, card } = subject(current);
  const totals = card?.totals || {};
  const runs = detail?.runs || null;
  const total = amount(totals.runs) ? totals.runs : runs ? runs.length : null;
  if (total === null) return { value: notReported, note: '' };
  const failed = amount(totals.failedRuns) ? totals.failedRuns : runs ? runs.filter(run => run.outcome === 'failed' || run.failureReason).length : null;
  const item = detail?.item || subject(current).item;
  const leased = item?.state === 'leased';
  const running = !leased ? 0 : card?.live?.runningRuns > 0 ? card.live.runningRuns : runs ? runs.filter(run => ploegRunActive(item, run)).length : 0;
  const unclosed = runs ? runs.filter(run => run.state === 'stopped').length : 0;
  const note = [running ? `${count(running)} running` : '', unclosed ? `${count(unclosed)} stopped, still listed by Ploeg` : '', failed === null ? '' : failed ? `${count(failed)} failed` : 'none failed'].filter(Boolean).join(' · ');
  return { value: count(total), note };
}

function roundsSummary(current) {
  const { detail, card } = subject(current);
  const totals = card?.totals || {};
  const shift = latestShift(detail);
  const rounds = amount(totals.rounds) ? totals.rounds : amount(shift?.round) ? shift.round : null;
  const shifts = amount(totals.shifts) ? totals.shifts : detail?.shifts ? detail.shifts.length : null;
  return { value: rounds === null ? notReported : count(rounds), note: shifts ? plural(shifts, 'Shift') : '' };
}

function stat(label, { value, note, live }) {
  return element('div', { className: `stat${value === notReported || value === 'Not reported yet' ? ' unknown' : ''}` },
    element('dt', {}, label),
    element('dd', {}, element('span', { className: 'stat-value num' }, live ? element('span', { className: 'live-mark', 'aria-hidden': 'true' }) : null, value), note ? element('span', { className: 'stat-note' }, note) : null));
}

/** The session's spend against its budget as one figure with a meter; the meter is left out without a budget. */
export function spendStat(progress) {
  const spend = progress.spend;
  const budget = amount(spend.budgetUsd) && spend.budgetUsd > 0 ? spend.budgetUsd : null;
  const status = spend.status === 'observed' ? 'observed, not settled' : spend.status === 'settled' ? 'settled' : progress.demo ? 'no model calls' : '';
  const share = budget !== null && amount(spend.valueUsd) ? Math.min(1, Math.max(0, spend.valueUsd / budget)) : null;
  const meter = share === null ? null : element('span', { className: `meter${share >= 0.9 ? ' meter-high' : ''}`, role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(budget), 'aria-valuenow': String(spend.valueUsd), 'aria-label': `${spend.text} of ${money(budget)} budget` }, element('span', { className: 'meter-fill', 'data-share': String(Math.round(share * 100)) }));
  return element('div', { className: `stat stat-spend${spend.status === 'unknown' ? ' unknown' : ''}` },
    element('dt', {}, 'Spend'),
    element('dd', {},
      element('span', { className: 'stat-value num' }, spend.text, budget !== null ? element('span', { className: 'stat-of' }, ` of ${money(budget)}`) : null),
      meter,
      status ? element('span', { className: 'stat-note' }, status) : null));
}

/** The facts row of the head card: cost, budget, Runs, Rounds and Team. Null before Ploeg has a Work Item. */
export function headFacts(current) {
  const { item } = subject(current);
  if (!item) return null;
  const progress = progressOf(current);
  if (progress) {
    const rounds = roundsSummary(current);
    return element('dl', { className: 'stats', 'aria-label': 'Work Item facts' },
      spendStat(progress),
      stat('Runs', { value: count(progress.steps.length), note: rounds.value === notReported ? rounds.note : [plural(Number(rounds.value) || 0, 'Round'), rounds.note].filter(Boolean).join(' · ') }));
  }
  return element('dl', { className: 'stats', 'aria-label': 'Work Item facts' },
    stat('Cost', costSummary(current)),
    stat('Budget', budgetSummary(current)),
    stat('Runs', runsSummary(current)),
    stat('Rounds', roundsSummary(current)),
    stat('Team', { value: item.team || notReported, note: '' }));
}

/** The cost per role table from the Run card's crew. Null without a card or a named role. */
export function crewTable(current) {
  if (progressOf(current)) return null;
  const { card, demo } = subject(current);
  const crew = (card?.crew || []).filter(member => text(member?.role));
  if (!crew.length) return null;
  const tokens = value => amount(value) ? compactCount(value) : notReported;
  const cost = value => demo ? 'Demo' : amount(value) ? money(value) : notReported;
  return element('div', { className: 'crew' },
    element('h3', { id: 'crew-heading' }, 'Cost per role'),
    element('div', { className: 'table-scroll', role: 'region', 'aria-labelledby': 'crew-heading', tabindex: '0' },
      element('table', { className: 'data-table' },
        element('thead', {}, element('tr', {}, element('th', { scope: 'col' }, 'Role'), element('th', { scope: 'col', className: 'num' }, 'Runs'), element('th', { scope: 'col', className: 'num' }, 'Cost'), element('th', { scope: 'col', className: 'num' }, 'Tokens in'), element('th', { scope: 'col', className: 'num' }, 'Tokens out'))),
        element('tbody', {}, ...crew.map(member => element('tr', {},
          element('th', { scope: 'row' }, member.role, member.writes === true ? element('span', { className: 'access' }, 'writer') : member.writes === false ? element('span', { className: 'access' }, 'reader') : null),
          element('td', { className: 'num' }, amount(member.runs) ? count(member.runs) : notReported),
          element('td', { className: `num${!demo && !amount(member.costUsd) ? ' unknown' : ''}` }, cost(member.costUsd)),
          element('td', { className: 'num' }, demo ? 'Demo' : tokens(member.inputTokens)),
          element('td', { className: 'num' }, demo ? 'Demo' : tokens(member.outputTokens)))))))
  );
}

function reasonBlock(reason) {
  return element('div', { className: 'reason' },
    reason.run?.text ? element('blockquote', { className: 'quote' }, element('p', {}, `“${reason.run.text}”`), element('footer', {}, `The ${reason.run.role || 'agent'}${reason.run.round ? ` · Round ${reason.run.round}` : ''}`)) : reason.headline ? element('blockquote', { className: 'quote' }, element('p', {}, `“${reason.headline}”`), element('footer', {}, 'Ploeg')) : null,
    element('p', { className: 'requeue' }, reason.requeue));
}

function swatch(color) {
  const node = element('i', { className: 'swatch', 'aria-hidden': 'true' });
  if (/^#?[0-9a-f]{6}$/i.test(color || '') && node.style) node.style.background = color.replace(/^#?/, '#');
  return node;
}

function teamPicker(current) {
  const teams = current.status.teams;
  if (!teams.some(entry => entry.id === team)) team = teams.find(entry => entry.id === current.preferredTeam)?.id || teams.find(entry => !entry.paused)?.id || teams[0]?.id || '';
  const chosen = teams.find(entry => entry.id === team);
  return element('form', { className: 'handoff', id: 'handoff-form' },
    element('fieldset', {},
      element('legend', {}, 'Hand to Ploeg'),
      element('div', { className: 'teams', role: 'radiogroup' }, ...teams.map(entry => element('label', { className: `team-option${entry.id === team ? ' selected' : ''}` },
        element('input', { type: 'radio', name: 'team', value: entry.id, checked: entry.id === team, disabled: Boolean(busy) }),
        element('span', { className: 'team-body' },
          element('strong', {}, entry.id, entry.paused ? element('span', { className: 'tag' }, 'paused') : null),
          element('span', { className: 'team-roles' }, teamRoles(entry)),
          element('span', { className: 'team-queue' }, queueText(entry.queueDepth))))))),
    element('div', { className: 'actions' },
      element('button', { type: 'submit', className: 'primary', disabled: Boolean(busy) || !chosen }, busy === 'handoff' ? 'Handing over…' : chosen ? `Hand to ${chosen.id}` : 'Choose a team'),
      chosen ? element('span', { className: 'muted small' }, `Assigns “${chosen.assignee}” in ${providerName(current.task.provider)} and comments that you handed it over.`) : null));
}

function sessionButton(progress, entry) {
  const label = busy === `session:${entry.id}` ? `${entry.label}…` : entry.label;
  return element('button', { type: 'button', className: entry.primary ? 'primary' : 'quiet', 'data-session-action': entry.id, 'data-session': progress.sessionId, disabled: Boolean(busy) || !connected, ...(entry.confirm ? { 'aria-haspopup': 'dialog', title: `${entry.confirm.title} You confirm before anything happens.` } : entry.hint ? { title: entry.hint } : {}) }, label);
}

/** The line under the headline while a Role works: who, which Round, a ticking clock, what it last did, and spend against budget. */
export function liveLine(progress) {
  const current = progress.current;
  if (!current) return null;
  const since = Date.parse(current.startedAt || '');
  return element('p', { className: 'live-line', 'aria-label': `${current.role} has worked for ${elapsedClock(current.seconds)}` },
    element('span', { className: 'live-mark', 'aria-hidden': 'true' }),
    element('strong', {}, current.role),
    current.round ? element('span', {}, `Round ${current.round}`) : null,
    Number.isFinite(since) ? element('span', { className: 'num', 'data-since': String(since), 'aria-hidden': 'true' }, elapsedClock(current.seconds)) : null,
    current.activity ? element('span', { className: 'muted' }, `${current.activity.text} · ${relative(current.activity.at)}`) : null,
    element('span', { className: 'muted num' }, `${progress.spend.text}${amount(progress.spend.budgetUsd) ? ` of ${money(progress.spend.budgetUsd)}` : ''}`));
}

function progressCard(current, progress) {
  const facts = headFacts(current);
  const { item } = subject(current);
  const explained = Boolean(current.linked?.recovery?.summary);
  const reason = progress.reason && ['stopped', 'failed'].includes(progress.phase) && !explained ? progress.reason : null;
  const actions = progress.actions.filter(entry => entry.id !== 'open-pr' || progress.change.pullRequest?.url);
  const button = entry => entry.id === 'open-pr' ? element('button', { type: 'button', className: entry.primary ? 'primary' : 'quiet', 'data-open-url': progress.change.pullRequest.url, title: progress.change.pullRequest.url }, `${entry.label} ↗`) : sessionButton(progress, entry);
  const decisions = actions.filter(entry => entry.primary || !navigation.has(entry.id)).filter(entry => entry.id !== 'cancel').map(button);
  const elsewhere = actions.filter(entry => !entry.primary && navigation.has(entry.id)).map(button);
  if (item?.id) elsewhere.push(action('Open in browser ↗', 'open-ploeg', { className: 'quiet', 'data-id': item.id, title: 'Open this Work Item in the Unfold workbench in your browser' }));
  const cancel = actions.find(entry => entry.id === 'cancel');
  if (cancel) { const destructive = button(cancel); destructive.className = 'quiet destructive'; elsewhere.push(element('span', { className: 'action-gap', 'aria-hidden': 'true' }), destructive); }
  return element('section', { className: `card head-card progress-card tone-${progress.meta.tone}${facts ? ' with-facts' : ''}`, 'aria-labelledby': 'head-heading' },
    element('div', { className: 'head-main' },
      element('div', { className: 'head-state' },
        pill({ ...progress.meta, title: progress.meta.label }),
        reason ? pill({ label: capital(reason.short), tone: progress.meta.tone, title: reason.sentence }, { className: `pill-state tone-${progress.meta.tone} reason-chip` }) : null,
        progress.demo ? element('span', { className: 'tag demo-tag' }, 'Demo · no model calls or spend') : null,
        current.linked?.live ? element('span', { className: 'tag live-tag', title: 'Following the session\'s event stream' }, 'Live') : null),
      element('h2', { id: 'head-heading', className: 'headline' }, progress.headline),
      liveLine(progress),
      progress.next ? element('p', { className: 'next' }, progress.next) : null,
      decisions.length ? element('div', { className: 'actions', role: 'group', 'aria-label': 'What you can do' }, ...decisions) : null,
      elsewhere.length ? element('div', { className: 'actions actions-elsewhere', role: 'group', 'aria-label': 'Look closer' }, ...elsewhere) : null),
    facts ? element('div', { className: 'head-facts' }, facts) : null);
}

const capital = value => value ? value[0].toUpperCase() + value.slice(1) : value;
const navigation = new Set(['investigate', 'open-session']);

function stepReport(step) {
  const summary = text(step.summary);
  if (!summary) return null;
  if (summary.length <= shortReportLength && !summary.includes('\n')) return element('div', { className: 'step-summary small' }, markdown(summary));
  const preview = summary.replace(/[*_`#>]/g, '').replace(/\s+/g, ' ');
  return folded(`step:${step.id}`, { className: 'step-report' },
    element('summary', {}, element('span', { className: 'step-preview small' }, preview), element('span', { className: 'step-more small' }, 'Full report')),
    element('div', { className: 'step-summary small' }, markdown(summary)));
}

/** The Roles of the session in order, each with its outcome, verdict, duration and summary. */
export function stepsSection(current) {
  const progress = progressOf(current);
  if (!progress) return null;
  if (!progress.steps.length) return element('section', { className: 'card steps', 'aria-labelledby': 'steps-heading' }, element('div', { className: 'section-heading' }, element('h2', { id: 'steps-heading' }, 'Steps')), element('p', { className: 'muted' }, progress.phase === 'ready' ? 'Nothing has run yet.' : 'No Role has started yet.'));
  return element('section', { className: 'card steps', 'aria-labelledby': 'steps-heading' },
    element('div', { className: 'section-heading' }, element('h2', { id: 'steps-heading' }, 'Steps'), element('span', {}, `${plural(progress.steps.length, 'Run')} in this session, in order`)),
    element('ol', { className: 'step-list' }, ...progress.steps.map(step => element('li', { className: `step step-${step.state}` },
      element('div', { className: 'step-head' },
        element('strong', {}, step.role), element('span', { className: 'access' }, step.mode === 'read' ? 'reader' : 'writer'),
        pill({ label: step.label, tone: step.tone, glyph: 'circle', live: step.state === 'working', ...(step.state === 'cut_off' ? { title: `Still recorded as running when the session stopped${step.finishedAt ? ` at ${time(step.finishedAt)}` : ''}` } : {}) }),
        step.verdict ? pill({ label: step.verdict.recorded ? step.verdict.label : `${step.verdict.label} · from its transcript`, tone: step.verdict.recorded ? step.verdict.tone : 'neutral', title: step.verdict.recorded ? 'An agent verdict is evidence, not a human review.' : 'Given in the Run\'s own transcript before it was cut off; no finished Run recorded it.' }) : null,
        element('span', { className: 'step-time num muted' }, [step.startedAt ? time(step.startedAt) : '', step.seconds !== null ? duration(step.seconds) : ''].filter(Boolean).join(' · '))),
      stepReport(step)))));
}

/** The change the session made: files and lines, the branch, the candidate and the pull request. Null before anything changed. */
export function changeSection(current) {
  const progress = progressOf(current);
  if (!progress) return null;
  const change = progress.change;
  if (!change.files && !change.pullRequest && !change.candidate) return null;
  const counts = changeText(change);
  return element('section', { className: 'card change', 'aria-labelledby': 'change-heading' },
    element('div', { className: 'section-heading' }, element('h2', { id: 'change-heading' }, 'Change'), element('span', {}, change.pullRequest ? `Pull request #${change.pullRequest.number}` : change.candidate === 'ready' ? 'Captured for review' : progress.meta.live ? 'So far, from the Runs' : 'Not captured as a candidate')),
    element('dl', { className: 'change-facts' },
      counts ? fact('Files', element('span', { className: 'diff num' }, element('span', { className: 'files' }, plural(change.files, 'file')), change.added || change.removed ? element('span', { className: 'added' }, `+${change.added}`) : null, change.added || change.removed ? element('span', { className: 'removed' }, `−${change.removed}`) : null)) : null,
      change.branch ? fact('Branch', element('code', {}, change.branch)) : null,
      change.candidateText ? fact('Candidate', change.candidateText) : null),
    change.viewable && !progress.actions.some(entry => entry.id === 'view-change') ? element('div', { className: 'actions' }, sessionButton(progress, { id: 'view-change', label: 'View change' })) : null);
}

/** What the sources disagree about, resolved in words. */
export function factsSection(current) {
  const progress = progressOf(current);
  if (!progress?.facts.length) return null;
  return element('section', { className: 'card facts', 'aria-labelledby': 'facts-heading' },
    element('div', { className: 'section-heading' }, element('h2', { id: 'facts-heading' }, 'Worth knowing')),
    element('ul', { className: 'fact-list small' }, ...progress.facts.map(entry => element('li', {}, entry))));
}

/** The head card: the state, why, what to press, the facts and the cost per role. */
export function headCard(current) {
  const progress = progressOf(current);
  if (progress) return progressCard(current, progress);
  const situation = ploegSituation(current);
  const reason = situation.reason;
  const primary = primaryAction(current);
  const secondary = secondaryActions(current, primary);
  const facts = headFacts(current);
  const handoff = canHandOff(current);
  const status = current.status;
  const { item, demo } = subject(current);
  const blocked = !handoff && !isWork(current) && status?.available && !status.handoff.allowed && status.handoff.reason && !item ? element('p', { className: 'muted small' }, status.handoff.reason) : null;
  const tone = reason?.tone || situation.meta.tone || 'neutral';
  return element('section', { className: `card head-card tone-${tone}${facts ? ' with-facts' : ''}`, 'aria-labelledby': 'head-heading' },
    element('div', { className: 'head-main' },
      element('div', { className: 'head-state' },
        pill(situation.meta),
        reason ? pill({ label: reason.chip, tone: reason.tone, title: reason.sentence }, { className: `pill-state tone-${reason.tone} reason-chip` }) : null,
        situation.verdict ? pill({ label: situation.verdict.label, tone: situation.verdict.tone, title: 'An agent verdict is evidence, not a human review.' }) : null,
        demo ? element('span', { className: 'tag demo-tag' }, 'Demo · no model calls or spend') : null),
      element('h2', { id: 'head-heading', className: 'headline' }, situation.headline),
      situation.next ? element('p', { className: 'next' }, situation.next) : null,
      situation.verdict ? element('p', { className: 'muted small' }, 'Agent review is evidence, not a human review.') : null,
      reason ? reasonBlock(reason) : null,
      blocked,
      primary || secondary.length ? element('div', { className: 'actions' }, primary, ...secondary) : null),
    facts ? element('div', { className: 'head-facts' }, facts) : null,
    crewTable(current),
    handoff ? teamPicker(current) : null);
}

function playRow(play) {
  const url = safeHttps(play.url);
  const label = `Pull request #${play.number}`;
  const ci = ciState(play.ci?.state);
  const failing = (play.ci?.checks || []).filter(check => ['failure', 'error'].includes(check.state)).map(check => text(check.context)).filter(Boolean);
  const reviews = (play.reviews || []).filter(review => text(review.state));
  const diff = [amount(play.additions) ? `+${count(play.additions)}` : '', amount(play.deletions) ? `−${count(play.deletions)}` : '', amount(play.changedFiles) ? plural(play.changedFiles, 'file') : ''].filter(Boolean);
  return element('li', { className: 'play' },
    element('div', { className: 'play-head' },
      url ? element('button', { type: 'button', className: 'link-button play-link', 'data-open-url': url, title: url }, `${label} ↗`) : element('strong', {}, label),
      pill(playState(play.state)),
      ci ? pill({ ...ci, title: failing.length ? `Failing: ${failing.join(', ')}` : ci.label }) : element('span', { className: 'muted small' }, 'CI not reported'),
      diff.length ? element('span', { className: 'diff num' }, ...diff.map(part => element('span', { className: part.startsWith('+') ? 'added' : part.startsWith('−') ? 'removed' : 'files' }, part))) : null),
    failing.length ? element('p', { className: 'small failing' }, `Failing checks: ${failing.join(', ')}`) : null,
    element('p', { className: 'play-reviews small' },
      element('span', { className: 'muted' }, 'Human reviews: '),
      ...(reviews.length ? reviews.flatMap((review, index) => [index ? ', ' : '', `${humanReview(review.state).label} by ${text(review.reviewer) || 'a reviewer'}`]) : ['none yet'])),
    text(play.branch) ? element('p', { className: 'small muted' }, 'Branch ', element('code', {}, play.branch)) : null);
}

/** The pull requests on the Run card, newest first, with their state, CI and human reviews. Null without plays. */
export function pullRequestsSection(current) {
  const { card } = subject(current);
  const plays = (card?.plays || []).filter(play => play && amount(play.number)).sort((a, b) => b.number - a.number);
  if (!plays.length) return null;
  return element('section', { className: 'card', 'aria-labelledby': 'prs-heading' },
    element('div', { className: 'section-heading' }, element('h2', { id: 'prs-heading' }, plays.length === 1 ? 'Pull request' : 'Pull requests'), element('span', {}, 'Reviews here are people on the forge. Agent verdicts are under Runs.')),
    element('ul', { className: 'plays' }, ...plays.map(playRow)));
}

/** The writer's own account of the change: the newest writing Run in the latest Shift that reported a problem or solution. */
export function writerAccount(detail) {
  const reported = (detail?.runs || []).filter(run => run.writes && (text(run.problem) || text(run.solution))).sort(newestFirst);
  const shift = latestShift(detail);
  const run = reported.find(entry => shift && entry.shiftId === shift.id) || reported[0];
  if (!run) return null;
  return { runId: run.id, role: run.role || '', round: run.round || 0, at: run.finishedAt || run.startedAt || '', problem: text(run.problem), solution: text(run.solution), earlierShift: Boolean(shift && run.shiftId !== shift.id) };
}

function accountSection(current) {
  const { detail } = subject(current);
  const account = writerAccount(detail);
  if (!account) return null;
  const number = pullRequestNumber(pullRequestUrl(current));
  const side = (key, heading, body) => element('div', { className: `account-side account-${key}` }, element('h3', {}, heading), body ? markdown(body) : element('p', { className: 'muted' }, 'Not reported.'));
  const source = [account.role || 'writer', account.round ? `Round ${account.round}` : '', account.earlierShift ? 'earlier Shift' : '', account.at ? relative(account.at) : ''].filter(Boolean).join(' · ');
  return element('section', { className: 'card account', 'aria-labelledby': 'account-heading' },
    element('div', { className: 'section-heading' }, element('h2', { id: 'account-heading' }, 'Problem → Solution'), element('span', {}, `Written by ${source}`)),
    element('div', { className: 'account-grid' }, side('problem', 'Problem', account.problem), element('span', { className: 'account-arrow', 'aria-hidden': 'true' }, '→'), side('solution', 'Solution', account.solution)),
    element('p', { className: 'muted small caveat' }, `The agent’s own account: verify it against ${number ? `pull request #${number}` : 'the pull request'}.`));
}

function runSeconds(run, item = null) {
  const start = Date.parse(run.startedAt || '');
  const end = run.state === 'running' ? Date.now() : run.state === 'stopped' ? Date.parse(item?.updatedAt || '') : Date.parse(run.finishedAt || '');
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 1000 : null;
}

/** What a Run reported, as a state meta: running or waiting, its outcome, its failure, or that it reported none. */
export function runResult(run, item = null) {
  if (run.state === 'stopped') return { ...runState('stopped'), title: runState('stopped').description };
  if (run.state !== 'finished') return run.state === 'running' ? runState('running') : { ...runState('pending'), label: 'Waiting for a worker' };
  const outcome = runOutcome(run.outcome);
  if (outcome) return { ...outcome, label: outcome.short || outcome.label, title: outcome.label };
  const failure = failureReason(run.failureReason);
  if (failure) return { ...failure, label: 'Failed', tone: 'danger', title: failure.label };
  return unreportedOutcome(run);
}

/** A Run's cost: the observed model cost, "Demo" in the demo, otherwise "Not reported". */
export function runCost(run, demo) {
  if (demo) return 'Demo';
  return run.costStatus === 'observed' && amount(run.usage?.costUsd) ? money(run.usage.costUsd) : notReported;
}

function runRow(run, demo, item = null) {
  const result = runResult(run, item);
  const failure = failureReason(run.failureReason);
  const reader = !run.writes && run.state === 'finished';
  const seconds = runSeconds(run, item);
  const cost = runCost(run, demo);
  const note = run.outcome === 'stuck' ? text(run.stuckReason) : '';
  return element('li', { className: 'run-row' },
    element('span', { className: 'run-role' }, element('strong', {}, run.role || 'agent'), element('span', { className: 'access' }, run.writes ? 'writer' : 'reader')),
    element('span', { className: 'run-result' },
      pill(result),
      reader ? pill({ ...verdict(run.verdict), label: verdict(run.verdict).short, title: `${verdict(run.verdict).label}. An agent verdict is not a human review.` }) : null),
    element('span', { className: 'run-numbers num' },
      element('span', { className: cost === notReported ? 'unknown' : '', title: 'Model cost' }, cost),
      element('span', { title: 'Duration' }, seconds === null ? '—' : duration(seconds))),
    failure ? element('span', { className: 'run-note' }, `Cause: ${failure.cause || failure.label}`) : null,
    note ? element('span', { className: 'run-note muted' }, note) : null);
}

/** Groups Runs by Shift and Round: the current Shift first, newest Round first, Runs in the order they started. */
export function runGroups(detail) {
  const shift = latestShift(detail);
  const groups = new Map();
  for (const run of detail?.runs || []) {
    const round = Number.isInteger(run.round) && run.round > 0 ? run.round : 0;
    const key = `${run.shiftId ?? ''}:${round}`;
    if (!groups.has(key)) groups.set(key, { key, shiftId: run.shiftId ?? null, round, runs: [] });
    groups.get(key).runs.push(run);
  }
  const current = id => !shift || !id || String(id) === String(shift.id);
  return [...groups.values()]
    .map(group => ({ ...group, current: current(group.shiftId), label: group.round ? `${current(group.shiftId) ? '' : 'Earlier Shift · '}Round ${group.round}` : 'Runs', runs: group.runs.sort(oldestFirst) }))
    .sort((a, b) => Number(b.current) - Number(a.current) || (Number(b.shiftId) || 0) - (Number(a.shiftId) || 0) || b.round - a.round);
}

/** The Runs of the Work Item by Round, with the rest folded away after the first few. Null before a detail is loaded. */
export function runsSection(current) {
  const { detail, item, demo } = subject(current);
  if (!detail) return null;
  const runs = detail.runs || [];
  const shift = latestShift(detail);
  const heading = element('div', { className: 'section-heading' }, element('h2', { id: 'runs-heading' }, 'Runs'), element('span', {}, shift ? `${plural(shift.round, 'Round')} · ${shift.closedAt ? `closed ${relative(shift.closedAt)}` : `opened ${relative(shift.openedAt)}`} · ${closeReasonLabel(shift.closeReason)}` : ''));
  if (!runs.length) {
    const state = item?.state;
    const note = state === 'proposed' ? 'No Shift yet. One opens after a person approves the proposal.' : ['done', 'withdrawn', 'stale', 'needs_human'].includes(state) ? 'No Run ran for this Work Item.' : 'No Run has started yet. One starts when a worker of the Team takes the Work Item.';
    return element('section', { className: 'card runs', 'aria-labelledby': 'runs-heading' }, heading, element('p', { className: 'muted' }, note));
  }
  let shown = 0;
  const visible = [];
  const rest = [];
  for (const group of runGroups(detail)) {
    const head = group.runs.slice(0, Math.max(0, visibleRuns - shown));
    shown += head.length;
    if (head.length) visible.push({ ...group, runs: head });
    if (group.runs.length > head.length) rest.push({ ...group, runs: group.runs.slice(head.length) });
  }
  const list = (groups, continued = new Set()) => groups.map(group => element('div', { className: 'run-group' },
    element('h3', { className: 'run-group-label' }, continued.has(group.key) ? `${group.label} (continued)` : group.label),
    element('ul', { className: 'run-list' }, ...group.runs.map(run => runRow(run, demo, item)))));
  const hidden = rest.reduce((total, group) => total + group.runs.length, 0);
  const body = [...list(visible), hidden ? folded('more-runs', { className: 'more-runs' }, element('summary', {}, `Show ${hidden} more ${hidden === 1 ? 'Run' : 'Runs'}`), ...list(rest, new Set(visible.map(group => group.key)))) : null];
  if (progressOf(current)) return element('section', { className: 'card runs', 'aria-labelledby': 'runs-heading' },
    folded('ploeg-record', { className: 'ploeg-record' },
      element('summary', {}, element('h2', { id: 'runs-heading', className: 'inline-heading' }, 'As Ploeg records it'), element('span', { className: 'muted small' }, ` · ${plural(runs.length, 'Run')}; the session's Roles run inside it`)),
      ...body));
  return element('section', { className: 'card runs', 'aria-labelledby': 'runs-heading' }, heading, ...body);
}


function labelsAndPeople(labels, assignees) {
  if (!labels.length && !assignees.length) return element('p', { className: 'task-people muted' }, 'Unassigned · no labels');
  return element('div', { className: 'task-people' },
    labels.length ? element('ul', { className: 'labels', 'aria-label': 'Labels' }, ...labels.map(label => element('li', { className: 'label' }, swatch(label.color), label.name))) : null,
    element('span', { className: 'assignees muted' }, assignees.length ? `Assigned to ${assignees.map(person => person.name && person.name !== person.username ? `${person.name} (${person.username})` : person.username).join(', ')}` : 'Unassigned'));
}

function externalLabel(id) {
  const value = text(id);
  if (!value) return '';
  const label = value.includes('#') ? value : `#${value}`;
  return label.length > 24 ? element('span', { className: 'external-id', title: label }, `${label.slice(0, 16)}…`) : label;
}

function metaLine(parts) {
  const entries = parts.filter(Boolean);
  return element('div', { className: 'task-meta' }, ...entries.flatMap((part, index) => index ? [element('span', { className: 'dot', 'aria-hidden': 'true' }, '·'), part] : [part]));
}

function headerPill(current, ploegMeta) {
  const progress = progressOf(current);
  if (!progress) return pill(ploegMeta, { title: 'State in Ploeg' });
  return pill({ ...progress.meta, title: `${progress.meta.label} in Unfold; ${ploegMeta.label} in Ploeg` });
}

function trackerPill(status) {
  return pill(plain(status === 'open' ? 'Open' : status === 'closed' ? 'Closed' : 'Unknown'), { title: 'State in the tracker' });
}

/** The panel header: where the work lives, its title, the toolbar, one meta line, labels and assignees. */
export function header(current) {
  const refresh = action('Refresh', 'refresh', { className: 'quiet', disabled: Boolean(busy), title: isWork(current) ? 'Reload the Work Item from Ploeg' : 'Reload the task and its Ploeg status' });
  if (isWork(current)) {
    const item = current.detail?.item;
    const url = safeHttps(item?.url);
    const target = item?.target ? `${item.target.owner}/${item.target.repo}` : '';
    return element('header', { className: 'task-header' },
      element('div', { className: 'eyebrow' }, element('span', { className: 'brand-mark' }, brandMark()), [`${providerName(item?.provider)} · Work Item ${item?.id ?? current.workItemId}`, item?.team ? `team ${item.team}` : '', target ? `→ ${target}` : ''].filter(Boolean).join(' · ').replace(' · →', ' →').toUpperCase()),
      element('div', { className: 'title-row' },
        element('h1', {}, item?.title || `Work Item ${current.workItemId}`),
        element('div', { className: 'toolbar' }, refresh, url ? element('button', { type: 'button', 'data-open-url': url, title: url }, `Open in ${providerName(item.provider)} ↗`) : null)),
      metaLine([
        item ? headerPill(current, workItemState(displayState(item, current.detail.events))) : null,
        externalLabel(item?.externalId),
        amount(item?.priority) && item.priority > 0 ? `priority ${item.priority}` : '',
        item?.updatedAt ? `updated ${relative(item.updatedAt)}` : '',
      ]));
  }
  const task = current.task;
  const { item, detail } = subject(current);
  return element('header', { className: 'task-header' },
    element('div', { className: 'eyebrow' }, element('span', { className: 'brand-mark' }, brandMark()), [providerName(task.provider), current.source.name, current.repositoryName !== current.source.name ? `→ ${current.repositoryName}` : ''].filter(Boolean).join(' · ').replace(' · →', ' →').toUpperCase()),
    element('div', { className: 'title-row' },
      element('h1', {}, task.title),
      element('div', { className: 'toolbar' }, refresh, task.url ? action(`Open in ${providerName(task.provider)} ↗`, 'open-tracker', { title: task.url }) : null)),
    metaLine([
      item ? headerPill(current, workItemState(detail ? displayState(detail.item, detail.events) : item.state)) : trackerPill(task.status),
      item && task.status !== 'open' ? `${task.status} in ${providerName(task.provider)}` : '',
      task.identifier || `#${task.id}`,
      task.priority ? `priority ${priorities[task.priority] || task.priority}` : '',
      task.updatedAt ? `updated ${relative(task.updatedAt)}` : '',
      task.dueAt ? `due ${date(task.dueAt)}` : '',
    ]),
    labelsAndPeople(task.labels || [], task.assignees || []));
}

function briefSection(current) {
  const work = isWork(current);
  const body = work ? current.detail?.item?.descriptionMarkdown ?? current.detail?.item?.description ?? '' : current.task.descriptionMarkdown ?? current.task.description ?? '';
  const truncated = !work && current.task.descriptionTruncated;
  return element('section', { className: 'card brief', 'aria-labelledby': 'brief-heading' },
    element('div', { className: 'section-heading' }, element('h2', { id: 'brief-heading' }, 'Brief'), element('span', {}, truncated ? 'shortened · open the tracker for the full text' : work ? 'as Ploeg recorded it' : '')),
    String(body).trim() ? markdown(body) : element('p', { className: 'muted' }, 'No description.'));
}

function notices(current) {
  return [
    !connected ? element('div', { className: 'notice warning', role: 'status' }, element('strong', {}, 'Offline'), 'Showing the last loaded state. Reconnect to the workbench to act on it.') : null,
    problem ? element('div', { className: 'notice warning', role: 'alert' }, element('strong', {}, 'Could not complete that'), problem) : null,
    current?.ploegProblem ? element('div', { className: 'notice', role: 'status' }, element('strong', {}, 'Run history unavailable'), current.ploegProblem) : null,
  ];
}

function footer(current) {
  const revision = isWork(current) ? '' : current.task.revision.slice(0, 10);
  return element('footer', {}, `Fetched ${time(current.loadedAt, { seconds: true })} from ${current.host}`, revision ? element('span', { className: 'session-id', title: 'Tracker revision this view was built from' }, `rev ${revision}`) : null);
}

/** Every section of the panel in reading order. */
export function sections(current) {
  return [
    ...notices(current),
    header(current),
    headCard(current),
    stepsSection(current),
    changeSection(current),
    factsSection(current),
    pullRequestsSection(current),
    accountSection(current),
    runsSection(current),
    briefSection(current),
    footer(current),
  ].filter(Boolean);
}

function render() {
  const app = document.getElementById('app');
  if (!app) return;
  if (!view) { app.replaceChildren(element('div', { className: 'loading', role: 'status' }, problem || 'Loading…')); return; }
  app.replaceChildren(...sections(view));
  for (const fill of app.querySelectorAll('.meter-fill[data-share]')) fill.style.width = `${fill.dataset.share}%`;
  const situation = ploegSituation(view);
  const headline = situation.progress ? `${situation.progress.meta.label}. ${situation.progress.headline}` : situation.headline;
  if (headline !== spoken) { spoken = headline; announce(headline); }
}

document.addEventListener('click', event => {
  const link = event.target.closest('[data-open-url]');
  if (link) { bridge.postMessage({ type: 'open-url', url: link.dataset.openUrl }); return; }
  const step = event.target.closest('[data-session-action]');
  if (step) {
    if (step.disabled) return;
    busy = `session:${step.dataset.sessionAction}`; render();
    bridge.postMessage({ type: 'session-action', action: step.dataset.sessionAction, session: step.dataset.session });
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const type = button.dataset.action;
  if (type === 'take-back' || type === 'start-session' || type === 'checkout') { busy = type; render(); }
  bridge.postMessage({ type, id: button.dataset.id, team: button.dataset.team });
});

document.addEventListener('toggle', event => {
  const key = event.target?.dataset?.keep;
  if (!key) return;
  if (event.target.open) opened.add(key); else opened.delete(key);
}, true);

document.addEventListener('change', event => {
  if (event.target.name !== 'team') return;
  team = event.target.value; remember(); render();
});

document.addEventListener('submit', event => {
  event.preventDefault();
  if (event.target.id !== 'handoff-form' || !team || busy) return;
  busy = 'handoff'; problem = ''; render();
  bridge.postMessage({ type: 'handoff', team });
});

window.addEventListener('message', event => {
  const message = event.data;
  if (!message || typeof message.type !== 'string') return;
  if (message.type === 'state') { view = message.view; connected = true; busy = ''; problem = message.problem || ''; render(); }
  else if (message.type === 'problem') { busy = ''; problem = message.message || ''; render(); }
  else if (message.type === 'idle') { busy = ''; render(); }
  else if (message.type === 'connection') { connected = Boolean(message.connected); render(); }
});

function tick() {
  const now = Date.now();
  for (const node of document.querySelectorAll('[data-since]')) {
    const since = Number(node.dataset.since);
    if (Number.isFinite(since)) node.textContent = elapsedClock((now - since) / 1000);
  }
}
setInterval(tick, 1000);

remember();
render();
bridge.postMessage({ type: 'ready' });
