import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { createMcpServer, serveStdio } from '../src/mcp.ts';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version as string;
const url = process.env.UNFOLD_URL?.trim() ?? '';
const token = process.env.UNFOLD_TOKEN?.trim() || undefined;

if (!/^https?:\/\/[^\s/?#@]+(?:\/[^\s?#]*)?$/.test(url)) {
  process.stderr.write('unfold-mcp: set UNFOLD_URL to your Unfold, for example https://unfold.example.org\n');
  process.exit(2);
}

if (process.argv[2] === 'login') await login();
else if (process.argv[2] === undefined) await serveStdio(createMcpServer({ url, token, version }), process.stdin, process.stdout);
else {
  process.stderr.write('usage: unfold-mcp [login]\n');
  process.exit(2);
}

async function login() {
  const base = url.replace(/\/+$/, '');
  const headers = { 'content-type': 'application/json', 'x-unfold-request': '1' };
  const started = await fetch(`${base}/api/auth/editor`, { method: 'POST', headers, body: '{}' });
  if (!started.ok) {
    process.stderr.write(`unfold-mcp: Unfold answered ${started.status}. Signing in from a client needs single sign-on configured on this Unfold.\n`);
    process.exit(1);
  }
  const ticket = await started.json() as { code: string; secret: string; userCode: string; url: string; interval: number; expiresIn: number };
  process.stderr.write(`Open ${ticket.url}\nSign in, check that the page shows ${ticket.userCode}, and approve it.\n`);
  const deadline = Date.now() + ticket.expiresIn * 1000;
  while (Date.now() < deadline) {
    await delay(Math.max(ticket.interval, 1) * 1000);
    const polled = await fetch(`${base}/api/auth/editor/${encodeURIComponent(ticket.code)}`, { method: 'POST', headers, body: JSON.stringify({ secret: ticket.secret }) });
    if (polled.status === 202 || polled.status === 429) continue;
    const answer = await polled.json().catch(() => ({})) as { status?: string; token?: string; expiresAt?: string; user?: { name: string }; error?: { message: string } };
    if (polled.status === 200 && answer.token) {
      process.stderr.write(`Signed in as ${answer.user?.name ?? 'you'} until ${answer.expiresAt}. Set UNFOLD_TOKEN to the line below.\n`);
      process.stdout.write(`${answer.token}\n`);
      return;
    }
    process.stderr.write(`unfold-mcp: ${answer.error?.message ?? `Unfold answered ${polled.status}.`}\n`);
    process.exit(1);
  }
  process.stderr.write('unfold-mcp: the sign-in expired before it was approved.\n');
  process.exit(1);
}
