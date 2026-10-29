import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const chart = fileURLToPath(new URL('../ops/helm/unfold', import.meta.url));
const live = ['-f', `${chart}/values.live.example.yaml`];
const helm = (args: string[], directory = chart) => spawnSync('helm', ['template', 'unfold', directory, '--namespace', 'unfold', ...args], { encoding: 'utf8' });
const skip = spawnSync('helm', ['version'], { stdio: 'ignore' }).status !== 0 && 'helm is unavailable';
const documents = (rendered: string) => rendered.split(/^---$/m).filter(document => /^kind:/m.test(document));
const named = (rendered: string, kind: string) => documents(rendered).filter(document => new RegExp(`^kind: ${kind}$`, 'm').test(document)).map(document => /^metadata:\n(?: {2}.*\n)*? {2}name: (\S+)$/m.exec(document)?.[1]);
const ingressFrom = ['--set-json', 'ploeg.networkPolicy.ploegd.ingressFrom=[{"podSelector":{"matchLabels":{"app.kubernetes.io/name":"litellm"}}}]'];

test('the chart names Ploeg ploeg, so a release called unfold installs without two objects of one name', { skip }, () => {
  const rendered = helm(live);
  assert.equal(rendered.status, 0, rendered.stderr);
  for (const kind of ['Deployment', 'Service', 'ServiceAccount']) {
    const names = named(rendered.stdout, kind);
    assert.deepEqual(names.filter(name => name === 'unfold' || name === 'ploeg').sort(), ['ploeg', 'unfold'], `${kind}: ${names.join(', ')}`);
    assert.equal(new Set(names).size, names.length, `${kind} names repeat: ${names.join(', ')}`);
  }
});

test('the chart refuses a Ploeg named after the release, which collides with Unfold', { skip }, () => {
  const refused = helm([...live, '--set', 'ploeg.fullnameOverride=']);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /Unfold and its Ploeg would both name their Deployment, Service and ServiceAccount "unfold": set ploeg\.fullnameOverride/);
  const otherRelease = spawnSync('helm', ['template', 'ploeg', chart, '--namespace', 'unfold', ...live], { encoding: 'utf8' });
  assert.notEqual(otherRelease.status, 0, 'a release called ploeg meets the default override');
  assert.equal(helm([...live, '--set', 'ploeg.enabled=false', '--set', 'ploeg.fullnameOverride=']).status, 0, 'a Ploeg this chart does not install names nothing');
});

test('the chart admits the workbench to ploegd once ploegd names its callers', { skip }, () => {
  const open = helm(live);
  assert.equal(open.status, 0, open.stderr);
  assert.deepEqual(named(open.stdout, 'NetworkPolicy').filter(name => name === 'unfold-to-ploegd'), [], 'ploegd admits every pod while ingressFrom is empty');
  const narrowed = helm([...live, ...ingressFrom, '--set', 'ploeg.instanceOverride=ploeg']);
  assert.equal(narrowed.status, 0, narrowed.stderr);
  const policy = documents(narrowed.stdout).find(document => /^ {2}name: unfold-to-ploegd$/m.test(document));
  assert.ok(policy, 'renders unfold-to-ploegd');
  assert.match(policy, /podSelector:\n {4}matchLabels:\n {6}app\.kubernetes\.io\/name: ploeg\n {6}app\.kubernetes\.io\/instance: ploeg\n {6}ploeg\.webgrip\.dev\/component: daemon\n/);
  assert.match(policy, /- from:\n {8}- podSelector:\n {12}matchLabels:\n {14}app\.kubernetes\.io\/name: unfold\n {14}app\.kubernetes\.io\/instance: unfold\n {6}ports:\n {8}- protocol: TCP\n {10}port: 8080\n/);
  const workbench = documents(narrowed.stdout).find(document => /^kind: Deployment$/m.test(document) && /^ {2}name: unfold$/m.test(document));
  assert.match(workbench ?? '', /template:\n {4}metadata:\n {6}labels:\n {8}app\.kubernetes\.io\/name: unfold\n {8}app\.kubernetes\.io\/instance: unfold\n/, 'the policy selects the labels the workbench pods carry');
  const unenforced = helm([...live, ...ingressFrom, '--set', 'ploeg.networkPolicy.enabled=false', '--set', 'ploeg.supportProfile=unsupported']);
  assert.equal(unenforced.status, 0, unenforced.stderr);
  assert.deepEqual(named(unenforced.stdout, 'NetworkPolicy').filter(name => name === 'unfold-to-ploegd'), []);
});

test('the chart refuses live workspaces without a sandbox RuntimeClass unless the operator opts out', { skip }, () => {
  const pod = helm([...live, '--set', 'workspacePodRuntimeClassName=']);
  assert.notEqual(pod.status, 0);
  assert.match(pod.stderr, /workspacePodRuntimeClassName is empty, so agent workspaces would run on the node's default runtime .* or set workspaceAllowUnsandboxed: true/);
  const sandbox = helm([...live, '--set', 'workspaceProvisioner=sandbox', '--set', 'workspaceRuntimeClassName=']);
  assert.notEqual(sandbox.status, 0);
  assert.match(sandbox.stderr, /workspaceRuntimeClassName is empty/);
  assert.equal(helm([...live, '--set', 'workspaceProvisioner=sandbox', '--set', 'workspacePodRuntimeClassName=']).status, 0, 'the sandbox provisioner reads workspaceRuntimeClassName, kata by default');
  const optedOut = helm([...live, '--set', 'workspacePodRuntimeClassName=', '--set', 'workspaceAllowUnsandboxed=true']);
  assert.equal(optedOut.status, 0, optedOut.stderr);
  const demo = helm(['--set', 'ploeg.enabled=false']);
  assert.equal(demo.status, 0, 'the demo starts no workspace pods');
});

test('the install notes warn when workspaces run without a sandbox', { skip }, () => {
  const copy = mkdtempSync(join(tmpdir(), 'unfold-chart-notes-'));
  try {
    cpSync(chart, copy, { recursive: true });
    writeFileSync(join(copy, 'templates/_notes-preview.tpl'), `{{- define "notes-preview" -}}\n${readFileSync(join(chart, 'templates/NOTES.txt'), 'utf8')}{{- end -}}\n`);
    writeFileSync(join(copy, 'templates/notes-preview.yaml'), 'notes: |\n{{ include "notes-preview" . | indent 2 }}\n');
    const notes = (args: string[]) => {
      const rendered = helm([...args, '--show-only', 'templates/notes-preview.yaml'], copy);
      assert.equal(rendered.status, 0, rendered.stderr);
      return rendered.stdout.replace(/^ {2}/gm, '');
    };
    const unsandboxed = notes([...live, '--set', 'workspacePodRuntimeClassName=', '--set', 'workspaceAllowUnsandboxed=true']);
    assert.match(unsandboxed, /WARNING: agent workspaces run without a sandbox\.\nworkspacePodRuntimeClassName is empty and workspaceAllowUnsandboxed is true/);
    assert.match(unsandboxed, /Ploeg runs beside it as ploeg\./);
    assert.doesNotMatch(notes(live), /WARNING/);
    assert.match(notes(['--set', 'ploeg.enabled=false']), /This is the deterministic demo: it makes no model calls and spends nothing\./);
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});
