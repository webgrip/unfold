#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { activities, activityOf, moveActivities } from '../public/core/activity.js';

const [runsFile, entriesFile, format = 'table'] = process.argv.slice(2);
if (!runsFile || !entriesFile) {
  console.error('Usage: activity-report.mjs <runs.json> <entries.json> [table|json]');
  process.exit(2);
}
const runs = JSON.parse(readFileSync(runsFile, 'utf8')) ?? [];
const entries = JSON.parse(readFileSync(entriesFile, 'utf8')) ?? [];

const callsByRun = new Map();
for (const entry of entries) {
  if (entry.kind !== 'tool_call' || !entry.call_id) continue;
  const calls = callsByRun.get(entry.run_id) ?? new Map();
  const call = calls.get(entry.call_id) ?? { at: Date.parse(entry.at), kind: entry.tool_kind ?? 'other', input: '', title: entry.title ?? '', paths: entry.paths ?? [] };
  if (!call.input && entry.input) call.input = entry.input;
  calls.set(entry.call_id, call);
  callsByRun.set(entry.run_id, calls);
}

const minutes = ms => Math.round(ms / 6000) / 10;
const rows = runs.map(run => {
  const calls = [...(callsByRun.get(run.id)?.values() ?? [])].sort((a, b) => a.at - b.at).map(call => ({ ...call, ...activityOf(call) }));
  const started = Date.parse(run.started_at);
  const finished = Date.parse(run.finished_at ?? '') || (calls.at(-1)?.at ?? started);
  const time = Object.fromEntries(activities.map(entry => [entry.key, 0]));
  calls.forEach((call, index) => { if (index) time[call.activity] += Math.max(0, call.at - calls[index - 1].at); });
  if (calls.length) time[calls.at(-1).activity] += Math.max(0, finished - calls.at(-1).at);
  const span = Math.max(1, finished - (calls[0]?.at ?? started));
  const moves = moveActivities(calls).filter((key, index, list) => key !== list[index - 1]).length;
  const firstChange = calls.find(call => call.activity === 'change');
  const counts = Object.fromEntries(activities.map(entry => [entry.key, calls.filter(call => call.activity === entry.key).length]));
  return {
    run: run.id, team: run.team, role: run.role || '(none)', outcome: run.outcome ?? run.state, harness: run.harness, title: run.title,
    calls: calls.length, moves, minutes: minutes(span), firstChangeMinutes: firstChange ? minutes(firstChange.at - started) : null,
    share: Object.fromEntries(Object.entries(time).map(([key, value]) => [key, Math.round(100 * value / span)])), counts,
  };
}).filter(row => row.calls > 0);

if (format === 'json') { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
const keys = activities.map(entry => entry.key);
console.log(['run', 'team', 'role', 'outcome', 'calls', 'moves', 'min', 'first change', ...keys.map(key => `${key}%`), 'title'].join('\t'));
for (const row of rows) console.log([row.run, row.team, row.role, row.outcome, row.calls, row.moves, row.minutes, row.firstChangeMinutes ?? '-', ...keys.map(key => row.share[key]), (row.title ?? '').slice(0, 60)].join('\t'));
const total = rows.reduce((sum, row) => sum + row.calls, 0);
const other = rows.reduce((sum, row) => sum + row.counts.other, 0);
console.log(`\n${rows.length} Runs, ${total} calls, ${other} (${Math.round(100 * other / Math.max(1, total))} %) not placed by a rule`);
