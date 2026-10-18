import { escape } from './dom.js';
import { icon } from './icons.js';
import { button, card, chip, dl, emptyState, stat, stateBadge, callout } from './ui.js';
import { compactCount, duration, money, plural, relativeWords, dateTime } from './format.js';

/** How each Linked Session state reads: its label, tone and glyph, the same for every surface that shows one. */
export const linkedStates = {
  working: { key: 'linked:working', label: 'Working', tone: 'live', live: true },
  waiting: { key: 'linked:waiting', label: 'Waiting for its person', tone: 'attention', glyph: 'bell' },
  idle: { key: 'linked:idle', label: 'Idle', tone: 'neutral', glyph: 'pause' },
  ended: { key: 'linked:ended', label: 'Ended', tone: 'neutral', glyph: 'check' },
  stale: { key: 'linked:stale', label: 'Not heard from', tone: 'neutral', glyph: 'clock' },
};

const harnessNames = { 'claude-code': 'Claude Code' };
const waitingWords = { permission_prompt: 'asks for a permission', idle_prompt: 'waits for your next prompt', elicitation_dialog: 'asks you a question', agent_needs_input: 'needs your input' };

/** The name of a harness, such as `Claude Code` for `claude-code`. */
export function harnessName(harness) { return harnessNames[harness] ?? String(harness ?? 'Agent'); }

/** One line saying what a Linked Session is doing: its state, what it waits for, and when it last reported. */
export function linkedStatusLine(session, now = Date.now()) {
  const state = linkedStates[session.state] ?? linkedStates.idle;
  const waits = session.state === 'waiting' && waitingWords[session.waitingFor] ? ` · ${waitingWords[session.waitingFor]}` : '';
  return `${state.label}${waits} · last heard ${relativeWords(session.lastSeenAt, now)}`;
}

/** What a session's commits say about AI-written lines: `312 AI-written lines in 4 commits`, or why there is nothing to count. */
export function attributionLine(session) {
  const commits = session.commits ?? [];
  if (!commits.length) return 'No commits yet';
  const traced = commits.filter(entry => entry.aiLines !== null && entry.aiLines !== undefined);
  if (!traced.length) return `${plural(commits.length, 'commit')}, none with an Agent Trace record`;
  return `${compactCount(session.aiLines ?? 0)} AI-written ${session.aiLines === 1 ? 'line' : 'lines'} in ${plural(traced.length, 'commit')}${traced.length < commits.length ? ` of ${commits.length}` : ''}`;
}

function sessionTitle(session) { return session.title || (session.branch ? `On ${session.branch}` : `${harnessName(session.harness)} session`); }

function linkedRow(session, { now, canChange, workItemId }) {
  const state = linkedStates[session.state] ?? linkedStates.idle;
  const facts = [
    `${harnessName(session.harness)}${session.model ? ` · ${session.model}` : ''} · ${session.mine ? 'you' : session.ownerName}`,
    session.branch ? `branch ${session.branch}` : '',
    attributionLine(session),
  ].filter(Boolean).map(entry => `<li>${escape(entry)}</li>`).join('');
  const how = session.workItems?.find(entry => entry.id === String(workItemId))?.how;
  const unlink = canChange && session.mine ? button({ label: 'Unlink', icon: 'x', variant: 'ghost', size: 'sm', action: 'linked-session-unlink', data: { id: session.id, workItem: workItemId } }) : '';
  return `<li class="linked-session-row"><div class="linked-session-text"><p class="linked-session-title"><a class="work-inline-link" href="#linked-session/${escape(encodeURIComponent(session.id))}">${escape(sessionTitle(session))}${icon('arrow')}</a> ${stateBadge(state)}</p><p class="meta">${escape(linkedStatusLine(session, now))}${how === 'branch' ? ' · linked by its branch' : ''}</p><ul class="linked-session-facts">${facts}</ul></div>${unlink}</li>`;
}

/**
 * The Work Item page's Agent sessions card: the sessions people run outside Unfold that are linked to this Work Item,
 * each with its state, owner, branch and AI-written lines. Empty when none is linked and the person has none to offer.
 */
export function linkedSessionsMarkup(detail, linked, { now = Date.now(), canChange = true } = {}) {
  if (!linked || linked.error || !linked.sessions?.length) return '';
  const rows = linked.sessions.map(session => linkedRow(session, { now, canChange, workItemId: detail.item.id })).join('');
  return card({ id: 'work-linked-sessions', title: 'Agent sessions', subtitle: 'Sessions people run on their own machines that report to Unfold and are linked here.', icon: 'bot', body: `<ul class="linked-session-list">${rows}</ul>`, region: true });
}

function telemetryTiles(telemetry) {
  if (!telemetry) return '';
  if (!telemetry.available) return callout({ tone: 'neutral', icon: 'info', title: 'No telemetry for this session', body: `<p>${escape(telemetry.reason || 'Claude Code sent no telemetry for this session to the stores this workbench reads.')}</p>` });
  const tokens = telemetry.tokens;
  const tiles = [
    telemetry.costUsd !== null ? stat({ label: 'API-price estimate', value: money(telemetry.costUsd), detail: 'What Claude Code estimates at API prices. A Claude plan is not billed this.', icon: 'coins' }) : '',
    tokens ? stat({ label: 'Tokens', value: compactCount(tokens.input + tokens.output + tokens.cacheRead + tokens.cacheCreation), detail: `${compactCount(tokens.output)} out · ${compactCount(tokens.cacheRead)} from cache`, icon: 'layers' }) : '',
    telemetry.activeSeconds !== null ? stat({ label: 'Active time', value: duration(telemetry.activeSeconds), icon: 'clock' }) : '',
    telemetry.events ? stat({ label: 'Prompts', value: compactCount(telemetry.events.prompts), detail: `${compactCount(telemetry.events.toolResults)} tool calls${telemetry.events.apiErrors ? ` · ${plural(telemetry.events.apiErrors, 'API error')}` : ''}`, icon: 'send' }) : '',
  ].filter(Boolean).join('');
  const tools = telemetry.tools.length ? `<p class="meta">Most used tools: ${telemetry.tools.map(entry => `${escape(entry.name)} ${escape(compactCount(entry.count))}`).join(' · ')}</p>` : '';
  const partial = telemetry.reason ? `<p class="meta">${escape(telemetry.reason)}</p>` : '';
  return `<div class="stat-row linked-session-stats">${tiles}</div>${tools}${partial}`;
}

/** Who wrote a commit's AI lines: `main 12 · code-reviewer 40`, or a dash when the record names no agents. */
export function agentsText(agents) {
  const entries = Object.entries(agents ?? {}).filter(([, lines]) => lines > 0);
  if (!entries.length) return '<span class="meta">—</span>';
  return entries.map(([agent, lines]) => `${escape(agent === 'main' ? 'main agent' : agent)} ${escape(compactCount(lines))}`).join(' · ');
}

function commitsTable(session) {
  const commits = [...(session.commits ?? [])].reverse();
  if (!commits.length) return `<p class="meta">No commits reported yet.</p>`;
  const rows = commits.slice(0, 50).map(entry => `<tr><td class="mono">${escape(entry.sha.slice(0, 10))}</td><td>${escape(entry.subject || '—')}</td><td class="num">${entry.aiLines === null || entry.aiLines === undefined ? '<span class="meta">no record</span>' : escape(compactCount(entry.aiLines))}</td><td>${agentsText(entry.agents)}</td><td>${entry.trailer ? icon('check') + '<span class="visually-hidden">has the Unfold-Session trailer</span>' : '<span class="meta">—</span>'}</td></tr>`).join('');
  return `<div class="table-wrap" data-private><table class="table compact"><caption class="visually-hidden">Commits this session reported</caption><thead><tr><th scope="col">Commit</th><th scope="col">Subject</th><th scope="col" class="num">AI-written lines</th><th scope="col">By</th><th scope="col">Trailer</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** The facts of one Linked Session as `[term, html]` pairs for its page. */
export function linkedFacts(session, now = Date.now()) {
  const when = value => `<time datetime="${escape(value)}" title="${escape(dateTime(value))}">${escape(relativeWords(value, now))}</time>`;
  return [
    ['Harness', escape(`${harnessName(session.harness)}${session.harnessVersion ? ` ${session.harnessVersion}` : ''}`)],
    ['Model', session.model ? escape(session.model) : '<span class="meta">Not reported</span>'],
    ['Person', escape(session.mine ? 'You' : session.ownerName)],
    ['Repository', session.repository ? `<span class="mono">${escape(session.repository)}</span>` : '<span class="meta">Not reported</span>'],
    ['Branch', session.branch ? `<span class="mono">${escape(session.branch)}</span>` : '<span class="meta">Not reported</span>'],
    ['Started', when(session.startedAt)],
    ['Last heard', when(session.lastSeenAt)],
    ['Session id', `<span class="mono">${escape(session.id)}</span>`],
    ...(session.telemetry?.account ? [['Claude account', `<span class="mono" title="The account Claude Code reported in its telemetry. Unfold holds no Claude credential.">${escape(session.telemetry.account.uuid)}</span>`]] : []),
  ];
}

/** The page of one Linked Session (`#linked-session/<id>`): state, facts, Work Items, telemetry, commits and how to resume it. */
export function linkedSessionPage(session, { now = Date.now(), workItems = {} } = {}) {
  const state = linkedStates[session.state] ?? linkedStates.idle;
  const items = (session.workItems ?? []).map(entry => `<li>${chip({ label: workItems[entry.id] ? `${entry.id} · ${workItems[entry.id]}` : `Work Item ${entry.id}`, href: `#work/${encodeURIComponent(entry.id)}`, icon: 'work' })} <span class="meta">${entry.how === 'branch' ? 'by its branch' : `by ${escape(entry.linkedBy)}`}</span>${session.mine ? ` ${button({ label: 'Unlink', icon: 'x', variant: 'ghost', size: 'sm', action: 'linked-session-unlink', data: { id: session.id, workItem: entry.id } })}` : ''}</li>`).join('');
  const linkForm = session.mine ? `<form class="linked-session-link-form" data-form="linked-session-link" data-id="${escape(session.id)}"><label class="field-label" for="linked-session-work-item">Link to Work Item</label><div class="linked-session-link-row"><input id="linked-session-work-item" name="workItem" class="mono" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="184">${button({ label: 'Link', icon: 'link', type: 'submit', size: 'sm' })}</div></form>` : '';
  const workCard = card({ id: 'linked-session-work', title: 'Work Items', body: `${items ? `<ul class="linked-session-work">${items}</ul>` : emptyState({ icon: 'work', title: 'Not linked to a Work Item', body: 'Link it here, by name in the session (it calls unfold_link_session), or start it on a branch that names the task, such as feat/vik-2051-login.', compact: true })}${linkForm}` });
  const resume = session.mine ? `<div class="linked-session-resume"><p class="field-label">Resume it on your machine</p><p><code class="mono">${escape(session.resume)}</code> ${button({ label: 'Copy', icon: 'copy', size: 'sm', action: 'linked-session-copy', data: { text: session.resume } })}</p>${session.remoteUrl ? `<p>${button({ label: 'Open in Claude', icon: 'external', href: session.remoteUrl, external: true, size: 'sm' })}</p>` : ''}</div>` : '';
  const telemetry = session.telemetry ? card({ id: 'linked-session-telemetry', title: 'Telemetry', subtitle: 'From Claude Code\'s OpenTelemetry export. Prompts and tool content are never read here.', actions: session.telemetry.dashboardUrl ? button({ label: 'Open in Grafana', icon: 'external', href: session.telemetry.dashboardUrl, external: true, size: 'sm', variant: 'ghost' }) : '', body: telemetryTiles(session.telemetry) }) : '';
  const commits = card({ id: 'linked-session-commits', title: 'Commits', subtitle: attributionLine(session), actions: session.commits?.some(entry => entry.aiLines !== null && entry.aiLines !== undefined) ? button({ label: 'Agent Trace records', icon: 'download', href: `/api/linked-sessions/${encodeURIComponent(session.id)}/agent-trace`, size: 'sm', variant: 'ghost' }) : '', body: `${commitsTable(session)}${session.pullRequests?.length ? `<p class="meta">Pull requests: ${session.pullRequests.map(url => `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(url.replace(/^https:\/\//, ''))}</a>`).join(' · ')}</p>` : ''}` });
  const about = card({ id: 'linked-session-about', title: 'Session', body: `<p>${stateBadge(state)} <span class="meta">${escape(linkedStatusLine(session, now))}</span></p>${dl(linkedFacts(session, now), { rows: true })}${resume}` });
  return `<div class="linked-session-page">${about}${workCard}${telemetry}${commits}</div>`;
}
