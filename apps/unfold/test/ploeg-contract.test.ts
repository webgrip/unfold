import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { ploegAccepted } from '../src/ploeg.ts';
import { executionStates } from '../src/execution-authority.ts';
import { auditEvent, closeReasonLabel, executionStateText, failureReason, failureReasons, runOutcome, runOutcomes, runState, runStates, verdict, verdicts, workItemState, workItemStates } from '../public/core/states.js';
import { listReason } from '../public/core/reasons.js';
import { workStages, stageLabels } from '../public/core/stages.js';
import { paths, readTable, render } from '../scripts/ploeg-words.mjs';

type Row = { value: string; label?: string; short?: string; heading?: string; chip?: string | null; stage?: string; mcp: string; mcpGap?: string; unfold?: string; amount?: boolean; unfoldOnly?: string; gap?: string; ploegTerm?: string; rename?: string; ploegSource?: string; composedFrom?: string; prefix?: boolean; example?: string };
type ValueSet = { id: string; name: string; ploegTerm: string; ploeg: { schemas?: { file: string; pointer: string }[]; source?: string; model?: string; note?: string }; unfold: Record<string, string>; mcp: string; values: Row[] };

const repository = resolve(import.meta.dirname, '../../..');
const unfold = resolve(import.meta.dirname, '..');
const ploeg = resolve(repository, 'apps/ploeg');
const contracts = resolve(ploeg, 'docs/contracts');
const table = 'docs/domain/ploeg-words.json';
assert(statSync(contracts, { throwIfNoEntry: false })?.isDirectory(), 'apps/ploeg is not checked out; run git submodule update --init --recursive');

const words = readTable(repository) as { sets: ValueSet[] };
const sets = Object.fromEntries(words.sets.map(set => [set.id, set]));
const schemas = new Map<string, unknown>();
const schema = (file: string): unknown => { if (!schemas.has(file)) schemas.set(file, JSON.parse(readFileSync(join(contracts, file), 'utf8'))); return schemas.get(file); };
const at = (document: unknown, pointer: string): Record<string, unknown> => pointer.split('/').slice(1).reduce((node: any, key) => node?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], document) as Record<string, unknown>;
function enumAt(file: string, pointer: string): string[] {
  const node = at(schema(file), pointer);
  assert(node, `Ploeg's ${file} has no ${pointer} any more. Update its pointer in ${table}.`);
  const values = (node.enum ?? (node.anyOf as { enum?: unknown[] }[] | undefined)?.find(each => each.enum)?.enum) as unknown[] | undefined;
  assert(Array.isArray(values), `Ploeg's ${file} ${pointer} is no longer an enum. Update ${table}.`);
  return values.filter((value): value is string => typeof value === 'string');
}
const published = (set: ValueSet): string[] => [...new Set(set.ploeg.schemas!.flatMap(each => enumAt(each.file, each.pointer)))];
const row = (set: ValueSet, value: string): Row | undefined => set.values.find(each => each.value === value);
const ploegRows = (set: ValueSet): Row[] => set.values.filter(each => !each.unfoldOnly);
const where = (set: ValueSet, value: string) => `${table}, set "${set.id}", value "${value}"`;

function goSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? goSources(join(directory, entry.name)) : entry.name.endsWith('.go') && !entry.name.endsWith('_test.go') ? [join(directory, entry.name)] : []);
}
const ploegSource = [...goSources(join(ploeg, 'pkg')), ...goSources(join(ploeg, 'cmd'))].map(file => readFileSync(file, 'utf8')).join('\n');
const literal = (text: string) => ploegSource.includes(`"${text}"`) || ploegSource.includes(`'${text}'`);

function lifecycle(entity: string): string[] {
  const model = readFileSync(join(ploeg, 'docs/domain/model.yaml'), 'utf8');
  const start = model.search(new RegExp(`\\n  - name: ${entity}\\n    description:`));
  assert(start >= 0, `apps/ploeg/docs/domain/model.yaml no longer describes the ${entity} entity. Update the execution-state set in ${table}.`);
  const block = model.slice(start, model.indexOf('relationships:', start));
  return [...new Set([...block.matchAll(/\{from: ([^,]+), to: ([^,]+),/g)].flatMap(match => [match[1], match[2]]).filter(state => state !== "'[start]'"))];
}
const ploegExecutionStates = lifecycle('Operator Execution');
const composedSuffixes: Record<string, string[]> = {
  'work_item.': enumAt('operator-api.v1.schema.json', '/$defs/item/properties/state'),
  'operator_': ploegExecutionStates,
  'delivery.publication_': enumAt('operator-delivery.schema.json', '/$defs/operation/properties/state'),
};

const knownSets = ['work-item-state', 'run-state', 'run-outcome', 'verdict', 'failure-reason', 'close-reason', 'needs-human-reason', 'execution-state', 'run-cost-status', 'ask-cost-status', 'audit-event'];

test('the translation table lists each value set once, each value once, and names Ploeg terms the glossary gives to Ploeg', () => {
  assert.deepEqual(words.sets.map(set => set.id).sort(), [...knownSets].sort(), `${table} must have exactly these sets; this test knows how to check each one`);
  const glossary = readFileSync(resolve(repository, 'docs/reference/glossary.md'), 'utf8');
  for (const set of words.sets) {
    const seen = new Set<string>();
    for (const entry of set.values) {
      assert(!seen.has(entry.value), `${where(set, entry.value)} is listed twice`);
      seen.add(entry.value);
      const term = entry.ploegTerm ?? set.ploegTerm;
      const anchor = term.toLowerCase().replaceAll(' ', '-');
      const line = glossary.split('\n').find(text => text.startsWith(`| <a id="${anchor}"></a>`));
      assert(line, `${where(set, entry.value)} names the Ploeg term "${term}", which docs/reference/glossary.md does not define`);
      assert.equal(line.split(' | ')[3], 'Ploeg', `${where(set, entry.value)} names "${term}", but the glossary gives that term to Unfold, not Ploeg`);
    }
  }
});

test('every value in Ploeg\'s published schemas is in the translation table, and the table lists nothing Ploeg does not define', () => {
  for (const set of words.sets.filter(each => each.ploeg.schemas)) {
    const values = published(set);
    for (const value of values) assert(row(set, value), `Ploeg's schema (${set.ploeg.schemas!.map(each => `${each.file} ${each.pointer}`).join(', ')}) defines "${value}". Add it to ${table}, set "${set.id}", with the label Unfold shows for it.`);
    for (const entry of ploegRows(set)) assert(values.includes(entry.value), `${where(set, entry.value)}: Ploeg's schema no longer defines it. Remove the row, or mark it unfoldOnly if Unfold derives it.`);
  }
});

test('Unfold accepts every value Ploeg publishes and no value Ploeg does not', () => {
  const accepted: [string, readonly string[], string][] = [
    ['work-item-state', ploegAccepted.workItemStates, 'apps/unfold/src/ploeg.ts `states`'],
    ['run-state', ploegAccepted.runStates, 'apps/unfold/src/ploeg.ts `runStates`'],
    ['run-cost-status', ploegAccepted.runCostStatuses, 'apps/unfold/src/ploeg.ts `runCostStatuses`'],
    ['ask-cost-status', ploegAccepted.askCostStatuses, 'apps/unfold/src/ploeg.ts `askCostStatuses`'],
  ];
  for (const [id, list, file] of accepted) {
    const values = published(sets[id]);
    for (const value of values) assert(list.includes(value), `Ploeg sends ${sets[id].name} "${value}", which ${file} rejects. Add it there.`);
    for (const value of list) assert(values.includes(value), `${file} accepts ${sets[id].name} "${value}", which Ploeg's schema does not define. Remove it there.`);
  }
  const accepts: [readonly string[], string, string, string][] = [
    [ploegAccepted.askStates, 'operator-api.v1.schema.json', '/$defs/ask/properties/state', 'apps/unfold/src/ploeg.ts `askStates`'],
    [ploegAccepted.mergeStates, 'operator-api.v1.schema.json', '/$defs/pullRequest/properties/mergeState', 'apps/unfold/src/ploeg.ts `mergeStates`'],
    [ploegAccepted.refusalCodes, 'operator-api.v1.schema.json', '/$defs/routeRefusal/properties/code', 'apps/unfold/src/ploeg.ts `refusalCodes`'],
  ];
  for (const [list, file, pointer, source] of accepts) assert.deepEqual([...list].sort(), enumAt(file, pointer).sort(), `${source} must accept exactly the values of Ploeg's ${file} ${pointer}`);
  const execution = sets['execution-state'];
  for (const value of ploegExecutionStates) {
    assert(executionStates.includes(value), `Ploeg's Operator Execution lifecycle (apps/ploeg/docs/domain/model.yaml) has the state "${value}", which apps/unfold/src/execution-authority.ts \`executionStates\` rejects. Add it there.`);
    assert(row(execution, value), `Ploeg's Operator Execution lifecycle has the state "${value}". Add it to ${table}, set "execution-state".`);
  }
  for (const value of executionStates) assert(ploegExecutionStates.includes(value), `apps/unfold/src/execution-authority.ts \`executionStates\` accepts "${value}", which Ploeg's Operator Execution lifecycle does not have. Remove it there.`);
  for (const entry of execution.values) assert(ploegExecutionStates.includes(entry.value), `${where(execution, entry.value)}: Ploeg's Operator Execution lifecycle does not have it. Remove the row.`);
});

test('codes Ploeg defines only in its code (close reasons, needs_human reasons, audit actions) still exist there, and every one Ploeg writes is listed', () => {
  for (const id of ['close-reason', 'needs-human-reason', 'audit-event']) {
    const set = sets[id];
    for (const entry of set.values) {
      if (entry.composedFrom) {
        assert(literal(entry.composedFrom), `${where(set, entry.value)}: Ploeg's code no longer builds codes from "${entry.composedFrom}". Check ${entry.ploegSource ?? 'apps/ploeg/pkg'} and update the row.`);
        const suffix = entry.value.slice(entry.composedFrom.length);
        assert(composedSuffixes[entry.composedFrom]?.includes(suffix), `${where(set, entry.value)}: "${suffix}" is not a state Ploeg composes "${entry.composedFrom}" with any more. Update or remove the row.`);
      } else if (entry.prefix) {
        assert(ploegSource.includes(`"${entry.value}`), `${where(set, entry.value)}: Ploeg's code no longer writes a reason starting "${entry.value}". Update or remove the row.`);
      } else {
        assert(literal(entry.value), `${where(set, entry.value)}: Ploeg's code (apps/ploeg/pkg, apps/ploeg/cmd) no longer contains it. Update or remove the row.`);
      }
    }
  }
  const close = sets['close-reason'];
  for (const [, value] of ploegSource.matchAll(/\b(?:reason[A-Z]\w*|CloseReason\w+)\s*=\s*"([^"]+)"/g)) {
    assert(close.values.some(entry => entry.value === value), `Ploeg defines the Shift close reason "${value}". Add it to ${table}, set "close-reason", with what Unfold shows for it (mark it as a gap if Unfold does not word it yet).`);
  }
  const audit = sets['audit-event'];
  for (const [, value] of ploegSource.matchAll(/["'](\b(?:work_item|created_work_item|follow_up|review|round|run|shift|lease|checkpoint|operator|delivery|llm|pull_request|pull_request_comment|deploy|ask)\.[a-z_]*[a-z])["']/g)) {
    assert(row(audit, value), `Ploeg writes the audit action "${value}". Add it to ${table}, set "audit-event", with the label apps/unfold/public/core/states.js \`auditEvent\` gives it (mark it as a gap if that is only the humanized fallback).`);
  }
});

test('the screen label in the translation table is the one Unfold renders, and each known gap is still a gap', () => {
  const labelled: [string, (value: string) => { label: string; short?: string; heading?: string }, Record<string, unknown>, (value: string) => string][] = [
    ['work-item-state', workItemState, workItemStates, value => value],
    ['run-state', runState, runStates, value => value],
    ['run-outcome', value => runOutcome(value)!, runOutcomes, value => value],
    ['verdict', verdict, verdicts, value => value || 'none'],
    ['failure-reason', value => failureReason(value)!, failureReasons, value => value],
  ];
  for (const [id, meta, labels, key] of labelled) {
    const set = sets[id];
    for (const entry of set.values) {
      const shown = meta(entry.value) as { label: string; short?: string; heading?: string };
      const named = Object.hasOwn(labels, key(entry.value));
      if (entry.gap) assert(!named, `${where(set, entry.value)} is marked as a gap, but apps/unfold/public/core/states.js now has a label for it. Remove its "gap".`);
      else assert(named, `apps/unfold/public/core/states.js has no label for ${set.name} "${entry.value}". Add one there, or mark the row in ${table} as a known gap.`);
      assert.equal(entry.label, shown.label, `${where(set, entry.value)}: the table says "${entry.label}" but apps/unfold/public/core/states.js shows "${shown.label}". Change whichever is wrong.`);
      if (shown.short !== undefined || entry.short !== undefined) assert.equal(entry.short, shown.short, `${where(set, entry.value)}: the short label differs from apps/unfold/public/core/states.js`);
      if (id === 'work-item-state') assert.equal(entry.heading, shown.heading !== shown.label ? shown.heading : undefined, `${where(set, entry.value)}: the heading differs from apps/unfold/public/core/states.js`);
    }
    for (const value of Object.keys(labels)) {
      const ploegValue = value === 'none' && id === 'verdict' ? '' : value;
      assert(row(set, ploegValue), `apps/unfold/public/core/states.js labels ${set.name} "${value}", which ${table} does not list. Add it, marked unfoldOnly if Ploeg never sends it.`);
    }
  }
  for (const entry of sets['work-item-state'].values) {
    const { current, stopped } = workStages({ state: entry.unfoldOnly ? 'done' : entry.value });
    const stage = current ? `${stageLabels[current as keyof typeof stageLabels]}${stopped ? ' (stopped)' : ''}` : 'none: finished';
    assert.equal(entry.stage, stage, `${where(sets['work-item-state'], entry.value)}: the table's stage "${entry.stage}" differs from apps/unfold/public/core/stages.js ("${stage}")`);
  }
  const chipOf = (text: string) => listReason({ state: 'needs_human', latestShift: { closeReason: text, closedAt: '2026-01-01T00:00:00Z' } })!.chip;
  for (const id of ['close-reason', 'needs-human-reason']) {
    const set = sets[id];
    for (const entry of set.values) {
      const sample = entry.example ?? entry.value;
      if (entry.label !== undefined) assert.equal(entry.label, closeReasonLabel(sample), `${where(set, entry.value)}: the table says "${entry.label}" but apps/unfold/public/core/states.js \`closeReasonLabel\` shows "${closeReasonLabel(sample)}"`);
      if (entry.chip !== null && entry.chip !== undefined) assert.equal(entry.chip, chipOf(sample), `${where(set, entry.value)}: the table's chip "${entry.chip}" differs from apps/unfold/public/core/reasons.js ("${chipOf(sample)}")`);
      const unworded = (entry.label?.startsWith('Ploeg recorded: “') ?? false) || (entry.chip?.startsWith('Unrecognised:') ?? false);
      assert.equal(Boolean(entry.gap), unworded, unworded ? `Unfold shows ${set.name} "${entry.value}" only as Ploeg's raw code. Word it in apps/unfold/public/core/states.js or reasons.js, or mark the row in ${table} as a known gap.` : `${where(set, entry.value)} is marked as a gap, but Unfold now words it. Remove its "gap".`);
    }
  }
  for (const entry of sets['execution-state'].values) assert.equal(entry.label, executionStateText({ state: entry.value }), `${where(sets['execution-state'], entry.value)}: the label differs from apps/unfold/public/core/states.js \`executionStateText\``);
  for (const entry of sets['audit-event'].values) assert.equal(entry.label, auditEvent({ action: entry.value }).label, `${where(sets['audit-event'], entry.value)}: the table says "${entry.label}" but apps/unfold/public/core/states.js \`auditEvent\` shows "${auditEvent({ action: entry.value }).label}"`);
  const page = readFileSync(join(unfold, 'public/ploeg.js'), 'utf8');
  for (const id of ['run-cost-status', 'ask-cost-status']) {
    for (const entry of sets[id].values.filter(each => !each.amount)) assert(page.includes(`'${entry.label}'`), `${where(sets[id], entry.value)}: apps/unfold/public/ploeg.js no longer shows "${entry.label}". Update the table to what it shows now.`);
  }
});

test('what Unfold\'s HTTP API and MCP server call each value matches the table, including the Ask provisional → pending rename', () => {
  const http = readFileSync(join(unfold, 'src/http.ts'), 'utf8');
  const renames = Object.fromEntries([...http.matchAll(/spend\.costStatus === '(\w+)' \? '(\w+)'/g)].map(match => [match[1], match[2]]));
  assert(Object.keys(renames).length, `apps/unfold/src/http.ts no longer renames an Ask cost status. Update ${table}, set "ask-cost-status".`);
  for (const entry of sets['ask-cost-status'].values) {
    const called = renames[entry.value] ?? entry.value;
    assert.equal(entry.unfold, called, `${where(sets['ask-cost-status'], entry.value)}: apps/unfold/src/http.ts calls it "${called}", the table "${entry.unfold}"`);
    assert.equal(entry.mcp, called, `${where(sets['ask-cost-status'], entry.value)}: unfold_ask returns Unfold's stored value "${called}", the table says "${entry.mcp}"`);
    assert.equal(Boolean(renames[entry.value]), Boolean(entry.rename), `${where(sets['ask-cost-status'], entry.value)}: say in "rename" that apps/unfold/src/http.ts renames it, and only then`);
  }
  const mcp = readFileSync(join(unfold, 'src/mcp.ts'), 'utf8');
  const hint = /state: string\('([^']*)'\)/.exec(mcp)?.[1];
  assert(hint, `apps/unfold/src/mcp.ts no longer describes unfold_find_work's state filter. Update ${table}, set "work-item-state".`);
  for (const entry of ploegRows(sets['work-item-state'])) {
    const listed = new RegExp(`\\b${entry.value}\\b`).test(hint);
    assert.equal(!listed, Boolean(entry.mcpGap), listed ? `${where(sets['work-item-state'], entry.value)} has an mcpGap, but unfold_find_work's state hint now lists it. Remove the mcpGap.` : `unfold_find_work's state hint in apps/unfold/src/mcp.ts does not list "${entry.value}". Add it there, or record an mcpGap in ${table}.`);
  }
});

test('the reference page is generated from the current table', () => {
  const current = readFileSync(resolve(repository, paths.page), 'utf8');
  assert.equal(current, render(words), `${paths.page} is stale; run mise run ploeg-words`);
});
