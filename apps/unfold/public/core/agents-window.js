/** The URL protocol of each VS Code build that has an Agents window: `productService.urlProtocol` of Stable and of Insiders. */
export const vscodeUrlProtocols = Object.freeze({ stable: 'vscode', insiders: 'vscode-insiders' });

/** The session URI schemes the agent host gives a client: `unfold` to VS Code 1.141, `ahp-session` to VS Code 1.142 and every other client. */
export const sessionSchemes = Object.freeze(['unfold', 'ahp-session']);

const sessionIdPattern = /^[A-Za-z0-9_-]{1,80}$/;

/** Whether an address carries a connection token (`tkn`), which VS Code would encode into the authority and so into a link. */
export function carriesConnectionToken(address) {
  return /[?&#]tkn=/i.test(String(address ?? ''));
}

/** The `chat.remoteAgentHosts` address as VS Code keys it: `ws://` dropped, every other spelling kept as written. */
export function normalizedAgentHostAddress(address) {
  const text = String(address ?? '');
  return text.startsWith('ws://') ? text.slice('ws://'.length) : text;
}

/**
 * The connection authority VS Code 1.142 derives from a `chat.remoteAgentHosts` address (`agentHostAuthority` in
 * `platform/agentHost/common/agentHostUri.ts`): `local` becomes `remote_local`, a lowercase alphanumeric address stays,
 * a lowercase host-like address replaces `:` with `__`, and anything else is `hex-` and its UTF-8 bytes in lowercase hex.
 * '' for an empty address.
 */
export function agentHostAuthority(address) {
  const normalized = normalizedAgentHostAddress(address);
  if (!normalized) return '';
  if (normalized === 'local') return 'remote_local';
  if (/^[a-z0-9]+$/.test(normalized)) return normalized;
  if (/^[a-z0-9.:-]+$/.test(normalized) && !/^hex-/i.test(normalized)) return normalized.replaceAll(':', '__');
  return `hex-${[...new TextEncoder().encode(normalized)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** The public session id and scheme of a session URI the agent host gives out (`unfold:/<id>` or `ahp-session:/<id>`), or null. */
export function parseSessionUri(uri) {
  const match = /^([a-z-]+):\/([^/?#]+)$/.exec(String(uri ?? ''));
  return match && sessionSchemes.includes(match[1]) && sessionIdPattern.test(match[2]) ? { scheme: match[1], id: match[2] } : null;
}

/**
 * The link that opens one agent-host session in VS Code's Agents window, as VS Code 1.142's
 * `buildExternalOpenSessionLinkUri` builds it: `<protocol>://agents/agent-host-session/<scheme>/<id>?connectionAuthority=<authority>`.
 * `session` is the URI the host gave that client; `address` is the host's `chat.remoteAgentHosts` address. '' when any part is unusable,
 * and for an address that carries a connection token, so a link never holds one.
 */
export function agentsWindowSessionLink({ protocol = vscodeUrlProtocols.stable, session, address }) {
  const parsed = parseSessionUri(session);
  const authority = agentHostAuthority(address);
  if (!parsed || !authority || carriesConnectionToken(address) || !/^[a-z][a-z0-9+.-]*$/.test(String(protocol))) return '';
  return `${protocol}://agents/agent-host-session/${parsed.scheme}/${parsed.id}?connectionAuthority=${encodeURIComponent(authority)}`;
}

/** The Stable and Insiders links to one session, keyed as {@link vscodeUrlProtocols}. */
export function agentsWindowSessionLinks({ session, address }) {
  return Object.fromEntries(Object.entries(vscodeUrlProtocols).map(([build, protocol]) => [build, agentsWindowSessionLink({ protocol, session, address })]));
}
