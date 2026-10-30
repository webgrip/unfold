import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  ClientSignOffError, ClientSignOffStore, ClientSignOffs, clientSignOffCommentKey, globMatches, mayRecordSignOff, parseSignOffFile,
  signOffCommentMarkdown, signOffCommitStatus, wholeChangeMinusExclusions, type ClientSignOffSource, type SignOffCommitStatus, type SignOffPerson,
} from '../src/client-sign-off.ts';
import type { CommentRequest } from '../src/cards/service.ts';
import type { FactsPullRequest } from '../src/cards/facts.ts';

const shaA = 'a'.repeat(40);
const shaB = 'b'.repeat(40);
const operator: SignOffPerson = { id: 'u-olga', name: 'olga', role: 'operator', attribution: 'proven' };
const viewer: SignOffPerson = { id: 'u-vera', name: 'vera', role: 'viewer', attribution: 'asserted' };
const at = new Date('2026-10-29T10:00:00.000Z');

const changed = (head: string, paths: string[], truncated = false) => ({ headSha: head, truncated, capturedAt: '2026-10-29T09:00:00Z', paths: paths.map(path => ({ path, status: 'modified' })) });
const pullRequest = (fields: Partial<FactsPullRequest> = {}) => ({
  id: '9', forge: 'forgejo', owner: 'webgrip', repo: 'shop', number: 42, url: 'https://forgejo.example.org/webgrip/shop/pulls/42', state: 'open',
  openedAt: '2026-10-29T08:00:00Z', firstSeenAt: '2026-10-29T08:00:00Z', headSha: shaA, changedPaths: changed(shaA, ['src/pages/home.tsx', 'infra/deploy.yaml']), ...fields,
}) as FactsPullRequest;

function fixture(options: { team?: string; enabled?: boolean; comment?: boolean; failWrite?: boolean; readFile?: string | null; status?: boolean } = {}) {
  const world = { pullRequests: [pullRequest()] };
  const puts: { id: string; key: string; body: CommentRequest }[] = [];
  const statuses: SignOffCommitStatus[] = [];
  const timers: (() => void)[] = [];
  const logged: string[] = [];
  const source: ClientSignOffSource = {
    async factsSupported() { return true; },
    async workItemFacts(id) { return { workItem: { id, team: options.team ?? 'bronze' } as never, pullRequests: world.pullRequests }; },
    async putPullRequestComment(id, key, body) {
      if (options.failWrite) throw new Error('ploeg answered 403 person_token_required');
      puts.push({ id, key, body });
      return { pullRequest: { id: '9', forge: 'forgejo', owner: 'webgrip', repo: 'shop', number: 42 }, commentId: 7, imageUrl: null, created: puts.length === 1 };
    },
  };
  const store = new ClientSignOffStore(new DatabaseSync(':memory:'));
  const signOffs = new ClientSignOffs(source, store, {
    enabled: async () => options.enabled ?? true,
    commentEnabled: async () => options.comment ?? true,
    schedule: run => timers.push(run),
    now: () => at,
    log: (_level, event, detail) => logged.push(`${event}:${detail.outcome ?? detail.message}`),
    ...(options.readFile !== undefined ? { readFile: async () => options.readFile ?? null } : {}),
    ...(options.status ? { writeStatus: async (_id: string, status: SignOffCommitStatus) => { statuses.push(status); } } : {}),
  });
  const flush = async () => { for (const run of timers.splice(0)) run(); await new Promise(done => setImmediate(done)); };
  return { world, puts, statuses, timers, logged, store, signOffs, flush };
}

const refused = (code: string) => (error: unknown) => error instanceof ClientSignOffError && error.code === code;

test('globs match across directories with **, within one with * and ?, by name without a slash, and below a directory ending in /', () => {
  assert.equal(globMatches('infra/**', 'infra/deploy.yaml'), true);
  assert.equal(globMatches('infra/**', 'infra/k8s/app.yaml'), true);
  assert.equal(globMatches('infra/**', 'src/infra.ts'), false);
  assert.equal(globMatches('src/*.ts', 'src/a.ts'), true);
  assert.equal(globMatches('src/*.ts', 'src/deep/a.ts'), false);
  assert.equal(globMatches('src/**/*.test.ts', 'src/a.test.ts'), true);
  assert.equal(globMatches('src/**/*.test.ts', 'src/x/y/a.test.ts'), true);
  assert.equal(globMatches('*.lock', 'apps/web/yarn.lock'), true);
  assert.equal(globMatches('dist', 'apps/web/dist/main.js'), true);
  assert.equal(globMatches('.forgejo/', '.forgejo/workflows/ci.yml'), true);
  assert.equal(globMatches('page?.md', 'page1.md'), true);
  assert.equal(globMatches('a.b', 'aXb'), false, 'a dot is literal');
});

test('the repository file gives exclusion globs only, and every other key, such as a Client, is ignored', () => {
  assert.deepEqual(parseSignOffFile('# sign-off scope\nclient: Bakkerij Jansen\nexclude:\n  - dist/**\n  - "generated/*.json"   # build output\n  - \'infra/\'\napprover: someone\nkeep:\n  - content/**\n'), ['dist/**', 'generated/*.json', 'infra/']);
  assert.deepEqual(parseSignOffFile('client:\n  - name: x\n'), []);
});

test('the scope is the whole change by default, minus the Agency’s exclusions, and the repository file loses where the Client Profile keeps a path', () => {
  const paths = changed(shaA, ['src/pages/home.tsx', 'infra/deploy.yaml', 'content/prices.md', 'dist/app.js']);
  const whole = wholeChangeMinusExclusions.scope({ changedPaths: paths, profile: null, repository: [] });
  assert.equal(whole.wholeChange, true);
  assert.deepEqual(whole.covered, ['content/prices.md', 'dist/app.js', 'infra/deploy.yaml', 'src/pages/home.tsx']);
  const partial = wholeChangeMinusExclusions.scope({ changedPaths: paths, profile: { exclude: ['infra/**'], keep: ['content/**'] }, repository: ['dist/**', 'content/**'] });
  assert.equal(partial.wholeChange, false);
  assert.deepEqual(partial.excluded, ['dist/app.js', 'infra/deploy.yaml']);
  assert.deepEqual(partial.covered, ['content/prices.md', 'src/pages/home.tsx'], 'the Client Profile keeps content/ although the file excludes it');
  assert.equal(partial.rule, 'whole-change-minus-exclusions/1');
  const renamed = wholeChangeMinusExclusions.scope({ changedPaths: { ...paths, paths: [{ path: 'src/new.ts', status: 'renamed', previousPath: 'infra/old.ts' }] }, profile: { exclude: ['infra/**'], keep: [] }, repository: [] });
  assert.deepEqual(renamed.excluded, ['infra/old.ts'], 'a rename counts both of its paths');
  const truncated = wholeChangeMinusExclusions.scope({ changedPaths: changed(shaA, ['a.ts'], true), profile: null, repository: [] });
  assert.equal(truncated.wholeChange, false);
  const missing = wholeChangeMinusExclusions.scope({ changedPaths: null, profile: null, repository: [] });
  assert.deepEqual([missing.missing, missing.wholeChange, missing.covered], [true, false, []]);
});

test('only an administrator or operator records a Sign-off until Client users can sign in', async () => {
  assert.deepEqual([mayRecordSignOff({ role: 'admin' }), mayRecordSignOff({ role: 'operator' }), mayRecordSignOff({ role: 'viewer' })], [true, true, false]);
  const { signOffs, store } = fixture();
  await assert.rejects(signOffs.record(viewer, '184', { answer: 'looks_good', headSha: shaA }), (error: unknown) => error instanceof ClientSignOffError && error.status === 403);
  await assert.rejects(signOffs.withdraw(viewer, '184'), (error: unknown) => error instanceof ClientSignOffError && error.status === 403);
  assert.deepEqual(store.forWorkItem('184'), []);
});

test('a Sign-off binds to the head the person saw, records the Work Item, pull request, person, time and scope, and changes nothing else', async () => {
  const { signOffs, store, world } = fixture();
  store.setExclusions({ client: '', repository: 'WebGrip/Shop', exclude: ['infra/**'], keep: [], repositoryFile: false, updatedAt: at.toISOString(), updatedBy: 'u-admin' });
  const signed = await signOffs.record(operator, '184', { answer: 'looks_good', headSha: shaA.slice(0, 10) });
  assert.equal(signed.workItemId, '184');
  assert.deepEqual(signed.pullRequest, { id: '9', forge: 'forgejo', owner: 'webgrip', repo: 'shop', number: 42 });
  assert.equal(signed.headSha, shaA, 'a short head the person saw binds to the full commit');
  assert.deepEqual(signed.person, { id: 'u-olga', name: 'olga', role: 'operator', attribution: 'proven', onBehalfOfClient: true });
  assert.equal(signed.recordedAt, at.toISOString());
  assert.deepEqual([signed.scope.covered, signed.scope.excluded, signed.scope.wholeChange], [['src/pages/home.tsx'], ['infra/deploy.yaml'], false]);
  assert.equal(store.forWorkItem('184')[0].state, 'current');
  await assert.rejects(signOffs.record(operator, '184', { answer: 'looks_good', headSha: shaB }), refused('head_moved'));
  await assert.rejects(signOffs.record(operator, '184', { answer: 'needs_changes', note: '  ', headSha: shaA }), refused('sign_off_note_required'));
  await assert.rejects(signOffs.record(operator, '184', { answer: 'accepted', headSha: shaA }), refused('sign_off_answer'));
  await assert.rejects(signOffs.record(operator, '184', { answer: 'looks_good' }), refused('sign_off_head'));
  world.pullRequests = [pullRequest({ state: 'merged' })];
  await assert.rejects(signOffs.record(operator, '184', { answer: 'looks_good', headSha: shaA }), refused('no_open_pull_request'));
  assert.equal(await fixture({ enabled: false }).signOffs.record(operator, '184', { answer: 'looks_good', headSha: shaA }).catch(error => error.code), 'client_sign_off_off');
});

test('a stored scope stays as signed when the Agency changes its exclusions later', async () => {
  const { signOffs, store } = fixture();
  await signOffs.record(operator, '184', { answer: 'looks_good', headSha: shaA });
  store.setExclusions({ client: '', repository: 'webgrip/shop', exclude: ['infra/**'], keep: [], repositoryFile: false, updatedAt: at.toISOString(), updatedBy: 'u-admin' });
  const view = await signOffs.view('184');
  assert.equal(view.current?.scope.wholeChange, true);
  assert.deepEqual(view.scope?.excluded, ['infra/deploy.yaml'], 'the next sign-off uses the new globs');
});

test('the repository file’s exclusions apply only when the Agency turned the file on', async () => {
  const on = fixture({ readFile: 'exclude:\n  - src/**\n' });
  on.store.setExclusions({ client: '', repository: 'webgrip/shop', exclude: [], keep: [], repositoryFile: true, updatedAt: at.toISOString(), updatedBy: 'u-admin' });
  assert.deepEqual((await on.signOffs.record(operator, '184', { answer: 'looks_good', headSha: shaA })).scope.excluded, ['src/pages/home.tsx']);
  const off = fixture({ readFile: 'exclude:\n  - src/**\n' });
  assert.deepEqual((await off.signOffs.record(operator, '184', { answer: 'looks_good', headSha: shaA })).scope.excluded, []);
});

test('a new head dismisses the Sign-off for good, a reset to the signed commit does not revive it, and a later Sign-off supersedes the earlier', async () => {
  const { signOffs, world } = fixture();
  const first = await signOffs.record(operator, '184', { answer: 'looks_good', headSha: shaA });
  const second = await signOffs.record(operator, '184', { answer: 'needs_changes', note: 'The price on the home page is wrong.', headSha: shaA });
  let view = await signOffs.view('184');
  assert.equal(view.current?.id, second.id);
  assert.equal(view.history.find(entry => entry.id === first.id)?.state, 'superseded');
  world.pullRequests = [pullRequest({ headSha: shaB, changedPaths: changed(shaB, ['src/pages/home.tsx']) })];
  view = await signOffs.view('184');
  assert.equal(view.current, null);
  assert.deepEqual([view.history[0].state, view.history[0].dismissedBy], ['dismissed', shaB]);
  world.pullRequests = [pullRequest()];
  view = await signOffs.view('184');
  assert.equal(view.current, null, 'a return to the signed commit leaves it dismissed');
});

test('a withdrawal ends the current Sign-off with the person and time and keeps it in the history', async () => {
  const { signOffs } = fixture();
  await assert.rejects(signOffs.withdraw(operator, '184'), refused('no_current_sign_off'));
  await signOffs.record(operator, '184', { answer: 'looks_good', headSha: shaA });
  const withdrawn = await signOffs.withdraw(operator, '184');
  assert.deepEqual([withdrawn.state, withdrawn.endedBy, withdrawn.endedAt], ['withdrawn', 'u-olga', at.toISOString()]);
  assert.equal((await signOffs.view('184')).history[0].state, 'withdrawn');
});

test('the comment is written once per window under key client-sign-off, names no person, note or money, and is skipped when unchanged', async () => {
  const { signOffs, puts, timers, logged, flush } = fixture();
  await signOffs.record(operator, '184', { answer: 'needs_changes', note: 'Olga thinks €40 is too much', headSha: shaA });
  await signOffs.withdraw(operator, '184');
  await signOffs.record(operator, '184', { answer: 'looks_good', headSha: shaA });
  assert.equal(timers.length, 1, 'three changes inside the window make one write');
  await flush();
  assert.equal(puts.length, 1);
  assert.equal(puts[0].key, clientSignOffCommentKey);
  assert.equal(puts[0].body.number, 42);
  assert.match(puts[0].body.markdown, /\*\*Looks good\*\* from the Client at `aaaaaaaaaa`, recorded by the Agency on the Client’s behalf/);
  assert.match(puts[0].body.markdown, /It covers the whole change: 2 changed files\./);
  assert.match(puts[0].body.markdown, /The Agency decides whether this pull request is accepted/);
  assert.doesNotMatch(puts[0].body.markdown, /olga|€|\$|price|cost/i);
  assert.equal(await signOffs.publish('184'), 'unchanged');
  assert.deepEqual(logged, ['client_sign_off.comment:published']);
});

test('a dismissal rewrites the comment, and a Team without the comment flag gets none', async () => {
  const { signOffs, world, puts, flush } = fixture();
  await signOffs.record(operator, '184', { answer: 'looks_good', headSha: shaA });
  await flush();
  world.pullRequests = [pullRequest({ headSha: shaB, changedPaths: changed(shaB, ['a.ts']) })];
  await signOffs.view('184');
  await flush();
  assert.equal(puts.length, 2);
  assert.match(puts[1].body.markdown, /dismissed by a newer commit `bbbbbbbbbb`\. No Client Sign-off is current for `bbbbbbbbbb`\./);
  const off = fixture({ comment: false });
  await off.signOffs.record(operator, '184', { answer: 'looks_good', headSha: shaA });
  assert.equal(await off.signOffs.publish('184'), 'flag_off');
  assert.equal(off.puts.length, 0);
});

test('a failed comment write is logged once, is not retried in a loop and leaves the Sign-off stored', async () => {
  const { signOffs, logged, timers, flush, store } = fixture({ failWrite: true });
  await signOffs.record(operator, '184', { answer: 'looks_good', headSha: shaA });
  await flush();
  assert.deepEqual(logged, ['client_sign_off.comment_failed:ploeg answered 403 person_token_required']);
  assert.equal(timers.length, 0);
  assert.equal(store.forWorkItem('184')[0].state, 'current');
});

test('the commit status seam reports success, failure or pending for the head, and is written only when a writer exists', async () => {
  const { signOffs, statuses, flush } = fixture({ status: true });
  const signed = await signOffs.record(operator, '184', { answer: 'looks_good', headSha: shaA });
  await flush();
  assert.deepEqual(statuses.map(status => [status.context, status.sha, status.state]), [['client-sign-off', shaA, 'success']]);
  assert.equal(signOffCommitStatus({ ...signed, answer: 'needs_changes' }, shaA).state, 'failure');
  assert.equal(signOffCommitStatus(signed, shaB).state, 'pending');
  assert.equal(signOffCommitStatus(null, shaA).state, 'pending');
  const plain = fixture();
  await plain.signOffs.record(operator, '184', { answer: 'looks_good', headSha: shaA });
  await plain.flush();
  assert.equal(plain.statuses.length, 0);
});

test('a sign-off without readable changed paths claims no part of the change in its comment', async () => {
  const { signOffs, world } = fixture();
  world.pullRequests = [pullRequest({ changedPaths: null })];
  const signed = await signOffs.record(operator, '184', { answer: 'looks_good', headSha: shaA });
  assert.match(signOffCommentMarkdown(signed, shaA), /could not read the changed files, so this sign-off does not claim any part of the change/);
  world.pullRequests = [pullRequest({ changedPaths: changed(shaA, ['a.ts', 'b.ts'], true) })];
  const partial = await signOffs.record(operator, '184', { answer: 'looks_good', headSha: shaA });
  assert.match(signOffCommentMarkdown(partial, shaA), /It covers 2 of 2 changed files; the full list of changed files was not available, so it does not cover the whole change\./);
});

test('after a restart the same stored Sign-off is written again under the same key, so no second comment appears', async () => {
  const { signOffs, store, puts, flush } = fixture();
  await signOffs.record(operator, '184', { answer: 'looks_good', headSha: shaA });
  await flush();
  const restarted = new ClientSignOffs({
    factsSupported: async () => true,
    workItemFacts: async id => ({ workItem: { id, team: 'bronze' } as never, pullRequests: [pullRequest()] }),
    putPullRequestComment: async (id, key, body) => { puts.push({ id, key, body }); return { pullRequest: { id: '9', forge: 'forgejo', owner: 'webgrip', repo: 'shop', number: 42 }, commentId: 7, imageUrl: null, created: false }; },
  }, store, { enabled: async () => true, commentEnabled: async () => true, schedule: () => undefined });
  assert.equal(await restarted.publish('184'), 'published');
  assert.equal(await restarted.publish('184'), 'unchanged');
  assert.deepEqual(puts.map(put => put.key), [clientSignOffCommentKey, clientSignOffCommentKey]);
  assert.equal(puts[0].body.markdown, puts[1].body.markdown);
});
