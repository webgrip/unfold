import { clock, cx, escape, healthWarning } from './parts.js';

const verdictWords = Object.freeze({ on_track: 'on track', watch: 'watch', off_track: 'off track' });
const fieldWords = Object.freeze({ instructions: 'Instructions', skills: 'Skills', tools: 'Tools', hosts: 'Hosts' });

/**
 * Proposed actions the containment panel offers. None of them exists in Ploeg yet, so the buttons carry no
 * `data-action` and do nothing.
 * @type {ReadonlyArray<{ label: string, means: string }>}
 */
export const containmentActions = Object.freeze([
  Object.freeze({ label: 'Quarantine the Run', means: 'Stop the Run, keep its workspace for inspection and block its branch from review.' }),
  Object.freeze({ label: 'Revoke its model key', means: 'Revoke the Run’s gateway key so it cannot make another model call.' }),
  Object.freeze({ label: 'Mark as a false alarm', means: 'Record that a person looked and the Run was fine.' }),
]);

const adverse = judgement => judgement.health !== 'on_track';

/**
 * Whether the containment panel has anything to say: a tripwire hit, a change in the Run's rules, or an AI judge
 * verdict other than on track.
 * @param {object} model A `liveModel` result.
 * @returns {boolean}
 */
export function needsContainment(model) {
  return Boolean(model.guard?.signals.length || model.guard?.drift?.length || (model.judgements ?? []).some(adverse));
}

/**
 * The panel's headline: what to look at first, in words a person reads at a glance.
 * @param {object} model A `liveModel` result.
 * @returns {string}
 */
export function containmentHeadline(model) {
  const { signals = [], drift = null, source = null } = model.guard ?? {};
  const high = signals.find(signal => signal.severity === 'high');
  const judged = (model.judgements ?? []).filter(adverse).at(-1);
  if (source) return `Possible prompt injection at ${clock(source.at)}`;
  if (high) return `Possible break-out attempt at ${clock(high.at)}`;
  if (drift?.length) return 'Its rules changed after it started';
  if (judged) return `The AI judge says ${verdictWords[judged.health]} at ${clock(judged.at)}`;
  return `A call crossed a tripwire at ${clock(signals[0]?.at)}`;
}

const callOf = (model, id) => model.moves.flatMap(move => move.calls).find(call => call.id === id) ?? null;
const proposedTag = '<span class="lv-contain-proposed">Proposed</span>';

function block(title, body, { proposed = false, extra = '' } = {}) {
  return `<section class="${cx('lv-contain-block', extra)}"><h3 class="lv-contain-label">${escape(title)}${proposed ? ` ${proposedTag}` : ''}</h3>${body}</section>`;
}

function readBlock(model) {
  const source = model.guard?.source;
  if (!source) return '';
  const call = callOf(model, source.callId);
  const text = (call?.output || source.evidence).slice(0, 600);
  return block('What it read', `<p class="lv-contain-text">${escape(clock(source.at))} · ${escape(source.title)}${call?.input ? ` <code class="lv-contain-code">${escape(call.input)}</code>` : ''}</p><pre class="lv-contain-evidence" data-private><code>${escape(text)}</code></pre><p class="lv-contain-note">Shown as plain text. Unfold never follows what a transcript says.</p>`);
}

function triedBlock(model) {
  const source = model.guard?.source;
  const signals = (model.guard?.signals ?? []).filter(signal => signal !== source);
  if (!signals.length) return '';
  const rows = signals.map(signal => {
    const call = callOf(model, signal.callId);
    const what = call?.kind === 'edit' || call?.kind === 'delete' || call?.kind === 'move' ? (call.paths[0] ?? call.input) : call?.input ?? signal.evidence;
    return `<li class="${cx('lv-contain-signal', `is-${signal.severity}`, signal.blocked ? 'is-blocked' : '')}"><span class="lv-contain-time">${escape(clock(signal.at))}</span><span class="lv-contain-what"><span class="lv-contain-rule">${escape(signal.label)}</span><code class="lv-contain-code">${escape(what)}</code></span><span class="lv-contain-outcome">${signal.blocked ? 'Blocked' : 'Not blocked'}</span></li>`;
  }).join('');
  return block('What it tried next', `<ol class="lv-contain-signals">${rows}</ol><p class="lv-contain-note">Tripwires match patterns in the transcript. A match is a reason to look, not proof.</p>`);
}

function driftBlock(model) {
  const drift = model.guard?.drift;
  if (!drift?.length) return '';
  const rows = drift.map(change => `<div class="lv-contain-change"><dt>${escape(fieldWords[change.field] ?? change.field)}</dt>${change.removed.map(entry => `<dd class="lv-contain-removed"><span class="sr-only">removed </span><code>${escape(entry)}</code></dd>`).join('')}${change.added.map(entry => `<dd class="lv-contain-added"><span class="sr-only">added </span><code>${escape(entry)}</code></dd>`).join('')}</div>`).join('');
  return block('Rules that changed', `<dl class="lv-contain-drift">${rows}</dl><p class="lv-contain-note">Ploeg does not report rule snapshots yet; this compares the snapshot at the Run’s start with the one now.</p>`, { proposed: true });
}

function judgeBlock(model) {
  const list = model.judgements ?? [];
  if (!list.length) return '';
  const rows = list.map(entry => `<li class="${cx('lv-contain-judgement', `is-${entry.health}`)}"><span class="lv-contain-time">${escape(clock(entry.at))}</span><span class="lv-contain-what"><span class="lv-contain-verdict">AI · ${escape(verdictWords[entry.health])}</span><span class="lv-contain-text">${escape(entry.reason)}${entry.evidence.length ? ` (entries ${escape(entry.evidence.join(', '))})` : ''}</span></span></li>`).join('');
  return block('What the AI judge said', `<ol class="lv-contain-judgements">${rows}</ol><p class="lv-contain-note">The AI judge reads the Run only when the Team’s cards.health.judge flag is on. It only advises: it can raise the Run’s health, never lower it, and never stops the Run.</p>`);
}

/**
 * The containment panel: shown when a Run crossed a tripwire, its rules changed, or the AI judge said watch or off
 * track. It says what the Run read, what it tried next and whether each try was blocked (derived from the
 * transcript), which rules changed (proposed) and what the AI judge said, and offers proposed
 * actions as buttons that do nothing yet. Transcript text is rendered as inert text. Empty when there is nothing to say.
 * @param {object} model A `liveModel` result.
 * @param {{ level?: number }} [options] The heading level of the headline.
 * @returns {string}
 */
export function containmentPanel(model, { level = 2 } = {}) {
  if (!needsContainment(model)) return '';
  const id = `lv-contain-${escape(model.id)}`;
  const tone = model.guard.high || model.guard.drift?.length || (model.judgements ?? []).some(entry => entry.health === 'off_track') ? 'danger' : 'attention';
  const lede = healthWarning(model.health) ?? 'Nothing here stops the Run on its own.';
  const actions = containmentActions.map(action => `<button type="button" class="button secondary lv-contain-action" title="${escape(`Proposed: ${action.means}`)}" aria-describedby="${id}-proposed"><span class="button-label">${escape(action.label)}</span> ${proposedTag}</button>`).join('');
  return `<section class="${cx('lv-containment', `lv-tone-${tone}`)}" aria-labelledby="${id}-title"><header class="lv-contain-head"><p class="lv-overline">Containment</p><h${level} class="lv-contain-title" id="${id}-title">${escape(containmentHeadline(model))}</h${level}><p class="lv-contain-lede">${escape(lede)}</p></header><div class="lv-contain-grid">${readBlock(model)}${triedBlock(model)}${driftBlock(model)}${judgeBlock(model)}</div><div class="lv-contain-actions">${actions}<p class="lv-contain-note" id="${id}-proposed">Proposed: Ploeg cannot quarantine a Run, revoke its key or record a false alarm yet, so these buttons do nothing.</p></div></section>`;
}
