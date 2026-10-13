import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { plainRedactedText, withoutKnownSecrets } from './redaction.ts';
import type { ErrorReportConfig } from './types.ts';

/** How bad a reported problem is, in Sentry's levels. */
export type ErrorLevel = 'fatal' | 'error' | 'warning' | 'info';

/** What a report says besides the error: a level, short searchable tags, free-form extra data and the grouping key. `user` is hashed before it leaves. */
export type ErrorContext = { level?: ErrorLevel; tags?: Record<string, string | number | boolean | null | undefined>; extra?: Record<string, unknown>; fingerprint?: string[]; user?: string };

/** Where reported errors go. The workbench reports through one of these; without a destination it only logs. */
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

/** One scrubbed report, the same for every destination: what happened, how bad, where, and the context it carries. */
export type ErrorEvent = {
  id: string; at: number; level: ErrorLevel; kind: 'exception' | 'message'; type: string; message: string; stack: string;
  frames: ReturnType<typeof stackFrames>; tags: Record<string, string>; extra?: unknown; fingerprint?: string[];
  user?: string; release: string; environment: string; host: string;
};

/** A destination for reports. `send` resolves once the destination answered; a refusal or failure rejects with a short reason. */
export type ErrorSink = { name: string; send(event: ErrorEvent, fetcher: typeof fetch): Promise<void> };

async function deliver(fetcher: typeof fetch, url: string, init: RequestInit): Promise<void> {
  const response = await fetcher(url, { ...init, method: 'POST', signal: AbortSignal.timeout(errorReportLimits.timeoutMs), redirect: 'manual' });
  await response.body?.cancel().catch(() => undefined);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

/** Sends each report as a Sentry envelope, which Sentry, GlitchTip and Bugsink accept. */
export function sentrySink(target: SentryTarget): ErrorSink {
  return {
    name: 'sentry',
    send(event, fetcher) {
      const body = event.kind === 'exception'
        ? { exception: { values: [{ type: event.type, value: event.message, stacktrace: { frames: event.frames } }] } }
        : { message: { formatted: event.message } };
      const payload = {
        event_id: event.id, timestamp: event.at / 1000, platform: 'node', level: event.level, logger: 'unfold', server_name: event.host,
        release: event.release, environment: event.environment, tags: event.tags, extra: event.extra, fingerprint: event.fingerprint,
        user: event.user ? { id: event.user } : undefined, ...body,
      };
      const envelope = `${JSON.stringify({ event_id: event.id, sent_at: new Date(event.at).toISOString(), dsn: target.dsn })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(payload)}\n`;
      return deliver(fetcher, target.endpoint, { body: envelope, headers: { 'content-type': 'application/x-sentry-envelope', 'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${target.key}, sentry_client=unfold/${applicationVersion}` } });
    },
  };
}

const severity: Record<ErrorLevel, number> = { info: 9, warning: 13, error: 17, fatal: 21 };

/** The OTLP/HTTP JSON logs payload of one report: a log record with OpenTelemetry's `exception.*` attributes, its tags under `unfold.`. */
export function otlpErrorPayload(event: ErrorEvent): Record<string, unknown> {
  const text = (value: string) => ({ stringValue: value });
  const attributes: Record<string, string> = {
    'event.name': 'unfold.error',
    ...(event.kind === 'exception' ? { 'exception.type': event.type, 'exception.message': event.message, ...(event.stack ? { 'exception.stacktrace': event.stack } : {}) } : {}),
    ...Object.fromEntries(Object.entries(event.tags).map(([key, value]) => [`unfold.${key}`, value])),
    ...(event.fingerprint?.length ? { 'unfold.fingerprint': event.fingerprint.join(' ') } : {}),
    ...(event.user ? { 'unfold.user_hash': event.user } : {}),
    ...(event.extra !== undefined ? { 'unfold.extra': JSON.stringify(event.extra) } : {}),
    'unfold.report_id': event.id,
  };
  return {
    resourceLogs: [{
      resource: { attributes: [
        { key: 'service.name', value: text('unfold') }, { key: 'service.version', value: text(event.release.replace(/^unfold@/, '')) },
        { key: 'deployment.environment', value: text(event.environment) }, { key: 'host.name', value: text(event.host) },
      ] },
      scopeLogs: [{
        scope: { name: 'unfold.errors', version: event.release.replace(/^unfold@/, '') },
        logRecords: [{
          timeUnixNano: `${BigInt(Math.round(event.at)) * 1_000_000n}`, severityNumber: severity[event.level], severityText: event.level.toUpperCase(),
          body: text(event.message), attributes: Object.entries(attributes).map(([key, value]) => ({ key, value: text(value) })),
        }],
      }],
    }],
  };
}

/** Sends each report as an OTLP/HTTP JSON log record to `url` (a collector's `/v1/logs`), which any OpenTelemetry backend accepts. */
export function otlpSink(url: string): ErrorSink {
  return { name: 'otlp', send: (event, fetcher) => deliver(fetcher, url, { body: JSON.stringify(otlpErrorPayload(event)), headers: { 'content-type': 'application/json' } }) };
}

/**
 * Reports errors and notable failures to the configured destinations, with no SDK: a Sentry-protocol tracker
 * (`UNFOLD_SENTRY_DSN`), an OpenTelemetry collector (`UNFOLD_ERROR_OTLP_URL`), both or neither. Every report is also
 * written to the log as one JSON line. Messages, values and extra data lose known secrets and credential patterns first;
 * user ids are hashed. At most 30 events a minute leave, and a slow or failing destination never delays or fails the caller.
 */
export class ErrorReporter implements ErrorReports {
  private readonly sinks: ErrorSink[];
  private readonly environment: string;
  private readonly secrets: readonly string[];
  private readonly fetcher: typeof fetch;
  private readonly log: (line: string) => void;
  private window = { start: 0, sent: 0, dropped: 0 };
  readonly pending = new Set<Promise<void>>();

  constructor(config: ErrorReportConfig | undefined, secrets: readonly string[], options: { fetch?: typeof fetch; log?: (line: string) => void } = {}) {
    this.sinks = [...(config?.sentryDsn ? [sentrySink(sentryTarget(config.sentryDsn))] : []), ...(config?.otlpUrl ? [otlpSink(config.otlpUrl)] : [])];
    this.environment = config?.environment ?? 'production';
    this.secrets = config?.sentryDsn ? [...secrets, config.sentryDsn] : secrets;
    this.fetcher = options.fetch ?? fetch;
    this.log = options.log ?? (line => console.error(line));
  }

  /** The destinations reports go to, by name. */
  get destinations(): string[] { return this.sinks.map(sink => sink.name); }

  private scrub(value: string): string { return value.split('\n').map(line => plainRedactedText(withoutKnownSecrets(line, this.secrets))).join('\n'); }

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
    const stack = this.scrub(String(failure.stack ?? '')).split('\n').slice(0, errorReportLimits.frames + 1).join('\n');
    this.send({ kind: 'exception', type, message: this.scrub(failure.message), stack, frames: stackFrames(failure.stack).map(frame => ({ ...frame, filename: this.scrub(frame.filename) })) }, context);
  }

  message(text: string, context: ErrorContext = {}): void {
    this.send({ kind: 'message', type: 'message', message: this.scrub(text), stack: '', frames: [] }, context);
  }

  private send(body: Pick<ErrorEvent, 'kind' | 'type' | 'message' | 'stack' | 'frames'>, context: ErrorContext): void {
    const level = context.level ?? 'error';
    const tags = Object.fromEntries(Object.entries(context.tags ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([key, value]) => [key, this.scrub(String(value)).slice(0, 200)]));
    this.log(JSON.stringify({ level: level === 'fatal' ? 'error' : level === 'warning' ? 'warn' : level, event: 'error.reported', message: body.message.slice(0, 300), ...tags }));
    if (!this.sinks.length || !this.allowed()) return;
    const event: ErrorEvent = {
      id: randomUUID().replace(/-/g, ''), at: Date.now(), level, ...body, tags,
      extra: context.extra ? this.scrubbed(context.extra) : undefined, fingerprint: context.fingerprint,
      user: context.user ? hashed(context.user) : undefined, release: `unfold@${applicationVersion}`, environment: this.environment, host: hostname(),
    };
    for (const sink of this.sinks) {
      const tracked: Promise<void> = sink.send(event, this.fetcher)
        .catch((failure: unknown) => { this.log(JSON.stringify({ level: 'warn', event: 'error.report_failed', destination: sink.name, message: this.scrub(String((failure as Error)?.message ?? failure)).slice(0, 200) })); })
        .finally(() => this.pending.delete(tracked));
      this.pending.add(tracked);
    }
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
