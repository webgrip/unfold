import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { applies, applyMapping, resolvePointer, validateMapping, MappingError } from '../src/intake/mapping.ts';
import { intakeTemplate, intakeTemplates } from '../src/intake/templates.ts';
import { intakeVerifier, standardWebhookSignature } from '../src/intake/signatures.ts';
import { htmlToText, mailbox, parseInboundJson, parseMime, withoutQuote } from '../src/intake/mail.ts';

const payloads = JSON.parse(readFileSync(new URL('./fixtures/intake/payloads.json', import.meta.url), 'utf8')) as Record<string, unknown>;

test('a JSON Pointer reads RFC 6901 paths, escapes included, and names nothing outside the document', () => {
  const document = { 'a/b': { 'm~n': [10, 20] }, list: [{ url: 'x' }] };
  assert.equal(resolvePointer(document, '/a~1b/m~0n/1'), 20);
  assert.equal(resolvePointer(document, '/list/0/url'), 'x');
  assert.equal(resolvePointer(document, '/list/01'), undefined);
  assert.equal(resolvePointer(document, '/constructor'), undefined);
  assert.equal(resolvePointer(document, '/__proto__'), undefined);
  assert.equal(resolvePointer(document, 'list'), undefined);
});

const expected: Record<string, unknown> = {
  'marker-io': { title: 'Sample issue', description: 'Sample description', reporter: { name: 'Sarah Johnson', email: 'sarah.johnson@example.com' }, externalId: '6864f4ee1a2b3c4d5e6f7081', links: ['https://app.marker.io/demo', 'https://marker.io/i/6864f4ee1a2b3c4d5e6f7081?advanced=1'], attachments: ['https://marker.io/screenshots/abc.png'], labels: ['Improvement', 'medium'] },
  bugherd: { title: 'Button not aligned on mobile', description: 'The submit button overlaps the footer.', reporter: { name: 'Jane Smith', email: 'reporter@example.com' }, externalId: '98765', links: ['https://www.example.com/checkout', 'https://www.example.com/', 'https://bugherd.com/tasks/secret/abc123'], attachments: ['https://bugherd.com/screenshots/abc.png', 'https://bugherd.com/attachments/log.txt'], labels: ['ui', 'mobile'] },
  userback: { title: 'Feedback Title', description: 'The pricing table is cut off.', reporter: { name: 'John Doe', email: 'user@example.com' }, externalId: '2007850', links: ['https://example.com/pricing', 'https://app.userback.io/viewer/12345/abcdef'], attachments: ['https://example.com/screenshot.png', 'https://example.com/attachment.zip', 'https://example.com/video.mp4'], labels: ['UI', 'Frontend', 'bug'] },
  freshdesk: { title: 'Invoice page shows the wrong VAT', description: 'The VAT line says 19% instead of 21%.', reporter: { name: 'Piet de Vries', email: 'piet@example.nl' }, externalId: '1042', links: ['https://acme.freshdesk.com/a/tickets/1042', 'https://acme.freshdesk.com/support/tickets/1042'], attachments: [], labels: ['billing', 'vat', 'Problem'] },
  zendesk: { title: 'Login link expired', description: 'The magic link says it expired right away.', reporter: { name: 'Anna Jansen', email: 'anna@example.nl' }, externalId: '5158', links: ['https://acme.zendesk.com/agent/tickets/5158'], attachments: [], labels: ['login', 'urgent'] },
  form: { title: 'The checkout button does nothing', description: 'Clicking Pay on /checkout shows no error.', reporter: { name: 'Jane Smith', email: 'jane@example.com' }, externalId: 'form-123', links: ['https://example.com/checkout'], attachments: ['https://example.com/uploads/screenshot.png'], labels: ['bug'] },
};

for (const template of intakeTemplates()) {
  test(`the ${template.name} template maps its documented payload to a Request`, () => {
    const payload = payloads[template.id];
    assert.ok(payload, `a fixture payload for ${template.id}`);
    assert.equal(applies(template.mapping, payload), true);
    assert.deepEqual(applyMapping(template.mapping, payload), expected[template.id]);
    assert.deepEqual(validateMapping(template.mapping), template.mapping, 'every built-in template passes the check an administrator\'s mapping does');
    assert.ok(intakeVerifier(template.verifier), `${template.id} names a registered verifier`);
    if (template.check !== 'own') assert.ok(template.docs.length > 0 && template.docs.every(url => url.startsWith('https://')), 'a vendor template cites its documentation');
  });
}

test('a template ignores events that are not a new Request', () => {
  assert.equal(applies(intakeTemplate('marker-io')!.mapping, { ...(payloads['marker-io'] as object), type: 'issue.updated' }), false);
  assert.equal(applies(intakeTemplate('userback')!.mapping, { ...(payloads.userback as object), action: 'delete' }), false);
});

test('a mapping keeps only http and https links and gives nothing without a title', () => {
  const mapping = validateMapping({ fields: { title: '/t', links: ['/l'] } });
  assert.deepEqual(applyMapping(mapping, { t: 'x', l: ['javascript:alert(1)', 'https://user:pw@example.com/', 'data:text/html,hi', 'https://ok.example/'] })?.links, ['https://ok.example/']);
  assert.equal(applyMapping(mapping, { t: '   ' }), undefined);
});

test('an administrator\'s mapping is data: pointers, one step, a split, a join or a value, and nothing that runs', () => {
  for (const bad of [
    { fields: { title: 'data.title' } },
    { fields: { title: { eval: '1+1' } } },
    { fields: { title: '/t', script: '/s' } },
    { fields: { title: { pointer: '/t', each: { pointer: '/x' } } } },
    { fields: { title: { join: ['/a', { join: ['/b'] }] } } },
    { fields: {} },
    { fields: { title: '/t' }, when: [{ pointer: '/a', equals: { $ne: 1 } }] },
    { fields: { title: '/t' }, transform: 'x => x' },
  ]) assert.throws(() => validateMapping(bad), MappingError, JSON.stringify(bad));
  assert.deepEqual(validateMapping({ when: [{ pointer: '/kind', equals: 'new' }], fields: { title: { join: ['/a', '/b'], separator: ' ' }, labels: [{ value: 'portal' }, { pointer: '/tags', split: ';' }] } }).fields.labels, [{ value: 'portal' }, { pointer: '/tags', split: ';' }]);
});

const secret = `whsec_${Buffer.alloc(32, 7).toString('base64')}`;
const sw = intakeVerifier('standard-webhooks')!;
const verifyAt = (headers: Record<string, string>, body: string, nowMs: number, key = secret) => sw.verify({ headers, query: new URLSearchParams(), body: Buffer.from(body), secret: key, nowMs, windowSeconds: 300 });

test('a Standard Webhooks signature verifies, a wrong one and an old one are refused, and a rotated pair passes', () => {
  const now = 1_790_000_000_000;
  const stamp = Math.floor(now / 1000);
  const body = '{"title":"x"}';
  const signature = standardWebhookSignature(secret, 'msg_1', stamp, body);
  assert.deepEqual(verifyAt({ 'webhook-id': 'msg_1', 'webhook-timestamp': String(stamp), 'webhook-signature': signature }, body, now), { ok: true, deliveryId: 'msg_1' });
  assert.equal(verifyAt({ 'webhook-id': 'msg_1', 'webhook-timestamp': String(stamp), 'webhook-signature': signature }, '{"title":"y"}', now).ok, false, 'a changed body fails');
  const old = verifyAt({ 'webhook-id': 'msg_1', 'webhook-timestamp': String(stamp - 301), 'webhook-signature': standardWebhookSignature(secret, 'msg_1', stamp - 301, body) }, body, now);
  assert.deepEqual(old.ok ? null : old.code, 'timestamp_outside_window');
  const other = `whsec_${Buffer.alloc(32, 9).toString('base64')}`;
  assert.equal(verifyAt({ 'webhook-id': 'msg_1', 'webhook-timestamp': String(stamp), 'webhook-signature': `${standardWebhookSignature(other, 'msg_1', stamp, body)} ${signature}` }, body, now).ok, true);
  const missing = verifyAt({ 'webhook-id': 'msg_1' }, body, now);
  assert.equal(missing.ok ? null : missing.code, 'signature_missing');
});

test('the Standard Webhooks spec\'s own example signature verifies', () => {
  const example = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
  const body = '{"test": 2432232314}';
  const signature = standardWebhookSignature(example, 'msg_p5jXN8AQM9LWM0D4loKWxJek', 1614265330, body);
  assert.equal(signature, 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=');
});

test('a Standard Webhooks v1a signature verifies with a whpk_ public key', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x!, 'base64url');
  const now = 1_790_000_000_000;
  const stamp = String(Math.floor(now / 1000));
  const body = '{}';
  const v1a = `v1a,${sign(null, Buffer.from(`msg_2.${stamp}.${body}`), privateKey).toString('base64')}`;
  assert.equal(verifyAt({ 'webhook-id': 'msg_2', 'webhook-timestamp': stamp, 'webhook-signature': v1a }, body, now, `whpk_${raw.toString('base64')}`).ok, true);
});

test('the token, X-Hub-Signature-256 and Zendesk verifiers accept their sender and refuse anything else', () => {
  const token = intakeVerifier('token')!;
  const base = { query: new URLSearchParams(), body: Buffer.from('{}'), secret: 'a'.repeat(40), nowMs: Date.parse('2026-10-30T10:00:00Z'), windowSeconds: 300 };
  assert.equal(token.verify({ ...base, headers: { 'x-unfold-intake-token': 'a'.repeat(40) } }).ok, true);
  assert.equal(token.verify({ ...base, headers: { authorization: `Basic ${Buffer.from(`postmark:${'a'.repeat(40)}`).toString('base64')}` } }).ok, true);
  assert.equal(token.verify({ ...base, headers: {}, query: new URLSearchParams({ token: 'a'.repeat(40) }) }).ok, true);
  assert.equal(token.verify({ ...base, headers: { authorization: `Bearer ${'b'.repeat(40)}` } }).ok, false);
  const hub = intakeVerifier('hub-signature-256')!;
  const digest = createHmac('sha256', base.secret).update(base.body).digest('hex');
  assert.equal(hub.verify({ ...base, headers: { 'x-hub-signature-256': `sha256=${digest}` } }).ok, true);
  assert.equal(hub.verify({ ...base, headers: { 'x-hub-signature-256': `sha256=${'0'.repeat(64)}` } }).ok, false);
  const zendesk = intakeVerifier('zendesk')!;
  const stamp = '2026-10-30T10:00:00Z';
  const zsig = createHmac('sha256', base.secret).update(stamp + '{}').digest('base64');
  assert.equal(zendesk.verify({ ...base, headers: { 'x-zendesk-webhook-signature': zsig, 'x-zendesk-webhook-signature-timestamp': stamp } }).ok, true);
  const late = zendesk.verify({ ...base, nowMs: base.nowMs + 600_000, headers: { 'x-zendesk-webhook-signature': zsig, 'x-zendesk-webhook-signature-timestamp': stamp } });
  assert.equal(late.ok ? null : late.code, 'timestamp_outside_window');
});

const crlf = (lines: string[]) => lines.join('\r\n');

test('a multipart email gives its text part, decoded subject and sender, and attachment names without contents', () => {
  const raw = crlf([
    'From: =?utf-8?Q?Jo=C3=ABl_Bakker?= <Joel@Example.NL>',
    'To: requests+acme@agency.example',
    'Subject: =?utf-8?B?S2Fwb3R0ZSBrbm9w?= op de',
    '  checkout',
    'Message-ID: <first@example.nl>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="outer"',
    '',
    '--outer',
    'Content-Type: multipart/alternative; boundary=inner',
    '',
    '--inner',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    'De knop doet niets na het klikken. Cr=C3=A8me br=C3=BBl=C3=A9e =',
    'is de testnaam.',
    '--inner',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p>HTML version</p>',
    '--inner--',
    '--outer',
    'Content-Type: image/png; name="scherm.png"',
    'Content-Disposition: attachment; filename*=utf-8\'\'scherm%20afbeelding.png',
    'Content-Transfer-Encoding: base64',
    '',
    'iVBORw0KGgo=',
    '--outer--',
    '',
  ]);
  const mail = parseMime(Buffer.from(raw, 'utf8').toString('latin1'));
  assert.deepEqual(mail.from, { name: 'Joël Bakker', email: 'joel@example.nl' });
  assert.equal(mail.subject, 'Kapotte knop op de checkout');
  assert.equal(mail.text, 'De knop doet niets na het klikken. Crème brûlée is de testnaam.');
  assert.equal(mail.messageId, 'first@example.nl');
  assert.deepEqual(mail.attachments, ['scherm afbeelding.png']);
  assert.deepEqual(mail.replyTo, []);
});

test('an HTML-only email becomes plain text with no markup, script or style left', () => {
  const raw = crlf([
    'From: client@example.com',
    'Subject: HTML only',
    'Content-Type: text/html; charset=iso-8859-1',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from('<html><head><style>p{color:red}</style><title>t</title></head><body><script>alert(1)</script><p>Hallo,</p><p>Zie <a href="https://example.com/page">de pagina</a> &amp; <b>het</b> menu:<br>caf\xe9</p><ul><li>één</li><li>twee</li></ul><img src=x onerror=alert(1)></body></html>', 'latin1').toString('base64'),
    '',
  ]);
  const mail = parseMime(raw);
  assert.equal(mail.text, 'Hallo,\n\nZie de pagina (https://example.com/page) & het menu:\ncafé\n\n- één\n- twee');
  assert.doesNotMatch(mail.text, /[<>]|alert|color/);
  assert.equal(htmlToText('<div>a<script>evil()</script></div><!-- x --><p>b &lt;c&gt;</p>'), 'a\n\nb <c>');
});

test('a reply names the message it answers and its quoted thread is dropped', () => {
  const raw = crlf([
    'From: "Client, The" <client@example.com>',
    'Subject: Re: Kapotte knop',
    'Message-ID: <second@example.com>',
    'In-Reply-To: <first@example.nl>',
    'References: <zero@example.nl> <first@example.nl>',
    '',
    'It also happens on Safari.',
    '',
    'On Thu, 29 Oct 2026 at 10:00, Agency <agency@example.nl> wrote:',
    '> De knop doet niets.',
    '',
  ]);
  const mail = parseMime(raw);
  assert.deepEqual(mail.from, { name: 'Client, The', email: 'client@example.com' });
  assert.deepEqual(mail.replyTo, ['first@example.nl', 'zero@example.nl']);
  assert.equal(withoutQuote(mail.text), 'It also happens on Safari.');
});

test('the Postmark inbound JSON and Unfold\'s own mail JSON parse like raw MIME', () => {
  const postmark = parseInboundJson({ From: 'client@example.com', FromFull: { Email: 'Client@Example.com', Name: 'Client' }, Subject: 'Re: knop', MessageID: 'postmark-id', TextBody: '', HtmlBody: '<p>Only <i>HTML</i></p>', Headers: [{ Name: 'Message-ID', Value: '<pm@example.com>' }, { Name: 'In-Reply-To', Value: '<first@example.nl>' }], Attachments: [{ Name: 'log.txt', Content: 'aGk=', ContentType: 'text/plain', ContentLength: 2 }] });
  assert.deepEqual(postmark, { from: { name: 'Client', email: 'client@example.com' }, subject: 'Re: knop', text: 'Only HTML', messageId: 'pm@example.com', replyTo: ['first@example.nl'], attachments: ['log.txt'] });
  const own = parseInboundJson({ from: 'Jane <jane@example.com>', subject: 'Hi', text: 'Body', messageId: '<a@b>', inReplyTo: 'c@d', attachments: [{ filename: 'x.pdf' }] });
  assert.deepEqual(own, { from: { name: 'Jane', email: 'jane@example.com' }, subject: 'Hi', text: 'Body', messageId: 'a@b', replyTo: ['c@d'], attachments: ['x.pdf'] });
  assert.equal(parseInboundJson({ hello: 'world' }), undefined);
  assert.equal(parseInboundJson({ raw: 'From: a@b.example\r\nSubject: wrapped\r\n\r\nbody' })?.subject, 'wrapped');
  assert.deepEqual(mailbox('jane@example.com (Jane Doe)'), { name: 'Jane Doe', email: 'jane@example.com' });
});
