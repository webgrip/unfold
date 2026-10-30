import { createHash, randomBytes } from 'node:crypto';

/** Unfold refused or failed a call: `status` is the HTTP status (0 when Unfold could not be reached), `code` Unfold's error code. */
export class UnfoldError extends Error {
  /** @param {number} status @param {string} code @param {string} message */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** The `X-Unfold-Confirmation` value for text the person agreed to: a fresh id and the SHA-256 of the text, as unfold-mcp sends it. */
export function confirmationFor(text) {
  return `${randomBytes(12).toString('base64url')}:${createHash('sha256').update(text).digest('hex')}`;
}

/** Whether `url` is an http(s) address without credentials, query or fragment. */
export function validUrl(url) {
  return /^https?:\/\/[^\s/?#@]+(?:\/[^\s?#]*)?$/.test(String(url ?? ''));
}

/**
 * Unfold's HTTP API as the person behind an editor credential. Every change carries the mutation header and names this
 * client, so Unfold's action record says it came from `unfold-acp-agent`. Error messages never contain the token.
 */
export class Unfold {
  /** @param {{ url: string, token?: string, timeoutMs?: number, client?: string, fetch?: typeof fetch }} options */
  constructor({ url, token = '', timeoutMs = 20_000, client = 'unfold-acp-agent', fetch: fetcher = fetch }) {
    this.base = url.replace(/\/+$/, '');
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.client = client;
    this.fetcher = fetcher;
  }

  /** The Unfold page of a Work Item. */
  workItemLink(id) { return `${this.base}/#work/${encodeURIComponent(id)}`; }

  /** The Unfold page of a workbench session. */
  sessionLink(id) { return `${this.base}/#session/${encodeURIComponent(id)}`; }

  get(path) { return this.call('GET', path); }

  /** A change, with the confirmation the person gave for it when there was one. */
  post(path, body = {}, confirmation) { return this.call('POST', path, body, confirmation); }

  async call(method, path, body, confirmation) {
    const headers = { accept: 'application/json', 'x-unfold-client': this.client, ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), ...(body ? { 'content-type': 'application/json', 'x-unfold-request': '1' } : {}), ...(confirmation ? { 'x-unfold-confirmation': confirmation } : {}) };
    let response;
    try { response = await this.fetcher(`${this.base}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual', signal: AbortSignal.timeout(this.timeoutMs) }); }
    catch (error) {
      const name = error?.name;
      throw new UnfoldError(0, 'unreachable', name === 'TimeoutError' || name === 'AbortError' ? `Unfold did not answer within ${Math.round(this.timeoutMs / 1000)} seconds.` : `Unfold is unreachable at ${this.base}.`);
    }
    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch {}
    const said = parsed?.error?.message ? this.redact(String(parsed.error.message)) : '';
    if (response.status === 401) throw new UnfoldError(401, 'unauthenticated', this.token ? 'Unfold refused the editor credential: it expired or was signed out. Sign in again.' : 'Unfold needs a sign-in.');
    if (!response.ok || parsed === null) throw new UnfoldError(response.status, String(parsed?.error?.code ?? ''), said || `Unfold answered ${response.status}.`);
    return parsed;
  }

  redact(text) { return this.token ? text.split(this.token).join('[redacted]') : text; }
}
