import { randomBytes } from 'node:crypto';
import { RuntimeFailure, transportFailure } from './failures.ts';
import type { AppConfig, Credential, GatewayRequest, ModelUsage, Session } from './types.ts';

type GatewayKey = { token: string; key_alias: string; spend?: number; blocked?: boolean; metadata?: Record<string, unknown> };

export interface BudgetBroker {
  mint(session: Session): Promise<Credential>;
  spend(reference: string): Promise<number | undefined>;
  revoke(reference: string): Promise<void>;
  usage?(reference: string): Promise<ModelUsage[] | undefined>;
  ledger?(reference: string): Promise<{ usage: ModelUsage[]; requests: GatewayRequest[] } | undefined>;
  providersFor?(model: string): Promise<string[] | undefined>;
  routes?(model: string): Promise<{ provider?: string; tiers?: Record<string, string> } | undefined>;
}

export class LiteLLMBroker implements BudgetBroker {
  readonly config: NonNullable<AppConfig['litellm']>;

  constructor(config: NonNullable<AppConfig['litellm']>) {
    this.config = config;
    const url = new URL(config.adminUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid LiteLLM admin URL');
    if (!config.masterKey || !config.models.length || !/^[1-9][0-9]*[smhd]$/.test(config.ttl)) throw new Error('LiteLLM requires a master key, model allowlist and positive key lifetime');
  }

  async request(path: string, method = 'GET', body?: unknown): Promise<any> {
    let response: Response;
    try {
      response = await fetch(this.config.adminUrl.replace(/\/$/, '') + path, {
        method, headers: { authorization: `Bearer ${this.config.masterKey}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10_000), redirect: 'error',
      });
    } catch (error) { throw transportFailure(error, 'credentials'); }
    if (!response.ok) throw new RuntimeFailure(response.status >= 500 ? 'connectivity' : 'gateway_rejected', 'credentials', 'not_submitted', response.status, `${method} ${path.split('?')[0]} returned HTTP ${response.status}`);
    try { return await response.json(); } catch { throw new Error('LiteLLM returned invalid JSON'); }
  }

  async mint(session: Session): Promise<Credential> {
    if (!Number.isFinite(session.budgetUsd) || session.budgetUsd <= 0) throw new Error('Refusing an uncapped LiteLLM credential');
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(session.id)) throw new Error('Invalid session identity');
    const alias = `de-vloer-${session.id}-${randomBytes(6).toString('hex')}`;
    const result = await this.request('/key/generate', 'POST', {
      key_alias: alias, max_budget: session.budgetUsd, budget_duration: null,
      models: this.config.models, duration: this.config.ttl,
      metadata: { application: 'de-vloer', session_id: session.id, operator_id: session.ownerId },
    });
    if (typeof result?.key !== 'string' || !result.key) throw new Error('LiteLLM returned no credential');
    return { key: result.key, alias, reference: alias, budgetUsd: session.budgetUsd };
  }

  async keys(): Promise<GatewayKey[]> {
    const keys: GatewayKey[] = [];
    for (let page = 1; page <= 1000; page++) {
      const result = await this.request(`/key/list?return_full_object=true&size=100&page=${page}`);
      if (!Array.isArray(result.keys) || !Number.isInteger(result.total_pages) || result.total_pages < 0) throw new Error('LiteLLM key listing shape is invalid');
      for (const key of result.keys) {
        if (typeof key?.token !== 'string' || typeof key?.key_alias !== 'string') continue;
        if (key.key_alias.startsWith('de-vloer-')) keys.push(key);
      }
      if (page >= result.total_pages) return keys;
    }
    throw new Error('LiteLLM key listing exceeded its page limit');
  }

  async find(reference: string): Promise<GatewayKey | undefined> {
    if (!/^de-vloer-[a-zA-Z0-9_-]+$/.test(reference)) throw new Error('Invalid credential reference');
    const matches = (await this.keys()).filter(key => key.key_alias === reference);
    if (matches.length > 1) throw new Error('LiteLLM returned duplicate credential aliases');
    return matches[0];
  }

  async spend(reference: string): Promise<number | undefined> {
    const key = await this.find(reference);
    if (!key) return undefined;
    const result = await this.request(`/key/info?key=${encodeURIComponent(key.token)}`);
    if (result?.info?.blocked === true || key.blocked === true) {
      const blockedAt = Date.parse(String(result?.info?.metadata?.de_vloer_blocked_at ?? key.metadata?.de_vloer_blocked_at ?? ''));
      const delay = this.config.settlementDelayMs ?? 60_000;
      if (!Number.isFinite(blockedAt) || Date.now() < blockedAt + Math.max(0, delay)) return undefined;
    }
    const spend = result?.info?.spend;
    return typeof spend === 'number' && Number.isFinite(spend) && spend >= 0 ? spend : undefined;
  }

  async revoke(reference: string): Promise<void> {
    const key = await this.find(reference);
    if (!key) return;
    if (key.blocked !== true) await this.request('/key/block', 'POST', { key: key.token });
    if (!key.metadata?.de_vloer_blocked_at) await this.request('/key/update', 'POST', {
      key: key.token, metadata: { ...key.metadata, de_vloer_blocked_at: new Date().toISOString() },
    });
  }

  async usage(reference: string): Promise<ModelUsage[] | undefined> { return (await this.ledger(reference))?.usage; }

  async ledger(reference: string): Promise<{ usage: ModelUsage[]; requests: GatewayRequest[] } | undefined> {
    const key = await this.find(reference);
    if (!key) return undefined;
    const result = await this.request(`/spend/logs?api_key=${encodeURIComponent(key.token)}`);
    const rows: any[] = Array.isArray(result) ? result : Array.isArray(result?.data) ? result.data : [];
    const requests: GatewayRequest[] = [];
    for (const row of rows.slice(0, 500)) {
      const md = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      const model = typeof row?.model === 'string' && row.model ? row.model : 'unknown';
      const start = Date.parse(String(row?.startTime ?? '')), end = Date.parse(String(row?.endTime ?? '')), first = Date.parse(String(row?.completionStartTime ?? ''));
      const decision = md.routing_decision && typeof md.routing_decision === 'object' ? md.routing_decision : {};
      const extra = md.additional_usage_values && typeof md.additional_usage_values === 'object' ? md.additional_usage_values : {};
      const details = extra.prompt_tokens_details && typeof extra.prompt_tokens_details === 'object' ? extra.prompt_tokens_details : {};
      const failure = md.error_information && typeof md.error_information === 'object' ? md.error_information : undefined;
      const tags: string[] = Array.isArray(row?.request_tags) ? row.request_tags.map(String) : [];
      const harness = tags.map(tag => /^User-Agent:\s*(\S+\/\S+)/.exec(tag)?.[1]).find(Boolean);
      let host: string | undefined;
      try { if (typeof row?.api_base === 'string' && row.api_base) host = new URL(row.api_base).host; } catch {}
      const savings = Number(md.autorouter_savings);
      requests.push({
        id: String(row?.request_id ?? md.litellm_call_id ?? requests.length), at: Number.isFinite(start) ? new Date(start).toISOString() : new Date(0).toISOString(),
        ...(Number.isFinite(start) && Number.isFinite(end) ? { durationMs: Math.max(0, end - start) } : {}), ...(Number.isFinite(start) && Number.isFinite(first) ? { firstTokenMs: Math.max(0, first - start) } : {}),
        ...(typeof row?.custom_llm_provider === 'string' && row.custom_llm_provider ? { provider: row.custom_llm_provider } : {}), ...(host ? { host } : {}), ...(typeof extra.inference_geo === 'string' ? { geo: extra.inference_geo } : {}),
        model, ...(typeof row?.model_group === 'string' && row.model_group && row.model_group !== model ? { group: row.model_group } : {}),
        ...(typeof decision.tier === 'string' ? { tier: decision.tier } : {}), ...(typeof decision.cause === 'string' ? { cause: decision.cause } : {}), ...(Number.isFinite(savings) && savings > 0 ? { savingsUsd: Math.round(savings * 1e6) / 1e6 } : {}),
        retries: Number(md.attempted_retries) || 0, fallbacks: Number(md.attempted_fallbacks) || 0, guardrails: Array.isArray(md.applied_guardrails) ? md.applied_guardrails.map(String) : [],
        cacheHit: row?.cache_hit === true || row?.cache_hit === 'True', cachedTokens: Number(details.cached_tokens) || 0,
        inputTokens: Number(row?.prompt_tokens) || 0, outputTokens: Number(row?.completion_tokens) || 0, usd: Math.round((Number(row?.spend) || 0) * 1e6) / 1e6,
        status: row?.status === 'failure' ? 'failure' : 'success', ...(failure ? { error: [failure.error_class, failure.error_code, String(failure.error_message ?? '').slice(0, 200)].filter(Boolean).join(' · ') } : {}),
        ...(typeof md.litellm_call_id === 'string' ? { callId: md.litellm_call_id } : {}), ...(harness ? { harness } : {}),
      });
    }
    requests.sort((a, b) => a.at.localeCompare(b.at));
    const byModel = new Map<string, ModelUsage>();
    for (const row of rows) {
      const model = typeof row?.model === 'string' && row.model ? row.model : 'unknown';
      const group = typeof row?.model_group === 'string' && row.model_group && row.model_group !== model ? row.model_group : undefined;
      const entry = byModel.get(model) ?? { model, ...(group ? { group } : {}), requests: 0, failures: 0, usd: 0, inputTokens: 0, outputTokens: 0 };
      entry.requests += 1;
      if (row?.status === 'failure') entry.failures += 1;
      const spend = Number(row?.spend);
      if (Number.isFinite(spend) && spend > 0) entry.usd = Math.round((entry.usd + spend) * 1e6) / 1e6;
      const input = Number(row?.prompt_tokens), output = Number(row?.completion_tokens);
      if (Number.isFinite(input) && input > 0) entry.inputTokens += input;
      if (Number.isFinite(output) && output > 0) entry.outputTokens += output;
      byModel.set(model, entry);
    }
    return { usage: [...byModel.values()].sort((a, b) => b.usd - a.usd), requests };
  }

  private catalogue?: { at: number; entries: Map<string, { provider?: string; tiers: string[]; tierMap?: Record<string, string> }> };

  async providersFor(model: string): Promise<string[] | undefined> {
    if (!this.catalogue || Date.now() - this.catalogue.at > 60_000) {
      const result = await this.request('/model/info');
      const rows: any[] = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
      const entries = new Map<string, { provider?: string; tiers: string[] }>();
      for (const row of rows) {
        if (typeof row?.model_name !== 'string') continue;
        const tiers = row?.litellm_params?.complexity_router_config?.tiers;
        const provider = typeof row?.model_info?.litellm_provider === 'string' ? row.model_info.litellm_provider : typeof row?.litellm_params?.model === 'string' && row.litellm_params.model.includes('/') ? row.litellm_params.model.split('/')[0] : undefined;
        entries.set(row.model_name, { provider, tiers: tiers && typeof tiers === 'object' ? [...new Set(Object.values(tiers).filter((value): value is string => typeof value === 'string'))] : [], ...(tiers && typeof tiers === 'object' ? { tierMap: Object.fromEntries(Object.entries(tiers).filter(([, value]) => typeof value === 'string')) as Record<string, string> } : {}) });
      }
      this.catalogue = { at: Date.now(), entries };
    }
    const providers = new Set<string>();
    const seen = new Set<string>();
    const visit = (name: string, depth: number): void => {
      if (depth > 4 || seen.has(name)) return;
      seen.add(name);
      const entry = this.catalogue!.entries.get(name);
      if (!entry) return;
      if (entry.tiers.length) for (const tier of entry.tiers) visit(tier, depth + 1);
      else if (entry.provider) providers.add(entry.provider);
    };
    visit(model, 0);
    return seen.has(model) && this.catalogue.entries.has(model) ? [...providers] : undefined;
  }

  async routes(model: string): Promise<{ provider?: string; tiers?: Record<string, string> } | undefined> {
    await this.providersFor(model);
    const entry = this.catalogue?.entries.get(model);
    if (!entry) return undefined;
    return { ...(entry.provider ? { provider: entry.provider } : {}), ...(entry.tierMap ? { tiers: entry.tierMap } : {}) };
  }

  async aliasesForSession(sessionId: string): Promise<string[]> {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(sessionId)) throw new Error('Invalid session identity');
    return (await this.keys()).filter(key => key.key_alias.startsWith(`de-vloer-${sessionId}-`)).map(key => key.key_alias);
  }
}
