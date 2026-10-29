import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const chart = fileURLToPath(new URL('../ops/helm/unfold', import.meta.url));
const demo = (args: string[]) => spawnSync('helm', ['template', 'unfold', chart, '--namespace', 'unfold', '--set', 'ploeg.enabled=false', ...args], { encoding: 'utf8' });
const skip = spawnSync('helm', ['version'], { stdio: 'ignore' }).status !== 0 && 'helm is unavailable';
const personTokens = ['--set', 'config.ploeg.personTokens.tokenUrl=https://authentik.example/application/o/token/', '--set', 'config.ploeg.personTokens.clientId=unfold-exchange', '--set', 'config.ploeg.personTokens.clientSecretEnv=UNFOLD_EXCHANGE_CLIENT_SECRET', '--set', 'config.ploeg.personTokens.audience=ploeg-for-unfold'];
const config = (rendered: string) => JSON.parse(JSON.parse(/config\.json: (".*")/.exec(rendered)![1]));

test('the chart renders demo mode, and the demo Ploeg, without a credential', { skip }, () => {
  const plain = demo([]);
  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(config(plain.stdout).mode, 'demo');
  assert.doesNotMatch(plain.stdout, /envFrom:/, 'demo mode mounts no credentials Secret');
  const ploegDemo = demo(['--set', 'config.ploeg.url=http://ploeg.ploeg.svc:8080', '--set', 'config.ploeg.demo=true', '--set', 'config.reports=false']);
  assert.equal(ploegDemo.status, 0, ploegDemo.stderr);
  assert.equal(config(ploegDemo.stdout).ploeg.demo, true);
});

test('the chart refuses demo mode with a real Ploeg or any other credential, because every visitor is admin', { skip }, () => {
  const refused: [string[], RegExp][] = [
    [['--set', 'config.ploeg.url=http://ploeg.ploeg.svc:8080', '--set', 'config.ploeg.tokenEnv=PLOEG_OPERATOR_UNFOLD_TOKEN'], /mode demo gives every visitor admin; it cannot use a real Ploeg\. Set mode: live, or use config\.ploeg\.demo/],
    [['--set', 'config.ploeg.url=http://ploeg.ploeg.svc:8080'], /cannot use a real Ploeg/],
    [['--set', 'config.ploeg.url=http://ploeg.ploeg.svc:8080', '--set', 'config.ploeg.demo=true', '--set', 'config.ploeg.tokenEnv=PLOEG_OPERATOR_UNFOLD_TOKEN'], /cannot hold config\.ploeg\.tokenEnv/],
    [['--set', 'config.ploeg.url=http://ploeg.ploeg.svc:8080', '--set', 'config.ploeg.demo=true', ...personTokens], /cannot hold config\.ploeg\.personTokens/],
    [['--set', 'config.execution.team=delivery'], /cannot use config\.execution/],
    [['--set', 'config.links.gitlab.baseUrl=https://gitlab.example'], /cannot use config\.links/],
    [['--set', 'config.delivery.verifierTokenEnv=UNFOLD_VERIFIER_TOKEN'], /cannot use config\.delivery/],
    [['--set', 'config.taskSources[0].id=board', '--set', 'config.taskSources[0].tokenEnv=UNFOLD_TASK_VIKUNJA_TOKEN'], /cannot hold the token of task source board/],
    [['--set', 'config.reports.tokenEnv=UNFOLD_REPORTS_TOKEN'], /cannot hold config\.reports\.tokenEnv/],
  ];
  for (const [args, message] of refused) {
    const rendered = demo(args);
    assert.notEqual(rendered.status, 0, args.join(' '));
    assert.match(rendered.stderr, message, args.join(' '));
  }
});

test('the chart keeps rendering live mode with a real Ploeg', { skip }, () => {
  const live = spawnSync('helm', ['template', 'unfold', chart, '--namespace', 'unfold', '-f', `${chart}/values.live.example.yaml`, '--set', 'ploeg.enabled=false'], { encoding: 'utf8' });
  assert.equal(live.status, 0, live.stderr);
  assert.equal(config(live.stdout).mode, 'live');
});
