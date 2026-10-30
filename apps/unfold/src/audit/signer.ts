import { readFile } from 'node:fs/promises';

/** A signature over a checkpoint, as the signer wrote it, and the version of the key that made it. */
export type CheckpointSignature = { signature: string; keyVersion: number };

/** What signed a checkpoint, recorded in the checkpoint itself and covered by its signature. */
export type SignerIdentity = { kind: 'openbao-transit'; key: string };

/** Signs and verifies audit checkpoints. Unfold never holds the private key. */
export interface CheckpointSigner {
  readonly identity: SignerIdentity;
  sign(payload: string): Promise<CheckpointSignature>;
  verify(payload: string, signature: string): Promise<boolean>;
}

/** How Unfold signs in to OpenBao: a token from the environment, or a Kubernetes service account token exchanged for one. */
export type OpenBaoAuth = { kind: 'token'; token: string } | { kind: 'kubernetes'; role: string; mount: string; jwtPath: string };

/** An OpenBao Transit key Unfold signs checkpoints with. */
export type OpenBaoSettings = { address: string; mount: string; key: string; auth: OpenBaoAuth };

/** The service account token a Kubernetes pod reads to sign in to OpenBao. */
export const serviceAccountTokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token';

const keyVersionOf = (signature: string): number => Number(/^[a-z]+:v(\d+):/.exec(signature)?.[1] ?? Number.NaN);
const segment = (value: string) => value.split('/').map(encodeURIComponent).join('/');

/**
 * Signs with an OpenBao Transit key over its HTTP API: `POST /v1/<mount>/sign/<key>` and `POST /v1/<mount>/verify/<key>`.
 * The key stays in OpenBao. A Kubernetes sign-in is renewed before its lease ends and once after a refused request.
 */
export class OpenBaoTransitSigner implements CheckpointSigner {
  readonly identity: SignerIdentity;
  private readonly settings: OpenBaoSettings;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private token: { value: string; renewAt: number } | undefined;

  constructor(settings: OpenBaoSettings, options: { fetch?: typeof fetch; now?: () => number } = {}) {
    this.settings = settings;
    this.identity = { kind: 'openbao-transit', key: settings.key };
    this.fetcher = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async sign(payload: string): Promise<CheckpointSignature> {
    const data = await this.transit('sign', { input: Buffer.from(payload, 'utf8').toString('base64') });
    const signature = typeof data?.signature === 'string' ? data.signature : '';
    const keyVersion = Number.isInteger(data?.key_version) ? Number(data?.key_version) : keyVersionOf(signature);
    if (!signature || !Number.isInteger(keyVersion)) throw new Error('OpenBao answered sign without a signature');
    return { signature, keyVersion };
  }

  async verify(payload: string, signature: string): Promise<boolean> {
    try {
      const data = await this.transit('verify', { input: Buffer.from(payload, 'utf8').toString('base64'), signature });
      return data?.valid === true;
    } catch (error) {
      if ((error as { status?: number }).status === 400) return false;
      throw error;
    }
  }

  private async transit(action: 'sign' | 'verify', body: Record<string, string>): Promise<Record<string, unknown> | undefined> {
    const path = `/v1/${segment(this.settings.mount)}/${action}/${encodeURIComponent(this.settings.key)}`;
    try { return (await this.call(path, body, await this.currentToken())).data; }
    catch (error) {
      if ((error as { status?: number }).status !== 403 || this.settings.auth.kind !== 'kubernetes') throw error;
      this.token = undefined;
      return (await this.call(path, body, await this.currentToken())).data;
    }
  }

  private async currentToken(): Promise<string> {
    const auth = this.settings.auth;
    if (auth.kind === 'token') return auth.token;
    if (this.token && this.now() < this.token.renewAt) return this.token.value;
    const jwt = (await readFile(auth.jwtPath, 'utf8')).trim();
    const answer = await this.call(`/v1/auth/${segment(auth.mount)}/login`, { role: auth.role, jwt });
    const login = answer.auth as { client_token?: unknown; lease_duration?: unknown } | undefined;
    if (typeof login?.client_token !== 'string' || !login.client_token) throw new Error('OpenBao answered the Kubernetes login without a token');
    const lease = Number(login.lease_duration) > 0 ? Number(login.lease_duration) : 300;
    this.token = { value: login.client_token, renewAt: this.now() + lease * 800 };
    return this.token.value;
  }

  private async call(path: string, body: Record<string, string>, token?: string): Promise<{ data?: Record<string, unknown>; auth?: unknown }> {
    const response = await this.fetcher(new URL(path, this.settings.address), { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'X-Vault-Token': token } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
    const text = await response.text();
    if (!response.ok) {
      let detail = '';
      try { detail = ((JSON.parse(text) as { errors?: unknown[] }).errors ?? []).map(String).join('; '); } catch { detail = ''; }
      throw Object.assign(new Error(`OpenBao answered ${path} with HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`), { status: response.status });
    }
    return JSON.parse(text);
  }
}
