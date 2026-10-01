import { findRoute, notePlaceholder, recordedRoutes, refusedRoutes, replayKey, staticDemoError } from './routes.js';

const storageKey = 'unfold.replay';
const minute = 60_000;
const isoTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/;
const calendarKeys = new Set(['period', 'quarter', 'quarters']);
const realFetch = globalThis.fetch.bind(globalThis);
const recording = realFetch(new URL('replay.json', import.meta.url)).then(response => {
  if (!response.ok) throw new Error(`The replay recording could not be loaded (HTTP ${response.status}).`);
  return response.json();
});

/**
 * The hosted replay shim's report. Loaded before `app.js` on the static `/demo` page only, the shim answers Vloer's API
 * from the recording in `replay.json`, so `fetch` and `EventSource` for `/api/` never leave the browser. The recorded
 * session plays one event per cadence step from the moment it is started, and its progress lives in sessionStorage.
 * The product never loads this file. `unmatched` lists requests the recording has no answer for and `refused` the
 * mutations it refused; the conformance check reads both.
 */
export const replayReport = { unmatched: [], refused: [], ready: recording.then(() => true) };
globalThis.__unfoldReplay = replayReport;

let memoryState = {};
function readState() {
  try { return JSON.parse(sessionStorage.getItem(storageKey) ?? '{}') ?? {}; } catch { return memoryState; }
}
function writeState(value) {
  memoryState = value;
  try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch {}
}

function shiftTimes(value, by, key = '') {
  if (calendarKeys.has(key)) return value;
  if (typeof value === 'string') {
    if (!isoTime.test(value)) return value;
    const moved = new Date(Date.parse(value) + by).toISOString();
    return value.includes('.') ? moved : moved.replace(/\.\d{3}Z$/, 'Z');
  }
  if (Array.isArray(value)) return value.map(item => shiftTimes(item, by));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, shiftTimes(item, by, name)]));
  return value;
}

function withNote(value, note) {
  if (typeof value === 'string') return value.split(notePlaceholder).join(note);
  if (Array.isArray(value)) return value.map(item => withNote(item, note));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, withNote(item, note)]));
  return value;
}

const viewShift = data => Math.floor(Date.now() / minute) * minute - Date.parse(data.anchor);
const sessionId = data => data.session.created.body.id;

function timeline(data, now = Date.now()) {
  const session = data.session;
  const state = readState();
  let count = 0;
  if (state.startedAt) count = Math.min(session.events.length, session.startIndex + 1 + Math.floor((now - state.startedAt) / data.cadenceMs));
  else if (state.createdAt) count = session.startIndex;
  const recordedStart = Date.parse(session.events[session.startIndex].at);
  const shift = state.startedAt ? state.startedAt - recordedStart : (state.createdAt ?? now) - Date.parse(session.events[0].at);
  const done = count === session.events.length;
  let events = session.events.slice(0, count).map(event => shiftTimes(event, shift));
  let snapshot = count ? shiftTimes(session.snapshots[count - 1], shift) : null;
  const branch = done && state.review ? session.reviews[state.review.branch] : null;
  if (branch) {
    const reviewShift = state.review.at - Date.parse(branch.events[0]?.at ?? session.events.at(-1).at);
    events = events.concat(withNote(shiftTimes(branch.events, reviewShift), state.review.note));
    if (branch.snapshots.length) snapshot = withNote(shiftTimes(branch.snapshots.at(-1), reviewShift), state.review.note);
  }
  return { state, events, snapshot, done, shift };
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

function refuse(key) {
  replayReport.refused.push(key);
  return json(409, { error: staticDemoError });
}

function unmatched(key) {
  replayReport.unmatched.push(key);
  console.warn(`[replay] no recorded answer for ${key}`);
  return json(404, { error: staticDemoError });
}

function readBody(body) {
  if (typeof body !== 'string' || !body) return {};
  try { return JSON.parse(body); } catch { return {}; }
}

function answerSession(data, method, url, body, key) {
  const id = sessionId(data);
  const path = url.pathname;
  const current = timeline(data);
  if (method === 'GET' && path === '/api/sessions') return json(200, current.snapshot ? [current.snapshot.session] : data.session.initialSessions);
  if (method === 'POST' && path === '/api/sessions') {
    if (current.state.createdAt || readBody(body).title !== data.session.title) return refuse(key);
    writeState({ createdAt: Date.now() });
    return json(data.session.created.status, shiftTimes(data.session.created.body, timeline(data).shift));
  }
  const match = /^\/api\/sessions\/([^/]+)(?:\/(.+))?$/.exec(path);
  if (!match) return null;
  if (match[1] !== id || !current.state.createdAt) return json(404, { error: { code: 'not_found', message: 'Session not found.' } });
  const action = match[2] ?? '';
  if (method === 'GET' && action === '') return json(200, current.snapshot.session);
  if (method === 'GET' && action === 'history') {
    const after = Math.max(0, Math.floor(Number(url.searchParams.get('after')) || 0));
    return json(200, current.events.filter(event => event.id > after));
  }
  if (method === 'GET' && action === 'permissions') return json(200, current.snapshot.permissions);
  if (method === 'POST' && action === 'start') {
    if (current.state.startedAt) return refuse(key);
    writeState({ ...current.state, startedAt: Date.now() });
    return json(data.session.started.status, shiftTimes(data.session.started.body, timeline(data).shift));
  }
  if (method === 'POST' && action === 'review') {
    if (!current.done || current.state.review) return refuse(key);
    const { decision, note } = readBody(body);
    const text = typeof note === 'string' ? note.trim() : '';
    const branch = decision === 'rejected' ? 'rejected' : decision === 'accepted' ? (text ? 'accepted-note' : 'accepted') : null;
    if (!branch || (branch === 'rejected' && !text)) return refuse(key);
    const at = Date.now();
    writeState({ ...current.state, review: { branch, note: text, at } });
    const recorded = data.session.reviews[branch].response;
    const reviewShift = at - Date.parse(data.session.reviews[branch].events[0]?.at ?? data.session.events.at(-1).at);
    return json(recorded.status, withNote(shiftTimes(recorded.body, reviewShift), text));
  }
  return null;
}

async function answer(method, url, body) {
  const data = await recording;
  const key = replayKey(method, url);
  const session = answerSession(data, method, url, body, key);
  if (session) return session;
  const seen = /^\/api\/cards\/([^/]+)\/seen$/.exec(url.pathname);
  if (method === 'POST' && seen) {
    const now = new Date().toISOString();
    return json(200, { workItemId: decodeURIComponent(seen[1]), seenAt: now, snapshot: readBody(body).snapshot ?? null, now });
  }
  const recorded = data.routes[key];
  if (recorded) return json(recorded.status, shiftTimes(recorded.body, viewShift(data)));
  if (method === 'GET' && findRoute(recordedRoutes, method, url.pathname)) return unmatched(key);
  if (findRoute(refusedRoutes, method, url.pathname)) return refuse(key);
  return unmatched(key);
}

globalThis.fetch = async function replayFetch(input, init = {}) {
  const request = input instanceof Request ? input : null;
  const url = new URL(request ? request.url : String(input), location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);
  const method = String(init.method ?? request?.method ?? 'GET').toUpperCase();
  return answer(method, url, init.body);
};

class ReplayEventSource extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  #timer = null;
  #cursor = 0;

  constructor(url) {
    super();
    this.url = new URL(url, location.href).href;
    this.withCredentials = false;
    this.readyState = ReplayEventSource.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    const parsed = new URL(this.url);
    this.#cursor = Math.max(0, Math.floor(Number(parsed.searchParams.get('after')) || 0));
    recording.then(data => {
      if (this.readyState === ReplayEventSource.CLOSED) return;
      const match = /^\/api\/sessions\/([^/]+)\/events$/.exec(parsed.pathname);
      if (!match || match[1] !== sessionId(data)) {
        replayReport.unmatched.push(replayKey('GET', parsed));
        this.readyState = ReplayEventSource.CLOSED;
        this.#emit(new Event('error'));
        return;
      }
      this.readyState = ReplayEventSource.OPEN;
      this.#emit(new Event('open'));
      this.#timer = setInterval(() => this.#deliver(data), 200);
      this.#deliver(data);
    });
  }

  #emit(event) {
    this.dispatchEvent(event);
    const handler = this[`on${event.type}`];
    if (typeof handler === 'function') handler.call(this, event);
  }

  #deliver(data) {
    for (const event of timeline(data).events) {
      if (this.readyState !== ReplayEventSource.OPEN) return;
      if (event.id <= this.#cursor) continue;
      this.#cursor = event.id;
      this.#emit(new MessageEvent('message', { data: JSON.stringify(event), lastEventId: String(event.id) }));
    }
  }

  close() {
    this.readyState = ReplayEventSource.CLOSED;
    clearInterval(this.#timer);
  }
}

globalThis.EventSource = ReplayEventSource;

document.addEventListener('click', event => {
  if (!event.target?.closest?.('[data-replay-restart]')) return;
  writeState({});
  location.hash = '#sessions';
  location.reload();
});
