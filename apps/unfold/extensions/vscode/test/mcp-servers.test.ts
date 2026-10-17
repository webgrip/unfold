import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mcpInstallUri, mcpJsonEntry, mcpProviderApi, ploegMcpProviderId, ploegMcpServer, provideServersSetting, type McpProvider } from '../src/mcp-servers.ts';

const listed = { servers: [{ id: 'ploeg', label: 'Ploeg', type: 'http', url: 'https://mcp-ploeg.example.com/mcp', oauth: { clientId: 'ploeg-mcp' } }] };

test('the Ploeg server is discovered from the workbench listing by URL and client id', () => {
  assert.deepEqual(ploegMcpServer(listed), { id: 'ploeg', label: 'Ploeg', type: 'http', url: 'https://mcp-ploeg.example.com/mcp', oauth: { clientId: 'ploeg-mcp' } });
  assert.equal(ploegMcpServer({ servers: [{ ...listed.servers[0], label: '' }] })?.label, 'Ploeg');
  assert.equal(ploegMcpServer({ servers: [{ ...listed.servers[0], url: 'http://127.0.0.1:8090/mcp' }] })?.url, 'http://127.0.0.1:8090/mcp');
});

test('an absent, empty or unknown listing provides no server', () => {
  for (const listing of [undefined, null, {}, { servers: [] }, { servers: 'ploeg' }, { servers: [{ id: 'unfold', type: 'http', url: 'https://unfold.example/mcp', oauth: { clientId: 'x' } }] }]) {
    assert.equal(ploegMcpServer(listing), undefined, JSON.stringify(listing));
  }
});

test('a listing the extension cannot hand to VS Code safely provides no server', () => {
  const variants = [
    { type: 'stdio' },
    { url: 'http://mcp-ploeg.example.com/mcp' },
    { url: 'https://user:secret@mcp-ploeg.example.com/mcp' },
    { url: 'not a url' },
    { oauth: {} },
    { oauth: { clientId: '' } },
  ];
  for (const variant of variants) assert.equal(ploegMcpServer({ servers: [{ ...listed.servers[0], ...variant }] }), undefined, JSON.stringify(variant));
});

test('on an editor without the MCP provider API, nothing is registered', () => {
  assert.equal(mcpProviderApi({}), undefined);
  assert.equal(mcpProviderApi({ lm: {} }), undefined);
  assert.equal(mcpProviderApi({ lm: { registerMcpServerDefinitionProvider: () => ({ dispose() {} }) }, Uri: { parse: (value: string) => value } }), undefined, 'the API without McpHttpServerDefinition, as before 1.101');
  assert.equal(mcpProviderApi({ McpHttpServerDefinition: class {}, Uri: { parse: (value: string) => value } }), undefined, 'the definition without the lm registration');
});

test('on an editor with the API, the provider registers an HTTP definition with a URL and no headers', async () => {
  class McpHttpServerDefinition {
    label: string; uri: unknown; headers?: Record<string, string>;
    constructor(label: string, uri: unknown, headers?: Record<string, string>) { this.label = label; this.uri = uri; this.headers = headers; }
  }
  const registered: Array<{ id: string; provider: McpProvider<McpHttpServerDefinition> }> = [];
  const lm = { registerMcpServerDefinitionProvider(this: unknown, id: string, provider: McpProvider<McpHttpServerDefinition>) { assert.equal(this, lm); registered.push({ id, provider }); return { dispose() {} }; } };
  const api = mcpProviderApi<McpHttpServerDefinition>({ lm, McpHttpServerDefinition, Uri: { parse: (value: string) => ({ parsed: value }) } });
  assert.ok(api);

  api.register('unfold.ploeg', { provideMcpServerDefinitions: async () => [api.http('Ploeg', 'https://mcp-ploeg.example.com/mcp')] });

  assert.equal(registered[0].id, 'unfold.ploeg');
  const [definition] = await registered[0].provider.provideMcpServerDefinitions();
  assert.deepEqual({ ...definition }, { label: 'Ploeg', uri: { parsed: 'https://mcp-ploeg.example.com/mcp' }, headers: undefined });
});

test('the mcp.json entry and VS Code install link carry the pre-registered client and no secret', () => {
  const server = ploegMcpServer(listed)!;
  assert.deepEqual(mcpJsonEntry(server), { ploeg: { type: 'http', url: 'https://mcp-ploeg.example.com/mcp', oauth: { clientId: 'ploeg-mcp' } } });
  const link = mcpInstallUri('vscode-insiders', server);
  assert.match(link, /^vscode-insiders:mcp\/install\?/);
  assert.deepEqual(JSON.parse(decodeURIComponent(link.slice(link.indexOf('?') + 1))), { name: 'ploeg', type: 'http', url: 'https://mcp-ploeg.example.com/mcp', oauth: { clientId: 'ploeg-mcp' } });
});

test('the manifest declares the provider id it registers and a setting that turns it off, and keeps engines at 1.99', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.contributes.mcpServerDefinitionProviders, [{ id: ploegMcpProviderId, label: 'Ploeg' }]);
  assert.equal(manifest.contributes.configuration.properties[`unfold.${provideServersSetting}`].default, true);
  assert.equal(manifest.engines.vscode, '^1.99.0');
  assert.equal(manifest.enabledApiProposals, undefined);
});
