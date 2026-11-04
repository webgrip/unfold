"""Check, render and list the agent-standards catalogue.

Usage:
  agent-standards.py check   [catalogue]
  agent-standards.py render  [catalogue] [out-dir]
  agent-standards.py stale   [catalogue] [out-dir]
  agent-standards.py ids     [catalogue]
"""

import re
import sys
from collections import defaultdict
from pathlib import Path

import yaml

root = Path(__file__).resolve().parent.parent
catalogue_dir = root / 'apps/unfold/docs/research/agent-standards'
catalogue_file = catalogue_dir / 'standards.yaml'

LAYERS = {
    'tool': 'Agent to tool and context',
    'agent-agent': 'Agent to agent',
    'discovery': 'Discovery, description and registries',
    'client-ui': 'Client, editor and UI',
    'definition': 'Agent definition, packaging and LLM APIs',
    'identity': 'Identity, delegation and authorization',
    'observability': 'Observability and audit',
    'security-supply-chain': 'Security and supply chain',
    'inference-infra': 'Inference and agent runtime infrastructure',
    'commerce': 'Commerce and payments',
    'web-content': 'Agents and the web: access, preferences, licensing',
    'governance': 'Governance, regulation and assurance',
}
GOVERNANCE = {'foundation', 'sdo', 'consortium', 'single-vendor', 'community', 'regulator'}
STATUS = {'draft', 'stabilising', 'stable', 'dormant', 'dead', 'merged', 'law'}
RADAR = ['adopt', 'trial', 'assess', 'hold']
EFFORT = {'S', 'M', 'L'}
MATURITY = {'idea', 'pattern', 'de-facto-convention', 'pre-standard', 'standardising'}
RENOVATE_KINDS = {'github-releases', 'github-tags', 'ietf-draft'}
WATCH_KINDS = RENOVATE_KINDS | {'changelog-page', 'rss'}
ID = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')
DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
WATCHLIST_ID = re.compile(r'^T\d+$')
RENOVATE_LINE = re.compile(
    r'\{kind: (?:github-releases|github-tags), ref: [^,\s]+, current: "[^"]+"\}'
    r'|\{kind: ietf-draft, ref: draft-[a-z0-9-]+, current: "\d+"\}'
)
PAGE_PREFIX = '../../../../../'


def load(path):
    return yaml.safe_load(Path(path).read_text())


def check(doc, base=root):
    errors = []
    standards = doc.get('standards') or []
    concepts = doc.get('concepts') or []
    seen = set()
    for entry in standards + concepts:
        sid = str(entry.get('id', ''))
        if not ID.match(sid):
            errors.append(f'{sid!r}: id is not kebab-case')
        if sid in seen:
            errors.append(f'{sid}: duplicate id')
        seen.add(sid)

    def use_cases(sid, cases):
        if not isinstance(cases, list) or len(cases) != 5:
            errors.append(f'{sid}: needs exactly 5 use_cases, has {len(cases or [])}')
            return
        for number, case in enumerate(cases, 1):
            for field in ('title', 'where', 'how', 'effort', 'value'):
                if not case.get(field):
                    errors.append(f'{sid}: use case {number} has no {field}')
            if case.get('effort') not in EFFORT:
                errors.append(f'{sid}: use case {number} effort {case.get("effort")!r} not in {sorted(EFFORT)}')

    def decisions(sid, paths):
        for path in paths or []:
            if not (base / str(path)).is_file():
                errors.append(f'{sid}: decision {path} does not exist')

    for standard in standards:
        sid = standard.get('id')
        for field, allowed in (('layer', LAYERS), ('governance', GOVERNANCE), ('status', STATUS), ('radar', RADAR)):
            if standard.get(field) not in allowed:
                errors.append(f'{sid}: {field} {standard.get(field)!r} not in {sorted(allowed)}')
        for field in ('name', 'steward', 'radar_reason', 'flip_trigger'):
            if not standard.get(field):
                errors.append(f'{sid}: {field} is empty')
        latest = standard.get('latest') or {}
        if latest.get('date') and not DATE.match(str(latest['date'])):
            errors.append(f'{sid}: latest.date {latest["date"]!r} is not YYYY-MM-DD')
        if not DATE.match(str(standard.get('reviewed', ''))):
            errors.append(f'{sid}: reviewed {standard.get("reviewed")!r} is not YYYY-MM-DD')
        for watch in standard.get('watch') or []:
            if watch.get('kind') not in WATCH_KINDS:
                errors.append(f'{sid}: watch kind {watch.get("kind")!r} not in {sorted(WATCH_KINDS)}')
            if not watch.get('ref'):
                errors.append(f'{sid}: watch entry without ref')
            if watch.get('kind') in RENOVATE_KINDS and not watch.get('current'):
                errors.append(f'{sid}: watch {watch.get("ref")} is a Renovate kind and needs current')
        for relation, ids in (standard.get('relations') or {}).items():
            for other in [ids] if isinstance(ids, str) else ids or []:
                if other and other not in seen:
                    errors.append(f'{sid}: relations.{relation} names unknown id {other!r}')
        for item in standard.get('watchlist') or []:
            if not WATCHLIST_ID.match(str(item)):
                errors.append(f'{sid}: watchlist entry {item!r} is not T<number>')
        decisions(sid, standard.get('decisions'))
        use_cases(sid, standard.get('use_cases'))

    for concept in concepts:
        cid = concept.get('id')
        if concept.get('maturity') not in MATURITY:
            errors.append(f'{cid}: maturity {concept.get("maturity")!r} not in {sorted(MATURITY)}')
        if concept.get('radar') not in RADAR:
            errors.append(f'{cid}: radar {concept.get("radar")!r} not in {RADAR}')
        for other in concept.get('related_standards') or []:
            if other not in seen:
                errors.append(f'{cid}: related_standards names unknown id {other!r}')
        if not DATE.match(str(concept.get('reviewed', ''))):
            errors.append(f'{cid}: reviewed {concept.get("reviewed")!r} is not YYYY-MM-DD')
        decisions(cid, concept.get('decisions'))
        use_cases(cid, concept.get('use_cases'))
    return errors


def check_watch_lines(text, doc):
    expected = sum(1 for standard in doc.get('standards') or [] for watch in standard.get('watch') or [] if watch.get('kind') in RENOVATE_KINDS)
    found = len(RENOVATE_LINE.findall(text))
    if found != expected:
        return [f'{expected} watch entries are of a Renovate kind but {found} lines match the Renovate regex; each must be one line {{kind: K, ref: R, current: "V"}}']
    return []


def cell(text):
    return str(text if text is not None else '').replace('|', '\\|').replace('\n', ' ').strip()


def link(text, url):
    return f'[{cell(text)}]({url})' if url else cell(text)


def decision_links(paths):
    return ', '.join(f'[{Path(path).stem}]({PAGE_PREFIX}{path})' for path in paths or []) or '—'


def names(ids, index):
    ids = [ids] if isinstance(ids, str) else ids or []
    rendered = []
    for other in ids:
        target = index.get(other)
        rendered.append(f'[{cell(target["name"])}]({target["layer"]}.md#{other})' if target else cell(other))
    return ', '.join(rendered) or '—'


def version(latest):
    return ' '.join(str(part) for part in (latest.get('version'), latest.get('date')) if part) or '—'


def render_cases(cases):
    lines = ['| Use case | Where | How | Effort | Value |', '| --- | --- | --- | --- | --- |']
    lines += [f'| {cell(case["title"])} | {cell(case["where"])} | {cell(case["how"])} | {case["effort"]} | {cell(case["value"])} |' for case in cases]
    return lines


def render_index(doc):
    standards = doc['standards']
    by_layer = defaultdict(list)
    for standard in standards:
        by_layer[standard['layer']].append(standard)
    lines = [
        '# Agent standards catalogue',
        '',
        'Generated by `mise run agent-standards` from [`standards.yaml`](standards.yaml); edit the catalogue, not this page.'
        ' The narrative is [the 2026-11-04 dossier](../2026-11-04-agent-standards-landscape.md), and the procedure is'
        ' [Keep the agent-standards catalogue current](../../../../../docs/how-to/keep-the-agent-standards-catalogue-current.md).',
        '',
        f'{len(standards)} standards in {len(by_layer)} layers and {len(doc.get("concepts") or [])} concepts.',
        '',
        '## Radar',
        '',
        'The ring is for Unfold today, not a verdict on the standard. Each entry says whether maturity or fit decided it, and what would move it.',
        '',
        '| Layer | ' + ' | '.join(ring.capitalize() for ring in RADAR) + ' |',
        '| --- |' + ' --- |' * len(RADAR),
    ]
    for layer, title in LAYERS.items():
        if layer not in by_layer:
            continue
        rings = {ring: [] for ring in RADAR}
        for standard in sorted(by_layer[layer], key=lambda entry: entry['name'].lower()):
            rings[standard['radar']].append(f'[{cell(standard["name"])}]({layer}.md#{standard["id"]})')
        lines.append(f'| [{title}]({layer}.md) | ' + ' | '.join(', '.join(entries) or '—' for entries in rings.values()) + ' |')
    lines += ['', '## Comparison', '', '| Standard | Layer | Steward | Governance | Status | Latest | Radar |', '| --- | --- | --- | --- | --- | --- | --- |']
    for layer in LAYERS:
        for standard in sorted(by_layer.get(layer, []), key=lambda entry: entry['name'].lower()):
            latest = standard.get('latest') or {}
            lines.append(f'| [{cell(standard["name"])}]({layer}.md#{standard["id"]}) | {layer} | {cell(standard["steward"])} | {standard["governance"]} | {standard["status"]} | {link(version(latest), latest.get("url"))} | {standard["radar"]} |')
    touched = defaultdict(list)
    for standard in standards:
        for path in standard.get('decisions') or []:
            touched[path].append(standard['name'])
    if touched:
        lines += ['', '## Decisions these standards bear on', '', 'A change to one of these standards is a reason to re-read the decision.', '', '| Decision | Standards |', '| --- | --- |']
        lines += [f'| {decision_links([path])} | {cell(", ".join(sorted(touched[path])))} |' for path in sorted(touched)]
    watched = defaultdict(list)
    for standard in standards:
        for item in standard.get('watchlist') or []:
            watched[item].append(standard['name'])
    if watched:
        lines += ['', '## Watchlist items these standards feed', '', 'Ids from the [protocol watchlist](../2026-10-13-protocol-integration-gaps.md#watchlist).', '', '| Item | Standards |', '| --- | --- |']
        lines += [f'| {item} | {cell(", ".join(sorted(watched[item])))} |' for item in sorted(watched, key=lambda entry: int(entry[1:]))]
    return '\n'.join(lines) + '\n'


def render_layer(layer, items, index):
    lines = [f'# {LAYERS[layer]}', '', 'Generated from [`standards.yaml`](standards.yaml); see the [catalogue](index.md).', '']
    if not items:
        lines += ['No standard in this layer is catalogued yet.', '']
    for standard in sorted(items, key=lambda entry: entry['name'].lower()):
        latest = standard.get('latest') or {}
        relations = standard.get('relations') or {}
        lines += [f'## {cell(standard["name"])} {{ #{standard["id"]} }}', '']
        if standard.get('disambiguation'):
            lines += [f'Not to be confused with: {cell(standard["disambiguation"])}', '']
        lines += [
            '| | |',
            '| --- | --- |',
            f'| Steward | {cell(standard["steward"])} ({standard["governance"]}) |',
            f'| Status | {standard["status"]} |',
            f'| Latest | {link(version(latest), latest.get("url"))} |',
            f'| Radar | **{standard["radar"]}**: {cell(standard["radar_reason"])} |',
            f'| Moves when | {cell(standard["flip_trigger"])} |',
            f'| Competes with | {names(relations.get("competes_with"), index)} |',
            f'| Complements | {names(relations.get("complements"), index)} |',
            f'| Builds on | {names(relations.get("builds_on"), index)} |',
            f'| Superseded by | {names(relations.get("superseded_by"), index)} |',
            f'| Decisions | {decision_links(standard.get("decisions"))} |',
            f'| Watchlist | {", ".join(standard.get("watchlist") or []) or "—"} |',
            f'| Reviewed | {standard["reviewed"]} |',
            '',
        ]
        lines += render_cases(standard['use_cases']) + ['']
        if standard.get('adoption'):
            lines += ['**Shipped adoption:** ' + '; '.join(cell(entry) for entry in standard['adoption']), '']
        if standard.get('open_problems'):
            lines += ['**Open problems:** ' + '; '.join(cell(entry) for entry in standard['open_problems']), '']
        if standard.get('watch'):
            lines += ['**Watched:** ' + ', '.join(f'{watch["kind"]} `{watch["ref"]}`' + (f' at {watch["current"]}' if watch.get('current') else '') for watch in standard['watch']), '']
    return '\n'.join(lines).rstrip('\n') + '\n'


def render_concepts(concepts, index):
    lines = [
        '# Concepts that are not standards yet',
        '',
        'Generated from [`standards.yaml`](standards.yaml); see the [catalogue](index.md). The ring is for adopting the pattern in Unfold.',
        '',
        '| Concept | Maturity | Radar | Unfold today |',
        '| --- | --- | --- | --- |',
    ]
    lines += [f'| [{cell(concept["name"])}](#{concept["id"]}) | {concept["maturity"]} | {concept["radar"]} | {cell(concept.get("unfold_today"))} |' for concept in sorted(concepts, key=lambda entry: entry['name'].lower())]
    lines.append('')
    for concept in sorted(concepts, key=lambda entry: entry['name'].lower()):
        lines += [
            f'## {cell(concept["name"])} {{ #{concept["id"]} }}',
            '',
            cell(concept.get('one_liner')),
            '',
            '| | |',
            '| --- | --- |',
            f'| Maturity | {concept["maturity"]} |',
            f'| Outlook | {cell(concept.get("standardisation_outlook"))} |',
            f'| Related standards | {names(concept.get("related_standards"), index)} |',
            f'| Critique | {cell(concept.get("tension_or_critique"))} |',
            f'| Radar | **{concept["radar"]}**: {cell(concept.get("radar_reason"))} |',
            f'| Watch for | {cell(concept.get("signal_to_watch"))} |',
            f'| Decisions | {decision_links(concept.get("decisions"))} |',
            f'| Reviewed | {concept["reviewed"]} |',
            '',
        ]
        if concept.get('where_it_lives'):
            lines += ['**Where it lives:** ' + '; '.join(cell(entry) for entry in concept['where_it_lives']), '']
        lines += render_cases(concept['use_cases']) + ['']
    return '\n'.join(lines).rstrip('\n') + '\n'


def pages(doc):
    index = {standard['id']: standard for standard in doc['standards']}
    by_layer = defaultdict(list)
    for standard in doc['standards']:
        by_layer[standard['layer']].append(standard)
    rendered = {'index.md': render_index(doc)}
    for layer in LAYERS:
        rendered[f'{layer}.md'] = render_layer(layer, by_layer.get(layer, []), index)
    rendered['concepts.md'] = render_concepts(doc.get('concepts') or [], index)
    return rendered


def stale(doc, out_dir):
    return [name for name, text in pages(doc).items() if not (out_dir / name).is_file() or (out_dir / name).read_text() != text]


def problems(path=catalogue_file):
    doc = load(path)
    return check(doc) + check_watch_lines(Path(path).read_text(), doc)


def main(argv):
    if len(argv) < 2 or argv[1] not in {'check', 'render', 'stale', 'ids'}:
        raise SystemExit(__doc__)
    path = Path(argv[2]) if len(argv) > 2 else catalogue_file
    out_dir = Path(argv[3]) if len(argv) > 3 else catalogue_dir
    doc = load(path)
    if argv[1] == 'ids':
        print('\n'.join(entry['id'] for entry in (doc.get('standards') or []) + (doc.get('concepts') or [])))
        return
    errors = problems(path)
    if errors:
        raise SystemExit('Agent-standards catalogue:\n' + '\n'.join(f'- {error}' for error in errors))
    if argv[1] == 'render':
        out_dir.mkdir(parents=True, exist_ok=True)
        for name, text in pages(doc).items():
            (out_dir / name).write_text(text)
        print(f'Agent standards: rendered {len(LAYERS) + 2} pages from {len(doc["standards"])} standards and {len(doc.get("concepts") or [])} concepts')
    elif argv[1] == 'stale':
        outdated = stale(doc, out_dir)
        if outdated:
            raise SystemExit('Stale agent-standards pages, run mise run agent-standards: ' + ', '.join(outdated))
        print('Agent standards: the generated pages match the catalogue')
    else:
        print(f'Agent standards: {len(doc["standards"])} standards and {len(doc.get("concepts") or [])} concepts hold every rule')


if __name__ == '__main__':
    main(sys.argv)
