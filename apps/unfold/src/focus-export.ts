import type { FactsRun, WorkItemFacts } from './cards/facts.ts';
import { readWindowFacts, runSpend, type FactsReach, type FactsSource } from './delivery-economics.ts';
import type { Ownership } from './tenancy.ts';

/** The FinOps FOCUS release the export follows: the Cost and Usage dataset of FOCUS 1.4. */
export const focusVersion = '1.4';
/** How many facts pages of 25 Work Items one export walks before it stops and says it truncated. */
export const focusPageBound = 40;
/** The longest period one export covers, in days. */
export const focusMaxDays = 366;

/** The FOCUS columns the export writes, in order: every Mandatory column of the Cost and Usage dataset, the two Recommended ones that apply, and the Conditional ones whose condition holds for model usage. */
export const focusColumns = [
  'BilledCost', 'BillingAccountId', 'BillingAccountName', 'BillingCurrency', 'BillingPeriodEnd', 'BillingPeriodStart',
  'ChargeCategory', 'ChargeClass', 'ChargeDescription', 'ChargeFrequency', 'ChargePeriodEnd', 'ChargePeriodStart',
  'ConsumedQuantity', 'ConsumedUnit', 'ContractedCost', 'EffectiveCost', 'HostProviderName', 'InvoiceIssuerName', 'ListCost',
  'PricingCurrency', 'PricingCurrencyEffectiveCost', 'PricingQuantity', 'PricingUnit',
  'ResourceId', 'ResourceName', 'ResourceType', 'ServiceCategory', 'ServiceName', 'ServiceProviderName', 'ServiceSubcategory',
  'SubAccountId', 'SubAccountName', 'SubAccountType', 'Tags',
] as const;
/** Unfold's custom columns, each with the `x_` prefix FOCUS requires of a custom column. */
export const focusCustomColumns = [
  'x_UnfoldSpendStatus', 'x_UnfoldObservedCost', 'x_UnfoldExchangeRate', 'x_UnfoldWorkItemId', 'x_UnfoldExternalReference', 'x_UnfoldRunId', 'x_UnfoldRunCount',
  'x_UnfoldInputTokens', 'x_UnfoldOutputTokens', 'x_UnfoldCacheReadInputTokens', 'x_UnfoldCacheCreationInputTokens',
] as const;
/** Every column of a row, FOCUS columns first. */
export const focusExportColumns = [...focusColumns, ...focusCustomColumns] as const;
/** One column's name. */
export type FocusColumn = (typeof focusExportColumns)[number];
/** A decimal kept as its exact text, so CSV and JSONL write the same digits and never scientific notation. */
export type FocusDecimal = { decimal: string };
/** One FOCUS row: a string, a decimal, or null for every column. */
export type FocusRow = Record<FocusColumn, string | FocusDecimal | null>;

/** The currency the export bills in: US$ as recorded, or euros at a rate the requester gave. */
export type FocusCurrency = { code: 'USD' } | { code: 'EUR'; perUsd: number };
/** What one export covers and how it writes it. `from` is inclusive and `to` exclusive, both UTC midnights. */
export type FocusExportQuery = {
  from: number; to: number; format: 'csv' | 'jsonl'; granularity: 'run' | 'work-item'; unsettled: 'exclude' | 'include';
  currency: FocusCurrency; tenant?: string; client?: string; provider: string;
};
/** What the export left out of its rows, and whether a page bound cut the facts. */
export type FocusCounts = { settledRuns: number; unsettledRuns: number; unreportedRuns: number; unownedWorkItems: number; truncated: boolean };
/** The rows of one export and what it left out. */
export type FocusExport = { rows: FocusRow[]; counts: FocusCounts };
/** Who owns a Work Item, from its target repository; undefined when no single owner does. */
export type FocusOwner = (facts: WorkItemFacts) => Ownership | undefined;

const day = 86_400_000;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const monthPattern = /^\d{4}-\d{2}$/;
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const at = (value: string | null | undefined): number | null => { if (!value) return null; const ms = Date.parse(value); return Number.isFinite(ms) ? ms : null; };
const dateOf = (value: string): number | null => { if (!datePattern.test(value)) return null; const ms = Date.parse(`${value}T00:00:00Z`); return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : null; };
const monthStart = (ms: number) => { const date = new Date(ms); return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1); };
const nextMonth = (ms: number) => { const date = new Date(ms); return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1); };

/** A UTC moment in FOCUS's Date/Time format, `YYYY-MM-DDTHH:mm:ssZ`. */
export const focusTime = (ms: number): string => `${new Date(ms).toISOString().slice(0, 19)}Z`;

/** A number as a FOCUS decimal: at most ten decimal places, no exponent, no sign on zero. */
export function focusDecimal(value: number): FocusDecimal {
  const text = value.toFixed(10).replace(/\.?0+$/, '');
  return { decimal: text === '-0' || text === '' ? '0' : text };
}

/** Why a query cannot be exported, in words the requester can act on. */
export class FocusQueryError extends Error {}

/**
 * Reads an export's query. `month=YYYY-MM`, or `from=YYYY-MM-DD` (inclusive) with `to=YYYY-MM-DD` (exclusive), picks the
 * UTC period, the current month when neither is given, at most `focusMaxDays` long. `format` is `csv` or `jsonl`,
 * `granularity` `run` or `work-item`, `unsettled` `exclude` or `include`. `currency=EUR` needs `usdToEur`, the euros one
 * US$ buys, which Unfold never looks up itself. `tenant` and `client` narrow the rows; `provider` names the model provider
 * when the requester knows it.
 */
export function focusExportQuery(params: URLSearchParams, now = Date.now()): FocusExportQuery {
  const startKey = `from`, endKey = `to`;
  const known = new Set(['month', startKey, endKey, 'format', 'granularity', 'unsettled', 'currency', 'usdToEur', 'tenant', 'client', 'provider', 'refresh']);
  for (const key of params.keys()) if (!known.has(key)) throw new FocusQueryError(`Unknown parameter ${key}.`);
  const month = params.get('month');
  let from: number, to: number;
  if (month !== null) {
    if (params.has(startKey) || params.has(endKey)) throw new FocusQueryError('Give either month or from and to.');
    const start = monthPattern.test(month) ? dateOf(`${month}-01`) : null;
    if (start === null) throw new FocusQueryError('month must be YYYY-MM.');
    from = start; to = nextMonth(start);
  } else if (params.has(startKey) || params.has(endKey)) {
    const start = dateOf(params.get(startKey) ?? ''), end = dateOf(params.get(endKey) ?? '');
    if (start === null || end === null) throw new FocusQueryError('from and to must both be dates as YYYY-MM-DD; to is exclusive.');
    from = start; to = end;
  } else { from = monthStart(now); to = nextMonth(now); }
  if (to <= from) throw new FocusQueryError('to must be after from.');
  if (to - from > focusMaxDays * day) throw new FocusQueryError(`A period is at most ${focusMaxDays} days.`);
  const pick = <T extends string>(name: string, options: readonly T[]): T => {
    const value = params.get(name) ?? options[0];
    if (!(options as readonly string[]).includes(value)) throw new FocusQueryError(`${name} must be ${options.join(' or ')}.`);
    return value as T;
  };
  const format = pick('format', ['csv', 'jsonl'] as const);
  const granularity = pick('granularity', ['run', 'work-item'] as const);
  const unsettled = pick('unsettled', ['exclude', 'include'] as const);
  const code = pick('currency', ['USD', 'EUR'] as const);
  const rate = params.get('usdToEur');
  let currency: FocusCurrency = { code: 'USD' };
  if (code === 'EUR') {
    const perUsd = rate !== null && /^\d{1,3}(?:\.\d{1,10})?$/.test(rate) ? Number(rate) : NaN;
    if (!(perUsd > 0)) throw new FocusQueryError('currency=EUR needs usdToEur, the euros one US$ buys, as a positive decimal such as 0.92. Unfold never looks up a rate.');
    currency = { code: 'EUR', perUsd };
  } else if (rate !== null) throw new FocusQueryError('usdToEur applies only with currency=EUR.');
  const slug = (name: string) => { const value = params.get(name); if (value === null) return undefined; if (!slugPattern.test(value)) throw new FocusQueryError(`${name} must be a Tenant or Client identifier.`); return value; };
  const tenant = slug('tenant'), client = slug('client');
  const provider = (params.get('provider') ?? 'unknown').trim();
  if (!provider || provider.length > 100 || /[\u0000-\u001f\u007f]/.test(provider)) throw new FocusQueryError('provider must be a name of at most 100 characters.');
  return { from, to, format, granularity, unsettled, currency, provider, ...(tenant ? { tenant } : {}), ...(client ? { client } : {}) };
}

type Usage = { input: number | null; output: number | null; cacheRead: number | null; cacheCreation: number | null };
type Charge = { facts: WorkItemFacts; owner: Ownership; run: FactsRun; status: 'Settled' | 'Unsettled'; usd: number | null; dayStart: number; usage: Usage };

const whole = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

function chargeOf(run: FactsRun, facts: WorkItemFacts, now: number): Omit<Charge, 'facts' | 'owner' | 'dayStart'> & { at: number | null } | 'unreported' {
  const spend = runSpend(run, facts);
  if (spend.status === 'unknown') return 'unreported';
  const live = facts.liveUsage.filter(entry => entry.runId === run.id).sort((a, b) => (at(b.observedAt) ?? 0) - (at(a.observedAt) ?? 0))[0];
  const fromRun: Usage = { input: whole(run.usage?.inputTokens), output: whole(run.usage?.outputTokens), cacheRead: whole(run.usage?.cacheReadInputTokens), cacheCreation: whole(run.usage?.cacheCreationInputTokens) };
  if (spend.status === 'settled') return { run, status: 'Settled', usd: spend.usd, usage: fromRun, at: at(run.finishedAt) ?? at(run.startedAt) };
  const usage = run.state !== 'finished' && live ? { input: whole(live.inputTokens), output: whole(live.outputTokens), cacheRead: null, cacheCreation: null } : fromRun;
  return { run, status: 'Unsettled', usd: spend.usd, usage, at: at(run.finishedAt) ?? at(live?.observedAt) ?? at(run.startedAt) ?? now };
}

const sum = (values: (number | null)[]): number | null => values.some(value => value === null) ? null : values.reduce<number>((total, value) => total + value!, 0);

/**
 * The FOCUS rows of the facts for the query's period. A charge is one Run's model usage on the UTC day its Run finished
 * (an unsettled Run: the day of its latest observation), so ChargePeriod is that day and BillingPeriod its calendar month.
 * `granularity=work-item` adds a Work Item's Runs of one day and one spend status into one row. Settled Runs carry their
 * cost; an unsettled Run is left out unless `unsettled=include`, and then its BilledCost and every other cost is 0 with
 * what was observed so far in `x_UnfoldObservedCost`, because FOCUS allows only invoiced amounts in BilledCost. Runs that
 * finished without a cost and Work Items no single owner reaches are only counted.
 */
export function focusExport(facts: WorkItemFacts[], query: FocusExportQuery, { owner, now = Date.now(), truncated = false }: { owner: FocusOwner; now?: number; truncated?: boolean }): FocusExport {
  const counts: FocusCounts = { settledRuns: 0, unsettledRuns: 0, unreportedRuns: 0, unownedWorkItems: 0, truncated };
  const charges: Charge[] = [];
  const seen = new Set<string>();
  for (const item of facts) {
    if (seen.has(item.workItem.id)) continue;
    seen.add(item.workItem.id);
    const found = owner(item);
    const inside: Charge[] = [];
    let unreported = 0;
    for (const run of item.runs) {
      if (run.shiftId === null) continue;
      const charge = chargeOf(run, item, now);
      if (charge === 'unreported') { const ms = at(run.finishedAt) ?? at(run.startedAt); if (ms !== null && ms >= query.from && ms < query.to) unreported++; continue; }
      if (charge.at === null || charge.at < query.from || charge.at >= query.to) continue;
      const { at: when, ...rest } = charge;
      inside.push({ ...rest, facts: item, owner: found ?? { tenant: '' }, dayStart: Math.floor(when / day) * day });
    }
    if (!inside.length && !unreported) continue;
    if (!found) { counts.unownedWorkItems++; continue; }
    if (query.tenant && found.tenant !== query.tenant) continue;
    if (query.client && found.client !== query.client) continue;
    counts.unreportedRuns += unreported;
    for (const charge of inside) {
      if (charge.status === 'Settled') counts.settledRuns++; else counts.unsettledRuns++;
      if (charge.status === 'Settled' || query.unsettled === 'include') charges.push(charge);
    }
  }
  const groups = new Map<string, Charge[]>();
  for (const charge of charges) {
    const key = query.granularity === 'run' ? `run:${charge.run.id}` : `${charge.facts.workItem.id}:${charge.dayStart}:${charge.status}`;
    groups.set(key, [...(groups.get(key) ?? []), charge]);
  }
  const rows = [...groups.values()].map(group => focusRow(group, query));
  rows.sort((a, b) => String(a.ChargePeriodStart).localeCompare(String(b.ChargePeriodStart)) || String(a.ResourceId).localeCompare(String(b.ResourceId)));
  return { rows, counts };
}

function focusRow(group: Charge[], query: FocusExportQuery): FocusRow {
  const first = group[0]!;
  const { facts, owner, status, dayStart } = first;
  const item = facts.workItem;
  const perRun = query.granularity === 'run';
  const usd = sum(group.map(charge => charge.usd));
  const rate = query.currency.code === 'EUR' ? query.currency.perUsd : null;
  const inBilling = (value: number) => focusDecimal(rate === null ? value : value * rate);
  const settled = status === 'Settled';
  const billed = settled ? inBilling(usd!) : focusDecimal(0);
  const usage = { input: sum(group.map(charge => charge.usage.input)), output: sum(group.map(charge => charge.usage.output)), cacheRead: sum(group.map(charge => charge.usage.cacheRead)), cacheCreation: sum(group.map(charge => charge.usage.cacheCreation)) };
  const count = (value: number | null) => value === null ? null : focusDecimal(value);
  const reference = item.externalRef || `Work Item ${item.id}`;
  const subAccount = owner.client ?? owner.tenant;
  const tags: Record<string, string> = { 'unfold/workItem': item.id, 'unfold/team': item.team, ...(item.target ? { 'unfold/repository': `${item.target.owner}/${item.target.repo}` } : {}), 'unfold/tenant': owner.tenant, ...(owner.client ? { 'unfold/client': owner.client } : {}) };
  const description = perRun
    ? `${settled ? 'Model usage' : 'Unsettled model usage'} of ${first.run.role || 'agent'} Run ${first.run.id} on ${reference}`
    : `${settled ? 'Model usage' : 'Unsettled model usage'} of ${group.length === 1 ? '1 Run' : `${group.length} Runs`} on ${reference}`;
  return {
    BilledCost: billed, BillingAccountId: owner.tenant, BillingAccountName: owner.tenant, BillingCurrency: query.currency.code,
    BillingPeriodEnd: focusTime(nextMonth(dayStart)), BillingPeriodStart: focusTime(monthStart(dayStart)),
    ChargeCategory: 'Usage', ChargeClass: null, ChargeDescription: description, ChargeFrequency: 'Usage-Based',
    ChargePeriodEnd: focusTime(dayStart + day), ChargePeriodStart: focusTime(dayStart),
    ConsumedQuantity: null, ConsumedUnit: null, ContractedCost: billed, EffectiveCost: billed,
    HostProviderName: query.provider, InvoiceIssuerName: query.provider, ListCost: billed,
    PricingCurrency: 'USD', PricingCurrencyEffectiveCost: settled ? focusDecimal(usd!) : focusDecimal(0), PricingQuantity: null, PricingUnit: null,
    ResourceId: perRun ? `unfold:run:${first.run.id}` : `unfold:work-item:${item.id}`, ResourceName: perRun ? null : item.title || null, ResourceType: perRun ? 'Run' : 'Work Item',
    ServiceCategory: 'AI and Machine Learning', ServiceName: 'Model usage', ServiceProviderName: query.provider, ServiceSubcategory: 'Generative AI',
    SubAccountId: subAccount, SubAccountName: subAccount, SubAccountType: owner.client ? 'Client' : 'Tenant', Tags: JSON.stringify(tags),
    x_UnfoldSpendStatus: status, x_UnfoldObservedCost: settled || usd === null ? null : inBilling(usd), x_UnfoldExchangeRate: rate === null ? null : focusDecimal(rate),
    x_UnfoldWorkItemId: item.id, x_UnfoldExternalReference: item.externalRef || null, x_UnfoldRunId: perRun ? first.run.id : null, x_UnfoldRunCount: focusDecimal(group.length),
    x_UnfoldInputTokens: count(usage.input), x_UnfoldOutputTokens: count(usage.output), x_UnfoldCacheReadInputTokens: count(usage.cacheRead), x_UnfoldCacheCreationInputTokens: count(usage.cacheCreation),
  };
}

const csvCell = (value: string | FocusDecimal | null): string => {
  if (value === null) return '';
  if (typeof value !== 'string') return value.decimal;
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/**
 * The rows as RFC 4180 CSV with a header of FOCUS Column IDs and CRLF line ends. Null is an empty cell; a text cell that
 * a spreadsheet would run as a formula starts with an apostrophe.
 */
export function focusCsv(rows: readonly FocusRow[]): string {
  const lines = [focusExportColumns.join(',')];
  for (const row of rows) lines.push(focusExportColumns.map(column => csvCell(row[column])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/** The rows as JSON Lines: one object per line with every column, null as `null`, decimals as JSON numbers and text unchanged. */
export function focusJsonl(rows: readonly FocusRow[]): string {
  return rows.map(row => `{${focusExportColumns.map(column => { const value = row[column]; return `${JSON.stringify(column)}:${value === null ? 'null' : typeof value === 'string' ? JSON.stringify(value) : value.decimal}`; }).join(',')}}\n`).join('');
}

/** The file one export answers: its body, media type, download name and the headers that say what it left out. */
export type FocusFile = { body: string; contentType: string; filename: string; headers: Record<string, string> };

/** The file for an export, or for the demo, which exports no row and says so in `X-Unfold-Demo`. */
export function focusFile(result: FocusExport | null, query: FocusExportQuery): FocusFile {
  const period = `${focusTime(query.from).slice(0, 10)}-to-${focusTime(query.to).slice(0, 10)}`;
  const csv = query.format === 'csv';
  const body = csv ? focusCsv(result?.rows ?? []) : focusJsonl(result?.rows ?? []);
  const headers: Record<string, string> = { 'X-Unfold-Focus-Version': focusVersion };
  if (!result) headers['X-Unfold-Demo'] = 'true';
  else Object.assign(headers, {
    'X-Unfold-Truncated': String(result.counts.truncated), 'X-Unfold-Unsettled-Runs': String(result.counts.unsettledRuns),
    'X-Unfold-Unreported-Runs': String(result.counts.unreportedRuns), 'X-Unfold-Unowned-Work-Items': String(result.counts.unownedWorkItems),
  });
  return { body, contentType: csv ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8', filename: `unfold-focus-cost-${result ? '' : 'demo-'}${period}.${csv ? 'csv' : 'jsonl'}`, headers };
}

/** Reads the facts of every Work Item with activity since the period started within `teams` that `reaches` accepts, and exports them. */
export async function readFocusExport(source: FactsSource, query: FocusExportQuery, { teams, reaches, owner, now = Date.now(), fresh = false, maxPages = focusPageBound }: { teams: readonly string[]; reaches?: FactsReach; owner: FocusOwner; now?: number; fresh?: boolean; maxPages?: number }): Promise<FocusExport> {
  const { facts, truncated } = await readWindowFacts(source, { since: query.from, teams, reaches, fresh, maxPages });
  return focusExport(facts, query, { owner, now, truncated });
}
