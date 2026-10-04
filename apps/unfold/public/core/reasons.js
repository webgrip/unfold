import { money, plural } from './format.js';
import { failureReason, parseBudgetReason, parseStuckReason, closeReasonLabel, withdrawnReason } from './states.js';

export { parseBudgetReason, parseStuckReason, closeReasonLabel, withdrawnReason };

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
    sentence: 'The Shift’s budget had too little left to pay for another fix Round.',
    fix: 'Finish the work by hand, or raise the Team’s budget in its configuration.',
  },
  budget_exhausted: {
    chip: 'Budget ran out',
    sentence: 'The Shift’s budget could not pay for the next Round.',
    fix: 'Finish the work by hand, or raise the Team’s budget in its configuration.',
  },
  budget_held: {
    chip: 'Budget held, not spent',
    sentence: 'Ploeg stopped for lack of budget, but most of the budget was only held for Runs whose spend it had not settled yet, not spent.',
    fix: 'Find out why those Runs failed and fix that first. Raising the budget does not help while the money is only held.',
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
    sentence: 'The interactive Unfold session that drove this Work Item failed.',
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
    sentence: 'Ploeg stopped this Work Item without a reason Unfold recognises.',
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
    fix: 'Check that the task says what must change and where. If the change is already there, close the task.',
  },
  changes_unresolved: {
    sentence: 'Every planned Round ran and the last reviewer still asked for changes. This Team’s plan has no fix Rounds left.',
    fix: 'Read the reviewer’s findings. Finish the branch by hand, or sharpen the ticket.',
  },
};

const number = value => typeof value === 'number' && Number.isFinite(value);

const held = (spent, reserved) => number(spent) && number(reserved) && reserved > 0 && reserved >= spent;

const exactCodes = new Set(['plan_exhausted', 'fix_round_cap_reached', 'budget_exhausted_before_fix_round', 'writing_run_failed_repeatedly', 'writing_run_killed_repeatedly', 'operator_failed']);

function classify(closeReason) {
  const text = String(closeReason ?? '').trim();
  const lower = text.toLowerCase();
  if (exactCodes.has(text)) return { code: text, text };
  if (lower.startsWith('budget held by unsettled runs')) return { code: 'budget_held', text };
  if (lower.startsWith('budget exhausted')) {
    const { spent, reserved } = parseBudgetReason(text);
    return { code: held(spent, reserved) ? 'budget_held' : 'budget_exhausted', text };
  }
  if (lower.startsWith('run stuck:')) return { code: 'run_stuck', text };
  if (lower === 'plan removed from configuration') return { code: 'plan_removed', text };
  if (text === 'review_approved') return { code: 'pull_request_closed', text };
  return { code: 'unknown', text };
}

function sentenceFor(code, text, item, demo) {
  if (code === 'budget_exhausted') {
    const { pool, spent, reserved } = parseBudgetReason(text);
    if (pool !== null) return `The Shift’s budget of ${money(pool)} could not pay for the next Round${spent !== null && !demo ? ` (spent ${money(spent)}${reserved !== null ? `, reserved ${money(reserved)}` : ''})` : ''}.`;
  }
  if (code === 'budget_held') {
    const { pool, spent, reserved } = parseBudgetReason(text);
    if (pool !== null && /^budget held/i.test(text)) return `Ploeg stopped because the Shift’s ${money(pool)} budget is held, not spent: ${spent > 0 ? `only ${money(spent)} was spent, and ` : ''}${money(reserved)} is still held for finished Runs whose spend Ploeg could not settle within a day.`;
    if (pool !== null) return `Ploeg stopped because the Shift’s ${money(pool)} budget could not pay for the next Round, but ${spent > 0 ? `only ${money(spent)} was spent` : 'nothing was spent'}. ${money(reserved)} was held for Runs whose spend Ploeg had not settled yet.`;
  }
  if (code === 'run_stuck') {
    const { role, round } = parseStuckReason(text);
    if (role) return `The ${role} reported that it cannot finish${round ? ` in Round ${round}` : ''} without a person.`;
  }
  if (code === 'writing_run_killed_repeatedly' && number(item.infraFailures) && item.infraFailures > 0) return `Not the Work Item’s fault: the cluster stopped the writer ${item.infraFailures} ${item.infraFailures === 1 ? 'time' : 'times'} before it could finish, so the work was never really tried.`;
  if (code === 'unknown' && text) return /[.!?]$/.test(text) ? `Ploeg recorded: “${text}”` : `Ploeg recorded: “${text}”.`;
  return copy[code].sentence;
}

const reasonGlyphs = Object.freeze({
  plan_exhausted: 'pull-request',
  fix_round_cap_reached: 'eye',
  budget_exhausted: 'coins',
  budget_exhausted_before_fix_round: 'coins',
  budget_held: 'lock',
  writing_run_failed_repeatedly: 'x-circle',
  writing_run_killed_repeatedly: 'zap',
  run_stuck: 'pause-circle',
  plan_removed: 'settings',
  pull_request_closed: 'circle-slash',
  operator_failed: 'sessions',
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
    glyph: reasonGlyphs[code] || 'alert',
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
  if (['writing_run_failed_repeatedly', 'writing_run_killed_repeatedly', 'stale_attempts', 'stale_infrastructure', 'budget_held'].includes(reason.code)) return runs.find(run => run.writes && (run.outcome === 'failed' || run.failureReason)) || runs.find(run => run.outcome === 'failed' || run.failureReason) || null;
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
  let reason = listReason({ ...item, latestShift: shift }, { demo: Boolean(detail.demo) });
  if (!reason) return null;
  const event = (detail.events || []).find(entry => entry.action === `work_item.${item.state}` && entry.detail?.reason);
  let headline = event ? String(event.detail.reason) : null;
  const closeReason = shift?.closeReason ?? '';
  const run = relevantRun(detail, reason, closeReason);
  if (reason.code === 'writing_run_killed_repeatedly' && !(number(item.infraFailures) && item.infraFailures > 0)) {
    const killed = (detail.runs || []).filter(entry => entry.writes && (!shift?.id || entry.shiftId === shift.id) && failureReason(entry.failureReason)?.infra).length;
    if (killed > 1) reason = { ...reason, sentence: sentenceFor(reason.code, '', { ...item, infraFailures: killed }) };
  }
  if (budgetCodes.has(reason.code)) headline = null;
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
