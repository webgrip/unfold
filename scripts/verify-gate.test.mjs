import test from 'node:test';
import assert from 'node:assert/strict';
import { runGate } from './verify-gate.mjs';

const graceMs = 300;
const seconds = started => (performance.now() - started) / 1000;

test('a gate that finishes reports its status and output', async () => {
  const { done } = runGate('sh', ['-c', 'echo out; echo err >&2; exit 3'], { graceMs });
  const result = await done;
  assert.equal(result.status, 3);
  assert.equal(result.orphaned, false);
  assert.match(result.output, /out/);
  assert.match(result.output, /err/);
});

test('a stopped gate ends when a descendant ignores SIGTERM and keeps the output open', async () => {
  const gate = runGate('sh', ['-c', '(trap "" TERM; exec sleep 30) & echo started; wait'], { graceMs });
  gate.child.stdout.once('data', () => gate.stop());
  const started = performance.now();
  const result = await gate.done;
  assert.ok(seconds(started) < 5, `took ${seconds(started)}s`);
  assert.notEqual(result.status, 0);
});

test('a gate whose escaped descendant keeps the output open ends as orphaned', async t => {
  const script = "const c = require('child_process').spawn('sleep', ['30'], { detached: true, stdio: ['ignore', 'inherit', 'inherit'] }); console.log(c.pid); c.unref();";
  const started = performance.now();
  const result = await runGate(process.execPath, ['-e', script], { graceMs }).done;
  const descendant = Number(result.output.split('\n')[0]);
  t.after(() => { try { process.kill(descendant, 'SIGKILL'); } catch {} });
  assert.ok(seconds(started) < 5, `took ${seconds(started)}s`);
  assert.equal(result.status, 0);
  assert.equal(result.orphaned, true);
  assert.match(result.output, /kept its output open/);
});
