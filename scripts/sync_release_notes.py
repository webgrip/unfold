import base64
import os

from publish_release import git


git('fetch', 'origin', '+refs/notes/*:refs/notes/*')
authorization = base64.b64encode(('x-access-token:' + os.environ['GHCR_TOKEN']).encode()).decode()
env = {**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GIT_CONFIG_COUNT': '2', 'GIT_CONFIG_KEY_0': 'http.https://github.com/.extraheader', 'GIT_CONFIG_VALUE_0': 'AUTHORIZATION: basic ' + authorization, 'GIT_CONFIG_KEY_1': 'credential.helper', 'GIT_CONFIG_VALUE_1': ''}
git('push', '--prune', 'https://github.com/webgrip/glide.git', '+refs/notes/*:refs/notes/*', env=env)
print('Mirrored semantic-release channel notes to GitHub')
