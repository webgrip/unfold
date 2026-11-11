"""Survey the agent-standards sources and propose what changed as a pull request.

Usage:
  agent-standards-survey.py [--dry-run] [--today YYYY-MM-DD]
"""

import argparse
import datetime
import email.utils
import html
import importlib.util
import json
import os
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('agent_standards', root / 'scripts/agent-standards.py')
standards = importlib.util.module_from_spec(spec)
spec.loader.exec_module(standards)

survey_dir = standards.catalogue_dir / 'survey'
user_agent = 'unfold-agent-standards-survey/1 (+https://forgejo.webgrip.dev/webgrip/unfold)'
page_chars = 2500
source_chars = 4000
lookback_days = 10
forgejo = os.environ.get('FORGEJO_URL', 'https://forgejo.webgrip.dev')
repository = os.environ.get('GITHUB_REPOSITORY', 'webgrip/unfold')

triage_instruction = """You maintain a catalogue of agent protocols, specifications and concepts for Unfold, a product that turns Work Items into reviewed pull requests.
Below are the catalogue's entries and what changed in its sources since each entry was last reviewed.

Return one JSON object with two arrays and nothing else:
  "changes": catalogue entries whose source shows a release, status change, merger, deprecation or new governance home.
    Each: {"id", "what" (one sentence), "source_url", "radar_question" (one sentence: could this move Unfold's ring, and why)}.
  "candidates": live agent-related protocols, specifications, working groups or de facto conventions in the excerpts that are not in the catalogue under any name.
    Each: {"name", "layer" (one of the catalogue's layers), "why" (one sentence), "source_url"}.
Report only what an excerpt states. An empty array is a valid answer."""


def fetch(url, accept='text/html,application/json,application/atom+xml'):
    request = urllib.request.Request(url, headers={'User-Agent': user_agent, 'Accept': accept})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read(2_000_000).decode('utf-8', errors='replace')


def text_of(body):
    body = re.sub(r'(?is)<(script|style|nav|footer)[^>]*>.*?</\1>', ' ', body)
    body = re.sub(r'(?s)<[^>]+>', ' ', body)
    return re.sub(r'\s+', ' ', html.unescape(body)).strip()


def entry_day(stamp):
    try:
        if 'T' in stamp:
            return datetime.datetime.fromisoformat(stamp.replace('Z', '+00:00')).date().isoformat()
        return email.utils.parsedate_to_datetime(stamp).date().isoformat()
    except (ValueError, TypeError):
        return ''


def feed_entries(body, since):
    found = []
    for entry in re.findall(r'(?s)<(?:entry|item)\b.*?</(?:entry|item)>', body):
        when = re.search(r'<(?:updated|published|pubDate)>([^<]+)<', entry)
        title = re.search(r'(?s)<title[^>]*>(.*?)</title>', entry)
        href = re.search(r'<link[^>]*href="([^"]+)"', entry) or re.search(r'<link>([^<]+)</link>', entry)
        day = entry_day(when.group(1).strip()) if when else ''
        if day and day > since:
            found.append({'day': day, 'title': text_of(title.group(1)) if title else '?', 'url': href.group(1) if href else ''})
    return found[:5]


def new_drafts(term, since, known):
    query = urllib.parse.urlencode({'name__contains': term, 'type__slug': 'draft', 'time__gte': since, 'limit': 300, 'format': 'json'})
    data = json.loads(fetch(f'https://datatracker.ietf.org/api/v1/doc/document/?{query}', 'application/json'))
    return [{'day': draft['time'][:10], 'title': f'{draft["name"]}-{draft["rev"]}: {draft["title"]}', 'url': f'https://datatracker.ietf.org/doc/{draft["name"]}/'}
            for draft in data.get('objects', []) if draft['rev'] in {'00', '01'} and draft['name'] not in known]


def gather(doc, today):
    since_window = (today - datetime.timedelta(days=lookback_days)).isoformat()
    known = {watch['ref'] for standard in doc.get('standards') or [] for watch in standard.get('watch') or []}
    findings, failures = [], []
    for standard in doc.get('standards') or []:
        since = max(str(standard.get('reviewed', '')), str((standard.get('latest') or {}).get('date', '')), since_window)
        for watch in standard.get('watch') or []:
            if watch['kind'] not in {'rss', 'changelog-page'}:
                continue
            try:
                body = fetch(watch['ref'])
            except Exception as error:
                failures.append(f'{standard["id"]}: {watch["ref"]} ({error})')
                continue
            if watch['kind'] == 'rss':
                for entry in feed_entries(body, since):
                    findings.append({'id': standard['id'], 'source': watch['ref'], **entry})
            else:
                findings.append({'id': standard['id'], 'source': watch['ref'], 'day': '', 'title': 'page text', 'url': watch['ref'], 'text': text_of(body)[:page_chars]})
    candidates = []
    for source in (doc.get('survey') or {}).get('sources') or []:
        try:
            if source['kind'] == 'ietf-search':
                candidates += [{'source': source['name'], **draft} for draft in new_drafts(source['term'], since_window, known)]
            else:
                candidates.append({'source': source['name'], 'day': '', 'title': 'page text', 'url': source['url'], 'text': text_of(fetch(source['url']))[:source_chars]})
        except Exception as error:
            failures.append(f'{source["name"]}: {error}')
    return findings, candidates, failures


def triage(doc, findings, candidates):
    url, key, model = os.environ.get('AGENT_STANDARDS_MODEL_URL'), os.environ.get('AGENT_STANDARDS_MODEL_KEY'), os.environ.get('AGENT_STANDARDS_MODEL', '')
    if not (url and key and model):
        return None
    catalogue = '\n'.join(f'{entry["id"]} | {entry["name"]} | {entry.get("layer", "concept")} | {(entry.get("latest") or {}).get("version", "")}'
                          for entry in (doc.get('standards') or []) + (doc.get('concepts') or []))
    excerpts = '\n\n'.join(f'--- {item.get("id") or item["source"]} <{item["url"]}> {item["day"]}\n{item.get("text") or item["title"]}' for item in findings + candidates)
    prompt = '\n\n'.join([triage_instruction, 'LAYERS: ' + ', '.join(standards.LAYERS), 'CATALOGUE:\n' + catalogue, 'EXCERPTS:\n' + excerpts])
    request = urllib.request.Request(f'{url.rstrip("/")}/chat/completions', method='POST',
                                     data=json.dumps({'model': model, 'messages': [{'role': 'user', 'content': prompt}], 'response_format': {'type': 'json_object'}}).encode(),
                                     headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=600) as response:
        content = json.loads(response.read())['choices'][0]['message']['content']
    return json.loads(re.sub(r'^```(?:json)?|```$', '', content.strip()).strip())


def report(week, doc, findings, candidates, failures, triaged):
    index = {entry['id']: entry for entry in (doc.get('standards') or []) + (doc.get('concepts') or [])}
    lines = [f'# Agent standards survey, {week}', '',
             'Generated by `scripts/agent-standards-survey.py`; the procedure is [Keep the agent-standards catalogue current](../../../../../../docs/how-to/keep-the-agent-standards-catalogue-current.md).'
             ' Proposals only: a reviewer edits `standards.yaml` in this pull request, or closes it.', '']
    if triaged is None:
        lines += ['Mode: deterministic. No model is configured, so every finding below is listed as fetched, without triage.', '']
    else:
        lines += [f'Mode: triaged by `{os.environ.get("AGENT_STANDARDS_MODEL")}`.', '', '## Changes to catalogued entries', '']
        lines += [f'- **{change.get("id")}**: {change.get("what")} ([source]({change.get("source_url")})). {change.get("radar_question", "")}' for change in triaged.get('changes') or []] or ['None found.']
        lines += ['', '## Candidates not in the catalogue', '']
        lines += [f'- **{candidate.get("name")}** ({candidate.get("layer")}): {candidate.get("why")} ([source]({candidate.get("source_url")}))' for candidate in triaged.get('candidates') or []] or ['None found.']
        lines.append('')
    lines += ['## New in the watched sources', '']
    lines += [f'- **{item["id"]}** {item["day"]}: [{item["title"]}]({item["url"]})' for item in findings if item.get('day')] or ['Nothing new.']
    lines += ['', '## New IETF drafts not in the catalogue', '']
    lines += [f'- {item["day"]} [{item["title"]}]({item["url"]})' for item in candidates if item.get('day')] or ['None.']
    touched = sorted({path for item in findings for path in index.get(item.get('id'), {}).get('decisions') or []})
    lines += ['', '## Decisions to re-read', '']
    lines += [f'- [{Path(path).stem}](../../../../../../{path})' for path in touched] or ['None.']
    if failures:
        lines += ['', '## Sources that could not be read', ''] + [f'- {failure}' for failure in failures]
    return '\n'.join(lines) + '\n'


def has_news(findings, candidates, triaged):
    if triaged is not None:
        return bool(triaged.get('changes') or triaged.get('candidates'))
    return any(item.get('day') for item in findings + candidates)


def open_pull_request(week, path):
    on_github = os.environ.get('SURVEY_FORGE') == 'github'
    token = os.environ['GITHUB_TOKEN' if on_github else 'WEBGRIP_CI_TOKEN']
    branch = f'docs/agent-standards-survey-{week}'
    title = f'docs(research): agent standards survey {week}'
    git = lambda *args: subprocess.run(['git', *args], cwd=root, check=True)
    git('config', 'user.name', 'github-actions[bot]' if on_github else 'unfold-agent-standards-survey')
    git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com' if on_github else 'ci@webgrip.dev')
    git('checkout', '-B', branch)
    git('add', str(path.relative_to(root)))
    git('commit', '-m', title)
    host = 'github.com' if on_github else urllib.parse.urlparse(forgejo).netloc
    user = 'x-access-token' if on_github else 'ci'
    git('push', '--force', f'https://{user}:{token}@{host}/{repository}.git', f'HEAD:refs/heads/{branch}')
    body = json.dumps({'head': branch, 'base': 'development', 'title': title,
                       'body': f'Weekly agent-standards survey. Review `{path.relative_to(root)}`, edit `standards.yaml` here and run `mise run agent-standards` if a ring moves, or close this pull request.'}).encode()
    api = f'https://api.github.com/repos/{repository}/pulls' if on_github else f'{forgejo}/api/v1/repos/{repository}/pulls'
    authorization = f'Bearer {token}' if on_github else f'token {token}'
    request = urllib.request.Request(api, data=body, method='POST', headers={'Authorization': authorization, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            print(f'Opened {json.loads(response.read()).get("html_url")}')
    except urllib.error.HTTPError as error:
        if error.code not in (409, 422):
            raise
        print(f'A pull request from {branch} is already open; its branch now carries this report')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--today', type=datetime.date.fromisoformat, default=datetime.date.today())
    args = parser.parse_args()
    doc = standards.load(standards.catalogue_file)
    week = args.today.strftime('%G-W%V')
    findings, candidates, failures = gather(doc, args.today)
    triaged = None if args.dry_run else triage(doc, findings, candidates)
    text = report(week, doc, findings, candidates, failures, triaged)
    print(f'Agent standards survey {week}: {sum(1 for item in findings if item.get("day"))} new source entries, {sum(1 for item in candidates if item.get("day"))} new drafts, {len(failures)} unreadable sources')
    if not has_news(findings, candidates, triaged):
        print('Nothing new; no pull request')
        return
    survey_dir.mkdir(parents=True, exist_ok=True)
    path = survey_dir / f'{week}.md'
    path.write_text(text)
    if args.dry_run:
        print(f'Dry run: wrote {path.relative_to(root)} and opened nothing')
        return
    open_pull_request(week, path)


if __name__ == '__main__':
    main()
