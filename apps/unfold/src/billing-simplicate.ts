import { BillingSendError, lineDate, lineExplanation, lineName, type BillingDependencies, type BillingExporter, type BillingExporterDefinition, type BillingSendResult, type BillingTarget, type PricedBillingLine } from './billing-export.ts';

/** The checked `billing.simplicate` block: the Simplicate subdomain, or an explicit API root, and the variable that holds `key:secret`. */
export type SimplicateSettings = { apiUrl: string; tokenEnv: string };

const subdomain = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const envName = /^[A-Z_][A-Z0-9_]{0,127}$/;
const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** The API key and secret in `value`, written `key:secret` as Simplicate's own bearer form is; undefined when it has another shape. */
export function simplicateCredential(value: string | undefined): { key: string; secret: string } | undefined {
  const at = value?.indexOf(':') ?? -1;
  if (!value || at <= 0 || at === value.length - 1) return undefined;
  return { key: value.slice(0, at).trim(), secret: value.slice(at + 1).trim() };
}

function settings(raw: unknown, context: { env: NodeJS.ProcessEnv; agentEnvironment: readonly string[] }): SimplicateSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('billing.simplicate must be an object with domain and tokenEnv');
  const block = raw as Record<string, unknown>;
  const extra = Object.keys(block).filter(key => !['domain', 'apiUrl', 'tokenEnv'].includes(key));
  if (extra.length) throw new Error(`billing.simplicate does not take ${extra.join(', ')}`);
  if (typeof block.tokenEnv !== 'string' || !envName.test(block.tokenEnv)) throw new Error('billing.simplicate.tokenEnv must name an environment variable');
  if (!simplicateCredential(context.env[block.tokenEnv])) throw new Error(`billing.simplicate.tokenEnv names ${block.tokenEnv}, which must hold the Simplicate API key and secret as key:secret`);
  if (context.agentEnvironment.includes(block.tokenEnv)) throw new Error('The Simplicate credential must never enter an agent workspace');
  let apiUrl: string;
  if (block.apiUrl !== undefined) {
    let parsed: URL;
    try { parsed = new URL(String(block.apiUrl)); } catch { throw new Error('billing.simplicate.apiUrl must be a URL'); }
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback.has(parsed.hostname))) throw new Error('billing.simplicate.apiUrl must use https');
    apiUrl = parsed.href.replace(/\/+$/, '');
  } else {
    if (typeof block.domain !== 'string' || !subdomain.test(block.domain)) throw new Error('billing.simplicate.domain must be your Simplicate subdomain, such as agency for agency.simplicate.nl');
    apiUrl = `https://${block.domain}.simplicate.nl/api/v2`;
  }
  return { apiUrl, tokenEnv: block.tokenEnv };
}

const unconnected = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH']);

function jsonErrors(text: string): string[] {
  try {
    const errors = (JSON.parse(text) as { errors?: unknown }).errors;
    return Array.isArray(errors) ? errors.map(String) : [];
  } catch { return []; }
}

function failureMessage(status: number, text: string): string {
  const errors = jsonErrors(text);
  return `Simplicate answered ${status}${errors.length ? `: ${errors.join('; ')}` : text.trim() ? `: ${text.trim()}` : ''}`.slice(0, 300);
}

/**
 * Writes each line as one fixed-fee project service on the mapped project (`POST /projects/service`, Simplicate API
 * v2), so it appears in Simplicate's own "to be invoiced" flow and Simplicate makes and sends the invoice. A credit
 * line is the same service with `amount` -1.
 */
export class SimplicateExporter implements BillingExporter {
  private readonly settings: SimplicateSettings;
  private readonly dependencies: BillingDependencies;
  constructor(settings: SimplicateSettings, dependencies: BillingDependencies) {
    this.settings = settings;
    this.dependencies = dependencies;
  }

  /** The request body for `line` at `target`, exactly as it is sent. */
  static body(line: PricedBillingLine, target: BillingTarget): Record<string, unknown> {
    const date = lineDate(line.acceptance.at);
    return {
      project_id: target.projectId,
      default_service_id: target.defaultServiceId,
      name: lineName(line),
      explanation: lineExplanation(line),
      invoice_method: 'FixedFee',
      amount: line.quantity,
      price: line.unitPriceCents / 100,
      ...(target.vatClassId ? { vat_class_id: target.vatClassId } : {}),
      ...(target.revenueGroupId ? { revenue_group_id: target.revenueGroupId } : {}),
      external_id: line.key,
      start_date: date,
      end_date: date,
      track_hours: false,
      track_cost: false,
    };
  }

  async send(line: PricedBillingLine, target: BillingTarget): Promise<BillingSendResult> {
    const credential = simplicateCredential(this.dependencies.env[this.settings.tokenEnv]);
    if (!credential) throw new BillingSendError('refused', `${this.settings.tokenEnv} no longer holds the Simplicate key and secret.`);
    let response: Response;
    try {
      response = await this.dependencies.fetch(`${this.settings.apiUrl}/projects/service`, {
        method: 'POST',
        headers: { 'Authentication-Key': credential.key, 'Authentication-Secret': credential.secret, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(SimplicateExporter.body(line, target)),
        signal: AbortSignal.timeout(this.dependencies.timeoutMs),
        redirect: 'error',
      });
    } catch (error) {
      const code = String((error as { cause?: { code?: unknown } })?.cause?.code ?? '');
      if (unconnected.has(code)) throw new BillingSendError('retry', `Simplicate could not be reached (${code}).`);
      throw new BillingSendError('uncertain', 'The connection to Simplicate ended before it answered, so the line may have been created.');
    }
    const text = await response.text().catch(() => '');
    if (response.ok) {
      let id: unknown;
      try { id = (JSON.parse(text) as { data?: { id?: unknown } }).data?.id; } catch { id = undefined; }
      return { remoteId: typeof id === 'string' && id.length <= 200 ? id : null };
    }
    if (response.status === 429 || response.status === 503) throw new BillingSendError('retry', failureMessage(response.status, text), response.status);
    if (response.status >= 500) throw new BillingSendError('uncertain', `${failureMessage(response.status, text)}. The line may have been created.`, response.status);
    throw new BillingSendError('refused', failureMessage(response.status, text), response.status);
  }
}

/** The `simplicate` billing adapter. */
export const simplicateExporter: BillingExporterDefinition = {
  name: 'simplicate',
  title: 'Simplicate',
  targetFields: [
    { key: 'projectId', label: 'Simplicate project id', required: true, hint: 'The project the lines go on, such as project:abc123.' },
    { key: 'defaultServiceId', label: 'Simplicate service id', required: true, hint: 'The catalogue service each line is made from (default_service_id).' },
    { key: 'vatClassId', label: 'VAT class id', required: false, hint: 'Leave empty to use the service’s VAT class.' },
    { key: 'revenueGroupId', label: 'Revenue group id', required: false, hint: 'Leave empty to use the service’s revenue group.' },
  ],
  settings: (raw, context) => settings(raw, context),
  create: (value, dependencies) => new SimplicateExporter(value as SimplicateSettings, dependencies),
};
