# Design — integration registries

## Context

- System ADR-0050 rules 1 and 5, and its list of known violations.
- `apps/unfold/src/tasks.ts`, `links.ts` and `delivery-publisher.ts` hold the
  provider switches; `reports.ts`, `task-handoff.ts`, `task-binding.ts`,
  `ahp/automations.ts`, `cards/assemble.ts`, `linked-sessions.ts`,
  `rich-text.ts`, `engine.ts`, `audit/capture.ts` and `http.ts` compare
  provider names.

## Decisions

- **D1 One registry per seam.** `src/task-providers/`, `src/link-providers/`
  and `src/delivery-publishers/` each hold a `registry.ts` (the interface and
  the lookup), one file per adapter and an `index.ts`, the only place that
  names the adapters. The public functions in `tasks.ts`, `links.ts` and
  `delivery-publisher.ts` keep their signatures and delegate, so callers and
  tests do not change.
- **D2 Messages are built from the registry.** "Only Vikunja and ClickUp tasks
  can be handed to Ploeg" lists the adapters that declare hand-off, in
  registration order, so today's text is unchanged and a new adapter extends
  it.
- **D3 Ploeg's empty provider.** Ploeg names Vikunja Work Items with an empty
  provider on older records. The Vikunja adapter declares itself Ploeg's
  default tracker; the card reference code asks the registry.
- **D4 GitHub and GitLab publishers.** The same lease-guarded `git push` as
  Forgejo, with the token in an HTTP header (`x-access-token` for GitHub,
  `oauth2` for GitLab). GitHub opens a pull request with
  `POST /repos/{owner}/{repo}/pulls`; GitLab opens a merge request with
  `POST /projects/{id}/merge_requests`. Both add the `ai-generated` label
  (GitHub through the issue labels API, GitLab by name on the merge request,
  which creates the label when it is missing).
- **D5 Guard.** `test/integration-registries.test.ts` scans `src/` outside the
  adapter folders for a union of two provider names, a comparison with a
  provider name and a Vikunja reference literal.

## Open Questions

- Whether GitLab and GitHub should gain issue filing for Report a problem
  (GitHub has no issue attachment API).
