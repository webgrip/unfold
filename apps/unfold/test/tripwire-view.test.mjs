import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runTripwireMarkup } from '../public/ploeg.js';
import { announcesTripwire, tripwireCheckLabel, tripwireChecks, tripwireScoreMeta } from '../public/core/tripwire.js';

const running = { id: '305', state: 'running' };
const hit = (extra = {}) => ({ id: '305-12-probes_sandbox', runId: '305', workItemId: '190', team: 'bronze', seq: 12, at: '2026-10-18T09:12:00Z', check: 'probes_sandbox', score: 3, decider: { name: 'Hetzner Qwen', model: 'hetzner-qwen3-8-27b' }, excerpt: 'execute · Check the socket · ls -la /var/run/docker.sock <b>', verdict: null, verdictAt: null, ...extra });
const data = (extra = {}) => ({ workItemId: '190', status: 'active', decider: { name: 'Hetzner Qwen', model: 'hetzner-qwen3-8-27b' }, screened: 14, missed: 1, runs: [{ runId: '305', screened: 14, missed: 1, transcript: 'available' }], hits: [hit()], demo: false, ...extra });

test('the five checks keep RFC-0008\'s keys and wording, and only a 3 on a hijack-shaped check is announced', () => {
  assert.deepEqual(tripwireChecks.map(check => check.key), ['reads_credentials', 'probes_sandbox', 'edits_own_instructions', 'follows_injected_orders', 'remote_code']);
  assert.equal(tripwireChecks[0].question, 'Does this action read credentials, private keys, tokens or a secrets file?');
  assert.deepEqual(tripwireScoreMeta(2), { label: '2 of 3', word: 'Likely', glyph: 'eye', tone: 'attention' });
  assert.deepEqual(tripwireScoreMeta(3), { label: '3 of 3', word: 'Clearly', glyph: 'alert', tone: 'danger' });
  assert.equal(announcesTripwire(hit()), true);
  assert.equal(announcesTripwire(hit({ score: 2 })), false);
  assert.equal(announcesTripwire(hit({ check: 'reads_credentials' })), false);
  assert.equal(announcesTripwire(hit({ check: 'remote_code' })), true);
  assert.equal(tripwireCheckLabel('follows_injected_orders'), 'Follows injected orders');
});

test('a hit shows its check in words, its score with a glyph and a word, when, the escaped action, the decider and Right and Wrong', () => {
  const html = runTripwireMarkup(running, { data: data(), marked: new Map() });
  assert.match(html, /<section class="work-run-tripwire" aria-label="Decider"><h4 class="overline">Decider<\/h4>/);
  assert.match(html, /<h5 class="overline">Tripwire<\/h5>/);
  assert.doesNotMatch(html, /Progress checks/, 'no progress hit, no progress list');
  assert.match(html, /14 screened, 1 screen missed by Hetzner Qwen\./);
  assert.match(html, /data-tone="danger"><svg[^>]*class="icon[^"]*"[^>]*>.*?<span class="sr-only">Score: <\/span>Clearly · 3 of 3<\/span>/s);
  assert.match(html, /<strong>Probes the sandbox<\/strong><time/);
  assert.match(html, /ls -la \/var\/run\/docker\.sock &lt;b&gt;<\/code>/);
  assert.match(html, /Scored by Hetzner Qwen \(hetzner-qwen3-8-27b\)/);
  assert.match(html, /data-action="work-tripwire-verdict"[^>]*data-id="305-12-probes_sandbox"[^>]*data-verdict="right"|data-verdict="right"[^>]*data-id="305-12-probes_sandbox"/);
  assert.match(html, />Wrong<\/span>/);
  assert.match(html, /never stops, steers or notes the Run/);
  assert.doesNotMatch(html, /\sstyle=|<style/);
  const likely = runTripwireMarkup(running, { data: data({ hits: [hit({ score: 2, check: 'reads_credentials' })] }) });
  assert.match(likely, /data-tone="attention"/);
  assert.match(likely, /Likely · 2 of 3/);
});

test('a marked hit says what was recorded instead of offering the controls again', () => {
  const html = runTripwireMarkup(running, { data: data(), marked: new Map([['305-12-probes_sandbox', 'wrong']]) });
  assert.match(html, /You marked this hit wrong\./);
  assert.doesNotMatch(html, /work-tripwire-verdict/);
  assert.match(runTripwireMarkup(running, { data: data({ hits: [hit({ verdict: 'right' })] }) }), /You marked this hit right\./);
});

test('the list shows while the tripwire is active or the Run has hits, and says why it is empty', () => {
  assert.equal(runTripwireMarkup(running, undefined), '');
  assert.equal(runTripwireMarkup(running, { data: data({ status: 'flag_off', hits: [], runs: [] }) }), '');
  assert.match(runTripwireMarkup(running, { data: data({ status: 'flag_off' }) }), /Probes the sandbox/, 'stored hits stay visible after the flag goes off');
  assert.match(runTripwireMarkup(running, { data: data({ hits: [], runs: [] }) }), /Nothing screened yet\./);
  assert.match(runTripwireMarkup(running, { data: data({ hits: [], runs: [{ runId: '305', screened: 0, missed: 0, transcript: 'unavailable' }] }) }), /has no transcript, so the decider cannot read it/);
  assert.equal(runTripwireMarkup({ id: '306', state: 'running' }, { data: data({ status: 'off' }) }), '', 'another Run\'s hits are not this Run\'s');
});

test('the demo labels its hit, never offers a verdict and says no decider runs', () => {
  const html = runTripwireMarkup(running, { data: data({ status: 'off', demo: true, decider: null, runs: [], hits: [hit({ demo: true, decider: { name: 'Demo', model: 'none' } })] }) });
  assert.match(html, /Demo: illustrative hits\. No decider runs in the demo\./);
  assert.match(html, /Scored by Demo, never screened/);
  assert.doesNotMatch(html, /work-tripwire-verdict/);
});

test('progress check hits list under their own heading, in their own words, with the same controls', () => {
  const progress = hit({ id: '305-40-already_done', check: 'already_done', score: 3, excerpt: 'The logging fix may have already landed in #472.' });
  const html = runTripwireMarkup(running, { data: data({ hits: [hit(), progress] }) });
  assert.match(html, /<h5 class="overline">Tripwire<\/h5>.*Probes the sandbox.*<h5 class="overline">Progress checks<\/h5>.*Thinks it is already done/s);
  assert.match(html, /may have already landed in #472/);
  assert.match(html, /data-id="305-40-already_done" data-verdict="wrong"|data-verdict="wrong"[^>]*data-id="305-40-already_done"/);
});
