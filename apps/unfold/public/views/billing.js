import { state, onForget, disconnect } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, renderHtml, announce, notify } from '../core/dom.js';
import { badge, button, callout, demoNote, disclosure, skeleton, table } from '../core/ui.js';
import { parseAmount, date } from '../core/format.js';
import { shell } from '../shell.js';

const view = { data: null, error: '', loading: false, busy: '' };
onForget(() => Object.assign(view, { data: null, error: '', loading: false, busy: '' }));

const stateLabels = { pending: ['neutral', 'Waiting to send'], needs_price: ['attention', 'Needs your price'], sending: ['neutral', 'Sending'], sent: ['success', 'Sent'], failed: ['danger', 'Failed'], cancelled: ['neutral', 'Cancelled'] };
const acceptedWords = { merged: 'Merged', approved: 'Approved', silent: 'Silent (10 working days)' };
const ownerName = owner => owner.client ? `${owner.tenant} · Client ${owner.client}` : `${owner.tenant} · no Client`;
const ownerKey = owner => `${owner.tenant}--${owner.client ?? ''}`;

/**
 * An amount in cents as money in the Dutch locale with two decimals, such as `€ 450,00`.
 * @param {number|null} cents
 * @param {string} currency
 */
export function centsText(cents, currency) {
  if (typeof cents !== 'number') return 'No price';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

const formAmount = cents => typeof cents === 'number' ? new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(cents / 100) : '';

function priceField(text) {
  if (!String(text ?? '').trim()) return '';
  const value = parseAmount(text);
  if (!Number.isFinite(value) || value < 0) throw new Error(`“${text}” is not an amount such as 450,00.`);
  return value.toFixed(2);
}

function mappingForm(owner, data) {
  const id = `billing-${ownerKey(owner)}`;
  const mapping = owner.mapping;
  const fields = data.exporter.targetFields.map(field => `<div class="field"><label class="field-label" for="${id}-${escape(field.key)}">${escape(field.label)}${field.required ? '' : ' (optional)'}</label><input id="${id}-${escape(field.key)}" name="target.${escape(field.key)}" type="text" maxlength="200" autocomplete="off" spellcheck="false" ${field.required ? 'required' : ''} value="${escape(mapping?.target?.[field.key] ?? '')}" aria-describedby="${id}-${escape(field.key)}-hint"><p class="field-hint" id="${id}-${escape(field.key)}-hint">${escape(field.hint)}</p></div>`).join('');
  const sizes = data.sizes.map(size => `<div class="field"><label class="field-label" for="${id}-size-${size}">Price for ${size} (optional)</label><input id="${id}-size-${size}" name="size.${size}" type="text" inputmode="decimal" autocomplete="off" value="${escape(formAmount(mapping?.price?.perSizeCents?.[size]))}"></div>`).join('');
  return `<form class="billing-mapping" data-form="billing-mapping" data-tenant="${escape(owner.tenant)}" data-client="${escape(owner.client ?? '')}">
<div class="flag-rule-grid">${fields}
<div class="field"><label class="field-label" for="${id}-ticket">Your price per ticket</label><input id="${id}-ticket" name="perTicket" type="text" inputmode="decimal" autocomplete="off" value="${escape(formAmount(mapping?.price?.perTicketCents))}" aria-describedby="${id}-ticket-hint"><p class="field-hint" id="${id}-ticket-hint">Your own price to this Client, in ${escape(data.currency)}, without VAT. Unfold’s own fees are never on the line.</p></div>
${sizes}
<div class="field"><label class="field-label" for="${id}-since">Bill acceptances from</label><input id="${id}-since" name="since" type="date" value="${escape(mapping?.since ?? '')}" aria-describedby="${id}-since-hint"><p class="field-hint" id="${id}-since-hint">Empty means today. Earlier acceptances are never billed.</p></div>
</div>
<div class="flag-actions">${button({ type: 'submit', label: mapping ? 'Save mapping' : 'Map this Client', variant: 'primary', size: 'sm' })}${mapping ? button({ label: 'Remove mapping', variant: 'ghost', size: 'sm', action: 'billing-unmap', data: { tenant: owner.tenant, client: owner.client ?? '' } }) : ''}</div>
</form>`;
}

function ownersCard(data) {
  const rows = data.owners.map(owner => {
    const summary = `${ownerName(owner)} · ${owner.mapping ? 'mapped' : 'not mapped'} · billing ${owner.enabled ? 'on' : 'off'}`;
    return `<li class="settings-item">${disclosure({ summary, body: mappingForm(owner, data) })}</li>`;
  }).join('');
  return `<section class="card settings-card" aria-labelledby="billing-clients-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="billing-clients-title">Clients</h2><p class="card-subtitle">Where each Client’s accepted tickets go in ${escape(data.exporter.title)}, and your price.</p></div></header><ul class="settings-items">${rows || '<li class="settings-item settings-item-empty">No Tenant or Client is registered.</li>'}</ul></section>`;
}

function lineActions(record, data) {
  const id = record.id;
  if (record.state === 'failed' && record.uncertain) return `${button({ label: 'It is in the tool', size: 'sm', variant: 'secondary', action: 'billing-found', data: { id } })}${button({ label: 'Checked: send again', size: 'sm', variant: 'ghost', action: 'billing-send', data: { id, checked: '1' } })}`;
  if (record.state === 'failed') return button({ label: 'Send again', size: 'sm', variant: 'secondary', action: 'billing-send', data: { id } });
  if (record.state === 'needs_price') return `<form class="billing-price" data-form="billing-price" data-id="${escape(id)}"><label class="sr-only" for="billing-price-${escape(id)}">Price</label><input id="billing-price-${escape(id)}" name="price" type="text" inputmode="decimal" required autocomplete="off" placeholder="450,00">${button({ type: 'submit', label: 'Set price', size: 'sm', variant: 'primary' })}</form>`;
  const age = Date.now() - Date.parse(record.line.acceptance.at);
  if (record.line.kind === 'acceptance' && !record.reversedBy && ['sent', 'pending'].includes(record.state) && age <= data.reversalDays * 86_400_000) {
    return disclosure({ summary: 'Reverse', body: `<form class="billing-reverse" data-form="billing-reverse" data-id="${escape(id)}"><div class="field"><label class="field-label" for="billing-reason-${escape(id)}">Which defect inside the Acceptance Conditions did the revert fix?</label><input id="billing-reason-${escape(id)}" name="reason" type="text" required maxlength="500" autocomplete="off"></div><div class="field"><label class="field-label" for="billing-revert-${escape(id)}">Revert link (optional)</label><input id="billing-revert-${escape(id)}" name="revertUrl" type="url" autocomplete="off"></div>${button({ type: 'submit', label: record.state === 'sent' ? 'Write a credit line' : 'Cancel the line', size: 'sm', variant: 'secondary' })}</form>` });
  }
  return '';
}

function linesCard(data) {
  const rows = data.lines.map(record => {
    const [tone, label] = stateLabels[record.state] ?? ['neutral', record.state];
    const line = record.line;
    const pr = line.acceptance.pullRequestUrl ? ` · <a href="${escape(line.acceptance.pullRequestUrl)}" rel="noreferrer" target="_blank">pull request</a>` : '';
    const revert = record.revertDetected ? `<p class="field-hint">Revert found: ${escape(record.revertDetected.reference)}. Reverse the line if it fixed a defect.</p>` : '';
    const error = record.lastError ? `<p class="field-hint">${escape(record.lastError)}</p>` : '';
    return {
      item: `${escape(line.externalRef)} ${escape(line.title)}<br><span class="field-hint">${escape(ownerName(line))}${pr}</span>`,
      kind: line.kind === 'reversal' ? 'Credit' : escape(acceptedWords[line.acceptance.kind] ?? line.acceptance.kind),
      accepted: escape(date(line.acceptance.at)),
      amount: `<span class="num money">${escape(centsText(line.unitPriceCents === null ? null : line.unitPriceCents * line.quantity, line.currency))}</span>`,
      state: `${badge({ tone, label })}${error}${revert}`,
      actions: lineActions(record, data),
    };
  });
  const downloads = `<a class="button secondary sm" href="/api/billing/lines?format=csv" download>Download CSV</a> <a class="button secondary sm" href="/api/billing/lines?format=ubl" download>Download UBL JSON</a>`;
  return `<section class="card settings-card" aria-labelledby="billing-lines-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="billing-lines-title">Lines</h2><p class="card-subtitle">The newest lines Unfold wrote or tried to write. Each accepted ticket is sent once.</p></div><div class="card-actions">${button({ label: 'Sync now', icon: 'refresh', size: 'sm', action: 'billing-sync', busy: view.busy === 'sync' })} ${downloads}</div></header><div class="card-body">${table({ caption: 'Billing lines', columns: [{ key: 'item', label: 'Work Item' }, { key: 'kind', label: 'Acceptance' }, { key: 'accepted', label: 'Accepted' }, { key: 'amount', label: 'Amount', numeric: true }, { key: 'state', label: 'State' }, { key: 'actions', label: 'Action' }], rows, empty: 'No lines yet. A line appears once a mapped Client’s Work Item is accepted.' })}</div></section>`;
}

function body() {
  if (view.error && !view.data) return callout({ tone: 'danger', title: 'Could not read billing', body: `<p>${escape(view.error)}</p>`, actions: button({ label: 'Try again', icon: 'refresh', size: 'sm', action: 'billing-refresh' }) });
  if (!view.data) return skeleton({ rows: 4 });
  if (view.data.demo) return `${demoNote()}${callout({ title: 'No billing in the demo', body: '<p>The demo never writes a line into a real billing tool.</p>' })}`;
  if (!view.data.configured) return callout({ title: 'Billing is not configured', body: '<p>Add a <code>billing</code> block to the configuration and turn on the <code>billing.export</code> flag for a Tenant. The operations guide “Bill accepted tickets through Simplicate” has the steps.</p>' });
  return `${ownersCard(view.data)}${linesCard(view.data)}`;
}

function renderBilling() {
  const content = `<div class="settings-page billing-page"${view.loading ? ' aria-busy="true"' : ''}>${body()}</div>`;
  renderHtml(shell(content, { title: 'Billing', subtitle: 'One line per accepted ticket, written into your own billing tool. Your tool makes and sends the invoice; Unfold never does.' }));
}

async function load() {
  view.loading = true; view.error = '';
  if (state.view === 'billing') renderBilling();
  try { view.data = await api('/api/billing'); }
  catch (error) { if (error.status !== 401) view.error = error.message || 'Unfold did not answer.'; }
  view.loading = false;
  if (state.view === 'billing') renderBilling();
}

async function act(path, payload, message) {
  const result = await api(path, { method: 'POST', body: JSON.stringify(payload) });
  await load();
  announce(message);
  return result;
}

async function saveMapping(data, form) {
  const target = Object.fromEntries(Object.entries(data).filter(([key]) => key.startsWith('target.')).map(([key, value]) => [key.slice(7), String(value).trim()]));
  const perSize = Object.fromEntries(Object.entries(data).filter(([key]) => key.startsWith('size.')).map(([key, value]) => [key.slice(5), priceField(value)]).filter(([, value]) => value));
  const payload = { tenant: form.dataset.tenant, client: form.dataset.client || null, target, price: { perTicket: priceField(data.perTicket), perSize }, since: data.since || '' };
  await api('/api/billing/mappings', { method: 'PUT', body: JSON.stringify(payload) });
  await load();
  notify('Mapping saved.');
}

async function unmap(element) {
  const query = new URLSearchParams({ tenant: element.dataset.tenant, ...(element.dataset.client ? { client: element.dataset.client } : {}) });
  await api(`/api/billing/mappings?${query}`, { method: 'DELETE' });
  await load();
  notify('Mapping removed.');
}

async function sync() {
  view.busy = 'sync'; renderBilling();
  try {
    const result = await api('/api/billing/sync', { method: 'POST', body: '{}' });
    notify(`Sync done: ${result.added} new, ${result.sent} sent, ${result.failed} failed, ${result.unmapped} accepted Work Items without a mapping.`);
  } finally { view.busy = ''; await load(); }
}

async function enterBilling() {
  disconnect(); state.session = null; state.view = 'billing';
  renderBilling();
  await load();
}

/** Billing (`#settings/billing`, administrators): map each Client to the billing tool and see the lines sent or failed. */
export default {
  id: 'billing',
  match: hash => hash === 'settings/billing' ? {} : null,
  enter: enterBilling,
  render: renderBilling,
  actions: {
    'billing-refresh': () => load(),
    'billing-sync': () => sync(),
    'billing-unmap': element => unmap(element),
    'billing-send': element => act(`/api/billing/lines/${element.dataset.id}/send`, { checked: element.dataset.checked === '1' }, 'Sent again.'),
    'billing-found': element => act(`/api/billing/lines/${element.dataset.id}/found`, {}, 'Marked as found in the tool.'),
  },
  forms: {
    'billing-mapping': saveMapping,
    'billing-price': (data, form) => act(`/api/billing/lines/${form.dataset.id}/price`, { price: priceField(data.price) }, 'Price set.'),
    'billing-reverse': (data, form) => act(`/api/billing/lines/${form.dataset.id}/reverse`, { reason: String(data.reason ?? ''), ...(data.revertUrl ? { revertUrl: String(data.revertUrl) } : {}) }, 'Reversed.'),
  },
};
