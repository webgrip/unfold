# De Vloer for VS Code

Direct remote agent crews from your editor. Keep the repository checkout, tool execution and model calls on the workbench server while you inspect progress, make decisions and review evidence in VS Code.

This is the **implemented v0.1 desktop extension** for the current De Vloer API. The wider product design, connector roadmap and future IDE experience are documented in the parent repository under `docs/design/`. Proposed capabilities there are not automatically extension features.

## Start in five minutes

Requirements: Node 24 and Git for the server/demo; VS Code 1.99 or later for the extension. The extension uses the editor's Node extension host and has no runtime npm dependencies. It does not require local OpenCode, Claude Code, Kubernetes tools or provider keys.

In the repository root:

```sh
npm run demo
```

In another terminal:

```sh
cd extensions/vscode
npm ci
npm run package
code --install-extension de-vloer-0.1.0.vsix
```

Alternatively, use **Extensions → … → Install from VSIX**. A publisher account or Marketplace upload is unnecessary for a team pilot. The package's `webgrip` publisher identifier does not mean this extension is already published or that a Marketplace publisher has been verified.

Open the **De Vloer** activity bar, run **Vloer: Connect to Workbench**, and enter `http://127.0.0.1:4080`. Demo mode supplies its clearly identified demonstration user automatically. Choose **New Remote Session**, accept the rounding fixture defaults, and then **Start remote crew**. Inspect the baseline failure, passing verification, retained patch and independent review under **Evidence**.

The demo runs a fixed, real test fixture with no AI calls. An arbitrary objective in demo mode does not turn it into a live coding agent.

## Connect to the team server

Run **Vloer: Connect to Workbench** and enter the deployed HTTPS origin, such as `https://vloer.example.org`. Sign in using your Vloer account when prompted. The password is used only for that login; the returned opaque session cookie is stored in VS Code SecretStorage, scoped to the server origin. There are no password or API-key settings.

The extension runs in the local UI extension host, including in a Remote SSH window. The configured server must therefore be reachable from the laptop. HTTPS is mandatory except for loopback development. Certificate verification remains enabled. The current API expects an origin at `/`; reverse-proxy subpaths and browser-only SSO interception are not supported by this release.

The server still enforces account roles and session ownership. v0.1 has no shared-team invitation or delegation API. A viewer can inspect its visible sessions; operators mutate their own sessions; administrators can access all sessions. Future OIDC/device login is a separate server and extension feature.

## The working surface

| Surface | Implemented behavior |
| --- | --- |
| Remote Sessions tree | Groups attention, active, queued and historical work using native VS Code items, keyboard navigation and status icons |
| Session panel | Theme-aware work, evidence and activity tabs; objective, sequential crew stages, review verdicts, spend state, branch and human decisions |
| Session controls | Explicit start, pause, resume and cancel; cancellation requires a confirmation and does not create replacement work |
| Evidence | Opens retained patches, real test logs and summaries as read-only virtual editor documents |
| Instructions | Records an operator instruction for the next execution; pause/resume is needed when an active run must incorporate it |
| Permissions | Displays the actual unresolved request; supports allow-once or reject; structured questions support options, multiple selections and custom answers when permitted |
| History | Reads durable events after the last numeric cursor, deduplicates by ID and offers complete JSON history as a read-only document |
| Editor context | Sends a chosen selection or current text file only after a preview and explicit destination confirmation |
| Connection states | Shows stale/offline state, disables panel mutations while disconnected, clears expired credentials and exposes reconnection |

The panel keeps at most 1,000 recent events in memory and displays the latest 100. **Open complete history** fetches the server's retained history. Cursor values are global event IDs; gaps within one session are normal. Polling is configurable from two to 60 seconds and occurs while the tree or a session panel is visible. Hiding or closing VS Code does not stop remote work.

No API mutation is retried automatically. If a request loses its response, refresh the session before repeating the action: delivery may have succeeded even when the client could not confirm it. Budgets display **observed** spend and its settlement status, never invented real-time exactness. Budget increases remain available to administrators in the web dashboard.

## Send local context deliberately

Use the editor context menu **Vloer: Send Selection to Remote Session…**, or run **Vloer: Send Current File to Remote Session…** from the Command Palette.

1. Select the remote session.
2. Inspect the read-only preview. It names the destination server, session, configured repository, source path, line range and whether the editor buffer is unsaved.
3. Confirm **Send to session**. The selected text becomes a durable operator instruction.

Each attachment is limited to 12,000 characters; larger files require a smaller selection. An attachment never uploads the repository or silently applies local changes to the remote checkout. Workspace Trust is required for this action. Changing the connection or login while a pending action is open invalidates it; start again on the intended destination.

The extension never applies a returned patch to your local checkout automatically. A retained unified patch is shown with diff syntax highlighting. Native side-by-side file comparison requires future base/head artifact content support; calling the current view a live remote filesystem would be inaccurate.

## Commands

All commands use the **Vloer:** prefix in the Command Palette.

| Command | Use |
| --- | --- |
| Connect to Workbench / Sign Out | Manage the current server session |
| New Remote Session | Choose registered repository, crew, runtime, objective and authorized budget |
| Open Session / Refresh Sessions | Inspect current durable server state |
| Start / Pause / Resume / Cancel Session | Control deliberate remote execution |
| Send Instruction to Session | Steer the next execution |
| Send Selection / Send Current File to Remote Session… | Explicitly share bounded editor context |
| Open Durable Session History | Open retained JSON events |
| Open Web Dashboard | Open the same session in the full browser workbench |

The session composer also supports **Ctrl+Enter / Cmd+Enter**. Tab navigation follows the usual arrow, Home and End behavior. Colors use VS Code theme variables, with visible focus outlines and narrow-editor layouts.

## Develop and validate

Open this directory as a separate VS Code workspace:

```sh
code extensions/vscode
```

Run `npm ci`, then press **F5** using the included **Run De Vloer Extension** launch configuration. It compiles the extension and opens the Extension Development Host. Keep the demo server running from the repository root.

From this directory:

```sh
npm run compile
npm test
npm run package
```

The seven client tests start isolated instances of the actual De Vloer server. They cover the real demonstration checks and evidence, lifecycle controls, live-cookie login/expiry/logout, operator isolation, origin validation, path rejection and redirect credential safety. No provider credentials or live model calls are used.

For the browser-based webview check, first install the root repository's development dependencies and Playwright Chromium:

```sh
cd ../..
npm ci
npx playwright install chromium
cd extensions/vscode
npm run test:webview
```

`VLOER_CHROMIUM_BIN` can select an already installed Chromium binary. This check renders real demo output through the shipped webview script and tests keyboard tabs, message dispatch, draft retention, hostile text rendering, disconnect behavior and narrow layouts. It **does not run the VS Code Extension Host**. Screenshots go to the ignored `.screenshots/` directory.

Before wider distribution, qualify installation, native commands, SecretStorage behavior and accessibility in an actual VS Code Extension Development Host on the supported desktop operating systems. This build environment did not contain a working VS Code desktop installation, so that qualification is not claimed. Real cluster/provider qualification is governed by the parent repository's validation document.

## Boundaries and privacy

- The extension is a thin client for the existing authenticated API. Agents, model routing, budgets and workspaces remain server responsibilities.
- Cookies stay in the extension host. The webview receives public session data and uses a narrow message protocol; it never receives passwords, cookies, LiteLLM keys or Kubernetes credentials.
- The server URL is an application-scoped setting. Workspace settings cannot redirect the operator's deployment.
- API redirects are rejected. Requests include the required mutation header and matching Origin. There is no cross-origin credential forwarding or disabled TLS verification.
- Webview scripts and styles are packaged locally. Its CSP denies network connections and remote code; server content is constructed as text, not executable HTML or Markdown links.
- No analytics, advertising, external font downloads or background repository uploads are implemented. Draft instructions can be retained in VS Code's local webview state; server-side instructions, artifacts and history follow the workbench's retention policy.
- Current-file context is an explicit text instruction, not a safe mechanism for sharing secrets. Review the exact preview before sending it.

## API and design sources

Reviewed against official sources on 2026-09-09:

- [VS Code Tree View API](https://code.visualstudio.com/api/extension-guides/tree-view): native hierarchy, commands and view contributions.
- [VS Code Views UX guidance](https://code.visualstudio.com/api/ux-guidelines/views): familiar workbench navigation and restrained use of custom views.
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview): local resource roots, restrictive CSP, message passing, accessible theming and lifecycle handling.
- [VS Code SecretStorage API](https://code.visualstudio.com/api/references/vscode-api#SecretStorage): platform-specific encrypted secret storage, independent of the workspace and not synchronized across machines.
- [VS Code Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host): the `ui` extension placement used by this remote control client.
- [Testing extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension): actual Extension Development Host testing is distinct from Node and browser tests.
- [Publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension): VSIX packaging and distribution.

The executable server contract is in the parent repository at `src/http.ts` and `src/engine.ts`; `docs/contracts/api.md` describes that contract. The extension adds no tracker ingestion, ticket creation, remote filesystem, Ploeg dispatch or automatic merge APIs.
