import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actionPhrase, actionsCsv, actionsJson, actionsPageMarkup, activitySwitch, confirmationText, engineRows, newestFirst, outcomeText, recordRow, targetLink, visibilityHint, workActionsMarkup } from '../public/action-log.js';
import { actionsQuery } from '../public/views/actions.js';

const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const confirmation = `c-7:${'a'.repeat(64)}`;
const now = new Date(2026, 9, 17, 12, 0).getTime();
const at = (hour, minute = 0) => new Date(2026, 9, 17, hour, minute).toISOString();

const records = [
  { id: 12, at: at(11, 30), userId: 'u-ryan', userName: 'ryan', role: 'admin', channel: 'unfold-mcp on ryan-pc-mint (Claude Code 2.1.296)', action: 'POST /api/ploeg/work-items/:id/approve', method: 'POST', target: { kind: 'work-item', id: '106' }, inputs: { reason: 'Looks right', token: '[redacted]' }, confirmation, status: 200, outcome: 'done' },
  { id: 11, at: at(10, 0), userId: 'u-sam', userName: 'sam', role: 'operator', channel: 'browser', action: 'POST /api/ploeg/work-items/:id/cancel', method: 'POST', target: { kind: 'work-item', id: '106' }, inputs: {}, confirmation: null, status: 409, outcome: 'refused' },
  { id: 10, at: at(9, 0), userId: 'u-ryan', userName: 'ryan', role: 'admin', channel: 'browser', action: 'POST /api/sessions/:id/messages', method: 'POST', target: { kind: 'session', id: '3b1f2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' }, inputs: { text: '=HYPERLINK("x")' }, confirmation: null, status: 502, outcome: 'failed' },
];
const events = [
  { id: 'e1', at: at(11, 30), actor: 'operator:ploeg-mcp:u-ryan', action: 'work_item.approved', detail: { attribution: { consumer: 'ploeg-mcp', actor: 'operator:ploeg-mcp:u-ryan', actingUser: 'ryan', via: 'mcp:Claude Code 2.1.296', confirmation } } },
  { id: 'e0', at: at(8, 0), actor: 'ploegd:dispatcher', action: 'work_item.queued', detail: {} },
];

test('a route template reads as a short phrase, and an unknown route falls back to its method and route', () => {
  assert.equal(actionPhrase('POST /api/ploeg/work-items/:id/approve'), 'approved');
  assert.equal(actionPhrase('POST /api/ploeg/work-items/:id/reject'), 'rejected');
  assert.equal(actionPhrase('POST /api/ploeg/work-items/:id/cancel'), 'stopped');
  assert.equal(actionPhrase('POST /api/ploeg/work-items/:id/retry'), 'retried');
  assert.equal(actionPhrase('POST /api/sessions/:id/retry'), 'retried');
  assert.equal(actionPhrase('POST /api/sessions/:id/messages'), 'sent a message');
  assert.equal(actionPhrase('POST /api/task-sources/board/tasks/:id/handoff'), 'handed to a Team');
  assert.equal(actionPhrase('DELETE /api/task-sources/board/tasks/:id/handoff'), 'took back from a Team');
  assert.equal(actionPhrase('POST /api/ploeg/work-items/:id/cracks/:id/confirm'), 'confirmed the cause of a bug');
  assert.equal(actionPhrase('POST /api/ploeg/work-items/:id/asks'), 'asked a question');
  assert.equal(actionPhrase('PATCH /api/something/new'), 'PATCH /api/something/new');
  assert.equal(actionPhrase('GET /api/ploeg/work-items/:id/approve'), 'GET /api/ploeg/work-items/:id/approve', 'the method is part of the match');
});

test('a row says who, what, through which channel, whether confirmed and the outcome with its status', () => {
  const [mcp, refused, failed] = records.map(recordRow);
  assert.deepEqual([mcp.person, mcp.what, mcp.channel, confirmationText(mcp), outcomeText(mcp)], ['ryan', 'approved', 'unfold-mcp on ryan-pc-mint (Claude Code 2.1.296)', 'Confirmed · c-7', 'Done · 200']);
  assert.deepEqual([confirmationText(refused), outcomeText(refused)], ['Browser button', 'Refused · 409']);
  assert.equal(outcomeText(failed), 'Failed · 502');
  assert.equal(confirmationText({ channel: 'editor', confirmation: null }), 'No confirmation');
  assert.deepEqual(targetLink(mcp.target), { href: '#work/106', label: 'Work Item #106' });
  assert.deepEqual(targetLink(failed.target), { href: '#session/3b1f2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', label: 'Session 3b1f2c4d' });
});

test('Ploeg events that name their person join the list as from the engine, in time order', () => {
  const engine = engineRows(events, '106');
  assert.equal(engine.length, 1, 'an event without attribution is left to the Activity card');
  assert.deepEqual([engine[0].source, engine[0].person, engine[0].channel, engine[0].what, confirmationText(engine[0]), outcomeText(engine[0])], ['engine', 'ryan', 'mcp:Claude Code 2.1.296', 'approved', 'Confirmed · c-7', 'Done']);
  const merged = newestFirst([...records.map(recordRow), ...engine]);
  assert.deepEqual(merged.map(row => row.id), ['unfold-12', 'engine-e1', 'unfold-11', 'unfold-10']);
});

test('the Work Item card lists the rows with person, channel, confirmation and outcome, marks engine rows and says what a non-admin sees', () => {
  const detail = { item: { id: '106' }, events };
  const html = workActionsMarkup(detail, { actions: { records, nextBefore: null, error: '' }, userRole: 'operator', userId: 'u-sam', now });
  const words = text(html);
  assert.match(html, /<h3 class="card-title" id="work-actions-title">Who did what/);
  assert.match(words, /Approved/);
  assert.match(words, /From Ploeg/);
  assert.match(words, /unfold-mcp on ryan-pc-mint \(Claude Code 2\.1\.296\)/);
  assert.match(words, /Confirmed · c-7/);
  assert.match(words, /Refused · 409/);
  assert.match(words, /sam \(you\)/);
  assert.match(words, /17 Oct 2026 11:30/);
  assert.match(words, /You see only your own actions here; an administrator sees everyone’s\./);
  assert.match(html, /data-action="work-actions-export" data-format="csv"/);
  assert.doesNotMatch(html, /style=/);
  assert.match(text(workActionsMarkup(detail, { actions: { records: [], nextBefore: null, error: '' }, userRole: 'admin', now })), /As an administrator you see everyone’s actions\./);
});

test('the Work Item card has a loading, an empty, an error and a demo state', () => {
  const detail = { item: { id: '7' }, events: [] };
  assert.match(workActionsMarkup(detail, { actions: null, now }), /aria-busy="true"/);
  const empty = workActionsMarkup(detail, { actions: { records: [], nextBefore: null, error: '' }, userRole: 'operator', now });
  assert.match(text(empty), /You have not acted on this Work Item yet/);
  assert.doesNotMatch(empty, /work-actions-export/, 'nothing listed, nothing to download');
  const failed = workActionsMarkup(detail, { actions: { records: [], nextBefore: null, error: 'Unfold did not answer.' }, now });
  assert.match(failed, /role="alert">Unfold did not answer\./);
  assert.match(failed, /data-action="work-actions-retry"/);
  const demo = workActionsMarkup(detail, { actions: { records: [], nextBefore: null, error: '' }, demoMode: true, now });
  assert.match(text(demo), /Demo Demo workbench · only what was done here, nothing invented, no model calls, no spend/);
});

test('the Activity page offers administrators a person picker and everyone outcome and channel filters, and links each row', () => {
  const page = { person: 'u-ryan', outcome: '', channel: '', records, nextBefore: 10, error: '', loadingOlder: false, facets: { people: [{ userId: 'u-ryan', userName: 'ryan', count: 2 }, { userId: 'u-sam', userName: 'sam', count: 1 }], channels: [{ channel: 'browser', count: 2 }] } };
  const admin = actionsPageMarkup(page, { admin: true, userId: 'u-ryan', now });
  assert.match(admin, /<select id="actions-person"><option value="all">Everyone<\/option><option value="u-ryan" selected>ryan \(you\)<\/option><option value="u-sam">sam<\/option><\/select>/);
  assert.match(admin, /<select id="actions-outcome">/);
  assert.match(admin, /<option value="browser">browser<\/option>/);
  assert.match(admin, /href="#work\/106">Work Item #106<\/a>/);
  assert.match(admin, /href="#session\/3b1f2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d">/);
  assert.match(admin, /data-action="actions-older"/);
  assert.match(admin, /href="#activity\/actions" aria-current="true"/);
  const own = actionsPageMarkup(page, { admin: false, userId: 'u-sam', now });
  assert.doesNotMatch(own, /actions-person/);
  assert.match(text(own), /You see only your own actions here/);
  assert.match(activitySwitch('events'), /href="#activity" aria-current="true"/);
});

test('the Activity page has a loading, an empty, a filtered-empty, an error and a demo state', () => {
  const base = { person: 'u-sam', outcome: '', channel: '', nextBefore: null, loadingOlder: false, facets: null };
  assert.match(actionsPageMarkup({ ...base, records: null, error: '' }, { admin: false, userId: 'u-sam' }), /aria-busy="true"/);
  assert.match(text(actionsPageMarkup({ ...base, records: [], error: '' }, { admin: false, userId: 'u-sam' })), /No actions yet/);
  assert.match(text(actionsPageMarkup({ ...base, outcome: 'failed', records: [], error: '' }, { admin: false, userId: 'u-sam' })), /No actions match these filters/);
  const failed = actionsPageMarkup({ ...base, records: null, error: 'Unfold did not answer.' }, { admin: false, userId: 'u-sam' });
  assert.match(failed, /role="alert">Unfold did not answer\./);
  assert.match(failed, /data-action="actions-retry"/);
  assert.match(text(actionsPageMarkup({ ...base, records: [], error: '' }, { admin: false, userId: 'u-sam', demo: true })), /nothing invented/);
});

test('the Activity page asks the API for the chosen person, outcome and channel, and a person only for themselves', () => {
  assert.equal(String(actionsQuery({ person: 'u-sam', outcome: 'refused', channel: 'browser' }, { isAdmin: true, userId: 'u-ryan', before: 40 })), 'limit=50&userId=u-sam&outcome=refused&channel=browser&before=40');
  assert.equal(String(actionsQuery({ person: 'all', outcome: '', channel: '' }, { isAdmin: true, userId: 'u-ryan' })), 'limit=50');
  assert.equal(String(actionsQuery({ person: 'u-other', outcome: '', channel: '' }, { isAdmin: false, userId: 'u-sam' })), 'limit=50', 'the server scopes a non-admin to themselves');
});

test('CSV and JSON exports hold every listed row with its inputs as JSON, still redacted, and defuse spreadsheet formulas', () => {
  const rows = newestFirst([...records.map(recordRow), ...engineRows(events, '106')]);
  const csv = actionsCsv(rows);
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines[0], 'at,source,person,userId,role,what,action,targetKind,targetId,channel,confirmation,status,outcome,inputs');
  assert.equal(lines.length, 5);
  assert.match(lines[1], /,unfold,ryan,u-ryan,admin,approved,POST \/api\/ploeg\/work-items\/:id\/approve,work-item,106,unfold-mcp on ryan-pc-mint \(Claude Code 2\.1\.296\),c-7:a{64},200,done,"\{""reason"":""Looks right"",""token"":""\[redacted\]""\}"$/);
  assert.match(lines[2], /,engine,ryan,,,approved,work_item\.approved,work-item,106,mcp:Claude Code 2\.1\.296,/);
  assert.match(lines[4], /,failed,"\{""text"":""=HYPERLINK\(\\""x\\""\)""\}"$/);
  assert.doesNotMatch(csv, /never-recorded/);
  const json = JSON.parse(actionsJson(rows, { scope: 'Work Item 106', exportedAt: '2026-10-17T10:00:00.000Z' }));
  assert.equal(json.scope, 'Work Item 106');
  assert.equal(json.actions.length, 4);
  assert.deepEqual(json.actions[0].inputs, { reason: 'Looks right', token: '[redacted]' });
  assert.equal(json.actions[0].confirmation, confirmation);
  assert.equal(json.actions[1].source, 'engine');
  assert.match(actionsCsv([recordRow({ ...records[1], channel: '=cmd|calc' })]), /,'=cmd\|calc,/);
  assert.equal(visibilityHint({ admin: false }), 'You see only your own actions here; an administrator sees everyone’s.');
});
