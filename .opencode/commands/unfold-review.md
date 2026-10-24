---
argument-hint: '[pull request number]'
description: Review a pull request or the current branch against docs/contributing/review.md
---

Review a change to Unfold against the repository's review guide.

1. Find the change. With a pull request number in `$ARGUMENTS`, fetch it with `git fetch origin pull/<number>/head` and diff it against `origin/development`. Without one, diff the current branch against `origin/development` (`git diff origin/development...HEAD`).
2. Read `docs/contributing/review.md` and follow its order exactly. It is the only source of review criteria; do not add your own.
3. Read the `AGENTS.md` nearest each changed file, and the ticket named in the description or the `VIK-<id>` trailer when you can reach it.
4. Check what the tools already decided: the CI result on the pull request, or run `mise run verify` locally. A red check ends the review with that finding.
5. Report findings in the guide's format, blocking ones first, then one verdict. Do not edit files, commit or push.