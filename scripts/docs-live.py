import concurrent.futures
import importlib.util
import json
import re
from pathlib import Path, PurePosixPath
from urllib.parse import urljoin
from urllib.request import Request, urlopen

import yaml

root = Path(__file__).resolve().parent.parent


def read_url(url):
    with urlopen(Request(url, headers={'Cache-Control': 'no-cache'}), timeout=25) as response:
        assert response.status == 200, f'Unexpected response: {url} ({response.status})'
        return response.read()


def verify(base, staging, read=read_url):
    expected = json.loads((staging / 'docs-sources.json').read_text())
    manifest = json.loads(read(urljoin(base, 'docs-sources.json')))
    assert manifest == expected, 'Published sources do not match this checkout; check the publish gate and selected revision'
    pages = [item['path'] for item in expected['sources'] if item['path'].endswith('.md')]

    def check_page(name):
        assert read(urljoin(base, name)) == (staging / name).read_bytes(), f'Missing or stale Markdown: {name}'
        path = PurePosixPath(name)
        location = str(path.parent).strip('.') + '/' if path.name in ['index.md', 'README.md'] else name.removesuffix('.md') + '/'
        assert b'zensical-' in read(urljoin(base, location.lstrip('/'))), f'Missing Zensical page: {name}'

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(check_page, pages))
    index = read(urljoin(base, 'llms.txt')).decode()
    bundle = read(urljoin(base, 'llms-full.txt')).decode()
    assert expected['revision'] in bundle, 'Published reading bundle has a stale revision'
    links = re.findall(r'\]\(([^\s)]+)', index)
    assert links, 'The machine reading index is empty'
    for target in links:
        assert target.startswith(base), f'Machine index leaves the site: {target}'
        assert read(target), f'Machine index target is empty: {target}'
    spec = importlib.util.spec_from_file_location('docs_output', root / 'scripts/docs-output.py')
    output = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(output)
    search = json.loads(read(urljoin(base, 'search.json')))
    assert search['items'] and not any(output.historical(item['location']) for item in search['items']), 'Published search includes history or is empty'
    pagefind = json.loads(read(urljoin(base, 'pagefind/pagefind-entry.json')))
    count = sum(language['page_count'] for language in pagefind['languages'].values())
    assert count == sum(not output.historical(page) for page in pages), 'Pagefind page count disagrees with the maintained reading scope'
    return {'revision': expected['revision'], 'human_pages': len(pages), 'markdown_pages': len(pages), 'source_hashes': len(manifest['sources']), 'machine_index_links': len(links), 'pagefind_pages': count}


if __name__ == '__main__':
    base = yaml.safe_load((root / 'mkdocs.yml').read_text())['site_url']
    print(json.dumps(verify(base, root / '.build/docs')))
