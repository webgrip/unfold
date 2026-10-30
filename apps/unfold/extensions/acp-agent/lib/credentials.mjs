import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/** Where the agent keeps the editor credential of each Unfold it signed in to: `$XDG_CONFIG_HOME/unfold/acp-agent.json`, readable by the user only. */
export function credentialFile(env = process.env) {
  return join(env.XDG_CONFIG_HOME || join(env.HOME || homedir(), '.config'), 'unfold', 'acp-agent.json');
}

const key = url => url.replace(/\/+$/, '');

/** The stored editor credential for `url`, or null when there is none or it has expired. */
export async function storedCredential(url, file = credentialFile(), now = Date.now()) {
  const all = await readFile(file, 'utf8').then(text => JSON.parse(text), () => ({}));
  const entry = all && typeof all === 'object' ? all[key(url)] : null;
  if (!entry || typeof entry.token !== 'string' || !/^vle_[A-Za-z0-9_-]{20,}$/.test(entry.token)) return null;
  if (typeof entry.expiresAt === 'string' && Date.parse(entry.expiresAt) <= now) return null;
  return { token: entry.token, expiresAt: String(entry.expiresAt ?? ''), user: String(entry.user ?? '') };
}

/** Stores, or with `token` null forgets, the editor credential for `url`. The file is written whole and is mode 0600. */
export async function storeCredential(url, entry, file = credentialFile()) {
  const all = await readFile(file, 'utf8').then(text => JSON.parse(text), () => ({}));
  const next = { ...(all && typeof all === 'object' ? all : {}) };
  if (entry) next[key(url)] = entry; else delete next[key(url)];
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, file);
}

/**
 * Signs in to Unfold with its editor sign-in (Unfold ADR 0037): starts a ticket as `unfold-acp-agent on <host>`, tells
 * the person which page to open and which code it must show, and polls until they approve or deny it. Resolves with
 * the editor credential; Unfold hands it out once.
 * @param {{ url: string, say: (line: string) => void, fetch?: typeof fetch, host?: string }} options
 */
export async function signIn({ url, say, fetch: fetcher = fetch, host = hostname().split('.')[0] }) {
  const base = key(url);
  const headers = { 'content-type': 'application/json', 'x-unfold-request': '1', 'x-unfold-client': 'unfold-acp-agent' };
  const started = await fetcher(`${base}/api/auth/editor`, { method: 'POST', headers, body: JSON.stringify({ client: 'acp', host }) });
  if (!started.ok) throw new Error(`Unfold answered ${started.status}. Signing in from an editor needs single sign-on configured on this Unfold.`);
  const ticket = await started.json();
  say(`Open ${ticket.url}`);
  say(`Sign in, check that the page shows ${ticket.userCode}, and approve it. Deny it if the code differs.`);
  const deadline = Date.now() + Number(ticket.expiresIn) * 1000;
  let interval = Math.max(Number(ticket.interval) || 2, 1);
  while (Date.now() < deadline) {
    await delay(interval * 1000);
    const polled = await fetcher(`${base}/api/auth/editor/${encodeURIComponent(ticket.code)}`, { method: 'POST', headers, body: JSON.stringify({ secret: ticket.secret }) });
    if (polled.status === 202) continue;
    if (polled.status === 429) { interval += 1; continue; }
    const answer = await polled.json().catch(() => ({}));
    if (polled.status === 200 && typeof answer.token === 'string') return { token: answer.token, expiresAt: String(answer.expiresAt ?? ''), user: String(answer.user?.name ?? '') };
    throw new Error(answer.error?.message ?? `Unfold answered ${polled.status}.`);
  }
  throw new Error('The sign-in expired before it was approved.');
}
