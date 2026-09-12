# De Vloer 0.2.0: task to reviewable candidate

This iteration adds a shared task intake workflow to the browser and VS Code. Register a Vikunja project, ClickUp List, or Forgejo/GitHub/GitLab issue source; preview one task; import it into a queued session; then start a crew on the configured server. The result retains its task context, activity and review evidence, with immutable candidate export where the workspace supports it.

The release is an operator-led proof of concept. It does not implement the entire 78-ticket platform design. Ploeg remains responsible for unattended dispatch, and the final independent verification and forge publication are human operations.

## Try the complete local demonstration

Requirements: Node **24**, Git and a modern browser. The demonstration itself needs no package installation, provider token, task account or Kubernetes cluster.

```sh
npm run demo
```

Open **http://127.0.0.1:4080**. Use the default loopback address because demo mode signs in a demo operator automatically. To keep this walkthrough's state separate from other sessions:

```sh
VLOER_DATA_DIR=.vloer/iteration-0.2.0 npm run demo
```

1. Select **Tasks**. The **Demo fixture tasks** connection is selected automatically; its tasks are explicitly labeled fixtures.
2. Preview **[Demo fixture] Fix checkout rounding**. Inspect the source identity, objective and **Order service** destination.
3. Choose **Delivery crew**, the **Demonstration** runtime and a session budget, then **Create session**. Confirm that the new session is queued; importing does not launch execution.
4. Select **Start crew**. The deterministic writer proves a real failing baseline, modifies source in an isolated checkout and reruns Node tests. The reviewer separately inspects and checks the result.
5. Inspect the work, checks, review verdict and activity. Reload the browser to see the same durable session and imported context.
6. In **Repository handoff**, download **Git bundle**, **Binary patch** and **Manifest**. Inspect the manifest and patch, then reproduce the candidate in a separate review directory as described below.

After the crew finishes, the session briefly prepares its review candidate before reaching its final state. Export progress is part of the retained session; leave the service running until it reports candidate availability.

The demonstration makes **zero model requests** and records **zero model spend**. It proves the operating flow and actual fixture checks, not AI capability or real provider connectivity. The older [demo guide](demo.md) gives more detail about the fixture and intervention controls. `npm run smoke` verifies the deterministic delivery flow against a running demo server.

## Use the same workflow from VS Code

Install the packaged **`extensions/vscode/de-vloer-0.2.0.vsix`** through Extensions → … → Install from VSIX. The package is included in the release archive. If the real `code` command is installed on your laptop, you can also run:

```sh
code --install-extension extensions/vscode/de-vloer-0.2.0.vsix
```

Connect the extension to the demo URL or your private remote HTTPS workbench. Open the **Linked Tasks** view or run **Vloer: Browse Linked Tasks**. Select a source and task. The extension shows a read-only task snapshot before **Import Linked Task into Session** asks for the crew, runtime, budget and destination confirmation. Start the queued crew separately.

Use **Open Imported Task Snapshot** to revisit the task content retained with the session. **Download Review Candidate** and the evidence panel's download buttons open a local save dialog for the bundle, patch or manifest. Downloading evidence is explicit; opening the extension does not clone a repository or run an agent on the laptop.

The existing session tree, themed work/evidence/activity panel, pause/resume/cancel controls, permission responses and explicit file/selection sharing remain available. The editor holds its own Vloer login cookie in SecretStorage. Task-provider credentials remain on the configured Vloer server.

Actual API and webview checks are recorded in [validation](../validation.md). A real VS Code Extension Host was not available in the preparation environment, so native activation, desktop SecretStorage and installation must still be qualified on a coworker's machine. No marketplace publication is claimed.

## Connect real work

Use the complete [task source example](../../config/task-sources.example.json) and [connection instructions](task-connections.md). Connection registration requires administrator configuration in this iteration. Keep only the providers you use, choose their permitted repository/project/List scope, and provide the named token variables to the server.

For real agents, follow [live operation](live.md) to configure OpenCode, a working LiteLLM model alias and a registered repository. An `opencode` runtime with `backend: "local"` runs on the **Vloer server**. If that server is remote, the work is already off the laptop. That backend shares the control plane's OS user and is for a trusted single-user pilot. Use the Kubernetes workspace backend for the intended shared-team isolation, and qualify it on your cluster.

The task system and forge are independent. A Vikunja task can produce a candidate for code hosted on Forgejo, GitHub or GitLab. The source registration points to an approved repository ID. Reading an issue does not grant Git access or publication credentials.

Preview one small open task, import it with an explicit small budget, and start the remote crew. Test a disconnect and return, a human instruction, actual reviewer findings, spend settlement and cleanup. Unknown prompt acceptance or spend remains visible; do not create a replacement session to bypass it.

## Review the exported candidate

Candidate capture produces three review files:

| File | Purpose |
| --- | --- |
| `manifest.json` | Captured base and candidate identity, included files, integrity information and export metadata |
| `candidate.patch` | A Git patch that preserves binary changes and file modes and can be applied at the captured base |
| `candidate.git.bundle` | A self-contained Git snapshot bundle that can be inspected without contacting the original forge |

The bundle uses synthetic snapshot commits to preserve the captured base and final tree, including when the execution checkout is shallow. The manifest retains the original repository base identity. This is portable file-change evidence; it does not migrate an agent's conversation or preserve all intermediate agent commits.

Download the files from the same candidate. In a new directory outside the running Vloer service, inspect the bundle without executing its project scripts:

```sh
git clone --branch vloer-candidate /absolute/path/to/candidate.git.bundle vloer-candidate-review
git -C vloer-candidate-review log --oneline
git -C vloer-candidate-review show --stat HEAD
git -C vloer-candidate-review diff HEAD^ HEAD
```

Read the manifest and compare the captured repository/base with the intended task. Review additions, deletions, executable modes and binary changes. Run the project's required checks in a suitable review environment. The exact commands come from your trusted repository policy; a green agent summary is not sufficient evidence by itself.

For a proposal against the real repository, use a clean review branch at the manifest's original base, then inspect and apply the patch:

```sh
git switch -c review/vloer-task CAPTURED_BASE_SHA
git apply --check /absolute/path/to/candidate.patch
git apply --index /absolute/path/to/candidate.patch
git diff --cached --stat
```

Replace `CAPTURED_BASE_SHA` with the actual manifest value. These commands assume a clean checkout containing that commit; stop and inspect a failed applicability check. After independent verification, a human can commit and publish the branch through the repository's normal Forgejo, GitHub or GitLab process. Vloer does not push, open a PR/MR, merge, deploy or close the source task in this iteration.

The snapshot includes base-tracked and index-tracked paths plus unignored worktree files, preserving additions, deletions, binary content, executable modes and symbolic-link entries. Ignored, untracked build output, caches and local files are outside that scope. The exporter supports ordinary SHA-1 Git repositories. Submodules, Git LFS pointers, linked-worktree metadata, object alternates and invalid UTF-8 paths are rejected. The current bounds are 5,000 paths, 16 MiB per file and 64 MiB of source content; repos exceeding these bounds need a future larger-repository export path.

Known credential paths and recognizable secret content cause capture to fail rather than producing a silently incomplete bundle. This check is a limited safeguard, not a complete secret detector. The exporter also checks for changes during capture. A manifest marks independent verification and publication as not performed; file integrity hashes do not establish trusted execution or acceptance.

Export availability is separate from session success. Inspect an unavailable or failed export explicitly; do not treat a short text artifact as a substitute for the full candidate. Backend qualification and remaining limits are recorded in [validation](../validation.md).

| Workspace | Export path | Qualification boundary |
| --- | --- | --- |
| Deterministic demo | Capture the isolated Git fixture after execution stops | Reproducible without model or infrastructure credentials |
| Local server workspace | Capture the managed checkout on the Vloer server | Intended for a trusted single-user host; shares its OS user |
| Kubernetes workspace | Confirm the agent Pod is gone, then run an export-only Pod against the retained PVC mounted read-only | Implemented integration path; a real cluster, image and storage/network policy remain unqualified |
| Shared external HTTP runtime | No supported filesystem export contract | Explicitly unavailable; the runtime's text artifacts do not replace a complete candidate |

The Kubernetes exporter receives neither repository credentials nor the session's model key or Kubernetes service-account credentials. If the old agent cannot be confirmed stopped or capture fails, Vloer retains the workspace for operator recovery. The control plane retains the export and checks downloaded bundles and patches against their recorded hashes.

## Improve Vloer with Vloer

Keep the stable service and its data separate from the checkout being improved. The stable release is the control plane; the candidate repository is an ordinary registered target. Never have an agent replace the running server or edit its persistent state as part of a code task.

1. Publish or select the actual Vloer repository on your forge and register its HTTPS clone URL, trunk branch and required toolchain. The delivered repository has local history; it is not an automatically published remote.
2. Put one bounded improvement in your chosen tracker, with acceptance criteria, required checks and a clear human owner. The [backlog export guide](backlog.md) supplies 78 prepared items. Existing candidate items need review before being assigned again.
3. Connect that task source to the registered Vloer repository. Keep this repository in the interactive lane and outside any unattended Ploeg poller until shared authority is implemented.
4. Preview and import the task from VS Code or the browser. Authorize a small budget, choose the crew and start a separate remote workspace.
5. Review the retained source snapshot, instructions, findings, checks and candidate export. If an intervention is needed, pause, record it and explicitly resume after inspecting execution/spend state.
6. Independently verify the candidate, publish a human-reviewed PR/MR, and let the repository's own CI and review policy decide whether it merges.
7. Deploy a newly accepted release through the normal release process. Only then move the stable service to that version and verify that retained sessions remain readable.

For the first real Vloer task, the target workspace needs Node 24, Git and the project's development dependencies. A change involving the extension needs its separate dependencies and build checks; browser changes need a qualified Chromium. The [self-improvement design](../design/self-improvement.md) describes the future trusted verifier, publisher and takeover protocol.

## Implemented scope and remaining work

| Capability | 0.2.0 operating scope | What remains |
| --- | --- | --- |
| Task connections | Server-configured Forgejo, GitHub, GitLab, ClickUp and Vikunja read adapters | OAuth/App installation, graphical setup, rotation automation and team-specific source access |
| Task selection | Browse, preview and explicitly import an open task with retained source revision | Continuous reconciliation, comments/attachments/custom-field ingestion, rich filters and cross-system task equivalence |
| Task execution | Queued interactive sessions; operator starts a registered crew and runtime | Ploeg-owned canonical WorkOrders, transactional intake, shared claims and fenced takeover |
| Browser and VS Code | Shared API, task workflow, durable sessions, intervention and evidence views | Native desktop qualification and deeper native source comparison |
| Remote agents | Existing OpenCode and command seams; local server and Kubernetes workspace code | Live provider, cluster, image and billing qualification for the chosen deployment |
| Candidate evidence | Retained export contract and downloadable review files for supported backends | Signed provenance, trusted independent live verification, broader backend qualification and retention policy |
| Forge integration | Issue intake plus Git checkout/review artifacts for a human publication workflow | Automated authenticated PR/MR publication, reconciliation and merge policy integration |
| Team operations | Local accounts, owner/admin session authorization and one SQLite application replica | OIDC, memberships, tenant isolation and multi-replica control-plane coordination |

The [validation matrix](../validation.md) is authoritative for executed checks. Connector fixtures do not establish real account compatibility; an API-tested Kubernetes export path is not a tested deployment; packaging a VSIX does not prove native desktop behavior. The Ploeg foundation patch remains a separately reviewable source candidate with its Go/PostgreSQL gates pending.

## Upgrade a previous pilot

Stop the single server and take a consistent backup of its state and retained workspaces before switching releases. Preserve the deployment's data directory and configuration, install the new VSIX, and start the new server. Historical sessions remain inspectable, but candidate exports are not retroactively created for old completed sessions that lack a captured base and snapshot. Review interrupted work and uncertain spend before explicitly resuming; the upgrade must not silently repeat paid work.

## Show the value honestly

The demonstration story is concrete: **bring your task system, keep your code host, steer remote crews from one workbench, and take the result back as reviewable Git evidence**. Show a coworker the task preview, the deliberate start, an intervention, a real failed-to-passing check and the exported candidate. Then show the same session from the editor.

For a pilot, measure time to a reviewable candidate, operator intervention time, percentage of candidates independently accepted, model spend per accepted task and recovery after an interruption. Compare that complete workflow with your existing tool. No productivity multiplier, uniqueness claim or production readiness is established by this release. The [market research](../research/market-landscape.md) and [go-to-market plan](../product/go-to-market.md) explain the wider positioning and competitor overlap.
