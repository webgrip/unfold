---
paths:
  - "mise.toml"
  - "mise.lock"
  - "apps/*/mise.toml"
---

# mise tool versions

The root `mise.lock` is committed and CI installs with `--locked`, which fails on a tool version the lockfile does not hold. A tool named in several `mise.toml` files carries the same version in each. After adding or changing a tool version, run `mise install` from the repository root and commit the rewritten `mise.lock` in the same commit. [CI and release workflows](../../docs/operations/ci.md) explains the lockfile.
