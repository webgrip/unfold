import base64
import hashlib
import json
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if urllib.parse.urlsplit(req.full_url).netloc != urllib.parse.urlsplit(newurl).netloc:
            redirected.remove_header('Authorization')
        return redirected


def request(url, method='GET', data=None, headers=None, missing=False):
    try:
        req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
        with urllib.request.build_opener(SafeRedirect).open(req, timeout=120) as response:
            return response.read(), response.headers
    except urllib.error.HTTPError as error:
        if missing and error.code == 404:
            return None, error.headers
        raise RuntimeError(f'{method} {urllib.parse.urlsplit(url).netloc} returned HTTP {error.code}') from None


def command(*args, env=None, input=None):
    result = subprocess.run(args, env=env, input=input, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f'{args[0]} {args[1]} failed: {result.stderr[-2000:]}')
    return result.stdout.strip()


def digest(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def require_same(actual, expected, label):
    if actual != expected:
        raise RuntimeError(f'{label}: expected {expected}, got {actual}; existing versions are immutable')


class Registry:
    def __init__(self, host, user='', password=''):
        self.host = host
        self.basic = 'Basic ' + base64.b64encode(f'{user}:{password}'.encode()).decode() if user else ''
        self.tokens = {}

    def headers(self, repository, actions='pull'):
        key = (repository, actions)
        if key in self.tokens:
            return self.tokens[key]
        url = f'https://{self.host}/v2/'
        req = urllib.request.Request(url)
        try:
            with urllib.request.urlopen(req, timeout=30):
                challenge = ''
        except urllib.error.HTTPError as error:
            if error.code != 401:
                raise RuntimeError(f'{self.host} registry probe returned {error.code}') from None
            challenge = error.headers.get('WWW-Authenticate', '')
        auth = self.basic
        if challenge.lower().startswith('bearer '):
            fields = dict(re.findall(r'(\w+)="([^"]*)"', challenge))
            realm = urllib.parse.urlsplit(fields['realm'])
            allowed = {self.host, 'auth.docker.io'} if self.host == 'registry-1.docker.io' else {self.host}
            if realm.scheme != 'https' or realm.netloc not in allowed:
                raise RuntimeError(f'Untrusted authentication realm for {self.host}')
            query = urllib.parse.urlencode({'service': fields.get('service', self.host), 'scope': f'repository:{repository}:{actions}'})
            data, _ = request(fields['realm'] + '?' + query, headers={'Authorization': self.basic} if self.basic else {})
            result = json.loads(data)
            auth = 'Bearer ' + (result.get('token') or result['access_token'])
        self.tokens[key] = {'Authorization': auth} if auth else {}
        return self.tokens[key]

    def manifest(self, repository, reference, missing=False):
        accept = ', '.join(['application/vnd.oci.image.index.v1+json', 'application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json', 'application/vnd.docker.distribution.manifest.v2+json'])
        data, headers = request(f'https://{self.host}/v2/{repository}/manifests/{reference}', headers={**self.headers(repository), 'Accept': accept}, missing=missing)
        if data is not None:
            require_same(headers.get('Docker-Content-Digest', digest(data)), digest(data), 'registry content digest')
        return data

    def blob(self, repository, reference):
        data, _ = request(f'https://{self.host}/v2/{repository}/blobs/{reference}', headers=self.headers(repository))
        require_same(digest(data), reference, 'blob digest')
        return data

    def upload_blob(self, repository, data):
        reference = digest(data)
        headers = self.headers(repository, 'pull,push')
        present, _ = request(f'https://{self.host}/v2/{repository}/blobs/{reference}', method='HEAD', headers=headers, missing=True)
        if present is not None:
            return
        _, response = request(f'https://{self.host}/v2/{repository}/blobs/uploads/', method='POST', data=b'', headers=headers)
        location = urllib.parse.urljoin(f'https://{self.host}', response['Location'])
        if urllib.parse.urlsplit(location).netloc != self.host:
            raise RuntimeError('Cross-host registry upload refused')
        location += ('&' if '?' in location else '?') + urllib.parse.urlencode({'digest': reference})
        request(location, method='PUT', data=data, headers={**headers, 'Content-Type': 'application/octet-stream'})

    def upload_manifest(self, repository, version, data):
        request(f'https://{self.host}/v2/{repository}/manifests/{version}', method='PUT', data=data, headers={**self.headers(repository, 'pull,push'), 'Content-Type': json.loads(data)['mediaType']})


def copy_chart(source, target, repository, version):
    manifest = source.manifest(repository, version)
    expected = digest(manifest)
    existing = target.manifest(repository, version, missing=True)
    if existing is not None:
        require_same(digest(existing), expected, f'{target.host}/{repository}:{version}')
    else:
        descriptor = json.loads(manifest)
        if descriptor['config']['mediaType'] != 'application/vnd.cncf.helm.config.v1+json':
            raise RuntimeError('Expected a Helm OCI artifact')
        for blob in [descriptor['config'], *descriptor['layers']]:
            target.upload_blob(repository, source.blob(repository, blob['digest']))
        target.upload_manifest(repository, version, manifest)
    require_same(digest(target.manifest(repository, version)), expected, 'copied chart')
    return expected


def verify_image(registry, repository, version, revision):
    raw = registry.manifest(repository, version)
    index = json.loads(raw)
    source = 'https://github.com/webgrip/glide'
    require_same(index.get('annotations', {}).get('org.opencontainers.image.source'), source, 'index source')
    platforms = set()
    for descriptor in index.get('manifests', []):
        platform = descriptor.get('platform', {})
        if platform.get('os') != 'linux' or platform.get('architecture') not in {'amd64', 'arm64'}:
            continue
        platforms.add(platform['architecture'])
        manifest = json.loads(registry.manifest(repository, descriptor['digest']))
        config = json.loads(registry.blob(repository, manifest['config']['digest']))
        labels = config['config'].get('Labels', {})
        for key, expected in [('version', version), ('revision', revision), ('source', source)]:
            require_same(labels.get('org.opencontainers.image.' + key), expected, f'{platform} {key}')
    require_same(platforms, {'amd64', 'arm64'}, 'image platforms')
    return digest(raw)


def verify_signature(reference):
    key = str(Path(__file__).resolve().parent.parent / 'ops/security/cosign.pub')
    command('cosign', 'verify', '--key', key, '--insecure-ignore-tlog', reference)
    statements = command('cosign', 'verify-attestation', '--key', key, '--insecure-ignore-tlog', '--type', 'cyclonedx', reference)
    if not statements:
        raise RuntimeError(f'Missing verified SBOM for {reference}')


def copy_image(source, target, repository, version, revision):
    expected = verify_image(source, repository, version, revision)
    src = f'{source.host}/{repository}@{expected}'
    dst = f'{target.host}/{repository}:{version}'
    verify_signature(src)
    existing = target.manifest(repository, version, missing=True)
    if existing is None:
        command('docker', 'buildx', 'imagetools', 'create', '--tag', dst, src)
    else:
        require_same(digest(existing), expected, dst)
    command('cosign', 'copy', '--only=sig,att,sbom', src, dst)
    require_same(verify_image(target, repository, version, revision), expected, dst)
    verify_signature(f'{target.host}/{repository}@{expected}')
    return expected
