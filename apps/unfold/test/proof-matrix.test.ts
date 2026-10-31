import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { claimedIntegrations, page, problems } from '../scripts/proof-matrix.mjs';

const data = JSON.parse(readFileSync(new URL('../scripts/proof-matrix.json', import.meta.url), 'utf8'));

test('every integration the code claims has a proof row, and every named test, task and flow exists', async () => {
  assert.deepEqual(problems(data, await claimedIntegrations()), []);
  assert.equal(readFileSync(new URL('../docs/operations/proof-matrix.md', import.meta.url), 'utf8'), page(data), 'docs/operations/proof-matrix.md is stale; run mise run proof-matrix');
});

test('a claimed integration without a row, a renamed test and a missing task each fail the matrix', async () => {
  const claims = await claimedIntegrations();
  const [first, ...rest] = data.rows;
  const renamed = { ...first, tests: [{ file: first.tests[0].file, names: ['a test nobody wrote'] }], live: [{ task: 'mise:no-such-task' }] };
  const found = problems({ ...data, rows: [renamed, ...rest.filter((row: { claims: string[] }) => !row.claims.includes('notify:ntfy'))] }, claims);
  assert.ok(found.includes('notify:ntfy is claimed by the code but has no row in scripts/proof-matrix.json'), found.join('\n'));
  assert.ok(found.some(problem => problem.includes('has no test named "a test nobody wrote"')), found.join('\n'));
  assert.ok(found.some(problem => problem.includes('mise task no-such-task does not exist')), found.join('\n'));
});

test('a test file that mise run verify does not run is refused as unit proof', async () => {
  const [first, ...rest] = data.rows;
  const found = problems({ ...data, rows: [{ ...first, tests: [{ file: 'test/e2e/mcp-over-https.e2e.ts', names: [] }] }, ...rest] }, await claimedIntegrations());
  assert.ok(found.some(problem => problem.includes('test/e2e/mcp-over-https.e2e.ts is not run by mise run verify')), found.join('\n'));
});
