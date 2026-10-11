import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const StageExplicitPaths = async ({ worktree }) => ({
  'tool.execute.before': async (input, output) => {
    const command = output.args?.command;
    if (typeof command !== 'string') return;
    const guard = spawnSync('python3', [join(worktree, 'scripts/stage-explicit-paths.py')], {
      input: JSON.stringify({ tool_name: input.tool, tool_input: { command } }),
      encoding: 'utf8',
    });
    if (guard.status === 2) throw new Error(guard.stderr.trim());
  },
});
