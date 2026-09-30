import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nowMarkup } from '../public/now.js';

const escape = value => String(value).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
const safeUrl = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } };
const helpers = { escape, icon: name => `<i data-icon="${name}"></i>`, money: value => `$${value}`, safeUrl, ago: () => 'now' };
const at = '2026-09-20T10:00:00Z';

const grafanaHelpers = { ...helpers, grafanaUrl: 'https://grafana.example.test/' };
const nowAt = Date.parse('2026-09-20T10:00:00Z');

function nowData() {
  return {
    demo: false,
    teams: ['delivery', 'research'],
    fetchedAt: '2026-09-20T09:59:00Z',
    errors: {},
    waiting: [
      { id: '105', team: 'delivery', state: 'awaiting_review', title: 'Round half-cent totals', url: 'https://tracker.test/tasks/105', createdAt: '2026-09-20T09:00:00Z', updatedAt: at, spentUsd: 1.5, pullRequestUrl: 'https://forge.test/acme/shop/pulls/9' },
      { id: '101', team: 'delivery', state: 'needs_human', title: 'Review the rounding criteria', url: '', createdAt: at, updatedAt: at, spentUsd: null, pullRequestUrl: '' },
      { id: '107', team: 'research', state: 'proposed', title: 'Clarify the research markets', url: 'https://tracker.test/tasks/107', createdAt: at, updatedAt: at, spentUsd: 0, pullRequestUrl: '' },
    ],
    running: [{ id: '40', workItemId: '102', workItemTitle: 'Regression investigation', team: 'delivery', role: 'implementer', round: 1, state: 'running', startedAt: '2026-09-20T09:30:00Z', authorizedUsd: 2.5, observedUsd: null, reservedModels: [], usage: null }],
    recent: [{ id: '31', workItemId: '105', workItemTitle: 'Round half-cent totals', team: 'delivery', role: 'reviewer', round: 2, state: 'finished', startedAt: '2026-09-20T09:00:00Z', finishedAt: '2026-09-20T09:30:00Z', outcome: 'pr_opened', verdict: 'approve', authorizedUsd: 2, observedUsd: null, reservedModels: ['gpt-x'], usage: null }],
  };
}

test('the Now page renders every readable team’s waiting work, running Runs and recent Runs with honest cost and links', () => {
  const html = nowMarkup({ data: nowData(), error: null }, grafanaHelpers, nowAt);
  for (const title of ['Waiting on you', 'Running now', 'Recently finished']) assert.match(html, new RegExp(title));
  assert.match(html, /data-now-row[^>]*href="#ploeg\/105"/);
  assert.match(html, /href="https:\/\/tracker\.test\/tasks\/105"[^>]*>[\s\S]*Tracker/);
  assert.match(html, /Pull request/);
  assert.match(html, /href="https:\/\/forge\.test\/acme\/shop\/pulls\/9"/);
  assert.match(html, /href="https:\/\/grafana\.example\.test\/d\/glide-loop\?var-team=delivery"/);
  assert.match(html, /\$1\.50 spent/);
  assert.match(html, /Cost not reported/, 'an unknown cost is never shown as zero');
  assert.match(html, /Model not reported/);
  assert.match(html, /Spend not reported of \$2\.50/);
  assert.doesNotMatch(html, /Spend \$0\.00/);
  assert.match(html, /Outcome pr opened/);
  assert.match(html, /Verdict approve/);
});

test('a failed Ploeg group shows an inline error with retry and never renders as empty', () => {
  const data = nowData();
  data.waiting = [];
  data.errors = { waiting: 'Ploeg could not provide its operator data.' };
  const html = nowMarkup({ data, error: null }, grafanaHelpers, nowAt);
  assert.match(html, /Waiting on you could not be read/);
  assert.match(html, /Ploeg could not provide its operator data\./);
  assert.match(html, /data-action="now-retry"/);
  assert.doesNotMatch(html, /Nothing waits on you/);
  assert.match(html, /Recently finished/);
  assert.match(html, /Outcome pr opened/, 'the healthy groups still render');
});

test('the Grafana link stays hidden without a configured dashboard URL and a page-level failure offers retry', () => {
  const html = nowMarkup({ data: nowData(), error: null }, helpers, nowAt);
  assert.doesNotMatch(html, /grafana/, 'no Grafana link is invented without observability');
  const failure = nowMarkup({ data: null, error: { message: 'Ploeg could not be reached.' } }, grafanaHelpers, nowAt);
  assert.match(failure, /Now could not be read/);
  assert.match(failure, /Ploeg could not be reached\./);
  assert.match(failure, /data-action="now-retry"/);
});
