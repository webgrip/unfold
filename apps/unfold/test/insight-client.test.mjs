import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInsightQueue, linkOutTarget, maxBatch, screenFields } from '../public/core/insight.js';
import { insightCatalogue } from '../src/insight.ts';

const origin = 'https://unfold.example';

test('a followed link is named by what it leads to, and a link inside Unfold or to an unknown site is not recorded', () => {
  assert.equal(linkOutTarget('https://forgejo.webgrip.dev/webgrip/unfold/pulls/249', origin), 'pr');
  assert.equal(linkOutTarget('https://github.com/ploeg-hq/ploeg/pull/12/files', origin), 'pr');
  assert.equal(linkOutTarget('https://gitlab.example/group/app/-/merge_requests/7', origin), 'pr');
  assert.equal(linkOutTarget('https://vikunja.webgrip.dev/tasks/1896', origin), 'tracker');
  assert.equal(linkOutTarget('https://app.clickup.com/t/86c1abc', origin), 'tracker');
  assert.equal(linkOutTarget('https://forgejo.webgrip.dev/webgrip/unfold/issues/12', origin), 'tracker');
  assert.equal(linkOutTarget('https://forgejo.webgrip.dev/webgrip/unfold/commit/0ae6ee51', origin), 'forge');
  assert.equal(linkOutTarget('https://docs.webgrip.dev/unfold/', origin), 'docs');
  assert.equal(linkOutTarget('#work/12', origin), null);
  assert.equal(linkOutTarget(`${origin}/#now`, origin), null);
  assert.equal(linkOutTarget('https://grafana.example/d/abc', origin), null);
  assert.equal(linkOutTarget('mailto:someone@example.test', origin), null);
});

test('screen.viewed carries the view and the Work Item id only when the path names one that fits a safe integer', () => {
  assert.deepEqual(screenFields('now', 'now'), { screen: 'now' });
  assert.deepEqual(screenFields('work', 'work/42'), { screen: 'work', workItemId: 42 });
  assert.deepEqual(screenFields('work', 'work/12345678901234567'), { screen: 'work' });
});

test('the queue records nothing until it is switched on, and switching it off drops what was waiting', () => {
  const sent = [];
  const queue = createInsightQueue({ send: batch => sent.push(batch), now: () => '2026-10-06T08:00:00.000Z', session: 'tab-1' });
  queue.track('screen.viewed', { screen: 'now' });
  queue.flush();
  assert.deepEqual(sent, []);
  queue.configure(true);
  queue.track('screen.viewed', { screen: 'work', workItemId: 7 });
  queue.track('link_out.opened', { screen: 'work', props: { target: 'pr' } });
  queue.flush();
  assert.deepEqual(sent, [[
    { name: 'screen.viewed', at: '2026-10-06T08:00:00.000Z', session: 'tab-1', screen: 'work', workItemId: 7 },
    { name: 'link_out.opened', at: '2026-10-06T08:00:00.000Z', session: 'tab-1', screen: 'work', props: { target: 'pr' } },
  ]]);
  queue.track('screen.viewed', { screen: 'now' });
  queue.configure(false);
  queue.flush();
  assert.equal(sent.length, 1);
});

test('a full batch is sent at once and never holds more than the route accepts', () => {
  const sent = [];
  const queue = createInsightQueue({ send: batch => sent.push(batch), session: 'tab-2' });
  queue.configure(true);
  for (let index = 0; index < maxBatch + 3; index++) queue.track('screen.viewed', { screen: 'now' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].length, maxBatch);
  assert.equal(queue.size(), 3);
});

test('every event the browser emits is in the server catalogue', () => {
  for (const name of ['screen.viewed', 'link_out.opened']) assert(Object.hasOwn(insightCatalogue, name), name);
  assert.deepEqual(insightCatalogue['link_out.opened'], ['target']);
});
