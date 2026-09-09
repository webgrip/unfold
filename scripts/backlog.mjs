import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export function readBacklog(path = join(root, 'backlog/backlog.json')) { return JSON.parse(readFileSync(path, 'utf8')); }
export function validateBacklog(backlog) {
  if (backlog.schemaVersion !== '1.0' || !Array.isArray(backlog.tickets) || !backlog.tickets.length) throw new Error('Expected nonempty backlog schema 1.0');
  const ids = new Map();
  for (const task of backlog.tickets) {
    if (!/^PV-\d{3}$/.test(task.id) || ids.has(task.id)) throw new Error(`Invalid or duplicate ticket ID: ${task.id}`);
    if (!['ploeg', 'de-vloer'].includes(task.targetRepository) || !backlog.milestones[task.milestone]) throw new Error(`Unknown repository or milestone: ${task.id}`);
    if (!['planned', 'in_progress', 'review', 'accepted', 'deferred'].includes(task.status)) throw new Error(`Invalid planning status: ${task.id}`);
    if (!['low', 'medium', 'high', 'critical'].includes(task.risk) || !Number.isInteger(task.estimatePoints) || task.estimatePoints < 1 || task.estimatePoints > 13) throw new Error(`Invalid risk or estimate: ${task.id}`);
    for (const field of ['title', 'epic', 'problem']) if (typeof task[field] !== 'string' || !task[field].trim()) throw new Error(`Missing ${field}: ${task.id}`);
    for (const field of ['acceptanceCriteria', 'verification', 'definitionOfReady', 'definitionOfDone']) if (!Array.isArray(task[field]) || !task[field].length || task[field].some(value => typeof value !== 'string' || !value.trim())) throw new Error(`Missing ${field}: ${task.id}`);
    if (!Array.isArray(task.dependsOn) || new Set(task.dependsOn).size !== task.dependsOn.length) throw new Error(`Invalid dependencies: ${task.id}`);
    if (!Number.isInteger(task.priority) || task.priority < 1 || task.priority > 4) throw new Error(`Invalid priority: ${task.id}`);
    ids.set(task.id, task);
  }
  const visited = new Set(); const visiting = new Set(); const order = [];
  function visit(id) {
    if (visiting.has(id)) throw new Error(`Dependency cycle at ${id}`);
    if (visited.has(id)) return;
    const task = ids.get(id); if (!task) throw new Error(`Unknown dependency: ${id}`);
    visiting.add(id); task.dependsOn.forEach(visit); visiting.delete(id); visited.add(id); order.push(id);
  }
  for (const task of backlog.tickets) visit(task.id);
  if (!backlog.gapCoverage || Object.keys(backlog.gapCoverage).length !== 30) throw new Error('Expected coverage for 30 audited gaps');
  for (let index = 1; index <= 30; index++) {
    const gap = `GAP-${String(index).padStart(2, '0')}`;
    const tasks = backlog.gapCoverage[gap];
    if (!Array.isArray(tasks) || !tasks.length || tasks.some(id => !ids.has(id))) throw new Error(`Invalid gap coverage: ${gap}`);
  }
  return { count: ids.size, order };
}
export function brief(task) {
  return [`# ${task.id}: ${task.title}`, '', `Target repository: ${task.targetRepository}`, `Milestone: ${task.milestone}; epic: ${task.epic}; risk: ${task.risk}; estimate: ${task.estimatePoints} relative points.`, `Depends on: ${task.dependsOn.join(', ') || 'No code dependencies in this seed; environment and human authorization still required.'}`, '', '## Problem', '', task.problem, '', '## Acceptance criteria', '', ...task.acceptanceCriteria.map(item => `- [ ] ${item}`), '', '## Verification', '', ...task.verification.map(item => `- [ ] ${item}`), '', '## Definition of ready', '', ...task.definitionOfReady.map(item => `- [ ] ${item}`), '', '## Definition of done', '', ...task.definitionOfDone.map(item => `- [ ] ${item}`), '', '## Starting points', '', ...task.sourcePaths.map(path => `- ${path.trim()}`), '', '## Execution boundary', '', 'This is a planning brief, not an execution grant. Confirm the actual tracker revision, dependencies, allowed target, budget and policy before work. Produce a reviewable candidate and real evidence. Do not merge, deploy, change active platform permissions, or increase your own budget. Preserve the intentionally failing order-service demonstration fixture unless the approved task specifically changes that demonstration.', ''].join('\n');
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
export function clickupCsv(backlog) {
  const header = ['Task Name', 'Description content', 'Status', 'Priority', 'Labels', 'Plan ID', 'Target repository', 'Milestone', 'Depends on', 'Estimate points'];
  return [header, ...backlog.tickets.map(task => [`[${task.id}] ${task.title}`, brief(task), 'Planned', task.priority, `ploeg-vloer|${task.epic.toLowerCase()}|${task.risk}`, task.id, task.targetRepository, task.milestone, task.dependsOn.join('|'), task.estimatePoints])].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export function sessionPayload(task, options) {
  for (const name of ['repositoryId', 'crewId']) if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(options[name] ?? '')) throw new Error(`${name} must be an explicitly selected registered profile ID`);
  if (!['opencode', 'command', 'demo'].includes(options.runtime)) throw new Error('Choose opencode, command or demo explicitly');
  if (!Number.isFinite(options.budgetUsd) || options.budgetUsd <= 0 || options.budgetUsd > 10000) throw new Error('Choose an explicit positive USD budget within the server limit');
  const objective = brief(task);
  if (objective.length > 16000) throw new Error('Task brief exceeds the current API objective limit');
  return { title: `[${task.id}] ${task.title}`.slice(0, 160), objective, repositoryId: options.repositoryId, crewId: options.crewId, runtime: options.runtime, budgetUsd: options.budgetUsd };
}
export function markdown(backlog) {
  const { order } = validateBacklog(backlog);
  const milestones = Object.entries(backlog.milestones).map(([id, name]) => `| ${id} | ${name} | ${backlog.tickets.filter(task => task.milestone === id).length} |`).join('\n');
  return ['# Implementation backlog', '', `${backlog.tickets.length} ticket-ready records; generated from backlog/backlog.json. This file is a planning/export artifact. The selected tracker remains the source of truth after import. Planning status is not permission to run work.`, '', 'Estimates are relative engineering points, not hours, deadlines or predicted agent effort. Cross-repository dependency IDs need a mapping to native tracker IDs after import. No tickets have been created by this generator.', '', '## Milestones', '', '| ID | Outcome | Tickets |', '| --- | --- | --- |', milestones, '', '## Dependency order', '', order.join(' → '), '', '## Coverage of the code audit', '', '| Gap | Remediation tickets |', '| --- | --- |', ...Object.entries(backlog.gapCoverage).map(([gap, ids]) => `| ${gap} | ${ids.join(', ')} |`), '', '## Ticket details', '', ...backlog.tickets.map(task => brief(task).replace(/^# /, '### ').replace(/^## /gm, '#### '))].join('\n');
}
function write(path, content) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
function main(args) {
  const backlog = readBacklog(); const result = validateBacklog(backlog);
  const [command = 'validate', id, ...rest] = args;
  if (command === 'validate') return process.stdout.write(`PASS: ${result.count} tickets, acyclic dependencies, 30 mapped gaps. No tracker mutation.\n`);
  if (command === 'build' || command === 'check') {
    const outputs = [
      ['backlog/README.md', markdown(backlog)],
      ['backlog/clickup-import.csv', clickupCsv(backlog)],
      ...['de-vloer', 'ploeg'].map(repository => [`backlog/forgejo-${repository}.json`, JSON.stringify({ purpose: 'Reviewable create-issue payloads; no requests sent. Resolve native labels/assignees and persist import mapping before automation.', targetRepository: repository, issues: backlog.tickets.filter(task => task.targetRepository === repository).map(task => ({ planId: task.id, dependsOn: task.dependsOn, request: { title: `[${task.id}] ${task.title}`, body: brief(task) + `\n<!-- ploeg-vloer-plan:${task.id} -->\n` } })) }, null, 2) + '\n'])
    ];
    for (const [path, content] of outputs) {
      if (command === 'build') write(join(root, path), content);
      else if (readFileSync(join(root, path), 'utf8') !== content) throw new Error(`${path} is stale; run npm run backlog:build`);
    }
    return process.stdout.write(`${command === 'build' ? 'Built' : 'Checked'} Markdown, ClickUp CSV and two Forgejo payload files for ${result.count} tickets. No network requests.\n`);
  }
  const task = backlog.tickets.find(item => item.id === id); if (!task) throw new Error('Choose an existing PV-NNN ticket');
  if (command === 'brief') return process.stdout.write(brief(task));
  if (command === 'session-payload') {
    if (rest.length !== 4) throw new Error('Usage: session-payload PV-NNN REGISTERED_REPO_ID CREW_ID RUNTIME BUDGET_USD');
    const payload = sessionPayload(task, { repositoryId: rest[0], crewId: rest[1], runtime: rest[2], budgetUsd: Number(rest[3]) });
    return process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  }
  throw new Error('Commands: validate, build, check, brief PV-NNN, session-payload PV-NNN REPO_ID CREW_ID RUNTIME BUDGET_USD');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
