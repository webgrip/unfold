import { state, onForget, disconnect } from '../core/state.js';
import { $, escape, renderHtml, announce, notify } from '../core/dom.js';
import { button, disclosure, emptyState, segmented } from '../core/ui.js';
import { enabled, exposed } from '../core/flags.js';
import { money } from '../core/format.js';
import { shell } from '../shell.js';
import { agentForm, agentPreview, assignMarkup, builderNote, copyTeam, demoRoster, gateFacts, gateVerdict, newAgent, newTeam, rosterMarkup, saveVersion, teamDetail, teamListMarkup, verdictMarkup } from '../teams.js';

const labsFlag = 'teams.builder';
const storage = 'unfold.teamBuilder';
const tabs = [['agents', 'teams/agents', 'Build an agent'], ['teams', 'teams', 'Teams'], ['assign', 'teams/assign', 'Assign on a card']];
const demoCard = () => ({ reference: 'CU-8w2k', title: 'Add a "Needs you" status to the way-of-working doc', brief: 'The board gained a "Needs you" status this morning. The doc under docs/contributing still lists five statuses. Add the sixth, say when Ploeg moves a card into it, and link the Status page.', repository: 'acme/unfold', team: '', size: 's', assigned: false });

const view = { tab: 'teams', roster: null, draft: newAgent(), openTeam: null, version: null, card: demoCard(), comments: [], timer: null };
onForget(() => { clearTimeout(view.timer); Object.assign(view, { tab: 'teams', roster: null, draft: newAgent(), openTeam: null, version: null, card: demoCard(), comments: [], timer: null }); });

function readRoster() {
  try { const saved = JSON.parse(globalThis.localStorage?.getItem(storage) ?? 'null'); if (saved && Array.isArray(saved.agents) && Array.isArray(saved.teams)) return saved; } catch { /* a browser without storage starts from the demo roster */ }
  return demoRoster();
}
function keepRoster() { try { globalThis.localStorage?.setItem(storage, JSON.stringify(view.roster)); } catch { /* storage is a convenience; the page works without it */ } }
const roster = () => { if (!view.roster) view.roster = readRoster(); return view.roster; };
const teamById = id => roster().teams.find(team => team.id === id) ?? null;
const agentById = id => roster().agents.find(agent => agent.id === id) ?? null;
const newId = prefix => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
const clockNow = () => new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

function tabsMarkup() {
  return segmented({ label: 'Team builder area', items: tabs.map(([id, hash, label]) => ({ id, label, href: `#${hash}`, selected: view.tab === id })) });
}

function agentsBody() {
  return `<div class="tb-columns">
    <section class="card tb-panel" aria-labelledby="tb-build-title"><div class="card-body"><h2 class="tb-h2" id="tb-build-title">${view.draft.id ? `Editing ${escape(view.draft.name)}` : 'Build an agent'}</h2><p class="meta">An agent is one configuration that can fill a position in a Team: harness, model, skills, permissions and a budget per Run. Every choice shows its consequence beside it before anything runs.</p>${agentForm(view.draft)}</div></section>
    <aside class="card tb-panel tb-sticky" aria-labelledby="tb-preview-title"><div class="card-body"><h2 class="sr-only" id="tb-preview-title">What this agent is</h2><div id="tb-agent-preview">${agentPreview(view.draft)}</div></div></aside>
  </div>
  <section class="tb-section" aria-labelledby="tb-roster-title"><div class="tb-section-head"><h2 class="tb-h2" id="tb-roster-title">Your roster</h2><p class="meta">Open an agent to edit it. Teams pick from this roster; a saved change applies to their next Run.</p></div>${rosterMarkup(roster().agents, roster().teams, { editing: view.draft.id })}</section>`;
}

function teamsBody() {
  const { teams, agents } = roster();
  const open = teamById(view.openTeam) ?? teams[0] ?? null;
  if (open) view.openTeam = open.id;
  return `<div class="tb-teamgrid">
    <div class="tb-team-side"><nav aria-label="Teams">${teams.length ? teamListMarkup(teams, { open: open?.id }) : '<p class="meta">No Teams yet.</p>'}</nav><div class="tb-side-actions">${button({ label: 'New Team', icon: 'plus', size: 'sm', action: 'teams-team-new' })}</div>
      <section class="card tb-panel" aria-labelledby="tb-experiment-title"><div class="card-body"><p class="overline" id="tb-experiment-title">Your experiment budget this week</p><p class="tb-experiment num">${escape(money(3.2))} <span class="meta">of ${escape(money(5))} left</span></p><p class="meta">Runs under it count toward no Team's record, so trying a new model costs nothing in reputation.</p></div></section></div>
    <section class="card tb-panel tb-team-main" aria-labelledby="tb-team-title"><div class="card-body"><h2 class="sr-only" id="tb-team-title">${open ? escape(open.name) : 'Teams'}</h2>${open ? teamDetail(open, agents, { version: view.version }) : emptyState({ icon: 'layers', title: 'Build your first Team', body: '<p>A Team puts agents into the positions of a workflow and carries a charter, a weekly budget and the repositories it may enter.</p>', actions: button({ label: 'New Team', icon: 'plus', variant: 'primary', action: 'teams-team-new' }) })}</div></section>
  </div>`;
}

function assignBody() {
  return `${assignMarkup(roster().teams, roster().agents, view.card, { comments: view.comments })}${disclosure({ summary: 'How the gate works on a real board', body: gateFacts() })}`;
}

function renderTeams() {
  if (!enabled(labsFlag)) {
    renderHtml(shell(emptyState({ icon: 'layers', title: 'Teams is a Labs feature', body: '<p>Turn on <strong>Team builder</strong> under Settings › Labs to build agents, compose Teams and rehearse the assignment gate.</p>', actions: button({ label: 'Open Labs', href: '#settings/labs', variant: 'primary' }) }), { title: 'Teams', subtitle: 'Build agents, put them in positions, and see what each Team is worth.' }));
    return;
  }
  exposed(labsFlag, { screen: 'teams' });
  const body = view.tab === 'agents' ? agentsBody() : view.tab === 'assign' ? assignBody() : teamsBody();
  const subtitle = view.tab === 'agents' ? 'Every choice shows its consequence before a Run starts.' : view.tab === 'assign' ? 'The Team field says who; assigning Unfold says go. The gate answers on the card.' : 'A Team is agents in positions, with a charter, a budget and a record per version.';
  renderHtml(shell(`<div class="tb">${builderNote()}<div class="tb-tabs">${tabsMarkup()}${button({ label: 'Reset the demo roster', icon: 'undo', size: 'sm', variant: 'ghost', action: 'teams-reset-demo' })}</div>${body}</div>`, { title: 'Teams', subtitle, wide: true }));
}

function readAgentForm(form) {
  const data = new FormData(form);
  const draft = view.draft;
  draft.name = String(data.get('name') ?? '').trim();
  draft.harness = String(data.get('harness') ?? draft.harness);
  draft.model = String(data.get('model') ?? draft.model);
  draft.skills = data.getAll('skills').map(String);
  draft.permissions = data.getAll('permissions').map(String);
  draft.budget = Number(data.get('budget') ?? 0) / 100;
  return draft;
}

function previewAgent(element) {
  const form = element.closest('form');
  if (!form) return;
  readAgentForm(form);
  if (element.name === 'harness') { renderTeams(); $('#tb-agent-name')?.focus(); return; }
  const out = form.querySelector('.tb-range-out'); if (out) out.textContent = money(view.draft.budget);
  const preview = $('#tb-agent-preview'); if (preview) preview.innerHTML = agentPreview(view.draft);
}

function readTeamForm(form, team) {
  const data = new FormData(form);
  const edits = { name: String(data.get('name') ?? team.name).trim() || team.name, charter: String(data.get('charter') ?? '').trim(), weekly: Number(data.get('weekly') ?? team.weekly * 100) / 100, repositories: data.getAll('repository').map(String), positions: {} };
  for (const slot of ['plan', 'build', 'review', 'fix']) edits.positions[slot] = String(data.get(`position.${slot}`) ?? '') || null;
  return edits;
}

function previewTeam(element) {
  const form = element.closest('form'); const team = teamById(form?.querySelector('[name=id]')?.value);
  if (!form || !team) return;
  const edits = readTeamForm(form, team);
  if (element.type === 'range') { const out = form.querySelector('.tb-range-out'); if (out) out.textContent = money(edits.weekly); return; }
  Object.assign(team, edits);
  renderTeams();
}

function readCard(element) {
  const data = new FormData(element.closest('form'));
  Object.assign(view.card, { repository: String(data.get('repository')), team: String(data.get('team') ?? ''), size: String(data.get('size')) });
  renderTeams();
}

async function enterTeams({ tab = 'teams', query = {} } = {}) {
  clearTimeout(view.timer);
  disconnect(); state.session = null; state.view = 'teams';
  view.tab = tab;
  if (query.team) view.openTeam = query.team;
  if (query.agent) { const agent = agentById(query.agent); if (agent) view.draft = { ...agent, skills: [...agent.skills], permissions: [...agent.permissions] }; }
  renderTeams();
}

/** Teams (`#teams`, the `teams.builder` Labs flag): build an agent, compose Teams with a record per version, and rehearse the assignment gate on a tracker card. */
export default {
  id: 'teams',
  match: hash => { const match = /^teams(?:\/(agents|assign))?(?:\?(.*))?$/.exec(hash); return match ? { tab: match[1] ?? 'teams', query: Object.fromEntries(new URLSearchParams(match[2] ?? '')) } : null; },
  enter: enterTeams,
  render: renderTeams,
  inputs: { '.tb-agent-form': previewAgent, '.tb-team-form input[type=range]': previewTeam },
  changes: { '.tb-agent-form input[type=radio], .tb-agent-form input[type=checkbox]': previewAgent, '.tb-team-form select, .tb-team-form input[type=checkbox]': previewTeam, '.tb-assign-form select': readCard },
  forms: {
    'teams-agent': (data, form) => {
      const draft = readAgentForm(form);
      if (!draft.name) { notify('Give the agent a name first.', true); return; }
      const { agents } = roster();
      if (draft.id) { const agent = agentById(draft.id); if (agent) Object.assign(agent, { name: draft.name, harness: draft.harness, model: draft.model, skills: [...draft.skills], permissions: [...draft.permissions], budget: draft.budget }); }
      else { draft.id = newId('ag'); agents.push({ ...draft, skills: [...draft.skills], permissions: [...draft.permissions], owner: 'You' }); }
      keepRoster(); renderTeams();
      announce(`Saved ${draft.name}. It applies to the next Run of any Team that uses it.`);
      notify(`Saved ${draft.name}`);
    },
    'teams-team': (data, form) => {
      const team = teamById(String(data.id)); if (!team) return;
      const next = saveVersion(team, readTeamForm(form, team));
      const { teams } = roster();
      teams.splice(teams.indexOf(team), 1, next);
      view.version = next.version;
      keepRoster(); renderTeams();
      announce(`Saved ${next.name} as version ${next.version}. Its record starts empty.`);
      notify(`Saved ${next.name} v${next.version}`);
    },
    'teams-assign': data => {
      Object.assign(view.card, { repository: String(data.repository), team: String(data.team ?? ''), size: String(data.size), assigned: true });
      view.comments.push({ who: 'You', when: clockNow(), html: '<p class="meta">assigned <strong>Unfold</strong></p>' });
      renderTeams();
      clearTimeout(view.timer);
      view.timer = setTimeout(() => {
        if (state.view !== 'teams' || view.tab !== 'assign') return;
        const verdict = gateVerdict(roster().teams, roster().agents, view.card);
        view.comments.push({ who: 'Unfold', when: clockNow(), html: verdictMarkup(verdict) });
        renderTeams();
        announce(`Unfold answered on the card: ${verdict.headline}`);
      }, 1400);
    },
  },
  actions: {
    'teams-agent-new': () => { view.draft = newAgent(); renderTeams(); $('#tb-agent-name')?.focus(); },
    'teams-agent-open': element => { const agent = agentById(element.dataset.id); if (!agent) return; view.draft = { ...agent, skills: [...agent.skills], permissions: [...agent.permissions] }; renderTeams(); $('#tb-agent-name')?.focus(); },
    'teams-team-new': () => { const team = newTeam(newId('tm')); roster().teams.push(team); view.openTeam = team.id; view.version = null; keepRoster(); renderTeams(); $('#tb-team-name')?.focus(); },
    'teams-team-copy': element => { const team = teamById(element.dataset.id); if (!team) return; const { copy, source } = copyTeam(team, newId('tm')); const { teams } = roster(); teams.splice(teams.indexOf(team), 1, source); teams.push(copy); view.openTeam = copy.id; view.version = null; keepRoster(); renderTeams(); announce(`Copied ${team.name}. ${source.name} now counts ${source.adopted} adoptions.`); },
    'teams-team-delete': element => { const { teams } = roster(); const team = teamById(element.dataset.id); if (!team || teams.length === 1) { notify('The last Team stays; edit it instead.', true); return; } teams.splice(teams.indexOf(team), 1); view.openTeam = teams[0].id; view.version = null; keepRoster(); renderTeams(); announce(`Deleted ${team.name}`); },
    'teams-version': element => { const [teamId, version] = String(element.dataset.id ?? '').split('|'); view.openTeam = teamId; view.version = Number(version); renderTeams(); },
    'teams-assign-reset': () => { clearTimeout(view.timer); view.card = demoCard(); view.comments = []; renderTeams(); },
    'teams-reset-demo': () => { view.roster = demoRoster(); view.draft = newAgent(); view.openTeam = null; view.version = null; keepRoster(); renderTeams(); announce('The demo roster is back.'); },
  },
};
