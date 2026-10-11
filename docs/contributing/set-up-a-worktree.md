---
type: how-to
audience: [contributor, agent]
owner: unfold
last_verified: 2026-10-11
verified_by: "Ran these steps in a new worktree on 2026-10-11 (mise 2026.9.18): setup, docs-check and verify passed."
---

# Set up a worktree

Several sessions, human and agent, share one checkout of Unfold. Give each session its own worktree so one session's uncommitted work never lands in another's commit.

1. From the shared checkout, fetch and create the worktree on a new branch:

    ```sh
    git fetch origin development
    git worktree add -b fix/short-slug .claude/worktrees/short-slug origin/development
    cd .claude/worktrees/short-slug
    ```

    `.claude/worktrees/` is ignored by Git.

2. Trust the root configuration, then install everything:

    ```sh
    mise trust
    mise run setup
    ```

    `setup` checks out `apps/ploeg` at the pinned commit. If you are moving the pin, commit the new pin before running `setup` again, or it puts the old one back.

3. Prove the worktree works before changing anything: `mise run verify`.

4. When the branch has merged, remove the worktree with `git worktree remove .claude/worktrees/short-slug`.
