import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToMarkdown, looksLikeHtml } from '../src/markdown.ts';
import { scaledTimeout, threadCpuMilliseconds } from './timeframes.ts';

test('TipTap task descriptions become readable Markdown', () => {
  const html = '<h2>Goal</h2><p>Make <strong>checkout</strong> round &amp; <em>stay</em> <s>wrong</s> correct.<br>Second line with <code>a`b</code></p><ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Done thing</p></div></li><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Open thing</p></div></li></ul><pre><code class="language-ts">if (a &lt; 2) {\n  return `x`;\n}</code></pre><ol start="3"><li><p>three</p><ul><li><p>nested</p></li></ul></li><li><p>four</p></li></ol><blockquote><p>quoted</p></blockquote><hr><table><tbody><tr><th><p>A</p></th><th><p>B|C</p></th></tr><tr><td><p>1</p></td></tr></tbody></table><p><a href="https://forge.example/pulls/1">the PR</a> and <img src="/api/v1/tasks/1/attachments/2" alt="screenshot"></p>';
  assert.equal(htmlToMarkdown(html, 'https://tasks.example/'), [
    '## Goal',
    'Make **checkout** round \\& *stay* ~~wrong~~ correct.  \nSecond line with ``a`b``',
    '- [x] Done thing\n- [ ] Open thing',
    '```ts\nif (a < 2) {\n  return `x`;\n}\n```',
    '3. three\n   - nested\n4. four',
    '> quoted',
    '---',
    '| A | B\\|C |\n| --- | --- |\n| 1 |  |',
    '[the PR](https://forge.example/pulls/1) and [image: screenshot](https://tasks.example/api/v1/tasks/1/attachments/2)',
  ].join('\n\n'));
});

test('hostile HTML yields inert text: executable content, unsafe links and markup are neutralised', () => {
  const html = '<script>alert(1)</script><style>p{}</style><iframe src="https://evil.invalid">frame text</iframe><noscript>x</noscript><SCRIPT type=module>steal()</SCRIPT ><svg><script>1</script><text>svg text</text></svg><p onclick="x()">safe <a href="javascript:alert(1)">js</a> <a href=" JaVaScRiPt:alert(1)">spaced</a> <a href="data:text/html,x">data</a> <a href="https://user:pass@x.example/">creds</a> <img src="data:image/png;base64,AAAA" alt="pixel]"><img src="javascript:1" alt=""></p><p>&lt;img src=x onerror=boom()&gt; *not bold* [not](link) `tick` _u_ ~s~ |p| \\ &amp;lt;</p><p># fake heading</p><p>1. fake list</p><p>- fake item</p><p>&gt; fake quote</p>';
  const markdown = htmlToMarkdown(html);
  for (const forbidden of ['alert', 'steal', 'frame text', 'svg text', 'onclick', 'javascript', 'data:', 'user:pass']) assert(!markdown.toLowerCase().includes(forbidden.toLowerCase()), `${forbidden} leaked into ${JSON.stringify(markdown)}`);
  assert(!/(?:^|[^\\])[<>]/.test(markdown.replace(/^\\> fake quote$/m, '')), 'every angle bracket is escaped text');
  assert.equal(markdown, [
    'safe js spaced data creds \\[image: pixel\\]\\]\\[image: image\\]',
    '\\<img src=x onerror=boom()\\> \\*not bold\\* \\[not\\](link) \\`tick\\` \\_u\\_ \\~s\\~ \\|p\\| \\\\ \\&lt;',
    '\\# fake heading',
    '1\\. fake list',
    '\\- fake item',
    '\\> fake quote',
  ].join('\n\n'));
});

test('malformed, deeply nested and oversized input terminates with bounded output', () => {
  assert.equal(htmlToMarkdown('<p>unclosed <b>bold <i>italic'), 'unclosed **bold *italic***');
  assert.equal(htmlToMarkdown('<p a="unterminated>text'), '');
  assert.equal(htmlToMarkdown('<scr<script>ipt>alert(1)</script>'), 'ipt\\>alert(1)');
  assert.equal(htmlToMarkdown('<!-- <p>hidden</p> --><p>shown</p><!-- unterminated'), 'shown');
  assert.equal(htmlToMarkdown('&#0;&#x110000;&#xD800;&#65;&#x42;&copy;&copy&unknown;&amp'), '���AB©\\&copy\\&unknown;\\&');
  assert.equal(htmlToMarkdown('<p>a‮b\u0007c\r\nd</p>'), 'abc d');
  const deep = '<div><ul><li>'.repeat(5000) + 'deep' + '</li></ul></div>'.repeat(5000);
  const nested = htmlToMarkdown(deep);
  assert.match(nested, /deep/);
  const huge = htmlToMarkdown('<p>' + 'x'.repeat(300000) + '</p>');
  assert(huge.length <= 65536);
  const started = threadCpuMilliseconds();
  htmlToMarkdown('<'.repeat(100000) + '<a '.repeat(20000) + '&'.repeat(50000));
  assert(threadCpuMilliseconds() - started < scaledTimeout(2000), 'tokenizing pathological input stays linear');
});

test('HTML detection distinguishes tracker markup from plain text and Markdown', () => {
  assert(looksLikeHtml('<p>Hello</p>'));
  assert(looksLikeHtml('line<br/>line'));
  assert(looksLikeHtml('<ul data-type="taskList"><li>x</li></ul>'));
  assert(!looksLikeHtml('Plain text with a < b and **Markdown**'));
  assert(!looksLikeHtml('Use decimal totals.\n\n<script>alert(1)</script>'));
});

const { markdown: render } = await import(new URL('../public/core/markdown.js', import.meta.url).href) as { markdown: (text: string) => string };

test('the unfold dialect writes only what the browser renderer reads: no escapes, no emphasis markers, headings up to four', () => {
  const html = '<h2>Goal</h2><p>Make <strong>checkout</strong> round &amp; <em>stay</em> <s>wrong</s> correct.<br>Second line with <code>a`b</code></p><ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Done thing</p></div></li><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Open thing</p></div></li></ul><pre><code class="language-ts">if (a &lt; 2) {\n  return `x`;\n}</code></pre><ol start="3"><li><p>three</p><ul><li><p>nested</p></li></ul></li><li><p>four</p></li></ol><blockquote><p>quoted</p></blockquote><hr><table><tbody><tr><th><p>A</p></th><th><p>B|C</p></th></tr><tr><td><p>1</p></td></tr></tbody></table><p><a href="https://forge.example/pulls/1">the PR</a> and <img src="/api/v1/tasks/1/attachments/2" alt="screenshot"></p><h6>Six</h6><p><a href="https://x.example/">spec [v2]</a> <a href="mailto:ops@example.invalid">ops</a></p>';
  assert.equal(htmlToMarkdown(html, 'https://tasks.example/', 'unfold'), [
    '## Goal',
    'Make **checkout** round & stay ~~wrong~~ correct.\nSecond line with a`b',
    '- [x] Done thing\n- [ ] Open thing',
    '```ts\nif (a < 2) {\n  return `x`;\n}\n```',
    '3. three\n   - nested\n4. four',
    '> quoted',
    '- A | B|C\n- 1',
    '[the PR](https://forge.example/pulls/1) and [image: screenshot](https://tasks.example/api/v1/tasks/1/attachments/2)',
    '#### Six',
    '[spec (v2)](https://x.example/) ops (ops@example.invalid)',
  ].join('\n\n'));
  const rendered = render(htmlToMarkdown(html, 'https://tasks.example/', 'unfold'));
  assert.match(rendered, /<h3>Goal<\/h3><p>Make <strong>checkout<\/strong> round &amp; stay <del>wrong<\/del> correct\.<br>\nSecond line with a`b<\/p>/);
  assert.match(rendered, /<a href="https:\/\/x\.example\/" target="_blank" rel="noopener noreferrer">spec \(v2\)<\/a>/);
  assert.match(rendered, /<h4>Six<\/h4>/);
  assert.doesNotMatch(rendered, /\\/, 'no backslash escape reaches the reader');
});

test('the unfold dialect stays inert: hostile HTML renders through the browser renderer without a tag it did not make', () => {
  const html = '<script>alert(1)</script><iframe src="https://evil.invalid">frame text</iframe><p onclick="x()">safe <a href="javascript:alert(1)">js</a> <a href="data:text/html,x">data</a> <a href="https://user:pass@x.example/">creds</a> <img src="javascript:1" alt="x"> <a href="mailto:x@example.invalid?body=%3Cscript%3E">mail</a></p><p>&lt;img src=x onerror=boom()&gt; [not](javascript:alert(1)) [q](https://a.example/"onmouseover="alert(1)) `tick` &amp;lt;</p><pre><code class="language-x&quot;onload=&quot;y">&lt;/pre&gt;&lt;script&gt;</code></pre>';
  const converted = htmlToMarkdown(html, undefined, 'unfold');
  for (const forbidden of ['alert(1)</script>', 'frame text', 'onclick', 'user:pass', 'data:text']) assert(!converted.includes(forbidden), `${forbidden} leaked into ${JSON.stringify(converted)}`);
  const rendered = render(converted);
  const tags = [...rendered.matchAll(/<\/?([a-z0-9]+)([^>]*)>/g)];
  assert.equal(rendered.split('<').length - 1, tags.length, 'every angle bracket belongs to a renderer tag');
  for (const [, tag, attributes] of tags) {
    assert(['p', 'code', 'pre', 'a', 'strong', 'ul', 'li', 'h3', 'h4', 'h5', 'h6'].includes(tag), `renderer emitted <${tag}>`);
    if (tag === 'a' && attributes) assert.match(attributes, /^ href="https?:\/\/[^"\s<>]+" target="_blank" rel="noopener noreferrer"$/);
  }
  assert.doesNotMatch(rendered, /href="(?!https?:)/);
});
