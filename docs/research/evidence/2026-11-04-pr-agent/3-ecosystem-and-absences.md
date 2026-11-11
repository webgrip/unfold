# PR-Agent ecosystem and absence checks

**Method (2026-11-04).** Repo facts from the GitHub REST API (`repos/The-PR-Agent/pr-agent`, `releases`, `commits?path=LICENSE`, `contributors`, `commits?since=2026-08-01`, `security-advisories`, `orgs/The-PR-Agent`, `search/issues`, `search/code`). Source checked by a shallow clone of `The-PR-Agent/pr-agent@10f6429f` (2026-11-04T10:11Z) and case-insensitive greps over `pr_agent/`, `docs/docs/`, `docker/`, `pyproject.toml`, `README.md`, `SECURITY.md`; every hit read in context. CVE status from `cveawg.mitre.org/api/cve/<id>` and `services.nvd.nist.gov/rest/json/cves/2.0?cveId=<id>`. Adoption from `pypistats.org/api/packages/pr-agent/recent`, Docker Hub `v2/repositories`, and GitHub code search over `.github/workflows`. Web: WebSearch (standard and extended) and WebFetch for Qodo, Futurum, Kudelski, arXiv, Martian. `qodo-ai/pr-agent` and `Codium-ai/pr-agent` are GitHub redirects to the same repo (same repo node id `O_kgDOD76kCA` owner, created 2023-07-05).

Permalink base for source citations below: `https://github.com/The-PR-Agent/pr-agent/blob/10f6429f22c2fafb54d54600085e299efbc8190e/` (abbreviated `@10f6429f/`).

## Summary

- PR-Agent is alive and very active, but it is no longer Qodo's product. Qodo handed it to a community org on 2026-04-23. Since then it has shipped 0.34.1 through 0.49.0 (16 releases in six months). It has 1,274 commits since 2026-08-01, most of them from three non-Qodo contributors.
- License history: Apache-2.0 (2023) → AGPL-3.0 (2025-05-22) → Apache-2.0 (2026-05-20) → **MIT (2026-07-09)**. The MIT switch has no public rationale. Qodo's handover post still says "Apache 2.0".
- It is a single-shot reviewer: one LLM call per tool, no agent loop, no MCP, no ACP, no money budget. It has a working Gitea/Forgejo provider, ticket compliance for GitHub/GitLab issues, Jira Cloud, Asana and Linear, and an A2A server (MOSAICO, since v0.36.0).
- Independent benchmarks do not measure the OSS PR-Agent. Martian's bench tracks only Qodo's hosted bots. The only independent field study of OSS PR-Agent is the Beko/Bilkent ICSE-SEIP 2025 paper: 73.8% of comments resolved, and PR closure time rose from 5h52m to 8h20m.
- Security track record: Kudelski's 2024 disclosure (prompt injection, config override, token exfiltration; the vendor did not respond). The 2026 `/help_docs` GITHUB_TOKEN exfiltration issue (#2445) is closed, but `/help_docs` is still disabled in README. No GHSA has been published on the repo.

## Part 1

### Timeline

| Date | Event | Evidence |
|---|---|---|
| 2023-07-05 | Repo created; initial commit "Initial commit - PR-Agent OSS release" (CodiumAI), Apache-2.0 | `gh api repos/The-PR-Agent/pr-agent` createdAt; commit `4b4d91df` https://github.com/The-PR-Agent/pr-agent/commit/4b4d91df |
| 2023-09-20 | First GitHub release v0.7 | https://github.com/The-PR-Agent/pr-agent/releases/tag/v0.7 |
| 2024-03-11 | v0.2 (version scheme reset, then v0.21 on 2024-03-23) | https://github.com/The-PR-Agent/pr-agent/releases |
| 2024-07-06 | v0.23, the version Kudelski tested | https://github.com/The-PR-Agent/pr-agent/releases/tag/v0.23 |
| 2024-08-29 | Kudelski Security publishes "Careful Where You Code: Multiple Vulnerabilities in AI-Powered PR-Agent" | https://kudelskisecurity.com/research/careful-where-you-code-multiple-vulnerabilities-in-ai-powered-pr-agent |
| 2024-09 (Kudelski's update says "CodiumAI is now Qodo" as of 2024-10-01) | CodiumAI rebrands to Qodo; hosted PR-Agent becomes "Qodo Merge" | https://www.qodo.ai/blog/introducing-qodo-a-new-name-the-same-commitment-to-quality ; Kudelski update above |
| 2024-12-24 | arXiv 2412.18531 "Automated Code Review In Practice" (Beko deployment of PR-Agent) | https://arxiv.org/abs/2412.18531 |
| 2025-05-22 | LICENSE changed Apache-2.0 → AGPL-3.0, commit by `mrT23` (Tal Ridnik, top contributor) | https://github.com/The-PR-Agent/pr-agent/commit/70428ebb |
| 2025-11-06 | v0.31, last image on `codiumai/pr-agent` Docker Hub | https://github.com/The-PR-Agent/pr-agent/releases/tag/v0.31 ; README Docker note |
| 2026-02-26 | GitHub org `The-PR-Agent` created | `gh api orgs/The-PR-Agent` created_at |
| 2026-04-23 | Qodo blog "Qodo Is Handing PR-Agent Over to the Community" by Dana Fine and Naor Peled. Repo moves to The-PR-Agent; governance committee: Naor Peled (first external maintainer, TypeORM maintainer), Ofir Friedman (Qodo), Dana Fine. Stated reasons: PR-Agent "has not kept pace with the Qodo platform"; Qodo focuses on "its enterprise-grade AI code review and governance platform". A foundation is being explored. | https://www.qodo.ai/blog/qodo-is-handing-pr-agent-over-to-the-community/ ; analyst relay https://futurumgroup.com/insights/qodo-hands-pr-agent-to-the-community-will-open-governance-accelerate-ai-code-review/ |
| 2026-05-02 | v0.34.1–0.34.3, first releases from new pipeline; Docker namespace `pragent/pr-agent` | https://github.com/The-PR-Agent/pr-agent/releases/tag/v0.34.2 |
| 2026-05-20 | LICENSE AGPL-3.0 → Apache-2.0 (commit by `ofir-frd`) | https://github.com/The-PR-Agent/pr-agent/commit/fdbcecc8 |
| 2026-06-01 | v0.36.0 adds the MOSAICO A2A solution-agent server (PR #2414) | https://github.com/The-PR-Agent/pr-agent/releases/tag/v0.36.0 |
| 2026-06-13 → 06-19 | Issue #2445: `/help_docs` lets untrusted commenters override clone target and exfiltrate `GITHUB_TOKEN`; `/help_docs` disabled since v0.36.1 | https://github.com/The-PR-Agent/pr-agent/issues/2445 |
| 2026-07-09 | LICENSE Apache-2.0 → **MIT**, commit `d7e94bc2` by `ofir-frd`. The commit message is only "From Apache-2.0 to MIT"; no issue or announcement found | https://github.com/The-PR-Agent/pr-agent/commit/d7e94bc2 |
| 2026-10-25 | v0.49.0 (latest at time of writing) | https://github.com/The-PR-Agent/pr-agent/releases/tag/v0.49.0 |

Current state (API, 2026-11-04): 14,552 stars, 2,068 forks, 47 open issues+PRs, not archived, pushed 2026-11-04. README tagline: "The Original Open-Source PR Reviewer. This project is not the Qodo free tier." It calls itself "a community-maintained legacy project of Qodo". Qodo is listed as Gold sponsor, and sponsorship goes to `naorpeled` (https://github.com/sponsors/naorpeled). The org's only public member is `naorpeled`. Commit authors since 2026-08-01: Peter Dave Hello 314, Utsab Dahal 233, Alex Tumanov 137, Dwin Gharibi 57, dependabot 38, others ≤34, Naor Peled 12. Maintenance has shifted from Qodo staff to community contributors.

### Positioning vs adjacent AI PR reviewers

PR-Agent is the only one in this list that is a complete, self-hostable, multi-forge PR reviewer under an OSI license. Several vendors ship open-source CI wrappers around their own agents (Claude, Gemini, Codex), but those wrappers run a general coding agent rather than a dedicated review pipeline.

| Tool | Open source? | Self-hostable? | Forges | Evidence |
|---|---|---|---|---|
| **PR-Agent** | Yes, MIT (since 2026-07-09) | Yes: CLI, GitHub Action, Docker webhook servers, Lambda | GitHub, GitLab, Bitbucket Cloud/Server, Azure DevOps, Gitea/Forgejo, Gerrit, CodeCommit (provider files in `pr_agent/git_providers/`) | https://github.com/The-PR-Agent/pr-agent |
| Qodo (ex-Qodo Merge) | No | Enterprise on-prem offered by vendor (not verified this run) | GitHub, GitLab, Bitbucket, Azure DevOps | https://www.qodo.ai/ |
| CodeRabbit | No (its early OSS `coderabbitai/ai-pr-reviewer` no longer resolves on GitHub) | Enterprise self-hosted offering (not verified this run) | GitHub, GitLab, Bitbucket, Azure DevOps | https://www.coderabbit.ai/ |
| GitHub Copilot code review | No | No (GitHub only) | GitHub | https://docs.github.com/en/copilot/using-github-copilot/code-review/using-copilot-code-review |
| Graphite Diamond / Graphite Agent | No | No | GitHub | https://graphite.dev/ |
| Greptile | No | Enterprise self-hosted (not verified this run) | GitHub, GitLab | https://www.greptile.com/ |
| Sourcery | No (`sourcery-ai/sourcery` is MIT but is an issue/docs repo, not the reviewer) | No | GitHub, GitLab | https://github.com/sourcery-ai/sourcery |
| Ellipsis | No | No | GitHub | https://www.ellipsis.dev/ |
| Bito AI Code Review Agent | No | Vendor documents a self-hosted Docker agent (not verified this run) | GitHub, GitLab, Bitbucket | https://bito.ai/ |
| Gemini Code Assist review | App: no. Action `google-github-actions/run-gemini-cli`: Apache-2.0 (created 2025-07-11) | Action yes | GitHub | https://github.com/google-github-actions/run-gemini-cli |
| Claude Code GitHub Action (`/review`) | `anthropics/claude-code-action`: MIT (created 2025-05-19) | Yes, runs in your CI with your key | GitHub | https://github.com/anthropics/claude-code-action |
| OpenAI Codex review | Cloud review: no. `openai/codex` CLI and `openai/codex-action`: Apache-2.0 | Action/CLI yes | GitHub | https://github.com/openai/codex-action |
| Kodus (`kodustech/kodus-ai`) | Source-available ("other" license per GitHub) | Yes, "self-hosted AI code review. Bring your own LLM." | GitHub, GitLab, Bitbucket, Azure DevOps (per vendor) | https://github.com/kodustech/kodus-ai |

Note: the PR-Agent maintainers rejected the proposal to add Claude Code / Codex CLI-backed handlers: issue #3640, closed NOT_PLANNED on 2026-10-16 (https://github.com/The-PR-Agent/pr-agent/issues/3640). PR-Agent stays a LiteLLM single-call reviewer by choice.

**Name collisions.** No other notable software product called "PR Agent" was found; web search for that name returns public-relations "AI PR agent" marketing only. Collisions that do exist:

- Forks: `jclee941/pr-agent` (https://github.com/jclee941/pr-agent).
- A PyPI fork, `pr-agent-patched` (https://pypi.org/project/pr-agent-patched/).
- Qodo's own hosted bots, `qodo-code-review[bot]` and `qodo-free-for-open-source-projects[bot]`. These are easily confused with OSS PR-Agent in benchmarks.
- The GitHub Marketplace action "the pr agent" (https://github.com/marketplace/actions/the-pr-agent).

### Evidence of quality

| Source | Run by | What it measured | PR-Agent OSS included? |
|---|---|---|---|
| Martian Code Review Bench, https://codereview.withmartian.com, repo https://github.com/withmartian/code-review-benchmark (MIT, created 2026-02-06) | Independent (Martian, a model-routing company, not a reviewer vendor). Offline: 50 PRs, 173 golden comments, LLM judges. Online: real bot comments vs later human fixes. | Precision/recall/F1 per bot | **No.** Online ETL tracks `qodo-code-review[bot]` and `qodo-free-for-open-source-projects[bot]` only (`online/etl/config.py` lines 83, 94). OSS PR-Agent posts as `github-actions[bot]` or a self-named app, so it is not separable. The offline tool list names "Qodo", not PR-Agent. Secondary reports put Qodo first for precision (63.4%, March 2026, https://en.wikipedia.org/wiki/Qodo) and Greptile (60.8% F1, 2026-07-30) or Cubic (64.9% F1, 2026-10-06) first overall (https://blog.kilo.ai/p/martians-independent-benchmark-tested, https://thenewstack.io/github-reviewbench-code-review/). Leaderboard page not machine-readable via WebFetch; numbers not verified first-hand. |
| Qodo "PR Benchmark" (400 PRs, 100+ repos; private data) | Vendor (Qodo) | Ranks *models* inside Qodo Merge's `/improve` | Indirectly (the model behind the tool), not the tool vs competitors. https://www.qodo.ai/blog/benchmarking-gpt-5-on-real-world-code-reviews-with-the-pr-benchmark/ |
| Qodo Code Review Benchmark 1.0 (injected defects) | Vendor (Qodo) | Qodo Extended F1 74.7%, Default 68.2%, Claude Code Review 62.7% | No: measures commercial Qodo, not OSS PR-Agent. https://www.qodo.ai/blog/qodo-outperforms-claude-in-code-review-benchmark |
| Greptile benchmark (2025) | Vendor (Greptile) | Bug-catch rate vs CodeRabbit etc. | Not established. https://www.greptile.com/content-library/greptile-martian-code-review-benchmark |
| GitHub ReviewBench (2026) | Vendor (GitHub) | Review quality | Not established. https://thenewstack.io/github-reviewbench-code-review/ |
| Cihan et al., "Automated Code Review In Practice", arXiv 2412.18531, ICSE-SEIP 2025 | **Independent academic + industry (Bilkent University, Beko)** | Field deployment of OSS PR-Agent ("Code Review Bot", GPT-4 Turbo) at Beko; 238 practitioners, 10 projects; 3 projects / 4,335 PRs analysed, 1,568 with automated reviews; 22 surveyed | **Yes.** "73.8% of automated comments were resolved", yet "average pull request closure duration increased from five hours 52 minutes to eight hours 20 minutes"; drawbacks: "faulty reviews", "unnecessary corrections, and irrelevant comments". https://arxiv.org/abs/2412.18531 |

Absence: no independent benchmark with a 2026 number for open-source PR-Agent was found.

### Strongest critiques

1. **Prompt injection and config override were long the attack surface, and the vendor did not respond.** Kudelski (Nils Amiet, 2024-08-29) showed six issues against v0.23. They are: prompt injection via `/ask`; GitLab quick-action privilege escalation; `--key=value` config override in comments; credential exfiltration by overriding `gitlab.url`, `github.base_url` and `openai.api_base`; write access via leaked `GITHUB_TOKEN`; and repository-secret theft. CodiumAI did not answer four contacts. On 2024-11-08 the PoC worked again. Talk at 38C3: https://media.ccc.de/v/d3fd8a6a-97e9-587e-8e30-9042cac58e3d. Kudelski cites CVE-2024-51355 and CVE-2024-51356, but on 2026-11-04 both MITRE (`CVE_RECORD_DNE`) and NVD (0 results) return no record. The IDs were never published or were rejected. Source: https://kudelskisecurity.com/research/careful-where-you-code-multiple-vulnerabilities-in-ai-powered-pr-agent
2. **The same class of bug recurred in 2026.** Issue #2445, "PR-Agent /help_docs allows untrusted commenters to override git clone target and exfiltrate GITHUB_TOKEN via weak hostname validation", was opened 2026-06-13 and closed 2026-06-19. README still says "`/help_docs` is temporarily disabled since `v0.36.1`". The repo's published security advisories list is empty (`security-advisories` → `[]`), and the GitHub advisory DB has nothing under pip/pr-agent, so this was handled without a GHSA. Recent hardening around "host-only" settings is visible in the code (`config_security.py`; issue #2946 https://github.com/The-PR-Agent/pr-agent/issues/2946). Source: https://github.com/The-PR-Agent/pr-agent/issues/2445
3. **Noise, plus longer cycle time in the one independent field study.** Comments were mostly resolved, but closure time went up 42%, with faulty or irrelevant comments reported (arXiv 2412.18531, above). Third-party round-ups repeat the noise and false-positive concern for AI reviewers generally: https://dev.to/dev_barron/best-ai-code-review-tools-by-false-positive-rate-what-the-benchmarks-actually-show-2e8l (secondary, low authority).
4. **Its role as Qodo's "legacy" project weakens its standing, and the license has churned.** Qodo states PR-Agent "has not kept pace with the Qodo platform". Benchmarks and marketing now concern Qodo, not PR-Agent. The license changed three times in 14 months; the latest switch, to MIT, has no public rationale, and Qodo's announcement (Apache-2.0) is now stale. Sources: Qodo blog above; LICENSE history https://github.com/The-PR-Agent/pr-agent/commits/main/LICENSE
5. **It is single-shot by design.** "Each tool (`/review`, `/improve`, `/ask`) uses a single LLM call" (README). It does not explore the repository agentically: MCP tool orchestration was rejected (#2348 closed 2026-08-31; #2944 NOT_PLANNED 2026-09-07), as were CLI-agent handlers (#3640 NOT_PLANNED). Context comes only from compression and opt-in `repo_context_files`. Release cadence is also very high, which brings regressions: #4529 "cli missing from 0.49.0" is open as of 2026-10-30 (https://github.com/The-PR-Agent/pr-agent/issues/4529).

### Shipped adoption vs press release

Shipped adoption (measured 2026-11-04):

- PyPI `pr-agent`: 5,606 downloads/day, 20,859/week, 30,654/month (https://pypistats.org/packages/pr-agent).
- Docker Hub: `pragent/pr-agent` 3,028,751 pulls; legacy `codiumai/pr-agent` 12,852,400 pulls (https://hub.docker.com/r/pragent/pr-agent).
- GitHub code search hits in `.github/workflows` (approximate counts; the three spellings overlap because search is case-insensitive):
  - `the-pr-agent/pr-agent@`: 314
  - `qodo-ai/pr-agent@`: 274
  - `Codium-ai/pr-agent@`: 439

  Many users still pin pre-move references.
- The only named production deployment with data is Beko (arXiv 2412.18531). The MOSAICO (EU research project) image is republished by Eclipse Research Labs (https://gitlab.eclipse.org/eclipse-research-labs/mosaico-project/qodo-pr-agent). That is a research-consortium integration, not a commercial adoption.
- Press-release-only: Futurum's analysis relays Qodo's announcement and gives no usage numbers. No named enterprise adopters of OSS PR-Agent were found beyond Beko.

## Part 2: absence checks

Verdicts below come from the source at `10f6429f` (2026-11-04) unless another date is given.

| Component | Verdict | Evidence (URL, date) |
|---|---|---|
| **Forgejo** | **Supported** (through the Gitea provider; not a separate provider) | `gitea_provider.py` contains Forgejo-specific handling, such as the label-id lookup on "current Forgejo (15.0.10+, 16.0.6+, 17.x)" and null pages past the end. Issues: #4305 "Forgejo reviews fail when an extra changed-files page returns null" (closed 2026-10-23), #2525 (closed 2026-07-15), #2612 reverse-proxy links (closed 2026-08-09). https://github.com/The-PR-Agent/pr-agent/blob/10f6429f22c2fafb54d54600085e299efbc8190e/pr_agent/git_providers/gitea_provider.py ; https://github.com/The-PR-Agent/pr-agent/issues/4305 |
| **Gitea** | **Supported** | First-class provider, a webhook server (`gitea_app` Docker target), install guide and support-matrix column. The webhook secret is mandatory (403 otherwise). https://github.com/The-PR-Agent/pr-agent/blob/10f6429f22c2fafb54d54600085e299efbc8190e/docs/docs/installation/gitea.md ; https://github.com/The-PR-Agent/pr-agent/blob/10f6429f22c2fafb54d54600085e299efbc8190e/docs/docs/overview/supported_platforms.md (2026-11-04). Gap: on Gitea, ticket context means Jira, Asana or Linear only; native Gitea issues are not used (footnote `[^tickets]`). |
| **Vikunja** | **Absent** | 0 grep hits in repo source and docs, 2026-11-04. |
| **ClickUp** | **Absent** | 0 grep hits, 2026-11-04. Ticket systems are GitHub/GitLab issues, Azure DevOps work items, Jira Cloud, Asana and Linear only. |
| **LiteLLM proxy** (OpenAI-compatible base URL + virtual key) | **Supported** | Two routes: (a) `model = "openai/<id>"` with `[openai] api_base` and `key`. The key can be a LiteLLM virtual key, because PR-Agent just sends it as an OpenAI key. Documented in https://github.com/The-PR-Agent/pr-agent/blob/10f6429f22c2fafb54d54600085e299efbc8190e/docs/docs/usage-guide/changing_a_model.md (lines 40–72). (b) LiteLLM's native `litellm_proxy/` prefix with `LITELLM_PROXY_API_BASE` and `LITELLM_PROXY_API_KEY`, recognised in `pr_agent/algo/ai_handlers/cloud_auth.py` lines 136 and 266 (key-guard tested in `tests/unittest/test_litellm_api_key_guard.py`). Virtual-key budgets would be enforced by the proxy; PR-Agent has no knowledge of them. Caveat: a repo's `.pr_agent.toml` and comment arguments cannot change `api_base` (host-only; see `config_security.py` and Kudelski finding 4). |
| **Fireworks AI** | **Supported via LiteLLM (undocumented)** | `fireworks_ai` is in the provider env maps (`FIREWORKS_API_BASE`; `FIREWORKS_API_KEY` / `FIREWORKS_AI_API_KEY` / `FIREWORKS_AI_TOKEN`) in `pr_agent/algo/ai_handlers/cloud_auth.py` lines 117, 243–248 and 321. `changing_a_model.md` does not mention it; Fireworks can also be reached as an OpenAI-compatible endpoint. 2026-11-04. |
| **OpenCode** | **Absent** | 0 grep hits. The related request for CLI-agent handlers (Claude Code, Codex) was closed NOT_PLANNED on 2026-10-16: https://github.com/The-PR-Agent/pr-agent/issues/3640 |
| **Kubernetes deployment / Helm chart** | **Partial** (Docker images only; no Helm chart, no manifests) | `docker/` contains `Dockerfile`, `Dockerfile.lambda` and `mosaico/`. No `Chart.yaml`, `values.yaml` or k8s manifests anywhere. The only Kubernetes mention is a pod-spec snippet for mounting a secrets file (`docs/docs/installation/github.md` line 756). Webhook servers run under gunicorn with multiple workers (`docs/docs/installation/index.md` line 50). Issue search for "helm": 0 relevant. 2026-11-04. |
| **ACP (Agent Client Protocol)** | **Absent** | 0 hits for `acp`, `agent client protocol` or `agentclientprotocol` in `pr_agent/`, `docs/docs/` and `pyproject.toml`, 2026-11-04. |
| **MCP** | **Absent** (neither exposes nor consumes) | No MCP dependency or code. The only hit is `docs/package-lock.json` (docs-site tooling). Proposals were rejected: PR #2348 "feat: add MCP tool orchestration and server config support" closed unmerged 2026-08-31 (https://github.com/The-PR-Agent/pr-agent/pull/2348); #2944 "Add MCP tool orchestration for /ask" closed NOT_PLANNED 2026-09-07 (https://github.com/The-PR-Agent/pr-agent/issues/2944); #3099 "load model tools from allowlisted packages" NOT_PLANNED 2026-09-07. |
| **A2A** | **Supported (exposes an A2A server)** | `pr_agent/mosaico/`, optional extra `mosaico = ["a2a-sdk[http-server]==1.3.0"]` (`pyproject.toml` line 116), image `pragent/pr-agent:<ver>-mosaico_agent`, since v0.36.0 (2026-06-01). It serves A2A 1.0 JSON-RPC on `:9000`, an agent card at `/.well-known/agent-card.json` with skills `review`, `improve`, `describe` and `ask`, and optional per-principal bearer tokens. Built for the EU MOSAICO project. https://github.com/The-PR-Agent/pr-agent/blob/10f6429f22c2fafb54d54600085e299efbc8190e/docker/mosaico/README.md ; https://github.com/The-PR-Agent/pr-agent/blob/10f6429f22c2fafb54d54600085e299efbc8190e/docs/docs/installation/mosaico_server.md . It does not consume A2A agents. |
| **Per-call money budget / limit** | **Absent** (only token and call-count caps, plus cost *reporting*) | `configuration.toml` provides: `max_model_tokens = 32000` (line 54); `max_ai_calls=4` for large-PR `/describe` (line 247); `extended_thinking_budget_tokens` (line 142); `output_run_cost=false`, which only *reports* the estimated LiteLLM cost (line 73). There is no USD or credit limit and no hard stop on spend. 0 hits for `max_cost`. 2026-11-04. |
| **Multi-tenant operation** | **Partial** | One process serves many repos. Per-repo `.pr_agent.toml` is allowed, with "host-only" keys that repos cannot override (see the `repo_context_sibling_repos` comment in `configuration.toml` line 49). The docs speak of a "multi-tenant server" only to warn that telemetry is process-wide (`docs/docs/usage-guide/additional_configurations.md` line 462). The A2A server isolates tasks per bearer principal but calls an empty map "single-tenant" (`docs/docs/installation/mosaico_server.md` line 77). There are no tenants, orgs, quotas or per-tenant LLM keys. 2026-11-04. |
| **"Ploeg"** | **Absent** | 0 hits in the repo. On GitHub, the name otherwise appears only as `ploeg-hq/ploeg` (ours) and unrelated hobby repos (`teodorov/ploeg_tree_layout`, `felixarjuna/ploeg.emulator`). 2026-11-04. |
| **"Unfold"** | **Absent** | 0 hits in the repo. Name collisions on GitHub: `unfoldadmin/django-unfold` ("Modern Django Admin", 3,745 stars), `tillnagel/unfolding` (maps), `unfold/webpack-serve`. 2026-11-04. |

### Ticket compliance / acceptance criteria from a linked ticket

**Supported.** `/review` fetches linked tickets and labels the PR "Fully Compliant", "Partially Compliant", "Not Compliant" or "PR Code Verified" against the ticket's intent (`require_ticket_analysis_review=true`, `configuration.toml` line 180). Fetched fields: title, description, custom fields (acceptance criteria), subtasks, labels and images. Doc: https://github.com/The-PR-Agent/pr-agent/blob/10f6429f22c2fafb54d54600085e299efbc8190e/docs/docs/core-abilities/fetching_ticket_context.md

| Tracker | How a ticket is linked | Notes |
|---|---|---|
| GitHub Issues | Issue refs in PR title/description; numeric issue in branch name (GitHub only, `branch_issue_regex`) | Cross-repo issues need `repo_context_sibling_repos` approval |
| GitLab Issues | Refs in MR title/description | |
| Azure DevOps work items | Native | Support-matrix footnote |
| Jira | Keys like `ABC-123` in description or branch name, **on every provider** | **Jira Cloud only**: `https://<site>.atlassian.net` or a `cloud_id`. Acceptance criteria are read from a custom field via `jira.jira_requirements_field`; a `jira.project_keys` allowlist applies (`configuration.toml` lines 478–496; `pr_agent/tools/ticket_pr_compliance_check.py`). |
| Asana | Task links in PR description | |
| Linear | `https://linear.app/<ws>/issue/TEAM-123` links in the user-written description only; bare IDs and branch names are not scanned | Personal API key in `LINEAR__API_TOKEN` |
| Gitea/Forgejo issues, Vikunja, ClickUp | **Absent** | On Gitea, ticket context means Jira, Asana or Linear only |

Separately, a static custom checklist is possible. Free-form `extra_instructions` exist, and Agent Skills (`SKILL.md` files injected into `/review`, `/improve`, `/describe` and `/ask` prompts) are documented at https://github.com/The-PR-Agent/pr-agent/blob/10f6429f22c2fafb54d54600085e299efbc8190e/docs/docs/core-abilities/agent_skills.md. A `pr_compliance_checklist.yaml` file (title, objective, success and failure criteria per rule) sits at the repo root, but no code or doc in `pr_agent/` or `docs/docs/` references it. It may be inert in OSS PR-Agent, or a leftover of the Qodo-hosted compliance feature (not verified).

## Not verified

- Martian leaderboard figures: taken from secondary sources; the leaderboard page did not render via WebFetch.
- Self-hosting claims for CodeRabbit, Greptile, Bito and Qodo, and Graphite's current product name and ownership: taken from vendor pages or memory, not checked in this run.
- Reason for the 2026-07-09 MIT relicense: none found in commits, issues or Qodo posts.
- Whether `pr_compliance_checklist.yaml` is consumed anywhere: not traced beyond the grep.
- Workflow code-search counts: approximate (GitHub code search totals are estimates and case-insensitive).
- Exact date of the Qodo rebrand: reported as September 2024 by secondary sources and the Qodo blog; the exact day was not confirmed.
