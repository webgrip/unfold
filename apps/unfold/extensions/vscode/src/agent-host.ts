import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { basename, dirname, join } from 'node:path';
import { applyEdits, modify, parse, printParseErrorCode, type ParseError } from 'jsonc-parser';

/** The VS Code setting the Agents window reads its remote agent hosts from. */
export const agentHostsSetting = 'chat.remoteAgentHosts';

export type AgentHostEntry = { address?: string; name?: string; connectionToken?: string };

/** The address as the Agents window stores it: `ws://` hosts lose their scheme, `wss://` hosts keep it, and a root path is dropped. */
export function agentHostAddressKey(address: string | undefined): string | undefined {
  if (!address) return undefined;
  try {
    const url = new URL(/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(address) ? address : `ws://${address}`);
    const secure = url.protocol === 'wss:' || url.protocol === 'https:';
    if (!secure && url.protocol !== 'ws:' && url.protocol !== 'http:') return address;
    url.searchParams.delete('tkn');
    const path = url.pathname !== '/' ? url.pathname : '';
    return `${secure ? 'wss://' : ''}${url.host}${path}${url.search}`;
  } catch { return address; }
}

function sameHost(entry: AgentHostEntry | undefined, address: string): boolean {
  return Boolean(entry?.address) && agentHostAddressKey(entry!.address) === agentHostAddressKey(address);
}

export function agentHostEntry(entries: readonly AgentHostEntry[] | undefined, address: string): AgentHostEntry | undefined {
  return (entries ?? []).find(item => sameHost(item, address));
}

export function withAgentHost(entries: readonly AgentHostEntry[] | undefined, entry: AgentHostEntry): AgentHostEntry[] {
  return [...(entries ?? []).filter(item => !sameHost(item, entry.address ?? '')), entry];
}

export function hasAgentHost(entries: readonly AgentHostEntry[] | undefined, address: string): boolean {
  return Boolean(agentHostEntry(entries, address));
}

export function withoutIssuedAgentHost(entries: readonly AgentHostEntry[] | undefined, address: string, issuedToken: string | undefined): AgentHostEntry[] {
  return (entries ?? []).filter(item => !(issuedToken && sameHost(item, address) && item.connectionToken === issuedToken));
}

/** The address with its connection token, as the Agents window's Add Remote Agent Host input accepts it. */
export function connectionAddress(address: string, token: string): string {
  const url = new URL(address);
  url.searchParams.set('tkn', token);
  return url.toString();
}

export type SettingsFileProblem = 'unparseable' | 'unwritable' | 'not-an-object';

export class SettingsFileError extends Error {
  readonly path: string;
  readonly problem: SettingsFileProblem;
  constructor(path: string, problem: SettingsFileProblem, message: string) { super(message); this.name = 'SettingsFileError'; this.path = path; this.problem = problem; }
}

export type SettingsLocation = { appName?: string; platform?: string; env?: Record<string, string | undefined>; home?: string };

const userDataFolders: Record<string, string> = {
  'Visual Studio Code': 'Code',
  'Visual Studio Code - Insiders': 'Code - Insiders',
  'Visual Studio Code - Exploration': 'Code - Exploration',
  'VSCodium': 'VSCodium',
  'VSCodium - Insiders': 'VSCodium - Insiders',
  'Cursor': 'Cursor',
};

/**
 * The default profile's `settings.json` of the running editor. Application-scoped settings live there whichever profile a window uses.
 * Derived from the extension's global storage (`<userData>/User[/profiles/<id>]/globalStorage/<extension>`), which also covers
 * portable installs and `--user-data-dir`; otherwise from the product name and the platform's application-data folder.
 */
export function userSettingsFile(globalStorage: string | undefined, location: SettingsLocation = {}): string | undefined {
  if (globalStorage && basename(dirname(globalStorage)) === 'globalStorage') {
    let user = dirname(dirname(globalStorage));
    if (basename(dirname(user)) === 'profiles') user = dirname(dirname(user));
    if (basename(user) === 'User') return join(user, 'settings.json');
  }
  const env = location.env ?? {};
  if (env.VSCODE_PORTABLE) return join(env.VSCODE_PORTABLE, 'user-data', 'User', 'settings.json');
  const folder = location.appName ? userDataFolders[location.appName] : undefined;
  if (!folder || !location.home) return undefined;
  const base = env.VSCODE_APPDATA
    ?? (location.platform === 'darwin' ? join(location.home, 'Library', 'Application Support')
      : location.platform === 'win32' ? env.APPDATA ?? join(location.home, 'AppData', 'Roaming')
        : env.XDG_CONFIG_HOME ?? join(location.home, '.config'));
  return join(base, folder, 'User', 'settings.json');
}

function parseSettings(path: string, text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length) {
    const line = text.slice(0, errors[0].offset).split('\n').length;
    throw new SettingsFileError(path, 'unparseable', `${path} is not valid JSON with comments (${printParseErrorCode(errors[0].error)} on line ${line}), so Unfold left it unchanged.`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SettingsFileError(path, 'not-an-object', `${path} does not hold a settings object, so Unfold left it unchanged.`);
  return value as Record<string, unknown>;
}

function formattingOf(text: string): { insertSpaces: boolean; tabSize: number; eol: string } {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const indent = text.match(/^[ \t]+(?=\S)/m)?.[0];
  if (!indent || indent.startsWith('\t')) return { insertSpaces: false, tabSize: 4, eol };
  return { insertSpaces: true, tabSize: indent.length, eol };
}

/** Reads one top-level setting from settings text; throws a SettingsFileError when the text cannot be parsed. */
export function readSetting(path: string, text: string, key: string): unknown {
  return parseSettings(path, text)[key];
}

/** Sets or, for `undefined`, removes one top-level setting, keeping comments, other keys and the file's indentation. */
export function editSetting(path: string, text: string, key: string, value: unknown): string {
  parseSettings(path, text);
  const base = text.trim() ? text : '{}';
  return applyEdits(base, modify(base, [key], value, { formattingOptions: formattingOf(text) }));
}

async function existing(path: string): Promise<string | undefined> {
  try { return await readFile(path, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

async function resolved(path: string): Promise<string> {
  try { return await realpath(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return path; throw error; }
}

async function nearestFolder(path: string): Promise<string> {
  let folder = dirname(path);
  while (true) {
    try { await stat(folder); return folder; } catch { const parent = dirname(folder); if (parent === folder) return folder; folder = parent; }
  }
}

async function assertWritable(path: string): Promise<void> {
  const target = await resolved(path);
  const exists = await stat(target).then(() => true, () => false);
  try { await access(exists ? target : await nearestFolder(target), constants.W_OK); }
  catch { throw new SettingsFileError(path, 'unwritable', `${path} is not writable, so Unfold cannot add itself to the Agents window.`); }
}

/** Replaces the file in one rename, through a symlink to its target, keeping the file's permissions. A new file is readable by its owner only. */
export async function writeFileAtomically(path: string, text: string): Promise<void> {
  const target = await resolved(path);
  await mkdir(dirname(target), { recursive: true });
  const mode = await stat(target).then(info => info.mode & 0o777, () => 0o600);
  const temporary = join(dirname(target), `.${basename(target)}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await writeFile(temporary, text, { mode, flag: 'wx' });
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

/** Where the `chat.remoteAgentHosts` entries are read and written. */
export interface AgentHostStore {
  readonly kind: 'configuration' | 'file';
  readonly location: string;
  /** The current entries; throws a SettingsFileError when a later update could not be written. */
  read(): Promise<AgentHostEntry[] | undefined>;
  update(change: (entries: AgentHostEntry[] | undefined) => AgentHostEntry[]): Promise<void>;
}

export type SettingsConfiguration = {
  inspect(key: string): { defaultValue?: unknown; globalValue?: unknown } | undefined;
  update(key: string, value: unknown, global: boolean): PromiseLike<void>;
};

function entriesOf(value: unknown): AgentHostEntry[] | undefined {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as AgentHostEntry[] : undefined;
}

export function configurationStore(configuration: SettingsConfiguration): AgentHostStore {
  return {
    kind: 'configuration',
    location: 'User Settings',
    read: async () => entriesOf(configuration.inspect(agentHostsSetting)?.globalValue),
    update: async change => {
      const next = change(entriesOf(configuration.inspect(agentHostsSetting)?.globalValue));
      await configuration.update(agentHostsSetting, next, true);
    },
  };
}

export function fileStore(path: string): AgentHostStore {
  return {
    kind: 'file',
    location: path,
    read: async () => {
      const entries = entriesOf(readSetting(path, (await existing(path)) ?? '', agentHostsSetting));
      await assertWritable(path);
      return entries;
    },
    update: async change => {
      const text = (await existing(path)) ?? '';
      const current = readSetting(path, text, agentHostsSetting);
      const next = change(entriesOf(current));
      if (!next.length && current === undefined) return;
      await writeFileAtomically(path, editSetting(path, text, agentHostsSetting, next));
    },
  };
}

/** True when this window registers `chat.remoteAgentHosts`, so the configuration API accepts it. VS Code 1.141 registers it only in the Agents window. */
export function agentHostsSettingRegistered(configuration: SettingsConfiguration): boolean {
  return Array.isArray(configuration.inspect(agentHostsSetting)?.defaultValue);
}

/** The configuration API when the setting is registered in this window, otherwise the default profile's settings file. */
export function agentHostStore(configuration: SettingsConfiguration, settingsFile: string | undefined): AgentHostStore {
  if (agentHostsSettingRegistered(configuration)) return configurationStore(configuration);
  if (!settingsFile) throw new Error('Unfold could not locate the user settings file of this editor.');
  return fileStore(settingsFile);
}

export type TokenProbe = 'valid' | 'invalid' | 'unknown';

/** Opens and immediately closes a WebSocket handshake with the token: 101 means valid, 401 or 403 invalid, anything else unknown. */
export function probeAgentHostToken(address: string, token: string, timeoutMs = 5_000): Promise<TokenProbe> {
  return new Promise(resolve => {
    let url: URL;
    try { url = new URL(connectionAddress(address, token)); } catch { resolve('unknown'); return; }
    const secure = url.protocol === 'wss:';
    if (!secure && url.protocol !== 'ws:') { resolve('unknown'); return; }
    url.protocol = secure ? 'https:' : 'http:';
    const send = secure ? httpsRequest : httpRequest;
    const req = send(url, { method: 'GET', timeout: timeoutMs, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': randomBytes(16).toString('base64') } });
    req.on('upgrade', (_response, socket) => { socket.destroy(); resolve('valid'); });
    req.on('response', response => { response.resume(); resolve(response.statusCode === 401 || response.statusCode === 403 ? 'invalid' : 'unknown'); });
    req.on('timeout', () => { req.destroy(); resolve('unknown'); });
    req.on('error', () => resolve('unknown'));
    req.end();
  });
}

/** The workbench's identifier of a connection token, the SHA-256 digest it stores, which names the token in `DELETE /api/agent-host/tokens/:id`. */
export function agentHostTokenId(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type IssuedAgentHost = { token: string; entry: AgentHostEntry };

export type AttachRequest = {
  store: AgentHostStore;
  address: string;
  name?: string;
  storedToken: string | undefined;
  when: 'always' | 'missing' | 'present';
  probe(token: string): Promise<TokenProbe>;
  mint(): Promise<IssuedAgentHost>;
  remember(token: string): PromiseLike<void>;
  retire?(token: string): Promise<void>;
};

export type AttachOutcome = { status: 'attached' | 'unchanged' | 'skipped'; minted: boolean };

/**
 * Adds or refreshes the Unfold entry. The store is read first, so an unparseable or unwritable file stops before a token is minted.
 * A stored token is reused unless the workbench rejects it, and a minted token is remembered before the write so a failed write leaves nothing to orphan.
 * A rejected token is then retired on the workbench, in case only the handshake failed.
 */
export async function attachAgentHost(request: AttachRequest): Promise<AttachOutcome> {
  const existingEntry = agentHostEntry(await request.store.read(), request.address);
  if ((request.when === 'missing' && existingEntry) || (request.when === 'present' && !existingEntry)) return { status: 'skipped', minted: false };
  const reusable = request.storedToken && (await request.probe(request.storedToken)) !== 'invalid' ? request.storedToken : undefined;
  if (reusable && existingEntry?.connectionToken === reusable) return { status: 'unchanged', minted: false };
  const issued = reusable ? { token: reusable, entry: { address: request.address, name: request.name ?? 'Unfold', connectionToken: reusable } } : await request.mint();
  if (!reusable) {
    await request.remember(issued.token);
    if (request.storedToken) await request.retire?.(request.storedToken).catch(() => undefined);
  }
  const entry = { ...issued.entry, name: existingEntry?.name ?? issued.entry.name };
  await request.store.update(current => withAgentHost(current, entry));
  return { status: 'attached', minted: !reusable };
}

/** Removes the entry only when it carries the token this editor issued; an entry pasted from elsewhere stays. */
export async function detachAgentHost(store: AgentHostStore, address: string, issuedToken: string | undefined): Promise<boolean> {
  if (!issuedToken) return false;
  const entries = await store.read();
  if (withoutIssuedAgentHost(entries, address, issuedToken).length === (entries ?? []).length) return false;
  await store.update(current => withoutIssuedAgentHost(current, address, issuedToken));
  return true;
}

/** One connection the workbench lists under `attached` in `GET /api/agent-host`: only the signed-in person's own. */
export type AttachedClient = { name?: string; version?: string; connectedAt: string; tokenId?: string };

export type AgentsWindowState =
  | { status: 'connected'; client: AttachedClient }
  | { status: 'not-connected' }
  | { status: 'unknown' };

const agentsWindowClient = 'vscode-agents-window';

/**
 * Whether a VS Code Agents window is attached with this editor's token. `unknown` means the workbench predates the
 * `attached` list, so nothing can be confirmed either way.
 */
export function agentsWindowState(attached: readonly AttachedClient[] | undefined, tokenId: string | undefined): AgentsWindowState {
  if (!Array.isArray(attached)) return { status: 'unknown' };
  const windows = attached.filter(client => client.name === agentsWindowClient);
  const client = windows.find(item => tokenId && item.tokenId === tokenId) ?? (tokenId ? undefined : windows[0]);
  return client ? { status: 'connected', client } : { status: 'not-connected' };
}

/** The status bar text and tooltip for an Agents window state; undefined hides the item. */
export function agentsWindowStatusText(state: AgentsWindowState, host: string): { text: string; tooltip: string } | undefined {
  if (state.status === 'unknown') return undefined;
  if (state.status === 'connected') return { text: 'Unfold · Agents window $(check)', tooltip: `The Agents window is attached to Unfold at ${host}${state.client.version ? ` (VS Code ${state.client.version})` : ''}.` };
  return { text: '$(debug-disconnect) Unfold · Agents window not connected', tooltip: `No Agents window is attached to Unfold at ${host} with this editor's token. Click to troubleshoot.` };
}
