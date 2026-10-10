import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { application, configuration, request } from './api-support.ts';
import { action, connect, defaultChatOf, vscodeAgentsWindow, type Json } from './ahp-support.ts';
import { repositoriesDirectory } from '../src/ahp/host.ts';
import { acceptSessionConfig, composerModel, resolveSessionConfig, sessionConfigState, startedConfigChange } from '../src/ahp/session-config.ts';
import { testTimeout } from './timeframes.ts';
import { money } from '../public/core/format.js';
import type { AppConfig, Session } from '../src/types.ts';

const objective = 'Reproduce the rounding regression and fix it with the tests intact.';
const approvalModeValues = new Set(['manual', 'assisted', 'allow-all']);
const approvalLevel: Record<string, string> = { manual: 'default', 'allow-all': 'autoApprove', assisted: 'assisted' };

function approvalSchemaOfVscode1141(schema: Json): Json | undefined {
  const property = schema.properties.approvalMode;
  return property?.type === 'string' && !property.enumDynamic && Array.isArray(property.enum) && property.enum.includes('manual') && property.enum.every((value: string) => approvalModeValues.has(value)) ? property : undefined;
}

function chipsOfVscode1141(resolved: Json, creating = true): Json[] {
  const approval = approvalSchemaOfVscode1141(resolved.schema);
  const chips: Json[] = [];
  for (const [key, property] of Object.entries<Json>(resolved.schema.properties)) {
    if (property.type !== 'boolean' && (property.type !== 'string' || (!property.enumDynamic && !property.enum?.length))) continue;
    if (key === 'approvalMode' && approval && !property.readOnly && (creating || property.sessionMutable === true)) continue;
    if (!creating && !property.sessionMutable) continue;
    const value = resolved.values[key] ?? property.default;
    const index = property.enum?.indexOf(value) ?? -1;
    chips.push({ key, label: index >= 0 ? property.enumLabels?.[index] ?? value : property.title, readOnly: Boolean(property.readOnly) || (!creating && !property.sessionMutable), hover: property.description ?? property.title });
  }
  return chips;
}

function approvalLevelsOfVscode1141(schema: Json, creating = true): string[] {
  const approval = approvalSchemaOfVscode1141(schema);
  if (!approval || approval.readOnly || (!creating && approval.sessionMutable !== true)) return [];
  return approval.enum.map((value: string) => approvalLevel[value]);
}

function isolatedConfiguration(): AppConfig {
  const config = configuration('/nonexistent', 'live');
  config.crews.push({ id: 'investigation', name: 'Investigation crew', description: 'Reads only', roles: [{ id: 'analyst', name: 'Analyst', mode: 'read', instruction: 'Investigate.', model: 'reasoning' }] });
  config.crews[0].roles[0].model = 'coding';
  config.models = [{ id: 'coding', name: 'DeepSeek V4.1 Flash (Fireworks)', providerId: 'litellm', modelId: 'coding' }, { id: 'reasoning', name: 'Claude Opus', providerId: 'litellm', modelId: 'reasoning' }];
  config.runtime = { ...config.runtime, backend: 'docker', backends: ['docker', 'local'] };
  config.execution = { team: 'silver' };
  return config;
}

test('the Agents window renders crew, budget and placement as pickers, the repository read-only from the Workspace picker, and approvals in its own picker', () => {
  const config = isolatedConfiguration();
  const resolved = resolveSessionConfig(config, { title: 'From the composer', isolation: 'worktree', worktreeBranchPrefix: 'copilot/' }, 'order-service');
  assert.deepEqual(Object.keys(resolved.values).sort(), ['approvalMode', 'budgetUsd', 'crew', 'placement', 'repository', 'title'], 'VS Code\'s own keys are not echoed back');
  assert.deepEqual(chipsOfVscode1141(resolved).map(chip => [chip.key, chip.label, chip.readOnly]), [
    ['repository', 'Order service', true],
    ['crew', 'Delivery crew', false],
    ['budgetUsd', money(5), false],
    ['placement', 'Container', false],
  ]);
  assert.deepEqual(approvalLevelsOfVscode1141(resolved.schema), ['default', 'autoApprove'], 'a container placement may approve inside its sandbox');
  assert.equal(resolved.values.approvalMode, 'manual', 'approval defaults to asking');
  const crew = resolved.schema.properties.crew;
  assert.deepEqual(crew.enumDescriptions, ['Builder writes on DeepSeek V4.1 Flash (Fireworks), then Reviewer reviews on DeepSeek V4.1 Flash (Fireworks).', 'Analyst reviews on Claude Opus.'], 'each crew names the model every role runs on');
  assert.deepEqual(resolved.schema.properties.budgetUsd.enum, ['1', '2', '5', '10', '25'], 'budgets stop at the deployment limit');

  const local = resolveSessionConfig(config, { ...resolved.values, placement: 'local', approvalMode: 'allow-all' }, 'order-service');
  assert.equal(local.values.approvalMode, 'manual', 'a working directory on the host never approves automatically');
  assert.deepEqual(approvalLevelsOfVscode1141(local.schema), ['default']);
  assert.throws(() => acceptSessionConfig(config, { ...resolved.values, placement: 'local', approvalMode: 'allow-all' }), /container or pod/);
  assert.throws(() => acceptSessionConfig(config, { ...resolved.values, budgetUsd: '26' }), new RegExp(`up to ${money(25).replace('$', '\\$')}`));
  assert.equal(acceptSessionConfig(config, { ...resolved.values, budgetUsd: 3 }).budgetUsd, '3', 'another client may still send a number');
  assert.ok(resolveSessionConfig(config, { budgetUsd: 3 }).schema.properties.budgetUsd.enum.includes('3'), 'a value outside the presets stays selectable');
});

test('the composer names the crew that runs, never a gateway model', () => {
  assert.deepEqual(composerModel(isolatedConfiguration()), { id: 'unfold-crew', name: 'Ploeg crew · silver' });
  assert.deepEqual(composerModel(configuration('/nonexistent', 'live')), { id: 'unfold-crew', name: 'Unfold crew' });
  assert.deepEqual(composerModel(configuration('/nonexistent', 'demo')), { id: 'unfold-crew', name: 'Demo crew · no model calls' });
});

test('a started session keeps its configuration, and only its approval stays changeable while it runs in a container', () => {
  const config = isolatedConfiguration();
  const session = { repositoryId: 'order-service', crewId: 'delivery', budgetUsd: 2.5, title: 'Running', placement: 'docker', approval: 'manual', status: 'running' } as Session;
  const state = sessionConfigState(config, session);
  assert.deepEqual(state.values, { repository: 'order-service', crew: 'delivery', budgetUsd: '2.5', title: 'Running', placement: 'docker', approvalMode: 'manual' });
  assert.deepEqual(chipsOfVscode1141(state, false), [], 'no picker for a fixed value');
  assert.deepEqual(approvalLevelsOfVscode1141(state.schema, false), ['default', 'autoApprove']);
  assert.deepEqual(startedConfigChange(session, { ...state.values, approvalMode: 'allow-all' }), { approval: 'auto' });
  assert.deepEqual(startedConfigChange(session, state.values), {});
  assert.throws(() => startedConfigChange(session, { crew: 'investigation' }), /crew is fixed once the session has started/);
  assert.deepEqual(approvalLevelsOfVscode1141(sessionConfigState(config, { ...session, status: 'completed' }).schema, false), [], 'a finished session offers no approval change');
  assert.deepEqual(approvalLevelsOfVscode1141(sessionConfigState(config, { ...session, placement: 'local' }).schema, false), []);
});

test('VS Code\'s new-session flow: the advertised model names the crew, a picker change before the first message reaches the session, and the repository stays the picked one', { timeout: testTimeout(60_000) }, async t => {
  const server = await application('demo', config => { config.crews.push({ id: 'investigation', name: 'Investigation crew', description: 'Reads only', roles: [{ id: 'analyst', name: 'Analyst', mode: 'read', instruction: 'Investigate the rounding.' }] }); });
  t.after(() => server.close());
  const issued = await request(server.url, '/api/agent-host/tokens', { method: 'POST', body: { label: 'session config' } });
  const vscode = connect(`${server.url.replace(/^http/, 'ws')}/?tkn=${issued.body.token}`);
  t.after(() => vscode.close());
  await vscode.open;
  const clientId = randomUUID();
  const initialized = await vscode.rpc('initialize', { channel: 'ahp-root://', protocolVersions: ['0.9.0'], clientId, clientInfo: vscodeAgentsWindow, initialSubscriptions: ['ahp-root://'] });
  assert.deepEqual(initialized.snapshots[0].state.agents[0].models, [{ id: 'unfold-crew', name: 'Demo crew · no model calls', provider: 'unfold' }]);

  const picked = `${repositoriesDirectory}/${encodeURIComponent('Unfold · order-service')}`;
  const resolved = await vscode.rpc('resolveSessionConfig', { channel: 'ahp-root://', provider: 'unfold', workingDirectory: picked });
  assert.deepEqual(chipsOfVscode1141(resolved).map(chip => [chip.key, chip.label]), [['repository', 'Order service'], ['crew', 'Delivery crew'], ['budgetUsd', money(5)]]);
  assert.deepEqual(approvalLevelsOfVscode1141(resolved.schema), ['default'], 'the demonstration has no sandbox to approve inside');
  const completions = await vscode.rpc('sessionConfigCompletions', { channel: 'ahp-root://', provider: 'unfold', property: 'crew' });
  assert.deepEqual(completions.items.map((item: Json) => item.label), ['Delivery crew', 'Investigation crew']);

  const session = `unfold:/${randomUUID()}`;
  const chat = defaultChatOf(session);
  await vscode.rpc('createSession', { channel: session, provider: 'unfold', workingDirectories: [picked], config: resolved.values, model: { id: 'unfold-crew' } });
  await vscode.rpc('subscribe', { channel: session });
  await vscode.rpc('subscribe', { channel: chat });
  vscode.notify('dispatchAction', { channel: session, clientSeq: 1, action: { type: 'session/configChanged', config: { ...resolved.values, crew: 'investigation', budgetUsd: '10' } } });
  const changed = await vscode.until(message => action(message, session, 'session/configChanged') && message.params.origin?.clientSeq === 1);
  assert.equal(changed.params.rejectionReason, undefined);
  assert.equal(changed.params.action.config.crew, 'investigation');
  vscode.notify('dispatchAction', { channel: session, clientSeq: 2, action: { type: 'session/configChanged', config: { repository: 'elsewhere' } } });
  const refused = await vscode.until(message => action(message, session, 'session/configChanged') && message.params.origin?.clientSeq === 2);
  assert.match(refused.params.rejectionReason, /Workspace picker/);
  const draft = (await vscode.rpc('subscribe', { channel: session })).snapshot.state.config;
  assert.deepEqual([draft.values.crew, draft.values.budgetUsd, draft.values.repository], ['investigation', '10', 'order-service']);

  vscode.notify('dispatchAction', { channel: chat, clientSeq: 3, action: { type: 'chat/turnStarted', turnId: randomUUID(), startedAt: new Date().toISOString(), message: { text: objective, origin: { kind: 'user' } } } });
  const started = await vscode.until(message => action(message, chat, 'chat/turnStarted') && message.params.origin?.clientSeq === 3);
  assert.equal(started.params.rejectionReason, undefined);
  assert.equal(started.params.action.message.model, undefined, 'a response is never labelled with a model nobody observed');
  const [created] = server.app.store.listSessions();
  assert.deepEqual([created.crewId, created.budgetUsd, created.approval], ['investigation', 10, 'manual'], 'the session starts with what the pickers showed');
  const live = (await vscode.rpc('subscribe', { channel: session })).snapshot.state.config;
  assert.deepEqual(chipsOfVscode1141(live, false), []);
  vscode.notify('dispatchAction', { channel: session, clientSeq: 4, action: { type: 'session/configChanged', config: { crew: 'delivery' } } });
  const fixed = await vscode.until(message => action(message, session, 'session/configChanged') && message.params.origin?.clientSeq === 4);
  assert.match(fixed.params.rejectionReason, /fixed once the session has started/);
});
