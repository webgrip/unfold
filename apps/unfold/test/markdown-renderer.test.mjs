import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markdown } from '../public/core/markdown.js';
import { scaledTimeout, threadCpuMilliseconds } from './timeframes.ts';

const tagPattern = /<(\/?)([a-z0-9]+)([^>]*)>/g;
const allowed = {
  p: /^$/, br: /^$/, ul: /^$/, ol: /^(?: start="\d+")?$/, li: /^(?: class="md-task")?$/, strong: /^$/, em: /^$/, del: /^$/, code: /^$/, hr: /^$/, blockquote: /^$/,
  h3: /^$/, h4: /^$/, h5: /^$/, h6: /^$/,
  pre: /^ class="md-code"(?: data-lang="[a-z0-9_-]+")?$/,
  span: /^ class="(?:md-check(?: done)?" aria-hidden="true"|sr-only")$/,
  a: /^ href="https?:\/\/[^"\s<>]+" target="_blank" rel="noopener noreferrer"$/,
};

function assertInert(html, label) {
  const tags = [...html.matchAll(tagPattern)];
  for (const [, closing, tag, attributes] of tags) {
    assert(Object.hasOwn(allowed, tag), `${label}: emitted <${closing}${tag}>`);
    if (!closing) assert.match(attributes, allowed[tag], `${label}: <${tag}${attributes}>`);
  }
  assert.equal(html.split('<').length - 1, tags.length, `${label}: a stray angle bracket reached the markup`);
}

const textOf = html => html.replace(/<br>\n/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

test('text is escaped before any markup is added, so hostile input stays inert text', () => {
  const hostile = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '[click](javascript:alert(1)) [data](data:text/html,x) [spaced]( https://a.example/)',
    '<a href="https://evil.example">x</a> "quoted" \'single\' & ampersand',
    '```js" onmouseover="x\n<b>code</b>\n```',
    '`<script>` **<i>bold</i>** ~~<s>strike</s>~~ _<u>em</u>_',
    '> <iframe src=https://evil.example>',
    '- [x] <svg onload=alert(1)>',
    '\u00000\u0000 \u00010\u0001 placeholder look-alikes',
    '[x](https://a.example/" onmouseover="alert(1)) https://b.example/"onclick="x',
    '<https://x.example/[a](https://y.example//onmouseover=location=name//)>',
    '<https://x.example/[a](https://y.example//data-action=logout//)>',
    '[a](https://x.example/```js```)',
    '[a](https://x.example/`code`) <https://x.example/`code`>',
  ];
  for (const input of hostile) {
    const html = markdown(input);
    assertInert(html, input);
    assert.doesNotMatch(html, /<(?:script|img|iframe|svg|b|i|s|u)\b/i, input);
    assert.doesNotMatch(html, /href="(?!https?:)/, input);
  }
  assert.equal(markdown(null), '');
  assert.equal(markdown(undefined), '');
  assert.equal(markdown(''), '');
});

test('a tracker description keeps its lines and shows its markup verbatim as text', () => {
  const description = '<button id="untrusted-task-markup">Start another agent</button>\n<img src="/untrusted-task-image" onerror="alert(1)">\nKeep this source text inert.';
  const html = markdown(description);
  assert.equal(html.match(/<p>/g)?.length, 1, 'consecutive lines stay one paragraph');
  assert.equal(textOf(html), description);
  assert.equal(markdown('first\n\nsecond'), '<p>first</p><p>second</p>');
  assert.equal(markdown('line one\nline two'), '<p>line one<br>\nline two</p>');
});

test('lists nest by indentation, keep their numbering and show task checkboxes', () => {
  assert.equal(markdown('Acceptance criteria:\n- one\n- two\n\nAfter.'), '<p>Acceptance criteria:</p><ul><li>one</li><li>two</li></ul><p>After.</p>');
  assert.equal(markdown('1. first\n2) second'), '<ol><li>first</li><li>second</li></ol>');
  assert.equal(markdown('- bullet\n1. number'), '<ul><li>bullet</li></ul><ol><li>number</li></ol>');
  assert.equal(markdown('Done when:\n1. one\n   - detail\n2. two'), '<p>Done when:</p><ol><li>one<ul><li>detail</li></ul></li><li>two</li></ol>');
  assert.equal(markdown('- parent\n  - child\n    - grandchild\n- sibling'), '<ul><li>parent<ul><li>child<ul><li>grandchild</li></ul></li></ul></li><li>sibling</li></ul>');
  assert.equal(markdown('- [x] Done thing\n- [ ] Open thing'), '<ul><li class="md-task"><span class="md-check done" aria-hidden="true"></span><span class="sr-only">Done: </span>Done thing</li><li class="md-task"><span class="md-check" aria-hidden="true"></span><span class="sr-only">To do: </span>Open thing</li></ul>');
  assert.equal(markdown('3. three\n\n   para two\n\nafter'), '<ol start="3"><li>three<br>\npara two</li></ol><p>after</p>');
  assert.equal(markdown('- a\n\n- b'), '<ul><li>a</li><li>b</li></ul>', 'a blank line between items keeps one list');
  const deep = markdown(Array.from({ length: 40 }, (_, depth) => `${' '.repeat(depth * 2)}- level ${depth}`).join('\n'));
  assertInert(deep, 'deep list');
  assert(deep.split('<ul>').length - 1 <= 6, 'nesting is capped');
});

test('headings, quotes, rules and code blocks', () => {
  assert.equal(markdown('# One\n## Two\n###### Six'), '<h3>One</h3><h4>Two</h4><h5>Six</h5>', 'a heading never skips a level');
  assert.equal(markdown('#### Deep heading'), '<h3>Deep heading</h3>', 'the first heading takes the base level');
  assert.equal(markdown('### Problem\n\ntext\n\n### Done when', { baseLevel: 4 }), '<h4>Problem</h4><p>text</p><h4>Done when</h4>');
  assert.equal(markdown('## A\n### B\n# C\n#### D', { baseLevel: 5 }), '<h5>A</h5><h6>B</h6><h5>C</h5><h6>D</h6>');
  assert.equal(markdown('#hashtag'), '<p>#hashtag</p>');
  assert.equal(markdown('> quoted\n> two\n\nafter'), '<blockquote><p>quoted<br>\ntwo</p></blockquote><p>after</p>');
  assert.equal(markdown('above\n\n---\n\nbelow'), '<p>above</p><hr><p>below</p>');
  assert.equal(markdown('```typescript\nconst a = 1 < 2;\n```'), '<pre class="md-code" data-lang="typescript">const a = 1 &lt; 2;</pre>');
  assert.equal(markdown('```\n**not bold** [x](https://a.example/)\n```'), '<pre class="md-code">**not bold** [x](https://a.example/)</pre>');
  assert.equal(markdown('```unterminated'), '<p>```unterminated</p>');
});

test('inline code, bold, emphasis, strikethrough and escapes follow word boundaries', () => {
  assert.equal(markdown('**bold** and __also__'), '<p><strong>bold</strong> and <strong>also</strong></p>');
  assert.equal(markdown('*em* and _em_ and ~~gone~~'), '<p><em>em</em> and <em>em</em> and <del>gone</del></p>');
  assert.equal(markdown('order_id & customer_id; 3 < 4 * 2 in C:\\temp'), '<p>order_id &amp; customer_id; 3 &lt; 4 * 2 in C:\\temp</p>');
  assert.equal(markdown('2*3*4 and snake_case_name'), '<p>2*3*4 and snake_case_name</p>');
  assert.equal(markdown('\\*literal\\* \\_under\\_ \\# \\<b\\>'), '<p>*literal* _under_ # &lt;b&gt;</p>');
  assert.equal(markdown('`code *not* [x](https://a.example/)`'), '<p><code>code *not* [x](https://a.example/)</code></p>');
  assert.equal(markdown('** spaced ** stays'), '<p>** spaced ** stays</p>');
});

test('only http(s) links become anchors, with bare URLs trimmed of trailing punctuation', () => {
  const external = href => `<a href="${href}" target="_blank" rel="noopener noreferrer">`;
  assert.equal(markdown('[spec **v2**](https://x.example/a_b)'), `<p>${external('https://x.example/a_b')}spec <strong>v2</strong></a></p>`);
  assert.equal(markdown('See https://x.example/a_b_c).'), `<p>See ${external('https://x.example/a_b_c')}https://x.example/a_b_c</a>).</p>`);
  assert.equal(markdown('(https://x.example/wiki/Foo_(bar))'), `<p>(${external('https://x.example/wiki/Foo_(bar)')}https://x.example/wiki/Foo_(bar)</a>)</p>`);
  assert.equal(markdown('<https://x.example/?q=1&r=2>'), `<p>${external('https://x.example/?q=1&amp;r=2')}https://x.example/?q=1&amp;r=2</a></p>`);
  assert.equal(markdown('ftp://x.example/ and mailto:a@b.example'), '<p>ftp://x.example/ and mailto:a@b.example</p>');
  assert.equal(markdown('[bad](javascript:alert(1))'), '<p>[bad](javascript:alert(1))</p>');
});

test('a link with credentials in its address stays text, like every link that safeUrl refuses', () => {
  for (const [source, text] of [['[pay](https://user:secret@bank.example/)', 'pay'], ['<https://user@bank.example/login>', 'https://user@bank.example/login'], ['see https://user:secret@bank.example/login', 'https://user:secret@bank.example/login']]) {
    const html = markdown(source);
    assert.doesNotMatch(html, /<a /, source);
    assert(html.includes(text), `the text of ${source} is kept`);
  }
  assert.match(markdown('[docs](https://docs.example/a?b=1&c=2)'), /<a href="https:\/\/docs\.example\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">docs<\/a>/, 'an ordinary address is unchanged');
});

test('a link, code span or code block never lands inside another link\'s address', () => {
  const external = href => `<a href="${href}" target="_blank" rel="noopener noreferrer">`;
  assert.equal(markdown('<https://x.example/[a](https://y.example//onmouseover=x//)>'), `<p>&lt;https://x.example/${external('https://y.example//onmouseover=x//')}a</a>&gt;</p>`);
  assert.equal(markdown('[a](https://x.example/```js```)'), `<p>[a](${external('https://x.example/')}https://x.example/</a><pre class="md-code" data-lang="js"></pre>)</p>`);
  assert.equal(markdown('<https://x.example/`code`>'), '<p>&lt;https://x.example/<code>code</code>&gt;</p>');
  for (const input of ['[a](https://x.example/`b`)', '<https://x.example/[a](https://y.example/)>', '[a](https://x.example/```\ncode\n```)']) {
    for (const [, href] of markdown(input).matchAll(/href="([^"]*)"/g)) assert.doesNotMatch(href, /[<>]/, input);
  }
});

test('pathological input renders in bounded time', () => {
  const started = threadCpuMilliseconds();
  for (const input of ['['.repeat(60_000), `# a${' '.repeat(60_000)}b`, `x${' '.repeat(60_000)}y`, '*a'.repeat(30_000), '_a '.repeat(20_000), `${'`'.repeat(3)}${'a'.repeat(60_000)}`, 'https://'.repeat(8_000), `${'- '.repeat(20_000)}deep`]) assertInert(markdown(input), input.slice(0, 12));
  const spent = threadCpuMilliseconds() - started;
  assert(spent < scaledTimeout(3000), `took ${Math.round(spent)} ms of CPU`);
});
