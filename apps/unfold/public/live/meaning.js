import { escape } from './parts.js';

const entry = (id, component, classes, looksLike, means, source, status) => Object.freeze({ id, component, classes: Object.freeze(classes), looksLike, means, source, status });

/**
 * The meaning ledger: every class a live component draws, what it looks like, what it means, where its data comes
 * from and whether that data is `real` (Ploeg or Unfold reports it today), `derived` (Unfold computes it from real
 * data) or `proposed` (Ploeg does not report it yet). A class ending in `*` stands for the family that shares its
 * prefix. One token can appear in several entries of a component when it marks several elements.
 * @type {ReadonlyArray<{ id: string, component: 'flight'|'folds'|'dial'|'trace'|'instruments'|'answers'|'containment', classes: ReadonlyArray<string>, looksLike: string, means: string, source: string, status: 'real'|'derived'|'proposed' }>}
 */
export const meaningLedger = Object.freeze([
  entry('flight-track', 'flight', ['lv-fp', 'lv-fp-track', 'lv-fp-leg'], 'A row of columns over one shared runway', 'The whole journey of the Work Item, one column per leg, oldest on the left.', 'Ploeg Work Item detail: item, shifts and runs', 'real'),
  entry('flight-width', 'flight', ['lv-g*'], 'Columns of different widths', 'A column grows with the square root of the time its leg took, so a long wait does not crowd out the work.', 'Ploeg Run.startedAt and Run.finishedAt, square-rooted by flight-path.js', 'derived'),
  entry('flight-head', 'flight', ['lv-fp-head', 'lv-fp-name', 'lv-fp-note', 'lv-fp-time'], 'A name, a clock span and a short note above a column', 'What the leg is, when it ran and how many Runs it held or lost.', 'Ploeg Shift.openedAt, Run.startedAt, Run.finishedAt and Run.failureReason', 'real'),
  entry('flight-gate', 'flight', ['lv-fp-gate', 'lv-fp-gate-mark', 'is-apron'], 'A gate post on a pale apron at the start', 'Where the work was asked for, dated by the tracker task.', 'Tracker task created date, or Ploeg WorkItem.createdAt when the tracker gives none', 'real'),
  entry('flight-wait', 'flight', ['lv-fp-wait', 'is-taxiway', 'lv-fp-break'], 'A taxiway with a ≈ break', 'The time between the ask and the first Run; the break says the time is compressed.', 'Tracker task created date and the first Ploeg Run.startedAt', 'derived'),
  entry('flight-parked', 'flight', ['is-parked'], 'The plane parked at the gate or at a station', 'Nobody is working on it: queued at the gate, waiting for your review, or merged.', 'Ploeg WorkItem.state queued, ingested, leased, awaiting_review or done', 'real'),
  entry('flight-plane', 'flight', ['lv-fp-plane', 'lv-fp-plane-svg', 'lv-plane-ink', 'lv-plane-fold'], 'The brand plane', 'Where the Work Item is right now.', 'Ploeg Run.state running, or WorkItem.state when no Run runs', 'real'),
  entry('flight-attempt', 'flight', ['lv-fp-attempt', 'lv-fp-hops'], 'A column holding one or more hops', 'One attempt: a Shift with its budget and its Runs.', 'Ploeg Shift and the Runs whose shiftId points at it', 'real'),
  entry('flight-attempt-tone', 'flight', ['is-live', 'is-machine', 'is-failed', 'is-done'], 'The tint of an attempt column', 'Whether the attempt is still flying, was lost entirely to machines, had an agent failure, or finished.', 'Ploeg Run.state and Run.failureReason of the attempt’s Runs', 'derived'),
  entry('flight-hop', 'flight', ['lv-fp-hop', 'lv-fp-sky', 'lv-fp-sky-svg', 'lv-fp-runway'], 'A hop: a climb, a cruise and an end, over a stretch of runway', 'One Run of one Role.', 'Ploeg Run', 'real'),
  entry('flight-altitude', 'flight', ['lv-fp-line', 'lv-fp-area', 'lv-fp-grad', 'lv-fp-grad-end'], 'The height of the hop’s line and the shading under it', 'How busy the followed Run was: calls per minute over 14 slices of its time. Without a transcript the hop cruises flat.', 'Folded transcript tool_call timestamps of the followed Run', 'derived'),
  entry('flight-trouble', 'flight', ['lv-fp-trouble'], 'A jagged zigzag over part of a hop', 'In that slice of time a call failed or the agent had to interrupt or kill something.', 'Folded transcript tool_call status failed, or a call whose title or input interrupts (Ctrl-C, kill, hung)', 'derived'),
  entry('flight-role', 'flight', ['is-writer', 'is-reader'], 'A writer or a reader hop', 'Whether the Role may change the repository (a builder) or only reads it (a reviewer).', 'Ploeg Run.writes', 'real'),
  entry('flight-machine', 'flight', ['is-machine'], 'A neutral bolt where the hop drops to the ground', 'The machine ended the Run, not the agent; it does not count against the agent.', 'Ploeg Run.failureReason infra_node, infra_llm or lease_lost', 'real'),
  entry('flight-stuck', 'flight', ['is-stuck'], 'A pause mark where the hop drops', 'The Run stopped answering.', 'Ploeg Run.outcome stuck', 'real'),
  entry('flight-failed', 'flight', ['is-failed'], 'A red cross where the hop drops', 'The agent failed the Run.', 'Ploeg Run.outcome failed with Run.failureReason agent_error, or no reason', 'real'),
  entry('flight-budget', 'flight', ['is-budget'], 'Red coins where the hop drops', 'The Run reached its token ceiling.', 'Ploeg Run.failureReason budget', 'real'),
  entry('flight-timeout', 'flight', ['is-timeout'], 'A red clock where the hop drops', 'The Run hit its time limit or went silent for its idle timeout.', 'Ploeg Run.failureReason timeout or idle', 'real'),
  entry('flight-cancelled', 'flight', ['is-cancelled', 'is-neutral'], 'A grey slashed circle where the hop drops', 'Someone cancelled the Run.', 'Ploeg Run.outcome cancelled', 'real'),
  entry('flight-pr', 'flight', ['is-pr'], 'A pull request glyph at the end of a hop in the air', 'The Run opened or updated the pull request.', 'Ploeg Run.outcome pr_opened or pr_updated', 'real'),
  entry('flight-approve', 'flight', ['is-approve', 'is-success'], 'A green check at the end of a reader hop', 'The reviewer approved.', 'Ploeg Run.verdict approve on a Run with writes false', 'real'),
  entry('flight-changes', 'flight', ['is-changes', 'is-attention'], 'A refresh glyph at the end of a reader hop', 'The reviewer asked for changes.', 'Ploeg Run.verdict request_changes on a Run with writes false', 'real'),
  entry('flight-done', 'flight', ['is-done'], 'A check at the end of a hop in the air', 'The Run finished without failing.', 'Ploeg Run.state finished with no failureReason', 'real'),
  entry('flight-pending', 'flight', ['is-pending', 'is-taxi', 'is-neutral'], 'The plane taxiing on the runway', 'The Run waits for a worker.', 'Ploeg Run.state pending', 'real'),
  entry('flight-live', 'flight', ['is-live'], 'The plane at the head of a hop', 'This Run is working now.', 'Ploeg Run.state running', 'real'),
  entry('flight-holding', 'flight', ['is-holding', 'is-stuck', 'lv-fp-hold', 'lv-fp-hold-svg'], 'The plane circling in a holding pattern', 'The Run is leased but has made no call for a while, or its lease ran out.', 'Health word stalled: no folded transcript tool_call for healthRules.stalledAfter, or Ploeg WorkItem.lease.expiresAt passed', 'derived'),
  entry('flight-end', 'flight', ['lv-fp-end', 'is-ground', 'is-air'], 'The glyph where a hop ends, on the ground or in the air', 'On the ground the Run ended without a result and the next one starts over; in the air the work carried on.', 'Ploeg Run.outcome and Run.failureReason', 'derived'),
  entry('flight-chip', 'flight', ['lv-fp-chip', 'is-chip'], 'A small glyph under the hop', 'The same ending as the hop, readable when the flight stands up as a vertical log.', 'Ploeg Run.outcome and Run.failureReason', 'real'),
  entry('flight-count', 'flight', ['lv-fp-count'], 'A “3×” badge on a hop of short bounces', 'Several Runs in a row ended the same way and are drawn as one hop.', 'Consecutive Ploeg Runs with the same ending', 'derived'),
  entry('flight-stop', 'flight', ['lv-fp-stop', 'lv-fp-flag', 'is-closed'], 'A flag over a closed runway', 'Ploeg stopped: it needs you, it stopped retrying, or someone withdrew it.', 'Ploeg WorkItem.state needs_human, stale or withdrawn', 'real'),
  entry('flight-approach', 'flight', ['lv-fp-approach', 'lv-fp-descent', 'is-forecast', 'is-taxi', 'is-landed'], 'A descent towards the stations', 'Forecast while a Run flies, taxi between Runs, landed once a pull request exists. The note shows an estimate only when one was passed in.', 'Ploeg WorkItem.state and Run.state; the estimate comes from the caller and is never invented', 'derived'),
  entry('flight-station', 'flight', ['lv-fp-station', 'is-done', 'is-current', 'is-next', 'is-unknown', 'is-blocked'], 'Stations after the runway: pull request, you, merge, production', 'Which steps after the work are done, current, ahead, blocked by a stop, or not tracked.', 'Ploeg WorkItem.state and WorkItem.pullRequest, mapped by model.js stages', 'derived'),
  entry('flight-you', 'flight', ['is-you'], 'The station in the brand red', 'The step that waits for a person: your review.', 'The review stage of model.js stages', 'derived'),
  entry('flight-judge', 'flight', ['lv-fp-call', 'is-on_course', 'is-drifting', 'is-off_course', 'is-abort'], 'A judge’s mark on a hop', 'A judge read the Run and said it is on course, drifting, off course, or must abort.', 'Proposed: Ploeg would have to emit an event run.judgement { runId, verdict, reason, judge }', 'proposed'),
  entry('flight-diverted', 'flight', ['is-diverted'], 'A hop that turns away early', 'A judge diverted the Run.', 'Proposed: Ploeg would have to emit an event run.judgement { runId, verdict, reason, judge } with verdict abort and act on it', 'proposed'),
  entry('flight-hit', 'flight', ['lv-fp-hit'], 'The whole hop, clickable', 'Opens that Run on the Work Item page; a burst opens its latest Run.', 'Ploeg Run id', 'real'),
  entry('flight-wire', 'flight', ['lv-fp-wire', 'is-high', 'is-medium'], 'A tripwire mark on a hop', 'A call crossed a tripwire: high for secrets, sandbox escapes, remote code or spreading injected text, medium for the rest.', 'guard.js guardSignals over the folded transcript', 'derived'),
  entry('flight-mark-column', 'flight', ['lv-fp-at-*'], 'Where on a hop a mark stands', 'Which of 14 slices of the Run’s time the call or verdict fell in.', 'The at time of the transcript call or judgement event', 'derived'),
  entry('flight-wire-parts', 'flight', ['lv-fp-wire-line', 'lv-fp-wire-n', 'lv-fp-wire-chip'], 'A line up to a tripwire mark, its count, and the count on a phone', 'Several tripwire hits in one slice are one mark with a count; on a phone the hop’s chip carries the total.', 'guard.js tripwires over the folded transcript', 'derived'),
  entry('flight-judge-parts', 'flight', ['lv-fp-call-line', 'lv-fp-call-word', 'lv-fp-call-end', 'lv-fp-call-quiet', 'lv-fp-call-chip', 'lv-fp-line-diverted'], 'A dashed line down from a judge’s mark, its word, and the red dashed path after an off-course or abort verdict', 'Where the judge spoke, the worst thing it said, and the part of the Run flown after it said the Run was off course.', 'Proposed: Ploeg would have to emit a run.judgement event { runId, verdict, reason, judge }', 'proposed'),
  entry('flight-suspect', 'flight', ['is-suspect'], 'A plane marked suspect', 'Something about the Run needs a look: a high tripwire fired or its rules changed.', 'Health word suspect: any high guard.js tripwire, or a policy drift snapshot', 'derived'),

  entry('folds-strip', 'folds', ['lv-folds', 'lv-folds-full', 'lv-folds-mini', 'lv-fold'], 'A strip of paper folds, full width or at row height', 'Every stage the Work Item moves through, in order.', 'model.js stages, placed by Ploeg WorkItem.state and WorkItem.pullRequest', 'derived'),
  entry('folds-status', 'folds', ['is-done', 'is-current', 'is-next', 'is-unknown'], 'Paper, an open wide fold, or a dark fold', 'The stage is done, happening now, still ahead, or not tracked (production).', 'Ploeg WorkItem.state and WorkItem.pullRequest', 'derived'),
  entry('folds-you', 'folds', ['is-you'], 'The red fold', 'Your review: the step that needs a person.', 'The review stage of model.js stages', 'derived'),
  entry('folds-side', 'folds', ['is-up', 'is-down'], 'A fold that points down or up', 'Down: a person acts at this stage (the ask, your review, the merge). Up: Ploeg, an agent or the delivery pipeline acts (the wait, the build, the pull request, production).', 'stageActors in fold-strip.js, fixed per stage', 'derived'),
  entry('folds-parts', 'folds', ['lv-fold-icon', 'lv-fold-text', 'lv-fold-name', 'lv-fold-note'], 'A glyph, a name and a note in a fold', 'The stage, a check once it is done, and its figure: how long ago, how long it waited, which attempt, Runs lost, or the pull request number.', 'Tracker task created date, Ploeg Run.startedAt, Run.failureReason and WorkItem.pullRequest.number', 'real'),

  entry('dial-frame', 'dial', ['lv-dial', 'lv-dial-svg'], 'A round dial', 'The Shift at a glance.', 'Ploeg Work Item detail', 'real'),
  entry('dial-tracks', 'dial', ['lv-dial-track', 'lv-dial-track-inner'], 'An outer and an inner grey ring', 'Outer: the time from the first attempt to now. Inner: what Ploeg holds for this attempt.', 'Ploeg Shift.openedAt and Shift.budgetUsd or Run.authorizedUsd', 'real'),
  entry('dial-runs', 'dial', ['lv-dial-run', 'is-live', 'is-stuck', 'is-machine', 'is-failed', 'is-done'], 'Coloured arcs on the outer ring', 'One arc per Run, as long as it ran, coloured by how it ended.', 'Ploeg Run.startedAt, Run.finishedAt, Run.outcome and Run.failureReason', 'real'),
  entry('dial-spend', 'dial', ['lv-dial-spend', 'is-high', 'is-over'], 'An arc on the inner ring, amber from 80%, red past the hold', 'How much of this attempt’s hold is spent.', 'Ploeg Run.usage.costUsd summed for the attempt against Shift.budgetUsd', 'derived'),
  entry('dial-plane', 'dial', ['lv-plane', 'lv-plane-ink', 'lv-plane-fold', 'lv-plane-ring'], 'The plane in a ring at the top of the dial', 'A Run is working now.', 'Ploeg Run.state running', 'real'),
  entry('dial-centre', 'dial', ['lv-dial-role', 'lv-dial-value', 'lv-dial-health'], 'The Role, a time and a health word in the centre', 'Who works, for how long, and how it reads: steady, struggling, stalled, suspect or idle.', 'Ploeg Run.role and Run.startedAt; the health word from the folded transcript, lease and guard.js', 'derived'),
  entry('dial-legend', 'dial', ['lv-dial-legend', 'lv-key', 'is-machine', 'is-failed', 'is-live', 'is-spend'], 'Coloured keys under the dial', 'Names each colour and states the spend against the hold, or that no cost was reported.', 'Ploeg Run.usage.costUsd and Shift.budgetUsd', 'real'),

  entry('trace-frame', 'trace', ['lv-trace-scroll', 'lv-trace', 'lv-lane', 'lv-label', 'lv-label-mono', 'lv-label-strong', 'lv-label-live', 'lv-empty'], 'Lanes with labels on one time axis', 'Every attempt and the followed Run, on the clock.', 'Ploeg Shift.openedAt, Run.startedAt and Run.finishedAt', 'real'),
  entry('trace-runs', 'trace', ['lv-bar', 'is-live', 'is-stuck', 'is-machine', 'is-failed', 'is-done'], 'A bar per Run in its attempt’s lane', 'When each Run ran and how it ended.', 'Ploeg Run.startedAt, Run.finishedAt, Run.outcome and Run.failureReason', 'real'),
  entry('trace-moves', 'trace', ['lv-bar', 'is-live', 'is-trouble', 'is-done'], 'A bar per move in the Moves lane', 'A stretch of related calls; amber when one of its calls failed or interrupted something.', 'Folded transcript stage entries, or pauses over healthRules.moveGap between tool_calls', 'derived'),
  entry('trace-ticks', 'trace', ['lv-tick', 'is-execute', 'is-read', 'is-edit', 'is-other'], 'A tick per call, coloured by kind', 'A shell command, a read or search, an edit, or anything else.', 'Folded transcript tool_call toolKind', 'real'),
  entry('trace-failed', 'trace', ['is-failed'], 'A red tick or call', 'The call failed.', 'Folded transcript tool_call status failed', 'real'),
  entry('trace-trouble', 'trace', ['is-trouble'], 'An amber tick or call', 'The call interrupted or killed something.', 'Folded transcript tool_call title or input matching an interrupt (Ctrl-C, kill, hung)', 'derived'),
  entry('trace-selected', 'trace', ['is-selected'], 'A ringed tick or highlighted call', 'The call you picked.', 'The call selected in Unfold', 'real'),
  entry('trace-move-list', 'trace', ['lv-moves', 'lv-moves-hidden', 'lv-move', 'lv-move-head', 'lv-move-time', 'lv-move-title', 'lv-move-meta', 'lv-calls'], 'Disclosures with a time, a title and a count', 'The newest moves of the followed Run, open when live or in trouble.', 'Folded transcript stage, thought and tool_call entries', 'derived'),
  entry('trace-move-state', 'trace', ['is-live', 'is-trouble'], 'A live or amber move', 'The move is happening now, or one of its calls failed or interrupted something.', 'Folded transcript tool_call status and input', 'derived'),
  entry('trace-call', 'trace', ['lv-call', 'lv-call-time', 'lv-call-body', 'lv-call-title', 'lv-call-kind', 'lv-call-input', 'lv-call-thought', 'lv-call-state'], 'A call row with its time, title, kind, command and thought', 'One tool call as the agent made it.', 'Folded transcript tool_call and the thought before it', 'real'),

  entry('instruments-tiles', 'instruments', ['lv-instruments', 'lv-instruments-tiles', 'lv-instruments-strip', 'lv-instruments-list', 'lv-tile', 'lv-tile-label', 'lv-tile-value', 'lv-tile-detail'], 'Tiles with a label, a value and a detail', 'Spend, time in the air, tokens, and files changed or Runs lost. A figure Ploeg did not report says Not reported, never zero.', 'Ploeg Run.usage (costUsd, inputTokens, outputTokens), Run.startedAt, Run.finishedAt, Run.failureReason and folded transcript edits', 'real'),
  entry('instruments-gauge', 'instruments', ['lv-gauge', 'lv-gauge-track', 'lv-gauge-fill', 'is-high', 'is-over'], 'A thin bar under the spend, amber from 80%, red past the hold', 'How much of this attempt’s hold is spent.', 'Ploeg Run.usage.costUsd summed for the attempt against Shift.budgetUsd', 'derived'),

  entry('answers-list', 'answers', ['lv-answers', 'lv-answers-list', 'lv-answers-chips', 'lv-overline', 'lv-answers-items', 'lv-answer', 'lv-answer-q', 'lv-answer-a'], 'Questions that open to an answer', 'What people ask about a live Work Item, answered from the record for free.', 'Ploeg Work Item detail and the folded transcript', 'real'),
  entry('answers-source', 'answers', ['lv-answer-source', 'is-record', 'is-estimate', 'is-none'], 'A small line under each answer', 'Where the answer comes from: the record, an estimate the caller passed, or no estimate.', 'Ploeg Work Item detail; the estimate only when the caller passes one', 'real'),
  entry('answers-ask', 'answers', ['lv-ask', 'lv-ask-label', 'lv-ask-row', 'lv-ask-note'], 'A question box with an Ask button', 'A paid question the agents do not see, with what is left of the allowance.', 'Unfold Team Ask Allowance', 'real'),

  entry('containment-judge', 'containment', ['lv-contain-judgement', 'lv-contain-judgements', 'lv-contain-verdict', 'is-on_course', 'is-drifting', 'is-off_course', 'is-abort'], 'The judge’s verdicts, oldest first', 'What a judge model said about the Run and why.', 'Proposed: Ploeg would have to emit a run.judgement event { runId, verdict, reason, judge }', 'proposed'),
  entry('containment-rules', 'containment', ['lv-contain-change', 'lv-contain-added', 'lv-contain-removed'], 'Rules marked added or removed, one row per kind', 'Instructions, skills, tools or hosts the Run did not start with, or lost.', 'Proposed: Ploeg would have to report the Run’s rule snapshot at its start and now', 'proposed'),
  entry('containment-actions', 'containment', ['lv-contain-action', 'lv-contain-actions', 'lv-contain-proposed'], 'Quarantine, Revoke key and False alarm, tagged Proposed', 'What a person could do about it; none of these exists yet.', 'Proposed: Ploeg would have to report that it can quarantine a running Run and revoke its model key, and accept those commands', 'proposed'),
  entry('containment-evidence', 'containment', ['lv-contain-evidence', 'lv-contain-code'], 'The text the Run read, shown inert', 'The tool output where the injected orders were found.', 'The transcript call output', 'real'),
  entry('containment-outcome', 'containment', ['lv-contain-outcome', 'lv-contain-rule'], 'Blocked or Not blocked, and the tripwire’s name', 'Whether the call’s output shows the sandbox refused it, and which tripwire it crossed.', 'guard.js blocked and rule fields', 'derived'),
  entry('containment-structure', 'containment', ['lv-contain-*', 'lv-overline'], 'The panel’s headings, rows and labels', 'Layout only: each row holds one of the facts above.', 'The facts in the entries above', 'derived'),
  entry('containment-panel', 'containment', ['lv-containment'], 'A containment panel', 'What fenced the Run in and whether it pushed against the fence.', 'guard.js tripwires over the folded transcript, and the proposed policy snapshot', 'derived'),
  entry('containment-signal', 'containment', ['lv-contain-signal', 'is-high', 'is-medium', 'is-blocked'], 'A tripwire row with its evidence', 'A call crossed a tripwire; high or medium severity, and blocked when its output shows it was refused.', 'guard.js guardSignals over the folded transcript', 'derived'),
  entry('containment-drift', 'containment', ['lv-contain-drift'], 'A row of added and removed rules', 'The Run’s instructions, skills, tools or hosts changed since it started.', 'Proposed: Ploeg would have to report a policy snapshot { instructions, skills, tools, hosts } at Run start and now', 'proposed'),
]);

const componentNames = Object.freeze({ flight: 'Flight path', folds: 'Fold strip', dial: 'Shift dial', trace: 'Trace and moves', instruments: 'Instruments', answers: 'Standing answers', containment: 'Containment' });

const ignored = token => /^lv-g\d+$/.test(token) || token.startsWith('lv-tone-') || token === 'sr-only';

function explains(entries, token) {
  return entries.some(each => each.classes.some(name => name.endsWith('*') ? token.startsWith(name.slice(0, -1)) : name === token));
}

/**
 * The `lv-` and `is-` class tokens in `markup` that no ledger entry for `component` explains. Grow classes
 * (`lv-g<N>`), tone helpers (`lv-tone-*`) and `sr-only` are not counted.
 * @param {string} markup
 * @param {string} component
 * @returns {string[]} Sorted and unique.
 */
export function unexplained(markup, component) {
  const entries = meaningLedger.filter(each => each.component === component);
  const tokens = new Set();
  for (const match of String(markup).matchAll(/\sclass=(?:"([^"]*)"|'([^']*)')/g)) {
    for (const token of (match[1] ?? match[2]).split(/\s+/)) if (/^(lv|is)-/.test(token) && !ignored(token)) tokens.add(token);
  }
  return [...tokens].filter(token => !explains(entries, token)).sort();
}

/**
 * The ledger as an accessible definition list: what each mark looks like, what it means, its source and whether
 * that source is real, derived or proposed. Without a component, or with `all`, every component is listed in turn.
 * @param {string} [component]
 * @returns {string}
 */
export function meaningLegend(component = 'all') {
  const components = component === 'all' ? Object.keys(componentNames) : [component];
  const groups = components.map(name => {
    const rows = meaningLedger.filter(each => each.component === name).map(each => `<div class="lv-legend-row" data-status="${each.status}" data-meaning="${escape(each.id)}"><dt>${escape(each.looksLike)}</dt><dd>${escape(each.means)}</dd><dd>Source: ${escape(each.source)}</dd><dd>Status: ${each.status}</dd><dd>Classes: ${each.classes.map(name => `<code>${escape(name)}</code>`).join(' ')}</dd></div>`).join('');
    return `<section class="lv-legend-group" aria-labelledby="lv-legend-${escape(name)}"><h3 class="lv-overline" id="lv-legend-${escape(name)}">${escape(componentNames[name] ?? name)}</h3><dl class="lv-legend" data-component="${escape(name)}">${rows}</dl></section>`;
  }).join('');
  return `<section class="lv-meaning" aria-label="What every mark means"><h2 class="lv-overline">What every mark means</h2>${groups}</section>`;
}
