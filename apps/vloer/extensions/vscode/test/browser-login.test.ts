import test from 'node:test';
import assert from 'node:assert/strict';
import { browserLogin, safeSignInUrl } from '../src/browser-login.ts';

function harness(readyAfter: number, cancelAt = Infinity) {
  const calls: string[] = [];
  let polls = 0;
  const client = {
    async authMethods() { return { local: true, oidc: { name: 'Authentik', issuer: 'https://auth.example' } }; },
    async beginBrowserLogin() { calls.push('begin'); return { code: 'code-1234', secret: 'secret', url: 'http://127.0.0.1:4081/api/auth/oidc?editor=code-1234', expiresIn: 600 }; },
    async collectBrowserLogin(code: string, secret: string) { polls += 1; calls.push(`poll:${code}:${secret}`); return polls >= readyAfter ? { status: 'ready' as const, cookie: 'vloer=abcdefghijklmnopqrstuvwxyz0123456789ABCD; Path=/; HttpOnly', user: { name: 'ryan' } } : { status: 'pending' as const }; },
    async acceptCookie(cookie: string) { calls.push(`accept:${cookie.split(';')[0]}`); },
  };
  const opened: string[] = [];
  const ui = { open: async (url: string) => { opened.push(url); }, cancelled: () => polls >= cancelAt, sleep: async () => {} };
  return { client, ui, calls, opened };
}

test('a browser sign-in opens the workbench URL, polls until the session is ready, and stores the cookie', async () => {
  const { client, ui, calls, opened } = harness(3);
  const user = await browserLogin(client, ui, 'http://127.0.0.1:4081', 0);
  assert.deepEqual(user, { name: 'ryan' });
  assert.deepEqual(opened, ['http://127.0.0.1:4081/api/auth/oidc?editor=code-1234']);
  assert.deepEqual(calls, ['begin', 'poll:code-1234:secret', 'poll:code-1234:secret', 'poll:code-1234:secret', 'accept:vloer=abcdefghijklmnopqrstuvwxyz0123456789ABCD']);
});

test('cancelling stops polling without a session, and a foreign origin is refused', async () => {
  const { client, ui, calls } = harness(10, 2);
  assert.equal(await browserLogin(client, ui, 'http://127.0.0.1:4081', 0), undefined);
  assert.equal(calls.filter(call => call.startsWith('accept')).length, 0);
  assert.throws(() => safeSignInUrl('https://evil.example/api/auth/oidc', 'http://127.0.0.1:4081'), /another origin/);
});
