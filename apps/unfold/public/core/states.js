import { money, plural } from './format.js';

/**
 * The status tones. Accent blue is not a tone: it is reserved for interaction.
 * @typedef {'neutral' | 'live' | 'attention' | 'review' | 'success' | 'danger' | 'severe'} Tone
 */

/**
 * How one state reads everywhere: a label, a tone and an icon name. Status is never colour alone, so every
 * entry has a glyph and a label. `heading` is the group heading form, `live` marks running states (animated
 * dot where motion is allowed) and `description` says what the state means.
 * @typedef {object} StateMeta
 * @property {string} key
 * @property {string} label
 * @property {Tone} tone
 * @property {string} glyph
 * @property {string} [heading]
 * @property {string} [description]
 * @property {boolean} [live]
 */

/** Every tone, in the order the design system lists them. */
export const tones = Object.freeze(['neutral', 'live', 'attention', 'review', 'success', 'danger', 'severe']);

const table = (entries) => Object.freeze(Object.fromEntries(Object.entries(entries).map(([key, [label, tone, glyph, extra = {}]]) => [key, Object.freeze({ key, label, tone, glyph, ...extra })])));

/** Work Item states (`PloegState`). `done` is "Done", never "Merged": it also covers no-change outcomes and rejected proposals. */
export const workItemStates = table({
  proposed: ['Proposed', 'neutral', 'proposed', { heading: 'Proposed', description: 'An agent proposed this work; nothing runs until a person approves it.' }],
  ingested: ['Received', 'neutral', 'inbox', { description: 'Recorded from the tracker and not queued yet.' }],
  queued: ['Queued', 'neutral', 'circle-dashed', { description: 'Waiting for a worker of its Team.' }],
  leased: ['Running', 'live', 'circle-half', { live: true, description: 'An agent is working on it.' }],
  awaiting_review: ['Ready for review', 'review', 'pull-request', { heading: 'Ready for your review', description: 'A pull request is open and the agents are done.' }],
  needs_human: ['Needs you', 'attention', 'alert', { heading: 'Needs you', description: 'Ploeg stopped and will not retry by itself.' }],
  stale: ['Stopped retrying', 'severe', 'clock', { description: 'Ploeg gave up after repeated agent or infrastructure failures.' }],
  withdrawn: ['Withdrawn', 'neutral', 'circle-slash', { description: 'A person took the mandate back.' }],
  done: ['Done', 'success', 'check-circle', { description: 'Finished: merged, no change needed, follow-up created, or a rejected proposal.' }],
  rejected: ['Rejected', 'neutral', 'circle-slash', { description: 'A person rejected the proposal, so it never ran. Ploeg keeps it as Done.', derived: true }],
});

/**
 * The state key a Work Item is shown with: its Ploeg state, except that a Done proposal a person rejected reads
 * `rejected` (neutral), never a green Done, because it never ran. Rejection shows as the latest
 * `work_item.rejected` event when `events` are known, or, in a list without events, as a Done Ploeg proposal that
 * never opened a Shift or used an attempt. The data keeps the state `done`.
 * @param {{ state?: string, provider?: string, latestShift?: object|null, attempts?: number }} item
 * @param {{ action: string, id?: string }[]} [events]
 * @returns {string}
 */
export function displayState(item, events) {
  if (item?.state !== 'done') return item?.state ?? '';
  if (Array.isArray(events) && events.length) {
    const newest = [...events].sort((a, b) => { try { const x = BigInt(a.id), y = BigInt(b.id); return x < y ? 1 : x > y ? -1 : 0; } catch { return 0; } }).find(entry => /^work_item\.(done|rejected|approved)$/.test(entry.action));
    if (newest) return newest.action === 'work_item.rejected' ? 'rejected' : 'done';
  }
  return item.provider === 'ploeg' && !item.latestShift && !(item.attempts > 0) ? 'rejected' : 'done';
}

/** Run states. */
export const runStates = table({
  pending: ['Pending', 'neutral', 'clock', { description: 'The Round opened; waiting for a worker of this Role.' }],
  running: ['Running', 'live', 'activity', { live: true, description: 'A worker claimed the Run.' }],
  finished: ['Finished', 'neutral', 'check', { description: 'The Run reported an outcome.' }],
});

/** Run outcomes (`work.Outcome`). `short` is the label inside a Round ladder cell or a Run row, where space is tight. */
export const runOutcomes = table({
  pr_opened: ['Opened a pull request', 'success', 'pull-request', { short: 'PR opened' }],
  pr_updated: ['Updated the pull request', 'success', 'pull-request', { short: 'PR updated' }],
  no_change_needed: ['No change needed', 'neutral', 'check', { short: 'No change' }],
  follow_up_created: ['Created follow-up work', 'neutral', 'plus', { short: 'Follow-up created' }],
  issue_updated: ['Updated the tracker item', 'neutral', 'tag', { short: 'Tracker updated' }],
  stuck: ['Stuck', 'attention', 'alert', { short: 'Stuck' }],
  failed: ['Failed', 'danger', 'x-circle', { short: 'Failed' }],
});

/**
 * Agent review verdicts. An agent verdict is never a human review. `none` is a reading Run without an opinion.
 * `short` is the label inside a reviewer's own cell or row, where the Role already says it is an agent.
 */
export const verdicts = table({
  approve: ['Agent review: approve', 'success', 'check-circle', { short: 'Agent approved' }],
  request_changes: ['Agent review: changes requested', 'attention', 'alert', { short: 'Agent asked for changes' }],
  inconclusive: ['Agent review: inconclusive', 'neutral', 'circle', { short: 'Inconclusive' }],
  none: ['No agent verdict', 'neutral', 'circle', { short: 'No verdict' }],
});

/**
 * Run failure reasons (`work.FailureReason`). `owner` and `action` say who to call and what to do; `cause` names what
 * failed in a few words, `retries` marks the failures Ploeg retries by itself while the Work Item is still live, and
 * `next` is the step for a person once it has stopped retrying. `infra` failures do not use up agent attempts.
 */
export const failureReasons = table({
  infra_node: ['The machine ended the Run', 'severe', 'zap', { infra: true, owner: 'the cluster', action: 'It retries automatically. If it keeps happening, check the nodes and images.', cause: 'Infrastructure, not the agent', retries: true, next: 'If it keeps happening, check the nodes and images.' }],
  infra_llm: ['The model gateway failed', 'severe', 'zap', { infra: true, owner: 'the model gateway', action: 'Check the gateway keys, quotas and provider status.', cause: 'The model gateway, not the agent', retries: true, next: 'Check the gateway keys, quotas and provider status.' }],
  agent_error: ['The agent harness failed', 'danger', 'x-circle', { infra: false, owner: 'the agent configuration', action: 'Read the log tail in the Run’s stuck reason.', cause: 'The agent harness exited with an error', retries: false, next: 'Read its log tail. Fix the brief, the model or the harness.' }],
  budget: ['The agent reached its token ceiling', 'danger', 'coins', { infra: false, owner: 'the ticket size or the Role’s cap', action: 'Split the ticket or raise the Role’s cap.', cause: 'The ticket is too big for the Role’s token ceiling', retries: false, next: 'Split the ticket or raise the Role’s cap.' }],
  lease_lost: ['The worker stopped responding', 'severe', 'zap', { infra: true, owner: 'the cluster', action: 'It retries automatically.', cause: 'Infrastructure, not the agent', retries: true, next: 'If it keeps happening, check the nodes and the network.' }],
  timeout: ['The Run timed out', 'danger', 'clock', { infra: false, owner: 'the harness configuration', action: 'Split the ticket or raise the timeout.', cause: 'The harness time limit', retries: false, next: 'Split the ticket or raise the timeout.' }],
  idle: ['The agent went silent', 'danger', 'clock', { infra: false, owner: 'the agent harness', action: 'Read the log tail to see where it stopped.', cause: 'The harness printed nothing and made no model call for its idle timeout', retries: false, next: 'Read its log tail. A hung command or an unanswered prompt is the usual cause. Raising the idle timeout only delays the stop.' }],
});

const stoppedResponding = Object.freeze({ ...failureReasons.agent_error, label: 'The agent stopped responding', glyph: 'clock', owner: 'the agent harness', action: 'Read the last lines it printed to see where it stopped.', cause: 'The agent stopped responding', next: 'Its reason names the watchdog that stopped it. A hung command or a long silent model call is the usual cause.', outputLabel: 'Last lines it printed' });
const watchdogSummary = /^acp (?:agent stopped responding|idle watchdog stopped the agent|prompt wall stopped the agent)\b/;
const stderrPart = /(?:^| \| )stderr: /;

/**
 * The failure meta of a Run, or null when it did not fail. A Run whose summary says an ACP watchdog stopped it reads
 * as an agent that stopped responding; every other Run reads as its `failureReason`, whose key it keeps.
 * @param {{ failureReason?: string | null, summary?: string | null }} run
 * @returns {object | null}
 */
export function runFailure(run) {
  if (!run?.failureReason) return null;
  if (run.failureReason === 'agent_error' && watchdogSummary.test(run.summary || '')) return stoppedResponding;
  return failureReason(run.failureReason);
}

/**
 * A failed Run's stuck reason split for display. When its failure meta labels the agent's output, `output` is the
 * stderr tail and `reason` the rest; otherwise `reason` is the whole stuck reason and `output` is empty.
 * @param {{ failureReason?: string | null, summary?: string | null, stuckReason?: string | null }} run
 * @returns {{ reason: string, output: string, outputLabel: string }}
 */
export function runFailureText(run) {
  const text = run?.stuckReason || '';
  const label = runFailure(run)?.outputLabel || '';
  const match = label ? stderrPart.exec(text) : null;
  if (!label) return { reason: text, output: '', outputLabel: '' };
  if (!match) return { reason: text, output: '', outputLabel: label };
  return { reason: text.slice(0, match.index), output: text.slice(match.index + match[0].length), outputLabel: label };
}

/**
 * One plain sentence about a failed Run: its cause, whether Ploeg still retries it (only while `live`, that is while
 * the Work Item is not stopped), and the next step. Takes a failure reason or a meta from `runFailure`. Returns ''
 * when the Run did not fail.
 * @param {string | object | null | undefined} key
 * @param {{ live?: boolean }} [options]
 * @returns {string}
 */
export function failureNote(key, { live = true } = {}) {
  const meta = key && typeof key === 'object' ? key : failureReason(key);
  if (!meta) return '';
  const cause = meta.cause || meta.label;
  return [`Cause: ${cause[0].toLowerCase()}${cause.slice(1)}.`, meta.retries && live ? 'Ploeg retries it automatically.' : '', meta.next || ''].filter(Boolean).join(' ');
}

/** Checkpoint phases a Run writes while it works (`checkpoints[].phase`). The demo writes `review`. */
export const checkpointPhases = table({
  branch_created: ['Created the branch', 'neutral', 'branch'],
  progress: ['Reported progress', 'live', 'activity'],
  pr_opened: ['Opened a pull request', 'success', 'pull-request'],
  pr_updated: ['Updated the pull request', 'success', 'pull-request'],
  reviewed: ['Reviewed the change', 'review', 'eye'],
  review: ['Reviewed the change', 'review', 'eye'],
});

const workspacePhases = Object.freeze({
  preparing: 'Preparing the workspace',
  scheduling: 'Finding a machine',
  capacity: 'Waiting for a free machine',
  creating: 'Downloading the workspace image',
  image_unavailable: 'Workspace image unavailable',
  container_error: 'Workspace container cannot start',
  cloning: 'Cloning the repository',
  starting: 'Starting OpenCode',
  connecting: 'Connecting to the workspace',
});
const workspaceProblems = new Set(['capacity', 'image_unavailable', 'container_error']);

/** Short label for a workspace start-up phase (`workspace.waiting` events, Status page waits). */
export function workspacePhaseLabel(phase) { return workspacePhases[phase] ?? workspacePhases.preparing; }

/** Whether a workspace start-up phase is a wait that does not resolve by itself. */
export function workspacePhaseProblem(phase) { return workspaceProblems.has(phase); }

const executionStates = Object.freeze({
  admitted: 'Ploeg admitted this execution',
  running: 'Ploeg marked this execution running',
  waiting_input: 'Ploeg is holding this execution for your answer',
  pause_requested: 'Ploeg is pausing this execution',
  paused: 'Ploeg paused this execution',
  cancel_requested: 'Ploeg is cancelling this execution',
  cancelled: 'Ploeg cancelled this execution',
  completed: 'Ploeg recorded this execution as completed',
  failed: 'Ploeg recorded this execution as failed',
  interrupted: 'Ploeg recorded this execution as interrupted',
});

/** One line for an `execution.authority` event: the Ploeg execution state, and who supervises it. */
export function executionStateText(binding) {
  const text = executionStates[binding?.state] ?? 'Ploeg updated this execution';
  return binding?.supervision === 'background' ? `${text} · runs in the background` : text;
}

/** Unfold session statuses, plus `accepted` and `rejected` for a completed session whose review was recorded. */
export const sessionStatuses = table({
  queued: ['Ready to start', 'neutral', 'circle'],
  running: ['Working', 'live', 'activity', { live: true }],
  exporting: ['Preparing review', 'live', 'activity', { live: true }],
  waiting_input: ['Needs your input', 'attention', 'alert'],
  paused: ['Paused', 'neutral', 'pause-circle'],
  interrupted: ['Interrupted', 'severe', 'zap'],
  completed: ['Ready for your review', 'review', 'eye'],
  accepted: ['Accepted', 'success', 'check-circle'],
  rejected: ['Rejected', 'neutral', 'x'],
  failed: ['Failed', 'danger', 'x-circle'],
  cancelled: ['Cancelled', 'neutral', 'stop'],
});

/** Run card states (Ploeg's card `state`). "Merged" here names a merged pull request, which a card state is about; a Work Item stays "Done". */
export const cardStates = table({
  drafting: ['Drafting', 'neutral', 'circle-dashed', { description: 'No pull request yet.' }],
  in_review: ['In review', 'review', 'pull-request', { description: 'A pull request is open.' }],
  merged: ['Merged', 'success', 'check-circle', { description: 'The latest pull request was merged.' }],
  closed: ['Closed unmerged', 'neutral', 'x-circle', { description: 'The latest pull request was closed without a merge, and the Work Item is not done.' }],
  withdrawn: ['Withdrawn', 'neutral', 'circle-slash', { description: 'A person took the mandate back.' }],
});

/** Pull request states on a Run card's plays. */
export const playStates = table({
  open: ['Open', 'review', 'pull-request'],
  merged: ['Merged', 'success', 'check-circle'],
  closed: ['Closed unmerged', 'neutral', 'x-circle'],
});

/** Combined commit status at a pull request's head, and the state of each check. */
export const ciStates = table({
  success: ['CI passed', 'success', 'check-circle', { short: 'Passed' }],
  failure: ['CI failed', 'danger', 'x-circle', { short: 'Failed' }],
  error: ['CI errored', 'danger', 'alert', { short: 'Error' }],
  pending: ['CI running', 'live', 'clock', { short: 'Pending' }],
});

/** A person's review on the forge. Never an agent verdict: those are `verdicts`. */
export const humanReviews = table({
  approved: ['Approved', 'success', 'check-circle'],
  changes_requested: ['Changes requested', 'attention', 'alert'],
  commented: ['Commented', 'neutral', 'circle'],
});

const kinds = { workItem: workItemStates, run: runStates, outcome: runOutcomes, verdict: verdicts, failure: failureReasons, session: sessionStatuses, checkpoint: checkpointPhases, card: cardStates, play: playStates, ci: ciStates, review: humanReviews };
const lookupOrder = ['workItem', 'run', 'outcome', 'verdict', 'session'];
const humanize = key => { const words = String(key ?? '').replaceAll('_', ' ').trim(); return words ? words[0].toUpperCase() + words.slice(1) : 'Unknown'; };

/**
 * Returns the meta for `key`. Prefix the key with its kind to disambiguate (`'session:queued'`, `'run:running'`,
 * `'outcome:failed'`, `'verdict:approve'`, `'failure:infra_node'`); without a prefix, Work Item states win, then
 * Run states, outcomes, verdicts and session statuses. An unknown key gets a humanized neutral label.
 * @param {string} key
 * @returns {StateMeta}
 */
export function stateMeta(key) {
  const text = String(key ?? '');
  const colon = text.indexOf(':');
  const kind = colon > 0 ? text.slice(0, colon) : '';
  const name = colon > 0 ? text.slice(colon + 1) : text;
  if (Object.hasOwn(kinds, kind)) return Object.hasOwn(kinds[kind], name) ? kinds[kind][name] : Object.freeze({ key: name, label: humanize(name), tone: 'neutral', glyph: 'circle' });
  for (const each of lookupOrder) if (Object.hasOwn(kinds[each], text)) return kinds[each][text];
  return Object.freeze({ key: text, label: humanize(text), tone: 'neutral', glyph: 'circle' });
}

/** The meta of a Work Item state. */
export function workItemState(key) { return stateMeta(`workItem:${key}`); }
/** The meta of a Run state. */
export function runState(key) { return stateMeta(`run:${key}`); }
/** The meta of a Run outcome, or null when the Run reported none. */
export function runOutcome(key) { return key ? stateMeta(`outcome:${key}`) : null; }
/** The meta of an agent verdict; an empty verdict is "No agent verdict". */
export function verdict(key) { return stateMeta(`verdict:${key || 'none'}`); }
/** The meta of a Run failure reason, or null when the Run did not fail. */
export function failureReason(key) { return key ? stateMeta(`failure:${key}`) : null; }

/** The meta of a Run card state; an unknown state is humanized and neutral. */
export function cardState(key) { return stateMeta(`card:${key}`); }
/** The meta of a pull request state on a Run card. */
export function playState(key) { return stateMeta(`play:${key}`); }
/** The meta of a CI state, or null when no status was captured. */
export function ciState(key) { return key ? stateMeta(`ci:${key}`) : null; }
/** The meta of a person's forge review. */
export function humanReview(key) { return stateMeta(`review:${key}`); }

/** The meta of a checkpoint phase; an unknown phase is humanized. */
export function checkpointPhase(key) { return stateMeta(`checkpoint:${key}`); }

/** The meta of an Unfold session, reading a recorded review on a completed session as Accepted or Rejected. */
export function sessionStatus(session) {
  if (session?.status === 'completed' && session.review) return sessionStatuses[session.review.decision === 'accepted' ? 'accepted' : 'rejected'];
  return stateMeta(`session:${session?.status}`);
}

/** Whether a session waits on a person: it needs input, failed without its Work Item being closed, was interrupted, or completed without a recorded review. */
export function sessionNeedsYou(session) {
  if (session?.status === 'failed' && session.workItemClosedAt) return false;
  return ['waiting_input', 'failed', 'interrupted'].includes(session?.status) || (session?.status === 'completed' && !session.review);
}

const trackerNames = { vikunja: 'Vikunja', forgejo: 'Forgejo', github: 'GitHub', gitlab: 'GitLab', clickup: 'ClickUp', gitea: 'Gitea', demo: 'Demo tracker' };
const event = (label, tone = 'neutral', glyph = 'circle', detail = '') => Object.freeze({ label, tone, glyph, detail });
const words = text => String(text ?? '').replaceAll('_', ' ').trim();
const role = detail => (typeof detail?.role === 'string' && detail.role.trim()) ? detail.role.trim() : 'An agent';
const capital = text => text ? text[0].toUpperCase() + text.slice(1) : text;
const sentence = text => { const value = String(text ?? '').trim(); return value ? value[0].toUpperCase() + value.slice(1) : ''; };
const isAmount = value => typeof value === 'number' && Number.isFinite(value);
const outcomeEvents = { pr_opened: 'Opened a pull request', pr_updated: 'Updated the pull request', no_change_needed: 'Reported no change needed', follow_up_created: 'Created follow-up work', issue_updated: 'Updated the tracker item', stuck: 'Reported that it is stuck', failed: 'Run failed' };

/**
 * Reads `budget exhausted: pool P, spent S, reserved R` or `budget held by unsettled runs: pool P, spent S, held H`
 * into numbers; `reserved` is R or H, and missing parts are null.
 */
export function parseBudgetReason(text) {
  const read = name => { const match = new RegExp(`${name}\\s+(-?\\d+(?:\\.\\d+)?)`, 'i').exec(String(text ?? '')); return match ? Number(match[1]) : null; };
  return { pool: read('pool'), spent: read('spent'), reserved: read('reserved') ?? read('held') };
}

/** Reads `run stuck: <role> round <n>` into the Role and Round; missing parts are null. */
export function parseStuckReason(text) {
  const match = /^run stuck:\s*(.*?)(?:\s+round\s+(\d+))?\s*$/i.exec(String(text ?? '').trim());
  if (!match) return { role: null, round: null };
  return { role: match[1] || null, round: match[2] ? Number(match[2]) : null };
}

const closeLabels = {
  review_approved: ['An agent reviewer approved', 'success'],
  plan_exhausted: ['Every planned Round ran', 'neutral'],
  review_failed: ['No agent reviewed it: the reviewer kept failing', 'attention'],
  fix_round_cap_reached: ['The fix Rounds ran out', 'attention'],
  budget_exhausted_before_fix_round: ['The budget ran out before a fix Round', 'attention'],
  writing_run_failed_repeatedly: ['The writer kept failing', 'danger'],
  writing_run_killed_repeatedly: ['The cluster kept stopping the writer', 'severe'],
  withdrawn_unassigned: ['The task was unassigned from the Team', 'neutral'],
  withdrawn_closed: ['The task was closed before any Run started', 'neutral'],
  withdrawn_by_operator: ['An operator cancelled it', 'neutral'],
  operator_adopted: ['An Unfold session took it over', 'neutral'],
  operator_completed: ['The Unfold session completed it', 'neutral'],
  operator_cancelled: ['The Unfold session was cancelled', 'neutral'],
  operator_failed: ['The Unfold session failed', 'danger'],
  operator_admission_expired: ['The Unfold session never started', 'neutral'],
};

/**
 * A Shift close reason in a few plain words, for Shift rows and audit lines: `plan_exhausted` reads "Every planned
 * Round ran", the `budget exhausted: …` and `run stuck: <role> round <n>` prefixes read as sentences (a budget stop
 * with more held than spent reads "held, not spent"), an empty
 * reason is an open Shift and anything else is quoted as Ploeg wrote it.
 * @param {string | null | undefined} closeReason
 * @returns {string}
 */
export function closeReasonLabel(closeReason) {
  return closeReasonMeta(closeReason).label;
}

/** The label and tone of a Shift close reason; see closeReasonLabel. */
export function closeReasonMeta(closeReason) {
  const text = String(closeReason ?? '').trim();
  if (!text) return { label: 'Still open', tone: 'neutral' };
  if (Object.hasOwn(closeLabels, text)) return { label: closeLabels[text][0], tone: closeLabels[text][1] };
  const lower = text.toLowerCase();
  if (lower.startsWith('budget held by unsettled runs')) { const { pool } = parseBudgetReason(text); return { label: pool !== null ? `The ${money(pool)} budget is still held, not spent` : 'The budget is still held, not spent', tone: 'attention' }; }
  if (lower.startsWith('budget exhausted')) {
    const { pool, spent, reserved } = parseBudgetReason(text);
    if (isAmount(spent) && isAmount(reserved) && reserved > 0 && reserved >= spent) return { label: pool !== null ? `The ${money(pool)} budget was held, not spent` : 'The budget was held, not spent', tone: 'attention' };
    return { label: pool !== null ? `The ${money(pool)} budget ran out` : 'The budget ran out', tone: 'attention' };
  }
  if (lower.startsWith('run stuck:')) { const { role: who, round } = parseStuckReason(text); return { label: who ? `The ${who} got stuck${round ? ` in Round ${round}` : ''}` : 'An agent got stuck', tone: 'attention' }; }
  if (lower === 'plan removed from configuration') return { label: 'The Team plan was removed', tone: 'attention' };
  return { label: `Ploeg recorded: “${text}”`, tone: 'neutral' };
}

/**
 * Why a withdrawn Work Item was withdrawn, from its Shift close reason or the `work_item.withdrawn` event reason.
 * Returns null for a reason Unfold does not recognise.
 * @param {string | null | undefined} code
 * @returns {string | null}
 */
export function withdrawnReason(code) {
  const text = String(code ?? '').trim();
  return text.startsWith('withdrawn_') && Object.hasOwn(closeLabels, text) ? `${closeLabels[text][0]}.` : null;
}

/**
 * Who acted on a Ploeg audit event, in the one form every page uses: `team:<t>` is an agent ("Agent · <t>"),
 * `ploegd:*` is "Ploeg", `webhook:<tracker>` the tracker, and `operator:<consumer>:<user>` is "You" for `userId`
 * and "An operator" otherwise. `kind` (agent, system, tracker or person) keeps agents from reading as people.
 * @param {string} actor
 * @param {{ userId?: string }} [options]
 * @returns {{ name: string, kind: 'agent' | 'system' | 'tracker' | 'person', glyph: string, title: string, team: string }}
 */
export function auditActor(actor, { userId } = {}) {
  const text = String(actor ?? '').trim();
  const [kind, ...rest] = text.split(':');
  const tail = rest.join(':');
  if (!text) return { name: 'Ploeg', kind: 'system', glyph: 'layers', title: 'Ploeg', team: '' };
  if (kind === 'team' && tail) return { name: `Agent · ${tail}`, kind: 'agent', glyph: 'bot', title: `An agent of the ${tail} Team`, team: tail };
  if (kind === 'ploegd') return { name: 'Ploeg', kind: 'system', glyph: 'layers', title: `Ploeg${tail ? ` (${words(tail).replaceAll('-', ' ')})` : ''}`, team: '' };
  if (kind === 'webhook' && tail) { const name = trackerNames[rest[0]] || capital(rest[0]); return { name, kind: 'tracker', glyph: 'tag', title: `${name}, through its webhook`, team: '' }; }
  if (kind === 'operator' && rest.length) {
    const id = rest.length > 1 ? rest.slice(1).join(':') : rest[0];
    const through = rest.length > 1 ? rest[0] : 'Unfold';
    if (userId && id === String(userId)) return { name: 'You', kind: 'person', glyph: 'user', title: `You, through ${through}`, team: '' };
    return { name: 'An operator', kind: 'person', glyph: 'user', title: `Operator ${id}, through ${through}`, team: '' };
  }
  if (text === 'demo-fixture') return { name: 'Demo', kind: 'system', glyph: 'circle', title: 'Illustrative demo record', team: '' };
  return { name: text, kind: 'system', glyph: 'circle', title: text, team: '' };
}

/** The name of an audit actor; see auditActor. */
export function actorName(actor, options = {}) {
  return auditActor(actor, options).name;
}

/**
 * How a Ploeg audit event reads on every page: a plain label, a tone, a glyph and a `detail` line built from the
 * `detail` fields the operator API keeps (`reason`, `round`, `role`, `writes`, `phase`, `authorizedUsd`,
 * `infraFailures`). Unknown actions are humanized, never dropped.
 * @param {{ action: string, detail?: Record<string, unknown> }} entry
 * @returns {{ label: string, tone: import('./states.js').Tone, glyph: string, detail: string }}
 */
export function auditEvent(entry) {
  const action = String(entry?.action ?? '');
  const detail = entry?.detail && typeof entry.detail === 'object' ? entry.detail : {};
  const reason = typeof detail.reason === 'string' ? detail.reason.trim() : '';
  const round = Number.isInteger(detail.round) && detail.round > 0 ? ` ${detail.round}` : '';
  const access = detail.writes === true ? 'writer' : detail.writes === false ? 'reader' : '';
  const authorized = isAmount(detail.authorizedUsd) && detail.authorizedUsd > 0 ? `Up to ${money(detail.authorizedUsd)} authorized` : '';
  const failures = isAmount(detail.infraFailures) ? `${plural(detail.infraFailures, 'infrastructure failure')} so far` : '';
  const said = sentence(reason);
  switch (action) {
    case 'work_item.queued': return event(reason ? 'Queued again' : 'Queued', 'neutral', 'circle-dashed', said);
    case 'work_item.refreshed': return event('The tracker task changed', 'neutral', 'refresh', said);
    case 'work_item.proposed': return event('Proposed by an agent', 'neutral', 'proposed', said);
    case 'work_item.approved': return event('Approved', 'success', 'check', said);
    case 'work_item.rejected': return event('Rejected', 'neutral', 'circle-slash', said);
    case 'work_item.withdrawn': return event('Withdrawn', 'neutral', 'circle-slash', withdrawnReason(reason) || said);
    case 'work_item.leased': return event('Running', 'live', 'runs', said);
    case 'work_item.needs_human': return event('Needs you', 'attention', 'alert', said);
    case 'work_item.awaiting_review': return event('Ready for your review', 'review', 'pull-request', said);
    case 'work_item.done': return event('Done', 'success', 'check-circle', reason === 'pull request merged' ? 'The pull request was merged' : said);
    case 'work_item.stale': return event('Stopped retrying', 'severe', 'clock', said);
    case 'created_work_item.accepted': return event('Created follow-up work', 'neutral', 'plus', said);
    case 'created_work_item.rejected': return event('Proposed work was refused by policy', 'neutral', 'x', said);
    case 'follow_up.created': return event('Follow-up created from the forge', 'neutral', 'plus', said);
    case 'follow_up.skipped': return event('Follow-up skipped', 'neutral', 'minus', said);
    case 'review.changes_requested': return event('Changes requested on the pull request', 'attention', 'alert', said);
    case 'round.opened': return event(`Round${round} started`, 'neutral', 'play', said);
    case 'round.reopened': return event(`Round${round} retried after a failed writer`, 'severe', 'refresh', said);
    case 'run.claimed': return event(`${capital(role(detail))} started${round ? ` Round${round}` : ''}${access ? ` as ${access}` : ''}`, 'live', 'play', authorized);
    case 'run.expired': return event(`${capital(role(detail))} stopped responding`, 'severe', 'zap', said);
    case 'shift.closed': { const meta = closeReasonMeta(reason); return event('Shift closed', reason ? meta.tone : 'neutral', 'stop', reason ? meta.label : ''); }
    case 'lease.acquired': return event('A worker took the Work Item', 'live', 'play', said);
    case 'lease.expired': return event('Worker stopped responding · Ploeg retries', 'severe', 'zap', failures);
    case 'infra_cap': return event('Infrastructure kept failing; Ploeg stopped', 'severe', 'zap', failures);
    case 'checkpoint.written': return event(detail.phase ? (Object.hasOwn(checkpointPhases, detail.phase) ? checkpointPhases[detail.phase].label : `Checkpoint: ${words(detail.phase)}`) : 'Wrote a checkpoint', 'neutral', Object.hasOwn(checkpointPhases, detail.phase ?? '') ? checkpointPhases[detail.phase].glyph : 'branch', said);
    case 'operator.admitted': return event('An Unfold session took over', 'neutral', 'sessions', said);
    case 'operator.admission_expired': return event('The Unfold session never started', 'neutral', 'clock', said);
    case 'delivery.candidate_admitted': return event('Delivery candidate admitted', 'neutral', 'inbox', said);
    case 'delivery.verification_recorded': return event('Verification recorded', 'neutral', 'check', said);
    case 'delivery.approved': return event('Delivery approved', 'success', 'check-circle', said);
    case 'delivery.publication_published': return event('Published to the forge', 'success', 'pull-request', said);
    case 'delivery.publication_unknown': return event('Publication result unknown', 'attention', 'alert', said);
    case 'llm.reserved': return event('Budget reserved for a Run', 'neutral', 'coins', authorized);
    case 'llm.minting': return event('Model key requested', 'neutral', 'lock', said);
    case 'llm.issued': return event('Model key issued', 'neutral', 'lock', said);
    case 'llm.observed': return event('Model spend observed', 'neutral', 'coins', said);
    case 'llm.unknown': return event('Spend could not be settled', 'attention', 'alert', said);
    case 'llm.reconciled': return event('Spend settled', 'neutral', 'coins', said);
    case 'llm.blocked': return event('Model key blocked', 'neutral', 'lock', said);
    case 'llm.unissued_blocked': return event('Unused model key blocked', 'neutral', 'lock', said);
    default: break;
  }
  if (action.startsWith('outcome.')) { const key = action.slice(8); const meta = runOutcome(key); return event(outcomeEvents[key] || `Reported ${meta.label.toLowerCase()}`, meta.tone, meta.glyph, said); }
  if (action.startsWith('delivery.publication_')) return event(`Publication ${words(action.slice('delivery.publication_'.length))}`, 'neutral', 'pull-request', said);
  if (action.startsWith('llm.')) return event(`Model key ${words(action.slice(4))}`, 'neutral', 'lock', said);
  if (action.startsWith('delivery.')) return event(`Delivery: ${words(action.slice(9))}`, 'neutral', 'send', said);
  const [head, ...rest] = action.split('.');
  return event(head ? `${capital(words(head))}${rest.length ? `: ${words(rest.join('.'))}` : ''}` : 'Event', 'neutral', 'circle', said);
}

/**
 * What a finished Run that reported no outcome reads as: "Cancelled before it started" when Ploeg closed it before a
 * worker picked it up (it finished without a start time, or its summary starts with `cancelled:`), otherwise "No
 * outcome reported".
 * @param {{ startedAt?: string | null, summary?: string }} run
 * @returns {StateMeta}
 */
export function unreportedOutcome(run) {
  const cancelled = !run?.startedAt && (run?.state === 'finished' || /^cancelled\b/i.test(String(run?.summary ?? '').trim()));
  return cancelled ? Object.freeze({ key: 'cancelled', label: 'Cancelled before it started', tone: 'neutral', glyph: 'circle-slash' }) : Object.freeze({ key: 'none', label: 'No outcome reported', tone: 'neutral', glyph: 'circle-slash' });
}

/**
 * The detail lines of the Work Item and Run stat tiles, shared by Now and Insights so a tile says the same thing on
 * both pages. `running` and `pending` are Run counts.
 */
export const tileDetail = Object.freeze({
  review: () => 'Pull requests to read',
  needsYou: () => 'Stopped until a person acts',
  proposed: () => 'Waiting for approval',
  queued: queued => queued === 0 ? 'Nothing waits to start' : 'Waiting for a worker',
  running: ({ running, pending }) => {
    const working = isAmount(running) && running > 0 ? `${plural(running, 'Run')} working` : '';
    const waiting = isAmount(pending) && pending > 0 ? `${pending} waiting for a worker` : '';
    return [working, waiting].filter(Boolean).join(' · ') || 'Nothing is working';
  },
});
