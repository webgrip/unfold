import { money, plural } from './format.js';
import { ciState, failureReason, runFailure, parseBudgetReason, parseStuckReason, closeReasonLabel, withdrawnReason } from './states.js';
import { detailQuestions } from './blackboard.js';

export { parseBudgetReason, parseStuckReason, closeReasonLabel, withdrawnReason };

/**
 * Why a Work Item waits on a person, and what to do about it. `chip` is the short label, `sentence` explains it,
 * `fix` says what to change and `requeue` names the only way to start again today: assigning the task to the
 * Team again in its tracker (`trackerUrl` when known). `requeue` is empty for a reason about the Unfold session that
 * drives the Work Item, because that session's own page starts it again. `action` joins `fix` and `requeue`.
 * @typedef {object} Reason
 * @property {string} code
 * @property {string} chip
 * @property {string} sentence
 * @property {string} fix
 * @property {string} requeue
 * @property {string} action
 * @property {string} trackerUrl
 * @property {'attention' | 'severe' | 'danger' | 'live'} tone
 * @property {string} glyph
 * @property {string} [lead]
 */

/**
 * A secondary warning next to the reason, never the reason itself. `fix` is what to change in the tracker.
 * @typedef {object} Warning
 * @property {string} code
 * @property {string} chip
 * @property {string} sentence
 * @property {string} fix
 * @property {'attention'} tone
 * @property {string} glyph
 */

const trackers = { forgejo: 'Forgejo', github: 'GitHub', gitlab: 'GitLab', clickup: 'ClickUp', vikunja: 'Vikunja' };
const trackerOf = provider => trackers[provider] ? trackers[provider] : 'its tracker';

const copy = {
  plan_exhausted: {
    chip: 'Every Round ran, no result',
    sentence: 'Every planned Round ran, but no writer reported a pull request, or the last reviewer asked for changes and this team has no fix rounds.',
    fix: 'Open the Work Item to see whether the writer changed nothing or the reviewer still wants changes.',
  },
  fix_round_cap_reached: {
    chip: 'Reviewer still wants changes',
    sentence: 'The reviewer still asked for changes when the Team’s fix Rounds ran out.',
    fix: 'Read the findings. Finish the branch by hand, or sharpen the ticket.',
  },
  budget_exhausted_before_fix_round: {
    chip: 'Budget ran out',
    sentence: 'The attempt’s budget had too little left to pay for another fix Round.',
    fix: 'Finish the work by hand, or raise the Team’s budget in its configuration.',
  },
  budget_exhausted: {
    chip: 'Budget ran out',
    sentence: 'The attempt’s budget could not pay for the next Round.',
    fix: 'Finish the work by hand, or raise the Team’s budget in its configuration.',
  },
  budget_held: {
    chip: 'Budget held, not spent',
    sentence: 'Ploeg stopped for lack of budget, but most of the budget was only held for Runs whose spend it had not settled yet, not spent.',
    fix: 'Find out why those Runs failed and fix that first. Raising the budget does not help while the money is only held.',
  },
  checks_not_passed: {
    chip: 'Checks did not pass',
    sentence: 'The writer opened the pull request, but the Team’s checks failed or did not finish on the commit it pushed, and no fix Round could run. The pull request stays open.',
    fix: 'Run the Team’s checks on the pull request’s branch to see which one fails. Fix the branch by hand, or fix a flaky check in the Team’s configuration.',
  },
  ci_not_finished: {
    chip: 'CI did not finish',
    sentence: 'The pull request’s CI was still running on its last commit when the repository’s wait ran out, so Ploeg did not mark it ready for review. The pull request stays open.',
    fix: 'Let CI finish on the pull request. If it often takes this long, raise ci.waitTimeout for the repository in Ploeg’s configuration.',
  },
  ci_not_passed: {
    chip: 'CI did not pass',
    sentence: 'CI on the pull request did not pass, but every failing check was cancelled or also fails on the base branch, so Ploeg re-ran it once and sent nothing back to the writer. The pull request stays open.',
    fix: 'Open the failing checks the reason names. Fix the base branch or the CI runner, then re-run CI on the pull request.',
  },
  review_failed: {
    chip: 'Reviewer kept failing',
    sentence: 'The agent reviewer failed on every try, so no agent reviewed this work, and Ploeg did not mark it ready for review.',
    fix: 'Read the reviewer’s failed Runs to see why. Review the change yourself, or fix the reviewer’s model or setup.',
  },
  writing_run_failed_repeatedly: {
    chip: 'Writer kept failing',
    sentence: 'The writer failed three times in one Round without writing the branch, so Ploeg stopped trying.',
    fix: 'Read why the failed Runs stopped, then fix the brief or the agent setup, or pick another model.',
  },
  writing_run_killed_repeatedly: {
    chip: 'Cluster kept stopping the writer',
    sentence: 'Not the Work Item’s fault: the cluster stopped the writer before it could finish, so the work was never really tried.',
    fix: 'Look at the cluster (evictions, node pressure, image pulls), not the ticket.',
  },
  person_question: {
    chip: 'Question for you',
    sentence: 'An agent asked a question only a person can answer, instead of guessing.',
    fix: 'Answer it here. Unfold restarts the Work Item with your answer, so its next Runs read it.',
  },
  run_stuck: {
    chip: 'Agent is stuck',
    sentence: 'An agent reported that it cannot finish without a person.',
    fix: 'Read the stuck reason on that Run. Usually the ticket needs clarifying or splitting.',
  },
  plan_removed: {
    chip: 'Team plan removed',
    sentence: 'The Team’s plan was removed from the configuration during the attempt.',
    fix: 'Restore the plan, or move the task to another Team.',
  },
  approved_to_merge: {
    chip: 'Approved: merge it',
    sentence: 'The agent reviewers approved and the pull request is still open. Ploeg leaves the merge to you.',
    fix: 'Read the pull request and merge it on the forge. Merging finishes the Work Item.',
  },
  merged_untracked: {
    chip: 'Merged',
    sentence: 'The pull request is merged, but Ploeg still holds the Work Item.',
    fix: 'Close the task in the tracker to finish it.',
  },
  pull_request_closed: {
    chip: 'Pull request closed',
    sentence: 'An agent reviewer approved, but the Work Item came back to you. Most likely someone closed the pull request without merging it.',
    fix: 'Check the pull request. Leave it closed, or try again.',
  },
  operator_failed: {
    chip: 'Session failed',
    sentence: 'The interactive Unfold session that drove this Work Item failed.',
    fix: 'Open the session and read why it failed. There you can try it again, start it over as a new session, or close this Work Item.',
  },
  stale_infrastructure: {
    chip: 'Infrastructure kept failing',
    sentence: 'Not the Work Item’s fault: the infrastructure failed so often that Ploeg stopped retrying.',
    fix: 'Look at the cluster and the model gateway, not the ticket.',
  },
  stale_attempts: {
    chip: 'Agents kept failing',
    sentence: 'The agents failed on every attempt, so Ploeg stopped retrying.',
    fix: 'Read why the failed Runs stopped, then fix the brief or the agent setup, or pick another model.',
  },
  operator_interrupted: {
    chip: 'Session interrupted',
    sentence: 'The Unfold session that drives this Work Item was interrupted. Ploeg keeps it stopped and will not retry it on its own.',
    fix: 'Open the linked session: deliver work its reviewer approved, run it again, or cancel it.',
  },
  operator_expired: {
    chip: 'Session lost contact',
    sentence: 'The Unfold session that drives this Work Item stopped renewing its lease, so Ploeg interrupted it.',
    fix: 'Open the linked session: deliver work its reviewer approved, run it again, or cancel it.',
  },
  operator_paused: {
    chip: 'Session paused',
    sentence: 'A person paused the Unfold session that drives this Work Item.',
    fix: 'Resume or cancel the linked session.',
  },
  operator_waiting_input: {
    chip: 'Session needs an answer',
    sentence: 'The Unfold session that drives this Work Item is waiting for a person to answer.',
    fix: 'Answer the question in the linked session.',
  },
  unrecognised: {
    chip: 'Unrecognised reason',
    sentence: 'Ploeg recorded a reason code this version of Unfold does not recognise.',
    fix: 'Open the Work Item and read its history. A newer Unfold may explain this reason.',
  },
  unknown: {
    chip: 'Stopped; open for details',
    sentence: 'Ploeg stopped this Work Item without a reason Unfold recognises.',
    fix: 'Open the Work Item and read its history.',
  },
  ci_failed: {
    chip: 'CI did not pass',
    sentence: 'CI did not pass on the pull request, so it is not ready for review.',
    fix: 'Open the pull request’s checks. Run them again if they were cancelled, or fix the branch, before anyone reviews it.',
  },
  ci_running: {
    chip: 'CI running',
    sentence: 'CI is still running on the pull request. Review waits until it passes.',
    fix: 'Wait for CI to pass, then review the pull request.',
  },
  recorded: {
    chip: 'Needs a decision',
    sentence: 'Ploeg stopped this Work Item and asked a person to decide.',
    fix: 'Read what Ploeg recorded and the Work Item’s history, then decide in the tracker.',
  },
};

const planVariants = {
  no_pull_request: {
    fix: 'Check that the task says what must change and where. If the change is already there, close the task.',
  },
  changes_unresolved: {
    sentence: 'Every planned Round ran and the last reviewer still asked for changes. This Team’s plan has no fix Rounds left.',
    fix: 'Read the reviewer’s findings. Finish the branch by hand, or sharpen the ticket.',
  },
};

const number = value => typeof value === 'number' && Number.isFinite(value);

const held = (spent, reserved) => number(spent) && number(reserved) && reserved > 0 && reserved >= spent;

const exactCodes = new Set(['plan_exhausted', 'fix_round_cap_reached', 'checks_not_passed', 'ci_not_finished', 'ci_not_passed', 'review_failed', 'budget_exhausted_before_fix_round', 'writing_run_failed_repeatedly', 'writing_run_killed_repeatedly', 'operator_failed', 'operator_interrupted', 'operator_expired', 'operator_paused', 'operator_waiting_input']);

const sessionCodes = new Set(['operator_failed', 'operator_interrupted', 'operator_expired', 'operator_paused', 'operator_waiting_input']);

const answeredHere = new Set(['person_question', 'approved_to_merge', 'merged_untracked']);

/** Whether the reason is about the Unfold session that drives the Work Item, so the next step happens on that session's page. */
export function sessionReason(reason) {
  return sessionCodes.has(reason?.code);
}

const reasonCode = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

function classify(closeReason) {
  const text = String(closeReason ?? '').trim();
  const lower = text.toLowerCase();
  if (text === 'question_for_person') return { code: 'person_question', text };
  if (exactCodes.has(text)) return { code: text, text };
  if (lower.startsWith('budget held by unsettled runs')) return { code: 'budget_held', text };
  if (lower.startsWith('budget exhausted')) {
    const { spent, reserved } = parseBudgetReason(text);
    return { code: held(spent, reserved) ? 'budget_held' : 'budget_exhausted', text };
  }
  if (lower.startsWith('run stuck:')) return { code: 'run_stuck', text };
  if (lower === 'plan removed from configuration') return { code: 'plan_removed', text };
  if (text === 'review_approved') return { code: 'pull_request_closed', text };
  if (reasonCode.test(text)) return { code: 'unrecognised', text };
  return { code: 'unknown', text };
}

function sentenceFor(code, text, item, demo) {
  if (code === 'budget_exhausted') {
    const { pool, spent, reserved } = parseBudgetReason(text);
    if (pool !== null) return `The attempt’s budget of ${money(pool)} could not pay for the next Round${spent !== null && !demo ? ` (spent ${money(spent)}${reserved !== null ? `, held ${money(reserved)}` : ''})` : ''}.`;
  }
  if (code === 'budget_held') {
    const { pool, spent, reserved } = parseBudgetReason(text);
    if (pool !== null && /^budget held/i.test(text)) return `Ploeg stopped because the attempt’s ${money(pool)} budget is held, not spent: ${spent > 0 ? `only ${money(spent)} was spent, and ` : ''}${money(reserved)} is still held for finished Runs whose spend Ploeg could not settle within a day.`;
    if (pool !== null) return `Ploeg stopped because the attempt’s ${money(pool)} budget could not pay for the next Round, but ${spent > 0 ? `only ${money(spent)} was spent` : 'nothing was spent'}. ${money(reserved)} was held for Runs whose spend Ploeg had not settled yet.`;
  }
  if (code === 'run_stuck') {
    const { role, round } = parseStuckReason(text);
    if (role) return `The ${role} reported that it cannot finish${round ? ` in Round ${round}` : ''} without a person.`;
  }
  if (code === 'writing_run_killed_repeatedly' && number(item.infraFailures) && item.infraFailures > 0) return `Not the Work Item’s fault: the cluster stopped the writer ${item.infraFailures} ${item.infraFailures === 1 ? 'time' : 'times'} before it could finish, so the work was never really tried.`;
  if (code === 'unrecognised') return `Ploeg recorded the reason code “${text}”, which this version of Unfold does not recognise.`;
  if (code === 'unknown' && text) return /[.!?]$/.test(text) ? `Ploeg recorded: “${text}”` : `Ploeg recorded: “${text}”.`;
  return copy[code].sentence;
}

const reasonGlyphs = Object.freeze({
  plan_exhausted: 'pull-request',
  fix_round_cap_reached: 'eye',
  budget_exhausted: 'coins',
  budget_exhausted_before_fix_round: 'coins',
  budget_held: 'lock',
  checks_not_passed: 'x-circle',
  ci_not_finished: 'clock',
  ci_not_passed: 'x-circle',
  review_failed: 'eye-off',
  writing_run_failed_repeatedly: 'x-circle',
  writing_run_killed_repeatedly: 'zap',
  person_question: 'help-circle',
  run_stuck: 'pause-circle',
  plan_removed: 'settings',
  pull_request_closed: 'circle-slash',
  approved_to_merge: 'pull-request',
  merged_untracked: 'check-circle',
  operator_failed: 'sessions',
  operator_interrupted: 'sessions',
  operator_expired: 'sessions',
  operator_paused: 'pause-circle',
  operator_waiting_input: 'sessions',
  unrecognised: 'help-circle',
  stale_infrastructure: 'zap',
  stale_attempts: 'clock',
  unknown: 'help-circle',
});

/** The glyph that tells one reason from another at a glance: by `code`, else the reason's own glyph, else `alert`. */
export function reasonGlyph(reason) {
  return reasonGlyphs[reason?.code] || reason?.glyph || 'alert';
}

function build(code, item, text = '', demo = false) {
  const entry = copy[code === 'unknown' && text ? 'recorded' : code];
  const requeue = sessionCodes.has(code) || answeredHere.has(code) ? '' : `Then assign the task to the Team again in ${trackerOf(item.provider)}.`;
  return {
    code,
    chip: code === 'unrecognised' ? `Unrecognised: ${text}` : entry.chip,
    sentence: sentenceFor(code, text, item, demo),
    fix: entry.fix,
    requeue,
    action: requeue ? `${entry.fix} ${requeue}` : entry.fix,
    trackerUrl: typeof item.url === 'string' ? item.url : '',
    tone: code.startsWith('stale_') ? 'severe' : 'attention',
    glyph: reasonGlyphs[code] || 'alert',
  };
}

/**
 * The list-level reason a Work Item waits on a person, from `latestShift.closeReason` (or a top-level
 * `closeReason`), `attempts` and `infraFailures`. It covers `needs_human` and `stale`; every other state
 * returns null. An unresolved repository is never the reason; see `routingWarning`. A free-text close reason
 * keeps the code `unknown` and reads "Needs a decision", with Ploeg's text in the sentence. A snake_case code this
 * version does not know gets the code `unrecognised` and the chip "Unrecognised: <code>". With `demo`, a budget
 * sentence names the budget but no spend, because the demo spends nothing. An `awaiting_review` Work Item gets
 * its `reviewHold`, so a pull request whose CI did not pass or still runs says so. A `needs_human` item whose `question`
 * is a typed question to a person (Now attaches it), or whose Shift closed `question_for_person` (Ploeg ADR-0121), reads
 * "Question for you".
 * @param {object | null | undefined} item
 * @param {{ demo?: boolean }} [options]
 * @returns {Reason | null}
 */
export function listReason(item, { demo = false } = {}) {
  if (item?.state === 'awaiting_review') return reviewHold(item);
  if (!item || !['needs_human', 'stale'].includes(item.state)) return null;
  if (item.state === 'stale') return build(number(item.infraFailures) && item.infraFailures >= 10 ? 'stale_infrastructure' : 'stale_attempts', item);
  if (item.question?.typed === true) return build('person_question', item);
  const closeReason = item.latestShift?.closeReason ?? item.closeReason ?? '';
  if (item.latestShift && !item.latestShift.closedAt && !item.closeReason) return build('unknown', item);
  const { code, text } = classify(closeReason);
  return build(approvedCode(code, item), item, text, demo);
}

function approvedCode(code, item) {
  if (code !== 'pull_request_closed') return code;
  if (item?.pullRequestState === 'open') return 'approved_to_merge';
  if (item?.pullRequestState === 'merged') return 'merged_untracked';
  return code;
}

/** Whether a Work Item that needs you is only waiting for you to merge: the agent reviewers approved and its pull request is still open. */
export function approvedToMerge(item) {
  return item?.state === 'needs_human' && (item.latestShift?.closeReason ?? item.closeReason) === 'review_approved' && item.pullRequestState === 'open';
}

const ciHolds = Object.freeze({ failure: 'ci_failed', error: 'ci_failed', pending: 'ci_running' });
const pullNumber = item => {
  if (number(item.pullRequest?.number)) return item.pullRequest.number;
  const match = /\/(?:pulls?|merge_requests)\/(\d+)\/?$/.exec(String(item.pullRequestUrl || item.pullRequest?.url || ''));
  return match ? Number(match[1]) : null;
};

/**
 * The names of the checks that failed or errored in a pull request's CI, as Ploeg captured it on the head commit.
 * @param {{ checks?: { context?: string, state?: string }[] } | null | undefined} ci
 * @returns {string[]}
 */
export function failingChecks(ci) {
  return (Array.isArray(ci?.checks) ? ci.checks : []).filter(check => check?.state === 'failure' || check?.state === 'error').map(check => String(check.context ?? '').trim()).filter(Boolean);
}

/**
 * Why a pull request Ploeg handed over for review is not ready for a person yet, from the `ci` it carries: `ci_failed`
 * when CI did not pass on its head commit (failure or error), `ci_running` while it still runs. Null for any other
 * state, when CI passed, and when the forge reported no CI, so a missing report never invents a blocker. `lead`
 * says it in one sentence; `sentence` adds the checks that did not pass.
 * @param {{ state?: string, ci?: { state?: string, checks?: { context?: string, state?: string }[] } | null, pullRequest?: { number?: number | null, url?: string } | null, pullRequestUrl?: string, url?: string } | null | undefined} item
 * @returns {Reason | null}
 */
export function reviewHold(item) {
  const code = item?.state === 'awaiting_review' ? ciHolds[item.ci?.state] : undefined;
  if (!code) return null;
  const pull = pullNumber(item);
  const subject = pull ? `pull request #${pull}` : 'the pull request';
  const failing = failingChecks(item.ci);
  const lead = code === 'ci_failed' ? `CI did not pass on ${subject}, so it is not ready for review.` : `CI is still running on ${subject}. Review waits until it passes.`;
  const sentence = failing.length ? `${lead} Not passing: ${failing.join(', ')}.` : lead;
  const fix = copy[code].fix;
  return { code, chip: copy[code].chip, lead, sentence, fix, requeue: '', action: fix, trackerUrl: typeof item.url === 'string' ? item.url : '', tone: code === 'ci_failed' ? 'danger' : 'live', glyph: ciState(item.ci.state).glyph };
}

/**
 * Which Now group a waiting Work Item belongs to. A pull request whose CI did not pass needs you, not a review;
 * one whose CI still runs stays ready for review. A Work Item the agent reviewers approved whose pull request is still
 * open (`approvedToMerge`) is ready for review too. Every other state needs you.
 * @param {{ state?: string, ci?: { state?: string } | null }} item
 * @returns {'review' | 'needs' | 'proposed'}
 */
export function waitingGroup(item) {
  if (item?.state === 'proposed') return 'proposed';
  if (item?.state === 'awaiting_review') return reviewHold(item)?.code === 'ci_failed' ? 'needs' : 'review';
  return approvedToMerge(item) ? 'review' : 'needs';
}

/**
 * The secondary "Not routed" warning: Ploeg matched no repository for the task (`target` is null) and the item
 * is not registered by hand. Returns null when the target is known or not reported.
 * @returns {Warning | null}
 */
export function routingWarning(item) {
  if (!item || item.target !== null || item.provider === 'manual') return null;
  return { code: 'not_routed', chip: 'Not routed', sentence: 'No routing rule matched a repository, so the Run used the Team’s fallback repository. Add a repository label or a routing rule to the task.', fix: 'Add a repository label or a routing rule to the task.', tone: 'attention', glyph: 'alert' };
}

const newestFirst = (a, b) => { try { const x = BigInt(a.id), y = BigInt(b.id); return x < y ? 1 : x > y ? -1 : 0; } catch { return 0; } };

function relevantRun(detail, reason, closeReason) {
  const runs = [...(detail.runs || [])].sort(newestFirst);
  if (reason.code === 'run_stuck') {
    const { role, round } = parseStuckReason(closeReason);
    const acting = runs.filter(run => !run.shadow);
    return acting.find(run => run.outcome === 'stuck' && (!role || run.role === role) && (round === null || run.round === round)) || acting.find(run => run.outcome === 'stuck') || null;
  }
  if (['writing_run_failed_repeatedly', 'writing_run_killed_repeatedly', 'stale_attempts', 'stale_infrastructure', 'budget_held'].includes(reason.code)) return runs.find(run => run.writes && (run.outcome === 'failed' || run.failureReason)) || runs.find(run => run.outcome === 'failed' || run.failureReason) || null;
  if (['checks_not_passed', 'ci_not_finished', 'ci_not_passed'].includes(reason.code)) return runs.find(run => run.writes && (run.outcome === 'pr_opened' || run.outcome === 'pr_updated')) || null;
  if (reason.code === 'review_failed') return runs.find(run => !run.writes && !run.shadow && (run.outcome === 'failed' || run.failureReason)) || null;
  if (reason.code === 'unknown') return runs.find(run => run.outcome === 'stuck') || null;
  return null;
}

const pullRequestPath = /\/(?:pulls?|merge_requests)\/\d+\/?$/;

function planVariant(detail, shift) {
  const runs = (detail.runs || []).filter(run => !shift?.id || !run.shiftId || run.shiftId === shift.id);
  const readers = runs.filter(run => !run.writes && !run.shadow && run.state === 'finished').sort((a, b) => (a.round || 0) - (b.round || 0) || -newestFirst(a, b));
  if (readers.at(-1)?.verdict === 'request_changes') return { variant: 'changes_unresolved', writer: null };
  const writers = runs.filter(run => run.writes).sort(newestFirst);
  const reported = writers.some(run => run.outcome === 'pr_opened' || run.outcome === 'pr_updated')
    || (detail.checkpoints || []).some(entry => entry.prUrl)
    || runs.some(run => (run.links || []).some(link => pullRequestPath.test(String(link))));
  if (reported) return null;
  return { variant: 'no_pull_request', writer: writers[0] || null };
}

function noPullRequestSentence(writer) {
  if (!writer) return 'Every planned Round ran, but no writer ran, so there is no pull request to review.';
  if (writer.outcome === 'no_change_needed') return 'Every planned Round ran, but the writer changed nothing, so there is no pull request to review.';
  return 'Every planned Round ran, but no writer reported a pull request.';
}

const budgetCodes = new Set(['budget_exhausted', 'budget_exhausted_before_fix_round', 'budget_held']);

function heldDetail(detail, shift, reason) {
  const runs = (detail.runs || []).filter(run => !shift?.id || run.shiftId === shift.id);
  const failures = runs.map(run => failureReason(run.failureReason)).filter(Boolean);
  const infra = failures.filter(meta => meta.infra);
  const { pool, spent, reserved } = parseBudgetReason(shift?.closeReason ?? '');
  const cause = infra.length ? infra[0] : failures[0];
  const parts = [reason.sentence];
  if (cause) parts.push(`${plural(failures.length, 'Run')} failed first: ${cause.label.replace(/^The /, 'the ')}${infra.length && infra.length === failures.length ? ', which is infrastructure, not the agent' : ''}.`);
  const now = shift?.reservedUsd;
  if (number(now) && number(reserved) && number(pool) && number(spent) && now < reserved) parts.push(now > 0 ? `Ploeg has since released part of that hold: ${money(now)} is still held.` : `Ploeg has since released that hold, so ${money(Math.max(0, pool - spent))} of the budget is free again.`);
  const fix = cause ? `${cause.next || cause.action} The budget itself was not the problem.` : reason.fix;
  return { sentence: parts.join(' '), fix, action: `${fix} ${reason.requeue}` };
}

/**
 * The detail-level reason: the list reason, with the same `code` and `chip` as every list shows, refined with what the
 * detail shows. It carries Ploeg's own sentence from the latest `work_item.needs_human` event as a quote (`headline`,
 * null when absent; always null for `plan_exhausted`, whose Ploeg sentence reads as if the work were ready to
 * merge, and for the budget reasons, whose Ploeg sentence only repeats Unfold's) and, for stuck or failing Runs, the matching Run (`run`: its id, Role, Round, `text` from its stuck reason or
 * summary, and its failure reason meta). For `plan_exhausted` it tells the two causes apart with `variant`
 * (`no_pull_request`: no writer reported one; `changes_unresolved`: the last reviewer asked for changes), which
 * changes the sentence and the fix but not the chip. For `budget_held` it names the failure that came first and
 * whether Ploeg has released the hold since, and points the fix at that failure instead of the budget. Returns null
 * unless the item is `needs_human` or `stale`.
 */
export function detailReason(detail) {
  const item = detail?.item;
  if (!item) return null;
  const shift = detail.shifts?.[0] ?? item.latestShift ?? null;
  const typed = item.state === 'needs_human' && detailQuestions(detail).some(entry => entry.to === 'person' && entry.waitingForPerson);
  let reason = listReason({ ...item, latestShift: shift, ...(typed ? { question: { typed: true } } : {}) }, { demo: Boolean(detail.demo) });
  if (!reason) return null;
  const event = (detail.events || []).find(entry => entry.action === `work_item.${item.state}` && entry.detail?.reason);
  let headline = event ? String(event.detail.reason) : null;
  const closeReason = shift?.closeReason ?? '';
  const run = relevantRun(detail, reason, closeReason);
  if (reason.code === 'writing_run_killed_repeatedly' && !(number(item.infraFailures) && item.infraFailures > 0)) {
    const killed = (detail.runs || []).filter(entry => entry.writes && (!shift?.id || entry.shiftId === shift.id) && failureReason(entry.failureReason)?.infra).length;
    if (killed > 1) reason = { ...reason, sentence: sentenceFor(reason.code, '', { ...item, infraFailures: killed }) };
  }
  if (reason.code === 'unknown' && headline) {
    const recorded = classify(headline);
    if (recorded.code !== 'unknown') { reason = build(recorded.code, item, recorded.text, Boolean(detail.demo)); headline = null; }
  }
  if (reason.code === 'pull_request_closed' && headline && /a person is asked to merge/i.test(headline) && !/closed without merging/i.test(headline)) {
    reason = build('approved_to_merge', item, closeReason, Boolean(detail.demo));
    headline = null;
  }
  if (budgetCodes.has(reason.code)) headline = null;
  if (reason.code === 'writing_run_failed_repeatedly') {
    headline = null;
    const sentence = `${run?.role ? `The ${run.role}` : 'The writer'} failed three times ${run?.round ? `in Round ${run.round}` : 'in one Round'} without writing the branch, so Ploeg stopped trying.`;
    const fix = runFailure(run)?.next || reason.fix;
    reason = { ...reason, sentence, fix, action: `${fix} ${reason.requeue}` };
  }
  if (reason.code === 'budget_held') reason = { ...reason, ...heldDetail(detail, shift, reason) };
  let variant = null;
  if (reason.code === 'plan_exhausted') {
    headline = null;
    const found = planVariant(detail, shift);
    if (found) {
      variant = found.variant;
      const entry = planVariants[variant];
      const sentence = variant === 'no_pull_request' ? noPullRequestSentence(found.writer) : entry.sentence;
      reason = { ...reason, sentence, fix: entry.fix, action: `${entry.fix} ${reason.requeue}` };
    }
  }
  return {
    ...reason,
    variant,
    headline,
    run: run ? { id: run.id, role: run.role, round: run.round, text: run.stuckReason || run.summary || '', failure: failureReason(run.failureReason) } : null,
  };
}

/**
 * The one grouping rule for Needs you, on Now and on Work: Work Items whose reason chip (what the row reads) is shared by at
 * least two items form a group under that reason, the largest group first and ties in the order their first item
 * appears; every other item stays a flat row with its own reason chip, before the groups and in the order given.
 * An item Unfold does not group by state (for example `stale`) is read as a Needs-you item.
 * @param {object[]} items
 * @param {{ demo?: boolean }} [options]
 * @returns {{ key: string, reason: Reason, grouped: boolean, items: object[] }[]}
 */
export function needsYouBlocks(items, { demo = false } = {}) {
  const buckets = new Map();
  for (const item of items || []) {
    const reason = listReason(item, { demo }) || listReason({ ...item, state: 'needs_human' }, { demo });
    const key = reason.chip;
    if (!buckets.has(key)) buckets.set(key, { key, reason, items: [], index: buckets.size });
    buckets.get(key).items.push(item);
  }
  const all = [...buckets.values()];
  const singles = (items || []).map(item => all.find(bucket => bucket.items.length === 1 && bucket.items[0] === item)).filter(Boolean).map(bucket => ({ key: bucket.key, reason: bucket.reason, grouped: false, items: bucket.items }));
  const groups = all.filter(bucket => bucket.items.length > 1).sort((a, b) => b.items.length - a.items.length || a.index - b.index).map(bucket => ({ key: bucket.key, reason: bucket.reason, grouped: true, items: bucket.items }));
  return [...singles, ...groups];
}
