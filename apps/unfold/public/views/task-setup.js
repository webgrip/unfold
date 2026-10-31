import { state, onForget } from '../core/state.js';
import { api } from '../core/api.js';
import { escape, notify, renderHtml, safeUrl } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { badge, button, callout, emptyState, skeleton } from '../core/ui.js';
import { date } from '../core/format.js';
import { shell } from '../shell.js';

const fresh = () => ({ providers: null, error: '', provider: '', steps: [], picked: '', check: null, checking: false, checkError: '', repository: '', sources: null, tests: {} });
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

function addSection(provider) {
  const check = view.check;
  if (!check?.entry) return '';
  const last = projectLabel(provider);
  if (check.registered.length) return callout({ tone: 'success', icon: 'check-circle', title: `Already connected`, body: `<p>${escape(check.registered.map(entry => entry.name).join(', '))} already ${check.registered.length === 1 ? 'reads' : 'read'} this ${escape(last)}. Its tasks are on <a href="#tasks">Tasks</a>.</p>` });
  const repositories = state.bootstrap?.repositories || [];
  const picker = repositories.length ? `<div class="field"><label class="field-label" for="setup-repository">Repository the work goes to</label><select id="setup-repository" data-setup-repository><option value="">Choose a repository</option>${repositories.map(repository => `<option value="${escape(repository.id)}"${view.repository === repository.id ? ' selected' : ''}>${escape(repository.name)}</option>`).join('')}</select><p class="field-hint">Agents open their pull requests here.</p></div>` : '<p class="meta">No repository is registered yet. An administrator registers one first.</p>';
  const entry = sourceEntry(check.entry, view.repository);
  const steps = `<ol class="connections-steps"><li><strong>Add it to the configuration</strong><span>An administrator adds this entry to <code>taskSources</code> and restarts Unfold. The entry holds no token: everyone reads with their own linked ${escape(provider.label)} account.</span></li><li><strong>Let Ploeg route it</strong><span>Handing a task over assigns a Team's ${escape(provider.label)} user. Ploeg starts only when its tracker configuration routes this ${escape(last)} to a Team, the Team's user is a member of the ${escape(last)}, and ${escape(provider.label)} tells Ploeg about assignments. Settings › <a href="#settings/connections">Connections</a> shows each of these after the restart.</span></li></ol>`;
  return `<section class="card settings-card" aria-labelledby="setup-add-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="setup-add-title">Add it to Unfold</h2><p class="card-subtitle">Connections live in the server configuration, so an administrator adds this one.</p></div></header><div class="card-body">${picker}<div class="field"><label class="field-label" for="setup-entry">Entry for the administrator</label><textarea id="setup-entry" class="mono" rows="9" readonly spellcheck="false">${escape(entry)}</textarea></div>${button({ label: 'Copy the entry', icon: 'copy', action: 'setup-copy', variant: 'primary', size: 'sm', disabled: !view.repository })}${steps}</div></section>`;
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

function registered() {
  if (!view.sources) return '';
  if (!view.sources.length) return '';
  const rows = view.sources.map(source => `<li class="setup-source"><div class="setup-source-head"><span><strong>${escape(source.name)}</strong> <span class="meta">${escape(source.provider)}</span></span>${button({ label: 'Test connection', icon: 'refresh', size: 'sm', action: 'setup-test', data: { id: source.id }, busy: Boolean(view.tests[source.id]?.busy) })}</div><div role="status">${testResult(source.id)}</div></li>`).join('');
  return `<section class="card settings-card" aria-labelledby="setup-sources-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="setup-sources-title">Connected now</h2><p class="card-subtitle">Test one to see whether Unfold can read it, as whom, and what it reads. A test changes nothing.</p></div></header><div class="card-body"><ul class="setup-sources">${rows}</ul></div></section>`;
}

function content() {
  if (view.error) return callout({ tone: 'danger', icon: 'x-circle', title: 'Could not load tracker setup', body: `<p role="alert">${escape(view.error)}</p>`, actions: button({ label: 'Try again', icon: 'refresh', size: 'sm', action: 'setup-reload' }) });
  if (!view.providers) return `<section class="card settings-card">${skeleton({ rows: 3 })}</section>`;
  const provider = current();
  const none = `<section class="card settings-card">${emptyState({ icon: 'link', title: 'No tracker can be set up by name here', body: 'Setting up by name needs a tracker whose accounts people link to this workbench. Until an administrator configures one, connections are added to the server configuration by hand.' })}</section>`;
  const choose = (view.providers.length > 1) ? `<div class="field"><label class="field-label" for="setup-provider">Tracker</label><select id="setup-provider" data-setup-provider>${view.providers.map(entry => `<option value="${escape(entry.provider)}"${entry.provider === view.provider ? ' selected' : ''}>${escape(entry.label)}</option>`).join('')}</select></div>` : '';
  const setup = provider ? `<section class="card settings-card" aria-labelledby="setup-pick-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="setup-pick-title">Choose where the tasks are</h2><p class="card-subtitle">Pick by name, down to the ${escape(projectLabel(provider).toLowerCase())} whose open tasks Unfold should show.</p></div></header><div class="card-body">${choose}${providerIntro(provider)}${pickers(provider)}</div></section>${checkSection(provider)}` : none;
  return `${setup}${registered()}`;
}

function render() {
  if (state.view !== 'task-setup') return;
  renderHtml(shell(`<div class="settings-page">${content()}</div>`, { title: 'Connect a tracker', subtitle: 'Pick a board by name, check that Unfold can read it, and see what it would import.' }));
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
  view.picked = id; view.check = null; view.checkError = ''; view.checking = true;
  render();
  try { view.check = await api(`/api/task-setup/${encodeURIComponent(provider.provider)}/projects/${encodeURIComponent(id)}`); }
  catch (error) { view.checkError = error.message; }
  finally { view.checking = false; render(); }
}

function pick(element) {
  const index = Number(element.dataset.setupStep);
  const step = view.steps[index];
  if (!step) return;
  step.picked = element.value;
  view.steps = view.steps.slice(0, index + 1);
  view.check = null; view.checkError = '';
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

async function load() {
  view.error = '';
  try {
    const [setup, sources] = await Promise.all([api('/api/task-setup'), api('/api/task-sources')]);
    view.providers = setup.providers;
    view.sources = sources;
    if (!current()) view.provider = view.providers[0]?.provider || '';
  } catch (error) { view.error = error.message; }
  render();
  if (current()?.linked && !view.steps.length) await loadStep(0, undefined);
}

/** Connect a tracker (`#settings/task-setup`): pick a board by name with your linked account, test it, preview what an import reads, and copy the entry an administrator adds; test the connections already registered. */
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
  },
  changes: {
    '[data-setup-step]': pick,
    '[data-setup-repository]': element => { view.repository = element.value; render(); },
    '[data-setup-provider]': element => { view.provider = element.value; view.steps = []; view.check = null; render(); if (current()?.linked) void loadStep(0, undefined); },
  },
};
