import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mock } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Server } from 'node:http';

export const replayAnchor = Date.parse('2026-09-30T12:00:00Z');
export const replayCadenceMs = 1200;
export const replayFormat = 1;

const unfold = fileURLToPath(new URL('../', import.meta.url));
const publicDir = join(unfold, 'public');
const defaultOut = resolve(unfold, '../site/replay');
const placeholderData = '/unfold-demo';
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Recorded = { status: number; body: Json };
type Snapshot = { session: Json; permissions: Json };
type Timeline = { created: Recorded; started: Recorded; events: Json[]; snapshots: Snapshot[]; review?: Recorded };
type ReviewBranch = { response: Recorded; events: Json[]; snapshots: Snapshot[] };
export type Recording = {
  format: number; anchor: string; cadenceMs: number;
  routes: Record<string, Recorded>;
  session: { title: string; initialSessions: Json; created: Recorded; started: Recorded; startIndex: number; events: Json[]; snapshots: Snapshot[]; reviews: Record<string, ReviewBranch> };
};

const realNow = Date.now();
mock.timers.enable({ apis: ['Date'], now: replayAnchor });
const { createApplication } = await import('../src/main.ts');
const { loadConfig } = await import('../src/config.ts');
const { DemoRuntime } = await import('../src/runtime/demo.ts');
const { publicSession } = await import('../src/store.ts');
const { ploegDemoAnchor } = await import('../src/ploeg-demo.ts');
type Route = { method: string; path: string };
const { replayKey, notePlaceholder, findRoute, recordedRoutes, timelineRoutes, refusedRoutes } = await import(new URL('../public/replay/routes.js', import.meta.url).href) as {
  replayKey: (method: string, url: string) => string; notePlaceholder: string; findRoute: (routes: Route[], method: string, pathname: string) => Route | null;
  recordedRoutes: Route[]; timelineRoutes: Route[]; refusedRoutes: Route[];
};
const { runStates, runOutcomes } = await import(new URL('../public/core/states.js', import.meta.url).href) as { runStates: Record<string, unknown>; runOutcomes: Record<string, unknown> };
const { ploegWindows } = await import(new URL('../public/ploeg-activity.js', import.meta.url).href) as { ploegWindows: [string, string][] };
assert.equal(ploegDemoAnchor, replayAnchor, 'the illustrative Ploeg records must be anchored on the recording clock');

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

async function demoSessionBrief() {
  const source = await readFile(join(publicDir, 'views/sessions.js'), 'utf8');
  const literal = /const demoSession = (\{[^\n]*\});/.exec(source);
  assert(literal, 'public/views/sessions.js no longer declares its demoSession brief');
  return new Function(`return ${literal[1]}`)() as { title: string; objective: string };
}

async function startDemo(pace?: () => Promise<void>) {
  const dataDir = await mkdtemp(join(tmpdir(), 'unfold-replay-'));
  const previous = process.env.UNFOLD_DATA_DIR;
  process.env.UNFOLD_DATA_DIR = dataDir;
  const config = loadConfig(['--demo']);
  if (previous === undefined) delete process.env.UNFOLD_DATA_DIR; else process.env.UNFOLD_DATA_DIR = previous;
  const runtime = new DemoRuntime({ dataDir, pace: pace ?? (async () => {}) });
  const app = await createApplication(config, { runtimes: new Map([['demo', runtime]]) });
  await new Promise<void>(done => (app.server as Server).listen(0, '127.0.0.1', done));
  const address = app.server.address();
  assert(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const call = async (method: string, path: string, body?: unknown): Promise<Recorded> => {
    const response = await fetch(`${origin}${path}`, { method, headers: { 'X-Unfold-Request': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: origin }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    let parsed: Json;
    try { parsed = JSON.parse(text); } catch { throw new Error(`${method} ${path} answered ${response.status} with a body that is not JSON`); }
    return { status: response.status, body: parsed };
  };
  const dataPaths = [dataDir, await realpath(dataDir)];
  return { app, call, dataPaths, async close() { await app.close(); await rm(dataDir, { recursive: true, force: true }); } };
}

function scrub(value: Json, dataPaths: string[]): Json {
  let text = JSON.stringify(value);
  for (const path of dataPaths) text = text.split(JSON.stringify(path).slice(1, -1)).join(placeholderData);
  return JSON.parse(text);
}

function collect(value: Json, ids: Set<string>) {
  if (Array.isArray(value)) { for (const item of value) collect(item, ids); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if ((key === 'workItemId' || key === 'sourceWorkItemId') && typeof item === 'string' && item) ids.add(item);
    collect(item, ids);
  }
  if (typeof value.id === 'string' && typeof value.externalId === 'string') ids.add(value.id);
}

async function recordViews() {
  const demo = await startDemo();
  const routes = new Map<string, Recorded>();
  const get = async (path: string) => {
    const key = replayKey('GET', path);
    if (!routes.has(key)) routes.set(key, await demo.call('GET', path));
    return routes.get(key)!;
  };
  const query = (entries: Record<string, string | undefined>) => new URLSearchParams(Object.entries(entries).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString();
  try {
    const bootstrap = (await get('/api/bootstrap')).body as any;
    for (const path of ['/api/health', '/api/status', '/api/links', '/api/models', '/api/auth/methods', '/api/me/card-identity', '/api/binder', '/api/packs/odds', '/api/task-sources', '/api/ploeg/proposed', '/api/ploeg/now', '/api/ploeg']) await get(path);
    const teams: string[] = (await get('/api/ploeg/teams')).body && ((await get('/api/ploeg/teams')).body as any).teams;
    for (const team of teams) await get(`/api/ploeg?${query({ team })}`);
    for (const [window] of ploegWindows) await get(`/api/ploeg/summary?${query({ window })}`);
    for (const team of ['', ...teams]) for (const state of ['', ...Object.keys(runStates)]) for (const outcome of ['', ...Object.keys(runOutcomes)]) {
      let before: string | undefined = '';
      while (before !== undefined) {
        const page = (await get(`/api/ploeg/runs?${query({ team, state, outcome, before })}`)).body as any;
        before = page?.nextBefore ? String(page.nextBefore) : undefined;
      }
    }
    for (const team of ['', ...teams]) {
      let before: string | undefined = '';
      while (before !== undefined) {
        const page = (await get(`/api/ploeg/events?${query({ team, before })}`)).body as any;
        before = page?.nextCursor ? String(page.nextCursor) : undefined;
      }
    }
    for (const overview of [...routes.entries()].filter(([key]) => key.startsWith('GET /api/ploeg?') || key === 'GET /api/ploeg').map(([, value]) => value.body as any)) {
      for (const [lane, page] of Object.entries<any>(overview?.lanes ?? {})) {
        let after = page?.nextCursor;
        while (after) after = ((await get(`/api/ploeg/work-items?${query({ team: overview.selectedTeam, state: lane, after: String(after) })}`)).body as any)?.nextCursor;
      }
    }
    const packs = (await get('/api/packs')).body as any;
    for (const pack of packs?.packs ?? []) await get(`/api/packs/${encodeURIComponent(pack.id)}`);
    const season = (await get('/api/season')).body as any;
    for (const team of ['', ...(season?.teams ?? [])]) for (const quarter of ['', ...(season?.quarters ?? []).map((entry: { id: string }) => entry.id)]) await get(`/api/season?${query({ team, quarter })}`);
    const themes = (await get('/api/card-themes')).body as any;
    for (const theme of themes?.themes ?? []) {
      await get(`/api/card-themes/${encodeURIComponent(theme.id)}`);
      const versions = (await get(`/api/card-themes/${encodeURIComponent(theme.id)}/versions`)).body as any;
      for (const version of versions?.versions ?? []) await get(`/api/card-themes/${encodeURIComponent(theme.id)}/versions/${encodeURIComponent(version.version)}`);
    }
    for (const source of bootstrap.taskSources ?? []) {
      let page: number | null = 1;
      while (page) {
        const list = (await get(`/api/task-sources/${encodeURIComponent(source.id)}/tasks?page=${page}`)).body as any;
        for (const task of list?.tasks ?? []) await get(`/api/task-sources/${encodeURIComponent(source.id)}/tasks/${encodeURIComponent(task.id)}`);
        page = list?.nextPage || null;
      }
    }
    const visited = new Set<string>();
    while (true) {
      const ids = new Set<string>();
      for (const value of routes.values()) collect(value.body, ids);
      const fresh = [...ids].filter(id => !visited.has(id)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
      if (!fresh.length) break;
      for (const id of fresh) {
        visited.add(id);
        const base = `/api/ploeg/work-items/${encodeURIComponent(id)}`;
        for (const path of [base, `${base}/card`, `${base}/cracks`, `${base}/crack-candidates`, `${base}/context`]) await get(path);
        if (routes.get(replayKey('GET', `${base}/card`))!.status === 200) await get(`/api/cards/${encodeURIComponent(id)}/seen`);
      }
    }
    for (const id of [...visited].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
      const path = `/api/ploeg/work-items/${encodeURIComponent(id)}/cancel`;
      routes.set(replayKey('POST', path), await demo.call('POST', path, {}));
    }
    const failed = [...routes].filter(([, value]) => value.status >= 500);
    assert.deepEqual(failed.map(([key]) => key), [], 'the demo answered a recorded view with a server error');
    const initialSessions = (await get('/api/sessions')).body;
    routes.delete(replayKey('GET', '/api/sessions'));
    const sorted = Object.fromEntries([...routes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, value]) => [key, { status: value.status, body: scrub(value.body, demo.dataPaths) }]));
    return { routes: sorted, initialSessions, bootstrap };
  } finally { await demo.close(); }
}

async function recordTimeline(brief: { title: string; objective: string }, review?: { decision: 'accepted' | 'rejected'; note?: string }): Promise<Timeline> {
  mock.timers.setTime(replayAnchor);
  const events: Json[] = [];
  const snapshots: Snapshot[] = [];
  let sessionId = '';
  let paced = 0;
  let call: Awaited<ReturnType<typeof startDemo>>['call'];
  const demo = await startDemo(async () => {
    paced++;
    const latest = snapshots.at(-1)!;
    const [session, permissions, history] = await Promise.all([call('GET', `/api/sessions/${sessionId}`), call('GET', `/api/sessions/${sessionId}/permissions`), call('GET', `/api/sessions/${sessionId}/history`)]);
    assert.deepEqual(session.body, latest.session, 'the recorded session snapshot differs from what the API serves');
    assert.deepEqual(permissions.body, latest.permissions, 'the recorded permissions differ from what the API serves');
    assert.deepEqual(history.body, events, 'the recorded events differ from what the API serves');
  });
  call = demo.call;
  const store = demo.app.store;
  const append = store.appendEvent.bind(store);
  store.appendEvent = (id, type, actor, data, runId) => {
    const event = append(id, type, actor, data, runId);
    events.push(clone(event) as Json);
    snapshots.push(clone({ session: publicSession(store.getSession(id)!), permissions: store.permissions(id).map(({ nativeId, ...request }) => request) }) as Snapshot);
    const listed = clone(store.listSessions().map(publicSession));
    assert.deepEqual(listed, [snapshots.at(-1)!.session], 'the replay keeps exactly one session');
    mock.timers.tick(replayCadenceMs);
    return event;
  };
  try {
    const bootstrap = (await call('GET', '/api/bootstrap')).body as any;
    const created = await call('POST', '/api/sessions', { ...brief, repositoryId: bootstrap.repositories[0].id, crewId: bootstrap.crews[0].id, runtime: 'demo', budgetUsd: Math.min(5, bootstrap.maxBudgetUsd) });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    sessionId = (created.body as any).id;
    const started = await call('POST', `/api/sessions/${sessionId}/start`, {});
    assert.equal(started.status, 200, JSON.stringify(started.body));
    const deadline = performance.now() + 60_000;
    while (!['completed', 'failed', 'cancelled'].includes(((await call('GET', `/api/sessions/${sessionId}`)).body as any).status)) {
      assert(performance.now() < deadline, 'the demo session did not finish within a minute');
      await sleep(25);
    }
    assert.equal((snapshots.at(-1)!.session as any).status, 'completed', 'the recorded demo session must complete');
    assert(paced > 0, 'the demo runtime never reached a pace point');
    const timeline: Timeline = { created, started, events, snapshots };
    if (review) {
      timeline.review = await call('POST', `/api/sessions/${sessionId}/review`, { decision: review.decision, ...(review.note ? { note: review.note } : {}) });
      assert.equal(timeline.review.status, 200, JSON.stringify(timeline.review.body));
    }
    return scrubTimeline(timeline, demo.dataPaths);
  } finally { await demo.close(); }
}

function scrubTimeline(timeline: Timeline, dataPaths: string[]): Timeline {
  const ids = new Map<string, string>();
  const stable = (value: Json): Json => JSON.parse(JSON.stringify(scrub(value, dataPaths)).replace(uuid, found => {
    if (!ids.has(found)) ids.set(found, `00000000-0000-4000-8000-${String(ids.size + 1).padStart(12, '0')}`);
    return ids.get(found)!;
  }));
  return {
    created: { status: timeline.created.status, body: stable(timeline.created.body) },
    started: { status: timeline.started.status, body: stable(timeline.started.body) },
    events: timeline.events.map(stable),
    snapshots: timeline.snapshots.map(snapshot => ({ session: stable(snapshot.session), permissions: stable(snapshot.permissions) })),
    ...(timeline.review ? { review: { status: timeline.review.status, body: stable(timeline.review.body) } } : {}),
  };
}

export async function record(): Promise<Recording> {
  const brief = await demoSessionBrief();
  const views = await recordViews();
  const main = await recordTimeline(brief);
  const startIndex = main.events.findIndex(event => (event as any).type === 'session.started');
  assert(startIndex > 0, 'the demo timeline has no session.started event');
  const reviews: Record<string, ReviewBranch> = {};
  for (const [name, review] of [['accepted', { decision: 'accepted' }], ['accepted-note', { decision: 'accepted', note: notePlaceholder }], ['rejected', { decision: 'rejected', note: notePlaceholder }]] as const) {
    const branch = await recordTimeline(brief, review);
    assert.deepEqual(mask(branch.events.slice(0, main.events.length)), mask(main.events), `the ${name} recording diverged from the main timeline before its review`);
    reviews[name] = { response: branch.review!, events: branch.events.slice(main.events.length), snapshots: branch.snapshots.slice(main.events.length) };
  }
  return {
    format: replayFormat, anchor: new Date(replayAnchor).toISOString(), cadenceMs: replayCadenceMs, routes: views.routes,
    session: { title: brief.title, initialSessions: views.initialSessions, created: main.created, started: main.started, startIndex, events: main.events, snapshots: main.snapshots, reviews },
  };
}

const maskedKeys = /^(durationMs|bytes)$/;

/** The recording with the values that legitimately change between two recordings replaced by a marker: timings, hashes, signatures and Git object ids. */
export function mask(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(item => mask(item));
  if (typeof value === 'string') return value
    .replace(/\b[0-9a-f]{40}\b|\b[0-9a-f]{64}\b|\b[0-9a-f]{7,12}\.\.[0-9a-f]{7,12}\b/g, '<sha>')
    .replace(/\(\d+(?:\.\d+)?ms\)/g, '(<ms>)')
    .replace(/Duration: \d+ ms/g, 'Duration: <ms> ms')
    .replace(/duration_ms \d+(?:\.\d+)?/g, 'duration_ms <ms>')
    .replace(/node:internal\/[\w/.-]+:\d+:\d+/g, 'node:internal/<frame>');
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, maskedKeys.test(key) && (typeof item === 'string' || typeof item === 'number') ? '<masked>' : mask(item)]));
  return value;
}

export async function publicHashes(): Promise<Record<string, string>> {
  const files: string[] = [];
  const walk = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path); else if (entry.isFile()) files.push(path);
    }
  };
  await walk(publicDir);
  const hashes: Record<string, string> = {};
  for (const path of files.sort()) hashes[relative(publicDir, path).split(sep).join('/')] = createHash('sha256').update(await readFile(path)).digest('hex');
  return hashes;
}

/** The recording as text: one body per line, so a re-recording diffs line by line. */
export function serialize(recording: Recording): string {
  const lines = ['{', `"format":${recording.format},"anchor":${JSON.stringify(recording.anchor)},"cadenceMs":${recording.cadenceMs},`, '"routes":{'];
  const entries = Object.entries(recording.routes);
  entries.forEach(([key, value], index) => lines.push(`${JSON.stringify(key)}:${JSON.stringify(value)}${index < entries.length - 1 ? ',' : ''}`));
  lines.push('},', '"session":{');
  const session = Object.entries(recording.session);
  session.forEach(([key, value], index) => {
    const comma = index < session.length - 1 ? ',' : '';
    if (Array.isArray(value)) lines.push(`${JSON.stringify(key)}:[`, ...value.map((item, at) => `${JSON.stringify(item)}${at < value.length - 1 ? ',' : ''}`), `]${comma}`);
    else lines.push(`${JSON.stringify(key)}:${JSON.stringify(value)}${comma}`);
  });
  lines.push('}', '}');
  return `${lines.join('\n')}\n`;
}

function literalAt(source: string, index: number): string | null {
  let start = index;
  while (start > 0 && !['\'', '"', '`', '\n'].includes(source[start - 1])) start--;
  const quote = source[start - 1];
  if (!quote || quote === '\n') return null;
  let text = '';
  for (let at = start, depth = 0; at < source.length; at++) {
    const char = source[at];
    if (depth === 0 && char === quote) return text;
    if (quote === '`' && depth === 0 && char === '$' && source[at + 1] === '{') { depth = 1; text += '\u0000'; at++; continue; }
    if (depth > 0) { if (char === '{') depth++; else if (char === '}') depth--; continue; }
    if (char === '\n' && quote !== '`') return null;
    text += char;
  }
  return null;
}

/** Every `/api/` path literal in Unfold's browser code that the replay neither answers nor refuses, as `file: path`. */
export async function unroutedApiPaths(): Promise<string[]> {
  const routes = [...recordedRoutes, ...timelineRoutes, ...refusedRoutes];
  const found: string[] = [];
  const sources: string[] = [];
  const walk = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && directory === publicDir && ['vendor', 'replay'].includes(entry.name)) continue;
      if (entry.isDirectory()) await walk(path); else if (entry.name.endsWith('.js')) sources.push(path);
    }
  };
  await walk(publicDir);
  let literals = 0;
  for (const path of sources.sort()) {
    const source = await readFile(path, 'utf8');
    for (const match of source.matchAll(/\/api\//g)) {
      const literal = literalAt(source, match.index!);
      if (literal === null || !literal.startsWith('/api/')) continue;
      literals++;
      const route = literal.split('?')[0].replace(/([^/])\u0000$/, '$1').replace(/\u0000/g, 'x1').replace(/\/$/, '/x1');
      if (!routes.some(entry => findRoute([entry], entry.method === '*' ? 'GET' : entry.method, route))) found.push(`public/${relative(publicDir, path).split(sep).join('/')}: ${literal.replace(/\u0000/g, '${…}')}`);
    }
  }
  assert(literals > 50, 'the API path lint found too few literals to be reading Unfold\'s browser code');
  return [...new Set(found)];
}

function gitCommit(): string {
  try { return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: unfold, encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

async function main() {
  const args = process.argv.slice(2);
  const unrouted = await unroutedApiPaths();
  if (unrouted.length) {
    process.stderr.write(`FAIL: Unfold calls API paths the hosted replay neither answers nor refuses. Add each to public/replay/routes.js.\n${unrouted.map(line => `  ${line}`).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  const outIndex = args.indexOf('--out');
  const out = outIndex === -1 ? defaultOut : resolve(args[outIndex + 1]);
  const recording = await record();
  const text = serialize(recording);
  const files = await publicHashes();
  const version = JSON.parse(await readFile(join(unfold, 'package.json'), 'utf8')).version as string;
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'replay.json'), text);
  const manifest = { format: replayFormat, unfoldVersion: version, commit: gitCommit(), recordedAt: new Date(realNow).toISOString().slice(0, 10), anchor: recording.anchor, replay: createHash('sha256').update(text).digest('hex'), files };
  await writeFile(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Recorded ${Object.keys(recording.routes).length} requests and ${recording.session.events.length} session events (${(Buffer.byteLength(text) / 1024).toFixed(0)} KiB) into ${relative(process.cwd(), out) || out}.\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then(() => mock.timers.reset()).catch(error => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
}
