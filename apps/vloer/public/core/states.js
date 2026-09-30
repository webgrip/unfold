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
});

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
  request_changes: ['Agent review: changes requested', 'attention', 'alert', { short: 'Changes requested' }],
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
  lease_lost: ['The worker lost its lease', 'severe', 'zap', { infra: true, owner: 'the cluster', action: 'It retries automatically.', cause: 'Infrastructure, not the agent', retries: true, next: 'If it keeps happening, check the nodes and the network.' }],
  timeout: ['The Run timed out', 'danger', 'clock', { infra: false, owner: 'the harness configuration', action: 'Split the ticket or raise the timeout.', cause: 'The harness time limit', retries: false, next: 'Split the ticket or raise the timeout.' }],
});

/**
 * One plain sentence about a failed Run: its cause, whether Ploeg still retries it (only while `live`, that is while
 * the Work Item is not stopped), and the next step. Returns '' when the Run did not fail.
 * @param {string | null | undefined} key
 * @param {{ live?: boolean }} [options]
 * @returns {string}
 */
export function failureNote(key, { live = true } = {}) {
  const meta = failureReason(key);
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

/** Vloer session statuses, plus `accepted` and `rejected` for a completed session whose review was recorded. */
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

const kinds = { workItem: workItemStates, run: runStates, outcome: runOutcomes, verdict: verdicts, failure: failureReasons, session: sessionStatuses, checkpoint: checkpointPhases };
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

/** The meta of a checkpoint phase; an unknown phase is humanized. */
export function checkpointPhase(key) { return stateMeta(`checkpoint:${key}`); }

/** The meta of a Vloer session, reading a recorded review on a completed session as Accepted or Rejected. */
export function sessionStatus(session) {
  if (session?.status === 'completed' && session.review) return sessionStatuses[session.review.decision === 'accepted' ? 'accepted' : 'rejected'];
  return stateMeta(`session:${session?.status}`);
}

/** Whether a session waits on a person: it needs input, failed, was interrupted, or completed without a recorded review. */
export function sessionNeedsYou(session) {
  return ['waiting_input', 'failed', 'interrupted'].includes(session?.status) || (session?.status === 'completed' && !session.review);
}

const trackerNames = { vikunja: 'Vikunja', forgejo: 'Forgejo', github: 'GitHub', gitlab: 'GitLab', clickup: 'ClickUp', demo: 'the demo tracker' };
const withdrawals = { withdrawn_unassigned: 'the task was unassigned from the Team', withdrawn_closed: 'the task was closed before any Run started', withdrawn_by_operator: 'an operator cancelled it' };
const event = (label, tone = 'neutral', glyph = 'circle') => Object.freeze({ label, tone, glyph });
const words = text => String(text ?? '').replaceAll('_', ' ').trim();
const role = detail => (typeof detail?.role === 'string' && detail.role.trim()) ? detail.role.trim() : 'An agent';
const capital = text => text ? text[0].toUpperCase() + text.slice(1) : text;

/**
 * Names the actor of a Ploeg audit event in plain words: `team:<t>` is "Team <t>", `ploegd:*` is "Ploeg",
 * `webhook:<tracker>` is the tracker, `operator:<consumer>:<user>` is "You" for `userId` and "An operator"
 * otherwise. Anything else is returned as written.
 * @param {string} actor
 * @param {{ userId?: string }} [options]
 * @returns {string}
 */
export function actorName(actor, { userId } = {}) {
  const text = String(actor ?? '').trim();
  if (!text) return 'Ploeg';
  const [kind, ...rest] = text.split(':');
  if (kind === 'team' && rest.length) return `Team ${rest.join(':')}`;
  if (kind === 'ploegd') return 'Ploeg';
  if (kind === 'webhook' && rest.length) return capital(trackerNames[rest[0]] || rest[0]);
  if (kind === 'operator') return userId && rest[rest.length - 1] === String(userId) ? 'You' : 'An operator';
  if (text === 'demo-fixture') return 'Demo';
  return text;
}

/**
 * How a Ploeg audit event reads: a plain label, a tone and a glyph, from its `action` and the `detail` fields the
 * operator API keeps (`reason`, `round`, `role`, `writes`, `phase`, `authorizedUsd`, `infraFailures`).
 * Unknown actions are humanized, never dropped.
 * @param {{ action: string, detail?: Record<string, unknown> }} entry
 * @returns {{ label: string, tone: import('./states.js').Tone, glyph: string }}
 */
export function auditEvent(entry) {
  const action = String(entry?.action ?? '');
  const detail = entry?.detail && typeof entry.detail === 'object' ? entry.detail : {};
  const round = Number.isInteger(detail.round) ? ` ${detail.round}` : '';
  const access = detail.writes === true ? 'writer' : detail.writes === false ? 'reader' : '';
  switch (action) {
    case 'work_item.queued': return event(detail.reason ? 'Queued again' : 'Queued', 'neutral', 'circle-dashed');
    case 'work_item.refreshed': return event('The tracker task changed', 'neutral', 'refresh');
    case 'work_item.proposed': return event('An agent proposed this work', 'neutral', 'proposed');
    case 'work_item.approved': return event('Approved', 'success', 'check');
    case 'work_item.rejected': return event('Rejected', 'neutral', 'x');
    case 'work_item.withdrawn': return event(withdrawals[detail.reason] ? `Withdrawn: ${withdrawals[detail.reason]}` : 'Withdrawn', 'neutral', 'circle-slash');
    case 'work_item.needs_human': return event('Stopped: needs you', 'attention', 'alert');
    case 'work_item.awaiting_review': return event('Ready for your review', 'review', 'pull-request');
    case 'work_item.done': return event(detail.reason === 'pull request merged' ? 'Done: the pull request was merged' : 'Done', 'success', 'check-circle');
    case 'work_item.stale': return event('Stopped retrying', 'severe', 'clock');
    case 'created_work_item.accepted': return event('Created follow-up work', 'neutral', 'plus');
    case 'created_work_item.rejected': return event('Proposed work was refused by policy', 'neutral', 'x');
    case 'follow_up.created': return event('Follow-up created from the forge', 'neutral', 'plus');
    case 'follow_up.skipped': return event('Follow-up skipped', 'neutral', 'minus');
    case 'review.changes_requested': return event('Changes requested on the pull request', 'attention', 'alert');
    case 'round.opened': return event(`Round${round} started`, 'neutral', 'play');
    case 'round.reopened': return event(`Round${round} retried after a failed writer`, 'severe', 'refresh');
    case 'run.claimed': return event(`${capital(role(detail))} started${round ? ` Round${round}` : ''}${access ? ` as ${access}` : ''}`, 'live', 'play');
    case 'run.expired': return event(`${capital(role(detail))} stopped checking in`, 'severe', 'zap');
    case 'shift.closed': return event('Shift closed', 'neutral', 'stop');
    case 'lease.acquired': return event('An agent claimed the Work Item', 'live', 'play');
    case 'lease.expired': return event('The worker was lost; Ploeg retries later', 'severe', 'zap');
    case 'infra_cap': return event('Infrastructure failed too often; Ploeg stopped', 'severe', 'zap');
    case 'checkpoint.written': return event(detail.phase ? checkpointPhase(detail.phase).label : 'Wrote a checkpoint', 'neutral', detail.phase ? checkpointPhase(detail.phase).glyph : 'branch');
    case 'operator.admitted': return event('A Vloer session took over', 'neutral', 'sessions');
    case 'operator.admission_expired': return event('The Vloer session never started', 'neutral', 'clock');
    case 'llm.reserved': return event('Budget reserved for a Run', 'neutral', 'coins');
    case 'llm.unknown': return event('Spend could not be settled', 'attention', 'coins');
    case 'llm.reconciled': return event('Spend settled', 'neutral', 'coins');
    case 'llm.blocked': case 'llm.unissued_blocked': return event('Model key blocked', 'neutral', 'lock');
    default: break;
  }
  if (action.startsWith('outcome.')) { const meta = runOutcome(action.slice(8)); return event(`Reported: ${meta.label.toLowerCase()}`, meta.tone, meta.glyph); }
  if (action.startsWith('llm.')) return event(`Model key ${words(action.slice(4))}`, 'neutral', 'lock');
  if (action.startsWith('delivery.')) return event(`Delivery: ${words(action.slice(9).replace('.', ' '))}`, 'neutral', 'send');
  return event(capital(words(action.replace('.', ' '))) || 'Event', 'neutral', 'circle');
}
