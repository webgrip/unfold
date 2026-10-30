import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { Validator } from '@seriousme/openapi-schema-validator';
import { parse } from 'yaml';
import { delegatedRoutes } from '../src/auth.ts';
import { openApiDocument } from '../src/http.ts';
import { application, createSession, request } from './api-support.ts';
import { testTimeout } from './timeframes.ts';

type Operation = { operationId?: string; tags?: string[]; security?: Record<string, string[]>[]; parameters?: Parameter[]; responses?: Record<string, unknown>; 'x-unfold-role'?: string; 'x-unfold-requires'?: string[]; 'x-internal'?: boolean };
type Parameter = { $ref?: string; name: string; in: string; example?: unknown; schema?: { enum?: unknown[]; pattern?: string } };
type PathItem = { parameters?: Parameter[] } & Partial<Record<Method, Operation>>;
type Method = (typeof methods)[number];

const methods = ['get', 'put', 'post', 'delete', 'patch'] as const;
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const text = readFileSync(openApiDocument, 'utf8');
const spec = parse(text) as { paths: Record<string, PathItem>; security: Record<string, string[]>[]; components: { parameters: Record<string, Parameter>; securitySchemes: Record<string, unknown> } };

const routeModules = ['src/http.ts', 'src/take-over.ts', 'src/linked-handoff.ts', 'src/linked-permissions.ts', 'src/linked-conversation.ts', 'src/intake/routes.ts', 'src/billing.ts', 'src/tenant-export-jobs.ts'];
const param = '\u0000';
const wildcard = '\u0001';

function regexLiterals(code: string, start: string): string[] {
  const found: string[] = [];
  for (let at = code.indexOf(start); at !== -1; at = code.indexOf(start, at + 1)) {
    let i = at + 1;
    let inClass = false;
    for (; i < code.length; i++) {
      const c = code[i];
      if (c === '\\') { i++; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) break;
    }
    found.push(code.slice(at + 1, i));
  }
  return found;
}

function expand(pattern: string): string[] {
  let i = 0;
  const product = (left: string[], right: string[]) => left.flatMap(a => right.map(b => a + b));
  const classEnd = (from: number) => { let j = from + 1; for (; pattern[j] !== ']'; j++) if (pattern[j] === '\\') j++; return j; };
  function alternation(): string[] {
    const results: string[] = [];
    let current = [''];
    while (i < pattern.length && pattern[i] !== ')') {
      const c = pattern[i];
      if (c === '|') { i++; results.push(...current); current = ['']; continue; }
      if (c === '^' || c === '$') { i++; continue; }
      let atom: string[];
      if (c === '(') {
        const capturing = !pattern.startsWith('(?:', i);
        i += capturing ? 1 : 3;
        atom = alternation();
        assert.equal(pattern[i], ')', `unbalanced group in ${pattern}`);
        i++;
        if (capturing && atom.every(option => option.includes(param) && !option.includes('/'))) atom = [param];
      } else if (c === '[') { i = classEnd(i) + 1; atom = [param]; }
      else if (c === '\\') { const escaped = pattern[i + 1]; i += 2; atom = /[dDwWsS]/.test(escaped) ? [param] : [escaped]; }
      else if (c === '.') { i++; atom = [wildcard]; }
      else { i++; atom = [c]; }
      let quantifier = '';
      if ('?*+'.includes(pattern[i] ?? 'x')) quantifier = pattern[i++];
      else if (pattern[i] === '{') { const end = pattern.indexOf('}', i); quantifier = pattern.slice(i, end + 1); i = end + 1; }
      if (atom[0] !== wildcard && (quantifier === '?' || quantifier === '*' || quantifier.startsWith('{0,'))) atom = [...atom, ''];
      current = product(current, atom);
    }
    return [...results, ...current];
  }
  return [...new Set(alternation().map(path => path.replaceAll(new RegExp(`${param}+`, 'g'), param)))];
}

type CodeRoute = { origin: string; matches: (path: string) => boolean; templates: string[] };

function codeRoutes(): CodeRoute[] {
  const routes: CodeRoute[] = [];
  for (const module of routeModules) {
    const code = source(module);
    for (const pattern of regexLiterals(code, '/^\\/api\\/')) {
      const compiled = new RegExp(pattern);
      if (!pattern.endsWith('$')) continue;
      routes.push({ origin: `${module} /${pattern}/`, matches: path => compiled.test(path), templates: expand(pattern).filter(path => !path.includes(wildcard)) });
    }
    for (const [, literal] of code.matchAll(/path\s*[!=]==\s*'(\/api\/[^']*)'/g)) routes.push({ origin: `${module} '${literal}'`, matches: path => path === literal, templates: [literal] });
  }
  const http = source('src/http.ts');
  const sessionPattern = /^\/api\/sessions\/([a-zA-Z0-9_-]+)(?:\/(.*))?$/;
  assert(http.includes(String(sessionPattern)), 'http.ts no longer dispatches session actions with the pattern this test knows; update codeRoutes');
  const actions = [...new Set([...http.matchAll(/action === '([^']+)'/g)].map(match => match[1]))];
  assert(actions.length > 20, `expected the session actions in http.ts, found ${actions.length}`);
  for (const action of actions) routes.push({ origin: `src/http.ts session action '${action}'`, matches: path => sessionPattern.exec(path)?.[2] === action, templates: [`/api/sessions/${param}/${action}`] });
  assert(http.includes("action.startsWith('permissions/')"), 'http.ts no longer answers session permissions under permissions/; update codeRoutes');
  routes.push({ origin: "src/http.ts session action 'permissions/'", matches: path => /^permissions\/./.test(sessionPattern.exec(path)?.[2] ?? ''), templates: [`/api/sessions/${param}/permissions/${param}`] });
  const relay = source('src/runtime/relay.ts');
  assert(relay.includes("basePath = '/api/relay/'") && relay.includes('`${this.basePath}pool/claim`'), 'the workspace relay moved; update codeRoutes');
  routes.push({ origin: 'src/runtime/relay.ts pool/claim', matches: path => path === '/api/relay/pool/claim', templates: ['/api/relay/pool/claim'] });
  const [relayPattern] = regexLiterals(relay.slice(relay.indexOf('this.basePath.length).match(')), '/^');
  const relayCompiled = new RegExp(relayPattern);
  routes.push({ origin: `src/runtime/relay.ts /${relayPattern}/`, matches: path => path.startsWith('/api/relay/') && relayCompiled.test(path.slice('/api/relay/'.length)), templates: expand(relayPattern).map(path => `/api/relay/${path}`) });
  const outbound = source('src/outbound/service.ts');
  const [webhookPattern] = regexLiterals(outbound, '/^\\/api\\/admin\\/webhooks');
  assert(webhookPattern && http.includes("path.startsWith('/api/admin/webhooks/')"), 'the webhook routes moved; update codeRoutes');
  const webhookCompiled = new RegExp(webhookPattern);
  routes.push({ origin: `src/outbound/service.ts /${webhookPattern}/`, matches: path => webhookCompiled.test(path), templates: expand(webhookPattern).filter(path => !path.endsWith('/resend') || path.includes('/deliveries/')) });
  const byTemplate = (origin: string, templates: string[]) => {
    for (const template of templates) {
      const compiled = new RegExp(`^${template.replaceAll(param, '[^/]+')}$`);
      routes.push({ origin: `${origin} ${template.replaceAll(param, '{…}')}`, matches: path => compiled.test(path), templates: [template] });
    }
  };
  const notify = source('src/notify/service.ts');
  const channels = source('src/notify/channels.ts');
  assert(notify.includes("path.slice('/api/me/notifications'.length)") && notify.includes("rest[0] === 'test'") && notify.includes("rest[0] === 'channels'"), 'src/notify/service.ts no longer routes /api/me/notifications by the path parts this test knows; update codeRoutes');
  assert(channels.includes("readonly id = 'ntfy'") && channels.includes("rest.join('/') !== 'topic'") && channels.includes("readonly id = 'web-push'") && channels.includes("rest[0] !== 'subscriptions' || rest.length > 2"), 'the notification channels changed their routes; update codeRoutes');
  byTemplate('src/notify', ['/api/me/notifications/test', '/api/me/notifications/channels/ntfy/topic', '/api/me/notifications/channels/web-push/subscriptions', `/api/me/notifications/channels/web-push/subscriptions/${param}`]);
  const slack = source('src/notify/slack.ts');
  const teams = source('src/notify/teams.ts');
  assert(slack.includes("readonly id = 'slack'") && slack.includes("rest.join('/') !== 'link'") && slack.includes("request.rest.join('/') !== 'interactions'") && teams.includes("readonly id = 'teams'") && teams.includes("rest[0] !== 'webhooks' || rest.length > 2"), 'the Slack or Teams channel changed its routes; update codeRoutes');
  assert(http.includes('notifications.handlesPublic(path)') && notify.includes("const publicPrefix = '/api/notifications/channels/'"), 'the public channel routes moved; update codeRoutes');
  byTemplate('src/notify', ['/api/me/notifications/channels/slack/link', '/api/me/notifications/channels/teams/webhooks', `/api/me/notifications/channels/teams/webhooks/${param}`, '/api/notifications/channels/slack/interactions']);
  const intake = source('src/intake/routes.ts');
  assert(http.includes("path.startsWith('/api/intake/') && await intakeRoute(") && intake.includes("['templates', 'sources', 'requests'].includes(parts[0]") && intake.includes("parts[2] === 'secret'"), 'src/intake/routes.ts no longer routes by the path parts this test knows; update codeRoutes');
  byTemplate('src/intake/routes.ts', [`/api/intake/${param}`, '/api/intake/templates', '/api/intake/sources', `/api/intake/sources/${param}`, `/api/intake/sources/${param}/secret`, '/api/intake/requests', `/api/intake/requests/${param}`]);
  return routes;
}

function parameters(path: string, method: Method): Parameter[] {
  const resolve = (item: Parameter) => item.$ref ? spec.components.parameters[item.$ref.split('/').pop()!] : item;
  return [...(spec.paths[path].parameters ?? []), ...(spec.paths[path][method]?.parameters ?? [])].map(resolve);
}

function pathParameter(path: string, name: string): Parameter {
  const method = methods.find(candidate => spec.paths[path][candidate])!;
  const found = parameters(path, method).find(item => item.in === 'path' && item.name === name);
  assert(found, `${path} declares no path parameter ${name}`);
  return found;
}

function specPattern(path: string): RegExp {
  const body = path.replace(/\{([^}]+)\}/g, (_, name) => {
    const values = pathParameter(path, name).schema?.enum;
    return values ? `(?:${values.map(String).join('|')})` : 'PARAM_X';
  });
  return new RegExp(`^${body}$`);
}

function samples(path: string, overrides: Record<string, string> = {}): string[] {
  let paths = [path];
  for (const [, name] of path.matchAll(/\{([^}]+)\}/g)) {
    const declared = pathParameter(path, name);
    const values = overrides[name] !== undefined ? [overrides[name]] : declared.schema?.enum?.map(String) ?? (declared.example !== undefined ? [String(declared.example)] : []);
    assert(values.length, `${path}: path parameter ${name} needs an example or an enum`);
    paths = paths.flatMap(item => values.map(value => item.replace(`{${name}}`, value)));
  }
  return paths;
}

const operations = () => Object.entries(spec.paths).flatMap(([path, item]) => methods.filter(method => item[method]).map(method => ({ path, method, operation: item[method]! })));

test('the OpenAPI description is a valid OpenAPI 3.1 document whose references resolve', async () => {
  const validator = new Validator();
  const external = [...new Set([...text.matchAll(/\$ref: '([^#'][^'#]*)/g)].map(match => match[1]))];
  assert(external.includes('card-theme.v1.schema.json'), 'the card theme body reuses the published card theme schema');
  for (const file of external) await validator.addSpecRef(JSON.parse(readFileSync(new URL(file, openApiDocument), 'utf8')), file);
  const result = await validator.validate(structuredClone(spec));
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.equal(validator.version, '3.1');
  const unresolved: string[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === '$ref' && typeof item === 'string') {
        if (item.startsWith('#/')) {
          let target: any = spec;
          for (const part of item.slice(2).split('/')) target = target?.[part.replaceAll('~1', '/').replaceAll('~0', '~')];
          if (target === undefined) unresolved.push(item);
        } else {
          const file = new URL(item.split('#')[0], openApiDocument);
          if (!existsSync(file)) unresolved.push(item);
          else JSON.parse(readFileSync(file, 'utf8'));
        }
      } else visit(item);
    }
  };
  visit(spec);
  assert.deepEqual(unresolved, []);
});

test('every route http.ts serves under /api/ is in the OpenAPI description, and every path in it is served', () => {
  const routes = codeRoutes();
  const patterns = Object.keys(spec.paths).map(path => ({ path, pattern: specPattern(path) }));
  const missing = routes.flatMap(route => route.templates.filter(template => !patterns.some(({ pattern }) => pattern.test(template.replaceAll(param, 'PARAM_X')))).map(template => `${template.replaceAll(param, '{…}')}  (from ${route.origin})`));
  assert.deepEqual(missing, [], `routes in the code but not in docs/contracts/openapi.yaml:\n${missing.join('\n')}`);
  const templates = routes.flatMap(route => route.templates).map(template => new RegExp(`^${template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll(param, '[^/]+')}$`));
  const unserved = Object.keys(spec.paths).flatMap(path => samples(path).filter(sample => !templates.some(template => template.test(sample)) || !routes.some(route => route.matches(sample))).map(sample => `${path} (${sample})`));
  assert.deepEqual(unserved, [], `paths in docs/contracts/openapi.yaml that no route serves, or whose example the route refuses:\n${unserved.join('\n')}`);
});

test('http.ts hands requests only to the route modules this test reads', () => {
  const imports = [...source('src/http.ts').matchAll(/^import \{([^}]+)\} from '\.\/([^']+)'/gm)];
  const routing = imports.filter(([, names]) => /\b(?:is\w*Route|\w*[rR]oute)\b/.test(names)).map(([, , from]) => `src/${from}`);
  assert.deepEqual(routing.filter(from => !routeModules.includes(from)), []);
});

test('each operation names its role, its credentials and the mutation header the code requires', () => {
  const ids = new Set<string>();
  const problems: string[] = [];
  const exempt = new Set(['/api/auth/editor', '/api/auth/editor/{code}', '/api/ofrep/v1/evaluate/flags', '/api/ofrep/v1/evaluate/flags/{ofrepKey}', '/api/intake/{intakeSourceId}', '/api/notifications/channels/slack/interactions']);
  for (const { path, method, operation } of operations()) {
    const name = `${method.toUpperCase()} ${path}`;
    if (!operation.operationId || ids.has(operation.operationId)) problems.push(`${name}: operationId missing or repeated`);
    ids.add(operation.operationId ?? '');
    const security = operation.security ?? spec.security;
    const isPublic = security.length === 0 || security.every(entry => Object.keys(entry).every(scheme => scheme === 'unfoldRequest'));
    const internal = path.startsWith('/api/relay/');
    if (!isPublic && !internal && !['viewer', 'operator', 'admin'].includes(operation['x-unfold-role'] ?? '')) problems.push(`${name}: x-unfold-role is missing`);
    if (internal !== Boolean(operation['x-internal'])) problems.push(`${name}: only the workspace relay is x-internal`);
    const mutation = method !== 'get';
    const header = security.length > 0 && security.every(entry => 'unfoldRequest' in entry);
    if (mutation && !internal && header === exempt.has(path)) problems.push(`${name}: ${header ? 'is exempt from' : 'needs'} X-Unfold-Request`);
    if (!mutation && security.some(entry => 'unfoldRequest' in entry)) problems.push(`${name}: a read needs no X-Unfold-Request`);
    const delegated = security.some(entry => 'mcpDelegated' in entry);
    const reached = samples(path).every(sample => delegatedRoutes.some(([allowed, pattern]) => allowed === method.toUpperCase() && pattern.test(sample)));
    if (delegated !== reached) problems.push(`${name}: ${reached ? 'auth.ts lets the delegated unfold-mcp credential reach it' : 'auth.ts does not let the delegated unfold-mcp credential reach it'}`);
  }
  assert.deepEqual(problems, []);
});

test('the server answers exactly the methods the OpenAPI description declares, and asks for the mutation header where it says so', { timeout: testTimeout(120_000) }, async t => {
  process.env.UNFOLD_PROBE_SLACK_TOKEN = 'xoxb-probe';
  process.env.UNFOLD_PROBE_SLACK_SECRET = 'probe-signing-secret';
  const server = await application('demo', config => {
    config.auth.oidc = { issuer: 'http://127.0.0.1:9/openapi-probe', clientId: 'unfold', scopes: ['openid'], displayName: 'Probe', roleClaim: 'role', groupsClaim: 'groups', roles: { admin: [], operator: [], viewer: [] } };
    config.taskSources = [{ id: 'probe-tasks', name: 'Probe tasks', provider: 'demo', baseUrl: 'https://demo.invalid', project: 'order-service', repositoryId: 'order-service', executionOwner: 'interactive' }];
    config.flags = { document: { flags: { 'intake.requests': { defaultVariant: 'on' }, 'notifications.push': { defaultVariant: 'on' }, 'notifications.slack': { defaultVariant: 'on' }, 'notifications.teams': { defaultVariant: 'on' }, 'events.webhooks': { defaultVariant: 'on' } } }, unknown: [] };
    config.notifications = { budgetThresholds: [1], teams: { allowedHosts: ['logic.azure.com'] }, slack: { tokenEnv: 'UNFOLD_PROBE_SLACK_TOKEN', signingSecretEnv: 'UNFOLD_PROBE_SLACK_SECRET', apiUrl: 'http://127.0.0.1:9/slack', permissionAnswers: false } };
    config.outboundEvents = { allowedPrivateTargets: ['127.0.0.1'] };
  });
  t.after(() => { delete process.env.UNFOLD_PROBE_SLACK_TOKEN; delete process.env.UNFOLD_PROBE_SLACK_SECRET; return server.close(); });
  const session = await createSession(server.url);
  const subscribe = async () => {
    const created = await request(server.url, '/api/admin/webhooks', { method: 'POST', body: { url: 'http://127.0.0.1:9/openapi-probe', types: ['dev.unfold.webhook.test'] } });
    assert.equal(created.status, 201, created.text);
    return String(created.body.subscription.id);
  };
  const unrouted = new Set(['The API has no such address. The API reference at /api/openapi.yaml lists the addresses it has.', 'Ploeg operator view not found.', 'A session takes no such action. The API reference at /api/openapi.yaml lists the actions it takes.', 'Unknown OFREP path.', 'Relay route not found.', 'Unknown notifications route.']);
  async function probe(path: string, method: string, declared: boolean, header = true): Promise<{ status: number; code?: string; routed: boolean }> {
    const body = method === 'GET' ? undefined : declared ? 'probe' : '{}';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${server.url}${path}`, { method, redirect: 'manual', signal: controller.signal, headers: { ...(header ? { 'x-unfold-request': '1' } : {}), ...(body === undefined ? {} : { 'content-type': declared ? 'text/plain' : 'application/json' }) }, ...(body === undefined ? {} : { body }) });
      if (response.headers.get('content-type')?.startsWith('text/event-stream')) { controller.abort(); return { status: response.status, routed: true }; }
      const answer = await response.text();
      let error: { code?: string; message?: string } = {};
      try { error = JSON.parse(answer).error ?? {}; } catch { error = {}; }
      return { status: response.status, code: error.code, routed: response.status !== 405 && !(response.status === 404 && unrouted.has(error.message ?? '')) };
    } catch (failure) {
      if (controller.signal.aborted) return { status: 0, routed: true };
      throw failure;
    } finally { clearTimeout(timer); }
  }
  const mismatches: string[] = [];
  let probed = 0;
  for (const [path, item] of Object.entries(spec.paths)) {
    const declaredMethods = methods.filter(method => item[method]);
    const anyOperation = item[declaredMethods[0]]!;
    if (anyOperation['x-unfold-requires']?.includes('connected-ploeg') || path.startsWith('/api/relay/{')) continue;
    const subscription: Record<string, string> = path.includes('{subscriptionId}') ? { subscriptionId: await subscribe() } : {};
    for (const sample of samples(path, { sessionId: session.id, sourceId: 'probe-tasks', ...subscription })) {
      for (const method of methods) {
        const declared = declaredMethods.includes(method);
        const answer = await probe(sample, method.toUpperCase(), declared);
        probed++;
        if (answer.routed !== declared) mismatches.push(`${method.toUpperCase()} ${sample}: ${declared ? 'declared but not served' : 'served but not declared'} (${answer.status} ${answer.code ?? ''})`);
        if (!declared || method === 'get') continue;
        const security = item[method]!.security ?? spec.security;
        const needsHeader = security.length > 0 && security.every(entry => 'unfoldRequest' in entry);
        const bare = await probe(sample, method.toUpperCase(), true, false);
        if ((bare.status === 403 && bare.code === 'csrf') !== needsHeader) mismatches.push(`${method.toUpperCase()} ${sample} without X-Unfold-Request: ${bare.status} ${bare.code ?? ''}, but the description says it ${needsHeader ? 'needs' : 'does not need'} the header`);
      }
    }
  }
  assert(probed > 500, `probed only ${probed} method and path pairs`);
  assert.deepEqual(mismatches, []);
});

test('GET /api/openapi.yaml serves the description without a sign-in', async t => {
  const server = await application('live');
  t.after(() => server.close());
  const answer = await request(server.url, '/api/openapi.yaml');
  assert.equal(answer.status, 200, answer.text);
  assert.match(answer.response.headers.get('content-type') ?? '', /^application\/yaml/);
  assert.equal(answer.text, text);
  assert.equal((await request(server.url, '/api/openapi.yaml', { method: 'PUT', body: {} })).status, 401);
});
