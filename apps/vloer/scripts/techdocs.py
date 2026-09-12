import json
import re
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit, urlunsplit
from mkdocs.plugins import event_priority


historical_pages = set()
source_docs_dir = None


def source_url(target, source_path, docs_dir, repo_url):
    parts = urlsplit(target)
    if parts.scheme or parts.netloc or not parts.path or parts.path.startswith('/'):
        return target
    destination = (source_path.parent / unquote(parts.path)).resolve()
    root = docs_dir.parent.parent.parent
    if not destination.is_relative_to(root) or not destination.exists():
        return target
    published = destination.is_relative_to(docs_dir)
    if destination.is_dir():
        published = published and any((destination / name).is_file() for name in ('index.md', 'README.md', 'index.html'))
    if published:
        return target
    path = quote(destination.relative_to(root).as_posix())
    return urlunsplit(('', '', f'{repo_url}/src/branch/development/{path}', parts.query, parts.fragment))


def rewrite_links(markdown, source_path, docs_dir, repo_url):
    chunks = re.split(r'(^[ \t]*`{3,}[^\n]*\n.*?^[ \t]*`{3,}[^\n]*$|^[ \t]*~{3,}[^\n]*\n.*?^[ \t]*~{3,}[^\n]*$|`+[^`\n]*`+)', markdown, flags=re.M | re.S)
    for index in range(0, len(chunks), 2):
        chunks[index] = re.sub(r'(\]\(<?)([^\s)>]+)(>?(?:\s+["\'][^\n]*?["\'])?\))', lambda match: match[1] + source_url(match[2], source_path, docs_dir, repo_url) + match[3], chunks[index])
        chunks[index] = re.sub(r'(^[ \t]*\[[^\]]+\]:[ \t]*<?)([^\s>]+)', lambda match: match[1] + source_url(match[2], source_path, docs_dir, repo_url), chunks[index], flags=re.M)
    return ''.join(chunks)


@event_priority(100)
def on_config(config):
    global source_docs_dir
    source_docs_dir = Path(config['docs_dir']).resolve()


def on_pre_build(config):
    historical_pages.clear()


def on_page_markdown(markdown, page, config, files):
    source = page.file.src_uri
    if source.startswith(('design/', 'research/', 'adrs/')) or source in ('PRODUCT-DESIGN.md', 'contracts/implementation.md'):
        historical_pages.add(page.url)
    return rewrite_links(markdown, source_docs_dir / source, source_docs_dir, config['repo_url'].rstrip('/'))


@event_priority(-100)
def on_post_build(config):
    path = Path(config['site_dir']) / 'search/search_index.json'
    index = json.loads(path.read_text())
    index['docs'] = [entry for entry in index['docs'] if entry['location'].split('#')[0] not in historical_pages]
    path.write_text(json.dumps(index, ensure_ascii=False))
