import assert from 'node:assert/strict';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deliveryFixture } from '../test/delivery-fixture.ts';
import { policyDigest } from '../src/delivery-config.ts';
import { createApplication } from '../src/main.ts';
import type { AppConfig, Session } from '../src/types.ts';

const [mode, path] = process.argv.slice(2);
if (!path || !['--prepare', '--run'].includes(mode)) throw new Error('Use --prepare <fixture.json> or --run <fixture.json>.');
if (mode === '--prepare') {
  const image = process.env.VLOER_VERIFIER_IMAGE;
  if (!image) throw new Error('Set VLOER_VERIFIER_IMAGE to an existing digest-pinned image.');
  const f = await deliveryFixture(); f.policy.image = image; await f.fix(); const candidate = await f.capture('authority-candidate'); assert.equal(candidate.status, 'ready');
  await writeFile(path, JSON.stringify({ root: f.root, dataDir: f.dataDir, policy: f.policy, candidate, policySha256: policyDigest(f.policy) }));
} else {
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  const upstream = process.env.PLOEG_QUALIFICATION_URL; const token = process.env.PLOEG_QUALIFICATION_TOKEN;
  if (!upstream || !token || !process.env.PLOEG_VERIFIER_QUALIFICATION_TOKEN) throw new Error('Run from Ploeg delivery authority qualification.');
  const config: AppConfig = { mode: 'demo', host: '127.0.0.1', port: 0, dataDir: fixture.dataDir, publicDir: fileURLToPath(new URL('../public', import.meta.url)), repositories: [{ id: 'prices', name: 'Price fixture', description: 'Deterministic qualification', url: 'https://forge.example.test/research/prices.git', baseBranch: 'main', verify: [], executionOwner: 'ploeg' }], crews: [], models: [], runtime: { kind: 'demo', backend: 'local', timeoutMs: 30000 }, auth: { secureCookies: false, sessionHours: 1, bootstrapName: 'admin' }, maxConcurrentSessions: 1, maxBudgetUsd: 1, execution: { team: 'delivery' }, ploeg: { url: upstream, tokenEnv: 'PLOEG_QUALIFICATION_TOKEN', teams: ['delivery'] }, delivery: { verifierTokenEnv: 'PLOEG_VERIFIER_QUALIFICATION_TOKEN', socketPath: process.env.VLOER_DOCKER_SOCKET, policies: [fixture.policy] } };
  async function authority(suffix: string, payload: object): Promise<any> { const response = await fetch(`${upstream}/api/v1/operator/executions${suffix}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'X-Ploeg-Actor': 'demo-operator', 'content-type': 'application/json' }, body: JSON.stringify(payload) }); const data = await response.json(); assert.ok(response.ok, `${suffix}: ${JSON.stringify(data)}`); return data; }
  let app: Awaited<ReturnType<typeof createApplication>> | undefined;
  try {
    let execution = (await authority('', { sessionId: 'authority-candidate', team: 'delivery', title: 'Candidate authority qualification', objective: 'Verify a real fixed fixture without model calls.', repositoryId: 'prices', repositoryUrl: config.repositories[0].url, baseBranch: 'main', crewId: 'delivery', budgetUsd: 1, demo: true })).execution;
    execution = (await authority(`/${execution.id}/commands`, { commandId: 'start-qualification', action: 'start', expectedRevision: execution.revision, generation: execution.generation })).execution;
    execution = (await authority(`/${execution.id}/commands`, { commandId: 'complete-qualification', action: 'report', state: 'completed', stopConfirmed: true, expectedRevision: execution.revision, generation: execution.generation })).execution;
    app = await createApplication(config);
    const session: Session = { id: 'authority-candidate', title: 'Verified candidate qualification', objective: 'A real fixed Git fixture for independent verification.', repositoryId: 'prices', crewId: 'delivery', runtime: 'demo', ownerId: 'demo-operator', ownerName: 'Demo operator', status: 'completed', budgetUsd: 1, spentUsd: 0, costStatus: 'demo', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), branch: 'vloer/authority-candidate', runs: [], artifacts: [], candidate: fixture.candidate, execution };
    app.store.saveSession(session); app.store.setSecret(`authority:${session.id}`, execution);
    let base = '';
    async function listen() { await new Promise<void>(done => app!.server.listen(0, '127.0.0.1', done)); const address = app!.server.address(); assert.ok(address && typeof address !== 'string'); base = `http://127.0.0.1:${address.port}`; }
    async function request(suffix: string, payload?: object): Promise<any> { const response = await fetch(`${base}/api/sessions/authority-candidate/delivery${suffix}`, { method: payload ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-vloer-request': '1', origin: base }, body: payload ? JSON.stringify(payload) : undefined }); const data = await response.json(); assert.ok(response.ok, `${suffix}: ${JSON.stringify(data)}`); return data; }
    await listen(); const verified = await request('/verify', {}); assert.equal(verified.receipt.passed, true); assert.equal(verified.receipt.testCount, 2); assert.equal(verified.candidate.workItemId, execution.workItemId);
    await app.close(); app = await createApplication(config); await listen(); const replay = await request('/verify', {}); assert.equal(replay.receipt.id, verified.receipt.id); assert.equal(app.store.events(session.id).filter(event => event.type === 'delivery.verification_started').length, 1);
    const approved = await request('/approve', { candidateId: verified.candidate.id, receiptId: verified.receipt.id, policySha256: fixture.policySha256 }); assert.equal(approved.approval.candidateId, verified.candidate.id); assert.equal(approved.publicationEnabled, false);
    const result = { ok: true, at: new Date().toISOString(), qualification: 'real PostgreSQL, Ploeg HTTP, De Vloer HTTP, Git objects, fresh Docker verifier, durable restart/replay and candidate-bound approval', executionId: execution.id, workItemId: execution.workItemId, canonicalSha: verified.candidate.canonicalSha, receiptId: verified.receipt.id, approvalId: approved.approval.id, tests: 2, verifierStartsAcrossRestart: 1, modelCalls: 0, spendUsd: 0, publication: 'disabled' };
    if (process.env.VLOER_DELIVERY_EVIDENCE) {
      const evidence = process.env.VLOER_DELIVERY_EVIDENCE;
      await mkdir(evidence, { recursive: true }); await writeFile(join(evidence, 'authority-qualification.json'), JSON.stringify(result, null, 2) + '\n');
      const { chromium } = await import('playwright'); const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' }); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${base}/#session/authority-candidate`); await page.getByRole('heading', { name: 'Commit approved', exact: true }).waitFor();
        await page.screenshot({ path: join(evidence, 'candidate-approved-desktop.png'), fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: join(evidence, 'candidate-approved-mobile.png'), fullPage: true });
        assert.deepEqual(errors, []); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      } finally { await browser.close(); }
    }
    console.log(JSON.stringify(result));
  } finally { await app?.close(); await rm(fixture.root, { recursive: true, force: true }); }
}
