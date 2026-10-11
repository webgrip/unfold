# Which models and which Team shape for agentic engineering

Date: 11 October 2026, against `origin/development` at `42c6a041`, homelab `origin/main` (Ploeg 0.2.0-rc.16), and LiteLLM's spend log for the last 30 days. This is a record. It answers the owner's questions of 11 October: which models cost little and are good enough, what practitioners currently say about models for agentic engineering, in which shape agents should work together, and how they should communicate. It ends in a plan that builds on the spikes already open: [VIK-1617](https://vikunja.webgrip.dev/tasks/1617) (measure cost and merge rate), [VIK-1621](https://vikunja.webgrip.dev/tasks/1621) (bench open-weight against frontier Teams) and [VIK-1651](https://vikunja.webgrip.dev/tasks/1651) (EU route for client code). Nothing in the plan is decided or built yet.

> **Method.** One web research agent (sources at the end), two read-only code surveys of Ploeg, Unfold and `homelab-cluster`, and direct queries on LiteLLM's `LiteLLM_SpendLogs`. Prices for Fireworks and Anthropic come from their own pages. Benchmark scores are marked *(v)* when vendor-reported. The one cross-model comparison checked first-hand is Vals' Terminal-Bench 4.0 (TB4), where every model runs in the same harness (mini-SWE-agent, avg@3, board updated 2026-10-07). "US$ per solved task" is Vals' cost per task divided by its accuracy, computed here.

## Verdict

- Ploeg's Team shape already matches what the evidence and production teams converged on: **one writer, one reviewer from another model family with a clean context, and a capped fix loop.** No swarm, debate or agent-to-agent protocol is worth adding.
- The open question is not topology but **cost per accepted pull request per model**, and Ploeg cannot answer it yet: no query joins Run cost, Role, model and merge, Runs do not record the configuration they ran with, and a model can only be trialled by cloning a Team.
- Of the models configured today, DeepSeek V4.1 Flash (builder) and GLM 5.3 Flash (reviewer, Ask) are good value. Kimi K3, Qwen 3.8 Max and MiniMax M3 are poor value for agentic work; Ploeg uses none of them.
- Candidates worth a bench: **GPT-6.1 Sol** as a strong builder or planner, **MiMo V2.6 Pro** as a cheaper open-weight builder, and **Claude Haiku 5.5** as a reviewer from a third family.

## Correction to homelab-cluster #728

[#728](https://forgejo.webgrip.dev/webgrip/homelab-cluster/pulls/728) added explicit prices for `fireworks-glm-5p3-flash`, on the premise that LiteLLM recorded its calls at US$ 0. The spend log shows that premise was wrong: LiteLLM's built-in price list already priced GLM 5.3 Flash. Before #728, 595 calls in 45 days had no zero-cost call, and the recorded spend matches the list price with cached prompts at US$ 0,03 per million. The deploy-check Ask that settled at US$ 0 used 51 tokens, worth about US$ 0,00002, which rounds to zero. Pinning the price stays useful, because the built-in list can lag a new model, but bronze's reviewer Runs were never recorded as free. The [Ask cost record](2026-10-11-ask-cost.md) is unaffected: it computed cost from token counts at list price.

The same log shows that most models without `model_info` are priced by LiteLLM's built-in list too. A handful of calls on `fireworks-qwen3-plus`, `fireworks-kimi-code`, `claude-haiku-4-5`, `claude-sonnet-5` and `fireworks-gpt-oss-120b` were recorded at US$ 0; none is a model a Ploeg Team uses. `deepseek-chat` (DeepSeek's own API) last served a Ploeg Run on 2026-09-30.

## 1. Cheap models good enough for agentic coding

Prices are US$ per million tokens: input / cached input / output.

| Model | Price (where) | TB4 | US$ per task → per solved task | Notes |
| --- | --- | --- | --- | --- |
| DeepSeek V4.1 Flash (bronze and silver builder) | 0,30 / 0,006 / 1,20 (Fireworks) | 19,7 % | 0,50 → **2,54** | best value of the configured models |
| GLM 5.3 Flash (reviewers, Ask) | 0,15 / 0,03 / 0,50 (Fireworks) | not listed | — | TB2.1 84,3 *(v)* |
| MiMo V2.6 Pro (MIT licence) | 0,435 / 0,0036 / 0,87 (aggregator; not on Fireworks) | 31,3 % | 0,50 → **1,60** | best open-weight value on TB4 |
| GPT-6.1 Sol | 2 / 0,10 / 10 (aggregator) | 55,1 % | 1,72 → **3,12** | best frontier value |
| Claude Haiku 5.5 | 0,10 / 0,01 / 0,50 under 100K-token prompts (Anthropic) | 35,4 % | 3,05 → 8,63 | not configured in LiteLLM yet |
| Claude Sonnet 5.5 | 2 / 0,10 / 10 (Anthropic) | 64,1 % | 16,51 → 25,7 | configured, unused |
| Claude Opus 5.5 | 4 / 0,20 / 20 (Anthropic) | 65,2 % | 13,20 → 20,3 | — |
| Qwen 3.8 Max (`fireworks-qwen3-plus`) | 2,00 / 0,25 / 6,00 (Fireworks) | 34,3 % | 10,63 → **31,0** | poor value |
| Kimi K3 (`fireworks-kimi-code`) | 3,00 / 0,30 / 15,00 (Fireworks) | 17,2 % | 12,02 → **70,0** | poor value |
| MiniMax M3 (`fireworks-minimax-m3`, also `chat-default`) | 0,30 / 0,06 / 1,20 (Fireworks) | **1,0 %** | — | likely a tool-format failure; not for agent work |
| gpt-oss-120b | 0,15 / 0,015 / 0,60 (Fireworks) | not listed | — | needs its own tool format |

Caveats: TB4 measures one harness, not Ploeg's OpenHands loop; GLM 5.3 Flash has no independent agentic score; prices marked "aggregator" are not confirmed on the vendor's page. `chat-default` serves Open WebUI and the brain evaluation, not Ploeg, so its poor TB4 score matters only if it is used for agent work.

## 2. What practitioners say

- **Frontier:** Opus 5.5 and Sonnet 5.5 lead SWE-bench Pro and TB4; GPT-6.1 Sol is the favourite on cost per solved task.
- **Open-weight:** GLM 5.x, MiMo V2.6 Pro, Qwen 3.8, Kimi K3 and DeepSeek V4.1 Flash are the names in use; DeepSeek V4.1 Flash (2026-09-10) beats V4 Pro on agentic benchmarks.
- **Caveats repeated everywhere:** SWE-bench Verified is saturated and archived by Vals; about 30 % of SWE-bench Pro public tasks are reported broken; the harness moves scores by up to tens of points; vendor TB2.1 scores (84–90) do not match independent TB4 (1–65 %); and higher effort can raise cost per task at the same token price. Cost per solved task, measured in your own loop, is the number that matters.

## 3. Which shape a Team should have

- **One writer.** At equal token budget a single agent matches or beats sequential, parallel, debate and ensemble arrangements (Tran & Kiela, arXiv 2604.02460); automatically generated multi-agent systems trail single-agent self-consistency at up to 10× the compute (arXiv 2606.13003). Multi-agent pays for research-style work that splits into independent parts, not for one code change.
- **A reviewer with a clean context, from another model family.** Cognition's production setup (April 2026): the writer works single-threaded; a reviewer that sees only the diff catches about two bugs per pull request, 58 % of them severe; the writer filters the reviewer's findings against the brief, which stops loops and scope creep. Models favour their own output, and one family shares blind spots.
- **A cap on fix rounds**, one or two.
- **Best-of-n only with a good selector.** Three candidates at 76,1 % each could reach 84,4 % with a perfect pick; an LLM verifier picked 78,2 %. Spend multiplies by n.
- **Escalation to a stronger model works only when it is not the cheap model's own call.** Cognition's "smart friend" failed because the cheap model did not know when to ask.

### How Ploeg compares today

| Practice | Ploeg on homelab |
| --- | --- |
| One writer per Round | yes, enforced by the plan ([Ploeg ADR-0010](../../apps/ploeg/docs/adrs/0010-shift-owns-the-item-lease-owns-the-branch.md)) |
| Reviewer from another family | yes: DeepSeek V4.1 Flash writes, GLM 5.3 Flash reviews |
| Reviewer with a clean context | yes: Work Item, diff, pull request description, AGENTS.md and skills; never the writer's transcript |
| Capped fix loop | yes: `maxFixRounds` 2 on bronze, 1 on silver ([Ploeg ADR-0017](../../apps/ploeg/docs/adrs/0017-the-review-loop-is-verdict-driven-and-capped.md)) |
| Writer triages findings | only in prose: the writer is told findings are "evidence to weigh", and its outcome has no answer per finding |
| Cheap check before the writer | decided ([Ploeg ADR-0036](../../apps/ploeg/docs/adrs/0036-stuck-work-reaches-the-owner-as-a-cited-proposal-not-an-agent-decision.md)), not built |
| Planner for vague work | supported ([Ploeg ADR-0031](../../apps/ploeg/docs/adrs/0031-runs-create-work-items-held-for-approval-within-limits.md)), not configured |
| Trial a model on a Role | only by cloning a Team; a second reader's verdict always acts |

## 4. How agents should communicate

- **Through shared artifacts, not messages.** The repository, the pull request and the Work Item are the blackboard ([Ploeg ADR-0011](../../apps/ploeg/docs/adrs/0011-the-pull-request-is-the-blackboard.md)); hand-offs are short structured records (Anthropic reports sub-agent summaries of 1.000–2.000 tokens), not transcripts. Ploeg's outcome drop box and its 8.000-byte briefing already work this way.
- **Protocols each have one job.** MCP connects an agent to tools and data. A2A delegates between organisations. The Agent Client Protocol connects an editor to one coding agent. AG-UI streams agent events to a user interface. The Agent Host Protocol lets several clients watch one host-owned session. None is needed between Roles inside a Team.

## Plan

Ordered by what unblocks what. Costs are model spend; review time is extra.

### A. Measure, with no spend

1. **Run [VIK-1617](https://vikunja.webgrip.dev/tasks/1617) now** on what exists: cost per merged Work Item per Team and model since rc.16, read-only, with the sample size stated.
2. **Record each Run's configuration**: configured model, harness and plan, so a comparison across a config change is not confounded. Ploeg.
3. **Cost and outcome per Work Item on the operator API** ([VIK-1686](https://vikunja.webgrip.dev/tasks/1686)), split by Role and model, with the merge fact as the "accepted" denominator.
4. **Unfold: cost per merged pull request** by Team, Role and model on Insights, as a table.
5. **Pin a price for every model a Ploeg Team, the Ask or a bench uses**, and fail homelab CI when such a model has none.
6. **Check whether a LiteLLM fallback can silently change a Run's model** (Fireworks models fall back to gpt-oss-120b or DeepSeek). If a key's model scope does not block it, turn fallbacks off for Ploeg keys.

### B. Change the Team where it falls short, with no spend

1. **The writer answers each review finding** (accepted, or rejected with a reason) in its outcome, and the next reviewer reads the answers.
2. **Build the premise check** that Ploeg ADR-0036 decided for bronze: a cheap reader before the writer.
3. **A shadow reader**: a reading Role whose verdict is recorded but never starts a fix round, so a reviewer model can be compared on real work.

### C. Bench, with spend the owner approves

1. **Reviewer bench first**: the planted-defect set RB-01 in `ploeg-bench` (Mode B) on GLM 5.3 Flash, Claude Haiku 5.5 and DeepSeek V4.1 Flash, with Sonnet 5.5 as a ceiling. About 20 pull requests × 4 models, roughly US$ 5. The bench scorecard first needs the model per Run.
2. **Builder bench ([VIK-1621](https://vikunja.webgrip.dev/tasks/1621))**: 10 S Work Items each on DeepSeek V4.1 Flash, GPT-6.1 Sol and, if a provider is acceptable, MiMo V2.6 Pro, judged blind ([VIK-1687](https://vikunja.webgrip.dev/tasks/1687)). Roughly US$ 25, within VIK-1621's US$ 40 cap.

Before C: LiteLLM's US$ 10 per day caps for Anthropic and Fireworks are shared with Open WebUI and the brain evaluation, so a bench can be throttled; Claude Haiku 5.5 needs a LiteLLM entry; MiMo V2.6 Pro is not on Fireworks.

### D. Decide and roll out

1. **Model per Role and budget per Size** from A and C ([VIK-1678](https://vikunja.webgrip.dev/tasks/1678), ADR-0006).
2. **A planner Role on a strong model** for vague or large Work Items only, after B2 and C.
3. **Parked:** best-of-two writers (needs a plan change, and only pays if C1 shows a reviewer can pick); swarms; A2A.

[VIK-1651](https://vikunja.webgrip.dev/tasks/1651) still decides which routes may carry client code; every candidate above is own-code only until then.

## Sources

Prices and boards: <https://docs.fireworks.ai/serverless/pricing>, <https://fireworks.ai/pricing>, <https://platform.claude.com/docs/en/about-claude/pricing>, <https://www.vals.ai/benchmarks/terminal-bench-4>, <https://benchlm.ai/benchmarks/swe-bench-pro>, <https://benchlm.ai/coding>, <https://codingfleet.com/blog/swe-bench-pro-leaderboard-2026/>, <https://kilo.ai/leaderboard>.

Models: <https://www.mindstudio.ai/blog/deepseek-v4-1-flash-benchmarks>, <https://www.digitalapplied.com/blog/deepseek-v4-1-flash-pro-routing-prices-early-tests>, <https://www.datacamp.com/blog/glm-5-3-flash>, <https://www.edenai.co/post/glm-5-3-flash-benchmark-vs-gemini-deepseek-gpt-5-6>, <https://trilogyai.substack.com/p/kimi-k3-is-live-pricing-benchmarks>, <https://www.labellerr.com/blog/qwen-3-8-max-vs-kimi-k3/amp/>, <https://noqta.tn/en/blog/minimax-m3-open-weight-frontier-model-developer-guide-2026>, <https://www.eesel.ai/blog/xiaomi-mimo-v2-6-pricing>, <https://www.lindy.ai/blog/gpt-6-1-sol>, <https://www.mindstudio.ai/blog/gemini-3-8-flash-pricing>, <https://www.verdent.ai/guides/model/devstral-2>, <https://www.requesty.ai/models-new/nebius/glm-5.2>, <https://www.requesty.ai/models-new/scaleway/glm-5.2>.

Team shape and communication: <https://www.anthropic.com/engineering/multi-agent-research-system>, <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>, <https://arxiv.org/abs/2606.13003>, <https://beancount.io/bean-labs/research-logs/2026/05/31/single-agent-outperforms-multi-agent-equal-token-budget>, <https://cognition.ai/blog/multi-agents-working> (read through <https://www.zenml.io/llmops-database/multi-agent-systems-in-production-code-generation-and-review-at-scale>), <https://arxiv.org/pdf/2607.28636>, <https://code.visualstudio.com/docs/agents/concepts/agent-host>, <https://zed.dev/blog/claude-code-via-acp>, <https://devtk.ai/en/blog/mcp-vs-a2a-comparison-2026/>.

Older or second-hand: Anthropic's two engineering posts are from 2025; Cognition's post was read through ZenML's summary; aggregator prices are unconfirmed on the vendor's page.
