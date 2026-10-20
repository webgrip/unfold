import assert from 'node:assert/strict';
import { test } from 'node:test';
import { followEventStream, maxReopenDelay, reopenDelay } from '../public/core/event-stream.js';

function fakeBrowser({ random = () => 1 } = {}) {
  const browser = { sources: [], timers: [], nextId: 1, random };
  class FakeEventSource {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    constructor(url) { this.url = url; this.readyState = 0; this.closedByPage = false; browser.sources.push(this); }
    open() { this.readyState = 1; this.onopen?.(); }
    send(id) { this.onmessage?.({ data: JSON.stringify({ id }), lastEventId: String(id) }); }
    drop() { this.readyState = 0; this.onerror?.(); }
    refuse() { this.readyState = 2; this.onerror?.(); }
    close() { this.readyState = 2; this.closedByPage = true; }
  }
  browser.EventSource = FakeEventSource;
  browser.setTimeout = (callback, ms) => { const id = browser.nextId++; browser.timers.push({ id, ms, callback }); return id; };
  browser.clearTimeout = id => { browser.timers = browser.timers.filter(timer => timer.id !== id); };
  browser.fire = () => { const timer = browser.timers.shift(); timer.callback(); return timer.ms; };
  return browser;
}

const url = after => `/api/sessions/s1/events?after=${after}`;

test('a stream the browser closed for good is reopened from the last event it delivered', () => {
  const browser = fakeBrowser();
  const seen = [];
  const states = [];
  const stream = followEventStream(url, 4, { open: () => states.push('online'), offline: () => states.push('offline'), message: event => seen.push(JSON.parse(event.data).id) }, browser);
  assert.equal(browser.sources[0].url, url(4));
  browser.sources[0].open();
  browser.sources[0].send(5);
  browser.sources[0].send(6);
  browser.sources[0].drop();
  assert.equal(browser.timers.length, 0, 'while the browser reconnects by itself nothing else is scheduled');
  browser.sources[0].refuse();
  assert.deepEqual(states, ['online', 'offline', 'offline']);
  assert.equal(browser.timers.length, 1);
  assert.equal(browser.fire(), reopenDelay);
  assert.equal(browser.sources.length, 2);
  assert.equal(browser.sources[1].url, url(6), 'the new stream resumes after the last event seen, not the first cursor');
  browser.sources[1].open();
  browser.sources[1].send(7);
  assert.deepEqual(seen, [5, 6, 7]);
  assert.equal(stream.after, 7);
  assert.deepEqual(states.slice(3), ['online']);
});

test('reopening backs off with jitter up to thirty seconds and starts over after a stream opens', () => {
  const browser = fakeBrowser({ random: () => 0 });
  followEventStream(url, 0, { message: () => {} }, browser);
  const waits = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    browser.sources.at(-1).refuse();
    waits.push(browser.fire());
  }
  assert.deepEqual(waits, [500, 1000, 2000, 4000, 8000, 15000, 15000, 15000], 'the lowest jitter halves each wait');
  const high = fakeBrowser({ random: () => 1 });
  followEventStream(url, 0, { message: () => {} }, high);
  const longest = [];
  for (let attempt = 0; attempt < 8; attempt++) { high.sources.at(-1).refuse(); longest.push(high.fire()); }
  assert.equal(Math.max(...longest), maxReopenDelay, 'no wait exceeds the bound');
  high.sources.at(-1).open();
  high.sources.at(-1).refuse();
  assert.equal(high.fire(), reopenDelay, 'a stream that opened resets the backoff');
});

test('closing the stream when the view is left stops every reconnect', () => {
  const browser = fakeBrowser();
  const stream = followEventStream(url, 0, { message: () => {} }, browser);
  browser.sources[0].refuse();
  assert.equal(browser.timers.length, 1);
  stream.close();
  assert.equal(browser.timers.length, 0, 'the pending reopen is cancelled');
  const quiet = fakeBrowser();
  const left = followEventStream(url, 0, { message: () => {} }, quiet);
  const source = quiet.sources[0];
  left.close();
  assert.equal(source.closedByPage, true);
  source.onerror?.();
  assert.equal(quiet.timers.length, 0, 'a late error from the closed stream schedules nothing');
  assert.equal(quiet.sources.length, 1);
});
