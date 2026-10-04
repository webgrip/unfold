import test from 'node:test';
import assert from 'node:assert/strict';
import { browserLogin, codePrompt, safeSignInUrl } from '../src/browser-login.ts';
import { credentialHeaders } from '../src/client.ts';

const token = `vle_${'a'.repeat(43)}`;

function harness(readyAfter: number, cancelAt = Infinity, failures: Record<number, unknown> = {}) {
  const calls: string[] = [];
  const slept: number[] = [];
  let polls = 0;
  const client = {
    async authMethods() { return { local: true, oidc: { name: 'Authentik', issuer: 'https://auth.example' } }; },
    async beginBrowserLogin() { calls.push('begin'); return { code: 'code-1234', secret: 'secret', userCode: 'BCDF-GHJK', url: 'http://127.0.0.1:4081/api/auth/oidc?editor=code-1234', expiresIn: 600, interval: 2 }; },
    async collectBrowserLogin(code: string, secret: string) {
      polls += 1;
      calls.push(`poll:${code}:${secret}`);
      if (failures[polls]) throw failures[polls];
      return polls >= readyAfter ? { status: 'ready' as const, token, user: { name: 'ryan' } } : { status: 'pending' as const };
    },
    async acceptCredential(value: string) { calls.push(`accept:${value}`); },
  };
  const opened: string[] = [];
  const codes: string[] = [];
  const ui = { open: async (url: string) => { opened.push(url); calls.push('open'); }, showCode: (code: string) => { codes.push(code); calls.push(`code:${code}`); }, cancelled: () => polls >= cancelAt, sleep: async (ms: number) => { slept.push(ms); } };
  return { client, ui, calls, opened, codes, slept };
}

test('a browser sign-in shows the code before it opens the workbench, polls until approval and stores the editor credential', async () => {
  const { client, ui, calls, opened, codes, slept } = harness(3);
  const user = await browserLogin(client, ui, 'http://127.0.0.1:4081');
  assert.deepEqual(user, { name: 'ryan' });
  assert.deepEqual(opened, ['http://127.0.0.1:4081/api/auth/oidc?editor=code-1234']);
  assert.deepEqual(codes, ['BCDF-GHJK']);
  assert.deepEqual(calls, ['begin', 'code:BCDF-GHJK', 'open', 'poll:code-1234:secret', 'poll:code-1234:secret', 'poll:code-1234:secret', `accept:${token}`]);
  assert.deepEqual(slept, [2000, 2000]);
  assert.equal(codePrompt('BCDF-GHJK'), 'Approve only if your browser shows BCDF-GHJK.');
});

test('a slow_down answer lengthens the polling interval, and a denial ends the sign-in without a credential', async () => {
  const slow = harness(3, Infinity, { 1: Object.assign(new Error('slow'), { code: 'slow_down' }) });
  await browserLogin(slow.client, slow.ui, 'http://127.0.0.1:4081');
  assert.deepEqual(slow.slept, [3000, 3000]);
  const denied = harness(10, Infinity, { 2: Object.assign(new Error('This editor sign-in was denied in the browser.'), { code: 'editor_login_denied' }) });
  await assert.rejects(browserLogin(denied.client, denied.ui, 'http://127.0.0.1:4081'), /denied in the browser/);
  assert.equal(denied.calls.filter(call => call.startsWith('accept')).length, 0);
});

test('cancelling stops polling without a credential, and a foreign origin is refused', async () => {
  const { client, ui, calls } = harness(10, 2);
  assert.equal(await browserLogin(client, ui, 'http://127.0.0.1:4081', 0), undefined);
  assert.equal(calls.filter(call => call.startsWith('accept')).length, 0);
  assert.throws(() => safeSignInUrl('https://evil.example/api/auth/oidc', 'http://127.0.0.1:4081'), /another origin/);
});

test('an editor credential travels as a bearer token and a password sign-in as its cookie', () => {
  assert.deepEqual(credentialHeaders(token), { Authorization: `Bearer ${token}` });
  assert.deepEqual(credentialHeaders('vloer=opaque-control-cookie'), { Cookie: 'vloer=opaque-control-cookie' });
  assert.deepEqual(credentialHeaders(undefined), {});
  assert.deepEqual(credentialHeaders('vle_short'), { Cookie: 'vle_short' });
});
