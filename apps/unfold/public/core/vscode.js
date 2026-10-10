import { extensionId } from './checkout.js';

/** Where the Unfold extension is listed for VS Code forks that use Open VSX. */
export const openVsxListing = 'https://open-vsx.org/extension/webgrip/unfold';

/** Opens the Unfold extension in VS Code's own Extensions view, from whichever gallery that editor uses. */
export const extensionViewLink = `vscode:extension/${extensionId}`;

/** The `vscode://` link that asks the Unfold extension to add the workbench at `origin` to VS Code's Agents window. */
export function agentsWindowLink(origin) {
  const query = origin ? `?${new URLSearchParams({ origin: String(origin) })}` : '';
  return `vscode://${extensionId}/connect-agents-window${query}`;
}

/** The address Sessions: Add Remote Agent Host… accepts: the agent host address with the connection token as `tkn`. '' for anything but a ws or wss address. */
export function agentHostConnectionAddress(address, token) {
  try {
    const url = new URL(address);
    if (!['ws:', 'wss:'].includes(url.protocol) || !token) return '';
    url.searchParams.set('tkn', token);
    return url.toString();
  } catch { return ''; }
}
