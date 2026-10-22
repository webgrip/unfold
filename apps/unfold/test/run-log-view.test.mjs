import test from 'node:test';
import assert from 'node:assert/strict';
import { commonFields, defaultLogView, logDownloadText, logExtent, logLineShown, logViewerMarkup, logVolume, levelOf, parseLogLine, podLabels } from '../public/run-log-view.js';

const slog = (at, level, msg, extra = '') => ({ at, text: `time=${at} level=${level} msg="${msg}" trace=ploeg-f8a5bb14e4a6 role=reviewer${extra}` });
const lines = [
  slog('2026-10-10T23:24:02.110Z', 'INFO', 'ploeg-worker starting'),
  slog('2026-10-10T23:24:02.140Z', 'WARN', 'claim target differs from the env repo; using the claim target', ' claim=webgrip/unfold'),
  slog('2026-10-10T23:26:14.782Z', 'INFO', 'reading run prepared', ' commit=ca80173'),
  slog('2026-10-10T23:30:00.000Z', 'ERROR', 'harness exited', ' code=1 output="no such file"'),
];
const run = { id: '31', startedAt: '2026-10-10T23:24:00Z', finishedAt: '2026-10-10T23:31:00Z' };

test('slog text lines give their level, message and fields without the time', () => {
  assert.deepEqual(parseLogLine('time=2026-10-10T23:24:02.140Z level=WARN msg="claim target differs" claim=webgrip/unfold title="a \\"quoted\\" word"'), { level: 'warn', message: 'claim target differs', fields: [['claim', 'webgrip/unfold'], ['title', 'a "quoted" word']] });
});

test('JSON lines and plain lines are read too', () => {
  assert.deepEqual(parseLogLine('{"level":"error","msg":"boom","ts":1,"attempt":2,"tags":["a"]}'), { level: 'error', message: 'boom', fields: [['attempt', '2'], ['tags', '["a"]']] });
  assert.deepEqual(parseLogLine('2026/10/10 23:24:02 WARNING disk almost full'), { level: 'warn', message: '2026/10/10 23:24:02 WARNING disk almost full', fields: [] });
  assert.deepEqual(parseLogLine('npm notice a=b'), { level: null, message: 'npm notice a=b', fields: [] }, 'logfmt needs a level or message key');
  assert.deepEqual(parseLogLine('{not json'), { level: null, message: '{not json', fields: [] });
  assert.equal(levelOf('Critical'), 'error');
  assert.equal(levelOf('chatty'), null);
});

test('fields every line carries show once, not on each line', () => {
  const parsed = lines.map(line => parseLogLine(line.text));
  assert.deepEqual(commonFields(parsed), [['trace', 'ploeg-f8a5bb14e4a6'], ['role', 'reviewer']]);
  assert.deepEqual(commonFields(parsed.slice(0, 1)), [], 'one line has nothing in common to lift out');
  assert.deepEqual(commonFields([...parsed, parseLogLine('plain output from the agent')]), [['trace', 'ploeg-f8a5bb14e4a6'], ['role', 'reviewer']], 'a plain line among them does not stop the lift');
  const html = logViewerMarkup(run, lines, defaultLogView());
  assert.match(html, /Every line with fields carries<\/span> <span class="log-field"><span class="log-field-key">trace=<\/span>ploeg-f8a5bb14e4a6<\/span>/);
  assert.doesNotMatch(html.slice(html.indexOf('class="log-lines"')).replace(/<div class="log-detail">[^]*?<\/pre><\/div>/g, ''), /trace=/, 'rows leave the shared fields to their detail');
});

test('level, search and time range filter the lines', () => {
  const parsed = lines.map(line => parseLogLine(line.text));
  const shown = view => lines.filter((line, index) => logLineShown(line, parsed[index], { ...defaultLogView(), ...view })).length;
  assert.equal(shown({}), 4);
  assert.equal(shown({ level: 'info' }), 2);
  assert.equal(shown({ query: 'CLAIM target' }), 1);
  assert.equal(shown({ range: { from: Date.parse('2026-10-10T23:24:00Z'), to: Date.parse('2026-10-10T23:25:00Z') } }), 2);
  const html = logViewerMarkup(run, lines, { ...defaultLogView(), level: 'error', query: 'exited' });
  assert.match(html, /<span class="num">1 of 4 lines<\/span> shown/);
  assert.match(html, /harness <mark>exited<\/mark>/);
  assert.match(html, /aria-pressed="true" data-action="work-run-log-level" data-id="error">Errors<span class="count">1<\/span>/);
  assert.match(logViewerMarkup(run, lines, { ...defaultLogView(), query: 'nothing like it' }), /No line matches\.[^]*data-action="work-run-log-clear" data-id="31"/);
});

test('the volume chart counts lines per level over the Run and each bar picks its time', () => {
  const parsed = lines.map(line => parseLogLine(line.text));
  const extent = logExtent(lines, run);
  assert.equal(extent.from, Date.parse(run.startedAt));
  const slices = logVolume(lines, parsed, extent, 7);
  assert.deepEqual(slices.map(slice => slice.total), [2, 0, 1, 0, 0, 0, 1]);
  assert.deepEqual(slices[0].counts, { error: 0, warn: 1, info: 1, debug: 0, other: 0 });
  assert.equal(slices.reduce((sum, slice) => sum + slice.total, 0), lines.length, 'every line lands in a bar');
  const html = logViewerMarkup(run, lines, defaultLogView());
  assert.match(html, /<rect class="log-bar" data-level="error"/);
  assert.match(html, /<button type="button" class="log-bin" data-action="work-run-log-range" data-id="31" data-from="\d+" data-to="\d+" aria-pressed="false" title="[^"]*1 line, 1 error"/);
  assert.doesNotMatch(html, /style=/, 'the page forbids inline styles');
});

test('lines open to their fields and raw text; wrap and times can be switched off', () => {
  const html = logViewerMarkup(run, lines, { ...defaultLogView(), wrap: false, times: false });
  assert.match(html, /<details class="log-line" id="work-run-log-line-31-20261010233000000Z?-0" data-level="error">/);
  assert.match(html, /<dt>code<\/dt><dd><span class="mono">1<\/span><\/dd>/);
  assert.match(html, /<pre class="work-log log-raw" data-private>time=2026-10-10T23:30:00.000Z level=ERROR/);
  assert.match(html, /data-wrap="false"/);
  assert.doesNotMatch(html, /class="log-time/);
});

test('the download holds the shown lines with their store time', () => {
  assert.equal(logDownloadText(lines, { ...defaultLogView(), level: 'warn' }), `2026-10-10T23:24:02.140Z ${lines[1].text}\n`);
  assert.equal(logDownloadText([{ at: 'a', text: 'x', stream: 'pod-b' }], defaultLogView(), { several: true }), 'a pod-b x\n');
});

test('a logfmt line cut off inside a quoted value still reads as logfmt', () => {
  assert.deepEqual(parseLogLine('time=2026-10-18T19:59:31.116Z level=INFO msg="run finished" outcome=failed stuck_reason="last agent message: Error: Conversation run failed for id=7bfe'), { level: 'info', message: 'run finished', fields: [['outcome', 'failed'], ['stuck_reason', 'last agent message: Error: Conversation run failed for id=7bfe']] });
});

test('a line that continues the one before it hides its repeated time and pod', () => {
  const at = '2026-10-18T19:59:27.732Z';
  const printed = [{ at, stream: 'sbx-w', text: 'RuntimeError: Conversation run failed' }, { at, stream: 'sbx-w', text: '  To help debug this issue, please' }, { at: '2026-10-18T19:59:27.754Z', stream: 'sbx-w', text: 'next' }];
  const html = logViewerMarkup(run, printed, defaultLogView(), { several: true });
  assert.equal(html.match(/data-continued/g).length, 1);
  assert.match(html, /data-level="none" data-continued><summary>[^]*To help debug/);
});

test('when only the newest lines arrived, the volume chart spans those lines, not the whole Run', () => {
  assert.equal(logExtent(lines, run, { truncated: true }).from, Date.parse(lines[0].at));
  assert.equal(logExtent(lines, run).from, Date.parse(run.startedAt));
});

test('pods read by a short name', () => {
  const worker = 'ploeg-worker-bronze-builder-cvmvc-97xmz';
  assert.deepEqual([...podLabels([worker, `sbx-${worker}`])], [[worker, 'worker'], [`sbx-${worker}`, 'sandbox']]);
  assert.deepEqual([...podLabels(['api-7f9c-abc', 'api-7f9c-def'])], [['api-7f9c-abc', 'abc'], ['api-7f9c-def', 'def']]);
  assert.deepEqual([...podLabels(['a', 'a-b'])].map(([, label]) => label), ['a', 'b']);
});
