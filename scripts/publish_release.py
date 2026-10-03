import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse
from pathlib import Path

from release_floors import refuse_occupied
from release_registry import Registry, command, copy_chart, copy_image, digest, request, require_same


ROOT = Path(__file__).resolve().parent.parent
FORGEJO = 'https://forgejo.webgrip.dev/api/v1/repos/webgrip/unfold'
GITHUB = 'https://api.github.com/repos/webgrip/unfold'
# on_release_published.yml runs Ploeg's publisher after Vloer's; only the last
# one may leave the draft, because an immutable release takes no more assets.
PUBLISHES_LAST = 'ploeg'


def api(url, token, method='GET', data=None, missing=False):
    body, _ = request(url, method=method, headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json'}, data=json.dumps(data).encode() if data is not None else None, missing=missing)
    return json.loads(body) if body else None


def git(*args, env=None, input=None):
    return command('git', *args, env={**(env or os.environ), 'GIT_TERMINAL_PROMPT': '0'}, input=input)


def release_tag(application, version):
    if application not in {'vloer', 'ploeg'} or not re.fullmatch(r'0\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-rc\.([1-9][0-9]*)', version):
        raise ValueError('The cutover publishes only 0.x.y-rc.N Unfold releases for a named application')
    return f'unfold-v{version}'


def publishable_tag(application, version):
    tag = release_tag(application, version)
    refuse_occupied(application, version)
    return tag


def export_commit(tag, parent):
    tree = git('rev-parse', f'{tag}:apps/ploeg')
    revision = git('rev-parse', f'{tag}^{{commit}}')
    date = git('show', '-s', '--format=%cI', revision)
    env = {**os.environ, 'GIT_AUTHOR_NAME': 'Unfold release', 'GIT_AUTHOR_EMAIL': 'ci@webgrip.dev', 'GIT_COMMITTER_NAME': 'Unfold release', 'GIT_COMMITTER_EMAIL': 'ci@webgrip.dev', 'GIT_AUTHOR_DATE': date, 'GIT_COMMITTER_DATE': date}
    commit = git('commit-tree', tree, '-p', parent, env=env, input=f'Export {tag}\n\nUnfold-Source: {revision}\nUnfold-Tree: {tree}\n')
    return commit, tree


def export_module(tag, version, token):
    baseline = '05b93bb4b7c063cb0ca733e4bbf3d699c5044af4'
    commit, tree = export_commit(tag, baseline)
    destination = 'https://github.com/webgrip/ploeg.git'
    ref = f'refs/tags/v{version}'
    authorization = base64.b64encode(('x-access-token:' + token).encode()).decode()
    env = {**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GIT_CONFIG_COUNT': '2', 'GIT_CONFIG_KEY_0': 'http.https://github.com/.extraheader', 'GIT_CONFIG_VALUE_0': 'AUTHORIZATION: basic ' + authorization, 'GIT_CONFIG_KEY_1': 'credential.helper', 'GIT_CONFIG_VALUE_1': ''}
    existing = git('ls-remote', destination, ref, env=env)
    if existing:
        require_same(existing.split()[0], commit, 'Ploeg module tag')
    else:
        api('https://api.github.com/repos/webgrip/ploeg/actions/permissions', token, 'PUT', {'enabled': False})
        git('push', destination, f'{commit}:{ref}', env=env)
    require_same(git('ls-remote', destination, ref).split()[0], commit, 'public Ploeg module tag')
    with tempfile.TemporaryDirectory() as directory:
        env = {**os.environ, 'GOMODCACHE': directory, 'GOPROXY': 'direct', 'GOSUMDB': 'sum.golang.org', 'GOPRIVATE': '', 'GONOSUMDB': '', 'GONOPROXY': ''}
        module = json.loads(command('go', 'mod', 'download', '-json', f'github.com/webgrip/ploeg@v{version}', env=env))
        if 'Error' in module:
            raise RuntimeError(module['Error'])
        for path in ['go.mod', 'go.sum', *git('ls-tree', '-r', '--name-only', tag, 'apps/ploeg/pkg', 'apps/ploeg/cmd', 'apps/ploeg/internal').splitlines()]:
            relative = path.removeprefix('apps/ploeg/')
            if not relative.endswith(('.go', 'go.mod', 'go.sum', '.sql')):
                continue
            expected = subprocess.check_output(['git', 'show', f'{tag}:apps/ploeg/{relative}'])
            require_same(digest((Path(module['Dir']) / relative).read_bytes()), digest(expected), f'module source {relative}')
    return {'module': 'github.com/webgrip/ploeg', 'version': f'v{version}', 'commit': commit, 'tree': tree, 'sum': module['Sum']}


def link_package(name, token):
    packages = api(f'https://forgejo.webgrip.dev/api/v1/packages/webgrip?type=container&q={urllib.parse.quote(name)}&limit=50', token) or []
    linked = {(package.get('repository') or {}).get('full_name') for package in packages if package['name'] == name}
    if linked == {'webgrip/unfold'}:
        return
    path = f'https://forgejo.webgrip.dev/api/v1/packages/webgrip/container/{urllib.parse.quote(name, safe="")}/-'
    try:
        if linked - {None}:
            api(f'{path}/unlink', token, 'POST')
        api(f'{path}/link/unfold', token, 'POST')
    except RuntimeError as error:
        print(f'::warning::package {name} stays linked to {", ".join(sorted(r for r in linked if r)) or "no repository"}: {error}', file=sys.stderr)


def fetch_asset(asset, token):
    url = asset['browser_download_url']
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.netloc not in {'forgejo.webgrip.dev', 'github.com'}:
        raise RuntimeError('Unexpected release asset host')
    data, _ = request(url, headers={'Authorization': 'Bearer ' + token} if parsed.netloc == 'forgejo.webgrip.dev' else {})
    return data


def attach_forgejo(release, name, content, token):
    existing = next((a for a in release.get('assets', []) if a['name'] == name), None)
    if existing:
        require_same(digest(fetch_asset(existing, token)), digest(content), name)
        return
    boundary = 'unfold-release-' + hashlib.sha256(content).hexdigest()
    body = f'--{boundary}\r\nContent-Disposition: form-data; name="attachment"; filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode() + content + f'\r\n--{boundary}--\r\n'.encode()
    request(f'{FORGEJO}/releases/{release["id"]}/assets?name={urllib.parse.quote(name)}', method='POST', data=body, headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/form-data; boundary=' + boundary})


def github_release(tag, token):
    target = api(f'{GITHUB}/releases/tags/{tag}', token, missing=True)
    if target is not None:
        return target
    drafts = [r for r in api(f'{GITHUB}/releases?per_page=100', token) if r['draft'] and r['tag_name'] == tag]
    return drafts[0] if drafts else None


def fetch_github_asset(asset, token, draft):
    if not draft:
        return fetch_asset(asset, token)
    if not asset['url'].startswith(GITHUB + '/releases/assets/'):
        raise RuntimeError('Unexpected GitHub asset URL')
    data, _ = request(asset['url'], headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/octet-stream'})
    return data


def mirror_release(tag, source, forge_token, github_token, publish=True):
    remote = git('ls-remote', 'https://github.com/webgrip/unfold.git', f'refs/tags/{tag}', f'refs/tags/{tag}^{{}}')
    refs = dict((line.split()[1], line.split()[0]) for line in remote.splitlines())
    actual = refs.get(f'refs/tags/{tag}^{{}}', refs.get(f'refs/tags/{tag}'))
    require_same(actual, git('rev-parse', f'{tag}^{{commit}}'), 'GitHub Unfold release source')
    target = github_release(tag, github_token)
    expected = {'tag_name': tag, 'name': source['name'], 'body': source['body'], 'prerelease': True}
    if target is None:
        target = api(f'{GITHUB}/releases', github_token, 'POST', {**expected, 'draft': True})
    else:
        for key in expected:
            require_same(target[key], expected[key], f'GitHub release {key}')
    for asset in source.get('assets', []):
        content = fetch_asset(asset, forge_token)
        existing = next((a for a in target['assets'] if a['name'] == asset['name']), None)
        if existing:
            require_same(digest(fetch_github_asset(existing, github_token, target['draft'])), digest(content), 'GitHub asset ' + asset['name'])
            continue
        if not target['draft']:
            raise RuntimeError(f'GitHub release {tag} is already published without {asset["name"]}; immutable releases take assets only while they are drafts')
        upload = target['upload_url'].split('{')[0]
        if urllib.parse.urlsplit(upload).netloc != 'uploads.github.com':
            raise RuntimeError('Unexpected GitHub upload host')
        request(upload + '?' + urllib.parse.urlencode({'name': asset['name']}), method='POST', data=content, headers={'Authorization': 'Bearer ' + github_token, 'Content-Type': 'application/octet-stream'})
    if target['draft'] and publish:
        target = api(f'{GITHUB}/releases/{target["id"]}', github_token, 'PATCH', {'draft': False, 'make_latest': 'false'})
    return target['html_url']


def publish(application, version):
    tag = publishable_tag(application, version)
    revision = git('rev-parse', f'{tag}^{{commit}}')
    require_same(git('rev-parse', 'HEAD'), revision, 'publisher checkout')
    forge_token = os.environ['WEBGRIP_CI_TOKEN']
    github_token = os.environ['GHCR_TOKEN']
    source_release = api(f'{FORGEJO}/releases/tags/{tag}', forge_token)
    if source_release['draft']:
        raise RuntimeError('Cannot publish a draft release')
    source = Registry('harbor.webgrip.dev', os.environ['HARBOR_ROBOT_USER'], os.environ['HARBOR_ROBOT_TOKEN'])
    targets = [Registry('forgejo.webgrip.dev', 'webgrip-ci', forge_token), Registry('ghcr.io', os.environ['GHCR_USERNAME'], github_token)]
    images = ['de-vloer', 'de-vloer-agent'] if application == 'vloer' else ['ploegd']
    chart = 'de-vloer' if application == 'vloer' else 'ploeg'
    evidence = {'schema_version': 1, 'tag': tag, 'source': 'https://github.com/webgrip/unfold', 'revision': revision, 'images': [], 'charts': []}
    for target in targets:
        for name in images:
            reference = copy_image(source, target, f'webgrip/{name}', version, revision)
            evidence['images'].append({'name': name, 'source': f'{source.host}/webgrip/{name}@{reference}', 'target': f'{target.host}/webgrip/{name}@{reference}'})
            if target.host == 'forgejo.webgrip.dev':
                link_package(name, forge_token)
        reference = copy_chart(source, target, f'webgrip/charts/{chart}', version)
        evidence['charts'].append({'name': chart, 'source': f'{source.host}/webgrip/charts/{chart}@{reference}', 'target': f'{target.host}/webgrip/charts/{chart}@{reference}'})
        if target.host == 'forgejo.webgrip.dev':
            link_package('charts/' + chart, forge_token)
    anonymous = Registry('ghcr.io')
    for artifact in evidence['images'] + evidence['charts']:
        if not artifact['target'].startswith('ghcr.io/'):
            continue
        path, reference = artifact['target'].removeprefix('ghcr.io/').split('@')
        require_same(digest(anonymous.manifest(path, version)), reference, 'anonymous public pull')
    if application == 'ploeg':
        evidence['go_module'] = export_module(tag, version, github_token)
    else:
        extension = api(f'https://open-vsx.org/api/webgrip/de-vloer/{version}', '')
        require_same(extension['version'], version, 'Open VSX version')
        vsix = next(a for a in source_release['assets'] if a['name'] == f'de-vloer-{version}.vsix')
        data, _ = request(extension['files']['download'])
        require_same(digest(data), digest(fetch_asset(vsix, forge_token)), 'Open VSX VSIX')
        evidence['extension'] = {'version': version, 'sha256': hashlib.sha256(data).hexdigest(), 'url': extension['files']['download']}
    attach_forgejo(source_release, f'release-artifacts-{application}.json', (json.dumps(evidence, indent=2) + '\n').encode(), forge_token)
    source_release = api(f'{FORGEJO}/releases/tags/{tag}', forge_token)
    print(mirror_release(tag, source_release, forge_token, github_token, publish=application == PUBLISHES_LAST))
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    publish(sys.argv[1], sys.argv[2])
