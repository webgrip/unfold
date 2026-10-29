import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answer, phaseLabel, proofMarkup, residencyMarkup, returnTo, startLine } from '../public/views/status.js';
import { contractBanner, contractFrom, signalFrom } from '../public/core/status-signal.js';

const check = (id, state, summary = `${id} ${state}`) => ({ id, title: id, state, summary, checkedAt: '2026-10-05T06:29:14Z' });
const report = (states, extra = {}) => ({ overall: 'operational', notes: [], checks: [check('ploeg', states[0]), check('gateway', states[1]), check('workspaces', states[2], states[2] === 'down' ? 'Every machine is busy.' : states[2] === 'ok' ? 'The last workspace started 12 min ago.' : 'Workspace check.')], ...extra });

test('the start line follows the engine order and the team step is ready only while nothing before it is down', () => {
  assert.deepEqual(startLine(report(['ok', 'ok', 'ok'])).map(step => [step.number, step.id, step.state]), [[1, 'ploeg', 'ok'], [2, 'gateway', 'ok'], [3, 'workspaces', 'ok'], [4, 'team', 'ready']]);
  const blocked = startLine(report(['ok', 'ok', 'down']));
  assert.deepEqual(blocked.at(-1), { id: 'team', name: 'The team works', number: 4, state: 'unreached', summary: 'Waits for step 3.' });
});

test('a stopped step answers no, names the step, and says how long a new session would wait and that the wait is free', () => {
  assert.deepEqual(answer(report(['ok', 'ok', 'down'], { startLimitSeconds: 180 })), {
    tone: 'danger', verdict: 'Not right now.', reason: 'New sessions stop at step 3. Every machine is busy. This is a problem on the workbench; there is nothing to change in your session.', stop: 3,
    next: 'A session you start now waits up to 3 minutes for a machine, then stops. The wait is not charged. Try again when step 3 turns green. This page checks again every 30 seconds. No administrator has posted a note about it yet.',
  });
  assert.equal(answer(report(['ok', 'down', 'ok'], { startLimitSeconds: 180, notes: [{ severity: 'degraded' }] })).next, 'Try again when step 2 turns green. This page checks again every 30 seconds.');
  assert.match(answer(report(['ok', 'ok', 'down'])).next, /^Try again when step 3/, 'no wait sentence without a known limit');
});

test('notes change the answer only while open, and an outage note says no even when every check passes', () => {
  assert.equal(answer(report(['ok', 'ok', 'ok'], { notes: [{ severity: 'outage' }] })).verdict, 'Not right now.');
  assert.equal(answer(report(['ok', 'ok', 'ok'], { notes: [{ severity: 'degraded' }] })).verdict, 'Yes, but expect problems.');
  assert.equal(answer(report(['ok', 'ok', 'ok'], { notes: [{ severity: 'outage', resolvedAt: '2026-10-05T07:00:00Z' }] })).verdict, 'Yes.');
});

test('the answer never claims more than the checks prove', () => {
  assert.deepEqual(answer(report(['ok', 'ok', 'ok'])), { tone: 'success', verdict: 'Yes.', reason: 'Nothing is in the way. The last workspace started 12 min ago.', next: '', stop: null });
  assert.equal(answer(report(['not_used', 'ok', 'idle'])).verdict, 'Probably.');
  assert.equal(answer(report(['ok', 'ok', 'idle'], { notes: [{ severity: 'degraded' }] })).verdict, 'Probably, but expect problems.');
  assert.deepEqual(startLine(report(['ok', 'ok', 'idle'])).at(-1).state, 'unproven');
  assert.equal(answer(report(['ok', 'degraded', 'ok'])).verdict, 'Yes, but not reliably.');
  assert.deepEqual(answer(report(['not_used', 'not_used', 'not_used'])).verdict, 'This is a demo.');
});

test('wait phases read as plain words, and an unknown phase falls back to preparing', () => {
  assert.equal(phaseLabel('capacity'), 'Waiting for a free machine');
  assert.equal(phaseLabel('image_unavailable'), 'Workspace image unavailable');
  assert.equal(phaseLabel('something-new'), 'Preparing the workspace');
});

test('a failed session that sent the person here gets a way back once nothing stops a new session', () => {
  const failed = { id: 's1', title: 'Say hi', status: 'failed' };
  assert.deepEqual(returnTo(failed, answer(report(['ok', 'ok', 'down']))), { ready: false, text: 'When step 3 turns green, you can try “Say hi” again.' });
  assert.deepEqual(returnTo(failed, answer(report(['ok', 'ok', 'ok'], { notes: [{ severity: 'outage' }] }))), { ready: false, text: 'When the outage is resolved, you can try “Say hi” again.' });
  assert.deepEqual(returnTo(failed, answer(report(['ok', 'ok', 'ok']))), { ready: true, text: 'You can try “Say hi” again now.' });
  assert.equal(returnTo({ ...failed, status: 'running' }, answer(report(['ok', 'ok', 'ok']))), null, 'already retried');
  assert.equal(returnTo(null, answer(report(['ok', 'ok', 'ok']))), null);
});

test('the navigation signal shows only while new work is affected', () => {
  assert.equal(signalFrom({ overall: 'down' }), 'down');
  assert.equal(signalFrom({ overall: 'degraded' }), 'degraded');
  assert.equal(signalFrom({ overall: 'operational' }), null);
  assert.equal(signalFrom(null), null);
});

test('a Ploeg whose version does not match puts a banner on every page that names both versions and says managed actions are paused', () => {
  const message = 'Unfold 0.4.0 requires Ploeg contract operator-api v1, but this Ploeg (0.3.0) serves operator-api v2. Run the Ploeg this Unfold release carries or the minor before it, or upgrade Unfold.';
  const contract = contractFrom({ overall: 'down', ploegContract: { state: 'incompatible', unfold: '0.4.0', ploeg: '0.3.0', missing: [{ contract: 'operator-api', version: 1 }], message } });
  assert.deepEqual(contract, { state: 'incompatible', message });
  const banner = contractBanner(contract);
  assert.match(banner, /class="callout" data-tone="danger"/);
  assert.match(banner, /Ploeg’s version doesn’t match this Unfold/);
  assert.match(banner, /Managed actions are paused: Unfold sends nothing to Ploeg until the versions match\. Your sessions and Unfold’s own pages keep working\./);
  assert.match(banner, /requires Ploeg contract operator-api v1, but this Ploeg \(0\.3\.0\) serves operator-api v2/);
  assert.match(banner, /href="#status"/);
  assert.match(contractBanner({ message: '<img src=x onerror=alert(1)>' }), /&lt;img/, 'the server sentence is escaped');
});

test('no banner while Ploeg is compatible, unchecked or not connected', () => {
  for (const report of [{ overall: 'operational', ploegContract: { state: 'compatible', ploeg: '0.3.0' } }, { overall: 'operational', ploegContract: { state: 'unchecked' } }, { overall: 'operational' }, null]) {
    assert.equal(contractFrom(report), null);
    assert.equal(contractBanner(contractFrom(report)), '');
  }
});

test('every page the shell draws carries the banner above its content while Ploeg does not match, and none once it does', async () => {
  globalThis.document ??= { title: '' };
  const { state } = await import('../public/core/state.js');
  const { shell } = await import('../public/shell.js');
  state.bootstrap = { mode: 'live', version: '0.4.0', user: { id: 'admin', name: 'admin', role: 'admin' } };
  state.ploegContract = { state: 'incompatible', message: 'Unfold 0.4.0 requires Ploeg contract operator-api v1, but this Ploeg (0.3.0) serves operator-api v2.' };
  const page = shell('<p>Own data</p>', { title: 'Sessions' });
  const banner = page.indexOf('class="app-contract-banner"');
  assert(banner > 0 && banner < page.indexOf('<main id="main"'), 'the banner sits outside the page content, on every page');
  const shown = page.slice(banner, page.indexOf('<main id="main"'));
  assert.match(shown, /^class="app-contract-banner" data-ploeg-contract="[^"]+" role="status" aria-live="polite" >/, 'shown, not hidden');
  assert.match(shown, /Ploeg’s version doesn’t match this Unfold/);
  state.ploegContract = null;
  const clear = shell('<p>Own data</p>', { title: 'Sessions' });
  assert.match(clear, /class="app-contract-banner" data-ploeg-contract="" role="status" aria-live="polite" hidden><\/div>/);
  state.bootstrap = null;
});

test('the Status page tells a person in plain words when Ploeg cannot check that their actions are theirs', () => {
  assert.equal(proofMarkup({}), '', 'nothing without person tokens configured');
  assert.equal(proofMarkup({ personProof: { state: 'proven', summary: 'Ploeg records what you do here as proven by your sign-in.' } }), '');
  const line = proofMarkup({ personProof: { state: 'degraded', summary: 'Your sign-in’s proof ran out, so Ploeg records your actions as named by Unfold, not proven. Sign out and sign in again to restore it.' } });
  assert.match(line, /data-tone="attention"/);
  assert.match(line, /Ploeg cannot check that your actions are yours/);
  assert.match(line, /Sign out and sign in again/);
});

const places = [
  { id: 'unfold', title: 'Unfold', where: 'The machine or cluster that runs this workbench', region: null, detail: 'Unfold’s configuration names no region and Unfold reads no node labels, so the region is unknown.' },
  { id: 'ploeg', title: 'Ploeg', where: 'The connected Ploeg API', region: null },
  { id: 'workspaces', title: 'Agent workspaces', where: 'Kubernetes pods', region: null },
];
const windowOf = (id, extra = {}) => ({ id, since: '2026-10-28T12:00:00.000Z', requests: 0, providers: [], regions: [], unreported: { provider: 0, region: 0 }, outside: 0, ...extra });

test('Where your data goes names the policy, counts what answered per window and links each request outside it', () => {
  const line = residencyMarkup({ residency: {
    state: 'degraded', summary: 'One request in the last 7 days went to a provider or region outside the policy.',
    policy: { providers: ['anthropic'], regions: ['eu'], enforcedBy: 'unfold' },
    windows: [windowOf('24h', { requests: 3, providers: [{ name: 'anthropic', requests: 2, allowed: true }, { name: 'openai', requests: 1, allowed: false }], regions: [{ name: 'eu', requests: 2, allowed: true }], unreported: { provider: 0, region: 1 }, outside: 1 }), windowOf('7d', { requests: 3, outside: 1 })],
    outside: [{ at: '2026-10-29T11:00:00.000Z', model: 'coding', provider: 'openai', region: 'us', reason: 'provider openai, region us', session: { id: 's1', title: 'Fix login' }, run: { id: 'r1', roleName: 'Writer' }, workItemId: '245' }, { at: '2026-10-28T11:00:00.000Z', model: 'coding', provider: 'openai', region: null, reason: 'provider openai' }],
    outsideHidden: 2, places,
  } });
  assert.match(line, /Where your data goes/);
  assert.match(line, /data-state="degraded"/);
  assert.match(line, /data-tone="danger"[^>]*>Outside the policy/);
  assert.match(line, /<dt>Allowed providers<\/dt><dd>anthropic<\/dd>/);
  assert.match(line, /openai 1 <strong>outside<\/strong>/);
  assert.match(line, /1 not reported/);
  assert.match(line, /coding answered by provider openai, region us/);
  assert.match(line, /href="#session\/s1">Fix login<\/a>/);
  assert.match(line, /Run Writer/);
  assert.match(line, /href="#work\/245">Work Item #245<\/a>/);
  assert.match(line, /Another person’s session/);
  assert.match(line, /2 older requests outside the policy not listed/);
  assert.match(line, /reads no node labels, so the region is unknown/);
  assert.equal((line.match(/>Unknown</g) ?? []).length, 3);
});

test('Where your data goes says when the gateway owns the policy and Unfold cannot see requests, and the demo shows none', () => {
  const managed = residencyMarkup({ residency: { state: 'unknown', summary: 'Unfold does not read the gateway’s request log here.', policy: { providers: null, regions: null, enforcedBy: 'gateway' }, windows: [windowOf('24h'), windowOf('7d')], outside: [], outsideHidden: 0, places } });
  assert.match(managed, /Set in the gateway’s own policy/);
  assert.match(managed, /data-tone="neutral"[^>]*>Unknown/);
  const demo = residencyMarkup({ residency: { state: 'not_used', summary: 'This is a demo. It makes no model calls, so no request leaves this machine and none is shown.', policy: { providers: null, regions: null, enforcedBy: 'none' }, windows: [], outside: [], outsideHidden: 0, places } });
  assert.match(demo, /This is a demo\./);
  assert.match(demo, />Demo</);
  assert.doesNotMatch(demo, /Providers and regions that answered/);
  assert.doesNotMatch(demo, /answered by/);
  assert.equal(residencyMarkup({}), '');
});
