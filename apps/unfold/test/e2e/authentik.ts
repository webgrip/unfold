import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import type { Page } from 'playwright';

const run = promisify(execFile);
const defaultFlows = ['default-provider-authorization-implicit-consent', 'default-provider-invalidation-flow', 'default-authentication-flow'];
const managedScopes = ['openid', 'profile', 'email', 'offline_access'];
const composeFile = fileURLToPath(new URL('./authentik.compose.yaml', import.meta.url));

/** Removes every Authentik this process started, including one that never became ready. */
export const cleanups: (() => Promise<void>)[] = [];

/** A person in the test Authentik, with the password the login page takes. */
export type Person = { username: string; password: string; pk: number; uid: string };

/** One running Authentik and the bootstrap API token that administers it. */
export type Authentik = {
  url: string;
  api(method: string, path: string, body?: unknown): Promise<any>;
  close(): Promise<void>;
};

/**
 * Starts a throwaway Authentik with Docker Compose, or adopts the one `UNFOLD_E2E_AUTHENTIK_URL` and
 * `UNFOLD_E2E_AUTHENTIK_TOKEN` name. Every run provisions its own slugs, so an adopted instance can be reused.
 */
export async function startAuthentik(log: (line: string) => void): Promise<Authentik> {
  const adopted = process.env.UNFOLD_E2E_AUTHENTIK_URL?.replace(/\/+$/, '');
  if (adopted) {
    const token = process.env.UNFOLD_E2E_AUTHENTIK_TOKEN;
    if (!token) throw new Error('UNFOLD_E2E_AUTHENTIK_URL needs UNFOLD_E2E_AUTHENTIK_TOKEN, an API token of an Authentik administrator');
    const authentik = client(adopted, token);
    await ready(authentik, log);
    return authentik;
  }
  const project = `unfold-e2e-${randomBytes(4).toString('hex')}`;
  const token = randomBytes(32).toString('hex');
  const env = { ...process.env, UNFOLD_E2E_AUTHENTIK_SECRET: randomBytes(48).toString('base64url'), UNFOLD_E2E_AUTHENTIK_PASSWORD: randomBytes(18).toString('base64url'), UNFOLD_E2E_AUTHENTIK_TOKEN: token };
  const compose = (...args: string[]) => run('docker', ['compose', '-p', project, '-f', composeFile, ...args], { env, maxBuffer: 16 * 1024 * 1024 });
  log(`starting Authentik as compose project ${project}`);
  await compose('up', '--detach', '--quiet-pull');
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    if (process.env.UNFOLD_E2E_KEEP) { log(`kept compose project ${project}; remove it with: docker compose -p ${project} down -v`); return; }
    await compose('down', '--volumes', '--remove-orphans', '--timeout', '5').catch(error => log(`compose down failed: ${error.message}`));
  };
  cleanups.push(close);
  try {
    const published = (await compose('port', 'server', '9000')).stdout.trim();
    const host = process.env.UNFOLD_E2E_DOCKER_HOST_ADDRESS ?? '127.0.0.1';
    const authentik = { ...client(`http://${host}:${published.split(':').at(-1)}`, token), close };
    await ready(authentik, log);
    return authentik;
  } catch (error) {
    const logs = await compose('logs', '--tail', '80').then(result => result.stdout + result.stderr, () => '');
    await close();
    throw Object.assign(error as Error, { message: `${(error as Error).message}\n${logs}` });
  }
}

function client(url: string, token: string): Authentik {
  return {
    url,
    async api(method, path, body) {
      const response = await fetch(`${url}/api/v3${path}`, { method, headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const text = await response.text();
      if (!response.ok) throw new Error(`Authentik ${method} ${path} answered ${response.status}: ${text.slice(0, 600)}`);
      return text ? JSON.parse(text) : undefined;
    },
    async close() {},
  };
}

async function ready(authentik: Authentik, log: (line: string) => void): Promise<void> {
  const deadline = Date.now() + 240_000;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const health = await fetch(`${authentik.url}/-/health/ready/`, { signal: AbortSignal.timeout(3000) });
      if (health.status === 200) {
        await authentik.api('GET', '/core/users/me/');
        for (const path of [...defaultFlows.map(slug => `/flows/instances/?slug=${slug}`), `/crypto/certificatekeypairs/?name=${encodeURIComponent('authentik Self-signed Certificate')}`, ...managedScopes.map(name => `/propertymappings/provider/scope/?managed=goauthentik.io/providers/oauth2/scope-${name}`)]) {
          if (!(await authentik.api('GET', path)).results.length) throw new Error(`the default blueprints have not applied ${path} yet`);
        }
        log(`Authentik is ready at ${authentik.url}`);
        return;
      }
      last = `health ${health.status}`;
    } catch (error) { last = (error as Error).message; }
    await delay(2000);
  }
  throw new Error(`Authentik did not become ready within four minutes: ${last}`);
}

async function one(authentik: Authentik, path: string): Promise<any> {
  const found = await authentik.api('GET', path);
  if (found.results.length !== 1) throw new Error(`Authentik ${path} matched ${found.results.length} objects`);
  return found.results[0];
}

/** What `provision` set up: two providers on one Authentik, the admitted groups and the people. */
export type Realm = {
  run: string;
  browser: { clientId: string; issuer: string; application: string };
  mcp: { clientId: string; issuer: string; application: string };
  groups: Record<'admins' | 'operators' | 'viewers' | 'staff', { pk: string; name: string }>;
  people: Record<'alice' | 'bob' | 'carol' | 'erin' | 'frank', Person>;
};

/**
 * Provisions what an operator sets up from the how-to: Unfold's own browser provider and a separate public
 * `unfold-mcp` provider with PKCE, refresh tokens, 10-minute access tokens and an `unfold:mcp` scope whose
 * mapping returns the person's groups, both on the default signing key and subject mode, both bound to the
 * admitted groups. `staff` may sign in at Authentik but is in no Unfold role.
 */
export async function provision(authentik: Authentik): Promise<Realm> {
  const run = randomBytes(3).toString('hex');
  const flow = (slug: string) => one(authentik, `/flows/instances/?slug=${slug}`).then(found => found.pk as string);
  const [authorization, invalidation, authentication] = await Promise.all(defaultFlows.map(flow));
  const signingKey = (await one(authentik, `/crypto/certificatekeypairs/?name=${encodeURIComponent('authentik Self-signed Certificate')}`)).pk as string;
  const managed = async (name: string) => (await one(authentik, `/propertymappings/provider/scope/?managed=goauthentik.io/providers/oauth2/scope-${name}`)).pk as string;
  const standard = await Promise.all(managedScopes.map(managed));
  const groupsExpression = 'return {"groups": [group.name for group in request.user.ak_groups.all()]}';
  const groupsScope = (await authentik.api('POST', '/propertymappings/provider/scope/', { name: `e2e-${run} groups`, scope_name: 'groups', expression: groupsExpression })).pk as string;
  const mcpScope = (await authentik.api('POST', '/propertymappings/provider/scope/', { name: `e2e-${run} unfold:mcp`, scope_name: 'unfold:mcp', expression: groupsExpression })).pk as string;

  const groups = {} as Realm['groups'];
  for (const key of ['admins', 'operators', 'viewers', 'staff'] as const) {
    const name = `unfold-${key}-${run}`;
    groups[key] = { pk: (await authentik.api('POST', '/core/groups/', { name })).pk, name };
  }

  const provider = (body: Record<string, unknown>) => authentik.api('POST', '/providers/oauth2/', { authorization_flow: authorization, invalidation_flow: invalidation, authentication_flow: authentication, client_type: 'public', signing_key: signingKey, sub_mode: 'hashed_user_id', issuer_mode: 'per_provider', include_claims_in_id_token: true, ...body });
  const browserProvider = await provider({ name: `unfold-oidc-${run}`, client_id: `unfold-${run}`, grant_types: ['authorization_code'], redirect_uris: [{ matching_mode: 'regex', url: '^http://127\\.0\\.0\\.1:[0-9]+/api/auth/oidc/callback$' }], property_mappings: [...standard, groupsScope] });
  const mcpProvider = await provider({ name: `unfold-mcp-oauth-${run}`, client_id: `unfold-mcp-${run}`, grant_types: ['authorization_code', 'refresh_token'], access_token_validity: 'minutes=10', redirect_uris: [{ matching_mode: 'regex', url: '^http://(localhost|127\\.0\\.0\\.1):[0-9]+/callback$' }], property_mappings: [...standard, mcpScope] });
  const application = async (slug: string, providerPk: number) => {
    const created = await authentik.api('POST', '/core/applications/', { name: slug, slug, provider: providerPk, policy_engine_mode: 'any' });
    for (const [order, group] of Object.values(groups).entries()) await authentik.api('POST', '/policies/bindings/', { target: created.pk, group: group.pk, order, enabled: true, timeout: 30 });
    return slug;
  };
  const browserApplication = await application(`unfold-${run}`, browserProvider.pk);
  const mcpApplication = await application(`unfold-mcp-${run}`, mcpProvider.pk);

  const person = async (key: string, memberOf: (keyof Realm['groups'])[]): Promise<Person> => {
    const username = `${key}-${run}`;
    const password = randomBytes(15).toString('base64url');
    const created = await authentik.api('POST', '/core/users/', { username, name: `${key[0].toUpperCase()}${key.slice(1)} E2E`, email: `${username}@e2e.invalid`, is_active: true, path: 'users', groups: memberOf.map(group => groups[group].pk) });
    await authentik.api('POST', `/core/users/${created.pk}/set_password/`, { password });
    return { username, password, pk: created.pk, uid: created.uid };
  };
  const people = {
    alice: await person('alice', ['operators']),
    bob: await person('bob', ['viewers']),
    carol: await person('carol', []),
    erin: await person('erin', ['admins']),
    frank: await person('frank', ['operators']),
  };
  const issuer = (slug: string) => `${authentik.url}/application/o/${slug}/`;
  return {
    run,
    browser: { clientId: browserProvider.client_id, issuer: issuer(browserApplication), application: browserApplication },
    mcp: { clientId: mcpProvider.client_id, issuer: issuer(mcpApplication), application: mcpApplication },
    groups,
    people,
  };
}

/** Replaces a person's groups in Authentik, as an administrator would in its admin interface. */
export async function setGroups(authentik: Authentik, realm: Realm, person: Person, memberOf: (keyof Realm['groups'])[]): Promise<void> {
  await authentik.api('PATCH', `/core/users/${person.pk}/`, { groups: memberOf.map(group => realm.groups[group].pk) });
}

/** Types a person's username, then their password, into Authentik's default authentication flow. */
export async function submitCredentials(page: Page, person: Person): Promise<void> {
  const proceed = page.getByRole('button', { name: /^(continue|log in|sign in)$/i });
  const identifier = page.locator('input[name="uidField"]');
  await identifier.waitFor({ timeout: 60_000 }).catch(async error => {
    const shown = await page.locator('body').innerText().catch(() => '');
    if (process.env.UNFOLD_E2E_SCREENSHOTS) await page.screenshot({ path: `${process.env.UNFOLD_E2E_SCREENSHOTS}/${person.username}-${Date.now()}.png`, fullPage: true }).catch(() => undefined);
    throw new Error(`Authentik's login page did not appear for ${person.username} at ${page.url()}, showing: ${shown.replace(/\s+/g, ' ').slice(0, 400)}`, { cause: error });
  });
  await identifier.fill(person.username);
  await proceed.click();
  await page.getByText('Not you?').waitFor({ timeout: 15_000 });
  const password = page.locator('input[name="password"]');
  await password.fill(person.password);
  await proceed.click();
}

/**
 * Takes a person through Authentik as they would: the login page when there is no Authentik session yet, the
 * consent page when a client asks for offline access, until the browser has left Authentik for `leaveTo`.
 * Resolves with what the person was shown.
 */
export async function signInAtAuthentik(page: Page, authentik: Authentik, person: Person, leaveTo: RegExp): Promise<{ signedIn: boolean; consented: string[] }> {
  const shown = { signedIn: false, consented: [] as string[] };
  const deadline = Date.now() + 45_000;
  const left = () => { const url = page.url(); return !url.startsWith(authentik.url) && leaveTo.test(url); };
  while (!left()) {
    if (Date.now() > deadline) {
      const text = await page.locator('body').innerText().catch(() => '');
      if (process.env.UNFOLD_E2E_SCREENSHOTS) await page.screenshot({ path: `${process.env.UNFOLD_E2E_SCREENSHOTS}/${person.username}-${Date.now()}.png`, fullPage: true }).catch(() => undefined);
      throw new Error(`${person.username} did not leave Authentik within 45 s. Still at ${page.url()} showing: ${text.replace(/\s+/g, ' ').slice(0, 400)}`);
    }
    if (await page.locator('input[name="uidField"]').isVisible().catch(() => false)) {
      await submitCredentials(page, person);
      shown.signedIn = true;
    } else if (await page.getByText(/You're about to sign into/).isVisible().catch(() => false)) {
      shown.consented.push(...(await page.locator('li').allInnerTexts().catch(() => [])).map(item => item.trim()));
      await page.getByRole('button', { name: /^continue$/i }).click();
      await page.getByText(/You're about to sign into/).waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined);
    } else await page.waitForTimeout(250);
  }
  return shown;
}
