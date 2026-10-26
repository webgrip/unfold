import assert from 'node:assert/strict';
import { test } from 'node:test';
import { state } from '../public/core/state.js';
import { formPanel } from '../public/views/login.js';

test('with local sign-in off, the sign-in page shows only single sign-on', () => {
  state.authMethods = { local: false, oidc: { name: 'Authentik', issuer: 'https://auth.example' } };
  const card = formPanel('');
  assert.match(card, /Continue with Authentik/);
  assert.match(card, /href="\/api\/auth\/oidc"/);
  assert.doesNotMatch(card, /data-form="login"/);
  assert.doesNotMatch(card, /type="password"/);
  assert.doesNotMatch(card, /or use a local account/);
});

test('with local sign-in on, the sign-in page offers single sign-on and the password form', () => {
  state.authMethods = { local: true, oidc: { name: 'Authentik', issuer: 'https://auth.example' } };
  const card = formPanel('');
  assert.match(card, /Continue with Authentik/);
  assert.match(card, /data-form="login"/);
  assert.match(card, /or use a local account/);
});

test('without single sign-on the password form shows even when the methods say local is off', () => {
  state.authMethods = { local: false, oidc: null };
  assert.match(formPanel(''), /data-form="login"/);
});
