import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import type { FactsPullRequest, FactsRun, WorkItemFacts } from '../src/cards/facts.ts';
import { focusCsv, focusDecimal, focusExport, focusExportColumns, focusExportQuery, focusFile, focusJsonl, focusTime, FocusQueryError, type FocusExportQuery } from '../src/focus-export.ts';
import { hashPassword } from '../src/auth.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import type { Ownership } from '../src/tenancy.ts';
import { application, login, request } from './api-support.ts';

/**
 * The Cost and Usage columns of FOCUS 1.4 as [feature level, allows nulls, data type], copied from the column table of
 * specification/datasets/cost_and_usage/dataset.md at tag v1.4 (commit f1eeb30a78f7c141ef1237d589355296a2761c1c) of
 * github.com/FinOps-Open-Cost-and-Usage-Spec/FOCUS_Spec, CC-BY-4.0.
 */
const focusSpec: Record<string, ['Mandatory' | 'Recommended' | 'Conditional', boolean, 'String' | 'Decimal' | 'Date/Time' | 'JSON']> = {
  AllocatedMethodDetails: ['Recommended', true, 'JSON'], AllocatedMethodId: ['Conditional', true, 'String'], AllocatedResourceId: ['Conditional', true, 'String'],
  AllocatedResourceName: ['Conditional', true, 'String'], AllocatedTags: ['Conditional', true, 'JSON'], AvailabilityZone: ['Recommended', true, 'String'],
  BilledCost: ['Mandatory', false, 'Decimal'], BillingAccountId: ['Mandatory', false, 'String'], BillingAccountName: ['Mandatory', true, 'String'],
  BillingAccountType: ['Conditional', false, 'String'], BillingCurrency: ['Mandatory', false, 'String'], BillingPeriodEnd: ['Mandatory', false, 'Date/Time'],
  BillingPeriodStart: ['Mandatory', false, 'Date/Time'], CapacityReservationId: ['Conditional', true, 'String'], CapacityReservationStatus: ['Conditional', true, 'String'],
  ChargeCategory: ['Mandatory', false, 'String'], ChargeClass: ['Mandatory', true, 'String'], ChargeDescription: ['Mandatory', true, 'String'],
  ChargeFrequency: ['Recommended', false, 'String'], ChargePeriodEnd: ['Mandatory', false, 'Date/Time'], ChargePeriodStart: ['Mandatory', false, 'Date/Time'],
  CommitmentDiscountCategory: ['Conditional', true, 'String'], CommitmentDiscountId: ['Conditional', true, 'String'], CommitmentDiscountName: ['Conditional', true, 'String'],
  CommitmentDiscountQuantity: ['Conditional', true, 'Decimal'], CommitmentDiscountStatus: ['Conditional', true, 'String'], CommitmentDiscountType: ['Conditional', true, 'String'],
  CommitmentDiscountUnit: ['Conditional', true, 'String'], CommitmentProgramEligibilityDetails: ['Conditional', true, 'JSON'], ConsumedQuantity: ['Conditional', true, 'Decimal'],
  ConsumedUnit: ['Conditional', true, 'String'], ContractApplied: ['Conditional', true, 'JSON'], ContractedCost: ['Mandatory', false, 'Decimal'],
  ContractedUnitPrice: ['Conditional', true, 'Decimal'], EffectiveCost: ['Mandatory', false, 'Decimal'], HostProviderName: ['Mandatory', true, 'String'],
  InvoiceDetailId: ['Conditional', true, 'String'], InvoiceId: ['Conditional', true, 'String'], InvoiceIssuerName: ['Mandatory', false, 'String'],
  ListCost: ['Mandatory', false, 'Decimal'], ListUnitPrice: ['Conditional', true, 'Decimal'], PricingCategory: ['Conditional', true, 'String'],
  PricingCurrency: ['Conditional', false, 'String'], PricingCurrencyContractedUnitPrice: ['Conditional', true, 'Decimal'], PricingCurrencyEffectiveCost: ['Conditional', false, 'Decimal'],
  PricingCurrencyListUnitPrice: ['Conditional', true, 'Decimal'], PricingQuantity: ['Mandatory', true, 'Decimal'], PricingUnit: ['Mandatory', true, 'String'],
  RegionId: ['Conditional', true, 'String'], RegionName: ['Conditional', true, 'String'], ResourceId: ['Conditional', true, 'String'],
  ResourceName: ['Conditional', true, 'String'], ResourceType: ['Conditional', true, 'String'], ServiceCategory: ['Mandatory', false, 'String'],
  ServiceName: ['Mandatory', false, 'String'], ServiceProviderName: ['Mandatory', false, 'String'], ServiceSubcategory: ['Recommended', false, 'String'],
  SkuId: ['Conditional', true, 'String'], SkuMeter: ['Conditional', true, 'String'], SkuPriceDetails: ['Conditional', true, 'JSON'],
  SkuPriceId: ['Conditional', true, 'String'], SubAccountId: ['Conditional', true, 'String'], SubAccountName: ['Conditional', true, 'String'],
  SubAccountType: ['Conditional', true, 'String'], Tags: ['Conditional', true, 'JSON'],
};
const serviceCategories = ['AI and Machine Learning', 'Analytics', 'Business Applications', 'Compute', 'Databases', 'Developer Tools', 'Multicloud', 'Identity', 'Integration', 'Internet of Things', 'Management and Governance', 'Media', 'Migration', 'Mobile', 'Networking', 'Security', 'Storage', 'Web', 'Other'];
const aiSubcategories = ['AI Platforms', 'Bots', 'Generative AI', 'Machine Learning', 'Natural Language Processing', 'Other (AI and Machine Learning)'];

type Cell = string | null;
const decimalPattern = /^-?\d+(?:\.\d+)?(?:E-?\d+)?$/;
const timePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/**
 * Checks parsed rows (every value text or null) against FOCUS 1.4's Cost and Usage requirements that apply to this
 * export, and answers each broken rule as `Column: rule (spec section)`.
 */
function focusProblems(columns: readonly string[], rows: Record<string, Cell>[]): string[] {
  const problems: string[] = [];
  for (const [name, [level]] of Object.entries(focusSpec)) if (level === 'Mandatory' && !columns.includes(name)) problems.push(`${name}: a Mandatory column is missing (3.1)`);
  for (const name of columns) {
    if (name.startsWith('x_')) { if (!/^x_[A-Z][A-Za-z0-9]*$/.test(name) || name.length > 50) problems.push(`${name}: a custom column is x_ and Pascal case, at most 50 characters (4.3)`); }
    else if (!focusSpec[name]) problems.push(`${name}: neither a FOCUS 1.4 Cost and Usage column nor x_-prefixed (4.3)`);
  }
  const pricedBySku = columns.includes('SkuPriceId');
  rows.forEach((row, index) => {
    const fail = (rule: string) => problems.push(`row ${index + 1} ${rule}`);
    for (const name of columns) {
      const value = row[name] ?? null;
      const spec = focusSpec[name];
      if (value === '') fail(`${name}: absent is null, never an empty string (4.12 Null Handling)`);
      if (!spec) continue;
      const [, nullable, type] = spec;
      if (value === null) { if (!nullable) fail(`${name}: must not be null (3.1 column table)`); continue; }
      if (type === 'Decimal' && !decimalPattern.test(value)) fail(`${name}: "${value}" is not a FOCUS decimal (4.13 Numeric Format)`);
      if (type === 'Date/Time' && !(timePattern.test(value) && Number.isFinite(Date.parse(value)))) fail(`${name}: "${value}" is not YYYY-MM-DDTHH:mm:ssZ (4.7 Date/Time Format)`);
      if (type === 'JSON') {
        let parsed: unknown;
        try { parsed = JSON.parse(value); } catch { parsed = undefined; }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.values(parsed).some(entry => entry !== null && typeof entry === 'object')) fail(`${name}: must be a JSON object with scalar values (4.10 Key-Value Format)`);
      }
      if (type === 'String' && !value.trim()) fail(`${name}: a string is not only whitespace (4.14 String Handling)`);
    }
    const get = (name: string) => row[name] ?? null;
    const number = (name: string) => Number(get(name));
    if (!['Usage', 'Purchase', 'Tax', 'Credit', 'Adjustment'].includes(get('ChargeCategory') ?? '')) fail('ChargeCategory: not an allowed value (3.1.16)');
    if (get('ChargeClass') !== null && get('ChargeClass') !== 'Correction') fail('ChargeClass: null or "Correction" (3.1.17)');
    if (get('ChargeFrequency') !== null && !['One-Time', 'Recurring', 'Usage-Based'].includes(get('ChargeFrequency')!)) fail('ChargeFrequency: not an allowed value (3.1.19)');
    if (!serviceCategories.includes(get('ServiceCategory') ?? '')) fail('ServiceCategory: not an allowed value (3.1.55)');
    if (get('ServiceCategory') === 'AI and Machine Learning' && columns.includes('ServiceSubcategory') && !aiSubcategories.includes(get('ServiceSubcategory') ?? '')) fail('ServiceSubcategory: not a subcategory of its ServiceCategory (3.1.57)');
    for (const name of ['BillingCurrency', 'PricingCurrency']) if (columns.includes(name) && !/^[A-Z]{3}$/.test(get(name) ?? '')) fail(`${name}: an ISO 4217 three-letter code (4.2 Currency Format)`);
    if (Date.parse(get('ChargePeriodStart')!) >= Date.parse(get('ChargePeriodEnd')!)) fail('ChargePeriodStart: the inclusive start is before the exclusive end (3.1.20, 3.1.21)');
    if (Date.parse(get('BillingPeriodStart')!) > Date.parse(get('ChargePeriodStart')!) || Date.parse(get('BillingPeriodEnd')!) < Date.parse(get('ChargePeriodEnd')!)) fail('ChargePeriod: inside its BillingPeriod (3.1.12, 3.1.13)');
    if (get('ChargeCategory') === 'Usage' && number('EffectiveCost') !== number('BilledCost')) fail('EffectiveCost: equals BilledCost for uncovered usage (3.1.35)');
    if (!columns.includes('ListUnitPrice') && number('ListCost') !== number('BilledCost')) fail('ListCost: equals BilledCost without a ListUnitPrice for an unrelated charge (3.1.40)');
    if (!columns.includes('ContractedUnitPrice') && number('ContractedCost') !== number('BilledCost')) fail('ContractedCost: equals BilledCost without a ContractedUnitPrice for an unrelated charge (3.1.33)');
    if (get('HostProviderName') !== null && get('HostProviderName') !== get('ServiceProviderName')) fail('HostProviderName: matches ServiceProviderName when no host is exposed (3.1.36)');
    if (!pricedBySku && (get('PricingQuantity') !== null || get('ConsumedQuantity') !== null)) fail('PricingQuantity, ConsumedQuantity: null when SkuPriceId is null (3.1.30, 3.1.47)');
    if ((get('PricingQuantity') === null) !== (get('PricingUnit') === null)) fail('PricingUnit: null exactly when PricingQuantity is (3.1.48)');
    if ((get('ConsumedQuantity') === null) !== (get('ConsumedUnit') === null)) fail('ConsumedUnit: null exactly when ConsumedQuantity is (3.1.31)');
    if ((get('SubAccountId') === null) !== (get('SubAccountName') === null) || (columns.includes('SubAccountType') && (get('SubAccountId') === null) !== (get('SubAccountType') === null))) fail('SubAccountName, SubAccountType: null exactly when SubAccountId is (3.1.63, 3.1.64)');
    if (columns.includes('ResourceType') && (get('ResourceId') === null) !== (get('ResourceType') === null)) fail('ResourceType: null exactly when ResourceId is (3.1.53)');
    if (get('ResourceId') === null && get('ResourceName') !== null) fail('ResourceName: null when ResourceId is (3.1.52)');
    if (get('ResourceName') !== null && get('ResourceName') === get('ResourceId')) fail('ResourceName: never duplicates ResourceId (3.1.52)');
    if (get('BillingCurrency') === get('PricingCurrency') && number('PricingCurrencyEffectiveCost') !== number('EffectiveCost')) fail('PricingCurrencyEffectiveCost: the PricingCurrency equivalent of EffectiveCost (3.1.45)');
  });
  return problems;
}

function parseCsv(text: string): { columns: string[]; rows: Record<string, Cell>[] } {
  const records: string[][] = [];
  let field = '', record: string[] = [], quoted = false, i = 0, wasQuoted = false;
  const fields: boolean[][] = [];
  let quotes: boolean[] = [];
  while (i < text.length) {
    const c = text[i]!;
    if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; } if (c === '"') { quoted = false; i++; continue; } field += c; i++; continue; }
    if (c === '"') { quoted = true; wasQuoted = true; i++; continue; }
    if (c === ',') { record.push(field); quotes.push(wasQuoted); field = ''; wasQuoted = false; i++; continue; }
    if (c === '\r' && text[i + 1] === '\n') { record.push(field); quotes.push(wasQuoted); records.push(record); fields.push(quotes); record = []; quotes = []; field = ''; wasQuoted = false; i += 2; continue; }
    field += c; i++;
  }
  assert.equal(field, '', 'the file ends with CRLF');
  const [columns, ...body] = records;
  return { columns: columns!, rows: body.map((cells, row) => Object.fromEntries(columns!.map((name, index) => [name, cells[index] === '' && !fields[row + 1]![index] ? null : cells[index]!]))) };
}

function parseJsonl(text: string): { columns: string[]; rows: Record<string, Cell>[] } {
  const lines = text.split('\n');
  assert.equal(lines.pop(), '', 'each line ends with a newline');
  const raw = (_key: string, value: unknown, context?: { source?: string }) => typeof value === 'number' ? context!.source : value;
  const parsed = lines.map(line => (JSON.parse as (text: string, reviver: typeof raw) => Record<string, Cell>)(line, raw));
  const columns = parsed[0] ? Object.keys(parsed[0]) : [...focusExportColumns];
  return { columns, rows: parsed };
}

const iso = (ms: number) => new Date(ms).toISOString();
const oct = (date: number, hour = 12) => Date.UTC(2026, 9, date, hour);
const now = oct(30);

function run(id: string, extra: Partial<FactsRun> = {}): FactsRun {
  return { id, shiftId: '1', role: 'builder', round: 1, writes: true, state: 'finished', startedAt: iso(oct(5, 9)), finishedAt: iso(oct(5, 10)), outcome: 'pr_opened', links: [], authorizedUsd: 5, usage: { costUsd: 1.25, inputTokens: 1000, outputTokens: 200 }, ...extra };
}

function pr(owner: string, repo: string): FactsPullRequest {
  return {
    id: '1', forge: 'forgejo', owner, repo, number: 1, url: 'https://forge.example/pulls/1', shiftId: '1', branch: 'ploeg/1', baseBranch: 'main',
    state: 'merged', draft: false, author: 'ploeg-bot', headSha: 'abc', mergeCommitSha: null, openedAt: iso(oct(5, 10)), firstSeenAt: iso(oct(5, 10)), mergedAt: iso(oct(6)), mergedBy: 'ryan', closedAt: iso(oct(6)), updatedAt: iso(oct(6)),
    additions: 1, deletions: 1, changedFiles: 1, labels: [], commits: 1, firstCommitAt: null, forcePushes: 0, activityCapturedAt: null, activityTruncated: false, commitStatus: null,
    ciRunsCapturedAt: null, ciRunsSource: null, ciRunsTruncated: false, ciRuns: [], reviews: [], events: [], filesCapturedAt: null, filesTruncated: false, files: [], changedPaths: null, reverts: [], deployments: [],
  };
}

function item(id: string, runs: FactsRun[], { repo = ['agency', 'x'], team = 'bronze', title = `Work Item ${id}`, extra = {} }: { repo?: [string, string] | string[]; team?: string; title?: string; extra?: Partial<WorkItemFacts> } = {}): WorkItemFacts {
  return {
    workItem: { id, provider: 'vikunja', externalId: id, externalRef: `VIK-${id}`, url: '', title, state: 'done', team, createdAt: iso(oct(1)), updatedAt: iso(oct(6)), trackerCreatedAt: null, estimateSeconds: null, target: { forge: 'forgejo', owner: repo[0]!, repo: repo[1]!, baseBranch: 'main' }, epics: [], withdrawals: [] },
    activityAt: iso(oct(6)), shifts: [], runs, liveUsage: [], pullRequests: [pr(repo[0]!, repo[1]!)], statusTransitions: [], gateTransitions: [], deployEnvironments: [], roster: [], botLogins: ['ploeg-bot'],
    truncated: { shifts: false, runs: false, pullRequests: false, statusTransitions: false, gateTransitions: false },
    ...extra,
  };
}

const owners: Record<string, Ownership | undefined> = { 'agency/x': { tenant: 'agency', client: 'x' }, 'agency/y': { tenant: 'agency', client: 'y' }, 'agency/site': { tenant: 'agency' }, 'shared/repo': undefined };
const owner = (facts: WorkItemFacts) => owners[`${facts.workItem.target!.owner}/${facts.workItem.target!.repo}`];
const october = (extra: Record<string, string> = {}) => focusExportQuery(new URLSearchParams({ month: '2026-10', ...extra }), now);

function world(): WorkItemFacts[] {
  return [
    item('41', [run('410'), run('411', { finishedAt: iso(oct(5, 18)), usage: { costUsd: 0.5, inputTokens: 10, outputTokens: 5 } }), run('412', { finishedAt: iso(oct(7)), usage: { costUsd: 0.000000123 } })], { title: '=HYPERLINK("x"), then more' }),
    item('42', [run('420', { usage: { costUsd: 2 } }), run('421', { state: 'running', finishedAt: null, usage: null }), run('422', { usage: null })], { repo: ['agency', 'y'], extra: { liveUsage: [{ runId: '421', observedAt: iso(oct(29, 8)), costUsd: 0.4, inputTokens: 50, outputTokens: 7 }] } }),
    item('43', [run('430', { finishedAt: iso(Date.UTC(2026, 8, 30, 23)) }), run('431', { shiftId: null })], { repo: ['agency', 'site'] }),
    item('44', [run('440')], { repo: ['shared', 'repo'] }),
  ];
}

const assertValid = (columns: readonly string[], rows: Record<string, Cell>[]) => assert.deepEqual(focusProblems(columns, rows), []);

test('the query picks a UTC period and refuses what it cannot export, and never invents an exchange rate', () => {
  const month = focusExportQuery(new URLSearchParams(), Date.parse('2026-10-30T23:59:00Z'));
  assert.deepEqual([focusTime(month.from), focusTime(month.to)], ['2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z'], 'the current month by default');
  assert.deepEqual({ ...month, from: 0, to: 0 }, { from: 0, to: 0, format: 'csv', granularity: 'run', unsettled: 'exclude', currency: { code: 'USD' }, provider: 'unknown' });
  const range = focusExportQuery(new URLSearchParams({ from: '2026-01-01', to: '2026-04-01', format: 'jsonl', granularity: 'work-item', unsettled: 'include', currency: 'EUR', usdToEur: '0.9210', tenant: 'agency', client: 'x', provider: 'Anthropic' }));
  assert.deepEqual([focusTime(range.from), focusTime(range.to), range.currency, range.tenant, range.client, range.provider], ['2026-01-01T00:00:00Z', '2026-04-01T00:00:00Z', { code: 'EUR', perUsd: 0.921 }, 'agency', 'x', 'Anthropic']);
  const refused = (params: Record<string, string>) => assert.throws(() => focusExportQuery(new URLSearchParams(params)), FocusQueryError, JSON.stringify(params));
  refused({ currency: 'EUR' });
  refused({ currency: 'EUR', usdToEur: '0' });
  refused({ currency: 'EUR', usdToEur: '1e3' });
  refused({ usdToEur: '0.9' });
  refused({ currency: 'GBP' });
  refused({ month: '2026-13' });
  refused({ month: '2026-10', from: '2026-10-01' });
  refused({ from: '2026-10-01' });
  refused({ from: '2026-10-02', to: '2026-10-01' });
  refused({ from: '2025-01-01', to: '2026-02-01' });
  refused({ format: 'parquet' });
  refused({ tenant: 'Not A Slug' });
  refused({ provider: '' });
  refused({ window: '7d' });
});

test('each settled Run is one FOCUS row on the day it finished, owned by its Client, and the file passes the FOCUS 1.4 column rules', () => {
  const { rows, counts } = focusExport(world(), october(), { owner, now });
  assert.deepEqual(rows.map(row => [row.ResourceId, row.ChargePeriodStart, row.SubAccountId, row.SubAccountType, (row.BilledCost as { decimal: string }).decimal]), [
    ['unfold:run:410', '2026-10-05T00:00:00Z', 'x', 'Client', '1.25'],
    ['unfold:run:411', '2026-10-05T00:00:00Z', 'x', 'Client', '0.5'],
    ['unfold:run:420', '2026-10-05T00:00:00Z', 'y', 'Client', '2'],
    ['unfold:run:412', '2026-10-07T00:00:00Z', 'x', 'Client', '0.000000123'],
  ]);
  assert.deepEqual(counts, { settledRuns: 4, unsettledRuns: 1, unreportedRuns: 1, unownedWorkItems: 1, truncated: false }, 'the September Run and the Run outside a Shift are not October usage; 44 has no single owner');
  const first = rows[0]!;
  assert.equal(first.ChargePeriodEnd, '2026-10-06T00:00:00Z');
  assert.deepEqual([first.BillingPeriodStart, first.BillingPeriodEnd, first.BillingAccountId, first.BillingCurrency, first.ChargeClass, first.ChargeCategory], ['2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z', 'agency', 'USD', null, 'Usage']);
  assert.deepEqual([first.ServiceName, first.ServiceCategory, first.ServiceSubcategory, first.ServiceProviderName, first.HostProviderName, first.InvoiceIssuerName], ['Model usage', 'AI and Machine Learning', 'Generative AI', 'unknown', 'unknown', 'unknown']);
  assert.deepEqual(JSON.parse(first.Tags as string), { 'unfold/workItem': '41', 'unfold/team': 'bronze', 'unfold/repository': 'agency/x', 'unfold/tenant': 'agency', 'unfold/client': 'x' });
  assert.deepEqual([first.ConsumedQuantity, first.PricingQuantity, first.x_UnfoldInputTokens, first.x_UnfoldOutputTokens, first.x_UnfoldCacheReadInputTokens], [null, null, { decimal: '1000' }, { decimal: '200' }, null]);
  assert.equal(first.ChargeDescription, 'Model usage of builder Run 410 on VIK-41');

  const csv = focusCsv(rows);
  const parsed = parseCsv(csv);
  assert.deepEqual(parsed.columns, [...focusExportColumns]);
  assertValid(parsed.columns, parsed.rows);
  assert.match(csv, /,0\.000000123,/, 'a tiny cost is a plain decimal, never 1.23e-7');
  const jsonl = parseJsonl(focusJsonl(rows));
  assert.deepEqual(jsonl.columns, [...focusExportColumns]);
  assertValid(jsonl.columns, jsonl.rows);
  assert.equal(JSON.parse(focusJsonl(rows).split('\n')[0]!).BilledCost, 1.25, 'JSONL carries decimals as numbers');
});

test('a Work Item row adds its Runs of one day, and Tenant and Client filters keep only their rows', () => {
  const { rows } = focusExport(world(), october({ granularity: 'work-item' }), { owner, now });
  assert.deepEqual(rows.map(row => [row.ResourceId, row.ResourceType, row.ChargePeriodStart, (row.BilledCost as { decimal: string }).decimal, (row.x_UnfoldRunCount as { decimal: string }).decimal, row.x_UnfoldRunId]), [
    ['unfold:work-item:41', 'Work Item', '2026-10-05T00:00:00Z', '1.75', '2', null],
    ['unfold:work-item:42', 'Work Item', '2026-10-05T00:00:00Z', '2', '1', null],
    ['unfold:work-item:41', 'Work Item', '2026-10-07T00:00:00Z', '0.000000123', '1', null],
  ]);
  assert.equal(rows[0]!.ResourceName, '=HYPERLINK("x"), then more');
  assert.deepEqual([rows[0]!.x_UnfoldInputTokens, rows[2]!.x_UnfoldInputTokens], [{ decimal: '1010' }, null], 'a token total is null once any Run did not report it');
  const csv = focusCsv(rows);
  assert.match(csv, /,"'=HYPERLINK\(""x""\), then more",/, 'a formula-like title starts with an apostrophe in CSV');
  assert.match(focusJsonl(rows), /"ResourceName":"=HYPERLINK\(\\"x\\"\), then more"/, 'JSONL keeps text unchanged');
  assertValid(...Object.values(parseCsv(csv)) as [string[], Record<string, Cell>[]]);
  const only = (extra: Record<string, string>) => focusExport(world(), october(extra), { owner, now }).rows.map(row => row.ResourceId);
  assert.deepEqual(only({ client: 'y' }), ['unfold:run:420']);
  assert.deepEqual(only({ tenant: 'other' }), []);
  const september = focusExport(world(), focusExportQuery(new URLSearchParams({ from: '2026-09-30', to: '2026-10-01' }), now), { owner, now }).rows;
  assert.deepEqual(september.map(row => [row.ResourceId, row.SubAccountId, row.SubAccountType, row.BillingPeriodStart, row.BillingPeriodEnd]), [['unfold:run:430', 'agency', 'Tenant', '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z']], 'a repository without a Client bills to its Tenant');
});

test('unsettled spend is never billed: left out by default, or 0 with its observed amount and status in x_ columns', () => {
  const included = focusExport(world(), october({ unsettled: 'include' }), { owner, now }).rows;
  const open = included.find(row => row.x_UnfoldRunId === '421')!;
  assert.deepEqual([open.ChargePeriodStart, open.BilledCost, open.EffectiveCost, open.ListCost, open.ContractedCost, open.PricingCurrencyEffectiveCost, open.ChargeClass, open.x_UnfoldSpendStatus, open.x_UnfoldObservedCost, open.x_UnfoldInputTokens], ['2026-10-29T00:00:00Z', { decimal: '0' }, { decimal: '0' }, { decimal: '0' }, { decimal: '0' }, { decimal: '0' }, null, 'Unsettled', { decimal: '0.4' }, { decimal: '50' }]);
  assert.equal(open.ChargeDescription, 'Unsettled model usage of builder Run 421 on VIK-42');
  assert(included.filter(row => row !== open).every(row => row.x_UnfoldSpendStatus === 'Settled' && row.x_UnfoldObservedCost === null));
  assert.equal(focusExport(world(), october(), { owner, now }).rows.some(row => row.x_UnfoldRunId === '421'), false);
  const held = focusExport([item('45', [run('450')], { extra: { runBudgetHolds: [{ runId: '450', shiftId: '1', reservedUsd: 1 }] } })], october({ unsettled: 'include' }), { owner, now });
  assert.deepEqual([held.rows[0]!.x_UnfoldSpendStatus, held.rows[0]!.BilledCost, held.rows[0]!.x_UnfoldObservedCost], ['Unsettled', { decimal: '0' }, { decimal: '1.25' }], 'a finished Run that still holds budget is not settled');
  const parsed = parseCsv(focusCsv(included));
  assertValid(parsed.columns, parsed.rows);
});

test('euros use only the rate the request gave, stated per row, with the US$ amount as the pricing currency', () => {
  const { rows } = focusExport(world(), october({ currency: 'EUR', usdToEur: '0.9', provider: 'Anthropic' }), { owner, now });
  const first = rows[0]!;
  assert.deepEqual([first.BillingCurrency, first.BilledCost, first.EffectiveCost, first.PricingCurrency, first.PricingCurrencyEffectiveCost, first.x_UnfoldExchangeRate], ['EUR', { decimal: '1.125' }, { decimal: '1.125' }, 'USD', { decimal: '1.25' }, { decimal: '0.9' }]);
  assert.deepEqual([first.ServiceProviderName, first.HostProviderName, first.InvoiceIssuerName], ['Anthropic', 'Anthropic', 'Anthropic']);
  assert.equal(focusExport(world(), october(), { owner, now }).rows[0]!.x_UnfoldExchangeRate, null);
  const parsed = parseJsonl(focusJsonl(rows));
  assertValid(parsed.columns, parsed.rows);
});

test('the validator catches what FOCUS forbids, so a passing file means something', () => {
  const { rows } = focusExport(world(), october(), { owner, now });
  const parsed = parseCsv(focusCsv(rows));
  const broken = (change: (row: Record<string, Cell>) => void) => { const copy = parsed.rows.map(row => ({ ...row })); change(copy[0]!); return focusProblems(parsed.columns, copy); };
  assert.match(broken(row => { row.BilledCost = null; }).join('\n'), /BilledCost: must not be null/);
  assert.match(broken(row => { row.BilledCost = '1,25'; }).join('\n'), /Numeric Format/);
  assert.match(broken(row => { row.ChargePeriodStart = '2026-10-05T00:00:00.000Z'; }).join('\n'), /Date\/Time Format/);
  assert.match(broken(row => { row.ChargeClass = 'Unsettled'; }).join('\n'), /ChargeClass/);
  assert.match(broken(row => { row.ServiceSubcategory = 'Compute'; }).join('\n'), /ServiceSubcategory/);
  assert.match(broken(row => { row.ConsumedQuantity = '1000'; row.ConsumedUnit = 'Tokens'; }).join('\n'), /null when SkuPriceId is null/);
  assert.match(broken(row => { row.Tags = '{"a":{"b":1}}'; }).join('\n'), /scalar values/);
  assert.match(focusProblems([...parsed.columns.filter(name => name !== 'InvoiceIssuerName'), 'UnfoldStatus'], parsed.rows).join('\n'), /InvoiceIssuerName: a Mandatory column is missing[\s\S]*UnfoldStatus: neither/);
  assert.equal(focusDecimal(-0.0000000000001).decimal, '0');
  assert.equal(focusDecimal(3).decimal, '3');
});

test('GET /api/ploeg/cost-export downloads FOCUS rows for operators and administrators, refuses viewers, and the demo exports nothing', async t => {
  const env = `UNFOLD_PLOEG_TEST_${randomBytes(8).toString('hex').toUpperCase()}`;
  const bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  const team = ploegDemo.teams[0]!.id;
  const finished = Date.now() - 3_600_000;
  const facts = item('41', [run('410', { startedAt: iso(finished - 600_000), finishedAt: iso(finished), usage: { costUsd: 0.75 } })], { team, extra: { workItem: { ...item('41', []).workItem, team, target: null } } });
  const upstream = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${bearer}`) { res.writeHead(401).end(); return; }
    const send = (data: object) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...data }));
    if (req.url!.includes('/teams')) return send({ teams: ploegDemo.teams });
    if (req.url!.includes('/facts?')) return send({ facts: [facts], nextBefore: null });
    res.writeHead(404).end();
  });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => upstream.close(() => resolve())); delete process.env[env]; });
  const address = upstream.address();
  assert(address && typeof address !== 'string');
  const live = await application('live', config => { config.ploeg = { url: `http://127.0.0.1:${address.port}`, tokenEnv: env, userTeams: { olga: [team] } }; });
  t.after(() => live.close());
  const session = await login(live.url);
  const day = iso(finished).slice(0, 10);
  const next = iso(Date.parse(`${day}T00:00:00Z`) + 86_400_000).slice(0, 10);
  const csv = await request(live.url, `/api/ploeg/cost-export?from=${day}&to=${next}`, session);
  assert.equal(csv.status, 200, csv.text);
  assert.match(csv.response.headers.get('content-type') ?? '', /^text\/csv/);
  assert.equal(csv.response.headers.get('content-disposition'), `attachment; filename="unfold-focus-cost-${day}-to-${next}.csv"`);
  assert.equal(csv.response.headers.get('x-unfold-focus-version'), '1.4');
  assert.deepEqual(['x-unfold-truncated', 'x-unfold-unsettled-runs', 'x-unfold-unreported-runs', 'x-unfold-unowned-work-items'].map(name => csv.response.headers.get(name)), ['false', '0', '0', '0']);
  const parsed = parseCsv(csv.text);
  assertValid(parsed.columns, parsed.rows);
  assert.deepEqual(parsed.rows.map(row => [row.ResourceId, row.BilledCost, row.BillingAccountId, row.SubAccountType]), [['unfold:run:410', '0.75', 'default', 'Tenant']]);
  const jsonl = await request(live.url, `/api/ploeg/cost-export?from=${day}&to=${next}&format=jsonl`, session);
  assert.match(jsonl.response.headers.get('content-type') ?? '', /^application\/x-ndjson/);
  assertValid(...Object.values(parseJsonl(jsonl.text)) as [string[], Record<string, Cell>[]]);
  const refused = await request(live.url, '/api/ploeg/cost-export?currency=EUR', session);
  assert.deepEqual([refused.status, refused.body.error.code], [400, 'cost_export_filter']);
  assert.equal((await request(live.url, '/api/ploeg/cost-export')).status, 401, 'a signed-out caller reads nothing');
  const password = randomBytes(24).toString('hex');
  live.app.store.addUser({ id: 'vera', name: 'vera', role: 'viewer', passwordHash: await hashPassword(password) });
  live.app.store.addUser({ id: 'olga', name: 'olga', role: 'operator', passwordHash: await hashPassword(password) });
  assert.equal((await request(live.url, '/api/ploeg/cost-export', await login(live.url, 'vera', password))).status, 403, 'a viewer exports no cost');
  const operator = await request(live.url, '/api/ploeg/cost-export', await login(live.url, 'olga', password));
  assert.equal(operator.status, 200, operator.text);

  const demo = await application('demo');
  t.after(() => demo.close());
  const empty = await request(demo.url, '/api/ploeg/cost-export?month=2026-10&format=jsonl');
  assert.deepEqual([empty.status, empty.text, empty.response.headers.get('x-unfold-demo')], [200, '', 'true'], 'the demo invents no model call or spend');
  assert.match(empty.response.headers.get('content-disposition') ?? '', /unfold-focus-cost-demo-2026-10-01-to-2026-11-01\.jsonl/);
  assert.equal((await request(demo.url, '/api/ploeg/cost-export')).text, `${focusExportColumns.join(',')}\r\n`);
});

test('the file names its period, and an export with no rows is a header only', () => {
  const query: FocusExportQuery = october();
  assert.equal(focusFile({ rows: [], counts: { settledRuns: 0, unsettledRuns: 0, unreportedRuns: 0, unownedWorkItems: 0, truncated: true } }, query).headers['X-Unfold-Truncated'], 'true');
  assert.equal(focusFile(null, query).filename, 'unfold-focus-cost-demo-2026-10-01-to-2026-11-01.csv');
});
