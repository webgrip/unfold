import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addServerCommand, compareVersions, diagnose, followHandOffsCommand, followHandOffsInTerminal, minimumTasksVersion, parseClaudeVersion, parseMcpList, protocolAndTasks, reportLines, supportsTasks, unfoldServer, type CommandResult, type TerminalHost } from '../src/claude-terminal.ts';

const listing = [
  'Checking MCP server health…',
  '',
  'plugin:unfold:unfold-channel: node /home/me/.claude/plugins/unfold/channel/unfold-channel.mjs - ✔ Connected',
  'plugin:unfold-mcp:unfold: https://unfold.example.com/mcp (HTTP) - ✔ Connected',
  'vikunja: https://litellm.example.com/mcp/vikunja (HTTP) - ⏸ Pending approval (run `claude` to approve)',
  'MCP config diagnostics ⚠',
].join('\n');

const ok = (stdout: string): CommandResult => ({ code: 0, stdout, stderr: '' });

test('the version claude prints is read and compared numerically against the first release with MCP tasks', () => {
  assert.equal(parseClaudeVersion('2.1.310 (Claude Code)\n'), '2.1.310');
  assert.equal(parseClaudeVersion('v2.1.304'), '2.1.304');
  assert.equal(parseClaudeVersion('Claude Code'), undefined);
  assert.equal(compareVersions('2.1.304', '2.1.304'), 0);
  assert.equal(compareVersions('2.1.99', '2.1.304'), -1, 'numeric, not lexical');
  assert.equal(compareVersions('2.2.0', '2.1.304'), 1);
  assert.equal(compareVersions('10.0.0', '9.9.9'), 1);
  assert.equal(minimumTasksVersion, '2.1.304');
  assert.equal(supportsTasks('2.1.303'), false);
  assert.equal(supportsTasks('2.1.304'), true);
  assert.equal(supportsTasks('2.1.310'), true);
});

test('claude mcp list is parsed into servers, and the Unfold server is found by name and never as the channel', () => {
  const servers = parseMcpList(listing);
  assert.deepEqual(servers.map(server => [server.name, server.transport, server.status]), [
    ['plugin:unfold:unfold-channel', 'stdio', 'connected'],
    ['plugin:unfold-mcp:unfold', 'http', 'connected'],
    ['vikunja', 'http', 'pending'],
  ]);
  assert.equal(unfoldServer(servers)?.target, 'https://unfold.example.com/mcp');
  assert.equal(unfoldServer(parseMcpList('plugin:unfold:unfold-channel: node x.mjs - ✔ Connected')), undefined);
  const byHost = parseMcpList('work: https://unfold.example.com/mcp (HTTP) - ! Needs authentication');
  assert.equal(unfoldServer(byHost, 'https://unfold.example.com')?.status, 'needs-sign-in');
  assert.equal(unfoldServer(byHost, 'https://other.example.com'), undefined);
  assert.equal(unfoldServer(parseMcpList('unfold: node /x/scripts/mcp.ts - ✘ Failed to connect'))?.status, 'failed');
});

test('an unfold-mcp server over stdio is reported as one that never answers with a task', () => {
  const report = diagnose({ version: ok('2.1.310'), mcpList: ok('unfold: node /x/apps/unfold/scripts/mcp.ts - ✔ Connected'), processEnv: {} });
  assert.equal(report.server?.transport, 'stdio');
  assert.equal(report.tasks.available, false);
  assert.match(report.tasks.reasons.join(), /over stdio never answers with a task/);
  assert.match(reportLines(report, 'https://unfold.example.com').join('\n'), /Connect over HTTPS instead: claude mcp add --scope user --transport http --client-id unfold-mcp unfold https:\/\/unfold\.example\.com\/mcp/);
});

test('2026-07-28 and MCP tasks are reported off for each setting that turns them off', () => {
  assert.deepEqual(protocolAndTasks({}), { protocol: { modern: true, reason: 'Claude Code asks HTTP and stdio servers for 2026-07-28 first, and unfold-mcp answers it.' }, tasks: { available: true, reasons: [] } });
  assert.equal(protocolAndTasks({ MCP_PROTOCOL_NEGOTIATION: 'legacy' }).protocol.modern, false);
  assert.equal(protocolAndTasks({}, { MCP_SDK_GENERATION: 'v1' }).protocol.modern, false, 'the settings env block counts');
  assert.equal(protocolAndTasks({ MCP_PROTOCOL_NEGOTIATION: 'auto' }).protocol.modern, true);
  for (const env of [{ DISABLE_TELEMETRY: '0' }, { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }, { DISABLE_GROWTHBOOK: 'true' }, { DO_NOT_TRACK: '1' }, { CLAUDE_CODE_USE_BEDROCK: '1' }, { CLAUDE_CODE_USE_VERTEX: 'true' }, { CLAUDE_CODE_USE_FOUNDRY: '1' }]) {
    const { tasks } = protocolAndTasks(env);
    assert.equal(tasks.available, false, JSON.stringify(env));
    assert.equal(tasks.reasons.length, 1, JSON.stringify(env));
  }
  for (const env of [{ DO_NOT_TRACK: '0' }, { DISABLE_GROWTHBOOK: '0' }, { CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1' }]) assert.equal(protocolAndTasks(env).tasks.available, true, JSON.stringify(env));
});

test('the report names the version, the server and the protocol, and says what to do', () => {
  const healthy = reportLines(diagnose({ version: ok('2.1.310 (Claude Code)'), mcpList: ok(listing), processEnv: {} }));
  assert.deepEqual(healthy.map(line => line.slice(0, 1)), ['✔', '✔', '✔', '✔', '?']);
  assert.match(healthy[1], /plugin:unfold-mcp:unfold \(HTTP\) is connected/);
  const unconfigured = reportLines(diagnose({ version: ok('2.1.310'), mcpList: ok('vikunja: https://x.example/mcp (HTTP) - ✔ Connected'), processEnv: {} }), 'https://unfold.example.com');
  assert.match(unconfigured[1], /not configured for the Claude Code CLI/);
  assert.ok(unconfigured[1].endsWith('claude mcp add --scope user --transport http --client-id unfold-mcp unfold https://unfold.example.com/mcp'));
  assert.match(reportLines(diagnose({ version: ok('2.1.250'), processEnv: {} }))[0], /2\.1\.250: MCP tasks need 2\.1\.304 or later\. Run "claude update"/);
  assert.match(reportLines(diagnose({ version: { missing: true }, processEnv: {} }))[0], /not found on PATH/);
  assert.equal(addServerCommand('https://unfold.example.com/'), 'claude mcp add --scope user --transport http --client-id unfold-mcp unfold https://unfold.example.com/mcp');
});

type Recorded = { terminals: string[]; messages: Array<[string, string]>; opened: string[]; copied: string[]; logged: string[][]; runs: string[] };

function fakeHost(commands: Record<string, CommandResult>, answer?: string, env: Record<string, string> = {}): { host: TerminalHost; seen: Recorded } {
  const seen: Recorded = { terminals: [], messages: [], opened: [], copied: [], logged: [], runs: [] };
  const say = (kind: string) => async (message: string) => { seen.messages.push([kind, message]); return answer; };
  const host: TerminalHost = {
    run: async (file, args) => { const key = `${file} ${args.join(' ')}`; seen.runs.push(key); return commands[key] ?? { missing: true }; },
    home: '/home/me',
    processEnv: env,
    settingsEnv: async () => ({}),
    origin: () => 'https://unfold.example.com',
    cwd: () => '/work/repo',
    progress: (_title, task) => task(),
    openTerminal: (command, cwd) => { seen.terminals.push(`${cwd}$ ${command}`); },
    inform: say('info'),
    warn: say('warning'),
    fail: say('error'),
    openExternal: async url => { seen.opened.push(url); },
    copy: async text => { seen.copied.push(text); },
    log: lines => { seen.logged.push(lines); },
  };
  return { host, seen };
}

test('without claude the command opens no terminal and links the install guide', async () => {
  const { host, seen } = fakeHost({}, 'Open Install Guide');
  const report = await followHandOffsInTerminal(host);
  assert.equal(report.claude.state, 'missing');
  assert.deepEqual(seen.runs, ['claude --version', '/home/me/.local/bin/claude --version'], 'it also looks where the native installer puts claude');
  assert.deepEqual(seen.terminals, []);
  assert.equal(seen.messages[0][0], 'error');
  assert.deepEqual(seen.opened, ['https://code.claude.com/docs/en/setup']);
});

test('an older claude is not opened; the person can update it in a terminal', async () => {
  const { host, seen } = fakeHost({ 'claude --version': ok('2.1.300 (Claude Code)') }, 'Update in Terminal');
  const report = await followHandOffsInTerminal(host);
  assert.equal(report.claude.state, 'outdated');
  assert.match(seen.messages[0][1], /2\.1\.300 is older than 2\.1\.304/);
  assert.deepEqual(seen.terminals, ['/work/repo$ claude update']);
  assert.ok(!seen.runs.includes('claude mcp list'));
});

test('a current claude opens in the workspace and says that hand-offs appear under /tasks there only', async () => {
  const { host, seen } = fakeHost({ 'claude --version': ok('2.1.310 (Claude Code)'), 'claude mcp list': ok(listing) });
  const report = await followHandOffsInTerminal(host);
  assert.equal(report.claude.state, 'ok');
  assert.deepEqual(seen.terminals, ['/work/repo$ claude']);
  assert.equal(seen.messages[0][0], 'info');
  assert.match(seen.messages[0][1], /under \/tasks in that terminal, never in the Claude Code panel or the desktop app/);
  assert.equal(seen.logged.length, 1);
});

test('claude found only under ~/.local/bin is started by its path', async () => {
  const { host, seen } = fakeHost({ '/home/me/.local/bin/claude --version': ok('2.1.310'), '/home/me/.local/bin/claude mcp list': ok(listing) });
  await followHandOffsInTerminal(host);
  assert.deepEqual(seen.terminals, ['/work/repo$ /home/me/.local/bin/claude']);
});

test('without an unfold-mcp server the terminal still opens and the setup command can be copied', async () => {
  const { host, seen } = fakeHost({ 'claude --version': ok('2.1.310'), 'claude mcp list': ok('') }, 'Copy Setup Command');
  await followHandOffsInTerminal(host);
  assert.deepEqual(seen.terminals, ['/work/repo$ claude']);
  assert.equal(seen.messages[0][0], 'warning');
  assert.deepEqual(seen.copied, ['claude mcp add --scope user --transport http --client-id unfold-mcp unfold https://unfold.example.com/mcp']);
});

test('a setting that keeps tool calls from becoming tasks is named in the warning', async () => {
  const { host, seen } = fakeHost({ 'claude --version': ok('2.1.310'), 'claude mcp list': ok(listing) }, undefined, { MCP_PROTOCOL_NEGOTIATION: 'legacy' });
  await followHandOffsInTerminal(host);
  assert.equal(seen.messages[0][0], 'warning');
  assert.match(seen.messages[0][1], /MCP_PROTOCOL_NEGOTIATION=legacy/);
});

test('the command is contributed and registered under the id the module names', () => {
  const root = new URL('../', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  const contributed = manifest.contributes.commands.find((command: { command: string }) => command.command === `unfold.${followHandOffsCommand}`);
  assert.deepEqual([contributed?.title, contributed?.category], ['Follow Hand-offs in a Claude Code Terminal', 'Unfold']);
  const source = readFileSync(new URL('src/extension.ts', root), 'utf8');
  assert.match(source, new RegExp(`register\\('${followHandOffsCommand}', \\(\\) => followHandOffsInTerminal\\(vscodeTerminalHost\\(vscode,`));
});
