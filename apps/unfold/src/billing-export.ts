/** The Acceptance kinds that make a Work Item billable (system ADR-0006). */
export type BilledAcceptance = 'merged' | 'approved' | 'silent';
/** The Sizes a Work Item's Quote can carry (glossary "Size"). */
export const billingSizes = ['S', 'M', 'L'] as const;
export type BillingSize = typeof billingSizes[number];

/**
 * One line Unfold writes into an Agency's billing tool: one accepted Work Item, or the credit that reverses it. The
 * price is the Agency's own, in cents; Unfold's Delivery Fee and Token Charge are never on it. `quantity` is -1 on a
 * credit line, so the item price stays positive as EN 16931 requires.
 */
export type BillingLine = {
  key: string; kind: 'acceptance' | 'reversal';
  tenant: string; client: string | null;
  workItemId: string; externalRef: string; title: string; workItemUrl: string | null;
  acceptance: { kind: BilledAcceptance; at: string; pullRequestUrl: string | null };
  size: BillingSize | null; quantity: 1 | -1; unitPriceCents: number | null; currency: string;
  reversal?: { reverses: string; reason: string; revertUrl: string | null; at: string; by: string };
};
/** A line with its price set, as an exporter receives it. */
export type PricedBillingLine = BillingLine & { unitPriceCents: number };
/** Where a Client's lines go in the tool, in the fields the exporter's definition lists. */
export type BillingTarget = Record<string, string>;
/** What the tool answered for a line it took: its own id for the line, when it gave one. */
export type BillingSendResult = { remoteId: string | null };

/**
 * Why an exporter could not hand a line over. `retry`: the tool certainly took nothing (rate limited, down for
 * maintenance, no connection made), so Unfold tries again later. `refused`: the tool answered and refused the line.
 * `uncertain`: the tool may have taken it (a timeout, a lost connection, a server error), so a person checks before
 * it is sent again.
 */
export class BillingSendError extends Error {
  readonly outcome: 'retry' | 'refused' | 'uncertain';
  readonly status: number | null;
  constructor(outcome: BillingSendError['outcome'], message: string, status: number | null = null) {
    super(message);
    this.name = 'BillingSendError';
    this.outcome = outcome;
    this.status = status;
  }
}

/** One adapter's connection to one billing tool. */
export interface BillingExporter {
  /** Hands `line` to the tool at `target`. Throws a BillingSendError when the tool did not take it. */
  send(line: PricedBillingLine, target: BillingTarget): Promise<BillingSendResult>;
}

/** One field of a Client's mapping that an exporter needs, as the Settings page asks for it. */
export type BillingTargetField = { key: string; label: string; required: boolean; hint: string };
/** What an adapter receives besides its own settings. */
export type BillingDependencies = { fetch: typeof fetch; env: NodeJS.ProcessEnv; dataDir: string; timeoutMs: number };
/** What an adapter's settings parser may check against. */
export type BillingSettingsContext = { env: NodeJS.ProcessEnv; dataDir: string; agentEnvironment: readonly string[] };

/** A billing tool adapter, registered by name (system ADR-0050, rule 1). */
export type BillingExporterDefinition = {
  name: string;
  title: string;
  targetFields: readonly BillingTargetField[];
  /** Checks the adapter's own block under `billing.<name>` and returns its settings; throws naming the field. */
  settings(raw: unknown, context: BillingSettingsContext): Record<string, unknown>;
  create(settings: Record<string, unknown>, dependencies: BillingDependencies): BillingExporter;
};

/** The billing adapters a build knows, by name. A new tool is a new registered definition. */
export class BillingExporterRegistry {
  private readonly definitions = new Map<string, BillingExporterDefinition>();
  /** Adds `definition`; a second definition with the same name throws. */
  register(definition: BillingExporterDefinition): this {
    if (this.definitions.has(definition.name)) throw new Error(`Billing exporter ${definition.name} is registered twice`);
    this.definitions.set(definition.name, definition);
    return this;
  }
  /** The definition named `name`, or undefined. */
  get(name: string): BillingExporterDefinition | undefined { return this.definitions.get(name); }
  /** Every registered name, in registration order. */
  names(): string[] { return [...this.definitions.keys()]; }
}

/** The `billing` configuration block, checked: which exporter, its settings, the currency and how often Unfold syncs. */
export type BillingSettings = { exporter: string; options: Record<string, unknown>; currency: string; syncMinutes: number };

const plain = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Reads the optional `billing` block: `{ exporter, <exporter>: {…}, currency?, syncMinutes? }`. Absent means billing is
 * off. The exporter must be registered; its own block is checked by its definition.
 */
export function billingSettings(raw: unknown, registry: BillingExporterRegistry, context: BillingSettingsContext): BillingSettings | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!plain(raw)) throw new Error('billing must be an object');
  const exporter = raw.exporter;
  if (typeof exporter !== 'string' || !registry.get(exporter)) throw new Error(`billing.exporter must be one of ${registry.names().join(', ')}`);
  const unknown = Object.keys(raw).filter(key => !['exporter', 'currency', 'syncMinutes', exporter].includes(key));
  if (unknown.length) throw new Error(`billing does not take ${unknown.join(', ')}`);
  const currency = raw.currency ?? 'EUR';
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) throw new Error('billing.currency must be an ISO 4217 code such as EUR');
  const syncMinutes = raw.syncMinutes ?? 15;
  if (typeof syncMinutes !== 'number' || !Number.isInteger(syncMinutes) || syncMinutes < 1 || syncMinutes > 1440) throw new Error('billing.syncMinutes must be a whole number from 1 to 1440');
  return { exporter, options: registry.get(exporter)!.settings(raw[exporter], context), currency, syncMinutes };
}

/** A mapping target read against `fields`: every required field set, at most 200 characters each, nothing else. */
export function billingTarget(raw: unknown, fields: readonly BillingTargetField[]): BillingTarget {
  if (!plain(raw)) throw new Error('target must be an object');
  const known = new Set(fields.map(field => field.key));
  const extra = Object.keys(raw).filter(key => !known.has(key));
  if (extra.length) throw new Error(`target does not take ${extra.join(', ')}`);
  const target: BillingTarget = {};
  for (const field of fields) {
    const value = raw[field.key];
    if (value === undefined || value === null || value === '') { if (field.required) throw new Error(`${field.label} is required`); continue; }
    if (typeof value !== 'string' || value.length > 200 || /[\u0000-\u001f]/.test(value)) throw new Error(`${field.label} must be text of at most 200 characters`);
    target[field.key] = value.trim();
  }
  return target;
}

/** A price in cents from a number or a decimal text such as `450`, `450.5` or `450.50`; at most two decimals, from 0 to 1 000 000. */
export function priceCents(value: unknown, label = 'Price'): number {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error(`${label} must be an amount such as 450.00`);
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (cents > 100_000_000) throw new Error(`${label} must be at most 1000000.00`);
  return cents;
}

/** Cents as a decimal text with a point and two decimals, such as `450.00` or `-450.00`. */
export function amountText(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const value = Math.abs(cents);
  return `${sign}${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}

/** The UTC date `YYYY-MM-DD` of an ISO timestamp. */
export const lineDate = (at: string): string => new Date(at).toISOString().slice(0, 10);

const acceptedBy: Record<BilledAcceptance, string> = { merged: 'merged', approved: 'approved by a reviewer', silent: 'accepted after 10 working days without a decision' };

/** A line's name in the tool: the Work Item reference and title, with "Credit:" before a credit line. At most 200 characters. */
export function lineName(line: BillingLine): string {
  const name = `${line.kind === 'reversal' ? 'Credit: ' : ''}${line.externalRef} ${line.title}`.replace(/\s+/g, ' ').trim();
  return name.length > 200 ? name.slice(0, 200).trimEnd() : name;
}

/** A line's explanation in plain words: how and when the Work Item was accepted, its pull request, a Reversal's reason, and the line's key. */
export function lineExplanation(line: BillingLine): string {
  const parts = [`${line.externalRef}: ${acceptedBy[line.acceptance.kind]} on ${lineDate(line.acceptance.at)}.`];
  if (line.acceptance.pullRequestUrl) parts.push(`Pull request: ${line.acceptance.pullRequestUrl}`);
  if (line.reversal) parts.push(`Reverses the accepted ticket: ${line.reversal.reason}${line.reversal.revertUrl ? ` (revert: ${line.reversal.revertUrl})` : ''}.`);
  parts.push(`Unfold line ${line.key}`);
  return parts.join('\n');
}

/** The billing CSV's columns, in order. */
export const billingCsvColumns = ['key', 'kind', 'tenant', 'client', 'work_item_id', 'external_ref', 'title', 'acceptance_kind', 'accepted_on', 'pull_request_url', 'size', 'quantity', 'unit_price', 'line_amount', 'currency', 'reversal_reason', 'revert_url', 'target_reference'] as const;

const cell = (value: string | number | null, guard = true): string => {
  if (value === null) return '';
  let text = String(value);
  if (guard && typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** One line as a CSV record without its line end. A text cell a spreadsheet would run as a formula starts with an apostrophe. */
export function billingCsvRecord(line: BillingLine, reference: string | null = null): string {
  const price = line.unitPriceCents;
  const amounts = new Set([12, 13]);
  return [line.key, line.kind, line.tenant, line.client, line.workItemId, line.externalRef, line.title, line.acceptance.kind, lineDate(line.acceptance.at), line.acceptance.pullRequestUrl, line.size, line.quantity, price === null ? null : amountText(price), price === null ? null : amountText(price * line.quantity), line.currency, line.reversal?.reason ?? null, line.reversal?.revertUrl ?? null, reference].map((value, index) => cell(value, !amounts.has(index))).join(',');
}

/** Lines as RFC 4180 CSV with a header and CRLF line ends. Amounts have a decimal point, so any locale reads them. */
export function billingCsv(lines: readonly BillingLine[]): string {
  return `${[billingCsvColumns.join(','), ...lines.map(line => billingCsvRecord(line))].join('\r\n')}\r\n`;
}

const ubl = (value: string | number, attributes: Record<string, string> = {}) => [{ _: value, ...attributes }];

/**
 * One line as a UBL 2.1 `cac:InvoiceLine` in OASIS's JSON alternative representation (every element an array, a
 * value under `_`, attributes beside it). Quantity is in units (`C62`); a credit line has quantity -1 and a positive
 * price. A line without a price has no amounts.
 */
export function ublInvoiceLine(line: BillingLine, reference: string | null = null): Record<string, unknown> {
  const date = lineDate(line.acceptance.at);
  const price = line.unitPriceCents;
  return {
    ID: ubl(line.key),
    Note: ubl(lineExplanation(line)),
    InvoicedQuantity: ubl(line.quantity, { unitCode: 'C62' }),
    ...(price === null ? {} : { LineExtensionAmount: ubl(Number(amountText(price * line.quantity)), { currencyID: line.currency }) }),
    ...(reference ? { AccountingCost: ubl(reference) } : {}),
    InvoicePeriod: [{ StartDate: ubl(date), EndDate: ubl(date) }],
    ...(line.acceptance.pullRequestUrl ? { DocumentReference: [{ ID: ubl(line.acceptance.pullRequestUrl), DocumentDescription: ubl('Pull request') }] } : {}),
    Item: [{ Description: ubl(lineExplanation(line)), Name: ubl(lineName(line)), SellersItemIdentification: [{ ID: ubl(line.externalRef) }] }],
    ...(price === null ? {} : { Price: [{ PriceAmount: ubl(Number(amountText(price)), { currencyID: line.currency }) }] }),
  };
}

/** Lines as a UBL 2.1 JSON document that holds invoice lines only, with no invoice header: the Agency's tool makes the invoice. */
export function ublInvoiceLines(lines: readonly BillingLine[], reference: (line: BillingLine) => string | null = () => null): Record<string, unknown> {
  return {
    _D: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    _A: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    _B: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    InvoiceLine: lines.map(line => ublInvoiceLine(line, reference(line))),
  };
}
