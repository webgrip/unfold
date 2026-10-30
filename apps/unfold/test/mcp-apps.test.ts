import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { application } from './api-support.ts';
import { createMcpServer } from '../src/mcp.ts';
import { mcpAppMimeType, mcpAppPolicy, mcpAppsExtension } from '../src/mcp-apps.ts';
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
