import { button } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { clock, cx, escape, r, span, tokens, usd } from './parts.js';

const endingWords = Object.freeze({ live: 'Working now', machine: 'Ended by the machine', failed: 'Failed', cancelled: 'Cancelled', pending: 'Waiting for a worker', done: 'Landed' });
const seatWords = Object.freeze({ live: 'Working', machine: 'Lost to a machine', failed: 'Failed', stuck: 'Stopped answering', cancelled: 'Cancelled', pending: 'Waiting', done: 'Landed' });
const ledgerWords = Object.freeze({ proven: 'Proven', claimed: 'Claimed, not proven', running: 'Being checked now', open: 'No proof reported' });
const dockGlyphs = Object.freeze({ stop: 'alert', review: 'eye', session: 'help-circle', linked: 'link' });

/**
 * Where the Work Item came from, as a stamp: a session someone started in Unfold, a tracker task, or a Follow-Up.
 * @param {object} view A `workView` result.
 * @returns {string}
 */
export function originStamp(view) {
  const from = view.origin;
  const mark = `<span class="lv-origin-mark" aria-hidden="true">${escape(from.initials)}</span>`;
  const text = `<span class="lv-origin-text">${escape(from.label)}</span>`;
  if (from.kind === 'unfold' && from.sessionId) return `<a class="${cx('lv-origin', 'is-unfold')}" href="#session/${escape(encodeURIComponent(from.sessionId))}">${mark}${text}</a>`;
  if (from.url) return `<a class="${cx('lv-origin', `is-${from.kind}`)}" href="${escape(from.url)}" target="_blank" rel="noopener noreferrer">${mark}${text}</a>`;
  return `<span class="${cx('lv-origin', `is-${from.kind}`)}">${mark}${text}</span>`;
}

/**
 * Who is on the Work Item now: the viewer, the Role working, and linked agent sessions that have not ended.
 * @param {object} view A `workView` result.
 * @param {{ names?: boolean }} [options] `names` lists each with a line of detail instead of overlapping marks.
 * @returns {string}
 */
export function presenceStack(view, { names = false } = {}) {
  const label = view.presence.map(each => `${each.name}, ${each.detail}`).join('; ');
  const marks = view.presence.map(each => names
    ? `<li class="${cx('lv-presence-row', `is-${each.kind}`)}"><span class="lv-presence-mark" aria-hidden="true">${escape(each.initials)}</span><span class="lv-presence-text"><span class="lv-presence-name">${escape(each.name)}</span><span class="lv-presence-detail">${escape(each.detail)}</span></span></li>`
    : `<li class="${cx('lv-presence-mark', `is-${each.kind}`)}" title="${escape(`${each.name}, ${each.detail}`)}"><span aria-hidden="true">${escape(each.initials)}</span><span class="sr-only">${escape(`${each.name}, ${each.detail}`)}</span></li>`).join('');
  return `<ul class="${cx('lv-presence', names ? 'is-named' : '')}" aria-label="${escape(`Here now: ${label}`)}">${marks}</ul>`;
}

function who(entry, view) {
  const viewer = view.presence[0]?.name;
  return entry.who && entry.who === viewer ? 'You' : entry.who;
}

function entryHead(entry, title, detail = '', chip = '') {
  return `<p class="lv-tl-who"><strong>${escape(title)}</strong>${detail ? ` <span class="lv-tl-detail">${escape(detail)}</span>` : ''}${chip}<time class="lv-tl-time">${escape(clock(entry.at))}</time></p>`;
}

const chip = (text, tone = '') => `<span class="${cx('lv-tl-chip', tone ? `lv-tone-${tone}` : '')}">${escape(text)}</span>`;

function runStub(entry) {
  const cost = entry.costUsd === null ? 'cost not reported' : usd(entry.costUsd);
  const tokenText = entry.tokensIn === null ? '' : ` · ${tokens(entry.tokensIn)} in`;
  const runs = entry.count > 1 ? `Runs ${entry.firstN}–${entry.n}` : `Run ${entry.n}`;
  return `<div class="lv-tl-stub"><span class="lv-tl-stub-label">${runs}${entry.ending === 'live' ? ' · now' : ''}</span><span class="lv-tl-stub-value">${escape(span(entry.seconds) || '0 s')}</span><span class="lv-tl-stub-detail">${escape(`${cost}${tokenText}`)}</span><a class="lv-tl-stub-link" href="#run-${escape(entry.id)}" data-action="work-run" data-id="${escape(entry.id)}">${entry.ending === 'live' ? 'Follow live' : 'Open the Run'}</a></div>`;
}

function entryBody(entry, view) {
  if (entry.kind === 'brief') return `${entryHead(entry, who(entry, view), view.origin.kind === 'unfold' ? 'wrote the brief' : 'filed the task', entry.conditions ? chip(`${entry.conditions} acceptance ${entry.conditions === 1 ? 'condition' : 'conditions'}`) : '')}${entry.text ? `<p class="lv-tl-text" data-private>${escape(entry.text.split('\n').find(line => line.trim() && !line.trim().startsWith('#')) ?? '')}</p>` : '<p class="lv-tl-text lv-tl-quiet">No brief was written.</p>'}`;
  if (entry.kind === 'admit') return `${entryHead(entry, 'Ploeg', `started attempt ${entry.attempt}`)}<p class="lv-tl-text lv-tl-quiet">${escape(entry.budgetUsd === null ? 'No budget reported for this attempt.' : `${usd(entry.budgetUsd)} held for this attempt.`)}</p>`;
  if (entry.kind === 'run') {
    const tone = entry.ending === 'live' ? 'live' : entry.ending === 'failed' ? 'danger' : entry.ending === 'done' ? 'success' : '';
    const words = entry.ending === 'failed' && entry.failure ? entry.failure : entry.verdict === 'approve' ? 'Approved' : entry.verdict === 'request_changes' ? 'Asked for changes' : endingWords[entry.ending];
    const runs = entry.count > 1 ? `${entry.count} Runs in a row, Runs ${entry.firstN}–${entry.n}` : `Run ${entry.n}`;
    const machine = entry.ending === 'machine' ? `<p class="lv-tl-text lv-tl-quiet">${entry.count > 1 ? 'Machines ended these Runs, not the agent; they do not count against the agent.' : 'The machine ended this Run, not the agent; it does not count against the agent.'}</p>` : '';
    const now = entry.move ? `<p class="lv-tl-move"><span class="lv-tl-move-dot" aria-hidden="true"></span><span>${escape(entry.move.title)}</span><span class="lv-tl-detail">${escape(`${entry.move.calls} ${entry.move.calls === 1 ? 'call' : 'calls'} so far`)}</span></p>` : '';
    return `<div class="lv-tl-ticket"><div class="lv-tl-ticket-main">${entryHead(entry, entry.role, `attempt ${entry.attempt} · ${runs}`, chip(words, tone))}${machine}${now}</div>${runStub(entry)}</div>`;
  }
  if (entry.kind === 'context') return `${entryHead(entry, who(entry, view), 'added context', entry.steering ? chip('reaches the next Run', 'attention') : '')}<p class="lv-tl-files"><span class="lv-tl-file">${icon('file')}${escape(entry.name)}</span></p>${entry.note ? `<p class="lv-tl-text" data-private>${escape(entry.note)}</p>` : ''}`;
  if (entry.kind === 'ask') {
    const source = entry.fromRecord ? 'From the record · no model call' : entry.costUsd === null ? 'Model answer · cost not reported yet' : `Model answer · ${usd(entry.costUsd)} from the Ask Allowance`;
    const answer = entry.answer ? `<div class="${cx('lv-tl-answer', entry.fromRecord ? 'is-record' : 'is-model')}"><p class="lv-tl-text" data-private>${escape(entry.answer)}</p><p class="lv-tl-source">${escape(source)}</p></div>` : `<p class="lv-tl-text lv-tl-quiet">${escape(entry.status === 'answering' ? 'Answering…' : 'No answer.')}</p>`;
    return `${entryHead(entry, who(entry, view), 'asked', chip('the agents do not see this', 'review'))}<p class="lv-tl-text lv-tl-said" data-private>${escape(entry.question)}</p>${answer}`;
  }
  if (entry.kind === 'steer') {
    const receipt = entry.flying ? `<p class="lv-tl-receipt">${icon('check')}<span>${escape(`Sent to the running ${entry.flying.role} · Run ${entry.flying.n}; it arrives where its Harness takes messages, otherwise in the next Run`)}</span></p>` : entry.readBy ? `<p class="lv-tl-receipt">${icon('check')}<span>${escape(`Next Run after it: ${entry.readBy.role} · Run ${entry.readBy.n} at ${clock(entry.readBy.at)}`)}</span></p>` : '<p class="lv-tl-receipt is-waiting">No Run has started since; the next one reads it.</p>';
    return `${entryHead(entry, who(entry, view), 'steered', chip('the agents read this', 'live'))}<p class="lv-tl-text lv-tl-said" data-private>${escape(entry.text)}</p>${receipt}`;
  }
  if (entry.kind === 'linked') return `${entryHead(entry, `${entry.harness} · ${entry.who}`, 'linked session', chip(entry.state || 'linked'))}<p class="lv-tl-text lv-tl-quiet">${escape(`${entry.commits} ${entry.commits === 1 ? 'commit' : 'commits'}${entry.branch ? ` on ${entry.branch}` : ''}. Unfold records it; it never starts or pays for it.`)}</p>`;
  return '';
}

const markWords = { brief: 'B', admit: 'P', context: '+', ask: '?', steer: '›', linked: '⇄' };

function mark(entry, view) {
  if (entry.kind === 'run') return escape(entry.role.slice(0, 1).toUpperCase());
  if (['brief', 'context', 'ask', 'steer'].includes(entry.kind) && who(entry, view) === 'You') return escape(view.presence[0]?.initials ?? 'Y');
  return escape(markWords[entry.kind] ?? '·');
}

function tapeCell(entry) {
  if (entry.kind === 'run' && entry.costUsd) return `<span class="${cx('lv-tl-tape', entry.ending === 'live' ? 'is-live' : entry.ending === 'machine' ? 'is-lost' : 'is-run')}" title="${escape(usd(entry.costUsd))}"></span>`;
  if (entry.kind === 'ask' && entry.costUsd) return `<span class="lv-tl-tape is-ask" title="${escape(usd(entry.costUsd))}"></span>`;
  return '<span class="lv-tl-tape"></span>';
}

/**
 * The timeline of a Work Item: the brief, each attempt and Run, context, Asks, steering and linked sessions in time
 * order, with long quiet stretches folded into a line that opens. `chat` draws people's messages as bubbles and Runs
 * as tickets, `log` a vertical spine with clock times and the spend tape beside it, `compact` one line per entry.
 * @param {object} view A `workView` result.
 * @param {{ layout?: 'chat'|'log'|'compact', id?: string }} [options]
 * @returns {string}
 */
export function timeline(view, { layout = 'chat', id = `lv-tl-${view.id}` } = {}) {
  const rows = view.entries.map(entry => {
    if (entry.kind === 'fold') return `<li class="${cx('lv-tl-entry', 'is-fold')}"><details class="lv-tl-fold"><summary class="lv-tl-fold-sum"><span class="lv-tl-zigzag" aria-hidden="true"></span><span><strong>${escape(span(entry.seconds))} folded</strong> · ${escape(entry.reason)}</span></summary><p class="lv-tl-text lv-tl-quiet">${escape(`${clock(entry.at)} to ${clock(entry.at + entry.seconds * 1000)}. Nothing was needed from anyone.`)}</p></details></li>`;
    const mine = ['brief', 'context', 'ask', 'steer'].includes(entry.kind) && who(entry, view) === 'You';
    const ending = entry.kind === 'run' ? `is-${entry.ending}` : '';
    const time = layout === 'log' ? `<span class="lv-tl-clock">${escape(clock(entry.at))}${entry.kind === 'run' && entry.end ? `<br>${escape(clock(entry.end))}` : ''}</span>` : '';
    return `<li class="${cx('lv-tl-entry', `is-${entry.kind}`, ending, mine ? 'is-mine' : '')}">${time}<span class="lv-tl-mark" aria-hidden="true">${mark(entry, view)}</span>${layout === 'log' ? tapeCell(entry) : ''}<div class="lv-tl-body">${entryBody(entry, view)}</div></li>`;
  }).join('');
  const now = view.live.running || view.decisions.length ? `<li class="${cx('lv-tl-entry', 'is-now', view.decisions.length ? 'lv-tone-attention' : 'lv-tone-live')}">${layout === 'log' ? `<span class="lv-tl-clock">${escape(clock(view.live.now))}</span>` : ''}<span class="lv-tl-mark" aria-hidden="true"></span>${layout === 'log' ? '<span class="lv-tl-tape"></span>' : ''}<div class="lv-tl-body"><p class="lv-tl-who"><strong>Now</strong> <span class="lv-tl-detail">${escape(view.sentence.head)}</span></p></div></li>` : '';
  return `<ol class="${cx('lv-tl', `lv-tl-${layout}`)}" id="${escape(id)}" aria-label="What happened, oldest first">${rows}${now}</ol>`;
}

/**
 * The intent bar: one place to talk to the work, with three modes chosen by radio buttons that work without script.
 * Steer reaches the agents (only for a Work Item started in Unfold, through its session), Ask never does and is
 * answered from the record when it can be, Add context attaches a file the next Run reads. Each mode says who reads
 * the message and what it costs before it is sent.
 * @param {object} view A `workView` result.
 * @param {{ id?: string, mode?: 'steer'|'ask'|'context' }} [options]
 * @returns {string}
 */
export function intentBar(view, { id = `lv-intent-${view.id}`, mode } = {}) {
  const chosen = mode ?? (view.canSteer ? 'steer' : 'ask');
  const allowance = view.allowance ? `${usd(Math.max(0, view.allowance.remainingUsd))} of ${usd(view.allowance.limitUsd)} Ask Allowance left` : 'Paid from your Team’s Ask Allowance when the record cannot answer it';
  const radio = (value, label) => `<label class="lv-intent-mode"><input class="${cx('lv-intent-radio', `is-${value}`)}" type="radio" name="${escape(id)}-mode" value="${value}"${chosen === value ? ' checked' : ''}><span>${escape(label)}</span></label>`;
  const steer = view.canSteer
    ? `<form class="${cx('lv-intent-form', 'is-steer')}" data-form="work-steer" data-id="${escape(view.id)}" data-session="${escape(view.session.id)}" novalidate><p class="lv-intent-reach lv-tone-live">${icon('eye')}<span>The agents read this</span></p><label class="lv-intent-hint" for="${escape(`${id}-steer-text`)}">Reaches the running Run where its Harness allows it, otherwise the next Run.</label><textarea class="lv-intent-text" id="${escape(`${id}-steer-text`)}" name="text" rows="2" maxlength="16000" required placeholder="Tell the agents what to change"></textarea><div class="lv-intent-foot"><span class="lv-intent-cost">No charge of its own; the Run spends from the Shift Budget.</span>${button({ label: 'Steer', variant: 'primary', size: 'sm', type: 'submit' })}</div></form>`
    : `<div class="${cx('lv-intent-form', 'is-steer', 'is-off')}"><p class="lv-intent-reach">${icon('info')}<span>Steering is not open here</span></p><p class="lv-intent-hint">${escape(view.steerReason)}</p></div>`;
  const ask = view.canAsk
    ? `<form class="${cx('lv-intent-form', 'is-ask')}" data-form="work-ask" data-id="${escape(view.id)}" novalidate><p class="lv-intent-reach lv-tone-review">${icon('eye-off')}<span>The agents do not see this</span></p><label class="lv-intent-hint" for="${escape(`${id}-ask-text`)}">Answered from the record when it can be. It never changes the work.</label><textarea class="lv-intent-text" id="${escape(`${id}-ask-text`)}" name="question" rows="2" maxlength="2000" required placeholder="Why did it stop? What has it cost?"></textarea><p class="field-error" data-error-for="question" hidden></p><div class="lv-intent-foot"><span class="lv-intent-cost">${escape(allowance)}</span>${button({ label: 'Ask', variant: 'primary', size: 'sm', type: 'submit' })}</div></form>`
    : `<div class="${cx('lv-intent-form', 'is-ask', 'is-off')}"><p class="lv-intent-reach">${icon('info')}<span>Asks are not open here</span></p><p class="lv-intent-hint">Unfold could not load the Asks for this Work Item.</p></div>`;
  const contextOff = view.canAddContext === false;
  const contextHint = view.closed ? 'This Work Item is closed, so it takes no more context.' : contextOff ? 'Your role reads this Work Item; a developer adds context.' : 'A file or an archive with a note. Ploeg keeps it with the Work Item and the agents read it as evidence, not as instructions.';
  const context = `<div class="${cx('lv-intent-form', 'is-context', contextOff ? 'is-off' : '')}"><p class="lv-intent-reach lv-tone-attention">${icon('folder')}<span>Every Role reads this from its next Run</span></p><p class="lv-intent-hint">${escape(contextHint)}</p><div class="lv-intent-foot"><span class="lv-intent-cost">At most 20 MiB</span>${button({ label: 'Choose a file', icon: 'plus', size: 'sm', action: 'work-context-add', disabled: contextOff })}</div></div>`;
  return `<section class="lv-intent" aria-labelledby="${escape(id)}-title"><h2 class="sr-only" id="${escape(id)}-title">Talk to this work</h2><fieldset class="lv-intent-modes"><legend class="sr-only">What your message does</legend>${radio('steer', 'Steer')}${radio('ask', 'Ask')}${radio('context', 'Add context')}</fieldset>${steer}${ask}${context}</section>`;
}

function decisionActions(decision, extras) {
  if (decision.kind === 'review') return `${decision.pullRequest?.url ? button({ label: 'Open the pull request', variant: 'secondary', size: 'sm', href: decision.pullRequest.url, external: true }) : ''}${extras.primary ?? ''}`;
  if (decision.kind === 'stop') return extras.primary ?? '';
  if (decision.kind === 'session') return button({ label: 'Answer in the session', variant: 'primary', size: 'sm', href: `#session/${encodeURIComponent(decision.sessionId)}` });
  if (decision.kind === 'linked') return button({ label: 'Open the linked session', size: 'sm', href: `#linked-session/${encodeURIComponent(decision.sessionId)}` });
  return '';
}

/**
 * The decision dock: everything on this Work Item that waits on a person, oldest first, the first one open with its
 * actions. Empty when nothing waits.
 * @param {object} view A `workView` result.
 * @param {{ primary?: string, quiet?: boolean }} [extras] `primary` is the app's own next-step button for a stop or a
 *   review; `quiet` renders a calm line when nothing waits instead of nothing.
 * @returns {string}
 */
export function decisionDock(view, extras = {}) {
  const list = view.decisions;
  if (!list.length) return extras.quiet ? `<section class="${cx('lv-dock', 'is-empty')}" aria-label="Waiting on you"><p class="lv-dock-empty">${icon('check-circle')}<span>Nothing waits on you. ${escape(view.sentence.sub)}</span></p></section>` : '';
  const [first, ...rest] = list;
  const actions = decisionActions(first, extras);
  const more = rest.length ? `<ol class="lv-dock-more" aria-label="Also waiting">${rest.map(each => `<li class="${cx('lv-dock-row', `is-${each.kind}`)}">${icon(dockGlyphs[each.kind] ?? 'circle')}<span>${escape(each.title)}</span></li>`).join('')}</ol>` : '';
  return `<section class="${cx('lv-dock', `is-${first.kind}`, `lv-tone-${first.tone}`)}" aria-labelledby="lv-dock-${escape(view.id)}"><p class="lv-dock-count">${icon(dockGlyphs[first.kind] ?? 'circle')}<span>Waiting on you · 1 of ${list.length}</span></p><h2 class="lv-dock-title" id="lv-dock-${escape(view.id)}">${escape(first.title)}</h2><p class="lv-dock-detail">${escape(first.detail)}</p>${actions ? `<div class="lv-dock-actions">${actions}</div>` : ''}${more}</section>`;
}

/**
 * The Roles: one seat per Role that ran, with its Runs, time, spend and how its last Run ended, the working seat
 * marked live.
 * @param {object} view A `workView` result.
 * @returns {string}
 */
export function roleRoster(view) {
  if (!view.roles.length) return '<p class="lv-role-empty">No Role has run yet.</p>';
  const seats = view.roles.map(seat => {
    const figures = [`${seat.runs} ${seat.runs === 1 ? 'Run' : 'Runs'}`, span(seat.seconds), seat.costUsd === null ? '' : usd(seat.costUsd), seat.lost ? `${seat.lost} lost to machines` : ''].filter(Boolean).join(' · ');
    return `<li class="${cx('lv-role-seat', `is-${seat.status}`, seat.writes ? 'is-writer' : 'is-reader')}"><span class="lv-role-mark" aria-hidden="true">${escape(seat.initials)}</span><span class="lv-role-text"><span class="lv-role-role">${escape(seat.role)} <span class="lv-role-kind">${seat.writes ? 'writes' : 'reads only'}</span></span><span class="lv-role-figures">${escape(figures)}</span></span><span class="lv-role-state">${escape(seatWords[seat.status] ?? seat.status)}</span></li>`;
  }).join('');
  return `<ol class="lv-roles" aria-label="Roles">${seats}</ol>`;
}

/**
 * The lease baton: who may write the branch and for how long, as a ring that empties as the lease runs out.
 * @param {object} view A `workView` result.
 * @returns {string}
 */
export function leaseBaton(view) {
  const lease = view.lease;
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const share = lease.share ?? (lease.state === 'held' ? 1 : 0);
  const ring = `<svg class="lv-lease-ring" viewBox="0 0 40 40" aria-hidden="true"><circle class="lv-lease-track" cx="20" cy="20" r="${radius}"></circle>${lease.state === 'held' ? `<circle class="lv-lease-left" cx="20" cy="20" r="${radius}" stroke-dasharray="${r(circumference * share)} ${r(circumference)}" transform="rotate(-90 20 20)"></circle>` : ''}</svg>`;
  const branch = lease.branch ? `<code class="lv-lease-branch">${escape(lease.branch)}</code>` : '';
  const words = lease.state === 'held'
    ? [`${lease.holder ?? 'An agent'} holds the branch`, lease.secondsLeft !== null ? `${span(lease.secondsLeft)} left · renews while it works` : 'renews while it works']
    : lease.state === 'expired' ? ['The lease ran out', 'Ploeg takes it back and starts over on a new worker']
      : lease.state === 'lost' ? ['A lease was lost', 'A machine died while it held the branch; that counts against the machine']
        : ['Nobody holds the branch', 'No Run writes now'];
  return `<div class="${cx('lv-lease', `is-${lease.state}`)}">${ring}<p class="lv-lease-text"><strong>${escape(words[0])}</strong>${branch}<span class="lv-lease-detail">${escape(words[1])}</span></p>${lease.branch ? button({ label: 'Check out', size: 'sm', action: 'work-checkout' }) : ''}</div>`;
}

/**
 * The spend tape: every reported cost in the order it was spent, the money held for a running Run hatched, money lost
 * to machines in grey, Asks in the brand red, against the attempt's hold.
 * @param {object} view A `workView` result.
 * @returns {string}
 */
export function spendTape(view) {
  const tape = view.tape;
  if (!tape.segments.length) return `<div class="lv-tape is-empty"><p class="lv-tape-empty">No Run has reported a cost yet${tape.budgetUsd !== null ? `; ${escape(usd(tape.budgetUsd))} is held` : ''}.</p></div>`;
  let x = 0;
  const bars = tape.segments.map(segment => {
    const width = Math.max(0.6, segment.usd / tape.scaleUsd * 100);
    const bar = `<rect class="${cx('lv-tape-bar', `is-${segment.kind}`)}" x="${r(x)}" y="0" width="${r(width)}" height="10"><title>${escape(`${segment.label}: ${usd(segment.usd)}`)}</title></rect>`;
    x += width;
    return bar;
  }).join('');
  const label = `Spend tape: ${tape.segments.map(segment => `${segment.label} ${usd(segment.usd)}`).join(', ')}${tape.budgetUsd !== null ? `, of ${usd(tape.budgetUsd)} held` : ''}.`;
  const keys = tape.segments.map(segment => `<li class="${cx('lv-tape-key', `is-${segment.kind}`)}">${escape(segment.label)} · ${escape(usd(segment.usd))}</li>`).join('');
  return `<figure class="lv-tape"><figcaption class="lv-tape-head"><span class="lv-tape-total">${escape(usd(tape.totalUsd))}</span><span class="lv-tape-of">${escape(tape.budgetUsd !== null ? `of ${usd(tape.budgetUsd)} held` : 'no hold reported')}</span></figcaption><svg class="lv-tape-svg" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="${escape(label)}"><rect class="lv-tape-track" x="0" y="0" width="100" height="10"></rect>${bars}</svg><ul class="lv-tape-keys">${keys}</ul></figure>`;
}

/**
 * The acceptance ledger: each acceptance condition from the brief with the proof attached to it. Ploeg does not
 * report proof yet, so without it every condition says so instead of guessing.
 * @param {object} view A `workView` result.
 * @returns {string}
 */
export function acceptanceLedger(view) {
  const conditions = view.brief.conditions;
  if (!conditions.length) return '<p class="lv-ledger-empty">The brief lists no acceptance conditions. Add a heading such as “Acceptance” with a list under it.</p>';
  const proven = conditions.filter(each => each.state === 'proven').length;
  const rows = conditions.map(each => `<li class="${cx('lv-ledger-row', `is-${each.state}`)}"><span class="lv-ledger-mark" aria-hidden="true">${each.state === 'proven' ? icon('check') : each.state === 'claimed' ? '?' : ''}</span><span class="lv-ledger-body"><span class="lv-ledger-text" data-private>${escape(each.text)}</span><span class="lv-ledger-state">${escape(ledgerWords[each.state])}${each.note ? ` · ${escape(each.note)}` : ''}</span>${each.proofs.length ? `<span class="lv-ledger-proofs">${each.proofs.map(proof => `<span class="lv-ledger-proof">${escape(proof)}</span>`).join('')}</span>` : ''}</span></li>`).join('');
  const head = view.brief.proofsReported ? `${proven} of ${conditions.length} proven` : `${conditions.length} ${conditions.length === 1 ? 'condition' : 'conditions'} · proof not reported yet`;
  return `<section class="lv-ledger" aria-label="Acceptance conditions"><p class="lv-ledger-head">${escape(head)}</p><ol class="lv-ledger-rows">${rows}</ol></section>`;
}
