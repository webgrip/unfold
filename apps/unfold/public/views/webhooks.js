import { state, onForget, disconnect } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, renderHtml, notify } from '../core/dom.js';
import { badge, button, callout, chip, disclosure, emptyState, skeleton, table } from '../core/ui.js';
import { dateTime } from '../core/format.js';
import { icon } from '../core/icons.js';
import { shell } from '../shell.js';
import { confirmAction } from './dialogs.js';

const fresh = () => ({ data: null, error: '', secret: null, deliveries: {}, open: null });
const view = fresh();
onForget(() => Object.assign(view, fresh()));

const statusTone = { pending: 'attention', delivered: 'success', dead: 'danger' };
const isAdmin = () => state.bootstrap?.user?.role === 'admin';

function secretCallout() {
  if (!view.secret) return '';
  const body = `<p>Copy it now: Unfold shows a secret only once. Your receiver verifies each delivery's <code>webhook-signature</code> with it.</p><div class="field"><label class="field-label" for="webhook-secret">Signing secret</label><input id="webhook-secret" class="mono" type="text" readonly autocomplete="off" spellcheck="false" value="${escape(view.secret.secret)}"></div>`;
  return callout({ tone: 'attention', title: view.secret.rotated ? 'New signing secret' : 'Webhook created', body, actions: button({ label: 'Done, I copied it', size: 'sm', action: 'webhook-secret-done' }) });
}

function deliveryTable(id) {
  const list = view.deliveries[id];
  if (!list) return skeleton({ rows: 2 });
  if (!list.length) return '<p class="meta">Nothing sent yet.</p>';
  return table({
    caption: 'Latest deliveries', compact: true, contained: true,
    columns: [{ key: 'event', label: 'Event' }, { key: 'status', label: 'Status' }, { key: 'attempts', label: 'Attempts', numeric: true }, { key: 'answer', label: 'Last answer' }, { key: 'next', label: 'Next try' }, { key: 'action', label: 'Action' }],
    rows: list.map(delivery => ({
      event: `<code>${escape(delivery.eventType.replace('dev.unfold.', ''))}</code>`,
      status: badge({ tone: statusTone[delivery.status], label: delivery.status, size: 'sm' }),
      attempts: `<span class="num">${escape(delivery.attempts)}</span>`,
      answer: escape(delivery.lastStatus ? String(delivery.lastStatus) : delivery.lastError || '—'),
      next: delivery.nextAttemptAt ? `<time class="num" datetime="${escape(delivery.nextAttemptAt)}">${escape(dateTime(new Date(delivery.nextAttemptAt)))}</time>` : '—',
      action: delivery.status === 'dead' ? button({ label: 'Send again', size: 'sm', action: 'webhook-resend', data: { id, delivery: delivery.id } }) : '',
    })),
  });
}

function subscriptionRow(subscription) {
  const scope = subscription.client ? `Client ${subscription.client} in ${subscription.tenant}` : `Tenant ${subscription.tenant}`;
  const counts = subscription.deliveries;
  const state = subscription.active ? badge({ tone: 'success', label: 'Active', size: 'sm' }) : badge({ tone: 'neutral', label: 'Paused', size: 'sm', title: subscription.disabledReason || 'Paused by an administrator' });
  const actions = [
    button({ label: 'Send test event', size: 'sm', action: 'webhook-test', data: { id: subscription.id } }),
    button({ label: subscription.active ? 'Pause' : 'Resume', size: 'sm', action: 'webhook-toggle', data: { id: subscription.id, active: subscription.active ? 'false' : 'true' } }),
    button({ label: 'New secret', size: 'sm', action: 'webhook-rotate', data: { id: subscription.id } }),
    button({ label: 'Delete', size: 'sm', variant: 'danger-ghost', action: 'webhook-delete', data: { id: subscription.id } }),
  ].join('');
  const log = disclosure({ id: `webhook-log-${subscription.id}`, summary: `Deliveries: ${counts.delivered} delivered, ${counts.pending} waiting, ${counts.dead} failed`, open: view.open === subscription.id, body: `${button({ label: 'Refresh', icon: 'refresh', size: 'sm', action: 'webhook-log', data: { id: subscription.id } })}${deliveryTable(subscription.id)}` });
  const disabled = subscription.disabledReason ? `<p class="settings-item-text">${icon('alert')}<span>${escape(subscription.disabledReason)}</span></p>` : '';
  return `<li class="settings-item"><span class="settings-item-icon" aria-hidden="true">${icon('send')}</span><div class="settings-item-main"><p class="settings-item-title"><code>${escape(subscription.url)}</code> ${state}</p>${subscription.description ? `<p class="settings-item-text">${escape(subscription.description)}</p>` : ''}${disabled}<div class="settings-item-meta">${chip({ label: scope, icon: 'user' })}${subscription.types.map(type => chip({ label: type.replace('dev.unfold.', '') })).join('')}</div><div class="settings-item-meta">${actions}</div>${log}</div></li>`;
}

function createForm(data) {
  const tenants = data.tenants.filter(entry => entry.enabled);
  if (!tenants.length) return callout({ tone: 'neutral', title: 'Webhooks are off', body: '<p>Turn on the <code>events.webhooks</code> flag for your Tenant on the Feature flags page, then come back to add a receiver.</p>' });
  const types = data.eventTypes.map((type, index) => `<label class="flag-check"><input type="checkbox" name="types" value="${escape(type.type)}"${index < 1 ? ' checked' : ''}><span><code>${escape(type.type.replace('dev.unfold.', ''))}</code> ${escape(type.summary)}</span></label>`).join('');
  const tenantField = tenants.length > 1 ? `<div class="field"><label class="field-label" for="webhook-tenant">Tenant</label><select id="webhook-tenant" name="tenant">${tenants.map(entry => `<option value="${escape(entry.tenant)}">${escape(entry.tenant)}</option>`).join('')}</select></div>` : `<input type="hidden" name="tenant" value="${escape(tenants[0].tenant)}">`;
  const body = `<form class="settings-form" data-form="webhook-create" novalidate>
<div class="field"><label class="field-label" for="webhook-url">Receiver URL</label><input id="webhook-url" name="url" type="url" required maxlength="2048" placeholder="https://hooks.example.com/unfold" aria-describedby="webhook-url-hint"><p class="field-hint" id="webhook-url-hint">An https address on the public internet, such as an n8n, Zapier or Make webhook, or a Slack or Teams relay. Private and local addresses are refused unless the server configuration allows them.</p></div>
${tenantField}
<div class="field"><label class="field-label" for="webhook-client">Client (optional)</label><input id="webhook-client" name="client" type="text" maxlength="63" pattern="[a-z0-9-]*" aria-describedby="webhook-client-hint"><p class="field-hint" id="webhook-client-hint">Leave empty to receive the whole Tenant's events. A Client id limits this receiver to that Client's work.</p></div>
<div class="field"><label class="field-label" for="webhook-description">Description (optional)</label><input id="webhook-description" name="description" type="text" maxlength="200"></div>
<fieldset class="field"><legend class="field-label">Events</legend>${types}</fieldset>
<div>${button({ label: 'Create webhook', icon: 'plus', variant: 'primary', type: 'submit' })}</div></form>`;
  return disclosure({ id: 'webhook-create', summary: 'Add a receiver', body, open: !data.subscriptions.length });
}

function content() {
  if (!isAdmin()) return callout({ tone: 'neutral', title: 'Administrators manage webhooks', body: '<p>Ask an administrator to send Unfold events to your tools.</p>' });
  if (view.error && !view.data) return callout({ tone: 'danger', title: 'Could not read the webhooks', body: `<p>${escape(view.error)}</p>` });
  if (!view.data) return skeleton({ rows: 3 });
  const data = view.data;
  const demo = data.demo ? callout({ tone: 'neutral', title: 'Demo workbench', body: '<p>The demo reads no Ploeg, so it sends no events about work. A test event still goes out, marked as a test.</p>' }) : '';
  const list = data.subscriptions.length ? `<ul class="settings-items">${data.subscriptions.map(subscriptionRow).join('')}</ul>` : emptyState({ icon: 'send', title: 'No receivers yet', body: 'Add a URL to receive signed CloudEvents when work moves.', compact: true });
  return `${secretCallout()}${demo}<section class="card settings-card" aria-labelledby="webhooks-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="webhooks-title">Webhooks <span class="count">${data.subscriptions.length}</span></h2><p class="card-subtitle">Signed CloudEvents over Standard Webhooks, retried for a day before they fail.</p></div></header><div class="card-body">${createForm(data)}</div>${list}</section><p class="settings-footnote">${icon('lock')}<span>Each delivery carries <code>webhook-id</code>, <code>webhook-timestamp</code> and <code>webhook-signature</code>. The operations guide <code>docs/operations/outbound-events.md</code> shows how to verify them.</span></p>`;
}

function render() {
  renderHtml(shell(`<div class="settings-page">${content()}</div>`, { title: 'Webhooks', subtitle: 'Send Unfold events to n8n, Zapier, Make, your PSA tool or a chat channel.' }));
}

async function load() {
  view.error = '';
  try { view.data = await api('/api/admin/webhooks'); }
  catch (error) { if (error.status !== 401) view.error = error.message; }
  if (state.view === 'webhooks') render();
}

async function enter() {
  disconnect(); state.session = null; state.view = 'webhooks';
  render();
  if (isAdmin()) await load();
}

async function showLog(id) {
  view.open = id;
  view.deliveries[id] = (await api(`/api/admin/webhooks/${encodeURIComponent(id)}/deliveries`)).deliveries;
  render();
}

async function create(data, form) {
  const types = new FormData(form).getAll('types');
  const created = await api('/api/admin/webhooks', { method: 'POST', body: JSON.stringify({ url: data.url, tenant: data.tenant, ...(data.client ? { client: data.client } : {}), ...(data.description ? { description: data.description } : {}), types }) });
  view.secret = { secret: created.secret, rotated: false };
  await load();
}

/** Webhooks (`#settings/webhooks`, administrators): receivers of Unfold's outbound events, their signing secrets and their deliveries. */
export default {
  id: 'webhooks',
  match: hash => hash === 'settings/webhooks' ? {} : null,
  enter,
  render,
  actions: {
    'webhook-secret-done': () => { view.secret = null; render(); },
    'webhook-log': control => showLog(control.dataset.id),
    'webhook-test': async control => { await api(`/api/admin/webhooks/${encodeURIComponent(control.dataset.id)}/test`, { method: 'POST', body: '{}' }); notify('A test event is queued. It goes out within a few seconds.'); await showLog(control.dataset.id); },
    'webhook-toggle': async control => { await api(`/api/admin/webhooks/${encodeURIComponent(control.dataset.id)}`, { method: 'PATCH', body: JSON.stringify({ active: control.dataset.active === 'true' }) }); await load(); },
    'webhook-resend': async control => { await api(`/api/admin/webhooks/${encodeURIComponent(control.dataset.id)}/deliveries/${encodeURIComponent(control.dataset.delivery)}/resend`, { method: 'POST', body: '{}' }); await showLog(control.dataset.id); },
    'webhook-rotate': control => confirmAction('Make a new signing secret?', 'Unfold signs with both the old and the new secret for 24 hours, so you can update your receiver without missing a delivery.', 'Make a new secret', async () => {
      const rotated = await api(`/api/admin/webhooks/${encodeURIComponent(control.dataset.id)}/rotate-secret`, { method: 'POST', body: '{}' });
      view.secret = { secret: rotated.secret, rotated: true };
      await load();
    }),
    'webhook-delete': control => confirmAction('Delete this webhook?', 'Unfold stops sending to it at once and forgets its deliveries and its secret.', 'Delete', async () => {
      await api(`/api/admin/webhooks/${encodeURIComponent(control.dataset.id)}`, { method: 'DELETE' });
      notify('The webhook is deleted.');
      await load();
    }, { tone: 'danger', dismiss: 'Keep it' }),
  },
  forms: { 'webhook-create': create },
};
