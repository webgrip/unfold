import json
import os
import re
import shlex
import sys

REASON = (
    'Blocked: {command!r} stages the whole tree. Several sessions share this checkout, so a '
    'whole-tree add or commit absorbs other sessions\' uncommitted work under your message. '
    'Stage explicit paths instead: git add <file> ..., then git commit without -a.'
)
HEREDOC = re.compile(r"<<-?[ \t]*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n")
SEPARATORS = {'&&', '||', ';', '|', '&', '\n', '(', ')'}
GIT_OPTIONS_WITH_VALUE = {'-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env'}
WHOLE_TREE_PATHSPECS = {'.', './', ':/', ':/.', ':(top)'}
COMMIT_OPTIONS_WITH_VALUE = set('mFCctS')
FALLBACK = re.compile(r'\bgit\b[^;&|\n]*?\b(?:add\s+(?:[^;&|\n]*\s)?(?:-A|--all|\.)(?=\s|$)|commit\s+(?:[^;&|\n]*\s)?(?:-[A-Za-z]*a[A-Za-z]*|--all)(?=\s|$))')


def without_heredoc_bodies(command):
    result, position = [], 0
    for match in HEREDOC.finditer(command):
        if match.start() < position:
            continue
        result.append(command[position:match.end()])
        delimiter = match.group(2)
        end = re.compile(r'^[ \t]*' + re.escape(delimiter) + r'[ \t]*$', re.M).search(command, match.end())
        position = end.end() if end else len(command)
    result.append(command[position:])
    return ''.join(result)


def segments(command):
    lexer = shlex.shlex(command, posix=True, punctuation_chars='();<>|&\n')
    lexer.whitespace = ' \t\r'
    lexer.whitespace_split = True
    current = []
    for token in lexer:
        if token in SEPARATORS or set(token) <= set('();<>|&\n'):
            if current:
                yield current
            current = []
        else:
            current.append(token)
    if current:
        yield current


def git_invocation(words, cwd):
    for index, word in enumerate(words):
        if word == 'git' or word.endswith('/git'):
            rest = words[index + 1:]
            position = 0
            while position < len(rest) and rest[position].startswith('-'):
                if rest[position] == '-C' and position + 1 < len(rest):
                    cwd = os.path.join(cwd, rest[position + 1])
                position += 2 if rest[position] in GIT_OPTIONS_WITH_VALUE else 1
            if position < len(rest):
                return rest[position], rest[position + 1:], cwd
    return None, [], cwd


def git_subcommand(words):
    subcommand, arguments, _ = git_invocation(words, '.')
    return subcommand, arguments


def stages_whole_tree(arguments):
    options_done = False
    for argument in arguments:
        if options_done or not argument.startswith('-'):
            if argument in WHOLE_TREE_PATHSPECS:
                return True
            continue
        if argument == '--':
            options_done = True
        elif argument == '--all' or (not argument.startswith('--') and 'A' in argument[1:]):
            return True
    return False


def commits_all(arguments):
    for argument in arguments:
        if argument == '--':
            return False
        if argument == '--all':
            return True
        if argument.startswith('-') and not argument.startswith('--'):
            for flag in argument[1:]:
                if flag == 'a':
                    return True
                if flag in COMMIT_OPTIONS_WITH_VALUE:
                    break
    return False


def denial(command, cwd):
    try:
        parsed = list(segments(without_heredoc_bodies(command)))
    except ValueError:
        return REASON if FALLBACK.search(without_heredoc_bodies(command)) else None
    for words in parsed:
        subcommand, arguments = git_subcommand(words)
        if subcommand == 'add' and stages_whole_tree(arguments):
            return REASON
        if subcommand == 'commit' and commits_all(arguments):
            return REASON
    return None


def main():
    try:
        event = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0
    command = (event.get('tool_input') or {}).get('command')
    if not isinstance(command, str):
        return 0
    cwd = event.get('cwd')
    reason = denial(command, cwd if isinstance(cwd, str) and cwd else os.getcwd())
    if reason:
        print(reason.format(command=command), file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
