# Hive (Hive Commons): ecosystem and absence checks

Collected 2026-10-27. CLONE = a read-only clone of hivecommons/hive at 3f307bb (full history, not shallow: 10,633 commits, HEAD 3f307bb 2026-10-27). GitHub counts come from the GitHub REST/search API, read 2026-10-27 at about 20:50 UTC. Search totals are approximate.

## Part 1: Ecosystem

### Timeline
| Date | Event | Evidence |
|---|---|---|
| 2026-02-19 | Spektacular repo created. Primary author Nic Jackson: 226 of ~243 commits; clubanderson 11. Now at hivecommons/spektacular, releases 0.27.0 (2026-10-08), 0.28.0 (10-13), 0.29.0 (10-26). Its README does not mention Hive. | `gh api repos/hivecommons/spektacular`, contributors, releases; https://github.com/hivecommons/spektacular |
| 2026-04-10 / 04-27 | arXiv 2604.09388 "The AI Codebase Maturity Model" (ACMM), single author Andy (Andrew) Anderson, IBM Research, v1 and v2. Hive is the "reference implementation" of Level 6. It is a single-project experience report on KubeStellar Console. | https://arxiv.org/abs/2604.09388 |
| 2026-04-17 | First commit "initial commit: supervised-agent runtime" by Andrew Anderson, repo created as kubestellar/hive | CLONE `git log --reverse`; repo created_at 2026-04-17T15:00:19Z |
| 2026-05-04 → 09-09 | Medium posts on kubestellar.medium.com, e.g. "Intentional Amnesia: Why I Wipe My AI Agents' Memories Every 15 Minutes" (~05-04; on HN 2026-05-19, 1 point), "Hive Hub and Spoke" (~06-08), "Terminal as Interface" (~07-21) | https://kubestellar.medium.com/feed ; https://news.ycombinator.com/item?id=48197264 |
| 2026-05-14 | CNCF blog by Anderson, "When AI agents become contributors: How KubeStellar reached 81% PR acceptance". It covers Console, not Hive itself; the figures are self-reported. | https://www.cncf.io/blog/2026/05/14/when-ai-agents-become-contributors-how-kubestellar-reached-81-pr-acceptance/ |
| 2026-08-10 | First dated CHANGELOG section | CLONE CHANGELOG.md:6799 |
| 2026-09-01 | hivecommons GitHub org created (location "United States of America"). v4.0.1/v4.0.2 released | `gh api orgs/hivecommons`; CHANGELOG.md:6373-6384 |
| 2026-09-02 | kubestellar/kubestellar#3986 proposes spinning Hive out to Hive Commons. Part of the motive was the "naming collision with Apache Hive that would block any CNCF trademark transfer". Filed and closed the same day. | https://github.com/kubestellar/kubestellar/issues/3986 |
| 2026-09-02 | CNCF Sandbox application cncf/sandbox#516 filed by clubanderson. An automated Copilot pre-review flagged the repo as under 6 months old ("Postponed"). | https://github.com/cncf/sandbox/issues/516 |
| 2026-09-03 | Repo transferred kubestellar/hive → hivecommons/hive | #516 comment 2026-09-03 |
| 2026-09-15 | Signatory correction on #516: "the contributing entity is **IBM** (as was the case for KubeStellar)". Anderson stays Chief Maintainer. | #516 comment 2026-09-15T20:07 |
| 2026-09-22 | Substack launch: "Hive at v5: The Swarm Grew Up…", "Hive Hub and Spoke…", "Sage Collar…". Posted to HN by jcastro (Jorge Castro): 1 point, 0 comments. | https://hivecommons.substack.com/p/hive-at-v5-the-swarm-grew-up-and ; https://news.ycombinator.com/item?id=49807950 |
| 2026-09-22 → 09-28 | TOC gitvote. Passed 2026-09-28 with 72.73% in favour, 0 against. | #516 git-vote[bot] comments |
| 2026-09-29 | CNCF lists Hive Commons as accepted at Sandbox level | https://www.cncf.io/projects/hive-commons/ ; landscape PR https://github.com/cncf/landscape/pull/5181 |
| 2026-10-01 → 10-26 | Onboarding: hivecommons/cncf-sandbox-onboarding (created 10-01, 30/36 items per the 10-26 comment); DevStats instance 10-06. As of 10-26 the contributor agreement is still with LF legal (7 subproject names; "crux" split out as the engine). Label `contribution-agreement/unsigned`. | #516 comments 10-06, 10-26 |
| 2026-10-05, 10-21 | Substack posts "IDLC: The Idea Development Lifecycle", "Trust in AI is a governance problem…" | https://hivecommons.substack.com/api/v1/archive |
| 2026-10-18 | v5.186.4. v4.0.0 shipped 2026-09-01, so that is ~190+ release tags in 7 weeks. | CLONE CHANGELOG.md:14 |
| 2026-10-22 | hivecommons/crux created (agent runtime extracted) | `gh api orgs/hivecommons/repos` |
| 2026-10-27 | PR/issue numbers reach #14,700 | `gh api repos/hivecommons/hive/pulls?state=closed` |

Talks: Sessionize lists 18 sessions by Andy Anderson (IBM Research, Stamford CT). Hive-relevant ones are "Your Codebase Is the AI Model: A Maturity Framework for Autonomous Development" and "Lessons from CNCF KubeStellar's Agentic Workflow Experiments". Event names and dates are not shown on the page. https://sessionize.com/andy-anderson/
Third-party coverage: The New Stack wrote about ACMM (https://thenewstack.io/ai-codebase-maturity-model/). bex.co (2026-09-24) covers `kubestellar/hive` as "a single Go binary that orchestrates fleets of AI coding agents" (https://bex.co/blog/2026/09/24/kubestellar-multi-cluster-agent-placement). Aggregator rewrites of the CNCF blog (pulse.bot, stack-archive.com, devbytes.co.in) add nothing new.
**Absent:** no HN discussion with comments (Algolia: "hivecommons" returns 1 Hive story, 0 comments; URL search for hive.hivecommons.dev / github.com/hivecommons returns 0). No Lobsters or Reddit thread found by web search. X and LinkedIn were not indexed beyond Anderson's profile (https://www.linkedin.com/in/clubanderson/). A search summary reported a LinkedIn post claiming CNCF Sandbox acceptance; I did not verify it directly.

### Who is behind it
- No company. "Hive Commons" is a GitHub org and community brand. The hivecommons.dev footer reads "The Linux Foundation / The Hive Commons authors" and names no people, company or location (https://hivecommons.dev/, fetched 2026-10-27).
- Effectively an IBM-led project. The legal contributing entity is IBM (#516, 2026-09-15). Chief Maintainer is Andy Anderson (GitHub clubanderson; IBM Research, Hybrid Cloud and AI Platform; profile location Carmel, NY; Sessionize says Stamford, CT).
- Maintainers (CLONE OWNERS, GOVERNANCE.md): clubanderson (Andy Anderson, IBM), hanthor (James Reilly, Universal Blue), Danathar (Doug Baggett, independent), nicholasjackson (Nic Jackson, IBM; Spektacular author), kellyaa (Kelly Abuelsaad, IBM). That is 3 of 5 at IBM. The kubestellar spin-out proposal listed 3 maintainers; the site still says "three-member Maintainer Committee spanning three organizations".
- Partner: "Jev by TypeSafe AI" is listed as a partner integration (CHANGELOG.md:3048; src/crux/jev/skill/SKILL.md).

### Sponsors: in-kind only, no cash funding found
The landing page section is headed "Thanks to the organizations that power Hive Commons". It never says "funding" (https://hive.hivecommons.dev/, https://hivecommons.dev/):
| Listed | Wording on page | What it actually is (evidence) |
|---|---|---|
| Akamai (Linode) | "Kubernetes infrastructure donated through the CNCF" | CNCF credits program. Akamai gives $1M/yr in credits through CNCF ServiceDesk to projects at every maturity level (https://www.cncf.io/blog/2025/11/05/akamai-builds-cloud-native-resilience-cloud-credits-to-power-cncf-projects/). Hive runs its CI runners on a Linode LKE cluster `hive-ci` (CLONE CHANGELOG.md:2354). |
| Oracle Cloud (OKE) | "Kubernetes infrastructure donated through the CNCF" | Oracle pledged $3M/yr of OCI credits to CNCF in 2023 (https://www.oracle.com/cloud/technical-case-studies/cncf/). The hub runs on OKE (`hive-oke` context: CLONE src/docs/operator-reference.md:63, docs/HUB_DISASTER_RECOVERY.md:51). |
| GitHub Copilot | "AI inference donated to CNCF projects through the CNCF" | CNCF maintainer Copilot Enterprise seats: a pilot from Dec 2025 for maintainers listed on maintainers.cncf.io (https://contribute.cncf.io/blog/2025/12/16/github-copilot-enterprise-for-maintainers/, https://contribute.cncf.io/blog/2026/03/17/sunsetting-github-copilot-business). |
| Cloudflare | "DNS, edge and tunnels" | No sponsorship program evidence found. Could be a free plan or a paid one. Unverified. |
| Bluehost | "domain hosting" | No evidence of sponsorship. Unverified. |
CHANGELOG.md:3386 and :3366 call these "donated infrastructure" thanks. Because the CNCF credits require CNCF project status, the KubeStellar umbrella is the plausible source of the credits before 2026-09-29 (inference).

### Name collisions (keep apart)
- **Apache Hive**: SQL data warehouse on Hadoop (https://hive.apache.org). This collision is why the project is named "Hive Commons" (kubestellar#3986).
- **OpenShift Hive** (github.com/openshift/hive): Kubernetes operator that provisions OpenShift clusters. Same Kubernetes/CNCF space.
- **Hive AI / Hive Moderation** (https://thehive.ai): content-moderation and AI-detection company, San Francisco (https://en.wikipedia.org/wiki/Hive_(artificial_intelligence_company)).
- **Hive blockchain / hive.blog** (https://hive.io): 2020 fork of Steem.
- **TheHive** (StrangeBee, github.com/TheHive-Project/TheHive): security incident response platform.
- **Hive (Dart/Flutter)** key-value database (pub.dev/packages/hive).
- **aden-hive/hive** (https://github.com/aden-hive/hive): Python multi-agent "Queen + workers" harness, ~10.6k stars per directory listings. This is the closest naming clash in AI agents.
- **colonyops/hive** (https://pkg.go.dev/github.com/colonyops/hive): Go tool for isolated git sessions for parallel AI agents.
- Others: @bundy-lmw/hive-core (npm, multi-agent), github.com/thehiveagent, hyperhive (git.berlin.ccc.de/vinzenz/hyperhive), HIVE Digital (crypto miner).
- Old identifiers for this project: `kubestellar/hive`, hive.kubestellar.io, the `kubestellar-hive[bot]` app, scanner@hive.kubestellar.io (CLONE git trailers). The domain is retired per PR #14610.

### Positioning vs adjacent products (Hive's own words)
Source: CLONE src/docs/landscape.md ("Conducted: 2026-10-23"), docs/landscape.md, .github/workflows/weekly-competitor-report.md:265-330 (a gh-aw workflow, added in #14612, that writes a weekly competitor/SWOT report to Discord).
- Self-description: "an operations plane for fleets of AI agents". Agents run long-lived in tmux. A deterministic pipeline runs before the model and merge gates run after it. ACMM L1–L6 autonomy, a MITM proxy on every GitHub write, a hub/spoke registry, and "contributor compute" (the "ClankeR" relay). README: "like a CI system, except the job is an AI coding agent and the gate is an AI review plus your existing CI".
- **Copilot coding agent / GitHub Agent HQ**: "one issue to one hosted agent inside GitHub". Agent HQ is classed as an orchestrator competitor, while Copilot CLI is a Hive backend.
- **gh-aw**: "an Actions-native on-ramp, not a fleet scheduler". Hive ships a report-only gh-aw sample. Dispatching gh-aw as a host is "not implemented".
- **OpenAI Symphony**: Hive "borrows the idea of managing work rather than watching every coding turn" but implements neither WORKFLOW.md nor the Codex app-server. Symphony is described as Linear-first (docs/design/symphony-spec-alignment.md).
- **Codex cloud, Jules, Devin single task, OpenHands Cloud single task**: classed as "cloud agent" (hosted, one task at a time). Jules Action is a per-repo orchestrator like gh-aw.
- **Devin teams, Factory, OpenHands Cloud control plane, Gastown, Dagger, Kilo cloud**: "fleet orchestrator", i.e. direct competitors. Devin-class hosted services are described as "vendor-run autonomy over self-hosted control".
- **OpenHands**: also a T3 backend ("legacy CLI", upstream unmaintained, CHANGELOG.md:715).
- **Sweep**: only named in the competitor-report prompt. No analysis in the docs.
- **vibe-kanban**: an integration, not a competitor. Hive can mirror its queue onto a vibe-kanban board through vibe-kanban's MCP server, plus a report-only host adapter `pkg/extwork/vibekanban` (src/docs/integration-guide.md:28).
- **CodeRabbit**: treated as an external review bot whose inline threads Hive agents answer (src/docs/review-bot-threads.md, docs/outreach-antispam.md:95). No positioning against it.
- **Fullsend** (fullsend.sh): named "the closest open-source comparison". It ships GitHub, GitLab and Forgejo; Hive ships GitHub only.
- Also covered: Claude Managed Agents (experimental hosted backend, USD 25/day cap), OpenAI Agents API (planned, #14093), Omnigent (T3), Zeron, NVIDIA OpenShell and AAIF OpenSandbox (sandbox evaluation, ADR-0026 Proposed).

### Adoption: shipped vs claimed
ADOPTERS.md (CLONE) lists 7 entries. Activity was checked through GitHub search (`author:app/<bot>`, `hive in:body`):
| Adopter (tier claimed) | Evidence of Hive activity | Tie to maintainers | Verdict |
|---|---|---|---|
| KubeStellar Console (Production) | 10,302 PRs by `hivecommons-hive[bot]` in org:kubestellar, 9,050 merged. Example: kubestellar/console#24445 | Anderson's own project (IBM) | Shipped, heavy |
| tuna-os (Production) | 9,041 PRs in the org since 2026-08-01; 7,279 items mention "hive" since 06-01. The sampled authors are `hanthor` (James Reilly), so agents push through his account. Evidence issue hivecommons/hive#5773 | Run by maintainer hanthor | Shipped, maintainer-operated |
| Project Bluefin (Production) | 951 PRs by `hivecommons-hive[bot]` in org:projectbluefin; https://docs.projectbluefin.io/factory/ shows Supervisor/Scanner/Reviewer/Architect/Outreach roles, but its metrics panel shows blank ("state unknown") | Universal Blue (hanthor; jcastro posted to HN) | Shipped |
| Frostyard (Pre-production) | 2,412 PRs since 08-01, mostly by `frostyard-machines`; 447 "hive" mentions | bketelsen (Universal Blue circle) | Shipped, modest |
| Danathar (Pre-production) | `danathar-atomic-hive[bot]` PRs; 3,305 "hive" mentions | Maintainer Doug Baggett's own org | Shipped, maintainer-owned |
| Open Horizon (Pre-production) | Only 1 item: a bot "🐝 Hive Advisory Report" issue (https://github.com/open-horizon/open-horizon.github.io/issues/719, 2026-07-29). 0 bot PRs | IBM-origin LF Edge project | Claimed; one advisory issue |
| Open Horizon Services (Pre-production) | Only https://github.com/open-horizon-services/Getting-Started/issues/18 (same report, 2026-07-29). 0 bot PRs | same | Claimed; one advisory issue |
Every adopter is run by, or one hop from, a Hive maintainer (IBM or Universal Blue). No independent third-party adopter was found. The README benchmark covers "11,571 pull requests, 10 repositories, 15,054 AI reviews (oct '26)" (CLONE README.md:14). On 2026-10-27 the landing-page fleet stats (PRs merged, hives online, agents running) showed "—".

### Critiques
Critiques found elsewhere (few):
1. Security finding in the flagship adopter: kubestellar/console#24219 reports that `ai-fix.yml` uses `pull_request_target` without the identity gate, so external PRs could be treated as trusted bot PRs (https://github.com/kubestellar/console/issues/24219; filed by the project's own sec-check).
2. The CNCF automated pre-review on #516 (2026-09-02) flagged "Project too new (repository under 6 months old)". The TOC passed the vote anyway.
3. No independent evaluation of ACMM, the 81% or the 5x/37x claims. Every figure comes from the author's own project. Secondary reviewers note that the level count went from 5 to 6 between versions (https://www.themoonlight.io/review/..., https://codex.danielvaughan.com/2026/04/21/...).
No HN, Lobsters or Reddit criticism threads exist that I could find. That is because there is almost no discussion at all, not because the reception was positive.

My own evidence-based critiques:
1. **Volume beyond human review.** Repo created 2026-04-17; by 2026-10-27 it has #14,700 issues/PRs, ~9,836 PRs (9,179 merged), 10,633 commits, 724 PRs in the week 10-20..10-26 (~100/day), ~190+ releases v4.0.0→v5.186.4 in 7 weeks, 1.39M lines of Go, 1,088 Markdown files, a 6,822-line CHANGELOG, and a single 56,303-line `src/pkg/dashboard/static/index.html`. Commits per month: 439 (Apr) → 3,261 (Sep).
2. **Maintainer concentration and blurred attribution.** clubanderson has 7,355 commits by the contributors API (next human: Danathar 520) and authored 6,466 of ~9,836 PRs. Only ~1,890 PRs are by `hivecommons-hive[bot]`. Over 1,150 commits under Anderson's name carry `Co-authored-by: Copilot`. The README says "agents run as a GitHub App, not your PAT", yet the Outreach agent's own ruleset checks `gh search prs --author clubanderson` (CLONE docs/outreach-antispam.md:18-30). So much agent output is attributed to one human account, and the human/agent split cannot be read from GitHub.
3. **Outreach agent close to spam.** examples/kubestellar/agents/outreach-skills/awesome-lists.md sets "Target: 200 awesome lists and directories" plus HN Show HN, Reddit, Product Hunt and CFPs to promote KubeStellar Console. The anti-spam ruleset was "self-authored" by the Outreach agent (2026-04-24). Example PRs: slavakurilyak/awesome-ai-agents#238 (closed), ivishnuraj/awesome-mcp-servers#2.
4. **Inconsistent status claims.** GOVERNANCE.md says "Hive is a CNCF Sandbox project"; src/docs/integrations.md says "CNCF sandbox onboarding: Planned"; src/docs/cncf-sandbox-onboarding.md says it "makes no claim of CNCF acceptance"; hivecommons.dev says "application is in progress"; CNCF says accepted 2026-09-29 while the CA is still unsigned. landscape.md calls it "an independent CNCF project".
5. **GitHub lock-in despite "work-source agnostic".** Trackers are GitHub Issues/Projects, Linear and Jira. The forge must be GitHub; GitLab/Gitea/Forgejo are "Planned" (#14096). Default isolation is a shared container with Unix-user separation; sandboxing is opt-in (src/docs/landscape.md "Agent isolation").
6. **Adoption is circular**: see the table above.

## Part 2: Absence checks for our stack
Method: `grep -rIi` over CLONE (excluding .git), read context, and web search where useful. A count of N means N files.
| Component | Verdict | Evidence |
|---|---|---|
| Forgejo | **Mentioned: adapter exists, forge "Planned"** | src/docs/integrations.md (Forgejo row "Planned", #14096); src/docs/integrations/forges.md: the shared `gitea` adapter handles reads, comment, label and hold, but "GitHub.com and GitHub Enterprise are the only forges a hive can run against"; nightly forgejo-smoke.yml (#14116); 43 files |
| Gitea | **Mentioned: same adapter, Planned** | forges.md (`project.forge: gitea`, `gitea.gitea_url`); 88 files |
| GitLab | **Mentioned: adapter can merge, still Planned** | integrations.md, forges.md; 117 files |
| Vikunja | **Absent** | 0 hits |
| ClickUp | **Absent** | 0 hits |
| Linear | **Mentioned: supported work source** | integrations.md "Linear: Supported"; src/pkg/worksource; OAuth app token refresh (CHANGELOG.md:5945-5960) |
| Jira | **Mentioned: supported (Cloud and Data Center)** | integrations.md |
| LiteLLM | **Mentioned: supported gateway** | integrations.md ("OpenAI-compatible gateways: vLLM, llm-d, LiteLLM, watsonx, OpenRouter"); Justfile:187 `litellm` mode runs Claude Code against your LiteLLM proxy; T2 `claude`/`litellm` (src/docs/backend-support-tiers.md:24) |
| KEDA | **Absent** | 0 hits with `\bkeda\b` / ScaledObject. The raw substring hits were false positives (e.g. "checKEDAnd"). Scaling is "queue-depth cadence" in its own governor. |
| Kata Containers | **Mentioned only as an optional RuntimeClass name** | docs/development.md:280 `HIVE_K8S_RUNTIME_CLASS` (e.g. `gvisor`, `kata`); src/docs/adr/0026-sandbox-runtime-selection.md:89-90 (kata, Kata-FC) |
| gVisor | **Mentioned: optional RuntimeClass, local fallback** | docs/development.md:280; docs/contribute-distribution-roadmap.md:15 ("back to gVisor when present") |
| kubernetes-sigs agent-sandbox | **Mentioned: prerequisite of a candidate, not integrated** | src/docs/adr/0026-sandbox-runtime-selection.md:72 (the OpenShell option needs the "Agent Sandbox controller and CRDs", https://github.com/kubernetes-sigs/agent-sandbox); ADR Proposed, "No integration exists today" (landscape.md) |
| Talos | **Absent as integration** | Incidental only: src/docs/manual-provisioning.md:192 (local-path "Talos, k3s default"); outreach list entry `siderolabs/awesome-talos` |
| OpenBao / HashiCorp Vault | **Absent** | 0 hits for openbao or hashicorp. "vault" hits refer to a wiki/knowledge "vault" and Claude Managed Agents vaults. Secrets go in `src/.env` / env var names. |
| Authentik | **Absent by name. Generic OIDC exists** | 0 hits for authentik. Hub login: GitHub OAuth plus OIDC providers via `HIVE_HUB_OIDC_<P>_CLIENT_ID` and `_ISSUER`, with built-ins Google, Red Hat, Microsoft, IBMid and a CUSTOM issuer (src/docs/env-vars.md:384-390). An opt-in OIDC token mint exists (src/docs/token-mint.md). |
| OpenCode | **Mentioned: supported backend, T2 (deny-list)** | integrations.md; Justfile:234; backend-support-tiers.md:163 |
| Goose | **Mentioned: supported, T1 pod / T3 local** | integrations.md; docs/goose-at-scale.md; upstreaming to AAIF planned (#14095) |
| OpenHands | **Mentioned: opt-in T3 "legacy CLI"** | integrations.md; CHANGELOG.md:715, :1657 (`openhands --headless`) |
| Qwen | **Mentioned only as an example model** | src/docs/manual-provisioning.md:98, :830 (llama.cpp serving Qwen2.5-0.5B as the demo inference); docs/hive-arch.svg; tests. No first-class Qwen integration. |
| MCP | **Mentioned: used and exposed** | Agents get GitHub MCP with write tools denied (src/docs/security-model.md:47, :96); Hive serves `/mcp/knowledge` (src/docs/knowledge-lifecycle.md:41) and `/api/contribute/mcp`; "Task-scoped MCP" on the roadmap (ROADMAP.md:256-265); consumes the vibe-kanban MCP |
| ACP (Agent Client Protocol) | **Mentioned narrowly: Goose ACP only** | src/pkg/dashboard/cli_models.go:155-157 spawns goose's ACP agent server to probe the model list (`runGooseACPProbe`). There is no general ACP client or host, and no reference to agentclientprotocol.com or Zed. docs/presentations/hive-hub-and-spoke.html:217 says "ACP - agent-to-agent communication protocol", which looks like IBM's Agent Communication Protocol, a different ACP. |
| AHP (Agent Host Protocol, VS Code) | **Absent** | 0 hits for "agent host protocol" or `\bahp\b` |
| OpenTelemetry | **Mentioned: optional trace/metric export** | changelog.d/added-github-otel.md (#13380: `github.request` spans for GitHub API spend and cache); src/hive.yaml.example:940-949 `otel:` block, off by default; go.opentelemetry.io deps in src/go.mod |
| Omnigraph | **Absent** | 0 hits |
| Unfold | **Absent** | 0 hits; not mentioned on hive.hivecommons.dev or hivecommons.dev |
| Ploeg (ploeg-hq/ploeg) | **Absent** | 0 hits; not in landscape.md or the competitor-report project list |
Engines Hive drives (for reference, weekly-competitor-report.md:271-276 citing `CLIBackends` in hivecommons/crux): claude, copilot, codex, gemini, goose, aider, bob, agy, pi, opencode, kilo, muse, omp, openhands, omnigent.
