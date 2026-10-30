import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { parse } from 'yaml';
import { intakeVerifier, standardWebhookSignature } from '../src/intake/signatures.ts';
import { decodeWords, htmlToText, mailbox, messageIds, parseInboundJson, parseMime, withoutQuote } from '../src/intake/mail.ts';
import { sign as outboundSign, verify as outboundVerify, newSecret } from '../src/outbound/signing.ts';
import { verifySlackSignature } from '../src/notify/slack.ts';
import { parseFilter } from '../src/identity/scim.ts';
import { escapeMathDelimiters, htmlToMarkdown } from '../src/markdown.ts';
import { parseTranscriptPage, transcriptLimits } from '../src/run-transcript.ts';
import { openApiDocument } from '../src/http.ts';
import { defaultRateLimits, rateLimitSettings } from '../src/rate-limits.ts';
import { markdown } from '../public/core/markdown.js';
import { assertInert } from './markdown-inert.mjs';
import { application, createSession } from './api-support.ts';
import { testTimeout } from './timeframes.ts';

const runs = Math.max(1, Number(process.env.UNFOLD_FUZZ_RUNS) || 200);
fc.configureGlobal({ numRuns: runs, ...(process.env.UNFOLD_FUZZ_SEED ? { seed: Number(process.env.UNFOLD_FUZZ_SEED) } : {}) });

const now = 1_800_000_000_000;
const window = 300;
const headerText = fc.string({ unit: fc.integer({ min: 0x20, max: 0x7e }).map(code => String.fromCharCode(code)), maxLength: 120 });
const bytes = fc.uint8Array({ maxLength: 512 }).map(array => Buffer.from(array));
const markup = fc.constantFrom('<', '>', '</', '<a href="https://x.example/">', '<a href=\'javascript:alert(1)\'>', '</a>', '<script>', '</script>', '<style>', '<!--', '-->', '<br>', '<li>', '<p>', '</p>', '<b>', '</b>', '<img src=x onerror=alert(1)>', '&lt;', '&amp;', '&#x3c;', '"', "'", '=', ' ', '\n', '\r\n', '`', '```', '**', '_', '[', ']', '(', ')', 'javascript:', 'https://x.example/', '|', '-', '#', '> ', '$', '@', 'a', 'é', '\u202e');
const soup = fc.oneof(fc.string({ maxLength: 200 }), fc.array(markup, { maxLength: 80 }).map(parts => parts.join('')), fc.array(fc.oneof(markup, fc.string({ maxLength: 8 })), { maxLength: 60 }).map(parts => parts.join('')));

test('every intake verifier answers arbitrary headers and bodies with a verdict and never accepts a forged one', () => {
  const headers = fc.dictionary(fc.constantFrom('webhook-id', 'webhook-timestamp', 'webhook-signature', 'x-hub-signature-256', 'x-zendesk-webhook-signature', 'x-zendesk-webhook-signature-timestamp', 'authorization', 'x-unfold-intake-token', 'x-other'), fc.oneof(headerText, fc.constant(String(now / 1000)), fc.constant(new Date(now).toISOString())));
  const secrets: Record<string, fc.Arbitrary<string>> = {
    'standard-webhooks': fc.constant(`whsec_${randomBytes(32).toString('base64')}`),
    'hub-signature-256': fc.string({ minLength: 16, maxLength: 64 }),
    zendesk: fc.string({ minLength: 16, maxLength: 64 }),
    token: fc.constant(randomBytes(32).toString('base64url')),
  };
  for (const [name, secret] of Object.entries(secrets)) {
    const verifier = intakeVerifier(name)!;
    fc.assert(fc.property(headers, bytes, secret, fc.string({ maxLength: 40 }), (given, body, key, query) => {
      const verdict = verifier.verify({ headers: given, query: new URLSearchParams(query), body, secret: key, nowMs: now, windowSeconds: window });
      assert.equal(verdict.ok, false, `${name} accepted ${JSON.stringify(given)}`);
      assert(['signature_missing', 'signature_invalid', 'timestamp_outside_window'].includes((verdict as { code: string }).code));
    }));
  }
});

test('a signed delivery verifies, and changing its body, signature, secret or timestamp does not', () => {
  const standard = intakeVerifier('standard-webhooks')!;
  fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 200 }).filter(id => !/[\r\n]/.test(id)), bytes, fc.integer({ min: -window, max: window }), fc.nat(511), (id, body, skew, flip) => {
    const secret = newSecret();
    const stamp = now / 1000 + skew;
    const signature = standardWebhookSignature(secret, id, stamp, body);
    assert.equal(signature, outboundSign(secret, id, stamp, body), 'intake and outbound sign the same content');
    const verify = (headers: Record<string, string>, payload = body, key = secret) => standard.verify({ headers: { 'webhook-id': id, 'webhook-timestamp': String(stamp), 'webhook-signature': signature, ...headers }, query: new URLSearchParams(), body: payload, secret: key, nowMs: now, windowSeconds: window });
    assert.deepEqual(verify({}), { ok: true, deliveryId: id });
    assert.equal(outboundVerify(secret, { 'webhook-id': id, 'webhook-timestamp': String(stamp), 'webhook-signature': `v1,bad ${signature}` }, body, { now }), undefined, 'one matching signature among several verifies');
    if (body.length) { const changed = Buffer.from(body); changed[flip % body.length] ^= 1; assert.equal(verify({}, changed).ok, false); }
    else assert.equal(verify({}, Buffer.from('x')).ok, false);
    const mac = Buffer.from(signature.slice(3), 'base64');
    mac[flip % mac.length] ^= 1;
    assert.equal(verify({ 'webhook-signature': `v1,${mac.toString('base64')}` }).ok, false);
    assert.equal(verify({}, body, newSecret()).ok, false);
    assert.equal(verify({ 'webhook-timestamp': String(stamp + 2 * window) }).ok, false);
  }));
  const hub = intakeVerifier('hub-signature-256')!;
  const zendesk = intakeVerifier('zendesk')!;
  fc.assert(fc.property(bytes, fc.string({ minLength: 16, maxLength: 64 }), fc.nat(31), (body, secret, flip) => {
    const digest = createHmac('sha256', secret).update(body).digest();
    const check = (value: Buffer, payload = body) => hub.verify({ headers: { 'x-hub-signature-256': `sha256=${value.toString('hex')}` }, query: new URLSearchParams(), body: payload, secret, nowMs: now, windowSeconds: window }).ok;
    assert.equal(check(digest), true);
    const changed = Buffer.from(digest); changed[flip] ^= 1;
    assert.equal(check(changed), false);
    assert.equal(check(digest, Buffer.concat([body, Buffer.from('x')])), false);
    const stamp = new Date(now).toISOString();
    const zendeskMac = createHmac('sha256', secret).update(stamp).update(body).digest('base64');
    const zendeskCheck = (signature: string, at = stamp) => zendesk.verify({ headers: { 'x-zendesk-webhook-signature': signature, 'x-zendesk-webhook-signature-timestamp': at }, query: new URLSearchParams(), body, secret, nowMs: now, windowSeconds: window }).ok;
    assert.equal(zendeskCheck(zendeskMac), true);
    assert.equal(zendeskCheck(zendeskMac, new Date(now + 1000).toISOString()), false);
    const slackStamp = String(now / 1000);
    const slack = `v0=${createHmac('sha256', secret).update(`v0:${slackStamp}:`).update(body).digest('hex')}`;
    assert.equal(verifySlackSignature(secret, { 'x-slack-request-timestamp': slackStamp, 'x-slack-signature': slack }, body, now), 'ok');
    assert.equal(verifySlackSignature(secret, { 'x-slack-request-timestamp': slackStamp, 'x-slack-signature': slack.slice(0, -1) + (slack.endsWith('0') ? '1' : '0') }, body, now), 'invalid');
  }));
  fc.assert(fc.property(fc.dictionary(fc.constantFrom('x-slack-request-timestamp', 'x-slack-signature'), headerText), bytes, (headers, body) => {
    assert.notEqual(verifySlackSignature('slack-signing-secret', headers, body, now), 'ok');
  }));
});

test('inbound mail of any shape parses to bounded, plain values', () => {
  const header = fc.constantFrom('From', 'Subject', 'Message-ID', 'In-Reply-To', 'References', 'Content-Type', 'Content-Transfer-Encoding', 'Content-Disposition', 'X-Other');
  const value = fc.oneof(soup, fc.constantFrom('multipart/mixed; boundary=b', 'multipart/alternative; boundary="b"', 'text/html; charset=windows-1252', 'text/plain; charset=bogus', 'base64', 'quoted-printable', 'attachment; filename*=utf-8\'\'%E2%82%AC%zz.pdf', '=?utf-8?B?SGFsbG8=?= =?utf-8?Q?w=C3=A9reld?=', '=?x-unknown?Q?a?=', '"Jane" <Jane@Example.com>', '<a@b> <c@d>'));
  const raw = fc.tuple(fc.array(fc.tuple(header, value), { maxLength: 8 }), fc.array(fc.oneof(soup, fc.constantFrom('--b', '--b--', '\r\n\r\n', 'Content-Type: text/plain\r\n\r\n')), { maxLength: 12 }))
    .map(([headers, body]) => `${headers.map(([name, text]) => `${name}: ${text}`).join('\r\n')}\r\n\r\n${body.join('\r\n')}`);
  const check = (mail: ReturnType<typeof parseMime>) => {
    assert.doesNotMatch(mail.subject, /[\r\n]/);
    assert(mail.attachments.length <= 20);
    for (const name of mail.attachments) { assert(name.length <= 200); assert.doesNotMatch(name, /[\u0000-\u001f\u007f/\\]/); }
    if (mail.from) { assert.match(mail.from.email, /.@./); assert.equal(mail.from.email, mail.from.email.toLowerCase()); }
    assert.equal(new Set(mail.replyTo).size, mail.replyTo.length);
  };
  fc.assert(fc.property(fc.oneof(raw, fc.string({ maxLength: 400 })), text => check(parseMime(text))));
  fc.assert(fc.property(fc.dictionary(fc.constantFrom('raw', 'From', 'FromFull', 'Subject', 'TextBody', 'HtmlBody', 'Headers', 'Attachments', 'from', 'subject', 'text', 'html', 'messageId', 'inReplyTo', 'references', 'headers', 'attachments'), fc.jsonValue({ maxDepth: 3 })), payload => {
    let mail;
    try { mail = parseInboundJson(payload as Record<string, unknown>); }
    catch (error) { assert(!(error instanceof RangeError), `parseInboundJson threw ${error}`); throw error; }
    if (mail?.from && typeof (payload as { FromFull?: { Email?: unknown } }).FromFull?.Email !== 'string' && typeof (payload as { from?: { email?: unknown } }).from?.email !== 'string') assert.match(mail.from.email, /.@./);
  }));
  fc.assert(fc.property(soup, html => {
    const text = htmlToText(html);
    if (!html.includes('&')) assert.doesNotMatch(text, /[<>]/, 'without entities, no angle bracket survives');
    assert.doesNotMatch(text, /\n{3}/);
    withoutQuote(text); decodeWords(html); messageIds(html);
    const box = mailbox(html);
    if (box) assert.match(box.email, /^[^\s<>]+$/);
  }));
});

test('a SCIM filter reads back the attribute and value it was written with, and nothing else', () => {
  const fields = { username: 'userName', externalid: 'externalId', id: 'id', emails: 'email', 'emails.value': 'email' };
  const scimError = (error: unknown) => (error as { status?: number; scimType?: string }).status === 400 && (error as { scimType?: string }).scimType === 'invalidFilter';
  const escape = (value: string) => value.replace(/["\\]/g, '\\$&');
  fc.assert(fc.property(fc.constantFrom(...Object.keys(fields)), fc.string({ maxLength: 120 }), fc.constantFrom('', ' ', '  '), (attribute, value, space) => {
    const name = [...attribute].map((character, index) => index % 2 ? character.toUpperCase() : character).join('');
    assert.deepEqual(parseFilter(`${space}${name} eq "${escape(value)}"${space}`, fields), { field: fields[attribute as keyof typeof fields], value });
  }));
  fc.assert(fc.property(fc.oneof(fc.constantFrom('constructor', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf', 'title', 'meta.created'), fc.stringMatching(/^[A-Za-z][\w.$:-]{0,20}$/)).filter(name => !Object.hasOwn(fields, name.toLowerCase())), fc.string({ maxLength: 20 }), (attribute, value) => {
    assert.throws(() => parseFilter(`${attribute} eq "${escape(value)}"`, fields), scimError);
  }));
  fc.assert(fc.property(fc.string({ maxLength: 200 }), raw => {
    try {
      const filter = parseFilter(raw, fields);
      if (filter) assert(Object.values(fields).includes(filter.field));
      else assert.equal(raw.trim(), '');
    } catch (error) { assert(scimError(error), String(error)); }
  }));
});

test('agent transcripts and tracker HTML render to inert, bounded Markdown', () => {
  fc.assert(fc.property(soup, text => {
    assertInert(markdown(text), JSON.stringify(text).slice(0, 80));
    for (const dialect of ['commonmark', 'unfold'] as const) {
      const converted = htmlToMarkdown(text, 'https://tracker.example/', dialect);
      assert(converted.length <= 65536);
      for (const [, target] of converted.matchAll(/\]\(([^)\s]*)\)/g)) assert.match(target, /^(?:https?:|mailto:)/, `${dialect}: ${target}`);
      if (dialect === 'unfold') assertInert(markdown(converted), `unfold dialect of ${JSON.stringify(text).slice(0, 80)}`);
    }
    const escaped = escapeMathDelimiters(text);
    assert.equal(escaped.replace(/\\\$/g, '$'), text.replace(/\\\$/g, '$'));
  }));
  const entry = fc.record({ seq: fc.oneof(fc.nat(2000), fc.constant(-1), fc.constant('7')), at: fc.oneof(fc.constant('2026-10-30T10:00:00Z'), fc.string({ maxLength: 30 })), kind: fc.constantFrom('message', 'thought', 'tool_call', 'tool_output', 'plan', 'stage', 'truncated', 'bogus'), text: fc.oneof(soup, fc.string({ maxLength: 6000 })), title: fc.string({ maxLength: 300 }), toolKind: fc.constantFrom('read', 'edit', 'execute', 'nope'), status: fc.constantFrom('pending', 'completed', 'failed', 'nope'), paths: fc.array(fc.string({ maxLength: 300 }), { maxLength: 20 }) }, { requiredKeys: ['seq', 'kind'] });
  fc.assert(fc.property(fc.array(entry, { maxLength: 30 }), fc.nat(50), (entries, after) => {
    let page;
    try { page = parseTranscriptPage({ schemaVersion: '1.0', runId: 'run-1', entries, nextAfter: 0, hasMore: false, truncated: false, complete: true }, 'run-1', after); }
    catch (error) { assert.equal((error as Error).name === 'TranscriptError' || (error as Error).constructor.name === 'TranscriptError', true, String(error)); return; }
    let last = after;
    for (const item of page.entries) {
      assert(item.seq > last); last = item.seq;
      assert((item.text ?? '').length <= transcriptLimits.text);
      assert((item.paths ?? []).length <= transcriptLimits.paths);
      if (item.text) assertInert(markdown(item.text), `transcript ${item.kind}`);
    }
  }));
});

type Operation = { parameters?: { $ref?: string; in?: string; name?: string }[]; 'x-unfold-requires'?: string[]; requestBody?: unknown };
const spec = parse(readFileSync(openApiDocument, 'utf8')) as { paths: Record<string, Record<string, Operation>> };

test('no route in the OpenAPI description answers 500 to arbitrary path parameters, queries and JSON bodies', { timeout: testTimeout(120_000) }, async t => {
  const server = await application('demo', config => { config.rateLimits = rateLimitSettings(Object.fromEntries(Object.keys(defaultRateLimits).map(name => [name, { perMinute: 100_000, burst: 100_000 }]))); });
  t.after(() => server.close());
  const session = await createSession(server.url);
  const operations = Object.entries(spec.paths).flatMap(([path, item]) => ['get', 'post', 'put', 'patch', 'delete'].filter(method => item[method] && !item[method]['x-unfold-requires']?.includes('connected-ploeg') && !path.startsWith('/api/relay/') && !path.endsWith('/events') && path !== '/api/linked-sessions/events' && !/\/conversation\/wants$/.test(path)).map(method => ({ path, method })));
  assert(operations.length > 150, `only ${operations.length} operations`);
  const segment = fc.oneof(fc.constant(session.id), fc.constant('42'), fc.constant('0123456789abcdef0123456789abcdef'), fc.string({ minLength: 1, maxLength: 40 }), fc.constantFrom('%00', '..', '%2e%2e', '__proto__', 'constructor', '-1', '1e400', '%E2%80%AE', '%ff'));
  const body = fc.oneof(fc.jsonValue({ maxDepth: 3 }), fc.dictionary(fc.constantFrom('text', 'question', 'name', 'id', 'url', 'choice', 'amountUsd', 'decision', 'reason', 'tenant', 'events', 'rollout', 'key', 'until', 'cards', 'repository', 'objective', 'title', 'runtime', 'budgetUsd', 'scope', 'types', 'secret'), fc.jsonValue({ maxDepth: 2 })));
  const failures: string[] = [];
  await fc.assert(fc.asyncProperty(fc.constantFrom(...operations), fc.array(segment, { minLength: 4, maxLength: 4 }), body, fc.dictionary(fc.constantFrom('team', 'state', 'window', 'cursor', 'before', 'after', 'format', 'q', 'route', 'key', 'id', 'provider'), fc.string({ maxLength: 20 })), async ({ path, method }, segments, data, query) => {
    let index = 0;
    const filled = path.replace(/\{[^}]+\}/g, () => { const value = segments[index++ % segments.length]; return /^%|^__|^constructor$/.test(value) ? value : encodeURIComponent(value); });
    const search = new URLSearchParams(query).toString();
    const response = await fetch(`${server.url}${filled}${search ? `?${search}` : ''}`, { method: method.toUpperCase(), redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { 'x-unfold-request': '1', ...(method === 'get' ? {} : { 'content-type': 'application/json' }) }, ...(method === 'get' ? {} : { body: JSON.stringify(data) }) });
    if (response.headers.get('content-type')?.startsWith('text/event-stream')) { await response.body?.cancel(); return; }
    const text = await response.text();
    if (response.status >= 500 && response.status !== 503) failures.push(`${method.toUpperCase()} ${filled}${search ? `?${search}` : ''} ${JSON.stringify(data).slice(0, 200)} -> ${response.status} ${text.slice(0, 200)}`);
  }), { numRuns: runs * 2 });
  assert.deepEqual(failures, []);
});
