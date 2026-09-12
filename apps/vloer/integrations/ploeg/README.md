# Ploeg foundation patch

This directory contains a reviewable Ploeg patch for PV-013, PV-015 and PV-074. It is source-reviewed and applies cleanly to the stated baseline. **Go compilation, formatting, embedded PostgreSQL tests and hosted CI remain unqualified.** Do not treat successful patch application as successful execution.

| Reference | Value |
| --- | --- |
| Upstream | https://forgejo.webgrip.dev/webgrip/ploeg |
| Baseline | `67c4bc968455a99ef767bc8a24791ea1a87319cb` |
| Candidate | `6c3e4f8c10e07dcf7f54e549bd10107a1faba1fb` |
| Local candidate branch | `agent/vloer-dogfood-foundations` |
| Patch | [0001-dogfood-foundations.patch](patches/0001-dogfood-foundations.patch) |
| Distribution | Included here; no upstream branch, PR, deployment or tracker mutation was published |

The patch preserves authoritative ClickUp List scope, rejects conflicting event scope before routing, authenticates forge deliveries before reserving delivery IDs, rejects raw payloads above the existing one-MiB limit, and requires successful explicit approval from every configured final reader. It also makes the PR handoff wording truthful and includes regression tests and OpenSpec/evidence documents.

## Apply for review

Use a clean Ploeg checkout containing the baseline. Keep unrelated work in its existing branch or worktree. Replace the example patch path with the actual extracted repository path:

```sh
git switch -c review/vloer-foundations 67c4bc968455a99ef767bc8a24791ea1a87319cb
git am /absolute/path/to/de-vloer/integrations/ploeg/patches/0001-dogfood-foundations.patch
```

For a newer upstream revision, review conflicts and intervening changes explicitly. If `git am` stops, resolve the specific conflict or use `git am --abort` to abandon that application. Do not force-reset unrelated work. Patch application was verified in a disposable checkout: all 22 resulting files matched the candidate exactly.

## Required before acceptance

Run Ploeg's existing `.forgejo/workflows/on_pull_request.yml` gates with Go 1.25 or newer, Helm and a non-root PostgreSQL-capable test environment. The patch's `docs/research/2026-09-09-dogfood-foundation-fixes.md` records the exact commands and old-code regression procedure. It includes build, vet, full tests, all chart renderings, goldens and brand checks. The Go toolchain download in this preparation environment was cancelled by its network approval step; no passing Go result is claimed.

PV-013 still needs durable rejection audit and connection-scoped identity. PV-015 does not add a new HTTP media-type policy or fix PV-016's transactional inbox/crash window. PV-074 retains existing budget/cap ordering and sends incomplete review to `needs_human`; it does not establish independent trusted verification. Worker management-key isolation, worker authentication, crash accounting and fenced publication remain separate prerequisites.

The [implementation progress record](../../docs/operations/implementation-progress.md) distinguishes locally verified Vloer behavior from this Ploeg candidate. The tracker remains authoritative after import; a plan ID or patch file grants no execution or merge permission.
