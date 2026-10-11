import assert from 'node:assert/strict';
import { test } from 'node:test';
import { foldTranscript, runTranscriptMarkup, toolState, transcriptEntryCap } from '../public/run-transcript.js';

const at = '2026-10-11T10:00:00Z';
const running = { id: '51', state: 'running', role: 'Builder' };
const finished = { id: '51', state: 'finished', role: 'Builder' };
const transcript = [
  { seq: 1, at, kind: 'stage', text: 'Workspace ready' },
  { seq: 2, at, kind: 'plan', plan: [{ content: 'Read the failing test', status: 'pending' }] },
  { seq: 3, at, kind: 'thought', text: 'The rounding happens before tax.' },
  { seq: 4, at, kind: 'tool_call', toolCallId: 'c1', title: 'Read order.js', toolKind: 'read', status: 'pending', input: 'src/order.js', paths: ['src/order.js'] },
  { seq: 5, at, kind: 'tool_call', toolCallId: 'c1', status: 'completed' },
  { seq: 6, at, kind: 'tool_call', toolCallId: 'c2', title: 'Edit order.js', toolKind: 'edit', status: 'in_progress', paths: ['src/order.js', 'test/order.test.js'] },
  { seq: 7, at, kind: 'tool_output', toolCallId: 'c2', text: 'edit src/order.js\n@@ line 4: -round +roundHalfEven @@\n-return round(x)\n+return roundHalfEven(x)' },
  { seq: 8, at, kind: 'tool_call', toolCallId: 'c2', status: 'completed' },
  { seq: 11, at, kind: 'tool_call', toolCallId: 'c3', title: 'npm test', toolKind: 'execute', status: 'failed', input: 'npm test' },
  { seq: 12, at, kind: 'plan', plan: [{ content: 'Read the failing test', status: 'completed' }, { content: 'Fix <rounding>', status: 'in_progress' }] },
  { seq: 13, at, kind: 'message', text: 'I fixed the rounding.\n\nTests <still> fail.' },
];

test('tool calls fold by toolCallId into one row at the first entry, with the latest status, outputs joined, and the latest plan only', () => {
  const folded = foldTranscript(transcript);
  assert.deepEqual(folded.items.map(item => item.type), ['stage', 'thought', 'tool', 'tool', 'gap', 'tool', 'message']);
  assert.equal(folded.tools, 3);
  const [read, edit] = folded.items.filter(item => item.type === 'tool');
  assert.deepEqual([read.title, read.status, read.toolKind, read.input], ['Read order.js', 'completed', 'read', 'src/order.js']);
  assert.deepEqual([edit.status, edit.paths, edit.outputs.length], ['completed', ['src/order.js', 'test/order.test.js'], 1]);
  assert.deepEqual(folded.plan.map(step => step.status), ['completed', 'in_progress']);
  assert.equal(folded.lost, 2);
  assert.equal(folded.items.find(item => item.type === 'gap').missing, 2);
  assert.equal(foldTranscript([{ seq: 40, at, kind: 'message', text: 'x' }], { known: null }).lost, 0, 'dropped older entries are not a gap');
  assert.equal(foldTranscript([{ seq: 3, at, kind: 'message', text: 'x' }]).lost, 2, 'entries missing at the start are a gap');
  const orphan = foldTranscript([{ seq: 1, at, kind: 'tool_output', toolCallId: 'c9', text: 'out' }]).items[0];
  assert.deepEqual([orphan.type, orphan.title, orphan.outputs], ['tool', '', ['out']]);
});

test('a tool call reads as running, done, failed, or without a result once the transcript is complete', () => {
  assert.deepEqual(['pending', 'in_progress', 'completed', 'failed'].map(status => toolState(status, false).label), ['Running', 'Running', 'Done', 'Failed']);
  assert.deepEqual(toolState('in_progress', true), { tone: 'neutral', label: 'No result' });
});

test('the transcript shows messages, muted thoughts, one row per tool call, the plan as a checklist, stages and a gap, all private', () => {
  const html = runTranscriptMarkup(running, { data: { available: true, complete: false, truncated: false }, entries: transcript, trimmed: false });
  assert.match(html, /^<details class="disclosure" id="work-run-transcript-51" open><summary><span class="disclosure-summary">What the agent did<\/span>/, 'open while the Run runs');
  assert.match(html, /<div class="work-transcript-scroll" data-private data-run-transcript="51" tabindex="0" aria-label="What the agent did in Run 51">/);
  assert.match(html, /3 tool calls<\/span> · <span class="num">1 message<\/span> · <span class="live-dot"/);
  assert.equal(html.match(/data-kind="tool"/g).length, 3);
  assert.match(html, /<span class="stream-tool">Read order\.js<\/span><span class="badge sm" data-tone="success">Done<\/span>/);
  assert.match(html, /<p class="stream-detail">src\/order\.js<\/p>/, 'the input shows in monospace');
  assert.doesNotMatch(html, /<span class="mono">src\/order\.js<\/span> <\/p>/);
  assert.match(html, /<p class="work-transcript-paths"><span class="mono">src\/order\.js<\/span> <span class="mono">test\/order\.test\.js<\/span><\/p>/);
  assert.match(html, /<span class="stream-tool">npm test<\/span><span class="badge sm" data-tone="danger">Failed<\/span>/);
  assert.match(html, /id="work-run-transcript-51-c6"><summary><span class="disclosure-summary">Change<\/span>/, 'the output is collapsed under a stable id');
  assert.match(html, /<span class="work-transcript-file">edit src\/order\.js<\/span>\n<span class="work-transcript-hunk">@@ line 4[^<]*<\/span>\n<span class="work-transcript-del">-return round\(x\)<\/span>\n<span class="work-transcript-add">\+return roundHalfEven\(x\)<\/span>/);
  assert.match(html, /data-kind="thought"[^]*Thought · The rounding happens before tax\.[^]*<div class="work-transcript-thought">/);
  assert.match(html, /<strong class="stream-actor">Builder<\/strong>[^]*<p>I fixed the rounding\.<\/p><p>Tests &lt;still&gt; fail\.<\/p>/);
  assert.match(html, /Plan · 1 of 2 done[^]*<li data-status="completed">[^]*Read the failing test[^]*<li data-status="in_progress">[^]*Fix &lt;rounding&gt;/);
  assert.equal(html.match(/work-transcript-checklist/g).length, 1, 'only the latest plan');
  assert.match(html, /<li class="work-transcript-stage"><span>Workspace ready<\/span>/);
  assert.match(html, /2 entries did not reach Ploeg here\./);
});

test('a finished transcript is collapsed and marks unfinished calls, a truncated or trimmed one says so', () => {
  const entries = [{ seq: 1, at, kind: 'tool_call', toolCallId: 'c', title: 'Long job', toolKind: 'execute', status: 'in_progress' }, { seq: 2, at, kind: 'truncated', text: 'The transcript reached 5,000 entries.' }];
  const html = runTranscriptMarkup(finished, { data: { available: true, complete: true, truncated: true }, entries, trimmed: true });
  assert.match(html, /^<details class="disclosure" id="work-run-transcript-51"><summary>/);
  assert.match(html, /data-tone="neutral">No result</);
  assert.match(html, /Recording stopped\.<\/strong> The transcript reached 5,000 entries\./);
  assert.match(html, new RegExp(`keeps the newest ${String(transcriptEntryCap).replace(/\B(?=(\d{3})+$)/, '[.,]')} entries`));
  assert.doesNotMatch(html, /stopped recording this transcript at its limit/, 'the truncated entry already says it');
  assert.doesNotMatch(html, /live-dot/);
  assert.match(runTranscriptMarkup(finished, { data: { available: true, complete: true, truncated: true }, entries: entries.slice(0, 1) }), /Ploeg stopped recording this transcript at its limit\./);
});

test('the transcript says when it loads, is not recorded by this Ploeg, is the demo, is empty, or failed', () => {
  assert.match(runTranscriptMarkup(running, undefined), /aria-busy="true">Loading what the agent did…/);
  assert.match(runTranscriptMarkup(running, { data: { available: false, reason: 'unsupported', message: 'Ploeg on this workbench does not record agent transcripts yet.' }, entries: [] }), /Not recorded by this Ploeg[^]*Ploeg on this workbench does not record agent transcripts yet\./);
  assert.match(runTranscriptMarkup(running, { data: { available: false, reason: 'demo', message: 'The demo runs no agents, so it has no transcript to show.' }, entries: [] }), /No agent in the demo[^]*The demo runs no agents/);
  assert.match(runTranscriptMarkup(running, { data: { available: true, complete: false }, entries: [] }), /Nothing recorded yet[^]*Entries appear here as the agent works\./);
  assert.match(runTranscriptMarkup(finished, { data: { available: true, complete: true }, entries: [] }), /Ploeg recorded nothing for this Run\./);
  assert.match(runTranscriptMarkup({ ...running, state: 'pending' }, { data: { available: true, complete: false }, entries: [] }), /The Run has not started\./);
  const failed = runTranscriptMarkup(running, { data: null, entries: [], error: { message: 'Ploeg could not be reached.' } });
  assert.match(failed, /class="callout" data-tone="danger"[^]*The transcript could not be read[^]*Ploeg could not be reached\.[^]*data-action="work-run-transcript-retry" data-id="51"/);
  const stale = runTranscriptMarkup(running, { data: { available: true, complete: false }, entries: transcript.slice(-1), error: { message: 'Timed out.' } });
  assert.match(stale, /I fixed the rounding[^]*Could not refresh: Timed out\./, 'an earlier read stays on screen when a refresh fails');
});
