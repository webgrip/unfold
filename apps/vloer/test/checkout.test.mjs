import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkoutCommand, checkoutLink, checkoutTarget, checkoutableBranch, workItemBranch } from '../public/core/checkout.js';

const item = (extra = {}) => ({ id: '50', target: { forge: 'forgejo', owner: 'acme', repo: 'shop', baseBranch: 'main' }, latestShift: null, ...extra });

test('a Work Item’s branch is the latest Shift’s, then the newest checkpoint’s, then its newest open pull request’s', () => {
  assert.equal(workItemBranch({ item: item({ latestShift: { branch: 'agent/vik-50' } }), shifts: [{ id: '6', branch: 'agent/old' }], checkpoints: [{ id: '3', branch: 'agent/checkpoint' }] }), 'agent/vik-50');
  assert.equal(workItemBranch({ item: item(), shifts: [{ id: '6', branch: 'agent/six' }, { id: '7', branch: 'agent/seven' }], checkpoints: [] }), 'agent/seven', 'the newest Shift by id, whatever the order Ploeg sent');
  assert.equal(workItemBranch({ item: item(), shifts: [], checkpoints: [{ id: '2', branch: 'agent/two' }, { id: '3', branch: 'agent/three' }] }), 'agent/three');
  const card = { plays: [{ number: 9, state: 'merged', branch: 'agent/merged' }, { number: 8, state: 'open', branch: 'agent/open' }] };
  assert.equal(workItemBranch({ item: item(), shifts: [], checkpoints: [] }, card), 'agent/open', 'an open pull request wins over a newer merged one');
  assert.equal(workItemBranch({ item: item(), shifts: [], checkpoints: [] }), '');
  assert.equal(workItemBranch(null), '');
});

test('only branch names that need no quoting and cannot read as an option are offered', () => {
  for (const name of ['agent/vik-50', 'glide/42-explain', 'release_1.2', 'a']) assert.equal(checkoutableBranch(name), true, name);
  for (const name of ['', ' ', '-x', '--upload-pack=evil', 'a b', 'a;rm -rf ~', '$(id)', 'a`b`', 'a..b', 'a//b', '/a', 'a/', 'a.', 'a.lock', 'a/.hidden', 'HEAD', 'ä', 'x'.repeat(256), 42, null]) assert.equal(checkoutableBranch(name), false, String(name));
  assert.equal(workItemBranch({ item: item({ latestShift: { branch: 'a;rm -rf ~' } }), shifts: [], checkpoints: [{ id: '1', branch: 'agent/safe' }] }), 'agent/safe', 'an unsafe branch is skipped, not quoted');
});

test('the git command fetches, switches and fast-forwards, and refuses what it cannot write safely', () => {
  assert.equal(checkoutCommand('agent/vik-50'), 'git fetch origin agent/vik-50 && git switch agent/vik-50 && git merge --ff-only origin/agent/vik-50');
  assert.equal(checkoutCommand('agent/vik-50', 'forge'), 'git fetch forge agent/vik-50 && git switch agent/vik-50 && git merge --ff-only forge/agent/vik-50');
  assert.equal(checkoutCommand('$(id)'), '');
  assert.equal(checkoutCommand('agent/x', '-oops'), '');
});

test('the VS Code link carries only the Work Item id and the workbench it came from', () => {
  assert.equal(checkoutLink('50', 'https://vloer.example'), 'vscode://webgrip.de-vloer/checkout?workItem=50&origin=https%3A%2F%2Fvloer.example');
  assert.equal(checkoutLink('50'), 'vscode://webgrip.de-vloer/checkout?workItem=50');
  assert.equal(checkoutLink('0'), '');
  assert.equal(checkoutLink('50&x=1'), '');
});

test('there is nothing to check out in the demo, without a target repository or without a branch', () => {
  const live = { item: item({ latestShift: { branch: 'agent/vik-50' } }), shifts: [], checkpoints: [] };
  assert.deepEqual(checkoutTarget(live), { branch: 'agent/vik-50', owner: 'acme', repo: 'shop', baseBranch: 'main' });
  assert.equal(checkoutTarget({ ...live, demo: true }), null);
  assert.equal(checkoutTarget(live, { demo: true, plays: [] }), null);
  assert.equal(checkoutTarget({ ...live, item: { ...live.item, target: null } }), null);
  assert.equal(checkoutTarget({ ...live, item: { ...live.item, latestShift: null } }), null);
});
