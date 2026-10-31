import { state, onForget, disconnect } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, renderHtml, notify, announce } from '../core/dom.js';
import { count, plural } from '../core/format.js';
import { icon } from '../core/icons.js';
import { badge, button, callout, emptyState, skeleton, table, timeAt } from '../core/ui.js';
import { failureCallout, failureOf } from '../core/failure.js';
import { enabled } from '../core/flags.js';
import { shell } from '../shell.js';
import { confirmAction } from './dialogs.js';

const fresh = () => ({ jobs: null, jobsError: null, audit: null, auditError: null, auditBusy: false, exports: null, exportsError: null, exportBusy: false, polling: 0 });
const view = fresh();
onForget(() => Object.assign(view, fresh()));

const isAdmin = () => state.bootstrap?.user?.role === 'admin';
const pollMs = 3000;

const jobKinds = {
  'outbound.delivery': 'Webhook deliveries',
  'notify.notice': 'Notices to people',
  'billing.line': 'Billing lines',
  'report.file': 'Bug reports',
  'audit.export': 'Audit export',
  'agent_trace.comment': 'Agent Trace comments',
  'client_sign_off.comment': 'Client Sign-off comments',
};

const chainBreaks = {
  sequence_gap: 'a record is missing: the sequence numbers skip one',
  previous_hash: 'this record does not link to the record before it',
  hash: 'this record changed after it was written',
  unreadable: 'this record cannot be read',
};

const checkpointProblems = {
  ahead_of_chain: 'the checkpoint names a record the chain does not have',
  hash_mismatch: 'the checkpoint and the chain disagree about a record',
  missing_record: 'the record the checkpoint names is gone',
  bad_signature: 'the signature does not match',
  unsigned: 'the checkpoint is not signed',
  signer_unavailable: 'the signing service did not answer',
  unreadable: 'the checkpoint cannot be read',
  wrong_tenant: 'the checkpoint belongs to another Tenant',
  stale: 'the newest checkpoint is older than it should be',
  storage_unavailable: 'the checkpoint storage did not answer',
};

const exportStates = { running: ['live', 'Building'], ready: ['success', 'Ready'], failed: ['danger', 'Failed'] };

/** A background job kind in plain words, such as "Webhook deliveries" for `outbound.delivery`; an unknown kind stays as it is. */
export function jobKindName(kind) {
  return jobKinds[kind] ?? kind;
}

/** A byte count in words with one decimal in the Dutch style, such as "1,5 MB"; null reads "Not known". */
export function sizeText(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return 'Not known';
  const units = ['bytes', 'kB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) { value /= 1000; unit += 1; }
  return unit === 0 ? `${count(bytes)} bytes` : `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}

/**
 * The outcome of an audit trail check in words: `tone` and `title` for the notice and `lines`, each a plain sentence,
 * for the chain and for its signed checkpoints.
 * @param {{ tenant: string, ok: boolean, checked: number, head: { sequence: number } | null, anchor: { sequence: number } | null, break: { sequence: number, reason: string } | null, checkpoints: null | { ok: boolean, checked: number, problems: { reason: string, sequence?: number }[] } }} result
 */
export function auditVerdict(result) {
  const lines = [];
  const records = plural(result.checked, 'record');
  if (!result.head) lines.push(`Tenant ${result.tenant} has no audit records yet.`);
  else lines.push(`${records} checked in Tenant ${result.tenant}${result.anchor ? `, from record ${result.anchor.sequence} where older records were removed by retention` : ''}, up to record ${result.head.sequence}.`);
  if (result.break) lines.push(`Record ${result.break.sequence}: ${chainBreaks[result.break.reason] ?? result.break.reason}.`);
  const checkpoints = result.checkpoints;
  if (!checkpoints) lines.push('No signed checkpoints are configured, so only the chain itself was checked.');
  else if (checkpoints.ok) lines.push(`${plural(checkpoints.checked, 'signed checkpoint')} ${checkpoints.checked === 1 ? 'matches' : 'match'} the chain.`);
  else for (const problem of checkpoints.problems) lines.push(`Checkpoint${typeof problem.sequence === 'number' ? ` at record ${problem.sequence}` : ''}: ${checkpointProblems[problem.reason] ?? problem.reason}.`);
  return result.ok
    ? { tone: 'success', title: 'The audit trail is intact', lines }
    : { tone: 'danger', title: 'The audit trail does not check out', lines: [...lines, 'Keep the database file as it is and compare it with your backups and the copy your SIEM received.'] };
}

function card(id, title, subtitle, body, actions = '') {
  return `<section class="card settings-card" aria-labelledby="${id}-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="${id}-title">${escape(title)}</h2><p class="card-subtitle">${escape(subtitle)}</p></div>${actions ? `<div class="card-actions">${actions}</div>` : ''}</header><div class="card-body">${body}</div></section>`;
}

function jobsBody() {
  if (view.jobsError && !view.jobs) return failureCallout({ title: 'Could not read the background work', failure: view.jobsError, action: 'admin-jobs-refresh' });
  if (!view.jobs) return skeleton({ rows: 3, variant: 'table' });
  const { kinds, troubled } = view.jobs;
  if (!kinds.length) return emptyState({ icon: 'inbox', title: 'Nothing has been queued yet', body: 'Webhook deliveries, notices, billing lines, bug reports, audit export and pull request comments wait here while they are sent.', compact: true });
  const counts = table({
    caption: 'Background work by kind', compact: true, rowHeader: true,
    columns: [{ key: 'kind', label: 'Kind' }, { key: 'pending', label: 'Waiting', numeric: true }, { key: 'running', label: 'Running', numeric: true }, { key: 'done', label: 'Done', numeric: true }, { key: 'dead', label: 'Gave up', numeric: true }, { key: 'oldest', label: 'Oldest waiting since' }],
    rows: kinds.map(entry => ({
      kind: `${escape(jobKindName(entry.kind))}<br><code class="meta">${escape(entry.kind)}</code>`,
      pending: `<span class="num">${escape(count(entry.pending))}</span>`,
      running: `<span class="num">${escape(count(entry.running))}</span>`,
      done: `<span class="num">${escape(count(entry.done))}</span>`,
      dead: entry.dead ? badge({ tone: 'danger', glyph: 'x-circle', label: count(entry.dead), size: 'sm' }) : '<span class="num">0</span>',
      oldest: entry.oldestDueAt ? timeAt(entry.oldestDueAt) : 'Nothing waiting',
    })),
  });
  const failed = troubled.length ? table({
    caption: 'Jobs that failed', compact: true,
    columns: [{ key: 'when', label: 'Last change' }, { key: 'kind', label: 'Kind' }, { key: 'state', label: 'State' }, { key: 'attempts', label: 'Attempts', numeric: true }, { key: 'error', label: 'Last error' }],
    rows: troubled.map(job => ({
      when: timeAt(job.updatedAt),
      kind: escape(jobKindName(job.kind)),
      state: job.state === 'dead' ? badge({ tone: 'danger', glyph: 'x-circle', label: 'Gave up', size: 'sm' }) : badge({ tone: 'attention', glyph: 'refresh', label: 'Retrying', size: 'sm' }),
      attempts: `<span class="num">${escape(count(job.attempts))} of ${escape(count(job.maxAttempts))}</span>`,
      error: job.lastError ? `<span class="mono">${escape(job.lastError)}</span>` : 'None recorded',
    })),
  }) : callout({ tone: 'success', title: 'No job failed', body: '<p>Nothing gave up and nothing is waiting for a retry.</p>' });
  const resend = '<p class="meta">This list only reads. Send work that gave up again from its own page: <a href="#settings/webhooks">Send again on a webhook delivery</a> or <a href="#settings/billing">on a billing line</a>.</p>';
  return `${counts}<h3 class="overline admin-subheading">Failed and retrying</h3>${failed}${resend}`;
}

function auditBody() {
  const form = `<form class="settings-form admin-audit-form" data-form="admin-audit-verify">
<div class="field"><label class="field-label" for="admin-audit-tenant">Tenant (optional)</label><input id="admin-audit-tenant" name="tenant" type="text" maxlength="63" pattern="[a-z0-9-]*" autocomplete="off" spellcheck="false" aria-describedby="admin-audit-tenant-hint"><p class="field-hint" id="admin-audit-tenant-hint">Leave it empty when you administer one Tenant. Otherwise give its id, such as <code>default</code>.</p></div>
<label class="flag-check"><input type="checkbox" name="all"><span>Check every signed checkpoint, not only the newest <span class="meta">slower; the newest already covers every earlier record</span></span></label>
<div>${button({ type: 'submit', label: 'Check the audit trail', icon: 'shield', variant: 'primary', size: 'sm', busy: view.auditBusy })}</div></form>`;
  let result = '';
  if (view.auditError) result = failureCallout({ title: 'Could not check the audit trail', failure: view.auditError });
  else if (view.audit) {
    const verdict = auditVerdict(view.audit);
    result = callout({ tone: verdict.tone, title: verdict.title, body: `<ul>${verdict.lines.map(line => `<li>${escape(line)}</li>`).join('')}</ul>` });
  }
  return `${form}<div class="admin-result" role="status">${result}</div>`;
}

function exportRow(job) {
  const [tone, label] = exportStates[job.state] ?? ['neutral', job.state];
  const actions = [
    job.state === 'ready' ? `<a class="button secondary sm" href="/api/admin/tenant-exports/${encodeURIComponent(job.id)}/download" download aria-label="${escape(`Download the export of ${job.tenant}`)}">${icon('download')}<span class="button-label">Download</span></a>` : '',
    job.state !== 'running' ? button({ label: 'Delete', size: 'sm', variant: 'danger-ghost', action: 'admin-export-delete', data: { id: job.id }, ariaLabel: `Delete the export of ${job.tenant}` }) : '',
  ].join(' ');
  return {
    started: timeAt(job.createdAt),
    tenant: `<code>${escape(job.tenant)}</code>`,
    state: `${badge({ tone, label, size: 'sm' })}${job.error ? `<p class="field-hint">${escape(job.error)}</p>` : ''}`,
    size: job.state === 'ready' ? `<span class="num">${escape(sizeText(job.bytes))}</span><br><span class="meta num">${escape(plural(job.rows ?? 0, 'row'))}</span>` : '',
    expires: job.expiresAt ? timeAt(job.expiresAt) : '',
    actions,
  };
}

function exportBody() {
  if (!enabled('tenant.export') || view.exportsError?.code === 'tenant_export_off') return callout({ tone: 'neutral', title: 'Tenant export is off', body: '<p>Turn on the <code>tenant.export</code> flag on the <a href="#settings/labs">Labs</a> page to export everything Unfold holds for a Tenant.</p>' });
  if (view.exportsError && !view.exports) return failureCallout({ title: 'Could not read your exports', failure: view.exportsError, action: 'admin-exports-refresh' });
  if (!view.exports) return skeleton({ rows: 2, variant: 'table' });
  const running = view.exports.some(job => job.state === 'running');
  const form = `<form class="settings-form" data-form="admin-export-start">
<div class="flag-rule-grid"><div class="field"><label class="field-label" for="admin-export-tenant">Tenant</label><input id="admin-export-tenant" name="tenant" type="text" required maxlength="63" pattern="[a-z0-9-]+" autocomplete="off" spellcheck="false" value="default" aria-describedby="admin-export-tenant-hint"><p class="field-hint" id="admin-export-tenant-hint">While Tenants are not enforced, only <code>default</code> exists.</p></div>
<div class="field"><label class="field-label" for="admin-export-confirm">Type the Tenant id again to confirm</label><input id="admin-export-confirm" name="confirm" type="text" required maxlength="63" autocomplete="off" spellcheck="false" aria-describedby="admin-export-confirm-hint"><p class="field-hint" id="admin-export-confirm-hint">The bundle holds every record of the Tenant, people's names included. Keep it as safe as the database.</p></div></div>
<div>${button({ type: 'submit', label: running ? 'An export is being built' : 'Start the export', icon: 'download', variant: 'primary', size: 'sm', busy: view.exportBusy, disabled: running })}</div></form>`;
  const list = table({
    caption: 'Your exports', compact: true,
    columns: [{ key: 'started', label: 'Started' }, { key: 'tenant', label: 'Tenant' }, { key: 'state', label: 'State' }, { key: 'size', label: 'Size', numeric: true }, { key: 'expires', label: 'Deleted after' }, { key: 'actions', label: 'Action' }],
    rows: view.exports.map(exportRow),
    empty: 'No exports yet. One you start shows here until it is deleted.',
  });
  return `${form}${list}<p class="meta">A gzip-compressed tar of JSON Lines, one file per table, with a JSON Schema for each and a manifest. The workbench deletes the bundle once it expires or Unfold restarts. Each download is recorded in the audit trail.</p>`;
}

function render() {
  const content = isAdmin()
    ? `${card('admin-jobs', 'Background work', 'What Unfold is sending in the background, and what failed.', jobsBody(), button({ label: 'Refresh', icon: 'refresh', size: 'sm', action: 'admin-jobs-refresh' }))}${card('admin-audit', 'Audit trail check', 'Whether any audit record was changed, removed or added out of order since it was written.', auditBody())}${card('admin-export', 'Export all data', 'Everything Unfold holds for one Tenant, to move to another workbench or keep as an archive.', exportBody())}`
    : callout({ tone: 'neutral', title: 'Administrators only', body: '<p>An administrator of this workbench reads its background work, checks its audit trail and exports its data here.</p>' });
  renderHtml(shell(`<div class="settings-page">${content}</div>`, { title: 'Administration', subtitle: 'Background work, the audit trail check and a full data export.' }));
}

const showing = () => state.view === 'admin' && Boolean(state.bootstrap);

async function loadJobs() {
  try { view.jobs = await api('/api/admin/jobs'); view.jobsError = null; }
  catch (error) { if (error.status !== 401) view.jobsError = failureOf(error); }
}

async function loadExports() {
  if (!enabled('tenant.export')) return;
  try { view.exports = (await api('/api/admin/tenant-exports')).exports; view.exportsError = null; }
  catch (error) { if (error.status !== 401) view.exportsError = failureOf(error); }
}

function poll() {
  const turn = ++view.polling;
  const watched = new Set((view.exports ?? []).filter(job => job.state === 'running').map(job => job.id));
  setTimeout(async () => {
    if (turn !== view.polling || !showing()) return;
    await loadExports();
    if (turn !== view.polling || !showing()) return;
    render();
    for (const job of view.exports ?? []) if (watched.has(job.id) && job.state !== 'running') announce(job.state === 'ready' ? `The export of ${job.tenant} is ready to download.` : `The export of ${job.tenant} failed.`);
    if (view.exports?.some(job => job.state === 'running')) poll();
  }, pollMs);
}

async function enter() {
  disconnect(); state.session = null; state.view = 'admin';
  view.audit = null; view.auditError = null;
  render();
  if (!isAdmin()) return;
  await Promise.all([loadJobs(), loadExports()]);
  if (!showing()) return;
  render();
  if (view.exports?.some(job => job.state === 'running')) poll();
}

async function verify(data) {
  view.auditBusy = true; view.auditError = null; view.audit = null;
  render();
  try {
    const query = new URLSearchParams({ ...(data.tenant ? { tenant: String(data.tenant).trim() } : {}), ...(data.all ? { checkpoints: 'all' } : {}) });
    view.audit = await api(`/api/admin/audit/verify${query.size ? `?${query}` : ''}`);
  } catch (error) { view.auditError = failureOf(error); }
  finally { view.auditBusy = false; }
  if (showing()) render();
}

async function startExport(data) {
  const tenant = String(data.tenant ?? '').trim();
  if (String(data.confirm ?? '').trim() !== tenant) throw new Error(`Type ${tenant || 'the Tenant id'} again in the confirmation field to start the export.`);
  view.exportBusy = true;
  render();
  try {
    await api('/api/admin/tenant-exports', { method: 'POST', body: JSON.stringify({ tenant, confirm: tenant }) });
    await loadExports();
    notify('The export is being built. It shows as Ready here when you can download it.');
  } finally { view.exportBusy = false; }
  if (!showing()) return;
  render();
  poll();
}

function deleteExport(element) {
  const id = element.dataset.id;
  confirmAction('Delete this export?', 'The bundle is removed from the workbench at once. Copies you already downloaded stay where you saved them.', 'Delete', async () => {
    await api(`/api/admin/tenant-exports/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadExports();
    if (showing()) render();
    notify('The export is deleted.');
  }, { tone: 'danger', dismiss: 'Keep it' });
}

/** Administration (`#settings/admin`, administrators): the background job queue, the audit trail check and Tenant export. */
export default {
  id: 'admin',
  match: hash => hash === 'settings/admin' ? {} : null,
  enter,
  render,
  actions: {
    'admin-jobs-refresh': async () => { view.jobsError = null; await loadJobs(); if (showing()) { render(); announce('Background work refreshed.'); } },
    'admin-exports-refresh': async () => { view.exportsError = null; view.exports = null; render(); await loadExports(); if (showing()) render(); },
    'admin-export-delete': deleteExport,
  },
  forms: { 'admin-audit-verify': verify, 'admin-export-start': startExport },
};
