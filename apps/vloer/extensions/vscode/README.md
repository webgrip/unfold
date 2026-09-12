![De Vloer](https://forgejo.webgrip.dev/webgrip/de-vloer/raw/branch/development/docs/brand/png/banner-512.png)

# De Vloer for VS Code

Start agent work, respond to questions and review results from your editor. A Vloer workbench prepares the workspace and runs the harness; that workbench can be on your machine or on a remote host. The extension connects to its authenticated API.

The [product designs](https://forgejo.webgrip.dev/webgrip/de-vloer/src/branch/development/docs/PRODUCT-DESIGN.md) include proposals beyond the implemented extension. This guide describes the current client.

## Install

Download the VSIX and its matching `.sha256` file from a completed [Forgejo release](https://forgejo.webgrip.dev/webgrip/de-vloer/releases). In the download directory, run `shasum -a 256 -c` with that checksum filename and confirm the VSIX reports **OK**. Then choose **Extensions → … → Install from VSIX** and select that file. Use the filenames attached to your chosen release; a release page without the assets is not ready for this installation path.

[Open VSX](https://open-vsx.org/extension/webgrip/de-vloer) is the preferred registry publication target. Availability depends on successful publication for the chosen version. Marketplace distribution remains conditional; do not assume that searching by identifier in every editor will find the extension. The [release guide](https://forgejo.webgrip.dev/webgrip/de-vloer/src/branch/development/docs/operations/release.md#extension-distribution) explains those conditions.

A sideloaded VSIX does not receive registry updates automatically. Use VS Code 1.99 or later. The extension runs in the editor's Node extension host and does not require provider keys, a harness or Kubernetes tools on the client machine. A local workbench has its own runtime requirements.

## Try the local demonstration

With Node 24 and Git available through the repository's tool configuration, run this from the repository root:

```sh
mise exec -- npm run demo
```

1. Open the **De Vloer** activity bar and run **Vloer: Connect to Workbench**. Enter `http://127.0.0.1:4080`; demo mode supplies its identified demonstration user.
2. Expand **Linked Tasks → Demo tasks**, open the fixture task and inspect its preview.
3. Choose **Set up session**, select a crew, runtime and budget, then confirm **Import task**. The wizard supports going back before confirmation.
4. Choose **Start remote crew** in the queued session. This command name also controls work on a local workbench.
5. Inspect **Checks**, **Changes** and the final review, then download the Git bundle, patch or manifest from **Brief**.

The demo runs a fixed repository fixture and real checks without AI calls or Ploeg. An arbitrary objective in demo mode does not turn the fixture into a live coding agent. **New Remote Session** creates an ad hoc session; live work requires a configured live runtime. See the [demo guide](https://forgejo.webgrip.dev/webgrip/de-vloer/src/branch/development/docs/operations/demo.md).

## Connect and sign in

Run **Vloer: Connect to Workbench** with the deployed HTTPS origin. When configured, **Sign in with <provider>** opens the workbench's browser sign-in with a one-time code. The editor then acts as the same person. Local-account login is also supported.

The returned session cookie stays in VS Code SecretStorage, scoped to that origin. There are no password or API-key settings. The extension runs in the local UI host even in a Remote SSH window, so the workbench must be reachable from your machine. HTTPS is required except for loopback development. Use an origin at `/`; reverse-proxy subpaths and browser-only SSO interception are unsupported.

The server enforces identity and session ownership. Viewers inspect visible sessions, operators change their own sessions, and administrators can access all sessions. Changing the connection invalidates pending actions so they cannot be submitted to the wrong workbench.

## Work and review

| Surface | What to use it for |
| --- | --- |
| Sessions tree | Find active work, pending decisions, queued sessions and history. Expand a session for its crew, evidence and source task |
| Brief | Read the objective, imported snapshot, retained transcripts, review candidate and handoff |
| Changes | Inspect captured patches by file |
| Checks | Read recorded check output and distinguish passing, failing and expected fixture failures |
| Activity | Inspect durable events, tool input/output and the brief supplied to each role |
| Gateway | Inspect attributed model requests, routing, cost and errors; open configured Grafana links |
| Ploeg tree | Browse allowed teams and bounded work snapshots, then open workbench details for shifts, runs and accounting |

The crew strip distinguishes implementation, analysis and the final independent review. Earlier read roles supply analysis. Writing crews require an explicit final approval. A completed session awaits the person's review; accept or reject it from the toolbar or **Record Review** command. Rejection requires a reason, and the decision records the person who made it.

Permission and question cards wait for an explicit answer. **Allow once** grants the displayed request; broader choices appear only for declared patterns. Container and Kubernetes sessions can switch between **Approve automatically** and **Ask me again** while active. Local-backend sessions always ask, and questions require an answer in either mode.

Start, pause, resume and cancel follow the server's permitted transitions. Cancellation does not create replacement work. An instruction is saved for the next execution; **Pause the active run first** pauses before saving it. The composer distinguishes a local draft, sending, saved and delivery unknown.

No API mutation is retried automatically. If a response is lost, refresh before repeating the action: the server may have accepted it. Shared execution also has stricter recovery and budget rules than standalone mode. In particular, the current shared API does not support the standalone additional-budget operation. See the [HTTP contract](https://forgejo.webgrip.dev/webgrip/de-vloer/src/branch/development/docs/contracts/api.md).

The spending card distinguishes authorization, observations, reservations and settlement. Unknown spend is not zero. Gateway data can arrive late and cannot prove an exact ceiling for requests already in flight.

## Import a linked task

An administrator configures sources on the workbench. Registered Forgejo, GitHub, GitLab, ClickUp and Vikunja sources appear in both clients. Tracker credentials stay on the server. Personal GitLab account linking is available through **Vloer: Linked Accounts**; it does not automatically register a task source. Configuration and scope limits are in the [task connection guide](https://forgejo.webgrip.dev/webgrip/de-vloer/src/branch/development/docs/operations/task-connections.md).

Open a task's inert text preview, inspect its mapped repository, choose the crew and authorization, then confirm the workbench and task revision. A stale revision requires a fresh preview. Repeating the same import reopens its existing session; it does not create another paid attempt. Import prepares queued work; Start begins execution.

Standalone import requires an interactive source and repository. In shared mode, registered Vikunja and ClickUp targets can bind to the existing Ploeg Work Item, which is claimed on Start. Missing or unsupported bindings remain unavailable for import. Import itself does not mutate the tracker. Source text cannot select another repository or change execution authority.

## Bring back evidence

The **Brief** tab shows the review candidate when capture is available. **Download Git bundle**, **Download patch** and **Download manifest** each ask for a local destination. **Vloer: Download Review Candidate** offers the same choices.

The bundle preserves exported Git objects, including binary content, modes and deletions. The patch describes changes against the recorded base; the manifest identifies the captured state. An export alone does not certify independent verification or permission to publish.

Downloads authenticate to the workbench, refuse redirects, enforce a size limit and verify bundle/patch digests before saving. Existing destination files are preserved. An unavailable capture keeps its explanation visible. The extension does not execute, apply or merge downloaded changes automatically.

**Open Evidence** opens retained patches, checks and summaries as read-only documents. A patch view is not a live remote filesystem or native comparison of complete base/head files.

## Send editor context

Use **Vloer: Send Selection to Remote Session…** or **Vloer: Send Current File to Remote Session…**. Select the destination, inspect the preview and confirm. The preview names the workbench, session, repository, file, range and unsaved-buffer state.

Each attachment is limited to 12,000 characters and becomes a durable instruction. It does not upload the repository or synchronize the checkout. Workspace Trust is required. Review the content before sending; this is not a channel for credentials.

## Connection and privacy

Open panels consume the server event stream, with polling as a fallback. The footer distinguishes live, polling and disconnected states. Disconnection disables panel mutations; closing the editor does not stop remote work. **Open complete history** fetches retained events beyond the bounded panel buffer. The Ploeg tree uses refreshed snapshots rather than a lossless subscription.

Notifications cover decisions, failures and results ready for review. Configure `vloer.notifications`, `vloer.liveUpdates` and the polling interval in settings. No global keyboard shortcuts are registered; the composer supports Ctrl+Enter or Cmd+Enter.

Cookies remain in the extension host. The webview receives public session data through a narrow message protocol, never login secrets, inference keys or Kubernetes credentials. Its scripts and styles are packaged locally; the content security policy blocks network connections and remote code. The server origin is application-scoped, so workspace settings cannot redirect it. There is no cross-origin credential forwarding or disabled certificate verification.

The extension implements no analytics or background repository uploads. Drafts can persist in local webview state; saved instructions and evidence follow the workbench's retention policy.

## Develop and validate

Open this directory in VS Code, install its dependencies, then use the included **Run De Vloer Extension** F5 configuration. Keep the local demo server available. From the repository root:

```sh
mise exec -- npm ci --prefix extensions/vscode
mise exec -- npm run extension:build
mise exec -- npm run extension:test
mise exec -- npm run extension:package
mise exec -- npm run extension:verify
```

[Client integration tests](https://forgejo.webgrip.dev/webgrip/de-vloer/src/branch/development/extensions/vscode/test/client.test.ts) exercise the actual server with local fixtures. [Webview tests](https://forgejo.webgrip.dev/webgrip/de-vloer/src/branch/development/extensions/vscode/test/webview.test.ts) inspect the shipped panel script; other tests cover status, authorization and account flows. These checks do not use paid providers. Node tests and browser rendering do not substitute for an actual Extension Development Host check. The [validation matrix](https://forgejo.webgrip.dev/webgrip/de-vloer/src/branch/development/docs/validation.md) records what has been exercised.

For API maintenance, use the official [extension host](https://code.visualstudio.com/api/advanced-topics/extension-host), [webview](https://code.visualstudio.com/api/extension-guides/webview), [SecretStorage](https://code.visualstudio.com/api/references/vscode-api#SecretStorage) and [extension testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension) documentation.
