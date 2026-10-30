import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type * as VSCode from 'vscode';

type Env = Record<string, string | undefined>;

/** The first Claude Code release whose terminal CLI follows MCP tasks (public beta). */
export const minimumTasksVersion = '2.1.304';

/** The MCP protocol revision a server must negotiate before Claude Code turns a tool call into a task. */
export const tasksProtocol = '2026-07-28';

export const installGuideUrl = 'https://code.claude.com/docs/en/setup';
export const tasksGuideUrl = 'https://code.claude.com/docs/en/mcp#mcp-tasks-that-run-on-the-server';
export const followGuideUrl = 'https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/how-to/follow-hand-offs-as-tasks-in-a-terminal.md';

/** The outcome of running one command: its exit code and output, or `missing` when the executable was not found. */
export type CommandResult = { missing: true } | { missing?: false; code: number; stdout: string; stderr: string };

/** One server line of `claude mcp list`, such as `plugin:unfold-mcp:unfold: https://… (HTTP) - ✔ Connected`. */
export type ListedServer = { name: string; target: string; transport: 'http' | 'sse' | 'stdio'; status: 'connected' | 'needs-sign-in' | 'failed' | 'pending' | 'other'; detail: string };

/** What the doctor found, in the order a person fixes it. */
export type ClaudeDoctorReport = {
  claude: { state: 'missing' } | { state: 'unreadable'; output: string } | { state: 'outdated' | 'ok'; version: string };
  server: ListedServer | undefined;
  serverChecked: boolean;
  protocol: { modern: boolean; reason: string };
  tasks: { available: boolean; reasons: string[] };
};

/** The `x.y.z` version that `claude --version` prints, such as `2.1.310 (Claude Code)`, or undefined. */
export function parseClaudeVersion(output: string): string | undefined {
  return /(?:^|\s)v?(\d+\.\d+\.\d+)(?=[\s(+-]|$)/.exec(output.trim())?.[1];
}

/** Compares two `x.y.z` versions numerically: negative when `a` is older, zero when equal, positive when newer. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

/** Whether a Claude Code version follows MCP tasks in its terminal CLI. */
export function supportsTasks(version: string): boolean {
  return compareVersions(version, minimumTasksVersion) >= 0;
}

/** Parses `claude mcp list`. Lines that are not a server, such as headings and diagnostics, are skipped. */
export function parseMcpList(output: string): ListedServer[] {
  const servers: ListedServer[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^(\S+): (.+) - (\S.*)$/.exec(line.trim());
    if (!match) continue;
    const [, name, rawTarget, detail] = match;
    const transportMatch = /\s\((HTTP|SSE)\)$/i.exec(rawTarget);
    const target = transportMatch ? rawTarget.slice(0, transportMatch.index) : rawTarget;
    const transport = transportMatch ? (transportMatch[1].toLowerCase() as 'http' | 'sse') : 'stdio';
    const status = /^✔|connected$/i.test(detail) && !/failed|not connected/i.test(detail) ? 'connected'
      : /auth/i.test(detail) ? 'needs-sign-in'
      : /failed|✘/i.test(detail) ? 'failed'
      : /pending/i.test(detail) ? 'pending'
      : 'other';
    servers.push({ name, target, transport, status, detail });
  }
  return servers;
}

/**
 * The server that serves Unfold's own MCP tools: one named `unfold` (at any scope or from any plugin, such as
 * `plugin:unfold-mcp:unfold`), else one whose address is on the workbench's host. Never the plugin's channel server.
 */
export function unfoldServer(servers: ListedServer[], origin?: string): ListedServer | undefined {
  const candidates = servers.filter(server => !/unfold-channel$/.test(server.name));
  const named = candidates.find(server => server.name === 'unfold' || server.name.endsWith(':unfold'));
  if (named) return named;
  let host: string | undefined;
  try { host = origin ? new URL(origin).host : undefined; } catch { host = undefined; }
  if (!host) return undefined;
  return candidates.find(server => {
    try { return server.transport !== 'stdio' && new URL(server.target).host === host; } catch { return false; }
  });
}

const truthy = (value: string | undefined) => value !== undefined && /^(1|true|yes|on)$/i.test(value.trim());
const present = (value: string | undefined) => value !== undefined && value !== '';

/**
 * Whether Claude Code would negotiate 2026-07-28 and turn tool calls into tasks, from the environment the terminal
 * inherits merged with the `env` block of `~/.claude/settings.json` (which wins, as Claude Code applies it on start).
 */
export function protocolAndTasks(processEnv: Env, settingsEnv: Env = {}): Pick<ClaudeDoctorReport, 'protocol' | 'tasks'> {
  const env: Env = { ...processEnv, ...settingsEnv };
  const legacy = env.MCP_PROTOCOL_NEGOTIATION?.trim().toLowerCase() === 'legacy' ? 'MCP_PROTOCOL_NEGOTIATION=legacy'
    : env.MCP_SDK_GENERATION?.trim().toLowerCase() === 'v1' ? 'MCP_SDK_GENERATION=v1'
    : undefined;
  const protocol = legacy
    ? { modern: false, reason: `${legacy} keeps every server on the 2025 handshake, so no tool call becomes a task.` }
    : { modern: true, reason: `Claude Code asks HTTP and stdio servers for ${tasksProtocol} first, and unfold-mcp answers it.` };
  const reasons: string[] = [];
  if (legacy) reasons.push(`${legacy} is set`);
  for (const name of ['DISABLE_TELEMETRY', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'] as const) if (present(env[name])) reasons.push(`${name} turns off feature-flag fetching`);
  for (const name of ['DISABLE_GROWTHBOOK', 'DO_NOT_TRACK'] as const) if (truthy(env[name])) reasons.push(`${name} turns off feature-flag fetching`);
  if (!present(env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST)) {
    for (const [name, provider] of [['CLAUDE_CODE_USE_BEDROCK', 'Amazon Bedrock'], ['CLAUDE_CODE_USE_MANTLE', 'Amazon Bedrock'], ['CLAUDE_CODE_USE_ANTHROPIC_AWS', 'Claude Platform on AWS'], ['CLAUDE_CODE_USE_VERTEX', 'Google Cloud'], ['CLAUDE_CODE_USE_FOUNDRY', 'Microsoft Foundry']] as const) {
      if (truthy(env[name])) reasons.push(`${name} runs Claude Code on ${provider}, which fetches no feature flags`);
    }
  }
  return { protocol, tasks: { available: reasons.length === 0, reasons } };
}

/** Builds the doctor's report from what `claude --version` and `claude mcp list` printed and the environment. */
export function diagnose(input: { version: CommandResult; mcpList?: CommandResult; origin?: string; processEnv: Env; settingsEnv?: Env }): ClaudeDoctorReport {
  const { protocol, tasks } = protocolAndTasks(input.processEnv, input.settingsEnv);
  const version = input.version;
  const claude: ClaudeDoctorReport['claude'] = version.missing ? { state: 'missing' }
    : (() => {
      const parsed = parseClaudeVersion(`${version.stdout}\n${version.stderr}`);
      if (version.code !== 0 || !parsed) return { state: 'unreadable' as const, output: `${version.stdout}${version.stderr}`.trim().slice(0, 200) };
      return { state: supportsTasks(parsed) ? 'ok' as const : 'outdated' as const, version: parsed };
    })();
  const listed = input.mcpList && !input.mcpList.missing && input.mcpList.code === 0 ? input.mcpList.stdout : undefined;
  const server = listed === undefined ? undefined : unfoldServer(parseMcpList(listed), input.origin);
  const reasons = server?.transport === 'stdio' ? [...tasks.reasons, 'unfold-mcp over stdio never answers with a task; connect it over HTTPS'] : tasks.reasons;
  return { claude, server, serverChecked: listed !== undefined, protocol, tasks: { available: reasons.length === 0, reasons } };
}

/** The command that adds unfold-mcp to Claude Code at user scope with the browser sign-in, for a workbench origin. */
export function addServerCommand(origin: string): string {
  return `claude mcp add --scope user --transport http --client-id unfold-mcp unfold ${new URL('/mcp', origin).href}`;
}

/** The report as plain lines, one per check, each saying what to do when it fails. */
export function reportLines(report: ClaudeDoctorReport, origin?: string): string[] {
  const lines: string[] = [];
  const claude = report.claude;
  if (claude.state === 'missing') lines.push(`✘ Claude Code: not found on PATH. Install it: ${installGuideUrl}`);
  else if (claude.state === 'unreadable') lines.push(`✘ Claude Code: "claude --version" printed no version (${claude.output || 'no output'}).`);
  else if (claude.state === 'outdated') lines.push(`✘ Claude Code ${claude.version}: MCP tasks need ${minimumTasksVersion} or later. Run "claude update".`);
  else lines.push(`✔ Claude Code ${claude.version}: follows MCP tasks in the terminal (${minimumTasksVersion} or later).`);
  if (!report.serverChecked) lines.push('? unfold-mcp: not checked, because "claude mcp list" did not run.');
  else if (!report.server) lines.push(`✘ unfold-mcp: not configured for the Claude Code CLI. Install the unfold-mcp plugin from your installation's marketplace, or run: ${origin ? addServerCommand(origin) : 'claude mcp add --scope user --transport http --client-id unfold-mcp unfold https://<your Unfold>/mcp'}`);
  else {
    const server = report.server;
    const where = `${server.name} (${server.transport === 'stdio' ? 'stdio' : server.transport.toUpperCase()})`;
    if (server.status === 'connected') lines.push(`✔ unfold-mcp: ${where} is connected.`);
    else if (server.status === 'needs-sign-in') lines.push(`! unfold-mcp: ${where} needs you to sign in. In claude, run /mcp, choose it and Authenticate.`);
    else lines.push(`! unfold-mcp: ${where} is configured but ${server.detail.replace(/^[^\p{L}]+/u, '').toLowerCase()}.`);
    if (server.transport === 'stdio') lines.push(`  It runs over stdio with a token in its environment and never answers with a task. Connect over HTTPS instead: ${origin ? addServerCommand(origin) : 'claude mcp add --scope user --transport http --client-id unfold-mcp unfold https://<your Unfold>/mcp'}`);
  }
  lines.push(`${report.protocol.modern ? '✔' : '✘'} Protocol ${tasksProtocol}: ${report.protocol.reason}`);
  if (report.tasks.available) lines.push('✔ MCP tasks: nothing in this environment turns them off.');
  else lines.push(`✘ MCP tasks: off, because ${report.tasks.reasons.join('; ')}.`);
  lines.push('? The mcp.tasks flag in Unfold: not checked here. It must be on for you.');
  return lines;
}

/** What the command needs from the editor and the machine, so it runs without VS Code in tests. */
export type TerminalHost = {
  run(file: string, args: string[], options: { cwd?: string; timeoutMs: number }): Promise<CommandResult>;
  home: string;
  processEnv: Env;
  settingsEnv(): Promise<Env>;
  origin(): string | undefined;
  cwd(): string | undefined;
  progress<T>(title: string, task: () => Promise<T>): Promise<T>;
  openTerminal(command: string, cwd?: string): void;
  inform(message: string, ...actions: string[]): Promise<string | undefined>;
  warn(message: string, ...actions: string[]): Promise<string | undefined>;
  fail(message: string, ...actions: string[]): Promise<string | undefined>;
  openExternal(url: string): Promise<unknown>;
  copy(text: string): Promise<unknown>;
  log(lines: string[]): void;
};

/** The id of the command, without the `unfold.` prefix the extension's `register` adds. */
export const followHandOffsCommand = 'followHandOffsInTerminal';

const shellQuote = (value: string) => /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", `'"'"'`)}'`;

/**
 * Checks the Claude Code CLI, then opens an integrated terminal in the workspace running `claude`, where hand-offs to
 * Unfold show as MCP tasks under `/tasks`. Stops before opening it when claude is missing or older than tasks need.
 */
export async function followHandOffsInTerminal(host: TerminalHost): Promise<ClaudeDoctorReport> {
  const cwd = host.cwd();
  const origin = host.origin();
  const { claude, version, mcpList } = await host.progress('Checking Claude Code…', async () => {
    let claude = 'claude';
    let version = await host.run(claude, ['--version'], { cwd, timeoutMs: 15_000 });
    if (version.missing) {
      const local = join(host.home, '.local', 'bin', 'claude');
      const fallback = await host.run(local, ['--version'], { cwd, timeoutMs: 15_000 });
      if (!fallback.missing) { claude = local; version = fallback; }
    }
    const found = version.missing || version.code !== 0 ? undefined : parseClaudeVersion(`${version.stdout}\n${version.stderr}`);
    const usable = found !== undefined && supportsTasks(found);
    const mcpList = usable ? await host.run(claude, ['mcp', 'list'], { cwd, timeoutMs: 60_000 }) : undefined;
    return { claude, version, mcpList };
  });
  const report = diagnose({ version, mcpList, origin, processEnv: host.processEnv, settingsEnv: await host.settingsEnv() });
  host.log(reportLines(report, origin));
  if (report.claude.state === 'missing') {
    const choice = await host.fail('Claude Code is not installed, or "claude" is not on your PATH. Install it, then run this command again.', 'Open Install Guide');
    if (choice === 'Open Install Guide') await host.openExternal(installGuideUrl);
    return report;
  }
  if (report.claude.state !== 'ok') {
    const found = report.claude.state === 'outdated' ? `Claude Code ${report.claude.version} is` : 'This Claude Code is';
    const choice = await host.warn(`${found} older than ${minimumTasksVersion}, which MCP tasks need. Update it with "claude update", then run this command again.`, 'Update in Terminal', 'Open Install Guide');
    if (choice === 'Update in Terminal') host.openTerminal(`${shellQuote(claude)} update`, cwd);
    if (choice === 'Open Install Guide') await host.openExternal(installGuideUrl);
    return report;
  }
  host.openTerminal(shellQuote(claude), cwd);
  const where = 'Hand-offs appear as tasks under /tasks in that terminal, never in the Claude Code panel or the desktop app.';
  if (report.serverChecked && !report.server) {
    const choice = await host.warn(`Claude Code is open, but it has no unfold-mcp server, so it cannot hand off to Unfold. Install the unfold-mcp plugin from your installation's marketplace, or add the server and sign in with /mcp. ${where}`, ...(origin ? ['Copy Setup Command'] : []), 'Open Guide');
    if (choice === 'Copy Setup Command' && origin) await host.copy(addServerCommand(origin));
    if (choice === 'Open Guide') await host.openExternal(followGuideUrl);
    return report;
  }
  if (!report.protocol.modern || !report.tasks.available) {
    const choice = await host.warn(`Claude Code is open, but hand-offs will not become tasks: ${[report.protocol.modern ? '' : report.protocol.reason, ...report.tasks.reasons].filter(Boolean).join('; ')}. The output panel lists each check.`, 'Open Guide');
    if (choice === 'Open Guide') await host.openExternal(followGuideUrl);
    return report;
  }
  const choice = await host.inform(`Claude Code is open in the terminal. Ask it to hand off a Work Item to Unfold. ${where}`, 'Open Guide');
  if (choice === 'Open Guide') await host.openExternal(followGuideUrl);
  return report;
}

function runCommand(file: string, args: string[], options: { cwd?: string; timeoutMs: number }): Promise<CommandResult> {
  return new Promise(resolve => {
    execFile(file, args, { cwd: options.cwd, timeout: options.timeoutMs, windowsHide: true, shell: process.platform === 'win32', maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') { resolve({ missing: true }); return; }
      const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

async function claudeSettingsEnv(processEnv: Env, home: string): Promise<Env> {
  const file = join(processEnv.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'settings.json');
  try {
    const env = JSON.parse(await readFile(file, 'utf8'))?.env;
    if (!env || typeof env !== 'object' || Array.isArray(env)) return {};
    return Object.fromEntries(Object.entries(env).filter(([, value]) => typeof value === 'string')) as Env;
  } catch { return {}; }
}

/** The VS Code implementation of the host: an integrated terminal, notifications and an output channel. */
export function vscodeTerminalHost(vscode: typeof VSCode, origin: () => string | undefined, output: () => VSCode.OutputChannel): TerminalHost {
  const home = homedir();
  return {
    run: runCommand,
    home,
    processEnv: process.env,
    settingsEnv: () => claudeSettingsEnv(process.env, home),
    origin,
    cwd: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    progress: (title, task) => Promise.resolve(vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, task)),
    openTerminal: (command, cwd) => {
      const terminal = vscode.window.createTerminal({ name: 'Claude Code · Unfold', cwd, iconPath: new vscode.ThemeIcon('terminal') });
      terminal.show();
      terminal.sendText(command);
    },
    inform: (message, ...actions) => Promise.resolve(vscode.window.showInformationMessage(message, ...actions)),
    warn: (message, ...actions) => Promise.resolve(vscode.window.showWarningMessage(message, ...actions)),
    fail: (message, ...actions) => Promise.resolve(vscode.window.showErrorMessage(message, ...actions)),
    openExternal: url => Promise.resolve(vscode.env.openExternal(vscode.Uri.parse(url))),
    copy: text => Promise.resolve(vscode.env.clipboard.writeText(text)),
    log: lines => {
      const channel = output();
      channel.appendLine(`Claude Code check, ${new Date().toISOString()}`);
      for (const line of lines) channel.appendLine(line);
      channel.appendLine('');
    },
  };
}
