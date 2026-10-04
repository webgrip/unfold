import json
import re
import shlex
import sys

REASON = (
    'Blocked: {command!r} stages the whole tree. Several sessions share this checkout, so a '
    'whole-tree add or commit absorbs other sessions\' uncommitted work under your message. '
    'Stage explicit paths instead: git add <file> ..., then git commit without -a.'
)
SEPARATORS = {'&&', '||', ';', '|', '&', '\n', '(', ')'}
GIT_OPTIONS_WITH_VALUE = {'-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env'}
WHOLE_TREE_PATHSPECS = {'.', './', ':/', ':/.', ':(top)'}
COMMIT_OPTIONS_WITH_VALUE = set('mFCctS')
FALLBACK = re.compile(r'\bgit\b[^;&|\n]*?\b(?:add\s+(?:[^;&|\n]*\s)?(?:-A|--all|\.)(?=\s|$)|commit\s+(?:[^;&|\n]*\s)?(?:-[A-Za-z]*a[A-Za-z]*|--all)(?=\s|$))')


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


def git_subcommand(words):
    for index, word in enumerate(words):
        if word == 'git' or word.endswith('/git'):
            rest = words[index + 1:]
            position = 0
            while position < len(rest) and rest[position].startswith('-'):
                position += 2 if rest[position] in GIT_OPTIONS_WITH_VALUE else 1
            if position < len(rest):
                return rest[position], rest[position + 1:]
    return None, []


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


def denied(command):
    try:
        parsed = list(segments(command))
    except ValueError:
        return bool(FALLBACK.search(command))
    for words in parsed:
        subcommand, arguments = git_subcommand(words)
        if subcommand == 'add' and stages_whole_tree(arguments):
            return True
        if subcommand == 'commit' and commits_all(arguments):
            return True
    return False


def main():
    try:
        event = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0
    if event.get('tool_name') != 'Bash':
        return 0
    command = (event.get('tool_input') or {}).get('command') or ''
    if denied(command):
        print(REASON.format(command=command), file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
