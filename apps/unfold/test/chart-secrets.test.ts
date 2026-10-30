import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const chart = fileURLToPath(new URL('../ops/helm/unfold', import.meta.url));
const example = ['-f', `${chart}/values.live.example.yaml`, '--set', 'ploeg.enabled=false'];
const live = [...example, '--set', 'storeKey.existingSecret=', '--set', 'storeKey.allowFileOnDataVolume=true'];
const strict = [...live, '--set', 'storeKey.allowFileOnDataVolume=false'];
const helm = (args: string[], directory = chart) => spawnSync('helm', ['template', 'unfold', directory, '--namespace', 'unfold', ...args], { encoding: 'utf8' });
const skip = spawnSync('helm', ['version'], { stdio: 'ignore' }).status !== 0 && 'helm is unavailable';
const documents = (rendered: string) => rendered.split(/^---$/m).filter(document => /^kind:/m.test(document));
const workbench = (rendered: string) => documents(rendered).find(document => /^kind: Deployment$/m.test(document) && /^ {2}name: unfold$/m.test(document)) ?? '';
const secretRef = (env: string, name: string, key: string) => new RegExp(`- name: ${env}\\n {14}valueFrom:\\n {16}secretKeyRef:\\n {18}name: ${name}\\n {18}key: ${key}\\n`);
const store = ['--set', 'externalSecrets.enabled=true', '--set', 'externalSecrets.secretStoreRef.kind=SecretStore', '--set', 'externalSecrets.secretStoreRef.name=openbao'];

const rendered = (args: string[]) => {
  const result = helm(args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};

const refused = (args: string[], message: RegExp) => {
  const result = helm(args);
  assert.notEqual(result.status, 0, args.join(' '));
  assert.match(result.stderr, message, args.join(' '));
};

test('in live mode the chart refuses a store key on the data volume unless the operator opts in', { skip }, () => {
  refused(strict, /In live mode the store key must not sit on the data volume beside the database it opens: set storeKey\.existingSecret .* or externalSecrets\.storeKey, or set storeKey\.allowFileOnDataVolume: true/);
  assert.match(workbench(rendered([...strict, '--set', 'storeKey.existingSecret=unfold-store-key'])), secretRef('UNFOLD_STORE_KEY', 'unfold-store-key', 'key'));
  assert.match(workbench(rendered([...strict, '--set', 'storeKey.existingSecret=unfold-credentials', '--set', 'storeKey.secretKey=UNFOLD_STORE_KEY'])), secretRef('UNFOLD_STORE_KEY', 'unfold-credentials', 'UNFOLD_STORE_KEY'), 'a key kept in credentialsSecret is named explicitly');
  assert.doesNotMatch(workbench(rendered(live)), /UNFOLD_STORE_KEY/, 'the default opt-in keeps the key file');
  assert.match(workbench(rendered(example)), secretRef('UNFOLD_STORE_KEY', 'unfold-store-key', 'key'), 'the live example reads the key from a Secret');
  assert.match(readFileSync(`${chart}/values.yaml`, 'utf8'), /^storeKey:\n(?: {2}.*\n)*? {2}allowFileOnDataVolume: true$/m, 'the chart default keeps installs without a store key Secret rendering');
  assert.doesNotMatch(workbench(rendered(['--set', 'ploeg.enabled=false', '--set', 'storeKey.allowFileOnDataVolume=false'])), /UNFOLD_STORE_KEY/, 'the demo keeps its key file');
  refused([...strict, '--set', 'storeKey.existingSecret=unfold-store-key', ...store, '--set', 'externalSecrets.storeKey.key=unfold/store-key'], /Set the store key once: storeKey\.existingSecret or externalSecrets\.storeKey, not both/);
});

test('the install notes warn while the store key is a file on the data volume', { skip }, () => {
  const copy = mkdtempSync(join(tmpdir(), 'unfold-chart-notes-'));
  try {
    cpSync(chart, copy, { recursive: true });
    writeFileSync(join(copy, 'templates/_notes-preview.tpl'), `{{- define "notes-preview" -}}\n${readFileSync(join(chart, 'templates/NOTES.txt'), 'utf8')}{{- end -}}\n`);
    writeFileSync(join(copy, 'templates/notes-preview.yaml'), 'notes: |\n{{ include "notes-preview" . | indent 2 }}\n');
    const notes = (args: string[]) => {
      const result = helm([...args, '--show-only', 'templates/notes-preview.yaml'], copy);
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.replace(/^ {2}/gm, '');
    };
    assert.match(notes(live), /WARNING: the store key is a file on the data volume\.\nstoreKey\.allowFileOnDataVolume is true and no store key Secret is set/);
    assert.doesNotMatch(notes([...live, '--set', 'storeKey.existingSecret=unfold-store-key']), /WARNING/);
    assert.doesNotMatch(notes([...live, ...store, '--set', 'externalSecrets.storeKey.key=unfold/store-key']), /WARNING/);
    assert.doesNotMatch(notes(['--set', 'ploeg.enabled=false']), /WARNING/, 'the demo stays as it is');
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});

test('each credential can come from its own Secret key while credentialsSecret stays mounted', { skip }, () => {
  const deployment = workbench(rendered([
    ...live,
    '--set', 'credentialRefs.PLOEG_OPERATOR_UNFOLD_TOKEN.name=unfold-operator', '--set', 'credentialRefs.PLOEG_OPERATOR_UNFOLD_TOKEN.key=token',
    '--set', 'credentialRefs.UNFOLD_VERIFIER_TOKEN.name=unfold-verifier', '--set', 'credentialRefs.UNFOLD_VERIFIER_TOKEN.key=token',
    '--set', 'credentialRefs.UNFOLD_SENTRY_DSN.name=unfold-sentry', '--set', 'credentialRefs.UNFOLD_SENTRY_DSN.key=dsn',
  ]));
  assert.match(deployment, secretRef('PLOEG_OPERATOR_UNFOLD_TOKEN', 'unfold-operator', 'token'));
  assert.match(deployment, secretRef('UNFOLD_VERIFIER_TOKEN', 'unfold-verifier', 'token'));
  assert.match(deployment, secretRef('UNFOLD_SENTRY_DSN', 'unfold-sentry', 'dsn'));
  assert.match(deployment, /envFrom:\n {12}- secretRef:\n {16}name: unfold-credentials\n/, 'credentialsSecret keeps working beside the references');
  const publisher = ['--set', 'delivery.enabled=true', '--set', 'delivery.verifier.image=busybox@sha256:' + 'a'.repeat(64), '--set', 'delivery.publisher.enabled=true', '--set', 'delivery.publisher.apiUrl=https://forge.example/api/v1'];
  refused([...live, ...publisher], /delivery\.publisher\.existingSecret must name the Secret holding the publisher token, or credentialRefs or externalSecrets\.credentials must hold UNFOLD_PUBLISHER_TOKEN/);
  assert.match(workbench(rendered([...live, ...publisher, '--set', 'credentialRefs.UNFOLD_PUBLISHER_TOKEN.name=unfold-publisher', '--set', 'credentialRefs.UNFOLD_PUBLISHER_TOKEN.key=token'])), secretRef('UNFOLD_PUBLISHER_TOKEN', 'unfold-publisher', 'token'));
});

test('the chart refuses a credential reference that collides, reaches a workspace or sits in the demo', { skip }, () => {
  const operator = ['--set', 'credentialRefs.PLOEG_OPERATOR_UNFOLD_TOKEN.name=unfold-operator', '--set', 'credentialRefs.PLOEG_OPERATOR_UNFOLD_TOKEN.key=token'];
  refused(['--set', 'ploeg.enabled=false', ...operator], /mode demo gives every visitor admin; it cannot hold credentialRefs or externalSecrets\.credentials/);
  refused([...live, '--set', 'credentialRefs.UNFOLD_STORE_KEY.name=unfold-store-key', '--set', 'credentialRefs.UNFOLD_STORE_KEY.key=key'], /UNFOLD_STORE_KEY already comes from storeKey/);
  refused([...live, '--set', 'errorReports.sentry.existingSecret=unfold-sentry', '--set', 'credentialRefs.UNFOLD_SENTRY_DSN.name=other', '--set', 'credentialRefs.UNFOLD_SENTRY_DSN.key=dsn'], /UNFOLD_SENTRY_DSN already comes from errorReports\.sentry\.existingSecret/);
  refused([...live, ...operator, '--set', 'extraEnv[0].name=PLOEG_OPERATOR_UNFOLD_TOKEN', '--set', 'extraEnv[0].value=x'], /PLOEG_OPERATOR_UNFOLD_TOKEN already comes from extraEnv/);
  refused([...live, ...operator, '--set', 'workspaceAgentSecrets[0]=unfold-operator'], /workspaceAgentSecrets must not list unfold-operator/);
  refused([...live, ...operator, ...store, '--set', 'externalSecrets.credentials.PLOEG_OPERATOR_UNFOLD_TOKEN.key=ploeg/unfold-operator'], /PLOEG_OPERATOR_UNFOLD_TOKEN is in both credentialRefs and externalSecrets\.credentials/);
  refused([...live, '--set', 'credentialRefs.lowercase.name=x', '--set', 'credentialRefs.lowercase.key=y'], /'lowercase' does not match pattern/);
  refused([...live, '--set', 'credentialRefs.UNFOLD_VERIFIER_TOKEN.name=unfold-verifier'], /key/);
});

test('externalSecrets renders one ExternalSecret per credential and the store key, read from the named store', { skip }, () => {
  const output = rendered([
    ...strict, ...store,
    '--set', 'externalSecrets.storeKey.key=unfold/store-key', '--set', 'externalSecrets.storeKey.property=key',
    '--set', 'externalSecrets.credentials.PLOEG_OPERATOR_UNFOLD_TOKEN.key=ploeg/unfold-operator', '--set', 'externalSecrets.credentials.PLOEG_OPERATOR_UNFOLD_TOKEN.property=token',
    '--set', 'externalSecrets.credentials.UNFOLD_VERIFIER_TOKEN.key=ploeg/unfold-verifier',
  ]);
  const externalSecrets = documents(output).filter(document => /^kind: ExternalSecret$/m.test(document));
  assert.equal(externalSecrets.length, 3);
  const storeKey = externalSecrets.find(document => /^ {2}name: unfold-store-key$/m.test(document));
  assert.equal(storeKey?.replace(/^# Source: .*\n/m, '').trim(), `apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: unfold-store-key
  labels:
    app.kubernetes.io/name: unfold
    app.kubernetes.io/instance: unfold
    app.kubernetes.io/component: store-key
spec:
  refreshInterval: "1h"
  secretStoreRef:
    kind: SecretStore
    name: openbao
  target:
    name: unfold-store-key
    creationPolicy: Owner
    deletionPolicy: Retain
  data:
    - secretKey: key
      remoteRef:
        key: "unfold/store-key"
        property: "key"`);
  const verifier = externalSecrets.find(document => /^ {2}name: unfold-verifier-token$/m.test(document)) ?? '';
  assert.match(verifier, /data:\n {4}- secretKey: UNFOLD_VERIFIER_TOKEN\n {6}remoteRef:\n {8}key: "ploeg\/unfold-verifier"\n?$/);
  const deployment = workbench(output);
  assert.match(deployment, secretRef('UNFOLD_STORE_KEY', 'unfold-store-key', 'key'));
  assert.match(deployment, secretRef('PLOEG_OPERATOR_UNFOLD_TOKEN', 'unfold-ploeg-operator-unfold-token', 'PLOEG_OPERATOR_UNFOLD_TOKEN'));
  assert.match(deployment, secretRef('UNFOLD_VERIFIER_TOKEN', 'unfold-verifier-token', 'UNFOLD_VERIFIER_TOKEN'));
  for (const document of externalSecrets) assert.doesNotMatch(document, /^ *(value|stringData):[ \t]*\S/m, 'an ExternalSecret names where a secret lives, never the secret');
  assert.deepEqual(documents(rendered(live)).filter(document => /^kind: ExternalSecret$/m.test(document)), [], 'off by default');
  refused([...live, '--set', 'externalSecrets.enabled=true'], /externalSecrets\.enabled needs externalSecrets\.secretStoreRef\.name/);
  refused([...live, ...store, '--set', 'externalSecrets.credentials.UNFOLD_VERIFIER_TOKEN.property=token'], /externalSecrets\.credentials\.UNFOLD_VERIFIER_TOKEN needs key/);
  refused([...live, ...store, '--set', 'externalSecrets.credentials.UNFOLD_VERIFIER_TOKEN.key=x', '--set', 'workspaceAgentSecrets[0]=unfold-verifier-token'], /workspaceAgentSecrets must not list unfold-verifier-token/);
  refused([...live, '--set', 'externalSecrets.secretStoreRef.kind=Vault'], /secretStoreRef/);
});
