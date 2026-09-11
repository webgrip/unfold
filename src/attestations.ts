import { createHash, generateKeyPairSync, createPrivateKey, createPublicKey, randomUUID, sign as signBytes, verify as verifyBytes, type KeyObject } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { CandidateManifest } from './candidates.ts';
import type { AppConfig, Repository, Session } from './types.ts';

export const candidatePredicateType = 'https://webgrip.dev/attestations/agent-candidate/v1';
export const tracePredicateType = 'https://agent-trace.dev/schemas/v1/trace-record.json';
export const statementType = 'https://in-toto.io/Statement/v1';
export const payloadType = 'application/vnd.in-toto+json';
export const attestationNames = { attestation: 'candidate.attestation.json', trace: 'candidate.trace.json', publicKey: 'attestation-signing.pub' };

type Json = Record<string, unknown>;
export type Envelope = { payloadType: string; payload: string; signatures: { keyid: string; sig: string }[] };

export function pae(type: string, body: Buffer): Buffer {
  return Buffer.concat([Buffer.from(`DSSEv1 ${Buffer.byteLength(type)} ${type} ${body.length} `), body]);
}

export function keyId(publicKey: KeyObject): string {
  return createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
}

export class SigningKey {
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
  readonly id: string;

  constructor(privateKey: KeyObject) {
    this.privateKey = privateKey;
    this.publicKey = createPublicKey(privateKey);
    this.id = keyId(this.publicKey);
  }

  static load(dataDir: string): SigningKey {
    const path = resolve(dataDir, 'attestation-signing.key');
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    if (!existsSync(path)) {
      const pair = generateKeyPairSync('ed25519');
      writeFileSync(path, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
    }
    const key = new SigningKey(createPrivateKey(readFileSync(path)));
    writeFileSync(resolve(dataDir, attestationNames.publicKey), key.publicPem(), { mode: 0o644 });
    return key;
  }

  publicPem(): string { return this.publicKey.export({ type: 'spki', format: 'pem' }).toString(); }

  sign(statement: Json): Envelope {
    const payload = Buffer.from(JSON.stringify(statement));
    const signature = signBytes(null, pae(payloadType, payload), this.privateKey);
    return { payloadType, payload: payload.toString('base64'), signatures: [{ keyid: this.id, sig: signature.toString('base64') }] };
  }
}

export function verifyEnvelope(envelope: Envelope, publicKeyPem: string): { valid: boolean; statement?: Json; keyid?: string } {
  const publicKey = createPublicKey(publicKeyPem);
  if (envelope.payloadType !== payloadType || !Array.isArray(envelope.signatures) || !envelope.signatures.length) return { valid: false };
  const payload = Buffer.from(envelope.payload, 'base64');
  const expectedId = keyId(publicKey);
  for (const signature of envelope.signatures) {
    if (signature.keyid && signature.keyid !== expectedId) continue;
    if (verifyBytes(null, pae(payloadType, payload), publicKey, Buffer.from(signature.sig, 'base64'))) return { valid: true, statement: JSON.parse(payload.toString()) as Json, keyid: signature.keyid };
  }
  return { valid: false };
}

function sha256(content: Buffer): string { return createHash('sha256').update(content).digest('hex'); }

export function changedLineRanges(patch: string): Map<string, { endLine: number }> {
  const ranges = new Map<string, { endLine: number }>();
  let current: string | undefined;
  for (const line of patch.split('\n')) {
    const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (header) { current = header[2]; if (!ranges.has(current)) ranges.set(current, { endLine: 0 }); continue; }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && current) {
      const start = Number(hunk[1]); const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      const end = count === 0 ? start : start + count - 1;
      const entry = ranges.get(current)!;
      if (end > entry.endLine) entry.endLine = end;
    }
  }
  return ranges;
}

export type AttestationInput = { config: AppConfig; session: Session; repository: Repository; manifest: CandidateManifest; bundle: Buffer; patch: Buffer; manifestBytes: Buffer; version: string };

export function candidateStatement(input: AttestationInput): Json {
  const { session, repository, manifest } = input;
  const workspace = session.workspace;
  const crew = input.config.crews.find(item => item.id === session.crewId);
  const models = new Map(input.config.models.map(model => [model.id, model]));
  return {
    _type: statementType,
    subject: [
      { name: manifest.downloads.bundle.filename, digest: { sha256: sha256(input.bundle) } },
      { name: manifest.downloads.patch.filename, digest: { sha256: sha256(input.patch) } },
      { name: 'manifest.json', digest: { sha256: sha256(input.manifestBytes) } },
      { name: `${repository.url}#${session.branch}`, digest: { gitCommit: manifest.headSha, gitTree: manifest.treeSha } },
    ],
    predicateType: candidatePredicateType,
    predicate: {
      producer: { name: 'de-vloer', version: input.version },
      session: { id: session.id, title: session.title, ownerId: session.ownerId, createdAt: session.createdAt, branch: session.branch, placement: session.placement ?? null, ...(session.sourceTask ? { sourceTask: { provider: session.sourceTask.provider, id: session.sourceTask.id, revision: session.sourceTask.revision, url: session.sourceTask.url, ...(session.sourceTask.ploeg ? { nativeRevision: session.sourceTask.nativeRevision, bindingRevision: session.sourceTask.bindingRevision, ploeg: session.sourceTask.ploeg } : {}) } } : {}) },
      repository: { id: repository.id, url: repository.url, baseBranch: repository.baseBranch, baseSha: manifest.baseSha, snapshotBaseSha: manifest.snapshotBaseSha },
      candidate: { headSha: manifest.headSha, treeSha: manifest.treeSha, fileCount: manifest.fileCount, bytes: manifest.bytes, capturedAt: manifest.createdAt, history: manifest.history, scope: manifest.scope, verification: manifest.verification, publication: manifest.publication },
      workspace: workspace ? { backend: workspace.backend, transport: workspace.metadata?.transport ?? null, image: workspace.metadata?.image ?? null, container: workspace.metadata?.container ?? null, pod: workspace.metadata?.pod ?? null, namespace: workspace.metadata?.namespace ?? null } : null,
      crew: crew ? { id: crew.id, roles: crew.roles.map(role => ({ id: role.id, name: role.name, mode: role.mode, model: (session.model ?? role.model) ? models.get(session.model ?? role.model!)?.modelId ?? session.model ?? role.model : input.config.models[0]?.modelId ?? null })) } : null,
      runs: session.runs.map(run => ({ roleId: run.roleId, mode: run.mode, status: run.status, verdict: run.verdict ?? null, nativeId: run.nativeId ?? null, promptSha256: run.promptSha ?? null, costUsd: run.costUsd, startedAt: run.startedAt ?? null, finishedAt: run.finishedAt ?? null })),
      spend: { budgetUsd: session.budgetUsd, spentUsd: session.spentUsd, costStatus: session.costStatus, usage: session.usage ?? null, providers: [...new Set((session.requests ?? []).map(request => request.provider).filter(Boolean))], policy: input.config.gatewayPolicy ?? null },
      harness: { kind: session.runtime },
      files: manifest.files.map(file => ({ path: file.path, status: file.status, bytes: file.bytes, blob: file.blob ?? null })),
    },
  };
}

export function traceStatement(input: AttestationInput): Json {
  const { session, manifest } = input;
  const ranges = changedLineRanges(input.patch.toString('utf8'));
  const sessionUrl = `${input.config.baseUrl ?? `http://${input.config.host}:${input.config.port}`}/#session/${session.id}`;
  const modelIds = [...new Set(session.runs.map(run => { const role = input.config.crews.find(crew => crew.id === session.crewId)?.roles.find(item => item.id === run.roleId); const model = input.config.models.find(item => item.id === role?.model) ?? input.config.models[0]; return model ? `${model.providerId}/${model.modelId}` : undefined; }).filter((value): value is string => Boolean(value)))];
  const record = {
    version: '0.1.0', id: randomUUID(), timestamp: new Date().toISOString(),
    vcs: { type: 'git', revision: manifest.headSha },
    tool: { name: 'de-vloer', version: input.version },
    files: manifest.files.filter(file => file.status !== 'deleted').map(file => ({
      path: file.path,
      conversations: [{
        url: sessionUrl,
        contributor: { type: 'ai', ...(modelIds[0] ? { model_id: modelIds[0] } : {}) },
        ranges: [{ start_line: 1, end_line: Math.max(1, ranges.get(file.path)?.endLine ?? 1), contributor: { type: 'ai', ...(modelIds[0] ? { model_id: modelIds[0] } : {}) } }],
        related: session.runs.filter(run => run.nativeId).map(run => ({ type: 'harness_session', url: `opencode:session/${run.nativeId}` })),
      }],
    })),
    metadata: { 'dev.webgrip.de-vloer': { sessionId: session.id, branch: session.branch, baseSha: manifest.baseSha, roles: session.runs.map(run => run.roleId) } },
  };
  return { _type: statementType, subject: [{ name: 'manifest.json', digest: { sha256: sha256(input.manifestBytes) } }, { name: `git+${input.repository.url}`, digest: { gitCommit: manifest.headSha } }], predicateType: tracePredicateType, predicate: record };
}

export async function attestCandidate(dataDir: string, key: SigningKey, input: Omit<AttestationInput, 'bundle' | 'patch' | 'manifestBytes' | 'manifest'>): Promise<{ attestation: string; trace: string }> {
  const root = resolve(dataDir, 'candidates', input.session.id);
  const [bundle, patch, manifestBytes] = await Promise.all([readFile(join(root, 'candidate.git.bundle')), readFile(join(root, 'candidate.patch')), readFile(join(root, 'manifest.json'))]);
  const manifest = JSON.parse(manifestBytes.toString()) as CandidateManifest;
  if (manifest.sessionId !== input.session.id) throw new Error('Candidate manifest does not belong to this session');
  const full: AttestationInput = { ...input, manifest, bundle, patch, manifestBytes };
  const attestation = key.sign(candidateStatement(full));
  const trace = key.sign(traceStatement(full));
  await writeFile(join(root, attestationNames.attestation), JSON.stringify(attestation, null, 2) + '\n', { mode: 0o600 });
  await writeFile(join(root, attestationNames.trace), JSON.stringify(trace, null, 2) + '\n', { mode: 0o600 });
  return { attestation: sha256(Buffer.from(JSON.stringify(attestation, null, 2) + '\n')), trace: sha256(Buffer.from(JSON.stringify(trace, null, 2) + '\n')) };
}
