# Design — Jira tracker

## Context

- The task provider registry in `apps/unfold/src/task-providers/` (change
  `integration-registries`).
- Jira Cloud REST API v3. `GET /search` was removed in favour of
  `GET /search/jql`, which pages with `nextPageToken` and has no `startAt`.
- The pinned Ploeg contract: `pkg/provider` has `vikunja`, `clickup` and
  `githubissues` trackers; `gitlab` is a forge only. `GET /operator/teams`
  reports `assignees` from `teams.<team>.assignees` and `PLOEG_TEAM_MAP`,
  while the GitHub tracker routes by `PLOEG_GITHUB_TEAM_MAP` and a
  `ploeg:<team>` label.

## Decisions

- **D1 The issue key is the task id.** `GET /issue/{key}` takes it, people
  write it, and it is the reference (`{ native: true }`). A moved issue gets a
  new key, which Unfold reports as `task_moved` instead of following it.
- **D2 Page tokens are remembered.** Unfold's task list pages by number. The
  adapter keeps the `nextPageToken` of every page it read (bounded) and walks
  at most ten pages from the nearest known one; further is refused.
- **D3 ADF becomes escaped HTML.** The description is rendered to HTML with
  every text escaped and only `http`, `https` and `mailto` links, so the
  existing HTML-to-Markdown display path shows it, as for Vikunja. Depth and
  node count are bounded.
- **D4 Report bodies are Markdown converted to ADF.** Report a problem
  already writes Markdown; a small converter covers what it writes
  (headings, paragraphs, pipe tables, code, lists, links, emphasis).
- **D5 Two credential forms, told apart by a colon.** `email:token` is Basic
  against the site root; anything else is Bearer, which a service account's
  scoped token needs through `api.atlassian.com/ex/jira/{cloudId}`. Through the
  gateway, the site address for links comes from `GET /serverInfo`, limited to
  `atlassian.net`.
- **D6 No hand-off where Ploeg cannot route.** An adapter declares hand-off
  only when Ploeg takes that tracker's work by an assignee that its team read
  reports. GitHub fails the second half, GitLab and Jira the first.
