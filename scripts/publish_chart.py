import json
import io
import os
import sys
import tarfile
import tempfile
from pathlib import Path

from publish_release import release_tag
from release_registry import Registry, command, digest, require_same


def publish(application, version):
    release_tag(application, version)
    chart = 'de-vloer' if application == 'vloer' else 'ploeg'
    path = f'apps/{application}/ops/helm/{chart}'
    metadata = command('helm', 'show', 'chart', path)
    for line in [f'version: {version}', f'appVersion: {version}']:
        if line not in metadata:
            raise RuntimeError('Chart metadata does not match the release version')
    registry = Registry('harbor.webgrip.dev', os.environ['HARBOR_ROBOT_USER'], os.environ['HARBOR_ROBOT_TOKEN'])
    repository = f'webgrip/charts/{chart}'
    existing = registry.manifest(repository, version, missing=True)
    with tempfile.TemporaryDirectory() as directory:
        command('helm', 'package', path, '--destination', directory)
        archive = (Path(directory) / f'{chart}-{version}.tgz').read_bytes()
        shown = command('helm', 'show', 'chart', str(Path(directory) / f'{chart}-{version}.tgz'))
        require_same(shown, metadata, 'packaged chart metadata')
        if existing is None:
            command('helm', 'push', str(Path(directory) / f'{chart}-{version}.tgz'), 'oci://harbor.webgrip.dev/webgrip/charts')
    manifest = json.loads(registry.manifest(repository, version))
    config = json.loads(registry.blob(repository, manifest['config']['digest']))
    require_same(config['version'], version, 'published chart version')
    require_same(config['appVersion'], version, 'published chart appVersion')
    layer = next(layer for layer in manifest['layers'] if layer['mediaType'] == 'application/vnd.cncf.helm.chart.content.v1.tar+gzip')
    published = registry.blob(repository, layer['digest'])
    require_same(chart_files(published), chart_files(archive), 'published chart contents')
    print(f'Published {repository}:{version}')


def chart_files(archive):
    with tarfile.open(fileobj=io.BytesIO(archive)) as source:
        return {entry.name: digest(source.extractfile(entry).read()) for entry in source if entry.isfile()}


if __name__ == '__main__':
    publish(sys.argv[1], sys.argv[2])
