#!/usr/bin/env node
import { open } from 'node:fs/promises';
import { LinkedReporter, patchWrites, pullRequestUrls, reporterSettings, sessionIdPattern } from '../shared/linked-report.mjs';

const settings = reporterSettings(process.env);

async function cliVersion(transcriptPath) {
  if (!transcriptPath) return '';
  let file;
  try {
    file = await open(transcriptPath, 'r');
    const buffer = Buffer.alloc(65_536);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return /"cli_version":"(\d+\.\d+\.\d+[\w.+-]*)"/.exec(buffer.subarray(0, bytesRead).toString('utf8'))?.[1] ?? '';
  } catch { return ''; } finally { await file?.close(); }
}

function commandText(toolInput) {
  const command = toolInput?.command;
  return Array.isArray(command) ? command.map(String).join(' ') : String(command ?? '');
}

async function hook(reporter, input) {
  const id = input.session_id;
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const state = await reporter.load(id);
  if (typeof input.model === 'string' && input.model) state.model = input.model;
  if (!state.harnessVersion) state.harnessVersion = await cliVersion(input.transcript_path);
  let output = '';
  const resumeWork = async () => { if (state.status === 'waiting') await reporter.report(id, cwd, state, 'prompt'); };
  switch (input.hook_event_name) {
    case 'SessionStart': {
      const { answer } = await reporter.report(id, cwd, state, 'start');
      if (answer.context) output = JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: String(answer.context) } });
      break;
    }
    case 'UserPromptSubmit': await reporter.report(id, cwd, state, 'prompt'); break;
    case 'PermissionRequest': await reporter.report(id, cwd, state, 'waiting', { waitingFor: 'permission_prompt' }); break;
    case 'PostToolUse': {
      await resumeWork();
      if (input.tool_name === 'apply_patch') {
        for (const write of patchWrites(commandText(input.tool_input))) await reporter.rememberWrite(state, cwd, write.path, write.text);
      } else if (input.tool_name === 'Bash') {
        await reporter.commits(id, cwd, state);
        const found = pullRequestUrls(commandText(input.tool_input), input.tool_response);
        if (found.length) await reporter.report(id, cwd, state, 'prompt', { pullRequests: found });
      }
      break;
    }
    case 'Stop': await reporter.commits(id, cwd, state); await reporter.report(id, cwd, state, 'idle'); break;
    case 'Interrupt': await reporter.report(id, cwd, state, 'idle', {}, 1500); break;
    case 'SessionEnd': await reporter.report(id, cwd, state, 'end', {}, 1500); break;
    default: break;
  }
  await reporter.save(id, state);
  return output;
}

async function notified(reporter, payload) {
  if (payload?.type !== 'agent-turn-complete') return;
  const id = payload['thread-id'];
  if (typeof id !== 'string' || !sessionIdPattern.test(id)) return;
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  const state = await reporter.load(id);
  await reporter.commits(id, cwd, state);
  await reporter.report(id, cwd, state, 'idle');
  await reporter.save(id, state);
}

async function main() {
  const argument = process.argv[2];
  let input;
  if (argument !== undefined) { try { input = JSON.parse(argument); } catch { return; } }
  else {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    try { input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return; }
  }
  if (!settings || !input || typeof input !== 'object') return;
  const reporter = new LinkedReporter({ harness: 'codex', client: 'codex-hook', stateName: 'unfold-codex', settings });
  try {
    if (argument !== undefined) { await notified(reporter, input); return; }
    if (typeof input.session_id !== 'string' || !sessionIdPattern.test(input.session_id)) return;
    const output = await hook(reporter, input);
    if (output) process.stdout.write(`${output}\n`);
  } catch (error) {
    if (settings.debug) process.stderr.write(`unfold: ${error.message}\n`);
  }
}

await main();
process.exitCode = 0;
