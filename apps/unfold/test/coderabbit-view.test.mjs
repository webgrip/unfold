import test from 'node:test';
import assert from 'node:assert/strict';
import { codeRabbitMarkup } from '../public/views/coderabbit.js';

test('CodeRabbit evidence escapes provider text, identifies external scope and never presents incomplete work as verified', () => {
  const state = { session: { repositoryId: 'prices', execution: {} }, bootstrap: { user: { role: 'operator' }, coderabbitRepositories: ['prices'] }, coderabbit: { github: 'fixture/prices', base: 'main', reviewEnabled: true, securityEnabled: true, reviews: [{ id: 'r1', state: 'incomplete', headSha: 'a'.repeat(40), base: 'main', at: 'now', result: { findings: [{ severity: 'major', title: '<script>alert(1)</script>', fileName: '<img>', comment: 'fix <unsafe>' }] } }] } };
  const html = codeRabbitMarkup(state);
  assert.match(html, /findings are partial/); assert.match(html, /match to the frozen Unfold candidate has not been established/);
  assert.match(html, /separate from the Run budget/); assert.match(html, /&lt;script&gt;/); assert(!html.includes('<script>'));
  state.bootstrap.user.role = 'viewer';
  const viewer = codeRabbitMarkup(state); assert(!viewer.includes('Request CodeRabbit review')); assert(!viewer.includes('Import security findings'));
  assert.equal(codeRabbitMarkup({ session: {}, bootstrap: {} }), '');
});
