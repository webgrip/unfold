import { escape } from './core/dom.js';
import { money, plural } from './core/format.js';
import { avatar, badge, button, callout, chip, demoNote, dl, segmented, stat, table } from './core/ui.js';

/**
 * The Team builder (the `teams.builder` Labs flag): build an agent, put agents into the positions of a Team, read the
 * Team's record per version, and rehearse what the assignment gate says on a tracker card. The model is pure and
 * the markup builders take a model, so tests read the words and rules without a browser. Everything here is a demo:
 * the roster lives in the browser, nothing starts a Run and no amount is a real charge.
 */

export const harnesses = Object.freeze([
  { id: 'opencode', name: 'opencode', hint: 'Any model. The default on this workbench.' },
  { id: 'claude-code', name: 'Claude Code', hint: 'Claude models only.', modelsOnly: 'anthropic' },
  { id: 'goose', name: 'Goose', hint: 'Any model. A lighter sandbox.' },
  { id: 'openhands', name: 'OpenHands', hint: 'Frozen: its CLI is unmaintained.', refusesHooksFile: true },
]);

export const models = Object.freeze([
  { id: 'qwen', name: 'Qwen3 8-27B', vendor: 'local', hint: 'Your own GPU; no price per token.', runCost: 0 },
  { id: 'haiku', name: 'Claude Haiku 5.5', vendor: 'anthropic', hint: 'Fast and cheap: docs and small fixes.', runCost: 0.12 },
  { id: 'sonnet', name: 'Claude Sonnet 5.5', vendor: 'anthropic', hint: 'The everyday builder.', runCost: 0.55 },
  { id: 'opus', name: 'Claude Opus 5.5', vendor: 'anthropic', hint: 'Cross-module work; dear per Run.', runCost: 2.1 },
]);

export const skills = Object.freeze([
  { id: 'agit', name: 'AGit push', hint: 'Opens Forgejo pull requests from the sandbox' },
  { id: 'review', name: 'Review guide', hint: 'The Unfold review checklist' },
  { id: 'docs', name: 'docs-check', hint: 'Runs mise run docs-check' },
  { id: 'adr', name: 'ADR writer', hint: 'MADR 4.0 and the registry index' },
  { id: 'gotest', name: 'Go test triage', hint: 'Reads go test output' },
  { id: 'playwright', name: 'Browser checks', hint: 'Playwright end-to-end flows' },
]);

export const permissions = Object.freeze([
  { id: 'push', name: 'Push branches', hint: 'agent/<key> branches only', does: 'push a branch and open a pull request' },
  { id: 'comment', name: 'Comment', hint: 'On the pull request and the card', does: 'comment on the card and the pull request' },
  { id: 'create-work', name: 'Create follow-up work', hint: 'New cards in Backlog', does: 'file follow-up cards in Backlog' },
  { id: 'dispatch', name: 'Dispatch created work', hint: 'Start Runs on its own cards', does: 'start Runs on the cards it files' },
  { id: 'egress', name: 'Package registries', hint: 'npm, the Go proxy, PyPI', does: 'download packages from the allowed registries' },
  { id: 'mcp', name: 'Unfold MCP', hint: 'Read Work Items and sessions', does: 'read Work Items and sessions through the Unfold MCP' },
]);

export const repositories = Object.freeze([
  { id: 'webgrip/unfold', forge: 'Forgejo', language: 'TypeScript and Go', hooksFile: true },
  { id: 'webgrip/homelab-cluster', forge: 'Forgejo', language: 'Kubernetes YAML', hooksFile: false },
  { id: 'webgrip/erfbeeld', forge: 'Forgejo', language: 'PHP', hooksFile: false },
  { id: 'webgrip/seekframe', forge: 'GitHub', language: 'Rust and WASM', hooksFile: false },
]);

/** The positions of a Team's workflow. A position is a slot in the flow, not a property of the agent that fills it. */
export const positions = Object.freeze([
  { id: 'plan', name: 'Plan', hint: 'Optional · one Run', runs: 1 },
  { id: 'build', name: 'Build', hint: 'Required · 1 to 2 Runs', runs: 1.3 },
  { id: 'review', name: 'Review', hint: 'Required · one Run per round', runs: 1 },
  { id: 'fix', name: 'Fix', hint: 'Optional · one Run per extra round', runs: 0.6 },
]);

export const sizes = Object.freeze([
  { id: 's', label: 'Small', hint: 'docs, one file', factor: 0.6 },
  { id: 'm', label: 'Medium', hint: 'a feature with tests', factor: 1 },
  { id: 'l', label: 'Large', hint: 'across modules', factor: 2.1 },
]);

/** The experiment budget a person has left this week in the demo: Runs under it count toward no Team's record. */
export const experimentBudget = Object.freeze({ left: 3.2, weekly: 5 });

const byId = (list, id) => list.find(item => item.id === id) || null;
export const harnessOf = agent => byId(harnesses, agent?.harness);
export const modelOf = agent => byId(models, agent?.model);
export const repositoryOf = id => byId(repositories, id);

/** The demo roster: the agents and Teams a new browser starts with. */
export function demoRoster() {
  return {
    agents: [
      { id: 'ag-haiku', name: 'Snelle Haiku', harness: 'opencode', model: 'haiku', skills: ['agit', 'docs'], permissions: ['push', 'comment', 'egress'], budget: 0.6, owner: 'Ryan' },
      { id: 'ag-qwen', name: 'Qwen leest mee', harness: 'opencode', model: 'qwen', skills: ['review'], permissions: ['comment', 'mcp'], budget: 0.1, owner: 'Ryan' },
      { id: 'ag-sonnet', name: 'Sonnet bouwer', harness: 'opencode', model: 'sonnet', skills: ['agit', 'gotest', 'docs'], permissions: ['push', 'comment', 'egress', 'mcp'], budget: 2.5, owner: 'Ryan' },
      { id: 'ag-reviewer', name: 'Sonnet reviewer', harness: 'claude-code', model: 'sonnet', skills: ['review'], permissions: ['comment', 'mcp'], budget: 1.2, owner: 'Noor' },
      { id: 'ag-erf', name: 'Erf handen', harness: 'openhands', model: 'haiku', skills: ['agit'], permissions: ['push', 'comment', 'egress'], budget: 0.8, owner: 'Noor' },
    ],
    teams: [
      { id: 'tm-zwaluw', name: 'Zwaluw', owner: 'Ryan', charter: 'Small, quick changes in Unfold and the homelab: docs, config, one-file fixes. Cheap first, escalate by hand.', weekly: 15, spent: 4.9, repositories: ['webgrip/unfold', 'webgrip/homelab-cluster'], lineage: null, adopted: 3, version: 3,
        positions: { plan: null, build: 'ag-haiku', review: 'ag-qwen', fix: 'ag-haiku' },
        history: [
          { v: 1, note: 'First cut: Sonnet builds, Qwen reviews.', positions: { plan: null, build: 'ag-sonnet', review: 'ag-qwen', fix: null }, record: { 'webgrip/unfold': { merged: 6, spent: 7.26, rounds: 1.8, reverts: 1, minutes: 9, failed: 1, failedWhy: 'budget cap hit on a large card' }, 'webgrip/homelab-cluster': { merged: 3, spent: 2.91, rounds: 1.3, reverts: 0, minutes: 5, failed: 0 } } },
          { v: 2, note: 'Haiku builds; Sonnet was more than docs need.', positions: { plan: null, build: 'ag-haiku', review: 'ag-qwen', fix: null }, record: { 'webgrip/unfold': { merged: 11, spent: 6.38, rounds: 1.9, reverts: 1, minutes: 8, failed: 2, failedWhy: 'review asked for tests the builder could not run' }, 'webgrip/homelab-cluster': { merged: 7, spent: 2.1, rounds: 1.4, reverts: 0, minutes: 4, failed: 0 } } },
          { v: 3, note: 'A Fix position, so review rounds stop bouncing to a person.', positions: { plan: null, build: 'ag-haiku', review: 'ag-qwen', fix: 'ag-haiku' }, record: { 'webgrip/unfold': { merged: 14, spent: 5.74, rounds: 1.3, reverts: 0, minutes: 6, failed: 1, failedWhy: 'sandbox claim never became ready within 10 minutes' }, 'webgrip/homelab-cluster': { merged: 9, spent: 2.52, rounds: 1.2, reverts: 0, minutes: 4, failed: 0 } } },
        ] },
      { id: 'tm-steenbok', name: 'Steenbok', owner: 'Ryan', charter: 'Careful feature work in Unfold with tests. Sonnet on both sides; Haiku mops up review rounds.', weekly: 40, spent: 11.3, repositories: ['webgrip/unfold'], lineage: 'Zwaluw v2', adopted: 1, version: 2,
        positions: { plan: 'ag-haiku', build: 'ag-sonnet', review: 'ag-reviewer', fix: 'ag-haiku' },
        history: [
          { v: 1, note: 'Copied from Zwaluw v2 with Sonnet as the builder.', positions: { plan: null, build: 'ag-sonnet', review: 'ag-reviewer', fix: null }, record: { 'webgrip/unfold': { merged: 5, spent: 7.95, rounds: 1.4, reverts: 0, minutes: 6, failed: 0 } } },
          { v: 2, note: 'A Plan Run; the builder stopped guessing module boundaries.', positions: { plan: 'ag-haiku', build: 'ag-sonnet', review: 'ag-reviewer', fix: 'ag-haiku' }, record: { 'webgrip/unfold': { merged: 9, spent: 10.08, rounds: 1.1, reverts: 0, minutes: 4, failed: 0 } } },
        ] },
      { id: 'tm-erf', name: 'Erf', owner: 'Noor', charter: 'erfbeeld (PHP) maintenance on the frozen OpenHands harness until the Goose port lands.', weekly: 10, spent: 1.05, repositories: ['webgrip/erfbeeld'], lineage: null, adopted: 0, version: 1,
        positions: { plan: null, build: 'ag-erf', review: 'ag-qwen', fix: null },
        history: [
          { v: 1, note: 'First version.', positions: { plan: null, build: 'ag-erf', review: 'ag-qwen', fix: null }, record: { 'webgrip/erfbeeld': { merged: 5, spent: 3.15, rounds: 2.4, reverts: 1, minutes: 11, failed: 1, failedWhy: 'composer install blocked: the registry is not on the egress allowlist' } } },
        ] },
    ],
  };
}

/** A fresh agent draft for the builder. */
export function newAgent() {
  return { id: null, name: '', harness: 'opencode', model: 'haiku', skills: ['agit'], permissions: ['push', 'comment'], budget: 1.5, owner: 'You' };
}

/** A fresh Team for the roster. */
export function newTeam(id) {
  return { id, name: 'New team', owner: 'You', charter: '', weekly: 10, spent: 0, repositories: [], lineage: null, adopted: 0, version: 1, positions: { plan: null, build: null, review: null, fix: null }, history: [{ v: 1, note: 'First version.', positions: { plan: null, build: null, review: null, fix: null }, record: {} }] };
}

/**
 * Whether an agent can enter a repository, and why not. These are the rules that used to surface as a failed Run:
 * the homelab executor reaches Forgejo only, and OpenHands refuses a repository that ships `.openhands/hooks.json`.
 */
export function repositoryAccess(agent, repository) {
  const harness = harnessOf(agent);
  if (!repository) return { ok: false, why: 'unknown repository' };
  if (repository.forge === 'GitHub') return { ok: false, why: 'the homelab executor reaches Forgejo repositories only' };
  if (harness?.refusesHooksFile && repository.hooksFile) return { ok: false, why: 'OpenHands refuses a repository that ships .openhands/hooks.json' };
  return { ok: true, why: '' };
}

/** What stops or weakens an agent as configured. `block` stops the save; `warn` shows beside the preview. */
export function agentIssues(agent) {
  const issues = [];
  const harness = harnessOf(agent);
  const model = modelOf(agent);
  if (harness?.modelsOnly && model && model.vendor !== harness.modelsOnly) issues.push({ kind: 'block', text: `${harness.name} runs Claude models only. Pick one, or change the harness.` });
  if (model && model.runCost > 0 && agent.budget < model.runCost * 1.5) issues.push({ kind: 'warn', text: `The budget per Run (${money(agent.budget)}) sits below 1.5 times a typical Run on ${model.name} (${money(model.runCost)}), so Runs will stop early.` });
  if (agent.permissions.includes('dispatch') && !agent.permissions.includes('create-work')) issues.push({ kind: 'warn', text: 'Dispatching created work needs Create follow-up work as well.' });
  if (agent.permissions.includes('push') && !agent.skills.includes('agit')) issues.push({ kind: 'warn', text: 'Pushing to Forgejo without the AGit push skill opens no pull request; the branch just sits there.' });
  if (!agent.permissions.includes('push') && !agent.permissions.includes('comment')) issues.push({ kind: 'warn', text: 'This agent can neither push nor comment, so nobody sees its work.' });
  return issues;
}

/** The typical cost of one Run of an agent: the median on its model. */
export const runCost = agent => modelOf(agent)?.runCost ?? 0;

/** The positions of a Team whose agent cannot enter a repository, each with its reason. */
export function teamBlocks(team, repositoryId, agents) {
  const repository = repositoryOf(repositoryId);
  const blocks = [];
  for (const position of positions) {
    const agent = byId(agents, team.positions[position.id]);
    if (!agent) continue;
    const access = repositoryAccess(agent, repository);
    if (!access.ok) blocks.push(`${position.name} (${agent.name}): ${access.why}`);
  }
  return blocks;
}

/** What one task is expected to cost a Team: each filled position's Runs at its agent's typical Run, scaled by size. */
export function teamEstimate(team, agents, { size = 'm', rounds = 1.3 } = {}) {
  const factor = byId(sizes, size)?.factor ?? 1;
  const parts = [];
  let total = 0;
  for (const position of positions) {
    const agent = byId(agents, team.positions[position.id]);
    if (!agent) continue;
    const runs = position.id === 'review' ? rounds : position.id === 'fix' ? Math.max(0, rounds - 1) : position.runs;
    const cost = runCost(agent) * runs * factor;
    total += cost;
    parts.push({ position: position.name, agent: agent.name, cost });
  }
  return { total, parts };
}

/** The record of a Team's current version on a repository, or null while it has none. */
export function currentRecord(team, repositoryId) {
  const current = team.history.find(entry => entry.v === team.version);
  return current?.record?.[repositoryId] ?? null;
}

/** The newest record a Team has on a repository across its versions, or null. */
export function anyRecord(team, repositoryId) {
  return [...team.history].reverse().map(entry => entry.record?.[repositoryId]).find(Boolean) ?? null;
}

/**
 * Whether a Team fits a card: both required positions filled, the repository declared, every agent able to enter it,
 * weekly headroom above the estimate, and a record on that repository (without one the gate asks before spending).
 */
export function fit(team, agents, { repository, size = 'm' }) {
  const blocks = teamBlocks(team, repository, agents);
  const record = currentRecord(team, repository) ?? anyRecord(team, repository);
  const estimate = teamEstimate(team, agents, { size, rounds: record?.rounds ?? 1.3 }).total;
  const headroom = team.weekly - (team.spent ?? 0);
  const reasons = [];
  let status = 'ok';
  if (!team.positions.build || !team.positions.review) { status = 'blocked'; reasons.push('the Build and Review positions must both be filled'); }
  if (!team.repositories.includes(repository)) { status = 'blocked'; reasons.push(`${team.name} does not list ${repository}`); }
  if (blocks.length) { status = 'blocked'; reasons.push(...blocks); }
  if (status === 'ok' && headroom < estimate) { status = 'blocked'; reasons.push(`its weekly headroom of ${money(Math.max(0, headroom))} is below the estimate of ${money(estimate)}`); }
  if (status === 'ok' && !record) { status = 'ask'; reasons.push('it has no record on this repository yet, so it would run under your experiment budget'); }
  const quality = record ? (1 / (1 + Math.max(0, record.rounds - 1))) * (record.reverts ? 0.7 : 1) : 0.5;
  const score = record ? quality * 2 - Math.min(estimate, 3) / 3 : -1;
  return { status, reasons, estimate, record, headroom, score };
}

/** The Teams that could take a card, best record on like work first. */
export function ranked(teams, agents, card, { except } = {}) {
  return teams.filter(team => team.id !== except).map(team => ({ team, fit: fit(team, agents, card) })).filter(entry => entry.fit.status !== 'blocked').sort((a, b) => b.fit.score - a.fit.score);
}

/**
 * The comment the gate posts on the card once Unfold is assigned: starting with an estimate, one question when the
 * Team has no record there, not starting with the reasons and the Teams that do fit, or the ranked Teams when the
 * Team field is empty. Returns `{ tone, headline, lines, ranked }` for the markup to draw.
 */
export function gateVerdict(teams, agents, card) {
  const team = byId(teams, card.team);
  if (!team) {
    const fits = ranked(teams, agents, card);
    return { tone: 'attention', headline: 'Which Team?', lines: [`The Team field is empty. ${fits.length ? `These fit ${card.repository}, best record on like work first.` : `No Team fits ${card.repository}; the card waits in Ready.`}`], ranked: fits, action: fits.length ? 'Set the field, or reply with a number.' : 'Build a Team that lists this repository.' };
  }
  const result = fit(team, agents, card);
  if (result.status === 'ok') {
    return { tone: 'success', headline: `${team.name} v${team.version} starts`, lines: [`Estimate ${money(result.estimate)} on like work: ${result.record.merged} merged in ${card.repository}, ${result.record.rounds.toFixed(1)} review rounds, ${plural(result.record.reverts, 'revert')}.`, `Headroom after this card: ${money(result.headroom - result.estimate)}. Branch agent/${card.reference}; the pull request link lands here when it opens.`], ranked: [] };
  }
  if (result.status === 'ask') {
    return { tone: 'attention', headline: `${team.name} fits, one question`, lines: [`${result.reasons[0][0].toUpperCase()}${result.reasons[0].slice(1)}.`], ranked: [], action: `Reply go to start under the experiment budget (${money(experimentBudget.left)} left), or pick another Team.` };
  }
  return { tone: 'danger', headline: `${team.name} cannot take this card`, lines: result.reasons.map(reason => `${reason[0].toUpperCase()}${reason.slice(1)}.`), ranked: ranked(teams, agents, card, { except: team.id }) };
}

/** Saves a Team's edits as its next version with an empty record; the old version stays comparable. */
export function saveVersion(team, edits) {
  const next = { ...team, ...edits, version: team.version + 1 };
  next.history = [...team.history, { v: next.version, note: edits.note || 'Edited in the builder.', positions: { ...next.positions }, record: {} }];
  return next;
}

/** A copy of a Team for a new owner: version 1, its lineage pointing at the source, which gains one adoption. */
export function copyTeam(team, id, owner = 'You') {
  const copy = { ...team, id, name: `${team.name} (copy)`, owner, lineage: `${team.name} v${team.version}`, adopted: 0, version: 1, spent: 0, repositories: [...team.repositories], positions: { ...team.positions }, history: [{ v: 1, note: `Copied from ${team.name} v${team.version}.`, positions: { ...team.positions }, record: {} }] };
  return { copy, source: { ...team, adopted: (team.adopted ?? 0) + 1 } };
}

/** The sentence under a Team's name: who built it, where it came from, who adopted it. */
export function teamLine(team) {
  return [`by ${team.owner}`, team.lineage ? `from ${team.lineage}` : '', team.adopted ? `adopted by ${plural(team.adopted, 'person', 'people')}` : ''].filter(Boolean).join(' · ');
}

/* ---------- markup ---------- */

const option = ({ group, type, item, checked, off, why }) => `<label class="tb-option${off ? ' is-off' : ''}"><input type="${type}" name="${group}" value="${escape(item.id)}"${checked ? ' checked' : ''}${off ? ' disabled' : ''}><span class="tb-option-name">${escape(item.name)}</span><span class="tb-option-hint">${escape(item.hint)}</span>${why ? `<span class="tb-option-why">${escape(why)}</span>` : ''}</label>`;

/** The builder form for one agent. */
export function agentForm(agent) {
  const harness = harnessOf(agent);
  return `<form class="tb-agent-form" data-form="teams-agent" autocomplete="off">
    <input type="hidden" name="id" value="${escape(agent.id ?? '')}">
    <div class="field"><label class="field-label" for="tb-agent-name">Name</label><input id="tb-agent-name" name="name" type="text" value="${escape(agent.name)}" placeholder="Something you will recognise on a card" required></div>
    <fieldset class="tb-fieldset"><legend class="field-label">Harness <span class="field-hint">The tool that runs the model inside the sandbox</span></legend><div class="tb-options">${harnesses.map(item => option({ group: 'harness', type: 'radio', item, checked: item.id === agent.harness })).join('')}</div></fieldset>
    <fieldset class="tb-fieldset"><legend class="field-label">Model</legend><div class="tb-options">${models.map(item => { const off = Boolean(harness?.modelsOnly && item.vendor !== harness.modelsOnly); return option({ group: 'model', type: 'radio', item, checked: item.id === agent.model && !off, off, why: off ? `${harness.name} runs Claude models only` : '' }); }).join('')}</div></fieldset>
    <fieldset class="tb-fieldset"><legend class="field-label">Skills</legend><div class="tb-options">${skills.map(item => option({ group: 'skills', type: 'checkbox', item, checked: agent.skills.includes(item.id) })).join('')}</div></fieldset>
    <fieldset class="tb-fieldset"><legend class="field-label">Permissions</legend><div class="tb-options">${permissions.map(item => option({ group: 'permissions', type: 'checkbox', item, checked: agent.permissions.includes(item.id) })).join('')}</div></fieldset>
    <div class="field"><label class="field-label" for="tb-agent-budget">Budget per Run <output class="num tb-range-out" for="tb-agent-budget">${escape(money(agent.budget))}</output></label><input id="tb-agent-budget" name="budget" type="range" min="0" max="600" step="10" value="${Math.round(agent.budget * 100)}"><p class="field-hint">A hard cap: a Run stops when it reaches it.</p></div>
    <div class="tb-form-actions">${button({ label: agent.id ? 'Save changes' : 'Save agent', variant: 'primary', type: 'submit', id: 'tb-agent-save' })}${button({ label: 'Start over', action: 'teams-agent-new' })}<span class="field-hint" id="tb-agent-message"></span></div>
  </form>`;
}

/** The live consequences of an agent as configured: cost, where it can work, what it may do. */
export function agentPreview(agent) {
  const harness = harnessOf(agent);
  const model = modelOf(agent);
  const issues = agentIssues(agent);
  const name = agent.name || 'Unnamed agent';
  const typical = runCost(agent);
  const rows = repositories.map(repository => { const access = repositoryAccess(agent, repository); return `<li class="tb-repo${access.ok ? '' : ' is-off'}"><span class="tb-repo-name">${escape(repository.id)} <span class="meta">${escape(repository.language)}</span></span>${access.ok ? badge({ tone: 'success', glyph: 'check', label: 'Can enter' }) : `<span class="tb-repo-why">${escape(access.why)}</span>`}</li>`; }).join('');
  const does = permissions.filter(permission => agent.permissions.includes(permission.id)).map(permission => `<li>${escape(permission.does)}</li>`).join('');
  return `<div class="tb-preview">
    <div class="tb-identity">${avatar({ name, kind: 'agent', size: 'lg' })}<div class="tb-identity-text"><h2 class="tb-identity-name">${escape(name)}</h2><p class="meta">${escape(harness?.name ?? '')} · ${escape(model?.name ?? '')}</p></div></div>
    <div class="stat-row tb-stats">${stat({ label: 'Typical Run', value: money(typical), detail: 'median on this model' })}${stat({ label: 'Per medium task', value: money(typical * 1.3), detail: '1.3 Runs in the Build position' })}${stat({ label: 'Stops at', value: money(agent.budget), detail: 'per Run, hard cap' })}</div>
    ${issues.length ? `<div class="tb-issues">${issues.map(issue => callout({ tone: issue.kind === 'block' ? 'danger' : 'attention', body: `<p>${escape(issue.text)}</p>` })).join('')}</div>` : ''}
    <h3 class="tb-h3">Where it can work</h3><ul class="tb-repos">${rows}</ul>
    <h3 class="tb-h3">What it may do</h3>${does ? `<ul class="tb-does">${does}</ul>` : '<p class="meta">Nothing yet. It can read the repository and think.</p>'}
    ${agent.skills.length ? `<h3 class="tb-h3">Skills it loads</h3><div class="tb-chips">${skills.filter(skill => agent.skills.includes(skill.id)).map(skill => chip({ label: skill.name })).join('')}</div>` : ''}
  </div>`;
}

/** The roster of agents as cards; the one being edited is marked. */
export function rosterMarkup(agents, teams, { editing } = {}) {
  if (!agents.length) return '<p class="meta">No agents yet. Build the first one above.</p>';
  return `<ul class="tb-roster">${agents.map(agent => {
    const used = teams.filter(team => Object.values(team.positions).includes(agent.id)).map(team => team.name);
    return `<li><button type="button" class="tb-card${editing === agent.id ? ' is-selected' : ''}" data-action="teams-agent-open" data-id="${escape(agent.id)}" aria-pressed="${editing === agent.id ? 'true' : 'false'}">
      <span class="tb-card-head">${avatar({ name: agent.name, kind: 'agent' })}<span class="tb-card-text"><span class="tb-card-name">${escape(agent.name)}</span><span class="meta">${escape(harnessOf(agent)?.name ?? '')} · ${escape(modelOf(agent)?.name ?? '')}</span></span></span>
      <span class="tb-chips">${chip({ label: `${money(runCost(agent))} per Run` })}${chip({ label: `cap ${money(agent.budget)}` })}${used.length ? chip({ tone: 'review', label: `in ${used.join(', ')}` }) : chip({ label: 'in no Team' })}${chip({ label: `by ${agent.owner}` })}</span>
    </button></li>`; }).join('')}</ul>`;
}

const summary = team => {
  const records = team.repositories.map(repository => currentRecord(team, repository)).filter(Boolean);
  const merged = records.reduce((sum, record) => sum + record.merged, 0);
  const spent = records.reduce((sum, record) => sum + record.spent, 0);
  return { merged, perMerged: merged ? spent / merged : null };
};

/** The list of Teams; the open one is marked. */
export function teamListMarkup(teams, { open } = {}) {
  return `<ul class="tb-roster tb-team-list">${teams.map(team => { const { merged, perMerged } = summary(team); return `<li><a class="tb-card${team.id === open ? ' is-selected' : ''}" href="#teams?team=${encodeURIComponent(team.id)}"${team.id === open ? ' aria-current="true"' : ''}>
    <span class="tb-card-head">${avatar({ name: team.name })}<span class="tb-card-text"><span class="tb-card-name">${escape(team.name)} <span class="meta">v${team.version}</span></span><span class="meta">${escape(teamLine(team))}</span></span></span>
    <span class="tb-chips">${chip({ label: `${merged} merged` })}${chip({ label: perMerged === null ? 'no record yet' : `${money(perMerged)} per merged` })}</span>
  </a></li>`; }).join('')}</ul>`;
}

const delta = (current, previous, key, lowerIsBetter, format = value => Number.isInteger(value) ? String(Math.abs(value)) : Math.abs(value).toFixed(1)) => {
  if (!previous || previous[key] === undefined || current[key] === undefined) return '';
  const change = current[key] - previous[key];
  if (Math.abs(change) < 0.005) return '<span class="tb-delta" data-same>same</span>';
  const good = lowerIsBetter ? change < 0 : change > 0;
  return `<span class="tb-delta" data-tone="${good ? 'success' : 'danger'}">${change < 0 ? '−' : '+'}${format(change)}</span>`;
};

/** The record table of one version of a Team, with deltas against the version before it. */
export function recordTable(team, version) {
  const entry = team.history.find(item => item.v === version) ?? team.history.at(-1);
  const previous = team.history.find(item => item.v === entry.v - 1);
  const rows = Object.entries(entry.record ?? {}).map(([repository, record]) => {
    const before = previous?.record?.[repository];
    const perMerged = record.merged ? record.spent / record.merged : 0;
    const beforePerMerged = before?.merged ? before.spent / before.merged : undefined;
    return {
      repository: escape(repository),
      merged: `${record.merged}${delta(record, before, 'merged', false)}`,
      perMerged: `${escape(money(perMerged))}${delta({ v: perMerged }, beforePerMerged === undefined ? null : { v: beforePerMerged }, 'v', true, value => money(Math.abs(value)))}`,
      rounds: `${record.rounds.toFixed(1)}${delta(record, before, 'rounds', true)}`,
      reverts: `${record.reverts}${delta(record, before, 'reverts', true)}`,
      minutes: `${record.minutes}${delta(record, before, 'minutes', true)}`,
      failed: record.failed ? `${record.failed} · ${escape(record.failedWhy ?? '')}` : '0',
    };
  });
  return table({ caption: `Record of ${team.name} v${entry.v}`, columns: [{ key: 'repository', label: 'On like work in' }, { key: 'merged', label: 'Merged', numeric: true }, { key: 'perMerged', label: 'Per merged', numeric: true }, { key: 'rounds', label: 'Review rounds', numeric: true }, { key: 'reverts', label: 'Reverts within 14 days', numeric: true }, { key: 'minutes', label: 'Review minutes', numeric: true }, { key: 'failed', label: 'Failed before a model ran' }], rows, empty: 'No Runs on this version yet.', className: 'tb-record' });
}

/** One Team's page: identity, charter, positions, repositories, budget, estimate and record. */
export function teamDetail(team, agents, { version } = {}) {
  const shown = team.history.some(entry => entry.v === version) ? version : team.version;
  const entry = team.history.find(item => item.v === shown);
  const previous = team.history.find(item => item.v === shown - 1);
  const estimate = teamEstimate(team, agents);
  const headroom = Math.max(0, team.weekly - (team.spent ?? 0));
  const positionRows = positions.map(position => `<div class="tb-position"><span class="tb-position-name">${escape(position.name)}<span class="meta">${escape(position.hint)}</span></span><select name="position.${position.id}" aria-label="${escape(position.name)} position"><option value="">— empty —</option>${agents.map(agent => `<option value="${escape(agent.id)}"${team.positions[position.id] === agent.id ? ' selected' : ''}>${escape(agent.name)} · ${escape(money(runCost(agent)))} per Run</option>`).join('')}</select></div>`).join('');
  const repositoryRows = repositories.map(repository => { const on = team.repositories.includes(repository.id); const blocks = on ? teamBlocks(team, repository.id, agents) : []; return `<li class="tb-repo"><label class="tb-repo-name"><input type="checkbox" name="repository" value="${escape(repository.id)}"${on ? ' checked' : ''}> ${escape(repository.id)}</label>${on ? (blocks.length ? badge({ tone: 'danger', glyph: 'alert', label: 'Blocked' }) : badge({ tone: 'success', glyph: 'check', label: 'Fits' })) : ''}${blocks.length ? `<span class="tb-repo-why">${blocks.map(escape).join('<br>')}</span>` : ''}</li>`; }).join('');
  return `<form class="tb-team-form" data-form="teams-team" autocomplete="off"><input type="hidden" name="id" value="${escape(team.id)}">
    <div class="tb-detail-head"><div class="tb-identity">${avatar({ name: team.name, size: 'lg' })}<div class="tb-identity-text"><h2 class="tb-identity-name">${escape(team.name)} <span class="meta">v${team.version}</span></h2><p class="meta">${escape(teamLine(team))}</p></div></div><div class="tb-detail-actions">${button({ label: 'Copy this Team', icon: 'copy', size: 'sm', action: 'teams-team-copy', data: { id: team.id } })}${button({ label: 'Delete', icon: 'trash', size: 'sm', variant: 'danger-ghost', action: 'teams-team-delete', data: { id: team.id } })}</div></div>
    <div class="field"><label class="field-label" for="tb-team-name">Name</label><input id="tb-team-name" name="name" type="text" value="${escape(team.name)}" required></div>
    <div class="field"><label class="field-label" for="tb-team-charter">Charter</label><textarea id="tb-team-charter" name="charter" rows="2" placeholder="What this Team is for, in one or two sentences">${escape(team.charter)}</textarea></div>
    <fieldset class="tb-fieldset"><legend class="field-label">Positions <span class="field-hint">A position is a slot in the flow; any agent can fill any slot</span></legend><div class="tb-positions">${positionRows}</div></fieldset>
    <fieldset class="tb-fieldset"><legend class="field-label">Repositories it may enter</legend><ul class="tb-repos">${repositoryRows}</ul></fieldset>
    <div class="field"><label class="field-label" for="tb-team-weekly">Weekly budget <output class="num tb-range-out" for="tb-team-weekly">${escape(money(team.weekly))}</output></label><input id="tb-team-weekly" name="weekly" type="range" min="500" max="10000" step="100" value="${Math.round(team.weekly * 100)}"><p class="field-hint">Spent this week ${escape(money(team.spent ?? 0))} · headroom ${escape(money(headroom))}${estimate.total ? ` ≈ ${plural(Math.floor(headroom / estimate.total), 'medium task')}` : ''}</p></div>
    <div class="stat-row tb-stats">${stat({ label: 'Estimate per medium task', value: money(estimate.total), detail: estimate.parts.length ? estimate.parts.map(part => `${part.position} ${money(part.cost)}`).join(' · ') : 'no positions filled' })}</div>
    <div class="tb-form-actions">${button({ label: `Save as v${team.version + 1}`, variant: 'primary', type: 'submit' })}<span class="field-hint">A save is a new version. Its record starts empty; the old one stays comparable.</span></div>
  </form>
  <section class="tb-record-section" aria-labelledby="tb-record-title"><div class="tb-record-head"><h3 class="tb-h3" id="tb-record-title">Record</h3>${segmented({ label: 'Version', action: 'teams-version', items: team.history.map(item => ({ id: `${team.id}|${item.v}`, label: `v${item.v}`, selected: item.v === shown })) })}</div>
    <p class="meta">v${shown}: ${escape(entry.note)}${previous ? ` Deltas are against v${previous.v}.` : ''}</p>
    ${recordTable(team, shown)}
    <p class="tb-note">Cost and speed never stand alone: review rounds, reverts and review minutes sit beside them, and the record is per repository, so a docs Team never beats a feature Team on raw numbers.</p>
  </section>`;
}

/** What the gate checks, in order. */
export const gateSteps = Object.freeze([['Who', 'The Team field, else the Teams that fit, ranked'], ['Can it enter', 'The repository against each position\'s harness'], ['Can it afford it', 'Weekly headroom against the estimate on like work'], ['Say so', 'One comment on the card, then start or wait']]);

/** The mocked tracker card and the gate's answer. */
export function assignMarkup(teams, agents, card, { comments = [] } = {}) {
  const verdict = gateVerdict(teams, agents, card);
  const sizeOptions = sizes.map(size => `<option value="${size.id}"${card.size === size.id ? ' selected' : ''}>${escape(size.label)} (${escape(size.hint)})</option>`).join('');
  const repositoryOptions = repositories.filter(repository => repository.forge === 'Forgejo').map(repository => `<option value="${escape(repository.id)}"${card.repository === repository.id ? ' selected' : ''}>${escape(repository.id)}</option>`).join('');
  const teamOptions = `<option value=""${card.team ? '' : ' selected'}>(empty)</option>${teams.map(team => `<option value="${escape(team.id)}"${card.team === team.id ? ' selected' : ''}>${escape(team.name)} v${team.version}</option>`).join('')}`;
  return `<div class="tb-assign">
    <form class="tb-assign-form tb-tracker-card" data-form="teams-assign" autocomplete="off">
      <div class="tb-tracker-head"><span class="mono">${escape(card.reference)}</span><span class="meta">Unfold › Way of working</span>${badge({ tone: 'live', label: 'Ready' })}</div>
      <h2 class="tb-tracker-title">${escape(card.title)}</h2>
      <p class="tb-tracker-brief">${escape(card.brief)}</p>
      <div class="tb-tracker-fields">
        <div class="field"><span class="field-label">Assignees</span><span class="tb-assignee">${card.assigned ? `${avatar({ name: 'Unfold', kind: 'agent', size: 'sm' })} Unfold` : 'Nobody yet'}</span></div>
        <div class="field"><label class="field-label" for="tb-card-repository">Repository</label><select id="tb-card-repository" name="repository">${repositoryOptions}</select></div>
        <div class="field"><label class="field-label" for="tb-card-team">Team</label><select id="tb-card-team" name="team">${teamOptions}</select></div>
        <div class="field"><label class="field-label" for="tb-card-size">Size</label><select id="tb-card-size" name="size">${sizeOptions}</select></div>
      </div>
      <div class="tb-form-actions">${button({ label: 'Assign Unfold', variant: 'primary', type: 'submit', disabled: card.assigned })}${button({ label: 'Reset the card', action: 'teams-assign-reset' })}</div>
      <h3 class="tb-h3">Comments</h3>
      <ol class="tb-comments">${comments.length ? comments.map(comment => `<li class="tb-comment">${avatar({ name: comment.who, kind: comment.who === 'Unfold' ? 'agent' : 'person', size: 'sm' })}<div class="tb-comment-body"><p class="meta"><strong>${escape(comment.who)}</strong> · ${escape(comment.when)}</p>${comment.html}</div></li>`).join('') : '<li class="meta">No comments yet.</li>'}</ol>
    </form>
    <aside class="tb-gate" aria-labelledby="tb-gate-title">
      <h3 class="tb-h3" id="tb-gate-title">What the gate checks</h3>
      <ol class="tb-gate-steps">${gateSteps.map(([label, hint], index) => `<li class="tb-gate-step"${(card.team ? (verdict.tone === 'danger' ? 1 : 3) : 0) === index ? ' aria-current="step"' : ''}><span class="tb-gate-step-number">Step ${index + 1}</span><span class="tb-gate-step-name">${escape(label)}</span><span class="meta">${escape(hint)}</span></li>`).join('')}</ol>
      <h3 class="tb-h3">If you assign now</h3>
      ${verdictMarkup(verdict)}
    </aside>
  </div>`;
}

/** The gate's verdict drawn as the comment it would post. */
export function verdictMarkup(verdict) {
  const list = verdict.ranked.length ? `<ol class="tb-ranked">${verdict.ranked.map(entry => `<li class="tb-rank"><span class="tb-rank-text"><strong>${escape(entry.team.name)} v${entry.team.version}</strong><span class="meta">${entry.fit.record ? `${entry.fit.record.merged} merged · ${entry.fit.record.rounds.toFixed(1)} rounds · ${plural(entry.fit.record.reverts, 'revert')}` : 'no record here yet'}</span></span>${chip({ label: money(entry.fit.estimate) })}</li>`).join('')}</ol>` : '';
  return callout({ tone: verdict.tone, title: verdict.headline, body: `${verdict.lines.map(line => `<p>${escape(line)}</p>`).join('')}${list}${verdict.action ? `<p class="meta">${escape(verdict.action)}</p>` : ''}` });
}

/** The demo disclaimer the page opens with. */
export const builderNote = () => demoNote('Demo. Your agents and Teams live in this browser only, nothing here starts a Run, and the amounts follow the shape of real Runs without being charges.');

/** The facts about the gate for the page's help disclosure. */
export const gateFacts = () => dl([
  ['Who', 'The Team field on the card says who; assigning the Unfold member says go.'],
  ['When', 'The gate answers on the card within seconds, before any sandbox is claimed.'],
  ['What it never does', 'Guess a Team, or start a Run the Team cannot afford.'],
], { rows: true });
