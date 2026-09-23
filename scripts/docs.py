import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit, urlunsplit

import importlib.util

import yaml

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('docs_rules', root / 'scripts/docs-rules.py')
rules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rules)
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
parser.add_argument('--stage-only', action='store_true')
parser.add_argument('--domain', action='store_true')
args = parser.parse_args()
domain_models = ['docs/domain', 'apps/ploeg/docs/domain']
glossary = 'docs/reference/glossary.md'


def generate_domain(folder, out):
    subprocess.run([sys.executable, str(root / 'scripts/generate-domain.py'), str(root / folder / 'model.yaml'), '--out', str(out)], cwd=root, check=True, stdout=subprocess.DEVNULL)


def combined_glossary():
    return subprocess.run([sys.executable, str(root / 'scripts/generate-domain.py'), '--glossary', glossary, '--stdout', *[f'{folder}/model.yaml' for folder in domain_models]], cwd=root, check=True, capture_output=True, text=True).stdout


if args.domain:
    for folder in domain_models:
        generate_domain(folder, root / folder)
    (root / glossary).parent.mkdir(parents=True, exist_ok=True)
    (root / glossary).write_text(combined_glossary())
    print(f'Glide domain: {len(domain_models)} models and {glossary}')
    sys.exit()
staging = root / '.build/docs'
site = root / '.build/site'
revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
source_url = f'https://forgejo.webgrip.dev/webgrip/glide/src/commit/{revision}/'

if args.check:
    for test in ['docs-output.test.py', 'docs-live.test.py', 'docs-rules.test.py', 'docs-decisions.test.py', 'docs-configuration.test.py', 'docs-adr.test.py', 'agents-files.test.py', 'stage-explicit-paths.test.py']:
        subprocess.run([sys.executable, str(root / 'scripts' / test)], check=True)
    for folder in domain_models:
        with tempfile.TemporaryDirectory(prefix='glide-domain-') as temporary:
            generate_domain(folder, temporary)
            for generated in Path(temporary).glob('*.md'):
                assert generated.read_bytes() == (root / folder / generated.name).read_bytes(), f'Stale generated domain view: {folder}/{generated.name}; run mise run domain'
    assert (root / glossary).exists() and (root / glossary).read_text() == combined_glossary(), f'Stale combined glossary: {glossary}; run mise run domain'
    for name, expected in json.loads((root / 'docs/landscape/generated-sources.json').read_text()).items():
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected, f'Stale landscape: {name}; rebuild with node apps/vloer/scripts/build-landscape.mjs'
    for ledger in ['docs/adr', 'apps/ploeg/docs/adrs', 'apps/vloer/docs/adrs']:
        subprocess.run([sys.executable, str(root / 'scripts/validate_adr_consistency.py'), str(root), '--adr-dir', ledger], check=True)
    subprocess.run([sys.executable, str(root / 'scripts/docs-decisions.py'), '--check'], check=True)
    subprocess.run([sys.executable, str(root / 'scripts/docs-configuration.py'), '--check'], check=True)
    subprocess.run([sys.executable, str(root / 'scripts/agents-files.py')], check=True)

if staging.exists():
    shutil.rmtree(staging)
staging.mkdir(parents=True)
roots = [(root / 'docs', ''), (root / 'apps/vloer/docs', 'vloer'), (root / 'apps/ploeg/docs', 'ploeg')]
mapping = {}
for directory, prefix in roots:
    for path in directory.rglob('*'):
        if path.is_file() and '__pycache__' not in path.parts and not path.name.endswith('.template.html') and path.name != 'adr-0000-template.md':
            mapping[path] = Path(prefix) / path.relative_to(directory)

mapping[root / 'llms.txt'] = Path('llms.txt')

aliases = {root / entry['from']: root / entry['to'] for entry in json.loads((root / 'docs/research/2026-09-12-glide-document-paths.json').read_text())['moves']}
failures = []
anchor_failures = []
detours = []
line_anchors = []
links = {}
anchor_cache = {}
checked = 0


def page_anchors(path):
    if path not in anchor_cache:
        anchor_cache[path] = rules.anchors(path.read_text())
    return anchor_cache[path]


def check_anchor(destination, fragment, source, target):
    if fragment and destination.suffix == '.md' and re.sub('-+', '-', unquote(fragment)) not in page_anchors(destination):
        anchor_failures.append(f'{source.relative_to(root)}: {target}')


def target_url(target, source):
    global checked
    parts = urlsplit(target)
    destination = None
    for slug, app in [('de-vloer', 'vloer'), ('ploeg', 'ploeg')]:
        old = f'https://forgejo.webgrip.dev/webgrip/{slug}/src/branch/development/'
        if target.startswith(old):
            destination = root / 'apps' / app / unquote(urlsplit(target[len(old):]).path)
    if destination is None:
        if not parts.scheme and not parts.netloc and not parts.path and parts.fragment and source.suffix == '.md':
            check_anchor(source, parts.fragment, source, target)
        if parts.scheme or parts.netloc or not parts.path or parts.path.startswith('/'):
            return target
        destination = source.parent / unquote(parts.path)
    destination = destination.resolve()
    if destination in aliases and not rules.historical(mapping[source].as_posix()):
        detours.append(f'{source.relative_to(root)}: {target} -> {aliases[destination].relative_to(root)}')
    destination = aliases.get(destination, destination)
    if re.fullmatch(r'L\d+(-L\d+)?', parts.fragment) and destination.suffix != '.md' and not rules.historical(mapping[source].as_posix()):
        line_anchors.append(f'{source.relative_to(root)}: {target}')
    if not destination.is_relative_to(root):
        return target
    checked += 1
    if not destination.exists():
        failures.append(f'{source.relative_to(root)}: {target}')
        return target
    if destination.is_dir():
        for index in ['index.md', 'README.md', 'index.html']:
            if (destination / index).exists():
                destination /= index
                break
    check_anchor(destination, parts.fragment, source, target)
    if destination in mapping:
        links.setdefault(mapping[source].as_posix(), set()).add(mapping[destination].as_posix())
        result = os.path.relpath(mapping[destination], mapping[source].parent)
        return urlunsplit(('', '', quote(result), parts.query, re.sub('-+', '-', parts.fragment)))
    return source_url + quote(destination.relative_to(root).as_posix()) + (f'#{parts.fragment}' if parts.fragment else '')


def rewrite(markdown, source):
    chunks = re.split(r'(^[ \t]*`{3,}[^\n]*\n.*?^[ \t]*`{3,}[^\n]*$|^[ \t]*~{3,}[^\n]*\n.*?^[ \t]*~{3,}[^\n]*$|`+[^`\n]*`+)', markdown, flags=re.M | re.S)
    for index in range(0, len(chunks), 2):
        chunks[index] = re.sub(r'(\]\(<?)([^\s)>]+)(>?(?:\s+["\'][^\n]*?["\'])?\))', lambda m: m[1] + target_url(m[2], source) + m[3], chunks[index])
        chunks[index] = re.sub(r'(^[ \t]*\[[^\]]+\]:[ \t]*<?)([^\s>]+)', lambda m: m[1] + target_url(m[2], source), chunks[index], flags=re.M)
    return ''.join(chunks)


for source, relative in mapping.items():
    output = staging / relative
    output.parent.mkdir(parents=True, exist_ok=True)
    if source.suffix == '.md':
        markdown = rewrite(source.read_text(), source)
        output.write_text(rules.mark_history(markdown, relative.as_posix()) if rules.historical(relative.as_posix()) else markdown)
    else:
        shutil.copyfile(source, output)
if failures:
    raise SystemExit('Missing documentation targets:\n' + '\n'.join(sorted(set(failures))))
if anchor_failures:
    raise SystemExit('Missing heading anchors:\n' + '\n'.join(sorted(set(anchor_failures))))
if line_anchors:
    raise SystemExit('Current pages link source lines, which drift; link the file or symbol instead:\n' + '\n'.join(sorted(set(line_anchors))))
if detours:
    raise SystemExit('Current pages link through moved paths; link the target directly:\n' + '\n'.join(sorted(set(detours))))
nav = rules.nav_pages(yaml.safe_load((root / 'mkdocs.yml').read_text())['nav'])
redirect_pages = {mapping[source] for source in aliases if source in mapping}
unlinked = rules.orphans([relative.as_posix() for relative in mapping.values() if relative.suffix == '.md' and relative not in redirect_pages], nav, links)
if unlinked:
    raise SystemExit('Current pages missing from the nav and from every nav page:\n' + '\n'.join(unlinked))
(staging / 'llms.txt').write_text(rewrite((root / 'llms.txt').read_text(), root / 'llms.txt'))
if failures:
    raise SystemExit('Missing index targets:\n' + '\n'.join(sorted(set(failures))))
(staging / 'docs-sources.json').write_text(json.dumps({
    'revision': revision,
    'sources': [{'source': source.relative_to(root).as_posix(), 'path': relative.as_posix(), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()} for source, relative in sorted(mapping.items())],
}, indent=2) + '\n')
print(f'Glide docs: {len(mapping)} sources, {checked} repository links')
if not args.stage_only:
    subprocess.run([sys.executable, '-m', 'mkdocs', 'build', '--strict', '--config-file', str(root / 'mkdocs.yml')], cwd=root, check=True)
    subprocess.run([sys.executable, str(root / 'scripts/docs-output.py'), '--site', str(site)], cwd=root, check=True)
