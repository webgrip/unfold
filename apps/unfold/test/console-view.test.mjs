import test from 'node:test';
import assert from 'node:assert/strict';
import { consoleMarkup, consoleSections } from '../public/console-view.js';

const printed = 'last agent message: Error: run failed | {"code":-32603,"data":{"details":"Budget exceeded\\n\\nTo help debug"}} | {"code":1,"message":"cut… | stderr: | agent.py:579 in prompt |\n|   576 |   self._run |\nRuntimeError: failed';

test('a harness’s output splits into its labelled parts, JSON pretty-printed, stderr with its own lines', () => {
  assert.deepEqual(consoleSections(printed), [
    { label: 'Last agent message', text: 'Error: run failed' },
    { label: 'JSON', text: '{\n  "code": -32603,\n  "data": {\n    "details": "Budget exceeded\n\nTo help debug"\n  }\n}' },
    { label: 'JSON', text: '{"code":1,"message":"cut…' },
    { label: 'stderr', text: '| agent.py:579 in prompt |\n|   576 |   self._run |\nRuntimeError: failed' },
  ]);
  assert.deepEqual(consoleSections('plain text only'), [{ label: '', text: 'plain text only' }]);
  assert.deepEqual(consoleSections('  '), []);
});

test('the console marks lines that name an error and keeps every line inert', () => {
  const html = consoleMarkup([{ label: 'stderr', text: 'ok\n\nRuntimeError: <b>x</b>' }], { label: 'What the agent printed in Run 7' });
  assert.match(html, /^<div class="console" data-private tabindex="0" role="region" aria-label="What the agent printed in Run 7">/);
  assert.match(html, /<span class="console-line">ok<\/span><span class="console-line"> <\/span><span class="console-line" data-tone="danger">RuntimeError: &lt;b&gt;x&lt;\/b&gt;<\/span>/);
});
