import { strict as assert } from 'node:assert';
import { beforeEach, describe, test } from 'node:test';

import { PRIVACY_VERSION } from '../config/site.ts';
import { route, type Env } from './app.ts';
import worker from './index.ts';
import {
  CREATE_TABLE,
  DELETE_EXPIRED,
  HONEYPOT_FIELD,
  INTERESTS,
  UPSERT,
  resetTableCache,
  retentionCutoff,
  type D1Like,
  type D1Statement,
} from './signup.ts';

interface Call {
  sql: string;
  values: unknown[];
}

function fakeDb(options: { fail?: boolean } = {}): D1Like & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    prepare(sql: string): D1Statement {
      const call: Call = { sql, values: [] };
      const statement: D1Statement = {
        bind(...values: unknown[]) {
          call.values = values;
          return statement;
        },
        run() {
          calls.push(call);
          return options.fail ? Promise.reject(new Error('D1 down')) : Promise.resolve({});
        },
      };
      return statement;
    },
  };
}

function env(db: D1Like): Env {
  return {
    SIGNUPS: db,
    ASSETS: { fetch: () => Promise.resolve(new Response('not found', { status: 404 })) },
  };
}

const ORIGIN = 'https://unfold-site.example.workers.dev';

function post(
  fields: Record<string, string>,
  headers: Record<string, string> = {},
  path = '/api/signup',
): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(fields).toString(),
  });
}

const valid = {
  email: '  Person@Example.NL ',
  interest: 'agency',
  consent: 'yes',
  locale: 'nl',
  [HONEYPOT_FIELD]: '',
};

beforeEach(() => resetTableCache());

describe('sign-up without JavaScript', () => {
  test('stores the sign-up by lowercase email and redirects to the thanks page of its locale', async () => {
    const db = fakeDb();
    const response = await route(post(valid), env(db));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `${ORIGIN}/nl/thanks`);
    assert.deepEqual(
      db.calls.map((call) => call.sql),
      [CREATE_TABLE, UPSERT],
    );
    const [email, interest, locale, version, at] = db.calls[1]?.values ?? [];
    assert.equal(email, 'person@example.nl');
    assert.equal(interest, 'agency');
    assert.equal(locale, 'nl');
    assert.equal(version, PRIVACY_VERSION);
    assert.match(String(at), /^\d{4}-\d\d-\d\dT/);
  });

  test('an invalid form redirects to the problem page of its locale and stores nothing', async () => {
    for (const fields of [
      { ...valid, email: 'not-an-email' },
      { ...valid, interest: 'everything' },
      { ...valid, consent: '' },
    ]) {
      const db = fakeDb();
      const response = await route(post(fields), env(db));
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), `${ORIGIN}/nl/signup-problem`);
      assert.equal(db.calls.length, 0);
    }
  });

  test('an unknown locale falls back to English', async () => {
    const response = await route(post({ ...valid, locale: 'de' }), env(fakeDb()));
    assert.equal(response.headers.get('location'), `${ORIGIN}/thanks`);
  });
});

describe('sign-up with fetch', () => {
  const json = { accept: 'application/json' };

  test('answers JSON', async () => {
    const response = await route(post(valid, json), env(fakeDb()));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });

  test('names the field that is wrong', async () => {
    const cases: [Record<string, string>, string][] = [
      [{ ...valid, email: 'a@b' }, 'invalid_email'],
      [{ ...valid, interest: '' }, 'invalid_interest'],
      [{ ...valid, consent: 'no' }, 'consent_required'],
    ];
    for (const [fields, error] of cases) {
      const response = await route(post(fields, json), env(fakeDb()));
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { ok: false, error });
    }
  });

  test('a database failure is a 503 and the table is created again on the next request', async () => {
    const failing = await route(post(valid, json), env(fakeDb({ fail: true })));
    assert.equal(failing.status, 503);
    assert.deepEqual(await failing.json(), { ok: false, error: 'unavailable' });
    const db = fakeDb();
    await route(post(valid, json), env(db));
    assert.equal(db.calls[0]?.sql, CREATE_TABLE);
  });

  test('creates the table once per isolate', async () => {
    const db = fakeDb();
    await route(post(valid, json), env(db));
    await route(post(valid, json), env(db));
    assert.deepEqual(
      db.calls.map((call) => call.sql),
      [CREATE_TABLE, UPSERT, UPSERT],
    );
  });
});

describe('abuse', () => {
  test('a filled honeypot looks like success and stores nothing', async () => {
    const db = fakeDb();
    const response = await route(
      post({ ...valid, [HONEYPOT_FIELD]: 'https://spam.example' }),
      env(db),
    );
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `${ORIGIN}/nl/thanks`);
    assert.equal(db.calls.length, 0);
  });

  test('refuses another origin, other methods, other content types and large bodies', async () => {
    const db = fakeDb();
    assert.equal(
      (await route(post(valid, { origin: 'https://evil.example' }), env(db))).status,
      403,
    );
    const get = await route(new Request(`${ORIGIN}/api/signup`), env(db));
    assert.equal(get.status, 405);
    assert.equal(get.headers.get('allow'), 'POST');
    assert.equal(
      (await route(post(valid, { 'content-type': 'application/json' }), env(db))).status,
      415,
    );
    assert.equal((await route(post(valid, { 'content-length': '9000' }), env(db))).status, 413);
    assert.equal(db.calls.length, 0);
  });

  test('a same-origin request is accepted', async () => {
    const response = await route(post(valid, { origin: ORIGIN }), env(fakeDb()));
    assert.equal(response.status, 303);
  });

  test('stores no address, user agent or other request metadata', async () => {
    const db = fakeDb();
    await route(
      post(valid, { 'cf-connecting-ip': '192.0.2.1', 'user-agent': 'Example/1.0' }),
      env(db),
    );
    const stored = JSON.stringify(db.calls.map((call) => call.values));
    assert.doesNotMatch(stored, /192\.0\.2\.1|Example\/1\.0/);
    assert.doesNotMatch(CREATE_TABLE, /\bip\b|agent/i);
  });
});

describe('routing and retention', () => {
  test('the entry module exports only the default handler, as workerd requires', async () => {
    assert.deepEqual(Object.keys(await import('./index.ts')), ['default']);
  });

  test('any other /api path is answered by the assets, which serve the 404 page', async () => {
    const response = await route(post(valid, {}, '/api/other'), env(fakeDb()));
    assert.equal(response.status, 404);
  });

  test('the interests are the four the form offers', () => {
    assert.deepEqual([...INTERESTS], ['hosted', 'agency', 'both', 'self-host-support']);
  });

  test('the scheduled job deletes sign-ups older than the retention period', async () => {
    const db = fakeDb();
    const pending: Promise<unknown>[] = [];
    worker.scheduled(undefined, env(db), { waitUntil: (promise) => pending.push(promise) });
    await Promise.all(pending);
    assert.equal(db.calls.at(-1)?.sql, DELETE_EXPIRED);
    assert.equal(
      retentionCutoff(new Date('2026-10-02T00:00:00Z')).toISOString(),
      '2024-10-02T00:00:00.000Z',
    );
  });
});
