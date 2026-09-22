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


def bash(command):
    return run({'hook_event_name': 'PreToolUse', 'tool_name': 'Bash', 'tool_input': {'command': command, 'description': 'test'}})


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
            'cd apps/vloer; git add -A',
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


class Settings(unittest.TestCase):
    def test_project_settings_register_the_hook_on_bash(self):
        settings = json.loads(SETTINGS.read_text())
        groups = settings['hooks']['PreToolUse']
        commands = [hook['command'] for group in groups if group['matcher'] == 'Bash' for hook in group['hooks'] if hook['type'] == 'command']
        self.assertTrue(any('scripts/stage-explicit-paths.py' in command for command in commands), commands)


if __name__ == '__main__':
    unittest.main()
