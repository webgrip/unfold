import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { plainRedactedText, withoutKnownSecrets } from './redaction.ts';
import type { ErrorReportConfig } from './types.ts';

/** How bad a reported problem is, in Sentry's levels. */
export type ErrorLevel = 'fatal' | 'error' | 'warning' | 'info';

/** What a report says besides the error: a level, short searchable tags, free-form extra data and the grouping key. `user` is hashed before it leaves. */
export type ErrorContext = { level?: ErrorLevel; tags?: Record<string, string | number | boolean | null | undefined>; extra?: Record<string, unknown>; fingerprint?: string[]; user?: string };

/** Where reported errors go. The workbench reports through one of these; without a DSN it only logs. */
export interface ErrorReports {
  capture(error: unknown, context?: ErrorContext): void;
  message(text: string, context?: ErrorContext): void;
}

/** A parsed Sentry DSN: the envelope endpoint and the public key that authorizes it. */
export type SentryTarget = { endpoint: string; key: string; dsn: string };

/** The bounds of reporting: events per minute, the wait for the error tracker, and the most stack frames and extra characters per event. */
export const errorReportLimits = Object.freeze({ perMinute: 30, timeoutMs: 3000, frames: 50, extraChars: 4000 });

const applicationVersion = (() => { try { return String(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version); } catch { return 'unknown'; } })();

/** Reads a Sentry DSN (`https://<key>@<host>/<project>`, also served by GlitchTip and Bugsink) into its envelope endpoint, or throws. */
export function sentryTarget(dsn: string): SentryTarget {
  let url: URL;
  try { url = new URL(dsn); } catch { throw new Error('UNFOLD_SENTRY_DSN must be a Sentry DSN such as https://key@sentry.example/1'); }
  const project = url.pathname.replace(/\/$/, '').split('/').pop() ?? '';
  if (!['https:', 'http:'].includes(url.protocol) || !url.username || !/^\d+$/.test(project)) throw new Error('UNFOLD_SENTRY_DSN must be a Sentry DSN such as https://key@sentry.example/1');
  const prefix = url.pathname.replace(/\/$/, '').split('/').slice(0, -1).join('/');
  return { endpoint: `${url.protocol}//${url.host}${prefix}/api/${project}/envelope/`, key: decodeURIComponent(url.username), dsn };
}

/** Sentry stack frames from a V8 stack, oldest call first; frames outside node_modules and Node's own modules are the application's. */
export function stackFrames(stack: string | undefined): { function: string; filename: string; lineno?: number; colno?: number; in_app: boolean }[] {
  if (!stack) return [];
  const frames = [];
  for (const line of stack.split('\n').slice(1)) {
    const match = /^\s*at (?:(.+?) \()?(.+?)(?::(\d+))?(?::(\d+))?\)?$/.exec(line);
    if (!match) continue;
    const filename = match[2].replace(/^file:\/\//, '');
    frames.push({ function: match[1] || '<anonymous>', filename, ...(match[3] ? { lineno: Number(match[3]) } : {}), ...(match[4] ? { colno: Number(match[4]) } : {}), in_app: !filename.includes('node_modules') && !filename.startsWith('node:') });
  }
  return frames.slice(0, errorReportLimits.frames).reverse();
}

const hashed = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16);

/**
 * Sends errors and notable failures to a Sentry-compatible error tracker as envelopes, with no SDK. Every report is also
 * written to the log as one JSON line. Messages, values and extra data lose known secrets and credential patterns first;
 * user ids are hashed. At most 30 events a minute leave, and a slow or failing tracker never delays or fails the caller.
 */
export class SentryErrorReports implements ErrorReports {
  private readonly target: SentryTarget | null;
  private readonly config: ErrorReportConfig | undefined;
  private readonly secrets: readonly string[];
  private readonly fetcher: typeof fetch;
  private readonly log: (line: string) => void;
  private window = { start: 0, sent: 0, dropped: 0 };
  readonly pending = new Set<Promise<void>>();

  constructor(config: ErrorReportConfig | undefined, secrets: readonly string[], options: { fetch?: typeof fetch; log?: (line: string) => void } = {}) {
    this.config = config;
    this.target = config?.dsn ? sentryTarget(config.dsn) : null;
    this.secrets = config?.dsn ? [...secrets, config.dsn] : secrets;
    this.fetcher = options.fetch ?? fetch;
    this.log = options.log ?? (line => console.error(line));
  }

  private scrub(value: string): string { return withoutKnownSecrets(plainRedactedText(value), this.secrets); }

  private scrubbed(value: unknown, depth = 0): unknown {
    if (typeof value === 'string') return this.scrub(value).slice(0, errorReportLimits.extraChars);
    if (value === null || typeof value !== 'object') return typeof value === 'bigint' ? String(value) : value;
    if (depth >= 4) return '[nested]';
    if (Array.isArray(value)) return value.slice(0, 50).map(entry => this.scrubbed(entry, depth + 1));
    return Object.fromEntries(Object.entries(value).slice(0, 50).map(([key, entry]) => [this.scrub(key), this.scrubbed(entry, depth + 1)]));
  }

  capture(error: unknown, context: ErrorContext = {}): void {
    const failure = error instanceof Error ? error : new Error(String(error));
    const type = failure.name === 'Error' && (failure as { code?: unknown }).code ? String((failure as { code?: unknown }).code) : failure.name;
    this.send({ exception: { values: [{ type, value: this.scrub(failure.message), stacktrace: { frames: stackFrames(failure.stack).map(frame => ({ ...frame, filename: this.scrub(frame.filename) })) } }] } }, failure.message, context);
  }

  message(text: string, context: ErrorContext = {}): void {
    this.send({ message: { formatted: this.scrub(text) } }, text, context);
  }

  private send(body: Record<string, unknown>, summary: string, context: ErrorContext): void {
    const level = context.level ?? 'error';
    const tags = Object.fromEntries(Object.entries(context.tags ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([key, value]) => [key, this.scrub(String(value)).slice(0, 200)]));
    this.log(JSON.stringify({ level: level === 'fatal' ? 'error' : level === 'warning' ? 'warn' : level, event: 'error.reported', message: this.scrub(summary).slice(0, 300), ...tags }));
    if (!this.target || !this.allowed()) return;
    const eventId = randomUUID().replace(/-/g, '');
    const event = {
      event_id: eventId, timestamp: Date.now() / 1000, platform: 'node', level, logger: 'unfold', server_name: hostname(),
      release: `unfold@${applicationVersion}`, environment: this.config?.environment ?? 'production',
      tags, extra: context.extra ? this.scrubbed(context.extra) : undefined, fingerprint: context.fingerprint,
      user: context.user ? { id: hashed(context.user) } : undefined, ...body,
    };
    const envelope = `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: this.target.dsn })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`;
    const delivery = this.fetcher(this.target.endpoint, {
      method: 'POST', body: envelope, signal: AbortSignal.timeout(errorReportLimits.timeoutMs), redirect: 'manual',
      headers: { 'content-type': 'application/x-sentry-envelope', 'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${this.target.key}, sentry_client=unfold/${applicationVersion}` },
    }).then(async response => {
      await response.body?.cancel().catch(() => undefined);
      if (!response.ok) this.log(JSON.stringify({ level: 'warn', event: 'error.report_failed', status: response.status }));
    }, (failure: unknown) => { this.log(JSON.stringify({ level: 'warn', event: 'error.report_failed', message: this.scrub(String((failure as Error)?.message ?? failure)).slice(0, 200) })); });
    const tracked = delivery.finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
  }

  private allowed(): boolean {
    const now = Date.now();
    if (now - this.window.start >= 60_000) {
      if (this.window.dropped) this.log(JSON.stringify({ level: 'warn', event: 'error.reports_dropped', dropped: this.window.dropped }));
      this.window = { start: now, sent: 0, dropped: 0 };
    }
    if (this.window.sent >= errorReportLimits.perMinute) { this.window.dropped += 1; return false; }
    this.window.sent += 1;
    return true;
  }

  /** Waits until every report in flight has been delivered or given up, for a clean shutdown. */
  async flush(): Promise<void> { await Promise.allSettled([...this.pending]); }
}

/** A reporter that keeps nothing, for tests and callers that do not report. */
export const noErrorReports: ErrorReports = { capture() {}, message() {} };
