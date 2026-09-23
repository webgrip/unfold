# Turn the design into work

> Planning record, frozen on 2026-09-23. The external tracker owns status and priority, so check it before acting on anything here. See [records and history](../../../../docs/documentation.md#records-and-history).

The repository contains 78 ticket-ready records with acceptance criteria, verification, risk, repository ownership and an acyclic dependency graph. Every one of the 30 audited gaps maps to remediation tickets. These files are a reviewed planning seed. They do not grant execution permission, create external tickets or prove that a gap has been fixed.

`backlog/backlog.json` is the source for the generated planning artifacts. After import, the chosen tracker owns current status, assignments and priority. Keep a mapping from stable `PV-NNN` plan IDs to native tracker IDs. Update the seed deliberately when the design changes; do not overwrite tracker progress by reimporting an old spreadsheet.

Five records now include implementation candidates and remaining qualification checks. See [implementation progress](implementation-progress.md). Their local `review` status is a planning signal, not human acceptance. Read the existing evidence before assigning the same implementation again.

## Start with a useful slice

Do not try to complete all 78 tickets before using the system. The first milestone is supervised dogfooding; subsequent milestones add stronger delivery guarantees and team operation.

| Start | Concrete work | What it proves |
| --- | --- | --- |
| Developer experience | PV-001, PV-002, PV-003, PV-045 | A small Vloer improvement can be developed remotely and reviewed; the actual VS Code host and development image are qualified |
| Safe Ploeg intake | PV-013 through PV-016, PV-071 through PV-074, respecting dependencies | Correct target routing, authenticated durable events, no worker management keys, authenticated claims, conservative crash accounting and explicit review outcomes |
| Trustworthy changes | PV-005 through PV-011 and PV-078, respecting dependencies | Complete immutable candidate, actual independent checks, and publication controlled outside the agent |
| First connected loop | PV-019, PV-022 through PV-025, PV-027 and prerequisites | A Forgejo issue becomes one governed attempt visible in Vloer; the tracker receives an attributable proposal link |
| Shared operation | PV-034 through PV-043, then PV-046 through PV-050 and prerequisites | Client/team authorization, identity, quotas, recovery and editor intervention share the same authority |

The rows are workstreams, not permission to skip the dependency graph. Several defects deserve maintainer fixes before letting Ploeg perform unattended work. The current Vloer manual lane can still help with narrow candidate changes while people independently verify and publish them. A first task must also fit its approved risk tier; a low ticket number is not a risk assessment.

## Inspect and regenerate locally

Requirements are the repository's Node 24 baseline. The generator uses native modules and makes no network requests.

```sh
npm run backlog -- validate
npm run backlog:build
node scripts/backlog.mjs check
node scripts/backlog.mjs brief PV-001
```

Generated outputs:

| File | Purpose |
| --- | --- |
| [Readable backlog](../../backlog/README.md) | All records, dependencies, milestone totals and audit coverage |
| [Source records](../../backlog/backlog.json) | Machine-readable planning seed with stable IDs |
| [ClickUp CSV](../../backlog/clickup-import.csv) | Reviewable spreadsheet import with full descriptions |
| [Vloer Forgejo payloads](../../backlog/forgejo-de-vloer.json) | Create-issue bodies grouped for the Vloer repository |
| [Ploeg Forgejo payloads](../../backlog/forgejo-ploeg.json) | Create-issue bodies grouped for the Ploeg repository |

Starting-point paths are repository-qualified; cross-repository references and proposed paths are labeled explicitly. These references do not grant access to a second repository.

Estimates are relative engineering points. They are not hours, delivery promises or predictions of agent speed. Untouched records remain planned; records with a prepared candidate can be in local review. A human must resolve owners, native labels, target branch, dependencies and the actual task revision before marking work eligible for an agent.

## Import into ClickUp

Use ClickUp's spreadsheet importer against a deliberately selected project List. Preview the mapping and a small subset before importing the whole plan. The CSV includes `Task Name`, `Description content`, `Status`, `Priority`, `Labels`, `Plan ID`, `Target repository`, `Milestone`, `Depends on` and `Estimate points`. Map columns explicitly; labels use `|` as a delimiter. Map `Planned` and `Review` deliberately to your actual workflow's non-eligible planning/review statuses. Priorities use ClickUp's documented numeric convention: 1 urgent, 2 high, 3 normal, 4 low. [ClickUp preparation](https://help.clickup.com/hc/en-us/articles/6310821748759-Prepare-a-spreadsheet-for-import), [supported fields](https://help.clickup.com/hc/en-us/articles/6310876671255-Fields-supported-by-the-Spreadsheets-importer).

Map the plan ID, target repository, milestone and estimate columns to appropriate custom fields if desired. The `Depends on` column is an explicit text list of plan IDs. **It does not create native task dependency relationships.** Resolve imported native task IDs and establish those relationships separately. The importer supports field mapping and preview, but unsupported relationship fields must not be presented as a working automated import. [Spreadsheet importer](https://help.clickup.com/hc/en-us/articles/6310834724247-Use-the-Spreadsheets-Importer), [field limitations](https://help.clickup.com/hc/en-us/articles/6310876671255-Fields-supported-by-the-Spreadsheets-importer).

Keep an import manifest with connection identity, selected List, plan revision, native IDs and result for each row. Do not rerun the whole CSV after a partial import: reconcile existing `Plan ID` values first. Moving a task between Lists changes routing context, not its identity. A production connector uses authoritative task reads and an explicit target mapping, as specified in [ticket integration](../design/ticket-integration.md).

The CSV quotes multiline descriptions and neutralizes spreadsheet formula prefixes. That protects the export format; it does not make task descriptions trusted instructions for an agent.

## Create Forgejo issues from the payload files

Each file is an envelope containing `targetRepository` and `issues`. Every issue contains `planId`, `dependsOn` and `request`. The `request` object is the candidate create-issue body with a title and complete Markdown description. The surrounding envelope is **not** a Forgejo endpoint request. Resolve the actual owner/repository, API version, authentication method and permissions on your installed Forgejo before sending anything. The [Forgejo API guide](https://forgejo.org/docs/latest/user/api/usage/) describes instance API discovery.

An importer should first list/reconcile issues by the stable marker `<!-- ploeg-vloer-plan:PV-NNN -->`, then create only missing records and durably save the returned issue ID and URL. If a request times out after submission, read and reconcile before repeating it. Do not infer that a failed HTTP client response means no issue was created. Resolve native label and assignee IDs independently; the payload does not invent those IDs or select recipients.

Use the Ploeg envelope only for the Ploeg repository and the Vloer envelope only for its registered repository. Cross-repository dependencies remain plan-ID references until the import manifest maps them to real links. Changing the target is an explicit planning decision. Do not automatically follow a repository URL supplied inside a ticket body.

These payloads are intentionally reviewable artifacts. No issue-creation requests have been sent in preparing this repository.

## Give a ticket to today's Vloer

First follow [self-improvement](../design/self-improvement.md) and [live setup](live.md). Register the actual Vloer Git URL and its `development` branch; select a prepared remote development image and the configured LiteLLM model alias. Do not copy a placeholder URL into production. Keep the stable control plane independent of the candidate checkout.

For a bounded first session, display a brief and copy it into the browser or extension's objective field:

```sh
node scripts/backlog.mjs brief PV-001
```

For API tooling, the generator can create a current v0.1 session body after explicit selection of registered profile IDs, runtime and authorized USD budget:

```sh
node scripts/backlog.mjs session-payload PV-001 vloer delivery opencode 2 > /tmp/vloer-PV-001-session.json
```

Here `vloer` and `delivery` must be real configured profile IDs; `2` is an example authorization amount, not a cost prediction. The command writes JSON only. It does not create or start a session, validate live credentials or approve a budget. The current authenticated `POST /api/sessions` contract is documented in [the API reference](../contracts/api.md). Use the normal authenticated operator client; do not put cookies or passwords into a committed script.

Before starting, add the actual issue URL and current accepted revision to the objective, resolve dependencies against the real tracker, and check the server's allowed target and budget. The generator deliberately does not invent a structured issue reference that today's API cannot store. In demo mode, the runtime always runs its fixed order-service demonstration; it cannot implement this backlog.

A human must independently run the approved checks, preserve the complete result, publish the proposal and review it. The [shared manual execution baseline](../../../../docs/workflows/managed-execution.md) now links operator sessions to Ploeg. The [tracker binding](../contracts/ploeg-tracker-binding.md) and [independent verifier](../contracts/candidate-delivery.md) extend that baseline; a live publisher remains separate backlog work. Setting a task to `Ready` does not make this Vloer release automatically ingest it.

## When the governed loop is implemented

The proposed contract admits a current source revision into a Ploeg WorkOrder, claims one fenced DeliveryAttempt, and links the operator's Vloer Session. The worker receives a bounded task and scoped inference capability. The publisher, not the worker, holds Git write credentials and checks the current attempt generation. A trusted verifier executes policy-owned gates against an immutable candidate. A draft proposal and one updated tracker summary give the reviewer a complete handoff.

The runtime can suggest that a ticket's acceptance criteria are unclear, but it cannot rewrite the authoritative brief and proceed under its own approval. Work that changes access control, budget enforcement, verification policy, release infrastructure or deployment permissions needs an explicitly reviewed risk lane. Mark completion according to the tracker's actual workflow after the corresponding forge event; a model message saying “done” is not a merge event.

## Unification baseline and adoption triggers

Recommendation recorded 2026-09-10, with [source evidence and the proposed baseline](../research/2026-09-10-unified-workbench-baseline.md) and an [alternatives ledger entry](../research/conventions-and-alternatives.md#alternatives-worth-comparing-against-a-real-workflow). This section does not change tracker priority or planning-record status.

Begin with PV-079/PV-080 and then PV-081 for an authenticated view of Ploeg work in De Vloer. The integration milestone is one Ploeg-owned execution that a person starts, leaves, rejoins and steers. PV-022 through PV-026 and their dependencies cover the common authority and takeover path; PV-071 through PV-073 cover worker authority and crash-accounting prerequisites. Resolve their existing acceptance criteria in the [planning seed](../../backlog/README.md), rather than creating a competing unification backlog.

Conditional adoption decisions reopen on these concrete triggers:

- **Kandev, OpenHands or Paperclip:** use PV-057's workflow comparison, respecting PV-004/PV-033 prerequisites for a qualified comparison. Reconsider the custom workbench when a pinned alternative passes the actual OpenCode/LiteLLM, external-tracker, disconnect/intervention, cancellation and evidence workflow with less setup and human review effort. Adopt only with one explicitly chosen execution authority. A local feature trial can precede that qualification, but cannot claim the gate passed.
- **A2A:** reconsider when an identified independently deployed agent service requires its discovery/task/artifact contract. First establish authenticated work identity and attempts through PV-022 through PV-025. Reject a second internal task authority; the adapter must preserve existing identities, budget admission and cancellation semantics.
- **Temporal or DBOS:** reconsider behind Ploeg when a concrete long-lived timer, human wait or branching workflow cannot meet the crash/recovery acceptance cases using the current implementation at reasonable maintenance cost. First preserve the WorkOrder and attempt contracts from PV-022/PV-023 and operation accounting from PV-073. A spike must survive a crash after external acceptance without automatically repeating paid work; workflow recovery alone does not satisfy that test.
- **Agent Sandbox:** the existing provider decision remains in force. Revisit adapter compatibility when the pinned controller/API differs from the tested contract; qualify actual claim, retention, stop and cleanup behavior on the target cluster before expanding concurrency. The [upstream v1.0.1 release](https://github.com/kubernetes-sigs/agent-sandbox/releases/tag/v1.0.1) is new evidence, not permission to hand-bump a Renovate-owned dependency.

## Maintain the design without drifting

Edit the modular documents under `docs/design/`, `docs/research/` and `docs/product/`, then rebuild the consolidated design:

```sh
npm run backlog:build
npm run design:build
npm run design:check
npm test
npm run check
```

The generated [design chapter guide](../PRODUCT-DESIGN.md) links the source documents without copying their prose. Its build check detects stale generated content and local documentation links. Tests validate dependency order, gap coverage, export quoting and explicit session-payload inputs. They do not validate the implemented status of the proposed features. Close a gap only with merged code and the acceptance evidence specified in its ticket.

## Implemented unification increment

The [shared manual baseline](../../../../docs/workflows/managed-execution.md) implements scoped Ploeg snapshots, browser/editor navigation, delegated operator execution, command replay, human/background supervision and conservative inference accounting. It reuses existing Work Item/Shift/Run records. The next increment adds pristine tracker revision binding, a bounded independent verifier, canonical approval and a publication barrier. It does not close the broader WorkOrder/active takeover lifecycle, live publisher, durable inter-agent messaging or multi-replica acceptance criteria. Current executable evidence is in [validation](../validation.md); the earlier audit and ticket seeds remain a historical planning baseline.
