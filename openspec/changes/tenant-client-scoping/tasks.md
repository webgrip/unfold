# Tasks — tenant-client-scoping

## 1. P1.2 Tenant and Client in config

- [x] 1.1 `tenant` and `client` on `repositories[]` and `taskSources[]`, validated as Tenant and Client ids
- [x] 1.2 Repository and task source keys; one key for two owners fails startup naming both entries
- [x] 1.3 A source fits its repository's owner
- [x] 1.4 Chart values comment and values schema
- [x] 1.5 Operations docs: task connections and live operation

## 2. P1.3 Enforcement behind `tenancy.enforce`

- [ ] 2.1 `tenancy.enforce` setting, default off, in config, chart schema and docs
- [ ] 2.2 Sources, tasks, lookup, imports, hand-off, bootstrap, agent host folders and session creation filtered before any service-token read; 404 outside
- [ ] 2.3 Work Items, Now, Proposed, Runs and one-item reads filtered by the target repository's owner
- [ ] 2.4 Delegated credentials narrowed to the memberships the lowered role allows
- [ ] 2.5 ADR-0017 Confirmation tests: Tenant A against B, Client X against Y, flag off byte-identical
- [ ] 2.6 Describe the generic Ploeg contract this needs, in Ploeg's words, in the pull request
