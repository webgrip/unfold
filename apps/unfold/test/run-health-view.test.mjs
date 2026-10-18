import assert from 'node:assert/strict';
import { test } from 'node:test';
import { healthAge, runHealthBadge, runHealthMarkup } from '../public/ploeg.js';

const now = Date.parse('2026-10-17T09:12:00Z');
const running = { id: '305', state: 'running' };
const signals = [{ key: 'quiet', health: 'on_track', reason: 'last activity 20 s ago', judged: true }, { key: 'pace', health: 'watch', reason: 'Plan 1 of 6 at 37 of 90 min: at this pace it runs past the time limit', judged: true }];
const data = (extra = {}) => ({ runId: '305', state: 'running', health: 'watch', signals, deciding: 'pace', reason: 'Plan 1 of 6 at 37 of 90 min: at this pace it runs past the time limit', combined: { health: 'watch', source: 'signals' }, judge: null, judgeState: 'off', judgements: 0, history: [], stale: false, asOf: '2026-10-17T09:12:00Z', demo: false, ...extra });
const judge = { id: 'j-1', runId: '305', workItemId: '190', at: '2026-10-17T09:11:30Z', health: 'off_track', reason: 'Times an unrelated script <b>now</b>.', evidence: [41, 44], model: 'hetzner-qwen3-8-27b', ploegAskId: 'a', signalsHealth: 'watch', costUsd: null, costStatus: null };

test('the health badge shows only while the Run runs, with a glyph and a word, never colour alone', () => {
  const badge = runHealthBadge(running, { data: data(), at: now }, now);
  assert.match(badge, /data-tone="attention"/);
  assert.match(badge, /<svg[^>]*class="icon/);
  assert.match(badge, />Watch<\/span>/);
  assert.match(badge, /title="Health: Watch · Plan 1 of 6 at 37 of 90 min/);
  assert.equal(runHealthBadge({ ...running, state: 'finished' }, { data: data() }, now), '');
  assert.equal(runHealthBadge({ ...running, state: 'pending' }, { data: data() }, now), '');
  assert.equal(runHealthBadge(running, undefined, now), '');
});

test('a judge that raised the badge says so, and the body shows the AI line, its model, evidence, the rule and the control', () => {
  const entry = { data: data({ judge, combined: { health: 'off_track', source: 'judge' }, judgeState: 'idle', judgements: 1 }), at: now, wrong: new Set() };
  assert.match(runHealthBadge(running, entry, now), /Off track.*raised by the AI judge|raised by the AI judge.*Off track/s);
  const body = runHealthMarkup(running, entry, { now });
  assert.match(body, /aria-label="AI judgement"/);
  assert.match(body, /title="Judged by hetzner-qwen3-8-27b"/);
  assert.match(body, /Times an unrelated script &lt;b&gt;now&lt;\/b&gt;\./, 'the reason is escaped');
  assert.match(body, /evidence <span class="mono" title="Transcript entry 41">#41<\/span>, <span class="mono" title="Transcript entry 44">#44<\/span>/);
  assert.match(body, /Badge: Off track, the worst of the signals \(Watch\) raised but never lowered by the AI judge \(Off track\)/);
  assert.match(body, /data-action="work-run-judge-wrong"[^>]*data-id="j-1"|data-id="j-1"[^>]*data-action="work-run-judge-wrong"/);
  assert.match(body, />This was wrong</);
  entry.wrong.add('j-1');
  assert.match(runHealthMarkup(running, entry, { now }), /Recorded as wrong/);
});

test('the signals line names the numbers and lists every signal in its title', () => {
  const body = runHealthMarkup(running, { data: data(), at: now }, { now });
  assert.match(body, /<strong>Signals: Watch<\/strong> · Plan 1 of 6 at 37 of 90 min/);
  assert.match(body, /title="Quiet: On track, last activity 20 s ago\nPace: Watch, Plan 1 of 6/);
  assert.doesNotMatch(body, /AI judgement/, 'no judge line without a verdict');
});

test('judge on, allowance spent: signals only and the reason says the judge is paused', () => {
  const body = runHealthMarkup(running, { data: data({ judgeState: 'paused_allowance' }), at: now }, { now });
  assert.match(body, /Judge paused: this month's allowance is spent\./);
  assert.doesNotMatch(body, /AI judgement/);
});

test('judge on, judge failed or timed out: signals only, no judge line, quietly', () => {
  const body = runHealthMarkup(running, { data: data({ judgeState: 'failed' }), at: now }, { now });
  assert.doesNotMatch(body, /AI judgement|Judge paused|failed/i);
});

test('a failed poll greys the last health and says how old it is', () => {
  const entry = { data: data({ asOf: '2026-10-17T09:10:00Z' }), at: Date.parse('2026-10-17T09:10:00Z'), error: { message: 'offline' } };
  assert.equal(healthAge(entry, now), 2);
  assert.match(runHealthBadge(running, entry, now), /data-stale/);
  assert.match(runHealthBadge(running, entry, now), /health as of 2 min ago/);
  assert.match(runHealthMarkup(running, entry, { now }), /<section class="work-run-health" aria-label="Run health" data-stale>.*Health as of 2 min ago/s);
  assert.equal(healthAge({ data: data(), at: now }, now), 0);
  assert.equal(healthAge({ data: data({ stale: true, asOf: '2026-10-17T09:07:00Z' }), at: now }, now), 5, 'Ploeg\'s transcript unreadable on the server');
});

test('demo health is labelled as demo and says no judge runs', () => {
  const body = runHealthMarkup(running, { data: data({ demo: true, health: 'on_track', combined: { health: 'on_track', source: 'signals' }, reason: '18 of 90 min' }), at: now }, { now });
  assert.match(body, /Demo: health computed from illustrative data\. No judge runs in the demo\./);
});
