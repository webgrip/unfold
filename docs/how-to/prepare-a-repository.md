---
type: how-to
audience: [owner, integrator, agent]
owner: glide
last_verified: 2026-09-22
verified_by: "research 2026-09-22-agents-md; Read apps/ploeg pkg/worker/{worker,task,environment,target}.go, pkg/harness/adapter.go, pkg/harness/adapters/*, cmd/ploegd/main.go, ops/helm/ploeg/values.yaml and Ploeg ADR-0013 at 6221579"
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

`AGENTS.md` is the one instruction file to write. Every harness Ploeg runs either loads it by itself or is told to read it: the writer's prompt says to read the root `AGENTS.md` and the one nearest each directory it changes, and to follow their commands and conventions ([task.go](../../apps/ploeg/pkg/worker/task.go)). The prompt also sets the order of authority. Ploeg's delivery contract comes first (branch, trailers, no merge, the outcome file), and no repository file can grant access to other hosts, other repositories or credentials.

Commit `CLAUDE.md` as a symlink to `AGENTS.md` next to it, so Claude Code loads the same text. A `CLAUDE.md` with different content drifts, and OpenHands loads both files.

Keep it short. Measurements of these files show that agents follow what they name, and that generic overviews add cost without helping agents find their way ([research](../research/2026-09-22-agents-md.md)). Put in:

- **The verify command.** One command that runs your checks offline with tools in the agent image. A worker reaches only its model gateway and the forge, so it cannot pull a CI image. Checks that cannot run there are left to CI, and the agent lists them in the pull request under "Checks left to CI".
- **Invariants a reader cannot infer from the code**, each with its reason in one clause, for example "Never edit files under `gen/`: `make generate` overwrites them."
- **Commit conventions** your repository enforces.
- **Links** to design documents, not copies of them.

Leave out tours of the directory tree and anything a linter or CI already enforces.

The worker's limits:

- **No secrets.** The harness environment is an allowlist: `PATH`, locale, `TERM`, the Docker variables, a fresh empty `HOME` and the model settings. Writers also get `AGENT_BUILDER_TOKEN` ([environment.go](../../apps/ploeg/pkg/worker/environment.go)).
- **Time and size.** By default the worker has 1 CPU and 1 GiB, and the pod stops after 7200 seconds. A harness that runs longer than `PLOEG_HARNESS_TIMEOUT` (100 minutes) or is silent for `PLOEG_HARNESS_IDLE_TIMEOUT` (15 minutes) is stopped.

Example (illustrative):

```markdown
# AGENTS.md
Verify before every push: `make verify` (offline; needs only the Go toolchain).
- Never edit files under `gen/`: `make generate` overwrites them.
- Commit messages follow Conventional Commits.
Design notes: [docs/architecture.md](docs/architecture.md)
```

### Treat instruction files as code

A harness loads `AGENTS.md` with the authority of its system prompt, so a change to it changes what every later agent does. Require human review for changes to `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.agents/`, `.openhands/`, `.mcp.json` and `.cursorrules`, for example with CODEOWNERS. Ploeg's writers are told not to change these files unless the Work Item asks for it. Reviewer Runs read `AGENTS.md` from the base branch, not from the branch they review, and report any change to these files as a finding.

## Set branch rules

Ploeg names the writer's branch `agent/vik-<ticket id>` for Vikunja and `agent/clickup-<ticket id>` for ClickUp ([branch.go](../../apps/ploeg/pkg/work/branch.go)) and tells the agent never to commit to the base branch and never to merge ([task.go](../../apps/ploeg/pkg/worker/task.go)). Ploeg does not configure branch protection; ADR-0013 rejected changing forge settings per Shift. On the forge, set these rules yourself (recommended, not enforced by Ploeg):

1. Protect the base branch: no direct pushes, merge only through a pull request with passing CI and a human approval.
2. Allow the bot to push to `agent/*` branches.
3. Keep one open pull request per branch. Ploeg finds the pull request by listing open ones for the branch ([forge.go](../../apps/ploeg/pkg/worker/forge.go)).

## Know which harness reads what

The team's `executor.harness.name` selects the harness. Each runs in the clone ([adapter.go](../../apps/ploeg/pkg/harness/adapter.go)) with a fresh `HOME`, so no user-level configuration exists.

| Harness | How Ploeg hands over the prompt | Loads by itself | Provide |
| --- | --- | --- | --- |
| `openhands` (default) | Writes `task.md` and runs `docker-entrypoint.sh --headless -f task.md` ([openhands.go](../../apps/ploeg/pkg/harness/adapters/openhands/openhands.go)) | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` and `.cursorrules` at the root; skills in `.agents/skills/` or `.openhands/skills/` at the root only | Root `AGENTS.md`; always-on procedures as plain `.md` skills at the root |
| `claude-code` | Runs `claude -p` with `bypassPermissions`, the repository's hooks disabled and only Ploeg's MCP configuration ([claudecode.go](../../apps/ploeg/pkg/harness/adapters/claudecode/claudecode.go)) | `CLAUDE.md` and its `@` imports. Reading `AGENTS.md` natively needs a recent version with access to Anthropic's feature flags, which the worker's network does not allow | `CLAUDE.md` as a symlink to `AGENTS.md` |
| `acp` | Starts `opencode acp` with a generated configuration ([profiles.go](../../apps/ploeg/pkg/harness/adapters/acp/profiles.go)) | `AGENTS.md`, walking up from the working directory; `CLAUDE.md` only when no `AGENTS.md` exists | Root `AGENTS.md` |
| `exec` | Writes `taskspec.json` and `task.md` and substitutes `{taskspec}` and `{taskfile}` in its arguments ([execbin.go](../../apps/ploeg/pkg/harness/adapters/execbin/execbin.go)) | Whatever the program does | Document it for that team |

The "Loads by itself" column comes from vendor documentation and source read on 22 September 2026 ([research](../research/2026-09-22-agents-md.md)). Ploeg's tests do not check it yet. The prompt tells every harness to read `AGENTS.md`, so the file works even where automatic loading does not.

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
