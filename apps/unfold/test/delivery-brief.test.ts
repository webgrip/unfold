import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { markSvg, tokensCss, wordmarkSvg } from '../extensions/claude-code/brief/brand.mjs';
import { escapeHtml, renderBrief } from '../extensions/claude-code/brief/render-brief.mjs';
import { briefSchema, validateBrief } from '../extensions/claude-code/brief/validate-brief.mjs';
import { briefBrandModule } from '../scripts/build-brief-brand.mjs';

const brief = new URL('../extensions/claude-code/brief/', import.meta.url);
const brand = new URL('../../../docs/brand/', import.meta.url);
const payload = '<script>alert(1)</script>"onload=alert(2) \'x';

async function example(): Promise<any> {
  return JSON.parse(await readFile(new URL('example.json', brief), 'utf8'));
}

function poison(value: any, schema: any): any {
  if (typeof value === 'string') {
    if (schema.enum || schema.const !== undefined || schema.format || schema.pattern) return value;
    return (value + payload).slice(0, schema.maxLength ?? Infinity);
  }
  if (Array.isArray(value)) {
    if (!schema.items) return value;
    return value.map(item => poison(item, schema.items));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, poison(child, schema.properties?.[key] ?? {})]));
  }
  return value;
}

test('the example brief validates and renders', async () => {
  const record = await example();
  assert.deepEqual(validateBrief(record), []);
  const html = renderBrief(record);
  assert.ok(html.length > 10_000);
  for (const item of record.evidence) assert.match(html, new RegExp(`id="ev-${item.id}"`));
  for (const fold of ['reviewer', 'operator', 'client', 'decisions']) assert.match(html, new RegExp(`id="${fold}" data-fold`));
});

test('schema violations are reported in words', async () => {
  const record = await example();
  record.ticket = 'UNF-1';
  record.evidence[0].status = 'probably';
  record.rollout[0].evidence = ['nowhere'];
  record.evidence[1].source.url = 'javascript:alert(1)';
  record.client.previewUrl = 'data:text/html,hi';
  record.evidence[2].id = record.evidence[3].id;
  record.generatedAt = 'yesterday';
  delete record.intent;
  const errors = validateBrief(record);
  const expected = [
    /^ticket: is not a field/,
    /^evidence\[0\]\.status: must be one of verified, unverified, stale, failed/,
    /^rollout\[0\]\.evidence\[0\]: "nowhere" names no evidence item/,
    /^evidence\[1\]\.source\.url: "javascript:alert\(1\)" is not an http\(s\) URL/,
    /^client\.previewUrl: .* is not an http\(s\) URL/,
    /^evidence\[3\]\.id: .* is used by an earlier evidence item/,
    /^generatedAt: "yesterday" is not an RFC 3339 date-time/,
    /^the record: intent is required/,
  ];
  for (const pattern of expected) assert.ok(errors.some(error => pattern.test(error)), `expected an error matching ${pattern}, got:\n${errors.join('\n')}`);
  assert.throws(() => renderBrief(record), (error: any) => error.errors.length === errors.length && /The Delivery Brief is invalid/.test(error.message));
  assert.ok(validateBrief(null).length > 0);
  assert.deepEqual(validateBrief({ ...(await example()), title: '' }), ['title: must be at least 1 character long']);
});

test('every string field the record carries comes out escaped', async () => {
  const original = await example();
  const record = poison(original, briefSchema);
  record.rollout.forEach((step: any, index: number) => { if (step.evidence) step.evidence = original.rollout[index].evidence; });
  assert.deepEqual(validateBrief(record), []);
  const html = renderBrief(record);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /"onload=/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;&quot;onload=alert\(2\) &#39;x/);
  assert.equal((html.match(/<script>/g) ?? []).length, 1, 'the only script is the page’s own tab enhancement');
  assert.doesNotMatch(html, /\son[a-z]+=/i, 'no inline event handlers');
  assert.equal(escapeHtml('<a href="x">\'&'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
});

test('the brand copies equal docs/brand and the generator', async () => {
  assert.equal(tokensCss, await readFile(new URL('tokens.css', brand), 'utf8'));
  assert.equal(markSvg, await readFile(new URL('mark.svg', brand), 'utf8'));
  assert.equal(wordmarkSvg, await readFile(new URL('wordmark.svg', brand), 'utf8'));
  assert.equal(await readFile(new URL('brand.mjs', brief), 'utf8'), briefBrandModule(), 'run node apps/unfold/scripts/build-brief-brand.mjs');
});

test('the page meets the Artifact page contract', async () => {
  const record = await example();
  const html = renderBrief(record);
  assert.match(html.slice(0, 8192), /<title>UNF-218 Delivery Brief<\/title>/);
  assert.doesNotMatch(html, /<!doctype|<(html|head|body)[\s>]/i);
  assert.match(html, /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\)/);
  assert.match(html, /:root\[data-theme="dark"\] \{/);
  assert.match(html, /body \{\s*background: var\(--ground\);/);
  assert.match(html, /padding-left: max\(16px, env\(safe-area-inset-left, 0px\)\)/);
  assert.match(html, /padding-right: max\(16px, env\(safe-area-inset-right, 0px\)\)/);
  assert.doesNotMatch(html, /<script[^>]*\ssrc=/i);
  for (const href of html.match(/<link[^>]+href="[^"]+"/g) ?? []) assert.match(href, /href="https:\/\/fonts\.(googleapis|gstatic)\.com/);
  for (const status of new Set(record.evidence.map((item: any) => item.status))) assert.match(html, new RegExp(`<span>${status}</span>`));
  for (const word of ['done', 'pending', 'blocked']) assert.match(html, new RegExp(`<span>${word}</span>`));
  assert.match(html, /Every claim links to its evidence; unverified means nobody checked\./);
  assert.match(html, /@media print/);
});

test('a brief without rollout or client lights its evidence and leaves those folds out', async () => {
  const record = await example();
  delete record.rollout;
  delete record.rollback;
  delete record.client;
  delete record.decisions;
  const html = renderBrief(record);
  assert.match(html, /Approach lights, one per evidence item/);
  assert.match(html, /href="#ev-release-order"/);
  assert.doesNotMatch(html, /id="(operator|client|decisions)" data-fold/);
  assert.doesNotMatch(html, /role="tab" id="tab-client"/);
});

test('the command line renders a file and refuses an invalid one', async () => {
  const cli = fileURLToPath(new URL('render-brief.mjs', brief));
  const html = execFileSync(process.execPath, [cli, fileURLToPath(new URL('example.json', brief))], { encoding: 'utf8' });
  assert.match(html, /^<title>/);
  assert.throws(() => execFileSync(process.execPath, [cli, fileURLToPath(new URL('brief.schema.json', brief))], { encoding: 'utf8', stdio: 'pipe' }), (error: any) => error.status === 1 && /is not a valid Delivery Brief/.test(error.stderr));
});

test('a step marked done only lights when every check behind it is verified', async () => {
  const { renderBrief } = await import('../extensions/claude-code/brief/render-brief.mjs');
  const base = { schema: 'unfold.delivery-brief/1', title: 'Lights follow evidence', generatedAt: '2026-10-29T20:00:00Z', summary: 'S', intent: 'I', changes: [{ area: 'a', what: 'w' }] };
  const evidence = [{ id: 'ok', claim: 'c', status: 'verified', source: { kind: 'command' } }, { id: 'old', claim: 'c', status: 'stale', source: { kind: 'live' } }];
  const html = renderBrief({ ...base, evidence, rollout: [{ step: 'proven', status: 'done', evidence: ['ok'] }, { step: 'stale', status: 'done', evidence: ['old'] }, { step: 'none', status: 'done' }] });
  assert.match(html, /step 1, done: proven/);
  assert.match(html, /step 2, unproven: stale/);
  assert.match(html, /step 3, unproven: none/);
  assert.match(html, /1 of 3 steps lit/);
});
