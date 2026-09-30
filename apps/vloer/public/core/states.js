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
  queued: ['Queued', 'neutral', 'circle', { description: 'Waiting for a worker of its Team.' }],
  leased: ['Running', 'live', 'activity', { live: true, description: 'An agent is working on it.' }],
  awaiting_review: ['Ready for review', 'review', 'pull-request', { heading: 'Ready for your review', description: 'A pull request is open and the agents are done.' }],
  needs_human: ['Needs you', 'attention', 'alert', { heading: 'Needs you', description: 'Ploeg stopped and will not retry by itself.' }],
  stale: ['Stopped retrying', 'severe', 'clock', { description: 'Ploeg gave up after repeated agent or infrastructure failures.' }],
  withdrawn: ['Withdrawn', 'neutral', 'stop', { description: 'A person took the mandate back.' }],
  done: ['Done', 'success', 'check-circle', { description: 'Finished: merged, no change needed, follow-up created, or a rejected proposal.' }],
});

/** Run states. */
export const runStates = table({
  pending: ['Pending', 'neutral', 'clock', { description: 'The Round opened; waiting for a worker of this Role.' }],
  running: ['Running', 'live', 'activity', { live: true, description: 'A worker claimed the Run.' }],
  finished: ['Finished', 'neutral', 'check', { description: 'The Run reported an outcome.' }],
});

/** Run outcomes (`work.Outcome`). */
export const runOutcomes = table({
  pr_opened: ['Opened a pull request', 'success', 'pull-request'],
  pr_updated: ['Updated the pull request', 'success', 'pull-request'],
  no_change_needed: ['No change needed', 'neutral', 'check'],
  follow_up_created: ['Created follow-up work', 'neutral', 'plus'],
  issue_updated: ['Updated the tracker item', 'neutral', 'tag'],
  stuck: ['Stuck', 'attention', 'alert'],
  failed: ['Failed', 'danger', 'x-circle'],
});

/** Agent review verdicts. An agent verdict is never a human review. `none` is a reading Run without an opinion. */
export const verdicts = table({
  approve: ['Agent review: approve', 'success', 'check-circle'],
  request_changes: ['Agent review: changes requested', 'attention', 'alert'],
  inconclusive: ['Agent review: inconclusive', 'neutral', 'circle'],
  none: ['No agent verdict', 'neutral', 'circle'],
});

/** Run failure reasons (`work.FailureReason`) with who to call and what to do next. `infra` failures do not use up agent attempts. */
export const failureReasons = table({
  infra_node: ['The machine ended the Run', 'severe', 'zap', { infra: true, owner: 'the cluster', action: 'It retries automatically. If it keeps happening, check the nodes and images.' }],
  infra_llm: ['The model gateway failed', 'severe', 'zap', { infra: true, owner: 'the model gateway', action: 'Check the gateway keys, quotas and provider status.' }],
  agent_error: ['The agent harness failed', 'danger', 'x-circle', { infra: false, owner: 'the agent configuration', action: 'Read the log tail in the Run’s stuck reason.' }],
  budget: ['The agent reached its token ceiling', 'danger', 'coins', { infra: false, owner: 'the ticket size or the Role’s cap', action: 'Split the ticket or raise the Role’s cap.' }],
  lease_lost: ['The worker lost its lease', 'severe', 'zap', { infra: true, owner: 'the cluster', action: 'It retries automatically.' }],
  timeout: ['The Run timed out', 'danger', 'clock', { infra: false, owner: 'the harness configuration', action: 'Split the ticket or raise the timeout.' }],
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

const kinds = { workItem: workItemStates, run: runStates, outcome: runOutcomes, verdict: verdicts, failure: failureReasons, session: sessionStatuses };
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

/** The meta of a Vloer session, reading a recorded review on a completed session as Accepted or Rejected. */
export function sessionStatus(session) {
  if (session?.status === 'completed' && session.review) return sessionStatuses[session.review.decision === 'accepted' ? 'accepted' : 'rejected'];
  return stateMeta(`session:${session?.status}`);
}

/** Whether a session waits on a person: it needs input, failed, was interrupted, or completed without a recorded review. */
export function sessionNeedsYou(session) {
  return ['waiting_input', 'failed', 'interrupted'].includes(session?.status) || (session?.status === 'completed' && !session.review);
}
