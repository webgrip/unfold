![Unfold](https://forgejo.webgrip.dev/webgrip/unfold/raw/branch/development/apps/unfold/public/og-image.png)

# Unfold for VS Code

Start agent work, respond to questions and review results from your editor. An Unfold workbench prepares the workspace and runs the harness; that workbench can be on your machine or on a remote host. The extension connects to its authenticated API.

The [product designs](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/docs/PRODUCT-DESIGN.md) include proposals beyond the implemented extension. This guide describes the current client.

## Install

Download the VSIX and its matching `.sha256` file from a completed [Forgejo release](https://forgejo.webgrip.dev/webgrip/unfold/releases). In the download directory, run `shasum -a 256 -c` with that checksum filename and confirm the VSIX reports **OK**. Then choose **Extensions → … → Install from VSIX** and select that file. Use the filenames attached to your chosen release; a release page without the assets is not ready for this installation path.

[Open VSX](https://open-vsx.org/extension/webgrip/unfold) is the preferred registry publication target. Availability depends on successful publication for the chosen version. Marketplace distribution remains conditional; do not assume that searching by identifier in every editor will find the extension. The [release guide](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/docs/operations/release.md#extension-distribution) explains those conditions.

A sideloaded VSIX does not receive registry updates automatically. Use VS Code 1.99 or later. The extension runs in the editor's Node extension host and does not require provider keys, a harness or Kubernetes tools on the client machine. A local workbench has its own runtime requirements.

## Try the local demonstration

With Node 24 and Git available through the repository's tool configuration, run this from the repository root:

```sh
mise exec -- npm run demo
```

1. Open the **Unfold** activity bar and run **Unfold: Connect to Workbench**. Enter `http://127.0.0.1:4080`; demo mode supplies its identified demonstration user.
2. **Now** lists the demo's illustrative Ploeg work, marked as an illustration: pull requests ready for your review, work that needs you, proposals and running Runs. None of it makes model calls or spends anything.
3. Expand **Tasks → Demo tasks** and open the fixture task. It opens in its own tab with its description; the demo fixture is not linked to Ploeg.
4. Choose **Start a supervised session**, select a team, runtime and budget, then confirm **Create session**. The wizard supports going back before confirmation.
5. Choose **Start remote team** in the queued session. This command name also controls work on a local workbench.
6. Inspect **Checks**, **Changes** and the final review, then download the Git bundle, patch or manifest from **Brief**.

The demo runs a fixed repository fixture and real checks without AI calls or Ploeg. An arbitrary objective in demo mode does not turn the fixture into a live coding agent. **New Remote Session** creates an ad hoc session; live work requires a configured live runtime. See the [demo guide](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/docs/operations/demo.md).

## Connect and sign in

Run **Unfold: Connect to Workbench** with the deployed HTTPS origin. When configured, **Sign in with <provider>** shows a short code such as `BCDF-GHJK` and opens the workbench's browser sign-in. After you sign in, the browser names the request and shows the same code: approve it only if the codes match. The editor then acts as you, with its own credential that lasts thirty days and that you can sign out under **Settings › Signed-in editors** in the browser. Local-account login is also supported.

The editor credential, or the session cookie of a local-account login, stays in VS Code SecretStorage, scoped to that origin. There are no password or API-key settings. The extension runs in the local UI host even in a Remote SSH window, so the workbench must be reachable from your machine. HTTPS is required except for loopback development. Use an origin at `/`; reverse-proxy subpaths and browser-only SSO interception are unsupported.

The server enforces identity and session ownership. Viewers inspect visible sessions, operators change their own sessions, and administrators can access all sessions. Changing the connection invalidates pending actions so they cannot be submitted to the wrong workbench.

## Use Unfold from the Agents window

After you sign in, Unfold appears in VS Code's Agents window on its own, within seconds and without a reload. Its sessions show up there next to your other agents, grouped as **Unfold · <repository> [Unfold]**. To start one, use **Unfold: Start a Session in the Agents Window**: the Unfold button at the top of the **Now** and **Sessions** views, or **Start an Unfold session** in the status bar. It asks which repository when the workbench has more than one, remembers your pick, and opens the Agents window on a new session with that repository's folder already chosen. Choosing **New**, then **Workspace ▾ → Folders (Unfold) → <repository>** in the Agents window does the same by hand. The extension adds the workbench to `chat.remoteAgentHosts` in your default profile's user `settings.json`. It keeps your comments and other settings, and removes the entry again when you sign out. The entry is called **Unfold**; once you use more than one workbench, each is called **Unfold (<host>)**. A name you gave the entry yourself stays. **Unfold: Connect VS Code Agents Window** does the same on demand and offers **Start an Unfold Session**; **Unfold: Open Agents Window** adds a missing entry and opens the window, and the **Get started** walkthrough has a step for it. **Connect VS Code** on the workbench's **Settings › Signed-in editors** page opens `vscode://webgrip.unfold/connect-agents-window`, which does the same from the browser. The status bar shows **Start an Unfold session** once an Agents window has connected with this editor's token, checked every 20 seconds. **Not connected** leads to **Open Agents Window**, **Reconnect** and **Troubleshoot**; the Agents window's **Agent Host** output channel says why a connection failed.

The other way round, each session in the Agents window starts with **Open the Work Item in VS Code** and **Open in the browser ↗**. The first opens the Work Item panel, or an Unfold session's own panel, in the editor window you used last rather than in the Agents window. To make that work, the extension tells the workbench which window that is whenever the window gains focus, and forgets it when you sign out. The line shows once a session's chat has a turn; a Work Item's chat always has one, its brief. The browser link needs the workbench to know its public address. When a Work Item has a pull request, the line ends with **Pull request #n ↗**.

**Following work you handed off.** Whatever you hand off, with `unfold_hand_off` from Claude Code, from the browser, by a tracker label or from the Claude Code plugin, Ploeg turns it into a Work Item, and the Agents window lists it within seconds as **#n <title>**. While it is queued, the line under the title reads **Queued for <team>**, followed by **· handed off by you** when Ploeg recorded you as the person who handed it off; tracker work names its task in the brief instead. Its chat opens with the brief: the title and where it came from. While it runs, each Round is a turn and each Run a subagent you can open for its messages, tool calls and pod logs; the line reads **<Role> · Round n · <spent>/<budget>**. When an agent asks you something, the session says **Needs attention** and the question waits in the chat: answer it there and choose **Answer and resume Round n** or **Only save my answers**. The question says what resuming spends first. Closing the question sends nothing. When the pull request is ready, the line reads **Ready for review · PR #n**, with what the attempt spent, and the chat links the pull request: review and merge it on the forge. The Agents window never merges for you.

**Open in Agents Window**, on a session or Work Item row in the **Now**, **Sessions** and **Ploeg** views and in the Command Palette, opens that one session in the Agents window. It asks the workbench for the session's link and builds it with this editor's URL scheme, so Insiders opens Insiders. The link names the host as your own `chat.remoteAgentHosts` entry spells it, because VS Code identifies the host by that exact address. Without an entry for this workbench, it offers **Connect Agents Window** first. A session opens for its owner and for administrators, the people whose Agents window lists it; a Work Item opens for the people Ploeg lets see it. The session page and the Work Item page in the browser have the same action. The link needs VS Code 1.142 or later in the Agents window; the extension itself still runs on 1.99. If the Agents window cannot find the session, it says so after about 15 seconds. A click-through against a desktop VS Code is not verified yet ([VIK-1922](https://vikunja.webgrip.dev/tasks/1922)).

**The extension inside the Agents window.** From VS Code 1.143 the extension declares that it can run in the Agents window too (`capabilities.agentsWindow` in its manifest), so its commands, its read-only tools for agents and its `ploeg-mcp` server definition are there as well. It recognises that window by the workspace VS Code opens in it, `agent-sessions.code-workspace` in your user settings folder, and stays quiet there: it shows no notifications, because the editor window already shows them and the Agents window marks a waiting session **Needs attention** itself, and it never claims the **Open the Work Item in VS Code** links, so those keep opening in the editor window. To keep it out of the Agents window, set `"extensions.supportAgentsWindow": {"webgrip.unfold": false}` in your user settings. VS Code 1.142 and older ignore the declaration. Checked on 2026-10-24 in a desktop VS Code 1.143.1 with a separate profile: the extension activates in both windows, the Agents window reports `agent-sessions.code-workspace` under the user settings folder as its workspace and an editor window on a folder reports none, and the three tools below are registered in both. Not checked yet: which of the extension's views and panels the Agents window shows, and the quiet behaviour while signed in to a workbench ([VIK-1922](https://vikunja.webgrip.dev/tasks/1922)).

The entry carries a personal connection token in plain text, because VS Code 1.144 reads it only from there: the setting has no machine scope, and the Agents window takes no token from SecretStorage or a header. So that Settings Sync never uploads it, the extension adds `chat.remoteAgentHosts` to `settingsSync.ignoredSettings` before it writes a token, and leaves it there after you sign out. Your other remote agent hosts then stop syncing too; remove the line from `settingsSync.ignoredSettings` if you want them synced and accept that the token travels with them. A token that sat in a synced entry before is replaced and revoked on the workbench. The extension keeps a copy in SecretStorage and reuses it while the workbench accepts it, and checks it with an `Authorization` header so the check puts no token in a URL. Set `unfold.agentHost.autoConnect` to `false` to connect only through the command. If `settings.json` cannot be parsed or written, nothing changes and **Copy address** offers the manual route: in the Agents window, run **Sessions: Add Remote Agent Host…** and paste the copied `wss://…?tkn=…` address. The [operations guide](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/docs/operations/live.md#attaching-vs-code-as-an-agent-host-client) has the details.

## Use Ploeg's tools in VS Code chat

When the workbench names a remote Ploeg MCP server, the extension provides it to VS Code's chat as **Ploeg** (VS Code 1.101 or later). The definition holds only the server's URL: no token, no header, nothing secret on disk. When chat first uses a Ploeg tool, VS Code opens your browser to sign in at the workbench's identity provider and keeps the token in its own secret storage, with a refresh token from 1.142 on.

VS Code asks for a client ID the first time. An extension's server definition has no field for one, and the identity provider does not register clients on the fly, so VS Code says the authorization server "does not support automatic client registration". Choose **Copy URIs & Proceed**, enter the client ID the extension shows you (on the homelab, `ploeg-mcp`) and leave the client secret blank. VS Code remembers it for that server.

To skip that question, run **Unfold: Add Ploeg MCP Server to VS Code**. It opens VS Code's own install view for a user `mcp.json` entry with the URL and `oauth.clientId`, and turns off the extension's copy so the tools do not appear twice. **Copy mcp.json Entry** copies the same entry for an editor without that install view. `unfold.mcp.provideServers` turns the provider off.

The extension does not provide `unfold-mcp`, the server for Unfold's own reasons and sessions. It runs on your machine with your `UNFOLD_TOKEN` in its environment, and VS Code writes an extension's server environment to disk in plain text when it passes servers to agent-host harnesses. Add it yourself as [the guide](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/how-to/ask-from-an-ai-client.md#unfold) shows, until `unfold-mcp` also runs remotely behind a browser sign-in.

Not verified against a desktop VS Code: the sign-in through the provider and the client ID question, the install view keeping `oauth.clientId`, and whether the Copilot, Claude and Codex harnesses in the Agents window can sign in to a forwarded Ploeg server. VS Code 1.142 forwards the URL to them but drops the client ID.

## Tools for agents in VS Code

The extension lends agents in VS Code chat three read-only tools, so an agent session in the editor window can answer "what waits for me" or "where is this Work Item" without an MCP server:

- **Unfold: What Waits for Me** (`unfold_now`, `#unfoldNow`) lists what needs you, what is ready for your review and what is proposed, each with why it waits and the fix, the Runs that are running and the tracker tasks Ploeg refused to route.
- **Unfold: Work Item State** (`unfold_get_work`, `#unfoldGetWork`) gives one Work Item by id or `#work/<id>` link: its state and why it waits, the agent review and the pull request with its CI, the Runs, and spend against budget.
- **Unfold: Find Work Items** (`unfold_find_work`, `#unfoldFindWork`) finds Work Items by title words, a tracker id such as `VIK-123`, a Work Item id or a branch name. Without a query it uses the Git branch of the repository holding the active file.

They read the same workbench routes as the **Now** view and the Work Item panel, with this editor's sign-in, and never spend, approve, reject, retry or stop anything; those stay behind Unfold's own confirmations. Titles, questions and reports that come from a tracker or an agent are quoted and labelled as untrusted data, as `unfold-mcp` does. Signed out or offline, a tool answers in one sentence and names **Unfold: Connect to Workbench**. An administrator turns extension tools off for everyone with VS Code's `ChatAgentExtensionTools` policy. The tools need an editor with the language-model tool API; on one without it the extension runs as before. In a desktop VS Code 1.143.1 all three are listed in `vscode.lm.tools` in the editor window and in the Agents window (checked 2026-10-24); an agent calling them in chat is not checked yet.

## See what waits on you

The Unfold sidebar opens on **Now**, the same list as the browser's Now page:

1. **Ready for your review**: Work Items whose pull request waits on a person, with the pull request number. The inline icon opens the pull request. A pull request whose CI is still running says **CI running**; one whose CI did not pass is not ready for review and is listed under **Needs you** as **CI did not pass**, and its Work Item panel leads with the checks that did not pass.
2. **Needs you**: Work Items Ploeg stopped on, each led by its reason ("Budget ran out", "Agent is stuck", …), plus sessions that wait for your answer, stopped or failed. A Work Item that a session drives appears once, as the session.
3. **Proposed**: follow-up work an agent proposed, which runs only after a person approves it.
4. **Running**: each running session with the Role that works, its elapsed time and spend so far, and each other running Run with its Role, Round, elapsed time and the gateway's cost so far, which is not settled spend.

Select a row to open its Work Item panel; the second inline icon opens it in the browser. The activity-bar badge counts what is ready for your review or needs you, each Work Item once. The status bar shows the same counts and turns amber only when something needs you. While exactly one session runs, it names the working Role with a running clock, for example **Reviewer 0:41**, and a click opens that Work Item. A Ploeg Work Item that newly needs you raises a notification; with `unfold.notifications.workItems` set to `all`, so does one that newly becomes ready for review. Sessions you own notify on their own, as [Notifications](#notifications) describes.

**Tasks** lists your team's tracker boards. A task Ploeg holds shows its state, for example "Ready for review" or "Needs you · Budget ran out". **Work** browses each Team's lanes. **Sessions** holds supervised sessions. It appears in the demo, with shared execution, or when you have sessions, and starts collapsed.

States, reasons, amounts and dates come from the browser's own modules, so both clients word them the same way: `US$ 1.234,50`, 24-hour times, and "Not reported" when spend is unknown, never zero. Each status tone is a theme colour you can change in `workbench.colorCustomizations`: `unfold.live` (running), `unfold.attention` (needs you), `unfold.review` (ready for review), `unfold.success`, `unfold.danger` and `unfold.severe` (stopped retrying, infrastructure failures). By default they follow your theme's own colours.

## Work and review

| Surface | What to use it for |
| --- | --- |
| Now | See what waits on you across every Team, and what is running |
| Sessions tree | Find active work, pending decisions, queued sessions and history. Expand a session for its team, evidence and source task |
| Brief | Read the objective, imported snapshot, retained transcripts, review candidate and handoff |
| Changes | Inspect captured patches by file |
| Checks | Read recorded check output and distinguish passing, failing and expected fixture failures |
| Activity | Inspect durable events, tool input/output and the brief supplied to each role |
| Gateway | Inspect attributed model requests, routing, cost and errors; open configured Grafana links |
| Work Item panel | See a Work Item's state, reason and next action, its pull requests with CI and reviews, cost per role and Runs; read the task, hand it to a Ploeg team or take it back, check out its branch, or start a supervised session. The header names the tracker ticket (`VIK-1505`, a link to it) and never a machine identifier, which stays in the tooltip on the header's first line; effort reads as **Agent runs** and **Attempts**, with Round and Shift explained on hover. When an Unfold session drives the Work Item, the panel leads with its progress: the header pill says the state once and the headline leads with the outcome ("Reviewer approved · 1 file +57 −45"), the working Role with a ticking clock and its last activity, the Steps (each Role's outcome and verdict, a cut-off Run and a verdict read only from its transcript marked as such, and a long report folded behind a plain-text preview of its first paragraph), the Change (files, lines, branch, candidate), what Unfold and Ploeg disagree about, and the actions that fit: **View change** in VS Code's multi-file diff editor, **Investigate** as a Markdown document, **Answer**, **Resume**, **Pause**, **Download change** (the Git bundle or patch, as **Unfold: Download Review Candidate**), **Accept** (it records your decision and pushes, merges and publishes nothing, which the panel says under the buttons), **Accept and open pull request** in its place on a verified gated candidate when the workbench publishes, **Reject**, **Open session**, and **Deliver approved work** (confirmed, it opens a pull request) or **Run again** (queues a new session) when the workbench's recovery answer offers them. It follows the session's event stream while visible. Ploeg's own Runs move under **As Ploeg records it** |
| Work tree | Browse each Team's lanes in a bounded snapshot. A Work Item opens its panel; the inline icon opens it in the browser |

**Check Out Branch**, in the Work Item panel and on Now and Work rows, opens the branch Ploeg works on in its own git worktree, in a new window, so the open clone of the Work Item's repository stays on its branch. It reads the Work Item from the workbench, finds the open folder with a remote that points at the target repository's full path on the forge of its pull request link, fetches the branch, and adds a worktree beside that clone named after the clone and the branch (`shop-agent-vik-50` beside `shop`), creating a local tracking branch when there is none. A worktree that already has the branch is reused. It fast-forwards the branch when it is only behind and leaves a diverged branch as it is. Without a matching clone it offers the git command and, when the forge is known, **Clone repository**. The browser's **Open in VS Code** opens `vscode://webgrip.unfold/checkout?workItem=<id>&origin=<workbench>`: the extension refuses a link for another workbench than the one it is connected to, and always asks before it adds a worktree. Demo Work Items have nothing to check out. A remote host matches the forge when it is the same host, when both share a parent domain below their first label (`forgejo-ssh.example.dev` and `forgejo.example.dev`), or when `unfold.remoteHostAliases` maps it to the forge, for example `{"ssh.git.example.com": "git.example.com"}`. Before the Work Item has a pull request link, a clone of the same full path on any host matches.

The team strip distinguishes implementation, analysis and the final independent review. Earlier read roles supply analysis. Writing teams require an explicit final approval. A completed session awaits the person's review; accept or reject it from the toolbar or **Record Review** command. Rejection requires a reason, and the decision records the person who made it. Accept only records your decision in the session; nothing is pushed or merged.

A session under a delivery policy, on a workbench whose delivery view reports `publicationEnabled`, offers **Accept and open pull request** instead, once its independent checks passed, as the primary action in the session panel and the Work Item panel, or through **Unfold: Accept and Open Pull Request**. After a confirmation it sends the candidate, receipt and policy the panel displayed to the workbench's publish route, which approves the commit when needed and opens one pull request; merging stays with you. The panels then show the pull request stage: **Publishing…**, **Pull request #N** with **Open pull request #N ↗**, **Needs recovery** with what stopped it, or **Refused**. A candidate whose checks did not pass is never offered it.

Permission and question cards wait for an explicit answer. **Allow once** grants the displayed request; broader choices appear only for declared patterns. Container and Kubernetes sessions can switch between **Approve automatically** and **Ask me again** while active. Local-backend sessions always ask, and questions require an answer in either mode.

Start, pause, resume and cancel follow the server's permitted transitions. Cancellation does not create replacement work. An instruction is saved for the next execution; **Pause the active run first** pauses before saving it. The composer distinguishes a local draft, sending, saved and delivery unknown.

No API mutation is retried automatically. A read that meets an unreachable workbench or a gateway error is retried once. If a response is lost, refresh before repeating the action: the server may have accepted it. Shared execution also has stricter recovery and budget rules than standalone mode. In particular, the current shared API does not support the standalone additional-budget operation. See the [HTTP contract](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/docs/contracts/api.md).

The spending card distinguishes authorization, observations, holds and settlement. Unknown spend is not zero. Gateway data can arrive late and cannot prove an exact ceiling for requests already in flight.

## Work from a task

An administrator configures sources on the workbench. Registered Forgejo, GitHub, GitLab, ClickUp and Vikunja sources appear in both clients. Tracker credentials stay on the server. Personal GitLab account linking is available through **Unfold: Linked Accounts**; it does not automatically register a task source. Configuration and scope limits are in the [task connection guide](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/docs/operations/task-connections.md).

Select a task to open its task view. The description is rendered from the tracker as inert text; links open in your browser only when they use HTTPS. The head of the panel says whether Ploeg already has the task, what state it is in, why, and what happens next.

**Hand to Ploeg** is offered on boards that Ploeg owns. Choose a team and confirm: the workbench assigns that team's tracker user and comments that you handed it over, which is how Ploeg receives work. Ploeg queues it, works on a branch and opens a pull request for review. **Take back** removes the assignment while the item is still queued; work that has started is cancelled from the browser's Work Item page. Viewers can read the task view but cannot hand work over. Older workbench servers show the task without Ploeg status.

**Start a supervised session** prepares operator-led work instead: choose the team and authorization, then confirm the workbench and task revision. A stale revision requires a fresh preview. Repeating the same import reopens its existing session; it does not create another paid attempt. Import prepares queued work; Start begins execution. Standalone import requires an interactive source and repository. In shared mode, registered Vikunja and ClickUp targets can bind to the existing Ploeg Work Item, which is claimed on Start. Import itself does not mutate the tracker. Source text cannot select another repository or change execution authority.

## Bring back evidence

The **Brief** tab shows the review candidate when capture is available. **Download Git bundle**, **Download patch** and **Download manifest** each ask for a local destination. **Unfold: Download Review Candidate** offers the same choices.

The bundle preserves exported Git objects, including binary content, modes and deletions. The patch describes changes against the recorded base; the manifest identifies the captured state. An export alone does not certify independent verification or permission to publish.

Downloads authenticate to the workbench, refuse redirects, enforce a size limit and verify bundle/patch digests before saving. Existing destination files are preserved. An unavailable capture keeps its explanation visible. The extension does not execute, apply or merge downloaded changes automatically.

**Open Evidence** opens retained patches, checks and summaries as read-only documents. A patch view is not a live remote filesystem or native comparison of complete base/head files.

## Send editor context

Use **Unfold: Send Selection to Remote Session…** or **Unfold: Send Current File to Remote Session…**. Select the destination, inspect the preview and confirm. The preview names the workbench, session, repository, file, range and unsaved-buffer state.

Each attachment is limited to 12,000 characters and becomes a durable instruction. It does not upload the repository or synchronize the checkout. Workspace Trust is required. Review the content before sending; this is not a channel for credentials.

## Connection and privacy

A failed refresh keeps the last loaded sessions and tasks on screen and says the extension is reconnecting; the views switch to offline after three consecutive failures or an expired sign-in. Open panels consume the server event stream, with polling as a fallback. The footer distinguishes live, polling and disconnected states. Disconnection disables panel mutations; closing the editor does not stop remote work. **Open complete history** fetches retained events beyond the bounded panel buffer. Now refreshes at most every 15 seconds and the Work tree every 30 seconds while visible; both use snapshots rather than a lossless subscription.

Configure `unfold.liveUpdates` and the polling interval in settings. No global keyboard shortcuts are registered; the composer supports Ctrl+Enter or Cmd+Enter.

## Notifications

When a session you own needs you, the extension shows one VS Code notification with the action that fits. The wording and the action come from the same progress states the browser and the Agents window read ([`public/core/progress.js`](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/public/core/progress.js)).

| The session | Notification | Primary action |
| --- | --- | --- |
| asks a question or asks permission | warning naming the request | **Answer** opens the request in the session panel |
| has a result ready for your review | information with the change size | **Review** opens the change |
| stopped, and the server offers delivery | warning with what was achieved and why it stopped | **Deliver**, after the same confirmation as in the panel |
| stopped, and the server offers to resume or run again | warning | **Open** |
| failed | warning with the failing stage | **Open** |

Each state change notifies once. A poll that finds the same state again is silent; a session that leaves a state and returns to it, or asks a new question, notifies again. What already waits when you connect does not notify; the badge and the status bar show it. Sessions other people own, and every session in the demo, never notify. A Work Item that one of your sessions drives notifies once, as the session.

The extension reads the session list on every refresh. An open session panel also forwards its live event stream, so a question, stop or result there refreshes within a second instead of at the next poll. With every Unfold view closed, the extension still checks every 30 seconds while `unfold.notifications.needsYou` is on. Turn that setting off to stop these notifications; `unfold.notifications.workItems` covers Ploeg Work Items on Now. An older `unfold.notifications` value moves to `unfold.notifications.workItems` on activation, and `none` also turns `unfold.notifications.needsYou` off.

**While the window is in the background.** VS Code 1.141 shows an extension's notifications inside the window only. It sends no operating-system notification and does not flash the taskbar or bounce the Dock for them, and the extension API has no call that does. A notification that arrives while the window is unfocused stays until you return, because its hide timer starts only once the window has focus again ([`notificationsToasts.ts:381-415`](https://github.com/microsoft/vscode/blob/1.141.0/src/vs/workbench/browser/parts/notifications/notificationsToasts.ts#L381-L415)). VS Code 1.141 raises operating-system notifications only for its own chat and Agents window sessions, under `chat.notifyWindowOnConfirmation` and `chat.notifyWindowOnResponseReceived`, both `windowNotFocused` by default ([`chatWindowNotifier.ts:120-175`](https://github.com/microsoft/vscode/blob/1.141.0/src/vs/workbench/contrib/chat/browser/chatWindowNotifier.ts#L120-L175), [`sessionsWindowNotifier.ts:97-150`](https://github.com/microsoft/vscode/blob/1.141.0/src/vs/sessions/contrib/sessions/browser/sessionsWindowNotifier.ts#L97-L150)). Those notifications cover sessions that VS Code itself shows, so they can also cover an Unfold session opened in the Agents window; they do not cover this extension's notifications. For an operating-system notification outside VS Code, keep an Unfold browser tab open with desktop notifications turned on in Preferences.

Cookies remain in the extension host. The webview receives public session data through a narrow message protocol, never login secrets, inference keys or Kubernetes credentials. Its scripts and styles are packaged locally; the content security policy blocks network connections and remote code. The server origin is application-scoped, so workspace settings cannot redirect it. There is no cross-origin credential forwarding or disabled certificate verification.

The extension implements no analytics or background repository uploads. Drafts can persist in local webview state; saved instructions and evidence follow the workbench's retention policy.

## Develop and validate

Open this directory in VS Code, install its dependencies, then use the included **Run Unfold Extension** F5 configuration. Keep the local demo server available. From the repository root:

```sh
mise exec -- npm ci --prefix extensions/vscode
mise exec -- npm run extension:build
mise exec -- npm run extension:test
mise exec -- npm run extension:package
mise exec -- npm run extension:verify
```

[Client integration tests](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/extensions/vscode/test/client.test.ts) exercise the actual server with local fixtures. [Webview tests](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/extensions/vscode/test/webview.test.ts) inspect the shipped panel script; other tests cover status, authorization and account flows. These checks do not use paid providers. Node tests and browser rendering do not substitute for an actual Extension Development Host check. The [validation matrix](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/docs/validation.md) records what has been exercised.

For API maintenance, use the official [extension host](https://code.visualstudio.com/api/advanced-topics/extension-host), [webview](https://code.visualstudio.com/api/extension-guides/webview), [SecretStorage](https://code.visualstudio.com/api/references/vscode-api#SecretStorage) and [extension testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension) documentation.
