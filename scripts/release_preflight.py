import base64
import json
import os
import urllib.parse

from publish_release import FORGEJO, GITHUB, api, git
from release_registry import Registry, request, require_same


CANONICAL = 'webgrip/unfold'
RETIRED = ['glide', 'ploeg', 'de-vloer']


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
        for name in ['de-vloer', 'de-vloer-agent', 'charts/de-vloer']:
            registry.headers('webgrip/' + name, 'pull,push')
        print(host + ': registry authentication passed')
    if not os.environ.get('OVSX_PAT'):
        raise RuntimeError('Unfold has no Open VSX publishing credential')
    url = os.environ['ACTIONS_ID_TOKEN_REQUEST_URL']
    url += ('&' if '?' in url else '?') + urllib.parse.urlencode({'audience': 'openbao-cosign'})
    data, _ = request(url, headers={'Authorization': 'Bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})
    jwt = json.loads(data)['value']
    payload = jwt.split('.')[1]
    claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
    require_same(claims['repository'], CANONICAL, 'signing identity')
    data, _ = request('http://openbao.security.svc.cluster.local:8200/v1/auth/forgejo/login', method='POST', data=json.dumps({'jwt': jwt, 'role': 'cosign-signer'}).encode(), headers={'Content-Type': 'application/json'})
    session = json.loads(data)['auth']
    if 'cosign-signer' not in session['policies']:
        raise RuntimeError('Unfold did not receive the signing policy')
    request('http://openbao.security.svc.cluster.local:8200/v1/auth/token/revoke-self', method='POST', data=b'', headers={'X-Vault-Token': session['client_token']})
    print('Unfold OIDC signing authorization passed; temporary token revoked')


if __name__ == '__main__':
    main()
