import { vscodeUrlProtocols } from '../../public/core/agents-window.js';

/**
 * The VS Code editor window a person's extension last registered: its build's URL protocol and the window id VS Code's
 * `env.asExternalUri` appends to the extension's own link. VS Code's main process sends a `vscode://` link that carries
 * `windowId` to that window, not to the last-active one, which is the Agents window when the link is clicked there.
 */
export type EditorWindow = { protocol: string; windowId: string };

/** What a link from the Agents window opens in the editor window: the Work Item panel or an Unfold session's panel. */
export type EditorTarget = { kind: 'work-item' | 'session'; id: string };

const protocols = new Set<string>(Object.values(vscodeUrlProtocols));
const targetIds = { 'work-item': /^[1-9][0-9]{0,19}$/, session: /^[A-Za-z0-9_-]{1,80}$/ } as const;

/** Reads an editor-window registration body; undefined when its protocol is not a VS Code build with an Agents window or its window id is not a window number. */
export function parseEditorWindow(value: unknown): EditorWindow | undefined {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const protocol = typeof data.protocol === 'string' ? data.protocol : '';
  const windowId = typeof data.windowId === 'string' ? data.windowId : typeof data.windowId === 'number' ? String(data.windowId) : '';
  return protocols.has(protocol) && /^[1-9][0-9]{0,8}$/.test(windowId) ? { protocol, windowId } : undefined;
}

/** The `<protocol>://webgrip.unfold/<kind>?id=…&origin=…&windowId=…` link the extension in that window handles; '' for an unusable target. */
export function editorLink(window: EditorWindow, target: EditorTarget, origin = ''): string {
  if (!targetIds[target.kind].test(target.id)) return '';
  const query = new URLSearchParams({ id: target.id, ...(origin ? { origin: origin.replace(/\/+$/, '') } : {}), windowId: window.windowId });
  return `${window.protocol}://webgrip.unfold/${target.kind}?${query}`;
}

/**
 * The Markdown part that opens a session's subject outside the Agents window: in the person's VS Code editor window when
 * one is registered, and on the workbench page when the workbench knows its public address. Undefined when neither exists.
 * It ends with a blank line because VS Code renders consecutive Markdown parts as one document.
 */
export function openElsewherePart(id: string, links: { editor?: string; page?: string }, noun: string): Record<string, unknown> | undefined {
  const items = [links.editor ? `[Open the ${noun} in VS Code](${links.editor})` : '', links.page ? `[Open in the browser ↗](${links.page})` : ''].filter(Boolean);
  return items.length ? { kind: 'markdown', id, content: `${items.join(' · ')}\n\n` } : undefined;
}

/** A chat state with one part added at the start of its first turn shown, or of its active turn when it has no finished turn. */
export function withLeadingPart(chat: Record<string, any>, part: Record<string, unknown> | undefined): Record<string, any> {
  if (!part) return chat;
  const lead = (turn: Record<string, any>) => ({ ...turn, responseParts: [part, ...turn.responseParts] });
  if (chat.turns?.length) return { ...chat, turns: [lead(chat.turns[0]), ...chat.turns.slice(1)] };
  return chat.activeTurn ? { ...chat, activeTurn: lead(chat.activeTurn) } : chat;
}
