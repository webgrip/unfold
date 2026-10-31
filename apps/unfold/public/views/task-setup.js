import { state, onForget } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, notify, renderHtml, safeUrl } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { badge, button, callout, disclosure, emptyState, skeleton, timeAgo } from '../core/ui.js';
import { date } from '../core/format.js';
import { shell } from '../shell.js';
import { confirmAction } from './dialogs.js';

const fresh = () => ({ providers: null, error: '', provider: '', steps: [], picked: '', check: null, checking: false, checkError: '', repository: '', name: '', sources: null, connections: null, manageTenants: [], tenant: '', tests: {}, replacing: false, connectionBusy: false, connectionError: '', connectionTest: null, saving: false, saveError: '', saved: null });
const view = fresh();
onForget(() => Object.assign(view, fresh()));

const looks = {
  ok: { tone: 'success', glyph: 'check-circle', label: 'Works' },
  warning: { tone: 'attention', glyph: 'alert', label: 'Check' },
  problem: { tone: 'danger', glyph: 'x-circle', label: 'Broken' },
};

const current = () => (view.providers || []).find(entry => entry.provider === view.provider);
const levelLabel = (provider, kind) => provider.levels.find(level => level.kind === kind)?.label || kind;
const projectLabel = provider => provider.levels.at(-1)?.label || 'project';
const article = word => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const connectionOf = provider => (view.connections || []).find(entry => entry.provider === provider.provider);

/**
 * The `taskSources` entry an administrator adds for a checked project, with the repository the person chose.
 * @param {object|undefined} entry The entry `GET /api/task-setup/{provider}/projects/{project}` drafted.
 * @param {string} repositoryId
 * @returns {string}
 */
export function sourceEntry(entry, repositoryId) {
  if (!entry) return '';
  return JSON.stringify({ ...entry, repositoryId: repositoryId || 'REPOSITORY-ID' }, null, 2);
}

/**
 * The check list of a connection check: each finding with its badge, and the fix under one that is not fine.
 * @param {{ checks: object[] }} result
 * @param {string} prefix
 * @returns {string}
 */
export function checkList(result, prefix) {
  return `<ol class="health-list">${result.checks.map(entry => {
    const look = looks[entry.status] || looks.warning;
    const fix = entry.fix && entry.status !== 'ok' ? `<p class="health-next">${icon('arrow')}<span>${escape(entry.fix)}</span></p>` : '';
    const code = entry.code ? ` <code>${escape(entry.code)}</code>` : '';
    return `<li class="health-check" data-tone="${look.tone}" data-status="${escape(entry.status)}"><span class="health-icon" aria-hidden="true">${icon(look.glyph)}</span><div class="health-main"><div class="health-heading"><h4 class="health-title" id="${escape(`${prefix}-${entry.id}`)}">${escape(entry.title)}</h4>${badge({ tone: look.tone, label: look.label, size: 'sm' })}</div><p class="health-detail">${escape(entry.text)}${code}</p>${fix}</div></li>`;
  }).join('')}</ol>`;
}

/**
 * The tasks an import would read, as a short list: reference, title, assignees, labels and due date.
 * @param {{ tasks: object[], more: boolean }} preview
 * @returns {string}
 */
export function previewList(preview) {
  if (!preview.tasks.length) return '';
  const rows = preview.tasks.map(task => {
    const href = safeUrl(task.url);
    const title = href ? `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(task.title)}<span class="sr-only"> (opens in a new tab)</span></a>` : escape(task.title);
    const facts = [task.assignees.length ? `Assigned to ${task.assignees.join(', ')}` : 'Nobody assigned', task.labels.length ? task.labels.join(', ') : '', task.dueAt ? `Due ${date(task.dueAt)}` : ''].filter(Boolean).map(escape).join(' · ');
    const excerpt = task.excerpt ? `<p class="setup-excerpt">${escape(task.excerpt)}</p>` : '<p class="setup-excerpt meta">No description. An agent gets only the title.</p>';
    return `<li class="setup-task"><p class="setup-task-title"><span class="num">${escape(task.reference)}</span> ${title}</p><p class="meta">${facts}</p>${excerpt}</li>`;
  }).join('');
  return `<h3 class="overline">What Unfold reads${preview.more ? ', the first few' : ''}</h3><ul class="setup-tasks">${rows}</ul>`;
}

/**
 * Why Unfold needs a tracker account of its own and how to make one, in the tracker's own steps.
 * @param {{ label: string, serviceAccount: { noun: string, steps: string[], docs: string } }} provider
 * @returns {string}
 */
export function serviceAccountGuide(provider) {
  const guide = provider.serviceAccount;
  const label = escape(provider.label);
  const why = `<p>Handing a task to an agent means Unfold assigns it to a Team's ${label} user and leaves a note on it. Unfold does that as a ${escape(guide.noun)} of its own, so a hand-off does not depend on who happens to be signed in, and keeps working when people leave. Everyone still links their own ${label} account to look around; this account only acts when someone hands work off.</p>`;
  const docs = safeUrl(guide.docs);
  const more = docs ? `<p class="meta"><a href="${escape(docs)}" target="_blank" rel="noopener noreferrer">How ${label} tokens work<span class="sr-only"> (opens in a new tab)</span></a></p>` : '';
  return `${why}<ol class="connections-steps">${guide.steps.map(step => `<li><span>${escape(step)}</span></li>`).join('')}</ol>${more}`;
}

/**
 * The card for the tracker account Unfold acts as: who it is and when its token was set, or how to add one.
 * @param {object} provider One entry of `GET /api/task-setup`.
 * @param {object|undefined} connection The provider's entry of `GET /api/tracker-connections`.
 * @param {{ manageTenants: string[], tenant?: string, replacing?: boolean, busy?: boolean, error?: string, test?: object|null }} options
 * @returns {string}
 */
export function connectionCard(provider, connection, { manageTenants = [], tenant = '', replacing = false, busy = false, error = '', test = null } = {}) {
  const guide = provider.serviceAccount;
  if (!guide) return '';
  const noun = escape(guide.noun);
  const title = `Unfold's ${noun}`;
  const failure = error ? `<p class="field-error" role="alert">${escape(error)}</p>` : '';
  const tokenField = (submit) => `<form data-form="connection-token" class="account-token"><div class="field"><label class="field-label" for="setup-token">${escape(guide.tokenLabel)}</label><input id="setup-token" name="token" type="password" autocomplete="off" spellcheck="false" required aria-describedby="setup-token-hint"><p class="field-hint" id="setup-token-hint">Unfold checks it with ${escape(provider.label)}, stores it encrypted and never shows it again.</p></div>${tenantField(manageTenants, tenant)}${failure}${button({ type: 'submit', label: submit, variant: 'primary', size: 'sm', busy })}</form>`;
  if (!connection) {
    const add = manageTenants.length ? tokenField('Check and save') : `<p class="meta">Only an administrator adds it. Send them this page.</p>`;
    return `<section class="card settings-card" aria-labelledby="setup-service-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="setup-service-title">${title}</h2><p class="card-subtitle">Not added yet. Saved ${escape(projectLabel(provider))}s can be read, but not handed to agents from Unfold.</p></div></header><div class="card-body">${serviceAccountGuide(provider)}${add}</div></section>`;
  }
  const missing = connection.token !== 'set';
  const who = connection.account ? `<strong>${escape(connection.account)}</strong>` : `an account Unfold could not name`;
  const state = missing
    ? callout({ tone: 'danger', icon: 'x-circle', title: 'No token stored', body: `<p>Unfold cannot hand tasks off until an administrator pastes the token of ${who} again, for example after this Tenant was imported.</p>` })
    : `<p class="setup-linked">${icon('check-circle')}<span>Unfold hands tasks off as ${who}. Token added ${timeAgo(connection.tokenSetAt || connection.updatedAt)} by ${escape(connection.updatedBy)}.</span></p>`;
  const tested = test ? (test.busy ? `<div aria-busy="true">${skeleton({ rows: 1 })}</div>` : test.error ? `<p class="meta" role="alert">${escape(test.error)}</p>` : checkList(test.result, 'connection-test')) : '';
  const inUse = connection.sources.length > 0;
  const manage = connection.manage ? `${button({ label: missing ? 'Paste the token' : 'Replace token', icon: 'lock', size: 'sm', action: 'connection-replace', disabled: replacing })}${button({ label: 'Remove', icon: 'trash', size: 'sm', variant: 'danger', action: 'connection-remove', data: { id: connection.id }, disabled: inUse, title: inUse ? 'Remove the task sources that use it first.' : '' })}` : '';
  const replace = connection.manage && (replacing || missing) ? tokenField('Check and replace') : '';
  return `<section class="card settings-card" aria-labelledby="setup-service-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="setup-service-title">${title}</h2><p class="card-subtitle">${connection.tenant === 'default' ? '' : `Tenant ${escape(connection.tenant)}. `}${connection.sources.length === 1 ? 'One task source uses it.' : `${connection.sources.length || 'No'} task sources use it.`}</p></div>${button({ label: 'Test', icon: 'refresh', size: 'sm', action: 'connection-test', data: { id: connection.id }, busy: Boolean(test?.busy) })}</header><div class="card-body">${state}<div role="status">${tested}</div>${replace}<div class="settings-card-footer">${manage}</div>${disclosure({ summary: `Why Unfold needs a ${guide.noun} of its own`, body: serviceAccountGuide(provider) })}</div></section>`;
}

function tenantField(tenants, chosen) {
  if (tenants.length < 2) return '';
  return `<div class="field"><label class="field-label" for="setup-tenant">Tenant</label><select id="setup-tenant" name="tenant" data-setup-tenant>${tenants.map(tenant => `<option value="${escape(tenant)}"${tenant === chosen ? ' selected' : ''}>${escape(tenant)}</option>`).join('')}</select></div>`;
}

/**
 * Where a task source is kept, for the Connected now list.
 * @param {{ managedBy?: string }} source
 * @returns {string}
 */
export function sourceOrigin(source) {
  return source.managedBy === 'unfold' ? badge({ tone: 'accent', label: 'Added here', size: 'sm' }) : badge({ label: 'Server configuration', size: 'sm' });
}

function providerIntro(provider) {
  if (provider.linked) return `<p class="setup-linked">${icon('check-circle')}<span>Looking through ${escape(provider.label)} as <strong>${escape(provider.login || 'your linked account')}</strong>. You see only what that account sees.</span></p>`;
  return callout({ tone: 'attention', icon: 'link', title: `Link your ${escape(provider.label)} account first`, body: `<p>Unfold looks through ${escape(provider.label)} with your own account, so you pick by name instead of copying ids. It only reads while you set up.</p>`, actions: button({ label: 'Open Linked accounts', href: '#settings/accounts', variant: 'primary', size: 'sm' }) });
}

function pickers(provider) {
  if (!provider.linked) return '';
  const fields = view.steps.map((step, index) => {
    const id = `setup-step-${index}`;
    const kinds = [...new Set((step.entries || []).map(entry => entry.kind))];
    const label = index === 0 ? levelLabel(provider, kinds[0] || provider.levels[0].kind) : kinds.map(kind => levelLabel(provider, kind)).join(' or ') || 'Next';
    if (step.error) return `<div class="field">${callout({ tone: 'danger', icon: 'x-circle', title: `Could not read ${escape(label)}`, body: `<p role="alert">${escape(step.error)}</p>`, actions: button({ label: 'Try again', icon: 'refresh', size: 'sm', action: 'setup-retry', data: { step: index } }) })}</div>`;
    if (!step.entries) return `<div class="field" aria-busy="true">${skeleton({ rows: 1 })}</div>`;
    if (!step.entries.length) return `<div class="field">${emptyState({ compact: true, icon: 'inbox', title: `Nothing here your account can see`, body: `Archived items are left out. Choose another one above, or ask for access in ${escape(provider.label)}.` })}</div>`;
    const groups = kinds.map(kind => {
      const options = step.entries.filter(entry => entry.kind === kind).map(entry => `<option value="${escape(`${entry.kind}:${entry.id}`)}"${step.picked === `${entry.kind}:${entry.id}` ? ' selected' : ''}>${escape(entry.name)}</option>`).join('');
      return kinds.length > 1 ? `<optgroup label="${escape(levelLabel(provider, kind))}">${options}</optgroup>` : options;
    }).join('');
    return `<div class="field"><label class="field-label" for="${id}">${escape(label)}</label><select id="${id}" data-setup-step="${index}"><option value="">Choose ${article(label)} ${escape(label.toLowerCase())}</option>${groups}</select></div>`;
  }).join('');
  return `<div class="setup-pickers">${fields}</div>`;
}

function configurationEntry(provider) {
  const last = projectLabel(provider);
  const entry = sourceEntry(view.check.entry, view.repository);
  const steps = `<ol class="connections-steps"><li><strong>Add it to the configuration</strong><span>An administrator adds this entry to <code>taskSources</code> and restarts Unfold. The entry holds no token: everyone reads with their own linked ${escape(provider.label)} account.</span></li><li><strong>Let Ploeg route it</strong><span>Handing a task over assigns a Team's ${escape(provider.label)} user. Ploeg starts only when its tracker configuration routes this ${escape(last)} to a Team, the Team's user is a member of the ${escape(last)}, and ${escape(provider.label)} tells Ploeg about assignments. Settings › <a href="#settings/connections">Connections</a> shows each of these after the restart.</span></li></ol>`;
  return `<div class="field"><label class="field-label" for="setup-entry">Entry for the administrator</label><textarea id="setup-entry" class="mono" rows="9" readonly spellcheck="false">${escape(entry)}</textarea></div>${button({ label: 'Copy the entry', icon: 'copy', action: 'setup-copy', size: 'sm', disabled: !view.repository })}${steps}`;
}

function saveControls(provider) {
  const check = view.check;
  const connection = check.connection ? (view.connections || []).find(entry => entry.id === check.connection.id) : undefined;
  const noun = provider.serviceAccount?.noun || 'account';
  if (!provider.serviceAccount) return '';
  if (!connection) return `<p class="meta">Saving here needs Unfold's ${escape(noun)} first, above.</p>`;
  if (!connection.manage) return `<p class="meta">Only an administrator saves it. Send them this page.</p>`;
  const failure = view.saveError ? `<p class="field-error" role="alert">${escape(view.saveError)}</p>` : '';
  return `${failure}${button({ label: 'Save', icon: 'check', action: 'setup-save', variant: 'primary', size: 'sm', disabled: !view.repository || !view.name.trim(), busy: view.saving })}<p class="field-hint">Unfold keeps it in its own database and reads it with ${escape(connection.account || `its ${noun}`)}. Its tasks show on Tasks at once; no restart.</p>`;
}

function addSection(provider) {
  const check = view.check;
  if (!check?.entry) return '';
  const last = projectLabel(provider);
  if (view.saved) return callout({ tone: 'success', icon: 'check-circle', title: `Saved as ${escape(view.saved.name)}`, body: `<p>Its tasks are on <a href="#tasks">Tasks</a>. Ploeg starts work on one only once its tracker configuration routes this ${escape(last)} to a Team; Settings › <a href="#settings/connections">Connections</a> shows whether it does.</p>` });
  if (check.registered.length) return callout({ tone: 'success', icon: 'check-circle', title: `Already connected`, body: `<p>${escape(check.registered.map(entry => entry.name).join(', '))} already ${check.registered.length === 1 ? 'reads' : 'read'} this ${escape(last)}. Its tasks are on <a href="#tasks">Tasks</a>.</p>` });
  const repositories = state.bootstrap?.repositories || [];
  const picker = repositories.length ? `<div class="field"><label class="field-label" for="setup-repository">Repository the work goes to</label><select id="setup-repository" data-setup-repository><option value="">Choose a repository</option>${repositories.map(repository => `<option value="${escape(repository.id)}"${view.repository === repository.id ? ' selected' : ''}>${escape(repository.name)}</option>`).join('')}</select><p class="field-hint">Agents open their pull requests here.</p></div>` : '<p class="meta">No repository is registered yet. An administrator registers one first.</p>';
  const name = `<div class="field"><label class="field-label" for="setup-name">Name</label><input id="setup-name" data-setup-name maxlength="100" value="${escape(view.name)}"><p class="field-hint">How this ${escape(last)} is named on Tasks and Now.</p></div>`;
  const saving = provider.serviceAccount ? saveControls(provider) : '';
  const instead = provider.serviceAccount ? disclosure({ summary: 'Keep it in the server configuration instead', body: configurationEntry(provider) }) : configurationEntry(provider);
  return `<section class="card settings-card" aria-labelledby="setup-add-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="setup-add-title">Add it to Unfold</h2><p class="card-subtitle">${provider.serviceAccount ? 'Save it here, or hand an administrator the entry for the server configuration.' : 'Connections live in the server configuration, so an administrator adds this one.'}</p></div></header><div class="card-body">${picker}${provider.serviceAccount ? name : ''}${saving}${instead}</div></section>`;
}

function checkSection(provider) {
  if (view.checking) return `<section class="card settings-card" aria-busy="true"><div class="card-body"><p class="meta">Checking ${escape(projectLabel(provider))}…</p>${skeleton({ rows: 3 })}</div></section>`;
  if (view.checkError) return callout({ tone: 'danger', icon: 'x-circle', title: 'Could not check it', body: `<p role="alert">${escape(view.checkError)}</p>`, actions: button({ label: 'Try again', icon: 'refresh', size: 'sm', action: 'setup-check-again' }) });
  const check = view.check;
  if (!check) return '';
  const where = check.project ? [...check.project.path, check.project.name].join(' › ') : '';
  return `<section class="card settings-card connection-card" aria-labelledby="setup-check-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="setup-check-title">${escape(where || 'Connection check')}</h2><p class="card-subtitle">${check.ok ? 'Unfold can read it. Nothing was changed.' : 'Fix what is broken, then check again. Nothing was changed.'}</p></div>${button({ label: 'Check again', icon: 'refresh', size: 'sm', action: 'setup-check-again' })}</header><div class="card-body">${checkList(check, 'setup-check')}${previewList(check.preview)}</div></section>${check.ok ? addSection(provider) : ''}`;
}

function testResult(id) {
  const test = view.tests[id];
  if (!test) return '';
  if (test.busy) return `<div aria-busy="true">${skeleton({ rows: 2 })}</div>`;
  if (test.error) return `<p class="meta" role="alert">${escape(test.error)}</p>`;
  return `${checkList(test.result, `test-${id}`)}${previewList(test.result.preview)}`;
}

function removable(source) {
  if (source.managedBy !== 'unfold') return false;
  return Boolean((view.connections || []).find(entry => entry.id === source.connection)?.manage);
}

function registered() {
  if (!view.sources) return '';
  if (!view.sources.length) return '';
  const rows = view.sources.map(source => {
    const remove = removable(source) ? button({ label: 'Remove', icon: 'trash', size: 'sm', variant: 'ghost', action: 'source-remove', data: { id: source.id, connection: source.connection } }) : '';
    return `<li class="setup-source"><div class="setup-source-head"><span><strong>${escape(source.name)}</strong> ${sourceOrigin(source)}</span><span>${button({ label: 'Test connection', icon: 'refresh', size: 'sm', action: 'setup-test', data: { id: source.id }, busy: Boolean(view.tests[source.id]?.busy) })}${remove}</span></div><div role="status">${testResult(source.id)}</div></li>`;
  }).join('');
  return `<section class="card settings-card" aria-labelledby="setup-sources-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="setup-sources-title">Connected now</h2><p class="card-subtitle">Test one to see whether Unfold can read it, as whom, and what it reads. A test changes nothing.</p></div></header><div class="card-body"><ul class="setup-sources">${rows}</ul></div></section>`;
}

function content() {
  if (view.error) return callout({ tone: 'danger', icon: 'x-circle', title: 'Could not load tracker setup', body: `<p role="alert">${escape(view.error)}</p>`, actions: button({ label: 'Try again', icon: 'refresh', size: 'sm', action: 'setup-reload' }) });
  if (!view.providers) return `<section class="card settings-card">${skeleton({ rows: 3 })}</section>`;
  const provider = current();
  const none = `<section class="card settings-card">${emptyState({ icon: 'link', title: 'No tracker can be set up by name here', body: 'Setting up by name needs a tracker whose accounts people link to this workbench. Until an administrator configures one, connections are added to the server configuration by hand.' })}</section>`;
  const choose = (view.providers.length > 1) ? `<div class="field"><label class="field-label" for="setup-provider">Tracker</label><select id="setup-provider" data-setup-provider>${view.providers.map(entry => `<option value="${escape(entry.provider)}"${entry.provider === view.provider ? ' selected' : ''}>${escape(entry.label)}</option>`).join('')}</select></div>` : '';
  const service = provider ? connectionCard(provider, connectionOf(provider), { manageTenants: view.manageTenants, tenant: view.tenant, replacing: view.replacing, busy: view.connectionBusy, error: view.connectionError, test: view.connectionTest }) : '';
  const setup = provider ? `<section class="card settings-card" aria-labelledby="setup-pick-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="setup-pick-title">Choose where the tasks are</h2><p class="card-subtitle">Pick by name, down to the ${escape(projectLabel(provider).toLowerCase())} whose open tasks Unfold should show.</p></div></header><div class="card-body">${choose}${providerIntro(provider)}${pickers(provider)}</div></section>${service}${checkSection(provider)}` : none;
  return `${setup}${registered()}`;
}

function render() {
  if (state.view !== 'task-setup') return;
  renderHtml(shell(`<div class="settings-page">${content()}</div>`, { title: 'Connect a tracker', subtitle: 'Pick a board by name, check that Unfold can read it, see what it would import, and save it.' }));
}

async function loadStep(index, parent) {
  const provider = current();
  view.steps = view.steps.slice(0, index);
  view.steps[index] = { parent, entries: null, picked: '', error: '' };
  render();
  const query = parent ? `?kind=${encodeURIComponent(parent.kind)}&id=${encodeURIComponent(parent.id)}` : '';
  try { view.steps[index].entries = (await api(`/api/task-setup/${encodeURIComponent(provider.provider)}/scopes${query}`)).entries; }
  catch (error) { if (view.steps[index]) view.steps[index].error = error.message; }
  const only = view.steps[index]?.entries;
  if (only?.length === 1 && only[0].children && !only[0].project) { view.steps[index].picked = `${only[0].kind}:${only[0].id}`; return loadStep(index + 1, only[0]); }
  render();
}

async function checkProject(id) {
  const provider = current();
  view.picked = id; view.check = null; view.checkError = ''; view.checking = true; view.saved = null; view.saveError = '';
  render();
  try {
    view.check = await api(`/api/task-setup/${encodeURIComponent(provider.provider)}/projects/${encodeURIComponent(id)}`);
    if (view.check.entry) view.name = view.check.entry.name;
  }
  catch (error) { view.checkError = error.message; }
  finally { view.checking = false; render(); }
}

function pick(element) {
  const index = Number(element.dataset.setupStep);
  const step = view.steps[index];
  if (!step) return;
  step.picked = element.value;
  view.steps = view.steps.slice(0, index + 1);
  view.check = null; view.checkError = ''; view.saved = null;
  const entry = (step.entries || []).find(item => `${item.kind}:${item.id}` === element.value);
  if (!entry) return render();
  if (entry.project) return void checkProject(entry.id);
  return void loadStep(index + 1, entry);
}

async function test(control) {
  const id = control.dataset.id;
  view.tests[id] = { busy: true };
  render();
  try { view.tests[id] = { result: await api(`/api/task-sources/${encodeURIComponent(id)}/check`) }; }
  catch (error) { view.tests[id] = { error: error.message }; }
  render();
}

async function copy() {
  const text = sourceEntry(view.check?.entry, view.repository);
  try { await navigator.clipboard.writeText(text); notify('Entry copied. Send it to an administrator to add under taskSources.'); }
  catch { notify('Copy did not work here. Select the entry and copy it yourself.', true); }
}

async function refreshLists() {
  const [sources, connections] = await Promise.all([api('/api/task-sources'), api('/api/tracker-connections')]);
  view.sources = sources;
  view.connections = connections.connections;
  view.manageTenants = connections.manageTenants;
  if (!view.manageTenants.includes(view.tenant)) view.tenant = view.manageTenants[0] || '';
}

async function saveToken(data, form) {
  const provider = current();
  const connection = connectionOf(provider);
  view.connectionBusy = true; view.connectionError = '';
  render();
  try {
    if (connection) await api(`/api/tracker-connections/${encodeURIComponent(connection.id)}/token`, { method: 'PUT', body: JSON.stringify({ token: data.token }) });
    else await api('/api/tracker-connections', { method: 'POST', body: JSON.stringify({ provider: provider.provider, token: data.token, ...(view.tenant ? { tenant: view.tenant } : {}) }) });
    form.reset();
    view.replacing = false; view.connectionTest = null;
    notify(connection ? 'Token replaced. Unfold uses the new one from now on.' : `Unfold's ${provider.serviceAccount.noun} is added.`);
    await refreshLists();
    if (view.picked) await checkProject(view.picked);
  } catch (error) { view.connectionError = error.message; }
  finally { view.connectionBusy = false; render(); }
}

async function testConnection(control) {
  view.connectionTest = { busy: true };
  render();
  try { view.connectionTest = { result: await api(`/api/tracker-connections/${encodeURIComponent(control.dataset.id)}/check`) }; }
  catch (error) { view.connectionTest = { error: error.message }; }
  render();
}

function removeConnection(control) {
  const provider = current();
  confirmAction(`Remove Unfold's ${provider.serviceAccount.noun}?`, 'Unfold forgets its token at once. Task sources saved here can no longer be handed off until it is added again.', 'Remove', async () => {
    try {
      await api(`/api/tracker-connections/${encodeURIComponent(control.dataset.id)}`, { method: 'DELETE' });
      notify(`Unfold's ${provider.serviceAccount.noun} is removed and its token forgotten.`);
      view.connectionTest = null;
      await refreshLists();
    } catch (error) { notify(error.message, true); }
    render();
  }, { tone: 'danger' });
}

function removeSource(control) {
  const source = (view.sources || []).find(entry => entry.id === control.dataset.id);
  confirmAction(`Remove ${source?.name || 'this task source'}?`, 'Its tasks stop showing in Unfold. Work Items it already started stay in Ploeg, and nothing changes in the tracker.', 'Remove', async () => {
    try {
      await api(`/api/tracker-connections/${encodeURIComponent(control.dataset.connection)}/sources/${encodeURIComponent(control.dataset.id)}`, { method: 'DELETE' });
      notify(`${source?.name || 'The task source'} is removed.`);
      await refreshLists();
    } catch (error) { notify(error.message, true); }
    render();
  }, { tone: 'danger' });
}

async function save() {
  const check = view.check;
  if (!check?.connection || !check.project) return;
  view.saving = true; view.saveError = '';
  render();
  try {
    const { source } = await api(`/api/tracker-connections/${encodeURIComponent(check.connection.id)}/sources`, { method: 'POST', body: JSON.stringify({ project: check.project.id, name: view.name.trim(), repositoryId: view.repository }) });
    view.saved = source;
    notify(`${source.name} is saved. Its tasks are on Tasks.`);
    await refreshLists();
  } catch (error) { view.saveError = error.message; }
  finally { view.saving = false; render(); }
}

async function load() {
  view.error = '';
  try {
    const [setup] = await Promise.all([api('/api/task-setup'), refreshLists()]);
    view.providers = setup.providers;
    if (!current()) view.provider = view.providers[0]?.provider || '';
  } catch (error) { view.error = error.message; }
  render();
  if (current()?.linked && !view.steps.length) await loadStep(0, undefined);
}

/** Connect a tracker (`#settings/task-setup`): add the tracker account Unfold acts as, pick a board by name with your linked account, test it, preview what an import reads and save it, or copy the entry an administrator adds; test and remove the connections already there. */
export default {
  id: 'task-setup',
  match: hash => hash === 'settings/task-setup' ? {} : null,
  load,
  render,
  actions: {
    'setup-reload': () => { Object.assign(view, fresh()); render(); return load(); },
    'setup-retry': control => { const index = Number(control.dataset.step); return loadStep(index, view.steps[index]?.parent); },
    'setup-check-again': () => view.picked ? checkProject(view.picked) : undefined,
    'setup-test': test,
    'setup-copy': copy,
    'setup-save': save,
    'connection-test': testConnection,
    'connection-replace': () => { view.replacing = true; view.connectionError = ''; render(); document.getElementById('setup-token')?.focus(); },
    'connection-remove': removeConnection,
    'source-remove': removeSource,
  },
  forms: { 'connection-token': saveToken },
  changes: {
    '[data-setup-step]': pick,
    '[data-setup-repository]': element => { view.repository = element.value; render(); },
    '[data-setup-tenant]': element => { view.tenant = element.value; },
    '[data-setup-provider]': element => { view.provider = element.value; view.steps = []; view.check = null; view.replacing = false; view.connectionTest = null; render(); if (current()?.linked) void loadStep(0, undefined); },
  },
  inputs: {
    '[data-setup-name]': element => { view.name = element.value; const save = document.querySelector('[data-action="setup-save"]'); if (save) save.disabled = !view.repository || !view.name.trim(); },
  },
};
