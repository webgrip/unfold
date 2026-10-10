import assert from 'node:assert/strict';
import { test } from 'node:test';
import { askDialogMarkup, askMarkup, workMarkup } from '../public/ploeg.js';
import { ploegDemo } from '../src/ploeg-demo.ts';

const at = '2026-10-10T10:00:00Z';
const detail = (demo = false) => ({ item: { id: '42', state: 'leased', title: 'Fix Safari login' }, demo });
const ask = (extra = {}) => ({ id: 'a1', workItemId: '42', askerId: 'owner', askerName: 'Ryan', audience: 'internal', question: 'How far is it?', answer: 'It is being worked on now.', status: 'answered', demo: false, ploegAskId: 'p1', model: 'glm', costUsd: 0.0011, costStatus: 'settled', failure: null, createdAt: at, answeredAt: at, ...extra });

test('the Ask card says the agents never see the question and shows each Ask with its cost', () => {
  const html = askMarkup(detail(), { asks: { items: [ask()], demo: false, error: '' }, askBusy: false });
  assert.match(html, /The agents do not see your question and it does not change the work/);
  assert.match(html, /Ask Allowance/);
  assert.match(html, /data-action="work-ask-open"/);
  assert.doesNotMatch(html, /<form/);
  assert.match(html, /<strong>Ryan<\/strong> asked: How far is it\?/);
  assert.match(html, /It is being worked on now\./);
  assert.match(html, /Cost <span class="num money"/);
});

test('questions and answers are escaped, never rendered as markup', () => {
  const html = askMarkup(detail(), { asks: { items: [ask({ question: '<img src=x onerror=alert(1)>', answer: '<script>alert(2)</script>' })], demo: false, error: '' } });
  assert.doesNotMatch(html, /<img src=x|<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('pending, unknown, refused and demo Asks each say what they are', () => {
  const html = askMarkup(detail(), { asks: { items: [
    ask({ id: 'a', costStatus: 'pending', costUsd: null }),
    ask({ id: 'b', status: 'failed', costStatus: 'unknown', costUsd: null, answer: '', failure: 'Ploeg did not admit the question.' }),
    ask({ id: 'c', status: 'refused', costStatus: 'settled', costUsd: 0, answer: '', failure: 'Ask Allowance used up. It resets on 1 November.' }),
  ], demo: false, error: '' } });
  assert.match(html, /Cost pending/);
  assert.match(html, /Cost not reported/);
  assert.match(html, /Ask Allowance used up\. It resets on 1 November\./);
  const demo = askMarkup(detail(true), { asks: { items: [ask({ demo: true, costStatus: 'demo', costUsd: null })], demo: true, error: '' } });
  assert.match(demo, /This is a demo: answers come from fixed rules/);
  assert.match(demo, /Demo answer · no model call/);
  assert.doesNotMatch(demo, /Ask Allowance/);
});

test('while an Ask is answered its question is shown first as Answering', () => {
  const html = askMarkup(detail(), { asks: { items: [ask()], demo: false, error: '' }, askBusy: true, askDraft: 'Why did it <stop>?' });
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /<ol[^>]*><li class="work-ask-item"><p class="work-ask-question"><strong>You<\/strong> asked: Why did it &lt;stop&gt;\?<\/p><p class="work-ask-answer" aria-busy="true">Answering…/);
});

test('the Ask dialog says the agents never see the question and limits it to 2000 characters', () => {
  const html = askDialogMarkup(detail());
  assert.match(html, /data-form="work-ask" data-id="42"/);
  assert.match(html, /maxlength="2000" required/);
  assert.match(html, /The agents do not see your question/);
  assert.match(askDialogMarkup(detail(true)), /no model call and no spend/);
});

test('the Work Item page shows the Ask card under the status', () => {
  const demoDetail = { ...structuredClone(ploegDemo.details['119']), demo: true, fetchedAt: at };
  const html = workMarkup({ lane: 'all', team: '', loading: false, refreshing: false, loadingMore: false, detailId: '119', detail: demoDetail, detailError: null, listHref: '#work', canCancel: true, sessions: [], reviewFacts: {}, now: Date.parse(at), asks: { items: [], demo: true, error: '' } });
  assert.match(html, /id="work-ask"/);
});
