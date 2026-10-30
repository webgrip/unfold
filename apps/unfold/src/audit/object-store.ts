import { createHash, createHmac } from 'node:crypto';

/**
 * An S3-compatible bucket: `url` is the bucket's own URL, path style (`https://s3.example.com/bucket`) or virtual-hosted
 * (`https://bucket.s3.example.com`). `lockDays`, when set, asks S3 Object Lock to keep each object in compliance mode.
 */
export type ObjectStoreSettings = { url: string; region: string; prefix: string; accessKeyId: string; secretAccessKey: string; lockDays?: number };

const emptyHash = createHash('sha256').update('').digest('hex');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const hmac = (key: string | Buffer, value: string) => createHmac('sha256', key).update(value).digest();
const rfc3986 = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

/** The `x-amz-date` form of a time: `20261030T090000Z`. */
export const amzDate = (at: Date) => at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * Signs one S3 request with AWS Signature Version 4 and returns the headers to send, `authorization` included. Every
 * header passed is signed, together with `host`, `x-amz-date` and `x-amz-content-sha256`.
 */
export function signS3Request(request: { method: string; url: URL; headers?: Record<string, string>; payloadHash?: string; region: string; accessKeyId: string; secretAccessKey: string; at: Date }): Record<string, string> {
  const date = amzDate(request.at);
  const day = date.slice(0, 8);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers ?? {})) headers[name.toLowerCase()] = value.trim().replace(/\s+/g, ' ');
  headers['x-amz-date'] = date;
  headers['x-amz-content-sha256'] = request.payloadHash ?? emptyHash;
  const signed = { ...headers, host: request.url.host };
  const names = Object.keys(signed).sort();
  const query = [...request.url.searchParams].map(([key, value]) => [rfc3986(key), rfc3986(value)]).sort(([a, x], [b, y]) => a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('&');
  const canonical = [request.method, request.url.pathname || '/', query, names.map(name => `${name}:${signed[name as keyof typeof signed]}\n`).join(''), names.join(';'), headers['x-amz-content-sha256']].join('\n');
  const scope = `${day}/${request.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', date, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${request.secretAccessKey}`, day), request.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${request.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

const xmlText = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Writes, lists and reads objects in one S3-compatible bucket with Signature Version 4, without an SDK. */
export class ObjectStore {
  readonly settings: ObjectStoreSettings;
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;

  constructor(settings: ObjectStoreSettings, options: { fetch?: typeof fetch; now?: () => Date } = {}) {
    this.settings = settings;
    this.fetcher = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  private objectUrl(key: string): URL {
    const base = new URL(this.settings.url);
    base.pathname = `${base.pathname.replace(/\/+$/, '')}/${key.split('/').map(rfc3986).join('/')}`;
    return base;
  }

  private async send(method: string, url: URL, body?: string, extra: Record<string, string> = {}): Promise<Response> {
    const at = this.now();
    const headers = signS3Request({ method, url, headers: extra, ...(body !== undefined ? { payloadHash: sha256(body) } : {}), region: this.settings.region, accessKeyId: this.settings.accessKeyId, secretAccessKey: this.settings.secretAccessKey, at });
    return this.fetcher(url, { method, headers, ...(body !== undefined ? { body } : {}), signal: AbortSignal.timeout(15_000) });
  }

  /** Writes one object; with `lockDays`, it is retained in compliance mode until that many days after `at`. */
  async put(key: string, body: string, contentType: string, at = this.now()): Promise<void> {
    const extra: Record<string, string> = { 'content-type': contentType, 'content-md5': createHash('md5').update(body).digest('base64') };
    if (this.settings.lockDays) {
      extra['x-amz-object-lock-mode'] = 'COMPLIANCE';
      extra['x-amz-object-lock-retain-until-date'] = new Date(at.getTime() + this.settings.lockDays * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    }
    const response = await this.send('PUT', this.objectUrl(key), body, extra);
    const text = await response.text();
    const code = /<Code>([^<]{1,100})<\/Code>/.exec(text)?.[1];
    if (!response.ok) throw new Error(`the bucket answered PUT with HTTP ${response.status}${code ? ` ${code}` : ''}`);
  }

  /** Every key under `prefix`, in the bucket's (lexicographic) order. */
  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const url = new URL(this.settings.url);
      url.pathname = url.pathname.replace(/\/+$/, '') || '/';
      url.search = '';
      url.searchParams.set('list-type', '2');
      url.searchParams.set('prefix', prefix);
      if (token) url.searchParams.set('continuation-token', token);
      const response = await this.send('GET', url);
      const text = await response.text();
      if (!response.ok) throw new Error(`the bucket answered a listing with HTTP ${response.status}`);
      for (const match of text.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(xmlText(match[1]));
      token = /<IsTruncated>true<\/IsTruncated>/.test(text) ? xmlText(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(text)?.[1] ?? '') || undefined : undefined;
    } while (token);
    return keys;
  }

  /** One object's body, or undefined when it does not exist. */
  async get(key: string): Promise<string | undefined> {
    const response = await this.send('GET', this.objectUrl(key));
    const text = await response.text();
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`the bucket answered GET with HTTP ${response.status}`);
    return text;
  }
}
