import argparse
import datetime
import importlib.util
from pathlib import Path

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('docs_rules', root / 'scripts/docs-rules.py')
rules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rules)


def current_pages(base=root):
    pages = {}
    for folder, prefix in rules.SOURCE_ROOTS:
        for path in sorted((base / folder).rglob('*.md')):
            staged = (Path(prefix) / path.relative_to(base / folder)).as_posix()
            if not rules.historical(staged):
                pages[path.relative_to(base).as_posix()] = path.read_text()
    return pages


def report(pages, today, days):
    found = rules.stale(pages, today, days)
    lines = []
    if found:
        lines.append(f'warning: {len(found)} current page(s) were last verified more than {days} days before {today}; re-verify them and update last_verified and verified_by:')
        lines += [f'  {page}: last_verified {verified} ({age} days)' for page, verified, age in found]
    else:
        lines.append(f'Glide docs: no current page was last verified more than {days} days before {today}.')
    marked = rules.unverified(pages)
    if marked:
        lines.append(f'warning: {len(marked)} current page(s) are marked unverified; verify them, then replace unverified with last_verified and verified_by:')
        lines += [f'  {page}: {reason}' for page, reason in marked]
    return '\n'.join(lines)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='List current documentation pages whose last_verified date is old. Reports only; always exits 0.')
    parser.add_argument('--days', type=int, default=rules.STALE_DAYS)
    parser.add_argument('--today', type=datetime.date.fromisoformat, default=datetime.date.today())
    args = parser.parse_args()
    print(report(current_pages(), args.today, args.days))
