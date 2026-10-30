import test from 'node:test';
import assert from 'node:assert/strict';
import type { ActionRecord } from '../src/action-records.ts';
import { latestHandOffs, listHandOffs, type HandOffSources } from '../src/handoffs.ts';
import { PloegError, type PloegItem } from '../src/ploeg.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { TenantScope, tenancySettings } from '../src/tenant-scope.ts';
import type { TaskSourceConfig } from '../src/tasks.ts';
import type { User } from '../src/types.ts';
import { application, request } from './api-support.ts';

const ryan: User = { id: 'u-ryan', name: 'Ryan', role: 'operator', memberships: [{ kind: 'tenant', tenant: 'agency', role: 'developer' }] };
let next = 0;
function record(overrides: Partial<ActionRecord> & Pick<ActionRecord, 'target'>): ActionRecord {
  next += 1;
  const task = overrides.target?.kind === 'task';
  return { id: next, at: new Date(Date.UTC(2026, 9, 30, 9, next)).toISOString(), userId: ryan.id, userName: 'Ryan', role: 'developer', channel: 'mcp:Claude Code 2.1.300', action: task ? 'POST /api/task-sources/board/tasks/:id/handoff' : 'POST /api/linked-sessions/:id/work-items/:id/handoff', method: 'POST', inputs: task ? { team: 'bronze', revision: 'r1' } : {}, confirmation: null, status: 200, outcome: 'done', ...overrides };
}
const item = (overrides: Partial<PloegItem>): PloegItem => ({ ...(ploegDemo.items[0] as PloegItem), latestShift: null, pullRequest: undefined, ...overrides });
const source = (id: string, tenant: string): TaskSourceConfig => ({ id, name: `Board ${id}`, provider: 'vikunja', baseUrl: 'https://tracker.invalid/api/v1', project: id, repositoryId: 'repo', token: 'tracker-token-0000000000', executionOwner: 'ploeg', tenant });

function sources(records: ActionRecord[], options: { items?: Record<string, PloegItem[]>; details?: Record<string, PloegItem>; failing?: Set<string>; prUrl?: string } = {}): HandOffSources & { calls: string[] } {
  const calls: string[] = [];
  const tenants = new TenantScope({ repositories: [], taskSources: [source('board', 'agency'), source('elsewhere', 'other-agency')], tenancy: tenancySettings({ enforce: true }) });
  return {
    calls, demo: false, tenants,
    records: (userId, limit) => records.filter(entry => entry.userId === userId).sort((a, b) => b.id - a.id).slice(0, limit),
    ploeg: {
      trackerItems: async (_user, provider, externalId) => {
        calls.push(`tracker:${provider}:${externalId}`);
        if (options.failing?.has(externalId)) throw new PloegError(503, 'ploeg_unavailable', 'down');
        return { items: options.items?.[externalId] ?? [], supported: true };
      },
      detail: async (_user, id) => {
        calls.push(`detail:${id}`);
        const found = options.details?.[id];
        if (!found) throw new PloegError(404, 'ploeg_not_found', 'Ploeg work item not found in your authorized teams.');
        return { item: { ...found, descriptionMarkdown: '' }, shifts: [], runs: [], checkpoints: options.prUrl ? [{ phase: 'pr_opened', branch: 'b', prUrl: options.prUrl, createdAt: found.updatedAt }] : [], events: [] } as never;
      },
    },
  };
}

test('only the newest record per task or Work Item counts, a take-back removes it, and refusals or other actions are not hand-offs', () => {
  const handed = record({ target: { kind: 'task', id: 'board:17' } });
  const takenBack = record({ target: { kind: 'task', id: 'board:17' }, method: 'DELETE', action: 'DELETE /api/task-sources/board/tasks/:id/handoff' });
  const again = record({ target: { kind: 'task', id: 'board:18' } });
  const refused = record({ target: { kind: 'task', id: 'board:19' }, outcome: 'refused', status: 409 });
  const approve = record({ target: { kind: 'work-item', id: '42' }, action: 'POST /api/ploeg/work-items/:id/approve' });
  const session = record({ target: { kind: 'work-item', id: '43' } });
  const repeated = record({ target: { kind: 'task', id: 'board:18' } });
  assert.deepEqual(latestHandOffs([handed, takenBack, again, refused, approve, session, repeated], 10).map(entry => entry.id), [repeated.id, session.id]);
  assert.deepEqual(latestHandOffs([again, session], 1).map(entry => entry.id), [session.id]);
});

test('a task hand-off shows the newest Work Item of the Team it went to, with its pull request link and spend', async () => {
  const handed = record({ target: { kind: 'task', id: 'board:17' } });
  const older = item({ id: '501', team: 'bronze', state: 'done', createdAt: '2026-10-01T09:00:00.000Z' });
  const otherTeam = item({ id: '503', team: 'silver', state: 'queued', createdAt: '2026-10-30T09:30:00.000Z' });
  const current = item({ id: '502', team: 'bronze', state: 'awaiting_review', createdAt: '2026-10-30T09:05:00.000Z', latestShift: { id: '9', workItemId: '502', team: 'bronze', branch: 'ploeg/502', round: 1, budgetUsd: 8, spentUsd: 1.25, reservedUsd: 0, openedAt: '2026-10-30T09:05:00.000Z', closedAt: null, closeReason: '' } });
  const fake = sources([handed], { items: { 17: [older, otherTeam, current] }, details: { 502: current }, prUrl: 'https://forgejo.example/webgrip/unfold/pulls/731' });
  const { handoffs } = await listHandOffs(fake, ryan);
  assert.equal(handoffs.length, 1);
  assert.deepEqual(handoffs[0].origin, { kind: 'task', sourceId: 'board', sourceName: 'Board board', taskId: '17' });
  assert.equal(handoffs[0].channel, 'mcp:Claude Code 2.1.300');
  assert.equal(handoffs[0].team, 'bronze');
  assert.equal(handoffs[0].workItem?.id, '502');
  assert.equal(handoffs[0].workItem?.pullRequestUrl, 'https://forgejo.example/webgrip/unfold/pulls/731');
  assert.equal(handoffs[0].workItem?.spentUsd, 1.25);
});

test('a hand-off Ploeg has not listed, or cannot read, says so instead of inventing a Work Item', async () => {
  const waiting = record({ target: { kind: 'task', id: 'board:20' } });
  const unreadable = record({ target: { kind: 'task', id: 'board:21' } });
  const { handoffs } = await listHandOffs(sources([waiting, unreadable], { failing: new Set(['21']) }), ryan);
  assert.deepEqual(handoffs.map(entry => [entry.origin.kind === 'task' ? entry.origin.taskId : '', entry.workItem, entry.team]), [['21', null, 'bronze'], ['20', null, 'bronze']]);
  assert.match(handoffs[0].note, /could not be read/);
  assert.match(handoffs[1].note, /not listed/);
});

test('the read lists only the caller\'s own hand-offs, and leaves out sources outside their Tenant and Work Items outside their Teams', async () => {
  const mine = record({ target: { kind: 'work-item', id: '600' } });
  const someoneElse = record({ target: { kind: 'work-item', id: '601' }, userId: 'u-other' });
  const foreignSource = record({ target: { kind: 'task', id: 'elsewhere:5' } });
  const lostTeam = record({ target: { kind: 'work-item', id: '602' } });
  const fake = sources([mine, someoneElse, foreignSource, lostTeam], { details: { 600: item({ id: '600', state: 'needs_human' }), 601: item({ id: '601' }) } });
  const { handoffs } = await listHandOffs(fake, ryan);
  assert.deepEqual(handoffs.map(entry => entry.workItem?.id), ['600']);
  assert.equal(handoffs[0].origin.kind, 'session');
  assert.ok(!fake.calls.includes('detail:601'), 'another person\'s record is never resolved');
  assert.ok(!fake.calls.some(call => call.startsWith('tracker:vikunja:5')), 'a source outside the Tenant is never read');
});

test('GET /api/handoffs answers the signed-in person\'s hand-offs only', async t => {
  const server = await application('demo'); t.after(() => server.close());
  const adminUser = (await request(server.url, '/api/bootstrap')).body.user;
  const base = { at: new Date().toISOString(), role: 'admin', channel: 'browser', action: 'POST /api/linked-sessions/:id/work-items/:id/handoff', method: 'POST', inputs: {}, confirmation: null, status: 200, outcome: 'done' as const };
  server.app.store.recordAction({ ...base, userId: adminUser.id, userName: adminUser.name, target: { kind: 'work-item', id: '101' } });
  server.app.store.recordAction({ ...base, userId: 'someone-else', userName: 'Someone', target: { kind: 'work-item', id: '108' } });
  const answer = await request(server.url, '/api/handoffs');
  assert.equal(answer.status, 200, answer.text);
  assert.deepEqual(answer.body.handoffs.map((entry: { workItem: { id: string } }) => entry.workItem.id), ['101']);
  assert.equal(answer.body.demo, true);
  const refused = await request(server.url, '/api/handoffs', { method: 'POST', body: {} });
  assert.equal(refused.status, 405);
});
