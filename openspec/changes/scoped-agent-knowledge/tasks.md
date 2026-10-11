# Tasks — scoped-agent-knowledge

## 1. Decisions

- [x] 1.1 System ADR-0034 and ADR-0035 with index rows; ADR-0021 history line; RFC owner decisions of 2026-10-11
- [ ] 1.2 The owner accepts or rejects ADR-0034 and ADR-0035 after the measurement spike VIK-1859 (owner, 2026-10-11; VIK-2004); on accepting ADR-0034, mark ADR-0021 superseded by ADR-0034
- [ ] 1.3 Ploeg ADR-0087 to ADR-0089 decided in ploeg-hq (pull request #107)

## 2. Cluster (Homelab Roadmap, not this repository)

- [ ] 2.1 Two graphs, run and review actors, policies, stored queries and token delivery to ploegd for the default Tenant (VIK-1872)

## 3. Ploeg (ploeg-hq first, then a `ploeg` pin commit here)

- [ ] 3.1 Run reads of scoped knowledge (VIK-1869), Work Item Notes (VIK-1867), Promotions incl. the repository `knowledge/` pull request (VIK-2005), operator knowledge routes (VIK-2006)

## 4. Unfold application

- [ ] 4.1 unfold-mcp knowledge tools (VIK-2007)
- [ ] 4.2 Work Item page shows the knowledge and notes each Run got; Needs you lists Promotions (VIK-1868)

## 5. Gates

- [ ] 5.1 Every pull request runs `mise run verify` and `mise run docs-check` and pastes the output
