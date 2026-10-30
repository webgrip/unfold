# Jira tracker

## ADDED Requirements

### Requirement: Jira issues are read through JQL

A `jira` task source SHALL list the open issues of its configured project with
JQL through `GET /search/jql`, built from the configured project key only, and
SHALL page with the `nextPageToken` Jira returns. An issue from another
project MUST be refused.

#### Scenario: The second page

- **WHEN** a person opens page 2 of a Jira source after page 1
- **THEN** Unfold sends page 1's `nextPageToken` and shows no next page when Jira answers `isLast`

#### Scenario: An issue of another project

- **WHEN** a Jira source for project `OPS` is asked for an issue whose project is `WEB`
- **THEN** Unfold answers `task_outside_source`

### Requirement: ADF descriptions are shown safely

Unfold SHALL render an Atlassian Document Format description as HTML in which
every text is escaped and only `http`, `https` and `mailto` links remain.

#### Scenario: A script in a description

- **WHEN** a Jira description contains the text `<script>` and a `javascript:` link
- **THEN** the task shows the text escaped and the link's label without the link

### Requirement: Report a problem files Jira issues

A Jira source with a token SHALL file Report a problem as an issue whose body
is ADF, attach its files, add replies as comments and follow its status
category and comments.

#### Scenario: Filing a report

- **WHEN** a report is filed into Jira project `OPS`
- **THEN** Unfold creates one issue of type Bug when the project offers it, and attaches the screenshot to it

### Requirement: Hand-off follows what Ploeg routes

A tracker adapter SHALL declare hand-off only when the pinned Ploeg takes that
tracker's work by an assignee its team read reports.

#### Scenario: A Jira source assigned to Ploeg

- **WHEN** a Jira source has `executionOwner: ploeg`
- **THEN** hand-off is refused with the names of the trackers that support it
