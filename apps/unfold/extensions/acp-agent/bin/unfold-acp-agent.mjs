#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { UnfoldAgent } from '../lib/agent.mjs';
import { credentialFile, signIn, storeCredential, storedCredential } from '../lib/credentials.mjs';
import { Connection } from '../lib/jsonrpc.mjs';
import { validUrl } from '../lib/unfold.mjs';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const usage = `Usage: unfold-acp-agent [--url <unfold>] [login | logout]

Without a command it speaks the Agent Client Protocol on stdin and stdout, for an editor that starts it as an agent.
login signs in to Unfold with its editor sign-in and keeps the credential in ${credentialFile()}.
logout forgets that credential. UNFOLD_URL names the Unfold when --url does not; UNFOLD_TOKEN overrides the kept credential.
`;

const args = process.argv.slice(2);
let url = (process.env.UNFOLD_URL ?? '').trim();
const at = args.indexOf('--url');
if (at >= 0) { url = String(args[at + 1] ?? '').trim(); args.splice(at, 2); }
const command = args[0] ?? '';

if (['-h', '--help', 'help'].includes(command)) { process.stdout.write(usage); process.exit(0); }
if (!['', 'login', 'logout'].includes(command) || args.length > 1) { process.stderr.write(usage); process.exit(2); }
if (!validUrl(url)) { process.stderr.write('unfold-acp-agent: set UNFOLD_URL or --url to your Unfold, for example https://unfold.example.org\n'); process.exit(2); }

if (command === 'login') {
  try {
    const credential = await signIn({ url, say: line => process.stderr.write(`${line}\n`) });
    await storeCredential(url, credential);
    process.stderr.write(`Signed in as ${credential.user || 'you'} until ${credential.expiresAt}. Your editor can start unfold-acp-agent now.\n`);
    process.exit(0);
  } catch (error) {
    process.stderr.write(`unfold-acp-agent: ${error.message}\n`);
    process.exit(1);
  }
}

if (command === 'logout') {
  await storeCredential(url, null);
  process.stderr.write('Forgot the editor credential on this machine. Sign it out in Unfold too, under Settings › Signed-in editors.\n');
  process.exit(0);
}

const credential = async () => (process.env.UNFOLD_TOKEN ?? '').trim() || (await storedCredential(url))?.token || '';
const agent = new UnfoldAgent({ url, credential, version, workItem: (process.env.UNFOLD_WORK_ITEM ?? '').trim(), pollMs: Number(process.env.UNFOLD_ACP_POLL_MS) || 1000 });
const connection = new Connection(process.stdin, process.stdout, (method, params) => agent.handle(method, params));
agent.attach(connection);
process.stdout.on('error', () => process.exit(0));
await connection.closed;
process.exit(0);
