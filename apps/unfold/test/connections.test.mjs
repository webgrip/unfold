import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectionsHeadline, connectionsMarkup, connectionsModel } from '../public/connections.js';

const at = Date.parse('2026-10-19T10:00:00Z');
const repository = (key, extra = {}) => ({ key, label: key, forge: 'forgejo', owner: 'webgrip', repo: key, baseBranch: 'main', readiness: 'ready', reason: '', lastForgeEventAt: '2026-10-18T10:00:00Z', boards: ['Unfold'], ...extra });
const board = (name, extra = {}) => ({ tracker: 'vikunja', name, projectId: '10', team: null, repository: null, default: 'unfold', allow: ['homelab-cluster'], webhook: 'present', teams: [{ team: 'bronze', assignees: [{ username: 'bronze', shared: true }] }], sources: [{ id: 'unfold', name: 'Unfold', target: 'webgrip/unfold@main', routed: true }], ...extra });
const data = (extra = {}) => ({ demo: false, supported: true, checkedAt: '2026-10-19T09:40:00Z', eventWindowDays: 30, repositories: [repository('unfold'), repository('homelab-cluster')], boards: [board('Unfold')], unrouted: [], ...extra });
const statuses = entry => Object.fromEntries(entry.checks.map(check => [check.id, check.status]));

test('a fully wired board and its repositories read as working', () => {
  const model = connectionsModel(data(), at);
  assert.equal(model.problems, 0);
  assert.equal(model.warnings, 0);
  assert.equal(connectionsHeadline(model), 'Every connection works: 1 board and 2 repositories.');
  assert.deepEqual(statuses(model.boards[0]), { webhook: 'ok', teams: 'ok', route: 'ok', unfold: 'ok' });
  assert.match(model.boards[0].checks.find(check => check.id === 'route').text, /Work without a repo\/ label goes to webgrip\/unfold\. A label may pick repo\/homelab-cluster\./);
});

test('each broken wire is a problem with its fix, and broken entries sort first', () => {
  const model = connectionsModel(data({
    repositories: [repository('unfold'), repository('homelab-cluster', { readiness: 'not_ready', reason: 'webgrip/homelab-cluster has no AGENTS.md on branch "main"', lastForgeEventAt: null })],
    boards: [board('Unfold'), board('Dark Factory', { projectId: '5', webhook: 'missing', default: null, allow: [], repository: null, teams: [{ team: 'bronze', assignees: [{ username: 'bronze', shared: false }] }], sources: [] })],
    unrouted: [{ id: 'dark-factory', name: 'Dark Factory', provider: 'vikunja', project: '5' }],
  }), at);
  assert.equal(model.repositories[0].title, 'webgrip/homelab-cluster', 'the repository that is not ready comes first');
  assert.deepEqual(statuses(model.repositories[0]), { ready: 'problem', reviews: 'warning', boards: 'ok' });
  const dark = model.boards.find(entry => entry.title === 'Dark Factory');
  assert.deepEqual(statuses(dark), { webhook: 'problem', teams: 'problem', route: 'info', unfold: 'info' });
  assert.match(dark.checks[1].text, /^bronze cannot see this board/);
  assert.match(dark.checks[1].fix, /Share bronze into the board/);
  assert.equal(statuses(model.boards.find(entry => entry.title === 'Unfold')).route, 'problem', 'a board whose allowed repository is not ready says its tasks are refused');
  assert.equal(model.problems, 5);
  assert.equal(model.warnings, 1);
  assert.equal(connectionsHeadline(model), '5 problems to fix and 1 to check across 2 boards and 2 repositories.');
  const html = connectionsMarkup(model, { now: at });
  assert.match(html, /In Unfold, not routed by Ploeg/);
  assert.match(html, /A hand-off assigns the Team and nothing starts\./);
  assert.match(html, /Add an AGENTS\.md at the root of main/);
  assert.match(html, /Boards checked 20 min ago/);
});

test('a task source that sends work elsewhere than the board routes is flagged', () => {
  const model = connectionsModel(data({ boards: [board('Unfold', { sources: [{ id: 'u', name: 'Unfold tasks', target: 'webgrip/other@main', routed: false }] })] }), at);
  const check = model.boards[0].checks.find(entry => entry.id === 'unfold');
  assert.equal(check.status, 'warning');
  assert.match(check.text, /Unfold tasks sends its tasks to webgrip\/other@main, which this board does not route to/);
});

test('unknown shares and an older Ploeg say so instead of guessing', () => {
  const unknown = connectionsModel(data({ checkedAt: null, boards: [board('Unfold', { webhook: 'unchecked', teams: [{ team: 'bronze', assignees: [{ username: 'bronze', shared: null }] }] })] }), at);
  assert.deepEqual(statuses(unknown.boards[0]).teams, 'unknown');
  assert.equal(statuses(unknown.boards[0]).webhook, 'info');
  assert.match(connectionsMarkup(unknown, { now: at }), /Ploeg has not finished its first board check/);
  const older = connectionsModel({ supported: false, repositories: [], boards: [], unrouted: [] }, at);
  assert.equal(connectionsHeadline(older), 'This Ploeg does not report its connections yet.');
  assert.match(connectionsMarkup(older, { now: at }), /Ploeg ADR-0129/);
  assert.doesNotMatch(connectionsMarkup(older, { now: at }), /class="card/);
});

test('names from Ploeg are escaped', () => {
  const html = connectionsMarkup(connectionsModel(data({ boards: [board('<img src=x onerror=alert(1)>')] }), at), { now: at });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});
