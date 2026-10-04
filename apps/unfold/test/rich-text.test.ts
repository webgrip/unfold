import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { descriptionMarkdown } from '../src/rich-text.ts';
import { PloegClient, type PloegDetail } from '../src/ploeg.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';
import { presentTask, type TaskSourceConfig, type TaskSnapshot } from '../src/tasks.ts';
import { application, configuration, request } from './api-support.ts';
import { scaledTimeout, testTimeout } from './timeframes.ts';

const rendererPath = new URL('../public/core/markdown.js', import.meta.url).href;
const { markdown: render } = await import(rendererPath) as { markdown: (text: string) => string };

const allowedTags: Record<string, RegExp> = {
  p: /^$/, ul: /^$/, ol: /^(?: start="\d+")?$/, li: /^$/, strong: /^$/, code: /^$/, h3: /^$/, h4: /^$/, h5: /^$/, h6: /^$/,
  pre: /^(?: class="md-code"(?: data-lang="[a-z0-9_-]*")?)?$/,
  a: /^ href="https?:\/\/[^"\s<>]+" target="_blank" rel="noopener noreferrer"$/,
};

function assertInertMarkup(html: string, label: string): void {
  const tags = [...html.matchAll(/<(\/?)([^\s>/]+)([^>]*)>/g)];
  for (const [, closing, tag, attributes] of tags) {
    assert(Object.hasOwn(allowedTags, tag), `${label}: renderer emitted <${closing}${tag}>`);
    if (!closing) assert.match(attributes, allowedTags[tag], `${label}: <${tag}${attributes}> carries an unexpected attribute`);
  }
  assert.equal(html.split('<').length - 1, tags.length, `${label}: an angle bracket outside a renderer tag reached the markup`);
}

const hostile: Record<string, string> = {
  script: '<p>before</p><script>alert(1)</script><SCRIPT type=module>steal()</SCRIPT ><p>after</p>',
  style: '<style>body{display:none}</style><p style="background:url(javascript:alert(1))">styled</p>',
  iframe: '<iframe src="https://evil.invalid/frame" srcdoc="<script>alert(1)</script>">frame text</iframe><p>visible</p>',
  handlers: '<p onclick="alert(1)" onmouseover=alert(2)>click</p><img src=x onerror=alert(3)><svg onload=alert(4)><circle/></svg><details open ontoggle=alert(5)><summary>s</summary>d</details>',
  links: '<p><a href="javascript:alert(1)">js</a> <a href=" JaVaScRiPt:alert(1)">spaced</a> <a href="java&#x09;script:alert(1)">tab</a> <a href="vbscript:msgbox(1)">vb</a> <a href="data:text/html,<script>alert(1)</script>">data</a> <a href="https://ok.example/path?q=1&amp;r=2">fine</a> <a href=\'https://quote.example/" onmouseover="alert(1)\'>quote</a></p>',
  markdownInjection: '<p>[click](javascript:alert(1)) **bold** `code` &lt;img src=x onerror=alert(1)&gt; <code>&lt;script&gt;alert(1)&lt;/script&gt;</code></p><pre><code>&lt;/pre&gt;&lt;img src=x onerror=alert(1)&gt;</code></pre>',
  entities: '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp;lt;b&amp;gt; &#60;img src=x onerror=alert(1)&#62; &#x3C;iframe&#x3E;</p>',
  unclosed: '<p>unclosed <b>bold <a href="https://a.example/">link <i>italic',
  comments: '<!-- <script>alert(1)</script> --><p>shown</p><!-- unterminated <img src=x onerror=alert(1)>',
  nestedTags: '<scr<script>ipt>alert(1)</script><p><a href="https://a.example/"><a href="javascript:alert(1)">inner</a></a></p>',
};

test('hostile Vikunja HTML becomes Markdown that the escape-first browser renderer turns into inert markup', () => {
  for (const [label, html] of Object.entries(hostile)) {
    const converted = descriptionMarkdown('vikunja', html);
    assert.notEqual(converted, html, `${label} was not converted`);
    assertInertMarkup(render(converted), label);
  }
  assert.match(render(descriptionMarkdown('vikunja', hostile.links)), /<a href="https:\/\/ok\.example\/path\?q=1&amp;r=2" target="_blank" rel="noopener noreferrer">fine<\/a>/);
  assert.doesNotMatch(descriptionMarkdown('vikunja', hostile.links), /javascript|vbscript|data:|alert\(1\)\)/i, 'unsafe link targets are dropped, not kept as text');
  assert.doesNotMatch(descriptionMarkdown('vikunja', hostile.handlers), /alert|onclick|onerror|onload/, 'event handler attributes never reach the Markdown');
  assert.doesNotMatch(descriptionMarkdown('vikunja', hostile.script), /alert|steal/);
  assert.doesNotMatch(descriptionMarkdown('vikunja', hostile.iframe), /frame text|evil/);
  assert.doesNotMatch(render(descriptionMarkdown('vikunja', hostile.markdownInjection)), /<a /, 'Markdown typed into the tracker cannot make a javascript: link');
});

test('huge and deeply nested descriptions convert within the size cap and in bounded time', () => {
  const started = Date.now();
  const huge = descriptionMarkdown('vikunja', `<p>${'<strong>x</strong> '.repeat(40_000)}</p>`);
  assert(huge.length <= 65_536, `output is ${huge.length} characters`);
  const deep = descriptionMarkdown('vikunja', `${'<div><ul><li><p>'.repeat(5000)}deep${'</p></li></ul></div>'.repeat(5000)}`);
  assert.match(deep, /deep/);
  assert(deep.length <= 65_536);
  assertInertMarkup(render(deep), 'deep');
  const pathological = descriptionMarkdown('vikunja', `<p>${'<'.repeat(100_000)}${'<a '.repeat(20_000)}${'&'.repeat(50_000)}</p>`);
  assert(pathological.length <= 65_536);
  assert(Date.now() - started < scaledTimeout(5000), 'conversion stays linear on pathological input');
});

test('only Vikunja HTML is converted; plain text, Markdown and other providers pass through unchanged', () => {
  const html = '<p>Hello <strong>world</strong></p>';
  assert.equal(descriptionMarkdown('vikunja', html), 'Hello **world**');
  for (const provider of ['demo', 'github', 'forgejo', 'gitlab', 'clickup', 'ploeg', 'manual']) assert.equal(descriptionMarkdown(provider, html), html, provider);
  for (const text of ['Plain text with a < b and **Markdown**', 'Use decimal totals.\n\n<script>alert(1)</script>', '']) assert.equal(descriptionMarkdown('vikunja', text), text);
  assert.equal(descriptionMarkdown('vikunja', '<p><a href="/tasks/9">relative</a></p>', 'https://tracker.example/tasks/8'), '[relative](https://tracker.example/tasks/9)');
  assert.equal(descriptionMarkdown('vikunja', '<p><a href="/tasks/9">relative</a></p>'), 'relative', 'a relative link without a base stays text');
});

test('converted Markdown uses only what the browser renderer understands, so no escape or emphasis marker shows as text', () => {
  const html = '<p>Use order_id &amp; customer_id; 3 &lt; 4 * 2 in C:\\temp. See <a href="https://x.example/a_b">spec [v2]</a> and <em>this</em>.</p><h5>Deep heading</h5><hr><p><code>ok</code> and <a href="mailto:ops@example.invalid">ops</a></p><table><tr><th>Rate</th><th>Amount</th></tr><tr><td>21%</td><td>2,10</td></tr></table><pre><code class="language-TypeScript">const a = 1;</code></pre>';
  const converted = descriptionMarkdown('vikunja', html);
  assert.equal(converted, [
    'Use order_id & customer_id; 3 < 4 * 2 in C:\\temp. See [spec (v2)](https://x.example/a_b) and this.',
    '#### Deep heading',
    '`ok` and ops (ops@example.invalid)',
    '- Rate | Amount\n- 21% | 2,10',
    '```typescript\nconst a = 1;\n```',
  ].join('\n\n'));
  const rendered = render(converted);
  assertInertMarkup(rendered, 'fidelity');
  assert.match(rendered, /<p>Use order_id &amp; customer_id; 3 &lt; 4 \* 2 in C:\\temp\. See <a href="https:\/\/x\.example\/a_b" target="_blank" rel="noopener noreferrer">spec \(v2\)<\/a> and this\.<\/p>/);
  assert.match(rendered, /<h3>Deep heading<\/h3>/);
  assert.match(rendered, /<p><code>ok<\/code> and ops \(ops@example\.invalid\)<\/p>/);
  assert.match(rendered, /<ul><li>Rate \| Amount<\/li><li>21% \| 2,10<\/li><\/ul>/);
  assert.match(rendered, /<pre class="md-code" data-lang="typescript">const a = 1;<\/pre>/);
  for (const item of ploegDemo.items.filter(entry => entry.provider === 'vikunja')) {
    const shown = render(descriptionMarkdown(item.provider, item.description)).replace(/<[^>]+>/g, '');
    assert.doesNotMatch(shown, /[\\*_]|\[|\]/, `${item.id}: no Markdown marker reaches the reader`);
    assert.match(shown, /Illustrative Vikunja-style task/, `${item.id}: the demo note survives`);
  }
});

test('a token hidden in entity-encoded tracker HTML is redacted from the display Markdown', () => {
  const secret = 'tk_vikunja_secret_7788';
  const source: TaskSourceConfig = { id: 'board', name: 'Board', provider: 'vikunja', baseUrl: 'https://tracker.example/api/v1', project: '42', repositoryId: 'order-service', executionOwner: 'interactive', token: secret };
  const task: TaskSnapshot = { key: 'task:x', sourceId: 'board', provider: 'vikunja', id: '8', revision: 'r', title: 'T', description: '<p>tk&#95;vikunja&#95;secret&#95;7788 and <b></b>[redacted]</p>', url: 'https://tracker.example/tasks/8', status: 'open', repositoryId: 'order-service' };
  const presented = presentTask(source, task);
  assert.equal(presented.descriptionMarkdown, '[redacted] and [redacted]');
  assert.equal(presented.description, task.description, 'the snapshot description is untouched');
  assert.equal(presented.revision, task.revision);
});

async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

const vikunjaHtml = '<p>Customers want <strong>VAT per line</strong>.</p><ul><li><p>Show the rate</p></li><li><p>Show the amount</p></li></ul><p>See <a href="/tasks/12">the parent task</a> and <a href="https://docs.example.invalid/vat">the proposal</a>.</p><script>alert(1)</script>';

async function ploegUpstream(t: TestContext) {
  const env = `UNFOLD_RICH_TEXT_${randomBytes(6).toString('hex').toUpperCase()}`;
  const bearer = randomBytes(24).toString('hex');
  process.env[env] = bearer;
  const details = structuredClone(ploegDemo.details) as Record<string, PloegDetail>;
  const item = details['101'].item;
  item.provider = 'vikunja';
  item.url = 'https://tracker.example/tasks/101';
  item.description = vikunjaHtml;
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://fixture.invalid');
    const send = (data: object) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ schemaVersion: '1.0', ...data }));
    if (req.headers.authorization !== `Bearer ${bearer}`) { res.writeHead(401).end(); return; }
    if (url.pathname.endsWith('/teams')) { send({ teams: ploegDemo.teams }); return; }
    if (url.pathname.endsWith('/work-items')) { send({ items: Object.values(details).map(entry => entry.item).filter(entry => entry.team === url.searchParams.get('team') && (!url.searchParams.has('state') || entry.state === url.searchParams.get('state'))), nextCursor: null }); return; }
    const detail = details[url.pathname.split('/').at(-1)!];
    if (detail) send(detail); else res.writeHead(404).end();
  });
  const origin = await listen(server);
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); delete process.env[env]; });
  return { config: { url: origin, tokenEnv: env }, item };
}

test('Ploeg Work Items carry descriptionMarkdown beside the untouched description, in the detail and the lists', async t => {
  const upstream = await ploegUpstream(t);
  const ploeg = new PloegClient({ ...configuration('/unused', 'live'), ploeg: upstream.config });
  const admin = { id: 'admin', name: 'admin', role: 'admin' as const };
  const detail = await ploeg.detail(admin, '101');
  assert.equal(detail.item.description, vikunjaHtml, 'the provider description is passed through unchanged');
  assert.equal(detail.item.descriptionMarkdown, 'Customers want **VAT per line**.\n\n- Show the rate\n- Show the amount\n\nSee [the parent task](https://tracker.example/tasks/12) and [the proposal](https://docs.example.invalid/vat).');
  assertInertMarkup(render(detail.item.descriptionMarkdown), 'ploeg detail');
  const lane = await ploeg.items(admin, 'delivery', 'needs_human');
  assert.equal(lane.items.find(entry => entry.id === '101')?.descriptionMarkdown, detail.item.descriptionMarkdown);
  for (const entry of lane.items.filter(entry => entry.id !== '101')) {
    if (entry.provider === 'vikunja') assert.doesNotMatch(entry.descriptionMarkdown, /<\/?p>/, `${entry.id}: Vikunja HTML is converted`);
    else assert.equal(entry.descriptionMarkdown, entry.description, `${entry.id}: non-HTML descriptions are copied as they are`);
  }
  const overview = await ploeg.overview(admin, 'delivery');
  assert(overview.lanes!.all.items.every(entry => typeof entry.descriptionMarkdown === 'string'));
  assert((await ploeg.proposed(admin)).items.every(entry => entry.descriptionMarkdown === entry.description));
});

test('the demo Ploeg detail and the task preview answer with descriptionMarkdown over HTTP', { timeout: testTimeout(15_000) }, async t => {
  let description = vikunjaHtml;
  const tracker = createServer((req, res) => {
    const url = new URL(req.url!, 'http://tracker.invalid');
    const task = { id: 8, project_id: 42, title: 'Show VAT per line', description, done: false, updated: '2026-09-29T10:00:00Z' };
    res.setHeader('content-type', 'application/json');
    if (url.pathname === '/api/v1/tasks/8') { res.end(JSON.stringify(task)); return; }
    if (url.pathname === '/api/v1/tasks') { res.end(JSON.stringify([task])); return; }
    res.writeHead(404).end('{}');
  });
  const origin = await listen(tracker);
  t.after(() => new Promise<void>(resolve => { tracker.closeAllConnections(); tracker.close(() => resolve()); }));
  const server = await application('demo', config => { config.taskSources = [{ id: 'board', name: 'Board', provider: 'vikunja', baseUrl: `${origin}/api/v1`, project: '42', repositoryId: 'order-service', executionOwner: 'interactive' }]; });
  t.after(() => server.close());
  const preview = await request(server.url, '/api/task-sources/board/tasks/8');
  assert.equal(preview.status, 200, preview.text);
  assert.equal(preview.body.description, vikunjaHtml);
  assert.equal(preview.body.descriptionMarkdown, `Customers want **VAT per line**.\n\n- Show the rate\n- Show the amount\n\nSee [the parent task](${origin}/tasks/12) and [the proposal](https://docs.example.invalid/vat).`);
  const listed = await request(server.url, '/api/task-sources/board/tasks');
  assert.equal(listed.status, 200, listed.text);
  assert.equal(listed.body.tasks[0].revision, preview.body.revision, 'presenting Markdown does not change the revision');
  assert.equal('descriptionMarkdown' in listed.body.tasks[0], false, 'the task list stays as it was');
  description = 'Plain text brief';
  const plain = await request(server.url, '/api/task-sources/board/tasks/8');
  assert.equal(plain.body.descriptionMarkdown, 'Plain text brief');
  assert.notEqual(plain.body.revision, preview.body.revision, 'the revision still follows the provider description');
  for (const id of Object.keys(ploegDemo.details)) {
    const detail = await request(server.url, `/api/ploeg/work-items/${id}`);
    assert.equal(detail.status, 200, detail.text);
    assert.equal(typeof detail.body.item.descriptionMarkdown, 'string', id);
    assertInertMarkup(render(detail.body.item.descriptionMarkdown), `demo ${id}`);
  }
});
