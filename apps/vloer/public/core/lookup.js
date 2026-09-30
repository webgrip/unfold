import { state } from './state.js';
import { escape } from './dom.js';
import { sessionStatuses, sessionStatus } from './states.js';

/** Plain-language names for each session status, from the shared state vocabulary. */
export const labels = Object.fromEntries(['queued', 'running', 'exporting', 'waiting_input', 'paused', 'completed', 'failed', 'cancelled', 'interrupted'].map(key => [key, sessionStatuses[key].label]));
const providers = { forgejo: 'Forgejo', github: 'GitHub', gitlab: 'GitLab', clickup: 'ClickUp', vikunja: 'Vikunja', demo: 'Demo fixture' };
/** Display names for the providers that link a personal account. */
export const providerLabels = { gitlab: 'GitLab', clickup: 'ClickUp' };

/** Renders a status badge; `label` defaults to the plain-language status name. */
export function status(value, label = labels[value] || value) { return `<span class="status status-${escape(value)}"><span></span>${escape(label)}</span>`; }
/** Names a configured repository, falling back to its id. */
export function repoName(id) { return state.bootstrap.repositories.find(repo => repo.id === id)?.name || id; }
/** Names a configured crew, falling back to its id. */
export function crewName(id) { return state.bootstrap.crews.find(crew => crew.id === id)?.name || id; }
/** Names a configured runtime, falling back to its id. */
export function runtimeName(id) { return state.bootstrap.runtimes.find(runtime => runtime.id === id)?.name || id; }
/** Names a configured workspace placement, falling back to its id. */
export function placementName(id) { return state.bootstrap.placements?.find(placement => placement.id === id)?.name || id; }
/** Renders the workspace placement select when more than one placement is configured. */
export function placementField(idPrefix, selected) {
  const placements = state.bootstrap.placements || [];
  if (placements.length < 2) return '';
  const current = selected || placements.find(placement => placement.default)?.id || placements[0].id;
  return `<label>Workspace placement<select id="${idPrefix}-placement" name="placement">${placements.map(placement => `<option value="${escape(placement.id)}" ${current === placement.id ? 'selected' : ''}>${escape(placement.name)}</option>`).join('')}</select></label>`;
}
/** Whether a session is running, waiting for input or exporting. */
export function isActive(session) { return ['running','waiting_input','exporting'].includes(session.status); }
/** The task connections the bootstrap offers. */
export function taskSources() { return state.bootstrap.taskSources || []; }
/** The task connection currently selected on the Tasks page. */
export function selectedTaskSource() { return taskSources().find(source => source.id === state.taskSourceId); }
/** Names a tracker provider, falling back to its id. */
export function providerName(id) { return providers[id] || id; }
/** Names a session's status, including the recorded review decision once completed. */
export function statusLabel(session) { return sessionStatus(session).label; }
