import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { chmod, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { briefFor, capDiff, confirmedFacts, findSecrets, handoffBranch, parseFindings, previewCode, previewText, sendRequest } from '../extensions/claude-code/scripts/unfold-handoff.mjs';

const plugin = fileURLToPath(new URL('../extensions/claude-code/', import.meta.url));
const script = join(plugin, 'scripts/unfold-handoff.mjs');
const run = promisify(execFile);
const sessionId = 'session-handoff-cli-1';
const fakeToken = ['ghp', '_', 'aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3z00'].join('');
const fakeAssignment = ['api', '_key: "', 'k3yV4lu3', 'Abcdef0123456789"'].join('');
const findings = { title: 'Round half up', tried: ['Rounded in the cart only; the invoice still differs.'], hypotheses: ['The invoice rounds per line.'], left: ['Use one rounding helper in both.'] };

test('the findings are a JSON object of short lists, and at least one finding is required', () => {
  assert.deepEqual(parseFindings(JSON.stringify({ ...findings, tried: ['  a\u0007 line\nbroken  '] })), { ...findings, tried: ['a line broken'] });
  assert.throws(() => parseFindings('not json'), /must be JSON/);
  assert.throws(() => parseFindings('[]'), /one JSON object/);
  assert.throws(() => parseFindings(JSON.stringify({ tried: 'x' })), /findings\.tried must be a list/);
  assert.throws(() => parseFindings(JSON.stringify({ left: Array.from({ length: 9 }, () => 'x') })), /keep it to 8/);
  assert.throws(() => parseFindings(JSON.stringify({ title: 'x', tried: [], hypotheses: [], left: [] })), /at least one finding/);
  assert.equal(parseFindings(JSON.stringify({ left: ['y'.repeat(400)] })).left[0].length, 300);
});

test('the shown diff is cut at a line end at 100 KB and says how much it left out', () => {
  const small = capDiff('a\nb\n');
  assert.deepEqual(small, { text: 'a\nb\n', bytes: 4, truncated: false, notice: '' });
  const line = `+${'x'.repeat(98)}\n`;
  const big = capDiff(line.repeat(2000));
  assert.equal(big.truncated, true);
  assert.equal(big.bytes, 200_000);
  assert.ok(Buffer.byteLength(big.text) <= 100_000);
  assert.ok(big.text.endsWith('x'), 'cut at a line end, without a half line');
  assert.match(big.notice, /^\[Truncated: shows 99999 of 200000 bytes\. The whole change travels as commits on the hand-off branch, not as this text\.\]$/);
  assert.equal(capDiff('é'.repeat(10), 5).text, 'é'.repeat(2), 'never splits a character');
});

test('the built-in secret check flags added lines only and names the rule and file, never the value', () => {
  const diff = ['+++ b/config.ts', `+const forge = "${fakeToken}";`, `-const old = "${fakeToken}";`, '+++ b/keys.pem', `+-----BEGIN OPENSSH ${'PRIVATE'} KEY-----`, '+++ b/fine.ts', '+const sha = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";', '+const word = "hunter2";'].join('\n');
  assert.deepEqual(findSecrets(diff), [{ rule: 'github-token', file: 'config.ts' }, { rule: 'private-key', file: 'keys.pem' }]);
  assert.deepEqual(findSecrets(`+++ b/a\n+${fakeAssignment}`), [{ rule: 'secret-assignment', file: 'a' }]);
});

test('the preview names the Team and the spend cap, and the facts Unfold binds name them too', () => {
  const context = { branch: handoffBranch('c'.repeat(40)), commit: 'c'.repeat(40), base: 'origin/main', baseCommit: 'b'.repeat(40), sessionBranch: 'feat/rounding', commits: 1, uncommitted: true, files: 2, insertions: 10, deletions: 1, untracked: 1, findings };
  const text = previewText({ target: { kind: 'requeue', workItemId: '101', team: 'delivery', title: 'Fix rounding', budgetUsd: 5 }, context, findings: parseFindings(JSON.stringify(findings)), diff: capDiff('+x\n'), untracked: ['new.ts'], scan: { scanners: ['gitleaks', 'built-in patterns'], hits: [] } });
  assert.match(text, /To: Team delivery\. Work Item 101 "Fix rounding" restarts from Round 1\./);
  assert.match(text, /Spend: its Runs spend from Team delivery's budget, up to US\$5\.00 like the last attempt\./);
  assert.match(text, /pushed to origin as unfold\/handoff-cccccccccccc/);
  assert.match(text, /1 commit of yours not on origin\/main and your uncommitted changes/);
  assert.match(text, /New files included: new\.ts\./);
  assert.match(text, /gitleaks and built-in patterns found nothing/);
  assert.match(text, /untrusted notes/);
  const fresh = previewText({ target: { kind: 'start', team: 'delivery', target: 'order-service', title: 'Round half up' }, context: { ...context, branch: '', commit: '', uncommitted: false }, findings: parseFindings(JSON.stringify(findings)), diff: capDiff(''), untracked: [], scan: { scanners: ['built-in patterns'], hits: [] } });
  assert.match(fresh, /A new Work Item "Round half up" in order-service/);
  assert.match(fresh, /Unfold does not know the cap before Ploeg admits it/);
  assert.match(fresh, /Code: nothing to push/);
  const code = previewCode(text);
  assert.match(code, /^[0-9a-f]{12}$/);
  const sha = (value: string) => createHash('sha256').update(value).digest('hex');
  assert.deepEqual(confirmedFacts({ kind: 'requeue', workItemId: '101', team: 'delivery', title: 'Fix rounding', budgetUsd: 5 }, context, text), { kind: 'requeue', workItemId: '101', team: 'delivery', budgetUsd: 5, preview: sha(text), context });
  assert.equal(confirmedFacts({ kind: 'requeue', workItemId: '101', team: 'delivery', title: 'x' }, context, text).budgetUsd, null, 'a spend line without a cap binds null');
  assert.deepEqual(confirmedFacts({ kind: 'start', team: 'delivery', target: 'order-service', title: 'Round half up' }, context, fresh), { kind: 'start', team: 'delivery', target: 'order-service', title: 'Round half up', brief: briefFor('Round half up', findings.left), budgetUsd: null, preview: sha(fresh), context });
  assert.notEqual(confirmedFacts({ kind: 'requeue', workItemId: '101', team: 'delivery' }, context, text).preview, confirmedFacts({ kind: 'requeue', workItemId: '101', team: 'delivery' }, context, `${text} `).preview);
});

test('a confirmed hand-off sends the branch, counts and findings, never the diff', () => {
  const context = { branch: 'unfold/handoff-cccccccccccc', commit: 'c'.repeat(40), base: 'origin/main', baseCommit: 'b'.repeat(40), sessionBranch: 'feat/x', commits: 0, uncommitted: true, files: 1, insertions: 1, deletions: 0, untracked: 0, findings: { tried: [], hypotheses: [], left: ['Finish it.'] } };
  const pending = { code: 'abcdefabcdef', sessionId, confirmation: `uhc_${'a'.repeat(24)}:${'e'.repeat(64)}`, context };
  const requeue = { kind: 'requeue', workItemId: '101', team: 'delivery', title: 'Fix rounding', budgetUsd: 5 };
  assert.deepEqual(sendRequest({ ...pending, target: requeue, facts: confirmedFacts(requeue, context, 'preview') }), { path: `/api/linked-sessions/${sessionId}/work-items/101/handoff`, body: { commandId: 'unfold-handoff-abcdefabcdef', team: 'delivery', budgetUsd: 5, preview: createHash('sha256').update('preview').digest('hex'), context }, headers: { 'x-unfold-confirmation': pending.confirmation } });
  const start = { kind: 'start', team: 'delivery', target: 'order-service', title: 'Round half up' };
  const started = sendRequest({ ...pending, target: start, facts: confirmedFacts(start, context, 'preview') });
  assert.equal(started.path, `/api/linked-sessions/${sessionId}/work-items`);
  assert.deepEqual(Object.keys(started.body), ['team', 'target', 'title', 'brief', 'budgetUsd', 'preview', 'context', 'requestId']);
  assert.equal(started.body.brief, 'Continue the work handed over from a Claude Code session: Round half up.\n- Finish it.');
});

type Call = { method: string; path: string; body: any; confirmation?: string; authorization?: string };
const handedOver = (call: Call) => call.method === 'POST' && !call.path.endsWith('/handoff/confirmations');

async function unfold(t: TestContext, workItems: unknown[] = [{ id: '101', title: 'Fix rounding', state: 'needs_human', team: 'delivery', baseBranch: 'main', budgetUsd: 5, available: true, reason: '' }]) {
  const calls: Call[] = [];
  const issued: string[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    calls.push({ method: req.method!, path: req.url!, body: text ? JSON.parse(text) : null, confirmation: req.headers['x-unfold-confirmation'] as string, authorization: req.headers.authorization });
    const send = (status: number, data: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data));
    if (req.url === `/api/linked-sessions/${sessionId}/handoff`) return send(200, { workItems });
    if (req.url === `/api/linked-sessions/${sessionId}/handoff/confirmations`) { issued.push(`uhc_${String(issued.length).padStart(24, '0')}:${'d'.repeat(64)}`); return send(201, { confirmation: { header: issued.at(-1) } }); }
    if (req.url === `/api/linked-sessions/${sessionId}/start-options`) return send(200, { teams: ['delivery'], targets: [{ key: 'order-service', repository: 'example/order-service', baseBranch: 'main' }], suggested: 'order-service', message: '' });
    if (req.url === `/api/linked-sessions/${sessionId}/work-items/101/handoff`) return send(200, { requeue: { workItemId: '101', fromRound: 1 }, note: '' });
    if (req.url === `/api/linked-sessions/${sessionId}/work-items`) return send(201, { workItem: { id: '120' }, linkError: '' });
    send(404, { error: { message: 'not found' } });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}`, calls, issued };
}

async function repository(t: TestContext) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'unfold-handoff-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.org', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8' }).trim();
  const origin = join(dir, 'example', 'order-service.git');
  await mkdir(origin, { recursive: true });
  git(origin, 'init', '-q', '--bare');
  const clone = join(dir, 'clone');
  git(dir, 'init', '-q', clone);
  git(clone, 'config', 'user.name', 'Test');
  git(clone, 'config', 'user.email', 'test@example.org');
  git(clone, 'remote', 'add', 'origin', origin);
  await writeFile(join(clone, 'rounding.ts'), 'export const round = (n: number) => n;\n');
  git(clone, 'add', 'rounding.ts');
  git(clone, 'commit', '-q', '-m', 'init');
  git(clone, 'push', '-q', 'origin', 'HEAD:main');
  git(clone, 'fetch', '-q', 'origin');
  git(clone, 'switch', '-q', '-c', 'feat/rounding');
  await writeFile(join(clone, 'rounding.ts'), 'export const round = (n: number) => Math.round(n * 100) / 100;\n');
  git(clone, 'commit', '-q', '-am', 'fix: round to cents');
  await writeFile(join(clone, 'rounding.ts'), 'export const round = (n: number) => Math.sign(n) * Math.round(Math.abs(n) * 100) / 100;\n');
  await writeFile(join(clone, 'invoice.ts'), 'export const invoice = 1;\n');
  const findingsFile = join(dir, 'findings.json');
  await writeFile(findingsFile, JSON.stringify(findings));
  const data = join(dir, 'plugin-data');
  return { dir, origin, clone, git, findingsFile, data };
}

function environment(url: string, data: string, extra: Record<string, string> = {}) {
  return { ...process.env, UNFOLD_URL: url, UNFOLD_TOKEN: 'vle_test', CLAUDE_CODE_SESSION_ID: sessionId, CLAUDE_PLUGIN_DATA: data, UNFOLD_GITLEAKS_BIN: '/nonexistent/gitleaks', ...extra };
}

const codeOf = (stdout: string) => /send ([0-9a-f]{12})$/m.exec(stdout)?.[1] ?? '';

test('/unfold:handoff previews without pushing or sending, then a confirmed send pushes a branch and hands the Work Item over', async t => {
  const repo = await repository(t);
  const server = await unfold(t);
  const env = environment(server.url, repo.data);
  const statusBefore = repo.git(repo.clone, 'status', '--porcelain');
  const shown = await run(process.execPath, [script, 'preview', '--findings', repo.findingsFile], { cwd: repo.clone, env });
  assert.match(shown.stdout, /Nothing is pushed or handed over until you confirm\. Unfold has the facts below to bind your confirmation to them, and keeps only their hash\./);
  assert.match(shown.stdout, /To: Team delivery\. Work Item 101 "Fix rounding" restarts from Round 1\./);
  assert.match(shown.stdout, /up to US\$5\.00 like the last attempt/);
  assert.match(shown.stdout, /2 files changed, \+2 -1/);
  assert.match(shown.stdout, /1 commit of yours not on origin\/main and your uncommitted changes/);
  assert.match(shown.stdout, /New files included: invoice\.ts\./);
  assert.match(shown.stdout, /\+export const invoice = 1;/, 'the diff shows new files');
  assert.match(shown.stdout, /built-in patterns found nothing/);
  assert.equal(repo.git(repo.clone, 'status', '--porcelain'), statusBefore, 'the preview leaves the index and working tree alone');
  assert.equal(repo.git(repo.origin, 'for-each-ref', '--format=%(refname)', 'refs/heads/unfold'), '', 'the preview pushes nothing');
  assert.deepEqual(server.calls.map(call => `${call.method} ${call.path}`), [`GET /api/linked-sessions/${sessionId}/handoff`, `POST /api/linked-sessions/${sessionId}/handoff/confirmations`], 'the preview only reads and asks Unfold for a confirmation');
  const asked = server.calls[1].body;
  assert.deepEqual([asked.kind, asked.workItemId, asked.team, asked.budgetUsd], ['requeue', '101', 'delivery', 5]);
  assert.equal(asked.preview, createHash('sha256').update(shown.stdout.slice(0, shown.stdout.lastIndexOf('\n\nTo send it'))).digest('hex'), 'the confirmation is asked for the exact preview text shown');
  const code = codeOf(shown.stdout);
  assert.ok(code, shown.stdout);

  const missing = await run(process.execPath, [script, 'send'], { cwd: repo.clone, env }).catch(error => error);
  assert.match(missing.stdout, /Name the preview to send/);
  const unknown = await run(process.execPath, [script, 'send', '0123456789ab'], { cwd: repo.clone, env }).catch(error => error);
  assert.match(unknown.stdout, /No hand-off preview 0123456789ab waits/);
  assert.equal(server.calls.some(handedOver), false, 'nothing is sent without the confirmed preview');

  const sent = await run(process.execPath, [script, 'send', code], { cwd: repo.clone, env });
  assert.match(sent.stdout, /Handed to Ploeg: Work Item 101 restarts from Round 1 for Team delivery from unfold\/handoff-[0-9a-f]{12}/);
  const branch = /from (unfold\/handoff-[0-9a-f]{12})/.exec(sent.stdout)![1];
  const pushed = repo.git(repo.origin, 'rev-parse', `refs/heads/${branch}`);
  assert.equal(repo.git(repo.origin, 'show', `${pushed}:invoice.ts`), 'export const invoice = 1;', 'the branch carries the uncommitted and new files');
  assert.match(repo.git(repo.origin, 'log', '-1', '--format=%s', pushed), /^wip: work in progress handed to Ploeg$/);
  assert.equal(repo.git(repo.clone, 'rev-parse', '--abbrev-ref', 'HEAD'), 'feat/rounding');
  assert.equal(repo.git(repo.clone, 'status', '--porcelain'), statusBefore);
  const post = server.calls.find(handedOver)!;
  assert.equal(post.path, `/api/linked-sessions/${sessionId}/work-items/101/handoff`);
  assert.equal(post.authorization, 'Bearer vle_test');
  assert.equal(post.confirmation, server.issued[0], 'the send carries the confirmation Unfold issued');
  assert.deepEqual(Object.keys(post.body), ['commandId', 'team', 'budgetUsd', 'preview', 'context']);
  const { commandId: _command, ...sentFacts } = post.body;
  const { kind: _kind, workItemId: _workItem, ...askedFacts } = asked;
  assert.deepEqual(sentFacts, askedFacts, 'the send carries the facts the confirmation was issued for');
  assert.equal(post.body.commandId, `unfold-handoff-${code}`);
  assert.deepEqual(post.body.context, { branch, commit: pushed, base: 'origin/main', baseCommit: repo.git(repo.clone, 'rev-parse', 'origin/main'), sessionBranch: 'feat/rounding', commits: 1, uncommitted: true, files: 2, insertions: 2, deletions: 1, untracked: 1, findings: { tried: findings.tried, hypotheses: findings.hypotheses, left: findings.left } });
  assert.doesNotMatch(JSON.stringify(post.body), /Math\.sign|invoice = 1/, 'the diff never travels in the request');
  assert.deepEqual(await readdir(join(repo.data, 'handoffs')), [], 'a sent preview is forgotten');
  const again = await run(process.execPath, [script, 'send', code], { cwd: repo.clone, env }).catch(error => error);
  assert.match(again.stdout, /No hand-off preview/);
});

test('/unfold:handoff refuses to send when the checkout changed after the preview', async t => {
  const repo = await repository(t);
  const server = await unfold(t);
  const env = environment(server.url, repo.data);
  const shown = await run(process.execPath, [script, 'preview', '101', '--findings', repo.findingsFile], { cwd: repo.clone, env });
  await writeFile(join(repo.clone, 'invoice.ts'), 'export const invoice = 2;\n');
  const changed = await run(process.execPath, [script, 'send', codeOf(shown.stdout)], { cwd: repo.clone, env }).catch(error => error);
  assert.match(changed.stdout, /The checkout changed since the preview.*Nothing was sent/);
  assert.equal(server.calls.some(handedOver), false);
  assert.equal(repo.git(repo.origin, 'for-each-ref', '--format=%(refname)', 'refs/heads/unfold'), '');
});

test('/unfold:handoff refuses a hand-off that would push a secret, from the built-in check or gitleaks, and sends nothing', async t => {
  const repo = await repository(t);
  const server = await unfold(t);
  await writeFile(join(repo.clone, 'settings.ts'), `export const forge = "${fakeToken}";\n`);
  const refused = await run(process.execPath, [script, 'preview', '--findings', repo.findingsFile], { cwd: repo.clone, env: environment(server.url, repo.data) }).catch(error => error);
  assert.match(refused.stdout, /^Refused: built-in patterns found what looks like a secret .*\(github-token in settings\.ts\)\. .*Nothing was pushed or sent\.$/m);
  assert.doesNotMatch(refused.stdout, new RegExp(fakeToken));
  await rm(join(repo.clone, 'settings.ts'));
  const leaky = join(repo.dir, 'fake-scanner.sh');
  await writeFile(leaky, '#!/bin/sh\ncat > /dev/null\nexit 42\n');
  await chmod(leaky, 0o755);
  const flagged = await run(process.execPath, [script, 'preview', '--findings', repo.findingsFile], { cwd: repo.clone, env: environment(server.url, repo.data, { UNFOLD_GITLEAKS_BIN: leaky }) }).catch(error => error);
  assert.match(flagged.stdout, /^Refused: gitleaks and built-in patterns found what looks like a secret .*\(gitleaks\)/m);
  await writeFile(repo.findingsFile, JSON.stringify({ ...findings, tried: [`Used ${fakeToken} to call the forge.`] }));
  const inFindings = await run(process.execPath, [script, 'preview', '--findings', repo.findingsFile], { cwd: repo.clone, env: environment(server.url, repo.data) }).catch(error => error);
  assert.match(inFindings.stdout, /github-token in \(findings\)/, 'the findings are scanned too');
  assert.equal(server.calls.some(handedOver), false);
  assert.equal(repo.git(repo.origin, 'for-each-ref', '--format=%(refname)', 'refs/heads/unfold'), '');
  const waiting = await readdir(join(repo.data, 'handoffs')).catch(() => []);
  assert.deepEqual(waiting, [], 'no preview waits to be sent');
});

test('/unfold:handoff --team starts a new Work Item from findings on standard input, and explains what it cannot hand over', async t => {
  const repo = await repository(t);
  const server = await unfold(t, [{ id: '102', title: 'Busy', state: 'leased', team: 'delivery', baseBranch: 'main', budgetUsd: null, available: false, reason: 'Ploeg is working on it now.' }]);
  const env = environment(server.url, repo.data);
  const none = await run(process.execPath, [script, 'preview', '--findings', repo.findingsFile], { cwd: repo.clone, env }).catch(error => error);
  assert.match(none.stdout, /No Work Item this session is linked to can be handed to Ploeg now \(102: Ploeg is working on it now\.\)\. Start a new Work Item instead with --team <team>\. Nothing was sent\./);
  const notLinked = await run(process.execPath, [script, 'preview', '#work/555', '--findings', repo.findingsFile], { cwd: repo.clone, env }).catch(error => error);
  assert.match(notLinked.stdout, /not linked to Work Item 555/);
  const stranger = await run(process.execPath, [script, 'preview', '--team', 'research', '--findings', repo.findingsFile], { cwd: repo.clone, env }).catch(error => error);
  assert.match(stranger.stdout, /cannot start work for Team research/);
  const child = spawn(process.execPath, [script, 'preview', '--team', 'delivery', '--findings', '-'], { cwd: repo.clone, env });
  let stdout = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stdin.end(JSON.stringify(findings));
  assert.equal(await new Promise(resolve => child.on('close', resolve)), 0, stdout);
  assert.match(stdout, /To: Team delivery\. A new Work Item "Round half up" in order-service/);
  assert.match(stdout, /Unfold does not know the cap before Ploeg admits it/);
  const sent = await run(process.execPath, [script, 'send', codeOf(stdout)], { cwd: repo.clone, env });
  assert.match(sent.stdout, /Work Item 120 is queued for Team delivery from unfold\/handoff-/);
  const post = server.calls.find(handedOver)!;
  assert.equal(post.path, `/api/linked-sessions/${sessionId}/work-items`);
  assert.equal(post.body.team, 'delivery');
  assert.equal(post.body.target, 'order-service');
  assert.equal(post.body.title, 'Round half up');
  assert.equal(post.confirmation, server.issued.at(-1));
  assert.equal(post.body.budgetUsd, null);
});

test('the plugin ships /unfold:handoff, which previews before it sends and leaves confirmation to the person', async () => {
  const command = await readFile(join(plugin, 'commands/handoff.md'), 'utf8');
  assert.match(command, /^---\ndescription: .+\nargument-hint: .+\n---\n/, 'no allowed-tools, so Claude Code asks before each run unless the person allowed it');
  assert.match(command, /scripts\/unfold-handoff\.mjs" preview \$ARGUMENTS --findings -/);
  assert.match(command, /scripts\/unfold-handoff\.mjs" send <code>/);
  assert.match(command, /Never confirm for them/);
});
