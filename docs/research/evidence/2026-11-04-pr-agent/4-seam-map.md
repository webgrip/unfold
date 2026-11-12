# Seam map: where an AI pull-request reviewer touches Unfold and Ploeg

4 November 2026, read-only sweep of this repository at `21a939d5` with Ploeg's contract bundle at `v0.2.0-rc.50` (commit `a78d7021`). `.build/` and `.claude/worktrees/` duplicates were excluded. Paths are relative to the repository root.

## 0. Bottom line for fit

- Ploeg already runs an AI reviewer: a reading Role in a Team's plan. It runs as a sandboxed Run with a **full checkout**, not an injected diff. It returns a `verdict`, which drives a capped fix loop. Ploeg posts the findings as **one summary comment per Role** on the pull request and **no inline comments**.
- Ploeg has **no diff compression and no token budgeting for review**. The only diff byte cap, `provider.MaxDiffBytes = 1 MiB`, serves delivery facts, not reviewer context. The prompt has byte budgets for briefing sections (8000, 2000 and 4000 bytes, and 12 KiB for a pull request body), not for the diff.
- Diff Limit and Attention Path are **documented but not implemented** (system ADR-0010 says "Not implemented yet"). Walkthrough is proposed only.
- Zero references to PR-Agent, Qodo, Greptile or "code review bot". Forgejo CI on pull requests has no AI review step.
- A third-party reviewer would collide with these seams:
  - The human-review webhooks: a `changes_requested` review from a login outside Ploeg's bot list can trigger rework.
  - The Run Card review facts.
  - The LiteLLM per-key budget model.
  - The persistent-comment convention: the `<!-- ploeg:usage-report -->` marker.

## 1. The review loop in Ploeg

### ADRs (`apps/ploeg/docs/adrs/`)

- **0017** (proposed, implemented). A reading Role returns `verdict: approve | request_changes`.
  - `request_changes` re-opens the plan's last writer, then the review Round.
  - Bounds are checked in this order: verdict, then pool (ADR-0012), then `maxFixRounds` (default 2).
  - Rejected option: "Diff-based looping — re-run the reviewer until it reports no findings".
- **0042** (proposed, implemented). The writer reports `problem` and `solution` (at most 4096 characters each) and starts its pull request description with them. Unfold shows a "Problem and solution" card.
  - Rejected: Vloer reading the description from the forge.
  - Rejected: a separate summarizing Role, because it costs a Run per item. This is the `/describe` seam.
- **0043** (accepted). A failed reader is retried. When its attempts are exhausted, the Shift closes `review_failed`. It cites a reviewer cap of US$ 0,40 (bronze) against US$ 2,00 for the builder.
- **0070** (accepted, superseded by 0119). The worker verifies a fresh clone at the pull request head before review.
- **0096** (proposed, implemented). A `shadow: true` reading Role reviews the same pull request in the same Round. Its verdict and findings are recorded and never act. It exists to compare reviewer models.
- **0109** (proposed, implemented). Pull Request Reading.
  - Routing: `targets.<key>.readPullRequests[]` with `authors`, `team`, `instructions`, `maxOpen` (default 5) and `maxReviewsPerPullRequest` (default 3).
  - Readers only, on the pull request's own branch. Findings are posted as a comment, and the verdict opens no fix Round.
  - Triggered by `pr_opened` and `pr_synchronized`, plus a reconcile every 10 minutes.
  - The pull request is read again only when its title changes, and each reading posts a new comment.
- **0119** (accepted). `awaiting_review` requires the forge's combined status at the head to be `success`.
- **0121**. Structured `findingItems[] {id, severity blocking|should_fix|nit, title, body, path, line}`. The writer answers each with `findingAnswers[]`.
- **0124** (accepted). A blackboard of four owners: the forge, Ploeg, Omnigraph and the tracker. Briefing sections have fixed byte budgets (findings 8000 bytes, newest first).
- **0125** (proposed). Walkthrough.

### Engine and prompt

- `apps/ploeg/pkg/shiftengine/reviewloop.go`: `nextFixRound`, `fixRoundBounds`, `reviewPending` (a pending human `changes_requested` forces a fix Round) and `approves` (excludes shadows).
- `apps/ploeg/pkg/work/pullrequest.go`: `PullRequestReads`, `DefaultPullRequestReadInstructions` and `MaxPullRequestBodyBytes = 12 * 1024`.
- `apps/ploeg/pkg/taskprompt/prompt.go`:
  - `Compose()`. Its reader branch is at lines 81–135.
  - `writeReadPullRequestContract()` (lines 212–255).
  - `writeReaderRepositoryInstructions()` (line 385): a reader must never approve a change to AGENTS.md, CLAUDE.md or `.claude/`.
- `findings.go` and `limits.go` in the same package.
- The embedded skills `ploeg-review-against-work-item`, `ploeg-read-a-pull-request` and `ploeg-verify-before-handoff` are listed in `apps/ploeg/files.txt:734-736`. Their SKILL.md files are not unpacked in the bundle.

### Context a reviewer Run gets

1. A full checkout on the branch under review, with the base present (`apps/ploeg/pkg/worker/review.go` `checkoutBranchUnderReview`).
2. The diff is not injected. The prompt says: `"git diff <base>...<head>" is the change under review. READ it.` (prompt.go:87, :221).
3. The rest of the prompt carries:
   - the Work Item;
   - the Run limits;
   - a context index (4000 bytes);
   - the OpenSpec change;
   - the findings (8000 bytes);
   - questions;
   - active work (2000 bytes);
   - knowledge;
   - the pull request link.
4. The writer's problem and solution are not injected. The reader sees them only through the pull request description.
5. The reader has no forge token. Ploeg publishes its findings.

### Diff size, token budget and compression

- No reviewer diff truncation, compression or token budget exists.
- `apps/ploeg/pkg/provider/activity.go:22-24` defines `MaxDiffBytes = 1 << 20`, used by `PullRequestDiffReader`.
  - Its only caller is `apps/ploeg/pkg/httpapi/play_pipeline.go:124`, which feeds the Run Card indentation metrics in `pkg/diffmeasure`.
  - It does not feed the reviewer.
- Diff Limit: zero code hits in `apps/ploeg` or `apps/unfold/src`.

## 2. How review output reaches the forge

- `apps/ploeg/pkg/shiftengine/publish.go`:
  - `publishRound` posts one conversation comment per acting reading Run per Round. Shadows are filtered.
  - `findingsComment` formats it.
  - `publishUsageReport` edits one comment in place, keyed by `<!-- ploeg:usage-report -->`.
- **Summary only.** `apps/ploeg/pkg/provider/forgejo/forgejo.go:65-71` posts through the issues endpoint on purpose.
- `ForgeProvider` has no submit-review method and no inline-comment method. Ploeg does read inline review comments (`ActivityReviewComment`).
- Known weakness: [code-quality review](../../2026-10-02-code-quality-review.md) F15 (VIK-1728). Comments are best-effort and can be duplicated. The proposed fix is an outbox with deterministic markers.
- Forge Event kinds (`apps/ploeg/pkg/provider/provider.go:112-128`): `review_submitted`, `check_failed`, `merge_state_dirty`, `pr_merged`, `pr_closed`, `pr_opened` and `pr_synchronized`.
- `apps/ploeg/pkg/httpapi/forge_followup.go` `reworkOnChangesRequested` ignores only actors in `ForgeBots` (`apps/ploeg/cmd/ploegd/main.go:540`, from `PLOEG_FORGEJO_BOT` with default `agent-builder`). **A third-party review bot's `changes_requested` would re-queue the Work Item unless its login is listed there.**
- `apps/ploeg/pkg/httpapi/pull_request_facts.go:24` records every submitted review as a delivery fact. That fact feeds the Run Card review inputs, and bot logins are reported as `botLogins`.
- `apps/ploeg/docs/backlog.md:31` (item 9): external review text is a prompt-injection carrier and must be treated as untrusted.

## 3. Unfold side

- Unfold reads Ploeg's operator API (`apps/unfold/src/ploeg.ts`) and never reads the forge.
- Verdicts are shown in `apps/unfold/public/core/states.js:89-96`. Human reviews are a separate table, "Never an agent verdict".
- The review box and the problem-and-solution card are in `apps/unfold/public/ploeg.js:804-844` and `:889-927`.
- The disagreement card is in `apps/unfold/public/blackboard-view.js` (`disagreementsMarkup`, line 121). It shows acting vs shadow verdicts per Round, and only what differs (PR #526).
- The findings card is `findingsMarkup` (line 153), with a fold for shadow findings.
- Walkthrough has no code. It is proposed in `apps/unfold/docs/adrs/0054-…` and `openspec/changes/add-review-walkthrough/`.
- Attention Path appears only as a Run Card rarity rule (`apps/unfold/src/cards/rarity.ts`). Diff Limit has zero hits.
- The human review procedure is in `docs/how-to/review-an-agent-pr.md`.
- The review criteria are in `docs/contributing/review.md`.
- Interactive review is `/unfold:review` (`.claude/commands/unfold/review.md`).

## 4. Model access

- ADR-0008: LiteLLM is the credential and metering seam.
- ADR-0012: two-level budgets.
- ADR-0039: a Run calls only its Role's model.
- ADR-0041: the OpenAI Agents API is rejected because there is no per-Run key.
- ADR-0078: MCP goes through the gateway.
- ADR-0111: a spent shared budget becomes `shared_budget_spent`.
- `apps/ploeg/pkg/llmbroker/litellm.go:40-82` refuses an uncapped key.
- `apps/ploeg/pkg/worker/llmproxy.go` gives the harness a placeholder key.
- Precedent for a model caller outside a Run: `apps/unfold/src/config.ts:186-230`.
  - `decider` and `cardThemes.ai` take an OpenAI-compatible `baseUrl` and their own virtual key.
  - The master key is refused, and requests are rate-limited.
- **Implication.** An external reviewer needs its own capped virtual key, ideally in its own LiteLLM team. Its spend stays outside the Shift pool and Run Cards.

## 5. Grep for third-party reviewers

| Term | Hits |
| --- | --- |
| pr-agent, pr_agent, qodo, greptile, "code review bot" | 0 |
| coderabbit | 2, both pricing only, in `docs/research/evidence/2026-09-29-agency-pricing/competitors-and-white-label.md:61,91` |
| Copilot code review | billing only, same file, line 24 |
| codium | VSCodium only (the editor) |

There are no hits in `.forgejo/`.

## 6. CI on Forgejo pull requests

- `.forgejo/workflows/on_pull_request.yml` runs `checks`, `warnings`, `opencode-contract`, `ploeg-pin`, `ploeg-docs` and `release-policy`. None calls a model.
- The "Unfold review questions" check promised by `docs/adr/adr-0010-pull-requests-are-small-whole-and-explained.md` does not exist.
- semantic-release generates changelogs from conventional commits.

## 7. Roadmap, backlog and research

- `docs/adr/adr-0010-pull-requests-are-small-whole-and-explained.md` (accepted, not implemented). It overlaps PR-Agent `/describe`, `/review` and labels:
  - Diff Limit per Size: S 150 lines / 5 files, M 400 / 12, L 800 / 25.
  - A what/why/how description with one line per file.
  - Attention Paths that label the pull request and list those files first.
  - 3–5 reviewer questions as a blocking check.
- `docs/landscape/bottlenecks.md`: review capacity is the named constraint. "Human time per accepted result" is a metric.
- `docs/research/2026-10-11-agentic-models-and-topology.md`: one writer plus one other-family clean-context reviewer. Next step is the reviewer bench RB-01 (planted defects).
- `docs/research/2026-10-11-cost-per-merged-work-item.md`: bronze costs US$ 1,04 per merged Work Item. The reviewer spent US$ 0,56 over 5 Runs.
- `apps/ploeg/docs/backlog.md`:
  - item 9: review text is untrusted;
  - item 110: record which commit a reviewer read.
- ADR-0109 Consequences: "a keyed comment edited in place … is one step away".
- Nothing on reviewer noise or false-positive rate, and nothing on AI changelog generation.

## 8. Glossary terms

The terms are in `docs/reference/glossary.md`:

- Attention Path (79)
- Diff Limit (98)
- Evidence (101)
- Follow-Up (104)
- Forge Event (106)
- Pull Request Reading (135)
- Review (145), which for code is a person's review
- Shadow Role (155)
- Size (157)
- Verdict (176)
- Walkthrough (178), proposed
