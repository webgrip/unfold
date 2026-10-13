import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');

/** Where the translation table and the page rendered from it live, relative to the repository root. */
export const paths = Object.freeze({ table: 'docs/domain/ploeg-words.json', page: 'docs/reference/ploeg-words.md' });

/** Reads the translation table. */
export function readTable(base = root) {
  return JSON.parse(readFileSync(resolve(base, paths.table), 'utf8'));
}

const anchor = term => term.toLowerCase().replaceAll(' ', '-');
const termLink = term => `[${term}](glossary.md#${anchor(term)})`;
const code = text => `\`${String(text).replaceAll('`', '\\`')}\``;
const cell = text => String(text ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const valueCell = row => row.prefix ? `${code(row.value)}…` : row.value === '' ? `${code('')} (empty)` : code(row.value);

function note(row) {
  return [row.unfoldOnly ? `Unfold only: ${row.unfoldOnly}` : '', row.acceptedAhead ? `Accepted ahead of Ploeg: ${row.acceptedAhead}` : '', row.deprecated ? `Deprecated: ${row.deprecated}` : '', row.retired ? `Retired Unfold word: ${row.retired}` : '', row.prefix ? `Prefix; the label shown is for ${code(row.example)}.` : '', row.gap ? `**Gap:** ${row.gap}` : '', row.mcpGap ? `**MCP gap:** ${row.mcpGap}` : ''].filter(Boolean).join(' ');
}

function where(set) {
  const ploeg = set.ploeg.schemas
    ? `Ploeg publishes it in ${set.ploeg.schemas.map(each => `${code(each.file)} ${code(each.pointer)}`).join(', ')}.`
    : '';
  return [
    `Ploeg term: ${termLink(set.ploegTerm)}. ${ploeg} ${set.ploeg.note ?? ''}`.replace(/\s+/g, ' ').trim(),
    `Unfold accepts: ${set.unfold.accepts}. Screen words: ${set.unfold.labels}.${set.unfold.renames ? ` Renamed in: ${set.unfold.renames}.` : ''}`,
    `MCP: ${set.mcp}.`,
  ];
}

function table(set) {
  const terms = set.values.some(row => row.ploegTerm);
  const labels = set.values.some(row => row.label !== undefined);
  const chips = set.values.some(row => row.chip !== undefined);
  const stages = set.values.some(row => row.stage !== undefined);
  const head = ['Value', ...(terms ? ['Ploeg term'] : []), ...(labels ? ['Screen label'] : []), ...(chips ? ['Needs-you chip'] : []), ...(stages ? ['Stage'] : []), 'MCP', 'Note'];
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  for (const row of set.values) {
    const label = row.label === undefined ? '' : `${row.label}${row.heading ? ` (heading: ${row.heading})` : ''}${row.short && row.short !== row.label ? ` (short: ${row.short})` : ''}`;
    lines.push(`| ${[valueCell(row), ...(terms ? [row.ploegTerm ? termLink(row.ploegTerm) : termLink(set.ploegTerm)] : []), ...(labels ? [cell(label)] : []), ...(chips ? [row.chip === null || row.chip === undefined ? '—' : cell(row.chip)] : []), ...(stages ? [cell(row.stage)] : []), cell(row.mcp === row.value ? 'same' : row.mcp), cell(note(row))].join(' | ')} |`);
  }
  return lines;
}

/** Renders the reference page from the translation table. */
export function render(words) {
  const gaps = words.sets.flatMap(set => set.values.flatMap(row => [row.gap, row.mcpGap].filter(Boolean).map(gap => `* ${set.name} ${valueCell(row)}: ${gap}`)));
  return [
    '---',
    'type: reference',
    'audience: [owner, operator, integrator, contributor, agent]',
    'owner: unfold',
    'generated_by: "mise run ploeg-words"',
    '---',
    '',
    '# Ploeg words and screen words',
    '',
    `*Generated from [${paths.table.split('/').at(-1)}](../domain/ploeg-words.json) by \`mise run ploeg-words\`. Do not edit by hand; change the JSON and regenerate.*`,
    '',
    'Ploeg names a value in its API; Unfold shows a person a label for it. This page puts the two side by side, for every value set Unfold reads from Ploeg: what the API calls it, which Ploeg term it belongs to, what the screen calls it and what Unfold\'s MCP server returns. A label is today\'s wording, recorded as it is, not a proposal.',
    '',
    '`apps/unfold/test/ploeg-contract.test.ts` keeps it true. For every value in Ploeg\'s published schemas it checks that this table lists it, that `apps/unfold/src/ploeg.ts` accepts it, and that the label here is the one Unfold renders; values Ploeg does not publish in a schema are checked against the Ploeg code or domain model that defines them. Its failure message names the value and the file to change. A Ploeg pin update re-runs it. [Who owns a term](../contributing/agent-instructions.md#who-owns-a-term) says which application decides each word.',
    '',
    'A value marked "Unfold only" is one Unfold derives; Ploeg never sends it. A value "accepted ahead of Ploeg" is one the next Ploeg release sends and Unfold already accepts. In the MCP column, "same" means Unfold passes Ploeg\'s value through unchanged.',
    '',
    '## Screen words for Ploeg terms',
    '',
    'Docs, the API and the glossary use the Ploeg term. Screens may use a friendlier word, but only the one recorded here (system ADR-0036).',
    '',
    '| Ploeg term | Screen word | Note |',
    '|---|---|---|',
    ...(words.screenWords ?? []).map(entry => `| ${termLink(entry.term)} | ${cell(entry.word)} | ${cell(entry.note)} |`),
    '',
    ...words.sets.flatMap(set => [`## ${set.name}`, '', ...where(set).flatMap(line => [line, '']), ...table(set), '']),
    '## Known gaps',
    '',
    'Values Ploeg sends that Unfold does not word yet. The test records them as they are; when one is fixed, remove its `gap` from the table.',
    '',
    ...gaps,
    '',
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const page = resolve(root, paths.page);
  const expected = render(readTable());
  if (process.argv.includes('--check')) {
    let current = '';
    try { current = readFileSync(page, 'utf8'); } catch {}
    if (current !== expected) {
      console.error(`${paths.page} is stale; run mise run ploeg-words`);
      process.exit(1);
    }
  } else {
    writeFileSync(page, expected);
    console.log(`Wrote ${paths.page}`);
  }
}
