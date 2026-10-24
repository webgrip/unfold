import test from 'node:test';
import assert from 'node:assert/strict';
import { executionFailure } from '../src/failures.ts';

test('a Run whose agent tool does not answer while starting says so, and says nothing was spent before the prompt', () => {
  const starting = executionFailure('timeout', 'runtime', 'not_submitted');
  assert.equal(starting.message, 'The agent tool in the workspace did not answer in time while the Run was starting.');
  assert.match(starting.remediation, /^Nothing reached the model, so nothing was spent\. Try again;/);
  assert.equal(executionFailure('timeout', 'workspace', 'not_submitted').message, 'The operation exceeded its configured time limit.');
});
