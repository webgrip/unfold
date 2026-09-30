import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLive, heartbeat, live, maxBackoff } from '../public/core/live.js';
import '../public/views/index.js';

function fakeEnvironment() {
  const env = {
    clock: 0,
    timers: [],
    nextId: 1,
    visibleNow: true,
    signed: true,
    dialog: false,
    view: 'activity',
    pausedNow: false,
    now: () => env.clock,
    setTimeout: (callback, ms) => { const id = env.nextId++; env.timers.push({ id, at: env.clock + ms, callback }); return id; },
    clearTimeout: id => { env.timers = env.timers.filter(timer => timer.id !== id); },
    visible: () => env.visibleNow,
    signedIn: () => env.signed,
    blocked: () => env.dialog,
    currentView: () => env.view,
    paused: () => env.pausedNow,
    setPaused: value => { env.pausedNow = value; },
  };
  env.advance = async ms => {
    const end = env.clock + ms;
    for (;;) {
      env.timers.sort((a, b) => a.at - b.at);
      const next = env.timers[0];
      if (!next || next.at > end) break;
      env.timers.shift();
      env.clock = next.at;
      next.callback();
      for (let index = 0; index < 5; index++) await Promise.resolve();
    }
    env.clock = end;
  };
  return env;
}

test('one timer runs a view’s refresh on its interval while that view is current', async () => {
  const env = fakeEnvironment();
  const scheduler = createLive(env);
  const calls = [];
  scheduler.register('activity', { interval: 15000, refresh: async () => { calls.push(env.clock); } });
  scheduler.register('runs', { interval: 30000, refresh: async () => { calls.push(`runs@${env.clock}`); } });
  scheduler.start();
  assert.equal(env.timers.length, 1, 'one timer serves every job');
  await env.advance(46000);
  assert.deepEqual(calls, [15000, 30000, 45000]);
  assert.equal(scheduler.lastUpdated, 45000);
  env.view = 'runs';
  scheduler.wake();
  await env.advance(30000);
  assert.deepEqual(calls.slice(3), ['runs@46000', 'runs@76000'], 'an overdue job runs when its view becomes current');
  assert.deepEqual(scheduler.jobs, ['activity', 'runs']);
  assert(env.timers.length <= 1);
});

test('a hidden job keeps a global refresh going in a background tab, and a refresh that read nothing neither backs off nor claims an update', async () => {
  const env = fakeEnvironment();
  const scheduler = createLive(env);
  const calls = [];
  scheduler.register('counts', { interval: 60000, scope: 'global', hidden: true, refresh: async () => { calls.push(`counts@${env.clock}`); } });
  scheduler.register('activity', { interval: 15000, refresh: async () => { calls.push(`activity@${env.clock}`); return false; } });
  scheduler.start();
  env.visibleNow = false;
  scheduler.wake();
  await env.advance(61000);
  assert.deepEqual(calls, ['counts@60000'], 'only the hidden job runs while the tab is hidden');
  env.visibleNow = true;
  scheduler.wake();
  await env.advance(heartbeat);
  assert.deepEqual(calls.slice(1), ['activity@61000']);
  assert.equal(scheduler.lastUpdated, null, 'a refresh that resolved false is not an update');
  await env.advance(15000);
  assert.deepEqual(calls.slice(2), ['activity@76000'], 'nor a failure: the next run keeps the plain interval');
  scheduler.toggle();
  env.visibleNow = false;
  scheduler.wake();
  await env.advance(120000);
  assert.equal(calls.length, 3, 'pausing live updates also stops the hidden job');
});

test('nothing refreshes while the tab is hidden, a dialog is open, nobody is signed in or live updates are paused', async () => {
  for (const block of ['hidden', 'dialog', 'signedOut', 'paused']) {
    const env = fakeEnvironment();
    const scheduler = createLive(env);
    let calls = 0;
    scheduler.register('activity', { interval: 15000, refresh: async () => { calls++; } });
    scheduler.start();
    if (block === 'hidden') { env.visibleNow = false; scheduler.wake(); }
    if (block === 'dialog') env.dialog = true;
    if (block === 'signedOut') env.signed = false;
    if (block === 'paused') assert.equal(scheduler.toggle(), true);
    await env.advance(60000);
    assert.equal(calls, 0, block);
    if (block === 'hidden') { assert.equal(env.timers.length, 0, 'a hidden tab keeps no timer'); env.visibleNow = true; scheduler.wake(); }
    if (block === 'dialog') env.dialog = false;
    if (block === 'signedOut') env.signed = true;
    if (block === 'paused') { assert.equal(scheduler.toggle(), false); assert.equal(scheduler.paused, false); }
    await env.advance(heartbeat);
    assert.equal(calls, 1, `${block}: the overdue refresh runs once the block is gone`);
  }
});

test('a failing refresh backs off exponentially up to five minutes and recovers on success', async () => {
  const env = fakeEnvironment();
  const scheduler = createLive(env);
  const attempts = [];
  let failing = true;
  scheduler.register('activity', { interval: 15000, refresh: async () => { attempts.push(env.clock); if (failing) throw new Error('Ploeg unreachable'); } });
  scheduler.start();
  await env.advance(15000 + 30000 + 60000 + 120000 + 240000 + 300000 + 1);
  assert.deepEqual(attempts, [15000, 45000, 105000, 225000, 465000, 765000]);
  assert.equal(scheduler.lastUpdated, null);
  failing = false;
  await env.advance(maxBackoff);
  assert.equal(attempts.at(-1), 1065000);
  assert.equal(scheduler.lastUpdated, 1065000);
  await env.advance(15000);
  assert.equal(attempts.at(-1), 1080000, 'after a success the interval is back to normal');
});

test('a global job runs on every view, touch restarts the current view’s interval, and subscribers hear every change', async () => {
  const env = fakeEnvironment();
  env.view = 'sessions';
  const scheduler = createLive(env);
  const calls = [];
  let heard = 0;
  const unsubscribe = scheduler.subscribe(() => { heard++; });
  scheduler.register('counts', { interval: 60000, scope: 'global', refresh: async () => { calls.push(`counts@${env.clock}`); } });
  scheduler.register('now', { interval: 30000, refresh: async () => { calls.push(`now@${env.clock}`); } });
  scheduler.start();
  await env.advance(60000);
  assert.deepEqual(calls, ['counts@60000']);
  env.view = 'now';
  scheduler.touch();
  assert.equal(scheduler.lastUpdated, 60000);
  await env.advance(29999);
  assert.deepEqual(calls, ['counts@60000'], 'touch pushed the Now refresh a full interval out');
  await env.advance(1);
  assert.deepEqual(calls, ['counts@60000', 'now@90000']);
  assert(heard > 0);
  unsubscribe();
  const before = heard;
  scheduler.touch();
  assert.equal(heard, before);
  scheduler.unregister('now');
  scheduler.stop();
  assert.equal(env.timers.length, 0, 'a stopped scheduler keeps no timer');
  assert.throws(() => scheduler.register('bad', { interval: 0, refresh: () => {} }), /positive interval/);
  assert.throws(() => scheduler.register('bad', { interval: 10 }), /refresh function/);
});

test('a global job never moves lastUpdated, on a view with no job of its own either', async () => {
  const env = fakeEnvironment();
  env.view = 'work';
  const scheduler = createLive(env);
  let counts = 0;
  scheduler.register('counts', { interval: 60000, scope: 'global', refresh: async () => { counts++; } });
  scheduler.start();
  await env.advance(60000);
  assert.equal(counts, 1);
  assert.equal(scheduler.lastUpdated, null, 'refreshing the nav counts does not make the Work list fresh');
  env.clock = 61000;
  scheduler.touch();
  await env.advance(125000);
  assert.equal(counts, 3);
  assert.equal(scheduler.lastUpdated, 61000, 'the strip keeps the time of the last Work load while counts refresh');
  let failing = 0;
  scheduler.register('counts', { interval: 60000, scope: 'global', refresh: async () => { failing++; throw new Error('Ploeg unreachable'); } });
  await env.advance(60000);
  assert.equal(failing, 1);
  assert.equal(scheduler.lastUpdated, 61000);
});

test('switching views clears lastUpdated until the new view records a load', async () => {
  const env = fakeEnvironment();
  const scheduler = createLive(env);
  scheduler.register('activity', { interval: 15000, refresh: async () => {} });
  scheduler.start();
  await env.advance(15000);
  assert.equal(scheduler.lastUpdated, 15000, 'a view job’s refresh counts for its own view');
  env.view = 'tasks';
  scheduler.wake();
  assert.equal(scheduler.lastUpdated, null, 'Tasks never recorded a load');
  await env.advance(60000);
  assert.equal(scheduler.lastUpdated, null, 'the Activity job does not run while Tasks is current');
  env.view = 'work';
  assert.equal(scheduler.lastUpdated, null);
  env.clock = 80000;
  scheduler.touch();
  assert.equal(scheduler.lastUpdated, 80000);
  env.view = 'settings-preferences';
  assert.equal(scheduler.lastUpdated, null);
  env.view = 'work';
  assert.equal(scheduler.lastUpdated, 80000, 'the last recorded load still belongs to Work');
});

test('touch records the load for the view that names itself, even after the user moved on', () => {
  const env = fakeEnvironment();
  env.view = 'tasks';
  const scheduler = createLive(env);
  env.clock = 5000;
  scheduler.touch('now');
  assert.equal(scheduler.lastUpdated, null, 'a Now load that finishes on Tasks does not make Tasks fresh');
  env.view = 'now';
  assert.equal(scheduler.lastUpdated, 5000);
});

test('the page scheduler is created without touching the DOM and is not running in Node', () => {
  assert.equal(typeof live.register, 'function');
  assert(live.jobs.includes('activity'), 'importing the views registers the Activity poll');
});
