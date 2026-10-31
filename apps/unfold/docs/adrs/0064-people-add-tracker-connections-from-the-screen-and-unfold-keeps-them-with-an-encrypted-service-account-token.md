---
status: proposed
date: 2026-10-31
decision-makers: Ryan Grippeling
review-by: 2027-01-31
---

# People add tracker connections from the screen, and Unfold keeps them with an encrypted service account token

## Context and Problem Statement

A task source tells Unfold which tracker project to read, which repository its work goes to, and who executes it. Until now every source lived in the server configuration. **Settings › Connect a tracker** (`#settings/task-setup`) let a person pick a ClickUp List by name, check it and preview its tasks, and then ended by showing a `taskSources` entry for an administrator to paste into the configuration and restart. On the homelab that means a GitOps change in another repository for every List.

A source also needs a token of its own before its tasks can be handed to an agent. Handing off assigns the Team's tracker user and leaves a note ([0025](0025-hand-tracker-tasks-to-ploeg-by-assignment.md)), and the server does that with the source's token, never with a person's link. A source drafted on the setup page had no token, so it could be read but not handed off.

The owner decided two things on 2026-10-31:

1. **People add a tracker connection from the screen.** The setup page ends with Save, and Unfold stores the connection in its own database instead of asking an administrator to edit the server configuration.
2. **Connections use a service account.** An agency creates one tracker user for Unfold, such as a ClickUp user, and enters its token once. The field is write-only, the token is never shown again, it is stored encrypted, and it can be rotated and removed. People still link their own account to browse. The page explains in plain words why the account is needed and how to create it, and Test connection checks its token too.

How does Unfold store such connections, who may change them, and how do they live next to the sources in the configuration?

## Decision Drivers

* A token is never shown, logged, exported or sent anywhere but its tracker ([system ADR-0050](../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md) rule 1 on adapters; [secrets handling](../operations/live.md)).
* A source saved on the screen passes the same checks as one in the configuration: provider, API root, project, repository, Tenant and Client ([system ADR-0017](../../../../docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md), [ADR-0051](../../../../docs/adr/adr-0051-an-unowned-work-item-belongs-to-the-default-tenant-and-delegated-credentials-keep-shared-memberships.md)).
* An installation run from GitOps keeps working unchanged, and no repository refactor changes production desired state.
* It is the first slice of one Connection per origin ([0063](0063-unfold-reaches-ploeg-and-trackers-through-ports-with-interchangeable-adapters.md) decision 5, [system ADR-0048](../../../../docs/adr/adr-0048-projects-share-accounts-and-repositories-within-a-tenant-and-a-work-item-has-one-origin.md)'s Integration Account), so its shape must grow into the account-link and publisher roles without a second migration.
* Code outside an adapter never names a tracker.

## Considered Options

* **Connections in Unfold's database next to the configured sources; the configuration wins**
* Unfold opens a pull request on the GitOps repository for each new source
* Move every source into the database and stop reading `taskSources`

## Decision Outcome

Chosen option: **connections in Unfold's database next to the configured sources, and the configuration wins**. It removes the restart and the GitOps round trip for the common case, keeps every configured installation as it is, and puts the token where Unfold already keeps people's linked-account tokens.

### What is stored

A **tracker connection** is the account Unfold acts as on one tracker API root for one Tenant: tracker, API root, Tenant, the name of the account its token belongs to, who added it and when the token was set. There is at most one per Tenant, tracker and API root (409 `connection_exists`; replace its token instead). A **saved source** names its connection, the project, a name, the repository, the execution owner (`ploeg` by default) and an optional Client inside the connection's Tenant. They live in `tracker_connections` and `tracker_connection_sources`.

This is ADR-0048's Integration Account for the tracker role only. The connection is keyed by origin, the source by connection plus project, and the token is an attribute of the connection, so rotating it changes no identity. Step T5 of 0063 adds the account-link and publisher roles to the same record.

### The token

The token is stored in the store's `internal_state`, sealed with AES-256-GCM under the store key (`UNFOLD_STORE_KEY`, or the `unfold.sqlite.key` file next to the database) with the record id as associated data, the same way Unfold keeps people's linked-account tokens and sign-in grants ([Store](../../src/store.ts)). It is:

* **write-only**: it is sent with `POST /api/tracker-connections` or `PUT …/token` and never answered; the page shows the account name and when the token was set;
* **checked first**: a value without the shape the adapter declares is refused before it leaves Unfold (400 `connection_token_invalid`), and the tracker must accept it (400 `connection_token_rejected`) before it is stored;
* **kept out of records**: action records drop every `token` field, audit facts carry no inputs, and the token joins the redaction list of the HTTP layer and the engine as soon as it is stored;
* **rotated and removed**: a new token replaces the old one at once; removing a connection deletes its token. A connection still used by a saved source cannot be removed (409 `connection_in_use`).

### Who may change it

Anyone who reaches the Tenant sees its connections and saved sources, never a token. Adding, changing and removing a connection or a saved source needs an administrator, and while `tenancy.enforce` is on an Admin membership of the connection's Tenant: the same rule as intake sources. A saved source belongs to its connection's Tenant and may name a Client inside it; it maps only to a repository its owner may use, exactly as at start-up. A person who does not reach the Tenant gets 404, so they cannot learn the connection exists.

### Audit

Each change is an OCSF Entity Management record in the owning Tenant's audit chain: `Tracker connection` create, update with `token_replaced`, delete; `Task source` create with `added_from_screen`, update, delete. Refused attempts are recorded as failures. The Tenant is read before the request runs, so a removal still lands in the right chain. The usual action record of each request is kept too.

### Configuration and database together

* Saved sources join the configured ones in the running workbench, after them. Tasks, Now, hand-off, the audit and the tenancy checks see one list.
* **The configuration wins.** A configured source with the same id, or reading the same project on the same API root, hides the saved one, which the page marks `shadowed` and the log names. A saved source whose repository left the configuration is marked `repository_missing` and is not used.
* Configured sources stay read-only on the screen (409 `source_read_only`). Saving a project some source already reads is refused (409 `source_exists`).
* The setup page still offers the configuration entry, folded under "Keep it in the server configuration instead", for installations that keep everything in GitOps.
* Saving a source in Unfold does not configure Ploeg. Ploeg starts work only when its own tracker configuration routes the project to a Team ([managed execution](../../../../docs/workflows/managed-execution.md)); Settings › Connections shows whether it does.

### Reading, browsing and testing

A saved source reads and hands off with its connection's token, like a configured source with `tokenEnv`. People browse the tracker during setup with their own link, so they see only what they may see there. The project check on the setup page adds a `service` finding: whether the connection's account can open that project too, or that the Tenant has no connection yet. `GET /api/tracker-connections/{id}/check` tests the token alone, and Test connection on a saved source reads with it.

### Tenant export and import

The [Tenant export](../../../../openspec/changes/tenant-export/design.md) classifies both new tables: `tracker-connections` and `tracker-connection-sources` are exported per Tenant, and the token is not, because `internal_state` is excluded as a secret. A saved source is not exported a second time under `task-sources`, which keeps the configured ones. An import, not built yet, would bring a connection without its token: the page then says the token is missing, the connection check reports `connection_token_missing`, and an administrator pastes it again.

### Behind the adapter

A tracker offers this through its setup capability: `TaskSetup.serviceAccount` carries what the tracker calls the account, the steps to create it and its token, a link to the tracker's token documentation, and the token's shape. ClickUp declares it; a tracker that does not cannot be added from the screen (404 `setup_unsupported`).

### Consequences

* Good, because an agency adds a List in a minute with no restart and no GitOps change, and it can be handed off straight away.
* Good, because one token serves every List of the agency, and rotating it is one paste.
* Good, because a GitOps installation is untouched: its sources keep winning, and the entry is still offered.
* Bad, because a source can now live in two places. The `managedBy` field on `GET /api/task-sources` and the page say which.
* Bad, because the store key now also protects tracker tokens. Losing it loses them; an administrator pastes them again.
* Neutral, because Ploeg's routing is still configured on Ploeg's side.

### Confirmation

* `test/tracker-connections.test.ts` against a fake ClickUp: adding with a malformed, a refused and a good token; one connection per Tenant; the project check's `service` finding; saving a List and reading it with the token; rotation used at once; the token absent from the database file, the audit trail and the action records; survival across a restart; removal; administrator and Tenant Admin authorization with 403 and 404; the configuration winning on the same project.
* `test/tenant-export.test.ts`: the new tables exported per Tenant without the token, and saved sources not duplicated.
* `test/task-setup-view.test.mjs`: the write-only field, the guide's escaping, and who sees replace and remove.

## Pros and Cons of the Options

### Unfold opens a pull request on the GitOps repository

* Good, because the configuration stays the single source of truth.
* Bad, because every List waits for a review, a merge and a rollout, which is the delay the owner asked to remove, and Unfold would need write access to the infrastructure repository.

### Move every source into the database

* Good, because there is one place.
* Bad, because every configured installation would have to migrate, and a GitOps installation could no longer declare its sources.

## More Information

Open questions for the owner, each with a recommendation. The implementation follows the recommendation until the owner decides otherwise.

1. **Configuration or database wins on a clash.** Recommended and built: the configuration wins and the saved source is marked `shadowed`.
2. **May a Developer save a source under an existing connection?** Recommended: not yet. Only an administrator, so an agency decides which boards reach agents. Reconsider with ADR-0048's Client Projects.
3. **Should a saved source read with each person's link when they have one, and use the service account only to hand off?** Recommended: not yet. One account keeps the task revision a hand-off checks the same for everyone; revisit when Client users start using Unfold.
4. **A switch that turns adding from the screen off for GitOps-only installations.** Recommended: add a configuration flag when an installation asks for it; until then the configuration wins on every clash.
5. **Telling Ploeg about a saved source.** Recommended: a general Ploeg contract for registering a tracker project with a Team, which Unfold then adopts; Ploeg names no consumer.

Related: [Connect a task system](../operations/task-connections.md#clickup), [Working with Unfold from ClickUp](../operations/working-from-clickup.md), [0008](0008-task-connections-and-candidate-handoff.md) task connections, [0016](0016-sign-in-and-link-your-own-accounts.md) linked accounts.
