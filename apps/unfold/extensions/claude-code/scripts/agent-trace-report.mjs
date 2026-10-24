#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { addedLines } from './agent-trace.mjs';
import { aiRange, noteRecords } from './agent-trace-schema.mjs';

/** The most commits and table rows one report covers. */
export const reportLimits = { commits: 200, rows: 300, conversations: 3 };

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function quiet(cwd, args) {
  try { return git(cwd, args); } catch { return ''; }
}

const cell = value => String(value).replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|');
const code = value => `\`${cell(value).replace(/`/g, "'")}\``;
const percent = (part, whole) => whole ? `${Math.round((part / whole) * 100)}%` : '—';

/**
 * What the Agent Trace records of one commit say about its added lines, per file: how many lines it adds, how many
 * of those an AI conversation of any record wrote (a line two records claim counts once), and which tools, models
 * and conversation URLs wrote them.
 */
export function commitAttribution(added, records) {
  const files = [];
  for (const [path, lines] of added) {
    const numbers = new Set(lines.map(entry => entry.number));
    const ai = new Set();
    const tools = new Set();
    const models = new Set();
    const urls = new Set();
    for (const record of records) for (const file of record.files) {
      if (file.path !== path) continue;
      for (const conversation of file.conversations) for (const range of conversation.ranges) {
        if (!aiRange(conversation, range)) continue;
        let hit = false;
        for (let number = range.start_line; number <= range.end_line; number += 1) if (numbers.has(number)) { ai.add(number); hit = true; }
        if (!hit) continue;
        if (record.tool) tools.add(`${record.tool.name} ${record.tool.version}`);
        const model = range.contributor?.model_id ?? conversation.contributor?.model_id;
        if (model) models.add(model);
        if (conversation.url && /^https?:\/\//.test(conversation.url)) urls.add(conversation.url);
      }
    }
    files.push({ path, added: numbers.size, ai: ai.size, tools: [...tools], models: [...models], urls: [...urls] });
  }
  return files;
}

/**
 * A Markdown summary of the Agent Trace notes on the commits in `base..head`: per commit and file, AI-written lines
 * against added lines, the tool and model, and the conversation. Reads `refs/notes/<ref>` and never fetches.
 */
export function agentTraceReport({ cwd = process.cwd(), base, head = 'HEAD', ref = 'agent-trace' }) {
  const shas = git(cwd, ['rev-list', '--reverse', '--no-merges', `--max-count=${reportLimits.commits}`, `${base}..${head}`]).split('\n').filter(Boolean);
  const rows = [];
  const skipped = [];
  let traced = 0;
  let addedTotal = 0;
  let aiTotal = 0;
  for (const sha of shas) {
    const subject = quiet(cwd, ['show', '-s', '--format=%s', sha]).trim().slice(0, 80);
    const { records, errors } = noteRecords(quiet(cwd, ['notes', `--ref=${ref}`, 'show', sha]));
    for (const error of errors) skipped.push(`${sha.slice(0, 10)}: ${error}`);
    const added = addedLines(quiet(cwd, ['show', '--format=', '--unified=0', '--no-color', '--no-renames', '--no-ext-diff', sha]));
    const files = commitAttribution(added, records);
    addedTotal += files.reduce((sum, file) => sum + file.added, 0);
    if (!records.length) { rows.push(`| ${code(sha.slice(0, 10))} ${cell(subject)} | — | no record | — | — | — |`); continue; }
    traced += 1;
    for (const file of files.filter(entry => entry.ai > 0 || entry.added > 0)) {
      aiTotal += file.ai;
      if (!file.ai) continue;
      const links = file.urls.slice(0, reportLimits.conversations).map((url, index) => `[${index + 1}](${url.replace(/[()\s]/g, encodeURIComponent)})`).join(' ');
      rows.push(`| ${code(sha.slice(0, 10))} ${cell(subject)} | ${code(file.path)} | ${file.ai} / ${file.added} | ${cell(file.tools.join(', ') || '—')} | ${cell(file.models.join(', ') || '—')} | ${links || '—'} |`);
    }
    if (!files.some(file => file.ai > 0)) rows.push(`| ${code(sha.slice(0, 10))} ${cell(subject)} | — | 0 / ${files.reduce((sum, file) => sum + file.added, 0)} | ${cell([...new Set(records.map(record => record.tool?.name).filter(Boolean))].join(', ') || '—')} | — | — |`);
  }
  const out = ['## Agent Trace', ''];
  if (!shas.length) return [...out, `No commits between ${code(base)} and ${code(head)}.`, ''].join('\n');
  out.push(`${traced} of ${shas.length} ${shas.length === 1 ? 'commit carries' : 'commits carry'} an [Agent Trace](https://agent-trace.dev/) record in ${code(`refs/notes/${ref}`)}. Agents wrote ${aiTotal} of ${addedTotal} added lines (${percent(aiTotal, addedTotal)}).`, '');
  out.push('| Commit | File | AI-written / added lines | Tool | Model | Conversation |', '| --- | --- | ---: | --- | --- | --- |');
  out.push(...rows.slice(0, reportLimits.rows));
  if (rows.length > reportLimits.rows) out.push('', `${rows.length - reportLimits.rows} more rows not shown.`);
  if (shas.length === reportLimits.commits) out.push('', `Only the first ${reportLimits.commits} commits are counted.`);
  if (skipped.length) out.push('', `Skipped ${skipped.length} ${skipped.length === 1 ? 'note part that is' : 'note parts that are'} not valid Agent Trace 0.1:`, '', ...skipped.slice(0, 20).map(entry => `- ${cell(entry)}`));
  out.push('');
  return out.join('\n');
}

function options(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!['--base', '--head', '--ref', '--repo'].includes(flag) || argv[index + 1] === undefined) return null;
    out[flag.slice(2)] = argv[++index];
  }
  return out.base && (!out.ref || /^[A-Za-z0-9][A-Za-z0-9._/-]{0,100}$/.test(out.ref)) ? out : null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const given = options(process.argv.slice(2));
  if (!given) {
    process.stderr.write('Usage: agent-trace-report.mjs --base <revision> [--head <revision>] [--ref agent-trace] [--repo <dir>]\nReads refs/notes/<ref>; fetch it first with git fetch origin refs/notes/agent-trace:refs/notes/agent-trace.\n');
    process.exitCode = 2;
  } else {
    try { process.stdout.write(agentTraceReport({ cwd: given.repo, base: given.base, head: given.head, ref: given.ref })); }
    catch (error) { process.stdout.write(`## Agent Trace\n\nNo report: ${String(error.stderr || error.message).trim().split('\n')[0]}\n`); }
  }
}
