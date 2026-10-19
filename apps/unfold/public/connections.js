import { escape } from './core/dom.js';
import { icon } from './core/icons.js';
import { badge } from './core/ui.js';
import { plural, relative } from './core/format.js';

const looks = {
  ok: { tone: 'success', glyph: 'check-circle', label: 'Works' },
  problem: { tone: 'danger', glyph: 'x-circle', label: 'Broken' },
  warning: { tone: 'attention', glyph: 'alert', label: 'Check' },
  unknown: { tone: 'neutral', glyph: 'help-circle', label: 'Unknown' },
  info: { tone: 'neutral', glyph: 'circle-dashed', label: 'Not checked' },
};
const trackerNames = { vikunja: 'Vikunja', clickup: 'ClickUp', github: 'GitHub Issues', demo: 'Demo' };
const forgeHooks = { forgejo: 'Forgejo', github: 'GitHub', gitlab: 'GitLab' };
const repoName = repository => `${repository.owner}/${repository.repo}`;
const branchName = repository => repository.baseBranch || 'its default branch';
const list = items => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

function readinessCheck(repository) {
  if (repository.readiness === 'ready') return { id: 'ready', title: 'Ready for agents', status: 'ok', text: `Not archived, not a mirror, and ${repoName(repository)} has an AGENTS.md on ${branchName(repository)}.` };
  if (repository.readiness === 'not_ready') return { id: 'ready', title: 'Ready for agents', status: 'problem', text: `Ploeg refuses every task routed here: ${repository.reason || 'it gave no reason'}.`, fix: `Add an AGENTS.md at the root of ${branchName(repository)}, or unarchive the repository. Ploeg checks again on the next task, so no restart is needed.` };
  return { id: 'ready', title: 'Ready for agents', status: 'unknown', text: `Ploeg could not ask the forge: ${repository.reason || 'no reason given'}.`, fix: 'Check that Ploeg’s bot can read the repository. Ploeg asks again within the hour.' };
}

function reviewsCheck(repository, windowDays, now) {
  if (repository.lastForgeEventAt) return { id: 'reviews', title: 'Reviews reach Ploeg', status: 'ok', text: `The forge last told Ploeg about a pull request ${relative(repository.lastForgeEventAt, now)}.` };
  const forge = forgeHooks[repository.forge] || `${repository.forge.charAt(0).toUpperCase()}${repository.forge.slice(1)}`;
  return { id: 'reviews', title: 'Reviews reach Ploeg', status: 'warning', text: `${forge} sent Ploeg no pull request event in ${windowDays} days. If agents opened pull requests here, the webhook is missing: a request-changes review never sends the work back to the Team.`, fix: `Add a webhook on ${repoName(repository)} to Ploeg’s /webhooks/forge/${repository.forge} for pull request and review events, signed with Ploeg’s forge secret.` };
}

function routedCheck(repository) {
  if (repository.boards.length) return { id: 'boards', title: 'Reached from', status: 'ok', text: `${list(repository.boards)}${repository.label ? `, and the label repo/${repository.label} where a board allows it` : ''}.` };
  return { id: 'boards', title: 'Reached from', status: 'info', text: repository.label ? `No board you can see routes here. A task reaches it only with the label repo/${repository.label} on a board that allows it.` : 'No board you can see routes here.' };
}

function webhookCheck(board) {
  const name = trackerNames[board.tracker] || board.tracker;
  const cases = {
    present: { status: 'ok', text: `${name} tells Ploeg when a task here is assigned to a Team.` },
    missing: { status: 'problem', text: 'Assigning a task to a Team here does nothing: the board has no webhook that tells Ploeg.', fix: 'Ploeg’s tracker wiring registers it every 15 minutes once Ploeg’s bot is shared into the board as an admin. Otherwise add a webhook for task.assignee.created to Ploeg’s /webhooks/tracker/vikunja.' },
    unreadable: { status: 'problem', text: 'Ploeg’s bot cannot read this board, so Ploeg cannot check or register its webhook.', fix: 'Share Ploeg’s bot into the board as an admin.' },
    unresolved: { status: 'problem', text: `No ${name} project has this name, so Ploeg routes nothing from it.`, fix: 'Rename the entry in Ploeg’s routing to match the board, or pin its id.' },
    unchecked: { status: 'info', text: `Ploeg does not check ${name} webhooks yet.` },
  };
  return { id: 'webhook', title: 'Assignments reach Ploeg', ...(cases[board.webhook] || cases.unchecked) };
}

function teamsCheck(board) {
  if (!board.teams.length) return { id: 'teams', title: 'Teams that can be assigned', status: 'info', text: board.team ? `Pinned to ${board.team}, a Team you cannot read.` : 'No Team you can read has a tracker user.' };
  const blocked = board.teams.flatMap(entry => entry.assignees.filter(user => user.shared === false).map(user => ({ team: entry.team, username: user.username })));
  const unknown = board.teams.some(entry => entry.assignees.some(user => user.shared === null));
  const names = board.teams.map(entry => entry.team);
  const pinned = board.team ? ` The board is pinned to ${board.team}: every task here runs as that Team.` : '';
  if (blocked.length) return { id: 'teams', title: 'Teams that can be assigned', status: 'problem', text: `${list(blocked.map(entry => entry.username === entry.team ? entry.username : `${entry.username} (${entry.team})`))} cannot see this board, so a task cannot be assigned to ${blocked.length === 1 ? 'that Team' : 'those Teams'} here.${pinned}`, fix: `Share ${list(blocked.map(entry => entry.username))} into the board. Ploeg’s tracker wiring does this every 15 minutes for every Team user it knows.` };
  if (unknown) return { id: 'teams', title: 'Teams that can be assigned', status: 'unknown', text: `${list(names)}. Ploeg could not read who the board is shared with.${pinned}` };
  return { id: 'teams', title: 'Teams that can be assigned', status: 'ok', text: `${list(names)}.${pinned}` };
}

function routeCheck(board, byKey) {
  const describe = key => { const repository = byKey.get(key); return repository ? repoName(repository) : key; };
  const parts = [];
  if (board.repository) parts.push(`Work goes to ${describe(board.repository)}.`);
  if (board.default) parts.push(`Work without a repo/ label goes to ${describe(board.default)}.`);
  else if (!board.repository && board.allow.length) parts.push('Every task needs a repo/ label.');
  if (board.allow.length) parts.push(`A label may pick ${list(board.allow.map(key => `repo/${key}`))}.`);
  const broken = [board.repository, board.default, ...board.allow].filter(Boolean).filter(key => byKey.get(key)?.readiness === 'not_ready');
  if (broken.length) return { id: 'route', title: 'Where work goes', status: 'problem', text: `${parts.join(' ')} ${list(broken.map(describe))} ${broken.length === 1 ? 'is' : 'are'} not ready, so tasks routed there are refused.`, fix: 'Fix the repository below.' };
  return { id: 'route', title: 'Where work goes', status: parts.length ? 'ok' : 'info', text: parts.join(' ') || 'This board names no repository.' };
}

function sourcesCheck(board) {
  if (!board.sources.length) return { id: 'unfold', title: 'Shown in Unfold', status: 'info', text: 'Unfold does not list this board’s tasks, so its work can only be handed over in the tracker.', fix: 'Add a taskSources entry for the board to hand work over from Tasks.' };
  const wrong = board.sources.filter(source => !source.routed);
  if (wrong.length) return { id: 'unfold', title: 'Shown in Unfold', status: 'warning', text: `${list(wrong.map(source => `${source.name} sends its tasks to ${source.target}`))}, which this board does not route to. Ploeg decides by the board, so the task lands elsewhere.`, fix: 'Make the task source’s Ploeg target match the board’s repository.' };
  return { id: 'unfold', title: 'Shown in Unfold', status: 'ok', text: `In Tasks as ${list(board.sources.map(source => source.name))}.` };
}

/**
 * Every repository and board Ploeg routes to, each with the checks a person reads to know whether work can flow and
 * what to fix: a repository's readiness, whether its forge reports reviews and which boards reach it; a board's
 * webhook, which Teams can be assigned on it, where its work goes and whether Unfold shows it. Problems sort first.
 * @param {object} data A `GET /api/ploeg/connections` response.
 * @param {number} [now]
 * @returns {{ supported: boolean, demo: boolean, checkedAt: string|null, repositories: object[], boards: object[], unrouted: object[], problems: number, warnings: number }}
 */
export function connectionsModel(data, now = Date.now()) {
  const repositories = Array.isArray(data?.repositories) ? data.repositories : [];
  const byKey = new Map(repositories.map(repository => [repository.key, repository]));
  const rank = entry => entry.checks.some(check => check.status === 'problem') ? 0 : entry.checks.some(check => check.status === 'warning' || check.status === 'unknown') ? 1 : 2;
  const sorted = entries => entries.map((entry, index) => ({ entry, index })).sort((a, b) => rank(a.entry) - rank(b.entry) || a.index - b.index).map(item => item.entry);
  const repos = sorted(repositories.map(repository => ({ id: `repo-${repository.key}`, kind: 'repository', title: repoName(repository), subtitle: [repository.baseBranch, repository.forge, repository.label ? `repo/${repository.label}` : ''].filter(Boolean).join(' · '), checks: [readinessCheck(repository), reviewsCheck(repository, data.eventWindowDays || 30, now), routedCheck(repository)] })));
  const boards = sorted((Array.isArray(data?.boards) ? data.boards : []).map((board, index) => ({ id: `board-${index}`, kind: 'board', title: board.name, subtitle: [trackerNames[board.tracker] || board.tracker, board.projectId ? `project ${board.projectId}` : ''].filter(Boolean).join(' · '), checks: [webhookCheck(board), teamsCheck(board), routeCheck(board, byKey), sourcesCheck(board)] })));
  const unrouted = (Array.isArray(data?.unrouted) ? data.unrouted : []).map(source => ({ ...source, check: { id: 'unrouted', title: source.name, status: 'problem', text: `Unfold lists this board and offers to hand its tasks to Ploeg, but Ploeg routes no work from ${trackerNames[source.provider] || source.provider} project ${source.project}. A hand-off assigns the Team and nothing starts.`, fix: 'Add the board to Ploeg’s routing, or set the task source’s executionOwner to interactive.' } }));
  const checks = [...repos, ...boards].flatMap(entry => entry.checks);
  return {
    supported: data?.supported !== false, demo: Boolean(data?.demo), checkedAt: data?.checkedAt ?? null, repositories: repos, boards, unrouted,
    problems: checks.filter(check => check.status === 'problem').length + unrouted.length,
    warnings: checks.filter(check => check.status === 'warning').length,
  };
}

/**
 * One sentence over the whole view: how many things are broken and how many need a look.
 * @param {ReturnType<typeof connectionsModel>} model
 * @returns {string}
 */
export function connectionsHeadline(model) {
  if (!model.supported) return 'This Ploeg does not report its connections yet.';
  if (!model.repositories.length && !model.boards.length) return 'Ploeg routes no boards yet.';
  const what = `${plural(model.boards.length, 'board')} and ${plural(model.repositories.length, 'repository', 'repositories')}`;
  if (!model.problems && !model.warnings) return `Every connection works: ${what}.`;
  const parts = [model.problems ? `${plural(model.problems, 'problem')} to fix` : '', model.warnings ? `${model.warnings} to check` : ''].filter(Boolean);
  return `${parts.join(' and ')} across ${what}.`;
}

function checkRow(check, entryId) {
  const look = looks[check.status] || looks.info;
  const fix = check.fix && check.status !== 'ok' ? `<p class="health-next">${icon('arrow')}<span>${escape(check.fix)}</span></p>` : '';
  return `<li class="health-check" data-tone="${look.tone}" data-status="${check.status}"><span class="health-icon" aria-hidden="true">${icon(look.glyph)}</span><div class="health-main"><div class="health-heading"><h4 class="health-title" id="${escape(`${entryId}-${check.id}`)}">${escape(check.title)}</h4>${badge({ tone: look.tone, label: look.label, size: 'sm' })}</div><p class="health-detail">${escape(check.text)}</p>${fix}</div></li>`;
}

function entryCard(entry) {
  const glyph = entry.kind === 'repository' ? 'folder' : 'inbox';
  const titleId = escape(`${entry.id}-title`);
  return `<section class="card settings-card connection-card" aria-labelledby="${titleId}"><header class="card-header"><div class="card-heading"><h3 class="card-title" id="${titleId}">${icon(glyph)}<span>${escape(entry.title)}</span></h3>${entry.subtitle ? `<p class="card-subtitle">${escape(entry.subtitle)}</p>` : ''}</div></header><ol class="health-list">${entry.checks.map(check => checkRow(check, entry.id)).join('')}</ol></section>`;
}

/**
 * The Connections page body: the headline, Unfold task sources Ploeg does not route, then every board and every
 * repository as a card of checks with the fix under each problem.
 * @param {ReturnType<typeof connectionsModel>} model
 * @param {{ now?: number }} [options]
 * @returns {string}
 */
export function connectionsMarkup(model, { now = Date.now() } = {}) {
  const checked = model.checkedAt ? `Boards checked ${escape(relative(model.checkedAt, now))}; Ploeg checks every hour.` : 'Ploeg has not finished its first board check since it started.';
  const tone = model.problems ? 'danger' : model.warnings ? 'attention' : 'success';
  const head = `<header class="connections-head" data-tone="${tone}"><p class="connections-headline">${escape(connectionsHeadline(model))}</p>${model.supported ? `<p class="connections-checked">${checked}</p>` : ''}</header>`;
  if (!model.supported) return `${head}<p class="connections-note">The Ploeg release Unfold runs against does not report how each board and repository is wired; a later one does (Ploeg ADR-0129). Until then, the wiring shows only in Ploeg’s logs and its <code>/readyz</code>.</p>`;
  const unrouted = model.unrouted.length ? `<section class="card settings-card connection-card" aria-labelledby="connections-unrouted-title"><header class="card-header"><div class="card-heading"><h2 class="card-title" id="connections-unrouted-title">In Unfold, not routed by Ploeg <span class="count">${model.unrouted.length}</span></h2><p class="card-subtitle">Task sources that hand work to Ploeg on a board Ploeg ignores.</p></div></header><ol class="health-list">${model.unrouted.map(source => checkRow(source.check, `unrouted-${source.id}`)).join('')}</ol></section>` : '';
  const group = (id, title, subtitle, entries) => entries.length ? `<section class="connections-group" aria-labelledby="${id}"><h2 class="connections-group-title" id="${id}">${escape(title)} <span class="count">${entries.length}</span></h2><p class="connections-group-note">${escape(subtitle)}</p><div class="connections-grid">${entries.map(entryCard).join('')}</div></section>` : '';
  return `${head}${unrouted}${group('connections-boards', 'Boards', 'Where tasks are handed to a Team.', model.boards)}${group('connections-repositories', 'Repositories', 'Where agents open pull requests.', model.repositories)}`;
}
