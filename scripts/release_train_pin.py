import json
import os
import re
import sys
import urllib.error
import urllib.request

PIN_BRANCH = re.compile(r'^ploeg/(?P<core>(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*))(?:-(?P<pre>[0-9A-Za-z.-]+))?$')
NOT_READY = (405, 409)
REFUSALS_OF_THE_TRAIN_ITSELF = ('User not allowed to merge', 'requires signed commits', 'not an allowed merge style')
PAGE = 50


class PinMergeError(Exception):
    pass


def precedence(version):
    match = PIN_BRANCH.match(f'ploeg/{version}')
    core = tuple(int(part) for part in match['core'].split('.'))
    if match['pre'] is None:
        return core, (1,)
    identifiers = tuple((0, int(part), '') if part.isdigit() else (1, 0, part) for part in match['pre'].split('.'))
    return core, (0, identifiers)


def pin_version(pull, repository, base, author):
    match = PIN_BRANCH.match(pull['head']['ref'])
    if not match or pull['base']['ref'] != base or pull['user']['login'] != author:
        return None
    if (pull['head'].get('repo') or {}).get('full_name') != repository:
        return None
    return pull['head']['ref'].removeprefix('ploeg/')


def pin_pulls(pulls, repository, base, author):
    found = [(version, pull) for pull in pulls if (version := pin_version(pull, repository, base, author))]
    return sorted(found, key=lambda item: precedence(item[0]), reverse=True)


class Forgejo:
    def __init__(self, api, token):
        self.api = api.rstrip('/')
        self.token = token

    def call(self, method, path, body=None):
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(f'{self.api}{path}', data=data, method=method, headers={'Accept': 'application/json', 'Authorization': f'token {self.token}', 'Content-Type': 'application/json', 'User-Agent': 'unfold-release-train'})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                payload = response.read()
                return response.status, json.loads(payload) if payload.strip() else None
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors='replace')[:500]
            error.close()
            return error.code, detail
        except urllib.error.URLError as error:
            raise PinMergeError(f'{method} {self.api}{path} is unreachable: {error.reason}') from error

    def expect(self, method, path, body=None):
        status, payload = self.call(method, path, body)
        if status not in (200, 201, 204):
            raise PinMergeError(f'{method} {path} answered HTTP {status}: {payload}')
        return payload

    def open_pulls(self):
        pulls, page = [], 1
        while True:
            batch = self.expect('GET', f'/pulls?state=open&limit={PAGE}&page={page}') or []
            pulls.extend(batch)
            if len(batch) < PAGE:
                return pulls
            page += 1

    def merge(self, number, head):
        return self.call('POST', f'/pulls/{number}/merge', {'Do': 'merge', 'head_commit_id': head, 'delete_branch_after_merge': True})

    def close(self, number, comment):
        self.expect('POST', f'/issues/{number}/comments', {'body': comment})
        self.expect('PATCH', f'/pulls/{number}', {'state': 'closed'})


def merge_newest_green_pin(forge, repository, base, author, log=print):
    candidates = pin_pulls(forge.open_pulls(), repository, base, author)
    if not candidates:
        log(f'No open Ploeg pin pull request from {author} into {base}.')
        return None
    merged = None
    for version, pull in candidates:
        number = pull['number']
        if pull.get('mergeable') is False:
            log(f'#{number} (Ploeg {version}) has conflicts with {base}; leaving it open.')
            continue
        status, payload = forge.merge(number, pull['head']['sha'])
        if status == 200:
            log(f'Merged #{number} (Ploeg {version}) into {base}.')
            merged = (version, number)
            break
        if status in NOT_READY and not any(refusal in str(payload) for refusal in REFUSALS_OF_THE_TRAIN_ITSELF):
            log(f'#{number} (Ploeg {version}) is not ready to merge, so its required checks have not all passed: HTTP {status} {payload}')
            continue
        raise PinMergeError(f'merging #{number} answered HTTP {status}: {payload}')
    if merged is None:
        log(f'No Ploeg pin pull request into {base} is green and mergeable; the train continues on the current head.')
        return None
    version, number = merged
    for older, pull in candidates:
        if precedence(older) < precedence(version):
            forge.close(pull['number'], f'Superseded by #{number} (Ploeg {version}), which the release train merged.')
            log(f'Closed #{pull["number"]} (Ploeg {older}), superseded by #{number}.')
    return number


def emit(name, value):
    print(f'{name}={value}')
    output = os.environ.get('GITHUB_OUTPUT')
    if output:
        with open(output, 'a') as handle:
            handle.write(f'{name}={value}\n')


def main():
    forge = Forgejo(os.environ['FORGEJO_REPOSITORY_API'], os.environ['PIN_MERGE_TOKEN'])
    try:
        number = merge_newest_green_pin(forge, os.environ['REPOSITORY'], os.environ['PIN_BASE'], os.environ['PIN_AUTHOR'])
    except PinMergeError as error:
        sys.exit(f'release train pin: {error}')
    emit('merged', number or '')


if __name__ == '__main__':
    main()
