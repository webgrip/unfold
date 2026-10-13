import { state, onForget, disconnect } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, renderHtml, notify, announce } from '../core/dom.js';
import { badge, button, callout, disclosure, emptyState, segmented, skeleton, table, timeAt } from '../core/ui.js';
import { useFlagValues } from '../core/flags.js';
import { icon } from '../core/icons.js';
import { shell } from '../shell.js';

const view = { labs: null, admin: null, error: '', adminError: '', busy: '' };
onForget(() => Object.assign(view, { labs: null, admin: null, error: '', adminError: '', busy: '' }));

const isAdmin = () => state.bootstrap?.user?.role === 'admin';
const kindWords = { release: 'Release', experiment: 'Experiment', ops: 'Operations', permission: 'Permission' };
const reasonWords = { STATIC: 'Set for everyone', DEFAULT: 'The default', TARGETING_MATCH: 'Chosen by its rules', SPLIT: 'Chosen by a percentage rollout', DISABLED: 'Switched off for everyone', ERROR: 'Could not be evaluated; using the default' };

function valueText(value) {
  if (value === true) return 'On';
  if (value === false) return 'Off';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function why(entry) {
  if (entry.choice !== 'default') return `Your choice: ${entry.choice === 'on' ? 'on' : 'off'}`;
  return reasonWords[entry.reason] || entry.reason;
}

function labsRow(entry) {
  const choice = segmented({ label: `${entry.title}: your choice`, action: 'labs-choice', items: [
    { id: `${entry.key}|default`, label: 'Default', selected: entry.choice === 'default' },
    { id: `${entry.key}|on`, label: 'On', selected: entry.choice === 'on' },
    { id: `${entry.key}|off`, label: 'Off', selected: entry.choice === 'off' },
  ] });
  const now = `${valueText(entry.value)} for you · ${why(entry)}`;
  const expiry = entry.expires ? ` Planned to become permanent or be removed by ${entry.expires}.` : '';
  return `<div class="settings-row labs-row"><div class="settings-row-text"><p class="settings-row-label">${escape(entry.title)} ${badge({ label: kindWords[entry.kind] || entry.kind, size: 'sm', tone: entry.kind === 'experiment' ? 'review' : 'neutral' })}</p><p class="settings-row-hint">${escape(entry.description)}${escape(expiry)}</p><p class="meta labs-now"><span class="num">${escape(now)}</span></p></div><div class="settings-row-controls">${choice}</div></div>`;
}

function labsCard() {
  let body;
  if (view.error && !view.labs) body = callout({ tone: 'danger', title: 'Could not read Labs', body: `<p>${escape(view.error)}</p>` });
  else if (!view.labs) body = skeleton({ rows: 2 });
  else if (!view.labs.labs.length) body = emptyState({ icon: 'spark', title: 'Nothing in Labs right now', body: 'When a new feature is ready to try, it appears here first.', compact: true });
  else body = `<div class="settings-rows">${view.labs.labs.map(labsRow).join('')}</div>`;
  return `<section class="card settings-card" aria-labelledby="labs-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="labs-title">Labs</h2><p class="card-subtitle">Try features before everyone gets them. Your choice applies to you on every device and wins over the default.</p></div></header><div class="card-body">${body}</div></section>`;
}

function overrideForm(flag) {
  const variants = Object.keys(flag.rule.variants);
  const options = [`<option value="">No override</option>`, ...variants.map(name => `<option value="${escape(name)}"${flag.override?.variant === name ? ' selected' : ''}>${escape(name)} (${escape(valueText(flag.rule.variants[name]))})</option>`)].join('');
  const id = `flag-${flag.key.replace(/[^a-z0-9]/g, '-')}`;
  return `<form class="flag-override" data-form="flag-override" data-key="${escape(flag.key)}"><div class="field"><label class="field-label" for="${id}-variant">Force for everyone</label><select id="${id}-variant" name="variant">${options}</select></div><div class="field"><label class="field-label" for="${id}-reason">Reason</label><input id="${id}-reason" name="reason" type="text" maxlength="300" autocomplete="off" value="${escape(flag.override?.reason ?? '')}" aria-describedby="${id}-reason-hint"><p class="field-hint" id="${id}-reason-hint">Required to force a variant; recorded in the audit trail.</p></div>${button({ type: 'submit', label: 'Save', variant: 'secondary', size: 'sm', busy: view.busy === flag.key })}</form>`;
}

function adminCard() {
  if (!isAdmin()) return '';
  if (view.adminError && !view.admin) return `<section class="card settings-card"><div class="card-body">${callout({ tone: 'danger', title: 'Could not read the feature flags', body: `<p>${escape(view.adminError)}</p>` })}</div></section>`;
  if (!view.admin) return `<section class="card settings-card"><div class="card-body">${skeleton({ rows: 3 })}</div></section>`;
  const rows = view.admin.flags.map(flag => ({
    flag: `<strong>${escape(flag.metadata.title)}</strong><br><code>${escape(flag.key)}</code>`,
    kind: escape(kindWords[flag.metadata.kind] || flag.metadata.kind),
    owner: escape(flag.metadata.owner),
    expires: flag.metadata.expires ? `${escape(flag.metadata.expires)}${flag.expired ? ` ${badge({ label: 'Expired', tone: 'danger', size: 'sm' })}` : ''}` : '—',
    rule: `${escape(flag.rule.state === 'DISABLED' ? 'Disabled' : `Default ${flag.rule.defaultVariant}`)}${flag.rule.targeting ? ' · targeting' : ''}<br><span class="meta">from ${escape(flag.source)}</span>`,
    you: `${escape(valueText(flag.evaluation.value))}<br><span class="meta">${escape(reasonWords[flag.evaluation.reason] || flag.evaluation.reason)}</span>`,
    seen: escape(Object.entries(flag.evaluations).map(([variant, count]) => `${variant} ${count}`).join(' · ') || 'none yet'),
    override: disclosure({ summary: flag.override ? `${flag.override.variant} · ${flag.override.by}` : 'None', body: overrideForm(flag) }),
  }));
  const flags = table({ caption: 'Feature flags', columns: [{ key: 'flag', label: 'Flag' }, { key: 'kind', label: 'Kind' }, { key: 'owner', label: 'Owner' }, { key: 'expires', label: 'Remove by' }, { key: 'rule', label: 'Rule' }, { key: 'you', label: 'For you' }, { key: 'seen', label: 'Evaluations since start' }, { key: 'override', label: 'Override' }], rows: view.admin.flags.length ? rows : [], empty: 'This version has no feature flags.' });
  const file = view.admin.file?.file ? `<p class="meta">${icon('file')}<span>Watching <code>${escape(view.admin.file.file)}</code> every 5 seconds${view.admin.file.error ? `. The last change was rejected and the previous rules stay in force: ${escape(view.admin.file.error)}` : '.'}</span></p>` : '<p class="meta">No flag file is mounted; rules come from the code and the configuration file.</p>';
  const audit = view.admin.audit.length ? `<ol class="flag-audit">${view.admin.audit.map(entry => `<li><span class="num">${timeAt(entry.at)}</span> · ${escape(entry.actor)} ${entry.action === 'override_set' ? `forced <code>${escape(entry.flagKey)}</code> to ${escape(entry.variant)}` : `cleared the override of <code>${escape(entry.flagKey)}</code>`}${entry.reason ? `: “${escape(entry.reason)}”` : ''}</li>`).join('')}</ol>` : '<p class="meta">No overrides have been set or cleared.</p>';
  return `<section class="card settings-card" aria-labelledby="flags-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="flags-title">All feature flags</h2><p class="card-subtitle">Administrators only. Rules live in Git: the code's registry, then the deployment's flag file. An override here forces one variant for everyone until you clear it.</p></div></header><div class="card-body">${file}${flags}<h3 class="overline flag-audit-title">Audit trail</h3>${audit}</div></section>`;
}

function renderLabs() {
  const note = `<p class="settings-footnote">${icon('spark')}<span>A Labs feature can change or disappear. Your choice is stored on the server for your account.</span></p>`;
  renderHtml(shell(`<div class="settings-page">${labsCard()}${adminCard()}${note}</div>`, { title: 'Labs', subtitle: 'Features you can try early, and for administrators every feature flag.' }));
}

async function enterLabs() {
  disconnect(); state.session = null; state.view = 'labs';
  view.error = ''; view.adminError = '';
  renderLabs();
  const [labs, admin] = await Promise.allSettled([api('/api/flags'), isAdmin() ? api('/api/admin/flags') : Promise.resolve(null)]);
  if (labs.status === 'fulfilled') { view.labs = labs.value; useFlagValues(labs.value.values); }
  else if (labs.reason.status !== 401) view.error = labs.reason.message;
  if (admin.status === 'fulfilled') view.admin = admin.value;
  else if (admin.reason.status !== 401) view.adminError = admin.reason.message;
  if (state.view === 'labs') renderLabs();
}

async function choose(element) {
  const [key, choice] = String(element.dataset.id).split('|');
  view.labs = await api(`/api/flags/${encodeURIComponent(key)}/choice`, { method: 'PUT', body: JSON.stringify({ choice }) });
  useFlagValues(view.labs.values);
  if (isAdmin()) view.admin = await api('/api/admin/flags').catch(() => view.admin);
  renderLabs();
  const entry = view.labs.labs.find(item => item.key === key);
  announce(entry ? `${entry.title}: ${valueText(entry.value).toLowerCase()} for you` : 'Saved');
}

async function saveOverride(data, form) {
  const key = form.dataset.key;
  view.busy = key;
  renderLabs();
  try {
    const variant = data.variant ? String(data.variant) : null;
    view.admin = await api(`/api/admin/flags/${encodeURIComponent(key)}/override`, { method: 'PUT', body: JSON.stringify({ variant, reason: String(data.reason ?? '') }) });
    view.labs = await api('/api/flags');
    useFlagValues(view.labs.values);
    notify(variant ? `${key} is forced to ${variant} for everyone.` : `${key} follows its rules again.`);
  } finally {
    view.busy = '';
    if (state.view === 'labs') renderLabs();
  }
}

/** Labs (`#settings/labs`): the person's opt-in and opt-out choices for Labs flags and, for administrators, every feature flag with its rule, source, expiry, evaluations, overrides and audit trail. */
export default {
  id: 'labs',
  match: hash => hash === 'settings/labs' ? {} : null,
  enter: enterLabs,
  render: renderLabs,
  actions: { 'labs-choice': choose },
  forms: { 'flag-override': saveOverride },
};
