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
4. Choose **Start a supervised session**, select a crew, runtime and budget, then confirm **Create session**. The wizard supports going back before confirmation.
5. Choose **Start remote crew** in the queued session. This command name also controls work on a local workbench.
6. Inspect **Checks**, **Changes** and the final review, then download the Git bundle, patch or manifest from **Brief**.

The demo runs a fixed repository fixture and real checks without AI calls or Ploeg. An arbitrary objective in demo mode does not turn the fixture into a live coding agent. **New Remote Session** creates an ad hoc session; live work requires a configured live runtime. See the [demo guide](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/docs/operations/demo.md).

## Connect and sign in

Run **Unfold: Connect to Workbench** with the deployed HTTPS origin. When configured, **Sign in with <provider>** shows a short code such as `BCDF-GHJK` and opens the workbench's browser sign-in. After you sign in, the browser names the request and shows the same code: approve it only if the codes match. The editor then acts as you, with its own credential that lasts thirty days and that you can sign out under **Settings › Signed-in editors** in the browser. Local-account login is also supported.

The editor credential, or the session cookie of a local-account login, stays in VS Code SecretStorage, scoped to that origin. There are no password or API-key settings. The extension runs in the local UI host even in a Remote SSH window, so the workbench must be reachable from your machine. HTTPS is required except for loopback development. Use an origin at `/`; reverse-proxy subpaths and browser-only SSO interception are unsupported.

The server enforces identity and session ownership. Viewers inspect visible sessions, operators change their own sessions, and administrators can access all sessions. Changing the connection invalidates pending actions so they cannot be submitted to the wrong workbench.

## Use Unfold from the Agents window

After you sign in, Unfold appears in VS Code's Agents window on its own, within seconds and without a reload. Its sessions show up there next to your other agents, grouped as **Unfold · <repository> [Unfold]**. To start one, choose **New**, then **Workspace ▾ → Unfold · <repository>**. The extension adds the workbench to `chat.remoteAgentHosts` in your default profile's user `settings.json`. It keeps your comments and other settings, and removes the entry again when you sign out. The entry is called **Unfold**; once you use more than one workbench, each is called **Unfold (<host>)**. A name you gave the entry yourself stays. **Unfold: Connect VS Code Agents Window** does the same on demand and offers **Open Agents Window**; **Unfold: Open Agents Window** adds a missing entry and opens the window, and the **Get started** walkthrough has a step for it. **Connect VS Code** on the workbench's **Settings › Signed-in editors** page opens `vscode://webgrip.unfold/connect-agents-window`, which does the same from the browser. The status bar shows **Unfold · Agents window ✓** once an Agents window has connected with this editor's token, checked every 20 seconds. **Not connected** leads to **Open Agents Window**, **Reconnect** and **Troubleshoot**; the Agents window's **Agent Host** output channel says why a connection failed.

The entry carries a personal connection token in plain text, because that is where VS Code reads it. The extension keeps a copy in SecretStorage and reuses it while the workbench accepts it. Set `unfold.agentHost.autoConnect` to `false` to connect only through the command. If `settings.json` cannot be parsed or written, nothing changes and **Copy address** offers the manual route: in the Agents window, run **Sessions: Add Remote Agent Host…** and paste the copied `wss://…?tkn=…` address. The [operations guide](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/docs/operations/live.md#attaching-vs-code-as-an-agent-host-client) has the details.

## See what waits on you

The Unfold sidebar opens on **Now**, the same list as the browser's Now page:

1. **Ready for your review**: Work Items whose pull request waits on a person, with the pull request number. The inline icon opens the pull request.
2. **Needs you**: Work Items Ploeg stopped on, each led by its reason ("Budget ran out", "Agent is stuck", …), plus sessions that wait for your answer, stopped or failed. A Work Item that a session drives appears once, as the session.
3. **Proposed**: follow-up work an agent proposed, which runs only after a person approves it.
4. **Running**: each running session with the Role that works, its elapsed time and spend so far, and each other running Run with its Role, Round, elapsed time and the gateway's cost so far, which is not settled spend.

Select a row to open its Work Item panel; the second inline icon opens it in the browser. The activity-bar badge counts what is ready for your review or needs you, each Work Item once. The status bar shows the same counts and turns amber only when something needs you. While exactly one session runs, it names the working Role with a running clock, for example **Reviewer 0:41**, and a click opens that Work Item. A Work Item that newly needs you raises a notification; with `unfold.notifications` set to `all`, so does one that newly becomes ready for review.

**Tasks** lists your team's tracker boards. A task Ploeg holds shows its state, for example "Ready for review" or "Needs you · Budget ran out". **Work** browses each Team's lanes. **Sessions** holds supervised sessions. It appears in the demo, with shared execution, or when you have sessions, and starts collapsed.

States, reasons, amounts and dates come from the browser's own modules, so both clients word them the same way: `US$ 1.234,50`, 24-hour times, and "Not reported" when spend is unknown, never zero. Each status tone is a theme colour you can change in `workbench.colorCustomizations`: `unfold.live` (running), `unfold.attention` (needs you), `unfold.review` (ready for review), `unfold.success`, `unfold.danger` and `unfold.severe` (stopped retrying, infrastructure failures). By default they follow your theme's own colours.

## Work and review

| Surface | What to use it for |
| --- | --- |
| Now | See what waits on you across every Team, and what is running |
| Sessions tree | Find active work, pending decisions, queued sessions and history. Expand a session for its crew, evidence and source task |
| Brief | Read the objective, imported snapshot, retained transcripts, review candidate and handoff |
| Changes | Inspect captured patches by file |
| Checks | Read recorded check output and distinguish passing, failing and expected fixture failures |
| Activity | Inspect durable events, tool input/output and the brief supplied to each role |
| Gateway | Inspect attributed model requests, routing, cost and errors; open configured Grafana links |
| Work Item panel | See a Work Item's state, reason and next action, its pull requests with CI and reviews, cost per role and Runs; read the task, hand it to a Ploeg team or take it back, check out its branch, or start a supervised session. When an Unfold session drives the Work Item, the panel leads with its progress: the headline, the working Role with a ticking clock and its last activity, the Steps (each Role's outcome and verdict, a cut-off Run and a verdict read only from its transcript marked as such), the Change (files, lines, branch, candidate), what Unfold and Ploeg disagree about, and the actions that fit: **View change** in VS Code's multi-file diff editor, **Investigate** as a Markdown document, **Answer**, **Resume**, **Pause**, **Accept**, **Reject**, **Open session**, and **Deliver approved work** or **Run again** with a confirmation once the workbench offers them. It follows the session's event stream while visible. Ploeg's own Runs move under **As Ploeg records it** |
| Work tree | Browse each Team's lanes in a bounded snapshot. A Work Item opens its panel; the inline icon opens it in the browser |

**Check Out Branch**, in the Work Item panel and on Now and Work rows, switches an open clone of the Work Item's repository to the branch Ploeg works on. It reads the Work Item from the workbench, finds the open folder with a remote that points at the target repository's full path on the forge of its pull request link, fetches the branch, creates a local tracking branch or switches to the existing one, and fast-forwards it when it is only behind. It uses VS Code's built-in Git extension, asks first when the folder has uncommitted changes, and leaves a diverged branch as it is. Without a matching clone it offers the git command and, when the forge is known, **Clone repository**. The browser's **Open in VS Code** opens `vscode://webgrip.unfold/checkout?workItem=<id>&origin=<workbench>`: the extension refuses a link for another workbench than the one it is connected to, and always asks before it switches. Demo Work Items have nothing to check out. A remote host matches the forge when it is the same host, when both share a parent domain below their first label (`forgejo-ssh.example.dev` and `forgejo.example.dev`), or when `unfold.remoteHostAliases` maps it to the forge, for example `{"ssh.git.example.com": "git.example.com"}`. Before the Work Item has a pull request link, a clone of the same full path on any host matches.

The crew strip distinguishes implementation, analysis and the final independent review. Earlier read roles supply analysis. Writing crews require an explicit final approval. A completed session awaits the person's review; accept or reject it from the toolbar or **Record Review** command. Rejection requires a reason, and the decision records the person who made it.

Permission and question cards wait for an explicit answer. **Allow once** grants the displayed request; broader choices appear only for declared patterns. Container and Kubernetes sessions can switch between **Approve automatically** and **Ask me again** while active. Local-backend sessions always ask, and questions require an answer in either mode.

Start, pause, resume and cancel follow the server's permitted transitions. Cancellation does not create replacement work. An instruction is saved for the next execution; **Pause the active run first** pauses before saving it. The composer distinguishes a local draft, sending, saved and delivery unknown.

No API mutation is retried automatically. A read that meets an unreachable workbench or a gateway error is retried once. If a response is lost, refresh before repeating the action: the server may have accepted it. Shared execution also has stricter recovery and budget rules than standalone mode. In particular, the current shared API does not support the standalone additional-budget operation. See the [HTTP contract](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/docs/contracts/api.md).

The spending card distinguishes authorization, observations, reservations and settlement. Unknown spend is not zero. Gateway data can arrive late and cannot prove an exact ceiling for requests already in flight.

## Work from a task

An administrator configures sources on the workbench. Registered Forgejo, GitHub, GitLab, ClickUp and Vikunja sources appear in both clients. Tracker credentials stay on the server. Personal GitLab account linking is available through **Unfold: Linked Accounts**; it does not automatically register a task source. Configuration and scope limits are in the [task connection guide](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/docs/operations/task-connections.md).

Select a task to open its task view. The description is rendered from the tracker as inert text; links open in your browser only when they use HTTPS. The head of the panel says whether Ploeg already has the task, what state it is in, why, and what happens next.

**Hand to Ploeg** is offered on boards that Ploeg owns. Choose a team and confirm: the workbench assigns that team's tracker user and comments that you handed it over, which is how Ploeg receives work. Ploeg queues it, works on a branch and opens a pull request for review. **Take back** removes the assignment while the item is still queued; work that has started is cancelled from the browser's Work Item page. Viewers can read the task view but cannot hand work over. Older workbench servers show the task without Ploeg status.

**Start a supervised session** prepares operator-led work instead: choose the crew and authorization, then confirm the workbench and task revision. A stale revision requires a fresh preview. Repeating the same import reopens its existing session; it does not create another paid attempt. Import prepares queued work; Start begins execution. Standalone import requires an interactive source and repository. In shared mode, registered Vikunja and ClickUp targets can bind to the existing Ploeg Work Item, which is claimed on Start. Import itself does not mutate the tracker. Source text cannot select another repository or change execution authority.

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

Notifications cover decisions, failures and results ready for review. Configure `unfold.notifications`, `unfold.liveUpdates` and the polling interval in settings. No global keyboard shortcuts are registered; the composer supports Ctrl+Enter or Cmd+Enter.

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
