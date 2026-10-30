'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { readYaml, readFirstYamlDocument } = require('./yaml-documents.cjs');

const root = path.resolve(__dirname, '..');
const read = relative => readYaml(path.join(root, relative));
const workflows = Object.fromEntries(fs.readdirSync(path.join(root, '.forgejo/workflows')).map(file => [file, read(`.forgejo/workflows/${file}`)]));
const source = workflows['on_source_change.yml'];
const train = workflows['on_release_train.yml'];
const withoutRef = job => ({ ...job, steps: job.steps.map(({ with: inputs, ...step }) => {
  const { ref, ...rest } = inputs ?? {};
  return inputs && Object.keys(rest).length ? { ...step, with: rest } : step;
}) });
const publisher = workflows['on_release_published.yml'];
const verifyStep = step => /^set -o pipefail; mise run verify 2>&1 \| tee /.test(step.run ?? '');
const evaluate = (expression, context) => vm.runInNewContext(expression.replace(/^\$\{\{\s*|\s*\}\}$/g, '').replace(/needs\.([a-z-]+)/g, "needs['$1']"), { startsWith: (value, prefix) => value.startsWith(prefix), always: () => true, ...context });

test('event entry points preserve validation and keep application publication out of pull requests and docs', () => {
  assert.deepEqual(Object.keys(workflows).sort(), ['on_dns_change.yml', 'on_docs_change.yml', 'on_nightly.yml', 'on_pull_request.yml', 'on_release_preview.yml', 'on_release_published.yml', 'on_release_train.yml', 'on_schedule.yml', 'on_source_change.yml']);
  assert.deepEqual(Object.keys(source.on).sort(), ['push', 'workflow_dispatch']);
  const pr = workflows['on_pull_request.yml'];
  assert.deepEqual(Object.keys(pr.on).sort(), ['pull_request', 'workflow_dispatch']);
  assert.deepEqual(Object.keys(pr.jobs).sort(), ['agent-trace', 'agents-check', 'checks', 'gate', 'opencode-contract', 'ploeg-docs', 'ploeg-pin', 'release-policy', 'warnings']);
  assert.deepEqual(pr.jobs.checks, source.jobs.checks);
  assert.deepEqual(pr.jobs.warnings, source.jobs.warnings);
  assert.deepEqual(pr.jobs['ploeg-pin'], source.jobs['ploeg-pin']);
  assert.deepEqual(pr.jobs['release-policy'].container, train.jobs.release.container);
  assert.deepEqual(pr.jobs['release-policy'].steps, withoutRef(train.jobs.release).steps.slice(0, 2));
  for (const name of ['on_pull_request.yml', 'on_docs_change.yml']) {
    assert.doesNotMatch(JSON.stringify(workflows[name]), /UNFOLD_RELEASES_ENABLED|contents":"write|semantic-release-monorepo@/);
  }
  const verification = read('.forgejo/actions/verify/action.yml');
  assert.ok(verification.runs.steps.some(verifyStep));
  assert.doesNotMatch(JSON.stringify(pr), /secrets\./);
  assert.equal(workflows['on_docs_change.yml'].jobs['generate-documentation'].with['prepare-command'], 'python3 scripts/ploeg-contract.py fetch && python3 scripts/docs.py --check --stage-only');
});

test('the Agent Trace summary on a pull request only reads notes, never fails and holds no other job up', () => {
  const pr = workflows['on_pull_request.yml'];
  const job = pr.jobs['agent-trace'];
  const runs = job.steps.map(step => step.run ?? '').join('\n');
  assert.match(runs, /git fetch --no-tags origin 'refs\/notes\/agent-trace:refs\/notes\/agent-trace' \|\| /, 'fetches the notes without force and tolerates their absence');
  assert.doesNotMatch(runs, /\bpush\b|\+refs|--prune|update-ref|notes (?:add|merge|remove|prune)/);
  assert.match(runs, /agent-trace-report\.mjs .*\|\| echo/);
  assert.match(runs, /GITHUB_STEP_SUMMARY/);
  assert.equal(job.needs, undefined);
  for (const [name, other] of Object.entries(pr.jobs)) assert.ok(![other.needs].flat().includes('agent-trace'), `${name} does not wait for the summary`);
  assert.doesNotMatch(JSON.stringify(job), /secrets\./);
});

test('the pull request gate waits for every job except the advisory ones, and passes only when each of them succeeded', () => {
  const pr = workflows['on_pull_request.yml'];
  const gate = pr.jobs.gate;
  const advisory = ['agent-trace', 'warnings'];
  assert.deepEqual([gate.needs].flat().sort(), Object.keys(pr.jobs).filter(name => name !== 'gate' && !advisory.includes(name)).sort(), 'a new pull request job joins the gate, or is named advisory here');
  assert.equal(gate.if, 'always()', 'a failed job still reaches the gate, which then fails instead of being skipped');
  const step = gate.steps.find(candidate => candidate.run);
  assert.equal(step.env.NEEDS, '${{ toJSON(needs) }}');
  const run = needs => spawnSync('bash', ['-eo', 'pipefail', '-c', step.run], { env: { ...process.env, NEEDS: JSON.stringify(needs, null, 2) }, encoding: 'utf8' }).status;
  const result = value => ({ result: value, outputs: {} });
  const all = value => Object.fromEntries([gate.needs].flat().map(name => [name, result(value)]));
  assert.equal(run(all('success')), 0);
  for (const failed of ['failure', 'cancelled', 'skipped']) assert.equal(run({ ...all('success'), checks: result(failed) }), 1, `a ${failed} job fails the gate`);
  assert.equal(run({}), 1, 'no results fail the gate');
  assert.equal(run({ ...all('success'), checks: { result: 'success', outputs: { warnings: '"result": "failure"' } } }), 0, 'an output that quotes a result is not a result');
});

test('the browser flows run every night and on command, never on a push, in the Playwright image of Unfold\'s playwright version', () => {
  const nightly = workflows['on_nightly.yml'];
  assert.deepEqual(Object.keys(nightly.on).sort(), ['schedule', 'workflow_dispatch']);
  assert.equal(nightly.on.schedule.length, 1);
  assert.match(nightly.on.schedule[0].cron, /^\d+ \d+ \* \* \*$/, 'once a day');
  for (const [name, workflow] of Object.entries(workflows)) if (name !== 'on_nightly.yml') assert.doesNotMatch(JSON.stringify(workflow), /browser-suite/, `${name} runs no browser flows: the shared runners are too short of CPU for them on every push`);
  const job = nightly.jobs['browser-suite'];
  assert.ok(job.steps.some(step => step.uses === './.forgejo/actions/browser-suite'));
  const action = read('.forgejo/actions/browser-suite/action.yml');
  const run = action.runs.steps.find(step => step.run === 'npm run test:browser');
  assert.ok(Number(run.env.UNFOLD_BROWSER_TIMEOUT_SCALE) > 1, 'CI stretches the page waits for its slow runners');
  const playwright = JSON.parse(fs.readFileSync(path.join(root, 'apps/unfold/package.json'), 'utf8')).devDependencies?.playwright ?? JSON.parse(fs.readFileSync(path.join(root, 'apps/unfold/package.json'), 'utf8')).dependencies?.playwright;
  assert.match(job.container.image, new RegExp(`^harbor\\.webgrip\\.dev/mcr/playwright:v${playwright.replace(/\./g, '\\.')}-noble@sha256:[0-9a-f]{64}$`), 'the image carries the Chromium build that Unfold\'s playwright package expects');
});

test('unfold-mcp\'s end-to-end suite runs every night and on command against an Authentik of the homelab\'s version', () => {
  const job = workflows['on_nightly.yml'].jobs['mcp-e2e'];
  assert.equal(job.container.image, workflows['on_nightly.yml'].jobs['browser-suite'].container.image, 'the same Playwright image as the browser flows');
  assert.ok(job.steps.some(step => step.uses === './.forgejo/actions/mcp-e2e'));
  const { authentik, 'authentik-worker': worker, postgresql } = job.services;
  assert.equal(authentik.image, worker.image);
  assert.deepEqual([authentik.cmd, worker.cmd], [['server'], ['worker']]);
  assert.deepEqual(authentik.env, worker.env, 'server and worker share one configuration');
  assert.match(authentik.image, /^harbor\.webgrip\.dev\/ghcr\/goauthentik\/server:\d{4}\.\d+\.\d+@sha256:[0-9a-f]{64}$/);
  assert.match(postgresql.image, /^harbor\.webgrip\.dev\/dockerhub\/library\/postgres:[^@]+@sha256:[0-9a-f]{64}$/);
  assert.equal(job.env.UNFOLD_E2E_AUTHENTIK_TOKEN, authentik.env.AUTHENTIK_BOOTSTRAP_TOKEN);
  const compose = fs.readFileSync(path.join(root, 'apps/unfold/test/e2e/authentik.compose.yaml'), 'utf8');
  assert.ok(compose.includes(authentik.image.replace('harbor.webgrip.dev/ghcr/', 'ghcr.io/')), 'CI and the local compose file run the same Authentik');
  assert.ok(compose.includes(`:-${postgresql.image.replace('harbor.webgrip.dev/dockerhub/library/', '')}}`), 'CI and the local compose file run the same Postgres');
  assert.ok(!Object.values(workflows['on_source_change.yml'].jobs).some(other => [other.needs ?? []].flat().includes('mcp-e2e')), 'it reports; it gates no release');
});

test('every job that reads Ploeg\'s contract unpacks the pinned bundle first, and no job checks out Ploeg\'s source', () => {
  assert.ok(!fs.existsSync(path.join(root, '.gitmodules')), 'Unfold depends on a released Ploeg, not a submodule (system ADR-0039)');
  for (const [file, workflow] of Object.entries(workflows)) {
    for (const [name, job] of Object.entries(workflow.jobs)) {
      for (const step of job.steps ?? []) assert.equal(step.with?.submodules, undefined, `${file}: ${name} checks out submodules`);
    }
  }
  const fetchesFirst = (job, reads) => {
    const fetch = job.steps.findIndex(step => /scripts\/ploeg-contract\.py fetch(-unpinned)?\b/.test(step.run ?? ''));
    const read = job.steps.findIndex(step => reads.test(step.run ?? ''));
    return fetch >= 0 && fetch < read;
  };
  for (const [file, name, reads] of [['on_pull_request.yml', 'ploeg-pin', /ploeg-contract\.py check/], ['on_source_change.yml', 'ploeg-pin', /ploeg-contract\.py check/], ['on_release_train.yml', 'ploeg-pin', /ploeg-contract\.py check/], ['on_pull_request.yml', 'ploeg-docs', /docs\.py --domain-check/], ['on_schedule.yml', 'external-links', /docs-links-external/], ['on_schedule.yml', 'ploeg-ahead', /renovate-ploeg-docs\.sh/], ['on_docs_change.yml', 'verify-publication', /docs\.py --stage-only/]]) {
    assert.ok(fetchesFirst(workflows[file].jobs[name], reads), `${file}: ${name}`);
  }
  for (const name of ['generate-documentation', 'deploy-docs-site']) {
    assert.match(workflows['on_docs_change.yml'].jobs[name].with['prepare-command'], /^python3 scripts\/ploeg-contract\.py fetch && /, name);
  }
  const mise = fs.readFileSync(path.join(root, 'mise.toml'), 'utf8');
  assert.match(mise, /\[tasks\.setup\]\nrun = \[\n  "python3 scripts\/ploeg-contract\.py fetch",/);
});

test('every pull request checks the Ploeg-derived pages and the links into Ploeg on their own, and a weekly run checks the Ploeg to come', () => {
  const pr = workflows['on_pull_request.yml'].jobs['ploeg-docs'];
  assert.deepEqual(pr.steps.slice(-2).map(step => step.run), ['mise exec uv -- uv run --frozen python scripts/docs.py --domain-check', 'mise exec uv -- uv run --frozen python scripts/docs.py --stage-only']);
  assert.equal(pr.needs, undefined);
  assert.doesNotMatch(JSON.stringify(pr), /secrets\.|permissions/);
  const ahead = workflows['on_schedule.yml'].jobs['ploeg-ahead'];
  assert.deepEqual(ahead.strategy.matrix.ploeg, ['newest-release', 'development']);
  assert.equal(ahead.strategy['fail-fast'], false);
  assert.match(ahead.steps.at(-1).run, /scripts\/renovate-ploeg-docs\.sh\n.*scripts\/docs\.py --domain-check --without-landscape\n.*scripts\/docs\.py --stage-only\n$/);
  assert.doesNotMatch(JSON.stringify(ahead), /secrets\.|permissions|continue-on-error/);
});

test('Ploeg\'s release opens the Ploeg pull request, and a nightly run fails when the pin falls behind', () => {
  const behind = workflows['on_nightly.yml'].jobs['ploeg-behind'];
  assert.equal(behind.steps.at(-1).run, 'python3 scripts/ploeg-contract.py behind');
  assert.doesNotMatch(JSON.stringify(behind), /secrets\.|permissions|continue-on-error/);
  const renovate = JSON.parse(fs.readFileSync(path.join(root, 'renovate.json'), 'utf8'));
  const ploeg = renovate.packageRules.filter(rule => (rule.matchPackageNames ?? []).some(name => /ploeg-hq\//.test(name)));
  assert.deepEqual(ploeg.map(rule => [rule.matchPackageNames, rule.enabled]), [[['ghcr.io/ploeg-hq/charts/ploeg', 'ghcr.io/ploeg-hq/ploeg-contract', 'github.com/ploeg-hq/ploeg'], false]], 'Renovate must not be a second writer on the Ploeg pin (ADR-0041) or the chart dependency (ADR-0043)');
  const recipe = path.join(root, 'scripts/consume-ploeg-release.sh');
  assert.ok(fs.statSync(recipe).mode & 0o111, 'Ploeg\'s release runs the recipe as an executable');
  assert.match(fs.readFileSync(recipe, 'utf8'), /scripts\/ploeg-contract\.py pin "\$\{version#v\}"\n.*scripts\/renovate-ploeg-docs\.sh\n$/);
});

test('a pull request and a release need the pinned Ploeg to be a published release', () => {
  for (const workflow of [workflows['on_pull_request.yml'], source, train]) {
    const steps = workflow.jobs['ploeg-pin'].steps;
    assert.equal(steps.at(-1).run, 'mise exec uv -- uv run --no-project python scripts/ploeg-contract.py check --published');
    assert.doesNotMatch(JSON.stringify(workflow.jobs['ploeg-pin']), /secrets\.|permissions/);
  }
  assert.ok(train.jobs.release.needs.includes('ploeg-pin'));
});

test('a push checks the head it lands on, supersedes an older development run and no longer versions Unfold', () => {
  for (const ref of ['refs/heads/development', 'refs/heads/topic']) assert.equal(evaluate(source.concurrency['cancel-in-progress'], { github: { ref } }), true, ref);
  assert.equal(evaluate(source.concurrency['cancel-in-progress'], { github: { ref: 'refs/heads/main' } }), false, 'a main push releases the site, so a newer main push queues behind it');
  assert.deepEqual(Object.keys(source.jobs).sort(), ['checks', 'ploeg-pin', 'site-release', 'warnings']);
  assert.doesNotMatch(JSON.stringify(source), /"package-name":"unfold"/);
});

test('the release train owns Unfold versioning: hourly or on command, in its own queue, on the development head after the checks and the release policy', () => {
  assert.deepEqual(Object.keys(train.on).sort(), ['schedule', 'workflow_dispatch']);
  assert.equal(train.on.schedule.length, 1);
  assert.match(train.on.schedule[0].cron, /^\d+ \* \* \* \*$/, 'every hour');
  assert.deepEqual(train.concurrency, { group: 'release-train', 'cancel-in-progress': false });
  assert.ok(Object.values(workflows).every(other => other === train || other.concurrency?.group !== train.concurrency.group), 'no other workflow shares the train\'s queue');
  assert.deepEqual(Object.keys(train.jobs).sort(), ['checks', 'merge-pin', 'pending', 'ploeg-pin', 'release', 'site-release']);
  const pending = train.jobs.pending;
  assert.equal(pending.steps[0].with.ref, '${{ github.ref }}', 'the train reads the branch head when it starts, not the commit it was queued for');
  assert.equal(pending.steps.at(-1).run, 'sh scripts/release-train.sh pending');
  for (const [event_name, ref, ref_name] of [['schedule', 'development', 'development'], ['schedule', 'main', 'main'], ['workflow_dispatch', 'refs/heads/development', 'development'], ['workflow_dispatch', 'refs/heads/main', 'main'], ['workflow_dispatch', 'refs/heads/topic', 'topic']]) {
    {
      for (const gate of ['', 'false', 'true']) {
        const context = { github: { event_name, ref, ref_name }, vars: { UNFOLD_RELEASES_ENABLED: gate } };
        const expected = ref_name === 'development' && gate === 'true';
        assert.equal(evaluate(pending.if, { ...context, needs: { 'merge-pin': { result: 'success' } } }), expected, `pending ${event_name} ${ref} ${gate}`);
        assert.equal(evaluate(train.jobs.release.if, context), expected, `release ${event_name} ${ref} ${gate}`);
        assert.equal(evaluate(train.jobs['site-release'].if, context), expected, `site-release ${event_name} ${ref} ${gate}`);
      }
    }
  }
  for (const name of ['checks', 'ploeg-pin']) {
    const job = train.jobs[name];
    assert.deepEqual(job.needs, ['pending'], name);
    for (const unreleased of ['true', 'false', '']) assert.equal(evaluate(job.if, { needs: { pending: { outputs: { unreleased } } } }), unreleased === 'true', `${name} ${unreleased}`);
    assert.equal(job.steps[0].with.ref, '${{ needs.pending.outputs.sha }}', `${name} checks the head the train found`);
    const { needs, if: condition, ...same } = withoutRef(job);
    const { outputs, ...pushed } = source.jobs[name];
    assert.deepEqual(same, pushed, `${name} runs what a push runs`);
  }
  const job = train.jobs.release;
  assert.deepEqual(job.needs, ['pending', 'checks', 'ploeg-pin']);
  assert.equal(job.steps[0].with.ref, '${{ github.ref }}');
  const policy = job.steps.findIndex(step => step.uses === './.forgejo/actions/release-policy');
  const head = job.steps.findIndex(step => step.id === 'head');
  const release = job.steps.findIndex(step => step.id === 'release');
  assert.ok(policy > 0 && policy < head && head < release, 'the release policy, then the head check, run before versioning');
  assert.equal(job.steps[head].run, 'sh scripts/release-train.sh current "$CHECKED"');
  assert.equal(job.steps[head].env.CHECKED, '${{ needs.pending.outputs.sha }}');
  assert.equal(job.steps[release].if, "steps.head.outputs.current == 'true'");
  assert.equal(job.steps[release].with['package-path'], 'apps');
  assert.equal(job.steps[release].with['package-name'], 'unfold');
  for (const [file, workflow] of Object.entries(workflows)) {
    if (file !== 'on_release_train.yml' && file !== 'on_release_preview.yml') assert.doesNotMatch(JSON.stringify(workflow), /"package-name":"unfold"/, `${file} must not version Unfold`);
  }
});

test('the release train merges the newest green Ploeg pin first, so its checks and its release read a head that already holds it', () => {
  const merge = train.jobs['merge-pin'];
  const pending = train.jobs.pending;
  assert.equal(merge.needs, undefined, 'merging the pin is the first job of the train');
  assert.deepEqual(pending.needs, ['merge-pin']);
  for (const ref of ['development', 'main']) {
    for (const gate of ['', 'true']) {
      const context = { github: { event_name: 'schedule', ref, ref_name: ref }, vars: { UNFOLD_RELEASES_ENABLED: gate } };
      assert.equal(evaluate(merge.if, context), ref === 'development' && gate === 'true', `merge-pin ${ref} ${gate}`);
    }
  }
  const released = { github: { event_name: 'schedule', ref: 'development', ref_name: 'development' }, vars: { UNFOLD_RELEASES_ENABLED: 'true' } };
  for (const result of ['success', 'failure', 'skipped']) assert.equal(evaluate(pending.if, { ...released, needs: { 'merge-pin': { result } } }), true, `a pin merge that ended ${result} leaves the train unchanged`);
  assert.equal(evaluate(pending.if, { ...released, needs: { 'merge-pin': { result: 'cancelled' } } }), false, 'a cancelled train stops');
  assert.equal(pending.steps[0].with.ref, '${{ github.ref }}', 'pending reads the head after the pin merged, not the commit the train was queued for');
  const step = merge.steps.at(-1);
  assert.equal(step.run, 'python3 scripts/release_train_pin.py');
  assert.deepEqual(step.env, {
    FORGEJO_REPOSITORY_API: '${{ github.server_url }}/api/v1/repos/${{ github.repository }}',
    REPOSITORY: '${{ github.repository }}',
    PIN_BASE: 'development',
    PIN_AUTHOR: 'ploeg-release',
    WEBGRIP_CI_TOKEN: '${{ secrets.WEBGRIP_CI_TOKEN }}',
  });
  assert.equal(step['continue-on-error'], undefined, 'a broken pin merge shows red instead of passing quietly');
  for (const [file, workflow] of Object.entries(workflows)) {
    for (const [name, job] of Object.entries(workflow.jobs)) {
      if (file !== 'on_release_train.yml' || name !== 'merge-pin') assert.doesNotMatch(JSON.stringify(job), /release_train_pin\.py/, `${file} ${name} must not merge Ploeg pins`);
    }
  }
});

test('the release train releases only the commit its checks passed, and only when an application has unreleased commits', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'unfold-release-train-'));
  const script = path.join(root, 'scripts/release-train.sh');
  const output = path.join(directory, 'output');
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' } });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const commit = (file, subject) => {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.appendFileSync(path.join(directory, file), `${subject}\n`);
    git('add', file);
    git('commit', '--quiet', '-m', subject);
    return git('rev-parse', 'HEAD');
  };
  const run = (...args) => {
    fs.writeFileSync(output, '');
    const result = spawnSync('sh', [script, ...args], { cwd: directory, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: output } });
    assert.equal(result.status, 0, result.stderr);
    return Object.fromEntries(fs.readFileSync(output, 'utf8').trim().split('\n').map(line => line.split('=')));
  };
  try {
    git('init', '--quiet', '--initial-branch=development');
    commit('apps/unfold/app.txt', 'feat(unfold): first');
    git('tag', 'unfold-v0.4.0-rc.1');
    commit('apps/site/page.txt', 'feat(site): a first page');
    git('tag', 'unfold-site-v1.0.0-rc.1');
    assert.deepEqual(run('pending'), { sha: git('rev-parse', 'HEAD'), unreleased: 'false' }, 'each release tag sits on the commit it released, so nothing after it is pending');
    commit('docs/guide.md', 'docs: a guide');
    assert.equal(run('pending').unreleased, 'false', 'a docs-only change releases nothing');
    const site = commit('apps/site/page.txt', 'feat(site): a page');
    assert.equal(run('pending').unreleased, 'true', 'a site change waits for a site release');
    git('tag', 'unfold-site-v1.0.0-rc.2');
    assert.equal(run('pending').unreleased, 'false');
    const checked = commit('apps/unfold/app.txt', 'fix(ploeg): update Ploeg');
    assert.deepEqual(run('pending'), { sha: checked, unreleased: 'true' });
    assert.deepEqual(run('current', checked), { current: 'true' });
    git('tag', 'unfold-v0.4.0-rc.2');
    assert.deepEqual(run('current', checked), { current: 'true' }, 'the Unfold release adds a tag and no commit, so the site release still finds the checked head');
    assert.equal(run('pending').unreleased, 'false');
    assert.deepEqual(run('current', site), { current: 'false' }, 'commits nobody checked landed after it');
    const lookalike = commit('apps/unfold/app.txt', 'chore(release): unfold-v0.4.0-rc.3 [skip ci]');
    assert.equal(run('pending').unreleased, 'true', 'no release writes a commit any more, so a release-commit subject is an ordinary unreleased commit');
    assert.deepEqual(run('current', checked), { current: 'false' }, 'a commit after the checked head is never released, whatever its subject');
    assert.deepEqual(run('current', lookalike), { current: 'true' });
    commit('apps/unfold/app.txt', 'feat(unfold): merged during the checks');
    assert.deepEqual(run('current', lookalike), { current: 'false' });
    assert.deepEqual(run('current', 'not-a-commit'), { current: 'false' }, 'an unknown commit is never current');
    git('checkout', '--quiet', '-b', 'elsewhere', site);
    const sideways = commit('apps/unfold/app.txt', 'feat(unfold): not on development');
    git('checkout', '--quiet', 'development');
    assert.deepEqual(run('current', sideways), { current: 'false' }, 'a commit that is not behind the head is never released');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('warnings from setup and verification turn their own job red without gating a release', () => {
  const verification = read('.forgejo/actions/verify/action.yml');
  const captured = verification.runs.steps.filter(step => / 2>&1 \| tee (-a )?"\$\{RUNNER_TEMP:-\/tmp\}\/unfold-output\//.test(step.run ?? ''));
  assert.deepEqual(captured.map(step => step.run.match(/mise (.+?) 2>&1/)[1]), ['-C apps/unfold install', '-C apps/site install', 'run setup', 'run verify']);
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

const releaseJobs = () => Object.entries(workflows).flatMap(([file, workflow]) => Object.entries(workflow.jobs)
  .filter(([, job]) => job.steps?.some(step => String(step.uses).includes('/composite-actions/semantic-release-monorepo@')))
  .map(([name, job]) => ({ file, name, job })));

test('every release job runs the tags-only toolchain: one 2.x image pinned by digest and the composite major that accepts it', () => {
  const jobs = releaseJobs();
  assert.deepEqual(jobs.map(({ file, name }) => `${file} ${name}`).sort(), ['on_release_preview.yml preview', 'on_release_train.yml release', 'on_release_train.yml site-release', 'on_source_change.yml site-release']);
  const image = train.jobs.release.container.image;
  assert.match(image, /^harbor\.webgrip\.dev\/webgrip\/semantic-release:2\.\d+\.\d+@sha256:[a-f0-9]{64}$/);
  const composite = train.jobs.release.steps.find(step => step.id === 'release').uses;
  assert.match(composite, /\/composite-actions\/semantic-release-monorepo@v3\.\d+\.\d+$/);
  for (const { file, name, job } of jobs) {
    assert.equal(job.container.image, image, `${file} ${name}`);
    assert.equal(job.steps.find(step => String(step.uses).includes('/composite-actions/semantic-release-monorepo@')).uses, composite, `${file} ${name}`);
  }
  assert.equal(workflows['on_pull_request.yml'].jobs['release-policy'].container.image, image, 'a pull request tests the release policy in the image that releases');
  const tag = image.slice(0, image.indexOf('@'));
  assert.ok(fs.readFileSync(path.join(root, 'mise.toml'), 'utf8').includes(` ${tag} -c 'node --test scripts/release-policy.test.cjs`), 'mise run release-check runs in the same image');
});

test('a release job publishes through the semantic-release step alone, which adopts a release Forgejo already filed for the tag', () => {
  for (const { file, name, job } of releaseJobs()) {
    const release = job.steps.findIndex(step => String(step.uses).includes('/composite-actions/semantic-release-monorepo@'));
    assert.equal(release, job.steps.length - 1, `${file} ${name}: nothing runs after semantic release`);
  }
  assert.doesNotMatch(JSON.stringify(workflows), /release-repair|release-prepare/);
  assert.ok(!fs.existsSync(path.join(root, 'scripts/release-repair.mjs')));
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
  const budgets = read('apps/unfold/ops/security/cve-budgets.yaml');
  assert.equal(budgets.images['unfold'].mode, 'enforce');
  assert.ok(fs.statSync(path.join(root, 'apps/unfold/ops/vex/statements')).isDirectory());
});

test('the chart is published only after every image of the release, and defaults each image to the digest its job pushed', () => {
  const chart = publisher.jobs['unfold-release-publish-chart'];
  const pushesImage = job => (job.steps ?? []).some(step => /\/docker-build-push[^/]*@|\/cosign-sign-attest@/.test(step.uses ?? '') || /\b(docker|buildx|regctl|crane|oras) [^|;]*\b(push|copy)\b/.test(step.run ?? ''));
  const imageJobs = Object.entries(publisher.jobs).filter(([name, job]) => name !== 'unfold-release-distribute' && pushesImage(job)).map(([name]) => name);
  assert.deepEqual(imageJobs, ['unfold-release-distribute-harbor']);
  for (const name of imageJobs) assert.ok(chart.needs.includes(name), `the chart job needs ${name}: a chart in a registry is a complete release (ADR-0043)`);
  const publish = chart.steps.find(step => step.run?.includes('python3 scripts/publish_chart.py unfold'));
  for (const name of imageJobs) {
    const job = publisher.jobs[name];
    const digest = job.steps.find(step => step.id === 'digest');
    assert.match(digest.run, /echo "digest-\$\{\{ matrix\.name \}\}=\$digest" >> "\$GITHUB_OUTPUT"/, 'each matrix leg writes its digest under its own name, so the legs\' outputs merge');
    for (const { name: image } of job.strategy.matrix.include) {
      assert.equal(job.outputs[`${image}-digest`], `\${{ steps.digest.outputs.digest-${image} }}`, image);
      assert.equal(publish.env[`${image.toUpperCase().replace(/-/g, '_')}_IMAGE_DIGEST`], `\${{ needs.${name}.outputs.${image}-digest }}`, image);
    }
  }
  assert.ok(publisher.jobs['unfold-release-distribute'].needs.includes('unfold-release-publish-chart'), 'the mirrors copy the chart only after it is published');
});

test('every publish job stamps the version from the release tag into the tagged tree before it packages or builds', () => {
  const version = '${{ needs.parse-release-tag.outputs.version }}';
  const stampAt = (steps, sources) => steps.findIndex(step => step.run === `node apps/unfold/scripts/stamp-version.mjs "$VERSION"${sources}` && step.env?.VERSION === version);
  const chart = publisher.jobs['unfold-release-publish-chart'].steps;
  const chartStamp = stampAt(chart, ' chart');
  assert.ok(chartStamp > chart.findIndex(step => step.uses?.startsWith('actions/checkout@')), 'the chart job stamps its checkout of the tag');
  assert.ok(chartStamp < chart.findIndex(step => step.run?.includes('python3 scripts/publish_chart.py unfold')), 'the chart job stamps before it packages');
  const extension = publisher.jobs['unfold-release-publish-extension'].steps;
  const extensionStamp = stampAt(extension, '');
  assert.ok(extensionStamp > extension.findIndex(step => step.uses?.includes('/mise-action@')), 'the extension job installs Node before it stamps');
  assert.ok(extensionStamp < extension.findIndex(step => step.run?.includes('run package --')), 'the extension job stamps before it packages the VSIX');
  const build = publisher.jobs['unfold-release-distribute-harbor'].steps.find(step => step.id === 'build');
  assert.match(build.uses, /\/docker-build-push-registry-fast@/);
  assert.ok(build.with['docker-build-args'].split('\n').includes(`IMAGE_VERSION=${version}`), 'the composite checks the tag out again, so the image build stamps from its IMAGE_VERSION argument');
  const dockerfile = fs.readFileSync(path.join(root, 'apps/unfold/Dockerfile'), 'utf8');
  const stage = dockerfile.slice(dockerfile.indexOf(' AS stage\n'), dockerfile.indexOf(' AS git\n'));
  const stamp = stage.indexOf('RUN if [ "${IMAGE_VERSION}" != dev ]; then node scripts/stamp-version.mjs "${IMAGE_VERSION}" app; fi\n');
  assert.ok(stamp > stage.indexOf('COPY scripts ./scripts\n') && stage.indexOf('COPY scripts ./scripts\n') > stage.indexOf('COPY package.json package-lock.json ./\n'), 'the stage stamps the manifests the runtime reads after copying the stamp script');
  assert.ok(stage.indexOf('ARG IMAGE_VERSION=dev\n') < stamp);
  const publishChart = fs.readFileSync(path.join(root, 'scripts/publish_chart.py'), 'utf8');
  assert.match(publishChart, /'helm', 'package', str\(staged\), '--destination', str\(destination\), '--version', version, '--app-version', version/);
  assert.doesNotMatch(publishChart, /Chart metadata does not match the release version/);
});

test('the chart job signs the chart it publishes with the image signing identity, so a consumer can verify it before following a candidate', () => {
  const chart = publisher.jobs['unfold-release-publish-chart'];
  assert.equal(chart['enable-openid-connect'], true);
  assert.deepEqual(chart.permissions, { contents: 'read' });
  const publish = chart.steps.find(step => step.run?.includes('python3 scripts/publish_chart.py unfold'));
  assert.match(publish.name, /sign and verify/);
  const script = fs.readFileSync(path.join(root, 'scripts/publish_chart.py'), 'utf8');
  assert.match(script, /sign_once\(reference\)/);
});

test('the extension job signs and attests the canonical VSIX with the image signing identity, and verifies all three assets before any registry gets it', () => {
  const job = publisher.jobs['unfold-release-publish-extension'];
  assert.equal(job['enable-openid-connect'], true);
  assert.deepEqual(job.permissions, { contents: 'read' });
  const at = predicate => job.steps.findIndex(predicate);
  const restore = at(step => step.run?.includes('scripts/restore_extension_asset.py'));
  const sign = at(step => step.run === 'python3 scripts/sign_extension_asset.py sign "$VERSION"');
  const verify = at(step => step.run === 'python3 scripts/sign_extension_asset.py verify "$VERSION"');
  const openVsx = at(step => step.run?.includes('ovsx publish'));
  const marketplace = at(step => step.run?.includes('vsce publish'));
  assert.ok(restore >= 0 && restore < sign, 'signs the bytes already attached to the release, not a fresh package');
  assert.ok(sign < verify, 'verifies after signing');
  assert.ok(verify < openVsx && openVsx < marketplace, 'no registry publishes a VSIX whose release assets do not verify');
  assert.match(job.steps[verify].name, /cosign verify-blob/);
  for (const index of [sign, verify]) assert.equal(job.steps[index]['continue-on-error'], undefined);
  const script = fs.readFileSync(path.join(root, 'scripts/sign_extension_asset.py'), 'utf8');
  assert.match(script, /'cosign', 'verify-blob', '--key', PUBLIC_KEY/);
  assert.match(script, /'cosign', 'verify-blob-attestation', '--key', PUBLIC_KEY/);
});

test('the Marketplace step prefers the Entra credential, warns about VSCE_PAT until global PATs retire and then fails, and never skips without a summary', () => {
  const step = publisher.jobs['unfold-release-publish-extension'].steps.find(candidate => candidate.run?.includes('vsce publish'));
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'vsix-marketplace-'));
  const work = path.join(bin, 'work');
  fs.mkdirSync(path.join(work, 'apps/unfold/extensions/vscode'), { recursive: true });
  fs.writeFileSync(path.join(bin, 'npx'), '#!/bin/sh\necho "$@" >> "$NPX_LOG"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'date'), '#!/bin/sh\necho "$FAKE_TODAY"\n', { mode: 0o755 });
  const run = (env, today = '2026-11-30', version = '0.5.0') => {
    const summary = path.join(bin, `summary-${Math.random()}`);
    const log = path.join(bin, `npx-${Math.random()}`);
    fs.writeFileSync(summary, '');
    fs.writeFileSync(log, '');
    const result = spawnSync('bash', ['-c', step.run], { cwd: work, encoding: 'utf8', env: { PATH: `${bin}:${process.env.PATH}`, GITHUB_STEP_SUMMARY: summary, NPX_LOG: log, FAKE_TODAY: today, VERSION: version, VSCE_PAT: '', AZURE_CLIENT_ID: '', AZURE_TENANT_ID: '', ...env } });
    return { status: result.status, out: result.stdout + result.stderr, summary: fs.readFileSync(summary, 'utf8'), npx: fs.readFileSync(log, 'utf8') };
  };
  const entra = { AZURE_CLIENT_ID: 'client', AZURE_TENANT_ID: 'tenant' };

  const prerelease = run({ ...entra, VSCE_PAT: 'pat' }, '2026-11-30', '0.5.0-rc.1');
  assert.equal(prerelease.status, 0);
  assert.equal(prerelease.npx, '', 'a pre-release never reaches the Marketplace');
  assert.match(prerelease.summary, /Marketplace: \*\*skipped\*\*, 0\.5\.0-rc\.1 is a pre-release/);

  for (const today of ['2026-11-30', '2027-01-01']) {
    const preferred = run({ ...entra, VSCE_PAT: 'pat' }, today);
    assert.equal(preferred.status, 0, today);
    assert.match(preferred.npx, /vsce publish .*--azure-credential/, today);
    assert.match(preferred.out, /::warning::VSCE_PAT is set but unused/);
    assert.match(preferred.summary, /published 0\.5\.0 with the Entra credential/);
  }
  for (const half of [{ AZURE_CLIENT_ID: 'client' }, { AZURE_TENANT_ID: 'tenant' }]) {
    const broken = run({ ...half, VSCE_PAT: 'pat' });
    assert.equal(broken.status, 1, 'a half-configured Entra credential fails instead of falling back to the PAT');
    assert.equal(broken.npx, '');
    assert.match(broken.summary, /\*\*failed\*\*/);
  }

  const before = run({ VSCE_PAT: 'pat' }, '2026-11-30');
  assert.equal(before.status, 0);
  assert.match(before.out, /::warning::VSCE_PAT is an Azure DevOps global personal access token, and those stop working on 2026-12-01/);
  assert.match(before.npx, /vsce publish --packagePath unfold-0\.5\.0\.vsix --skip-duplicate\n$/);
  for (const today of ['2026-12-01', '2027-03-04']) {
    const after = run({ VSCE_PAT: 'pat' }, today);
    assert.equal(after.status, 1, today);
    assert.equal(after.npx, '', today);
    assert.match(after.out, /::error::Only VSCE_PAT is set.*Fix: .*MARKETPLACE_AZURE_CLIENT_ID and MARKETPLACE_AZURE_TENANT_ID/);
    assert.match(after.summary, /\*\*failed\*\*, VSCE_PAT is a global PAT/);
  }

  const none = run({});
  assert.equal(none.status, 0);
  assert.equal(none.npx, '');
  assert.match(none.out, /::warning::No Marketplace credential is configured/);
  assert.match(none.summary, /Marketplace: \*\*skipped\*\*, no credential is configured/);
  fs.rmSync(bin, { recursive: true });
});

test('Open VSX publishing fails without its token and reports where the build went', () => {
  const step = publisher.jobs['unfold-release-publish-extension'].steps.find(candidate => candidate.run?.includes('ovsx publish'));
  assert.match(step.run, /--skip-duplicate/);
  assert.doesNotMatch(step.run, /--trusted-publishing/, 'Open VSX Trusted Publishing accepts only GitHub Actions identities');
  assert.match(step.run, /exit 1/);
  assert.match(step.run, /GITHUB_STEP_SUMMARY/);
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
  assert.deepEqual(job.container, train.jobs.release.container);
  assert.equal(job.strategy, undefined);
  const step = job.steps.find(step => step.with?.['dry-run']);
  assert.equal(step.with['dry-run'], 'true');
  assert.equal(step.with['package-path'], 'apps');
  assert.equal(step.with['package-name'], 'unfold');
  assert.equal(step.uses, train.jobs.release.steps.find(step => step.id === 'release').uses);
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

test('the site versions on its own train: candidates after Unfold on the release train, stable releases on main', () => {
  assert.deepEqual(source.on.push.branches, ['development', 'main']);
  const stable = source.jobs['site-release'];
  assert.deepEqual(stable.needs, ['checks']);
  for (const event_name of ['push', 'pull_request', 'workflow_dispatch']) {
    for (const ref of ['refs/heads/development', 'refs/heads/main', 'refs/heads/topic']) {
      for (const gate of ['', 'true']) {
        assert.equal(evaluate(stable.if, { github: { event_name, ref }, vars: { UNFOLD_RELEASES_ENABLED: gate } }), event_name === 'push' && ref === 'refs/heads/main' && gate === 'true', `${event_name} ${ref} ${gate}`);
      }
    }
  }
  const candidate = train.jobs['site-release'];
  assert.deepEqual(candidate.needs, ['pending', 'release']);
  const head = candidate.steps.findIndex(step => step.id === 'head');
  assert.deepEqual(candidate.steps[head], train.jobs.release.steps.find(step => step.id === 'head'));
  for (const job of [stable, candidate]) {
    assert.deepEqual(job.container, train.jobs.release.container);
    const release = job.steps.find(step => step.id === 'release');
    assert.equal(release.uses, train.jobs.release.steps.find(step => step.id === 'release').uses);
    assert.equal(release.with['package-path'], 'apps/site');
    assert.equal(release.with['package-name'], 'unfold-site');
  }
  assert.ok(head >= 0 && head < candidate.steps.findIndex(step => step.id === 'release'));
  assert.equal(candidate.steps.find(step => step.id === 'release').if, "steps.head.outputs.current == 'true'");
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
    assert.match(deploy.uses, /^webgrip\/workflows\/\.forgejo\/workflows\/cloudflare-deploy\.yml@v\d+\.\d+\.\d+$/, name);
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
  assert.match(read.uses, /^https:\/\/forgejo\.webgrip\.dev\/webgrip\/workflows\/\.forgejo\/composite-actions\/openbao-read@v\d+\.\d+\.\d+$/);
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
  assert.deepEqual(action.runs.steps.filter(step => step.run).map(step => step.run), ['bash scripts/tutorial-smoke.sh --check', 'mise trust apps/unfold/mise.toml && bash scripts/tutorial-smoke.sh']);
  assert.equal(action.runs.steps.at(-1).if, "steps.prerequisites.outputs.ready == 'true'");
  assert.doesNotMatch(JSON.stringify(action) + JSON.stringify(job), /secrets\.|UNFOLD_RELEASES_ENABLED|permissions/);
  for (const workflow of ['on_pull_request.yml', 'on_source_change.yml']) assert.ok(!('tutorial-smoke' in workflows[workflow].jobs), workflow);
});

test('the weekly external link check is scheduled, pinned and reports without blocking or publishing', () => {
  const schedule = workflows['on_schedule.yml'];
  assert.deepEqual(Object.keys(schedule.on).sort(), ['schedule', 'workflow_dispatch']);
  assert.match(schedule.on.schedule[0].cron, /^\d+ \d+ \* \* [0-6]$/);
  assert.deepEqual(Object.keys(schedule.jobs), ['external-links', 'tutorial-smoke', 'ploeg-ahead', 'release-notes']);
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

const renovateConfig = () => JSON.parse(fs.readFileSync(path.join(root, 'renovate.json'), 'utf8'));
const homelabAllowedLockfileRefresh = /^corepack pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile$/;
const pnpmProjects = () => fs.readdirSync(path.join(root, 'apps'))
  .map(app => path.join('apps', app))
  .filter(directory => fs.existsSync(path.join(root, directory, 'pnpm-lock.yaml')));

test('every pnpm lockfile records the pnpm its package.json names, which a frozen install requires', () => {
  assert.ok(pnpmProjects().length > 0, 'the site is a pnpm project');
  for (const directory of pnpmProjects()) {
    const wanted = JSON.parse(fs.readFileSync(path.join(root, directory, 'package.json'), 'utf8')).packageManager;
    assert.match(wanted, /^pnpm@\d+\.\d+\.\d+$/, `${directory} pins one pnpm release`);
    const environment = readFirstYamlDocument(path.join(root, directory, 'pnpm-lock.yaml'));
    const recorded = environment.importers['.'].packageManagerDependencies.pnpm;
    assert.deepEqual([recorded.specifier, recorded.version], [wanted.slice('pnpm@'.length), wanted.slice('pnpm@'.length)], `${directory}/pnpm-lock.yaml records pnpm ${recorded.version}, package.json names ${wanted}: run corepack pnpm install --lockfile-only in ${directory}`);
  }
});

test('Renovate refreshes the lockfile\'s pnpm record with the pnpm it moves to, through a command the homelab allows', () => {
  const rules = renovateConfig().packageRules.filter(rule => rule.postUpgradeTasks && (rule.matchDepNames ?? []).includes('pnpm'));
  assert.equal(rules.length, 1);
  const [rule] = rules;
  assert.deepEqual([rule.matchManagers, rule.matchDepTypes], [['npm'], ['packageManager']], 'only a move of packageManager changes the record');
  assert.equal(rule.postUpgradeTasks.workingDirTemplate, '{{{packageFileDir}}}', 'the command runs where the moved package.json lives');
  assert.equal(rule.postUpgradeTasks.executionMode, 'update');
  assert.deepEqual(rule.postUpgradeTasks.fileFilters, ['**/pnpm-lock.yaml']);
  assert.equal(rule.postUpgradeTasks.commands.length, 1);
  assert.match(rule.postUpgradeTasks.commands[0], homelabAllowedLockfileRefresh, 'the self-hosted Renovate runs only commands its allowedCommands list');
});

test('Renovate reads every image of the local MCP compose file under the nightly job\'s name for it, so one update moves both pins', () => {
  const composeFile = 'apps/unfold/test/e2e/authentik.compose.yaml';
  const compose = fs.readFileSync(path.join(root, composeFile), 'utf8');
  const { authentik, postgresql } = workflows['on_nightly.yml'].jobs['mcp-e2e'].services;
  const config = renovateConfig();
  const hiding = config.ignorePaths.filter(pattern => path.matchesGlob(composeFile, pattern));
  assert.deepEqual(hiding, [], 'Renovate reads no file that ignorePaths matches');
  const readers = config.customManagers.filter(manager => manager.managerFilePatterns.some(pattern => new RegExp(pattern.slice(1, -1)).test(composeFile)));
  const pins = readers.flatMap(manager => manager.matchStrings.flatMap(expression => [...compose.matchAll(new RegExp(expression, 'g'))]
    .map(match => `${manager.depNameTemplate}:${match.groups.currentValue}@${match.groups.currentDigest}`)));
  const images = new Set([...compose.matchAll(/^\s*image: (.+)$/gm)].map(match => match[1]));
  assert.equal(pins.length, images.size, 'every image the compose file names is pinned under a Renovate manager');
  assert.deepEqual(pins.sort(), [authentik.image, postgresql.image].sort());
  assert.ok(readers.every(manager => manager.datasourceTemplate === 'docker' && manager.versioningTemplate === 'docker'), 'the workflow manager looks images up as docker with docker versioning');
});

test('Renovate moves the committed unfold-agent references to the newest Unfold candidate on Harbor without cutting a release', () => {
  const config = renovateConfig();
  const files = ['apps/unfold/ops/cluster/agent-sandbox/warm-pool.yaml', 'apps/unfold/ops/local/config.live.example.json'];
  for (const file of files) {
    assert.deepEqual(config.ignorePaths.filter(pattern => path.matchesGlob(file, pattern)), [], `Renovate reads ${file}`);
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const readers = config.customManagers.filter(manager => manager.managerFilePatterns.some(pattern => new RegExp(pattern.slice(1, -1)).test(file)));
    assert.equal(readers.length, 1, `one manager owns ${file}`);
    const [manager] = readers;
    const dependencies = manager.matchStrings.flatMap(expression => [...text.matchAll(new RegExp(expression, 'g'))].map(match => match.groups));
    assert.equal(dependencies.length, [...text.matchAll(/harbor\.webgrip\.dev\/webgrip\/unfold-agent:/g)].length, `every unfold-agent reference in ${file} is extracted`);
    assert.ok(dependencies.length > 0, file);
    for (const dependency of dependencies) {
      assert.equal(dependency.depName, 'harbor.webgrip.dev/webgrip/unfold-agent');
      assert.match(dependency.currentValue, /^0\.\d+\.\d+-rc\.\d+$/, 'a reference names an Unfold candidate, which Renovate moves on from the committed one');
    }
    assert.deepEqual([manager.datasourceTemplate, manager.versioningTemplate], ['docker', 'semver']);
  }
  const rules = config.packageRules.filter(rule => (rule.matchPackageNames ?? []).includes('harbor.webgrip.dev/webgrip/unfold-agent'));
  assert.equal(rules.length, 1);
  const [rule] = rules;
  assert.equal(rule.ignoreUnstable, false, 'every Unfold release is an rc candidate, which Renovate otherwise skips');
  assert.equal(rule.rollbackPrs, false, 'a reference ahead of Harbor is a release still publishing');
  assert.equal(rule.semanticCommitType, 'chore');
  assert.notEqual(rule.semanticCommitScope, 'deps', 'chore(deps) releases Unfold, and that release would offer its image again');
  for (const candidate of ['0.4.0-rc.115', '0.4.0', '0.5.0-rc.1']) assert.match(`harbor.webgrip.dev/webgrip/unfold-agent:${candidate}`, new RegExp(`^${config.customManagers.find(manager => manager.managerFilePatterns.some(pattern => pattern.includes('warm-pool'))).matchStrings[0]}$`));
});
