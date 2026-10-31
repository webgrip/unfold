import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const app = fileURLToPath(new URL('../', import.meta.url));
const repository = resolve(app, '../..');
const dataPath = resolve(app, 'scripts/proof-matrix.json');
const pagePath = resolve(app, 'docs/operations/proof-matrix.md');

const surfaces = [
  ['src/oidc.ts', 'sign-in:oidc'],
  ['src/identity/scim.ts', 'identity:scim'],
  ['src/identity/shared-signals.ts', 'identity:ssf'],
  ['src/mcp-http.ts', 'mcp:http'],
  ['src/mcp.ts', 'mcp:stdio'],
  ['src/ahp/host.ts', 'ahp'],
  ['src/focus-export.ts', 'focus:csv'],
  ['src/audit/ocsf.ts', 'audit:ocsf'],
  ['src/audit/checkpoints.ts', 'audit:checkpoints'],
  ['src/outbound/service.ts', 'webhooks:outbound'],
  ['src/reports.ts', 'report-a-problem'],
];

/** Every integration and surface this checkout claims, read from its adapter registries, its source modules and its extensions. */
export async function claimedIntegrations() {
  const claims = new Set();
  const { taskProviders } = await import(pathToFileURL(resolve(app, 'src/task-providers/index.ts')).href);
  for (const adapter of taskProviders()) {
    if (adapter.name === 'demo') continue;
    claims.add(`tracker:${adapter.name}`);
    if (adapter.issues) claims.add(`report-a-problem:${adapter.name}`);
  }
  const { deliveryPublishers } = await import(pathToFileURL(resolve(app, 'src/delivery-publishers/index.ts')).href);
  for (const adapter of deliveryPublishers()) claims.add(`publisher:${adapter.kind}`);
  const { linkAdapters } = await import(pathToFileURL(resolve(app, 'src/link-providers/index.ts')).href);
  for (const adapter of linkAdapters()) claims.add(`account-link:${adapter.name}`);
  const { billingExporters } = await import(pathToFileURL(resolve(app, 'src/billing-exporters.ts')).href);
  for (const name of billingExporters.names()) claims.add(`billing:${name}`);
  const { intakeTemplates } = await import(pathToFileURL(resolve(app, 'src/intake/templates.ts')).href);
  for (const template of intakeTemplates()) claims.add(`intake:${template.id}`);
  for (const file of readdirSync(resolve(app, 'src/notify'))) {
    for (const match of readFileSync(resolve(app, 'src/notify', file), 'utf8').matchAll(/readonly id = '([a-z0-9-]+)'/g)) claims.add(`notify:${match[1]}`);
  }
  for (const entry of readdirSync(resolve(app, 'extensions'), { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== 'shared') claims.add(`extension:${entry.name}`);
  }
  for (const [file, claim] of surfaces) if (existsSync(resolve(app, file))) claims.add(claim);
  if (existsSync(resolve(app, 'src/focus-export.ts')) && readFileSync(resolve(app, 'src/focus-export.ts'), 'utf8').includes('hyparquet-writer')) claims.add('focus:parquet');
  return [...claims].sort();
}

const verifiedTestFile = file => /^test\/[^/]+\.test\.(ts|mjs)$/.test(file) || /^extensions\/vscode\/test\/[^/]+\.test\.ts$/.test(file);

function miseTasks() {
  const names = new Set();
  for (const path of [resolve(repository, 'mise.toml'), resolve(app, 'mise.toml')]) {
    for (const match of readFileSync(path, 'utf8').matchAll(/^\[tasks\.([A-Za-z0-9_-]+)\]/gm)) names.add(match[1]);
  }
  return names;
}

function browserFlows() {
  const source = readFileSync(resolve(app, 'scripts/browser-check.mjs'), 'utf8');
  return new Set([...source.matchAll(/^\s+\['([a-z-]+)', '/gm)].map(match => match[1]));
}

/** The problems that make the matrix untrue: a claimed integration without a row, a row for nothing claimed, and proof that does not exist. */
export function problems(data, claims) {
  const found = [];
  const covered = new Set(data.rows.flatMap(row => row.claims));
  for (const claim of claims) if (!covered.has(claim)) found.push(`${claim} is claimed by the code but has no row in scripts/proof-matrix.json`);
  for (const claim of covered) if (!claims.includes(claim)) found.push(`${claim} has a row but nothing in the code claims it`);
  const tasks = miseTasks();
  const scripts = JSON.parse(readFileSync(resolve(app, 'package.json'), 'utf8')).scripts;
  const flows = browserFlows();
  const task = (where, reference) => {
    const [kind, name] = [reference.slice(0, reference.indexOf(':')), reference.slice(reference.indexOf(':') + 1)];
    if (kind === 'mise' && !tasks.has(name)) found.push(`${where}: mise task ${name} does not exist`);
    else if (kind === 'npm' && !Object.hasOwn(scripts, name)) found.push(`${where}: npm script ${name} does not exist`);
    else if (kind === 'script' && !existsSync(resolve(app, name))) found.push(`${where}: script ${name} does not exist`);
    else if (!['mise', 'npm', 'script'].includes(kind)) found.push(`${where}: ${reference} must start with mise:, npm: or script:`);
  };
  for (const row of data.rows) {
    const where = row.integration;
    if (!row.claims.length) found.push(`${where}: names no claim`);
    if (row.doc && !existsSync(resolve(app, row.doc))) found.push(`${where}: ${row.doc} does not exist`);
    for (const test of row.tests) {
      if (!verifiedTestFile(test.file)) found.push(`${where}: ${test.file} is not run by mise run verify; list it under runs or live`);
      if (!existsSync(resolve(app, test.file))) { found.push(`${where}: ${test.file} does not exist`); continue; }
      const source = readFileSync(resolve(app, test.file), 'utf8');
      for (const name of test.names) if (!source.includes(name)) found.push(`${where}: ${test.file} has no test named "${name}"`);
    }
    for (const run of row.runs) {
      task(where, run.task);
      if (run.flow && !flows.has(run.flow)) found.push(`${where}: browser flow ${run.flow} does not exist`);
    }
    for (const live of row.live) task(where, live.task);
    for (const desktop of row.desktop) if (!data.probes[desktop.probe]) found.push(`${where}: desktop probe ${desktop.probe} is not described under probes`);
  }
  return found;
}

const cell = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
const link = (label, target) => `[${label}](${relative(dirname(pagePath), resolve(app, target)).replaceAll('\\', '/')})`;
const command = reference => {
  const name = reference.slice(reference.indexOf(':') + 1);
  if (reference.startsWith('mise:')) return `\`mise run ${name}\``;
  if (reference.startsWith('npm:')) return `\`npm run ${name}\``;
  return `${link(`\`${name}\``, name)}`;
};

/** The strongest kind of proof a row has, from a desktop or live check down to nothing. */
export function strength(row) {
  if (row.live.length) return 'live';
  if (row.desktop.length) return 'desktop';
  if (row.runs.length) return 'deterministic';
  if (row.tests.length) return 'fake';
  return 'none';
}

const strengthWords = { live: 'Live, opt-in', desktop: 'Desktop probe', deterministic: 'Deterministic run', fake: 'Fakes only', none: 'Nothing' };

/** The generated page. */
export function page(data) {
  const lines = [
    '---',
    'type: reference',
    'audience: [owner, operator, integrator, contributor]',
    'owner: unfold',
    'generated_by: "npm run proof-matrix"',
    '---',
    '',
    '# Integration proof matrix',
    '',
    `*Generated by ${link('scripts/proof-matrix.mjs', 'scripts/proof-matrix.mjs')} from ${link('scripts/proof-matrix.json', 'scripts/proof-matrix.json')}. Do not edit by hand: change the JSON file and run \`npm run proof-matrix\`. \`npm run check\` fails when this page drifts, when the code claims an integration that has no row, or when a row names a test, task or browser flow that does not exist.*`,
    '',
    'For every integration and surface Unfold claims, this page says what proves it works. The claims are read from the code: the tracker, forge, account-link, billing and intake registries, the notification channels, the editor extensions and the surface modules such as `src/oidc.ts`.',
    '',
    'The kinds of proof, from weakest to strongest:',
    '',
    '- **Fakes only**: tests that `mise run verify` runs, against a fake server or the protocol\'s published test vectors. They prove Unfold follows the protocol as written, not that a real service accepts it.',
    '- **Deterministic run**: the deterministic demo driven end to end, by a browser or a protocol client. No model call, no spend.',
    '- **Desktop probe**: a real editor on a desktop, against the local demo, with a throwaway profile. Recorded with its date below.',
    '- **Live, opt-in**: a task that talks to a real service. It never runs in `mise run verify` and never spends money unless the paid list below says so.',
    '',
    `Test files link to the file; the JSON names the tests in each file that carry the claim, and the check fails when one is renamed away. ${link('Validation', 'docs/validation.md')} records dated qualification runs.`,
  ];
  const groups = [...new Set(data.rows.map(row => row.group))];
  for (const group of groups) {
    lines.push('', `## ${group}`, '', '| Integration | Unfold claims | Fakes and unit tests | Deterministic runs | Live, opt-in | Desktop probe | Strongest proof | Not proven |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const row of data.rows.filter(entry => entry.group === group)) {
      const name = row.doc ? link(row.integration, row.doc) : row.integration;
      const tests = row.tests.map(test => `${link(test.file.split('/').pop(), test.file)}${test.names.length ? ` (${test.names.length})` : ''}`).join('<br>') || 'none';
      const runs = row.runs.map(run => `${command(run.task)}${run.flow ? ` flow \`${run.flow}\`` : ''}${run.note ? `: ${run.note}` : ''}`).join('<br>') || 'none';
      const live = row.live.map(entry => `${command(entry.task)}${entry.note ? `: ${entry.note}` : ''}`).join('<br>') || 'none';
      const desktop = row.desktop.map(entry => `[${entry.probe}](#${entry.probe})`).join('<br>') || 'none';
      lines.push(`| ${cell(name)} | ${cell(row.promise)} | ${cell(tests)} | ${cell(runs)} | ${cell(live)} | ${cell(desktop)} | ${strengthWords[strength(row)]} | ${cell(row.gap || '')} |`);
    }
  }
  const fakesOnly = data.rows.filter(row => strength(row) === 'fake').map(row => row.integration);
  const nothing = data.rows.filter(row => strength(row) === 'none').map(row => row.integration);
  lines.push('', '## Gaps', '');
  lines.push(`Proven only against fakes (${fakesOnly.length} of ${data.rows.length}): ${fakesOnly.join('; ') || 'none'}.`, '');
  lines.push(`No proof at all: ${nothing.join('; ') || 'none'}.`);
  lines.push('', '## Desktop probes', '', 'Each probe runs against the deterministic demo (`mise run demo`) on the desktop, opens the editor with a fresh temporary profile, and closes everything it started. It never uses a person\'s own profile or settings, and makes no model call.');
  for (const [id, probe] of Object.entries(data.probes)) {
    lines.push('', `### ${id}`, '', `${probe.title}.`, '', probe.date ? `Last run ${probe.date}: ${probe.result}.` : 'Not run yet.');
  }
  lines.push('', '## Live checks that would spend money', '', 'None of these has run. Each needs the owner\'s go-ahead first.', '', '| Check | Runs | Model | Each | Total | Source |', '| --- | --- | --- | --- | --- | --- |');
  for (const paid of data.paid) lines.push(`| ${cell(paid.check)} | ${paid.runs} | ${cell(paid.model)} | ${cell(paid.each)} | ${cell(paid.total)} | ${link('estimate', paid.source)} |`);
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = JSON.parse(readFileSync(dataPath, 'utf8'));
  const found = problems(data, await claimedIntegrations());
  const text = page(data);
  if (process.argv.includes('--check')) {
    if (!existsSync(pagePath) || readFileSync(pagePath, 'utf8') !== text) found.push('docs/operations/proof-matrix.md drifted from scripts/proof-matrix.json; run npm run proof-matrix');
  } else if (!found.length) writeFileSync(pagePath, text);
  if (found.length) {
    process.stderr.write(`${found.join('\n')}\n`);
    process.exitCode = 1;
  }
}
