import { createServer, type IncomingMessage, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { ploegDemo } from '../../src/ploeg-demo.ts';

/** What reached the stand-in Ploeg: every admitted Ask is a spend from a Team's Ask Allowance. */
export type PloegLedger = {
  calls: { method: string; path: string; actor?: string }[];
  admitted: { workItem: string; actor?: string; askId: string; question: string }[];
  prompts: { auth?: string; model?: string }[];
};

const allowance = { purpose: 'ask', scopeKind: 'team', scopeId: 'delivery', periodStart: '2026-10-01T00:00:00Z', resetAt: '2026-11-01T00:00:00Z', limitUsd: 2, settledUsd: 0.01, heldUsd: 0.02, remainingUsd: 1.97, askCount: 2, askBudgetUsd: 0.02, asksEnabled: true };

async function body(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  return `http://127.0.0.1:${address.port}`;
}

/**
 * Ploeg's operator API over the deterministic demo Work Items, plus an inference gateway, both in this process.
 * Nothing calls a model: the gateway answers every completion itself, and the ledger counts what would be spent.
 */
export async function startFakePloeg() {
  const bearer = randomBytes(24).toString('hex');
  const ledger: PloegLedger = { calls: [], admitted: [], prompts: [] };
  const ploeg = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://ploeg.invalid');
    const data = await body(req).catch(() => undefined);
    const actor = req.headers['x-ploeg-actor'] as string | undefined;
    ledger.calls.push({ method: req.method!, path: url.pathname, ...(actor ? { actor } : {}) });
    if (req.headers.authorization !== `Bearer ${bearer}`) { res.writeHead(401).end(); return; }
    const send = (status: number, payload: object) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...payload }));
    const ask = (askId: string, workItemId: string) => ({ askId, runId: '900', workItemId, team: 'delivery', actor: actor ?? 'unknown', askedBy: actor ?? 'unknown', state: 'finished', budgetUsd: 0.02, questionSha256: 'a'.repeat(64), createdAt: '2026-10-10T10:00:00Z', expiresAt: '2026-10-10T10:02:00Z', finishedAt: null, spend: { costStatus: 'settled', usd: 0.0012, keyState: 'reconciled' } });
    if (url.pathname.endsWith('/teams')) return send(200, { teams: ploegDemo.teams });
    if (url.pathname.endsWith('/allowances')) return send(200, { allowance });
    if (url.pathname.endsWith('/work-items')) {
      const descending = url.searchParams.get('order') === 'desc';
      const wanted = url.searchParams.get('state')?.split(',');
      const items = Object.values(ploegDemo.details).map(detail => detail.item).filter(item => item.team === url.searchParams.get('team') && (!wanted || wanted.includes(item.state)) && (descending ? !url.searchParams.has('before') || BigInt(item.id) < BigInt(url.searchParams.get('before')!) : BigInt(item.id) > BigInt(url.searchParams.get('after') || '0'))).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1) * (descending ? -1 : 1));
      const limit = Number(url.searchParams.get('limit') || 25);
      return send(200, { items: items.slice(0, limit), nextCursor: items.length > limit ? items[limit - 1].id : null });
    }
    const admit = /\/work-items\/(\d+)\/asks$/.exec(url.pathname);
    if (admit && req.method === 'POST') {
      ledger.admitted.push({ workItem: admit[1], ...(actor ? { actor } : {}), askId: data?.askId, question: data?.question });
      return send(201, { created: true, ask: { ...ask(data.askId, admit[1]), state: 'open' }, credential: { key: 'sk-ask-capped-e2e', alias: 'ask-e2e', models: ['glm-5.3-flash'], budgetUsd: 0.02, expiresAt: '2026-10-10T10:02:00Z' }, allowance });
    }
    const oneAsk = /\/work-items\/(\d+)\/asks\/([^/]+)(\/finish)?$/.exec(url.pathname);
    if (oneAsk) return send(200, { ask: ask(decodeURIComponent(oneAsk[2]), oneAsk[1]), ...(oneAsk[3] ? { blocked: true } : {}) });
    const detail = ploegDemo.details[url.pathname.split('/').at(-1)!];
    if (detail && /\/work-items\/\d+$/.test(url.pathname)) return send(200, detail);
    res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 'not_found', message: 'The stand-in Ploeg does not serve this.' } }));
  });
  const gateway = createServer(async (req, res) => {
    const data = await body(req).catch(() => undefined);
    ledger.prompts.push({ ...(req.headers.authorization ? { auth: req.headers.authorization } : {}), ...(data?.model ? { model: data.model } : {}) });
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: 'It is done and merged.' } }] }));
  });
  const [ploegUrl, gatewayUrl] = await Promise.all([listen(ploeg), listen(gateway)]);
  const close = (server: Server) => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); });
  return { ploegUrl, gatewayUrl, bearer, ledger, teams: ploegDemo.teams.map(team => team.id), itemsOf: (team: string) => Object.values(ploegDemo.details).filter(detail => detail.item.team === team).map(detail => detail.item.id), close: () => Promise.all([close(ploeg), close(gateway)]) };
}
