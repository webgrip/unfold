import argparse
import importlib.util
import json
import re
import shutil
from pathlib import Path
from urllib.parse import urljoin

import yaml


spec = importlib.util.spec_from_file_location('docs_rules', Path(__file__).with_name('docs-rules.py'))
rules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rules)
historical = rules.historical


def absolute_links(markdown, url):
    chunks = re.split(r'(^[ \t]*`{3,}[^\n]*\n.*?^[ \t]*`{3,}[^\n]*$|^[ \t]*~{3,}[^\n]*\n.*?^[ \t]*~{3,}[^\n]*$|`+[^`\n]*`+)', markdown, flags=re.M | re.S)
    for i in range(0, len(chunks), 2):
        chunks[i] = re.sub(r'(\]\(<?)([^\s)>]+)', lambda match: match[1] + urljoin(url, match[2]), chunks[i])
        chunks[i] = re.sub(r'(^[ \t]*\[[^\]]+\]:[ \t]*<?)([^\s>]+)', lambda match: match[1] + urljoin(url, match[2]), chunks[i], flags=re.M)
    return ''.join(chunks)


def validate(site, staging):
    sources = json.loads((staging / 'docs-sources.json').read_text())
    assert re.fullmatch('[a-f0-9]{40}', sources['revision']), 'Missing source revision'
    for path in staging.rglob('*.md'):
        output = site / path.relative_to(staging)
        assert output.is_file() and output.read_text() == path.read_text(), f'Missing or stale Markdown: {output}'
    for name in ['index.html', 'vloer/index.html', 'ploeg/index.html', 'llms.txt', 'llms-full.txt', 'docs-sources.json']:
        assert (site / name).is_file() and (site / name).stat().st_size, f'Missing output: {name}'
    assert json.loads((site / 'docs-sources.json').read_text()) == sources, 'Mismatched source manifest'
    base = yaml.safe_load((staging.parents[1] / 'mkdocs.yml').read_text())['site_url']
    for target in re.findall(r'\]\(([^\s)]+)', (site / 'llms.txt').read_text()):
        assert target.startswith(base), f'Index link escapes site: {target}'
        assert (site / target.removeprefix(base).split('#')[0]).is_file(), f'Broken machine index link: {target}'
    assert sources['revision'] in (site / 'llms-full.txt').read_text(), 'Missing bundle provenance'
    index_path = site / 'search/search_index.json'
    if index_path.exists():
        assert not any(historical(entry['location']) for entry in json.loads(index_path.read_text())['docs']), 'History leaked into search'
    zensical_index = site / 'search.json'
    if zensical_index.exists():
        assert not any(historical(entry['location']) for entry in json.loads(zensical_index.read_text())['items']), 'History leaked into Zensical search'
    redirects = staging / 'research/2026-09-12-docs-cutover.json'
    if redirects.exists():
        for redirect in json.loads(redirects.read_text())['redirects']:
            target = redirect['to'].removeprefix('/glide/')
            assert target != redirect['to'], f'Legacy redirect leaves Glide: {redirect}'
            target += 'index.html' if target.endswith('/') else ''
            assert (site / target).is_file(), f'Missing legacy redirect target: {redirect}'
    return sources


def finalize(site, staging):
    config = yaml.safe_load((staging.parents[1] / 'mkdocs.yml').read_text())
    base = config['site_url']
    sources = json.loads((staging / 'docs-sources.json').read_text())
    for source in staging.rglob('*'):
        if source.is_file() and (source.suffix == '.md' or source.name in ['llms.txt', 'docs-sources.json']):
            target = site / source.relative_to(staging)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
    index = absolute_links((staging / 'llms.txt').read_text(), base)
    (site / 'llms.txt').write_text(index)
    bundle = [f'# Glide current reading path\n\nSource revision: {sources["revision"]}\n\nThis bundle contains the pages selected by llms.txt. Decision history and research remain available through explicit links.\n']
    for target in dict.fromkeys(re.findall(r'\]\(([^\s)]+\.md)(?:#[^)]*)?\)', index)):
        assert target.startswith(base), target
        source = staging / target.removeprefix(base)
        assert not historical(source.relative_to(staging).as_posix()), f'Historical page in default bundle: {source}'
        bundle.append(f'\n---\n\nSource: {target}\n\n' + absolute_links(source.read_text(), target))
    (site / 'llms-full.txt').write_text(''.join(bundle))
    for page in site.rglob('*.html'):
        content = page.read_text()
        location = page.relative_to(site).as_posix()
        if location == '404.html' or historical(location):
            content = content.replace(' data-pagefind-body', '')
            content = re.sub(r'<(body|article)(?![^>]*data-pagefind-ignore)', r'<\1 data-pagefind-ignore', content)
        else:
            content = re.sub(r'<article(?![^>]*data-pagefind-body)', '<article data-pagefind-body', content, count=1)
        page.write_text(content)
    validate(site, staging)
    print(f'Validated human pages, {len(list(staging.rglob("*.md")))} Markdown pages and current reading bundle at {sources["revision"]}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--site', type=Path, required=True)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    staging = Path(__file__).resolve().parent.parent / '.build/docs'
    (validate if args.validate_only else finalize)(args.site, staging)
