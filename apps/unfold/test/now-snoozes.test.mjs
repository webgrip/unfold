import assert from 'node:assert/strict';
import { test } from 'node:test';
import { olderRefusalAfter, snoozeFingerprint, snoozeKey, sortOut } from '../public/core/snoozes.js';
import { countsFromNow } from '../public/core/counts.js';
import { loopCounts, loopMarkup, nowMarkup } from '../public/now.js';

const at = Date.parse('2026-10-18T12:00:00Z');
const stuck = (id, extra = {}) => ({ id, team: 'bronze', state: 'needs_human', title: `Stuck ${id}`, url: '', createdAt: '2026-10-18T08:00:00Z', updatedAt: '2026-10-18T09:00:00Z', provider: 'vikunja', externalId: id, latestShift: null, pullRequestUrl: '', ...extra });
const refusal = (id, extra = {}) => ({ provider: 'vikunja', externalId: id, team: 'bronze', title: `Refused ${id}`, code: 'label_missing', reason: 'no label', allowedLabels: ['repo/unfold'], refusedAt: '2026-10-18T07:00:00Z', url: `https://tracker.test/tasks/${id}`, link: 'task', ...extra });
const nowData = (extra = {}) => ({
  demo: false, teams: ['bronze'], fetchedAt: '2026-10-18T12:00:00Z', errors: {}, running: [], active: [], recent: [],
  waiting: [stuck('7'), stuck('8'), { id: '9', team: 'bronze', state: 'awaiting_review', title: 'Review me', createdAt: '2026-10-18T08:00:00Z', updatedAt: '2026-10-18T09:00:00Z', pullRequestUrl: 'https://forge.test/pulls/3' }],
  refused: [refusal('25'), refusal('26')],
  ...extra,
});
const snoozeOf = (entry, kind, extra = {}) => ({ key: snoozeKey(entry, kind), fingerprint: snoozeFingerprint(entry, kind), kind: 'snooze', untilAt: null, createdAt: '2026-10-18T10:00:00Z', ...extra });

test('a snooze keys a Work Item by id and a refusal by provider and task, and remembers what would change', () => {
  assert.equal(snoozeKey(stuck('7'), 'work'), 'work:7');
  assert.equal(snoozeKey(refusal('25'), 'task'), 'task:vikunja:25');
  assert.equal(snoozeFingerprint(stuck('7'), 'work'), 'needs_human|2026-10-18T09:00:00Z');
  assert.equal(snoozeFingerprint(refusal('25'), 'task'), 'label_missing|2026-10-18T07:00:00Z');
});

test('snoozed and dismissed rows leave the lists until their snooze ends or the item changes', () => {
  const data = nowData();
  const snoozes = [snoozeOf(data.waiting[0], 'work', { untilAt: '2026-10-19T12:00:00Z' }), snoozeOf(data.refused[0], 'task', { kind: 'dismiss' })];
  const sorted = sortOut(data, snoozes, at);
  assert.deepEqual(sorted.data.waiting.map(entry => entry.id), ['8', '9']);
  assert.deepEqual(sorted.data.refused.map(entry => entry.externalId), ['26']);
  assert.deepEqual(sorted.snoozed.map(item => [item.kind, item.snooze.kind]), [['work', 'snooze'], ['task', 'dismiss']]);

  assert.equal(sortOut(data, snoozes, Date.parse('2026-10-19T12:00:01Z')).data.waiting.length, 3, 'a snooze for a day ends after a day');
  const changed = nowData({ waiting: [stuck('7', { updatedAt: '2026-10-18T11:00:00Z' })], refused: [refusal('25', { refusedAt: '2026-10-18T11:30:00Z' })] });
  const again = sortOut(changed, snoozes, at);
  assert.equal(again.data.waiting.length, 1, 'a Work Item that changed shows again');
  assert.equal(again.data.refused.length, 1, 'a refusal Ploeg made again shows again');
  assert.equal(sortOut(nowData({ waiting: [stuck('7', { state: 'awaiting_review', ci: { state: 'error', checks: [] } })] }), snoozes, at).data.waiting.length, 1, 'a new state shows again');
  assert.equal(sortOut(nowData(), [snoozeOf(data.waiting[2], 'work')], at).data.waiting.length, 3, 'only Needs-you rows can be snoozed');
  assert.deepEqual(sortOut(nowData({ errors: { waiting: 'no' } }), snoozes, at).data.errors, { waiting: 'no' });
  assert.equal(sortOut(null, snoozes, at).data, null);
});

test('refusals older than a week fold away and stop counting, and the badge equals the banner', () => {
  const old = refusal('30', { refusedAt: new Date(at - olderRefusalAfter - 60_000).toISOString() });
  const data = nowData({ refused: [refusal('25'), old] });
  const snoozes = [snoozeOf(data.waiting[0], 'work')];
  const sorted = sortOut(data, snoozes, at);
  assert.deepEqual(sorted.older.map(entry => entry.externalId), ['30']);
  const counts = countsFromNow(data, snoozes, at);
  assert.deepEqual({ waiting: counts.waiting, needsYou: counts.needsYou, refused: counts.refused }, { waiting: 3, needsYou: 1, refused: 1 });
  const view = { data: { ...sorted.data, running: [], active: [], recent: [] }, summary: null };
  assert.equal(loopCounts(view).needYou, counts.waiting, 'the day line counts what the Now badge counts');

  const html = loopMarkup({ data, error: null, since: null, summary: null }, { snoozes }, at);
  assert.match(html, /3 things need you<span class="loop-day-split">: 1 to decide, 1 to unstick, 1 could not start/);
  assert.match(html, /id="now-snoozed-toggle"[^>]*aria-expanded="false"[^>]*>.*1 snoozed · Show/);
  assert.match(html, /id="now-older-toggle"[^>]*aria-expanded="false"[^>]*>.*1 older refusal · Show/);
  assert.doesNotMatch(html, /Refused 30/, 'a folded refusal is not listed until it is unfolded');
  assert.doesNotMatch(html, /Stuck 7/);

  const open = loopMarkup({ data, error: null, since: null, summary: null }, { snoozes, showSnoozed: true, showOlder: true }, at);
  assert.match(open, /Stuck 7<\/a><span class="now-snoozed-until">Snoozed until it changes<\/span>/);
  assert.match(open, /data-action="now-unsnooze" data-key="work:7" aria-label="Unsnooze “Stuck 7”"/);
  assert.match(open, /Refused 30/);
  assert.match(open, /3 things need you/, 'unfolding older refusals does not count them');
});

test('Snooze is a labelled button on Needs-you and refused rows that opens a group of choices, and Dismiss is for refusals only', () => {
  const data = nowData();
  const closed = loopMarkup({ data, error: null, since: null, summary: null }, { snoozes: [] }, at);
  assert.match(closed, /data-action="now-snooze-menu" data-key="work:7" data-target="work" aria-expanded="false" aria-label="Snooze “Stuck 7”"/);
  assert.match(closed, /data-key="task:vikunja:25" data-target="task" aria-expanded="false" aria-label="Snooze or dismiss “Refused 25”"/);
  assert.doesNotMatch(closed, /data-key="work:9"/, 'a pull request ready for review has no Snooze');
  assert.doesNotMatch(closed, /now-snooze-options/);
  assert.doesNotMatch(loopMarkup({ data, error: null, since: null, summary: null }, {}, at), /now-snooze-menu/, 'without the person’s snoozes there is no Snooze');

  const work = loopMarkup({ data, error: null, since: null, summary: null }, { snoozes: [], snoozeOpen: 'work:7' }, at);
  assert.match(work, /aria-expanded="true" aria-controls="now-snooze-options-work-7"/);
  assert.match(work, /role="group" aria-label="Snooze “Stuck 7” on your Now"/);
  assert.match(work, /data-until="1d">1 day<[\s\S]*data-until="1w">1 week<[\s\S]*data-until="change">Until it changes</);
  assert.doesNotMatch(work, /id="now-dismiss-work-7"/);
  const task = loopMarkup({ data, error: null, since: null, summary: null }, { snoozes: [], snoozeOpen: 'task:vikunja:25' }, at);
  assert.match(task, /id="now-dismiss-task-vikunja-25" data-action="now-dismiss"/);
});

test('when everything in Unstick is snoozed it folds to one line and still offers the snoozed rows', () => {
  const data = nowData({ waiting: [stuck('7')], refused: [refusal('25')] });
  const snoozes = [snoozeOf(data.waiting[0], 'work'), snoozeOf(data.refused[0], 'task', { kind: 'dismiss' })];
  const html = loopMarkup({ data, error: null, since: null, summary: null }, { snoozes }, at);
  assert.match(html, /Nothing needs you/);
  assert.match(html, /class="loop-lane loop-clear loop-unstick"[\s\S]*Nothing is stuck\.[\s\S]*2 snoozed or dismissed · Show/);
  const desk = nowMarkup({ data, error: null, since: null, summary: null }, { snoozes }, at);
  assert.match(desk, /Nothing waits on you/);
  assert.match(desk, /2 snoozed or dismissed · Show/);
  assert.equal(countsFromNow(data, snoozes, at).waiting, 0);
});

test('snoozed text is escaped', () => {
  const entry = stuck('7', { title: '<img src=x onerror=alert(1)>' });
  const data = nowData({ waiting: [entry] });
  const html = loopMarkup({ data, error: null, since: null, summary: null }, { snoozes: [snoozeOf(entry, 'work')], showSnoozed: true }, at);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test('a snoozed or dismissed row never turns the day line amber, nor does a Run left on a snoozed Work Item', () => {
  const data = nowData({ waiting: [stuck('7', { updatedAt: '2026-10-18T11:00:00Z' })], refused: [refusal('25', { refusedAt: '2026-10-18T11:30:00Z' })], running: [{ id: 'r1', workItemId: '7', team: 'bronze', state: 'running', startedAt: '2026-10-18T10:00:00Z' }] });
  const input = { data, error: null, since: '2026-10-18T10:30:00Z', summary: null };
  assert.match(loopMarkup(input, { snoozes: [] }, at), /class="loop-day" data-tone="attention"/, 'what started waiting since the last visit turns it amber');
  const snoozes = [snoozeOf(data.waiting[0], 'work'), snoozeOf(data.refused[0], 'task', { kind: 'dismiss' })];
  const html = loopMarkup(input, { snoozes }, at);
  assert.match(html, /class="loop-day" data-tone="success"/);
  assert.match(html, /Nothing needs you/);
  assert.match(html, /nothing running/, 'the Run Ploeg still marks running on the snoozed Work Item does not count as running');
});
