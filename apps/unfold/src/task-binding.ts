import type { AppConfig } from './types.ts';
import { createHash } from 'node:crypto';
import { PloegError, contractRefusal } from './ploeg.ts';
import type { PloegContractGate } from './ploeg-compatibility.ts';
import { canHandOff, taskBindingConfiguration, type PloegTaskSource, type TaskSnapshot, type TaskTarget } from './tasks.ts';

const unavailable = () => new PloegError(503, 'task_binding_unavailable', 'Ploeg could not confirm the task\'s Work Item. Reload, then try again.');
const mismatch = () => new PloegError(409, 'task_binding_changed', 'The task, its Ploeg Work Item or its repository changed. Reload the task and review it before you start.');
const id = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && value.length <= 128 && Number.isFinite(Date.parse(value));
export function sameTaskTarget(left: TaskTarget, right: TaskTarget): boolean { return ['forge', 'owner', 'repo', 'baseBranch'].every(key => left[key as keyof TaskTarget] === right[key as keyof TaskTarget]); }
export function sameTaskBinding(left: PloegTaskSource, right: PloegTaskSource): boolean { return ['workItemId', 'provider', 'externalId', 'expectedBaseUrl', 'expectedScope', 'expectedRevision', 'expectedUpdatedAt'].every(key => left[key as keyof PloegTaskSource] === right[key as keyof PloegTaskSource]) && sameTaskTarget(left.expectedTarget, right.expectedTarget); }
export function taskBindingRevision(source: PloegTaskSource): string { return createHash('sha256').update(JSON.stringify(source)).digest('hex'); }

export async function lookupTaskBinding(config: AppConfig, task: TaskSnapshot, contract?: PloegContractGate): Promise<TaskSnapshot> {
  const refusal = contractRefusal(contract);
  if (refusal) throw refusal;
  const source = config.taskSources?.find(source => source.id === task.sourceId);
  const repository = config.repositories.find(repository => repository.id === task.repositoryId);
  if (!config.execution || !source?.ploeg || source.executionOwner !== 'ploeg' || !canHandOff(source.provider) || !repository || source.repositoryId !== repository.id) throw new PloegError(409, 'task_binding_unconfigured', 'This task connection needs a registered Ploeg tracker target before it can be imported into shared execution.');
  if (task.provider !== source.provider || task.status !== 'open' || !task.nativeRevision || task.scope !== source.project) throw mismatch();
  const token = config.ploeg?.tokenEnv ? process.env[config.ploeg.tokenEnv] : undefined;
  if (!config.ploeg?.url || config.ploeg.demo || !token || /[^\x21-\x7e]/.test(token)) throw unavailable();
  const query = new URLSearchParams({ provider: source.provider, externalId: task.id, scope: source.project, baseUrl: source.baseUrl });
  try {
    const response = await fetch(`${config.ploeg.url}/api/v1/operator/work-items/lookup?${query}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(10000), redirect: 'manual' });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 404 || response.status === 403) throw new PloegError(409, 'task_binding_missing', 'Ploeg has no Work Item for this task in this connection\'s scope. Check the task\'s assignment in the tracker.');
      if (response.status === 409) throw new PloegError(409, 'task_binding_conflict', 'The task\'s Ploeg Work Item changed, is taken by a Team, or already ran. Open the Work Item before you start a new session.');
      throw unavailable();
    }
    if (!response.body || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw unavailable();
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 262144) throw unavailable(); chunks.push(part.value); } } finally { await reader.cancel().catch(() => undefined); }
    if (process.env[config.ploeg.tokenEnv!] !== token) throw unavailable();
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const pin = data?.source;
    const item = data?.item;
    if (data?.schemaVersion !== '1.0' || !pin || !item || !id(pin.workItemId) || !timestamp(pin.expectedUpdatedAt) || !pin.expectedTarget || typeof pin.expectedTarget !== 'object') throw unavailable();
    if (pin.provider !== source.provider || pin.externalId !== task.id || pin.expectedBaseUrl !== source.baseUrl || pin.expectedScope !== source.project || pin.expectedRevision !== task.nativeRevision || !sameTaskTarget(pin.expectedTarget, source.ploeg.target) || item.id !== pin.workItemId || item.provider !== pin.provider || item.externalId !== pin.externalId || item.revision !== pin.expectedRevision || item.updatedAt !== pin.expectedUpdatedAt || item.state !== 'queued' || item.team !== config.execution.team || !item.target || !sameTaskTarget(item.target, source.ploeg.target)) throw mismatch();
    const binding: PloegTaskSource = { workItemId: pin.workItemId, provider: pin.provider, externalId: pin.externalId, expectedBaseUrl: pin.expectedBaseUrl, expectedScope: pin.expectedScope, expectedRevision: pin.expectedRevision, expectedUpdatedAt: pin.expectedUpdatedAt, expectedTarget: { ...source.ploeg.target } };
    return { ...task, ploeg: binding, bindingRevision: taskBindingRevision(binding), bindingConfig: taskBindingConfiguration(source, repository) };
  } catch (error) { if (error instanceof PloegError) throw error; throw unavailable(); }
}
