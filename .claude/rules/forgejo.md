---
paths:
  - ".forgejo/**"
---

# Forgejo workflows

These workflows and actions run on Forgejo Actions, not GitHub Actions. Read [CI and release workflows](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/operations/ci.md) before changing one.

- Turn off a job that calls a reusable workflow through its `enabled` input, never with `if:`. Forgejo ignores the caller's `if:`, and a `with:` that reads a skipped job's outputs fails the whole run with no log ([why](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/operations/ci.md#gating-a-reusable-workflow)).
- A workflow, action or task never prunes, mirrors or deletes refs or pushes notes; `scripts/test_release_refs.py` fails on it.
