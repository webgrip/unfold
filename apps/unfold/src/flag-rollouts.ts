import type { FlagRule } from './flags.ts';

/** The largest rollout share, in basis points: 10 000 is 100 %, so a share is precise to 0.01 %. */
export const fullShare = 10_000;
/** How many fixed steps a time-based ramp compiles into. Each step holds for an equal part of the ramp's window. */
export const rampSteps = 20;
/** The context attributes a rollout may bucket people by. */
export const stickinessAttributes = ['targetingKey', 'tenantId', 'role'] as const;
/** The roles an audience may name. */
const roles = ['admin', 'operator', 'viewer'];

/** Who a rule applies to. Every condition it names must hold; an audience with none applies to everyone. */
export interface Audience {
  segment?: string;
  roles?: string[];
  teams?: string[];
  users?: string[];
  tenants?: string[];
  /** Another flag must serve one of these variants first. */
  prerequisite?: { flag: string; variants: string[] };
}

/** When a rule applies: from `start` and before `end`, ISO date-times; either may be absent. */
export interface Window { start?: string; end?: string }

/** What a rule serves: one variant, a weighted split, or a split that moves linearly from one share to another over time. */
export type Serve =
  | { kind: 'variant'; variant: string }
  | { kind: 'split'; weights: Record<string, number>; stickiness?: string }
  | { kind: 'ramp'; variant: string; otherwise: string; from: number; to: number; start: string; end: string; stickiness?: string };

/** One targeting rule. Rules are tried top-down and the first whose audience and window match serves. */
export interface RolloutRule { id: string; description?: string; audience: Audience; window?: Window; serve: Serve }

/**
 * A flag's rollout as an administrator authors it in Unfold: the variant when nothing matches, an optional kill switch,
 * and ordered rules. It compiles to a plain flagd rule, so it runs on any flagd-compatible evaluator.
 */
export interface RolloutSpec { state: 'ENABLED' | 'DISABLED'; defaultVariant: string; respectLabs: boolean; rules: RolloutRule[] }

/** A named audience, reused by rules. */
export interface Segment { name: string; description: string; audience: Omit<Audience, 'segment' | 'prerequisite'> }

const nameList = (value: unknown, where: string, pattern: RegExp, max = 200): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max || value.some(item => typeof item !== 'string' || !pattern.test(item))) throw new Error(`${where} must list at most ${max} names`);
  return [...new Set(value as string[])];
};

const instant = (value: unknown, where: string): string => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(`${where} must be a date and time`);
  return new Date(value).toISOString();
};

const share = (value: unknown, where: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > fullShare) throw new Error(`${where} must be a whole number of basis points from 0 to ${fullShare}`);
  return value;
};

function checkAudience(raw: unknown, where: string, prerequisites = true): Audience {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${where} must be an object`);
  const data = raw as Record<string, unknown>;
  const allowed = ['segment', 'roles', 'teams', 'users', 'tenants', ...(prerequisites ? ['prerequisite'] : [])];
  for (const key of Object.keys(data)) if (!allowed.includes(key)) throw new Error(`${where}.${key} is not an audience condition`);
  const audience: Audience = {};
  if (data.segment !== undefined) { if (typeof data.segment !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(data.segment)) throw new Error(`${where}.segment must name a segment`); audience.segment = data.segment; }
  const list = (key: 'roles' | 'teams' | 'users' | 'tenants', pattern: RegExp) => { const names = nameList(data[key], `${where}.${key}`, pattern); if (names.length) audience[key] = names; };
  list('roles', /^(admin|operator|viewer)$/);
  list('teams', /^[^\u0000-\u001f\u007f]{1,100}$/);
  list('users', /^[A-Za-z0-9_.:@|-]{1,200}$/);
  list('tenants', /^[a-z0-9][a-z0-9-]{0,63}$/);
  if (data.prerequisite !== undefined) {
    const prerequisite = data.prerequisite as Record<string, unknown>;
    if (!prerequisite || typeof prerequisite !== 'object' || typeof prerequisite.flag !== 'string') throw new Error(`${where}.prerequisite needs a flag`);
    const variants = nameList(prerequisite.variants, `${where}.prerequisite.variants`, /^[A-Za-z0-9_.-]{1,64}$/, 20);
    if (!variants.length) throw new Error(`${where}.prerequisite.variants must name at least one variant`);
    audience.prerequisite = { flag: prerequisite.flag, variants };
  }
  return audience;
}

/** Validates a segment. */
export function checkSegment(raw: unknown): Segment {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('A segment must be an object');
  const data = raw as Record<string, unknown>;
  if (typeof data.name !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(data.name)) throw new Error('A segment name is lowercase letters, digits and dashes');
  if (data.description !== undefined && (typeof data.description !== 'string' || data.description.length > 300)) throw new Error('A segment description is at most 300 characters');
  const audience = checkAudience(data.audience, 'audience', false);
  if (audience.segment) throw new Error('A segment cannot name another segment');
  if (!Object.keys(audience).length) throw new Error('A segment needs at least one condition');
  return { name: data.name, description: String(data.description ?? ''), audience };
}

/**
 * Validates a rollout against the flag's variants and the known segments and flags. Shares are basis points; a split's
 * weights must add up to 10 000; a ramp's window must end after it starts.
 */
export function checkSpec(raw: unknown, { variants, segments = [], flags = [], flagKey }: { variants: string[]; segments?: string[]; flags?: string[]; flagKey: string }): RolloutSpec {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('A rollout must be an object');
  const data = raw as Record<string, unknown>;
  const variant = (value: unknown, where: string) => { if (typeof value !== 'string' || !variants.includes(value)) throw new Error(`${where} must be one of ${variants.join(', ')}`); return value; };
  const stickiness = (value: unknown, where: string) => { if (value === undefined) return undefined; if (!(stickinessAttributes as readonly string[]).includes(String(value))) throw new Error(`${where} must be one of ${stickinessAttributes.join(', ')}`); return String(value); };
  if (!Array.isArray(data.rules ?? []) || (data.rules as unknown[] ?? []).length > 50) throw new Error('A rollout has at most 50 rules');
  const ids = new Set<string>();
  const rules = ((data.rules as unknown[]) ?? []).map((entry, index) => {
    const where = `rules[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${where} must be an object`);
    const rule = entry as Record<string, unknown>;
    const id = typeof rule.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(rule.id) ? rule.id : `rule-${index + 1}`;
    if (ids.has(id)) throw new Error(`${where}.id ${id} repeats`);
    ids.add(id);
    const audience = checkAudience(rule.audience, `${where}.audience`);
    if (audience.segment && !segments.includes(audience.segment)) throw new Error(`${where}.audience.segment names no segment ${audience.segment}`);
    if (audience.prerequisite && (audience.prerequisite.flag === flagKey || !flags.includes(audience.prerequisite.flag))) throw new Error(`${where}.audience.prerequisite must name another registered flag`);
    let window: Window | undefined;
    if (rule.window !== undefined) {
      const w = rule.window as Record<string, unknown>;
      if (!w || typeof w !== 'object') throw new Error(`${where}.window must be an object`);
      window = { ...(w.start !== undefined ? { start: instant(w.start, `${where}.window.start`) } : {}), ...(w.end !== undefined ? { end: instant(w.end, `${where}.window.end`) } : {}) };
      if (window.start && window.end && window.end <= window.start) throw new Error(`${where}.window must end after it starts`);
    }
    const serve = rule.serve as Record<string, unknown>;
    if (!serve || typeof serve !== 'object') throw new Error(`${where}.serve must be an object`);
    let checked: Serve;
    if (serve.kind === 'variant') checked = { kind: 'variant', variant: variant(serve.variant, `${where}.serve.variant`) };
    else if (serve.kind === 'split') {
      const weights = serve.weights as Record<string, unknown>;
      if (!weights || typeof weights !== 'object' || !Object.keys(weights).length) throw new Error(`${where}.serve.weights must give each variant a share`);
      const parsed = Object.fromEntries(Object.entries(weights).map(([name, value]) => [variant(name, `${where}.serve.weights`), share(value, `${where}.serve.weights.${name}`)]));
      if (Object.values(parsed).reduce((sum, value) => sum + value, 0) !== fullShare) throw new Error(`${where}.serve.weights must add up to ${fullShare} (100 %)`);
      checked = { kind: 'split', weights: parsed, ...(serve.stickiness !== undefined ? { stickiness: stickiness(serve.stickiness, `${where}.serve.stickiness`) } : {}) };
    } else if (serve.kind === 'ramp') {
      const start = instant(serve.start, `${where}.serve.start`);
      const end = instant(serve.end, `${where}.serve.end`);
      if (end <= start) throw new Error(`${where}.serve must end after it starts`);
      const on = variant(serve.variant, `${where}.serve.variant`);
      const otherwise = variant(serve.otherwise, `${where}.serve.otherwise`);
      if (on === otherwise) throw new Error(`${where}.serve.otherwise must differ from the variant it ramps`);
      checked = { kind: 'ramp', variant: on, otherwise, from: share(serve.from, `${where}.serve.from`), to: share(serve.to, `${where}.serve.to`), start, end, ...(serve.stickiness !== undefined ? { stickiness: stickiness(serve.stickiness, `${where}.serve.stickiness`) } : {}) };
    } else throw new Error(`${where}.serve.kind must be variant, split or ramp`);
    const description = typeof rule.description === 'string' ? rule.description.slice(0, 200) : undefined;
    return { id, ...(description ? { description } : {}), audience, ...(window ? { window } : {}), serve: checked };
  });
  const state = data.state === 'DISABLED' ? 'DISABLED' : 'ENABLED';
  if (data.state !== undefined && data.state !== 'ENABLED' && data.state !== 'DISABLED') throw new Error('state must be ENABLED or DISABLED');
  return { state, defaultVariant: variant(data.defaultVariant, 'defaultVariant'), respectLabs: data.respectLabs !== false, rules };
}

const seconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const timestamp = { var: '$flagd.timestamp' };

function audienceCondition(audience: Omit<Audience, 'segment'>): unknown[] {
  const parts: unknown[] = [];
  if (audience.roles?.length) parts.push({ in: [{ var: 'role' }, audience.roles] });
  if (audience.teams?.length) parts.push({ some: [{ var: 'teams' }, { in: [{ var: '' }, audience.teams] }] });
  if (audience.users?.length) parts.push({ in: [{ var: 'targetingKey' }, audience.users] });
  if (audience.tenants?.length) parts.push({ in: [{ var: 'tenantId' }, audience.tenants] });
  if (audience.prerequisite) { const flag = audience.prerequisite.flag; parts.push({ some: [{ var: 'flagVariants' }, { in: [{ var: '' }, audience.prerequisite.variants.map(variant => `${flag}=${variant}`)] }] }); }
  return parts;
}

function split(weights: [string, number][], stickiness?: string): unknown {
  const buckets = weights.filter(([, weight]) => weight > 0).map(([name, weight]) => [name, weight]);
  if (buckets.length === 1) return buckets[0][0];
  if (!buckets.length) return null;
  return stickiness && stickiness !== 'targetingKey' ? { fractional: [{ cat: [{ var: '$flagd.flagKey' }, { var: stickiness }] }, ...buckets] } : { fractional: buckets };
}

function serveExpression(serve: Serve): unknown {
  if (serve.kind === 'variant') return serve.variant;
  if (serve.kind === 'split') return split(Object.entries(serve.weights), serve.stickiness);
  const start = seconds(serve.start);
  const end = seconds(serve.end);
  const at = (step: number) => Math.round(serve.from + (serve.to - serve.from) * step / rampSteps);
  const fixed = (on: number) => split([[serve.variant, on], [serve.otherwise, fullShare - on]], serve.stickiness);
  const chain: unknown[] = [{ '<': [timestamp, start] }, fixed(serve.from)];
  for (let step = 1; step < rampSteps; step++) chain.push({ '<': [timestamp, Math.floor(start + (end - start) * step / rampSteps)] }, fixed(at(step)));
  chain.push(fixed(serve.to));
  return { if: chain };
}

/**
 * Compiles a rollout to a plain flagd rule: Labs choices first (for a Labs flag), then each rule as an `if` branch in
 * order, segments inlined so the result needs no `$evaluators`, windows as `$flagd.timestamp` bounds, splits as
 * `fractional`, and ramps as twenty fixed `fractional` steps. Nothing matching serves the default variant.
 */
export function compileSpec(spec: RolloutSpec, { flagKey, segments = {}, labs = false, variants }: { flagKey: string; segments?: Record<string, Segment>; labs?: boolean; variants: Record<string, unknown> }): FlagRule {
  const chain: unknown[] = [];
  const on = Object.keys(variants).find(name => variants[name] === true);
  const off = Object.keys(variants).find(name => variants[name] === false);
  if (labs && spec.respectLabs && on && off) chain.push({ in: [flagKey, { var: 'labsOff' }] }, off, { in: [flagKey, { var: 'labs' }] }, on);
  for (const rule of spec.rules) {
    const conditions: unknown[] = [];
    if (rule.audience.segment) conditions.push(...audienceCondition(segments[rule.audience.segment]?.audience ?? { users: [] }));
    conditions.push(...audienceCondition(rule.audience));
    if (rule.window?.start) conditions.push({ '>=': [timestamp, seconds(rule.window.start)] });
    if (rule.window?.end) conditions.push({ '<': [timestamp, seconds(rule.window.end)] });
    const condition = conditions.length === 0 ? true : conditions.length === 1 ? conditions[0] : { and: conditions };
    chain.push(condition, serveExpression(rule.serve));
  }
  const targeting = chain.length ? { if: [...chain, null] } : undefined;
  return { state: spec.state, variants: variants as FlagRule['variants'], defaultVariant: spec.defaultVariant, ...(targeting ? { targeting } : {}) };
}

/** The flags a rollout depends on through prerequisites. */
export function prerequisitesOf(spec: RolloutSpec): string[] {
  return [...new Set(spec.rules.map(rule => rule.audience.prerequisite?.flag).filter((flag): flag is string => Boolean(flag)))];
}

/** A rollout that reproduces the code's rule for a flag, as the starting point an administrator edits. */
export function startingSpec(rule: FlagRule): RolloutSpec {
  return { state: rule.state, defaultVariant: rule.defaultVariant, respectLabs: true, rules: [] };
}

/** The roles an audience may name, for the editor. */
export const audienceRoles: readonly string[] = roles;
