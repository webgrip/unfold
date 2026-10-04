---
type: Convention
title: Stage only the paths you wrote
description: Never git add -A, git add . or git commit -a; other sessions share the checkout.
resource: https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/CLAUDE.md
tags: [git, commit, staging]
timestamp: 2026-10-04T00:00:00Z
---

# Stage only the paths you wrote

Name every path you stage. `git add -A`, `git add .` and `git commit -a` are forbidden:
other sessions share this checkout, and a whole-tree commit absorbs their uncommitted work.

Trunk is `development`, and commits are conventional commits.
