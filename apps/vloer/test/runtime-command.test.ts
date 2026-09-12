import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { CommandRuntime } from '../src/runtime/command.ts';
import { RuntimeFailure } from '../src/failures.ts';
import type { RuntimeWorkspaces } from '../src/runtime/opencode.ts';
import type { AppConfig, RuntimeEvent } from '../src/types.ts';
import { executionFixture } from './runtime-fixture.ts';

async function fixture(code: string, argv?: string[]) {
  const directory = await mkdtemp(join(tmpdir(), 'vloer-command-'));
  const script = join(directory, 'bridge.mjs');
  await writeFile(script, code);
  const workspace = { id: directory, backend: 'local' as const, directory };
  const manager: RuntimeWorkspaces = { prepare: async () => workspace, credentials: () => undefined, executionEnvironment: () => ({ PATH: process.env.PATH ?? '', LITELLM_API_KEY: 'scoped-key' }), dispose: async () => {} };
  const config = { runtime: { backend: 'local', command: argv ?? [process.execPath, script], timeoutMs: 3000 }, models: [] } as unknown as AppConfig;
  const events: RuntimeEvent[] = [];
  const context = executionFixture({ runtime: 'command', role: { id: 'writer', name: 'Writer', mode: 'write', instruction: 'Implement' }, workspace, verify: [], prompt: 'Do it', signal: new AbortController().signal, emit: event => { events.push(event); } });
  return { runtime: new CommandRuntime(config, manager), context, events, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test('command bridge gets only scoped environment, emits native id, returns actual process evidence', async () => {
  const f = await fixture(`import {createInterface} from 'node:readline';
createInterface({input:process.stdin}).once('line', line => {
 const request=JSON.parse(line);
 if(request.type!=='start'||process.env.LITELLM_API_KEY!=='scoped-key'||process.env.FAKE_ADMIN_SECRET) process.exit(2);
 console.log(JSON.stringify({type:'event',event:{type:'native.session',data:{nativeId:'bridge-native'}}}));
 console.log(JSON.stringify({type:'result',summary:'Read the actual start record',artifacts:[{kind:'test',name:'protocol assertion',content:'start record validated'}]}));
 process.exit(0);
});`);
  process.env.FAKE_ADMIN_SECRET = 'must-not-reach-bridge';
  try {
    const result = await f.runtime.execute(f.context);
    assert.equal(result.nativeId, 'bridge-native');
    assert.equal(result.artifacts[0].content, 'start record validated');
  } finally { delete process.env.FAKE_ADMIN_SECRET; await f.cleanup(); }
});

test('command bridge exit without result cannot fabricate completion', async () => {
  const f = await fixture('process.exit(0)');
  try { await assert.rejects(f.runtime.execute(f.context), /without a result/); } finally { await f.cleanup(); }
});

test('command bridge rejects successful-looking result from failed process', async () => {
  const f = await fixture(`console.log(JSON.stringify({type:'result',summary:'Looks good'}));process.exit(9)`);
  try { await assert.rejects(f.runtime.execute(f.context), /code 9/); } finally { await f.cleanup(); }
});

test('command bridge maps operator cancellation to AbortError', async () => {
  const f = await fixture('setInterval(()=>{},1000)');
  const controller = new AbortController();
  f.context.signal = controller.signal;
  const pending = f.runtime.execute(f.context);
  controller.abort();
  try { await assert.rejects(pending, { name: 'AbortError' }); } finally { await f.cleanup(); }
});

test('command bridge rejects a null record without crashing its host', async () => {
  const f = await fixture("console.log('null');setInterval(()=>{},1000)");
  try { await assert.rejects(f.runtime.execute(f.context), /invalid record/); } finally { await f.cleanup(); }
});

test('command bridge supervisor stops its runner after control-plane process death', { skip: process.platform === 'win32' }, async () => {
  const f = await fixture("import {writeFileSync} from 'node:fs';writeFileSync('runner.pid',String(process.pid));setInterval(()=>{},1000)");
  const directory = f.context.workspace.directory;
  const hostScript = join(directory, 'host.mjs');
  const moduleUrl = new URL('../src/runtime/command.ts', import.meta.url).href;
  await writeFile(hostScript, `import {CommandRuntime} from ${JSON.stringify(moduleUrl)};
const workspace=${JSON.stringify(f.context.workspace)};
const manager={executionEnvironment:()=>({}),credentials:()=>undefined,prepare:async()=>workspace,dispose:async()=>{}};
const runtime=new CommandRuntime({models:[],runtime:{backend:'local',command:[process.execPath,${JSON.stringify(join(directory, 'bridge.mjs'))}],timeoutMs:30000}},manager);
runtime.execute({session:{id:'s'},run:{id:'r'},workspace,repository:{verify:[]},role:{id:'writer',mode:'write'},prompt:'test',emit:()=>{},signal:new AbortController().signal}).catch(()=>{});`);
  const host = spawn(process.execPath, [hostScript], { stdio: 'ignore' });
  let runnerPid: number | undefined;
  try {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !runnerPid) {
      try { runnerPid = Number(await readFile(join(directory, 'runner.pid'), 'utf8')); } catch { await delay(25); }
    }
    assert.ok(runnerPid, 'runner started');
    const closed = new Promise<void>(resolve => { host.once('close', () => resolve()); });
    host.kill('SIGKILL');
    await closed;
    let stopped = false;
    while (Date.now() < deadline && !stopped) {
      try { process.kill(runnerPid, 0); await delay(25); } catch { stopped = true; }
    }
    assert.equal(stopped, true, 'runner process was reaped after supervisor observed input EOF');
  } finally {
    host.kill('SIGKILL');
    if (runnerPid) try { process.kill(runnerPid, 'SIGKILL'); } catch {}
    await f.cleanup();
  }
});


test('command supervisor distinguishes missing executable from an actual runner exiting 127', async () => {
  const missing = await fixture('', ['/no-such-vloer-command-binary']);
  try {
    await assert.rejects(missing.runtime.execute(missing.context), error => error instanceof RuntimeFailure && error.category === 'missing_executable' && error.promptAcceptance === 'not_submitted');
  } finally { await missing.cleanup(); }
  const exited = await fixture('process.exit(127)');
  try {
    await assert.rejects(exited.runtime.execute(exited.context), error => error instanceof Error && !(error instanceof RuntimeFailure) && error.message.includes('code 127'));
  } finally { await exited.cleanup(); }
});
