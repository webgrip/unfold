import { money } from './format.js';
import { failureReason } from './states.js';

/**
 * Why a Work Item waits on a person, and what to do about it. `chip` is the short label, `sentence` explains it,
 * `fix` says what to change and `requeue` names the only way to start again today: assigning the task to the
 * Team again in its tracker (`trackerUrl` when known). `action` joins `fix` and `requeue`.
 * @typedef {object} Reason
 * @property {string} code
 * @property {string} chip
 * @property {string} sentence
 * @property {string} fix
 * @property {string} requeue
 * @property {string} action
 * @property {string} trackerUrl
 * @property {'attention' | 'severe'} tone
 * @property {string} glyph
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

/** Re-queueing a Work Item from Vloer does not exist yet; it is proposed Ploeg work. */
export const requeueNote = 'Starting again from Vloer is proposed Ploeg work. Today only the tracker can start a new attempt.';

const copy = {
  plan_exhausted: {
    chip: 'No pull request or changes unresolved',
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
    sentence: 'The Shift’s budget had too little left to pay for another fix Round.',
    fix: 'Finish the work by hand, or raise the Team’s budget in its configuration.',
  },
  budget_exhausted: {
    chip: 'Budget ran out',
    sentence: 'The Shift’s budget could not pay for the next Round.',
    fix: 'Finish the work by hand, or raise the Team’s budget in its configuration.',
  },
  writing_run_failed_repeatedly: {
    chip: 'Writer kept failing',
    sentence: 'The writer failed three times in one Round without writing the branch. These were agent failures, not infrastructure.',
    fix: 'Read the failed Runs’ failure reasons and log tails. Fix the brief, the model or the harness.',
  },
  writing_run_killed_repeatedly: {
    chip: 'Cluster kept stopping the writer',
    sentence: 'Not the Work Item’s fault: the cluster stopped the writer before it could finish, so the work was never really tried.',
    fix: 'Look at the cluster (evictions, node pressure, image pulls), not the ticket.',
  },
  run_stuck: {
    chip: 'Agent is stuck',
    sentence: 'An agent reported that it cannot finish without a person.',
    fix: 'Read the stuck reason on that Run. Usually the ticket needs clarifying or splitting.',
  },
  plan_removed: {
    chip: 'Team plan removed',
    sentence: 'The Team’s plan was removed from the configuration while the Shift ran.',
    fix: 'Restore the plan, or move the task to another Team.',
  },
  pull_request_closed: {
    chip: 'Pull request closed',
    sentence: 'An agent reviewer approved, but the Work Item came back to you. Most likely someone closed the pull request without merging it.',
    fix: 'Check the pull request. Leave it closed, or try again.',
  },
  operator_failed: {
    chip: 'Session failed',
    sentence: 'The interactive Vloer session that drove this Work Item failed.',
    fix: 'Open the linked session and read its failure notice.',
  },
  stale_infrastructure: {
    chip: 'Infrastructure kept failing',
    sentence: 'Not the Work Item’s fault: the infrastructure failed so often that Ploeg stopped retrying.',
    fix: 'Look at the cluster and the model gateway, not the ticket.',
  },
  stale_attempts: {
    chip: 'Agents kept failing',
    sentence: 'The agents failed on every attempt, so Ploeg stopped retrying.',
    fix: 'Read the failed Runs’ failure reasons. Fix the brief, the model or the harness.',
  },
  unknown: {
    chip: 'Stopped; open for details',
    sentence: 'Ploeg stopped this Work Item without a reason Vloer recognises.',
    fix: 'Open the Work Item and read its history.',
  },
  recorded: {
    chip: 'Needs a decision',
    sentence: 'Ploeg stopped this Work Item and asked a person to decide.',
    fix: 'Read what Ploeg recorded and the Work Item’s history, then decide in the tracker.',
  },
};

const planVariants = {
  no_pull_request: {
    chip: 'No pull request',
    fix: 'Check that the task says what must change and where. If the change is already there, close the task.',
  },
  changes_unresolved: {
    chip: 'Changes unresolved',
    sentence: 'Every planned Round ran and the last reviewer still asked for changes. This Team’s plan has no fix Rounds left.',
    fix: 'Read the reviewer’s findings. Finish the branch by hand, or sharpen the ticket.',
  },
};

const number = value => typeof value === 'number' && Number.isFinite(value);

const exactCodes = new Set(['plan_exhausted', 'fix_round_cap_reached', 'budget_exhausted_before_fix_round', 'writing_run_failed_repeatedly', 'writing_run_killed_repeatedly', 'operator_failed']);

function classify(closeReason) {
  const text = String(closeReason ?? '').trim();
  const lower = text.toLowerCase();
  if (exactCodes.has(text)) return { code: text, text };
  if (lower.startsWith('budget exhausted')) return { code: 'budget_exhausted', text };
  if (lower.startsWith('run stuck:')) return { code: 'run_stuck', text };
  if (lower === 'plan removed from configuration') return { code: 'plan_removed', text };
  if (text === 'review_approved') return { code: 'pull_request_closed', text };
  return { code: 'unknown', text };
}

/** Reads `budget exhausted: pool P, spent S, reserved R` into numbers; missing parts are null. */
export function parseBudgetReason(text) {
  const read = name => { const match = new RegExp(`${name}\\s+(-?\\d+(?:\\.\\d+)?)`, 'i').exec(String(text ?? '')); return match ? Number(match[1]) : null; };
  return { pool: read('pool'), spent: read('spent'), reserved: read('reserved') };
}

/** Reads `run stuck: <role> round <n>` into the Role and Round; missing parts are null. */
export function parseStuckReason(text) {
  const match = /^run stuck:\s*(.*?)(?:\s+round\s+(\d+))?\s*$/i.exec(String(text ?? '').trim());
  if (!match) return { role: null, round: null };
  return { role: match[1] || null, round: match[2] ? Number(match[2]) : null };
}

function sentenceFor(code, text, item, demo) {
  if (code === 'budget_exhausted') {
    const { pool, spent, reserved } = parseBudgetReason(text);
    if (pool !== null) return `The Shift’s budget of ${money(pool)} could not pay for the next Round${spent !== null && !demo ? ` (spent ${money(spent)}${reserved !== null ? `, reserved ${money(reserved)}` : ''})` : ''}.`;
  }
  if (code === 'run_stuck') {
    const { role, round } = parseStuckReason(text);
    if (role) return `The ${role} reported that it cannot finish${round ? ` in Round ${round}` : ''} without a person.`;
  }
  if (code === 'writing_run_killed_repeatedly' && number(item.infraFailures) && item.infraFailures > 0) return `Not the Work Item’s fault: the cluster stopped the writer ${item.infraFailures} ${item.infraFailures === 1 ? 'time' : 'times'} before it could finish, so the work was never really tried.`;
  if (code === 'unknown' && text) return `Ploeg recorded: “${text}”.`;
  return copy[code].sentence;
}

function build(code, item, text = '', demo = false) {
  const entry = copy[code === 'unknown' && text ? 'recorded' : code];
  const requeue = `Then assign the task to the Team again in ${trackerOf(item.provider)}.`;
  return {
    code,
    chip: entry.chip,
    sentence: sentenceFor(code, text, item, demo),
    fix: entry.fix,
    requeue,
    action: `${entry.fix} ${requeue}`,
    trackerUrl: typeof item.url === 'string' ? item.url : '',
    tone: code.startsWith('stale_') ? 'severe' : 'attention',
    glyph: code.startsWith('stale_') ? 'clock' : 'alert',
  };
}

/**
 * The list-level reason a Work Item waits on a person, from `latestShift.closeReason` (or a top-level
 * `closeReason`), `attempts` and `infraFailures`. It covers `needs_human` and `stale`; every other state
 * returns null. An unresolved repository is never the reason; see `routingWarning`. A free-text close reason
 * keeps the code `unknown` and reads "Needs a decision", with Ploeg's text in the sentence. With `demo`, a budget
 * sentence names the budget but no spend, because the demo spends nothing.
 * @param {object | null | undefined} item
 * @param {{ demo?: boolean }} [options]
 * @returns {Reason | null}
 */
export function listReason(item, { demo = false } = {}) {
  if (!item || !['needs_human', 'stale'].includes(item.state)) return null;
  if (item.state === 'stale') return build(number(item.infraFailures) && item.infraFailures >= 10 ? 'stale_infrastructure' : 'stale_attempts', item);
  const closeReason = item.latestShift?.closeReason ?? item.closeReason ?? '';
  if (item.latestShift && !item.latestShift.closedAt && !item.closeReason) return build('unknown', item);
  const { code, text } = classify(closeReason);
  return build(code, item, text, demo);
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
    return runs.find(run => run.outcome === 'stuck' && (!role || run.role === role) && (round === null || run.round === round)) || runs.find(run => run.outcome === 'stuck') || null;
  }
  if (['writing_run_failed_repeatedly', 'writing_run_killed_repeatedly', 'stale_attempts', 'stale_infrastructure'].includes(reason.code)) return runs.find(run => run.writes && (run.outcome === 'failed' || run.failureReason)) || runs.find(run => run.outcome === 'failed' || run.failureReason) || null;
  if (reason.code === 'unknown') return runs.find(run => run.outcome === 'stuck') || null;
  return null;
}

const pullRequestPath = /\/(?:pulls?|merge_requests)\/\d+\/?$/;

function planVariant(detail, shift) {
  const runs = (detail.runs || []).filter(run => !shift?.id || !run.shiftId || run.shiftId === shift.id);
  const readers = runs.filter(run => !run.writes && run.state === 'finished').sort((a, b) => (a.round || 0) - (b.round || 0) || -newestFirst(a, b));
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

/**
 * The detail-level reason: the list reason refined with what the detail shows. It carries Ploeg's own sentence from
 * the latest `work_item.needs_human` event (`headline`, null when absent, and always null for `plan_exhausted`,
 * whose Ploeg sentence reads as if the work were ready to merge) and, for stuck or failing Runs, the matching Run
 * (`run`: its id, Role, Round, `text` from its stuck reason or summary, and its failure reason meta). For
 * `plan_exhausted` it tells the two causes apart with `variant`: `no_pull_request` (no writer reported one) or
 * `changes_unresolved` (the last reviewer asked for changes). Returns null unless the item is `needs_human` or `stale`.
 */
export function detailReason(detail) {
  const item = detail?.item;
  if (!item) return null;
  const shift = detail.shifts?.[0] ?? item.latestShift ?? null;
  let reason = listReason({ ...item, latestShift: shift }, { demo: Boolean(detail.demo) });
  if (!reason) return null;
  const event = (detail.events || []).find(entry => entry.action === `work_item.${item.state}` && entry.detail?.reason);
  let headline = event ? String(event.detail.reason) : null;
  if (headline && /pull request closed without merging/i.test(headline)) reason = build('pull_request_closed', item);
  const closeReason = shift?.closeReason ?? '';
  const run = relevantRun(detail, reason, closeReason);
  if (run && reason.code === 'unknown' && run.outcome === 'stuck') reason = { ...build('run_stuck', item), sentence: `The ${run.role} reported that it cannot finish${run.round ? ` in Round ${run.round}` : ''} without a person.` };
  if (reason.code === 'writing_run_killed_repeatedly' && !(number(item.infraFailures) && item.infraFailures > 0)) {
    const killed = (detail.runs || []).filter(entry => entry.writes && (!shift?.id || entry.shiftId === shift.id) && failureReason(entry.failureReason)?.infra).length;
    if (killed > 1) reason = { ...reason, sentence: sentenceFor(reason.code, '', { ...item, infraFailures: killed }) };
  }
  let variant = null;
  if (reason.code === 'plan_exhausted') {
    headline = null;
    const found = planVariant(detail, shift);
    if (found) {
      variant = found.variant;
      const entry = planVariants[variant];
      const sentence = variant === 'no_pull_request' ? noPullRequestSentence(found.writer) : entry.sentence;
      reason = { ...reason, chip: entry.chip, sentence, fix: entry.fix, action: `${entry.fix} ${reason.requeue}` };
    }
  }
  return {
    ...reason,
    variant,
    headline,
    run: run ? { id: run.id, role: run.role, round: run.round, text: run.stuckReason || run.summary || '', failure: failureReason(run.failureReason) } : null,
  };
}

const closeLabels = {
  review_approved: 'An agent reviewer approved',
  plan_exhausted: 'Every planned Round ran',
  fix_round_cap_reached: 'The fix Rounds ran out',
  budget_exhausted_before_fix_round: 'The budget ran out before a fix Round',
  writing_run_failed_repeatedly: 'The writer kept failing',
  writing_run_killed_repeatedly: 'The cluster kept stopping the writer',
  withdrawn_unassigned: 'The task was unassigned from the Team',
  withdrawn_closed: 'The task was closed before any Run started',
  withdrawn_by_operator: 'An operator cancelled it',
  operator_adopted: 'A Vloer session took it over',
  operator_completed: 'The Vloer session completed it',
  operator_cancelled: 'The Vloer session was cancelled',
  operator_failed: 'The Vloer session failed',
  operator_admission_expired: 'The Vloer session never started',
};

/**
 * A Shift close reason in a few plain words, for Shift rows and audit lines: `plan_exhausted` reads "Every planned
 * Round ran", the `budget exhausted: …` and `run stuck: <role> round <n>` prefixes read as sentences, an empty
 * reason is an open Shift and anything else is quoted as Ploeg wrote it.
 * @param {string | null | undefined} closeReason
 * @returns {string}
 */
export function closeReasonLabel(closeReason) {
  const text = String(closeReason ?? '').trim();
  if (!text) return 'Still open';
  if (Object.hasOwn(closeLabels, text)) return closeLabels[text];
  const lower = text.toLowerCase();
  if (lower.startsWith('budget exhausted')) { const { pool } = parseBudgetReason(text); return pool !== null ? `The ${money(pool)} budget ran out` : 'The budget ran out'; }
  if (lower.startsWith('run stuck:')) { const { role, round } = parseStuckReason(text); return role ? `The ${role} got stuck${round ? ` in Round ${round}` : ''}` : 'An agent got stuck'; }
  if (lower === 'plan removed from configuration') return 'The Team plan was removed';
  return `Ploeg recorded: “${text}”`;
}

/**
 * Why a withdrawn Work Item was withdrawn, from its Shift close reason or the `work_item.withdrawn` event reason.
 * Returns null for a reason Vloer does not recognise.
 * @param {string | null | undefined} code
 * @returns {string | null}
 */
export function withdrawnReason(code) {
  const text = String(code ?? '').trim();
  return text.startsWith('withdrawn_') && Object.hasOwn(closeLabels, text) ? `${closeLabels[text]}.` : null;
}
