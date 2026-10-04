import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyNowCounts, countsFromNow, onCountsChange, ploegStatusFrom, refreshCounts, sessionsNeedingYou, unknownCounts } from '../public/core/counts.js';
import { state, forgetUserData, onForget } from '../public/core/state.js';
import { documentTitle } from '../public/shell.js';
import { rememberReturnHash, takeReturnHash } from '../public/views/login.js';

const now = (extra = {}) => ({
  demo: false, teams: ['delivery'], fetchedAt: '2026-09-30T10:00:00Z', errors: {},
  waiting: [{ id: '1', state: 'awaiting_review' }, { id: '2', state: 'needs_human' }, { id: '3', state: 'needs_human' }, { id: '4', state: 'proposed' }],
  running: [{ id: '9' }], recent: [],
  ...extra,
});

test('the navigation counts come from the Now aggregate, and a failed group counts as unknown, never zero', () => {
  assert.deepEqual(countsFromNow(now()), { waiting: 4, review: 1, needsYou: 2, proposed: 1, running: 1 });
  assert.deepEqual(countsFromNow(now({ waiting: [], running: [] })), { waiting: 0, review: 0, needsYou: 0, proposed: 0, running: 0 });
  assert.deepEqual(countsFromNow(now({ errors: { waiting: 'Ploeg could not be read.' } })), { waiting: null, review: null, needsYou: null, proposed: null, running: 1 });
  assert.deepEqual(countsFromNow(now({ errors: { running: 'no' } })).running, null);
  assert.deepEqual(countsFromNow(null), { waiting: null, review: null, needsYou: null, proposed: null, running: null });
  assert.deepEqual(Object.values(unknownCounts), [null, null, null, null, null, null]);
});

test('sessions that need you are the ones waiting for input, failed, interrupted or completed without a review', () => {
  const sessions = [{ status: 'waiting_input' }, { status: 'failed' }, { status: 'interrupted' }, { status: 'completed' }, { status: 'completed', review: { decision: 'accepted' } }, { status: 'running' }, { status: 'queued' }];
  assert.equal(sessionsNeedingYou(sessions), 4);
  assert.equal(sessionsNeedingYou([]), 0);
  assert.equal(sessionsNeedingYou(undefined), null);
});

test('the Ploeg connection state reads the Now answer or its error', () => {
  assert.equal(ploegStatusFrom(now()), 'connected');
  assert.equal(ploegStatusFrom(now({ demo: true })), 'demo');
  assert.equal(ploegStatusFrom(now({ errors: { waiting: 'x' } })), 'partial');
  assert.equal(ploegStatusFrom(now({ errors: { waiting: 'x', running: 'y', recent: 'z' } })), 'unavailable');
  assert.equal(ploegStatusFrom(null, { code: 'ploeg_unconfigured' }), 'unconfigured');
  assert.equal(ploegStatusFrom(null, { code: 'ploeg_scope' }), 'no-access');
  assert.equal(ploegStatusFrom(null, { code: 'ploeg_unavailable' }), 'unavailable');
  assert.equal(ploegStatusFrom(null, new Error('network')), 'unavailable');
  assert.equal(ploegStatusFrom(null), null);
});

test('applying a Now answer stores the counts and the status and tells the listeners', () => {
  const saved = { counts: state.counts, ploegStatus: state.ploegStatus, sessions: state.sessions };
  let heard = 0;
  const stop = onCountsChange(() => { heard++; });
  try {
    state.sessions = [{ status: 'failed' }];
    applyNowCounts(now());
    assert.deepEqual(state.counts, { waiting: 4, review: 1, needsYou: 2, proposed: 1, running: 1, sessions: 1 });
    assert.equal(state.ploegStatus, 'connected');
    applyNowCounts(null, { code: 'ploeg_unavailable' });
    assert.deepEqual(state.counts, { ...unknownCounts, sessions: 1 });
    assert.equal(state.ploegStatus, 'unavailable');
    assert.equal(heard, 2);
  } finally { stop(); Object.assign(state, saved); }
});

test('the document title leads with what waits on you and leaves out zero or unknown', () => {
  assert.equal(documentTitle('Work', 3), '(3) Work · Unfold');
  assert.equal(documentTitle('Work', 0), 'Work · Unfold');
  assert.equal(documentTitle('Work', null), 'Work · Unfold');
});

test('single sign-on keeps the deep link across the round trip, and a bad stored value is ignored', () => {
  const store = new Map();
  const saved = { location: globalThis.location, sessionStorage: globalThis.sessionStorage };
  globalThis.sessionStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  try {
    globalThis.location = { hash: '#work/28' };
    rememberReturnHash();
    assert.equal(takeReturnHash(), '#work/28');
    assert.equal(takeReturnHash(), '', 'the deep link is used once');
    globalThis.location = { hash: '#now' };
    rememberReturnHash();
    assert.equal(takeReturnHash(), '');
    store.set('unfold.returnTo', 'javascript:alert(1)');
    assert.equal(takeReturnHash(), '');
    store.set('unfold.returnTo', '#work"><img');
    assert.equal(takeReturnHash(), '');
    globalThis.sessionStorage = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); }, removeItem: () => {} };
    globalThis.location = { hash: '#runs' };
    assert.doesNotThrow(() => rememberReturnHash());
    assert.equal(takeReturnHash(), '');
  } finally { globalThis.location = saved.location; globalThis.sessionStorage = saved.sessionStorage; }
});

test('signing out forgets the person in place, makes reads in flight stale and resets what views keep themselves', () => {
  const now = state.now;
  Object.assign(state.now, { data: { waiting: [{ id: '901', title: 'SECRET' }] }, error: null, request: 3, summaryRequest: 2, summary: { data: { totals: {} }, error: null }, shown: { waiting: new Set(['901']), recent: new Set() }, since: '2026-09-30T08:00:00Z', caughtUp: true });
  Object.assign(state, { links: [{ provider: 'gitlab', linked: true }], models: [{ id: 'm' }], delivery: { candidate: {} }, deliveryError: 'x', ploegLane: 'needs_human' });
  const epoch = state.epoch;
  let resets = 0;
  const off = onForget(() => { resets++; });
  forgetUserData();
  off();
  assert.equal(state.now, now, 'the Now view keeps reading the same object');
  assert.deepEqual([state.now.data, state.now.error, state.now.shown, state.now.since, state.now.caughtUp, state.now.summary.data], [null, null, null, undefined, false, null]);
  assert.equal(state.now.request, 4);
  assert.equal(state.now.summaryRequest, 3);
  assert.deepEqual([state.links, state.models, state.delivery, state.deliveryError, state.ploegLane], [null, null, null, '', null]);
  assert.equal(state.epoch, epoch + 1);
  assert.equal(resets, 1);
  forgetUserData();
  assert.equal(resets, 1, 'a removed reset is not called again');
});

test('a counts read that lands after sign-out leaves the counts unknown', async () => {
  const saved = { fetch: globalThis.fetch, bootstrap: state.bootstrap, view: state.view };
  let answer;
  globalThis.fetch = () => new Promise(done => { answer = done; });
  try {
    state.bootstrap = { mode: 'live', user: { id: 'a' } };
    state.view = 'runs';
    applyNowCounts(null);
    const pending = refreshCounts();
    forgetUserData();
    answer({ ok: true, status: 200, json: async () => now() });
    await pending;
    assert.equal(state.counts.waiting, null, 'the previous person\u2019s count came back');
  } finally { Object.assign(globalThis, { fetch: saved.fetch }); state.bootstrap = saved.bootstrap; state.view = saved.view; }
});
