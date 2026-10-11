---
type: Fact
title: "Unfold's routes to Ploeg sit under /api/ploeg/"
description: "The Unfold application reaches Ploeg's operator API through its own /api/ploeg/ routes."
resource: https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/src/http.ts
tags: [api, routes, http, ploeg, operator, client, unfold]
timestamp: 2026-10-11T00:00:00Z
---

# Unfold's routes to Ploeg sit under /api/ploeg/

The browser and the MCP tools reach Ploeg through the Unfold server's `/api/ploeg/` routes (`apps/unfold/src/http.ts`), never directly. A client change is checked against Ploeg's published schemas ([ADR-0027](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/docs/adr/adr-0027-unfold-checks-its-ploeg-client-against-ploegs-published-schemas.md)).
