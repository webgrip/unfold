import { compileRarityRules, type RarityMatcher, type RarityRules } from './rarity.ts';
import { compileShapeRules, type ShapeMatcher, type ShapeRules } from './playkpi.ts';
import { newCalendar, newKindMap, defaultCalendar, type Calendar, type Hours, type KindMap, type Kinds } from './flow.ts';
import { newGateMap, type GateMap, type Statuses } from './gate.ts';
import { defaultCardSkin, defaultHotfixLabel, defaultReleaseEnvironment, type CardRules, type CardStyle } from './assemble.ts';

/** One repository's card rules: what Ploeg's `cardStyle`, `release`, `rarity` and `cardShape` said on a Work Target or project. */
export type CardRepositorySettings = { style?: { skin: string; theme?: string }; releaseEnvironment?: string; rarity?: RarityRules; shape?: ShapeRules };
/** One board's card rules, keyed `<provider>:<scope>`: what Ploeg's `statusKinds` and `gates` said on a project. */
export type CardBoardSettings = { statusKinds?: Kinds; gates?: Statuses };
/** One Team's card rules: what Ploeg's `teams.<team>.cards` and `workingHours` said. */
export type CardTeamSettings = { referees?: string[]; hotfixLabels?: string[]; pullRequestComment?: boolean; workingHours?: Hours };
/** The card rules Unfold owns (root ADR-0030). Every setting is optional and takes Ploeg's old default. */
export type CardRuleSettings = { bots?: string[]; flow?: boolean; rarity?: boolean; repositories?: Record<string, CardRepositorySettings>; boards?: Record<string, CardBoardSettings>; teams?: Record<string, CardTeamSettings> };

const repoKey = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const boardKey = /^[a-z][a-z0-9_-]{0,31}:[^\u0000-\u001f]{0,256}$/;
const teamKey = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,99}$/;
const login = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}(?:\[bot\])?$/;
const environment = /^[a-z0-9][a-z0-9._-]{0,62}$/;

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}
function only(value: Record<string, unknown>, path: string, keys: string[]): void {
  const extra = Object.keys(value).find(key => !keys.includes(key));
  if (extra) throw new Error(`${path}.${extra} is not a card setting; it accepts ${keys.join(', ')}`);
}
function strings(value: unknown, path: string, max = 100, pattern?: RegExp): string[] {
  if (!Array.isArray(value) || value.length > max || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 256 || (pattern && !pattern.test(item)))) throw new Error(`${path} must list at most ${max} names`);
  return [...value as string[]];
}
function flag(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be true or false`);
  return value;
}

/** Validates `cards.rules` strictly, compiling every pattern, calendar and status list so a mistake fails at start-up with Ploeg's own message. */
export function validateCardRules(raw: unknown): CardRuleSettings {
  if (raw === undefined) return {};
  const data = object(raw, 'cards.rules');
  only(data, 'cards.rules', ['bots', 'flow', 'rarity', 'repositories', 'boards', 'teams']);
  const out: CardRuleSettings = {};
  if (data.bots !== undefined) out.bots = strings(data.bots, 'cards.rules.bots', 50, login);
  if (data.flow !== undefined) out.flow = flag(data.flow, 'cards.rules.flow');
  if (data.rarity !== undefined) out.rarity = flag(data.rarity, 'cards.rules.rarity');
  if (data.repositories !== undefined) {
    const repositories = object(data.repositories, 'cards.rules.repositories');
    if (Object.keys(repositories).length > 500) throw new Error('cards.rules.repositories names at most 500 repositories');
    out.repositories = {};
    for (const [repo, value] of Object.entries(repositories)) {
      const path = `cards.rules.repositories.${repo}`;
      if (!repoKey.test(repo)) throw new Error(`${path} must be keyed owner/name`);
      const rule = object(value, path);
      only(rule, path, ['style', 'releaseEnvironment', 'rarity', 'shape']);
      const entry: CardRepositorySettings = {};
      if (rule.style !== undefined) {
        const style = object(rule.style, `${path}.style`);
        only(style, `${path}.style`, ['skin', 'theme']);
        if (typeof style.skin !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(style.skin)) throw new Error(`${path}.style.skin must name a skin`);
        if (style.theme !== undefined && (typeof style.theme !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(style.theme))) throw new Error(`${path}.style.theme must name a theme`);
        entry.style = { skin: style.skin, ...(style.theme ? { theme: style.theme as string } : {}) };
      }
      if (rule.releaseEnvironment !== undefined) { if (typeof rule.releaseEnvironment !== 'string' || !environment.test(rule.releaseEnvironment)) throw new Error(`${path}.releaseEnvironment must be a lowercase environment name`); entry.releaseEnvironment = rule.releaseEnvironment; }
      if (rule.rarity !== undefined) {
        const rarity = object(rule.rarity, `${path}.rarity`);
        only(rarity, `${path}.rarity`, ['sensitivePaths', 'attentionPaths', 'sizeExclude']);
        entry.rarity = Object.fromEntries(Object.entries(rarity).map(([key, list]) => [key, strings(list, `${path}.rarity.${key}`)]));
        compileRarityRules(entry.rarity);
      }
      if (rule.shape !== undefined) {
        const shape = object(rule.shape, `${path}.shape`);
        only(shape, `${path}.shape`, ['testPaths', 'docPaths']);
        entry.shape = Object.fromEntries(Object.entries(shape).map(([key, list]) => [key, strings(list, `${path}.shape.${key}`)]));
        compileShapeRules(entry.shape);
      }
      out.repositories[repo.toLowerCase()] = entry;
    }
  }
  if (data.boards !== undefined) {
    const boards = object(data.boards, 'cards.rules.boards');
    out.boards = {};
    for (const [key, value] of Object.entries(boards)) {
      const path = `cards.rules.boards.${key}`;
      if (!boardKey.test(key)) throw new Error(`${path} must be keyed <provider>:<board id>, for example vikunja:10`);
      const rule = object(value, path);
      only(rule, path, ['statusKinds', 'gates']);
      const entry: CardBoardSettings = {};
      if (rule.statusKinds !== undefined) { entry.statusKinds = object(rule.statusKinds, `${path}.statusKinds`) as Kinds; newKindMap(entry.statusKinds); }
      if (rule.gates !== undefined) { entry.gates = object(rule.gates, `${path}.gates`) as Statuses; newGateMap(entry.gates); }
      out.boards[key] = entry;
    }
  }
  if (data.teams !== undefined) {
    const teams = object(data.teams, 'cards.rules.teams');
    out.teams = {};
    for (const [team, value] of Object.entries(teams)) {
      const path = `cards.rules.teams.${team}`;
      if (!teamKey.test(team)) throw new Error(`${path} must be keyed by a Team name`);
      const rule = object(value, path);
      only(rule, path, ['referees', 'hotfixLabels', 'pullRequestComment', 'workingHours']);
      const entry: CardTeamSettings = {};
      if (rule.referees !== undefined) entry.referees = strings(rule.referees, `${path}.referees`, 50, login);
      if (rule.hotfixLabels !== undefined) entry.hotfixLabels = strings(rule.hotfixLabels, `${path}.hotfixLabels`, 20);
      if (rule.pullRequestComment !== undefined) entry.pullRequestComment = flag(rule.pullRequestComment, `${path}.pullRequestComment`);
      if (rule.workingHours !== undefined) { entry.workingHours = object(rule.workingHours, `${path}.workingHours`) as Hours; newCalendar(entry.workingHours); }
      out.teams[team] = entry;
    }
  }
  return out;
}

/** The resolved rules with the board gate maps Unfold uses for display, and the referees of each Team. */
export type ResolvedCardRules = CardRules & { referees(team: string): string[]; pullRequestComment(team: string): boolean; gates(provider: string, scope: string): GateMap | null; bots: string[] };

/** Compiles validated settings into the rules card assembly reads, filling every gap with Ploeg's old default. */
export function resolveCardRules(settings: CardRuleSettings): ResolvedCardRules {
  const rarity = new Map<string, RarityMatcher>();
  const shape = new Map<string, ShapeMatcher>();
  const calendars = new Map<string, Calendar>();
  const kinds = new Map<string, KindMap>();
  const gateMaps = new Map<string, GateMap>();
  const defaultRarity = compileRarityRules();
  const defaultShape = compileShapeRules();
  for (const [repo, rule] of Object.entries(settings.repositories ?? {})) {
    if (rule.rarity) rarity.set(repo, compileRarityRules(rule.rarity));
    if (rule.shape) shape.set(repo, compileShapeRules(rule.shape));
  }
  for (const [team, rule] of Object.entries(settings.teams ?? {})) if (rule.workingHours) calendars.set(team, newCalendar(rule.workingHours));
  for (const [board, rule] of Object.entries(settings.boards ?? {})) {
    if (rule.statusKinds) kinds.set(board, newKindMap(rule.statusKinds));
    if (rule.gates) gateMaps.set(board, newGateMap(rule.gates));
  }
  const fallback = defaultCalendar();
  const repo = (name: string) => settings.repositories?.[name.toLowerCase()];
  return {
    releaseEnvironment: name => repo(name)?.releaseEnvironment ?? defaultReleaseEnvironment,
    hotfixLabels: team => { const labels = settings.teams?.[team]?.hotfixLabels; return labels?.length ? labels.map(label => label.toLowerCase()) : [defaultHotfixLabel]; },
    rarityMatcher: name => rarity.get(name.toLowerCase()) ?? defaultRarity,
    shapeMatcher: name => shape.get(name.toLowerCase()) ?? defaultShape,
    style: (name): CardStyle => { const style = name ? repo(name)?.style : undefined; return { skin: style?.skin ?? defaultCardSkin, theme: style?.theme ?? null }; },
    rarity: settings.rarity !== false,
    flow: settings.flow === false ? null : { kinds: (provider, scope) => kinds.get(`${provider}:${scope}`) ?? null, calendar: team => calendars.get(team) ?? fallback },
    referees: team => settings.teams?.[team]?.referees ?? [],
    pullRequestComment: team => settings.teams?.[team]?.pullRequestComment === true,
    gates: (provider, scope) => gateMaps.get(`${provider}:${scope}`) ?? null,
    bots: settings.bots ?? [],
  };
}
