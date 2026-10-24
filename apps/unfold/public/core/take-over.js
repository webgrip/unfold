import { escape } from './dom.js';
import { button, callout, iconButton } from './ui.js';
import { time } from './format.js';

/** The Harnesses whose Runs stop at a safe point when a person takes them over (Ploeg ADR-0142): every ACP profile. */
export const yieldingHarnesses = Object.freeze(['acp']);

/** Why a Run of each Harness that cannot yield cannot be taken over, in plain words (Ploeg ADR-0142). */
export const harnessRefusals = Object.freeze({
  'claude-code': 'Claude Code Runs cannot stop between steps yet.',
  'claude-environment': 'A Run in a Team’s Claude environment cannot stop between steps: Ploeg only follows it there.',
  openhands: 'OpenHands Runs cannot stop between steps, and that harness is retired.',
  exec: 'A command Run is not an agent, so it has no step to stop at.',
});

const harnessFallback = 'This Run’s harness cannot stop at a safe point.';
const instead = 'Cancel it instead, or wait for it to finish.';

/** The plain sentence for Runs of `harnesses` that cannot yield, each harness named once, or '' when every one can. */
export function harnessRefusal(harnesses) {
  const blocking = [...new Set((harnesses ?? []).filter(harness => harness && !yieldingHarnesses.includes(harness)))];
  if (!blocking.length) return '';
  return `${blocking.map(harness => harnessRefusals[harness] ?? `The ${harness} harness cannot stop at a safe point.`).join(' ')} ${instead}`;
}

/** What each refusal of a take-over or hand-back means, in plain words (Ploeg ADR-0142). */
export const takeOverRefusals = Object.freeze({
  nothing_running: 'Nothing of this Work Item is running now, so there is nothing to take over. Refresh to see where it stands.',
  run_client_carried: 'This Run already runs in its person’s own Claude Code, so it is theirs; Ploeg cannot stop it between steps.',
  yield_unsupported: `${harnessFallback} ${instead}`,
  take_over_pending: 'Someone already took this Work Item over. Refresh to see who holds it and where its work is.',
  shift_changed: 'Ploeg started another attempt since you looked. Refresh, then take it over again if you still want to.',
  operator_owned: 'A workbench session drives this Work Item. Take it over from that session instead.',
  command_conflict: 'Ploeg already took a different take-over under this command. Refresh to see where it stands.',
  person_forbidden: 'This Work Item acts for another person. Only they, or an administrator acting for them, can take it over.',
  taken_over_by_another: 'Another person took this Work Item over. Only they, or an administrator acting for them, can hand it back or restart it.',
});

/**
 * The plain sentence for one refusal code. For `yield_unsupported` it names each Harness Ploeg's own message names,
 * since Ploeg's message lists them; an unknown code answers ''.
 */
export function takeOverRefusal(code, message = '') {
  if (code === 'yield_unsupported') {
    const named = Object.keys(harnessRefusals).filter(harness => new RegExp(`(?:^|[^a-z-])${harness}(?:$|[^a-z-])`).test(String(message)));
    return named.length ? harnessRefusal(named) : takeOverRefusals.yield_unsupported;
  }
  return Object.hasOwn(takeOverRefusals, code) ? takeOverRefusals[code] : '';
}

const runningStates = new Set(['leased', 'active']);
const short = sha => String(sha ?? '').slice(0, 12);

/** The newest take-over of a Work Item as Ploeg reports it, or null when nobody took it over or Ploeg is older. */
export function takeOverOf(detail) {
  const entry = detail?.takeOver;
  return entry && typeof entry === 'object' && !Array.isArray(entry) && entry.state ? entry : null;
}

/**
 * The person a Work Item acts for, as far as Unfold can see it: who admitted it, or whom its waiting client-carried
 * Run acts for. Null when Unfold cannot tell, such as for tracker work whose user Ploeg maps itself; Ploeg then decides.
 */
export function actsFor(detail) {
  const admitted = (detail?.events ?? []).find(event => ['operator.work_item.admitted', 'work_item.admitted'].includes(event.action) && event.actor);
  return admitted?.actor || detail?.item?.waitingForClient?.actsFor || null;
}

/** The Runs of the open Shift that are running now. */
export function runningRuns(detail) {
  const open = (detail?.shifts ?? []).find(shift => !shift.closedAt);
  return (detail?.runs ?? []).filter(run => run.state === 'running' && (!open || !run.shiftId || String(run.shiftId) === String(open.id)));
}

/**
 * Whether the viewer may take control of a Work Item now, from its detail: null when the button has no place (nothing
 * runs, a take-over is under way, a viewer), otherwise whether it is enabled, the reason Ploeg would refuse when it
 * is not with its refusal `code`, and `actFor`, the person an administrator acts for when that is someone else.
 * @param {object} detail A `GET /api/ploeg/work-items/<id>` response.
 * @param {{ id?: string, role?: string } | null} viewer
 * @returns {{ enabled: boolean, code: ''|'demo'|'person_forbidden'|'yield_unsupported', reason: string, actFor: string | null, runs: object[], shiftId: string | null } | null}
 */
export function takeControlOffer(detail, viewer) {
  if (!viewer?.id || !viewer.role || viewer.role === 'viewer') return null;
  if (!runningStates.has(detail?.item?.state)) return null;
  const current = takeOverOf(detail);
  if (current && (current.state === 'yielding' || current.state === 'taken_over')) return null;
  const runs = runningRuns(detail);
  if (!runs.length) return null;
  const open = (detail.shifts ?? []).find(shift => !shift.closedAt);
  const base = { runs, shiftId: open ? String(open.id) : null, actFor: null };
  if (detail.demo) return { ...base, enabled: false, code: 'demo', reason: 'The demo runs no agents, so nothing can be taken over.' };
  const person = actsFor(detail);
  if (person && person !== viewer.id && viewer.role !== 'admin') return { ...base, enabled: false, code: 'person_forbidden', reason: `This Work Item acts for ${person}. Only they, or an administrator acting for them, can take it over.` };
  const harnesses = harnessRefusal(runs.map(run => run.harness));
  if (harnesses) return { ...base, enabled: false, code: 'yield_unsupported', reason: harnesses };
  return { ...base, enabled: true, code: '', reason: '', actFor: person && person !== viewer.id ? person : null };
}

/**
 * Whether the viewer may hand a taken-over Work Item back: null unless it is parked `taken_over` and the viewer can
 * change work; disabled with the reason when someone else holds it and the viewer is not an administrator.
 * @returns {{ enabled: boolean, reason: string, actFor: string | null } | null}
 */
export function handBackOffer(detail, viewer) {
  const current = takeOverOf(detail);
  if (!current || current.state !== 'taken_over' || detail?.item?.state !== 'needs_human') return null;
  if (!viewer?.id || !viewer.role || viewer.role === 'viewer') return null;
  if (detail.demo) return { enabled: false, reason: 'The demo restarts nothing.', actFor: null };
  if (current.by !== viewer.id && viewer.role !== 'admin') return { enabled: false, reason: `${current.by} took this over. Only they, or an administrator acting for them, can hand it back.`, actFor: null };
  return { enabled: true, reason: '', actFor: current.by !== viewer.id ? current.by : null };
}

/** The Claude Code command and the plain git commands that pick up a taken-over Work Item's branch. */
export function takeOverCommands(detail) {
  const current = takeOverOf(detail);
  const branch = current?.branch || '';
  const quoted = `'${branch.replace(/'/g, `'\\''`)}'`;
  return { plugin: `/unfold:takeover ${detail.item.id}`, git: branch ? `git fetch origin ${quoted} && git switch ${quoted}` : '' };
}

/** The take-over in words for the panel's title and the two-track view, from the viewer's point of view. */
export function takeOverWords(current, viewerId) {
  const who = current.by === viewerId ? 'You' : current.by;
  if (current.state === 'yielding') return 'Waiting for the Run to stop at a safe point';
  if (current.state === 'taken_over') return `${who} took control`;
  if (current.state === 'handed_back') return `${who} handed it back to Ploeg`;
  return 'The take-over ended before the Run stopped';
}

function commandRow(label, command) {
  return `<p class="field-label">${escape(label)}</p><p><code class="mono" data-private>${escape(command)}</code> ${button({ label: 'Copy', icon: 'copy', size: 'sm', action: 'work-copy-command', data: { value: command } })}</p>`;
}

function whereTheWorkIs(current) {
  const facts = [
    current.branch ? `Branch <code class="mono">${escape(current.branch)}</code>` : '',
    current.commit ? `head <code class="mono">${escape(short(current.commit))}</code>` : '',
    current.workInProgress ? `work in progress commit <code class="mono">${escape(short(current.workInProgress))}</code>` : '',
  ].filter(Boolean);
  const lost = current.pushed === false ? `<p class="meta" role="note">${escape(`The worker could not put the agent’s last changes on the forge${current.detail ? `: ${current.detail}` : '.'}`)}</p>` : '';
  return `${facts.length ? `<p>${facts.join(' · ')}</p>` : ''}${lost}`;
}

/**
 * The take-over panel of a Work Item: Take control while a Run runs (disabled with Ploeg's reason when it would
 * refuse), "Waiting for the Run to stop at a safe point" while it yields, and once it is parked for the person the
 * branch and commit, the commands that pick it up and Hand back with an optional note. Empty when there is nothing to
 * show. `result` is the last take-over or hand-back answer in this browser, shown when it failed.
 * @param {object} detail
 * @param {{ viewer: { id?: string, role?: string } | null, busy?: boolean, result?: { error?: string } | null }} options
 * @returns {string}
 */
export function takeOverMarkup(detail, { viewer, busy = false, result = null } = {}) {
  const current = takeOverOf(detail);
  const offer = takeControlOffer(detail, viewer);
  const back = handBackOffer(detail, viewer);
  const failed = result?.error ? `<p class="take-over-error" role="alert">${escape(result.error)}</p>` : '';
  const id = escape(detail.item.id);
  if (current?.state === 'yielding') {
    return `<section class="take-over" aria-label="Take control" data-state="yielding">${callout({ tone: 'live', icon: 'pause-circle', title: 'Waiting for the Run to stop at a safe point', body: `<p>${escape(`${current.by === viewer?.id ? 'You' : current.by} asked at ${time(current.requestedAt)}. The agent finishes the step it is on, at most two minutes for a tool call, then Ploeg commits what it left uncommitted to ${current.branch || 'the Work Item’s branch'} and parks the Work Item for ${current.by === viewer?.id ? 'you' : current.by}.`)}</p>` })}${failed}</section>`;
  }
  if (current?.state === 'taken_over') {
    const commands = takeOverCommands(detail);
    const form = back ? `<form class="take-over-hand-back" data-form="work-hand-back" data-id="${id}"${back.actFor ? ` data-act-for="${escape(back.actFor)}"` : ''}><label class="field-label" for="work-hand-back-note-${id}">Note for the next Run (optional)</label><textarea id="work-hand-back-note-${id}" name="note" rows="3" maxlength="4096" placeholder="What you changed and what Ploeg should do next"></textarea><p class="field-error" data-error-for="note" hidden></p><p class="meta">${escape('Ploeg resumes the Round that stopped on the same branch, from your latest commit, with the budget the attempt had left. Commit and push your changes first.')}</p>${button({ label: back.actFor ? `Hand back for ${back.actFor}` : 'Hand back', icon: 'undo', type: 'submit', size: 'sm', variant: 'primary', disabled: !back.enabled || busy, busy, title: back.enabled ? '' : back.reason })}${back.enabled ? '' : ` <span class="meta">${escape(back.reason)}</span>`}</form>` : '';
    return `<section class="take-over" aria-label="Take control" data-state="taken_over">${callout({ tone: 'attention', icon: 'terminal', title: takeOverWords(current, viewer?.id), body: `<p>${escape(`The Run stopped at a safe point${current.yieldedAt ? ` at ${time(current.yieldedAt)}` : ''}. Nothing runs until it is handed back.`)}</p>${whereTheWorkIs(current)}` })}${commandRow('In Claude Code, in a clone of the repository', commands.plugin)}${commands.git ? commandRow('Or with git', commands.git) : ''}${form}${failed}</section>`;
  }
  const history = current?.state === 'handed_back' ? `<p class="meta">${escape(`${takeOverWords(current, viewer?.id)}${current.handedBackAt ? ` at ${time(current.handedBackAt)}` : ''}; Ploeg continues on ${current.branch || 'the branch'}.`)}</p>`
    : current?.state === 'ended' ? `<p class="meta">${escape(`${takeOverWords(current, viewer?.id)}: the attempt closed another way first.`)}</p>` : '';
  if (!offer) return history || failed ? `<section class="take-over" aria-label="Take control" data-state="${escape(current?.state ?? 'idle')}">${history}${failed}</section>` : '';
  const lead = 'Stop the agent at its next safe point and finish the work yourself. Ploeg commits what the agent left uncommitted to the Work Item’s branch, so nothing it did is lost, and gives back what the Run did not spend.';
  const control = button({ label: offer.actFor ? `Take control for ${offer.actFor}` : 'Take control', icon: 'pause-circle', size: 'sm', action: 'work-take-control', data: { id: detail.item.id, ...(offer.shiftId ? { shift: offer.shiftId } : {}), ...(offer.actFor ? { actFor: offer.actFor } : {}) }, disabled: !offer.enabled || busy, busy, title: offer.enabled ? '' : offer.reason });
  return `<section class="take-over" aria-label="Take control" data-state="${offer.enabled ? 'offered' : 'refused'}"><p class="field-label">Take control</p><p class="meta">${escape(lead)}</p><p>${control}${offer.enabled ? '' : ` <span class="meta take-over-reason">${escape(offer.reason)}</span>`}</p>${history}${failed}</section>`;
}

/** The confirmation dialog for Take control: what stops, where the work goes and what it costs. */
export function takeControlDialogMarkup(detail, offer) {
  const branch = (detail.shifts ?? []).find(shift => !shift.closedAt)?.branch || detail.item.latestShift?.branch || 'the Work Item’s branch';
  const runs = offer.runs.map(run => `the ${run.role || 'agent'} Run`).join(', ');
  return `<form data-form="work-take-control" data-id="${escape(detail.item.id)}"${offer.shiftId ? ` data-shift="${escape(offer.shiftId)}"` : ''}${offer.actFor ? ` data-act-for="${escape(offer.actFor)}"` : ''} class="work-take-control-dialog" novalidate><header class="dialog-header"><h2 id="confirm-title">${escape(offer.actFor ? `Take control for ${offer.actFor}?` : 'Take control?')}</h2>${iconButton({ icon: 'x', label: 'Close', action: 'close-dialog' })}</header><div class="dialog-body"><p>${escape(`Ploeg asks ${runs} to stop at its next safe point, within about 20 seconds plus the tool call it may be finishing. The worker commits what the agent left uncommitted as one marked work in progress commit and pushes it to ${branch}, without forcing. If a pull request is open, that push updates it and may start its CI.`)}</p><p>${escape('The Work Item then waits for you. What the Run did not spend goes back to the attempt, and Hand back resumes the Round from your latest commit.')}</p></div><footer class="dialog-footer">${button({ label: 'Keep it running', action: 'close-dialog' })}${button({ label: 'Take control', icon: 'pause-circle', variant: 'primary', type: 'submit' })}</footer></form>`;
}

/**
 * The moments a take-over moved control on the two tracks, from Ploeg's record: `take-control` when the person asked
 * the Run to stop, and `hand-back` when they gave it back. `sessionId` is the person's first session that started on
 * the branch while they held it, so the mark sits on that session's lane too.
 * @returns {{ kind: 'take-control'|'hand-back', at: number, sessionId: string, runId?: string, from: 'people'|'ploeg', to: 'people'|'ploeg', label: string }[]}
 */
export function takeOverMarks(detail, sessions) {
  const current = takeOverOf(detail);
  const at = Date.parse(current?.requestedAt ?? '');
  if (!current || !Number.isFinite(at)) return [];
  const back = Date.parse(current.handedBackAt ?? '');
  const session = (sessions ?? []).filter(entry => { const start = Date.parse(entry.startedAt ?? ''); return Number.isFinite(start) && start >= at && (!Number.isFinite(back) || start <= back) && (!entry.branch || !current.branch || entry.branch === current.branch); }).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))[0];
  const who = session?.mine ? 'You' : current.by;
  const run = (detail.runs ?? []).find(entry => String(entry.shiftId ?? '') === String(current.shiftId) && entry.round === current.round) ?? null;
  const where = current.commit ? `; its work is ${short(current.commit)} on ${current.branch}` : current.state === 'yielding' ? '; waiting for the Run to stop at a safe point' : '';
  const marks = [{ kind: 'take-control', at, sessionId: session ? String(session.id) : '', ...(run ? { runId: String(run.id) } : {}), from: 'ploeg', to: 'people', label: `${who} took control of the ${run?.role || 'agent'} Run${where}` }];
  if (Number.isFinite(back)) marks.push({ kind: 'hand-back', at: back, sessionId: session ? String(session.id) : '', from: 'people', to: 'ploeg', label: `${who} handed it back to Ploeg on ${current.branch || 'the branch'}` });
  return marks;
}
