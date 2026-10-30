# Jira Cloud as a tracker, and the hand-off matrix per tracker

## Why

System [ADR-0050](../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md)
orders the trackers: ClickUp, then Jira, then GitHub Issues and GitLab issues.
An agency on Jira cannot browse, import or report into its own tracker today.
The owner chose Jira "as an Atlassian Forge app"; a Forge panel inside Jira
still needs Unfold to read and file Jira issues server-side, so the REST
adapter comes first and the Forge app is a later, separate piece.

Hand-off to Ploeg works for Vikunja and ClickUp. Whether GitHub and GitLab
issues can follow depends on what the pinned Ploeg release takes from them.

Application: `apps/unfold`. Builds on the `integration-registries` change
(pull request #720). Ticket: none yet.

## What Changes

- A `jira` task provider adapter for Jira Cloud REST API v3: lists open issues
  of one project with JQL through `GET /search/jql` (token paging), reads one
  issue, renders its Atlassian Document Format description as escaped HTML,
  and files Report a problem issues with an ADF body, attachments, comments
  and a followed state.
- Credentials: a service account's scoped token through Atlassian's gateway
  (Bearer), or a classic `email:token` against the site (Basic).
- The registry's reference format gains a `native` form: the native id is the
  reference people write, as a Jira issue key `APP-12` is.
- Issue filing names where the token's own account is read (`GET /myself` on
  Jira), instead of assuming `GET /user`.
- Hand-off stays with Vikunja and ClickUp. The pinned Ploeg (0.2.0-rc.97) has
  no Jira or GitLab tracker, and its team read does not report the GitHub
  logins that route to a team, so GitHub hand-off would assign a user Ploeg
  may not route. The task connections guide records the matrix.

## Non-goals

- Hand-off for Jira, GitHub or GitLab; each needs a Ploeg contract first.
- OAuth 2.0 (3LO) personal Atlassian account links.
- Changing a Jira issue's status (transitions) from Unfold.
- The Forge app, and Jira Data Center.

## Capabilities

### New Capabilities

- `jira-tracker`: reading and filing Jira Cloud issues.

### Modified Capabilities

None.
