import base64
import json
import os

from publish_release import FORGEJO, GITHUB, HOME, HOME_NAMESPACE, HOME_REGISTRY, HOME_REPOSITORY, api, extension_identity, git
from release_registry import Registry, request, require_same, revoke_signing_session, signing_identity, signing_session


CANONICAL = 'webgrip/unfold'
RETIRED = ['glide', 'ploeg', 'de-vloer']
FORMER_HOME = 'webgrip/unfold'


def retired_release_authorities(read):
    active = []
    for name in RETIRED:
        state = read(f'https://forgejo.webgrip.dev/api/v1/repos/webgrip/{name}')
        if state is None or state.get('full_name') != f'webgrip/{name}':
            continue
        if state.get('has_actions') is not False:
            active.append(f'webgrip/{name}')
    return active


def mirrored_refs(remote):
    listing = git('ls-remote', remote, 'refs/heads/development', 'refs/tags/*')
    return {ref: sha for sha, ref in (line.split('\t') for line in listing.splitlines()) if not ref.endswith('^{}')}


def main():
    github_token = os.environ['GHCR_TOKEN']
    forge_token = os.environ['WEBGRIP_CI_TOKEN']
    require_same(api(FORGEJO, forge_token)['full_name'], CANONICAL, 'Forgejo repository identity')
    repo = api(GITHUB, github_token)
    require_same(repo['full_name'], CANONICAL, 'GitHub repository identity')
    require_same(repo['default_branch'], 'development', 'GitHub trunk')
    require_same(repo['private'], False, 'GitHub visibility')
    require_same(repo['permissions']['push'], True, 'GitHub publication permission')
    active = retired_release_authorities(lambda url: api(url, forge_token, missing=True))
    if active:
        raise RuntimeError('Retired repository names still run Actions under their own name: ' + ', '.join(active))
    print('No retired repository name runs Actions: ' + ', '.join(f'webgrip/{name}' for name in RETIRED))

    source = mirrored_refs('origin')
    require_same(source['refs/heads/development'], git('rev-parse', 'HEAD'), 'Forgejo trunk')
    mirror = mirrored_refs(f'https://github.com/{CANONICAL}.git')
    stale = sorted(ref for ref in source.keys() | mirror.keys() if source.get(ref) != mirror.get(ref))
    if stale:
        raise RuntimeError('GitHub mirror differs from Forgejo at ' + ', '.join(stale))
    print(f'GitHub mirror matches Forgejo across {len(source)} refs')
    for host, user, token in [('harbor.webgrip.dev', os.environ['HARBOR_ROBOT_USER'], os.environ['HARBOR_ROBOT_TOKEN']), ('ghcr.io', os.environ['GHCR_USERNAME'], github_token), ('forgejo.webgrip.dev', 'webgrip-ci', forge_token)]:
        registry = Registry(host, user, token)
        for name in ['unfold', 'unfold-agent', 'charts/unfold']:
            registry.headers('webgrip/' + name, 'pull,push')
        print(host + ': registry authentication passed')
    if not os.environ.get('OVSX_PAT'):
        raise RuntimeError('Unfold has no Open VSX publishing credential')
    jwt = signing_identity()
    payload = jwt.split('.')[1]
    claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
    require_same(claims['repository'], CANONICAL, 'signing identity')
    revoke_signing_session(signing_session(jwt))
    print('Unfold OIDC signing authorization passed; temporary token revoked')


def former_home_returned(read):
    state = read(f'https://api.github.com/repos/{FORMER_HOME}')
    return state is not None and state.get('full_name') == FORMER_HOME


def github_identity(environ=os.environ):
    url = environ['ACTIONS_ID_TOKEN_REQUEST_URL']
    url += ('&' if '?' in url else '?') + 'audience=sigstore'
    data, _ = request(url, headers={'Authorization': 'Bearer ' + environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})
    payload = json.loads(data)['value'].split('.')[1]
    return json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))


def main_github():
    token = os.environ['GITHUB_TOKEN']
    repo = api(HOME, token)
    require_same(repo['full_name'], HOME_REPOSITORY, 'GitHub repository identity')
    require_same(repo['default_branch'], 'development', 'GitHub trunk')
    require_same(repo['private'], False, 'GitHub visibility')
    print(f'GitHub answers as {HOME_REPOSITORY} directly, public, with development as trunk')
    if former_home_returned(lambda url: api(url, token, missing=True)):
        raise RuntimeError(f'{FORMER_HOME} exists again as a repository of its own; only a redirect to {HOME_REPOSITORY} may answer under that name')
    print(f'{FORMER_HOME} is not a repository of its own')
    require_same(git('rev-parse', 'HEAD'), git('ls-remote', 'origin', 'refs/heads/development').split()[0], 'GitHub trunk head')
    registry = Registry(HOME_REGISTRY, os.environ['GITHUB_ACTOR'], token)
    for name in ['unfold', 'unfold-agent', 'charts/unfold']:
        registry.headers(f'{HOME_NAMESPACE}/{name}', 'pull,push')
    print(f'{HOME_REGISTRY}/{HOME_NAMESPACE}: registry authentication passed')
    namespace, name = extension_identity()
    if api(f'https://open-vsx.org/api/{namespace}', '', missing=True) is None:
        raise RuntimeError(f'Open VSX has no namespace {namespace} to publish {namespace}.{name} into')
    print(f'Open VSX namespace {namespace} exists')
    claims = github_identity()
    require_same(claims['repository'], HOME_REPOSITORY, 'signing identity')
    print('GitHub Actions OIDC identity for keyless signing passed')


if __name__ == '__main__':
    main_github() if os.environ.get('UNFOLD_RELEASE_HOME') == 'github' else main()
