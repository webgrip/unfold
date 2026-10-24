import json
import io
import os
import re
import shutil
import sys
import tarfile
import tempfile
from pathlib import Path

from publish_release import publishable_tag
from release_registry import Registry, command, digest, require_same, sign_once

IMAGE_DIGESTS = {'unfold': 'UNFOLD_IMAGE_DIGEST', 'unfold-agent': 'UNFOLD_AGENT_IMAGE_DIGEST'}
WORKSPACE_REPOSITORY = 'ghcr.io/webgrip/unfold-agent'
DIGEST = re.compile(r'^sha256:[0-9a-f]{64}$')
IMAGE_BLOCK = re.compile(r'^(image:\n  repository: \S+\n)  tag: ""\n  digest: ""\n', re.M)
WORKSPACE_IMAGE = re.compile(r'^workspaceImage: ""$', re.M)


def released_digests(registry, version, environ=os.environ):
    digests = {}
    for name, variable in IMAGE_DIGESTS.items():
        value = environ.get(variable, '')
        if not DIGEST.match(value):
            raise RuntimeError(f'{variable} must be the pushed digest of webgrip/{name}:{version}, got {value!r}; the chart is published only after every image of the release')
        require_same(digest(registry.manifest(f'webgrip/{name}', version)), value, f'{registry.host}/webgrip/{name}:{version}')
        digests[name] = value
    return digests


def release_values(values, version, digests):
    values, images = IMAGE_BLOCK.subn(rf'\g<1>  tag: "{version}"\n  digest: "{digests["unfold"]}"\n', values)
    values, workspaces = WORKSPACE_IMAGE.subn(f'workspaceImage: {WORKSPACE_REPOSITORY}:{version}@{digests["unfold-agent"]}', values)
    if (images, workspaces) != (1, 1):
        raise RuntimeError('values.yaml must hold one empty image.tag and image.digest and one empty workspaceImage for the release to fill')
    return values


def rendered_images(archive_path):
    rendered = command('helm', 'template', 'unfold', archive_path, '--set', 'ploeg.enabled=false', '--set', 'mode=live', '--set', 'baseUrl=https://unfold.invalid')
    return sorted(set(re.findall(r'^\s*(?:- )?image: "?([^"\s]+)"?\s*$', rendered, re.M)) | set(re.findall(r'\\?"image\\?":\s*\\?"([^"\\]+)', rendered)))


def locked_ploeg(chart_directory):
    lock = (Path(chart_directory) / 'Chart.lock').read_text()
    match = re.search(r'^- name: ploeg\n(?:  .*\n)*?  version: (\S+)$', lock, re.M)
    if not match:
        raise RuntimeError('Chart.lock lists no ploeg dependency')
    return match[1]


def require_complete(archive_path, archive, version, digests, ploeg):
    expected = {f'ghcr.io/webgrip/unfold@{digests["unfold"]}', f'{WORKSPACE_REPOSITORY}:{version}@{digests["unfold-agent"]}'}
    images = rendered_images(archive_path)
    unpinned = [image for image in images if '@sha256:' not in image]
    if unpinned or not expected <= set(images):
        raise RuntimeError(f'the packaged chart must render every Unfold image by its released digest; rendered {images}')
    with tarfile.open(fileobj=io.BytesIO(archive)) as source:
        try:
            carried = source.extractfile('unfold/charts/ploeg/Chart.yaml').read().decode()
        except KeyError:
            carried = ''
    match = re.search(r'^version: (\S+)$', carried, re.M)
    require_same(match[1] if match else None, ploeg, 'the Ploeg chart the packaged chart carries')


def publish(application, version):
    publishable_tag(application, version)
    chart = 'unfold'
    path = f'apps/{application}/ops/helm/{chart}'
    metadata = command('helm', 'show', 'chart', path)
    for line in [f'version: {version}', f'appVersion: {version}']:
        if line not in metadata:
            raise RuntimeError('Chart metadata does not match the release version')
    registry = Registry('harbor.webgrip.dev', os.environ['HARBOR_ROBOT_USER'], os.environ['HARBOR_ROBOT_TOKEN'])
    digests = released_digests(registry, version)
    repository = f'webgrip/charts/{chart}'
    existing = registry.manifest(repository, version, missing=True)
    with tempfile.TemporaryDirectory() as directory:
        staged = Path(directory) / 'source' / chart
        shutil.copytree(path, staged, ignore=shutil.ignore_patterns('charts'))
        values = staged / 'values.yaml'
        values.write_text(release_values(values.read_text(), version, digests))
        command('helm', 'dependency', 'build', str(staged))
        command('helm', 'package', str(staged), '--destination', directory)
        packaged = str(Path(directory) / f'{chart}-{version}.tgz')
        archive = Path(packaged).read_bytes()
        shown = command('helm', 'show', 'chart', packaged)
        require_same(shown, metadata, 'packaged chart metadata')
        require_complete(packaged, archive, version, digests, locked_ploeg(staged))
        if existing is None:
            command('helm', 'push', packaged, 'oci://harbor.webgrip.dev/webgrip/charts')
    published_manifest = registry.manifest(repository, version)
    manifest = json.loads(published_manifest)
    config = json.loads(registry.blob(repository, manifest['config']['digest']))
    require_same(config['version'], version, 'published chart version')
    require_same(config['appVersion'], version, 'published chart appVersion')
    layer = next(layer for layer in manifest['layers'] if layer['mediaType'] == 'application/vnd.cncf.helm.chart.content.v1.tar+gzip')
    published = registry.blob(repository, layer['digest'])
    require_same(chart_files(published), chart_files(archive), 'published chart contents')
    reference = f'{registry.host}/{repository}@{digest(published_manifest)}'
    print(f'{"Signed" if sign_once(reference) else "Kept the existing signature of"} {reference}')
    print(f'Published {repository}:{version} with {", ".join(f"{name}@{value}" for name, value in digests.items())}')


def chart_files(archive):
    with tarfile.open(fileobj=io.BytesIO(archive)) as source:
        return {entry.name: digest(source.extractfile(entry).read()) for entry in source if entry.isfile()}


if __name__ == '__main__':
    publish(sys.argv[1], sys.argv[2])
