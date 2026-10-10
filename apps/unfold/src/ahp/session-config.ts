import { placements } from '../config.ts';
import type { AppConfig, Crew, Session, WorkspaceBackend } from '../types.ts';
import { money } from '../../public/core/format.js';

type Json = Record<string, any>;
type Approval = 'manual' | 'auto';

/** The AHP spelling of each engine approval: VS Code recognises `approvalMode` with `manual` and `allow-all` and renders its own approvals picker for it. */
export const approvalModes: Record<Approval, string> = { manual: 'manual', auto: 'allow-all' };
const approvalFromMode: Record<string, Approval> = { manual: 'manual', 'allow-all': 'auto' };
const budgetSteps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
const placementLabels: Record<WorkspaceBackend, string> = { docker: 'Container', kubernetes: 'Pod', local: 'Local directory' };
const isolatedPlacements = new Set<WorkspaceBackend>(['docker', 'kubernetes']);
const configKeys = ['repository', 'crew', 'budgetUsd', 'placement', 'approvalMode', 'title'];

/** The one model the host advertises, so the composer names what runs instead of a gateway model. */
export const composerModelId = 'unfold-crew';

/** Thrown when a session configuration names something this workbench does not offer. */
export class SessionConfigError extends Error {}

/** The composer's model entry: the Ploeg team that authorizes managed execution, the demonstration, or the workbench's own crews. */
export function composerModel(config: AppConfig): { id: string; name: string } {
  if (config.mode === 'demo') return { id: composerModelId, name: 'Demo crew · no model calls' };
  if (config.execution?.team) return { id: composerModelId, name: `Ploeg crew · ${config.execution.team}` };
  return { id: composerModelId, name: 'Unfold crew' };
}

const dollars = (amount: number): string => money(amount);
const budgetValue = (amount: number) => String(amount);

function defaultPlacement(config: AppConfig): WorkspaceBackend | undefined {
  return placements(config).find(item => item.default)?.id;
}

function effectivePlacement(config: AppConfig, values: Json): WorkspaceBackend | undefined {
  return (values.placement as WorkspaceBackend | undefined) ?? defaultPlacement(config);
}

function offersAutomaticApproval(config: AppConfig, placement: WorkspaceBackend | undefined): boolean {
  return config.mode !== 'demo' && placement !== undefined && isolatedPlacements.has(placement);
}

function roleModel(config: AppConfig, model: string | undefined): string | undefined {
  return (config.models.find(item => item.id === model) ?? config.models[0])?.name;
}

/** One line naming a crew's roles in order, with the configured model each role runs on; the demonstration names none, since it calls no model. */
export function crewDescription(config: AppConfig, crew: Crew): string {
  const roles = crew.roles.map(role => {
    const model = config.mode === 'demo' ? undefined : roleModel(config, role.model);
    return `${role.name} ${role.mode === 'write' ? 'writes' : 'reviews'}${model ? ` on ${model}` : ''}`;
  });
  return `${roles.join(', then ')}.${config.mode === 'demo' ? ' Demonstration: no model calls.' : ''}`;
}

function budgetOptions(config: AppConfig, current?: number): number[] {
  const options = new Set(budgetSteps.filter(step => step <= config.maxBudgetUsd));
  options.add(defaultBudget(config));
  options.add(config.maxBudgetUsd);
  if (current !== undefined) options.add(current);
  return [...options].sort((a, b) => a - b);
}

function defaultBudget(config: AppConfig): number {
  return Math.min(5, config.maxBudgetUsd);
}

function budgetOf(config: AppConfig, value: unknown): number | undefined {
  const amount = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(amount) || amount > config.maxBudgetUsd || amount < 0 || (amount === 0 && config.mode !== 'demo')) return undefined;
  return amount;
}

/**
 * The session configuration schema VS Code 1.141 renders in the new-session composer. Repository is read-only because the
 * Workspace picker decides it; crew, budget and placement are string enums with labels, which is what the Agents window
 * draws as pickers; approvals use the well-known `approvalMode`, offering `allow-all` only for a container or pod placement.
 */
export function sessionConfigSchema(config: AppConfig, values: Json = {}, live?: Session): Json {
  const budget = budgetOf(config, values.budgetUsd);
  const properties: Json = {
    repository: { type: 'string', title: 'Repository', description: 'Chosen with the Workspace picker', readOnly: true, enum: config.repositories.map(repo => repo.id), enumLabels: config.repositories.map(repo => repo.name), enumDescriptions: config.repositories.map(repo => repo.description) },
    crew: { type: 'string', title: 'Crew', description: 'The roles that work on this session, in order', enum: config.crews.map(crew => crew.id), enumLabels: config.crews.map(crew => crew.name), enumDescriptions: config.crews.map(crew => crewDescription(config, crew)), default: config.crews[0]?.id },
  };
  const amounts = budgetOptions(config, budget);
  properties.budgetUsd = { type: 'string', title: 'Budget', description: `The most this session may spend on models, up to ${dollars(config.maxBudgetUsd)}`, enum: amounts.map(budgetValue), enumLabels: amounts.map(dollars), default: budgetValue(defaultBudget(config)) };
  const options = placements(config);
  if (options.length > 1) properties.placement = { type: 'string', title: 'Placement', description: 'Where the crew\'s workspace runs', enum: options.map(item => item.id), enumLabels: options.map(item => placementLabels[item.id]), enumDescriptions: options.map(item => item.name), default: defaultPlacement(config) };
  const placement = live ? live.placement : effectivePlacement(config, values);
  const automatic = offersAutomaticApproval(config, placement);
  properties.approvalMode = {
    type: 'string', title: 'Approvals', description: automatic ? 'Who answers the crew\'s permission requests' : 'Automatic approval needs a container or pod placement',
    enum: automatic ? ['manual', 'allow-all'] : ['manual'], enumLabels: automatic ? ['Ask me', 'Approve inside the sandbox'] : ['Ask me'],
    enumDescriptions: automatic ? ['You approve each permission request', 'The crew\'s permission requests are approved inside its container or pod; questions still reach you'] : ['You approve each permission request'],
    default: 'manual', ...(live && automatic && !['completed', 'failed', 'cancelled'].includes(live.status) ? { sessionMutable: true } : {}),
  };
  properties.title = { type: 'string', title: 'Session title' };
  return { type: 'object', properties, required: ['repository', 'crew', 'budgetUsd'] };
}

/** Defaults for a new session: the picked repository or the first one, the first crew, a 5 US$ budget within the limit, the runtime's default placement and manual approval. */
export function defaultSessionConfig(config: AppConfig, repository?: string): Json {
  const placement = placements(config).length > 1 ? defaultPlacement(config) : undefined;
  return { repository: repository ?? config.repositories[0]?.id, crew: config.crews[0]?.id, budgetUsd: budgetValue(defaultBudget(config)), ...(placement ? { placement } : {}), approvalMode: 'manual' };
}

function pickKnown(requested: unknown): Json {
  if (!requested || typeof requested !== 'object' || Array.isArray(requested)) return {};
  return Object.fromEntries(Object.entries(requested as Json).filter(([key, value]) => configKeys.includes(key) && value !== undefined && value !== null));
}

function normalize(config: AppConfig, requested: Json, strict: boolean): Json {
  const values: Json = {};
  const refuse = (message: string) => { if (strict) throw new SessionConfigError(message); };
  const fallback = defaultSessionConfig(config);
  if (config.repositories.some(repo => repo.id === requested.repository)) values.repository = requested.repository;
  else { refuse('Choose a configured repository and crew'); values.repository = fallback.repository; }
  if (config.crews.some(crew => crew.id === requested.crew)) values.crew = requested.crew;
  else { refuse('Choose a configured repository and crew'); values.crew = fallback.crew; }
  const budget = requested.budgetUsd === undefined ? defaultBudget(config) : budgetOf(config, requested.budgetUsd);
  if (budget === undefined) refuse(`Choose a budget up to ${dollars(config.maxBudgetUsd)}`);
  values.budgetUsd = budgetValue(budget ?? defaultBudget(config));
  const options = placements(config);
  if (options.length > 1) {
    if (requested.placement !== undefined && !options.some(item => item.id === requested.placement)) refuse('Choose an enabled workspace placement');
    values.placement = options.some(item => item.id === requested.placement) ? requested.placement : defaultPlacement(config);
  } else if (requested.placement !== undefined && options.some(item => item.id === requested.placement)) values.placement = requested.placement;
  const mode = requested.approvalMode ?? 'manual';
  const automatic = offersAutomaticApproval(config, effectivePlacement(config, values));
  if (!approvalFromMode[mode]) refuse('Approvals are manual or allow-all');
  if (mode === 'allow-all' && !automatic) refuse('Automatic approval needs a container or pod placement');
  values.approvalMode = mode === 'allow-all' && automatic ? 'allow-all' : 'manual';
  if (typeof requested.title === 'string' && requested.title.trim()) values.title = requested.title.trim().slice(0, 160);
  return values;
}

/** What `resolveSessionConfig` answers: the requested values where this workbench offers them, otherwise the defaults; a picked repository always wins. */
export function resolveSessionConfig(config: AppConfig, requested: unknown, pickedRepository?: string): { schema: Json; values: Json } {
  const values = normalize(config, { ...defaultSessionConfig(config), ...pickKnown(requested), ...(pickedRepository ? { repository: pickedRepository } : {}) }, false);
  return { schema: sessionConfigSchema(config, values), values };
}

/** The configuration a new session is created with; throws {@link SessionConfigError} when it names something this workbench does not offer. */
export function acceptSessionConfig(config: AppConfig, requested: unknown, pickedRepository?: string): Json {
  return normalize(config, { ...defaultSessionConfig(config), ...pickKnown(requested), ...(pickedRepository ? { repository: pickedRepository } : {}) }, true);
}

/** Applies a `session/configChanged` to a session that has not started yet. The repository stays the one the Workspace picker chose. */
export function changePendingConfig(config: AppConfig, current: Json, change: unknown, replace: boolean): Json {
  const requested = pickKnown(change);
  if (requested.repository !== undefined && requested.repository !== current.repository) throw new SessionConfigError('The repository follows the Workspace picker; start a new session to change it');
  return normalize(config, { ...(replace ? { repository: current.repository } : current), ...requested }, true);
}

/** The engine's approval for a configuration's `approvalMode`. */
export function approvalOf(values: Json): Approval {
  return approvalFromMode[values.approvalMode] ?? 'manual';
}

/** A started session's configuration values in the schema's spelling. */
export function sessionConfigValues(session: Session): Json {
  return { repository: session.repositoryId, crew: session.crewId, budgetUsd: budgetValue(session.budgetUsd), title: session.title, ...(session.placement ? { placement: session.placement } : {}), approvalMode: approvalModes[session.approval ?? 'manual'] };
}

/** A started session's `config` in its state: only `approvalMode` stays changeable, and only while the session runs in a container or pod. */
export function sessionConfigState(config: AppConfig, session: Session): Json {
  const values = sessionConfigValues(session);
  return { schema: sessionConfigSchema(config, values, session), values };
}

/** The change a `session/configChanged` asks of a started session: a new approval, or nothing. Any other changed value is refused. */
export function startedConfigChange(session: Session, change: unknown): { approval?: Approval } {
  const requested = pickKnown(change);
  const current = sessionConfigValues(session);
  for (const [key, value] of Object.entries(requested)) {
    if (key === 'approvalMode') continue;
    if (String(value) !== String(current[key])) throw new SessionConfigError(`${key} is fixed once the session has started`);
  }
  if (requested.approvalMode === undefined || requested.approvalMode === current.approvalMode) return {};
  if (!approvalFromMode[requested.approvalMode]) throw new SessionConfigError('Approvals are manual or allow-all');
  return { approval: approvalFromMode[requested.approvalMode] };
}

/** `sessionConfigCompletions` for an enum property, with the labels the schema gives. */
export function sessionConfigCompletions(schema: Json, property: string): { items: { value: string; label: string; description?: string }[] } {
  const entry = schema.properties?.[property];
  const values: string[] = Array.isArray(entry?.enum) ? entry.enum : [];
  return { items: values.map((value, index) => ({ value, label: entry.enumLabels?.[index] ?? value, ...(entry.enumDescriptions?.[index] ? { description: entry.enumDescriptions[index] } : {}) })) };
}
