import json
import os
import re
import subprocess
import sys
import tomllib
from pathlib import Path, PurePosixPath

ROOT_WORD_LIMIT = 400
APPLICATION_WORD_LIMIT = 600
PROJECT_DOC_MAX_BYTES = 32 * 1024
DUPLICATE_MIN_WORDS = 8
INVISIBLE = re.compile(r'[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]')
AGENT_FILE_NAMES = {'AGENTS.md', 'CLAUDE.md', '.cursorrules'}
AGENT_DIRECTORIES = {'.claude', '.agents', '.openhands'}
FENCE = re.compile(r'^[ \t]*(`{3,}|~{3,})[^\n]*\n.*?^[ \t]*\1[^\n]*$', re.M | re.S)
CODE_SPAN = re.compile(r'(`+)(.+?)\1', re.S)
INLINE_LINK = re.compile(r'!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)')
REFERENCE_LINK = re.compile(r'^[ \t]{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+.*)?$', re.M)
PATH_TOKEN = re.compile(r'^[A-Za-z0-9._@-]*(?:/[A-Za-z0-9._@-]+)+/?$|^[A-Za-z0-9._@-]+/$')
MISE_RUN = re.compile(r'\bmise\s+(?:(?:-C|--cd)\s+(\S+)\s+)?run\s+([A-Za-z0-9_:.\-]+)')
NPM_RUN = re.compile(r'\bnpm\s+(?:(?:--prefix|-C)\s+(\S+)\s+)?run(?:-script)?\s+([A-Za-z0-9_:.\-]+)')
BLOCK_START = re.compile(r'^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>)')
SENTENCE_END = re.compile(r'(?<=[.!?])\s+')


def failure(path, check, message):
    return f'{path}: [{check}] {message}'


def agents_files(files):
    return sorted(name for name in files if PurePosixPath(name).name == 'AGENTS.md')


def is_root(name):
    return name == 'AGENTS.md'


def words(text):
    return len(text.split())


def chain(name, agents):
    parts = PurePosixPath(name).parent.parts
    candidates = ['AGENTS.md', *('/'.join(parts[:depth]) + '/AGENTS.md' for depth in range(1, len(parts) + 1))]
    return [candidate for candidate in candidates if candidate in agents]


def check_budget(root, agents):
    failures = []
    for name in agents:
        text = (root / name).read_text(encoding='utf-8')
        limit = ROOT_WORD_LIMIT if is_root(name) else APPLICATION_WORD_LIMIT
        count = words(text)
        if count > limit:
            scope = 'root' if is_root(name) else 'application'
            failures.append(failure(name, 'budget', f'{count} words; the {scope} limit is {limit}. Move detail into linked docs and keep only rules an agent must hold in context.'))
        path = chain(name, set(agents))
        total = sum((root / part).stat().st_size for part in path)
        if total > PROJECT_DOC_MAX_BYTES:
            failures.append(failure(name, 'budget', f'{total} bytes along {" -> ".join(path)}; Codex truncates project docs beyond {PROJECT_DOC_MAX_BYTES} bytes (project_doc_max_bytes).'))
    return failures


def prose(text):
    return FENCE.sub('', text)


def without_code_spans(text):
    return CODE_SPAN.sub('', text)


def link_targets(text):
    body = without_code_spans(prose(text))
    return [*INLINE_LINK.findall(body), *REFERENCE_LINK.findall(body)]


def is_external(target):
    return bool(re.match(r'^[A-Za-z][A-Za-z0-9+.-]*:', target)) or target.startswith('//')


def exists(root, candidate):
    try:
        resolved = candidate.resolve()
    except OSError:
        return False
    return resolved.is_relative_to(root.resolve()) and (candidate.exists() or candidate.is_symlink())


def check_links(root, agents):
    failures = []
    for name in agents:
        text = (root / name).read_text(encoding='utf-8')
        base = (root / name).parent
        for target in link_targets(text):
            if is_external(target) or target.startswith('#'):
                continue
            path = target.split('#', 1)[0].split('?', 1)[0]
            if not path:
                continue
            candidate = root / path.lstrip('/') if path.startswith('/') else base / path
            if not exists(root, candidate):
                failures.append(failure(name, 'links', f'link target {target!r} does not exist; fix the path relative to {PurePosixPath(name).parent}/.'))
        for span in {match.group(2).strip() for match in CODE_SPAN.finditer(prose(text))}:
            if not PATH_TOKEN.match(span) or span.startswith(('-', '/')):
                continue
            first = span.split('/', 1)[0]
            bases = [base, root]
            anchored = [folder for folder in bases if first in {'.', '..'} or (folder / first).exists()]
            if not anchored:
                continue
            if not any(exists(root, folder / span) for folder in anchored):
                failures.append(failure(name, 'links', f'backticked path `{span}` does not exist relative to {PurePosixPath(name).parent}/ or the repository root.'))
    return failures


def mise_tasks(path):
    if not path.is_file():
        return set()
    return set(tomllib.loads(path.read_text(encoding='utf-8')).get('tasks', {}))


def nearest(root, directory, filename):
    current = directory
    while True:
        if (current / filename).is_file():
            return current / filename
        if current == root:
            return None
        current = current.parent


def npm_scripts(path):
    if path is None or not path.is_file():
        return None
    return set(json.loads(path.read_text(encoding='utf-8')).get('scripts', {}))


def check_commands(root, agents):
    failures = []
    for name in agents:
        text = (root / name).read_text(encoding='utf-8')
        base = (root / name).parent
        for directory, task in MISE_RUN.findall(text):
            folder = (base / directory) if directory else base
            local = nearest(root, folder, 'mise.toml')
            known = mise_tasks(root / 'mise.toml') | (mise_tasks(local) if local else set())
            if task not in known:
                where = ' or '.join(sorted({str(PurePosixPath(os.path.relpath(path, root))) for path in [local, root / 'mise.toml'] if path}))
                failures.append(failure(name, 'commands', f'`mise run {task}` names no task in {where}; add [tasks.{task}] or correct the name.'))
        for prefix, script in NPM_RUN.findall(text):
            if prefix:
                folder = base / prefix if (base / prefix).is_dir() else root / prefix
                manifest = folder / 'package.json'
            else:
                manifest = nearest(root, base, 'package.json')
            scripts = npm_scripts(manifest)
            command = f'npm {"--prefix " + prefix + " " if prefix else ""}run {script}'
            if scripts is None:
                failures.append(failure(name, 'commands', f'`{command}` has no package.json to run in.'))
            elif script not in scripts:
                failures.append(failure(name, 'commands', f'`{command}` names no script in {PurePosixPath(os.path.relpath(manifest, root))}; add it to "scripts" or correct the name.'))
    return failures


def check_bridge(root, agents, files):
    failures = []
    for name in agents:
        folder = PurePosixPath(name).parent
        bridge = str(folder / 'CLAUDE.md') if str(folder) != '.' else 'CLAUDE.md'
        path = root / bridge
        fix = f'run `ln -s AGENTS.md {bridge}` or write a CLAUDE.md whose first line is @AGENTS.md, then git add {bridge}.'
        if bridge not in files or not (path.exists() or path.is_symlink()):
            failures.append(failure(bridge, 'bridge', f'missing beside {name}; {fix}'))
            continue
        if path.is_symlink():
            if os.readlink(path) != 'AGENTS.md':
                failures.append(failure(bridge, 'bridge', f'symlink points to {os.readlink(path)!r}, not AGENTS.md; {fix}'))
            continue
        lines = [line.strip() for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]
        if not lines or lines[0] != '@AGENTS.md':
            failures.append(failure(bridge, 'bridge', f'first non-empty line is {lines[0] if lines else "(empty)"!r}, not @AGENTS.md; {fix}'))
    return failures


def agent_instruction_file(name):
    path = PurePosixPath(name)
    return path.name in AGENT_FILE_NAMES or any(part in AGENT_DIRECTORIES for part in path.parts[:-1])


def check_unicode(root, files):
    failures = []
    for name in sorted(filter(agent_instruction_file, files)):
        path = root / name
        if path.is_symlink() or not path.is_file():
            continue
        text = path.read_bytes().decode('utf-8', errors='replace')
        for number, line in enumerate(text.splitlines(), 1):
            for match in INVISIBLE.finditer(line):
                failures.append(failure(name, 'unicode', f'line {number} column {match.start() + 1} contains invisible U+{ord(match.group()):04X}; delete it (it can hide instructions from reviewers).'))
    return failures


def sentences(text):
    blocks, current = [], []
    for line in prose(text).splitlines():
        if not line.strip() or BLOCK_START.match(line):
            if current:
                blocks.append(' '.join(current))
            current = [] if not line.strip() else [re.sub(r'^\s*(?:#{1,6}|[-*+]|\d+[.)]|>)\s*', '', line)]
            continue
        current.append(line)
    if current:
        blocks.append(' '.join(current))
    found = set()
    for block in blocks:
        for sentence in SENTENCE_END.split(block):
            normalized = ' '.join(sentence.split())
            if words(normalized) >= DUPLICATE_MIN_WORDS:
                found.add(normalized)
    return found


def check_duplication(root, agents):
    if 'AGENTS.md' not in agents:
        return []
    shared = sentences((root / 'AGENTS.md').read_text(encoding='utf-8'))
    failures = []
    for name in agents:
        if is_root(name):
            continue
        for sentence in sorted(shared & sentences((root / name).read_text(encoding='utf-8'))):
            failures.append(failure(name, 'duplication', f'repeats a root AGENTS.md sentence; agents already load the root file, so delete it here: "{sentence}"'))
    return failures


def check(root, files):
    root = Path(root)
    files = set(files)
    agents = agents_files(files)
    return [
        *check_budget(root, agents),
        *check_links(root, agents),
        *check_commands(root, agents),
        *check_bridge(root, agents, files),
        *check_unicode(root, files),
        *check_duplication(root, agents),
    ]


def tracked(root):
    listing = subprocess.run(['git', 'ls-files', '-z'], cwd=root, check=True, capture_output=True).stdout.decode()
    return [name for name in listing.split('\0') if name]


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
    files = tracked(root)
    failures = check(root, files)
    agents = agents_files(files)
    if failures:
        print(f'Agent instruction files: {len(failures)} failure(s) across {len(agents)} AGENTS.md file(s)', file=sys.stderr)
        for line in failures:
            print(f'  {line}', file=sys.stderr)
        sys.exit(1)
    print(f'Agent instruction files: {len(agents)} AGENTS.md file(s) pass budget, links, commands, bridge, unicode and duplication checks')


if __name__ == '__main__':
    main()
