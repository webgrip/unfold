# Integration registries: trackers, links and forges behind adapters

## Why

System [ADR-0050](../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md)
rule 1 says every integration sits behind an interface whose implementations
are adapters registered by name, and that no code outside an adapter knows a
reference prefix such as Vikunja's. Its consequences list the violations on
`development`: `TaskProvider` and `LinkProvider` are closed unions with
provider switches, `ForgejoPublisher` has no interface, Report a problem files
only into Forgejo or Vikunja, Vikunja references are built in the card and
Linked Session code, and the AHP automation catalogue is Vikunja-only. An
agency on GitHub or GitLab cannot have its pull requests opened by Unfold.

Application: `apps/unfold`. Ticket: none yet.

## What Changes

- A task provider registry. `TaskProvider` becomes the name an adapter
  registered under. Each provider (Forgejo, GitHub, GitLab, ClickUp, Vikunja,
  the demo fixture) is one adapter file that supplies browse, read, import,
  hand-off, assignee lookup, comments, project lookup and its home list.
  Hand-off support, the tracker's name, issue filing for Report a problem, the
  description format, the reference format, the personal account link and
  tracker assignment routes are capabilities an adapter declares.
- A link provider registry for personal account links (GitLab, ClickUp).
- A `DeliveryPublisher` interface with a forge publisher registry. Forgejo is
  the first adapter, with its AI marking and label; GitHub and GitLab adapters
  push the branch and open the pull request or merge request through their
  REST APIs when `delivery.publisher.kind` names them.
- Report a problem files into any registered provider that declares issue
  filing.
- A guard test fails on a new closed union of provider names, a comparison
  with a provider name or a hardcoded Vikunja reference outside an adapter.

## Non-goals

- New tracker behaviour. Every existing test passes unchanged; GitHub, GitLab
  and ClickUp do not gain hand-off or issue filing in this change.
- Jira, Linear or any adapter ADR-0050's tracker order names next.
- The other ADR-0050 violations (LiteLLM, Authentik defaults, LogsQL).
- The VS Code extension's own tracker prefix table for `unfold_find_work`.

## Capabilities

### New Capabilities

- `integration-registries`: how trackers, account links and forge publishers
  are registered and what code outside an adapter may know about them.

### Modified Capabilities

None.
