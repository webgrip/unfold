# Fullsend × Unfold: fit record

Date: 27 October 2026, against `origin/development` at `7cf86097` with Ploeg pinned at `0.2.0-rc.83`, and Fullsend `v0.50.0` (released 23 October; `main` at `d1f52c159`). This is a record. It changes no decision by itself. It follows the [Hive fit record](2026-10-27-hive-fit.md), which named Fullsend as the survey to run next. The [glossary](../reference/glossary.md) defines each capitalised term.

> **Method.** Three research agents ran in parallel: a crawl of fullsend.sh and the repository's documentation ([1-docs-crawl.md](evidence/2026-10-27-fullsend/1-docs-crawl.md)); a source dig over a read-only full-history clone and the GitHub API ([2-repo-dig.md](evidence/2026-10-27-fullsend/2-repo-dig.md), with the adopter list in [adopters.txt](evidence/2026-10-27-fullsend/adopters.txt)); and an ecosystem and absence sweep ([3-ecosystem-and-absences.md](evidence/2026-10-27-fullsend/3-ecosystem-and-absences.md)). The seam map of this repository is the one made the same day for the Hive record ([4-seam-map.md](evidence/2026-10-27-hive/4-seam-map.md)). Downloaded pages and code were treated as data, never run. These claims were checked first-hand rather than taken from an agent: the GitHub numbers (164 stars, 126 forks, created 9 March 2026, latest release `v0.50.0`); `internal/forge/` holding only `github/`, `gitlab/` and `jira/`; `DetectForge` in `internal/forge/detect.go` knowing only `github.com` and `gitlab.com`.

## Verdict

**Fullsend is an agent pipeline that runs inside the customer's own CI, not a control plane, and not a substitute for Ploeg or Unfold. Do not adopt it. It overlaps Ploeg's execution guards more closely than Hive does and Unfold's surfaces less. Mine four of its designs and watch for Forgejo support.**

Fullsend is Red Hat's "ADLC platform" (agentic development lifecycle): a reusable GitHub Actions or GitLab CI workflow that each repository calls from a small shim. Labels on the forge are its state machine. Six agents (triage, prioritize, code, review, fix, retro) run one per job in an NVIDIA OpenShell container sandbox with deny-by-default egress. Short-lived per-role tokens are minted from the CI job's OIDC identity, and a host-side script, not the agent, pushes the branch and opens the pull request. It has no dashboard, no money cap and no tenant above the repository, and nothing merges.

The two verdict axes, stated separately:

- **Maturity** is moderate and single-vendor. Fullsend is pre-1.0 (98 releases since 2 April, every minor through a release candidate since v0.44). Its own agents wrote 42,8 % of its commits in the last 90 days and 65 % of its merged pull requests. Its 50 human committers have 5,245 commits from redhat.com addresses and none from elsewhere at scale. It has no foundation, no pricing and no public launch. It is used for real: 145 repositories carry its configuration or shim, and its bot has 775 merged pull requests outside its own organisation. Nearly all of that is Red Hat or adjacent (Konflux, Quay, Red Hat Developer, Podman Desktop).
- **Fit** decides. Fullsend's whole design is "run in the forge's CI with the forge's identity". That is its strength on GitHub and its limit everywhere else: no Forgejo, no queue across repositories, no budget, no place for a person to follow work outside the forge. Ploeg exists for exactly those.

**Absences.** Across Fullsend's code and documentation there are zero mentions of Vikunja, ClickUp, KEDA, gVisor, Talos, OpenBao, Authentik, AHP, Omnigraph, Unfold or Ploeg. **Forgejo is named in the README tagline and in schemas, and has no code**; the website lists GitHub and GitLab only. Kata appears in threat-model docs only. kubernetes-sigs `agent-sandbox` was evaluated and called a "poor fit". ACP appears only as an investigation issue. Fullsend's landscape page does not mention Hive, Devin or Factory.

Summary:

1. **What it is.** A meta-harness of per-role agent specs, a CLI (`fullsend run`) and reusable CI workflows; configuration in `.fullsend/config.yaml` per repository ([section 1](#1-what-fullsend-is)).
2. **Security shape matches Ploeg's.** The agent holds placeholders, a proxy fills them in, and a host step outside the sandbox pushes with the write token. That is the same split as [Ploeg ADR-0034](../../apps/ploeg/docs/adrs/0034-the-harness-gets-placeholders-the-worker-keeps-credentials.md). The exception is the default Claude-on-Vertex path, which copies a short-lived cloud credential into the sandbox ([1.3](#13-credentials-and-isolation)).
3. **Money is reported, not authorized.** Cost is the runtime's own `total_cost_usd`, recorded after the run; a cap is an open proposal ([1.4](#14-money-and-limits)).
4. **A person merges.** `MergeChangeProposal` exists and has no caller outside tests; auto-merge is an experimental, separate repository ([1.2](#12-lifecycle-and-autonomy)).
5. **Its review agent approved broken pull requests.** Pull requests with failing tests got an approval and `ready-for-merge`. That is the failure [Ploeg ADR-0119](../../apps/ploeg/docs/adrs/0119-a-pull-request-is-ready-for-review-only-when-the-forges-ci-passed-on-its-head.md)'s CI ready gate prevents ([1.5](#15-maturity-governance-and-critiques)).
6. **Correction to the Hive record.** The Hive record and the market landscape said Fullsend supports Forgejo. It does not; both are corrected with this record.

## 1. What Fullsend is

### 1.1 Self-description and shape

- Website: "Ship code on autopilot", an "ADLC platform", GitHub and GitLab ([fullsend.sh](https://fullsend.sh)). README: autonomous software development for GitHub, GitLab and Forgejo, "secure by design" ([README](https://github.com/fullsend-ai/fullsend/blob/main/README.md)).
- Vision doc: "Not a product spec. This is an exploration." The glossary calls Fullsend a "meta-harness".
- Five-layer stack, control flowing only downward (Fullsend ADR 0016): Dispatch/Coordination → Infrastructure → Sandbox → Harness → Runtime ([architecture.md](https://github.com/fullsend-ai/fullsend/blob/main/docs/architecture.md)).
- End to end: a per-repository shim workflow (`pull_request_target`, `id-token: write`) calls `reusable-dispatch.yml`; its `route` job maps `/fs-*` commands and labels to stage jobs on GitHub-hosted runners; `mint-token` exchanges the job's OIDC token for a per-role GitHub App token; `fullsend run` runs a pre-script, the sandbox, the runtime and a JSON-schema validation loop, then a host-side post-script that pushes and opens the pull request ([2-repo-dig §4](evidence/2026-10-27-fullsend/2-repo-dig.md)).
- Runtimes: Claude Code (the "stable default", Vertex AI by default), pi, Codex and OpenCode (experimental; OpenCode for read-only agents only). Inference: Vertex, OpenAI with workload identity, or a gateway (LiteLLM is named).
- Intake: GitHub issues, pull requests and Discussions; GitLab through a webhook plus a cron poller; Jira by polling ("Pre-alpha … not ready for general use").
- No operator dashboard. State is forge labels and status comments; telemetry is OpenTelemetry with GenAI conventions and an MLflow guide.

### 1.2 Lifecycle and autonomy

- Labels are the state machine: `needs-info`, `blocked`, `duplicate`, `feature`, `triaged`, `ready-to-code`, `ready-for-review`, `ready-for-merge`, `requires-manual-review`; on pull requests `fullsend-fix`, `fullsend-no-fix`, `needs-human`.
- **Triage promotes only bugs, docs and performance issues to `ready-to-code`.** Features wait for a person.
- Slash commands are authorized by the person's forge permission: triage access for `/fs-triage` and `/fs-review`, write access for the rest (`RequiredActorRole()` in `internal/harnessdispatch/auth.go`, failing closed). An optional `OWNERS`-file mode follows Prow.
- Fix loop caps: 5 bot-triggered iterations, 10 in total. Per-stage `privilege_levels` (read or write) in the harness spec, default write.
- There is no autonomy dial. `LADDER.md` is a ladder for **human contributors** (Vouched → Triage → Write → Maintainer), and a vouch gate auto-closes pull requests from unvouched first-time contributors.
- Merging: the glossary says "a human must merge"; the adoption guide documents `CODE_AUTO_MERGE=true` to switch on GitHub auto-merge; the roadmap puts a separate opt-in auto-merge agent off "until revert/defect visibility works". In code, `MergeChangeProposal` has no caller outside tests.

### 1.3 Credentials and isolation

- Sandbox: NVIDIA OpenShell, Podman containers on the runner, landlock best-effort, one ephemeral sandbox per run and role (Fullsend ADR 0020, ADR 0036). Egress is deny by default, opened per host and per binary at layer 7 by provider profiles (ADR 0065). No gVisor, Kata or Firecracker in code; isolation level is an open question.
- `GH_TOKEN` enters the sandbox only as a placeholder the proxy fills in. The write token stays with the host post-script. The code agent never pushes.
- Exception: on the default Claude-on-Vertex path, the harness copies a workload-identity config and a GitHub OIDC token file into the sandbox, refreshed about every five minutes. OpenAI and gateway credentials stay behind placeholders; the gateway's api-key mode uses a long-lived key.
- The token mint runs as a Google Cloud Function, a Cloudflare Worker or standalone, and checks `ALLOWED_WORKFLOW_FILES` and `ALLOWED_ROLES`. A hosted community mint, `mint.fullsend.sh`, is owned by "Red Hat Fullsend Bootstrap" (ADR 0068). GitLab has no mint and uses per-role access tokens.
- Compare Ploeg: placeholders in the harness, the worker keeps the real credentials ([ADR-0034](../../apps/ploeg/docs/adrs/0034-the-harness-gets-placeholders-the-worker-keeps-credentials.md)), and the harness runs in its own container with none ([ADR-0138](../../apps/ploeg/docs/adrs/0138-a-harness-runs-in-its-own-container-and-no-credential-enters-it.md)).

### 1.4 Money and limits

- Cost is whatever the runtime reports (`total_cost_usd`), written after the run to `metrics.json`, the OTel attribute `fullsend.cost_usd` and the status comment. Fullsend "does not … maintain a model-price table". Codex reports 0; a cancelled run reads 0.
- Limits: `timeout_minutes` (default 30) and `max_iterations`. A `max_cost_usd` ADR is open ([#6588](https://github.com/fullsend-ai/fullsend/issues/6588)).
- Compare [Ploeg ADR-0012](../../apps/ploeg/docs/adrs/0012-two-level-budgets-authorized-and-settled.md): a budget authorized at claim, a per-Run gateway key with that cap, settled after.

### 1.5 Maturity, governance and critiques

- Apache-2.0, DCO enforced (autonomous agent commits exempt), no CLA, CODEOWNERS `@fullsend-ai/core`, 145 ADRs. No foundation.
- Started 6 March 2026 as "Initial design exploration for fully agentic konflux-ci development" by Ralph Bean of Red Hat. Top-1 human share 39,0 % and top-4 66,2 % over the last 90 days.
- Tests: 632 Go test files and 31 Gherkin features. Required checks on `main` are `behaviour` and `playback`, the latter replaying recorded agent runs through a `dummy-playback` runtime. `go test -race` is not required.
- Forges in code: `forge.Client` has about 125 methods, implemented for GitHub and GitLab; GitLab returns "not supported" for 13 of them.
- Critiques: the review agent approved pull requests with failing tests ([#3272](https://github.com/fullsend-ai/fullsend/issues/3272), [#4346](https://github.com/fullsend-ai/fullsend/issues/4346), [#4347](https://github.com/fullsend-ai/fullsend/issues/4347); [#3005](https://github.com/fullsend-ai/fullsend/issues/3005) open); the default Claude runtime is tied to Vertex AI, which one would-be adopter cited for building on another tool instead ([crunchtools/mcp-ashigaru#48](https://github.com/crunchtools/mcp-ashigaru/issues/48)); Fullsend's own docs concede that GitHub Agentic Workflows achieve the same credential isolation "with substantially less complexity" (`docs/problems/platform-nativeness.md`); 1,905 open issues; Forgejo advertised and not built.
- No public footprint found: no blog post, talk, or Hacker News, Reddit, Lobsters or X thread.
- Name collisions to keep apart: fullsendhq.com (an AI content-marketing product) and the "Full Send" podcast brand.

## 2. Layer map

| Seam | Unfold / Ploeg today | Fullsend | Hive |
|---|---|---|---|
| Where it runs | ploegd plus one pod per Run in our cluster | The customer's CI runner, per job | One container per organisation |
| Work intake | Vikunja, ClickUp, GitHub Issues; Operator admission | GitHub, GitLab, Jira (pre-alpha) | GitHub, Linear, Jira |
| Forge | Forgejo, GitLab, GitHub | GitHub, GitLab; **Forgejo named, not built** | GitHub only |
| Queue across repositories | Ploeg's shift engine | **None**; each repository dispatches itself | Governor |
| Admission before spend | Authorized budget per Run | **None**; cost reported after | None |
| Credentials | Placeholders; harness container holds none | Placeholders; host post-script pushes; Vertex path copies a short-lived credential in | Scoped token in the agent by default |
| Token source | GitHub App tokens, Forgejo and GitLab tokens held by the worker | OIDC-minted per-role App tokens, no stored secret | GitHub App token tiers |
| Egress | Default-deny NetworkPolicy per pod; registry allowlist proxy (ADR-0037) | Deny by default, per host and per binary at layer 7 | Only GitHub traffic inspected |
| Triage | Premise check (opt-in per Team) | Triage agent; only bugs, docs, performance auto-promote | Stage engine |
| Review | Reading Roles; ready only when forge CI passed (ADR-0119) | Review agent; approved red pull requests | Review swarm |
| Merge | A person always merges | A person merges; auto-merge experimental | A person below L6 |
| Agent output checks | Drop box parsed by the worker | JSON-schema validation loop before the post-script acts | — |
| Agent tests | Harness canary in `pkg/harness/harnesstest` | Recorded runs replayed as a required check | — |
| People's surface | Unfold: Now, Work Item page, Run cards, MCP | **None**; forge labels and comments | Dashboard |
| Tenancy | Tenant above Teams decided (root ADR-0017), not enforced | Per repository; per-org mode removed | One organisation per hive |

The row only Unfold fills is the **people's surface**: Fullsend has no place to follow work, spend or decisions outside the forge.

## 3. Component by component

- **Ploeg worker and harness launch — same shape, different host.** Fullsend's pre-script / sandbox / runtime / post-script with placeholders and a host-side push is the pattern of ADR-0034 and ADR-0138, run on a CI runner instead of a pod. Nothing in it could run under Ploeg: it is invoked by the forge's CI, not by a dispatcher.
- **Ploeg shift engine — not claimed.** Fullsend has no queue, lease, budget pool or Team. Each repository is its own island.
- **Ploeg harness adapters — orthogonal.** Fullsend's `runtime.Runtime` (`internal/runtime/runtime.go:169`) drives Claude Code, pi, Codex and OpenCode. Ploeg drives Claude Code, OpenCode, Goose, Qwen Code and OpenHands. Neither drives the other's pi or Goose.
- **Unfold — not claimed.** No dashboard, no Work Item page, no MCP server of its own.
- **Self-improvement — same bet.** Fullsend's agents wrote 65 % of its merged pull requests in the last 90 days, through its own review agent and a person's merge. Unfold's [self-improvement design](../../apps/unfold/docs/design/self-improvement.md) is proposed.

## 4. Where it competes and where it does not

**It competes** for a GitHub or GitLab organisation that already trusts its CI and wants agents on its issues without running a service. Fullsend's answer to "where does the agent run" is "in your runners, under your forge identity". Nothing has to be hosted beyond an optional token mint. That is lighter than Ploeg for one repository.

**It does not compete** for the customer Unfold is for ([who Unfold is for](../concepts/who-unfold-is-for.md)): an agency running many client repositories on Forgejo or GitLab, needing one queue, one budget per client and one place to follow the work. Fullsend has no Forgejo, no budget, no queue across repositories and no surface outside the forge.

**The tension:** running in the customer's CI is a real alternative to Ploeg's own cluster. If an agency's clients want agents to run inside their own infrastructure, Ploeg's per-Run pod is the harder sell. The isolation-cell work (Ploeg ADR-0143, "a person's machine is a personal cell") is the closest Ploeg answer.

## 5. Design worth mining

None of these needs a Fullsend dependency.

1. **Recorded runs replayed as a required check.** A `dummy-playback` runtime replays canned agent output, so the whole pipeline is tested on every change without model spend. Ploeg's harness canary is narrower.
2. **Schema-checked agent output before anything acts on it.** A validation loop sends the agent back when its result file fails a JSON schema, before the post-script pushes or comments.
3. **Per-binary egress at layer 7.** Provider profiles open a host only for a named binary inside the sandbox. Ploeg's NetworkPolicy (ADR-0137) and registry proxy (ADR-0037) work per pod and per host.
4. **Triage that only auto-promotes low-risk kinds.** Bugs, docs and performance issues go straight to work; features wait for a person. Ploeg's premise check could carry the same rule per Team.

Not worth mining: per-repository installation with no queue across repositories; cost read from the runtime's own report; slash commands as the main human interface; the Vertex-only default.

## 6. Recommendations

1. Record Fullsend in the competitor ledger with Forgejo marked as not built, and correct the Hive record (this change).
2. Do not adopt Fullsend or build on its workflows.
3. Put items 1 and 2 of section 5 to the owner as Ploeg tickets: both cut test spend or wrong pushes without changing the architecture.
4. When positioning against Fullsend, lead with the people's surface and the budget, not with security: on credential isolation the two are close.

## 7. Re-evaluation triggers

Any one of these reopens this record:

1. `internal/forge/` gains a Forgejo or Gitea client, or `DetectForge` accepts a Forgejo host.
2. Fullsend adds a cap that is checked before a run starts ([#6588](https://github.com/fullsend-ai/fullsend/issues/6588) lands).
3. Fullsend ships a dashboard or an operator API across repositories, or the centrally managed execution service left open in its ADR 0123.
4. A named adopter outside Red Hat and its projects runs Fullsend on GitLab or Forgejo.
5. Fullsend reaches 1.0 or joins a foundation.

## 8. Limits

- Adoption counts come from GitHub code search, which is incomplete; 145 repositories is a lower bound. GitLab and Forgejo instances were not searched beyond public issues.
- No Fullsend code was run; enforcement claims come from reading code and documentation.
- The seam map was read against the 0.2.0-rc.64 bundle; the Ploeg ADRs cited here were checked against the pinned rc.83.
