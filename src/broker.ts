import { randomBytes } from 'node:crypto';
import { RuntimeFailure, transportFailure } from './failures.ts';
import type { AppConfig, Credential, Session } from './types.ts';

type GatewayKey = { token: string; key_alias: string; spend?: number; blocked?: boolean; metadata?: Record<string, unknown> };

export interface BudgetBroker {
  mint(session: Session): Promise<Credential>;
  spend(reference: string): Promise<number | undefined>;
  revoke(reference: string): Promise<void>;
  extend(reference: string, totalBudget: number): Promise<void>;
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
    if (!response.ok) throw new RuntimeFailure('gateway_rejected', 'credentials', 'not_submitted', response.status);
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

  async extend(reference: string, totalBudget: number): Promise<void> {
    if (!Number.isFinite(totalBudget) || totalBudget <= 0) throw new Error('Invalid credential budget');
    const key = await this.find(reference);
    if (!key) throw new Error('Credential no longer exists');
    await this.request('/key/update', 'POST', { key: key.token, max_budget: totalBudget });
  }

  async aliasesForSession(sessionId: string): Promise<string[]> {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(sessionId)) throw new Error('Invalid session identity');
    return (await this.keys()).filter(key => key.key_alias.startsWith(`de-vloer-${sessionId}-`)).map(key => key.key_alias);
  }

  async revokeSession(sessionId: string): Promise<void> {
    for (const alias of await this.aliasesForSession(sessionId)) await this.revoke(alias);
  }
}
