import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentsWindowAvailable, agentsWindowButton, agentsWindowDialogMarkup } from '../public/agents-window.js';
import { detailMarkup } from '../public/ploeg.js';
import { ploegDemo } from '../src/ploeg-demo.ts';

const link = attached => ({
  session: 'ahp-session:/s1', attached, address: 'wss://unfold.example', connectionAuthority: 'hex-77',
  links: { stable: 'vscode://agents/agent-host-session/ahp-session/s1?connectionAuthority=hex-77', insiders: 'vscode-insiders://agents/agent-host-session/ahp-session/s1?connectionAuthority=hex-77' },
});

test('the Agents window action is offered to people who can attach an agent host, never to a viewer', () => {
  assert.equal(agentsWindowAvailable({ agentHost: true, user: { id: 'u1', role: 'operator' } }), true);
  assert.equal(agentsWindowAvailable({ agentHost: true, user: { id: 'u1', role: 'viewer' } }), false);
  assert.equal(agentsWindowAvailable({ agentHost: false, user: { id: 'u1', role: 'admin' } }), false);
  assert.equal(agentsWindowAvailable(null), false);
  assert.match(agentsWindowButton('sessions', 's1'), /data-action="session-agents-window" data-kind="sessions" data-id="s1">.*Open in Agents window/);
});

test('with an Agents window attached the dialog opens the session in Stable or Insiders', () => {
  const markup = agentsWindowDialogMarkup({ kind: 'sessions', title: 'Fix <rounding>', link: link(true) }, { origin: 'https://unfold.example' });
  assert.match(markup, /<h2 id="confirm-title">Open in Agents window<\/h2>/);
  assert.match(markup, /Fix &lt;rounding&gt;/);
  assert.match(markup, /<a class="button primary" href="vscode:\/\/agents\/agent-host-session\/ahp-session\/s1\?connectionAuthority=hex-77">/);
  assert.match(markup, /href="vscode-insiders:\/\/agents\/agent-host-session\/ahp-session\/s1\?connectionAuthority=hex-77"/);
  assert.match(markup, /Needs VS Code 1\.142 or later/);
  assert.doesNotMatch(markup, /connect-agents-window/, 'nothing to connect when a window is attached');
});

test('without an attached Agents window the dialog explains it and links to the connect flow first', () => {
  const markup = agentsWindowDialogMarkup({ kind: 'work-items', title: 'Work Item 205', link: link(false) }, { origin: 'https://unfold.example' });
  assert.match(markup, /No Agents window of yours is attached right now/);
  assert.match(markup, /href="vscode:\/\/webgrip\.unfold\/connect-agents-window\?origin=https%3A%2F%2Funfold\.example"/);
  assert.match(markup, /href="#settings\/editors"/);
  assert.match(markup, /<a class="button secondary" href="vscode:\/\/agents\//, 'the link stays available, but is no longer the primary action');
  assert.match(markup, /Opens this Work Item in VS Code/);
});

test('a refusal says why and shows no link', () => {
  const missing = agentsWindowDialogMarkup({ kind: 'sessions', error: Object.assign(new Error('Session not found.'), { status: 404, code: 'not_found' }) });
  assert.match(missing, /This session is not in your Agents window/);
  const viewer = agentsWindowDialogMarkup({ kind: 'sessions', error: Object.assign(new Error('Viewers cannot connect an agent host.'), { status: 403, code: 'forbidden' }) });
  assert.match(viewer, /Your account cannot open the Agents window/);
  const hidden = agentsWindowDialogMarkup({ kind: 'work-items', error: Object.assign(new Error('No'), { status: 404, code: 'not_found' }) });
  assert.match(hidden, /This Work Item has no session in your Agents window/);
  const broken = agentsWindowDialogMarkup({ kind: 'sessions', link: { links: { stable: '', insiders: '' }, attached: true } });
  assert.match(broken, /The link could not be built/);
  for (const markup of [missing, viewer, hidden, broken]) assert.doesNotMatch(markup, /agent-host-session/);
  assert.match(agentsWindowDialogMarkup({ kind: 'sessions', loading: true }), /aria-busy="true"/);
});

test('the Work Item page offers the Agents window only when the person can attach one, and never in the demo', () => {
  const live = structuredClone(ploegDemo.details['102']);
  live.demo = false;
  const model = extra => ({ lane: 'needs_human', team: '', detailId: '102', listHref: '#work', canCancel: true, sessions: [], userId: 'u1', now: Date.now(), ...extra });
  assert.match(detailMarkup(live, model({ agentsWindow: true })), /data-action="work-agents-window" data-kind="work-items" data-id="102"/);
  assert.doesNotMatch(detailMarkup(live, model({ agentsWindow: false })), /work-agents-window/);
  assert.doesNotMatch(detailMarkup({ ...live, demo: true }, model({ agentsWindow: true })), /work-agents-window/);
});
