import base64
import hashlib
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

from publish_release import FORGEJO, ROOT, api, attach_forgejo, fetch_asset, git, release_tag
from release_registry import OPENBAO, PUBLIC_KEY, SIGNING_KEY, command, require_same, revoke_signing_session, signing_identity, signing_session


EXTENSION = ROOT / 'apps/unfold/extensions/vscode'
WORKFLOW = '.forgejo/workflows/on_release_published.yml'
PROVENANCE_TYPE = 'slsaprovenance1'
PROVENANCE_PREDICATE = 'https://slsa.dev/provenance/v1'
BUILD_TYPE = 'https://webgrip.dev/attestations/unfold-vsix-build/v1'


def asset_names(version):
    vsix = f'unfold-{version}.vsix'
    return {'vsix': vsix, 'checksum': vsix + '.sha256', 'signature': vsix + '.sig', 'provenance': vsix + '.intoto.json'}


def tagged_revision(tag):
    revision = git('rev-parse', f'{tag}^{{commit}}')
    require_same(git('rev-parse', 'HEAD'), revision, 'extension signer checkout')
    return revision


def provenance(version, revision, environ=os.environ):
    server = environ['GITHUB_SERVER_URL'].rstrip('/')
    repository = environ['GITHUB_REPOSITORY']
    tag = release_tag('unfold', version)
    source = f'{server}/{repository}'
    return {
        'buildDefinition': {
            'buildType': BUILD_TYPE,
            'externalParameters': {'workflow': {'repository': source, 'path': WORKFLOW, 'ref': f'refs/tags/{tag}'}, 'version': version},
            'internalParameters': {'event': environ.get('GITHUB_EVENT_NAME', '')},
            'resolvedDependencies': [{'uri': f'git+{source}@refs/tags/{tag}', 'digest': {'gitCommit': revision}}],
        },
        'runDetails': {
            'builder': {'id': f'{source}/{WORKFLOW}'},
            'metadata': {'invocationId': f'{source}/actions/runs/{environ["GITHUB_RUN_ID"]}'},
        },
    }


def require_cosign():
    if shutil.which('cosign') is None:
        raise RuntimeError('cosign is not on the runner; the extension is signed with the same cosign the chart job uses')


def checksum_line(content, name):
    return f'{hashlib.sha256(content).hexdigest()}  {name}'


def verify_files(directory, names, revision):
    vsix = Path(directory) / names['vsix']
    content = vsix.read_bytes()
    recorded = (Path(directory) / names['checksum']).read_text().split()
    require_same(recorded, checksum_line(content, names['vsix']).split(), 'released VSIX checksum')
    command('cosign', 'verify-blob', '--key', PUBLIC_KEY, '--insecure-ignore-tlog', '--signature', str(Path(directory) / names['signature']), str(vsix))
    command('cosign', 'verify-blob-attestation', '--key', PUBLIC_KEY, '--insecure-ignore-tlog', '--type', PROVENANCE_TYPE, '--signature', str(Path(directory) / names['provenance']), str(vsix))
    envelope = json.loads((Path(directory) / names['provenance']).read_text())
    statement = json.loads(base64.b64decode(envelope['payload']))
    require_same(statement['predicateType'], PROVENANCE_PREDICATE, 'VSIX provenance predicate type')
    require_same(statement['subject'], [{'name': names['vsix'], 'digest': {'sha256': hashlib.sha256(content).hexdigest()}}], 'VSIX provenance subject')
    dependencies = statement['predicate']['buildDefinition']['resolvedDependencies']
    require_same([dependency['digest'].get('gitCommit') for dependency in dependencies], [revision], 'VSIX provenance source commit')
    return hashlib.sha256(content).hexdigest()


def released(version, token):
    release = api(f'{FORGEJO}/releases/tags/{release_tag("unfold", version)}', token)
    return release, {asset['name']: asset for asset in release.get('assets', [])}


def sign(version, environ=os.environ):
    require_cosign()
    names = asset_names(version)
    tag = release_tag('unfold', version)
    revision = tagged_revision(tag)
    token = environ['WEBGRIP_CI_TOKEN']
    release, assets = released(version, token)
    vsix = EXTENSION / names['vsix']
    content = vsix.read_bytes()
    require_same(fetch_asset(assets[names['checksum']], token).decode().split(), checksum_line(content, names['vsix']).split(), 'canonical VSIX checksum')
    missing = [kind for kind in ('signature', 'provenance') if names[kind] not in assets]
    if not missing:
        print(f'{names["vsix"]} already carries its signature and provenance on {tag}; the verification step checks them')
        return []
    with tempfile.TemporaryDirectory(prefix='vsix-sign-') as directory:
        work = Path(directory)
        shutil.copyfile(vsix, work / names['vsix'])
        (work / 'provenance.json').write_text(json.dumps(provenance(version, revision, environ), indent=2) + '\n')
        session = signing_session(signing_identity(environ))
        try:
            signer = {**environ, 'VAULT_ADDR': OPENBAO, 'VAULT_TOKEN': session}
            if 'signature' in missing:
                command('cosign', 'sign-blob', '--yes', '--tlog-upload=false', '--key', SIGNING_KEY, '--output-signature', str(work / names['signature']), str(work / names['vsix']), env=signer)
            if 'provenance' in missing:
                command('cosign', 'attest-blob', '--yes', '--tlog-upload=false', '--key', SIGNING_KEY, '--type', PROVENANCE_TYPE, '--predicate', str(work / 'provenance.json'), '--output-signature', str(work / names['provenance']), str(work / names['vsix']), env=signer)
        finally:
            revoke_signing_session(session)
        for kind in ('signature', 'provenance'):
            if kind not in missing:
                (work / names[kind]).write_bytes(fetch_asset(assets[names[kind]], token))
        (work / names['checksum']).write_text(checksum_line(content, names['vsix']) + '\n')
        verify_files(work, names, revision)
        for kind in missing:
            attach_forgejo(release, names[kind], (work / names[kind]).read_bytes(), token)
            print(f'attached {names[kind]} to {tag}')
    return missing


def verify(version, environ=os.environ):
    require_cosign()
    names = asset_names(version)
    tag = release_tag('unfold', version)
    revision = tagged_revision(tag)
    token = environ['WEBGRIP_CI_TOKEN']
    _, assets = released(version, token)
    absent = [name for name in names.values() if name not in assets]
    if absent:
        raise RuntimeError(f'{tag} is missing {", ".join(absent)}; the extension job attaches every one before a registry publishes the VSIX')
    with tempfile.TemporaryDirectory(prefix='vsix-verify-') as directory:
        for name in names.values():
            (Path(directory) / name).write_bytes(fetch_asset(assets[name], token))
        sha256 = verify_files(directory, names, revision)
    summary = environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a') as handle:
            handle.write(f'### VS Code extension {version}\n\n- `{names["vsix"]}` sha256 `{sha256}` matches `{names["checksum"]}`\n- `{names["signature"]}` verifies against `ops/security/cosign.pub`\n- `{names["provenance"]}` is SLSA provenance for commit `{revision}`, verified against the same key\n\n')
    print(f'{names["vsix"]} on {tag}: checksum, signature and provenance verify against {PUBLIC_KEY}')
    return sha256


if __name__ == '__main__':
    {'sign': sign, 'verify': verify}[sys.argv[1]](sys.argv[2])
