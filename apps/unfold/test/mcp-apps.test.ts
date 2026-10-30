import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { application } from './api-support.ts';
import { createMcpServer } from '../src/mcp.ts';
import { cardRevision, cardRevisionTool, mcpAppMimeType, mcpAppPolicy, mcpAppsExtension, workRevision } from '../src/mcp-apps.ts';
// @ts-ignore The view is browser JavaScript without type declarations.
import * as view from '../public/mcp-apps/view.js';

type Json = Record<string, any>;
const ui = { extensions: { [mcpAppsExtension]: { mimeTypes: [mcpAppMimeType] } } };
const modernMeta = (capabilities: Json = {}) => ({ 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': capabilities });
const initialize = (capabilities: Json) => ({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities, clientInfo: { name: 'test', version: '1' } } });
const viewed = ['unfold_now', 'unfold_get_work'];

function askingUnfold(t: { after(fn: () => void): void }) {
  const posted: Json[] = [];
  const fake = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET') { res.end(JSON.stringify({ asks: [], allowance: { remainingUsd: 1.97, resetAt: '2026-11-01T00:00:00Z', askBudgetUsd: 0.02, asksEnabled: true } })); return; }
    const body = JSON.parse(Buffer.concat(chunks).toString());
    posted.push(body);
    if (body.recordOnly) { res.statusCode = 409; res.end(JSON.stringify({ error: { code: 'ask_needs_model', message: 'The record does not answer this question.' } })); return; }
    res.statusCode = 201;
    res.end(JSON.stringify({ question: body.question, answer: 'Firefox is not affected.', status: 'answered', source: 'model', costUsd: 0.0011, costStatus: 'provisional' }));
  });
  t.after(() => fake.close());
  return { posted, ready: new Promise<string>(resolve => fake.listen(0, '127.0.0.1', () => { const a = fake.address(); assert(a && typeof a !== 'string'); resolve(`http://127.0.0.1:${a.port}`); })) };
}

function externalReferences(html: string): string[] {
  return [
    ...html.matchAll(/https?:\/\/[^\s"'<>)]*/gi),
    ...html.matchAll(/\b(?:src|href|action|srcset|poster|data)\s*=\s*["']?\s*(?:[a-z][a-z0-9+.-]*:|\/\/)[^"'\s>]*/gi),
    ...html.matchAll(/(?<![\w.])url\(\s*["']?(?!data:)[^)]*\)/g),
    ...html.matchAll(/@import\b[^;]*/gi),
    ...html.matchAll(/<(?:link|iframe|object|embed|base|form)\b[^>]*>/gi),
    ...html.matchAll(/<script\b[^>]*\bsrc\s*=/gi),
    ...html.matchAll(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\s*\(|\bimport\s*\(|\bnew\s+(?:Worker|SharedWorker)\b/g),
  ].map(match => match[0]);
}

test('a client that declares MCP Apps gets the extension, two ui:// resources and their views on unfold_now and unfold_get_work', async () => {
  const server = createMcpServer({ url: 'http://127.0.0.1:9', version: 'test' });
  const init = await server.handle(initialize(ui));
  assert.deepEqual(init?.result.capabilities, { tools: { listChanged: false }, resources: { listChanged: false }, extensions: { [mcpAppsExtension]: {} } });
  assert.equal(server.declaredMcpApps(), true);

  const listed = (await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))?.result.tools as Json[];
  for (const tool of listed) {
    if (tool.name === cardRevisionTool) { assert.deepEqual(tool._meta, { ui: { resourceUri: 'ui://unfold/work-item', visibility: ['app'] } }); continue; }
    if (!viewed.includes(tool.name)) { assert.equal(tool._meta, undefined, tool.name); continue; }
    const uri = tool.name === 'unfold_now' ? 'ui://unfold/now' : 'ui://unfold/work-item';
    assert.deepEqual(tool._meta, { ui: { resourceUri: uri, visibility: ['model', 'app'] }, 'ui/resourceUri': uri }, tool.name);
  }

  const resources = (await server.handle({ jsonrpc: '2.0', id: 2, method: 'resources/list' }))?.result.resources as Json[];
  assert.deepEqual(resources.map(entry => [entry.uri, entry.mimeType]), [['ui://unfold/work-item', mcpAppMimeType], ['ui://unfold/now', mcpAppMimeType]]);
  for (const entry of resources) {
    const read = await server.handle({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: entry.uri } });
    const [content] = read?.result.contents;
    assert.equal(content.uri, entry.uri);
    assert.equal(content.mimeType, mcpAppMimeType);
    assert.deepEqual(content._meta.ui.csp, {}, 'the view asks the host for no domain at all');
    assert.match(content.text, /^<!doctype html>\n<html lang="en" data-view="(work-item|now)">/);
    assert.match(content.text, new RegExp(`data-view="${entry.uri === 'ui://unfold/now' ? 'now' : 'work-item'}"`));
    assert.match(content.text, /--baken: #D23A4E;/, 'the view carries the Unfold brand tokens');
  }
  const missing = await server.handle({ jsonrpc: '2.0', id: 4, method: 'resources/read', params: { uri: 'ui://unfold/other' } });
  assert.equal(missing?.error.code, -32002);
});

test('the view HTML is self-contained, names no external URL, and carries a strict Content Security Policy', async () => {
  const server = createMcpServer({ url: 'http://127.0.0.1:9' });
  await server.handle(initialize(ui));
  for (const uri of ['ui://unfold/work-item', 'ui://unfold/now']) {
    const html = (await server.handle({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri } }))?.result.contents[0].text as string;
    assert.deepEqual(externalReferences(html), [], uri);
    assert.equal(html.match(/<script\b/g)?.length, 1, 'one inline script');
    assert.doesNotMatch(html.slice(html.indexOf('<script'), html.lastIndexOf('</script>')), /<\/script/i, 'the inline script cannot close itself early');
    const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)?.[1];
    assert.equal(policy, mcpAppPolicy);
    const directives = new Map(policy!.split(';').map(part => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
    for (const name of ['default-src', 'connect-src', 'frame-src', 'object-src', 'base-uri', 'form-action', 'font-src']) assert.deepEqual(directives.get(name), ["'none'"], name);
    for (const values of directives.values()) assert(values.every(value => /^'[a-z-]+'$|^data:$/.test(value)), `no host source in ${values.join(' ')}`);
  }
});

test('a client without MCP Apps gets answers byte-identical to one that never heard of it', async t => {
  const demo = await application(); t.after(() => demo.close());
  const without = [{}, { extensions: {} }, { extensions: { [mcpAppsExtension]: {} } }, { extensions: { [mcpAppsExtension]: { mimeTypes: ['text/html'] } } }, { extensions: { 'io.example/other': { mimeTypes: [mcpAppMimeType] } } }];
  const transcript = async (capabilities: Json, apps = capabilities === ui) => {
    const server = createMcpServer({ url: demo.url, version: 'test' });
    const answers = [
      await server.handle(initialize(capabilities)),
      await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      await server.handle({ jsonrpc: '2.0', id: 2, method: 'resources/list' }),
      await server.handle({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'ui://unfold/work-item' } }),
      await server.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'unfold_now', arguments: {} } }),
      await server.handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'unfold_get_work', arguments: { id: '101' } } }),
    ];
    assert.equal(server.declaredMcpApps(), apps);
    return answers.map(answer => JSON.stringify(answer));
  };
  const plain = await transcript({});
  assert.equal(JSON.parse(plain[0]).result.capabilities.tools.listChanged, false);
  assert.deepEqual(Object.keys(JSON.parse(plain[0]).result.capabilities), ['tools'], 'no resources capability and no extensions');
  assert.equal(plain[1].includes('_meta'), false, 'no tool carries _meta');
  assert.equal(plain[2], JSON.stringify({ jsonrpc: '2.0', id: 2, error: { code: -32601, message: 'Method resources/list is not supported.' } }));
  assert.equal(plain[3], JSON.stringify({ jsonrpc: '2.0', id: 3, error: { code: -32601, message: 'Method resources/read is not supported.' } }));
  for (const capabilities of without) assert.deepEqual(await transcript(capabilities), plain, JSON.stringify(capabilities));
  const capable = await transcript(ui);
  assert.deepEqual(capable.slice(4), plain.slice(4), 'tool results are the same for every client; only tools/list names the view');

  const modern = createMcpServer({ url: demo.url, version: 'test' });
  const ask = async (method: string, capabilities: Json, params: Json = {}) => JSON.stringify(await modern.handle({ jsonrpc: '2.0', id: 9, method, params: { ...params, _meta: modernMeta(capabilities) } }));
  for (const method of ['server/discover', 'tools/list', 'resources/list']) {
    const answers = await Promise.all(without.map(capabilities => ask(method, { elicitation: {}, ...capabilities })));
    assert(answers.every(answer => answer === answers[0]), method);
  }
  assert.deepEqual(JSON.parse(await ask('server/discover', {})).result.capabilities, { tools: {} });
  assert.equal(JSON.parse(await ask('resources/read', {}, { uri: 'ui://unfold/now' })).error.code, -32601);
});

test('over 2026-07-28 MCP Apps is negotiated per request, in server/discover and tools/list', async () => {
  const server = createMcpServer({ url: 'http://127.0.0.1:9', version: 'test' });
  const send = async (id: number, method: string, capabilities: Json, params: Json = {}) => (await server.handle({ jsonrpc: '2.0', id, method, params: { ...params, _meta: modernMeta(capabilities) } }))!;
  const discovered = await send(1, 'server/discover', ui);
  assert.deepEqual(discovered.result.capabilities, { tools: {}, resources: {}, extensions: { [mcpAppsExtension]: {} } });
  assert.equal(discovered.result.cacheScope, 'public');

  const withUi = (await send(2, 'tools/list', ui)).result.tools as Json[];
  const withoutUi = (await send(3, 'tools/list', {})).result.tools as Json[];
  assert.equal(withUi.find(tool => tool.name === 'unfold_get_work')?._meta.ui.resourceUri, 'ui://unfold/work-item');
  assert(withoutUi.every(tool => tool._meta === undefined), 'the next request without the extension gets no view');

  const read = (await send(4, 'resources/read', ui, { uri: 'ui://unfold/now' })).result;
  assert.equal(read.resultType, 'complete');
  assert.equal(read.cacheScope, 'public');
  assert.equal(typeof read.ttlMs, 'number');
  assert.equal(read.contents[0].mimeType, mcpAppMimeType);
  assert.equal((await send(5, 'resources/read', ui, { uri: 'ui://elsewhere/x' })).error.code, -32602, '2026-07-28 reports a missing resource as -32602');
  assert.equal((await send(6, 'resources/list', ui)).result.resources.length, 2);
});

function bridgedHost() {
  const sent: Json[] = [];
  let deliver: (message: Json) => void = () => {};
  const bridge = view.createBridge({ post: (message: Json) => sent.push(message), listen: (receive: (message: Json) => void) => { deliver = receive; } });
  return { bridge, sent, reply: (id: unknown, result: Json) => deliver({ jsonrpc: '2.0', id, result }), deliver: (message: Json) => deliver(message) };
}

test('an Ask from the view that would spend still asks the person to confirm, and the view never confirms itself', async t => {
  const unfold = askingUnfold(t);
  const url = await unfold.ready;
  const server = createMcpServer({ url, token: `vle_${'v'.repeat(43)}`, principal: 'person' });
  const host = bridgedHost();
  const forward = async (capabilities: Json) => {
    const message = host.sent.at(-1)!;
    assert.equal(message.method, 'tools/call');
    assert.deepEqual(Object.keys(message.params), ['name', 'arguments'], 'the view sends only the tool and its arguments');
    const answer = await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { ...message.params, _meta: modernMeta(capabilities) } });
    host.reply(message.id, answer!.result);
    return answer!.result;
  };

  const free = view.callTool(host.bridge, 'unfold_ask', { id: '184', question: 'Is Firefox affected?' });
  await forward({ ...ui, elicitation: {} });
  const needsModel = await free;
  assert.equal(needsModel.done, true);
  assert.equal(needsModel.structured.needsModel, true);
  assert.equal(view.confirmsFirst('unfold_ask'), true);

  const spend = view.callTool(host.bridge, 'unfold_ask', { id: '184', question: 'Is Firefox affected?', use_model: true });
  const pending = await forward({ ...ui, elicitation: {} });
  assert.equal(pending.resultType, 'input_required');
  assert.match(pending.inputRequests.confirm_spend.params.message, /^Ask a model about Work Item 184\? One answer spends up to \$0\.02/);
  assert.deepEqual(await spend, { done: false, unconfirmed: true, text: 'Your AI client did not show you the confirmation, so nothing changed and nothing was spent.' }, 'an unanswered confirmation handed to the view is not done');
  assert.equal(unfold.posted.some(body => body.askModel === true), false, 'nothing is spent before the person accepts');

  const refused = view.callTool(host.bridge, 'unfold_ask', { id: '184', question: 'Is Firefox affected?', use_model: true });
  await forward(ui);
  const answer = await refused;
  assert.equal(answer.error, true);
  assert.match(answer.text, /cannot ask you to confirm a spend, so no model was asked/, 'a host that cannot elicit is refused, never let through');

  const legacy = createMcpServer({ url, token: `vle_${'w'.repeat(43)}` });
  const elicited: Json[] = [];
  legacy.connect(async (method, params) => { elicited.push({ method, params }); return { action: 'decline' }; });
  await legacy.handle(initialize({ ...ui, elicitation: {} }));
  const stdio = view.callTool(host.bridge, 'unfold_ask', { id: '184', question: 'Is Firefox affected?', use_model: true });
  const message = host.sent.at(-1)!;
  host.reply(message.id, (await legacy.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: message.params }))!.result);
  assert.equal((await stdio).structured.summary, 'Not asked: the spend was not confirmed. Nothing was spent.');
  assert.equal(elicited[0]?.method, 'elicitation/create', 'over stdio the server asks the host to confirm');
  assert.equal(unfold.posted.some(body => body.askModel === true), false);
});

test('approving from the view goes through the same confirmation as the tool', async t => {
  const demo = await application(); t.after(() => demo.close());
  const server = createMcpServer({ url: demo.url, version: 'test', principal: 'person' });
  const host = bridgedHost();
  const approving = view.callTool(host.bridge, 'unfold_approve_work', { id: '106' });
  const message = host.sent.at(-1)!;
  const answer = await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { ...message.params, _meta: modernMeta({ ...ui, elicitation: {} }) } });
  host.reply(message.id, answer!.result);
  assert.equal(answer!.result.resultType, 'input_required', JSON.stringify(answer));
  assert.match(answer!.result.inputRequests.confirm_action.params.message, /Approve Work Item 106 /);
  const outcome = await approving;
  assert.equal(outcome.done, false, 'one click from the view never approves');
  assert.equal(outcome.unconfirmed, true);
});

function fakeDocument() {
  type Node = Json;
  const make = (tag: string): Node => ({
    tag, children: [] as Node[], attributes: {} as Json, listeners: {} as Json, style: {} as Json, className: '',
    setAttribute(name: string, value: string) { this.attributes[name] = value; },
    addEventListener(type: string, listener: unknown) { this.listeners[type] = listener; },
    append(...nodes: Node[]) { this.children.push(...nodes); },
    prepend(...nodes: Node[]) { this.children.unshift(...nodes); },
    replaceChildren(...nodes: Node[]) { this.children = nodes; },
    get firstChild() { return this.children[0]; },
  });
  return { createElement: make, createTextNode: (text: string) => ({ tag: '#text', text }), root: make('main') };
}

function walk(node: Json, visit: (node: Json) => void) { visit(node); for (const child of node.children ?? []) walk(child, visit); }
function textOf(node: Json): string { return node.tag === '#text' ? node.text : (node.children ?? []).map(textOf).join(''); }

test('the Work Item card shows state, reason, pull request, Runs and spend against budget, and keeps untrusted text as text', () => {
  const doc = fakeDocument();
  const opened: string[] = [];
  const data = {
    summary: 'Work Item 7 is needs_human: …', ploegSaid: 'Round cap reached', reason: { chip: 'Out of budget', sentence: 'The Round spent its cap.', action: 'Raise the budget or retry.' },
    item: { id: '7', state: 'needs_human', team: 'delivery', link: 'https://unfold.example/#work/7', pullRequestUrl: 'https://forge.example/pr/3', taskUrl: 'javascript:alert(1)', waitsOnQuestion: true, untrusted: { title: 'x' } },
    shifts: [{ spentUsd: 0.5, budgetUsd: 2 }, { spentUsd: 1.234, budgetUsd: 1.5 }],
    runs: [{ id: '1', role: 'implementer', round: 1, outcome: 'finished', costUsd: 0.004 }, { id: '2', role: 'reviewer', round: 1, verdict: 'request_changes', costUsd: 1234.5 }],
    untrusted: { title: '<img src=x onerror=alert(1)>', question: 'Must it be <b>422</b>?' },
  };
  const model = view.renderWorkItem(doc, doc.root, data, { open: (url: string) => opened.push(url), act: async () => {} });
  const tags: string[] = [];
  walk(doc.root, node => tags.push(node.tag));
  assert(!tags.includes('img') && !tags.includes('b'), 'markup in untrusted text never becomes an element');
  const text = textOf(doc.root);
  assert(text.includes('<img src=x onerror=alert(1)>') && text.includes('Must it be <b>422</b>?'));
  for (const expected of ['Needs you', 'Out of budget', 'Raise the budget or retry.', 'Round cap reached', 'Open in Unfold', 'Pull request', 'reviewer', 'request changes']) assert(text.includes(expected), expected);
  assert.match(text, /US\$\s1,73/, 'total spend in nl-NL with two decimals');
  assert.match(text, /US\$\s1,23 of US\$\s1,50/, 'the latest Shift against its budget');
  assert.match(text, /US\$\s1\.234,50/);
  assert.match(text, /< US\$\s0,01/);
  assert.equal(text.includes('Tracker task'), false, 'a javascript: link is never offered');
  assert.deepEqual(model.actions, ['ask', 'answer']);
  const links: Json[] = [];
  walk(doc.root, node => { if (node.tag === 'a') links.push(node); });
  links[0].listeners.click({ preventDefault() {} });
  assert.deepEqual(opened, ['https://unfold.example/#work/7']);
  assert.equal(view.safeLink('//evil.example'), null);
  assert.equal(view.money(null), 'Not reported');
});

test('the Now list shows what waits with its reason and links, and opens a card on demand', () => {
  const doc = fakeDocument();
  const shown: string[] = [];
  const model = view.renderNow(doc, doc.root, { summary: '1 need a decision', demo: false, waiting: [{ id: '9', state: 'proposed', team: 'delivery', link: 'https://unfold.example/#work/9', spentUsd: 0, reason: { chip: 'Approve or reject', action: 'Approve or reject it in Unfold.' }, untrusted: { title: 'Fix login' } }], running: [{}], yourSessions: [] }, { open() {}, show: (id: string) => shown.push(id) });
  assert.equal(model.waiting[0].label, 'Proposed');
  assert.match(textOf(doc.root), /Fix login.*Approve or reject · Approve or reject it in Unfold\..*US\$\s0,00.*Open in Unfold/);
  let title: Json | undefined;
  walk(doc.root, node => { if (node.className === 'item-title') title = node; });
  title!.listeners.click();
  assert.deepEqual(shown, ['9']);
  assert.deepEqual(view.workItemModel({ item: { state: 'proposed' } }).actions, ['ask', 'approve']);
  assert.deepEqual(view.workItemModel({ item: { state: 'active' } }).actions, ['ask', 'note']);
});

test('the view answers host requests and ignores replies it did not ask for', async () => {
  const host = bridgedHost();
  host.bridge.onRequest('ui/resource-teardown', () => ({}));
  host.deliver({ jsonrpc: '2.0', id: 'h1', method: 'ui/resource-teardown', params: { reason: 'closed' } });
  host.deliver({ jsonrpc: '2.0', id: 'h2', method: 'sampling/createMessage', params: {} });
  host.deliver({ jsonrpc: '2.0', id: 'unknown', result: {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(host.sent, [{ jsonrpc: '2.0', id: 'h2', error: { code: -32601, message: 'Method sampling/createMessage is not supported.' } }, { jsonrpc: '2.0', id: 'h1', result: {} }]);
});

test('the card revision tool is offered only to MCP Apps views, hidden from the model, and answers the revision unfold_get_work carries', async t => {
  const demo = await application(); t.after(() => demo.close());
  const server = createMcpServer({ url: demo.url, version: 'test' });
  await server.handle(initialize(ui));
  const listed = (await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))?.result.tools as Json[];
  const tool = listed.find(entry => entry.name === cardRevisionTool)!;
  assert.deepEqual(tool._meta.ui.visibility, ['app'], 'a host keeps it out of the model tool list');
  assert.equal(tool.annotations.readOnlyHint, true);

  const call = async (name: string, id: string) => (await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: { id } } }))!.result;
  const work = (await call('unfold_get_work', '101')).structuredContent;
  assert.match(work.revision, /^[\w-]{22}$/);
  assert.equal(work.revision, workRevision(work));
  assert.equal(typeof work.updatedAt, 'string');
  const first = await call(cardRevisionTool, '101');
  const second = await call(cardRevisionTool, '101');
  assert.equal(first.isError, undefined);
  assert.deepEqual(first.structuredContent, second.structuredContent, 'an unchanged Work Item answers the same revision');
  const summary = first.structuredContent;
  assert.equal(summary.revision, work.revision);
  assert.deepEqual(summary, cardRevision(work));
  assert.equal(summary.id, '101');
  assert.equal(summary.state, 'needs_human');
  assert.equal(summary.terminal, false);
  assert.equal(summary.demo, true);
  assert.equal(summary.lastUpdated, work.updatedAt);
  assert.equal(typeof summary.reason.chip, 'string');
  assert.equal(JSON.stringify(summary).length < 1200, true, 'the answer stays small');
  assert.notEqual((await call(cardRevisionTool, '106')).structuredContent.revision, summary.revision);

  const plain = createMcpServer({ url: demo.url, version: 'test' });
  await plain.handle(initialize({}));
  const plainTools = (await plain.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))?.result.tools as Json[];
  assert.equal(plainTools.some(entry => entry.name === cardRevisionTool), false);
  const refused = await plain.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: cardRevisionTool, arguments: { id: '101' } } });
  assert.equal(refused?.error.code, -32602, 'a client without MCP Apps cannot call it');
});

test('the card revision tool reads through the same authorized path as unfold_get_work and fails the same way', async () => {
  const seen: { url: string; authorization: string | null }[] = [];
  const detail = { item: { id: '7', state: 'done', title: 'Ship it', team: 'delivery', updatedAt: '2026-10-30T10:00:00Z', pullRequestUrl: 'https://forge.example/pr/3' }, shifts: [{ id: '1', round: 1, budgetUsd: 2, spentUsd: 0.4567 }], runs: [{ id: '1', role: 'implementer', round: 1, state: 'finished', outcome: 'finished', usage: { costUsd: 0.45 } }], events: [] };
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, authorization: new Headers(init?.headers).get('authorization') });
    if (url.endsWith('/work-items/8')) return new Response(JSON.stringify({ error: { code: 'forbidden', message: 'no' } }), { status: 403 });
    if (url.endsWith('/work-items/9')) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(detail), { status: 200 });
  }) as typeof fetch;
  const token = `vle_${'r'.repeat(43)}`;
  const server = createMcpServer({ url: 'https://unfold.example', token, fetch: fetcher });
  const call = async (name: string, id: string) => (await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { id }, _meta: modernMeta(ui) } }))!.result;

  const summary = (await call(cardRevisionTool, 'https://unfold.example/#work/7')).structuredContent;
  assert.deepEqual(seen.at(-1), { url: 'https://unfold.example/api/ploeg/work-items/7', authorization: `Bearer ${token}` });
  assert.equal(summary.terminal, true);
  assert.equal(summary.pullRequestUrl, 'https://forge.example/pr/3');
  assert.deepEqual(summary.spend, { spentUsd: 0.46, latestShiftUsd: 0.46, budgetUsd: 2 });
  assert.deepEqual(summary.runs, { shown: 1, running: 0, latest: { role: 'implementer', round: 1, result: 'finished' } });
  assert.equal(summary.lastUpdated, '2026-10-30T10:00:00Z');

  for (const id of ['8', '9']) {
    const viaCard = await call(cardRevisionTool, id);
    const viaModel = await call('unfold_get_work', id);
    assert.equal(viaCard.isError, true, id);
    assert.deepEqual(viaCard.content, viaModel.content, `${id}: the same refusal as unfold_get_work`);
  }
});

function fakeClock() {
  let time = 0;
  let next = 0;
  const timers = new Map<number, { at: number; fire: () => void }>();
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return {
    now: () => time,
    setTimer: (fire: () => void, ms: number) => { timers.set(++next, { at: time + ms, fire }); return next; },
    clearTimer: (id: number) => { timers.delete(id); },
    pending: () => timers.size,
    async advance(ms: number) {
      const end = time + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        time = due[1].at;
        due[1].fire();
        await flush();
      }
      time = end;
      await flush();
    },
  };
}

test('the card polls every 20 seconds while visible, pauses offscreen or hidden, and catches up when shown again', async () => {
  const clock = fakeClock();
  let checks = 0;
  const poller = view.createPoller({ check: async () => { checks += 1; return 'continue'; }, ...clock });
  assert.equal(view.pollEveryMs, 20_000);
  await clock.advance(19_999);
  assert.equal(checks, 0);
  await clock.advance(1);
  assert.equal(checks, 1);
  await clock.advance(20_000);
  assert.equal(checks, 2);

  poller.setVisible('screen', false);
  assert.equal(clock.pending(), 0, 'nothing is scheduled while the card is scrolled away');
  await clock.advance(120_000);
  assert.equal(checks, 2);
  poller.setVisible('screen', true);
  await clock.advance(0);
  assert.equal(checks, 3, 'a check that fell due while offscreen runs at once');

  poller.setVisible('page', false);
  await clock.advance(60_000);
  assert.equal(checks, 3, 'nothing runs while the document is hidden');
  poller.setVisible('screen', false);
  poller.setVisible('page', true);
  await clock.advance(60_000);
  assert.equal(checks, 3, 'both must be visible');
  poller.setVisible('screen', true);
  await clock.advance(0);
  assert.equal(checks, 4);

  poller.stop();
  await clock.advance(100_000);
  assert.equal(checks, 4);
  assert.equal(poller.state.stopped, true);
});

test('the card backs off on errors up to five minutes and stops for good once the check says stop', async () => {
  const clock = fakeClock();
  const at: number[] = [];
  let fail = true;
  const poller = view.createPoller({ check: async () => { at.push(clock.now()); if (fail) throw new Error('host refused'); return 'continue'; }, ...clock });
  await clock.advance(20_000 + 40_000 + 80_000 + 160_000 + 300_000 + 300_000);
  assert.deepEqual(at, [20_000, 60_000, 140_000, 300_000, 600_000, 900_000], 'waits double after each error, at most five minutes');
  assert.equal(poller.state.failures, 6);
  fail = false;
  await clock.advance(300_000);
  assert.equal(poller.state.failures, 0);
  await clock.advance(20_000);
  assert.deepEqual(at.slice(-2), [1_200_000, 1_220_000], 'one success brings back the normal pace');

  let calls = 0;
  const own = fakeClock();
  const ended = view.createPoller({ check: async () => { calls += 1; return 'stop'; }, ...own });
  await own.advance(200_000);
  assert.equal(calls, 1);
  assert.equal(ended.state.stopped, true);
  assert.equal(own.pending(), 0);
});

test('a check re-renders the card only when the revision changes, announces a new state, and stops on a final one', async () => {
  const calls: { name: string; args: Json }[] = [];
  const answers: Record<string, Json> = {};
  const call = async (name: string, args: Json) => { calls.push({ name, args }); return { done: true, structured: answers[name] }; };
  const rendered: Json[] = [];
  const announced: string[] = [];
  let busy = false;
  const card = { id: '7', state: 'active', label: 'Running', revision: 'r1' };
  const check = view.revisionCheck(card, { call, refresh: (data: Json) => { rendered.push(data); return view.workItemModel(data); }, announce: (text: string) => announced.push(text), busy: () => busy });

  answers[cardRevisionTool] = { revision: 'r1', state: 'active', terminal: false };
  assert.equal(await check(), 'continue');
  assert.equal(await check(), 'continue');
  assert.deepEqual(calls.map(entry => entry.name), [cardRevisionTool, cardRevisionTool]);
  assert.deepEqual(calls[0].args, { id: '7' });
  assert.equal(rendered.length, 0, 'an unchanged revision never re-renders');

  answers[cardRevisionTool] = { revision: 'r2', state: 'active', terminal: false };
  answers.unfold_get_work = { item: { id: '7', state: 'active' }, revision: 'r2' };
  assert.equal(await check(), 'continue');
  assert.equal(rendered.length, 1);
  assert.equal(card.revision, 'r2');
  assert.deepEqual(announced, [], 'the same state is not announced again');

  busy = true;
  answers[cardRevisionTool] = { revision: 'r3', state: 'awaiting_review', terminal: false };
  assert.equal(await check(), 'continue');
  assert.equal(rendered.length, 1, 'no re-render while an action waits for the person');
  busy = false;

  answers.unfold_get_work = { item: { id: '7', state: 'awaiting_review' }, revision: 'r3' };
  assert.equal(await check(), 'continue');
  assert.deepEqual(announced, ['Work Item 7 is now Ready for review.']);

  answers[cardRevisionTool] = { revision: 'r4', state: 'done', terminal: true };
  answers.unfold_get_work = { item: { id: '7', state: 'done' }, revision: 'r4' };
  assert.equal(await check(), 'stop');
  assert.equal(announced.at(-1), 'Work Item 7 is now Done.');
  const before = calls.length;
  assert.equal(await check(), 'stop');
  assert.equal(calls.length, before, 'a final Work Item is not asked again');

  const failing = view.revisionCheck({ id: '8', state: 'active', label: 'Running', revision: 'x' }, { call: async () => ({ done: false, error: true, text: 'Not found, or outside the Teams your Unfold user may read.' }), refresh: () => { throw new Error('never'); }, announce() {} });
  await assert.rejects(failing(), /Not found/, 'an error reaches the poller, which backs off');
  assert.equal(view.isTerminal('withdrawn'), true);
});

test('the view announces changes in a polite live region outside the card, and the card itself is not live', async () => {
  const server = createMcpServer({ url: 'http://127.0.0.1:9' });
  await server.handle(initialize(ui));
  const html = (await server.handle({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: 'ui://unfold/work-item' } }))?.result.contents[0].text as string;
  assert.match(html, /<main id="unfold-app">/);
  assert.match(html, /<p id="unfold-announce" class="visually-hidden" role="status" aria-live="polite"><\/p>/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(html, /text-overflow:\s*ellipsis/);
});
