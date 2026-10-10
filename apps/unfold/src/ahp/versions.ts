/** The released AHP compatibility baselines this host implements, most preferred first. */
export const protocolBaselines = ['1.0.0', '0.9.0'] as const;
/** The baseline `GET /api/agent-host` names as the host's protocol version: the newest one it speaks. */
export const protocolVersion = protocolBaselines[0];
/** What the host names in `data.supportedVersions` of `-32005` when no offered version is in either baseline's range. */
export const supportedVersions = protocolBaselines.map(baseline => `^${baseline}`);
/** The oldest baseline, which a connection speaks until its `initialize` negotiates another. */
export const oldestBaseline = protocolBaselines[protocolBaselines.length - 1];

/** A protocol version that is not three non-negative integers without leading zeros, prerelease or build metadata. */
export class MalformedVersion extends Error {}

type Version = readonly [major: string, minor: string, patch: string];
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const numericOrder = (a: string, b: string) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

function parse(version: unknown): Version {
  const parts = typeof version === 'string' ? semver.exec(version) : null;
  if (!parts) throw new MalformedVersion(`Invalid protocol version: ${JSON.stringify(version)}`);
  return [parts[1], parts[2], parts[3]];
}

/** Orders two protocol versions by SemVer precedence, exactly for components of any length. Throws {@link MalformedVersion} on a malformed one. */
export function compareProtocolVersions(a: string, b: string): number {
  const left = parse(a); const right = parse(b);
  return numericOrder(left[0], right[0]) || numericOrder(left[1], right[1]) || numericOrder(left[2], right[2]);
}

function withinBaseline(version: Version, baseline: Version): boolean {
  if (version[0] !== baseline[0]) return false;
  if (baseline[0] === '0' && version[1] !== baseline[1]) return false;
  return numericOrder(version[1], baseline[1]) > 0 || (version[1] === baseline[1] && numericOrder(version[2], baseline[2]) >= 0);
}

/**
 * Selects the highest offered version within a baseline's caret range (`>=1.0.0 <2.0.0` or `>=0.9.0 <0.10.0`) and
 * returns that exact offered string, regardless of offer order, or undefined when none is in range. Throws
 * {@link MalformedVersion} when any entry is malformed, as the AHP SDK's `negotiateProtocolVersion` does.
 */
export function negotiateProtocolVersion(offered: readonly unknown[]): string | undefined {
  const baselines = protocolBaselines.map(parse);
  const parsed = offered.map(version => [version as string, parse(version)] as const);
  let selected: string | undefined;
  for (const [version, parts] of parsed) {
    if (baselines.some(baseline => withinBaseline(parts, baseline)) && (selected === undefined || compareProtocolVersions(version, selected) > 0)) selected = version;
  }
  return selected;
}

/** Whether a negotiated version is in the 1.x baseline, which carries `SessionSummary.chats` and `defaultChat`. */
export const speaksCatalog = (negotiated: string): boolean => parse(negotiated)[0] !== '0';

const introduced: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['0.1.0', ['root/agentsChanged', 'root/activeSessionsChanged', 'session/ready', 'session/creationFailed', 'session/titleChanged', 'session/serverToolsChanged', 'session/customizationsChanged', 'session/customizationToggled', 'session/customizationUpdated', 'session/isReadChanged', 'session/isArchivedChanged', 'session/activityChanged', 'session/configChanged', 'session/metaChanged', 'root/terminalsChanged', 'root/configChanged', 'terminal/data', 'terminal/input', 'terminal/resized', 'terminal/claimed', 'terminal/titleChanged', 'terminal/cwdChanged', 'terminal/exited', 'terminal/cleared', 'terminal/commandDetectionAvailable', 'terminal/commandExecuted', 'terminal/commandFinished']],
  ['0.2.0', ['session/customizationRemoved', 'session/changesetsChanged', 'changeset/statusChanged', 'changeset/fileSet', 'changeset/fileRemoved', 'changeset/operationsChanged', 'changeset/cleared', 'resourceWatch/changed']],
  ['0.3.0', ['session/mcpServerStateChanged', 'changeset/operationStatusChanged']],
  ['0.4.0', ['session/chatAdded', 'session/chatRemoved', 'session/chatUpdated', 'session/defaultChatChanged', 'chat/turnStarted', 'chat/delta', 'chat/responsePart', 'chat/toolCallStart', 'chat/toolCallDelta', 'chat/toolCallReady', 'chat/toolCallConfirmed', 'chat/toolCallComplete', 'chat/toolCallResultConfirmed', 'chat/toolCallContentChanged', 'chat/turnComplete', 'chat/turnCancelled', 'chat/error', 'chat/usage', 'chat/reasoning', 'chat/pendingMessageSet', 'chat/pendingMessageRemoved', 'chat/queuedMessagesReordered', 'chat/inputRequested', 'chat/inputAnswerChanged', 'chat/inputCompleted', 'chat/truncated', 'changeset/contentChanged', 'annotations/set', 'annotations/updated', 'annotations/removed', 'annotations/entrySet', 'annotations/entryRemoved']],
  ['0.5.0', ['session/activeClientSet', 'session/activeClientRemoved', 'chat/activityChanged', 'chat/draftChanged']],
  ['0.5.1', ['session/inputNeededSet', 'session/inputNeededRemoved', 'chat/turnsLoaded']],
  ['0.5.2', ['session/mcpServerStartRequested', 'session/mcpServerStopRequested']],
  ['0.6.0', ['chat/toolCallAuthRequired', 'chat/toolCallAuthResolved', 'changeset/filesReviewChanged']],
  ['0.7.0', ['session/workingDirectorySet', 'session/workingDirectoryRemoved', 'chat/workingDirectorySet', 'chat/workingDirectoryRemoved']],
  ['0.8.0', ['session/workingDirectoryReplaced', 'automation/createRequested', 'automation/updateRequested', 'automation/set', 'automation/removed', 'automationRun/lifecycleChanged', 'automationRun/sessionSet', 'automationRun/sessionRemoved', 'automationRun/primarySessionChanged', 'automationRun/cancelRequested']],
  ['0.9.0', ['session/chatsReordered', 'session/mcpServerBackgroundRequested', 'chat/turnResume', 'chat/backgroundWorkSet', 'chat/backgroundWorkRemoved', 'chat/movableChanged', 'chat/changesetsChanged', 'chat/isReadChanged', 'chat/isArchivedChanged']],
  ['0.10.0', ['chat/canvasesChanged', 'canvas/stateChanged']],
];
const actionIntroducedIn = new Map(introduced.flatMap(([version, types]) => types.map(type => [type, version] as const)));

/**
 * Whether a client that negotiated `negotiated` knows the action type, by the AHP 1.0.0 registry's `ACTION_INTRODUCED_IN`
 * and `isActionKnownToVersion`. A type the registry does not list is implementation-defined and known to every version.
 */
export function isActionKnownToVersion(type: unknown, negotiated: string): boolean {
  const since = typeof type === 'string' ? actionIntroducedIn.get(type) : undefined;
  return since === undefined || compareProtocolVersions(since, negotiated) <= 0;
}

type Json = Record<string, any>;

/**
 * A session summary's chat catalog for a client that negotiated `negotiated`: `SessionSummary.chats` with the one chat as a
 * `SessionChatSummary`, including its status bits, and `defaultChat`. A 0.9 client gets neither field, because AHP 1.0.0
 * introduced both.
 */
export function sessionChatCatalog(negotiated: string, chat: Json, changes?: Json): Json {
  if (!speaksCatalog(negotiated)) return {};
  const entry = { resource: chat.resource, title: chat.title, ...(chat.origin ? { origin: chat.origin } : {}), ...(chat.interactivity ? { interactivity: chat.interactivity } : {}), status: chat.status, ...(changes ? { changes } : {}) };
  return { chats: [entry], defaultChat: chat.resource };
}

/** The catalog fields of a summary, for a `root/sessionSummaryChanged`; empty when the summary has none. */
export const catalogOf = (summary: Json): Json => summary.chats ? { chats: summary.chats, defaultChat: summary.defaultChat } : {};
