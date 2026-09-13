import base64
import json
import os
import urllib.parse

from publish_release import FORGEJO, GITHUB, api
from release_registry import Registry, request, require_same


github_token = os.environ['GHCR_TOKEN']
forge_token = os.environ['WEBGRIP_CI_TOKEN']
repo = api(GITHUB, github_token)
require_same(repo['default_branch'], 'development', 'GitHub trunk')
require_same(repo['private'], False, 'GitHub visibility')
require_same(repo['permissions']['push'], True, 'GitHub publication permission')
for old in ['de-vloer', 'ploeg']:
    state = api(f'https://forgejo.webgrip.dev/api/v1/repos/webgrip/{old}', forge_token)
    require_same(state['has_actions'], False, old + ' old release authority')
mirrors = api(FORGEJO + '/push_mirrors', forge_token)
if len(mirrors) != 1 or mirrors[0]['last_error'] or not mirrors[0]['sync_on_commit']:
    raise RuntimeError('Glide requires a healthy continuous GitHub mirror')
for host, user, token in [('harbor.webgrip.dev', os.environ['HARBOR_ROBOT_USER'], os.environ['HARBOR_ROBOT_TOKEN']), ('ghcr.io', os.environ['GHCR_USERNAME'], github_token), ('forgejo.webgrip.dev', 'webgrip-ci', forge_token)]:
    registry = Registry(host, user, token)
    for name in ['de-vloer', 'de-vloer-agent', 'ploegd', 'charts/de-vloer', 'charts/ploeg']:
        registry.headers('webgrip/' + name, 'pull,push')
    print(host + ': registry authentication passed')
if not os.environ.get('OVSX_PAT'):
    raise RuntimeError('Glide has no Open VSX publishing credential')
url = os.environ['ACTIONS_ID_TOKEN_REQUEST_URL']
url += ('&' if '?' in url else '?') + urllib.parse.urlencode({'audience': 'openbao-cosign'})
data, _ = request(url, headers={'Authorization': 'Bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})
jwt = json.loads(data)['value']
payload = jwt.split('.')[1]
claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
require_same(claims['repository'], 'webgrip/glide', 'signing identity')
data, _ = request('http://openbao.security.svc.cluster.local:8200/v1/auth/forgejo/login', method='POST', data=json.dumps({'jwt': jwt, 'role': 'cosign-signer'}).encode(), headers={'Content-Type': 'application/json'})
session = json.loads(data)['auth']
if 'cosign-signer' not in session['policies']:
    raise RuntimeError('Glide did not receive the signing policy')
request('http://openbao.security.svc.cluster.local:8200/v1/auth/token/revoke-self', method='POST', data=b'', headers={'X-Vault-Token': session['client_token']})
print('Glide OIDC signing authorization passed; temporary token revoked')
