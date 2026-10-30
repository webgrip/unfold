import { state, onForget, disconnect } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, renderHtml, notify } from '../core/dom.js';
import { button, callout, emptyState, section, skeleton, table, timeAgo } from '../core/ui.js';
import { enabled } from '../core/flags.js';
import { shell } from '../shell.js';
import { confirmAction } from './dialogs.js';

const view = { sources: null, requests: null, catalogue: null, error: '', secret: null };
onForget(() => Object.assign(view, { sources: null, requests: null, catalogue: null, error: '', secret: null }));

/** Whether the Request intake Settings page is offered: the `intake.requests` flag is on and the person is an administrator. */
export function intakeOffered() {
  return enabled('intake.requests') && state.bootstrap?.user?.role === 'admin';
}

const checkWords = { verified: 'Checked against the vendor\'s documentation', partly: 'Placeholders documented; body proposed by Unfold', own: 'Unfold\'s own shape' };

function secretCallout() {
  if (!view.secret) return '';
  return callout({ tone: 'warning', title: `Secret for ${view.secret.id}`, body: `<p>Copy it now: Unfold shows it only once. Give it to the sender as its signing secret or token.</p><p><code class="mono">${escape(view.secret.value)}</code></p><p>Deliver to <code class="mono">${escape(view.secret.url)}</code></p>` });
}

function sourceRows() {
  return view.sources.map(source => ({
    name: `<strong>${escape(source.name)}</strong><br><code class="mono">${escape(source.url)}</code>`,
    owner: escape(source.client ? `${source.tenant} / ${source.client}` : source.tenant),
    reads: escape(source.kind === 'email' ? `Email${source.address ? ` to ${source.address}` : ''}` : source.template),
    verifier: escape(source.verifier),
    actions: `${button({ label: 'New secret', icon: 'refresh', size: 'sm', action: 'intake-rotate', data: { id: source.id } })} ${button({ label: 'Remove', variant: 'danger-ghost', size: 'sm', action: 'intake-remove', data: { id: source.id } })}`,
  }));
}

function requestRows() {
  return view.requests.map(request => ({
    title: escape(request.title),
    owner: escape(request.client ? `${request.tenant} / ${request.client}` : request.tenant),
    from: escape(request.reporter?.email ?? request.reporter?.name ?? ''),
    source: escape(request.sourceId),
    updated: timeAgo(request.updatedAt),
    messages: escape(String(Math.max(request.messages.length, 1))),
  }));
}

function addForm() {
  const templates = view.catalogue?.templates ?? [];
  const verifiers = view.catalogue?.verifiers ?? [];
  const option = (value, label) => `<option value="${escape(value)}">${escape(label)}</option>`;
  const field = (id, label, input, hint = '') => `<div class="field"><label class="field-label" for="intake-${id}">${escape(label)}</label>${input}${hint ? `<p class="field-hint">${escape(hint)}</p>` : ''}</div>`;
  return `<form class="intake-form" data-form="intake-add" novalidate>
    ${field('id', 'Source id', '<input id="intake-id" name="id" required pattern="[a-z0-9][a-z0-9-]{1,62}" autocomplete="off">', 'Part of the delivery address: lower-case letters, digits and hyphens.')}
    ${field('name', 'Name', '<input id="intake-name" name="name" maxlength="100" autocomplete="off">')}
    ${field('kind', 'Reads', `<select id="intake-kind" name="kind">${option('webhook', 'A JSON webhook')}${option('email', 'Inbound email')}</select>`)}
    ${field('template', 'Template', `<select id="intake-template" name="template">${templates.map(entry => option(entry.id, `${entry.name}: ${checkWords[entry.check]}`)).join('')}</select>`, 'For a webhook. Each template\'s notes are in the operations guide.')}
    ${field('verifier', 'Verifier', `<select id="intake-verifier" name="verifier">${option('', 'The template\'s own')}${verifiers.map(entry => option(entry.name, `${entry.name}${entry.signed ? '' : ' (unsigned, weaker)'}`)).join('')}</select>`)}
    ${field('secret', 'Sender\'s secret', '<input id="intake-secret" name="secret" type="password" autocomplete="off">', 'Leave empty and Unfold makes one, except for a sender that signs with its own secret, such as Zendesk.')}
    ${field('tenant', 'Tenant', '<input id="intake-tenant" name="tenant" value="default" required autocomplete="off">')}
    ${field('client', 'Client', '<input id="intake-client" name="client" autocomplete="off">', 'Optional. Requests from this source belong to this Client.')}
    ${field('address', 'Email address', '<input id="intake-address" name="address" type="email" autocomplete="off">', 'For email: the address your mail provider forwards to this source. Unfold never sends mail.')}
    ${field('senders', 'Allowed senders', '<input id="intake-senders" name="senders" autocomplete="off">', 'For email: domains or addresses, separated by commas. Empty accepts every sender.')}
    <div>${button({ label: 'Add source', icon: 'plus', variant: 'primary', type: 'submit' })}</div>
  </form>`;
}

function body() {
  if (view.error) return callout({ tone: 'danger', title: 'Could not read the intake', body: `<p>${escape(view.error)}</p>` });
  if (!view.sources || !view.requests) return skeleton({ rows: 3 });
  const sources = view.sources.length
    ? table({ caption: 'Intake sources', columns: [{ key: 'name', label: 'Source' }, { key: 'owner', label: 'Tenant / Client' }, { key: 'reads', label: 'Reads' }, { key: 'verifier', label: 'Verifier' }, { key: 'actions', label: 'Actions' }], rows: sourceRows() })
    : emptyState({ icon: 'inbox', title: 'No intake sources yet', body: 'Add one for each feedback tool, form or mailbox that sends Requests.', compact: true });
  const requests = table({ caption: 'Recent Requests', columns: [{ key: 'title', label: 'Request' }, { key: 'owner', label: 'Tenant / Client' }, { key: 'from', label: 'From' }, { key: 'source', label: 'Source' }, { key: 'updated', label: 'Updated' }, { key: 'messages', label: 'Messages', numeric: true }], rows: requestRows(), empty: 'No Requests have arrived.' });
  return `${secretCallout()}${section({ id: 'intake-sources', title: 'Sources', count: view.sources.length, body: sources })}${section({ id: 'intake-add', title: 'Add a source', body: addForm() })}${section({ id: 'intake-requests', title: 'Recent Requests', description: 'Each waits for Refinement. A Request never starts a Run.', body: requests })}`;
}

function renderIntake() {
  renderHtml(shell(`<div class="settings-page intake-page">${body()}</div>`, { title: 'Request intake', subtitle: 'Where Requests from feedback tools, forms and email enter, and the Requests waiting for Refinement.' }));
}

async function load() {
  try {
    const [sources, requests, catalogue] = await Promise.all([api('/api/intake/sources'), api('/api/intake/requests?limit=50'), api('/api/intake/templates')]);
    Object.assign(view, { sources: sources.sources, requests: requests.requests, catalogue, error: '' });
  } catch (error) { if (error.status !== 401) view.error = error.message || 'The workbench did not answer.'; }
  if (state.view === 'intake') renderIntake();
}

async function enterIntake() {
  disconnect(); state.session = null; state.view = 'intake';
  renderIntake();
  await load();
}

async function addSource(data, form) {
  const senders = String(data.senders ?? '').split(',').map(item => item.trim()).filter(Boolean);
  const input = { id: data.id, name: data.name, kind: data.kind, tenant: data.tenant, client: data.client || undefined, verifier: data.verifier || undefined, secret: data.secret || undefined, ...(data.kind === 'email' ? { address: data.address || undefined, senders } : { template: data.template }) };
  const created = await api('/api/intake/sources', { method: 'POST', body: JSON.stringify(input) });
  view.secret = created.secret ? { id: created.source.id, value: created.secret, url: created.source.url } : null;
  form.reset();
  notify(`Added ${created.source.name}.`);
  await load();
}

function rotate(control) {
  const id = control.dataset.id;
  confirmAction(`Replace the secret of ${id}?`, 'The sender stops being accepted until it uses the new secret.', 'Replace secret', async () => {
    const rotated = await api(`/api/intake/sources/${encodeURIComponent(id)}/secret`, { method: 'POST', body: '{}' });
    view.secret = rotated.secret ? { id, value: rotated.secret, url: rotated.source.url } : null;
    if (!rotated.secret) notify(`Saved the new secret of ${id}.`);
    await load();
  });
}

function remove(control) {
  const id = control.dataset.id;
  confirmAction(`Remove ${id}?`, 'Deliveries to it are refused from now on. Its Requests stay.', 'Remove source', async () => {
    await api(`/api/intake/sources/${encodeURIComponent(id)}`, { method: 'DELETE' });
    notify(`Removed ${id}.`);
    await load();
  }, { tone: 'danger' });
}

/** Request intake (`#settings/intake`): intake sources and the Requests waiting for Refinement, behind the `intake.requests` flag. */
export default {
  id: 'intake',
  match: hash => hash === 'settings/intake' && intakeOffered() ? {} : null,
  enter: enterIntake,
  render: renderIntake,
  actions: { 'intake-rotate': rotate, 'intake-remove': remove },
  forms: { 'intake-add': addSource },
};
