#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { lineSplitter, message } from '../lib/lines.mjs';
import { AcpObserver } from '../lib/observer.mjs';
import { UnfoldReporter } from '../lib/reporter.mjs';

const usage = `Usage: unfold-acp [--] <agent command> [arguments...]

Starts the agent and relays its Agent Client Protocol messages unchanged. With UNFOLD_URL and UNFOLD_TOKEN set,
it reports the session to Unfold. Example: unfold-acp -- gemini --experimental-acp
`;

const args = process.argv.slice(2);
if (args[0] === '--') args.shift();
if (!args.length || (args.length === 1 && ['-h', '--help'].includes(args[0]))) {
  process.stderr.write(usage);
  process.exit(args.length ? 0 : 2);
}

const debug = Boolean(process.env.UNFOLD_HOOK_DEBUG);
const url = (process.env.UNFOLD_URL ?? '').trim();
const token = (process.env.UNFOLD_TOKEN ?? '').trim();
const timeoutMs = Number(process.env.UNFOLD_HOOK_TIMEOUT_MS) || 3000;
const reporter = url && token ? new UnfoldReporter({ url, token, timeoutMs, workItem: (process.env.UNFOLD_WORK_ITEM ?? '').trim(), debug }) : null;
const observer = reporter ? new AcpObserver(reporter) : null;
const quiet = error => { if (debug) process.stderr.write(`unfold-acp: ${error?.message ?? error}\n`); };
const guarded = handler => value => { try { handler(value); } catch (error) { quiet(error); } };

process.on('uncaughtException', quiet);
process.on('unhandledRejection', quiet);

const child = spawn(args[0], args.slice(1), { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
child.on('error', error => {
  process.stderr.write(`unfold-acp: could not start ${args[0]}: ${error.message}\n`);
  process.exit(127);
});

process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.stdin.on('error', quiet);
process.stdout.on('error', error => { quiet(error); child.kill('SIGTERM'); });
if (observer) {
  process.stdin.on('data', guarded(lineSplitter(guarded(line => observer.fromEditor(message(line))))));
  child.stdout.on('data', guarded(lineSplitter(guarded(line => observer.fromAgent(message(line))))));
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { if (child.exitCode === null) child.kill(signal); });

child.on('close', async (code, signal) => {
  if (reporter) await Promise.race([reporter.close(), new Promise(done => setTimeout(done, Math.min(10_000, timeoutMs * 3)))]);
  await new Promise(done => process.stdout.write('', () => done()));
  process.exit(code ?? 128 + (constants.signals[signal] ?? 0));
});
