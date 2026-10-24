import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

/** The notes ref the plugin writes and pushes. */
export const notesRef = 'refs/notes/agent-trace';

/**
 * The remote a successful `git push` in a shell command pushed to: its first argument that is not an option, or,
 * with none, the remote the branch pushes to. Returns null for a command that pushes no branch: no `git push`, a dry
 * run, a deletion, a mirror, a push of notes or tags only.
 */
export function pushedRemote(command) {
  const match = /(?:^|[;&|(]\s*|\s)git\s+(?:-C\s+\S+\s+)?push\b([^;&|]*)/.exec(String(command ?? ''));
  if (!match) return null;
  const words = match[1].trim().split(/\s+/).filter(Boolean);
  if (words.some(word => ['-n', '--dry-run', '-d', '--delete', '--mirror', '--prune', '--tags'].includes(word) || word.includes('refs/notes'))) return null;
  const valued = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);
  for (let index = 0; index < words.length; index += 1) {
    if (valued.has(words[index])) { index += 1; continue; }
    if (!words[index].startsWith('-')) return words[index].replace(/^["']|["']$/g, '');
  }
  return '';
}

/** The directory a shell command ran git in: `git -C <dir>`, or a leading `cd <dir> &&`, resolved against `cwd`. */
export function commandDirectory(command, cwd) {
  const given = /git\s+-C\s+("[^"]+"|'[^']+'|\S+)\s+push/.exec(command)?.[1] ?? /^\s*cd\s+("[^"]+"|'[^']+'|\S+)\s*&&/.exec(command)?.[1];
  if (!given) return cwd;
  const bare = given.replace(/^["']|["']$/g, '');
  return bare.startsWith('/') ? bare : `${cwd.replace(/\/+$/, '')}/${bare}`;
}

/**
 * Pushes the agent-trace notes to the remote a branch was just pushed to, never forced. When the remote's notes
 * moved on, fetches them into a temporary local ref, merges them with `cat_sort_uniq` (two records for one commit
 * become two JSON lines) and tries once more. Every git call shares one deadline. Returns what happened:
 * `pushed`, `merged`, `nothing` (no local notes or no remote) or `failed`.
 */
export function pushAgentTrace({ cwd, command, deadlineMs = 8000, now = Date.now }) {
  const remoteGiven = pushedRemote(command);
  if (remoteGiven === null) return 'nothing';
  const dir = commandDirectory(String(command), cwd);
  const until = now() + deadlineMs;
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(process.env.GIT_SSH_COMMAND ? {} : { GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' }) };
  const run = args => {
    const left = until - now();
    if (left <= 0) throw new Error('deadline');
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: left, env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  };
  const attempt = args => { try { return { ok: true, out: run(args) }; } catch (error) { return { ok: false, out: String(error.stderr ?? error.message) }; } };
  if (!attempt(['rev-parse', '--verify', '-q', notesRef]).ok) return 'nothing';
  let remote = remoteGiven;
  if (!remote) {
    const upstream = attempt(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{push}']);
    remote = upstream.ok ? upstream.out.split('/')[0] : 'origin';
  }
  const named = attempt(['remote']).out.split('\n').includes(remote);
  if (!named && !/^(?:https?|ssh|git):\/\/|^[\w.-]+@[\w.-]+:/.test(remote)) return 'nothing';
  const refspec = `${notesRef}:${notesRef}`;
  const push = () => attempt(['push', '--no-verify', '--quiet', remote, refspec]);
  if (push().ok) return 'pushed';
  const incoming = `refs/notes/agent-trace-incoming-${randomUUID().slice(0, 8)}`;
  try {
    if (!attempt(['fetch', '--no-tags', '--quiet', remote, `${notesRef}:${incoming}`]).ok) return 'failed';
    if (!attempt(['notes', '--ref=agent-trace', 'merge', '--quiet', '-s', 'cat_sort_uniq', incoming]).ok) return 'failed';
    return push().ok ? 'merged' : 'failed';
  } finally {
    spawnSync('git', ['-C', dir, 'update-ref', '-d', incoming], { stdio: 'ignore', timeout: 2000 });
  }
}
