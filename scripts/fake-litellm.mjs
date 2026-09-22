import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const hash = key => createHash('sha256').update(key).digest('hex');
const inference = /^\/(?:v1\/)?(?:chat\/completions|completions|embeddings|responses|messages|models)(?:\/|$)|^\/v1\//;

/**
 * Starts a local stand-in for the LiteLLM admin API that Ploeg's broker uses:
 * POST /key/generate, GET /key/list, GET /key/info, POST /key/block and POST /key/delete.
 * It never forwards anything to a model provider. Inference paths are refused and counted,
 * every key reports zero spend, and admin calls without the configured master key are refused.
 *
 * @param {{ masterKey?: string, host?: string }} [options]
 * @returns {Promise<{ url: string, masterKey: string, stats: object, keys: Map<string, object>, close(): Promise<void> }>}
 */
export async function startFakeLiteLLM({ masterKey = `sk-fake-master-${randomBytes(24).toString('hex')}`, host = '127.0.0.1' } = {}) {
  const keys = new Map();
  const stats = { generated: 0, blocked: 0, deleted: 0, info: 0, list: 0, modelCalls: 0, unauthorized: 0, unexpected: 0 };
  const resolve = value => (typeof value === 'string' ? keys.get(value) ?? keys.get(hash(value)) : undefined);
  const server = createServer(async (req, res) => {
    const send = (status, body) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    try {
      const url = new URL(req.url ?? '/', 'http://fake-litellm.invalid');
      const chunks = [];
      let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 65536) return send(413, { error: 'request too large' }); chunks.push(chunk); }
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
      if (inference.test(url.pathname)) {
        stats.modelCalls++;
        return send(403, { error: { message: 'Fake LiteLLM gateway: inference is not permitted in qualification', type: 'fake_gateway' } });
      }
      if (req.headers.authorization !== `Bearer ${masterKey}`) { stats.unauthorized++; return send(401, { error: 'master key required' }); }
      if (req.method === 'POST' && url.pathname === '/key/generate') {
        if (typeof body?.key_alias !== 'string' || !body.key_alias || !(body.max_budget > 0)) return send(400, { error: 'key_alias and a positive max_budget are required' });
        const key = `sk-fake-${randomBytes(24).toString('hex')}`;
        const token = hash(key);
        keys.set(token, { token, key_alias: body.key_alias, max_budget: body.max_budget, models: Array.isArray(body.models) ? body.models : [], duration: body.duration ?? null, key_type: body.key_type ?? null, spend: 0, blocked: false, deleted: false });
        stats.generated++;
        return send(200, { key, key_alias: body.key_alias, token, max_budget: body.max_budget });
      }
      if (req.method === 'GET' && url.pathname === '/key/list') {
        stats.list++;
        const size = Math.max(1, Math.min(100, Number(url.searchParams.get('size')) || 100));
        const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
        const live = [...keys.values()].filter(key => !key.deleted);
        const pages = Math.max(1, Math.ceil(live.length / size));
        const slice = live.slice((page - 1) * size, page * size).map(({ token, key_alias, blocked, spend, max_budget }) => ({ token, key_alias, blocked, spend, max_budget }));
        return send(200, { keys: slice, total_count: live.length, total_pages: pages, current_page: page });
      }
      if (req.method === 'GET' && url.pathname === '/key/info') {
        stats.info++;
        const key = resolve(url.searchParams.get('key'));
        if (!key || key.deleted) return send(404, { error: 'key not found' });
        return send(200, { key: key.token, info: { key_alias: key.key_alias, spend: key.spend, max_budget: key.max_budget, blocked: key.blocked, models: key.models } });
      }
      if (req.method === 'POST' && url.pathname === '/key/block') {
        const key = resolve(body?.key);
        if (!key || key.deleted) return send(404, { error: 'key not found' });
        key.blocked = true;
        stats.blocked++;
        return send(200, { token: key.token, key_alias: key.key_alias, blocked: true });
      }
      if (req.method === 'POST' && url.pathname === '/key/delete') {
        const deleted = [];
        for (const value of Array.isArray(body?.keys) ? body.keys : []) {
          const key = resolve(value);
          if (key && !key.deleted) { key.deleted = true; deleted.push(key.token); }
        }
        stats.deleted += deleted.length;
        return deleted.length ? send(200, { deleted_keys: deleted }) : send(404, { error: 'no keys found' });
      }
      stats.unexpected++;
      return send(404, { error: `fake gateway does not implement ${req.method} ${url.pathname}` });
    } catch {
      stats.unexpected++;
      return send(400, { error: 'invalid request' });
    }
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, host, () => { server.off('error', fail); done(); }); });
  const address = server.address();
  return {
    url: `http://${host}:${address.port}`,
    masterKey,
    stats,
    keys,
    close: () => new Promise(done => { server.closeAllConnections?.(); server.close(() => done()); }),
  };
}
