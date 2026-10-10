import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CommentMarker, cardCommentBody, cardFileName, cardPalette, cardSummary, finishFor, isCardComment, momentHeadline, momentOf, money, renderCardImage,
} from '../src/cards/cardimage.ts';
import type { CardImageCard } from '../src/cards/cardimage.ts';
import { rfc3339 } from '../src/cards/go.ts';

const fixtures = new URL('./fixtures/cards/cardimage/', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, fixtures), 'utf8');
const cases = JSON.parse(read('cards.json')) as Record<string, CardImageCard>;
const goldenNames = ['merged', 'escaping', 'demo', 'drafting', 'graded', 'cracked', 'mended', 'forge'];

const nowMs = Date.UTC(2026, 9, 1, 12, 0, 0);
const now = new Date(nowMs);
const hour = 3_600_000;
const day = 24 * hour;
const after = (ms: number): Date => new Date(nowMs + ms);
const card = (name: string): CardImageCard => structuredClone(cases[name]!);
const mergedCard = (): CardImageCard => card('merged');
const render = (c: CardImageCard): string => renderCardImage(c, { now });

function assertWellFormed(svg: string): void {
  const stack: string[] = [];
  let elements = 0;
  let rest = svg.replace(/\n$/, '');
  while (rest !== '') {
    const text = /^[^<]+/.exec(rest);
    if (text) {
      assert.doesNotMatch(text[0], /&(?!(?:amp|lt|gt|#\d+|#x[0-9A-Fa-f]+);)/, 'bare ampersand in text');
      rest = rest.slice(text[0].length);
      continue;
    }
    const close = /^<\/([A-Za-z][\w:-]*)>/.exec(rest);
    if (close) {
      assert.equal(stack.pop(), close[1], `mismatched </${close[1]}>`);
      rest = rest.slice(close[0].length);
      continue;
    }
    const open = /^<([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/.exec(rest);
    assert.ok(open, `not well-formed XML at ${rest.slice(0, 40)}`);
    elements++;
    const name = open[1]!;
    assert.ok(!['script', 'foreignObject', 'image', 'a', 'style'].includes(name), `image contains a <${name}> element`);
    for (const [, attr, value] of open[2]!.matchAll(/([\w:-]+)="([^"]*)"/g)) {
      assert.ok(!attr!.toLowerCase().startsWith('on') && !value!.includes('javascript:'), `image carries attribute ${attr}=${value}`);
      assert.doesNotMatch(value!, /&(?!(?:amp|lt|gt|#\d+|#x[0-9A-Fa-f]+);)/, 'bare ampersand in attribute');
    }
    if (open[3] !== '/') stack.push(name);
    rest = rest.slice(open[0].length);
  }
  assert.deepEqual(stack, [], 'unclosed elements');
  assert.ok(elements >= 10, `image has ${elements} elements`);
}

test('render matches the golden images and summaries byte for byte', () => {
  for (const name of goldenNames) {
    const svg = render(card(name));
    assertWellFormed(svg);
    assert.equal(svg, read(`${name}.svg`), `${name}.svg`);
    assert.equal(cardSummary(card(name), now), read(`${name}.md`), `${name}.md`);
  }
});

test('render does not depend on how now is given', () => {
  assert.equal(renderCardImage(card('mended'), { now: rfc3339(now) }), read('mended.svg'));
});

test('render is deterministic', () => {
  assert.equal(render(card('mended')), render(card('mended')));
});

test('render escapes every card text', () => {
  const svg = render(card('escaping'));
  for (const raw of ['<script', '<b>', '<img', '"/><x', '‮', '\x00']) assert.ok(!svg.includes(raw), `image contains unescaped ${JSON.stringify(raw)}`);
  for (const escaped of ['&lt;script&gt;', '&lt;b&gt;ann&amp;a&lt;/b&gt;', '&lt;img src=x&gt;']) assert.ok(svg.includes(escaped), `image lacks escaped ${escaped}`);
  const summary = cardSummary(card('escaping'), now);
  for (const raw of ['<script', '<b>', '<img', '@carla', '#12', '‮']) assert.ok(!summary.includes(raw), `summary contains ${JSON.stringify(raw)}`);
});

test('a demo card shows no cost', () => {
  for (const out of [render(card('demo')), cardSummary(card('demo'), now)]) {
    assert.ok(!out.includes('US$'), 'demo card shows an amount');
    assert.ok(out.includes('Demo') && out.includes('no model calls'), 'demo card does not say it is a demo');
  }
});

test('the grade says whether its evidence is complete', () => {
  const partial = render(card('graded'));
  assert.ok(partial.includes('Formula 2026.3 · evidence incomplete') && partial.includes('Grade 8.5, evidence incomplete.'));
  assert.ok(cardSummary(card('graded'), now).includes('formula 2026.3 · missing delivery.defectBounces |'));
  assert.ok(render(card('forge')).includes('Formula 2026.3 · evidence complete'));
  assert.ok(cardSummary(card('forge'), now).includes('formula 2026.3 · evidence complete |'));
});

test('graded, cracked and mended cards carry their marks', () => {
  const merged = render(card('merged'));
  assert.ok(!merged.includes('data-slot="grade"') && !merged.includes('data-crack'));
  const graded = render(card('graded'));
  assert.ok(graded.includes('data-slot="grade"') && graded.includes('>8.5<'));
  const cracked = render(card('cracked'));
  assert.ok(cracked.includes('data-crack="1"') && cracked.includes('Cracked · 1 crack'));
  const mended = render(card('mended'));
  assert.ok(mended.includes(`stroke="${cardPalette.gold}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" data-crack="1"`));
  assert.ok(mended.includes('Mended · 1 crack sealed in gold'));
});

test('the summary names no person but the steward', () => {
  const summary = cardSummary(card('mended'), now);
  assert.ok(summary.includes('anna'));
  for (const person of ['bram', 'carla', 'dirk']) assert.ok(!summary.includes(person), `summary names ${person}`);
  const svg = render(card('mended'));
  for (const person of ['bram', 'carla', 'dirk', 'Retry loops forever']) assert.ok(!svg.includes(person), `image names ${person}`);
});

test("the consumer's skin does not change Ploeg's image", () => {
  const want = render(card('graded'));
  for (const skin of ['default', 'forge', 'no-such-skin']) {
    const styled = { ...card('graded'), style: { skin, theme: null } };
    assert.equal(render(styled), want, `skin ${skin} changed the image`);
  }
});

test('moment keys change only at moments', () => {
  const open = mergedCard();
  open.plays![0]!.state = 'open';
  open.state = 'in_review';
  assert.deepEqual(momentOf(open, now), { key: '', play: 0 });

  const merged = mergedCard();
  merged.release = null;
  const m = momentOf(merged, now);
  assert.deepEqual(m, { key: 'merged:57', play: 57 });
  assert.equal(momentHeadline(m, ''), 'Merged');

  const released = mergedCard();
  released.release!.at = rfc3339(after(-hour));
  const r = momentOf(released, now);
  assert.equal(r.key, 'merged:57;released:production;finish:matte');
  assert.equal(momentHeadline(r, m.key), 'Released to production');
  assert.equal(momentOf(released, after(5 * day)).key, r.key);
  const foil = momentOf(released, after(7 * day));
  assert.equal(foil.key, 'merged:57;released:production;finish:foil');
  assert.equal(momentHeadline(foil, r.key), 'Foil finish');

  const fromMerge = mergedCard();
  fromMerge.release!.source = 'merge';
  assert.equal(momentOf(fromMerge, now).key, 'merged:57;finish:foil');

  const crackedKey = momentOf(card('cracked'), now).key;
  assert.equal(crackedKey, momentOf(mergedCard(), now).key);
  const mended = momentOf(card('mended'), now);
  assert.equal(mended.key, `${crackedKey};mended:1`);
  assert.equal(momentHeadline(mended, crackedKey), 'Mended');

  const withdrawn = mergedCard();
  withdrawn.state = 'withdrawn';
  assert.equal(momentOf(withdrawn, now).key, '');
});

test('the finish ladder and money', () => {
  const finishes: [number, string][] = [[-1, 'matte'], [0, 'matte'], [6, 'matte'], [7, 'foil'], [29, 'foil'], [30, 'holo'], [90, 'prism'], [180, 'gilded'], [364, 'gilded'], [365, 'infinity'], [9000, 'infinity']];
  for (const [days, want] of finishes) assert.equal(finishFor(days).key, want, `finishFor(${days})`);
  const amounts: [number, string][] = [[0, 'US$ 0,00'], [0.004, '< US$ 0,01'], [1.235, 'US$ 1,24'], [1234.5, 'US$ 1.234,50'], [-2, '-US$ 2,00']];
  for (const [v, want] of amounts) assert.equal(money(v), want, `money(${v})`);
});

test('the comment body matches its golden file', () => {
  assert.equal(cardCommentBody(card('mended'), now, 'Mended', 'https://forge.example/attachments/abc'), read('comment.md'));
  assert.ok(cardCommentBody(card('mended'), now, 'Merged', '').startsWith(`${CommentMarker}\n`));
});

test('the comment body embeds only safe image URLs', () => {
  const urls: [string, boolean][] = [
    ['https://forge.example/attachments/abc', true],
    ['/uploads/abc/run-card-42.svg', true],
    ['', false],
    ['javascript:alert(1)', false],
    ['//evil.example/x.svg', false],
    ['https://x.example/a) [b](https://y', false],
    ['https://x.example/a\n<script>', false],
  ];
  for (const [url, embedded] of urls) {
    const body = cardCommentBody(card('escaping'), now, 'Merged', url);
    assert.equal(body.includes('!['), embedded, `url ${JSON.stringify(url)}`);
    assert.ok(!body.includes('<script') && !body.includes('@carla'), `url ${JSON.stringify(url)}: body carries unescaped card text`);
  }
  assert.ok(cardCommentBody(card('escaping'), now, 'Released to <b>prod</b>', '').includes('### Run card · Released to &lt;b&gt;prod&lt;/b&gt;'));
});

test('the file name keeps only the Work Item digits', () => {
  assert.equal(cardFileName({ workItemId: '42/../x' }), 'run-card-42.svg');
});

test('card comments are found by their marker of any release', () => {
  const bodies: [string, boolean][] = [
    [cardCommentBody(mergedCard(), now, 'Merged', ''), true],
    ['<!-- acme:run-card -->\n### Run card', true],
    ['  <!--ploeg:run-card-->', true],
    ['<!-- ploeg:usage-report -->', false],
    ['A person quoting <!-- ploeg:run-card -->', false],
  ];
  for (const [body, want] of bodies) assert.equal(isCardComment(body), want, JSON.stringify(body));
});
