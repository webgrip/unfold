import { state, onForget, disconnect } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, renderHtml, notify, announce, download } from '../core/dom.js';
import { badge, button, callout, disclosure, emptyState, segmented, skeleton, table, timeAt } from '../core/ui.js';
import { useFlagValues } from '../core/flags.js';
import { icon } from '../core/icons.js';
import { shell } from '../shell.js';

const view = { labs: null, admin: null, error: '', adminError: '', busy: '', open: new Set() };
onForget(() => Object.assign(view, { labs: null, admin: null, error: '', adminError: '', busy: '', open: new Set() }));

const isAdmin = () => state.bootstrap?.user?.role === 'admin';
const fullShare = 10000;
const kindWords = { release: 'Release', experiment: 'Experiment', ops: 'Operations', permission: 'Permission' };
const reasonWords = { STATIC: 'Set for everyone', DEFAULT: 'The default', TARGETING_MATCH: 'Chosen by its rules', SPLIT: 'Chosen by a percentage rollout', DISABLED: 'Switched off for everyone', ERROR: 'Could not be evaluated; using the default' };
const sourceWords = { code: 'the code', config: 'the configuration file', file: 'the flag file (Git)', console: 'a rollout authored here', override: 'an override' };
const audienceWords = { everyone: 'Everyone', segment: 'Segment', roles: 'Roles', teams: 'Teams', users: 'People (user ids)', tenants: 'Tenants', prerequisite: 'Another flag' };
const stickinessWords = { targetingKey: 'person', tenantId: 'Tenant', role: 'role' };

/** A flag value in words: On, Off, or the value itself. */
export function valueText(value) {
  if (value === true) return 'On';
  if (value === false) return 'Off';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const percent = share => `${Number((share / 100).toFixed(2))} %`;
const localInput = iso => { if (!iso) return ''; const at = new Date(iso); const pad = n => String(n).padStart(2, '0'); return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`; };
const isoFrom = value => value ? new Date(String(value)).toISOString() : undefined;
const list = value => String(value ?? '').split(/[\s,]+/).map(item => item.trim()).filter(Boolean);
const shareFrom = value => Math.round(Number(String(value ?? '').replace(',', '.')) * 100);

/** One rule of a rollout in words, for the summary. */
export function ruleWords(rule) {
  const audience = rule.audience ?? {};
  const who = audience.segment ? `segment ${audience.segment}` : audience.roles ? `roles ${audience.roles.join(', ')}` : audience.teams ? `Teams ${audience.teams.join(', ')}` : audience.users ? `${audience.users.length} ${audience.users.length === 1 ? 'person' : 'people'}` : audience.tenants ? `Tenants ${audience.tenants.join(', ')}` : audience.prerequisite ? `when ${audience.prerequisite.flag} is ${audience.prerequisite.variants.join(' or ')}` : 'everyone';
  const when = rule.window ? ` ${rule.window.start ? `from ${new Date(rule.window.start).toLocaleString()}` : ''}${rule.window.end ? ` until ${new Date(rule.window.end).toLocaleString()}` : ''}` : '';
  const serve = rule.serve;
  const by = serve.stickiness && serve.stickiness !== 'targetingKey' ? `, by ${stickinessWords[serve.stickiness] ?? serve.stickiness}` : '';
  const what = serve.kind === 'variant' ? `serve ${serve.variant}`
    : serve.kind === 'split' ? `split ${Object.entries(serve.weights).map(([name, share]) => `${percent(share)} ${name}`).join(' · ')}${by}`
      : `ramp ${serve.variant} from ${percent(serve.from)} to ${percent(serve.to)} between ${new Date(serve.start).toLocaleDateString()} and ${new Date(serve.end).toLocaleDateString()}${by}`;
  return `${who[0].toUpperCase()}${who.slice(1)}${when}: ${what}`;
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

const option = (value, label, selected) => `<option value="${escape(value)}"${selected ? ' selected' : ''}>${escape(label)}</option>`;

function audienceOf(audience = {}) {
  if (audience.segment) return ['segment', audience.segment];
  for (const kind of ['roles', 'teams', 'users', 'tenants']) if (audience[kind]?.length) return [kind, audience[kind].join(', ')];
  if (audience.prerequisite) return ['prerequisite', `${audience.prerequisite.flag}=${audience.prerequisite.variants.join(',')}`];
  return ['everyone', ''];
}

function ruleFields(flag, rule, index, segments) {
  const id = `flag-${flag.key.replace(/[^a-z0-9]/g, '-')}-r${index}`;
  const variants = Object.keys(flag.rule.variants);
  const blank = !rule;
  const [kind, target] = blank ? ['none', ''] : audienceOf(rule.audience);
  const serve = rule?.serve ?? { kind: 'variant', variant: variants[0] };
  const audienceSelect = `<select id="${id}-audience" name="r${index}.audience">${blank ? option('none', 'Add a rule…', true) : ''}${Object.entries(audienceWords).map(([value, label]) => option(value, label, value === kind)).join('')}</select>`;
  const segmentHint = segments.length ? `Segments: ${segments.map(segment => segment.name).join(', ')}.` : 'No segments yet.';
  const weights = serve.kind === 'split' ? serve.weights : Object.fromEntries(variants.map((name, position) => [name, position === 0 ? fullShare : 0]));
  const stickiness = name => `<select id="${id}-${name}" name="r${index}.${name}">${Object.entries(stickinessWords).map(([value, label]) => option(value, `By ${label}`, (serve.stickiness ?? 'targetingKey') === value)).join('')}</select>`;
  const radio = (value, label) => `<label class="flag-rule-kind"><input type="radio" name="r${index}.serve" value="${value}"${serve.kind === value ? ' checked' : ''}><span>${label}</span></label>`;
  return `<fieldset class="flag-rule" data-blank="${blank}"><legend>${blank ? 'New rule' : `Rule ${index + 1}`}</legend>
<div class="flag-rule-grid">
<div class="field"><label class="field-label" for="${id}-audience">Who</label>${audienceSelect}</div>
<div class="field"><label class="field-label" for="${id}-target">Which</label><input id="${id}-target" name="r${index}.target" type="text" autocomplete="off" value="${escape(target)}" aria-describedby="${id}-target-hint"><p class="field-hint" id="${id}-target-hint">Comma-separated. A segment by name, roles admin, operator or viewer, or another flag as key=variant. ${escape(segmentHint)}</p></div>
<div class="field"><label class="field-label" for="${id}-start">From (optional)</label><input id="${id}-start" name="r${index}.start" type="datetime-local" value="${escape(localInput(rule?.window?.start))}"></div>
<div class="field"><label class="field-label" for="${id}-end">Until (optional)</label><input id="${id}-end" name="r${index}.end" type="datetime-local" value="${escape(localInput(rule?.window?.end))}"></div>
</div>
<div class="flag-rule-serve" role="radiogroup" aria-label="What this rule serves">${radio('variant', 'One variant')}${radio('split', 'Percentage split')}${radio('ramp', 'Ramp over time')}</div>
<div class="flag-serve flag-serve-variant"><div class="field"><label class="field-label" for="${id}-variant">Serve</label><select id="${id}-variant" name="r${index}.variant">${variants.map(name => option(name, `${name} (${valueText(flag.rule.variants[name])})`, serve.variant === name)).join('')}</select></div></div>
<div class="flag-serve flag-serve-split">${variants.map(name => `<div class="field"><label class="field-label" for="${id}-w-${escape(name)}">${escape(name)} %</label><input id="${id}-w-${escape(name)}" name="r${index}.w.${escape(name)}" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${escape(String((weights[name] ?? 0) / 100))}"></div>`).join('')}<div class="field"><label class="field-label" for="${id}-sticky">Keep each</label>${stickiness('sticky')}</div><p class="field-hint">Shares must add up to 100 %. The same person keeps the same variant: they are bucketed by a hash of the flag and their id.</p></div>
<div class="flag-serve flag-serve-ramp"><div class="field"><label class="field-label" for="${id}-ramp-variant">Variant to ramp up</label><select id="${id}-ramp-variant" name="r${index}.rampVariant">${variants.map(name => option(name, name, (serve.variant ?? variants[0]) === name)).join('')}</select></div><div class="field"><label class="field-label" for="${id}-ramp-otherwise">Others get</label><select id="${id}-ramp-otherwise" name="r${index}.rampOtherwise">${variants.map(name => option(name, name, (serve.otherwise ?? variants[1] ?? variants[0]) === name)).join('')}</select></div><div class="field"><label class="field-label" for="${id}-from">From %</label><input id="${id}-from" name="r${index}.from" type="number" min="0" max="100" step="0.01" value="${escape(String((serve.from ?? 0) / 100))}"></div><div class="field"><label class="field-label" for="${id}-to">To %</label><input id="${id}-to" name="r${index}.to" type="number" min="0" max="100" step="0.01" value="${escape(String((serve.to ?? fullShare) / 100))}"></div><div class="field"><label class="field-label" for="${id}-ramp-start">Start</label><input id="${id}-ramp-start" name="r${index}.rampStart" type="datetime-local" value="${escape(localInput(serve.start))}"></div><div class="field"><label class="field-label" for="${id}-ramp-end">End</label><input id="${id}-ramp-end" name="r${index}.rampEnd" type="datetime-local" value="${escape(localInput(serve.end))}"></div><div class="field"><label class="field-label" for="${id}-ramp-sticky">Keep each</label>${stickiness('rampSticky')}</div><p class="field-hint">The share moves in twenty even steps between start and end. People who already have the variant keep it as the share grows.</p></div>
${blank ? '' : `<label class="flag-rule-remove"><input type="checkbox" name="r${index}.remove"><span>Remove this rule</span></label>`}
</fieldset>`;
}

function rolloutForm(flag) {
  const rollout = flag.rollout ?? { state: flag.rule.state, defaultVariant: flag.rule.defaultVariant, respectLabs: true, rules: [] };
  const id = `flag-${flag.key.replace(/[^a-z0-9]/g, '-')}`;
  const variants = Object.keys(flag.rule.variants);
  const rules = [...rollout.rules.map((rule, index) => ruleFields(flag, rule, index, view.admin.segments)), ruleFields(flag, null, rollout.rules.length, view.admin.segments)].join('');
  const labs = flag.metadata.labs ? `<label class="flag-check"><input type="checkbox" name="respectLabs"${rollout.respectLabs !== false ? ' checked' : ''}><span>People's Labs choices win over these rules</span></label>` : '';
  return `<form class="flag-rollout" data-form="flag-rollout" data-key="${escape(flag.key)}" data-rules="${rollout.rules.length + 1}">
<div class="flag-rule-grid"><div class="field"><label class="field-label" for="${id}-default">When no rule matches</label><select id="${id}-default" name="defaultVariant">${variants.map(name => option(name, `${name} (${valueText(flag.rule.variants[name])})`, rollout.defaultVariant === name)).join('')}</select></div></div>
<label class="flag-check"><input type="checkbox" name="disabled"${rollout.state === 'DISABLED' ? ' checked' : ''}><span>Switched off: serve the code's default to everyone</span></label>${labs}
<p class="meta">Rules are tried from the top; the first whose people and dates match decides.</p>
${rules}
<div class="field"><label class="field-label" for="${id}-rollout-reason">Reason</label><input id="${id}-rollout-reason" name="reason" type="text" maxlength="300" required autocomplete="off"></div>
<div class="flag-actions">${button({ type: 'submit', label: 'Save rollout', variant: 'primary', size: 'sm', busy: view.busy === `rollout:${flag.key}` })}${flag.rollout ? button({ label: 'Remove rollout', variant: 'ghost', size: 'sm', action: 'flag-rollout-clear', data: { id: flag.key } }) : ''}</div>
</form>`;
}

function overrideForm(flag) {
  const variants = Object.keys(flag.rule.variants);
  const options = [option('', 'No override', !flag.override), ...variants.map(name => option(name, `${name} (${valueText(flag.rule.variants[name])})`, flag.override?.variant === name))].join('');
  const id = `flag-${flag.key.replace(/[^a-z0-9]/g, '-')}`;
  return `<form class="flag-override" data-form="flag-override" data-key="${escape(flag.key)}"><div class="field"><label class="field-label" for="${id}-variant">Force for everyone</label><select id="${id}-variant" name="variant">${options}</select></div><div class="field"><label class="field-label" for="${id}-reason">Reason</label><input id="${id}-reason" name="reason" type="text" maxlength="300" autocomplete="off" value="${escape(flag.override?.reason ?? '')}" aria-describedby="${id}-reason-hint"><p class="field-hint" id="${id}-reason-hint">Required to force a variant; recorded in the audit trail. An override beats every rule and every service.</p></div>${button({ type: 'submit', label: 'Save override', variant: 'secondary', size: 'sm', busy: view.busy === flag.key })}</form>`;
}

function experimentMarkup(flag) {
  const experiment = flag.experiment;
  if (!experiment) return '';
  const variants = Object.keys(experiment.exposures);
  if (!variants.length) return `<p class="meta">No one has reached this flag in the last ${experiment.days} days, or product events are off.</p>`;
  const events = [...new Set(experiment.conversions.map(entry => entry.event))];
  const rows = variants.map(variant => {
    const people = experiment.exposures[variant];
    const cells = Object.fromEntries(events.map(event => { const hit = experiment.conversions.find(entry => entry.event === event && entry.variant === variant); return [event, hit ? `${hit.people} · ${Math.round(hit.people / people * 1000) / 10} %` : '0']; }));
    return { variant: escape(variant), people: String(people), ...Object.fromEntries(Object.entries(cells).map(([key, value]) => [key, escape(value)])) };
  });
  return `<h4 class="overline">Experiment · last ${experiment.days} days</h4>${table({ caption: `${flag.key} experiment`, columns: [{ key: 'variant', label: 'Variant' }, { key: 'people', label: 'People who saw it', numeric: true }, ...events.map(event => ({ key: event, label: event, numeric: true }))], rows, compact: true })}<p class="meta">People are counted once per variant from product events; a share is people who did it of people who saw the variant. No significance test is applied.</p>`;
}

function flagCard(flag) {
  const facts = [
    `${kindWords[flag.metadata.kind] || flag.metadata.kind} · owner ${flag.metadata.owner}`,
    flag.metadata.expires ? `remove by ${flag.metadata.expires}` : 'no removal date',
    `rule from ${sourceWords[flag.source] ?? flag.source}`,
    `${valueText(flag.evaluation.value)} for you (${reasonWords[flag.evaluation.reason] || flag.evaluation.reason}${flag.evaluation.flagMetadata?.provider ? `, ${flag.evaluation.flagMetadata.provider}` : ''})`,
    `evaluations since start: ${Object.entries(flag.evaluations).map(([variant, count]) => `${variant} ${count}`).join(' · ') || 'none yet'}`,
  ];
  const marks = [flag.expired ? badge({ label: 'Past its removal date', tone: 'danger', size: 'sm' }) : '', flag.settled && flag.metadata.kind === 'release' ? badge({ label: `Serves only ${flag.settled}: ready to remove?`, tone: 'attention', size: 'sm' }) : '', flag.override ? badge({ label: `Forced ${flag.override.variant}`, tone: 'severe', size: 'sm' }) : ''].filter(Boolean).join(' ');
  const rules = flag.rollout?.rules.length ? `<ol class="flag-rules">${flag.rollout.rules.map(rule => `<li>${escape(ruleWords(rule))}</li>`).join('')}<li>Otherwise: ${escape(flag.rollout.defaultVariant)}</li></ol>` : '';
  const authoring = view.admin.console ? disclosure({ summary: flag.rollout ? 'Edit the rollout' : 'Author a rollout', body: rolloutForm(flag), id: `flag-rollout-${flag.key.replace(/[^a-z0-9]/g, '-')}`, open: view.open.has(flag.key) }) : '<p class="meta">Rollouts are managed in Git on this workbench.</p>';
  return `<article class="flag-card" aria-labelledby="flag-${escape(flag.key.replace(/[^a-z0-9]/g, '-'))}-title"><header><h3 class="flag-card-title" id="flag-${escape(flag.key.replace(/[^a-z0-9]/g, '-'))}-title">${escape(flag.metadata.title)} <code>${escape(flag.key)}</code></h3>${marks ? `<p>${marks}</p>` : ''}</header><ul class="flag-facts meta">${facts.map(fact => `<li>${escape(fact)}</li>`).join('')}</ul>${rules}${experimentMarkup(flag)}${authoring}${disclosure({ summary: flag.override ? `Override: ${flag.override.variant} by ${flag.override.by}` : 'Override (kill switch)', body: overrideForm(flag) })}</article>`;
}

function segmentsCard() {
  const segments = view.admin.segments;
  const rows = segments.map(segment => ({
    name: `<code>${escape(segment.name)}</code>`,
    who: escape(Object.entries(segment.audience).map(([kind, names]) => `${audienceWords[kind] ?? kind}: ${names.join(', ')}`).join(' · ')),
    description: escape(segment.description),
    actions: view.admin.console ? button({ label: 'Delete', variant: 'danger-ghost', size: 'xs', action: 'flag-segment-delete', data: { id: segment.name } }) : '',
  }));
  const form = view.admin.console ? disclosure({ summary: 'Add or change a segment', body: `<form class="flag-segment" data-form="flag-segment"><div class="flag-rule-grid"><div class="field"><label class="field-label" for="segment-name">Name</label><input id="segment-name" name="name" type="text" required pattern="[a-z][a-z0-9-]{0,63}" autocomplete="off"></div><div class="field"><label class="field-label" for="segment-description">Description</label><input id="segment-description" name="description" type="text" maxlength="300" autocomplete="off"></div><div class="field"><label class="field-label" for="segment-roles">Roles</label><input id="segment-roles" name="roles" type="text" autocomplete="off" placeholder="admin, operator"></div><div class="field"><label class="field-label" for="segment-teams">Teams</label><input id="segment-teams" name="teams" type="text" autocomplete="off"></div><div class="field"><label class="field-label" for="segment-users">People (user ids)</label><input id="segment-users" name="users" type="text" autocomplete="off"></div><div class="field"><label class="field-label" for="segment-tenants">Tenants</label><input id="segment-tenants" name="tenants" type="text" autocomplete="off"></div></div><p class="field-hint">Every list you fill in must match. Saving an existing name changes it, and every rollout that uses it follows.</p>${button({ type: 'submit', label: 'Save segment', variant: 'secondary', size: 'sm' })}</form>` }) : '';
  return `<section class="card settings-card" aria-labelledby="segments-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="segments-title">Segments</h2><p class="card-subtitle">Named groups of people that rollouts reuse. They compile into each rule, so an exported rollout needs no segment of its own.</p></div></header><div class="card-body">${table({ caption: 'Segments', columns: [{ key: 'name', label: 'Name' }, { key: 'who', label: 'Who' }, { key: 'description', label: 'Description' }, { key: 'actions', label: '' }], rows, empty: 'No segments yet.' })}${form}</div></section>`;
}

function auditLine(entry) {
  const words = { override_set: `forced <code>${escape(entry.flagKey)}</code> to ${escape(entry.variant)}`, override_cleared: `cleared the override of <code>${escape(entry.flagKey)}</code>`, rollout_set: `saved the rollout of <code>${escape(entry.flagKey)}</code>`, rollout_cleared: `removed the rollout of <code>${escape(entry.flagKey)}</code>`, segment_set: `saved <code>${escape(entry.flagKey)}</code>`, segment_deleted: `deleted <code>${escape(entry.flagKey)}</code>` };
  return `<li><span class="num">${timeAt(entry.at)}</span> · ${escape(entry.actor)} ${words[entry.action] ?? escape(entry.action)}${entry.reason ? `: “${escape(entry.reason)}”` : ''}</li>`;
}

function adminCards() {
  if (!isAdmin()) return '';
  if (view.adminError && !view.admin) return `<section class="card settings-card"><div class="card-body">${callout({ tone: 'danger', title: 'Could not read the feature flags', body: `<p>${escape(view.adminError)}</p>` })}</div></section>`;
  if (!view.admin) return `<section class="card settings-card"><div class="card-body">${skeleton({ rows: 3 })}</div></section>`;
  const providers = view.admin.providers.map(provider => `<li>${escape(provider.name)}: ${provider.ready ? 'answering' : `not answering${provider.error ? ` (${escape(provider.error)})` : ''}`}</li>`).join('');
  const file = view.admin.file?.file ? `Watching <code>${escape(view.admin.file.file)}</code> every 5 seconds${view.admin.file.error ? `. The last change was rejected and the previous rules stay: ${escape(view.admin.file.error)}` : '.'}` : 'No flag file is mounted.';
  const where = `<div class="flag-sources meta"><p>${icon('file')}<span>${file}</span></p><p>Providers, asked in order (${escape(view.admin.strategy)}):</p><ol>${providers}</ol></div>`;
  const flags = view.admin.flags.length ? view.admin.flags.map(flagCard).join('') : '<p class="meta">This version has no feature flags.</p>';
  const exporter = view.admin.console ? button({ label: 'Export rollouts as flagd JSON', icon: 'download', variant: 'secondary', size: 'sm', action: 'flag-export' }) : '';
  const audit = view.admin.audit.length ? `<ol class="flag-audit">${view.admin.audit.map(auditLine).join('')}</ol>` : '<p class="meta">Nothing has changed yet.</p>';
  return `<section class="card settings-card" aria-labelledby="flags-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="flags-title">All feature flags</h2><p class="card-subtitle">Administrators only. Rules come from Git (the code and the flag file), from rollouts authored here, and from any flag service Unfold asks over OFREP. An override forces one variant for everyone.</p></div>${exporter}</header><div class="card-body">${where}<div class="flag-cards">${flags}</div><h3 class="overline flag-audit-title">Audit trail</h3>${audit}</div></section>${segmentsCard()}`;
}

function renderLabs() {
  const note = `<p class="settings-footnote">${icon('spark')}<span>A Labs feature can change or disappear. Your choice is stored on the server for your account.</span></p>`;
  renderHtml(shell(`<div class="settings-page">${labsCard()}${adminCards()}${note}</div>`, { title: 'Labs', subtitle: 'Features you can try early, and for administrators every feature flag, rollout and segment.' }));
}

async function loadAdmin() {
  if (!isAdmin()) return;
  try { view.admin = await api('/api/admin/flags'); view.adminError = ''; }
  catch (error) { if (error.status !== 401) view.adminError = error.message; }
}

async function enterLabs() {
  disconnect(); state.session = null; state.view = 'labs';
  view.error = ''; view.adminError = '';
  renderLabs();
  const [labs] = await Promise.allSettled([api('/api/flags'), loadAdmin()]);
  if (labs.status === 'fulfilled') { view.labs = labs.value; useFlagValues(labs.value.values); }
  else if (labs.reason.status !== 401) view.error = labs.reason.message;
  if (state.view === 'labs') renderLabs();
}

async function refreshLabs() {
  view.labs = await api('/api/flags');
  useFlagValues(view.labs.values);
}

async function choose(element) {
  const [key, choice] = String(element.dataset.id).split('|');
  view.labs = await api(`/api/flags/${encodeURIComponent(key)}/choice`, { method: 'PUT', body: JSON.stringify({ choice }) });
  useFlagValues(view.labs.values);
  await loadAdmin();
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
    await refreshLabs();
    notify(variant ? `${key} is forced to ${variant} for everyone.` : `${key} follows its rules again.`);
  } finally {
    view.busy = '';
    if (state.view === 'labs') renderLabs();
  }
}

/** Reads the rollout form into a rollout: one rule per filled-in fieldset, shares in basis points, times as ISO. */
export function rolloutFrom(data, count, variants) {
  const rules = [];
  for (let index = 0; index < count; index++) {
    const field = name => data[`r${index}.${name}`];
    const kind = field('audience');
    if (!kind || kind === 'none' || field('remove')) continue;
    const target = String(field('target') ?? '').trim();
    const audience = kind === 'everyone' ? {} : kind === 'segment' ? { segment: target } : kind === 'prerequisite' ? (() => { const [flag, wanted = ''] = target.split('='); return { prerequisite: { flag: flag.trim(), variants: list(wanted) } }; })() : { [kind]: list(target) };
    const window = { ...(field('start') ? { start: isoFrom(field('start')) } : {}), ...(field('end') ? { end: isoFrom(field('end')) } : {}) };
    const serveKind = field('serve') || 'variant';
    let serve;
    if (serveKind === 'split') serve = { kind: 'split', weights: Object.fromEntries(variants.map(name => [name, shareFrom(field(`w.${name}`))])), stickiness: field('sticky') || 'targetingKey' };
    else if (serveKind === 'ramp') serve = { kind: 'ramp', variant: field('rampVariant'), otherwise: field('rampOtherwise'), from: shareFrom(field('from')), to: shareFrom(field('to')), start: isoFrom(field('rampStart')), end: isoFrom(field('rampEnd')), stickiness: field('rampSticky') || 'targetingKey' };
    else serve = { kind: 'variant', variant: field('variant') };
    rules.push({ id: `rule-${rules.length + 1}`, audience, ...(Object.keys(window).length ? { window } : {}), serve });
  }
  return { state: data.disabled ? 'DISABLED' : 'ENABLED', defaultVariant: data.defaultVariant, respectLabs: Boolean(data.respectLabs), rules };
}

async function saveRollout(data, form) {
  const key = form.dataset.key;
  const flag = view.admin.flags.find(entry => entry.key === key);
  const rollout = rolloutFrom(data, Number(form.dataset.rules), Object.keys(flag.rule.variants));
  if (!flag.metadata.labs) rollout.respectLabs = true;
  view.busy = `rollout:${key}`;
  view.open.add(key);
  renderLabs();
  try {
    view.admin = await api(`/api/admin/flags/${encodeURIComponent(key)}/rollout`, { method: 'PUT', body: JSON.stringify({ rollout, reason: String(data.reason ?? '') }) });
    await refreshLabs();
    notify(`The rollout of ${key} is saved and applies now.`);
  } finally {
    view.busy = '';
    if (state.view === 'labs') renderLabs();
  }
}

async function clearRollout(element) {
  const key = element.dataset.id;
  view.admin = await api(`/api/admin/flags/${encodeURIComponent(key)}/rollout`, { method: 'PUT', body: JSON.stringify({ rollout: null, reason: '' }) });
  await refreshLabs();
  renderLabs();
  notify(`${key} follows its Git rules again.`);
}

async function saveSegment(data) {
  const audience = Object.fromEntries(['roles', 'teams', 'users', 'tenants'].map(kind => [kind, list(data[kind])]).filter(([, names]) => names.length));
  view.admin = await api(`/api/admin/flag-segments/${encodeURIComponent(String(data.name))}`, { method: 'PUT', body: JSON.stringify({ description: String(data.description ?? ''), audience }) });
  renderLabs();
  notify(`Segment ${data.name} saved.`);
}

async function deleteSegment(element) {
  view.admin = await api(`/api/admin/flag-segments/${encodeURIComponent(element.dataset.id)}`, { method: 'DELETE' });
  renderLabs();
  notify(`Segment ${element.dataset.id} deleted.`);
}

async function exportRollouts() {
  const document = await api('/api/admin/flags/export');
  download('unfold-flags.json', `${JSON.stringify({ $schema: 'https://flagd.dev/schema/v0/flags.json', ...document }, null, 2)}\n`, 'application/json');
}

/** Labs (`#settings/labs`): the person's opt-in and opt-out choices for Labs flags and, for administrators, every feature flag with its rule, source, rollout editor (rules, segments, percentage splits, time ramps, schedules, prerequisites), experiment readout, override and audit trail, the providers asked, and an export as flagd JSON. */
export default {
  id: 'labs',
  match: hash => hash === 'settings/labs' ? {} : null,
  enter: enterLabs,
  render: renderLabs,
  actions: { 'labs-choice': choose, 'flag-rollout-clear': clearRollout, 'flag-segment-delete': deleteSegment, 'flag-export': exportRollouts },
  forms: { 'flag-override': saveOverride, 'flag-rollout': saveRollout, 'flag-segment': saveSegment },
};
