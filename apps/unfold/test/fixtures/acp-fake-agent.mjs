import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const log = process.env.FAKE_ACP_LOG;
let cwd = '';
let buffer = '';
let waitingPermission = null;

function send(raw) {
  appendFileSync(join(log, 'agent-out'), raw);
  process.stdout.write(raw);
}

function commit(subject) {
  execFileSync('git', ['-C', cwd, 'add', '-A']);
  execFileSync('git', ['-C', cwd, 'commit', '-q', '-m', subject]);
}

function handle(message) {
  if (message.method === 'initialize') send(`{"jsonrpc":"2.0", "id":${JSON.stringify(message.id)},"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":true},"agentInfo":{"name":"fake-agent","title":"Fake Agent","version":"1.2.3"},"authMethods":[]}}\n`);
  else if (message.method === 'session/new') { cwd = message.params.cwd; send(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'sess_fake01', models: { currentModelId: 'fake/model-1', availableModels: [] } } })}\n`); }
  else if (message.method === 'session/prompt' && message.params.prompt[0].text.includes('edit')) {
    const path = join(cwd, 'src/login.ts');
    const newText = 'export function login(user) {\n  return check(user);\n}\n';
    send(`${JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'sess_fake01', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'TOOL OUTPUT SECRET ünïcode' } } } })}\n`);
    send(`${JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'sess_fake01', update: { sessionUpdate: 'tool_call', toolCallId: 'call_1', title: 'Write login', kind: 'edit', status: 'pending', content: [{ type: 'diff', path, oldText: null, newText }] } } })}\n`);
    send(`${JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'sess_fake01', update: { sessionUpdate: 'tool_call', toolCallId: 'call_2', title: 'Rejected edit', kind: 'edit', status: 'pending', content: [{ type: 'diff', path: join(cwd, 'src/other.ts'), oldText: null, newText: 'const rejected = true;\n' }] } } })}\n`);
    send(`${JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'sess_fake01', update: { sessionUpdate: 'tool_call_update', toolCallId: 'call_2', status: 'failed' } } })}\n`);
    waitingPermission = { prompt: message.id, path, newText };
    send(`${JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'session/request_permission', params: { sessionId: 'sess_fake01', toolCall: { toolCallId: 'call_1' }, options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }] } })}\n`);
  } else if (message.method === 'session/prompt') {
    writeFileSync(join(cwd, 'NOTES.md'), 'Written by a shell command the proxy cannot see into.\n');
    commit('docs: notes');
    send(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } })}\n`);
  } else if (message.id === 0 && waitingPermission) {
    const { prompt, path, newText } = waitingPermission;
    waitingPermission = null;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${newText}// a person added this line\n`);
    writeFileSync(join(cwd, 'src/other.ts'), 'const rejected = true;\n');
    send(`${JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'sess_fake01', update: { sessionUpdate: 'tool_call_update', toolCallId: 'call_1', status: 'completed' } } })}\n`);
    commit('feat: login');
    send('not json, relayed anyway\n');
    const response = JSON.stringify({ jsonrpc: '2.0', id: prompt, result: { stopReason: 'end_turn' } });
    send(response.slice(0, 10));
    setTimeout(() => send(`${response.slice(10)}\n`), 30);
  }
}

process.stdin.on('data', chunk => {
  appendFileSync(join(log, 'agent-in'), chunk);
  buffer += chunk.toString('utf8');
  let index;
  while ((index = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    try { handle(JSON.parse(line)); } catch { continue; }
  }
});
process.stdin.on('end', () => setTimeout(() => process.exit(3), 20));
