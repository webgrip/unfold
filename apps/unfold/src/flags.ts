import { existsSync, readFileSync, unwatchFile, watchFile } from 'node:fs';
import { resolve } from 'node:path';
import { OfrepProvider } from './flag-ofrep.ts';
import { checkSegment, checkSpec, compileSpec, prerequisitesOf, type RolloutSpec, type Segment } from './flag-rollouts.ts';

/** A value a flag variant may carry. */
export type FlagValue = boolean | string | number | Record<string, unknown> | unknown[];
/** The four kinds of flag from Hodgson's Feature Toggles: how long it lives and who changes it. */
export type FlagKind = 'release' | 'experiment' | 'ops' | 'permission';
/** OpenFeature's resolution reasons. */
export type FlagReason = 'STATIC' | 'DEFAULT' | 'TARGETING_MATCH' | 'SPLIT' | 'DISABLED' | 'ERROR';
/** OpenFeature's error codes. */
export type FlagErrorCode = 'FLAG_NOT_FOUND' | 'TYPE_MISMATCH' | 'PARSE_ERROR' | 'GENERAL';
/** Where a flag's effective rule came from, lowest precedence first. */
export type FlagSource = 'code' | 'config' | 'file' | 'console' | 'override';

/** What Unfold records about a flag besides its rule: who owns it, when it goes, and where it shows. */
export interface FlagMetadata {
  kind: FlagKind;
  owner: string;
  created: string;
  expires?: string;
  title: string;
  description: string;
  /** Sent to the browser as an evaluated value in `/api/bootstrap`. */
  client: boolean;
  /** A person may opt in or out of it under Settings › Labs. */
  labs: boolean;
  /** Labs flags that cannot be on for one person at the same time; choosing this one on turns those off. Listed on both sides. */
  excludes?: string[];
}

/** A flagd flag rule: `state`, `variants`, `defaultVariant` and optional JsonLogic `targeting`. */
export interface FlagRule {
  state: 'ENABLED' | 'DISABLED';
  variants: Record<string, FlagValue>;
  defaultVariant: string;
  targeting?: unknown;
}

/** A flag this version of Unfold knows: a flagd rule with Unfold's metadata. */
export interface FlagDefinition extends FlagRule { metadata: FlagMetadata }

/** A flagd document: flag rules and shared `$evaluators`, as in a flagd flag file. */
export interface FlagDocument {
  flags?: Record<string, Partial<FlagRule>>;
  $evaluators?: Record<string, unknown>;
}

/** The code's registry: every flag with its full definition. */
export interface FlagRegistry {
  flags: Record<string, FlagDefinition>;
  $evaluators?: Record<string, unknown>;
}

/** OpenFeature's evaluation context: `targetingKey` plus any attributes targeting reads. */
export interface FlagContext { targetingKey?: string; [attribute: string]: unknown }

/** OpenFeature's resolution details. */
export interface FlagResolution<T extends FlagValue = FlagValue> {
  value: T;
  variant?: string;
  reason: FlagReason;
  errorCode?: FlagErrorCode;
  errorMessage?: string;
  flagMetadata: Record<string, string | number | boolean>;
}

/** OpenFeature's evaluation details: the resolution with its flag key. */
export interface FlagEvaluation<T extends FlagValue = FlagValue> extends FlagResolution<T> { flagKey: string }

/** An administrator's forced variant for everyone, stored by the application. */
export interface FlagOverride { variant: string; reason: string; by: string; at: string }

/** The context an OpenFeature hook receives. */
export interface FlagHookContext { flagKey: string; defaultValue: FlagValue; context: FlagContext; type: FlagValueType }

/** An OpenFeature hook: runs before and after every evaluation, on errors, and finally. */
export interface FlagHook {
  before?(hook: FlagHookContext): void;
  after?(hook: FlagHookContext, details: FlagEvaluation): void;
  error?(hook: FlagHookContext, error: unknown): void;
  finally?(hook: FlagHookContext, details: FlagEvaluation): void;
}

/** The value type an evaluation asks for. */
export type FlagValueType = 'boolean' | 'string' | 'number' | 'object';

/** One flag as an administrator sees it. */
export interface FlagView {
  key: string;
  metadata: FlagMetadata;
  rule: FlagRule;
  source: FlagSource;
  override: FlagOverride | null;
  rollout: RolloutSpec | null;
  expired: boolean;
  evaluation: FlagEvaluation;
  evaluations: Record<string, number>;
  /** Every evaluation since the process started served one variant: a release flag that may be ready to remove. */
  settled: string | null;
}

/** A flag provider: OpenFeature's provider interface, sync or async. */
export interface FlagProvider {
  readonly metadata: { name: string };
  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean, context: FlagContext): FlagResolution<boolean> | Promise<FlagResolution<boolean>>;
  resolveStringEvaluation(flagKey: string, defaultValue: string, context: FlagContext): FlagResolution<string> | Promise<FlagResolution<string>>;
  resolveNumberEvaluation(flagKey: string, defaultValue: number, context: FlagContext): FlagResolution<number> | Promise<FlagResolution<number>>;
  resolveObjectEvaluation<T extends Record<string, unknown> | unknown[]>(flagKey: string, defaultValue: T, context: FlagContext): FlagResolution<T> | Promise<FlagResolution<T>>;
  /** Releases timers and connections. */
  close?(): void;
  /** What the provider last reported about itself, for administrators. */
  status?(): { name: string; ready: boolean; error: string };
}

/** A remote provider speaking OFREP, the OpenFeature Remote Evaluation Protocol, configured by URL. */
export interface OfrepSettings { kind: 'ofrep'; name: string; url: string; apiKeyEnv?: string; tokenEnv?: string; timeoutMs: number; cacheMs: number }
/** The in-process flagd evaluator. */
export interface FlagdSettings { kind: 'flagd' }
/** How several providers combine (OpenFeature MultiProvider): the first that knows the flag, or the first that answers without an error. */
export type FlagStrategy = 'first-match' | 'first-successful';

const kinds: readonly FlagKind[] = ['release', 'experiment', 'ops', 'permission'];
const keyPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const maxRefDepth = 16;
const maxWeightSum = 2147483647;
const watchIntervalMs = 5000;

class FlagParseError extends Error {}

/** A key is `area.feature-name`: lowercase dotted segments, each starting with a letter. */
export function validFlagKey(key: string): boolean { return keyPattern.test(key); }

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function checkRule(rule: unknown, where: string, partial: boolean): Partial<FlagRule> {
  if (!plainObject(rule)) throw new Error(`${where} must be an object`);
  const allowed = ['state', 'variants', 'defaultVariant', 'targeting', 'metadata'];
  for (const key of Object.keys(rule)) if (!allowed.includes(key)) throw new Error(`${where}.${key} is not a flagd flag field`);
  if (rule.state !== undefined && rule.state !== 'ENABLED' && rule.state !== 'DISABLED') throw new Error(`${where}.state must be ENABLED or DISABLED`);
  if (rule.variants !== undefined) {
    if (!plainObject(rule.variants) || !Object.keys(rule.variants).length) throw new Error(`${where}.variants must name at least one variant`);
    for (const [name, value] of Object.entries(rule.variants)) {
      if (!/^[A-Za-z0-9_.-]{1,64}$/.test(name)) throw new Error(`${where}.variants.${name} is not a variant name`);
      if (value === null || value === undefined) throw new Error(`${where}.variants.${name} needs a value`);
    }
  }
  if (rule.defaultVariant !== undefined && typeof rule.defaultVariant !== 'string') throw new Error(`${where}.defaultVariant must name a variant`);
  if (rule.targeting !== undefined && !plainObject(rule.targeting)) throw new Error(`${where}.targeting must be a JsonLogic object`);
  if (!partial) for (const key of ['state', 'variants', 'defaultVariant'] as const) if (rule[key] === undefined) throw new Error(`${where}.${key} is required`);
  return rule as Partial<FlagRule>;
}

function checkMetadata(metadata: unknown, where: string): FlagMetadata {
  if (!plainObject(metadata)) throw new Error(`${where}.metadata must be an object`);
  if (!kinds.includes(metadata.kind as FlagKind)) throw new Error(`${where}.metadata.kind must be one of ${kinds.join(', ')}`);
  for (const key of ['owner', 'title', 'description'] as const) if (typeof metadata[key] !== 'string' || !String(metadata[key]).trim()) throw new Error(`${where}.metadata.${key} is required`);
  if (typeof metadata.created !== 'string' || !datePattern.test(metadata.created)) throw new Error(`${where}.metadata.created must be a date (YYYY-MM-DD)`);
  if (metadata.expires !== undefined && (typeof metadata.expires !== 'string' || !datePattern.test(metadata.expires))) throw new Error(`${where}.metadata.expires must be a date (YYYY-MM-DD)`);
  if ((metadata.kind === 'release' || metadata.kind === 'experiment') && metadata.expires === undefined) throw new Error(`${where}.metadata.expires is required for a ${metadata.kind} flag`);
  for (const key of ['client', 'labs'] as const) if (typeof metadata[key] !== 'boolean') throw new Error(`${where}.metadata.${key} must be true or false`);
  if (metadata.excludes !== undefined && (!Array.isArray(metadata.excludes) || !metadata.excludes.every(key => typeof key === 'string' && validFlagKey(key)))) throw new Error(`${where}.metadata.excludes must list flag keys`);
  return metadata as unknown as FlagMetadata;
}

/** Validates the code's flag registry: every key well-formed, every rule complete and every flag's metadata present. */
export function checkRegistry(raw: unknown): FlagRegistry {
  if (!plainObject(raw) || !plainObject(raw.flags)) throw new Error('The flag registry must have a flags object');
  const flags: Record<string, FlagDefinition> = {};
  for (const [key, value] of Object.entries(raw.flags)) {
    if (!validFlagKey(key)) throw new Error(`Flag key ${key} must be area.feature-name in lowercase`);
    const rule = checkRule(value, `flags.${key}`, false) as FlagRule & { metadata?: unknown };
    if (!Object.hasOwn(rule.variants, rule.defaultVariant)) throw new Error(`flags.${key}.defaultVariant names no variant`);
    flags[key] = { state: rule.state, variants: rule.variants, defaultVariant: rule.defaultVariant, ...(rule.targeting ? { targeting: rule.targeting } : {}), metadata: checkMetadata(rule.metadata, `flags.${key}`) };
  }
  for (const [key, flag] of Object.entries(flags)) {
    for (const other of flag.metadata.excludes ?? []) {
      const partner = flags[other];
      if (other === key || !partner) throw new Error(`flags.${key}.metadata.excludes names ${other}, which is not another registered flag`);
      if (!flag.metadata.labs || !partner.metadata.labs) throw new Error(`flags.${key}.metadata.excludes pairs ${other}; both must be Labs flags`);
      if (!(partner.metadata.excludes ?? []).includes(key)) throw new Error(`flags.${other}.metadata.excludes must name ${key} too: exclusion is mutual`);
    }
  }
  if (raw.$evaluators !== undefined && !plainObject(raw.$evaluators)) throw new Error('$evaluators must be an object');
  return { flags, ...(raw.$evaluators ? { $evaluators: raw.$evaluators as Record<string, unknown> } : {}) };
}

/** Unfold's flag registry, read from `src/flag-registry.json`. */
export function loadRegistry(): FlagRegistry {
  return checkRegistry(JSON.parse(readFileSync(new URL('./flag-registry.json', import.meta.url), 'utf8')));
}

/**
 * Validates a deployment's flagd document against the registry. A rule may change a known flag's state, variants,
 * default variant and targeting, never its metadata. A flag the registry does not know is reported in `unknown` and
 * left out, so a deployment can name a flag before the version that adds it ships.
 */
export function checkDocument(raw: unknown, registry: FlagRegistry, where = 'flags'): { document: FlagDocument; unknown: string[] } {
  if (raw === undefined || raw === null) return { document: {}, unknown: [] };
  if (!plainObject(raw)) throw new Error(`${where} must be a flagd document with a flags object`);
  for (const key of Object.keys(raw)) if (!['flags', '$evaluators', '$schema', 'metadata', 'file', 'providers', 'strategy', 'console'].includes(key)) throw new Error(`${where}.${key} is not a flagd document field`);
  const unknown: string[] = [];
  const flags: Record<string, Partial<FlagRule>> = {};
  if (raw.flags !== undefined) {
    if (!plainObject(raw.flags)) throw new Error(`${where}.flags must be an object`);
    for (const [key, value] of Object.entries(raw.flags)) {
      if (!Object.hasOwn(registry.flags, key)) { unknown.push(key); continue; }
      const rule = checkRule(value, `${where}.flags.${key}`, true) as Partial<FlagRule> & { metadata?: unknown };
      if (rule.metadata !== undefined) throw new Error(`${where}.flags.${key}.metadata belongs to the code's registry, not a deployment`);
      const variants = rule.variants ?? registry.flags[key].variants;
      const defaultVariant = rule.defaultVariant ?? registry.flags[key].defaultVariant;
      if (!Object.hasOwn(variants, defaultVariant)) throw new Error(`${where}.flags.${key}.defaultVariant names no variant`);
      flags[key] = rule;
    }
  }
  if (raw.$evaluators !== undefined && !plainObject(raw.$evaluators)) throw new Error(`${where}.$evaluators must be an object`);
  return { document: { flags, ...(raw.$evaluators ? { $evaluators: raw.$evaluators as Record<string, unknown> } : {}) }, unknown };
}

/**
 * The deployment's flag settings: an inline flagd document, an optional watched flagd file, the providers asked in
 * order with their strategy, and whether administrators may author rollouts in Unfold (`console`).
 */
export interface FlagSettings { document: FlagDocument; file?: string; unknown: string[]; providers?: (FlagdSettings | OfrepSettings)[]; strategy?: FlagStrategy; console?: boolean }

/** Reads `config.flags` and `UNFOLD_FLAGS_FILE`. The file, when named, wins over the inline document and is watched. */
export function flagSettings(raw: unknown, registry: FlagRegistry, env: NodeJS.ProcessEnv = process.env): FlagSettings {
  const { document, unknown } = checkDocument(raw, registry);
  const named = env.UNFOLD_FLAGS_FILE || (plainObject(raw) && typeof raw.file === 'string' ? raw.file : undefined);
  if (plainObject(raw) && raw.file !== undefined && typeof raw.file !== 'string') throw new Error('flags.file must be a path');
  const data = plainObject(raw) ? raw : {};
  if (data.strategy !== undefined && data.strategy !== 'first-match' && data.strategy !== 'first-successful') throw new Error('flags.strategy must be first-match or first-successful');
  if (data.console !== undefined && typeof data.console !== 'boolean') throw new Error('flags.console must be true or false');
  let providers: (FlagdSettings | OfrepSettings)[] = [{ kind: 'flagd' }];
  if (data.providers !== undefined) {
    if (!Array.isArray(data.providers) || !data.providers.length || data.providers.length > 5) throw new Error('flags.providers lists one to five providers');
    const names = new Set<string>();
    providers = data.providers.map((entry: unknown, index: number) => {
      if (!plainObject(entry)) throw new Error(`flags.providers[${index}] must be an object`);
      if (entry.kind === 'flagd') return { kind: 'flagd' } as FlagdSettings;
      if (entry.kind !== 'ofrep') throw new Error(`flags.providers[${index}].kind must be flagd or ofrep`);
      let url: URL;
      try { url = new URL(String(entry.url)); } catch { throw new Error(`flags.providers[${index}].url must be the OFREP base URL`); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`flags.providers[${index}].url must be HTTP(S) without credentials`);
      for (const key of ['apiKeyEnv', 'tokenEnv'] as const) if (entry[key] !== undefined && (typeof entry[key] !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/.test(entry[key] as string))) throw new Error(`flags.providers[${index}].${key} must name an environment variable`);
      const name = typeof entry.name === 'string' && /^[a-z][a-z0-9-]{0,40}$/.test(entry.name) ? entry.name : `ofrep-${index + 1}`;
      if (names.has(name)) throw new Error(`flags.providers[${index}].name repeats`);
      names.add(name);
      const number = (value: unknown, fallback: number, min: number, max: number, key: string) => { if (value === undefined) return fallback; if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`flags.providers[${index}].${key} must be ${min} to ${max}`); return value; };
      return { kind: 'ofrep', name, url: url.href.replace(/\/+$/, ''), ...(entry.apiKeyEnv ? { apiKeyEnv: entry.apiKeyEnv as string } : {}), ...(entry.tokenEnv ? { tokenEnv: entry.tokenEnv as string } : {}), timeoutMs: number(entry.timeoutMs, 10_000, 100, 60_000, 'timeoutMs'), cacheMs: number(entry.cacheMs, 30_000, 0, 3_600_000, 'cacheMs') } as OfrepSettings;
    });
    if (!providers.some(provider => provider.kind === 'flagd')) providers.push({ kind: 'flagd' });
  }
  return { document, ...(named ? { file: resolve(named) } : {}), unknown, providers, strategy: (data.strategy as FlagStrategy | undefined) ?? 'first-match', console: data.console !== false };
}

const truthy = (value: unknown): boolean => Array.isArray(value) ? value.length > 0 : Boolean(value);

function lookup(data: unknown, path: unknown): unknown {
  if (path === '' || path === null || path === undefined) return data && typeof data === 'object' && Object.hasOwn(data, '__item') ? (data as Record<string, unknown>).__item : data;
  let current: unknown = data;
  for (const part of String(path).split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function flagdLookup(data: Record<string, unknown>, path: unknown): unknown {
  const text = String(path ?? '');
  if (text.startsWith('$flagd.')) return lookup(data.$flagd, text.slice('$flagd.'.length));
  return lookup(data, text);
}

/** MurmurHash3 x86 32-bit of a string's UTF-8 bytes with seed 0, the hash flagd's `fractional` buckets by. */
export function murmur3(text: string): number {
  const bytes = new TextEncoder().encode(text);
  let h = 0;
  const blocks = bytes.length >> 2;
  for (let i = 0; i < blocks; i++) {
    let k = bytes[i * 4] | (bytes[i * 4 + 1] << 8) | (bytes[i * 4 + 2] << 16) | (bytes[i * 4 + 3] << 24);
    k = Math.imul(k, 0xcc9e2d51); k = (k << 15) | (k >>> 17); k = Math.imul(k, 0x1b873593);
    h ^= k; h = (h << 13) | (h >>> 19); h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  const tail = blocks * 4;
  const rest = bytes.length & 3;
  if (rest) {
    let k = 0;
    if (rest === 3) k ^= bytes[tail + 2] << 16;
    if (rest >= 2) k ^= bytes[tail + 1] << 8;
    k ^= bytes[tail];
    k = Math.imul(k, 0xcc9e2d51); k = (k << 15) | (k >>> 17); k = Math.imul(k, 0x1b873593); h ^= k;
  }
  h ^= bytes.length;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

/** Where a bucketing value falls in `[0, total)`: flagd's `(uint64(murmur3(value)) * total) >> 32`, in integers. */
export function fractionalBucket(value: string, total: number): number {
  return Number((BigInt(murmur3(value)) * BigInt(total)) >> 32n);
}

function semver(value: unknown): [number, number, number, string] | null {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(value ?? '').trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0), match[4] ?? ''];
}

function compareSemver(a: [number, number, number, string], b: [number, number, number, string]): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return (a[i] as number) < (b[i] as number) ? -1 : 1;
  if (a[3] === b[3]) return 0;
  if (!a[3]) return 1;
  if (!b[3]) return -1;
  return a[3] < b[3] ? -1 : 1;
}

interface Scope { flagKey: string; split: boolean; data: Record<string, unknown> }

function evaluate(rule: unknown, scope: Scope): unknown {
  if (Array.isArray(rule)) return rule.map(item => evaluate(item, scope));
  if (!plainObject(rule)) return rule;
  const ops = Object.keys(rule);
  if (ops.length !== 1) throw new FlagParseError(`A JsonLogic rule has exactly one operator, found ${ops.length}`);
  const op = ops[0];
  const raw = rule[op];
  const args = Array.isArray(raw) ? raw : [raw];
  const value = (index: number) => evaluate(args[index], scope);
  switch (op) {
    case 'var': {
      const path = value(0);
      const found = flagdLookup(scope.data, path);
      return found === undefined ? (args.length > 1 ? value(1) : null) : found;
    }
    case 'if': case '?:': {
      for (let i = 0; i + 1 < args.length; i += 2) if (truthy(value(i))) return value(i + 1);
      return args.length % 2 === 1 ? value(args.length - 1) : null;
    }
    case '==': return value(0) == value(1);
    case '===': return value(0) === value(1);
    case '!=': return value(0) != value(1);
    case '!==': return value(0) !== value(1);
    case '!': return !truthy(value(0));
    case '!!': return truthy(value(0));
    case 'or': { let last: unknown = null; for (let i = 0; i < args.length; i++) { last = value(i); if (truthy(last)) return last; } return last; }
    case 'and': { let last: unknown = null; for (let i = 0; i < args.length; i++) { last = value(i); if (!truthy(last)) return last; } return last; }
    case '<': case '<=': case '>': case '>=': {
      const compare = (a: unknown, b: unknown) => op === '<' ? Number(a) < Number(b) : op === '<=' ? Number(a) <= Number(b) : op === '>' ? Number(a) > Number(b) : Number(a) >= Number(b);
      if (args.length === 3 && (op === '<' || op === '<=')) { const middle = value(1); return compare(value(0), middle) && compare(middle, value(2)); }
      return compare(value(0), value(1));
    }
    case 'in': {
      const needle = value(0);
      const haystack = value(1);
      if (Array.isArray(haystack)) return haystack.includes(needle);
      if (typeof haystack === 'string') return haystack.includes(String(needle));
      return false;
    }
    case 'cat': return args.map((_, index) => { const part = value(index); return part === null || part === undefined ? '' : String(part); }).join('');
    case 'starts_with': { const subject = value(0); const prefix = value(1); return typeof subject === 'string' && typeof prefix === 'string' && subject.startsWith(prefix); }
    case 'ends_with': { const subject = value(0); const suffix = value(1); return typeof subject === 'string' && typeof suffix === 'string' && subject.endsWith(suffix); }
    case 'sem_ver': {
      const left = semver(value(0));
      const operator = value(1);
      const right = semver(value(2));
      if (!left || !right) return false;
      const order = compareSemver(left, right);
      switch (operator) {
        case '=': return order === 0;
        case '!=': return order !== 0;
        case '<': return order < 0;
        case '<=': return order <= 0;
        case '>': return order > 0;
        case '>=': return order >= 0;
        case '^': return left[0] === right[0] && order >= 0;
        case '~': return left[0] === right[0] && left[1] === right[1] && order >= 0;
        default: throw new FlagParseError(`sem_ver does not know the operator ${String(operator)}`);
      }
    }
    case 'fractional': {
      const first = args[0];
      const custom = !(Array.isArray(first) && typeof first[0] === 'string');
      let bucketBy: unknown;
      if (custom) bucketBy = value(0);
      else {
        const key = scope.data.targetingKey;
        if (key === undefined || key === null || key === '' || typeof key !== 'string') return null;
        bucketBy = `${scope.flagKey}${key}`;
      }
      const buckets = (custom ? args.slice(1) : args).map(entry => evaluate(entry, scope));
      if (!buckets.length || buckets.some(entry => !Array.isArray(entry) || typeof entry[0] !== 'string')) throw new FlagParseError('fractional takes [variant, weight] pairs');
      const weights = buckets.map(entry => (entry as unknown[]).length > 1 ? (entry as unknown[])[1] : 1);
      if (weights.some(weight => typeof weight !== 'number' || !Number.isInteger(weight) || weight > maxWeightSum)) throw new FlagParseError('fractional weights must be whole numbers no larger than 2147483647');
      const clamped = (weights as number[]).map(weight => Math.max(0, weight));
      const total = clamped.reduce((sum, weight) => sum + weight, 0);
      if (total > maxWeightSum) throw new FlagParseError('fractional weights add up to more than 2147483647');
      if (total === 0 || bucketBy === null || bucketBy === undefined || typeof bucketBy !== 'string' || bucketBy === '') return null;
      scope.split = true;
      const bucket = fractionalBucket(bucketBy, total);
      let edge = 0;
      for (let i = 0; i < buckets.length; i++) {
        edge += clamped[i];
        if (bucket < edge) return (buckets[i] as unknown[])[0];
      }
      return null;
    }
    case '+': return args.reduce((sum: number, _, index) => sum + Number(value(index)), 0);
    case '*': return args.reduce((product: number, _, index) => product * Number(value(index)), 1);
    case '-': return args.length === 1 ? -Number(value(0)) : Number(value(0)) - Number(value(1));
    case '/': return Number(value(0)) / Number(value(1));
    case '%': return Number(value(0)) % Number(value(1));
    case 'min': return Math.min(...args.map((_, index) => Number(value(index))));
    case 'max': return Math.max(...args.map((_, index) => Number(value(index))));
    case 'merge': return args.flatMap((_, index) => { const part = value(index); return Array.isArray(part) ? part : [part]; });
    case 'missing': { const keys = args.length === 1 && Array.isArray(value(0)) ? value(0) as unknown[] : args.map((_, index) => value(index)); return keys.filter(key => { const found = flagdLookup(scope.data, key); return found === undefined || found === null || found === ''; }); }
    case 'some': case 'all': case 'none': {
      const items = value(0);
      if (!Array.isArray(items)) return op === 'none';
      const test = (item: unknown) => truthy(evaluate(args[1], { ...scope, data: item && typeof item === 'object' && !Array.isArray(item) ? { ...item as Record<string, unknown>, $flagd: scope.data.$flagd } : { $flagd: scope.data.$flagd, __item: item } }));
      if (op === 'some') return items.some(test);
      if (op === 'all') return items.length > 0 && items.every(test);
      return !items.some(test);
    }
    default: throw new FlagParseError(`Unknown JsonLogic operator ${op}`);
  }
}

function resolveRefs(rule: unknown, evaluators: Record<string, unknown>, depth = 0): unknown {
  if (depth > maxRefDepth) throw new FlagParseError('$ref nests too deeply or refers to itself');
  if (Array.isArray(rule)) return rule.map(item => resolveRefs(item, evaluators, depth));
  if (!plainObject(rule)) return rule;
  if (Object.keys(rule).length === 1 && typeof rule.$ref === 'string') {
    if (!Object.hasOwn(evaluators, rule.$ref)) throw new FlagParseError(`$ref names no evaluator ${rule.$ref}`);
    return resolveRefs(evaluators[rule.$ref], evaluators, depth + 1);
  }
  return Object.fromEntries(Object.entries(rule).map(([key, value]) => [key, resolveRefs(value, evaluators, depth)]));
}

function typeOf(value: unknown): FlagValueType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  return 'object';
}

/** A flagd variant key that targeting returned as a boolean resolves as its string form, as flagd does. */
function variantName(result: unknown): string | null {
  if (result === null || result === undefined) return null;
  if (typeof result === 'string') return result;
  if (typeof result === 'boolean' || typeof result === 'number') return String(result);
  throw new FlagParseError('Targeting must return a variant name or null');
}


/**
 * Evaluates flagd documents in process, behind OpenFeature's provider interface. Rules layer from the code's registry,
 * then the configuration file's document, then a watched flagd file, then rollouts administrators authored in Unfold;
 * each layer replaces only the fields it names. Targeting is flagd's JsonLogic with `fractional` (flagd's integer
 * MurmurHash3 bucketing), `sem_ver`, `starts_with`, `ends_with`, `some`, `all`, `none`, arithmetic and `$ref` to
 * shared `$evaluators`, and sees `$flagd.flagKey` and `$flagd.timestamp` (Unix seconds).
 */
export class FlagdProvider implements FlagProvider {
  readonly metadata = { name: 'flagd' } as const;
  readonly registry: FlagRegistry;
  private config: FlagDocument;
  private file: FlagDocument = {};
  private console: Record<string, { spec: RolloutSpec; rule: FlagRule }> = {};
  private readonly now: () => Date;

  constructor(registry: FlagRegistry, config: FlagDocument = {}, now: () => Date = () => new Date()) {
    this.registry = registry;
    this.config = config;
    this.now = now;
  }

  /** Replaces the watched file's document. */
  useFile(document: FlagDocument): void { this.file = document; }
  /** Replaces the inline configuration document. */
  useConfig(document: FlagDocument): void { this.config = document; }
  /** Replaces the rollouts authored in Unfold, already compiled. */
  useConsole(rollouts: Record<string, { spec: RolloutSpec; rule: FlagRule }>): void { this.console = { ...rollouts }; }

  /** The effective rule of a known flag and the layer its last change came from; null for an unknown flag. */
  rule(flagKey: string): { rule: FlagRule; source: FlagSource } | null {
    const base = this.registry.flags[flagKey];
    if (!base) return null;
    let source: FlagSource = 'code';
    const rule: FlagRule = { state: base.state, variants: base.variants, defaultVariant: base.defaultVariant, ...(base.targeting ? { targeting: base.targeting } : {}) };
    for (const [layer, document] of [['config', this.config], ['file', this.file]] as const) {
      const change = document.flags?.[flagKey];
      if (!change) continue;
      Object.assign(rule, change);
      source = layer;
    }
    const authored = this.console[flagKey];
    if (authored) { Object.assign(rule, { state: authored.rule.state, defaultVariant: authored.rule.defaultVariant }); if (authored.rule.targeting) rule.targeting = authored.rule.targeting; else delete rule.targeting; source = 'console'; }
    return { rule, source };
  }

  /** The rollout administrators authored for a flag, if any. */
  rollout(flagKey: string): RolloutSpec | null { return this.console[flagKey]?.spec ?? null; }

  /** The flags a flag's authored rollout depends on through prerequisites. */
  prerequisites(flagKey: string): string[] { const spec = this.rollout(flagKey); return spec ? prerequisitesOf(spec) : []; }

  /** The shared evaluators from every layer, later layers winning per name. */
  evaluators(): Record<string, unknown> {
    return { ...(this.registry.$evaluators ?? {}), ...(this.config.$evaluators ?? {}), ...(this.file.$evaluators ?? {}) };
  }

  private resolve<T extends FlagValue>(flagKey: string, defaultValue: T, context: FlagContext, type: FlagValueType): FlagResolution<T> {
    const found = this.rule(flagKey);
    if (!found) return { value: defaultValue, reason: 'ERROR', errorCode: 'FLAG_NOT_FOUND', errorMessage: `Flag ${flagKey} is not in the registry`, flagMetadata: { provider: 'flagd' } };
    const { rule, source } = found;
    const metadata = { provider: 'flagd', source, kind: this.registry.flags[flagKey].metadata.kind };
    const pick = (variant: string, reason: FlagReason): FlagResolution<T> => pickVariant(rule, flagKey, variant, reason, defaultValue, type, metadata);
    if (rule.state === 'DISABLED') return { value: defaultValue, reason: 'DISABLED', flagMetadata: metadata };
    if (!rule.targeting || !Object.keys(rule.targeting as object).length) return pick(rule.defaultVariant, 'STATIC');
    const scope: Scope = { flagKey, split: false, data: { ...context, $flagd: { flagKey, timestamp: Math.floor(this.now().getTime() / 1000) } } };
    try {
      const chosen = variantName(evaluate(resolveRefs(rule.targeting, this.evaluators()), scope));
      if (chosen === null) return pick(rule.defaultVariant, 'DEFAULT');
      return pick(chosen, scope.split ? 'SPLIT' : 'TARGETING_MATCH');
    } catch (error) {
      if (error instanceof FlagParseError) return { value: defaultValue, reason: 'ERROR', errorCode: 'PARSE_ERROR', errorMessage: error.message, flagMetadata: metadata };
      return { value: defaultValue, reason: 'ERROR', errorCode: 'GENERAL', errorMessage: error instanceof Error ? error.message : String(error), flagMetadata: metadata };
    }
  }

  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean, context: FlagContext): FlagResolution<boolean> { return this.resolve(flagKey, defaultValue, context, 'boolean'); }
  resolveStringEvaluation(flagKey: string, defaultValue: string, context: FlagContext): FlagResolution<string> { return this.resolve(flagKey, defaultValue, context, 'string'); }
  resolveNumberEvaluation(flagKey: string, defaultValue: number, context: FlagContext): FlagResolution<number> { return this.resolve(flagKey, defaultValue, context, 'number'); }
  resolveObjectEvaluation<T extends Record<string, unknown> | unknown[]>(flagKey: string, defaultValue: T, context: FlagContext): FlagResolution<T> { return this.resolve(flagKey, defaultValue, context, 'object'); }
  status() { return { name: 'flagd', ready: true, error: '' }; }
}

function pickVariant<T extends FlagValue>(rule: FlagRule, flagKey: string, variant: string, reason: FlagReason, defaultValue: T, type: FlagValueType, metadata: Record<string, string | number | boolean>): FlagResolution<T> {
  if (!Object.hasOwn(rule.variants, variant)) return { value: defaultValue, reason: 'ERROR', errorCode: 'GENERAL', errorMessage: `Targeting returned ${variant}, which is not a variant of ${flagKey}`, flagMetadata: metadata };
  const value = rule.variants[variant];
  if (typeOf(value) !== type) return { value: defaultValue, reason: 'ERROR', errorCode: 'TYPE_MISMATCH', errorMessage: `${flagKey} is a ${typeOf(value)} flag, asked for a ${type}`, flagMetadata: metadata };
  return { value: value as T, variant, reason, flagMetadata: metadata };
}

/** Counts evaluations per flag and variant (or reason, for a value without a variant) since the process started. */
export class EvaluationCounter implements FlagHook {
  private readonly counts = new Map<string, Map<string, number>>();
  after(hook: FlagHookContext, details: FlagEvaluation): void {
    const label = details.variant ?? details.reason.toLowerCase();
    const flag = this.counts.get(hook.flagKey) ?? new Map<string, number>();
    flag.set(label, (flag.get(label) ?? 0) + 1);
    this.counts.set(hook.flagKey, flag);
  }
  /** The counts of one flag, by variant. */
  of(flagKey: string): Record<string, number> { return Object.fromEntries(this.counts.get(flagKey) ?? []); }
}

/** Logs each flag that fails to evaluate once per error code, so a broken rule shows up without flooding the log. */
export class ErrorLogger implements FlagHook {
  private readonly seen = new Set<string>();
  private readonly log: (line: string) => void;
  constructor(log: (line: string) => void = line => console.error(line)) { this.log = log; }
  after(hook: FlagHookContext, details: FlagEvaluation): void {
    if (details.reason !== 'ERROR') return;
    const key = `${hook.flagKey}:${details.errorCode}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.log(JSON.stringify({ level: 'warn', event: 'flag.evaluation_failed', 'feature_flag.key': hook.flagKey, 'feature_flag.provider.name': details.flagMetadata.provider ?? '', 'error.type': details.errorCode, 'feature_flag.error.message': details.errorMessage }));
  }
}

/** Where administrator overrides, authored rollouts and segments persist. */
export interface FlagStore {
  flagOverrides(): Record<string, FlagOverride>;
  setFlagOverride(flagKey: string, override: FlagOverride | null, actor: string): void;
  flagRollouts?(): Record<string, RolloutSpec>;
  setFlagRollout?(flagKey: string, spec: RolloutSpec | null, actor: string, reason: string): void;
  flagSegments?(): Record<string, Segment>;
  setFlagSegment?(name: string, segment: Segment | null, actor: string): void;
}

const notFound = (error: { errorCode?: FlagErrorCode }) => error.errorCode === 'FLAG_NOT_FOUND';

/**
 * Unfold's flag client, shaped like OpenFeature's: typed async `get*Value` and `get*Details` calls over an ordered
 * set of providers (the in-process flagd evaluator and any OFREP service), combined like OpenFeature's MultiProvider,
 * with hooks around every evaluation. An administrator override wins before any provider is asked. Prerequisites are
 * evaluated first and passed on as `flagVariants` (`key=variant`), so a remote provider's rules can read them too.
 */
export class FeatureFlags {
  readonly provider: FlagdProvider;
  readonly providers: FlagProvider[];
  readonly strategy: FlagStrategy;
  readonly console: boolean;
  readonly counter = new EvaluationCounter();
  private readonly hooks: FlagHook[] = [];
  private readonly file?: string;
  private readonly store?: FlagStore;
  private readonly log: (line: string) => void;
  private readonly now: () => Date;
  private overrides: Record<string, FlagOverride> = {};
  private segments: Record<string, Segment> = {};
  private rollouts: Record<string, RolloutSpec> = {};
  private watching = false;
  private fileError = '';

  constructor({ registry = loadRegistry(), settings = { document: {}, unknown: [] } as FlagSettings, store, now = () => new Date(), log = (line: string) => console.error(line), fetcher }: { registry?: FlagRegistry; settings?: FlagSettings; store?: FlagStore; now?: () => Date; log?: (line: string) => void; fetcher?: typeof fetch } = {}) {
    this.provider = new FlagdProvider(registry, settings.document, now);
    this.providers = (settings.providers ?? [{ kind: 'flagd' }]).map(entry => entry.kind === 'flagd' ? this.provider : new OfrepProvider(entry, { log, fetcher, now }));
    this.strategy = settings.strategy ?? 'first-match';
    this.console = settings.console !== false;
    this.file = settings.file;
    this.store = store;
    this.log = log;
    this.now = now;
    this.hooks.push(this.counter, new ErrorLogger(log));
    if (settings.unknown.length) log(JSON.stringify({ level: 'warn', event: 'flag.unknown', flags: settings.unknown, message: 'The configuration names flags this version does not know; they are ignored.' }));
    if (this.file) this.reloadFile();
    this.reloadStore();
  }

  /** Reads overrides, segments and authored rollouts from the store again. */
  reloadStore(): void {
    if (!this.store) return;
    this.overrides = this.store.flagOverrides();
    this.segments = this.store.flagSegments?.() ?? {};
    this.rollouts = this.console ? this.store.flagRollouts?.() ?? {} : {};
    this.compileRollouts();
  }

  private compileRollouts(): void {
    const compiled: Record<string, { spec: RolloutSpec; rule: FlagRule }> = {};
    for (const [key, spec] of Object.entries(this.rollouts)) {
      const base = this.provider.registry.flags[key];
      if (!base) continue;
      compiled[key] = { spec, rule: compileSpec(spec, { flagKey: key, segments: this.segments, labs: base.metadata.labs, variants: this.provider.rule(key)?.rule.variants ?? base.variants }) };
    }
    this.provider.useConsole(compiled);
  }

  /** Adds hooks that run around every evaluation after the built-in counter and error logger. */
  addHooks(...hooks: FlagHook[]): void { this.hooks.push(...hooks); }

  /** Re-reads the flag file. An unreadable or invalid file keeps the last good document and is logged. */
  reloadFile(): boolean {
    if (!this.file) return false;
    try {
      if (!existsSync(this.file)) { this.provider.useFile({}); this.fileError = ''; return true; }
      const { document, unknown } = checkDocument(JSON.parse(readFileSync(this.file, 'utf8')), this.provider.registry, this.file);
      this.provider.useFile(document);
      if (unknown.length) this.log(JSON.stringify({ level: 'warn', event: 'flag.unknown', flags: unknown, file: this.file }));
      this.fileError = '';
      return true;
    } catch (error) {
      this.fileError = error instanceof Error ? error.message : String(error);
      this.log(JSON.stringify({ level: 'error', event: 'flag.file_invalid', file: this.file, message: this.fileError }));
      return false;
    }
  }

  /** Polls the flag file for changes, as a mounted ConfigMap changes, until `close`. Does nothing without a file. */
  watch(): void {
    if (!this.file || this.watching) return;
    this.watching = true;
    watchFile(this.file, { interval: watchIntervalMs, persistent: false }, () => {
      if (this.reloadFile()) this.log(JSON.stringify({ level: 'info', event: 'flag.file_reloaded', file: this.file }));
    });
  }

  /** Stops watching the flag file and closes every provider. */
  close(): void {
    if (this.file && this.watching) unwatchFile(this.file);
    this.watching = false;
    for (const provider of this.providers) provider.close?.();
  }

  /** The flag file's path and the error that made the last reload fail, if any. */
  fileStatus(): { file: string | null; error: string } { return { file: this.file ?? null, error: this.fileError }; }

  /** Each provider's name and health, in the order they are asked. */
  providerStatus(): { name: string; ready: boolean; error: string }[] { return this.providers.map(provider => provider.status?.() ?? { name: provider.metadata.name, ready: true, error: '' }); }

  private async ask<T extends FlagValue>(provider: FlagProvider, flagKey: string, defaultValue: T, context: FlagContext, type: FlagValueType): Promise<FlagResolution<T>> {
    try {
      const resolution = type === 'boolean' ? provider.resolveBooleanEvaluation(flagKey, defaultValue as boolean, context)
        : type === 'string' ? provider.resolveStringEvaluation(flagKey, defaultValue as string, context)
          : type === 'number' ? provider.resolveNumberEvaluation(flagKey, defaultValue as number, context)
            : provider.resolveObjectEvaluation(flagKey, defaultValue as Record<string, unknown>, context);
      const resolved = await resolution as FlagResolution<T>;
      return { ...resolved, flagMetadata: { provider: provider.metadata.name, ...resolved.flagMetadata } };
    } catch (error) {
      return { value: defaultValue, reason: 'ERROR', errorCode: 'GENERAL', errorMessage: error instanceof Error ? error.message : String(error), flagMetadata: { provider: provider.metadata.name } };
    }
  }

  private async enrich(flagKey: string, context: FlagContext): Promise<FlagContext> {
    if (context.flagVariants !== undefined) return context;
    const prerequisites = this.provider.prerequisites(flagKey);
    if (!prerequisites.length) return context;
    const nested = { ...context, flagVariants: [] };
    const variants: string[] = [];
    for (const key of prerequisites) {
      const result = await this.resolveAll(key, this.fallbackOf(key), nested, typeOf(this.fallbackOf(key)));
      if (result.variant) variants.push(`${key}=${result.variant}`);
    }
    return { ...context, flagVariants: variants };
  }

  private fallbackOf(flagKey: string): FlagValue {
    const base = this.provider.registry.flags[flagKey];
    return base ? base.variants[base.defaultVariant] : false;
  }

  private async resolveAll<T extends FlagValue>(flagKey: string, defaultValue: T, context: FlagContext, type: FlagValueType): Promise<FlagResolution<T>> {
    const override = this.overrides[flagKey];
    const base = this.provider.registry.flags[flagKey];
    if (override && base && Object.hasOwn(base.variants, override.variant)) return pickVariant(this.provider.rule(flagKey)!.rule, flagKey, override.variant, 'STATIC', defaultValue, type, { provider: 'unfold', source: 'override', kind: base.metadata.kind });
    let last: FlagResolution<T> | null = null;
    for (const provider of this.providers) {
      const result = await this.ask(provider, flagKey, defaultValue, context, type);
      last = result;
      if (result.reason !== 'ERROR') return result;
      if (this.strategy === 'first-match' && !notFound(result)) return result;
    }
    return last ?? { value: defaultValue, reason: 'ERROR', errorCode: 'FLAG_NOT_FOUND', flagMetadata: {} };
  }

  private async run<T extends FlagValue>(flagKey: string, defaultValue: T, context: FlagContext, type: FlagValueType): Promise<FlagEvaluation<T>> {
    const hook: FlagHookContext = { flagKey, defaultValue, context, type };
    let details: FlagEvaluation<T> = { flagKey, value: defaultValue, reason: 'ERROR', errorCode: 'GENERAL', flagMetadata: {} };
    try {
      for (const entry of this.hooks) entry.before?.(hook);
      details = { flagKey, ...(await this.resolveAll(flagKey, defaultValue, await this.enrich(flagKey, context), type)) };
      for (const entry of this.hooks) entry.after?.(hook, details);
    } catch (error) {
      for (const entry of this.hooks) entry.error?.(hook, error);
      details = { flagKey, value: defaultValue, reason: 'ERROR', errorCode: 'GENERAL', errorMessage: error instanceof Error ? error.message : String(error), flagMetadata: {} };
    } finally {
      for (const entry of this.hooks) entry.finally?.(hook, details);
    }
    return details;
  }

  getBooleanDetails(flagKey: string, defaultValue: boolean, context: FlagContext = {}): Promise<FlagEvaluation<boolean>> { return this.run(flagKey, defaultValue, context, 'boolean'); }
  async getBooleanValue(flagKey: string, defaultValue: boolean, context: FlagContext = {}): Promise<boolean> { return (await this.getBooleanDetails(flagKey, defaultValue, context)).value; }
  getStringDetails(flagKey: string, defaultValue: string, context: FlagContext = {}): Promise<FlagEvaluation<string>> { return this.run(flagKey, defaultValue, context, 'string'); }
  async getStringValue(flagKey: string, defaultValue: string, context: FlagContext = {}): Promise<string> { return (await this.getStringDetails(flagKey, defaultValue, context)).value; }
  getNumberDetails(flagKey: string, defaultValue: number, context: FlagContext = {}): Promise<FlagEvaluation<number>> { return this.run(flagKey, defaultValue, context, 'number'); }
  async getNumberValue(flagKey: string, defaultValue: number, context: FlagContext = {}): Promise<number> { return (await this.getNumberDetails(flagKey, defaultValue, context)).value; }
  getObjectDetails<T extends Record<string, unknown> | unknown[]>(flagKey: string, defaultValue: T, context: FlagContext = {}): Promise<FlagEvaluation<T>> { return this.run(flagKey, defaultValue, context, 'object'); }
  async getObjectValue<T extends Record<string, unknown> | unknown[]>(flagKey: string, defaultValue: T, context: FlagContext = {}): Promise<T> { return (await this.getObjectDetails(flagKey, defaultValue, context)).value; }

  /** Evaluates one flag with its code default variant's value as the fallback, whatever its type. */
  details(flagKey: string, context: FlagContext): Promise<FlagEvaluation> {
    const fallback = this.fallbackOf(flagKey);
    return this.run(flagKey, fallback, context, typeOf(fallback));
  }

  /** Every flag the browser may see, evaluated for one context. Targeting rules never leave the server. */
  async clientDetails(context: FlagContext): Promise<FlagEvaluation[]> {
    const keys = Object.entries(this.provider.registry.flags).filter(([, flag]) => flag.metadata.client).map(([key]) => key);
    return Promise.all(keys.map(key => this.details(key, context)));
  }

  /** Every flag the browser may see, as `{ key: value }`. */
  async clientValues(context: FlagContext): Promise<Record<string, FlagValue>> {
    return Object.fromEntries((await this.clientDetails(context)).map(details => [details.flagKey, details.value]));
  }

  /** The flags a person may opt in to or out of, each with its metadata and its value for them. */
  async labs(context: FlagContext): Promise<{ key: string; metadata: FlagMetadata; evaluation: FlagEvaluation }[]> {
    const entries = Object.entries(this.provider.registry.flags).filter(([, flag]) => flag.metadata.labs);
    return Promise.all(entries.map(async ([key, flag]) => ({ key, metadata: flag.metadata, evaluation: await this.details(key, context) })));
  }

  /** Whether a flag's removal date has passed. */
  expired(flagKey: string): boolean {
    const expires = this.provider.registry.flags[flagKey]?.metadata.expires;
    return Boolean(expires) && this.now().toISOString().slice(0, 10) > String(expires);
  }

  /** Every flag with its effective rule, source, override, rollout, expiry and evaluation for one context, for administrators. */
  async list(context: FlagContext): Promise<FlagView[]> {
    return Promise.all(Object.entries(this.provider.registry.flags).map(async ([key, flag]) => {
      const effective = this.provider.rule(key)!;
      const override = this.overrides[key] ?? null;
      const evaluations = this.counter.of(key);
      const served = Object.keys(evaluations);
      const total = Object.values(evaluations).reduce((sum, count) => sum + count, 0);
      return { key, metadata: flag.metadata, rule: effective.rule, source: override ? 'override' as const : effective.source, override, rollout: this.provider.rollout(key), expired: this.expired(key), evaluation: await this.details(key, context), evaluations, settled: served.length === 1 && total >= 50 ? served[0] : null };
    }));
  }

  /** The segments administrators defined. */
  segmentList(): Segment[] { return Object.values(this.segments).sort((a, b) => a.name.localeCompare(b.name)); }

  private requireStore(): FlagStore {
    if (!this.store?.setFlagRollout || !this.store.setFlagSegment) throw Object.assign(new Error('This workbench keeps no flag store.'), { status: 409, code: 'flag_store' });
    if (!this.console) throw Object.assign(new Error('Rollouts are managed in Git on this workbench (flags.console is false).'), { status: 409, code: 'flag_console_off' });
    return this.store;
  }

  /** Validates, stores and applies an authored rollout, or clears it (`null`) so the Git rules apply again. */
  setRollout(flagKey: string, raw: unknown | null, actor: string, reason: string): RolloutSpec | null {
    const base = this.provider.registry.flags[flagKey];
    if (!base) throw Object.assign(new Error(`Flag ${flagKey} is not in the registry.`), { status: 404, code: 'flag_not_found' });
    const store = this.requireStore();
    let spec: RolloutSpec | null = null;
    if (raw !== null) {
      try { spec = checkSpec(raw, { variants: Object.keys(this.provider.rule(flagKey)!.rule.variants), segments: Object.keys(this.segments), flags: Object.keys(this.provider.registry.flags), flagKey }); }
      catch (error) { throw Object.assign(error as Error, { status: 400, code: 'flag_rollout' }); }
      for (const prerequisite of prerequisitesOf(spec)) if (this.provider.prerequisites(prerequisite).length) throw Object.assign(new Error(`${prerequisite} has prerequisites of its own; prerequisites are one level deep.`), { status: 400, code: 'flag_rollout' });
    }
    store.setFlagRollout!(flagKey, spec, actor, reason);
    this.reloadStore();
    return spec;
  }

  /** Validates and stores a segment, or deletes it (`null`) when no rollout uses it; every rollout that uses it recompiles. */
  setSegment(name: string, raw: unknown | null, actor: string): Segment | null {
    const store = this.requireStore();
    let segment: Segment | null = null;
    if (raw === null) {
      const users = Object.entries(this.rollouts).filter(([, spec]) => spec.rules.some(rule => rule.audience.segment === name)).map(([key]) => key);
      if (users.length) throw Object.assign(new Error(`The segment is used by ${users.join(', ')}.`), { status: 409, code: 'flag_segment_in_use' });
    } else {
      try { segment = checkSegment({ ...(raw as object), name }); }
      catch (error) { throw Object.assign(error as Error, { status: 400, code: 'flag_segment' }); }
    }
    store.setFlagSegment!(name, segment, actor);
    this.reloadStore();
    return segment;
  }

  /** The flagd document the authored rollouts compile to, to move them into Git or another flagd-compatible service. */
  exportDocument(): { flags: Record<string, FlagRule> } {
    const flags: Record<string, FlagRule> = {};
    for (const key of Object.keys(this.rollouts)) { const effective = this.provider.rule(key); if (effective) flags[key] = effective.rule; }
    return { flags };
  }

  /** Sets or clears an administrator override and persists it. Throws for an unknown flag or variant. */
  setOverride(flagKey: string, variant: string | null, actor: string, reason: string): FlagOverride | null {
    const base = this.provider.registry.flags[flagKey];
    if (!base) throw Object.assign(new Error(`Flag ${flagKey} is not in the registry.`), { status: 404, code: 'flag_not_found' });
    const effective = this.provider.rule(flagKey)!.rule;
    if (variant !== null && !Object.hasOwn(effective.variants, variant)) throw Object.assign(new Error(`Choose one of ${Object.keys(effective.variants).join(', ')}.`), { status: 400, code: 'flag_variant' });
    const override = variant === null ? null : { variant, reason, by: actor, at: this.now().toISOString() };
    if (this.store) { this.store.setFlagOverride(flagKey, override, actor); this.overrides = this.store.flagOverrides(); }
    else if (override) this.overrides = { ...this.overrides, [flagKey]: override };
    else { const { [flagKey]: _removed, ...rest } = this.overrides; this.overrides = rest; }
    return override;
  }

  /** The administrator override of a flag, if one applies. */
  override(flagKey: string): FlagOverride | null { return this.overrides[flagKey] ?? null; }
}
