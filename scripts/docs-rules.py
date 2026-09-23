import html
import re
import unicodedata
from urllib.parse import unquote, urlsplit

HISTORY_PARTS = {'research', 'evidence', 'adr', 'adrs', 'design', 'openspec'}
PARKED_PARTS = {'brand'}
CURRENT_POLICY_PAGES = {'TRADEMARK'}
HISTORY_PREFIXES = (
    'landscape/bottlenecks',
    'landscape/c4',
    'landscape/components',
    'landscape/index',
    'migration-proposal',
    'vloer/PRODUCT-DESIGN',
    'vloer/contracts/implementation',
    'vloer/operations/backlog',
    'vloer/operations/implementation-progress',
    'vloer/operations/iteration-',
    'vloer/product/go-to-market',
    'ploeg/backlog',
)
FENCE = re.compile(r'^[ \t]*(`{3,}|~{3,})[^\n]*\n.*?^[ \t]*\1[^\n]*$', re.M | re.S)
FRONT_MATTER = re.compile(r'\A---\n(.*?\n)?---\n', re.S)
DATE = re.compile(r'(\d{4}-\d{2}-\d{2})')


def historical(location):
    """Return whether a published path is a record rather than current guidance.

    Accepts staged Markdown paths, site locations and search-index locations.
    """
    path = unquote(urlsplit(location).path).lstrip('/')
    if path.startswith(HISTORY_PREFIXES):
        return True
    page = re.sub(r'(/|/index\.html|\.html|\.md)$', '', path)
    parts = [part for part in page.split('/') if part]
    if parts and parts[-1] in {'index', 'README'}:
        parts.pop()
        if parts and parts[-1] in {'adr', 'adrs'}:
            return False
    elif parts and parts[-1] in {'adr', 'adrs'} and not path.endswith('.md'):
        return False
    if any(part in PARKED_PARTS for part in parts) and parts[-1] not in CURRENT_POLICY_PAGES:
        return True
    return any(part in HISTORY_PARTS for part in parts)


def slug(text):
    """Return the Python-Markdown toc slug for a heading's source text."""
    text = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', text)
    text = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = html.unescape(text.replace('`', '').replace('**', '').replace('*', ''))
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    text = re.sub(r'[^\w\s-]', '', text).strip().lower()
    return re.sub(r'[-\s]+', '-', text)


def anchors(markdown):
    """Return every fragment a rendered page accepts: heading slugs, attribute ids and HTML ids."""
    body = FENCE.sub('', FRONT_MATTER.sub('', markdown))
    found = set(re.findall(r'''\b(?:id|name)=["']([^"']+)["']''', body))
    counts = {}
    for heading in re.findall(r'^#{1,6}[ \t]+(.+?)[ \t#]*$', body, flags=re.M):
        explicit = re.search(r'\{[^}]*#([\w-]+)[^}]*\}\s*$', heading)
        if explicit:
            found.add(explicit[1])
            continue
        base = slug(heading)
        candidate = base
        while candidate in counts or candidate in found:
            counts[base] = counts.get(base, 0) + 1
            candidate = f'{base}_{counts[base]}'
        counts[candidate] = 0
        found.add(candidate)
    return {re.sub('-+', '-', anchor) for anchor in found}


def record_date(relative, markdown):
    """Return the most specific date a record carries, or None."""
    front = FRONT_MATTER.match(markdown)
    if front:
        match = re.search(r'^date:\s*["\']?(\d{4}-\d{2}-\d{2})', front[1] or '', re.M)
        if match:
            return match[1]
    match = DATE.search(relative.rsplit('/', 1)[-1]) or DATE.search(relative)
    if match:
        return match[1]
    match = re.search(r'^(?:\*\s*)?Date:\s*(\d{4}-\d{2}-\d{2})', markdown[:2000], re.M)
    return match[1] if match else None


def mark_history(markdown, relative):
    """Exclude a record from search and label it as history, leaving its content unchanged."""
    date = record_date(relative, markdown)
    banner = f'> Record from {date}; not current guidance.\n' if date else '> Record; not current guidance.\n'
    front = FRONT_MATTER.match(markdown)
    if front:
        header = front[1] or ''
        if not re.search(r'^search:', header, re.M):
            header += 'search:\n  exclude: true\n'
        body = markdown[front.end():]
    else:
        header, body = 'search:\n  exclude: true\n', markdown
    heading = re.search(r'^# .+\n', FENCE.sub(lambda m: '\n' * m[0].count('\n'), body), re.M)
    if heading and not body[:heading.start()].strip():
        body = body[:heading.end()] + '\n' + banner + ('' if body[heading.end():].startswith('\n') else '\n') + body[heading.end():]
    else:
        body = banner + '\n' + body
    return f'---\n{header}---\n{body}'


def nav_pages(nav):
    """Return the Markdown paths listed in a mkdocs nav tree."""
    if isinstance(nav, str):
        return {nav} if nav.endswith('.md') else set()
    if isinstance(nav, list):
        return set().union(*(nav_pages(item) for item in nav)) if nav else set()
    if isinstance(nav, dict):
        return set().union(*(nav_pages(item) for item in nav.values())) if nav else set()
    return set()


def orphans(pages, nav, links):
    """Return current pages that are neither in the nav nor linked from a nav page.

    `links` maps a staged page to the staged pages it links to.
    """
    reachable = set(nav)
    for page in nav:
        reachable |= links.get(page, set())
    return sorted(page for page in pages if not historical(page) and page not in reachable)
