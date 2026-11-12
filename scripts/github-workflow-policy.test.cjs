'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { readYaml } = require('./yaml-documents.cjs');

const root = path.resolve(__dirname, '..');
const read = relative => readYaml(path.join(root, relative));
const workflowDirectory = path.join(root, '.github/workflows');
const workflows = Object.fromEntries(fs.readdirSync(workflowDirectory).map(file => [file, read(`.github/workflows/${file}`)]));
const actionDirectory = path.join(root, '.github/actions');
const actions = Object.fromEntries(fs.readdirSync(actionDirectory).map(name => [name, read(`.github/actions/${name}/action.yml`)]));
const pr = workflows['on_pull_request.yml'];
const source = workflows['on_source_change.yml'];
const train = workflows['on_release_train.yml'];
const publisher = workflows['on_release_published.yml'];
const home = { repository: 'unfold-hq/unfold' };
const guard = "github.repository == 'unfold-hq/unfold'";
const evaluate = (expression, context) => vm.runInNewContext(String(expression).replace(/^\$\{\{\s*|\s*\}\}$/g, '').replace(/needs\.([a-z-]+)/g, "needs['$1']"), { startsWith: (value, prefix) => String(value).startsWith(prefix), always: () => true, ...context, github: { ...home, ...(context.github ?? {}) } });
const allJobs = () => Object.entries(workflows).flatMap(([file, workflow]) => Object.entries(workflow.jobs).map(([name, job]) => ({ file, name, job })));
const text = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const githubTree = () => [...fs.readdirSync(workflowDirectory).map(file => `.github/workflows/${file}`), ...fs.readdirSync(actionDirectory).map(name => `.github/actions/${name}/action.yml`)];
const runShell = (script, env) => {
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'github-policy-')), 'output');
  fs.writeFileSync(output, '');
  const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { PATH: process.env.PATH, GITHUB_OUTPUT: output, ...env } });
  return { status: result.status, stderr: result.stderr, outputs: Object.fromEntries(fs.readFileSync(output, 'utf8').trim().split('\n').filter(Boolean).map(line => line.split('='))) };
};
const KEYLESS_SIGNER = '^https://github\\.com/unfold-hq/unfold/\\.github/workflows/on_release_published\\.yml@refs/tags/unfold-v0\\.[0-9]+\\.[0-9]+(-rc\\.[0-9]+)?$';

test('GitHub runs every Forgejo entry point except the documentation one, plus the Ploeg pin auto-merge', () => {
  const ported = ['on_agent_standards.yml', 'on_dns_change.yml', 'on_nightly.yml', 'on_pull_request.yml', 'on_release_preview.yml', 'on_release_published.yml', 'on_release_train.yml', 'on_schedule.yml', 'on_source_change.yml'];
  assert.deepEqual(Object.keys(workflows).sort(), [...ported, 'on_ploeg_pin.yml'].sort());
  if (fs.existsSync(path.join(root, '.forgejo/workflows'))) {
    assert.deepEqual(fs.readdirSync(path.join(root, '.forgejo/workflows')).filter(file => file !== 'on_docs_change.yml').sort(), ported, 'a new Forgejo workflow is ported here too, or named an exception');
  }
  assert.ok(!workflows['on_docs_change.yml'], 'documentation publishing moves in its own change');
});

test('every job runs only in unfold-hq/unfold, on a GitHub-hosted runner, so the mirror and forks stay inert', () => {
  for (const { file, name, job } of allJobs()) {
    assert.ok(String(job.if ?? '').startsWith(guard), `${file}: ${name} starts its condition with ${guard}`);
    assert.equal(job['runs-on'], 'ubuntu-24.04', `${file}: ${name}`);
    assert.equal(job.uses, undefined, `${file}: ${name} calls no reusable workflow`);
    assert.ok(Number(job['timeout-minutes']) > 0, `${file}: ${name} has a timeout`);
    for (const forked of [{ repository: 'someone/unfold' }, { repository: 'webgrip/unfold' }]) {
      assert.equal(evaluate(String(job.if).split(' && ')[0], { github: forked }), false, `${file}: ${name} in ${forked.repository}`);
    }
  }
  for (const [file, workflow] of Object.entries(workflows)) {
    assert.deepEqual(workflow.permissions, { contents: 'read' }, `${file} grants read-only by default and widens per job`);
    assert.ok(!('pull_request_target' in workflow.on), `${file}: no workflow runs fork code with repository secrets`);
  }
});

test('no GitHub workflow or action names a Webgrip host, credential, composite or tracker', () => {
  for (const file of githubTree()) {
    assert.doesNotMatch(text(file), /webgrip|harbor|forgejo|openbao|vikunja|clickup|WEBGRIP_CI_TOKEN|OVSX_PAT|homelab/i, file);
  }
});

test('every action is local or pinned to a full commit, and every image is public and pinned by digest', () => {
  const pinned = /^[a-z0-9-]+\/[a-z0-9-]+(?:\/[a-z0-9/-]+)?@[0-9a-f]{40}$/;
  const checkSteps = (steps, label, composite) => {
    let checkedOut = composite;
    for (const step of steps) {
      if (step.uses?.startsWith('actions/checkout@')) checkedOut = true;
      if (step.uses?.startsWith('./')) {
        assert.ok(checkedOut, `${label}: checkout precedes the local action ${step.uses}`);
        assert.match(step.uses, /^\.\/\.github\/actions\/[a-z0-9-]+$/);
        const action = actions[step.uses.split('/').at(-1)];
        assert.equal(action.runs.using, 'composite');
        checkSteps(action.runs.steps, step.uses, true);
      } else if (step.uses) {
        assert.match(step.uses, pinned, `${label}: ${step.uses}`);
      }
      if (step.run) {
        if (composite) assert.equal(step.shell, 'bash', `${label}: composite steps name their shell`);
        const syntax = spawnSync('bash', ['-n'], { input: step.run, encoding: 'utf8' });
        assert.equal(syntax.status, 0, `${label}: ${syntax.stderr}`);
        for (const [, image] of step.run.matchAll(/(?:docker run [^\n]*?|image=)((?:docker\.io|ghcr\.io|mcr\.microsoft\.com)\/[^\s@]+(?:@\S+)?)/g)) {
          assert.match(image, /@sha256:[0-9a-f]{64}$/, `${label}: ${image}`);
        }
      }
    }
  };
  for (const { file, name, job } of allJobs()) {
    checkSteps(job.steps, `${file}: ${name}`, false);
    for (const image of [job.container?.image, ...Object.values(job.services ?? {}).map(service => service.image)].filter(Boolean)) {
      assert.match(image, /^(?:docker\.io|ghcr\.io|mcr\.microsoft\.com)\/[^@]+@sha256:[0-9a-f]{64}$/, `${file}: ${name}`);
    }
    for (const dependency of job.needs ?? []) assert.ok(workflows[file].jobs[dependency], `${file}: ${name} needs a missing ${dependency}`);
    for (const [, dependency] of JSON.stringify(job).matchAll(/needs\.([a-z-]+)\./g)) assert.ok(job.needs?.includes(dependency), `${file}: ${name} reads undeclared dependency ${dependency}`);
  }
});

test('the workflows use only the repository secrets the move names, and the Cloudflare deploy token only in the site jobs', () => {
  const allowed = ['AGENT_STANDARDS_MODEL_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_DNS_READ_TOKEN', 'DOCKERHUB_TOKEN', 'DOCKERHUB_USERNAME', 'MARKETPLACE_AZURE_CLIENT_ID', 'MARKETPLACE_AZURE_TENANT_ID', 'VSCE_PAT'];
  const used = new Set();
  for (const { file, name, job } of allJobs()) {
    const secrets = [...JSON.stringify(job).matchAll(/secrets\.([A-Z_]+)/g)].map(match => match[1]);
    secrets.forEach(secret => used.add(secret));
    if (secrets.includes('CLOUDFLARE_API_TOKEN')) assert.ok(file === 'on_release_published.yml' && name.startsWith('site-'), `${file}: ${name} holds the deploy token`);
  }
  assert.deepEqual([...used].filter(secret => !allowed.includes(secret)), []);
});

test('a pull request runs the push\'s checks without write access, and its only secret is the Docker Hub pull for the image contexts', () => {
  assert.deepEqual(Object.keys(pr.on).sort(), ['pull_request', 'workflow_dispatch']);
  assert.deepEqual(Object.keys(pr.jobs).sort(), ['agent-trace', 'agents-check', 'build-contexts', 'checks', 'checks-unfold', 'gate', 'opencode-contract', 'ploeg-docs', 'ploeg-pin', 'release-policy', 'warnings']);
  for (const name of ['checks', 'checks-unfold', 'warnings', 'ploeg-pin']) assert.deepEqual(pr.jobs[name], source.jobs[name], name);
  for (const [name, job] of Object.entries(pr.jobs)) {
    assert.equal(job.permissions, undefined, `${name} keeps the read-only default`);
    const secrets = [...JSON.stringify(job).matchAll(/secrets\.([A-Z_]+)/g)].map(match => match[1]);
    assert.deepEqual(secrets, name === 'build-contexts' ? ['DOCKERHUB_USERNAME', 'DOCKERHUB_TOKEN'] : [], name);
  }
  const contexts = pr.jobs['build-contexts'].steps.at(-1);
  assert.equal(contexts.with['skip-without-credentials'], '${{ github.event.pull_request.head.repo.full_name != github.repository }}', 'only a fork, which gets no secrets, may skip the image contexts');
  const login = actions['build-contexts'].runs.steps[0].run;
  assert.equal(runShell(login, { DHI_USERNAME: '', DHI_TOKEN: '', SKIP: 'false' }).status, 1, 'a missing sign-in fails outside a fork');
  assert.deepEqual(runShell(login, { DHI_USERNAME: '', DHI_TOKEN: '', SKIP: 'true' }), { status: 0, stderr: '', outputs: { ready: 'false' } });
  const verify = actions.verify.runs.steps.find(step => /mise run verify/.test(step.run ?? ''));
  assert.equal(verify.env.UNFOLD_REQUIRE_IMPORT_NOTES, 'true');
});

test('the pull request gate waits for every job except the advisory ones, and passes only when each succeeded', () => {
  const gate = pr.jobs.gate;
  const advisory = ['agent-trace', 'warnings'];
  assert.deepEqual([...gate.needs].sort(), Object.keys(pr.jobs).filter(name => name !== 'gate' && !advisory.includes(name)).sort());
  assert.equal(gate.if, `${guard} && always()`);
  const step = gate.steps.find(candidate => candidate.run);
  const run = needs => spawnSync('bash', ['-eo', 'pipefail', '-c', step.run], { env: { ...process.env, NEEDS: JSON.stringify(needs, null, 2) }, encoding: 'utf8' }).status;
  const all = value => Object.fromEntries(gate.needs.map(name => [name, { result: value, outputs: {} }]));
  assert.equal(run(all('success')), 0);
  for (const failed of ['failure', 'cancelled', 'skipped']) assert.equal(run({ ...all('success'), checks: { result: failed, outputs: {} } }), 1, failed);
  assert.equal(run({}), 1);
});

test('the release train versions Unfold and the site from a checked development head, with the repository\'s own toolchain', () => {
  assert.deepEqual(Object.keys(train.on).sort(), ['schedule', 'workflow_dispatch']);
  assert.match(train.on.schedule[0].cron, /^\d+ \* \* \* \*$/);
  assert.deepEqual(train.concurrency, { group: 'release-train', 'cancel-in-progress': false });
  assert.deepEqual(Object.keys(train.jobs).sort(), ['build-contexts', 'checks', 'checks-unfold', 'pending', 'ploeg-pin', 'release', 'site-release']);
  for (const ref_name of ['development', 'main', 'topic']) {
    for (const gate of ['', 'false', 'true']) {
      const context = { github: { ref_name }, vars: { UNFOLD_RELEASES_ENABLED: gate } };
      for (const name of ['pending', 'release', 'site-release']) assert.equal(evaluate(train.jobs[name].if, context), ref_name === 'development' && gate === 'true', `${name} ${ref_name} ${gate}`);
    }
  }
  for (const name of ['checks', 'checks-unfold', 'build-contexts', 'ploeg-pin']) {
    assert.deepEqual(train.jobs[name].needs, ['pending']);
    assert.equal(train.jobs[name].steps[0].with.ref, '${{ needs.pending.outputs.sha }}', name);
  }
  assert.deepEqual(train.jobs.release.needs, ['pending', 'checks', 'checks-unfold', 'build-contexts', 'ploeg-pin']);
  for (const [name, directory] of [['release', 'apps'], ['site-release', 'apps/site']]) {
    const job = train.jobs[name];
    assert.deepEqual(job.permissions, { contents: 'write', actions: 'write' }, name);
    const at = predicate => job.steps.findIndex(predicate);
    const install = at(step => step.run === 'mise exec node -- npm ci --prefix scripts/release-config --omit=dev --ignore-scripts --no-audit --no-fund');
    const head = at(step => step.id === 'head');
    const release = at(step => step.id === 'release');
    const dispatch = at(step => /^gh workflow run on_release_published\.yml /.test(step.run ?? ''));
    assert.ok(install >= 0 && install < head && head < release && release === dispatch - 1 && dispatch === job.steps.length - 1, name);
    if (name === 'release') assert.ok(at(step => step.uses === './.github/actions/release-policy') > install && at(step => step.uses === './.github/actions/release-policy') < head);
    assert.equal(job.steps[release].if, "steps.head.outputs.current == 'true'");
    assert.equal(job.steps[release]['working-directory'], directory, name);
    assert.equal(job.steps[release].env.UNFOLD_RELEASE_FORGE, 'github');
    assert.equal(job.steps[release].env.GITHUB_TOKEN, '${{ github.token }}');
    assert.match(job.steps[release].run, /scripts\/release-config\/node_modules\/semantic-release\/bin\/semantic-release\.js"$/);
    assert.equal(job.steps[dispatch].run, 'gh workflow run on_release_published.yml --repo "$GITHUB_REPOSITORY" --ref "$TAG" -f tag="$TAG"', 'a tag GITHUB_TOKEN pushes starts no workflow, but a dispatch at that tag does, and signs under the tag ref');
    assert.equal(job.steps[dispatch].if, "steps.release.outputs.tag != ''");
  }
  const stable = source.jobs['site-release'];
  assert.deepEqual(stable.steps.slice(-2).map(step => step.run), train.jobs['site-release'].steps.slice(-2).map(step => step.run));
  for (const ref of ['refs/heads/development', 'refs/heads/main']) {
    for (const event_name of ['push', 'workflow_dispatch']) assert.equal(evaluate(stable.if, { github: { event_name, ref }, vars: { UNFOLD_RELEASES_ENABLED: 'true' } }), event_name === 'push' && ref === 'refs/heads/main');
  }
  for (const { file, job } of allJobs()) {
    if (JSON.stringify(job).includes('semantic-release.js')) assert.ok(['on_release_train.yml', 'on_source_change.yml', 'on_release_preview.yml'].includes(file), file);
  }
  assert.match(workflows['on_release_preview.yml'].jobs.preview.steps.at(-1).run, /semantic-release\.js" --dry-run$/);
});

test('the release configuration files Unfold\'s release as a draft, so publication attaches its assets before GitHub makes it immutable', () => {
  process.env.GITHUB_TOKEN ||= 'github-workflow-policy-test';
  const previous = process.env.UNFOLD_RELEASE_FORGE;
  process.env.UNFOLD_RELEASE_FORGE = 'github';
  try {
    for (const [file, draft] of [['apps/.releaserc.cjs', true], ['apps/site/.releaserc.cjs', false]]) {
      delete require.cache[path.join(root, file)];
      const config = require(path.join(root, file));
      const github = config.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === '@semantic-release/github');
      assert.deepEqual(github[1], { successComment: false, failComment: false, releasedLabels: false, draftRelease: draft }, file);
      delete require.cache[path.join(root, file)];
    }
  } finally {
    if (previous === undefined) delete process.env.UNFOLD_RELEASE_FORGE;
    else process.env.UNFOLD_RELEASE_FORGE = previous;
  }
});

test('publication signs keyless only in on_release_published.yml at a release tag, after the CVE gate, under the identity the cluster admits', () => {
  assert.deepEqual(Object.keys(publisher.on).sort(), ['release', 'workflow_dispatch']);
  assert.deepEqual(publisher.on.release.types, ['published']);
  for (const { file, name, job } of allJobs()) {
    const signs = /cosign (?:sign|attest)|attest-build-provenance/.test(JSON.stringify(job));
    if (signs) {
      assert.equal(file, 'on_release_published.yml', `${file}: ${name} signs outside the admitted workflow`);
      assert.equal(job.permissions['id-token'], 'write', name);
      assert.ok(job.needs.includes('parse-release-tag'), `${name} signs only a parsed release tag`);
    }
  }
  const parse = publisher.jobs['parse-release-tag'].steps[0].run;
  const valid = 'unfold-v0.4.0-rc.5';
  assert.equal(runShell(parse, { WORKFLOW_EVENT: 'workflow_dispatch', RELEASE_TAG: valid, SELECTED_REF: `refs/tags/${valid}` }).status, 0);
  assert.equal(runShell(parse, { WORKFLOW_EVENT: 'workflow_dispatch', RELEASE_TAG: valid, SELECTED_REF: 'refs/heads/development' }).status, 1, 'a dispatch on a branch would sign under a branch identity');
  const images = publisher.jobs['unfold-release-images'];
  const at = predicate => images.steps.findIndex(predicate);
  const digest = at(step => step.id === 'digest');
  const gate = at(step => step.uses === './.github/actions/cve-gate');
  const sign = at(step => /cosign sign --yes "\$REF"/.test(step.run ?? ''));
  assert.ok(digest < gate && gate < sign, 'the CVE gate runs on the pushed digest before anything signs it');
  assert.equal(images.steps[gate].with['budgets-file'], 'apps/unfold/ops/security/cve-budgets.yaml');
  const identities = [...JSON.stringify(publisher).matchAll(/--certificate-identity-regexp '([^']+)'/g)].map(match => match[1].replace(/\\\\/g, '\\'));
  assert.ok(identities.length >= 2);
  for (const identity of identities) assert.equal(identity, KEYLESS_SIGNER);
  const registry = text('scripts/release_registry.py').match(/^GITHUB_SIGNER = r'(.+)'$/m)[1];
  assert.equal(registry, KEYLESS_SIGNER, 'the publisher verifies the identity the workflow signs with');
  const build = images.steps.find(step => step.id === 'build').run;
  assert.match(build, /--label org\.opencontainers\.image\.source="\$SOURCE"/);
  assert.match(build, /--provenance=mode=max --sbom=true/);
  assert.equal(images.steps.find(step => step.id === 'build').env.SOURCE, 'https://github.com/unfold-hq/unfold');
});

test('the chart follows every image, the extension verifies before Open VSX publishes it keylessly, and the distributor publishes the release last', () => {
  const chart = publisher.jobs['unfold-release-publish-chart'];
  assert.deepEqual(chart.needs, ['parse-release-tag', 'unfold-release-images']);
  const publish = chart.steps.at(-1);
  assert.match(publish.run.trimEnd(), /mise exec helm cosign@[\d.]+ -- python3 scripts\/publish_chart\.py unfold "\$VERSION"$/);
  assert.equal(publish.env.UNFOLD_RELEASE_HOME, 'github');
  for (const image of ['unfold', 'unfold-agent']) {
    assert.equal(publisher.jobs['unfold-release-images'].outputs[`${image}-digest`], `\${{ steps.digest.outputs.digest-${image} }}`);
    assert.equal(publish.env[`${image.toUpperCase().replace(/-/g, '_')}_IMAGE_DIGEST`], `\${{ needs.unfold-release-images.outputs.${image}-digest }}`);
  }
  const extension = publisher.jobs['unfold-release-publish-extension'];
  const at = predicate => extension.steps.findIndex(predicate);
  const stamp = at(step => step.run === 'node apps/unfold/scripts/stamp-version.mjs "$VERSION"');
  const pack = at(step => /npm run package -- --out/.test(step.run ?? ''));
  const verify = at(step => /cosign verify-blob --bundle/.test(step.run ?? ''));
  const attach = at(step => /gh release upload/.test(step.run ?? ''));
  const openVsx = at(step => /ovsx publish/.test(step.run ?? ''));
  const marketplace = at(step => /vsce publish/.test(step.run ?? ''));
  assert.ok(stamp >= 0 && stamp < pack && pack < verify && verify < attach && attach < openVsx && openVsx < marketplace);
  assert.match(extension.steps[openVsx].run, /npx --no-install ovsx publish --packagePath "unfold-\$\{VERSION\}\.vsix" --skip-duplicate --trusted-publishing/);
  assert.equal(extension.permissions['id-token'], 'write', 'Trusted Publishing trades the job\'s OIDC identity for a publish token');
  assert.equal(JSON.parse(text('apps/unfold/extensions/vscode/package.json')).publisher, 'unfold-hq');
  const distribute = publisher.jobs['unfold-release-distribute'];
  assert.deepEqual(distribute.needs, ['parse-release-tag', 'unfold-release-images', 'unfold-release-publish-chart', 'unfold-release-publish-extension']);
  assert.equal(distribute.steps.at(-1).run, 'mise exec cosign@2.6.5 -- python3 scripts/publish_release.py unfold "$VERSION"');
  assert.equal(distribute.steps.at(-1).env.UNFOLD_RELEASE_HOME, 'github');
  for (const [name, job] of Object.entries(publisher.jobs).filter(([name]) => name !== 'parse-release-tag' && !name.startsWith('site-'))) {
    for (const version of ['0.4.0-rc.5', '']) assert.equal(evaluate(job.if, { needs: { 'parse-release-tag': { outputs: { version } } } }), version !== '', name);
  }
});

test('a site or Unfold release candidate deploys to staging and a stable site release to unfoldhq.dev, with wrangler and the live checks', () => {
  const gate = publisher.jobs['site-release-tag'].steps[0];
  const run = (tag, extra = {}) => runShell(gate.run, { WORKFLOW_EVENT: 'release', RELEASE_TAG: tag, RELEASES_ENABLED: 'true', CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'account', ...extra });
  for (const tag of ['unfold-site-v0.1.0-rc.1', 'unfold-v0.4.0-rc.34']) assert.deepEqual(run(tag).outputs, { channel: 'prerelease' }, tag);
  assert.deepEqual(run('unfold-site-v1.2.3').outputs, { channel: 'stable' });
  assert.deepEqual(run('unfold-site-v1.2.3', { RELEASES_ENABLED: '' }).outputs, { channel: 'none' });
  for (const tag of ['unfold-v0.4.0', 'unfold-site-v0.1.0-rc.0']) assert.notEqual(run(tag).status, 0, tag);
  assert.notEqual(run('unfold-site-v0.1.0', { CLOUDFLARE_API_TOKEN: '' }).status, 0);
  assert.notEqual(run('unfold-site-v0.1.0', { WORKFLOW_EVENT: 'workflow_dispatch', SELECTED_REF: 'refs/heads/development' }).status, 0);
  for (const [name, channel, origin, flag] of [['site-deploy-staging', 'prerelease', 'https://staging.unfoldhq.dev', ' --env staging'], ['site-deploy-production', 'stable', 'https://unfoldhq.dev', '']]) {
    const job = publisher.jobs[name];
    for (const gateChannel of ['none', 'prerelease', 'stable']) assert.equal(evaluate(job.if, { needs: { 'site-release-tag': { outputs: { channel: gateChannel } } } }), gateChannel === channel, `${name} ${gateChannel}`);
    assert.equal(job.steps.find(step => step.name === 'Build the release').env.UNFOLD_SITE_URL, origin);
    assert.equal(job.steps.find(step => step.name === 'Deploy with wrangler').run, `mise exec -- corepack pnpm exec wrangler deploy${flag}`);
    const edge = job.steps.at(-1);
    assert.equal(edge.uses, './.github/actions/edge-verify');
    assert.equal(edge.with.origin, origin);
    assert.deepEqual(edge.with['smoke-paths'].trim().split('\n'), ['/', '/nl', '/robots.txt', '/sitemap-index.xml', '/favicon.svg', '/demo/', '/demo/replay/replay.json', '/privacy', '/nl/privacy']);
    assert.equal(edge.with['not-found-path'], '/this-page-does-not-exist');
  }
});

test('the unfoldhq.dev zone is previewed and checked for drift with the read-only DNS token alone', () => {
  const dns = workflows['on_dns_change.yml'];
  assert.deepEqual(dns.on.push.paths, ['apps/site/ops/dns/**', '.github/workflows/on_dns_change.yml']);
  const job = dns.jobs.dns;
  assert.deepEqual(job.env, { CLOUDFLARE_API_TOKEN: '${{ secrets.CLOUDFLARE_DNS_READ_TOKEN }}', CLOUDFLARE_ACCOUNT_ID: '${{ secrets.CLOUDFLARE_ACCOUNT_ID }}' });
  const commands = job.steps.map(step => step.run ?? '').join('\n');
  assert.match(commands, /dnscontrol preview --creds creds\.json/);
  assert.match(commands, /--expect-no-changes/);
  assert.doesNotMatch(commands, /dnscontrol push/);
});

test('Ploeg\'s pin pull request merges itself once green: the newest gets auto-merge and the older ones close', () => {
  const pin = workflows['on_ploeg_pin.yml'];
  assert.deepEqual(pin.on.pull_request.branches, ['development']);
  const job = pin.jobs['auto-merge'];
  assert.deepEqual(job.permissions, { contents: 'write', 'pull-requests': 'write' });
  const step = job.steps.at(-1);
  assert.equal(step.run, 'python3 scripts/release_train_pin.py');
  assert.equal(step.env.GITHUB_REPOSITORY_API, '${{ github.api_url }}/repos/${{ github.repository }}');
  assert.equal(step.env.PIN_MERGE_TOKEN, '${{ github.token }}');
  const pull = (head_ref, full_name) => ({ github: { event_name: 'pull_request', head_ref, event: { pull_request: { head: { repo: { full_name } } } } } });
  const condition = job.if.replace(/github\.repository(?! ==)/g, "'unfold-hq/unfold'");
  assert.equal(evaluate(condition, pull('ploeg/0.2.0-rc.80', 'unfold-hq/unfold')), true);
  assert.equal(evaluate(condition, pull('ploeg/0.2.0-rc.80', 'someone/unfold')), false, 'a fork never reaches a write token');
  assert.equal(evaluate(condition, pull('feat/ploeg', 'unfold-hq/unfold')), false);
  for (const { file, name, job: other } of allJobs()) {
    if (other !== job) assert.doesNotMatch(JSON.stringify(other), /release_train_pin\.py/, `${file}: ${name}`);
  }
});

test('the GitHub templates hold no tracker line, and the owner reviews the GitHub configuration', () => {
  assert.doesNotMatch(text('.github/pull_request_template.md'), /Ticket:|CU-|VIK-/);
  assert.match(text('.github/CODEOWNERS'), /^\/\.github\/ @ryangr0$/m);
  assert.match(text('SECURITY.md'), /security\/advisories\/new/);
  for (const form of fs.readdirSync(path.join(root, '.github/ISSUE_TEMPLATE'))) assert.doesNotMatch(text(`.github/ISSUE_TEMPLATE/${form}`), /webgrip|forgejo|vikunja|clickup/i, form);
});
