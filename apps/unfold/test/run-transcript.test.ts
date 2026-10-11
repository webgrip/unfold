import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PloegClient, PloegError } from '../src/ploeg.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { parseTranscriptPage, transcriptCursor, transcriptLimits, TranscriptError } from '../src/run-transcript.ts';
import { application, configuration, login, request } from './api-support.ts';

const admin = { id: 'admin', name: 'admin', role: 'admin' as const };
const operator = { id: 'operator', name: 'operator', role: 'operator' as const };
const at = '2026-10-11T10:00:00Z';

type Answer = { status?: number; body?: unknown } | ((after: number, limit: number) => { status?: number; body?: unknown });

async function fakePloeg(t: TestContext, transcript: Answer) {
  const env = `UNFOLD_PLOEG_TRANSCRIPT_${randomBytes(8).toString('hex').toUpperCase()}`;
  const token = randomBytes(24).toString('hex');
  process.env[env] = token;
  const seen: { path: string; authorized: boolean }[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://fixture.invalid');
    seen.push({ path: `${url.pathname}${url.search}`, authorized: req.headers.authorization === `Bearer ${token}` });
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end(); return; }
    const reading = /\/api\/v1\/operator\/runs\/([0-9]+)\/transcript$/.exec(url.pathname);
    if (reading) {
      const answer = typeof transcript === 'function' ? transcript(Number(url.searchParams.get('after')), Number(url.searchParams.get('limit'))) : transcript;
      if ((answer.status ?? 200) !== 200) { res.writeHead(answer.status!).end(); return; }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(answer.body));
      return;
    }
    const detail = /\/api\/v1\/operator\/work-items\/([0-9]+)$/.exec(url.pathname);
    if (detail && ploegDemo.details[detail[1]]) { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...ploegDemo.details[detail[1]] })); return; }
    res.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); delete process.env[env]; });
  const address = server.address(); assert(address && typeof address !== 'string');
  return { config: { url: `http://127.0.0.1:${address.port}`, tokenEnv: env, userTeams: { operator: ['delivery'] } }, seen, token };
}

function client(config: { url: string; tokenEnv: string; userTeams: Record<string, string[]> }) { return new PloegClient({ ...configuration('/unused', 'live'), ploeg: config }); }

const message = (seq: number, text = `message ${seq}`) => ({ seq, at, kind: 'message', text });
const page = (entries: unknown[], extra: Record<string, unknown> = {}) => ({ schemaVersion: '1.0', runId: '51', entries, nextAfter: (entries.at(-1) as { seq: number } | undefined)?.seq ?? 0, hasMore: false, truncated: false, complete: false, ...extra });

test('a Run transcript is read page by page after a cursor, with Ploeg\'s operator credential', async t => {
  const all = Array.from({ length: 5 }, (_, index) => message(index + 1));
  const ploeg = await fakePloeg(t, (after, limit) => { const entries = all.filter(entry => entry.seq > after).slice(0, Math.min(limit, 2)); return { body: page(entries, { nextAfter: entries.at(-1)?.seq ?? after, hasMore: entries.length > 0 && entries.at(-1)!.seq < all.length, complete: true }) }; });
  const unfold = client(ploeg.config);
  const first = await unfold.runTranscript(admin, '102', '51');
  assert.equal(first.available, true);
  assert.equal(first.demo, false);
  assert.deepEqual(first.entries.map(entry => entry.seq), [1, 2]);
  assert.equal(first.nextAfter, 2);
  assert.equal(first.hasMore, true);
  const second = await unfold.runTranscript(admin, '102', '51', String(first.nextAfter));
  assert.deepEqual(second.entries.map(entry => entry.seq), [3, 4]);
  const last = await unfold.runTranscript(admin, '102', '51', '4');
  assert.deepEqual([last.entries.map(entry => entry.seq), last.hasMore, last.complete], [[5], false, true]);
  const reads = ploeg.seen.filter(call => call.path.includes('/transcript'));
  assert.deepEqual(reads.map(call => call.path), ['/api/v1/operator/runs/51/transcript?after=0&limit=500', '/api/v1/operator/runs/51/transcript?after=2&limit=500', '/api/v1/operator/runs/51/transcript?after=4&limit=500']);
  assert.ok(reads.every(call => call.authorized));
});

test('an older Ploeg without the transcript endpoint reads as unsupported, not as an error', async t => {
  const ploeg = await fakePloeg(t, { status: 404 });
  const transcript = await client(ploeg.config).runTranscript(admin, '102', '51');
  assert.equal(transcript.available, false);
  assert.equal(transcript.reason, 'unsupported');
  assert.equal(transcript.message, 'Ploeg on this workbench does not record agent transcripts yet.');
  assert.deepEqual([transcript.entries, transcript.complete], [[], true]);
});

test('a transcript is read only for a Run of a Work Item the caller may see', async t => {
  const ploeg = await fakePloeg(t, { body: page([message(1)]) });
  const unfold = client(ploeg.config);
  await assert.rejects(unfold.runTranscript(admin, '102', '30'), (error: PloegError) => error.status === 404 && /not part of the Work Item/.test(error.message));
  await assert.rejects(unfold.runTranscript(operator, '104', '54'), (error: PloegError) => error.status === 404, 'a Work Item outside the operator\'s teams');
  await assert.rejects(unfold.runTranscript({ id: 'stranger', name: 'stranger', role: 'operator' }, '102', '51'), (error: PloegError) => error.status === 403);
  await assert.rejects(unfold.runTranscript(admin, '102', '../1'), (error: PloegError) => error.status === 400);
  for (const cursor of ['-1', '1.5', 'x', String(transcriptLimits.seq + 1), '01']) await assert.rejects(unfold.runTranscript(admin, '102', '51', cursor), (error: PloegError) => error.status === 400 && error.code === 'transcript_cursor');
  assert.equal(ploeg.seen.filter(call => call.path.includes('/transcript')).length, 0, 'nothing is asked of Ploeg for a Run the caller may not read');
  assert.equal((await unfold.runTranscript(operator, '102', '51')).entries.length, 1);
});

test('a transcript page is validated strictly: unknown kinds and stale entries are dropped, text is capped and redacted', () => {
  const parsed = parseTranscriptPage(page([
    message(3, 'before the cursor'),
    message(5, `Using Bearer sk-live-secret and token=abc ${'x'.repeat(transcriptLimits.text + 10)}`),
    { seq: 6, at, kind: 'hologram', text: 'from a newer Ploeg' },
    { seq: 7, at, kind: 'tool_call', toolCallId: 'call-1', title: 'Run tests', toolKind: 'teleport', status: 'in_progress', input: 'npm test', paths: ['a.ts', 'b.ts'], text: 'ignored' },
    { seq: 8, at, kind: 'tool_output', toolCallId: 'call-1', text: 'edit a.ts\n@@ line 1: -a +b @@\n-a\n+b', clipped: true },
    { seq: 9, at, kind: 'plan', plan: [{ content: 'Read', status: 'completed' }, { content: 'Fix', status: 'in_progress' }] },
    message(9, 'repeats a seq'),
  ], { nextAfter: 9 }), '51', 4);
  assert.deepEqual(parsed.entries.map(entry => [entry.seq, entry.kind]), [[5, 'message'], [7, 'tool_call'], [8, 'tool_output'], [9, 'plan']]);
  assert.equal(parsed.entries[0].text!.length, transcriptLimits.text + 1);
  assert.doesNotMatch(parsed.entries[0].text!, /sk-live-secret|token=abc/);
  assert.deepEqual(parsed.entries[1], { seq: 7, at, kind: 'tool_call', toolCallId: 'call-1', title: 'Run tests', toolKind: 'other', status: 'in_progress', input: 'npm test', paths: ['a.ts', 'b.ts'] });
  assert.equal(parsed.entries[2].clipped, true);
  assert.deepEqual(parsed.entries[3].plan, [{ content: 'Read', status: 'completed' }, { content: 'Fix', status: 'in_progress' }]);
  assert.equal(parsed.nextAfter, 9);
  const refuses = (body: unknown, path: string) => assert.throws(() => parseTranscriptPage(body, '51', 0), (error: TranscriptError) => error.path === path);
  refuses({ ...page([]), schemaVersion: '2.0' }, '$.schemaVersion');
  refuses({ ...page([]), runId: '52' }, '$.runId');
  refuses(page([{ seq: 0, at, kind: 'message' }]), '$.entries[0].seq');
  refuses(page([{ seq: 1, at: 'yesterday', kind: 'message' }]), '$.entries[0].at');
  refuses(page([{ seq: 1, at, kind: 'message', text: 42 }]), '$.entries[0].text');
  refuses(page([{ seq: 1, at, kind: 'tool_call', title: 'no id' }]), '$.entries[0].toolCallId');
  refuses(page([{ seq: 1, at, kind: 'tool_call', toolCallId: 'c', status: 'exploded' }]), '$.entries[0].status');
  refuses({ ...page([]), hasMore: 'yes' }, '$.hasMore');
  refuses({ ...page([]), entries: Array.from({ length: transcriptLimits.page + 1 }, (_, index) => message(index + 1)) }, '$.entries');
  assert.deepEqual([transcriptCursor(undefined), transcriptCursor('0'), transcriptCursor('42'), transcriptCursor('4.2')], [0, 0, 42, null]);
});

test('a malformed transcript is a 502, and the HTTP route masks the operator credential and refuses an unknown Run', async t => {
  let leak = '';
  const ploeg = await fakePloeg(t, after => after === 7 ? { body: { ...page([]), runId: '9' } } : { body: page([message(1, `Leaked: ${leak}`)]) });
  leak = ploeg.token;
  await assert.rejects(client(ploeg.config).runTranscript(admin, '102', '51', '7'), (error: PloegError) => error.status === 502 && error.code === 'ploeg_transcript_invalid');
  const server = await application('live', config => { config.ploeg = { url: ploeg.config.url, tokenEnv: ploeg.config.tokenEnv }; });
  t.after(() => server.close());
  const { cookie } = await login(server.url);
  const answer = await request(server.url, '/api/ploeg/work-items/102/runs/51/transcript?after=0', { cookie });
  assert.equal(answer.status, 200, answer.text);
  assert.equal(answer.body.available, true);
  assert.equal(answer.body.entries[0].text, 'Leaked: [redacted]');
  assert.doesNotMatch(answer.text, new RegExp(ploeg.token));
  assert.equal((await request(server.url, '/api/ploeg/work-items/102/runs/30/transcript', { cookie })).status, 404);
  assert.equal((await request(server.url, '/api/ploeg/work-items/102/runs/51/transcript?after=abc', { cookie })).status, 400);
});

test('the demo runs no agents, so its Runs have no transcript and it says so', async () => {
  const unfold = new PloegClient(configuration(mkdtempSync(join(tmpdir(), 'unfold-run-transcript-')), 'demo'));
  for (const [item, run] of [['102', '51'], ['105', '53']]) {
    const transcript = await unfold.runTranscript(admin, item, run);
    assert.equal(transcript.available, false);
    assert.equal(transcript.reason, 'demo');
    assert.equal(transcript.demo, true);
    assert.match(transcript.message!, /demo runs no agents/);
    assert.deepEqual(transcript.entries, []);
  }
  await assert.rejects(unfold.runTranscript(admin, '102', '53'), (error: PloegError) => error.status === 404);
});
