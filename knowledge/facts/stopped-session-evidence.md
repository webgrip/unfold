---
type: Fact
title: "A stopped session is investigated from evidence"
description: "investigate-session lines up Unfold, Ploeg and cluster evidence for the stop window, read-only."
resource: https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/docs/operations/live.md
tags: [session, stopped, interrupted, authority, reconciliation, heartbeat, live, incident]
timestamp: 2026-10-11T00:00:00Z
---

# A stopped session is investigated from evidence

"Execution authority lost" only says Unfold stopped trusting its Ploeg binding, not which side failed. `python3 .agents/skills/investigate-session/scripts/investigate.py <session-id-prefix>` collects the evidence; the skill of the same name matches it against known failure classes.
