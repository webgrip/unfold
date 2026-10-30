import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { AppConfig, ReportTarget, User } from './types.ts';
import type { TaskSourceConfig } from './tasks.ts';
import type { Store, StoredReport, StoredReportFile, StoredReportIssue } from './store.ts';
import { apiRoot, attachToIssue, canUpdateIssueBody, commentOnIssue, createIssue, describeIssueTarget, filesIssues, issueBodyFormat, issueProviderLabels, issueProviderNames, readIssueState, reportTargetProject, TaskError, updateIssueBody, type IssueFile, type IssueState } from './tasks.ts';

export const maxReportBytes = 8 * 1024 * 1024;
export const maxReportFiles = 5;
export const retryWindowMs = 24 * 3_600_000;
export const fileRetentionMs = 90 * 24 * 3_600_000;
const maxScreenshotBytes = 6 * 1024 * 1024;
const maxJsonBytes = 256 * 1024;
const maxConsoleEntries = 50;
const maxRequestEntries = 50;
const retryCheckMs = 60_000;
const firstRetryMs = 60_000;
const lastRetryGapMs = 3_600_000;
export const maxReportsPerHour = 10;
export const maxRepliesPerHour = 20;
const followCheckMs = 10 * 60_000;
const followGapMs = 10 * 60_000;
const followOnReadGapMs = 2 * 60_000;
const followWindowMs = 180 * 24 * 3_600_000;
const followAfterCloseMs = 14 * 24 * 3_600_000;
const maxAcknowledgement = 280;
const reportId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
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
export type ReportContext = { route?: string; screen?: string; workItemId?: number; shiftId?: number; runId?: string; browser?: string; viewport?: string; locale?: string; element?: string; trail?: string[] };
/** What the person reports: something that broke, something confusing, or an idea. */
export type ReportKind = 'broken' | 'confusing' | 'idea';
/** How much a broken thing is in the person's way, when they say. */
export type ReportImpact = 'blocks' | 'slows' | 'minor';
/** A posted report after every field and file was checked and every buffer entry reduced to its allowed fields. */
export type ParsedReport = { title: string; kind: ReportKind; impact?: ReportImpact; happened: string; expected: string; context: ReportContext; files: StoredReportFile[]; duplicateOf?: string };
/** Where a report stands in words a reporter reads, from what Unfold and the tracker know. */
export type ReportStage = 'filing' | 'waiting' | 'not-filed' | 'kept' | 'got-it' | 'looking' | 'needs-info' | 'replied' | 'fix-coming' | 'fix-merged' | 'fixed' | 'shipped' | 'duplicate' | 'not-planned' | 'closed';
/** A report's stage, the words for it, and the moment the team last did something on it. */
export type ReportProgress = { stage: ReportStage; words: string; changedAt?: string };
/** One of the person's own reports, as the dialog lists them: where it stands, the proof and the team's latest comments. */
export type ReportSummary = {
  id: string; title: string; status: StoredReport['status']; url?: string; createdAt: string;
  stage: ReportStage; words: string; unread: boolean; others: number; joined: boolean;
  fix?: { number: string; url: string; merged: boolean }; release?: { tag: string; url: string; live: boolean };
  comments: { author: string; text: string; at: string; mine: boolean }[];
};
/** A filed report that looks like what someone is typing, without any of its text beyond the title. */
export type SimilarReport = { id: string; title: string; words: string; people: number; mine: boolean };

const kindHeadings: Record<ReportKind, string> = { broken: 'What went wrong', confusing: 'What was confusing', idea: 'What would help' };
const impactWords: Record<ReportImpact, string> = { blocks: 'Blocks me', slows: 'Slows me down', minor: 'Small thing' };
/** What the route answers: filed with its address, kept to retry, or kept because nothing can file it. */
export type ReportOutcome = { id: string; status: StoredReport['status']; url?: string; message: string; joined?: boolean; others?: number; acknowledgement?: string };

/**
 * Resolves `reports` from the configuration file. `false` turns filing off. `{ source, project? }` names a task source
 * whose provider files issues and optionally another repository or project. `{ provider, baseUrl, project, tokenEnv }` is a
 * connection of its own, which never appears among the task sources or on the Tasks page. Leaving `reports` out picks
 * the first source with a token, whose provider files issues, that Unfold owns. A source Ploeg dispatches from is never a default,
 * and naming one needs another project, so a report never becomes agent work. A missing token turns filing off with a
 * warning instead of stopping Unfold. Returns null when nothing can file reports.
 */
export function reportSettings(raw: unknown, sources: TaskSourceConfig[] | undefined, mode: AppConfig['mode']): ReportTarget | null {
  if (raw === false || mode === 'demo') return null;
  const fileable = (sources ?? []).filter(source => filesIssues(source.provider) && source.token);
  if (raw === undefined) {
    const own = fileable.find(source => source.executionOwner === 'interactive');
    return own ? { source: own, project: own.project } : null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('reports must be false, { source, project? } or { provider, baseUrl, project, tokenEnv }');
  const value = raw as Record<string, unknown>;
  if ('provider' in value) return ownConnection(value);
  if (Object.keys(value).some(key => !['source', 'project', 'acknowledgement'].includes(key))) throw new Error('reports must be false, { source, project?, acknowledgement? } or { provider, baseUrl, project, tokenEnv, acknowledgement? }');
  const acknowledgement = acknowledgementSetting(value.acknowledgement);
  const source = fileable.find(entry => entry.id === value.source);
  if (!source) throw new Error(`reports.source must name a ${issueProviderLabels()} task source with a token`);
  const project = value.project === undefined ? source.project : value.project;
  if (typeof project !== 'string') throw new Error('reports.project must name the repository or project on the report tracker');
  const target = reportTargetProject(source, project);
  if (source.executionOwner === 'ploeg' && target === source.project) throw new Error(`reports.project must differ from ${source.id}'s project: Ploeg dispatches the tasks there, so a report would become agent work`);
  return { source, project: target, ...(acknowledgement ? { acknowledgement } : {}) };
}

function acknowledgementSetting(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > maxAcknowledgement || /[\u0000-\u001f]/.test(value)) throw new Error(`reports.acknowledgement must be one line of at most ${maxAcknowledgement} characters`);
  return value.trim();
}

function ownConnection(value: Record<string, unknown>): ReportTarget | null {
  if (Object.keys(value).some(key => !['provider', 'baseUrl', 'project', 'tokenEnv', 'acknowledgement'].includes(key))) throw new Error('reports with its own connection takes provider, baseUrl, project, tokenEnv and acknowledgement only');
  const acknowledgement = acknowledgementSetting(value.acknowledgement);
  if (typeof value.provider !== 'string' || !filesIssues(value.provider)) throw new Error(`reports.provider must be ${issueProviderNames()}`);
  if (typeof value.tokenEnv !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/.test(value.tokenEnv)) throw new Error('reports.tokenEnv must name an environment variable');
  if (typeof value.project !== 'string') throw new Error('reports.project must name the repository or project on the report tracker');
  const provider = value.provider;
  const base: TaskSourceConfig = { id: 'reports', name: 'Report a problem', provider, baseUrl: apiRoot(value.baseUrl, provider), project: '', repositoryId: '', executionOwner: 'interactive' };
  const project = reportTargetProject(base, value.project);
  const token = process.env[value.tokenEnv];
  if (!token) {
    console.error(JSON.stringify({ level: 'warn', event: 'reports.token_missing', message: `reports.tokenEnv names ${value.tokenEnv}, which is not set; Unfold keeps reports and files none` }));
    return null;
  }
  return { source: { ...base, project, token }, project, ...(acknowledgement ? { acknowledgement } : {}) };
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

function trail(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const routes = value.slice(-8).flatMap(entry => { const route = short(entry, 120); return route?.startsWith('#') ? [route.split('?')[0]] : []; });
  return routes.length ? routes : undefined;
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
    ...(short(value.element, 240) ? { element: short(value.element, 240) } : {}),
    ...(trail(value.trail) ? { trail: trail(value.trail) } : {}),
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
  const kind = form.get('kind') ?? 'broken';
  if (kind !== 'broken' && kind !== 'confusing' && kind !== 'idea') throw new ReportError(422, 'report_kind_invalid', 'A report is broken, confusing or idea.');
  const impact = form.get('impact');
  if (impact !== null && (kind !== 'broken' || !(String(impact) in impactWords))) throw new ReportError(422, 'report_impact_invalid', 'Only something broken has an impact: blocks, slows or minor.');
  const duplicateOf = form.get('duplicateOf');
  if (duplicateOf !== null && (typeof duplicateOf !== 'string' || !reportId.test(duplicateOf))) throw new ReportError(422, 'report_duplicate_invalid', 'duplicateOf names a filed report by its id.');
  return { title, kind, ...(impact !== null ? { impact: impact as ReportImpact } : {}), happened, expected: kind === 'broken' ? text(form.get('expected'), 'expected', 4000) : '', context: context(form.get('context')), files, ...(duplicateOf ? { duplicateOf } : {}) };
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
  const impact = report.body.impact as ReportImpact | undefined;
  return [
    ...(impact && impactWords[impact] ? [['Impact', impactWords[impact]] as [string, string]] : []),
    ...(context.route ? [['Page', context.route, link(context.route)] as [string, string, string?]] : []),
    ...(context.element ? [['Pointed at', context.element] as [string, string]] : []),
    ...(context.workItemId !== undefined ? [['Work Item', String(context.workItemId), link(`#work/${context.workItemId}`)] as [string, string, string?]] : []),
    ...(context.shiftId !== undefined ? [['Shift', String(context.shiftId)] as [string, string]] : []),
    ...(context.runId ? [['Run', context.runId] as [string, string]] : []),
    ['Unfold', version],
    ...(context.browser ? [['Browser', context.browser] as [string, string]] : []),
    ...(context.viewport ? [['Viewport', context.viewport] as [string, string]] : []),
    ...(context.locale ? [['Locale', context.locale] as [string, string]] : []),
    ...(context.trail?.length ? [['Pages before', context.trail.join(' → ')] as [string, string]] : []),
  ];
}

function heading(report: StoredReport): string {
  return kindHeadings[report.body.kind as ReportKind] ?? kindHeadings.broken;
}

/** The Markdown body of a filed issue: what happened, what was expected, the page facts and, once uploaded, the screenshot. */
export function markdownBody(report: StoredReport, version: string, baseUrl?: string, screenshotUrl?: string, attachments: string[] = []): string {
  const happened = String(report.body.happened ?? '');
  const expected = String(report.body.expected ?? '');
  const rows = facts(report, version, baseUrl).map(([name, value, href]) => `| ${name} | ${href ? `[${markdownText(value)}](${href})` : markdownText(value)} |`);
  return [
    `## ${heading(report)}`, '', markdownText(happened), '',
    ...(expected ? ['## What I expected', '', markdownText(expected), ''] : []),
    '| | |', '| --- | --- |', ...rows, '',
    ...(screenshotUrl ? [`![Screenshot](${screenshotUrl})`, ''] : []),
    ...(attachments.length ? [`Attached: ${attachments.join(', ')}.`, ''] : []),
    '_Filed with Report a problem in Unfold._', '',
  ].join('\n');
}

/** The HTML description of a filed task with the same sections, for trackers that render HTML; the screenshot travels as an attachment. */
export function htmlBody(report: StoredReport, version: string, baseUrl?: string, attachments: string[] = []): string {
  const paragraphs = (value: string) => value.split(/\n{2,}/).map(part => `<p>${htmlText(part).replace(/\n/g, '<br>')}</p>`).join('');
  const expected = String(report.body.expected ?? '');
  const rows = facts(report, version, baseUrl).map(([name, value, href]) => `<tr><th>${htmlText(name)}</th><td>${href ? `<a href="${htmlText(href)}">${htmlText(value)}</a>` : htmlText(value)}</td></tr>`).join('');
  return `<h2>${heading(report)}</h2>${paragraphs(String(report.body.happened ?? ''))}${expected ? `<h2>What I expected</h2>${paragraphs(expected)}` : ''}<table>${rows}</table>${attachments.length ? `<p>Attached: ${htmlText(attachments.join(', '))}.</p>` : ''}<p><em>Filed with Report a problem in Unfold.</em></p>`;
}

const needsInfoLabel = /needs?[\s_-]*(more[\s_-]*)?info|question|waiting[\s_-]*(for|on)[\s_-]*(reporter|author)/i;
const duplicateLabel = /duplicate/i;
const notPlannedLabel = /won'?t[\s_-]*fix|not[\s_-]*planned|invalid/i;
const stopWords = new Set('the and for not but was are with this that when what have has had from into then than there they its only just still does did nothing would could should page idea confusing'.split(' '));

function releaseName(tag: string): string {
  return /(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag)?.[1] ?? tag;
}

/**
 * Where a report stands in a reporter's words. Before it is filed that is the filing status. After, it follows the
 * tracker: a merged pull request on a closed issue is Fixed, and Fixed in a version once a release of the running
 * line carries it; a label that asks for information is Needs more info; a team comment, an assignee or an open pull
 * request is someone looking into it; nothing yet is Got it. Closing without a fix says why when a label does.
 * `changedAt` is the team's latest act, which decides whether the reporter has something new to see.
 */
export function reportProgress(report: StoredReport, state?: IssueState): ReportProgress {
  if (report.status === 'pending') return { stage: 'filing', words: 'Filing' };
  if (report.status === 'retrying') return { stage: 'waiting', words: 'Waiting for the tracker' };
  if (report.status === 'failed') return { stage: 'not-filed', words: 'Not filed' };
  if (report.status === 'kept') return { stage: 'kept', words: 'Kept in Unfold' };
  if (!state) return { stage: 'got-it', words: 'Got it' };
  const team = state.comments.filter(comment => !comment.mine);
  const changedAt = [team.at(-1)?.at, state.closedAt, state.fix?.mergedAt, state.release?.live ? state.release.at : undefined].filter((value): value is string => Boolean(value)).sort().at(-1);
  const progress = (stage: ReportStage, words: string): ReportProgress => ({ stage, words, ...(changedAt ? { changedAt } : {}) });
  const labels = state.labels.join(' ');
  if (!state.open) {
    if (state.fix?.merged) return state.release?.live ? progress('shipped', `Fixed in ${releaseName(state.release.tag)}`) : progress('fixed', 'Fixed');
    if (duplicateLabel.test(labels)) return progress('duplicate', 'Closed as a duplicate');
    if (notPlannedLabel.test(labels)) return progress('not-planned', 'Closed: not planned');
    return progress('closed', 'Closed');
  }
  if (needsInfoLabel.test(labels)) return progress('needs-info', 'Needs more info');
  if (state.fix?.merged) return progress('fix-merged', 'Fix merged');
  if (state.fix) return progress('fix-coming', 'Fix in progress');
  if (state.comments.at(-1) && !state.comments.at(-1)!.mine) return progress('replied', 'The team replied');
  if (team.length || state.assigned) return progress('looking', 'Looking into it');
  return progress('got-it', 'Got it');
}

function terms(value: string): Set<string> {
  return new Set(value.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(word => word.length >= 3 && !stopWords.has(word)));
}

function likeness(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.sqrt(a.size * b.size);
}

/** The Markdown comment that adds a repeat report to the issue it repeats. */
export function joinedMarkdown(report: StoredReport, version: string, baseUrl?: string, screenshotUrl?: string, attachments: string[] = []): string {
  return `**Someone else hit this too.**\n\n${markdownBody(report, version, baseUrl, screenshotUrl, attachments)}`;
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
  private replies = new Map<string, number[]>();
  private following: Promise<void> | undefined;
  private followTimer: ReturnType<typeof setInterval> | undefined;

  constructor(store: Store, config: AppConfig, version: string, now: () => Date = () => new Date(), options: { schedule?: boolean } = {}) {
    this.store = store;
    this.config = config;
    this.version = version;
    this.now = now;
    if (options.schedule !== false) {
      this.timer = setInterval(() => { void this.retryDue(); }, retryCheckMs);
      this.timer.unref?.();
      this.followTimer = setInterval(() => { void this.followDue(); }, followCheckMs);
      this.followTimer.unref?.();
    }
  }

  /** The line the success screen shows after filing, when the configuration sets one. */
  acknowledgement(): string | undefined {
    return this.config.reports?.acknowledgement;
  }

  private source(): TaskSourceConfig | undefined {
    return this.config.reports?.source;
  }

  /** The tracker reports go to, as the dialog names it, or null when nothing files them. */
  publicTarget(): string | null {
    const source = this.source();
    if (!source || !this.config.reports) return null;
    return describeIssueTarget(source, this.config.reports.project);
  }

  /** The person's own latest reports, newest first: where each went, where it stands and whether the team did something they have not seen. */
  mine(user: User, limit = 5): ReportSummary[] {
    return this.store.userReports(user.id, limit).map(report => this.summary(report));
  }

  private summary(report: StoredReport): ReportSummary {
    const follow = report.status === 'filed' ? this.store.reportFollow(report.id) : undefined;
    const state = follow?.state;
    const progress = reportProgress(report, state);
    const seen = follow?.seenAt ?? report.filedAt ?? report.createdAt;
    const filed = report.status === 'filed' && report.url;
    return {
      id: report.id, title: report.title, status: report.status, ...(filed ? { url: report.url } : {}), createdAt: report.createdAt,
      stage: progress.stage, words: progress.words, unread: Boolean(progress.changedAt && progress.changedAt > seen),
      others: filed ? Math.max(0, this.store.reportsOnIssue(report.url!) - 1) : 0, joined: Boolean(report.issue?.joined),
      ...(state?.fix ? { fix: { number: state.fix.number, url: state.fix.url, merged: state.fix.merged } } : {}),
      ...(state?.release ? { release: { tag: releaseName(state.release.tag), url: state.release.url, live: state.release.live } } : {}),
      comments: (state?.comments ?? []).filter(comment => !(comment.mine && /^\**Someone else hit this too/.test(comment.text))).slice(-3).map(({ author, text, at, mine }) => ({ author, text, at, mine })),
    };
  }

  /** Marks the person's filed reports as seen, so nothing the team did so far counts as new. */
  seen(user: User): void {
    const now = this.now().toISOString();
    for (const report of this.store.userReports(user.id, 50)) {
      if (report.status !== 'filed') continue;
      const changedAt = reportProgress(report, this.store.reportFollow(report.id)?.state).changedAt;
      this.store.markReportSeen(report.id, changedAt && changedAt > now ? changedAt : now);
    }
  }

  /**
   * Up to three filed reports from the last 180 days that look like `text`: shared words in their titles and what
   * happened, with a push for the same page. Closed issues are left out, so nobody joins a report that is done.
   */
  similar(user: User, text: string, route?: string): SimilarReport[] {
    const wanted = terms(text);
    if (wanted.size < 2) return [];
    const since = new Date(this.now().getTime() - followWindowMs).toISOString();
    const byIssue = new Map<string, { report: StoredReport; score: number }>();
    for (const report of this.store.filedReports(since, 500)) {
      if (report.issue?.joined || !report.url) continue;
      const state = this.store.reportFollow(report.id)?.state;
      if (state && !state.open) continue;
      const context = report.body.context as ReportContext;
      const score = likeness(wanted, terms(`${report.title} ${String(report.body.happened ?? '')}`)) + (route && context.route === route.split('?')[0] ? 0.15 : 0);
      if (score < 0.3) continue;
      const known = byIssue.get(report.url);
      if (!known || known.score < score) byIssue.set(report.url, { report, score });
    }
    return [...byIssue.values()].sort((a, b) => b.score - a.score).slice(0, 3).map(({ report }) => ({
      id: report.id, title: report.title, words: reportProgress(report, this.store.reportFollow(report.id)?.state).words, people: this.store.reportsOnIssue(report.url!), mine: report.userId === user.id,
    }));
  }

  /**
   * Posts what the reporter adds to their own filed report as a comment on its issue, under their name, and reads
   * the issue again so the answer shows the comment.
   */
  async reply(user: User, id: string, raw: unknown): Promise<ReportSummary> {
    const report = reportId.test(id) ? this.store.report(id) : undefined;
    if (!report || report.userId !== user.id) throw new ReportError(404, 'report_unknown', 'This report is unknown.');
    const source = this.source();
    if (report.status !== 'filed' || !report.issue || !source) throw new ReportError(409, 'report_not_filed', 'Unfold can add to a report once it is filed.');
    const value = typeof raw === 'string' ? raw.replace(/\r\n?/g, '\n').trim() : '';
    if (!value) throw new ReportError(422, 'report_field_missing', 'Say what you want to add.');
    if (value.length > 4000) throw new ReportError(422, 'report_field_too_long', 'A reply is at most 4000 characters.');
    const at = this.now().getTime();
    const recent = (this.replies.get(user.id) ?? []).filter(time => at - time < 3_600_000);
    if (recent.length >= maxRepliesPerHour) throw new ReportError(429, 'rate_limited', `You added ${maxRepliesPerHour} replies in the last hour. Try again later.`);
    this.replies.set(user.id, [...recent, at]);
    const body = issueBodyFormat(source) === 'markdown'
      ? `**${markdownText(user.name)}** adds, from Unfold:\n\n${markdownText(value)}\n`
      : `<p><strong>${htmlText(user.name)}</strong> adds, from Unfold:</p>${value.split(/\n{2,}/).map(part => `<p>${htmlText(part).replace(/\n/g, '<br>')}</p>`).join('')}`;
    await commentOnIssue(source, this.config.reports!.project, report.issue, body);
    await this.follow(report, source);
    return this.summary(this.store.report(id)!);
  }

  /** Reads the tracker again for the person's own filed reports that Unfold last asked about over two minutes ago. */
  refresh(user: User): Promise<void> {
    const source = this.source();
    if (!source) return Promise.resolve();
    const cutoff = this.now().getTime() - followOnReadGapMs;
    const stale = this.store.userReports(user.id, 5).filter(report => report.status === 'filed' && Date.parse(this.store.reportFollow(report.id)?.checkedAt ?? '1970-01-01') < cutoff);
    return Promise.all(stale.map(report => this.follow(report, source))).then(() => undefined);
  }

  private async follow(report: StoredReport, source: TaskSourceConfig): Promise<void> {
    if (!report.issue) return;
    const checkedAt = this.now().toISOString();
    try {
      this.store.saveReportFollow(report.id, await readIssueState(source, this.config.reports!.project, report.issue, this.version), checkedAt);
    } catch (error) {
      this.store.saveReportFollow(report.id, undefined, checkedAt);
      console.error(JSON.stringify({ level: 'warn', event: 'report.follow_failed', report: report.id, message: String((error as Error)?.message ?? error).slice(0, 200) }));
    }
  }

  /** Reads the tracker for up to 20 filed reports not asked about for ten minutes, leaving out issues closed for two weeks. */
  followDue(): Promise<void> {
    this.following ??= (async () => {
      const source = this.source();
      if (!source || this.stopped) return;
      const now = this.now().getTime();
      const due = this.store.followDue(new Date(now - followWindowMs).toISOString(), new Date(now - followGapMs).toISOString(), new Date(now - followAfterCloseMs).toISOString(), 20);
      for (const report of due) {
        if (this.stopped) return;
        await this.follow(report, source);
      }
    })().finally(() => { this.following = undefined; });
    return this.following;
  }

  /** Stores one report and tries to file it at once. A refusal leaves it saved for the retries. */
  async submit(user: User, parsed: ParsedReport): Promise<ReportOutcome> {
    const at = this.now().getTime();
    const recent = (this.recent.get(user.id) ?? []).filter(time => at - time < 3_600_000);
    if (recent.length >= maxReportsPerHour) throw new ReportError(429, 'rate_limited', `You filed ${maxReportsPerHour} reports in the last hour. Try again later.`);
    this.recent.set(user.id, [...recent, at]);
    const now = this.now().toISOString();
    const source = this.source();
    const report: StoredReport = { id: randomUUID(), userId: user.id, status: source ? 'pending' : 'kept', title: parsed.title, body: { kind: parsed.kind, ...(parsed.impact ? { impact: parsed.impact } : {}), happened: parsed.happened, expected: parsed.expected, context: parsed.context, ...(parsed.duplicateOf ? { duplicateOf: parsed.duplicateOf } : {}) }, createdAt: now, attempts: 0 };
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
      return { id: report.id, status: 'filed', url: issue.url, message: issue.joined ? 'Added to the existing report.' : 'Filed.', ...(issue.joined ? { joined: true, others: Math.max(0, this.store.reportsOnIssue(issue.url) - 1) } : {}), ...(this.acknowledgement() ? { acknowledgement: this.acknowledgement() } : {}) };
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
    const repeated = !issue && typeof report.body.duplicateOf === 'string' ? this.store.report(report.body.duplicateOf) : undefined;
    if (!issue && repeated?.status === 'filed' && repeated.issue && this.store.reportFollow(repeated.id)?.state?.open !== false) {
      issue = { id: repeated.issue.id, number: repeated.issue.number, url: repeated.issue.url, attached: [], joined: true };
      this.store.updateReport(report.id, { status: 'retrying', issue, url: issue.url, nextAttemptAt: report.nextAttemptAt ?? null });
    }
    if (!issue) {
      const created = await createIssue(source, project, report.title, issueBodyFormat(source) === 'markdown' ? markdownBody(report, this.version, baseUrl, undefined, names) : htmlBody(report, this.version, baseUrl, names));
      issue = { ...created, attached: [] };
      this.store.updateReport(report.id, { status: 'retrying', issue, url: issue.url, nextAttemptAt: report.nextAttemptAt ?? null });
    }
    for (const file of files) {
      if (issue.attached.includes(file.name)) continue;
      const url = await attachToIssue(source, project, issue, { name: file.name, type: file.type, bytes: file.content } satisfies IssueFile);
      issue = { ...issue, attached: [...issue.attached, file.name], ...(file.name === 'screenshot.png' && url ? { screenshotUrl: url } : {}) };
      this.store.updateReport(report.id, { status: 'retrying', issue, nextAttemptAt: report.nextAttemptAt ?? null });
    }
    if (issue.joined) {
      if (!issue.commented) {
        await commentOnIssue(source, project, issue, issueBodyFormat(source) === 'markdown' ? joinedMarkdown(report, this.version, baseUrl, issue.screenshotUrl, names.filter(name => name !== 'screenshot.png' || !issue!.screenshotUrl)) : `<p><strong>Someone else hit this too.</strong></p>${htmlBody(report, this.version, baseUrl, names)}`);
        issue = { ...issue, commented: true };
      }
      return issue;
    }
    if (canUpdateIssueBody(source) && issue.screenshotUrl) await updateIssueBody(source, project, issue, markdownBody(report, this.version, baseUrl, issue.screenshotUrl, names.filter(name => name !== 'screenshot.png')));
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
    if (this.followTimer) clearInterval(this.followTimer);
    this.timer = undefined;
    this.followTimer = undefined;
  }
}
