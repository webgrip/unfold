import { readFileSync } from 'node:fs';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { join } from 'node:path';

const [directory, publicKeyPath] = process.argv.slice(2);
if (!directory || !publicKeyPath) { console.error('usage: verify-candidate.mjs <candidate-directory> <public-key.pem>'); process.exit(2); }
const publicKey = createPublicKey(readFileSync(publicKeyPath));
const keyId = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const files = { 'candidate.git.bundle': readFileSync(join(directory, 'candidate.git.bundle')), 'candidate.patch': readFileSync(join(directory, 'candidate.patch')), 'manifest.json': readFileSync(join(directory, 'manifest.json')) };
const manifest = JSON.parse(files['manifest.json'].toString());
const problems = [];
for (const download of ['bundle', 'patch']) {
  const name = manifest.downloads[download].filename;
  if (sha256(files[name]) !== manifest.downloads[download].sha256) problems.push(`${name} does not match the manifest digest`);
}
const results = [];
for (const name of ['candidate.attestation.json', 'candidate.trace.json']) {
  const envelope = JSON.parse(readFileSync(join(directory, name)).toString());
  const payload = Buffer.from(envelope.payload, 'base64');
  const pae = Buffer.concat([Buffer.from(`DSSEv1 ${Buffer.byteLength(envelope.payloadType)} ${envelope.payloadType} ${payload.length} `), payload]);
  const signature = envelope.signatures.find(item => !item.keyid || item.keyid === keyId);
  const valid = Boolean(signature) && envelope.payloadType === 'application/vnd.in-toto+json' && verify(null, pae, publicKey, Buffer.from(signature.sig, 'base64'));
  const statement = JSON.parse(payload.toString());
  const subjects = statement.subject ?? [];
  const mismatched = subjects.filter(subject => subject.digest?.sha256 && files[subject.name] && sha256(files[subject.name]) !== subject.digest.sha256).map(subject => subject.name);
  const commit = subjects.find(subject => subject.digest?.gitCommit)?.digest.gitCommit;
  if (!valid) problems.push(`${name}: signature invalid for key ${keyId}`);
  if (mismatched.length) problems.push(`${name}: subjects ${mismatched.join(', ')} do not match the files on disk`);
  if (commit && commit !== manifest.headSha) problems.push(`${name}: gitCommit ${commit} differs from manifest head ${manifest.headSha}`);
  results.push({ file: name, predicateType: statement.predicateType, signatureValid: valid, keyid: signature?.keyid, subjects: subjects.map(subject => subject.name) });
}
console.log(JSON.stringify({ keyId, headSha: manifest.headSha, baseSha: manifest.baseSha, files: manifest.fileCount, results, problems }, null, 2));
process.exit(problems.length ? 1 : 0);
