import { escape } from './dom.js';
import { icon } from './icons.js';
import { dateTime, percent, plural } from './format.js';
import * as ui from './ui.js';

/** How many open attributions one bug may have: more than that is a systemic bug, not a card's (Ploeg ADR-0052). */
export const maxCracksPerBug = 3;

/** The states an attribution passes through, with how the page names them. */
export const crackStates = Object.freeze({
  proposed: Object.freeze({ label: 'Proposed', tone: 'attention', glyph: 'help-circle', detail: 'Waits for a second person' }),
  confirmed: Object.freeze({ label: 'Confirmed', tone: 'danger', glyph: 'x-circle', detail: 'On the card' }),
  disputed: Object.freeze({ label: 'Disputed', tone: 'attention', glyph: 'alert', detail: 'Waits for a referee; it keeps counting' }),
  unlinked: Object.freeze({ label: 'Unlinked', tone: 'neutral', glyph: 'circle-slash', detail: 'A referee took it off the card' }),
  evolved: Object.freeze({ label: 'Requirement changed', tone: 'neutral', glyph: 'refresh', detail: 'No crack: the card evolved' }),
});

/** The severities triage sets, with what each means. */
export const severityChoices = Object.freeze([
  Object.freeze({ value: 'S1', label: 'S1 · critical', hint: 'Outage, data loss or a security hole.' }),
  Object.freeze({ value: 'S2', label: 'S2 · major', hint: 'A main flow is broken and has no workaround.' }),
  Object.freeze({ value: 'S3', label: 'S3 · minor', hint: 'Something is wrong but there is a workaround.' }),
  Object.freeze({ value: 'S4', label: 'S4 · cosmetic', hint: 'Looks wrong, works.' }),
]);

/** The rules of tracing a bug, in the order a person meets them. */
export const traceRules = Object.freeze([
  'A crack is an inquiry, not a verdict: it records that a bug came from an earlier change so the team can learn from it. It never scores a person.',
  'Ploeg only suggests candidates: earlier merged plays that touched the files this bug’s fix touched. It never cracks a card by itself.',
  'Usually the person who fixed the bug proposes the cause, with a severity and whether it was the primary or a contributing cause.',
  'Two people confirm: a second person who is neither the card’s steward nor the proposer confirms it. Only then does the card crack.',
  'The card’s steward can dispute a confirmed crack within five working days. The crack keeps counting until a referee who took no part decides, and that decision is final.',
  'When the requirement changed rather than the code being wrong, mark Requirement changed: the card is marked evolved and gets no crack.',
]);

const same = (a, b) => Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();
const allowed = () => ({ allowed: true, why: '' });
const refused = why => ({ allowed: false, why });

/**
 * Which steps `viewer` may take on one attribution, mirroring Ploeg's rules so the page offers only those. Ploeg stays
 * authoritative and refuses anything else. Each entry is `{ allowed, why }`; `why` says why not when it matters.
 * @param {object} crack An attribution from `GET /api/ploeg/work-items/:id/cracks`.
 * @param {{ login: string|null, canAct: boolean, reason: string }} viewer
 * @param {{ now?: number }} [options]
 */
export function crackSteps(crack, viewer, { now = Date.now() } = {}) {
  const none = refused(viewer?.reason || '');
  if (!viewer?.canAct || !viewer.login) return { confirm: none, dispute: none, resolve: none, evolved: none };
  const me = viewer.login;
  const steward = same(me, crack.steward);
  const proposer = same(me, crack.proposedBy);
  const confirm = crack.state !== 'proposed' ? refused('') : steward ? refused('You are this card’s steward, so someone else confirms.') : proposer ? refused('You proposed it, so a second person confirms.') : allowed();
  const closed = crack.disputeUntil && now > Date.parse(crack.disputeUntil);
  const dispute = crack.state !== 'confirmed' || crack.resolution ? refused('') : !steward ? refused('') : closed ? refused('The five working days to dispute this crack have passed.') : allowed();
  const involved = [crack.steward, crack.proposedBy, crack.confirmedBy?.[1], crack.disputedBy].some(person => same(me, person));
  const resolve = crack.state !== 'disputed' ? refused('') : involved ? refused('You took part in this crack, so someone else referees.') : allowed();
  const evolved = crack.state !== 'proposed' ? refused('') : steward ? refused('The steward does not decide that their own card evolved.') : allowed();
  return { confirm, dispute, resolve, evolved };
}

/**
 * Which steps `viewer` may take on a candidate play. The candidate does not name the card's steward, so the play's
 * merger stands in for it here; Ploeg checks the real steward.
 * @param {object} candidate A candidate from `GET /api/ploeg/work-items/:id/crack-candidates`.
 * @param {{ login: string|null, canAct: boolean, reason: string }} viewer
 * @param {number} open The bug's attributions that are proposed, confirmed or disputed.
 */
export function candidateSteps(candidate, viewer, open) {
  const none = refused(viewer?.reason || '');
  if (!viewer?.canAct || !viewer.login) return { propose: none, evolved: none, self: false };
  const self = same(viewer.login, candidate.mergedBy);
  if (candidate.attribution) return { propose: refused(''), evolved: refused(''), self };
  const propose = open >= maxCracksPerBug ? refused(`A bug cracks at most ${maxCracksPerBug} cards.`) : allowed();
  const evolved = self ? refused('You merged this play, so you are probably its steward: someone else decides that it evolved.') : allowed();
  return { propose, evolved, self };
}

const person = name => `<span class="trace-person">${escape(name)}</span>`;
const workLink = (item, fallback = 'Work Item') => `<a href="#work/${escape(item.workItemId)}">${escape(item.title || `${fallback} ${item.workItemId}`)}</a>${item.externalRef ? ` <span class="subtle mono">${escape(item.externalRef)}</span>` : ''}`;

function crackFacts(crack) {
  const parts = [];
  if (crack.severity) parts.push(severityChoices.find(choice => choice.value === crack.severity)?.label ?? crack.severity);
  if (crack.share) parts.push(crack.share === 'primary' ? 'primary cause' : 'contributing cause');
  if (crack.discovery) parts.push({ self: 'self-reported', discovered: 'found by someone else', concealed: 'concealed' }[crack.discovery] ?? crack.discovery);
  if (crack.play) parts.push(`play #${crack.play}`);
  return parts.join(' · ');
}

function crackHistory(crack, now) {
  const lines = [`Proposed by ${person(crack.proposedBy)} ${escape(dateTime(crack.proposedAt))}`];
  if (crack.confirmedBy?.length >= 2) lines.push(`Confirmed by ${person(crack.confirmedBy[1])} ${escape(dateTime(crack.confirmedAt))}`);
  if (crack.state === 'confirmed' && !crack.resolution && crack.disputeUntil) lines.push(now > Date.parse(crack.disputeUntil) ? 'The steward’s five working days to dispute have passed' : `The steward${crack.steward ? ` ${person(crack.steward)}` : ''} can dispute until ${escape(dateTime(crack.disputeUntil))}`);
  if (crack.disputedBy) lines.push(`Disputed by ${person(crack.disputedBy)} ${escape(dateTime(crack.disputedAt))}${crack.disputeReason ? `: “${escape(crack.disputeReason)}”` : ''}`);
  if (crack.resolvedBy) lines.push(`${crack.resolution === 'unlinked' ? 'Unlinked' : 'Upheld'} by referee ${person(crack.resolvedBy)} ${escape(dateTime(crack.resolvedAt))}`);
  if (crack.evolvedBy) lines.push(`Marked as a changed requirement by ${person(crack.evolvedBy)} ${escape(dateTime(crack.evolvedAt))}`);
  if (crack.mended) lines.push(`Mended in #${escape(crack.mended.pr)}${crack.mended.by ? ` by ${person(crack.mended.by)}` : ''}${crack.mended.bySteward ? ' (the steward)' : ''}${crack.mended.confirmedAt ? ', mend confirmed' : ', mend stands 30 days before it counts'}`);
  return lines;
}

function crackItem(crack, viewer, { now, side, busy }) {
  const meta = crackStates[crack.state] ?? crackStates.proposed;
  const steps = crackSteps(crack, viewer, { now });
  const data = { id: crack.id };
  const actions = [
    steps.confirm.allowed ? ui.button({ label: 'Confirm', icon: 'check', variant: 'primary', size: 'sm', action: 'trace-confirm', data }) : '',
    steps.dispute.allowed ? ui.button({ label: 'Dispute', icon: 'alert', variant: 'secondary', size: 'sm', action: 'trace-dispute', data }) : '',
    steps.resolve.allowed ? ui.button({ label: 'Resolve as referee', icon: 'shield', variant: 'secondary', size: 'sm', action: 'trace-resolve', data }) : '',
    steps.evolved.allowed ? ui.button({ label: 'Requirement changed', icon: 'refresh', variant: 'secondary', size: 'sm', action: 'trace-evolved', data: { card: crack.card.workItemId, bug: crack.bug.workItemId, crack: crack.id } }) : '',
  ].filter(Boolean);
  const why = [steps.confirm, steps.dispute, steps.resolve].map(step => step.why).filter(Boolean)[0] || '';
  const other = side === 'bug' ? crack.card : crack.bug;
  const heading = side === 'bug' ? `Caused by ${workLink(other, 'Work Item')}` : `Bug ${workLink(other, 'bug')}`;
  const steward = crack.steward ? ` · steward ${person(crack.steward)}` : '';
  return `<li class="trace-item" data-state="${escape(crack.state)}" id="trace-crack-${escape(crack.id)}"><div class="trace-item-head"><span class="trace-glyph" data-tone="${escape(meta.tone)}" aria-hidden="true">${icon(meta.glyph)}</span><div class="trace-item-text"><p class="trace-item-title">${heading}</p><p class="trace-item-meta">${ui.badge({ tone: meta.tone, label: meta.label, title: meta.detail, size: 'sm' })} ${escape(crackFacts(crack))}${steward}</p></div></div>${crack.note ? `<p class="trace-note">“${escape(crack.note)}”</p>` : ''}<ul class="trace-history">${crackHistory(crack, now).map(line => `<li>${line}</li>`).join('')}</ul>${actions.length ? `<div class="trace-actions"${busy ? ' aria-busy="true"' : ''}>${actions.join('')}</div>` : ''}${why && !actions.length ? `<p class="trace-why">${icon('info')}<span>${escape(why)}</span></p>` : ''}</li>`;
}

function candidateItem(candidate, viewer, open, fixFiles, bug) {
  const steps = candidateSteps(candidate, viewer, open);
  const data = { card: candidate.card.workItemId, play: candidate.play };
  const actions = [
    steps.propose.allowed ? ui.button({ label: 'Propose as cause', icon: 'plus', variant: 'primary', size: 'sm', action: 'trace-propose', data }) : '',
    steps.evolved.allowed ? ui.button({ label: 'Requirement changed', icon: 'refresh', variant: 'secondary', size: 'sm', action: 'trace-evolved', data: { card: candidate.card.workItemId, bug } }) : '',
  ].filter(Boolean);
  const state = candidate.attribution ? crackStates[candidate.attribution] : null;
  const shared = `${plural(candidate.sharedFiles, 'file')} of ${fixFiles} the fix touched (${percent(candidate.share)})`;
  const files = candidate.files.length ? `<details class="trace-files"><summary>${escape(plural(candidate.files.length, 'shared path'))}</summary><ul>${candidate.files.map(file => `<li class="mono">${escape(file)}</li>`).join('')}</ul></details>` : '';
  const why = steps.self && !candidate.attribution && steps.propose.allowed ? 'You merged this play, so you are probably its steward: Ploeg records your proposal as self-reported, which weighs half.' : steps.propose.why;
  return `<li class="trace-item trace-candidate" data-attribution="${escape(candidate.attribution ?? 'none')}"><div class="trace-item-head"><span class="trace-glyph" data-tone="${state ? escape(state.tone) : 'neutral'}" aria-hidden="true">${icon(state ? state.glyph : 'pull-request')}</span><div class="trace-item-text"><p class="trace-item-title">${workLink(candidate.card)}</p><p class="trace-item-meta">Play #${escape(candidate.play)} in ${escape(candidate.repo)}, merged ${escape(dateTime(candidate.mergedAt))}${candidate.mergedBy ? ` by ${person(candidate.mergedBy)}` : ''} · ${escape(shared)}${candidate.reverted ? ` ${ui.badge({ tone: 'danger', label: 'Reverted', size: 'sm', title: 'This play was reverted; a crack on it is at least S2.' })}` : ''}${state ? ` ${ui.badge({ tone: state.tone, label: `Already ${state.label.toLowerCase()}`, size: 'sm' })}` : ''}</p></div></div>${files}${actions.length ? `<div class="trace-actions">${actions.join('')}</div>` : ''}${why ? `<p class="trace-why">${icon('info')}<span>${escape(why)}</span></p>` : ''}</li>`;
}

/**
 * The "Trace this bug" panel on a Work Item page: Ploeg's candidate causes with Propose and Requirement changed, the
 * attributions on this bug with Confirm, Dispute and Resolve where the viewer may take them, the bugs already traced to
 * this Work Item as a card, and the rules. Empty when Ploeg sent neither candidates nor attributions, so a Work Item
 * that is not a bug shows nothing. `result` is the outcome of the last step, shown as a status message.
 * @param {{ workItemId: string, candidates: object|null, cracks: object[], viewer: object, demo: boolean }} trace
 * @param {{ now?: number, busy?: boolean, result?: { tone: string, title: string, text: string } | null }} [options]
 */
export function traceMarkup(trace, { now = Date.now(), busy = false, result = null } = {}) {
  if (!trace) return '';
  const id = trace.workItemId;
  const candidates = trace.candidates?.candidates ?? [];
  const asBug = trace.cracks.filter(crack => crack.bug.workItemId === id);
  const asCard = trace.cracks.filter(crack => crack.card.workItemId === id && crack.bug.workItemId !== id);
  if (!candidates.length && !asBug.length && !asCard.length) return '';
  const open = asBug.filter(crack => ['proposed', 'confirmed', 'disputed'].includes(crack.state)).length;
  const viewer = trace.viewer ?? { login: null, canAct: false, reason: '' };
  const isBug = candidates.length > 0 || asBug.length > 0;
  const title = isBug ? 'Trace this bug' : 'Bugs traced to this Work Item';
  const subtitle = 'A crack is an inquiry, not a verdict.';
  const parts = [];
  if (trace.demo) parts.push(ui.callout({ tone: 'neutral', icon: 'info', title: 'Demo', body: `<p>${escape('These candidates and attributions are sample data. The actions check Ploeg’s rules and record nothing.')}</p>` }));
  if (!viewer.canAct && viewer.reason) parts.push(ui.callout({ tone: 'attention', title: 'You can read this, not act on it', body: `<p>${escape(viewer.reason)}</p>` }));
  else if (viewer.login) parts.push(`<p class="trace-viewer">${icon('user')}<span>Ploeg knows you as <span class="mono">${escape(viewer.login)}</span>. It compares that with each card’s steward and proposer.</span></p>`);
  if (result) parts.push(`<div class="trace-result" id="work-trace-result" tabindex="-1" role="status">${ui.callout({ tone: result.tone, title: result.title, body: `<p>${escape(result.text)}</p>` })}</div>`);
  if (asBug.length) parts.push(`<section class="trace-group" aria-labelledby="work-trace-cracks"><h4 class="trace-group-title" id="work-trace-cracks">On this bug · ${escape(plural(asBug.length, 'attribution'))}${open >= maxCracksPerBug ? ' · limit reached' : ''}</h4><ol class="trace-list">${asBug.map(crack => crackItem(crack, viewer, { now, side: 'bug', busy })).join('')}</ol></section>`);
  if (candidates.length) {
    const window = trace.candidates.since && trace.candidates.until ? ` merged between ${dateTime(trace.candidates.since)} and ${dateTime(trace.candidates.until)}` : '';
    const truncated = trace.candidates.fixFilesTruncated ? ' The fix touched more files than Ploeg keeps, so the list may miss a cause.' : '';
    parts.push(`<section class="trace-group" aria-labelledby="work-trace-candidates"><h4 class="trace-group-title" id="work-trace-candidates">Candidates Ploeg found · ${escape(plural(candidates.length, 'play'))}</h4><p class="trace-hint">${escape(`Earlier plays of this Team${window} that touched a file this bug’s fix touched, most shared files first. A shared file is a lead, not proof.${truncated}`)}</p><ol class="trace-list">${candidates.map(candidate => candidateItem(candidate, viewer, open, trace.candidates.fixFiles, id)).join('')}</ol></section>`);
  }
  if (asCard.length) parts.push(`<section class="trace-group" aria-labelledby="work-trace-card"><h4 class="trace-group-title" id="work-trace-card">Bugs traced to this card · ${escape(plural(asCard.length, 'attribution'))}</h4><ol class="trace-list">${asCard.map(crack => crackItem(crack, viewer, { now, side: 'card', busy })).join('')}</ol></section>`);
  parts.push(ui.disclosure({ id: 'work-trace-rules', summary: 'How tracing a bug works', body: `<ol class="trace-rules">${traceRules.map(rule => `<li>${escape(rule)}</li>`).join('')}</ol>`, open: !asBug.length && !asCard.length }));
  return `<section class="card trace" id="work-trace" aria-labelledby="work-trace-title"${busy ? ' aria-busy="true"' : ''}><header class="card-header"><div class="card-heading"><h3 class="card-title" id="work-trace-title">${icon('search')}${escape(title)}</h3><p class="card-subtitle">${escape(subtitle)}</p></div></header><div class="card-body trace-body">${parts.join('')}</div></section>`;
}

const radios = (name, choices, { required = false, selected = '' } = {}) => `<div class="trace-choices" role="radiogroup" aria-labelledby="trace-${name}-label"${required ? ' aria-required="true"' : ''}>${choices.map(choice => `<label class="trace-choice"><input type="radio" name="${name}" value="${escape(choice.value)}"${choice.value === selected ? ' checked' : ''}><span><b>${escape(choice.label)}</b>${choice.hint ? `<small>${escape(choice.hint)}</small>` : ''}</span></label>`).join('')}</div>`;
const fieldset = (name, label, body, hint = '') => `<div class="field trace-field" data-field="${name}"><p class="field-label" id="trace-${name}-label">${escape(label)}</p>${body}${hint ? `<p class="field-hint">${escape(hint)}</p>` : ''}<p class="field-error" data-error-for="${name}" hidden></p></div>`;
const note = (label = 'Note', hint = 'Optional. At most 2000 characters; it is kept in Ploeg’s audit log.', required = false) => `<div class="field trace-field" data-field="${required ? 'reason' : 'note'}"><label class="field-label" for="trace-${required ? 'reason' : 'note'}">${escape(label)}</label><textarea id="trace-${required ? 'reason' : 'note'}" name="${required ? 'reason' : 'note'}" rows="3" maxlength="2000"${required ? ' required' : ''}></textarea><p class="field-hint">${escape(hint)}</p><p class="field-error" data-error-for="${required ? 'reason' : 'note'}" hidden></p></div>`;
const shareChoices = [{ value: 'primary', label: 'Primary cause', hint: 'This play is the main reason the bug exists.' }, { value: 'contributing', label: 'Contributing cause', hint: 'It made the bug possible or worse; another change is the main cause.' }];
const discoveryChoices = [{ value: 'discovered', label: 'Discovered', hint: 'Someone other than the card’s steward found it.' }, { value: 'concealed', label: 'Concealed', hint: 'The card’s steward merged this bug’s fix without linking it. Ploeg checks this.' }];
const demoLine = demo => demo ? `<p class="trace-demo">${icon('info')}<span>Demo: this checks Ploeg’s rules and records nothing.</span></p>` : '';

function dialogShell({ step, id, bug = '', title, lead, body, submit, variant = 'primary', demo }) {
  return `<form data-form="trace-step" data-step="${escape(step)}" data-id="${escape(id)}"${bug ? ` data-bug="${escape(bug)}"` : ''} class="trace-dialog" novalidate><header class="dialog-header"><h2 id="confirm-title">${escape(title)}</h2>${ui.iconButton({ icon: 'x', label: 'Close', action: 'close-dialog' })}</header><div class="dialog-body">${lead}${body}${demoLine(demo)}</div><footer class="dialog-footer">${ui.button({ label: 'Cancel', action: 'close-dialog' })}${ui.button({ label: submit, variant, type: 'submit' })}</footer></form>`;
}

/**
 * The dialog for one attribution step. `step` is propose, evolved, confirm, dispute or resolve; `target` is the
 * candidate (propose), the card to mark (evolved: `{ card, title, crack }`) or the attribution (the others).
 * @param {string} step
 * @param {object} target
 * @param {{ bug: { workItemId: string, title: string }, viewer: object, demo: boolean }} context
 */
export function stepDialogMarkup(step, target, { bug, viewer, demo = false } = {}) {
  const bugName = `<strong>${escape(bug?.title || 'this bug')}</strong>`;
  if (step === 'propose') {
    const self = same(viewer?.login, target.mergedBy);
    return dialogShell({
      step, id: target.card.workItemId, bug: bug?.workItemId, demo, title: 'Propose a cause', submit: 'Propose crack',
      lead: `<p>You propose that play #${escape(target.play)} of <strong>${escape(target.card.title)}</strong> caused ${bugName}. A second person who is neither the card’s steward nor you must confirm it before it reaches the card.</p>${self ? `<p class="trace-why">${icon('info')}<span>You merged this play, so you are probably its steward. Ploeg then records the proposal as self-reported, which weighs half.</span></p>` : ''}<input type="hidden" name="play" value="${escape(target.play)}">`,
      body: `${fieldset('severity', 'Severity', radios('severity', severityChoices, { required: true }), 'As triage set it. A reverted play is at least S2.')}${fieldset('share', 'Share', radios('share', shareChoices, { required: true, selected: 'primary' }))}${fieldset('discovery', 'How it was found', radios('discovery', discoveryChoices, { selected: 'discovered' }), 'Ploeg records self when the card’s steward proposes.')}${note('Note', 'Optional. Say what in the play caused the bug. At most 2000 characters; it is kept in Ploeg’s audit log.')}`,
    });
  }
  if (step === 'evolved') return dialogShell({
    step, id: target.card, bug: target.bug, demo, title: 'Requirement changed?', submit: 'Mark as changed requirement', variant: 'secondary',
    lead: `<p>${bugName} is no defect of <strong>${escape(target.title || `Work Item ${target.card}`)}</strong>: the requirement changed after it was accepted. The card is marked evolved and gets no crack.</p><p class="trace-hint">A proposed attribution becomes a changed requirement; a confirmed one cannot. The card’s steward cannot decide this for their own card.</p>${target.crack ? `<input type="hidden" name="crack" value="${escape(target.crack)}">` : ''}`,
    body: note(),
  });
  const facts = `<p class="trace-hint">${escape([target.severity ? severityChoices.find(choice => choice.value === target.severity)?.label : '', target.share ? `${target.share} cause` : '', `proposed by ${target.proposedBy}`].filter(Boolean).join(' · '))}</p>`;
  const card = `<strong>${escape(target.card.title)}</strong>`;
  if (step === 'confirm') return dialogShell({
    step, id: target.id, demo, title: 'Confirm this crack?', submit: 'Confirm crack',
    lead: `<p>You are the second person: you agree that ${card} caused ${bugName}. Once you confirm, the card cracks and its steward has five working days to dispute.</p>${facts}`,
    body: `${fieldset('severity', 'Severity', radios('severity', [{ value: '', label: `Keep ${target.severity ?? 'it'}` }, ...severityChoices.filter(choice => choice.value !== target.severity)], { selected: '' }), 'Correct it only when triage got it wrong.')}${fieldset('share', 'Share', radios('share', [{ value: '', label: `Keep ${target.share ?? 'it'}` }, ...shareChoices.filter(choice => choice.value !== target.share)], { selected: '' }))}${note()}`,
  });
  if (step === 'dispute') return dialogShell({
    step, id: target.id, demo, title: 'Dispute this crack?', submit: 'Dispute', variant: 'secondary',
    lead: `<p>You are the steward of ${card}. Say why ${bugName} did not come from it. A referee who took no part decides, and that decision is final. Until then the crack keeps counting.</p>${facts}`,
    body: note('Reason', 'Required. At most 2000 characters.', true),
  });
  return dialogShell({
    step: 'resolve', id: target.id, demo, title: 'Resolve this dispute', submit: 'Record decision',
    lead: `<p>The steward disputed that ${card} caused ${bugName}${target.disputeReason ? `: “${escape(target.disputeReason)}”` : '.'} As a referee who took no part, decide. The decision is final. If your team names referees, only they can resolve.</p>${facts}`,
    body: `${fieldset('resolution', 'Decision', radios('resolution', [{ value: 'upheld', label: 'Uphold', hint: 'The crack stands, confirmed again.' }, { value: 'unlinked', label: 'Unlink', hint: 'The crack comes off the card and stays in its history.' }], { required: true }))}${note()}`,
  });
}

/**
 * Checks a step dialog's fields before anything is sent and returns `{ body, errors }`: the request body, and per
 * field the message to show. Empty optional fields are left out.
 * @param {string} step
 * @param {Record<string, FormDataEntryValue>} data
 */
export function stepRequest(step, data) {
  const text = key => String(data[key] ?? '').trim();
  const errors = {};
  const body = {};
  if (step === 'propose') {
    if (!['S1', 'S2', 'S3', 'S4'].includes(text('severity'))) errors.severity = 'Choose a severity.';
    if (!['primary', 'contributing'].includes(text('share'))) errors.share = 'Choose primary or contributing.';
    Object.assign(body, { severity: text('severity'), share: text('share') });
    if (text('discovery')) body.discovery = text('discovery');
    if (Number(text('play')) > 0) body.play = Number(text('play'));
  }
  if (step === 'confirm') { if (text('severity')) body.severity = text('severity'); if (text('share')) body.share = text('share'); }
  if (step === 'dispute') { if (!text('reason')) errors.reason = 'Say why the bug did not come from this card.'; body.reason = text('reason'); }
  if (step === 'resolve') { if (!['upheld', 'unlinked'].includes(text('resolution'))) errors.resolution = 'Choose uphold or unlink.'; body.resolution = text('resolution'); }
  if (step !== 'dispute' && text('note')) body.note = text('note');
  for (const key of ['note', 'reason']) if (text(key).length > 2000) errors[key] = 'At most 2000 characters.';
  return { body, errors };
}

const outcomeWords = { proposed: 'proposed', confirmed: 'confirmed', disputed: 'disputed', unlinked: 'unlinked', evolved: 'marked as a changed requirement' };

/**
 * What the page says after a step: in the demo that nothing was recorded and what Ploeg would have recorded,
 * otherwise what Ploeg recorded.
 * @param {string} step
 * @param {{ crack: object, demo: boolean, message: string }} result
 */
export function stepOutcome(step, result) {
  const crack = result.crack;
  const what = `${crack.card.title} → ${crack.bug.title}`;
  const state = outcomeWords[crack.state] ?? crack.state;
  const upheld = step === 'resolve' && crack.resolution === 'upheld' ? 'upheld and confirmed again' : state;
  if (result.demo) return { tone: 'neutral', title: 'Demo · nothing recorded', text: `Ploeg would now record the attribution ${what} as ${upheld}. ${result.message}` };
  return { tone: crack.state === 'confirmed' ? 'danger' : crack.state === 'proposed' ? 'attention' : 'success', title: `Attribution ${upheld}`, text: `Ploeg recorded ${what} as ${upheld} under your forge login.` };
}
