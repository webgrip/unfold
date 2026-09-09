import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBacklog, validateBacklog } from './backlog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'docs/PRODUCT-DESIGN.md');
const chapters = [
  ['Product and system design', 'docs/design/00-product-system-design.md'],
  ['Self-improvement and dogfooding', 'docs/design/self-improvement.md'],
  ['Code audit and gap register', 'docs/design/gap-register.md'],
  ['Tickets, work orders and delivery', 'docs/design/ticket-integration.md'],
  ['Platform and governance', 'docs/design/platform-and-governance.md'],
  ['IDE and operator experience', 'docs/design/ide-and-operator-experience.md'],
  ['Market landscape and alternatives', 'docs/research/market-landscape.md'],
  ['Positioning and go-to-market', 'docs/product/go-to-market.md'],
  ['From design to tracker and agent work', 'docs/operations/backlog.md']
];
const slug = title => title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
function localTarget(from, target) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) return null;
  const [file] = target.split(/[?#]/);
  return file ? resolve(dirname(from), file) : from;
}
function transform(source, from, mapper) {
  let fence = null;
  return source.split('\n').map(line => {
    const delimiter = line.match(/^\s*(`{3,}|~{3,})/);
    if (delimiter) {
      if (fence && delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length) fence = null;
      else if (!fence) fence = delimiter[1];
      return line;
    }
    return fence ? line : mapper(line, from);
  }).join('\n');
}
function rewrite(line, from) {
  const shifted = line.replace(/^(#{2,5}) /, '#$1 ');
  return shifted.replace(/(!?\[[^\]\n]*\]\()([^\s)]+)(\))/g, (match, before, target, after) => {
    const absolute = localTarget(from, target);
    if (!absolute) return match;
    const suffix = target.match(/[?#].*$/)?.[0] ?? '';
    return before + relative(dirname(output), absolute).replaceAll('\\', '/') + suffix + after;
  });
}
const backlog = readBacklog();
validateBacklog(backlog);
const content = [
  '# Ploeg + De Vloer: product, delivery system and market plan',
  '',
  'Design edition: 9 September 2026. Intended readers: developers, technical leads, platform operators, product owners, prospective design partners and the CTO.',
  '',
  'Ploeg is the delivery engine. De Vloer is the human workbench in the browser and editor. Together, the proposed product turns an approved task into a bounded remote attempt, an independently verified candidate and a reviewable proposal inside the team’s existing delivery workflow.',
  '',
  'This document separates the implemented prototype, audited defects, proposed architecture and commercial hypotheses. The accompanying 0.2.0 repository adds task connections for Forgejo, GitHub, GitLab, ClickUp and Vikunja, an updated VS Code client, reviewable candidate exports and a planning/export toolkit; it does not claim that all of the proposed platform is implemented. Release-specific evidence is recorded in [validation](validation.md).',
  '',
  'The current operator-led workflow and its qualification limits are documented in [the 0.2.0 release](operations/iteration-0.2.0.md) and [connection setup](operations/task-connections.md). Earlier audit chapters remain the historical baseline; unattended intake, shared Ploeg claims and a trusted publication pipeline remain proposed.',
  '',
  '## Reading guide',
  '',
  'Start with chapter 1 for the product decision, chapter 2 to use Vloer to improve itself today, chapter 4 for ticket intake, chapter 6 for the editor experience, and chapters 7–8 for competitive and commercial decisions. Chapter 3 grounds the roadmap in actual code. Chapter 9 explains how to import and assign the 78 implementation tickets.',
  '',
  ...chapters.map(([title], index) => `- [${index + 1}. ${title}](#${slug(`${index + 1}. ${title}`)})`),
  '- [10. Implementation map](#10-implementation-map)',
  '',
  ...chapters.flatMap(([title, path], index) => {
    const absolute = resolve(root, path);
    const source = readFileSync(absolute, 'utf8').replace(/^# [^\n]*\n+/, '');
    return [`## ${index + 1}. ${title}`, '', transform(source.trim(), absolute, rewrite), ''];
  }),
  '## 10. Implementation map',
  '',
  'The complete ticket descriptions, criteria, risk, verification steps and dependency graph are in [the readable backlog](../backlog/README.md). The [JSON seed](../backlog/backlog.json) is the machine-readable planning source. This summary is generated from the same records; a planned ticket is not an execution grant or a completed feature.',
  '',
  '| Plan ID | Work | Repository | Gate | Local status | Dependencies |',
  '| --- | --- | --- | --- | --- | --- |',
  ...backlog.tickets.map(task => `| ${task.id} | ${task.title.replaceAll('|', '\\|')} | ${task.targetRepository} | ${task.milestone} | ${task.status}${task.implementation ? ' — ' + task.implementation.state.replaceAll('_', ' ') : ''} | ${task.dependsOn.join(', ') || '—'} |`),
  '',
  '### Audit coverage',
  '',
  '| Audited gap | Remediation tickets |',
  '| --- | --- |',
  ...Object.entries(backlog.gapCoverage).map(([gap, ids]) => `| ${gap} | ${ids.join(', ')} |`),
  '',
  '### Maintained source modules',
  '',
  'This consolidated design is generated by `npm run design:build`. Edit the following modules and the backlog source, then regenerate it. `npm run design:check` detects drift and unresolved local documentation links.',
  '',
  ...chapters.map(([title, path]) => `- [${title}](${relative(dirname(output), resolve(root, path))})`),
  '- [Architecture decisions](adrs/README.md)',
  '- [Market primary-source ledger](research/market-sources.json)',
  '- [Proposed WorkOrder schema](contracts/work-order.v1.schema.json)',
  '- [Proposed event envelope schema](contracts/event-envelope.v1.schema.json)',
  '- [Implemented extension](../extensions/vscode/README.md)',
  ''
].join('\n');
const failures = [];
for (const [path, source] of [...chapters.map(([, path]) => [resolve(root, path), readFileSync(resolve(root, path), 'utf8')]), [output, content]]) {
  transform(source, path, (line, from) => {
    for (const match of line.matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
      const target = localTarget(from, match[1]);
      if (target && target !== output && !existsSync(target)) failures.push(`${relative(root, from)}: missing ${match[1]}`);
    }
    return line;
  });
}
if (process.argv.includes('--check')) {
  if (!existsSync(output) || readFileSync(output, 'utf8') !== content) failures.push('docs/PRODUCT-DESIGN.md is stale; run npm run design:build');
} else if (!failures.length) writeFileSync(output, content);
if (failures.length) {
  process.stderr.write(failures.join('\n') + '\n'); process.exitCode = 1;
} else process.stdout.write(`${process.argv.includes('--check') ? 'Checked' : 'Built'} consolidated design: ${content.split(/\s+/).filter(Boolean).length.toLocaleString('en-US')} words, ${chapters.length} source chapters, ${backlog.tickets.length} tickets; local links resolve.\n`);
