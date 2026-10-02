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
const verifyStep = step => /^set -o pipefail; mise run verify 2>&1 \| tee /.test(step.run ?? '');
const evaluate = (expression, context) => vm.runInNewContext(expression.replace(/^\$\{\{\s*|\s*\}\}$/g, '').replace(/needs\.([a-z-]+)/g, "needs['$1']"), { startsWith: (value, prefix) => value.startsWith(prefix), always: () => true, ...context });

test('event entry points preserve validation and keep application publication out of pull requests and docs', () => {
  assert.deepEqual(Object.keys(workflows).sort(), ['on_docs_change.yml', 'on_pull_request.yml', 'on_release_preview.yml', 'on_release_published.yml', 'on_schedule.yml', 'on_source_change.yml']);
  assert.deepEqual(Object.keys(source.on).sort(), ['push', 'workflow_dispatch']);
  const pr = workflows['on_pull_request.yml'];
  assert.deepEqual(Object.keys(pr.on).sort(), ['pull_request', 'workflow_dispatch']);
  assert.deepEqual(Object.keys(pr.jobs).sort(), ['checks', 'release-policy', 'warnings']);
  assert.deepEqual(pr.jobs.checks, source.jobs.checks);
  assert.deepEqual(pr.jobs.warnings, source.jobs.warnings);
  assert.deepEqual(pr.jobs['release-policy'].container, source.jobs.release.container);
  assert.deepEqual(pr.jobs['release-policy'].steps, source.jobs.release.steps.slice(0, 2));
  for (const name of ['on_pull_request.yml', 'on_docs_change.yml']) {
    assert.doesNotMatch(JSON.stringify(workflows[name]), /GLIDE_RELEASES_ENABLED|contents":"write|semantic-release-monorepo@/);
  }
  const verification = read('.forgejo/actions/verify/action.yml');
  assert.ok(verification.runs.steps.some(verifyStep));
  assert.doesNotMatch(JSON.stringify(pr), /secrets\./);
  assert.equal(workflows['on_docs_change.yml'].jobs['generate-documentation'].with['prepare-command'], 'python3 scripts/docs.py --check --stage-only');
});

test('only an enabled development push can version Unfold, after the checks and the release policy', () => {
  assert.equal(source.concurrency['cancel-in-progress'], false);
  assert.deepEqual(Object.keys(source.jobs).sort(), ['checks', 'release', 'site-release', 'warnings']);
  const job = source.jobs.release;
  assert.deepEqual(job.needs, ['checks']);
  const policy = job.steps.findIndex(step => step.uses === './.forgejo/actions/release-policy');
  assert.ok(policy > 0 && policy < job.steps.findIndex(step => step.id === 'release'), 'the release policy runs in the release job before versioning');
  const release = job.steps.find(step => step.id === 'release');
  assert.equal(release.with['package-path'], 'apps');
  assert.equal(release.with['package-name'], 'unfold');
  for (const event_name of ['push', 'pull_request', 'workflow_dispatch', 'release']) {
    for (const ref of ['refs/heads/development', 'refs/heads/main', 'refs/heads/topic', 'refs/tags/unfold-v0.4.0-rc.1']) {
      for (const gate of ['', 'false', 'true']) {
        const enabled = evaluate(job.if, { github: { event_name, ref }, vars: { GLIDE_RELEASES_ENABLED: gate } });
        assert.equal(enabled, event_name === 'push' && ref === 'refs/heads/development' && gate === 'true');
      }
    }
  }
});

test('warnings from setup and verification turn their own job red without gating a release', () => {
  const verification = read('.forgejo/actions/verify/action.yml');
  const captured = verification.runs.steps.filter(step => / 2>&1 \| tee (-a )?"\$\{RUNNER_TEMP:-\/tmp\}\/unfold-output\//.test(step.run ?? ''));
  assert.deepEqual(captured.map(step => step.run.match(/mise (.+?) 2>&1/)[1]), ['-C apps/vloer install', '-C apps/ploeg install', '-C apps/site install', 'run setup', 'run verify']);
  for (const step of captured) assert.match(step.run, /^set -o pipefail; /, 'a captured step still fails when its command fails');
  const collect = verification.runs.steps.at(-1);
  assert.equal(collect.id, 'warnings');
  assert.equal(collect.if, 'always()');
  assert.equal(verification.outputs.warnings.value, '${{ steps.warnings.outputs.report }}');
  assert.equal(source.jobs.checks.outputs.warnings, '${{ steps.verify.outputs.warnings }}');
  assert.equal(source.jobs.checks.steps.find(step => step.id === 'verify').uses, './.forgejo/actions/verify');
  const job = source.jobs.warnings;
  assert.deepEqual(job.needs, ['checks']);
  for (const result of ['success', 'failure', 'skipped', 'cancelled']) {
    assert.equal(evaluate(job.if, { needs: { checks: { result } } }), result === 'success' || result === 'failure', result);
  }
  for (const [name, other] of Object.entries(source.jobs)) assert.ok(!(other.needs || []).includes('warnings'), `${name} must not wait for warnings`);
});

test('a release that Forgejo lost to the tag race is created by the job that cut it', () => {
  for (const [name, prefix] of [['release', 'unfold-v'], ['site-release', 'unfold-site-v']]) {
    const steps = source.jobs[name].steps;
    const release = steps.findIndex(step => step.id === 'release');
    const repair = steps[release + 1];
    assert.equal(repair.if, "failure() && steps.release.outcome == 'failure'", name);
    assert.equal(repair.run, `node scripts/release-repair.mjs ${prefix}`, name);
    assert.equal(repair.env.GITEA_TOKEN, steps[release].with.token, name);
  }
});

test('the CI verify gate requires the imported release notes', () => {
  const verification = read('.forgejo/actions/verify/action.yml');
  const step = verification.runs.steps.find(verifyStep);
  assert.equal(step.env.UNFOLD_REQUIRE_IMPORT_NOTES, 'true');
});

test('only a pull request reuses verified gate results; a development push runs every gate', () => {
  const verification = read('.forgejo/actions/verify/action.yml');
  const step = verification.runs.steps.find(verifyStep);
  assert.equal(step.env.GOFLAGS, '-count=1');
  for (const event_name of ['push', 'pull_request', 'workflow_dispatch', 'release', 'schedule']) {
    assert.equal(evaluate(step.env.UNFOLD_VERIFY_REUSE, { github: { event_name } }), event_name === 'pull_request');
  }
  const restore = verification.runs.steps.find(step => step.name === 'Restore verified gate results');
  assert.equal(restore.with.path, step.env.UNFOLD_VERIFY_RESULTS);
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
  assert.ok(publisher.jobs['ploeg-release-distribute'].needs.includes('vloer-release-distribute'), 'one Unfold release mirrors to GitHub one application at a time');
  assert.match(publisher.jobs['ploeg-release-distribute'].if, /^always\(\) && /, 'completion outputs remain usable when Forgejo omits job result fields');
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
  assert.deepEqual(job.container, source.jobs.release.container);
  assert.equal(job.strategy, undefined);
  const step = job.steps.find(step => step.with?.['dry-run']);
  assert.equal(step.with['dry-run'], 'true');
  assert.equal(step.with['package-path'], 'apps');
  assert.equal(step.with['package-name'], 'unfold');
  assert.equal(step.uses, source.jobs.release.steps.find(step => step.id === 'release').uses);
  assert.equal(evaluate(job.if, { github: { ref: 'refs/heads/development' } }), true);
  assert.equal(evaluate(job.if, { github: { ref: 'refs/heads/main' } }), false);
});

test('release routing publishes both applications for an Unfold tag and nothing for a closed gate or another tag', () => {
  assert.deepEqual(Object.keys(publisher.on).sort(), ['release', 'workflow_dispatch']);
  assert.deepEqual(publisher.on.release.types, ['published']);
  assert.equal(publisher.concurrency['cancel-in-progress'], false);
  const jobs = Object.entries(publisher.jobs).filter(([name]) => name !== 'parse-release-tag' && !name.startsWith('site-'));
  for (const app of ['vloer', 'ploeg']) assert.ok(jobs.some(([name]) => name.startsWith(`${app}-`)), app);
  for (const selected of ['unfold', 'unfold-site', 'vloer', 'ploeg', 'unrelated']) {
    for (const event_name of ['release', 'workflow_dispatch']) {
      for (const gate of ['', 'false', 'true']) {
        const tag = `${selected}-v0.4.0-rc.5`;
        const context = { github: { event_name, event: { release: { tag_name: event_name === 'release' ? tag : '' } } }, inputs: { tag: event_name === 'workflow_dispatch' ? tag : '' }, vars: { GLIDE_RELEASES_ENABLED: gate }, needs: {} };
        const parsed = evaluate(publisher.jobs['parse-release-tag'].if, context);
        assert.equal(parsed, selected === 'unfold' && gate === 'true');
        context.needs['parse-release-tag'] = { outputs: { version: parsed ? '0.4.0-rc.5' : '' } };
        context.needs['ploeg-release-sign-harbor'] = { outputs: { signed: 'true' } };
        context.needs['vloer-release-distribute'] = { outputs: { distributed: 'true' } };
        for (const [name, job] of jobs) {
          assert.ok(job.needs.includes('parse-release-tag'), name);
          assert.equal(evaluate(job.if, context), parsed, name);
        }
      }
    }
  }
});

test('the site versions on its own train, after Unfold, behind the same gate', () => {
  const job = source.jobs['site-release'];
  assert.deepEqual(job.needs, ['checks', 'release']);
  assert.equal(job.if, source.jobs.release.if);
  assert.deepEqual(job.container, source.jobs.release.container);
  const release = job.steps.find(step => step.id === 'release');
  assert.equal(release.uses, source.jobs.release.steps.find(step => step.id === 'release').uses);
  assert.equal(release.with['package-path'], 'apps/site');
  assert.equal(release.with['package-name'], 'unfold-site');
});

test('only a site tag deploys the site, to the workers.dev origin Cloudflare reports', () => {
  const gate = publisher.jobs['site-release-tag'];
  assert.equal(gate.if, undefined, 'site-deploy reads these outputs while Forgejo flattens it, so the gate job must never be skipped');
  assert.equal(gate.steps[0].env.RELEASES_ENABLED, '${{ vars.GLIDE_RELEASES_ENABLED }}');

  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'site-gate-'));
  fs.writeFileSync(path.join(bin, 'curl'), '#!/bin/sh\nprintf \'%s\' "$FAKE_CLOUDFLARE"\n', { mode: 0o755 });
  const run = (tag, subdomain = 'example', extra = {}) => {
    const output = path.join(bin, `output-${Math.random()}`);
    fs.writeFileSync(output, '');
    const result = spawnSync('bash', ['-c', gate.steps[0].run], { encoding: 'utf8', env: {
      PATH: `${bin}:${process.env.PATH}`, GITHUB_OUTPUT: output, WORKFLOW_EVENT: 'release', RELEASE_TAG: tag, RELEASES_ENABLED: 'true',
      CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'account',
      FAKE_CLOUDFLARE: JSON.stringify({ result: { subdomain } }), ...extra,
    } });
    return { status: result.status, outputs: Object.fromEntries(fs.readFileSync(output, 'utf8').trim().split('\n').filter(Boolean).map(line => line.split('='))) };
  };
  for (const tag of ['unfold-site-v0.1.0', 'unfold-site-v0.1.0-rc.1', 'unfold-site-v1.12.3-rc.40']) {
    const { status, outputs } = run(tag);
    assert.equal(status, 0, tag);
    assert.deepEqual(outputs, { deploy: 'true', 'site-url': 'https://unfold-site.example.workers.dev' }, tag);
  }
  for (const selected of ['unfold', 'unfold-site', 'vloer', 'ploeg', 'unrelated']) {
    for (const open of ['', 'false', 'true']) {
      if (selected === 'unfold-site' && open === 'true') continue;
      const tag = `${selected}-v0.1.0-rc.1`;
      const { status, outputs } = run(tag, 'example', { RELEASES_ENABLED: open, WORKFLOW_EVENT: 'workflow_dispatch', SELECTED_REF: 'refs/heads/development', CLOUDFLARE_API_TOKEN: '' });
      assert.equal(status, 0, `${selected} ${open}`);
      assert.deepEqual(outputs, { deploy: 'false', 'site-url': '' }, `${selected} ${open}`);
    }
  }
  for (const tag of ['unfold-site-v01.0.0', 'unfold-site-v0.1.0-rc.0', 'unfold-site-v0.1', 'unfold-site-v0.1.0-beta.1']) {
    assert.notEqual(run(tag).status, 0, tag);
  }
  assert.notEqual(run('unfold-site-v0.1.0', 'Bad_Name').status, 0);
  assert.notEqual(run('unfold-site-v0.1.0', 'example', { CLOUDFLARE_API_TOKEN: '' }).status, 0);
  assert.notEqual(run('unfold-site-v0.1.0', 'example', { WORKFLOW_EVENT: 'workflow_dispatch', SELECTED_REF: 'refs/heads/development' }).status, 0);

  const deploy = publisher.jobs['site-deploy'];
  assert.deepEqual(deploy.needs, ['site-release-tag']);
  assert.equal(deploy.uses, 'webgrip/workflows/.forgejo/workflows/cloudflare-deploy.yml@v2.7.5');
  assert.equal(deploy.with.enabled, "${{ needs.site-release-tag.outputs.deploy == 'true' }}");
  assert.equal(deploy.with.environment, 'production');
  assert.equal(deploy.with['release-channel'], 'prerelease');
  assert.equal(deploy.with['working-directory'], 'apps/site');
  assert.equal(deploy.with['apex-url'], '${{ needs.site-release-tag.outputs.site-url }}');
  assert.equal(deploy.with['build-command'], `UNFOLD_SITE_URL=${deploy.with['apex-url']} pnpm run build:release`);
  assert.deepEqual(deploy.with['smoke-paths'].trim().split('\n'), ['/', '/nl', '/robots.txt', '/sitemap-index.xml', '/favicon.svg', '/demo/', '/demo/replay/replay.json', '/privacy', '/nl/privacy']);
  assert.deepEqual(Object.keys(deploy.secrets).sort(), ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']);
  for (const [name, job] of Object.entries(publisher.jobs)) {
    if (!name.startsWith('site-')) assert.doesNotMatch(JSON.stringify(job), /CLOUDFLARE_/, name);
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
        'parse-release-tag': { outputs: { version: '0.4.0-rc.5' } },
        'ploeg-release-sign-harbor': { outputs: { signed } },
        'vloer-release-distribute': { outputs: { distributed: 'true' } },
      } }), signed === 'true', `${name}: ${signed}`);
    }
  }
});

test('the final publisher keeps the joint release in draft until Vloer distribution completes', () => {
  const vloer = publisher.jobs['vloer-release-distribute'];
  assert.equal(vloer.outputs.distributed, '${{ steps.distributed.outputs.ready }}');
  const complete = vloer.steps.findIndex(step => step.id === 'distributed');
  const publish = vloer.steps.findIndex(step => step.run?.includes('python3 scripts/publish_release.py vloer'));
  assert.ok(publish >= 0 && complete > publish);
  assert.equal(vloer.steps[publish]['continue-on-error'], undefined);
  assert.equal(vloer.steps[complete].if, undefined, 'the completion marker runs only after successful preceding steps');
  assert.equal(vloer.steps[complete].run, 'echo "ready=true" >> "$GITHUB_OUTPUT"');
  const final = publisher.jobs['ploeg-release-distribute'];
  assert.ok(final.needs.includes('vloer-release-distribute'));
  for (const result of ['success', 'failure', 'skipped', 'cancelled', undefined]) {
    for (const distributed of [undefined, '', 'false', 'true']) {
      const needs = {
        'parse-release-tag': { outputs: { version: '0.4.0-rc.5' } },
        'ploeg-release-sign-harbor': { outputs: { signed: 'true' } },
        'vloer-release-distribute': { result, outputs: { distributed } },
      };
      assert.equal(evaluate(final.if, { needs }), distributed === 'true', `${result}: ${distributed}`);
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


test('the tutorial smoke job runs weekly, only runs the deterministic demo and never gates a release', () => {
  const job = workflows['on_schedule.yml'].jobs['tutorial-smoke'];
  assert.deepEqual(job.steps.map(step => step.uses), [source.jobs.checks.steps[0].uses, './.forgejo/actions/tutorial-smoke']);
  const action = read('.forgejo/actions/tutorial-smoke/action.yml');
  assert.deepEqual(action.runs.steps.filter(step => step.run).map(step => step.run), ['bash scripts/tutorial-smoke.sh --check', 'mise trust apps/vloer/mise.toml && mise trust apps/ploeg/mise.toml && bash scripts/tutorial-smoke.sh']);
  assert.equal(action.runs.steps.at(-1).if, "steps.prerequisites.outputs.ready == 'true'");
  assert.doesNotMatch(JSON.stringify(action) + JSON.stringify(job), /secrets\.|GLIDE_RELEASES_ENABLED|permissions/);
  for (const workflow of ['on_pull_request.yml', 'on_source_change.yml']) assert.ok(!('tutorial-smoke' in workflows[workflow].jobs), workflow);
});

test('the weekly external link check is scheduled, pinned and reports without blocking or publishing', () => {
  const schedule = workflows['on_schedule.yml'];
  assert.deepEqual(Object.keys(schedule.on).sort(), ['schedule', 'workflow_dispatch']);
  assert.match(schedule.on.schedule[0].cron, /^\d+ \d+ \* \* [0-6]$/);
  assert.deepEqual(Object.keys(schedule.jobs), ['external-links', 'tutorial-smoke', 'release-notes']);
  const step = schedule.jobs['external-links'].steps.find(step => step.run === 'mise run docs-links-external');
  assert.equal(step['continue-on-error'], true);
  assert.doesNotMatch(JSON.stringify(schedule), /secrets\.|permissions|UNFOLD_(RELEASES|DOCS_PUBLISH)_ENABLED/);
  const mise = fs.readFileSync(path.join(root, 'mise.toml'), 'utf8');
  assert.match(mise, /\[tasks\.docs-links-external\]\ntools = \{ lychee = "\d+\.\d+\.\d+" \}/);
});

test('the weekly schedule fails loudly when Forgejo loses imported release notes', () => {
  const job = workflows['on_schedule.yml'].jobs['release-notes'];
  const checkout = job.steps.find(step => String(step.uses).startsWith('actions/checkout@'));
  assert.equal(checkout.with['fetch-depth'], 0);
  assert.ok(job.steps.some(step => step.run === "git fetch origin '+refs/notes/*:refs/notes/*'"));
  const verify = job.steps.find(step => String(step.run).includes('scripts/verify-import.py'));
  assert.equal(verify.env.UNFOLD_REQUIRE_IMPORT_NOTES, 'true');
  assert.equal(verify['continue-on-error'], undefined);
  assert.doesNotMatch(JSON.stringify(job), /git push|secrets\./);
});
