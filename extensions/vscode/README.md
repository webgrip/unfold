# De Vloer for VS Code

Direct remote agent crews from your editor. Keep the repository checkout, tool execution and model calls on the workbench server while you inspect progress, make decisions and review evidence in VS Code.

This is the **implemented v0.3 desktop extension** for the current De Vloer API. The wider product design, connector roadmap and future IDE experience are documented in the parent repository under `docs/design/`. Proposed capabilities there are not automatically extension features.

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
code --install-extension de-vloer-0.3.0.vsix
```

Alternatively, use **Extensions → … → Install from VSIX**. A publisher account or Marketplace upload is unnecessary for a team pilot. The package's `webgrip` publisher identifier does not mean this extension is already published or that a Marketplace publisher has been verified.

Open the **De Vloer** activity bar, run **Vloer: Connect to Workbench**, and enter `http://127.0.0.1:4080`. Demo mode supplies its clearly identified demonstration user automatically. Expand **Linked Tasks → Demo tasks**, select the fixture task, inspect its read-only preview, and choose **Set up session**. Select a crew, runtime and budget (each step has a back button), then confirm **Import task**. Choose **Start remote crew** in the queued session and watch it live. Read the baseline failure and passing verification under **Checks**, the per-file patch under **Changes**, and the reviewer's findings in the crew strip, then download the captured Git bundle, binary patch or manifest. **New Remote Session** remains available for an ad hoc objective. The **Get Started with De Vloer** walkthrough covers the same path.

The demo runs a fixed, real test fixture with no AI calls. An arbitrary objective in demo mode does not turn it into a live coding agent.

## Connect to the team server

When the workbench has single sign-on, connecting offers "Sign in with <provider>" first. The extension opens your browser on the workbench's own sign-in with a one-time code and collects its session once you have signed in, so the editor acts as the same person as the browser. The local account remains as a second choice.


Run **Vloer: Connect to Workbench** and enter the deployed HTTPS origin, such as `https://vloer.example.org`. Sign in using your Vloer account when prompted. The password is used only for that login; the returned opaque session cookie is stored in VS Code SecretStorage, scoped to the server origin. There are no password or API-key settings.

The extension runs in the local UI extension host, including in a Remote SSH window. The configured server must therefore be reachable from the laptop. HTTPS is mandatory except for loopback development. Certificate verification remains enabled. The current API expects an origin at `/`; reverse-proxy subpaths and browser-only SSO interception are not supported by this release.

The server still enforces account roles and session ownership. v0.2 has no shared-team invitation or delegation API. A viewer can inspect its visible sessions; operators mutate their own sessions; administrators can access all sessions. Future OIDC/device login is a separate server and extension feature.

## The working surface

| Surface | Implemented behavior |
| --- | --- |
| Remote Sessions tree | Groups attention, active, ready and historical work; items show repository, active role, observed spend and age, and expand into pending decisions, crew roles, retained evidence, the review candidate and the imported task. Crew roles are labelled **implementation**, **analysis** (a read role that is not the last run) or **independent review** (the final read role); transcripts carry their own icon. The session tooltip states the approval mode and, while running, the spend observed at the gateway. Inline actions start, resume, pause or open the decision for the current state |
| Activity bar and status bar | The view badge counts sessions needing attention. The status bar turns amber with the number of waiting decisions and opens the oldest one; otherwise it shows running work |
| Notifications | New decisions, failures, interruptions and sessions ready for human review, each with a direct action. Streamed tokens and tool completions never notify. `vloer.notifications` selects all, decisions and failures only, or none |
| Linked Tasks tree | Browse registered Forgejo, GitHub, GitLab, ClickUp and Vikunja sources; inspect task snapshots, open the original task in its tracker, and explicitly import an open task |
| Session panel | Leads with one sentence stating the situation and the next permitted action; only the final read role counts as the reviewer. Crew strip with elapsed time, verdicts and findings rendered as safe Markdown. Tabs: **Brief** (objective, imported task, candidate, handoff and collapsible **transcripts** rendered as Markdown), **Changes** (per-file list with added and removed counts), **Checks** (passed, failed or expected failure per artifact), **Activity** and **Gateway** |
| Activity | Chronological and filterable. Streamed text coalesces per part; tool cards collapse per `partId` so the latest state wins, and show the tool's title or input, folded input and output, and any error text. A `run.started` event renders as an expandable **brief** card with the objective, role instruction, operator notes, prior work, evidence supplied and guidance, the model and the prompt digest. `run.finished` shows the role and verdict rather than repeating the summary. Assistant text is rendered through the same escape-first Markdown renderer as findings |
| Gateway | The gateway host, the providers and endpoints that answered, request and refusal counts, attributed cost and router savings, then one row per request: time, role, answered-by model/provider/host/geo, route group, tier and cause, tokens, cost, latency and first-token time, and flags for refused, retries, fallback, cache hits, cached tokens, guardrails and outside-policy answers, with the error and harness when recorded |
| Approval | The side column states whether tool use asks you or is approved automatically. While a session on a `docker` or `kubernetes` placement is active, **Approve automatically** and **Ask me again** switch the mode through `POST /api/sessions/:id/approval`; sessions on the local backend always ask. Questions from the crew wait for you either way |
| Decisions | Permission and question cards inline at the top of the panel. Scope is read from the adapter payload; **Allow once** is prominent, **Reject** equally reachable, and a broader grant appears only when patterns are declared. Questions keep options, multiple selection and custom answers, and show a confirmation before sending. Nothing is approved by navigation or by Enter in the composer |
| Live updates | Open panels read the server event stream from the extension host and refetch the session snapshot on each burst. Polling remains the fallback. The footer states live, polling or disconnected with the last observed time. `vloer.liveUpdates` turns the stream off |
| Session controls | Explicit start, pause, resume and cancel; cancellation requires a confirmation and does not create replacement work |
| Evidence | Stable `vloer-evidence:` documents: diffs open with diff highlighting at the chosen file, checks as logs, summaries as Markdown. Reopening reuses the tab |
| Review candidate | Download retained Git bundle, binary patch or manifest to an explicit local destination; bundle and patch digests are checked before saving |
| Instructions | Composer with four delivery states: draft on this device, sending, saved for the next execution, delivery unknown. **Pause the active run first** pauses before saving so the next execution starts with the instruction |
| Budget | Authorized, observed and reserved amounts with settlement status. While a session runs and the gateway's attribution exceeds the settled figure, the card shows that amount labelled **observed at the gateway**, lists usage per model or route group, and draws the cumulative cost curve against the ceiling with policy violations marked. Administrators authorize more from the panel or the tree |
| Guided creation | New session and task import run in one multi-step flow with a back button, retained draft, budget presets and a final confirmation of destination, repository, crew, runtime and authorization. When the chosen or default placement is `docker` or `kubernetes`, **New Remote Session** adds an **Approve tool use automatically** step; the confirmation states the resulting approval mode |
| Linked accounts | **Vloer: Linked Accounts** reads `/api/links` and offers **Link GitLab** (opens the authorization URL the workbench returns in your external browser) or **Unlink GitLab** after a confirmation. Tokens stay on the workbench; the extension never sees them |
| Editor context | Sends a chosen selection or current text file only after a preview and explicit destination confirmation |
| Connection states | Shows stale or offline state, disables panel mutations while disconnected, clears expired credentials and exposes reconnection. Panels are restored after a window reload |
| Execution failures | Displays the server's safe diagnosis, next action, recorded cause and uncertain submission state; a `policy_violation` is labelled **Gateway policy**. Retains blocker compatibility with older servers |

The panel keeps at most 2,000 recent events in memory and displays the latest 300. **Open complete history** fetches the server's retained history. Cursor values are global event IDs; gaps within one session are normal. Session polling is configurable from two to 60 seconds and occurs while either tree or a session panel is visible. Task pages load when you expand a source; **Refresh Linked Tasks** explicitly reloads them, avoiding a background polling loop against every tracker. Hiding or closing VS Code does not stop remote work.

No API mutation is retried automatically. If a request loses its response, the composer reports **Delivery unknown** and keeps the draft; refresh the session before repeating the action, because delivery may have succeeded even when the client could not confirm it. Budgets display **observed** spend and its settlement status, never invented real-time exactness.

## Link your task systems

Configure connections once on the workbench server. The same sources appear in the browser and the extension; no tracker token is entered in VS Code. A source selects its provider, API root, native project/repository/list ID, registered code repository, credential environment variable and explicit execution owner. The server example `config/task-sources.example.json` and parent task-connection guide describe each provider.

In the **Linked Tasks** view, expand a source and select a task. **Vloer: Browse Linked Tasks** also supports filtering a page, pagination and opening a native task ID directly. GitHub, Forgejo and GitLab connections read issues. ClickUp connections read a configured home list; Vikunja connections read a configured project. Task content is always opened as inert plain text.

Import uses a deliberate sequence:

1. Inspect the fetched task snapshot and mapped repository.
2. Choose a registered crew, remote runtime and spending authorization.
3. Confirm the destination workbench, repository and task revision.
4. Open the resulting queued session and choose **Start remote crew** separately.

If the source changes after preview, the server rejects the stale revision. **Reload task** reopens its current snapshot for another explicit review. Repeating an import of the same revision reopens the existing session; it does not create replacement paid work. The server also blocks a second active session for an already active task revision lineage.

Sources owned by Ploeg remain available for inspection, with interactive import blocked. Import does not claim, assign, close or update a tracker task. Repository routing comes from the administrator's source mapping. A link in a task description cannot select another repository or change its execution owner.

## Bring back a complete review candidate

The **Evidence** tab shows **Preparing review** while the server captures the final repository state. When available, **Download Git bundle**, **Download patch** and **Download manifest** open a local save dialog. **Vloer: Download Review Candidate** offers the same choices from the Command Palette.

A Git bundle retains the exported objects needed for a separate review checkout, including binary content, file modes and deletions. The binary patch describes the captured changes against the recorded base. The manifest records the capture's revision and export metadata. These files are evidence of the captured state; an export alone does not certify independent trusted verification or approval to publish.

Downloads are authenticated, capped at 128 MiB, refuse redirects, and verify the recorded bundle/patch digest before saving. Interrupted transfers do not leave a partial destination file. Existing local files are kept intact; choose a new filename. The extension does not automatically execute, apply, commit, push or merge downloaded content.

If capture is unavailable, the panel displays the server's explanation and keeps the other evidence visible. An unavailable complete export is never presented as a successful candidate.

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
| Find Session | Search visible sessions by title, state, repository, imported task or ID |
| Review Next Decision / Review Decision | Open the oldest waiting decision, or a specific one, inside its session |
| Browse Linked Tasks / Refresh Linked Tasks | Browse connected task systems and explicitly refresh their pages |
| Import Linked Task into Session | Preview a pinned task revision, configure a crew and create queued work |
| Open Imported Task Snapshot / Open Original Task in Tracker | Inspect the source snapshot used by a session, or open its HTTPS tracker link |
| Download Review Candidate | Save a Git bundle, binary patch or manifest to an explicit local file |
| New Remote Session | Guided repository, crew, runtime, title, objective and authorization steps with a back button |
| Open Session / Refresh Sessions | Inspect current durable server state |
| Open Evidence | Open a retained diff, check log or summary as a read-only document |
| Start / Pause / Resume / Cancel Session | Control deliberate remote execution |
| Send Instruction to Session | Steer the next execution |
| Authorize Additional Budget | Administrators add authorization within the deployment limit |
| Set Tool Approval | Switch an active session on a container or pod between asking before each tool and approving automatically |
| Linked Accounts | Link or unlink GitLab for the signed-in workbench account |
| Send Selection / Send Current File to Remote Session… | Explicitly share bounded editor context |
| Open Durable Session History | Open retained JSON events |
| Open Web Dashboard / Copy Session Link | Open the same session in the browser workbench, or copy its link |

The session composer supports **Ctrl+Enter / Cmd+Enter**. Tab navigation follows the usual arrow, Home and End behavior. Colors use VS Code theme variables, with visible focus outlines and narrow-editor layouts. No global keyboard shortcuts are registered.

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

The thirteen client tests exercise isolated instances of the actual De Vloer server, plus controlled upstream and transport fixtures. They cover real demonstration checks and candidate downloads; idempotent task import; authenticated Vloer-to-Vikunja ingestion with a local upstream fixture; stale revision and Ploeg-lane rejection; lifecycle controls; live-cookie login/expiry/logout; operator isolation; origin validation; path rejection; redirect/oversize download safety; the live event stream with cursor replay and abort; and administrator budget authorization. No provider credentials or live model calls are used.

The remaining tests run without a browser or server. `test/webview.test.ts` loads the shipped `media/session.js` into a `vm` context with a minimal DOM stub and checks that Markdown keeps hostile text inert, that tool events collapse per `partId` with the latest state winning, the brief card, the gateway tab, the budget card's observed spend and cost curve, the approval card and transcript sections. `test/status.test.ts` covers the run labels, the final-read-role reviewer rule and the gateway policy label. `test/approval.test.ts` and `test/accounts.test.ts` drive the approval and linked-account flows against fake clients and a fake HTTP server, asserting the exact route, method, headers and payload.

For the browser-based webview check, first install the root repository's development dependencies and Playwright Chromium:

```sh
cd ../..
npm ci
npx playwright install chromium
cd extensions/vscode
npm run test:webview
```

`VLOER_CHROMIUM_BIN` can select an already installed Chromium binary. This check renders real demo output through the shipped webview script and tests the situation sentence, Markdown findings, the per-file changes list, check outcomes, activity filters and folded tool output, inline permission and question decisions with confirmation, composer delivery states with pause-first, disconnect and reconnect, hostile text kept inert, failure guidance with its recorded cause, the administrator budget form, and desktop and narrow layouts. It **does not run the VS Code Extension Host**. Screenshots go to the ignored `.screenshots/` directory.

Before wider distribution, qualify installation, native commands, SecretStorage behavior and accessibility in an actual VS Code Extension Development Host on the supported desktop operating systems. This build environment did not contain a working VS Code desktop installation, so that qualification is not claimed. Real cluster/provider qualification is governed by the parent repository's validation document.

## Boundaries and privacy

- The extension is a thin client for the existing authenticated API. Agents, model routing, budgets and workspaces remain server responsibilities.
- Cookies stay in the extension host. The webview receives public session data and uses a narrow message protocol; it never receives passwords, cookies, LiteLLM keys or Kubernetes credentials.
- The server URL is an application-scoped setting. Workspace settings cannot redirect the operator's deployment.
- API redirects are rejected. Requests include the required mutation header and matching Origin. There is no cross-origin credential forwarding or disabled TLS verification.
- Webview scripts and styles are packaged locally. Its CSP denies network connections and remote code; server content is constructed as DOM text nodes. The Markdown renderer emits headings, lists, code, tables and emphasis only; links are shown as text with their target, never as navigable anchors.
- The event stream is read in the extension host with the stored cookie; the webview never opens a connection.
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

The executable server contract is in the parent repository at `src/http.ts` and `src/engine.ts`; `docs/contracts/api.md` describes that contract. The extension uses the server task-source, task-import and retained-candidate APIs. It adds no ticket creation, tracker write-back, remote filesystem mounting, Ploeg dispatch or automatic merge authority.
