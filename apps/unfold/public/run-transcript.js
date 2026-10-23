import { escape } from './core/dom.js';
import { icon } from './core/icons.js';
import { dateTime, plural, time as clock } from './core/format.js';
import * as ui from './core/ui.js';

/** The most transcript entries the page keeps for one Run; older entries are dropped first. */
export const transcriptEntryCap = 2000;

const toolGlyphs = { read: 'eye', edit: 'code', delete: 'trash', move: 'arrow', search: 'search', execute: 'terminal', think: 'spark', fetch: 'globe', switch_mode: 'refresh', other: 'zap' };
const stepGlyphs = { completed: 'check-circle', in_progress: 'circle-half', pending: 'circle' };
const stepLabels = { completed: 'Done', in_progress: 'In progress', pending: 'To do' };

/**
 * Folds transcript entries into what the page shows: messages, thoughts, stages and notices in order, one row per tool
 * call (its `tool_call` entries merged by `toolCallId` at the position of the first, its outputs joined), the latest plan,
 * and a gap wherever seq skips entries. `known` is the seq read before the first entry, or null when older entries were
 * dropped, so the start cannot be checked for a gap.
 * @param {object[]} entries Transcript entries in seq order.
 * @param {{ known?: number|null }} [options]
 * @returns {{ items: object[], plan: object[]|null, tools: number, lost: number }}
 */
export function foldTranscript(entries, { known = 0 } = {}) {
  const items = [];
  const tools = new Map();
  let plan = null;
  let previous = known;
  let lost = 0;
  for (const entry of entries) {
    if (previous !== null && entry.seq > previous + 1) { const missing = entry.seq - previous - 1; lost += missing; items.push({ type: 'gap', key: `g${entry.seq}`, missing }); }
    previous = entry.seq;
    if (entry.kind === 'plan') { plan = entry.plan || []; continue; }
    if (entry.kind === 'tool_call' || entry.kind === 'tool_output') {
      let tool = tools.get(entry.toolCallId);
      if (!tool) { tool = { type: 'tool', key: `c${entry.seq}`, at: entry.at, id: entry.toolCallId, title: '', toolKind: 'other', status: null, input: '', paths: [], outputs: [], clipped: false }; tools.set(entry.toolCallId, tool); items.push(tool); }
      if (entry.kind === 'tool_call') {
        if (entry.title) tool.title = entry.title;
        if (entry.toolKind) tool.toolKind = entry.toolKind;
        if (entry.status) tool.status = entry.status;
        if (entry.input) tool.input = entry.input;
        if (entry.paths?.length) tool.paths = entry.paths;
      } else if (entry.text) tool.outputs.push(entry.text);
      if (entry.clipped) tool.clipped = true;
      continue;
    }
    items.push({ type: entry.kind, key: `e${entry.seq}`, at: entry.at, text: entry.text || '', clipped: entry.clipped === true });
  }
  return { items, plan, tools: tools.size, lost };
}

/**
 * How a folded tool call reads: running while pending or in progress, done, failed, or without a result once the
 * transcript is complete and the call never finished.
 * @param {string|null} status
 * @param {boolean} complete
 * @returns {{ tone: string, label: string }}
 */
export function toolState(status, complete) {
  if (status === 'failed') return { tone: 'danger', label: 'Failed' };
  if (status === 'completed') return { tone: 'success', label: 'Done' };
  if (complete) return { tone: 'neutral', label: 'No result' };
  return { tone: 'live', label: 'Running' };
}

function time(at) {
  const moment = new Date(at);
  if (!at || Number.isNaN(moment.getTime())) return '';
  return `<time class="num stream-time" datetime="${escape(moment.toISOString())}" title="${escape(dateTime(moment))}">${escape(clock(moment, { seconds: true }))}</time>`;
}

function streamItem({ kind, tone, marker = '', head, body = '' }) {
  return `<li class="stream-item" data-kind="${kind}"${tone ? ` data-tone="${tone}"` : ''}><span class="stream-marker" aria-hidden="true">${marker}</span><div class="stream-body"><div class="stream-head">${head}</div>${body}</div></li>`;
}

function paragraphs(text) {
  return text.split(/\n{2,}/).filter(part => part.trim()).map(part => `<p>${escape(part)}</p>`).join('');
}

const diffLine = [[/^\+(?!\+\+ )/, 'add'], [/^-(?!-- )/, 'del'], [/^@@/, 'hunk'], [/^(?:edit|new file|delete|move) \S/, 'file']];
const commandTitle = /^(.*?):\s*\$\s+([^]*)$/;
const outputPreviewLines = 6;

function outputLines(lines, edit) {
  return lines.map(line => {
    const kind = edit ? diffLine.find(([pattern]) => pattern.test(line))?.[1] : null;
    return `<span class="console-line"${kind ? ` data-diff="${kind}"` : ''}>${escape(line) || ' '}</span>`;
  }).join('');
}

/**
 * What a tool call row names: a short label and, for a command, the command itself. A title such as
 * `Explore the repo: $ ls -la` splits into both; a title that only repeats the input becomes the command.
 * @param {{ title: string, input: string, toolKind: string }} tool
 * @returns {{ label: string, command: string }}
 */
export function toolHeading(tool) {
  const title = (tool.title || '').trim();
  const input = (tool.input || '').trim();
  const split = commandTitle.exec(title);
  if (split) return { label: split[1].trim(), command: input || split[2].trim() };
  if (tool.toolKind === 'execute') return { label: title && title !== input && !input.startsWith(title.replace(/…$/, '')) ? title : '', command: input || title };
  return { label: title || input || 'Tool call', command: '' };
}

function toolConsole(tool, { command, edit, base }) {
  const text = tool.outputs.join('\n').replace(/\s+$/, '');
  const lines = text ? text.split('\n') : [];
  const prompt = command ? `<pre data-private class="console-text console-command"><span class="console-line"><span class="console-prompt" aria-hidden="true">$ </span>${escape(command)}</span></pre>` : '';
  if (!prompt && !lines.length) return '';
  const shown = lines.length > outputPreviewLines + 2 ? lines.slice(0, outputPreviewLines) : lines;
  const rest = lines.slice(shown.length);
  const output = shown.length ? `<pre data-private class="console-text">${outputLines(shown, edit)}</pre>` : '';
  const more = rest.length ? `<details class="console-more" id="${escape(`${base}-${tool.key}`)}"><summary>${escape(`${plural(rest.length, 'more line')}${tool.clipped ? ' · clipped' : ''}`)}</summary><pre data-private class="console-text">${outputLines(rest, edit)}</pre></details>` : tool.clipped ? '<p class="console-label">Clipped</p>' : '';
  return `<div class="console console-compact" data-private>${prompt}${output}${more}</div>`;
}

function toolItem(tool, base, complete) {
  const shown = toolState(tool.status, complete);
  const { label, command } = toolHeading(tool);
  const pathList = tool.paths.filter(path => path !== tool.input && path !== command && !label.includes(path));
  const paths = pathList.length ? `<p class="work-transcript-paths">${pathList.map(path => `<span class="mono">${escape(path)}</span>`).join(' ')}</p>` : '';
  const edit = tool.toolKind === 'edit' || /^(?:edit|new file) \S/.test(tool.outputs.join('\n'));
  const input = !command && tool.input && tool.input !== label ? `<p class="stream-detail">${escape(tool.input)}</p>` : '';
  const state = shown.tone === 'success' ? `<span class="sr-only">${escape(shown.label)}</span>` : ui.badge({ tone: shown.tone, label: shown.label, size: 'sm' });
  const name = label || (command ? 'Ran a command' : 'Tool call');
  return streamItem({ kind: 'tool', tone: shown.tone, marker: icon(toolGlyphs[tool.toolKind] || 'zap'), head: `<span class="stream-tool">${escape(name)}</span>${state}${time(tool.at)}`, body: `${input}${paths}${toolConsole(tool, { command, edit, base })}` });
}

function itemMarkup(item, { base, actor, complete }) {
  if (item.type === 'tool') return toolItem(item, base, complete);
  if (item.type === 'message') return streamItem({ kind: 'message', marker: icon('bot'), head: `<strong class="stream-actor">${escape(actor)}</strong>${time(item.at)}`, body: `<div class="stream-text work-transcript-text">${paragraphs(item.text)}</div>` });
  if (item.type === 'thought') {
    const preview = item.text.replace(/\s+/g, ' ').trim();
    return streamItem({ kind: 'thought', marker: icon('spark'), head: ui.disclosure({ id: `${base}-${item.key}`, plain: true, summary: `Thought · ${preview.length > 72 ? `${preview.slice(0, 72)}…` : preview}`, body: `<div class="work-transcript-thought">${paragraphs(item.text)}</div>` }) });
  }
  if (item.type === 'stage') return `<li class="work-transcript-stage"><span>${escape(item.text || 'Stage')}</span>${time(item.at)}</li>`;
  if (item.type === 'truncated') return streamItem({ kind: 'system', tone: 'attention', marker: icon('alert'), head: `<span class="stream-text-inline"><strong>Recording stopped.</strong> ${escape(item.text || 'The transcript reached its limit.')}</span>${time(item.at)}` });
  if (item.type === 'gap') return streamItem({ kind: 'system', tone: 'attention', marker: icon('alert'), head: `<span class="stream-text-inline">${escape(`${plural(item.missing, 'entry', 'entries')} did not reach Ploeg here.`)}</span>` });
  return '';
}

function planMarkup(plan) {
  if (!plan?.length) return '';
  const done = plan.filter(step => step.status === 'completed').length;
  const steps = plan.map(step => `<li data-status="${escape(step.status)}">${icon(stepGlyphs[step.status] || 'circle')}<span class="sr-only">${escape(stepLabels[step.status] || '')}: </span><span>${escape(step.content)}</span></li>`).join('');
  return `<div class="work-transcript-plan" data-private><p class="overline">Plan · ${escape(`${done} of ${plan.length} done`)}</p><ul class="work-transcript-checklist">${steps}</ul></div>`;
}

function transcriptBody(run, entry) {
  const data = entry?.data;
  const retry = ui.button({ label: 'Try again', icon: 'refresh', variant: 'secondary', size: 'xs', action: 'work-run-transcript-retry', data: { id: run.id } });
  if (!data) {
    if (entry?.error) return ui.callout({ tone: 'danger', title: 'The transcript could not be read', body: `<p>${escape(entry.error.message)}</p>`, actions: retry });
    return '<p class="meta work-run-log-status" aria-busy="true">Loading what the agent did…</p>';
  }
  if (!data.available) return ui.emptyState({ compact: true, icon: data.reason === 'demo' ? 'bot' : 'info', title: data.reason === 'demo' ? 'No agent in the demo' : 'Not recorded by this Ploeg', body: `<p>${escape(data.message || '')}</p>` });
  const stale = entry.error ? `<p class="meta work-run-log-status" data-tone="danger">Could not refresh: ${escape(entry.error.message)}</p>` : '';
  const entries = entry.entries || [];
  const live = !data.complete;
  if (!entries.length) {
    const body = run.state === 'pending' ? 'The Run has not started.' : live ? 'Entries appear here as the agent works.' : 'Ploeg recorded nothing for this Run.';
    return `${ui.emptyState({ compact: true, icon: 'bot', title: 'Nothing recorded yet', body: `<p>${escape(body)}</p>` })}${stale}`;
  }
  const folded = foldTranscript(entries, { known: entry.trimmed ? null : 0 });
  const base = `work-run-transcript-${run.id}`;
  const facts = [plural(folded.tools, 'tool call'), plural(folded.items.filter(item => item.type === 'message').length, 'message')];
  const head = `<div class="work-run-log-head"><p class="meta">${facts.map(fact => `<span class="num">${escape(fact)}</span>`).join(' · ')}${live ? ' · <span class="live-dot" aria-hidden="true"></span> live' : ''}</p></div>`;
  const notes = [
    entry.trimmed ? `Older entries are not shown: this page keeps the newest ${plural(transcriptEntryCap, 'entry', 'entries')}.` : '',
    data.truncated && !folded.items.some(item => item.type === 'truncated') ? 'Ploeg stopped recording this transcript at its limit.' : '',
  ].filter(Boolean).map(note => `<p class="meta work-run-log-status">${escape(note)}</p>`).join('');
  const stream = `<ol class="session-stream work-transcript-stream">${folded.items.map(item => itemMarkup(item, { base, actor: run.role || 'Agent', complete: data.complete })).join('')}</ol>`;
  return `${head}${notes}${planMarkup(folded.plan)}<div class="work-transcript-scroll" data-private data-run-transcript="${escape(run.id)}" tabindex="0" aria-label="${escape(`What the agent did in Run ${run.id}`)}">${stream}</div>${stale}`;
}

/**
 * The "What the agent did" disclosure of one Run: open while the Run runs, then the agent's messages, thoughts, tool
 * calls, plan and stages as Ploeg recorded them. `entry` is the view's state for the Run:
 * `{ data, entries, trimmed, error }`, or nothing before the first read.
 * @param {{ id: string|number, state?: string, role?: string }} run
 * @param {{ data?: object, entries?: object[], trimmed?: boolean, error?: { message: string } } | undefined} entry
 * @returns {string}
 */
export function runTranscriptMarkup(run, entry) {
  return ui.disclosure({ summary: 'What the agent did', id: `work-run-transcript-${run.id}`, open: run.state === 'running', body: `<div class="work-run-transcript">${transcriptBody(run, entry)}</div>` });
}
