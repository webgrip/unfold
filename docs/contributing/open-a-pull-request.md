---
type: how-to
audience: [contributor, agent]
owner: unfold
last_verified: 2026-10-11
verified_by: "AGit push options used for pull requests #223, #224 and #308 on forgejo.webgrip.dev; the re-push behaviour observed on #206."
---

# Open a pull request

1. Run `mise run verify` (and `mise run docs-check` after a docs or `AGENTS.md` change) and keep the output for the description.
2. Write the description from the [template](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/.forgejo/pull_request_template.md): what changed and why, the ticket, how you verified it, and the risk areas from the [review guide](review.md) that it touches.
3. Push. With a Forgejo account, push the branch and open the pull request in the web interface. Without a token, open it over SSH with AGit; push options cannot contain newlines, so the description goes base64-encoded:

    ```sh
    git push origin HEAD:refs/for/development \
      -o topic=fix/short-slug \
      -o title="fix(unfold): short summary" \
      -o "description={base64}$(base64 -w0 description.md)"
    ```

4. To update an AGit pull request, push again to `refs/for/development` with the same `topic` and `-o force-push=true` when you rewrote history. A re-push updates the commits but not the title or description; change those in the web interface. Never push the branch itself as well: that creates a second, stray branch.
5. Stack a dependent change as its own pull request with its own topic, and say in its description which pull request it builds on.
