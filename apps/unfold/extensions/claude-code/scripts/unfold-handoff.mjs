#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { workItemArgument } from './unfold-start.mjs';

const unfoldUrl = (process.env.UNFOLD_URL ?? '').trim().replace(/\/+$/, '');
const token = (process.env.UNFOLD_TOKEN ?? '').trim();

/** What `/unfold:handoff` shows, scans and sends at most. */
export const handoffLimits = { diffBytes: 100_000, scanBytes: 20_000_000, items: 8, item: 300, title: 200, untrackedShown: 20, pendingMs: 15 * 60_000 };

const plain = (text, max) => String(text ?? '').replace(/[\0-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const sessionPattern = /^[A-Za-z0-9_-]{8,128}$/;
const teamPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

/**
 * The findings the session writes, as JSON `{title?, tried, hypotheses, left}`: each a list of at most eight lines of
 * at most 300 characters. Throws a sentence for the person when the shape is wrong or nothing was written.
 */
export function parseFindings(text) {
  let data;
  try { data = JSON.parse(String(text ?? '')); } catch { throw new Error('The findings must be JSON: {"title": "...", "tried": [], "hypotheses": [], "left": []}.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The findings must be one JSON object.');
  const list = name => {
    const entry = data[name] ?? [];
    if (!Array.isArray(entry) || entry.some(item => typeof item !== 'string')) throw new Error(`findings.${name} must be a list of lines.`);
    if (entry.length > handoffLimits.items) throw new Error(`findings.${name} has ${entry.length} lines; keep it to ${handoffLimits.items}.`);
    return entry.map(item => plain(item, handoffLimits.item)).filter(Boolean);
  };
  const findings = { title: plain(data.title, handoffLimits.title), tried: list('tried'), hypotheses: list('hypotheses'), left: list('left') };
  if (!findings.tried.length && !findings.hypotheses.length && !findings.left.length) throw new Error('Write at least one finding: what was tried, a hypothesis, or what is left.');
  return findings;
}

/** At most `limit` bytes of a diff, cut at a line end, and a sentence saying how much was left out. */
export function capDiff(diff, limit = handoffLimits.diffBytes) {
  const buffer = Buffer.from(String(diff ?? ''), 'utf8');
  if (buffer.length <= limit) return { text: buffer.toString('utf8'), bytes: buffer.length, truncated: false, notice: '' };
  let end = buffer.lastIndexOf(0x0a, limit - 1);
  if (end <= 0) end = limit;
  const text = buffer.subarray(0, end).toString('utf8').replace(/�+$/, '');
  return { text, bytes: buffer.length, truncated: true, notice: `[Truncated: shows ${Buffer.byteLength(text)} of ${buffer.length} bytes. The whole change travels as commits on the hand-off branch, not as this text.]` };
}

const secretRules = [
  ['private-key', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['gitlab-token', /\bglpat-[A-Za-z0-9_-]{20,}\b/],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['slack-webhook', /hooks\.slack\.com\/services\/T[A-Za-z0-9_]+\/B[A-Za-z0-9_]+\/[A-Za-z0-9_]+/],
  ['provider-key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['stripe-key', /\b[rs]k_live_[A-Za-z0-9]{20,}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['unfold-credential', /\bvl[em]_[A-Za-z0-9_-]{43}\b/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['password-in-url', /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]{3,}@[^\s/]+/i],
  ['secret-assignment', /\b(?:password|passwd|secret|api[_-]?key|access[_-]?key|client[_-]?secret|auth[_-]?token)\b["']?\s*[:=]\s*["'](?=[^"'\s]*[0-9])(?=[^"'\s]*[A-Za-z])[^"'\s]{16,}["']/i],
];

/** The lines a unified diff adds, with the file each one is in. */
export function addedLines(diff) {
  const lines = [];
  let file = '';
  for (const line of String(diff ?? '').split('\n')) {
    if (line.startsWith('+++ ')) { file = line.slice(4).replace(/^b\//, ''); continue; }
    if (line.startsWith('+')) lines.push({ file, text: line.slice(1) });
  }
  return lines;
}

/** The built-in check: high-confidence secret shapes in added lines. Answers the rule and file of each hit, never the value. */
export function findSecrets(diff) {
  const hits = [];
  for (const { file, text } of addedLines(diff)) {
    const rule = secretRules.find(([, pattern]) => pattern.test(text));
    if (rule) hits.push({ rule: rule[0], file });
  }
  return hits;
}

/**
 * Scans what a hand-off would push. Uses `gitleaks` (or `UNFOLD_GITLEAKS_BIN`), the scanner this repository's
 * guard-secrets hook runs, with the repository's `.gitleaks.toml` when it has one, and adds the built-in check either
 * way. Answers which scanners ran and every hit.
 */
export function scanForSecrets(diff, root, options = {}) {
  const bin = options.gitleaks ?? process.env.UNFOLD_GITLEAKS_BIN ?? 'gitleaks';
  const hits = findSecrets(diff);
  const scanners = ['built-in patterns'];
  const added = addedLines(diff).map(entry => entry.text).join('\n');
  if (bin && added) {
    const config = root && existsSync(join(root, '.gitleaks.toml')) ? ['--config', join(root, '.gitleaks.toml')] : [];
    const scan = spawnSync(bin, ['stdin', '--no-banner', '--redact', '--exit-code', '42', '--log-level', 'error', ...config], { input: added, encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
    if (!scan.error && scan.status === 42) { scanners.unshift('gitleaks'); hits.push({ rule: 'gitleaks', file: '' }); }
    else if (!scan.error && scan.status === 0) scanners.unshift('gitleaks');
  }
  return { scanners, hits };
}

/** The branch a hand-off pushes to: one per snapshot, so pushing it again never moves someone else's work. */
export function handoffBranch(commit) { return `unfold/handoff-${String(commit).slice(0, 12)}`; }

/** The `X-Unfold-Confirmation` a send carries: `<id>:<sha256 of the preview the person confirmed>` (system ADR-0037). */
export function confirmationFor(code, preview) { return `unfold-handoff-${code}:${createHash('sha256').update(preview).digest('hex')}`; }

/** The id of a preview: the first 12 hex characters of the sha256 of its text. */
export function previewCode(preview) { return createHash('sha256').update(preview).digest('hex').slice(0, 12); }

const usd = value => `US$${Number(value).toFixed(2)}`;
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** What the person reads before they confirm: where it goes, what it may spend, what leaves their machine, and the diff. */
export function previewText(plan) {
  const { target, context, findings, diff, untracked, scan } = plan;
  const lines = ['Hand-off preview. Nothing is pushed or sent until you confirm.', ''];
  if (target.kind === 'requeue') {
    lines.push(`To: Team ${target.team || '(unknown)'}. Work Item ${target.workItemId} "${plain(target.title, 120)}" restarts from Round 1.`);
    lines.push(`Spend: its Runs spend from ${target.team ? `Team ${target.team}'s` : 'its Team\'s'} budget${typeof target.budgetUsd === 'number' ? `, up to ${usd(target.budgetUsd)} like the last attempt` : '; Unfold does not know the cap before Ploeg opens the attempt'}.`);
  } else {
    lines.push(`To: Team ${target.team}. A new Work Item "${plain(target.title, 120)}" in ${target.target}, linked to this session.`);
    lines.push(`Spend: starting it spends nothing; its Runs spend from Team ${target.team}'s budget when Ploeg picks it up. Unfold does not know the cap before Ploeg admits it.`);
  }
  if (context.branch) {
    lines.push(`Code: pushed to origin as ${context.branch} (${context.commit.slice(0, 12)}), based on ${context.base} at ${context.baseCommit.slice(0, 12)}: ${plural(context.files, 'file')} changed, +${context.insertions} -${context.deletions}.`);
    const parts = [context.commits ? `${plural(context.commits, 'commit')} of yours not on ${context.base}` : '', context.uncommitted ? 'your uncommitted changes as one commit marked "wip: work in progress handed to Ploeg"' : ''].filter(Boolean);
    if (parts.length) lines.push(`It holds ${parts.join(' and ')}. Your branch, index and working tree stay as they are.`);
  } else lines.push(`Code: nothing to push; ${context.sessionBranch || 'HEAD'} has no changes against ${context.base}.`);
  if (untracked.length) lines.push(`New files included: ${untracked.slice(0, handoffLimits.untrackedShown).join(', ')}${untracked.length > handoffLimits.untrackedShown ? ` and ${untracked.length - handoffLimits.untrackedShown} more` : ''}.`);
  lines.push(`Secret scan: ${scan.scanners.join(' and ')} found nothing in the lines this pushes.`);
  lines.push('Unfold receives the branch name, commit ids, these counts and the findings below, and gives them to Ploeg\'s Runs as untrusted notes. The diff itself travels only as commits on the branch.');
  lines.push('', 'Findings:');
  for (const [label, items] of [['Tried', findings.tried], ['Hypotheses', findings.hypotheses], ['Left to do', findings.left]]) {
    if (!items.length) continue;
    lines.push(`${label}:`, ...items.map(item => `- ${item}`));
  }
  lines.push('', diff.bytes ? `git diff HEAD, with new files (${diff.bytes} bytes):` : 'git diff HEAD: no uncommitted changes.');
  if (diff.bytes) lines.push(diff.text.replace(/\n$/, ''));
  if (diff.truncated) lines.push(diff.notice);
  return lines.join('\n');
}

function git(args, cwd, env) { return execFileSync('git', args, { cwd, env: env ? { ...process.env, ...env } : process.env, encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).replace(/\n$/, ''); }
function gitOk(args, cwd) { try { return git(args, cwd); } catch { return null; } }

/**
 * A commit of HEAD plus every uncommitted change, including new files `.gitignore` does not exclude, built in a
 * temporary index, so the person's index, working tree and branch are untouched. Answers HEAD itself when nothing is
 * uncommitted.
 */
export function snapshot(root, sessionId, commitIt = true) {
  const head = git(['rev-parse', 'HEAD'], root);
  const index = join(tmpdir(), `unfold-handoff-index-${randomBytes(8).toString('hex')}`);
  try {
    const real = git(['rev-parse', '--path-format=absolute', '--git-path', 'index'], root);
    if (existsSync(real)) copyFileSync(real, index); else git(['read-tree', 'HEAD'], root, { GIT_INDEX_FILE: index });
    git(['add', '--all', '--', '.'], root, { GIT_INDEX_FILE: index });
    const tree = git(['write-tree'], root, { GIT_INDEX_FILE: index });
    if (tree === git(['rev-parse', 'HEAD^{tree}'], root)) return { head, tree, commit: head, uncommitted: false };
    if (!commitIt) return { head, tree, commit: '', uncommitted: true };
    const commit = git(['commit-tree', tree, '-p', head, '-m', `wip: work in progress handed to Ploeg\n\nUnfold-Handoff: ${sessionId}`], root);
    return { head, tree, commit, uncommitted: true };
  } finally { rmSync(index, { force: true }); }
}

function pendingDir() {
  const base = process.env.CLAUDE_PLUGIN_DATA || join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'unfold-claude-code');
  const dir = join(base, 'handoffs');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

async function call(path, init = {}) {
  const response = await fetch(`${unfoldUrl}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'x-unfold-request': '1', 'x-unfold-client': 'claude-code-plugin', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) { const error = new Error(data?.error?.message || `Unfold answered ${response.status}.`); error.status = response.status; throw error; }
  return data;
}

function say(text) { process.stdout.write(`${text}\n`); }

function parseArguments(argv) {
  const options = { workItem: '', team: '', target: '', findings: '' };
  for (let index = 0; index < argv.length; index++) {
    const entry = argv[index];
    if (entry === '--team') options.team = argv[++index] ?? '';
    else if (entry === '--target') options.target = argv[++index] ?? '';
    else if (entry === '--findings') options.findings = argv[++index] ?? '';
    else if (!options.workItem) options.workItem = entry;
  }
  return options;
}

async function readFindings(source) {
  if (!source) throw new Error('Pass the findings with --findings <file>, or --findings - and JSON on standard input.');
  if (source !== '-') return readFileSync(source, 'utf8');
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function chooseTarget(sessionId, options, findings) {
  if (options.team) {
    if (!teamPattern.test(options.team)) throw new Error('Name the Team as Unfold lists it.');
    const start = await call(`/api/linked-sessions/${sessionId}/start-options`);
    if (!start.teams?.includes(options.team)) throw new Error(`You cannot start work for Team ${options.team}. Your Teams: ${(start.teams ?? []).join(', ') || 'none'}.`);
    const target = options.target || start.suggested || '';
    const entry = (start.targets ?? []).find(item => item.key === target);
    if (!entry) throw new Error(`Name the repository with --target: ${(start.targets ?? []).map(item => item.key).join(', ') || start.message || 'Ploeg has none ready'}.`);
    if (!findings.title) throw new Error('A new Work Item needs a title: add "title" to the findings.');
    return { kind: 'start', team: options.team, target: entry.key, baseBranch: entry.baseBranch, title: findings.title };
  }
  const readiness = await call(`/api/linked-sessions/${sessionId}/handoff`);
  const items = readiness.workItems ?? [];
  const wanted = options.workItem ? workItemArgument(options.workItem) : '';
  if (options.workItem && !wanted) throw new Error('Name the Work Item: /unfold:handoff 184, or paste its Unfold link.');
  const candidates = wanted ? items.filter(item => item.id === wanted) : items.filter(item => item.available);
  if (wanted && !candidates.length) throw new Error(`This session is not linked to Work Item ${wanted}. Link it first, or start a new Work Item with --team.`);
  if (!candidates.length) throw new Error(`No Work Item this session is linked to can be handed to Ploeg now${items.length ? ` (${items.map(item => `${item.id}: ${item.reason}`).join('; ')})` : ''}. Start a new Work Item instead with --team <team>.`);
  if (candidates.length > 1) throw new Error(`Name the Work Item: ${candidates.map(item => item.id).join(' or ')}.`);
  const item = candidates[0];
  if (!item.available) throw new Error(`Ploeg cannot take Work Item ${item.id} now: ${item.reason}`);
  return { kind: 'requeue', workItemId: item.id, team: item.team, title: item.title, baseBranch: item.baseBranch, budgetUsd: item.budgetUsd };
}

function baseRef(root, baseBranch) {
  const names = [baseBranch, (gitOk(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], root) ?? '').replace(/^origin\//, ''), 'main', 'master'].filter(Boolean);
  for (const name of [...new Set(names)]) {
    if (name === baseBranch) gitOk(['fetch', '--quiet', 'origin', name], root);
    if (gitOk(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${name}^{commit}`], root)) return name;
  }
  return '';
}

async function preview(argv) {
  const options = parseArguments(argv);
  const sessionId = String(process.env.CLAUDE_CODE_SESSION_ID ?? '').trim();
  if (!sessionPattern.test(sessionId)) { say('Run /unfold:handoff inside a Claude Code session; CLAUDE_CODE_SESSION_ID is not set. Nothing was sent.'); return 2; }
  let findings;
  try { findings = parseFindings(await readFindings(options.findings)); } catch (error) { say(`${error.message} Nothing was sent.`); return 2; }
  const root = gitOk(['rev-parse', '--show-toplevel'], process.cwd());
  if (!root) { say('Run /unfold:handoff in a git checkout. Nothing was sent.'); return 1; }
  if (!gitOk(['remote', 'get-url', 'origin'], root)) { say('This checkout has no origin remote to push the hand-off branch to. Nothing was sent.'); return 1; }
  let target;
  try { target = await chooseTarget(sessionId, options, findings); }
  catch (error) { say(`${error.status === 404 ? 'Unfold does not know this session as yours. Check that the plugin reports it (UNFOLD_URL, UNFOLD_TOKEN).' : error.message} Nothing was sent.`); return 1; }
  const base = baseRef(root, target.baseBranch);
  if (!base) { say(`Could not find origin/${target.baseBranch || 'main'} to compare against. Fetch it first. Nothing was sent.`); return 1; }
  const snap = snapshot(root, sessionId);
  const baseCommit = git(['merge-base', `refs/remotes/origin/${base}`, snap.commit], root);
  const changed = baseCommit !== snap.commit;
  const sessionBranch = gitOk(['symbolic-ref', '--short', 'HEAD'], root) ?? '';
  const scanned = changed ? git(['diff', '--no-color', '--no-ext-diff', baseCommit, snap.commit], root) : '';
  if (Buffer.byteLength(scanned) > handoffLimits.scanBytes) { say(`The change against origin/${base} is over ${handoffLimits.scanBytes / 1_000_000} MB, too large to scan for secrets. Nothing was sent.`); return 1; }
  const findingsText = [findings.title, ...findings.tried, ...findings.hypotheses, ...findings.left].map(line => `+${line}`).join('\n');
  const scan = scanForSecrets(`${scanned}\n+++ b/(findings)\n${findingsText}`, root);
  if (scan.hits.length) {
    const where = [...new Set(scan.hits.map(hit => `${hit.rule}${hit.file ? ` in ${hit.file}` : ''}`))].slice(0, 10).join(', ');
    say(`Refused: ${scan.scanners.join(' and ')} found what looks like a secret in what this hand-off would push or send (${where}). Remove it, or move it out of the repository, and run /unfold:handoff again. Nothing was pushed or sent.`);
    return 1;
  }
  const stat = changed ? git(['diff', '--shortstat', baseCommit, snap.commit], root) : '';
  const number = pattern => Number(pattern.exec(stat)?.[1] ?? 0);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'], root).split('\0').filter(Boolean);
  const context = {
    branch: changed ? handoffBranch(snap.commit) : '', commit: changed ? snap.commit : '', base: `origin/${base}`, baseCommit, sessionBranch,
    commits: Number(git(['rev-list', '--count', `${baseCommit}..${snap.head}`], root)), uncommitted: snap.uncommitted,
    files: number(/(\d+) files? changed/), insertions: number(/(\d+) insertions?/), deletions: number(/(\d+) deletions?/), untracked: untracked.length,
    findings: { tried: findings.tried, hypotheses: findings.hypotheses, left: findings.left },
  };
  const diff = capDiff(snap.uncommitted ? git(['diff', '--no-color', '--no-ext-diff', snap.head, snap.commit], root) : '');
  const text = previewText({ target, context, findings, diff, untracked, scan });
  const code = previewCode(text);
  const pending = { version: 1, code, createdAt: Date.now(), sessionId, root, head: snap.head, tree: snap.tree, target, context, confirmation: confirmationFor(code, text) };
  writeFileSync(join(pendingDir(), `${code}.json`), JSON.stringify(pending), { mode: 0o600 });
  say(text);
  say('');
  say(`To send it, the person confirms, then: node "${process.argv[1]}" send ${code}`);
  return 0;
}

/** The request a confirmed hand-off makes: the route, its body and the confirmation header. Never the diff. */
export function sendRequest(pending) {
  const headers = { 'x-unfold-confirmation': pending.confirmation };
  if (pending.target.kind === 'requeue') return { path: `/api/linked-sessions/${pending.sessionId}/work-items/${pending.target.workItemId}/handoff`, body: { commandId: `unfold-handoff-${pending.code}`, context: pending.context }, headers };
  const brief = [`Continue the work handed over from a Claude Code session: ${pending.target.title}.`, ...pending.context.findings.left.map(item => `- ${item}`)].join('\n');
  return { path: `/api/linked-sessions/${pending.sessionId}/work-items`, body: { team: pending.target.team, target: pending.target.target, title: pending.target.title, brief, requestId: `unfold-handoff-${pending.code}`, context: pending.context }, headers };
}

async function confirmOnTerminal(code) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return true;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try { return /^y(es)?$/i.test((await prompt.question(`Send hand-off ${code}? [y/N] `)).trim()); } finally { prompt.close(); }
}

async function send(code) {
  if (!/^[0-9a-f]{12}$/.test(String(code ?? ''))) { say('Name the preview to send: send <code>, as /unfold:handoff printed it. Nothing was sent.'); return 2; }
  const file = join(pendingDir(), `${code}.json`);
  if (!existsSync(file)) { say(`No hand-off preview ${code} waits. Run /unfold:handoff again. Nothing was sent.`); return 1; }
  const pending = JSON.parse(readFileSync(file, 'utf8'));
  if (Date.now() - pending.createdAt > handoffLimits.pendingMs) { rmSync(file, { force: true }); say('That preview is older than 15 minutes. Run /unfold:handoff again. Nothing was sent.'); return 1; }
  const root = gitOk(['rev-parse', '--show-toplevel'], process.cwd());
  if (root !== pending.root) { say(`Send it from ${pending.root}, where the preview was made. Nothing was sent.`); return 1; }
  const now = snapshot(root, pending.sessionId, false);
  if (now.head !== pending.head || now.tree !== pending.tree) { say('The checkout changed since the preview. Run /unfold:handoff again, so the person confirms what is sent. Nothing was sent.'); return 1; }
  if (!(await confirmOnTerminal(code))) { say('Not sent.'); return 1; }
  if (pending.context.branch) {
    try { git(['push', '--quiet', 'origin', `${pending.context.commit}:refs/heads/${pending.context.branch}`], root); }
    catch (error) { say(`Could not push ${pending.context.branch}: ${plain(String(error?.stderr || error?.message), 300)} Nothing was sent to Unfold.`); return 1; }
  }
  const request = sendRequest(pending);
  let result;
  try { result = await call(request.path, { method: 'POST', body: JSON.stringify(request.body), headers: request.headers }); }
  catch (error) { say(`Unfold refused the hand-off: ${error.message}${pending.context.branch ? ` The branch ${pending.context.branch} is pushed; delete it with git push origin --delete ${pending.context.branch} if you do not retry.` : ''}`); return 1; }
  rmSync(file, { force: true });
  const id = pending.target.kind === 'requeue' ? pending.target.workItemId : result.workItem?.id;
  const where = pending.context.branch ? ` from ${pending.context.branch}` : '';
  say(pending.target.kind === 'requeue'
    ? `Handed to Ploeg: Work Item ${id} restarts from Round ${result.requeue?.fromRound ?? 1} for Team ${pending.target.team}${where}, and its Runs read your findings. Unfold: ${unfoldUrl}/#work/${id}`
    : `Handed to Ploeg: Work Item ${id} is queued for Team ${pending.target.team}${where}, with your findings in its brief.${result.linkError ? ` ${plain(result.linkError, 300)}` : ''} Unfold: ${unfoldUrl}/#work/${id}`);
  return 0;
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  if (!unfoldUrl || !token) { say('Set UNFOLD_URL and UNFOLD_TOKEN in ~/.claude/settings.json first; see Settings › Agent sessions in Unfold.'); return 2; }
  if (mode === 'preview') return preview(rest);
  if (mode === 'send') return send(rest[0]);
  say('Use preview [work item] [--team <team> [--target <repository>]] --findings <file or ->, or send <code>.');
  return 2;
}

let invoked = '';
try { invoked = pathToFileURL(realpathSync(process.argv[1] ?? '')).href; } catch { invoked = ''; }
if (invoked === import.meta.url) {
  main().then(code => { process.exitCode = code; }, error => { say(String(error?.message ?? error).slice(0, 500)); process.exitCode = 1; });
}
