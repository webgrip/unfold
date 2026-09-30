import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { $, escape } from '../core/dom.js';
import { money } from '../core/format.js';
import { button, demoNote, disclosure, dl, iconButton } from '../core/ui.js';
import { singleKeyAllowed } from '../core/keys.js';

const round2 = value => Math.round(value * 100) / 100;

function modelHint(models, id) {
  const first = state.bootstrap.models[0];
  const model = models.find(item => item.id === (id || first?.id));
  if (!model) return '';
  const tiers = model.tiers ? Object.entries(model.tiers).map(([tier, target]) => { const resolved = models.find(item => item.modelId === target); return `${tier.toLowerCase()} → ${target}${resolved?.provider ? ` (${resolved.provider})` : ''}`; }).join(' · ') : '';
  return `${id ? '' : 'Crew default: '}${escape(model.modelId)}${model.provider && !model.tiers ? ` · served by ${escape(model.provider)}` : ''}${tiers ? ` · router: ${escape(tiers)}` : ''}${model.providers?.length && model.tiers ? ` · providers: ${model.providers.map(escape).join(', ')}` : ''}`;
}

async function loadModels() {
  if (state.models) return;
  try { state.models = (await api('/api/models')).models; } catch { state.models = []; }
  const hint = document.querySelector('[data-model-hint]'); const select = document.querySelector('[data-model-select]');
  if (hint && select) hint.innerHTML = modelHint(state.models, select.value) || 'The crew’s own model.';
}

function prepare(dialog, size) {
  dialog.className = `dialog session-dialog${size ? ` ${size}` : ''}`;
  dialog.addEventListener('close', () => dialog.classList.remove('session-dialog'), { once: true });
  return dialog;
}

function open(dialog, focus) {
  dialog.showModal();
  const target = focus && dialog.querySelector(focus);
  if (target) target.focus();
}

function header(id, title, closable = true) {
  return `<header class="dialog-header"><h2 id="${id}">${escape(title)}</h2>${closable ? iconButton({ icon: 'x', label: 'Close', action: 'close-dialog' }) : ''}</header>`;
}

function field({ id, label, control, hint, error = true }) {
  const described = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return `<div class="field"><label class="field-label" for="${id}">${escape(label)}</label>${control(`id="${id}"${described ? ` aria-describedby="${described}"` : ''}`)}${hint ? `<p class="field-hint" id="${id}-hint">${hint}</p>` : ''}${error ? `<p class="field-error" id="${id}-error" data-error-for="${id}" hidden></p>` : ''}</div>`;
}

function select(name, items, selected, extra = '') {
  return attrs => `<select ${attrs} name="${name}"${extra}>${items.map(item => `<option value="${escape(item.id)}"${item.id === selected ? ' selected' : ''}>${escape(item.name)}</option>`).join('')}</select>`;
}

/**
 * Marks the field `id` of an open dialog form invalid with `message`, or clears it when `message` is empty.
 * Returns the field so the caller can focus it.
 * @param {HTMLFormElement} form
 * @param {string} id
 * @param {string} [message]
 * @returns {HTMLElement|null}
 */
export function fieldError(form, id, message = '') {
  const control = form.querySelector(`#${id}`);
  const error = form.querySelector(`[data-error-for="${id}"]`);
  if (control) { if (message) control.setAttribute('aria-invalid', 'true'); else control.removeAttribute('aria-invalid'); }
  if (error) { error.textContent = message; error.hidden = !message; }
  return control;
}

/** Opens the new-session dialog, prefilled with the demonstration brief in demo mode. */
export function openNew() {
  const dialog = prepare($('#new-session'), 'lg');
  const demo = state.bootstrap.mode === 'demo';
  const bootstrap = state.bootstrap;
  const placements = bootstrap.placements || [];
  const placement = placements.length > 1 ? field({ id: 'new-placement', label: 'Workspace placement', control: select('placement', placements, placements.find(item => item.default)?.id || placements[0].id), hint: 'Where the crew’s workspace runs.', error: false }) : '';
  void loadModels();
  const budget = Math.min(5, bootstrap.maxBudgetUsd);
  dialog.innerHTML = `<form data-form="new" novalidate>${header('new-title', 'New session')}<div class="dialog-body"><p class="session-dialog-lead">Give a crew an objective it can finish and evidence you can check. You review the result before anything leaves the workbench.</p>${demo ? demoNote('Demo sessions always run the rounding fixture: real Git changes and checks, no model calls and no spend.') : ''}${field({ id: 'new-title-input', label: 'Title', control: attrs => `<input ${attrs} name="title" maxlength="160" autocomplete="off" placeholder="Fix the order total rounding regression" value="${demo ? 'Fix order total rounding' : ''}" required>` })}${field({ id: 'new-objective', label: 'Objective and acceptance criteria', control: attrs => `<textarea ${attrs} name="objective" rows="5" maxlength="16000" placeholder="What should change? What evidence will show it works?" required>${demo ? 'Reproduce the rounding regression in the order service. Apply a minimal fix, keep the tests intact, and have an independent reviewer inspect the patch and rerun the checks.' : ''}</textarea>`, hint: 'Name the change and the evidence that proves it. A few words is not a brief: the crew would spend your budget guessing.' })}<div class="session-dialog-grid">${field({ id: 'new-repository', label: 'Repository', control: select('repositoryId', bootstrap.repositories, bootstrap.repositories[0]?.id), error: false })}${field({ id: 'new-crew', label: 'Crew', control: select('crewId', bootstrap.crews, bootstrap.crews[0]?.id), error: false })}${field({ id: 'new-budget', label: 'Session budget · USD', control: attrs => `<input ${attrs} name="budgetUsd" type="number" inputmode="decimal" min="0.01" max="${bootstrap.maxBudgetUsd}" step="0.01" value="${budget}" required>`, hint: `Across every role; at most ${escape(money(bootstrap.maxBudgetUsd))}. Only an administrator can add more later.` })}</div>${disclosure({ id: 'new-advanced', summary: 'Runtime, model and approval', body: `<div class="session-dialog-advanced"><div class="session-dialog-grid">${field({ id: 'new-runtime', label: 'Runtime', control: select('runtime', bootstrap.runtimes, bootstrap.runtimes[0]?.id), error: false })}${placement}${field({ id: 'new-model', label: 'Model', control: attrs => `<select ${attrs} name="model" data-model-select><option value="">Crew default</option>${bootstrap.models.map(model => `<option value="${escape(model.id)}">${escape(model.name)}</option>`).join('')}</select>`, hint: `<span data-model-hint>${state.models ? modelHint(state.models, '') || 'The crew’s own model.' : 'Checking routes at the gateway…'}</span>`, error: false })}</div><div class="session-choice"><input type="checkbox" id="new-approval" name="approval" value="auto" aria-describedby="new-approval-hint"><div><label class="field-label" for="new-approval">Approve tool use automatically</label><p class="field-hint" id="new-approval-hint">Only in a container or pod. Questions from the crew still reach you.</p></div></div></div>` })}</div><footer class="dialog-footer">${button({ label: 'Cancel', action: 'close-dialog' })}${button({ label: 'Create session', icon: 'arrow', variant: 'primary', type: 'submit' })}</footer></form>`;
  open(dialog, '#new-title-input');
}

/**
 * Opens the confirmation dialog and runs `callback` when the person confirms. `tone: 'danger'` styles the
 * confirm button as destructive and puts focus on the safe button; `details` lists consequences.
 * @param {string} title
 * @param {string} description
 * @param {string} label The confirm button.
 * @param {() => unknown} callback
 * @param {{ tone?: 'primary' | 'danger', dismiss?: string, details?: string[] }} [options]
 */
export function confirmAction(title, description, label, callback, { tone = 'primary', dismiss = 'Cancel', details = [] } = {}) {
  const dialog = prepare($('#confirm-dialog'), 'sm');
  const danger = tone === 'danger';
  dialog.innerHTML = `<form method="dialog">${header('confirm-title', title, false)}<div class="dialog-body"><p>${escape(description)}</p>${details.length ? `<ul class="session-dialog-list">${details.map(item => `<li>${escape(item)}</li>`).join('')}</ul>` : ''}</div><footer class="dialog-footer"><button type="submit" class="button secondary" value="cancel"${danger ? ' autofocus' : ''}><span class="button-label">${escape(dismiss)}</span></button><button type="submit" class="button ${danger ? 'danger' : 'primary'}" value="confirm"${danger ? '' : ' autofocus'}><span class="button-label">${escape(label)}</span></button></footer></form>`;
  dialog.addEventListener('close', () => { if (dialog.returnValue === 'confirm') void callback(); }, { once: true });
  dialog.returnValue = '';
  dialog.showModal();
}

/** Opens the review dialog that records `decision` (accepted or rejected) with a note; rejecting needs one. */
export function openReviewDialog(decision) {
  const dialog = prepare($('#confirm-dialog'));
  const accept = decision === 'accepted';
  const note = field({ id: 'review-note', label: accept ? 'Note' : 'Reason', control: attrs => `<textarea ${attrs} name="note" rows="4" maxlength="2000"${accept ? '' : ' required'} placeholder="${accept ? 'Anything the next person should know' : 'What is wrong, and what should a new attempt do differently?'}"></textarea>`, hint: accept ? 'Optional. Shown in the session history.' : 'Required. For example: “The fix also changes negative totals; keep those as they are.”' });
  dialog.innerHTML = `<form data-form="review" data-decision="${escape(decision)}" novalidate>${header('confirm-title', accept ? 'Accept this outcome?' : 'Reject this outcome?')}<div class="dialog-body"><p>${accept ? 'You reviewed the changes and checks, and the work is fit to take further. The workbench records your decision in the session history; it does not push or merge anything.' : 'Say what is wrong so a new attempt can use it. The workbench records your reason in the session history; nothing is deleted.'}</p>${note}</div><footer class="dialog-footer">${button({ label: 'Cancel', action: 'close-dialog' })}${button({ label: accept ? 'Accept' : 'Reject', icon: accept ? 'check' : 'x', variant: accept ? 'primary' : 'danger', type: 'submit' })}</footer></form>`;
  open(dialog, accept ? '.dialog-footer [type="submit"]' : '#review-note');
}

/** Opens the dialog that authorizes additional budget for the open session: spent, current authorization, the new total and the ceiling. */
export function openBudgetDialog() {
  const dialog = prepare($('#confirm-dialog'));
  const session = state.session;
  const ceiling = state.bootstrap.maxBudgetUsd;
  const current = session.budgetUsd;
  const room = Math.max(0, round2(ceiling - current));
  const spent = session.costStatus === 'demo' ? 'Demo · no model calls' : session.costStatus === 'unknown' ? 'Not reported' : money(typeof session.observedUsd === 'number' && session.observedUsd > session.spentUsd ? session.observedUsd : session.spentUsd);
  const facts = dl([['Spent so far', `<span class="num">${escape(spent)}</span>`], ['Authorized now', `<span class="num">${escape(money(current))}</span>`], ['New total', `<strong class="num" data-budget-total>${escape(money(current))}</strong>`], ['Ceiling per session', `<span class="num">${escape(money(ceiling))}</span>`]]);
  const amount = room > 0 ? field({ id: 'budget-amount', label: 'Additional amount · USD', control: attrs => `<input ${attrs} name="amountUsd" type="number" inputmode="decimal" min="0.01" max="${room}" step="0.01" required data-current="${current}" data-ceiling="${ceiling}">`, hint: `Up to ${escape(money(room))} more before this session reaches the ceiling.` }) : `<p class="session-dialog-note">This session already has the highest authorization a session can have.</p>`;
  dialog.innerHTML = `<form data-form="budget" novalidate>${header('confirm-title', 'Authorize more budget')}<div class="dialog-body"><p>This raises what the session may spend. Earlier spend stays recorded.</p>${facts}${amount}</div><footer class="dialog-footer">${button({ label: 'Cancel', action: 'close-dialog' })}${button({ label: 'Authorize', icon: 'coins', variant: 'primary', type: 'submit', disabled: room <= 0 })}</footer></form>`;
  open(dialog, room > 0 ? '#budget-amount' : '.dialog-footer .button:not([disabled])');
}

/** Opens the dialog that rejects the proposed Ploeg Work Item `id` with a required reason. */
export function openWorkItemRejectDialog(id) {
  const dialog = prepare($('#confirm-dialog'));
  const reason = field({ id: 'reject-reason', label: 'Reason', control: attrs => `<textarea ${attrs} name="reason" rows="4" maxlength="4096" required placeholder="Why this work should not run"></textarea>`, hint: 'Recorded with your decision on the Work Item.', error: false });
  dialog.innerHTML = `<form data-form="ploeg-reject" data-id="${escape(id)}">${header('confirm-title', 'Reject this Work Item?')}<div class="dialog-body"><p>Ploeg closes the proposal without running it and records your reason. Nothing runs and nothing is spent.</p>${reason}</div><footer class="dialog-footer">${button({ label: 'Cancel', action: 'close-dialog' })}${button({ label: 'Reject', icon: 'x', variant: 'danger', type: 'submit' })}</footer></form>`;
  open(dialog, '#reject-reason');
}

async function createSession(data, form) {
  const title = String(data.title || '').trim();
  const objective = String(data.objective || '').trim();
  const budget = Number(data.budgetUsd);
  const invalid = [
    fieldError(form, 'new-title-input', title ? '' : 'Give the session a title.'),
    fieldError(form, 'new-objective', objective ? '' : 'Describe what the crew should do and how you will know it is done.'),
    fieldError(form, 'new-budget', Number.isFinite(budget) && budget > 0 && budget <= state.bootstrap.maxBudgetUsd ? '' : `Enter an amount above zero and at most ${money(state.bootstrap.maxBudgetUsd)}.`),
  ].find(control => control?.getAttribute('aria-invalid') === 'true');
  if (invalid) { invalid.focus(); return; }
  const body = { ...data, title, objective, budgetUsd: budget };
  if (!body.model) delete body.model;
  let session;
  try { session = await api('/api/sessions', { method: 'POST', body: JSON.stringify(body) }); }
  catch (error) {
    const target = error.code === 'objective_too_thin' ? 'new-objective' : error.code === 'budget' ? 'new-budget' : null;
    if (!target) throw error;
    fieldError(form, target, error.message).focus();
    return;
  }
  $('#new-session').close(); state.sessions.unshift(session); state.tab = 'stream'; location.hash = `session/${session.id}`;
}

function showModelHint(control) { const hint = document.querySelector('[data-model-hint]'); if (hint && state.models) hint.innerHTML = modelHint(state.models, control.value) || 'The crew’s own model.'; }

function showBudgetTotal(input) {
  const form = input.form;
  const total = form?.querySelector('[data-budget-total]');
  if (!total) return;
  const amount = Number(input.value);
  const current = Number(input.dataset.current);
  const ceiling = Number(input.dataset.ceiling);
  const next = Number.isFinite(amount) && amount > 0 ? round2(current + amount) : current;
  total.textContent = money(next);
  fieldError(form, 'budget-amount', next > ceiling + 1e-9 ? `That is ${money(round2(next - ceiling))} above the ceiling of ${money(ceiling)}.` : '');
}

function openNewFromKeyboard(event) {
  if (event.key.toLowerCase() === 'n' && singleKeyAllowed(event) && state.bootstrap && state.bootstrap.user.role !== 'viewer' && ['sessions', 'session'].includes(state.view)) { event.preventDefault(); openNew(); return true; }
  return false;
}

/** The new-session, confirmation, review, budget and Work Item rejection dialogs. `n` opens a new session on the Sessions pages. */
export default {
  id: 'dialogs',
  actions: {
    new: () => openNew(),
    'close-dialog': control => control?.closest('dialog')?.close(),
  },
  forms: { new: createSession },
  inputs: { '#budget-amount': showBudgetTotal },
  changes: { '[data-model-select]': showModelHint },
  keys: [openNewFromKeyboard],
};
