import { spawn } from 'node:child_process';

/**
 * Runs one gate command as the leader of its own process group.
 *
 * `done` resolves with `{ status, error, output, stdout, orphaned }` once the command has exited and
 * its output is collected. A descendant that outlives the command and keeps the output open is killed
 * `graceMs` after the command exits, and `orphaned` is then true. `stop()` sends SIGTERM to the
 * process group and SIGKILL `graceMs` later.
 */
export function runGate(command, args, { cwd, env, graceMs = 5000, keepStdout = true, captureStdout = false } = {}) {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const chunks = [];
  let stdout = '';
  child.stdout.on('data', chunk => {
    if (captureStdout) stdout += chunk;
    if (keepStdout) chunks.push(chunk);
  });
  child.stderr.on('data', chunk => chunks.push(chunk));

  const signal = name => {
    try {
      process.kill(-child.pid, name);
    } catch {}
  };
  const timers = new Set();
  const later = action => timers.add(setTimeout(action, graceMs));

  let settle;
  const done = new Promise(resolve => {
    settle = (status, error, orphaned = false) => {
      if (!settle) return;
      settle = undefined;
      for (const timer of timers) clearTimeout(timer);
      let output = Buffer.concat(chunks).toString('utf8');
      if (error) output += `${error.message}\n`;
      if (orphaned) output += `${command} ${args.join(' ')} exited, but a process it started kept its output open for ${graceMs / 1000}s and was killed\n`;
      resolve({ status, error, output, stdout, orphaned });
    };
  });
  child.on('error', error => settle?.(null, error));
  child.on('exit', (code, name) => later(() => {
    signal('SIGKILL');
    child.stdout.destroy();
    child.stderr.destroy();
    settle?.(code ?? name, undefined, true);
  }));
  child.on('close', (code, name) => settle?.(code ?? name));

  const stop = () => {
    if (!settle) return;
    signal('SIGTERM');
    later(() => signal('SIGKILL'));
  };
  return { child, done, stop };
}
