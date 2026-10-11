---
paths:
  - ".forgejo/**"
---

# Forgejo workflows

These run on Forgejo Actions, not GitHub Actions. Read [CI and release workflows](../../docs/operations/ci.md) before changing one.

- Turn off a job that calls a reusable workflow through its `enabled` input, never with `if:`. Forgejo ignores the caller's `if:`, and a `with:` that reads a skipped job's outputs fails the whole run with no log ([why](../../docs/operations/ci.md#gating-a-reusable-workflow)).
- A workflow, action or task never prunes, mirrors or deletes refs or pushes notes; `scripts/test_release_refs.py` fails on it.
