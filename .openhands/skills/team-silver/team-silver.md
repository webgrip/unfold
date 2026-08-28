---
name: team-silver
description: >-
  The Team Silver delivery discipline for a single OpenHands agent working the
  ploeg repo itself: phased delivery, the Go/Helm gate set run before every PR
  update, an explicit adversarial self-review pass focused on failure paths
  (this repo moves money via per-run LLM keys), and the release-train rules.
---

<!--
  FILENAME IS LOAD-BEARING. This is a legacy-format OpenHands repo skill: a
  plain `.md` (NOT `SKILL.md`) with no `triggers`. The SDK partitions it into
  `repo_skills` → injected into REPO_CONTEXT on *every* run — the discipline
  is guaranteed. An AgentSkills-format `SKILL.md` would land in
  `<available_skills>` (progressive disclosure) and only reach the model if
  invoked — optional discipline defeats the purpose. Do NOT rename to SKILL.md.
-->

# Team Silver — discipline for a single agent on webgrip/ploeg

You are running a Vikunja ticket end to end as one agent, on the dispatch
plane's own codebase. Mistakes here don't break one app — they break the
factory that ships every app, and this code mints budgeted LLM keys (real
money). Read `AGENTS.md` first; its rules override this file where they
conflict.

## Phases (do them in order, announce each)

1. **Scope.** Check the ticket's Definition of Ready against the live repo:
   problem + evidence, verifiable acceptance criteria, exact gate commands.
   If it isn't ready, stop and say what refinement it needs — do not invent
   scope. State the blast radius (files you'll touch) before editing.
2. **Read before write.** Trace the code path you're changing end to end
   (e.g. worker: claim → clone → agent subprocess → outcome report; note that
   `exec.CommandContext` SIGKILLs the child on context cancel). Quote the
   lines you rely on in your notes.
3. **Build** on `agent/vik-<id>` branched from `development`. Small commits,
   conventional messages, `VIK-<id>` trailer. A bug fix includes a regression
   test that fails on the unfixed code — prove it by running the test against
   the original code path first if feasible.
4. **Gates** (from AGENTS.md) before opening AND before every update of the
   PR. In a dispatched run there is no docker daemon and no Go toolchain in
   the harness (homelab-cluster ADR-0053: the agent plane is daemonless), and
   the sandbox has no registry egress — a `docker pull` of golang or any
   other image times out by design, so never retry one. A gate you cannot
   run is CI's job: push the branch, let CI run the gate set on the PR, note
   "gates left to CI: …" in the PR body, read the pipeline result through
   the forge, and iterate until green. Running locally with the toolchains
   installed, run them directly. Either way, paste the evidence (gate output,
   or the CI run link + status) — reviewers reject unverified claims, and
   claiming a gate you never saw run is worse than reporting you could not
   run it.
5. **Adversarial self-review** (you have no independent judge in-run, so
   simulate one, then say honestly what a real reviewer should re-check):
   - Failure paths first: does your cleanup run on *every* return, including
     subprocess kill, timeout, and error branches? `defer` beats trap; what
     defeats `defer` (hard pod kill) and what backstops it (key TTL)?
   - Money paths: can a code path mint without revoking? Can an alias drift
     from `ploeg-<12hex>`? (Dashboards join on it.)
   - Concurrency: store transactions, `SKIP LOCKED` claims, lease renewal
     loop — did you introduce a race or a blocking call in the renew path?
   - Does `helm template` still render with `ci/executor-values.yaml`?
6. **PR.** Title = conventional commit subject. Body: what/why, evidence
   (gate output), risk notes from your self-review, `VIK-<id>` reference.
   The tooling may open the PR against `main`; note in the body that the
   correct base is `development` — a human retargets it. Never merge.
7. **Report.** Your outcome summary names the PR link and what a human must
   verify before merge.

## Hard rules

- Never touch `main`, applied `migrations/`, or the release workflows.
- Never print or log secret values (master keys, minted keys, tokens).
- If the task needs more than the ticket's budget or scope allows, stop and
  report `stuck` with the reason — a truthful stuck beats a sloppy PR.
