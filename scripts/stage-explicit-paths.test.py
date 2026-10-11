import json
import subprocess
import sys
import unittest
from pathlib import Path

HOOK = Path(__file__).with_name('stage-explicit-paths.py')
SETTINGS = Path(__file__).resolve().parent.parent / '.claude/settings.json'


def run(event):
    payload = event if isinstance(event, str) else json.dumps(event)
    return subprocess.run([sys.executable, str(HOOK)], input=payload, capture_output=True, text=True)


def bash(command, cwd=None):
    event = {'hook_event_name': 'PreToolUse', 'tool_name': 'Bash', 'tool_input': {'command': command, 'description': 'test'}}
    if cwd:
        event['cwd'] = str(cwd)
    return run(event)


class Denied(unittest.TestCase):
    def test_whole_tree_staging_is_blocked_with_a_reason(self):
        for command in [
            'git add -A',
            'git add --all',
            'git add .',
            'git add -- .',
            'git add -Av',
            'git -C apps/ploeg add .',
            'git -c core.quotepath=off add --all',
            'git commit -a -m "fix: x"',
            'git commit -am "fix: x"',
            'git commit --all',
            'git status && git add . && git commit -m x',
            'cd apps/unfold; git add -A',
            'git add src/a.ts\ngit add .',
            '/usr/bin/git add -A',
        ]:
            result = bash(command)
            self.assertEqual(result.returncode, 2, command)
            self.assertIn('stage explicit paths', result.stderr.lower(), command)
            self.assertIn('share this checkout', result.stderr, command)

    def test_unparseable_command_falls_back_to_a_pattern(self):
        self.assertEqual(bash('git add . && echo "unterminated').returncode, 2)


class Allowed(unittest.TestCase):
    def test_explicit_paths_and_ordinary_commits_pass(self):
        for command in [
            'git add scripts/agents-files.py scripts/agents-files.test.py',
            'git add ./scripts/x.py',
            'git add -p scripts/x.py',
            'git commit -m "chore: add all the things"',
            'git commit -m "$(cat <<\'EOF\'\nfix: stage . and -A\nEOF\n)"',
            'git commit --amend --no-edit',
            'git commit -ma',
            'git commit -F msg.txt',
            'echo "git add ."',
            'git log --all',
            'git status',
            'ls -a .',
        ]:
            result = bash(command)
            self.assertEqual(result.returncode, 0, f'{command}: {result.stderr}')
            self.assertEqual(result.stderr, '', command)

    def test_other_tools_and_bad_input_pass(self):
        self.assertEqual(run({'tool_name': 'Write', 'tool_input': {'content': 'git add .'}}).returncode, 0)
        self.assertEqual(run('not json').returncode, 0)


ROOT = SETTINGS.parent.parent


class PloegCheckout(unittest.TestCase):
    def test_moving_or_changing_the_pinned_checkout_is_blocked(self):
        for command, cwd in [
            ('git -C apps/ploeg checkout fix/operator-execution-hold', ROOT),
            ('git -C apps/ploeg pull --tags origin development', ROOT),
            ('git -C apps/ploeg switch -c fix/x', ROOT),
            ('git -C apps/ploeg checkout origin/development', ROOT),
            ('cd apps/ploeg && git checkout -b fix/x && git pull origin development', ROOT),
            ('git -C apps -C ploeg reset --hard origin/development', ROOT),
            ('git commit -m "fix: x"', ROOT / 'apps/ploeg'),
            ('git stash pop', ROOT / 'apps/ploeg/pkg'),
            ('git -C /x -C ' + str(ROOT / 'apps/ploeg') + ' merge origin/development', ROOT),
        ]:
            result = bash(command, cwd)
            self.assertEqual(result.returncode, 2, command)
            self.assertIn('pinned Ploeg release', result.stderr, command)
            self.assertIn('worktree add', result.stderr, command)

    def test_reading_fetching_worktrees_and_release_pins_pass(self):
        for command, cwd in [
            ('git -C apps/ploeg checkout v0.2.0-rc.16', ROOT),
            ('git -C apps/ploeg checkout --detach v0.2.0', ROOT),
            ('git -C apps/ploeg fetch --tags origin', ROOT),
            ('git -C apps/ploeg log --oneline -5', ROOT),
            ('git -C apps/ploeg worktree add ../../../ploeg-x -b fix/x origin/development', ROOT),
            ('git submodule update apps/ploeg', ROOT),
            ('git checkout -b fix/x', ROOT),
            ('git -C apps/unfold checkout -- src/a.ts', ROOT),
            ('git pull', ROOT.parent / 'ploeg-hold'),
            ('git status', ROOT / 'apps/ploeg'),
        ]:
            result = bash(command, cwd)
            self.assertEqual(result.returncode, 0, f'{command}: {result.stderr}')


class Settings(unittest.TestCase):
    def test_project_settings_register_the_hook_on_bash(self):
        settings = json.loads(SETTINGS.read_text())
        groups = settings['hooks']['PreToolUse']
        commands = [hook['command'] for group in groups if group['matcher'] == 'Bash' for hook in group['hooks'] if hook['type'] == 'command']
        self.assertTrue(any('scripts/stage-explicit-paths.py' in command for command in commands), commands)


class OtherHarnesses(unittest.TestCase):
    def test_any_tool_with_a_shell_command_is_checked(self):
        for name in ['terminal', 'bash', None]:
            event = {'tool_input': {'command': 'git add -A'}}
            if name:
                event['tool_name'] = name
            self.assertEqual(run(event).returncode, 2, name)

    def test_openhands_hook_runs_the_guard(self):
        config = json.loads((SETTINGS.parent.parent / '.openhands/hooks.json').read_text())
        commands = [hook['command'] for group in config['pre_tool_use'] for hook in group['hooks']]
        self.assertTrue(any('scripts/stage-explicit-paths.py' in command for command in commands))

    def test_opencode_plugin_runs_the_guard(self):
        plugin = (SETTINGS.parent.parent / '.opencode/plugins/stage-explicit-paths.js').read_text()
        self.assertIn('scripts/stage-explicit-paths.py', plugin)
        self.assertIn("'tool.execute.before'", plugin)


if __name__ == '__main__':
    unittest.main()
