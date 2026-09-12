import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { VloerClient, type Secrets } from '../src/client.ts';
import { linkedAccounts, accountChoices, describeLink, safeHttpUrl, type AccountChoice, type AccountAction } from '../src/accounts.ts';
import type { AccountLink } from '../src/types.ts';

class MemorySecrets implements Secrets {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key); }
  async store(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
}

type Recorded = { picked: string[]; opened: string[]; confirmed: string[]; info: string[] };

function fakeUi(answers: { pick?: AccountAction; confirm?: boolean }, recorded: Recorded) {
  return {
    pick: async (choices: AccountChoice[], title: string) => { recorded.picked.push(`${title} :: ${choices.map(choice => choice.action).join(',')}`); return answers.pick; },
    confirm: async (message: string) => { recorded.confirmed.push(message); return answers.confirm ?? false; },
    open: async (url: string) => { recorded.opened.push(url); },
    info: (message: string) => { recorded.info.push(message); },
  };
}

function fakeClient(links: AccountLink[], url = 'https://gitlab.example/oauth/authorize?client_id=app&state=abc') {
  const calls: string[] = [];
  return { calls, client: { links: async () => { calls.push('links'); return links; }, linkGitlab: async () => { calls.push('link'); return url; }, unlinkGitlab: async () => { calls.push('unlink'); } } };
}

const unlinked: AccountLink = { provider: 'gitlab', host: 'gitlab.example', configured: true, linked: false };
const linked: AccountLink = { provider: 'gitlab', host: 'gitlab.example', configured: true, linked: true, login: 'ryan', webUrl: 'https://gitlab.example/ryan', scopes: ['read_api', 'read_repository'] };

test('choices follow the link state and descriptions match the web workbench wording', () => {
  assert.deepEqual(accountChoices({ provider: 'gitlab', host: 'gitlab.example', configured: false, linked: false }), []);
  assert.deepEqual(accountChoices(unlinked).map(choice => choice.action), ['link', 'paste']);
  assert.deepEqual(accountChoices(linked).map(choice => choice.action), ['unlink', 'open']);
  assert.deepEqual(accountChoices({ ...linked, webUrl: 'javascript:alert(1)' }).map(choice => choice.action), ['unlink']);
  assert.match(describeLink({ provider: 'gitlab', host: 'gitlab.example', configured: false, linked: false }), /links\.gitlab\.clientId/);
  assert.equal(describeLink(linked), 'Linked as ryan · read_api, read_repository');
  assert.match(describeLink(unlinked), /Not linked/);
  assert.equal(safeHttpUrl('https://user:pw@gitlab.example/x'), undefined);
  assert.equal(safeHttpUrl('https://gitlab.example/ryan'), 'https://gitlab.example/ryan');
});

test('linking GitLab opens the authorization URL the workbench returns in the external browser', async () => {
  const recorded: Recorded = { picked: [], opened: [], confirmed: [], info: [] };
  const { client, calls } = fakeClient([unlinked]);
  assert.equal(await linkedAccounts(client, fakeUi({ pick: 'link' }, recorded)), 'link');
  assert.deepEqual(calls, ['links', 'link']);
  assert.deepEqual(recorded.opened, ['https://gitlab.example/oauth/authorize?client_id=app&state=abc']);
  assert.deepEqual(recorded.confirmed, []);
  assert.equal(recorded.picked[0], 'GitLab · gitlab.example · Not linked. Private repositories on this host cannot be cloned until you link. :: link,paste');
  assert.match(recorded.info.at(-1)!, /Approve the De Vloer application/);
});

test('unlinking requires confirmation and then calls the workbench', async () => {
  const declined: Recorded = { picked: [], opened: [], confirmed: [], info: [] };
  const first = fakeClient([linked]);
  assert.equal(await linkedAccounts(first.client, fakeUi({ pick: 'unlink', confirm: false }, declined)), undefined);
  assert.deepEqual(first.calls, ['links']);
  assert.deepEqual(declined.confirmed, ['Unlink GitLab?']);
  const accepted: Recorded = { picked: [], opened: [], confirmed: [], info: [] };
  const second = fakeClient([linked]);
  assert.equal(await linkedAccounts(second.client, fakeUi({ pick: 'unlink', confirm: true }, accepted)), 'unlink');
  assert.deepEqual(second.calls, ['links', 'unlink']);
  assert.match(accepted.info.at(-1)!, /unlinked/);
  const opened: Recorded = { picked: [], opened: [], confirmed: [], info: [] };
  const third = fakeClient([linked]);
  assert.equal(await linkedAccounts(third.client, fakeUi({ pick: 'open' }, opened)), 'open');
  assert.deepEqual(opened.opened, ['https://gitlab.example/ryan']);
});

test('an unconfigured or absent GitLab link is explained without offering actions', async () => {
  const recorded: Recorded = { picked: [], opened: [], confirmed: [], info: [] };
  const { client } = fakeClient([{ provider: 'gitlab', host: 'gitlab.example', configured: false, linked: false }]);
  assert.equal(await linkedAccounts(client, fakeUi({ pick: 'link' }, recorded)), undefined);
  assert.deepEqual(recorded.picked, []);
  assert.match(recorded.info[0], /Not configured/);
  const none: Recorded = { picked: [], opened: [], confirmed: [], info: [] };
  assert.equal(await linkedAccounts(fakeClient([]).client, fakeUi({ pick: 'link' }, none)), undefined);
  assert.match(none.info[0], /no linkable accounts/);
});

test('the client reads links and drives the GitLab link routes with the mutation header', async t => {
  const seen: { method?: string; url?: string; headers?: Record<string, string | string[] | undefined> }[] = [];
  const server = createServer(async (request, response) => {
    for await (const chunk of request) void chunk;
    seen.push({ method: request.method, url: request.url, headers: request.headers });
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'GET') response.end(JSON.stringify({ links: [linked] }));
    else if (request.method === 'POST') response.end(JSON.stringify({ url: 'https://gitlab.example/oauth/authorize?state=abc' }));
    else response.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const secrets = new MemorySecrets();
  const client = new VloerClient(`http://127.0.0.1:${(server.address() as { port: number }).port}`, secrets);
  await secrets.store(client.secretKey, 'vloer=abcdefghijklmnopqrstuvwxyz0123456789ABCDEF');
  assert.deepEqual(await client.links(), [linked]);
  assert.equal(await client.linkGitlab(), 'https://gitlab.example/oauth/authorize?state=abc');
  await client.unlinkGitlab();
  assert.deepEqual(seen.map(item => `${item.method} ${item.url}`), ['GET /api/links', 'POST /api/links/gitlab', 'DELETE /api/links/gitlab']);
  assert.ok(seen.every(item => item.headers!['x-vloer-request'] === '1' && item.headers!.cookie));
});
