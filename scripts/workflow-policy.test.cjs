'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { parse } = require('yaml');

const root = path.resolve(__dirname, '..');
const read = relative => parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const workflows = Object.fromEntries(fs.readdirSync(path.join(root, '.forgejo/workflows')).map(file => [file, read(`.forgejo/workflows/${file}`)]));
const source = workflows['on_source_change.yml'];
const publisher = workflows['on_release_published.yml'];
const evaluate = (expression, context) => vm.runInNewContext(expression.replace(/^\$\{\{\s*|\s*\}\}$/g, '').replace(/needs\.([a-z-]+)/g, "needs['$1']"), { startsWith: (value, prefix) => value.startsWith(prefix), ...context });

test('event entry points preserve validation and keep application publication out of pull requests and docs', () => {
  assert.deepEqual(Object.keys(workflows).sort(), ['on_docs_change.yml', 'on_pull_request.yml', 'on_release_preview.yml', 'on_release_published.yml', 'on_source_change.yml']);
  assert.deepEqual(Object.keys(source.on).sort(), ['push', 'workflow_dispatch']);
  const pr = workflows['on_pull_request.yml'];
  assert.deepEqual(Object.keys(pr.on).sort(), ['pull_request', 'workflow_dispatch']);
  assert.deepEqual(Object.keys(pr.jobs).sort(), ['checks', 'release-policy']);
  for (const job of Object.keys(pr.jobs)) assert.deepEqual(pr.jobs[job], source.jobs[job]);
  for (const name of ['on_pull_request.yml', 'on_docs_change.yml']) {
    assert.doesNotMatch(JSON.stringify(workflows[name]), /GLIDE_RELEASES_ENABLED|contents":"write|semantic-release-monorepo@/);
  }
  const verification = read('.forgejo/actions/verify/action.yml');
  assert.ok(verification.runs.steps.some(step => step.run === 'mise run verify'));
  assert.doesNotMatch(JSON.stringify(pr), /secrets\./);
  assert.equal(workflows['on_docs_change.yml'].jobs['generate-documentation'].with['prepare-command'], 'python3 scripts/docs.py --check --stage-only');
});

test('only an enabled development push can version applications after both gates', () => {
  assert.equal(source.concurrency['cancel-in-progress'], false);
  for (const app of ['vloer', 'ploeg']) {
    const job = source.jobs[`release-${app}`];
    assert.ok(job.needs.includes('checks'));
    assert.ok(job.needs.includes('release-policy'));
    if (app === 'ploeg') assert.ok(job.needs.includes('release-vloer'));
    const release = job.steps.find(step => step.id === 'release');
    assert.equal(release.with['package-path'], `apps/${app}`);
    assert.equal(release.with['package-name'], app);
    for (const event_name of ['push', 'pull_request', 'workflow_dispatch', 'release']) {
      for (const ref of ['refs/heads/development', 'refs/heads/main', 'refs/heads/topic', 'refs/tags/vloer-v0.3.0']) {
        for (const gate of ['', 'false', 'true']) {
          const enabled = evaluate(job.if, { github: { event_name, ref }, vars: { GLIDE_RELEASES_ENABLED: gate } });
          assert.equal(enabled, event_name === 'push' && ref === 'refs/heads/development' && gate === 'true');
        }
      }
    }
  }
});

test('release channel notes mirror only on an enabled development push after both source gates pass, whether or not a release ran', () => {
  const job = source.jobs['mirror-source-metadata'];
  assert.deepEqual(job.needs, ['checks', 'release-policy', 'release-ploeg']);
  assert.ok(job.steps.some(step => step.run === 'python3 scripts/sync_release_notes.py'));
  for (const event_name of ['push', 'workflow_dispatch']) {
    for (const ref of ['refs/heads/development', 'refs/heads/main']) {
      for (const gate of ['', 'false', 'true']) {
        for (const checks of ['success', 'failure', 'skipped']) {
          for (const policy of ['success', 'failure']) {
            for (const release of ['success', 'skipped', 'failure']) {
              const context = { always: () => true, github: { event_name, ref }, vars: { GLIDE_RELEASES_ENABLED: gate }, needs: { checks: { result: checks }, 'release-policy': { result: policy }, 'release-ploeg': { result: release } } };
              assert.equal(evaluate(job.if, context), event_name === 'push' && ref === 'refs/heads/development' && gate === 'true' && checks === 'success' && policy === 'success', `${event_name} ${ref} ${gate} ${checks} ${policy} ${release}`);
            }
          }
        }
      }
    }
  }
});

test('the CI verify gate requires the imported release notes the mirror prunes against', () => {
  const verification = read('.forgejo/actions/verify/action.yml');
  const step = verification.runs.steps.find(step => step.run === 'mise run verify');
  assert.equal(step.env.GLIDE_REQUIRE_IMPORT_NOTES, 'true');
});

test('every published image passes its application CVE budget before signing', () => {
  const gate = './.forgejo/actions/cve-gate';
  const vloer = publisher.jobs['vloer-release-distribute-harbor'].steps;
  const vloerGate = vloer.findIndex(step => step.uses === gate);
  assert.ok(vloerGate > vloer.findIndex(step => step.id === 'digest'));
  assert.ok(vloerGate < vloer.findIndex(step => step.uses?.includes('/cosign-sign-attest@')));
  assert.equal(vloer[vloerGate].with['budgets-file'], 'apps/vloer/ops/security/cve-budgets.yaml');
  const ploeg = publisher.jobs['ploeg-release-distribute-harbor'].steps;
  const ploegGate = ploeg.find(step => step.uses === gate);
  assert.ok(ploegGate, 'Ploeg image build must run the CVE gate');
  assert.ok(ploeg.findIndex(step => step.uses === gate) > ploeg.findIndex(step => step.id === 'digest'));
  assert.equal(ploegGate.with['image-ref'], '${{ steps.digest.outputs.ref }}');
  assert.equal(ploegGate.with['image-name'], 'ploegd');
  assert.ok(publisher.jobs['ploeg-release-sign-harbor'].needs.includes('ploeg-release-distribute-harbor'));
  for (const app of ['vloer', 'ploeg']) {
    const image = app === 'vloer' ? 'de-vloer' : 'ploegd';
    const budgets = parse(fs.readFileSync(path.join(root, `apps/${app}/ops/security/cve-budgets.yaml`), 'utf8'));
    assert.equal(budgets.images[image].mode, 'enforce');
    assert.ok(fs.statSync(path.join(root, `apps/${app}/ops/vex/statements`)).isDirectory());
  }
});

test('preview uses the release toolchain and remains a manual dry run', () => {
  const preview = workflows['on_release_preview.yml'];
  assert.deepEqual(Object.keys(preview.on), ['workflow_dispatch']);
  assert.deepEqual(Object.keys(preview.jobs), ['preflight', 'preview']);
  const job = preview.jobs.preview;
  assert.deepEqual(job.container, source.jobs['release-vloer'].container);
  assert.deepEqual(job.strategy.matrix.application, ['vloer', 'ploeg']);
  const step = job.steps.find(step => step.with?.['dry-run']);
  assert.equal(step.with['dry-run'], 'true');
  assert.equal(step.uses, source.jobs['release-vloer'].steps.find(step => step.id === 'release').uses);
  assert.equal(evaluate(job.if, { github: { ref: 'refs/heads/development' } }), true);
  assert.equal(evaluate(job.if, { github: { ref: 'refs/heads/main' } }), false);
});

test('release routing disables every publisher for a closed gate or the other application', () => {
  assert.deepEqual(Object.keys(publisher.on).sort(), ['release', 'workflow_dispatch']);
  assert.deepEqual(publisher.on.release.types, ['published']);
  assert.equal(publisher.concurrency['cancel-in-progress'], false);
  for (const selected of ['vloer', 'ploeg', 'unrelated']) {
    for (const event_name of ['release', 'workflow_dispatch']) {
      for (const gate of ['', 'false', 'true']) {
        const tag = `${selected}-v0.3.0-rc.5`;
        const context = { github: { event_name, event: { release: { tag_name: event_name === 'release' ? tag : '' } } }, inputs: { tag: event_name === 'workflow_dispatch' ? tag : '' }, vars: { GLIDE_RELEASES_ENABLED: gate }, needs: {} };
        for (const app of ['vloer', 'ploeg']) {
          const parsed = evaluate(publisher.jobs[`${app}-parse-release-tag`].if, context);
          assert.equal(parsed, selected === app && gate === 'true');
          context.needs[`${app}-parse-release-tag`] = { outputs: { version: parsed ? '0.3.0-rc.5' : '' } };
        }
        context.needs['ploeg-release-sign-harbor'] = { outputs: { signed: 'true' } };
        for (const [name, job] of Object.entries(publisher.jobs).filter(([name]) => !name.endsWith('-parse-release-tag'))) {
          assert.equal(evaluate(job.uses ? job.with.enabled : job.if, context), name.startsWith(`${selected}-`) && gate === 'true', name);
        }
      }
    }
  }
});

test('Ploeg mirrors require completed signing even when Forgejo omits job result fields', () => {
  const sign = publisher.jobs['ploeg-release-sign-harbor'];
  assert.equal(sign.outputs.signed, '${{ steps.signed.outputs.ready }}');
  assert.ok(sign.steps.findIndex(step => step.id === 'signed') > sign.steps.findIndex(step => step.uses?.includes('/cosign-sign-attest@')));
  for (const name of ['ploeg-release-distribute']) {
    const job = publisher.jobs[name];
    assert.ok(job.needs.includes('ploeg-release-sign-harbor'));
    for (const signed of ['', 'false', 'true']) {
      assert.equal(evaluate(job.if, { needs: {
        'ploeg-parse-release-tag': { outputs: { version: '0.3.0-rc.5' } },
        'ploeg-release-sign-harbor': { outputs: { signed } },
      } }), signed === 'true', `${name}: ${signed}`);
    }
  }
});

test('workflow dependencies resolve, reusable calls are pinned and local actions follow checkout', () => {
  const checkSteps = (steps, label, composite = false) => {
    let checkedOut = false;
    for (const step of steps) {
      if (step.uses?.startsWith('actions/checkout@')) checkedOut = true;
      if (step.uses?.startsWith('./')) {
        assert.ok(checkedOut, `${label}: checkout must precede a local action`);
        const action = read(`${step.uses}/action.yml`);
        assert.equal(action.runs.using, 'composite');
        checkSteps(action.runs.steps, step.uses, true);
      }
      if (step.run) {
        if (composite) assert.equal(step.shell, 'bash');
        const result = spawnSync('bash', ['-n'], { input: step.run, encoding: 'utf8' });
        assert.equal(result.status, 0, `${label}: ${result.stderr}`);
      }
    }
  };
  for (const [file, workflow] of Object.entries(workflows)) {
    for (const [name, job] of Object.entries(workflow.jobs)) {
      for (const dependency of job.needs || []) assert.ok(workflow.jobs[dependency], `${file}: missing ${dependency}`);
      for (const [, dependency] of JSON.stringify(job).matchAll(/needs\.([a-z-]+)\./g)) assert.ok(job.needs?.includes(dependency), `${file}: ${name} reads undeclared dependency ${dependency}`);
      if (job.uses) {
        assert.match(job.uses, /^webgrip\/workflows\/\.forgejo\/workflows\/[a-z-]+\.yml@(?:v\d+\.\d+\.\d+|[a-f0-9]{40})$/);
        assert.equal(typeof job.with.enabled, 'string');
      } else {
        assert.equal(job['runs-on'], 'docker');
        checkSteps(job.steps, `${file}: ${name}`);
      }
      const visit = (id, ancestors = []) => {
        assert.ok(!ancestors.includes(id), `${file}: circular dependency ${id}`);
        for (const parent of workflow.jobs[id].needs || []) visit(parent, [...ancestors, id]);
      };
      visit(name);
    }
  }
  for (const app of ['vloer', 'ploeg']) assert.ok(!fs.existsSync(path.join(root, `apps/${app}/.forgejo`)), `apps/${app}/.forgejo is never read by Forgejo`);
});


test('documentation publication has its own gate and isolated storage', () => {
  const job = workflows['on_docs_change.yml'].jobs['deploy-docs-site'];
  assert.deepEqual(job.needs, ['generate-documentation', 'authorize-publication']);
  assert.equal(job.with.bucket, 'docs-glide');
  assert.equal(job.with['dest-prefix'], 'glide');
  assert.equal(job.with.strict, 'true');
  assert.deepEqual(Object.keys(job.secrets).sort(), ['TECHDOCS_S3_ACCESS_KEY_ID', 'TECHDOCS_S3_SECRET_ACCESS_KEY']);
  for (const ref of ['refs/heads/development', 'refs/heads/main', 'refs/heads/topic']) {
    for (const gate of ['', 'false', 'true']) {
      const step = workflows['on_docs_change.yml'].jobs['authorize-publication'].steps[0];
      const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-gate-'));
      const output = path.join(temporary, 'output');
      const result = spawnSync('sh', ['-c', step.run], { encoding: 'utf8', env: { ...process.env, DOCS_REF: ref, DOCS_ENABLED: gate, GITHUB_OUTPUT: output } });
      assert.equal(result.status, 0);
      const enabled = ref === 'refs/heads/development' && gate === 'true' ? 'true' : 'false';
      assert.equal(fs.readFileSync(output, 'utf8'), `enabled=${enabled}\n`);
      fs.rmSync(temporary, { recursive: true });
      assert.equal(evaluate(job.with.enabled, { needs: { 'authorize-publication': { outputs: { enabled } } } }), enabled);
    }
  }
});


test('live verification follows publication and only runs for an authorized publish', () => {
  const job = workflows['on_docs_change.yml'].jobs['verify-publication'];
  assert.deepEqual(job.needs, ['authorize-publication', 'deploy-docs-site']);
  assert.ok(job.steps.some(step => step.run === 'python3 scripts/docs-live.py'));
  for (const enabled of ['', 'false', 'true']) {
    assert.equal(evaluate(job.if, { needs: { 'authorize-publication': { outputs: { enabled } } } }), enabled === 'true');
  }
});
