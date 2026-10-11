import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { AppConfig, ReportTarget, User } from './types.ts';
import type { TaskSourceConfig } from './tasks.ts';
import type { Store, StoredReport, StoredReportFile, StoredReportIssue } from './store.ts';
import { attachToIssue, createIssue, reportTargetProject, TaskError, updateIssueBody, type IssueFile } from './tasks.ts';

export const maxReportBytes = 8 * 1024 * 1024;
export const maxReportFiles = 5;
export const retryWindowMs = 24 * 3_600_000;
export const fileRetentionMs = 90 * 24 * 3_600_000;
const maxScreenshotBytes = 6 * 1024 * 1024;
const maxJsonBytes = 256 * 1024;
const maxConsoleEntries = 50;
const maxRequestEntries = 20;
const retryCheckMs = 60_000;
const firstRetryMs = 60_000;
const lastRetryGapMs = 3_600_000;
export const maxReportsPerHour = 10;
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A refusal of a posted report, answered with its HTTP status and code. */
export class ReportError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** What the browser can say about where the person was. Every field is optional and short. */
export type ReportContext = { route?: string; screen?: string; workItemId?: number; shiftId?: number; runId?: string; browser?: string; viewport?: string; locale?: string };
/** A posted report after every field and file was checked and every buffer entry reduced to its allowed fields. */
export type ParsedReport = { title: string; happened: string; expected: string; context: ReportContext; files: StoredReportFile[] };
/** What the route answers: filed with its address, kept to retry, or kept because nothing can file it. */
export type ReportOutcome = { id: string; status: StoredReport['status']; url?: string; message: string };

/**
 * Resolves `reports` from the configuration file: `false` turns Report a problem off, `{ source, project? }` names a
 * Forgejo or Vikunja task source and optionally another repository or project, and leaving it out picks the first
 * Forgejo or Vikunja source with a token. Returns null when nothing can file reports.
 */
export function reportSettings(raw: unknown, sources: TaskSourceConfig[] | undefined, mode: AppConfig['mode']): ReportTarget | null {
  if (raw === false || mode === 'demo') return null;
  const fileable = (sources ?? []).filter(source => (source.provider === 'forgejo' || source.provider === 'vikunja') && source.token);
  if (raw === undefined) return fileable[0] ? { sourceId: fileable[0].id, project: fileable[0].project } : null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['source', 'project'].includes(key))) throw new Error('reports must be false or { source, project? }');
  const value = raw as Record<string, unknown>;
  const source = fileable.find(entry => entry.id === value.source);
  if (!source) throw new Error('reports.source must name a Forgejo or Vikunja task source with a token');
  const project = value.project === undefined ? source.project : value.project;
  if (typeof project !== 'string') throw new Error('reports.project must be owner/repository for Forgejo or a numeric Vikunja project ID');
  return { sourceId: source.id, project: reportTargetProject(source, project) };
}

function text(value: FormDataEntryValue | null, field: string, max: number, required = false): string {
  const result = typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';
  if (required && !result) throw new ReportError(422, 'report_field_missing', `Say ${field === 'happened' ? 'what happened' : `the ${field}`}.`);
  if (result.length > max) throw new ReportError(422, 'report_field_too_long', `The ${field} is at most ${max} characters.`);
  return result;
}

function short(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.length && value.length <= max && !/[\u0000-\u001f]/.test(value) ? value : undefined;
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function context(raw: FormDataEntryValue | null): ReportContext {
  if (typeof raw !== 'string' || !raw) return {};
  if (raw.length > 4096) throw new ReportError(422, 'report_context_invalid', 'The page context is too large.');
  let value: Record<string, unknown>;
  try { value = JSON.parse(raw); } catch { throw new ReportError(422, 'report_context_invalid', 'The page context is not JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const route = short(value.route, 200);
  const result: ReportContext = {
    ...(route?.startsWith('#') ? { route: route.split('?')[0] } : {}),
    ...(short(value.screen, 64) ? { screen: short(value.screen, 64) } : {}),
    ...(count(value.workItemId) !== undefined ? { workItemId: count(value.workItemId) } : {}),
    ...(count(value.shiftId) !== undefined ? { shiftId: count(value.shiftId) } : {}),
    ...(short(value.runId, 64) && /^[A-Za-z0-9_-]+$/.test(String(value.runId)) ? { runId: String(value.runId) } : {}),
    ...(short(value.browser, 120) ? { browser: short(value.browser, 120) } : {}),
    ...(short(value.viewport, 32) && /^\d{1,5}×\d{1,5}$/.test(String(value.viewport)) ? { viewport: String(value.viewport) } : {}),
    ...(short(value.locale, 35) && /^[A-Za-z0-9-]+$/.test(String(value.locale)) ? { locale: String(value.locale) } : {}),
  };
  return result;
}

/**
 * Reduces a posted `console.json` to message, source path, line, level and time per entry, and a `requests.json` to
 * method, path without its query, status, duration and time. Anything else the browser sent is dropped, so no header,
 * query string or body can reach the tracker however the page was changed.
 */
export function sanitizeBuffer(kind: 'console' | 'requests', raw: unknown): Record<string, string | number>[] {
  if (!Array.isArray(raw)) return [];
  const limit = kind === 'console' ? maxConsoleEntries : maxRequestEntries;
  return raw.slice(-limit).flatMap((entry): Record<string, string | number>[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const value = entry as Record<string, unknown>;
    const at = typeof value.at === 'string' && !Number.isNaN(Date.parse(value.at)) ? new Date(value.at).toISOString() : undefined;
    if (kind === 'console') {
      const message = typeof value.message === 'string' ? value.message.slice(0, 500) : undefined;
      if (!message) return [];
      const source = typeof value.source === 'string' ? value.source.split(/[?#]/)[0].slice(0, 200) : undefined;
      return [{ level: value.level === 'warn' ? 'warn' : 'error', message, ...(source ? { source } : {}), ...(count(value.line) !== undefined ? { line: count(value.line)! } : {}), ...(at ? { at } : {}) }];
    }
    const method = typeof value.method === 'string' && /^[A-Z]{3,7}$/.test(value.method) ? value.method : undefined;
    const path = typeof value.path === 'string' && value.path.startsWith('/') ? value.path.split(/[?#]/)[0].slice(0, 200) : undefined;
    if (!method || !path) return [];
    return [{ method, path, ...(count(value.status) !== undefined ? { status: count(value.status)! } : {}), ...(count(value.durationMs) !== undefined ? { durationMs: count(value.durationMs)! } : {}), ...(at ? { at } : {}) }];
  });
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > maxReportBytes) throw new ReportError(413, 'report_too_large', 'A report is at most 8 MB.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxReportBytes) throw new ReportError(413, 'report_too_large', 'A report is at most 8 MB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Reads and checks one multipart report from the request: the text fields, the page context and at most five files. */
export async function parseReport(req: IncomingMessage): Promise<ParsedReport> {
  const type = req.headers['content-type'] ?? '';
  if (!/^multipart\/form-data;\s*boundary=/i.test(type)) throw new ReportError(415, 'content_type', 'Send the report as multipart/form-data.');
  const body = await readBody(req);
  let form: FormData;
  try { form = await new Request('http://report.invalid/', { method: 'POST', headers: { 'content-type': type }, body: new Uint8Array(body) }).formData(); } catch { throw new ReportError(400, 'report_invalid', 'The report could not be read.'); }
  const files: StoredReportFile[] = [];
  const uploads = [...form.entries()].filter(([, value]) => typeof value !== 'string') as [string, File][];
  if (uploads.length > maxReportFiles) throw new ReportError(413, 'report_too_many_files', `A report carries at most ${maxReportFiles} files.`);
  for (const [field, file] of uploads) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (field === 'screenshot') {
      if (bytes.length > maxScreenshotBytes || !pngSignature.every((byte, index) => bytes[index] === byte)) throw new ReportError(422, 'report_screenshot_invalid', 'The screenshot must be a PNG of at most 6 MB.');
      files.push({ name: 'screenshot.png', type: 'image/png', content: bytes });
    } else if (field === 'console' || field === 'requests') {
      if (bytes.length > maxJsonBytes) throw new ReportError(413, 'report_too_large', `${field}.json is at most 256 KB.`);
      let parsed: unknown;
      try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ReportError(422, 'report_attachment_invalid', `${field}.json is not JSON.`); }
      const entries = sanitizeBuffer(field, parsed);
      files.push({ name: `${field}.json`, type: 'application/json', content: new TextEncoder().encode(`${JSON.stringify(entries, null, 2)}\n`) });
    } else throw new ReportError(422, 'report_attachment_unknown', 'A report carries a screenshot, console.json and requests.json only.');
  }
  const happened = text(form.get('happened'), 'happened', 4000, true);
  const title = text(form.get('title'), 'title', 200) || happened.split(/(?<=[.!?])\s|\n/)[0].slice(0, 120);
  return { title, happened, expected: text(form.get('expected'), 'expected', 4000), context: context(form.get('context')), files };
}

function markdownText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/!\[/g, '!\\[').replace(/@(?=\w)/g, '@​');
}

function htmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function facts(report: StoredReport, version: string, baseUrl: string | undefined): [string, string, string?][] {
  const context = report.body.context as ReportContext;
  const link = (path: string) => (baseUrl ? `${baseUrl}/${path}` : undefined);
  return [
    ...(context.route ? [['Page', context.route, link(context.route)] as [string, string, string?]] : []),
    ...(context.workItemId !== undefined ? [['Work Item', String(context.workItemId), link(`#work/${context.workItemId}`)] as [string, string, string?]] : []),
    ...(context.shiftId !== undefined ? [['Shift', String(context.shiftId)] as [string, string]] : []),
    ...(context.runId ? [['Run', context.runId] as [string, string]] : []),
    ['Unfold', version],
    ...(context.browser ? [['Browser', context.browser] as [string, string]] : []),
    ...(context.viewport ? [['Viewport', context.viewport] as [string, string]] : []),
    ...(context.locale ? [['Locale', context.locale] as [string, string]] : []),
  ];
}

/** The Markdown body of a Forgejo issue: what happened, what was expected, the page facts and, once uploaded, the screenshot. */
export function markdownBody(report: StoredReport, version: string, baseUrl?: string, screenshotUrl?: string, attachments: string[] = []): string {
  const happened = String(report.body.happened ?? '');
  const expected = String(report.body.expected ?? '');
  const rows = facts(report, version, baseUrl).map(([name, value, href]) => `| ${name} | ${href ? `[${markdownText(value)}](${href})` : markdownText(value)} |`);
  return [
    '## What happened', '', markdownText(happened), '',
    ...(expected ? ['## What I expected', '', markdownText(expected), ''] : []),
    '| | |', '| --- | --- |', ...rows, '',
    ...(screenshotUrl ? [`![Screenshot](${screenshotUrl})`, ''] : []),
    ...(attachments.length ? [`Attached: ${attachments.join(', ')}.`, ''] : []),
    '_Filed with Report a problem in Unfold._', '',
  ].join('\n');
}

/** The HTML description of a Vikunja task with the same sections; the screenshot travels as an attachment. */
export function htmlBody(report: StoredReport, version: string, baseUrl?: string, attachments: string[] = []): string {
  const paragraphs = (value: string) => value.split(/\n{2,}/).map(part => `<p>${htmlText(part).replace(/\n/g, '<br>')}</p>`).join('');
  const expected = String(report.body.expected ?? '');
  const rows = facts(report, version, baseUrl).map(([name, value, href]) => `<tr><th>${htmlText(name)}</th><td>${href ? `<a href="${htmlText(href)}">${htmlText(value)}</a>` : htmlText(value)}</td></tr>`).join('');
  return `<h2>What happened</h2>${paragraphs(String(report.body.happened ?? ''))}${expected ? `<h2>What I expected</h2>${paragraphs(expected)}` : ''}<table>${rows}</table>${attachments.length ? `<p>Attached: ${htmlText(attachments.join(', '))}.</p>` : ''}<p><em>Filed with Report a problem in Unfold.</em></p>`;
}

/**
 * Stores what people report and files it into the configured tracker. A report is saved before the first attempt, so
 * a refusing or unreachable tracker loses nothing: it is retried with growing gaps for a day, and an issue created
 * before every file went up is continued rather than filed twice.
 */
export class ReportService {
  private store: Store;
  private config: AppConfig;
  private version: string;
  private now: () => Date;
  private timer: ReturnType<typeof setInterval> | undefined;
  private retrying: Promise<void> | undefined;
  private stopped = false;
  private recent = new Map<string, number[]>();

  constructor(store: Store, config: AppConfig, version: string, now: () => Date = () => new Date(), options: { schedule?: boolean } = {}) {
    this.store = store;
    this.config = config;
    this.version = version;
    this.now = now;
    if (options.schedule !== false) {
      this.timer = setInterval(() => { void this.retryDue(); }, retryCheckMs);
      this.timer.unref?.();
    }
  }

  private source(): TaskSourceConfig | undefined {
    const target = this.config.reports;
    return target ? this.config.taskSources?.find(source => source.id === target.sourceId) : undefined;
  }

  /** The tracker reports go to, as the dialog names it, or null when nothing files them. */
  publicTarget(): string | null {
    const source = this.source();
    if (!source || !this.config.reports) return null;
    return `${source.provider === 'forgejo' ? 'Forgejo' : 'Vikunja'} · ${source.provider === 'vikunja' ? `${source.name} (project ${this.config.reports.project})` : this.config.reports.project}`;
  }

  /** Stores one report and tries to file it at once. A refusal leaves it saved for the retries. */
  async submit(user: User, parsed: ParsedReport): Promise<ReportOutcome> {
    const at = this.now().getTime();
    const recent = (this.recent.get(user.id) ?? []).filter(time => at - time < 3_600_000);
    if (recent.length >= maxReportsPerHour) throw new ReportError(429, 'rate_limited', `You filed ${maxReportsPerHour} reports in the last hour. Try again later.`);
    this.recent.set(user.id, [...recent, at]);
    const now = this.now().toISOString();
    const source = this.source();
    const report: StoredReport = { id: randomUUID(), userId: user.id, status: source ? 'pending' : 'kept', title: parsed.title, body: { happened: parsed.happened, expected: parsed.expected, context: parsed.context }, createdAt: now, attempts: 0 };
    this.store.saveReport(report, parsed.files);
    if (!source) {
      return { id: report.id, status: 'kept', message: this.config.mode === 'demo' ? 'This is the demo: Unfold kept the report and filed nothing.' : 'No tracker is set up for reports. Unfold kept it, and an administrator can name one under reports in the configuration.' };
    }
    return this.attempt(report, source);
  }

  private async attempt(report: StoredReport, source: TaskSourceConfig): Promise<ReportOutcome> {
    const attempts = report.attempts + 1;
    try {
      const issue = await this.file(report, source);
      this.store.updateReport(report.id, { status: 'filed', attempts, url: issue.url, filedAt: this.now().toISOString(), issue, nextAttemptAt: null, lastError: null });
      return { id: report.id, status: 'filed', url: issue.url, message: 'Filed.' };
    } catch (error) {
      const message = error instanceof TaskError || error instanceof Error ? error.message.slice(0, 300) : 'The tracker could not be reached.';
      const age = this.now().getTime() - Date.parse(report.createdAt);
      const gap = Math.min(lastRetryGapMs, firstRetryMs * 2 ** (attempts - 1));
      const giveUp = age + gap > retryWindowMs;
      this.store.updateReport(report.id, { status: giveUp ? 'failed' : 'retrying', attempts, nextAttemptAt: giveUp ? null : new Date(this.now().getTime() + gap).toISOString(), lastError: message });
      console.error(JSON.stringify({ level: 'warn', event: 'report.file_failed', report: report.id, attempts, giveUp, message }));
      return { id: report.id, status: giveUp ? 'failed' : 'retrying', message: 'Saved. Unfold will file it when the tracker answers.' };
    }
  }

  private async file(report: StoredReport, source: TaskSourceConfig): Promise<StoredReportIssue> {
    const project = this.config.reports!.project;
    const files = this.store.reportFiles(report.id);
    const names = files.map(file => file.name);
    const baseUrl = this.config.baseUrl;
    let issue = report.issue;
    if (!issue) {
      const created = await createIssue(source, project, report.title, source.provider === 'forgejo' ? markdownBody(report, this.version, baseUrl, undefined, names) : htmlBody(report, this.version, baseUrl, names));
      issue = { ...created, attached: [] };
      this.store.updateReport(report.id, { status: 'retrying', issue, url: issue.url, nextAttemptAt: report.nextAttemptAt ?? null });
    }
    for (const file of files) {
      if (issue.attached.includes(file.name)) continue;
      const url = await attachToIssue(source, project, issue, { name: file.name, type: file.type, bytes: file.content } satisfies IssueFile);
      issue = { ...issue, attached: [...issue.attached, file.name], ...(file.name === 'screenshot.png' && url ? { screenshotUrl: url } : {}) };
      this.store.updateReport(report.id, { status: 'retrying', issue, nextAttemptAt: report.nextAttemptAt ?? null });
    }
    if (source.provider === 'forgejo' && issue.screenshotUrl) await updateIssueBody(source, project, issue, markdownBody(report, this.version, baseUrl, issue.screenshotUrl, names.filter(name => name !== 'screenshot.png')));
    return issue;
  }

  /** Files every saved report whose next attempt is due, and drops the files of reports filed more than 90 days ago. */
  retryDue(): Promise<void> {
    this.retrying ??= (async () => {
      try {
        if (this.stopped) return;
        const now = this.now();
        this.store.pruneReportFiles(new Date(now.getTime() - fileRetentionMs).toISOString());
        const source = this.source();
        if (!source) return;
        for (const report of this.store.dueReports(now.toISOString())) {
          if (this.stopped) return;
          await this.attempt(report, source);
        }
      } catch (error) {
        if (!this.stopped) console.error(JSON.stringify({ level: 'warn', event: 'report.retry_failed', message: String((error as Error)?.message ?? error).slice(0, 200) }));
      }
    })().finally(() => { this.retrying = undefined; });
    return this.retrying;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
