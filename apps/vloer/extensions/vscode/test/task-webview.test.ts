import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleWebview, type StubElement } from './webview-dom.ts';

const view = await loadModuleWebview('task.js', { taskKey: 'glide:1505' });
const now = new Date().toISOString();
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function current(status: Record<string, unknown> = {}, task: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return {
    kind: 'task',
    task: { key: 'task:k', sourceId: 'glide', provider: 'vikunja', id: '1505', identifier: '#1505', revision: 'a'.repeat(64), title: 'Explain the flow', description: '<p>raw</p>', descriptionMarkdown: 'Body', url: 'https://vikunja.example/tasks/1505', status: 'open', repositoryId: 'ploeg', updatedAt: now, labels: [{ name: 'ploeg', color: '1973ff' }], assignees: [], ...task },
    source: { id: 'glide', name: 'Glide', provider: 'vikunja', handoff: true, executionOwner: 'ploeg' },
    repositoryName: 'Glide', host: 'vloer.example', loadedAt: now, session: { allowed: false }, preferredTeam: 'silver',
    status: { available: true, demo: false, handoff: { allowed: true }, teams: [{ id: 'bronze', assignee: 'bronze', queueDepth: 2, paused: false, roles: ['engineer'] }, { id: 'silver', assignee: 'silver', queueDepth: 0, paused: false, roles: ['engineer', 'reviewer'] }], assignedTeams: [], workItems: [], fetchedAt: now, ...status },
    ...extra,
  };
}

const item = (state: string, extra: Record<string, unknown> = {}) => ({ id: '42', team: 'silver', state, attempts: 1, updatedAt: now, ...extra });
const shift = (extra: Record<string, unknown> = {}) => ({ id: '7', branch: 'glide/42-explain', round: 2, budgetUsd: 5, spentUsd: 0.4, reservedUsd: 0, openedAt: ago(30), closedAt: null, closeReason: '', ...extra });
const run = (id: string, extra: Record<string, unknown> = {}) => ({ id, shiftId: '7', role: 'builder', round: 1, writes: true, state: 'finished', startedAt: ago(20), finishedAt: ago(15), outcome: 'pr_opened', summary: '', stuckReason: '', links: [], findings: '', verdict: '', problem: '', solution: '', failureReason: null, authorizedUsd: 1, usage: { inputTokens: 1200, outputTokens: 300, costUsd: 0.12 }, costStatus: 'observed', ...extra });
const detail = (state: string, extra: Record<string, unknown> = {}) => ({
  item: { id: '42', title: 'Explain the flow', provider: 'vikunja', externalId: '1505', team: 'silver', state, description: '', descriptionMarkdown: 'Brief from Ploeg', attempts: 1, target: { owner: 'webgrip', repo: 'glide' }, url: 'https://vikunja.example/tasks/1505', priority: 3, infraFailures: 0, createdAt: ago(60), updatedAt: ago(1), latestShift: null },
  shifts: [shift()], runs: [run('100')], checkpoints: [], events: [], ...extra,
});
const card = (extra: Record<string, unknown> = {}) => ({ workItemId: '42', state: 'in_review', crew: [{ role: 'builder', writes: true, runs: 2, costUsd: 0.32, inputTokens: 12000, outputTokens: 3400 }, { role: '', writes: false, runs: 1 }, { role: 'reviewer', writes: false, runs: 1 }], plays: [], totals: { costStatus: 'observed', usageComplete: true, costUsd: 0.4231, authorizedUsd: 5, runs: 3, failedRuns: 1, rounds: 2, shifts: 1 }, live: null, demo: false, ...extra });
const spaced = (value: string) => value.replace(/\u00a0|\u202f/g, ' ');
const buttons = (node: StubElement) => node.find('button');
const button = (node: StubElement, label: string) => buttons(node).find(entry => entry.textContent === label);

test('the task view announces itself to the extension host on load', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(view.posted)), [{ type: 'ready' }]);
});

test('an untouched open task makes the hand-off the primary action and preselects the team used last time', () => {
  const value = current();
  assert.equal(view.ploegSituation(value).headline, 'Not with Ploeg yet.');
  assert.equal(view.canHandOff(value), true);
  assert.equal(view.primaryAction(value), null, 'the hand-off form carries the one primary button');
  const head: StubElement = view.headCard(value);
  assert.deepEqual(head.find('input').map(radio => [radio.value, radio.checked]), [['bronze', false], ['silver', true]]);
  const submit = buttons(head).find(entry => entry.getAttribute('type') === 'submit');
  assert.equal(submit?.textContent, 'Hand to silver');
  assert.equal(submit?.className, 'primary');
  assert.match(head.textContent, /Assigns “silver” in Vikunja/);
  assert.equal(view.headFacts(value), null, 'no facts before Ploeg has a Work Item');
});

test('team cards drop empty roles, chain the rest and say how much is queued in words', () => {
  assert.equal(view.teamRoles({ roles: ['', 'builder', 'devops', ' ', 'reviewer'] }), 'builder → devops → reviewer');
  assert.equal(view.teamRoles({ roles: [''] }), 'no roles reported');
  assert.equal(view.teamRoles({ roles: [] }), 'no roles reported');
  assert.equal(view.queueText(0), 'Nothing queued');
  assert.equal(view.queueText(2), '2 queued');
  const head: StubElement = view.headCard(current({ teams: [{ id: 'copper', assignee: 'copper', queueDepth: 0, paused: true, roles: ['', 'builder', 'devops', 'operator', 'reviewer'] }] }));
  assert.match(head.textContent, /builder → devops → operator → reviewer/);
  assert.doesNotMatch(head.textContent, /→ builder|· 0 queued/);
  assert.match(head.textContent, /Nothing queued/);
  assert.match(head.textContent, /paused/);
});

test('each Ploeg state reads as what is happening, takes its label from the shared vocabulary and hides the hand-off while work is live', () => {
  const cases: [string, RegExp, string][] = [['queued', /Queued for team silver/, 'Queued'], ['leased', /Team silver is working on it/, 'Running'], ['awaiting_review', /pull request is waiting for your review/, 'Ready for review'], ['needs_human', /needs a human/, 'Needs you']];
  for (const [state, headline, label] of cases) {
    const value = current({ workItems: [item(state)], assignedTeams: ['silver'] });
    const situation = view.ploegSituation(value);
    assert.match(situation.headline, headline, state);
    assert.equal(situation.meta.label, label, state);
    assert.equal(view.canHandOff(value), false, state);
  }
  assert.match(view.ploegSituation(current({ assignedTeams: ['silver'] })).headline, /Waiting for Ploeg to queue it/);
  assert.match(view.ploegSituation(current({ workItems: [item('withdrawn')] })).headline, /Taken back from team silver/);
  assert.equal(view.canHandOff(current({ workItems: [item('withdrawn')] })), true, 'a withdrawn item can be handed over again');
});

test('the primary action follows the state: review the pull request, else open the Work Item in the browser', () => {
  const review = current({ workItems: [item('awaiting_review', { prUrl: 'https://forgejo.example/webgrip/glide/pulls/9' })], assignedTeams: ['silver'] });
  const primary: StubElement = view.primaryAction(review);
  assert.equal(primary.textContent, 'Review pull request ↗ #9');
  assert.equal(primary.dataset.openUrl, 'https://forgejo.example/webgrip/glide/pulls/9');
  assert.equal(primary.className, 'primary');
  const fromCard = current({ workItems: [item('awaiting_review')], assignedTeams: ['silver'] }, {}, { detail: detail('awaiting_review'), card: card({ plays: [{ number: 12, url: 'https://forgejo.example/webgrip/glide/pulls/12', state: 'open', branch: 'b', mergedAt: null, ci: null, reviews: [] }] }) });
  assert.equal(view.primaryAction(fromCard).dataset.openUrl, 'https://forgejo.example/webgrip/glide/pulls/12', 'the Run card supplies the pull request when the status has none');
  const running: StubElement = view.primaryAction(current({ workItems: [item('leased')], assignedTeams: ['silver'] }));
  assert.equal(running.textContent, 'Open in browser ↗');
  assert.equal(running.dataset.action, 'open-ploeg');
  assert.equal(running.dataset.id, '42');
  assert.equal(view.primaryAction(current({}, { status: 'closed' })), null);
});

test('take back is offered only while the item is still queued', () => {
  assert.ok(button(view.headCard(current({ workItems: [item('queued')], assignedTeams: ['silver'] })), 'Take back from silver'));
  assert.ok(!buttons(view.headCard(current({ workItems: [item('leased')], assignedTeams: ['silver'] }))).some(entry => entry.textContent.startsWith('Take back')));
});

test('a hostile pull request link never becomes the review action', () => {
  const hostile = current({ workItems: [item('awaiting_review', { prUrl: 'javascript:alert(1)' })], assignedTeams: ['silver'] });
  assert.equal(view.pullRequestUrl(hostile), '');
  assert.equal(view.primaryAction(hostile).textContent, 'Open in browser ↗');
  const plays: StubElement = view.pullRequestsSection(current({ workItems: [item('awaiting_review')] }, {}, { card: card({ plays: [{ number: 3, url: 'javascript:alert(1)', state: 'open', branch: '', mergedAt: null, ci: null, reviews: [] }] }) }));
  assert.equal(buttons(plays).length, 0);
  assert.match(plays.textContent, /Pull request #3/);
});

test('cost is the observed total marked unsettled, a live figure so far, or Not reported — never a made-up zero', () => {
  const base = { workItems: [item('leased', { spentUsd: 0 })], assignedTeams: ['silver'] };
  assert.deepEqual(view.costSummary(current(base)), { value: 'Not reported', note: '' }, 'a zero from the tracker status is not a reported cost');
  assert.deepEqual(view.costSummary(current(base, {}, { card: card({ totals: { costStatus: 'not_reported', usageComplete: null } }) })), { value: 'Not reported', note: 'Ploeg reported no cost' });
  const observed = view.costSummary(current(base, {}, { card: card() }));
  assert.equal(spaced(observed.value), 'US$ 0,42');
  assert.equal(observed.note, 'observed, not settled');
  assert.equal(view.costSummary(current(base, {}, { card: card({ totals: { costStatus: 'reserved', costUsd: 1, usageComplete: null } }) })).note, 'reserved, not settled');
  const live = view.costSummary(current(base, {}, { card: card({ live: { runningRuns: 1, observedAt: now, runSeconds: 90, usageComplete: true, costUsd: 0.05 } }) }));
  assert.equal(spaced(live.value), 'US$ 0,05');
  assert.match(live.note, /so far/);
  assert.equal(view.costSummary(current(base, {}, { card: card({ live: { runningRuns: 1, observedAt: now, runSeconds: 90, usageComplete: false } }) })).value, 'Not reported yet');
  assert.deepEqual(view.costSummary(current({ ...base, demo: true })), { value: 'Demo', note: 'no model calls' });
  const facts: StubElement = view.headFacts(current(base));
  assert.doesNotMatch(spaced(facts.textContent), /\$0|US\$ 0,00/);
  assert.match(facts.textContent, /CostNot reported/);
});

test('the cost per role table lists named roles from the Run card with nl-NL money and tokens', () => {
  const table: StubElement = view.crewTable(current({ workItems: [item('leased')] }, {}, { card: card() }));
  const rows = table.find('tbody')[0].find('tr');
  assert.equal(rows.length, 2, 'the role without a name is left out');
  assert.match(spaced(rows[0].textContent), /builderwriter2US\$ 0,3212K3,4K/);
  assert.match(rows[1].textContent, /reviewerreader1Not reportedNot reportedNot reported/);
  assert.equal(view.crewTable(current({ workItems: [item('leased')] })), null);
});

test('a needs_human item leads with the reason chip, sentence and fix from the shared reasons', () => {
  const value = current({ workItems: [item('needs_human')], assignedTeams: ['silver'] }, {}, { detail: detail('needs_human', { shifts: [shift({ closedAt: ago(2), closeReason: 'fix_round_cap_reached' })], runs: [run('100'), run('101', { role: 'reviewer', writes: false, round: 2, outcome: 'no_change_needed', verdict: 'request_changes' })] }) });
  const situation = view.ploegSituation(value);
  assert.equal(situation.reason.chip, 'Reviewer still wants changes');
  assert.equal(situation.headline, 'The reviewer still asked for changes when the Team’s fix Rounds ran out.');
  const head: StubElement = view.headCard(value);
  assert.ok(head.withClass('reason-chip').some(chip => chip.textContent === 'Reviewer still wants changes'));
  assert.match(head.textContent, /Read the findings\. Finish the branch by hand, or sharpen the ticket\./);
  assert.match(head.textContent, /assign the task to the Team again in Vikunja/);
  assert.match(head.className, /tone-attention/);
});

test('Runs are grouped by Round with outcome, agent verdict, failure cause, cost and duration from the shared vocabulary', () => {
  const runs = [
    run('100', { round: 1 }),
    run('101', { role: 'reviewer', writes: false, round: 1, outcome: 'no_change_needed', verdict: 'approve', usage: null, costStatus: 'unknown' }),
    run('102', { round: 2, outcome: 'failed', failureReason: 'infra_node' }),
    run('103', { round: 2, state: 'running', finishedAt: null, outcome: null }),
  ];
  const value = current({ workItems: [item('leased')] }, {}, { detail: detail('leased', { runs }) });
  const section: StubElement = view.runsSection(value);
  const labels = section.withClass('run-group-label').map(node => node.textContent);
  assert.deepEqual(labels, ['Round 2', 'Round 1']);
  const text = spaced(section.textContent);
  assert.match(text, /Failed/);
  assert.match(text, /Cause: Infrastructure, not the agent/);
  assert.match(text, /Running/);
  assert.match(text, /PR opened/);
  assert.match(text, /Agent approved/);
  assert.doesNotMatch(text, /Approved by/, 'an agent verdict never reads as a human review');
  assert.match(text, /US\$ 0,12/);
  assert.match(text, /Not reported/);
  assert.match(text, /5 min/);
  assert.equal(section.find('details').length, 0);
  const many = view.runsSection(current({ workItems: [item('leased')] }, {}, { detail: detail('leased', { runs: Array.from({ length: 9 }, (_, index) => run(String(200 + index), { round: 1 })) }) }));
  assert.equal(many.find('details')[0]?.find('summary')[0]?.textContent, 'Show 3 more Runs');
});

test('pull requests show their state, CI and human reviews apart from agent verdicts', () => {
  const plays = [{ number: 77, url: 'https://forgejo.example/webgrip/glide/pulls/77', state: 'open', branch: 'glide/42', mergedAt: null, additions: 120, deletions: 8, changedFiles: 4, ci: { state: 'failure', checks: [{ context: 'lint', state: 'failure' }, { context: 'test', state: 'success' }] }, reviews: [{ reviewer: 'ryan', state: 'approved' }] }];
  const section: StubElement = view.pullRequestsSection(current({ workItems: [item('awaiting_review')] }, {}, { card: card({ plays }) }));
  assert.match(section.textContent, /Pull request #77 ↗OpenCI failed\+120−84 files/);
  assert.match(section.textContent, /Failing checks: lint/);
  assert.match(section.textContent, /Human reviews: Approved by ryan/);
  assert.equal(button(section, 'Pull request #77 ↗')?.dataset.openUrl, 'https://forgejo.example/webgrip/glide/pulls/77');
});

test('a Work Item without a tracker task shows Ploeg’s header, state, Runs and brief, without the hand-off', () => {
  const work = { kind: 'work', workItemId: '42', detail: detail('queued', { item: { ...detail('queued').item, provider: 'ploeg', externalId: 'proposal-3', url: '' }, shifts: [], runs: [] }), host: 'vloer.example', loadedAt: now };
  assert.equal(view.canHandOff(work), false);
  assert.match(view.ploegSituation(work).headline, /Queued for team silver/);
  const parts: StubElement[] = view.sections(work);
  const all = parts.map(part => part.textContent).join('\n');
  assert.match(all, /PLOEG · WORK ITEM 42 · TEAM SILVER → WEBGRIP\/GLIDE/);
  assert.match(all, /Brief from Ploeg/);
  assert.match(all, /No Run has started yet/);
  assert.doesNotMatch(all, /Hand to|Take back|supervised session/);
  assert.ok(parts.every(part => part.find('input').length === 0));
  assert.equal(view.primaryAction(work).dataset.action, 'open-ploeg');
});

test('the problem and solution come from the newest writer of the latest Shift, with the agent caveat', () => {
  const account = view.writerAccount(detail('awaiting_review', { runs: [run('100', { problem: 'Old', solution: 'Old fix', shiftId: '6' }), run('105', { problem: 'The total was missing', solution: 'Show one total' })] }));
  assert.equal(account.runId, '105');
  assert.equal(account.problem, 'The total was missing');
  const parts: StubElement[] = view.sections(current({ workItems: [item('awaiting_review', { prUrl: 'https://forgejo.example/webgrip/glide/pulls/9' })] }, {}, { detail: detail('awaiting_review', { runs: [run('105', { problem: 'The total was missing', solution: 'Show one total' })] }) }));
  assert.match(parts.map(part => part.textContent).join(''), /The agent’s own account: verify it against pull request #9\./);
});

test('viewers, closed tasks and unavailable Ploeg explain themselves instead of offering the hand-off', () => {
  const viewer = current({ handoff: { allowed: false, reason: 'An operator account is required to hand tasks to Ploeg.' } });
  assert.equal(view.canHandOff(viewer), false);
  assert.match(view.headCard(viewer).textContent, /operator account is required/);
  assert.match(view.ploegSituation(current({}, { status: 'closed' })).headline, /closed in the tracker/);
  assert.equal(view.ploegSituation(current({ available: false, message: 'Update the workbench server to see Ploeg status.' })).headline, 'Update the workbench server to see Ploeg status.');
});

test('the header shows tracker facts and labels as text, and a hostile title or label stays inert', () => {
  const header: StubElement = view.header(current({}, { title: '<img src=x onerror=alert(1)>', labels: [{ name: '<script>x</script>', color: 'red;background:url(x)' }], priority: 3 }));
  assert.equal(header.find('img').length, 0);
  assert.equal(header.find('script').length, 0);
  assert.equal(header.find('h1')[0]?.textContent, '<img src=x onerror=alert(1)>');
  assert.match(header.textContent, /#1505/);
  assert.match(header.textContent, /priority High/);
  assert.match(header.textContent, /<script>x<\/script>/);
  assert.match(header.textContent, /updated just now/);
  assert.ok(header.withClass('pill-state').some(node => node.textContent === 'Open'), 'the tracker state shows until Ploeg has a Work Item');
  const handed: StubElement = view.header(current({ workItems: [item('leased')] }));
  assert.ok(handed.withClass('pill-state').some(node => node.textContent === 'Running'));
});

test('markdown links in a description open through the host only when they are HTTPS', () => {
  const root: StubElement = view.markdown('See [the PR](https://forgejo.example/pulls/1) and [bad](javascript:alert(1)).');
  const links = root.withClass('link-text');
  assert.equal(links[0]?.dataset.openUrl, 'https://forgejo.example/pulls/1');
  assert.equal(links[0]?.getAttribute('role'), 'link');
  assert.equal(links[1]?.dataset.openUrl, undefined);
  assert.equal(root.find('a').length, 0);
});

test('a hostile account or brief from Ploeg stays text', () => {
  const parts: StubElement[] = view.sections({ kind: 'work', workItemId: '42', detail: detail('awaiting_review', { item: { ...detail('x').item, descriptionMarkdown: '<script>alert(1)</script> [x](javascript:alert(1))' }, runs: [run('100', { problem: '<img src=x onerror=alert(1)>', solution: '[go](javascript:alert(1))' })] }), host: 'vloer.example', loadedAt: now });
  for (const part of parts) {
    assert.equal(part.find('script').length + part.find('img').length + part.find('a').length, 0);
    assert.ok(part.descendants().every(node => !node.dataset.openUrl || node.dataset.openUrl.startsWith('https://')));
  }
});

test('Markdown escapes from the tracker converter render as the plain characters they protect', () => {
  const root: StubElement = view.markdown('Rename snake\\_case\\_name \\& fix a\\[0\\] with (x\\*y)\n\n1\\. not a list\n\n\\# not a heading');
  assert.equal(root.textContent, 'Rename snake_case_name & fix a[0] with (x*y)1. not a list# not a heading');
  assert.equal(root.find('em').length, 0);
  assert.equal(root.find('ol').length + root.find('h3').length, 0);
});

test('a Work Item with a branch and a target repository offers to check it out; the demo and an unrouted Work Item do not', () => {
  const work = (extra: Record<string, unknown> = {}, demo = false) => ({ kind: 'work', workItemId: '42', detail: { ...detail('awaiting_review', extra), demo }, host: 'vloer.example', loadedAt: now });
  const offered = button(view.headCard(work()), 'Check out branch');
  assert.ok(offered, 'the branch of the latest Shift is offered');
  assert.equal(offered.dataset.action, 'checkout');
  assert.match(offered.getAttribute('title') ?? '', /glide\/42-explain from webgrip\/glide/);
  assert.ok(!button(view.headCard(work({}, true)), 'Check out branch'), 'demo branches exist only in the demo');
  assert.ok(!button(view.headCard(work({ shifts: [] })), 'Check out branch'), 'no Shift, no branch');
  const unrouted = work();
  unrouted.detail.item.target = null as unknown as { owner: string; repo: string };
  assert.ok(!button(view.headCard(unrouted), 'Check out branch'));
  assert.ok(button(view.headCard(current({ workItems: [item('awaiting_review')], assignedTeams: ['silver'] }, {}, { workItemId: '42', detail: detail('awaiting_review') })), 'Check out branch'), 'a linked task panel offers it too');
});
