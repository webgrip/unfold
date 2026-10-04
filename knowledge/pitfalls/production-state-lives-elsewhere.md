---
type: Pitfall
title: Production desired state lives in homelab-cluster
description: Never change production desired state as part of a repository refactor.
resource: https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/CLAUDE.md
tags: [deploy, helm, production, homelab, cluster]
timestamp: 2026-10-04T00:00:00Z
---

# Production desired state lives in homelab-cluster

Charts and images are built here, but what runs in production is declared in
`webgrip/homelab-cluster`. A refactor in this repository never changes production
desired state; a deploy change is its own change in that repository.

Each application keeps its package, module, image and chart identities.
