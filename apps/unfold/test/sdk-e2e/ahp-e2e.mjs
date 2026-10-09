import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS, negotiateProtocolVersion, isActionKnownToVersion, isClientDispatchable,
  rootReducer, sessionReducer, chatReducer, changesetReducer,
} from '@microsoft/agent-host-protocol';
import { AhpClient, AhpStateMirror, RpcError } from '@microsoft/agent-host-protocol/client';
import { WebSocketTransport } from '@microsoft/agent-host-protocol/ws';
import { MultiHostClient, disabledPolicy } from '@microsoft/agent-host-protocol/hosts';

const port = Number(process.argv[2]);
const origin = `http://127.0.0.1:${port}`;
const logDir = join(import.meta.dirname, 'logs');
mkdirSync(logDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const READ = 32, ARCHIVED = 64, ACTIVITY = 31;
const mainInfo = { name: 'vscode-agents-window', title: 'VS Code Agents Window', version: '1.142.0' };
const windowInfo141 = { name: 'vscode-agents-window', title: 'VS Code Agents Window' };
const objective = 'Reproduce the order rounding regression and fix it with the tests intact.';
const results = [];
const findings = [];

function record(scenario, step, ok, detail) {
  const entry = { scenario, step, ok, detail };
  results.push(entry);
  console.log(`${ok ? 'PASS' : 'FAIL'} [${scenario}] ${step}${detail === undefined ? '' : ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  return ok;
}
function note(scenario, text, data) { findings.push({ scenario, text, data }); console.log(`NOTE [${scenario}] ${text}${data === undefined ? '' : ` :: ${JSON.stringify(data)}`}`); }
const defaultChatOf = uri => `ahp-chat://default/${Buffer.from(uri).toString('base64url')}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function issueToken(label) {
  const response = await fetch(`${origin}/api/agent-host/tokens`, { method: 'POST', headers: { Accept: 'application/json', Origin: origin, 'X-Unfold-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ label }) });
  const body = await response.json();
  if (response.status !== 201) throw new Error(`token request failed ${response.status} ${JSON.stringify(body)}`);
  return body;
}

class LoggingTransport {
  constructor(inner, sink) { this.inner = inner; this.sink = sink; }
  send(message) { this.sink('out', typeof message === 'string' ? JSON.parse(message) : message); return this.inner.send(message); }
  async recv() {
    const frame = await this.inner.recv();
    if (frame === null) this.sink('close', this.inner.lastClose);
    else this.sink('in', frame.kind === 'text' ? JSON.parse(frame.text) : frame.kind === 'parsed' ? frame.message : { binary: frame.data.length });
    return frame;
  }
  close() { return this.inner.close(); }
  get lastClose() { return this.inner.lastClose; }
}

const reducers = { root: rootReducer, session: sessionReducer, chat: chatReducer, changeset: changesetReducer };

class Harness {
  constructor(scenario, clientId = randomUUID()) {
    this.scenario = scenario; this.clientId = clientId;
    this.wireFile = join(logDir, `wire-${stamp}-${scenario}.jsonl`);
    this.connection = 0;
  }

  wire(direction, message) { appendFileSync(this.wireFile, JSON.stringify({ t: new Date().toISOString(), connection: this.connection, direction, message }) + '\n'); }

  async open(url) {
    this.connection += 1;
    this.state = new Map(); this.kinds = new Map(); this.pending = new Map(); this.events = []; this.waiters = [];
    this.summaries = new Map(); this.noops = []; this.warnings = []; this.lastServerSeq = 0; this.seqViolations = []; this.unrouted = [];
    this.mirror = new AhpStateMirror();
    const socket = await WebSocketTransport.connect(url);
    this.transport = new LoggingTransport(socket, (direction, message) => this.wire(direction, message));
    this.client = new AhpClient(this.transport, { requestTimeoutMs: 20_000 });
    const stream = this.client.events();
    this.client.connect();
    this.pumping = (async () => { for await (const item of stream) this.handle(item.event); })();
  }

  track(uri, kind, state) { this.kinds.set(uri, kind); this.state.set(uri, state); }

  applySnapshot(snapshot, kind) {
    this.track(snapshot.resource, kind, snapshot.state);
    try { this.mirror.applySnapshot(snapshot); } catch (error) { this.warnings.push({ mirror: String(error) }); }
  }

  handle(event) {
    this.events.push(event);
    if (event.type === 'action') {
      const envelope = event.params;
      if (!(envelope.serverSeq > this.lastServerSeq)) this.seqViolations.push({ previous: this.lastServerSeq, got: envelope.serverSeq, type: envelope.action.type });
      this.lastServerSeq = Math.max(this.lastServerSeq, envelope.serverSeq);
      if (envelope.origin?.clientId === this.clientId) this.pending.delete(envelope.origin.clientSeq);
      if (!envelope.rejectionReason) {
        const kind = this.kinds.get(envelope.channel);
        const reducer = reducers[kind];
        if (!reducer) this.unrouted.push({ channel: envelope.channel, type: envelope.action.type, serverSeq: envelope.serverSeq });
        else {
          const before = this.state.get(envelope.channel);
          const after = reducer(before, envelope.action, message => this.warnings.push({ channel: envelope.channel, type: envelope.action.type, message }));
          if (after === before) this.noops.push({ channel: envelope.channel, type: envelope.action.type, serverSeq: envelope.serverSeq });
          this.state.set(envelope.channel, after);
        }
        this.mirror.apply(envelope);
      }
    } else if (event.type === 'sessionAdded') this.summaries.set(event.params.summary.resource, event.params.summary);
    else if (event.type === 'sessionRemoved') this.summaries.delete(event.params.session);
    else if (event.type === 'sessionSummaryChanged') {
      const existing = this.summaries.get(event.params.session);
      if (existing) this.summaries.set(event.params.session, { ...existing, ...Object.fromEntries(Object.entries(event.params.changes).filter(([, value]) => value !== undefined)) });
      else this.unrouted.push({ summaryFor: event.params.session });
    }
    for (const waiter of [...this.waiters]) if (waiter.test()) { this.waiters.splice(this.waiters.indexOf(waiter), 1); waiter.resolve(); }
  }

  waitFor(test, label, timeoutMs = 20_000) {
    if (test()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiters.splice(this.waiters.indexOf(waiter), 1); reject(new Error(`timed out waiting for ${label}; last events: ${this.events.slice(-8).map(event => event.type === 'action' ? `${event.params.action.type}@${event.params.channel}${event.params.rejectionReason ? `!${event.params.rejectionReason}` : ''}` : event.type).join(', ')}`)); }, timeoutMs);
      const waiter = { test, resolve: () => { clearTimeout(timer); resolve(); } };
      this.waiters.push(waiter);
    });
  }

  findEvent(predicate) { return this.events.find(predicate); }

  view(uri) {
    let state = this.state.get(uri);
    const reducer = reducers[this.kinds.get(uri)];
    for (const [, item] of [...this.pending].sort((a, b) => a[0] - b[0])) if (item.channel === uri && reducer && state) state = reducer(state, item.action, () => {});
    return state;
  }

  async dispatch(channel, action, { expectReject = false, label = action.type } = {}) {
    const dispatchable = isClientDispatchable(action);
    const { clientSeq } = this.client.dispatch(channel, action);
    this.pending.set(clientSeq, { channel, action });
    const optimistic = this.view(channel);
    let envelope;
    try {
      await this.waitFor(() => (envelope = this.events.find(event => event.type === 'action' && event.params.origin?.clientId === this.clientId && event.params.origin.clientSeq === clientSeq)?.params), `echo of ${label} clientSeq ${clientSeq}`, 15_000);
    } catch (error) {
      record(this.scenario, `${label}: echo received`, false, { channel, clientSeq, error: error.message, stillPending: this.pending.has(clientSeq) });
      return undefined;
    }
    const sameChannel = envelope.channel === channel;
    const sameType = envelope.action.type === action.type;
    const rejected = envelope.rejectionReason !== undefined;
    const ok = sameChannel && sameType && rejected === expectReject && !this.pending.has(clientSeq);
    const echoDiff = diff(action, envelope.action);
    if (echoDiff.length) note(this.scenario, `${label}: the echoed action differs from the dispatched one`, echoDiff.map(item => ({ path: item.path, sent: item.reduced, echoed: item.snapshot })));
    record(this.scenario, `${label}: echoed${expectReject ? ' as rejection' : ''} with own origin, channel and no pending action`, ok, { clientDispatchable: dispatchable, clientSeq, echoChannel: envelope.channel, sentChannel: channel, serverSeq: envelope.serverSeq, origin: envelope.origin, rejectionReason: envelope.rejectionReason, stillPending: this.pending.has(clientSeq), pendingTotal: this.pending.size });
    const confirmed = this.state.get(channel);
    if (!rejected && optimistic !== undefined && confirmed !== undefined && 'status' in (optimistic ?? {})) {
      record(this.scenario, `${label}: confirmed state matches the optimistic state for status`, (optimistic.status ?? null) === (confirmed.status ?? null) || this.kinds.get(channel) === 'chat', { optimistic: optimistic.status, confirmed: confirmed.status });
    }
    return envelope;
  }

  async request(method, params) {
    try { return { ok: true, result: await this.client.request(method, params) }; }
    catch (error) { return { ok: false, error: error instanceof RpcError ? { code: error.code, message: error.message, data: error.data } : { name: error.name, message: error.message } }; }
  }

  async subscribe(uri, kind) {
    const { result } = await this.client.subscribe(uri);
    const snapshot = result.snapshot;
    this.applySnapshot(snapshot, kind);
    return snapshot;
  }

  async shutdown() { await this.client.shutdown(); await this.pumping.catch(() => {}); }

  compareSummaries(items, label) {
    const differences = items.flatMap(item => { const cached = this.summaries.get(item.resource); if (!cached) return [{ resource: item.resource, missing: true }]; return diff({ title: cached.title, status: cached.status, activity: cached.activity ?? null }, { title: item.title, status: item.status, activity: item.activity ?? null }, item.resource); });
    record(this.scenario, `${label}: root summaries reduced from notifications equal listSessions`, differences.length === 0, differences.length ? differences : undefined);
  }

  duplicatedDeltas() {
    const parts = new Map();
    const duplicates = [];
    for (const event of this.events) {
      if (event.type !== 'action') continue;
      const action = event.params.action;
      if (action.type === 'chat/responsePart' && action.part.kind === 'markdown') parts.set(action.part.id, { serverSeq: event.params.serverSeq, content: action.part.content });
      if (action.type === 'chat/delta') { const part = parts.get(action.partId); if (part && part.content.length && part.content.endsWith(action.content)) duplicates.push({ partId: action.partId, responsePartSeq: part.serverSeq, deltaSeq: event.params.serverSeq, length: action.content.length }); }
    }
    return duplicates;
  }

  report(label) {
    const duplicates = this.duplicatedDeltas();
    record(this.scenario, `${label}: no chat/delta repeats text already carried by its chat/responsePart`, duplicates.length === 0, duplicates.length ? duplicates : undefined);
    if (this.noops.length) note(this.scenario, `${label}: actions that the SDK reducers applied as no-ops`, this.noops);
    if (this.warnings.length) note(this.scenario, `${label}: reducer warnings`, this.warnings);
    if (this.unrouted.length) note(this.scenario, `${label}: envelopes or summaries for channels without local state`, this.unrouted);
    record(this.scenario, `${label}: serverSeq strictly increasing`, this.seqViolations.length === 0, this.seqViolations.length ? this.seqViolations : undefined);
    record(this.scenario, `${label}: no dispatched action left pending`, this.pending.size === 0, this.pending.size ? [...this.pending] : undefined);
  }
}

function sessionShape(state) {
  return state && { resource: state.resource, title: state.title, status: state.status, activity: state.activity ?? null, lifecycle: state.lifecycle, defaultChat: state.defaultChat, chats: (state.chats ?? []).map(chat => ({ resource: chat.resource, status: chat.status, title: chat.title, activity: chat.activity ?? null })), inputNeeded: (state.inputNeeded ?? []).length, activeClients: (state.activeClients ?? []).map(client => client.clientId) };
}
function chatShape(state) {
  return state && { resource: state.resource, status: state.status, title: state.title, activity: state.activity ?? null, activeTurn: state.activeTurn?.id ?? null, turns: (state.turns ?? []).map(turn => ({ id: turn.id, state: turn.state, parts: turn.responseParts.length, kinds: turn.responseParts.map(part => part.kind).join(','), text: turn.message?.text?.slice(0, 40), markdown: turn.responseParts.filter(part => part.kind === 'markdown').map(part => part.content.length) })) };
}
function diff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap(key => diff(a[key], b[key], `${path}.${key}`));
  }
  return [{ path, reduced: a, snapshot: b }];
}

async function compareWithFreshSnapshot(h, uri, kind, label) {
  const fresh = await h.request('subscribe', { channel: uri });
  if (!fresh.ok) return record(h.scenario, `${label}: fresh snapshot of ${kind}`, false, fresh.error);
  const reduced = h.state.get(uri);
  const shape = kind === 'session' ? sessionShape : chatShape;
  const differences = diff(shape(reduced), shape(fresh.result.snapshot.state));
  return record(h.scenario, `${label}: SDK-reduced ${kind} state equals a fresh host snapshot`, differences.length === 0, differences.length ? differences : undefined);
}

async function followTurn(h, chat, turnId, label) {
  const deadline = Date.now() + 180_000;
  let answered = new Set();
  while (Date.now() < deadline) {
    const state = h.state.get(chat);
    const done = state?.turns?.find(turn => turn.id === turnId);
    if (done && !state.activeTurn) return done;
    const active = state?.activeTurn;
    if (active && (state.status & ACTIVITY) === 24) {
      for (const part of active.responseParts) {
        if (part.kind === 'toolCall' && part.toolCall.status === 'pending-confirmation' && !answered.has(part.toolCall.toolCallId)) {
          answered.add(part.toolCall.toolCallId);
          note(h.scenario, `${label}: the demo asked for a tool confirmation`, part.toolCall);
          await h.dispatch(chat, { type: 'chat/toolCallConfirmed', turnId: active.id, toolCallId: part.toolCall.toolCallId, approved: true, confirmed: 'user-action', selectedOptionId: 'once' }, { label: 'chat/toolCallConfirmed' });
        }
        if (part.kind === 'inputRequest' && part.response === undefined && !answered.has(part.request.id)) {
          answered.add(part.request.id);
          note(h.scenario, `${label}: the demo asked a question`, part.request);
          const answers = Object.fromEntries((part.request.questions ?? []).map(question => [question.id, { state: 'submitted', value: { kind: 'text', value: 'Proceed.' } }]));
          await h.dispatch(chat, { type: 'chat/inputCompleted', requestId: part.request.id, response: 'accept', answers }, { label: 'chat/inputCompleted' });
        }
      }
    }
    await sleep(200);
  }
  throw new Error(`${label}: turn ${turnId} did not finish; chat status ${h.state.get(chat)?.status}`);
}

function wireMentions(h, needle) {
  return h.events.some(event => JSON.stringify(event).includes(needle));
}

function lineCounts(before, after) {
  const dir = mkdtempSync(join(tmpdir(), 'ahp-diff-'));
  writeFileSync(join(dir, 'a'), before); writeFileSync(join(dir, 'b'), after);
  const output = spawnSync('diff', ['-U0', join(dir, 'a'), join(dir, 'b')], { encoding: 'utf8' }).stdout;
  rmSync(dir, { recursive: true, force: true });
  const lines = output.split('\n');
  return { added: lines.filter(line => line.startsWith('+') && !line.startsWith('+++')).length, removed: lines.filter(line => line.startsWith('-') && !line.startsWith('---')).length };
}

async function candidateChecks(h, S, session, chat, titleMatches) {
  await h.waitFor(() => h.state.get(session).changesets?.length && h.state.get(chat).changesets?.length, 'session and chat changesets', 10_000).catch(() => {});
  const sessionSets = h.state.get(session).changesets ?? [];
  const chatSets = h.state.get(chat).changesets ?? [];
  record(S, 'C8: the SDK-reduced session and chat both list one changeset of changeKind "session"', sessionSets.length === 1 && chatSets.length === 1 && sessionSets[0].changeKind === 'session' && JSON.stringify(sessionSets) === JSON.stringify(chatSets), { session: sessionSets, chat: chatSets });
  const entry = sessionSets[0];
  if (!entry) return;
  record(S, 'C8: the changeset uriTemplate is static (no template variables), so it is itself subscribable', !/\{[^}]+\}/.test(entry.uriTemplate), { uriTemplate: entry.uriTemplate, capabilities: entry.capabilities });
  const changeset = entry.uriTemplate;
  const snapshot = await h.subscribe(changeset, 'changeset');
  const files = snapshot.state.files ?? [];
  record(S, 'C9: changeset snapshot is ready and lists the candidate files', snapshot.state.status === 'ready' && files.length > 0, { status: snapshot.state.status, error: snapshot.state.error, files: files.map(file => ({ id: file.id, before: file.edit.before?.content.uri, after: file.edit.after?.content.uri, afterUri: file.edit.after?.uri, sizeHint: file.edit.after?.content.sizeHint, diff: file.edit.diff })), operations: snapshot.state.operations });
  const fixtureRoot = process.argv[3] ? join(process.argv[3], 'apps/unfold/examples/order-service') : undefined;
  for (const file of files) {
    const sides = {};
    for (const side of ['before', 'after']) {
      const ref = file.edit[side]?.content;
      if (!ref) continue;
      const read = await h.request('resourceRead', { channel: 'ahp-root://', uri: ref.uri });
      sides[side] = read.ok ? (read.result.encoding === 'base64' ? Buffer.from(read.result.data, 'base64').toString('utf8') : read.result.data) : undefined;
      record(S, `C9: resourceRead ${ref.uri} returns whole file content, not a patch`, read.ok && typeof sides[side] === 'string' && !/^diff --git /m.test(sides[side]) && !/^@@ /m.test(sides[side]), read.ok ? { encoding: read.result.encoding, contentType: read.result.contentType, bytes: Buffer.byteLength(sides[side] ?? ''), sizeHint: ref.sizeHint, head: (sides[side] ?? '').slice(0, 80) } : read.error);
      if (side === 'after' && read.ok && ref.sizeHint !== undefined) record(S, `C9: sizeHint equals the byte length of ${file.id} after`, ref.sizeHint === Buffer.byteLength(sides.after), { sizeHint: ref.sizeHint, bytes: Buffer.byteLength(sides.after) });
    }
    if (fixtureRoot && sides.before !== undefined) {
      let fixture; try { fixture = readFileSync(join(fixtureRoot, file.id), 'utf8'); } catch { fixture = undefined; }
      record(S, `C9: before content of ${file.id} equals the fixture file the demo starts from`, fixture === sides.before, { fixtureBytes: fixture?.length, beforeBytes: sides.before.length });
    }
    if (sides.before !== undefined && sides.after !== undefined) {
      const counts = lineCounts(sides.before, sides.after);
      record(S, `C9: diff counts of ${file.id} match a line diff of the served before and after`, file.edit.diff?.added === counts.added && file.edit.diff?.removed === counts.removed, { advertised: file.edit.diff, computed: counts });
    }
  }
  const unknownRead = await h.request('resourceRead', { channel: 'ahp-root://', uri: `unfold-candidate:/${changeset.split('/').pop()}/999/after` });
  record(S, 'C9: resourceRead of a file index the candidate does not have is -32008', !unknownRead.ok && unknownRead.error.code === -32008, unknownRead.ok ? unknownRead.result : unknownRead.error);
  const accept = (snapshot.state.operations ?? []).find(operation => operation.id === 'accept');
  record(S, 'C10: the changeset offers an idle "accept" operation while review is open', accept && (accept.status ?? 'idle') === 'idle', snapshot.state.operations);
  if (!accept) return;
  const invoked = await h.request('invokeChangesetOperation', { channel: changeset, operationId: 'accept' });
  record(S, 'C10: invokeChangesetOperation accept succeeds once', invoked.ok, invoked.ok ? invoked.result : invoked.error);
  await h.waitFor(() => !(h.state.get(changeset).operations ?? []).some(operation => operation.id === 'accept'), 'changeset/operationsChanged without accept', 5_000).catch(() => {});
  const opsActions = h.events.filter(event => event.type === 'action' && event.params.channel === changeset && event.params.action.type === 'changeset/operationsChanged').map(event => event.params.action);
  record(S, 'C10: changeset/operationsChanged removes accept from the SDK-reduced changeset', !(h.state.get(changeset).operations ?? []).some(operation => operation.id === 'accept'), { reducedOperations: h.state.get(changeset).operations ?? null, received: opsActions });
  const again = await h.request('invokeChangesetOperation', { channel: changeset, operationId: 'accept' });
  record(S, 'C10: a second accept is refused', !again.ok, again.ok ? again.result : again.error);
  const sessions = await fetch(`${origin}/api/sessions`, { headers: { Accept: 'application/json', Origin: origin, 'X-Unfold-Request': '1' } }).then(response => response.json()).catch(error => ({ error: String(error) }));
  const workbench = Array.isArray(sessions) ? sessions.find(item => titleMatches(item.title)) : undefined;
  record(S, 'C10: the workbench session records the accepted review', workbench?.review?.decision === 'accepted', { status: workbench?.status, review: workbench?.review });
  await sleep(800);
  const fresh = await h.request('subscribe', { channel: changeset });
  const reduced = h.state.get(changeset);
  const differences = diff({ status: reduced.status, files: reduced.files, operations: reduced.operations ?? [] }, { status: fresh.result?.snapshot.state.status, files: fresh.result?.snapshot.state.files, operations: fresh.result?.snapshot.state.operations ?? [] });
  record(S, 'C8-C10: SDK-reduced changeset state equals a fresh changeset snapshot', fresh.ok && differences.length === 0, differences.length ? differences : undefined);
}

async function scenarioMain(url) {
  const S = 'A-vscode-main';
  const h = new Harness(S);
  await h.open(url);
  const offered = ['1.0.0', '0.10.0', '0.9.0'];
  const clientMeta = { 'vscode.clientConnectionKind': 'remote', 'vscode.telemetryLevel': 0, 'vscode.ahpSessionUris': true };
  note(S, 'The SDK typed initialize() helper accepts only clientId, protocolVersions, initialSubscriptions and locale; it cannot send clientInfo, capabilities or _meta, so this scenario sends initialize through AhpClient.request', { sdkHelperArgs: ['clientId', 'protocolVersions', 'initialSubscriptions', 'locale'] });
  note(S, 'What the SDK itself would pick from this offer if it were the host', { sdkNegotiate: negotiateProtocolVersion(offered), sdkSupported: SUPPORTED_PROTOCOL_VERSIONS });
  const init = await h.request('initialize', { channel: 'ahp-root://', protocolVersions: offered, clientId: h.clientId, clientInfo: mainInfo, _meta: clientMeta, initialSubscriptions: ['ahp-root://'] });
  if (!record(S, 'initialize with 1.0.0, 0.10.0, 0.9.0 and vscode.ahpSessionUris', init.ok && init.result.protocolVersion === '0.9.0' && offered.includes(init.result.protocolVersion), init.ok ? { protocolVersion: init.result.protocolVersion, _meta: init.result._meta, serverInfo: init.result.serverInfo, serverSeq: init.result.serverSeq } : init.error)) return;
  record(S, 'host confirms the vscode.ahpSessionUris capability in InitializeResult._meta', init.result._meta?.['vscode.ahpSessionUris'] === true, init.result._meta);
  for (const snapshot of init.result.snapshots) h.applySnapshot(snapshot, 'root');
  h.lastServerSeq = init.result.serverSeq;
  const root = h.state.get('ahp-root://');
  record(S, 'root snapshot names the unfold agent', root?.agents?.some(agent => agent.provider === 'unfold'), { agents: root?.agents?.map(agent => agent.provider), activeSessions: root?.activeSessions });
  await h.dispatch('ahp-root://', { type: 'root/configChanged', config: { 'chat.agent.terminal.autoApprove': { 'npm test': true }, workspaceTrust: { enabled: true, trustedUris: ['file:///tmp/e2e'] }, telemetryLevel: 'off' } });
  const diagnostics = await h.request('getNetworkDiagnosticsInfo', { channel: 'ahp-root://' });
  record(S, 'getNetworkDiagnosticsInfo answered (VS Code extension method)', diagnostics.ok, diagnostics.ok ? diagnostics.result : diagnostics.error);
  const listed = await h.request('listSessions', { channel: 'ahp-root://' });
  record(S, 'listSessions before create', listed.ok, listed.ok ? { count: listed.result.items.length, resources: listed.result.items.map(item => item.resource) } : listed.error);
  for (const item of listed.ok ? listed.result.items : []) h.summaries.set(item.resource, item);

  const resolved = await h.request('resolveSessionConfig', { channel: 'ahp-root://', provider: 'unfold', config: { title: 'SDK e2e as VS Code main' } });
  record(S, 'resolveSessionConfig returns schema and values', resolved.ok && resolved.result.values?.repository && resolved.result.schema?.properties, resolved.ok ? resolved.result.values : resolved.error);
  const session = `ahp-session:/${randomUUID()}`;
  const created = await h.request('createSession', { channel: session, provider: 'unfold', config: resolved.result.values, activeClient: { clientId: h.clientId, tools: [] } });
  record(S, 'createSession on an ahp-session:/<uuid> channel', created.ok, created.ok ? { session, result: created.result } : created.error);
  await h.waitFor(() => h.findEvent(event => event.type === 'sessionAdded'), 'root/sessionAdded');
  const added = h.findEvent(event => event.type === 'sessionAdded');
  record(S, 'root/sessionAdded advertises the client-chosen URI verbatim', added.params.summary.resource === session, { advertised: added.params.summary.resource, chosen: session });
  const earlySessionActions = h.events.filter(event => event.type === 'action' && event.params.channel === session).map(event => event.params.action.type);
  if (earlySessionActions.length) note(S, 'Session-channel actions arrived before the client subscribed (createSession implicitly subscribes the creator)', earlySessionActions);
  const sessionSnapshot = await h.subscribe(session, 'session');
  record(S, 'session snapshot resource and state.resource equal the chosen URI', sessionSnapshot.resource === session && sessionSnapshot.state.resource === session, { snapshotResource: sessionSnapshot.resource, stateResource: sessionSnapshot.state.resource, lifecycle: sessionSnapshot.state.lifecycle });
  record(S, 'createSession.activeClient is reflected in SessionState.activeClients', sessionSnapshot.state.activeClients?.some(client => client.clientId === h.clientId), { activeClients: sessionSnapshot.state.activeClients });
  const chat = sessionSnapshot.state.defaultChat;
  record(S, 'defaultChat is ahp-chat://default/<base64url(session URI)> and listed in chats', chat === defaultChatOf(session) && sessionSnapshot.state.chats.some(item => item.resource === chat), { defaultChat: chat, derived: defaultChatOf(session), chats: sessionSnapshot.state.chats.map(item => item.resource) });
  const chatSnapshot = await h.subscribe(chat, 'chat');
  record(S, 'chat snapshot resource equals defaultChat', chatSnapshot.resource === chat && chatSnapshot.state.resource === chat, { stateResource: chatSnapshot.state.resource });
  await h.dispatch(session, { type: 'session/activeClientSet', activeClient: { clientId: h.clientId, tools: [] } });
  record(S, 'SDK-reduced session lists this client as active', h.state.get(session).activeClients.some(client => client.clientId === h.clientId));

  const turnId = randomUUID();
  const started = await h.dispatch(chat, { type: 'chat/turnStarted', turnId, startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } });
  record(S, 'chat/turnStarted echo keeps the client turn id', started?.action.turnId === turnId, { echoed: started?.action.turnId, sent: turnId });
  const turn = await followTurn(h, chat, turnId, 'first turn');
  const chatAfterTurn = h.state.get(chat);
  record(S, 'first turn completes in the SDK-reduced chat state under the client turn id', turn.state === 'complete' && (chatAfterTurn.status & ACTIVITY) === 1, { turnState: turn.state, parts: turn.responseParts.map(part => part.kind), chatStatus: chatAfterTurn.status, turnIds: chatAfterTurn.turns.map(item => item.id) });
  await h.waitFor(() => (h.summaries.get(session)?.status & ACTIVITY) === 1, 'idle session summary', 20_000).catch(() => {});
  record(S, 'root summary for the session is idle after the turn', (h.summaries.get(session)?.status & ACTIVITY) === 1, h.summaries.get(session) && { status: h.summaries.get(session).status, resource: h.summaries.get(session).resource });
  await sleep(1000);
  await compareWithFreshSnapshot(h, session, 'session', 'after turn');
  await compareWithFreshSnapshot(h, chat, 'chat', 'after turn');
  await candidateChecks(h, S, session, chat, title => title === 'SDK e2e as VS Code main');
  const inputs = h.events.filter(event => event.type === 'action' && (event.params.action.type === 'chat/inputRequested' || (event.params.action.type === 'chat/toolCallReady' && event.params.action.confirmationTitle !== undefined) || event.params.action.type === 'session/inputNeededSet'));
  record(S, 'C11/C12 observation: input requests or permission confirmations the demo raised', true, { count: inputs.length, types: inputs.map(event => event.params.action.type) });

  note(S, 'Registry versions for the read and archive actions on the negotiated 0.9.0', { 'chat/isReadChanged': isActionKnownToVersion({ type: 'chat/isReadChanged' }, '0.9.0'), 'session/isReadChanged': isActionKnownToVersion({ type: 'session/isReadChanged' }, '0.9.0'), 'chat/isArchivedChanged': isActionKnownToVersion({ type: 'chat/isArchivedChanged' }, '0.9.0') });
  await h.dispatch(chat, { type: 'chat/isReadChanged', isRead: true });
  record(S, 'SDK-reduced chat state has IsRead after chat/isReadChanged', (h.state.get(chat).status & READ) === READ, { chatStatus: h.state.get(chat).status });
  await h.waitFor(() => (h.state.get(session).chats.find(item => item.resource === chat)?.status & READ) === READ, 'session/chatUpdated with read bit', 5_000).catch(() => {});
  record(S, 'SDK-reduced session.chats[default] carries IsRead (session/chatUpdated)', (h.state.get(session).chats.find(item => item.resource === chat)?.status & READ) === READ, h.state.get(session).chats);
  await h.dispatch(session, { type: 'session/isReadChanged', isRead: true });
  await h.dispatch(session, { type: 'session/isArchivedChanged', isArchived: true });
  record(S, 'SDK-reduced session state has IsRead and IsArchived', (h.state.get(session).status & (READ | ARCHIVED)) === (READ | ARCHIVED), { sessionStatus: h.state.get(session).status });
  await h.waitFor(() => (h.summaries.get(session)?.status & (READ | ARCHIVED)) === (READ | ARCHIVED), 'root summary bits', 5_000).catch(() => {});
  record(S, 'root summary carries IsRead and IsArchived', (h.summaries.get(session)?.status & (READ | ARCHIVED)) === (READ | ARCHIVED), { status: h.summaries.get(session)?.status });
  await h.dispatch(chat, { type: 'chat/isArchivedChanged', isArchived: true });
  await h.dispatch(chat, { type: 'chat/isArchivedChanged', isArchived: false });
  await h.dispatch('ahp-root://', { type: 'root/configChanged', config: { telemetryLevel: 'error' } });
  const mirrorSession = h.mirror.getSession(session);
  record(S, 'AhpStateMirror tracks the ahp-session channel and agrees on status', mirrorSession?.status === h.state.get(session).status, { mirror: mirrorSession?.status, reduced: h.state.get(session).status });
  await compareWithFreshSnapshot(h, session, 'session', 'before disconnect');
  await compareWithFreshSnapshot(h, chat, 'chat', 'before disconnect');
  const uuid = session.slice('ahp-session:/'.length);
  record(S, 'the provider spelling unfold:/<uuid> never reached this client', !wireMentions(h, `unfold:/${uuid}`));
  const listedBefore = await h.request('listSessions', { channel: 'ahp-root://' });
  if (listedBefore.ok) h.compareSummaries(listedBefore.result.items, 'first connection');
  h.report('first connection');
  const lastSeen = h.lastServerSeq;
  const before = { session: sessionShape(h.state.get(session)), chat: chatShape(h.state.get(chat)) };
  await h.shutdown();

  await h.open(url);
  const reconnected = await h.request('reconnect', { channel: 'ahp-root://', clientId: h.clientId, lastSeenServerSeq: lastSeen, subscriptions: ['ahp-root://', session, chat], _meta: clientMeta });
  if (!record(S, 'reconnect as the first message on a new connection returns {type:"snapshot"} with one snapshot per requested subscription, in order', reconnected.ok && reconnected.result.type === 'snapshot' && reconnected.result.snapshots.map(snapshot => snapshot.resource).join() === ['ahp-root://', session, chat].join(), reconnected.ok ? { type: reconnected.result.type, resources: reconnected.result.snapshots?.map(snapshot => snapshot.resource), fromSeq: reconnected.result.snapshots?.map(snapshot => snapshot.fromSeq) } : reconnected.error)) return;
  const [rootAgain, sessionAgain, chatAgain] = reconnected.result.snapshots;
  h.applySnapshot(rootAgain, 'root'); h.applySnapshot(sessionAgain, 'session'); h.applySnapshot(chatAgain, 'chat');
  h.lastServerSeq = Math.max(...reconnected.result.snapshots.map(snapshot => snapshot.fromSeq));
  const listAfterReconnect = await h.request('listSessions', { channel: 'ahp-root://' });
  record(S, 'the reconnected connection is usable without initialize (listSessions)', listAfterReconnect.ok, listAfterReconnect.ok ? { count: listAfterReconnect.result.items.length } : listAfterReconnect.error);
  record(S, 'session URI survives reconnect', sessionAgain.resource === session && sessionAgain.state.resource === session && sessionAgain.state.defaultChat === chat, { resource: sessionAgain.state.resource, defaultChat: sessionAgain.state.defaultChat });
  record(S, 'read and archive bits survive reconnect', (sessionAgain.state.status & (READ | ARCHIVED)) === (READ | ARCHIVED) && (chatAgain.state.status & READ) === READ, { sessionStatus: sessionAgain.state.status, chatStatus: chatAgain.state.status });
  record(S, 'turn ids survive reconnect', chatAgain.state.turns[0]?.id === turnId, { turnIds: chatAgain.state.turns.map(item => item.id) });
  const afterDiff = [...diff(before.session, sessionShape(sessionAgain.state), '.session'), ...diff(before.chat, chatShape(chatAgain.state), '.chat')];
  record(S, 'state reduced before disconnect equals snapshots after reconnect', afterDiff.length === 0, afterDiff.length ? afterDiff : undefined);
  await h.dispatch('ahp-root://', { type: 'root/configChanged', config: { telemetryLevel: 'off' } });
  const relisted = await h.request('listSessions', { channel: 'ahp-root://' });
  for (const entry of relisted.ok ? relisted.result.items : []) h.summaries.set(entry.resource, entry);
  const item = relisted.ok ? relisted.result.items.find(entry => entry.resource === session) : undefined;
  record(S, 'listSessions after reconnect lists the session under its chosen URI with both bits', item && (item.status & (READ | ARCHIVED)) === (READ | ARCHIVED), relisted.ok ? relisted.result.items.map(entry => ({ resource: entry.resource, status: entry.status })) : relisted.error);
  await h.dispatch(session, { type: 'session/isReadChanged', isRead: false });
  record(S, 'unread after reconnect clears only IsRead', (h.state.get(session).status & (READ | ARCHIVED)) === ARCHIVED, { status: h.state.get(session).status });
  await h.dispatch(session, { type: 'session/isReadChanged', isRead: true });
  record(S, 'the provider spelling unfold:/<uuid> never reached the reconnected client', !wireMentions(h, `unfold:/${uuid}`));
  h.report('second connection');
  await h.shutdown();

  const sdkReconnect = new Harness(`${S}-sdk-reconnect`, h.clientId);
  await sdkReconnect.open(url);
  let typed;
  try { typed = { ok: true, result: await sdkReconnect.client.reconnect({ clientId: h.clientId, lastSeenServerSeq: h.lastServerSeq, subscriptions: ['ahp-root://', session, chat] }) }; }
  catch (error) { typed = { ok: false, error: { code: error.code, message: error.message } }; }
  const typedSession = typed.ok ? typed.result.snapshots?.find(snapshot => snapshot.resource === session) : undefined;
  record(S, 'SDK typed reconnect() (it cannot carry _meta) for a client that declared vscode.ahpSessionUris keeps the ahp-session spelling', typed.ok && typedSession?.state.resource === session && typedSession?.state.defaultChat === chat, typed.ok ? { type: typed.result.type, snapshotResource: typedSession?.resource, stateResource: typedSession?.state.resource, defaultChat: typedSession?.state.defaultChat } : typed.error);
  if (typed.ok) {
    const listed = await sdkReconnect.request('listSessions', { channel: 'ahp-root://' });
    record(S, 'listSessions after a _meta-less reconnect keeps the ahp-session spelling', listed.ok && listed.result.items.some(entry => entry.resource === session), listed.ok ? listed.result.items.map(entry => entry.resource) : listed.error);
  }
  await sdkReconnect.shutdown();

  const stranger = new Harness(`${S}-unknown-reconnect`);
  await stranger.open(url);
  const unknown = await stranger.request('reconnect', { channel: 'ahp-root://', clientId: stranger.clientId, lastSeenServerSeq: 0, subscriptions: ['ahp-root://'] });
  record(S, 'reconnect for a clientId this process never initialized is refused with -32008', !unknown.ok && unknown.error.code === -32008, unknown.ok ? unknown.result : unknown.error);
  const fallback = await stranger.request('initialize', { channel: 'ahp-root://', protocolVersions: offered, clientId: stranger.clientId, clientInfo: mainInfo, _meta: clientMeta, initialSubscriptions: ['ahp-root://'] });
  record(S, 'the same connection can initialize after the refused reconnect', fallback.ok && fallback.result.protocolVersion === '0.9.0', fallback.ok ? { protocolVersion: fallback.result.protocolVersion } : fallback.error);
  await stranger.shutdown();
  return { session, chat, turnId };
}

async function scenario141(url, mainSession) {
  const S = 'B-vscode-1.141';
  const h = new Harness(S);
  await h.open(url);
  const offered = ['0.10.0', '0.9.0', '0.7.0', '0.6.0', '0.5.2', '0.5.1'];
  let init;
  note(S, 'Sent through AhpClient.request because the typed initialize() helper cannot carry clientInfo, which the host now uses to recognise a VS Code window', windowInfo141);
  const raw = await h.request('initialize', { channel: 'ahp-root://', protocolVersions: offered, clientId: h.clientId, clientInfo: windowInfo141, initialSubscriptions: ['ahp-root://'] });
  init = raw;
  if (!record(S, 'initialize with the 1.141 offer, clientInfo vscode-agents-window and no _meta', init.ok && init.result.protocolVersion === '0.9.0' && init.result._meta === undefined, init.ok ? { protocolVersion: init.result.protocolVersion, _meta: init.result._meta } : init.error)) return;
  for (const snapshot of init.result.snapshots) h.applySnapshot(snapshot, 'root');
  h.lastServerSeq = init.result.serverSeq;
  await h.dispatch('ahp-root://', { type: 'root/configChanged', config: { telemetryLevel: 'off' } });
  const listed = await h.request('listSessions', { channel: 'ahp-root://' });
  for (const item of listed.ok ? listed.result.items : []) h.summaries.set(item.resource, item);
  if (mainSession) {
    const uuid = mainSession.session.slice('ahp-session:/'.length);
    record(S, 'a session created by the main client is listed to 1.141 as unfold:/<uuid>', listed.ok && listed.result.items.some(item => item.resource === `unfold:/${uuid}`), listed.ok ? listed.result.items.map(item => item.resource) : listed.error);
  }
  const resolved = await h.request('resolveSessionConfig', { channel: 'ahp-root://', provider: 'unfold', config: { title: 'SDK e2e as VS Code 1.141' } });
  const id = randomUUID();
  const session = `unfold:/${id}`;
  const created = await h.request('createSession', { channel: session, provider: 'unfold', config: resolved.result.values });
  record(S, 'createSession on unfold:/<uuid>', created.ok, created.ok ? created.result : created.error);
  await h.waitFor(() => h.findEvent(event => event.type === 'sessionAdded' && event.params.summary.resource === session), 'root/sessionAdded', 10_000).catch(() => {});
  const added = h.findEvent(event => event.type === 'sessionAdded');
  record(S, 'root/sessionAdded advertises unfold:/<uuid>', added?.params.summary.resource === session, { advertised: added?.params.summary.resource });
  const sessionSnapshot = await h.subscribe(session, 'session');
  const chat = sessionSnapshot.state.defaultChat;
  record(S, 'session snapshot keeps unfold:/ and derives the default chat from it', sessionSnapshot.state.resource === session && chat === defaultChatOf(session), { resource: sessionSnapshot.state.resource, defaultChat: chat });
  await h.subscribe(chat, 'chat');
  const turnId = randomUUID();
  const started = await h.dispatch(chat, { type: 'chat/turnStarted', turnId, startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } });
  record(S, 'chat/turnStarted echo keeps the client turn id', started?.action.turnId === turnId);
  const turn = await followTurn(h, chat, turnId, 'first turn');
  record(S, 'turn completes in the SDK-reduced chat state', turn.state === 'complete' && (h.state.get(chat).status & ACTIVITY) === 1, { turnState: turn.state, chatStatus: h.state.get(chat).status });
  await sleep(1000);
  await compareWithFreshSnapshot(h, session, 'session', 'after turn');
  await compareWithFreshSnapshot(h, chat, 'chat', 'after turn');
  const turnsBefore = h.state.get(chat).turns.length;
  await h.dispatch(chat, { type: 'chat/turnStarted', turnId: randomUUID(), startedAt: new Date().toISOString(), message: { text: 'One more thing.', origin: { kind: 'user' } } }, { expectReject: true, label: 'chat/turnStarted on an ended session' });
  record(S, 'rejected chat/turnStarted reconciles: no pending action, no active turn, turn count unchanged', h.pending.size === 0 && !h.state.get(chat).activeTurn && h.state.get(chat).turns.length === turnsBefore && h.view(chat) === h.state.get(chat), { turns: h.state.get(chat).turns.length, activeTurn: h.state.get(chat).activeTurn?.id });
  await h.dispatch(session, { type: 'session/titleChanged', title: 'SDK e2e 1.141, renamed' });
  await h.waitFor(() => h.summaries.get(session)?.title === 'SDK e2e 1.141, renamed', 'root summary title', 5_000).catch(() => {});
  record(S, 'session/titleChanged reaches the SDK-reduced session and the root summary', h.state.get(session).title === 'SDK e2e 1.141, renamed' && h.summaries.get(session)?.title === 'SDK e2e 1.141, renamed', { session: h.state.get(session).title, summary: h.summaries.get(session)?.title, chatTitle: h.state.get(session).chats[0]?.title });
  await h.dispatch(session, { type: 'session/isReadChanged', isRead: true });
  record(S, 'SDK-reduced session state has IsRead', (h.state.get(session).status & READ) === READ, { status: h.state.get(session).status });
  await h.waitFor(() => (h.summaries.get(session)?.status & READ) === READ, 'root summary read bit', 5_000).catch(() => {});
  record(S, 'root summary carries IsRead', (h.summaries.get(session)?.status & READ) === READ, { status: h.summaries.get(session)?.status });
  await h.dispatch(session, { type: 'session/isArchivedChanged', isArchived: true });
  record(S, 'SDK-reduced session state has IsArchived', (h.state.get(session).status & ARCHIVED) === ARCHIVED, { status: h.state.get(session).status });
  record(S, 'AhpStateMirror ignores unfold:/ session channels (SDK routes sessions only by the ahp-session: prefix)', h.mirror.getSession(session) === undefined, { mirrorHasSession: h.mirror.getSession(session) !== undefined });
  record(S, 'a 1.141 client never sees the ahp-session spelling of its own session', !wireMentions(h, `ahp-session:/${id}`));
  await compareWithFreshSnapshot(h, session, 'session', 'end');
  const listedEnd = await h.request('listSessions', { channel: 'ahp-root://' });
  if (listedEnd.ok) h.compareSummaries(listedEnd.result.items, 'end');
  h.report('connection');
  await h.shutdown();
}

async function scenarioPureSdk(url) {
  const S = 'C-pure-sdk-default';
  const h = new Harness(S);
  await h.open(url);
  let init;
  try { init = { ok: true, result: await h.client.initialize({ clientId: h.clientId, protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS], initialSubscriptions: ['ahp-root://'] }) }; }
  catch (error) { init = { ok: false, error: { code: error.code, message: error.message, data: error.data } }; }
  if (!record(S, `SDK initialize() with SUPPORTED_PROTOCOL_VERSIONS ${JSON.stringify(SUPPORTED_PROTOCOL_VERSIONS)}`, init.ok && init.result.protocolVersion === '0.9.0', init.ok ? { protocolVersion: init.result.protocolVersion } : init.error)) return;
  for (const snapshot of init.result.snapshots) h.applySnapshot(snapshot, 'root');
  const resolved = await h.request('resolveSessionConfig', { channel: 'ahp-root://', provider: 'unfold' });
  const session = `ahp-session:/${randomUUID()}`;
  const created = await h.request('createSession', { channel: session, provider: 'unfold', config: resolved.result.values });
  record(S, 'createSession on ahp-session:/<uuid> without vendor _meta', created.ok, created.ok ? created.result : created.error);
  await h.waitFor(() => h.findEvent(event => event.type === 'sessionAdded'), 'root/sessionAdded', 10_000).catch(() => {});
  const added = h.findEvent(event => event.type === 'sessionAdded');
  record(S, 'root/sessionAdded advertises the client-chosen URI verbatim', added?.params.summary.resource === session, { advertised: added?.params.summary.resource, chosen: session });
  const snapshot = await h.subscribe(session, 'session');
  record(S, 'session snapshot state.resource equals snapshot.resource (the chosen URI)', snapshot.state.resource === session, { snapshotResource: snapshot.resource, stateResource: snapshot.state.resource, defaultChat: snapshot.state.defaultChat });
  const chat = snapshot.state.defaultChat;
  await h.subscribe(chat, 'chat');
  const turnId = randomUUID();
  await h.dispatch(chat, { type: 'chat/turnStarted', turnId, startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } });
  await h.waitFor(() => h.events.some(event => event.type === 'action' && event.params.channel === chat && event.params.action.type === 'chat/toolCallStart'), 'a running tool call', 30_000).catch(() => {});
  const rootFresh = await h.request('subscribe', { channel: 'ahp-root://' });
  const chatFresh = await h.request('subscribe', { channel: chat });
  const sessionFresh = await h.request('subscribe', { channel: session });
  const rootTypes = h.events.filter(event => event.type === 'action' && event.params.channel === 'ahp-root://').map(event => event.params.action.type);
  record(S, 'mid-turn: SDK-reduced root activeSessions equals a fresh root snapshot', h.state.get('ahp-root://').activeSessions === rootFresh.result?.snapshot.state.activeSessions, { reduced: h.state.get('ahp-root://').activeSessions, snapshot: rootFresh.result?.snapshot.state.activeSessions, rootActionsReceived: rootTypes });
  record(S, 'mid-turn: SDK-reduced chat activity equals a fresh chat snapshot', (h.state.get(chat).activity ?? null) === (chatFresh.result?.snapshot.state.activity ?? null), { reduced: h.state.get(chat).activity ?? null, snapshot: chatFresh.result?.snapshot.state.activity ?? null, sessionActivity: sessionFresh.result?.snapshot.state.activity, chatActionsReceived: [...new Set(h.events.filter(event => event.type === 'action' && event.params.channel === chat).map(event => event.params.action.type))] });
  const turn = await followTurn(h, chat, turnId, 'first turn');
  record(S, 'turn completes', turn.state === 'complete');
  await h.dispatch(chat, { type: 'chat/isReadChanged', isRead: true });
  record(S, 'chat IsRead set in SDK-reduced state', (h.state.get(chat).status & READ) === READ);
  const listed = await h.request('listSessions', { channel: 'ahp-root://' });
  record(S, 'listSessions lists the session under the chosen URI', listed.ok && listed.result.items.some(item => item.resource === session), listed.ok ? listed.result.items.map(item => item.resource) : listed.error);
  record(S, 'AhpStateMirror tracks the session', h.mirror.getSession(session) !== undefined);
  h.report('connection');
  await h.shutdown();
}

async function negotiationOnly(url, offered, label) {
  const S = 'D-negotiation';
  const h = new Harness(S);
  await h.open(url);
  let outcome;
  try { outcome = { ok: true, result: await h.client.initialize({ clientId: h.clientId, protocolVersions: offered, initialSubscriptions: ['ahp-root://'] }) }; }
  catch (error) { outcome = { ok: false, error: { name: error.name, code: error.code, message: error.message, data: error.data } }; }
  await h.waitFor(() => h.client.connectionState.status === 'closed', 'connection close', 3_000).catch(() => {});
  await sleep(300);
  const closed = h.client.connectionState.status === 'closed';
  const closeInfo = h.transport.lastClose;
  await h.shutdown();
  return { label, offered, outcome, closed, closeInfo };
}

async function scenarioNegotiation(url) {
  const S = 'D-negotiation';
  const only1 = await negotiationOnly(url, ['1.0.0'], '1.0.0 alone');
  record(S, '1.0.0 alone: -32005 with data.supportedVersions and the connection closed', !only1.outcome.ok && only1.outcome.error.code === -32005 && Array.isArray(only1.outcome.error.data?.supportedVersions) && only1.closed, only1);
  const order = await negotiationOnly(url, ['0.9.0', '1.0.0'], 'order 0.9.0, 1.0.0');
  record(S, 'offer order 0.9.0, 1.0.0 still negotiates 0.9.0', order.outcome.ok && order.outcome.result.protocolVersion === '0.9.0', { protocolVersion: order.outcome.result?.protocolVersion, error: order.outcome.error });
  const patch = await negotiationOnly(url, ['1.0.0', '0.9.3', '0.9.1'], 'patch 0.9.3');
  record(S, 'highest offered 0.9.x is returned as the exact string', patch.outcome.ok && patch.outcome.result.protocolVersion === '0.9.3', { protocolVersion: patch.outcome.result?.protocolVersion, error: patch.outcome.error });
  const malformed = await negotiationOnly(url, ['1.0', '0.9.0'], 'malformed');
  record(S, 'a malformed entry is observed (SDK negotiateProtocolVersion throws on it)', true, { outcome: malformed.outcome.ok ? { protocolVersion: malformed.outcome.result.protocolVersion } : malformed.outcome.error, closed: malformed.closed });
}

async function scenarioMultiHost(url) {
  const S = 'E-multihost-default';
  const wireFile = join(logDir, `wire-${stamp}-${S}.jsonl`);
  const { multi, host } = await MultiHostClient.single({ id: 'unfold', label: 'Unfold demo', reconnectPolicy: disabledPolicy(), clientConfig: { requestTimeoutMs: 10_000 }, transportFactory: async () => new LoggingTransport(await WebSocketTransport.connect(url), (direction, message) => appendFileSync(wireFile, JSON.stringify({ t: new Date().toISOString(), direction, message }) + '\n')) });
  const states = [{ status: host.state.status }];
  const events = multi.hostEvents();
  const collect = (async () => { for await (const event of events) { states.push({ type: event.type, status: event.state?.status, error: event.lastError ? { name: event.lastError.name, message: event.lastError.message, code: event.lastError.code, data: event.lastError.data } : undefined }); if (event.state?.status === 'failed' || event.state?.status === 'connected') break; } })();
  await Promise.race([collect, sleep(8000)]);
  record(S, `MultiHostClient.single (offers [PROTOCOL_VERSION] = ['${PROTOCOL_VERSION}']) against the host`, true, states);
  await multi.shutdown();
}

const tokenA = await issueToken('VS Code on sdk-e2e-main');
const tokenB = await issueToken('VS Code on sdk-e2e-1141');
const tokenC = await issueToken('sdk-e2e-pure');
record('setup', 'POST /api/agent-host/tokens issues a connection token as the extension does', typeof tokenA.token === 'string' && tokenA.vscodeSetting?.entry?.connectionToken === tokenA.token, { address: tokenA.address, settingKey: tokenA.vscodeSetting?.key, entryName: tokenA.vscodeSetting?.entry?.name });
const urlOf = token => `${token.address}/?tkn=${token.token}`;
const run = async (name, fn) => { try { return await fn(); } catch (error) { record(name, 'scenario threw', false, { message: error.message, stack: error.stack?.split('\n').slice(0, 4).join(' | ') }); } };
const main = await run('A-vscode-main', () => scenarioMain(urlOf(tokenA)));
await run('B-vscode-1.141', () => scenario141(urlOf(tokenB), main));
await run('C-pure-sdk-default', () => scenarioPureSdk(urlOf(tokenC)));
await run('D-negotiation', () => scenarioNegotiation(urlOf(tokenC)));
await run('E-multihost-default', () => scenarioMultiHost(urlOf(tokenC)));
writeFileSync(join(logDir, `results-${stamp}.json`), JSON.stringify({ port, stamp, results, findings }, null, 2));
const failed = results.filter(item => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed; results in logs/results-${stamp}.json`);
process.exit(0);
