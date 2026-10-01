import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AppConfig, User } from './types.ts';
import type { Store } from './store.ts';
import { AssetError, assetPurposes, prepareAsset, type AssetPurpose, type MediaType, type PreparedAsset } from './card-assets.ts';

/** The theme format version Vloer reads and writes. */
export const themeSchemaVersion = 1;

/** Every custom property a theme may set and the value it takes; a skin's manifest lists the ones it reads. Mirrors `public/cards/themes.js`. */
export const tokenTypes: Readonly<Record<string, 'color' | 'length'>> = Object.freeze({
  '--gc-accent': 'color', '--gc-surface': 'color', '--gc-radius': 'length',
  '--forge-frame': 'color', '--forge-accent': 'color', '--forge-back': 'color',
});

const tokenPatterns = { color: /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, length: /^(?:[0-9]|[12][0-9]|3[0-2])px$/ };
const slug = /^[a-z0-9][a-z0-9-]{0,63}$/;
const listName = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const assetId = /^[a-f0-9]{64}$/;
const fileAsset = /^[a-z0-9][a-z0-9._-]{0,63}\.(?:svg|png|jpe?g|webp|mp4|webm|glsl)$/;
const themeKeys = new Set(['schemaVersion', 'id', 'name', 'extends', 'tokens', 'frame', 'foilPattern', 'art', 'setSymbol', 'cardBack', 'soundBank']);

export type ThemeArt = { preset: string } | { shader: string } | { media: string };
export type CardTheme = { schemaVersion: 1; id: string; name: string; extends: string; tokens: Record<string, string>; frame: string | null; foilPattern: string | null; art: ThemeArt | null; setSymbol: string | null; cardBack: string | null; soundBank: string | null };
export type ThemeRecord = CardTheme & { version: number; updatedAt: string; updatedBy: string; source: 'store' | 'directory' };
export type ResolvedTheme = ThemeRecord & { assets: Record<string, { purpose: AssetPurpose; mediaType: MediaType; bytes: number }> };
export type SkinRules = { id: string; name: string; themeTokens: string[]; frames: string[]; foilPatterns: string[]; artPresets: string[]; art: string[]; soundBanks: string[]; setSymbol: boolean; cardBack: boolean };
export type AssetInfo = { id: string; purpose: AssetPurpose; mediaType: MediaType; bytes: number };
type Lookup = (reference: string, purpose: AssetPurpose) => AssetInfo | undefined;

export class ThemeError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = 'theme_invalid') { super(message); this.status = status; this.code = code; }
}

function invalid(message: string): never { throw new ThemeError(message); }

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${name} must be an object.`);
  return value as Record<string, unknown>;
}

function listed(value: unknown, list: string[], name: string, skin: string): string | null {
  if (value === undefined || value === null) return null;
  if (!list.length) invalid(`The ${skin} skin does not draw ${name}; leave it out.`);
  if (typeof value !== 'string' || !list.includes(value)) invalid(`${name} must be one of ${list.join(', ')}.`);
  return value;
}

function reference(value: unknown, name: string, purpose: AssetPurpose, lookup: Lookup, types?: readonly string[]): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !(assetId.test(value) || fileAsset.test(value))) invalid(`${name} must name an uploaded asset.`);
  const asset = lookup(value as string, purpose);
  if (!asset) invalid(`${name} names an asset this Vloer does not have.`);
  if (asset.purpose !== purpose || (types && !types.includes(asset.mediaType))) invalid(`${name} names an asset that was uploaded for something else.`);
  return asset.id;
}

/**
 * Checks a theme document against format v1 and the rules of the skin it extends, and returns its normalized form.
 * Every key, token, frame, pattern, preset, art kind and sound bank must be on an allow-list: the format's keys, the
 * runtime's token types, and what the skin's manifest lists. Token values are hex colours or whole pixel lengths, never
 * free CSS. Assets are referenced by id (or, for a theme in the mounted folder, by file name) and must exist with the
 * right purpose. Anything else is refused with a reason.
 */
export function validateTheme(input: unknown, skins: ReadonlyMap<string, SkinRules>, lookup: Lookup): CardTheme {
  const data = record(input, 'A theme');
  for (const key of Object.keys(data)) if (!themeKeys.has(key)) invalid(`A theme has no field ${key}.`);
  if (data.schemaVersion !== themeSchemaVersion) invalid(`schemaVersion must be ${themeSchemaVersion}.`);
  if (typeof data.id !== 'string' || !slug.test(data.id)) invalid('id must be lowercase letters, digits and dashes, up to 64 characters, as in Ploeg’s cardStyle.theme.');
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 80 || /[\x00-\x1f\x7f]/.test(data.name)) invalid('name must be text of 1 to 80 characters.');
  const skin = typeof data.extends === 'string' ? skins.get(data.extends) : undefined;
  if (!skin) invalid(`extends must name a skin this Vloer ships: ${[...skins.keys()].join(', ')}.`);
  const rawTokens = data.tokens === undefined ? {} : record(data.tokens, 'tokens');
  const tokens: Record<string, string> = {};
  for (const [name, value] of Object.entries(rawTokens)) {
    if (!skin.themeTokens.includes(name)) invalid(`The ${skin.id} skin does not read the token ${name}. It reads ${skin.themeTokens.join(', ')}.`);
    const type = tokenTypes[name];
    if (typeof value !== 'string' || !type || !tokenPatterns[type].test(value)) invalid(type === 'length' ? `${name} must be a whole number of pixels from 0px to 32px.` : `${name} must be a hex colour such as #5b8cff.`);
    tokens[name] = value as string;
  }
  let art: ThemeArt | null = null;
  if (data.art !== undefined && data.art !== null) {
    const value = record(data.art, 'art');
    const kinds = Object.keys(value);
    if (kinds.length !== 1 || !['preset', 'shader', 'media'].includes(kinds[0])) invalid('art must be one of { "preset": id }, { "shader": asset } or { "media": asset }.');
    if (!skin.art.includes(kinds[0])) invalid(`The ${skin.id} skin does not draw ${kinds[0]} art.`);
    if (kinds[0] === 'preset') art = { preset: listed(value.preset, skin.artPresets, 'art.preset', skin.id) ?? invalid('art.preset must name a preset.') };
    else if (kinds[0] === 'shader') art = { shader: reference(value.shader, 'art.shader', 'shader', lookup) ?? invalid('art.shader must name a shader asset.') };
    else art = { media: reference(value.media, 'art.media', 'art', lookup) ?? invalid('art.media must name an image or video asset.') };
  }
  if (data.setSymbol !== undefined && data.setSymbol !== null && !skin.setSymbol) invalid(`The ${skin.id} skin does not draw a set symbol.`);
  if (data.cardBack !== undefined && data.cardBack !== null && !skin.cardBack) invalid(`The ${skin.id} skin does not draw a card back.`);
  return {
    schemaVersion: 1,
    id: data.id,
    name: data.name.trim(),
    extends: skin.id,
    tokens,
    frame: listed(data.frame, skin.frames, 'frame', skin.id),
    foilPattern: listed(data.foilPattern, skin.foilPatterns, 'foilPattern', skin.id),
    art,
    setSymbol: reference(data.setSymbol, 'setSymbol', 'symbol', lookup),
    cardBack: reference(data.cardBack, 'cardBack', 'back', lookup, assetPurposes.back),
    soundBank: data.soundBank === undefined || data.soundBank === null ? null : skin.soundBanks.length ? listed(data.soundBank, skin.soundBanks, 'soundBank', skin.id) : invalid(`The ${skin.id} skin has no sound banks yet; leave soundBank out.`),
  };
}

function strings(value: unknown, name: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !listName.test(item))) throw new Error(`${name} must list names`);
  return [...new Set(value as string[])];
}

/** Reads the theme rules of every skin pack shipped under `public/cards/skins/`, from each manifest's `themeTokens` and `theme` section. */
export function loadSkinRules(publicDir: string): Map<string, SkinRules> {
  const root = join(publicDir, 'cards', 'skins');
  const skins = new Map<string, SkinRules>();
  let folders: string[] = [];
  try { folders = readdirSync(root).filter(name => slug.test(name)).sort(); } catch (error: any) { if (error?.code !== 'ENOENT') throw error; }
  for (const id of folders) {
    const manifest = JSON.parse(readFileSync(join(root, id, 'manifest.json'), 'utf8'));
    if (manifest.id !== id) throw new Error(`Skin manifest ${id} names another skin`);
    const section = manifest.theme ?? {};
    const themeTokens: unknown = manifest.themeTokens ?? [];
    if (!Array.isArray(themeTokens) || themeTokens.some(token => typeof token !== 'string' || !Object.hasOwn(tokenTypes, token))) throw new Error(`Skin ${id} lists a theme token the runtime does not know`);
    skins.set(id, { id, name: String(manifest.name), themeTokens: [...new Set(themeTokens as string[])], frames: strings(section.frames, `${id}.theme.frames`), foilPatterns: strings(section.foilPatterns, `${id}.theme.foilPatterns`), artPresets: strings(section.artPresets, `${id}.theme.artPresets`), art: strings(section.art, `${id}.theme.art`), soundBanks: strings(section.soundBanks, `${id}.theme.soundBanks`), setSymbol: section.setSymbol === true, cardBack: section.cardBack === true });
  }
  return skins;
}

type Row = { id: string; version: number; updated_at: string; updated_by: string; body: string };

/**
 * Card themes and their assets. Themes live in Vloer's store with every saved version kept, and optionally also in a
 * mounted folder (`cardThemes.directory`), whose themes are read-only and win over a stored theme of the same id.
 * Assets are stored by the SHA-256 of their content, within the configured quota.
 */
export class CardThemes {
  readonly skins: Map<string, SkinRules>;
  readonly quotaBytes: number;
  readonly directoryPath: string | undefined;
  readonly problems: { file: string; message: string }[] = [];
  private readonly store: Store;
  private readonly directory = new Map<string, ThemeRecord>();
  private readonly directoryAssets = new Map<string, PreparedAsset>();

  constructor(store: Store, config: AppConfig) {
    this.store = store;
    this.skins = loadSkinRules(config.publicDir);
    this.quotaBytes = (config.cardThemes?.assetQuotaMb ?? 256) * 1024 * 1024;
    this.directoryPath = config.cardThemes?.directory;
    if (this.directoryPath) this.loadDirectory(this.directoryPath);
  }

  private loadDirectory(path: string): void {
    const assets = join(path, 'assets');
    let names: string[] = [];
    try { names = statSync(assets).isDirectory() ? readdirSync(assets).filter(name => fileAsset.test(name)) : []; } catch { names = []; }
    const available = new Set(names);
    const lookup: Lookup = (reference, purpose) => {
      if (!fileAsset.test(reference)) return this.assetInfo(reference);
      if (!available.has(reference)) throw new ThemeError(`assets/${reference} is not in the mounted themes folder.`);
      const asset = prepareAsset(purpose, readFileSync(join(assets, reference)));
      const known = this.directoryAssets.get(asset.id);
      if (known && known.purpose !== asset.purpose) throw new ThemeError(`assets/${reference} is used for two different purposes.`);
      this.directoryAssets.set(asset.id, asset);
      return { id: asset.id, purpose: asset.purpose, mediaType: asset.mediaType, bytes: asset.content.length };
    };
    let themes: string[] = [];
    try { themes = readdirSync(path).filter(name => /^[a-z0-9][a-z0-9-]{0,63}\.json$/.test(name)).sort(); }
    catch (error: any) { this.problem('.', error?.message || 'The folder could not be read.'); }
    for (const name of themes.slice(0, 200)) {
      try {
        const theme = validateTheme(JSON.parse(readFileSync(join(path, name), 'utf8')), this.skins, lookup);
        if (`${theme.id}.json` !== name) throw new ThemeError(`The file must be named ${theme.id}.json.`);
        this.directory.set(theme.id, { ...theme, version: 0, updatedAt: statSync(join(path, name)).mtime.toISOString(), updatedBy: 'directory', source: 'directory' });
      } catch (error: any) { this.problem(name, error instanceof SyntaxError ? 'The file is not valid JSON.' : error?.message); }
    }
  }

  private problem(file: string, message: string | undefined): void {
    this.problems.push({ file, message: String(message || 'Refused.').slice(0, 300) });
    console.error(JSON.stringify({ level: 'warn', event: 'card_theme.directory_refused', file, message: String(message || '').slice(0, 300) }));
  }

  /** Every theme, mounted ones first, without their tokens or assets. */
  list(): { id: string; name: string; extends: string; version: number; updatedAt: string; updatedBy: string; source: 'store' | 'directory' }[] {
    const stored = (this.store.db.prepare('SELECT id,version,updated_at,updated_by,body FROM card_themes ORDER BY id').all() as Row[]).map(row => this.fromRow(row)).filter(theme => !this.directory.has(theme.id));
    return [...this.directory.values(), ...stored].map(({ id, name, extends: skin, version, updatedAt, updatedBy, source }) => ({ id, name, extends: skin, version, updatedAt, updatedBy, source }));
  }

  /** A theme with the metadata of the assets it references, or undefined. */
  get(id: string): ResolvedTheme | undefined {
    const theme = this.record(id);
    return theme ? this.resolve(theme) : undefined;
  }

  private record(id: string): ThemeRecord | undefined {
    if (!slug.test(id)) return undefined;
    const mounted = this.directory.get(id);
    if (mounted) return mounted;
    const row = this.store.db.prepare('SELECT id,version,updated_at,updated_by,body FROM card_themes WHERE id=?').get(id) as Row | undefined;
    return row ? this.fromRow(row) : undefined;
  }

  private fromRow(row: Row): ThemeRecord {
    return { ...(JSON.parse(row.body) as CardTheme), version: Number(row.version), updatedAt: row.updated_at, updatedBy: row.updated_by, source: 'store' };
  }

  private resolve(theme: ThemeRecord): ResolvedTheme {
    const ids = [theme.setSymbol, theme.cardBack, theme.art && 'shader' in theme.art ? theme.art.shader : null, theme.art && 'media' in theme.art ? theme.art.media : null].filter((value): value is string => Boolean(value));
    const assets: ResolvedTheme['assets'] = {};
    for (const id of ids) { const info = this.assetInfo(id); if (info) assets[id] = { purpose: info.purpose, mediaType: info.mediaType, bytes: info.bytes }; }
    return { ...theme, assets };
  }

  /**
   * Creates or updates a stored theme. A new theme needs `baseVersion` 0 or none; an update needs the version it was
   * edited from, so two administrators never overwrite each other silently. Every save is kept as a version.
   */
  save(id: string, input: unknown, baseVersion: unknown, user: User): ResolvedTheme {
    if (!slug.test(id)) throw new ThemeError('A theme id is lowercase letters, digits and dashes.', 404, 'not_found');
    const theme = validateTheme(input, this.skins, reference => this.assetInfo(reference));
    if (theme.id !== id) throw new ThemeError('The theme’s id must match the address it is saved to.');
    if (this.directory.has(id)) throw new ThemeError('This theme comes from the mounted themes folder and cannot be changed here. Change its file instead.', 409, 'theme_managed');
    if (baseVersion !== undefined && baseVersion !== null && (typeof baseVersion !== 'number' || !Number.isSafeInteger(baseVersion) || baseVersion < 0)) throw new ThemeError('baseVersion must be the version you edited, or 0 for a new theme.');
    const at = new Date().toISOString();
    const body = JSON.stringify(theme);
    const saved = this.store.transaction(() => {
      const current = this.store.db.prepare('SELECT version FROM card_themes WHERE id=?').get(id) as { version: number } | undefined;
      const expected = typeof baseVersion === 'number' ? baseVersion : 0;
      if ((current ? Number(current.version) : 0) !== expected) throw new ThemeError(current ? `Someone saved version ${current.version} of this theme after you opened it. Reload it and make your change again.` : 'This theme was deleted after you opened it. Save it as a new theme.', 409, 'theme_changed');
      const version = expected + 1;
      this.store.db.prepare('INSERT INTO card_themes(id,version,updated_at,updated_by,body) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,updated_at=excluded.updated_at,updated_by=excluded.updated_by,body=excluded.body').run(id, version, at, user.name, body);
      this.store.db.prepare('INSERT INTO card_theme_versions(theme_id,version,saved_at,saved_by,body) VALUES(?,?,?,?,?)').run(id, version, at, user.name, body);
      return version;
    });
    return this.resolve({ ...theme, version: saved, updatedAt: at, updatedBy: user.name, source: 'store' });
  }

  /** Deletes a stored theme and its versions. Cards that name it draw their skin without a theme. */
  remove(id: string): void {
    if (this.directory.has(id)) throw new ThemeError('This theme comes from the mounted themes folder and cannot be deleted here.', 409, 'theme_managed');
    const removed = this.store.transaction(() => {
      this.store.db.prepare('DELETE FROM card_theme_versions WHERE theme_id=?').run(id);
      return Number(this.store.db.prepare('DELETE FROM card_themes WHERE id=?').run(id).changes);
    });
    if (!removed) throw new ThemeError('Theme not found.', 404, 'not_found');
  }

  /** The saved versions of a stored theme, newest first. */
  versions(id: string): { version: number; savedAt: string; savedBy: string }[] {
    return (this.store.db.prepare('SELECT version,saved_at,saved_by FROM card_theme_versions WHERE theme_id=? ORDER BY version DESC LIMIT 50').all(id) as { version: number; saved_at: string; saved_by: string }[]).map(row => ({ version: Number(row.version), savedAt: row.saved_at, savedBy: row.saved_by }));
  }

  /** One saved version of a stored theme, with its asset metadata. */
  version(id: string, version: number): ResolvedTheme | undefined {
    const row = this.store.db.prepare('SELECT theme_id AS id,version,saved_at AS updated_at,saved_by AS updated_by,body FROM card_theme_versions WHERE theme_id=? AND version=?').get(id, version) as Row | undefined;
    return row ? this.resolve(this.fromRow(row)) : undefined;
  }

  /** Stores an uploaded asset after `prepareAsset` accepted it, once per content, within the quota. */
  putAsset(purpose: string, bytes: Buffer, user: User): AssetInfo {
    const asset = prepareAsset(purpose, bytes);
    const existing = this.assetInfo(asset.id);
    if (existing) {
      if (existing.purpose !== asset.purpose) throw new AssetError('This file was already uploaded for something else.', 409, 'asset_purpose');
      return existing;
    }
    const used = Number((this.store.db.prepare('SELECT COALESCE(SUM(bytes),0) AS total FROM card_assets').get() as { total: number }).total);
    if (used + asset.content.length > this.quotaBytes) throw new AssetError(`Theme assets would exceed their ${Math.round(this.quotaBytes / 1024 / 1024)} MiB quota. Ask an administrator to raise cardThemes.assetQuotaMb.`, 507, 'asset_quota');
    this.store.db.prepare('INSERT INTO card_assets(id,purpose,media_type,bytes,created_at,created_by,content) VALUES(?,?,?,?,?,?,?)').run(asset.id, asset.purpose, asset.mediaType, asset.content.length, new Date().toISOString(), user.name, asset.content);
    return { id: asset.id, purpose: asset.purpose, mediaType: asset.mediaType, bytes: asset.content.length };
  }

  /** An asset's metadata, from the store or the mounted folder. */
  assetInfo(id: string): AssetInfo | undefined {
    if (!assetId.test(id)) return undefined;
    const mounted = this.directoryAssets.get(id);
    if (mounted) return { id, purpose: mounted.purpose, mediaType: mounted.mediaType, bytes: mounted.content.length };
    const row = this.store.db.prepare('SELECT purpose,media_type,bytes FROM card_assets WHERE id=?').get(id) as { purpose: AssetPurpose; media_type: MediaType; bytes: number } | undefined;
    return row ? { id, purpose: row.purpose, mediaType: row.media_type, bytes: Number(row.bytes) } : undefined;
  }

  /** An asset's bytes and media type. */
  asset(id: string): { mediaType: MediaType; content: Buffer } | undefined {
    if (!assetId.test(id)) return undefined;
    const mounted = this.directoryAssets.get(id);
    if (mounted) return { mediaType: mounted.mediaType, content: mounted.content };
    const row = this.store.db.prepare('SELECT media_type,content FROM card_assets WHERE id=?').get(id) as { media_type: MediaType; content: Uint8Array } | undefined;
    return row ? { mediaType: row.media_type, content: Buffer.from(row.content) } : undefined;
  }
}
