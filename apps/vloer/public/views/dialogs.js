import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { $, escape } from '../core/dom.js';
import { money } from '../core/format.js';
import { icon } from '../core/icons.js';
import { placementField } from '../core/lookup.js';

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
  if (hint && select) hint.innerHTML = modelHint(state.models, select.value);
}

/** Opens the new-session dialog, prefilled with the demonstration brief in demo mode. */
export function openNew() {
  const dialog = $('#new-session');
  const demo = state.bootstrap.mode === 'demo';
  void loadModels();
  dialog.innerHTML = `<form data-form="new"><header class="dialog-header"><div><p class="eyebrow">A NEW ENGAGEMENT</p><h2 id="new-title">Give your crew a clear brief.</h2></div><button class="icon-button" type="button" data-action="close-dialog" aria-label="Close">${icon('x')}</button></header><div class="dialog-body">${demo ? '<div class="notice compact-notice">Demonstration mode always runs the supplied rounding fixture. Live deployments execute your own objectives.</div>' : ''}<label>Session title<input name="title" placeholder="e.g. Fix the order total rounding regression" maxlength="160" value="${demo ? 'Fix order total rounding' : ''}" required></label><label>Objective and acceptance criteria<textarea name="objective" rows="4" maxlength="16000" placeholder="What should change? What evidence will show it works?" required>${demo ? 'Reproduce the rounding regression in the order service. Apply a minimal fix, keep the tests intact, and have an independent reviewer inspect the patch and rerun the checks.' : ''}</textarea></label><div class="form-grid"><label>Repository<select name="repositoryId">${state.bootstrap.repositories.map(repo => `<option value="${escape(repo.id)}">${escape(repo.name)}</option>`).join('')}</select></label><label>Crew<select name="crewId">${state.bootstrap.crews.map(crew => `<option value="${escape(crew.id)}">${escape(crew.name)}</option>`).join('')}</select></label><label>Runtime<select name="runtime">${state.bootstrap.runtimes.map(runtime => `<option value="${escape(runtime.id)}">${escape(runtime.name)}</option>`).join('')}</select></label>${placementField('new')}<label>Model<select name="model" data-model-select><option value="">Crew default</option>${state.bootstrap.models.map(model => `<option value="${escape(model.id)}">${escape(model.name)}</option>`).join('')}</select><span class="form-help" data-model-hint>${state.models ? modelHint(state.models, '') : 'Checking routes at the gateway…'}</span></label><label class="checkbox-field"><input type="checkbox" name="approval" value="auto"> Approve tool use automatically<span class="form-help">Only in a container or pod. Questions still reach you.</span></label><label>Session budget · USD<input name="budgetUsd" type="number" min="0.01" max="${state.bootstrap.maxBudgetUsd}" step="0.01" value="${Math.min(5, state.bootstrap.maxBudgetUsd)}" required></label></div><p class="form-help">${demo ? 'The authorization is illustrative; demonstration spend remains $0.' : 'This caps the engagement across its roles. Additional authorization requires an administrator.'}</p></div><footer class="dialog-footer"><button class="button secondary" type="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">Create session ${icon('arrow')}</button></footer></form>`;
  dialog.showModal();
}

/** Opens the confirmation dialog and runs `callback` when the person confirms. */
export function confirmAction(title, description, label, callback) {
  const dialog = $('#confirm-dialog');
  dialog.innerHTML = `<form method="dialog"><div class="dialog-body"><h2 id="confirm-title">${escape(title)}</h2><p>${escape(description)}</p></div><footer class="dialog-footer"><button class="button secondary" value="cancel">Keep working</button><button class="button primary" value="confirm">${escape(label)}</button></footer></form>`;
  dialog.addEventListener('close', () => { if (dialog.returnValue === 'confirm') void callback(); }, { once: true });
  dialog.returnValue = '';
  dialog.showModal();
}

/** Opens the review dialog that records `decision` (accepted or rejected) with a note. */
export function openReviewDialog(decision) {
  const dialog = $('#confirm-dialog');
  dialog.innerHTML = `<form data-form="review" data-decision="${escape(decision)}"><div class="dialog-body"><h2 id="confirm-title">${decision === 'accepted' ? 'Accept this outcome' : 'Reject this outcome'}</h2><p>${decision === 'accepted' ? 'You have reviewed the candidate and it is fit to take further. A note is optional.' : 'Say why, so the next attempt can use it. The note is required.'}</p><label>Note<textarea name="note" rows="3" maxlength="2000" ${decision === 'rejected' ? 'required' : ''}></textarea></label></div><footer class="dialog-footer"><button class="button secondary" type="button" data-action="close-budget">Cancel</button><button class="button primary" type="submit">${decision === 'accepted' ? 'Accept' : 'Reject'}</button></footer></form>`;
  dialog.showModal();
}

/** Opens the dialog that authorizes additional budget for the open session. */
export function openBudgetDialog() {
  const dialog = $('#confirm-dialog');
  dialog.innerHTML = `<form data-form="budget"><div class="dialog-body"><h2 id="confirm-title">Authorize additional budget</h2><p>This adds to the existing engagement. Current authorization: ${money(state.session.budgetUsd)}.</p><label>Additional amount · USD<input name="amountUsd" type="number" min="0.01" max="${state.bootstrap.maxBudgetUsd - state.session.budgetUsd}" step="0.01" required></label></div><footer class="dialog-footer"><button class="button secondary" type="button" data-action="close-budget">Cancel</button><button class="button primary" type="submit">Authorize</button></footer></form>`; dialog.showModal();
}

/** Opens the dialog that rejects the proposed Ploeg Work Item `id` with a required reason. */
export function openWorkItemRejectDialog(id) {
  const dialog = $('#confirm-dialog');
  dialog.innerHTML = `<form data-form="ploeg-reject" data-id="${escape(id)}"><div class="dialog-body"><h2 id="confirm-title">Reject this Work Item?</h2><p>Ploeg withdraws it and records your reason. Nothing runs.</p><label>Reason<textarea name="reason" rows="3" maxlength="4096" required></textarea></label></div><footer class="dialog-footer"><button class="button secondary" type="button" data-action="close-budget">Cancel</button><button class="button primary" type="submit">Reject</button></footer></form>`;
  dialog.showModal();
}

async function createSession(data) {
  data.budgetUsd = Number(data.budgetUsd);
  if (!data.model) delete data.model;
  const session = await api('/api/sessions', { method: 'POST', body: JSON.stringify(data) });
  $('#new-session').close(); state.sessions.unshift(session); state.tab = 'stream'; location.hash = `session/${session.id}`;
}

function showModelHint(select) { const hint = document.querySelector('[data-model-hint]'); if (hint && state.models) hint.innerHTML = modelHint(state.models, select.value); }

function openNewFromKeyboard(event) {
  if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName) && state.bootstrap && state.bootstrap.user.role !== 'viewer' && !$('#new-session').open && !$('#confirm-dialog').open && !$('#task-connections').open) { event.preventDefault(); openNew(); return true; }
  return false;
}

/** The new-session, confirmation, review, budget and Work Item rejection dialogs. `n` opens a new session. */
export default {
  id: 'dialogs',
  actions: {
    new: () => openNew(),
    'close-dialog': () => $('#new-session').close(),
    'close-budget': () => $('#confirm-dialog').close(),
  },
  forms: { new: createSession },
  changes: { '[data-model-select]': showModelHint },
  keys: [openNewFromKeyboard],
};
