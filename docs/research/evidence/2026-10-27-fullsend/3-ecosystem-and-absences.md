# Fullsend: ecosystem and absence checks (gathered 2026-10-27)

Sources: web search/fetch, the GitHub REST/search API via `gh` (counts as of 2026-10-27), and a read-only clone of fullsend-ai/fullsend at d1f52c159 (HEAD commit dated 2026-10-27, merge of PR #8659). Paths below are relative to that clone.

## Part 1: Ecosystem

### Who is behind it
- **Red Hat engineers, no named company or foundation.** The first commit is `9578dbb9d` on 2026-03-06 by Ralph Bean <rbean@redhat.com>: "Initial design exploration for fully agentic konflux-ci development". Top human committers (`git shortlog -sne`) all use @redhat.com addresses or are Red Hat people: Ralph Bean (1363), Wayne Sun (1307 + 484), Barak Korren (988), Greg Allen (391 + 468), Hector Martinez (192 + 493), Dharit Shah (229), Adam Scerra (211), Marta Anon (108), Shai Revivo, Ben Alkov, Benjamin Kapner. The bots `fullsend-fix`/`fullsend-code` (fullsend-ai-coder[bot]) have about 2,000 commits. Renovate (`renovate-fullsend[bot]`) has 271.
- Ralph Bean's Red Hat author page says he is "now leading development of the fullsend agentic SDLC framework" and sits on the Konflux Governance Committee: https://www.redhat.com/en/authors/ralph-bean (as described by the search engine; not fetched directly).
- The origin is **Konflux** (Red Hat's Tekton-based software factory). The applied docs name konflux-ci as the "original proving ground" (`docs/problems/applied/`).
- fullsend.sh names **no company, sponsor or funding**. It says Apache-2.0 and links the GitHub org and NVIDIA OpenShell: https://fullsend.sh (fetched 2026-10-27). The GitHub org fullsend-ai has no name, location or email (`gh api orgs/fullsend-ai`, org created 2026-03-26).
- **Foundation: none found.** The only "CNCF / Linux Foundation" hit in the repo is a SAFE-MCP description in `docs/landscape.md:528`. I found no CNCF Sandbox, LF or Commonhaus application.
- Governance is a contributor ladder (Vouched → Triage → Write → Maintainer) with the `@fullsend-ai/core` team as CODEOWNERS: `MAINTAINERS.md`, `LADDER.md`.

### Dated timeline
| Date | Event | Evidence |
|---|---|---|
| 2026-03-06 | First commit, a Konflux-focused design exploration | `git log --reverse` (9578dbb9d) |
| 2026-03-09 | GitHub repo fullsend-ai/fullsend created | `gh api repos/fullsend-ai/fullsend` → created_at |
| 2026-03-26 | fullsend-ai org created; ADR 0003 "org-level config lives in `<org>/.fullsend` repo" | `gh api orgs/fullsend-ai`; commit 6fc9eaddd |
| 2026-04-02 | `forge.Client` interface and fake added (the Forgejo intent starts here) | commit a29551c8c |
| 2026-04-23 | konflux-ci/.fullsend created (first external org config) | `gh search repos` |
| 2026-05-19 | Earliest bot PR outside the fullsend-ai org: https://github.com/konflux-ci/architecture/pull/358 | GitHub search API |
| 2026-07-20 | GitLab forge client implemented | commit 3f90818f7 |
| 2026-07-21 | Scott McCarty (fatherlinux) opens a competitive review in crunchtools/mcp-ashigaru #48 | https://github.com/crunchtools/mcp-ashigaru/issues/48 |
| 2026-07-28 | Jira poll input driver | commit 58d593d28 |
| 2026-08-10 / 08-21 | OpenCode and pi registered as stub runtimes | commits 4d647c7f4, a79365358 |
| 2026-10-23 | v0.50.0 released (98 releases including rcs) | https://github.com/fullsend-ai/fullsend/releases |
| 2026-10-27 | 164 stars, 126 forks, 2,050 open issues+PRs (1,905 open issues) | `gh api repos/fullsend-ai/fullsend` |

- **Blog posts and talks: none found.** fullsend.sh links neither (fetched 2026-10-27). A search for a DevConf, Flock or YouTube talk by Bean, Allen or Korren returned nothing. Red Hat's agentic-SDLC post (Steven Huels, 2026-07-27, https://www.redhat.com/en/blog/building-future-core-concepts-red-hats-agentic-software-development-life-cycle) **does not mention fullsend** (fetched and checked).
- **HN / Reddit / Lobsters / X: no threads found.** The HN Algolia search for "fullsend" returns 9 stories and none is this project (https://hn.algolia.com/api/v1/search?query=fullsend&tags=story). Web searches for Reddit, Lobsters, X and LinkedIn returned only the unrelated marketing product.
- The Konflux community roll-ups (Oct and Nov 2025, before the project existed) contain no fullsend mention: https://groups.google.com/g/konflux/c/2dVMo5LWGyM.
- The website calls itself "The autonomous development lifecycle (ADLC) platform" with the tagline "Ship code on autopilot". It lists **GitHub and GitLab only** as supported forges, not Forgejo (https://fullsend.sh, fetched 2026-10-27). The README still says "(GitHub, GitLab, Forgejo)" (`README.md:3`). The repo description is "On the path to fully autonomous agentic engineering".

### Name collisions to keep apart
- **Fullsend (fullsendhq.com)**: an AI content-marketing platform for small businesses. Product Hunt launch 2025-08-05: https://www.producthunt.com/products/fullsend. HN post 2025-06-16: https://www.fullsendhq.com. Listed on GetApp: https://www.getapp.co.nz/alternatives/2081585/fullsend.
- **nembal/FULLSEND**: a GitHub repo created 2026-01-31 with no description. Search snippets call it a "GTM agent": https://github.com/nembal/fullsend.
- **"Full Send"**: the Nelk Boys podcast and brand (HN item 30647012) and the general slang ("send it").
- Lookalike orgs **fullsand-ai / fullsand / botsend / fullsend-playground / ascerra-fullsend-lab / ascerra-fullsend-rehearsal** are fullsend's own test fixtures. For example, fullsand-ai/fullsend is described as "mint access-pattern test fixture". These are not adopters.
- jgoetzmann/fullsend, NY0E/fullsend, gugunyathi/fullsend and others are unrelated or personal repos.

### Positioning vs adjacent products (what Fullsend says)
The main source is `docs/landscape.md` (412 lines, last changed 2026-10-24), also on https://fullsend.sh/docs.
- **Its claimed niche** (`docs/landscape.md` "What nobody is doing"): "Formal intent verification … Zero-trust inter-agent review … Autonomous merge with security-focused confidence — the judgment problem of 'should this change exist?' … Intent-authorization-tier-based autonomy … Agent governance … Contribution volume management. These gaps define the novel problem space for fullsend."
- **GitHub Copilot** (`docs/landscape.md:80-84`): "Very relevant to fullsend: has code review and also supports having background agents steered interactively." Nothing more.
- **gh-aw** (`docs/landscape.md:502-521`, and a whole self-critique doc `docs/problems/platform-nativeness.md`): "Its native position within GitHub eliminates entire categories of problems that fullsend must solve externally … Its credential isolation via the substrate layer achieves the same security goal as fullsend's host-side L7 REST proxy design (ADR 0017) with substantially less complexity." It also says gh-aw controls "what the agent can see and touch, not whether the agent's output should be merged without human review". The differentiator it claims over gh-aw is forge portability: "gh-aw is GitHub-only by definition" (`docs/problems/platform-nativeness.md:145`).
- **OpenHands** (`docs/landscape.md:191-212`): it "does not address the problems fullsend considers hard: review decomposition, governance, trust boundaries, and prompt injection defense". The Docker sandbox "does not implement credential isolation, egress filtering". It also notes OpenHands' ACP support.
- **GitLab**: only the "GitLab AI Merge Agent" (Nov 2025) is covered. It is described as solving "the *mechanical* merge problem … but not the *judgment* problem" (`docs/landscape.md:86-92`). **GitLab Duo Agent Platform is not named** (grep "duo": 0 hits in docs).
- **OpenAI Codex**: only as the `@codex review` PR reviewer (`docs/landscape.md` "Others"). **Codex cloud is not positioned.**
- **Also covered**: Symphony, Gas Town, Goosetown, Stripe Minions, Kiro Crew, Cursor Origin, Vibe Kanban, Ambient Code Platform, k8s SIG agent-sandbox, Agent Gateway, Collo.dev, CodeRabbit, Greptile, Graphite, Qodo, Sourcery, OpenClaw.
- **Absent from Fullsend's landscape (0 hits in the clone)**: Hive (hivecommons/hive), Devin, Factory, Jules, Kandev, Paperclip, GitLab Duo Agent Platform.
- **The reverse comparison exists.** Hive's landscape calls Fullsend "the closest open-source comparison" and says: "Fullsend is lighter for one repo or org where Actions is already trusted. Hive fits when operators need live fleet visibility, many runtimes, graduated autonomy …" (hivecommons/hive `src/docs/landscape.md`, read via the GitHub API on 2026-10-27; also https://github.com/hivecommons/docs `docs/content/hive/landscape.md`).

### Adoption: shipped vs claimed
**Shipped (verifiable on GitHub, 2026-10-27):**
- **Bot PR volume.** PRs by `app/fullsend-ai-coder` outside the fullsend-ai org: **2,043 total, 775 merged**. Inside fullsend-ai/fullsend: 1,353 total, 1,084 merged.
- **Per external org** (total / merged):

| Org | Total PRs | Merged PRs |
|---|---|---|
| konflux-ci | 396 | 211 |
| redhat-developer | 493 | 204 |
| quay | 140 | 34 |
| openkaiden | 88 | 56 |
| conforma | 48 | 19 |

  Other orgs with a few PRs each: RedHatInsights, packit, redhat-et, redhat-community-ai-tools, aufi/crane-fullsend-pilot. Sample of the top recent 100 repos by count: redhat-developer/rhdh-plugin-export-overlays 26, quay/quay 13, konflux-ci/konflux-ui 9.
- **Org config repos (`<org>/.fullsend`)**, with last push dates:

| Repo | Last push |
|---|---|
| konflux-ci/.fullsend | 2026-09-23 |
| conforma/.fullsend | 2026-10-08 |
| redhat-appstudio/.fullsend | 2026-09-22 |
| quay/.fullsend | 2026-10-02 |
| agnistack-org/.fullsend | 2026-07-09 |
| openkaiden-fullsend/.fullsend | 2026-05-04 |

  There is also redhat-developer/rhdh-fullsend, "Custom fullsend sandbox images for RHDH agent infrastructure" (last push 2026-10-20). The org-level `config.yaml` in konflux-ci, conforma and redhat-appstudio lists many repos with `enabled: false`. Fullsend deprecated per-org install in favour of per-repo `.fullsend/` (Hive landscape; `docs/archived-roadmaps/2026-07.md:126`), so the actual enrolment now sits in per-repo folders.
- **Per-repo `.fullsend/config.yaml`** found by code search in: crc-org/crc, podman-desktop/podman-desktop (also has `.github/workflows/fullsend.yaml`), quay/quay, redhat-developer/rhdh.
- **Every named adopter is Red Hat or Red Hat-adjacent**: Konflux, Quay, RHDH, Conforma, Podman Desktop, CRC, Packit, Kaiden. I found **no non-Red Hat organisation**.
- **GitLab**: there is evidence of a self-hosted GitLab EE user (closed issues #7892 "poll state CAS broken on self-hosted GitLab EE", #7965). I could not identify any public GitLab adopter.
- **Forgejo, Codeberg or any Gitea instance: no adopter found, and no implementation exists** (see Part 2).

**Claimed, not verified:** `docs/archived-roadmaps/2026-07.md` says "Multiple teams are actively using or evaluating fullsend: OpenShell, Ansible, TektonCD, and potential enterprise partnerships." I did not verify OpenShell, Ansible or TektonCD enrolment.

### Strongest critiques
External critiques are scarce. I found one.
1. **Runtime and inference lock-in (external).** Scott McCarty (fatherlinux, Red Hat) closed his review on 2026-10-10: Fullsend's design fits, but "its Claude runtime only runs on Vertex AI, and the requirement here is the Claude subscription". He adopted the design and label vocabulary on claude-code-action instead (https://github.com/crunchtools/mcp-ashigaru/issues/48). The repo confirms that Vertex is the default: "By default all inference goes to Anthropic models on Vertex AI, on the fleet's WIF credentials" (`docs/runtimes/claude.md:26`). A gateway route was added later (ADR 0137, `docs/runtimes/claude.md:91-104`).
2. **The review agent approved broken PRs (Fullsend's own evidence issues).** Review verdicts flipped to APPROVED / ready-for-merge "on unfixed go.sum with failing tests" (#3272 → #3005, build-service PR #596). PR #596 accumulated 28+ agent runs (#4347). Retro was dispatched on autoclosed bot PRs (#4343). #3005 "Review agent should not flip from findings to LGTM without code changes" is still OPEN (opened 2026-07-04). This cuts directly against the "autonomous merge with security-focused confidence" pitch.
3. **Self-admitted platform-nativeness problem.** Fullsend's own docs say gh-aw achieves equivalent credential isolation "with substantially less complexity" and removes whole categories of Fullsend work (`docs/landscape.md:514`; `docs/problems/platform-nativeness.md`). Forge portability is the main counter-argument, and only GitHub and GitLab are implemented.
4. **Volume and noise.** There are 1,905 open issues, about 9,300 commits in 7.5 months (about 2,000 by bots), 98 releases and 123 ADRs. The pace is high and so is the churn; ADRs get superseded (per-org install removed). Releases come roughly every few days, from v0.x up to v0.50.0. There is no 1.0 and no stability promise.
5. **Thin public footprint and single-vendor concentration.** I found no HN, Reddit, Lobsters or talk presence and no foundation. All contributors and adopters are Red Hat. The project's bus factor equals one company's internal priority.
6. **Marketing vs reality on Forgejo.** The README and repo docs advertise Forgejo, but no Forgejo client exists, and fullsend.sh itself lists only GitHub and GitLab (see Part 2).

## Part 2: Absence checks against our stack

Grep scope: the whole clone excluding `.git` and node_modules. Hits in `internal/sentencetoken/english.json` (a word-frequency list) are ignored.

| Component | Verdict | Evidence |
|---|---|---|
| **Forgejo** | **Mentioned / planned, NOT supported** | `README.md:3` claims it. `internal/forge/` has only `github/`, `gitlab/`, `jira/` implementations, no forgejo. `internal/forge/forge.go:808`: "Implementations exist for GitHub (and eventually GitLab, Forgejo)". `docs/guides/dev/behaviour-drivers.md:32`: `BEHAVIOUR_SCM=github # also: gitlab; future: forgejo`. ADR 0005 says it "must eventually support … Forgejo". ADR 0007: Forgejo "will need equivalent per-role identity mechanisms when their forge implementations are built". There is a JSON schema mapping for Forgejo states (`docs/normative/entity-context-snapshot/v1/README.md:93-335`) and one fake-client test row (`internal/cli/run_test.go:9591`). There is **no Forgejo Actions scaffold, no webhook handler and no self-hosted-instance support** (no Forgejo issue in the tracker requests it). fullsend.sh lists GitHub and GitLab only. |
| Gitea | Absent | One test URL `gitea.example.com` in `internal/forge/url_test.go:285` |
| Codeberg | Absent | Only Go module deps in `go.sum` (codeberg.org/go-fonts etc.) |
| GitLab | **Supported** | `internal/forge/gitlab/` (since 2026-07-20), `internal/scaffold/fullsend-repo-gitlab/`, webhook + cron poller, self-hosted GitLab EE issues #7892/#7965, `--gitlab-url` (#6684), 558 files mention it |
| Vikunja | Absent | 0 hits |
| ClickUp | Absent | 0 hits |
| Linear | Mentioned only | As Symphony's tracker (`docs/landscape.md:287`). No integration. |
| Jira | **Supported** (intake) | `internal/forge/jira/`, Jira poll input driver (2026-07-28), OAuth 2.0 client credentials (2026-07-30) |
| LiteLLM | Mentioned as a compatible gateway | `docs/ADRs/0137-inference-gateway-credential-route.md:33`, `internal/runtime/pi.go:61`, `docs/runtimes/codex.md:78` ("Praxis, LiteLLM, agentgateway …"). This is a generic OpenAI/Anthropic-compatible gateway route, not a LiteLLM-specific integration. |
| KEDA | Absent | 0 hits |
| Kubernetes | Mentioned; not the execution plane | Runs as GitHub Actions / GitLab CI jobs. GitLab runner VM uses a Podman custom executor "instead of Docker/Kubernetes" (`hack/gitlab-runner-vm/README.md:49`). "Kubernetes and OpenShift execution" appears in the 2026-06 roadmap. OpenShift runner provisioning issue #8148 is closed. |
| Kata Containers | Mentioned only | `docs/problems/agent-infrastructure.md:108` ("deferred to complementary mechanisms such as Kata Containers"), `docs/problems/security-threat-model.md:401` |
| gVisor | Absent | 0 hits |
| Firecracker | Mentioned only | Re: Cursor Cloud Agents (`docs/landscape.md:403`) |
| kubernetes-sigs/agent-sandbox | Evaluated, judged a poor fit | `docs/landscape.md:464-470` ("For task-scoped automation, the CR-centric lifecycle is a poor fit"), `docs/problems/agent-infrastructure.md:103,130`. Fullsend's own sandbox image is `ghcr.io/fullsend-ai/agent-sandbox` (ADR 0036) on **NVIDIA OpenShell** (204 files). |
| Talos | Absent | 0 hits |
| OpenBao / Vault | Absent | 0 hits for openbao or HashiCorp Vault. Only an `mcp__vault__` test fixture string. Secrets go through GitHub stored secrets ("interim until external secret manager support", `docs/architecture.md:137`, ADR 0136). |
| Authentik | Absent | 0 hits |
| OIDC (generic) | Supported (CI OIDC) | GitHub Actions / GitLab `id_token` OIDC → GCP WIF and token minting (`internal/scaffold/fullsend-repo-gitlab/.gitlab/ci/scripts/run-agent-job.sh:72-100`). Gateway checks CI OIDC (ADR 0137). No IdP integration (Authentik/Keycloak) for people. |
| OpenCode | **Supported runtime** (later addition) | `docs/runtimes/opencode.md`, `internal/runtime/opencode.go`. Stub on 2026-08-10, now selectable: `--runtime` "claude, pi, codex or opencode" (`internal/cli/github.go:175`) |
| Goose | Mentioned only | Goosetown entry (`docs/landscape.md:327-350`). No runtime. |
| OpenHands | Mentioned (competitor) | `docs/landscape.md:191-212` |
| Qwen | Mentioned as a gateway thinking-format | `internal/config/inference_gateway.go:434` (`"qwen", "qwen-chat-template"`). No Qwen-specific runtime or default. |
| Claude Code | **Supported, default runtime** | `docs/runtimes/claude.md`, `internal/runtime/claude*.go`. Default inference is Vertex AI (`docs/runtimes/claude.md:26`). |
| Codex | **Supported runtime** | `docs/runtimes/codex.md`, `internal/runtime/codex*.go` |
| pi | **Supported runtime** | `docs/runtimes/pi.md`, `internal/runtime/pi.go:9` ("earendil-works/pi, CLI `pi`"), pkg `@earendil-works/pi-coding-agent`. Org repos `pi-xai-vertex`, `pi-anthropic-vertex`, `pi-inference-gateway`. |
| MCP | Used inside harnesses; considered for credential isolation | Plugins may bundle `.mcp.json` / MCP server binaries (`internal/resolve/resolve.go:391,864`, `internal/cli/bootstrap_scan.go:42`). ADR 0017 Option 4 (MCP server as credential broker) weighed against an L7 proxy. SAFE-MCP threat taxonomy in landscape. Fullsend ships **no MCP server of its own** (none found). |
| ACP (Agent Client Protocol) | Absent as a feature | Mentioned only as OpenHands' ACP support (`docs/landscape.md:210`). "ACP" otherwise means Ambient Code Platform (`docs/landscape.md:454`). |
| AHP (Agent Host Protocol) | Absent | 0 relevant hits |
| OpenTelemetry | **Supported** | OTLP trace export; `OTEL_EXPORTER_OTLP_*` threaded through workflows (`internal/scaffold/workflow_call_alignment_test.go:347-581`); ADR 0050 distributed tracing; MLflow as a documented backend (`docs/guides/user/tracing-with-mlflow.md`, `docs/guides/user/how-to-emit-traces.md`) |
| Omnigraph | Absent | 0 hits |
| Renovate | Used by the project; Renovate PRs appear as agent inputs | `renovate.json`, `renovate-fullsend[bot]` (271 commits). Sandbox version pins are Renovate-tracked (`internal/sandbox/sandbox_pi_image_test.go:42-48`). Issues #4348/#4343 show agents acting on Renovate/bot PRs. |
| Unfold (our product) | Absent | Only the English word ("unfolded") in `internal/cli/content_collector.go:196`, `docs/landscape.md:578` |
| Ploeg (ploeg-hq/ploeg) | Absent | 0 hits |

**Summary for our stack.** Fullsend overlaps on GitLab, Jira, Claude Code / Codex / OpenCode / pi runtimes, OpenTelemetry, OIDC-to-cloud and gateway-routed inference. Everything that defines our setup is absent: Forgejo (advertised but unimplemented), Vikunja, ClickUp, KEDA, Talos, gVisor, Kata (mentioned only), OpenBao, Authentik, Omnigraph, ACP, AHP, Goose and Qwen as runtimes, Unfold and Ploeg. Its execution plane is CI jobs (GitHub Actions / GitLab CI) plus NVIDIA OpenShell, not a Kubernetes controller.
