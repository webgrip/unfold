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
  assert.deepEqual(Object.keys(workflows).sort(), ['on_dns_change.yml', 'on_docs_change.yml', 'on_pull_request.yml', 'on_release_preview.yml', 'on_release_published.yml', 'on_schedule.yml', 'on_source_change.yml']);
  assert.deepEqual(Object.keys(source.on).sort(), ['push', 'workflow_dispatch']);
  const pr = workflows['on_pull_request.yml'];
  assert.deepEqual(Object.keys(pr.on).sort(), ['pull_request', 'workflow_dispatch']);
  assert.deepEqual(Object.keys(pr.jobs).sort(), ['checks', 'ploeg-pin', 'release-policy', 'warnings']);
  assert.deepEqual(pr.jobs.checks, source.jobs.checks);
  assert.deepEqual(pr.jobs.warnings, source.jobs.warnings);
  assert.deepEqual(pr.jobs['ploeg-pin'], source.jobs['ploeg-pin']);
  assert.deepEqual(pr.jobs['release-policy'].container, source.jobs.release.container);
  assert.deepEqual(pr.jobs['release-policy'].steps, source.jobs.release.steps.slice(0, 2));
  for (const name of ['on_pull_request.yml', 'on_docs_change.yml']) {
    assert.doesNotMatch(JSON.stringify(workflows[name]), /UNFOLD_RELEASES_ENABLED|contents":"write|semantic-release-monorepo@/);
  }
  const verification = read('.forgejo/actions/verify/action.yml');
  assert.ok(verification.runs.steps.some(verifyStep));
  assert.doesNotMatch(JSON.stringify(pr), /secrets\./);
  assert.equal(workflows['on_docs_change.yml'].jobs['generate-documentation'].with['prepare-command'], 'git submodule update --init --recursive && python3 scripts/docs.py --check --stage-only');
});

test('every job that verifies, documents or demonstrates Unfold checks out the pinned Ploeg submodule', () => {
  const checkout = job => job.steps.find(step => String(step.uses).startsWith('actions/checkout@'));
  for (const [file, name] of [['on_pull_request.yml', 'checks'], ['on_pull_request.yml', 'ploeg-pin'], ['on_source_change.yml', 'checks'], ['on_source_change.yml', 'ploeg-pin'], ['on_schedule.yml', 'external-links'], ['on_schedule.yml', 'tutorial-smoke'], ['on_docs_change.yml', 'verify-publication']]) {
    assert.equal(checkout(workflows[file].jobs[name]).with?.submodules, 'recursive', `${file}: ${name}`);
  }
  for (const name of ['generate-documentation', 'deploy-docs-site']) {
    assert.match(workflows['on_docs_change.yml'].jobs[name].with['prepare-command'], /^git submodule update --init --recursive && /, name);
  }
  const mise = fs.readFileSync(path.join(root, 'mise.toml'), 'utf8');
  assert.match(mise, /\[tasks\.setup\]\nrun = \[\n  "git submodule sync --recursive",\n  "git submodule update --init --recursive",/);
});

test('a pull request and a release need the pinned Ploeg commit on Ploeg main', () => {
  for (const workflow of [workflows['on_pull_request.yml'], source]) {
    const steps = workflow.jobs['ploeg-pin'].steps;
    assert.equal(steps.at(-1).run, 'node scripts/ploeg-pin.mjs --published');
    assert.doesNotMatch(JSON.stringify(workflow.jobs['ploeg-pin']), /secrets\.|permissions/);
  }
  assert.ok(source.jobs.release.needs.includes('ploeg-pin'));
});

test('only an enabled development push can version Unfold, after the checks and the release policy', () => {
  assert.equal(source.concurrency['cancel-in-progress'], false);
  assert.deepEqual(Object.keys(source.jobs).sort(), ['checks', 'ploeg-pin', 'release', 'site-release', 'warnings']);
  const job = source.jobs.release;
  assert.deepEqual(job.needs, ['checks', 'ploeg-pin']);
  const policy = job.steps.findIndex(step => step.uses === './.forgejo/actions/release-policy');
  assert.ok(policy > 0 && policy < job.steps.findIndex(step => step.id === 'release'), 'the release policy runs in the release job before versioning');
  const release = job.steps.find(step => step.id === 'release');
  assert.equal(release.with['package-path'], 'apps');
  assert.equal(release.with['package-name'], 'unfold');
  for (const event_name of ['push', 'pull_request', 'workflow_dispatch', 'release']) {
    for (const ref of ['refs/heads/development', 'refs/heads/main', 'refs/heads/topic', 'refs/tags/unfold-v0.4.0-rc.1']) {
      for (const gate of ['', 'false', 'true']) {
        const enabled = evaluate(job.if, { github: { event_name, ref }, vars: { UNFOLD_RELEASES_ENABLED: gate } });
        assert.equal(enabled, event_name === 'push' && ref === 'refs/heads/development' && gate === 'true');
      }
    }
  }
});

test('warnings from setup and verification turn their own job red without gating a release', () => {
  const verification = read('.forgejo/actions/verify/action.yml');
  const captured = verification.runs.steps.filter(step => / 2>&1 \| tee (-a )?"\$\{RUNNER_TEMP:-\/tmp\}\/unfold-output\//.test(step.run ?? ''));
  assert.deepEqual(captured.map(step => step.run.match(/mise (.+?) 2>&1/)[1]), ['-C apps/unfold install', '-C apps/ploeg install', '-C apps/site install', 'run setup', 'run verify']);
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
  const unfold = publisher.jobs['unfold-release-distribute-harbor'].steps;
  const unfoldGate = unfold.findIndex(step => step.uses === gate);
  assert.ok(unfoldGate > unfold.findIndex(step => step.id === 'digest'));
  assert.ok(unfoldGate < unfold.findIndex(step => step.uses?.includes('/cosign-sign-attest@')));
  assert.equal(unfold[unfoldGate].with['budgets-file'], 'apps/unfold/ops/security/cve-budgets.yaml');
  const budgets = parse(fs.readFileSync(path.join(root, 'apps/unfold/ops/security/cve-budgets.yaml'), 'utf8'));
  assert.equal(budgets.images['unfold'].mode, 'enforce');
  assert.ok(fs.statSync(path.join(root, 'apps/unfold/ops/vex/statements')).isDirectory());
});

test('Unfold builds, signs and publishes no Ploeg artifact', () => {
  assert.deepEqual(Object.keys(publisher.jobs).filter(name => name.startsWith('ploeg-')), []);
  assert.doesNotMatch(JSON.stringify(publisher), /ploeg/i);
  assert.doesNotMatch(JSON.stringify(read('.forgejo/actions/verify/action.yml').runs.steps.find(step => step.name === 'Container build contexts')), /ploeg/i);
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

test('release routing publishes Unfold for an Unfold tag and nothing for a closed gate or another tag', () => {
  assert.deepEqual(Object.keys(publisher.on).sort(), ['release', 'workflow_dispatch']);
  assert.deepEqual(publisher.on.release.types, ['published']);
  assert.equal(publisher.concurrency['cancel-in-progress'], false);
  const jobs = Object.entries(publisher.jobs).filter(([name]) => name !== 'parse-release-tag' && !name.startsWith('site-'));
  assert.ok(jobs.length > 0 && jobs.every(([name]) => name.startsWith('unfold-')), jobs.map(([name]) => name).join());
  for (const selected of ['unfold', 'unfold-site', 'unfold', 'ploeg', 'unrelated']) {
    for (const event_name of ['release', 'workflow_dispatch']) {
      for (const gate of ['', 'false', 'true']) {
        const tag = `${selected}-v0.4.0-rc.5`;
        const context = { github: { event_name, event: { release: { tag_name: event_name === 'release' ? tag : '' } } }, inputs: { tag: event_name === 'workflow_dispatch' ? tag : '' }, vars: { UNFOLD_RELEASES_ENABLED: gate }, needs: {} };
        const parsed = evaluate(publisher.jobs['parse-release-tag'].if, context);
        assert.equal(parsed, selected === 'unfold' && gate === 'true');
        context.needs['parse-release-tag'] = { outputs: { version: parsed ? '0.4.0-rc.5' : '' } };
        for (const [name, job] of jobs) {
          assert.ok(job.needs.includes('parse-release-tag'), name);
          assert.equal(evaluate(job.if, context), parsed, name);
        }
      }
    }
  }
});

test('the site versions on its own train: candidates after Unfold on development, stable releases on main', () => {
  assert.deepEqual(source.on.push.branches, ['development', 'main']);
  const job = source.jobs['site-release'];
  assert.deepEqual(job.needs, ['checks', 'release']);
  for (const event_name of ['push', 'pull_request', 'workflow_dispatch']) {
    for (const ref of ['refs/heads/development', 'refs/heads/main', 'refs/heads/topic']) {
      for (const gate of ['', 'true']) {
        for (const checks of ['success', 'failure', 'skipped']) {
          for (const release of ['success', 'failure', 'skipped']) {
            const enabled = evaluate(job.if, { github: { event_name, ref }, vars: { UNFOLD_RELEASES_ENABLED: gate }, needs: { checks: { result: checks }, release: { result: release } } });
            const expected = event_name === 'push' && gate === 'true' && checks === 'success'
              && ((ref === 'refs/heads/development' && release === 'success') || (ref === 'refs/heads/main' && release === 'skipped'));
            assert.equal(enabled, expected, `${event_name} ${ref} ${gate} ${checks} ${release}`);
          }
        }
      }
    }
  }
  assert.deepEqual(job.container, source.jobs.release.container);
  const release = job.steps.find(step => step.id === 'release');
  assert.equal(release.uses, source.jobs.release.steps.find(step => step.id === 'release').uses);
  assert.equal(release.with['package-path'], 'apps/site');
  assert.equal(release.with['package-name'], 'unfold-site');
});

test('a site or Unfold release candidate deploys to staging and a stable site release to unfoldhq.dev', () => {
  const gate = publisher.jobs['site-release-tag'];
  assert.equal(gate.if, undefined, 'the site deploy jobs read these outputs while Forgejo flattens them, so the gate job must never be skipped');
  assert.equal(gate.steps[0].env.RELEASES_ENABLED, '${{ vars.UNFOLD_RELEASES_ENABLED }}');

  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'site-gate-'));
  const run = (tag, extra = {}) => {
    const output = path.join(bin, `output-${Math.random()}`);
    fs.writeFileSync(output, '');
    const result = spawnSync('bash', ['-c', gate.steps[0].run], { encoding: 'utf8', env: {
      PATH: process.env.PATH, GITHUB_OUTPUT: output, WORKFLOW_EVENT: 'release', RELEASE_TAG: tag, RELEASES_ENABLED: 'true',
      CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'account', ...extra,
    } });
    return { status: result.status, outputs: Object.fromEntries(fs.readFileSync(output, 'utf8').trim().split('\n').filter(Boolean).map(line => line.split('='))) };
  };
  for (const tag of ['unfold-site-v0.1.0-rc.1', 'unfold-site-v1.12.3-rc.40', 'unfold-v0.4.0-rc.34']) {
    const { status, outputs } = run(tag);
    assert.equal(status, 0, tag);
    assert.deepEqual(outputs, { channel: 'prerelease' }, tag);
  }
  for (const tag of ['unfold-site-v0.1.0', 'unfold-site-v1.12.3']) {
    const { status, outputs } = run(tag);
    assert.equal(status, 0, tag);
    assert.deepEqual(outputs, { channel: 'stable' }, tag);
  }
  for (const selected of ['unfold', 'unfold-site', 'unfold', 'ploeg', 'unrelated']) {
    for (const open of ['', 'false', 'true']) {
      if ((selected === 'unfold-site' || selected === 'unfold') && open === 'true') continue;
      const tag = `${selected}-v0.1.0-rc.1`;
      const { status, outputs } = run(tag, { RELEASES_ENABLED: open, WORKFLOW_EVENT: 'workflow_dispatch', SELECTED_REF: 'refs/heads/development', CLOUDFLARE_API_TOKEN: '' });
      assert.equal(status, 0, `${selected} ${open}`);
      assert.deepEqual(outputs, { channel: 'none' }, `${selected} ${open}`);
    }
  }
  for (const tag of ['unfold-site-v01.0.0', 'unfold-site-v0.1.0-rc.0', 'unfold-site-v0.1', 'unfold-site-v0.1.0-beta.1', 'unfold-v0.4.0', 'unfold-v1.0.0-rc.1', 'unfold-v0.4.0-rc.0']) {
    assert.notEqual(run(tag).status, 0, tag);
  }
  assert.notEqual(run('unfold-site-v0.1.0', { CLOUDFLARE_API_TOKEN: '' }).status, 0);
  assert.notEqual(run('unfold-site-v0.1.0', { WORKFLOW_EVENT: 'workflow_dispatch', SELECTED_REF: 'refs/heads/development' }).status, 0);

  const targets = { 'site-deploy-staging': ['prerelease', 'https://staging.unfoldhq.dev', 'staging'], 'site-deploy-production': ['stable', 'https://unfoldhq.dev', undefined] };
  for (const [name, [channel, origin, env]] of Object.entries(targets)) {
    const deploy = publisher.jobs[name];
    assert.deepEqual(deploy.needs, ['site-release-tag'], name);
    assert.equal(deploy.uses, 'webgrip/workflows/.forgejo/workflows/cloudflare-deploy.yml@v2.7.8', name);
    assert.equal(deploy.with.enabled, `\${{ needs.site-release-tag.outputs.channel == '${channel}' }}`, name);
    for (const gateChannel of ['none', 'prerelease', 'stable']) {
      assert.equal(evaluate(deploy.with.enabled, { needs: { 'site-release-tag': { outputs: { channel: gateChannel } } } }), gateChannel === channel, `${name} ${gateChannel}`);
    }
    assert.equal(deploy.with.environment, 'production', name);
    assert.equal(deploy.with['release-channel'], channel, name);
    assert.equal(deploy.with['wrangler-env'], env, name);
    assert.equal(deploy.with['working-directory'], 'apps/site', name);
    assert.equal(deploy.with['apex-url'], origin, name);
    assert.equal(deploy.with['build-command'], `npm --prefix ../unfold ci --omit=dev --no-audit --no-fund && UNFOLD_SITE_URL=${origin} pnpm run build:release`, name);
    assert.deepEqual(deploy.with['smoke-paths'].trim().split('\n'), ['/', '/nl', '/robots.txt', '/sitemap-index.xml', '/favicon.svg', '/demo/', '/demo/replay/replay.json', '/privacy', '/nl/privacy'], name);
    assert.deepEqual(Object.keys(deploy.secrets).sort(), ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'], name);
  }
  for (const [name, job] of Object.entries(publisher.jobs)) {
    if (!name.startsWith('site-')) assert.doesNotMatch(JSON.stringify(job), /CLOUDFLARE_/, name);
  }
});

test('the unfoldhq.dev zone is previewed from development and checked daily for drift, in a direct job holding only its read-only token from OpenBao', () => {
  const dns = workflows['on_dns_change.yml'];
  assert.deepEqual(dns.on.push.branches, ['development']);
  assert.deepEqual(dns.on.push.paths, ['apps/site/ops/dns/**', '.forgejo/workflows/on_dns_change.yml']);
  assert.equal(dns.on.schedule.length, 1);
  assert.equal(dns.concurrency['cancel-in-progress'], false);
  assert.deepEqual(Object.keys(dns.jobs), ['dns']);
  const job = dns.jobs.dns;
  assert.equal(job.uses, undefined);
  assert.equal(job['runs-on'], 'docker');
  assert.equal(job['enable-openid-connect'], true);
  const read = job.steps.find(step => String(step.uses).includes('/composite-actions/openbao-read@'));
  assert.equal(read.uses, 'https://forgejo.webgrip.dev/webgrip/workflows/.forgejo/composite-actions/openbao-read@v2.8.1');
  assert.equal(read.with.role, 'ci-unfold');
  assert.deepEqual(read.with.secrets.trim().split('\n'), [
    'CLOUDFLARE_API_TOKEN=secret/data/cloudflare/dns/unfoldhq-dev-ro#token',
    'CLOUDFLARE_ACCOUNT_ID=secret/data/cloudflare/dns/unfoldhq-dev-ro#account_id',
  ]);
  const commands = job.steps.map(step => step.run ?? '').join('\n');
  assert.match(commands, /dnscontrol preview --creds creds\.json/);
  assert.match(commands, /--expect-no-changes/);
  assert.doesNotMatch(commands, /dnscontrol push/);
  for (const step of job.steps.filter(step => step.run && /dnscontrol (check|preview)/.test(step.run))) {
    assert.equal(step['working-directory'], 'apps/site/ops/dns');
  }
  for (const [file, workflow] of Object.entries(workflows)) {
    assert.doesNotMatch(JSON.stringify(workflow), /CLOUDFLARE_DNS_TOKEN|dnscontrol\.yml/, file);
  }
  assert.ok(fs.existsSync(path.join(root, 'apps/site/ops/dns/dnsconfig.js')));
  assert.ok(fs.existsSync(path.join(root, 'apps/site/ops/dns/creds.json')));
});

test('the Unfold publisher is the only and therefore final publisher', () => {
  const unfold = publisher.jobs['unfold-release-distribute'];
  const publish = unfold.steps.findIndex(step => step.run?.includes('python3 scripts/publish_release.py unfold'));
  assert.ok(publish >= 0);
  assert.equal(unfold.steps[publish]['continue-on-error'], undefined);
  assert.equal(unfold.outputs, undefined, 'no later publisher waits for Unfold');
  const callers = Object.entries(publisher.jobs).filter(([, job]) => JSON.stringify(job).includes('scripts/publish_release.py')).map(([name]) => name);
  assert.deepEqual(callers, ['unfold-release-distribute']);
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
  assert.ok(!fs.existsSync(path.join(root, 'apps/unfold/.forgejo')), 'apps/unfold/.forgejo is never read by Forgejo');
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
  assert.deepEqual(action.runs.steps.filter(step => step.run).map(step => step.run), ['bash scripts/tutorial-smoke.sh --check', 'mise trust apps/unfold/mise.toml && mise trust apps/ploeg/mise.toml && bash scripts/tutorial-smoke.sh']);
  assert.equal(action.runs.steps.at(-1).if, "steps.prerequisites.outputs.ready == 'true'");
  assert.doesNotMatch(JSON.stringify(action) + JSON.stringify(job), /secrets\.|UNFOLD_RELEASES_ENABLED|permissions/);
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
