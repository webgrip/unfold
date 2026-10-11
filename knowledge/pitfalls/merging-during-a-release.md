---
type: Pitfall
title: "Merging while a release runs ships untested code"
description: "A merge during a running release job cancels the runs that would test it, and the release tags the new head."
resource: https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/operations/ci-troubleshooting.md
tags: [merge, release, development, ci, pull request, rc]
timestamp: 2026-10-11T00:00:00Z
---

# Merging while a release runs ships untested code

On 2026-10-10 a merge landed while the `release` job of an earlier push was running. The merge cancelled its own pull request run and the next push run, and the release tagged the new head, so rc.56 shipped a change that only one local run had checked. Wait for the running release job to finish before merging. See [Troubleshoot CI and releases](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/operations/ci-troubleshooting.md).
