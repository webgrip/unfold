import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const suite = import.meta.dirname;
const unitTestFiles = readdirSync(suite).filter(name => /\.test\.(ts|mjs)$/.test(name));
const literalTestBound = /^test\(.*\{[^}]*\btimeout: [0-9]/;

test('every test-level timeout in the unit suite scales with UNFOLD_TEST_TIMEOUT_SCALE through testTimeout', () => {
  assert.ok(unitTestFiles.length > 100, 'the scan reads the unit suite');
  const literal = unitTestFiles.flatMap(name => readFileSync(join(suite, name), 'utf8').split('\n')
    .flatMap((line, index) => literalTestBound.test(line) ? [`${name}:${index + 1}`] : []));
  assert.deepEqual(literal, [], 'a fixed bound fails a correct test on a slow runner; use testTimeout(ms) from ./timeframes.ts');
});
