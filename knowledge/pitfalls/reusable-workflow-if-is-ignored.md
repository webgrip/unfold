---
type: Pitfall
title: "Forgejo ignores if: on a reusable-workflow caller"
description: "Gate a job that calls a reusable workflow through its enabled input; a skipped job's outputs in with: fail the whole run without a log."
resource: https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/operations/ci.md
tags: [forgejo, workflow, actions, ci, uses, reusable, if, skipped, enabled]
timestamp: 2026-10-11T00:00:00Z
---

# Forgejo ignores if: on a reusable-workflow caller

Forgejo 15.0.2 evaluated a caller's `with:` even when its `if:` was false, and a `with:` that read a skipped job's outputs failed run 456 before any job started. Every caller in `.forgejo/workflows` passes an `enabled` input instead. See [Gating a reusable workflow](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/operations/ci.md#gating-a-reusable-workflow).
