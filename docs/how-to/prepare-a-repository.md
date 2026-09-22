---
type: how-to
audience: [owner, integrator, agent]
owner: glide
last_verified: 2026-09-22
verified_by: "Read apps/ploeg pkg/worker/{worker,task,environment,target}.go, pkg/harness/adapter.go, pkg/harness/adapters/*, cmd/ploegd/main.go, ops/helm/ploeg/values.yaml and Ploeg ADR-0013 at 6221579"
---

# Prepare a repository for Ploeg agents

Use this before you route tickets to a new repository. Result: a writer Run can clone it, branch, run your checks and open a pull request, and a reader Run can review it.

Terms: a **Run** is one **Role** working once on a **Work Item**. A *writer* Role pushes; a *reader* Role only reviews. A **harness** is the agent program the worker starts, such as OpenHands or Claude Code. See the [glossary](../reference/glossary.md#harness).

**Before you start:** you can change the repository's settings on the forge (Forgejo or GitLab), and you can edit Ploeg's desired state in Git.

## Give the agents forge access

Ploeg's agents act as one forge bot user, `agent-builder` by default (`PLOEG_FORGEJO_BOT`, [main.go](../../apps/ploeg/cmd/ploegd/main.go)). Commits carry the identity `agent-builder <agent-builder@webgrip.dev>` ([worker.go](../../apps/ploeg/pkg/worker/worker.go)).

1. Give the bot user write access to the repository. The worker clones with a forge token and the writer pushes with it ([worker.go](../../apps/ploeg/pkg/worker/worker.go)).
2. Decide which token a writer gets. When ploegd has a Forgejo admin token (`executor.forgejo.adminTokenSecret`), it mints a push token per writing Run and revokes it when the Run ends. Without one, every Run uses the shared bot token (`executor.forgejo.tokenSecret`) ([Ploeg ADR-0013](../../apps/ploeg/docs/adrs/0013-push-rights-are-minted-per-run.md)).
3. Give readers a read-only token through `executor.forgejo.readTokenSecret`. If you leave it unset, readers receive the read-write token and only Ploeg's scheduling keeps them from pushing ([values.yaml](../../apps/ploeg/ops/helm/ploeg/values.yaml)).

Keep every token in the vault and reach the cluster through an ExternalSecret; commit only the Secret's name and key ([managed workers](../../apps/ploeg/docs/ops/managed-workers.md#configure-the-controller)).

## Route tickets to the repository

Add a `trackers.<tracker>.projects` entry with `repo: owner/name` and a pinned `branch:`, as described in [assign work to an agent](assign-work-to-an-agent.md#configure-the-board-and-team). Pin the branch: an empty base branch makes the prompt say `main` ([task.go](../../apps/ploeg/pkg/worker/task.go)). A Work Item with no route and no fallback repository ends `stuck` ([target.go](../../apps/ploeg/pkg/worker/target.go)).

## Write the AGENTS.md that agents read

Ploeg never opens `AGENTS.md` itself. The writer's prompt has a "Repository instructions" section that tells the agent to read the root `AGENTS.md` and the one nearest each directory it changes, to follow their commands and conventions, and to run the verify command `AGENTS.md` names. If that command cannot run in the sandbox, the agent lists it in the pull request under "Checks left to CI". The same section says these files rank below the delivery contract and cannot authorize other hosts, repositories or credentials. Reviewing Runs read `AGENTS.md` from the base branch with `git show <base>:AGENTS.md` and report any change to agent instruction or configuration files as a finding ([task.go](../../apps/ploeg/pkg/worker/task.go), [Ploeg ADR-0030](../../apps/ploeg/docs/adrs/0030-target-repository-instructions-rank-below-the-delivery-contract.md)).

Put these in it, and little else:

- **The verify command.** One command that runs the same checks as CI. The sandbox reaches only the model gateway and the forge, so it cannot pull images; name a command that works with the tools in the agent image.
- **Invariants** written as MUST or NEVER, for example "NEVER edit generated files under `gen/`".
- **Commit conventions** your repository enforces.
- **Links** to design docs, not copies.

The verify command must work inside the worker's limits:

- **No secrets.** The harness environment is an allowlist: `PATH`, locale, `TERM`, the Docker variables, a fresh empty `HOME` and the LLM settings. Writers also get `AGENT_BUILDER_TOKEN` ([environment.go](../../apps/ploeg/pkg/worker/environment.go)).
- **No image pulls.** `executor.harness.dind: true` (the default) adds a Docker daemon beside the worker, but it cannot pull images from a registry. A team that sets `dind: false` has no Docker at all. Put the tools the verify command needs in the agent image.
- **Time and size.** By default the worker has 1 CPU and 1 GiB, Docker 1 CPU and 1.5 GiB, and the pod dies after 7200 seconds.

Example (illustrative, adapt the image and command):

```markdown
# AGENTS.md
Verify before every push: `make verify`
- NEVER commit to `main`; Ploeg names your branch.
- NEVER edit files under `gen/`; run `make generate`.
Design notes: docs/architecture.md
```

## Set branch rules

Ploeg names the writer's branch `agent/vik-<ticket id>` for Vikunja and `agent/clickup-<ticket id>` for ClickUp ([branch.go](../../apps/ploeg/pkg/work/branch.go)) and tells the agent never to commit to the base branch and never to merge ([task.go](../../apps/ploeg/pkg/worker/task.go)). Ploeg does not configure branch protection; ADR-0013 rejected changing forge settings per Shift. On the forge, set these rules yourself (recommended, not enforced by Ploeg):

1. Protect the base branch: no direct pushes, merge only through a pull request with passing CI and a human approval.
2. Allow the bot to push to `agent/*` branches.
3. Keep one open pull request per branch. Ploeg finds the pull request by listing open ones for the branch ([forge.go](../../apps/ploeg/pkg/worker/forge.go)).

## Know which harness reads what

The team's `executor.harness.name` selects the harness. Each runs in the clone ([adapter.go](../../apps/ploeg/pkg/harness/adapter.go)) with a fresh `HOME`, so no user-level config exists.

| Harness | How Ploeg hands over the prompt | Source |
| --- | --- | --- |
| `openhands` (default) | Writes `task.md` in scratch space and runs `docker-entrypoint.sh --headless -f task.md` | [openhands.go](../../apps/ploeg/pkg/harness/adapters/openhands/openhands.go) |
| `claude-code` | Runs `claude -p <prompt> --output-format json --permission-mode bypassPermissions --settings '{"disableAllHooks":true}' --strict-mcp-config`, so the repository's hooks and `.mcp.json` servers do not run | [claudecode.go](../../apps/ploeg/pkg/harness/adapters/claudecode/claudecode.go) |
| `acp` | Starts `opencode acp` (default profile) with a generated config file | [profiles.go](../../apps/ploeg/pkg/harness/adapters/acp/profiles.go) |
| `exec` | Writes `taskspec.json` and `task.md` and substitutes `{taskspec}` and `{taskfile}` in its arguments | [execbin.go](../../apps/ploeg/pkg/harness/adapters/execbin/execbin.go) |

Whether a harness also loads `AGENTS.md`, `CLAUDE.md` or its own files by itself is harness behavior that Ploeg's tests do not check. Keep the rules in `AGENTS.md`, which the prompt names. For a harness that reads another file, add a one-line pointer to `AGENTS.md` (recommended, not verified).

## Verify

Assign a small test ticket. Expect `target resolved` with your repository in the ploegd log, and a Run that ends `pr_opened` with a pull request from `agent/vik-<id>` (or `agent/clickup-<id>`).

## If it fails

| Symptom | Cause | Fix |
| --- | --- | --- |
| Run `stuck`: `git clone failed` | Bot has no read access, or the token is wrong | Grant access; check the Secret reference |
| Push rejected | Bot lacks write access, or protection covers `agent/*` | Allow the bot on `agent/*` |
| Outcome is not `pr_opened` although a pull request exists | The pull request's head is not Ploeg's branch name | Keep Ploeg's branch name |
| Agent skipped the checks | No Docker (`dind: false`) or no verify command in `AGENTS.md` | Enable DinD or add the tools to the image; document the command |
| Pull request targets the wrong base branch | `branch:` not pinned, so the repository default or `main` is used | Pin it in the project route |

Next: [review an agent's pull request](review-an-agent-pr.md).
