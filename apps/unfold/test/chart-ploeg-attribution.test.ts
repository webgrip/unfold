import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const chart = fileURLToPath(new URL('../ops/helm/unfold', import.meta.url));
const helm = (args: string[]) => spawnSync('helm', ['template', 'unfold', chart, '--namespace', 'unfold', '-f', `${chart}/values.live.example.yaml`, ...args], { encoding: 'utf8' });
const skip = spawnSync('helm', ['version'], { stdio: 'ignore' }).status !== 0 && 'helm is unavailable';
const personTokens = ['--set', 'config.ploeg.personTokens.tokenUrl=https://authentik.example/application/o/token/', '--set', 'config.ploeg.personTokens.clientId=unfold-exchange', '--set', 'config.ploeg.personTokens.clientSecretEnv=UNFOLD_EXCHANGE_CLIENT_SECRET', '--set', 'config.ploeg.personTokens.audience=ploeg-for-unfold'];
const consumer = ['--set', 'ploeg.operator.consumers[0].name=unfold', '--set', 'ploeg.operator.consumers[0].teams={delivery}', '--set', 'ploeg.operator.consumers[0].execute=true', '--set', 'ploeg.operator.consumers[0].tokenSecret.name=ploeg-operator-unfold', '--set', 'ploeg.operator.consumers[0].tokenSecret.key=token'];
const ploegPersonTokens = ['--set', 'ploeg.operator.consumers[0].audiences={ploeg-for-unfold}', '--set', 'ploeg.operator.personTokens.issuer=https://authentik.example/'];
const attribution = (rendered: string) => /- name: PLOEG_OPERATOR_ATTRIBUTION\s+value: "([a-z]+)"/.exec(rendered)?.[1];

test('the chart sets Ploeg\'s attribution to asserted, which is what Unfold without person tokens needs', { skip }, () => {
  const rendered = helm(consumer);
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.equal(attribution(rendered.stdout), 'asserted');
});

test('the chart refuses proven attribution for Ploeg while Unfold has no person tokens to send', { skip }, () => {
  const refused = helm(['--set', 'ploeg.operator.attribution=proven']);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /resolves to proven, so Ploeg refuses every change Unfold makes without a person token, and config\.ploeg\.personTokens is not set/);
  const proven = helm(['--set', 'ploeg.operator.attribution=proven', ...personTokens, ...consumer, ...ploegPersonTokens]);
  assert.equal(proven.status, 0, proven.stderr);
  assert.equal(attribution(proven.stdout), 'proven');
  const elsewhere = helm(['--set', 'ploeg.enabled=false', '--set', 'ploeg.operator.attribution=proven']);
  assert.equal(elsewhere.status, 0, 'a Ploeg this chart does not install is not judged by its values');
});
